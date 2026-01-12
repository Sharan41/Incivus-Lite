import React, { useState, useEffect } from 'react';
import { Upload, Play, BarChart3, Download, Lock, Info, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Check, Brain, FileText, Eye, Globe, Building, Palette, MessageSquare } from 'lucide-react';
import LoadingStates from './LoadingStates';

/**
 * Analysis Component - Enhanced PDF Generation with Dropdown Expansion & Database Priority
 * 
 * FIXES APPLIED:
 * 1. Form fields now show when either uploadedFile OR filePreview exists
 * 2. All dropdowns and cards are automatically expanded before PDF capture
 * 3. Channel Compliance specifically forced to expand (was showing as closed)
 * 4. Card states are restored after PDF generation
 * 5. Multiple expansion attempts with delays to ensure reliability
 * 6. Plan data now prioritizes database over localStorage (refresh fix)
 * 7. Auto-refresh every 5 minutes + manual refresh button
 * 8. Subscription status display with data source indicator
 */
import { useAuth } from '../contexts/AuthContext';
import { canUploadAd, getUserSubscription } from '../utils/subscriptionHelpers';
import { saveAnalysisRecord } from '../utils/jsonApiHelpers';
import unifiedApi from '../utils/unifiedApiHelper';
import SubscriptionStatus from './SubscriptionStatus'; // Use same component as Profile page
import ENV_CONFIG from '../utils/environmentConfig';
// DEPRECATED: sendAdToGeminiAPI - Use submitAnalysisRequest instead to go through middleware
// import { sendAdToGeminiAPI } from '../utils/jsonApiHelpers';
import { safeSetItem, cleanupStorage, isStorageNearLimit } from '../utils/storageHelpers';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
// Conditionally import Logger
let Logger;
if (process.env.NODE_ENV === 'production') {
  Logger = require('../utils/sentryConfig').Logger;
} else {
  // Development Logger that only logs to console
  Logger = {
    info: (message, extra = {}) => console.log('📝 INFO:', message, extra),
    warn: (message, extra = {}) => console.warn('⚠️ WARN:', message, extra),
    error: (error, context = {}) => console.error('❌ ERROR:', error, context),
    trackUserAction: (action, details = {}) => console.log(`👤 USER ACTION: ${action}`, details),
    trackApiCall: (endpoint, method, status, duration) => console.log(`🌐 API: ${method} ${endpoint} - ${status} (${duration}ms)`),
    setUser: (userInfo) => console.log('👤 SET USER:', userInfo),
    clearUser: () => console.log('👤 CLEAR USER')
  };
}
const Analysis = ({ userPlan, setUserFlow, hasActiveSubscription = false, showLockedResults = false }) => {
  const { currentUser, getUserPlanData } = useAuth();
  // State management
  const [uploadedFile, setUploadedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [mediaType, setMediaType] = useState('image');
  const [objectUrl, setObjectUrl] = useState(null); // Track object URL for cleanup
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [funnelStage, setFunnelStage] = useState('');
  const [messageIntent, setMessageIntent] = useState('');
  const [adTitle, setAdTitle] = useState('');
  const [adDescription, setAdDescription] = useState('');
  const [titleValidation, setTitleValidation] = useState({ isChecking: false, isValid: true, message: '' });
  const [showChannelInfo, setShowChannelInfo] = useState(false);
  const [showFunnelInfo, setShowFunnelInfo] = useState(false);
  const [showMessageInfo, setShowMessageInfo] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingGemini, setLoadingGemini] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStage, setAnalysisStage] = useState('');
  const [estimatedTime, setEstimatedTime] = useState('2-3 minutes');
  const [analysisResults, setAnalysisResults] = useState(null);
  const [geminiResults, setGeminiResults] = useState(null);
  const [saveStatus, setSaveStatus] = useState('');
  const [selectedFeatures, setSelectedFeatures] = useState([]);
  const [quotaStatus, setQuotaStatus] = useState({ used: 0, max: 10, canAnalyze: true });
  // **CONSOLIDATED**: Keep local state for validation logic, but SubscriptionStatus component displays UI
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [subscriptionRefreshTrigger, setSubscriptionRefreshTrigger] = useState(0);
  const [brandData, setBrandData] = useState(null);
  const [fileUploadError, setFileUploadError] = useState(null);
  const [currentAnalysisId, setCurrentAnalysisId] = useState(null); // Store artifactId from middleware response


  const [collapsedCards, setCollapsedCards] = useState({
    brandCompliance: true,
    messagingIntent: true,
    funnelCompatibility: true,
    channelCompliance: true,
    purchaseIntent: true,
    overallScore: true,
    mainAnalysis: true,
    geminiAnalysis: true
  });
  const [detailedBreakdowns, setDetailedBreakdowns] = useState({
    brandCompliance: false,
    messagingIntent: false,
    funnelCompatibility: false,
    channelCompliance: false,
    purchaseIntent: false,
    overallScore: false
  });
  const [hoveredCard, setHoveredCard] = useState(null);
  // Constants
  const channels = ['YouTube', 'TikTok', 'Facebook', 'Instagram', 'Google Ads'];
  const funnelStages = ['Awareness', 'Consideration', 'Conversion'];
  // Helper function to save analysis state to localStorage with quota management
  const saveAnalysisState = () => {
    try {
      // Check if storage is near limit before saving
      if (isStorageNearLimit()) {
        console.log('⚠️ Storage near limit, performing cleanup before saving analysis state');
        cleanupStorage();
      }

      const analysisState = {
        uploadedFile: uploadedFile ? {
          name: uploadedFile.name,
          size: uploadedFile.size,
          type: uploadedFile.type,
          lastModified: uploadedFile.lastModified
        } : null,
        filePreview,
        mediaType,
        selectedChannels,
        funnelStage,
        messageIntent,
        adTitle,
        adDescription,
        analysisResults,
        geminiResults,
        timestamp: Date.now()
      };

      // Use safe storage helper that handles quota exceeded errors
      safeSetItem('incivus_analysis_state', analysisState, {
        compress: true,
        essential: false
      });
      
      console.log('💾 Analysis state saved to localStorage');
    } catch (error) {
      console.error('❌ Failed to save analysis state:', error);
      
      // If saving fails, try to save just the essential form data
      try {
        const essentialState = {
          mediaType,
          selectedChannels,
          funnelStage,
          messageIntent,
          adTitle,
          adDescription,
          timestamp: Date.now(),
          _essential: true
        };
        
        safeSetItem('incivus_analysis_state', essentialState, {
          compress: false,
          essential: true
        });
        
        console.log('💾 Essential analysis state saved as fallback');
      } catch (fallbackError) {
        console.error('❌ Failed to save even essential analysis state:', fallbackError);
        // Clear any corrupted state
        localStorage.removeItem('incivus_analysis_state');
      }
    }
  };
  // Helper function to restore analysis state from localStorage
  const restoreAnalysisState = () => {
    try {
      const savedState = localStorage.getItem('incivus_analysis_state');
      if (savedState) {
        const analysisState = JSON.parse(savedState);
        // Check if the saved state is not too old (within 24 hours)
        const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
        if (analysisState.timestamp && analysisState.timestamp > twentyFourHoursAgo) {
          // Restore form data
          if (analysisState.filePreview) setFilePreview(analysisState.filePreview);
          if (analysisState.mediaType) setMediaType(analysisState.mediaType);
          if (analysisState.selectedChannels) setSelectedChannels(analysisState.selectedChannels);
          if (analysisState.funnelStage) setFunnelStage(analysisState.funnelStage);
          if (analysisState.messageIntent) setMessageIntent(analysisState.messageIntent);
          if (analysisState.adTitle) setAdTitle(analysisState.adTitle);
          if (analysisState.adDescription) setAdDescription(analysisState.adDescription);
          // Restore analysis results
          if (analysisState.analysisResults) setAnalysisResults(analysisState.analysisResults);
          if (analysisState.geminiResults) setGeminiResults(analysisState.geminiResults);
          console.log('✅ Analysis state restored from localStorage');
          return true;
        } else {
          // Remove old state
          localStorage.removeItem('incivus_analysis_state');
          console.log('🗑️ Removed old analysis state');
        }
      }
    } catch (error) {
      console.error('❌ Error restoring analysis state:', error);
      localStorage.removeItem('incivus_analysis_state');
    }
    return false;
  };
  // Helper function to clear saved analysis state
  const clearAnalysisState = () => {
    localStorage.removeItem('incivus_analysis_state');
    console.log('🧹 Cleared saved analysis state');
  };

  // Function to handle new analysis with warning
  const handleNewAnalysisClick = () => {
    // Directly start new analysis without warning
    startNewAnalysisDirectly();
  };

  // Function to start new analysis (clear all data)
  const startNewAnalysis = () => {
    // Call the main function to clear data
    startNewAnalysisDirectly();
    
    console.log('🆕 Started new analysis - all data cleared');
  };
  // Helper functions
  const hasValidSubscription = () => {
    console.log('🔍 hasValidSubscription called with subscriptionData:', subscriptionData);
    console.log('🔍 subscriptionLoaded:', subscriptionLoaded);
    
    // If subscription data is still loading, return false to show loading state
    if (!subscriptionLoaded) {
      console.log('⏳ Subscription data still loading, returning false');
      return false;
    }
    
    // Use database subscription data ONLY - no localStorage fallback
    if (subscriptionData) {
      const planHint = (subscriptionData.planType || userPlan || '').toString().toLowerCase();
      
      console.log('🔍 Plan validation - planHint:', planHint, 'userPlan:', userPlan);
      
      // Check if user has any valid plan (including lite)
      const hasValidPlan = ['lite', 'pro', 'plus', 'enterprise', 'incivus_lite', 'incivus_pro', 'incivus_plus'].includes(planHint);
      
      console.log('🔍 hasValidPlan:', hasValidPlan);
      
      // Fast-path: treat Pro/Plus/Enterprise as unlocked regardless of missing flags
      if (['pro', 'plus', 'enterprise', 'incivus_pro', 'incivus_plus'].includes(planHint)) {
        console.log('✅ Pro/Plus/Enterprise plan detected - returning true');
        return true;
      }
      
      // For lite plans, check if they have remaining ads and valid subscription
      if (['lite', 'incivus_lite'].includes(planHint)) {
        const hasRemainingAds = (subscriptionData.remainingAds || subscriptionData.adQuota || 0) > 0;
        const isValidSubscription = subscriptionData.subscribed === true || 
                                   subscriptionData.paymentStatus === 'completed' ||
                                   subscriptionData.paymentStatus === 'pending' ||  // Accept pending for lite plans
                                   subscriptionData.isActive === true ||
                                   subscriptionData.status === 'active';  // Also check status field
        
        console.log('🔍 Lite plan validation:', {
          planType: planHint,
          remainingAds: subscriptionData.remainingAds,
          adQuota: subscriptionData.adQuota,
          hasRemainingAds,
          subscribed: subscriptionData.subscribed,
          paymentStatus: subscriptionData.paymentStatus,
          isActive: subscriptionData.isActive,
          status: subscriptionData.status,
          isValidSubscription,
          finalResult: hasRemainingAds && isValidSubscription
        });
        
        return hasRemainingAds && isValidSubscription;
      }
      
      // For other plans, use standard validation
      const isValid = subscriptionData.subscribed === true &&
                      subscriptionData.paymentStatus === 'completed' &&
                      subscriptionData.isActive === true;
      if (subscriptionData.subscriptionEndDate) {
        const endDate = new Date(subscriptionData.subscriptionEndDate);
        const now = new Date();
        return isValid && endDate > now;
      }
      console.log('🔍 Other plan validation result:', isValid);
      return isValid;
    }
    
    // No valid subscription data from database
    console.log('❌ No valid subscription data from database - returning false');
    return false;
  };
  // Check if a feature card should be accessible based on subscription and selected features
  const isCardAccessible = (cardKey) => {
    // Use single source of truth - no localStorage fallback
    let planType = 'free';
    if (subscriptionData) {
      planType = subscriptionData.planType || subscriptionData.plan || 'free';
    }
    // No localStorage fallback - wait for single source data to load
    
    // If no valid subscription, no cards are accessible
    if (!hasValidSubscription()) {
      return false;
    }
    
    // Map card keys to feature IDs
    const cardToFeatureMap = {
      'brandCompliance': 'brand_compliance',
      'messagingIntent': 'messaging_intent', 
      'funnelCompatibility': 'funnel_compatibility',
      'channelCompliance': 'channel_compliance',
      'purchaseIntent': 'resonance_index' // Purchase intent includes ad resonance
    };
    
    // For Incivus Lite, only show cards for selected features
    if (planType === 'lite' || planType === 'Incivus_Lite') {
      const featureId = cardToFeatureMap[cardKey];
      return selectedFeatures.includes(featureId);
    }
    
    // For other plans (Pro, Enterprise), all cards are accessible
    return true;
  };
  // Check if a card should be visible (shown) based on plan type
  const shouldShowCard = (cardKey) => {
    // Use single source of truth - no localStorage fallback
    let planType = 'free';
    if (subscriptionData) {
      planType = subscriptionData.planType || subscriptionData.plan || 'free';
    }
    // No localStorage fallback - wait for single source data to load
    
    console.log(`🔍 shouldShowCard(${cardKey}):`, {
      hasValidSubscription: hasValidSubscription(),
      planType: planType,
      selectedFeatures: selectedFeatures,
      subscriptionData: subscriptionData
    });
    
    // For free users or no subscription, show all cards (with overlays)
    if (!hasValidSubscription()) {
      console.log(`✅ shouldShowCard(${cardKey}): TRUE - No valid subscription, showing all cards`);
      return true;
    }
    
    // Map card keys to feature IDs
    const cardToFeatureMap = {
      'brandCompliance': 'brand_compliance',
      'messagingIntent': 'messaging_intent', 
      'funnelCompatibility': 'funnel_compatibility',
      'channelCompliance': 'channel_compliance',
      'purchaseIntent': 'resonance_index'
    };
    
    // For Incivus Lite, only show cards for selected features
    if (planType === 'lite' || planType === 'Incivus_Lite') {
      const featureId = cardToFeatureMap[cardKey];
      const shouldShow = selectedFeatures.includes(featureId);
      console.log(`🔍 shouldShowCard(${cardKey}): Lite plan - feature ${featureId} in selectedFeatures? ${shouldShow}`);
      return shouldShow;
    }
    
    // For other plans (Pro, Plus, Enterprise), show all cards
    console.log(`✅ shouldShowCard(${cardKey}): TRUE - Pro/Plus/Enterprise plan, showing all cards`);
    return true;
  };
  const toggleCard = (cardName) => {
    setCollapsedCards(prev => ({
      ...prev,
      [cardName]: !prev[cardName]
    }));
  };
  // Function to expand all cards and dropdowns for PDF generation
  const expandAllCards = () => {
    console.log('📂 Expanding all cards and dropdowns for PDF generation...');
    
    // Step 1: Set React state to expand all cards
    setCollapsedCards({
      brandCompliance: false,
      messagingIntent: false,
      funnelCompatibility: false,
      channelCompliance: false,
      purchaseIntent: false,
      overallScore: false,
      mainAnalysis: false,
      geminiAnalysis: false
    });
    setDetailedBreakdowns({
      brandCompliance: true,
      messagingIntent: true,
      funnelCompatibility: true,
      channelCompliance: true,
      purchaseIntent: true,
      overallScore: true
    });
    
    // Step 2: Force expand all dropdown sections in scorecards with multiple attempts
    const expandAllDropdowns = () => {
      console.log('🔍 Searching for expandable elements...');
      
      // Method 1: Look for buttons with specific text patterns
      const expandButtons = document.querySelectorAll('button');
      let expandedCount = 0;
      
      expandButtons.forEach((button, index) => {
        const buttonText = (button.textContent || '').toLowerCase();
        const ariaExpanded = button.getAttribute('aria-expanded');
        
        if (buttonText.includes('show details') || 
            buttonText.includes('show more') || 
            buttonText.includes('expand') ||
            ariaExpanded === 'false') {
          try {
            button.click();
            expandedCount++;
            console.log(`✅ Clicked button ${index}: "${button.textContent}"`);
          } catch (e) {
            console.log(`❌ Could not click button ${index}:`, e);
          }
        }
      });
      
      console.log(`📊 Expanded ${expandedCount} buttons in first pass`);
      
      // Method 2: Look for elements with data attributes
      const dataElements = document.querySelectorAll('[data-scorecard], [data-testid*="expand"], [aria-expanded="false"]');
      dataElements.forEach((el, index) => {
        if (el.getAttribute('aria-expanded') === 'false') {
          el.setAttribute('aria-expanded', 'true');
          console.log(`✅ Set aria-expanded=true for element ${index}`);
        }
      });
      
      // Method 3: Force visibility of hidden content
      const hiddenElements = document.querySelectorAll('[style*="display: none"], .hidden, .collapsed, [aria-hidden="true"]');
      hiddenElements.forEach((el, index) => {
        el.style.display = 'block';
        el.style.visibility = 'visible';
        el.style.opacity = '1';
        el.setAttribute('aria-hidden', 'false');
        console.log(`✅ Made hidden element ${index} visible`);
      });
    };
    
    // Execute expansion with multiple attempts and delays
    setTimeout(expandAllDropdowns, 100);
    setTimeout(expandAllDropdowns, 500);
    setTimeout(expandAllDropdowns, 1000);
    setTimeout(expandAllDropdowns, 1500);
    
    console.log('📂 Card expansion initiated with multiple attempts');
  };
  // Function to restore original card states
  const restoreCardStates = (originalCards, originalBreakdowns) => {
    setCollapsedCards(originalCards);
    setDetailedBreakdowns(originalBreakdowns);
  };
  const toggleDetailedBreakdown = (section) => {
    console.log('🔧 Toggle detailed breakdown for:', section);
    console.log('🔧 Current state:', detailedBreakdowns[section]);
    setDetailedBreakdowns(prev => {
      const newState = {
        ...prev,
        [section]: !prev[section]
      };
      console.log('🔧 New state for', section, ':', newState[section]);
      return newState;
    });
  };
  const cleanMarkdownText = (text) => {
    if (!text) return 'No analysis available';
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/`{1,3}(.*?)`{1,3}/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();
  };
  const extractScoreFromGemini = (scoreKey) => {
    if (!geminiResults?.data) {
      return null;
    }
    let data = geminiResults.data;
    // Handle nested data structure - check if data.data exists
    if (data.data && typeof data.data === 'object') {
      data = data.data;
    }
    if (!data || typeof data !== 'object') {
      return null;
    }
    // Map score keys to the actual structure from Gemini
    const scoreMapping = {
      'brand_compliance_score': data.brandCompliance?.score,
      'messaging_intent_score': data.messagingIntent?.score,
      'funnel_compatibility_score': data.funnelCompatibility?.score,
      'channel_compliance_score': data.channelCompliance?.score,
      'purchase_intent_score': data.purchaseIntent?.score,
      'overall_score': data.overallScore
    };
    const score = scoreMapping[scoreKey];
    return typeof score === 'number' ? Math.round(score) : null;
  };
  const extractDetailFromGemini = (feature) => {
    if (!geminiResults?.data) {
      return 'Detailed analysis will be available after running analysis.';
    }
    // Use the same data access pattern as extractScoreFromGemini
    let analysisData = geminiResults.data;
    if (analysisData && typeof analysisData === 'object' && analysisData.data) {
      analysisData = analysisData.data;
    }
    if (!analysisData || typeof analysisData !== 'object') {
      return 'Detailed analysis will be available after running analysis.';
    }
    // First check if there's a comprehensive rawResponse
    if (analysisData.rawResponse && typeof analysisData.rawResponse === 'string' && analysisData.rawResponse.length > 50) {
      return cleanMarkdownText(analysisData.rawResponse);
    }
    // Also check for resonatingImpact which contains detailed analysis
    if (analysisData.resonatingImpact && typeof analysisData.resonatingImpact === 'string' && analysisData.resonatingImpact.length > 50) {
      return cleanMarkdownText(analysisData.resonatingImpact);
    }
    // Map features to their comprehensive detailed analysis from Gemini response
    const detailMapping = {
      'Brand Compliance': () => {
        const bc = analysisData.brandCompliance;
        const visual = analysisData.visualElements;
        let details = [];
        if (bc) {
          details.push(`BRAND ANALYSIS:`);
          details.push(`- Brand Presence: ${bc.brandPresence || 'Not specified'}`);
          if (bc.colorPsychology && bc.colorPsychology.trim()) details.push(`- Color Psychology: ${bc.colorPsychology}`);
          if (bc.typography && bc.typography.trim()) details.push(`- Typography: ${bc.typography}`);
          if (bc.logo?.present) details.push(`- Logo: Present and visible`);
        }
        if (visual) {
          details.push(`\nVISUAL ELEMENTS:`);
          if (visual.brand_presence) details.push(`- Brand Presence: ${visual.brand_presence}`);
          if (visual.color_psychology) details.push(`- Color Impact: ${visual.color_psychology}`);
          if (visual.visual_hierarchy) details.push(`- Visual Hierarchy: ${visual.visual_hierarchy}`);
          if (visual.typography) details.push(`- Typography Quality: ${visual.typography}`);
        }
        return details.length > 0 ? details.join('\n') : null;
      },
      'Messaging Intent': () => {
        const mi = analysisData.messagingIntent;
        const breakdown = analysisData.analysisBreakdown;
        let details = [];
        if (mi) {
          details.push(`MESSAGING ANALYSIS:`);
          details.push(`- Message Type: ${mi.type || 'Not specified'}`);
          details.push(`- Clarity Level: ${mi.clarity || 'Not assessed'}`);
          details.push(`- CTA Strength: ${mi.ctaStrength || 'Not evaluated'}`);
          details.push(`- Emotional Tone: ${mi.emotionalTone || 'Neutral'}`);
          if (mi.persuasiveTriggers) details.push(`- Persuasive Elements: ${mi.persuasiveTriggers}`);
        }
        if (breakdown) {
          details.push(`\nDETAILED BREAKDOWN:`);
          if (breakdown.message_clarity) details.push(`- Message Clarity: ${breakdown.message_clarity}`);
          if (breakdown.emotional_appeal) details.push(`- Emotional Appeal: ${breakdown.emotional_appeal}`);
          if (breakdown.cta_strength) details.push(`- Call-to-Action: ${breakdown.cta_strength}`);
          if (breakdown.persuasive_triggers) details.push(`- Persuasive Triggers: ${breakdown.persuasive_triggers}`);
        }
        return details.length > 0 ? details.join('\n') : null;
      },
      'Funnel Compatibility': () => {
        const fc = analysisData.funnelCompatibility;
        const breakdown = analysisData.analysisBreakdown;
        let details = [];
        if (fc) {
          details.push(`FUNNEL ANALYSIS:`);
          details.push(`- Funnel Stage: ${fc.stage || 'Not specified'}`);
          details.push(`- Conversion Potential: ${fc.conversionPotential || 'Not assessed'}`);
          if (fc.urgencyElements && fc.urgencyElements.trim()) details.push(`- Urgency Elements: ${fc.urgencyElements}`);
          if (fc.scarcityTriggers && fc.scarcityTriggers.trim()) details.push(`- Scarcity Triggers: ${fc.scarcityTriggers}`);
        }
        if (breakdown) {
          details.push(`\nCOMPATIBILITY INSIGHTS:`);
          if (breakdown.relevance) details.push(`- Audience Relevance: ${breakdown.relevance}`);
          if (breakdown.message_clarity) details.push(`- Message Alignment: ${breakdown.message_clarity}`);
        }
        return details.length > 0 ? details.join('\n') : null;
      },
      'Ad Resonance': () => {
        const ar = analysisData.adResonance;
        const audience = analysisData.audienceInsights;
        const impact = analysisData.resonatingImpact;
        let details = [];
        if (impact) {
          details.push(`RESONATING IMPACT:`);
          details.push(`${impact}`);
          details.push('');
        }
        if (ar) {
          details.push(`RESONANCE METRICS:`);
          details.push(`- Emotional Impact: ${ar.emotionalImpact || 'Not assessed'}`);
          details.push(`- Engagement Level: ${ar.engagementLevel || 'Not measured'}`);
          details.push(`- Memorability: ${ar.memorability || 'Not evaluated'}`);
          details.push(`- Shareability: ${ar.shareability || 'Not determined'}`);
        }
        if (audience) {
          details.push(`\nAUDIENCE INSIGHTS:`);
          if (audience.target_demographics) details.push(`- Target Demographics: ${audience.target_demographics}`);
          if (audience.engagement_potential) details.push(`- Engagement Potential: ${audience.engagement_potential}`);
          if (audience.shareability) details.push(`- Shareability Factor: ${audience.shareability}`);
          if (audience.memorability) details.push(`- Memorability Score: ${audience.memorability}`);
        }
        return details.length > 0 ? details.join('\n') : null;
      },
      'Channel Compliance': () => {
        const cc = analysisData.channelCompliance;
        const visual = analysisData.visualElements;
        let details = [];
        if (cc) {
          details.push(`CHANNEL COMPLIANCE:`);
          details.push(`- Platform Optimization: ${cc.platformOptimization || 'Not specified'}`);
          details.push(`- Format Compliance: ${cc.formatCompliance || 'Not assessed'}`);
          details.push(`- Content Guidelines: ${cc.contentGuidelines || 'Not evaluated'}`);
          if (cc.performanceScore) details.push(`- Performance Score: ${cc.performanceScore}`);
        }
        if (visual) {
          details.push(`\nFORMAT ANALYSIS:`);
          if (visual.visual_hierarchy) details.push(`- Visual Hierarchy: ${visual.visual_hierarchy}`);
          if (visual.format_compliance) details.push(`- Format Standards: ${visual.format_compliance}`);
          if (visual.content_guidelines) details.push(`- Content Guidelines: ${visual.content_guidelines}`);
        }
        return details.length > 0 ? details.join('\n') : null;
      },
      'Purchase Intent': () => {
        const pi = analysisData.purchaseIntent;
        const breakdown = analysisData.analysisBreakdown;
        let details = [];
        if (pi) {
          details.push(`PURCHASE INTENT ANALYSIS:`);
          details.push(`- Action Potential: ${pi.actionPotential || 'Not assessed'}`);
          details.push(`- Motivation Level: ${pi.motivationLevel || 'Not measured'}`);
          details.push(`- Decision Triggers: ${pi.decisionTriggers || 'Not identified'}`);
          details.push(`- Conversion Likelihood: ${pi.conversionLikelihood || 'Not calculated'}`);
        }
        if (breakdown) {
          details.push(`\nACTION DRIVERS:`);
          if (breakdown.cta_strength) details.push(`- Call-to-Action Strength: ${breakdown.cta_strength}`);
          if (breakdown.emotional_appeal) details.push(`- Emotional Appeal: ${breakdown.emotional_appeal}`);
          if (breakdown.persuasive_triggers) details.push(`- Persuasive Elements: ${breakdown.persuasive_triggers}`);
        }
        return details.length > 0 ? details.join('\n') : null;
      }
    };
    const extractor = detailMapping[feature];
    if (extractor) {
      const detail = extractor();
      if (detail) {
        // Add recommendations if they exist
        let fullDetail = detail;
        if (analysisData.recommendations && analysisData.recommendations.length > 0) {
          fullDetail += '\n\nRECOMMENDATIONS:';
          analysisData.recommendations.forEach((rec, index) => {
            fullDetail += `\n${index + 1}. ${rec}`;
          });
        }
        // Add raw analysis confidence if available
        if (analysisData.analysisConfidence) {
          fullDetail += `\n\nAnalysis Confidence: ${analysisData.analysisConfidence}`;
        }
        return fullDetail;
      }
    }
    // Fallback: show any available analysis data
    if (analysisData.rawResponse) {
      return `RAW ANALYSIS:\n${analysisData.rawResponse}`;
    }
    return 'Detailed analysis will be available after running analysis.';
  };
  const calculateOverallScore = () => {
    // Fall back to analysisResults which already respects selectedFeatures
    if (analysisResults?.overallScore?.score) return analysisResults.overallScore.score;
    
    // Calculate from individual scores based on SELECTED features only
    // This matches the app.py logic for PDF/view details
    const scores = [];
    const scoreDetails = [];
    
    // Get current plan type
    let planType = 'free';
    if (subscriptionData) {
      planType = subscriptionData.planType || subscriptionData.plan || 'free';
    }
    
    // Map score keys to card keys and feature IDs
    const scoreToCardMap = {
      'brand_compliance_score': { cardKey: 'brandCompliance', featureId: 'brand_compliance' },
      'messaging_intent_score': { cardKey: 'messagingIntent', featureId: 'messaging_intent' },
      'funnel_compatibility_score': { cardKey: 'funnelCompatibility', featureId: 'funnel_compatibility' },
      'channel_compliance_score': { cardKey: 'channelCompliance', featureId: 'channel_compliance' },
      'purchase_intent_score': { cardKey: 'purchaseIntent', featureId: 'resonance_index' }
    };
    
    Object.entries(scoreToCardMap).forEach(([scoreKey, { cardKey, featureId }]) => {
      // Determine if this score should be included
      let shouldInclude = true;
      
      // For Lite plans, only include selected features
      if (planType === 'lite' || planType === 'Incivus_Lite') {
        shouldInclude = selectedFeatures.includes(featureId);
      }
      
      if (shouldInclude) {
        const score = extractScoreFromGemini(scoreKey);
        if (score !== null && score > 0) {
          scores.push(score);
          scoreDetails.push(`${cardKey}: ${score}%`);
        }
      }
    });
    
    console.log('🔍 calculateOverallScore (SHOWN SCORES ONLY):');
    console.log('   Plan type:', planType);
    console.log('   Selected features:', selectedFeatures);
    console.log('   Scores included:', scoreDetails);
    
    return scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 79;
  };
  // Calculate overall score from comprehensive analysis results
  // **FIX**: Only includes scores from SELECTED features (for Lite users with 4 features)
  const calculateOverallScoreFromResults = (results) => {
    if (!results) return 79;
    const scores = [];
    const scoreDetails = [];
    
    // Helper to check if a feature should be included based on selectedFeatures
    const shouldIncludeFeature = (featureId) => {
      // If no selectedFeatures or empty, include all features (backward compatibility)
      if (!selectedFeatures || selectedFeatures.length === 0) {
        return true;
      }
      return selectedFeatures.includes(featureId);
    };
    
    // Extract scores from different analysis modules - ONLY if feature is selected
    // Purchase Intent / Resonance Index
    if (shouldIncludeFeature('resonance_index')) {
      const purchaseScore = results.content_analysis?.overall_purchase_intent_percentage;
      if (purchaseScore && purchaseScore > 0) {
        scores.push(purchaseScore);
        scoreDetails.push(`Purchase Intent: ${purchaseScore}%`);
      }
    }
    
    // Brand Compliance
    if (shouldIncludeFeature('brand_compliance')) {
      const brandScore = results.brand_compliance?.compliance_analysis?.final_compliance_score;
      if (brandScore && brandScore > 0) {
        scores.push(brandScore);
        scoreDetails.push(`Brand Compliance: ${brandScore}%`);
      }
    }
    
    // Messaging Intent
    if (shouldIncludeFeature('messaging_intent')) {
      const intentScore = results.metaphor_analysis?.message_intent?.intent_compliance_score;
      if (intentScore && intentScore > 0) {
        scores.push(intentScore);
        scoreDetails.push(`Message Intent: ${intentScore}%`);
      }
    }
    
    // Funnel Compatibility
    if (shouldIncludeFeature('funnel_compatibility')) {
      const funnelScore = results.metaphor_analysis?.funnel_compatibility?.effectiveness_score;
      if (funnelScore && funnelScore > 0) {
        scores.push(funnelScore);
        scoreDetails.push(`Funnel Compatibility: ${funnelScore}%`);
      }
    }
    
    // Channel Compliance
    if (shouldIncludeFeature('channel_compliance')) {
      const channelScore = calculateChannelScore(results.channel_compliance);
      if (channelScore > 0) {
        scores.push(channelScore);
        scoreDetails.push(`Channel Compliance: ${channelScore}%`);
      }
    }
    
    const totalScore = scores.reduce((a, b) => a + b, 0);
    const avgScore = scores.length > 0 ? Math.round((totalScore / scores.length) * 100) / 100 : 79;
    
    console.log('📊 Overall Score Calculation (SELECTED FEATURES ONLY):');
    console.log('   Selected Features:', selectedFeatures);
    console.log('   Scores included:', scoreDetails);
    console.log('   Sum:', totalScore, '/ Count:', scores.length, '= Average:', avgScore);
    
    return avgScore;
  };
  // Calculate channel compliance score from platform data
  const calculateChannelScore = (channelData) => {
    if (!channelData) return 0;
    const platformScores = [];
    // Extract scores from each platform
    Object.values(channelData).forEach(platform => {
      if (platform && typeof platform === 'object' && platform.compliance_score) {
        platformScores.push(platform.compliance_score);
      }
    });
    return platformScores.length > 0 ? 
      Math.round(platformScores.reduce((a, b) => a + b, 0) / platformScores.length) : 0;
  };
  // Render model results in a user-friendly format
  const renderModelResults = (modelData) => {
    if (!modelData) return <p>No data available</p>;
    // Helper function to render nested objects
    const renderObject = (obj, level = 0) => {
      if (typeof obj === 'string' || typeof obj === 'number') {
        return <span style={{ marginLeft: `${level * 20}px` }}>{obj}</span>;
      }
      if (Array.isArray(obj)) {
        return (
          <ul style={{ marginLeft: `${level * 20}px`, paddingLeft: '20px' }}>
            {obj.map((item, index) => (
              <li key={index} style={{ marginBottom: '0.5rem' }}>
                {renderObject(item, level)}
              </li>
            ))}
          </ul>
        );
      }
      if (typeof obj === 'object' && obj !== null) {
        return (
          <div style={{ marginLeft: `${level * 20}px` }}>
            {Object.entries(obj).map(([key, value]) => (
              <div key={key} style={{ marginBottom: '0.75rem' }}>
                <strong style={{ color: '#374151', textTransform: 'capitalize' }}>
                  {key.replace(/_/g, ' ')}: 
                </strong>
                <div style={{ marginTop: '0.25rem' }}>
                  {renderObject(value, level + 1)}
                </div>
              </div>
            ))}
          </div>
        );
      }
      return String(obj);
    };
    return renderObject(modelData);
  };
  // Simulate analysis results
  const simulateAnalysis = async (geminiData = null) => {
    if (!geminiData) {
      return {
        brandCompliance: { score: null, detailedAnalysis: 'Analysis not available' },
        messagingIntent: { score: null, detailedAnalysis: 'Analysis not available' },
        funnelCompatibility: { score: null, detailedAnalysis: 'Analysis not available' },
        channelCompliance: { score: null, detailedAnalysis: 'Analysis not available' },
        purchaseIntent: { score: null, detailedAnalysis: 'Analysis not available' },
        overallScore: { score: null },
        analysisSummary: { resonatingImpact: 'Analysis not available' }
      };
    }
    // Extract from the actual response structure shown in network tab
    const apiData = geminiData?.data?.data || geminiData?.data || geminiData;
    const results = apiData?.results || {};
    
    console.log('🔍 simulateAnalysis - API Data:', apiData);
    console.log('🔍 simulateAnalysis - Results:', results);
    
    const getScore = (analysisType, scoreField) => {
      const analysisData = results[analysisType];
      console.log(`🔍 Getting score for ${analysisType}.${scoreField}:`, analysisData);
      console.log(`🔍 Available results keys:`, Object.keys(results || {}));
      
      if (analysisType === 'metaphor_analysis') {
        if (scoreField === 'intent_compliance_score') {
          const score = analysisData?.message_intent?.intent_compliance_score || null;
          console.log(`🔍 Extracted intent score:`, score);
          return score;
        }
        if (scoreField === 'effectiveness_score') {
          const score = analysisData?.funnel_compatibility?.effectiveness_score || null;
          console.log(`🔍 Extracted funnel score:`, score);
          return score;
        }
      }
      
      if (analysisType === 'content_analysis') {
        return analysisData?.overall_purchase_intent_percentage || null;
      }
      
      if (analysisType === 'brand_compliance') {
        return analysisData?.compliance_analysis?.final_compliance_score || null;
      }
      
      if (analysisType === 'channel_compliance') {
        // Calculate average from all platforms
        const platforms = Object.values(analysisData || {});
        const scores = platforms.map(p => p?.compliance_score).filter(s => typeof s === 'number');
        return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b) / scores.length) : null;
      }
      
      return null;
    };
    const getAnalysisContent = (prefix) => {
      const keys = Object.keys(apiData || {}).filter(key => 
        key.toLowerCase().includes(prefix.toLowerCase()) && 
        typeof apiData[key] === 'string' && 
        apiData[key].length > 20
      );
      return keys.length > 0 ? apiData[keys[0]] : 'Detailed analysis will be available after running analysis.';
    };
    return {
      brandCompliance: {
        score: getScore('brand_compliance', 'final_compliance_score'),
        detailedAnalysis: getAnalysisContent('brand')
      },
      messagingIntent: {
        score: getScore('metaphor_analysis', 'intent_compliance_score'),
        detailedAnalysis: getAnalysisContent('messaging')
      },
      funnelCompatibility: {
        score: getScore('metaphor_analysis', 'effectiveness_score'),
        detailedAnalysis: getAnalysisContent('funnel')
      },
      channelCompliance: {
        score: getScore('channel_compliance', 'compliance_score'),
        detailedAnalysis: getAnalysisContent('channel')
      },
      purchaseIntent: {
        score: getScore('content_analysis', 'overall_purchase_intent_percentage'),
        detailedAnalysis: getAnalysisContent('purchase')
      },
      overallScore: {
        score: (() => {
          // Calculate overall score based ONLY on SHOWN cards (respects selectedFeatures)
          // This matches the app.py logic for PDF/view details
          const shownScores = [];
          const shownScoreDetails = [];
          
          // Get current plan type
          let planType = 'free';
          if (subscriptionData) {
            planType = subscriptionData.planType || subscriptionData.plan || 'free';
          }
          
          // Map of card keys to their scores
          const cardScores = {
            messagingIntent: getScore('metaphor_analysis', 'intent_compliance_score'),
            funnelCompatibility: getScore('metaphor_analysis', 'effectiveness_score'),
            purchaseIntent: getScore('content_analysis', 'overall_purchase_intent_percentage'),
            brandCompliance: getScore('brand_compliance', 'final_compliance_score'),
            channelCompliance: getScore('channel_compliance', 'compliance_score')
          };
          
          // Card to feature ID mapping (same as shouldShowCard)
          const cardToFeatureMap = {
            'brandCompliance': 'brand_compliance',
            'messagingIntent': 'messaging_intent', 
            'funnelCompatibility': 'funnel_compatibility',
            'channelCompliance': 'channel_compliance',
            'purchaseIntent': 'resonance_index'
          };
          
          // Check each card and only include if it should be shown
          Object.entries(cardScores).forEach(([cardKey, score]) => {
            if (score !== null && score > 0) {
              // Determine if this card should be included in overall score
              let shouldInclude = true;
              
              // For Lite plans, only include selected features
              if (planType === 'lite' || planType === 'Incivus_Lite') {
                const featureId = cardToFeatureMap[cardKey];
                shouldInclude = selectedFeatures.includes(featureId);
              }
              
              if (shouldInclude) {
                shownScores.push(score);
                shownScoreDetails.push(`${cardKey}: ${score}%`);
              }
            }
          });
          
          console.log('🔍 Overall score calculation (SHOWN SCORES ONLY):');
          console.log('   Plan type:', planType);
          console.log('   Selected features:', selectedFeatures);
          console.log('   Scores included:', shownScoreDetails);
          console.log('   Sum:', shownScores.reduce((a, b) => a + b, 0), 'Count:', shownScores.length);
          
          return shownScores.length > 0 ? Math.round((shownScores.reduce((a, b) => a + b, 0) / shownScores.length) * 100) / 100 : null;
        })()
      },
      analysisSummary: {
        resonatingImpact: results?.content_analysis?.resonating_impact || apiData?.resonating_impact || 'This Ad effectively communicates the brand message with strong visual appeal and clear call-to-action.'
      }
    };
  };


  // Load user data for validation logic (SubscriptionStatus handles UI display)
  const loadUserData = async () => {
    if (!currentUser) return;
    
    try {
      console.log('🔄 Analysis - Loading subscription data for validation...');
      
      const userId = currentUser.uid;
      const userProfile = await unifiedApi.getUserProfile(userId);
      const subscription = userProfile?.subscription || null;
      
      if (subscription) {
        const quotaStatus = await canUploadAd(userId);
        
        const enrichedSubscription = {
          ...subscription,
          monthlyRemaining: quotaStatus.monthlyRemaining || 0,
          remainingAds: quotaStatus.remaining || 0,
          adsUsed: quotaStatus.adsUsed || subscription.adsUsed || 0,
          adQuota: quotaStatus.adQuota || subscription.adQuota || 0
        };
        
        setSubscriptionData(enrichedSubscription);
        setSubscriptionLoaded(true);
        
        setQuotaStatus({
          used: quotaStatus.adsUsed || 0,
          max: quotaStatus.adQuota || 0,
          remaining: quotaStatus.monthlyRemaining || 0,
          canAnalyze: quotaStatus.canUpload || false
        });
        
        const features = subscription.selectedFeatures || subscription.features || [];
        setSelectedFeatures(features);
      } else {
        setSubscriptionData(null);
        setSubscriptionLoaded(true);
        setQuotaStatus({
          used: 0,
          max: 0,
          remaining: 0,
          canAnalyze: false
        });
        setSelectedFeatures([]);
      }
    } catch (error) {
      console.error('❌ Error loading subscription data:', error);
      setSubscriptionData(null);
      setSubscriptionLoaded(true);
      setQuotaStatus({
        used: 0,
        max: 0,
        remaining: 0,
        canAnalyze: false
      });
      setSelectedFeatures([]);
    }
  };
  
  // Load data on mount
  useEffect(() => {
    if (currentUser) {
      console.log('📥 Loading user data...');
      loadUserData();
    }
  }, [currentUser]);
  
  // Refresh both local state and SubscriptionStatus component
  const refreshUserDataFromDB = async () => {
    console.log('🔄 Refreshing subscription data...');
    await loadUserData(); // Update local state
    setSubscriptionRefreshTrigger(prev => prev + 1); // Trigger SubscriptionStatus UI refresh
    console.log('✅ Subscription refresh completed');
  };
  

  
  // DISABLED: Auto-refresh - relies on caching now
  // The cache will automatically expire after 30 seconds
  // No need for aggressive polling that bypasses cache

  // Listen for subscription updates from payment completion
  useEffect(() => {
    const handleSubscriptionUpdate = (event) => {
      console.log('🔄 Analysis - Received subscription update event:', event.detail);
      // Force refresh subscription data
      if (currentUser && event.detail.userId === currentUser.uid) {
        console.log('🔄 Analysis - Refreshing subscription data after payment...');
        refreshUserDataFromDB(); // Reload all user data including subscription
      }
    };

    window.addEventListener('subscriptionUpdated', handleSubscriptionUpdate);
    return () => window.removeEventListener('subscriptionUpdated', handleSubscriptionUpdate);
  }, [currentUser]);

  // Fetch brand data when component loads (caching handles freshness)
  useEffect(() => {
    const fetchBrandData = async () => {
      if (currentUser?.uid) {
        try {
          const brand = await unifiedApi.getUserBrands(currentUser.uid);
          setBrandData(brand);
          console.log('🏷️ Brand data loaded for analysis:', brand);
          console.log('🏷️ Brand data mediaFiles count:', brand?.mediaFiles?.length || 0);
        } catch (error) {
          console.error('❌ Error fetching brand data:', error);
        }
      }
    };

    fetchBrandData();
    
    // DISABLED: Aggressive 30-second polling - cache handles freshness automatically
    // Cache expires after 30 seconds, so subsequent requests will fetch fresh data
  }, [currentUser]);

  // Restore analysis state when component mounts
  useEffect(() => {
    const restored = restoreAnalysisState();
    if (restored) {
      console.log('🔄 Analysis state restored on component mount');
    }
  }, []);

  // Auto-save analysis state when results change
  useEffect(() => {
    if (analysisResults || geminiResults) {
      saveAnalysisState();
      console.log('💾 Analysis state auto-saved due to results change');
    }
  }, [analysisResults, geminiResults]);

  // Save state when component unmounts (user navigates away)
  useEffect(() => {
    return () => {
      if (analysisResults || geminiResults) {
        console.log('💾 Component unmounting - saving analysis state...');
        saveAnalysisState();
      }
    };
  }, [analysisResults, geminiResults]);


  // **NEW**: Cleanup object URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (objectUrl) {
        console.log('🧹 Cleaning up object URL');
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  // **NEW**: Video frame extraction for analysis (preserves video metadata)
  const extractVideoFrame = async (file) => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      video.onloadedmetadata = () => {
        // Set canvas dimensions (optimize for analysis)
        const maxWidth = 1920;
        const maxHeight = 1080;
        const aspectRatio = video.videoWidth / video.videoHeight;
        
        if (video.videoWidth > maxWidth || video.videoHeight > maxHeight) {
          if (aspectRatio > 1) {
            canvas.width = maxWidth;
            canvas.height = maxWidth / aspectRatio;
          } else {
            canvas.height = maxHeight;
            canvas.width = maxHeight * aspectRatio;
          }
        } else {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        
        // Extract frame from middle of video for better analysis
        video.currentTime = video.duration / 2;
      };
      
      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            // Create a new file that preserves video metadata but with optimized size
            const frameFile = new File([blob], file.name.replace(/\.[^/.]+$/, '_frame.jpg'), {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            
            // Add video metadata to the file object for backend processing
            frameFile.originalVideoFile = file;
            frameFile.isVideoFrame = true;
            frameFile.videoDuration = video.duration;
            frameFile.videoWidth = video.videoWidth;
            frameFile.videoHeight = video.videoHeight;
            
            console.log(`🎬 Video frame extracted: ${(file.size / 1024 / 1024).toFixed(2)}MB video → ${(frameFile.size / 1024 / 1024).toFixed(2)}MB frame`);
            console.log(`📹 Video metadata: ${video.videoWidth}x${video.videoHeight}, ${video.duration.toFixed(2)}s`);
            resolve(frameFile);
          } else {
            reject(new Error('Failed to extract video frame'));
          }
        }, 'image/jpeg', 0.9); // Higher quality for analysis
      };
      
      video.onerror = () => reject(new Error('Failed to load video'));
      video.src = URL.createObjectURL(file);
    });
  };

  // File handling with video optimization
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      // Clear previous analysis results when new file is uploaded
      setAnalysisResults(null);
      setGeminiResults(null);
      setFilePreview(null);
      
      // Clean up previous object URL if exists
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        setObjectUrl(null);
      }
      
      // **NEW**: File size validation
      const maxSize = file.type.startsWith('video/') ? 100 * 1024 * 1024 : 10 * 1024 * 1024; // 100MB for video, 10MB for image
      const fileSizeMB = file.size / 1024 / 1024;
      const maxSizeMB = file.type.startsWith('video/') ? 100 : 10;
      
      console.log(`📁 File upload: ${file.name} (${fileSizeMB.toFixed(2)}MB, ${file.type})`);
      
      // Clear any previous error
      setFileUploadError(null);
      
      if (file.size > maxSize) {
        const errorMessage = `File too large! Maximum size allowed is ${maxSizeMB}MB for ${file.type.startsWith('video/') ? 'videos' : 'images'}. Your file is ${fileSizeMB.toFixed(2)}MB.`;
        setFileUploadError(errorMessage);
        console.error('❌ File size error:', errorMessage);
        return;
      }
      
      let processedFile = file;
      
      // **FIXED**: Use original video file for preview so video player works properly
      if (file.type.startsWith('video/')) {
        console.log('🎬 Video file detected, using original video for preview...');
        
        // **FIX**: Use object URL for video preview - much more efficient than base64
        console.log(`🎬 Video file size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
        console.log(`🎬 Video type: ${file.type}`);
        
        // Clean up previous object URL if exists
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
        
        const videoObjectUrl = URL.createObjectURL(file);
        console.log(`🎬 Created object URL for video preview`);
        setFilePreview(videoObjectUrl);
        setObjectUrl(videoObjectUrl);
        setMediaType('video');
        
        // **OPTIONAL**: Extract frame for thumbnail if needed later for Libraries
        try {
          const frameForThumbnail = await extractVideoFrame(file);
          console.log('✅ Video frame extracted for potential thumbnail use');
          // We could store this for Libraries thumbnail, but preview should be actual video
        } catch (extractionError) {
          console.warn('⚠️ Video frame extraction failed (non-critical):', extractionError);
        }
        
      } else {
        // For images, use normal processing
        const reader = new FileReader();
        reader.onload = (e) => {
          console.log(`🖼️ Setting image preview for: ${file.name} (${file.type})`);
          setFilePreview(e.target.result);
          setMediaType('image');
        };
        reader.readAsDataURL(file);
      }
      
      // **CRITICAL FIX**: Always use original file for analysis, not processed frame
      setUploadedFile(file);
      
      // Clear any upload errors on successful upload
      setFileUploadError(null);
      
      // Clear saved analysis state for new file
      clearAnalysisState();
      console.log('🧹 Cleared previous analysis state for new file');
      
    } catch (error) {
      console.error('❌ Error processing file:', error);
      alert('Error processing file: ' + error.message);
    }
  };
  const handleChannelChange = (channel) => {
    setSelectedChannels(prev => 
      prev.includes(channel) 
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
    );
  };
  const isFormValid = () => {
    return (uploadedFile || filePreview) && 
           adTitle.trim() !== '' && 
           selectedChannels.length > 0 && 
           funnelStage && 
           messageIntent.trim() !== '' &&
           brandData && 
           brandData.brandId; // Brand setup is required for analysis
  };
  // Analysis handling
  const handleAnalysis = async () => {
    if (!isFormValid()) {
      console.log('❌ Form validation failed');
      Logger.warn('Analysis form validation failed', {
        component: 'Analysis',
        user: currentUser?.email
      });
        return;
      }
    if (!currentUser) {
      console.log('❌ No current user');
      Logger.error(new Error('No authenticated user for analysis'), {
        component: 'Analysis',
        action: 'handleAnalyze'
      });
      setUserFlow('login');
      return;
    }
    const uploadCheck = await canUploadAd(currentUser.uid);
    if (!uploadCheck.canUpload) {
      console.log('❌ Upload blocked:', uploadCheck.reason);
      
      // **FIX**: Pass context about why user is being redirected to plan selection
      if (uploadCheck.showUpgrade) {
        console.log('🔄 Redirecting to plan selection instead of showing popup');
        
        // **CRITICAL**: Set flag to indicate this is for monthly quota exhaustion, not new subscription
        if (uploadCheck.subscriptionStatus === 'monthly_limit_reached') {
          localStorage.setItem('incivus_topup_reason', 'monthly_limit_reached');
          console.log('📊 MONTHLY LIMIT REACHED - Setting topup flag for PlanStructure');
        } else if (uploadCheck.subscriptionStatus === 'quota_exhausted') {
          localStorage.setItem('incivus_topup_reason', 'quota_exhausted');
          console.log('📊 TOTAL QUOTA EXHAUSTED - Setting topup flag for PlanStructure');
        } else {
          localStorage.setItem('incivus_topup_reason', 'new_subscription');
          console.log('🆕 NEW SUBSCRIPTION NEEDED - Setting new subscription flag for PlanStructure');
        }
        
        setUserFlow('plan-selection');
      } else {
        // Set flag to go to upgrade section in dashboard
        localStorage.setItem('incivus_go_to_upgrade', 'true');
        setUserFlow('dashboard');
      }
      return;
    }
    
    console.log('✅ Upload check passed:', uploadCheck);
    
    // Validate brand data is set up
    if (!brandData || !brandData.brandId) {
      console.error('❌ Brand data not found or missing brandId');
      alert('! Brand Setup Required\n\nPlease complete your brand setup before analyzing ads.\n\nRequired steps:\n1. Navigate to Brand Setup section\n2. Upload your brand logo\n3. Add brand colors and details\n4. Save your brand profile\n\nOnce complete, return here to analyze your ad.');
      setIsAnalyzing(false);
      return;
    }
    
    console.log('✅ Brand validation passed:', { brandId: brandData.brandId, brandName: brandData.brandName });
    
    // Note: Ad count will be updated by the backend analysis endpoint
    // No need to update it here to avoid double increment
    
    setIsAnalyzing(true);
    setSaveStatus('');
    setAnalysisProgress(0);
    setAnalysisStage('Preparing analysis...');
    setEstimatedTime('2-3 minutes');
    
    try {
      // Use uploadedFile if available, otherwise we need to handle the case where only filePreview exists
      const fileToAnalyze = uploadedFile;
      if (!fileToAnalyze) {
        console.error('❌ No file available for analysis');
        setSaveStatus('Error: No file available for analysis. Please upload a new file.');
        setIsAnalyzing(false);
        return;
      }
      
      // Progress: 10% - File validation complete
      setAnalysisProgress(10);
      setAnalysisStage('Uploading media file...');
      
      // Progress: 25% - Starting AI analysis
      setAnalysisProgress(25);
      setAnalysisStage('Processing with AI models...');
      
      // **FIX**: Use unifiedApi.submitAnalysisRequest to go through middleware instead of direct backend call
      // This ensures: plan validation, database storage, ad count update, proper tracking
      const analysisResponse = await unifiedApi.submitAnalysisRequest({
        userId: currentUser.uid,
        brandId: brandData.brandId, // Required - already validated above
        adTitle: adTitle,
        messageIntent: messageIntent,
        funnelStage: funnelStage,
        channels: selectedChannels,
        selectedFeatures: selectedFeatures,
        brandData: brandData,
        source: 'analysis-page',
        clientId: currentUser.uid,
        artifacts: {},
        timestamp: new Date().toISOString()
      }, fileToAnalyze);
      
      // Progress: 60% - AI analysis complete
      setAnalysisProgress(60);
      setAnalysisStage('Generating analysis results...');
      
      // Middleware returns: { status, ai_analysis_results: { 'comprehensive-analysis': { success, data: { results } } } }
      console.log('🔍 RAW Analysis Response:', JSON.stringify(analysisResponse, null, 2));
      console.log('🔍 Response status:', analysisResponse?.status);
      console.log('🔍 Has ai_analysis_results?:', !!analysisResponse?.ai_analysis_results);
      console.log('🔍 ai_analysis_results keys:', Object.keys(analysisResponse?.ai_analysis_results || {}));
      
      if (analysisResponse?.status === 'success' && 
          analysisResponse?.ai_analysis_results?.['comprehensive-analysis']?.success) {
        
        const compAnalysis = analysisResponse.ai_analysis_results['comprehensive-analysis'];
        const backendResults = compAnalysis.data?.results || {};
        
        console.log('✅ Analysis response SUCCESS - from middleware:', analysisResponse);
        console.log('✅ Comprehensive Analysis:', compAnalysis);
        console.log('✅ Backend results structure:', {
          hasResults: !!backendResults,
          resultKeys: Object.keys(backendResults),
          hasContentAnalysis: !!backendResults.content_analysis,
          hasBrandCompliance: !!backendResults.brand_compliance,
          hasChannelCompliance: !!backendResults.channel_compliance
        });
        
        // Transform middleware response to match expected format
        const transformedResponse = {
          success: true,
          data: {
            purchaseIntent: backendResults.content_analysis || {},
            brandCompliance: backendResults.brand_compliance || {},
            channelCompliance: backendResults.channel_compliance || {},
            messagingIntent: backendResults.metaphor_analysis?.message_intent || {},
            funnelCompatibility: backendResults.metaphor_analysis?.funnel_compatibility || {},
            overallScore: null, // Will be calculated
            rawResults: backendResults // Keep raw results for detailed breakdown
          }
        };
        
        setGeminiResults(transformedResponse);
        
        // Progress: 75% - Processing results
        setAnalysisProgress(75);
        setAnalysisStage('Finalizing analysis report...');
        
        // Analysis state will be saved after results are set (see below)
        // Clear any cached results first to force fresh data
        setAnalysisResults(null);
        
        // Use the actual analysis data from middleware response
        const actualApiData = {
          data: {
            results: backendResults
          }
        };
        console.log('🎯 Using actualApiData for simulation:', actualApiData);
        console.log('🔍 actualApiData.results:', actualApiData?.data?.results);
        
        const simulatedResults = await simulateAnalysis(actualApiData);
        console.log('✅ Simulated results created:', JSON.stringify(simulatedResults, null, 2));
        console.log('✅ Setting analysisResults state...');
        setAnalysisResults(simulatedResults);
        
        // Force a component re-render to show updated scores
        setTimeout(() => {
          console.log('🔄 Forcing component refresh after analysis...');
          console.log('🔄 Current analysisResults:', analysisResults);
          setAnalysisResults(prev => {
            console.log('🔄 Previous state:', prev);
            return {...prev};
          });
        }, 100);
        
        // Progress: 90% - Saving results
        setAnalysisProgress(90);
        setAnalysisStage('Saving analysis data...');
        
        // **CONSOLIDATED**: Trigger SubscriptionStatus component refresh
        console.log('🔄 Refreshing subscription data after analysis...');
        setTimeout(() => {
          refreshUserDataFromDB(); // Triggers SubscriptionStatus to reload
          console.log('✅ Subscription refresh triggered');
        }, 1000);
        
        // Save analysis state after setting results (single call)
        setTimeout(() => saveAnalysisState(), 100);
        // **DISABLED**: autoSaveAnalysisPDF() - Middleware already saves to database and generates PDF automatically
        // If you need client-side PDF generation, uncomment this line:
        // setTimeout(() => autoSaveAnalysisPDF(), 500);
        // Trigger Libraries page refresh by setting a flag in localStorage (immediate)
        localStorage.setItem('incivus_new_analysis_added', Date.now().toString());
        // Analysis has been submitted and stored via submitAnalysisRequest middleware call
        // Middleware handles: database storage, plan updates, PDF generation
        console.log('✅ Analysis completed and stored via middleware:', analysisResponse?.artifactId);
        
        // Store the analysis ID for PDF download from middleware
        if (analysisResponse?.artifactId) {
          setCurrentAnalysisId(analysisResponse.artifactId);
          console.log('💾 Stored analysis ID for PDF download:', analysisResponse.artifactId);
        }
        
        // Progress: 100% - Complete
        setAnalysisProgress(100);
        setAnalysisStage('Analysis complete!');
        
        // Clear loading state after a brief delay to show completion
        setTimeout(() => {
          setIsAnalyzing(false);
          setAnalysisProgress(0);
          setAnalysisStage('');
        }, 1500);
        
        setSaveStatus('');
      } else {
        // Handle error from middleware
        const errorMessage = analysisResponse?.message || 
                            analysisResponse?.detail || 
                            'Analysis failed. Please try again.';
        console.error('❌ Analysis failed:', errorMessage);
        console.error('❌ Full response:', analysisResponse);
        setSaveStatus(errorMessage);
        setIsAnalyzing(false);
        setAnalysisProgress(0);
        setAnalysisStage('');
      }
    } catch (error) {
      console.error('❌ Analysis error:', error);
      setIsAnalyzing(false);
      setAnalysisProgress(0);
      setAnalysisStage('');
      setSaveStatus('An error occurred during analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Auto-save analysis results as PDF to database
  // **NEW**: Auto-save with results passed as parameters
  // **NEW**: Auto-save database record only (no PDF generation)
  const autoSaveAnalysisRecord = async (analysisResultsParam, geminiResultsParam) => {
    console.log('🔍 autoSaveAnalysisRecord called with:', {
      hasAnalysisResults: !!analysisResultsParam,
      hasGeminiResults: !!geminiResultsParam
    });
    
    if (!analysisResultsParam && !geminiResultsParam) {
      console.log('❌ No analysis results to auto-save (parameters)');
      return;
    }

    if (!hasValidSubscription()) {
      console.log('⚠️ User does not have valid subscription for auto-save');
      return;
    }

    try {
      console.log('🎯 Starting auto-save database record process...');
      
      // Get current analysis ID from existing state/results with more unique generation
      const analysisId = analysisResultsParam?.id || geminiResultsParam?.id || `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // **FIX**: Get the original analysis inputs from state/params
      const inputData = {
        adTitle: adTitle || analysisResultsParam?.title || geminiResultsParam?.title || 'Ad Analysis',
        adDescription: adDescription || 'Auto-generated analysis',
        selectedChannels: selectedChannels || [],
        funnelStage: funnelStage || 'Awareness',
        messageIntent: messageIntent || 'Brand awareness',
        uploadedFileName: uploadedFile?.name || 'uploaded-ad.jpg'
      };
      
      console.log('🔍 Using input data for save:', inputData);
      console.log('🔍 filePreview available:', !!filePreview);
      console.log('🔍 filePreview length:', filePreview ? filePreview.length : 0);
      
      const finalRecord = await saveAnalysisRecord({
        userId: currentUser.uid,
        fileName: inputData.adTitle,
        analysisId: analysisId,
        analysisInputs: inputData,
        analysisResults: analysisResultsParam || geminiResultsParam,
        fileCategory: 'analysis-report',
        fileType: 'application/pdf',
        // **FIX**: Use backend-provided media URL if available, fallback to preview
        mediaUrl: analysisResultsParam?.media_info?.mediaUrl || geminiResultsParam?.media_info?.mediaUrl || filePreview,
        mediaType: analysisResultsParam?.media_info?.mediaType || geminiResultsParam?.media_info?.mediaType || uploadedFile?.type,
        mediaCategory: analysisResultsParam?.media_info?.mediaCategory || geminiResultsParam?.media_info?.mediaCategory,
        mediaFileName: uploadedFile?.name || 'unknown', // Store original filename for debugging
        // Store record ID for later PDF URL update
        tempRecordForPDFUpdate: true
      });
      console.log('✅ Analysis record saved to database:', finalRecord);
      
      // **NEW**: Store record ID for later PDF URL update
      if (finalRecord?.id) {
        console.log('💾 Storing record ID for PDF URL update:', finalRecord.id);
        sessionStorage.setItem('pendingPdfUpdate_' + analysisId, finalRecord.id);
        sessionStorage.setItem('lastAnalysisId', analysisId);
        sessionStorage.setItem('lastRecordId', finalRecord.id);
        console.log('💾 Stored for global access: analysisId =', analysisId, 'recordId =', finalRecord.id);
      }
      
      return finalRecord;
    } catch (error) {
      console.error('❌ Error in autoSaveAnalysisRecord:', error);
      throw error;
    }
  };

  // **NEW**: Update existing analysis record with PDF URL
  const updateAnalysisRecordWithPDF = async (pdfUrl, pdfStoragePath, analysisId) => {
    try {
      console.log('🔄 updateAnalysisRecordWithPDF called with:', { pdfUrl: pdfUrl?.substring(0, 50) + '...', analysisId });
      
      // Get the stored record ID
      const recordId = sessionStorage.getItem('pendingPdfUpdate_' + analysisId);
      if (!recordId) {
        console.log('⚠️ No pending record found for PDF update, analysisId:', analysisId);
        return;
      }
      
      console.log('📝 Updating existing record:', recordId, 'with PDF URL');
      
      // Update the existing record with PDF URL
      const updateResult = await saveAnalysisRecord({
        userId: currentUser.uid,
        analysisId: analysisId,
        recordId: recordId, // Tell backend to update existing record
        pdfUrl: pdfUrl,
        pdfStoragePath: pdfStoragePath,
        url: pdfUrl, // **CRITICAL**: Set main URL to PDF URL for "View PDF" functionality
        fileType: 'application/pdf'
      });
      
      console.log('✅ Analysis record updated with PDF URL:', updateResult);
      
      // Clean up the stored record ID
      sessionStorage.removeItem('pendingPdfUpdate_' + analysisId);
      
      return updateResult;
    } catch (error) {
      console.error('❌ Error updating analysis record with PDF URL:', error);
      throw error;
    }
  };

  const autoSaveAnalysisPDFWithResults = async (analysisResultsParam, geminiResultsParam) => {
    console.log('🔍 autoSaveAnalysisPDFWithResults called with:', {
      hasAnalysisResults: !!analysisResultsParam,
      hasGeminiResults: !!geminiResultsParam
    });
    
    if (!analysisResultsParam && !geminiResultsParam) {
      console.log('❌ No analysis results to auto-save (parameters)');
      return;
    }

    if (!hasValidSubscription()) {
      console.log('⚠️ User does not have valid subscription for auto-save');
      return;
    }

    try {
      console.log('🎯 Starting auto-save PDF process with provided results...');
      
      // Create unique analysis ID and filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '');
      const formattedTimestamp = timestamp.replace(/[-T]/g, '').slice(0, 15) + 'Z';
      const sanitizedTitle = (adTitle || 'Ad Analysis').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
      const filename = `${formattedTimestamp}_${sanitizedTitle}_Scorecards_${new Date().toISOString().split('T')[0]}.pdf`;
      const analysisId = `auto_analysis_${Date.now()}`;

      // **STEP 1**: Create initial analysis record with metadata
      console.log('💾 Creating initial analysis record...');
      const initialRecord = await saveAnalysisRecord({
        userId: currentUser.uid,
        fileName: adTitle || 'Ad Analysis',
        analysisId: analysisId,
        analysisInputs: {
          adTitle,
          adDescription,
          selectedChannels,
          funnelStage,
          messageIntent,
          uploadedFileName: uploadedFile?.name
        },
        analysisResults: analysisResultsParam || geminiResultsParam,
        fileCategory: 'analysis-report',
        fileType: 'application/json'
      });
      console.log('✅ Initial analysis record created:', initialRecord);

      // **STEP 2**: Generate and upload PDF
      console.log('📄 Generating PDF from current results...');
      
      // Force expand all cards for PDF capture
      console.log('🔄 Expanding all cards for PDF capture...');
      setCollapsedCards({
        brandCompliance: false,
        messagingIntent: false,
        funnelCompatibility: false,
        channelCompliance: false,
        purchaseIntent: false,
        overallScore: false,
        mainAnalysis: false,
        geminiAnalysis: false
      });

      // Wait for cards to expand
      await new Promise(resolve => setTimeout(resolve, 500));

      // Generate PDF
      const element = document.getElementById('results-container');
      if (!element) {
        throw new Error('Results container not found for PDF generation');
      }

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      const pdfBlob = pdf.output('blob');

      console.log('📤 Uploading PDF to backend...');
      // Convert blob to File object for the new function signature
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });
      const uploadResult = await unifiedApi.uploadAnalysisPdf(currentUser.uid, pdfFile, analysisId, filename);
      console.log('✅ PDF upload result:', uploadResult);

      // **STEP 3**: Update analysis record with PDF URL
      console.log('💾 Updating analysis record with PDF URL...');
      console.log('🔍 PDF URL to save:', uploadResult.url);
      console.log('🔍 Analysis ID:', analysisId);
      
      // **FIX**: Get the original analysis inputs from state/params
      const inputData = {
        adTitle: adTitle || analysisResultsParam?.title || geminiResultsParam?.title || 'Ad Analysis',
        adDescription: adDescription || 'Auto-generated analysis',
        selectedChannels: selectedChannels || [],
        funnelStage: funnelStage || 'Awareness',
        messageIntent: messageIntent || 'Brand awareness',
        uploadedFileName: uploadedFile?.name || 'uploaded-ad.jpg'
      };
      
      console.log('🔍 Using input data for save:', inputData);
      
      try {
        const finalRecord = await saveAnalysisRecord({
          userId: currentUser.uid,
          fileName: inputData.adTitle,
          analysisId: analysisId,
          analysisInputs: inputData,
          analysisResults: analysisResultsParam || geminiResultsParam,
          pdfUrl: uploadResult.url, // **NEW**: Include PDF URL
          pdfStoragePath: uploadResult.storagePath, // **NEW**: Include storage path
          fileCategory: 'analysis-report',
          fileType: 'application/pdf', // **NEW**: Change to PDF type
          // **FIX**: Include media URL from uploaded file for preview with unique identifier
          mediaUrl: filePreview, // Original ad image URL (base64 data URL)
          mediaFileName: uploadedFile?.name || 'unknown', // Store original filename for debugging
          url: uploadResult.url // **CRITICAL**: Set main URL to PDF URL
        });
        console.log('✅ Analysis record updated with PDF URL:', finalRecord);
      } catch (error) {
        console.error('❌ Error updating analysis record with PDF URL:', error);
        throw error; // Re-throw to maintain error handling
      }

      console.log('🎉 Analysis PDF auto-saved to database successfully!');
      
      // **NEW**: Trigger automatic download
      console.log('📥 Triggering automatic download...');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdfBlob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      console.log('✅ Automatic download triggered');
      
      // Restore original card states after PDF generation
      console.log('🔄 Restoring original card states...');
      setTimeout(() => {
        setCollapsedCards({
          brandCompliance: true,
          messagingIntent: true,
          funnelCompatibility: true,
          channelCompliance: true,
          purchaseIntent: true,
          overallScore: true,
          mainAnalysis: true,
          geminiAnalysis: true
        });
      }, 1000);

      // Set localStorage flag for Libraries refresh
      localStorage.setItem('incivus_new_analysis_added', Date.now().toString());
      console.log('🚀 Set localStorage flag for Libraries refresh');

    } catch (error) {
      console.error('❌ Error in autoSaveAnalysisPDFWithResults:', error);
      throw error;
    }
  };

  const autoSaveAnalysisPDF = async () => {
    if (!analysisResults && !geminiResults) {
      console.log('❌ No analysis results to auto-save');
      return;
    }

    if (!currentUser?.uid) {
      console.log('❌ No current user for auto-save');
      return;
    }

    try {
      console.log('🔄 Auto-saving analysis PDF to database...');
      
      // Step 1: Expand all cards and show detailed breakdowns for PDF capture
      console.log('📂 Expanding all cards and dropdowns for PDF capture...');
      expandAllCards();
      
            // Step 1.5: PDF auto-expansion removed - no longer needed
      console.log('🎯 PDF auto-expansion feature removed - Channel Compliance will remain in user-controlled state');
      
      // Wait for React state to update, then force DOM expansion
      setTimeout(() => {
        const forceAllExpansions = () => {
          console.log('🎯 Executing automatic expansion for PDF generation...');
          
          // Find Channel Compliance elements
          const channelElements = document.querySelectorAll('[data-scorecard="channelCompliance"], [data-card-title*="Channel"]');
          console.log(`🎯 Found ${channelElements.length} Channel Compliance elements`);
          
          channelElements.forEach((el, index) => {
            console.log(`🎯 Processing Channel Compliance element ${index} for PDF`);
            
            // Click all expand buttons
            const buttons = el.querySelectorAll('button');
            buttons.forEach((btn, btnIndex) => {
              const btnText = (btn.textContent || '').toLowerCase();
              if (btnText.includes('show details') || btnText.includes('expand') || btnText.includes('show')) {
                try {
                  btn.click();
                  console.log(`✅ PDF: Clicked Channel Compliance button ${btnIndex}: "${btn.textContent}"`);
                } catch (e) {
                  console.log(`❌ PDF: Could not click Channel Compliance button ${btnIndex}:`, e);
                }
              }
            });
            
            // Force main section visibility
            el.style.height = 'auto';
            el.style.maxHeight = 'none';
            el.style.overflow = 'visible';
            el.style.transform = 'none';
            el.style.transition = 'none';
            el.style.display = 'block';
            el.style.visibility = 'visible';
            el.style.opacity = '1';
            el.setAttribute('aria-expanded', 'true');
            el.setAttribute('aria-hidden', 'false');
            
            // Platform sections are now always visible, no need for complex dropdown expansion
            
            // Find and expand the details div specifically
            const detailsDiv = el.querySelector('[style*="background: #f8fafc"]');
            if (detailsDiv) {
              detailsDiv.style.display = 'block';
              detailsDiv.style.visibility = 'visible';
              detailsDiv.style.opacity = '1';
              detailsDiv.style.height = 'auto';
              detailsDiv.style.maxHeight = 'none';
              detailsDiv.style.overflow = 'visible';
              console.log('✅ PDF: Forced Channel Compliance details div to be visible');
            }
            
            // Force all hidden elements to be visible
            const hiddenElements = el.querySelectorAll('[style*="display: none"], .hidden, [aria-hidden="true"]');
            hiddenElements.forEach(hiddenEl => {
              hiddenEl.style.display = 'block';
              hiddenEl.style.visibility = 'visible';
              hiddenEl.style.opacity = '1';
              hiddenEl.setAttribute('aria-hidden', 'false');
              console.log('✅ PDF: Made hidden element visible');
            });
          });
          
          console.log('🎯 PDF: All Channel Compliance expansions completed automatically');
        };
        
        // Execute expansion with multiple timing attempts
        forceAllExpansions();
        setTimeout(forceAllExpansions, 500);
        setTimeout(forceAllExpansions, 1000);
        setTimeout(forceAllExpansions, 1500);
        setTimeout(forceAllExpansions, 2000);
        
        // ENHANCED: Additional aggressive expansion for TIKTOK and other platforms
        setTimeout(() => {
          console.log('🎯 PDF: Additional aggressive expansion for TIKTOK and other platforms...');
          
          // Find all platform sections by text content and force expand them
          const platformTexts = ['TIKTOK', 'FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'TWITTER', 'LINKEDIN'];
          platformTexts.forEach(platform => {
            const platformElements = document.querySelectorAll('*');
            platformElements.forEach(element => {
              if (element.textContent && element.textContent.toUpperCase().includes(platform)) {
                console.log(`🎯 PDF: Found ${platform} element:`, element.textContent?.substring(0, 50));
                
                // Look for the parent container that might be collapsible
                let parent = element.parentElement;
                for (let i = 0; i < 3 && parent; i++) { // Check up to 3 levels up
                  if (parent.style && parent.style.background) {
                    console.log(`🎯 PDF: Checking parent ${i} for ${platform}:`, parent.style.background);
                    
                    // If this parent has a background (like the light green box), expand it
                    if (parent.style.background.includes('#dcfce7') || 
                        parent.style.background.includes('#f0fdf4') || 
                        parent.style.background.includes('#fef3c7')) {
                      
                      console.log(`🎯 PDF: Expanding ${platform} parent container`);
                      
                      // Force full expansion
                      parent.style.height = 'auto';
                      parent.style.maxHeight = 'none';
                      parent.style.overflow = 'visible';
                      parent.style.display = 'block';
                      parent.style.visibility = 'visible';
                      parent.style.opacity = '1';
                      
                      // Look for any hidden content within this platform section
                      const platformHiddenContent = parent.querySelectorAll('[style*="display: none"], .hidden, [aria-hidden="true"]');
                      platformHiddenContent.forEach(hiddenEl => {
                        hiddenEl.style.display = 'block';
                        hiddenEl.style.visibility = 'visible';
                        hiddenEl.style.opacity = '1';
                        hiddenEl.setAttribute('aria-hidden', 'false');
                        console.log(`✅ PDF: Made ${platform} hidden content visible`);
                      });
                      
                      // Also look for any collapsible content that might be nested deeper
                      const nestedCollapsible = parent.querySelectorAll('[style*="display: none"], .hidden, [aria-hidden="true"]');
                      nestedCollapsible.forEach(nestedEl => {
                        nestedEl.style.display = 'block';
                        nestedEl.style.visibility = 'visible';
                        nestedEl.style.opacity = '1';
                        nestedEl.setAttribute('aria-hidden', 'false');
                        console.log(`✅ PDF: Made ${platform} nested content visible`);
                      });
                    }
                  }
                  parent = parent.parentElement;
                }
              }
            });
          });
          
          // Force expand all elements with platform-like backgrounds
          const allPlatformContainers = document.querySelectorAll('div[style*="background"]');
          allPlatformContainers.forEach((container, containerIndex) => {
            const bgStyle = container.style.background || '';
            if (bgStyle.includes('#dcfce7') || bgStyle.includes('#f0fdf4') || bgStyle.includes('#fef3c7')) {
              console.log(`🎯 PDF: Force expanding platform container ${containerIndex}:`, container.textContent?.substring(0, 50));
              
              // Force expansion
              container.style.height = 'auto';
              container.style.maxHeight = 'none';
              container.style.overflow = 'visible';
              container.style.display = 'block';
              container.style.visibility = 'visible';
              container.style.opacity = '1';
              
              // Make all children visible
              const allChildren = container.querySelectorAll('*');
              allChildren.forEach(child => {
                if (child.style) {
                  child.style.display = 'block';
                  child.style.visibility = 'visible';
                  child.style.opacity = '1';
                }
                if (child.hasAttribute('aria-hidden')) {
                  child.setAttribute('aria-hidden', 'false');
                }
              });
              
              console.log(`✅ PDF: Force expanded platform container ${containerIndex}`);
            }
          });
          
          console.log('🎯 PDF: Enhanced platform expansion completed');
        }, 2500);
        
        // CRITICAL: Immediate TIKTOK expansion for PDF capture
        setTimeout(() => {
          console.log('🎯 PDF: CRITICAL - Immediate TIKTOK expansion for PDF capture...');
          
          // Force expand TIKTOK and other platforms immediately
          const platformTexts = ['TIKTOK', 'FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'TWITTER', 'LINKEDIN'];
          platformTexts.forEach(platform => {
            const platformElements = document.querySelectorAll('*');
            platformElements.forEach(element => {
              if (element.textContent && element.textContent.toUpperCase().includes(platform)) {
                console.log(`🎯 PDF: CRITICAL - Found ${platform} element:`, element.textContent?.substring(0, 50));
                
                // Look for the parent container that might be collapsible
                let parent = element.parentElement;
                for (let i = 0; i < 3 && parent; i++) { // Check up to 3 levels up
                  if (parent.style && parent.style.background) {
                    console.log(`🎯 PDF: CRITICAL - Checking parent ${i} for ${platform}:`, parent.style.background);
                    
                    // If this parent has a background (like the light green box), expand it
                    if (parent.style.background.includes('#dcfce7') || 
                        parent.style.background.includes('#f0fdf4') || 
                        parent.style.background.includes('#fef3c7')) {
                      
                      console.log(`🎯 PDF: CRITICAL - IMMEDIATELY expanding ${platform} parent container for PDF`);
                      
                      // Force full expansion immediately
                      parent.style.height = 'auto';
                      parent.style.maxHeight = 'none';
                      parent.style.overflow = 'visible';
                      parent.style.display = 'block';
                      parent.style.visibility = 'visible';
                      parent.style.opacity = '1';
                      
                      // Look for any hidden content within this platform section
                      const platformHiddenContent = parent.querySelectorAll('[style*="display: none"], .hidden, [aria-hidden="true"]');
                      platformHiddenContent.forEach(hiddenEl => {
                        hiddenEl.style.display = 'block';
                        hiddenEl.style.visibility = 'visible';
                        hiddenEl.style.opacity = '1';
                        hiddenEl.setAttribute('aria-hidden', 'false');
                        console.log(`✅ PDF: CRITICAL - Made ${platform} hidden content visible IMMEDIATELY`);
                      });
                      
                      // Also look for any collapsible content that might be nested deeper
                      const nestedCollapsible = parent.querySelectorAll('[style*="display: none"], .hidden, [aria-hidden="true"]');
                      nestedCollapsible.forEach(nestedEl => {
                        nestedEl.style.display = 'block';
                        nestedEl.style.visibility = 'visible';
                        nestedEl.style.opacity = '1';
                        nestedEl.setAttribute('aria-hidden', 'false');
                        console.log(`✅ PDF: Made ${platform} nested content visible IMMEDIATELY`);
                      });
                      
                      // No chevrons to manipulate since dropdowns are removed
                    }
                  }
                  parent = parent.parentElement;
                }
              }
            });
          });
          
          // CRITICAL: Force expand all elements with platform-like backgrounds immediately
          const allPlatformContainers = document.querySelectorAll('div[style*="background"]');
          allPlatformContainers.forEach((container, containerIndex) => {
            const bgStyle = container.style.background || '';
            if (bgStyle.includes('#dcfce7') || bgStyle.includes('#f0fdf4') || bgStyle.includes('#fef3c7')) {
              console.log(`🎯 PDF: CRITICAL - IMMEDIATELY force expanding platform container ${containerIndex}:`, container.textContent?.substring(0, 50));
              
              // Force expansion immediately
              container.style.height = 'auto';
              container.style.maxHeight = 'none';
              container.style.overflow = 'visible';
              container.style.display = 'block';
              container.style.visibility = 'visible';
              container.style.opacity = '1';
              
              // Make all children visible immediately
              const allChildren = container.querySelectorAll('*');
              allChildren.forEach(child => {
                if (child.style) {
                  child.style.display = 'block';
                  child.style.visibility = 'visible';
                  child.style.opacity = '1';
                }
                if (child.hasAttribute('aria-hidden')) {
                  child.setAttribute('aria-hidden', 'false');
                }
              });
              
                          // No chevrons to manipulate since dropdowns are removed
              
              console.log(`✅ PDF: CRITICAL - IMMEDIATELY force expanded platform container ${containerIndex} for PDF`);
            }
          });
          
          console.log('🎯 PDF: CRITICAL - Enhanced platform expansion completed for PDF capture');
        }, 100); // Much earlier timing for immediate effect
      }, 100);
      
      // CRITICAL FIX: Force expand TIKTOK and all platform sections BEFORE PDF capture
      console.log('🎯 CRITICAL: Force expanding TIKTOK and platforms BEFORE PDF capture...');
      
      // ULTRA-AGGRESSIVE Method: Force expand ALL potential collapsible elements
      const forceExpandAllElements = () => {
        // Method 1: Force expand all platform sections by text content
        const platformTexts = ['TIKTOK', 'FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'TWITTER', 'LINKEDIN'];
        platformTexts.forEach(platform => {
          const platformElements = document.querySelectorAll('*');
          platformElements.forEach(element => {
            if (element.textContent && element.textContent.toUpperCase().includes(platform)) {
              console.log(`🎯 CRITICAL: Found ${platform} element:`, element.textContent?.substring(0, 50));
              
              // Look for the parent container that might be collapsible
              let parent = element.parentElement;
              for (let i = 0; i < 5 && parent; i++) { // Check up to 5 levels up
                if (parent.style && parent.style.background) {
                  console.log(`🎯 CRITICAL: Checking parent ${i} for ${platform}:`, parent.style.background);
                  
                  // If this parent has a background (like the light green box), expand it
                  if (parent.style.background.includes('#dcfce7') || 
                      parent.style.background.includes('#f0fdf4') || 
                      parent.style.background.includes('#fef3c7')) {
                    
                    console.log(`🎯 CRITICAL: IMMEDIATELY expanding ${platform} parent container for PDF`);
                    
                    // Force full expansion immediately
                    parent.style.height = 'auto';
                    parent.style.maxHeight = 'none';
                    parent.style.overflow = 'visible';
                    parent.style.display = 'block';
                    parent.style.visibility = 'visible';
                    parent.style.opacity = '1';
                    
                    // Look for any hidden content within this platform section
                    const platformHiddenContent = parent.querySelectorAll('[style*="display: none"], .hidden, [aria-hidden="true"]');
                    platformHiddenContent.forEach(hiddenEl => {
                      hiddenEl.style.display = 'block';
                      hiddenEl.style.visibility = 'visible';
                      hiddenEl.style.opacity = '1';
                      hiddenEl.setAttribute('aria-hidden', 'false');
                      console.log(`✅ CRITICAL: Made ${platform} hidden content visible`);
                    });
                    
                    // Also look for any collapsible content that might be nested deeper
                    const nestedCollapsible = parent.querySelectorAll('[style*="display: none"], .hidden, [aria-hidden="true"]');
                    nestedCollapsible.forEach(nestedEl => {
                      nestedEl.style.display = 'block';
                      nestedEl.style.visibility = 'visible';
                      nestedEl.style.opacity = '1';
                      nestedEl.setAttribute('aria-hidden', 'false');
                      console.log(`✅ CRITICAL: Made ${platform} nested content visible`);
                    });
                    
                    // CRITICAL: Force any downward chevrons to be upward (expanded state)
                    const chevrons = parent.querySelectorAll('svg');
                    chevrons.forEach((chevron, chevronIndex) => {
                      if (chevron.innerHTML.includes('down') || chevron.innerHTML.includes('chevron-down')) {
                        // Replace downward chevron with upward chevron to show expanded state
                        chevron.innerHTML = chevron.innerHTML.replace('down', 'up').replace('chevron-down', 'chevron-up');
                        console.log(`✅ CRITICAL: Changed ${platform} chevron from down to up for PDF capture`);
                      }
                    });
                  }
                }
                parent = parent.parentElement;
              }
            }
          });
        });
        
        // Method 2: Force expand all elements with platform-like backgrounds
        const allPlatformContainers = document.querySelectorAll('div[style*="background"]');
        allPlatformContainers.forEach((container, containerIndex) => {
          const bgStyle = container.style.background || '';
          if (bgStyle.includes('#dcfce7') || bgStyle.includes('#f0fdf4') || bgStyle.includes('#fef3c7')) {
            console.log(`🎯 CRITICAL: IMMEDIATELY force expanding platform container ${containerIndex}:`, container.textContent?.substring(0, 50));
            
            // Force expansion immediately
            container.style.height = 'auto';
            container.style.maxHeight = 'none';
            container.style.overflow = 'visible';
            container.style.display = 'block';
            container.style.visibility = 'visible';
            container.style.opacity = '1';
            
            // Make all children visible immediately
            const allChildren = container.querySelectorAll('*');
            allChildren.forEach(child => {
              if (child.style) {
                child.style.display = 'block';
                child.style.visibility = 'visible';
                child.style.opacity = '1';
              }
              if (child.hasAttribute('aria-hidden')) {
                child.setAttribute('aria-hidden', 'false');
              }
            });
            
            // CRITICAL: Change any downward chevrons to upward for PDF capture
            const chevrons = container.querySelectorAll('svg');
            chevrons.forEach((chevron, chevronIndex) => {
              if (chevron.innerHTML.includes('down') || chevron.innerHTML.includes('chevron-down')) {
                chevron.innerHTML = chevron.innerHTML.replace('down', 'up').replace('chevron-down', 'chevron-up');
                console.log(`✅ CRITICAL: Changed platform container chevron from down to up for PDF capture`);
              }
            });
            
            console.log(`✅ CRITICAL: IMMEDIATELY force expanded platform container ${containerIndex} for PDF`);
          }
        });
        
        // Method 3: ULTRA-AGGRESSIVE - Force expand ALL collapsible elements
        const allCollapsibleElements = document.querySelectorAll('[style*="display: none"], .hidden, [aria-hidden="true"]');
        console.log(`🎯 CRITICAL: Found ${allCollapsibleElements.length} potentially hidden elements`);
        allCollapsibleElements.forEach((el, index) => {
          el.style.display = 'block';
          el.style.visibility = 'visible';
          el.style.opacity = '1';
          el.setAttribute('aria-hidden', 'false');
          console.log(`✅ CRITICAL: Force expanded hidden element ${index}`);
        });
        
        // Method 4: Force expand ALL elements with any height/maxHeight constraints
        const allHeightConstrainedElements = document.querySelectorAll('*');
        allHeightConstrainedElements.forEach((el, index) => {
          if (el.style && (el.style.height || el.style.maxHeight || el.style.overflow)) {
            el.style.height = 'auto';
            el.style.maxHeight = 'none';
            el.style.overflow = 'visible';
            console.log(`✅ CRITICAL: Force expanded height-constrained element ${index}`);
          }
        });
      };
      
      // Execute ultra-aggressive expansion multiple times
      forceExpandAllElements();
      setTimeout(forceExpandAllElements, 500);
      setTimeout(forceExpandAllElements, 1000);
      setTimeout(forceExpandAllElements, 1500);
      setTimeout(forceExpandAllElements, 2000);
      
      // Wait for UI to update and ensure all dropdowns are expanded
      await new Promise(resolve => setTimeout(resolve, 2000)); // Increased wait time for expansion
      
      // Additional step to ensure all dropdowns and details are expanded
      const detailButtons = document.querySelectorAll('button');
      detailButtons.forEach(button => {
        const buttonText = button.textContent?.toLowerCase() || '';
        if (buttonText.includes('show details') || 
            buttonText.includes('show more') || 
            buttonText.includes('expand') ||
            button.getAttribute('aria-expanded') === 'false') {
          try {
            button.click();
            console.log('✅ CRITICAL: Clicked button for PDF:', buttonText);
          } catch (e) {
            console.log('❌ CRITICAL: Could not click button:', e);
          }
        }
      });
      
      // Wait again for expansion animations
      await new Promise(resolve => setTimeout(resolve, 1500)); // Increased wait time
      
      const analysisContainer = document.querySelector('[data-analysis-results]');
      if (!analysisContainer) {
        console.log('❌ Analysis results container not found for auto-save');
        console.log('Available containers:', document.querySelectorAll('[data-analysis-results], [data-scorecard]').length);
        return;
      }
      
      console.log('✅ Found analysis container for auto-save:', analysisContainer);

      // Create PDF from analysis results
      const canvas = await html2canvas(analysisContainer, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        scrollX: 0,
        scrollY: 0,
        windowWidth: 1200,
        windowHeight: 800
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a4');
      
      // Enhanced PDF generation with better centering (same as manual download)
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      
      // PDF page dimensions (A4: 210mm x 297mm)
      const pageWidthMm = pdf.internal.pageSize.getWidth();   // 210mm
      const pageHeightMm = pdf.internal.pageSize.getHeight(); // 297mm
      const marginMm = 15; // Increased margin for better appearance
      const titleHeightMm = 15; // Space reserved for title
      
      // Available space for content
      const availableWidthMm = pageWidthMm - (marginMm * 2);   // 180mm
      const availableHeightMm = pageHeightMm - titleHeightMm - (marginMm * 2); // ~267mm
      
      // Calculate optimal image dimensions to fit page while maintaining aspect ratio
      const imgAspectRatio = imgWidth / imgHeight;
      const pageAspectRatio = availableWidthMm / availableHeightMm;
      
      let finalWidthMm, finalHeightMm;
      
      if (imgAspectRatio > pageAspectRatio) {
        // Image is wider relative to page - constrain by width
        finalWidthMm = availableWidthMm * 0.95; // Use 95% of available width
        finalHeightMm = finalWidthMm / imgAspectRatio;
      } else {
        // Image is taller relative to page - constrain by height
        finalHeightMm = availableHeightMm * 0.95; // Use 95% of available height
        finalWidthMm = finalHeightMm * imgAspectRatio;
      }
      
      // Center the image on the page
      const xMm = (pageWidthMm - finalWidthMm) / 2;
      const yMm = titleHeightMm + ((availableHeightMm - finalHeightMm) / 2);
      
      // Add title
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(124, 58, 237);
      pdf.text(adTitle || 'Ad Analysis Results', pageWidthMm / 2, 10, { align: 'center' });
      
      // Check if image fits on single page
      if (finalHeightMm <= availableHeightMm) {
        // Single page - perfect fit
        pdf.addImage(imgData, 'PNG', xMm, yMm, finalWidthMm, finalHeightMm);
      } else {
        // Multi-page handling - slice image vertically
        const scaleFactor = finalWidthMm / imgWidth;
        const sliceHeightMm = availableHeightMm * 0.9;
        const sliceHeightPx = sliceHeightMm / scaleFactor;
        
        let currentYPx = 0;
        let sliceNumber = 1;
        let pageNumber = 1;
        
        while (currentYPx < imgHeight) {
          if (sliceNumber > 1) {
            pdf.addPage();
            pageNumber++;
            // Add title to each page
            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(124, 58, 237);
            pdf.text(adTitle || 'Ad Analysis Results', pageWidthMm / 2, 10, { align: 'center' });
          }
          
          const remainingHeightPx = imgHeight - currentYPx;
          const thisSliceHeightPx = Math.min(sliceHeightPx, remainingHeightPx);
          const thisSliceHeightMm = thisSliceHeightPx * scaleFactor;
          
          // Create slice canvas
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = imgWidth;
          sliceCanvas.height = thisSliceHeightPx;
          const ctx = sliceCanvas.getContext('2d');
          
          // Draw the slice
          ctx.drawImage(canvas, 0, currentYPx, imgWidth, thisSliceHeightPx, 0, 0, imgWidth, thisSliceHeightPx);
          const sliceData = sliceCanvas.toDataURL('image/png', 1.0);
          
          // Center this slice on the page
          const sliceXMm = (pageWidthMm - finalWidthMm) / 2;
          const sliceYMm = titleHeightMm + ((availableHeightMm - thisSliceHeightMm) / 2);
          
          pdf.addImage(sliceData, 'PNG', sliceXMm, sliceYMm, finalWidthMm, thisSliceHeightMm);
          
          currentYPx += thisSliceHeightPx;
          sliceNumber++;
        }
      }
      
      // CRITICAL: Add second page with brand details for ALL PDFs
      console.log('🎯 CRITICAL: Adding second page with brand details...');
      pdf.addPage();
      
      // Add title to second page
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(124, 58, 237);
      pdf.text('Brand Details & Analysis Summary', pageWidthMm / 2, 20, { align: 'center' });
      
      // Add brand information section
      let yPosition = 50;
      
      // Brand Name
      if (brandData?.brandName) {
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 0, 0);
        pdf.text('Brand Name:', 30, yPosition);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(brandData.brandName, 120, yPosition);
        yPosition += 20;
      }
      
      // Brand Tagline
      if (brandData?.tagline) {
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 0, 0);
        pdf.text('Brand Tagline:', 30, yPosition);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(brandData.tagline, 120, yPosition);
        yPosition += 20;
      }
      
      // Brand Colors
      if (brandData?.brandColors && brandData.brandColors.length > 0) {
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 0, 0);
        pdf.text('Brand Colors:', 30, yPosition);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(brandData.brandColors.join(', '), 120, yPosition);
        yPosition += 20;
      }
      
      // Tone of Voice
      if (brandData?.toneOfVoice) {
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 0, 0);
        pdf.text('Tone of Voice:', 30, yPosition);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(brandData.toneOfVoice, 120, yPosition);
        yPosition += 20;
      }
      
      // Ad Analysis Summary
      yPosition += 20;
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(124, 58, 237);
      pdf.text('Ad Analysis Summary', 30, yPosition);
      yPosition += 25;
      
      // Ad Title
      if (adTitle) {
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 0, 0);
        pdf.text('Ad Title:', 30, yPosition);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(adTitle, 120, yPosition);
        yPosition += 20;
      }
      
      // Selected Channels
      if (selectedChannels && selectedChannels.length > 0) {
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 0, 0);
        pdf.text('Target Channels:', 30, yPosition);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(selectedChannels.join(', '), 120, yPosition);
        yPosition += 20;
      }
      
      // Funnel Stage
      if (funnelStage) {
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 0, 0);
        pdf.text('Funnel Stage:', 30, yPosition);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(funnelStage, 120, yPosition);
        yPosition += 20;
      }
      
      // Message Intent
      if (messageIntent) {
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 0, 0);
        pdf.text('Message Intent:', 30, yPosition);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(messageIntent, 120, yPosition);
        yPosition += 20;
      }
      
      // Analysis Scores Summary
      yPosition += 20;
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(124, 58, 237);
      pdf.text('Analysis Scores Summary', 30, yPosition);
      yPosition += 25;
      
      // Add key scores if available
      if (analysisResults) {
        const scores = [
          { label: 'Brand Compliance', score: analysisResults.brandCompliance?.score || 0 },
          { label: 'Messaging Intent', score: analysisResults.messagingIntent?.score || 'N/A' },
          { label: 'Funnel Compatibility', score: analysisResults.funnelCompatibility?.score || 'N/A' },
          { label: 'Channel Compliance', score: analysisResults.channelCompliance?.score || 'N/A' },
          { label: 'Purchase Intent', score: analysisResults.purchaseIntent?.score || 'N/A' }
        ];
        
        scores.forEach(({ label, score }) => {
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(0, 0, 0);
          pdf.text(`${label}:`, 30, yPosition);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(100, 100, 100);
          pdf.text(`${score}/100`, 120, yPosition);
          yPosition += 20;
        });
      }
      
      // Add generation timestamp
      yPosition += 20;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(150, 150, 150);
      const reportTimestamp = new Date().toLocaleString();
      pdf.text(`Report generated on: ${reportTimestamp}`, 30, yPosition);
      
      console.log('✅ CRITICAL: Second page with brand details added successfully');

      // Convert PDF to blob
      const pdfBlob = pdf.output('blob');
      
      // Create filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `analysis-${timestamp}.pdf`;
      const analysisId = `auto_analysis_${Date.now()}`;

      // **STEP 1**: Create initial analysis record with metadata
      console.log('💾 Creating initial analysis record...');
      const initialRecord = await saveAnalysisRecord({
        userId: currentUser.uid,
        fileName: adTitle || 'Ad Analysis',
        analysisId: analysisId,
        analysisInputs: {
          adTitle,
          adDescription,
          selectedChannels,
          funnelStage,
          messageIntent,
          uploadedFileName: uploadedFile?.name
        },
        analysisResults: analysisResults || geminiResults,
        fileCategory: 'analysis-report',
        fileType: 'application/json'
      });
      console.log('✅ Initial analysis record created:', initialRecord);

      // **STEP 2**: Upload PDF to storage
      console.log('📤 Uploading PDF to backend...');
      // Convert blob to File object for the new function signature
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });
      const uploadResult = await unifiedApi.uploadAnalysisPdf(currentUser.uid, pdfFile, analysisId, filename);
      console.log('✅ PDF upload result:', uploadResult);

      // **STEP 3**: Update analysis record with PDF URL
      console.log('💾 Updating analysis record with PDF URL...');
      console.log('🔍 PDF URL to save:', uploadResult.url);
      console.log('🔍 Analysis ID:', analysisId);
      
      try {
        const finalRecord = await saveAnalysisRecord({
          userId: currentUser.uid,
          fileName: adTitle || 'Ad Analysis',
          analysisId: analysisId,
          analysisInputs: {
            adTitle,
            adDescription,
            selectedChannels,
            funnelStage,
            messageIntent,
            uploadedFileName: uploadedFile?.name
          },
          analysisResults: analysisResults || geminiResults,
          pdfUrl: uploadResult.url, // **NEW**: Include PDF URL
          pdfStoragePath: uploadResult.storagePath, // **NEW**: Include storage path
          fileCategory: 'analysis-report',
          fileType: 'application/pdf' // **NEW**: Change to PDF type
        });
        console.log('✅ Analysis record updated with PDF URL:', finalRecord);
      } catch (error) {
        console.error('❌ Error updating analysis record with PDF URL:', error);
        throw error; // Re-throw to maintain error handling
      }

      console.log('🎉 Analysis PDF auto-saved to database successfully!');
      
      // **NEW**: Trigger automatic download
      console.log('📥 Triggering automatic download...');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdfBlob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      console.log('✅ Automatic download triggered');
      
      // Restore original card states after PDF generation
      console.log('🔄 Restoring original card states...');
      setTimeout(() => {
        setCollapsedCards({
          brandCompliance: true,
          messagingIntent: true,
          funnelCompatibility: true,
          channelCompliance: true,
          purchaseIntent: true,
          overallScore: true,
          mainAnalysis: true,
          geminiAnalysis: true
        });
        setDetailedBreakdowns({
          brandCompliance: false,
          messagingIntent: false,
          funnelCompatibility: false,
          channelCompliance: false,
          purchaseIntent: false,
          overallScore: false
        });
        console.log('✅ Card states restored');
      }, 1000);
      
    } catch (error) {
      console.error('❌ Error auto-saving analysis PDF:', error);
      
      // Also restore card states on error
      setTimeout(() => {
        setCollapsedCards({
          brandCompliance: true,
          messagingIntent: true,
          funnelCompatibility: true,
          channelCompliance: true,
          purchaseIntent: true,
          overallScore: true,
          mainAnalysis: true,
          geminiAnalysis: true
        });
        setDetailedBreakdowns({
          brandCompliance: false,
          messagingIntent: false,
          funnelCompatibility: false,
          channelCompliance: false,
          purchaseIntent: false,
          overallScore: false
        });
        console.log('✅ Card states restored after error');
      }, 1000);
    }
  };

  const handleDownloadPDF = async () => {
    if (!analysisResults && !geminiResults) {
      console.log('❌ No analysis results to download');
      return;
    }
    try {
      // Prepare comprehensive analysis data using the actual API response structure
      const comprehensiveData = {
        status: "success",
        analysis_type: "comprehensive", 
        file_type: uploadedFile?.type || "unknown",
        // Use the actual API response data - data contains the comprehensive analysis from backend
        results: geminiResults?.data || {
          brand_compliance: analysisResults?.brandCompliance || {},
          metaphor_analysis: {
            message_intent: analysisResults?.messagingIntent || {},
            funnel_compatibility: analysisResults?.funnelCompatibility || {}
          },
          content_analysis: analysisResults?.purchaseIntent || {},
          channel_compliance: analysisResults?.channelCompliance || {}
        },
        // Include original analysis results for fallback
        originalAnalysisResults: analysisResults,
        geminiResults: geminiResults?.data,
        rawResults: geminiResults?.data,
        detailedBreakdowns: detailedBreakdowns,
        // Add metadata for PDF
        selectedChannels: selectedChannels,
        funnelStage: funnelStage,
        messageIntent: messageIntent,
        adTitle: adTitle,
        // Add explicit Channel Compliance detailed data for PDF
        channelComplianceDetailed: {
          rawChannelData: geminiResults?.data?.channel_compliance || analysisResults?.channelCompliance?.platforms || {},
          channelScore: calculateChannelScore(geminiResults?.data?.channel_compliance) || analysisResults?.channelCompliance?.score || 0,
          platformData: geminiResults?.data?.channel_compliance,
          isDetailedBreakdownVisible: detailedBreakdowns?.channelCompliance || false,
          // Add detailed guidelines for each platform for PDF
          platformGuidelines: geminiResults?.data?.channel_compliance ? 
            Object.fromEntries(
              Object.entries(geminiResults.data.channel_compliance).map(([platform, data]) => [
                platform,
                {
                  compliance_score: data?.compliance_score || 0,
                  total_guidelines: data?.total_guidelines || 0,
                  total_matched_scores: data?.total_matched_scores || 0,
                  guideline_results: data?.guideline_results || [],
                  // Format guidelines for easy PDF consumption
                  formatted_guidelines: data?.guideline_results?.map(guideline => ({
                    rule: guideline.guideline || 'Unknown rule',
                    result: guideline.actual_output || 'Unknown result',
                    passed: (guideline.matched_score || 0) > 0,
                    score: guideline.matched_score || 0
                  })) || []
                }
              ])
            ) : {}
        }
      };
      // Generate unique analysis ID
      const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      // Debug: Log the data being sent to PDF
      console.log('📄 PDF Data Structure Check:', {
        hasResults: !!comprehensiveData.results,
        hasGeminiData: !!geminiResults?.data,
        geminiResultsKeys: geminiResults ? Object.keys(geminiResults) : 'None',
        geminiDataKeys: geminiResults?.data ? Object.keys(geminiResults.data) : 'None',
        comprehensiveDataKeys: Object.keys(comprehensiveData.results || {}),
        actualResults: comprehensiveData.results,
        channelComplianceData: comprehensiveData.results?.channel_compliance,
        detailedChannelCompliance: geminiResults?.data?.channel_compliance,
        channelComplianceDetailedForPDF: comprehensiveData.channelComplianceDetailed,
        youtubeGuidelines: comprehensiveData.channelComplianceDetailed?.platformGuidelines?.youtube || comprehensiveData.channelComplianceDetailed?.platformGuidelines?.YOUTUBE,
        allPlatformKeys: comprehensiveData.channelComplianceDetailed?.platformGuidelines ? Object.keys(comprehensiveData.channelComplianceDetailed.platformGuidelines) : 'None',
        samplePlatformGuidelines: comprehensiveData.channelComplianceDetailed?.platformGuidelines ? Object.values(comprehensiveData.channelComplianceDetailed.platformGuidelines)[0] : 'None'
      });
      // Call main.py PDF endpoint instead of client-side generation
      await unifiedApi.sendAnalysisDataToPDFEndpoint(
        comprehensiveData,
        adTitle || 'Advertisement Analysis',
        currentUser.uid,
        analysisId
      );
      console.log('✅ PDF generated successfully via main.py backend');
      
      // Cleanup: Reset Channel Compliance expansion state after PDF generation
      console.log('🧹 Cleaning up Channel Compliance expansion state after PDF generation...');
      setDetailedBreakdowns(prev => ({ ...prev, channelCompliance: false }));
      
    } catch (error) {
      console.error('❌ PDF generation error:', error);
      // Fallback to client-side PDF generation if backend fails
      try {
        console.log('🔄 Falling back to client-side PDF generation...');
        const fallbackData = {
          adTitle: adTitle,
          adDescription: adDescription,
          selectedChannels: selectedChannels,
          funnelStage: funnelStage,
          messageIntent: messageIntent,
          analysisResults: analysisResults,
          geminiResults: geminiResults?.data,
          rawResults: geminiResults?.rawResults,
          detailedBreakdowns: detailedBreakdowns
        };
        // **REMOVED**: downloadAndSaveAnalysisPDF - backend now handles all PDF generation
        console.log('✅ Fallback PDF generation skipped (handled by backend)');
        
        // Cleanup: Reset Channel Compliance expansion state after fallback PDF generation
        console.log('🧹 Cleaning up Channel Compliance expansion state after fallback PDF generation...');
        setDetailedBreakdowns(prev => ({ ...prev, channelCompliance: false }));
        
      } catch (fallbackError) {
        console.error('❌ Both PDF generation methods failed:', fallbackError);
        alert('PDF generation failed. Please try again later.');
        
        // Cleanup: Reset Channel Compliance expansion state even on error
        console.log('🧹 Cleaning up Channel Compliance expansion state after PDF error...');
        setDetailedBreakdowns(prev => ({ ...prev, channelCompliance: false }));
      }
    }
  };



  const handleDownloadUIPDF = async () => {
    // **UPDATED**: Use middleware endpoint for PDF download instead of client-side generation
    // Middleware handles PDF generation at /download-analysis-pdf/{analysis_id}
    
    if (!currentAnalysisId) {
      console.warn('⚠️ No analysis ID available for PDF download. Using fallback client-side generation.');
      // Fallback to client-side PDF if no analysis ID (for backward compatibility)
      if (!analysisResults && !geminiResults) {
        console.log('❌ No analysis results to download');
        setSaveStatus('No analysis available. Please run an analysis first.');
        return;
      }
      // Continue with client-side generation as fallback
    } else {
      // **PRIMARY**: Download PDF from middleware endpoint
      try {
        console.log('📥 Downloading PDF from middleware endpoint for analysis:', currentAnalysisId);
        const API_BASE_URL = ENV_CONFIG.PYTHON_API_URL;
        const downloadUrl = `${API_BASE_URL}/download-analysis-pdf/${currentAnalysisId}`;
        
        // Trigger download by opening URL (middleware returns PDF file)
        window.open(downloadUrl, '_blank');
        console.log('✅ PDF download initiated from middleware');
        setSaveStatus('PDF download started');
        return;
      } catch (error) {
        console.error('❌ Error downloading PDF from middleware:', error);
        setSaveStatus('Failed to download PDF. Please try again.');
        // Fallback to client-side generation
      }
    }

    // **FALLBACK**: Client-side PDF generation (only if middleware download fails or no analysis ID)
    console.log('📸 Falling back to client-side PDF generation...');
    
    // **CRITICAL**: Save analysis state BEFORE any download processing
    console.log('💾 EXPLICIT state save before download processing...');
    saveAnalysisState();

    // Store current states
    const originalCollapsedCards = { ...collapsedCards };
    const originalDetailedBreakdowns = { ...detailedBreakdowns };
    try {
      console.log('📸 Starting individual scorecard PDF generation...');
      // Show loading message
      const loadingMessage = document.createElement('div');
      loadingMessage.id = 'pdf-loading-message';
      loadingMessage.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 20px;
        border-radius: 10px;
        z-index: 10000;
        text-align: center;
        font-family: Arial, sans-serif;
      `;
      loadingMessage.innerHTML = '📄 Generating PDF...<br><small>Expanding cards and capturing content</small>';
      document.body.appendChild(loadingMessage);
      // Step 1: Expand all cards and show detailed breakdowns
      expandAllCards();
      // Wait for UI to update and ensure all dropdowns are expanded
      await new Promise(resolve => setTimeout(resolve, 1500));
      // Additional step to ensure all dropdowns and details are expanded
      const detailButtons = document.querySelectorAll('button');
      detailButtons.forEach(button => {
        const buttonText = button.textContent?.toLowerCase() || '';
        if (buttonText.includes('show details') || 
            buttonText.includes('show more') || 
            buttonText.includes('expand') ||
            button.getAttribute('aria-expanded') === 'false') {
          try {
            button.click();
          } catch (e) {
            console.log('Could not click button:', e);
          }
        }
      });
      // Wait again for expansion animations
      await new Promise(resolve => setTimeout(resolve, 500));
      // Step 2: Find all individual scorecards and ensure they're visible
      const scorecardsNodeList = document.querySelectorAll('[data-scorecard]');
      if (scorecardsNodeList.length === 0) {
        throw new Error('No scorecards found');
      }
      console.log(`📊 Found ${scorecardsNodeList.length} scorecards to capture`);
      // Make sure all scorecards are properly expanded and visible
      scorecardsNodeList.forEach((card, index) => {
        const cardTitle = card.getAttribute('data-card-title') || `Card ${index + 1}`;
        console.log(`📋 Preparing ${cardTitle} for capture...`);
        // Ensure card is fully expanded
        card.style.height = 'auto';
        card.style.maxHeight = 'none';
        card.style.overflow = 'visible';
        card.style.transform = 'none';
        card.style.transition = 'none';
      });
      
      // Step 2.5: PDF auto-expansion removed - no longer needed
      console.log('🎯 PDF auto-expansion feature removed - Channel Compliance will remain in user-controlled state');
      
      // Wait for React state to update, then force DOM expansion
      setTimeout(() => {
        const forceAllExpansions = () => {
          console.log('🎯 Executing automatic expansion for PDF generation...');
          
          // Find Channel Compliance elements
          const channelElements = document.querySelectorAll('[data-scorecard="channelCompliance"], [data-card-title*="Channel"]');
          console.log(`🎯 Found ${channelElements.length} Channel Compliance elements`);
          
          channelElements.forEach((el, index) => {
            console.log(`🎯 Processing Channel Compliance element ${index} for PDF`);
            
            // Click all expand buttons
            const buttons = el.querySelectorAll('button');
            buttons.forEach((btn, btnIndex) => {
              const btnText = (btn.textContent || '').toLowerCase();
              if (btnText.includes('show details') || btnText.includes('expand') || btnText.includes('show')) {
                try {
                  btn.click();
                  console.log(`✅ PDF: Clicked Channel Compliance button ${btnIndex}: "${btn.textContent}"`);
                } catch (e) {
                  console.log(`❌ PDF: Could not click Channel Compliance button ${btnIndex}:`, e);
                }
              }
            });
            
            // Force main section visibility
            el.style.height = 'auto';
            el.style.maxHeight = 'none';
            el.style.overflow = 'visible';
            el.style.transform = 'none';
            el.style.transition = 'none';
            el.style.display = 'block';
            el.style.visibility = 'visible';
            el.style.opacity = '1';
            el.setAttribute('aria-expanded', 'true');
            el.setAttribute('aria-hidden', 'false');
            
            // Platform sections are now always visible, no need for complex dropdown expansion
            
            // Find and expand the details div specifically
            const detailsDiv = el.querySelector('[style*="background: #f8fafc"]');
            if (detailsDiv) {
              detailsDiv.style.display = 'block';
              detailsDiv.style.visibility = 'visible';
              detailsDiv.style.opacity = '1';
              detailsDiv.style.height = 'auto';
              detailsDiv.style.maxHeight = 'none';
              detailsDiv.style.overflow = 'visible';
              console.log('✅ PDF: Forced Channel Compliance details div to be visible');
            }
            
            // Force all hidden elements to be visible
            const hiddenElements = el.querySelectorAll('[style*="display: none"], .hidden, [aria-hidden="true"]');
            hiddenElements.forEach(hiddenEl => {
              hiddenEl.style.display = 'block';
              hiddenEl.style.visibility = 'visible';
              hiddenEl.style.opacity = '1';
              hiddenEl.setAttribute('aria-hidden', 'false');
              console.log('✅ PDF: Made hidden element visible');
            });
          });
          
          console.log('🎯 PDF: All Channel Compliance expansions completed automatically');
        };
        
        // Execute expansion with multiple timing attempts
        forceAllExpansions();
        setTimeout(forceAllExpansions, 500);
        setTimeout(forceAllExpansions, 1000);
        setTimeout(forceAllExpansions, 1500);
        setTimeout(forceAllExpansions, 2000);
      }, 100);
      // Use html2pdf.js for robust full-page rendering
      await new Promise((resolve, reject) => {
        if (window.html2pdf) return resolve();
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load html2pdf.js'));
        document.body.appendChild(s);
      });

      // Build temporary container of all scorecards with page breaks
      const a4WidthPx = 794; // approx A4 width at 96 dpi
      const container = document.createElement('div');
      container.style.width = `${a4WidthPx}px`;
      container.style.boxSizing = 'border-box';
      container.style.margin = '0 auto';

      // Cover page (first page) with centered image and titles
      const cover = document.createElement('div');
      cover.style.padding = '32px';
      cover.style.display = 'flex';
      cover.style.flexDirection = 'column';
      cover.style.alignItems = 'center';
      cover.style.justifyContent = 'center';
      cover.style.height = '100%';
      cover.style.minHeight = '1000px';
      cover.style.textAlign = 'center';

      const titleEl = document.createElement('h1');
      titleEl.textContent = 'Incivus Analysis Report';
      titleEl.style.margin = '0 0 8px 0';
      titleEl.style.fontSize = '28px';
      titleEl.style.color = '#1f2937';
      cover.appendChild(titleEl);

      const subTitleEl = document.createElement('h2');
      subTitleEl.textContent = (adTitle || 'Advertisement');
      subTitleEl.style.margin = '0 0 16px 0';
      subTitleEl.style.fontSize = '20px';
      subTitleEl.style.color = '#6b7280';
      cover.appendChild(subTitleEl);

      if (filePreview) {
        const imgEl = document.createElement('img');
        imgEl.src = filePreview;
        imgEl.style.maxWidth = '85%';
        imgEl.style.height = 'auto';
        imgEl.style.display = 'block';
        imgEl.style.margin = '16px auto'; // center perfectly
        imgEl.style.borderRadius = '8px';
        imgEl.style.boxShadow = '0 6px 24px rgba(0,0,0,0.15)';
        cover.appendChild(imgEl);
      }

      const metaEl = document.createElement('div');
      metaEl.style.marginTop = '16px';
      metaEl.style.fontSize = '12px';
      metaEl.style.color = '#9ca3af';
      metaEl.textContent = `Generated on ${new Date().toLocaleString()}`;
      cover.appendChild(metaEl);

      // Ensure a page break after the cover
      const coverWrapper = document.createElement('div');
      coverWrapper.style.pageBreakAfter = 'always';
      coverWrapper.appendChild(cover);
      container.appendChild(coverWrapper);

      const addPageBreak = () => {
        const sep = document.createElement('div');
        sep.style.pageBreakAfter = 'always';
        sep.style.height = '1px';
        container.appendChild(sep);
      };

      const normalizeClone = (root) => {
        // Ensure nothing is clipped in the clone
        const all = [root, ...Array.from(root.querySelectorAll('*'))];
        all.forEach(el => {
          el.style.overflow = 'visible';
          el.style.maxHeight = 'none';
          el.style.height = el.style.height === '' ? '' : 'auto';
          el.style.transform = 'none';
        });
      };

      // Iterate each scorecard and handle special cases
      for (const [idx, card] of Array.from(scorecardsNodeList).entries()) {
        const key = card.getAttribute('data-scorecard');
        if (key === 'channelCompliance') {
          // Capture one page per platform option by switching platform selection in the live DOM
          const updatedCard = document.querySelector('[data-scorecard="channelCompliance"]') || card;
          const select = updatedCard.querySelector('select');
          let platformLabels = [];
          if (select && select.options && select.options.length > 0) {
            platformLabels = Array.from(select.options).map(o => o.textContent || o.value);
          } else {
            // Try dropdown-menus (button + list items)
            const toggleBtn = updatedCard.querySelector('button, [role="button"]');
            if (toggleBtn) {
              try { toggleBtn.click(); await new Promise(r => setTimeout(r, 200)); } catch {}
              const optionNodes = Array.from(updatedCard.querySelectorAll('li, [role="option"]'));
              platformLabels = optionNodes.map(n => (n.textContent || '').trim()).filter(Boolean);
              // Close dropdown if needed
              try { document.body.click(); } catch {}
            }
          }

          const uniqueLabels = Array.from(new Set(platformLabels));
          if (uniqueLabels.length > 0) {
            for (const label of uniqueLabels) {
              if (select) {
                const idx = Array.from(select.options).findIndex(o => (o.textContent || o.value) === label);
                if (idx >= 0) {
                  select.selectedIndex = idx;
                  select.dispatchEvent(new Event('change', { bubbles: true }));
                }
              } else {
                const toggle = updatedCard.querySelector('button, [role="button"]');
                if (toggle) {
                  try { toggle.click(); await new Promise(r => setTimeout(r, 150)); } catch {}
                  const option = Array.from(updatedCard.querySelectorAll('li, [role="option"]'))
                    .find(n => (n.textContent || '').trim() === label);
                  if (option) { try { option.click(); } catch {} }
                }
              }
              await new Promise(r => setTimeout(r, 350));
              // Expand any inner collapses to reveal guidelines
              const live = document.querySelector('[data-scorecard="channelCompliance"]') || updatedCard;
              live.querySelectorAll('[aria-expanded="false"]').forEach(el => { try { el.click(); } catch {} });
              await new Promise(r => setTimeout(r, 150));
              const clone = live.cloneNode(true);
              normalizeClone(clone);
              const header = document.createElement('div');
              header.style.fontWeight = '700';
              header.style.margin = '8px 0 12px';
              header.textContent = `Channel Compliance — ${label}`;
              const wrapper = document.createElement('div');
              wrapper.style.breakInside = 'avoid';
              wrapper.style.pageBreakInside = 'avoid';
              wrapper.style.margin = '0';
              wrapper.style.padding = '16px';
              wrapper.style.border = '1px solid #eee';
              wrapper.appendChild(header);
              wrapper.appendChild(clone);
              container.appendChild(wrapper);
              addPageBreak();
            }
            continue;
          }
        }

        // Default: clone once and normalize
        const clone = card.cloneNode(true);
        normalizeClone(clone);
        const wrapper = document.createElement('div');
        wrapper.style.breakInside = 'avoid';
        wrapper.style.pageBreakInside = 'avoid';
        wrapper.style.margin = '0 auto';
        wrapper.style.padding = '16px';
        wrapper.style.border = '1px solid #eee';
        wrapper.appendChild(clone);
        container.appendChild(wrapper);
        addPageBreak();
      }

      const filename = `${(adTitle || 'AD_Analysis').replace(/[^a-zA-Z0-9]/g, '_').substring(0,30)}_Scorecards_${new Date().toISOString().slice(0,10)}.pdf`;
      const opt = {
        margin:       [10, 10, 10, 10],
        filename,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollY: -window.scrollY },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak:    { mode: ['css', 'legacy'] }
      };

      // Generate PDF and trigger user download
      await window.html2pdf().set(opt).from(container).save();
      // Additionally, generate a blob to upload to backend storage
      try {
        const worker = window.html2pdf().set(opt).from(container).toPdf();
        const blob = await worker.output('blob');
        
        // **FIX**: Use the stored analysisId from session storage if available
        const storedAnalysisId = sessionStorage.getItem('lastAnalysisId');
        const analysisId = storedAnalysisId || `analysis_${Date.now()}`;
        
        console.log('📤 Uploading PDF to backend storage...', { analysisId, fileName: filename });
        // Convert blob to File object for the new function signature
        const pdfFile = new File([blob], filename, { type: 'application/pdf' });
        const uploadResult = await unifiedApi.uploadAnalysisPdf(currentUser.uid, pdfFile, analysisId, filename);
        console.log('✅ PDF uploaded successfully:', uploadResult);
        
        // **NEW**: Immediately update the database record with the PDF URL
        if (uploadResult?.url) {
          console.log('🔄 Updating database record with PDF URL...');
          
          // **FIX**: Get the stored record details for updating
          const lastAnalysisId = sessionStorage.getItem('lastAnalysisId');
          const lastRecordId = sessionStorage.getItem('lastRecordId');
          
          if (lastAnalysisId && lastRecordId) {
            console.log('🎯 Found stored record details:', { lastAnalysisId, lastRecordId });
            
            // **DIRECT UPDATE**: Update the existing record with PDF URL
            const updateResult = await saveAnalysisRecord({
              userId: currentUser.uid,
              analysisId: lastAnalysisId,
              recordId: lastRecordId,
              pdfUrl: uploadResult.url,
              pdfStoragePath: uploadResult.storagePath,
              url: uploadResult.url, // **CRITICAL**: Set main URL to PDF URL
              fileType: 'application/pdf' // Ensure file type is PDF
            });
            
            console.log('✅ Database record updated with PDF URL:', updateResult);
            
            // Clean up session storage
            sessionStorage.removeItem('lastAnalysisId');
            sessionStorage.removeItem('lastRecordId');
            
            // **TRIGGER**: Force Libraries page refresh
            localStorage.setItem('incivus_new_analysis_added', Date.now().toString());
          } else {
            console.log('⚠️ No stored record details found for PDF update');
          }
        } else {
          console.log('⚠️ No PDF URL returned from upload');
        }
      } catch (e) {
        console.warn('⚠️ Failed to upload PDF to backend:', e);
      }
      
      // Step 3: Capture each scorecard individually using jsPDF
      const pdf = new jsPDF('l', 'mm', 'a4');
      let pageCounter = 0;
      for (let i = 0; i < scorecardsNodeList.length; i++) {
        const scorecard = scorecardsNodeList[i];
        const cardKeyVal = scorecard.getAttribute('data-scorecard');
        const cardTitle = scorecard.getAttribute('data-card-title') || `Scorecard ${i + 1}`;
        console.log(`📸 Capturing ${cardTitle}...`);

        // Helper to normalize scrollable containers to avoid clipping
        const normalizeScrollables = (root) => {
          const scrollables = root.querySelectorAll('[style*="overflow"], .overflow-auto, .overflow-y-auto, .overflow-hidden');
          scrollables.forEach(el => {
            el.style.overflow = 'visible';
            el.style.maxHeight = 'none';
            el.style.height = 'auto';
          });
        };

        // For Channel Compliance: capture one page per platform option (e.g., TikTok, Instagram,...)
        let platformsToCapture = [null];
        const platformSelect = scorecard.querySelector('select');
        if (cardKeyVal === 'channelCompliance' && platformSelect && platformSelect.options && platformSelect.options.length > 0) {
          platformsToCapture = Array.from(platformSelect.options).map((opt, idx) => ({ index: idx, label: opt.textContent || opt.value }));
        }

        for (let p = 0; p < platformsToCapture.length; p++) {
          // If a platform is specified, switch the UI to that option before capture
          if (platformsToCapture[p] && platformSelect) {
            platformSelect.selectedIndex = platformsToCapture[p].index;
            platformSelect.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 400));
          }

          // Add new page for each capture (and title)
          pdf.addPage();
          pageCounter += 1;
          // Minimal header to maximize capture area
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(124, 58, 237);
          const pageTitle = platformsToCapture[p]?.label ? `${cardTitle} — ${platformsToCapture[p].label}` : cardTitle;
          pdf.text(pageTitle, 105, 6, { align: 'center' });

          try {
            // Ensure full content is visible
            scorecard.scrollIntoView({ behavior: 'instant', block: 'center' });
            await new Promise(resolve => setTimeout(resolve, 300));
            normalizeScrollables(scorecard);

            const rect = scorecard.getBoundingClientRect();
            const actualWidth = scorecard.offsetWidth;
            const actualHeight = scorecard.offsetHeight;
            const scrollWidth = scorecard.scrollWidth;
            const scrollHeight = scorecard.scrollHeight;
            const captureWidth = Math.max(actualWidth, scrollWidth);
            const captureHeight = Math.max(actualHeight, scrollHeight);

            const canvas = await html2canvas(scorecard, {
              scale: 1.5, // Reduced scale for better performance and fit
              useCORS: true,
              allowTaint: true,
              backgroundColor: '#ffffff',
              width: captureWidth,
              height: captureHeight,
              scrollX: 0,
              scrollY: 0,
              x: 0,
              y: 0,
              windowWidth: Math.max(captureWidth + 200, 1400), // Wider capture window
              windowHeight: Math.max(captureHeight + 100, 1000), // Taller capture window
              removeContainer: false,
              foreignObjectRendering: false,
              logging: false,
              onclone: (clonedDoc) => {
                // Try multiple selectors to find the cloned card
                let clonedCard = clonedDoc.querySelector(`[data-scorecard="${cardKeyVal}"]`);
                
                // Fallback: try finding by data-card-title
                if (!clonedCard && cardTitle) {
                  clonedCard = clonedDoc.querySelector(`[data-card-title="${cardTitle}"]`);
                }
                
                // Fallback: try finding any element with scorecard-like classes
                if (!clonedCard) {
                  const candidates = clonedDoc.querySelectorAll('[data-scorecard], .scorecard, [class*="scorecard"]');
                  for (const candidate of candidates) {
                    const keyAttr = candidate.getAttribute('data-scorecard');
                    if (keyAttr === cardKeyVal) {
                      clonedCard = candidate;
                      break;
                    }
                  }
                }
                
                if (clonedCard) {
                  console.log(`✅ Found cloned card for ${cardKeyVal}`);
                  clonedCard.style.height = 'auto';
                  clonedCard.style.overflow = 'visible';
                  clonedCard.style.maxHeight = 'none';
                  clonedCard.style.transform = 'none';
                  clonedCard.style.margin = '0';
                  clonedCard.style.padding = '1.5rem';
                  clonedCard.style.width = '100%';
                  clonedCard.style.boxSizing = 'border-box';
                  normalizeScrollables(clonedCard);
                  // Expand hidden/collapsed content
                  clonedCard.querySelectorAll('[aria-expanded="false"]').forEach(el => el.setAttribute('aria-expanded', 'true'));
                  clonedCard.querySelectorAll('[style*="display: none"], .hidden, .collapsed').forEach(el => {
                    el.style.display = 'block';
                    el.style.visibility = 'visible';
                    el.style.opacity = '1';
                  });
                  // If a select exists, set it to the current platform in the clone too
                  const clonedSelect = clonedCard.querySelector('select');
                  if (clonedSelect && platformsToCapture[p] && typeof platformsToCapture[p].index === 'number') {
                    clonedSelect.selectedIndex = platformsToCapture[p].index;
                  }
                } else {
                  console.warn(`⚠️ Could not find cloned card for ${cardKeyVal}. Available cards:`, 
                    Array.from(clonedDoc.querySelectorAll('[data-scorecard]')).map(el => el.getAttribute('data-scorecard'))
                  );
                }
              }
            });

            // Enhanced PDF generation with better centering and page fitting
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            
            // PDF page dimensions (A4: 210mm x 297mm)
            const pageWidthMm = pdf.internal.pageSize.getWidth();   // 210mm
            const pageHeightMm = pdf.internal.pageSize.getHeight(); // 297mm
            const marginMm = 15; // Increased margin for better appearance
            const titleHeightMm = 15; // Space reserved for title
            
            // Available space for content
            const availableWidthMm = pageWidthMm - (marginMm * 2);   // 180mm
            const availableHeightMm = pageHeightMm - titleHeightMm - (marginMm * 2); // ~267mm
            
            console.log(`📏 PDF Dimensions: ${pageWidthMm}mm x ${pageHeightMm}mm`);
            console.log(`📏 Image Dimensions: ${imgWidth}px x ${imgHeight}px`);
            console.log(`📏 Available Space: ${availableWidthMm}mm x ${availableHeightMm}mm`);
            
            // Calculate optimal image dimensions to fit page while maintaining aspect ratio
            const imgAspectRatio = imgWidth / imgHeight;
            const pageAspectRatio = availableWidthMm / availableHeightMm;
            
            let finalWidthMm, finalHeightMm;
            let shouldRotate = false;
            
            // Check if the image would fit better rotated 90 degrees
            const rotatedAspectRatio = imgHeight / imgWidth;
            const widthFitScale = availableWidthMm / imgWidth;
            const heightFitScale = availableHeightMm / imgHeight;
            const rotatedWidthFitScale = availableWidthMm / imgHeight;
            const rotatedHeightFitScale = availableHeightMm / imgWidth;
            
            const normalScale = Math.min(widthFitScale, heightFitScale);
            const rotatedScale = Math.min(rotatedWidthFitScale, rotatedHeightFitScale);
            
            // Use rotation if it gives significantly better scale (20% improvement)
            if (rotatedScale > normalScale * 1.2) {
              shouldRotate = true;
              console.log('📐 Rotating image 90° for better fit:', { normalScale, rotatedScale });
              finalWidthMm = Math.min(availableWidthMm * 0.95, imgHeight * rotatedScale * 0.95);
              finalHeightMm = Math.min(availableHeightMm * 0.95, imgWidth * rotatedScale * 0.95);
            } else {
              if (imgAspectRatio > pageAspectRatio) {
                // Image is wider relative to page - constrain by width
                finalWidthMm = availableWidthMm * 0.95; // Use 95% of available width
                finalHeightMm = finalWidthMm / imgAspectRatio;
              } else {
                // Image is taller relative to page - constrain by height
                finalHeightMm = availableHeightMm * 0.95; // Use 95% of available height
                finalWidthMm = finalHeightMm * imgAspectRatio;
              }
            }
            
            // Center the image on the page
            const xMm = (pageWidthMm - finalWidthMm) / 2;
            const yMm = titleHeightMm + ((availableHeightMm - finalHeightMm) / 2);
            
            console.log(`📍 Image Placement: ${finalWidthMm.toFixed(1)}mm x ${finalHeightMm.toFixed(1)}mm at (${xMm.toFixed(1)}, ${yMm.toFixed(1)})`);
            
            // Check if image fits on single page
            if (finalHeightMm <= availableHeightMm) {
              // Single page - perfect fit
              const imgData = canvas.toDataURL('image/png', 1.0);
              
              if (shouldRotate) {
                // Rotate the PDF page and adjust positioning
                pdf.addImage(imgData, 'PNG', xMm, yMm, finalWidthMm, finalHeightMm, '', 'NONE', 90);
                console.log('📐 Applied 90° rotation to image in PDF');
              } else {
                pdf.addImage(imgData, 'PNG', xMm, yMm, finalWidthMm, finalHeightMm);
              }
              
              // Add page number
              pdf.setFontSize(8);
              pdf.setTextColor(150, 150, 150);
              pdf.text(`Page ${pageCounter}`, pageWidthMm - 20, pageHeightMm - 10);
              
            } else {
              // Multi-page handling - slice image vertically
              const scaleFactor = finalWidthMm / imgWidth; // pixels to mm conversion
              const sliceHeightMm = availableHeightMm * 0.9; // 90% of page height per slice
              const sliceHeightPx = sliceHeightMm / scaleFactor;
              
              let currentYPx = 0;
              let sliceNumber = 1;
              
              while (currentYPx < imgHeight) {
                if (sliceNumber > 1) {
                pdf.addPage();
                  pageCounter++;
                }
                
                const remainingHeightPx = imgHeight - currentYPx;
                const thisSliceHeightPx = Math.min(sliceHeightPx, remainingHeightPx);
                const thisSliceHeightMm = thisSliceHeightPx * scaleFactor;
                
                // Create slice canvas
                const sliceCanvas = document.createElement('canvas');
                sliceCanvas.width = imgWidth;
                sliceCanvas.height = thisSliceHeightPx;
                const ctx = sliceCanvas.getContext('2d');
                
                // Draw the slice
                ctx.drawImage(canvas, 0, currentYPx, imgWidth, thisSliceHeightPx, 0, 0, imgWidth, thisSliceHeightPx);
                const sliceData = sliceCanvas.toDataURL('image/png', 1.0);
                
                // Center this slice on the page
                const sliceXMm = (pageWidthMm - finalWidthMm) / 2;
                const sliceYMm = titleHeightMm + ((availableHeightMm - thisSliceHeightMm) / 2);
                
                pdf.addImage(sliceData, 'PNG', sliceXMm, sliceYMm, finalWidthMm, thisSliceHeightMm);
                
                // Add page number and slice info
                pdf.setFontSize(8);
                pdf.setTextColor(150, 150, 150);
                pdf.text(`Page ${pageCounter} (${sliceNumber}/${Math.ceil(imgHeight / sliceHeightPx)})`, pageWidthMm - 30, pageHeightMm - 10);
                
                currentYPx += thisSliceHeightPx;
                sliceNumber++;
              }
            }
          } catch (cardError) {
          console.error(`❌ Error capturing ${cardTitle}:`, cardError);
          // Add error message on the page with more details
          pdf.setFontSize(12);
          pdf.setTextColor(255, 0, 0);
          pdf.text('Error capturing this scorecard', 105, 150, { align: 'center' });
          pdf.setFontSize(10);
          pdf.setTextColor(100, 100, 100);
          pdf.text(`Error: ${cardError.message || 'Unknown error'}`, 105, 170, { align: 'center' });
          pdf.text('Please try refreshing the page and generating again', 105, 190, { align: 'center' });
          }
        }
      }
      // Step 4: (Legacy jsPDF save removed; html2pdf already downloaded the file)
    } catch (error) {
      console.error('❌ PDF generation failed:', error);
      // Silently fail without intrusive alerts as requested
    } finally {
      // Remove loading message
      const loadingMessage = document.getElementById('pdf-loading-message');
      if (loadingMessage) {
        document.body.removeChild(loadingMessage);
      }
      // Step 6: Restore original card states
      restoreCardStates(originalCollapsedCards, originalDetailedBreakdowns);
      
      // **CRITICAL**: Save analysis state AFTER download completes
      console.log('💾 EXPLICIT state save after download completion...');
      saveAnalysisState();
    }
  };
  // Render score card with interactive features
  const renderScoreCard = (title, score, icon, cardKey, featureName) => {
    const getScoreColor = (score) => {
      if (score === null || score === undefined) return '#6b7280';
      if (score >= 85) return '#10b981';
      if (score >= 70) return '#f59e0b';
      return '#ef4444';
    };
    
    const getScoreBg = (score) => {
      if (score === null || score === undefined) return '#f3f4f6';
      if (score >= 85) return '#d1fae5';
      if (score >= 70) return '#fef3c7';
      return '#fee2e2';
    };
    
    
    const scoreValue = score || 0;
    const isHovered = hoveredCard === cardKey;
    
    return (
      <div 
        key={cardKey} 
        data-scorecard={cardKey}
        data-card-title={title}
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '1.5rem',
          boxShadow: isHovered 
            ? '0 8px 25px -5px rgba(0, 0, 0, 0.15), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
            : '0 4px 6px rgba(0,0,0,0.05)',
          border: `2px solid ${isHovered ? getScoreColor(scoreValue) : '#e5e7eb'}`,
          marginBottom: '1rem',
          position: 'relative',
          pageBreakInside: 'avoid',
          breakInside: 'avoid',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
        }}
        onMouseEnter={() => setHoveredCard(cardKey)}
        onMouseLeave={() => setHoveredCard(null)}
        onClick={() => toggleDetailedBreakdown(cardKey)}
      >
        {/* Header with Score */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.75rem' 
          }}>
            <h3 style={{
              fontSize: '1.1rem', 
              fontWeight: '600',
              margin: 0,
              color: '#1f2937'
            }}>
              {title}
            </h3>
          </div>
          
          {/* Expand/Collapse Indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <div style={{
              backgroundColor: getScoreBg(scoreValue),
              color: getScoreColor(scoreValue),
              padding: '0.5rem 1rem',
              borderRadius: '20px',
              fontWeight: '700',
              fontSize: '0.9rem'
            }}>
              {scoreValue}/100
            </div>
            <div style={{
              transition: 'transform 0.2s ease',
              transform: detailedBreakdowns[cardKey] ? 'rotate(180deg)' : 'rotate(0deg)',
              color: '#6b7280'
            }}>
              <ChevronDown size={20} />
            </div>
          </div>
        </div>

        {/* Click hint for non-expanded cards */}
        {!detailedBreakdowns[cardKey] && (
          <div style={{
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '0.8rem',
            fontStyle: 'italic',
            marginTop: '0.5rem'
          }}>
            Click to expand details
          </div>
        )}
        {/* Expandable Details Section */}
        <div style={{
          maxHeight: detailedBreakdowns[cardKey] ? '500px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
          marginTop: detailedBreakdowns[cardKey] ? '0.75rem' : '0'
        }}>
          <div style={{
            background: '#f8fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden'
          }}>
            {(() => {
              // Get the detailed analysis content
              let content = '';
              let rawData = null;
              // First try analysisResults
              if (analysisResults?.[cardKey]?.detailedAnalysis) {
                content = analysisResults[cardKey].detailedAnalysis;
              } else {
                // Try Gemini results
                const geminiDetail = extractDetailFromGemini(featureName);
                console.log('🔍 GeminiDetail for', featureName, ':', geminiDetail?.substring(0, 100) + '...');
                if (geminiDetail && !geminiDetail.includes('Detailed analysis will be available')) {
                  content = geminiDetail;
                  console.log('✅ Using geminiDetail for', featureName);
                } else {
                  console.log('❌ GeminiDetail not suitable for', featureName);
                }
              }
              // Get raw data from Gemini for additional metrics
              if (geminiResults?.data) {
                let data = geminiResults.data;
                if (data.data && typeof data.data === 'object') {
                  data = data.data;
                }
                rawData = data;
              }
              // If no content but we have rawData with rawResponse, use that
              if (!content && rawData?.rawResponse) {
                content = cleanMarkdownText(rawData.rawResponse);
              }
              // Additional fallback - try resonatingImpact if no content yet
              if (!content && rawData?.resonatingImpact) {
                content = cleanMarkdownText(rawData.resonatingImpact);
              }
              if (!content && !rawData) {
                return (
                  <div style={{ padding: '1rem', fontStyle: 'italic', opacity: 0.8, color: '#64748b' }}>
                    Detailed analysis will be available after running a comprehensive analysis.
                  </div>
                );
              }
              return (
                <div>
                  {/* Header with score indicator */}
                  <div style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    padding: '0.75rem 1rem',
                    fontWeight: '600',
                    fontSize: '0.9rem'
                  }}>
                    Detailed Breakdown
                  </div>
                  {/* Content area */}
                  <div style={{
                    padding: '1rem',
                    maxHeight: '400px',
                    overflowY: 'auto'
                  }}>
                    {/* Show specific metrics based on card type */}
                                        {rawData && cardKey === 'brandCompliance' && (
                      <div style={{ 
                        marginBottom: '1rem',
                        padding: '0.75rem',
                        background: '#dcfce7',
                        borderRadius: '8px',
                        border: '1px solid #10b981'
                      }}>
                        <div style={{ fontSize: '0.875rem', color: '#064e3b', lineHeight: '1.6' }}>
                          {/* Show actual comprehensive analysis data */}
                          {rawData.rawResults?.brand_compliance?.compliance_analysis ? (
                            <>
                              {rawData.rawResults.brand_compliance.compliance_analysis.questions?.map((question, index) => (
                                <div key={index} style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center', 
                                  padding: '0.25rem 0',
                                  borderBottom: '1px solid #e5e7eb'
                                }}>
                                  <span style={{ fontSize: '0.8rem' }}>{question}</span>
                                  <span style={{ 
                                    fontWeight: 'bold', 
                                    color: rawData.rawResults.brand_compliance.compliance_analysis.llm_answers?.[index] === 'Yes' ? '#10b981' : '#ef4444',
                                    padding: '0.125rem 0.25rem',
                                    borderRadius: '3px',
                                    background: rawData.rawResults.brand_compliance.compliance_analysis.llm_answers?.[index] === 'Yes' ? '#dcfce7' : '#fee2e2',
                                    fontSize: '0.75rem'
                                  }}>
                                    {rawData.rawResults.brand_compliance.compliance_analysis.llm_answers?.[index] || 'No'}
                                  </span>
                        </div>
                              ))}
                              <div style={{ marginTop: '0.5rem' }}>
                                <strong>Compliance Level:</strong> {rawData.rawResults.brand_compliance.compliance_level || 'Low'}
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Brand Presence:</strong> {rawData.brandCompliance?.brandPresence || 'Unknown'}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Color Psychology:</strong> {rawData.brandCompliance?.colorPsychology || 'Unknown'}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Typography:</strong> {rawData.brandCompliance?.typography || 'Unknown'}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Logo Present:</strong> {rawData.brandCompliance?.logo?.present ? 'Yes' : 'No'}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {rawData && cardKey === 'messagingIntent' && (
                      <div style={{ 
                        marginBottom: '1rem',
                        padding: '0.75rem',
                        background: '#dcfce7',
                        borderRadius: '8px',
                        border: '1px solid #10b981'
                      }}>
                        <div style={{ fontSize: '0.875rem', color: '#064e3b', lineHeight: '1.6' }}>
                          {/* Show actual comprehensive analysis data */}
                          {rawData.rawResults?.metaphor_analysis?.message_intent ? (
                            <>
                              <div style={{ marginBottom: '0.75rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Message Submitted:</strong> {messageIntent || rawData.messagingIntent?.messagingSubmitted || rawData.rawResults?.metaphor_analysis?.message_intent?.user_message || 'No message provided'}
                              </div>
                              <div style={{ marginBottom: '0.75rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Incivus Inferred Messaging:</strong> {rawData.rawResults.metaphor_analysis.message_intent.core_message_summary || 'No clear message identified'}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Emotional Tone:</strong> {rawData.rawResults.metaphor_analysis.message_intent.emotional_tone || 'Neutral'}
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Clarity:</strong> {rawData.messagingIntent?.clarity || 'Unknown'}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>CTA Strength:</strong> {rawData.messagingIntent?.ctaStrength || 'Unknown'}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Emotional Tone:</strong> {rawData.messagingIntent?.emotionalTone || 'Unknown'}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Message Type:</strong> {rawData.messagingIntent?.type || 'Unknown'}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {rawData && cardKey === 'channelCompliance' && (
                      <div style={{ 
                        marginBottom: '1rem',
                        padding: '0.75rem',
                        background: '#dcfce7',
                        borderRadius: '8px',
                        border: '1px solid #10b981'
                      }}>
                        <div style={{ fontSize: '0.875rem', color: '#064e3b', lineHeight: '1.6' }}>
                          {/* Show actual comprehensive analysis data */}
                          {rawData.rawResults?.channel_compliance ? (
                            <>
                              {Object.entries(rawData.rawResults.channel_compliance).map(([platform, data]) => (
                                data && typeof data === 'object' && data.compliance_score !== undefined && (
                                  <div key={platform} style={{ marginBottom: '1rem' }}>
                                    <div style={{ 
                                      fontWeight: '600', 
                                      marginBottom: '0.5rem', 
                                      color: '#0e7490',
                                      padding: '0.5rem',
                                      background: 'white',
                                      borderRadius: '4px',
                                      border: '1px solid #e5e7eb'
                                    }}>
                                      <span>{platform.toUpperCase()}: <span style={{ color: '#000000', fontWeight: 'bold' }}>{data.compliance_score}</span></span>
                                    </div>
                                    {data.guideline_results && (
                                      <div style={{ 
                                        display: 'block',
                                        fontSize: '0.8rem', 
                                        marginLeft: '0.5rem',
                                        padding: '0.5rem',
                                        background: '#f8fafc',
                                        borderRadius: '4px'
                                      }}>
                                        <div style={{ marginBottom: '0.5rem' }}>
                                          <strong>Guidelines:</strong> <span style={{ color: '#000000', fontWeight: 'bold' }}>{data.total_guidelines || 0}</span> checked, <span style={{ color: '#000000', fontWeight: 'bold' }}>{data.total_matched_scores || 0}</span> passed
                                        </div>
                                        {data.guideline_results.map((guideline, idx) => (
                                          <div key={idx} style={{ 
                                            marginTop: '0.25rem', 
                                            padding: '0.25rem', 
                                            background: guideline.matched_score > 0 ? '#dcfce7' : '#fee2e2',
                                            borderRadius: '3px',
                                            fontSize: '0.75rem'
                                          }}>
                                            <div><strong>Rule:</strong> {guideline.guideline}</div>
                                            <div><strong>Result:</strong> {guideline.actual_output}</div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              ))}
                            </>
                          ) : (
                            <>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Platform Optimization:</strong> {rawData.channelCompliance?.platformOptimization || 'Unknown'}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Format Compliance:</strong> {rawData.channelCompliance?.formatCompliance || 'Unknown'}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Content Guidelines:</strong> {rawData.channelCompliance?.contentGuidelines || 'Unknown'}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Performance Score:</strong> <span style={{ color: '#000000', fontWeight: 'bold' }}>{rawData.channelCompliance?.performanceScore || 0}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {rawData && cardKey === 'purchaseIntent' && (
                          <div style={{ 
                            marginBottom: '1rem',
                            padding: '0.75rem',
                            background: '#dcfce7',
                            borderRadius: '8px',
                            border: '1px solid #10b981'
                          }}>
                            <div style={{ fontSize: '0.875rem', color: '#064e3b', lineHeight: '1.6' }}>
                          {/* Show actual comprehensive analysis data */}
                          {rawData.rawResults?.content_analysis?.purchase_intent_scores ? (
                            <>
                              {/* REORDERED: Show Overall Score and Resonating Impact FIRST */}
                              <div style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid #10b981' }}>
                                <div style={{ paddingLeft: '1rem', position: 'relative' }}>
                                  <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                  <strong>Overall Purchase Intent:</strong> <span style={{ color: '#000000', fontWeight: 'bold' }}>{rawData.rawResults.content_analysis.overall_purchase_intent_percentage || scoreValue}%</span>
                                </div>
                              </div>
                              <div style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #10b981' }}>
                                <div style={{ paddingLeft: '1rem', position: 'relative' }}>
                                  <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                  <strong>Resonating Impact:</strong>
                                </div>
                                <div style={{ marginLeft: '1rem', marginTop: '0.25rem', fontSize: '0.8rem', lineHeight: '1.5' }}>
                                  {rawData.rawResults.content_analysis.resonating_impact || 'No resonance analysis available'}
                                </div>
                              </div>
                              {/* Purchase Intent Breakdown */}
                              <div style={{ marginBottom: '0.5rem', fontWeight: '600', color: '#064e3b' }}>
                                Purchase Intent Breakdown:
                              </div>
                              <div style={{ marginBottom: '0.75rem' }}>
                                <div style={{ paddingLeft: '1rem', position: 'relative' }}>
                                  <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                  <strong>Message Clarity:</strong> <span style={{ color: '#000000', fontWeight: 'bold' }}>{rawData.rawResults.content_analysis.purchase_intent_scores.message_clarity?.percentage || 0}%</span>
                                </div>
                                <div style={{ marginLeft: '1rem', marginTop: '0.25rem', fontSize: '0.8rem', fontStyle: 'italic', color: '#475569' }}>
                                  {rawData.rawResults.content_analysis.purchase_intent_scores.message_clarity?.description?.replace(/^Message clarity - /i, '') || 'No description'}
                                </div>
                              </div>
                              <div style={{ marginBottom: '0.75rem' }}>
                                <div style={{ paddingLeft: '1rem', position: 'relative' }}>
                                  <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                  <strong>Emotional Appeal:</strong> <span style={{ color: '#000000', fontWeight: 'bold' }}>{rawData.rawResults.content_analysis.purchase_intent_scores.emotional_appeal?.percentage || 0}%</span>
                                </div>
                                <div style={{ marginLeft: '1rem', marginTop: '0.25rem', fontSize: '0.8rem', fontStyle: 'italic', color: '#475569' }}>
                                  {rawData.rawResults.content_analysis.purchase_intent_scores.emotional_appeal?.description?.replace(/^Emotional appeal - /i, '') || 'No description'}
                                </div>
                              </div>
                              <div style={{ marginBottom: '0.75rem' }}>
                                <div style={{ paddingLeft: '1rem', position: 'relative' }}>
                                  <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                  <strong>Relevance:</strong> <span style={{ color: '#000000', fontWeight: 'bold' }}>{rawData.rawResults.content_analysis.purchase_intent_scores.relevance?.percentage || 0}%</span>
                                </div>
                                <div style={{ marginLeft: '1rem', marginTop: '0.25rem', fontSize: '0.8rem', fontStyle: 'italic', color: '#475569' }}>
                                  {rawData.rawResults.content_analysis.purchase_intent_scores.relevance?.description?.replace(/^Relevance - /i, '') || 'No description'}
                                </div>
                              </div>
                              <div style={{ marginBottom: '0.75rem' }}>
                                <div style={{ paddingLeft: '1rem', position: 'relative' }}>
                                  <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                  <strong>CTA Strength:</strong> <span style={{ color: '#000000', fontWeight: 'bold' }}>{rawData.rawResults.content_analysis.purchase_intent_scores.cta_strength?.percentage || 0}%</span>
                                </div>
                                <div style={{ marginLeft: '1rem', marginTop: '0.25rem', fontSize: '0.8rem', fontStyle: 'italic', color: '#475569' }}>
                                  {rawData.rawResults.content_analysis.purchase_intent_scores.cta_strength?.description?.replace(/^(Visual or verbal )?CTA strength - /i, '') || 'No description'}
                                </div>
                              </div>
                              <div style={{ marginBottom: '0.75rem' }}>
                                <div style={{ paddingLeft: '1rem', position: 'relative' }}>
                                  <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                  <strong>Psychological Triggers:</strong> <span style={{ color: '#000000', fontWeight: 'bold' }}>{rawData.rawResults.content_analysis.purchase_intent_scores.psychological_triggers?.percentage || 0}%</span>
                                </div>
                                <div style={{ marginLeft: '1rem', marginTop: '0.25rem', fontSize: '0.8rem', fontStyle: 'italic', color: '#475569' }}>
                                  {rawData.rawResults.content_analysis.purchase_intent_scores.psychological_triggers?.description?.replace(/^Use of psychological or persuasive triggers - /i, '') || 'No description'}
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Action Potential:</strong> {cleanMarkdownText(rawData.purchaseIntent?.actionPotential || 'No call to action present')}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Motivation Level:</strong> {cleanMarkdownText(rawData.purchaseIntent?.motivationLevel || 'Limited emotional appeal')}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Conversion Likelihood:</strong> <span style={{ color: '#000000', fontWeight: 'bold' }}>{rawData.purchaseIntent?.conversionLikelihood || 0}</span>
                              </div>
                            </>
                          )}
                            </div>
                          </div>
                    )}
                    {rawData && cardKey === 'funnelCompatibility' && (
                      <div style={{ 
                        marginBottom: '1rem',
                        padding: '0.75rem',
                        background: '#dcfce7',
                        borderRadius: '8px',
                        border: '1px solid #10b981'
                      }}>
                        <div style={{ fontSize: '0.875rem', color: '#064e3b', lineHeight: '1.6' }}>
                          {/* Show actual comprehensive analysis data */}
                          {rawData.rawResults?.metaphor_analysis?.funnel_compatibility ? (
                            <>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Incivus Classification:</strong> {rawData.rawResults.metaphor_analysis.funnel_compatibility.classification || 'Unknown'}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>User Selected Type:</strong> {rawData.rawResults.metaphor_analysis.funnel_compatibility.user_selected_type || 'Not specified'}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Match Status:</strong> {rawData.rawResults.metaphor_analysis.funnel_compatibility.match_with_user_selection || rawData.rawResults.metaphor_analysis.funnel_compatibility.match || 'Unknown'}
                              </div>
                              <div style={{ marginBottom: '0.75rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Reason for Incivus Classification:</strong> {rawData.rawResults.metaphor_analysis.funnel_compatibility.reasoning || 'No reasoning provided'}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Improvement Suggestions:</strong> {rawData.rawResults.metaphor_analysis.funnel_compatibility.improvement_suggestion || 'No suggestions available'}
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Target Stage:</strong> {rawData.funnelCompatibility?.stage || 'Unknown'}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Conversion Potential:</strong> {rawData.funnelCompatibility?.conversionPotential || 'Unknown'}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Urgency Elements:</strong> {rawData.funnelCompatibility?.urgencyElements || 'Unknown'}
                              </div>
                              <div style={{ marginBottom: '0.5rem', paddingLeft: '1rem', position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 0, top: '0.5rem', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                <strong>Scarcity Triggers:</strong> {rawData.funnelCompatibility?.scarcityTriggers || 'Unknown'}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Show card-specific recommendations */}
                    {(() => {
                      // Check for Gemini recommendations - only show on the first card to avoid duplication
                      const shouldShowGeminiRecommendations = (cardKey) => {
                        // Only show global recommendations on the brand compliance card to avoid showing same recommendations on every card
                        return cardKey === 'brandCompliance';
                      };
                      if (shouldShowGeminiRecommendations(cardKey)) {
                        const geminiRecommendations = rawData?.recommendations;
                        if (geminiRecommendations && Array.isArray(geminiRecommendations) && geminiRecommendations.length > 0) {
                          // Clean up numbering format and text
                          const cleanedRecommendations = geminiRecommendations.map(rec => {
                            let cleaned = cleanMarkdownText(rec);
                            // Remove duplicate numbering like "1. 1." -> "1."
                            cleaned = cleaned.replace(/^\d+\.\s*\d+\.\s*/, '');
                            // Remove leading numbers if they exist
                            cleaned = cleaned.replace(/^\d+\.\s*/, '');
                            return cleaned;
                          });
                          return (
                            <div style={{
                              marginTop: '1rem',
                              padding: '0.75rem',
                              background: '#f9fafb',
                              borderRadius: '8px',
                              border: '1px solid #d1d5db'
                            }}>
                              <div style={{ fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>💡 Recommendations:</div>
                              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                {cleanedRecommendations.map((rec, index) => (
                                  <div key={index} style={{ marginBottom: '0.5rem' }}>
                                    {index + 1}. {rec}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }
                      }
                      // Don't show fallback recommendations - only show when provided by analysis
                      return null;
                    })()}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
        
        {!isCardAccessible(cardKey) && (
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
            background: 'rgba(103, 126, 234, 1.0)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
            alignItems: 'center',
        borderRadius: '12px',
            textAlign: 'center'
          }}>
            <Lock size={24} style={{ color: 'white', marginBottom: '0.5rem' }} />
            <p style={{ margin: 0, fontWeight: '600', color: 'white' }}>
              {!hasValidSubscription() ? 'Subscribe to Unlock' : 'Premium Feature'}
            </p>
            <button
              onClick={() => {
                // Store which feature the user is trying to access
                if (cardKey) {
                  localStorage.setItem('incivus_upgrade_feature', cardKey);
                }
                setUserFlow('plan-selection');
              }}
              style={{
                background: 'white',
                color: '#7c3aed',
                border: '2px solid white',
                borderRadius: '6px',
                padding: '0.5rem 1rem',
                fontSize: '0.75rem',
                fontWeight: '600',
        cursor: 'pointer',
                marginTop: '0.5rem'
              }}
            >
              {!hasValidSubscription() ? 'Subscribe Now' : 'Upgrade Plan'}
            </button>
          </div>
        )}
      </div>
    );
  };
  // Test logging function (development only)
  const testLogging = () => {
    if (process.env.NODE_ENV === 'development') {
      Logger.info('Test: Analysis component loaded', { component: 'Analysis', user: currentUser?.email });
      Logger.trackUserAction('Test: Test Logging Button Clicked', { location: 'Analysis' });
      console.log('✅ Logging test completed - check console output');
    }
  };
  // Function to start a new analysis (clear all data)
  const handleNewAnalysis = () => {
    // Directly proceed with clearing data - no warning popup needed
    startNewAnalysisDirectly();
  };

  // Function to actually clear data and start new analysis
  const startNewAnalysisDirectly = () => {
    // Clear all analysis data
    setUploadedFile(null);
    setFilePreview(null);
    setMediaType('image');
    setSelectedChannels([]);
    setFunnelStage('');
    setMessageIntent('');
    setAdTitle('');
    setAdDescription('');
    setAnalysisResults(null);
    setGeminiResults(null);
    setIsAnalyzing(false);
    setLoadingGemini(false);
    setSaveStatus('');
    
    // Reset the file input element to allow selecting the same file again
    const fileInput = document.getElementById('file-upload');
    if (fileInput) {
      fileInput.value = '';
    }
    
    // Clear localStorage analysis state
    clearAnalysisState();
    
    // Refresh subscription data to get latest ad counts
    loadUserData();
    
    // Log the action
    Logger.trackUserAction('New Analysis Started', {
      component: 'Analysis',
      previousAnalysisCompleted: !!(analysisResults || geminiResults),
      userConfirmed: true
    });
    console.log('🔄 New analysis started - all data cleared');
    
    // Optional: Scroll to top to show the upload section
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'transparent',
      padding: '1rem'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
                {/* Main Layout - Left Upload, Right Results */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: analysisResults || geminiResults ? '350px 1fr' : '1fr',
          gap: '2rem',
          alignItems: 'start'
        }}>
          {/* Left Side - Upload Section */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.9) 100%)',
            backdropFilter: 'blur(20px)',
            borderRadius: '20px',
            padding: '1.5rem',
            boxShadow: '0 8px 32px rgba(124, 58, 237, 0.08), 0 1px 3px rgba(124, 58, 237, 0.1)',
            border: '1px solid rgba(124, 58, 237, 0.06)',
            height: 'fit-content'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem'
            }}>
              <h3 style={{
                fontSize: '1.3rem', 
                fontWeight: '700',
                color: '#5b21b6',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <Upload size={20} />
                Upload Ad
              </h3>
              
              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {/* Refresh Data Button */}

                

              </div>
            </div>
              {/* Subscription Status Display - Using same component as Profile page, but in compact mode */}
              <SubscriptionStatus 
                refreshTrigger={subscriptionRefreshTrigger} 
                compact={true} 
                onNavigateToPlanSelection={() => {
                  console.log('🔄 Navigating to plan selection from SubscriptionStatus button');
                  // Store context about why user is being redirected
                  localStorage.setItem('incivus_topup_reason', 'new_subscription');
                  // Navigate to plan selection page
                  setUserFlow('plan-selection');
                }}
              />
              
              {/* Media Type Selection */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Media Type
                </label>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="image"
                      checked={mediaType === 'image'}
                      onChange={(e) => setMediaType(e.target.value)}
                    />
                  Image
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="video"
                      checked={mediaType === 'video'}
                      onChange={(e) => setMediaType(e.target.value)}
                    />
                  Video
                  </label>
                </div>
              </div>

              {/* File Upload Error Display */}
              {fileUploadError && (
                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1rem',
                  fontSize: '0.875rem'
                }}>
                  <div style={{ fontWeight: '600', color: '#dc2626', marginBottom: '0.5rem' }}>
                    ❌ Upload Error
                  </div>
                  <p style={{ margin: 0, color: '#dc2626' }}>
                    {fileUploadError}
                  </p>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#991b1b' }}>
                    Please select a smaller file and try again.
                  </div>
                </div>
              )}

            {/* File Upload */}
              <div style={{ marginBottom: '1rem' }}>
                <input
                  type="file"
                  accept={mediaType === 'image' ? 'image/*' : 'video/*'}
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                id="file-upload"
                />
                <label
                htmlFor="file-upload"
                  style={{
                    display: 'block',
                  width: '100%',
                  minHeight: '200px',
                  border: `2px dashed ${fileUploadError ? '#dc2626' : '#d1d5db'}`,
                  borderRadius: '12px',
                    cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  background: fileUploadError ? '#fef2f2' : (uploadedFile ? '#f9fafb' : 'white'),
                  position: 'relative',
                  overflow: 'hidden'
                  }}
                >
                  {filePreview ? (
                  <div style={{
                    width: '100%',
                    height: '200px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    position: 'relative'
                  }}>
                    {mediaType === 'image' ? (
                        <img 
                          src={filePreview} 
                        alt="Preview"
                          style={{ 
                            maxWidth: '100%', 
                          maxHeight: '100%',
                            objectFit: 'contain',
                          borderRadius: '8px'
                          }} 
                        />
                      ) : (
                                                <video 
                          src={filePreview} 
                          style={{ 
                            maxWidth: '100%', 
                          maxHeight: '100%',
                          objectFit: 'contain',
                            borderRadius: '8px'
                          }}
                          controls
                          preload="metadata"
                          onLoadedMetadata={(e) => {
                            console.log('🎬 Video metadata loaded:', {
                              duration: e.target.duration,
                              videoWidth: e.target.videoWidth,
                              videoHeight: e.target.videoHeight,
                              src: e.target.src?.substring(0, 100) + '...'
                            });
                          }}
                          onError={(e) => {
                            console.error('❌ Video loading error:', e);
                            console.error('❌ Video src:', e.target.src?.substring(0, 100) + '...');
                          }}
                          onCanPlay={() => {
                            console.log('✅ Video can play');
                          }}
                        />
                    )}
                    <div style={{
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      background: 'rgba(0,0,0,0.7)',
                      color: 'white',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem'
                    }}>
                        {uploadedFile?.name}
                    </div>
                    </div>
                  ) : (
                  <div style={{
                    height: '200px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    textAlign: 'center',
                    padding: '1rem'
                  }}>
                      <div style={{ 
                        fontSize: '3rem', 
                        marginBottom: '0.5rem', 
                        color: '#9ca3af',
                        fontWeight: 'bold'
                      }}>
                        +
                      </div>
                    <p style={{ color: '#6b7280', marginBottom: '0.5rem', fontSize: '1.1rem', fontWeight: '500' }}>
                        Click to upload {mediaType === 'image' ? 'image' : 'video'}
                      </p>
                    <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                      Supports JPG, PNG, MP4, MOV files
                      </p>
                    </div>
                  )}
                </label>
                
                {/* File Requirements Info Box */}
                <div style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  background: '#f8f9fa',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.75rem',
                    color: '#6366f1',
                    fontSize: '0.9rem',
                    fontWeight: '600'
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="16" x2="12" y2="12"/>
                      <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    File Requirements
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '1rem',
                    fontSize: '0.875rem',
                    color: '#4b5563'
                  }}>
                    {/* Images Section */}
                    <div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: '0.5rem',
                        fontWeight: '600',
                        color: '#6366f1'
                      }}>
                        Images:
                      </div>
                      <div style={{ paddingLeft: '0', lineHeight: '1.6' }}>
                        <div>- Max size: 10 MB</div>
                        <div>- Formats: JPG, PNG</div>
                      </div>
                    </div>
                    
                    {/* Videos Section */}
                    <div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: '0.5rem',
                        fontWeight: '600',
                        color: '#6366f1'
                      }}>
                        Videos:
                      </div>
                      <div style={{ paddingLeft: '0', lineHeight: '1.6' }}>
                        <div>- Max size: 100 MB</div>
                        <div>- Max duration: 2 minutes</div>
                        <div>- Formats: MP4, MOV</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            {/* Form Fields */}
              {(() => {
                console.log('🔍 Debug form fields rendering:', {
                  uploadedFile: !!uploadedFile,
                  uploadedFileName: uploadedFile?.name,
                  filePreview: !!filePreview,
                  adTitle,
                  selectedChannels,
                  funnelStage,
                  messageIntent
                });
                // Show form fields if we have either a current uploadedFile OR a filePreview from localStorage
                return (uploadedFile || filePreview) && (
                  <>
                    {/* Ad Title */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label style={{ fontWeight: '500' }}>
                          Ad Title *
                        </label>
                        <span style={{
                          fontSize: '0.75rem',
                          color: adTitle.length > 60 ? '#ef4444' : '#6b7280',
                          fontWeight: '500'
                        }}>
                          {adTitle.length}/60
                        </span>
                      </div>
                      <input
                        type="text"
                        value={adTitle}
                        onChange={(e) => {
                          if (e.target.value.length <= 60) {
                            setAdTitle(e.target.value);
                          }
                        }}
                        placeholder="Enter a descriptive title for your Ad"
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: `1px solid ${adTitle.length > 60 ? '#ef4444' : '#d1d5db'}`,
                          borderRadius: '8px',
                          fontSize: '1rem'
                        }}
                      />
                    </div>
                    {/* Channel Selection */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
                          Channel Compliance *
                            <Info
                              size={16}
                            style={{ color: '#6b7280', cursor: 'pointer' }}
                              onClick={() => setShowChannelInfo(!showChannelInfo)}
                            />
                        </label>
                        {selectedChannels && selectedChannels.length > 0 && (
                          <span style={{
                            background: '#7c3aed',
                            color: 'white',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: '500'
                          }}>
                            {selectedChannels.length} selected
                          </span>
                        )}
                      </div>
                      {showChannelInfo && (
                        <div style={{
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          borderRadius: '6px',
                          padding: '0.75rem',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          color: '#1e40af'
                        }}>
                          Select the channels where you plan to run this Ad. Each platform has specific guidelines and best practices.
                        </div>
                      )}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                        gap: '0.5rem'
                      }}>
                        {channels.map(channel => (
                          <label key={channel} style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem',
                            padding: '0.5rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            backgroundColor: selectedChannels.includes(channel) ? '#ede9fe' : 'white',
                            borderColor: selectedChannels.includes(channel) ? '#7c3aed' : '#d1d5db'
                          }}>
                            <input
                              type="checkbox"
                              checked={selectedChannels.includes(channel)}
                              onChange={() => handleChannelChange(channel)}
                              style={{ margin: 0 }}
                            />
                            <span style={{ fontSize: '0.875rem' }}>{channel}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    {/* Funnel Stage */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
                          Funnel Stage *
                            <Info
                              size={16}
                            style={{ color: '#6b7280', cursor: 'pointer' }}
                              onClick={() => setShowFunnelInfo(!showFunnelInfo)}
                            />
                        </label>
                        {funnelStage && funnelStage.length > 0 && (
                          <span style={{
                            background: '#10b981',
                            color: 'white',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: '500'
                          }}>
                            {funnelStage}
                          </span>
                        )}
                      </div>
                      {showFunnelInfo && (
                        <div style={{
                          background: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          borderRadius: '6px',
                          padding: '0.75rem',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          color: '#166534'
                        }}>
                          <strong>Awareness:</strong> Introduce your brand to new audiences<br/>
                          <strong>Consideration:</strong> Nurture interest and build trust<br/>
                          <strong>Conversion:</strong> Drive immediate action and sales
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {funnelStages.map(stage => (
                          <label key={stage} style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem',
                            padding: '0.75rem 1rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            backgroundColor: funnelStage === stage ? '#dcfce7' : 'white',
                            borderColor: funnelStage === stage ? '#10b981' : '#d1d5db',
                            flex: 1,
                            minWidth: '120px'
                          }}>
                            <input
                              type="radio"
                              name="funnelStage"
                              value={stage}
                              checked={funnelStage === stage}
                              onChange={(e) => setFunnelStage(e.target.value)}
                              style={{ margin: 0 }}
                            />
                            <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>{stage}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  {/* Message Intent */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500' }}>
                            Message Intent *
                              <Info
                                size={16}
                              style={{ color: '#6b7280', cursor: 'pointer' }}
                                onClick={() => setShowMessageInfo(!showMessageInfo)}
                              />
                          </label>
                          <span style={{ 
                            color: '#3b82f6', 
                            fontSize: '0.875rem',
                            fontStyle: 'italic'
                          }}>
                            (Write atleast two lines of description about the messaging of the Ad)
                          </span>
                        </div>
                        {messageIntent && messageIntent.trim() !== '' && (
                          <span style={{
                            background: '#f59e0b',
                            color: 'white',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: '500'
                          }}>
                            ✓
                          </span>
                        )}
                      </div>
                      {showMessageInfo && (
                        <div style={{
                          background: '#fefbef',
                          border: '1px solid #fed7aa',
                          borderRadius: '6px',
                          padding: '0.75rem',
                          marginBottom: '0.5rem',
                          fontSize: '0.875rem',
                          color: '#92400e'
                        }}>
                          Describe the main message or goal of your Ad. What action do you want viewers to take?
                        </div>
                      )}
                      <div style={{ position: 'relative' }}>
                        <textarea
                          value={messageIntent}
                          onChange={(e) => {
                            if (e.target.value.length <= 200) {
                              setMessageIntent(e.target.value);
                            }
                          }}
                          placeholder="e.g., Promote summer sale, drive app downloads, increase brand awareness..."
                          style={{
                            width: '100%',
                            minHeight: '80px',
                            padding: '0.75rem',
                            border: `1px solid ${messageIntent.length > 200 ? '#ef4444' : '#d1d5db'}`,
                            borderRadius: '8px',
                            fontSize: '1rem',
                            resize: 'vertical'
                          }}
                        />
                        <div style={{
                          position: 'absolute',
                          bottom: '0.5rem',
                          right: '0.75rem',
                          fontSize: '0.75rem',
                          color: messageIntent.length > 200 ? '#ef4444' : '#6b7280',
                          fontWeight: '500',
                          background: 'white',
                          padding: '0.25rem'
                        }}>
                          {messageIntent.length}/200
                        </div>
                      </div>
                    </div>
                     {/* Validation Message */}
                     {!isFormValid() && (
                       <div style={{
                         background: '#fef3c7',
                         border: '1px solid #f59e0b',
                         borderRadius: '8px',
                         padding: '1rem',
                         marginBottom: '1rem',
                         fontSize: '0.875rem'
                       }}>
                         <div style={{ fontWeight: '600', color: '#92400e', marginBottom: '0.5rem' }}>
                           ! Please complete all required fields:
                         </div>
                         <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#92400e' }}>
                           {!adTitle.trim() && <li>Ad Title</li>}
                           {selectedChannels.length === 0 && <li>Channel Selection</li>}
                           {!funnelStage && <li>Funnel Stage</li>}
                           {!messageIntent.trim() && <li>Message Intent</li>}
                           {!(brandData && brandData.brandId) && <li><strong>Brand Setup (Required)</strong></li>}
                         </ul>
                       </div>
                     )}
                     
                     {/* File Upload Warning */}
                     {!uploadedFile && filePreview && (
                       <div style={{
                         background: '#f0f9ff',
                         border: '1px solid #0ea5e9',
                         borderRadius: '8px',
                         padding: '1rem',
                         marginBottom: '1rem',
                         fontSize: '0.875rem'
                       }}>
                         <div style={{ fontWeight: '600', color: '#0c4a6e', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                           <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', background: '#0ea5e9', color: 'white', fontSize: '12px', fontWeight: 'bold' }}>i</span> File Preview Available
                         </div>
                         <p style={{ margin: 0, color: '#0c4a6e' }}>
                           Your previous file is loaded from memory. To analyze a new file, please upload it again.
                         </p>
                         <button
                           onClick={() => {
                             setFilePreview(null);
                             setAnalysisResults(null);
                             setGeminiResults(null);
                             clearAnalysisState();
                           }}
                           style={{
                             marginTop: '0.5rem',
                             padding: '0.5rem 1rem',
                             background: '#0ea5e9',
                             color: 'white',
                             border: 'none',
                             borderRadius: '6px',
                             cursor: 'pointer',
                             fontSize: '0.875rem'
                           }}
                         >
                           Clear & Upload New File
                         </button>
                       </div>
                     )}
                  </>
                );
              })()}
            {/* Analyze Button */}
              <button
              onClick={handleAnalysis}
              disabled={!isFormValid() || isAnalyzing || loadingGemini || analysisResults || geminiResults}
                style={{
                  width: '100%',
                background: isFormValid() && !isAnalyzing && !loadingGemini && !analysisResults && !geminiResults 
                  ? 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)' 
                  : '#9ca3af',
                  color: 'white',
                  border: 'none',
                padding: '1rem 2rem',
                borderRadius: '12px',
                fontSize: '1.1rem',
                  fontWeight: '600',
                cursor: isFormValid() && !isAnalyzing && !loadingGemini && !analysisResults && !geminiResults ? 'pointer' : 'not-allowed',
                transition: 'all 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
              {isAnalyzing || loadingGemini ? (
                <>
                    <div style={{
                    width: '20px',
                    height: '20px',
                    border: '2px solid #ffffff40',
                    borderTop: '2px solid #ffffff',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                  }} />
                  {loadingGemini ? 'Analyzing Content...' : 'Processing...'}
                </>
              ) : analysisResults || geminiResults ? (
                <>
                  <Check size={20} />
                  Analysis Complete
                </>
              ) : (
                <>
                  <Play size={20} />
                  Analyze Ad
                </>
              )}
              </button>
            {saveStatus && (
                <div style={{ 
                marginTop: '1rem',
                      padding: '0.75rem',
                      borderRadius: '8px',
                textAlign: 'center',
                fontWeight: '500',
                background: saveStatus.includes('successfully') ? '#d1fae5' : '#fee2e2',
                color: saveStatus.includes('successfully') ? '#065f46' : '#991b1b',
                border: saveStatus.includes('successfully') ? '1px solid #a7f3d0' : '1px solid #fecaca'
              }}>
                {saveStatus}
                    </div>
                        )}
          </div>
          {/* Right Side - Analysis Results */}
          {(analysisResults || geminiResults || isAnalyzing || loadingGemini) && (
            <div 
              data-analysis-results 
              style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
            >
              
              

              {/* Analysis Results */}
              {(analysisResults || geminiResults) && !isAnalyzing && !loadingGemini && (
                <div style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '0.75rem 1rem',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem'
                }}>
                  {/* Ad Title */}
                  {adTitle && (
                    <h1 style={{
                      fontSize: '1.8rem',
                      fontWeight: '700',
                      color: '#1f2937',
                      margin: 0,
                      borderBottom: '2px solid #7c3aed',
                      paddingBottom: '0.5rem'
                    }}>
                      {adTitle}
                    </h1>
                  )}

                  {/* Brand Information Box */}
                  {brandData && (
                    <div style={{
                      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '1rem',
                      margin: '0.5rem 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem'
                    }}>
                      {/* Brand Logo */}
                      {brandData.mediaFiles && brandData.mediaFiles.find(file => file.mediaType === 'logo') && (
                        <div style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          border: '2px solid #e2e8f0',
                          flexShrink: 0
                        }}>
                          <img 
                            src={brandData.mediaFiles.find(file => file.mediaType === 'logo')?.url}
                            alt="Brand Logo"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }}
                          />
                        </div>
                      )}
                      
                      {/* Brand Info */}
                      <div style={{ flex: 1 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          marginBottom: '0.25rem'
                        }}>
                          <Building size={16} style={{ color: '#7c3aed' }} />
                          <span style={{
                            fontSize: '1rem',
                            fontWeight: '600',
                            color: '#1f2937'
                          }}>
                            {brandData.brandName || 'Brand Name'}
                          </span>
                        </div>
                        
                        {brandData.tagline && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            marginBottom: '0.25rem'
                          }}>
                            <MessageSquare size={14} style={{ color: '#6b7280' }} />
                            <span style={{
                              fontSize: '0.875rem',
                              color: '#6b7280',
                              fontStyle: 'italic'
                            }}>
                              "{brandData.tagline}"
                            </span>
                          </div>
                        )}
                        
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          flexWrap: 'wrap'
                        }}>
                          {brandData.primaryColor && (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}>
                              <Palette size={14} style={{ color: '#6b7280' }} />
                              <div style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                backgroundColor: brandData.primaryColor.startsWith('#') ? brandData.primaryColor : `#${brandData.primaryColor}`,
                                border: '1px solid #e2e8f0'
                              }} />
                              <span style={{
                                fontSize: '0.75rem',
                                color: '#6b7280'
                              }}>
                                Primary
                              </span>
                            </div>
                          )}
                          
                          {brandData.toneOfVoice && (
                            <div style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              backgroundColor: '#f1f5f9',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              border: '1px solid #e2e8f0'
                            }}>
                              Tone: {brandData.toneOfVoice}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{
                    display: 'flex',
                    gap: '0.5rem'
                  }}>
                      <button
                        onClick={handleNewAnalysis}
                        style={{
                          background: '#6366f1',
                          color: 'white',
                          border: 'none',
                          padding: '0.5rem 1rem',
                          borderRadius: '8px',
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = '#4f46e5';
                          e.target.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = '#6366f1';
                          e.target.style.transform = 'translateY(0px)';
                        }}
                        title="Start a new analysis with fresh data"
                      >
                        <Upload size={16} />
                        New Analysis
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {/* How Good is Your Ad Section */}
              {(analysisResults || geminiResults) && !isAnalyzing && !loadingGemini && (
                <div style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                  textAlign: 'center',
                  position: 'relative'
                }}>
                  {/* Heading above Overall Score */}
                  <h2 style={{
                    fontSize: '1.5rem',
                    fontWeight: '600',
                    color: '#1f2937',
                    marginBottom: '1rem',
                    textAlign: 'center'
                  }}>
                    Is this Ad Good Enough?
                  </h2>
                  {/* Overall Score */}
                  <div style={{
                    background: (() => {
                      const score = calculateOverallScore();
                      if (score >= 85) return '#f0f9ff';
                      if (score >= 71) return '#fefce8';
                      return '#fef2f2';
                    })(),
                    border: (() => {
                      const score = calculateOverallScore();
                      if (score >= 85) return '2px solid #3b82f6';
                      if (score >= 71) return '2px solid #eab308';
                      return '2px solid #ef4444';
                    })(),
                    borderRadius: '12px',
                    padding: '1rem',
                    marginBottom: '1rem'
                  }}>
                    <div style={{
                      fontSize: '2rem',
                      fontWeight: '700',
                      color: (() => {
                        const score = calculateOverallScore();
                        if (score >= 85) return '#1e40af';
                        if (score >= 71) return '#a16207';
                        return '#dc2626';
                      })(),
                      marginBottom: '0.5rem'
                    }}>
                      Overall Score: {Number(calculateOverallScore()).toFixed(2)}
                    </div>
                  </div>
                  {/* Score Legend */}
                  <div style={{
                    marginTop: '1rem',
                    padding: '0.75rem',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      color: '#374151',
                      marginBottom: '0.5rem',
                      textAlign: 'center'
                    }}>
                      Score Legend
                    </div>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                      gap: '0.5rem'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        <div style={{
                          width: '12px',
                          height: '12px',
                          backgroundColor: '#ef4444',
                          borderRadius: '2px'
                        }}></div>
                        <span style={{ color: '#6b7280' }}>We Can Do Better: Below 71</span>
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        <div style={{
                          width: '12px',
                          height: '12px',
                          backgroundColor: '#eab308',
                          borderRadius: '2px'
                        }}></div>
                        <span style={{ color: '#6b7280' }}>Almost There: 71-85</span>
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        <div style={{
                          width: '12px',
                          height: '12px',
                          backgroundColor: '#3b82f6',
                          borderRadius: '2px'
                        }}></div>
                        <span style={{ color: '#6b7280' }}>Doing Really Great: Above 85</span>
                      </div>
                    </div>
                  </div>
                  {/* Subscribe to Unlock Overlay for Overall Score */}
                  {!hasValidSubscription() && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'rgba(103, 126, 234, 1.0)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      borderRadius: '12px',
                      textAlign: 'center'
                    }}>
                      <Lock size={24} style={{ color: 'white', marginBottom: '0.5rem' }} />
                      <p style={{ margin: 0, fontWeight: '600', color: 'white' }}>
                        Subscribe to Unlock
                      </p>
                      <button
                        onClick={() => {
                saveAnalysisState();
                setUserFlow('plan-selection');
              }}
                        style={{
                          background: 'white',
                          color: '#7c3aed',
                          border: '2px solid white',
                          borderRadius: '6px',
                          padding: '0.5rem 1rem',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          marginTop: '0.5rem'
                        }}
                      >
                        Subscribe Now
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* Score Cards */}
              {(() => {
                // Show cards if we have any results and not currently loading
                const shouldRenderCards = (analysisResults || geminiResults) && !isAnalyzing && !loadingGemini;
                console.log('🔍 Score Cards Section:', {
                  shouldRenderCards,
                  hasAnalysisResults: !!analysisResults,
                  hasGeminiResults: !!geminiResults,
                  isAnalyzing,
                  loadingGemini
                });
                if (shouldRenderCards) {
                  console.log('✅ Rendering score cards section');
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {/* Purchase Intent with Ad Resonance Card */}
                      {(() => {
                        const show = shouldShowCard('purchaseIntent');
                        console.log(`🔍 Purchase Intent card - shouldShow: ${show}`);
                        return show && renderScoreCard(
                          'Purchase Intent with Ad Resonance',
                          extractScoreFromGemini('purchase_intent_score') || analysisResults?.purchaseIntent?.score,
                          null,
                          'purchaseIntent',
                          'Purchase Intent with Ad Resonance'
                        );
                      })()}
                      {/* Brand Compliance Card */}
                      {shouldShowCard('brandCompliance') && renderScoreCard(
                        'Brand Compliance',
                        extractScoreFromGemini('brand_compliance_score') || analysisResults?.brandCompliance?.score || 0,
                        null,
                        'brandCompliance',
                        'Brand Compliance'
                      )}
                      {/* Channel Compliance Card */}
                      {shouldShowCard('channelCompliance') && renderScoreCard(
                        'Channel Compliance',
                        extractScoreFromGemini('channel_compliance_score') || analysisResults?.channelCompliance?.score,
                        null,
                        'channelCompliance',
                        'Channel Compliance'
                      )}
                      {/* Messaging Intent Card */}
                      {shouldShowCard('messagingIntent') && renderScoreCard(
                        'Messaging Intent',
                        extractScoreFromGemini('messaging_intent_score') || analysisResults?.messagingIntent?.score,
                        null,
                        'messagingIntent',
                        'Messaging Intent'
                      )}
                      {/* Funnel Compatibility Card */}
                      {shouldShowCard('funnelCompatibility') && renderScoreCard(
                        'Funnel Compatibility',
                        extractScoreFromGemini('funnel_compatibility_score') || analysisResults?.funnelCompatibility?.score,
                        null,
                        'funnelCompatibility',
                        'Funnel Compatibility'
                      )}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </div>
        {/* Comprehensive Analysis Breakdown */}
        {geminiResults?.rawResults && (
          <div style={{
            background: 'white',
            borderRadius: '12px',
            border: '2px solid #e5e7eb',
            marginTop: '2rem',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '1.5rem',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              color: 'white'
            }}>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <Brain size={20} />
                Detailed Analysis Breakdown from All 5 Models
              </h2>
            </div>
            <div style={{ padding: '2rem' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '1.5rem'
              }}>
                                  {/* Model 1: Purchase Intent & Content Analysis */}
                  {geminiResults.rawResults.content_analysis && (
                    <div style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '1.5rem'
                    }}>
                      <h3 style={{
                        fontSize: '1.1rem',
                        fontWeight: '600',
                        color: '#1f2937',
                        marginBottom: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <FileText size={18} style={{ color: '#7c3aed' }} />
                        Purchase Intent & Content Analysis
                      </h3>
                      <div style={{ fontSize: '0.9rem', color: '#6b7280', lineHeight: '1.6' }}>
                        <div style={{ marginBottom: '1rem' }}>
                          <strong style={{ color: '#374151' }}>Overall Score: {geminiResults.rawResults.content_analysis.overall_purchase_intent_percentage || 0}%</strong>
                        </div>
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong>Purchase Intent Breakdown:</strong>
                        </div>
                        <ul style={{ paddingLeft: '20px', margin: 0 }}>
                          <li><strong>Message Clarity:</strong> {geminiResults.rawResults.content_analysis.purchase_intent_scores?.message_clarity?.percentage || 0}% - {geminiResults.rawResults.content_analysis.purchase_intent_scores?.message_clarity?.description || 'No clear message'}</li>
                          <li><strong>Emotional Appeal:</strong> {geminiResults.rawResults.content_analysis.purchase_intent_scores?.emotional_appeal?.percentage || 0}% - {geminiResults.rawResults.content_analysis.purchase_intent_scores?.emotional_appeal?.description || 'Limited appeal'}</li>
                          <li><strong>Relevance:</strong> {geminiResults.rawResults.content_analysis.purchase_intent_scores?.relevance?.percentage || 0}% - {geminiResults.rawResults.content_analysis.purchase_intent_scores?.relevance?.description || 'Low relevance'}</li>
                          <li><strong>CTA Strength:</strong> {geminiResults.rawResults.content_analysis.purchase_intent_scores?.cta_strength?.percentage || 0}% - {geminiResults.rawResults.content_analysis.purchase_intent_scores?.cta_strength?.description || 'No CTA'}</li>
                          <li><strong>Psychological Triggers:</strong> {geminiResults.rawResults.content_analysis.purchase_intent_scores?.psychological_triggers?.percentage || 0}% - {geminiResults.rawResults.content_analysis.purchase_intent_scores?.psychological_triggers?.description || 'No triggers'}</li>
                        </ul>
                        <div style={{ marginTop: '1rem' }}>
                          <strong>Resonating Impact:</strong> {geminiResults.rawResults.content_analysis.resonating_impact || 'No impact description available'}
                        </div>
                      </div>
                    </div>
                  )}
                {/* Model 2: Brand Compliance */}
                {geminiResults.rawResults.brand_compliance && (
                  <div style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '8px',
                    padding: '1.5rem'
                  }}>
                    <h3 style={{
                      fontSize: '1.1rem',
                      fontWeight: '600',
                      color: '#1f2937',
                      marginBottom: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <CheckCircle size={18} style={{ color: '#10b981' }} />
                      Brand Compliance
                    </h3>
                    <div style={{ fontSize: '0.9rem', color: '#6b7280', lineHeight: '1.6' }}>
                      <div style={{ marginBottom: '1rem' }}>
                        <strong style={{ color: '#374151' }}>Overall Score: {geminiResults.rawResults.brand_compliance.compliance_analysis?.final_compliance_score || 0}%</strong>
                      </div>
                      <div style={{ marginBottom: '0.5rem' }}>
                        <strong>Compliance Breakdown (Yes/No):</strong>
                      </div>
                      <div style={{ display: 'grid', gap: '0.5rem' }}>
                        {geminiResults.rawResults.brand_compliance.compliance_analysis?.questions?.map((question, index) => (
                          <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: 'white', borderRadius: '4px' }}>
                            <span style={{ fontSize: '0.85rem' }}>{question}</span>
                            <span style={{ 
                              fontWeight: 'bold', 
                              color: geminiResults.rawResults.brand_compliance.compliance_analysis?.llm_answers?.[index] === 'Yes' ? '#10b981' : '#ef4444',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              background: geminiResults.rawResults.brand_compliance.compliance_analysis?.llm_answers?.[index] === 'Yes' ? '#dcfce7' : '#fee2e2'
                            }}>
                              {geminiResults.rawResults.brand_compliance.compliance_analysis?.llm_answers?.[index] || 'No'}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: '1rem' }}>
                        <strong>Compliance Level:</strong> {geminiResults.rawResults.brand_compliance.compliance_level || 'Low'}
                      </div>
                    </div>
                  </div>
                )}
                {/* Model 3: Metaphor Analysis (Messaging & Funnel) */}
                {geminiResults.rawResults.metaphor_analysis && (
                  <div style={{
                    background: '#fefce8',
                    border: '1px solid #fde047',
                    borderRadius: '8px',
                    padding: '1.5rem'
                  }}>
                    <h3 style={{
                      fontSize: '1.1rem',
                      fontWeight: '600',
                      color: '#1f2937',
                      marginBottom: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <Eye size={18} style={{ color: '#f59e0b' }} />
                      Messaging Intent & Funnel Analysis
                    </h3>
                    <div style={{ fontSize: '0.9rem', color: '#6b7280', lineHeight: '1.6' }}>
                      {/* Messaging Intent */}
                      <div style={{ marginBottom: '1.5rem' }}>
                        <strong style={{ color: '#374151' }}>Messaging Intent Score: {geminiResults.rawResults.metaphor_analysis.message_intent?.intent_compliance_score || 0}%</strong>
                        <div style={{ marginTop: '0.5rem' }}>
                          <strong>Core Message:</strong> {geminiResults.rawResults.metaphor_analysis.message_intent?.core_message_summary || 'No clear message identified'}
                        </div>
                        <div>
                          <strong>Emotional Tone:</strong> {geminiResults.rawResults.metaphor_analysis.message_intent?.emotional_tone || 'Neutral'}
                        </div>
                      </div>
                      {/* Funnel Compatibility */}
                      <div>
                        <strong style={{ color: '#374151' }}>Funnel Compatibility Score: {geminiResults.rawResults.metaphor_analysis.funnel_compatibility?.effectiveness_score || 0}%</strong>
                        <div style={{ marginTop: '0.5rem' }}>
                          <strong>AI Classification:</strong> {geminiResults.rawResults.metaphor_analysis.funnel_compatibility?.classification || 'Unknown'}
                        </div>
                        <div>
                          <strong>User Selected:</strong> {geminiResults.rawResults.metaphor_analysis.funnel_compatibility?.user_selected_type || 'Not specified'}
                        </div>
                        <div style={{ marginTop: '0.5rem' }}>
                          <strong>Reasoning:</strong> {geminiResults.rawResults.metaphor_analysis.funnel_compatibility?.reasoning || 'No reasoning provided'}
                        </div>
                        <div style={{ marginTop: '0.5rem' }}>
                          <strong>Improvement Suggestions:</strong> {geminiResults.rawResults.metaphor_analysis.funnel_compatibility?.improvement_suggestion || 'No suggestions available'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {/* Model 4: Channel Compliance */}
                {geminiResults.rawResults.channel_compliance && (
                  <div style={{
                    background: '#ecfeff',
                    border: '1px solid #67e8f9',
                    borderRadius: '8px',
                    padding: '1.5rem'
                  }}>
                    <h3 style={{
                      fontSize: '1.1rem',
                      fontWeight: '600',
                      color: '#1f2937',
                      marginBottom: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <Globe size={18} style={{ color: '#06b6d4' }} />
                      Channel Compliance
                    </h3>
                    <div style={{ fontSize: '0.9rem', color: '#6b7280', lineHeight: '1.6' }}>
                      <div style={{ marginBottom: '1rem' }}>
                        <strong style={{ color: '#374151' }}>Average Platform Score: {calculateChannelScore(geminiResults.rawResults.channel_compliance)}%</strong>
                      </div>
                      <div style={{ display: 'grid', gap: '1rem' }}>
                        {Object.entries(geminiResults.rawResults.channel_compliance).map(([platform, data]) => (
                          data && typeof data === 'object' && data.compliance_score !== undefined && (
                            <div key={platform} style={{ padding: '1rem', background: 'white', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <strong style={{ color: '#374151' }}>{platform}</strong>
                                <span style={{ 
                                  fontWeight: 'bold', 
                                  color: data.compliance_score >= 80 ? '#10b981' : data.compliance_score >= 60 ? '#f59e0b' : '#ef4444',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '4px',
                                  background: data.compliance_score >= 80 ? '#dcfce7' : data.compliance_score >= 60 ? '#fef3c7' : '#fee2e2'
                                }}>
                                  {data.compliance_score}%
                                </span>
                              </div>
                              {data.guideline_results && (
                                <div style={{ fontSize: '0.8rem' }}>
                                  <div><strong>Guidelines Checked:</strong> {data.total_guidelines || 0}</div>
                                  <div><strong>Guidelines Passed:</strong> {data.total_matched_scores || 0}</div>
                                  {data.guideline_results.slice(0, 2).map((guideline, idx) => (
                                    <div key={idx} style={{ marginTop: '0.25rem', fontSize: '0.75rem', paddingLeft: '1rem', position: 'relative' }}>
                                      <span style={{ position: 'absolute', left: 0, top: '0.4rem', width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }}></span>
                                      {guideline.guideline} {'->'} {guideline.actual_output}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>


      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
export default Analysis;
