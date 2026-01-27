import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import PlanStructure from '../components/PlanStructure';

const PlanSelectionPage = ({ onPlanSelect, preSelectedPlan = null, onBack }) => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Ensure the component loads properly
    const timer = setTimeout(() => {
      console.log('🔄 PlanSelectionPage: Loading complete, showing plans');
      setIsLoading(false);
    }, 50); // Reduced to 50ms for faster loading

    // Fallback timeout to prevent getting stuck
    const fallbackTimer = setTimeout(() => {
      console.log('⚠️ PlanSelectionPage: Fallback timeout triggered');
      setIsLoading(false);
    }, 2000); // 2 second fallback

    return () => {
      clearTimeout(timer);
      clearTimeout(fallbackTimer);
    };
  }, []);

  if (isLoading) {
    return (
      <div style={{ 
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '4px solid rgba(255,255,255,0.3)',
          borderTop: '4px solid white',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '1rem'
        }}></div>
        <h1 style={{ color: 'white', fontSize: '1.5rem', marginBottom: '0.5rem' }}>Select a Plan</h1>
        <p style={{ color: 'white', fontSize: '1.1rem' }}>Loading plan options...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '2rem 0'
    }}>
      {/* Back to Dashboard Button */}
      {onBack && (
        <div style={{
          maxWidth: '1000px',
          margin: '0 auto',
          padding: '0 2rem',
          marginBottom: '1rem'
        }}>
          <button
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '8px',
              fontSize: '0.9rem',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s',
              backdropFilter: 'blur(10px)'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
              e.target.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
              e.target.style.transform = 'translateY(0)';
            }}
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </button>
        </div>
      )}
      
      <PlanStructure 
        onPlanSelect={onPlanSelect || (() => console.log('⚠️ No onPlanSelect function provided'))}
        preSelectedPlan={preSelectedPlan}
        upgradeFeature={localStorage.getItem('incivus_upgrade_feature')}
      />
    </div>
  );
};

export default PlanSelectionPage; 