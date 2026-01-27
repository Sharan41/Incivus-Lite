import React from 'react';

const UploadOptimizer = ({ onOptimizationChange }) => {
  return (
    <div style={{ marginBottom: '2rem' }}>
      {/* Upload Tips Card */}
      <div style={{
        background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
        padding: '1.5rem',
        borderRadius: '12px',
        color: 'white',
        position: 'relative'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <h4 style={{
            fontSize: '1.125rem',
            fontWeight: '600',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            Upload Tips for Better Performance
          </h4>
        </div>
        
        <div style={{ fontSize: '0.875rem', lineHeight: '1.6' }}>
          <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
            <li style={{ marginBottom: '0.5rem' }}>Use PNG for logos with transparency</li>
            <li style={{ marginBottom: '0.5rem' }}>Use JPG for photos and complex images</li>
            <li style={{ marginBottom: '0.5rem' }}>Keep files under 2MB for faster upload</li>
            <li style={{ marginBottom: '0.5rem' }}>SVG files are uploaded without compression</li>
            <li style={{ marginBottom: '0.5rem' }}>Multiple small files upload faster than few large files</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default UploadOptimizer;