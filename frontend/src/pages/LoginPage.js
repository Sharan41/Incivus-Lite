import React, { useState } from 'react';
import { Eye, EyeOff, Loader } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const LoginPage = ({ onLoginSuccess }) => {
  const { 
    loginWithGoogle, 
    loginWithEmailPassword,
    signUpWithEmailPassword,
    sendEmailSignInLink,
    completeEmailSignIn,
    sendPasswordResetEmail,
    isEmailLink,
    error: authError,
    clearError 
  } = useAuth();
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const [userInput, setUserInput] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(null);
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [showEmailLinkLogin, setShowEmailLinkLogin] = useState(false);
  const [emailLinkSent, setEmailLinkSent] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Generate a simple captcha
  const generateCaptcha = () => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Initialize captcha on component mount
  React.useEffect(() => {
    setCaptcha(generateCaptcha());
  }, []);

  // Handle window resize for responsive design
  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check for email link authentication on component mount
  React.useEffect(() => {
    const handleEmailLinkSignIn = async () => {
      if (isEmailLink(window.location.href)) {
        console.log('🔗 Email link detected, attempting sign-in...');
        
        try {
          setLoading(true);
          
          // Get email from localStorage or prompt user
          let email = localStorage.getItem('emailForSignIn');
          if (!email) {
            email = window.prompt('Please provide your email for confirmation');
          }
          
          if (email) {
            const result = await completeEmailSignIn(email);
            if (result && onLoginSuccess) {
              onLoginSuccess(result.user, result);
            }
          }
        } catch (error) {
          console.error('❌ Email link sign-in error:', error);
          setErrors({
            email: 'Failed to sign in with email link. Please try again or use password login.'
          });
        } finally {
          setLoading(false);
        }
      }
    };

    handleEmailLinkSignIn();
  }, [isEmailLink, completeEmailSignIn, onLoginSuccess]);

  // Dynamic password validation for signup mode
  React.useEffect(() => {
    if (isSignUpMode && formData.password && formData.confirmPassword) {
      if (formData.password !== formData.confirmPassword) {
        setErrors(prev => ({
          ...prev,
          confirmPassword: 'Passwords do not match'
        }));
      } else {
        setErrors(prev => ({
          ...prev,
          confirmPassword: ''
        }));
      }
    }
  }, [formData.password, formData.confirmPassword, isSignUpMode]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
    // Clear auth errors
    if (authError) {
      clearError();
    }
  };

  const handleCaptchaChange = (e) => {
    setUserInput(e.target.value);
    if (errors.captcha) {
      setErrors(prev => ({
        ...prev,
        captcha: ''
      }));
    }
  };

  const refreshCaptcha = () => {
    setCaptcha(generateCaptcha());
    setUserInput('');
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (isSignUpMode && formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    // Confirm password validation for signup mode
    if (isSignUpMode) {
      if (!formData.confirmPassword) {
        newErrors.confirmPassword = 'Please confirm your password';
      } else if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    if (userInput.toUpperCase() !== captcha) {
      newErrors.captcha = 'Captcha verification failed';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validateForm()) {
      setLoading(true);
      try {
        let result;
        if (isSignUpMode) {
          result = await signUpWithEmailPassword(formData.email, formData.password);
          console.log('✅ Account created successfully:', result.user?.email);
        } else {
          result = await loginWithEmailPassword(formData.email, formData.password);
        }
        
        if (result && onLoginSuccess) {
          onLoginSuccess(result.user, result);
        }
      } catch (error) {
        console.error(`${isSignUpMode ? 'Sign up' : 'Login'} error:`, error);
        
        // Handle specific Firebase auth errors
        if (error.code === 'auth/email-already-in-use') {
          setErrors({
            email: 'This email is already registered. Try signing in instead, or use "Continue with Google" if you signed up with Google.'
          });
        } else if (error.code === 'auth/invalid-credential') {
          setErrors({
            password: 'Invalid email or password. Please check your credentials and try again.'
          });
          setShowPasswordReset(true);
          
          // Provide helpful information for new users
          console.log('❓ LOGIN HELP:');
          console.log('1. If you\'re a NEW USER: Click "Create New Account" button at the bottom');
          console.log('2. If you signed up with GOOGLE: Click "Continue with Google" instead');
          console.log('3. If you forgot your password: Use the "Reset Password" link that appeared');
          console.log('4. Make sure your email and password are entered correctly');
          
        } else if (error.code === 'auth/user-not-found') {
          setErrors({
            email: 'No account found with this email. Please sign up first or check your email address.'
          });
        } else if (error.code === 'auth/wrong-password') {
          setErrors({
            password: 'Incorrect password. Please try again or reset your password.'
          });
          setShowPasswordReset(true);
        } else if (error.code === 'auth/too-many-requests') {
          setErrors({
            password: 'Too many failed login attempts. Please try again later or reset your password.'
          });
          setShowPasswordReset(true);
        } else {
          // Generic error handling
          setErrors({
            password: `Authentication failed: ${error.message || 'Please try again'}`
          });
        }
      } finally {
        setLoading(false);
      }
    }
  };

  const handlePasswordReset = async () => {
    if (!formData.email.trim()) {
      setErrors({ email: 'Please enter your email address first' });
      return;
    }

    try {
      setLoading(true);
      await sendPasswordResetEmail(formData.email);
      setResetEmailSent(true);
      setShowPasswordReset(false);
      console.log('✅ Password reset email sent to:', formData.email);
    } catch (error) {
      console.error('❌ Password reset error:', error);
      if (error.code === 'auth/user-not-found') {
        setErrors({
          email: 'No account found with this email. Try "Continue with Google" or create a new account.'
        });
      } else {
        setErrors({
          email: 'Failed to send password reset email. Please try again.'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLinkLogin = async () => {
    if (!formData.email.trim()) {
      setErrors({ email: 'Please enter your email address first' });
      return;
    }

    try {
      setLoading(true);
      await sendEmailSignInLink(formData.email);
      setEmailLinkSent(true);
      setShowEmailLinkLogin(false);
      console.log('✅ Sign-in link sent to:', formData.email);
    } catch (error) {
      console.error('❌ Email link error:', error);
      if (error.code === 'auth/user-not-found') {
        setErrors({
          email: 'No account found with this email. Try creating a new account first.'
        });
      } else {
        setErrors({
          email: 'Failed to send sign-in link. Please try again.'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider) => {
    setSocialLoading(provider);
    try {
      let result;
      if (provider === 'google') {
        result = await loginWithGoogle();
      } else {
        throw new Error('Unknown provider');
      }
      
      if (result) {
        // Pass the enhanced result with user existence information
        if (onLoginSuccess) {
          onLoginSuccess(result.user, result);
        }
      }
    } catch (error) {
      console.error(`${provider} login error:`, error);
      alert(`${provider} Sign-in Error: ${error.message}\n\nPlease complete the Google Cloud Console setup as described in FIREBASE_SETUP.md`);
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <div className="auth-container" style={{
      display: 'flex',
      alignItems: 'stretch',
      justifyContent: 'center',
      padding: '0',
      minHeight: '100vh',
      height: isMobile ? 'auto' : '100vh',
      maxHeight: isMobile ? 'none' : '100vh',
      overflow: isMobile ? 'auto' : 'hidden',
      flexDirection: isMobile ? 'column' : 'row'
    }}>
      {/* Left Pane - INCIVUS Branding */}
      <div style={{
        flex: isMobile ? 'none' : '0 0 70%',
        background: 'linear-gradient(135deg, var(--primary-purple) 0%, var(--secondary-purple) 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? '2rem 1.5rem' : '2rem',
        height: isMobile ? 'auto' : '100vh',
        minHeight: isMobile ? '30vh' : '100vh',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Main Content - Logo and INCIVUS */}
        <div style={{
          textAlign: 'center',
          position: 'relative',
          zIndex: 2,
          padding: isMobile ? '1rem 0' : '0'
        }}>
          <div style={{
            width: isMobile ? '200px' : '380px',
            height: isMobile ? '200px' : '380px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.95)',
            border: '2px solid rgba(255, 255, 255, 0.6)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto',
            position: 'relative'
          }}>
            {/* Logo */}
            <div style={{
              marginBottom: isMobile ? '0.5rem' : '1.2rem'
            }}>
              <img 
                src="/logo/C5i name with Logo.svg" 
                alt="C5i Logo" 
                style={{
                  height: isMobile ? '50px' : '100px',
                  width: 'auto',
                  display: 'block'
                }}
              />
            </div>

            {/* INCIVUS Text */}
            <h1 style={{
              fontSize: isMobile ? '1.5rem' : '3.2rem',
              fontWeight: '800',
              color: 'transparent',
              textAlign: 'center',
              letterSpacing: '0.05em',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
              background: 'linear-gradient(135deg, #5b21b6 0%, #7c3aed 50%, #8b5cf6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              textShadow: '0 4px 12px rgba(91, 33, 182, 0.3)',
              lineHeight: '1.1',
              margin: 0
            }}>
              INCIVUS
            </h1>
          </div>
        </div>
      </div>

      {/* Right Pane - Login Form */}
      <div style={{
        flex: isMobile ? 'none' : '0 0 30%',
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'center',
        padding: isMobile ? '1.5rem' : '1rem',
        minHeight: isMobile ? 'auto' : '100vh',
        height: isMobile ? 'auto' : '100vh',
        overflow: 'visible',
        position: 'relative',
        borderLeft: isMobile ? 'none' : '1px solid rgba(124, 58, 237, 0.1)'
      }}>
        <div style={{
          maxWidth: '350px',
          width: '100%',
          position: 'relative',
          zIndex: 2
        }}>
          {/* Login Form */}
          <div className="auth-card" style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.8) 100%)',
            backdropFilter: 'blur(20px)',
            borderRadius: isMobile ? '16px' : '24px',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            boxShadow: '0 20px 40px rgba(124, 58, 237, 0.1), 0 8px 32px rgba(0, 0, 0, 0.05)',
            padding: isMobile ? '1.5rem' : '2rem',
            position: 'relative',
            overflow: 'visible'
          }}>
            {/* Welcome Message */}
            <div className="auth-header" style={{ 
              marginBottom: isMobile ? '1rem' : '2rem', 
              textAlign: 'center',
              paddingTop: '0.5rem'
            }}>
              <h2 style={{
                fontSize: isMobile ? '1.25rem' : '1.75rem',
                fontWeight: '700',
                color: '#000000',
                marginBottom: '0.5rem',
                letterSpacing: '-0.01em'
              }}>
                {isSignUpMode ? 'Start Analyzing' : 'Welcome Back'}
              </h2>
              <p style={{
                color: 'var(--text-light)',
                fontSize: isMobile ? '0.875rem' : '1rem',
                marginBottom: isMobile ? '0.5rem' : '1rem'
              }}>
                {isSignUpMode ? 'Join thousands optimizing their Ad performance' : "Sign in to continue"}
              </p>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.3rem',
                  fontWeight: '500',
                  fontSize: '0.8rem',
                  color: 'var(--text-dark)'
                }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  style={{
                    width: '100%',
                    padding: '0.875rem 1rem',
                    border: errors.email ? '2px solid #ef4444' : formData.email && !errors.email && /\S+@\S+\.\S+/.test(formData.email) ? '2px solid #10b981' : '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '12px',
                    fontSize: '0.875rem',
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.5))',
                    backdropFilter: 'blur(10px)',
                    transition: 'all 0.2s ease-in-out',
                    color: 'var(--text-dark)',
                    outline: 'none'
                  }}
                  onFocus={(e) => {
                    if (!errors.email) {
                      e.target.style.borderColor = 'rgba(124, 58, 237, 0.5)';
                      e.target.style.boxShadow = '0 0 0 3px rgba(124, 58, 237, 0.1)';
                    }
                  }}
                  onBlur={(e) => {
                    if (!errors.email && formData.email && /\S+@\S+\.\S+/.test(formData.email)) {
                      e.target.style.borderColor = '#10b981';
                      e.target.style.boxShadow = 'none';
                    } else if (!errors.email) {
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                      e.target.style.boxShadow = 'none';
                    }
                  }}
                  placeholder="Enter your email address"
                />
                {errors.email && (
                  <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span>❌</span>
                    {errors.email}
                  </p>
                )}
                {!errors.email && formData.email && /\S+@\S+\.\S+/.test(formData.email) && (
                  <p style={{ color: '#10b981', fontSize: '0.75rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span>✅</span>
                    Valid email address
                  </p>
                )}
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.3rem',
                  fontWeight: '500',
                  fontSize: '0.8rem',
                  color: 'var(--text-dark)'
                }}>
                  Password *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.8rem',
                      paddingRight: '2.5rem',
                      border: errors.password ? '2px solid #ef4444' : formData.password && !errors.password && formData.password.length >= 6 ? '2px solid #10b981' : '1px solid rgba(255, 255, 255, 0.3)',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.5))',
                      backdropFilter: 'blur(10px)',
                      transition: 'all 0.2s ease-in-out',
                      color: 'var(--text-dark)',
                      outline: 'none',
                      WebkitAppearance: 'none',
                      MozAppearance: 'textfield'
                    }}
                    autoComplete="current-password"
                    onFocus={(e) => {
                      if (!errors.password) {
                        e.target.style.borderColor = 'rgba(124, 58, 237, 0.5)';
                        e.target.style.boxShadow = '0 0 0 3px rgba(124, 58, 237, 0.1)';
                      }
                    }}
                    onBlur={(e) => {
                      if (!errors.password && formData.password && formData.password.length >= 6) {
                        e.target.style.borderColor = '#10b981';
                        e.target.style.boxShadow = 'none';
                      } else if (!errors.password) {
                        e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                        e.target.style.boxShadow = 'none';
                      }
                    }}
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-light)',
                      cursor: 'pointer'
                    }}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {errors.password && (
                  <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span>❌</span>
                    {errors.password}
                  </p>
                )}
                {!errors.password && formData.password && formData.password.length >= 6 && (
                  <p style={{ color: '#10b981', fontSize: '0.75rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span>✅</span>
                    Password meets requirements
                  </p>
                )}
              </div>

              {/* Confirm Password field - only shown in signup mode */}
              {isSignUpMode && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '0.3rem',
                    fontWeight: '500',
                    fontSize: '0.8rem',
                    color: 'var(--text-dark)'
                  }}>
                    Confirm Password *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.8rem',
                        paddingRight: '2.5rem',
                        border: errors.confirmPassword ? '2px solid #ef4444' : formData.confirmPassword && formData.password === formData.confirmPassword ? '2px solid #10b981' : '1px solid rgba(255, 255, 255, 0.3)',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.5))',
                        backdropFilter: 'blur(10px)',
                        transition: 'all 0.2s ease-in-out',
                        color: 'var(--text-dark)',
                        outline: 'none',
                        WebkitAppearance: 'none',
                        MozAppearance: 'textfield'
                      }}
                      autoComplete="new-password"
                      onFocus={(e) => {
                        if (!errors.confirmPassword) {
                          e.target.style.borderColor = 'rgba(124, 58, 237, 0.5)';
                          e.target.style.boxShadow = '0 0 0 3px rgba(124, 58, 237, 0.1)';
                        }
                      }}
                      onBlur={(e) => {
                        if (!errors.confirmPassword && formData.confirmPassword && formData.password === formData.confirmPassword) {
                          e.target.style.borderColor = '#10b981';
                          e.target.style.boxShadow = 'none';
                        } else if (!errors.confirmPassword) {
                          e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                          e.target.style.boxShadow = 'none';
                        }
                      }}
                      placeholder="Confirm your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={{
                        position: 'absolute',
                        right: '0.75rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-light)',
                        cursor: 'pointer'
                      }}
                    >
                      {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p style={{ 
                      color: formData.password === formData.confirmPassword ? '#10b981' : '#ef4444', 
                      fontSize: '0.75rem', 
                      marginTop: '0.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      {formData.password === formData.confirmPassword && formData.confirmPassword ? (
                        <>
                          <span style={{ color: '#10b981' }}>✓</span>
                          Passwords match
                        </>
                      ) : (
                        errors.confirmPassword
                      )}
                    </p>
                  )}
                  {/* Real-time match indicator */}
                  {formData.password && formData.confirmPassword && !errors.confirmPassword && (
                    <p style={{ 
                      color: '#10b981', 
                      fontSize: '0.75rem', 
                      marginTop: '0.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      <span>✓</span>
                      Passwords match
                    </p>
                  )}
                </div>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.3rem',
                  fontWeight: '500',
                  fontSize: '0.8rem',
                  color: 'var(--text-dark)'
                }}>
                  Captcha Verification *
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  marginBottom: '0.5rem'
                }}>
                  <div style={{
                    flex: 1,
                    padding: '0.4rem',
                    background: 'var(--light-gray)',
                    border: '1px solid var(--border-gray)',
                    borderRadius: '0.5rem',
                    fontFamily: 'monospace',
                    fontSize: '0.9rem',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    letterSpacing: '0.2rem',
                    color: 'var(--text-dark)',
                    userSelect: 'none'
                  }}>
                    {captcha}
                  </div>
                  <button
                    type="button"
                    onClick={refreshCaptcha}
                    style={{
                      padding: '0.4rem',
                      background: 'var(--primary-purple)',
                      color: 'var(--white)',
                      border: 'none',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      transition: 'all 0.2s ease-in-out'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'var(--secondary-purple)';
                      e.target.style.transform = 'translateY(-1px)';
                      e.target.style.boxShadow = '0 4px 8px rgba(124, 58, 237, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'var(--primary-purple)';
                      e.target.style.transform = 'translateY(0px)';
                      e.target.style.boxShadow = 'none';
                    }}
                  >
                    Refresh
                  </button>
                </div>
                <input
                  type="text"
                  value={userInput}
                  onChange={handleCaptchaChange}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    border: errors.captcha ? '2px solid #ef4444' : userInput && userInput.toUpperCase() === captcha ? '2px solid #10b981' : '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '12px',
                    fontSize: '0.8rem',
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.5))',
                    backdropFilter: 'blur(10px)',
                    transition: 'all 0.2s ease-in-out',
                    color: 'var(--text-dark)',
                    outline: 'none'
                  }}
                  onFocus={(e) => {
                    if (!errors.captcha) {
                      e.target.style.borderColor = 'rgba(124, 58, 237, 0.5)';
                      e.target.style.boxShadow = '0 0 0 3px rgba(124, 58, 237, 0.1)';
                    }
                  }}
                  onBlur={(e) => {
                    if (!errors.captcha && userInput && userInput.toUpperCase() === captcha) {
                      e.target.style.borderColor = '#10b981';
                      e.target.style.boxShadow = 'none';
                    } else if (!errors.captcha) {
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                      e.target.style.boxShadow = 'none';
                    }
                  }}
                  placeholder="Enter the captcha code"
                />
                {errors.captcha && (
                  <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span>❌</span>
                    {errors.captcha}
                  </p>
                )}
                {!errors.captcha && userInput && userInput.toUpperCase() === captcha && (
                  <p style={{ color: '#10b981', fontSize: '0.75rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span>✅</span>
                    Captcha verified successfully
                  </p>
                )}
              </div>

              {/* Firebase Authentication Error */}
              {authError && (
                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  marginBottom: '1rem'
                }}>
                  <p style={{ color: '#dc2626', fontSize: '0.875rem', margin: 0 }}>
                    {authError}
                  </p>
                </div>
              )}

              {/* Password Reset Success Message */}
              {resetEmailSent && (
                <div style={{
                  padding: '1rem',
                  background: '#d4edda',
                  color: '#155724',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  textAlign: 'center',
                  fontSize: '0.875rem'
                }}>
                  ✅ Password reset email sent to {formData.email}. Check your inbox!
                </div>
              )}

              {/* Email Link Login Success Message */}
              {emailLinkSent && (
                <div style={{
                  padding: '1rem',
                  background: '#d4edda',
                  color: '#155724',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  textAlign: 'center',
                  fontSize: '0.875rem'
                }}>
                  ✅ Sign-in link sent to {formData.email}. Check your inbox and click the link to sign in!
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '0.7rem',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  opacity: loading ? 0.7 : 1,
                  background: loading ? 'var(--primary-purple)' : 'linear-gradient(135deg, var(--primary-purple), var(--secondary-purple))',
                  border: 'none',
                  borderRadius: '12px',
                  boxShadow: '0 8px 24px rgba(124, 58, 237, 0.3)',
                  transition: 'all 0.2s ease-in-out',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 12px 32px rgba(124, 58, 237, 0.4)';
                    e.target.style.background = 'linear-gradient(135deg, #8b5cf6, #a78bfa)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.target.style.transform = 'translateY(0px)';
                    e.target.style.boxShadow = '0 8px 24px rgba(124, 58, 237, 0.3)';
                    e.target.style.background = 'linear-gradient(135deg, var(--primary-purple), var(--secondary-purple))';
                  }
                }}
              >
                {loading ? (
                  <>
                    <Loader size={20} className="animate-spin" />
                    Signing In...
                  </>
                ) : (
                  isSignUpMode ? 'Sign Up' : 'Sign In'
                )}
              </button>

              {/* Sign Up / Sign In Toggle - Inside Card */}
              <div style={{
                marginTop: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid var(--border-gray)',
                textAlign: 'center'
              }}>
                <p style={{
                  color: 'var(--text-light)',
                  fontSize: '0.875rem',
                  marginBottom: '0.75rem'
                }}>
                  {isSignUpMode ? 'Already have an account?' : 'New to INCIVUS?'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUpMode(!isSignUpMode);
                    // Clear confirm password when switching modes
                    setFormData(prev => ({
                      ...prev,
                      confirmPassword: ''
                    }));
                    // Clear any confirm password errors
                    setErrors(prev => ({
                      ...prev,
                      confirmPassword: ''
                    }));
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    padding: '0.75rem 1.5rem',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
                    width: '100%'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 6px 16px rgba(124, 58, 237, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0px)';
                    e.target.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.3)';
                  }}
                >
                  {isSignUpMode ? 'Sign In Instead' : 'Create New Account'}
                </button>
              </div>
            </form>

            {/* Help Section for Authentication Issues */}
            {errors.password && errors.password.includes('Invalid email or password') && (
              <div style={{
                marginTop: '1rem',
                padding: '0.75rem',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                borderRadius: '8px',
                fontSize: '0.75rem',
                color: 'var(--text-dark)'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#6366f1' }}>
                  Need Help? Common Solutions:
                </div>
                <ul style={{ margin: 0, paddingLeft: '1rem', lineHeight: '1.4' }}>
                  <li><strong>New User?</strong> Click "Create New Account" button at the bottom</li>
                  <li><strong>Signed up with Google?</strong> Use "Continue with Google" button above</li>
                  <li><strong>Forgot Password?</strong> Use the "Reset Password" link {showPasswordReset && '(already shown above)'}</li>
                  <li><strong>Check:</strong> Email spelling and password accuracy</li>
                </ul>
              </div>
            )}

            {/* Social Login Section */}
            <div style={{
              marginTop: '1rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border-gray)'
            }}>
              <p style={{
                textAlign: 'center',
                color: 'var(--text-light)',
                marginBottom: '0.75rem',
                fontSize: '0.8rem'
              }}>
                Or continue with
              </p>
              
                             <div style={{ display: 'grid', gap: '0.4rem' }}>
                 {/* Google Sign In */}
                 <button
                   type="button"
                   onClick={() => handleSocialLogin('google')}
                   disabled={socialLoading !== null}
                   style={{
                     width: '100%',
                     padding: '0.5rem',
                     border: '1px solid rgba(255, 255, 255, 0.3)',
                     borderRadius: '12px',
                     background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.6))',
                     backdropFilter: 'blur(10px)',
                     color: 'var(--text-dark)',
                     fontSize: '0.8rem',
                     fontWeight: '500',
                     cursor: socialLoading ? 'not-allowed' : 'pointer',
                     display: 'flex',
                     alignItems: 'center',
                     justifyContent: 'center',
                     gap: '0.5rem',
                     transition: 'all 0.2s ease-in-out',
                     opacity: socialLoading && socialLoading !== 'google' ? 0.5 : 1,
                     boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)'
                   }}
                   onMouseEnter={(e) => {
                     if (!socialLoading) {
                       e.target.style.transform = 'translateY(-1px)';
                       e.target.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)';
                       e.target.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.8))';
                       e.target.style.borderColor = 'rgba(124, 58, 237, 0.2)';
                     }
                   }}
                   onMouseLeave={(e) => {
                     if (!socialLoading) {
                       e.target.style.transform = 'translateY(0px)';
                       e.target.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.05)';
                       e.target.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.6))';
                       e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                     }
                   }}
                 >
                   {socialLoading === 'google' ? (
                     <Loader size={20} className="animate-spin" />
                   ) : (
                     <svg width="20" height="20" viewBox="0 0 24 24">
                       <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                       <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                       <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                       <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                     </svg>
                   )}
                   Google
                 </button>
               </div>

               {/* Alternative Authentication Options */}
               {!isSignUpMode && (
                 <div style={{
                   marginTop: '1rem',
                   paddingTop: '1rem',
                   borderTop: '1px solid var(--border-gray)',
                   display: 'flex',
                   flexDirection: 'column',
                   gap: '0.5rem'
                 }}>
                   <p style={{
                     textAlign: 'center',
                     color: 'var(--text-light)',
                     marginBottom: '0.5rem',
                     fontSize: '0.8rem'
                   }}>
                     Having trouble signing in?
                   </p>
                   
                   <div style={{ display: 'flex', gap: '0.5rem' }}>
                     {/* Password Reset Button */}
                     <button
                       type="button"
                       onClick={() => setShowPasswordReset(true)}
                       style={{
                         flex: 1,
                         padding: '0.5rem',
                         border: '1px solid #dc3545',
                         borderRadius: '8px',
                         background: 'white',
                         color: '#dc3545',
                         fontSize: '0.75rem',
                         fontWeight: '500',
                         cursor: 'pointer',
                         transition: 'all 0.3s ease'
                       }}
                       onMouseEnter={(e) => {
                         e.target.style.background = '#dc3545';
                         e.target.style.color = 'white';
                       }}
                       onMouseLeave={(e) => {
                         e.target.style.background = 'white';
                         e.target.style.color = '#dc3545';
                       }}
                     >
                       Reset Password
                     </button>

                     {/* Email Link Login Button */}
                     <button
                       type="button"
                       onClick={() => setShowEmailLinkLogin(true)}
                       style={{
                         flex: 1,
                         padding: '0.5rem',
                         border: '1px solid #6366f1',
                         borderRadius: '8px',
                         background: 'white',
                         color: '#6366f1',
                         fontSize: '0.75rem',
                         fontWeight: '500',
                         cursor: 'pointer',
                         transition: 'all 0.3s ease'
                       }}
                       onMouseEnter={(e) => {
                         e.target.style.background = '#6366f1';
                         e.target.style.color = 'white';
                       }}
                       onMouseLeave={(e) => {
                         e.target.style.background = 'white';
                         e.target.style.color = '#6366f1';
                       }}
                     >
                       Email Link Login
                     </button>
                   </div>

                   {/* Password Reset Modal */}
                   {showPasswordReset && (
                     <div style={{
                       marginTop: '1rem',
                       padding: '1rem',
                       background: '#fff3cd',
                       border: '1px solid #ffeaa7',
                       borderRadius: '8px',
                       fontSize: '0.875rem'
                     }}>
                       <p style={{ color: '#856404', marginBottom: '0.75rem', fontWeight: '600' }}>
                         Reset Your Password
                       </p>
                       <p style={{ color: '#856404', marginBottom: '1rem', fontSize: '0.8rem' }}>
                         Enter your email address above and click "Send Reset Email" to receive password reset instructions.
                       </p>
                       <div style={{ display: 'flex', gap: '0.5rem' }}>
                         <button
                           onClick={handlePasswordReset}
                           disabled={loading}
                           style={{
                             flex: 1,
                             padding: '0.5rem',
                             background: '#dc3545',
                             color: 'white',
                             border: 'none',
                             borderRadius: '6px',
                             fontSize: '0.8rem',
                             cursor: loading ? 'not-allowed' : 'pointer',
                             opacity: loading ? 0.7 : 1
                           }}
                         >
                           {loading ? 'Sending...' : 'Send Reset Email'}
                         </button>
                         <button
                           onClick={() => setShowPasswordReset(false)}
                           style={{
                             padding: '0.5rem 1rem',
                             background: 'transparent',
                             color: '#856404',
                             border: '1px solid #856404',
                             borderRadius: '6px',
                             fontSize: '0.8rem',
                             cursor: 'pointer'
                           }}
                         >
                           Cancel
                         </button>
                       </div>
                     </div>
                   )}

                   {/* Email Link Login Modal */}
                   {showEmailLinkLogin && (
                     <div style={{
                       marginTop: '1rem',
                       padding: '1rem',
                       background: '#e7f3ff',
                       border: '1px solid #b3d9ff',
                       borderRadius: '8px',
                       fontSize: '0.875rem'
                     }}>
                       <p style={{ color: '#2c5aa0', marginBottom: '0.75rem', fontWeight: '600' }}>
                         Sign In with Email Link
                       </p>
                       <p style={{ color: '#2c5aa0', marginBottom: '1rem', fontSize: '0.8rem' }}>
                         Enter your email address above and click "Send Sign-in Link" to receive a secure login link. No password required!
                       </p>
                       <div style={{ display: 'flex', gap: '0.5rem' }}>
                         <button
                           onClick={handleEmailLinkLogin}
                           disabled={loading}
                           style={{
                             flex: 1,
                             padding: '0.5rem',
                             background: '#6366f1',
                             color: 'white',
                             border: 'none',
                             borderRadius: '6px',
                             fontSize: '0.8rem',
                             cursor: loading ? 'not-allowed' : 'pointer',
                             opacity: loading ? 0.7 : 1
                           }}
                         >
                           {loading ? 'Sending...' : 'Send Sign-in Link'}
                         </button>
                         <button
                           onClick={() => setShowEmailLinkLogin(false)}
                           style={{
                             padding: '0.5rem 1rem',
                             background: 'transparent',
                             color: '#2c5aa0',
                             border: '1px solid #2c5aa0',
                             borderRadius: '6px',
                             fontSize: '0.8rem',
                             cursor: 'pointer'
                           }}
                         >
                           Cancel
                         </button>
                       </div>
                     </div>
                   )}
                 </div>
               )}
                          </div>
            </div>


          </div>
        </div>
      </div>
    );
  };

export default LoginPage; 