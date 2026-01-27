/**
 * Storage Helper Utilities
 * Provides safe localStorage operations with quota management and cleanup
 */

// Storage size limits (in bytes)
const STORAGE_LIMITS = {
  MAX_TOTAL_SIZE: 4 * 1024 * 1024, // 4MB (conservative limit)
  MAX_ITEM_SIZE: 1 * 1024 * 1024,  // 1MB per item
  CLEANUP_THRESHOLD: 0.8            // Clean up when 80% full
};

// Storage keys that can be cleaned up automatically
const CLEANABLE_KEYS = [
  'incivus_analysis_state',
  'incivus_temp_data',
  'incivus_cache_',
  'incivus_old_'
];

// Essential keys that should never be cleaned up
const ESSENTIAL_KEYS = [
  'incivus_user_profile',
  'incivus_user_profile_details', 
  'incivus_subscription',
  'incivus_ads_used',
  'incivus_auth_token'
];

/**
 * Get the approximate size of localStorage in bytes
 */
export const getStorageSize = () => {
  let total = 0;
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      total += localStorage[key].length + key.length;
    }
  }
  return total;
};

/**
 * Get the size of a specific localStorage item
 */
export const getItemSize = (key) => {
  const item = localStorage.getItem(key);
  return item ? item.length + key.length : 0;
};

/**
 * Check if storage is approaching quota limits
 */
export const isStorageNearLimit = () => {
  const currentSize = getStorageSize();
  return currentSize > (STORAGE_LIMITS.MAX_TOTAL_SIZE * STORAGE_LIMITS.CLEANUP_THRESHOLD);
};

/**
 * Clean up old and large localStorage items
 */
export const cleanupStorage = () => {
  console.log('🧹 Starting localStorage cleanup...');
  
  const initialSize = getStorageSize();
  let cleanedItems = 0;
  let freedSpace = 0;

  // Get all localStorage keys
  const allKeys = Object.keys(localStorage);
  
  // Sort keys by priority (cleanable items first)
  const cleanableItems = [];
  const essentialItems = [];
  
  allKeys.forEach(key => {
    const isEssential = ESSENTIAL_KEYS.some(essential => key.includes(essential));
    const isCleanable = CLEANABLE_KEYS.some(cleanable => key.includes(cleanable));
    
    if (isEssential) {
      essentialItems.push(key);
    } else if (isCleanable) {
      const size = getItemSize(key);
      const item = localStorage.getItem(key);
      let timestamp = Date.now();
      
      // Try to extract timestamp from stored data
      try {
        const parsed = JSON.parse(item);
        if (parsed.timestamp) {
          timestamp = parsed.timestamp;
        } else if (parsed.createdAt) {
          timestamp = new Date(parsed.createdAt).getTime();
        }
      } catch (e) {
        // Use current time if parsing fails
      }
      
      cleanableItems.push({
        key,
        size,
        timestamp,
        age: Date.now() - timestamp
      });
    }
  });

  // Sort cleanable items by age (oldest first) and size (largest first)
  cleanableItems.sort((a, b) => {
    // First priority: age (older items first)
    if (Math.abs(a.age - b.age) > 24 * 60 * 60 * 1000) { // More than 1 day difference
      return b.age - a.age;
    }
    // Second priority: size (larger items first)
    return b.size - a.size;
  });

  // Clean up items until we're under the threshold
  for (const item of cleanableItems) {
    if (!isStorageNearLimit()) {
      break;
    }
    
    try {
      localStorage.removeItem(item.key);
      cleanedItems++;
      freedSpace += item.size;
      console.log(`🗑️ Removed ${item.key} (${(item.size / 1024).toFixed(1)}KB, ${Math.round(item.age / (60 * 60 * 1000))}h old)`);
  } catch (error) {
      console.error(`❌ Error removing ${item.key}:`, error);
    }
  }

  const finalSize = getStorageSize();
  console.log(`✅ Cleanup complete: ${cleanedItems} items removed, ${(freedSpace / 1024).toFixed(1)}KB freed`);
  console.log(`📊 Storage: ${(initialSize / 1024).toFixed(1)}KB → ${(finalSize / 1024).toFixed(1)}KB`);
  
  return {
    itemsRemoved: cleanedItems,
    spaceFreed: freedSpace,
    sizeBefore: initialSize,
    sizeAfter: finalSize
  };
};

