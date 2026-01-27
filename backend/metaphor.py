#!/usr/bin/env python3
"""
Metaphor Ad Analysis using Google Gemini API
Analyzes Ad and image advertisements for metaphor detection and effectiveness.
"""

import os
import re
import cv2
import tempfile
import imageio.v3 as iio
import google.generativeai as genai
import argparse
from typing import List, Dict, Any, Optional
from PIL import Image
import base64
import io
import json

# Configure Gemini API
GEMINI_API_KEY = "AIzaSyDR4KZlsD3HcNkk16sbkqkLXHdRx2uzi_M"
genai.configure(api_key=GEMINI_API_KEY)

def extract_frames_from_ad(ad_path, fps=2):
    """
    Extracts frames from Ad at given FPS.
    Returns list of bytes for each image frame.
    """
    frames = []
    cap = cv2.VideoCapture(ad_path)
    if not cap.isOpened():
        raise ValueError("Error opening Ad file")

    original_fps = cap.get(cv2.CAP_PROP_FPS)
    frame_interval = int(original_fps / fps)

    frame_idx = 0
    success, frame = cap.read()
    while success:
        if frame_idx % frame_interval == 0:
            # Save to temp image file
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                temp_filename = tmp.name
                cv2.imwrite(temp_filename, frame)
                frames.append(temp_filename)
        success, frame = cap.read()
        frame_idx += 1

    cap.release()
    return frames

def build_prompt(ad_description: str, user_ad_type: str = "Not specified") -> str:
    prompt = (
        f"You are a world-class advertising analyst.\n"
        f"You are given a single image advertisement.\n\n"
        f"Your tasks are:\n"
        f"Summarize the core message of the ad in 2–3 sentences.\n"
        f"Describe the emotional tone (e.g., funny, serious, dramatic, inspiring, urgent).\n"
        f"Compare the content of the ad to the provided ad description and assign a core message summary (15–95):\n"
        f"   - 80–95: Very strong match - If the Ad description is **completely subsumed in the overall messaging of the ad**, then give a score between **80 to 95** depending on the level of subsumption. Use specific scores like 82, 87, 91, etc. rather than rounded numbers.\n"
        f"   - 60–79: Moderate match - If the Ad description is **partially subsumed in the overall messaging of the ad**, then give a score between **60 to 79** depending on the level of subsumption. Use specific scores like 63, 71, 76, etc. rather than rounded numbers.\n"
        f"   - 30–59: Weak match - If the Ad description is **poorly subsumed in the overall messaging of the ad**, then give a score between **30 to 59** depending on the level of subsumption. Use specific scores like 34, 47, 52, etc. rather than rounded numbers.\n"
        f"   - 15–29: Poor or no match - If the Ad description is **not subsumed at all in the overall messaging of the ad**, then give a score between **15 to 29** depending on the level of subsumption. Use specific scores like 17, 23, 27, etc. rather than rounded numbers.\n"
        f"Then, based only on the ad's storytelling, tone, message, and call-to-action, classify it into only one of the following categories:\n"
        f"   - Awareness Ad: Focuses on brand visibility or recall.\n"
        f"   - Consideration Ad: Highlights benefits, comparisons, or drives evaluation.\n"
        f"   - Conversion Ad: Strong CTA, urgency, drives immediate action or purchase.\n\n"
        f"After classification, assign a score between 15 and 95 for how well the ad performs within that category:\n"
        f"   - 80–95: Highly effective - Use granular scores like 83, 88, 92, etc. rather than rounded numbers.\n"
        f"   - 60–79: Moderately effective - Use granular scores like 64, 72, 77, etc. rather than rounded numbers.\n"
        f"   - 30–59: Weak or generic - Use granular scores like 35, 48, 53, etc. rather than rounded numbers.\n"
        f"   - 15–29: Poor, ineffective, or off-mark - Use granular scores like 18, 24, 28, etc. rather than rounded numbers.\n"
        f"Explain your reasoning clearly.\n"
        f"Finally, using your expertise as a top-tier creative ad strategist, suggest **actionable and imaginative ways** to improve the ad's impact **specifically within the detected category (Awareness, Consideration, or Conversion)**. The suggestions must be creative, specific, and aligned with advertising best practices. Write maximum 2 sentences.\n\n"
        f"Return only valid JSON in the following format:\n\n"
        f"{{\n"
        f"  \"message_intent\": {{\n"
        f"    \"intent_compliance_score\": <int>,\n"
        f"    \"core_message_summary\": <string>,\n"
        f"    \"emotional_tone\": <string>\n"
        f"  }},\n"
        f"  \"funnel_compatibility\": {{\n"
        f"    \"effectiveness_score\": <int>,\n"
        f"    \"user_selected_type\": \"{user_ad_type}\",\n"
        f"    \"classification\": \"Awareness\" | \"Consideration\" | \"Conversion\",\n"
        f"    \"match_with_user_selection\": \"Yes\" | \"No\",\n"
        f"    \"reasoning\": <string>,\n"
        f"    \"improvement_suggestion\": <string>\n"
        f"  }}\n"
        f"}}\n\n"
        f"Only return the JSON. Do not include any explanation or extra commentary."
    )
    return prompt

