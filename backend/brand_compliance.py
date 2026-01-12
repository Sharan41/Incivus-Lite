import google.generativeai as genai
import tempfile
import cv2
from PIL import Image as PILImage
import os
import time
import re
import json
import argparse
import base64
from io import BytesIO
import torch
from transformers import (
    pipeline,
    AutoModelForSpeechSeq2Seq,
    AutoProcessor
)
import numpy as np
import librosa
import logging
try:
    from moviepy.editor import VideoFileClip
except ImportError:
    try:
        from moviepy import VideoFileClip
    except ImportError:
        print("Warning: MoviePy not available - video processing will be limited")
        VideoFileClip = None
 
# === Gemini API Setup ===
genai.configure(api_key="AIzaSyDR4KZlsD3HcNkk16sbkqkLXHdRx2uzi_M")
model = genai.GenerativeModel("gemini-2.5-pro")
 
# === Updated Prompt ===
def generate_prompt(brand_logo_paths=None, colors=None, tones=None, extracted_text=None):
    prompt = """
    Analyze this advertisement for brand compliance. Answer the following questions with ONLY "Yes" or "No":
   
    1. "Is ANY of the uploaded Brand Logos visible/present IN THIS ADVERTISEMENT?" (If any of the uploaded logos are visible, answer YES)
    2. Is the Contrast of the Brand Logo sufficient?
    3. Is the Size of the Brand's Logo high?
    4. Are all the colors selected in the input present in this Ad?
    5. Are all the Tone of Voices selected as an input present in the Ad?
   
    Provide your answers in this exact format:
    Q1: [Yes/No]
    Q2: [Yes/No]
    Q3: [Yes/No]
    Q4: [Yes/No]
    Q5: [Yes/No]
   
    Base your analysis on:
    - Brand Logos: {logo_info}
    - Brand Colors: {colors_info}
    - Expected Tone of Voice: {tones_info}
    - Extracted Audio Text: {text_info}
   
    IMPORTANT: For question 5, analyze:
    - For videos: Analyze the extracted Audio Text {text_info} and the video content to determine if the expected tone of voice {tones_info} are present.
    - For images: Analyze any visible text content, headlines, slogans, or copy in the image to determine if the expected tones are present
    - If no relevant content is available to determine tone, answer "No" for question 5
    - Focus on the advertisement's intended message and brand communication
    """
   
    logo_info = f"Available for analysis ({len(brand_logo_paths)} logos)" if brand_logo_paths else "Not provided"
    colors_info = colors if colors else "Not provided"
    tones_info = tones if tones else "Not provided"
    
    # Handle text info based on whether it's audio text or instruction to analyze visible text
    if extracted_text:
        if extracted_text == "Analyze visible text content in the image":
            text_info = "Analyze visible text content in the image for tone evaluation"
        else:
            text_info = extracted_text
    else:
        text_info = "Not provided"
   
    return prompt.format(
        logo_info=logo_info,
        colors_info=colors_info,
        tones_info=tones_info,
        text_info=text_info
    )
 
