import React, { useState, useEffect } from 'react';
import { Upload, Play, BarChart3 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
// File preview function removed - not necessary for core functionality
import unifiedApi from '../utils/unifiedApiHelper';

const PlanBasedAnalysis = ({ userPlan = 'lite', setUserFlow, onAnalyzeAdClick = null }) => {
  const { currentUser } = useAuth();
  
  const [uploadedFile, setUploadedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [selectedChannels, setSelectedChannels] = useState(['Facebook']);
  const [funnelStage, setFunnelStage] = useState(['Consideration']);
  const [messageIntent, setMessageIntent] = useState('');
  const [adTitle, setAdTitle] = useState(''); // Add dedicated ad title field
  const [loading, setLoading] = useState(false);
  const [quotaStatus, setQuotaStatus] = useState(null);
  const [geminiResults, setGeminiResults] = useState(null);
  const [mediaType, setMediaType] = useState('video');

  const channels = ['Facebook', 'TikTok', 'Google Ads', 'YouTube', 'Instagram'];
  const funnelStages = ['Awareness', 'Consideration', 'Conversion'];

  // Check ad quota
  const checkAdQuota = () => {
    const usedAds = parseInt(localStorage.getItem('incivus_ads_used') || '0');
    const maxAds = 11; // Default to pro plan limit
    
    return {
      canAnalyze: usedAds < maxAds,
      used: usedAds,
      max: maxAds,
      remaining: maxAds - usedAds
    };
  };

  // Increment ad usage
  const incrementAdUsage = () => {
    const currentUsage = parseInt(localStorage.getItem('incivus_ads_used') || '0');
    localStorage.setItem('incivus_ads_used', (currentUsage + 1).toString());
  };

  // Load user data on component mount
  useEffect(() => {
    const loadUserData = async () => {
      try {
        // Check ad quota
        const quota = checkAdQuota();
        setQuotaStatus(quota);
        
        console.log('📊 Ad quota:', quota);
        
      } catch (error) {
        console.error('❌ Error loading user data:', error);
      }
    };

    loadUserData();
  }, [currentUser]);

  // Handle file upload with video optimization
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setLoading(true);
      
      // **NEW**: File size validation
      const maxSize = file.type.startsWith('video/') ? 100 * 1024 * 1024 : 10 * 1024 * 1024; // 100MB for video, 10MB for image
      const fileSizeMB = file.size / 1024 / 1024;
      
      console.log(`📁 File upload: ${file.name} (${fileSizeMB.toFixed(2)}MB, ${file.type})`);
      
      if (file.size > maxSize) {
        alert(`File too large! Maximum size: ${file.type.startsWith('video/') ? '100MB' : '10MB'}. Current size: ${fileSizeMB.toFixed(2)}MB`);
        return;
      }
      
      const reader = new FileReader();
      const preview = await new Promise((resolve) => {
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
      setFilePreview(preview);
      setUploadedFile(file);
      setMediaType(file.type.startsWith('video/') ? 'video' : 'image');
      
      // **NEW**: Show video optimization notice
      if (file.type.startsWith('video/') && file.size > 20 * 1024 * 1024) {
        console.log('📹 Large video file detected - will be optimized for analysis');
      }
      
    } catch (error) {
      console.error('❌ Error uploading file:', error);
      alert('Error uploading file: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle analysis
  const handleAnalyze = async () => {
    if (!uploadedFile) {
      alert('Please upload a file first');
      return;
    }

    if (!currentUser) {
      alert('Please log in to analyze ads');
      return;
    }

    // Check if user has subscription
    const subscription = localStorage.getItem('incivus_subscription');
    if (!subscription) {
      console.log('📋 Redirecting to plan selection - no subscription');
      setUserFlow('plan-selection');
      return;
    }

    // Check ad quota
    const quota = checkAdQuota();
    if (!quota.canAnalyze) {
      console.log('📋 Redirecting to plan selection - quota exceeded');
      setUserFlow('plan-selection');
      return;
    }

    try {
      setIsAnalyzing(true);
      
      // Get user's brand data (required for analysis)
      const brandData = await unifiedApi.getUserBrands(currentUser.uid);
      if (!brandData || !brandData.brandId) {
        alert('Please set up your brand first before analyzing ads');
        return;
      }

      // Use adTitle field first, then filename (without extension), then default
      const finalAdTitle = adTitle || uploadedFile.name.replace(/\.[^/.]+$/, '') || 'Ad Analysis';
      console.log('📝 Using ad title for analysis:', finalAdTitle);
      
      // Use new unifiedApi.submitAnalysisRequest() that goes through middleware
      const analysisResponse = await unifiedApi.submitAnalysisRequest({
        userId: currentUser.uid,
        brandId: brandData.brandId,
        messageIntent: messageIntent || '',
        funnelStage: Array.isArray(funnelStage) ? funnelStage[0] : (funnelStage || 'Awareness'),
        channels: Array.isArray(selectedChannels) ? selectedChannels : (selectedChannels || []),
        adTitle: finalAdTitle,
        timestamp: new Date().toISOString(),
        source: 'frontend',
        clientId: currentUser.uid,
        artifacts: {},
        selectedFeatures: [] // Will be determined by middleware based on plan
      }, uploadedFile);

      // Transform response to match expected format
      if (analysisResponse?.status === 'success' && analysisResponse?.ai_analysis_results?.['comprehensive-analysis']?.success) {
        const results = analysisResponse.ai_analysis_results['comprehensive-analysis'].data?.results || {};
        
        // Transform to match old format for backward compatibility
        const transformedData = {
          purchase_intent_score: results.metaphor_analysis?.purchase_intent_analysis?.overall_purchase_intent_percentage || 
                                results.content_analysis?.overall_purchase_intent_percentage || 'N/A',
          resonating_impact: results.metaphor_analysis?.purchase_intent_analysis?.resonating_impact || 
                            results.content_analysis?.resonating_impact || 'No resonating impact data available',
          reason: results.metaphor_analysis?.purchase_intent_analysis?.reasoning || 
                 results.content_analysis?.reasoning || 'No reasoning data available',
          raw_response: JSON.stringify(results, null, 2)
        };
        
        setGeminiResults(transformedData);
        
        // Update quota status
        setQuotaStatus(checkAdQuota());
        
        console.log('✅ Analysis completed successfully');
      } else {
        const errorMsg = analysisResponse?.error || analysisResponse?.detail || 'Unknown error';
        alert('Analysis failed: ' + errorMsg);
      }
    } catch (error) {
      console.error('❌ Error during analysis:', error);
      alert('Analysis failed: ' + (error.message || 'Unknown error'));
    } finally {
      setIsAnalyzing(false);
    }
  };



  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
                 <h1 style={{
           fontSize: '2rem',
           fontWeight: 'bold',
           color: '#1f2937',
           marginBottom: '0.5rem'
         }}>
           Ad Analyzer
         </h1>
         <p style={{ color: '#6b7280' }}>
           Upload your Ad image or video for comprehensive analysis and insights
         </p>
        
        {/* Ad Quota Status */}
        {quotaStatus && (
          <div style={{
            background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            padding: '1rem',
            marginTop: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <BarChart3 size={16} color="#6b7280" />
              <span style={{ fontWeight: 'bold', color: '#374151' }}>Ad Analysis Quota</span>
            </div>
            <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
              {quotaStatus.used} of {quotaStatus.max} Ads analyzed this month
              {quotaStatus.remaining > 0 && (
                <span style={{ color: '#10b981', fontWeight: 'bold' }}>
                  {' '}({quotaStatus.remaining} remaining)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* File Upload Section */}
      <div style={{
        background: 'white',
        border: '2px dashed #d1d5db',
        borderRadius: '12px',
        padding: '2rem',
        textAlign: 'center',
        marginBottom: '2rem'
      }}>
        <Upload size={48} color="#9ca3af" style={{ marginBottom: '1rem' }} />
        <h3 style={{ marginBottom: '1rem', color: '#374151' }}>Upload Your Ad</h3>
        <input
          type="file"
          accept="image/*,video/*"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'inline-block',
            transition: 'all 0.2s ease'
          }}
        >
          Choose File
        </label>
        
        {filePreview && (
          <div style={{ marginTop: '1rem' }}>
            <img 
              src={filePreview} 
              alt="Preview" 
              style={{ 
                maxWidth: '200px', 
                maxHeight: '200px', 
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }} 
            />
                         <button
               onClick={handleAnalyze}
               disabled={isAnalyzing || !quotaStatus?.canAnalyze}
              style={{
                background: isAnalyzing || !quotaStatus?.canAnalyze ? '#9ca3af' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '0.75rem 1.5rem',
                marginTop: '1rem',
                cursor: isAnalyzing || !quotaStatus?.canAnalyze ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                margin: '1rem auto 0'
              }}
            >
                             {isAnalyzing ? '⏳' : <Play size={16} />}
              {isAnalyzing ? 'Analyzing...' : 'Analyze Ad'}
            </button>
          </div>
        )}
      </div>

             {/* Analysis Results */}
       {geminiResults && (
         <div style={{ marginBottom: '2rem' }}>
           <h2 style={{
             fontSize: '1.5rem',
             fontWeight: 'bold',
             color: '#1f2937',
             marginBottom: '1.5rem'
           }}>
             AD Analyzer Results
           </h2>
           
           <div style={{
             background: 'white',
             border: '1px solid #e5e7eb',
             borderRadius: '12px',
             padding: '2rem',
             marginBottom: '1.5rem'
           }}>
             <h3 style={{
               fontSize: '1.2rem',
               fontWeight: 'bold',
               color: '#374151',
               marginBottom: '1rem'
             }}>
               Resonating Impact
             </h3>
             <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
               {geminiResults.resonating_impact || 'No resonating impact data available'}
             </p>
             
             <h3 style={{
               fontSize: '1.2rem',
               fontWeight: 'bold',
               color: '#374151',
               marginBottom: '1rem'
             }}>
               Purchase Intent Score
             </h3>
             <div style={{
               background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
               color: 'white',
               padding: '0.5rem 1rem',
               borderRadius: '20px',
               display: 'inline-block',
               fontSize: '1.1rem',
               fontWeight: 'bold',
               marginBottom: '1rem'
             }}>
               {geminiResults.purchase_intent_score || 'N/A'}
             </div>
             
             <h3 style={{
               fontSize: '1.2rem',
               fontWeight: 'bold',
               color: '#374151',
               marginBottom: '1rem'
             }}>
               Analysis Reasoning
             </h3>
             <p style={{ color: '#6b7280' }}>
               {geminiResults.reason || 'No reasoning data available'}
             </p>
           </div>
           
           {geminiResults.raw_response && (
             <details style={{ marginTop: '1rem' }}>
               <summary style={{
                 cursor: 'pointer',
                 color: '#6b7280',
                 fontSize: '0.9rem'
               }}>
                 View Raw Response
               </summary>
               <pre style={{
                 background: '#f9fafb',
                 padding: '1rem',
                 borderRadius: '8px',
                 fontSize: '0.8rem',
                 color: '#374151',
                 whiteSpace: 'pre-wrap',
                 marginTop: '0.5rem'
               }}>
                 {geminiResults.raw_response}
               </pre>
             </details>
           )}
         </div>
       )}

      
    </div>
  );
};

export default PlanBasedAnalysis; 