def parse_json_response(gemini_output: str) -> Dict[str, Any]:
    """Parse JSON response from Gemini API."""
    try:
        # Try to find JSON in the response
        json_start = gemini_output.find('{')
        json_end = gemini_output.rfind('}') + 1
        
        if json_start != -1 and json_end > json_start:
            json_str = gemini_output[json_start:json_end]
            return json.loads(json_str)
        else:
            return None
    except json.JSONDecodeError as e:
        print(f"JSON parsing error: {e}")
        return None

def analyze_ad(ad_description: str, user_selected_type: str, image_paths: list) -> Dict[str, Any]:
    prompt = build_prompt(ad_description, user_selected_type)

    model = genai.GenerativeModel("gemini-2.5-pro")

    contents = [prompt]
    for path in image_paths:
        image = Image.open(path)
        contents.append(image)

    gemini_response = model.generate_content(contents, stream=False)
    result_text = gemini_response.text

    print("---- GEMINI OUTPUT ----")
    print(result_text)
    print("-----------------------")

    # Parse JSON response
    analysis_result = parse_json_response(result_text)
    
    if analysis_result:
        # Extract classification and compare with user selection
        ai_classification = analysis_result.get('funnel_compatibility', {}).get('classification', '').lower()
        user_type_lower = user_selected_type.lower()
        match = ai_classification == user_type_lower
        
        # Add user selection and match information to the JSON
        analysis_result['funnel_compatibility']['user_selected_type'] = user_selected_type
        analysis_result['funnel_compatibility']['match_with_user_selection'] = 'Yes' if match else 'No'
        
        print(f"User Selected Type: {user_selected_type}")
        print(f"AI Classification: {ai_classification}")
        print(f"Match with User Selection: {'Yes' if match else 'No'}")
        
        # Print the structured analysis
        print("\n--- ANALYSIS RESULTS ---")
        print(json.dumps(analysis_result, indent=2))
        
        # Return the analysis result
        return analysis_result
        
    else:
        print("Could not parse JSON response from Gemini.")
        print("Raw output:")
        print(result_text)
        return {"error": "Could not parse JSON response from Gemini", "raw_output": result_text}

def cleanup_temp_files(paths):
    for path in paths:
        try:
            os.remove(path)
        except Exception:
            pass

def analyze_ad_in_batches(ad_path: str, ad_description: str, user_ad_type: str) -> Dict[str, Any]:
    """Analyze Ad in batches for metaphor detection."""
    try:
        # Extract frames
        image_paths = extract_frames_from_ad(ad_path, fps=2)
        
        if not image_paths:
            return {"error": "No frames extracted from Ad"}
        
        # Analyze the ad and capture the result
        analysis_result = analyze_ad(ad_description, user_ad_type, image_paths)
        
        # Return the analysis result
        return analysis_result
        
    except Exception as e:
        return {"error": f"Ad analysis failed: {str(e)}"}
    finally:
        if 'image_paths' in locals():
            cleanup_temp_files(image_paths)

def analyze_image(image_path: str, ad_description: str, user_ad_type: str) -> Dict[str, Any]:
    """Analyze single image for metaphor detection."""
    try:
        image_paths = [image_path]
        analysis_result = analyze_ad(ad_description, user_ad_type, image_paths)
        
        return analysis_result
        
    except Exception as e:
        return {"error": f"Image analysis failed: {str(e)}"}

def main():
    parser = argparse.ArgumentParser(description="Metaphor Ad Analysis")
    parser.add_argument("--ad", help="Path to Ad file")
    parser.add_argument("--image", help="Path to image file")
    parser.add_argument("--description", required=True, help="Ad description")
    parser.add_argument("--type", required=True, choices=["Awareness", "Consideration", "Conversion"], 
                       help="User selected ad type")
    parser.add_argument("--api-key", help="Google AI API key")
    
    args = parser.parse_args()
    
    # Handle backward compatibility for --video argument
    if hasattr(args, 'video') and args.video:
        args.ad = args.video
    
    # Get API key
    api_key = args.api_key or os.getenv("GOOGLE_AI_API_KEY") or GEMINI_API_KEY
    genai.configure(api_key=api_key)
    
    if args.ad:
        print(f"Analyzing Ad: {args.ad}")
        result = analyze_ad_in_batches(args.ad, args.description, args.type)
        print(f"Result: {result}")
        
    elif args.image:
        print(f"Analyzing image: {args.image}")
        result = analyze_image(args.image, args.description, args.type)
        print(f"Result: {result}")
        
    else:
        print("Please provide either --ad or --image argument")

if __name__ == "__main__":
    main()
