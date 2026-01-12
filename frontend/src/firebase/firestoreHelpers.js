// Frontend DB access removed. All operations proxy to backend API (app.py).
// This file now wraps the unified API helper for backward compatibility
import unifiedApi from '../utils/unifiedApiHelper';
import ENV_CONFIG from '../utils/environmentConfig';

const API_BASE_URL = ENV_CONFIG.PYTHON_API_URL;

// Debug: Log migration notice
console.log('🔧 firebase/firestoreHelpers.js - Now using unified API helper with caching');

export const COLLECTIONS = {};

// ===============================
// 1. USER PROFILE DETAILS COLLECTION
// ===============================

/**
 * Save user profile details during signup
 * @deprecated Use unifiedApi.saveUserProfile() instead for better caching
 */
export const saveUserProfileDetails = async (userId, profileData) => {
  console.log('⚠️ Using deprecated saveUserProfileDetails - consider migrating to unifiedApi.saveUserProfile()');
  return unifiedApi.saveUserProfile(userId, profileData);
};

/**
 * Get user profile details
 * @deprecated Use unifiedApi.getUserProfile() instead for better caching
 */
export const getUserProfileDetails = async (userId) => {
  console.log('⚠️ Using deprecated getUserProfileDetails - consider migrating to unifiedApi.getUserProfile()');
  return unifiedApi.getUserProfile(userId);
};

/**
 * Update user profile details
 * @deprecated Use unifiedApi.updateUserProfile() instead for better caching
 */
export const updateUserProfileDetails = async (userId, updates) => {
  console.log('⚠️ Using deprecated updateUserProfileDetails - consider migrating to unifiedApi.updateUserProfile()');
  return unifiedApi.updateUserProfile(userId, updates);
};

// ===============================
// 2. PLAN SELECTION DETAILS COLLECTION
// ===============================

/**
 * Save plan selection details after payment
 * @deprecated Use unifiedApi.savePlanSelection() instead for better caching
 */
export const savePlanSelectionDetails = async (userId, planData) => {
  console.log('⚠️ Using deprecated savePlanSelectionDetails - consider migrating to unifiedApi.savePlanSelection()');
  return unifiedApi.savePlanSelection(userId, planData);
};

/**
 * Get plan selection details for a user
 * @deprecated Use unifiedApi.getPlanSelections() instead for better caching
 */
export const getPlanSelectionDetails = async (userId) => {
  console.log('⚠️ Using deprecated getPlanSelectionDetails - consider migrating to unifiedApi.getPlanSelections()');
  return unifiedApi.getPlanSelections(userId);
};

/**
 * Update plan selection details
 */
