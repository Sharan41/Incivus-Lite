import React, { useState } from 'react';
import { Store, Loader } from 'lucide-react';

const ShopifyAuth = ({ onSuccess, onError }) => {
  const [shopUrl, setShopUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleShopifyAuth = async (e) => {
    e.preventDefault();
    
    if (!shopUrl.trim()) {
      setError('Please enter your Shopify store URL');
      return;
    }

    // Clean the shop URL
    let cleanUrl = shopUrl.trim().toLowerCase();
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    
    // Extract shop domain
    const shopDomain = cleanUrl.replace(/^https?:\/\//, '').replace(/\.myshopify\.com.*/, '.myshopify.com');
    
    setIsLoading(true);
    setError('');

    try {
      // Simulate Shopify OAuth flow
      // In a real implementation, this would redirect to Shopify's OAuth endpoint
      const authUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=YOUR_CLIENT_ID&scope=read_products,read_orders&redirect_uri=${encodeURIComponent(window.location.origin + '/auth/callback')}`;
      
      // For demo purposes, we'll simulate a successful auth
      setTimeout(() => {
        setIsLoading(false);
        onSuccess({
          shopDomain,
          shopName: shopDomain.replace('.myshopify.com', ''),
          accessToken: 'demo_token_' + Date.now()
        });
      }, 2000);
      
    } catch (err) {
      setIsLoading(false);
      setError('Failed to connect to Shopify. Please check your store URL and try again.');
      onError(err);
    }
  };

  return (
    <div className="auth-container">
      <div style={{
        maxWidth: '500px',
        width: '100%',
        margin: '0 auto',
        padding: '2rem'
      }}>
        {/* Auth Header */}
        <div className="auth-header">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '2rem'
          }}>
            <img 
              src="/logo/C5i name with Logo.svg" 
              alt="C5i Logo" 
              style={{
                height: '60px',
                width: 'auto'
              }}
            />
          </div>
          <h2 style={{
            fontSize: '1.75rem',
            fontWeight: '600',
            color: 'var(--text-dark)',
            textAlign: 'center',
            marginBottom: '0.5rem'
          }}>
            Connect Your Shopify Store
          </h2>
          <p style={{
            color: 'var(--white)',
            textAlign: 'center',
            marginBottom: '2rem'
          }}>
            Securely connect your store to start analyzing your ads
          </p>
        </div>

        {/* Shopify Auth Card */}
        <div className="auth-card">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '2rem',
            padding: '1.5rem',
            background: 'var(--bg-light)',
            borderRadius: '0.5rem'
          }}>
            <Store size={48} color="var(--primary-purple)" />
          </div>

          <form onSubmit={handleShopifyAuth}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '500',
                color: 'var(--text-dark)'
              }}>
                Shopify Store URL *
              </label>
              <input
                type="text"
                value={shopUrl}
                onChange={(e) => setShopUrl(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: error ? '1px solid #ef4444' : '1px solid var(--border-gray)',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  background: 'var(--white)'
                }}
                placeholder="your-store.myshopify.com"
                disabled={isLoading}
              />
              {error && (
                <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '0.875rem',
                fontSize: '1rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              {isLoading ? (
                <>
                  <Loader size={20} className="animate-spin" />
                  Connecting to Shopify...
                </>
              ) : (
                <>
                  <Store size={20} />
                  Connect Store
                </>
              )}
            </button>
          </form>

          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            background: 'var(--bg-light)',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            color: 'var(--text-light)'
          }}>
            <p style={{ marginBottom: '0.5rem', fontWeight: '500' }}>🔒 Secure Connection</p>
            <p>We use Shopify's official OAuth to securely access only the data we need for ad analysis. Your store credentials are never stored.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopifyAuth; 