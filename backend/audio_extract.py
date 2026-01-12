try:
    from moviepy.editor import VideoFileClip
except ImportError:
    try:
        from moviepy import VideoFileClip
    except ImportError:
        print("Warning: MoviePy not available - video processing will be limited")
        VideoFileClip = None
import os
import tempfile

def extract_audio_with_moviepy(video_path, audio_output_path=None):
    """
    Extracts audio from a video file using MoviePy.

    Args:
        video_path (str): Path to the input video file.
        audio_output_path (str): Path to save the extracted audio file. If None, creates a temp file.

    Returns:
        str: Path to the extracted audio file, or None if failed
    """
    try:
        # If no output path specified, create a temporary file
        if audio_output_path is None:
            temp_dir = tempfile.gettempdir()
            audio_output_path = os.path.join(temp_dir, f"extracted_audio_{os.path.basename(video_path)}.wav")
        
        video_clip = VideoFileClip(video_path)
        audio_clip = video_clip.audio
        
        if audio_clip is None:
            print(f"Error: No audio track found in {video_path}")
            return None
        
        # Write audio to WAV format
        audio_clip.write_audiofile(audio_output_path)
        audio_clip.close()
        video_clip.close()
        
        print(f"Audio extracted successfully to {audio_output_path}")
        return audio_output_path
        
    except Exception as e:
        print(f"Error extracting audio: {e}")
        return None

def cleanup_audio_file(audio_path):
    """
    Clean up the extracted audio file
    
    Args:
        audio_path (str): Path to the audio file to delete
    """
    try:
        if audio_path and os.path.exists(audio_path):
            os.remove(audio_path)
            print(f"Cleaned up audio file: {audio_path}")
    except Exception as e:
        print(f"Error cleaning up audio file: {e}")

# Example usage:
if __name__ == "__main__":
    result = extract_audio_with_moviepy("tesla.mp4", "output_audio.wav")
    if result:
        print(f"Audio extracted to: {result}")
    else:
        print("Audio extraction failed")