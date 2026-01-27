#!/usr/bin/env python3
"""
Video & Image Compliance Analysis Tool using Gemini Flash 1.5 (auto TikTok vertical check)
"""

import os
import sys
import json
import argparse
import time
from typing import List, Dict, Tuple
import cv2
import numpy as np
from PIL import Image
import base64
from io import BytesIO
import google.generativeai as genai

GEMINI_API_KEY = "AIzaSyDR4KZlsD3HcNkk16sbkqkLXHdRx2uzi_M"

# Model configuration for better reasoning consistency
TOP_P = 0.1  # Controls randomness - lower values (0.1-0.9) give more focused, consistent responses

# Batch processing configuration - API ERROR PREVENTION
BATCH_SIZE = 10  # Small batches to prevent large requests
RATE_LIMIT_DELAY = 3.0  # Longer delays to avoid quota issues
MAX_RETRIES = 2  # Fewer retries to avoid quota exhaustion
MAX_FRAMES_PER_VIDEO = 25  # Limit total frames to prevent overload

PLATFORM_GUIDELINES = {
    "YouTube": [
        {
            "guideline": "Is the Logo or Brand identity visible in the first 5 seconds",
            "ad_type": "Video",
            "inputs": "Logos + Ad",
            "expected_answer": "Yes"
        },
        {
            "guideline": "Does the Ad have Any misleading information or offensive visual content",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "No"
        },
        {
            "guideline": "Does the Ad promote Restricted Goods or Services (Alcohol, Tobacco, Drugs, Gambling, etc.)",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "No"
        },
        {
            "guideline": "Did the Ad use respectful and inclusive language and imagery",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "Yes"
        },
        {
            "guideline": "Could the content be considered shocking or offensive",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "No"
        }
    ],
    "Instagram": [
        {
            "guideline": "Is the Logo or Brand identity visible in the first 3 seconds",
            "ad_type": "Video",
            "inputs": "Logos + Ad",
            "expected_answer": "Yes"
        },
        {
            "guideline": "Does the Ad promote Restricted Goods or Services (Alcohol, Tobacco, Drugs, Gambling, etc.)",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "No"
        },
        {
            "guideline": "Does the Ad promote any Fraud or Scams",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "No"
        },
        {
            "guideline": "Are there any excessive or disruptive text overlays",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "No"
        },
        {
            "guideline": "Are there any explicit or shocking imagery unsuitable for audiences",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "No"
        }
    ],
    "TikTok": [
        {
            "guideline": "Is the Logo or Brand identity visible in the first 3 seconds",
            "ad_type": "Video",
            "inputs": "Logos + Ad",
            "expected_answer": "Yes"
        },
        {
            "guideline": "Does the Ad promote Restricted Goods or Services (Alcohol, Tobacco, Drugs, Gambling, etc.)",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "No"
        },
        {
            "guideline": "Is the Video in a vertical (portrait) format (the aspect ratio should be 9:16)",
            "ad_type": "Video",
            "inputs": "Ad",
            "expected_answer": "Yes"
        },
        {
            "guideline": "Are there any misleading, violent, or explicit content",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "No"
        },
        {
            "guideline": "Does the Ad contain material that is age-appropriate",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "Yes"
        }
    ],
    "Google Ads": [
        {
            "guideline": "Do logos or brand identity appear within first 5 seconds",
            "ad_type": "Video",
            "inputs": "Logos + Ad",
            "expected_answer": "Yes"
        },
        {
            "guideline": "Does the Ad have any misleading headlines or visuals",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "No"
        },
        {
            "guideline": "Does the Ad promote sale of counterfeit goods",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "No"
        },
        {
            "guideline": "Does the Ad have any prohibited or sensitive content",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "No"
        },
        
        {
            "guideline": "Does the Ad use proper grammar and professional language",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "Yes"
        }
    ],
    "Facebook": [
         {
            "guideline": "Does the Ad have any prohibited or sensitive content",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "No"
        },
        {
            "guideline": "Did the Ad have minimal use of text-to-image ratio wherein the images are bigger than texts",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "Yes"
        },
        {
            "guideline": "Does the Ad promote Restricted Goods or Services (Alcohol, Tobacco, Drugs, Gambling, etc.)",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "No"
        },
        {
            "guideline": "Does the Ad promote any Fraud or Scams",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "No"
        },
        {
            "guideline": "Did the ad intend to reach people responsibly without discriminating based on personal traits.",
            "ad_type": "Both",
            "inputs": "Ad",
            "expected_answer": "Yes"
        }
    ]
}

class VideoProcessor:
    def __init__(self, fps_target: int = 2):  # Changed from 3 to 2 FPS
        self.fps_target = fps_target

    def extract_frames(self, video_path: str) -> List[Tuple[float, np.ndarray]]:
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video file: {video_path}")

        fps_original = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps_original if fps_original else 0
        
        # Extract frames with optimization for faster processing
        frame_interval = max(1, int(fps_original / self.fps_target)) if fps_original else 1
        
        # **API SAFE**: Extract limited frames to prevent API errors
        frames, frame_count, extracted_count = [], 0, 0
        max_frames = MAX_FRAMES_PER_VIDEO
        
        while extracted_count < max_frames:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_count % frame_interval == 0:
                timestamp = frame_count / fps_original if fps_original else 0
                frames.append((timestamp, frame))
                extracted_count += 1
            frame_count += 1
        
        cap.release()
        print(f"🎬 Extracted {extracted_count} frames for analysis")
        return frames

    def frame_to_base64(self, frame: np.ndarray) -> str:
        height, width = frame.shape[:2]
        # ACCURACY: Keep higher resolution for better analysis
        if width > 800:  # Restored to 800 for better accuracy
            scale = 800 / width
            new_width = int(width * scale)
            new_height = int(height * scale)
            frame = cv2.resize(frame, (new_width, new_height))
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(frame_rgb)
        buffer = BytesIO()
        # ACCURACY: Higher quality for better analysis
        pil_image.save(buffer, format='JPEG', quality=70, optimize=True)  # Match Channel_compliance_shopify 2.py
        img_str = base64.b64encode(buffer.getvalue()).decode('utf-8')
        return img_str

    def frames_to_base64_list(self, frames: List[Tuple[float, np.ndarray]]) -> List[Tuple[float, str]]:
        return [(timestamp, self.frame_to_base64(frame)) for timestamp, frame in frames]

