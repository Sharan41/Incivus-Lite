# -*- coding: utf-8 -*-
from fastapi import FastAPI, Form, File, Request, UploadFile, HTTPException, Query
from fastapi.responses import Response, HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import uuid
from config import db, bucket, API_URL
from datetime import datetime, timedelta
import asyncio

import requests
import json
import re
import base64
import os
import io
from io import BytesIO
import urllib.parse
app = FastAPI(
title="Incivus Middleware API",
description="Middleware layer for Incivus analysis platform",
version="1.0.0"
)

# Cloud deployment configurations
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
MAX_REQUEST_SIZE = 100 * 1024 * 1024  # 100MB

# Add trusted host middleware for cloud security
# ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
# app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)

# # CORS middleware with cloud-compatible settings (configured at startup)
# FRONTEND_URLS = os.getenv('FRONTEND_URLS', 'http://localhost:3000').split(',')
# ALLOWED_ORIGINS = [u.strip() for u in FRONTEND_URLS if u.strip()]
# if '*' in ALLOWED_ORIGINS:
    # app.add_middleware(
        # CORSMiddleware,
        # allow_origins=['*'],
        # allow_credentials=False,
        # allow_methods=['*'],
        # allow_headers=['*'],
    # )
# else:
    # app.add_middleware(
        # CORSMiddleware,
        # allow_origins=ALLOWED_ORIGINS,
        # allow_credentials=True,
        # allow_methods=['*'],
        # allow_headers=['*'],
    # )
    
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # use ["*"] to allow all origins (not recommended in prod)
    allow_credentials=True,
    allow_methods=["*"],  # or specify ["GET", "POST", ...]
    allow_headers=["*"],
)


# Note: Timeout middleware removed to allow long video analysis processing

# Add file size validation middleware


@app.middleware("http")
async def file_size_middleware(request: Request, call_next):
    if request.method == "POST":
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_REQUEST_SIZE:
            return JSONResponse(
                {"error": f"Request too large. Maximum size: {MAX_REQUEST_SIZE // (1024 * 1024)}MB"},
                status_code=413
            )
    return await call_next(request)

# CORS middleware with cloud-compatible settings


def generate_secure_signed_url(blob, content_type=None, expiration_days=7):
    """
    Generate a secure signed URL with proper error handling for malformed signatures
    **FIXED**: Prevents double-encoding of already encoded paths
    """
    try:
        blob_name = blob.name

        # **FIX**: Check if path is already URL-encoded to prevent double-encoding
        if blob_name and '%' in blob_name:
            # Path is already encoded (e.g., "SAI%20SHARAN"), use it as-is
            print(f"[FIX] Path already encoded, using as-is: {blob_name}")
            # Don't re-encode, use the blob directly
            final_blob = blob
        elif blob_name:
            # Path needs encoding (e.g., "SAI SHARAN"), encode it
            print(f"[FIX] Encoding path: {blob_name}")
            encoded_name = urllib.parse.quote(blob_name, safe='/')
            final_blob = bucket.blob(encoded_name)
        else:
            final_blob = blob

        # Generate signed URL with v4 signature
        # **FIX**: Use content_type=None like brand logos to avoid auth issues
        url = final_blob.generate_signed_url(
        version="v4",
        expiration=timedelta(days=expiration_days),
        method="GET",
        content_type=None  # **CRITICAL**: Set to None like working brand logos
        )

        # Validate the URL format
        if not url or not url.startswith('https://'):
            raise Exception("Invalid signed URL generated")

        return url

    except Exception as e:
        print(f"❌ Error generating signed URL for {blob.name}: {str(e)}")
        # Fallback: try with original blob without content_type
    try:
            url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(days=expiration_days),
        method="GET",
        content_type=None  # **FIX**: Ensure None for consistency
            )
            return url
    except Exception as fallback_error:
            print(
                f"❌ Fallback URL generation also failed: {str(fallback_error)}")
            raise Exception(f"Failed to generate signed URL: {str(e)}")


class UserProfile(BaseModel):
    userId: str
    timestamp: str
    userProfile: dict
    metadata: dict



# REMOVED: /save-user-profile - DEPRECATED (UI now uses /UserProfileDetails instead)

@app.get("/get-user-profile/{user_id}")
async def get_user_profile(user_id: str):
    try:
        # **NEW APPROACH**: Use PlanSelectionDetails as single source of truth
        # This eliminates sync issues between collections

        # Get plan data (primary source of truth)
        plan_ref = db.collection("PlanSelectionDetails").document(user_id)
        plan_doc = plan_ref.get()

        # Get profile data (for non-subscription info)
        profile_ref = db.collection("userProfileDetails").document(user_id)
        profile_doc = profile_ref.get()

        print('getuser')

        if not plan_doc.exists and not profile_doc.exists:
            raise HTTPException(
                status_code=404, detail="User profile not found")

        # Start with profile data if it exists
        if profile_doc.exists:
            profile_data = profile_doc.to_dict()
        else:
            profile_data = {}

        # **CRITICAL**: Override subscription data with PlanSelectionDetails (single source of truth)
        if plan_doc.exists:
            plan_data = plan_doc.to_dict()

            # Check if monthly reset is needed
            current_date = datetime.utcnow()
            ads_used = plan_data.get("adsUsed", 0)
            last_usage_date = plan_data.get("lastUsageDate")

            if last_usage_date:
                try:
                    last_usage = datetime.fromisoformat(
                        last_usage_date.replace("Z", ""))
                    # Reset if it's a new month
                    if (current_date.year !=
                        last_usage.year or current_date.month != last_usage.month):
                        print(
                            f"🔄 Monthly reset applied in get-user-profile: {last_usage.month}/{last_usage.year} -> {current_date.month}/{current_date.year}")
                        ads_used = 0
                except Exception as e:
                    print(
                        f"⚠️ Could not parse last usage date in get-user-profile: {e}")
                    ads_used = 0

            # Build subscription data from PlanSelectionDetails (single source
            # of truth)
            subscription_data = {
            "planType": plan_data.get("planName", "").replace("Incivus_", "").lower(),
            "planName": plan_data.get("planName", "Unknown"),
            # Use calculated ads_used (with monthly reset)
            "adsUsed": ads_used,
            "adQuota": plan_data.get("totalAds", 0),
            "max_ads_per_month": plan_data.get("max_ads_per_month", 0),
            "subscriptionStartDate": plan_data.get("subscriptionStartDate", ""),
            "subscriptionEndDate": plan_data.get("subscriptionEndDate", ""),
            "isActive": plan_data.get("isActive", False),
            "paymentStatus": plan_data.get("paymentStatus", ""),
            "selectedFeatures": plan_data.get("selectedFeatures", []),
            "totalPrice": plan_data.get("totalPrice", 0),
            "validityDays": plan_data.get("validityDays", 0),
            "lastUsageDate": plan_data.get("lastUsageDate", ""),
            "updatedAt": plan_data.get("updatedAt", ""),
            "status": "active" if plan_data.get("isActive", False) else "inactive"
            }

            # Override profile subscription data with plan data (single source
            # of truth)
            profile_data["subscription"] = subscription_data

            print(
                f"✅ Using PlanSelectionDetails as single source of truth: adsUsed={ads_used}, max_monthly={subscription_data['max_ads_per_month']}")

        return profile_data

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Error in get-user-profile for user {user_id}: {str(e)}")
        print(f"[DEBUG] Error type: {type(e).__name__}")
        import traceback
        print(f"[DEBUG] Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error fetching user profile: {str(e)}")


@app.post("/UserProfileDetails")
async def post_user_profile(profile: UserProfile):
    try:
       # user_id = str(uuid.uuid4())
        data = profile.dict()
        user_id = data["userId"]
        print('postuser')
        db.collection("userProfileDetails").document(user_id).set(data)
        return {
    "message": "User profile saved successfully",
     "user_id": user_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/updateUserProfileDetails/{user_id}")
async def update_user_profile_details(user_id: str, request: Request):
    """Merge arbitrary updates into userProfileDetails. Accepts JSON { updates: {...}, timestamp?: str }"""
    try:
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")

        updates = payload.get("updates", {})
        if not isinstance(updates, dict):
            raise HTTPException(status_code=400, detail="'updates' must be an object")

        # Always bump updatedAt
        updates.setdefault("updatedAt", datetime.utcnow().isoformat())

        profile_ref = db.collection("userProfileDetails").document(user_id)
        profile_ref.set(updates, merge=True)
        return {"message": "User profile updated", "user_id": user_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/branddata-form")
async def receive_brand_form(
    request: Request,
    userId: str = Form(...),
    timestamp: str = Form(None),
    brandName: str = Form(...),
    tagline: str = Form(""),
    brandDescription: str = Form(""),
    primaryColor: str = Form(""),
    secondaryColor: str = Form(""),
    accentColor: str = Form(""),
    colorPalette: str = Form(""),
    toneOfVoice: str = Form(""),
    isComplete: bool = Form(False),
    completionPercentage: int = Form(0),
    lastUpdated: str = Form(None),
    dataVersion: float = Form(1.0),
    source: str = Form("frontend"),
    apiEndpoint: str = Form("branddata-form"),
    submissionSource: str = Form("web"),
    systemMetadata: str = Form("{}"),
    logoCount: int = Form(0),
    logoFiles: Optional[list[UploadFile]] = File(None)
    ):
    """
    Receive brand setup form data from Enhanced Brand Setup.

    Required fields:
        - userId: User identifier
        - brandName: Brand name

        Optional fields (matching Enhanced Brand Setup form):
            - timestamp, tagline, brandDescription
            - primaryColor, secondaryColor, accentColor, colorPalette
            - toneOfVoice, isComplete, completionPercentage
            - lastUpdated, dataVersion, source, apiEndpoint, submissionSource
            - systemMetadata, logoCount, logoFiles (logo_0, logo_1, etc.)
            """
    print("🔍 ===== BRANDDATA-FORM ENDPOINT CALLED =====")
    print(f"🔍 Request method: {request.method}")
    print(f"🔍 Request headers: {dict(request.headers)}")
    print(f"🔍 Content-Type: {request.headers.get('content-type', 'Not provided')}")

    try:
        print(f"🔍 Received parameters:")
        print(f"   userId: {userId}")
        print(f"   brandName: {brandName}")
        print(f"   timestamp: {timestamp}")
        print(f"   tagline: {tagline}")
        print(f"   brandDescription: {brandDescription}")
        print(f"   primaryColor: {primaryColor}")
        print(f"   secondaryColor: {secondaryColor}")
        print(f"   accentColor: {accentColor}")
        print(f"   colorPalette: {colorPalette}")
        print(f"   toneOfVoice: {toneOfVoice}")
        print(f"   logoCount: {logoCount}")
        print(f"   logoFiles: {logoFiles}")

        brand_id = str(uuid.uuid4())
        print(f"🔍 Generated brand_id: {brand_id}")

        # Handle optional timestamp fields
        current_timestamp = datetime.utcnow().isoformat() + "Z"
        if not timestamp:
            timestamp = current_timestamp
        if not lastUpdated:
            lastUpdated = current_timestamp

        # Allowed file types
        ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
        ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm']
        MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB limit

        media_info_list = []

        # Sanitize brand name for file path (remove special characters)
        sanitized_brand_name = "".join(c for c in brandName if c.isalnum() or c in (' ', '-', '_')).rstrip()
        sanitized_brand_name = sanitized_brand_name.replace(' ', '_')

        print(f"📁 Brand name: {brandName}")
        print(f"📁 Sanitized brand name: {sanitized_brand_name}")

        # Process logo files - handle both array format and individual logo_0, logo_1 format
        logo_files_to_process = []
        processed_filenames = set()  # Track processed files to avoid duplicates

        # Check for logoFiles array format
        if logoFiles:
            for logo_file in logoFiles:
                if logo_file.filename not in processed_filenames:
                    logo_files_to_process.append(logo_file)
                    processed_filenames.add(logo_file.filename)
                    print(f"🔍 Added from logoFiles array: {logo_file.filename}")

        # Check for individual logo_0, logo_1, etc. format from Enhanced Brand Setup
        try:
            print("🔍 Processing form data for individual logo files...")
            form_data = await request.form()
            print(f"🔍 Form data keys: {list(form_data.keys())}")
            for key, value in form_data.items():
                if key.startswith('logo_') and hasattr(value, 'filename'):
                    # Only add if we haven't already processed this filename
                    if value.filename not in processed_filenames:
                        print(f"🔍 Found new logo file: {key} = {value.filename}")
                        logo_files_to_process.append(value)
                        processed_filenames.add(value.filename)
                    else:
                        print(f"🔍 Skipping duplicate logo file: {key} = {value.filename}")
        except Exception as e:
            print(f"❌ Error processing form data: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Error processing form data: {str(e)}")

        # Process all collected logo files
        for i, logo_file in enumerate(logo_files_to_process):
            if logo_file.content_type not in ALLOWED_IMAGE_TYPES:
                raise HTTPException(status_code=400, detail=f"Invalid file type for logo: {logo_file.content_type}")
            if getattr(logo_file, "size", None) and logo_file.size > MAX_FILE_SIZE:
                raise HTTPException(status_code=400, detail=f"File too large: {logo_file.filename}")
            
            file_ext = os.path.splitext(logo_file.filename)[1]
            media_id = str(uuid.uuid4())
            storage_filename = f"{userId}/{sanitized_brand_name}/{brand_id}/logo/{media_id}{file_ext}"
            print(f"📁 Uploading logo: {storage_filename}")
            
            blob = bucket.blob(storage_filename)
            # Reset file pointer to beginning before upload
            logo_file.file.seek(0)
            blob.upload_from_file(logo_file.file, content_type=logo_file.content_type)
            
            media_url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(days=7),
            method="GET",
            content_type=None
            )
            
            metadata = ""  # No metadata needed for Enhanced Brand Setup
            media_info_list.append({
            "fileId": media_id,
            "filename": logo_file.filename,
            "contentType": logo_file.content_type,
            "fileSize": getattr(logo_file, "size", None),
            "url": media_url,
            "storagePath": storage_filename,
            "mediaType": "logo",
            "metadata": metadata,
            "uploadTimestamp": datetime.utcnow().isoformat()
            })

            print(f"🔍 Total unique logo files to process: {len(logo_files_to_process)}")


            data = {
            "userId": userId,
            "timestamp": timestamp,
            "brandName": brandName,
            "tagline": tagline,
            "brandDescription": brandDescription,
            "primaryColor": primaryColor,
            "secondaryColor": secondaryColor,
            "accentColor": accentColor,
            "colorPalette": colorPalette,
            "toneOfVoice": toneOfVoice,
            "isComplete": isComplete,
            "completionPercentage": completionPercentage,
            "lastUpdated": lastUpdated,
            "dataVersion": dataVersion,
            "source": source,
            "apiEndpoint": apiEndpoint,
            "submissionSource": submissionSource,
            "systemMetadata": systemMetadata,
            "mediaFiles": media_info_list,
            "mediaCount": len(media_info_list),
            "brandId": brand_id
            }

        # Store in Firestore
            db.collection("brandData").document(brand_id).set(data)

            return {
            "message": "Brand data saved successfully", 
            "brand_id": brand_id,
            "logo_count": len(media_info_list),
            "logo_files": media_info_list
            }

    except Exception as e:
        print("Error saving brand data:", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/save-plan-selection")
async def save_plan_selection(
    userId: str = Form(...),
    planId: str = Form(...),
    planName: str = Form(...),
    paymentId: str = Form(...),
    paymentStatus: str = Form(...),
    subscriptionType: str = Form(...),
    subscriptionStartDate: str = Form(...),
    subscriptionEndDate: str = Form(...),
    totalPrice: float = Form(...),
    basePrice: float = Form(...),
    additionalAdPrice: float = Form(...),  # Fixed: was additionalAdPrice4
    totalAds: int = Form(...),
    validityDays: int = Form(...),
    isActive: bool = Form(...),
    selectedFeatures: list[str] = Form(...),
    createdAt: str = Form(...),
    updatedAt: str = Form(...),
    max_ads_per_month: int = Form(...)
            
    ):
    try:
        doc_id = userId
        
        # selectedFeatures may arrive as an array, or as a single comma-separated string inside an array
        features_list = selectedFeatures or []
        if len(features_list) == 1 and "," in features_list[0]:
            features_list = [item.strip().strip('"\'') for item in features_list[0].split(',') if item.strip()]
        
        # **FIX**: If no features provided, use default features from PLAN_CONFIG
        if not features_list or len(features_list) == 0:
            plan_config = PLAN_CONFIG.get(planName)
            if plan_config and plan_config.get("selectedFeatures"):
                features_list = plan_config["selectedFeatures"]
                print(f"🔧 No features provided, using default features for {planName}: {features_list}")
            else:
                print(f"⚠️ No default features found for plan {planName}, using empty list")
        
        print(f"🔍 Final selectedFeatures for new plan: {features_list}")
        
        # Note: selectedFeaturesIndexed removed - no longer needed after refactoring
        
        plan_data = {
            "userId": userId,
            "planId": planId,
            "planName": planName,
            "paymentId": paymentId,
            "paymentStatus": paymentStatus,
            "subscriptionType": subscriptionType,
            "subscriptionStartDate": subscriptionStartDate,
            "subscriptionEndDate": subscriptionEndDate,
            "totalPrice": totalPrice,
            "basePrice": basePrice,
            "additionalAdPrice": additionalAdPrice,  # Fixed: was additionalAdPrice4
            "totalAds": totalAds,
            "validityDays": validityDays,
            "isActive": isActive,
            "selectedFeatures": features_list,
            "createdAt": createdAt,
            "updatedAt": updatedAt,
            "max_ads_per_month": max_ads_per_month,
            "adsUsed": 0
            }
        
        db.collection("PlanSelectionDetails").document(doc_id).set(plan_data)
        
        print(f"✅ Plan saved to single source of truth (PlanSelectionDetails): {planName}")
        print(f"🔍 PLAN SAVE DEBUG: Received selectedFeatures: '{selectedFeatures}'")
        print(f"🔍 PLAN SAVE DEBUG: Parsed features_list: {features_list}")
        print(f"🔍 PLAN SAVE DEBUG: Final selectedFeatures saved: {plan_data['selectedFeatures']}")

        # NOTE: No longer syncing to userProfileDetails - using PlanSelectionDetails as single source of truth
        # The get-user-profile endpoint now reads directly from PlanSelectionDetails
        
        return {
            "message": "Plan selection saved successfully", 
            "doc_id": doc_id,
            "debug_info": {
                "received_features": str(selectedFeatures),
                "parsed_features": features_list,
                "saved_features": plan_data['selectedFeatures']
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



   
@app.post("/postAnalysisDetailsFormData")
async def post_analysis_details_form_data(
    userId: str = Form(...),
    brandId: str = Form(...),
    timestamp: str = Form(...),
    messageIntent: str = Form(...),
    funnelStage: str = Form(...),
    channels: str = Form(...),   # channel compliance
    source: str = Form(...),
    clientId: str = Form(...),
    artifacts: str = Form(...),
    adTitle: str = Form(""),     # Ad title for display in Libraries
    selectedFeatures: str = Form("[]"),  # Selected features for Lite users
    mediaFile: UploadFile = File(...)
    ):
    """
    Main endpoint for AI analysis of media files.
    
    This endpoint:
        1. Validates user plan and monthly limits
        2. Accepts media files (images/videos) and optional logo files
        3. Uploads files to Google Cloud Storage
        4. Calls multiple AI models for analysis
        5. Stores results in user_analysis collection
        6. Updates plan usage statistics
        7. Returns comprehensive analysis results
    
        Parameters:
            - userId: User identifier
            - brandId: Brand identifier (required)
            - mediaFile: Main media file to analyze (required)
            - Other parameters for context and analysis configuration
    
            Returns:
    - JSON response with analysis results from all AI models
    - Success/failure statistics
    - Media and brand information
    """
    try:
        # Debug: Log received parameters
        print(f"🔍 DEBUG: Received adTitle: '{adTitle}'")
        print(f"🔍 DEBUG: Received messageIntent: '{messageIntent}'")
        print(f"🔍 DEBUG: Received funnelStage: '{funnelStage}'")
        print(f"🔍 DEBUG: Received selectedFeatures: '{selectedFeatures}'")
        
        # Parse selectedFeatures
        user_selected_features = []
        try:
            if selectedFeatures and selectedFeatures.strip():
                user_selected_features = json.loads(selectedFeatures)
                print(f"✅ Parsed selectedFeatures: {user_selected_features}")
            else:
                print(f"⚠️ No selectedFeatures provided, using all features")
        except json.JSONDecodeError as e:
            print(f"❌ Error parsing selectedFeatures: {e}, using all features")
            user_selected_features = []
        
        artifact_id = str(uuid.uuid4())
        
        # Input validation
        if not mediaFile or mediaFile.filename == "":
            raise HTTPException(status_code=400, detail="Media file is required")
        
        if not userId or userId.strip() == "":
            raise HTTPException(status_code=400, detail="User ID is required")
        
        # BrandId is REQUIRED for brand compliance analysis
        if not brandId or brandId.strip() == "" or brandId == "default":
            raise HTTPException(
                status_code=400, 
                detail="Brand ID is required for analysis. Brand compliance analysis requires actual brand data (logo, colors, tone of voice) to compare against."
            )
        

        
        # ===== PLAN VALIDATION AND MONTHLY RESET LOGIC =====
        try:
            # Get user's plan details
            plan_doc = db.collection("PlanSelectionDetails").document(userId).get()
            if not plan_doc.exists:
                raise HTTPException(status_code=404, detail="User plan not found. Please select a plan first.")

            plan_data = plan_doc.to_dict()
            if not isinstance(plan_data, dict):
                raise HTTPException(
                    status_code=500, 
                    detail=f"Invalid plan data format for user {userId}. Expected dict, got {type(plan_data).__name__}"
                )
            
            # Validate and convert plan data to integers
            try:
                max_ads_per_month = int(plan_data.get("max_ads_per_month", 0))
                ads_used = int(plan_data.get("adsUsed", 0))
                total_ads = int(plan_data.get("totalAds", 0))
            except (ValueError, TypeError) as e:
                error_msg = str(e) if str(e) else "Invalid type"
                print(f"⚠️ Invalid plan data types for user {userId}: {error_msg}")
                print(f"   max_ads_per_month: {plan_data.get('max_ads_per_month', 'MISSING')} (type: {type(plan_data.get('max_ads_per_month', None)).__name__})")
                print(f"   adsUsed: {plan_data.get('adsUsed', 'MISSING')} (type: {type(plan_data.get('adsUsed', None)).__name__})")
                print(f"   totalAds: {plan_data.get('totalAds', 'MISSING')} (type: {type(plan_data.get('totalAds', None)).__name__})")
                raise HTTPException(
                    status_code=500,
                    detail=f"Invalid plan data format for user {userId}: {error_msg}. Please contact support."
                )
            last_usage_date = plan_data.get("lastUsageDate")

            # Check if we need to reset monthly usage (new month)
            current_date = datetime.utcnow()
            print(f"🔍 Monthly usage check - Current date: {current_date}, Last usage: {last_usage_date}")

            if last_usage_date:
                try:
                    last_usage = datetime.fromisoformat(last_usage_date.replace("Z", ""))
                    print(f"🔍 Parsed dates - Current: {current_date.year}-{current_date.month:02d}, Last: {last_usage.year}-{last_usage.month:02d}")

                    # Reset if it's a new month
                    if (current_date.year != last_usage.year or current_date.month != last_usage.month):
                        print(f"🔄 Monthly reset triggered: {last_usage.month}/{last_usage.year} -> {current_date.month}/{current_date.year}")
                        print(f"🔍 BEFORE reset - ads_used: {ads_used}")
                        ads_used = 0
                        print(f"🔍 AFTER reset - ads_used: {ads_used}")
                    else:
                        print(f"✅ Same month - preserving ads_used: {ads_used}")
                except Exception as e:
                    print(f"⚠️ Warning: Could not parse last usage date: {e}")
                    print(f"🔍 Defaulting ads_used to 0 due to parse error")
                    ads_used = 0
            else:
                print(f"🔍 No last usage date - keeping ads_used: {ads_used}")

            # Check monthly limit
            if ads_used >= max_ads_per_month:
                raise HTTPException(
                    status_code=429,
                    detail=f"Maximum monthly limit reached ({max_ads_per_month} ads). Please wait until next month or upgrade your plan."
                )

            # Check total ads remaining
            if total_ads <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="No ads remaining in your plan. Please purchase more ads or upgrade your plan."
                )

            print(f"✅ Plan validation passed: {ads_used}/{max_ads_per_month} monthly, {total_ads} total remaining")

        except HTTPException:
            raise
        except Exception as e:
            print(f"Error during plan validation: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error validating user plan: {str(e)}")
        
        # Debug: Print received values
        print(f"🔍 DEBUG: Received channels: '{channels}'")
        print(f"🔍 DEBUG: Received artifacts: '{artifacts}'")
        print(f"🔍 DEBUG: Media file: {mediaFile.filename} ({mediaFile.content_type})")
        print(f"🔍 DEBUG: Logo will be fetched from brand data")
        
        # Safely parse channels JSON with multiple format support
        channels_list = []
        try:
            if channels and channels.strip():
                # Try to parse as JSON first
                try:
                    channels_list = json.loads(channels)
                except json.JSONDecodeError:
                    # If JSON fails, try comma-separated string
                    if "," in channels:
                        channels_list = [channel.strip() for channel in channels.split(",") if channel.strip()]
                    else:
                        # Single value
                        channels_list = [channels.strip()] if channels.strip() else []

                # Ensure it's a list
                if not isinstance(channels_list, list):
                    channels_list = [channels_list] if channels_list else []
                
                # Ensure all items are strings
                channels_list = [str(c).strip() for c in channels_list if c]

                print(f"✅ DEBUG: Parsed channels_list: {channels_list}")
            else:
                print(f"⚠️ Channels is empty or None")
                channels_list = []
        except Exception as e:
            print(f"Warning: Error parsing channels '{channels}': {e}")
            channels_list = []
        
        # Safely parse artifacts JSON with multiple format support
        artifacts_data = {}
        try:
            if artifacts and artifacts.strip():
                # Try to parse as JSON first
                try:
                    artifacts_data = json.loads(artifacts)
                except json.JSONDecodeError:
                    # If JSON fails, try to create a simple object
                    print(f"Warning: Invalid artifacts JSON: {artifacts}, using empty object")
                    artifacts_data = {}

                # Ensure it's a dict
                if not isinstance(artifacts_data, dict):
                    artifacts_data = {}

                print(f"✅ DEBUG: Parsed artifacts_data: {artifacts_data}")
            else:
                print(f"⚠️ Artifacts is empty or None")
                artifacts_data = {}
        except Exception as e:
            print(f"Warning: Error parsing artifacts '{artifacts}': {e}")
            artifacts_data = {}
        
        # **DEBUG**: Log the original messageIntent value before any processing
        print(f"🔍 ORIGINAL messageIntent received: '{messageIntent}' (type: {type(messageIntent)}, length: {len(messageIntent) if messageIntent else 'None'})")
        
        # Validate and provide defaults for required fields
        if not messageIntent or messageIntent.strip() == "":
            original_messageIntent = messageIntent
            messageIntent = "string"
            print(f"⚠️ messageIntent was empty/invalid (original: '{original_messageIntent}'), using default: {messageIntent}")
        else:
            print(f"✅ messageIntent is valid: '{messageIntent}'")
        
        if not funnelStage or funnelStage.strip() == "":
            funnelStage = "string"
            print(f"⚠️ funnelStage was empty, using default: {funnelStage}")
        
        # Get brand data using specific brandId from brandData collection
        # BrandId is already validated as required above
        brand_name = "Unknown Brand"
        brand_logo = "default_logo.png"
        tone_of_voice = "Professional and friendly"
        brand_colours = "#FF0000,#00FF00,#0000FF"
        logo_data = None
        brand_data = None  # Initialize brand_data
        
        try:
            # Get specific brand document by brandId (required for analysis)
                brand_doc = db.collection("brandData").document(brandId).get()
                
                if brand_doc.exists:
                    brand_data = brand_doc.to_dict()
                    
                    # Verify the brand belongs to the user
                    if brand_data.get("userId") != userId:
                        raise HTTPException(
                            status_code=403, 
                            detail=f"Brand ID {brandId} does not belong to user {userId}"
                        )
                    
                    brand_name = brand_data.get("brandName", "Unknown Brand")
                    brand_logo = brand_data.get("brandLogo", "default_logo.png")
                    tone_of_voice = brand_data.get("toneOfVoice", "Professional and friendly")
                    brand_colours = brand_data.get("colorPalette", "#FF0000,#00FF00,#0000FF")
                    
                    print(f"🎨 Brand colors retrieved: {brand_colours}")
                    print(f"🗣️ Tone of voice retrieved: {tone_of_voice}")
                    
                    # Extract logo information from mediaFiles array
                media_files = brand_data.get("mediaFiles", []) if isinstance(brand_data, dict) else []
                if not isinstance(media_files, list):
                    media_files = []
                
                for media_file in media_files:
                    if isinstance(media_file, dict) and media_file.get("mediaType") == "logo":
                            logo_data = {
                                "logoUrl": media_file.get("url"),
                                "logoType": media_file.get("contentType"),
                                "logoStoragePath": media_file.get("storagePath"),
                                "logoCategory": media_file.get("mediaType"),
                                "logoFilename": media_file.get("filename"),
                                "logoFileSize": media_file.get("fileSize"),
                                "logo_artifact_id": media_file.get("fileId")
                            }
                            print(f"✅ Found logo in brand data: {logo_data['logoFilename']}")
                            break
                    
                    print(f"✅ Found brand data: {brand_name}, ID: {brandId}")
                else:
                    # Brand ID provided but not found - this is an error
                    raise HTTPException(
                        status_code=404, 
                    detail=f"Brand with ID {brandId} not found. Please create a brand first before running analysis."
                    )
        except HTTPException:
            raise
        except Exception as e:
            print(f"⚠️ Error getting brand data: {str(e)}")
            raise HTTPException(
                status_code=500, 
                detail=f"Error fetching brand data: {str(e)}"
            )
        
        # Define allowed file types (same as in other endpoints)
        ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
        ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm']
        
        # Validate media file type
        if mediaFile.content_type not in ALLOWED_IMAGE_TYPES + ALLOWED_VIDEO_TYPES:
            raise HTTPException(
        status_code=400,
        detail=f"Invalid media file type: {mediaFile.content_type}. Allowed types: {', '.join(ALLOWED_IMAGE_TYPES + ALLOWED_VIDEO_TYPES)}"
            )
        
        # Determine media type based on content type using predefined lists
        media_type = "image"  # default
        content_type = mediaFile.content_type or ""
        
        if content_type in ALLOWED_VIDEO_TYPES:
            media_type = "video"
        elif mediaFile.filename and ("logo" in mediaFile.filename.lower() or "logo" in content_type.lower()):
            media_type = "logo"
        elif content_type in ALLOWED_IMAGE_TYPES:
            media_type = "image"
        
        # Create storage path with structure: user_id - brand_name - brandId - media_type
        file_ext = os.path.splitext(mediaFile.filename or "file")[1] if mediaFile.filename else ""
        # URL-encode brand_name to handle spaces properly
        import urllib.parse
        encoded_brand_name = urllib.parse.quote(brand_name, safe="")
        # BrandId is guaranteed to be valid at this point (required validation above)
        storage_path = f"{userId}/{encoded_brand_name}/{brandId}/{media_type}/{artifact_id}{file_ext}"
        storage_filename = storage_path
        
        print(f"📁 Storage path: {storage_path}")
        print(f"📁 Media type: {media_type}")
        print(f"📁 Content type: {content_type}")
        
        # Upload to GCS with the new path structure
        try:
            if not bucket:
                raise HTTPException(status_code=500, detail="Cloud storage bucket not initialized. Please check server configuration.")
            
            blob = bucket.blob(storage_filename)
            if not blob:
                raise HTTPException(status_code=500, detail=f"Failed to create storage blob for path: {storage_filename}")
            
            # Ensure file pointer is at start
            if hasattr(mediaFile.file, 'seek'):
                mediaFile.file.seek(0)
            
            blob.upload_from_file(mediaFile.file, content_type=mediaFile.content_type or "application/octet-stream")
            media_url = generate_secure_signed_url(blob)
        except HTTPException:
            raise
        except Exception as e:
            error_type = type(e).__name__
            error_msg = str(e) if str(e) else "Unknown error"
            print(f"❌ Error uploading to cloud storage:")
            print(f"   Error Type: {error_type}")
            print(f"   Error Message: {error_msg}")
            print(f"   Storage Path: {storage_filename}")
            print(f"   Media File: {mediaFile.filename if mediaFile else 'Unknown'}")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to upload file to storage: {error_type} - {error_msg}"
            )
        
        # **STORE UPLOADED MEDIA URL FOR ANALYSIS REPORT PREVIEW**
        # We'll save this URL to be included in the analysis record for Libraries preview
        uploaded_media_url = media_url
        uploaded_media_filename = mediaFile.filename
        uploaded_media_type = media_type
        print(f"✅ Prepared uploaded media for analysis preview: {mediaFile.filename}")
        print(f"📸 Media URL will be attached to analysis record for preview")
        
        # Logo data is fetched from brandData collection above
        # No need to process uploaded logo file since we get it from brand data
 

 
        # Use only comprehensive-analysis for AI results
        selected_features = ["comprehensive-analysis"]
        print("Using comprehensive-analysis model for AI results")
 
        # Brand data is already fetched above using userId
        # Use the values we got from the brandData collection query
 
        results = {}
        
        # **CRITICAL FIX**: Define feature_api_config (was missing, caused 500 error)
        feature_api_config = {
            "comprehensive-analysis": {
                "url": os.getenv("ANALYSIS_API_URL", API_URL.rstrip('/')) + "/comprehensive-analysis"
            }
        }
 
        # Process comprehensive-analysis only
        feature = "comprehensive-analysis"
        feature_config = feature_api_config.get(feature)
 
        if not feature_config:
            results[feature] = {"error": "No API configured for comprehensive-analysis"}
        else:
            try:
                print(f'🤖 Processing comprehensive-analysis')
                url = feature_config["url"]
 
                # Create a fresh file object for the request
                try:
                    if not hasattr(mediaFile, 'file') or not mediaFile.file:
                        raise HTTPException(status_code=400, detail="Media file stream is invalid or missing")
                    
                    if hasattr(mediaFile.file, 'seek'):
                        mediaFile.file.seek(0)
                    
                    file_content = mediaFile.file.read()
                    if not file_content:
                        raise HTTPException(status_code=400, detail="Media file is empty (0 bytes)")
                    
                    file_obj = io.BytesIO(file_content)
                except HTTPException:
                    raise
                except (AttributeError, IOError, ValueError) as e:
                    error_type = type(e).__name__
                    error_msg = str(e) if str(e) else "Unknown error"
                    print(f"❌ Error reading media file:")
                    print(f"   Error Type: {error_type}")
                    print(f"   Error Message: {error_msg}")
                    print(f"   Media File: {mediaFile.filename if mediaFile else 'Unknown'}")
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Error reading media file: {error_type} - {error_msg}"
                    )
 
                # Map channels to valid platform names
                platform_mapping = {
                    "facebook": "Facebook",
                    "instagram": "Instagram", 
                    "google ads": "Google Ads",
                    "youtube": "YouTube",
                    "tiktok": "TikTok"
                }
                comp_platforms = []
                print(f"🔍 DEBUG: Channels list: {channels_list}")
                for channel in channels_list:
                    if channel.lower() in platform_mapping:
                        comp_platforms.append(platform_mapping[channel.lower()])
                
                # Use only the platforms provided in the request, no defaults
                if not comp_platforms:
                    print(f"⚠️ No valid platforms found in channels: {channels_list}")
                    comp_platforms = []  # Empty list instead of defaults
                
                # Validate brand colors format (should be comma-separated hex codes)
                if brand_colours:
                    try:
                        # Clean up spaces first
                        cleaned_colors = brand_colours.replace(' ', '')
                        # Check if brand_colours contains valid hex colors
                        hex_pattern = r'^#[0-9A-Fa-f]{6}(,#[0-9A-Fa-f]{6})*$'
                        if re.match(hex_pattern, cleaned_colors):
                            brand_colours = cleaned_colors
                            print(f"✅ Valid brand colors: {brand_colours}")
                        else:
                            print(f"⚠️ Invalid brand colors format: '{brand_colours}', using default")
                            brand_colours = "#000000"  # Default fallback
                    except Exception as e:
                        print(f"⚠️ Error validating brand colors: {e}, using default")
                        brand_colours = "#000000"
                
                # Validate tone of voice (remove any problematic characters)
                if tone_of_voice:
                    try:
                        # Clean tone of voice - remove special characters that might cause issues
                        tone_of_voice = re.sub(r'[^\w\s,.-]', '', tone_of_voice)
                        print(f"✅ Cleaned tone of voice: {tone_of_voice}")
                    except Exception as e:
                        print(f"⚠️ Error cleaning tone of voice: {e}, using original")
                        # Keep original if regex fails
                
                # Validate messageIntent and funnelStage
                if not messageIntent or messageIntent.strip() == "" or messageIntent == "string":
                    messageIntent = "General advertisement analysis"
                    print(f"⚠️ Using default messageIntent: {messageIntent}")
                
                if not funnelStage or funnelStage.strip() == "" or funnelStage == "string":
                    funnelStage = "Awareness"
                    print(f"⚠️ Using default funnelStage: {funnelStage}")
                
                # Prepare form data for comprehensive analysis
                # NOTE: userId is NOT sent to main.py as it's not needed for AI analysis
                # userId is only used by middleware for database operations
                form_data = {
                    "ad_description": messageIntent,
                    "user_ad_type": funnelStage,
                    "ad_title": adTitle,
                    "brand_colors": brand_colours,
                    "tone_of_voice": tone_of_voice,
                    "platforms": ",".join(str(p) for p in comp_platforms if p)
                }
                files = {
                    "file": (mediaFile.filename, file_obj, mediaFile.content_type)
                }
                
                # **FIX**: Download logo from GCS and convert to binary (like media file)
                if logo_data and logo_data.get("logoUrl"):
                    try:
                        logo_url = logo_data.get("logoUrl")
                        if not isinstance(logo_url, str) or not logo_url.startswith('http'):
                            print(f"⚠️ Invalid logo URL format: {logo_url}, skipping logo download")
                            form_data["logo_url"] = logo_url if logo_url else None
                        else:
                            print(f"🔄 Downloading logo from GCS for binary conversion...")
                            print(f"📁 Logo URL: {logo_url}")
                        
                            # Download logo from GCS storage URL
                            logo_response = requests.get(logo_url, timeout=30)
                        
                            if logo_response.status_code == 200:
                                # Convert logo to binary format like media file
                                logo_binary = BytesIO(logo_response.content)
                                logo_filename = logo_data.get("logoFilename", "brand_logo.png")
                                logo_content_type = logo_data.get("logoType", "image/png")
                                
                                print(f"✅ Logo downloaded and converted to binary: {logo_filename}")
                                print(f"📁 Logo size: {len(logo_response.content)} bytes")
                                print(f"📁 Logo content type: {logo_content_type}")
                                
                                # Add logo as binary file to files dict (similar to media file)
                                # **FIX**: Use "logo_images" to match main.py endpoint expectation (single file)
                                files["logo_images"] = (logo_filename, logo_binary, logo_content_type)
                                print(f"✅ Logo added to files as binary data with key 'logo_images'")
                            else:
                                print(f"❌ Failed to download logo: HTTP {logo_response.status_code}")
                                # Fallback to URL if download fails
                                form_data["logo_url"] = logo_url
                    except requests.exceptions.RequestException as logo_error:
                        print(f"❌ Error downloading/converting logo: {str(logo_error)}")
                        # Fallback to URL if conversion fails
                        form_data["logo_url"] = logo_data.get("logoUrl")
 
                print(f"🤖 Calling comprehensive-analysis at {url}")
                print(f"📤 Form data: {form_data}")
                print(f"📤 Files being sent: {list(files.keys())}")
                print(f"🎨 BRAND COLORS being sent: '{form_data.get('brand_colors', 'NOT_FOUND')}'")
                print(f"🗣️ TONE OF VOICE being sent: '{form_data.get('tone_of_voice', 'NOT_FOUND')}'")
                print(f"💬 MESSAGE INTENT (ad_description) being sent: '{form_data.get('ad_description', 'NOT_FOUND')}'")
                print(f"🎯 USER AD TYPE being sent: '{form_data.get('user_ad_type', 'NOT_FOUND')}'")
                print(f"🏷️ PLATFORMS being sent: '{form_data.get('platforms', 'NOT_FOUND')}'")
                
                # **DEBUG**: Enhanced file logging
                for file_key, file_info in files.items():
                    if isinstance(file_info, tuple) and len(file_info) >= 3:
                        filename, file_obj, content_type = file_info[:3]
                        file_size = len(file_obj.getvalue()) if hasattr(file_obj, 'getvalue') else 'unknown'
                        print(f"  📁 {file_key}: {filename} ({content_type}) - {file_size} bytes")
                        
                    # **CRITICAL DEBUG**: Check if logo is being sent
                    if file_key == 'logo_images':
                        print(f"  🖼️ LOGO FOUND: Brand logo is being sent for analysis!")
                        print(f"  🖼️ Logo filename: {filename}")
                        print(f"  🖼️ Logo content type: {content_type}")
                        print(f"  🖼️ Logo size: {file_size} bytes")
                    elif file_key == 'file':
                        print(f"  🎬 MEDIA FILE: {filename} ({content_type})")
                        if content_type.startswith('video/'):
                            print(f"  🎬 VIDEO CONFIRMED: This is a video file for analysis")
                
                # **DEBUG**: Check if logo data was found in brand
                if logo_data:
                    print(f"🖼️ BRAND LOGO DATA FOUND:")
                    print(f"  📁 Logo URL: {logo_data.get('logoUrl', 'NOT_FOUND')}")
                    print(f"  📁 Logo filename: {logo_data.get('logoFilename', 'NOT_FOUND')}")
                    print(f"  📁 Logo type: {logo_data.get('logoType', 'NOT_FOUND')}")
                else:
                    print(f"❌ NO BRAND LOGO DATA FOUND - This could cause brand compliance issues!")
                    print(f"❌ Brand data mediaFiles: {brand_data.get('mediaFiles', [])}")
                    print(f"❌ Looking for mediaType='logo' in mediaFiles array")
                # FIX: Add verify=False to bypass SSL verification issues
                if not url:
                    raise HTTPException(status_code=500, detail="AI service URL not configured")
                if not isinstance(form_data, dict):
                    raise HTTPException(status_code=500, detail="Invalid form data format")
                if not isinstance(files, dict):
                    raise HTTPException(status_code=500, detail="Invalid files format")
                
                try:
                    response = requests.post(url, data=form_data, files=files, timeout=1200, verify=False)
                    if response is None:
                        raise HTTPException(status_code=500, detail="No response from AI service")
                except requests.exceptions.Timeout:
                    raise HTTPException(status_code=504, detail="AI service request timed out")
                except requests.exceptions.ConnectionError:
                    raise HTTPException(status_code=503, detail="AI service unavailable")
                except requests.exceptions.RequestException as e:
                    raise HTTPException(status_code=500, detail=f"Error calling AI service: {str(e)}")
 
                if response.status_code == 200:
                    try:
                        response_data = response.json()
                        if not isinstance(response_data, dict):
                            print(f"⚠️ Response is not a dict, wrapping in dict")
                            response_data = {"raw_response": response_data}
                        results[feature] = {"success": True, "data": response_data}
                        print(f"✅ comprehensive-analysis: Success")
                    except (json.JSONDecodeError, ValueError) as e:
                        print(f"⚠️ Failed to parse JSON response: {e}")
                        print(f"Response text preview: {response.text[:500] if response.text else 'Empty'}")
                        results[feature] = {"success": True, "data": {"raw_response": response.text}}
                        print(f"✅ comprehensive-analysis: Success (non-JSON response)")
                elif response.status_code == 422:
                    # Handle validation errors specifically
                    try:
                        error_detail = response.json()
                        print(f"❌ comprehensive-analysis: Validation Error (422)")
                        print(f"📋 Error details: {error_detail}")
                        print(f"📤 Sent form data: {form_data}")
                        print(f"📁 Sent files: {list(files.keys())}")
                        
                        results[feature] = {
                            "success": False,
                            "status_code": 422,
                            "error": f"Validation error: {error_detail}",
                            "validation_details": error_detail,
                            "sent_data": form_data,
                            "sent_files": list(files.keys())
                        }
                    except json.JSONDecodeError:
                        error_text = response.text
                        print(f"❌ comprehensive-analysis: Validation Error (422) - {error_text}")
                        results[feature] = {
                            "success": False,
                            "status_code": 422,
                            "error": f"Validation error: {error_text}",
                            "sent_data": form_data,
                            "sent_files": list(files.keys())
                        }
                else:
                    results[feature] = {
                        "success": False,
                        "status_code": response.status_code,
                        "error": response.text
                    }
                    print(f"❌ comprehensive-analysis: Failed - {response.status_code}: {response.text}")
 
            except requests.exceptions.RequestException as e:
                results[feature] = {"success": False, "error": str(e)}
                print(f"❌ comprehensive-analysis: Exception - {str(e)}")
 
        # ===== STORE ANALYSIS RESULTS AND UPDATE PLAN USAGE ONLY ON SUCCESS =====
        try:
            # Calculate success statistics first
            successful_models = [feature for feature, result in results.items() if result.get('success', False)]
            failed_models = [feature for feature, result in results.items() if not result.get('success', False)]
            
            # FIX: Remove fallback scores - raise exception if no models succeed
            if len(successful_models) == 0:
                error_details = {}
                for feature, result in results.items():
                    if not result.get('success', False):
                        error_details[feature] = {
                            "error": result.get('error', 'Unknown error'),
                            "status_code": result.get('status_code', 'N/A')
                        }
                
                print(f"❌ No successful AI models. Analysis failed completely.")
                print(f"❌ Failed models details: {error_details}")
                raise HTTPException(
                    status_code=500,
                    detail=f"All AI analysis models failed. Details: {error_details}"
                )
            
            # Check if we have a reasonable success rate (at least 50% of requested models)
            success_rate = len(successful_models) / len(selected_features) if selected_features else 0
            if success_rate < 0.5:
                print(f"⚠️ Low success rate ({success_rate:.1%}). Only {len(successful_models)}/{len(selected_features)} models succeeded.")
                # Still proceed if at least one model succeeded
            
            # Only update plan usage if we have successful analysis results
            new_ads_used = ads_used + 1
            new_total_ads = total_ads - 1
            
            plan_updates = {
                "adsUsed": new_ads_used,
                "totalAds": new_total_ads,
                "lastUsageDate": current_date.isoformat() + "Z",
                "updatedAt": current_date.isoformat() + "Z"
            }
            
            # Update the plan document (SINGLE SOURCE OF TRUTH)
            try:
                db.collection("PlanSelectionDetails").document(userId).update(plan_updates)
                print(f"✅ Plan usage updated in single source of truth: {new_ads_used}/{max_ads_per_month} monthly, {new_total_ads} total remaining")
            except Exception as e:
                error_type = type(e).__name__
                error_msg = str(e) if str(e) else "Unknown error"
                print(f"❌ Error updating plan usage:")
                print(f"   Error Type: {error_type}")
                print(f"   Error Message: {error_msg}")
                print(f"   User ID: {userId}")
                print(f"   Plan Updates: {plan_updates}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to update plan usage: {error_type} - {error_msg}"
                )
            
            # NOTE: No longer syncing to userProfileDetails - using PlanSelectionDetails as single source of truth
            # The get-user-profile endpoint now reads directly from PlanSelectionDetails
            
            # Store analysis data in user_analysis collection
            print(f"🔍 DEBUG: About to save adTitle to database: '{adTitle}'")
            analysis_data = {
                "userId": userId,
                "artifact_id": artifact_id,
                "brand_id": brandId,
                "timestamp": timestamp,
                "messageIntent": messageIntent,
                "funnelStage": funnelStage,
                "channels": channels_list,
                "source": source,
                "clientId": clientId,
                "artifacts": artifacts_data,
                "adTitle": adTitle,  # Include ad title for Libraries display
                "mediaUrl": media_url,
                "mediaType": mediaFile.content_type,
                "storagePath": storage_path,
                "mediaCategory": media_type,
                "brandName": brand_name,
                "ai_analysis_results": results,  # Store all AI model responses
                "selectedFeatures": user_selected_features,  # Store user's selected features for filtering
                "plan_usage_at_time": {
                    "adsUsed": new_ads_used,
                    "maxAdsPerMonth": max_ads_per_month,
                    "totalAdsRemaining": new_total_ads,
                    "planName": plan_data.get("planName", "Unknown")
                }
            }
            
            # Add logo data to analysis if logo was found in brand data
            if logo_data:
                analysis_data.update(logo_data)
            
            # Save to user_analysis collection with artifact_id as document ID
            try:
                db.collection("user_analysis").document(artifact_id).set(analysis_data)
                print(f"✅ AI analysis results saved to user_analysis collection with ID: {artifact_id}")
                print(f"🔍 DEBUG: Saved analysis_data with adTitle: '{analysis_data.get('adTitle', 'NOT_FOUND')}'")
            except Exception as e:
                error_type = type(e).__name__
                error_msg = str(e) if str(e) else "Unknown error"
                print(f"❌ Error saving analysis results to database:")
                print(f"   Error Type: {error_type}")
                print(f"   Error Message: {error_msg}")
                print(f"   User ID: {userId}")
                print(f"   Artifact ID: {artifact_id}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to save analysis results: {error_type} - {error_msg}"
                )
            
            # **CRITICAL**: Verify the data structure is correct for Details page
            ai_results = analysis_data.get("ai_analysis_results", {})
            has_comprehensive = "comprehensive-analysis" in ai_results if isinstance(ai_results, dict) else False
            print(f"🔍 Data structure verification:")
            print(f"   Has ai_analysis_results: {bool(ai_results)}")
            print(f"   Has comprehensive-analysis: {has_comprehensive}")
            print(f"   Analysis types: {list(ai_results.keys()) if isinstance(ai_results, dict) else 'None'}")
            
            # **IMPORTANT**: Also ensure this analysis can be found by the Details page
            # The Libraries page will use artifact_id to access this data
            print(f"🔍 Analysis will be accessible via Details button with ID: {artifact_id}")
            
            # **NEW**: Also save a reference in userFiles for Libraries page compatibility
            try:
                userfiles_data = {
        "userId": userId,
        "analysisId": artifact_id,  # This is the key - use the same ID
        "fileName": f"Analysis - {adTitle}",
        "fileType": "analysis",
        "fileCategory": "analysis",
        "mediaUrl": media_url,
        "mediaType": mediaFile.content_type,
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "tags": ["analysis", "ai-generated"],
            # Store the analysis results for backup/compatibility
        "analysisResults": results,
        "analysisInputs": {
        "messageIntent": messageIntent,
        "funnelStage": funnelStage,
        "channels": channels_list,
        "brandId": brandId
                }
        }
                
                # Save to userFiles collection for Libraries page
                userfiles_ref = db.collection("userFiles").document()
                userfiles_ref.set(userfiles_data)
                print(f"✅ ALSO saved to userFiles collection for Libraries compatibility")
                print(f"   UserFiles ID: {userfiles_ref.id}")
                print(f"   Points to analysis ID: {artifact_id}")
                print(f"   Libraries page will use this reference")
            except Exception as e:
                print(f"⚠️ Failed to save userFiles reference: {e}")
                # Don't fail the main analysis if this fails
            
            # **NEW**: Automatically generate PDF after successful analysis
            try:
                print(f"📄 Starting automatic PDF generation for analysis: {artifact_id}")
                
                # Prepare analysis data for PDF generation
                pdf_analysis_data = {
        "results": results,
        "ai_analysis_results": analysis_data.get("ai_analysis_results", {}),
        "comprehensive_analysis": analysis_data.get("comprehensive_analysis", {}),
        "timestamp": timestamp,
        "channels": channels_list,
        "messageIntent": messageIntent,
        "funnelStage": funnelStage
                }
                
                # Generate PDF using ReportLab
                pdf_buffer = io.BytesIO()
                
                try:
                    from reportlab.lib.pagesizes import A4
                    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
                    from reportlab.lib.styles import getSampleStyleSheet
                    
                    # Create PDF document
                    doc = SimpleDocTemplate(pdf_buffer, pagesize=A4, rightMargin=72, leftMargin=72, topMargin=72, bottomMargin=18)
                    styles = getSampleStyleSheet()
                    story = []
                    
                    # Title
                    story.append(Paragraph("ANALYSIS REPORT", styles['Title']))
                    story.append(Spacer(1, 12))
                    
                    # Basic info
                    story.append(Paragraph(f"<b>Title:</b> {adTitle or 'Analysis Report'}", styles['Normal']))
                    story.append(Paragraph(f"<b>Generated:</b> {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC", styles['Normal']))
                    story.append(Paragraph(f"<b>Analysis ID:</b> {artifact_id}", styles['Normal']))
                    story.append(Spacer(1, 20))
                    
                    # Analysis results
                    story.append(Paragraph("ANALYSIS RESULTS", styles['Heading1']))
                    story.append(Spacer(1, 12))
                    
                    if results:
                        for feature, result in results.items():
                            if isinstance(result, dict) and result.get("success"):
                                story.append(Paragraph(f"<b>{feature.replace('_', ' ').title()}</b>", styles['Heading2']))
                                if "data" in result and "results" in result["data"]:
                                    data_results = result["data"]["results"]
                                    for key, value in data_results.items():
                                        if isinstance(value, dict) and "score" in value:
                                            score = value.get("score", "N/A")
                                            explanation = value.get("explanation", "No explanation available")
                                            story.append(Paragraph(f"<b>{key.replace('_', ' ').title()}:</b> {score}", styles['Normal']))
                                            story.append(Paragraph(f"Details: {explanation[:300]}...", styles['Normal']))
                                            story.append(Spacer(1, 6))
                        story.append(Spacer(1, 12))
                    else:
                        story.append(Paragraph("No analysis results available.", styles['Normal']))
                    
                    # Build PDF
                    doc.build(story)
                    pdf_buffer.seek(0)
                    
                except ImportError:
                    print("⚠️ ReportLab not available, using simple text fallback")
                    # Fallback to text content
                    content = f"""
    ANALYSIS REPORT
    ===============

    Title: {adTitle or 'Analysis Report'}
    Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC
    User ID: {userId}
    Analysis ID: {artifact_id}

    ANALYSIS RESULTS:
    """
                    
                    # Add analysis results
                    if results:
                        for feature, result in results.items():
                            if isinstance(result, dict) and result.get("success"):
                                content += f"\n{feature.replace('_', ' ').title()}:\n"
                                if "data" in result and "results" in result["data"]:
                                    data_results = result["data"]["results"]
                                    for key, value in data_results.items():
                                        if isinstance(value, dict) and "score" in value:
                                            score = value.get("score", "N/A")
                                            explanation = value.get("explanation", "No explanation available")
                                            content += f"  {key.replace('_', ' ').title()}: {score}\n"
                                            content += f"  Details: {explanation[:200]}...\n\n"
                    
                    # Write to buffer as text (not ideal but better than nothing)
                    pdf_buffer.write(content.encode('utf-8'))
                    pdf_buffer.seek(0)
                
                # Generate filename
                safe_title = (adTitle or "analysis").replace(" ", "_").replace("/", "_")
                timestamp_str = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
                filename = f"{timestamp_str}_{safe_title}_Report.pdf"
                storage_path = f"analysis-reports/{userId}/{filename}"
                
                # Upload to Google Cloud Storage
                blob = bucket.blob(storage_path)
                # Use appropriate content type based on whether we have a real PDF or text fallback
                content_type = "application/pdf"  # Default for ReportLab-generated PDFs
                try:
                    # Check if ReportLab was used by trying to import it
                    from reportlab.lib.pagesizes import A4
                except ImportError:
                    # If ReportLab is not available, we have a text file, not a PDF
                    content_type = "text/plain"
                    print("⚠️ Uploading as text/plain due to missing ReportLab")

                blob.upload_from_file(pdf_buffer, content_type=content_type)

                # Generate signed URL
                pdf_url = blob.generate_signed_url(
                    version="v4",
                    expiration=timedelta(days=7),
                    method="GET"
                )

                # Create userFiles record for the PDF
                pdf_record = {
                    "userId": userId,
                    "fileCategory": "analysis-report",
                    "fileType": "application/pdf",
                    "fileName": f"Analysis - {adTitle or 'Report'}",
                    "storagePath": storage_path,
                    "url": pdf_url,
                    "pdfUrl": pdf_url,  # Explicit PDF URL
                    "analysisId": artifact_id,
                    "createdAt": datetime.utcnow(),
                    "updatedAt": datetime.utcnow(),
                    "tags": ["analysis", "pdf", "auto-generated"],
                    "mediaUrl": media_url  # Link to the original media
                }

                # Save PDF record to userFiles collection
                pdf_doc_ref = db.collection("userFiles").document()
                pdf_doc_ref.set(pdf_record)

                print(f"✅ PDF automatically generated and saved: {filename}")
                print(f"🔗 PDF URL: {pdf_url}")
                print(f"📄 PDF record ID: {pdf_doc_ref.id}")

                pdf_buffer.close()

            except Exception as pdf_error:
                print(f"⚠️ Warning: Could not generate PDF automatically: {pdf_error}")
                # Don't fail the main analysis if PDF generation fails
           
        except Exception as e:
            print(f"❌ Analysis failed or could not save results: {str(e)}")
            # Don't update plan usage if analysis failed
            # Return error response without updating plan usage
            raise HTTPException(
                status_code=500,
                detail=f"Analysis failed: {str(e)}. Plan usage was not updated."
            )
 
        # Get plan type from user's plan selection
        selected_models = list(results.keys())
        plan_data_response = None  # Initialize for response
        try:
            plan_doc = db.collection("PlanSelectionDetails").document(userId).get()
            if plan_doc.exists:
                plan_data_response = plan_doc.to_dict()
                plan_type = plan_data_response.get("planName", "lite").lower().replace("incivus_", "")
            else:
                plan_type = "lite"
                plan_data_response = {"planName": "lite"}  # Default for response
        except Exception as e:
            print(f"Warning: Could not get plan type: {e}")
            plan_type = "lite"
            plan_data_response = {"planName": "lite"}  # Default for response
       
        # Create frontend-compatible response structure
        # The frontend expects: analysisResponse.ai_analysis_results['comprehensive-analysis'].data.results
        frontend_compatible_results = {}
        
        # Extract the actual analysis results from comprehensive-analysis
        if "comprehensive-analysis" in results:
            comp_result = results["comprehensive-analysis"]
            if isinstance(comp_result, dict) and comp_result.get("success"):
                comp_data = comp_result.get("data", {})
                if isinstance(comp_data, dict) and "results" in comp_data:
                    frontend_compatible_results = comp_data["results"]
                    if isinstance(frontend_compatible_results, dict):
                        print(f"✅ Extracted results for frontend: {list(frontend_compatible_results.keys())}")
                        
                        # Transform purchase intent data for frontend AnalysisResults component
                        if "content_analysis" in frontend_compatible_results:
                            content_analysis = frontend_compatible_results["content_analysis"]
                            if isinstance(content_analysis, dict) and "purchase_intent_scores" in content_analysis:
                                purchase_intent_scores = content_analysis["purchase_intent_scores"]
                                if isinstance(purchase_intent_scores, dict):
                                    # Create breakdown structure expected by frontend
                                    purchase_intent_breakdown = {}
                                    for metric_key, metric_data in purchase_intent_scores.items():
                                        if isinstance(metric_data, dict):
                                            purchase_intent_breakdown[metric_key] = {
                                                "score": metric_data.get("score", 0),
                                                "percentage": metric_data.get("percentage", 0),
                                                "reason": metric_data.get("reason", metric_data.get("description", "No reasoning provided"))
                                            }
                                    
                                    # Add transformed purchase intent data for frontend
                                    if "purchaseIntent" not in frontend_compatible_results:
                                        frontend_compatible_results["purchaseIntent"] = {}
                                    
                                    frontend_compatible_results["purchaseIntent"].update({
                                        "score": content_analysis.get("overall_purchase_intent_percentage", 0),
                                        "breakdown": purchase_intent_breakdown,
                                        "resonatingImpact": content_analysis.get("resonating_impact", "")
                                    })
                                    
                                    print(f"✅ Transformed purchase intent data for frontend with {len(purchase_intent_breakdown)} metrics")
        
        response_data = {
            "status": "success",
            "message": f"Analysis completed. {len(successful_models)} out of {len(selected_features)} models succeeded.",
            "artifactId": artifact_id,
            "analysis_summary": {
                "total_models_requested": len(selected_features),
                "successful_models": len(successful_models),
                "failed_models": len(failed_models),
                "success_rate": f"{(len(successful_models) / len(selected_features) * 100):.1f}%" if selected_features else "0%"
            },
            # Frontend expects this exact structure
            "ai_analysis_results": {
                "comprehensive-analysis": {
                    "success": True,
                    "data": {
                        "results": frontend_compatible_results
                    }
                }
            },
            "plan_type": plan_type,
            "selected_models": selected_models,
            "plan_usage": {
                "adsUsed": new_ads_used,
                "maxAdsPerMonth": max_ads_per_month,
                "totalAdsRemaining": new_total_ads,
                "planName": plan_data_response.get("planName", "Unknown"),
                "monthlyLimitReached": new_ads_used >= max_ads_per_month,
                "adsRemaining": max_ads_per_month - new_ads_used,
                "analysis_successful": True
            },
            "media_info": {
                "mediaUrl": media_url,
                "mediaType": mediaFile.content_type,
                "mediaCategory": media_type,
                "filename": mediaFile.filename,
                "fileSize": getattr(mediaFile, 'size', 0) if mediaFile else 0
            },
            "brand_info": {
                "brandId": brandId,
                "brandName": brand_name,
                "userId": userId,
                "brandFound": brand_data is not None,
                "colorPalette": brand_colours,
                "toneOfVoice": tone_of_voice
            }
        }
        
        # Add logo information to response if logo was found in brand data
        if logo_data:
            response_data["logoInfo"] = {
                "logo_artifact_id": logo_data["logo_artifact_id"],
                "logoUrl": logo_data["logoUrl"],
                "logoStoragePath": logo_data["logoStoragePath"],
                "logoCategory": logo_data["logoCategory"],
                "logoFilename": logo_data["logoFilename"],
                "logoFileSize": logo_data["logoFileSize"],
                "source": "brand_data"
            }
        
        # Add warnings if any models failed
        if failed_models:
            response_data["warnings"] = {
                "failed_models": failed_models,
                "message": f"The following models failed: {', '.join(failed_models)}"
            }
        
        # Debug: Print the exact response structure for frontend debugging
        print(f"🔍 FRONTEND DEBUG: Final response structure:")
        print(f"   status: {response_data.get('status')}")
        print(f"   ai_analysis_results exists: {response_data.get('ai_analysis_results') is not None}")
        if response_data.get('ai_analysis_results'):
            print(f"   ai_analysis_results keys: {list(response_data.get('ai_analysis_results', {}).keys())}")
            for key, value in response_data.get('ai_analysis_results', {}).items():
                print(f"     {key}: {type(value)} - {list(value.keys()) if isinstance(value, dict) else 'not dict'}")
        
        return response_data
 
    except HTTPException as http_ex:
        # Re-raise HTTPExceptions without modification to preserve original status code and detail
        print(f"🔍 HTTPException raised: Status {http_ex.status_code}, Detail: {http_ex.detail}")
        raise
    except Exception as e:
        import traceback
        # Extract detailed error information
        error_type = type(e).__name__
        error_msg = str(e) if str(e) else "No error message available"
        
        # Get more context from exception args if available
        if hasattr(e, 'args') and e.args:
            error_detail = '; '.join(str(arg) for arg in e.args if arg)
            if error_detail and error_detail != error_msg:
                error_msg = f"{error_msg} | Details: {error_detail}"
        
        traceback_str = traceback.format_exc()
        
        # Log comprehensive error information
        print(f"❌ Error saving analysis details:")
        print(f"   Error Type: {error_type}")
        print(f"   Error Message: {error_msg}")
        print(f"   User ID: {userId if 'userId' in locals() else 'Unknown'}")
        print(f"   Brand ID: {brandId if 'brandId' in locals() else 'Unknown'}")
        print(f"📋 Full traceback:\n{traceback_str}")
        
        # Provide more helpful error message
        detail_msg = f"Analysis failed: {error_type}"
        if error_msg and error_msg != "No error message available":
            detail_msg += f" - {error_msg}"
        else:
            detail_msg += " - Check server logs for details"
        
        raise HTTPException(status_code=500, detail=detail_msg)
 

# REMOVED: /uploadBrand - Unused endpoint

# REMOVED: /upload-images/ - Unused endpoint

@app.get("/get-brand-data/{brand_id}")
async def get_brand_data(brand_id: str):
    try:
        # Fetch document by ID from Firestore
        doc_ref = db.collection("brandData").document(brand_id)
        doc = doc_ref.get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="Brand data not found")

        brand_data = doc.to_dict()

        # Generate fresh signed URLs for media files
        if "mediaFiles" in brand_data:
            for media_file in brand_data["mediaFiles"]:
                if "storagePath" in media_file:
                    blob = bucket.blob(media_file["storagePath"])
                    media_file["url"] = blob.generate_signed_url(
                        version="v4",
                        expiration=timedelta(days=7),
                        method="GET",
                        content_type=None
                    )

        return brand_data

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/get-user-brands/{user_id}")
async def get_user_brands(user_id: str):
    try:
        # Fetch all brands for a specific user
        docs = db.collection("brandData").where("userId", "==", user_id).stream()
        
        brands = []
        for doc in docs:
            brand_data = doc.to_dict()
            brand_data["brandId"] = doc.id
            
            # Generate fresh signed URLs for media files
            if "mediaFiles" in brand_data:
                for media_file in brand_data["mediaFiles"]:
                    if "storagePath" in media_file:
                        blob = bucket.blob(media_file["storagePath"])
                        media_file["url"] = blob.generate_signed_url(
                            version="v4",
                            expiration=timedelta(days=7),
                            method="GET",
                            content_type=None
                        )
            
            brands.append(brand_data)
        
        return {"brands": brands, "count": len(brands)}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/delete-media-file/{brand_id}/{file_id}")
async def delete_media_file(brand_id: str, file_id: str):
    try:
        print(f"🗑️ Attempting to delete file {file_id} from brand {brand_id}")
        
        # Get brand data
        doc_ref = db.collection("brandData").document(brand_id)
        doc = doc_ref.get()

        if not doc.exists:
            print(f"❌ Brand data not found for brand_id: {brand_id}")
            raise HTTPException(status_code=404, detail="Brand data not found")

        brand_data = doc.to_dict()
        media_files = brand_data.get("mediaFiles", [])

        print(f"📄 Found {len(media_files)} media files in brand data")
        
        # Debug: Log all file IDs to see what's available
        for i, media_file in enumerate(media_files):
            print(f"📄 File {i}: {media_file.get('fileId')} / {media_file.get('id')} - {media_file.get('fileName')}")
        
        # Find and remove the file - check both 'fileId' and 'id' fields
        file_to_delete = None
        updated_media_files = []

        for media_file in media_files:
            # Check multiple possible ID fields
            if (media_file.get("fileId") == file_id or
                media_file.get("id") == file_id or
                media_file.get("artifactId") == file_id):
                file_to_delete = media_file
                print(f"✅ Found file to delete: {media_file.get('fileName')}")
            else:
                updated_media_files.append(media_file)
        
        if not file_to_delete:
            print(f"❌ Media file with ID {file_id} not found in {len(media_files)} files")
            available_ids = [f.get('fileId') or f.get('id') or f.get('artifactId') for f in media_files]
            print(f"📄 Available IDs: {available_ids}")
            raise HTTPException(status_code=404, detail=f"Media file not found. Available IDs: {available_ids}")
        
        # Delete from blob storage if path exists
        storage_deleted = False
        if "storagePath" in file_to_delete and file_to_delete["storagePath"]:
            try:
                blob = bucket.blob(file_to_delete["storagePath"])
                if blob.exists():
                    blob.delete()
                    storage_deleted = True
                    print(f"✅ Deleted file from storage: {file_to_delete['storagePath']}")
                else:
                    print(f"⚠️ File not found in storage: {file_to_delete['storagePath']}")
            except Exception as storage_error:
                print(f"⚠️ Error deleting from storage: {storage_error}")
                # Continue with Firestore update even if storage deletion fails
        
        # Update Firestore
        brand_data["mediaFiles"] = updated_media_files
        brand_data["mediaCount"] = len(updated_media_files)
        
        doc_ref.set(brand_data)
        print(f"✅ Updated brand data. Remaining files: {len(updated_media_files)}")
        
        return {
        "message": "Media file deleted successfully",
        "deleted_file": file_to_delete,
        "remaining_files": len(updated_media_files),
        "storage_deleted": storage_deleted
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
            print(f"❌ Unexpected error in delete_media_file: {str(e)}")
            print(f"❌ Error type: {type(e)}")
            import traceback
            print(f"❌ Traceback: {traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# Plan configuration - moved to module level for global access
PLAN_CONFIG = {
    "Incivus_Lite": {
        "duration_days": 90, 
        "total_ads": 12, 
        "max_ads_per_month": 4, 
        "price": 50,
        "selectedFeatures": ["brand_compliance", "messaging_intent", "funnel_compatibility", "channel_compliance"]
    },
    "Incivus_Plus": {
        "duration_days": 180, 
        "total_ads": 30, 
        "max_ads_per_month": 5, 
        "price": 100,
        "selectedFeatures": ["brand_compliance", "messaging_intent", "funnel_compatibility", "channel_compliance", "resonance_index"]
    },
    "Incivus_Pro": {
        "duration_days": 365, 
        "total_ads": 132, 
        "max_ads_per_month": 11, 
        "price": 400,
        "selectedFeatures": ["brand_compliance", "messaging_intent", "funnel_compatibility", "channel_compliance", "resonance_index"]
    }
}

# Feature API configuration - moved to module level for global access
feature_api_config = {
    "analyze-ad": {
        "url": f"{API_URL}analyze-ad"
    },
    "brand-compliance": {
        "url": f"{API_URL}brand-compliance"
    },
    "channel-compliance": {
        "url": f"{API_URL}channel-compliance"
    },
    "metaphor-analysis": {
        "url": f"{API_URL}metaphor-analysis"
    },
    "comprehensive-analysis": {
        "url": f"{API_URL}comprehensive-analysis"
    }
}



@app.post("/update_plan")
def update_plan(
    user_id: str = Form(..., description="User ID of the plan owner"),
    plan_name: str = Form(..., description="Plan name: Incivus_Lite / Incivus_Plus / Incivus_Pro"),
    action: str = Form(..., description="Action: topup or upgrade"),
    features: Optional[str] = Form(None, description="Comma-separated list of features for topup only (e.g., 'brand_compliance,content_analysis'). For upgrades, all features are automatically included."),
    total_ads: Optional[int] = Form(None, description="Custom total ads count for upgrades (overrides PLAN_CONFIG default)")
    ):
    """
    Update user plan with topup or upgrade logic.
    
    Topup Logic:
        - Topup can only be done for the same plan
        - If user buys the same plan before current plan expires, new plan starts from day after current plan expires
        - Example: Lite plan expires on March 31st, topup on March 15th → new plan starts April 1st, expires June 30th
    
        Upgrade Logic:
            - Upgrade can be done to any higher plan
            - New plan starts immediately from the day of upgrade
            - Remaining ads from current plan are carried forward
            - Monthly ad limit becomes the new plan's limit
            - Subscription tenure is exactly as per the new plan's duration
            - All features are automatically included (no features parameter needed)
            """
    try:
        # Validate plan
        plan_info = PLAN_CONFIG.get(plan_name)
        if not plan_info:
            raise HTTPException(status_code=400, detail="Invalid plan name")

        # Define plan hierarchy for upgrades
        PLAN_HIERARCHY = {
        "Incivus_Lite": 1,
        "Incivus_Plus": 2,
        "Incivus_Pro": 3
        }

        # Get Firestore document
        user_ref = db.collection("PlanSelectionDetails").document(user_id)
        doc = user_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="User plan not found")

        data = doc.to_dict()
        current_plan_name = data.get("planName", "")
        current_date = datetime.utcnow()
        
        print(f"🔍 Topup request: User {user_id}, Plan: {plan_name}, Action: {action}")
        print(f"🔍 Current plan: {current_plan_name}, Current date: {current_date}")

        # ===== Topup logic =====
        if action == "topup":
            # Check if this is the same plan
            if plan_name != current_plan_name:
                raise HTTPException(status_code=400, detail=f"Topup can only be done for the same plan. Current plan: {current_plan_name}, Requested plan: {plan_name}")
            
            # Parse and validate features for topup
            selected_features = []
            if features:
                try:
                    # Handle different input formats (JSON array, comma-separated, single value)
                    if features.startswith('[') and features.endswith(']'):
                        # JSON array format
                        selected_features = json.loads(features)
                    elif ',' in features:
                        # Comma-separated format
                        selected_features = [feature.strip() for feature in features.split(',') if feature.strip()]
                    else:
                        # Single value format
                        selected_features = [features.strip()] if features.strip() else []
                    print(f"🔍 Parsed features for topup: {selected_features}")
                except json.JSONDecodeError as e:
                    print(f"⚠️ Error parsing features JSON: {e}")
                    selected_features = []
            
            # Get current plan end date
            current_end = datetime.fromisoformat(data["subscriptionEndDate"].replace("Z", ""))
            
            # Check if current plan is still active
            if current_date > current_end:
                # Plan has expired, start new plan from today
                new_start = current_date
                new_end = new_start + timedelta(days=plan_info["duration_days"])
                print(f"✅ Plan expired, starting new plan from today: {new_start} to {new_end}")
            else:
                # Plan is still active, new plan starts from day after current plan expires
                new_start = current_end + timedelta(days=1)
                new_end = new_start + timedelta(days=plan_info["duration_days"])
                print(f"✅ Same plan topup: new plan starts from {new_start} to {new_end}")
            
            # Update plan data
            data["subscriptionStartDate"] = new_start.isoformat() + "Z"
            data["subscriptionEndDate"] = new_end.isoformat() + "Z"
            data["validityDays"] = plan_info["duration_days"]
            # Use custom total_ads if provided, otherwise fall back to PLAN_CONFIG
            topup_ads = total_ads if total_ads is not None else plan_info["total_ads"]
            
            # Get CURRENT remaining ads (this reflects any ads already used)
            current_remaining_ads = data.get("totalAds", 0)
            current_ads_used = data.get("adsUsed", 0)
            
            print(f"🔍 Topup calculation - Current remaining: {current_remaining_ads}, Used: {current_ads_used}, Adding: {topup_ads}")
            
            # Check if current plan has expired
            if current_date > current_end:
                # Plan has expired - Start fresh with new ads only
                data["totalAds"] = topup_ads
                print(f"🔍 Topup (expired plan) - Fresh start: {topup_ads} ads (previous plan expired)")
                # Reset monthly usage for new billing cycle
                data["adsUsed"] = 0
                data["paymentStatus"] = "completed"  # **FIX**: Mark topup payment as completed
                data["isActive"] = True  # Ensure plan is active
                data["status"] = "active"  # Ensure status is active
                print(f"🔍 Topup (expired plan) - Reset monthly usage to 0 for new cycle")
            else:
                # Plan is still active - ADD new ads to remaining total
                data["totalAds"] = current_remaining_ads + topup_ads
                print(f"🔍 Topup (active plan) - New total: {data['totalAds']} (remaining {current_remaining_ads} + topup {topup_ads})")
                # **FIX**: PRESERVE monthly usage within same billing cycle
                data["adsUsed"] = current_ads_used  # Keep existing ads used
                print(f"🔍 Topup (active plan) - Preserving monthly usage: {current_ads_used} ads used")
            # **CRITICAL FIX**: For same-plan topups, PRESERVE existing monthly limit (don't change monthly allowance)
            if current_date <= current_end:
                # Plan is still active - PRESERVE existing monthly limit (topup doesn't change monthly allowance)
                existing_monthly_limit = data.get("max_ads_per_month", plan_info["max_ads_per_month"])
                data["max_ads_per_month"] = existing_monthly_limit
                print(f"🔍 Topup (active plan) - PRESERVING monthly limit: {existing_monthly_limit} ads/month (topup doesn't change monthly allowance)")
            else:
                # Plan has expired - Reset to plan default monthly limit
                data["max_ads_per_month"] = plan_info["max_ads_per_month"]
                print(f"🔍 Topup (expired plan) - Reset monthly limit: {plan_info['max_ads_per_month']} ads/month")
                data["totalPrice"] = data.get("totalPrice", 0) + plan_info.get("price", 100)  # Add price for topup
                data["paymentStatus"] = "completed"  # **FIX**: Mark topup payment as completed
                data["isActive"] = True  # Ensure plan is active
                data["status"] = "active"  # Ensure status is active
                # Don't update lastUsageDate during topup - it should only be updated when ads are actually used
                # data["lastUsageDate"] = new_start.isoformat() + "Z"
                data["updatedAt"] = current_date.isoformat() + "Z"
            
            # Update selectedFeatures if provided, otherwise use plan defaults
            if selected_features:
                data["selectedFeatures"] = selected_features
                print(f"✅ Updated selectedFeatures: {selected_features}")
            else:
                # If no features provided, ensure we have the default features for this plan
                default_features = plan_info.get("selectedFeatures", [])
                current_features = data.get("selectedFeatures", [])
                if not current_features and default_features:
                    data["selectedFeatures"] = default_features
                    print(f"✅ Applied default selectedFeatures for {plan_name}: {default_features}")
                else:
                    print(f"⚠️ No features provided for topup, keeping existing features: {current_features}")
            
            print(f"✅ Same plan topup completed: {plan_name}")
            print(f"📅 New period: {new_start.strftime('%Y-%m-%d')} to {new_end.strftime('%Y-%m-%d')}")
            print(f"📊 Total ads: {data['totalAds']} (added {topup_ads} user-selected ads)")
            print(f"📊 Monthly limit: {data['max_ads_per_month']} ads/month (preserved - topup doesn't change monthly allowance)")
            print(f"📊 Monthly usage: {data.get('adsUsed', 0)} ads used this month")
            print(f"📊 Monthly remaining: {data['max_ads_per_month'] - data.get('adsUsed', 0)} ads remaining this month (unchanged by topup)")

        # ===== Upgrade logic =====
        elif action == "upgrade":
            print(f"🔍 Upgrade request: User {user_id}, Current Plan: {current_plan_name}, New Plan: {plan_name}")
            
            # Check if this is a valid upgrade (higher plan)
            current_plan_level = PLAN_HIERARCHY.get(current_plan_name, 0)
            new_plan_level = PLAN_HIERARCHY.get(plan_name, 0)
            print(f"🔍 Plan levels - Current: {current_plan_level}, New: {new_plan_level}")
            
            if new_plan_level <= current_plan_level:
                raise HTTPException(status_code=400, detail=f"Upgrade can only be done to a higher plan. Current plan: {current_plan_name} (level {current_plan_level}), Requested plan: {plan_name} (level {new_plan_level})")
            
            # Calculate remaining ads from current plan
            remaining_ads = data.get("totalAds", 0)
            current_monthly_limit = data.get("max_ads_per_month", 0)
            print(f"🔍 Current subscription - Remaining ads: {remaining_ads}, Monthly limit: {current_monthly_limit}")
            
            # New plan starts immediately from today
            new_start = current_date
            new_end = new_start + timedelta(days=plan_info["duration_days"])
            print(f"✅ Upgrade plan starts from {new_start.strftime('%Y-%m-%d')} to {new_end.strftime('%Y-%m-%d')}")
            
            # Combine max ads per month from current subscription (actual value) and upgrading plan
            current_max_ads_per_month = data.get("max_ads_per_month", 0)  # Use actual current value, not base plan
            new_plan_max_ads_per_month = plan_info["max_ads_per_month"]
            combined_max_ads_per_month = current_max_ads_per_month + new_plan_max_ads_per_month
            print(f"🔍 DEBUG - Raw data from database: {data}")
            print(f"🔍 DEBUG - Current max_ads_per_month from data: {current_max_ads_per_month}")
            print(f"🔍 DEBUG - New plan max_ads_per_month: {new_plan_max_ads_per_month}")
            print(f"🔍 DEBUG - Combined calculation: {current_max_ads_per_month} + {new_plan_max_ads_per_month} = {combined_max_ads_per_month}")
            print(f"🔍 Monthly limits - Current subscription: {current_max_ads_per_month}, New plan: {new_plan_max_ads_per_month}, Combined: {combined_max_ads_per_month}")

            # Use custom total_ads if provided, otherwise fall back to PLAN_CONFIG
            new_plan_ads = total_ads if total_ads is not None else plan_info["total_ads"]
            print(f"🔍 Upgrade ads calculation - Custom ads: {total_ads}, Config ads: {plan_info['total_ads']}, Using: {new_plan_ads}")
            
            # Update plan data for upgrade
            data["planName"] = plan_name
            data["subscriptionStartDate"] = new_start.isoformat() + "Z"
            data["subscriptionEndDate"] = new_end.isoformat() + "Z"
            data["validityDays"] = plan_info["duration_days"]
            data["totalAds"] = remaining_ads + new_plan_ads  # Carry forward remaining + user-selected ads
            data["max_ads_per_month"] = combined_max_ads_per_month  # Combined monthly limit
            data["totalPrice"] = data.get("totalPrice", 0) + plan_info.get("price", 100)  # Add upgrade price
            # **FIX**: PRESERVE current monthly usage during upgrade - don't reset ads used within the current billing cycle  
            current_ads_used = data.get("adsUsed", 0)
            data["adsUsed"] = current_ads_used  # Keep existing ads used
            data["paymentStatus"] = "completed"  # **FIX**: Mark upgrade payment as completed
            data["isActive"] = True  # Ensure plan is active
            data["status"] = "active"  # Ensure status is active
            print(f"🔍 Preserving current monthly usage during upgrade: {current_ads_used} ads used")
            # Don't update lastUsageDate during upgrade - it should only be updated when ads are actually used
            # data["lastUsageDate"] = new_start.isoformat() + "Z"
            data["updatedAt"] = current_date.isoformat() + "Z"
            
            # For upgrades, automatically include all features available in the new plan
            upgrade_features = plan_info.get("selectedFeatures", ["brand_compliance", "messaging_intent", "funnel_compatibility", "channel_compliance"])
            data["selectedFeatures"] = upgrade_features
            print(f"✅ Auto-assigned plan features for upgrade to {plan_name}: {upgrade_features}")
            
            print(f"✅ Plan upgrade completed: {current_plan_name} → {plan_name}")
            print(f"📅 New period: {new_start.strftime('%Y-%m-%d')} to {new_end.strftime('%Y-%m-%d')}")
            print(f"📊 Total ads: {data['totalAds']} (carried forward: {remaining_ads} + user-selected: {new_plan_ads})")
            print(f"📊 Monthly limit: {data['max_ads_per_month']} (combined: {current_max_ads_per_month} + {new_plan_max_ads_per_month})")

        else:
            raise HTTPException(status_code=400, detail="Invalid action type. Use 'topup' or 'upgrade'")

        # Save updated data
        user_ref.update(data)
        
        # SYNC: Also update the user profile subscription data so frontend shows correct data
        try:
            profile_ref = db.collection("userProfileDetails").document(user_id)
            subscription_update = {
                "subscription.planType": data["planName"].replace("Incivus_", "").lower(),
                "subscription.planName": data["planName"],
                "subscription.adQuota": data["totalAds"],
                "subscription.adsUsed": data.get("adsUsed", 0),
                "subscription.max_ads_per_month": data.get("max_ads_per_month", 0),
                "subscription.totalPrice": data.get("totalPrice", 0),  # FIX: Copy total payment amount during topup/upgrade
                "subscription.paymentStatus": data.get("paymentStatus", "completed"),  # **FIX**: Update payment status
                "subscription.isActive": data.get("isActive", True),  # **FIX**: Ensure active status
                "subscription.status": data.get("status", "active"),  # **FIX**: Ensure active status
                "subscription.subscriptionStartDate": data["subscriptionStartDate"],
                "subscription.subscriptionEndDate": data["subscriptionEndDate"],
                "subscription.validityDays": data["validityDays"],
                "subscription.selectedFeatures": data.get("selectedFeatures", []),
                "subscription.updatedAt": data["updatedAt"],
                "updatedAt": data["updatedAt"]
            }
            profile_ref.update(subscription_update)
            print(f"✅ User profile subscription synced after {action}: {data.get('adsUsed', 0)} ads used, {data['totalAds']} total")
        except Exception as e:
            print(f"⚠️ Warning: Could not sync subscription data to user profile after {action}: {e}")
            # Don't fail the request if profile sync fails
        
        # Prepare response data
        response_data = {
            "status": "success", 
            "message": f"Plan {action} completed successfully",
            "updated_data": {
                "planName": data["planName"],
                "subscriptionStartDate": data["subscriptionStartDate"],
                "subscriptionEndDate": data["subscriptionEndDate"],
                "totalAds": data["totalAds"],
                "max_ads_per_month": data["max_ads_per_month"],
                "adsUsed": data["adsUsed"],
                "validityDays": data["validityDays"],
                "selectedFeatures": data.get("selectedFeatures", [])
            },
            "current_plan_end_date": data["subscriptionEndDate"],
            "action_type": action
        }
        
        # Add upgrade-specific information
        if action == "upgrade":
            response_data["previous_plan"] = current_plan_name
            response_data["carried_forward_ads"] = data.get("totalAds", 0) - plan_info["total_ads"]
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error in update_plan: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update plan: {str(e)}")


@app.get("/get-plan-status/{user_id}")
async def get_plan_status(user_id: str):
    """
    Get current plan status and topup information
    """
    try:
        # Get user's plan document
        user_ref = db.collection("PlanSelectionDetails").document(user_id)
        doc = user_ref.get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="User plan not found")

        data = doc.to_dict()
        current_date = datetime.utcnow()

        # Parse dates
        start_date = datetime.fromisoformat(data["subscriptionStartDate"].replace("Z", ""))
        end_date = datetime.fromisoformat(data["subscriptionEndDate"].replace("Z", ""))

        # Calculate plan status
        is_active = current_date <= end_date
        days_remaining = (end_date - current_date).days if is_active else 0
        days_elapsed = (current_date - start_date).days if current_date >= start_date else 0

        # Calculate topup information
        current_plan_name = data.get("planName", "")
        plan_info = PLAN_CONFIG.get(current_plan_name, {})

        topup_info = {
            "current_plan": current_plan_name,
            "can_topup": is_active,  # Can only topup if current plan is active
            "next_period_start": (end_date + timedelta(days=1)).strftime("%Y-%m-%d") if is_active else current_date.strftime("%Y-%m-%d"),
            "next_period_end": (end_date + timedelta(days=1 + plan_info.get("duration_days", 0))).strftime("%Y-%m-%d") if is_active else (current_date + timedelta(days=plan_info.get("duration_days", 0))).strftime("%Y-%m-%d"),
            "topup_ads": plan_info.get("total_ads", 0),
            "topup_monthly_limit": plan_info.get("max_ads_per_month", 0)
        }

        return {
            "user_id": user_id,
            "plan_status": {
                "plan_name": current_plan_name,
                "is_active": is_active,
                "start_date": start_date.strftime("%Y-%m-%d"),
                "end_date": end_date.strftime("%Y-%m-%d"),
                "days_remaining": days_remaining,
                "days_elapsed": days_elapsed,
                "total_ads": data.get("totalAds", 0),
                "ads_used": data.get("adsUsed", 0),
                "max_ads_per_month": data.get("max_ads_per_month", 0),
                "last_usage_date": data.get("lastUsageDate", "")
            },
            "topup_info": topup_info
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error getting plan status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get plan status: {str(e)}")



@app.post("/upload-additional-media/{brand_id}")
async def upload_additional_media(
    brand_id: str,
    mediaType: str = Form(...),  # "logo", "video", or "image"
    metadata: Optional[str] = Form(None),
    files: list[UploadFile] = File(...)
):
    try:
        # Validate brand exists
        doc_ref = db.collection("brandData").document(brand_id)
        doc = doc_ref.get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="Brand data not found")

        brand_data = doc.to_dict()

        # Allowed file types
        ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
        ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm']
        MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB limit

        new_media_files = []

        for file in files:
            # Validate file type based on mediaType
            if mediaType in ["logo", "image"]:
                if file.content_type not in ALLOWED_IMAGE_TYPES:
                    raise HTTPException(status_code=400, detail=f"Invalid file type for {mediaType}: {file.content_type}")
            elif mediaType == "video":
                if file.content_type not in ALLOWED_VIDEO_TYPES:
                    raise HTTPException(status_code=400, detail=f"Invalid file type for video: {file.content_type}")

            if file.size and file.size > MAX_FILE_SIZE:
                raise HTTPException(status_code=400, detail=f"File too large: {file.filename}")

            # Generate unique file name
            file_ext = os.path.splitext(file.filename)[1]
            media_id = str(uuid.uuid4())
            storage_filename = f"brands/{brand_id}/{mediaType}s/{media_id}{file_ext}"

            # Upload to GCS
            blob = bucket.blob(storage_filename)
            blob.upload_from_file(file.file, content_type=file.content_type)
            media_url = blob.generate_signed_url(
                version="v4",
                expiration=timedelta(days=7),
                method="GET"
            )

            new_media_files.append({
                "fileId": media_id,
                "filename": file.filename,
                "contentType": file.content_type,
                "fileSize": getattr(file, "size", None),
                "url": media_url,
                "storagePath": storage_filename,
                "mediaType": mediaType,
                "metadata": metadata or "",
                "uploadTimestamp": datetime.utcnow().isoformat()
            })

        # Update brand data
        existing_media = brand_data.get("mediaFiles", [])
        updated_media = existing_media + new_media_files

        brand_data["mediaFiles"] = updated_media
        brand_data["mediaCount"] = len(updated_media)

        doc_ref.set(brand_data)

        return {
            "message": f"Additional {mediaType} files uploaded successfully",
            "brand_id": brand_id,
            "uploaded_files": new_media_files,
            "total_media_count": len(updated_media)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/get-analysis-details/{user_id}")
async def get_analysis_details(user_id: str):
    try:
        # Step 1: Get selected features from PlanSelectionDetails
        try:
            plans_selection = db.collection("PlanSelectionDetails").document(user_id)
            get_plans = plans_selection.get()
            if get_plans.exists:
                plan_data = get_plans.to_dict()
                selected_features = plan_data.get("selectedFeatures", [])
            else:
                selected_features = []
        except Exception as e:
            print(f"Error fetching selected features: {e}")
            selected_features = []

        print(selected_features)
        # Step 2: Get analysis documents for the user from user_analysis collection
        docs = db.collection("user_analysis").where("userId", "==", user_id).stream()
        analysis_details = []
        for doc in docs:
            data = doc.to_dict()

            # Filter ai_analysis_results by selected_features
            if "ai_analysis_results" in data and selected_features:
                # Check if comprehensive-analysis exists and has data.results
                if "comprehensive-analysis" in data["ai_analysis_results"]:
                    comp_analysis = data["ai_analysis_results"]["comprehensive-analysis"]
                    if "data" in comp_analysis and "results" in comp_analysis["data"]:
                        original_features = comp_analysis["data"]["results"]

                        # Map plan features to nested results features
                        feature_mapping = {
                            "brand_compliance": "brand_compliance",
                            "channel_compliance": "channel_compliance",
                            "content_analysis": "content_analysis",
                            "metaphor_analysis": "metaphor_analysis",
                            "messaging_intent": "content_analysis",
                            "funnel_compatibility": "content_analysis",
                            "resonance_index": "metaphor_analysis"
                        }

                        # Create filtered results structure
                        filtered_results = {}
                        filtered_features = []

                        # Filter the nested features based on user's plan
                        for plan_feature in selected_features:
                            if plan_feature in feature_mapping:
                                nested_feature = feature_mapping[plan_feature]
                                if nested_feature in original_features:
                                    filtered_results[nested_feature] = original_features[nested_feature]
                                    filtered_features.append(nested_feature)

                        # Create filtered comprehensive analysis
                        filtered_comp_analysis = comp_analysis.copy()
                        filtered_comp_analysis["data"] = comp_analysis["data"].copy()
                        filtered_comp_analysis["data"]["results"] = filtered_results

                        # Update the analysis data
                        data["ai_analysis_results"]["comprehensive-analysis"] = filtered_comp_analysis
                        data["filtered_features"] = filtered_features
                        data["total_filtered_features"] = len(filtered_features)
                        data["filtered_models"] = ["comprehensive-analysis"]
                        data["total_filtered_models"] = 1
                        print(f"✅ Filtered features for analysis {doc.id}: {filtered_features}")
                        print(f"🔍 User selected features: {selected_features}")
                        print(f"🔍 Available features in results: {list(original_features.keys())}")
                else:
                    data["filtered_features"] = []
                    data["total_filtered_features"] = 0
                    data["filtered_models"] = []
                    data["total_filtered_models"] = 0
            else:
                data["filtered_features"] = []
                data["total_filtered_features"] = 0
                data["filtered_models"] = []
                data["total_filtered_models"] = 0

            data["document_id"] = doc.id
            data["user_selected_features"] = selected_features
            analysis_details.append(data)

        if not analysis_details:
            raise HTTPException(status_code=404, detail=f"No analysis details found for user: {user_id}")

        return {
            "user_id": user_id,
            "total_analyses": len(analysis_details),
            "user_selected_features": selected_features,
            "analysis_details": analysis_details
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

 
@app.get("/get-user-analysis-history/{user_id}")
async def get_user_analysis_history(user_id: str):
    """Get all analysis results for a specific user"""
    try:
        # Query all documents for this user from user_analysis collection
        docs = db.collection("user_analysis").where("userId", "==", user_id).stream()

        analysis_history = []
        for doc in docs:
            data = doc.to_dict()
            analysis_history.append({
                "artifact_id": doc.id,
                "timestamp": data.get("timestamp"),
                "messageIntent": data.get("messageIntent"),
                "funnelStage": data.get("funnelStage"),
                "channels": data.get("channels"),
                "adTitle": data.get("adTitle"),
                "total_models_analyzed": data.get("total_models_analyzed"),
                "successful_models": data.get("successful_models"),
                "ai_analysis_results": data.get("ai_analysis_results"),
                "plan_usage_at_time": data.get("plan_usage_at_time", {}),
                "mediaUrl": data.get("mediaUrl"),
                "mediaType": data.get("mediaType"),
                "storagePath": data.get("storagePath"),
                "mediaCategory": data.get("mediaCategory"),
                "brandName": data.get("brandName"),
                "fileCategory": "analysis-report"
            })

        return {
            "user_id": user_id,
            "total_analyses": len(analysis_history),
            "analysis_history": analysis_history
        }
    except Exception as e:
        print(f"Error fetching user analysis history: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/get-analysis-by-id/{analysis_id}")
async def get_analysis_by_id(analysis_id: str):
    """Get a specific analysis result by analysis ID with feature filtering based on user's plan"""
    try:
        doc_ref = db.collection("user_analysis").document(analysis_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail=f"Analysis with ID '{analysis_id}' not found")

        analysis_data = doc.to_dict()
        analysis_data["document_id"] = doc.id
        print(f"✅ Analysis data: {analysis_data}")

        # Get user ID from the analysis data
        user_id = analysis_data.get("userId")
        if not user_id:
            raise HTTPException(status_code=400, detail="Analysis data does not contain user ID")
        
        # Get selected features from user's plan
        selected_features = []
        try:
            plan_doc = db.collection("PlanSelectionDetails").document(user_id).get()
            if plan_doc.exists:
                plan_data = plan_doc.to_dict()
                selected_features = plan_data.get("selectedFeatures", [])
                print(f"✅ Found selected features for user {user_id}: {selected_features}")
            else:
                print(f"⚠️ No plan found for user {user_id}, showing all features")
                selected_features = []
        except Exception as e:
            print(f"Warning: Could not get selected features for user {user_id}: {e}")
            selected_features = []
        
        # Filter AI analysis results based on selected features
        if "ai_analysis_results" in analysis_data and selected_features:
            original_results = analysis_data["ai_analysis_results"]
            # Check if comprehensive-analysis exists and has data.results
            if "comprehensive-analysis" in original_results:
                comp_analysis = original_results["comprehensive-analysis"]
                if "data" in comp_analysis and "results" in comp_analysis["data"]:
                    original_features = comp_analysis["data"]["results"]
                    # Create filtered results structure
                    filtered_results = {}
                    filtered_features = []
                    # Map plan features to nested results features
                    feature_mapping = {
                        "brand_compliance": "brand_compliance",
                        "channel_compliance": "channel_compliance",
                        "messaging_intent": "content_analysis",
                        "funnel_compatibility": "content_analysis",
                        "resonance_index": "metaphor_analysis"
                    }
                    # Filter the nested features based on user's plan
                    for plan_feature in selected_features:
                        if plan_feature in feature_mapping:
                            nested_feature = feature_mapping[plan_feature]
                            if nested_feature in original_features:
                                filtered_results[nested_feature] = original_features[nested_feature]
                                filtered_features.append(nested_feature)
                    # Apply filtered results
                    filtered_comp_analysis = comp_analysis.copy()
                    filtered_comp_analysis["data"] = comp_analysis["data"].copy()
                    filtered_comp_analysis["data"]["results"] = filtered_results
                    analysis_data["ai_analysis_results"]["comprehensive-analysis"] = filtered_comp_analysis
                    analysis_data["filtered_features"] = filtered_features
                    analysis_data["total_filtered_features"] = len(filtered_features)
                    analysis_data["user_selected_features"] = selected_features
                    analysis_data["all_available_features"] = list(original_features.keys())
                    print(f"✅ Filtered nested features: {filtered_features}")
                else:
                    print(f"⚠️ No 'data.results' found in comprehensive-analysis")
                    analysis_data["filtered_features"] = []
                    analysis_data["total_filtered_features"] = 0
                    analysis_data["user_selected_features"] = selected_features
                    analysis_data["all_available_features"] = []
            else:
                print(f"⚠️ No 'comprehensive-analysis' found in ai_analysis_results")
                analysis_data["filtered_features"] = []
                analysis_data["total_filtered_features"] = 0
                analysis_data["user_selected_features"] = selected_features
                analysis_data["all_available_features"] = []
        else:
            # If no features selected or no filtering needed, show all results
            if "ai_analysis_results" in analysis_data and "comprehensive-analysis" in analysis_data["ai_analysis_results"]:
                comp_analysis = analysis_data["ai_analysis_results"]["comprehensive-analysis"]
                if "data" in comp_analysis and "results" in comp_analysis["data"]:
                    all_features = list(comp_analysis["data"]["results"].keys())
                    analysis_data["filtered_features"] = all_features
                    analysis_data["total_filtered_features"] = len(all_features)
                    analysis_data["user_selected_features"] = selected_features
                    analysis_data["all_available_features"] = all_features
                else:
                    analysis_data["filtered_features"] = []
                    analysis_data["total_filtered_features"] = 0
                    analysis_data["user_selected_features"] = selected_features
                    analysis_data["all_available_features"] = []
            else:
                analysis_data["filtered_features"] = []
                analysis_data["total_filtered_features"] = 0
                analysis_data["user_selected_features"] = selected_features
                analysis_data["all_available_features"] = []
        
        return {
        "message": "Analysis retrieved successfully",
        "analysis": analysis_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error retrieving analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve analysis: {str(e)}")


# REMOVED: /reset-monthly-usage/{user_id} - Unused admin endpoint
# REMOVED: /reset-all-monthly-usage - Unused admin endpoint

@app.get("/get-plan-selections/{user_id}")
async def get_plan_selections(user_id: str):
    try:
        # FIX: Use document ID directly instead of querying by field
        # PlanSelectionDetails uses user_id as the document ID, not as a field
        plan_doc = db.collection("PlanSelectionDetails").document(user_id).get()
        
        if not plan_doc.exists:
            raise HTTPException(status_code=404, detail=f"No plan found for user: {user_id}")
        
        d = plan_doc.to_dict() or {}
        plan_data = {
            "planId": d.get("planId"),
            "planName": d.get("planName"),
            "selected_features": d.get("selectedFeatures", []),
            "subscriptionStartDate": d.get("subscriptionStartDate"),
            "subscriptionEndDate": d.get("subscriptionEndDate"),
            "paymentStatus": d.get("paymentStatus"),
            "totalAds": d.get("totalAds"),
            "adsUsed": d.get("adsUsed", 0),
            "totalPrice": d.get("totalPrice"),
            "validityDays": d.get("validityDays"),
        }
        
        return {"userId": user_id, "count": 1, "plans": [plan_data]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching plan: {str(e)}")


# REMOVED: Old duplicate endpoint - replaced by blob storage version below


@app.get("/get-user-file/{file_id}")
async def get_user_file(file_id: str):
    """Return a single user file document by ID."""
    try:
        def get_from(collection_name: str):
            d = db.collection(collection_name).document(file_id).get()
            if d.exists:
                data = d.to_dict() or {}
                data["id"] = d.id
                return data
            return None

        data = get_from("userFiles") or get_from("UserFiles")
        if data is None:
            raise HTTPException(status_code=404, detail="File not found")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching user file: {str(e)}")


# ===============================
# Analysis persistence endpoints
# ===============================

@app.post("/save-analysis-record")
async def save_analysis_record(request: Request):
    """Persist analysis inputs and results metadata into userFiles collection."""
    try:
        body = await request.json()
        print(f"🔍 SAVE-ANALYSIS-RECORD: Received request with body keys: {list(body.keys())}")
        print(f"🔍 SAVE-ANALYSIS-RECORD: pdfUrl provided: {bool(body.get('pdfUrl'))}")
        if body.get('pdfUrl'):
            print(f"🔍 SAVE-ANALYSIS-RECORD: PDF URL: {body.get('pdfUrl')[:100]}...")
        
        user_id = body.get("userId")
        if not user_id:
            raise HTTPException(status_code=400, detail="userId required")

        now = datetime.utcnow()
        analysis_id = body.get("analysisId")
        
        # **FIX**: Check if record already exists to update instead of creating duplicate
        existing_doc = None
        existing_data = {}
        if analysis_id:
            existing_query = db.collection("userFiles").where("userId", "==", user_id).where("analysisId", "==", analysis_id).limit(1)
            existing_results = list(existing_query.stream())
            if existing_results:
                existing_doc = existing_results[0]
                existing_data = existing_doc.to_dict()
                print(f"📝 Found existing analysis record for analysisId: {analysis_id}")
                print(f"🔍 Existing record has mediaUrl: {bool(existing_data.get('mediaUrl'))}")
                print(f"🔍 Existing record has pdfUrl: {bool(existing_data.get('pdfUrl'))}")
                print(f"🔍 Current request has mediaUrl: {bool(body.get('mediaUrl'))}")
                print(f"🔍 Current request has pdfUrl: {bool(body.get('pdfUrl'))}")
        
        doc = {
        "userId": user_id,
        "fileCategory": "analysis-report",
        "fileType": body.get("fileType", "application/json"),  # **NEW**: Allow PDF type
        "fileName": body.get("fileName") or "Ad Analysis",
        "analysisInputs": body.get("analysisInputs", {}),
        "analysisResults": body.get("analysisResults", {}),
        "analysisId": analysis_id,
        "updatedAt": now,
        "tags": ["analysis", "report"],
        }
        
        # **NEW**: Include PDF URL and storage path if provided
        if body.get("pdfUrl"):
            doc["pdfUrl"] = body.get("pdfUrl")
            doc["url"] = body.get("pdfUrl")
            doc["fileType"] = "application/pdf"
            print(f"📄 Including PDF URL in analysis record: {body.get('pdfUrl')}")
        
        if body.get("pdfStoragePath"):
            doc["storagePath"] = body.get("pdfStoragePath")
        
        # **NEW**: Include mediaUrl for image preview if provided
        if body.get("mediaUrl"):
            media_url = body.get("mediaUrl")
            media_url_length = len(str(media_url))
            if media_url.startswith("data:") and media_url_length > 500000:
                print(f"⚠️ Skipping large base64 mediaUrl ({media_url_length} chars) - exceeds Firestore limits")
                print(f"🔍 MediaUrl starts with: {media_url[:100]}...")
            else:
                doc["mediaUrl"] = media_url
                doc["mediaType"] = "image/jpeg"
                print(f"🖼️ Including mediaUrl in analysis record (length: {media_url_length} chars)")
        
        # **NEW**: Include main URL if provided
        if body.get("url"):
            doc["url"] = body.get("url")
            print(f"🔗 Including main URL in analysis record: {body.get('url')}")

        if existing_doc:
            # **FIX**: Update existing record instead of creating duplicate with SMART MERGING
            doc_id = existing_doc.id
            doc["createdAt"] = existing_data.get("createdAt", now)  # Preserve original creation time
            # **SMART MERGE**: Preserve existing mediaUrl if current request doesn't have it
            if not body.get("mediaUrl") and existing_data.get("mediaUrl"):
                existing_media_url = existing_data.get("mediaUrl")
                existing_media_length = len(str(existing_media_url))
                # **FIX**: Only preserve if it's not too large
                if existing_media_url.startswith("data:") and existing_media_length > 500000:
                    print(f"⚠️ Skipping large existing mediaUrl ({existing_media_length} chars) - exceeds Firestore limits")
                else:
                    doc["mediaUrl"] = existing_media_url
                    doc["mediaType"] = existing_data.get("mediaType", "image/jpeg")
                    print(f"🔄 Preserving existing mediaUrl from previous record ({existing_media_length} chars)")
            # **SMART MERGE**: Preserve existing PDF URL if current request doesn't have it
            if not body.get("pdfUrl") and existing_data.get("pdfUrl"):
                doc["pdfUrl"] = existing_data.get("pdfUrl")
                doc["url"] = existing_data.get("pdfUrl")  # Prioritize PDF URL for main URL
                print(f"🔄 Preserving existing pdfUrl from previous record")
            # **SMART MERGE**: If we have both mediaUrl and pdfUrl, prioritize PDF for main URL
            if doc.get("pdfUrl"):
                doc["url"] = doc.get("pdfUrl")
                doc["fileType"] = "application/pdf"
                print(f"🎯 Setting main URL to PDF URL and fileType to application/pdf for 'View PDF' functionality")
            elif doc.get("mediaUrl"):
                doc["url"] = doc.get("mediaUrl")
                print(f"🖼️ Setting main URL to mediaUrl (no PDF available yet)")

            ref = db.collection("userFiles").document(doc_id)
            ref.set(doc, merge=True)
            print(f"✅ Updated existing analysis record with smart merge: {doc_id}")
            print(f"📄 Final record has mediaUrl: {bool(doc.get('mediaUrl'))}, pdfUrl: {bool(doc.get('pdfUrl'))}")
        else:
            # Create new record
            doc["createdAt"] = now
            ref = db.collection("userFiles").document()
            ref.set(doc)
            doc_id = ref.id
            print(f"✅ Created new analysis record: {doc_id}")
        
        # **CRITICAL FIX**: ALSO save to user_analysis collection if we have REAL analysisResults
        if body.get('analysisResults') and analysis_id:
            analysis_results = body.get('analysisResults')
            # Validate that this is REAL analysis data, not placeholder data
            is_real_data = False
            # Check if it has comprehensive-analysis structure (preferred)
            if isinstance(analysis_results, dict) and 'comprehensive-analysis' in analysis_results:
                comp_analysis = analysis_results['comprehensive-analysis']
                if isinstance(comp_analysis, dict) and comp_analysis.get('success') and 'data' in comp_analysis:
                    is_real_data = True
                    print(f"✅ Found comprehensive-analysis structure - REAL DATA")
            # Check if it has old format but with REAL data (not placeholders)
            elif isinstance(analysis_results, dict):
                has_real_scores = False
                for key, value in analysis_results.items():
                    if isinstance(value, dict):
                        score = value.get('score')
                        detailed = value.get('detailedAnalysis', '')
                        if (score is not None and not (isinstance(detailed, str) and 'Detailed analysis will be available' in detailed)):
                            has_real_scores = True
                            break
                if has_real_scores:
                    is_real_data = True
                    print(f"✅ Found old format with real scores - REAL DATA")
                else:
                    print(f"⚠️ Found old format with placeholder data - SKIPPING")
            # Only save to user_analysis if we have REAL data
            if is_real_data:
                print(f"🔄 ALSO saving to user_analysis collection for Details page compatibility")
                user_analysis_data = {
                    "userId": user_id,
                    "artifact_id": analysis_id,
                    "timestamp": body.get("createdAt", now),
                    "adTitle": body.get("fileName", "Analysis"),
                    "mediaUrl": body.get("mediaUrl"),
                    "mediaType": body.get("mediaType"),
                    "mediaCategory": body.get("mediaCategory", "unknown"),
                    "ai_analysis_results": analysis_results,
                    "source": "frontend_save"
                }
                db.collection("user_analysis").document(analysis_id).set(user_analysis_data)
                print(f"✅ ALSO saved to user_analysis collection with ID: {analysis_id}")
                print(f"🔍 Details button will now work for this analysis!")
            else:
                print(f"🚫 SKIPPED saving to user_analysis - placeholder/incomplete data detected")
                print(f"   Analysis ID: {analysis_id}")
                print(f"   This prevents creation of non-working Details pages")
        
        doc["id"] = doc_id
        return {"message": "Analysis record saved", "id": doc_id, "document": doc}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving analysis record: {str(e)}")










@app.post("/upload-analysis-pdf")
async def upload_analysis_pdf(
    userId: str = Form(...),
    file: UploadFile = File(...),
    analysisId: Optional[str] = Form(None),
    fileName: Optional[str] = Form(None),
    ):
    """Upload a generated analysis PDF to GCS and create/update a userFiles document."""
    try:
        if not userId:
            raise HTTPException(status_code=400, detail="userId required")

        safe_name = (fileName or file.filename or "analysis.pdf").replace("/", "_")
        ts = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        storage_path = f"analysis-reports/{userId}/{ts}_{safe_name}"

        contents = await file.read()
        blob = bucket.blob(storage_path)
        blob.upload_from_string(contents, content_type="application/pdf")
        # **FIX**: Generate signed URL without content-type header to avoid malformed header errors
        url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(days=7),
            method="GET"
        )

        # **FIX**: Create userFiles record so PDF appears in Libraries
        pdf_record = {
            "userId": userId,
            "fileCategory": "analysis-report",
            "fileType": "application/pdf",
            "fileName": safe_name,
            "storagePath": storage_path,
            "url": url,
            "pdfUrl": url,  # Explicit PDF URL for Libraries
            "analysisId": analysisId,
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
            "tags": ["analysis", "pdf", "auto-generated"]
            }
        
        # Check if record already exists for this analysisId
        doc_id = None
        if analysisId:
            existing_query = db.collection("userFiles").where("userId", "==", userId).where("analysisId", "==", analysisId).limit(1)
            existing_results = list(existing_query.stream())
            if existing_results:
                # Update existing record
                doc_ref = db.collection("userFiles").document(existing_results[0].id)
                doc_ref.set(pdf_record, merge=True)
                doc_id = existing_results[0].id
                print(f"📄 Updated existing PDF record with ID: {doc_id}")

        if not doc_id:
            # Create new record
            doc_ref = db.collection("userFiles").document()
            doc_ref.set(pdf_record)
            doc_id = doc_ref.id
            print(f"📄 Created new PDF record with ID: {doc_id}")

        print(f"📄 PDF uploaded to storage and saved to database: {url}")

        return {"message": "PDF uploaded to storage", "url": url, "storagePath": storage_path, "id": doc_id}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading PDF: {str(e)}")

@app.get("/download-analysis-pdf/{analysis_id}")
async def download_analysis_pdf(analysis_id: str):
    """Generate and download PDF from analysis HTML details."""
    try:
        from reportlab.lib.pagesizes import A4, letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
        from reportlab.lib.units import inch
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
        import io
        import base64
        from fastapi.responses import StreamingResponse

        print(f"🎯 PDF DOWNLOAD: Generating PDF for analysis ID: {analysis_id}")

        # Get analysis data using the same method as Details HTML page
        unified_response = await get_unified_analysis_data(analysis_id)
        if not unified_response["success"]:
            raise HTTPException(status_code=404, detail=f"Analysis not found: {unified_response.get('error', 'Unknown error')}")
        
        # Extract the same data structure as Details HTML page
        analysis_data = unified_response["full_data"]
        actual_analysis_id = unified_response["analysis_id"]
        data_source = unified_response["data_source"]
        has_real_scores = unified_response["has_real_scores"]
        sample_scores = unified_response["sample_scores"]
        
        # Also get top-level metadata from unified response
        brand_id = unified_response.get("brand_id", "N/A")
        brand_name = unified_response.get("brand_name", "N/A")
        ad_title = unified_response.get("ad_title", "N/A")
        funnel_stage = unified_response.get("funnelStage", "N/A")
        message_intent = unified_response.get("messageIntent", "N/A")
        channels = unified_response.get("channels", [])

        print(f"📊 PDF DOWNLOAD: Analysis data retrieved - Title: {ad_title}")
        print(f"🔍 PDF UNIFIED DEBUG: brand_id={brand_id}, funnel_stage={funnel_stage}, message_intent={message_intent}")
        print(f"🔍 PDF UNIFIED DEBUG: sample_scores={sample_scores}")
        
        # **FIX**: Use selectedFeatures from the original analysis data, not current user plan
        # This prevents retroactive feature changes after plan upgrades
        selected_features = analysis_data.get('selectedFeatures', [])
        user_plan_type = None
        
        # Get plan type from analysis data if available
        if 'plan_usage_at_time' in analysis_data:
            plan_info = analysis_data['plan_usage_at_time']
            user_plan_type = plan_info.get('planName', '').lower()
            print(f"🎯 PDF FILTER: Using plan type from analysis time: {user_plan_type}")
        
        print(f"🎯 PDF FILTER: Using selectedFeatures from original analysis: {selected_features}")
        print(f"🎯 PDF FILTER: This ensures old analyses maintain their original feature selection")
        
        # **FALLBACK**: If no stored features, get from current plan (for old analyses without stored features)
        if not selected_features:
            user_id = analysis_data.get('userId')
            if user_id:
                try:
                    plan_doc = db.collection("PlanSelectionDetails").document(user_id).get()
                    if plan_doc.exists:
                        plan_data = plan_doc.to_dict()
                        selected_features = plan_data.get("selectedFeatures", [])
                        if not user_plan_type:
                            user_plan_type = plan_data.get("planName", "").lower()
                        print(f"🎯 PDF FILTER: FALLBACK - Using current plan features: {selected_features}")
                    else:
                        print(f"🎯 PDF FILTER: No plan found for user {user_id}, showing all features")
                except Exception as e:
                    print(f"🎯 PDF FILTER: Warning: Could not get plan data for user {user_id}: {e}")
        
        # Helper function to determine if a card should be shown (same logic as HTML and React)
        def should_show_card_pdf(card_key, user_plan_type, selected_features):
            """Determine if a card should be shown in PDF based on user's plan type"""
            if not user_plan_type:
                # If no plan type provided, show all cards (backward compatibility)
                return True
            
            # For Plus/Pro/Enterprise users, show all cards regardless of selected_features
            if any(plan in user_plan_type for plan in ['plus', 'pro', 'enterprise']):
                return True
            
            # For Lite users, only show cards for selected features
            if 'lite' in user_plan_type:
                if not selected_features:
                    # If no selected_features, show all cards (backward compatibility)
                    return True
                
                # Map card keys to feature IDs (same as React component)
                card_to_feature_map = {
                    'brandCompliance': 'brand_compliance',
                    'messagingIntent': 'messaging_intent',
                    'funnelCompatibility': 'funnel_compatibility',
                    'channelCompliance': 'channel_compliance',
                    'purchaseIntent': 'resonance_index'
                }
                
                feature_id = card_to_feature_map.get(card_key)
                if feature_id:
                    # Return True only if feature is in selected_features, False otherwise
                    return feature_id in selected_features
                # If card_key not in map, don't show it for Lite users
                return False
            
            # For free or unknown plans, show all cards (they'll have overlays in the frontend)
            return True
        
        # PDF with purple header (no logo) and footer
        from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame
        from reportlab.pdfgen import canvas
        
        # Custom page template with simple header and footer
        class SimpleIncivusTemplate(PageTemplate):
            def __init__(self, id, frames, pagesize=A4, **kw):
                PageTemplate.__init__(self, id, frames, pagesize=pagesize, **kw)
                
            def beforeDrawPage(self, canvas, doc):
                """Header with C5i logo and ad title, plus footer"""
                canvas.saveState()
                
                page_width, page_height = A4
                
                # Frontend-style header with gradient
                header_height = 70
                # Create frontend gradient: #667eea to #764ba2
                gradient_steps = 10
                for i in range(gradient_steps):
                    y_pos = page_height - header_height + (i * header_height / gradient_steps)
                    # Frontend gradient colors
                    r = (102 + (i * (118 - 102) / gradient_steps)) / 255
                    g = (126 + (i * (75 - 126) / gradient_steps)) / 255  
                    b = (234 + (i * (162 - 234) / gradient_steps)) / 255
                    canvas.setFillColor(colors.Color(r, g, b))
                    canvas.rect(0, y_pos, page_width, header_height / gradient_steps, fill=1, stroke=0)
                
                # Add subtle shadow under header
                canvas.setFillColor(colors.Color(0, 0, 0, 0.15))
                canvas.rect(0, page_height - header_height - 3, page_width, 3, fill=1, stroke=0)
                
                # Try to add C5i logo image
                try:
                    import os
                    from reportlab.platypus import Image
                    
                    # Look for the logo image file
                    logo_paths = [
                        os.path.join(os.path.dirname(__file__), 'c5i_logo.jpg'),
                        os.path.join(os.path.dirname(__file__), 'C5i_logo.jpg'),
                        os.path.join(os.path.dirname(__file__), 'c5i_logo.png'),
                        os.path.join(os.path.dirname(__file__), 'logo.jpg'),
                        os.path.join(os.path.dirname(__file__), 'logo.png')
                    ]
                    
                    logo_added = False
                    for logo_path in logo_paths:
                        if os.path.exists(logo_path):
                            try:
                                # Add logo on left side of header
                                logo_width = 60
                                logo_height = 30
                                logo_x = 40
                                logo_y = page_height - header_height + 15
                                
                                # White background for logo
                                canvas.setFillColor(colors.white)
                                canvas.roundRect(logo_x - 5, logo_y - 5, logo_width + 10, logo_height + 10, 5, fill=1, stroke=0)
                                
                                # Draw logo image
                                canvas.drawImage(logo_path, logo_x, logo_y, width=logo_width, height=logo_height, preserveAspectRatio=True)
                                logo_added = True
                                print(f"[SUCCESS] PDF: Added C5i logo from {logo_path}")
                                break
                            except Exception as img_error:
                                print(f"[WARNING] PDF: Could not load logo from {logo_path}: {img_error}")
                                continue
                    
                    if not logo_added:
                        print("[WARNING] PDF: No logo image found, using text only")
                        
                except Exception as logo_error:
                    print(f"[WARNING] PDF: Logo loading error: {logo_error}")
                
                # Ad title in header (centered, accounting for logo)
                canvas.setFont("Helvetica-Bold", 18)
                canvas.setFillColor(colors.white)
                actual_title = ad_title if ad_title != "N/A" else "Analysis Report"
                # Center the title or position it to the right if logo exists
                title_width = canvas.stringWidth(actual_title, "Helvetica-Bold", 18)
                title_x = (page_width - title_width) / 2  # Center by default
                canvas.drawString(title_x, page_height - 40, actual_title)
                
                # Simple footer
                footer_y = 30
                canvas.setFont("Helvetica", 9)
                canvas.setFillColor(colors.HexColor('#6c757d'))
                canvas.drawString(40, footer_y, "(c) 2025 Incivus C5i - Human AI Impact. All rights reserved.")
                
                # Website on right
                website_text = "www.incivus.ai"
                text_width = canvas.stringWidth(website_text, "Helvetica", 9)
                canvas.drawString(page_width - text_width - 40, footer_y, website_text)
                
                # Page number center
                page_text = f"Page {doc.page}"
                page_width_calc = canvas.stringWidth(page_text, "Helvetica", 9)
                canvas.drawString((page_width - page_width_calc) / 2, footer_y, page_text)
                
                canvas.restoreState()
        
        # Create PDF with template (space for logo header)
        buffer = io.BytesIO()
        frame = Frame(50, 70, A4[0] - 100, A4[1] - 150, id='normal', leftPadding=15, rightPadding=15, topPadding=25, bottomPadding=15)
        template = SimpleIncivusTemplate('main', [frame])
        doc = BaseDocTemplate(buffer, pagesize=A4, pageTemplates=[template])
        
        # Enhanced styles with frontend colors
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'IncivusTitle',
            parent=styles['Heading1'],
            fontSize=24,
            spaceAfter=15,
            spaceBefore=15,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#5b21b6'),  # Frontend purple
            fontName='Helvetica-Bold',
            backColor=colors.HexColor('#ffffff'),
            borderColor=colors.HexColor('#667eea'),  # Frontend gradient color
            borderWidth=1,
            borderPadding=12
            )
        
        heading_style = ParagraphStyle(
            'IncivusHeading',
            parent=styles['Heading2'],
            fontSize=16,
            spaceAfter=10,
            spaceBefore=12,
            textColor=colors.HexColor('#5b21b6'),  # Frontend purple
            fontName='Helvetica-Bold',
            alignment=TA_LEFT
            )
        
        normal_style = ParagraphStyle(
            'IncivusNormal',
            parent=styles['Normal'],
            fontSize=11,
            spaceAfter=6,
            textColor=colors.HexColor('#374151'),  # Softer text color
            fontName='Helvetica',
            alignment=TA_LEFT
            )
        
        # Build PDF content
        story = []
        
        # NO title box - content starts directly with metadata table
        
        # Use the already extracted metadata from unified response
        # Fallback to analysis_data if not available in unified response
        if ad_title == "N/A":
            ad_title = analysis_data.get('adTitle', 'N/A')
        if brand_name == "N/A":
            brand_name = analysis_data.get('brandName', 'N/A')
            
        channel_str = ', '.join(channels) if isinstance(channels, list) else str(channels) if channels else 'N/A'
        
        print(f"🔍 PDF DATA DEBUG: ad_title={ad_title}, brand_name={brand_name}, brand_id={brand_id}")
        print(f"🔍 PDF METADATA DEBUG: funnel_stage={funnel_stage}, message_intent={message_intent}, channels={channel_str}")
        
        # Extract AI results and additional metadata (like Details HTML page does)
        ai_results = analysis_data.get('ai_analysis_results', {})
        comprehensive_analysis = ai_results.get('comprehensive-analysis', {})
        classification = 'N/A'
        emotional_tone = 'N/A'
        
        if comprehensive_analysis and isinstance(comprehensive_analysis, dict):
            results = comprehensive_analysis.get('data', {}).get('results', {})
            metaphor_analysis = results.get('metaphor_analysis', {})
            if metaphor_analysis and isinstance(metaphor_analysis, dict):
                # Get classification from funnel compatibility
                funnel_compat = metaphor_analysis.get('funnel_compatibility', {})
                if funnel_compat and isinstance(funnel_compat, dict):
                    classification = funnel_compat.get('classification', 'N/A')
                # Get emotional tone from message intent
                message_intent_data = metaphor_analysis.get('message_intent', {})
                if message_intent_data and isinstance(message_intent_data, dict):
                    emotional_tone = message_intent_data.get('emotional_tone', 'N/A')
        
        # Create styles for table cell text (enables automatic text wrapping)
        cell_style = ParagraphStyle(
            'TableCell',
            parent=styles['Normal'],
            fontSize=10,
            textColor=colors.HexColor('#1f2937'),
            fontName='Helvetica',
            leading=14  # Line height for wrapped text
        )
        
        label_style = ParagraphStyle(
            'TableLabel',
            parent=styles['Normal'],
            fontSize=10,
            textColor=colors.HexColor('#374151'),
            fontName='Helvetica-Bold',
            leading=14
        )
        
        # Use Paragraph objects for automatic text wrapping in table cells
        # Build info_data conditionally based on selected features
        info_data = [
            [Paragraph('Title:', label_style), Paragraph(str(ad_title), cell_style)],
            [Paragraph('Brand:', label_style), Paragraph(str(brand_name), cell_style)],
            [Paragraph('Brand ID:', label_style), Paragraph(str(brand_id), cell_style)]
        ]
        
        # Only show Funnel Stage and Classification if funnel_compatibility is selected (for Lite users)
        if should_show_card_pdf('funnelCompatibility', user_plan_type, selected_features):
            info_data.append([Paragraph('Funnel Stage:', label_style), Paragraph(str(funnel_stage), cell_style)])
            info_data.append([Paragraph('Classification:', label_style), Paragraph(str(classification), cell_style)])
        
        # Continue with other fields
        info_data.extend([
            [Paragraph('Message Intent:', label_style), Paragraph(str(message_intent), cell_style)],
            [Paragraph('Emotional Tone:', label_style), Paragraph(str(emotional_tone), cell_style)],
            [Paragraph('Channels:', label_style), Paragraph(str(channel_str), cell_style)],
            [Paragraph('Analysis ID:', label_style), Paragraph(str(analysis_id), cell_style)],
            [Paragraph('Generated:', label_style), Paragraph(datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC'), cell_style)]
        ])
        
        # Enhanced info table design (no purple font, better spacing)
        info_table = Table(info_data, colWidths=[1.8*inch, 4.2*inch])
        info_table.setStyle(TableStyle([
            # Background styling
            ('BACKGROUND', (0, 0), (-1, -1), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            
            # Font styling
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            
            # Colors (no purple font)
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#374151')),  # Dark gray for labels
            ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#1f2937')),  # Darker gray for values
            
            # Extra padding for long text like message intent
            ('LEFTPADDING', (0, 0), (-1, -1), 15),
            ('RIGHTPADDING', (0, 0), (-1, -1), 15),
            ('TOPPADDING', (0, 0), (-1, -1), 12),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            
            # Clean borders
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#dee2e6')),
            ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.HexColor('#f8f9fa'), colors.white])
        ]))
        
        story.append(info_table)
        story.append(Spacer(1, 25))
        
        # Add page break before analysis results to ensure they start on a new page
        from reportlab.platypus import PageBreak
        story.append(PageBreak())
        
        # Add analyzed media (image or video thumbnail) if available
        media_url = (analysis_data.get('mediaUrl') or analysis_data.get('media_url'))
        print(f"🔍 PDF MEDIA DEBUG: mediaUrl found = {bool(media_url)}")
        print(f"🔍 PDF MEDIA DEBUG: mediaUrl = {str(media_url)[:100] if media_url else 'None'}")
        if media_url:
            try:
                image_buffer = None
                media_type = "image"
                
                if media_url.startswith('data:image/'):
                    # Handle base64 data URLs (images)
                    header, data = media_url.split(',', 1)
                    image_data = base64.b64decode(data)
                    image_buffer = io.BytesIO(image_data)
                    media_type = "image"
                elif media_url.startswith('data:video/'):
                    # Handle base64 video URLs - show placeholder
                    print(f"🎬 PDF: Video detected, creating thumbnail...")
                    media_type = "video"
                    image_buffer = None
                elif media_url.startswith('http'):
                    # Handle GCS URLs - download the media
                    import requests
                    print(f"🔍 PDF: Downloading media from GCS URL")
                    response = requests.get(media_url, timeout=10)
                    if response.status_code == 200:
                        content_type = response.headers.get('content-type', '')
                        if content_type.startswith('video/'):
                            media_type = "video"
                            print(f"🎬 PDF: Video file detected from GCS")
                            image_buffer = None
                        else:
                            media_type = "image"
                            image_buffer = io.BytesIO(response.content)
                            print(f"✅ PDF: Downloaded image from GCS ({len(response.content)} bytes)")
                    else:
                        print(f"⚠️ PDF: Failed to download media, status: {response.status_code}")
                        image_buffer = None
                else:
                    print(f"⚠️ PDF: Unsupported media URL format")
                    image_buffer = None
                
                # Add media section to PDF
                if media_type == "video":
                    story.append(Paragraph("Analyzed Video", heading_style))
                    
                    # Try to extract video thumbnail like Libraries page does
                    try:
                        print(f"🎬 PDF: Attempting to extract video thumbnail from GCS URL...")
                        
                    # Download video file temporarily to extract thumbnail
                        import tempfile
                        import cv2
                        
                    # Download video to temporary file
                        response = requests.get(media_url, timeout=30)
                        if response.status_code == 200:
                            with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as temp_video:
                                temp_video.write(response.content)
                                temp_video_path = temp_video.name
                            
                    # Extract thumbnail using OpenCV (same method as Libraries)
                            cap = cv2.VideoCapture(temp_video_path)
                            if cap.isOpened():
                                # Seek to middle of video for better thumbnail
                                total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                                middle_frame = total_frames // 2
                                cap.set(cv2.CAP_PROP_POS_FRAMES, middle_frame)

                                ret, frame = cap.read()
                                if ret:
                                    # Convert frame to JPEG
                                    import cv2
                                    _, jpeg_data = cv2.imencode('.jpg', frame)
                                    thumbnail_buffer = io.BytesIO(jpeg_data.tobytes())

                                    # Add thumbnail to PDF
                                    img = Image(thumbnail_buffer, width=4*inch, height=3*inch)
                                    story.append(img)
                                    story.append(Spacer(1, 20))
                                    print("✅ PDF: Added video thumbnail to PDF")
                                else:
                                    raise Exception("Could not extract frame")

                                cap.release()
                            else:
                                raise Exception("Could not open video file")
                            
                    # Clean up temporary file
                            import os
                            os.unlink(temp_video_path)
                        else:
                            raise Exception(f"Could not download video: {response.status_code}")
                    except Exception as thumbnail_error:
                        print(f"⚠️ PDF: Could not extract video thumbnail: {thumbnail_error}")
                    # Fallback to text placeholder
                        video_placeholder = Paragraph(
                            "<b>📹 Video Analysis</b><br/>"
                            "Video thumbnail extraction failed.<br/>"
                            "Please refer to the web interface for video preview.",
                            normal_style
                        )
                        story.append(video_placeholder)
                        story.append(Spacer(1, 20))
                        print("✅ PDF: Added video placeholder to PDF")
                elif media_type == "image" and image_buffer:
                    # Add image to PDF
                    story.append(Paragraph("Analyzed Image", heading_style))
                    try:
                        # Ensure proper image sizing while maintaining aspect ratio
                        from PIL import Image as PILImage
                        pil_img = PILImage.open(image_buffer)
                        img_width, img_height = pil_img.size
                        
                        # Calculate aspect ratio and fit within 4x3 inch bounds
                        max_width = 4 * inch
                        max_height = 3 * inch
                        aspect_ratio = img_width / img_height
                        
                        if aspect_ratio > max_width / max_height:
                            # Image is wider - fit to max width
                            pdf_width = max_width
                            pdf_height = max_width / aspect_ratio
                        else:
                            # Image is taller - fit to max height
                            pdf_height = max_height
                            pdf_width = max_height * aspect_ratio
                        
                        # Reset buffer position
                        image_buffer.seek(0)
                        img = Image(image_buffer, width=pdf_width, height=pdf_height)
                        story.append(img)
                        story.append(Spacer(1, 20))
                        print(f"✅ PDF: Added analyzed image to PDF ({pdf_width:.1f}x{pdf_height:.1f} inches)")
                    except Exception as img_error:
                        print(f"⚠️ PDF: Error processing image: {img_error}")
                        # Fallback to text placeholder
                        image_placeholder = Paragraph(
                            "<b>🖼️ Image Analysis</b><br/>"
                            "Image display failed.<br/>"
                            "Please refer to the web interface for image preview.",
                            normal_style
                        )
                        story.append(image_placeholder)
                        story.append(Spacer(1, 20))
                elif media_type == "image" and not image_buffer:
                    # Image type but no buffer - show placeholder
                    story.append(Paragraph("Analyzed Image", heading_style))
                    image_placeholder = Paragraph(
                        "<b>🖼️ Image Analysis</b><br/>"
                        "Image could not be loaded for PDF display.<br/>"
                        "Please refer to the web interface for image preview.",
                        normal_style
                    )
                    story.append(image_placeholder)
                    story.append(Spacer(1, 20))
                    print("⚠️ PDF: Added image placeholder (no buffer)")
            except Exception as e:
                print(f"⚠️ PDF: Could not add media: {str(e)}")
        else:
            print(f"⚠️ PDF: No media URL found")
        
        story.append(Spacer(1, 10))
        
        # Analysis Results
        story.append(Paragraph("ANALYSIS RESULTS", heading_style))
        
        # Use the sample_scores from unified response (same as Details HTML page)
        intent_score = sample_scores.get('intent', 0)
        funnel_score = sample_scores.get('funnel', 0)
        content_score = sample_scores.get('content', 0)
        
        print(f"🔍 PDF SAMPLE SCORES DEBUG: {sample_scores}")
        
        # Extract channel and brand compliance scores from already loaded AI results
        channel_score = 0
        brand_score = 0
        
        if comprehensive_analysis and isinstance(comprehensive_analysis, dict):
            results = comprehensive_analysis.get('data', {}).get('results', {})
            
            # Get channel compliance score - CALCULATE AVERAGE like HTML page
            channel_compliance = results.get('channel_compliance', {})
            if channel_compliance:
                # Calculate average compliance score from all platforms (same as HTML page)
                platform_scores = []
                for channel, data in channel_compliance.items():
                    if isinstance(data, dict) and 'compliance_score' in data:
                        platform_scores.append(data.get('compliance_score', 0))
                    elif isinstance(data, dict) and 'effectiveness_score' in data:
                        platform_scores.append(data.get('effectiveness_score', 0))
                # Calculate average (keep 1 decimal place)
                channel_score = round(sum(platform_scores) / len(platform_scores), 1) if platform_scores else 0
                print(f"🔍 PDF Channel Score Calculation: {platform_scores} → Average: {channel_score}")
            
            # Get brand compliance score  
            brand_compliance = results.get('brand_compliance', {})
            if brand_compliance and isinstance(brand_compliance, dict):
                # Try to get from compliance_analysis first
                compliance_analysis = brand_compliance.get('compliance_analysis', {})
                if compliance_analysis and 'final_compliance_score' in compliance_analysis:
                    brand_score = int(compliance_analysis.get('final_compliance_score', 0))
                else:
                    # Fallback to compliance_level
                    compliance_level = brand_compliance.get('compliance_level', '0%')
                    if isinstance(compliance_level, str) and '%' in compliance_level:
                        try:
                            brand_score = int(compliance_level.replace('%', ''))
                        except Exception:
                            brand_score = 0
                    elif isinstance(compliance_level, (int, float)):
                        brand_score = int(compliance_level)
        
            print(f"🔍 PDF SCORES DEBUG: intent={intent_score}, funnel={funnel_score}, content={content_score}, channel={channel_score}, brand={brand_score}")
            print(f"🔍 PDF SCORES TYPES: intent={type(intent_score)}, funnel={type(funnel_score)}, content={type(content_score)}")
        
        # Score cards - all 5 metrics with plan-based filtering
        # Build score data with plan-based filtering (same logic as HTML and React)
        score_data = [['Metric', 'Score', 'Status']]
        
        # Apply plan-based filtering to each card
        print(f"🔍 PDF FILTER DEBUG: user_plan_type='{user_plan_type}', selected_features={selected_features}")
        
        if should_show_card_pdf('messagingIntent', user_plan_type, selected_features):
            score_data.append(['Message Intent', f"{intent_score}%", 'Good' if intent_score >= 70 else 'Needs Improvement'])
            print(f"🔍 PDF FILTER: Including Message Intent card")
        else:
            print(f"🔍 PDF FILTER: Skipping Message Intent card - not in selected features for Lite user")
            
        if should_show_card_pdf('funnelCompatibility', user_plan_type, selected_features):
            print(f"🔍 PDF DEBUG: Adding Funnel Compatibility with score: {funnel_score} (type: {type(funnel_score)})")
            funnel_row = ['Funnel Compatibility', f"{funnel_score}%", 'Good' if funnel_score >= 70 else 'Needs Improvement']
            print(f"🔍 PDF DEBUG: Funnel row data: {funnel_row}")
            score_data.append(funnel_row)
            print(f"🔍 PDF FILTER: Including Funnel Compatibility card")
        else:
            print(f"🔍 PDF FILTER: Skipping Funnel Compatibility card - not in selected features for Lite user")
        
        # Special debugging for Purchase Intent
        purchase_intent_should_show = should_show_card_pdf('purchaseIntent', user_plan_type, selected_features)
        print(f"🔍 PDF PURCHASE INTENT DEBUG: should_show={purchase_intent_should_show}")
        print(f"🔍 PDF PURCHASE INTENT DEBUG: user_plan_type='{user_plan_type}'")
        print(f"🔍 PDF PURCHASE INTENT DEBUG: 'resonance_index' in selected_features = {'resonance_index' in selected_features if selected_features else 'selected_features is None/empty'}")
        print(f"🔍 PDF PURCHASE INTENT DEBUG: selected_features = {selected_features}")
        
        if purchase_intent_should_show:
            score_data.append(['Purchase Intent', f"{content_score}%", 'Good' if content_score >= 70 else 'Needs Improvement'])
            print(f"🔍 PDF FILTER: Including Purchase Intent card")
        else:
            print(f"🔍 PDF FILTER: Skipping Purchase Intent (Content Analysis) card - not in selected features for Lite user")
        
        if should_show_card_pdf('channelCompliance', user_plan_type, selected_features):
            score_data.append(['Channel Compliance', f"{channel_score}%", 'Good' if channel_score >= 70 else 'Needs Improvement'])
            print(f"🔍 PDF FILTER: Including Channel Compliance card")
        else:
            print(f"🔍 PDF FILTER: Skipping Channel Compliance card - not in selected features for Lite user")
            
        if should_show_card_pdf('brandCompliance', user_plan_type, selected_features):
            score_data.append(['Brand Compliance', f"{brand_score}%", 'Good' if brand_score >= 70 else 'Needs Improvement'])
            print(f"🔍 PDF FILTER: Including Brand Compliance card")
        else:
            print(f"🔍 PDF FILTER: Skipping Brand Compliance card - not in selected features for Lite user")
        
        # Calculate Overall Score based ONLY on scores from SHOWN cards (respects selectedFeatures)
        # This ensures Lite users get average of only their selected 4 features
        shown_scores = []
        shown_score_names = []
        
        if should_show_card_pdf('messagingIntent', user_plan_type, selected_features) and intent_score > 0:
            shown_scores.append(intent_score)
            shown_score_names.append(f"Message Intent: {intent_score}%")
            
        if should_show_card_pdf('funnelCompatibility', user_plan_type, selected_features) and funnel_score > 0:
            shown_scores.append(funnel_score)
            shown_score_names.append(f"Funnel: {funnel_score}%")
            
        if should_show_card_pdf('purchaseIntent', user_plan_type, selected_features) and content_score > 0:
            shown_scores.append(content_score)
            shown_score_names.append(f"Purchase Intent: {content_score}%")
            
        if should_show_card_pdf('channelCompliance', user_plan_type, selected_features) and channel_score > 0:
            shown_scores.append(channel_score)
            shown_score_names.append(f"Channel: {channel_score}%")
            
        if should_show_card_pdf('brandCompliance', user_plan_type, selected_features) and brand_score > 0:
            shown_scores.append(brand_score)
            shown_score_names.append(f"Brand: {brand_score}%")
        
        # Calculate average from ONLY the shown scores (keep 2 decimal places)
        if shown_scores:
            overall_score = round(sum(shown_scores) / len(shown_scores), 2)
        else:
            overall_score = 0.00
            
        print(f"🔍 PDF Overall Score Calculation (SHOWN SCORES ONLY):")
        print(f"   Scores included: {shown_score_names}")
        print(f"   Sum: {sum(shown_scores) if shown_scores else 0}, Count: {len(shown_scores)}")
        print(f"   Average: {overall_score:.2f}%")
        
        # Add Overall Score as the last row (formatted to 2 decimal places)
        score_data.append(['Overall Score', f"{overall_score:.2f}%", 'Excellent' if overall_score >= 85 else 'Good' if overall_score >= 70 else 'Needs Improvement'])

        print(f"🔍 PDF DEBUG: Final score_data array with Overall Score: {score_data}")
        score_table = Table(score_data, colWidths=[2*inch, 1*inch, 2*inch])
        # Calculate last row index for Overall Score highlighting
        last_row = len(score_data) - 1
        
        score_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f4f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#1f2937')),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e5e7eb')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            # Highlight Overall Score row
            ('BACKGROUND', (0, last_row), (-1, last_row), colors.HexColor('#e0f2fe')),
            ('FONTNAME', (0, last_row), (-1, last_row), 'Helvetica-Bold'),
            ('FONTSIZE', (0, last_row), (-1, last_row), 11),
            ]))
        
        # Use KeepTogether to prevent score table from breaking across pages
        from reportlab.platypus import KeepTogether
        score_section = KeepTogether([score_table, Spacer(1, 30)])
        story.append(score_section)
        
        # Detailed Analysis Breakdown
        ai_results = analysis_data.get('ai_analysis_results', {})
        comprehensive_analysis = ai_results.get('comprehensive-analysis', {})
        if comprehensive_analysis and isinstance(comprehensive_analysis, dict):
            results = comprehensive_analysis.get('data', {}).get('results', {})
            
            # Message Intent Analysis - Apply plan-based filtering
            metaphor_analysis = results.get('metaphor_analysis', {})
            if metaphor_analysis and isinstance(metaphor_analysis, dict) and should_show_card_pdf('messagingIntent', user_plan_type, selected_features):
                # Add page break before detailed sections to prevent breaking
                story.append(PageBreak())
                story.append(Paragraph("MESSAGE INTENT ANALYSIS", heading_style))
                
                message_intent = metaphor_analysis.get('message_intent', {})
                if message_intent and isinstance(message_intent, dict):
                    emotional_tone = message_intent.get('emotional_tone', 'N/A')
                    core_message = message_intent.get('core_message_summary', 'N/A')
                    intent_score = message_intent.get('intent_compliance_score', 'N/A')
                    
                    story.append(Paragraph(f"<b>Intent Compliance Score:</b> {intent_score}%", normal_style))
                    story.append(Paragraph(f"<b>Emotional Tone:</b> {emotional_tone}", normal_style))
                    
                    # Format core message with proper line breaks and full content
                    if core_message and core_message != 'N/A':
                        # Split long text into multiple paragraphs for better readability
                        if len(core_message) > 200:
                            # Split at sentence boundaries
                            sentences = core_message.split('. ')
                            story.append(Paragraph("<b>Core Message Summary:</b>", normal_style))
                            for sentence in sentences:
                                if sentence.strip():
                                    clean_sentence = sentence.strip()
                                    if not clean_sentence.endswith('.'):
                                        clean_sentence += '.'
                                    story.append(Paragraph(f"- {clean_sentence}", normal_style))
                        else:
                            story.append(Paragraph(f"<b>Core Message Summary:</b> {core_message}", normal_style))
                    else:
                        story.append(Paragraph(f"<b>Core Message Summary:</b> {core_message}", normal_style))
                
            story.append(Spacer(1, 20))
                
            # Funnel Compatibility - Apply plan-based filtering
            if metaphor_analysis and isinstance(metaphor_analysis, dict) and should_show_card_pdf('funnelCompatibility', user_plan_type, selected_features):
                funnel_compat = metaphor_analysis.get('funnel_compatibility', {})
                if funnel_compat and isinstance(funnel_compat, dict):
                    story.append(Paragraph("FUNNEL COMPATIBILITY", heading_style))
                    
                    effectiveness = funnel_compat.get('effectiveness_score', 'N/A')
                    classification = funnel_compat.get('classification', 'N/A')
                    reasoning = funnel_compat.get('reasoning', 'N/A')
                    improvement = funnel_compat.get('improvement_suggestion', 'N/A')
                    
                    story.append(Paragraph(f"<b>Effectiveness Score:</b> {effectiveness}%", normal_style))
                    story.append(Paragraph(f"<b>Classification:</b> {classification}", normal_style))
                    
                    # Format reasoning with proper line breaks
                    if reasoning and reasoning != 'N/A' and len(reasoning) > 100:
                        story.append(Paragraph("<b>Reasoning:</b>", normal_style))
                        story.append(Paragraph(reasoning, normal_style))
                    else:
                        story.append(Paragraph(f"<b>Reasoning:</b> {reasoning}", normal_style))
                    
                    # Format improvement suggestion with proper line breaks
                    if improvement and improvement != 'N/A' and len(improvement) > 100:
                        story.append(Paragraph("<b>Improvement Suggestions:</b>", normal_style))
                        story.append(Paragraph(improvement, normal_style))
                    else:
                        story.append(Paragraph(f"<b>Improvement Suggestions:</b> {improvement}", normal_style))
                
            story.append(Spacer(1, 20))
            
            # Content Analysis (includes Purchase Intent) - Apply plan-based filtering
            content_analysis = results.get('content_analysis', {})
            content_should_show = should_show_card_pdf('purchaseIntent', user_plan_type, selected_features)
            print(f"🔍 PDF DETAILED CONTENT DEBUG: content_analysis exists={bool(content_analysis)}, should_show={content_should_show}")
            if content_analysis and isinstance(content_analysis, dict) and content_should_show:
                story.append(Paragraph("PURCHASE INTENT ANALYSIS", heading_style))
                    
                overall_score = content_analysis.get('overall_purchase_intent_percentage', 'N/A')
                resonating_impact = content_analysis.get('resonating_impact', 'N/A')
                reason = content_analysis.get('reason', 'N/A')
                    
                # Format overall_score to 2 decimal places if it's a number
                if isinstance(overall_score, (int, float)):
                    overall_score_formatted = f"{overall_score:.2f}"
                else:
                    overall_score_formatted = str(overall_score)
                story.append(Paragraph(f"<b>Overall Purchase Intent:</b> {overall_score_formatted}%", normal_style))
                story.append(Paragraph(f"<b>Resonating Impact:</b> {resonating_impact}", normal_style))
                    
                    # Purchase Intent Breakdown
                purchase_scores = content_analysis.get('purchase_intent_scores', {})
                if purchase_scores and isinstance(purchase_scores, dict):
                    story.append(Spacer(1, 10))
                    story.append(Paragraph("<b>Purchase Intent Breakdown:</b>", normal_style))
                        
                    for metric, data in purchase_scores.items():
                        if isinstance(data, dict):
                            # Fix CTA Strength capitalization
                            metric_name = metric.replace('_', ' ').title()
                            if 'cta' in metric.lower():
                                metric_name = metric_name.replace('Cta', 'CTA')
                            percentage = data.get('percentage', 'N/A')
                            score = data.get('score', 'N/A')
                            reason = data.get('reason', data.get('description', 'N/A'))
                                
                            # Clean reason by removing redundant metric name repetition
                            clean_reason = reason
                            if reason and reason != 'N/A':
                                # Remove redundant text patterns
                                patterns_to_remove = [
                                    'Visual or verbal CTA strength - ',
                                    'Emotional appeal - ',
                                    'Relevance - ',
                                    'Message clarity - ',
                                    'Use of psychological or persuasive triggers - '
                                ]
                                    
                            for pattern in patterns_to_remove:
                                    if clean_reason.startswith(pattern):
                                        clean_reason = clean_reason[len(pattern):]
                                    break
                                
                            story.append(Paragraph(f"- <b>{metric_name}:</b> {percentage}%", normal_style))
                            if clean_reason and clean_reason != 'N/A' and clean_reason != 'No specific reason provided':
                                story.append(Paragraph(f"  <i>Reasoning:</i> {clean_reason}", normal_style))
                            story.append(Spacer(1, 5))
                    
            story.append(Spacer(1, 20))
            
            # Channel Compliance - Apply plan-based filtering
            channel_compliance = results.get('channel_compliance', {})
            if channel_compliance and isinstance(channel_compliance, dict) and should_show_card_pdf('channelCompliance', user_plan_type, selected_features):
                story.append(Paragraph("CHANNEL COMPLIANCE", heading_style))
                
                for channel, data in channel_compliance.items():
                    if isinstance(data, dict):
                        story.append(Paragraph(f"<b>{channel.upper()}:</b>", normal_style))
                        
                    # Extract and format guideline results
                        guideline_results = data.get('guideline_results', [])
                        if guideline_results and isinstance(guideline_results, list):
                            story.append(Paragraph("<b>Guideline Results:</b>", normal_style))
                            for i, guideline in enumerate(guideline_results, 1):
                                if isinstance(guideline, dict):
                                    guideline_text = guideline.get('guideline', 'N/A')
                                    expected_answer = guideline.get('expected_answer', 'N/A')
                                    actual_output = guideline.get('actual_output', 'N/A')
                                    matched_score = guideline.get('matched_score', 'N/A')
                                    reason = guideline.get('reason', '')
                                    story.append(Paragraph(f"<b>Guideline {i}:</b> {guideline_text}", normal_style))
                                    story.append(Paragraph(f"- Answer: {actual_output}", normal_style))
                                    
                    # Include reasoning if available and there's a mismatch or detailed explanation
                                    if reason and reason.strip():
                                        story.append(Paragraph(f"- Reasoning: {reason}", normal_style))
                                    story.append(Spacer(1, 6))
                        
                    # Extract compliance metrics
                        compliance_score = data.get('compliance_score', 'N/A')
                        compliance_percentage = data.get('compliance_percentage', 'N/A')
                        total_matched_scores = data.get('total_matched_scores', 'N/A')
                        total_guidelines = data.get('total_guidelines', 'N/A')
                        
                        story.append(Paragraph(f"<b>Compliance Score:</b> {compliance_score}", normal_style))
                        compliance_pct_display = compliance_percentage if str(compliance_percentage).endswith('%') else f"{compliance_percentage}%"
                        story.append(Paragraph(f"<b>Compliance Percentage:</b> {compliance_pct_display}", normal_style))
                        story.append(Paragraph(f"<b>Guidelines Passed:</b> {total_matched_scores} out of {total_guidelines}", normal_style))
                        
                        story.append(Spacer(1, 15))

                story.append(Spacer(1, 20))
            
            # Brand Compliance - Apply plan-based filtering
            brand_compliance = results.get('brand_compliance', {})
            if brand_compliance and isinstance(brand_compliance, dict) and should_show_card_pdf('brandCompliance', user_plan_type, selected_features):
                story.append(Paragraph("BRAND COMPLIANCE", heading_style))
                
                compliance_level = brand_compliance.get('compliance_level', 'N/A')
                tone_of_voice = brand_compliance.get('tone_of_voice', 'N/A')
                brand_colors = brand_compliance.get('brand_colors', 'N/A')
                
                story.append(Paragraph(f"<b>Compliance Level:</b> {compliance_level}", normal_style))
                story.append(Paragraph(f"<b>Tone of Voice:</b> {tone_of_voice}", normal_style))
                story.append(Paragraph(f"<b>Brand Colors:</b> {brand_colors}", normal_style))
                
                compliance_analysis = brand_compliance.get('compliance_analysis', {})
                if compliance_analysis and isinstance(compliance_analysis, dict):
                    story.append(Spacer(1, 10))
                    story.append(Paragraph("<b>Brand Compliance Details:</b>", normal_style))
                    
                    # Extract specific meaningful fields, avoid raw LLM data
                    final_score = compliance_analysis.get('final_compliance_score', 'N/A')
                    questions = compliance_analysis.get('questions', [])
                    llm_answers = compliance_analysis.get('llm_answers', [])
                    
                    story.append(Paragraph(f"- <b>Final Compliance Score:</b> {final_score}%", normal_style))
                    
                    # Show Q&A in user-friendly format instead of raw LLM answers
                    if questions and llm_answers and len(questions) == len(llm_answers):
                        story.append(Paragraph("<b>Brand Guidelines Assessment:</b>", normal_style))
                        for i, (question, answer) in enumerate(zip(questions, llm_answers), 1):
                            clean_question = question.replace('?', '').strip()
                            status = "Yes" if answer.lower() == 'yes' else "No"
                            story.append(Paragraph(f"- {clean_question}: {status}", normal_style))
                
            story.append(Spacer(1, 15))
        
        # Build PDF
        doc.build(story)
        buffer.seek(0)
        
        print(f"✅ PDF DOWNLOAD: Generated PDF successfully for {ad_title}")
        
        # Return as streaming response
        return StreamingResponse(
            io.BytesIO(buffer.read()),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={ad_title}_Analysis_Report.pdf"}
        )
        
    except Exception as e:
        print(f"❌ PDF DOWNLOAD ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")

# REMOVED: /regenerate-pdf-url - Unused endpoint

@app.get("/get-user-files/{userId}")
async def get_user_files(userId: str, fileCategory: Optional[str] = Query(None), analysisId: Optional[str] = Query(None), limit: Optional[int] = Query(50)):
    """
    Get all files for a user with signed URLs
    Optionally filter by file category (e.g., 'analysis-report', 'brand-media', 'uploaded_ad')
    """
    try:
        # Build query
        query = db.collection("userFiles").where("userId", "==", userId)
        
        if fileCategory:
            query = query.where("fileCategory", "==", fileCategory)
        
        if analysisId:
            query = query.where("analysisId", "==", analysisId)
        
        # Execute query with limit
        if limit and limit > 0:
            query = query.limit(limit)
        
        docs = query.stream()
        files = []
        
        for doc in docs:
            file_data = doc.to_dict()
            file_data["id"] = doc.id
            
            # Generate fresh signed URL for each file
            storage_path = file_data.get("storagePath", "")
            if storage_path:
                try:
                    blob = bucket.blob(storage_path)
                    if blob.exists():
                        url = generate_secure_signed_url(blob)
                        file_data["url"] = url
                    else:
                        file_data["url"] = None
                        file_data["error"] = "File not found in storage"
                except Exception as e:
                    file_data["url"] = None
                    file_data["error"] = f"Error generating URL: {str(e)}"
            
            # **FIX**: Filter out PDF-only records that interfere with analysis lookup
            # Skip records that are just PDF files without proper analysis data
            if fileCategory == "analysis-report":
                # Skip if it's a PDF file with timestamp-based analysisId (these are PDF uploads, not analyses)
                analysis_id = file_data.get("analysisId", "")
                file_name = file_data.get("fileName", "")
                
            # Skip PDF files that don't represent actual analyses
                if (analysis_id.startswith("analysis_") and
                    file_name.endswith(".pdf") and
                    not file_name.startswith("Analysis -")):
                    print(f"🚫 Skipping PDF-only record: {file_name} (ID: {analysis_id})")
                    continue
            
            files.append(file_data)
        return {
            "userId": userId,
            "count": len(files),
            "files": files
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching user files: {str(e)}")

# REMOVED: /create-std-plan-details - Unused admin endpoint

@app.delete("/delete-user-file/{file_id}")
async def delete_user_file(file_id: str):
    """
    Delete a user file by its document ID.
    OPTIMIZED: Uses parallel operations for fast deletion (<1 second).
    """
    try:
        print(f"🗑️ Fast delete for: {file_id}")
        
        deleted_from = []
        storage_paths = set()
        file_name = "Unknown"
        docs_to_delete = []
        
        # ========================================
        # STEP 1: PARALLEL FETCH - Get all docs at once
        # ========================================
        # Direct document lookups (fast)
        userfile_ref = db.collection("userFiles").document(file_id)
        analysis_ref = db.collection("user_analysis").document(file_id)
        
        # Run both gets in parallel using asyncio
        loop = asyncio.get_event_loop()
        userfile_doc, analysis_doc = await asyncio.gather(
            loop.run_in_executor(None, userfile_ref.get),
            loop.run_in_executor(None, analysis_ref.get)
        )
        
        linked_analysis_id = None
        
        # Process userFiles doc
        if userfile_doc.exists:
            data = userfile_doc.to_dict()
            file_name = data.get("fileName") or file_name
            if data.get("storagePath"):
                storage_paths.add(data["storagePath"])
            linked_analysis_id = data.get("analysisId")
            docs_to_delete.append(("userFiles", userfile_ref))
        
        # Process user_analysis doc
        if analysis_doc.exists:
            data = analysis_doc.to_dict()
            file_name = data.get("adTitle") or data.get("fileName") or file_name
            for key in ["storagePath", "mediaStoragePath", "pdfStoragePath"]:
                if data.get(key):
                    storage_paths.add(data[key])
            docs_to_delete.append(("user_analysis", analysis_ref))
        
        # If we found a linked analysisId, also fetch that
        if linked_analysis_id and linked_analysis_id != file_id:
            linked_ref = db.collection("user_analysis").document(linked_analysis_id)
            linked_doc = await loop.run_in_executor(None, linked_ref.get)
            if linked_doc.exists:
                data = linked_doc.to_dict()
                file_name = data.get("adTitle") or file_name
                for key in ["storagePath", "mediaStoragePath", "pdfStoragePath"]:
                    if data.get(key):
                        storage_paths.add(data[key])
                docs_to_delete.append(("user_analysis_linked", linked_ref))
        
        # Quick query for userFiles by analysisId (if not already found)
        if not userfile_doc.exists:
            query = db.collection("userFiles").where("analysisId", "==", file_id).limit(5)
            query_docs = await loop.run_in_executor(None, lambda: list(query.stream()))
            for doc in query_docs:
                data = doc.to_dict()
                if data.get("storagePath"):
                    storage_paths.add(data["storagePath"])
                docs_to_delete.append(("userFiles_query", doc.reference))
        
        # ========================================
        # STEP 2: PARALLEL DELETE - Delete all at once
        # ========================================
        if not docs_to_delete:
            raise HTTPException(status_code=404, detail=f"File not found: {file_id}")
        
        # Delete all Firestore docs in parallel
        async def delete_doc(name, ref):
            await loop.run_in_executor(None, ref.delete)
            return name
        
        delete_tasks = [delete_doc(name, ref) for name, ref in docs_to_delete]
        deleted_names = await asyncio.gather(*delete_tasks)
        deleted_from = list(deleted_names)
        
        # Delete storage files in parallel (no exists check - just try to delete)
        storage_deleted = 0
        async def delete_blob(path):
            try:
                blob = bucket.blob(path)
                await loop.run_in_executor(None, blob.delete)
                return True
            except Exception:
                return False
        
        if storage_paths:
            results = await asyncio.gather(*[delete_blob(p) for p in storage_paths])
            storage_deleted = sum(1 for r in results if r)
        
        print(f"✅ Deleted: {deleted_from}, Storage: {storage_deleted}")
        
        return {
            "success": True,
            "message": "File deleted",
            "file_id": file_id,
            "file_name": file_name,
            "deleted_from": deleted_from,
            "storage_deleted": storage_deleted
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error deleting user file: {str(e)}")
        import traceback
        print(f"❌ Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")

# REMOVED: /generate-analysis-pdf - Unused endpoint (PDF generated automatically by middleware after analysis)
# Function body removed (~600 lines) - PDF generation happens automatically in postAnalysisDetailsFormData
# NOTE: /download-analysis-pdf/{analysis_id} is the ACTIVE endpoint used for PDF downloads

# REMOVED: First duplicate /get-unified-analysis-data endpoint (kept the more complete version below)

# REMOVED: /check-analysis-scores/{analysis_id} - Unused deprecated endpoint

@app.get("/get-valid-analysis-id/{user_id}")
async def get_valid_analysis_id(user_id: str):
    """Get a valid analysis ID with real scores for the user"""
    try:
        print(f"🔍 Finding valid analysis ID for user: {user_id}")
        
        # Query user_analysis collection for records with real scores
        user_analysis_query = db.collection("user_analysis").where("userId", "==", user_id)
        user_analysis_docs = list(user_analysis_query.stream())
        
        # Find the first record with real scores
        for doc in user_analysis_docs:
            data = doc.to_dict()
            ai_results = data.get('ai_analysis_results', {})
            # Check if it has real scores
            if 'metaphor_analysis' in ai_results:
                intent_score = ai_results['metaphor_analysis'].get('message_intent', {}).get('intent_compliance_score', 0)
                if intent_score > 0:
                    print(f"✅ Found valid analysis ID: {doc.id} with score: {intent_score}")
                    return {
                        "success": True,
                        "analysis_id": doc.id,
                        "has_real_scores": True
                    }
            
            # Also check comprehensive-analysis format
            if 'comprehensive-analysis' in ai_results:
                comp_analysis = ai_results['comprehensive-analysis']
                if isinstance(comp_analysis, dict) and comp_analysis.get('success'):
                    comp_data = comp_analysis.get('data', {})
                    comp_results = comp_data.get('results', {})
                    if 'metaphor_analysis' in comp_results:
                        intent_score = comp_results['metaphor_analysis'].get('message_intent', {}).get('intent_compliance_score', 0)
                        if intent_score > 0:
                            print(f"✅ Found valid analysis ID: {doc.id} with score: {intent_score}")
                            return {
                                "success": True,
                                "analysis_id": doc.id,
                                "has_real_scores": True
                            }
        
        # If no valid analysis found
        return {
            "success": False,
            "error": "No analysis with real scores found for this user"
        }
        
    except Exception as e:
        print(f"❌ Error finding valid analysis ID: {str(e)}")
        return {"success": False, "error": str(e)}

# REMOVED: /generate-analysis-pdf - Unused endpoint (PDF generated automatically by middleware after analysis)
# Function body removed (~600 lines) - PDF generation happens automatically in postAnalysisDetailsFormData

@app.get("/get-unified-analysis-data/{analysis_id}")
async def get_unified_analysis_data(analysis_id: str):
    """UNIFIED ENDPOINT: Get analysis data with guaranteed real scores from any source"""
    try:
        print(f"🎯 UNIFIED: Getting analysis data for ID: {analysis_id}")
        
        analysis_data = None
        data_source = "unknown"
        
        # STEP 1: Try user_analysis collection first
        doc_ref = db.collection("user_analysis").document(analysis_id)
        doc = doc_ref.get()
        
        if doc.exists:
            analysis_data = doc.to_dict()
            data_source = "user_analysis"
            print(f"✅ Found in user_analysis collection")
        else:
            print(f"🔍 Not found in user_analysis, checking userFiles...")
            
            # STEP 2: Check userFiles collection
            userfiles_query = db.collection("userFiles").where("analysisId", "==", analysis_id).limit(1)
            userfiles_results = list(userfiles_query.stream())
            
            if userfiles_results:
                userfile_doc = userfiles_results[0]
                userfile_data = userfile_doc.to_dict()
                analysis_data = transform_userfiles_to_user_analysis(userfile_data, analysis_id)
                data_source = "userFiles_transformed"
                print(f"✅ Found in userFiles and transformed")
            else:
                print(f"❌ Analysis not found in any collection")
                return {"success": False, "error": "Analysis not found in any collection"}
        
        if not analysis_data:
            return {"success": False, "error": "Could not retrieve analysis data"}
        
        # STEP 3: Validate and ensure real scores
        ai_results = analysis_data.get('ai_analysis_results', {})
        has_real_scores = False
        sample_scores = {}

        # Check all analysis types for real scores - BOTH direct and comprehensive-analysis formats

        # Check direct format first
        if 'metaphor_analysis' in ai_results:
            metaphor = ai_results['metaphor_analysis']
            if isinstance(metaphor, dict):
                intent_score = metaphor.get('message_intent', {}).get('intent_compliance_score', 0)
                funnel_score = metaphor.get('funnel_compatibility', {}).get('effectiveness_score', 0)
                if intent_score > 0 or funnel_score > 0:
                    has_real_scores = True
                    sample_scores['intent'] = intent_score
                    sample_scores['funnel'] = funnel_score

        if 'content_analysis' in ai_results:
            content = ai_results['content_analysis']
            if isinstance(content, dict):
                purchase_score = content.get('overall_purchase_intent_percentage', 0)
                if purchase_score > 0:
                    has_real_scores = True
                    sample_scores['content'] = purchase_score

        # Check comprehensive-analysis format (for newer analyses)
        if 'comprehensive-analysis' in ai_results:
            comp_analysis = ai_results['comprehensive-analysis']
            if isinstance(comp_analysis, dict) and comp_analysis.get('success'):
                comp_data = comp_analysis.get('data', {})
                comp_results = comp_data.get('results', {})

                if 'metaphor_analysis' in comp_results:
                    metaphor = comp_results['metaphor_analysis']
                    if isinstance(metaphor, dict):
                        intent_score = metaphor.get('message_intent', {}).get('intent_compliance_score', 0)
                        funnel_score = metaphor.get('funnel_compatibility', {}).get('effectiveness_score', 0)
                        if intent_score > 0 or funnel_score > 0:
                            has_real_scores = True
                            sample_scores['intent'] = intent_score
                            sample_scores['funnel'] = funnel_score

                if 'content_analysis' in comp_results:
                    content = comp_results['content_analysis']
                    if isinstance(content, dict):
                        purchase_score = content.get('overall_purchase_intent_percentage', 0)
                        if purchase_score > 0:
                            has_real_scores = True
                            sample_scores['content'] = purchase_score

        # STEP 4: Smart redirect - if no real scores, find the correct analysis with real scores for same ad
        if not has_real_scores:
            print(f"⚠️ Analysis {analysis_id} has no real scores, searching for correct version...")
            user_id = analysis_data.get('userId')
            ad_title = analysis_data.get('adTitle', 'Unknown')

            if user_id and ad_title != 'Unknown':
                # **REVERT**: Only redirect for same ad title to avoid showing wrong results
                user_analysis_query = db.collection("user_analysis").where("userId", "==", user_id)
                user_docs = list(user_analysis_query.stream())

                for alt_doc in user_docs:
                    alt_data = alt_doc.to_dict()
                    alt_title = alt_data.get('adTitle', '')

                    # **REVERT**: Only redirect if it's the same ad (same title)
                    if alt_title == ad_title:
                        alt_ai_results = alt_data.get('ai_analysis_results', {})

                        # Check direct format
                        alt_has_real_scores = False
                        alt_sample_scores = {}

                        if 'metaphor_analysis' in alt_ai_results:
                            metaphor = alt_ai_results['metaphor_analysis']
                            if isinstance(metaphor, dict):
                                intent_score = metaphor.get('message_intent', {}).get('intent_compliance_score', 0)
                                funnel_score = metaphor.get('funnel_compatibility', {}).get('effectiveness_score', 0)
                                if intent_score > 0 or funnel_score > 0:
                                    alt_has_real_scores = True
                                    alt_sample_scores['intent'] = intent_score
                                    alt_sample_scores['funnel'] = funnel_score

                        if 'content_analysis' in alt_ai_results:
                            content = alt_ai_results['content_analysis']
                            if isinstance(content, dict):
                                purchase_score = content.get('overall_purchase_intent_percentage', 0)
                                if purchase_score > 0:
                                    alt_has_real_scores = True
                                    alt_sample_scores['content'] = purchase_score

                        # Check comprehensive-analysis format
                        if 'comprehensive-analysis' in alt_ai_results:
                            comp_analysis = alt_ai_results['comprehensive-analysis']
                            if isinstance(comp_analysis, dict) and comp_analysis.get('success'):
                                comp_data = comp_analysis.get('data', {})
                                comp_results = comp_data.get('results', {})

                                if 'metaphor_analysis' in comp_results:
                                    metaphor = comp_results['metaphor_analysis']
                                    if isinstance(metaphor, dict):
                                        intent_score = metaphor.get('message_intent', {}).get('intent_compliance_score', 0)
                                        funnel_score = metaphor.get('funnel_compatibility', {}).get('effectiveness_score', 0)
                                        if intent_score > 0 or funnel_score > 0:
                                            alt_has_real_scores = True
                                            alt_sample_scores['intent'] = intent_score
                                            alt_sample_scores['funnel'] = funnel_score

                                if 'content_analysis' in comp_results:
                                    content = comp_results['content_analysis']
                                    if isinstance(content, dict):
                                        purchase_score = content.get('overall_purchase_intent_percentage', 0)
                                        if purchase_score > 0:
                                            alt_has_real_scores = True
                                            alt_sample_scores['content'] = purchase_score

                        if alt_has_real_scores:
                            print(f"🔄 SMART REDIRECT: Found correct analysis with real scores: {alt_doc.id}")
                            print(f"🎯 Redirecting from {analysis_id} (0% scores) to {alt_doc.id} (real scores)")
                            return {
                                "success": True,
                                "analysis_id": alt_doc.id,
                                "original_id": analysis_id,
                                "ad_title": alt_title,
                                "data_source": "smart_redirect_to_real_scores",
                                "has_real_scores": True,
                                "sample_scores": alt_sample_scores,
                                "ai_analysis_results": alt_ai_results,
                                "full_data": alt_data,
                                "redirect_reason": f"Redirected from {analysis_id} (placeholder data) to {alt_doc.id} (real scores)"
                            }

        print(f"📊 Analysis {analysis_id} - Real scores: {has_real_scores}, Sample: {sample_scores}")
        print(f"🎯 RETURNING ORIGINAL ANALYSIS: {analysis_id} (Title: {analysis_data.get('adTitle', 'Unknown')})")

        return {
            "success": True,
            "analysis_id": analysis_id,
            "ad_title": analysis_data.get('adTitle', 'Unknown'),
            "data_source": data_source,
            "has_real_scores": has_real_scores,
            "sample_scores": sample_scores,
            "ai_analysis_results": ai_results,
            "full_data": analysis_data,
            # **FIX**: Include metadata fields at top level for frontend access
            "brand_id": analysis_data.get('brand_id'),
            "brand_name": analysis_data.get('brandName'),
            "messageIntent": analysis_data.get('messageIntent'),
            "funnelStage": analysis_data.get('funnelStage'),
            "channels": analysis_data.get('channels'),
            "title": analysis_data.get('adTitle')
        }
        
    except Exception as e:
        print(f"❌ Error in unified analysis data: {str(e)}")
        return {"success": False, "error": str(e)}

def generate_detailed_analysis_html(analysis_data, analysis_id, selected_features=None, user_plan_type=None):
    """Generate comprehensive HTML showing analysis data in AnalysisResults card format"""
    try:
        print(f"🎨 HTML GENERATION DEBUG: Starting HTML generation for analysis ID: {analysis_id}")
        print(f"🎨 HTML GENERATION DEBUG: Analysis data keys: {list(analysis_data.keys()) if isinstance(analysis_data, dict) else 'Not a dict'}")
        print(f"🔍 HTML GENERATION DEBUG: Starting for analysis_id: {analysis_id}")
        print(f"🔍 HTML GENERATION DEBUG: analysis_data type: {type(analysis_data)}")
        print(f"🔍 HTML GENERATION DEBUG: selected_features parameter: {selected_features}")
        print(f"🔍 HTML GENERATION DEBUG: user_plan_type parameter: {user_plan_type}")
        # **SAFETY CHECK**: Ensure analysis_data is a dictionary
        if not isinstance(analysis_data, dict):
            print(f"❌ HTML GENERATION ERROR: analysis_data is not a dict, it's {type(analysis_data)}")
            return f"<h1>Error: Invalid data type - expected dict, got {type(analysis_data)}</h1>"
            
        print(f"🔍 HTML GENERATION DEBUG: analysis_data keys: {list(analysis_data.keys())}")
        
        # **FIX**: Use selectedFeatures from analysis data if not provided as parameter
        if selected_features is None and 'selectedFeatures' in analysis_data:
            selected_features = analysis_data['selectedFeatures']
            print(f"🔍 HTML GENERATION: Using selectedFeatures from analysis_data: {selected_features}")
        
        # **FIX**: Parse selectedFeatures if it's a string
        if isinstance(selected_features, str):
            try:
                selected_features = json.loads(selected_features) if selected_features else []
                print(f"🔍 HTML GENERATION: Parsed selectedFeatures from string: {selected_features}")
            except:
                selected_features = []
                print(f"⚠️ HTML GENERATION: Failed to parse selectedFeatures, using empty list")
        
        # Ensure selected_features is a list
        if not isinstance(selected_features, list):
            selected_features = []
            print(f"⚠️ HTML GENERATION: selectedFeatures is not a list, using empty list")
        
        print(f"🔍 HTML GENERATION: Final selectedFeatures: {selected_features}")
        
        # **FIX**: Extract user plan type from analysis data if not provided
        if not user_plan_type and 'plan_usage_at_time' in analysis_data:
            plan_info = analysis_data['plan_usage_at_time']
            user_plan_type = plan_info.get('planName', '').lower()
            print(f"🔍 HTML GENERATION: Using plan type from analysis_data: {user_plan_type}")
        
        print(f"🔍 HTML GENERATION: Final user_plan_type: {user_plan_type}")
        
    except Exception as e:
        print(f"❌ HTML GENERATION DEBUG ERROR: {e}")
        return f"<h1>Debug Error: {e}</h1>"
    
    def extract_score_from_data(data, score_paths):
        """Extract score from nested data using multiple possible paths"""
        for path in score_paths:
            current = data
            try:
                for key in path.split('.'):
                    if isinstance(current, dict) and key in current:
                        current = current[key]
                    else:
                        break
                else:
                    if isinstance(current, (int, float)):
                        return current
            except:
                continue
        return None
    
    def should_show_card(card_key, user_plan_type, selected_features):
        """Determine if a card should be shown based on user's plan type (same logic as React component)"""
        if not user_plan_type:
            # If no plan type provided, show all cards (backward compatibility)
            print(f"🔍 CARD FILTER [{card_key}]: No plan type, showing card")
            return True
        
        # For Plus/Pro/Enterprise users, show all cards regardless of selected_features
        if any(plan in user_plan_type for plan in ['plus', 'pro', 'enterprise']):
            print(f"🔍 CARD FILTER [{card_key}]: {user_plan_type} plan, showing card")
            return True
        
        # For Lite users, only show cards for selected features
        if 'lite' in user_plan_type:
            # Check if selectedFeatures is None (old data without the field) vs empty list (user selected nothing)
            if selected_features is None:
                # Backward compatibility: old analyses without selectedFeatures field
                print(f"🔍 CARD FILTER [{card_key}]: Lite plan but selectedFeatures is None (old data), showing card for backward compatibility")
                return True
            
            if isinstance(selected_features, list) and len(selected_features) == 0:
                # User has Lite plan but selected NO features - hide all cards
                print(f"🔍 CARD FILTER [{card_key}]: Lite plan but no features selected (empty list), hiding card")
                return False
            
            # Map card keys to feature IDs (same as React component)
            card_to_feature_map = {
                'brandCompliance': 'brand_compliance',
                'messagingIntent': 'messaging_intent', 
                'funnelCompatibility': 'funnel_compatibility',
                'channelCompliance': 'channel_compliance',
                'purchaseIntent': 'resonance_index'
            }
            
            feature_id = card_to_feature_map.get(card_key)
            if feature_id:
                # Return True only if feature is in selected_features, False otherwise
                should_show = feature_id in selected_features
                print(f"🔍 CARD FILTER [{card_key}]: Lite plan, feature_id={feature_id}, in selectedFeatures={should_show}, selectedFeatures={selected_features}")
                return should_show
            # If card_key not in map, don't show it for Lite users
            print(f"🔍 CARD FILTER [{card_key}]: Lite plan, card_key not in map, hiding card")
            return False
        
        # For free or unknown plans, show all cards (they'll have overlays in the frontend)
        print(f"🔍 CARD FILTER [{card_key}]: Unknown plan ({user_plan_type}), showing card")
        return True
    
    # Extract key information
    user_id = analysis_data.get('userId', 'N/A')
    brand_id = analysis_data.get('brand_id', 'N/A')
    ad_title = analysis_data.get('adTitle', 'Untitled Analysis')
    timestamp = analysis_data.get('timestamp', 'N/A')
    brand_name = analysis_data.get('brandName', 'N/A')
    media_url = analysis_data.get('mediaUrl', '')
    
    # Get AI analysis results
    ai_results = analysis_data.get('ai_analysis_results', {})
    
    # STANDARDIZED: Always use direct structure format (post-migration)
    results_data = {}
    
    # Check data structure version for validation
    data_version = analysis_data.get('data_structure_version', 'unknown')
    print(f"🔍 Data structure version: {data_version}")
    
    # First try direct ai_analysis_results structure (STANDARDIZED format)
    if any(key in ai_results for key in ['metaphor_analysis', 'content_analysis', 'channel_compliance', 'brand_compliance']):
        results_data = ai_results
        print(f"🔍 ✅ Using STANDARDIZED direct structure")
    
    # Handle comprehensive-analysis structure (newer analyses use this format)
    elif 'comprehensive-analysis' in ai_results:
        comp_analysis = ai_results['comprehensive-analysis']
        if comp_analysis.get('success') and 'data' in comp_analysis:
            results_data = comp_analysis['data'].get('results', {})
            print(f"🔍 ✅ Using comprehensive-analysis structure (newer format)")
        else:
            print(f"🔍 ⚠️ comprehensive-analysis found but invalid structure")
    
    # Validation: Ensure we have the expected structure
    if not results_data:
        print(f"🔍 ❌ No valid analysis structure found in ai_results keys: {list(ai_results.keys())}")
    else:
        print(f"🔍 ✅ Found analysis data with keys: {list(results_data.keys())}")
    
    # Generate analysis cards with REAL data - SIMPLE AND SAFE VERSION
    cards_html = ""
    
    # Show what data we have available
    print(f"Available analysis types: {list(results_data.keys()) if results_data else 'None'}")
    print(f"🔍 AI results keys: {list(ai_results.keys()) if ai_results else 'None'}")
    
    # Debug: Print sample data structure
    if results_data:
        for key, value in results_data.items():
            print(f"🔍 DEBUG: {key} structure: {type(value)} - {list(value.keys()) if isinstance(value, dict) else str(value)[:100]}")
            if isinstance(value, dict) and key == 'metaphor_analysis':
                print(f"🔍 DEBUG: metaphor_analysis.message_intent: {value.get('message_intent', 'NOT FOUND')}")
                if 'message_intent' in value:
                    print(f"🔍 DEBUG: intent_compliance_score: {value['message_intent'].get('intent_compliance_score', 'NOT FOUND')}")
    
    # Extract NUMERIC scores for overall calculation (keep these as numbers)
    intent_score_num = 0
    funnel_score_num = 0
    content_score_num = 0
    brand_score_num = 0
    channel_score_num = 0
    
    # Extract scores from comprehensive analysis results
    if results_data:
        # Get metaphor analysis scores
        metaphor_analysis = results_data.get('metaphor_analysis', {})
        if metaphor_analysis:
            intent_score_num = metaphor_analysis.get('message_intent', {}).get('intent_compliance_score', 0) or 0
            funnel_score_num = metaphor_analysis.get('funnel_compatibility', {}).get('effectiveness_score', 0) or 0
            
        # Get content analysis score
        content_analysis = results_data.get('content_analysis', {})
        if content_analysis:
            content_score_num = content_analysis.get('overall_purchase_intent_percentage', 0) or 0
            
        # Get brand compliance score
        brand_compliance = results_data.get('brand_compliance', {})
        if brand_compliance:
            compliance_analysis = brand_compliance.get('compliance_analysis', {})
            if compliance_analysis:
                brand_score_num = compliance_analysis.get('final_compliance_score', 0) or 0
                
        # Get channel compliance score (average across platforms)
        channel_compliance = results_data.get('channel_compliance', {})
        if channel_compliance and isinstance(channel_compliance, dict):
            channel_scores = []
            for platform, platform_data in channel_compliance.items():
                if isinstance(platform_data, dict):
                    score = platform_data.get('compliance_percentage') or platform_data.get('compliance_score', 0)
                    if score:
                        try:
                            channel_scores.append(float(str(score).replace('%', '')))
                        except:
                            pass
            if channel_scores:
                channel_score_num = round(sum(channel_scores) / len(channel_scores), 1)
    
    # Calculate overall score based ONLY on SHOWN cards (respects selectedFeatures)
    shown_scores_for_overall = []
    shown_score_details = []
    
    if should_show_card('messagingIntent', user_plan_type, selected_features) and intent_score_num > 0:
        shown_scores_for_overall.append(intent_score_num)
        shown_score_details.append(f"Message Intent: {intent_score_num}%")
        
    if should_show_card('funnelCompatibility', user_plan_type, selected_features) and funnel_score_num > 0:
        shown_scores_for_overall.append(funnel_score_num)
        shown_score_details.append(f"Funnel: {funnel_score_num}%")
        
    if should_show_card('purchaseIntent', user_plan_type, selected_features) and content_score_num > 0:
        shown_scores_for_overall.append(content_score_num)
        shown_score_details.append(f"Purchase Intent: {content_score_num}%")
        
    if should_show_card('channelCompliance', user_plan_type, selected_features) and channel_score_num > 0:
        shown_scores_for_overall.append(channel_score_num)
        shown_score_details.append(f"Channel: {channel_score_num}%")
        
    if should_show_card('brandCompliance', user_plan_type, selected_features) and brand_score_num > 0:
        shown_scores_for_overall.append(brand_score_num)
        shown_score_details.append(f"Brand: {brand_score_num}%")
    
    # Calculate average from ONLY the shown scores (keep 2 decimal places)
    if shown_scores_for_overall:
        overall_score = round(sum(shown_scores_for_overall) / len(shown_scores_for_overall), 2)
    else:
        overall_score = 0.00
        
    print(f"🔍 HTML Overall Score Calculation (SHOWN SCORES ONLY):")
    print(f"   Scores included: {shown_score_details}")
    print(f"   Sum: {sum(shown_scores_for_overall) if shown_scores_for_overall else 0}, Count: {len(shown_scores_for_overall)}")
    print(f"   Average: {overall_score:.2f}%")
    
    # Generate analysis cards with dropdowns from app (2).py
    cards_html = ""
    
    # Message Intent Card
    if results_data and 'metaphor_analysis' in results_data and should_show_card('messagingIntent', user_plan_type, selected_features):
        metaphor_data = results_data['metaphor_analysis']
        intent_score = str(metaphor_data.get('message_intent', {}).get('intent_compliance_score', 'N/A')) + "%"
        emotional_tone = str(metaphor_data.get('message_intent', {}).get('emotional_tone', 'N/A'))
        core_message_summary = str(metaphor_data.get('message_intent', {}).get('core_message_summary', 'N/A'))
        
        cards_html += f'''
        <div class="analysis-card">
            <div class="card-header">
                <h4>Message Intent</h4>
                <div class="score-display">{intent_score}</div>
            </div>
            <div class="card-content">
                <div class="details-container">
                    <div class="detail-item"><strong>Intent Compliance Score:</strong> <span class="score-highlight">{intent_score}</span></div>
                    <div class="detail-item"><strong>Emotional Tone:</strong> {emotional_tone}</div>
                    <div class="detail-item"><strong>Core Message Summary:</strong> {core_message_summary}</div>
                </div>
                <button class="show-details-btn" onclick="toggleCardDetails(this)">
                    <span class="btn-text">Show Details</span>
                    <span class="btn-icon"></span>
                </button>
            </div>
        </div>
        '''
    
    # Funnel Compatibility Card
    if results_data and 'metaphor_analysis' in results_data and should_show_card('funnelCompatibility', user_plan_type, selected_features):
        metaphor_data = results_data['metaphor_analysis']
        funnel_score = str(metaphor_data.get('funnel_compatibility', {}).get('effectiveness_score', 'N/A')) + "%"
        classification = str(metaphor_data.get('funnel_compatibility', {}).get('classification', 'N/A'))
        reasoning = str(metaphor_data.get('funnel_compatibility', {}).get('reasoning', 'N/A'))
        
        cards_html += f'''
        <div class="analysis-card">
            <div class="card-header">
                <h4>Funnel Compatibility</h4>
                <div class="score-display">{funnel_score}</div>
            </div>
            <div class="card-content">
                <div class="details-container">
                    <div class="detail-item"><strong>Effectiveness Score:</strong> <span class="score-highlight">{funnel_score}</span></div>
                    <div class="detail-item"><strong>Classification:</strong> {classification}</div>
                    <div class="detail-item"><strong>Reasoning:</strong> {reasoning}</div>
                </div>
                <button class="show-details-btn" onclick="toggleCardDetails(this)">
                    <span class="btn-text">Show Details</span>
                    <span class="btn-icon"></span>
                </button>
            </div>
        </div>
        '''
    
    # Content Analysis Card (Purchase Intent)
    if results_data and 'content_analysis' in results_data and should_show_card('purchaseIntent', user_plan_type, selected_features):
        content_data = results_data['content_analysis']
        content_score = str(content_data.get('overall_purchase_intent_percentage', 'N/A')) + "%"
        resonating_impact = str(content_data.get('resonating_impact', 'N/A'))
        analysis_reason = str(content_data.get('reason', 'N/A'))
        
        # Build purchase intent breakdown with individual reasoning
        purchase_intent_html = ""
        purchase_scores = content_data.get('purchase_intent_scores', {})
        for score_name, score_data in purchase_scores.items():
            if isinstance(score_data, dict):
                score_title = str(score_name).replace('_', ' ').title()
                if 'cta' in score_title.lower():
                    score_title = score_title.replace('Cta', 'CTA')
                
                score_value = str(score_data.get('score', 'N/A'))
                score_percentage = str(score_data.get('percentage', 'N/A'))
                score_reason = str(score_data.get('reason', score_data.get('description', 'No reasoning provided')))
                
                # Clean up reason text
                if score_reason.startswith(f"{score_title} - "):
                    score_reason = score_reason[len(f"{score_title} - "):]
                
                purchase_intent_html += f'''
                <div class="detail-item" style="background: #f8fafc; padding: 0.75rem; border-radius: 6px; margin-bottom: 0.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                        <strong>&bull; {score_title}:</strong>
                        <span class="score-highlight">{score_percentage}%</span>
                    </div>
                    <div style="font-size: 0.85rem; color: #64748b; font-style: italic; margin-left: 1rem;">
                        {score_reason}
                    </div>
                </div>
                '''
        
        cards_html += f'''
        <div class="analysis-card">
            <div class="card-header">
                <h4>Purchase Intent</h4>
                <div class="score-display">{content_score}</div>
            </div>
            <div class="card-content">
                <div class="details-container">
                    <div class="detail-item"><strong>Overall Purchase Intent:</strong> <span class="score-highlight">{content_score}</span></div>
                    <div class="detail-item"><strong>Resonating Impact:</strong> {resonating_impact}</div>
                    <div class="detail-item"><strong>Purchase Intent Breakdown:</strong></div>
                    {purchase_intent_html}
                </div>
                <button class="show-details-btn" onclick="toggleCardDetails(this)">
                    <span class="btn-text">Show Details</span>
                    <span class="btn-icon"></span>
                </button>
            </div>
        </div>
        '''
    
    # Channel Compliance Card
    if results_data and 'channel_compliance' in results_data and should_show_card('channelCompliance', user_plan_type, selected_features):
        channel_data = results_data['channel_compliance']
        
        # Calculate average compliance score
        total_score = 0
        platform_count = 0
        platform_details_html = ""
        
        for platform, platform_data in channel_data.items():
            if isinstance(platform_data, dict):
                platform_name = str(platform).upper()
                compliance_score = str(platform_data.get('compliance_score', 'N/A'))
                compliance_percentage = str(platform_data.get('compliance_percentage', 'N/A'))
                matched_scores = str(platform_data.get('total_matched_scores', 'N/A'))
                total_guidelines = str(platform_data.get('total_guidelines', 'N/A'))
                
                # Add to average calculation
                compliance_value = platform_data.get('compliance_percentage') or platform_data.get('compliance_score')
                if compliance_value is not None:
                    try:
                        compliance_str = str(compliance_value).replace('%', '')
                        compliance_float = float(compliance_str)
                        total_score += compliance_float
                        platform_count += 1
                    except (ValueError, TypeError):
                        pass
                
                # Extract guideline results for detailed view
                guideline_results = platform_data.get('guideline_results', [])
                guideline_details_html = ""
                if guideline_results and isinstance(guideline_results, list):
                    for i, guideline in enumerate(guideline_results, 1):
                        if isinstance(guideline, dict):
                            guideline_text = guideline.get('guideline', 'N/A')
                            actual_output = guideline.get('actual_output', 'N/A')
                            reason = guideline.get('reason', '')
                            
                            guideline_details_html += f'''
                            <div style="margin-left: 1rem; padding: 0.5rem; border-left: 2px solid #e5e7eb; margin-bottom: 0.5rem;">
                                <div class="detail-item"><strong>Guideline {i}:</strong> {guideline_text}</div>
                                <div class="detail-item">&bull; <strong>Answer:</strong> {actual_output}</div>
                                {f'<div class="detail-item">&bull; <strong>Reasoning:</strong> {reason}</div>' if reason and reason.strip() else ''}
                            </div>
                            '''
                
                platform_details_html += f'''
                <div style="background: rgba(255, 255, 255, 0.7); padding: 1rem; border-radius: 6px; margin-bottom: 1rem;">
                    <h5 style="color: #1f2937; font-weight: 600; margin-bottom: 0.5rem;">{platform_name}</h5>
                    <div class="detail-item"><strong>Compliance Score:</strong> <span class="score-highlight">{compliance_score}</span></div>
                    <div class="detail-item"><strong>Compliance Percentage:</strong> <span class="score-highlight">{compliance_percentage}%</span></div>
                    <div class="detail-item"><strong>Guidelines Passed:</strong> {matched_scores} out of {total_guidelines}</div>
                    {f'<div class="detail-item"><strong>Guideline Results:</strong></div>{guideline_details_html}' if guideline_details_html else ''}
                </div>
                '''
        
        avg_score = round(total_score / platform_count, 1) if platform_count > 0 else "N/A"
        avg_score_display = str(avg_score) + '%' if avg_score != 'N/A' else 'N/A'
        
        cards_html += f'''
        <div class="analysis-card">
            <div class="card-header">
                <h4>Channel Compliance</h4>
                <div class="score-display">{avg_score_display}</div>
            </div>
            <div class="card-content">
                <div class="details-container">
                    <div class="detail-item"><strong>Average Compliance:</strong> <span class="score-highlight">{avg_score_display}</span></div>
                    <div class="detail-item"><strong>Platforms Analyzed:</strong> {platform_count}</div>
                    <div class="detail-item"><strong>Platform Details:</strong></div>
                    {platform_details_html}
                </div>
                <button class="show-details-btn" onclick="toggleCardDetails(this)">
                    <span class="btn-text">Show Details</span>
                    <span class="btn-icon"></span>
                </button>
            </div>
        </div>
        '''
    
    # Brand Compliance Card
    if results_data and 'brand_compliance' in results_data and should_show_card('brandCompliance', user_plan_type, selected_features):
        brand_data = results_data['brand_compliance']
        
        # Get brand compliance score
        brand_score = "N/A"
        final_compliance_display = "N/A"
        if isinstance(brand_data, dict):
            compliance_analysis = brand_data.get('compliance_analysis', {})
            if isinstance(compliance_analysis, dict) and compliance_analysis.get('final_compliance_score'):
                brand_score = str(compliance_analysis['final_compliance_score']) + "%"
                final_compliance_display = brand_score
        
        # Build brand compliance details
        compliance_level = str(brand_data.get('compliance_level', 'N/A')) if isinstance(brand_data, dict) else 'N/A'
        file_type = str(brand_data.get('file_type', 'N/A')) if isinstance(brand_data, dict) else 'N/A'
        logo_images_loaded = str(brand_data.get('logo_images_loaded', 'N/A')) if isinstance(brand_data, dict) else 'N/A'
        brand_colors = str(brand_data.get('brand_colors', 'N/A')) if isinstance(brand_data, dict) else 'N/A'
        tone_of_voice = str(brand_data.get('tone_of_voice', 'N/A')) if isinstance(brand_data, dict) else 'N/A'
        ai_response = str(brand_data.get('ai_response', 'N/A'))[:300] if isinstance(brand_data, dict) else 'N/A'
        if len(str(brand_data.get('ai_response', ''))) > 300:
            ai_response += "..."
        
        # Add detailed compliance analysis like in PDF
        compliance_details_html = ""
        if isinstance(brand_data, dict):
            compliance_analysis = brand_data.get('compliance_analysis', {})
            if isinstance(compliance_analysis, dict):
                questions = compliance_analysis.get('questions', [])
                llm_answers = compliance_analysis.get('llm_answers', [])
                
                if questions and llm_answers and len(questions) == len(llm_answers):
                    compliance_details_html += '<div class="detail-item"><strong>Brand Guidelines Assessment:</strong></div>'
                    for i, (question, answer) in enumerate(zip(questions, llm_answers), 1):
                        clean_question = question.replace('?', '').strip()
                        status = "[YES]" if answer.lower() == 'yes' else "[NO]"
                        compliance_details_html += f'<div class="detail-item">&bull; {clean_question}: {status}</div>'
        
        cards_html += f'''
        <div class="analysis-card">
            <div class="card-header">
                <h4>Brand Compliance</h4>
                <div class="score-display">{brand_score}</div>
            </div>
            <div class="card-content">
                <div class="details-container">
                    <div class="detail-item"><strong>Compliance Level:</strong> {compliance_level}</div>
                    <div class="detail-item"><strong>File Type:</strong> {file_type}</div>
                    <div class="detail-item"><strong>Logo Images Loaded:</strong> {logo_images_loaded}</div>
                    <div class="detail-item"><strong>Brand Colors:</strong> {brand_colors}</div>
                    <div class="detail-item"><strong>Tone of Voice:</strong> {tone_of_voice}</div>
                    <div class="detail-item"><strong>Final Compliance Score:</strong> <span class="score-highlight">{final_compliance_display}</span></div>
                    {compliance_details_html}
                </div>
                <button class="show-details-btn" onclick="toggleCardDetails(this)">
                    <span class="btn-text">Show Details</span>
                    <span class="btn-icon"></span>
                </button>
            </div>
        </div>
        '''
    
    # Generate Overall Score section (simplified - only shows Overall Score, not full table)
    # Individual scores are already shown in the cards below
    overall_status = 'Excellent' if overall_score >= 85 else 'Good' if overall_score >= 70 else 'Needs Improvement'
    status_color = '#059669' if overall_score >= 85 else '#10b981' if overall_score >= 70 else '#f59e0b'
    
    # Create the Overall Score display (simplified - no table, just the score)
    # Format overall_score to 2 decimal places
    overall_score_formatted = f"{overall_score:.2f}"
    analysis_results_table = f'''
    <div class="overall-score-section">
        <div class="overall-score-card">
            <h2 class="overall-score-title">Overall Score</h2>
            <div class="overall-score-value" style="color: {status_color};">{overall_score_formatted}%</div>
            <div class="overall-score-status" style="color: {status_color};">{overall_status}</div>
            <div class="overall-score-note">Based on {len(shown_scores_for_overall)} analyzed metrics</div>
        </div>
    </div>
    '''
    
    # Generate complete HTML with cards and JavaScript
    html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Analysis Details - {ad_title}</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }}
        .container {{
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }}
        .header {{
            background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }}
        .content {{
            padding: 30px;
        }}
        .info-card {{
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            border-left: 4px solid #007bff;
            margin: 10px 0;
        }}
        .analysis-cards-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
            gap: 1.5rem;
            padding: 20px;
        }}
        .analysis-card {{
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            position: relative;
            min-height: 200px;
            max-height: 600px;
            overflow: hidden;
            background: linear-gradient(135deg, #90EE90 0%, #98FB98 100%) !important;
        }}
        .card-header {{
            padding: 2rem;
            padding-bottom: 1rem;
        }}
        .card-header h4 {{
            font-size: 1.25rem;
            font-weight: 600;
            color: #1f2937;
            margin: 0;
        }}
        .score-display {{
            font-size: 2.5rem;
            font-weight: 700;
            color: #f59e0b;
            margin-bottom: 0.5rem;
        }}
        .card-content {{
            padding: 0 2rem 2rem 2rem;
        }}
        .details-container {{
            max-height: 0;
            overflow: hidden;
            padding: 0;
            transition: max-height 0.3s ease-out, padding 0.3s ease-out;
            background: rgba(255, 255, 255, 0.5);
            border-radius: 8px;
            margin-bottom: 1rem;
        }}
        .details-container.expanded {{
            max-height: none;
            padding: 1rem;
            overflow-y: auto;
            overflow-x: hidden;
        }}
        .detail-item {{
            margin-bottom: 0.75rem;
            padding: 0.5rem 0;
            border-bottom: 1px solid rgba(0,0,0,0.1);
        }}
        .detail-item:last-child {{
            border-bottom: none;
        }}
        .detail-item strong {{
            color: #374151;
            font-weight: 600;
        }}
        .score-highlight {{
            color: #000000;
            font-weight: bold;
        }}
        .show-details-btn {{
            width: 100%;
            padding: 0.75rem;
            background: linear-gradient(135deg, #6366f1, #4f46e5);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
        }}
        .show-details-btn:hover {{
            background: linear-gradient(135deg, #4f46e5, #3730a3);
            transform: translateY(-1px);
        }}
        .btn-icon {{
            display: inline-block;
            width: 8px;
            height: 8px;
            border-left: 2px solid white;
            border-bottom: 2px solid white;
            transform: rotate(-45deg);
            transition: transform 0.3s ease;
            margin-left: 8px;
        }}
        .show-details-btn.expanded .btn-icon {{
            transform: rotate(135deg);
        }}
        /* Overall Score Section Styles */
        .overall-score-section {{
            padding: 20px;
            margin: 20px;
        }}
        .overall-score-card {{
            background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
            padding: 30px;
            border-radius: 16px;
            text-align: center;
            box-shadow: 0 8px 25px -5px rgba(0, 0, 0, 0.1);
            border: 2px solid #7dd3fc;
        }}
        .overall-score-title {{
            color: #0369a1;
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }}
        .overall-score-value {{
            font-size: 4rem;
            font-weight: 800;
            margin-bottom: 10px;
        }}
        .overall-score-status {{
            font-size: 1.3rem;
            font-weight: 600;
            margin-bottom: 15px;
        }}
        .overall-score-note {{
            color: #64748b;
            font-size: 0.9rem;
            font-style: italic;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Analysis Details</h1>
            <div class="subtitle">{ad_title}</div>
        </div>
        
        <div class="content">
            <div class="info-card">
                <h3>Analysis Information</h3>
                <p><strong>ID:</strong> {analysis_id}</p>
                <p><strong>Title:</strong> {ad_title}</p>
                <p><strong>Brand:</strong> {brand_name}</p>
            </div>
            
            {f'''
            <div style="text-align: center; margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                <h3>Analyzed Media</h3>
                <div id="media-container" style="display: inline-block; max-width: 100%; max-height: 400px; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <!-- Try to load as image first -->
                    <img src="{media_url}" alt="Analyzed Media" 
                         style="max-width: 100%; max-height: 400px; border-radius: 8px; display: block;" 
                         onload="console.log('Image loaded successfully')"
                         onerror="this.style.display='none'; document.getElementById('video-fallback').style.display='block'; console.log('Image failed, showing video');">
                    
                    <!-- Fallback to video if image fails -->
                    <video id="video-fallback" controls preload="metadata"
                           style="max-width: 100%; max-height: 400px; border-radius: 8px; display: none;" 
                           onloadeddata="console.log('Video loaded successfully')"
                           onerror="console.log('Video also failed to load');">
                        <source src="{media_url}" type="video/mp4">
                        <source src="{media_url}" type="video/mov">
                        <source src="{media_url}" type="video/webm">
                        <div style="padding: 20px; text-align: center; color: #666;">
                            <p>Media preview not available</p>
                            <p style="font-size: 0.8em;">The media file could not be displayed in this browser.</p>
                        </div>
                    </video>
                </div>
            </div>
            ''' if media_url else ''}
            
            {analysis_results_table}
            
            <div class="analysis-cards-grid">
{cards_html}
            </div>
        </div>
    </div>
    
    <script>
        function toggleCardDetails(button) {{
            const detailsContainer = button.parentElement.querySelector('.details-container');
            const btnText = button.querySelector('.btn-text');
            
            if (detailsContainer.classList.contains('expanded')) {{
                // Collapse
                detailsContainer.style.maxHeight = '0px';
                detailsContainer.style.padding = '0';
                detailsContainer.style.overflowY = 'hidden';
                detailsContainer.classList.remove('expanded');
                btnText.textContent = 'Show Details';
                button.classList.remove('expanded');
            }} else {{
                // Expand
                detailsContainer.style.maxHeight = '400px';
                detailsContainer.style.padding = '1rem';
                detailsContainer.style.overflowY = 'auto';
                detailsContainer.style.overflowX = 'hidden';
                detailsContainer.classList.add('expanded');
                btnText.textContent = 'Hide Details';
                button.classList.add('expanded');
            }}
        }}
        
        // Initialize all cards as collapsed
        document.addEventListener('DOMContentLoaded', function() {{
            const allDetailsContainers = document.querySelectorAll('.details-container');
            allDetailsContainers.forEach(container => {{
                container.style.maxHeight = '0px';
                container.style.padding = '0';
                container.style.overflowY = 'hidden';
            }});
        }});
    </script>
</body>
</html>"""
    
    return html_content

# REMOVED: First duplicate /analysis-details-html/{analysis_id} endpoint (kept the second one at line 6344)

def transform_userfiles_to_user_analysis(userfile_data, analysis_id):
    """Transform userFiles analysisResults structure to user_analysis ai_analysis_results format"""
    
    print(f"🔄 DEBUG: Starting transformation for {analysis_id}")
    print(f"🔄 DEBUG: userfile_data type: {type(userfile_data)}")
    print(f"🔄 DEBUG: userfile_data keys: {list(userfile_data.keys()) if isinstance(userfile_data, dict) else 'Not a dict'}")
    
    analysis_results = userfile_data.get('analysisResults', {}) if isinstance(userfile_data, dict) else {}
    print(f"🔄 DEBUG: analysis_results type: {type(analysis_results)}")
    print(f"🔄 DEBUG: analysis_results keys: {list(analysis_results.keys()) if isinstance(analysis_results, dict) else 'Not a dict'}")
    
    # Map old structure to new structure
    transformed_ai_results = {}
    
    # Map messagingIntent + funnelCompatibility -> metaphor_analysis
    print(f"🔄 DEBUG: Checking for messagingIntent and funnelCompatibility...")
    print(f"🔄 DEBUG: Has messagingIntent: {'messagingIntent' in analysis_results}")
    print(f"🔄 DEBUG: Has funnelCompatibility: {'funnelCompatibility' in analysis_results}")
    if 'messagingIntent' in analysis_results and 'funnelCompatibility' in analysis_results:
        messaging = analysis_results['messagingIntent']
        funnel = analysis_results['funnelCompatibility']
        
        # Safely extract data with proper type checking
        messaging_score = messaging.get('score', 0) if isinstance(messaging, dict) else 0
        messaging_details = messaging.get('detailedAnalysis', {}) if isinstance(messaging, dict) else {}
        funnel_score = funnel.get('score', 0) if isinstance(funnel, dict) else 0
        funnel_details = funnel.get('detailedAnalysis', {}) if isinstance(funnel, dict) else {}
        
        # Ensure scores are numbers
    try:
            messaging_score = float(messaging_score) if messaging_score is not None else 0
    except (ValueError, TypeError):
        messaging_score = 0
            
    try:
        funnel_score = float(funnel_score) if funnel_score is not None else 0
    except (ValueError, TypeError):
            funnel_score = 0
        
            transformed_ai_results['metaphor_analysis'] = {
            'message_intent': {
            'intent_compliance_score': messaging_score,
            'emotional_tone': messaging_details.get('emotionalTone', 'N/A') if isinstance(messaging_details, dict) else 'N/A',
            'core_message_summary': messaging_details.get('summary', 'N/A') if isinstance(messaging_details, dict) else 'N/A'
            },
            'funnel_compatibility': {
            'effectiveness_score': funnel_score,
            'match_with_user_selection': funnel_details.get('matchWithSelection', 'N/A') if isinstance(funnel_details, dict) else 'N/A',
            'classification': funnel_details.get('classification', 'N/A') if isinstance(funnel_details, dict) else 'N/A',
            'reasoning': funnel_details.get('reasoning', 'N/A') if isinstance(funnel_details, dict) else 'N/A',
            'improvement_suggestion': funnel_details.get('improvementSuggestion', 'N/A') if isinstance(funnel_details, dict) else 'N/A'
            }
            }
    
            print(f"🔄 DEBUG: ✅ Created metaphor_analysis section")
    else:
        print(f"🔄 DEBUG: ❌ Skipped metaphor_analysis - missing required keys")
    
    # Map purchaseIntent -> content_analysis
    print(f"🔄 DEBUG: Checking for purchaseIntent...")
    print(f"🔄 DEBUG: Has purchaseIntent: {'purchaseIntent' in analysis_results}")
    if 'purchaseIntent' in analysis_results:
        purchase = analysis_results['purchaseIntent']
        
        purchase_score = purchase.get('score', 0) if isinstance(purchase, dict) else 0
        purchase_details = purchase.get('detailedAnalysis', {}) if isinstance(purchase, dict) else {}
        analysis_summary = analysis_results.get('analysisSummary', {}) if isinstance(analysis_results, dict) else {}
        
        # Ensure purchase_score is a number
    try:
            purchase_score = float(purchase_score) if purchase_score is not None else 0
    except (ValueError, TypeError):
        purchase_score = 0
        
        transformed_ai_results['content_analysis'] = {
        'overall_purchase_intent_percentage': purchase_score,
        'resonating_impact': analysis_summary.get('resonatingImpact', 'N/A') if isinstance(analysis_summary, dict) else 'N/A',
        'reason': purchase_details.get('reason', 'N/A') if isinstance(purchase_details, dict) else 'N/A',
        'purchase_intent_scores': purchase_details.get('breakdown', {}) if isinstance(purchase_details, dict) else {}
        }
        print(f"🔄 DEBUG: ✅ Created content_analysis section")
    else:
        print(f"🔄 DEBUG: ❌ Skipped content_analysis - missing purchaseIntent")
    
    # Map channelCompliance -> channel_compliance
        print(f"🔄 DEBUG: Checking for channelCompliance...")
        print(f"🔄 DEBUG: Has channelCompliance: {'channelCompliance' in analysis_results}")
    if 'channelCompliance' in analysis_results:
            channel = analysis_results['channelCompliance']
        
        # Transform to expected platform structure
            platform_data = {}
            channel_score = channel.get('score', 0) if isinstance(channel, dict) else 0
        
        # Ensure channel_score is a number
    try:
        channel_score = float(channel_score) if channel_score is not None else 0
    except (ValueError, TypeError):
        channel_score = 0
        
        platform_data['YouTube'] = {
        'compliance_score': channel_score,
        'compliance_percentage': f"{channel_score}%",
        'total_matched_scores': 2,
        'total_guidelines': 3
        }
        
        transformed_ai_results['channel_compliance'] = platform_data
        print(f"🔄 DEBUG: ✅ Created channel_compliance section")
    else:
            print(f"🔄 DEBUG: ❌ Skipped channel_compliance - missing channelCompliance")
    
    # Map brandCompliance -> brand_compliance
            print(f"🔄 DEBUG: Checking for brandCompliance...")
            print(f"🔄 DEBUG: Has brandCompliance: {'brandCompliance' in analysis_results}")
    if 'brandCompliance' in analysis_results:
        brand = analysis_results['brandCompliance']
        
        brand_score = brand.get('score', 0) if isinstance(brand, dict) else 0
        brand_details = brand.get('detailedAnalysis', {}) if isinstance(brand, dict) else {}
        
        # Ensure brand_score is a number for comparison
    try:
        brand_score_num = float(brand_score) if brand_score is not None else 0
    except (ValueError, TypeError):
            brand_score_num = 0
        
            transformed_ai_results['brand_compliance'] = {
            'compliance_analysis': {
            'final_compliance_score': brand_score_num,
            'compliance_level': 'High' if brand_score_num > 70 else 'Medium',
            'ai_response': brand_details.get('summary', 'N/A') if isinstance(brand_details, dict) else 'N/A'
            },
            'file_type': 'image',
            'logo_images_loaded': 1,
            'brand_colors': ['#000000', '#FFFFFF'],
            'tone_of_voice': ['Professional', 'Modern']
            }
            print(f"🔄 DEBUG: ✅ Created brand_compliance section")
    else:
        print(f"🔄 DEBUG: ❌ Skipped brand_compliance - missing brandCompliance")
    
    # Create the full transformed structure - STANDARDIZED DIRECT FORMAT
    transformed_data = {
    'timestamp': userfile_data.get('createdAt'),
    'ai_analysis_results': transformed_ai_results,  # DIRECT structure, no comprehensive-analysis wrapper
    'adTitle': userfile_data.get('fileName', 'Unknown'),
    'mediaUrl': userfile_data.get('mediaUrl'),
    'mediaType': userfile_data.get('mediaType'),
    'userId': userfile_data.get('userId'),
    'brandName': userfile_data.get('brandName', 'Unknown'),
    'mediaCategory': userfile_data.get('mediaCategory', 'unknown'),
    'artifact_id': analysis_id,
    'source': 'migrated_from_userFiles',
    'data_structure_version': '2.0_direct',  # Version tracking for consistency
    'migration_timestamp': datetime.now().isoformat()
    }
    
    print(f"🔄 Transformed userFiles structure to user_analysis format for {analysis_id}")
    print(f"🔄 DEBUG: Final transformed_ai_results keys: {list(transformed_ai_results.keys()) if transformed_ai_results else 'Empty'}")
    print(f"🔄 DEBUG: Final transformed_data keys: {list(transformed_data.keys()) if transformed_data else 'Empty'}")
    return transformed_data


    def generate_detailed_analysis_html(analysis_data, analysis_id, selected_features=None, user_plan_type=None):
        """Generate comprehensive HTML showing analysis data in AnalysisResults card format"""
    
        try:
            print(f"🔍 HTML GENERATION DEBUG: Starting for analysis_id: {analysis_id}")
            print(f"🔍 HTML GENERATION DEBUG: analysis_data type: {type(analysis_data)}")
        
            # **SAFETY CHECK**: Ensure analysis_data is a dictionary
            if not isinstance(analysis_data, dict):
                print(f"❌ HTML GENERATION ERROR: analysis_data is not a dict, it's {type(analysis_data)}")
                return f"<h1>Error: Invalid data type - expected dict, got {type(analysis_data)}</h1>"
            
            print(f"🔍 HTML GENERATION DEBUG: analysis_data keys: {list(analysis_data.keys())}")
        except Exception as e:
            print(f"❌ HTML GENERATION DEBUG ERROR: {e}")
            return f"<h1>Debug Error: {e}</h1>"
    
        def extract_score_from_data(data, score_paths):
            """Extract score from nested data using multiple possible paths"""
            for path in score_paths:
                current = data
                try:
                    for key in path.split('.'):
                        if isinstance(current, dict) and key in current:
                            current = current[key]
                        else:
                            break
                    else:
                        if isinstance(current, (int, float)):
                            return current
                except:
                    continue
            return None
    
    # Removed problematic format_detail_item function
    
    # Removed problematic create_analysis_card function
    
    def should_show_card(card_key, user_plan_type, selected_features):
        """Determine if a card should be shown based on user's plan type (same logic as React component)"""
        if not user_plan_type:
            # If no plan type provided, show all cards (backward compatibility)
            return True
        
        # For Plus/Pro/Enterprise users, show all cards regardless of selected_features
        if any(plan in user_plan_type for plan in ['plus', 'pro', 'enterprise']):
            return True
        
        # For Lite users, only show cards for selected features
        if 'lite' in user_plan_type:
            if not selected_features:
                # If no selected_features, show all cards (backward compatibility)
                return True
            
            # Map card keys to feature IDs (same as React component)
            card_to_feature_map = {
            'brandCompliance': 'brand_compliance',
            'messagingIntent': 'messaging_intent',
            'funnelCompatibility': 'funnel_compatibility',
            'channelCompliance': 'channel_compliance',
            'purchaseIntent': 'resonance_index'
            }
            
            feature_id = card_to_feature_map.get(card_key)
            if feature_id:
                return feature_id in selected_features
        
        # For free or unknown plans, show all cards (they'll have overlays in the frontend)
        return True
    
    # Extract key information
        user_id = analysis_data.get('userId', 'N/A')
        brand_id = analysis_data.get('brand_id', 'N/A')
        ad_title = analysis_data.get('adTitle', 'Untitled Analysis')
        timestamp = analysis_data.get('timestamp', 'N/A')
        brand_name = analysis_data.get('brandName', 'N/A')
        media_url = analysis_data.get('mediaUrl', '')
    
    # Get AI analysis results
        ai_results = analysis_data.get('ai_analysis_results', {})
    
    # STANDARDIZED: Always use direct structure format (post-migration)
        results_data = {}
    
    # Check data structure version for validation
        data_version = analysis_data.get('data_structure_version', 'unknown')
        print(f"🔍 Data structure version: {data_version}")
    
    # First try direct ai_analysis_results structure (STANDARDIZED format)
        if any(key in ai_results for key in ['metaphor_analysis', 'content_analysis', 'channel_compliance', 'brand_compliance']):
            results_data = ai_results
            print(f"🔍 ✅ Using STANDARDIZED direct structure")
    
    # Handle comprehensive-analysis structure (newer analyses use this format)
        elif 'comprehensive-analysis' in ai_results:
            comp_analysis = ai_results['comprehensive-analysis']
            if comp_analysis.get('success') and 'data' in comp_analysis:
                results_data = comp_analysis['data'].get('results', {})
                print(f"🔍 ✅ Using comprehensive-analysis structure (newer format)")
            else:
                print(f"🔍 ⚠️ comprehensive-analysis found but invalid structure")
    
    
    # Brand Compliance Card - Apply plan-based filtering
        if results_data and 'brand_compliance' in results_data and should_show_card('brandCompliance', user_plan_type, selected_features):
            brand_data = results_data['brand_compliance']
        
            # Get brand compliance score with type checking
            brand_score = "N/A"
            try:
                if isinstance(brand_data, dict):
                    compliance_analysis = brand_data.get('compliance_analysis', {})
                if compliance_analysis.get('final_compliance_score'):
                    brand_score = str(compliance_analysis['final_compliance_score']) + "%"
            except:
                brand_score = "N/A"
        
            # Build brand compliance details safely with type checking
            if isinstance(brand_data, dict):
                compliance_level = str(brand_data.get('compliance_level', 'N/A'))
                file_type = str(brand_data.get('file_type', 'N/A'))
                logo_images_loaded = str(brand_data.get('logo_images_loaded', 'N/A'))
                brand_colors = str(brand_data.get('brand_colors', 'N/A'))
                tone_of_voice = str(brand_data.get('tone_of_voice', 'N/A'))
            else:
                compliance_level = 'N/A'
                file_type = 'N/A'
                logo_images_loaded = 'N/A'
                brand_colors = 'N/A'
                tone_of_voice = 'N/A'
        
            # **FIX**: Add type checking to prevent 'str' object has no attribute 'get' error
            if isinstance(brand_data, dict):
                compliance_analysis = brand_data.get('compliance_analysis', {})
                if isinstance(compliance_analysis, dict):
                    final_compliance_score = compliance_analysis.get('final_compliance_score', 'N/A')
                else:
                    print(f"⚠️ compliance_analysis is not a dict, it's {type(compliance_analysis)}: {compliance_analysis}")
                    final_compliance_score = 'N/A'
                final_compliance_display = str(final_compliance_score) + '%' if final_compliance_score != 'N/A' else 'N/A'
            else:
                print(f"⚠️ brand_data is not a dict, it's {type(brand_data)}: {brand_data}")
                final_compliance_score = 'N/A'
                final_compliance_display = 'N/A'
        
            if isinstance(brand_data, dict):
                ai_response = str(brand_data.get('ai_response', 'N/A'))[:300]
                if len(str(brand_data.get('ai_response', ''))) > 300:
                    ai_response += "..."
                else:
                    ai_response = 'N/A'
          
            if isinstance(brand_data, dict):
                compliance_analysis = brand_data.get('compliance_analysis', {})
                if isinstance(compliance_analysis, dict):
                    llm_answers = str(compliance_analysis.get('llm_answers', 'N/A'))[:200]
                if len(str(compliance_analysis.get('llm_answers', ''))) > 200:
                    llm_answers += "..."
                else:
                    llm_answers = 'N/A'
            else:
                llm_answers = 'N/A'
        
            cards_html += f'''
            <div class="analysis-card" style="background: linear-gradient(135deg, #90EE90 0%, #98FB98 100%);">
            <div class="card-header">
            <h4>Brand Compliance</h4>
            <div class="score-display">{brand_score}</div>
            </div>
            <div class="card-content">
            <div class="details-container">
            <div class="detail-item"><strong>Compliance Level:</strong> {compliance_level}</div>
            <div class="detail-item"><strong>File Type:</strong> {file_type}</div>
            <div class="detail-item"><strong>Logo Images Loaded:</strong> {logo_images_loaded}</div>
            <div class="detail-item"><strong>Brand Colors:</strong> {brand_colors}</div>
            <div class="detail-item"><strong>Tone of Voice:</strong> {tone_of_voice}</div>
            <div class="detail-item"><strong>Final Compliance Score:</strong> <span class="score-highlight">{final_compliance_display}</span></div>
            <div class="detail-item"><strong>AI Response:</strong> {ai_response}</div>
            <div class="detail-item"><strong>LLM Answers:</strong> {llm_answers}</div>
            </div>
            <button class="show-details-btn" onclick="toggleCardDetails(this)">
            <span class="btn-text">Show Details</span>
            <span class="btn-icon"></span>
            </button>
            </div>
            </div>
            '''
    
    # Generate HTML
        html_content = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Analysis Details - {ad_title}</title>
        <style>
        * {{
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        }}
        
        body {{
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        line-height: 1.6;
        color: #333;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
        padding: 20px;
        }}
        
        .container {{
        max-width: 1200px;
        margin: 0 auto;
        background: white;
        border-radius: 15px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        overflow: hidden;
        }}
        
        .header {{
        background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
        color: white;
        padding: 30px;
        text-align: center;
        }}
        
        .header h1 {{
        font-size: 2.5em;
        margin-bottom: 10px;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }}
        
        .header .subtitle {{
        font-size: 1.2em;
        opacity: 0.9;
        }}
        
        .content {{
        padding: 30px;
        }}
        
        .info-grid {{
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
        margin-bottom: 30px;
        }}
        
        .info-card {{
        background: #f8f9fa;
        padding: 20px;
        border-radius: 10px;
        border-left: 4px solid #007bff;
        }}
        
        .info-card h3 {{
        color: #2c3e50;
        margin-bottom: 10px;
        font-size: 1.1em;
        }}
        
        .info-card p {{
        color: #666;
        word-break: break-all;
        }}
        
        .media-preview {{
        text-align: center;
        margin: 30px 0;
        padding: 20px;
        background: #f8f9fa;
        border-radius: 10px;
        }}
        
        .media-preview img {{
        max-width: 100%;
        max-height: 400px;
        border-radius: 10px;
        box-shadow: 0 10px 20px rgba(0,0,0,0.1);
        }}
        
        .analysis-section {{
        margin: 30px 0;
        background: #fff;
        border-radius: 10px;
        border: 1px solid #e9ecef;
        overflow: hidden;
        }}
        
        .section-header {{
        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
        color: white;
        padding: 15px 20px;
        font-weight: bold;
        font-size: 1.2em;
        }}
        
        .section-content {{
        padding: 20px;
        background: #f8f9fa;
        }}
        
        .analysis-cards-grid {{
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
        gap: 1.5rem;
        padding: 20px;
        }}
        
        .analysis-card {{
        border-radius: 12px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        position: relative;
        min-height: 300px;
        overflow: hidden;
        }}
        
        .card-header {{
        padding: 2rem;
        padding-bottom: 1rem;
        }}
        
        .card-header h4 {{
        font-size: 1.25rem;
        font-weight: 600;
        color: #1f2937;
        margin-bottom: 1rem;
        margin: 0;
        }}
        
        .score-display {{
        font-size: 2.5rem;
        font-weight: 700;
        color: #f59e0b;
        margin-bottom: 0.5rem;
        }}
        
        .card-content {{
        padding: 0 2rem 2rem 2rem;
        }}
        
        .details-container {{
        max-height: 0;
        overflow: hidden;
        padding: 0;
        transition: max-height 0.3s ease-out, padding 0.3s ease-out;
        background: rgba(255, 255, 255, 0.5);
        border-radius: 8px;
        margin-bottom: 1rem;
        }}
        
        .details-container.expanded {{
        max-height: 1000px;
        padding: 1rem;
        }}
        
        .detail-item {{
        margin-bottom: 0.75rem;
        padding: 0.5rem 0;
        border-bottom: 1px solid rgba(0,0,0,0.1);
        }}
        
        .detail-item:last-child {{
        border-bottom: none;
        }}
        
        .detail-item strong {{
        color: #374151;
        font-weight: 600;
        }}
        
        .score-highlight {{
        color: #000000;
        font-weight: bold;
        }}
        
        .boolean-highlight {{
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        padding: 2px 8px;
        border-radius: 4px;
        font-weight: bold;
        }}
        
        .platform-section {{
        background: rgba(255, 255, 255, 0.7);
        padding: 1rem;
        border-radius: 6px;
        margin-bottom: 1rem;
        }}
        
        .platform-section h5 {{
        color: #1f2937;
        font-weight: 600;
        margin-bottom: 0.5rem;
        font-size: 1.1rem;
        }}
        
        .guideline-details {{
        margin-left: 1rem;
        padding-left: 1rem;
        border-left: 3px solid #e5e7eb;
        }}
        
        .nested-details {{
        margin-left: 1rem;
        margin-top: 0.5rem;
        padding-left: 1rem;
        border-left: 2px solid #e5e7eb;
        }}
        
        .show-details-btn {{
        width: 100%;
        padding: 0.75rem;
        background: linear-gradient(135deg, #6366f1, #4f46e5);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        }}
        
        .show-details-btn:hover {{
        background: linear-gradient(135deg, #4f46e5, #3730a3);
        transform: translateY(-1px);
        }}
        
        .btn-icon {{
        transition: transform 0.2s;
        }}
        
        .show-details-btn.expanded .btn-icon {{
        transform: rotate(180deg);
        }}
        
        .expandable-detail {{
        margin-top: 0.5rem;
        }}
        
        .detail-preview {{
        color: #6b7280;
        font-style: italic;
        }}
        
        .detail-full {{
        background: #f9fafb;
        padding: 1rem;
        border-radius: 6px;
        margin-top: 0.5rem;
        border: 1px solid #e5e7eb;
        white-space: pre-wrap;
        }}
        
        .show-more-btn {{
        background: #6366f1;
        color: white;
        border: none;
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 0.8rem;
        cursor: pointer;
        margin-top: 0.5rem;
        }}
        
        .show-more-btn:hover {{
        background: #4f46e5;
        }}
        
        .dict-container {{
        border-left: 3px solid #007bff;
        padding-left: 15px;
        margin: 10px 0;
        background: rgba(0, 123, 255, 0.02);
        border-radius: 5px;
        padding: 10px 15px;
        }}
        
        .dict-container.important-section {{
        border-left: 5px solid #28a745;
        background: rgba(40, 167, 69, 0.05);
        box-shadow: 0 2px 5px rgba(40, 167, 69, 0.1);
        }}
        
        .dict-container.analysis-feature {{
        border-left: 4px solid #fd7e14;
        background: rgba(253, 126, 20, 0.03);
        margin: 15px 0;
        }}
        
        .dict-item {{
        margin: 12px 0;
        padding: 8px 0;
        border-bottom: 1px solid rgba(0,0,0,0.05);
        }}
        
        .dict-item:last-child {{
        border-bottom: none;
        }}
        
        .dict-key {{
        color: #d73a49;
        font-weight: bold;
        font-size: 14px;
        display: inline-block;
        min-width: 150px;
        background: rgba(215, 58, 73, 0.1);
        padding: 2px 6px;
        border-radius: 3px;
        }}
        
        .dict-key[data-key="metaphor_analysis"],
        .dict-key[data-key="content_analysis"],
        .dict-key[data-key="channel_compliance"],
        .dict-key[data-key="brand_compliance"] {{
        background: rgba(40, 167, 69, 0.15);
        color: #155724;
        font-weight: 900;
        font-size: 15px;
        }}
        
        .dict-value {{
        margin-left: 20px;
        margin-top: 8px;
        }}
        
        .list-container {{
        border-left: 3px solid #28a745;
        padding-left: 15px;
        margin: 10px 0;
        background: rgba(40, 167, 69, 0.02);
        border-radius: 5px;
        padding: 10px 15px;
        }}
        
        .list-item {{
        margin: 8px 0;
        padding: 5px 0;
        }}
        
        .list-index {{
        color: #6f42c1;
        font-weight: bold;
        background: rgba(111, 66, 193, 0.1);
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 13px;
        }}
        
        .list-value {{
        margin-left: 15px;
        margin-top: 5px;
        }}
        
        .string-value {{
        color: #032f62;
        background: rgba(3, 47, 98, 0.05);
        padding: 2px 4px;
        border-radius: 3px;
        }}
        
        .number-value {{
        color: #005cc5;
        font-weight: bold;
        background: rgba(0, 92, 197, 0.1);
        padding: 2px 6px;
        border-radius: 3px;
        }}
        
        .score-value {{
        color: #e83e8c;
        font-weight: bold;
        background: rgba(232, 62, 140, 0.1);
        padding: 3px 8px;
        border-radius: 5px;
        font-size: 14px;
        border: 1px solid rgba(232, 62, 140, 0.2);
        }}
        
        .boolean-value {{
        color: #e36209;
        font-weight: bold;
        background: rgba(227, 98, 9, 0.1);
        padding: 2px 6px;
        border-radius: 3px;
        text-transform: uppercase;
        font-size: 12px;
        }}
        
        .null-value {{
        color: #6a737d;
        font-style: italic;
        background: rgba(106, 115, 125, 0.1);
        padding: 2px 6px;
        border-radius: 3px;
        }}
        
        .empty-dict, .empty-list {{
        color: #6a737d;
        font-style: italic;
        background: rgba(106, 115, 125, 0.05);
        padding: 5px 10px;
        border-radius: 5px;
        }}
        
        .long-string {{
        color: #032f62;
        cursor: help;
        border-bottom: 1px dotted #032f62;
        background: rgba(3, 47, 98, 0.05);
        padding: 2px 4px;
        border-radius: 3px;
        }}
        
        .multiline-string {{
        color: #032f62;
        background: rgba(3, 47, 98, 0.05);
        padding: 8px;
        border-radius: 5px;
        display: block;
        white-space: pre-wrap;
        border-left: 3px solid #032f62;
        }}
        
        .expandable-string {{
        margin: 5px 0;
        }}
        
        .string-preview {{
        color: #032f62;
        background: rgba(3, 47, 98, 0.05);
        padding: 2px 4px;
        border-radius: 3px;
        }}
        
        .string-full {{
        background: #f8f9fa;
        padding: 10px;
        border-radius: 5px;
        border: 1px solid #dee2e6;
        margin: 5px 0;
        white-space: pre-wrap;
        max-height: 200px;
        overflow-y: auto;
        }}
        
        .expand-btn {{
        background: #007bff;
        color: white;
        border: none;
        padding: 4px 8px;
        border-radius: 3px;
        font-size: 12px;
        cursor: pointer;
        margin-left: 10px;
        }}
        
        .expand-btn:hover {{
        background: #0056b3;
        }}
        
        .other-value {{
        color: #6c757d;
        background: rgba(108, 117, 125, 0.1);
        padding: 2px 4px;
        border-radius: 3px;
        }}
        
        .back-button {{
        display: inline-block;
        background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
        color: white;
        padding: 12px 24px;
        text-decoration: none;
        border-radius: 25px;
        margin-bottom: 20px;
        transition: transform 0.2s;
        }}
        
        .back-button:hover {{
        transform: translateY(-2px);
        box-shadow: 0 5px 15px rgba(0,123,255,0.3);
        }}
        
        .timestamp {{
        color: #6c757d;
        font-size: 0.9em;
        text-align: center;
        margin-top: 30px;
        padding-top: 20px;
        border-top: 1px solid #e9ecef;
        }}
        
        @media (max-width: 768px) {{
        .container {{
        margin: 10px;
        border-radius: 10px;
        }}
            
        .header {{
        padding: 20px;
        }}
            
        .header h1 {{
        font-size: 2em;
        }}
            
        .content {{
        padding: 20px;
        }}
            
        .info-grid {{
        grid-template-columns: 1fr;
        }}
        }}
        </style>
        </head>
        <body>
        <div class="container">
        <div class="header">
        <h1>Analysis Details</h1>
        <div class="subtitle">Complete Data Structure View</div>
        </div>
        
        <div class="content">
        <a href="javascript:history.back()" class="back-button">← Back to Libraries</a>
            
        <div class="info-grid">
        <div class="info-card">
        <h3>Analysis Information</h3>
        <p><strong>ID:</strong> {analysis_id}</p>
        <p><strong>Title:</strong> {ad_title}</p>
        <p><strong>Timestamp:</strong> {timestamp}</p>
        </div>
                
        <div class="info-card">
        <h3>User & Brand</h3>
        <p><strong>User ID:</strong> {user_id}</p>
        <p><strong>Brand ID:</strong> {brand_id}</p>
        <p><strong>Brand Name:</strong> {brand_name}</p>
        </div>
        </div>
            
        {f'''
        <div class="media-preview">
        <h3>Analyzed Media</h3>
        <img src="{media_url}" alt="Analyzed Media" onerror="this.style.display='none'">
        </div>
        ''' if media_url else ''}
            
        <div class="analysis-section">
        <div class="section-header">
        Ad Analyzer Results - Detailed View
        </div>
        <div class="analysis-cards-grid">
        {cards_html}
        </div>
        </div>
            
        <div class="timestamp">
        Generated on: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC
        </div>
        </div>
        </div>
    
        <script>
        function toggleCardDetails(button) {{
        const detailsContainer = button.parentElement.querySelector('.details-container');
        const btnText = button.querySelector('.btn-text');
            
        if (detailsContainer.style.maxHeight && detailsContainer.style.maxHeight !== '0px') {{
        detailsContainer.style.maxHeight = '0px';
        detailsContainer.style.padding = '0';
        btnText.textContent = 'Show Details';
        button.classList.remove('expanded');
        }} else {{
        detailsContainer.style.maxHeight = '1000px';
        detailsContainer.style.padding = '1rem';
        btnText.textContent = 'Hide Details';
        button.classList.add('expanded');
        }}
        }}
        
        function toggleDetail(button) {{
        const detailFull = button.parentElement.querySelector('.detail-full');
            
        if (detailFull.style.display === 'none') {{
        detailFull.style.display = 'block';
        button.textContent = 'Show Less';
        }} else {{
        detailFull.style.display = 'none';
        button.textContent = 'Show More';
        }}
        }}
        </script>
        </body>
        </html>"""
    
        return html_content


# ================================
# DATA VALIDATION FUNCTIONS
# ================================

def validate_analysis_data_structure(data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate analysis data structure and ensure it meets standards"""
        validation_result = {
        "is_valid": True,
        "errors": [],
        "warnings": [],
        "data_version": "unknown"
        }
    
        try:
        # Check for required fields
            required_fields = ['userId', 'ai_analysis_results', 'timestamp']
            for field in required_fields:
                if field not in data:
                    validation_result["errors"].append(f"Missing required field: {field}")
                    validation_result["is_valid"] = False
        
            # Check data structure version
            if 'data_structure_version' in data:
                validation_result["data_version"] = data['data_structure_version']
            if not data['data_structure_version'].startswith('2.0'):
                validation_result["warnings"].append("Using legacy data structure version")
            else:
                validation_result["warnings"].append("No data structure version specified")
        
            # Validate AI analysis results structure
            ai_results = data.get('ai_analysis_results', {})
            if not ai_results:
                validation_result["errors"].append("Empty ai_analysis_results")
                validation_result["is_valid"] = False
            else:
                # Check for direct structure (preferred)
                expected_keys = ['metaphor_analysis', 'content_analysis', 'channel_compliance', 'brand_compliance']
                found_keys = [key for key in expected_keys if key in ai_results]
            
                if not found_keys:
                    # Check for legacy comprehensive-analysis structure
                    if 'comprehensive-analysis' in ai_results:
                        validation_result["warnings"].append("Using legacy comprehensive-analysis structure")
                    else:
                        validation_result["errors"].append("No valid analysis structure found")
                        validation_result["is_valid"] = False
                else:
                    validation_result["data_version"] = "2.0_direct"
                
                    # Validate scores are not zero/null
                    if 'metaphor_analysis' in ai_results:
                        metaphor = ai_results['metaphor_analysis']
                        if isinstance(metaphor, dict) and 'message_intent' in metaphor:
                            intent_score = metaphor['message_intent'].get('intent_compliance_score', 0)
                        if intent_score == 0 or intent_score is None:
                            validation_result["warnings"].append("Message intent score is 0 or null - may be placeholder data")
                
                    if 'content_analysis' in ai_results:
                        content = ai_results['content_analysis']
                        if isinstance(content, dict):
                            purchase_score = content.get('overall_purchase_intent_percentage', 0)
                        if purchase_score == 0 or purchase_score is None:
                            validation_result["warnings"].append("Purchase intent score is 0 or null - may be placeholder data")
        
                # Check timestamp format
                timestamp = data.get('timestamp')
                if timestamp:
                    try:
                        if isinstance(timestamp, str):
                            datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                        elif hasattr(timestamp, 'timestamp'):
                            # Firestore timestamp
                            pass
                        else:
                            validation_result["warnings"].append("Unusual timestamp format")
                    except:
                        validation_result["warnings"].append("Invalid timestamp format")
        
        except Exception as e:
            validation_result["errors"].append(f"Validation error: {str(e)}")
            validation_result["is_valid"] = False
        
        return validation_result

        def ensure_data_consistency(data: Dict[str, Any]) -> Dict[str, Any]:
            """Ensure data consistency and fix common issues"""
            try:
                # Ensure data structure version is set
                if 'data_structure_version' not in data:
                    data['data_structure_version'] = '2.0_direct'
        
                # Ensure migration timestamp is set
                if 'migration_timestamp' not in data:
                    data['migration_timestamp'] = datetime.now().isoformat()
        
                # Ensure ai_analysis_results uses direct structure
                ai_results = data.get('ai_analysis_results', {})
                if 'comprehensive-analysis' in ai_results and not any(key in ai_results for key in ['metaphor_analysis', 'content_analysis']):
                    # Convert comprehensive-analysis to direct structure
                    comp_data = ai_results['comprehensive-analysis']
                    if comp_data.get('success') and 'data' in comp_data:
                        results = comp_data['data'].get('results', {})
                        # Move results to top level
                        for key, value in results.items():
                            ai_results[key] = value
                        # Remove comprehensive-analysis wrapper
                    del ai_results['comprehensive-analysis']
                    data['conversion_note'] = 'Converted from comprehensive-analysis to direct structure'
        
                # Ensure required metadata
                if 'source' not in data:
                    data['source'] = 'unknown'
        
                return data
        
            except Exception as e:
                print(f"❌ Error ensuring data consistency: {str(e)}")
                return data

# REMOVED: /validate-analysis-data - Unused admin endpoint

# REMOVED: /data-health-check/{user_id} - Unused admin endpoint

# REMOVED: /sync-plan/{user_id} - Unused admin endpoint

# Debug endpoint to check user profile data
# Debug endpoint to check user plan status
@app.get("/analysis-details-html/{analysis_id}")
async def get_analysis_details_html(analysis_id: str):
    """Generate and return HTML details page for analysis results"""
    try:
        print(f"🔍 HTML DETAILS: Getting analysis data for ID: {analysis_id}")
        
        # Get analysis data
        unified_response = await get_unified_analysis_data(analysis_id)
        if not unified_response["success"]:
            return HTMLResponse(
                content=f"<html><body><h1>Error</h1><p>Analysis not found: {unified_response.get('error', 'Unknown error')}</p></body></html>",
                status_code=404
            )
        
        analysis_data = unified_response["full_data"]
        print(f"🔍 HTML DETAILS: Retrieved analysis data with keys: {list(analysis_data.keys())}")
        
        # **FIX**: Use stored selectedFeatures from analysis data, not current user plan
        stored_selected_features = analysis_data.get('selectedFeatures', [])
        stored_plan_type = None
        
        if 'plan_usage_at_time' in analysis_data:
            plan_info = analysis_data['plan_usage_at_time']
            stored_plan_type = plan_info.get('planName', '').lower()
        
        print(f"🔍 HTML DETAILS: Using stored selectedFeatures: {stored_selected_features}")
        print(f"🔍 HTML DETAILS: Using stored plan type: {stored_plan_type}")
        
        # Generate HTML using stored features from analysis time
        html_content = generate_detailed_analysis_html(
            analysis_data, 
            analysis_id, 
            selected_features=stored_selected_features,
            user_plan_type=stored_plan_type
        )
        
        return HTMLResponse(content=html_content)
        
    except Exception as e:
        print(f"❌ HTML DETAILS ERROR: {str(e)}")
        return HTMLResponse(
            content=f"<html><body><h1>Error</h1><p>Failed to generate analysis details: {str(e)}</p></body></html>",
            status_code=500
        )

print("[MODULE] Module loaded successfully, checking main execution...")
if __name__ == "__main__":
        import uvicorn
        print("[SERVER] Starting server on http://0.0.0.0:8002")
        #uvicorn.run(app, host="0.0.0.0", port=8002, log_level="info")
        uvicorn.run(app, host="0.0.0.0", port=8002)
else:
        print("[MODULE] Module imported (not running as main)")