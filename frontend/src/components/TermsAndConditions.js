import React, { useState } from 'react';
import { Check } from 'lucide-react';

const TermsAndConditions = ({ onAccept, onDecline }) => {
  const [accepted, setAccepted] = useState(false);

  const handleAccept = () => {
    if (accepted) {
      onAccept();
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div style={{
        maxWidth: '700px',
        width: '100%',
        margin: '0 auto'
      }}>
        {/* Auth Header */}
        <div style={{
          textAlign: 'center',
          marginBottom: '2rem'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.5rem'
          }}>
            <img 
              src="/logo/C5i name with Logo.svg" 
              alt="C5i Logo" 
              style={{
                height: '70px',
                width: 'auto',
                filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))'
              }}
            />
          </div>
          <h2 style={{
            fontSize: '2.25rem',
            fontWeight: '700',
            color: 'var(--white)',
            textAlign: 'center',
            marginBottom: '0.5rem',
            textShadow: '0 2px 4px rgba(0,0,0,0.3)'
          }}>
            Welcome to Incivus
          </h2>
          <p style={{
            color: 'rgba(255, 255, 255, 0.9)',
            textAlign: 'center',
            fontSize: '1.1rem',
            textShadow: '0 1px 2px rgba(0,0,0,0.2)'
          }}>
            Please review and accept our terms before continuing
          </p>
        </div>

        {/* Terms Card */}
        <div style={{
          background: 'var(--white)',
          borderRadius: '20px',
          padding: '2.5rem',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--text-dark)', marginBottom: '1rem' }}>Terms of Service</h3>
            <div style={{ color: 'var(--text-light)', fontSize: '0.875rem', lineHeight: '1.6' }}>
              <p><strong>1. Acceptance of Terms</strong></p>
              <p>By accessing and using Incivus, you accept and agree to be bound by the terms and provision of this agreement.</p>
              
              <p><strong>2. Use License</strong></p>
              <p>Permission is granted to temporarily download one copy of the materials (information or software) on Incivus's website for personal, non-commercial transitory viewing only.</p>
              
              <p><strong>3. Disclaimer</strong></p>
              <p>The materials on Incivus's website are provided on an 'as is' basis. Incivus makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.</p>
              
              <p><strong>4. Limitations</strong></p>
              <p>In no event shall Incivus or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on Incivus's website.</p>
              
              <p><strong>5. Privacy Policy</strong></p>
              <p>Your privacy is important to us. Our Privacy Policy explains how we collect, use, and protect your information when you use our service.</p>
              
              <p><strong>6. Shopify Integration</strong></p>
              <p>By using Incivus, you authorize us to access your Shopify store data for the purpose of providing our analysis services. We will only access data necessary for service delivery.</p>
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              color: 'var(--text-dark)',
              fontSize: '1rem',
              fontWeight: '500'
            }}>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                style={{
                  marginRight: '0.75rem',
                  transform: 'scale(1.3)',
                  accentColor: '#667eea'
                }}
              />
              I have read and agree to the Terms of Service and Privacy Policy
            </label>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={handleAccept}
              disabled={!accepted}
              style={{
                flex: 1,
                padding: '1rem 2rem',
                fontSize: '1rem',
                fontWeight: '600',
                background: accepted ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#e5e7eb',
                color: accepted ? 'var(--white)' : '#9ca3af',
                border: 'none',
                borderRadius: '12px',
                cursor: accepted ? 'pointer' : 'not-allowed',
                transition: 'all 0.3s ease',
                boxShadow: accepted ? '0 4px 15px rgba(102, 126, 234, 0.4)' : 'none'
              }}
              onMouseEnter={(e) => {
                if (accepted) {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)';
                }
              }}
              onMouseLeave={(e) => {
                if (accepted) {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
                }
              }}
            >
              Accept & Continue
            </button>
            
            <button
              onClick={onDecline}
              style={{
                flex: 1,
                padding: '1rem 2rem',
                fontSize: '1rem',
                fontWeight: '600',
                background: 'transparent',
                color: '#6b7280',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = '#ef4444';
                e.target.style.color = '#ef4444';
                e.target.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = '#e5e7eb';
                e.target.style.color = '#6b7280';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsAndConditions; 