class ImageProcessor:
    def __init__(self):
        pass

    def load_image(self, image_path: str) -> np.ndarray:
        """Load and preprocess image for analysis"""
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image file not found: {image_path}")
        
        # Try OpenCV first
        try:
            image = cv2.imread(image_path)
            if image is None:
                raise ValueError("OpenCV could not read image")
            return image
        except Exception:
            # Fallback to PIL
            try:
                pil_image = Image.open(image_path)
                # Convert to RGB if necessary
                if pil_image.mode != 'RGB':
                    pil_image = pil_image.convert('RGB')
                # Convert to numpy array
                image = np.array(pil_image)
                # Convert RGB to BGR for OpenCV compatibility
                image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
                return image
            except Exception as e:
                raise ValueError(f"Could not load image: {e}")

    def image_to_base64(self, image: np.ndarray) -> str:
        """Convert image to base64 string - OPTIMIZED for faster processing"""
        height, width = image.shape[:2]
        # ACCURACY: Keep higher resolution for better analysis  
        if width > 800:  # Restored to 800 for better accuracy
            scale = 800 / width
            new_width = int(width * scale)
            new_height = int(height * scale)
            image = cv2.resize(image, (new_width, new_height))
        
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(image_rgb)
        buffer = BytesIO()
        # ACCURACY: Higher quality for better analysis
        pil_image.save(buffer, format='JPEG', quality=70, optimize=True)  # Match Channel_compliance_shopify 2.py
        img_str = base64.b64encode(buffer.getvalue()).decode('utf-8')
        return img_str

    def get_image_info(self, image_path: str) -> Dict:
        """Get image dimensions and format info"""
        image = self.load_image(image_path)
        height, width = image.shape[:2]
        aspect_ratio = width / height
        
        return {
            "width": width,
            "height": height,
            "aspect_ratio": aspect_ratio,
            "is_vertical": height > width,
            "is_square": abs(aspect_ratio - 1.0) < 0.1
        }

