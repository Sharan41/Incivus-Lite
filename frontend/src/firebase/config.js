// firebase.js

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  sendPasswordResetEmail
} from 'firebase/auth';

// Firestore, Realtime DB, and Storage are intentionally not imported here.
// All database/storage access must go through backend APIs exposed by app.py.
// This file only initializes Firebase Auth for frontend authentication flows.

const firebaseConfig = {
  apiKey: "AIzaSyDmFoYcAIiTx73xoHHPYh_HgMj8Tfdk-_o",
  authDomain: "c5itmtshopify.firebaseapp.com",
  projectId: "c5itmtshopify",
  storageBucket: "c5itmtshopify.firebasestorage.app",
  messagingSenderId: "898831452459",
  appId: "1:898831452459:web:eec3323fd14acb6b5ddd6e",
  measurementId: "G-KVWT9X6XT6"
};

// 🔥 Initialize Firebase
const app = initializeApp(firebaseConfig);
export default app;

// 📲 Initialize Services (Auth only)
export const auth = getAuth(app);
// Export null placeholders to avoid accidental direct DB usage in the frontend
export const db = null;
export const storage = null;
export const analytics = null;
export const database = null;

// 🔐 Auth Providers
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
googleProvider.addScope('email');
googleProvider.addScope('profile');

export const facebookProvider = new FacebookAuthProvider();
facebookProvider.addScope('email');

export const microsoftProvider = new OAuthProvider('microsoft.com');
microsoftProvider.addScope('email');
microsoftProvider.addScope('profile');

// 🔒 Authentication Functions
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const signInWithFacebook = () => signInWithPopup(auth, facebookProvider);
export const signInWithMicrosoft = () => signInWithPopup(auth, microsoftProvider);
export const signInWithEmail = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const signUpWithEmail = (email, password) => createUserWithEmailAndPassword(auth, email, password);
export const logOut = () => signOut(auth);

// 📧 Email Link Authentication Functions
export const actionCodeSettings = {
  // URL you want to redirect back to after email verification
  url: window.location.origin + '/login?emailVerified=true',
  // This must be true for email link authentication
  handleCodeInApp: true,
  iOS: {
    bundleId: 'com.incivus.app' // Replace with your actual iOS bundle ID
  },
  android: {
    packageName: 'com.incivus.app', // Replace with your actual Android package name
    installApp: true,
    minimumVersion: '12'
  }
};

// Send sign-in link to email
export const sendSignInLink = (email) => {
  return sendSignInLinkToEmail(auth, email, actionCodeSettings);
};

// Check if the current URL is a sign-in with email link
export const isEmailLink = (url = window.location.href) => {
  return isSignInWithEmailLink(auth, url);
};

// Complete sign-in with email link
export const completeEmailLinkSignIn = (email, url = window.location.href) => {
  return signInWithEmailLink(auth, email, url);
};

// Send password reset email
export const sendPasswordReset = (email) => {
  return sendPasswordResetEmail(auth, email);
};

// 🔄 Auth State Utility
export const waitForAuth = () =>
  new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });

export const onAuthStateChange = (callback) => onAuthStateChanged(auth, callback);

// 🧩 Safe Backend Operation Wrapper (replaces Firestore wrapper)
export const safeBackendOperation = async (operation, requireAuth = true, fallback = null) => {
  try {
    // Check if browser is offline
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      console.warn('🚫 Backend operation skipped - browser offline');
      return fallback;
    }

    if (requireAuth) {
      const user = await waitForAuth();
      if (!user) throw new Error('User must be authenticated');
    }

    const result = await operation();
    return result;
  } catch (error) {
    console.error('🔥 Backend operation failed:', error);
    return fallback;
  }
};
