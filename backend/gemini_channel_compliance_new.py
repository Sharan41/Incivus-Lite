import json
import argparse
import google.generativeai as genai

# ----------------- CONFIG -----------------
GEMINI_API_KEY = "AIzaSyDR4KZlsD3HcNkk16sbkqkLXHdRx2uzi_M"   # free api key
OUTPUT_FILE = "ad_analysis_results.json"

# ----------------- GUIDELINES -----------------
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

# ----------------- HELPER FUNCTIONS -----------------
def load_file_bytes(file_path: str) -> bytes:
    """Load image or video file as bytes."""
    with open(file_path, "rb") as f:
        return f.read()

def filter_guidelines(mime_type: str) -> dict:
    """Filter guidelines based on ad type (Video or Image)."""
    ad_type = "Video" if "video" in mime_type else "Image"
    filtered = {}
    for platform, glist in PLATFORM_GUIDELINES.items():
        if ad_type == "Video":
            filtered[platform] = [g for g in glist if g["ad_type"] in ["Video", "Both"]]
        else:
            filtered[platform] = [g for g in glist if g["ad_type"] in ["Image", "Both"]]
    return filtered

def compute_matched_score(actual: str, expected: str) -> int:
    """Return 1 if actual matches expected, else 0."""
    return 1 if actual.strip().lower() == expected.strip().lower() else 0

def analyze_ad_with_gemini(ad_file: str, logo_file: str = None) -> dict:
    """Call Gemini API to analyze the ad and return structured results per platform."""
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(
        "gemini-2.5-pro",
        generation_config={"response_mime_type": "application/json"}
    )

    ad_bytes = load_file_bytes(ad_file)
    mime_type = "video/mp4" if ad_file.endswith(".mp4") else "image/png"
    ad_media = {"mime_type": mime_type, "data": ad_bytes}

    # Filter guidelines based on ad type
    applicable_guidelines = filter_guidelines(mime_type)
    
    # Add guideline numbers to each guideline for reference
    numbered_guidelines = {}
    for platform, guidelines in applicable_guidelines.items():
        numbered_guidelines[platform] = []
        for idx, guideline in enumerate(guidelines, start=1):
            guideline_with_number = guideline.copy()
            guideline_with_number["guideline_number"] = idx
            numbered_guidelines[platform].append(guideline_with_number)

    logo_instruction = ""
    if logo_file:
        logo_instruction = "\n\nIMPORTANT: A logo image has been provided. For guidelines that require 'Logos + Ad' input, compare the ad content against the provided logo image to check for logo/brand visibility."

    parts = [
        {"text": (
            "You are an ad compliance checker. Analyze the given ad against the platform guidelines. "
            "Return ONLY valid JSON — no explanations outside JSON. "
            "For each platform, return an array of objects with: "
            "{guideline_number, guideline, ad_type, inputs, expected_answer, actual_output, reason}. "
            f"{logo_instruction}"
            "\n\nRules: "
            "1. 'actual_output' MUST be 'Yes' or 'No' only. "
            "2. Always include a 'reason'. "
            "3. You MUST analyze ALL guidelines provided for each platform. "
            "4. Use the exact 'guideline_number' from the input. "
            "5. For guidelines requiring 'Logos + Ad' input: If no logo is provided, answer 'No' for logo visibility guidelines. "
            "6. Do not skip any guidelines - include all of them in your response. "
            "7. Do not include any text outside the JSON."
        )},
        ad_media,
        {"text": f"Guidelines to check (with guideline numbers):\n{json.dumps(numbered_guidelines, indent=2)}"}
    ]

    if logo_file:
        logo_bytes = load_file_bytes(logo_file)
        parts.append({"mime_type": "image/png", "data": logo_bytes})

    response = model.generate_content(parts)

    # Parse safely
    try:
        raw_data = json.loads(response.text)
    except json.JSONDecodeError:
        print("⚠️ Warning: Gemini did not return valid JSON. Raw output saved.")
        return {"raw_output": response.text}

    # If model returned a flat list, wrap it
    if isinstance(raw_data, list):
        raw_data = {"results": raw_data}

    platform_results = {}

    # Build structured results per platform with validation
    for platform, expected_guidelines in numbered_guidelines.items():
        if platform not in raw_data:
            print(f"⚠️ Warning: Platform '{platform}' not found in AI response")
            continue
            
        ai_guidelines = raw_data[platform]
        if not isinstance(ai_guidelines, list):
            continue

        # Ensure all guidelines are present and in correct order
        validated_guidelines = []
        for expected_guideline in expected_guidelines:
            guideline_num = expected_guideline["guideline_number"]
            
            # Find matching guideline from AI response
            ai_guideline = next(
                (g for g in ai_guidelines if g.get("guideline_number") == guideline_num),
                None
            )
            
            if ai_guideline:
                # Use AI response
                ai_guideline["matched_score"] = compute_matched_score(
                    ai_guideline.get("actual_output", ""), 
                    expected_guideline["expected_answer"]
                )
                # Ensure all required fields are present
                ai_guideline["guideline"] = expected_guideline["guideline"]
                ai_guideline["ad_type"] = expected_guideline["ad_type"]
                ai_guideline["inputs"] = expected_guideline["inputs"]
                ai_guideline["expected_answer"] = expected_guideline["expected_answer"]
                validated_guidelines.append(ai_guideline)
            else:
                # Guideline missing from AI response - create default
                print(f"⚠️ Warning: Guideline #{guideline_num} missing for {platform}, using default")
                default_response = {
                    "guideline_number": guideline_num,
                    "guideline": expected_guideline["guideline"],
                    "ad_type": expected_guideline["ad_type"],
                    "inputs": expected_guideline["inputs"],
                    "expected_answer": expected_guideline["expected_answer"],
                    "actual_output": "No" if expected_guideline["expected_answer"] == "Yes" else "Yes",
                    "reason": "Unable to determine - guideline not analyzed",
                    "matched_score": 0
                }
                validated_guidelines.append(default_response)

        total_guidelines = len(validated_guidelines)
        total_matched = sum(g.get("matched_score", 0) for g in validated_guidelines)
        compliance_score = round((total_matched / total_guidelines) * 100, 1) if total_guidelines > 0 else 0.0

        platform_results[platform] = {
            "guideline_results": validated_guidelines,
            "total_guidelines": total_guidelines,
            "total_matched_scores": total_matched,
            "compliance_score": compliance_score,
            "compliance_percentage": f"{compliance_score}%"
        }

    return platform_results

# ----------------- MAIN -----------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ad Compliance Checker with Gemini")
    parser.add_argument("ad_file", help="Path to ad file (image/video)")
    parser.add_argument("--logo-images", help="Optional logo file", default=None)
    args = parser.parse_args()

    # Get results from analyzer
    platform_results = analyze_ad_with_gemini(args.ad_file, args.logo_images)

    # Compute overall compliance score (average across platforms)
    all_scores = [pdata["compliance_score"] for pdata in platform_results.values()]
    overall_score = round(sum(all_scores) / len(all_scores), 1) if all_scores else 0.0
    platform_results["overall_compliance_score"] = overall_score

    # Save to JSON file
    with open(OUTPUT_FILE, "w") as f:
        json.dump(platform_results, f, indent=2)

    print(f"✅ Analysis complete. Results saved to {OUTPUT_FILE}")