class ComplianceChecker:
    def __init__(self):
        if not GEMINI_API_KEY or GEMINI_API_KEY.startswith("YOUR_"):
            raise ValueError("Please set your actual Gemini API Key.")
        genai.configure(api_key=GEMINI_API_KEY)
        self.model = genai.GenerativeModel("gemini-2.5-pro")
        # Configure generation parameters for more consistent reasoning (simplified like shopify 3)
        self.generation_config = genai.types.GenerationConfig(
            top_p=TOP_P,
            temperature=0.2  # Low temperature for more deterministic responses
        )
        self.video_processor = VideoProcessor(fps_target=2) # Changed from 1 to 2 FPS
        self.image_processor = ImageProcessor()
        self.last_request_time = 0  # For rate limiting
        # **NEW**: Progressive batch sizing for quota management
        self.current_batch_size = BATCH_SIZE
        self.quota_exceeded_count = 0

    def _rate_limit(self):
        """Implement rate limiting to avoid quota issues"""
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        if time_since_last < RATE_LIMIT_DELAY:
            sleep_time = RATE_LIMIT_DELAY - time_since_last
            time.sleep(sleep_time)
        self.last_request_time = time.time()

    def _batch_analyze_platform(self, frames: List[Tuple[float, str]], platform: str, ad_description: str, has_logos: bool = False, logo_images_base64: List[str] = None, guideline_filter: str = None) -> List[Dict]:
        """Analyze all frames for one platform with adaptive batch sizing.

        guideline_filter:
            - None: include all applicable guidelines
            - 'only_logo': include only guidelines that require logos (inputs == 'Logos + Ad')
            - 'exclude_logo': exclude guidelines that require logos
        """
        all_results = []
        
        # **RESTORED**: Process frames in batches like shopify 3 (no adaptive reduction)
        adaptive_batch_size = BATCH_SIZE
        print(f"📊 Processing with batch size: {adaptive_batch_size} frames per batch")
        
        # Process frames in adaptive batches
        for i in range(0, len(frames), adaptive_batch_size):
            batch = frames[i:i + adaptive_batch_size]
            print(f"Processing batch {i//adaptive_batch_size + 1} for {platform}: {len(batch)} frames")
            
            batch_results = self._process_batch_with_retry(batch, platform, ad_description, has_logos, logo_images_base64, guideline_filter)
            all_results.extend(batch_results)
            
            # Rate limiting between batches
            if i + adaptive_batch_size < len(frames):
                print(f"Rate limiting: waiting {RATE_LIMIT_DELAY} seconds...")
                self._rate_limit()
        
        return all_results

    def _process_batch_with_retry(self, batch: List[Tuple[float, str]], platform: str, ad_description: str, has_logos: bool = False, logo_images_base64: List[str] = None, guideline_filter: str = None) -> List[Dict]:
        """Process a batch of frames with retry logic"""
        for attempt in range(MAX_RETRIES):
            try:
                return self._analyze_batch(batch, platform, ad_description, has_logos, logo_images_base64, guideline_filter)
            except Exception as e:
                error_msg = str(e)
                if "429" in error_msg or "quota" in error_msg.lower():
                    wait_time = RATE_LIMIT_DELAY * (attempt + 1)
                    print(f"Rate limit hit, waiting {wait_time} seconds... (attempt {attempt + 1}/{MAX_RETRIES})")
                    time.sleep(wait_time)
                    continue
                elif attempt == MAX_RETRIES - 1:
                    print(f"All retries failed for {platform}, using conservative defaults")
                    return self._create_conservative_results(batch, platform)
                else:
                    print(f"API error, retrying... (attempt {attempt + 1}/{MAX_RETRIES})")
                    time.sleep(RATE_LIMIT_DELAY)
                    continue
        return []

    def _analyze_batch(self, batch: List[Tuple[float, str]], platform: str, ad_description: str, has_logos: bool = False, logo_images_base64: List[str] = None, guideline_filter: str = None) -> List[Dict]:
        """Analyze a batch of frames for one platform"""
        if not batch:
            return []
        
        # Create optimized prompt for batch processing
        prompt = self._create_batch_prompt(batch, platform, ad_description, has_logos, guideline_filter)
        
        # Prepare content with all frames in the batch
        content_parts = [prompt]
        for timestamp, base64_frame in batch:
            content_parts.append({"mime_type": "image/jpeg", "data": base64_frame})
        
        # Add logo images if provided
        if has_logos and logo_images_base64:
            for logo_base64 in logo_images_base64:
                content_parts.append({"mime_type": "image/jpeg", "data": logo_base64})
        
        # **FIX**: Check content size before API call to prevent errors
        total_content_size = len(str(content_parts))
        if total_content_size > 800000:  # ~800KB limit to be safe
            print(f"⚠️ Large request detected ({total_content_size} chars), splitting batch...")
            # Split batch in half if too large
            mid_point = len(batch) // 2
            if mid_point > 0:
                batch1 = batch[:mid_point]
                batch2 = batch[mid_point:]
                results1 = self._analyze_batch(batch1, platform, ad_description, has_logos, logo_images_base64, guideline_filter)
                results2 = self._analyze_batch(batch2, platform, ad_description, has_logos, logo_images_base64, guideline_filter)
                return results1 + results2
        
        # Make API call with rate limiting and generation config
        self._rate_limit()
        response = self.model.generate_content(content_parts, generation_config=self.generation_config)
        
        # Parse response for all frames in batch
        return self._parse_batch_response(response.text, batch, platform)

    def _create_batch_prompt(self, batch: List[Tuple[float, str]], platform: str, ad_description: str, has_logos: bool = False, guideline_filter: str = None) -> str:
        """Create an optimized prompt for batch processing"""
        guidelines = PLATFORM_GUIDELINES[platform]
        
        # Get applicable guidelines
        applicable_guidelines = []
        for i, guideline in enumerate(guidelines):
            if guideline["ad_type"] == "Both" or guideline["ad_type"] == "Video":
                is_logo_guideline = guideline.get("inputs") == "Logos + Ad"
                if guideline_filter == 'only_logo' and not is_logo_guideline:
                    continue
                if guideline_filter == 'exclude_logo' and is_logo_guideline:
                    continue
                if is_logo_guideline and not has_logos:
                    continue
                applicable_guidelines.append((i+1, guideline))
        
        if not applicable_guidelines:
            return ""
        
        guidelines_text = "\n".join([f"{i}. {g['guideline']}" for i, g in applicable_guidelines])
        
        frame_descriptions = []
        for i, (timestamp, _) in enumerate(batch):
            frame_descriptions.append(f"Frame {i+1}: at {timestamp:.1f} seconds")
        
        logo_instruction = ""
        if has_logos:
            logo_instruction = f"""
IMPORTANT: You have reference logo image(s) provided. When checking for logo/brand visibility, compare the frames that are within the time window of 0-3 seconds for Instagram/TikTok and 0-5 seconds for YouTube/Google Ads for logo visibility or brand identity against these reference logos.
"""
        
        prompt = f"""
You are a video ad compliance expert. Analyze these {len(batch)} frames as a cohesive advertisement for {platform} advertising compliance.

Frames to analyze:
{chr(10).join(frame_descriptions)}

Ad Description: {ad_description or "No description provided"}
Has Logo Inputs: {"Yes" if has_logos else "No"}
{logo_instruction}

ANALYSIS APPROACH: Consider these frames as parts of a single advertisement. When providing reasoning, focus on the overall ad content and message rather than individual frame details.

Check this advertisement against these {platform} guidelines:
{guidelines_text}

IMPORTANT: You MUST respond with ONLY a valid JSON array. Each guideline MUST have "actual_output" as either "Yes" or "No".

Respond with this exact format for EACH frame:
[
  {{"frame": 1, "guideline_number": 1, "guideline": "exact guideline text", "actual_output": "Yes", "reason": "brief explanation"}},
  {{"frame": 1, "guideline_number": 2, "guideline": "exact guideline text", "actual_output": "No", "reason": "brief explanation"}},
  {{"frame": 2, "guideline_number": 1, "guideline": "exact guideline text", "actual_output": "Yes", "reason": "brief explanation"}}
]

CRITICAL RULES:
1. "actual_output" MUST be "Yes" or "No" only
2. Do NOT use phrases like "No determination possible" or "cannot determine"
3. Make your best assessment based on what you can see in each frame
4. If you see the logo in a frame, answer "Yes" for logo visibility
5. If you don't see offensive content in a frame, answer "No" for offensive content
6. Be decisive and provide clear Yes/No answers
7. Only analyze guidelines that are applicable to each specific frame
8. Include "frame" number in each result to identify which frame it refers to
9. **REASONING QUALITY**: Provide ad-focused reasoning that starts with "The ad..." or "This advertisement..." instead of "The frame...". Focus on the overall content and message, not just individual frame descriptions.
10. **IMPORTANT**: For substance/tobacco guidelines, only answer "Yes" if you can CLEARLY see actual tobacco products, alcohol bottles, drugs, or gambling content. Do NOT flag general products, food, beverages, or unclear objects as restricted substances.
11. **IMPORTANT**: Be conservative with violations - only flag clear, obvious violations, not ambiguous content.
12. **EXAMPLE REASONING**: Good: "The ad promotes a beverage product without any restricted content." Bad: "The frame shows a can which could be alcohol."
"""
        return prompt

    def _parse_batch_response(self, response: str, batch: List[Tuple[float, str]], platform: str) -> List[Dict]:
        """Parse batch response and separate results by frame"""
        import re
        try:
            print(f"🔍 DEBUG - Raw Gemini response (first 500 chars): {response[:500]}...")
            
            # Try multiple approaches to extract JSON array
            content = None
            
            # Method 1: Find the first complete JSON array using bracket matching
            bracket_count = 0
            start_idx = -1
            end_idx = -1
            
            for i, char in enumerate(response):
                if char == '[':
                    if bracket_count == 0:
                        start_idx = i
                    bracket_count += 1
                elif char == ']':
                    bracket_count -= 1
                    if bracket_count == 0 and start_idx != -1:
                        end_idx = i + 1
                        break
            
            if start_idx != -1 and end_idx != -1:
                content = response[start_idx:end_idx]
                print(f"🔍 DEBUG - Extracted JSON content (bracket matching): {content[:200]}...")
            else:
                # Method 2: Fallback to regex with greedy matching
                array_match = re.search(r"\[(.|\n)*\]", response)
                if array_match:
                    content = array_match.group(0)
                    print(f"🔍 DEBUG - Extracted JSON content (regex fallback): {content[:200]}...")
                else:
                    # Method 3: Try to find JSON between ```json and ``` markers
                    json_match = re.search(r"```json\s*(\[(.|\n)*?\])\s*```", response)
                    if json_match:
                        content = json_match.group(1)
                        print(f"🔍 DEBUG - Extracted JSON content (markdown fallback): {content[:200]}...")
            
            if content:
                # Try to clean up common JSON issues before parsing
                content_cleaned = content.strip()
                
                # Fix common issues with trailing commas and incomplete objects
                if content_cleaned.endswith(',]'):
                    content_cleaned = content_cleaned[:-2] + ']'
                elif content_cleaned.endswith(','):
                    content_cleaned = content_cleaned[:-1]
                
                try:
                    guides = json.loads(content_cleaned)
                except json.JSONDecodeError as json_err:
                    print(f"🔧 JSON parsing failed, attempting to fix malformed JSON...")
                    print(f"🔧 Original error: {json_err}")
                    
                    # Try to fix incomplete JSON by finding the last complete object
                    lines = content_cleaned.split('\n')
                    for i in range(len(lines) - 1, -1, -1):
                        try:
                            # Try to parse up to this line
                            partial_content = '\n'.join(lines[:i+1])
                            if partial_content.strip().endswith('}'):
                                partial_content += '\n]'
                            elif not partial_content.strip().endswith(']'):
                                continue
                            
                            guides = json.loads(partial_content)
                            print(f"🔧 Successfully parsed partial JSON with {len(guides)} entries")
                            break
                        except:
                            continue
                    else:
                        # If all attempts fail, raise the original error
                        raise json_err
                
                # Group results by frame
                frame_results = {}
                for guide in guides:
                    frame_num = guide.get("frame", 1)
                    if frame_num not in frame_results:
                        frame_results[frame_num] = []
                    frame_results[frame_num].append(guide)
                
                # Convert to standard format
                all_results = []
                for frame_num, frame_guides in frame_results.items():
                    if frame_num <= len(batch):
                        timestamp = batch[frame_num - 1][0]
                        frame_results = self._parse_frame_guidelines(frame_guides, platform, timestamp)
                        all_results.extend(frame_results)
                
                return all_results
            else:
                print(f"❌ No JSON array found in response. Response length: {len(response)}")
                print(f"❌ Response preview: {response[:300]}...")
                raise ValueError("No valid JSON array found")
        except json.JSONDecodeError as e:
            print(f"❌ JSON decode error: {str(e)}")
            print(f"❌ Failed to parse content: {content[:200] if 'content' in locals() else 'No content extracted'}...")
            return self._create_conservative_results(batch, platform)
        except Exception as e:
            print(f"❌ Error parsing batch response: {str(e)}")
            print(f"❌ Response type: {type(response)}, length: {len(response) if response else 0}")
            # Return conservative results on parsing error
            return self._create_conservative_results(batch, platform)

    def _parse_frame_guidelines(self, frame_guides: List[Dict], platform: str, timestamp: float) -> List[Dict]:
        """Parse guidelines for a single frame"""
        guidelines = PLATFORM_GUIDELINES[platform]
        parsed = []
        
        for guide in frame_guides:
            guideline_num = guide.get("guideline_number", 1)
            if guideline_num <= len(guidelines):
                guideline = guidelines[guideline_num - 1]
                actual_output = guide.get("actual_output", "No")
                
                # Clean up the actual_output
                if isinstance(actual_output, str):
                    actual_output = actual_output.strip()
                    if "no determination" in actual_output.lower() or "cannot determine" in actual_output.lower():
                        actual_output = "No"
                    elif actual_output.lower() not in ["yes", "no"]:
                        actual_output = "No"
                
                expected_answer = guideline["expected_answer"]
                matched_score = 1 if actual_output == expected_answer else 0
                
                # Always include reason from LLM, even for matching outputs
                reason = guide.get("reason", "") or ""
                
                # Ensure we always have a reason
                if not reason or reason.strip() == "":
                    if actual_output == expected_answer:
                        reason = "Guideline compliance verified successfully"
                    else:
                        reason = "Guideline compliance check failed"
                
                parsed.append({
                    "guideline_number": guideline_num,
                    "guideline": guideline["guideline"],
                    "ad_type": guideline["ad_type"],
                    "inputs": guideline["inputs"],
                    "expected_answer": expected_answer,
                    "actual_output": actual_output,
                    "matched_score": matched_score,
                    "reason": reason
                })
        
        return parsed

    def _create_conservative_results(self, batch: List[Tuple[float, str]], platform: str) -> List[Dict]:
        """Create conservative default results when API fails"""
        guidelines = PLATFORM_GUIDELINES[platform]
        results = []
        
        # Create results for ALL applicable guidelines, not just for each frame
        applicable_guidelines = []
        for i, guideline in enumerate(guidelines):
            if guideline["ad_type"] == "Both" or guideline["ad_type"] == "Video":
                if guideline["inputs"] == "Logos + Ad":
                    # For logo guidelines, only include if we have logos
                    continue  # Skip logo guidelines in conservative mode
                applicable_guidelines.append((i+1, guideline))
        
        # Create one set of results for the entire batch
        for guideline_num, guideline in applicable_guidelines:
            results.append(self._create_default_guideline_result(
                guideline_num, guideline, "No", 
                f"API quota exceeded - defaulting to No"
            ))
        
        return results

    def _create_visual_prompt(self, platform: str, guidelines: List[dict], ad_description: str, timestamp: float = 0, frame_num: int = 1, is_image: bool = False, has_logos: bool = False, logo_images_base64: List[str] = None) -> str:
        media_type = "image" if is_image else f"frame {frame_num} (at {timestamp:.1f} seconds)"
        
        # Filter guidelines based on ad type and inputs
        applicable_guidelines = []
        for i, guideline in enumerate(guidelines):
            # Check if guideline applies to this media type
            if guideline["ad_type"] == "Both" or (guideline["ad_type"] == "Video" and not is_image) or (guideline["ad_type"] == "Image" and is_image):
                # Check if we have logos when required
                if guideline["inputs"] == "Logos + Ad" and not has_logos:
                    continue  # Skip logo-required guidelines if no logos provided
                applicable_guidelines.append((i+1, guideline))
        
        if not applicable_guidelines:
            return None  # No applicable guidelines
        
        guidelines_text = "\n".join([f"{i}. {g['guideline']}" for i, g in applicable_guidelines])
        
        logo_instruction = ""
        if has_logos and logo_images_base64:
            logo_instruction = f"""
IMPORTANT: You have {len(logo_images_base64)} reference logo image(s) provided. When checking for logo/brand visibility, compare the content against these reference logos to determine if the brand logo is present and visible.
"""
        
        prompt = f"""
You are a video ad compliance expert. Analyze this {media_type} as part of an advertisement for {platform} advertising compliance.

{media_type.capitalize()}: {media_type} (at {timestamp:.1f} seconds)
Ad Description: {ad_description or "No description provided"}
Has Logo Inputs: {"Yes" if has_logos else "No"}
{logo_instruction}

ANALYSIS APPROACH: When providing reasoning, focus on the advertisement as a whole. Start your reasoning with "The ad..." or "This advertisement..." rather than "The frame...". Consider the overall message and content being conveyed.

Check this advertisement content against these {platform} guidelines:
{guidelines_text}

IMPORTANT: You MUST respond with ONLY a valid JSON array. Each guideline MUST have "actual_output" as either "Yes" or "No".

TIME-BASED ANALYSIS RULES:
- For logo visibility guidelines: Only analyze if this frame is within the required time window (0-3 seconds for Instagram/TikTok, 0-5 seconds for YouTube/Google Ads)
- For general content guidelines: Analyze based on what you can see in this frame
- If this frame is outside the time window for logo guidelines, skip those guidelines

Respond with this exact format:
[
  {{"guideline_number": 1, "guideline": "exact guideline text", "actual_output": "Yes", "reason": "brief explanation"}},
  {{"guideline_number": 2, "guideline": "exact guideline text", "actual_output": "No", "reason": "brief explanation"}}
]

CRITICAL RULES:
1. "actual_output" MUST be "Yes" or "No" only
2. Do NOT use phrases like "No determination possible" or "cannot determine"
3. Make your best assessment based on what you can see in THIS frame
4. If you see the logo in this frame, answer "Yes" for logo visibility
5. If you don't see offensive content in this frame, answer "No" for offensive content
6. Be decisive and provide clear Yes/No answers
7. Only analyze guidelines that are applicable to this specific frame and time
8. **REASONING QUALITY**: Provide ad-focused reasoning that starts with "The ad..." or "This advertisement..." instead of "The frame...". Focus on the overall content and message being conveyed.
9. **IMPORTANT**: For substance/tobacco guidelines, only answer "Yes" if you can CLEARLY see actual tobacco products, alcohol bottles, drugs, or gambling content. Do NOT flag general products, food, beverages, or unclear objects as restricted substances.
10. **EXAMPLE REASONING**: Good: "The ad promotes a beverage product without any restricted content." Bad: "The frame shows a can which could be alcohol."
"""
        return prompt, applicable_guidelines

    def _parse_gemini_response(self, response: str, applicable_guidelines: List[tuple]) -> List[Dict]:
        import re
        try:
            array_match = re.search(r"\[(.|\n)*?\]", response)
            if array_match:
                content = array_match.group(0)
                guides = json.loads(content)
                parsed = []
                
                for guideline_num, guideline in applicable_guidelines:
                    found = next((gi for gi in guides if int(gi.get('guideline_number', guideline_num)) == guideline_num), None)
                    if found:
                        actual_output = found.get("actual_output", "No")  # Default to "No" for safety
                        # Clean up the actual_output to ensure it's Yes/No
                        if isinstance(actual_output, str):
                            actual_output = actual_output.strip()
                            if "no determination" in actual_output.lower() or "cannot determine" in actual_output.lower():
                                actual_output = "No"  # Default to "No" for unclear cases - more conservative
                            elif actual_output.lower() not in ["yes", "no"]:
                                actual_output = "No"  # Default to "No" for invalid responses - more conservative
                        
                        expected_answer = guideline["expected_answer"]
                        matched_score = 1 if actual_output == expected_answer else 0
                        
                        # Always include reason from LLM, even for matching outputs
                        reason = found.get("reason", "") or ""
                        
                        # Ensure we always have a reason
                        if not reason or reason.strip() == "":
                            if actual_output == expected_answer:
                                reason = "Guideline compliance verified successfully"
                            else:
                                reason = "Guideline compliance check failed"
                        
                        parsed.append({
                            "guideline_number": guideline_num,
                            "guideline": guideline["guideline"],
                            "ad_type": guideline["ad_type"],
                            "inputs": guideline["inputs"],
                            "expected_answer": expected_answer,
                            "actual_output": actual_output,
                            "matched_score": matched_score,
                            "reason": reason
                        })
                    else:
                        # Default to "No" if not found in response - more conservative approach
                        parsed.append({
                            "guideline_number": guideline_num,
                            "guideline": guideline["guideline"],
                            "ad_type": guideline["ad_type"],
                            "inputs": guideline["inputs"],
                            "expected_answer": guideline["expected_answer"],
                            "actual_output": "No",  # Default to "No" instead of expected answer
                            "matched_score": 0 if guideline["expected_answer"] == "Yes" else 1,  # Calculate based on actual vs expected
                            "reason": "Guideline not found in AI response - defaulting to No"
                        })
                return parsed
            else:
                raise ValueError("No valid JSON array found")
        except Exception as e:
            # Return more conservative results - default to "No" for safety
            return [
                {
                    "guideline_number": guideline_num,
                    "guideline": guideline["guideline"],
                    "ad_type": guideline["ad_type"],
                    "inputs": guideline["inputs"],
                    "expected_answer": guideline["expected_answer"],
                    "actual_output": "No",  # Default to "No" instead of expected answer
                    "matched_score": 0 if guideline["expected_answer"] == "Yes" else 1,  # Calculate based on actual vs expected
                    "reason": f"Error parsing AI response: {str(e)} - defaulting to No"
                }
                for guideline_num, guideline in applicable_guidelines
            ]

    def _create_default_guideline_result(self, guideline_num: int, guideline: dict, actual_output: str = "No", reason: str = "") -> Dict:
        """Create a standardized guideline result"""
        return {
            "guideline_number": guideline_num,
            "guideline": guideline["guideline"],
            "ad_type": guideline["ad_type"],
            "inputs": guideline["inputs"],
            "expected_answer": guideline["expected_answer"],
            "actual_output": actual_output,
            "matched_score": 1 if actual_output == guideline["expected_answer"] else 0,
            "reason": reason
        }

    def _prepare_content_for_ai(self, prompt: str, base64_media: str, has_logos: bool = False, logo_images_base64: List[str] = None) -> List:
        """Prepare content parts for AI model"""
        content_parts = [prompt, {"mime_type": "image/jpeg", "data": base64_media}]
        
        # Add logo images if provided
        if has_logos and logo_images_base64:
            for logo_base64 in logo_images_base64:
                content_parts.append({
                    "mime_type": "image/jpeg", 
                    "data": logo_base64
                })
        
        return content_parts

    def _analyze_compliance(self, base64_media: str, platform: str, ad_description: str, timestamp: float = 0, frame_num: int = 1, is_image: bool = False, has_logos: bool = False, logo_images_base64: List[str] = None) -> List[Dict]:
        """Generic compliance analysis method for both images and frames"""
        guidelines = PLATFORM_GUIDELINES[platform]
        prompt_result = self._create_visual_prompt(platform, guidelines, ad_description, timestamp, frame_num, is_image, has_logos, logo_images_base64)
        
        if prompt_result is None:
            return []  # No applicable guidelines
        
        prompt, applicable_guidelines = prompt_result
        
        try:
            content_parts = self._prepare_content_for_ai(prompt, base64_media, has_logos, logo_images_base64)
            response = self.model.generate_content(content_parts, generation_config=self.generation_config)
            return self._parse_gemini_response(response.text, applicable_guidelines)
        except Exception as e:
            # Return conservative results on error
            return [
                self._create_default_guideline_result(
                    guideline_num, 
                    guideline, 
                    "No", 
                    f"Error in AI analysis: {str(e)} - defaulting to No"
                )
                for guideline_num, guideline in applicable_guidelines
            ]

    def _check_frame_compliance(self, base64_frame: str, timestamp: float, platform: str, ad_description: str, frame_num: int, has_logos: bool = False, logo_images_base64: List[str] = None) -> List[Dict]:
        """Check compliance for a single video frame"""
        return self._analyze_compliance(
            base64_frame, platform, ad_description, timestamp, frame_num, 
            is_image=False, has_logos=has_logos, logo_images_base64=logo_images_base64
        )

    def _check_image_compliance(self, base64_image: str, platform: str, ad_description: str, has_logos: bool = False, logo_images_base64: List[str] = None) -> List[Dict]:
        """Check compliance for a single image"""
        return self._analyze_compliance(
            base64_image, platform, ad_description, is_image=True, 
            has_logos=has_logos, logo_images_base64=logo_images_base64
        )

    def _aggregate_guideline_results(self, all_guideline_results: List[Dict]) -> List[Dict]:
        """Aggregate results from multiple frames/analyses with correct time-window semantics.

        Aggregation logic:
        - For guidelines with expected_answer == "Yes" (e.g., logo in first X seconds), overall is "Yes" if ANY frame is "Yes".
        - For guidelines with expected_answer == "No" (e.g., no offensive content), overall is "No" only if ALL frames are "No"; otherwise "Yes" (violation present in at least one frame).
        """
        if not all_guideline_results:
            return []

        grouped: Dict[int, List[Dict]] = {}
        for res in all_guideline_results:
            grouped.setdefault(res["guideline_number"], []).append(res)

        aggregated: List[Dict] = []
        for guideline_num, entries in grouped.items():
            first = entries[0]
            expected = first.get("expected_answer", "No")
            is_yes_expected = (str(expected).strip().lower() == "yes")
            any_yes = any(e.get("actual_output", "No").strip().lower() == "yes" for e in entries)
            all_no = all(e.get("actual_output", "No").strip().lower() == "no" for e in entries)

            # Helper function to find best reason (prioritize non-black frame reasons)
            def get_best_reason(frame_entries, fallback="Guideline met successfully"):
                good_reasons = [e.get("reason", "") for e in frame_entries 
                              if e.get("reason", "") and "black" not in e.get("reason", "").lower()]
                return good_reasons[0] if good_reasons else (frame_entries[0].get("reason", fallback) if frame_entries else fallback)

            if is_yes_expected:
                final_actual = "Yes" if any_yes else "No"
                if final_actual == expected:
                    # For passing guidelines, use the best reason from "Yes" frames
                    yes_frames = [e for e in entries if e.get("actual_output", "No").strip().lower() == "yes"]
                    reason = get_best_reason(yes_frames, "Guideline met successfully")
                else:
                    reason = "No frame within analyzed window showed the required criterion"
            else:
                final_actual = "No" if all_no else "Yes"
                if final_actual == expected:
                    # For passing guidelines, use the best reason from all frames
                    reason = get_best_reason(entries, "Guideline met successfully")
                else:
                    violating = next((e for e in entries if e.get("actual_output", "No").strip().lower() == "yes"), None)
                    reason = (violating or {}).get("reason", "Found at least one violating frame")

            # Ensure we always have a reason
            if not reason or reason.strip() == "":
                if final_actual == expected:
                    reason = "Guideline compliance verified successfully"
                else:
                    reason = "Guideline compliance check failed"
            
            aggregated.append({
                "guideline_number": guideline_num,
                "guideline": first["guideline"],
                "ad_type": first["ad_type"],
                "inputs": first["inputs"],
                "expected_answer": expected,
                "actual_output": final_actual,
                "matched_score": 1 if final_actual == expected else 0,
                "reason": reason
            })

        return aggregated

    def _calculate_compliance_score(self, guideline_results: List[Dict]) -> Tuple[int, int, float]:
        """Calculate compliance score from guideline results"""
        total_matched_scores = sum(g["matched_score"] for g in guideline_results)
        total_guidelines = len(guideline_results)
        compliance_score = (total_matched_scores / total_guidelines * 100) if total_guidelines > 0 else 0
        return total_matched_scores, total_guidelines, compliance_score

    def _create_result_summary(self, guideline_results: List[Dict], total_matched_scores: int, total_guidelines: int, compliance_score: float, **kwargs) -> Dict:
        """Create standardized result summary"""
        result = {
            "guideline_results": guideline_results,
            "total_guidelines": total_guidelines,
            "total_matched_scores": total_matched_scores,
            "compliance_score": round(compliance_score, 2),
            "compliance_percentage": f"{compliance_score:.1f}%"
        }
        result.update(kwargs)  # Add any additional fields
        return result

    def analyze_video(self, video_path: str, platforms: List[str], ad_description: str = "", has_logos: bool = False, logo_images_base64: List[str] = None) -> Dict[str, Dict]:
        frames = self.video_processor.extract_frames(video_path)
        if not frames:
            return {platform: {"error": "No frames extracted from video"} for platform in platforms}
        base64_frames = self.video_processor.frames_to_base64_list(frames)
        results = {}

        print(f"Extracted {len(base64_frames)} frames from video")
        print(f"Processing {len(platforms)} platforms: {', '.join(platforms)}")

        # === TIKTOK VERTICAL CHECK LOGIC ===
        tiktok_not_vertical = False
        for platform in platforms:
            if platform == "TikTok":
                for _, frame in frames:
                    height, width = frame.shape[:2]
                    if width >= height:
                        tiktok_not_vertical = True
                        break

        for platform in platforms:
            print(f"\n{'='*50}")
            print(f"Processing platform: {platform}")
            print(f"{'='*50}")
            
            if platform not in PLATFORM_GUIDELINES:
                results[platform] = {"error": f"Unknown platform: {platform}"}
                continue

            # Filter frames based on platform-specific time windows for logo analysis
            if platform in ["TikTok", "Instagram"]:
                # For Instagram and TikTok: analyze frames from 0-3 seconds for logo visibility
                logo_frames = [(timestamp, base64_frame) for timestamp, base64_frame in base64_frames if timestamp <= 3.0]
                general_frames = base64_frames  # All frames for general guidelines
                print(f"Logo analysis: {len(logo_frames)} frames (0-3 seconds) for {platform}")
            elif platform in ["YouTube", "Google Ads"]:
                # For YouTube and Google Ads: analyze frames from 0-5 seconds for logo visibility
                logo_frames = [(timestamp, base64_frame) for timestamp, base64_frame in base64_frames if timestamp <= 5.0]
                general_frames = base64_frames  # All frames for general guidelines
                print(f"Logo analysis: {len(logo_frames)} frames (0-5 seconds) for {platform}")
            else:
                # For other platforms: use all frames
                logo_frames = base64_frames
                general_frames = base64_frames
                print(f"Logo analysis: {len(logo_frames)} frames (all frames) for {platform}")
            
            # Check if platform has any logo guidelines
            has_logo_guidelines = any(guideline["inputs"] == "Logos + Ad" for guideline in PLATFORM_GUIDELINES[platform])
            
            # Analyze logo guidelines with time-filtered frames
            logo_guideline_results = []
            if has_logo_guidelines:
                if logo_frames and has_logos and logo_images_base64:
                    print(f"Analyzing {len(logo_frames)} frames for logo guidelines...")
                    logo_guideline_results = self._batch_analyze_platform(
                        logo_frames, platform, ad_description, has_logos, logo_images_base64, guideline_filter='only_logo'
                    )
                elif has_logos and not logo_images_base64:
                    # If logos are expected but none provided, create default "No" results for logo guidelines
                    logo_guideline_results = []
                    for guideline in PLATFORM_GUIDELINES[platform]:
                        if guideline["inputs"] == "Logos + Ad":
                            logo_guideline_results.append(self._create_default_guideline_result(
                                guideline.get("guideline_number", 1),
                                guideline,
                                "No",
                                "No logo images provided for analysis"
                            ))
            else:
                print(f"No logo guidelines found for {platform}, skipping logo analysis...")
            
            # Analyze general guidelines with all frames
            general_guideline_results = []
            if general_frames:
                print(f"Analyzing {len(general_frames)} frames for general guidelines...")
                general_guideline_results = self._batch_analyze_platform(
                    general_frames, platform, ad_description, has_logos, logo_images_base64, guideline_filter='exclude_logo'
                )
            
            # Combine all guideline results
            all_guideline_results = logo_guideline_results + general_guideline_results
            
            # Combine and aggregate results
            all_guideline_results = self._aggregate_guideline_results(all_guideline_results)
            
            if all_guideline_results:
                # Calculate compliance score using helper method
                total_matched_scores, total_guidelines, compliance_score = self._calculate_compliance_score(all_guideline_results)
                
                # Handle TikTok vertical check override
                if platform == "TikTok" and tiktok_not_vertical:
                    for guideline in all_guideline_results:
                        if "vertical" in guideline["guideline"].lower():
                            guideline["actual_output"] = "No"
                            guideline["matched_score"] = 0
                            guideline["reason"] = "Video is not in vertical (portrait) format"
                            # Recalculate compliance score
                            total_matched_scores, total_guidelines, compliance_score = self._calculate_compliance_score(all_guideline_results)
                            break

                # Create result summary using helper method
                results[platform] = self._create_result_summary(
                    all_guideline_results, total_matched_scores, total_guidelines, compliance_score,
                    frames_analyzed=len(base64_frames),
                    logo_frames_analyzed=len(logo_frames),
                    general_frames_analyzed=len(general_frames)
                )
                
                print(f"✅ {platform} completed: {compliance_score:.1f}% compliance")
            else:
                results[platform] = {"error": "No applicable guidelines found for this platform and media type"}
                print(f"❌ {platform}: No applicable guidelines found")

        return results

    def analyze_image(self, image_path: str, platforms: List[str], ad_description: str = "", has_logos: bool = False, logo_images_base64: List[str] = None) -> Dict[str, Dict]:
        """Analyze a single image for compliance across all platforms"""
        try:
            image = self.image_processor.load_image(image_path)
            base64_image = self.image_processor.image_to_base64(image)
            image_info = self.image_processor.get_image_info(image_path)
            
            results = {}
            for platform in platforms:
                if platform not in PLATFORM_GUIDELINES:
                    results[platform] = {"error": f"Unknown platform: {platform}"}
                    continue

                # Check image compliance
                guideline_results = self._check_image_compliance(base64_image, platform, ad_description, has_logos, logo_images_base64)
                
                if guideline_results:
                    # Calculate compliance score using helper method
                    total_matched_scores, total_guidelines, compliance_score = self._calculate_compliance_score(guideline_results)
                    
                    # Handle TikTok vertical check for images
                    if platform == "TikTok" and not image_info["is_vertical"]:
                        for guideline in guideline_results:
                            if "vertical" in guideline["guideline"].lower():
                                guideline["actual_output"] = "No"
                                guideline["matched_score"] = 0
                                guideline["reason"] = "Image is not in vertical (portrait) format"
                                # Recalculate compliance score
                                total_matched_scores, total_guidelines, compliance_score = self._calculate_compliance_score(guideline_results)
                                break

                    # Create result summary using helper method
                    results[platform] = self._create_result_summary(
                        guideline_results, total_matched_scores, total_guidelines, compliance_score
                    )
                else:
                    results[platform] = {"error": "No applicable guidelines found for this platform and media type"}
            
            return results
            
        except Exception as e:
            return {platform: {"error": f"Error analyzing image: {str(e)}"} for platform in platforms}

