import React from 'react';

const CustomAlert = ({ 
  open, 
  onClose, 
  title, 
  message, 
  severity = 'info', // 'success', 'error', 'warning', 'info'
  actions = []
}) => {
  if (!open) return null;

  const getSeverityStyles = () => {
    switch (severity) {
      case 'success':
        return {
          background: '#f0f9ff',
          border: '1px solid #0ea5e9',
          icon: '✅',
          titleColor: '#0c4a6e'
        };
      case 'error':
        return {
          background: '#fef2f2',
          border: '1px solid #ef4444',
          icon: '❌',
          titleColor: '#7f1d1d'
        };
      case 'warning':
        return {
          background: '#fffbeb',
          border: '1px solid #f59e0b',
          icon: '⚠️',
          titleColor: '#92400e'
        };
      default:
        return {
          background: '#f8fafc',
          border: '1px solid #64748b',
          icon: 'ℹ️',
          titleColor: '#334155'
        };
    }
  };

  const styles = getSeverityStyles();

  return (
    <div 
      className="alert-container"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '8vh',
        zIndex: 9999,
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideIn {
            from { 
              opacity: 0;
              transform: translateY(-40px) scale(0.9);
            }
            to { 
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @media (max-width: 768px) {
            .alert-container {
              padding-top: 5vh !important;
              padding-left: 1rem !important;
              padding-right: 1rem !important;
            }
          }
        `}
      </style>
      <div style={{
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        border: `2px solid ${styles.border.split(' ')[2]}`,
        borderRadius: '16px',
        padding: '2rem',
        maxWidth: '450px',
        width: '90%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.8)',
        animation: 'slideIn 0.3s ease-out',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Decorative gradient bar */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: `linear-gradient(90deg, ${styles.border.split(' ')[2]}, ${styles.titleColor})`
        }} />
        
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{
            fontSize: '2rem',
            marginRight: '1rem',
            background: styles.background,
            padding: '0.5rem',
            borderRadius: '12px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}>
            {styles.icon}
          </div>
          <h3 style={{ 
            margin: 0, 
            color: styles.titleColor, 
            fontSize: '1.25rem',
            fontWeight: '700',
            letterSpacing: '-0.025em'
          }}>
            {title}
          </h3>
        </div>
        
        <p style={{ 
          margin: '0 0 2rem 0', 
          color: '#4b5563',
          lineHeight: '1.6',
          fontSize: '0.95rem',
          whiteSpace: 'pre-line'
        }}>
          {message}
        </p>
        
        <div style={{ 
          display: 'flex', 
          gap: '0.75rem', 
          justifyContent: 'flex-end'
        }}>
          {actions.length > 0 ? (
            actions.map((action, index) => (
              <button
                key={index}
                onClick={action.onClick}
                style={{
                  padding: '0.75rem 1.5rem',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  minWidth: '80px',
                  ...action.style
                }}
                onMouseOver={(e) => {
                  e.target.style.transform = 'translateY(-1px)';
                  e.target.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
                }}
                onMouseOut={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                }}
              >
                {action.label}
              </button>
            ))
          ) : (
            <button
              onClick={onClose}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#7c3aed',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(124, 58, 237, 0.3)',
                minWidth: '80px'
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = '#6d28d9';
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 4px 8px rgba(124, 58, 237, 0.4)';
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = '#7c3aed';
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 2px 4px rgba(124, 58, 237, 0.3)';
              }}
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomAlert; 