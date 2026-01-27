import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Save, 
  X, 
  Plus, 
  Image, 
  Loader,
  RefreshCw,
  BarChart3,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { 
  uploadBrandLogos, 
  validateImageFile, 
  generateFilePreview,
  deleteFile 
} from '../utils/storageHelpers';
// Removed: import { uploadBrandLogosBase64, canUseBase64 } from '../utils/quickBase64Setup'; - File deleted
import { getUserBrands, saveBrandData } from '../utils/unifiedApiHelper';
import UploadOptimizer from './UploadOptimizer';
// Clean interface - all debug components removed

const EnhancedBrandSetup = ({ onSave, setUserFlow, onInputFieldClick = () => {}, hasActiveSubscription = true, showAnalyzeButton = false }) => {
  const { currentUser } = useAuth();

  // All state declarations first
  const [brandData, setBrandData] = useState({
    // Brand Information
    brandName: '',
    tagline: '',
    brandDescription: '',
    
    // Logos
    logos: [], // Array of logo objects {file, preview, uploaded, url}
    
    // Colors
    primaryColor: '#F05A28',
    secondaryColor: '#000000',
    accentColor: '#FFFFFF',
    
    // Tone of Voice (up to 3 selections)
    toneOfVoice: [], // Changed to array for multiple selections
    customTone: ''
  });

  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errors, setErrors] = useState({});
  const [saveStatus, setSaveStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false); // Prevent multiple submissions
  // eslint-disable-next-line no-unused-vars
  const [editingField, setEditingField] = useState(null); // Track which field is being edited (used in handleDeleteField)
  // eslint-disable-next-line no-unused-vars
  const [optimizationSettings, setOptimizationSettings] = useState({
    autoCompress: true,
    quality: 0.85,
    maxWidth: 1200,
    maxHeight: 1200
  });

  // Debug: Component lifecycle
  useEffect(() => {
    console.log('🎯 EnhancedBrandSetup component mounted/remounted');
    return () => {
      console.log('🔄 EnhancedBrandSetup component unmounting');
    };
  }, []);

  // Debug: Watch for brand data changes
  useEffect(() => {
    console.log('🔍 Brand data state changed:', {
      colors: {
        primary: brandData.primaryColor,
        secondary: brandData.secondaryColor,
        accent: brandData.accentColor
      },
      loadingState: loading,
      hasUser: !!currentUser?.uid
    });
  }, [brandData.primaryColor, brandData.secondaryColor, brandData.accentColor, loading, currentUser]);

  // Migration effect to handle old data format
  useEffect(() => {
    // Convert old toneOfVoice string format to new array format
    if (brandData.toneOfVoice && typeof brandData.toneOfVoice === 'string') {
      console.log('🔄 Migrating toneOfVoice from string to array format');
      setBrandData(prev => ({
        ...prev,
        toneOfVoice: [prev.toneOfVoice] // Convert single string to array
      }));
    }
  }, [brandData.toneOfVoice]);

    const toneOptions = [
    'Professional',
    'Friendly',
    'Casual',
    'Luxury',
    'Playful',
    'Authoritative',
    'Warm',
    'Modern'
  ];

  // Debug useEffect to monitor tone changes
  useEffect(() => {
    console.log('🎯 Tone of Voice changed:', brandData.toneOfVoice);
    console.log('🎯 Tone of Voice type:', typeof brandData.toneOfVoice);
    console.log('🎯 Tone of Voice isArray:', Array.isArray(brandData.toneOfVoice));
    if (brandData.toneOfVoice && brandData.toneOfVoice.length > 3) {
      console.warn('⚠️ More than 3 tones selected, this should not happen');
    }
  }, [brandData.toneOfVoice]);

  // Debug useEffect to monitor logo changes
  useEffect(() => {
    console.log('🖼️ DEBUG - Logos state changed:', brandData.logos);
    console.log('🖼️ DEBUG - Logos count:', brandData.logos?.length || 0);
    if (brandData.logos?.length > 0) {
      brandData.logos.forEach((logo, index) => {
        console.log(`🖼️ DEBUG - Logo ${index}:`, {
          name: logo.name,
          url: logo.url,
          preview: logo.preview,
          uploaded: logo.uploaded
        });
      });
    }
  }, [brandData.logos]);

  // Function to force reload brand data (clear cache and fetch fresh)
  const forceReloadBrandData = async () => {
    if (!currentUser?.uid) return;
    
    try {
      setLoading(true);
      
      // Clear any cached brand data
      localStorage.removeItem('incivus_brand_config');
      localStorage.removeItem('incivus_brand_cache');
      
      console.log('🔄 Force reloading brand data...');
      const existingBrandData = await getUserBrands(currentUser.uid, true); // forceRefresh = true
      
      if (existingBrandData) {
        console.log('🔄 Force reload - Raw brand data from database:', existingBrandData);
        
        // Handle nested color structure if it exists
        const colorData = existingBrandData.colors ? {
          primaryColor: existingBrandData.colors.primary || existingBrandData.primaryColor || '#F05A28',
          secondaryColor: existingBrandData.colors.secondary || existingBrandData.secondaryColor || '#000000',
          accentColor: existingBrandData.colors.accent || existingBrandData.accentColor || '#FFFFFF'
        } : {
          primaryColor: existingBrandData.primaryColor || '#F05A28',
          secondaryColor: existingBrandData.secondaryColor || '#000000',
          accentColor: existingBrandData.accentColor || '#FFFFFF'
        };

        // Ensure toneOfVoice is always an array
        const toneOfVoice = Array.isArray(existingBrandData.toneOfVoice) 
          ? existingBrandData.toneOfVoice 
          : existingBrandData.toneOfVoice 
            ? [existingBrandData.toneOfVoice] 
            : [];

        setBrandData(prev => ({
          ...prev,
          brandName: existingBrandData.brandName || '',
          tagline: existingBrandData.tagline || '',
          brandDescription: existingBrandData.description || existingBrandData.brandDescription || '',
          ...colorData,
          toneOfVoice,
          customTone: existingBrandData.customTone || '',
          logos: existingBrandData.logos || []
        }));
        console.log('🔄 Force reloaded brand data:', existingBrandData);
        console.log('🎨 Processed colors:', colorData);
        console.log('🗣️ Processed tone of voice:', toneOfVoice);
      }
    } catch (error) {
      console.error('❌ Error force reloading brand data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load existing brand data on component mount
  useEffect(() => {
    console.log('🚀 Data loading useEffect triggered for user:', currentUser?.uid);
    
    const loadBrandData = async () => {
      if (!currentUser?.uid) {
        console.log('⚠️ No current user, skipping data load');
        return;
      }
      
      console.log('📥 Starting to load brand data for user:', currentUser.uid);
      
      try {
        setLoading(true);
        const existingBrandData = await getUserBrands(currentUser.uid); // Uses cache by default
        
        if (existingBrandData) {
          console.log('🔍 Raw brand data from database:', existingBrandData);
          console.log('🔍 DEBUG - existingBrandData.logos:', existingBrandData.logos);
          console.log('🔍 DEBUG - existingBrandData.mediaFiles:', existingBrandData.mediaFiles);
          
          // Handle nested color structure if it exists
          const colorData = existingBrandData.colors ? {
            primaryColor: existingBrandData.colors.primary || existingBrandData.primaryColor || '#F05A28',
            secondaryColor: existingBrandData.colors.secondary || existingBrandData.secondaryColor || '#000000',
            accentColor: existingBrandData.colors.accent || existingBrandData.accentColor || '#FFFFFF'
          } : {
            primaryColor: existingBrandData.primaryColor || '#F05A28',
            secondaryColor: existingBrandData.secondaryColor || '#000000',
            accentColor: existingBrandData.accentColor || '#FFFFFF'
          };

                  // **FIX**: Parse toneOfVoice properly - handle comma-separated strings
        let toneOfVoice = [];
        if (Array.isArray(existingBrandData.toneOfVoice)) {
          // If it's already an array, check if it contains comma-separated strings
          toneOfVoice = existingBrandData.toneOfVoice.flatMap(tone => {
            if (typeof tone === 'string' && tone.includes(',')) {
              // Split comma-separated string into individual tones
              return tone.split(',').map(t => t.trim());
            }
            return tone;
          });
        } else if (existingBrandData.toneOfVoice) {
          // If it's a string, check if it's comma-separated
          if (typeof existingBrandData.toneOfVoice === 'string' && existingBrandData.toneOfVoice.includes(',')) {
            toneOfVoice = existingBrandData.toneOfVoice.split(',').map(t => t.trim());
          } else {
            toneOfVoice = [existingBrandData.toneOfVoice];
          }
        }
        
        // Remove duplicates and empty strings
        toneOfVoice = [...new Set(toneOfVoice.filter(tone => tone && tone.trim()))];
        
        console.log('🔍 DEBUG - Raw toneOfVoice from database:', existingBrandData.toneOfVoice);
        console.log('🔍 DEBUG - Processed toneOfVoice array:', toneOfVoice);

                     // **FIX**: Process logos from mediaFiles array (primary source)
           const logoMediaFiles = existingBrandData.mediaFiles?.filter(file => file.mediaType === 'logo') || [];
           console.log('🔍 Found logo mediaFiles:', logoMediaFiles.length, logoMediaFiles);
           
           // Process logos from mediaFiles first (primary source)
           let processedLogos = logoMediaFiles.map(logoFile => {
             console.log('🔍 Processing logoFile:', logoFile);
             return {
               url: logoFile.url, // Backend returns 'url' field directly
               preview: logoFile.url, // Use same URL for preview
               uploaded: true,
               name: logoFile.filename || logoFile.fileName || 'Brand Logo', // Backend uses 'filename'
               fileId: logoFile.fileId,
               contentType: logoFile.contentType,
               storagePath: logoFile.storagePath,
               size: logoFile.fileSize,
               metadata: logoFile.metadata,
               uploadTimestamp: logoFile.uploadTimestamp
             };
           });
           
           // If no logos in mediaFiles, check legacy logos array
           if (processedLogos.length === 0 && existingBrandData.logos) {
             console.log('🔍 No mediaFiles logos found, checking legacy logos array:', existingBrandData.logos);
             processedLogos = existingBrandData.logos.map(logo => {
               // Handle different logo storage formats
               if (typeof logo === 'string') {
                 // If logo is just a URL string
                 return {
                   url: logo,
                   preview: logo,
                   uploaded: true,
                   name: 'Logo'
                 };
               } else if (logo && typeof logo === 'object') {
                 // If logo is an object, ensure it has required properties
                 return {
                   ...logo,
                   preview: logo.preview || logo.url || logo.downloadURL || logo.base64Data,
                   url: logo.url || logo.downloadURL || logo.base64Data,
                   uploaded: true
                 };
               }
               return logo;
             }).filter(Boolean); // Remove any null/undefined entries
           }

          console.log('🖼️ Processed logos:', processedLogos);
          console.log('🔍 DEBUG - Setting logos in brandData state, count:', processedLogos.length);

          setBrandData(prev => ({
            ...prev,
            brandName: existingBrandData.brandName || '',
            tagline: existingBrandData.tagline || '',
            brandDescription: existingBrandData.description || existingBrandData.brandDescription || '',
            ...colorData,
            toneOfVoice,
            customTone: existingBrandData.customTone || '',
            logos: processedLogos
          }));
          
          console.log('✅ Brand data state updated with logos');
          console.log('📋 Loaded existing brand data:', existingBrandData);
          console.log('🎨 Processed colors:', colorData);
          console.log('🗣️ Processed tone of voice:', toneOfVoice);
        }
      } catch (error) {
        console.error('❌ Error loading brand data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadBrandData();
  }, [currentUser]);

  const handleLogoUpload = async (e, replaceIndex = null) => {

    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    try {
      setErrors(prev => ({ ...prev, logos: '' }));
              setSaveStatus('Updating files...');
      
      // Validate files
      const validFiles = [];
      const errors = [];
      
      for (const file of files) {
        try {
          validateImageFile(file);
          validFiles.push(file);
        } catch (error) {
          errors.push(`${file.name}: ${error.message}`);
        }
      }

      if (errors.length > 0) {
        setErrors(prev => ({ ...prev, logos: errors.join(', ') }));
      }

      if (validFiles.length === 0) {
        setSaveStatus('');
        return;
      }

      // Show file count info
              setSaveStatus(`Updating ${validFiles.length} files...`);

      // Generate previews for valid files (with progress)
      const logoPromises = validFiles.map(async (file, index) => {
        setSaveStatus(`Generating preview ${index + 1}/${validFiles.length}...`);
        const preview = await generateFilePreview(file);
        return {
          file,
          preview: preview.preview,
          name: file.name,
          size: file.size,
          uploaded: false,
          url: null
        };
      });

      const newLogos = await Promise.all(logoPromises);
      
      setBrandData(prev => {
        if (replaceIndex !== null) {
          // Replace logo at specific index
          const updatedLogos = [...prev.logos];
          updatedLogos[replaceIndex] = newLogos[0]; // Replace with first new logo
          return {
            ...prev,
            logos: updatedLogos
          };
        } else {
          // Add new logos
          return {
            ...prev,
            logos: [...prev.logos, ...newLogos]
          };
        }
      });

      setSaveStatus(`✅ ${newLogos.length} files ready for upload!`);
      console.log('📷 Added', newLogos.length, 'logo files for upload');
      
      // Clear status after 2 seconds
      setTimeout(() => setSaveStatus(''), 2000);
      
    } catch (error) {
      setErrors(prev => ({ ...prev, logos: error.message }));
      setSaveStatus('');
    }
  };

  // Unused function - kept for potential future use
  // eslint-disable-next-line no-unused-vars
  const editLogo = (index) => {
    // Trigger file input for the specific logo
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = async (e) => {
      if (e.target.files && e.target.files[0]) {
        await handleLogoUpload(e, index); // Pass index to replace specific logo
      }
    };
    fileInput.click();
  };

  const removeLogo = async (index) => {
    // Allow logo deletion without subscription requirement
    const logo = brandData.logos[index];
    
    // If logo was uploaded to storage, delete it
    if (logo.uploaded && logo.storagePath) {
      try {
        await deleteFile(logo.storagePath);
        console.log('🗑️ Deleted logo from storage:', logo.name);
      } catch (error) {
        console.error('❌ Error deleting logo from storage:', error);
      }
    }
    
    // Remove logo from state
    setBrandData(prev => ({
      ...prev,
      logos: prev.logos.filter((_, i) => i !== index)
    }));
    
    console.log('🗑️ Logo removed from brand data:', logo.name);
  };

  const handleColorChange = async (colorType, color) => {
    // Allow color changes without subscription requirement
    const updatedBrandData = {
      ...brandData,
      [colorType]: color
    };
    
    setBrandData(updatedBrandData);
    console.log('🎨 Color changed:', colorType, color);
    
    // **DISABLED AUTO-SAVE**: Only save on final submit to prevent excessive API calls
    // await autoSaveBrandData(updatedBrandData, `${colorType} color change`);
  };

  const handleInputChange = (field, value) => {
    // Allow input changes without subscription blocking
    setBrandData(prev => ({
      ...prev,
      [field]: value
    }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleToneSelection = async (tone) => {
    console.log('🎯 Tone selection clicked:', tone);
    console.log('🎯 Current toneOfVoice:', brandData.toneOfVoice);
    
    // Allow tone selection without subscription blocking
    const toneArray = Array.isArray(brandData.toneOfVoice) ? brandData.toneOfVoice : [];
    // Remove duplicates from existing array
    const uniqueToneArray = [...new Set(toneArray)];
    const isSelected = uniqueToneArray.includes(tone);
    
    console.log('🎯 Tone selection state:', {
      tone,
      toneArray,
      uniqueToneArray,
      isSelected,
      currentLength: uniqueToneArray.length
    });
    
    let updatedToneArray;
    let updatedBrandData = { ...brandData };
    
    if (isSelected) {
      // Remove from selection - this should always work for selected items
      console.log('🎯 Removing tone from selection:', tone);
      updatedToneArray = [...new Set(uniqueToneArray.filter(t => t !== tone))];
      setBrandData(prev => ({
        ...prev,
        toneOfVoice: updatedToneArray
      }));
      updatedBrandData.toneOfVoice = updatedToneArray;
    } else if (uniqueToneArray.length < 3) {
      // Add to selection only if under limit
      console.log('🎯 Adding tone to selection:', tone);
      updatedToneArray = [...new Set([...uniqueToneArray, tone])];
      setBrandData(prev => ({
        ...prev,
        toneOfVoice: updatedToneArray
      }));
      updatedBrandData.toneOfVoice = updatedToneArray;
    } else {
      console.log('🎯 Cannot add tone - limit reached (3/3)');
      return; // Don't save if no changes made
    }
    
    // **DISABLED AUTO-SAVE**: Only save on final submit to prevent excessive API calls
    // await autoSaveBrandData(updatedBrandData, 'tone selection');
  };

  // Helper function to auto-save brand data to database
  const autoSaveBrandData = async (updatedBrandData, description = 'changes') => {
    try {
      const userId = currentUser?.uid || localStorage.getItem('incivus_user_id') || localStorage.getItem('incivus_firebase_uid');
      if (!userId) {
        console.warn('⚠️ Cannot auto-save: No user ID found');
        return false;
      }
      
      console.log(`💾 Auto-saving ${description}...`);
      setSaveStatus(`💾 Saving ${description}...`);
      
      // Prepare data for database save
      const brandDataToSave = {
        brandName: updatedBrandData.brandName,
        tagline: updatedBrandData.tagline,
        brandDescription: updatedBrandData.brandDescription,
        logos: updatedBrandData.logos,
        primaryColor: updatedBrandData.primaryColor,
        secondaryColor: updatedBrandData.secondaryColor,
        accentColor: updatedBrandData.accentColor,
        colorPalette: [
          updatedBrandData.primaryColor,
          updatedBrandData.secondaryColor,
          updatedBrandData.accentColor
        ].filter(color => color && color.trim() !== ''),
        toneOfVoice: updatedBrandData.toneOfVoice,
        customTone: (Array.isArray(updatedBrandData.toneOfVoice) && updatedBrandData.toneOfVoice.includes('Custom')) ? updatedBrandData.customTone : null,
        lastUpdated: new Date(),
        userId: userId
      };
      
      // Save to database (uses unified API with cache invalidation)
      await saveBrandData(userId, brandDataToSave);
      console.log(`✅ Auto-saved ${description} successfully`);
      setSaveStatus(`✅ ${description} saved`);
      
      // **IMPORTANT**: Don't reload data after save - trust the local state
      // The local state is already updated and correct
      console.log('💡 Skipping data reload - local state is already current');
      
      // Clear status after 2 seconds
      setTimeout(() => setSaveStatus(''), 2000);
      return true;
      
    } catch (error) {
      console.error(`❌ Error auto-saving ${description}:`, error);
      setSaveStatus(`❌ Failed to save ${description}`);
      setTimeout(() => setSaveStatus(''), 3000);
      return false;
    }
  };

  // Helper functions for editing and deleting brand parameters
  // Unused function - kept for potential future use
  // eslint-disable-next-line no-unused-vars
  const handleEditField = (fieldName) => {
    // Placeholder for future edit functionality
    console.log('Edit field:', fieldName);
  };

  const handleDeleteField = (fieldName) => {
    switch (fieldName) {
      case 'brandName':
        setBrandData(prev => ({ ...prev, brandName: '' }));
        break;
      case 'tagline':
        setBrandData(prev => ({ ...prev, tagline: '' }));
        break;
      case 'brandDescription':
        setBrandData(prev => ({ ...prev, brandDescription: '' }));
        break;
      case 'primaryColor':
        setBrandData(prev => ({ ...prev, primaryColor: '#F05A28' }));
        break;
      case 'secondaryColor':
        setBrandData(prev => ({ ...prev, secondaryColor: '#000000' }));
        break;
      case 'accentColor':
        setBrandData(prev => ({ ...prev, accentColor: '#FFFFFF' }));
        break;
      case 'toneOfVoice':
        setBrandData(prev => ({ ...prev, toneOfVoice: [] }));
        break;
      case 'logos':
        setBrandData(prev => ({ ...prev, logos: [] }));
        break;
      default:
        break;
    }
  };

  // Unused function - kept for potential future use
  // eslint-disable-next-line no-unused-vars
  const handleSaveField = async (fieldName, value) => {
    // Update local state first
    let updatedBrandData = { ...brandData };
    
    switch (fieldName) {
      case 'brandName':
        setBrandData(prev => ({ ...prev, brandName: value }));
        updatedBrandData.brandName = value;
        break;
      case 'tagline':
        setBrandData(prev => ({ ...prev, tagline: value }));
        updatedBrandData.tagline = value;
        break;
      case 'brandDescription':
        setBrandData(prev => ({ ...prev, brandDescription: value }));
        updatedBrandData.brandDescription = value;
        break;
      case 'primaryColor':
        setBrandData(prev => ({ ...prev, primaryColor: value }));
        updatedBrandData.primaryColor = value;
        break;
      case 'secondaryColor':
        setBrandData(prev => ({ ...prev, secondaryColor: value }));
        updatedBrandData.secondaryColor = value;
        break;
      case 'accentColor':
        setBrandData(prev => ({ ...prev, accentColor: value }));
        updatedBrandData.accentColor = value;
        break;
      default:
        break;
    }
    
    // **FIX**: Auto-save the field changes to database - DISABLED to prevent multiple API calls
    // await autoSaveBrandData(updatedBrandData, fieldName);
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!brandData.brandName.trim()) {
      newErrors.brandName = 'Brand name is required';
    }
    
    if (!brandData.primaryColor) {
      newErrors.primaryColor = 'Primary color is required';
    }
    
    // Make at least one tone of voice selection mandatory
    const toneArray = Array.isArray(brandData.toneOfVoice) ? brandData.toneOfVoice : [];
    if (toneArray.length === 0) {
      newErrors.toneOfVoice = 'Please select at least one tone of voice';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // **CRITICAL**: Prevent multiple submissions
    if (isSubmitting) {
      console.log('🛑 Form already submitting, ignoring duplicate submission');
      return;
    }
    
    console.log('Submit button clicked - starting save process');
    setIsSubmitting(true);
    
    // If showAnalyzeButton is true, this is the "Analyze Ad" button
    if (showAnalyzeButton) {
      // First validate and save the brand data, then redirect to analysis
      if (!validateForm()) {
        setIsSubmitting(false);
        return;
      }
      
      // Continue with saving the brand data before redirecting
      console.log('📋 Analyze Ad clicked - saving brand data first before redirect');
    }
    
    if (!validateForm()) {
      setIsSubmitting(false);
      return;
    }
    
    // Get user ID from multiple sources with fallback
    const userId = currentUser?.uid || localStorage.getItem('incivus_user_id') || localStorage.getItem('incivus_firebase_uid');
    
    console.log('🔍 User ID Detection:', {
      'currentUser?.uid': currentUser?.uid,
      'localStorage incivus_user_id': localStorage.getItem('incivus_user_id'),
      'localStorage incivus_firebase_uid': localStorage.getItem('incivus_firebase_uid'),
      'finalUserId': userId,
      'currentUser': currentUser
    });

    if (!userId) {
      setErrors({ submit: 'User not authenticated. Please log out and log back in.' });
      setIsSubmitting(false);
      return;
    }

    // Reduce timeout to 60 seconds and add more granular progress
    const timeoutId = setTimeout(() => {
      setLoading(false);
      setSaveStatus('⚠️ Save timeout - please try again');
      setErrors({ submit: 'Save operation timed out. Please check your connection and try again.' });
    }, 60000); // 60 second timeout

    try {
      setLoading(true);
      setErrors({}); // Clear previous errors
      setSaveStatus('🔄 Starting save process...');
      setUploadProgress(0);

      console.log('🎯 Save process started for user:', userId);
      console.log('📊 Brand data to save:', {
        brandName: brandData.brandName,
        logosCount: brandData.logos.length,
        colors: {
          primary: brandData.primaryColor,
          secondary: brandData.secondaryColor
        },
        toneOfVoice: brandData.toneOfVoice
      });

      // Upload logos that haven't been uploaded yet
      const logosToUpload = brandData.logos.filter(logo => !logo.uploaded && logo.file);
      let uploadedLogos = brandData.logos.filter(logo => logo.uploaded);

      console.log(`📤 Found ${logosToUpload.length} logos to upload, ${uploadedLogos.length} already uploaded`);

      if (logosToUpload.length > 0) {
        setSaveStatus(`📤 Uploading ${logosToUpload.length} logos...`);
        const files = logosToUpload.map(logo => logo.file);
        
        console.log('🚀 Starting logo upload for user:', userId);
        console.log('📦 Files to upload:', files.map(f => ({ name: f.name, size: f.size })));
        
        try {
          // Upload logos using GCS storage (via middleware)
          console.log('🔄 Uploading logos to GCS storage via middleware');
          const uploadResults = await uploadBrandLogos(
            files, 
            userId, // Use verified user ID
            (progress) => {
              console.log(`📈 Upload progress: ${progress}%`);
              setUploadProgress(progress);
              setSaveStatus(`📤 Uploading logos: ${progress}%`);
            }
          );

          console.log('✅ Logo upload completed:', uploadResults);

          // Update logos with upload results
          const newUploadedLogos = uploadResults.map((result, index) => ({
            name: result.name,
            size: result.size,
            url: result.url,
            storagePath: result.path,
              uploaded: true,
              uploadedAt: new Date()
            }));

            uploadedLogos = [...uploadedLogos, ...newUploadedLogos];
            console.log('📝 Updated logos array:', uploadedLogos.length, 'total logos');
        } catch (uploadError) {
          console.error('❌ Logo upload failed:', uploadError);
          setSaveStatus('⚠️ Logo upload failed, continuing with other data...');
          // Don't throw error, continue with form submission
        }
      }

      setSaveStatus('💾 Saving brand data to database...');
      console.log('💾 Starting database save for user:', userId);

      // Prepare brand data for database
      const brandDataToSave = {
        brandName: brandData.brandName,
        tagline: brandData.tagline,
        brandDescription: brandData.brandDescription,
        logos: uploadedLogos, // Use uploaded logos with URLs
        logoFiles: brandData.logos?.map(logo => logo.file).filter(Boolean) || [], // Convert logos to logoFiles for API
        primaryColor: brandData.primaryColor,
        secondaryColor: brandData.secondaryColor,
        accentColor: brandData.accentColor,
        // Create colorPalette array from individual colors
        colorPalette: [
          brandData.primaryColor,
          brandData.secondaryColor,
          brandData.accentColor
        ].filter(color => color && color.trim() !== ''), // Remove empty colors
        toneOfVoice: brandData.toneOfVoice, // Array of selected tones
        customTone: (Array.isArray(brandData.toneOfVoice) && brandData.toneOfVoice.includes('Custom')) ? brandData.customTone : null,
        lastUpdated: new Date(),
        completedAt: new Date(),
        userId: userId, // Use verified user ID
        debug: {
          savedAt: new Date().toISOString(),
          authMethod: currentUser ? 'currentUser' : 'localStorage'
        }
      };

      console.log('📋 Final brand data to save:', brandDataToSave);
      console.log('🔍 Debug - logos array:', brandData.logos);
      console.log('🔍 Debug - logoFiles array:', brandDataToSave.logoFiles);
      console.log('🔍 Debug - logoFiles length:', brandDataToSave.logoFiles?.length);

      // **OPTIMIZATION**: Removed redundant FormData creation and duplicate API call
      // The saveBrandData call below already creates FormData and calls /branddata-form
      // This eliminates 10+ duplicate API calls!
      
      // Save to database with error details (uses unified API with cache invalidation)
      setSaveStatus('💾 Saving to database...');
      console.log('🔄 Calling saveBrandData function for user:', userId);
      await saveBrandData(userId, brandDataToSave);
      console.log('✅ saveBrandData completed successfully for user:', userId);

      // **FIX**: Immediately update local state with uploaded logos to prevent re-upload
      setBrandData(prev => ({
        ...prev,
        logos: uploadedLogos
      }));
      
      console.log('✅ Updated local state with uploaded logos - no need to re-upload');

      // Clear timeout since save was successful
      clearTimeout(timeoutId);

      setSaveStatus('✅ Brand setup saved successfully!');
      
      // Set completion flag in localStorage with timestamp for cache invalidation
      localStorage.setItem('incivus_brand_setup_complete', 'true');
      localStorage.setItem('incivus_brand_config', JSON.stringify(brandDataToSave));
      localStorage.setItem('incivus_brand_config_timestamp', new Date().toISOString());
      
      // Clear any old brand data cache to ensure fresh data is loaded
      localStorage.removeItem('incivus_brand_cache');
      localStorage.removeItem('incivus_old_brand_config');
      
      // **FIX**: Update local state with saved logos to avoid need for double upload
      console.log('🔄 Updating local state with saved brand data...');
      setBrandData(prev => ({
        ...prev,
        logos: uploadedLogos // Update with uploaded logos that have URLs
      }));
      
      // **FIX**: Only force refresh if NOT redirecting to Analysis page
      // If redirecting to Analysis, that page will fetch fresh data on mount
      if (!showAnalyzeButton) {
        setTimeout(async () => {
          try {
            await forceReloadBrandData();
            console.log('✅ Brand data reloaded after save');
          } catch (error) {
            console.error('❌ Failed to reload brand data after save:', error);
          }
        }, 2000); // Wait 2 seconds for backend to process
      } else {
        console.log('⏭️ Skipping force reload - redirecting to Analysis page');
      }
      
      if (onSave) {
        // If this was triggered by Analyze Ad button, include redirect flag
        if (showAnalyzeButton) {
          onSave({ ...brandDataToSave, redirectToAnalysis: true });
        } else {
          onSave(brandDataToSave);
        }
      }

      console.log('🎉 Complete brand setup save process finished successfully for user:', userId);

    } catch (error) {
      console.error('❌ Detailed error saving brand setup:', {
        error: error,
        message: error.message,
        stack: error.stack,
        code: error.code,
        userId: userId,
        currentUser: currentUser
      });
      
      clearTimeout(timeoutId);
      
      setErrors({ 
        submit: `Save failed: ${error.message || 'Unknown error'}. User ID: ${userId}. Check console for details.` 
      });
      setSaveStatus('❌ Save failed - check console for details');
    } finally {
      setLoading(false);
      setUploadProgress(0);
      setIsSubmitting(false); // Reset submission flag
      
      // Clear status message after 5 seconds for success, 10 seconds for errors
      setTimeout(() => {
        setSaveStatus('');
      }, saveStatus.includes('✅') ? 5000 : 10000);
    }
  };

  if (loading && brandData.logos.length === 0 && !showAnalyzeButton) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '400px',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <Loader size={40} style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'var(--text-light)' }}>Loading brand setup...</p>
      </div>
    );
  }

  return (
    <div style={{
      padding: '2rem',
      maxWidth: '900px',
      margin: '0 auto',
      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.9) 100%)',
      backdropFilter: 'blur(20px)',
      borderRadius: '24px',
      border: '1px solid rgba(124, 58, 237, 0.06)',
      boxShadow: '0 8px 32px rgba(124, 58, 237, 0.08), 0 1px 3px rgba(124, 58, 237, 0.1)'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <h2 style={{
            color: '#5b21b6',
            fontSize: '1.75rem',
            fontWeight: '700',
            margin: 0
          }}>
            Brand Setup
          </h2>
          <button
            type="button"
            onClick={forceReloadBrandData}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: loading ? '#9ca3af' : '#f3f4f6',
              color: loading ? '#ffffff' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.target.style.background = '#e5e7eb';
              }
            }}
            onMouseOut={(e) => {
              if (!loading) {
                e.target.style.background = '#f3f4f6';
              }
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              <path d="M3 21v-5h5"/>
            </svg>
            {loading ? 'Loading...' : 'Refresh Data'}
          </button>
        </div>
        <p style={{
          color: 'var(--text-muted)',
          fontSize: '1rem',
          margin: 0
        }}>
          Configure your complete brand identity with multiple logos, colors, and tone of voice
        </p>
      </div>

      {/* Save Status */}
      {saveStatus && (
        <div style={{
          padding: '1rem',
          marginBottom: '2rem',
          backgroundColor: saveStatus.includes('✅') ? '#e8f5e8' : '#fff3cd',
          border: `1px solid ${saveStatus.includes('✅') ? '#c3e6c3' : '#ffeaa7'}`,
          borderRadius: '8px',
          color: saveStatus.includes('✅') ? '#2d5a2d' : '#856404',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          {saveStatus.includes('✅') ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {saveStatus}
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div style={{
              marginLeft: '1rem',
              flex: 1,
              backgroundColor: '#e9ecef',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${uploadProgress}%`,
                height: '8px',
                backgroundColor: '#007bff',
                transition: 'width 0.3s ease'
              }} />
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Brand Information */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ 
            color: 'var(--text-dark)', 
            marginBottom: '1rem',
            fontSize: '1.25rem',
            fontWeight: '600'
          }}>
            Brand Information
          </h3>
          
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '500',
                color: 'var(--text-dark)'
              }}>
                Brand Name *
              </label>
              <input
                type="text"
                value={brandData.brandName}
                onChange={(e) => handleInputChange('brandName', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: errors.brandName ? '1px solid #ef4444' : '1px solid var(--border-gray)',
                  borderRadius: '6px',
                  fontSize: '1rem'
                }}
                placeholder="Enter your brand name"
              />
              {errors.brandName && (
                <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                  {errors.brandName}
                </p>
              )}
            </div>
            
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '500',
                color: 'var(--text-dark)'
              }}>
                Tagline
              </label>
              <input
                type="text"
                value={brandData.tagline}
                onChange={(e) => handleInputChange('tagline', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid var(--border-gray)',
                  borderRadius: '6px',
                  fontSize: '1rem'
                }}
                placeholder="Your brand tagline"
              />
            </div>
          </div>
          
          <div style={{ marginTop: '1rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '500',
              color: 'var(--text-dark)'
            }}>
              Brand Description
            </label>
            <textarea
              value={brandData.brandDescription}
              onChange={(e) => handleInputChange('brandDescription', e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--border-gray)',
                borderRadius: '6px',
                fontSize: '1rem',
                minHeight: '80px',
                resize: 'vertical'
              }}
              placeholder="Describe your brand, values, and what makes it unique..."
            />
          </div>
        </div>

        {/* Logo Upload */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ 
            color: 'var(--text-dark)', 
            marginBottom: '1rem',
            fontSize: '1.25rem',
            fontWeight: '600'
          }}>
            Brand Logos
          </h3>

          {/* Upload Optimizer */}
          <UploadOptimizer onOptimizationChange={setOptimizationSettings} />
          
          <div style={{
            border: '2px dashed var(--border-gray)',
            borderRadius: '8px',
            padding: '2rem',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color 0.2s',
            backgroundColor: 'var(--very-light-purple)',
            marginBottom: '1rem'
          }}
          onClick={() => document.getElementById('logo-upload').click()}>
            <Plus size={40} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
            <p style={{ color: 'var(--text-dark)', marginBottom: '0.25rem' }}>
              Click to upload brand logos
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              PNG, JPG, WebP, SVG up to 5MB each. Images will be optimized for faster upload.
            </p>
          </div>
          
          <input
            id="logo-upload"
            type="file"
            accept="image/*"
            multiple
            onChange={handleLogoUpload}
            style={{ display: 'none' }}
          />
          
          {/* Logo Previews */}
          {brandData.logos.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '1rem',
              marginTop: '1rem'
            }}>
              {brandData.logos.map((logo, index) => (
                <div key={index} style={{
                  position: 'relative',
                  border: '1px solid var(--border-gray)',
                  borderRadius: '8px',
                  padding: '0.5rem',
                  backgroundColor: 'var(--very-light-purple)'
                }}>
                  
                  {/* Delete button */}
                  <button
                    onClick={() => removeLogo(index)}
                    style={{
                      position: 'absolute',
                      top: '0.25rem',
                      right: '0.25rem',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      zIndex: 10,
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = '#dc2626';
                      e.target.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = '#ef4444';
                      e.target.style.transform = 'scale(1)';
                    }}
                    title="Remove logo"
                  >
                    <X size={12} />
                  </button>
                  
                  {(logo.preview || logo.url || logo.downloadURL || logo.base64Data) ? (
                    <img
                      src={logo.preview || logo.url || logo.downloadURL || logo.base64Data}
                      alt={logo.name || 'Brand Logo'}
                      style={{
                        width: '100%',
                        height: '80px',
                        objectFit: 'contain',
                        marginBottom: '0.5rem'
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '80px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#f8f9fa',
                      marginBottom: '0.5rem'
                    }}>
                      <Image size={24} color="#6c757d" />
                    </div>
                  )}
                  
                  <p style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    margin: 0,
                    textAlign: 'center',
                    wordBreak: 'break-word'
                  }}>
                    {logo.name}
                  </p>
                  
                  {logo.uploaded && (
                    <div style={{
                      fontSize: '0.7rem',
                      color: '#28a745',
                      textAlign: 'center',
                      marginTop: '0.25rem'
                    }}>
                      Uploaded
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {errors.logos && (
            <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              {errors.logos}
            </p>
          )}
        </div>

        {/* Brand Colors */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ 
            color: 'var(--text-dark)', 
            marginBottom: '1rem',
            fontSize: '1.25rem',
            fontWeight: '600'
          }}>
            Brand Colors
          </h3>
          
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {/* Primary Color */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <label style={{
                  fontWeight: '500',
                  color: 'var(--text-dark)'
                }}>
                  Primary Color *
                </label>
                <button
                  type="button"
                  onClick={() => handleDeleteField('primaryColor')}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    borderRadius: '4px',
                    color: '#ef4444'
                  }}
                  title="Reset primary color"
                >
                  <RefreshCw size={12} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="color"
                  value={brandData.primaryColor}
                  onChange={(e) => handleColorChange('primaryColor', e.target.value)}
                  style={{
                    width: '50px',
                    height: '40px',
                    border: '1px solid var(--border-gray)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    padding: '0'
                  }}
                />
                <input
                  type="text"
                  value={brandData.primaryColor}
                  onChange={(e) => handleColorChange('primaryColor', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    border: errors.primaryColor ? '1px solid #ef4444' : '1px solid var(--border-gray)',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                  placeholder="#F05A28"
                />
              </div>
              {errors.primaryColor && (
                <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                  {errors.primaryColor}
                </p>
              )}
            </div>

            {/* Secondary Color */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <label style={{
                  fontWeight: '500',
                  color: 'var(--text-dark)'
                }}>
                  Secondary Color
                </label>
                <button
                  type="button"
                  onClick={() => handleDeleteField('secondaryColor')}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    borderRadius: '4px',
                    color: '#ef4444'
                  }}
                  title="Reset secondary color"
                >
                  <RefreshCw size={12} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="color"
                  value={brandData.secondaryColor}
                  onChange={(e) => handleColorChange('secondaryColor', e.target.value)}
                  style={{
                    width: '50px',
                    height: '40px',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                />
                <input
                  type="text"
                  value={brandData.secondaryColor}
                  onChange={(e) => handleColorChange('secondaryColor', e.target.value)}
                  placeholder="#000000"
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    border: '1px solid var(--border-gray)',
                    borderRadius: '8px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>


          </div>

          {/* Color Preview */}
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            border: '1px solid var(--border-gray)',
            borderRadius: '8px',
            backgroundColor: '#f8f9fa'
          }}>
            <p style={{ marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-dark)' }}>Color Preview</p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{
                width: '80px',
                height: '40px',
                backgroundColor: brandData.primaryColor,
                borderRadius: '4px',
                border: '1px solid rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: brandData.primaryColor === '#FFFFFF' ? '#000' : '#FFF',
                fontSize: '0.7rem',
                fontWeight: '500'
              }}>
                Primary
              </div>
              <div style={{
                width: '80px',
                height: '40px',
                backgroundColor: brandData.secondaryColor,
                borderRadius: '4px',
                border: '1px solid rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: brandData.secondaryColor === '#FFFFFF' ? '#000' : '#FFF',
                fontSize: '0.7rem',
                fontWeight: '500'
              }}>
                Secondary
              </div>

            </div>
          </div>
        </div>

        {/* Tone of Voice */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ 
            color: 'var(--text-dark)', 
            marginBottom: '1rem',
            fontSize: '1.25rem',
            fontWeight: '600'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MessageSquare size={20} />
              Tone of Voice
            </div>
          </h3>
          
          <div style={{ marginBottom: '0.5rem' }}>
            <p style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>
              Select up to 3 tone characteristics that best represent your brand <span style={{ color: '#ef4444' }}>*</span>
            </p>
            {errors.toneOfVoice && (
              <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {errors.toneOfVoice}
              </p>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
            {toneOptions.map((tone) => {
              // Ensure toneOfVoice is an array and remove duplicates
              const toneArray = Array.isArray(brandData.toneOfVoice) ? brandData.toneOfVoice : [];
              const uniqueToneArray = [...new Set(toneArray)];
              const isSelected = uniqueToneArray.includes(tone);
              // Selected items can always be clicked (to deselect), unselected items only if under limit
              const canClick = isSelected || uniqueToneArray.length < 3;
              
              console.log(`🎯 Tone ${tone}:`, { isSelected, canClick, currentCount: uniqueToneArray.length });
              
              return (
                <button
                  key={tone}
                  type="button"
                  onClick={() => handleToneSelection(tone)}
                  disabled={false} // Never disable - let the handler decide
                  style={{
                    padding: '0.75rem',
                    border: isSelected ? '2px solid var(--primary-purple)' : '1px solid var(--border-gray)',
                    borderRadius: '8px',
                    background: isSelected ? '#f3e8ff' : canClick ? 'white' : '#f8f9fa',
                    color: isSelected ? 'var(--primary-purple)' : canClick ? 'var(--text-dark)' : 'var(--text-light)',
                    cursor: canClick ? 'pointer' : 'not-allowed',
                    fontSize: '0.875rem',
                    fontWeight: isSelected ? '600' : '400',
                    transition: 'all 0.2s',
                    opacity: canClick ? 1 : 0.6
                  }}
                >
                  {tone}
                  {isSelected && <span style={{ marginLeft: '0.5rem', display: 'inline-block', width: '8px', height: '14px', borderBottom: '2px solid currentColor', borderRight: '2px solid currentColor', transform: 'rotate(45deg)' }}></span>}
                </button>
              );
            })}
          </div>
          
          {Array.isArray(brandData.toneOfVoice) && brandData.toneOfVoice.length > 0 && (
            <div style={{ 
              padding: '0.75rem', 
              background: 'var(--very-light-purple)', 
              borderRadius: '6px',
              marginBottom: '1rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-dark)', margin: 0 }}>
                  Selected: {[...new Set(brandData.toneOfVoice)].join(', ')} ({[...new Set(brandData.toneOfVoice)].length}/3)
                </p>
                <button
                  type="button"
                  onClick={() => {
                    console.log('🎯 Clearing all tone selections');
                    setBrandData(prev => ({
                      ...prev,
                      toneOfVoice: []
                    }));
                  }}
                  style={{
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
          

        </div>

        {/* Error Display */}
        {errors.submit && (
          <div style={{
            padding: '1rem',
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: '8px',
            marginBottom: '2rem',
            color: '#d32f2f',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <AlertCircle size={16} />
            {errors.submit}
          </div>
        )}

        {/* Submit Button */}
        <div style={{ textAlign: 'center' }}>
          <button
            type="submit"
            disabled={loading || isSubmitting}
            style={{
              background: (loading || isSubmitting) ? '#ccc' : 'linear-gradient(135deg, var(--primary-purple), #7c3aed)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '1rem 2rem',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: (loading || isSubmitting) ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'transform 0.2s',
              minWidth: '200px',
              justifyContent: 'center'
            }}
          >
            {(loading || isSubmitting) ? (
              <>
                <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
                {showAnalyzeButton ? 'Updating...' : 'Saving...'}
              </>
            ) : showAnalyzeButton ? (
              <>
                <BarChart3 size={20} />
                Analyze Ad
              </>
            ) : (
              <>
                <Save size={20} />
                Save Brand Setup
              </>
            )}
          </button>
        </div>
      </form>

      {/* Clean interface - all debug components removed */}

    </div>
  );
};

// Export the EnhancedBrandSetup component
export default EnhancedBrandSetup;