/**
 * Unified API Helper - Single Source of Truth for All API Calls
 * 
 * Features:
 * 1. Request deduplication - prevents duplicate in-flight requests
 * 2. Response caching with TTL - prevents unnecessary API calls
 * 3. Single location for all API endpoints
 * 4. Automatic cache invalidation on mutations
 */

import ENV_CONFIG from './environmentConfig';

const API_BASE_URL = ENV_CONFIG.PYTHON_API_URL;

// ==========================================
// CACHING & DEDUPLICATION LAYER
// ==========================================

class ApiCache {
  constructor() {
    this.cache = new Map();
    this.inFlightRequests = new Map();
    this.cacheTTL = {
      'get-user-profile': 5 * 60 * 1000,      // 5 minutes
      'get-user-brands': 5 * 60 * 1000,       // 5 minutes
      'get-plan-selections': 5 * 60 * 1000,   // 5 minutes
      'get-user-files': 2 * 60 * 1000,        // 2 minutes
      'get-analysis-history': 1 * 60 * 1000,  // 1 minute
    };
  }

  getCacheKey(endpoint, userId, params = {}) {
    const paramString = Object.keys(params).length > 0 ? JSON.stringify(params) : '';
    return `${endpoint}:${userId}:${paramString}`;
  }

  get(endpoint, userId, params = {}) {
    const key = this.getCacheKey(endpoint, userId, params);
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    const now = Date.now();
    const ttl = this.cacheTTL[endpoint] || 60000; // Default 1 minute
    
    if (now - cached.timestamp > ttl) {
      console.log(`🗑️ Cache expired for ${key}`);
      this.cache.delete(key);
      return null;
    }
    
    console.log(`✅ Cache HIT for ${key}`);
    return cached.data;
  }

  set(endpoint, userId, data, params = {}) {
    const key = this.getCacheKey(endpoint, userId, params);
    console.log(`💾 Caching response for ${key}`);
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  invalidate(endpoint, userId = null) {
    if (userId) {
      // Invalidate specific user's cache
      const keysToDelete = [];
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${endpoint}:${userId}`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => {
        console.log(`🗑️ Invalidating cache: ${key}`);
        this.cache.delete(key);
      });
    } else {
      // Invalidate all cache for this endpoint
      const keysToDelete = [];
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${endpoint}:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => {
        console.log(`🗑️ Invalidating cache: ${key}`);
        this.cache.delete(key);
      });
    }
  }

  invalidateAll() {
    console.log('🗑️ Clearing all cache');
    this.cache.clear();
  }

  // Request deduplication - if same request is in flight, return the same promise
  async deduplicate(key, fetchFn) {
    if (this.inFlightRequests.has(key)) {
      console.log(`⏳ Request already in-flight, reusing: ${key}`);
      return this.inFlightRequests.get(key);
    }

    console.log(`🚀 New request: ${key}`);
    const promise = fetchFn()
      .finally(() => {
        this.inFlightRequests.delete(key);
      });

    this.inFlightRequests.set(key, promise);
    return promise;
  }
}

const apiCache = new ApiCache();

// ==========================================
// UNIFIED API FUNCTIONS
// ==========================================

/**
 * GET: User Profile Details
 */
export const getUserProfile = async (userId, forceRefresh = false) => {
  const endpoint = 'get-user-profile';
  
  // Check cache first
  if (!forceRefresh) {
    const cached = apiCache.get(endpoint, userId);
    if (cached) return cached;
  }

  // Deduplicate in-flight requests
  const cacheKey = apiCache.getCacheKey(endpoint, userId);
  return apiCache.deduplicate(cacheKey, async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/${endpoint}/${encodeURIComponent(userId)}`);
      if (res.status === 404) return null;
      if (res.status === 500) {
        console.warn('⚠️ Backend server error (500) - user profile may not exist yet');
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      apiCache.set(endpoint, userId, data);
      return data;
    } catch (error) {
      console.warn('⚠️ getUserProfile failed:', error.message);
      return null;
    }
  });
};

