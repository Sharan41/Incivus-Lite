import React from 'react';
import { Brain, BarChart3, CheckCircle, Clock, Zap } from 'lucide-react';

const LoadingStates = ({ 
  isLoading = false, 
  progress = 0, 
  stage = 'Starting analysis...', 
  estimatedTime = '2-3 minutes',
  compact = false 
}) => {
  
  const getStageIcon = (currentStage) => {
    if (currentStage.includes('Starting') || currentStage.includes('Uploading')) {
      return <Clock size={20} className="animate-spin" />;
    }
    if (currentStage.includes('Processing') || currentStage.includes('Analyzing')) {
      return <Brain size={20} className="animate-pulse" />;
    }
    if (currentStage.includes('Generating') || currentStage.includes('Creating')) {
      return <BarChart3 size={20} className="animate-bounce" />;
    }
    if (currentStage.includes('Complete') || currentStage.includes('Done')) {
      return <CheckCircle size={20} color="#10b981" />;
    }
    return <Zap size={20} className="animate-pulse" />;
  };

  const getProgressColor = (progress) => {
    if (progress < 30) return '#ef4444'; // Red
    if (progress < 70) return '#f59e0b'; // Yellow
    return '#10b981'; // Green
  };

  if (!isLoading) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      borderRadius: '16px',
      padding: compact ? '1.5rem' : '2rem',
      color: 'white',
      textAlign: 'center',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(10px)',
      margin: '1rem 0'
    }}>
      {/* Main Loading Animation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        {getStageIcon(stage)}
        <h3 style={{
          fontSize: compact ? '1.1rem' : '1.25rem',
          fontWeight: '600',
          margin: 0
        }}>
          AI Analysis in Progress
        </h3>
      </div>

      {/* Progress Bar */}
      <div style={{
        width: '100%',
        height: '8px',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: '4px',
        overflow: 'hidden',
        marginBottom: '1rem'
      }}>
        <div style={{
          height: '100%',
          width: `${Math.max(5, progress)}%`, // Minimum 5% for visibility
          background: `linear-gradient(90deg, ${getProgressColor(progress)}, ${getProgressColor(progress)}dd)`,
          borderRadius: '4px',
          transition: 'width 0.5s ease',
          boxShadow: '0 0 10px rgba(255, 255, 255, 0.3)'
        }} />
      </div>

      {/* Progress Info */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.9rem',
        opacity: 0.9
      }}>
        <span>{stage}</span>
        <span>{progress}%</span>
      </div>

      {/* Estimated Time */}
      {estimatedTime && (
        <div style={{
          marginTop: '1rem',
          fontSize: '0.8rem',
          opacity: 0.7,
          fontStyle: 'italic'
        }}>
          Estimated time: {estimatedTime}
        </div>
      )}

      {/* Analysis Steps Indicator */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '0.5rem',
        marginTop: '1.5rem'
      }}>
        {['Upload', 'Process', 'Analyze', 'Generate'].map((step, index) => {
          const stepProgress = (index + 1) * 25;
          const isActive = progress >= stepProgress - 25;
          const isComplete = progress >= stepProgress;
          
          return (
            <div
              key={step}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: isComplete 
                  ? '#10b981' 
                  : isActive 
                    ? '#f59e0b' 
                    : 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                fontWeight: '600',
                transition: 'all 0.3s ease',
                transform: isActive ? 'scale(1.1)' : 'scale(1)'
              }}>
                {isComplete ? '✓' : index + 1}
              </div>
              <span style={{
                fontSize: '0.7rem',
                opacity: isActive ? 1 : 0.6,
                fontWeight: isActive ? '600' : '400'
              }}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Skeleton Loading Component for Score Cards
export const ScoreCardSkeleton = ({ count = 6, compact = false }) => {
  return (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: compact ? 'repeat(auto-fit, minmax(280px, 1fr))' : 'repeat(auto-fit, minmax(350px, 1fr))',
      gap: '1.5rem',
      marginBottom: '2rem'
    }}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          style={{
            background: '#f8fafc',
            padding: compact ? '1.5rem' : '2rem',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            minHeight: compact ? '250px' : '300px',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* Shimmer Effect */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: '-100%',
            width: '100%',
            height: '100%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
            animation: 'shimmer 1.5s infinite'
          }} />
          
          {/* Skeleton Content */}
          <div style={{
            height: '20px',
            backgroundColor: '#e2e8f0',
            borderRadius: '4px',
            marginBottom: '1rem',
            width: '70%'
          }} />
          
          <div style={{
            height: '40px',
            backgroundColor: '#e2e8f0',
            borderRadius: '4px',
            marginBottom: '1rem',
            width: '40%'
          }} />
          
          <div style={{
            height: '12px',
            backgroundColor: '#e2e8f0',
            borderRadius: '4px',
            marginBottom: '0.5rem',
            width: '90%'
          }} />
          
          <div style={{
            height: '12px',
            backgroundColor: '#e2e8f0',
            borderRadius: '4px',
            marginBottom: '0.5rem',
            width: '75%'
          }} />
          
          <div style={{
            height: '12px',
            backgroundColor: '#e2e8f0',
            borderRadius: '4px',
            width: '85%'
          }} />
        </div>
      ))}
    </div>
  );
};

// Add CSS animation for shimmer effect
const shimmerCSS = `
@keyframes shimmer {
  0% { left: -100%; }
  100% { left: 100%; }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.animate-bounce {
  animation: bounce 1s infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(-25%);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  50% {
    transform: translateY(0);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
}
`;

// Inject CSS if not already present
if (typeof document !== 'undefined' && !document.getElementById('loading-states-css')) {
  const style = document.createElement('style');
  style.id = 'loading-states-css';
  style.textContent = shimmerCSS;
  document.head.appendChild(style);
}

export default LoadingStates;
