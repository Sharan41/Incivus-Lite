import React, { useState, useEffect } from 'react';
import './App.css';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import PlanSelectionPage from './pages/PlanSelectionPage';
import Dashboard from './components/Dashboard';
import TermsAndConditions from './components/TermsAndConditions';
import ShopifyAuth from './components/ShopifyAuth';
import ShopifyPayment from './components/ShopifyPayment';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './contexts/AuthContext';
import { initializeStorageManagement } from './utils/storageHelpers';

// Initialize Sentry first (only in production)
if (process.env.NODE_ENV === 'production') {
  require('./utils/sentryConfig');
}

// Conditionally import Logger
let Logger;
if (process.env.NODE_ENV === 'production') {
  Logger = require('./utils/sentryConfig').Logger;
} else {
  // Development Logger that only logs to console
  Logger = {
    info: (message, extra = {}) => console.log(message, extra),
    warn: (message, extra = {}) => console.warn(message, extra),
    error: (error, context = {}) => console.error(error, context),
    trackUserAction: (action, details = {}) => console.log(`User Action: ${action}`, details),
    trackApiCall: (endpoint, method, status, duration) => console.log(`API ${method} ${endpoint} - ${status} (${duration}ms)`),
    setUser: (userInfo) => console.log('Set user:', userInfo),
    clearUser: () => console.log('Clear user')
  };
}

