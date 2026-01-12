import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const MuiTextField = ({
  label,
  name,
  value,
  onChange,
  onFocus,
  onBlur,
  type = 'text',
  placeholder,
  required = false,
  disabled = false,
  readonly = false,
  error = null,
  helperText = '',
  showPassword = false,
  onTogglePassword = null,
  isGoogleUser = false,
  ...props
}) => {
  const inputId = `input-${name}`;
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = (e) => {
    setIsFocused(true);
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e) => {
    setIsFocused(false);
    if (onBlur) onBlur(e);
  };

  return (
    <div style={{ width: '100%' }}>
      <label 
        htmlFor={inputId}
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
      
      <div style={{ position: 'relative' }}>
        <input
          id={inputId}
          name={name}
          value={value}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          type={type === 'password' ? (showPassword ? 'text' : 'password') : type}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          readOnly={readonly}
          style={{
            width: '100%',
            padding: '0.875rem 1rem',
            paddingRight: type === 'password' && onTogglePassword ? '3rem' : '1rem',
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
          }}
          {...props}
        />
        
        {type === 'password' && onTogglePassword && (
          <button
            type="button"
            onClick={onTogglePassword}
            style={{
              position: 'absolute',
              right: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-light)',
              padding: '0.25rem',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = 'rgba(124, 58, 237, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        )}
      </div>
      
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

export default MuiTextField;