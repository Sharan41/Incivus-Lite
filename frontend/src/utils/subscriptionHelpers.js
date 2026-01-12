// Subscription and Ad Quota Management

import { getUserProfileDetails, updateUserProfileDetails, saveUserProfileDetails, getPlanSelectionDetails as getBackendPlanSelection } from '../firebase/firestoreHelpers';

// Save subscription data to user profile
export const saveSubscriptionData = async (userId, subscriptionData) => {
  try {
    console.log('💳 Saving subscription data for user:', userId);
    
    const subscriptionInfo = {
      ...subscriptionData,
      purchaseDate: new Date(),
      status: 'active',
      adsUsed: 0, // Track how many ads user has uploaded
      lastUpdated: new Date()
    };

    // First check if user profile exists, create if missing
    try {
      await updateUserProfileDetails(userId, {
        subscription: subscriptionInfo,
        updatedAt: new Date()
      });
    } catch (error) {
      if (error.message.includes('No document to update')) {
        console.log('🔧 User profile missing, creating new profile...');
        // Create user profile first
        await saveUserProfileDetails(userId, {
          email: 'user@example.com', // Fallback email
          fullName: 'User',
          subscription: subscriptionInfo,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        console.log('✅ User profile created and subscription saved');
      } else {
        throw error;
      }
    }

    console.log('✅ Subscription data saved successfully');
    return subscriptionInfo;
    
  } catch (error) {
    console.error('❌ Error saving subscription data:', error);
    throw error;
  }
};

// Get user's current subscription
export const getUserSubscription = async (userId) => {
  try {
    // **SINGLE SOURCE OF TRUTH**: Use unified API for data fetching
    const unifiedApi = await import('./unifiedApiHelper');
    const userProfile = await unifiedApi.default.getUserProfile(userId);
    return userProfile?.subscription || null;
  } catch (error) {
    console.error('❌ Error getting user subscription:', error);
    return null;
  }
};

// Check if subscription is active and valid
export const isSubscriptionValid = (subscription) => {
  if (!subscription) return false;
  
  const now = new Date();
  const endDate = new Date(subscription.subscriptionEndDate);
  
  return subscription.status === 'active' && now <= endDate;
};

// Check if user can upload more ads
export const canUploadAd = async (userId) => {
  try {
    // **SINGLE SOURCE OF TRUTH**: Use unified API for quota checks
    const subscription = await getUserSubscription(userId);
    
    if (!subscription) {
      return { 
        canUpload: false, 
        reason: 'Subscribe to unlock ad analysis and get detailed insights for your campaigns.',
        showUpgrade: true,
        isFirstTimeUser: true,
        subscriptionStatus: 'none'
      };
    }

    if (!isSubscriptionValid(subscription)) {
      return { 
        canUpload: false, 
        reason: 'Your subscription has expired. Renew to continue analyzing ads.',
        showUpgrade: true,
        isFirstTimeUser: false,
        subscriptionStatus: 'expired'
      };
    }

    const adsUsed = subscription.adsUsed || 0;
    const adQuota = subscription.adQuota || 0;
    const maxAdsPerMonth = subscription.max_ads_per_month || 4;
    const lastAdUpload = subscription.lastAdUpload;
    const lastUsageDate = subscription.lastUsageDate;

    // Check if monthly reset is needed
    const shouldReset = shouldResetMonthlyUsage(lastAdUpload || lastUsageDate);
    
    // Calculate current monthly usage
    // Note: adsUsed in backend represents monthly usage (resets each month)
    // adQuota represents total ads available in the subscription
    const currentMonthlyUsed = shouldReset ? 0 : adsUsed;
    const monthlyRemaining = Math.max(0, maxAdsPerMonth - currentMonthlyUsed);
    const totalRemaining = Math.max(0, adQuota - adsUsed);
    
    console.log(`📊 Quota Check - Monthly: ${currentMonthlyUsed}/${maxAdsPerMonth}, Total: ${totalRemaining}, Reset needed: ${shouldReset}`);

    // Check total quota first
    if (totalRemaining <= 0) {
      return { 
        canUpload: false, 
        reason: `You've used all ${adQuota + adsUsed} ads in your plan. Upgrade to get more ads and continue analyzing.`,
        showUpgrade: true,
        isFirstTimeUser: false,
        subscriptionStatus: 'quota_exhausted',
        adsUsed,
        adQuota,
        monthlyUsed: currentMonthlyUsed,
        maxAdsPerMonth,
        resetNeeded: shouldReset
      };
    }

    // Check monthly limit (only if no reset is needed)
    if (!shouldReset && currentMonthlyUsed >= maxAdsPerMonth) {
      return { 
        canUpload: false, 
        reason: `You've reached your monthly limit of ${maxAdsPerMonth} ads. Your quota resets next month, or upgrade for more ads.`,
        showUpgrade: true,
        isFirstTimeUser: false,
        subscriptionStatus: 'monthly_limit_reached',
        adsUsed,
        adQuota,
        monthlyUsed: currentMonthlyUsed,
        maxAdsPerMonth,
        resetNeeded: shouldReset
      };
    }

    return { 
      canUpload: true, 
      adsUsed,
      adQuota,
      monthlyUsed: currentMonthlyUsed,
      maxAdsPerMonth,
      remaining: totalRemaining,
      monthlyRemaining,
      resetNeeded: shouldReset
    };
    
  } catch (error) {
    console.error('❌ Error checking ad upload permission:', error);
    return { canUpload: false, reason: 'Error checking subscription', showUpgrade: false };
  }
};

// Helper function to check if monthly usage should be reset
const shouldResetMonthlyUsage = (lastUsageDate) => {
  if (!lastUsageDate) return false;
  
  try {
    const lastUsage = new Date(lastUsageDate);
    const now = new Date();
    
    // Reset if it's a new month or new year
    return (now.getFullYear() !== lastUsage.getFullYear() || 
            now.getMonth() !== lastUsage.getMonth());
  } catch (error) {
    console.error('Error parsing last usage date:', error);
    return false;
  }
};

// Increment ad usage count
export const incrementAdUsage = async (userId) => {
  try {
    const subscription = await getUserSubscription(userId);
    
    if (!subscription) {
      throw new Error('No active subscription found');
    }

    const newAdsUsed = (subscription.adsUsed || 0) + 1;
    
    await updateUserProfileDetails(userId, {
      'subscription.adsUsed': newAdsUsed,
      'subscription.lastAdUpload': new Date(),
      updatedAt: new Date()
    });

    console.log(`📊 Ad usage incremented: ${newAdsUsed}/${subscription.adQuota}`);
    return newAdsUsed;
    
  } catch (error) {
    console.error('❌ Error incrementing ad usage:', error);
    throw error;
  }
};

// Check if user has access to specific feature
export const hasFeatureAccess = async (userId, featureId) => {
  try {
    const subscription = await getUserSubscription(userId);
    
    if (!subscription) return false;
    if (!isSubscriptionValid(subscription)) return false;
    
    // Pro users have access to all features
    if (subscription.planType === 'pro') return true;
    
    // Lite users only have access to their selected features
    if (subscription.planType === 'lite') {
      return subscription.features && subscription.features.includes(featureId);
    }
    
    return false;
    
  } catch (error) {
    console.error('❌ Error checking feature access:', error);
    return false;
  }
};

// Get user's available features
export const getUserFeatures = async (userId) => {
  try {
    const subscription = await getUserSubscription(userId);
    
    if (!subscription || !isSubscriptionValid(subscription)) {
      return [];
    }
    
    // All features list
    const allFeatures = [
      'brand_compliance',
      'messaging_intent', 
      'funnel_compatibility',
      'resonance_index',
      'channel_compliance'
    ];
    
    if (subscription.planType === 'pro') {
      return allFeatures;
    }
    
    if (subscription.planType === 'lite') {
      return subscription.features || [];
    }
    
    return [];
    
  } catch (error) {
    console.error('❌ Error getting user features:', error);
    return [];
  }
};

// Calculate days remaining in subscription
export const getDaysRemaining = (subscription) => {
  if (!subscription) return 0;
  
  const now = new Date();
  const endDate = new Date(subscription.subscriptionEndDate);
  const diffTime = endDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
};

// Check if subscription needs renewal (within 7 days of expiry)
export const needsRenewal = (subscription) => {
  if (!subscription) return false;
  
  const daysRemaining = getDaysRemaining(subscription);
  return daysRemaining <= 7 && daysRemaining > 0;
};

// Renew subscription
export const renewSubscription = async (userId, newSubscriptionData) => {
  try {
    const currentSubscription = await getUserSubscription(userId);
    
    let newStartDate, newEndDate;
    
    if (currentSubscription && isSubscriptionValid(currentSubscription)) {
      // Renewal before expiry - extend from current end date
      newStartDate = new Date(currentSubscription.subscriptionEndDate);
      newEndDate = new Date(newStartDate.getTime() + (newSubscriptionData.validityDays * 24 * 60 * 60 * 1000));
      
      console.log('🔄 Renewing before expiry - extending from current end date');
    } else {
      // Renewal after expiry or no current subscription - start fresh
      newStartDate = new Date();
      newEndDate = new Date(Date.now() + (newSubscriptionData.validityDays * 24 * 60 * 60 * 1000));
      
      console.log('🆕 Starting fresh subscription - old data will be cleared');
      
      // Clear old data if renewing after expiry
      if (currentSubscription && !isSubscriptionValid(currentSubscription)) {
        // Note: In a real implementation, you might want to archive old data
        console.log('🗑️ Clearing expired subscription data');
      }
    }
    
    const renewedSubscription = {
      ...newSubscriptionData,
      subscriptionStartDate: newStartDate,
      subscriptionEndDate: newEndDate,
      purchaseDate: new Date(),
      status: 'active',
      adsUsed: 0, // Reset ad usage for new billing cycle
      isRenewal: true,
      previousSubscription: currentSubscription ? {
        endDate: currentSubscription.subscriptionEndDate,
        plan: currentSubscription.planType
      } : null
    };
    
    await updateUserProfileDetails(userId, {
      subscription: renewedSubscription,
      updatedAt: new Date()
    });
    
    console.log('✅ Subscription renewed successfully');
    return renewedSubscription;
    
  } catch (error) {
    console.error('❌ Error renewing subscription:', error);
    throw error;
  }
};

// Get subscription status summary
export const getSubscriptionStatus = async (userId) => {
  try {
    const subscription = await getUserSubscription(userId);
    
    if (!subscription) {
      return {
        hasSubscription: false,
        status: 'none',
        message: 'No active subscription'
      };
    }
    
    const isValid = isSubscriptionValid(subscription);
    const daysRemaining = getDaysRemaining(subscription);
    const needsRenewing = needsRenewal(subscription);
    
    let status = 'unknown';
    let message = '';
    
    if (!isValid) {
      status = 'expired';
      message = 'Subscription expired';
    } else if (needsRenewing) {
      status = 'expiring_soon';
      message = `Expires in ${daysRemaining} days`;
    } else {
      status = 'active';
      message = `Active - ${daysRemaining} days remaining`;
    }
    
    return {
      hasSubscription: true,
      subscription,
      status,
      message,
      isValid,
      daysRemaining,
      needsRenewal: needsRenewing,
      adsUsed: subscription.adsUsed || 0,
      adQuota: subscription.adQuota || 0,
      planType: subscription.planType,
      features: subscription.features || []
    };
    
  } catch (error) {
    console.error('❌ Error getting subscription status:', error);
    return {
      hasSubscription: false,
      status: 'error',
      message: 'Error checking subscription'
    };
  }
};

// Example usage and pricing validation
export const validatePricing = (planType, adCount, features = []) => {
  let expectedPrice = 0;
  
  if (planType === 'lite') {
    if (adCount === 1) {
      expectedPrice = 10; // MOQ for 1 ad
    } else {
      expectedPrice = 25; // 4 features regardless of ad count
    }
    
    if (features.length !== 4) {
      throw new Error('Lite plan must have exactly 4 features');
    }
  } else if (planType === 'pro') {
    if (adCount <= 5) {
      expectedPrice = 40; // MOQ for up to 5 ads
    } else {
      const extraAds = adCount - 5;
      expectedPrice = 40 + (extraAds * 4); // $4 per additional ad
    }
    
    if (features.length !== 5) {
      throw new Error('Pro plan must have all 5 features');
    }
  }
  
  return expectedPrice;
};