function App() {
  const [userFlow, setUserFlow] = useState(() => localStorage.getItem('incivus_last_flow') || 'login'); // login, terms, shopify-auth, plan-selection, payment, dashboard
  const [userData, setUserData] = useState(null);
  const [shopifyData, setShopifyData] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);

  useEffect(() => {
    // Check for reset parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const shouldReset = urlParams.get('reset') === 'true' || urlParams.get('fresh') === 'true';
    
    if (shouldReset) {
      console.log('🔄 Reset parameter detected - clearing all localStorage data');
      localStorage.clear();
      // Remove the reset parameter from URL without reloading
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
    
    // Initialize storage management
    try {
      initializeStorageManagement();
    } catch (error) {
      console.error('❌ Failed to initialize storage management:', error);
    }
    
    // Check user flow state
    const hasAcceptedTerms = localStorage.getItem('incivus_terms_accepted');
    const subscription = localStorage.getItem('incivus_subscription');
    const isLoggedIn = localStorage.getItem('incivus_user_logged_in');
    const isSignupComplete = localStorage.getItem('incivus_user_complete');
    
    // Debug: Log all localStorage values
    console.log('🔍 App.js useEffect - Checking localStorage:');
    console.log('  hasAcceptedTerms:', hasAcceptedTerms);
    console.log('  subscription:', subscription);
    console.log('  isLoggedIn:', isLoggedIn);
    console.log('  isSignupComplete:', isSignupComplete);
    console.log('💡 Flow Reset Options:');
    console.log('  🌐 URL: Add ?reset=true or ?fresh=true to the URL');
    console.log('  ⌨️  Keyboard: Press Ctrl+Shift+R (or Cmd+Shift+R on Mac)');
    console.log('  🔘 UI: Click profile icon → "EXIT" button');

    
    // NEW FLOW: Restore last flow when possible and keep user on dashboard after login
    const lastFlow = localStorage.getItem('incivus_last_flow');
    let targetFlow = 'dashboard';
    if (!isLoggedIn) {
      targetFlow = 'login';
      console.log('🔐 Setting flow to: login (not logged in)');
    } else if (!hasAcceptedTerms) {
      targetFlow = 'terms';
      console.log('📄 Setting flow to: terms (need terms)');
    } else if (lastFlow && lastFlow !== 'login' && lastFlow !== 'signup') {
      targetFlow = lastFlow;
      console.log(`📍 Restoring last flow: ${lastFlow}`);
    } else {
      targetFlow = 'dashboard';
      console.log('📊 Setting flow to: dashboard');
    }
    
    setUserFlow(targetFlow);
  }, []);

  // Persist current flow so refresh stays on the same page
  useEffect(() => {
    try { localStorage.setItem('incivus_last_flow', userFlow); } catch {}
  }, [userFlow]);

  // Add keyboard shortcut for resetting flow (Ctrl+Shift+R or Cmd+Shift+R)
  useEffect(() => {
    const handleKeyPress = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'R') {
        event.preventDefault();
        console.log('🎹 Keyboard shortcut triggered - resetting flow');
        resetFlow();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);



  const handleLoginSuccess = (user, loginResult = null) => {
    console.log('🎯 App.js: handleLoginSuccess called with user:', user.email);
    setUserData(user);
    
    // Log successful login
    Logger.info('User login successful', {
      userEmail: user.email,
      timestamp: new Date().toISOString(),
      component: 'App.js'
    });
    
    // Set user context in Sentry
    Logger.setUser({
      id: user.id,
      email: user.email,
      username: user.email
    });
    
    // Enhanced user existence check with database verification
    if (loginResult && loginResult.completionStatus) {
      const { userExistsInDB, isComplete, planDetails, userProfile, hasEssentialData, hasAcceptedTerms } = loginResult.completionStatus;
      console.log('🔍 Enhanced user existence check result:', { 
        userExistsInDB, 
        isComplete, 
        hasProfile: !!userProfile,
        hasPlan: !!planDetails,
        hasEssentialData,
        hasAcceptedTerms,
        fullCompletionStatus: loginResult.completionStatus 
      });

      // **ULTIMATE FIX**: Simple logic - if user exists in DB, go to dashboard
      if (userExistsInDB === true) {
        console.log('✅ User exists in database - redirecting to dashboard');
        Logger.trackUserAction('Login - Redirect to Dashboard', { 
          reason: 'user_exists_in_db',
          userExistsInDB,
          hasProfile: !!userProfile,
          hasPlan: !!planDetails
        });
        setUserFlow('dashboard');
      } else {
        console.log('🆕 User not found in database - going to registration');
        Logger.trackUserAction('Login - Redirect to Signup', { userType: 'new_user' });
        setUserFlow('signup');
      }
      return;
    }
    
    // Fallback: Check if this is a Google login with basic user existence check
    if (loginResult && loginResult.userExists !== undefined) {
      console.log('🔍 Basic user existence check result:', loginResult.userExists);
      
      if (loginResult.userExists) {
        console.log('✅ Existing user detected - redirecting directly to dashboard');
        setUserFlow('dashboard');
      } else {
        console.log('🆕 New user detected - going to registration');
        setUserFlow('signup');
      }
      return;
    }
    
    // Final fallback: Check localStorage for existing user data
    const hasAcceptedTerms = localStorage.getItem('incivus_terms_accepted');
    const isSignupComplete = localStorage.getItem('incivus_user_complete');
    
    if (hasAcceptedTerms && isSignupComplete) {
      console.log('✅ Existing user detected (localStorage) - redirecting directly to dashboard');
      setUserFlow('dashboard');
    } else {
      console.log('🆕 New user or incomplete user - going to registration');
      setUserFlow('signup');
    }
  };

  const handleSignupComplete = (signupData) => {
    // Store the complete user data
    setUserData({ ...userData, ...signupData });
    localStorage.setItem('incivus_user_complete', 'true');
    setUserFlow('terms'); // After signup, go to terms
  };

  const handleTermsAccept = () => {
    localStorage.setItem('incivus_terms_accepted', 'true');
    setUserFlow('dashboard'); // After terms, go to dashboard (plan selection will be prompted when needed)
  };

  const handleTermsDecline = () => {
    // If user declines terms, log them out and go back to login
    localStorage.removeItem('incivus_user_logged_in');
    localStorage.removeItem('incivus_google_user');
    localStorage.removeItem('incivus_user_complete');
    setUserFlow('login');
  };

  const handleShopifySuccess = (data) => {
    setShopifyData(data);
    setUserFlow('plan-selection');
  };

  const handlePlanSelection = (planData) => {
    console.log('🎯 Plan selected:', planData);
    // Store complete plan data for payment component
    localStorage.setItem('incivus_plan_data', JSON.stringify(planData));
    setSelectedPlan(planData); // Store complete plan object
    
    // Set dummy shopify data for payment component
    setShopifyData({
      shopDomain: 'demo-shop',
      shopName: 'Demo Shop',
      email: userData?.email || 'user@example.com'
    });
    setUserFlow('payment');
  };

  const handlePaymentSuccess = (data) => {
    // Store subscription info to prevent user from going back through the flow
    const planData = JSON.parse(localStorage.getItem('incivus_plan_data') || '{}');
    
    // Check for backup data if main plan data is missing
    const backupData = localStorage.getItem('incivus_subscription_backup');
    const planSelectionBackup = localStorage.getItem('incivus_plan_selection_backup');
    
    const finalPlanData = {
      ...planData,
      ...(backupData ? JSON.parse(backupData) : {}),
      ...(planSelectionBackup ? JSON.parse(planSelectionBackup) : {}),
      subscribed: true,
      purchaseDate: new Date().toISOString(),
      status: 'active',
      paymentStatus: 'completed'
    };
    
    localStorage.setItem('incivus_subscription', JSON.stringify(finalPlanData));
    localStorage.setItem('incivus_payment_completed', 'true');
    
    // Check if this was an upgrade for a specific feature
    if (planData.upgradeFeature) {
      console.log('🎯 Upgrade payment completed for feature:', planData.upgradeFeature);
      // Store the upgrade feature for post-payment handling
      localStorage.setItem('incivus_upgrade_feature_completed', planData.upgradeFeature);
      // Clear the upgrade feature flag
      localStorage.removeItem('incivus_upgrade_feature');
    }
    
    // Check if user was analyzing before payment - if so, return to analysis
    const wasAnalyzing = localStorage.getItem('incivus_pre_payment_flow');
    if (wasAnalyzing === 'analysis') {
      localStorage.removeItem('incivus_pre_payment_flow');
      setUserFlow('dashboard'); // Go to dashboard but will redirect to analysis
      // Store intent to go to analysis after dashboard loads
      localStorage.setItem('incivus_return_to_analysis', 'true');
    } else {
      setUserFlow('dashboard');
    }
  };

  const handlePaymentError = (error) => {
    setUserFlow('plan-selection');
  };

  // Add function to reset the entire flow (for development/testing)
  const resetFlow = () => {
    console.log('🔄 Manually resetting flow to login');
    Logger.info('User logout - Flow reset', {
      component: 'App.js',
      action: 'resetFlow'
    });
    Logger.clearUser(); // Clear user context from Sentry
    localStorage.clear();
    setUserData(null);
    setShopifyData(null);
    setSelectedPlan(null);
    setUserFlow('login');
  };

  // Add function to handle upgrade flow from dashboard
  const handleUpgradeFlow = (planData) => {
    console.log('🔄 Starting upgrade flow for plan:', planData);
    
    // If it's plan data object (from new Upgrade component), go directly to payment
    if (planData && typeof planData === 'object' && planData.planType) {
      localStorage.setItem('incivus_plan_data', JSON.stringify(planData));
      setSelectedPlan(planData);
      
      // Set dummy shopify data for payment component
      setShopifyData({
        shopDomain: 'demo-shop',
        shopName: 'Demo Shop',
        email: userData?.email || 'user@example.com'
      });
      setUserFlow('payment');
    } else {
      // If it's just a plan ID (legacy), go to plan selection
      setSelectedPlan(planData);
      setUserFlow('plan-selection');
    }
  };

  // NEW: Handle input field click redirect (Login → Signup → Terms → Dashboard)
  const handleInputFieldClick = () => {
    console.log('🔄 Input field clicked - redirecting to login flow');
    const isLoggedIn = localStorage.getItem('incivus_user_logged_in');
    const isSignupComplete = localStorage.getItem('incivus_user_complete');
    const hasAcceptedTerms = localStorage.getItem('incivus_terms_accepted');
    
    if (!isLoggedIn) {
      setUserFlow('login');
    } else if (!isSignupComplete) {
      setUserFlow('signup');
    } else if (!hasAcceptedTerms) {
      setUserFlow('terms');
    } else {
      setUserFlow('dashboard');
    }
  };

  // NEW: Handle analyze ad click redirect (Plan Selection → Payment → Dashboard)
  const handleAnalyzeAdClick = () => {
    console.log('🔄 Analyze Ad clicked - checking subscription');
    const subscription = localStorage.getItem('incivus_subscription');
    
    if (!subscription) {
      console.log('📋 No subscription found - redirecting to plan selection');
      setUserFlow('plan-selection');
    } else {
      console.log('✅ Subscription found - staying on dashboard for analysis');
      // Don't redirect, let the analysis happen on the current page
    }
  };

  const renderFlow = () => {
    switch (userFlow) {
      case 'login':
        return <LoginPage onLoginSuccess={handleLoginSuccess} />;
      case 'signup':
        return <SignupPage onSignupComplete={handleSignupComplete} />;
      case 'terms':
        return <TermsAndConditions onAccept={handleTermsAccept} onDecline={handleTermsDecline} />;
      case 'shopify-auth':
        return <ShopifyAuth onSuccess={handleShopifySuccess} onError={() => setUserFlow('login')} />;
      case 'plan-selection':
        return <PlanSelectionPage 
          onPlanSelect={handlePlanSelection} 
          preSelectedPlan={selectedPlan}
          onBack={() => setUserFlow('dashboard')}
        />;
      case 'payment':
        const planData = JSON.parse(localStorage.getItem('incivus_plan_data') || '{}');
        return <ShopifyPayment 
          planData={planData}
          shopifyData={shopifyData} 
          onSuccess={handlePaymentSuccess} 
          onError={handlePaymentError}
          onBack={() => setUserFlow('dashboard')}
        />;
      case 'dashboard':
        return <Dashboard 
          onResetFlow={resetFlow} 
          onUpgradeFlow={handleUpgradeFlow} 
          setUserFlow={setUserFlow}
          onInputFieldClick={handleInputFieldClick}
          onAnalyzeAdClick={handleAnalyzeAdClick}
        />;
      default:
        return <LoginPage onLoginSuccess={handleLoginSuccess} />;
    }
  };

    return (
    <AuthProvider>
      <ErrorBoundary>
        <div className="App">
          {renderFlow()}
        </div>
      </ErrorBoundary>
    </AuthProvider>
  );
}

export default App; 