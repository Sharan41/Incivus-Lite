import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ENV_CONFIG from '../utils/environmentConfig';
import { Check, Star, Zap, Shield, Target, BarChart, Smartphone, Crown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, calculatePrice } from '../utils/formatHelpers';
import EnterpriseInfo from './EnterpriseInfo';

const PlanStructure = React.memo(({ onPlanSelect, preSelectedPlan = null, upgradeFeature = null }) => {
  console.log('🎯 PlanStructure: Component rendering with props:', { onPlanSelect: !!onPlanSelect, preSelectedPlan, upgradeFeature });
  
  // Move useAuth to top level to fix hooks error
  const { currentUser } = useAuth();
  
  const [selectedPlan, setSelectedPlan] = useState(preSelectedPlan || null);
  const [selectedFeatures, setSelectedFeatures] = useState([]);
  const [adCount, setAdCount] = useState(12); // Default to 12 for Lite plan
  const [showFeatureSelection, setShowFeatureSelection] = useState(false);
  const [currentUserPlan, setCurrentUserPlan] = useState(null);
  const [remainingAds, setRemainingAds] = useState(0);
  const [monthlyRemaining, setMonthlyRemaining] = useState(0);
  const [hasReachedLimits, setHasReachedLimits] = useState(false);
  
  // Define max ads per month for each plan
  const maxAdsPerMonth = {
    'lite': 4,   // Correct: 4 ads per month for Lite
    'plus': 5,   // Correct: 5 ads per month for Plus
    'pro': 11,   // Correct: 11 ads per month for Pro
    'enterprise': 999 // Unlimited
  };
  
  // Get current user plan and check quota limits
  useEffect(() => {
    const loadUserPlanData = async () => {
      if (!currentUser) return;
      
      try {
        // **SINGLE SOURCE OF TRUTH**: Use unified API for plan data
        const unifiedApi = await import('../utils/unifiedApiHelper').then(m => m.default);
        const userProfile = await unifiedApi.getUserProfile(currentUser.uid);
        const subscription = userProfile?.subscription || null;
        
        console.log('🎯 PlanStructure - Current user subscription data:', subscription);
        
        if (subscription && subscription.planType) {
          // Map plan types to our plan keys
          const planMap = {
            'lite': 'lite',
            'plus': 'plus', 
            'pro': 'pro',
            'enterprise': 'enterprise',
            'incivus_lite': 'lite',
            'incivus_plus': 'plus',
            'incivus_pro': 'pro'
          };
          
          const mappedPlan = planMap[subscription.planType.toLowerCase()];
          const totalRemaining = Math.max(0, subscription.adQuota || 0);
          const monthlyLimit = subscription.max_ads_per_month || maxAdsPerMonth[mappedPlan] || 0;
          const monthlyUsed = subscription.adsUsed || 0;
          const monthlyRemainingAds = Math.max(0, monthlyLimit - monthlyUsed);
          
          // Check if user has reached limits (either total ads or monthly limit)
          const reachedLimits = totalRemaining <= 0 || monthlyRemainingAds <= 0;
          
          setCurrentUserPlan(mappedPlan);
          setRemainingAds(totalRemaining);
          setMonthlyRemaining(monthlyRemainingAds);
          setHasReachedLimits(reachedLimits);
          
          console.log('✅ PlanStructure - Plan data loaded:', {
            plan: mappedPlan,
            totalRemaining,
            monthlyLimit,
            monthlyUsed,
            monthlyRemainingAds,
            reachedLimits
          });
        }
      } catch (error) {
        console.error('❌ PlanStructure - Error loading user plan data:', error);
        // Fallback to localStorage if API fails
        const subscription = JSON.parse(localStorage.getItem('incivus_subscription') || '{}');
        const planType = subscription.planType || subscription.plan;
        if (planType) {
          const planMap = {
            'lite': 'lite', 'plus': 'plus', 'pro': 'pro', 'enterprise': 'enterprise',
            'incivus_lite': 'lite', 'incivus_plus': 'plus', 'incivus_pro': 'pro'
          };
          const mappedPlan = planMap[planType.toLowerCase()];
          setCurrentUserPlan(mappedPlan);
          setRemainingAds(Math.max(0, subscription.adQuota || 0));
        }
      }
    };
    
    loadUserPlanData();
  }, [currentUser]);

  // Listen for subscription updates from payment completion
  useEffect(() => {
    const handleSubscriptionUpdate = (event) => {
      console.log('🔄 PlanStructure - Received subscription update event:', event.detail);
      // Force refresh subscription data
      if (currentUser && event.detail.userId === currentUser.uid) {
        console.log('🔄 PlanStructure - Refreshing subscription data after payment...');
        // Trigger loadUserPlanData by forcing a re-render
        setCurrentUserPlan(null); // This will cause the component to reload data
      }
    };

    window.addEventListener('subscriptionUpdated', handleSubscriptionUpdate);
    return () => window.removeEventListener('subscriptionUpdated', handleSubscriptionUpdate);
  }, [currentUser]);

  // Handle upgrade feature flow
  useEffect(() => {
    if (upgradeFeature) {
      console.log('🎯 Upgrade feature detected:', upgradeFeature);
      // Auto-select the plan that includes this feature
      const featurePlanMap = {
        'channel_compliance': 'plus',
        'brand_compliance': 'lite',
        'messaging_intent': 'lite',
        'funnel_compatibility': 'lite',
        'resonance_index': 'lite'
      };
      
      const recommendedPlan = featurePlanMap[upgradeFeature];
      if (recommendedPlan) {
        setSelectedPlan(recommendedPlan);
        console.log('✅ Auto-selected plan for feature:', recommendedPlan);
      }
      
      // Clear the upgrade feature flag
      localStorage.removeItem('incivus_upgrade_feature');
    }
  }, [upgradeFeature]);

  // Define all 5 features
  const allFeatures = [
    {
      id: 'brand_compliance',
      name: 'Brand Compliance',
      description: 'Ensure your Ads match brand guidelines',
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
      description: 'Check Ad fit in sales funnel stage',
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
  
  // Filter available plans based on current user plan (upgrade only)
  const getAvailablePlans = () => {
    if (!currentUserPlan) {
      // No current plan - show all plans
      return plans;
    }
    
    const currentIndex = planHierarchy.indexOf(currentUserPlan);
    const availablePlans = {};
    
    // Always show current plan (for topup) and higher plans (for upgrade)
    planHierarchy.forEach((planKey, index) => {
      if (index >= currentIndex && plans[planKey]) {
        availablePlans[planKey] = plans[planKey];
      }
    });
    
    console.log('🎯 PlanStructure - Available plans:', {
      currentUserPlan,
      hasReachedLimits,
      remainingAds,
      monthlyRemaining,
      availablePlans: Object.keys(availablePlans)
    });
    
    return availablePlans;
  };

  const plans = {
    lite: {
      name: 'Incivus_Lite',
      subtitle: '',
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
      upgradeClickbait: 'get all 5 metrics and do more Ads per month'
    },
    plus: {
      name: 'Incivus_Plus',
      subtitle: '',
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
      upgradeClickbait: 'get all 5 metrics and do more Ads per month'
    },
    pro: {
      name: 'Incivus_Pro',
      subtitle: '',
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
      subtitle: 'Unlimited Ads & Custom Solutions',
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

  // Calculate pricing with useMemo for better performance
  const totalPrice = useMemo(() => {
    if (!selectedPlan) return 0;

    const plan = plans[selectedPlan];
    let price = 0;

    if (selectedPlan === 'lite') {
      // Minimum 10 Ads at $5 per Ad = $50
      const minAds = plan.minOrderQty;
      const finalAdCount = Math.max(adCount, minAds);
      price = calculatePrice(finalAdCount, plan.pricePerAd);
    } else if (selectedPlan === 'plus') {
      // Minimum 25 Ads at $4 per Ad = $100
      const minAds = plan.minOrderQty;
      const finalAdCount = Math.max(adCount, minAds);
      price = calculatePrice(finalAdCount, plan.pricePerAd);
    } else if (selectedPlan === 'pro') {
      // Minimum 125 Ads at $3.2 per Ad = $400
      const minAds = plan.minOrderQty;
      const finalAdCount = Math.max(adCount, minAds);
      price = calculatePrice(finalAdCount, plan.pricePerAd);
    }

    return price;
  }, [selectedPlan, adCount]);

  const handlePlanSelection = (planKey) => {
    // Allow selecting current plan for topup
    setSelectedPlan(planKey);
    setSelectedFeatures([]);
    
    // **FIX**: Set minimum ad count for each plan (users can select within range)
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
      let newFeatures;
      if (prev.includes(featureId)) {
        newFeatures = prev.filter(id => id !== featureId);
        console.log(`🔍 Feature REMOVED: ${featureId}`);
      } else if (prev.length < 4) {
        newFeatures = [...prev, featureId];
        console.log(`🔍 Feature ADDED: ${featureId}`);
      } else {
        console.log(`🔍 Feature selection BLOCKED: Already have 4 features, cannot add ${featureId}`);
        return prev;
      }
      
      // **DEBUG**: Show exactly what features are selected
      const featureNames = newFeatures.map(id => {
        const feature = allFeatures.find(f => f.id === id);
        return feature ? feature.name : id;
      });
      
      console.log('🔍 Current selected features:', newFeatures);
      console.log('🔍 Feature names:', featureNames);
      
      return newFeatures;
    });
  };

  const handleContinue = async () => {
    if (!selectedPlan) {
      alert('Please select a plan');
      return;
    }

    // Handle Enterprise external link
    if (selectedPlan === 'enterprise') {
      window.location.href = 'https://incivus.ai/';
      return;
    }

    if (selectedPlan === 'lite' && selectedFeatures.length !== 4) {
      alert('Please select exactly 4 features for Incivus Lite');
      return;
    }

    if (adCount < 1) {
      alert('Please select at least 1 Ad');
      return;
    }

    // **FIX**: Check localStorage flag from Analysis component for forced topup detection
    const topupReason = localStorage.getItem('incivus_topup_reason');
    console.log('🔍 TOPUP REASON from Analysis:', topupReason);
    
    // Check if this is a topup (same plan) or upgrade (different plan) by fetching current subscription
    let isTopup = false;
    let isUpgrade = false;
    let currentSubscription = null;
    const userId = currentUser?.uid || localStorage.getItem('incivus_user_id');
    
    if (userId) {
      try {
        const response = await fetch(`${ENV_CONFIG.PYTHON_API_URL}/get-user-profile/${userId}`);
        if (response.ok) {
          const userData = await response.json();
          currentSubscription = userData.subscription;
          
          console.log('🔍 RAW USER DATA from API:', userData);
          console.log('🔍 RAW SUBSCRIPTION DATA:', currentSubscription);
          console.log('🔍 DETAILED subscription analysis:', {
            hasSubscription: !!currentSubscription,
            planType: currentSubscription?.planType,
            paymentStatus: currentSubscription?.paymentStatus,
            selectedPlan: selectedPlan,
            isSamePlan: currentSubscription?.planType === selectedPlan,
            fullSubscription: currentSubscription
          });
          
          console.log('🔍 PLAN COMPARISON:', {
            currentPlanType: currentSubscription?.planType,
            selectedPlan: selectedPlan,
            directComparison: currentSubscription?.planType === selectedPlan,
            currentPlanTypeof: typeof currentSubscription?.planType,
            selectedPlanTypeof: typeof selectedPlan
          });
          
          // **CRITICAL FIX**: Handle quota exhaustion but respect user's plan choice (topup vs upgrade)
          if (topupReason === 'monthly_limit_reached' || topupReason === 'quota_exhausted') {
            console.log('🔄 QUOTA EXHAUSTED - Determining if this is topup or upgrade based on plan selection');
            
            if (currentSubscription && currentSubscription.planType === selectedPlan) {
              isTopup = true;
              console.log('🔄 FORCING TOPUP - User selected same plan after quota exhaustion:', selectedPlan);
            } else if (currentSubscription && currentSubscription.planType !== selectedPlan) {
              isUpgrade = true;
              console.log('⬆️ FORCING UPGRADE - User selected different plan after quota exhaustion:', currentSubscription.planType, '→', selectedPlan);
            } else {
              console.log('🆕 NEW SUBSCRIPTION - No current subscription found');
            }
            
            // Clear the flag after use
            localStorage.removeItem('incivus_topup_reason');
          } else if (currentSubscription && currentSubscription.planType) {
            // **FIX**: More lenient check - consider any subscription with planType (not just completed)
            // This handles cases where payment status might be inconsistent
            console.log('🔍 COMPARING PLANS:', `"${currentSubscription.planType}" === "${selectedPlan}"`);
            
            if (currentSubscription.planType === selectedPlan) {
              isTopup = true;
              console.log('🔄 PlanStructure detected TOPUP (same plan):', selectedPlan);
              console.log('🔄 Payment status:', currentSubscription.paymentStatus);
            } else {
              isUpgrade = true;
              console.log('⬆️ PlanStructure detected UPGRADE (different plan):', currentSubscription.planType, '→', selectedPlan);
              console.log('⬆️ Payment status:', currentSubscription.paymentStatus);
            }
          } else {
            console.log('🆕 PlanStructure detected NEW subscription:', selectedPlan);
            console.log('🔍 Reason for NEW subscription:', {
              hasSubscription: !!currentSubscription,
              hasCurrentSubscription: !!currentSubscription,
              hasPlanType: !!currentSubscription?.planType,
              planType: currentSubscription?.planType,
              paymentStatus: currentSubscription?.paymentStatus
            });
          }
        }
      } catch (error) {
        console.warn('⚠️ Could not fetch current subscription in PlanStructure:', error);
      }
    }

    const planData = {
      planType: selectedPlan,
      planName: plans[selectedPlan]?.name,
      features: selectedFeatures,
      selectedFeatures: selectedFeatures,
      adQuota: adCount,
      max_ads_per_month: maxAdsPerMonth[selectedPlan] || 4,
      totalPrice: totalPrice,
      validity: plans[selectedPlan]?.validity,
      validityDays: selectedPlan === 'lite' ? 90 : selectedPlan === 'plus' ? 180 : selectedPlan === 'pro' ? 365 : 365,
      subscriptionStartDate: new Date(),
      subscriptionEndDate: new Date(Date.now() + (selectedPlan === 'lite' ? 90 : selectedPlan === 'plus' ? 180 : selectedPlan === 'pro' ? 365 : 365) * 24 * 60 * 60 * 1000),
      // Add topup and upgrade flags for ShopifyPayment to use
      isTopup: isTopup,
      isUpgrade: isUpgrade,
      currentSubscription: currentSubscription
    };
    
    console.log('🎯 FINAL PLAN DATA being sent to ShopifyPayment:', planData);
    console.log('🔍 FEATURE SELECTION DEBUG: selectedFeatures array:', selectedFeatures);
    console.log('🔍 FEATURE SELECTION DEBUG: Feature names selected:');
    selectedFeatures.forEach(featureId => {
      const feature = allFeatures.find(f => f.id === featureId);
      console.log(`   ✅ ${featureId} = ${feature ? feature.name : 'Unknown Feature'}`);
    });
    console.log('🎯 FLAGS CHECK:', {
      isTopup: isTopup,
      isUpgrade: isUpgrade,
      hasCurrentSubscription: !!currentSubscription
    });

    // **FIX**: Skip saving to database here - let ShopifyPayment handle it to avoid duplicates
    console.log('🔄 Skipping plan save in PlanStructure - ShopifyPayment will handle subscription creation');

    onPlanSelect(planData);
  };

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
          {currentUserPlan ? 'Upgrade Your Plan' : 'Choose Your Incivus Plan'}
        </h1>
        <p style={{
          fontSize: '1.1rem',
          color: '#2c3e50',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          {currentUserPlan 
            ? 'Upgrade to unlock more features and higher ad limits. Your unused ads will carry forward!'
            : 'Select the plan that best fits your advertising analysis needs. Choose your features and Ad quota to get started.'
          }
        </p>
        
        {/* Show carryover information for existing users with remaining ads */}
        {currentUserPlan && remainingAds > 0 && !hasReachedLimits && (
          <div style={{
            background: '#e8f5e8',
            border: '2px solid #28a745',
            borderRadius: '12px',
            padding: '1rem',
            margin: '1rem auto',
            maxWidth: '500px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem'
          }}>
            <Star size={20} color="#28a745" />
            <div style={{ color: '#155724', fontWeight: 'bold' }}>
              You have {remainingAds} unused ads that will carry forward to your new plan!
            </div>
          </div>
        )}

        {/* Show quota reached message when user has reached limits */}
        {currentUserPlan && hasReachedLimits && (
          <div style={{
            background: '#fff3cd',
            border: '2px solid #ffc107',
            borderRadius: '12px',
            padding: '1rem',
            margin: '1rem auto',
            maxWidth: '500px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem'
          }}>
            <BarChart size={20} color="#856404" />
            <div style={{ color: '#856404', fontWeight: 'bold' }}>
              {remainingAds <= 0 
                ? `${plans[currentUserPlan]?.name} - All ads used. Choose your current plan to topup or upgrade to continue!`
                : `${plans[currentUserPlan]?.name} - Monthly limit reached. Choose your current plan to topup or upgrade for more!`
              }
            </div>
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
        {Object.entries(getAvailablePlans()).map(([planKey, plan]) => {
          const isCurrentPlan = currentUserPlan === planKey;
          const isUpgrade = currentUserPlan && planHierarchy.indexOf(planKey) > planHierarchy.indexOf(currentUserPlan);
          
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
              background: isCurrentPlan ? '#f0fdf4' : selectedPlan === planKey ? '#f8f9fa' : 'white',
              position: 'relative',
              boxShadow: isCurrentPlan ? '0 8px 25px #10b98130' : selectedPlan === planKey ? `0 8px 25px ${plan.color}30` : '0 4px 6px rgba(0,0,0,0.1)',
              opacity: 1
            }}
          >
            {plan.popular && !isCurrentPlan && (
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
            
            {isUpgrade && (
              <div style={{
                position: 'absolute',
                top: '-10px',
                right: '20px',
                background: '#f59e0b',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: 'bold'
              }}>
                ⬆️ UPGRADE
              </div>
            )}

            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{
                fontSize: '1.8rem',
                fontWeight: 'bold',
                color: plan.color,
                marginBottom: '0.5rem'
              }}>
                {plan.name}
              </h3>
              <p style={{
                color: '#2c3e50',
                marginBottom: '1rem'
              }}>
                {plan.subtitle}
              </p>
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
                Max: {plan.maxAdsPerMonth} Ads/month
              </div>
            </div>
            </div>

            {/* Upgrade clickbait for higher plans */}
            {isUpgrade && (
              <div style={{
                background: '#fff3cd',
                border: '1px solid #ffeaa7',
                borderRadius: '8px',
                padding: '0.75rem',
                marginBottom: '1rem',
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '0.9rem',
                  color: '#856404',
                  fontWeight: 'bold'
                }}>
                  🚀 {plan.upgradeClickbait}
                </div>
              </div>
            )}

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

      {/* Enterprise Information */}
      {selectedPlan === 'enterprise' && (
        <EnterpriseInfo />
      )}

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
                  background: selectedFeatures.includes(feature.id) ? '#d4edda' : 'white',
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
          background: 'white',
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
            📊 Select Ad Quota
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
                background: (adCount >= (plans[selectedPlan]?.maxAdsTotal || 12)) ? '#ccc' : (selectedPlan ? plans[selectedPlan]?.color : '#ccc'),
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
            color: '#6c757d',
            fontSize: '0.9rem'
          }}>
            {selectedPlan === 'lite' && (
              <>
                <strong style={{ color: '#28a745' }}>Incivus Lite Range: 10-12 ads</strong>
                <br />
                Minimum order: 10 ads • Maximum: 12 ads
              </>
            )}
            {selectedPlan === 'plus' && (
              <>
                <strong style={{ color: '#007bff' }}>Incivus Plus Range: 25-30 ads</strong>
                <br />
                Minimum order: 25 ads • Maximum: 30 ads
              </>
            )}
            {selectedPlan === 'pro' && (
              <>
                <strong style={{ color: '#6f42c1' }}>Incivus Pro Range: 125-132 ads</strong>
                <br />
                Minimum order: 125 ads • Maximum: 132 ads
              </>
            )}
          </div>

          <div style={{
            textAlign: 'center',
            color: '#2c3e50'
          }}>
            You can upload and analyze up to <strong>{adCount}</strong> Ad{adCount !== 1 ? 's' : ''}
            <br />
            <small style={{ color: '#6c757d', fontSize: '0.85rem' }}>
              Max allowed for {plans[selectedPlan]?.name}: <strong>{plans[selectedPlan]?.maxAdsTotal || 12} ads</strong>
            </small>
            <br />
            <small style={{ color: '#28a745', fontWeight: 'bold' }}>
              Minimum Order: {plans[selectedPlan]?.minOrderQty} Ads at {formatCurrency(plans[selectedPlan]?.pricePerAd)}/Ad
              <br />
              Min Commitment: {formatCurrency(plans[selectedPlan]?.minCommitment)}
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
              background: 'white',
              padding: '1rem',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.9rem', color: '#2c3e50', marginBottom: '0.5rem' }}>
                Plan
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: selectedPlan ? plans[selectedPlan]?.color : '#000' }}>
                {selectedPlan ? plans[selectedPlan]?.name : 'Select a plan'}
              </div>
            </div>

            <div style={{
              background: 'white',
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
              background: 'white',
              padding: '1rem',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.9rem', color: '#2c3e50', marginBottom: '0.5rem' }}>
                Ad Quota
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#2c3e50' }}>
                {adCount} Ad{adCount !== 1 ? 's' : ''}
              </div>
            </div>

            <div style={{
              background: 'white',
              padding: '1rem',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.9rem', color: '#2c3e50', marginBottom: '0.5rem' }}>
                Validity
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#2c3e50' }}>
                {selectedPlan ? plans[selectedPlan]?.validity : 'N/A'}
              </div>
            </div>
          </div>

          <div style={{
            background: selectedPlan ? plans[selectedPlan]?.color : '#ccc',
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
              One-time payment • Valid for {selectedPlan ? plans[selectedPlan]?.validity : 'N/A'}
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
              background: selectedPlan === 'lite' && selectedFeatures.length !== 4 ? '#ccc' : (selectedPlan ? plans[selectedPlan]?.color : '#ccc'),
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
});

export default PlanStructure;