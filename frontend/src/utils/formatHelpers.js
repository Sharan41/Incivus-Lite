/**
 * Formatting Utility Functions
 * Non-API helper functions for formatting and calculating data
 * 
 * These are pure utility functions with no API calls or side effects
 */

/**
 * Format a number as currency with proper decimal places
 * @param {number} amount - The amount to format
 * @param {string} currency - Currency symbol (default: '$')
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted currency string
 * 
 * @example
 * formatCurrency(1234.56) // "$1,234.56"
 * formatCurrency(1234.56, '€') // "€1,234.56"
 * formatCurrency(1234.567, '$', 3) // "$1,234.567"
 */
export const formatCurrency = (amount, currency = '$', decimals = 2) => {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return `${currency}0.${'0'.repeat(decimals)}`;
  }
  
  // Fix floating point precision issues and format to specified decimal places
  const fixedAmount = parseFloat(amount.toFixed(decimals));
  
  // Use toLocaleString for proper number formatting with commas
  return `${currency}${fixedAmount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;
};

/**
 * Calculate price with proper decimal precision
 * Handles floating point arithmetic correctly
 * 
 * @param {number} quantity - Number of items
 * @param {number} pricePerItem - Price per item
 * @returns {number} Total price with proper decimal precision
 * 
 * @example
 * calculatePrice(3, 10.50) // 31.50
 * calculatePrice(2, 19.99) // 39.98
 */
export const calculatePrice = (quantity, pricePerItem) => {
  if (typeof quantity !== 'number' || typeof pricePerItem !== 'number') {
    return 0;
  }
  
  if (isNaN(quantity) || isNaN(pricePerItem)) {
    return 0;
  }
  
  const total = quantity * pricePerItem;
  return parseFloat(total.toFixed(2));
};

/**
 * Format file size to human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size (e.g., "1.5 MB")
 * 
 * @example
 * formatFileSize(1024) // "1.00 KB"
 * formatFileSize(1536000) // "1.46 MB"
 */
export const formatFileSize = (bytes) => {
  if (typeof bytes !== 'number' || bytes < 0) {
    return '0 B';
  }
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

/**
 * Format date to readable string
 * @param {Date|string|number} date - Date to format
 * @param {string} format - Format type: 'short', 'long', 'relative'
 * @returns {string} Formatted date string
 * 
 * @example
 * formatDate(new Date(), 'short') // "11/11/2025"
 * formatDate(new Date(), 'long') // "November 11, 2025"
 * formatDate(new Date(), 'relative') // "just now"
 */
export const formatDate = (date, format = 'short') => {
  const dateObj = date instanceof Date ? date : new Date(date);
  
  if (isNaN(dateObj.getTime())) {
    return 'Invalid date';
  }
  
  switch (format) {
    case 'short':
      return dateObj.toLocaleDateString('en-US');
    
    case 'long':
      return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    
    case 'relative': {
      const now = new Date();
      const diffMs = now - dateObj;
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffSecs < 60) return 'just now';
      if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
      return dateObj.toLocaleDateString('en-US');
    }
    
    default:
      return dateObj.toLocaleDateString('en-US');
  }
};

/**
 * Format percentage with proper precision
 * @param {number} value - Value to format as percentage (0-1 or 0-100)
 * @param {number} decimals - Number of decimal places (default: 1)
 * @param {boolean} isDecimal - Whether input is decimal (0-1) or percentage (0-100)
 * @returns {string} Formatted percentage string
 * 
 * @example
 * formatPercentage(0.755, 1, true) // "75.5%"
 * formatPercentage(75.5, 1, false) // "75.5%"
 */
export const formatPercentage = (value, decimals = 1, isDecimal = true) => {
  if (typeof value !== 'number' || isNaN(value)) {
    return '0%';
  }
  
  const percentage = isDecimal ? value * 100 : value;
  return `${percentage.toFixed(decimals)}%`;
};

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} Truncated text with ellipsis if needed
 * 
 * @example
 * truncateText("This is a long text", 10) // "This is a..."
 */
export const truncateText = (text, maxLength = 50) => {
  if (typeof text !== 'string') {
    return '';
  }
  
  if (text.length <= maxLength) {
    return text;
  }
  
  return `${text.substring(0, maxLength)}...`;
};

// Export all functions as default export for convenience
export default {
  formatCurrency,
  calculatePrice,
  formatFileSize,
  formatDate,
  formatPercentage,
  truncateText
};


