import React, { useState, useEffect, useMemo } from 'react';

import { 
  ChevronsLeft, 
  ChevronsRight,
  BarChart3, 
  Library, 
  HelpCircle, 
  LogOut,
  Palette,
  TrendingUp,
  UserCheck,
  Settings,
  Home
} from 'lucide-react';
import BrandSetup from '../components/BrandSetup';
import EnhancedBrandSetup from '../components/EnhancedBrandSetup';
import Analysis from '../components/Analysis';
import Libraries from '../components/Libraries';
import Upgrade from '../components/Upgrade';
import UserProfile from '../components/UserProfile';


// import DatabaseMigrationTool from '../components/DatabaseMigrationTool';

import { useAuth } from '../contexts/AuthContext';

const Dashboard = ({ onResetFlow, onUpgradeFlow, setUserFlow, onInputFieldClick = () => {}, onAnalyzeAdClick = () => {} }) => {

  const { currentUser, logout, checkUserCompletionStatus } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState('dashboard');

  // Check if we should return to analysis after payment
  useEffect(() => {
    const returnToAnalysis = localStorage.getItem('incivus_return_to_analysis');
    if (returnToAnalysis === 'true') {
      localStorage.removeItem('incivus_return_to_analysis');
      setActiveSection('analysis');
    }
  }, []);
  const [userPlan, setUserPlan] = useState('lite');
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [showFaqModal, setShowFaqModal] = useState(false);

  useEffect(() => {
    // Get user plan from localStorage
    const subscription = JSON.parse(localStorage.getItem('incivus_subscription') || '{}');
    let planType = subscription.planType || subscription.plan || 'lite';
    
    // Map database plan names to component plan keys
    const planMapping = {
      'Incivus_Lite': 'lite',
      'Incivus_Plus': 'plus', 
      'Incivus_Pro': 'pro',
      'Enterprise': 'enterprise',
      'incivus_lite': 'lite',
      'incivus_plus': 'plus',
      'incivus_pro': 'pro',
      'enterprise': 'enterprise'
    };
    
    // Apply mapping if needed
    if (planMapping[planType]) {
      planType = planMapping[planType];
    }
    
    // Ensure planType is lowercase for consistency
    planType = planType.toLowerCase();
    
    setUserPlan(planType);
    
    // Debug: Log user data to ensure profile section has data
    console.log('🏷️ Dashboard Profile Debug:', {
      currentUser: currentUser,
      subscription: subscription,
      originalPlanType: subscription.planType || subscription.plan,
      mappedPlanType: planType,
      showProfilePopup: showProfilePopup
    });
  }, [currentUser]);

  // Load user data for existing users when dashboard loads
  useEffect(() => {
    const loadExistingUserData = async () => {
      if (!currentUser?.uid) return;
      
      try {
        console.log('🔄 Loading existing user data for dashboard...');
        
        // Check if user data is already in localStorage
        const userProfile = localStorage.getItem('incivus_user_profile');
        const userProfileDetails = localStorage.getItem('incivus_user_profile_details');
        const subscription = localStorage.getItem('incivus_subscription');
        
        if (userProfile || userProfileDetails || subscription) {
          console.log('✅ User data found in localStorage, no need to reload from database');
          return;
        }
        
        // If not in localStorage, load from database
        console.log('📥 Loading user data from database...');
        const completionStatus = await checkUserCompletionStatus(currentUser.uid);
        
        if (completionStatus.userProfile) {
          localStorage.setItem('incivus_user_profile', JSON.stringify(completionStatus.userProfile));
          console.log('✅ User profile loaded from database');
        }
        
        if (completionStatus.userProfileDetails) {
          localStorage.setItem('incivus_user_profile_details', JSON.stringify(completionStatus.userProfileDetails));
          console.log('✅ User profile details loaded from database');
        }
        
        if (completionStatus.planDetails) {
          localStorage.setItem('incivus_subscription', JSON.stringify(completionStatus.planDetails));
          console.log('✅ Subscription details loaded from database');
        }
        
        console.log('🎉 All user data loaded successfully');
        
      } catch (error) {
        console.error('❌ Error loading existing user data:', error);
      }
    };
    
    loadExistingUserData();
  }, [currentUser]);

  // Check if user has an active subscription
  const hasActiveSubscription = () => {
    const subscription = JSON.parse(localStorage.getItem('incivus_subscription') || '{}');
    
    // Debug: Check if we want to force locked results for testing
    const forceLockedResults = localStorage.getItem('incivus_force_locked_results') === 'true';
    if (forceLockedResults) {
      console.log('🔒 Debug: Forcing locked results for testing');
      return false;
    }
    
    // For Pro plan, we can be more lenient - just check if it's a valid plan type
    if (subscription.planType === 'pro' || subscription.planType === 'plus' || subscription.planType === 'enterprise') {
      console.log('🔍 Pro/Plus/Enterprise plan detected - returning true');
      return true;
    }
    
    // Check if user has a valid plan type and it's not free
    const hasValidPlan = subscription.planType && subscription.planType !== 'free';
    // Also check if the subscription is active (if available)
    const isActive = subscription.isActive !== false; // Default to true if not specified
    // Check if payment is completed
    const paymentCompleted = subscription.paymentStatus === 'completed' || subscription.subscribed === true;
    
    const hasSubscription = hasValidPlan && isActive && paymentCompleted;
    console.log('🔍 Subscription check:', { 
      planType: subscription.planType, 
      isActive,
      paymentCompleted, 
      hasSubscription 
    });
    return hasSubscription;
  };

  // Check if user is admin (for migration tool access)
  const isAdmin = currentUser?.email?.includes('admin') || 
                  currentUser?.email?.includes('@incivus.ai') ||
                  currentUser?.email?.includes('@c5i.ai');

  const navigationItems = useMemo(() => {
    const baseItems = [
      { 
        id: 'dashboard', 
        label: 'Dashboard', 
        icon: <Home size={20} />,
        color: '#7c3aed',  // Consistent dark purple for all
        bgColor: 'rgba(124, 58, 237, 0.15)'
      },
      { 
        id: 'brand-setup', 
        label: 'Brand Setup', 
        icon: <Palette size={20} />,
        color: '#7c3aed',  // Consistent dark purple for all
        bgColor: 'rgba(124, 58, 237, 0.15)'
      },
      { 
        id: 'analysis', 
        label: 'Analysis & Reports', 
        icon: <BarChart3 size={20} />,
        color: '#7c3aed',  // Consistent dark purple for all
        bgColor: 'rgba(124, 58, 237, 0.15)'
      },
      { 
        id: 'libraries', 
        label: 'Libraries', 
        icon: <Library size={20} />,
        color: '#7c3aed',  // Consistent dark purple for all
        bgColor: 'rgba(124, 58, 237, 0.15)'
      },
      { 
        id: 'upgrade', 
        label: 'Upgrade', 
        icon: <TrendingUp size={20} />,
        color: '#7c3aed',  // Consistent dark purple for all
        bgColor: 'rgba(124, 58, 237, 0.15)'
      }
    ];

    // Add migration tool for admin users only


    return baseItems;
  }, [isAdmin]);

  const handleSidebarToggle = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleNavigationClick = (itemId) => {
    if (itemId === 'logout') {
      handleLogout();
    } else {
      setActiveSection(itemId);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      localStorage.removeItem('incivus_subscription');
      localStorage.removeItem('incivus_terms_accepted');
      localStorage.removeItem('incivus_brand_config');
      localStorage.removeItem('incivus_user_logged_in');
      localStorage.removeItem('incivus_google_user');
      localStorage.removeItem('incivus_user_complete');
      // Refresh the page to trigger the userFlow logic in App.js
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleHelpClick = () => {
    // Show FAQ modal with upgrade section content
    setShowFaqModal(true);
  };



  const renderCallToActionCard = () => {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '2rem'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, var(--card-purple) 0%, var(--card-lavender) 100%)',
          borderRadius: '24px',
          padding: '3rem',
          maxWidth: '600px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(167, 139, 250, 0.15)',
          border: '2px solid rgba(167, 139, 250, 0.1)',
          overflow: 'hidden',
          position: 'relative',
          transition: 'all 0.4s ease',
          textAlign: 'center'
        }}
        onMouseEnter={(e) => {
          e.target.style.transform = 'translateY(-8px) scale(1.02)';
          e.target.style.boxShadow = '0 30px 80px rgba(167, 139, 250, 0.25)';
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = 'translateY(0px) scale(1)';
          e.target.style.boxShadow = '0 20px 60px rgba(167, 139, 250, 0.15)';
        }}
        >
          {/* Animated Background Elements */}
          <div style={{
            position: 'absolute',
            top: '-50%',
            right: '-10%',
            width: '120px',
            height: '120px',
            background: 'linear-gradient(45deg, var(--primary-purple-dark), var(--secondary-purple))',
            borderRadius: '50%',
            opacity: 0.1,
            animation: 'float 6s ease-in-out infinite'
          }}></div>
          
          <div style={{
            position: 'absolute',
            bottom: '-30%',
            left: '-5%',
            width: '80px',
            height: '80px',
            background: 'linear-gradient(45deg, var(--card-pink), var(--primary-purple))',
            borderRadius: '50%',
            opacity: 0.15,
            animation: 'float 4s ease-in-out infinite reverse'
          }}></div>

          {/* Main Content */}
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              padding: '3rem',
              borderRadius: '20px',
              color: 'white',
              textAlign: 'center',
              marginBottom: '2rem',
              boxShadow: '0 20px 60px rgba(102, 126, 234, 0.3)',
              minHeight: '400px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              {/* Rocket Icon */}
              <div style={{
                fontSize: '4rem',
                marginBottom: '2rem',
                filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.2))'
              }}>🚀</div>
              
              <h2 style={{
                fontSize: '2.5rem',
                fontWeight: '700',
                marginBottom: '1.5rem',
                letterSpacing: '0.5px',
                textShadow: '0 4px 8px rgba(0,0,0,0.2)'
              }}>
                Incisive Insights with Incivus
              </h2>
              
              <p style={{
                fontSize: '1.3rem',
                opacity: '0.9',
                marginBottom: '3rem',
                lineHeight: '1.6',
                maxWidth: '600px'
              }}>
                Unlock the power of Ad analysis and optimization
              </p>

              {/* Upload Button */}
              <button
                onClick={async () => {
                  // Check if brand setup is complete
                  try {
                    if (currentUser?.uid) {
                      const completionStatus = await checkUserCompletionStatus(currentUser.uid);
                      
                      // Check multiple indicators for brand setup completion
                      const brandSetupComplete = 
                        completionStatus?.brandSetupComplete || 
                        completionStatus?.brandData || 
                        completionStatus?.brandSetup ||
                        localStorage.getItem('incivus_brand_setup_complete') === 'true' ||
                        localStorage.getItem('incivus_brand_config');
                      
                      console.log('🔍 Brand setup check:', {
                        completionStatus,
                        brandSetupComplete,
                        localStorage_brand_complete: localStorage.getItem('incivus_brand_setup_complete'),
                        localStorage_brand_config: localStorage.getItem('incivus_brand_config')
                      });
                      
                      if (brandSetupComplete) {
                        // Brand setup is complete, go directly to analysis
                        console.log('✅ Brand setup complete - going to analysis');
                        setActiveSection('analysis');
                      } else {
                        // Brand setup not complete, go to brand setup first
                        console.log('⚠️ Brand setup not complete - going to brand setup');
                        setActiveSection('brand-setup');
                      }
                    } else {
                      // User not authenticated, go to brand setup
                      console.log('❌ User not authenticated - going to brand setup');
                      setActiveSection('brand-setup');
                    }
                  } catch (error) {
                    console.error('Error checking brand setup status:', error);
                    // Fallback to brand setup
                    setActiveSection('brand-setup');
                  }
                }}
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '16px',
                  padding: '1.2rem 3rem',
                  fontSize: '1.2rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 12px 32px rgba(139, 92, 246, 0.4)',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  minWidth: '300px',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 16px 40px rgba(139, 92, 246, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 12px 32px rgba(139, 92, 246, 0.4)';
                }}
              >
                📤 UPLOAD YOUR ADS NOW
              </button>
            </div>
          </div>
          
          {/* CSS Animation */}
          <style>{`
            @keyframes float {
              0%, 100% { transform: translateY(0px) rotate(0deg); }
              50% { transform: translateY(-20px) rotate(180deg); }
            }
            
            /* Navigation Button Hover Effects */
            .nav-button:not(.nav-button-active):hover {
              background: rgba(124, 58, 237, 0.15) !important;
              border-color: rgba(124, 58, 237, 0.25) !important;
              transform: translateY(-1px) !important;
            }
            
            .nav-button:not(.nav-button-active):focus {
              background: transparent !important;
              border-color: transparent !important;
              transform: translateY(0px) !important;
            }
            
            .nav-button:not(.nav-button-active) {
              background: transparent !important;
              border-color: transparent !important;
              transform: translateY(0px) !important;
            }
          `}</style>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    return (
      <div>
        {/* Page Content */}
        {(() => {
          switch (activeSection) {
            case 'dashboard':
              return (
                <div>
                  {/* Call to Action Card - Main dashboard view */}
                  {renderCallToActionCard()}
                  
                  {/* Debug Component for Testing User Existence */}
          
                </div>
              );
            case 'brand-setup':
              return (
                <div>
                  <EnhancedBrandSetup 
                    onSave={(config) => {
                      console.log('Brand config saved:', config);
                      // Check if this is a redirect to analysis
                      if (config && config.redirectToAnalysis) {
                        setActiveSection('analysis');
                      } else {
                        // After saving brand setup, redirect to analysis
                        setActiveSection('analysis');
                      }
                    }} 
                    setUserFlow={setUserFlow}
                    onInputFieldClick={() => {}} // Disable input field click redirects
                    hasActiveSubscription={true} // Always allow brand setup before subscription
                    showAnalyzeButton={true} // Show "Analyze Ad" button instead of "Save Brand Setup"
                  />
                </div>
              );
            case 'analysis':
              return <Analysis 
                userPlan={userPlan} 
                setUserFlow={setUserFlow} 
                hasActiveSubscription={hasActiveSubscription()} // Use actual subscription status
                showLockedResults={!hasActiveSubscription()} // Show locked results if no subscription
              />;
            case 'libraries':
              return <Libraries />;
            case 'upgrade':
              return <Upgrade currentPlan={userPlan} onUpgrade={onUpgradeFlow || ((newPlan) => setUserPlan(newPlan))} />;
            case 'profile':
              return <UserProfile />;

            default:
              return (
                <div>
                  {/* Call to Action Card - Fallback */}
                  {renderCallToActionCard()}
                </div>
              );
          }
        })()}
      </div>
    );
  };

  return (
    <div style={{ 
      display: 'flex', 
      minHeight: '100vh', 
      background: 'var(--white)'  /* Pure white background */
    }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarCollapsed ? '70px' : '280px',
        background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.9) 100%)',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '4px 0 24px rgba(0, 0, 0, 0.1)',
        transition: 'width 0.3s ease',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 100
      }}>
        {/* Logo */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid rgba(91, 33, 182, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'space-between',
          flexDirection: sidebarCollapsed ? 'column' : 'row',
          gap: sidebarCollapsed ? '0.5rem' : '0'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <img 
              src="/logo/C5i name with Logo.svg" 
              alt="C5i Logo" 
              style={{ 
                height: sidebarCollapsed ? '28px' : '45px', 
                width: 'auto',
                maxWidth: sidebarCollapsed ? '45px' : '200px',
                display: 'block',
                transition: 'all 0.3s ease',
                transform: sidebarCollapsed ? 'scale(0.9)' : 'scale(1)',
                objectFit: 'contain'
              }}
            />
          </div>
          {!sidebarCollapsed && (
            <button
              onClick={handleSidebarToggle}
              style={{
                background: 'linear-gradient(135deg, rgba(91, 33, 182, 0.1), rgba(107, 33, 168, 0.1))',
                border: '1px solid rgba(91, 33, 182, 0.2)',
                borderRadius: '8px',
                cursor: 'pointer',
                color: '#5b21b6',
                padding: '0.5rem',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#5b21b6';
                e.target.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'linear-gradient(135deg, rgba(91, 33, 182, 0.1), rgba(107, 33, 168, 0.1))';
                e.target.style.color = '#5b21b6';
              }}
            >
              <ChevronsLeft size={20} />
            </button>
          )}
          {sidebarCollapsed && (
            <button
              onClick={handleSidebarToggle}
              style={{
                background: 'linear-gradient(135deg, rgba(91, 33, 182, 0.1), rgba(107, 33, 168, 0.1))',
                border: '1px solid rgba(91, 33, 182, 0.2)',
                borderRadius: '8px',
                cursor: 'pointer',
                color: '#5b21b6',
                padding: '0.5rem',
                transition: 'all 0.2s ease',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#5b21b6';
                e.target.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'linear-gradient(135deg, rgba(91, 33, 182, 0.1), rgba(107, 33, 168, 0.1))';
                e.target.style.color = '#5b21b6';
              }}
            >
              <ChevronsRight size={18} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '1rem 0' }}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {(navigationItems || []).filter(item => item && item.id && item.color).map((item) => (
              <li key={item.id} style={{ margin: '0.5rem 0' }}>
              <button
                onClick={() => handleNavigationClick(item.id)}
                className={`nav-button ${activeSection === item.id ? 'nav-button-active' : ''}`}
                style={{
                  width: sidebarCollapsed ? '48px' : 'calc(100% - 2rem)',
                  height: sidebarCollapsed ? '48px' : 'auto',
                  padding: sidebarCollapsed ? '0' : '1rem 1.5rem',
                  margin: sidebarCollapsed ? '0 auto' : '0 1rem',
                  background: activeSection === item.id 
                    ? `linear-gradient(135deg, ${item.color || '#7c3aed'}, ${item.color || '#7c3aed'}dd)` 
                    : 'transparent',
                  color: activeSection === item.id ? 'white' : (item.color || '#7c3aed'),
                  border: `2px solid ${activeSection === item.id ? (item.color || '#7c3aed') : 'transparent'}`,
                  borderRadius: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  gap: sidebarCollapsed ? '0' : '0.75rem',
                  fontSize: '0.875rem',
                  fontWeight: activeSection === item.id ? '600' : '500',
                  transition: 'all 0.2s ease-in-out',
                  textAlign: 'left',
                  boxShadow: activeSection === item.id 
                    ? `0 4px 12px ${item.color || '#7c3aed'}40` 
                    : 'none',
                  position: 'relative'
                }}
                title={sidebarCollapsed ? (item.label || '') : ''}
                onMouseEnter={(e) => {
                  if (activeSection !== item.id) {
                    e.target.style.background = `rgba(${item.color === '#7c3aed' ? '124, 58, 237' : '124, 58, 237'}, 0.1)`;
                    e.target.style.borderColor = `rgba(${item.color === '#7c3aed' ? '124, 58, 237' : '124, 58, 237'}, 0.3)`;
                    e.target.style.transform = 'translateX(4px)';
                    e.target.style.boxShadow = `0 2px 8px rgba(${item.color === '#7c3aed' ? '124, 58, 237' : '124, 58, 237'}, 0.15)`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeSection !== item.id) {
                    e.target.style.background = 'transparent';
                    e.target.style.borderColor = 'transparent';
                    e.target.style.transform = 'translateX(0px)';
                    e.target.style.boxShadow = 'none';
                  }
                }}
              >
                <div style={{ 
                  color: activeSection === item.id ? 'white' : (item.color || '#7c3aed'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {item.icon}
                </div>
                {!sidebarCollapsed && (
                  <span style={{ marginLeft: '0.75rem' }}>{item.label || ''}</span>
                )}
              </button>
              </li>
          ))}
          
          {/* User Profile - Within Navigation */}
          <li style={{ margin: '0.5rem 0' }}>
            <button
              onClick={() => handleNavigationClick('profile')}
              style={{
                width: sidebarCollapsed ? '48px' : 'calc(100% - 2rem)',
                height: sidebarCollapsed ? '48px' : 'auto',
                margin: sidebarCollapsed ? '0 auto' : '0 1rem',
                background: activeSection === 'profile' 
                  ? 'linear-gradient(135deg, #7c3aed, #7c3aeddd)' 
                  : 'transparent',
                border: `2px solid ${activeSection === 'profile' ? '#7c3aed' : 'transparent'}`,
                borderRadius: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                gap: sidebarCollapsed ? '0' : '0.75rem',
                padding: sidebarCollapsed ? '0' : '1rem 1.5rem',
                fontSize: '0.875rem',
                fontWeight: activeSection === 'profile' ? '600' : '500',
                transition: 'all 0.3s ease',
                textAlign: 'left',
                boxShadow: activeSection === 'profile' 
                  ? '0 4px 12px #7c3aed40' 
                  : 'none',
                position: 'relative'
              }}
              title={sidebarCollapsed ? 'Profile' : ''}
              onMouseEnter={(e) => {
                if (activeSection !== 'profile') {
                  e.target.style.background = 'rgba(124, 58, 237, 0.1)';
                  e.target.style.borderColor = 'rgba(124, 58, 237, 0.3)';
                  e.target.style.transform = 'translateX(4px)';
                  e.target.style.boxShadow = '0 2px 8px rgba(124, 58, 237, 0.15)';
                }
              }}
              onMouseLeave={(e) => {
                if (activeSection !== 'profile') {
                  e.target.style.background = 'transparent';
                  e.target.style.borderColor = 'transparent';
                  e.target.style.transform = 'translateX(0px)';
                  e.target.style.boxShadow = 'none';
                }
              }}
            >
              {/* Profile Avatar */}
              {currentUser?.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt="Profile"
                  style={{
                    width: sidebarCollapsed ? '32px' : '20px',
                    height: sidebarCollapsed ? '32px' : '20px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid rgba(91, 33, 182, 0.3)'
                  }}
                />
              ) : (
                <div style={{
                  width: sidebarCollapsed ? '32px' : '20px',
                  height: sidebarCollapsed ? '32px' : '20px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #5b21b6, #6b21a8)',
                  border: '2px solid rgba(91, 33, 182, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: sidebarCollapsed ? '0.875rem' : '0.75rem',
                  fontWeight: '600'
                }}>
                  {currentUser?.displayName?.[0] || currentUser?.email?.[0] || 'U'}
                </div>
              )}
              {/* Profile Info - Only show when sidebar expanded */}
              {!sidebarCollapsed && (
                <span style={{ marginLeft: '0.75rem', color: activeSection === 'profile' ? 'white' : '#7c3aed' }}>
                  {currentUser?.displayName || currentUser?.email || 'User'}
                </span>
              )}
            </button>
          </li>
          </ul>
        </nav>


        
        {/* Logout Section - At bottom */}
        <div style={{ 
          marginTop: 'auto',
          padding: sidebarCollapsed ? '1rem 0.5rem' : '1rem 1.5rem',
          borderTop: '1px solid rgba(239, 68, 68, 0.1)'
        }}>
          <button
            onClick={() => handleNavigationClick('logout')}
            style={{
              width: '100%',
              background: 'transparent',
              color: '#ef4444',
              border: '2px solid transparent',
              borderRadius: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              gap: sidebarCollapsed ? '0' : '0.75rem',
              padding: sidebarCollapsed ? '0.75rem' : '0.75rem 1rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(239, 68, 68, 0.15)';
              e.target.style.borderColor = 'rgba(239, 68, 68, 0.25)';
              e.target.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'transparent';
              e.target.style.borderColor = 'transparent';
              e.target.style.transform = 'translateY(0px)';
            }}
          >
            <LogOut size={20} />
            {!sidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </div>
        
      {/* Profile Menu Modal - Overlay Style - Outside sidebar */}
        {showProfilePopup && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 99999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={() => setShowProfilePopup(false)}
          >
            <div 
              style={{
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.9) 100%)',
                backdropFilter: 'blur(20px)',
                borderRadius: '20px',
                boxShadow: '0 25px 50px -12px rgba(124, 58, 237, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.2)',
                padding: '2rem',
                minWidth: '280px',
                maxWidth: '320px',
                margin: '1rem',
                border: '1px solid rgba(255, 255, 255, 0.3)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem',
                marginBottom: '1rem',
                paddingBottom: '1rem',
                borderBottom: '1px solid var(--border-gray)'
              }}>
                {currentUser?.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt="Profile"
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      objectFit: 'cover'
                    }}
                  />
                ) : (
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'var(--primary-purple)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '1rem',
                    fontWeight: '500'
                  }}>
                    {currentUser?.displayName?.[0] || currentUser?.email?.[0] || 'U'}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text-dark)' }}>
                    {currentUser?.displayName || currentUser?.email || 'User'}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
    {userPlan === 'pro' ? 'Incivus Pro' : userPlan === 'lite' ? 'Incivus Lite' : userPlan.charAt(0).toUpperCase() + userPlan.slice(1) + ' Plan'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <button
                  onClick={() => {
                    if (onResetFlow) {
                      setShowProfilePopup(false);
                      onResetFlow();
                    }
                  }}
                  style={{
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.05))',
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    padding: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    fontSize: '0.875rem',
                    color: '#f59e0b',
                    width: '100%',
                    textAlign: 'left',
                    transition: 'all 0.3s ease',
                    fontWeight: '500'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#f59e0b';
                    e.target.style.color = 'white';
                    e.target.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.05))';
                    e.target.style.color = '#f59e0b';
                    e.target.style.transform = 'translateY(0px)';
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                  </svg>
                  EXIT
                </button>
                
                <button
                  onClick={handleLogout}
                  style={{
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05))',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    padding: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    fontSize: '0.875rem',
                    color: '#ef4444',
                    width: '100%',
                    textAlign: 'left',
                    transition: 'all 0.3s ease',
                    fontWeight: '500'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#ef4444';
                    e.target.style.color = 'white';
                    e.target.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05))';
                    e.target.style.color = '#ef4444';
                    e.target.style.transform = 'translateY(0px)';
                  }}
                >
                  <LogOut size={18} />
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}

      {/* FAQ Modal */}
      {showFaqModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={() => setShowFaqModal(false)}
        >
          <div 
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.9) 100%)',
              backdropFilter: 'blur(20px)',
              borderRadius: '20px',
              boxShadow: '0 25px 50px -12px rgba(124, 58, 237, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.2)',
              padding: '2rem',
              width: '100%',
              maxWidth: '700px',
              maxHeight: '80vh',
              overflow: 'auto',
              border: '1px solid rgba(255, 255, 255, 0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '2rem',
              borderBottom: '1px solid rgba(91, 33, 182, 0.1)',
              paddingBottom: '1rem'
            }}>
              <h2 style={{ 
                color: '#5b21b6',
                fontSize: '1.75rem',
                fontWeight: '700',
                margin: 0
              }}>
                Frequently Asked Questions
              </h2>
              <button
                onClick={() => setShowFaqModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  color: '#5b21b6',
                  cursor: 'pointer',
                  padding: '0.5rem',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(91, 33, 182, 0.1)'}
                onMouseLeave={(e) => e.target.style.background = 'none'}
              >
                ×
              </button>
            </div>
            
            <div style={{ display: 'grid', gap: '1.5rem' }}>
              <div style={{
                padding: '1.5rem',
                background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)',
                borderRadius: '12px',
                border: '1px solid #e9ecef'
              }}>
                <h4 style={{ 
                  color: '#5b21b6', 
                  marginBottom: '0.75rem', 
                  fontSize: '1.1rem', 
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ color: '#5b21b6' }}>💰</span>
                  How does the ad-based pricing work?
                </h4>
                <p style={{ 
                  color: 'rgba(91, 33, 182, 0.8)', 
                  fontSize: '0.95rem', 
                  lineHeight: '1.6',
                  margin: 0
                }}>
                  Each plan includes a minimum ad quota (MOQ):
                  <br/>
                  <strong>Lite</strong> – $50 for 10 ads<br/>
                  <strong>Plus</strong> – $100 for 25 ads<br/>
                  <strong>Pro</strong> – $400 for 125 ads<br/>
                  <br/>
                  Additional ads are charged as follows:<br/>
                  <strong>Lite</strong>: $5/ad<br/>
                  <strong>Plus</strong>: $4/ad<br/>
                  <strong>Pro</strong>: $3.20/ad<br/>
                  <br/>
                  All quotas are prepaid. You pay upfront for your selected quota.
                </p>
              </div>
              
              <div style={{
                padding: '1.5rem',
                background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)',
                borderRadius: '12px',
                border: '1px solid #e9ecef'
              }}>
                <h4 style={{ 
                  color: '#5b21b6', 
                  marginBottom: '0.75rem', 
                  fontSize: '1.1rem', 
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ color: '#5b21b6' }}>⏰</span>
                  What happens when my subscription expires?
                </h4>
                <p style={{ 
                  color: 'rgba(91, 33, 182, 0.8)', 
                  fontSize: '0.95rem', 
                  lineHeight: '1.6',
                  margin: 0
                }}>
                  Lite plans: valid for 90 days<br/>
                  Plus plans: valid for 180 days<br/>
                  Pro plans: valid for 365 days<br/>
                  <br/>
                  If you renew before expiry, your new quota is added to your remaining days, and your data is preserved.<br/>
                  If you renew after expiry, your subscription restarts, and previous data is lost.
                </p>
              </div>
              
              <div style={{
                padding: '1.5rem',
                background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)',
                borderRadius: '12px',
                border: '1px solid #e9ecef'
              }}>
                <h4 style={{ 
                  color: '#5b21b6', 
                  marginBottom: '0.75rem', 
                  fontSize: '1.1rem', 
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ color: '#5b21b6' }}>🔧</span>
                  Can I change my selected features in the Lite plan?
                </h4>
                <p style={{ 
                  color: 'rgba(91, 33, 182, 0.8)', 
                  fontSize: '0.95rem', 
                  lineHeight: '1.6',
                  margin: 0
                }}>
                  No. The 4 features you choose at signup are fixed until your next renewal.<br/>
                  To access all 5 features immediately, upgrade to Plus or Pro.
                </p>
              </div>
              
              <div style={{
                padding: '1.5rem',
                background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)',
                borderRadius: '12px',
                border: '1px solid #e9ecef'
              }}>
                <h4 style={{ 
                  color: '#5b21b6', 
                  marginBottom: '0.75rem', 
                  fontSize: '1.1rem', 
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ color: '#5b21b6' }}>📈</span>
                  Need more features and unlimited ad analysis?
                </h4>
                <p style={{ 
                  color: 'rgba(91, 33, 182, 0.8)', 
                  fontSize: '0.95rem', 
                  lineHeight: '1.6',
                  margin: 0
                }}>
                  Get Enterprise for access to: Recall, Attention Heatmap, Cognitive Load, Ad Copy Effectiveness, Emotions, Digital Accessibility, Benchmarking, A/B Testing, Pre-flight vs Post Flight, Predictive Analytics and more.<br/>
                  Upgrade via the Upgrade Plan section.
                </p>
              </div>
              <div style={{
                padding: '1.5rem',
                background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)',
                borderRadius: '12px',
                border: '1px solid #e9ecef'
              }}>
                <h4 style={{ 
                  color: '#5b21b6', 
                  marginBottom: '0.75rem', 
                  fontSize: '1.1rem', 
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ color: '#5b21b6' }}>📩</span>
                  Need help?
                </h4>
                <p style={{ 
                  color: 'rgba(91, 33, 182, 0.8)', 
                  fontSize: '0.95rem', 
                  lineHeight: '1.6',
                  margin: 0
                }}>
                  Email us at <a href="mailto:incivus_pm@c5i.ai">incivus_pm@c5i.ai</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        marginLeft: sidebarCollapsed ? '70px' : '280px',
        transition: 'margin-left 0.3s ease'
      }}>
        {/* Header */}
        <header style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.9) 100%)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.1)',
          padding: '1rem 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h1 style={{ 
              fontSize: '1.5rem', 
              fontWeight: '700', 
              color: '#5b21b6',
              margin: 0
            }}>
              {navigationItems.find(item => item.id === activeSection)?.label || 'Dashboard'}
            </h1>
            <p style={{ 
              fontSize: '0.875rem', 
              color: 'rgba(91, 33, 182, 0.8)', 
              margin: '0.25rem 0 0 0'
            }}>
              Welcome back! Here's what's happening with your Ads.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>

            <button
              onClick={handleHelpClick}
              style={{
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(99, 102, 241, 0.05))',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                borderRadius: '12px',
                cursor: 'pointer',
                padding: '0.75rem',
                color: '#6366f1',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#6366f1';
                e.target.style.color = 'white';
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 8px 24px rgba(99, 102, 241, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(99, 102, 241, 0.05))';
                e.target.style.color = '#6366f1';
                e.target.style.transform = 'translateY(0px)';
                e.target.style.boxShadow = 'none';
              }}
              title="Help & FAQs"
            >
              <HelpCircle size={20} />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main style={{ 
          flex: 1, 
          overflow: 'auto',
          padding: '2rem',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          margin: '1rem',
          borderRadius: '20px',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          {renderContent()}
        </main>
      </div>
      

    </div>
  );
};

export default Dashboard;