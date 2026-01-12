import React, { useState } from 'react';

const MuiSelect = ({
  label,
  name,
  value,
  onChange,
  options = [],
  required = false,
  disabled = false,
  error = null,
  helperText = '',
  placeholder = '',
  isGoogleUser = false,
  onShowCustom = null,
  ...props
}) => {
  const selectId = `select-${name}`;
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const handleChange = (event) => {
    // Defensive check to prevent undefined errors
    if (!event || !event.target) {
      console.warn('⚠️ MuiSelect handleChange: Invalid event object', event);
      return;
    }
    
    const selectedValue = event.target.value;
    
    // Handle the "Custom" option
    if (selectedValue === 'Custom' && onShowCustom) {
      onShowCustom(true);
    } else if (onShowCustom) {
      onShowCustom(false);
    }
    
    // Ensure onChange is a function before calling it
    if (typeof onChange === 'function') {
      onChange(event);
    } else {
      console.warn('⚠️ MuiSelect handleChange: onChange is not a function', onChange);
    }
  };

  return (
    <div style={{ width: '100%' }}>
      <label 
        htmlFor={selectId}
        style={{
          display: 'block',
          marginBottom: '0.5rem',
          fontWeight: '500',
          fontSize: '0.875rem',
          color: 'var(--text-dark)',
        }}
      >
        {label}{required ? ' *' : ''}
      </label>
      
      <select
        id={selectId}
        name={name}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        required={required}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '0.875rem 1rem',
          border: error 
            ? '1px solid #ef4444' 
            : isFocused 
              ? '1px solid var(--primary-purple)' 
              : '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '12px',
          fontSize: '0.875rem',
          background: isGoogleUser 
            ? 'linear-gradient(135deg, rgba(248, 250, 252, 0.7), rgba(248, 250, 252, 0.5))'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.5))',
          backdropFilter: 'blur(10px)',
          transition: 'all 0.3s ease',
          color: 'var(--text-dark)',
          opacity: isGoogleUser ? 0.8 : 1,
          boxShadow: isFocused ? '0 0 0 3px rgba(124, 58, 237, 0.1)' : 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        {...props}
      >
        <option value="">{placeholder || `Select ${label.toLowerCase()}`}</option>
        {options.map((option, index) => (
          <option key={index} value={option}>
            {option}
          </option>
        ))}
      </select>
      
      {(error || helperText) && (
        <div
          style={{
            color: error ? '#ef4444' : 'var(--text-light)',
            fontSize: '0.875rem',
            marginTop: '0.25rem',
          }}
        >
          {error || helperText}
        </div>
      )}
    </div>
  );
};

export default MuiSelect;