def process_logo_images(logo_paths: List[str]) -> List[str]:
    """Process logo images and convert to base64"""
    logo_images_base64 = []
    image_processor = ImageProcessor()
    
    for logo_path in logo_paths:
        if not os.path.exists(logo_path):
            print(f"Warning: Logo file not found: {logo_path}")
            continue
            
        try:
            image = image_processor.load_image(logo_path)
            logo_base64 = image_processor.image_to_base64(image)
            if logo_base64:
                logo_images_base64.append(logo_base64)
                print(f"âœ… Processed logo: {logo_path}")
            else:
                print(f"âš ï¸  Failed to process logo: {logo_path}")
        except Exception as e:
            print(f"âŒ Error processing logo {logo_path}: {str(e)}")
    
    return logo_images_base64

def main():
    parser = argparse.ArgumentParser(description="Video & Image Compliance Analysis Tool (Gemini Flash 1.5, TikTok vertical check)")
    parser.add_argument("file_path", help="Path to the video or image file")
    parser.add_argument("--platforms", nargs="+",
                        default=["YouTube", "Instagram", "Facebook", "TikTok",],
                        help="Platforms to analyze (default: all)")
    parser.add_argument("--description", default="", help="Ad description")
    parser.add_argument("--output", default="compliance_results.json", help="Output JSON file path")
    parser.add_argument("--logo-images", nargs="+", help="Paths to logo image files for logo detection")
    args = parser.parse_args()

    if not os.path.exists(args.file_path):
        print(f"Error: File not found: {args.file_path}")
        sys.exit(1)

    # Process logo images if provided
    logo_images_base64 = []
    has_logos = False
    if args.logo_images:
        print(f"ðŸ–¼ï¸  Processing {len(args.logo_images)} logo images...")
        logo_images_base64 = process_logo_images(args.logo_images)
        has_logos = len(logo_images_base64) > 0
        if has_logos:
            print(f"âœ… Successfully processed {len(logo_images_base64)} logo images")
        else:
            print("âš ï¸  Could not process any logo images")

    # Determine file type
    file_ext = os.path.splitext(args.file_path)[1].lower()
    video_extensions = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm']
    image_extensions = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp', '.gif']

    try:
        checker = ComplianceChecker()
        
        if file_ext in video_extensions:
            print(f"Analyzing video: {args.file_path}")
            results = checker.analyze_video(args.file_path, args.platforms, args.description, has_logos, logo_images_base64)
        elif file_ext in image_extensions:
            print(f"Analyzing image: {args.file_path}")
            results = checker.analyze_image(args.file_path, args.platforms, args.description, has_logos, logo_images_base64)
        else:
            print(f"Error: Unsupported file type: {file_ext}")
            print(f"Supported video formats: {', '.join(video_extensions)}")
            print(f"Supported image formats: {', '.join(image_extensions)}")
            sys.exit(1)

        print(f"Platforms: {', '.join(args.platforms)}")
        print(f"Ad description: {args.description or 'None provided'}")
        print(f"Has logos: {'Yes' if has_logos else 'No'}")
        print("-" * 50)
        
        # Calculate overall channel compliance score BEFORE writing JSON
        platform_scores = []
        for platform, result in results.items():
            if "compliance_score" in result:
                platform_scores.append(result["compliance_score"])
        
        # Add overall compliance score to results for JSON output
        if platform_scores:
            overall_score = sum(platform_scores) / len(platform_scores)
            results["overall_compliance_score"] = round(overall_score, 1)
        else:
            results["overall_compliance_score"] = None
        
        with open(args.output, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"\nResults saved to: {args.output}\n")
        print("=" * 50)
        print("COMPLIANCE SUMMARY")
        print("=" * 50)
        
        # Display individual platform results
        for platform, result in results.items():
            if platform == "overall_compliance_score":
                continue  # Skip the overall score in platform display
            if "compliance_score" in result:
                status = "✅ Compliant" if result["compliance_score"] >= 80 else "❌ Non-compliant"
                print(f"{platform}: {status} ({result['compliance_score']}%)")
            else:
                print(f"{platform}: {result.get('error', 'Unknown error')}")
        
        # Display overall channel compliance
        if platform_scores:
            overall_score = sum(platform_scores) / len(platform_scores)
            overall_status = "✅ Channel Compliant" if overall_score >= 80 else "❌ Channel Non-compliant"
            print("-" * 50)
            print(f"OVERALL CHANNEL COMPLIANCE: {overall_status}")
            print(f"Average Score: {overall_score:.1f}%")
            print(f"Platforms Analyzed: {len(platform_scores)}")
            print(f"Individual Scores: {', '.join([f'{score:.1f}%' for score in platform_scores])}")
        else:
            print("-" * 50)
            print("❌ No valid compliance scores to calculate overall average")
        
        print("=" * 50)
        print("🎉 Analysis completed successfully!")
        
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()