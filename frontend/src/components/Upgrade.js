import React, { useState, useEffect } from 'react';
import { Check, Star, Zap, Shield, Target, BarChart, Smartphone, Crown, Building } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import unifiedApi from '../utils/unifiedApiHelper';
import ENV_CONFIG from '../utils/environmentConfig';
import { formatCurrency, calculatePrice } from '../utils/formatHelpers';

// This component uses the same data retrieval logic as the Profile component.
// It tries database data first via getUserPlanData(), then falls back to localStorage.
const Upgrade = ({ currentPlan = null, onUpgrade }) => {
  const { currentUser, getUserPlanData } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedFeatures, setSelectedFeatures] = useState([]);
  const [adCount, setAdCount] = useState(1);
  const [showFeatureSelection, setShowFeatureSelection] = useState(false);
  const [totalPrice, setTotalPrice] = useState(0);
  const [actualCurrentPlan, setActualCurrentPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  // NOTE: This component IGNORES the currentPlan prop and localStorage
  // It ONLY uses fresh data from the database via getUserPlanData()
  // This ensures consistency with the profile page and handles logout/login correctly

  // Load user's actual plan data from database ONLY (same as SubscriptionStatus)
  useEffect(() => {
    const loadActualPlanData = async () => {
      if (!currentUser?.uid) {
        console.log('🔍 Upgrade Component - No user found, clearing plan data');
        setActualCurrentPlan(null);
        setLoading(false);
        return;
      }

      try {
        console.log('🔄 Upgrade Component - Loading from database ONLY (no localStorage)');
        setLoading(true);
        
        const userId = currentUser.uid;
        
        // **SINGLE SOURCE OF TRUTH**: Use unified API for plan data
        const userProfile = await unifiedApi.getUserProfile(userId);
        const effectiveSubscription = userProfile?.subscription || null;
        
        if (effectiveSubscription) {
          console.log('✅ Upgrade - Plan data loaded from single source:', effectiveSubscription);
        } else {
          console.log('⚠️ Upgrade - No plan data found from single source');
        }

        console.log('🔍 Upgrade - Final plan data (single source only):', effectiveSubscription);
        
        let actualPlan = null;
        
        // Only proceed if we have valid subscription data
        if (effectiveSubscription && effectiveSubscription.isActive) {
          // Map database plan name to component plan key
          const planMapping = {
            'Incivus_Lite': 'lite',
            'Incivus_Plus': 'plus', 
            'Incivus_Pro': 'pro',
            'Enterprise': 'enterprise',
            'incivus_lite': 'lite',
            'incivus_plus': 'plus',
            'incivus_pro': 'pro',
            'enterprise': 'enterprise'
          };
          
          // Map plan type from database response
          console.log('🔍 Upgrade Component - effectiveSubscription structure:', {
            planType: effectiveSubscription.planType,
            planName: effectiveSubscription.planName
          });
          
          let planType = effectiveSubscription.planType || effectiveSubscription.planName;
          console.log('🔍 Upgrade Component - Raw plan type before mapping:', planType);
          
          // Apply mapping if needed
          if (planMapping[planType]) {
            planType = planMapping[planType];
            console.log('🔍 Upgrade Component - Plan type after mapping:', planType);
          } else {
            console.log('⚠️ Upgrade Component - No mapping found for plan type:', planType);
          }
          
          // Ensure planType is lowercase for consistency
          actualPlan = planType ? planType.toLowerCase() : null;
          
          console.log('✅ Upgrade Component - Final mapped plan type:', {
            originalPlan: effectiveSubscription.planType || effectiveSubscription.planName,
            mappedPlan: actualPlan,
            planHierarchyIndex: actualPlan ? planHierarchy.indexOf(actualPlan) : -1
          });
        } else {
          console.log('⚠️ Upgrade Component - No plan data found in database or localStorage');
        }
        
        setActualCurrentPlan(actualPlan);
        console.log('🎯 Upgrade Component - State updated with actualCurrentPlan:', actualPlan);
        
      } catch (error) {
        console.error('❌ Upgrade Component - Error loading plan data:', error);
        // DO NOT fallback to localStorage - always use database data only
        // If database fails, user has no current plan (new user or error state)
        setActualCurrentPlan(null);
        console.log('⚠️ Upgrade Component - Database failed, treating as new user with no plan');
      } finally {
        setLoading(false);
      }
    };

    loadActualPlanData();
  }, [currentUser?.uid, getUserPlanData]); // Re-run when user ID changes (after logout/login)

  // Define all 5 features
  const allFeatures = [
    {
      id: 'brand_compliance',
      name: 'Brand Compliance',
      description: 'Ensure your ads match brand guidelines',
      icon: <Shield size={20} />
    },
    {
      id: 'messaging_intent',
      name: 'Messaging Intent',
      description: 'Analyze message clarity and purpose',
      icon: <Target size={20} />
    },
    {
      id: 'funnel_compatibility',
      name: 'Funnel Compatibility',
      description: 'Check ad fit in sales funnel stage',
      icon: <BarChart size={20} />
    },
    {
      id: 'resonance_index',
      name: 'Purchase Intent',
      description: 'Measure audience engagement potential',
      icon: <Star size={20} />
    },
    {
      id: 'channel_compliance',
      name: 'Channel Compliance',
      description: 'Optimize for specific platforms',
      icon: <Smartphone size={20} />
    }
  ];

  // Define plan hierarchy for upgrade logic
  const planHierarchy = ['lite', 'plus', 'pro', 'enterprise'];
  
  // Define max ads per month for each plan
  const maxAdsPerMonth = {
    'lite': 4,   // Correct: 4 ads per month for Lite
    'plus': 5,   // Correct: 5 ads per month for Plus
    'pro': 11,   // Correct: 11 ads per month for Pro
    'enterprise': 999 // Unlimited
  };

  // Calculate combined monthly limits for upgrades
  const getCombinedMonthlyLimit = (currentPlanType, newPlanType) => {
    if (!currentPlanType || !actualCurrentPlan) return maxAdsPerMonth[newPlanType] || 0;
    
    const currentLimit = maxAdsPerMonth[currentPlanType] || 0;
    const newLimit = maxAdsPerMonth[newPlanType] || 0;
    
    // For upgrades, combine the limits
    return currentLimit + newLimit;
  };
  
  // Filter available plans based on current user plan (upgrade only)
  const getAvailablePlans = () => {
    // ONLY use actualCurrentPlan from database - ignore props completely
    const userCurrentPlan = actualCurrentPlan;
    
    console.log('🔍 Upgrade Component - getAvailablePlans called with:', {
      actualCurrentPlan,
      userCurrentPlan,
      loading,
      planHierarchy
    });
    
    if (!userCurrentPlan) {
      // No current plan - show all plans (new user or database error)
      console.log('🔍 Upgrade Component - No current plan found, showing all plans');
      console.log('🔍 Upgrade Component - Reason: actualCurrentPlan is:', actualCurrentPlan);
      console.log('🔍 Upgrade Component - Loading state:', loading);
      
      // If still loading, don't show any plans yet
      if (loading) {
        console.log('🔍 Upgrade Component - Still loading, returning empty plans');
        return {};
      }
      
      // If not loading and no plan found, user might not have a subscription
      console.log('🔍 Upgrade Component - Not loading and no plan found, showing all plans for new user');
      return plans;
    }
    
    const currentIndex = planHierarchy.indexOf(userCurrentPlan);
    const availablePlans = {};
    
    // Show current plan and higher plans only
    planHierarchy.forEach((planKey, index) => {
      if (index >= currentIndex && plans[planKey]) {
        availablePlans[planKey] = plans[planKey];
      }
    });
    
    console.log('🔍 Upgrade Component - Available plans (DB only):', {
      userCurrentPlan,
      currentIndex,
      availablePlans: Object.keys(availablePlans),
      databaseSource: true
    });
    
    return availablePlans;
  };

  const plans = {
    lite: {
      name: 'Incivus_Lite',
      validity: '3 months',
      pricePerAd: 5,
      minOrderQty: 10,
      minCommitment: 50,
      maxAdsPerMonth: 4,
      maxAdsTotal: 12, // 4 ads/month * 3 months
      featuresIncluded: 4,
      maxFeatures: 4,
      color: '#28a745',
      popular: false,
      upgradeClickbait: 'get all 5 metrics and do more ads per month'
    },
    plus: {
      name: 'Incivus_Plus',
      validity: '6 months',
      pricePerAd: 4,
      minOrderQty: 25,
      minCommitment: 100,
      maxAdsPerMonth: 5,
      maxAdsTotal: 30, // 5 ads/month * 6 months
      featuresIncluded: 5,
      maxFeatures: 5,
      color: '#007bff',
      popular: true,
      upgradeClickbait: 'get all 5 metrics and do more ads per month'
    },
    pro: {
      name: 'Incivus_Pro',
      validity: '12 months',
      pricePerAd: 3.2,
      minOrderQty: 125,
      minCommitment: 400,
      maxAdsPerMonth: 11,
      maxAdsTotal: 132, // 11 ads/month * 12 months
      featuresIncluded: 5,
      maxFeatures: 5,
      color: '#6f42c1',
      popular: false,
      upgradeClickbait: 'Unlimited Ads, Managed Support, Professional Services'
    },
    enterprise: {
      name: 'Enterprise',
      validity: 'Custom',
      pricePerAd: 0,
      minOrderQty: 0,
      minCommitment: 0,
      maxAdsPerMonth: 'Unlimited',
      maxAdsTotal: 'Unlimited',
      featuresIncluded: 5,
      maxFeatures: 5,
      color: '#f59e0b',
      popular: false,
      external: true,
      externalLink: 'https://incivus.ai/',
      upgradeClickbait: 'Custom Enterprise Solutions'
    }
  };

  // Calculate pricing
  useEffect(() => {
    if (!selectedPlan) return;

    const plan = plans[selectedPlan] || {};
    let price = 0;

    if (selectedPlan === 'lite') {
      // Minimum 10 ads at $5 per ad = $50
      const minAds = plan.minOrderQty;
      const finalAdCount = Math.max(adCount, minAds);
      price = calculatePrice(finalAdCount, plan.pricePerAd);
    } else if (selectedPlan === 'plus') {
      // Minimum 25 ads at $4 per ad = $100
      const minAds = plan.minOrderQty;
      const finalAdCount = Math.max(adCount, minAds);
      price = calculatePrice(finalAdCount, plan.pricePerAd);
    } else if (selectedPlan === 'pro') {
      // Minimum 125 ads at $3.2 per ad = $400
      const minAds = plan.minOrderQty;
      const finalAdCount = Math.max(adCount, minAds);
      price = calculatePrice(finalAdCount, plan.pricePerAd);
    }

    setTotalPrice(price);
  }, [selectedPlan, adCount, selectedFeatures]);

  const handlePlanSelection = (planKey) => {
    setSelectedPlan(planKey);
    setSelectedFeatures([]);
    
    // Set minimum ad count for each plan (users can select within range)
    const planMinimums = {
      lite: 10,    // Lite: 10-12 ads range  
      plus: 25,    // Plus: 25-30 ads range
      pro: 125     // Pro: 125-132 ads range
    };
    
    setAdCount(planMinimums[planKey] || 10);
    console.log(`🔧 Plan ${planKey} selected: starting at ${planMinimums[planKey]} ads (user can select range)`);
    
    if (planKey === 'lite') {
      setShowFeatureSelection(true);
    } else if (planKey === 'plus') {
      setShowFeatureSelection(false);
      // Plus users get all features
      setSelectedFeatures(allFeatures.map(f => f.id));
    } else if (planKey === 'pro') {
      setShowFeatureSelection(false);
      // Pro users get all features
      setSelectedFeatures(allFeatures.map(f => f.id));
    } else {
      setShowFeatureSelection(false);
    }
  };

  const handleFeatureToggle = (featureId) => {
    if (selectedPlan !== 'lite') return;

    setSelectedFeatures(prev => {
      if (prev.includes(featureId)) {
        return prev.filter(id => id !== featureId);
      } else if (prev.length < 4) {
        return [...prev, featureId];
      }
      return prev;
    });
  };

  const handleContinue = async () => {
    if (!selectedPlan) {
      alert('Please select a plan');
      return;
    }

    // Handle Enterprise external link
    if (selectedPlan === 'enterprise') {
      window.location.href = plans[selectedPlan]?.externalLink || 'https://incivus.ai/';
      return;
    }

    if (selectedPlan === 'lite' && selectedFeatures.length !== 4) {
      alert('Please select exactly 4 features for Incivus Lite');
      return;
    }

    if (adCount < 1) {
      alert('Please select at least 1 ad');
      return;
    }

    // Detect topup/upgrade logic (same as PlanStructure.js)
    let isTopup = false;
    let isUpgrade = false;

    if (actualCurrentPlan && currentUser?.uid) {
      try {
        // Fetch current subscription from database
        const response = await fetch(`${ENV_CONFIG.PYTHON_API_URL}/get-user-profile/${currentUser.uid}`);
        const userData = await response.json();
        const currentSubscription = userData?.subscription;

        console.log('🔍 Upgrade - Current subscription for topup/upgrade detection:', currentSubscription);

        if (currentSubscription && currentSubscription.paymentStatus === 'completed') {
          const currentPlanType = currentSubscription.planType;
          const selectedPlanType = selectedPlan;

          if (currentPlanType === selectedPlanType) {
            isTopup = true;
            console.log('🔄 Upgrade - Detected TOPUP (same plan):', selectedPlanType);
          } else {
            const planHierarchy = ['lite', 'plus', 'pro', 'enterprise'];
            const currentIndex = planHierarchy.indexOf(currentPlanType);
            const selectedIndex = planHierarchy.indexOf(selectedPlanType);
            
            if (selectedIndex > currentIndex) {
              isUpgrade = true;
              console.log('⬆️ Upgrade - Detected UPGRADE:', `${currentPlanType} → ${selectedPlanType}`);
            }
          }
        }
      } catch (error) {
        console.error('❌ Upgrade - Error detecting topup/upgrade:', error);
      }
    }

    // Ensure all features are included for Plus and Pro plans
    let finalFeatures = selectedFeatures;
    if (selectedPlan === 'plus' || selectedPlan === 'pro') {
      // For Plus and Pro plans, include all 5 features automatically
      finalFeatures = ['brand_compliance', 'messaging_intent', 'funnel_compatibility', 'resonance_index', 'channel_compliance'];
      console.log('🎯 Upgrade - Auto-including all features for Plus/Pro plan:', finalFeatures);
    }

    const planData = {
      planType: selectedPlan,
      planName: plans[selectedPlan]?.name || 'Unknown Plan',
      features: finalFeatures,
      selectedFeatures: finalFeatures,  // **CRITICAL FIX**: Add selectedFeatures for ShopifyPayment
      adQuota: adCount,
      max_ads_per_month: actualCurrentPlan ? getCombinedMonthlyLimit(actualCurrentPlan.planType, selectedPlan) : maxAdsPerMonth[selectedPlan] || 4,
      totalPrice: totalPrice,
      validity: plans[selectedPlan]?.validity || '3 months',
      validityDays: selectedPlan === 'lite' ? 90 : selectedPlan === 'plus' ? 180 : selectedPlan === 'pro' ? 365 : 365,
      subscriptionStartDate: new Date(),
      subscriptionEndDate: new Date(Date.now() + (selectedPlan === 'lite' ? 90 : selectedPlan === 'plus' ? 180 : selectedPlan === 'pro' ? 365 : 365) * 24 * 60 * 60 * 1000),
      // Add topup/upgrade flags
      isTopup: isTopup,
      isUpgrade: isUpgrade
    };

    console.log('🎯 Upgrade - Final planData with flags:', planData);
    console.log('🎯 Upgrade - selectedFeatures being sent:', finalFeatures);
    onUpgrade(planData);
  };

  // Show loading state while fetching plan data
  if (loading) {
    return (
      <div style={{
        maxWidth: '1000px',
        margin: '0 auto',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '3rem'
        }}>
          <div style={{
            width: '24px',
            height: '24px',
            border: '3px solid #f3f3f3',
            borderTop: '3px solid #7c3aed',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <span style={{ fontSize: '1.1rem', color: '#666' }}>
            Loading your current plan...
          </span>
        </div>
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <div style={{ 
      maxWidth: '1000px',
      margin: '0 auto', 
      padding: '2rem'
    }}>
      <div style={{ 
        textAlign: 'center',
        marginBottom: '3rem'
      }}>
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: 'bold',
          color: '#2c3e50',
          marginBottom: '1rem'
        }}>
          Choose Your Incivus Plan
        </h1>
        <p style={{ 
          fontSize: '1.1rem',
          color: '#2c3e50',
          maxWidth: '600px',
          margin: '0 auto',
          marginBottom: '1rem'
        }}>
          Select the plan that best fits your advertising analysis needs. 
          Choose your features and ad quota to get started.
        </p>
        {actualCurrentPlan && (
          <div style={{
            background: '#f0fdf4',
            border: '1px solid #10b981',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            maxWidth: '600px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            fontSize: '0.9rem',
            color: '#065f46'
          }}>
            <Check size={16} />
            Your current plan is highlighted in green below
          </div>
        )}
      </div>

      {/* Plan Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '2rem',
        marginBottom: '3rem'
      }}>
        {!loading && Object.entries(getAvailablePlans()).map(([planKey, plan]) => {
          // Safety check to prevent undefined plan errors
          if (!plan || typeof plan !== 'object') {
            console.warn(`Invalid plan object for key: ${planKey}`, plan);
            return null;
          }
          
          // Debug current plan highlighting
          const isCurrentPlan = actualCurrentPlan && planKey === actualCurrentPlan;
          console.log(`🎨 Upgrade Component - Plan ${planKey} highlighting:`, {
            planKey,
            actualCurrentPlan,
            isCurrentPlan,
            comparison: `${planKey} === ${actualCurrentPlan}`,
            willHighlight: isCurrentPlan
          });
          
          return (
            <div
              key={planKey}
              onClick={() => handlePlanSelection(planKey)}
              style={{
                border: isCurrentPlan ? `3px solid #10b981` : selectedPlan === planKey ? `3px solid ${plan.color}` : '2px solid #e9ecef',
                borderRadius: '12px',
                padding: '2rem',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                background: isCurrentPlan ? '#f0fdf4' : selectedPlan === planKey ? 'var(--ultra-light-purple)' : 'var(--very-light-purple)',
                position: 'relative',
                boxShadow: isCurrentPlan ? '0 8px 25px #10b98130' : selectedPlan === planKey ? `0 8px 25px ${plan.color}30` : '0 4px 6px rgba(0,0,0,0.1)'
              }}
              onMouseEnter={(e) => {
                if (selectedPlan !== planKey && !isCurrentPlan) {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 10px 25px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                  e.currentTarget.style.borderColor = '#c7d2fe';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedPlan !== planKey && !isCurrentPlan) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                  e.currentTarget.style.borderColor = '#e9ecef';
                }
              }}
            >
              {plan.popular && (
                <div style={{
                  position: 'absolute',
                top: '-10px',
                right: '20px',
                background: plan.color,
                  color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: 'bold'
              }}>
                🔥 POPULAR
                </div>
              )}
              
              {isCurrentPlan && (
                <div style={{
                  position: 'absolute',
                  top: '-10px',
                  left: '20px',
                  background: '#10b981',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}>
                  <Check size={12} />
                  CURRENT PLAN
                </div>
              )}

            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ 
                fontSize: '1.8rem',
                fontWeight: 'bold',
                color: (currentPlan && planKey === currentPlan) ? '#10b981' : plan.color,
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}>
                {currentPlan && planKey === currentPlan && <Check size={24} />}
                {plan.name}
              </h3>
              <div style={{
                background: plan.color,
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '20px',
                display: 'inline-block',
                fontSize: '0.9rem',
                fontWeight: 'bold'
              }}>
                {planKey === 'enterprise' ? 'Custom Solutions' : `Valid for ${plan.validity}`}
              </div>
              </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{
                fontSize: '1.2rem',
                fontWeight: 'bold',
                color: '#2c3e50',
                marginBottom: '1rem'
              }}>
                Features Included:
              </div>
              <div style={{
                background: '#f8f9fa',
                padding: '1rem',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  color: plan.color
                }}>
                  {planKey === 'enterprise' ? 'Custom' : `${plan.featuresIncluded}/5`}
                </div>
                <div style={{
                  fontSize: '0.9rem',
                  color: '#2c3e50'
                }}>
                  Analysis Features
                </div>
                <div style={{
                  fontSize: '0.8rem',
                  color: '#6c757d',
                  marginTop: '0.5rem'
                }}>
                  {actualCurrentPlan ? (
                    <>
                      Max: {getCombinedMonthlyLimit(actualCurrentPlan.planType, planKey)} ads/month
                      <div style={{ fontSize: '0.75rem', color: '#28a745', marginTop: '0.2rem' }}>
                        ({maxAdsPerMonth[actualCurrentPlan.planType] || 0} current + {plan.maxAdsPerMonth} new)
                      </div>
                    </>
                  ) : (
                    `Max: ${plan.maxAdsPerMonth} ads/month`
                  )}
                </div>
              </div>
              </div>

            <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '1rem',
              background: isCurrentPlan ? '#10b981' : selectedPlan === planKey ? plan.color : '#f8f9fa',
              color: isCurrentPlan ? 'white' : selectedPlan === planKey ? 'white' : '#2c3e50',
              borderRadius: '8px',
              fontWeight: 'bold'
            }}>
              {isCurrentPlan ? <Check size={20} /> : selectedPlan === planKey ? <Check size={20} /> : <Zap size={20} />}
              {isCurrentPlan ? 'Current Plan' : selectedPlan === planKey ? 'Selected' : 'Select Plan'}
            </div>
          </div>
          );
        })}
      </div>

      {/* Feature Selection for Lite Plan */}
      {selectedPlan === 'lite' && showFeatureSelection && (
        <div style={{
          background: '#f8f9fa',
          border: '2px solid #28a745',
          borderRadius: '12px',
          padding: '2rem',
          marginBottom: '2rem'
        }}>
          <h3 style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#28a745',
            marginBottom: '1rem',
            textAlign: 'center'
          }}>
            🎯 Select Your 4 Features (One-Time Choice)
          </h3>
          <p style={{
            textAlign: 'center',
            color: '#2c3e50',
            marginBottom: '2rem'
          }}>
            Choose 4 out of 5 features. This selection cannot be changed until your subscription renewal.
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1rem'
          }}>
            {allFeatures.map((feature) => (
              <div
                key={feature.id}
                onClick={() => handleFeatureToggle(feature.id)}
                  style={{
                  border: selectedFeatures.includes(feature.id) ? '2px solid #28a745' : '2px solid #e9ecef',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  background: selectedFeatures.includes(feature.id) ? '#d4edda' : 'var(--very-light-purple)',
                  opacity: !selectedFeatures.includes(feature.id) && selectedFeatures.length >= 4 ? 0.5 : 1,
                  pointerEvents: !selectedFeatures.includes(feature.id) && selectedFeatures.length >= 4 ? 'none' : 'auto'
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  marginBottom: '0.5rem'
                }}>
                  {feature.icon}
                  <h4 style={{
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    color: selectedFeatures.includes(feature.id) ? '#28a745' : '#2c3e50',
                    margin: 0
                  }}>
                    {feature.name}
                  </h4>
                  {selectedFeatures.includes(feature.id) && (
                    <Check size={20} color="#28a745" />
                  )}
                </div>
                <p style={{
                  color: '#2c3e50',
                  fontSize: '0.9rem',
                  margin: 0
                }}>
                  {feature.description}
                </p>
            </div>
          ))}
        </div>

      <div style={{ 
            textAlign: 'center',
            marginTop: '1.5rem',
            padding: '1rem',
            background: selectedFeatures.length === 4 ? '#d4edda' : '#fff3cd',
            border: selectedFeatures.length === 4 ? '1px solid #c3e6cb' : '1px solid #ffeaa7',
            borderRadius: '8px'
          }}>
            <strong>
              Selected: {selectedFeatures.length}/4 features
            </strong>
            {selectedFeatures.length < 4 && (
              <div style={{ color: '#856404', marginTop: '0.5rem' }}>
                Please select {4 - selectedFeatures.length} more feature{4 - selectedFeatures.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ad Count Selection */}
      {selectedPlan && selectedPlan !== 'enterprise' && (
        <div style={{
          background: 'var(--very-light-purple)',
          border: '2px solid #e9ecef',
          borderRadius: '12px',
          padding: '2rem',
          marginBottom: '2rem'
        }}>
          <h3 style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#2c3e50',
            marginBottom: '1rem',
            textAlign: 'center'
          }}>
            📊 Select Number of Ads
          </h3>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            marginBottom: '1.5rem'
          }}>
            <button
              onClick={() => setAdCount(Math.max(plans[selectedPlan]?.minOrderQty || 1, adCount - 1))}
              disabled={adCount <= (plans[selectedPlan]?.minOrderQty || 1)}
              style={{
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                cursor: adCount <= (plans[selectedPlan]?.minOrderQty || 1) ? 'not-allowed' : 'pointer',
                fontSize: '1.2rem'
              }}
            >
              −
            </button>
            
            <div style={{
              border: '2px solid #e9ecef',
              borderRadius: '8px',
              padding: '1rem 2rem',
              fontSize: '1.5rem',
              fontWeight: 'bold',
              color: '#2c3e50',
              minWidth: '80px',
              textAlign: 'center'
            }}>
              {adCount}
                    </div>
            
            <button
              onClick={() => {
                const maxAds = plans[selectedPlan]?.maxAdsTotal || 12;
                if (adCount < maxAds) {
                  setAdCount(adCount + 1);
                }
              }}
              disabled={adCount >= (plans[selectedPlan]?.maxAdsTotal || 12)}
              style={{
                background: (adCount >= (plans[selectedPlan]?.maxAdsTotal || 12)) ? '#ccc' : (plans[selectedPlan]?.color || '#6c757d'),
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                cursor: (adCount >= (plans[selectedPlan]?.maxAdsTotal || 12)) ? 'not-allowed' : 'pointer',
                fontSize: '1.2rem'
              }}
            >
              +
            </button>
      </div>

                <div style={{ 
            textAlign: 'center',
            color: '#2c3e50'
          }}>
            You can upload and analyze up to <strong>{adCount}</strong> ad{adCount !== 1 ? 's' : ''}
            <br />
            <small style={{ color: '#6c757d', fontSize: '0.85rem' }}>
              {selectedPlan === 'lite' && <span style={{ color: '#28a745', fontWeight: 'bold' }}>Range: 10-12 ads</span>}
              {selectedPlan === 'plus' && <span style={{ color: '#007bff', fontWeight: 'bold' }}>Range: 25-30 ads</span>}
              {selectedPlan === 'pro' && <span style={{ color: '#6f42c1', fontWeight: 'bold' }}>Range: 125-132 ads</span>}
            </small>
            <br />
            <small style={{ color: '#28a745', fontWeight: 'bold' }}>
              {formatCurrency(plans[selectedPlan]?.pricePerAd)}/ad • Min: {plans[selectedPlan]?.minOrderQty} ads
            </small>
          </div>
        </div>
      )}

      {/* Pricing Summary */}
      {selectedPlan && selectedPlan !== 'enterprise' && (
        <div style={{
          background: '#f8f9fa',
          border: '2px solid #6c757d',
          borderRadius: '12px',
          padding: '2rem',
          marginBottom: '2rem'
        }}>
          <h3 style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#2c3e50',
            marginBottom: '1.5rem',
            textAlign: 'center'
          }}>
            💰 Pricing Summary
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              background: 'var(--very-light-purple)',
              padding: '1rem',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.9rem', color: '#2c3e50', marginBottom: '0.5rem' }}>
                Plan
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: plans[selectedPlan]?.color || '#6c757d' }}>
                {plans[selectedPlan]?.name || 'Unknown Plan'}
              </div>
            </div>

            <div style={{
              background: 'var(--very-light-purple)',
              padding: '1rem',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.9rem', color: '#2c3e50', marginBottom: '0.5rem' }}>
                Features
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#2c3e50' }}>
                {selectedPlan === 'lite' ? selectedFeatures.length : '5'}/5
              </div>
            </div>

            <div style={{
              background: 'var(--very-light-purple)',
              padding: '1rem',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.9rem', color: '#2c3e50', marginBottom: '0.5rem' }}>
                Ad Quota
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#2c3e50' }}>
                {adCount} ad{adCount !== 1 ? 's' : ''}
              </div>
            </div>

              <div style={{
              background: 'var(--very-light-purple)',
              padding: '1rem',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.9rem', color: '#2c3e50', marginBottom: '0.5rem' }}>
                Validity
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#2c3e50' }}>
                {plans[selectedPlan]?.validity || '3 months'}
              </div>
            </div>
          </div>

          <div style={{
            background: plans[selectedPlan]?.color || '#6c757d',
            color: 'white',
            padding: '1.5rem',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
              Total Amount
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>
              {formatCurrency(totalPrice)}
            </div>
            <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
              One-time payment • Valid for {plans[selectedPlan]?.validity || '3 months'}
            </div>
          </div>
        </div>
      )}

      {/* Continue Button */}
      {selectedPlan && (
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleContinue}
            disabled={selectedPlan === 'lite' && selectedFeatures.length !== 4}
            style={{
              background: selectedPlan === 'lite' && selectedFeatures.length !== 4 ? '#ccc' : plans[selectedPlan]?.color || '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '1rem 3rem',
              fontSize: '1.2rem',
              fontWeight: 'bold',
              cursor: selectedPlan === 'lite' && selectedFeatures.length !== 4 ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease'
            }}
          >
            {selectedPlan === 'enterprise' 
              ? '🚀 Visit incivus.ai' 
              : `Continue to Payment → ${formatCurrency(totalPrice)}`
            }
          </button>
          
          {selectedPlan === 'lite' && selectedFeatures.length !== 4 && (
            <div style={{
              color: '#dc3545',
              marginTop: '1rem',
              fontSize: '0.9rem'
            }}>
              Please select exactly 4 features to continue
            </div>
          )}
      </div>
      )}
    </div>
  );
};

export default Upgrade; 