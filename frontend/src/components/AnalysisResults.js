import React, { useState } from 'react';
import { Download, Eye, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';

// Helper function to clean markdown text and handle truncation
const cleanMarkdownText = (text) => {
  if (!text) return 'No analysis available';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove bold markdown
    .replace(/\*(.*?)\*/g, '$1')      // Remove italic markdown
    .replace(/#{1,6}\s/g, '')         // Remove header markdown
    .replace(/^\*\* /, '')            // Remove leading "** "
    .replace(/\*\*$/, '')             // Remove trailing "**"
    .trim();
};

const AnalysisResults = ({ 
  analysisResults, 
  onDownloadReport, 
  onViewDetails,
  showDownloadButton = true,
  showViewButton = true,
  compact = false,
  selectedFeatures = [], // Add selectedFeatures prop
  isLoading = false, // Add loading state prop
  userPlan = null // Add userPlan prop to determine card visibility
}) => {
  
  // State for interactive score cards
  const [expandedCards, setExpandedCards] = useState({});
  const [hoveredCard, setHoveredCard] = useState(null);
  
  const shouldShowFeature = (featureId) => {
    // **FIX**: For analysis results, use the selectedFeatures that were stored at analysis time
    // This prevents retroactive feature changes from affecting old analyses
    if (selectedFeatures && selectedFeatures.length > 0) {
      console.log('🔍 AnalysisResults: Using stored selectedFeatures for filtering:', selectedFeatures);
      
      // Map feature IDs to match the selectedFeatures array
      const featureMapping = {
        'brandCompliance': 'brand_compliance',
        'messagingIntent': 'messaging_intent', 
        'funnelCompatibility': 'funnel_compatibility',
        'adResonance': 'resonance_index',
        'channelCompliance': 'channel_compliance',
        'purchaseIntent': 'resonance_index' // Purchase Intent is part of Resonance Index feature
      };
      
      const mappedFeatureId = featureMapping[featureId];
      const shouldShow = selectedFeatures.includes(mappedFeatureId);
      console.log(`🔍 AnalysisResults: Feature ${featureId} (${mappedFeatureId}) should show: ${shouldShow}`);
      return shouldShow;
    }
    
    // **FALLBACK**: If no stored selectedFeatures, use current plan logic
    if (!userPlan) {
      console.log('🔍 AnalysisResults: No userPlan, showing all features');
      return true;
    }
    
    // Get plan type from userPlan object
    const planType = userPlan.planType || userPlan.plan || 'free';
    console.log('🔍 AnalysisResults: Using current plan type for filtering:', planType);
    
    // For Plus/Pro users, show all cards (same logic as Analysis component)
    if (planType === 'plus' || planType === 'pro' || planType === 'Incivus_Plus' || planType === 'Incivus_Pro' || planType === 'enterprise' || planType === 'Incivus_Enterprise') {
      return true;
    }
    
    // For free users or unknown plans, show all cards (they'll have overlays)
    return true;
  };

  const toggleCardExpansion = (featureId) => {
    setExpandedCards(prev => ({
      ...prev,
      [featureId]: !prev[featureId]
    }));
  };

  const getScoreColor = (score) => {
    if (score >= 80) return '#10b981'; // Green
    if (score >= 60) return '#f59e0b'; // Yellow
    return '#ef4444'; // Red
  };

  const renderScoreCard = (title, score, details, cardColor, featureId) => {
    if (!shouldShowFeature(featureId)) return null;

    const isExpanded = expandedCards[featureId];
    const isHovered = hoveredCard === featureId;
    const scoreValue = score || 50;

    return (
      <div 
        style={{
          background: cardColor,
          padding: compact ? '1.5rem' : '2rem',
          borderRadius: '12px',
          border: `2px solid ${isHovered ? getScoreColor(scoreValue) : '#e2e8f0'}`,
          boxShadow: isHovered 
            ? '0 8px 25px -5px rgba(0, 0, 0, 0.15), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
            : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          position: 'relative',
          minHeight: compact ? '250px' : '300px',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
        }}
        onClick={() => toggleCardExpansion(featureId)}
        onMouseEnter={() => setHoveredCard(featureId)}
        onMouseLeave={() => setHoveredCard(null)}
      >
        {/* Ad Media Thumbnail removed - Only show in Libraries page */}

        {/* Card Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <h4 style={{ 
            fontSize: compact ? '1.1rem' : '1.25rem',
            fontWeight: '600', 
            color: '#1f2937', 
            margin: 0
          }}>
            {title}
          </h4>
          <div style={{
            transition: 'transform 0.2s ease',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
          }}>
            <ChevronDown size={20} color="#6b7280" />
          </div>
        </div>
        
        {/* Score Display */}
        <div style={{ 
          fontSize: compact ? '2rem' : '2.5rem', 
          fontWeight: '700', 
          color: getScoreColor(scoreValue),
          marginBottom: '1rem'
        }}>
          {scoreValue}%
        </div>
        {/* Expandable Details */}
        <div style={{
          maxHeight: isExpanded ? '500px' : '60px',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
          fontSize: compact ? '0.8rem' : '0.9rem',
          color: '#6b7280',
          lineHeight: '1.6'
        }}>
          {details}
        </div>
        
        {/* Expand/Collapse Hint */}
        {!isExpanded && (
          <div style={{
            position: 'absolute',
            bottom: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '0.75rem',
            color: '#9ca3af',
            fontStyle: 'italic'
          }}>
            Click to expand details
          </div>
        )}
      </div>
    );
  };

  if (!analysisResults) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '2rem',
        color: '#6b7280'
      }}>
        <BarChart3 size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
        <p>No analysis results available</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header with actions */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <h3 style={{
            fontSize: '1.5rem',
            fontWeight: '600',
            color: '#1f2937',
            margin: 0
          }}>
            Ad Analyzer Results
          </h3>
          <p style={{
            fontSize: '0.9rem',
            color: '#6b7280',
            margin: '0.5rem 0 0 0'
          }}>
            Comprehensive analysis of your advertisement
          </p>
        </div>
        
        <div style={{
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap'
        }}>
          {showViewButton && onViewDetails && (
            <button
              onClick={onViewDetails}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                backgroundColor: '#7c3aed',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.9rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#6d28d9'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#7c3aed'}
            >
              <Eye size={16} />
              View Details
            </button>
          )}
          
        </div>
      </div>

      {/* Score Cards Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: compact ? 'repeat(auto-fit, minmax(280px, 1fr))' : 'repeat(auto-fit, minmax(350px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        {/* Brand Compliance Card */}
        {renderScoreCard(
          'Brand Compliance',
          analysisResults?.brandCompliance?.score,
          <div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Logo:</strong> {analysisResults?.brandCompliance?.logo?.present ? 'Detected' : 'Not Detected'}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Brand Presence:</strong> {cleanMarkdownText(analysisResults?.brandCompliance?.brandPresence) || 'Moderate'}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Color Psychology:</strong> {cleanMarkdownText(analysisResults?.brandCompliance?.colorPsychology) || 'Balanced'}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Typography:</strong> {cleanMarkdownText(analysisResults?.brandCompliance?.typography) || 'Clear'}
            </div>
          </div>,
          'var(--card-purple)',
          'brandCompliance'
        )}

        {/* Messaging Intent Card */}
        {renderScoreCard(
          'Messaging Intent',
          analysisResults?.messagingIntent?.score,
          <div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Type:</strong> {cleanMarkdownText(analysisResults?.messagingIntent?.type) || 'Promotional message'}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Clarity:</strong> {cleanMarkdownText(analysisResults?.messagingIntent?.clarity) || 'Medium'}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>CTA Strength:</strong> {cleanMarkdownText(analysisResults?.messagingIntent?.ctaStrength) || 'Medium'}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Emotional Appeal:</strong> {cleanMarkdownText(analysisResults?.messagingIntent?.emotionalTone) || 'Neutral'}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Triggers:</strong> {cleanMarkdownText(analysisResults?.messagingIntent?.persuasiveTriggers) || 'Standard'}
            </div>
          </div>,
          'var(--card-pink)',
          'messagingIntent'
        )}

        {/* Funnel Compatibility Card */}
        {renderScoreCard(
          'Funnel Compatibility',
          analysisResults?.funnelCompatibility?.score,
          <div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Stage:</strong> {cleanMarkdownText(analysisResults?.funnelCompatibility?.stage) || 'Awareness'}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Conversion Potential:</strong> {cleanMarkdownText(analysisResults?.funnelCompatibility?.conversionPotential) || 'Medium'}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Urgency Elements:</strong> {cleanMarkdownText(analysisResults?.funnelCompatibility?.urgencyElements) || 'Present'}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Scarcity Triggers:</strong> {cleanMarkdownText(analysisResults?.funnelCompatibility?.scarcityTriggers) || 'None'}
            </div>
          </div>,
          'var(--card-lavender)',
          'funnelCompatibility'
        )}

        {/* Ad Resonance Card */}
        {renderScoreCard(
          'Ad Resonance',
          analysisResults?.adResonance?.score,
          <div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Emotional Impact:</strong> {cleanMarkdownText(analysisResults?.adResonance?.emotionalImpact) || 'High'}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Engagement Level:</strong> {cleanMarkdownText(analysisResults?.adResonance?.engagementLevel) || 'High'}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Memorability:</strong> {cleanMarkdownText(analysisResults?.adResonance?.memorability) || 'Strong'}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Shareability:</strong> {cleanMarkdownText(analysisResults?.adResonance?.shareability) || 'Medium'}
            </div>
          </div>,
          'var(--card-blue)',
          'adResonance'
        )}

        {/* Channel Compliance Card */}
        {renderScoreCard(
          'Channel Compliance',
          analysisResults?.channelCompliance?.score,
          <div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Platform Optimization:</strong> {cleanMarkdownText(analysisResults?.channelCompliance?.platformOptimization) || 'Good'}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Format Compliance:</strong> {cleanMarkdownText(analysisResults?.channelCompliance?.formatCompliance) || 'Compliant'}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Content Guidelines:</strong> {cleanMarkdownText(analysisResults?.channelCompliance?.contentGuidelines) || 'Followed'}
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <strong>Performance Score:</strong> {analysisResults?.channelCompliance?.performanceScore || '75%'}
            </div>
          </div>,
          'var(--card-green)',
          'channelCompliance'
        )}

        {/* Purchase Intent Card */}
        {renderScoreCard(
          'Purchase Intent',
          analysisResults?.purchaseIntent?.score,
          <div>
            {/* Show individual metric breakdowns if available */}
            {analysisResults?.purchaseIntent?.breakdown ? (
              <div>
                {analysisResults.purchaseIntent.breakdown.message_clarity && (
                  <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <strong>Message Clarity:</strong>
                      <span style={{ color: getScoreColor(analysisResults.purchaseIntent.breakdown.message_clarity.percentage) }}>
{analysisResults.purchaseIntent.breakdown.message_clarity.percentage}%
                      </span>
                    </div>
                    {analysisResults.purchaseIntent.breakdown.message_clarity.reason && (
                      <div style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>
                        {cleanMarkdownText(analysisResults.purchaseIntent.breakdown.message_clarity.reason)}
                      </div>
                    )}
                  </div>
                )}
                
                {analysisResults.purchaseIntent.breakdown.emotional_appeal && (
                  <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <strong>Emotional Appeal:</strong>
                      <span style={{ color: getScoreColor(analysisResults.purchaseIntent.breakdown.emotional_appeal.percentage) }}>
{analysisResults.purchaseIntent.breakdown.emotional_appeal.percentage}%
                      </span>
                    </div>
                    {analysisResults.purchaseIntent.breakdown.emotional_appeal.reason && (
                      <div style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>
                        {cleanMarkdownText(analysisResults.purchaseIntent.breakdown.emotional_appeal.reason)}
                      </div>
                    )}
                  </div>
                )}
                
                {analysisResults.purchaseIntent.breakdown.relevance && (
                  <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <strong>Relevance:</strong>
                      <span style={{ color: getScoreColor(analysisResults.purchaseIntent.breakdown.relevance.percentage) }}>
{analysisResults.purchaseIntent.breakdown.relevance.percentage}%
                      </span>
                    </div>
                    {analysisResults.purchaseIntent.breakdown.relevance.reason && (
                      <div style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>
                        {cleanMarkdownText(analysisResults.purchaseIntent.breakdown.relevance.reason)}
                      </div>
                    )}
                  </div>
                )}
                
                {analysisResults.purchaseIntent.breakdown.cta_strength && (
                  <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <strong>CTA Strength:</strong>
                      <span style={{ color: getScoreColor(analysisResults.purchaseIntent.breakdown.cta_strength.percentage) }}>
{analysisResults.purchaseIntent.breakdown.cta_strength.percentage}%
                      </span>
                    </div>
                    {analysisResults.purchaseIntent.breakdown.cta_strength.reason && (
                      <div style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>
                        {cleanMarkdownText(analysisResults.purchaseIntent.breakdown.cta_strength.reason)}
                      </div>
                    )}
                  </div>
                )}
                
                {analysisResults.purchaseIntent.breakdown.psychological_triggers && (
                  <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <strong>Psychological Triggers:</strong>
                      <span style={{ color: getScoreColor(analysisResults.purchaseIntent.breakdown.psychological_triggers.percentage) }}>
{analysisResults.purchaseIntent.breakdown.psychological_triggers.percentage}%
                      </span>
                    </div>
                    {analysisResults.purchaseIntent.breakdown.psychological_triggers.reason && (
                      <div style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>
                        {cleanMarkdownText(analysisResults.purchaseIntent.breakdown.psychological_triggers.reason)}
                      </div>
                    )}
                  </div>
                )}
                
                {analysisResults?.purchaseIntent?.resonatingImpact && (
                  <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#fef7ff', borderRadius: '6px', border: '1px solid #e879f9' }}>
                    <strong style={{ color: '#a855f7' }}>Resonating Impact:</strong>
                    <div style={{ fontSize: '0.9rem', color: '#6b46c1', marginTop: '0.25rem' }}>
                      {cleanMarkdownText(analysisResults.purchaseIntent.resonatingImpact)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Fallback to old format if no breakdown available
              <div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>Action Potential:</strong> {cleanMarkdownText(analysisResults?.purchaseIntent?.actionPotential) || 'Medium'}
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>Motivation Level:</strong> {cleanMarkdownText(analysisResults?.purchaseIntent?.motivationLevel) || 'Moderate'}
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>Decision Triggers:</strong> {cleanMarkdownText(analysisResults?.purchaseIntent?.decisionTriggers) || 'Present'}
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>Conversion Likelihood:</strong> {analysisResults?.purchaseIntent?.conversionLikelihood || '60%'}
                </div>
              </div>
            )}
          </div>,
          'var(--card-orange)',
          'purchaseIntent'
        )}
      </div>
    </div>
  );
};

export default AnalysisResults; 