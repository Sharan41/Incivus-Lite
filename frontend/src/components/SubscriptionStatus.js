import React, { useState, useEffect } from 'react';
import { Calendar, User, Zap, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/formatHelpers';
// Now using single source of truth (PlanSelectionDetails) for consistency

const SubscriptionStatus = ({ refreshTrigger, compact = false, onNavigateToPlanSelection }) => {
  const { currentUser } = useAuth();
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUser?.uid) {
      loadSubscriptionStatus();
    }
  }, [currentUser, refreshTrigger]);
  
  // **FIX**: Listen for subscription updates after payment completion
  useEffect(() => {
    const handleSubscriptionUpdate = (event) => {
      console.log('🔄 SubscriptionStatus - Received subscription update event:', event.detail);
      // Force refresh subscription data if it's for the current user
      if (currentUser && event.detail.userId === currentUser.uid) {
        console.log('🔄 SubscriptionStatus - Auto-refreshing after payment...');
        // Reload with force refresh (bypasses cache)
        loadSubscriptionStatus(true);
      }
    };

    window.addEventListener('subscriptionUpdated', handleSubscriptionUpdate);
    return () => window.removeEventListener('subscriptionUpdated', handleSubscriptionUpdate);
  }, [currentUser]);

  const loadSubscriptionStatus = async (forceRefresh = false) => {
    try {
      setLoading(true);
      const userId = currentUser?.uid;
      if (!userId) return;

      console.log(`🔍 SubscriptionStatus - Loading from single source of truth... (forceRefresh: ${forceRefresh})`);
      
      // **SINGLE SOURCE OF TRUTH**: Use unified API for plan data
      const userProfile = await import('../utils/unifiedApiHelper').then(m => m.default.getUserProfile(userId, forceRefresh));
      const subscription = userProfile?.subscription || null;
      
      console.log('🔍 SubscriptionStatus - Plan data from single source:', subscription);
      
      if (subscription) {
        const effectiveSubscription = {
          planType: subscription.planType,
          planName: subscription.planName,
          adQuota: subscription.adQuota,
          adsUsed: subscription.adsUsed || 0,
          remainingAds: Math.max(0, (subscription.adQuota || 0) - (subscription.adsUsed || 0)),
          subscriptionStartDate: subscription.subscriptionStartDate,
          subscriptionEndDate: subscription.subscriptionEndDate,
          paymentStatus: subscription.paymentStatus,
          totalPrice: subscription.totalPrice,
          selectedFeatures: subscription.selectedFeatures || subscription.features || [],
          validityDays: subscription.validityDays,
          isActive: subscription.isActive !== false,
          subscribed: subscription.subscribed !== false,
          maxAdsPerMonth: subscription.max_ads_per_month || subscription.maxAdsPerMonth,
          max_ads_per_month: subscription.max_ads_per_month || subscription.maxAdsPerMonth,
          monthlyUsed: subscription.adsUsed || 0,
          monthlyRemaining: subscription.monthlyRemaining || Math.max(0, (subscription.max_ads_per_month || subscription.maxAdsPerMonth || 0) - (subscription.adsUsed || 0)),
          daysRemaining: subscription.subscriptionEndDate ? Math.ceil((new Date(subscription.subscriptionEndDate) - new Date()) / (1000 * 60 * 60 * 24)) : 0
        };
        
        console.log('✅ SubscriptionStatus - Plan data from single source:', effectiveSubscription);
        setSubscriptionStatus(effectiveSubscription);
      } else {
        console.log('⚠️ SubscriptionStatus - No subscription data found via API');
        setSubscriptionStatus({
          isActive: false,
          message: 'No Active Subscription'
        });
      }
    } catch (error) {
      console.error('Error loading subscription status:', error);
      setSubscriptionStatus({
        isActive: false,
        message: 'Error Loading Subscription'
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        padding: '1rem',
        background: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #e9ecef'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock size={16} />
          <span>Loading subscription...</span>
        </div>
      </div>
    );
  }

  // Show inactive subscription
  if (!subscriptionStatus || !subscriptionStatus.isActive) {
    if (compact) {
      // Compact mode for Analysis page - matches old blue card style
      return (
        <div style={{
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
          border: '2px solid #f59e0b',
          borderRadius: '8px',
          padding: '1.5rem',
          marginBottom: '1rem',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '2.5rem',
            marginBottom: '0.5rem',
            color: '#f59e0b'
          }}>!</div>
          <div style={{
            color: '#92400e',
            fontSize: '1.1rem',
            fontWeight: '700',
            marginBottom: '0.5rem'
          }}>
            No Active Subscription
          </div>
          <div style={{
            color: '#78350f',
            fontSize: '0.875rem',
            marginBottom: '1rem',
            lineHeight: '1.5'
          }}>
            Purchase a subscription plan to start analyzing your ads
          </div>
          {/* View Plan and Pricing button - redirects to plan selection page */}
          {onNavigateToPlanSelection && (
            <button
              onClick={onNavigateToPlanSelection}
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '0.75rem 1.5rem',
                fontSize: '0.9rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 6px rgba(245, 158, 11, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 12px rgba(245, 158, 11, 0.4)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(245, 158, 11, 0.3)';
              }}
            >
              View Plan and Pricing
            </button>
          )}
        </div>
      );
    }
    
    return (
      <div style={{
        background: 'linear-gradient(135deg, #fef2f2, #ffffff)',
        padding: '1.5rem',
        borderRadius: '16px',
        border: '2px solid #dc2626',
        boxShadow: '0 4px 6px rgba(220, 38, 38, 0.1)',
        marginBottom: '0.5rem'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem', 
          marginBottom: '1rem' 
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)'
          }}>
            <AlertTriangle size={20} color="white" />
          </div>
          <div>
            <div style={{ 
              fontWeight: '700', 
              color: '#b91c1c',
              fontSize: '1.125rem',
              letterSpacing: '-0.025em'
            }}>
              No Active Subscription
            </div>
            <div style={{ 
              fontSize: '0.875rem', 
              color: '#dc2626',
              fontWeight: '500'
            }}>
              Inactive Status
            </div>
          </div>
        </div>

        <div style={{
          background: 'rgba(220, 38, 38, 0.1)',
          padding: '0.75rem',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ color: '#b91c1c', fontWeight: '600' }}>Action Required</div>
          <div style={{ color: '#dc2626', fontWeight: '700' }}>
            Please select a plan to continue using Incivus
          </div>
        </div>
      </div>
    );
  }

  // Show active subscription
  const planDisplayNames = {
    'lite': 'Incivus Lite',
    'plus': 'Incivus Plus', 
    'pro': 'Incivus Pro',
    'enterprise': 'Enterprise'
  };

  const daysRemaining = Math.ceil((new Date(subscriptionStatus.subscriptionEndDate) - new Date()) / (1000 * 60 * 60 * 24));

  // Compact mode for Analysis page - matches old blue card style
  if (compact) {
    const features = subscriptionStatus.selectedFeatures || [];
    const getFeatureDisplayName = (featureName) => {
      const featureDisplayMap = {
        'resonance_index': 'Purchase Intent',
        'brand_compliance': 'Brand Compliance',
        'messaging_intent': 'Messaging Intent',
        'funnel_compatibility': 'Funnel Compatibility',
        'channel_compliance': 'Channel Compliance'
      };
      return featureDisplayMap[featureName] || featureName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };
    
    // **SAME CALCULATIONS AS FULL MODE (Profile page green card)**
    const adsUsed = subscriptionStatus.adsUsed || 0;
    const maxAdsPerMonth = subscriptionStatus.maxAdsPerMonth || subscriptionStatus.max_ads_per_month || 0;
    
    // Monthly Remaining = max_ads_per_month - adsUsed
    const monthlyRemaining = subscriptionStatus.monthlyRemaining || Math.max(0, maxAdsPerMonth - adsUsed);
    
    // Total Remaining = EXACTLY like green card (line 426) - use adQuota directly, NO calculation
    const totalRemaining = subscriptionStatus.adQuota || subscriptionStatus.remainingAds || 0;
    
    console.log('📊 Compact SubscriptionStatus - Data:', {
      adsUsed,
      adQuota: subscriptionStatus.adQuota,
      maxAdsPerMonth,
      monthlyRemaining,
      totalRemaining,
      source: 'Using adQuota directly (same as green card)'
    });
    
    return (
      <div style={{
        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
        border: '1px solid #0ea5e9',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1rem'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem'
        }}>
          <span style={{ fontWeight: '600', color: '#0c4a6e' }}>
            Plan Status
          </span>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#0ea5e9',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.target.style.background = '#0284c7'}
            onMouseOut={(e) => e.target.style.background = '#0ea5e9'}
            title="Refresh plan status"
          >
            Refresh
          </button>
        </div>
        <div style={{ fontSize: '0.875rem', color: '#0c4a6e', lineHeight: '1.4' }}>
          <div><strong>Plan:</strong> {subscriptionStatus.planName}</div>
          <div><strong>Features:</strong> {
            features.length > 0 
              ? features.map(feature => getFeatureDisplayName(feature)).join(', ')
              : 'None'
          }</div>
          <div><strong>Ads Used:</strong> {adsUsed}</div>
          <div><strong>Monthly Remaining:</strong> {monthlyRemaining} ads</div>
          <div><strong>Total Remaining:</strong> {totalRemaining} ads</div>
          {subscriptionStatus.subscriptionEndDate && (
            <div><strong>Expires:</strong> {new Date(subscriptionStatus.subscriptionEndDate).toLocaleDateString()} ({daysRemaining} days)</div>
          )}
        </div>
      </div>
    );
  }

  // Full mode for Profile page
  return (
    <div style={{
      background: 'linear-gradient(135deg, #f0fdf4, #ffffff)',
      padding: '1.5rem',
      borderRadius: '16px',
      border: '1px solid #22c55e',
      boxShadow: '0 4px 6px rgba(34, 197, 94, 0.1)',
      marginBottom: '0.5rem'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.75rem', 
        marginBottom: '1rem' 
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #22c55e, #16a34a)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(34, 197, 94, 0.3)'
        }}>
          <CheckCircle size={20} color="white" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ 
            fontWeight: '700', 
            color: '#15803d',
            fontSize: '1.125rem',
            letterSpacing: '-0.025em'
          }}>
            {planDisplayNames[subscriptionStatus.planType] || subscriptionStatus.planName}
          </div>
          <div style={{ 
            fontSize: '0.875rem', 
            color: '#059669',
            fontWeight: '500'
          }}>
            Active Subscription
          </div>
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: '#22c55e',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'background 0.2s'
          }}
          onMouseOver={(e) => e.target.style.background = '#16a34a'}
          onMouseOut={(e) => e.target.style.background = '#22c55e'}
          title="Refresh subscription data"
        >
          Refresh
        </button>
      </div>
      
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '1rem',
        fontSize: '0.875rem'
      }}>
        <div style={{
          background: 'rgba(34, 197, 94, 0.1)',
          padding: '0.75rem',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ color: '#059669', fontWeight: '600' }}>Plan</div>
          <div style={{ color: '#15803d', fontWeight: '700' }}>
            {planDisplayNames[subscriptionStatus.planType] || subscriptionStatus.planName}
          </div>
        </div>
        
        <div style={{
          background: 'rgba(34, 197, 94, 0.1)',
          padding: '0.75rem',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ color: '#059669', fontWeight: '600' }}>Monthly Used</div>
          <div style={{ color: '#15803d', fontWeight: '700' }}>
            {subscriptionStatus.monthlyUsed || subscriptionStatus.adsUsed}/{subscriptionStatus.maxAdsPerMonth || subscriptionStatus.max_ads_per_month || 'N/A'}
          </div>
        </div>
        
        <div style={{
          background: 'rgba(34, 197, 94, 0.1)',
          padding: '0.75rem',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ color: '#059669', fontWeight: '600' }}>Ads Used</div>
          <div style={{ color: '#15803d', fontWeight: '700' }}>
            {subscriptionStatus.adsUsed || 0}
          </div>
        </div>

        <div style={{
          background: 'rgba(34, 197, 94, 0.1)',
          padding: '0.75rem',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ color: '#059669', fontWeight: '600' }}>Monthly Remaining</div>
          <div style={{ color: '#15803d', fontWeight: '700' }}>
            {subscriptionStatus.monthlyRemaining || Math.max(0, (subscriptionStatus.max_ads_per_month || subscriptionStatus.maxAdsPerMonth || 0) - (subscriptionStatus.adsUsed || 0))} ads
          </div>
        </div>

        <div style={{
          background: 'rgba(34, 197, 94, 0.1)',
          padding: '0.75rem',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ color: '#059669', fontWeight: '600' }}>Total Remaining</div>
          <div style={{ color: '#15803d', fontWeight: '700' }}>
            {subscriptionStatus.adQuota || subscriptionStatus.remainingAds || 0} ads
          </div>
        </div>
        
        <div style={{
          background: 'rgba(34, 197, 94, 0.1)',
          padding: '0.75rem',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ color: '#059669', fontWeight: '600' }}>Days Left</div>
          <div style={{ color: '#15803d', fontWeight: '700' }}>
            {daysRemaining} days
          </div>
        </div>
        
        {subscriptionStatus.totalPrice && (
          <div style={{
            background: 'rgba(34, 197, 94, 0.1)',
            padding: '0.75rem',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ color: '#059669', fontWeight: '600' }}>Amount</div>
            <div style={{ color: '#15803d', fontWeight: '700' }}>
              {formatCurrency(subscriptionStatus.totalPrice)}
            </div>
          </div>
        )}
      </div>

      {/* Features Display */}
      {subscriptionStatus.selectedFeatures && subscriptionStatus.selectedFeatures.length > 0 && (
        <div style={{
          marginTop: '1rem',
          padding: '1rem',
          background: 'rgba(34, 197, 94, 0.05)',
          borderRadius: '8px',
          fontSize: '0.85rem',
          color: '#059669'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Zap size={14} />
            <strong>Features:</strong>
          </div>
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '0.5rem' 
          }}>
            {subscriptionStatus.selectedFeatures.map((feature, index) => {
              // Feature display name mapping
              const getFeatureDisplayName = (featureName) => {
                const featureDisplayMap = {
                  'resonance_index': 'Purchase Intent',
                  'brand_compliance': 'Brand Compliance',
                  'messaging_intent': 'Messaging Intent',
                  'funnel_compatibility': 'Funnel Compatibility',
                  'channel_compliance': 'Channel Compliance'
                };
                
                return featureDisplayMap[featureName] || featureName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              };

              return (
                <span
                  key={index}
                  style={{
                    background: 'rgba(34, 197, 94, 0.15)',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    color: '#15803d',
                    border: '1px solid rgba(34, 197, 94, 0.2)'
                  }}
                >
                  {getFeatureDisplayName(feature)}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Subscription Details */}
      <div style={{
        marginTop: '1rem',
        padding: '1rem',
        background: 'rgba(34, 197, 94, 0.05)',
        borderRadius: '8px',
        fontSize: '0.8rem',
        color: '#059669'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Calendar size={14} />
          <strong>Subscription Details:</strong>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
          <div><strong>Start:</strong> {new Date(subscriptionStatus.subscriptionStartDate).toLocaleDateString()}</div>
          <div><strong>End:</strong> {new Date(subscriptionStatus.subscriptionEndDate).toLocaleDateString()}</div>
          <div><strong>Expires:</strong> {new Date(subscriptionStatus.subscriptionEndDate).toLocaleDateString()} ({daysRemaining} days)</div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionStatus;