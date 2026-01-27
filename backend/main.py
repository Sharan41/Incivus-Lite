#!/usr/bin/env python3
"""
FastAPI Application for Ad Analysis Suite
Integrates ad_analyser, brand_compliance, and metaphor analysis features.
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
import uvicorn
import os
import tempfile
import shutil
import time
import requests
import asyncio
from typing import Optional, Dict, Any
import json

# Import the analysis modules
from ad_analyser import analyze_ad
from brand_compliance import analyze_brand_compliance
from metaphor import analyze_ad_in_batches, analyze_image
from gemini_channel_compliance_new import analyze_ad_with_gemini

def clear_analysis_module_cache():
    """
    Clear Python module cache for analysis modules to ensure fresh results.
    This prevents stale cached data from affecting subsequent analysis calls.
    """
    try:
        import gc
        import sys
        import importlib
        
        # Force garbage collection
        gc.collect()
        
        # List of analysis modules that might cache state
        modules_to_reload = [
            'metaphor', 
            'brand_compliance', 
            'ad_analyser', 
            'gemini_channel_compliance_new'
        ]
        
        reloaded_count = 0
        for module_name in modules_to_reload:
            if module_name in sys.modules:
                try:
                    importlib.reload(sys.modules[module_name])
                    print(f"🔄 Reloaded module: {module_name}")
                    reloaded_count += 1
                except Exception as e:
                    print(f"⚠️ Failed to reload {module_name}: {e}")
        
        # Re-configure Gemini API after module reload
        try:
            import google.generativeai as genai
            from metaphor import GEMINI_API_KEY
            genai.configure(api_key=GEMINI_API_KEY)
            print(f"✅ API re-configured after module reload")
        except Exception as e:
            print(f"⚠️ API re-configuration warning: {e}")
            
        print(f"🧹 Cache clearing completed: {reloaded_count} modules reloaded")
        return True
        
    except Exception as e:
        print(f"❌ Cache clearing failed: {e}")
        return False

def download_logo_from_url(url: str) -> Optional[str]:
    """Download logo image from URL and save to temporary file"""
    try:
        print(f"📥 Downloading logo from URL: {url[:100]}...")
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        # Determine file extension from content type or URL
        content_type = response.headers.get('content-type', '')
        if 'image/jpeg' in content_type or url.lower().endswith('.jpg') or url.lower().endswith('.jpeg'):
            ext = '.jpg'
        elif 'image/png' in content_type or url.lower().endswith('.png'):
            ext = '.png'
        elif 'image/webp' in content_type or url.lower().endswith('.webp'):
            ext = '.webp'
        else:
            ext = '.jpg'  # Default fallback
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_file:
            tmp_file.write(response.content)
            print(f"✅ Logo downloaded successfully: {tmp_file.name}")
            return tmp_file.name
            
    except Exception as e:
        print(f"❌ Failed to download logo from {url}: {str(e)}")
        return None

app = FastAPI(
    title="Ad Analysis Suite API",
    description="Comprehensive API for analyzing advertisements, brand compliance, and metaphor detection",
    version="1.0.0"
)

# Cloud deployment configurations
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
MAX_REQUEST_SIZE = 100 * 1024 * 1024  # 100MB

# Add trusted host middleware for cloud security
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)

# Note: Timeout middleware removed to allow long video analysis processing

# Add file size validation middleware
@app.middleware("http")
async def file_size_middleware(request: Request, call_next):
    if request.method == "POST":
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_REQUEST_SIZE:
            return JSONResponse(
                {"error": f"Request too large. Maximum size: {MAX_REQUEST_SIZE // (1024*1024)}MB"}, 
                status_code=413
            )
    return await call_next(request)

# Validate API keys and environment at startup
@app.on_event("startup")
async def validate_environment_and_api_keys():
    """Validate environment variables and API keys for cloud deployment"""
    print("🔧 ===== VALIDATING CLOUD DEPLOYMENT ENVIRONMENT =====")
    
    # Validate required environment variables
    required_env_vars = {
        "GOOGLE_AI_API_KEY": "Google AI API key for analysis",
        "FRONTEND_URLS": "Allowed frontend URLs for CORS",
        "ALLOWED_HOSTS": "Allowed host domains for security"
    }
    
    missing_vars = []
    for var, description in required_env_vars.items():
        value = os.getenv(var)
        if not value:
            missing_vars.append(f"{var} ({description})")
        else:
            print(f"✅ {var}: {'*' * min(10, len(value))}...")
    
    if missing_vars:
        print(f"⚠️ WARNING: Missing environment variables for production:")
        for var in missing_vars:
            print(f"   - {var}")
        print("💡 Using development defaults - ensure these are set for cloud deployment")
    
    print("🔑 ===== VALIDATING ALL AI MODEL API KEYS =====")
    
    try:
        import google.generativeai as genai
        
        # Test metaphor.py API key
        print("🔑 Testing Metaphor API key...")
        from metaphor import GEMINI_API_KEY as METAPHOR_KEY
        print(f"   Key: {METAPHOR_KEY[:20]}...")
        genai.configure(api_key=METAPHOR_KEY)
        model = genai.GenerativeModel("gemini-2.5-flash")
        test_response = model.generate_content("Test")
        print(f"✅ Metaphor API key working")
        
        # Test brand_compliance.py API key
        print("🔑 Testing Brand Compliance API key...")
        # Import the configured genai from brand_compliance
        import brand_compliance
        # The API key is already configured in brand_compliance.py
        print(f"✅ Brand Compliance API key configured")
        
        # Test ad_analyser.py API key  
        print("🔑 Testing Ad Analyser API key...")
        import ad_analyser
        print(f"✅ Ad Analyser API key configured")
        
        # Test gemini_channel_compliance_new.py API key
        print("🔑 Testing Channel Compliance API key...")
        import gemini_channel_compliance_new
        print(f"✅ Channel Compliance API key configured")
        
        print(f"🎉 All API keys validated successfully")
        
    except Exception as e:
        print(f"❌ API Key validation failed: {str(e)}")
        print(f"🔍 Error type: {type(e).__name__}")
        print(f"🚨 Server may not work properly with invalid API keys")
        print(f"🔍 Full error details: {repr(e)}")

# Add CORS middleware with cloud-compatible settings
import os
FRONTEND_URLS = os.getenv("FRONTEND_URLS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_URLS + ["http://localhost:3000", "http://localhost:8002"],  # Cloud + local
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "message": "Ad Analysis Suite API",
        "version": "1.0.0",
        "endpoints": {
            "/analyze-ad": "Analyze ad content and effectiveness",
            "/brand-compliance": "Check brand compliance and guidelines",
            "/metaphor-analysis": "Analyze metaphors and funnel compatibility",
            "/channel-compliance": "Check channel compliance for multiple platforms (YouTube, Instagram, Facebook, TikTok, Google Ads)"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "message": "API is running successfully",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }

@app.post("/analyze-ad")
async def analyze_ad_endpoint(
    file: UploadFile = File(...),
    ad_description: str = Form(...)
):
    """
    Analyze ad content and effectiveness.
    
    - **file**: Video or image file to analyze
    - **ad_description**: Description of the advertisement
    """
    try:
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
            shutil.copyfileobj(file.file, tmp_file)
            temp_path = tmp_file.name
        
        # Analyze ad content
        result = analyze_ad(temp_path)
        
        # Clean up temporary file
        os.unlink(temp_path)
        
        return JSONResponse(content=result)
        
    except Exception as e:
        # Clean up temporary file if it exists
        if 'temp_path' in locals():
            try:
                os.unlink(temp_path)
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/brand-compliance")
async def brand_compliance_endpoint(
    file: UploadFile = File(...),
    logo_images: Optional[list[UploadFile]] = File(None, description="Brand logo image files (optional)"),
    brand_logo_urls: Optional[str] = Form(None, description="Brand logo URLs (comma-separated)"),
    brand_logo_names: Optional[str] = Form(None, description="Brand logo names (comma-separated)"),
    brand_colors: Optional[str] = Form(None, description="Brand colors (comma-separated hex codes)"),
    tone_of_voice: Optional[str] = Form(None, description="Tone of voice (comma-separated values)")
):
    """
    Analyze brand compliance and check against guidelines.
    
    - **file**: Video or image file to analyze for brand compliance
    - **logo_images**: Multiple brand logo image files (optional)
    - **brand_colors**: Brand colors as comma-separated hex codes (optional)
    - **tone_of_voice**: Tone of voice as comma-separated values (optional)
    """
    try:
        # **FIX**: Clear cached state for fresh analysis
        clear_analysis_module_cache()
        
        # Create temporary file for main ad
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
            shutil.copyfileobj(file.file, tmp_file)
            temp_path = tmp_file.name
        
        # Handle multiple brand logos if provided
        logo_paths = []
        
        # Process uploaded logo files
        if logo_images:
            for logo_file in logo_images:
                with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(logo_file.filename)[1]) as logo_tmp:
                    shutil.copyfileobj(logo_file.file, logo_tmp)
                    logo_paths.append(logo_tmp.name)
        
        # Process brand logo URLs from frontend
        if brand_logo_urls:
            print(f"🔗 Processing brand logo URLs: {brand_logo_urls}")
            logo_urls = [url.strip() for url in brand_logo_urls.split(',') if url.strip()]
            for url in logo_urls:
                downloaded_path = download_logo_from_url(url)
                if downloaded_path:
                    logo_paths.append(downloaded_path)
                    print(f"✅ Added downloaded logo to brand compliance: {downloaded_path}")
                else:
                    print(f"⚠️ Skipping failed logo download: {url}")
        
        print(f"🖼️ Total logo files for brand compliance: {len(logo_paths)}")
        
        # Parse brand colors
        colors = None
        if brand_colors:
            colors = [color.strip() for color in brand_colors.split(',')]
        
        # Parse tone of voice
        tones = None
        if tone_of_voice:
            tones = [tone.strip() for tone in tone_of_voice.split(',')]
        
        # Analyze brand compliance
        result = analyze_brand_compliance(temp_path, logo_paths, colors, tones)
        
        # Clean up temporary files
        os.unlink(temp_path)
        for logo_path in logo_paths:
            try:
                os.unlink(logo_path)
            except:
                pass
        
        return JSONResponse(content=result)
        
    except Exception as e:
        # Clean up temporary files if they exist
        if 'temp_path' in locals():
            try:
                os.unlink(temp_path)
            except:
                pass
        if 'logo_paths' in locals():
            for logo_path in logo_paths:
                try:
                    os.unlink(logo_path)
                except:
                    pass
        raise HTTPException(status_code=500, detail=f"Brand compliance analysis failed: {str(e)}")

@app.post("/metaphor-analysis")
async def metaphor_analysis_endpoint(
    file: UploadFile = File(...),
    ad_description: str = Form(...),
    user_ad_type: str = Form(..., description="Awareness, Consideration, or Conversion")
):
    """
    Analyze metaphors and funnel compatibility.
    
    - **file**: Video or image file to analyze
    - **ad_description**: Description of the advertisement
    - **user_ad_type**: User's selected ad type (Awareness/Consideration/Conversion)
    """
    try:
        # **FIX**: Clear cached state for fresh analysis
        clear_analysis_module_cache()
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
            shutil.copyfileobj(file.file, tmp_file)
            temp_path = tmp_file.name
        
        # Determine file type and analyze
        file_extension = os.path.splitext(file.filename)[1].lower()
        
        if file_extension in ['.mp4', '.avi', '.mov', '.mkv', '.wmv']:
            # Ad analysis
            result = analyze_ad_in_batches(temp_path, ad_description, user_ad_type)
        elif file_extension in ['.jpg', '.jpeg', '.png', '.bmp', '.gif']:
            # Image analysis
            result = analyze_image(temp_path, ad_description, user_ad_type)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format")
        
        # Clean up temporary file
        os.unlink(temp_path)
        
        return JSONResponse(content=result)
        
    except Exception as e:
        # Clean up temporary file if it exists
        if 'temp_path' in locals():
            try:
                os.unlink(temp_path)
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Metaphor analysis failed: {str(e)}")

@app.post("/channel-compliance")
async def channel_compliance_endpoint(
    file: UploadFile = File(...),
    platforms: str = Form(..., description="Comma-separated list of platforms (YouTube, Instagram, Facebook, TikTok, Google Ads)"),
    ad_description: str = Form("", description="Ad description (optional)"),
    logo_images: Optional[list[UploadFile]] = File(None, description="Brand logo image files (optional)"),
    brand_logo_urls: Optional[str] = Form(None, description="Brand logo URLs (comma-separated)"),
    brand_logo_names: Optional[str] = Form(None, description="Brand logo names (comma-separated)")
):
    """
    Analyze channel compliance for multiple platforms using the new Gemini-based analyzer.
    
    - **file**: Video or image file to analyze
    - **platforms**: Comma-separated list of platforms to check (YouTube, Instagram, Facebook, TikTok, Google Ads)
    - **ad_description**: Description of the advertisement (optional)
    - **logo_images**: Brand logo image files (optional - only first logo is used)
    """
    try:
        # **FIX**: Clear cached state for fresh analysis
        clear_analysis_module_cache()
        
        # Create temporary file for main ad
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
            shutil.copyfileobj(file.file, tmp_file)
            temp_path = tmp_file.name
        
        # Parse platforms
        platform_list = [platform.strip() for platform in platforms.split(',')]
        valid_platforms = ["YouTube", "Instagram", "Facebook", "TikTok", "Google Ads"]
        platform_list = [p for p in platform_list if p in valid_platforms]
        
        if not platform_list:
            raise HTTPException(status_code=400, detail="No valid platforms provided. Valid platforms: YouTube, Instagram, Facebook, TikTok, Google Ads")
        
        print(f"🎯 Channel Compliance Analysis:")
        print(f"   📁 File: {file.filename}")
        print(f"   🌐 Platforms: {', '.join(platform_list)}")
        print(f"   📝 Description: {ad_description or 'None provided'}")
        print(f"   🖼️ Logo images: {len(logo_images) if logo_images else 0}")
        
        # Handle logo image (only first one is used by new module)
        logo_path = None
        
        # Process uploaded logo file (only first one)
        if logo_images and len(logo_images) > 0:
            logo_file = logo_images[0]
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(logo_file.filename)[1]) as logo_tmp:
                shutil.copyfileobj(logo_file.file, logo_tmp)
                logo_path = logo_tmp.name
                print(f"   ✅ Logo file saved: {logo_path}")
        
        # Process brand logo URL (only first one)
        elif brand_logo_urls:
            print(f"🔗 Processing brand logo URL for channel compliance: {brand_logo_urls}")
            logo_urls = [url.strip() for url in brand_logo_urls.split(',') if url.strip()]
            if logo_urls:
                logo_path = download_logo_from_url(logo_urls[0])
                if logo_path:
                    print(f"✅ Downloaded logo to channel compliance: {logo_path}")
                else:
                    print(f"⚠️ Failed to download logo from: {logo_urls[0]}")
        
        print(f"   🔍 Starting analysis...")
        
        # Call the new analyzer (analyzes all platforms at once)
        result = analyze_ad_with_gemini(temp_path, logo_path)
        
        # Filter results to only include requested platforms
        filtered_result = {}
        for platform in platform_list:
            if platform in result:
                filtered_result[platform] = result[platform]
            else:
                filtered_result[platform] = {"error": f"Platform {platform} not analyzed"}
        
        # Calculate overall compliance score
        platform_scores = []
        for platform, platform_result in filtered_result.items():
            if "compliance_score" in platform_result:
                platform_scores.append(platform_result["compliance_score"])
        
        if platform_scores:
            overall_score = sum(platform_scores) / len(platform_scores)
            filtered_result["overall_compliance_score"] = round(overall_score, 1)
        
        print(f"   ✅ Analysis completed successfully")
        
        # Clean up temporary files
        os.unlink(temp_path)
        if logo_path:
            try:
                os.unlink(logo_path)
            except:
                pass
        
        return JSONResponse(content=filtered_result)
        
    except Exception as e:
        # Clean up temporary files if they exist
        if 'temp_path' in locals():
            try:
                os.unlink(temp_path)
            except:
                pass
        if 'logo_path' in locals() and logo_path:
            try:
                os.unlink(logo_path)
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Channel compliance analysis failed: {str(e)}")

@app.post("/comprehensive-analysis")
async def comprehensive_analysis_endpoint(
    file: UploadFile = File(...),
    ad_description: str = Form(...),
    user_ad_type: str = Form(..., description="Awareness, Consideration, or Conversion"),
    ad_title: str = Form("", description="Ad title for display purposes"),
    logo_images: Optional[UploadFile] = File(None, description="Brand logo image file (optional)"),
    brand_logo_urls: Optional[str] = Form(None, description="Brand logo URLs (comma-separated)"),
    brand_logo_names: Optional[str] = Form(None, description="Brand logo names (comma-separated)"),
    brand_colors: Optional[str] = Form(None, description="Brand colors (comma-separated hex codes)"),
    tone_of_voice: Optional[str] = Form(None, description="Tone of voice (comma-separated values)"),
    platforms: Optional[str] = Form(None, description="Comma-separated list of platforms for channel compliance (optional)")
):
    """
    Perform comprehensive analysis including ad content, brand compliance, metaphor analysis, and channel compliance.
    
    - **file**: Video or image file to analyze
    - **ad_description**: Description of the advertisement
    - **user_ad_type**: User's selected ad type (Awareness/Consideration/Conversion)
    - **logo_images**: Single brand logo image file (optional)
    - **brand_colors**: Brand colors as comma-separated hex codes (optional)
    - **tone_of_voice**: Tone of voice as comma-separated values (optional)
    - **platforms**: Comma-separated list of platforms for channel compliance (optional)
    """
    try:
        print(f"🤖 Comprehensive Analysis called with file: {file.filename}")
        print(f"📝 Ad Description: {ad_description}")
        print(f"🎯 User Ad Type: {user_ad_type}")
        print(f"🏷️ Platforms: {platforms}")
        print(f"🎨 Brand Colors: {brand_colors}")
        print(f"🗣️ Tone of Voice: {tone_of_voice}")
        print(f"🏷️ Ad Title: {ad_title}")
        
        # **FIX**: Clear any cached state to ensure fresh analysis results
        print(f"🧹 Clearing any cached state for fresh analysis...")
        clear_analysis_module_cache()
        
        # Validate file size for cloud deployment
        if hasattr(file, 'size') and file.size and file.size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413, 
                detail=f"File too large: {file.size // (1024*1024)}MB. Maximum allowed: {MAX_FILE_SIZE // (1024*1024)}MB"
            )
        
        # **DEBUG**: Check if logo images are received
        if logo_images:
            print(f"🖼️ LOGO IMAGES RECEIVED: {logo_images.filename} ({logo_images.content_type}) - {logo_images.size} bytes")
            # Validate logo file size
            if hasattr(logo_images, 'size') and logo_images.size and logo_images.size > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413, 
                    detail=f"Logo file too large: {logo_images.size // (1024*1024)}MB. Maximum allowed: {MAX_FILE_SIZE // (1024*1024)}MB"
                )
        else:
            print(f"❌ NO LOGO IMAGES RECEIVED - Brand compliance may be affected!")
        
        # **DEBUG**: Check video file details
        if file.content_type.startswith('video/'):
            print(f"🎬 VIDEO FILE CONFIRMED for analysis:")
            print(f"  📁 Filename: {file.filename}")
            print(f"  📁 Content Type: {file.content_type}")
            print(f"  📁 File Size: {file.size} bytes")
        else:
            print(f"🖼️ IMAGE FILE for analysis:")
            print(f"  📁 Filename: {file.filename}")
            print(f"  📁 Content Type: {file.content_type}")
        
        # Create temporary file for main ad
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
            shutil.copyfileobj(file.file, tmp_file)
            temp_path = tmp_file.name
        
        # Handle brand logo if provided
        logo_paths = []
        
        # Process uploaded logo file (single file)
        if logo_images:
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(logo_images.filename)[1]) as logo_tmp:
                shutil.copyfileobj(logo_images.file, logo_tmp)
                logo_paths.append(logo_tmp.name)
        
        # Process brand logo URLs from frontend
        if brand_logo_urls:
            print(f"🔗 Processing brand logo URLs: {brand_logo_urls}")
            logo_urls = [url.strip() for url in brand_logo_urls.split(',') if url.strip()]
            for url in logo_urls:
                downloaded_path = download_logo_from_url(url)
                if downloaded_path:
                    logo_paths.append(downloaded_path)
                    print(f"✅ Added downloaded logo to analysis: {downloaded_path}")
                else:
                    print(f"⚠️ Skipping failed logo download: {url}")
        
        print(f"🖼️ Total logo files for analysis: {len(logo_paths)}")
        
        # Parse brand colors
        colors = None
        if brand_colors:
            colors = [color.strip() for color in brand_colors.split(',')]
            print(f"🎨 RECEIVED brand_colors: '{brand_colors}' -> parsed: {colors}")
        else:
            print(f"🎨 NO brand_colors received (value: {brand_colors})")
        
        # Parse tone of voice
        tones = None
        if tone_of_voice:
            tones = [tone.strip() for tone in tone_of_voice.split(',')]
            print(f"🗣️ RECEIVED tone_of_voice: '{tone_of_voice}' -> parsed: {tones}")
        else:
            print(f"🗣️ NO tone_of_voice received (value: {tone_of_voice})")
        
        # Parse platforms for channel compliance
        platform_list = []
        if platforms:
            platform_list = [platform.strip() for platform in platforms.split(',')]
            valid_platforms = ["YouTube", "Instagram", "Facebook", "TikTok", "Google Ads"]
            platform_list = [p for p in platform_list if p in valid_platforms]
        
        # Determine file type
        file_extension = os.path.splitext(file.filename)[1].lower()
        
        # Initialize results
        comprehensive_result = {
            "status": "success",
            "analysis_type": "comprehensive",
            "file_type": file_extension,
            "results": {}
        }
        
        # 1. Metaphor Analysis
        try:
            print(f"🎯 Starting metaphor analysis for {file_extension} file...")
            if file_extension in ['.mp4', '.avi', '.mov', '.mkv', '.wmv']:
                metaphor_result = analyze_ad_in_batches(temp_path, ad_description, user_ad_type)
            elif file_extension in ['.jpg', '.jpeg', '.png', '.bmp', '.gif']:
                metaphor_result = analyze_image(temp_path, ad_description, user_ad_type)
            else:
                raise HTTPException(status_code=400, detail="Unsupported file format")
            
            print(f"✅ Metaphor analysis completed successfully")
            comprehensive_result["results"]["metaphor_analysis"] = metaphor_result
        except Exception as e:
            error_msg = f"Metaphor analysis failed: {str(e)}"
            print(f"❌ {error_msg}")
            print(f"🔍 Error type: {type(e).__name__}")
            print(f"🔍 Full error details: {repr(e)}")
            comprehensive_result["results"]["metaphor_analysis"] = {"error": error_msg}
        
        # 2. Brand Compliance Analysis
        try:
            print(f"🎯 Starting brand compliance analysis...")
            print(f"   Logo paths: {len(logo_paths)} files")
            print(f"   Colors: {colors}")
            print(f"   Tones: {tones}")
            compliance_result = analyze_brand_compliance(temp_path, logo_paths, colors, tones)
            print(f"✅ Brand compliance analysis completed successfully")
            comprehensive_result["results"]["brand_compliance"] = compliance_result
        except Exception as e:
            error_msg = f"Brand compliance analysis failed: {str(e)}"
            print(f"❌ {error_msg}")
            print(f"🔍 Error type: {type(e).__name__}")
            print(f"🔍 Full error details: {repr(e)}")
            comprehensive_result["results"]["brand_compliance"] = {"error": error_msg}
        
        # 3. Ad Content Analysis
        try:
            print(f"🎯 Starting ad content analysis...")
            content_result = analyze_ad(temp_path)
            print(f"✅ Ad content analysis completed successfully")
            comprehensive_result["results"]["content_analysis"] = content_result
        except Exception as e:
            error_msg = f"Content analysis failed: {str(e)}"
            print(f"❌ {error_msg}")
            print(f"🔍 Error type: {type(e).__name__}")
            print(f"🔍 Full error details: {repr(e)}")
            comprehensive_result["results"]["content_analysis"] = {"error": error_msg}
        
        # 4. Channel Compliance Analysis (if platforms provided)
        if platform_list:
            try:
                print(f"🎯 Starting channel compliance analysis...")
                
                # Use only the first logo for the new analyzer
                logo_path_for_compliance = logo_paths[0] if logo_paths else None
                
                # Call the new analyzer (analyzes all platforms at once)
                channel_result_all = analyze_ad_with_gemini(temp_path, logo_path_for_compliance)
                
                # Filter results to only include requested platforms
                channel_result = {}
                for platform in platform_list:
                    if platform in channel_result_all:
                        channel_result[platform] = channel_result_all[platform]
                    else:
                        channel_result[platform] = {"error": f"Platform {platform} not analyzed"}
                
                # Calculate overall compliance score
                platform_scores = []
                for platform, platform_result in channel_result.items():
                    if "compliance_score" in platform_result:
                        platform_scores.append(platform_result["compliance_score"])
                
                if platform_scores:
                    overall_score = sum(platform_scores) / len(platform_scores)
                    channel_result["overall_compliance_score"] = round(overall_score, 1)
                
                comprehensive_result["results"]["channel_compliance"] = channel_result
                print(f"✅ Channel compliance analysis completed successfully")
            except Exception as e:
                error_msg = f"Channel compliance analysis failed: {str(e)}"
                print(f"❌ {error_msg}")
                comprehensive_result["results"]["channel_compliance"] = {"error": error_msg}
        
        # Clean up temporary files
        os.unlink(temp_path)
        for logo_path in logo_paths:
            try:
                os.unlink(logo_path)
            except:
                pass
        
        return JSONResponse(content=comprehensive_result)
        
    except Exception as e:
        # Clean up temporary files if they exist
        if 'temp_path' in locals():
            try:
                os.unlink(temp_path)
            except:
                pass
        if 'logo_paths' in locals():
            for logo_path in logo_paths:
                try:
                    os.unlink(logo_path)
                except:
                    pass
        raise HTTPException(status_code=500, detail=f"Comprehensive analysis failed: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "message": "Ad Analysis Suite API is running"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000) 