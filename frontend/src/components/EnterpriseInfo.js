import React from 'react';
import { ExternalLink, Crown, Star, Shield, Zap } from 'lucide-react';

const EnterpriseInfo = () => {
  return (
    <div style={{
      background: 'white',
      border: '2px solid #f59e0b',
      borderRadius: '12px',
      padding: '2rem',
      marginBottom: '2rem'
    }}>
      <div style={{
        textAlign: 'center',
        marginBottom: '2rem'
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '80px',
          height: '80px',
          background: '#f59e0b20',
          borderRadius: '50%',
          marginBottom: '1rem'
        }}>
          <Crown size={40} color="#f59e0b" />
        </div>
        <h3 style={{
          fontSize: '1.8rem',
          fontWeight: 'bold',
          color: '#f59e0b',
          marginBottom: '0.5rem'
        }}>
          Enterprise Solutions
        </h3>
        <p style={{
          color: '#6c757d',
          fontSize: '1.1rem',
          marginBottom: '1.5rem'
        }}>
          Tailored for large organizations with custom requirements
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <div style={{
          background: '#f8f9fa',
          padding: '1.5rem',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <Shield size={24} color="#f59e0b" style={{ marginBottom: '0.5rem' }} />
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#2c3e50' }}>White-label Options</h4>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#6c757d' }}>
            Custom branding and domain options
          </p>
        </div>

        <div style={{
          background: '#f8f9fa',
          padding: '1.5rem',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <Zap size={24} color="#f59e0b" style={{ marginBottom: '0.5rem' }} />
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#2c3e50' }}>API Access</h4>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#6c757d' }}>
            Full API integration capabilities
          </p>
        </div>

        <div style={{
          background: '#f8f9fa',
          padding: '1.5rem',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <Star size={24} color="#f59e0b" style={{ marginBottom: '0.5rem' }} />
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#2c3e50' }}>Dedicated Support</h4>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#6c757d' }}>
            Priority support with dedicated account manager
          </p>
        </div>
      </div>

      <div style={{
        background: '#fff3cd',
        border: '1px solid #ffeaa7',
        borderRadius: '8px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        textAlign: 'center'
      }}>
        <h4 style={{ margin: '0 0 0.5rem 0', color: '#856404' }}>
          🚀 Get Started with Enterprise
        </h4>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#856404' }}>
          Contact our enterprise team to discuss your specific requirements and get a custom quote.
        </p>
        <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>
          ✓ Volume discounts available<br/>
          ✓ Custom features development<br/>
          ✓ On-premise deployment options
        </div>
      </div>
    </div>
  );
};

export default EnterpriseInfo;