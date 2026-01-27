import React, { useState, useEffect } from 'react';
import { Lock, Zap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { hasFeatureAccess, getUserFeatures } from '../utils/subscriptionHelpers';

const FeatureAccessControl = ({ 
  featureId, 
  featureName, 
  children, 
  upgradeMessage = "Upgrade your plan to access this feature" 
}) => {
  const { currentUser } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAccess();
  }, [currentUser, featureId]);

  const checkAccess = async () => {
    try {
      setLoading(true);
      const userId = currentUser?.uid || localStorage.getItem('incivus_user_id');
      if (!userId) {
        setHasAccess(false);
        return;
      }

      const access = await hasFeatureAccess(userId, featureId);
      setHasAccess(access);
    } catch (error) {
      console.error('Error checking feature access:', error);
      setHasAccess(false);
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
        textAlign: 'center',
        color: '#6c757d'
      }}>
        Checking feature access...
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div style={{
        background: '#fff3cd',
        border: '2px solid #ffeaa7',
        borderRadius: '12px',
        padding: '2rem',
        textAlign: 'center',
        color: '#856404'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          marginBottom: '1rem'
        }}>
          <Lock size={24} />
          <h3 style={{ margin: 0, fontSize: '1.3rem' }}>
            {featureName} - Premium Feature
          </h3>
        </div>
        <p style={{ marginBottom: '1.5rem', fontSize: '1rem' }}>
          {upgradeMessage}
        </p>
        <button
          onClick={() => {
            // Navigate to upgrade page
            window.dispatchEvent(new CustomEvent('navigate-to-upgrade'));
          }}
          style={{
            background: '#6f42c1',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '0.75rem 2rem',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            margin: '0 auto'
          }}
        >
          <Zap size={16} />
          Unlock Full Insights
        </button>
      </div>
    );
  }

  return children;
};

export default FeatureAccessControl;