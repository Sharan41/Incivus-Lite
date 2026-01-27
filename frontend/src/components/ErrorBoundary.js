// Error Boundary Component with Conditional Sentry Integration
import React from 'react';

// Conditionally import Sentry only in production
let Sentry = null;
if (process.env.NODE_ENV === 'production') {
  try {
    Sentry = require('@sentry/react');
  } catch (e) {
    console.warn('Sentry not available in production');
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to Sentry with context (only in production)
    if (Sentry) {
      Sentry.captureException(error, {
        extra: errorInfo,
        tags: {
          component: 'ErrorBoundary',
          location: window.location.pathname
        }
      });
    } else {
      // Development fallback
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          margin: '1rem'
        }}>
          <h2 style={{ color: '#dc3545', marginBottom: '1rem' }}>
            Oops! Something went wrong
          </h2>
          <p style={{ color: '#6c757d', marginBottom: '1.5rem' }}>
            We've been notified of this error and will fix it soon.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Simple export without Sentry wrapper to avoid development issues
export default ErrorBoundary;