/**
 * GET: User Brands
 */
export const getUserBrands = async (userId, forceRefresh = false) => {
  const endpoint = 'get-user-brands';
  
  // Check cache first
  if (!forceRefresh) {
    const cached = apiCache.get(endpoint, userId);
    if (cached) return cached;
  }

  // Deduplicate in-flight requests
  const cacheKey = apiCache.getCacheKey(endpoint, userId);
  return apiCache.deduplicate(cacheKey, async () => {
    try {
      console.log('🔍 Fetching user brands for:', userId);
      const res = await fetch(`${API_BASE_URL}/${endpoint}/${encodeURIComponent(userId)}`);
      if (res.status === 404) {
        console.log('🔍 No brands found for user');
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const brandsData = await res.json();
      console.log('🔍 Raw brands data:', brandsData);
      
      // Process brands - return most recent with complete data
      if (brandsData.brands && brandsData.brands.length > 0) {
        const sortedBrands = brandsData.brands.sort((a, b) => {
          const aTime = new Date(a.lastUpdated || a.timestamp || 0).getTime();
          const bTime = new Date(b.lastUpdated || b.timestamp || 0).getTime();
          return bTime - aTime;
        });
        
        let brandWithCompleteData = sortedBrands.find(brand => {
          const hasColors = brand.primaryColor || brand.secondaryColor || brand.accentColor;
          const hasTone = brand.toneOfVoice && brand.toneOfVoice.length > 0;
          return hasColors && hasTone;
        });
        
        const brand = brandWithCompleteData || sortedBrands[0];
        
        // Process logos from mediaFiles
        if (brand.mediaFiles && Array.isArray(brand.mediaFiles)) {
          brand.logos = brand.mediaFiles
            .filter(file => file.mediaType === 'logo')
            .map(logoFile => ({
              name: logoFile.filename || logoFile.fileName || 'Logo',
              url: logoFile.url,
              preview: logoFile.url,
              uploaded: true,
              size: logoFile.fileSize,
              storagePath: logoFile.storagePath,
              fileId: logoFile.fileId,
              contentType: logoFile.contentType,
              uploadTimestamp: logoFile.uploadTimestamp
            }));
        }
        
        console.log('✅ Selected brand:', brand);
        apiCache.set(endpoint, userId, brand);
        return brand;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error fetching user brands:', error);
      return null;
    }
  });
};

/**
 * GET: Plan Selection Details
 */
export const getPlanSelections = async (userId, forceRefresh = false) => {
  const endpoint = 'get-plan-selections';
  
  // Check cache first
  if (!forceRefresh) {
    const cached = apiCache.get(endpoint, userId);
    if (cached) return cached;
  }

  // Deduplicate in-flight requests
  const cacheKey = apiCache.getCacheKey(endpoint, userId);
  return apiCache.deduplicate(cacheKey, async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/${endpoint}/${encodeURIComponent(userId)}`);
      if (res.status === 404) return null;
      if (res.status === 500) {
        console.warn('⚠️ Backend server error (500) - plan selections may not exist yet');
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      apiCache.set(endpoint, userId, data);
      return data;
    } catch (error) {
      console.warn('⚠️ getPlanSelections failed:', error.message);
      return null;
    }
  });
};

/**
 * GET: User Analysis History
 */
export const getUserAnalysisHistory = async (userId, forceRefresh = false) => {
  const endpoint = 'get-user-analysis-history';
  
  // Check cache first
  if (!forceRefresh) {
    const cached = apiCache.get(endpoint, userId);
    if (cached) return cached;
  }

  // Deduplicate in-flight requests
  const cacheKey = apiCache.getCacheKey(endpoint, userId);
  return apiCache.deduplicate(cacheKey, async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/${endpoint}/${encodeURIComponent(userId)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      apiCache.set(endpoint, userId, data);
      return data;
    } catch (error) {
      console.error('❌ Error fetching analysis history:', error);
      return null;
    }
  });
};

/**
 * GET: User Files
 */
export const getUserFiles = async (userId, fileType = null, limit = 50, forceRefresh = false) => {
  const endpoint = 'get-user-files';
  const params = { fileType, limit };
  
  // Check cache first
  if (!forceRefresh) {
    const cached = apiCache.get(endpoint, userId, params);
    if (cached) return cached;
  }

  // Deduplicate in-flight requests
  const cacheKey = apiCache.getCacheKey(endpoint, userId, params);
  return apiCache.deduplicate(cacheKey, async () => {
    try {
      const queryParams = new URLSearchParams();
      if (fileType) queryParams.append('fileType', fileType);
      if (limit) queryParams.append('limit', limit.toString());
      
      const url = `${API_BASE_URL}/${endpoint}/${encodeURIComponent(userId)}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const res = await fetch(url);
      if (res.status === 404) {
        console.warn('⚠️ getUserFiles: 404 Not Found, returning empty array');
        return [];
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      
      // **FIX**: Ensure we always return an array
      const files = Array.isArray(data) ? data : (data?.files ? data.files : []);
      
      apiCache.set(endpoint, userId, files, params);
      return files;
    } catch (error) {
      console.error('❌ Error fetching user files:', error);
      return []; // Return empty array instead of null
    }
  });
};

/**
 * POST: Save Brand Data
 */
export const saveBrandData = async (userId, brandData) => {
  try {
    const form = new FormData();
    form.append('userId', userId);
    form.append('timestamp', new Date().toISOString());
    form.append('brandName', brandData.brandName || '');
    form.append('tagline', brandData.tagline || '');
    form.append('brandDescription', brandData.brandDescription || '');
    form.append('primaryColor', brandData.primaryColor || '');
    form.append('secondaryColor', brandData.secondaryColor || '');
    form.append('accentColor', brandData.accentColor || '');
    form.append('colorPalette', brandData.colorPalette || '');
    
    // Handle toneOfVoice
    let toneOfVoiceValue = '';
    if (Array.isArray(brandData.toneOfVoice)) {
      toneOfVoiceValue = brandData.toneOfVoice.join(', ');
      if (brandData.toneOfVoice.includes('Custom') && brandData.customTone) {
        toneOfVoiceValue = toneOfVoiceValue.replace('Custom', brandData.customTone);
      }
    } else {
      toneOfVoiceValue = brandData.toneOfVoice || '';
    }
    form.append('toneOfVoice', toneOfVoiceValue);
    
    form.append('isComplete', String(brandData.isComplete || false));
    form.append('completionPercentage', String(brandData.completionPercentage || 0));
    form.append('lastUpdated', new Date().toISOString());
    form.append('dataVersion', String(brandData.dataVersion || 1.0));
    form.append('source', brandData.source || 'frontend');
    form.append('apiEndpoint', brandData.apiEndpoint || 'branddata-form');
    form.append('submissionSource', brandData.submissionSource || 'web');
    form.append('systemMetadata', brandData.systemMetadata || '{}');
    
    // Handle logo files
    if (brandData.logoFiles && brandData.logoFiles.length > 0) {
      console.log('🔍 Processing logoFiles:', brandData.logoFiles.length, 'files');
      form.append('logoCount', String(brandData.logoFiles.length));
      brandData.logoFiles.forEach((file, index) => {
        console.log(`🔍 Processing logo ${index}:`, file?.name, file?.type, file?.size);
        form.append(`logo_${index}`, file);
      });
    }
    
    // Handle video files
    if (brandData.videoFiles && brandData.videoFiles.length > 0) {
      brandData.videoFiles.forEach((file, index) => {
        form.append('videoFiles', file);
        form.append('videoMetadata', brandData.videoMetadata?.[index] || '');
      });
    }
    
    // Handle image files
    if (brandData.imageFiles && brandData.imageFiles.length > 0) {
      brandData.imageFiles.forEach((file, index) => {
        form.append('imageFiles', file);
        form.append('imageMetadata', brandData.imageMetadata?.[index] || '');
      });
    }
    
    const res = await fetch(`${API_BASE_URL}/branddata-form`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const result = await res.json();
    
    // Invalidate brand cache after successful save
    apiCache.invalidate('get-user-brands', userId);
    console.log('✅ Brand data saved, cache invalidated');
    
    return result;
  } catch (error) {
    console.error('❌ Error saving brand data:', error);
    throw error;
  }
};

/**
 * POST: Save User Profile
 */
export const saveUserProfile = async (userId, profileData) => {
  try {
    const payload = {
      userId,
      timestamp: new Date().toISOString(),
      userProfile: {
        personalInfo: {
          fullName: profileData.fullName || '',
          email: profileData.email || '',
          username: profileData.username || '',
          phoneNumber: profileData.phoneNumber || null,
          photoURL: profileData.photoURL || null
        },
        companyInfo: {
          companyName: profileData.companyName || '',
          companySize: profileData.companySize || '',
          designation: profileData.designation || '',
          sector: profileData.sector || ''
        },
        authInfo: {
          authProvider: profileData.authProvider || 'email',
          isGoogleUser: !!profileData.isGoogleUser,
          isEmailVerified: !!profileData.isEmailVerified,
          termsAccepted: !!profileData.termsAccepted,
          registrationDate: new Date().toISOString(),
          lastLoginDate: new Date().toISOString()
        }
      },
      metadata: { source: 'frontend', version: '1.0' }
    };
    
    const res = await fetch(`${API_BASE_URL}/UserProfileDetails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    // Invalidate profile cache after successful save
    apiCache.invalidate('get-user-profile', userId);
    console.log('✅ User profile saved, cache invalidated');
    
    return true;
  } catch (error) {
    console.error('❌ Error saving user profile:', error);
    throw error;
  }
};

/**
 * POST: Save Plan Selection
 */
export const savePlanSelection = async (userId, planData) => {
  try {
    const form = new FormData();
    form.append('userId', userId);
    form.append('planId', planData.planId || '');
    form.append('planName', planData.planName || '');
    form.append('paymentId', planData.paymentId || '');
    form.append('paymentStatus', planData.paymentStatus || 'pending');
    form.append('subscriptionType', planData.subscriptionType || 'new');
    form.append('subscriptionStartDate', planData.subscriptionStartDate || '');
    form.append('subscriptionEndDate', planData.subscriptionEndDate || '');
    form.append('totalPrice', String(planData.totalPrice || 0));
    form.append('basePrice', String(planData.basePrice || 0));
    form.append('additionalAdPrice', String(planData.additionalAdPrice || 0));
    form.append('totalAds', String(planData.totalAds || 1));
    form.append('validityDays', String(planData.validityDays || 30));
    form.append('isActive', String(planData.isActive !== false));
    form.append('selectedFeatures', JSON.stringify(planData.selectedFeatures || []));
    form.append('createdAt', planData.createdAt || new Date().toISOString());
    form.append('updatedAt', planData.updatedAt || new Date().toISOString());
    form.append('max_ads_per_month', String(planData.max_ads_per_month || planData.totalAds || 0));
    
    const res = await fetch(`${API_BASE_URL}/save-plan-selection`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    // Invalidate plan cache after successful save
    apiCache.invalidate('get-plan-selections', userId);
    apiCache.invalidate('get-user-profile', userId); // Also invalidate profile as it contains subscription
    console.log('✅ Plan selection saved, cache invalidated');
    
    return true;
  } catch (error) {
    console.error('❌ Error saving plan selection:', error);
    throw error;
  }
};

/**
 * POST: Send Analysis Details
 */
export const sendAnalysisDetails = async (analysisData) => {
  try {
    const form = new FormData();
    form.append('userId', analysisData.userId);
    form.append('brandId', analysisData.brandId);
    form.append('timestamp', analysisData.timestamp);
    form.append('messageIntent', analysisData.messageIntent);
    form.append('funnelStage', analysisData.funnelStage);
    form.append('channels', JSON.stringify(analysisData.channels || []));
    form.append('source', analysisData.source || 'frontend');
    form.append('clientId', analysisData.clientId || '');
    form.append('artifacts', JSON.stringify(analysisData.artifacts || {}));
    form.append('mediaFile', analysisData.mediaFile);
    
    if (analysisData.logoFile) {
      form.append('logoFile', analysisData.logoFile);
    }
    
    const res = await fetch(`${API_BASE_URL}/postAnalysisDetailsFormData`, { 
      method: 'POST', 
      body: form 
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    // Invalidate analysis cache after successful submission
    apiCache.invalidate('get-user-analysis-history', analysisData.userId);
    console.log('✅ Analysis submitted, cache invalidated');
    
    return await res.json();
  } catch (error) {
    console.error('❌ Error sending analysis:', error);
    throw error;
  }
};

/**
 * PATCH: Update User Profile
 */
export const updateUserProfile = async (userId, updates) => {
  try {
    const payload = { updates, timestamp: new Date().toISOString() };
    const res = await fetch(`${API_BASE_URL}/updateUserProfileDetails/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    // Invalidate profile cache after successful update
    apiCache.invalidate('get-user-profile', userId);
    console.log('✅ User profile updated, cache invalidated');
    
    return true;
  } catch (error) {
    console.error('❌ Error updating user profile:', error);
    throw error;
  }
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Get all user data in one call (profile, brands, plans)
 */
export const getAllUserData = async (userId, forceRefresh = false) => {
  try {
    // Use Promise.all to fetch in parallel, but with deduplication/caching
    const [profile, brands, plans] = await Promise.all([
      getUserProfile(userId, forceRefresh),
      getUserBrands(userId, forceRefresh),
      getPlanSelections(userId, forceRefresh)
    ]);
    
    return {
      profile,
      brands,
      plans,
      hasCompleteData: !!(profile && brands && plans)
    };
  } catch (error) {
    console.error('❌ Error fetching all user data:', error);
    return {
      profile: null,
      brands: null,
      plans: null,
      hasCompleteData: false
    };
  }
};

/**
 * Force refresh all user data
 */
export const refreshAllUserData = async (userId) => {
  console.log('🔄 Force refreshing all user data...');
  apiCache.invalidateAll();
  return getAllUserData(userId, true);
};

/**
 * Clear cache for specific user
 */
export const clearUserCache = (userId) => {
  console.log('🗑️ Clearing cache for user:', userId);
  apiCache.invalidate('get-user-profile', userId);
  apiCache.invalidate('get-user-brands', userId);
  apiCache.invalidate('get-plan-selections', userId);
  apiCache.invalidate('get-user-analysis-history', userId);
  apiCache.invalidate('get-user-files', userId);
};

/**
 * Clear all cache
 */
export const clearAllCache = () => {
  console.log('🗑️ Clearing all cache');
  apiCache.invalidateAll();
};

/**
 * POST: Submit Analysis Request
 */
export const submitAnalysisRequest = async (analysisData, mediaFile, logoFile = null) => {
  try {
    const form = new FormData();
    form.append('userId', analysisData.userId);
    form.append('brandId', analysisData.brandId);
    form.append('timestamp', analysisData.timestamp);
    form.append('messageIntent', analysisData.messageIntent);
    form.append('funnelStage', analysisData.funnelStage);
    form.append('channels', JSON.stringify(analysisData.channels || []));
    form.append('source', analysisData.source || 'frontend');
    form.append('clientId', analysisData.clientId || '');
    form.append('artifacts', JSON.stringify(analysisData.artifacts || {}));
    form.append('mediaFile', mediaFile);
    
    // **FIX**: Include adTitle in the submission
    if (analysisData.adTitle) {
      form.append('adTitle', analysisData.adTitle);
    }
    
    // **FIX**: Include selectedFeatures for Lite plan users
    // This ensures the backend stores which features were selected at analysis time
    // and filters cards correctly in HTML/PDF generation
    if (analysisData.selectedFeatures && Array.isArray(analysisData.selectedFeatures)) {
      form.append('selectedFeatures', JSON.stringify(analysisData.selectedFeatures));
      console.log('📝 Sending selectedFeatures to backend:', analysisData.selectedFeatures);
    } else {
      form.append('selectedFeatures', JSON.stringify([]));
    }
    
    if (logoFile) {
      form.append('logoFile', logoFile);
    }
    
    const res = await fetch(`${API_BASE_URL}/postAnalysisDetailsFormData`, { 
      method: 'POST', 
      body: form 
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    // **FIX**: Invalidate ALL relevant caches after analysis submission
    // The backend updates: adsUsed, user profile, analysis history, and files
    apiCache.invalidate('get-user-profile', analysisData.userId);
    apiCache.invalidate('get-user-analysis-history', analysisData.userId);
    apiCache.invalidate('get-user-files', analysisData.userId);
    console.log('✅ Analysis submitted, caches invalidated (profile, history, files)');
    
    return await res.json();
  } catch (error) {
    console.error('❌ Error submitting analysis:', error);
    throw error;
  }
};

/**
 * POST: Decrement User Ad Count
 */
export const decrementUserAdCount = async (userId) => {
  try {
    const res = await fetch(`${API_BASE_URL}/decrement-ad-count/${encodeURIComponent(userId)}`, {
      method: 'POST'
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    // Invalidate user profile cache
    apiCache.invalidate('get-user-profile', userId);
    console.log('✅ Ad count decremented, cache invalidated');
    
    return await res.json();
  } catch (error) {
    console.error('❌ Error decrementing ad count:', error);
    throw error;
  }
};

/**
 * GET: Get Brand Data By ID
 */
export const getBrandDataById = async (brandId) => {
  try {
    const res = await fetch(`${API_BASE_URL}/get-brand-data/${encodeURIComponent(brandId)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    return await res.json();
  } catch (error) {
    console.error('❌ Error fetching brand data by ID:', error);
    return null;
  }
};

/**
 * POST: Upload Analysis PDF
 */
export const uploadAnalysisPdf = async (userId, pdfFile, analysisId = null, fileName = null) => {
  try {
    const form = new FormData();
    form.append('userId', userId);
    form.append('file', pdfFile);
    if (analysisId) form.append('analysisId', analysisId);
    if (fileName) form.append('fileName', fileName);
    
    const res = await fetch(`${API_BASE_URL}/upload-analysis-pdf`, { 
      method: 'POST', 
      body: form 
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    // Invalidate user files cache
    apiCache.invalidate('get-user-files', userId);
    console.log('✅ PDF uploaded, cache invalidated');
    
    return await res.json();
  } catch (error) {
    console.error('❌ Error uploading PDF:', error);
    throw error;
  }
};

/**
 * POST: Send Analysis Data to PDF Endpoint
 */
export const sendAnalysisDataToPDFEndpoint = async (analysisData, adTitle, userId, analysisId, uploadedImageData = null) => {
  try {
    const payload = {
      analysis_data: analysisData,
      ad_title: adTitle,
      user_id: userId,
      analysis_id: analysisId,
      uploaded_image_data: uploadedImageData
    };
    
    const res = await fetch(`${API_BASE_URL}/generate-analysis-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    // Invalidate user files cache
    apiCache.invalidate('get-user-files', userId);
    
    return await res.json();
  } catch (error) {
    console.error('❌ Error generating PDF:', error);
    throw error;
  }
};

/**
 * DELETE: Delete User File
 */
export const deleteUserFile = async (fileId, userId = null) => {
  try {
    const res = await fetch(`${API_BASE_URL}/delete-user-file/${encodeURIComponent(fileId)}`, {
      method: 'DELETE'
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    // Invalidate user files cache
    if (userId) {
      apiCache.invalidate('get-user-files', userId);
      console.log('✅ File deleted, cache invalidated');
    }
    
    return await res.json();
  } catch (error) {
    console.error('❌ Error deleting file:', error);
    throw error;
  }
};

/**
 * POST: Add Sample User Files (for testing)
 */
export const addSampleUserFiles = async (userId) => {
  try {
    const res = await fetch(`${API_BASE_URL}/add-sample-files/${encodeURIComponent(userId)}`, {
      method: 'POST'
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    // Invalidate user files cache
    apiCache.invalidate('get-user-files', userId);
    console.log('✅ Sample files added, cache invalidated');
    
    return await res.json();
  } catch (error) {
    console.error('❌ Error adding sample files:', error);
    throw error;
  }
};

/**
 * Save Subscription Data to User Profile
 * This saves subscription as part of the user profile (no separate endpoint needed)
 */
export const saveSubscriptionData = async (userId, subscriptionData) => {
  try {
    console.log('💳 Saving subscription data to user profile for user:', userId);
    
    const subscriptionInfo = {
      ...subscriptionData,
      purchaseDate: subscriptionData.purchaseDate || new Date().toISOString(),
      status: subscriptionData.status || 'active',
      adsUsed: subscriptionData.adsUsed || 0,
      lastUpdated: new Date().toISOString()
    };
    
    // Save subscription to user profile using updateUserProfile
    const result = await updateUserProfile(userId, {
      subscription: subscriptionInfo,
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ Subscription data saved to user profile successfully');
    return result;
    
  } catch (error) {
    console.error('❌ Error saving subscription to user profile:', error);
    
    // If update fails (no profile exists), try creating the profile
    if (error.message && error.message.includes('No document to update')) {
      console.log('🔧 User profile missing, creating new profile with subscription...');
      try {
        const result = await saveUserProfile(userId, {
          email: subscriptionData.email || 'user@example.com',
          fullName: subscriptionData.fullName || 'User',
          subscription: {
            ...subscriptionData,
            purchaseDate: subscriptionData.purchaseDate || new Date().toISOString(),
            status: subscriptionData.status || 'active',
            adsUsed: subscriptionData.adsUsed || 0,
            lastUpdated: new Date().toISOString()
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        console.log('✅ User profile created with subscription data');
        return result;
      } catch (createError) {
        console.error('❌ Failed to create user profile:', createError);
        throw createError;
      }
    }
    
    throw error;
  }
};

/**
 * Clear user cache (for AuthContext and other use cases)
 */
export const invalidateUserCache = (userId) => {
  if (!userId) return;
  clearUserCache(userId);
  console.log('🗑️ User cache invalidated for:', userId);
};

// Export cache instance for advanced usage
export { apiCache };

export default {
  // GET methods
  getUserProfile,
  getUserBrands,
  getPlanSelections,
  getUserAnalysisHistory,
  getUserFiles,
  getAllUserData,
  getBrandDataById,
  
  // POST/PATCH methods
  saveBrandData,
  saveUserProfile,
  savePlanSelection,
  sendAnalysisDetails,
  updateUserProfile,
  submitAnalysisRequest,
  decrementUserAdCount,
  uploadAnalysisPdf,
  sendAnalysisDataToPDFEndpoint,
  saveSubscriptionData,
  
  // DELETE methods
  deleteUserFile,
  
  // Testing/Admin methods
  addSampleUserFiles,
  
  // Utility methods
  refreshAllUserData,
  clearUserCache,
  clearAllCache,
  invalidateUserCache
};

