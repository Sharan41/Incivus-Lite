import React, { useState, useEffect } from 'react';
import { User, Building, Mail, Calendar, Shield, CheckCircle, Edit, Save, X, CreditCard, LogOut, Palette, MessageSquare, Target, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { 
  updateUserProfileDetails, 
  updatePlanSelectionDetails, 
  updateBrandSetup 
} from '../firebase/firestoreHelpers';
import unifiedApi from '../utils/unifiedApiHelper'; // Use unified API for cached requests
// getBrandDataById now in unifiedApi (imported above)
import { getUserSubscription } from '../utils/subscriptionHelpers';
import SubscriptionStatus from './SubscriptionStatus';
import CustomAlert from './CustomAlert';

const UserProfile = () => {
  const { currentUser, getUserProfileData, getUserPlanData } = useAuth();
  const [profile, setProfile] = useState(null);
  const [planData, setPlanData] = useState(null);
  const [authData, setAuthData] = useState(null);
  const [brandData, setBrandData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState({ open: false, title: '', message: '', severity: 'info' });
  const [subscriptionRefreshTrigger, setSubscriptionRefreshTrigger] = useState(0);

  // Function to refresh brand data - **FIX**: Use same strategy as Analysis page
  const refreshBrandData = async () => {
    if (!currentUser?.uid) return;
    
    try {
      console.log('🔄 Refreshing brand data for user:', currentUser.uid);
      
      // **FIX**: Use getUserBrandData (same as Analysis page) instead of getBrandSetup
      // Using unified API for caching and deduplication
      const brandDetails = await unifiedApi.getUserBrands(currentUser.uid);
      
      console.log('🏷️ Brand data loaded for UserProfile:', brandDetails);
      console.log('🏷️ Brand data mediaFiles count:', brandDetails?.mediaFiles?.length || 0);
      console.log('🖼️ Brand data logos:', brandDetails?.logos);
      console.log('🖼️ Brand data logoFiles:', brandDetails?.logoFiles);
      
      // **DEBUG**: Log detailed mediaFiles structure for logo debugging
      if (brandDetails?.mediaFiles && brandDetails.mediaFiles.length > 0) {
        console.log('🔍 UserProfile - Detailed mediaFiles analysis:');
        brandDetails.mediaFiles.forEach((file, index) => {
          console.log(`📁 MediaFile ${index}:`, {
            mediaType: file.mediaType,
            type: file.type,
            category: file.category,
            fileName: file.fileName,
            filename: file.filename,
            url: file.url,
            hasUrl: !!file.url
          });
        });
      } else {
        console.log('⚠️ UserProfile - No mediaFiles found in brand data');
        console.log('🔍 UserProfile - Full brandDetails object keys:', Object.keys(brandDetails || {}));
        console.log('🔍 UserProfile - brandDetails.mediaCount:', brandDetails?.mediaCount);
        console.log('🔍 UserProfile - brandDetails.logos:', brandDetails?.logos);
        console.log('🔍 UserProfile - brandDetails.logoFiles:', brandDetails?.logoFiles);
        
        // **DIAGNOSTIC**: Check if there are any logo-related fields at all
        const logoRelatedFields = {};
        if (brandDetails) {
          Object.keys(brandDetails).forEach(key => {
            if (key.toLowerCase().includes('logo') || key.toLowerCase().includes('media') || key.toLowerCase().includes('file')) {
              logoRelatedFields[key] = brandDetails[key];
            }
          });
        }
        console.log('🔍 UserProfile - Logo-related fields found:', logoRelatedFields);
      }
      
      // **ENHANCED**: If we got brand data but no media files, try fetching by brand ID
      if (brandDetails && brandDetails.brandId && (!brandDetails.mediaFiles || brandDetails.mediaFiles.length === 0)) {
        console.log('🔍 No media files found, trying direct brand fetch by ID:', brandDetails.brandId);
        try {
          const directBrandData = await unifiedApi.getBrandDataById(brandDetails.brandId);
          if (directBrandData && directBrandData.mediaFiles) {
            console.log('✅ Found media files via direct fetch:', directBrandData.mediaFiles);
            setBrandData({...brandDetails, ...directBrandData});
            return;
          }
        } catch (error) {
          console.warn('⚠️ Direct brand fetch failed:', error);
        }
      }
      
      setBrandData(brandDetails);
      console.log('✅ Brand data refreshed:', brandDetails);
      console.log('🖼️ Refreshed - logos:', brandDetails?.logos);
      console.log('🖼️ Refreshed - logoFiles:', brandDetails?.logoFiles);
      console.log('🖼️ Refreshed - mediaFiles:', brandDetails?.mediaFiles);
      
      // Also refresh the profile with new brand data
      setProfile(prev => ({
        ...prev,
        companyName: prev?.userProfile?.companyName || prev?.companyName || brandDetails?.brandName,
        companySize: prev?.userProfile?.companySize || prev?.companySize,
        industryCategory: brandDetails?.industryCategory,
        targetAudience: brandDetails?.targetAudience,
        brandDescription: brandDetails?.brandDescription
      }));
    } catch (error) {
      console.error('❌ Error refreshing brand data:', error);
    }
  };

  // Function to refresh subscription data
  const refreshSubscriptionData = () => {
    console.log('🔄 Refreshing subscription data...');
    setSubscriptionRefreshTrigger(prev => prev + 1);
  };

  // Listen for brand setup completion and add periodic refresh like Analysis page
  useEffect(() => {
    const handleBrandSetupComplete = () => {
      console.log('🔄 Brand setup completed, refreshing brand data...');
      setTimeout(() => {
        refreshBrandData();
      }, 1000); // Small delay to ensure data is saved
    };

    // Listen for custom events from brand setup
    window.addEventListener('brandSetupComplete', handleBrandSetupComplete);
    
    // **NEW**: Add periodic brand data refresh like Analysis page
    const brandRefreshInterval = setInterval(() => {
      if (currentUser?.uid) {
        console.log('🔄 Periodic brand data refresh in UserProfile...');
        refreshBrandData();
      }
    }, 30000); // Refresh every 30 seconds like Analysis page
    
    return () => {
      window.removeEventListener('brandSetupComplete', handleBrandSetupComplete);
      clearInterval(brandRefreshInterval);
    };
  }, [currentUser]);

  useEffect(() => {
    const loadUserData = async () => {
      if (!currentUser) {
        setError('No authenticated user found');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Get profile data from existing sources
        const profileData = await getUserProfileData(currentUser.uid);
        
        // FIX: Reuse refreshBrandData instead of duplicate fetch
        // Only fetch brand data if not already loaded
        let brandDetails = brandData;
        if (!brandDetails) {
          // Using unified API for caching and deduplication
          brandDetails = await unifiedApi.getUserBrands(currentUser.uid);
        }
        
        // **SINGLE SOURCE OF TRUTH**: Use unified API for plan data
        console.log('🔍 UserProfile - Loading plan data from single source of truth...');
        const userProfile = await unifiedApi.getUserProfile(currentUser.uid);
        const subscriptionData = userProfile?.subscription || null;
        
        if (subscriptionData) {
          console.log('✅ UserProfile - Plan data loaded from single source:', subscriptionData);
        } else {
          console.warn('⚠️ UserProfile - No plan data found from single source');
        }
        
        // Merge profile with subscription data and brand data
        const enhancedProfile = {
          ...profileData,
          // Use full name from userProfile if available (this is the correct source)
          fullName: profileData?.userProfile?.fullName || profileData?.fullName,
          // Use company name from userProfile if available (this is the correct source)
          companyName: profileData?.userProfile?.companyName || profileData?.companyName || brandDetails?.brandName,
          // Use company size from userProfile if available
          companySize: profileData?.userProfile?.companySize || profileData?.companySize,
          // Add other brand details
          industryCategory: brandDetails?.industryCategory,
          targetAudience: brandDetails?.targetAudience,
          brandDescription: brandDetails?.brandDescription,
          subscription: subscriptionData // Use plan data from single source
        };
        
        setProfile(enhancedProfile);
        setPlanData(subscriptionData); // Use plan data from single source
        setBrandData(brandDetails);
        setEditForm({
          ...profileData,
          fullName: profileData?.userProfile?.fullName || profileData?.fullName,
          companyName: profileData?.userProfile?.companyName || profileData?.companyName || brandDetails?.brandName,
          companySize: profileData?.userProfile?.companySize || profileData?.companySize
        });
        
        // Set auth data from Firebase Auth
        setAuthData({
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          emailVerified: currentUser.emailVerified,
          createdAt: currentUser.metadata.creationTime,
          lastSignIn: currentUser.metadata.lastSignInTime,
          providerId: currentUser.providerData?.[0]?.providerId || 'email'
        });
        
        console.log('👤 Profile loaded:', enhancedProfile);
        console.log('💳 Plan data:', subscriptionData);
        console.log('🔐 Auth data:', currentUser);
        console.log('🏷️ Brand data:', brandDetails);
        console.log('🏢 Company Size Debug:', {
          'profileData': profileData,
          'userProfile.companySize': profileData?.userProfile?.companySize,
          'profile.companySize': profileData?.companySize,
          'enhanced.companySize': enhancedProfile.companySize
        });
        console.log('🖼️ Brand logos (logos):', brandDetails?.logos);
        console.log('🔍 Enhanced profile subscription:', enhancedProfile.subscription);
        console.log('🔍 Local storage subscription:', subscriptionData);
        console.log('🖼️ Brand logos (logoFiles):', brandDetails?.logoFiles);
        console.log('🖼️ Brand mediaFiles:', brandDetails?.mediaFiles);
        
      } catch (err) {
        console.error('❌ Error loading user data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [currentUser, getUserProfileData, getUserPlanData]);

  const handleEditToggle = () => {
    if (isEditing) {
      // Cancel editing - reset form
      setEditForm(profile || {});
    }
    setIsEditing(!isEditing);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveProfile = async () => {
    if (!currentUser?.uid) return;

    try {
      setSaving(true);
      
      // Update profile details with editable fields
      const updatedFields = {
        fullName: editForm.fullName,
        companyName: editForm.companyName,
        companySize: editForm.companySize
      };
      
      await updateUserProfileDetails(currentUser.uid, updatedFields);
      
      // Update local state
      setProfile(prev => ({
        ...prev,
        fullName: editForm.fullName,
        companyName: editForm.companyName,
        companySize: editForm.companySize,
        // Also update nested userProfile structure if it exists
        userProfile: {
          ...prev.userProfile,
          fullName: editForm.fullName,
          companyName: editForm.companyName,
          companySize: editForm.companySize
        }
      }));
      
      setIsEditing(false);
      setAlert({
        open: true,
        title: 'Success',
        message: 'Profile updated successfully!',
        severity: 'success'
      });
      
    } catch (err) {
      console.error('Error saving profile:', err);
      setAlert({
        open: true,
        title: 'Error',
        message: `Failed to update profile: ${err.message}`,
        severity: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!currentUser?.uid) return;
    
    try {
      setSaving(true);
      
      // Update plan to inactive
              await updatePlanSelectionDetails(currentUser.uid, {
                isActive: false,
        updatedAt: new Date().toISOString()
              });
              
              // Update local state
      setPlanData(prev => ({ ...prev, isActive: false }));
              
              setAlert({
                open: true,
        title: 'Success',
        message: 'Subscription cancelled successfully!',
                severity: 'success'
              });
              
    } catch (err) {
      console.error('Error cancelling subscription:', err);
              setAlert({
                open: true,
                title: 'Error',
        message: `Failed to cancel subscription: ${err.message}`,
                severity: 'error'
              });
    } finally {
      setSaving(false);
        }
  };

  const handleLogout = () => {
    // This will be handled by the parent component
            window.location.reload();
  };

  const renderColorSwatch = (color) => {
    if (!color) return null;
    
    // Handle multiple colors (comma-separated)
    const colors = color.split(',').map(c => c.trim());
    
    return (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {colors.map((c, index) => (
          <div
            key={index}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              border: '2px solid #e5e7eb',
              backgroundColor: c.startsWith('#') ? c : `#${c}`
            }}
            title={c}
          />
        ))}
      </div>
    );
  };

  const renderBrandSection = () => {
    if (!brandData) {
      return (
        <div style={{
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          padding: '1rem'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#4b5563',
            marginBottom: '0.5rem'
          }}>
            <Building size={20} />
            <h3 style={{ fontWeight: '600', margin: 0 }}>Brand Information</h3>
          </div>
          <p style={{
            fontSize: '0.875rem',
            color: '#6b7280',
            margin: 0
          }}>
            No brand information available. Complete your brand setup to see details here.
          </p>
        </div>
      );
    }

    return (
      <div style={{
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        padding: '1.5rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1.5rem'
        }}>
          <Building style={{ width: '1.5rem', height: '1.5rem', color: '#374151' }} />
          <h3 style={{
            fontSize: '1.125rem',
            fontWeight: '600',
            color: '#374151',
            margin: 0
          }}>
            Brand Information
          </h3>
        </div>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
          gap: '1rem' 
        }}>
            <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              Brand Name
            </div>
            <div style={{ fontSize: '0.95rem', color: '#374151' }}>
              {brandData?.brandName || 'Not specified'}
            </div>
            </div>
            
            <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              Tagline
            </div>
            <div style={{ fontSize: '0.95rem', color: '#374151' }}>
              {brandData?.tagline || 'Not specified'}
              </div>
            </div>
            

            
            <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              Primary Color
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.95rem', color: '#374151' }}>
                {brandData?.primaryColor || 'Not specified'}
              </span>
              {renderColorSwatch(brandData?.primaryColor)}
              </div>
            </div>
            
            <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              Secondary Color
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.95rem', color: '#374151' }}>
                {brandData?.secondaryColor || 'Not specified'}
              </span>
              {renderColorSwatch(brandData?.secondaryColor)}
              </div>
            </div>
            

            
            <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              Tone of Voice
              </div>
            <div style={{ fontSize: '0.95rem', color: '#374151' }}>
              {Array.isArray(brandData?.toneOfVoice) ? brandData.toneOfVoice.join(', ') : (brandData?.toneOfVoice || 'Not specified')}
          </div>
        </div>
        
                    {/* Brand Logo Display - Always show placeholder */}
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '0.75rem' 
            }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Brand Logo
              </div>

          </div>
            <div style={{
              width: '120px',
              height: '120px',
              border: '2px dashed #d1d5db',
              borderRadius: '12px',
              padding: '12px',
              background: '#f9fafb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}>
                            {(() => {
                console.log('🖼️ Brand Logo Display - Checking sources...');
                console.log('📁 Full brandData:', brandData);
                console.log('📁 brandData?.logos:', brandData?.logos);
                console.log('📁 brandData?.logoFiles:', brandData?.logoFiles);
                console.log('📁 brandData?.mediaFiles:', brandData?.mediaFiles);
                
                // **ENHANCED**: Check all possible logo sources and variations
                const logoSources = [
                  brandData?.logos,
                  brandData?.logoFiles,
                  brandData?.mediaFiles?.filter(file => file.mediaType === 'logo'),
                  brandData?.mediaFiles?.filter(file => file.type === 'logo'),
                  brandData?.mediaFiles?.filter(file => file.category === 'logo'),
                  brandData?.mediaFiles?.filter(file => file.fileName?.toLowerCase().includes('logo')),
                  brandData?.logo, // Single logo property
                  brandData?.logoFile, // Single logo file property
                  brandData?.brandLogo, // Alternative naming
                  brandData?.mediaFiles // All media files as fallback
                ];
                
                console.log('🔍 Checking logo sources:', logoSources.map((source, index) => ({
                  sourceIndex: index,
                  type: typeof source,
                  isArray: Array.isArray(source),
                  length: Array.isArray(source) ? source.length : 'N/A',
                  hasData: !!source
                })));
                
                // Find the first available logo source
                let logoData = null;
                for (let i = 0; i < logoSources.length; i++) {
                  const source = logoSources[i];
                  if (source) {
                    if (Array.isArray(source) && source.length > 0) {
                      logoData = source[0];
                      console.log(`✅ Found logo data from source ${i} (array):`, logoData);
                      break;
                    } else if (!Array.isArray(source) && typeof source === 'object') {
                      logoData = source;
                      console.log(`✅ Found logo data from source ${i} (object):`, logoData);
                      break;
                    }
                  }
                }
                
                if (logoData) {
                  console.log('📊 Logo data properties:', Object.keys(logoData));
                  
                  // **ENHANCED**: Try multiple source properties for the image URL
                  const possibleUrlProperties = [
                    'preview',
                    'url', 
                    'downloadURL',
                    'signedUrl',
                    'publicUrl',
                    'mediaUrl',
                    'imageUrl',
                    'src',
                    'base64Data',
                    'file',
                    'path',
                    'fullPath',
                    'webContentLink',
                    'webViewLink'
                  ];
                  
                  let logoSrc = null;
                  for (const prop of possibleUrlProperties) {
                    if (logoData[prop]) {
                      logoSrc = logoData[prop];
                      console.log(`🖼️ Found logo URL from property "${prop}":`, logoSrc.substring(0, 100) + '...');
                      break;
                    }
                  }
                  
                  if (!logoSrc) {
                    console.log('❌ No valid URL property found in logo data:', logoData);
                  }
                  
                  if (logoSrc) {
                    return (
                      <img
                        src={logoSrc}
                        alt="Brand Logo"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '100%',
                          objectFit: 'contain'
                        }}
                        onError={(e) => {
                          console.error('❌ Logo failed to load:', e);
                          console.error('❌ Failed URL:', logoSrc);
                          // Hide the broken image
                          e.target.style.display = 'none';
                        }}
                        onLoad={() => {
                          console.log('✅ Logo loaded successfully');
                        }}
                      />
                    );
                  }
                }
                
                console.log('❌ No valid logo source found, showing placeholder');
                return (
                  <div style={{
                    textAlign: 'center',
                    color: '#6b7280'
                  }}>
                    <div style={{
                      fontSize: '2rem',
                      marginBottom: '0.5rem'
                    }}>
                      🏢
                    </div>
                    <div style={{
                      fontSize: '0.75rem',
                      fontWeight: '500'
                    }}>
                      No Logo Uploaded
                    </div>
                    <div style={{
                      fontSize: '0.675rem',
                      opacity: 0.7,
                      marginTop: '0.25rem'
                    }}>
                      Upload in Brand Setup
          </div>
          </div>
                );
              })()}
          </div>
          </div>
        </div>
        

        
        {/* Brand Description */}
        {brandData?.brandDescription && (
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              Brand Description
            </div>
            <div style={{ 
              fontSize: '0.95rem', 
              color: '#374151', 
              background: '#f9fafb', 
              borderRadius: '8px', 
              padding: '0.75rem',
              lineHeight: '1.5'
            }}>
              {brandData.brandDescription}
            </div>
          </div>
        )}
        

      </div>
    );
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '400px',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #8b5cf6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ 
          color: '#6b7280', 
          fontSize: '1rem',
          fontWeight: '500'
        }}>
          Loading your profile...
        </p>
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        backgroundColor: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '8px',
        padding: '1rem',
        margin: '2rem',
        maxWidth: '600px',
        marginLeft: 'auto',
        marginRight: 'auto'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: '#991b1b',
          marginBottom: '0.5rem'
        }}>
          <AlertCircle size={20} />
          <span style={{ fontWeight: '600' }}>Error loading profile</span>
        </div>
        <p style={{ color: '#b91c1c', margin: 0 }}>{error}</p>
      </div>
    );
  }

    return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.9) 100%)',
      backdropFilter: 'blur(20px)',
      borderRadius: '24px',
      padding: '0',
      border: '1px solid rgba(124, 58, 237, 0.1)',
      boxShadow: '0 8px 32px rgba(124, 58, 237, 0.08)',
      overflow: 'hidden'
    }}>
      {/* Alert */}
      <CustomAlert
        open={alert.open}
        title={alert.title}
        message={alert.message}
        severity={alert.severity}
        onClose={() => setAlert({ ...alert, open: false })}
      />

      {/* Profile Header with Purple Gradient */}
      <div style={{
        background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
        padding: '2rem',
        color: 'white',
        position: 'relative'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            fontWeight: 'bold',
            overflow: 'hidden'
          }}>
            {(profile?.userProfile?.fullName || profile?.fullName || authData?.displayName || profile?.companyName || 'U')[0].toUpperCase()}
            </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ 
              fontSize: '1.5rem', 
              fontWeight: 'bold', 
              margin: '0 0 0.25rem 0' 
            }}>
              {profile?.userProfile?.fullName || profile?.fullName || authData?.displayName || profile?.companyName || 'User'}
            </h1>
            <p style={{ 
              fontSize: '0.9rem', 
              opacity: 0.9, 
              margin: 0 
            }}>
              {authData?.email}
            </p>
          </div>
          
                <button
                  onClick={handleEditToggle}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '8px',
              padding: '0.5rem 1rem',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Edit size={16} />
                Edit Profile
              </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ padding: '1.5rem' }}>
        
        {/* Personal Information Section */}
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ 
            fontSize: '1.25rem', 
            fontWeight: '600', 
            color: '#1f2937', 
            marginBottom: '1rem' 
          }}>
            Personal Information
          </h2>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
            gap: '1rem' 
          }}>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                Full Name
              </div>
              <div style={{ fontSize: '0.95rem', color: '#374151' }}>
                {profile?.userProfile?.fullName || profile?.fullName || authData?.displayName || 'Not provided'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                Email
              </div>
              <div style={{ fontSize: '0.95rem', color: '#374151' }}>
                {authData?.email}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                Company Name
              </div>
              <div style={{ fontSize: '0.95rem', color: '#374151' }}>
                {profile?.companyName || authData?.displayName || 'Not provided'}
            </div>
                </div>



            <div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                Company Size
            </div>
              <div style={{ fontSize: '0.95rem', color: '#374151' }}>
                {profile?.companySize || 'Not provided'}
              </div>
                      </div>
          </div>
        </div>

        {/* Editable Fields */}
        {isEditing && (
          <div style={{
            background: 'white',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{
              fontSize: '1.125rem',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '1rem'
            }}>
              Edit Profile
            </h3>
            {/* Full Name Field */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: '500', 
                color: '#374151', 
                marginBottom: '0.5rem' 
              }}>
                Full Name
              </label>
              <input
                type="text"
                name="fullName"
                value={editForm.fullName || ''}
                onChange={handleInputChange}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '0.95rem'
                }}
                placeholder="Enter your full name"
              />
            </div>

            {/* Company Name Field */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: '500', 
                color: '#374151', 
                marginBottom: '0.5rem' 
              }}>
                Company Name
              </label>
              <input
                type="text"
                name="companyName"
                value={editForm.companyName || ''}
                onChange={handleInputChange}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '0.95rem'
                }}
                placeholder="Enter your company name"
              />
            </div>



            {/* Company Size Field */}
            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: '500', 
                color: '#374151', 
                marginBottom: '0.5rem' 
              }}>
                Company Size
              </label>
              <select
                name="companySize"
                value={editForm.companySize || ''}
                onChange={handleInputChange}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '0.95rem',
                  backgroundColor: 'white'
                }}
              >
                <option value="">Select company size</option>
                <option value="1-10 employees">1-10 employees</option>
                <option value="11-50 employees">11-50 employees</option>
                <option value="51-200 employees">51-200 employees</option>
                <option value="201-500 employees">201-500 employees</option>
                <option value="501-1000 employees">501-1000 employees</option>
                <option value="1000+ employees">1000+ employees</option>
              </select>
                    </div>
            
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.75rem 1.5rem',
                  fontWeight: '500',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1
                }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={handleEditToggle}
                style={{
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.75rem 1.5rem',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

      {/* Brand Information Section */}
      {renderBrandSection()}

      {/* Subscription Status */}
      <SubscriptionStatus 
        planData={planData} 
        onCancelSubscription={handleCancelSubscription}
        saving={saving}
        refreshTrigger={subscriptionRefreshTrigger}
      />

      {/* Authentication Information */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        padding: '1.5rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1.5rem'
        }}>
          <Shield style={{ width: '1.5rem', height: '1.5rem', color: '#374151' }} />
          <h3 style={{
            fontSize: '1.125rem',
            fontWeight: '600',
            color: '#374151',
            margin: 0
          }}>
            Authentication Information
          </h3>
                          </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
          gap: '1rem' 
                }}>
          <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              User ID
            </div>
            <div style={{ fontSize: '0.95rem', color: '#374151', fontFamily: 'monospace' }}>
              {authData?.uid}
            </div>
          </div>
          


          <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              Created
            </div>
            <div style={{ fontSize: '0.95rem', color: '#374151' }}>
                {authData?.createdAt ? new Date(authData.createdAt).toLocaleDateString() : 'Unknown'}
                </div>
          </div>
          
          <div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              Last Sign In
            </div>
            <div style={{ fontSize: '0.95rem', color: '#374151' }}>
                {authData?.lastSignIn ? new Date(authData.lastSignIn).toLocaleDateString() : 'Unknown'}
          </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default UserProfile;