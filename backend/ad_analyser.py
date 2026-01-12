import google.generativeai as genai
import tempfile
import cv2
from PIL import Image as PILImage
import os
import time
import json
import sys
from datetime import datetime
 
# === Gemini API Setup ===
genai.configure(api_key="AIzaSyDR4KZlsD3HcNkk16sbkqkLXHdRx2uzi_M")
model = genai.GenerativeModel("gemini-2.5-pro")
 
# === Prompt ===
prompt = """
Analyze this advertisement and provide detailed purchase intent evaluation with specific reasoning for each metric.

Provide the following outputs:

1. Resonating Impact Description – A general description of how the ad may emotionally or cognitively impact viewers

2. Purchase Intent Scores – Evaluate the AD using these five parameters and provide specific reasoning for each score:

For each metric, provide the score and detailed reasoning in this exact format:
- Message clarity - X/5 (Explain why this score based on how clear and understandable the message is)
- Emotional appeal - X/5 (Explain why this score based on emotional connection and impact)
- Relevance - X/5 (Explain why this score based on general appeal and relevance)
- Visual or verbal CTA strength - X/5 (Explain why this score based on call-to-action effectiveness)
- Use of psychological or persuasive triggers - X/5 (Explain why this score based on urgency, social proof, scarcity, etc.)

CRITICAL: Each metric MUST include specific reasoning in parentheses explaining the score.

Response format:
Resonating Impact:
[Your resonating impact description]

Purchase Intent Scores:
- Message clarity - X/5 (specific reasoning for this score)
- Emotional appeal - X/5 (specific reasoning for this score)
- Relevance - X/5 (specific reasoning for this score)
- Visual or verbal CTA strength - X/5 (specific reasoning for this score)
- Use of psychological or persuasive triggers - X/5 (specific reasoning for this score)

"""
 
# === Frame extraction from video ===
def extract_frames(video_path, fps=1):
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
 