# === Frame extraction from video ===
def extract_frames(video_path, fps=2):
    frames = []
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return frames
 
    video_fps = cap.get(cv2.CAP_PROP_FPS)
    interval = int(video_fps // fps) if video_fps >= fps else 1
 
    count = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if count % interval == 0:
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_img = PILImage.fromarray(frame_rgb)
            frames.append(pil_img)
        count += 1
    cap.release()
    return frames
 
# === Scoring Function ===
def calculate_compliance_score(llm_answers, expected_answers):
    """
    Calculate compliance score based on LLM answers vs expected answers
    """
    if len(llm_answers) != len(expected_answers):
        return 0
   
    matches = 0
    for llm_ans, exp_ans in zip(llm_answers, expected_answers):
        if llm_ans.lower() == exp_ans.lower():
            matches += 1
   
    return (matches / len(expected_answers)) * 100
 
# === Parse LLM Response ===
def parse_llm_response(response_text):
    """
    Parse the LLM response to extract Yes/No answers
    """
    answers = []
    lines = response_text.strip().split('\n')
   
    for line in lines:
        if line.startswith('Q') and ':' in line:
            answer = line.split(':')[1].strip()
            if answer.lower() in ['yes', 'no']:
                answers.append(answer)
   
    return answers
 
# === Load and process logo images ===
def load_logo_images(logo_paths):
    """Load logo images and convert to PIL format"""
    logo_images = []
    for logo_path in logo_paths:
        if os.path.exists(logo_path):
            try:
                logo_img = PILImage.open(logo_path)
                logo_images.append(logo_img)
                print(f"✅ Loaded logo: {logo_path}")
            except Exception as e:
                print(f"❌ Error loading logo {logo_path}: {str(e)}")
        else:
            print(f"⚠️ Logo file not found: {logo_path}")
   
    return logo_images
 
# === Audio and Speech Processing Functions ===
# Import the separated audio and speech processing modules
try:
    from audio_extract import extract_audio_with_moviepy, cleanup_audio_file
    from speech2text import extract_text_from_audio_file
    AUDIO_MODULES_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Audio modules not available: {e}")
    AUDIO_MODULES_AVAILABLE = False
 
# Removed analyze_tone_of_voice function - extracted text will be sent directly to LLM for analysis
 
# === Main Analysis Function ===
def analyze_brand_compliance(ad_file_path, logo_paths=None, colors=None, tones=None, enable_audio=True):
    """
    Analyze brand compliance for an advertisement
   
    Args:
        ad_file_path: Path to the advertisement file (image or video)
        logo_paths: List of paths to brand logo images
        colors: List of brand color hex codes
        tones: List of tone of voice options
        enable_audio: Whether to enable audio processing (default: True)
    """
   
    # Load logo images
    logo_images = []
    if logo_paths:
        logo_images = load_logo_images(logo_paths)
   
    # Prepare inputs for prompt
    colors_list = colors if colors else []
    tones_list = tones if tones else []
   
    # Generate prompt
    prompt = generate_prompt(
        brand_logo_paths=logo_paths,
        colors=colors_list,
        tones=tones_list,
        extracted_text=""
    )
   
    # Determine file type
    file_extension = os.path.splitext(ad_file_path)[1].lower()
    is_video = file_extension in ['.mp4', '.mov', '.avi', '.mkv']
   
    # Initialize audio analysis variables
    extracted_text = ""
   
    try:
        if is_video:
            # Video analysis with audio processing
            print("🎬 Analyzing video advertisement...")
            frames = extract_frames(ad_file_path, fps=2)
            if not frames:
                return {"error": "No frames extracted from the video"}
           
            # Always extract audio from video for tone analysis
            if AUDIO_MODULES_AVAILABLE:
                print("🔊 Extracting audio from video...")
                temp_audio_path = extract_audio_with_moviepy(ad_file_path)
               
                if temp_audio_path and os.path.exists(temp_audio_path):
                    try:
                        # Extract text from audio using the separated module
                        print("📝 Extracting text from audio...")
                        extracted_text = extract_text_from_audio_file(temp_audio_path)
                       
                        if extracted_text:
                            print(f"✅ Extracted text: {extracted_text[:100]}...")
                            print(f"🎯 Expected tones: {tones_list}")
                           
                            # Regenerate prompt with extracted text for LLM tone analysis
                            prompt = generate_prompt(
                                brand_logo_paths=logo_paths,
                                colors=colors_list,
                                tones=tones_list,
                                extracted_text=extracted_text
                            )
                            print("📝 Updated prompt with extracted text for LLM tone analysis")
                        else:
                            print("⚠️ No text extracted from audio")
                            # Regenerate prompt without extracted text
                            prompt = generate_prompt(
                                brand_logo_paths=logo_paths,
                                colors=colors_list,
                                tones=tones_list,
                                extracted_text=""
                            )
                           
                    except Exception as e:
                        print(f"⚠️ Audio processing failed: {e}")
                        print("🔄 Continuing with visual analysis only...")
                        # Regenerate prompt without extracted text
                        prompt = generate_prompt(
                            brand_logo_paths=logo_paths,
                            colors=colors_list,
                            tones=tones_list,
                            extracted_text=""
                        )
                   
                    # Clean up temporary audio file
                    cleanup_audio_file(temp_audio_path)
                else:
                    print("⚠️ Audio extraction failed, continuing with visual analysis only...")
                    # Regenerate prompt without extracted text
                    prompt = generate_prompt(
                        brand_logo_paths=logo_paths,
                        colors=colors_list,
                        tones=tones_list,
                        extracted_text=""
                    )
            else:
                print("🔇 Audio modules not available, focusing on visual analysis...")
                # Regenerate prompt without extracted text
                prompt = generate_prompt(
                    brand_logo_paths=logo_paths,
                    colors=colors_list,
                    tones=tones_list,
                    extracted_text=""
                )
           
            # Prepare content for AI model
            content_parts = [prompt] + frames
           
            # Add logo images if provided
            if logo_images:
                for logo_img in logo_images:
                    content_parts.append(logo_img)
           
            response = model.generate_content(content_parts)
           
        else:
            # Image analysis - no audio processing
            print("🖼️ Analyzing image advertisement...")
            image = PILImage.open(ad_file_path)
           
            # For images, analyze visible text content for tone (no audio)
            print("📝 Analyzing visible text content in image for tone evaluation...")
            print(f"🎯 Expected tones: {tones_list}")
           
            # Regenerate prompt for image analysis (no audio text)
            prompt = generate_prompt(
                brand_logo_paths=logo_paths,
                colors=colors_list,
                tones=tones_list,
                extracted_text="Analyze visible text content in the image"
            )
           
            # Prepare content for AI model
            content_parts = [prompt, image]
           
            # Add logo images if provided
            if logo_images:
                for logo_img in logo_images:
                    content_parts.append(logo_img)
           
            response = model.generate_content(content_parts)
       
        # Parse response
        if response and hasattr(response, "text"):
            llm_answers = parse_llm_response(response.text)
           
            if len(llm_answers) == 5:
                # Define expected answers
                expected_answers = ["Yes", "Yes", "Yes", "Yes", "Yes"]
               
                # Questions for reference
                questions = [
                    "Is the Brand logo present?",
                    "Is the Contrast of the Brand Logo sufficient?",
                    "Is the Relative Size of the Brand's Logo High?",
                    "Are all the colors selected in the input present in this Ad?",
                    "Are all the Tone of Voices selected as an input present in the Ad?"
                ]
               
                # Calculate scores
                scores = []
                for llm_ans, exp_ans in zip(llm_answers, expected_answers):
                    score = 1 if llm_ans.lower() == exp_ans.lower() else 0
                    scores.append(score)
               
                final_score = calculate_compliance_score(llm_answers, expected_answers)
               
                # Prepare results
                results = {
                    "file_path": ad_file_path,
                    "file_type": "video" if is_video else "image",
                    "logo_images_loaded": len(logo_images),
                    "brand_colors": colors_list,
                    "tone_of_voice": tones_list,
                    "ai_response": response.text,
                    "compliance_analysis": {
                        "questions": questions,
                        "llm_answers": llm_answers,
                        "expected_answers": expected_answers,
                        "scores": scores,
                        "final_compliance_score": round(final_score, 1)
                    },
                    "compliance_level": "High" if final_score >= 80 else "Medium" if final_score >= 60 else "Low",
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
                }
               
                # Add audio analysis results for videos
                if is_video:
                    results["audio_analysis"] = {
                        "extracted_text": extracted_text,
                        "audio_processed": bool(extracted_text),
                        "analysis_method": "Direct LLM analysis of extracted audio text"
                    }
                    if not extracted_text:
                        results["audio_analysis"]["error"] = "Audio processing failed or no text extracted"
               
                return results
            else:
                return {"error": f"Could not parse AI response properly. Expected 5 Yes/No answers, got {len(llm_answers)}"}
        else:
            return {"error": "No response received from AI"}
           
    except Exception as e:
        return {"error": f"Analysis failed: {str(e)}"}
 
def main():
    parser = argparse.ArgumentParser(description="Brand Compliance Analysis Tool")
    parser.add_argument("ad_file", help="Path to the advertisement file (image or video)")
    parser.add_argument("--logo-images", nargs="+", help="Paths to brand logo images")
    parser.add_argument("--colors", nargs="+", help="Brand color hex codes")
    parser.add_argument("--tones", nargs="+", help="Tone of voice options")
    parser.add_argument("--output", default="brand_compliance_results.json", help="Output JSON file path")
   
    args = parser.parse_args()
   
    # Validate input file
    if not os.path.exists(args.ad_file):
        print(f"❌ Error: Advertisement file not found: {args.ad_file}")
        return
   
    # Available tone options
    tone_options = ["funny", "neutral", "serious", "casual", "formal", "irrelevant", "respectful", "enthusiastic", "matter of fact"]
   
    # Validate tones if provided
    if args.tones:
        invalid_tones = [tone for tone in args.tones if tone not in tone_options]
        if invalid_tones:
            print(f"⚠️ Warning: Invalid tone options: {invalid_tones}")
            print(f"Valid options: {tone_options}")
   
    print("🚀 Starting Brand Compliance Analysis...")
    print(f"📁 Advertisement: {args.ad_file}")
    print(f"🖼️ Logo images: {len(args.logo_images) if args.logo_images else 0}")
    print(f"🎨 Brand colors: {len(args.colors) if args.colors else 0}")
    print(f"🎭 Tone of voice: {len(args.tones) if args.tones else 0}")
    print("-" * 50)
   
    # Run analysis
    results = analyze_brand_compliance(
        ad_file_path=args.ad_file,
        logo_paths=args.logo_images,
        colors=args.colors,
        tones=args.tones
    )
   
    # Save results
    with open(args.output, 'w') as f:
        json.dump(results, f, indent=2)
   
    print(f"✅ Results saved to: {args.output}")
   
    # Display summary
    if "error" not in results:
        score = results["compliance_analysis"]["final_compliance_score"]
        level = results["compliance_level"]
        print(f"📊 Final Compliance Score: {score}%")
        print(f"🏆 Compliance Level: {level}")
    else:
        print(f"❌ Analysis failed: {results['error']}")
 
if __name__ == "__main__":
    main()