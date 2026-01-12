// JSON API Helper functions for signup data management
import ENV_CONFIG from './environmentConfig';

const API_BASE_URL = ENV_CONFIG.PYTHON_API_URL;
const USER_PROFILE_API_BASE_URL = ENV_CONFIG.PYTHON_API_URL;

// Debug: Log the API base URLs to verify configuration
console.log('🔧 jsonApiHelpers.js - API_BASE_URL:', API_BASE_URL);
console.log('🔧 jsonApiHelpers.js - USER_PROFILE_API_BASE_URL:', USER_PROFILE_API_BASE_URL);
console.log('🔧 jsonApiHelpers.js - REACT_APP_URL env var:', process.env.REACT_APP_URL);
console.log('🔧 jsonApiHelpers.js - REACT_APP_API_URL env var:', process.env.REACT_APP_API_URL);

// ===============================
// JSON DATA FORMATTERS
// ===============================

/**
 * Create JSON payload from signup form data
 */
export const createSignupJSON = (formData, userId, additionalData = {}) => {
  const signupJSON = {
    userId: userId,
    timestamp: new Date().toISOString(),
    userProfile: {
      personalInfo: {
        fullName: formData.fullName,
        email: formData.email,
        username: formData.username,
        phoneNumber: additionalData.phoneNumber || null,
        photoURL: additionalData.photoURL || null
      },
      companyInfo: {
        companyName: formData.companyName,
        companySize: formData.companySize,
        designation: formData.designation,
        sector: formData.sector,
        customDesignation: formData.designation === 'Custom' ? formData.customDesignation : null,
        customSector: formData.sector === 'Custom' ? formData.customSector : null
      },
      authInfo: {
        authProvider: additionalData.authProvider || 'email',
        isGoogleUser: additionalData.isGoogleUser || false,
        isEmailVerified: additionalData.isEmailVerified || false,
        termsAccepted: true,
        registrationDate: new Date().toISOString(),
        lastLoginDate: new Date().toISOString()
      },
      preferences: {
        newsletter: additionalData.newsletter || false,
        marketing: additionalData.marketing || false,
        notifications: additionalData.notifications || true
      }
    },
    metadata: {
      source: 'web_signup',
      version: '1.0',
      userAgent: navigator.userAgent,
      referrer: document.referrer || null,
      ...additionalData.metadata
    }
  };

  return signupJSON;
};

/**
 * Validate JSON structure
 */
export const validateSignupJSON = (jsonData) => {
  const errors = [];
  
  if (!jsonData.userId) errors.push('userId is required');
  if (!jsonData.userProfile?.personalInfo?.fullName) errors.push('fullName is required');
  if (!jsonData.userProfile?.personalInfo?.email) errors.push('email is required');
  if (!jsonData.userProfile?.companyInfo?.companyName) errors.push('companyName is required');
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
};

// ===============================
// FETCH API FUNCTIONS
// ===============================

/**
 * Send signup data using fetch API
 */
export const sendSignupData = async (signupJSON) => {
  try {
    const validation = validateSignupJSON(signupJSON);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    console.log('📤 Sending signup data to:', `${API_BASE_URL}/postUserProfileDetails`);
    console.log('📦 Request payload:', signupJSON);

    const response = await fetch(`${API_BASE_URL}/postUserProfileDetails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(signupJSON)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status}: ${errorData.message || response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ Signup data sent successfully:', result);
    
    return {
      success: true,
      data: result,
      userId: signupJSON.userId
    };

  } catch (error) {
    console.error('❌ Error sending signup data:', error);
    throw error;
  }
};

/**
 * Fetch user data using fetch API
 */
export const fetchUserData = async (userId) => {
  try {
    console.log('�� Fetching user data for:', userId);

    const response = await fetch(`${API_BASE_URL}/getUserProfileDetails/${userId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, data: null, message: 'User not found' };
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status}: ${errorData.message || response.statusText}`);
    }

    const userData = await response.json();
    console.log('✅ User data fetched successfully:', userData);
    
    return {
      success: true,
      data: userData
    };

  } catch (error) {
    console.error('❌ Error fetching user data:', error);
    throw error;
  }
};

/**
 * Update user data using fetch API
 */
export const updateUserData = async (userId, updates) => {
  try {
    console.log('📝 Updating user data for:', userId, updates);

    const response = await fetch(`${API_BASE_URL}/updateUserProfileDetails/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        updates: updates,
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status}: ${errorData.message || response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ User data updated successfully:', result);
    
    return {
      success: true,
      data: result
    };

  } catch (error) {
    console.error('❌ Error updating user data:', error);
    throw error;
  }
};

/**
 * Get all users (admin function)
 */
export const fetchAllUsers = async (limit = 50, offset = 0) => {
  try {
    console.log('📥 Fetching all users...');

    const response = await fetch(`${API_BASE_URL}/getAllUserProfileDetails?limit=${limit}&offset=${offset}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status}: ${errorData.message || response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ All users fetched successfully:', result);
    
    return {
      success: true,
      data: result.users || [],
      total: result.total || 0,
      limit: limit,
      offset: offset
    };

  } catch (error) {
    console.error('❌ Error fetching all users:', error);
    throw error;
  }
};

// ===============================
// LOCAL STORAGE FUNCTIONS
// ===============================

/**
 * Save signup state to localStorage as JSON
 */
export const saveSignupStateLocal = (signupJSON) => {
  try {
    const stateKey = `incivus_signup_state_${signupJSON.userId}`;
    localStorage.setItem(stateKey, JSON.stringify(signupJSON));
    localStorage.setItem('incivus_last_signup_state', stateKey);
    
    console.log('💾 Signup state saved locally:', stateKey);
    return true;
  } catch (error) {
    console.error('❌ Error saving signup state locally:', error);
    return false;
  }
};

/**
 * Fetch signup state from localStorage
 */
export const fetchSignupStateLocal = (userId) => {
  try {
    const stateKey = `incivus_signup_state_${userId}`;
    const stateData = localStorage.getItem(stateKey);
    
    if (!stateData) {
      return { success: false, data: null, message: 'No local state found' };
    }
    
    const parsedData = JSON.parse(stateData);
    console.log('📱 Signup state fetched from local storage:', parsedData);
    
    return {
      success: true,
      data: parsedData
    };
  } catch (error) {
    console.error('❌ Error fetching signup state locally:', error);
    return { success: false, data: null, error: error.message };
  }
};

/**
 * Get last signup state
 */
export const getLastSignupState = () => {
  try {
    const lastStateKey = localStorage.getItem('incivus_last_signup_state');
    if (!lastStateKey) return null;
    
    const stateData = localStorage.getItem(lastStateKey);
    return stateData ? JSON.parse(stateData) : null;
  } catch (error) {
    console.error('❌ Error getting last signup state:', error);
    return null;
  }
};

// ===============================
// FIREBASE INTEGRATION (Optional)
// ===============================

/**
 * Send JSON to Firebase using fetch-like approach
 */
export const sendToFirebaseViaJSON = async (signupJSON) => {
  try {
    // This would integrate with your existing Firebase functions
    const { saveUserProfileDetails } = await import('../firebase/firestoreHelpers');
    
    const firebaseData = {
      fullName: signupJSON.userProfile.personalInfo.fullName,
      email: signupJSON.userProfile.personalInfo.email,
      username: signupJSON.userProfile.personalInfo.username,
      companyName: signupJSON.userProfile.companyInfo.companyName,
      companySize: signupJSON.userProfile.companyInfo.companySize,
      designation: signupJSON.userProfile.companyInfo.designation,
      sector: signupJSON.userProfile.companyInfo.sector,
      authProvider: signupJSON.userProfile.authInfo.authProvider,
      isGoogleUser: signupJSON.userProfile.authInfo.isGoogleUser,
      photoURL: signupJSON.userProfile.personalInfo.photoURL,
      phoneNumber: signupJSON.userProfile.personalInfo.phoneNumber,
      isEmailVerified: signupJSON.userProfile.authInfo.isEmailVerified,
      termsAccepted: signupJSON.userProfile.authInfo.termsAccepted
    };
    
    await saveUserProfileDetails(signupJSON.userId, firebaseData);
    
    return {
      success: true,
      message: 'Data saved to Firebase via JSON structure'
    };
    
  } catch (error) {
    console.error('❌ Error saving to Firebase via JSON:', error);
    throw error;
  }
};

// ===============================
// UTILITY FUNCTIONS
// ===============================

/**
 * Export signup data as downloadable JSON
 */
export const exportSignupJSON = (signupJSON, filename = null) => {
  try {
    const jsonString = JSON.stringify(signupJSON, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `signup_data_${signupJSON.userId}_${Date.now()}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    
    console.log('📤 Signup JSON exported successfully');
    return true;
  } catch (error) {
    console.error('❌ Error exporting signup JSON:', error);
    return false;
  }
};

/**
 * Import signup data from JSON file
 */
export const importSignupJSON = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const jsonData = JSON.parse(event.target.result);
        const validation = validateSignupJSON(jsonData);
        
        if (!validation.isValid) {
          reject(new Error(`Invalid JSON structure: ${validation.errors.join(', ')}`));
          return;
        }
        
        console.log('📥 Signup JSON imported successfully');
        resolve(jsonData);
      } catch (error) {
        reject(new Error(`Failed to parse JSON: ${error.message}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
};

// ===============================
// BRAND SETUP JSON API HELPERS
// ===============================

// Create Brand Setup JSON from brand data
export const createBrandSetupJSON = (brandData, userId, additionalInfo = {}) => {
  const brandSetupPayload = {
    userId: userId,
    timestamp: new Date().toISOString(),
    brandSetup: {
      brandIdentity: {
        brandName: brandData.brandName || '',
        tagline: brandData.tagline || '',
        brandDescription: brandData.brandDescription || '',
        industryCategory: brandData.industryCategory || '',
        targetAudience: brandData.targetAudience || ''
      },
      visualIdentity: {
        logos: brandData.logos || [],
        primaryLogo: brandData.logos?.[0]?.url || brandData.logos?.[0]?.preview || '',
        logoVariations: brandData.logos || [],
        colorPalette: {
          primaryColor: brandData.primaryColor || '#F05A28',
          secondaryColor: brandData.secondaryColor || '#000000',
          accentColor: brandData.accentColor || '#FFFFFF',
          brandColors: [
            brandData.primaryColor,
            brandData.secondaryColor,
            brandData.accentColor
          ].filter(Boolean)
        }
      },
      brandVoice: {
        toneOfVoice: brandData.toneOfVoice === 'Custom' ? brandData.customTone : brandData.toneOfVoice,
        customTone: brandData.customTone || '',
        communicationStyle: brandData.communicationStyle || '',
        brandVoice: brandData.brandVoice || '',
        keyMessages: brandData.keyMessages || []
      },
      completionStatus: {
        isComplete: true,
        completionPercentage: 100,
        lastUpdated: new Date().toISOString()
      }
    },
    systemMetadata: {
      submissionTime: new Date().toISOString(),
      dataVersion: '1.0',
      source: 'brand-setup-form',
      apiEndpoint: 'branddata-form',
      ...additionalInfo
    }
  };

  return brandSetupPayload;
};

// Send Brand Setup data to API
export const sendBrandSetupData = async (brandSetupJSON) => {
  const validation = validateBrandSetupJSON(brandSetupJSON);
  if (!validation.isValid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }

  console.log('📤 Sending brand setup data to:', `${API_BASE_URL}/postBrandSetupDetails`);
  console.log('📦 Request payload:', brandSetupJSON);

  const response = await fetch(`${API_BASE_URL}/postBrandSetupDetails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(brandSetupJSON)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`HTTP ${response.status}: ${errorData.message || response.statusText}`);
  }

  const data = await response.json();
  return { success: true, data };
};

// Validate Brand Setup JSON structure
export const validateBrandSetupJSON = (brandSetupJSON) => {
  const errors = [];

  if (!brandSetupJSON.userId) {
    errors.push('User ID is required');
  }

  if (!brandSetupJSON.brandSetup) {
    errors.push('Brand setup data is required');
  }

  if (brandSetupJSON.brandSetup && !brandSetupJSON.brandSetup.brandIdentity?.brandName) {
    errors.push('Brand name is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Save Brand Setup state locally
export const saveBrandSetupStateLocal = (brandSetupJSON) => {
  try {
    localStorage.setItem('incivus_brand_setup_json', JSON.stringify(brandSetupJSON));
    localStorage.setItem('incivus_brand_setup_timestamp', new Date().toISOString());
    console.log('💾 Brand setup JSON saved to localStorage');
  } catch (error) {
    console.error('❌ Error saving brand setup to localStorage:', error);
  }
};

// Send Brand Setup data to Firebase via JSON
export const sendBrandSetupToFirebaseViaJSON = async (brandSetupJSON) => {
  // Import Firebase functions
  const { saveBrandSetup } = await import('../firebase/firestoreHelpers');
  
  const brandSetupData = {
    brandName: brandSetupJSON.brandSetup.brandIdentity.brandName,
    tagline: brandSetupJSON.brandSetup.brandIdentity.tagline,
    brandDescription: brandSetupJSON.brandSetup.brandIdentity.brandDescription,
    industryCategory: brandSetupJSON.brandSetup.brandIdentity.industryCategory,
    targetAudience: brandSetupJSON.brandSetup.brandIdentity.targetAudience,
    
    // Brand Colors
    primaryColor: brandSetupJSON.brandSetup.visualIdentity.colorPalette.primaryColor,
    secondaryColor: brandSetupJSON.brandSetup.visualIdentity.colorPalette.secondaryColor,
    accentColor: brandSetupJSON.brandSetup.visualIdentity.colorPalette.accentColor,
    colorPalette: brandSetupJSON.brandSetup.visualIdentity.colorPalette.brandColors,
    
    // Brand Logos
    primaryLogo: brandSetupJSON.brandSetup.visualIdentity.primaryLogo,
    logoVariations: brandSetupJSON.brandSetup.visualIdentity.logoVariations,
    
    // Voice and Tone
    toneOfVoice: brandSetupJSON.brandSetup.brandVoice.toneOfVoice,
    customTone: brandSetupJSON.brandSetup.brandVoice.customTone,
    communicationStyle: brandSetupJSON.brandSetup.brandVoice.communicationStyle,
    brandVoice: brandSetupJSON.brandSetup.brandVoice.brandVoice,
    keyMessages: brandSetupJSON.brandSetup.brandVoice.keyMessages,
    
    // Status
    isComplete: brandSetupJSON.brandSetup.completionStatus.isComplete,
    completionPercentage: brandSetupJSON.brandSetup.completionStatus.completionPercentage
  };

  await saveBrandSetup(brandSetupJSON.userId, brandSetupData);
  console.log('✅ Brand setup data saved to Firebase via JSON');
};

// ===============================
// ANALYSIS API HELPERS (for analysis_details_api.py on port 8001)
// ===============================

// Point to local services via env; fall back to local ports
const ANALYSIS_API_BASE_URL = ENV_CONFIG.PYTHON_API_URL;
const AD_ANALYZER_API_BASE_URL = ENV_CONFIG.PYTHON_API_URL;


/**
 * Send analysis details to the Python API
 */
export const sendAnalysisDetailsToAPI = async (analysisData, userId, uploadedFile, additionalInfo = {}) => {
  try {
    const formData = new FormData();
    
    // Add required fields for the Python API
    formData.append('userId', userId);
    formData.append('timestamp', new Date().toISOString());
    formData.append('messageIntent', analysisData.messageIntent || '');
    formData.append('funnelStage', JSON.stringify(analysisData.funnelStage || []));
    formData.append('channels', JSON.stringify(analysisData.channels || []));
    formData.append('source', 'analysis-page');
    formData.append('clientId', userId); // Using userId as clientId
    formData.append('adTitle', analysisData.adTitle || '');  // Added: ad title for display
    formData.append('selectedFeatures', JSON.stringify(analysisData.selectedFeatures || []));  // Added: selected features for Lite users
    
    // Create artifacts object with analysis results
    const artifacts = {
      analysisResults: analysisData.results || null,
      metadata: {
        version: '1.0',
        submissionTime: new Date().toISOString(),
        userFeatures: additionalInfo.userFeatures || [],
        userPlan: additionalInfo.userPlan || 'lite',
        adNumber: additionalInfo.adNumber || 1,
        submissionSource: additionalInfo.submissionSource || 'analysis-page',
        ...additionalInfo.metadata
      },
      fileInfo: uploadedFile ? {
        name: uploadedFile.name,
        size: uploadedFile.size,
        type: uploadedFile.type,
        lastModified: uploadedFile.lastModified
      } : null
    };
    
    formData.append('artifacts', JSON.stringify(artifacts));

    console.log('📤 Sending analysis details to Python API:', USER_PROFILE_API_BASE_URL + '/postAnalysisDetailsFormData');
    console.log('📦 Analysis data:', {
      userId,
      messageIntent: analysisData.messageIntent,
      funnelStage: analysisData.funnelStage,
      channels: analysisData.channels,
      hasResults: !!analysisData.results,
      hasFile: !!uploadedFile
    });

    const response = await fetch(`${USER_PROFILE_API_BASE_URL}/postAnalysisDetailsFormData`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Analysis details sent to API successfully:', result);
    
    return {
      success: true,
      data: result
    };

  } catch (error) {
    console.error('❌ Error sending analysis details to API:', error);
    throw error;
  }
};

/**
 * Fetch analysis details for a specific user
 */
export const fetchAnalysisDetailsFromAPI = async (userId) => {
  try {
    console.log('📥 Fetching analysis details for user:', userId);

    const response = await fetch(`${ANALYSIS_API_BASE_URL}/get-analysis-details/${userId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, data: null, message: 'Analysis details not found' };
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status}: ${errorData.detail || response.statusText}`);
    }

    const analysisData = await response.json();
    console.log('✅ Analysis details fetched successfully:', analysisData);
    
    return {
      success: true,
      data: analysisData
    };

  } catch (error) {
    console.error('❌ Error fetching analysis details:', error);
    throw error;
  }
};

/**
 * Fetch all analysis details from the API
 */
export const fetchAllAnalysisDetailsFromAPI = async () => {
  try {
    console.log('📥 Fetching all analysis details...');

    const response = await fetch(`${ANALYSIS_API_BASE_URL}/list-all-analysis-details`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status}: ${errorData.detail || response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ All analysis details fetched successfully:', result);
    
    return {
      success: true,
      data: result.documents || [],
      total: result.total_documents || 0
    };

  } catch (error) {
    console.error('❌ Error fetching all analysis details:', error);
    throw error;
  }
};

// ===============================
// USER PROFILE API HELPERS (for app.py on port 8000)
// ===============================

/**
 * Send user profile to the User Profile API
 */
export const sendUserProfileToAPI = async (userProfileData, userId) => {
  try {
    const profilePayload = {
      userId: userId,
      timestamp: new Date().toISOString(),
      userProfile: {
        personalInfo: {
          fullName: userProfileData.fullName,
          email: userProfileData.email,
          username: userProfileData.username,
          phoneNumber: userProfileData.phoneNumber || null,
          photoURL: userProfileData.photoURL || null
        },
        companyInfo: {
          companyName: userProfileData.companyName,
          companySize: userProfileData.companySize,
          designation: userProfileData.designation,
          sector: userProfileData.sector,
          customDesignation: userProfileData.customDesignation || null,
          customSector: userProfileData.customSector || null
        },
        authInfo: {
          authProvider: userProfileData.authProvider || 'email',
          isGoogleUser: userProfileData.isGoogleUser || false,
          isEmailVerified: userProfileData.isEmailVerified || false,
          termsAccepted: true,
          registrationDate: new Date().toISOString()
        }
      },
      metadata: {
        source: 'signup_page',
        version: '1.0',
        submissionTime: new Date().toISOString(),
        ...userProfileData.metadata
      }
    };

    console.log('='.repeat(80));
    console.log('📤 SENDING USER PROFILE TO API');
    console.log('='.repeat(80));
    console.log('🎯 Endpoint:', USER_PROFILE_API_BASE_URL + '/UserProfileDetails');
    console.log('👤 User ID:', userId);
    console.log('📦 Profile Data:', {
      personalInfo: {
        fullName: userProfileData.fullName,
        email: userProfileData.email,
        username: userProfileData.username,
        phoneNumber: userProfileData.phoneNumber || null,
        photoURL: userProfileData.photoURL || null
      },
      companyInfo: {
        companyName: userProfileData.companyName,
        companySize: userProfileData.companySize,
        designation: userProfileData.designation,
        sector: userProfileData.sector
      },
      authInfo: {
        authProvider: userProfileData.authProvider,
        isGoogleUser: userProfileData.isGoogleUser,
        isEmailVerified: userProfileData.isEmailVerified
      }
    });
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('='.repeat(80));

    const response = await fetch(`${USER_PROFILE_API_BASE_URL}/UserProfileDetails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(profilePayload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status}: ${errorData.detail || response.statusText}`);
    }

    const result = await response.json();
    console.log('='.repeat(80));
    console.log('✅ USER PROFILE API RESPONSE');
    console.log('='.repeat(80));
    console.log('📊 Response Data:', result);
    console.log('🆔 User ID:', result.user_id);
    console.log('📝 Message:', result.message);
    console.log('⏱️ Response Time:', new Date().toISOString());
    console.log('='.repeat(80));
    
    return {
      success: true,
      data: result
    };

  } catch (error) {
    console.error('❌ Error sending user profile to API:', error);
    throw error;
  }
};

/**
 * Fetch user profile from the User Profile API
 */
export const fetchUserProfileFromAPI = async (userId) => {
  try {
    console.log('📥 Fetching user profile for user:', userId);

    const response = await fetch(`${USER_PROFILE_API_BASE_URL}/get-user-profile/${userId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, data: null, message: 'User profile not found' };
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status}: ${errorData.detail || response.statusText}`);
    }

    const profileData = await response.json();
    console.log('✅ User profile fetched successfully:', profileData);
    
    return {
      success: true,
      data: profileData
    };

  } catch (error) {
    console.error('❌ Error fetching user profile:', error);
    throw error;
  }
};

/**
 * Save user profile using the save-user-profile endpoint
 */
export const saveUserProfileToAPI = async (userProfileData, userId) => {
  try {
    const profilePayload = {
      userId: userId,
      timestamp: new Date().toISOString(),
      userProfile: userProfileData,
      metadata: {
        source: 'signup_form',
        version: '1.0',
        submissionTime: new Date().toISOString()
      }
    };

    console.log('📤 Saving user profile to API:', USER_PROFILE_API_BASE_URL + '/save-user-profile');

    const response = await fetch(`${USER_PROFILE_API_BASE_URL}/save-user-profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(profilePayload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status}: ${errorData.detail || response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ User profile saved to API successfully:', result);
    
    return {
      success: true,
      data: result
    };

  } catch (error) {
    console.error('❌ Error saving user profile to API:', error);
    throw error;
  }
};

// ===============================
// FORMDATA API HELPERS (for images/videos)
// ===============================

// Create FormData from brand setup data
export const createBrandSetupFormData = (brandData, userId, additionalInfo = {}) => {
  const formData = new FormData();
  
  // Add basic text fields
  formData.append('userId', userId);
  formData.append('timestamp', new Date().toISOString());
  
  // Brand identity data
  formData.append('brandName', brandData.brandName || '');
  formData.append('tagline', brandData.tagline || '');
  formData.append('brandDescription', brandData.brandDescription || '');
  
  // Brand colors
  formData.append('primaryColor', brandData.primaryColor || '#F05A28');
  formData.append('secondaryColor', brandData.secondaryColor || '#000000');
  formData.append('accentColor', brandData.accentColor || '#FFFFFF');
  formData.append('colorPalette', JSON.stringify([
    brandData.primaryColor,
    brandData.secondaryColor,
    brandData.accentColor
  ].filter(Boolean)));
  
  // Brand voice - handle both array and string formats
  let toneOfVoiceValue = '';
  if (Array.isArray(brandData.toneOfVoice)) {
    // If toneOfVoice is an array, join with commas
    toneOfVoiceValue = brandData.toneOfVoice.join(', ');
    // If Custom is included and customTone exists, append it
    if (brandData.toneOfVoice.includes('Custom') && brandData.customTone) {
      toneOfVoiceValue = toneOfVoiceValue.replace('Custom', brandData.customTone);
    }
  } else if (brandData.toneOfVoice === 'Custom') {
    toneOfVoiceValue = brandData.customTone || 'Custom';
  } else {
    toneOfVoiceValue = brandData.toneOfVoice || '';
  }
  
  formData.append('toneOfVoice', toneOfVoiceValue);
  
  // Logo files (backend expects logo_0, logo_1, etc.)
  if (brandData.logos && Array.isArray(brandData.logos)) {
    console.log('🔍 createBrandSetupFormData - Processing logos:', brandData.logos.length);
    let logoFileCount = 0;
    brandData.logos.forEach((logo, index) => {
      if (logo && logo.file instanceof File) {
        console.log(`🔍 createBrandSetupFormData - Adding logo_${logoFileCount}:`, logo.file.name, logo.file.size);
        formData.append(`logo_${logoFileCount}`, logo.file, logo.file.name || `logo_${logoFileCount}`);
        logoFileCount++;
      } else if (logo && logo.url) {
        // For already uploaded logos, include metadata for reference
        console.log(`🔍 createBrandSetupFormData - Logo ${index} already uploaded:`, logo.url);
      }
    });
    formData.append('logoCount', logoFileCount.toString());
    console.log(`🔍 createBrandSetupFormData - Total logo files to upload: ${logoFileCount}`);
  } else {
    formData.append('logoCount', '0');
  }
  
  // Completion status
  formData.append('isComplete', 'true');
  formData.append('completionPercentage', '100');
  formData.append('lastUpdated', new Date().toISOString());
  
  // System metadata
  formData.append('dataVersion', '1.0');
  formData.append('source', 'brand-setup-form');
  formData.append('apiEndpoint', 'branddata-form');
  formData.append('submissionSource', 'brand-setup-page');
  formData.append('systemMetadata', JSON.stringify({
    submissionTime: new Date().toISOString(),
    logoCount: brandData.logos?.length || 0,
    hasCustomTone: brandData.toneOfVoice === 'Custom',
    ...additionalInfo
  }));
  
  return formData;
};

// Send Brand Setup FormData to API
export const sendBrandSetupFormData = async (formData) => {
  console.log('='.repeat(80));
  console.log('📤 SENDING BRAND SETUP DATA TO API');
  console.log('='.repeat(80));
  console.log('🎯 Endpoint:', USER_PROFILE_API_BASE_URL + '/branddata-form');
  
  // Create a structured view of the FormData
  const formDataSummary = {
    basicInfo: {},
    brandIdentity: {},
    visualIdentity: {},
    brandVoice: {},
    files: [],
    metadata: {}
  };
  
  // Log FormData contents in a structured way
  for (let [key, value] of formData.entries()) {
    if (value instanceof File) {
      formDataSummary.files.push({
        fieldName: key,
        fileName: value.name,
        fileSize: `${(value.size / 1024).toFixed(2)} KB`,
        fileType: value.type
      });
    } else {
      // Categorize fields
      if (['userId', 'timestamp'].includes(key)) {
        formDataSummary.basicInfo[key] = value;
      } else if (['brandName', 'tagline', 'brandDescription', 'industryCategory', 'targetAudience'].includes(key)) {
        formDataSummary.brandIdentity[key] = value;
      } else if (['primaryColor', 'secondaryColor', 'accentColor', 'colorPalette'].includes(key)) {
        formDataSummary.visualIdentity[key] = value;
      } else if (['toneOfVoice', 'customTone', 'communicationStyle', 'brandVoice', 'keyMessages'].includes(key)) {
        formDataSummary.brandVoice[key] = value;
      } else {
        formDataSummary.metadata[key] = value;
      }
    }
  }
  
  console.log('📋 Form Data Summary:');
  console.log('-'.repeat(40));
  console.log('👤 Basic Info:', formDataSummary.basicInfo);
  console.log('🏢 Brand Identity:', formDataSummary.brandIdentity);
  console.log('🎨 Visual Identity:', formDataSummary.visualIdentity);
  console.log('🗣️ Brand Voice:', formDataSummary.brandVoice);
  console.log('📁 Files:', formDataSummary.files);
  console.log('ℹ️ Metadata:', formDataSummary.metadata);
  console.log('-'.repeat(40));
  console.log('⏰ Submission Time:', new Date().toISOString());
  console.log('='.repeat(80));

  try {
    const response = await fetch(`${USER_PROFILE_API_BASE_URL}/branddata-form`, {
      method: 'POST',
      body: formData, // Don't set Content-Type header - let browser set it with boundary
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.log('='.repeat(80));
      console.log('❌ BRAND SETUP API ERROR');
      console.log('='.repeat(80));
      console.log('🚫 Status:', response.status);
      console.log('❗ Error:', errorText);
      console.log('⏱️ Time:', new Date().toISOString());
      console.log('='.repeat(80));
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('='.repeat(80));
    console.log('✅ BRAND SETUP API RESPONSE');
    console.log('='.repeat(80));
    console.log('📊 Response Data:', data);
    console.log('🆔 Brand ID:', data.brand_id);
    console.log('📝 Message:', data.message);
    console.log('⏱️ Response Time:', new Date().toISOString());
    console.log('='.repeat(80));
    
    return { success: true, data };
  } catch (error) {
    console.log('='.repeat(80));
    console.log('❌ BRAND SETUP API ERROR');
    console.log('='.repeat(80));
    console.log('❗ Error:', error.message);
    console.log('⏱️ Time:', new Date().toISOString());
    console.log('='.repeat(80));
    throw error;
  }
};

// Create FormData from analysis data
export const createAnalysisFormData = (analysisData, userId, uploadedFile, additionalInfo = {}) => {
  const formData = new FormData();
  
  // Add basic text fields
  formData.append('userId', userId);
  formData.append('timestamp', new Date().toISOString());
  
  // Analysis configuration
  formData.append('messageIntent', analysisData.messageIntent || '');
  formData.append('funnelStage', analysisData.funnelStage || '');
  formData.append('channels', JSON.stringify(analysisData.channels || []));
  formData.append('targetAudience', analysisData.targetAudience || '');
  formData.append('campaignGoals', JSON.stringify(analysisData.campaignGoals || []));
  
  // Analysis results (if available)
  if (analysisData.results) {
    formData.append('analysisResults', JSON.stringify(analysisData.results));
    formData.append('performanceScore', analysisData.results.performanceScore?.toString() || '0');
    formData.append('recommendations', JSON.stringify(analysisData.results.recommendations || []));
    formData.append('insights', JSON.stringify(analysisData.results.insights || []));
  }
  
  // Uploaded ad file (image or video)
  if (uploadedFile instanceof File) {
    formData.append('adFile', uploadedFile, uploadedFile.name);
    formData.append('adFileMetadata', JSON.stringify({
      name: uploadedFile.name,
      size: uploadedFile.size,
      type: uploadedFile.type,
      lastModified: uploadedFile.lastModified
    }));
  }
  
  // Analysis status
  formData.append('analysisCompleted', analysisData.completed ? 'true' : 'false');
  formData.append('analysisDate', new Date().toISOString());
  
  // System metadata
  formData.append('dataVersion', '1.0');
  formData.append('source', 'analysis-form');
  formData.append('apiEndpoint', 'postAnalysisDetailsFormData');
  formData.append('submissionSource', 'analysis-page');
  formData.append('systemMetadata', JSON.stringify({
    submissionTime: new Date().toISOString(),
    hasUploadedFile: !!uploadedFile,
    fileType: uploadedFile?.type || 'unknown',
    ...additionalInfo
  }));
  
  return formData;
};

// Send Analysis FormData to API
export const sendAnalysisFormData = async (formData) => {
  console.log('📤 Sending analysis FormData to:', `${USER_PROFILE_API_BASE_URL}/postAnalysisDetailsFormData`);
  console.log('📦 FormData contents:');
  
  // Log FormData contents for debugging
  for (let [key, value] of formData.entries()) {
    if (value instanceof File) {
      console.log(`  ${key}: File(${value.name}, ${value.size} bytes, ${value.type})`);
    } else {
      console.log(`  ${key}: ${value}`);
    }
  }

  const response = await fetch(`${USER_PROFILE_API_BASE_URL}/postAnalysisDetailsFormData`, {
    method: 'POST',
    body: formData, // Don't set Content-Type header - let browser set it with boundary
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return { success: true, data };
};

// Save a compact analysis JSON record (no file upload) - ENHANCED to support all parameters
export const saveAnalysisRecord = async ({ 
  userId, 
  fileName, 
  analysisInputs, 
  analysisResults, 
  analysisId, 
  fileType = 'application/pdf',
  fileCategory = 'analysis-report',
  mediaUrl = null,
  mediaType = null,
  mediaCategory = null,
  pdfUrl = null,
  pdfStoragePath = null,
  url = null,
  recordId = null,
  tempRecordForPDFUpdate = false
}) => {
  console.log('📤 saveAnalysisRecord called with:', { 
    userId, 
    fileName, 
    analysisId, 
    fileType, 
    hasMediaUrl: !!mediaUrl, 
    hasPdfUrl: !!pdfUrl,
    recordId 
  });
  
  const payload = { 
    userId, 
    fileName, 
    analysisInputs, 
    analysisResults, 
    analysisId,
    fileType,
    fileCategory,
    mediaUrl,
    mediaType,
    mediaCategory,
    pdfUrl,
    pdfStoragePath,
    url,
    recordId,
    tempRecordForPDFUpdate
  };
  
  const res = await fetch(`${USER_PROFILE_API_BASE_URL}/save-analysis-record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j?.detail) msg += `: ${j.detail}`; } catch {}
    throw new Error(msg);
  }
  return await res.json();
};

// Upload generated PDF to backend storage and create a userFiles entry
// **DEPRECATED**: Use uploadAnalysisPdf from backendApiHelpers.js instead for proper header handling
export const uploadAnalysisPDF = async ({ userId, blob, fileName, analysisId }) => {
  console.warn('⚠️ DEPRECATED: uploadAnalysisPDF from jsonApiHelpers is deprecated. Use uploadAnalysisPdf from backendApiHelpers instead.');
  
  const form = new FormData();
  form.append('userId', userId);
  form.append('fileName', fileName || 'analysis.pdf');
  form.append('analysisId', analysisId || '');
  form.append('file', new File([blob], fileName || 'analysis.pdf', { type: 'application/pdf' }));
  
  // **FIX**: Use proper headers for FormData (don't set Content-Type manually)
  const res = await fetch(`${USER_PROFILE_API_BASE_URL}/upload-analysis-pdf`, { 
    method: 'POST', 
    body: form 
    // **CRITICAL**: Don't set Content-Type header - let browser handle FormData boundary
  });
  
  if (!res.ok) {
    if (res.status === 422) {
      try {
        const errorData = await res.json();
        const details = errorData.detail || [];
        const missingFields = details.filter(d => d.type === 'missing').map(d => d.loc.join('.'));
        if (missingFields.length > 0) {
          throw new Error(`HTTP ${res.status}: Missing required fields: ${missingFields.join(', ')}. Check FormData format.`);
        }
      } catch (parseError) {
        // If we can't parse the error, fall back to generic message
      }
      throw new Error(`HTTP ${res.status}: Unprocessable Entity. Check request format and required fields.`);
    }
    const t = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${t}`);
  }
  return await res.json();
};

// Create FormData from signup data
export const createSignupFormData = (formData, userId, additionalInfo = {}) => {
  const formDataObj = new FormData();
  
  // Add basic user fields
  formDataObj.append('userId', userId);
  formDataObj.append('timestamp', new Date().toISOString());
  
  // User profile data
  formDataObj.append('fullName', formData.fullName || '');
  formDataObj.append('email', formData.email || '');
  formDataObj.append('username', formData.username || '');
  formDataObj.append('password', formData.password || ''); // Be careful with passwords in production
  
  // Company information
  formDataObj.append('companyName', formData.companyName || '');
  formDataObj.append('companySize', formData.companySize || '');
  formDataObj.append('designation', formData.designation || '');
  formDataObj.append('sector', formData.sector || '');
  formDataObj.append('customDesignation', formData.customDesignation || '');
  formDataObj.append('customSector', formData.customSector || '');
  
  // Authentication info
  formDataObj.append('authProvider', additionalInfo.authProvider || 'email');
  formDataObj.append('isGoogleUser', additionalInfo.isGoogleUser ? 'true' : 'false');
  formDataObj.append('photoURL', additionalInfo.photoURL || '');
  formDataObj.append('phoneNumber', additionalInfo.phoneNumber || '');
  formDataObj.append('isEmailVerified', additionalInfo.isEmailVerified ? 'true' : 'false');
  
  // Completion status
  formDataObj.append('isComplete', 'true');
  formDataObj.append('registrationDate', new Date().toISOString());
  
  // System metadata
  formDataObj.append('dataVersion', '1.0');
  formDataObj.append('source', 'signup-form');
  formDataObj.append('apiEndpoint', 'postUserProfileDetails');
  formDataObj.append('submissionSource', 'signup-page');
  formDataObj.append('systemMetadata', JSON.stringify({
    submissionTime: new Date().toISOString(),
    formVersion: additionalInfo.metadata?.formVersion || '2.0',
    browserInfo: additionalInfo.metadata?.browserInfo || {},
    ...additionalInfo
  }));
  
  return formDataObj;
};

// Send Signup FormData to API
export const sendSignupFormData = async (formData) => {
              console.log('📤 Sending signup FormData to:', `${USER_PROFILE_API_BASE_URL}/postUserProfileDetailsFormData`);
  console.log('📦 FormData contents:');
  
  // Log FormData contents for debugging
  for (let [key, value] of formData.entries()) {
    if (value instanceof File) {
      console.log(`  ${key}: File(${value.name}, ${value.size} bytes, ${value.type})`);
    } else {
      console.log(`  ${key}: ${value}`);
    }
  }

  const response = await fetch(`${API_BASE_URL}/postUserProfileDetailsFormData`, {
    method: 'POST',
    body: formData, // Don't set Content-Type header - let browser set it with boundary
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return { success: true, data };
};

// Make functions available globally for testing
if (typeof window !== 'undefined') {
  window.signupAPI = {
    createJSON: createSignupJSON,
    sendData: sendSignupData,
    fetchData: fetchUserData,
    updateData: updateUserData,
    saveLocal: saveSignupStateLocal,
    fetchLocal: fetchSignupStateLocal,
    export: exportSignupJSON,
    import: importSignupJSON
  };

  window.brandSetupAPI = {
    createJSON: createBrandSetupJSON,
    sendData: sendBrandSetupData,
    saveLocal: saveBrandSetupStateLocal,
    sendToFirebase: sendBrandSetupToFirebaseViaJSON,
    validate: validateBrandSetupJSON
  };
}

// ===============================
// GEMINI API HELPERS (for consolidated app.py on port 8000)
// ===============================

/**
 * ⚠️ DEPRECATED: This function has been removed.
 * 
 * This function bypassed the middleware layer and called the backend directly.
 * 
 * **REPLACEMENT**: Use `submitAnalysisRequest()` from `backendApiHelpers.js` instead.
 * 
 * The new function ensures:
 * - Plan validation and quota checking
 * - Database storage of results
 * - Proper ad count tracking
 * - PDF generation
 * - Brand data validation
 * 
 * Migration example:
 * ```javascript
 * // OLD (deprecated):
 * import { sendAdToGeminiAPI } from '../utils/jsonApiHelpers';
 * const result = await sendAdToGeminiAPI(file, messageIntent, funnelStage, platforms, adTitle);
 * 
 * // NEW (correct):
 * import { submitAnalysisRequest } from '../utils/backendApiHelpers';
 * import { getUserBrandData } from '../utils/brandDataHelpers';
 * 
 * const brandData = await getUserBrandData(userId);
 * const result = await submitAnalysisRequest({
 *   userId: userId,
 *   brandId: brandData.brandId,
 *   messageIntent: messageIntent,
 *   funnelStage: funnelStage,
 *   channels: platforms,
 *   adTitle: adTitle
 * }, file);
 * ```
 * 
 * This function was removed on: 2024-01-XX
 * All components have been updated to use submitAnalysisRequest() instead.
 */
export const sendAdToGeminiAPI = async (...args) => {
  console.error('❌ ERROR: sendAdToGeminiAPI() has been removed.');
  console.error('📚 Please use submitAnalysisRequest() from backendApiHelpers.js instead.');
  console.error('📖 See function documentation above for migration guide.');
  throw new Error(
    'sendAdToGeminiAPI() has been deprecated and removed. ' +
    'Please use submitAnalysisRequest() from backendApiHelpers.js instead. ' +
    'This ensures proper plan validation, quota checking, and database storage.'
  );
};