def analyze_ad(file_path):
    """
    Analyze an ad (image or video) and return JSON output
    """
    try:
        # Determine file type
        file_extension = os.path.splitext(file_path)[1].lower()
        is_video = file_extension in ['.mp4', '.mov', '.avi', '.mkv']
        is_image = file_extension in ['.png', '.jpg', '.jpeg', '.gif', '.bmp']
       
        if not is_video and not is_image:
            return {
                "error": "Unsupported file format. Please provide an image (.png, .jpg, .jpeg) or video (.mp4, .mov) file."
            }
       
        response = None
       
        # === IMAGE ===
        if is_image:
            image = PILImage.open(file_path)
            response = model.generate_content([prompt, image])
           
        # === VIDEO ===
        elif is_video:
            frames = extract_frames(file_path, fps=1)
            if not frames:
                return {
                    "error": "No frames extracted from the video."
                }
            response = model.generate_content([prompt] + frames)
       
        # === Process Response ===
        if response and hasattr(response, "text"):
            # Parse the response to extract structured data
            response_text = response.text
           
            # Debug: Print the full response to see what we're getting
            print(f"DEBUG - Full AI response:\n{response_text}")
           
            # Extract resonating impact
            resonating_impact = ""
            if "Resonating Impact:" in response_text:
                start = response_text.find("Resonating Impact:") + len("Resonating Impact:")
                end = response_text.find("Purchase Intent Scores:")
                if end == -1:
                    end = response_text.find("Purchase intent Score:")
                if end != -1:
                    resonating_impact = response_text[start:end].strip()
           
            # Extract purchase intent scores
            purchase_intent_scores = {}
            overall_score = 0
            score_count = 0
           
            # Look for different possible section headers
            score_section_headers = ["Purchase Intent Scores:", "Purchase intent Score:", "Purchase Intent Score:"]
            scores_section = ""
           
            for header in score_section_headers:
                if header in response_text:
                    start = response_text.find(header) + len(header)
                    # Look for the end of the scores section (no reasoning section anymore)
                    end_markers = ["Resonating Impact:", "\n\n", "---"]
                    end = -1
                    for marker in end_markers:
                        marker_pos = response_text.find(marker, start)
                        if marker_pos != -1 and (end == -1 or marker_pos < end):
                            end = marker_pos
                   
                    if end == -1:
                        end = len(response_text)
                   
                    scores_section = response_text[start:end].strip()
                    break
           
            if scores_section:
                # Parse individual scores
                score_mappings = {
                    "Message clarity": "message_clarity",
                    "Emotional appeal": "emotional_appeal",
                    "Relevance": "relevance",
                    "Visual or verbal CTA strength": "cta_strength",
                    "Use of psychological or persuasive triggers": "psychological_triggers"
                }
               
                # Debug: Print the scores section to see what we're working with
                print(f"DEBUG - Scores section: {scores_section}")
               
                for line in scores_section.split('\n'):
                    line = line.strip()
                    if line and ('-' in line or '•' in line):
                        for key, value in score_mappings.items():
                            if key.lower() in line.lower():
                                # Extract score and reason (e.g., "4/5 (clear messaging)" -> score=4, reason="clear messaging")
                                if '/5' in line:
                                    # More robust score extraction - look for the last occurrence of X/5 pattern
                                    import re
                                    score_match = re.search(r'(\d+)/5', line)
                                    if score_match:
                                        score_str = score_match.group(1)
                                        
                                        # Extract the reason part - try multiple approaches
                                        reason = ""
                                        
                                        # Method 1: Look for parentheses
                                        paren_pairs = []
                                        stack = []
                                        for i, char in enumerate(line):
                                            if char == '(':
                                                stack.append(i)
                                            elif char == ')' and stack:
                                                start = stack.pop()
                                                paren_pairs.append((start, i))
                                        
                                        # Use the last set of parentheses as the reason
                                        if paren_pairs:
                                            last_start, last_end = paren_pairs[-1]
                                            reason = line[last_start + 1:last_end].strip()
                                        
                                        # Method 2: If no parentheses, look for text after score pattern
                                        if not reason:
                                            # Look for text after "X/5" pattern
                                            score_pattern_match = re.search(r'\d+/5\s*[-:]?\s*(.+)', line)
                                            if score_pattern_match:
                                                reason = score_pattern_match.group(1).strip()
                                                # Clean up common prefixes
                                                if reason.startswith('(') and reason.endswith(')'):
                                                    reason = reason[1:-1].strip()
                                        
                                        # Method 3: If still no reason, extract everything after the metric name
                                        if not reason:
                                            # Remove the metric name and score, keep the rest
                                            clean_line = line.lower()
                                            for metric_name in score_mappings.keys():
                                                if metric_name.lower() in clean_line:
                                                    # Find where the metric name ends and extract the rest
                                                    start_idx = clean_line.find(metric_name.lower()) + len(metric_name)
                                                    remaining = line[start_idx:].strip()
                                                    # Remove common patterns like "- X/5"
                                                    remaining = re.sub(r'^[-:]\s*\d+/5\s*[-:]?\s*', '', remaining).strip()
                                                    if remaining and len(remaining) > 3:
                                                        reason = remaining
                                                    break
                                        
                                        try:
                                            score = int(score_str)
                                            percentage = (score / 5) * 100
                                            purchase_intent_scores[value] = {
                                                "score": score,
                                                "percentage": percentage,
                                                "description": f"{key} - {reason}" if reason else key,
                                                "reason": reason if reason else "No specific reason provided"
                                            }
                                            overall_score += percentage
                                            score_count += 1
                                            print(f"DEBUG - Parsed {key}: {score}/5 ({percentage}%) - Reason: '{reason}' from line: {line}")
                                        except ValueError:
                                            print(f"DEBUG - Failed to parse score from: {line}")
                                            pass
                                break
           
            # Calculate average percentage
            average_percentage = overall_score / score_count if score_count > 0 else 0
           
            # **REMOVED**: No longer extracting purchase intent reasoning
            reason = ""
           
            return {
                "success": True,
                "resonating_impact": resonating_impact,
                "purchase_intent_scores": purchase_intent_scores,
                "overall_purchase_intent_percentage": round(average_percentage, 2),
                "analyzed_file": file_path,
                "analysis_timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "error": "No response received from AI."
            }
           
    except Exception as e:
        return {
            "error": f"An error occurred: {str(e)}"
        }
 
def save_json_output(result, output_file=None):
    """
    Save the analysis result to a JSON file
    """
    if output_file is None:
        # Generate filename based on timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f"ad_analysis_{timestamp}.json"
   
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        return output_file
    except Exception as e:
        print(f"Error saving JSON file: {e}")
        return None
 
def main():
    """
    Main function to handle command line arguments and output JSON
    """
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python ad_analyzer.py <path_to_image_or_video_file> [output_json_file]"
        }))
        sys.exit(1)
   
    file_path = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
   
    if not os.path.exists(file_path):
        print(json.dumps({
            "error": f"File not found: {file_path}"
        }))
        sys.exit(1)
   
    # Analyze the ad and get JSON result
    result = analyze_ad(file_path)
   
    # Save to JSON file
    saved_file = save_json_output(result, output_file)
   
    if saved_file:
        print(f"Analysis completed! Results saved to: {saved_file}")
        print("\nJSON Output:")
        print(json.dumps(result, indent=2))
    else:
        print("Error: Could not save JSON file")
        print(json.dumps(result, indent=2))
 
if __name__ == "__main__":
    main()