/**
 * Safely set an item in localStorage with size checking and cleanup
 */
export const safeSetItem = (key, value, options = {}) => {
  const {
    compress = true,
    maxRetries = 2,
    essential = false
  } = options;

  let stringValue = typeof value === 'string' ? value : JSON.stringify(value);
  const itemSize = stringValue.length + key.length;

  // Check if item is too large
  if (itemSize > STORAGE_LIMITS.MAX_ITEM_SIZE) {
    console.warn(`⚠️ Item ${key} is too large (${(itemSize / 1024).toFixed(1)}KB), attempting compression...`);
    
    if (compress && typeof value === 'object') {
      // Try to compress the data by removing large fields
      const compressedValue = compressAnalysisData(value);
      stringValue = JSON.stringify(compressedValue);
      console.log(`🗜️ Compressed ${key}: ${(itemSize / 1024).toFixed(1)}KB → ${(stringValue.length / 1024).toFixed(1)}KB`);
    }
    
    // If still too large, reject
    if (stringValue.length + key.length > STORAGE_LIMITS.MAX_ITEM_SIZE) {
      throw new Error(`Item ${key} is too large even after compression (${((stringValue.length + key.length) / 1024).toFixed(1)}KB)`);
    }
  }

  let retries = 0;
  while (retries <= maxRetries) {
    try {
      localStorage.setItem(key, stringValue);
      console.log(`💾 Saved ${key} (${(stringValue.length / 1024).toFixed(1)}KB)`);
    return true;
  } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.warn(`⚠️ Storage quota exceeded for ${key}, attempt ${retries + 1}/${maxRetries + 1}`);
        
        if (retries < maxRetries) {
          // Try cleanup and retry
          const cleanupResult = cleanupStorage();
          if (cleanupResult.spaceFreed === 0) {
            // No space was freed, no point in retrying
            break;
          }
          retries++;
        } else {
          // Last resort: remove the largest non-essential item
          if (!essential) {
            const largestItem = findLargestNonEssentialItem();
            if (largestItem) {
              localStorage.removeItem(largestItem.key);
              console.log(`🚨 Emergency cleanup: removed ${largestItem.key} (${(largestItem.size / 1024).toFixed(1)}KB)`);
              retries++;
            } else {
              throw new Error(`Cannot save ${key}: Storage quota exceeded and no items can be cleaned up`);
            }
          } else {
    throw error;
  }
        }
      } else {
    throw error;
      }
    }
  }
  
  return false;
};

/**
 * Compress analysis data by removing or reducing large fields
 */
const compressAnalysisData = (data) => {
  if (!data || typeof data !== 'object') return data;
  
  const compressed = { ...data };
  
  // Remove or compress large fields
  if (compressed.filePreview && compressed.filePreview.length > 100000) {
    // Keep only a small preview for very large images
    compressed.filePreview = compressed.filePreview.substring(0, 50000) + '...';
    compressed._compressed = true;
  }
  
  // Compress analysis results by removing verbose fields
  if (compressed.analysisResults) {
    compressed.analysisResults = compressAnalysisResults(compressed.analysisResults);
  }
  
  if (compressed.geminiResults) {
    compressed.geminiResults = compressAnalysisResults(compressed.geminiResults);
  }
  
  return compressed;
};

/**
 * Compress analysis results by keeping only essential data
 */
const compressAnalysisResults = (results) => {
  if (!results || typeof results !== 'object') return results;
  
  const compressed = { ...results };
  
  // Keep only essential fields, remove verbose explanations
  const essentialFields = [
    'brand_compliance_score',
    'messaging_intent_score', 
    'funnel_compatibility_score',
    'channel_compliance_score',
    'purchase_intent_score',
    'overall_score',
    'summary'
  ];
  
  // If results are too verbose, keep only scores
  const resultString = JSON.stringify(results);
  if (resultString.length > 50000) {
    const compressedResults = {};
    essentialFields.forEach(field => {
      if (results[field] !== undefined) {
        compressedResults[field] = results[field];
      }
    });
    compressedResults._compressed = true;
    return compressedResults;
  }
  
  return compressed;
};

