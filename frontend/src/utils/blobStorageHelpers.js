// Blob Storage Helper Functions for Signed URL Management
import ENV_CONFIG from './environmentConfig';

/**
 * Get a signed URL for a specific file path
 * @param {string} filePath - The storage path of the file
 * @param {string} userId - The user ID for security validation
 * @returns {Promise<Object>} - Object containing the signed URL and metadata
 */
export const getSignedFileUrl = async (filePath, userId) => {
  try {
    const response = await fetch(
      `${ENV_CONFIG.PYTHON_API_URL}/get-file-url/${encodeURIComponent(filePath)}?userId=${userId}`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('🔗 Generated signed URL for:', filePath);
    return data;
  } catch (error) {
    console.error('❌ Error getting signed file URL:', error);
    throw error;
  }
};

/**
 * Get all files for a user with fresh signed URLs
 * @param {string} userId - The user ID
 * @param {string} fileCategory - Optional file category filter (e.g., 'analysis-report', 'brand-media')
 * @param {string} analysisId - Optional analysis ID filter
 * @returns {Promise<Object>} - Object containing user files with signed URLs
 */
export const getUserFiles = async (userId, fileCategory = null, analysisId = null) => {
  try {
    let url = `${ENV_CONFIG.PYTHON_API_URL}/get-user-files/${userId}`;
    const params = new URLSearchParams();
    
    if (fileCategory) {
      params.append('fileCategory', fileCategory);
    }
    
    if (analysisId) {
      params.append('analysisId', analysisId);
    }
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`🗂️ Retrieved ${data.count} files for user:`, userId);
    return data;
  } catch (error) {
    console.error('❌ Error getting user files:', error);
    throw error;
  }
};

/**
 * Get analysis PDFs for a specific user
 * @param {string} userId - The user ID
 * @param {string} analysisId - Optional specific analysis ID
 * @returns {Promise<Array>} - Array of analysis PDF files with signed URLs
 */
export const getAnalysisPDFs = async (userId, analysisId = null) => {
  try {
    const data = await getUserFiles(userId, 'analysis-report', analysisId);
    return data.files || [];
  } catch (error) {
    console.error('❌ Error getting analysis PDFs:', error);
    throw error;
  }
};

/**
 * Get brand media files (logos, images, videos) for a user from brand collection
 * @param {string} userId - The user ID
 * @param {string} brandId - Optional specific brand ID
 * @param {string} mediaType - Optional media type filter (logo, image, video)
 * @returns {Promise<Array>} - Array of brand media files with signed URLs
 */
export const getBrandMediaFiles = async (userId, brandId = null, mediaType = null) => {
  try {
    let url = `${ENV_CONFIG.PYTHON_API_URL}/get-brand-media/${userId}`;
    const params = new URLSearchParams();
    
    if (brandId) {
      params.append('brandId', brandId);
    }
    
    if (mediaType) {
      params.append('mediaType', mediaType);
    }
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`🖼️ Retrieved ${data.count} brand media files for user:`, userId);
    return data.mediaFiles || [];
  } catch (error) {
    console.error('❌ Error getting brand media files:', error);
    throw error;
  }
};

/**
 * Get brand logos specifically with signed URLs
 * @param {string} userId - The user ID
 * @param {string} brandId - Optional specific brand ID
 * @returns {Promise<Array>} - Array of brand logo files with signed URLs
 */
export const getBrandLogos = async (userId, brandId = null) => {
  try {
    return await getBrandMediaFiles(userId, brandId, 'logo');
  } catch (error) {
    console.error('❌ Error getting brand logos:', error);
    throw error;
  }
};

/**
 * Get uploaded ad files with signed URLs
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} - Array of uploaded ad files with signed URLs
 */
export const getUploadedAds = async (userId) => {
  // Return empty array to prevent separate uploaded ad cards
  // The uploaded image preview is handled via analysis record mediaUrl
  console.log('🚫 getUploadedAds disabled - using analysis mediaUrl for previews');
  return [];
};

/**
 * Check if a signed URL is expired or near expiration (within 1 day)
 * @param {string} url - The signed URL to check
 * @returns {boolean} - True if the URL is expired or near expiration
 */
export const isUrlExpired = (url) => {
  try {
    const urlObj = new URL(url);
    const expiresParam = urlObj.searchParams.get('Expires');
    
    if (!expiresParam) {
      return true; // Assume expired if no expiration found
    }
    
    const expirationTime = parseInt(expiresParam) * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    const oneDayInMs = 24 * 60 * 60 * 1000;
    
    // Consider expired if expiring within 1 day
    return (expirationTime - currentTime) < oneDayInMs;
  } catch (error) {
    console.error('❌ Error checking URL expiration:', error);
    return true; // Assume expired on error
  }
};

/**
 * Refresh signed URL if it's expired or near expiration
 * @param {Object} fileData - File object containing storagePath and other metadata
 * @param {string} userId - The user ID
 * @returns {Promise<string>} - Fresh signed URL
 */
export const refreshSignedUrl = async (fileData, userId) => {
  try {
    if (!fileData.storagePath) {
      throw new Error('No storage path available for file');
    }
    
    const urlData = await getSignedFileUrl(fileData.storagePath, userId);
    return urlData.url;
  } catch (error) {
    console.error('❌ Error refreshing signed URL:', error);
    throw error;
  }
};

/**
 * Get a fresh signed URL for display, checking expiration first
 * @param {Object} fileData - File object containing url, storagePath, etc.
 * @param {string} userId - The user ID
 * @returns {Promise<string>} - Valid signed URL for display
 */
export const getDisplayUrl = async (fileData, userId) => {
  try {
    // If no URL exists or it's expired, get a fresh one
    if (!fileData.url || isUrlExpired(fileData.url)) {
      console.log('🔄 Refreshing expired URL for:', fileData.fileName || fileData.storagePath);
      return await refreshSignedUrl(fileData, userId);
    }
    
    return fileData.url;
  } catch (error) {
    console.error('❌ Error getting display URL:', error);
    // Return the original URL as fallback
    return fileData.url || '';
  }
};

export default {
  getSignedFileUrl,
  getUserFiles,
  getAnalysisPDFs,
  getBrandMediaFiles,
  getBrandLogos,
  getUploadedAds,
  isUrlExpired,
  refreshSignedUrl,
  getDisplayUrl
};
