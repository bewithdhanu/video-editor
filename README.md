# Video Editor

A web-based video editing application built with FastAPI and modern frontend technologies. This tool allows for precise video trimming and speed adjustments through an intuitive timeline interface.

## Features

- **Dark Theme:** Modern, easy-on-the-eyes dark interface.
- **Drag-and-Drop Uploads:** Easily add videos by dragging them into the application.
- **Interactive Timeline:**
    - Click and drag to create selections.
    - Click on the timeline to seek.
    - Detailed playback controls (play/pause, forward/backward).
    - Adjustable playback speed for easier selection.
- **Portion Actions:**
    - **Trim:** Mark segments of the video to be deleted.
    - **Speed Adjustment:** Change the playback speed of selected portions (from 0.1x to 5.0x).
- **Fullscreen Mode:** A dedicated fullscreen editing mode that maximizes the video player and timeline.
- **Background Processing:** Video processing is handled in the background, allowing you to continue working.
- **Real-time Progress:** Monitor the status of your video processing with a real-time progress bar.
- **Persistent Downloads:** Processed files are linked to the original video in the list, and download links persist across browser sessions using `localStorage`.

## Tech Stack

- **Backend:** FastAPI, Uvicorn, FFmpeg
- **Frontend:** HTML5, CSS3, JavaScript (no frameworks)
- **Icons:** Font Awesome

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone [<repository-url>](https://github.com/bewithdhanu/video-editor.git)
    cd video-editor
    ```

2.  **Create a virtual environment and activate it:**
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```

3.  **Install dependencies:**
    - Make sure you have **FFmpeg** installed on your system.
      - **macOS (using Homebrew):** `brew install ffmpeg`
      - **Linux (using apt):** `sudo apt-get install ffmpeg`
      - **Windows:** Download from the [official website](https://ffmpeg.org/download.html).

    - Install the required Python packages:
      ```bash
      pip install -r requirements.txt
      ```

## How to Run

1.  **Start the FastAPI server:**
    ```bash
    uvicorn main:app --reload --port 8900
    ```
2.  **Open your browser:**
    Navigate to `http://127.0.0.1:8900`.

## How to Use

1.  **Upload Videos:** Drag and drop your video files onto the left-hand panel.
2.  **Select a Video:** Click on a video from the list to load it into the editor.
3.  **Create Selections:**
    - Use the "Start Portion" and "End Portion" buttons to mark a segment.
    - Alternatively, click and drag on the timeline to create a selection.
4.  **Modify Portions:**
    - In the "Selected Portions" table, choose an action for each segment ("Speed" or "Trim").
    - If "Speed" is selected, you can adjust the speed multiplier.
5.  **Process Video:** Click the "Process Video" button to start the rendering process.
6.  **Download:** Once processing is complete, a "Download" button will appear on the video item in the list.

## Project Structure

```
video-editor/
├── main.py                 # FastAPI backend application
├── requirements.txt        # Python dependencies
├── README.md              # This documentation
├── templates/
│   └── index.html         # Main application interface
├── static/
│   ├── style.css          # Responsive CSS styles
│   └── script.js          # Timeline and editing logic
├── videos/                # Source video files (add your videos here)
├── processed/             # Output video files
└── temp/                  # Temporary processing files (auto-cleanup)
```

## API Endpoints

- `GET /` - Main application interface
- `GET /api/videos` - List available videos with metadata
- `POST /api/process-video` - Start video processing
- `GET /api/progress/{task_id}` - Get processing progress
- `GET /videos/{filename}` - Serve source videos
- `GET /processed/{filename}` - Serve processed videos

## Technical Details

### Video Processing

- **Segment-based Processing**: Videos are split into segments based on user selections
- **Speed Application**: Custom speeds applied only to selected portions
- **Quality Preservation**: Uses libx264 and AAC codecs for high-quality output
- **Seamless Concatenation**: All segments combined into final output
- **Background Processing**: Async processing with real-time progress updates

### Frontend Features

- **Canvas Timeline**: High-DPI aware timeline with precise coordinate mapping
- **Responsive Design**: Optimized for desktop, tablet, and mobile
- **Real-time Updates**: Live progress tracking and status updates
- **Error Handling**: Comprehensive error handling and user feedback

### Performance Optimizations

- **Device Pixel Ratio**: Crisp timeline rendering on high-DPI displays
- **Debounced Resize**: Smooth window resize handling
- **Efficient Processing**: Minimal temporary file usage with auto-cleanup
- **Background Tasks**: Non-blocking video processing

## Troubleshooting

### Common Issues

1. **FFmpeg not found**
   - Ensure FFmpeg is installed and in your system PATH
   - Test with `ffmpeg -version`

2. **No videos showing**
   - Add video files to the `videos/` folder
   - Refresh the page after adding files
   - Check file formats are supported

3. **Processing fails**
   - Check video file isn't corrupted
   - Ensure sufficient disk space
   - Check server logs for detailed error messages

4. **Timeline selection issues**
   - Minimum selection duration is 1 second
   - Overlapping selections are automatically merged
   - Click directly on timeline to jump to specific time

### Performance Tips

- Use MP4 format for best compatibility
- Keep video files under 2GB for optimal processing
- Close other applications during processing for better performance
- Ensure adequate disk space (2x video file size recommended)

## Browser Compatibility

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

Requires HTML5 video support and Canvas API.

## License

This project is open source and available under the MIT License.

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Verify all prerequisites are installed correctly
3. Check browser console for error messages
4. Ensure video files are in supported formats
