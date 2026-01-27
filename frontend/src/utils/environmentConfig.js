// Environment Configuration for Python API Integration

// Create a .env.local file in your root directory with these variables:
/*
REACT_APP_URL=http://localhost:8002/
REACT_APP_API_URL=http://localhost:8000/
REACT_APP_USE_MOCK_API=false
REACT_APP_PYTHON_API_TIMEOUT=120000
*/

// **FIX**: Determine if we're in production or development
const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const currentOrigin = window.location.origin;

export const ENV_CONFIG = {
  // **FIXED**: Python API Configuration with proper production/development handling
  PYTHON_API_URL: (() => {
    if (process.env.REACT_APP_URL) {
      return process.env.REACT_APP_URL.replace(/\/$/, '');
    }
    // **FIX**: Use same origin for production, localhost for development
    return isProduction ? currentOrigin : 'http://localhost:8002';
  })(), // app.py for DB operations
  
  ANALYSIS_API_URL: (() => {
    if (process.env.REACT_APP_API_URL) {
      return process.env.REACT_APP_API_URL.replace(/\/$/, '');
    }
    // **FIX**: Use same origin for production, localhost for development  
    return isProduction ? currentOrigin : 'http://localhost:8000';
  })(), // main.py for model operations
  
  USE_MOCK_API: process.env.REACT_APP_USE_MOCK_API === 'true' || process.env.NODE_ENV === 'development',
  API_TIMEOUT: parseInt(process.env.REACT_APP_PYTHON_API_TIMEOUT) || 120000,
  
  // Database Collections
  COLLECTIONS: {
    USER_PROFILES: 'userProfiles',
    BRAND_DATA: 'brandData',
    AD_MEDIA: 'adMedia', 
    ANALYSIS_REQUESTS: 'analysisRequests',
    ANALYSIS_RESULTS: 'analysisResults'
  },
  
  // Feature mapping for UI display
  FEATURES: {
    brand_compliance: 'Brand Compliance',
    messaging_intent: 'Messaging Intent',
    funnel_compatibility: 'Funnel Compatibility',
    resonance_index: 'Purchase Intent',
    channel_compliance: 'Channel Compliance'
  }
};

// **DEBUG**: Log configuration on load
console.log('🔧 Environment Configuration:', {
  isProduction,
  currentOrigin,
  PYTHON_API_URL: ENV_CONFIG.PYTHON_API_URL,
  ANALYSIS_API_URL: ENV_CONFIG.ANALYSIS_API_URL,
  NODE_ENV: process.env.NODE_ENV,
  REACT_APP_URL: process.env.REACT_APP_URL,
  REACT_APP_API_URL: process.env.REACT_APP_API_URL
});

export default ENV_CONFIG;