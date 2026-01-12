// Base64 Storage in Firestore (for small images only)
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export const convertToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};

export const saveBase64ToFirestore = async (userId, base64Data, fileName, folder = 'brand') => {
  try {
    // Check file size (Base64 is ~33% larger than original)
    const sizeInBytes = (base64Data.length * 3) / 4;
    const sizeInMB = sizeInBytes / (1024 * 1024);
    
    if (sizeInMB > 1) {
      throw new Error('File too large for Base64 storage. Use external storage instead.');
    }

    console.log('💾 Saving Base64 to Firestore:', fileName);

    // Fix: Replace slashes in folder name to avoid invalid document path
    const sanitizedFolder = folder.replace(/\//g, '_');
    const docId = `${userId}_${sanitizedFolder}_${Date.now()}`;
    
    console.log('📄 Creating document with ID:', docId);
    
    const docRef = doc(db, 'userFiles', docId);
    await setDoc(docRef, {
      userId: userId,
      fileName: fileName,
      folder: folder,
      sanitizedFolder: sanitizedFolder,
      base64Data: base64Data,
      size: sizeInBytes,
      uploadedAt: new Date(),
      type: 'base64'
    });

    console.log('✅ Base64 saved to Firestore:', fileName);

    return {
      id: docRef.id,
      url: base64Data, // Base64 string can be used directly as src
      name: fileName,
      size: sizeInBytes,
      type: 'base64',
      storagePath: docId
    };
  } catch (error) {
    console.error('❌ Base64 save error:', error);
    throw error;
  }
};

export const getBase64FromFirestore = async (userId, folder = 'brand') => {
  try {
    // This would require querying all documents for the user
    // For simplicity, you might want to store all base64 files in the user's profile document
    console.log('📥 Fetching Base64 files from Firestore');
    
    // Implementation would depend on your data structure
    // This is a simplified example
    return [];
  } catch (error) {
    console.error('❌ Base64 fetch error:', error);
    throw error;
  }
};

export const validateFileForBase64 = (file) => {
  const maxSize = 1 * 1024 * 1024; // 1MB limit for Base64
  
  if (file.size > maxSize) {
    throw new Error('File too large for Base64 storage (max 1MB). Please use external storage.');
  }
  
  if (!file.type.startsWith('image/')) {
    throw new Error('Only images are supported for Base64 storage.');
  }
  
  return true;
};