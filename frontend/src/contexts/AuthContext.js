import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  onAuthStateChange, 
  signInWithGoogle, 
  signInWithFacebook, 
  signInWithMicrosoft,
  signInWithEmail,
  signUpWithEmail,
  logOut,
  sendSignInLink,
  isEmailLink,
  completeEmailLinkSignIn,
  sendPasswordReset
} from '../firebase/config';
import { 
  saveUserProfileDetails,
  getUserProfileDetails, 
  getPlanSelectionDetails,
  checkUserCompletionStatus 
} from '../firebase/firestoreHelpers';
import unifiedApi from '../utils/unifiedApiHelper';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (user) => {
      setCurrentUser(user);
      setLoading(false);
      if (user) {
        // Check if this is a different user than the one stored in localStorage
        const storedUserId = localStorage.getItem('incivus_user_id');
        if (storedUserId && storedUserId !== user.uid) {
          console.log('🔄 Different user detected, clearing stale localStorage data...');
          // Clear all Incivus-related localStorage data for the previous user
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('incivus_')) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(key => {
            localStorage.removeItem(key);
            console.log(`🗑️ Cleared stale data: ${key}`);
          });
          console.log(`✅ Cleared ${keysToRemove.length} stale localStorage items`);
        }
        
        // Store current user ID for future comparison
        localStorage.setItem('incivus_user_id', user.uid);
        
        await saveUserToDatabase(user);
        
        // Check if plan was just upgraded and force refresh data
        const planJustUpgraded = localStorage.getItem('incivus_plan_just_upgraded');
        if (planJustUpgraded === 'true') {
          console.log('🎯 Plan was just upgraded, forcing fresh data load...');
          localStorage.removeItem('incivus_plan_just_upgraded');
          
          // Force refresh user completion status to get latest plan data
          await checkUserCompletionStatusLocal(user.uid);
          console.log('✅ User data refreshed after plan upgrade');
        }
      } else {
        // User logged out, clear the stored user ID
        localStorage.removeItem('incivus_user_id');
      }
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper function to save user auth data to database
  const saveUserToDatabase = async (user) => {
    try {
      // Check if user profile already exists
      const existingProfile = await getUserProfileDetails(user.uid);
      
      if (!existingProfile) {
        // Create new user profile if doesn't exist
        const profileData = {
          email: user.email,
          fullName: user.displayName || '',
          username: user.email.split('@')[0],
          photoURL: user.photoURL,
          phoneNumber: user.phoneNumber,
          isEmailVerified: user.emailVerified,
          authProvider: user.providerData?.[0]?.providerId || 'email',
          isGoogleUser: user.providerData?.[0]?.providerId === 'google.com'
        };
        
        await saveUserProfileDetails(user.uid, profileData);
        console.log('✅ New user profile created for:', user.email);
      } else {
        console.log('✅ Existing user logged in:', user.email);
      }
    } catch (error) {
      console.error('❌ Error saving user to database:', error);
    }
  };

  // Helper function to get user profile data
  const getUserProfileData = async (userId) => {
    try {
      const profile = await getUserProfileDetails(userId);
      return profile;
    } catch (error) {
      console.error('❌ Error getting user profile:', error);
      return null;
    }
  };

  // Helper function to get user plan details
  const getUserPlanData = async (userId) => {
    try {
      const planDetails = await getPlanSelectionDetails(userId);
      return planDetails;
    } catch (error) {
      console.error('❌ Error getting user plan details:', error);
      return null;
    }
  };

  // Enhanced function to load user's complete data including plan
  const loadUserCompleteData = async (userId) => {
    try {
      console.log('🔄 Loading complete user data for:', userId);
      
      // Get user profile details
      const profileDetails = await getUserProfileDetails(userId);
      
      // Get plan selection details
      const planDetails = await getPlanSelectionDetails(userId);
      
      // Update localStorage with database data
      if (profileDetails) {
        localStorage.setItem('incivus_user_profile_details', JSON.stringify(profileDetails));
        console.log('✅ User profile details loaded from database');
      }
      
      if (planDetails) {
        // Convert database format to localStorage format
        const subscriptionData = {
          planType: planDetails.planId,
          planName: planDetails.planName,
          selectedFeatures: planDetails.selectedFeatures || [],
          adQuota: planDetails.totalAds,
          totalPrice: planDetails.totalPrice,
          validityDays: planDetails.validityDays,
          subscriptionStartDate: planDetails.subscriptionStartDate,
          subscriptionEndDate: planDetails.subscriptionEndDate,
          isActive: planDetails.isActive,
          paymentStatus: planDetails.paymentStatus,
          subscribed: planDetails.paymentStatus === 'completed',
          purchaseDate: planDetails.createdAt,
          status: planDetails.isActive ? 'active' : 'inactive'
        };
        
        localStorage.setItem('incivus_subscription', JSON.stringify(subscriptionData));
        console.log('✅ Subscription data loaded from database:', subscriptionData);
      }
      
      return {
        profileDetails,
        planDetails
      };
    } catch (error) {
      console.error('❌ Error loading complete user data:', error);
      return null;
    }
  };

  // Enhanced function to check if user exists and has completed registration
  const checkUserCompletionStatusLocal = async (userId) => {
    try {
      console.log('🔍 Checking user completion status for:', userId);
      
      // Use the new checkUserCompletionStatus helper function
      const completionStatus = await checkUserCompletionStatus(userId);
      
      console.log('🔍 Raw completion status from database:', completionStatus);
      
      // Update localStorage with the data from database
      if (completionStatus.profileDetails) {
        localStorage.setItem('incivus_user_profile_details', JSON.stringify(completionStatus.profileDetails));
        console.log('✅ Profile details stored in localStorage');
      }
      
      if (completionStatus.planDetails) {
        console.log('📋 Plan details found:', completionStatus.planDetails);
        // Convert database format to localStorage format for backward compatibility
        const subscriptionData = {
          planType: completionStatus.planDetails.planId,
          planName: completionStatus.planDetails.planName,
          selectedFeatures: completionStatus.planDetails.selectedFeatures || [],
          adQuota: completionStatus.planDetails.totalAds,
          totalPrice: completionStatus.planDetails.totalPrice,
          validityDays: completionStatus.planDetails.validityDays,
          subscriptionStartDate: completionStatus.planDetails.subscriptionStartDate,
          subscriptionEndDate: completionStatus.planDetails.subscriptionEndDate,
          isActive: completionStatus.planDetails.isActive,
          paymentStatus: completionStatus.planDetails.paymentStatus,
          subscribed: completionStatus.planDetails.paymentStatus === 'completed',
          purchaseDate: completionStatus.planDetails.createdAt,
          status: completionStatus.planDetails.isActive ? 'active' : 'inactive'
        };
        localStorage.setItem('incivus_subscription', JSON.stringify(subscriptionData));
      }
      
      if (completionStatus.brandSetup) {
        localStorage.setItem('incivus_brand_config', JSON.stringify(completionStatus.brandSetup));
        localStorage.setItem('incivus_brand_setup_complete', 'true');
      }
      
      // Get user data for completion status check
      const userProfile = completionStatus.userProfile;
      let userProfileDetails = completionStatus.userProfileDetails;
      const planDetails = completionStatus.planDetails;
      
      console.log('📊 User profile found:', !!userProfile);
      console.log('📊 User profile details found:', !!userProfileDetails);
      console.log('📊 Plan details found:', !!planDetails);
      
      // Debug: Log the actual user profile data
      if (userProfile) {
        console.log('🔍 User profile data:', userProfile);
      }
      
      // If user has data in old collection but not in new collection, migrate it
      if (userProfile && !userProfileDetails) {
        console.log('🔄 Migrating user data from old to new collection structure...');
        try {
          const { saveUserProfileDetails } = await import('../firebase/firestoreHelpers');
          
          // Clean the data to remove undefined values and handle missing fields
          const cleanProfileData = {
            fullName: userProfile.fullName || userProfile.displayName || currentUser?.displayName || 'User',
            email: userProfile.email || currentUser?.email || '',
            username: userProfile.username || userProfile.fullName || userProfile.displayName || currentUser?.displayName || `user_${Date.now()}`,
            companyName: userProfile.companyName || '',
            companySize: userProfile.companySize || '',
            designation: userProfile.designation || '',
            sector: userProfile.sector || '',
            authProvider: userProfile.authProvider || 'email',
            isGoogleUser: userProfile.isGoogleUser || false,
            photoURL: userProfile.photoURL || currentUser?.photoURL || '',
            phoneNumber: userProfile.phoneNumber || currentUser?.phoneNumber || '',
            isEmailVerified: userProfile.isEmailVerified || currentUser?.emailVerified || false,
            termsAccepted: userProfile.termsAccepted || false
          };
          
          // Remove any fields that are still undefined, null, or empty strings - but keep required fields
          const finalProfileData = {};
          Object.entries(cleanProfileData).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              // Keep all defined values, even empty strings for optional fields
              finalProfileData[key] = value;
            } else if (key === 'username' || key === 'fullName' || key === 'email') {
              // Ensure required fields always have a value
              finalProfileData[key] = key === 'username' ? `user_${Date.now()}` : 
                                   key === 'fullName' ? 'User' : 
                                   key === 'email' ? currentUser?.email || '' : '';
            }
          });
          
          console.log('🔄 Cleaned profile data for migration:', finalProfileData);
          
          await saveUserProfileDetails(userId, finalProfileData);
          console.log('✅ User data migrated successfully');
          
          // Re-fetch the migrated data
          userProfileDetails = await getUserProfileDetails(userId);
          console.log('📊 Migrated user profile details found:', !!userProfileDetails);
        } catch (migrationError) {
          console.error('❌ Error migrating user data:', migrationError);
        }
      }
      
      // **FIX**: Use the completion status directly from the database check function
      const userExistsInDB = completionStatus.userExistsInDB;
      const hasEssentialData = completionStatus.hasEssentialData;
      const hasAcceptedTerms = completionStatus.hasAcceptedTerms;
      const isComplete = completionStatus.isComplete;
      
      console.log('📊 Using completion status from database:', {
        userExistsInDB,
        hasEssentialData,
        hasAcceptedTerms,
        isComplete,
        originalStatus: completionStatus
      });
      
      console.log('📊 User exists in database:', userExistsInDB);
      console.log('📊 Database completion status:', completionStatus.isComplete);
      console.log('📊 Has essential data:', hasEssentialData);
      console.log('📊 Has accepted terms:', hasAcceptedTerms);
      
      console.log('📋 User completion analysis:');
      console.log('  - User exists in database:', userExistsInDB);
      console.log('  - Has essential data:', hasEssentialData);
      console.log('  - Has accepted terms:', hasAcceptedTerms);
      console.log('  - Is complete:', isComplete);
      
      // Check for brand setup completion
      let brandSetupComplete = false;
      let brandData = null;
      
      try {
        // **FIX**: Get user's brands first, then get brand data for the first brand
        // Get list of user's brands
        const userBrands = await unifiedApi.getUserBrands(userId);
        
        if (userBrands && userBrands.length > 0) {
          // Get the most recent brand (first in list)
          const firstBrand = userBrands[0];
          const brandId = firstBrand.brandId;
          
          console.log('🎨 Found user brands:', userBrands.length, 'brands. Using first brand:', brandId);
          
          // Now get the actual brand data using the correct brandId
          brandData = await unifiedApi.getBrandDataById(brandId);
          
          // Brand setup is complete if:
          // 1. Brand data exists
          // 2. Has required fields (brandName and at least one tone)
          // 3. Has completion timestamp
          brandSetupComplete = !!(brandData && 
                                 brandData.brandName && 
                                 brandData.toneOfVoice && 
                                 Array.isArray(brandData.toneOfVoice) && 
                                 brandData.toneOfVoice.length > 0 &&
                                 (brandData.completedAt || brandData.lastUpdated));
          
          console.log('🎨 Brand setup check:', {
            brandDataExists: !!brandData,
            hasBrandName: !!brandData?.brandName,
            hasToneOfVoice: !!(brandData?.toneOfVoice && Array.isArray(brandData.toneOfVoice) && brandData.toneOfVoice.length > 0),
            hasCompletionDate: !!(brandData?.completedAt || brandData?.lastUpdated),
            brandSetupComplete
          });
          
          // Update localStorage if brand setup is complete
          if (brandSetupComplete) {
            localStorage.setItem('incivus_brand_setup_complete', 'true');
            localStorage.setItem('incivus_brand_config', JSON.stringify(brandData));
            console.log('✅ Brand setup completion status stored in localStorage');
          }
        } else {
          console.log('ℹ️ No brands found for user (likely new user)');
        }
        
      } catch (brandError) {
        console.log('ℹ️ Could not check brand setup (likely new user):', brandError.message);
      }

      // If user is complete, update localStorage for future quick access
      if (isComplete) {
        localStorage.setItem('incivus_user_complete', 'true');
        localStorage.setItem('incivus_terms_accepted', 'true');
        
        // Store plan details if available - convert to expected format
        if (planDetails) {
          const subscriptionData = {
            planType: planDetails.planId,
            planName: planDetails.planName,
            selectedFeatures: planDetails.selectedFeatures || [],
            adQuota: planDetails.totalAds,
            totalPrice: planDetails.totalPrice,
            validityDays: planDetails.validityDays,
            subscriptionStartDate: planDetails.subscriptionStartDate,
            subscriptionEndDate: planDetails.subscriptionEndDate,
            isActive: planDetails.isActive,
            paymentStatus: planDetails.paymentStatus,
            subscribed: planDetails.paymentStatus === 'completed',
            purchaseDate: planDetails.createdAt,
            status: planDetails.isActive ? 'active' : 'inactive',
            source: 'database'
          };
          localStorage.setItem('incivus_subscription', JSON.stringify(subscriptionData));
          console.log('✅ Plan details stored in localStorage:', subscriptionData);
        }
        
        console.log('✅ Updated localStorage with completion status');
      }
      
      return {
        userExistsInDB,
        isComplete,
        hasAcceptedTerms,
        isSignupComplete: hasEssentialData,
        userProfile,
        userProfileDetails,
        planDetails,
        brandSetupComplete,
        brandData
      };
      
    } catch (error) {
      console.error('❌ Error checking user completion status:', error);
      return {
        userExistsInDB: false,
        isComplete: false,
        hasAcceptedTerms: false,
        isSignupComplete: false,
        userProfile: null,
        userProfileDetails: null,
        planDetails: null,
        brandSetupComplete: false,
        brandData: null
      };
    }
  };

  const loginWithGoogle = async () => {
    try {
      console.log('🎯 AuthContext: Starting Google login...');
      setError(null);
      const result = await signInWithGoogle();
      console.log('✅ AuthContext: Google login successful:', result.user?.email);
      
      // Enhanced user existence and completion check
      const completionStatus = await checkUserCompletionStatusLocal(result.user.uid);
      console.log('🔍 User completion status:', completionStatus);
      
      // Load user's complete data including plan details
      await loadUserCompleteData(result.user.uid);
      
      // Store Google user data regardless of completion status
      localStorage.setItem('incivus_google_user', JSON.stringify({
        email: result.user.email,
        name: result.user.displayName,
        photoURL: result.user.photoURL
      }));
      
      if (completionStatus.userExistsInDB && completionStatus.isComplete) {
        console.log('✅ Existing user detected in database with complete profile - setting completion flags');
        localStorage.setItem('incivus_user_logged_in', 'true');
        localStorage.setItem('incivus_user_complete', 'true');
        if (completionStatus.hasAcceptedTerms) {
          localStorage.setItem('incivus_terms_accepted', 'true');
        }
        
        // If user has profile data, restore it to localStorage for consistency
        if (completionStatus.userProfile) {
          localStorage.setItem('incivus_user_profile', JSON.stringify(completionStatus.userProfile));
        }
        if (completionStatus.userProfileDetails) {
          localStorage.setItem('incivus_user_profile_details', JSON.stringify(completionStatus.userProfileDetails));
        }
        
        console.log('🚀 Redirecting existing user directly to dashboard');
      } else if (completionStatus.userExistsInDB && !completionStatus.isComplete) {
        console.log('⚠️ User exists in database but profile incomplete - will go through registration to complete');
        localStorage.setItem('incivus_user_logged_in', 'true');
        // Don't set completion flags - let the user complete registration
      } else {
        console.log('🆕 New user not found in database - will go through registration flow');
        localStorage.setItem('incivus_user_logged_in', 'true');
        // Don't set completion flags - let the user go through registration
      }
      
      return {
        ...result,
        userExists: completionStatus.isComplete,
        completionStatus
      };
    } catch (error) {
      console.error('❌ AuthContext: Google login failed:', error);
      setError(error.message);
      throw error;
    }
  };

  const loginWithFacebook = async () => {
    try {
      setError(null);
      const result = await signInWithFacebook();
      return result;
    } catch (error) {
      setError(error.message);
      throw error;
    }
  };

  const loginWithMicrosoft = async () => {
    try {
      setError(null);
      const result = await signInWithMicrosoft();
      return result;
    } catch (error) {
      setError(error.message);
      throw error;
    }
  };

  const loginWithEmailPassword = async (email, password) => {
    try {
      setError(null);
      console.log('🔐 AuthContext: Starting email/password login for:', email);
      
      const result = await signInWithEmail(email, password);
      console.log('✅ AuthContext: Email/password login successful:', result.user?.email);
      
      // Enhanced user existence and completion check
      const completionStatus = await checkUserCompletionStatusLocal(result.user.uid);
      console.log('🔍 User completion status:', completionStatus);
      
      // Load user's complete data including plan details
      await loadUserCompleteData(result.user.uid);
      
      // Store user data regardless of completion status
      localStorage.setItem('incivus_user_logged_in', 'true');
      localStorage.setItem('incivus_user_email', email);
      
      if (completionStatus.userExistsInDB && completionStatus.isComplete) {
        console.log('✅ Existing user detected in database with complete profile - setting completion flags');
        localStorage.setItem('incivus_user_complete', 'true');
        localStorage.setItem('incivus_terms_accepted', 'true');
        
        // If user has profile data, restore it to localStorage for consistency
        if (completionStatus.userProfile) {
          localStorage.setItem('incivus_user_profile', JSON.stringify(completionStatus.userProfile));
        }
        if (completionStatus.userProfileDetails) {
          localStorage.setItem('incivus_user_profile_details', JSON.stringify(completionStatus.userProfileDetails));
        }
        
        console.log('🚀 Redirecting existing user directly to dashboard');
      } else if (completionStatus.userExistsInDB && !completionStatus.isComplete) {
        console.log('⚠️ User exists in database but profile incomplete - will go through registration to complete');
        // Don't set completion flags - let the user complete registration
      } else {
        console.log('🆕 New user not found in database - will go through registration flow');
        // Don't set completion flags - let the user go through registration
      }
      
      return {
        ...result,
        userExists: completionStatus.isComplete,
        completionStatus
      };
    } catch (error) {
      console.error('❌ AuthContext: Email/password login failed:', error);
      setError(error.message);
      throw error;
    }
  };

  const signUpWithEmailPassword = async (email, password) => {
    try {
      setError(null);
      console.log('🔐 AuthContext: Starting email/password signup for:', email);
      
      const result = await signUpWithEmail(email, password);
      console.log('✅ AuthContext: Email/password signup successful:', result.user?.email);
      
      // For new signups, user is not complete yet - they need to go through registration
      localStorage.setItem('incivus_user_logged_in', 'true');
      localStorage.setItem('incivus_user_email', email);
      
      console.log('🆕 New user created - will go through registration flow');
      
      return {
        ...result,
        userExists: false, // New signup means user doesn't exist yet
        completionStatus: {
          isComplete: false,
          hasAcceptedTerms: false,
          isSignupComplete: false,
          userProfile: null,
          userProfileDetails: null,
          planDetails: null
        }
      };
    } catch (error) {
      console.error('❌ AuthContext: Email/password signup failed:', error);
      setError(error.message);
      throw error;
    }
  };

  const logout = async () => {
    try {
      setError(null);
      
      // Clear all user-specific localStorage data before logging out
      console.log('🧹 Clearing user data from localStorage...');
      const keysToRemove = [];
      
      // Find all Incivus-related keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('incivus_')) {
          keysToRemove.push(key);
        }
      }
      
      // Remove all found keys
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        console.log(`🗑️ Removed: ${key}`);
      });
      
      console.log(`✅ Cleared ${keysToRemove.length} localStorage items`);
      
      // Clear API cache for this user
      if (currentUser?.uid) {
        console.log('🗑️ Invalidating API cache for user...');
        unifiedApi.invalidateUserCache(currentUser.uid);
      }
      
      // Also clear any email verification keys
      localStorage.removeItem('emailForSignIn');
      
      await logOut();
      
      // Reset component state
      setCurrentUser(null);
      
      console.log('✅ User logged out and data cleared');
    } catch (error) {
      setError(error.message);
      throw error;
    }
  };

  const clearError = () => {
    setError(null);
  };

  // Email Link Authentication Methods
  const sendEmailSignInLink = async (email) => {
    try {
      await sendSignInLink(email);
      // Store email locally for later verification
      localStorage.setItem('emailForSignIn', email);
      console.log('✅ Sign-in link sent to:', email);
      return { success: true, message: 'Sign-in link sent to your email!' };
    } catch (error) {
      console.error('❌ Error sending sign-in link:', error);
      throw error;
    }
  };

  const completeEmailSignIn = async (email = null, url = window.location.href) => {
    try {
      // Get email from parameter or localStorage
      const emailToUse = email || localStorage.getItem('emailForSignIn');
      
      if (!emailToUse) {
        throw new Error('Email is required to complete sign-in');
      }

      const result = await completeEmailLinkSignIn(emailToUse, url);
      
      // Clear email from storage after successful sign-in
      localStorage.removeItem('emailForSignIn');
      
      console.log('✅ Email link sign-in completed:', result.user?.email);
      return result;
    } catch (error) {
      console.error('❌ Error completing email link sign-in:', error);
      throw error;
    }
  };

  const sendPasswordResetEmail = async (email) => {
    try {
      await sendPasswordReset(email);
      console.log('✅ Password reset email sent to:', email);
      return { success: true, message: 'Password reset email sent!' };
    } catch (error) {
      console.error('❌ Error sending password reset email:', error);
      throw error;
    }
  };

  const value = {
    currentUser,
    loginWithGoogle,
    loginWithFacebook,
    loginWithMicrosoft,
    loginWithEmailPassword,
    signUpWithEmailPassword,
    logout,
    error,
    clearError,
    loading,
    getUserProfileData,
    getUserPlanData,
    checkUserCompletionStatus: checkUserCompletionStatusLocal,
    // Email Link Authentication
    sendEmailSignInLink,
    completeEmailSignIn,
    sendPasswordResetEmail,
    isEmailLink
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}; 
