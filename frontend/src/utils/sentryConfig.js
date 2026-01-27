// Sentry Configuration for Production Logging
let Sentry = null;

// Initialize Sentry when DSN is available (both development and production)
const SENTRY_DSN = process.env.REACT_APP_SENTRY_DSN || "https://e2cd46fc3b874c7e6a7cddf0ce5a4988@o4509798666993664.ingest.us.sentry.io/4509798676037632";

if (SENTRY_DSN) {
  try {
    Sentry = require('@sentry/react');
  } catch (e) {
    console.warn('Sentry package not found:', e.message);
    Sentry = null;
  }
}

if (Sentry) {
  Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Capture 10% of normal sessions in production, 100% in development
        sessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
        // Capture 100% of sessions with errors
        errorSampleRate: 1.0,
      }),
    ],
    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Environment
    environment: process.env.NODE_ENV,
    // Release tracking
    release: process.env.REACT_APP_VERSION || '1.0.0',
    // Include user IP and other PII for better debugging
    sendDefaultPii: true,
    
    // Filter out noisy errors
    beforeSend(event) {
      // Log to console for debugging
      console.log('🔍 Sentry capturing event:', event.level, event.message || event.exception);
      
      // Don't filter any events for now - we want to see everything
      return event;
    },
  });
  
  console.log('✅ Sentry initialized successfully!', {
    environment: process.env.NODE_ENV,
    dsn: SENTRY_DSN.substring(0, 50) + '...',
    sessionReplay: 'enabled',
    performanceMonitoring: 'enabled'
  });
}

// Custom logging utility
export const Logger = {
  // Info logs
  info: (message, extra = {}) => {
    console.log('📝 INFO:', message, extra);
    if (Sentry) {
      Sentry.captureMessage(message, 'info');
      Sentry.setContext('additional_info', extra);
    }
  },

  // Warning logs  
  warn: (message, extra = {}) => {
    console.warn('⚠️ WARN:', message, extra);
    if (Sentry) {
      Sentry.captureMessage(message, 'warning');
      Sentry.setContext('warning_context', extra);
    }
  },

  // Error logs
  error: (error, context = {}) => {
    console.error('❌ ERROR:', error, context);
    if (Sentry) {
      Sentry.captureException(error, {
        extra: context,
        tags: {
          component: context.component || 'unknown',
          action: context.action || 'unknown'
        }
      });
    }
  },

  // User action tracking
  trackUserAction: (action, details = {}) => {
    console.log(`👤 USER ACTION: ${action}`, details);
    if (Sentry) {
      Sentry.addBreadcrumb({
        category: 'user_action',
        message: action,
        level: 'info',
        data: details
      });
    }
  },

  // API call tracking
  trackApiCall: (endpoint, method, status, duration) => {
    const message = `API ${method} ${endpoint} - ${status} (${duration}ms)`;
    console.log(`🌐 API:`, message);
    
    if (Sentry) {
      Sentry.addBreadcrumb({
        category: 'api',
        message,
        level: status >= 400 ? 'error' : 'info',
        data: { endpoint, method, status, duration }
      });
    }
  },

  // Set user context
  setUser: (userInfo) => {
    console.log('👤 SET USER:', userInfo);
    if (Sentry) {
      Sentry.setUser({
        id: userInfo.id,
        email: userInfo.email,
        username: userInfo.username,
        // Don't log sensitive data
      });
    }
  },

  // Clear user context on logout
  clearUser: () => {
    console.log('👤 CLEAR USER');
    if (Sentry) {
      Sentry.setUser(null);
    }
  }
};

export default Sentry;