export const updatePlanSelectionDetails = async (userId, updates) => {
  const payload = { updates, timestamp: new Date().toISOString() };
  const res = await fetch(`${API_BASE_URL}/updateUserProfileDetails/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
};

// ===============================
// 3. BRAND SETUP COLLECTION
// ===============================

/**
 * Save brand setup data
 * @deprecated Use unifiedApi.saveBrandData() instead for better caching
 */
export const saveBrandSetup = async (userId, brandData) => {
  console.log('⚠️ Using deprecated saveBrandSetup - consider migrating to unifiedApi.saveBrandData()');
  return unifiedApi.saveBrandData(userId, brandData);
};

/**
 * Get brand setup data for a user
 * @deprecated Use unifiedApi.getUserBrands() instead for better caching
 */
export const getBrandSetup = async (userId) => {
  console.log('⚠️ Using deprecated getBrandSetup - consider migrating to unifiedApi.getUserBrands()');
  return unifiedApi.getUserBrands(userId);
};

/**
 * Update brand setup data
 */
export const updateBrandSetup = async (userId, updates) => {
  // For brand updates, we need to get the existing brand ID first
  const existingBrand = await getBrandSetup(userId);
  if (!existingBrand || !existingBrand.brandId) {
    throw new Error('No existing brand found to update');
  }
  
  // Update the brand data
  const updatedBrandData = { ...existingBrand, ...updates };
  return await saveBrandSetup(userId, updatedBrandData);
};

// ===============================
// 4. ANALYSIS ENDPOINTS
// ===============================

/**
 * Send analysis details to backend
 * @deprecated Use unifiedApi.sendAnalysisDetails() instead for better caching
 */
export const sendAnalysisDetails = async (analysisData) => {
  console.log('⚠️ Using deprecated sendAnalysisDetails - consider migrating to unifiedApi.sendAnalysisDetails()');
  return unifiedApi.sendAnalysisDetails(analysisData);
};

/**
 * Get analysis details for a user
 */
export const getAnalysisDetails = async (userId) => {
  const res = await fetch(`${API_BASE_URL}/get-analysis-details/${encodeURIComponent(userId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
};

/**
 * Get user analysis history
 * @deprecated Use unifiedApi.getUserAnalysisHistory() instead for better caching
 */
export const getUserAnalysisHistory = async (userId) => {
  console.log('⚠️ Using deprecated getUserAnalysisHistory - consider migrating to unifiedApi.getUserAnalysisHistory()');
  return unifiedApi.getUserAnalysisHistory(userId);
};

// ===============================
// 5. USER FILES ENDPOINTS
// ===============================

/**
 * Get user files
 * @deprecated Use unifiedApi.getUserFiles() instead for better caching
 */
export const getUserFiles = async (userId, fileType = null, limit = 50) => {
  console.log('⚠️ Using deprecated getUserFiles - consider migrating to unifiedApi.getUserFiles()');
  return unifiedApi.getUserFiles(userId, fileType, limit);
};

/**
 * Get a specific user file
 */
export const getUserFile = async (fileId) => {
  const res = await fetch(`${API_BASE_URL}/get-user-file/${encodeURIComponent(fileId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
};

/**
 * Save analysis record
 */
export const saveAnalysisRecord = async (analysisData) => {
  const res = await fetch(`${API_BASE_URL}/save-analysis-record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(analysisData)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
};

/**
 * Upload analysis PDF
 */
export const uploadAnalysisPDF = async (userId, file, analysisId = null, fileName = null) => {
  const form = new FormData();
  form.append('userId', userId);
  form.append('file', file);
  if (analysisId) form.append('analysisId', analysisId);
  if (fileName) form.append('fileName', fileName);
  
  const res = await fetch(`${API_BASE_URL}/upload-analysis-pdf`, { 
    method: 'POST', 
    body: form 
  });
  
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
};

// ===============================
// 6. UTILITY FUNCTIONS
// ===============================

/**
 * Get complete user data including profile, plan, and brand
 */
export const getCompleteUserData = async (userId) => {
  try {
    const [profile, plan, brand] = await Promise.all([
    getUserProfileDetails(userId),
    getPlanSelectionDetails(userId),
    getBrandSetup(userId)
  ]);
    
    return {
      profile,
      plan,
      brand,
      hasCompleteData: !!(profile && plan && brand)
    };
  } catch (error) {
    console.error('Error fetching complete user data:', error);
    throw error;
  }
};

/**
 * Check user completion status
 */
export const checkUserCompletionStatus = async (userId) => {
  try {
    const [profile, plan, brand] = await Promise.all([
      getUserProfileDetails(userId).catch(() => null),
      getPlanSelectionDetails(userId).catch(() => null),
      getBrandSetup(userId).catch(() => null)
    ]);
    
    // Extract terms acceptance from various possible locations
    const termsAccepted = profile?.userProfile?.authInfo?.termsAccepted || 
                         profile?.userProfile?.termsAccepted ||
                         profile?.termsAccepted ||
                         false;
    
    // **SIMPLIFIED**: Just check if user profile exists and has basic name/company info
    console.log('🔍 Profile data for essential check:', {
      profileExists: !!profile,
      email: profile?.email,
      nestedEmail: profile?.userProfile?.personalInfo?.email,
      companyName: profile?.userProfile?.companyInfo?.companyName,
      directCompany: profile?.companyName,
      company: profile?.company,
      fullName: profile?.userProfile?.personalInfo?.fullName,
      directFullName: profile?.fullName,
      displayName: profile?.displayName,
      name: profile?.name,
      profileKeys: profile ? Object.keys(profile) : null,
      userProfileKeys: profile?.userProfile ? Object.keys(profile.userProfile) : null
    });
    
    // **ENHANCED**: More lenient check for existing users
    const hasEssentialProfileData = profile && (
      // If user has profile data at all, consider it essential
      // (this handles cases where structure might be different)
      profile.userId || 
      profile.email || 
      profile.userProfile?.personalInfo?.email ||
      // Check for any name fields
      profile.userProfile?.companyInfo?.companyName ||
      profile.companyName ||
      profile.company ||
      profile.userProfile?.personalInfo?.fullName ||
      profile.fullName ||
      profile.displayName ||
      profile.name ||
      // If user has subscription data, they're a valid user
      profile.subscription ||
      // If user has any userProfile structure, they're valid
      profile.userProfile
    );
    
    console.log('🔍 Essential data check result:', {
      hasProfile: !!profile,
      hasEmail: !!(profile?.email || profile?.userProfile?.personalInfo?.email),
      hasName: !!(
        profile?.userProfile?.companyInfo?.companyName ||
        profile?.companyName ||
        profile?.company ||
        profile?.userProfile?.personalInfo?.fullName ||
        profile?.fullName ||
        profile?.displayName ||
        profile?.name
      ),
      finalResult: hasEssentialProfileData
    });

    // **FIX**: If user has essential profile data, consider them complete regardless of plan selection
    const isUserComplete = hasEssentialProfileData;
    
    // Check if plan has valid payment status (not just pending)
    // Handle both single plan object and plans array structure
    const hasValidPlan = plan && (
      // Single plan structure
      (plan.paymentStatus && plan.paymentStatus !== 'pending') ||
      // Multiple plans array structure - check if any plan has completed payment
      (plan.plans && Array.isArray(plan.plans) && plan.plans.some(p => p.paymentStatus === 'completed'))
    );
    
    console.log('🔍 User completion check:', {
      userId,
      hasProfile: !!profile,
      hasEssentialProfileData,
      hasPlan: !!plan,
      hasValidPlan,
      hasBrand: !!brand,
      termsAccepted,
      profileStructure: profile ? Object.keys(profile) : null,
      planStructure: plan ? Object.keys(plan) : null,
      // **NEW**: Debug profile data checks
      profileDataChecks: {
        hasNestedStructure: !!(profile?.userProfile?.personalInfo?.fullName && profile?.userProfile?.companyInfo?.companyName),
        hasSimpleStructure: !!(profile?.fullName && profile?.email),
        hasLegacyStructure: !!(profile?.userProfile?.fullName),
        hasDirectFields: !!(profile?.email && (profile?.fullName || profile?.displayName)),
        actualProfileKeys: profile ? Object.keys(profile) : null,
        userProfileKeys: profile?.userProfile ? Object.keys(profile.userProfile) : null
      }
    });
    
    return {
      userProfile: profile,
      userProfileDetails: profile,
      planDetails: plan,
      brandData: brand,
      hasProfile: !!profile,
      hasPlan: !!plan,
      hasBrand: !!brand,
      hasEssentialData: hasEssentialProfileData,
      hasAcceptedTerms: true, // **FIX**: For existing users with profiles, assume terms accepted
      userExistsInDB: !!profile,
      isComplete: hasEssentialProfileData // User just needs complete profile, plan is optional
    };
  } catch (error) {
    console.error('Error checking user completion status:', error);
    return {
      userProfile: null,
      userProfileDetails: null,
      planDetails: null,
      brandData: null,
      hasProfile: false,
      hasPlan: false,
      hasBrand: false,
      hasEssentialData: false,
      hasAcceptedTerms: false,
      userExistsInDB: false,
      isComplete: false
    };
  }
};

/**
 * Migrate user data to new structure (placeholder for future use)
 */
export const migrateUserDataToNewStructure = async (userId, oldUserData) => {
  // This function can be used for future data migrations
  console.log('Migration function called for user:', userId);
    return true;
};
