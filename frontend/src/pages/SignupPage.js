import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Check } from 'lucide-react';
// MUI imports removed - using custom components instead
import { useAuth } from '../contexts/AuthContext';
import ENV_CONFIG from '../utils/environmentConfig';
import unifiedApi from '../utils/unifiedApiHelper';
import { 
  createSignupJSON, 
  sendSignupData, 
  saveSignupStateLocal,
  fetchUserData,
  sendToFirebaseViaJSON,
  createSignupFormData,
  sendSignupFormData,
  sendUserProfileToAPI,
  saveUserProfileToAPI
} from '../utils/jsonApiHelpers';
import MuiTextField from '../components/common/MuiTextField';
import MuiSelect from '../components/common/MuiSelect';

const SignupPage = ({ onSignupComplete }) => {
  const { currentUser } = useAuth();
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    username: '',
    companyName: '',
    companySize: '',
    designation: '',
    sector: '',
    customDesignation: '',
    customSector: ''
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [showCustomDesignation, setShowCustomDesignation] = useState(false);
  const [showCustomSector, setShowCustomSector] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  // Always use both API and Firebase - no user selection needed

  // Pre-fill form data if user came from Google OAuth or Email/Password
  useEffect(() => {
    const googleUser = localStorage.getItem('incivus_google_user');
    if (googleUser) {
      const userData = JSON.parse(googleUser);
      setIsGoogleUser(true);
      setFormData(prev => ({
        ...prev,
        fullName: userData.name || '',
        email: userData.email || '',
        username: userData.email?.split('@')[0] || ''
      }));
    } else if (currentUser) {
      // Handle email/password users - pre-fill email but keep all fields editable
      setIsGoogleUser(false);
      setFormData(prev => ({
        ...prev,
        email: currentUser.email || '',
        username: currentUser.email?.split('@')[0] || ''
      }));
      console.log('📝 Email/Password user detected, form fields are editable');
    }
  }, [currentUser]);

  const designationOptions = [
    'CEO/Founder',
    'VP of Marketing',
    'Director',
    'Manager',
    'Specialist',
    'Digital Marketing Manager',
    'Brand Manager',
    'Product Manager',
    'Business Development Manager',
    'Sales Director',
    'Proprietor'
  ];

  const sectorOptions = [
    'Technology',
    'Healthcare',
    'Financial Services',
    'E-commerce',
    'Manufacturing',
    'Education',
    'Real Estate',
    'Food & Beverage',
    'Fashion & Apparel',
    'Automotive',
    'Travel & Tourism',
    'Entertainment',
    'Non-profit',
    'Government',
    'Consulting',
    'Custom'
  ];

  const companySizeOptions = [
    '1-10 employees',
    '11-50 employees',
    '51-200 employees',
    '201-500 employees',
    '501-1000 employees',
    '1000+ employees'
  ];

  const handleBackToLogin = () => {
    // Clear Google user data and refresh to go back to login
    localStorage.removeItem('incivus_google_user');
    localStorage.removeItem('incivus_user_logged_in');
    window.location.reload();
  };

  const handleInputChange = (e) => {
    // Defensive check to prevent undefined errors
    if (!e || !e.target) {
      console.warn('⚠️ handleInputChange: Invalid event object', e);
      return;
    }
    
    const { name, value } = e.target;
    
    // Additional safety check
    if (!name) {
      console.warn('⚠️ handleInputChange: No name property in event target', e.target);
      return;
    }
    
    // Handle custom designation/sector logic
    if (name === 'designation') {
      if (value === 'Custom') {
        setShowCustomDesignation(true);
        return; // Don't update formData yet, let user type
      } else {
        setShowCustomDesignation(false);
      }
    }
    
    if (name === 'sector') {
      if (value === 'Custom') {
        setShowCustomSector(true);
        return; // Don't update formData yet, let user type
      } else {
        setShowCustomSector(false);
      }
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: value || ''
    }));
    
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.fullName.trim()) newErrors.fullName = 'Full name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email is invalid';
    if (!formData.username.trim()) newErrors.username = 'Username is required';
    
    // Password validation is now handled in the login page during signup mode
    
    if (!formData.companyName.trim()) newErrors.companyName = 'Company name is required';
    if (!formData.companySize) newErrors.companySize = 'Company size is required';
    if (!formData.designation.trim()) newErrors.designation = 'Designation is required';
    if (!formData.sector.trim()) newErrors.sector = 'Sector is required';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    
    try {
      // Get current user from Firebase Auth
      const userId = currentUser?.uid || localStorage.getItem('incivus_user_id');
      
      if (!userId) {
        throw new Error('No authenticated user found. Please login first.');
      }

      // Prepare user profile data
      const userProfileData = {
        fullName: formData.fullName,
        email: formData.email,
        username: formData.username,
        companyName: formData.companyName,
        companySize: formData.companySize,
        designation: formData.designation,
        sector: formData.sector,
        customDesignation: formData.designation === 'Custom' ? formData.customDesignation : null,
        customSector: formData.sector === 'Custom' ? formData.customSector : null,
        authProvider: isGoogleUser ? 'google' : 'email',
        isGoogleUser: isGoogleUser,
        phoneNumber: currentUser?.phoneNumber || null,
        photoURL: currentUser?.photoURL || null,
        isEmailVerified: currentUser?.emailVerified || false,
        metadata: {
          formVersion: '2.0',
          submissionTime: new Date().toISOString(),
          browserInfo: {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform
          }
        }
      };

      // Try to send to FastAPI but don't block on failure
      console.log('🌐 Attempting to send user profile to FastAPI...');
              fetch(`${ENV_CONFIG.PYTHON_API_URL}/UserProfileDetails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId,
          timestamp: new Date().toISOString(),
          userProfile: userProfileData,
          metadata: userProfileData.metadata
        })
      }).then(response => {
        if (!response.ok) throw new Error('API response was not ok');
        return response.json();
      }).then(data => {
        console.log('✅ User Profile API success:', data);
      }).catch(error => {
        console.log('⚠️ FastAPI server not available - continuing flow:', error.message);
      });
      
      // Immediately proceed with the flow
      localStorage.setItem('incivus_user_profile_complete', 'true');
      localStorage.setItem('incivus_user_profile', JSON.stringify({
        ...formData,
        userId: userId,
        profileSaved: true
      }));
      
      // Show success message briefly before redirecting
      setFormSubmitted(true);
      
      // Move to next page immediately
      if (onSignupComplete) {
        onSignupComplete({
          ...formData,
          userId: userId,
          profileSaved: true,
          apiMethod: 'user_profile_api'
        });
      }
      
    } catch (error) {
      console.error('❌ Signup error:', error);
      setErrors({ 
        submit: error.message || 'Failed to save registration data. Please try again.' 
      });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-container" style={{
      background: 'linear-gradient(135deg, var(--primary-purple) 0%, var(--secondary-purple) 100%)',
      position: 'relative',
      minHeight: '100vh',
      overflow: 'auto',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: '2rem',
      paddingBottom: '2rem'
    }}>
      {/* Accent Elements for Signup Page */}
      <div style={{
        position: 'absolute',
        top: '10%',
        right: '15%',
        width: '120px',
        height: '120px',
        background: 'radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.05) 70%)',
        borderRadius: '50%',
        filter: 'blur(50px)',
        animation: 'pulse 5s ease-in-out infinite'
      }}></div>
      <div style={{
        position: 'absolute',
        bottom: '15%',
        left: '10%',
        width: '90px',
        height: '90px',
        background: 'radial-gradient(circle, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 70%)',
        borderRadius: '50%',
        filter: 'blur(40px)',
        animation: 'floatSlow 7s ease-in-out infinite'
      }}></div>
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '5%',
        width: '70px',
        height: '70px',
        background: 'radial-gradient(circle, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 70%)',
        borderRadius: '50%',
        filter: 'blur(35px)',
        animation: 'float 8s ease-in-out infinite'
      }}></div>

      <div style={{
        maxWidth: '500px',
        width: '100%',
        margin: '0 auto',
        padding: '0.5rem',
        position: 'relative',
        zIndex: 2
      }}>
        
        {/* Back to Login Button */}
        <div style={{ marginBottom: '1.5rem' }}>
          <button
            type="button"
            onClick={handleBackToLogin}
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.15))',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              padding: '0.75rem 1.25rem',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.3s ease',
              fontWeight: '500',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-1px)';
              e.target.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0px)';
              e.target.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.05)';
            }}
          >
            ← Back to Login
          </button>
        </div>

        {/* Authentication Method Banner */}
        {isGoogleUser ? (
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.15))',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: 'white',
            padding: '1rem',
            borderRadius: '16px',
            textAlign: 'center',
            marginBottom: '1.5rem',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ fontSize: '1.1rem', fontWeight: '500' }}>
              ✓ Signed in with Google
            </div>
            <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
              {formData.email}
            </div>
          </div>
        ) : currentUser && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.15))',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: 'white',
            padding: '1rem',
            borderRadius: '16px',
            textAlign: 'center',
            marginBottom: '1.5rem',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ fontSize: '1.1rem', fontWeight: '500' }}>
              ✓ Signed up with Email/Password
            </div>
            <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
              {formData.email} - All fields are editable
            </div>
          </div>
        )}
        

        
        <div style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.9) 100%)',
          backdropFilter: 'blur(30px)',
          borderRadius: '24px',
          padding: '1.5rem',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3), 0 8px 32px rgba(0, 0, 0, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Subtle accent inside form */}
          <div style={{
            position: 'absolute',
            top: '-20px',
            right: '-20px',
            width: '80px',
            height: '80px',
            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.05), rgba(168, 85, 247, 0.02))',
            borderRadius: '50%',
            filter: 'blur(30px)'
          }}></div>
          
          {/* Header with C5i Logo INSIDE WHITE CARD */}
          <div style={{ 
            textAlign: 'center', 
            marginBottom: '2rem', 
            position: 'relative', 
            zIndex: 3,
            paddingTop: '1.5rem',
            paddingBottom: '1rem',
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '20px',
            marginBottom: '1.5rem',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)'
          }}>
            {/* C5i Logo - CLEARLY VISIBLE */}
            <div style={{ marginBottom: '1.5rem' }}>
              <img 
                src="/logo/C5i name with Logo.svg" 
                alt="C5i Logo" 
                style={{
                  height: '60px',
                  width: 'auto',
                  filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.2))',
                  transition: 'all 0.3s ease',
                  maxWidth: '100%',
                  display: 'block',
                  margin: '0 auto'
                }}
                onError={(e) => {
                  console.log('Logo failed to load, trying fallback');
                  e.target.src = '/logo.svg';
                }}
                onLoad={() => {
                  console.log('C5i Logo loaded successfully');
                }}
              />
            </div>
            <h1 style={{
              fontSize: '1.75rem',
              fontWeight: '700',
              color: 'var(--text-dark)',
              marginBottom: '0.75rem',
              letterSpacing: '-0.01em'
            }}>
              🎯 Get Instant Ad Insights
            </h1>
            <p style={{
              color: 'var(--text-light)',
              fontSize: '1rem',
              lineHeight: '1.5',
              marginBottom: '1rem'
            }}>
              Complete your profile to unlock advanced Ad analysis
            </p>
            
            {/* Value proposition highlight */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(124, 58, 237, 0.05))',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '0.5rem'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem'
              }}>
                <span style={{ 
                  fontSize: '0.9rem', 
                  fontWeight: '600', 
                  color: '#6b21a8' 
                }}>
                  🚀 You're seconds away from:
                </span>
                <span style={{ 
                  fontSize: '0.75rem', 
                  background: 'rgba(34, 197, 94, 0.1)',
                  color: '#15803d',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '6px',
                  fontWeight: '600'
                }}>
    
                </span>
              </div>
              
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.5rem', 
                marginBottom: '1.5rem' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{ color: '#10b981' }}>✓</span>
                    <span>Brand Compliance</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{ color: '#10b981' }}>✓</span>
                    <span>Advanced messaging insights</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{ color: '#10b981' }}>✓</span>
                    <span>Purchase Intent</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{ color: '#10b981' }}>✓</span>
                    <span>Channel Compliance & More</span>
                  </div>
              </div>
            </div>
          </div>
          
          <div style={{ paddingTop: '0rem' }}>
            <form onSubmit={handleSubmit}>
            {/* Submit Error Display */}
            {errors.submit && (
              <div style={{
                padding: '1rem',
                backgroundColor: '#fee',
                border: '1px solid #fcc',
                borderRadius: '4px',
                marginBottom: '1.5rem',
                color: '#d32f2f',
                fontSize: '0.9rem'
              }}>
                ❌ {errors.submit}
              </div>
            )}

            {/* Full Name */}
            <div style={{ marginBottom: '1.5rem' }}>
              <MuiTextField
                label="Full Name"
                name="fullName"
                value={formData.fullName}
                onChange={handleInputChange}
                type="text"
                placeholder="Enter your full name"
                required={true}
                error={errors.fullName}
                helperText="Your complete name as it should appear on documents"
                isGoogleUser={isGoogleUser}
              />
            </div>

            {/* Email */}
            <div style={{ marginBottom: '1.5rem' }}>
              <MuiTextField
                label="Email Address"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                type="email"
                placeholder="Enter your email address"
                required={true}
                readonly={false}
                disabled={false}
                error={errors.email}
                helperText="We'll use this email for account verification and communication"
                isGoogleUser={isGoogleUser}
              />
            </div>

            {/* Username */}
            <div style={{ marginBottom: '1.5rem' }}>
              <MuiTextField
                label="Username"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                type="text"
                placeholder="Enter your username"
                required={true}
                error={errors.username}
                helperText="Choose a unique username for your account"
                isGoogleUser={isGoogleUser}
              />
            </div>

            {/* Password fields removed - now handled in login page during signup */}

            {/* Company Name */}
            <div style={{ marginBottom: '1.5rem' }}>
              <MuiTextField
                label="Company Name"
                name="companyName"
                value={formData.companyName}
                onChange={handleInputChange}
                type="text"
                placeholder="Enter your company name"
                required={true}
                error={errors.companyName}
                helperText="The organization you work for or represent"
                isGoogleUser={false}
              />
            </div>

            {/* Company Size */}
            <div style={{ marginBottom: '1.5rem' }}>
              <MuiSelect
                label="Company Size"
                name="companySize"
                value={formData.companySize}
                onChange={handleInputChange}
                options={companySizeOptions}
                required={true}
                error={errors.companySize}
                helperText="Select the size of your organization"
                placeholder=""
                isGoogleUser={false}
              />
            </div>

            {/* Designation */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '500',
                color: 'var(--text-dark)'
              }}>
                Designation *
              </label>
              {showCustomDesignation ? (
                <input
                  type="text"
                  name="designation"
                  value={formData.designation}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.875rem 1rem',
                    border: errors.designation ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '12px',
                    fontSize: '0.875rem',
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.5))',
                    backdropFilter: 'blur(10px)',
                    transition: 'all 0.3s ease',
                    color: 'var(--text-dark)'
                  }}
                  placeholder="Enter your custom designation"
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--primary-purple)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(124, 58, 237, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = errors.designation ? '#ef4444' : 'rgba(255, 255, 255, 0.3)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              ) : (
                <select
                  name="designation"
                  value={formData.designation}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.875rem 1rem',
                    border: errors.designation ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '12px',
                    fontSize: '0.875rem',
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.5))',
                    backdropFilter: 'blur(10px)',
                    transition: 'all 0.3s ease',
                    color: 'var(--text-dark)'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--primary-purple)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(124, 58, 237, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = errors.designation ? '#ef4444' : 'rgba(255, 255, 255, 0.3)';
                    e.target.style.boxShadow = 'none';
                  }}
                >
                  <option value="">Select designation</option>
                  {designationOptions.map(designation => (
                    <option key={designation} value={designation}>{designation}</option>
                  ))}
                </select>
              )}
              {errors.designation && (
                <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                  {errors.designation}
                </p>
              )}
            </div>

            {/* Sector */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '500',
                color: 'var(--text-dark)'
              }}>
                Sector *
              </label>
              {showCustomSector ? (
                <input
                  type="text"
                  name="sector"
                  value={formData.sector}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.875rem 1rem',
                    border: errors.sector ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '12px',
                    fontSize: '0.875rem',
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.5))',
                    backdropFilter: 'blur(10px)',
                    transition: 'all 0.3s ease',
                    color: 'var(--text-dark)'
                  }}
                  placeholder="Enter your custom sector"
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--primary-purple)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(124, 58, 237, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = errors.sector ? '#ef4444' : 'rgba(255, 255, 255, 0.3)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              ) : (
                <select
                  name="sector"
                  value={formData.sector}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.875rem 1rem',
                    border: errors.sector ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '12px',
                    fontSize: '0.875rem',
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.5))',
                    backdropFilter: 'blur(10px)',
                    transition: 'all 0.3s ease',
                    color: 'var(--text-dark)'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--primary-purple)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(124, 58, 237, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = errors.sector ? '#ef4444' : 'rgba(255, 255, 255, 0.3)';
                    e.target.style.boxShadow = 'none';
                  }}
                >
                  <option value="">Select sector</option>
                  {sectorOptions.map(sector => (
                    <option key={sector} value={sector}>{sector}</option>
                  ))}
                </select>
              )}
              {errors.sector && (
                <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                  {errors.sector}
                </p>
              )}
            </div>





            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: '100%',
                background: isSubmitting ? 'var(--primary-purple)' : 'linear-gradient(135deg, var(--primary-purple), var(--secondary-purple))',
                color: 'white',
                padding: '0.875rem',
                border: 'none',
                borderRadius: '12px',
                boxShadow: '0 8px 24px rgba(124, 58, 237, 0.3)',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                opacity: isSubmitting ? 0.7 : 1
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 12px 32px rgba(124, 58, 237, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) {
                  e.target.style.transform = 'translateY(0px)';
                  e.target.style.boxShadow = '0 8px 24px rgba(124, 58, 237, 0.3)';
                }
              }}
            >
              {isSubmitting ? (
                <>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    border: '2px solid #ffffff',
                    borderTop: '2px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  Creating Account...
                </>
              ) : (
                <>
                  <Check size={20} />
                  Complete Registration
                </>
              )}
            </button>
          </form>
          </div>

          {/* Simple Success Message */}
          {formSubmitted && (
            <div style={{
              marginTop: '2rem',
              padding: '1.5rem',
              background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.25), rgba(67, 160, 71, 0.15))',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(76, 175, 80, 0.3)',
              borderRadius: '16px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
              textAlign: 'center'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                marginBottom: '1rem'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  background: 'linear-gradient(135deg, #4caf50, #43a047)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem'
                }}>
                  ✅
                </div>
                <div>
                  <h3 style={{
                    color: 'white',
                    fontSize: '1.25rem',
                    fontWeight: '700',
                    marginBottom: '0.25rem'
                  }}>
                    Registration Successful!
                  </h3>
                  <p style={{
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: '0.875rem',
                    margin: 0
                  }}>
                    Redirecting to your dashboard...
                  </p>
                </div>
              </div>
              
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '20px',
                color: 'rgba(255, 255, 255, 0.9)',
                fontSize: '0.875rem'
              }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid transparent',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                Processing...
              </div>
            </div>
          )}

          {/* Sign In Link - Removed as requested */}
        </div>
      </div>
    </div>
  );
};

export default SignupPage; 