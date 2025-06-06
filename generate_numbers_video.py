import os
import shutil
from PIL import Image, ImageDraw, ImageFont
import cv2
import numpy as np

# --- Get the directory where the script is located ---
script_dir = os.path.dirname(os.path.abspath(__file__))

def generate_video_with_numbers():
    """
    Generates a video that displays numbers from 1 to 100,
    with each number shown for one second.
    """
    # --- Configuration ---
    output_filename = "numbers_1_to_100.mp4"
    temp_frame_dir = os.path.join(script_dir, "temp_number_frames")
    width, height = 640, 480
    fps = 1
    font_size = 150
    font_color = "white"
    bg_color = "black"

    # --- Setup ---
    # Create a temporary directory for frames
    if os.path.exists(temp_frame_dir):
        shutil.rmtree(temp_frame_dir)
    os.makedirs(temp_frame_dir)

    print("Generating frames from 1 to 100...")

    # Load a font from the script's directory
    font_path = os.path.join(script_dir, "DejaVuSans-Bold.ttf")
    try:
        font = ImageFont.truetype(font_path, font_size)
    except IOError:
        print(f"Font file '{font_path}' not found.")
        print("Falling back to default font. Text may not be properly sized.")
        # If the bundled font is missing, use the default bitmap font
        try:
            # Pillow 10.0.0 and later
            font = ImageFont.load_default(size=font_size)
        except TypeError:
            # Older versions of Pillow
            font = ImageFont.load_default()

    # --- Frame Generation ---
    for i in range(1, 101):
        # Create a blank image
        img = Image.new('RGB', (width, height), color=bg_color)
        draw = ImageDraw.Draw(img)

        # Text to be drawn
        text = str(i)

        # Calculate text position for centering
        try:
            # Use textbbox for more accurate centering with TrueType fonts
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            text_x = (width - text_width) / 2
            text_y = (height - text_height) / 2 - bbox[1] # Adjust for y-offset of bbox
        except (TypeError, AttributeError):
            # Fallback for default bitmap font
            text_width, text_height = draw.textsize(text, font=font)
            text_x = (width - text_width) / 2
            text_y = (height - text_height) / 2

        # Draw the text
        draw.text((text_x, text_y), text, font=font, fill=font_color)

        # Save the frame
        frame_path = os.path.join(temp_frame_dir, f"frame_{i:03d}.png")
        img.save(frame_path)
        
        # Print progress
        if i % 10 == 0:
            print(f"  Generated frame {i}/100")

    print("\nFrames generated successfully.")
    print("Creating video from frames...")

    # --- Video Creation ---
    # Get all frame paths in sorted order
    frame_files = sorted([os.path.join(temp_frame_dir, f) for f in os.listdir(temp_frame_dir) if f.endswith(".png")])

    # Define the codec and create VideoWriter object
    fourcc = cv2.VideoWriter_fourcc(*'mp4v') # or 'XVID'
    video_writer = cv2.VideoWriter(output_filename, fourcc, fps, (width, height))

    if not video_writer.isOpened():
        print("Error: Could not open video writer.")
        return

    for frame_file in frame_files:
        frame_image = cv2.imread(frame_file)
        video_writer.write(frame_image)

    video_writer.release()
    print(f"Video saved as '{output_filename}'")

    # --- Cleanup ---
    print("Cleaning up temporary frame files...")
    shutil.rmtree(temp_frame_dir)
    print("Cleanup complete.")

if __name__ == "__main__":
    # Check for dependencies and provide install instructions
    try:
        import cv2
        from PIL import Image
    except ImportError as e:
        print(f"Error: Missing dependency '{e.name}'.")
        print("Please install required libraries using pip:")
        print("pip install opencv-python-headless Pillow numpy")
    else:
        generate_video_with_numbers() 