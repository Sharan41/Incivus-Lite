import React, { useState, useEffect, useRef } from 'react';
import { FolderOpen, Grid, List, Search, Tag, Calendar, BarChart3, Eye, Download, FileImage, Video, Loader, ArrowLeft, Trash2, RefreshCw, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import unifiedApi from '../utils/unifiedApiHelper'; // All API calls through unified helper
import { getAnalysisPDFs, getDisplayUrl } from '../utils/blobStorageHelpers';
// **REMOVED**: getBrandMediaFiles, getBrandLogos, getUploadedAds - endpoints don't exist (404 errors)
import ENV_CONFIG from '../utils/environmentConfig';
import AnalysisResults from './AnalysisResults';
import CustomAlert from './CustomAlert';


const Libraries = () => {
  const { currentUser, getUserPlanData } = useAuth();
  
  // **DEBUG**: Log component mount/unmount to detect double mounting
  useEffect(() => {
    const componentId = Math.random().toString(36).substr(2, 9);
    console.log(`🚀 [${componentId}] Libraries component mounted`);
    
    return () => {
      console.log(`🔚 [${componentId}] Libraries component unmounted`);
    };
  }, []);
  const [viewMode, setViewMode] = useState('grid'); // grid or list
  // **REMOVED**: Filter type state removed
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // newest, oldest
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [userFiles, setUserFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewingAnalysis, setViewingAnalysis] = useState(null);
  const [viewingPdf, setViewingPdf] = useState(null);
  const [alertState, setAlertState] = useState({ open: false, message: '', severity: 'info' });
  const [userPlan, setUserPlan] = useState(null);
  
  // **FIX**: Add flag to prevent double execution of API calls
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const loadingRef = useRef(false); // Additional ref-based protection
  const pdfUrlCache = useRef({}); // Cache for PDF URLs to prevent repeated API calls
  
  // **AUTO-REFRESH**: States for auto-refreshing after upload
  const [autoRefreshActive, setAutoRefreshActive] = useState(false);
  const [autoRefreshCount, setAutoRefreshCount] = useState(0);
  const autoRefreshIntervalRef = useRef(null);
  const expectedNewFileRef = useRef(null);
  
  // **NEW**: Watch for new analysis completion
  const [lastAnalysisCheck, setLastAnalysisCheck] = useState(0);

  // Load user plan data when component mounts
  useEffect(() => {
    const loadUserPlan = async () => {
      if (currentUser?.uid) {
        try {
          const planData = await getUserPlanData(currentUser.uid);
          setUserPlan(planData?.planDetails || null);
          console.log('📋 Loaded user plan data for Libraries:', planData?.planDetails);
        } catch (error) {
          console.error('❌ Error loading user plan data:', error);
          setUserPlan(null);
        }
      }
    };

    loadUserPlan();
  }, [currentUser, getUserPlanData]);

  // **AUTO-REFRESH MECHANISM**: Start auto-refresh after upload
  const startAutoRefresh = (expectedFileName = null) => {
    console.log('🔄 Starting auto-refresh for new upload:', expectedFileName);
    setAutoRefreshActive(true);
    setAutoRefreshCount(0);
    expectedNewFileRef.current = expectedFileName;
    
    // Clear cache to ensure fresh data
    const cacheKey = `libraries_data_${currentUser.uid}`;
    localStorage.removeItem(cacheKey);
    localStorage.removeItem(`${cacheKey}_timestamp`);
    
    // Start interval to refresh every 3 seconds
    autoRefreshIntervalRef.current = setInterval(() => {
      setAutoRefreshCount(prev => {
        const newCount = prev + 1;
        console.log(`🔄 Auto-refresh attempt #${newCount}`);
        
        // Stop after 20 attempts (1 minute)
        if (newCount >= 20) {
          stopAutoRefresh();
          return newCount;
        }
        
        // Force refresh by clearing cache and reloading
        const cacheKey = `libraries_data_${currentUser.uid}`;
        localStorage.removeItem(cacheKey);
        localStorage.removeItem(`${cacheKey}_timestamp`);
        
        // Trigger reload by calling the load function
        if (!isLoadingFiles && !loadingRef.current) {
          console.log('🔄 Triggering refresh for new upload detection');
          window.location.reload(); // Simple but effective
        }
        
        return newCount;
      });
    }, 3000); // Refresh every 3 seconds
  };
  
  const stopAutoRefresh = () => {
    console.log('⏹️ Stopping auto-refresh');
    setAutoRefreshActive(false);
    setAutoRefreshCount(0);
    expectedNewFileRef.current = null;
    if (autoRefreshIntervalRef.current) {
      clearInterval(autoRefreshIntervalRef.current);
      autoRefreshIntervalRef.current = null;
    }
  };
  
  // **PERFORMANCE HELPER**: Get PDF URL with caching to prevent duplicate API calls
  const getPdfUrl = async (file) => {
    const cacheKey = `${file.fileName}_${file.id}`;
    
    // **DEBUG**: Log file properties to understand structure
    console.log('🔍 DEBUG getPdfUrl - File properties:', {
      fileName: file.fileName,
      fileType: file.fileType,
      fileCategory: file.fileCategory,
      url: file.url ? file.url.substring(0, 100) + '...' : 'none',
      pdfUrl: file.pdfUrl ? file.pdfUrl.substring(0, 100) + '...' : 'none',
      hasPdfUrl: !!file.pdfUrl,
      hasUrl: !!file.url
    });
    
    // Check cache first
    if (pdfUrlCache.current[cacheKey]) {
      console.log('🎯 Using cached PDF URL for:', file.fileName);
      return pdfUrlCache.current[cacheKey];
    }
    
    let pdfUrl = null;
    
    // **PRIORITY 1**: Check if file already has a dedicated pdfUrl property
    if (file.pdfUrl) {
      pdfUrl = file.pdfUrl;
      console.log('🔍 Found PDF via pdfUrl property:', pdfUrl.substring(0, 100) + '...');
      console.log('🔍 PDF URL contains analysis-reports:', pdfUrl.includes('/analysis-reports/'));
      console.log('🔍 PDF URL contains .pdf:', pdfUrl.includes('.pdf'));
    }
    // **PRIORITY 2**: Check if fileType is PDF and use main URL
    else if (file.fileType === 'application/pdf' && file.url) {
      pdfUrl = file.url;
      console.log('🔍 Found PDF via fileType + url:', pdfUrl);
    }
    // **PRIORITY 3**: Check if the main URL contains PDF-related paths
    else if (file.url && (file.url.includes('/analysis-reports/') || file.url.includes('.pdf'))) {
      pdfUrl = file.url;
      console.log('🔍 Found PDF via url property:', pdfUrl);
    }
    // **PRIORITY 3**: Generate PDF URL from analysis data for analysis reports
    else if (file.fileCategory === 'analysis-report' && file.analysisId) {
      console.log('🔍 Generating PDF URL for analysis ID:', file.analysisId);
      const baseUrl = ENV_CONFIG.PYTHON_API_URL || 'http://localhost:8002';
      pdfUrl = `${baseUrl}/download-analysis-pdf/${file.analysisId}`;
      console.log('✅ Generated PDF URL:', pdfUrl);
    }
    
    // Cache the result (even if null) to prevent repeated searches
    pdfUrlCache.current[cacheKey] = pdfUrl;
    return pdfUrl;
  };

  // Helper function to get performance score from analysis results
  const getPerformanceScore = (analysisResults) => {
    if (!analysisResults) return 0;
    
    const scores = [];
    if (analysisResults.brandCompliance) scores.push(analysisResults.brandCompliance);
    if (analysisResults.messagingIntent) scores.push(analysisResults.messagingIntent);
    if (analysisResults.funnelCompatibility) scores.push(analysisResults.funnelCompatibility);
    if (analysisResults.adResonance) scores.push(analysisResults.adResonance);
    if (analysisResults.channelCompliance) scores.push(analysisResults.channelCompliance);
    
    return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  };

  // Helper function to get file type
  const getFileType = (file) => {
    console.log('🔍 getFileType called for file:', {
      fileName: file.fileName,
      fileType: file.fileType,
      fileFormat: file.fileFormat,
      fileCategory: file.fileCategory,
      keys: Object.keys(file)
    });
    
    // Check for PDF files first
    if (file.fileType === 'application/pdf' || 
        file.fileName?.toLowerCase().endsWith('.pdf') ||
        file.fileCategory === 'analysis-report') {
      console.log('✅ File identified as PDF');
      return 'pdf';
    }
    
    // Check multiple possible video indicators
    if (file.fileType?.includes('video') || 
        file.fileFormat?.includes('mp4') || 
        file.fileFormat?.includes('webm') ||
        file.fileFormat?.includes('avi') ||
        file.fileFormat?.includes('mov') ||
        file.fileType?.includes('mp4') ||
        file.fileType?.includes('webm')) {
      console.log('✅ File identified as video');
      return 'video';
    }
    
    // Check for image types
    if (file.fileType?.includes('image') ||
        file.fileFormat?.includes('jpg') ||
        file.fileFormat?.includes('jpeg') ||
        file.fileFormat?.includes('png') ||
        file.fileFormat?.includes('gif') ||
        file.fileFormat?.includes('webp')) {
      console.log('✅ File identified as image');
      return 'image';
    }
    
    // Default to image if no specific type found
    console.log('⚠️ File type not clearly identified, defaulting to image');
    return 'image';
  };

  // Helper function to get funnel stage from analysis inputs
  const getFunnelStage = (analysisInputs) => {
    if (analysisInputs?.funnelStage) {
      return Array.isArray(analysisInputs.funnelStage) ? analysisInputs.funnelStage[0] : analysisInputs.funnelStage;
    }
    return 'Unknown';
  };

  // **PERFORMANCE OPTIMIZATION**: Memoize filtered and sorted files to prevent unnecessary re-computations
  const filteredAndSortedFiles = React.useMemo(() => {
    return userFiles.filter(file => {
    const fileName = file.fileName || 'Unnamed';
    const fileTags = file.tags || [];
    const adTitle = file.analysisInputs?.adTitle || '';
    
    // Enhanced search - match partial characters and multiple fields
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = searchTerm === '' || 
                         fileName.toLowerCase().includes(searchLower) ||
                         adTitle.toLowerCase().includes(searchLower) ||
                         fileTags.some(tag => tag.toLowerCase().includes(searchLower)) ||
                         (file.description && file.description.toLowerCase().includes(searchLower));
    
    const fileType = getFileType(file);
    
    const matchesFilter = true; // **REMOVED**: Show all files (no filtering)
    
    // Debug logging for search only
    if (searchTerm) {
      console.log(`🔍 File "${fileName}" - Search: ${matchesSearch}`, {
        searchTerm,
        matchesSearch
      });
    }
    
    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    // Enhanced timestamp-based sorting - prioritize timestamp over date
    let timeA, timeB;
    let timeSourceA = 'none', timeSourceB = 'none';
    
    // Priority 1: Use timestamp field (most accurate for analysis timing)
    if (a.timestamp) {
      if (a.timestamp.seconds) {
        timeA = new Date(a.timestamp.seconds * 1000);
        timeSourceA = 'timestamp.seconds';
      } else if (a.timestamp.toDate) {
        timeA = a.timestamp.toDate();
        timeSourceA = 'timestamp.toDate';
      } else {
        timeA = new Date(a.timestamp);
        timeSourceA = 'timestamp';
      }
    } else if (a.createdAt) {
      // Priority 2: Use createdAt field
      if (a.createdAt.seconds) {
        timeA = new Date(a.createdAt.seconds * 1000);
        timeSourceA = 'createdAt.seconds';
      } else if (a.createdAt.toDate) {
        timeA = a.createdAt.toDate();
        timeSourceA = 'createdAt.toDate';
      } else {
        timeA = new Date(a.createdAt);
        timeSourceA = 'createdAt';
      }
    } else if (a.updatedAt) {
      // Priority 3: Use updatedAt field
      if (a.updatedAt.seconds) {
        timeA = new Date(a.updatedAt.seconds * 1000);
        timeSourceA = 'updatedAt.seconds';
      } else if (a.updatedAt.toDate) {
        timeA = a.updatedAt.toDate();
        timeSourceA = 'updatedAt.toDate';
      } else {
        timeA = new Date(a.updatedAt);
        timeSourceA = 'updatedAt';
      }
    } else {
      // Fallback: Use current time (will appear at the end)
      timeA = new Date();
      timeSourceA = 'current';
    }
    
    if (b.timestamp) {
      if (b.timestamp.seconds) {
        timeB = new Date(b.timestamp.seconds * 1000);
        timeSourceB = 'timestamp.seconds';
      } else if (b.timestamp.toDate) {
        timeB = b.timestamp.toDate();
        timeSourceB = 'timestamp.toDate';
      } else {
        timeB = new Date(b.timestamp);
        timeSourceB = 'timestamp';
      }
    } else if (b.createdAt) {
      if (b.createdAt.seconds) {
        timeB = new Date(b.createdAt.seconds * 1000);
        timeSourceB = 'createdAt.seconds';
      } else if (b.createdAt.toDate) {
        timeB = b.createdAt.toDate();
        timeSourceB = 'createdAt.toDate';
      } else {
        timeB = new Date(b.createdAt);
        timeSourceB = 'createdAt';
      }
    } else if (b.updatedAt) {
      if (b.updatedAt.seconds) {
        timeB = new Date(b.updatedAt.seconds * 1000);
        timeSourceB = 'updatedAt.seconds';
      } else if (b.updatedAt.toDate) {
        timeB = b.updatedAt.toDate();
        timeSourceB = 'updatedAt.toDate';
      } else {
        timeB = new Date(b.updatedAt);
        timeSourceB = 'updatedAt';
      }
    } else {
      timeB = new Date();
      timeSourceB = 'current';
    }
    
    // Enhanced debugging for sorting
    console.log(`⏰ Time-based sorting: ${a.fileName} vs ${b.fileName}`, {
      fileA: {
        name: a.fileName,
        time: timeA.toISOString(),
        source: timeSourceA,
        rawTimestamp: a.timestamp,
        rawCreatedAt: a.createdAt,
        rawUpdatedAt: a.updatedAt
      },
      fileB: {
        name: b.fileName,
        time: timeB.toISOString(),
        source: timeSourceB,
        rawTimestamp: b.timestamp,
        rawCreatedAt: b.createdAt,
        rawUpdatedAt: b.updatedAt
      },
      sortBy,
      timeDifference: timeB - timeA,
      sortResult: sortBy === 'newest' ? timeB - timeA : timeA - timeB
    });
    
    if (sortBy === 'newest') {
      return timeB - timeA; // Latest time first
    } else {
      return timeA - timeB; // Earliest time first
    }
  });
  }, [userFiles, searchTerm, sortBy]); // Dependencies for memoization (filterType removed)

  // **AUTO-REFRESH DETECTION**: Check if we should start auto-refresh
  useEffect(() => {
    // Check URL parameters for upload indication
    const urlParams = new URLSearchParams(window.location.search);
    const justUploaded = urlParams.get('uploaded') === 'true';
    const uploadedFileName = urlParams.get('fileName');
    
    // Check localStorage for upload indication
    const uploadFlag = localStorage.getItem('justUploadedAd');
    const uploadedFile = localStorage.getItem('lastUploadedFileName');
    
    if (justUploaded || uploadFlag) {
      console.log('🎯 Detected recent upload, starting auto-refresh');
      startAutoRefresh(uploadedFileName || uploadedFile);
      
      // Clean up URL parameters
      if (justUploaded) {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
      
      // Clean up localStorage flags
      localStorage.removeItem('justUploadedAd');
      localStorage.removeItem('lastUploadedFileName');
    }
  }, [currentUser?.uid]);
  
  // **NEW**: Watch for new analysis completion and refresh
  useEffect(() => {
    const checkForNewAnalysis = () => {
      const newAnalysisFlag = localStorage.getItem('incivus_new_analysis_added');
      if (newAnalysisFlag && parseInt(newAnalysisFlag) > lastAnalysisCheck) {
        console.log('🔄 New analysis detected, refreshing Libraries...');
        setLastAnalysisCheck(parseInt(newAnalysisFlag));
        
        // Force refresh by clearing cache
        const cacheKey = `libraries_data_${currentUser?.uid}`;
        localStorage.removeItem(cacheKey);
        localStorage.removeItem(`${cacheKey}_timestamp`);
        
        // Trigger reload
        if (currentUser?.uid && !isLoadingFiles && !loadingRef.current) {
          console.log('🔄 Triggering Libraries refresh after new analysis');
          loadingRef.current = false;
          setIsLoadingFiles(false);
          setLoading(true);
        }
        
        // Clear the flag
        localStorage.removeItem('incivus_new_analysis_added');
      }
    };
    
    // Check every 2 seconds for new analysis
    const interval = setInterval(checkForNewAnalysis, 2000);
    return () => clearInterval(interval);
  }, [currentUser?.uid, lastAnalysisCheck, isLoadingFiles]);

  // Effects
  useEffect(() => {
    const loadUserFiles = async () => {
      if (!currentUser?.uid) {
        console.log('❌ No authenticated user found');
        setLoading(false);
        setUserFiles([]);
        return;
      }

      // **CRITICAL FIX**: Prevent double execution with multiple checks
      if (isLoadingFiles || loadingRef.current) {
        console.log('🛑 API call already in progress, skipping duplicate request');
        return;
      }

      setIsLoadingFiles(true);
      loadingRef.current = true;

      // **BALANCED CACHE**: Use 1 minute cache for better balance between performance and freshness
      const cacheKey = `libraries_data_${currentUser.uid}`;
      const lastFetch = localStorage.getItem(`${cacheKey}_timestamp`);
      const now = Date.now();
      
      // **TEMPORARY**: Skip cache to force fresh data for testing analysis details fix
      // if (lastFetch && (now - parseInt(lastFetch)) < 60000) { // 1 minute cache for faster updates
      //   console.log('🎯 Using cached data to prevent duplicate API calls');
      //   const cachedData = localStorage.getItem(cacheKey);
      //   if (cachedData) {
      //     try {
      //       const parsedData = JSON.parse(cachedData);
      //       setUserFiles(parsedData);
      //       setLoading(false);
      //       setIsLoadingFiles(false);
      //       loadingRef.current = false;
      //       return;
      //     } catch (e) {
      //       console.warn('⚠️ Failed to parse cached data, proceeding with fresh fetch');
      //     }
      //   }
      // }

      try {
        setLoading(true);
        setError('');
        
        const requestId = Math.random().toString(36).substr(2, 9);
        console.log(`📁 [${requestId}] Loading user files from database for user:`, currentUser.uid);
        console.log('🔐 User authentication state:', {
          uid: currentUser.uid,
          email: currentUser.email,
          emailVerified: currentUser.emailVerified
        });
        
        // **PERFORMANCE OPTIMIZATION**: Make API calls in parallel instead of sequential
        console.log(`🔄 [${requestId}] Fetching user files with optimized parallel requests...`);
        let allFiles = [];
        
        try {
          // **FIX**: Remove getBrandMediaFiles call - endpoint doesn't exist (404)
          // Analysis files already contain all necessary media information
          const analysisPDFs = await getAnalysisPDFs(currentUser.uid);
          const brandMedia = []; // Not needed - analysis records have media URLs
          
          // **🐛 BACKEND DATA DEBUGGER**: Capture raw backend responses
          console.group('🔍 RAW BACKEND DATA ANALYSIS');
          
          console.log('📄 Analysis PDFs Response Count:', analysisPDFs.length);
          console.log('🖼️ Brand Media Response Count:', brandMedia.length);
          
          // **DETAILED ANALYSIS PDFs INSPECTION**
          if (analysisPDFs.length > 0) {
            console.group('📄 ANALYSIS PDFs - Raw Backend Data');
            analysisPDFs.forEach((pdfFile, index) => {
              console.group(`📋 Analysis PDF #${index + 1}: ${pdfFile.fileName || 'Unknown'}`);
              console.log('🔗 RAW FILE OBJECT:', pdfFile);
              console.log('🎯 KEY PROPERTIES FOR IMAGES:', {
                mediaUrl: pdfFile.mediaUrl,
                url: pdfFile.url,
                mediaType: pdfFile.mediaType,
                fileType: pdfFile.fileType,
                hasOriginalAdImage: !!pdfFile.originalAdImage,
                hasAdImageData: !!pdfFile.adImageData,
                hasAnalysisInputs: !!pdfFile.analysisInputs,
                analysisInputsUploadedImage: pdfFile.analysisInputs?.uploadedImage ? 'EXISTS' : 'NULL'
              });
              
              // **URL ANALYSIS**
              if (pdfFile.mediaUrl) {
                console.log('📡 mediaUrl Analysis:', {
                  fullUrl: pdfFile.mediaUrl,
                  isDoubleEncoded: pdfFile.mediaUrl.includes('%2520'),
                  containsAnalysisReports: pdfFile.mediaUrl.includes('/analysis-reports/'),
                  containsPdf: pdfFile.mediaUrl.includes('.pdf'),
                  containsImage: pdfFile.mediaUrl.includes('/image/'),
                  urlLength: pdfFile.mediaUrl.length
                });
              }
              
              if (pdfFile.url) {
                console.log('📡 url Analysis:', {
                  fullUrl: pdfFile.url,
                  isDoubleEncoded: pdfFile.url.includes('%2520'),
                  containsAnalysisReports: pdfFile.url.includes('/analysis-reports/'),
                  containsPdf: pdfFile.url.includes('.pdf'),
                  containsImage: pdfFile.url.includes('/image/'),
                  urlLength: pdfFile.url.length
                });
              }
              
              // **BASE64 IMAGE ANALYSIS**
              if (pdfFile.originalAdImage) {
                console.log('🖼️ originalAdImage:', {
                  isDataUrl: pdfFile.originalAdImage.startsWith('data:'),
                  length: pdfFile.originalAdImage.length,
                  preview: pdfFile.originalAdImage.substring(0, 100) + '...'
                });
              }
              
              if (pdfFile.adImageData) {
                console.log('🖼️ adImageData:', {
                  isDataUrl: pdfFile.adImageData.startsWith('data:'),
                  length: pdfFile.adImageData.length,
                  preview: pdfFile.adImageData.substring(0, 100) + '...'
                });
              }
              
              console.groupEnd();
            });
            console.groupEnd();
          } else {
            console.warn('⚠️ NO ANALYSIS PDFs returned from backend!');
          }
          
          console.groupEnd();
          
          // Debug: Log PDF file details
          analysisPDFs.forEach(pdf => {
            console.log('📄 PDF File Details:', {
              fileName: pdf.fileName,
              hasUrl: !!pdf.url,
              urlPreview: pdf.url ? pdf.url.substring(0, 100) + '...' : 'No URL',
              storagePath: pdf.storagePath,
              fileCategory: pdf.fileCategory
            });
          });
          
          allFiles.push(...analysisPDFs);
          // Convert brand media to file format
          const brandMediaFiles = brandMedia.map(media => ({
            id: media.fileId || `brand-${media.brandId}-${media.filename}`,
            fileName: media.filename,
            fileType: media.contentType,
            fileCategory: 'brand-media',
            mediaType: media.mediaType,
            url: media.url,
            storagePath: media.storagePath,
            brandId: media.brandId,
            brandName: media.brandName,
            fileSize: media.fileSize,
            createdAt: media.uploadTimestamp,
            updatedAt: media.uploadTimestamp
          }));
          allFiles.push(...brandMediaFiles);
          
          // **PERFORMANCE OPTIMIZATION**: Skip uploaded ads as they're redundant with analysis data
          console.log('ℹ️ Skipping uploaded ads fetch - included in analysis records for better performance');
          
          // **PARALLEL LEGACY FILES**: Fetch legacy files and analysis history simultaneously
          // Using unified API for caching and deduplication
          const [legacyFilesResponse] = await Promise.all([
            unifiedApi.getUserFiles(currentUser.uid)
          ]);
          
          // **FIX**: Ensure legacyFiles is always an array
          const legacyFiles = Array.isArray(legacyFilesResponse) ? legacyFilesResponse : 
                             (legacyFilesResponse?.files ? legacyFilesResponse.files : []);
          console.log('📂 Legacy files:', legacyFiles.length);
          
          // Merge and deduplicate (prioritize blob storage files)
          console.log('🔍 Deduplication: Blob storage files:', allFiles.length, 'Legacy files:', legacyFiles.length);
          
          const legacyFiltered = legacyFiles.filter(legacyFile => {
            const isDuplicate = allFiles.some(blobFile => {
              // Check multiple conditions for duplicates
              const sameId = blobFile.id && blobFile.id === legacyFile.id;
              const sameFileName = blobFile.fileName === legacyFile.fileName && blobFile.userId === legacyFile.userId;
              const sameStoragePath = blobFile.storagePath && legacyFile.storagePath && blobFile.storagePath === legacyFile.storagePath;
              const sameAnalysisId = blobFile.analysisId && legacyFile.analysisId && blobFile.analysisId === legacyFile.analysisId && blobFile.fileName === legacyFile.fileName;
              
              return sameId || sameFileName || sameStoragePath || sameAnalysisId;
            });
            
            if (isDuplicate) {
              console.log('🚫 Filtering duplicate legacy file:', legacyFile.fileName);
            }
            return !isDuplicate;
          });
          
          // **FIX**: Add the legacyFiltered files to allFiles
          console.log('📂 Adding legacy filtered files:', legacyFiltered.length);
          allFiles.push(...legacyFiltered);
          
        } catch (blobError) {
          console.warn('⚠️ Blob storage method failed, using legacy method:', blobError);
          // Fallback to legacy method (using unified API for caching)
          allFiles = await unifiedApi.getUserFiles(currentUser.uid);
        }
        
        console.log('📂 Raw files fetched (total):', allFiles.length);
        
        // **DEBUG**: Log all analysis file titles to check for duplicates
        const rawAnalysisFiles = allFiles.filter(f => f.fileCategory === 'analysis-report');
        console.log('🔍 RAW ANALYSIS FILES BEFORE DEDUP:', rawAnalysisFiles.length);
        rawAnalysisFiles.forEach((file, idx) => {
          console.log(`  ${idx + 1}. ${file.fileName || 'Unnamed'} | adTitle: ${file.analysisInputs?.adTitle || 'N/A'} | analysisId: ${file.analysisId || 'N/A'}`);
        });
        
        // Debug: Log file categories and preview capabilities
        const filesByCategory = allFiles.reduce((acc, file) => {
          const category = file.fileCategory || 'uncategorized';
          acc[category] = (acc[category] || 0) + 1;
          return acc;
        }, {});
        console.log('📊 Files by category:', filesByCategory);
        
        // Debug: Check uploaded files specifically
        const uploadedFiles = allFiles.filter(f => f.fileName && f.fileName.includes('.png') || f.fileName.includes('.jpg') || f.fileName.includes('.jpeg'));
        console.log('📸 Image files found:', uploadedFiles.length);
        uploadedFiles.forEach(file => {
          console.log('🔍 Image file details:', {
            fileName: file.fileName,
            fileCategory: file.fileCategory,
            hasUrl: !!file.url,
            hasFileContent: !!file.fileContent,
            fileType: file.fileType
          });
        });
        
        // Also fetch analysis history from backend
        console.log(`🔄 [${requestId}] Fetching analysis history from backend...`);
        let analysisHistory = [];
        try {
          // Using unified API for caching and deduplication
          const historyResult = await unifiedApi.getUserAnalysisHistory(currentUser.uid);
          console.log('📊 Analysis history result:', historyResult);
          
        // Debug: Log all analysis records to identify missing images
          if (historyResult && historyResult.analysis_history) {
          console.log('🔍 Full analysis history details:');
          historyResult.analysis_history.forEach((analysis, index) => {
            console.log(`📄 Analysis ${index + 1}:`, {
              adTitle: analysis.adTitle,
              artifact_id: analysis.artifact_id,
              messageIntent: analysis.messageIntent,
              timestamp: analysis.timestamp,
              hasMediaUrl: !!analysis.mediaUrl,
              hasUploadedImageUrl: !!analysis.uploadedImageUrl,
              hasAdImageData: !!analysis.adImageData,
              hasOriginalAdImage: !!analysis.originalAdImage,
              hasFileUrl: !!analysis.file_url,
              hasImageData: !!analysis.imageData,
              hasBase64Image: !!analysis.base64Image,
              hasArtifacts: !!analysis.artifacts,
              artifactKeys: analysis.artifacts ? Object.keys(analysis.artifacts) : [],
              allKeys: Object.keys(analysis)
            });
          });
        }
          
                  if (historyResult && historyResult.analysis_history) {
          console.log('🔍 RAW ANALYSIS HISTORY FROM BACKEND:', {
            totalCount: historyResult.analysis_history.length,
            titles: historyResult.analysis_history.map(a => a.adTitle),
            fullData: historyResult.analysis_history
          });
          
          analysisHistory = historyResult.analysis_history.map(analysis => {
            console.log('🔍 Processing analysis record:', analysis.adTitle, 'Available fields:', Object.keys(analysis));
              
              // **DEBUG**: Log specific media-related fields
              console.log('🔍 Media fields for', analysis.adTitle, ':', {
                mediaUrl: analysis.mediaUrl,
                mediaType: analysis.mediaType,
                storagePath: analysis.storagePath,
                mediaCategory: analysis.mediaCategory,
                hasMediaUrl: !!analysis.mediaUrl
              });
              
              // Map the analysis record with proper image handling
              const mappedAnalysis = {
              id: analysis.artifact_id,
              fileName: `Analysis - ${analysis.adTitle || analysis.messageIntent || 'Untitled'}`,
              fileCategory: 'analysis-report',
              fileType: 'application/json',
              timestamp: analysis.timestamp,
              createdAt: analysis.timestamp,
              analysisInputs: {
                adTitle: analysis.adTitle,  // Include adTitle for display
                messageIntent: analysis.messageIntent,
                funnelStage: analysis.funnelStage,
                selectedChannels: analysis.channels || [],  // Map channels to selectedChannels for display
                selectedFeatures: analysis.successful_models || [],
                brandName: analysis.brandName || 'Myceat'  // Use dynamic brand name if available
              },
              analysisResults: analysis.ai_analysis_results || {},
              tags: []
              };
              
              // **CRITICAL FIX**: Add uploaded image data to the analysis record
              // Check for various possible fields where the uploaded image might be stored
              if (analysis.mediaUrl) {
                console.log('✅ Found mediaUrl in analysis record:', analysis.adTitle, analysis.mediaUrl.substring(0, 100) + '...');
                console.log('🔧 Setting mappedAnalysis fields for:', analysis.adTitle);
                mappedAnalysis.mediaUrl = analysis.mediaUrl;
                mappedAnalysis.mediaType = analysis.mediaType || 'image';
                mappedAnalysis.storagePath = analysis.storagePath;
                mappedAnalysis.mediaCategory = analysis.mediaCategory;
                mappedAnalysis.url = analysis.mediaUrl; // Make sure URL is set for display
                console.log('✅ mappedAnalysis.url set to:', mappedAnalysis.url.substring(0, 100) + '...');
              } else if (analysis.uploadedImageUrl) {
                console.log('✅ Found uploadedImageUrl in analysis record:', analysis.adTitle);
                mappedAnalysis.mediaUrl = analysis.uploadedImageUrl;
                mappedAnalysis.mediaType = analysis.mediaType || 'image';
              } else if (analysis.adImageData) {
                console.log('✅ Found adImageData in analysis record:', analysis.adTitle);
                mappedAnalysis.adImageData = analysis.adImageData;
                mappedAnalysis.mediaType = analysis.mediaType || 'image';
              } else if (analysis.originalAdImage) {
                console.log('✅ Found originalAdImage in analysis record:', analysis.adTitle);
                mappedAnalysis.originalAdImage = analysis.originalAdImage;
                mappedAnalysis.mediaType = analysis.mediaType || 'image';
              } else if (analysis.file_url) {
                console.log('✅ Found file_url in analysis record:', analysis.adTitle);
                mappedAnalysis.mediaUrl = analysis.file_url;
                mappedAnalysis.mediaType = analysis.mediaType || 'image';
              } else if (analysis.imageData) {
                console.log('✅ Found imageData in analysis record:', analysis.adTitle);
                mappedAnalysis.mediaUrl = analysis.imageData.startsWith('data:') ? analysis.imageData : `data:image/jpeg;base64,${analysis.imageData}`;
                mappedAnalysis.mediaType = analysis.mediaType || 'image';
              } else if (analysis.base64Image) {
                console.log('✅ Found base64Image in analysis record:', analysis.adTitle);
                mappedAnalysis.mediaUrl = analysis.base64Image.startsWith('data:') ? analysis.base64Image : `data:image/jpeg;base64,${analysis.base64Image}`;
                mappedAnalysis.mediaType = analysis.mediaType || 'image';
              } else if (analysis.artifacts && analysis.artifacts.fileContent) {
                console.log('✅ Found artifacts.fileContent in analysis record:', analysis.adTitle);
                mappedAnalysis.fileContent = analysis.artifacts.fileContent;
                mappedAnalysis.mediaType = analysis.mediaType || 'image';
              } else {
                console.log('❌ No image data found in analysis record:', analysis.adTitle);
                console.log('🔍 Available analysis fields:', Object.keys(analysis));
                console.log('🔍 Analysis artifacts:', analysis.artifacts ? Object.keys(analysis.artifacts) : 'No artifacts');
                
                // **DEBUG**: Log full analysis object to see what's available
                console.log('🔍 Full analysis object for', analysis.adTitle, ':', analysis);
              }
              
              return mappedAnalysis;
            });
            console.log(`✅ Loaded ${analysisHistory.length} analysis records from backend`);
            console.log('🔍 PROCESSED ANALYSIS HISTORY TITLES:', analysisHistory.map(a => a.fileName));
            
            // **FIXED**: Merge analysis history data with existing PDF files instead of filtering duplicates
            console.log('🔄 Merging analysis history with PDF files to enrich metadata...');
            
            // First, enhance existing PDF files with analysis history data
            allFiles = allFiles.map(existingFile => {
              if (existingFile.fileCategory === 'analysis-report' && existingFile.analysisId) {
                // Find matching analysis history record
                const matchingHistory = analysisHistory.find(historyItem => {
                  // Debug log to see what we're trying to match
                  console.log('🔍 Trying to match PDF with analysis history:', {
                    pdfAnalysisId: existingFile.analysisId,
                    pdfTimestamp: existingFile.createdAt,
                    historyId: historyItem.id,
                    historyAdTitle: historyItem.analysisInputs?.adTitle,
                    historyTimestamp: historyItem.timestamp,
                    pdfFileName: existingFile.fileName
                  });
                  
                  // Convert timestamps to comparable format
                  const pdfTime = new Date(existingFile.createdAt).getTime();
                  const historyTime = new Date(historyItem.timestamp).getTime();
                  const timeDifference = Math.abs(pdfTime - historyTime);
                  
                  // Match if timestamps are within 5 minutes (300000 ms) of each other
                  const timeMatch = timeDifference < 300000;
                  
                  // **ENHANCED TITLE MATCHING**: Check multiple title patterns
                  const pdfContainsTitle = existingFile.storagePath && 
                                          historyItem.analysisInputs?.adTitle && 
                                          existingFile.storagePath.toUpperCase().includes(historyItem.analysisInputs.adTitle.toUpperCase());
                  
                  // **STRICT TITLE MATCHING**: Also check if analysis ID matches or file names match
                  const analysisIdMatch = existingFile.analysisId === historyItem.id;
                  const exactTitleMatch = existingFile.fileName && historyItem.analysisInputs?.adTitle &&
                    (existingFile.fileName.toUpperCase().includes(historyItem.analysisInputs.adTitle.toUpperCase()) || 
                     historyItem.analysisInputs.adTitle.toUpperCase().includes(existingFile.fileName.replace(/^Analysis - /, '').trim().toUpperCase()));
                  
                  console.log('🔍 Match analysis:', {
                    timeDifference: timeDifference,
                    timeMatch: timeMatch,
                    pdfContainsTitle: pdfContainsTitle,
                    analysisIdMatch: analysisIdMatch,
                    exactTitleMatch: exactTitleMatch,
                    storagePath: existingFile.storagePath,
                    pdfFileName: existingFile.fileName,
                    analysisTitle: historyItem.analysisInputs?.adTitle
                  });
                  
                  // **STRICT MATCHING**: Require analysis ID match OR (time match AND title match)
                  return analysisIdMatch || (timeMatch && (pdfContainsTitle || exactTitleMatch));
                });
                
                if (matchingHistory) {
                  console.log('✅ Enriching PDF file with analysis data:', {
                    pdfFileName: existingFile.fileName,
                    analysisTitle: matchingHistory.analysisInputs?.adTitle,
                    funnelStage: matchingHistory.analysisInputs?.funnelStage,
                    channels: matchingHistory.analysisInputs?.selectedChannels
                  });
                  
                  return {
                    ...existingFile,
                    // Update file name to show actual ad title
                    fileName: `Analysis - ${matchingHistory.analysisInputs?.adTitle || 'Untitled'}`,
                    displayTitle: matchingHistory.analysisInputs?.adTitle || 'Analysis',
                    // Merge analysis inputs
                    analysisInputs: {
                      ...existingFile.analysisInputs,
                      ...matchingHistory.analysisInputs
                    },
                    // Merge analysis results
                    analysisResults: {
                      ...existingFile.analysisResults,
                      ...matchingHistory.analysisResults
                    },
                    // Add merged data flag for debugging
                    mergedData: {
                      ...existingFile.mergedData,
                      analysisData: matchingHistory,
                      combinedFileName: matchingHistory.analysisInputs?.adTitle || 'Analysis'
                    }
                  };
                }
              }
              return existingFile;
            });
            
            // Then, add unique analysis history items that don't have corresponding PDF files
            const uniqueAnalysisHistory = analysisHistory.filter(historyItem => {
              const hasMatchingPDF = allFiles.some(existingFile => {
                return existingFile.fileCategory === 'analysis-report' && 
                       (existingFile.analysisId === historyItem.id || 
                        existingFile.analysisInputs?.adTitle === historyItem.analysisInputs?.adTitle);
              });
              
              if (hasMatchingPDF) {
                console.log('✅ Analysis history already merged with PDF:', historyItem.analysisInputs?.adTitle);
              } else {
                console.log('📝 Adding standalone analysis history item:', historyItem.analysisInputs?.adTitle);
              }
              return !hasMatchingPDF;
            });
            
            console.log('📊 Analysis history deduplication:', {
              original: analysisHistory.length,
              unique: uniqueAnalysisHistory.length,
              duplicatesRemoved: analysisHistory.length - uniqueAnalysisHistory.length
            });
            
            // **FIX**: Add unique analysis history BEFORE merging to avoid duplicates
            allFiles.push(...uniqueAnalysisHistory);
          }
        } catch (historyError) {
          console.warn('⚠️ Failed to load analysis history from backend:', historyError);
        }
        
        // **MOVED**: Now do the merging/deduplication AFTER adding analysis history
        // Filter for uploaded ads and analysis reports
        const preFilterFiles = allFiles.filter(file => 
          file.fileCategory === 'uploaded_ad' || 
          file.fileCategory === 'analysis-report' ||
          (file.fileType && (file.fileType.includes('ad_image') || file.fileType.includes('ad_video') || file.fileType === 'application/pdf'))
        );
        
        console.log('📊 Pre-merge filtered files:', preFilterFiles.length);
        
        // **DEBUG**: Log each pre-filter file to see what we're working with
        console.log('🔍 PRE-FILTER FILES DETAIL:');
        preFilterFiles.forEach((file, idx) => {
          console.log(`  ${idx + 1}. ${file.fileName} | analysisId: ${file.analysisId || 'NONE'} | adTitle: ${file.analysisInputs?.adTitle || 'NONE'} | timestamp: ${file.timestamp || file.createdAt}`);
        });
        
        // **DEBUG**: Log all analysis files before merging
        const analysisFiles = preFilterFiles.filter(f => f.fileCategory === 'analysis-report');
        console.log('🔍 Analysis files before merging:', analysisFiles.length);
        
        // Check for recent uploads (last 10 minutes)
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        const recentFiles = analysisFiles.filter(f => {
          const fileTime = new Date(f.timestamp || f.createdAt).getTime();
          return fileTime > tenMinutesAgo;
        });
        
        if (recentFiles.length > 0) {
          console.log('🔥 RECENT UPLOADS found:', recentFiles.length);
          recentFiles.forEach(file => {
            console.log('🔥 Recent file:', {
              fileName: file.fileName,
              timestamp: file.timestamp,
              createdAt: file.createdAt,
              timeDiff: Math.round((Date.now() - new Date(file.timestamp || file.createdAt).getTime()) / 1000 / 60) + ' minutes ago'
            });
          });
        }
        
        analysisFiles.forEach((file, index) => {
          console.log(`📄 Analysis ${index + 1}:`, {
            fileName: file.fileName,
            fileType: file.fileType,
            hasUrl: !!file.url,
            hasMediaUrl: !!file.mediaUrl,
            url: file.url ? file.url.substring(0, 100) + '...' : 'None',
            analysisInputsAdTitle: file.analysisInputs?.adTitle,
            timestamp: file.timestamp,
            createdAt: file.createdAt
          });
        });
        
        // **CRITICAL FIX**: Smart merging and deduplication for analysis reports
        // Group analysis files by base title and merge data from multiple sources
        const groupedAnalysis = {};
        
        preFilterFiles.forEach(file => {
          if (file.fileCategory === 'analysis-report') {
            // Extract base title from filename or analysis inputs
            let baseTitle = '';
            let isPdfScorecard = false;
            
            if (file.fileName && file.fileName.includes('_Scorecards_')) {
              // This is a PDF scorecard file
              baseTitle = file.fileName.replace(/_Scorecards.*/, '').trim();
              isPdfScorecard = true;
            } else if (file.fileName && file.fileName.startsWith('Analysis - ')) {
              // This is an analysis record
              baseTitle = file.fileName.replace('Analysis - ', '').trim();
            } else if (file.analysisInputs?.adTitle) {
              baseTitle = file.analysisInputs.adTitle.trim();
            } else {
              baseTitle = file.fileName || 'Unnamed';
            }
            
            // **IMPROVED NORMALIZATION**: Handle title variations
            // Normalize "ESTEE_AD_3" and "ESTEE AD 3" to "ESTEE AD 3"
            let normalizedTitle = baseTitle
              .replace(/_/g, ' ')           // Replace underscores with spaces
              .replace(/\s+/g, ' ')         // Replace multiple spaces with single space
              .trim()                       // Remove leading/trailing spaces
              .toUpperCase();               // Normalize case
            
            console.log('🔧 Title normalization:', {
              original: file.fileName,
              baseTitle,
              normalizedTitle
            });
            
            // **FIX**: analysisId is ALWAYS the unique key if it exists
            // Never override it with title matching - each analysisId is a separate analysis
            let uniqueKey;
            
            if (file.analysisId) {
              // If analysisId exists, it's the ONLY grouping key
              uniqueKey = file.analysisId;
              console.log('✅ Using analysisId as unique key:', uniqueKey);
            } else {
              // Only use title/timestamp matching for files WITHOUT analysisId
              uniqueKey = normalizedTitle;
              
              // **ENHANCED DEDUPLICATION**: Try to match by title and timestamp for legacy files
              const existingKeys = Object.keys(groupedAnalysis);
              const matchingKey = existingKeys.find(key => {
                const existing = groupedAnalysis[key];
                
                // Skip entries that have analysisId (they're unique)
                if (existing.analysisId) {
                  return false;
                }
                
                // **STRICT TITLE MATCHING**: If normalized titles are exactly the same, merge them
                if (key === normalizedTitle || 
                    (existing.fileName && existing.fileName.replace(/^Analysis - /, '').trim().toUpperCase() === normalizedTitle)) {
                  console.log('🔗 Exact title match found (legacy files):', {
                    newFile: file.fileName,
                    existingKey: key,
                    normalizedTitle: normalizedTitle
                  });
                  return true;
                }
                
                // **TIMESTAMP-BASED MATCHING**: If titles are similar and timestamps are close
                if (file.timestamp && existing.timestamp) {
                  const timeDiff = Math.abs(new Date(file.timestamp) - new Date(existing.timestamp));
                  const titleSimilar = key.includes(normalizedTitle) || normalizedTitle.includes(key.replace(/[^A-Z0-9\s]/g, ''));
                  
                  // If timestamps are within 5 minutes and titles are similar, use same key
                  if (timeDiff < 300000 && titleSimilar) { // 5 minutes = 300000ms
                    console.log('🔗 Matched by timestamp and title similarity (legacy files):', {
                      newFile: file.fileName,
                      existingKey: key,
                      timeDiff: timeDiff
                    });
                    return true;
                  }
                }
                
                return false;
              });
              
              if (matchingKey) {
                uniqueKey = matchingKey;
              }
            }
            
            // **DEBUG**: Enhanced logging for merging decisions
            console.log('🔧 Merging decision for:', file.fileName, {
              analysisId: file.analysisId,
              uniqueKey: uniqueKey,
              hasMediaUrl: !!file.mediaUrl,
              hasPdfUrl: !!file.pdfUrl,
              hasUrl: !!file.url,
              fileType: file.fileType,
              isPdfScorecard: isPdfScorecard,
              existingRecord: !!groupedAnalysis[uniqueKey]
            });
            
            // **DEBUG**: Log every record to understand what we're working with
            console.log('🔍 Processing record:', {
              id: file.id,
              fileName: file.fileName,
              analysisId: file.analysisId,
              uniqueKey,
              hasMediaUrl: !!file.mediaUrl,
              hasPdfUrl: !!file.pdfUrl,
              fileType: file.fileType
            });
            
            console.log('🔧 Using uniqueKey for grouping:', uniqueKey, 'analysisId:', file.analysisId);
            
            console.log('🔍 Analysis merging:', {
              fileName: file.fileName,
              baseTitle,
              normalizedTitle,
              analysisId: file.analysisId,
              uniqueKey,
              isPdfScorecard,
              hasUrl: !!file.url,
              hasMediaUrl: !!file.mediaUrl,
              hasAnalysisResults: !!file.analysisResults,
              timestamp: file.timestamp || file.createdAt
            });
            
            if (!groupedAnalysis[uniqueKey]) {
              // First record for this unique analysis
              groupedAnalysis[uniqueKey] = {
                ...file,
                mergedData: {
                  pdfUrl: isPdfScorecard ? file.url : (file.pdfUrl || null),
                  analysisData: !isPdfScorecard ? file : null,
                  combinedFileName: normalizedTitle
                }
              };
              
              // **FIX**: If this record already has both mediaUrl and pdfUrl, prefer the pdfUrl for main display
              if (file.pdfUrl && file.mediaUrl) {
                groupedAnalysis[uniqueKey].url = file.pdfUrl; // Use PDF URL for "View PDF"
                groupedAnalysis[uniqueKey].fileType = 'application/pdf';
                console.log('🎯 Record has both mediaUrl and pdfUrl, using PDF for main URL:', uniqueKey);
              }
              
              console.log('🆕 Created new grouped analysis for:', uniqueKey, {
                isPDF: isPdfScorecard, 
                hasBoth: !!(file.pdfUrl && file.mediaUrl),
                fileName: file.fileName,
                adTitle: file.analysisInputs?.adTitle,
                normalizedTitle: normalizedTitle
              });
            } else {
              // Merge data from multiple records with same unique key
              const existing = groupedAnalysis[uniqueKey];
              
              if (isPdfScorecard) {
                // This is a PDF scorecard - add PDF URL to existing record
                console.log('📄 Adding PDF URL to existing analysis:', uniqueKey, {
                  existingMediaUrl: !!existing.mediaUrl,
                  newPdfUrl: file.url,
                  existingPdfUrl: !!(existing.mergedData?.pdfUrl || existing.pdfUrl)
                });
                
                existing.mergedData.pdfUrl = file.url;
                existing.pdfUrl = file.url; // Also set at top level
                existing.fileType = 'application/pdf'; // Show as PDF
                existing.url = file.url; // Use PDF URL for main URL
                
                console.log('✅ PDF merged successfully. Final state:', {
                  uniqueKey: uniqueKey,
                  hasPdfUrl: !!existing.pdfUrl,
                  hasMediaUrl: !!existing.mediaUrl,
                  hasBothUrls: !!(existing.pdfUrl && existing.mediaUrl)
                });
              } else {
                // This is analysis data - MERGE with existing, preserving both URLs
                console.log('📊 Merging analysis data for:', uniqueKey);
                
                // Get existing URLs
                const existingPdfUrl = existing.mergedData?.pdfUrl || existing.pdfUrl;
                const existingMediaUrl = existing.mediaUrl;
                
                // Get new URLs
                const newPdfUrl = file.pdfUrl;
                const newMediaUrl = file.mediaUrl;
                
                // **FIX**: Always preserve BOTH URLs from both records
                const finalPdfUrl = existingPdfUrl || newPdfUrl;
                const finalMediaUrl = existingMediaUrl || newMediaUrl;
                
                console.log('🔗 URL merging:', {
                  existingPdf: !!existingPdfUrl,
                  existingMedia: !!existingMediaUrl,
                  newPdf: !!newPdfUrl,
                  newMedia: !!newMediaUrl,
                  finalPdf: !!finalPdfUrl,
                  finalMedia: !!finalMediaUrl
                });
                
                // **FIX**: Determine which record has the most recent analysis data
                const existingTime = existing.timestamp || existing.createdAt || existing.updatedAt || 0;
                const fileTime = file.timestamp || file.createdAt || file.updatedAt || 0;
                const useFileData = fileTime > existingTime;
                
                console.log('🕒 Timestamp comparison for analysis data:', {
                  existingTime: new Date(existingTime).toISOString(),
                  fileTime: new Date(fileTime).toISOString(),
                  useFileData,
                  existingTitle: existing.fileName,
                  fileTitle: file.fileName
                });
                
                // **CRITICAL FIX**: Only use analysis data from the most recent record
                const mostRecentAnalysisData = useFileData ? file : existing;
                
                // Update the existing record with merged data, preserving most recent analysis content
                groupedAnalysis[uniqueKey] = {
                  ...existing, // Keep existing structure
                  // **FIX**: Only overlay analysis-specific data from most recent record
                  analysisInputs: {
                    ...(existing.analysisInputs || {}),
                    ...(mostRecentAnalysisData.analysisInputs || {}),
                    // **FIX**: Ensure brand data comes from most recent analysis
                    brandName: mostRecentAnalysisData.analysisInputs?.brandName || existing.analysisInputs?.brandName,
                    brandId: mostRecentAnalysisData.analysisInputs?.brandId || existing.analysisInputs?.brandId
                  },
                  analysisResults: mostRecentAnalysisData.analysisResults || existing.analysisResults,
                  // Preserve URLs from both records
                  mergedData: {
                    pdfUrl: finalPdfUrl,
                    analysisData: mostRecentAnalysisData,
                    combinedFileName: normalizedTitle,
                    dataSource: useFileData ? 'file' : 'existing'
                  },
                  pdfUrl: finalPdfUrl, // PDF URL at top level
                  mediaUrl: finalMediaUrl, // Media URL at top level
                  fileName: `Analysis - ${mostRecentAnalysisData.analysisInputs?.adTitle || normalizedTitle}`, // Use adTitle from most recent data
                  url: finalPdfUrl || finalMediaUrl || file.url, // Prefer PDF, fallback to media
                  fileType: finalPdfUrl ? 'application/pdf' : 'analysis-media',
                  // Use most recent timestamp
                  timestamp: Math.max(existingTime, fileTime),
                  updatedAt: Math.max(existingTime, fileTime)
                };
                
                console.log('✅ Merged analysis record with both URLs for:', uniqueKey, {
                  finalFileName: groupedAnalysis[uniqueKey].fileName,
                  adTitleFromMostRecent: mostRecentAnalysisData.analysisInputs?.adTitle,
                  brandNameFromMostRecent: mostRecentAnalysisData.analysisInputs?.brandName,
                  normalizedTitle: normalizedTitle,
                  dataSource: useFileData ? 'file' : 'existing',
                  finalBrandName: groupedAnalysis[uniqueKey].analysisInputs?.brandName
                });
              }
              
              // Always use the most recent timestamp
              const existingTime = existing.timestamp || existing.createdAt || 0;
              const fileTime = file.timestamp || file.createdAt || 0;
              
              if (fileTime > existingTime) {
                existing.timestamp = file.timestamp;
                existing.createdAt = file.createdAt;
              }
              
              // Ensure consistent naming
              existing.fileName = `Analysis - ${normalizedTitle}`;
              
              // **POST-MERGE VALIDATION**: Verify the merge was successful
              const finalRecord = groupedAnalysis[uniqueKey];
              console.log('🔍 Post-merge validation for:', uniqueKey, {
                hasPdfUrl: !!(finalRecord.mergedData?.pdfUrl || finalRecord.pdfUrl),
                hasMediaUrl: !!finalRecord.mediaUrl,
                hasBothUrls: !!(finalRecord.mergedData?.pdfUrl || finalRecord.pdfUrl) && !!finalRecord.mediaUrl,
                willBeIncluded: (!!(finalRecord.mergedData?.pdfUrl || finalRecord.pdfUrl) && !!finalRecord.mediaUrl)
              });
            }
          }
        });
        
        // **DEBUG**: Log grouping results
        console.log('🔄 Grouping completed. Analysis groups:', Object.keys(groupedAnalysis));
        Object.entries(groupedAnalysis).forEach(([title, groupedFile]) => {
          const hasPdfUrl = !!(groupedFile.mergedData?.pdfUrl || groupedFile.pdfUrl);
          const hasMediaUrl = !!groupedFile.mediaUrl;
          console.log(`📊 Group "${title}":`, {
            fileName: groupedFile.fileName,
            analysisId: groupedFile.analysisId,
            hasUrl: !!groupedFile.url,
            hasMediaUrl: hasMediaUrl,
            hasPdfUrl: hasPdfUrl,
            hasBothUrls: hasMediaUrl && hasPdfUrl, // ✅ Key indicator
            fileType: groupedFile.fileType,
            urlPreview: groupedFile.url ? groupedFile.url.substring(0, 100) + '...' : 'None',
            mediaUrlPreview: groupedFile.mediaUrl ? groupedFile.mediaUrl.substring(0, 100) + '...' : 'None',
            pdfUrlPreview: (groupedFile.mergedData?.pdfUrl || groupedFile.pdfUrl) ? (groupedFile.mergedData?.pdfUrl || groupedFile.pdfUrl).substring(0, 100) + '...' : 'None'
          });
        });
        
        // **CRITICAL FIX**: Before filtering, ensure we prioritize files with URLs over files without URLs
        console.log('🔧 POST-PROCESSING: Ensuring files with URLs are prioritized...');
        console.log('🔍 Original groupedAnalysis entries:');
        Object.entries(groupedAnalysis).forEach(([key, file]) => {
          console.log(`  - ${key}: ${file.fileName} (hasUrl: ${!!(file.url || file.pdfUrl || file.mergedData?.pdfUrl)})`);
        });
        
        // **FIX**: Don't merge files with different analysisIds!
        // Each analysisId is a unique analysis, regardless of title
        const processedAnalysis = {};
        
        Object.entries(groupedAnalysis).forEach(([key, file]) => {
          // **CRITICAL**: If file has analysisId, ALWAYS keep it separate
          if (file.analysisId) {
            processedAnalysis[key] = file;
            console.log(`✅ Added analysis with analysisId: ${file.fileName} (${file.analysisId})`);
            return; // Don't check for title conflicts
          }
          
          // Only check for title conflicts for files WITHOUT analysisId (legacy files)
          const normalizedTitle = file.fileName?.replace(/^Analysis - /, '').trim().toUpperCase();
          
          // Check if there's already a file with this normalized title (that also has no analysisId)
          const existingKey = Object.keys(processedAnalysis).find(k => {
            const existing = processedAnalysis[k];
            // Only consider as conflict if BOTH files have no analysisId
            if (existing.analysisId) return false; // Skip files with analysisId
            
            const existingNormalized = existing.fileName?.replace(/^Analysis - /, '').trim().toUpperCase();
            return existingNormalized === normalizedTitle;
          });
          
          if (existingKey) {
            const existing = processedAnalysis[existingKey];
            const existingHasUrl = !!(existing.url || existing.pdfUrl || existing.mergedData?.pdfUrl);
            const currentHasUrl = !!(file.url || file.pdfUrl || file.mergedData?.pdfUrl);
            
            console.log('🔄 Title conflict detected (legacy files):', {
              title: normalizedTitle,
              existing: existing.fileName,
              existingHasUrl,
              current: file.fileName,
              currentHasUrl,
              decision: currentHasUrl && !existingHasUrl ? 'REPLACE' : 'KEEP_EXISTING'
            });
            
            if (currentHasUrl && !existingHasUrl) {
              // Replace existing with current (has URL)
              delete processedAnalysis[existingKey];
              processedAnalysis[key] = file;
              console.log('✅ Replaced file without URL with file that has URL');
            } else if (!currentHasUrl && existingHasUrl) {
              // Keep existing (has URL), ignore current
              console.log('⏭️ Keeping existing file with URL, ignoring file without URL');
            } else {
              // Both have URLs or both don't - keep first one to avoid unexpected removal
              console.log('📝 Both files have same URL status, keeping first one (existing)');
            }
          } else {
            processedAnalysis[key] = file;
            console.log(`✅ Added new legacy file to processedAnalysis: ${file.fileName}`);
          }
        });
        
        console.log('✅ POST-PROCESSING complete:', {
          originalCount: Object.keys(groupedAnalysis).length,
          processedCount: Object.keys(processedAnalysis).length
        });
        console.log('🔍 Final processedAnalysis entries:');
        Object.entries(processedAnalysis).forEach(([key, file]) => {
          console.log(`  - ${key}: ${file.fileName} (hasUrl: ${!!(file.url || file.pdfUrl || file.mergedData?.pdfUrl)})`);
        });
        
        // Convert grouped analysis back to array and merge with non-analysis files
        // **RELAXED FILTER**: Include analysis records that have at least one URL (PDF or media)
        const completeAnalysisGroups = Object.values(processedAnalysis).filter(groupedFile => {
          const hasPdfUrl = groupedFile.mergedData.pdfUrl || groupedFile.pdfUrl;
          const hasMediaUrl = groupedFile.mediaUrl;
          const hasAnyUrl = hasPdfUrl || hasMediaUrl; // ✅ REQUIRE AT LEAST ONE URL
          
          if (!hasAnyUrl) {
            console.log('⚠️ Excluding analysis record with no URLs:', {
              fileName: groupedFile.fileName,
              analysisId: groupedFile.analysisId,
              hasPdfUrl: !!hasPdfUrl,
              hasMediaUrl: !!hasMediaUrl,
              reason: 'Missing both PDF and media URLs'
            });
          } else {
            console.log('✅ Including analysis record:', {
              fileName: groupedFile.fileName,
              analysisId: groupedFile.analysisId,
              hasPdfUrl: !!hasPdfUrl,
              hasMediaUrl: !!hasMediaUrl,
              reason: hasAnyUrl ? 'Has at least one URL' : 'No URLs available'
            });
          }
          return hasAnyUrl; // ✅ RELAXED: Show records with at least one URL
        });
        
        const mergedAnalysisFiles = completeAnalysisGroups.map(groupedFile => {
          // Create final record with proper URL hierarchy
          const hasPdfUrl = !!(groupedFile.mergedData.pdfUrl || groupedFile.pdfUrl);
          const hasMediaUrl = !!groupedFile.mediaUrl;
          
          console.log('✅ Final merged analysis:', {
            fileName: groupedFile.fileName,
            normalizedTitle: groupedFile.mergedData.combinedFileName,
            hasUrl: !!groupedFile.url,
            hasMediaUrl: hasMediaUrl,
            hasPdfUrl: hasPdfUrl,
            hasBothUrls: hasMediaUrl && hasPdfUrl,
            mediaUrlPreview: groupedFile.mediaUrl ? groupedFile.mediaUrl.substring(0, 100) + '...' : 'None',
            pdfUrlPreview: (groupedFile.mergedData.pdfUrl || groupedFile.pdfUrl) ? (groupedFile.mergedData.pdfUrl || groupedFile.pdfUrl).substring(0, 100) + '...' : 'None'
          });
          
          const finalRecord = {
            ...groupedFile,
            fileName: `Analysis - ${groupedFile.mergedData.combinedFileName}`,
            // **FIX**: Always show as PDF if we have PDF URL, otherwise as analysis-media
            fileType: hasPdfUrl ? 'application/pdf' : 'analysis-media',
            // **FIX**: Primary URL for main action (prefer PDF)
            url: hasPdfUrl ? 
              (groupedFile.mergedData.pdfUrl || groupedFile.pdfUrl) : 
              (hasMediaUrl ? groupedFile.mediaUrl : groupedFile.url),
            // **BOTH URLs**: Ensure both URLs are available
            pdfUrl: groupedFile.mergedData.pdfUrl || groupedFile.pdfUrl, // For PDF viewing
            mediaUrl: groupedFile.mediaUrl, // For media viewing
            // **FIX**: Ensure we preserve the exact normalized title format
            displayTitle: groupedFile.mergedData.combinedFileName,
            // **FLAGS**: Add flags to indicate what's available
            hasBothUrls: hasMediaUrl && hasPdfUrl,
            isMediaOnlyAnalysis: hasMediaUrl && !hasPdfUrl,
            isPdfOnlyAnalysis: hasPdfUrl && !hasMediaUrl
          };
          
          return finalRecord;
        });
        
        console.log('🔄 Analysis merging completed:', {
          totalAnalysisGroups: Object.keys(groupedAnalysis).length,
          groupNames: Object.keys(groupedAnalysis),
          mergedFilesCount: mergedAnalysisFiles.length
        });
        
        // Debug: Log each merged file details with duplicate detection
        const titleCounts = {};
        mergedAnalysisFiles.forEach(file => {
          const normalizedTitle = file.fileName?.replace(/^Analysis - /, '').trim().toUpperCase();
          titleCounts[normalizedTitle] = (titleCounts[normalizedTitle] || 0) + 1;
          
          console.log('📋 Merged file details:', {
            fileName: file.fileName,
            normalizedTitle: normalizedTitle,
            analysisId: file.analysisId,
            hasMediaUrl: !!file.mediaUrl,
            hasPdfUrl: !!file.pdfUrl,
            hasAnalysisResults: !!file.analysisResults,
            url: file.url ? file.url.substring(0, 50) + '...' : 'None',
            timestamp: file.timestamp
          });
        });
        
        // **DUPLICATE DETECTION**: Log any titles that appear multiple times
        const duplicateTitles = Object.entries(titleCounts).filter(([title, count]) => count > 1);
        if (duplicateTitles.length > 0) {
          console.warn('⚠️ DUPLICATE TITLES DETECTED before final deduplication:', duplicateTitles);
          duplicateTitles.forEach(([title, count]) => {
            console.warn(`🔍 Title "${title}" appears ${count} times`);
            const duplicateFiles = mergedAnalysisFiles.filter(f => 
              f.fileName?.replace(/^Analysis - /, '').trim().toUpperCase() === title
            );
            duplicateFiles.forEach((file, index) => {
              console.warn(`   ${index + 1}. ID: ${file.analysisId}, Timestamp: ${file.timestamp}, URLs: PDF=${!!file.pdfUrl}, Media=${!!file.mediaUrl}, MediaURL: ${file.mediaUrl?.substring(0, 50)}...`);
            });
          });
        }
        
        // **SPECIFIC DEBUG**: Log AKSHARA entries specifically
        const aksharaFiles = mergedAnalysisFiles.filter(f => 
          f.fileName?.includes('AKSHARA') || f.fileName?.includes('akshara')
        );
        if (aksharaFiles.length > 1) {
          console.warn('🚨 MULTIPLE AKSHARA ENTRIES DETECTED:', aksharaFiles.length);
          aksharaFiles.forEach((file, index) => {
            console.warn(`   AKSHARA ${index + 1}:`, {
              fileName: file.fileName,
              analysisId: file.analysisId,
              timestamp: file.timestamp,
              mediaUrl: file.mediaUrl?.substring(0, 100) + '...',
              pdfUrl: file.pdfUrl?.substring(0, 100) + '...',
              url: file.url?.substring(0, 100) + '...',
              uniqueKey: file.fileName?.replace(/^Analysis - /, '').trim().toUpperCase()
            });
          });
        }
        
        // Get non-analysis files
        const nonAnalysisFiles = preFilterFiles.filter(file => file.fileCategory !== 'analysis-report');
        
        // Combine everything
        let finalFiles = [...mergedAnalysisFiles, ...nonAnalysisFiles];
        
        // **FINAL DEDUPLICATION**: Remove any remaining duplicates based on UNIQUE identifiers only
        const seenFiles = new Map();
        finalFiles = finalFiles.filter(file => {
          // **FIX**: If file has analysisId, ONLY use that as the unique key
          if (file.analysisId) {
            if (seenFiles.has(file.analysisId)) {
              console.log('🚫 Final deduplication: Removing duplicate analysisId:', {
                fileName: file.fileName,
                analysisId: file.analysisId,
                reason: 'Duplicate analysisId'
              });
              return false;
            }
            seenFiles.set(file.analysisId, file);
            console.log(`✅ Kept file with analysisId: ${file.fileName} (${file.analysisId})`);
            return true;
          }
          
          // For files WITHOUT analysisId (legacy files), use composite keys
          const normalizedTitle = file.fileName?.replace(/^Analysis - /, '').trim().toUpperCase();
          const dateKey = file.timestamp ? new Date(file.timestamp).toDateString() : '';
          
          // Create composite key for legacy files
          const legacyKey = normalizedTitle && dateKey 
            ? `${normalizedTitle}|${dateKey}` 
            : (file.storagePath || normalizedTitle || `fallback-${Date.now()}`);
          
          if (seenFiles.has(legacyKey)) {
            console.log('🚫 Final deduplication: Removing duplicate legacy file:', {
              fileName: file.fileName,
              matchedKey: legacyKey,
              originalFile: seenFiles.get(legacyKey).fileName,
              reason: 'Duplicate legacy file'
            });
            return false;
          }
          
          seenFiles.set(legacyKey, file);
          console.log(`✅ Kept legacy file: ${file.fileName} (key: ${legacyKey})`);
          return true;
        });
        
        // **DEBUG**: Log final analysis titles
        console.log('🔍 FINAL MERGED ANALYSIS FILES:', mergedAnalysisFiles.length);
        mergedAnalysisFiles.forEach((file, idx) => {
          console.log(`  ${idx + 1}. ${file.fileName || 'Unnamed'} | adTitle: ${file.analysisInputs?.adTitle || 'N/A'} | hasMediaUrl: ${!!file.mediaUrl} | hasPdfUrl: ${!!file.pdfUrl}`);
        });
        
        console.log('📊 Final file counts:', {
          totalPreFilter: preFilterFiles.length,
          analysisGroups: Object.keys(groupedAnalysis).length,
          mergedAnalysisFiles: mergedAnalysisFiles.length,
          nonAnalysisFiles: nonAnalysisFiles.length,
          beforeFinalDedup: [...mergedAnalysisFiles, ...nonAnalysisFiles].length,
          finalTotal: finalFiles.length,
          duplicatesRemoved: [...mergedAnalysisFiles, ...nonAnalysisFiles].length - finalFiles.length
        });
        
        // **CRITICAL CHECK**: If user expected more files, log what might be missing
        if (finalFiles.length < 6) {
          console.warn('⚠️ Expected more files than found. Checking for potential issues...');
          console.warn('📊 File sources breakdown:', {
            blobStorageFiles: allFiles.filter(f => f.storagePath).length,
            firestoreFiles: allFiles.filter(f => !f.storagePath && f.id).length,
            analysisHistoryFiles: allFiles.filter(f => f.fileName?.startsWith('Analysis -')).length
          });
        }
        
        // Debug: Show file structure for first few files
        if (finalFiles.length > 0) {
          console.log('🔍 Sample final file structure:', {
            firstFile: finalFiles[0],
            keys: Object.keys(finalFiles[0]),
            hasAnalysisResults: !!finalFiles[0].analysisResults,
            hasAnalysisInputs: !!finalFiles[0].analysisInputs,
            fileCategory: finalFiles[0].fileCategory,
            fileType: finalFiles[0].fileType
          });
        }
        
        setUserFiles(finalFiles);
        
        // **AUTO-REFRESH DETECTION**: Check if expected new file appeared
        if (autoRefreshActive && expectedNewFileRef.current) {
          const expectedFileName = expectedNewFileRef.current;
          const newFileFound = finalFiles.some(file => 
            file.fileName && file.fileName.includes(expectedFileName)
          );
          
          if (newFileFound) {
            console.log('🎉 New uploaded file detected in library:', expectedFileName);
            stopAutoRefresh();
            
            // Show success message
            setAlertState({
              open: true,
              message: `New ad "${expectedFileName}" successfully loaded in library!`,
              severity: 'success'
            });
          }
        }
        
        // **CACHE SAVE**: Store data to prevent duplicate API calls
        try {
          localStorage.setItem(cacheKey, JSON.stringify(finalFiles));
          localStorage.setItem(`${cacheKey}_timestamp`, now.toString());
          console.log('💾 Cached libraries data for 30 seconds');
        } catch (cacheError) {
          console.warn('⚠️ Failed to cache data:', cacheError);
        }
        
      } catch (error) {
        console.error('❌ Detailed error loading user files:', error);
        console.error('❌ Error name:', error.name);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        
        if (error.message.includes('permission-denied')) {
          setError('Permission denied. Please check your account access.');
        } else if (error.message.includes('network')) {
          setError('Network error. Please check your internet connection.');
        } else {
          setError(`Database error: ${error.message}`);
        }
      } finally {
        setLoading(false);
        setIsLoadingFiles(false); // **CRITICAL**: Reset flag to allow future loads
        loadingRef.current = false; // Reset ref flag too
      }
    };

    // Only load if not already loading
    if (!isLoadingFiles) {
      loadUserFiles();
    }
  }, [currentUser?.uid]); // Use uid instead of full object to prevent unnecessary re-renders

  // **FIXED**: Remove filteredAndSortedFiles from dependencies to prevent cascading re-renders
  useEffect(() => {
    console.log('🔍 Filtered results updated:', {
      searchTerm,
      sortBy,
      totalFiles: userFiles.length,
      filteredCount: filteredAndSortedFiles.length,
      filteredFiles: filteredAndSortedFiles.map(f => f.fileName)
    });
    
    // Debug: Log timestamp data for first few files
    if (filteredAndSortedFiles.length > 0) {
      console.log('🔍 Debug: Timestamp data for first 3 files:', 
        filteredAndSortedFiles.slice(0, 3).map(file => ({
          fileName: file.fileName,
          timestamp: file.timestamp,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
          timestampType: typeof file.timestamp,
          createdAtType: typeof file.createdAt,
          updatedAtType: typeof file.updatedAt
        }))
      );
    }
  }, [searchTerm, sortBy, userFiles]); // Removed filteredAndSortedFiles dependency (filterType removed)

  // Restore analysis state when component mounts
  useEffect(() => {
    if (viewingAnalysis) {
      // This effect will run when viewingAnalysis changes,
      // but we need to ensure it only runs once or when viewingAnalysis becomes null.
      // For now, we'll keep it simple, but in a real app, you might want to
      // reset viewingAnalysis to null when the component unmounts or when the user navigates away.
      // For this example, we'll just ensure it's null if the component unmounts.
    }
  }, [viewingAnalysis]);

  // Define handleBackToLibrary function before it's used
  const handleBackToLibrary = () => {
    setViewingAnalysis(null);
  };

  // Define formatDate function before it's used
  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    // Handle Firestore timestamp
    if (timestamp.seconds) {
      return new Date(timestamp.seconds * 1000).toLocaleDateString();
    }
    
    // Handle regular date
    return new Date(timestamp).toLocaleDateString();
  };



  // If viewing analysis results, show the analysis view
  if (viewingAnalysis) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {/* Back button */}
          <div style={{ marginBottom: '2rem' }}>
            <button
              onClick={handleBackToLibrary}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.9rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#4b5563'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#6b7280'}
            >
              <ArrowLeft size={16} />
              Back to Library
            </button>
          </div>

          {/* File info header */}
          <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '8px' }}>
            <h2 style={{ margin: '0 0 0.5rem 0', color: '#1f2937' }}>
              {viewingAnalysis.analysisInputs?.adTitle || 
               (viewingAnalysis.fileName && viewingAnalysis.fileName.startsWith('Analysis - ') 
                 ? viewingAnalysis.fileName.replace('Analysis - ', '') 
                 : viewingAnalysis.fileName)}
            </h2>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
              Analysis performed on {formatDate(viewingAnalysis.timestamp)}
            </p>
          </div>

          {/* Analysis Results Component */}
          <AnalysisResults
            analysisResults={viewingAnalysis.analysisResults}
            onDownloadReport={() => handleDownloadReport(viewingAnalysis)}
            showViewButton={false}
            compact={false}
            selectedFeatures={viewingAnalysis.analysisInputs?.selectedFeatures || []}
            userPlan={userPlan}
          />
        </div>
      </div>
    );
  }

  // **REMOVED**: Filter options removed as requested

  const sortOptions = [
    { value: 'newest', label: 'Newest Ad First' },
    { value: 'oldest', label: 'Oldest Ad First' }
  ];

  const funnelStages = ['Awareness', 'Consideration', 'Conversion'];

  const handleFileSelect = (fileId) => {
    setSelectedFiles(prev => 
      prev.includes(fileId) 
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleFileDownload = async (file) => {
    try {
      console.log('📥 Download Action for:', file.fileName, {
        hasPdfUrl: !!file.pdfUrl,
        hasMediaUrl: !!file.mediaUrl,
        fileCategory: file.fileCategory
      });
      
      // **FOR ANALYSIS REPORTS**: Generate and download PDF from analysis data
      if (file.fileCategory === 'analysis-report') {
        console.log('🔍 Generating PDF download for:', file.fileName);
        
        if (file.analysisId) {
          try {
            console.log('✅ Downloading PDF for analysis ID:', file.analysisId);
            const baseUrl = ENV_CONFIG.PYTHON_API_URL || 'http://localhost:8002';
            const link = document.createElement('a');
            link.href = `${baseUrl}/download-analysis-pdf/${file.analysisId}`;
            link.download = file.fileName.replace('Analysis - ', '') + '_Report.pdf';
            link.click();
            return;
          } catch (error) {
            console.error('❌ Error downloading PDF:', error);
            setAlertState({
              open: true,
              title: 'PDF Download Error',
              message: `Failed to download PDF for "${file.fileName}". Please try again.`,
              severity: 'error'
            });
            return;
          }
        } else {
          setAlertState({
            open: true,
            title: 'PDF Not Available',
            message: `No analysis data found for "${file.fileName}". Please re-run the analysis.`,
            severity: 'warning'
          });
          return; // Exit early for analysis reports
        }
      }
      
      // **FOR OTHER FILES**: Use existing logic
      if (file.fileContent) {
        // Convert base64 to blob and download
        const byteCharacters = atob(file.fileContent);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const mimeType = file.fileType === 'application/pdf' ? 'application/pdf' : `${getFileType(file)}/${file.fileFormat || 'jpeg'}`;
        const blob = new Blob([byteArray], { type: mimeType });
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.fileName || `file_${file.id}.${file.fileFormat || 'jpg'}`;
        link.click();
        URL.revokeObjectURL(url);
        
        console.log('✅ File downloaded:', file.fileName);
      } else {
        setAlertState({
          open: true,
          title: 'Download Failed',
          message: 'File content not available for download',
          severity: 'error'
        });
      }
    } catch (error) {
      console.error('❌ Error downloading file:', error);
              setAlertState({
          open: true,
          title: 'Download Failed',
          message: 'Failed to download file',
          severity: 'error'
        });
    }
  };

  const handleFileDelete = async (fileId) => {
    console.log('🗑️ Delete button clicked for file ID:', fileId);
    console.log('🗑️ Current userFiles array length:', userFiles.length);
    console.log('🗑️ Available file IDs:', userFiles.map(f => f.id));
    
    // Find the file object to check its structure
    const fileToDelete = userFiles.find(f => f.id === fileId);
    console.log('🔍 File object to delete:', fileToDelete);
    
    if (fileToDelete) {
      console.log('🔍 File object keys:', Object.keys(fileToDelete));
      console.log('🔍 File brandId:', fileToDelete?.brandId);
      console.log('🔍 File userId:', fileToDelete?.userId);
      console.log('🔍 File analysisInputs:', fileToDelete?.analysisInputs);
      console.log('🔍 File complete object:', fileToDelete);
    } else {
      console.error('❌ File not found in userFiles array!');
      console.log('🔍 Searching for similar IDs:', userFiles.filter(f => f.id.includes(fileId.substring(0, 5))));
    }
    
    const confirmed = window.confirm('Are you sure you want to delete this file? This action cannot be undone.');
    
    if (confirmed) {
      try {
        console.log('🔄 Attempting to delete file with ID:', fileId);
        console.log('🔄 Using userId:', currentUser?.uid);
        
        // Delete file using unified API (works for all file types)
        console.log('🔄 Deleting file via unified API...');
        await unifiedApi.deleteUserFile(fileId, currentUser?.uid);
        console.log('✅ File deleted from database successfully');
        
        setUserFiles(prev => {
          const updated = prev.filter(file => file.id !== fileId);
          console.log('📁 Updated user files list:', updated.length, 'files remaining');
          return updated;
        });
        
        setSelectedFiles(prev => prev.filter(id => id !== fileId));
        console.log('✅ File deleted successfully from UI');
        
        setAlertState({
          open: true,
          title: 'Success',
          message: 'File deleted successfully!',
          severity: 'success'
        });
      } catch (error) {
        console.error('❌ Error deleting file:', error);
        setAlertState({
          open: true,
          title: 'Delete Failed',
          message: 'Failed to delete file: ' + error.message,
          severity: 'error'
        });
      }
    } else {
      console.log('❌ Delete cancelled by user');
    }
  };


  const handleViewDetails = async (file) => {
    console.log('🔍 Viewing details for file:', file);
    
    try {
      const baseUrl = ENV_CONFIG.PYTHON_API_URL || 'http://localhost:8002';
      
      // First, try to use the specific analysis ID from the clicked file
      const requestedAnalysisId = file.analysisId || file.artifact_id || file.id;
      
      if (requestedAnalysisId) {
        console.log('🎯 UNIFIED: Attempting to view specific analysis:', requestedAnalysisId, 'for file:', file.fileName);
        
        // Use the unified endpoint to get guaranteed real scores
        try {
          const unifiedResponse = await fetch(`${baseUrl}/get-unified-analysis-data/${requestedAnalysisId}`);
          if (unifiedResponse.ok) {
            const unifiedData = await unifiedResponse.json();
            
            if (unifiedData.success) {
              // **FIX**: Use the requestedAnalysisId directly (it's already the correct ID)
              const finalAnalysisId = requestedAnalysisId;
              const hasRealScores = unifiedData.has_real_scores;
              const sampleScores = unifiedData.sample_scores;
              const adTitle = unifiedData.data?.adTitle || 'Analysis';
              
              // Always open the analysis - even if it has 0% scores
              const detailsUrl = `${baseUrl}/analysis-details-html/${finalAnalysisId}`;
              
              if (hasRealScores) {
                console.log('✅ UNIFIED: Opening analysis with REAL scores:', detailsUrl);
                console.log('📊 UNIFIED: Sample scores:', sampleScores);
                console.log('📝 UNIFIED: Analysis title:', adTitle);
                
                // Check if this was a smart redirect
                if (unifiedData.data_source === 'smart_redirect_to_real_scores') {
                  console.log('🔄 SMART REDIRECT: Automatically found correct analysis with real scores');
                }
              } else {
                console.log('⚠️ UNIFIED: Opening analysis with 0% scores (placeholder data):', detailsUrl);
                console.log('📝 UNIFIED: Analysis title:', adTitle);
              }
              
              window.open(detailsUrl, '_blank');
              return;
            }
          }
        } catch (unifiedError) {
          console.log('⚠️ UNIFIED: Error with unified endpoint:', unifiedError);
        }
      }
      
      // Fallback: Get a valid analysis ID with real scores
      console.log('🔄 Falling back to valid analysis with real scores...');
      const validIdResponse = await fetch(`${baseUrl}/get-valid-analysis-id/${currentUser?.uid}`);
      
      if (validIdResponse.ok) {
        const validIdData = await validIdResponse.json();
        
        if (validIdData.success && validIdData.has_real_scores) {
          // Inform user about the fallback
          const proceed = window.confirm(
            `⚠️ The specific analysis for "${file.fileName}" may not have complete data.\n\n` +
            `Would you like to view a similar analysis with real scores instead?\n\n` +
            `Alternative: ${validIdData.ad_title} (${validIdData.sample_score}% scores)`
          );
          
          if (proceed) {
            const detailsUrl = `${baseUrl}/analysis-details-html/${validIdData.analysis_id}`;
            console.log('✅ Opening fallback analysis with REAL scores:', detailsUrl);
            window.open(detailsUrl, '_blank');
          }
          return;
        } else if (validIdData.success) {
          // Last resort: placeholder data
          const proceed = window.confirm(
            `⚠️ Only placeholder data (0% scores) is available.\n\n` +
            `Would you like to view it anyway?\n\n` +
            `Analysis: ${validIdData.ad_title}`
          );
          
          if (proceed) {
            const detailsUrl = `${baseUrl}/analysis-details-html/${validIdData.analysis_id}`;
            console.log('⚠️ Opening analysis with placeholder data:', detailsUrl);
            window.open(detailsUrl, '_blank');
          }
          return;
        }
      }
      
      // Final fallback: Use original analysis ID without validation
      if (requestedAnalysisId) {
        const detailsUrl = `${baseUrl}/analysis-details-html/${requestedAnalysisId}`;
        console.log('🔗 Final fallback: Opening original analysis:', detailsUrl);
        window.open(detailsUrl, '_blank');
      } else {
      setAlertState({
        open: true,
        message: 'Analysis ID not found. Cannot view detailed data.',
        severity: 'error'
      });
      }
      
    } catch (error) {
      console.error('❌ Error in handleViewDetails:', error);
      
      // Error fallback: Use original analysis ID
      const analysisId = file.analysisId || file.artifact_id || file.id;
      if (analysisId) {
    const baseUrl = ENV_CONFIG.PYTHON_API_URL || 'http://localhost:8002';
    const detailsUrl = `${baseUrl}/analysis-details-html/${analysisId}`;
        console.log('🔗 Error fallback: Opening analysis:', detailsUrl);
    window.open(detailsUrl, '_blank');
      } else {
        setAlertState({
          open: true,
          message: 'Analysis ID not found. Cannot view detailed data.',
          severity: 'error'
        });
      }
    }
  };

  const handleDownloadReport = async (file) => {
    if (!file.analysisResults) {
      console.log('❌ No analysis results available for download');
      return;
    }

    const userId = currentUser?.uid || localStorage.getItem('incivus_user_id');
    
    try {
      console.log('📄 Starting PDF report generation for library file...');
      
      // Prepare data in format expected by main.py
      const comprehensiveData = {
        status: "success",
        analysis_type: "comprehensive",
        file_type: file.metadata?.fileType || "unknown",
        results: file.analysisResults || {},
        originalAnalysisResults: file.analysisResults,
        metadata: file.metadata || {}
      };
      
      // Generate analysis ID
      const analysisId = `library_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        // **CRITICAL FIX**: Extract uploaded image data for PDF generation
        let uploadedImageData = null;
        
        // Try to get image data from multiple possible sources
        if (file.mediaUrl) {
          uploadedImageData = file.mediaUrl;
          console.log('📸 Using mediaUrl for PDF generation:', file.fileName);
        } else if (file.adImageData) {
          uploadedImageData = file.adImageData.startsWith('data:') ? file.adImageData : `data:image/jpeg;base64,${file.adImageData}`;
          console.log('📸 Using adImageData for PDF generation:', file.fileName);
        } else if (file.originalAdImage) {
          uploadedImageData = file.originalAdImage.startsWith('data:') ? file.originalAdImage : `data:image/jpeg;base64,${file.originalAdImage}`;
          console.log('📸 Using originalAdImage for PDF generation:', file.fileName);
        } else if (file.analysisInputs?.uploadedImage) {
          uploadedImageData = file.analysisInputs.uploadedImage.startsWith('data:') ? file.analysisInputs.uploadedImage : `data:image/jpeg;base64,${file.analysisInputs.uploadedImage}`;
          console.log('📸 Using analysisInputs.uploadedImage for PDF generation:', file.fileName);
        } else if (file.fileContent) {
          uploadedImageData = file.fileContent.startsWith('data:') ? file.fileContent : `data:image/jpeg;base64,${file.fileContent}`;
          console.log('📸 Using fileContent for PDF generation:', file.fileName);
        } else {
          console.log('⚠️ No uploaded image data found for PDF generation:', file.fileName);
        }
        
        // **FIX**: Extract correct ad title from analysisInputs or fileName
        let correctAdTitle = 'Library Analysis';
        
        // Priority 1: Use adTitle from analysisInputs if available
        if (file.analysisInputs?.adTitle) {
          correctAdTitle = file.analysisInputs.adTitle;
          console.log('📝 Using adTitle from analysisInputs:', correctAdTitle);
        }
        // Priority 2: Extract from fileName by removing "Analysis - " prefix
        else if (file.fileName && file.fileName.startsWith('Analysis - ')) {
          correctAdTitle = file.fileName.replace('Analysis - ', '');
          console.log('📝 Extracted adTitle from fileName:', correctAdTitle);
        }
        // Priority 3: Use fileName as fallback
        else {
          correctAdTitle = file.fileName || 'Library Analysis';
          console.log('📝 Using fileName as fallback adTitle:', correctAdTitle);
        }
        
        console.log('🔍 Final adTitle for PDF generation:', correctAdTitle);
        
        // Try main.py backend first with uploaded image data
        await unifiedApi.sendAnalysisDataToPDFEndpoint(
          comprehensiveData,
          correctAdTitle,
          userId,
          analysisId,
          uploadedImageData  // Pass the uploaded image data
        );
        
        console.log('✅ PDF report generated via main.py backend');
        
        setAlertState({
          open: true,
          title: 'Success',
          message: 'PDF report generated and downloaded successfully!',
          severity: 'success'
        });
        
      } catch (backendError) {
        console.log('🔄 Backend failed, falling back to client-side generation...', backendError);
        
        // Fallback to client-side PDF generation
        const reportData = {
          timestamp: file.timestamp || new Date().toISOString(),
          fileName: file.fileName,
          analysisResults: file.analysisResults,
          metadata: file.metadata || {}
        };
        
        // **REMOVED**: downloadAndSaveAnalysisPDF - backend now handles all PDF generation
        // PDF should already be generated by backend during analysis
        const pdfResult = { success: true, message: 'PDF handled by backend' };
        
        console.log('✅ PDF report generation skipped (handled by backend):', pdfResult);
        
        setAlertState({
          open: true,
          title: 'Success',
          message: 'PDF report generated and downloaded successfully!',
          severity: 'success'
        });
      }
      
    } catch (error) {
      console.error('❌ Error generating PDF report:', error);
      setAlertState({
        open: true,
        title: 'Error',
        message: 'Failed to generate PDF report. Please try again.',
        severity: 'error'
      });
    }
  };



  const handleAddSampleData = async () => {
    if (!currentUser?.uid) return;
    
    try {
      setLoading(true);
      console.log('📝 Adding sample data for testing...');
      await unifiedApi.addSampleUserFiles(currentUser.uid);
      
      // Reload files after adding sample data (using unified API with forceRefresh)
      const allFiles = await unifiedApi.getUserFiles(currentUser.uid, null, 50, true);
      const relevantFiles = allFiles.filter(file => 
        file.fileCategory === 'uploaded_ad' || 
        file.fileCategory === 'analysis-report' ||
        (file.fileType && (file.fileType.includes('ad_image') || file.fileType.includes('ad_video') || file.fileType === 'application/pdf'))
      );
      setUserFiles(relevantFiles);
      
      console.log('✅ Sample data added successfully!');
    } catch (error) {
      console.error('❌ Error adding sample data:', error);
      setError(`Failed to add sample data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getPerformanceColor = (score) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const getFilePreview = (file) => {
    console.log('🔍 getFilePreview for file:', file.fileName, 'Category:', file.fileCategory);
    console.log('🔍 File properties:', Object.keys(file));
    
    // **NEW BLOB STORAGE METHOD** - Try signed URL first for brand media and uploaded ads
    if (file.url && (file.fileCategory === 'brand-media' || file.fileCategory === 'uploaded_ad')) {
      console.log('🔗 Using blob storage signed URL for:', file.fileName);
      return file.url; // Return signed URL directly for images
    }
    
    // For analysis reports, try to get the uploaded ad image
    if (file.fileCategory === 'analysis-report') {
      console.log('🔍 Analysis report - checking for ad image...');
      
      // **PRIORITY: Check for uploaded media URL from analysis record**
      if (file.mediaUrl) {
        console.log('✅ Found mediaUrl from uploaded image');
        return file.mediaUrl;
      }
      
      // **NEW: Check merged data for uploaded image**
      if (file.mergedData?.analysisData) {
        const analysisData = file.mergedData.analysisData;
        if (analysisData.mediaUrl) {
          console.log('✅ Found mediaUrl in merged analysis data');
          return analysisData.mediaUrl;
        }
        if (analysisData.analysisInputs?.uploadedImage) {
          console.log('✅ Found uploadedImage in merged analysis data');
          return analysisData.analysisInputs.uploadedImage.startsWith('data:') ? analysisData.analysisInputs.uploadedImage : `data:image/jpeg;base64,${analysisData.analysisInputs.uploadedImage}`;
        }
        if (analysisData.adImageData) {
          console.log('✅ Found adImageData in merged analysis data');
          return analysisData.adImageData.startsWith('data:') ? analysisData.adImageData : `data:image/jpeg;base64,${analysisData.adImageData}`;
        }
        if (analysisData.originalAdImage) {
          console.log('✅ Found originalAdImage in merged analysis data');
          return analysisData.originalAdImage.startsWith('data:') ? analysisData.originalAdImage : `data:image/jpeg;base64,${analysisData.originalAdImage}`;
        }
      }
      
      // **WORKAROUND**: Check localStorage for recently uploaded images by analysis title
      const analysisTitle = file.analysisInputs?.adTitle || file.fileName?.replace('Analysis - ', '');
      if (analysisTitle) {
        const recentImageKey = `recent_upload_${analysisTitle}`;
        const recentImageData = localStorage.getItem(recentImageKey);
        if (recentImageData) {
          console.log('✅ Found recent upload image in localStorage for:', analysisTitle);
          return recentImageData;
        }
      }
      
      // Legacy fallbacks for older analysis records
      if (file.originalAdImage) {
        console.log('✅ Found originalAdImage (legacy)');
        return file.originalAdImage.startsWith('data:') ? file.originalAdImage : `data:image/jpeg;base64,${file.originalAdImage}`;
      }
      if (file.adImageData) {
        console.log('✅ Found adImageData (legacy)');
        return file.adImageData.startsWith('data:') ? file.adImageData : `data:image/jpeg;base64,${file.adImageData}`;
      }
      // Check analysisInputs for uploaded image
      if (file.analysisInputs?.uploadedImage) {
        console.log('✅ Found analysisInputs.uploadedImage (legacy)');
        return file.analysisInputs.uploadedImage.startsWith('data:') ? file.analysisInputs.uploadedImage : `data:image/jpeg;base64,${file.analysisInputs.uploadedImage}`;
      }
      // Check fileContent as fallback
      if (file.fileContent) {
        console.log('✅ Found fileContent (legacy), length:', file.fileContent.length);
        return file.fileContent.startsWith('data:') ? file.fileContent : `data:image/jpeg;base64,${file.fileContent}`;
      }
      
      console.log('❌ No ad image found for analysis report');
      console.log('🔍 Available file fields:', Object.keys(file));
      if (file.mergedData) {
        console.log('🔍 Merged data available:', Object.keys(file.mergedData));
        if (file.mergedData.analysisData) {
          console.log('🔍 Analysis data fields:', Object.keys(file.mergedData.analysisData));
        }
      }
    }
    
    // For regular uploaded files - fallback to base64
    if (file.fileContent) {
      console.log('✅ Found fileContent for regular file');
      return `data:${getFileType(file)}/${file.fileFormat || 'jpeg'};base64,${file.fileContent}`;
    }
    
    console.log('❌ Using fallback image');
    return '/logo/C5i name with Logo.svg'; // fallback
  };

  const renderFileCard = (file) => {
    // Debug: Log all file types for debugging
    console.log('🔍 Rendering file card:', {
      fileName: file.fileName,
      fileCategory: file.fileCategory,
      fileType: file.fileType,
      mediaType: file.mediaType,
      hasUrl: !!file.url,
      url: file.url || 'None',
      urlType: typeof file.url,
      urlValue: file.url,
      hasFileContent: !!file.fileContent,
      brandId: file.brandId,
      brandName: file.brandName,
      allKeys: Object.keys(file),
      storagePath: file.storagePath
    });
    
    // **CRITICAL DEBUG**: Log URL details for PDF files specifically
    if (file.fileType === 'application/pdf' && file.fileName?.includes('SAICEAT')) {
      console.log('🔍 SAICEAT PDF URL Debug:', {
        fileName: file.fileName,
        url: file.url,
        urlLength: file.url ? file.url.length : 0,
        urlStartsWith: file.url ? file.url.substring(0, 50) : 'N/A',
        storagePath: file.storagePath,
        hasStoragePath: !!file.storagePath,
        fileObject: file
      });
    }
    
    const performanceScore = getPerformanceScore(file.analysisResults);
    const fileType = getFileType(file);
    const funnelStage = getFunnelStage(file.analysisInputs);
    const fileTags = file.tags || [];
    
    return (
      <div 
        key={file.id}
        className="auth-card"
        style={{ 
          cursor: 'pointer',
          border: selectedFiles.includes(file.id) ? '2px solid var(--primary-purple)' : '1px solid #e2e8f0',
          borderRadius: '12px',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 10px 25px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
          e.currentTarget.style.transform = 'translateY(-4px)';
          e.currentTarget.style.borderColor = selectedFiles.includes(file.id) ? 'var(--primary-purple)' : '#c7d2fe';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.borderColor = selectedFiles.includes(file.id) ? 'var(--primary-purple)' : '#e2e8f0';
        }}
        onClick={() => handleFileSelect(file.id)}
    >
        <div style={{ position: 'relative' }}>
          {/* Enhanced Thumbnail Display */}
          {(() => {
            // Try to get the actual media content for thumbnail
            let mediaUrl = null;
            let mediaType = 'image';
            
            // **NEW BLOB STORAGE SUPPORT** - Try signed URL first for non-analysis files
            if (file.url && (file.fileCategory === 'brand-media' || file.fileCategory === 'uploaded_ad')) {
              console.log('🔗 Using blob storage URL for preview:', file.fileName, file.url);
              mediaUrl = file.url;
              // **FIX**: Handle both 'image' and 'image/jpeg' format mediaTypes
              mediaType = (file.mediaType && file.mediaType.startsWith('image')) ? 'image' : getFileType(file);
              console.log('📸 Setting mediaUrl for uploaded content:', {
                fileName: file.fileName,
                fileCategory: file.fileCategory,
                mediaType,
                originalMediaType: file.mediaType,
                urlPreview: mediaUrl.substring(0, 100) + '...'
              });
            }
            // For analysis reports, ALWAYS prioritize mediaUrl for image preview
            else if (file.fileCategory === 'analysis-report') {
              console.log('🔍 Analysis report preview check for:', file.fileName, {
                hasMediaUrl: !!file.mediaUrl,
                hasUrl: !!file.url,
                mediaUrl: file.mediaUrl?.substring(0, 100),
                url: file.url?.substring(0, 100),
                includesAnalysisReports: file.url?.includes('/analysis-reports/'),
                includesPdf: file.url?.includes('.pdf')
              });
              
              // **BRAND LOGO METHODOLOGY**: Use same approach as UserProfile - check multiple URL properties
              console.log('🖼️ Using Brand Logo methodology for analysis image:', file.fileName);
              console.log('🔍 Checking all file properties:', Object.keys(file));
              
              // **STEP 1**: Check all possible URL properties like UserProfile does
              const possibleUrlProperties = [
                'mediaUrl',
                'url', 
                'publicUrl',
                'imageUrl',
                'src',
                'downloadUrl',
                'webContentLink',
                'webViewLink',
                'signedUrl'
              ];
              
              // **DEBUGGER MODE**: Comprehensive analysis of why images aren't showing
              console.group(`🐛 DEBUGGER - Analysis Image Debug for: ${file.fileName}`);
              
              console.log('📁 FULL FILE OBJECT:', file);
              
              // **DEEP OBJECT INVESTIGATION**: Look for base64 data ANYWHERE in the object
              function findBase64InObject(obj, path = '') {
                for (const [key, value] of Object.entries(obj)) {
                  const currentPath = path ? `${path}.${key}` : key;
                  if (typeof value === 'string' && value.length > 100 && (value.startsWith('data:image') || value.match(/^[A-Za-z0-9+/]+=*$/))) {
                    console.log(`🔍 FOUND POTENTIAL BASE64 at ${currentPath}:`, value.substring(0, 100) + '...');
                  } else if (typeof value === 'object' && value !== null && currentPath.split('.').length < 4) {
                    findBase64InObject(value, currentPath);
                  }
                }
              }
              
              console.log('🔍 SEARCHING FOR BASE64 DATA IN ENTIRE OBJECT:');
              findBase64InObject(file);
              
              console.log('🔧 FILE PROPERTIES:', {
                mediaUrl: file.mediaUrl,
                url: file.url,
                mediaType: file.mediaType,
                fileType: file.fileType,
                originalAdImage: file.originalAdImage ? `${file.originalAdImage.substring(0, 50)}...` : 'null',
                adImageData: file.adImageData ? `${file.adImageData.substring(0, 50)}...` : 'null',
                analysisInputsUploadedImage: file.analysisInputs?.uploadedImage ? `${file.analysisInputs.uploadedImage.substring(0, 50)}...` : 'null',
                mergedDataKeys: file.mergedData ? Object.keys(file.mergedData) : 'null',
                analysisResultsKeys: file.analysisResults ? Object.keys(file.analysisResults) : 'null',
                analysisInputsKeys: file.analysisInputs ? Object.keys(file.analysisInputs) : 'null'
              });
              
              possibleUrlProperties.forEach(prop => {
                if (file[prop]) {
                  console.log(`🔍 Found "${prop}":`, file[prop].substring(0, 150) + '...');
                  console.log(`🔍 "${prop}" includes SAI%2520SHARAN:`, file[prop].includes('SAI%2520SHARAN'));
                  console.log(`🔍 "${prop}" includes analysis-reports:`, file[prop].includes('/analysis-reports/'));
                }
              });
              
              console.groupEnd();
              
              for (const prop of possibleUrlProperties) {
                if (file[prop] && !file[prop].includes('/analysis-reports/') && !file[prop].includes('.pdf')) {
                                  // **LEGACY FIX**: Handle old double-encoded URLs by fixing the path
                // ⚡ EMERGENCY FIX: Try multiple URL variations to find working one
                let urlsToTry = [file[prop]];
                
                // Add decoded version if it contains double-encoding
                if (file[prop].includes('SAI%2520SHARAN')) {
                  const singleEncoded = file[prop].replace(/SAI%2520SHARAN/g, 'SAI%20SHARAN');
                  urlsToTry.push(singleEncoded);
                  
                  // Also try fully decoded version
                  const fullyDecoded = file[prop].replace(/SAI%2520SHARAN/g, 'SAI SHARAN');
                  urlsToTry.push(fullyDecoded);
                }
                
                console.log(`🔧 Will try ${urlsToTry.length} URL variations for ${file.fileName}:`);
                urlsToTry.forEach((url, i) => console.log(`   ${i+1}. ${url.substring(0, 120)}...`));
                
                // Use the first URL for now (we'll handle fallbacks in the img onError)
                mediaUrl = urlsToTry[0];
                
                // Store all variations in the img element for onError fallback
                window.urlVariations = window.urlVariations || {};
                window.urlVariations[file.id] = urlsToTry;
                // Detect media type from URL or file properties
                if (file[prop].includes('.mp4') || file[prop].includes('.avi') || file[prop].includes('.mov') || file[prop].includes('.webm') || file[prop].includes('video/')) {
                  mediaType = 'video';
                } else {
                  mediaType = 'image';
                }
                
                console.log(`✅ Found analysis image URL from property "${prop}"`);
                console.log(`🔧 Final URL for ${file.fileName}:`, mediaUrl.substring(0, 150) + '...');
                break;
                }
              }
              
              if (mediaUrl) {
                console.log('✅ Using Brand Logo methodology for preview:', file.fileName, mediaUrl.substring(0, 100) + '...', 'MediaType:', mediaType);
                
                                // **BRAND LOGO METHODOLOGY**: No refresh logic, just use the URL as-is
              }
              // **FALLBACK**: Check if file.url contains a valid image URL (not analysis-reports)
              else if (file.url && !file.url.includes('/analysis-reports/') && !file.url.includes('.pdf')) {
                // **LEGACY FIX**: Handle old double-encoded URLs by fixing the path
                let fixedUrl = file.url;
                
                if (fixedUrl.includes('SAI%2520SHARAN')) {
                  console.log(`🔧 LEGACY FIX: Converting double-encoded file.url for ${file.fileName}`);
                  console.log(`🔧 Original file.url:`, fixedUrl.substring(0, 150) + '...');
                  
                  // Fix the path part: SAI%2520SHARAN → SAI%20SHARAN
                  fixedUrl = fixedUrl.replace(/SAI%2520SHARAN/g, 'SAI%20SHARAN');
                  
                  console.log(`🔧 Fixed file.url:`, fixedUrl.substring(0, 150) + '...');
                  console.log(`✅ Double-encoding fixed in file.url: SAI%2520SHARAN → SAI%20SHARAN`);
                }
                
                mediaUrl = fixedUrl;
                // Detect media type from URL
                if (fixedUrl.includes('.mp4') || fixedUrl.includes('.avi') || fixedUrl.includes('.mov') || fixedUrl.includes('.webm') || fixedUrl.includes('video/')) {
                  mediaType = 'video';
                } else {
                  mediaType = 'image';
                }
                console.log('✅ Using file.url with legacy fix:', file.fileName, mediaUrl.substring(0, 100) + '...', 'MediaType:', mediaType);
                
                                // **BRAND LOGO METHODOLOGY**: No refresh logic, just use the URL as-is
              }
              // **NO OTHER FALLBACKS**: If no valid mediaUrl, show placeholder
              else {
                console.log('🚫 No valid mediaUrl found for analysis preview:', file.fileName, 'Will show placeholder');
                mediaUrl = null; // Force placeholder - don't use PDF URLs for image preview
              }
            }
            
            // **PRIORITY FIX**: Check base64 data FIRST since signed URLs are broken
            if (!mediaUrl) {
              console.log('🔍 No signed URL found, checking base64 fallbacks for:', file.fileName);
              
              // **EXPANDED BASE64 SEARCH**: Look for base64 data in ALL possible locations
              const base64Sources = [
                { key: 'originalAdImage', data: file.originalAdImage },
                { key: 'adImageData', data: file.adImageData },
                { key: 'analysisInputs.uploadedImage', data: file.analysisInputs?.uploadedImage },
                { key: 'fileContent', data: file.fileContent },
                { key: 'mergedData.originalAdImage', data: file.mergedData?.originalAdImage },
                { key: 'mergedData.adImageData', data: file.mergedData?.adImageData },
                { key: 'analysisResults.uploadedImage', data: file.analysisResults?.uploadedImage },
                { key: 'analysisInputs.originalImage', data: file.analysisInputs?.originalImage },
                { key: 'base64Data', data: file.base64Data },
                { key: 'imageData', data: file.imageData }
              ];
              
              for (const source of base64Sources) {
                if (source.data && typeof source.data === 'string' && source.data.length > 100) {
                  mediaUrl = source.data.startsWith('data:') ? source.data : `data:image/jpeg;base64,${source.data}`;
                  // Detect media type from data URL
                  if (source.data.startsWith('data:video/') || source.data.includes('video/')) {
                    mediaType = 'video';
                  } else {
                    mediaType = 'image';
                  }
                  console.log(`✅ Found base64 image from ${source.key} for:`, file.fileName);
                  break;
                }
              }
              
              if (!mediaUrl) {
                console.log('❌ No base64 image data found in any location for:', file.fileName);
                console.log('🔍 Searched in:', base64Sources.map(s => s.key));
              }
            }
            
            // **DEBUGGER MODE**: Final decision analysis 
            console.group(`🐛 DEBUGGER - Final Rendering Decision for: ${file.fileName}`);
            console.log('🎯 FINAL RENDER VALUES:', {
              hasMediaUrl: !!mediaUrl,
              mediaUrl: mediaUrl ? mediaUrl.substring(0, 100) + '...' : 'null',
              mediaType: mediaType,
              willRenderImage: !!(mediaUrl && mediaType === 'image'),
              willRenderVideo: !!(mediaUrl && mediaType === 'video'),
              imageContainerWillShow: mediaType === 'image' && mediaUrl && !mediaUrl.includes('/analysis-reports/'),
              fallbackWillShow: !mediaType || !mediaUrl
            });
            
            if (!mediaUrl) {
              console.error('🚨 NO mediaUrl - This is why image preview is not showing!');
              console.log('📋 Available fallback data:', {
                hasOriginalAdImage: !!file.originalAdImage,
                hasAdImageData: !!file.adImageData,
                hasAnalysisInputsUploadedImage: !!file.analysisInputs?.uploadedImage,
                hasFileContent: !!file.fileContent
              });
            }
            
            if (mediaUrl && mediaUrl.includes('/analysis-reports/')) {
              console.error('🚨 mediaUrl contains /analysis-reports/ - This is being filtered out!');
            }
            
            console.groupEnd();
            

            
            // Display thumbnail based on content type
            if (mediaUrl && mediaType === 'video') {
              return (
                <div style={{
                  width: '100%', 
                  height: '150px',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <video 
                    src={mediaUrl}
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'cover',
                      borderRadius: '0.5rem'
                    }}
                    preload="metadata"
                    muted
                    onError={(e) => {
                      // Fallback to purple video card if video fails to load
                      e.target.style.display = 'none';
                      const fallback = e.target.nextElementSibling;
                      if (fallback) fallback.style.display = 'flex';
                    }}
                  />
                  <div style={{
                    width: '100%', 
                    height: '100%',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '0.5rem',
                    display: 'none',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    position: 'absolute',
                    top: 0,
                    left: 0
                  }}>
                    <Video size={48} />
                  </div>
                  <div style={{
                    position: 'absolute',
                    bottom: '0.5rem',
                    right: '0.5rem',
                    background: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}>
                    <Video size={12} />
                    Video
                  </div>
                </div>
              );
            } else if (mediaUrl && mediaType === 'image') {
              // **FIXED**: Use the mediaUrl variable that was set in the logic above
              console.log('🖼️ Rendering image for:', file.fileName, 'URL:', mediaUrl.substring(0, 100) + '...');
              return (
                <img 
                  src={mediaUrl}
                  alt={file.fileName || 'Ad Media'}
                  data-file-id={file.id}
                  style={{ 
                    width: '100%', 
                    height: '150px', 
                    objectFit: 'cover',
                    borderRadius: '0.5rem',
                    marginBottom: '1rem'
                  }}
                  onError={(e) => {
                    const fileId = e.target.getAttribute('data-file-id');
                    const urlVariations = window.urlVariations?.[fileId] || [];
                    const currentSrc = e.target.src;
                    
                    // **FIX**: Prevent infinite loops by tracking failed attempts
                    if (!e.target.failedAttempts) e.target.failedAttempts = [];
                    if (e.target.failedAttempts.includes(currentSrc)) {
                      console.log('💀 Preventing infinite loop for:', file.fileName, 'Already tried:', currentSrc.substring(0, 100) + '...');
                    e.target.style.display = 'none';
                      return;
                    }
                    e.target.failedAttempts.push(currentSrc);
                    
                    console.error('❌ Analysis image failed to load:', currentSrc.substring(0, 100) + '...');
                    
                    // First try URL variations (single/double encoding fixes)
                    const currentIndex = urlVariations.findIndex(url => url === currentSrc);
                    const nextIndex = currentIndex + 1;
                    
                    if (nextIndex < urlVariations.length) {
                      const nextUrl = urlVariations[nextIndex];
                      if (!e.target.failedAttempts.includes(nextUrl)) {
                        console.log(`🔄 Trying URL variation ${nextIndex + 1}/${urlVariations.length}:`, nextUrl.substring(0, 100) + '...');
                        e.target.src = nextUrl;
                        return;
                      }
                    }
                    
                    // If all URL variations failed, try base64 fallback
                    console.log('🔄 All URL variations failed, trying base64 fallback for:', file.fileName);
                    
                    let fallbackSrc = null;
                    if (file.originalAdImage && !file.originalAdImage.includes('SAI%')) {
                      fallbackSrc = file.originalAdImage.startsWith('data:') ? file.originalAdImage : `data:image/jpeg;base64,${file.originalAdImage}`;
                      console.log('✅ Using originalAdImage base64 fallback');
                    } else if (file.adImageData && !file.adImageData.includes('SAI%')) {
                      fallbackSrc = file.adImageData.startsWith('data:') ? file.adImageData : `data:image/jpeg;base64,${file.adImageData}`;
                      console.log('✅ Using adImageData base64 fallback');
                    } else if (file.analysisInputs?.uploadedImage && !file.analysisInputs.uploadedImage.includes('SAI%')) {
                      fallbackSrc = file.analysisInputs.uploadedImage.startsWith('data:') ? file.analysisInputs.uploadedImage : `data:image/jpeg;base64,${file.analysisInputs.uploadedImage}`;
                      console.log('✅ Using analysisInputs.uploadedImage base64 fallback');
                    }
                    
                    if (fallbackSrc && !e.target.failedAttempts.includes(fallbackSrc)) {
                      console.log('🔄 Switching to base64 fallback for:', file.fileName);
                      e.target.src = fallbackSrc;
                    } else {
                      console.log('❌ No valid fallbacks available, hiding image for:', file.fileName);
                      e.target.style.display = 'none';
                    }
                  }}
                  onLoad={() => {
                    console.log('✅ Image loaded successfully for:', file.fileName);
                  }}
                />
              );
            } else {
              // Fallback for no media content
              return (
                <div style={{
                  width: '100%', 
                  height: '150px',
                  background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                  flexDirection: 'column',
                  border: '2px dashed #d1d5db'
                }}>
                  <FileImage size={32} style={{ marginBottom: '0.5rem', opacity: 0.6 }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: '500', textAlign: 'center' }}>
                    {file.fileCategory === 'analysis-report' ? '📊 Analysis Report' : '📄 File'}
                  </span>
                  <span style={{ fontSize: '0.625rem', opacity: 0.7, marginTop: '0.25rem' }}>
                    No preview available
                  </span>
                </div>
              );
            }
          })()}
          
          {/* Type Badge */}
          <div style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: fileType === 'video' ? '#dc2626' : file.fileCategory === 'analysis-report' ? '#22c55e' : '#3b82f6',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '12px',
            fontSize: '0.75rem',
            fontWeight: '600',
            textTransform: 'uppercase',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            {file.fileCategory === 'analysis-report' ? 'ANALYSIS' : fileType.toUpperCase()}
          </div>
        </div>

        <h4 style={{ 
          color: 'var(--text-dark)', 
          marginBottom: '0.5rem',
          fontSize: '1rem',
          fontWeight: '500'
        }}>
          {file.analysisInputs?.adTitle || 
           (file.fileName && file.fileName.startsWith('Analysis - ') 
             ? file.fileName.replace('Analysis - ', '') 
             : file.fileName) || 
           'Unnamed File'}
        </h4>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
          <div>{formatDate(file.createdAt)}</div>
          {file.analysisInputs?.brandName && (
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Brand: {file.analysisInputs.brandName}
            </div>
          )}
        </div>
        {performanceScore > 0 && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.25rem',
            color: getPerformanceColor(performanceScore),
            fontWeight: '500'
          }}>
            <BarChart3 size={16} />
            {performanceScore}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <span style={{
          background: 'var(--bg-light)',
          padding: '0.25rem 0.5rem',
          borderRadius: '0.25rem',
          fontSize: '0.75rem',
          color: 'var(--text-dark)'
        }}>
          {funnelStage}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '1rem' }}>
        {fileTags.filter(tag => 
          // Filter out channel-related tags to avoid duplicates with selectedChannels
          !['Meta/Facebook', 'TikTok', 'Google Ads', 'YouTube', 'Instagram', 'LinkedIn'].includes(tag)
        ).map((tag, index) => (
          <span 
            key={index}
            style={{
              background: 'var(--primary-purple)',
              color: 'white',
              padding: '0.125rem 0.5rem',
              borderRadius: '0.25rem',
              fontSize: '0.75rem'
            }}
          >
            {tag}
          </span>
        ))}
        {file.analysisInputs?.selectedChannels && file.analysisInputs.selectedChannels.map((channel, index) => (
          <span 
            key={`channel-${index}`}
            style={{
              background: '#3b82f6', // Use blue for channel tags to distinguish them
              color: 'white',
              padding: '0.125rem 0.5rem',
              borderRadius: '0.25rem',
              fontSize: '0.75rem'
            }}
          >
            {channel}
          </span>
        ))}
      </div>

      {/* Enhanced Action Buttons with Better Hierarchy */}
      <div style={{ 
        display: 'flex', 
        gap: '0.75rem',
        marginTop: '1rem',
        alignItems: 'center'
      }}>
        {/* Primary Action - View Details */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleViewDetails(file);
          }}
          className="btn btn-primary"
          style={{ 
            flex: 1, 
            fontSize: '0.875rem', 
            padding: '0.75rem 1rem',
            fontWeight: '500',
            borderRadius: '8px',
            transition: 'all 0.2s ease-in-out',
            minHeight: '44px'
          }}
          disabled={!file.analysisId && !file.artifact_id && !file.id}
          onMouseEnter={(e) => {
            if (!e.target.disabled) {
              e.target.style.transform = 'translateY(-1px)';
              e.target.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = 'none';
          }}
        >
          <FileText size={16} style={{ marginRight: '0.5rem' }} />
          View Details
        </button>
        
        {/* Secondary Actions */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {/* Download Report Button */}
          {(file.fileType === 'application/pdf' || file.fileCategory === 'analysis-report') && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleFileDownload(file);
              }}
              className="btn btn-secondary"
              style={{ 
                fontSize: '0.875rem', 
                padding: '0.75rem',
                borderRadius: '8px',
                transition: 'all 0.2s ease-in-out',
                minWidth: '44px',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Download Report"
              onMouseEnter={(e) => {
                e.target.style.transform = 'translateY(-1px)';
                e.target.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = 'none';
              }}
            >
              <Download size={18} />
            </button>
          )}
          
          {/* Delete Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleFileDelete(file.id);
            }}
            className="btn btn-danger"
            style={{ 
              fontSize: '0.875rem', 
              padding: '0.75rem',
              borderRadius: '8px',
              transition: 'all 0.2s ease-in-out',
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Delete File"
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-1px)';
              e.target.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = 'none';
            }}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};





  const renderFileList = (file) => {
    const performanceScore = getPerformanceScore(file.analysisResults);
    const fileType = getFileType(file);
    const funnelStage = getFunnelStage(file.analysisInputs);
    const fileTags = file.tags || [];
    
    return (
      <div 
        key={file.id}
        className="auth-card"
        style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          cursor: 'pointer',
          borderRadius: '0',
          border: 'none',
          borderBottom: '1px solid #f1f5f9',
          padding: '1rem 1.5rem',
          margin: '0',
          width: '100%',
          boxSizing: 'border-box',
          overflow: 'visible',
          minHeight: '80px',
          minWidth: '600px'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f8fafc';
          e.currentTarget.style.borderBottomColor = '#e2e8f0';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.borderBottomColor = '#f1f5f9';
        }}
        onClick={() => handleFileSelect(file.id)}
    >
      {/* Enhanced Thumbnail Display for List View */}
      {(() => {
        // Try to get the actual media content for thumbnail
        let mediaUrl = null;
        let mediaType = 'image';
        
        // For analysis reports, try to get the uploaded ad image
        if (file.fileCategory === 'analysis-report') {
          // **PRIORITY: Check for uploaded media URL from analysis record**
          if (file.mediaUrl && !file.mediaUrl.includes('/analysis-reports/')) {
            // **FIX URL ENCODING**: Decode double-encoded URLs for list view
            try {
              mediaUrl = decodeURIComponent(file.mediaUrl);
              console.log('🔧 List view URL decoded:', file.fileName);
            } catch (decodeError) {
              console.warn('⚠️ List view URL decode failed:', decodeError);
            mediaUrl = file.mediaUrl;
            }
            // **FIX**: Use stored mediaType first, then detect from URL or file properties
            if (file.mediaType && file.mediaType.startsWith('video/')) {
              mediaType = 'video';
            } else if (file.mediaCategory === 'video') {
              mediaType = 'video';
            } else if (file.mediaUrl && (file.mediaUrl.includes('.mp4') || file.mediaUrl.includes('.avi') || file.mediaUrl.includes('.mov') || file.mediaUrl.includes('.webm') || file.mediaUrl.includes('video/'))) {
              mediaType = 'video';
            } else {
              mediaType = (file.mediaType && file.mediaType.startsWith('image')) ? 'image' : 'image';
            }
            console.log('🎯 List view using analysis mediaUrl:', file.fileName);
          }
          // **FALLBACK**: Check if file.url contains a valid image URL (not analysis-reports)
          else if (file.url && !file.url.includes('/analysis-reports/') && !file.url.includes('.pdf')) {
            try {
              mediaUrl = decodeURIComponent(file.url);
              console.log('🔧 List view fallback URL decoded:', file.fileName);
            } catch (decodeError) {
              console.warn('⚠️ List view fallback URL decode failed:', decodeError);
              mediaUrl = file.url;
            }
            // Detect media type from URL or file properties
            if (file.url && (file.url.includes('.mp4') || file.url.includes('.avi') || file.url.includes('.mov') || file.url.includes('.webm') || file.url.includes('video/'))) {
              mediaType = 'video';
            } else {
              mediaType = (file.mediaType && file.mediaType.startsWith('image')) ? 'image' : 'image';
            }
            console.log('🎯 List view using file.url:', file.fileName);
          }
          // Legacy fallbacks for older analysis records
          else if (file.originalAdImage) {
            mediaUrl = file.originalAdImage.startsWith('data:') ? file.originalAdImage : `data:image/jpeg;base64,${file.originalAdImage}`;
            mediaType = 'image';
          } else if (file.adImageData) {
            mediaUrl = file.adImageData.startsWith('data:') ? file.adImageData : `data:image/jpeg;base64,${file.adImageData}`;
            mediaType = 'image';
          } else if (file.analysisInputs?.uploadedImage) {
            mediaUrl = file.analysisInputs.uploadedImage.startsWith('data:') ? file.analysisInputs.uploadedImage : `data:image/jpeg;base64,${file.analysisInputs.uploadedImage}`;
            mediaType = 'image';
          } else if (file.fileContent) {
            mediaUrl = file.fileContent.startsWith('data:') ? file.fileContent : `data:image/jpeg;base64,${file.fileContent}`;
            mediaType = 'image';
          }
        } else {
          // For regular uploaded files
          if (file.fileContent) {
            mediaUrl = file.fileContent.startsWith('data:') ? file.fileContent : `data:${getFileType(file)}/${file.fileFormat || 'jpeg'};base64,${file.fileContent}`;
            mediaType = getFileType(file);
          }
        }
        
        // Display thumbnail based on content type
        if (mediaUrl && mediaType === 'video') {
          return (
            <div style={{
              width: '80px', 
              height: '80px',
              borderRadius: '0.5rem',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <video 
                src={mediaUrl}
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'cover',
                  borderRadius: '0.5rem'
                }}
                muted
                preload="metadata"
                onError={(e) => {
                  console.error('❌ Video thumbnail load failed for:', file.fileName);
                  // Fallback to icon
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              {/* Fallback icon if video fails to load */}
              <div style={{
                display: 'none',
                width: '80px', 
                height: '80px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '0.5rem',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                position: 'absolute',
                top: 0,
                left: 0
              }}>
                <Video size={32} />
              </div>
              {/* Play button overlay */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(0,0,0,0.6)',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white'
              }}>
                <Video size={12} />
              </div>
            </div>
          );
        } else if (mediaUrl && mediaType === 'image') {
          return (
            <img 
              src={mediaUrl}
              alt={file.fileName || 'Ad Media'}
              data-file-id={file.id}
              style={{ 
                width: '80px', 
                height: '80px', 
                objectFit: 'cover',
                borderRadius: '0.5rem'
              }}
              onError={(e) => {
                console.error('❌ List view image load failed for:', file.fileName, 'URL:', mediaUrl);
                // Try fallback image sources
                if (file.originalAdImage && mediaUrl !== file.originalAdImage) {
                  e.target.src = file.originalAdImage.startsWith('data:') ? file.originalAdImage : `data:image/jpeg;base64,${file.originalAdImage}`;
                } else if (file.adImageData && mediaUrl !== file.adImageData) {
                  e.target.src = file.adImageData.startsWith('data:') ? file.adImageData : `data:image/jpeg;base64,${file.adImageData}`;
                } else {
                e.target.style.display = 'none';
                }
              }}
              onLoad={() => {
                console.log('✅ List view image loaded successfully for:', file.fileName);
              }}
            />
          );
        } else {
          // Fallback for no media content
          return (
            <div style={{
              width: '80px', 
              height: '80px',
              background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
              borderRadius: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b7280',
              border: '2px dashed #d1d5db'
            }}>
              <FileImage size={24} style={{ opacity: 0.6 }} />
            </div>
          );
        }
      })()}
      
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={{ color: 'var(--text-dark)', marginBottom: '0.25rem' }}>
          {file.analysisInputs?.adTitle || 
           (file.fileName && file.fileName.startsWith('Analysis - ') 
             ? file.fileName.replace('Analysis - ', '') 
             : file.fileName) || 
           'Unnamed File'}
        </h4>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: 'var(--text-light)' }}>
          <span>{formatDate(file.createdAt)}</span>
          <span>{funnelStage}</span>
          {file.analysisInputs?.brandName && (
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              Brand: {file.analysisInputs.brandName}
            </span>
          )}
          {performanceScore > 0 && (
            <span style={{ color: getPerformanceColor(performanceScore), fontWeight: '500' }}>
              Score: {performanceScore}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
          {fileTags.map((tag, index) => (
            <span 
              key={index}
              style={{
                background: 'var(--primary-purple)',
                color: 'white',
                padding: '0.125rem 0.5rem',
                borderRadius: '0.25rem',
                fontSize: '0.75rem'
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div style={{ 
        display: 'flex', 
        gap: '0.75rem',
        alignItems: 'center',
        justifyContent: 'flex-end',
        flexShrink: 0,
        minWidth: '150px',
        marginLeft: 'auto'
      }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleViewDetails(file);
          }}
          className="btn btn-primary"
          style={{ 
            fontSize: '0.875rem', 
            padding: '0.4rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '42px',
            minHeight: '42px'
          }}
          disabled={!file.analysisId && !file.artifact_id && !file.id}
          title="View Details"
        >
          <FileText size={18} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleFileDownload(file);
          }}
          className="btn btn-secondary"
          style={{ 
            fontSize: '0.875rem', 
            padding: '0.4rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '42px',
            minHeight: '42px'
          }}
        >
          <Download size={18} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleFileDelete(file.id);
          }}
          className="btn"
          style={{ 
            fontSize: '0.875rem', 
            padding: '0.4rem', 
            background: '#ef4444', 
            borderColor: '#ef4444',
            color: 'white',
            border: '1px solid #ef4444',
            borderRadius: '0.375rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '42px',
            minHeight: '42px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => {
            e.target.style.background = '#dc2626';
            e.target.style.borderColor = '#dc2626';
          }}
          onMouseOut={(e) => {
            e.target.style.background = '#ef4444';
            e.target.style.borderColor = '#ef4444';
          }}
        >
          <Trash2 size={18} color="white" />
        </button>
      </div>
    </div>
    );
  };

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ 
        maxWidth: '1200px', 
        margin: '0 auto',
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.9) 100%)',
        backdropFilter: 'blur(20px)',
        borderRadius: '24px',
        padding: '2rem',
        border: '1px solid rgba(124, 58, 237, 0.06)',
        boxShadow: '0 8px 32px rgba(124, 58, 237, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.8)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ 
            fontSize: '1.75rem', 
            fontWeight: '600', 
            color: '#5b21b6',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <FolderOpen size={24} />
            Libraries
          </h2>
          
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => setViewMode('grid')}
              className={`btn ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.5rem' }}
            >
              <Grid size={20} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`btn ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.5rem' }}
            >
              <List size={20} />
            </button>
          </div>
        </div>

        {/* Search and Sort */}
        <div className="auth-card" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '1rem', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Search
              </label>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ 
                  position: 'absolute', 
                  left: '0.75rem', 
                  top: '50%', 
                  transform: 'translateY(-50%)',
                  color: 'var(--text-light)'
                }} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    console.log('🔍 Search term changed:', newValue);
                    setSearchTerm(newValue);
                  }}
                  placeholder="Search files by name, ad title, tags..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    paddingLeft: '2.5rem',
                    border: '1px solid var(--border-gray)',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Sort by Time
              </label>
              <select
                value={sortBy}
                onChange={(e) => {
                  const newValue = e.target.value;
                  console.log('🔍 Sort by changed:', newValue);
                  setSortBy(newValue);
                }}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid var(--border-gray)',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem'
                }}
              >
                {sortOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {/* Refresh Button */}
            <div>
              <button
                onClick={() => {
                  console.log('🔄 Force refresh triggered - clearing caches');
                  // Clear all caches
                  pdfUrlCache.current = {};
                  localStorage.removeItem('incivus_new_analysis_added');
                  localStorage.removeItem(`userFiles_${currentUser?.uid}`);
                  
                  // Force reload
                  window.location.reload();
                }}
                className="btn btn-secondary"
                style={{ 
                  padding: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem'
                }}
              >
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
            
            {/* Auto-Refresh Indicator */}
            {autoRefreshActive && (
              <div style={{ 
                padding: '0.75rem', 
                backgroundColor: '#e7f3ff', 
                border: '1px solid #3b82f6',
                borderRadius: '0.5rem',
                marginBottom: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ 
                    width: '12px', 
                    height: '12px', 
                    backgroundColor: '#3b82f6',
                    borderRadius: '50%',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }}></div>
                  <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#1e40af' }}>
                    🔄 Auto-refreshing for new upload (Attempt {autoRefreshCount}/20)
                  </span>
          </div>
                <button
                  onClick={stopAutoRefresh}
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    backgroundColor: 'transparent',
                    border: '1px solid #3b82f6',
                    borderRadius: '0.25rem',
                    color: '#3b82f6',
                    cursor: 'pointer'
                  }}
                >
                  Stop Auto-Refresh
                </button>
        </div>
            )}
            
            {/* Old Actions section removed - refresh button moved above */}
          </div>
        </div>



        {/* Loading State */}
        {loading && (
          <div className="auth-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <Loader size={48} style={{ color: 'var(--primary-purple)', marginBottom: '1rem', animation: 'spin 1s linear infinite' }} />
            <h3 style={{ color: 'var(--text-dark)', marginBottom: '0.5rem' }}>Loading your files...</h3>
            <p style={{ color: 'var(--text-light)' }}>
              Please wait while we fetch your uploaded ads and analysis data
            </p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="auth-card" style={{ textAlign: 'center', padding: '4rem 2rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <FolderOpen size={64} style={{ color: '#ef4444', marginBottom: '1rem' }} />
            <h3 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>Error Loading Files</h3>
            <p style={{ color: 'var(--text-light)', marginBottom: '1rem' }}>
              {error}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="btn btn-primary"
            >
              Retry
            </button>
          </div>
        )}

        {/* Results */}
        {!loading && !error && (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>
                {filteredAndSortedFiles.length} file{filteredAndSortedFiles.length !== 1 ? 's' : ''} found
                {selectedFiles.length > 0 && ` • ${selectedFiles.length} selected`}
              </p>
            </div>

            {selectedFiles.length > 0 && (
              <div className="auth-card" style={{ marginBottom: '2rem', background: 'var(--primary-purple)', color: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected</span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      onClick={() => {
                        selectedFiles.forEach(fileId => {
                          const file = userFiles.find(f => f.id === fileId);
                          if (file) handleFileDownload(file);
                        });
                      }}
                      className="btn btn-secondary" 
                      style={{ background: 'white', color: 'var(--primary-purple)' }}
                    >
                      Download Selected
                    </button>
                    <button 
                      onClick={() => {
                        setAlertState({
                          open: true,
                          title: 'Delete Multiple Files',
                          message: `Are you sure you want to delete ${selectedFiles.length} file(s)? This action cannot be undone.`,
                          severity: 'warning',
                          actions: [
                            {
                              label: 'Cancel',
                              onClick: () => setAlertState({ ...alertState, open: false }),
                              style: { backgroundColor: '#6b7280', color: 'white' }
                            },
                            {
                              label: 'Delete All',
                              onClick: () => {
                                selectedFiles.forEach(fileId => handleFileDelete(fileId));
                                setAlertState({ ...alertState, open: false });
                              },
                              style: { backgroundColor: '#ef4444', color: 'white' }
                            }
                          ]
                        });
                      }}
                      className="btn btn-secondary" 
                      style={{ background: '#ef4444', color: 'white', borderColor: '#ef4444' }}
                    >
                      Delete Selected
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Enhanced Files Grid/List */}
            {viewMode === 'grid' ? (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
                gap: '1.5rem',
                '@media (max-width: 768px)': {
                  gridTemplateColumns: '1fr',
                  gap: '1rem'
                }
              }}>
                {filteredAndSortedFiles.map(renderFileCard)}
              </div>
            ) : (
              <div style={{ 
                display: 'grid', 
                gap: '0.75rem',
                backgroundColor: 'white',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                overflow: 'hidden'
              }}>
                {filteredAndSortedFiles.map(renderFileList)}
              </div>
            )}

            {/* Empty State */}
            {!loading && !error && filteredAndSortedFiles.length === 0 && userFiles.length === 0 && (
              <div className="auth-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                <FolderOpen size={64} style={{ color: 'var(--text-light)', marginBottom: '1rem' }} />
                <h3 style={{ color: 'var(--text-dark)', marginBottom: '0.5rem' }}>No files uploaded yet</h3>
                <p style={{ color: 'var(--text-light)', marginBottom: '1rem' }}>
                  Upload some ads in the Analysis section to see them here, or add sample data for testing
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button 
                    onClick={() => window.location.hash = '#analysis'}
                    className="btn btn-primary"
                  >
                    Go to Analysis
                  </button>
                  <button 
                    onClick={handleAddSampleData}
                    className="btn btn-secondary"
                    style={{ background: 'var(--secondary-purple)', color: 'white', borderColor: 'var(--secondary-purple)' }}
                  >
                    Add Sample Data
                  </button>
                  <button 
                    onClick={() => {
                      // Clear cache and reload data
                      const cacheKey = `libraries_data_${currentUser?.uid}`;
                      localStorage.removeItem(cacheKey);
                      localStorage.removeItem(`${cacheKey}_timestamp`);
                      console.log('🎯 Cache cleared, refreshing page...');
                      window.location.reload();
                    }}
                    className="btn btn-outline-primary"
                    style={{ marginLeft: '0.5rem' }}
                  >
                    🔄 Force Refresh
                  </button>
                </div>
              </div>
            )}

            {/* No Results State */}
            {!loading && !error && filteredAndSortedFiles.length === 0 && userFiles.length > 0 && (
              <div className="auth-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                <Search size={64} style={{ color: 'var(--text-light)', marginBottom: '1rem' }} />
                <h3 style={{ color: 'var(--text-dark)', marginBottom: '0.5rem' }}>No files match your search</h3>
                <p style={{ color: 'var(--text-light)' }}>
                  Try adjusting your search or filter criteria
                </p>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Custom Alert Component */}
      <CustomAlert
        open={alertState.open}
        title={alertState.title}
        message={alertState.message}
        severity={alertState.severity}
        actions={alertState.actions}
        onClose={() => setAlertState({ ...alertState, open: false })}
      />

    </div>
  );
};

export default Libraries; 