/**
 * Find the largest non-essential localStorage item
 */
const findLargestNonEssentialItem = () => {
  let largest = null;
  let largestSize = 0;
  
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      const isEssential = ESSENTIAL_KEYS.some(essential => key.includes(essential));
      if (!isEssential) {
        const size = getItemSize(key);
        if (size > largestSize) {
          largest = { key, size };
          largestSize = size;
        }
      }
    }
  }
  
  return largest;
};

/**
 * Get storage usage statistics
 */
export const getStorageStats = () => {
  const totalSize = getStorageSize();
  const items = [];
  
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      const size = getItemSize(key);
      const isEssential = ESSENTIAL_KEYS.some(essential => key.includes(essential));
      items.push({ key, size, essential: isEssential });
    }
  }
  
  items.sort((a, b) => b.size - a.size);
  
  return {
    totalSize,
    totalItems: items.length,
    utilizationPercent: (totalSize / STORAGE_LIMITS.MAX_TOTAL_SIZE) * 100,
    nearLimit: isStorageNearLimit(),
    items: items.slice(0, 10) // Top 10 largest items
  };
};

/**
 * Initialize storage management (call this on app startup)
 */
export const initializeStorageManagement = () => {
  console.log('🔧 Initializing storage management...');
  
  const stats = getStorageStats();
  console.log(`📊 Storage usage: ${(stats.totalSize / 1024).toFixed(1)}KB (${stats.utilizationPercent.toFixed(1)}%)`);
  
  if (stats.nearLimit) {
    console.log('⚠️ Storage near limit, performing cleanup...');
    cleanupStorage();
  }
  
  // Set up periodic cleanup (every 30 minutes)
  setInterval(() => {
    if (isStorageNearLimit()) {
      console.log('🔄 Periodic storage cleanup triggered');
      cleanupStorage();
    }
  }, 30 * 60 * 1000);
};

// ===============================
// FILE VALIDATION HELPERS
// ===============================

/**
 * Validate image file
 */
export const validateImageFile = (file) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'];
  const maxSize = 5 * 1024 * 1024; // 5MB
  
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file type. Please upload JPG, PNG, WebP, or SVG images.');
  }
  
  if (file.size > maxSize) {
    throw new Error('File size too large. Please upload images smaller than 5MB.');
  }
  
  return true;
};

/**
 * Generate file preview (optimized)
 */
export const generateFilePreview = (file) => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      // For non-images, return file info
      resolve({
        type: 'file',
        name: file.name,
        size: file.size,
        fileType: file.type
      });
      return;
    }
    
    // For large images, create a smaller preview to speed up the process
    if (file.size > 2 * 1024 * 1024) { // If larger than 2MB, create thumbnail
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Create thumbnail (max 300px width)
        const maxWidth = 300;
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        resolve({
          type: 'image',
          name: file.name,
          size: file.size,
          fileType: file.type,
          preview: canvas.toDataURL(file.type, 0.7) // Lower quality for preview
        });
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    } else {
      // For smaller images, use FileReader as before
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          type: 'image',
          name: file.name,
          size: file.size,
          fileType: file.type,
          preview: e.target.result
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }
  });
};

/**
 * Delete file (placeholder - for compatibility)
 */
export const deleteFile = async (filePath) => {
  console.log('🗑️ Delete file called for:', filePath);
  // This is a placeholder since we're not using Firebase storage in this context
  // The actual deletion would happen on the backend
  return true;
};

/**
 * Upload brand logos (placeholder - for compatibility)
 */
export const uploadBrandLogos = async (logoFiles, userId, onProgress = null) => {
  console.log('🎨 Upload brand logos called for:', logoFiles.length, 'files');
  // This is a placeholder since we're not using Firebase storage in this context
  // The actual upload would happen via the backend API
  
  // Simulate progress for UI feedback
  if (onProgress) {
    for (let i = 0; i < logoFiles.length; i++) {
      onProgress((i + 1) / logoFiles.length * 100);
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
    }
  }
  
  // Return mock results
  return logoFiles.map((file, index) => ({
    success: true,
    file: file,
    url: `mock://logo-${index}-${file.name}`,
    path: `users/${userId}/logos/${file.name}`
  }));
};

// All functions are already exported individually above