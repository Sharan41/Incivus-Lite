import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase/config';
import { Shield, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

const AuthChecker = () => {
  const { currentUser } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [authDetails, setAuthDetails] = useState(null);

  const checkAuthStatus = async () => {
    setIsRefreshing(true);
    try {
      // Force refresh the auth token
      if (currentUser) {
        const token = await currentUser.getIdToken(true);
        const tokenResult = await currentUser.getIdTokenResult();
        
        setAuthDetails({
          uid: currentUser.uid,
          email: currentUser.email,
          emailVerified: currentUser.emailVerified,
          tokenValid: !!token,
          authTime: tokenResult.authTime,
          issuedAt: tokenResult.issuedAtTime,
          expirationTime: tokenResult.expirationTime,
          signInProvider: tokenResult.signInProvider
        });
        
        console.log('🔐 Auth Status Check:', {
          user: currentUser,
          token: token ? 'Valid' : 'Invalid',
          tokenResult: tokenResult
        });
      } else {
        setAuthDetails(null);
        console.log('❌ No current user found');
      }
    } catch (error) {
      console.error('❌ Auth check failed:', error);
      setAuthDetails(null);
    } finally {
      setIsRefreshing(false);
    }
  };

  const forceReauth = async () => {
    try {
      setIsRefreshing(true);
      
      // Force sign out and back in
      await auth.signOut();
      alert('Please log back in to refresh your authentication.');
      
      // Reload the page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
    } catch (error) {
      console.error('❌ Re-auth failed:', error);
      alert('Failed to refresh authentication. Please manually log out and back in.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const isAuthenticated = currentUser && authDetails?.tokenValid;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      background: isAuthenticated ? '#d4edda' : '#f8d7da',
      border: `2px solid ${isAuthenticated ? '#c3e6cb' : '#f5c6cb'}`,
      borderRadius: '12px',
      padding: '1rem',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 1002,
      minWidth: '300px',
      maxWidth: '400px'
    }}>
      <h4 style={{ 
        margin: '0 0 1rem 0', 
        color: isAuthenticated ? '#155724' : '#721c24',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        {isAuthenticated ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
        Authentication Status
      </h4>

      <div style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
        <strong>Status:</strong> {isAuthenticated ? (
          <span style={{ color: '#155724' }}>✅ Authenticated & Ready</span>
        ) : (
          <span style={{ color: '#721c24' }}>❌ Authentication Issue</span>
        )}
      </div>

      {authDetails && (
        <div style={{ 
          fontSize: '0.8rem', 
          marginBottom: '1rem',
          background: '#f8f9fa',
          padding: '0.5rem',
          borderRadius: '4px'
        }}>
          <div><strong>Email:</strong> {authDetails.email}</div>
          <div><strong>Verified:</strong> {authDetails.emailVerified ? '✅' : '❌'}</div>
          <div><strong>Provider:</strong> {authDetails.signInProvider}</div>
          <div><strong>Token Valid:</strong> {authDetails.tokenValid ? '✅' : '❌'}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
        <button
          onClick={checkAuthStatus}
          disabled={isRefreshing}
          style={{
            padding: '0.5rem',
            background: isRefreshing ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: isRefreshing ? 'not-allowed' : 'pointer',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem'
          }}
        >
          {isRefreshing ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Shield size={14} />}
          {isRefreshing ? 'Checking...' : 'Check Auth Status'}
        </button>
        
        {!isAuthenticated && (
          <button
            onClick={forceReauth}
            disabled={isRefreshing}
            style={{
              padding: '0.5rem',
              background: isRefreshing ? '#ccc' : '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem'
            }}
          >
            🔄 Force Re-login
          </button>
        )}
      </div>

      {!isAuthenticated && (
        <div style={{
          marginTop: '1rem',
          padding: '0.5rem',
          background: '#fff3cd',
          border: '1px solid #ffeaa7',
          borderRadius: '4px',
          fontSize: '0.8rem',
          color: '#856404'
        }}>
          <strong>⚠️ Upload Issue:</strong><br/>
          Authentication problems can cause upload failures. Please refresh authentication or log out/in.
        </div>
      )}
    </div>
  );
};

export default AuthChecker;