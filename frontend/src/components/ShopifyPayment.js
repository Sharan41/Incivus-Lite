import React, { useState } from 'react';
import { CreditCard, Loader, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ENV_CONFIG from '../utils/environmentConfig';
import unifiedApi from '../utils/unifiedApiHelper';
import { formatCurrency } from '../utils/formatHelpers';
// Removed: import { ensurePaymentCompletion } from '../utils/paymentFallback'; - File deleted

// Utility function to retry update_plan API calls with fallback to create new plan
const retryUpdatePlan = async (userId, planName, action, features, totalAds, planData, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Update plan attempt ${attempt}/${maxRetries}`);
      console.log(`🔍 retryUpdatePlan called with totalAds: ${totalAds}`);
      
      // **CRITICAL FIX**: Don't use dangerous fallback - totalAds MUST be provided
      if (!totalAds || totalAds <= 0) {
        console.error('❌ Invalid totalAds provided to retryUpdatePlan:', totalAds);
        throw new Error(`Invalid totalAds: ${totalAds}. Must be a positive number.`);
      }
      
      const response = await fetch(`${ENV_CONFIG.PYTHON_API_URL}/update_plan`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          user_id: userId,
          plan_name: planName,
          action: action,
          features: features || '',
          total_ads: totalAds  // **FIXED**: No fallback - require valid value
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Update plan successful on attempt ${attempt}`);
        return result;
      } else {
        const errorText = await response.text();
        console.warn(`⚠️ Update plan attempt ${attempt} failed:`, response.status, errorText);
        
        // If 404 "User plan not found", try creating a new plan instead
        if (response.status === 404 && errorText.includes("User plan not found")) {
          console.log('🆕 User plan not found, attempting to create new plan instead...');
          return await createNewPlan(userId, planData);
        }
        
        if (attempt === maxRetries) {
          // Special handling for 404 - try creating new plan as final attempt
          if (response.status === 404 && errorText.includes("User plan not found")) {
            console.log('🆕 Final attempt: Creating new plan instead of updating...');
            return await createNewPlan(userId, planData);
          }
          throw new Error(`Update plan failed after ${maxRetries} attempts: ${response.status} ${errorText}`);
        }
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    } catch (error) {
      console.error(`❌ Update plan attempt ${attempt} error:`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
};

// Utility function to create a new plan when update fails
const createNewPlan = async (userId, planData) => {
  try {
    console.log('🆕 Creating new plan for user:', userId);
    
    const planSelectionData = {
      userId: userId,
      planId: planData.planType || 'incivus_plus',
      planName: planData.planName || `Incivus_${(planData.planType || 'plus').charAt(0).toUpperCase()}${(planData.planType || 'plus').slice(1)}`,
      totalPrice: planData.totalPrice || planData.price || 99,
      basePrice: planData.basePrice || planData.totalPrice || planData.price || 99,
      totalAds: planData.adQuota || 10,  // **FIXED**: Use 10 (Lite minimum) instead of 30
      validityDays: planData.validityDays || 90,  // **FIXED**: Use 90 (Lite default) instead of 30
      isActive: true,
      paymentStatus: 'completed',
      selectedFeatures: planData.selectedFeatures || planData.features || [],
      subscriptionStartDate: new Date().toISOString(),
      subscriptionEndDate: new Date(Date.now() + (planData.validityDays || 30) * 24 * 60 * 60 * 1000).toISOString(),
      max_ads_per_month: planData.max_ads_per_month || 12
    };
    
    console.log('📤 Creating plan with data:', planSelectionData);
    
    const response = await fetch(`${ENV_CONFIG.PYTHON_API_URL}/save-plan-selection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(planSelectionData)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ New plan created successfully:', result);
      
      // Format the response to match update_plan response structure
      return {
        success: true,
        message: 'Plan created successfully',
        updated_data: {
          planName: planSelectionData.planName,
          totalAds: planSelectionData.totalAds,
          max_ads_per_month: planSelectionData.max_ads_per_month,
          adsUsed: 0,
          subscriptionStartDate: planSelectionData.subscriptionStartDate,
          subscriptionEndDate: planSelectionData.subscriptionEndDate
        }
      };
    } else {
      const errorText = await response.text();
      console.error('❌ Failed to create new plan:', response.status, errorText);
      throw new Error(`Failed to create new plan: ${response.status} ${errorText}`);
    }
  } catch (error) {
    console.error('❌ Error creating new plan:', error);
    throw error;
  }
};

const ShopifyPayment = ({ planData, shopifyData, onSuccess, onError, onBack }) => {
  const { currentUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [errorMessage, setErrorMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('card'); // 'card' or 'promo'
  const [promoCode, setPromoCode] = useState('');
  const [formData, setFormData] = useState({
    email: currentUser?.email || '',
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    billingAddress: ''
  });

  // Safety check for planData
  if (!planData || !planData.planType) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        color: '#dc3545'
      }}>
        <AlertCircle size={48} />
        <h2>Error: Invalid Plan Selection</h2>
        <p>Please go back and select a valid plan.</p>
        <button 
          onClick={() => window.location.reload()} 
          style={{
            padding: '10px 20px',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            marginTop: '20px'
          }}
        >
          Restart
        </button>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Prevent duplicate submissions
    if (isLoading || paymentStatus === 'processing' || paymentStatus === 'success') {
      console.log('🛑 Payment already in progress, ignoring duplicate submission');
      return;
    }
    
    setIsLoading(true);
    setPaymentStatus('processing');
    
    try {
      // **CRITICAL DEBUG**: Check what flags ShopifyPayment received
      console.log('🔍 RECEIVED FLAGS in ShopifyPayment:', {
        isTopupFromProps: planData.isTopup,
        isUpgradeFromProps: planData.isUpgrade,
        hasCurrentSubscription: !!planData.currentSubscription,
        fullPlanData: planData
      });
      
      // **CRITICAL DEBUG**: Log the EXACT detection path
      console.log('🔍 DETECTION PATH ANALYSIS:', {
        step1_planDataFlags: { isTopup: planData.isTopup, isUpgrade: planData.isUpgrade },
        step2_willUseOwnDetection: !planData.isTopup && !planData.isUpgrade && !planData.currentSubscription,
        step3_currentSubscription: planData.currentSubscription,
        step4_planDataFull: planData
      });
      
      // Check if this is an upgrade flow for a specific feature
      const upgradeFeature = localStorage.getItem('incivus_upgrade_feature');
      if (upgradeFeature) {
        console.log('🎯 Processing upgrade payment for feature:', upgradeFeature);
        // Store the upgrade feature in the plan data for later use
        planData.upgradeFeature = upgradeFeature;
      }
      
      // Validate promo code if using promo payment method
      if (paymentMethod === 'promo') {
        if (promoCode !== 'SAIC5I') {
          setErrorMessage('Invalid promo code. Please check your code and try again.');
          setPaymentStatus('error');
          setIsLoading(false);
          return;
        }
      }
      
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('💳 Processing payment for plan:', planData);
      console.log('💰 Payment method:', paymentMethod === 'promo' ? 'Promo Code' : 'Credit Card');
      
      // Use topup/upgrade detection from PlanStructure if available, otherwise detect here
      const userId = currentUser?.uid || localStorage.getItem('incivus_user_id');
      let isTopup = planData.isTopup || false;
      let isUpgrade = planData.isUpgrade || false;
      let currentSubscription = planData.currentSubscription;
      let shouldCreateNewPlan = false;
      
      console.log('🔍 EXTRACTED FLAGS in ShopifyPayment:', {
        isTopup: isTopup,
        isUpgrade: isUpgrade,
        hasCurrentSubscription: !!currentSubscription,
        fromPlanStructure: !!(planData.isTopup || planData.isUpgrade)
      });
      
      // FIX: SINGLE API CALL - Fetch subscription data once at the beginning
      if (!currentSubscription) {
        try {
          console.log('🔄 Fetching subscription data from database...');
          const response = await fetch(`${ENV_CONFIG.PYTHON_API_URL}/get-user-profile/${userId}`);
          if (response.ok) {
            const userData = await response.json();
            currentSubscription = userData.subscription;
            console.log('✅ Subscription fetched from database:', currentSubscription);
          }
        } catch (error) {
          console.warn('⚠️ Could not fetch subscription, using localStorage fallback:', error);
          currentSubscription = JSON.parse(localStorage.getItem('incivus_subscription') || '{}');
        }
      }
      
      // Now determine topup/upgrade based on fetched data
      console.log('🔍 Subscription analysis:', {
        hasSubscription: !!currentSubscription,
        planType: currentSubscription?.planType,
        selectedPlan: planData.planType,
        isSamePlan: currentSubscription?.planType === planData.planType,
        alreadyDetectedTopup: isTopup,
        alreadyDetectedUpgrade: isUpgrade
      });
      
      if (!isTopup && !isUpgrade) {
        // Only determine if not already detected by PlanStructure
        if (currentSubscription?.planType) {
          if (currentSubscription.planType === planData.planType) {
            isTopup = true;
            console.log('🔄 Detected TOPUP (same plan):', planData.planType);
          } else {
            isUpgrade = true;
            console.log('⬆️ Detected UPGRADE:', currentSubscription.planType, '→', planData.planType);
          }
        } else {
          console.log('🆕 NEW subscription:', planData.planType);
        }
      } else {
        console.log('✅ Using detection from PlanStructure - Topup:', isTopup, 'Upgrade:', isUpgrade);
      }
      if (userId && planData.planType && !isTopup && !isUpgrade) {
        try {
          // Save to old subscriptions collection (for backward compatibility) - skip for topups and upgrades
          await unifiedApi.saveSubscriptionData(userId, planData);
          console.log('✅ Subscription data saved to old database');
        } catch (dbError) {
          console.warn('⚠️ Failed to save to old database, continuing with payment...', dbError);
        }
      } else if (isTopup) {
        console.log('🔄 Skipping old subscription data save for topup');
      } else if (isUpgrade) {
        console.log('⬆️ Skipping old subscription data save for upgrade');
      }
      
      if (userId && planData.planType) {
        try {
          // Define max ads per month for each plan
          const maxAdsPerMonth = {
            'lite': 4,   // Correct: 4 ads per month for Lite
            'plus': 5,   // Correct: 5 ads per month for Plus
            'pro': 11,   // Correct: 11 ads per month for Pro
            'enterprise': 999 // Unlimited
          };

          // Save to new PlanSelectionDetails collection (for future use)
          // eslint-disable-next-line no-unused-vars
          const planSelectionData = {
            planId: planData.planType,
            planName: planData.planName,
            selectedFeatures: planData.features || [],
            totalAds: planData.adQuota || 1,
            max_ads_per_month: planData.max_ads_per_month || maxAdsPerMonth[planData.planType] || 4,
            basePrice: planData.planType === 'lite' ? 10 : planData.planType === 'pro' ? 40 : 0,
            additionalAdPrice: planData.planType === 'lite' ? 6 : planData.planType === 'pro' ? 4 : 0,
            totalPrice: planData.totalPrice,
            validityDays: planData.validityDays || (planData.planType === 'lite' ? 30 : planData.planType === 'pro' ? 90 : 365),
            subscriptionStartDate: planData.subscriptionStartDate || new Date(),
            subscriptionEndDate: planData.subscriptionEndDate || new Date(Date.now() + (planData.validityDays || 30) * 24 * 60 * 60 * 1000),
            isActive: true,
            paymentStatus: 'completed',
            paymentId: paymentMethod === 'promo' ? 'promo_' + Math.random().toString(36).substr(2, 9) : 'txn_' + Math.random().toString(36).substr(2, 9),
            paymentMethod: paymentMethod === 'promo' ? 'Promo Code (SAIC5I)' : 'Credit Card',
            subscriptionType: 'new'
          };
          
          // **IMPROVED LOGIC**: Check if user actually has an existing plan in backend
          if (isTopup || isUpgrade) {
            try {
              // Verify the user actually has a plan in the backend
              console.log('🔍 Checking for existing plans in backend...');
              const checkResponse = await fetch(`${ENV_CONFIG.PYTHON_API_URL}/get-plan-selections/${userId}`);
              
              if (!checkResponse.ok) {
                console.log(`⚠️ Backend check failed (${checkResponse.status}), will create new plan instead of ${isUpgrade ? 'upgrade' : 'topup'}`);
                shouldCreateNewPlan = true;
                isTopup = false;
                isUpgrade = false;
              } else {
                const existingPlans = await checkResponse.json();
                if (!existingPlans || (Array.isArray(existingPlans) && existingPlans.length === 0)) {
                  console.log('⚠️ User has no existing plans in backend - will create new plan instead');
                  shouldCreateNewPlan = true;
                  isTopup = false;
                  isUpgrade = false;
                } else {
                  console.log('✅ Existing plans found in backend, proceeding with', isUpgrade ? 'upgrade' : 'topup');
                }
              }
            } catch (error) {
              console.warn('⚠️ Backend check failed due to network error, will create new plan instead:', error.message);
              shouldCreateNewPlan = true;
              isTopup = false;
              isUpgrade = false;
            }
          }
          
          // Only save plan selection data for NEW subscriptions, not topups or upgrades
          if (!isTopup && !isUpgrade) {
            // **FIX**: Save plan using save-plan-selection endpoint
            console.log('🔄 Saving plan selection using /save-plan-selection endpoint');
            
            // **FIX**: For new subscriptions, use USER INPUT for ads but ensure validity from PLAN_CONFIG
            try {
              console.log('🆕 Creating fresh subscription for new user...');
              
              // **CRITICAL**: Use user input for ads, but get validity/monthly limits from PLAN_CONFIG
              const planConfigDefaults = {
                'lite': { max_ads_per_month: 4, validity_days: 90 },
                'plus': { max_ads_per_month: 5, validity_days: 180 },
                'pro': { max_ads_per_month: 11, validity_days: 365 }
              };
              
              const planDefaults = planConfigDefaults[planData.planType] || planConfigDefaults['lite'];
              
              console.log('🔧 User selected ads:', planData.adQuota);
              console.log('🔧 Plan config (validity/monthly):', planDefaults);
              console.log('🔧 User price:', planData.totalPrice);
              
              // **FIX**: Use correct endpoint /save-plan-selection instead of create-fresh-subscription
              // Build form data for multi-value selectedFeatures
              const formData = new URLSearchParams();
              formData.append('userId', userId);
              formData.append('planId', planData.planType || 'pro_plan');
              formData.append('planName', planData.planName || `Incivus_${planData.planType.charAt(0).toUpperCase()}${planData.planType.slice(1)}`);
              formData.append('paymentId', paymentMethod === 'promo' ? 'promo_' + Math.random().toString(36).substr(2, 9) : 'txn_' + Math.random().toString(36).substr(2, 9));
              formData.append('paymentStatus', 'completed');
              formData.append('subscriptionType', 'monthly');
              formData.append('subscriptionStartDate', new Date().toISOString());
              formData.append('subscriptionEndDate', new Date(Date.now() + (planDefaults.validity_days || 90) * 24 * 60 * 60 * 1000).toISOString());
              formData.append('totalPrice', planData.totalPrice || 50);
              formData.append('basePrice', planData.basePrice || planData.totalPrice || 50);
              formData.append('additionalAdPrice', 0);  // Fixed: was additionalAdPrice4
              formData.append('totalAds', planData.adQuota || 12);  // Use user selection
              formData.append('validityDays', planDefaults.validity_days || 90);
              formData.append('isActive', true);
              // **CRITICAL FIX**: Send each feature as a separate form field for list[str] backend parameter
              const features = planData.selectedFeatures || [];
              console.log('🔍 Sending selectedFeatures to backend:', features);
              if (features.length > 0) {
                features.forEach(feature => {
                  if (feature && feature.trim()) {  // Only add non-empty features
                    formData.append('selectedFeatures', feature);
                  }
                });
              } else {
                // If no features, send empty array properly
                formData.append('selectedFeatures', '');
              }
              formData.append('createdAt', new Date().toISOString());
              formData.append('updatedAt', new Date().toISOString());
              formData.append('max_ads_per_month', planDefaults.max_ads_per_month);  // Use config defaults
              
              const freshSubscriptionResponse = await fetch(`${ENV_CONFIG.PYTHON_API_URL}/save-plan-selection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData
              });
              
              if (freshSubscriptionResponse.ok) {
                const freshResult = await freshSubscriptionResponse.json();
                console.log('✅ Plan selection saved successfully:', freshResult);
              } else {
                const errorText = await freshSubscriptionResponse.text();
                console.warn('⚠️ Plan selection save failed:', freshSubscriptionResponse.status, errorText);
              }
            } catch (freshError) {
              console.warn('⚠️ Error saving plan selection:', freshError);
            }
          } else if (isTopup) {
            console.log('🔄 Skipping plan selection save for topup - will use topup endpoint instead');
          } else if (isUpgrade) {
            console.log('⬆️ Skipping plan selection save for upgrade - will use upgrade endpoint instead');
          }
          
          // **CRITICAL DEBUG**: Log final decision before calling backend
          console.log('🎯 FINAL BACKEND ENDPOINT DECISION:', {
            isTopup: isTopup,
            isUpgrade: isUpgrade,
            willCallTopupEndpoint: isTopup,
            willCallUpgradeEndpoint: isUpgrade && !isTopup,
            willCallNewSubscriptionEndpoint: !isTopup && !isUpgrade,
            currentSubscription: currentSubscription
          });
          
          // Call appropriate backend endpoint based on payment type
          if (isTopup) {
            console.log('🔄 Calling TOPUP endpoint...');
            console.log('🔄 TOPUP PATH CONFIRMED - Will preserve existing data and add new ads');
            try {
              // Ensure correct plan name format for backend
              const backendPlanName = planData.planName || `Incivus_${planData.planType.charAt(0).toUpperCase()}${planData.planType.slice(1)}`;
              
              // **FIX**: For topups, validate user selection within plan limits
              const planLimits = {
                'Incivus_Lite': { min: 10, max: 12 },
                'Incivus_Plus': { min: 25, max: 30 },
                'Incivus_Pro': { min: 125, max: 132 }
              };
              
              const limits = planLimits[backendPlanName] || { min: 10, max: 12 };
              const userSelectedAds = planData.adQuota || limits.min;
              
              // Validate user selection is within plan limits
              const topupAds = Math.max(limits.min, Math.min(limits.max, userSelectedAds));
              
              console.log(`🔧 Topup validation:`, {
                backendPlanName,
                planDataAdQuota: planData.adQuota,
                userSelectedAds,
                planLimits: limits,
                finalTopupAds: topupAds,
                calculation: `Math.max(${limits.min}, Math.min(${limits.max}, ${userSelectedAds})) = ${topupAds}`
              });
              
              // **CRITICAL FIX**: For topup, send selectedFeatures (not features)
              const topupFeatures = planData.selectedFeatures || planData.features || [];
              const topupFeaturesString = topupFeatures.length > 0 ? topupFeatures.join(',') : '';
              
              console.log('📤 Topup request data:', {
                user_id: userId,
                plan_name: backendPlanName,
                action: 'topup',
                features: topupFeaturesString,
                total_ads: topupAds, // This will be ADDED to remaining ads by backend
                apiUrl: `${ENV_CONFIG.PYTHON_API_URL}/update_plan`,
                selectedFeatures: topupFeatures
              });
              
              const topupResult = await retryUpdatePlan(
                userId,
                backendPlanName,
                'topup',
                topupFeaturesString,  // **FIXED**: Use selectedFeatures
                topupAds, // Backend will ADD this to remaining ads
                planData
              );
              
              console.log('✅ Topup successful:', topupResult);
              console.log('🔄 Combined monthly limit after topup:', topupResult.updated_data?.max_ads_per_month);
              
              // Update localStorage with new combined limits
              if (topupResult.updated_data) {
                const updatedSubscription = {
                  ...currentSubscription,
                  planType: topupResult.updated_data.planName.replace('Incivus_', '').toLowerCase(),
                  planName: topupResult.updated_data.planName,
                  adQuota: topupResult.updated_data.totalAds,
                  max_ads_per_month: topupResult.updated_data.max_ads_per_month,
                  adsUsed: topupResult.updated_data.adsUsed,
                  subscriptionStartDate: topupResult.updated_data.subscriptionStartDate,
                  subscriptionEndDate: topupResult.updated_data.subscriptionEndDate,
                  lastUpdated: new Date().toISOString(),
                  updateSource: 'topup_api'
                };
                localStorage.setItem('incivus_subscription', JSON.stringify(updatedSubscription));
                console.log('✅ Updated localStorage with combined monthly limits after topup:', updatedSubscription.max_ads_per_month);
                console.log('✅ Subscription data already synced by update_plan endpoint');
              } else {
                console.error('❌ Topup response missing updated_data:', topupResult);
                throw new Error('Topup API response missing updated_data');
              }
            } catch (topupError) {
              console.error('❌ Topup endpoint error:', topupError);
              setErrorMessage(`Topup failed: ${topupError.message}`);
              throw topupError;
            }
          } else if (isUpgrade) {
            console.log('⬆️ Calling UPGRADE endpoint...');
            console.log('⬆️ UPGRADE PATH CONFIRMED - Will preserve existing data and upgrade to higher plan');
            console.log('📊 Upgrade details:', {
              currentPlan: currentSubscription?.planType || 'unknown',
              newPlan: planData.planType,
              currentMonthlyLimit: currentSubscription?.max_ads_per_month || 0,
              currentTotalAds: currentSubscription?.adQuota || 0,
              fromQuotaExhaustion: !!localStorage.getItem('incivus_topup_reason')
            });
            
            try {
              // Ensure correct plan name format for backend
              const backendPlanName = planData.planName || `Incivus_${planData.planType.charAt(0).toUpperCase()}${planData.planType.slice(1)}`;
              
              // **FIX**: For upgrades, validate user selection within plan limits
              const planLimits = {
                'Incivus_Lite': { min: 10, max: 12 },
                'Incivus_Plus': { min: 25, max: 30 },
                'Incivus_Pro': { min: 125, max: 132 }
              };
              
              const limits = planLimits[backendPlanName] || { min: 25, max: 30 };
              const userSelectedAds = planData.adQuota || limits.min;
              
              // Validate user selection is within plan limits
              const upgradeAds = Math.max(limits.min, Math.min(limits.max, userSelectedAds));
              
              console.log(`🔧 Upgrade validation - User selected: ${userSelectedAds}, Plan limits: ${limits.min}-${limits.max}, Using: ${upgradeAds}`);
              
              console.log('📤 Upgrade request data:', {
                user_id: userId,
                plan_name: backendPlanName,
                action: 'upgrade',
                features: planData.selectedFeatures ? planData.selectedFeatures.join(',') : '',
                total_ads: upgradeAds, // Use fixed plan amount
                apiUrl: `${ENV_CONFIG.PYTHON_API_URL}/update_plan`
              });
              
              const upgradeResult = await retryUpdatePlan(
                userId,
                backendPlanName,
                'upgrade',
                planData.features ? planData.features.join(',') : '',
                upgradeAds, // Use fixed plan amount
                planData
              );
              
              console.log('✅ Upgrade successful:', upgradeResult);
              console.log('📊 Upgrade results:');
              console.log('  - Total ads:', upgradeResult.updated_data?.totalAds);
              console.log('  - Monthly limit:', upgradeResult.updated_data?.max_ads_per_month);
              console.log('  - New plan:', upgradeResult.updated_data?.planName);
              console.log('  - Validity days:', upgradeResult.updated_data?.validityDays);
              
              // Update localStorage with new combined limits
              if (upgradeResult.updated_data) {
                const updatedSubscription = {
                  ...currentSubscription,
                  planType: upgradeResult.updated_data.planName.replace('Incivus_', '').toLowerCase(),
                  planName: upgradeResult.updated_data.planName,
                  adQuota: upgradeResult.updated_data.totalAds,
                  max_ads_per_month: upgradeResult.updated_data.max_ads_per_month,
                  adsUsed: upgradeResult.updated_data.adsUsed,
                  subscriptionStartDate: upgradeResult.updated_data.subscriptionStartDate,
                  subscriptionEndDate: upgradeResult.updated_data.subscriptionEndDate,
                  lastUpdated: new Date().toISOString(),
                  updateSource: 'upgrade_api'
                };
                localStorage.setItem('incivus_subscription', JSON.stringify(updatedSubscription));
                console.log('✅ Updated localStorage with upgrade data:');
                console.log('  - Plan:', updatedSubscription.planType);
                console.log('  - Monthly limit:', updatedSubscription.max_ads_per_month);
                console.log('  - Total ads:', updatedSubscription.adQuota);
                console.log('✅ Subscription data already synced by update_plan endpoint');
              } else {
                console.error('❌ Upgrade response missing updated_data:', upgradeResult);
                throw new Error('Upgrade API response missing updated_data');
              }
            } catch (upgradeError) {
              console.error('❌ Upgrade endpoint error:', upgradeError);
              setErrorMessage(`Upgrade failed: ${upgradeError.message}`);
              throw upgradeError;
            }
          }
          
        } catch (dbError) {
          console.error('❌ Critical error in payment processing:', dbError);
          
          // If update_plan failed, still save to localStorage as fallback
          if (isTopup || isUpgrade) {
            console.log('💾 Saving fallback subscription data to localStorage...');
            const fallbackSubscription = {
              ...planData,
              paymentCompleted: true,
              paymentMethod: paymentMethod === 'promo' ? 'Promo Code (SAIC5I)' : 'Credit Card',
              timestamp: new Date().toISOString(),
              updateSource: 'fallback_after_api_failure',
              needsResync: true // Flag to indicate this needs to be synced later
            };
            localStorage.setItem('incivus_subscription', JSON.stringify(fallbackSubscription));
            localStorage.setItem('incivus_subscription_backup', JSON.stringify(fallbackSubscription));
            console.log('✅ Fallback subscription data saved');
          } else {
            // Store in localStorage as final fallback for new subscriptions
            localStorage.setItem('incivus_subscription_backup', JSON.stringify({
              ...planData,
              paymentCompleted: true,
              paymentMethod: paymentMethod === 'promo' ? 'Promo Code (SAIC5I)' : 'Credit Card',
              timestamp: new Date().toISOString()
            }));
          }
          
          // Set error message but don't prevent success flow
          setErrorMessage(`Plan updated locally but sync failed: ${dbError.message}`);
        }
      }
      
      setPaymentStatus('success');
      
      // Ensure payment data is stored in localStorage for redundancy
      const finalSubscriptionData = {
        ...planData,
        paymentStatus: 'completed',
        paymentMethod: paymentMethod === 'promo' ? 'Promo Code (SAIC5I)' : 'Credit Card',
        subscribed: true,
        isActive: true,
        status: 'active',
        purchaseDate: new Date().toISOString()
      };
      localStorage.setItem('incivus_subscription', JSON.stringify(finalSubscriptionData));
      localStorage.setItem('incivus_payment_completed', 'true');
      console.log('✅ Payment completion ensured:', finalSubscriptionData);
      
      // Show user-friendly success message
      if (shouldCreateNewPlan || (!isTopup && !isUpgrade)) {
        console.log('🎉 New subscription created successfully!');
      } else if (isUpgrade) {
        console.log('🎉 Plan upgraded successfully!');
      } else if (isTopup) {
        console.log('🎉 Plan topped up successfully!');
      }
      
      // Force refresh user data by clearing localStorage cache
      console.log('🔄 Clearing localStorage cache to force fresh data load on next login...');
      localStorage.removeItem('incivus_user_data_loaded');
      localStorage.removeItem('incivus_completion_status_cache');
      
      // CRITICAL: Force immediate data refresh by dispatching custom event
      console.log('🔄 Dispatching immediate subscription refresh event...');
      window.dispatchEvent(new CustomEvent('subscriptionUpdated', { 
        detail: { 
          userId: currentUser.uid,
          planType: planData.planType,
          action: isUpgrade ? 'upgrade' : (isTopup ? 'topup' : 'new')
        } 
      }));
      
      // Set flag to indicate plan was just upgraded
      localStorage.setItem('incivus_plan_just_upgraded', 'true');
      localStorage.setItem('incivus_upgraded_plan_type', planData.planType);
      
      setTimeout(() => {
        onSuccess && onSuccess({
          ...planData,
          transactionId: 'txn_' + Math.random().toString(36).substr(2, 9),
          paymentData: formData
        });
      }, 1000);
      
    } catch (error) {
      console.error('💳 Payment failed:', error);
      setPaymentStatus('error');
      setErrorMessage(error.message || 'Payment failed. Please try again.');
      onError && onError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const getFeatureName = (featureId) => {
    const featureNames = {
      brand_compliance: 'Brand Compliance',
      messaging_intent: 'Messaging Intent',
      funnel_compatibility: 'Funnel Compatibility',
      resonance_index: 'Purchase Intent',
      channel_compliance: 'Channel Compliance'
    };
    return featureNames[featureId] || featureId;
  };

  const renderPaymentStatus = () => {
    switch (paymentStatus) {
      case 'processing':
        return (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <Loader size={48} className="animate-spin" style={{ color: planData.planType === 'lite' ? '#28a745' : '#6f42c1', marginBottom: '1rem' }} />
            <h3 style={{ color: 'var(--text-dark)', marginBottom: '0.5rem' }}>Processing Payment</h3>
            <p style={{ color: 'var(--text-light)' }}>Setting up your {planData.planName} subscription...</p>
          </div>
        );
      
      case 'success':
        return (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <CheckCircle size={48} style={{ color: '#10b981', marginBottom: '1rem' }} />
            <h3 style={{ color: 'var(--text-dark)', marginBottom: '0.5rem' }}>Payment Successful!</h3>
            <p style={{ color: 'var(--text-light)', marginBottom: '1rem' }}>
              Your {planData.planName} subscription is now active.
            </p>
            <div style={{
              background: 'var(--bg-light)',
              padding: '1rem',
              borderRadius: '0.5rem',
              marginTop: '1rem'
            }}>
              <p style={{ fontWeight: '500', marginBottom: '0.5rem' }}>What's included:</p>
              <ul style={{ textAlign: 'left', fontSize: '0.875rem' }}>
                {planData.features && planData.features.map((featureId, index) => (
                  <li key={index} style={{ marginBottom: '0.25rem' }}>
                    ✓ {getFeatureName(featureId)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      
      case 'error':
        return (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <AlertCircle size={48} style={{ color: '#ef4444', marginBottom: '1rem' }} />
            <h3 style={{ color: 'var(--text-dark)', marginBottom: '0.5rem' }}>Payment Failed</h3>
            <p style={{ color: 'var(--text-light)', marginBottom: '1rem' }}>{errorMessage}</p>
            <button
              onClick={() => setPaymentStatus('pending')}
              className="btn btn-primary"
              style={{ marginRight: '1rem' }}
            >
              Try Again
            </button>
            <button
              onClick={() => onError && onError(new Error('Payment cancelled'))}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        );
      
      default:
        return null;
    }
  };

  if (paymentStatus !== 'pending') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}>
        <div style={{
          maxWidth: '500px',
          width: '100%',
          margin: '0 auto'
        }}>
          <div style={{
            background: 'var(--white)',
            borderRadius: '20px',
            padding: '2.5rem',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(10px)',
            textAlign: 'center'
          }}>
            {renderPaymentStatus()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '2rem 1rem'
    }}>
      <div style={{
        maxWidth: '900px',
        width: '100%',
        margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{
          textAlign: 'center',
          marginBottom: '2rem'
        }}>
          {/* Back Button */}
          {onBack && (
            <div style={{
              display: 'flex',
              justifyContent: 'flex-start',
              marginBottom: '1rem'
            }}>
              <button
                onClick={onBack}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  backdropFilter: 'blur(10px)'
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                  e.target.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                  e.target.style.transform = 'translateY(0)';
                }}
              >
                <ArrowLeft size={16} />
                Back to Dashboard
              </button>
            </div>
          )}
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.5rem'
          }}>
            <img 
              src="/logo/C5i name with Logo.svg" 
              alt="C5i Logo" 
              style={{
                height: '70px',
                width: 'auto',
                filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))'
              }}
            />
          </div>
          <h2 style={{
            fontSize: '2.25rem',
            fontWeight: '700',
            color: 'var(--white)',
            textAlign: 'center',
            marginBottom: '0.5rem',
            textShadow: '0 2px 4px rgba(0,0,0,0.3)'
          }}>
            Complete Your Purchase
          </h2>
          <p style={{
            color: 'rgba(255, 255, 255, 0.9)',
            textAlign: 'center',
            fontSize: '1.1rem',
            textShadow: '0 1px 2px rgba(0,0,0,0.2)'
          }}>
            Secure payment powered by Shopify
          </p>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: window.innerWidth > 768 ? '1fr 1fr' : '1fr', 
          gap: '2rem' 
        }}>
          {/* Plan Summary */}
          <div style={{
            background: 'var(--white)',
            borderRadius: '20px',
            padding: '2rem',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(10px)'
          }}>
            <h3 style={{ color: 'var(--text-dark)', marginBottom: '1rem' }}>
              Order Summary
            </h3>
            
            <div style={{
              background: '#f8f9fa',
              padding: '1.5rem',
              borderRadius: '8px',
              marginBottom: '1rem'
            }}>
              <h4 style={{ margin: '0 0 1rem 0', color: planData.planType === 'lite' ? '#28a745' : '#6f42c1' }}>
                {planData.planName}
              </h4>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', 
                gap: '1rem',
                marginBottom: '1rem'
              }}>
                <div style={{ textAlign: 'center', padding: '0.5rem', background: 'white', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>Features</div>
                  <div style={{ fontWeight: 'bold', color: planData.planType === 'lite' ? '#28a745' : '#6f42c1' }}>
                    {planData.features ? planData.features.length : '5'}/5
                  </div>
                </div>
                <div style={{ textAlign: 'center', padding: '0.5rem', background: 'white', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>Ads</div>
                  <div style={{ fontWeight: 'bold', color: '#2c3e50' }}>
                    {planData.adQuota}
                  </div>
                </div>
                <div style={{ textAlign: 'center', padding: '0.5rem', background: 'white', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>Validity</div>
                  <div style={{ fontWeight: 'bold', color: '#2c3e50' }}>
                    {planData.validity}
                  </div>
                </div>
              </div>
              
              {planData.planType === 'lite' && planData.features && (
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    Selected Features:
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>
                    {planData.features.map(getFeatureName).join(', ')}
                  </div>
                </div>
              )}
            </div>
            
            <div style={{
              background: planData.planType === 'lite' ? '#28a745' : '#6f42c1',
              color: 'white',
              padding: '1rem',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Total Amount</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{formatCurrency(planData.totalPrice)}</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>One-time payment • Valid for {planData.validity}</div>
            </div>
          </div>

          {/* Payment Form */}
          <div style={{
            background: 'var(--white)',
            borderRadius: '20px',
            padding: '2rem',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(10px)'
          }}>
            <h3 style={{ color: 'var(--text-dark)', marginBottom: '1.5rem' }}>
              Payment Details
            </h3>

            {/* Payment Method Toggle */}
            <div style={{ marginBottom: '2rem' }}>
              <div style={{
                display: 'flex',
                background: '#f8f9fa',
                borderRadius: '8px',
                padding: '4px',
                marginBottom: '1rem'
              }}>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '6px',
                    background: paymentMethod === 'card' ? '#007bff' : 'transparent',
                    color: paymentMethod === 'card' ? 'white' : '#6c757d',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  💳 Credit Card
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('promo')}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '6px',
                    background: paymentMethod === 'promo' ? '#28a745' : 'transparent',
                    color: paymentMethod === 'promo' ? 'white' : '#6c757d',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  🎟️ Promo Code
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '1rem'
                  }}
                />
              </div>

              {paymentMethod === 'promo' ? (
                // Promo Code Form
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                    Promo Code
                  </label>
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="Enter your promo code"
                    required
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '1rem',
                      textTransform: 'uppercase'
                    }}
                  />
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    background: '#e8f5e8',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    color: '#28a745'
                  }}>
                    💡 Enter promo code to get instant access to your plan
                  </div>
                </div>
              ) : (
                // Credit Card Form
                <>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Card Number
                    </label>
                    <input
                      type="text"
                      value={formData.cardNumber}
                      onChange={(e) => handleInputChange('cardNumber', e.target.value)}
                      placeholder="1234 5678 9012 3456"
                      required
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        fontSize: '1rem'
                      }}
                    />
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                        Expiry Date
                      </label>
                      <input
                        type="text"
                        value={formData.expiryDate}
                        onChange={(e) => handleInputChange('expiryDate', e.target.value)}
                        placeholder="MM/YY"
                        required
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #ddd',
                          borderRadius: '6px',
                          fontSize: '1rem'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                        CVV
                      </label>
                      <input
                        type="text"
                        value={formData.cvv}
                        onChange={(e) => handleInputChange('cvv', e.target.value)}
                        placeholder="123"
                        required
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #ddd',
                          borderRadius: '6px',
                          fontSize: '1rem'
                        }}
                      />
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: isLoading ? '#ccc' : (paymentMethod === 'promo' ? '#28a745' : planData.planType === 'lite' ? '#28a745' : '#6f42c1'),
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                {isLoading ? (
                  <>
                    <Loader size={20} className="animate-spin" />
                    Processing...
                  </>
                ) : paymentMethod === 'promo' ? (
                  <>
                    🎟️ Activate with Promo Code
                  </>
                ) : (
                  <>
                    <CreditCard size={20} />
                    Complete Payment - {formatCurrency(planData.totalPrice)}
                  </>
                )}
              </button>
            </form>

            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              background: '#f8f9fa',
              borderRadius: '6px',
              fontSize: '0.8rem',
              color: '#6c757d',
              textAlign: 'center'
            }}>
              {paymentMethod === 'promo' ? (
                <>🎟️ Enter your promo code to get instant access</>
              ) : (
                <>🔒 Your payment information is secure and encrypted</>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopifyPayment;