import cv2
import numpy as np

# Video parameters
width, height = 1920, 1080  # 1080p resolution
fps = 1  # 1 frame per second, since we want to show 1 number per second
duration = 100  # Display numbers from 1 to 100

# Font settings
font = cv2.FONT_HERSHEY_SIMPLEX
font_scale = 10  # Large font size
font_thickness = 20
font_color = (255, 255, 255)  # White color text
text_position = (width // 4, height // 2)  # Position in the center

# Create VideoWriter object with H.264 codec for MP4 output
fourcc = cv2.VideoWriter_fourcc(*'mp4v')
out = cv2.VideoWriter('numbers_video.mp4', fourcc, fps, (width, height))

# Loop through numbers from 1 to 100
for i in range(1, duration + 1):
    # Create a blank image (black screen)
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    
    # Prepare the text to display
    text = str(i)
    
    # Get text size to center it
    text_size = cv2.getTextSize(text, font, font_scale, font_thickness)[0]
    text_x = (width - text_size[0]) // 2
    text_y = (height + text_size[1]) // 2
    
    # Add text to the image
    cv2.putText(frame, text, (text_x, text_y), font, font_scale, font_color, font_thickness)
    
    # Write the frame to the video
    out.write(frame)

# Release the video writer object
out.release()

print("Video created successfully!")
