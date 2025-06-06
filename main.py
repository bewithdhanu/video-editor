from fastapi import FastAPI, BackgroundTasks, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.requests import Request
import ffmpeg
import os
import json
import uuid
import asyncio
import aiofiles
from datetime import datetime
import shutil
from typing import Dict, List
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Video Editor", description="Professional Video Editor with Timeline Controls")

# Create necessary directories
os.makedirs("videos", exist_ok=True)
os.makedirs("processed", exist_ok=True)
os.makedirs("temp", exist_ok=True)
os.makedirs("templates", exist_ok=True)
os.makedirs("static", exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/videos", StaticFiles(directory="videos"), name="videos")
app.mount("/processed", StaticFiles(directory="processed"), name="processed")

templates = Jinja2Templates(directory="templates")

# Global task storage
processing_tasks: Dict[str, Dict] = {}

def get_video_info(video_path: str) -> Dict:
    """Get video metadata using ffprobe"""
    try:
        probe = ffmpeg.probe(video_path)
        video_stream = next((stream for stream in probe['streams'] if stream['codec_type'] == 'video'), None)
        audio_stream = next((stream for stream in probe['streams'] if stream['codec_type'] == 'audio'), None)
        
        if video_stream is None:
            raise ValueError("No video stream found")
            
        duration = float(probe['format']['duration'])
        size = os.path.getsize(video_path)
        
        return {
            'duration': duration,
            'size': size,
            'width': int(video_stream['width']),
            'height': int(video_stream['height']),
            'fps': eval(video_stream['r_frame_rate']),
            'has_audio': audio_stream is not None
        }
    except Exception as e:
        logger.error(f"Error getting video info: {e}")
        return {'duration': 0, 'size': 0, 'width': 0, 'height': 0, 'fps': 0, 'has_audio': False}

def format_file_size(size_bytes: int) -> str:
    """Format file size in human readable format"""
    if size_bytes == 0:
        return "0 B"
    size_names = ["B", "KB", "MB", "GB"]
    i = 0
    while size_bytes >= 1024 and i < len(size_names) - 1:
        size_bytes /= 1024.0
        i += 1
    return f"{size_bytes:.1f} {size_names[i]}"

async def process_video_segments(task_id: str, video_path: str, segments: List[Dict], output_path: str):
    """Process video with speed adjustments for specific segments"""
    try:
        processing_tasks[task_id]['status'] = 'analyzing'
        processing_tasks[task_id]['progress'] = 10
        
        # Get video info
        video_info = get_video_info(video_path)
        total_duration = video_info['duration']
        has_audio = video_info.get('has_audio', False)
        
        processing_tasks[task_id]['status'] = 'processing'
        processing_tasks[task_id]['progress'] = 20
        
        # Sort segments by start time
        segments.sort(key=lambda x: x['start'])
        
        # Build list of segments to include in final video (excluding trimmed portions)
        keep_segments = []
        current_pos = 0
        
        # Create a list of time ranges to process
        time_ranges = []
        last_end = 0
        
        for segment in segments:
            start_time = segment['start']
            end_time = segment['end']
            action = segment.get('action', 'speed')
            
            # Add any gap before this segment
            if last_end < start_time:
                time_ranges.append({
                    'start': last_end,
                    'end': start_time,
                    'speed': 1.0,
                    'action': 'keep'
                })
            
            # Add this segment if it's not trimmed
            if action != 'trim':
                time_ranges.append({
                    'start': start_time,
                    'end': end_time,
                    'speed': segment.get('speed', 1.0),
                    'action': action
                })
            
            last_end = end_time
        
        # Add final segment if needed
        if last_end < total_duration:
            time_ranges.append({
                'start': last_end,
                'end': total_duration,
                'speed': 1.0,
                'action': 'keep'
            })
        
        # Filter out empty segments and trimmed segments, keeping only what we want
        all_segments = []
        for segment in time_ranges:
            if segment['action'] != 'trim' and segment['start'] < segment['end']:
                all_segments.append(segment)
        
        # Debug: Log what segments will be processed
        logger.info(f"Original segments: {segments}")
        logger.info(f"Time ranges built: {time_ranges}")
        logger.info(f"Final segments to process: {all_segments}")
        
        # Process each segment
        temp_files = []
        for i, segment in enumerate(all_segments):
            processing_tasks[task_id]['status'] = f'processing_segment_{i+1}'
            processing_tasks[task_id]['progress'] = 20 + (60 * i / len(all_segments))
            
            temp_file = f"temp/segment_{task_id}_{i}.mp4"
            temp_files.append(temp_file)
            
            # Extract and process segment
            input_stream = ffmpeg.input(video_path, ss=segment['start'], t=segment['end'] - segment['start'])
            
            output_streams = []
            
            # Always process video stream
            video_filter = input_stream.video.filter('setpts', f'{1/segment["speed"]}*PTS')
            output_streams.append(video_filter)
            
            output_kwargs = {
                'vcodec': 'libx264',
                'preset': 'medium',
                'crf': 23,
            }

            # Conditionally process audio stream
            if has_audio:
                output_kwargs['acodec'] = 'aac'
                if segment['speed'] != 1.0 and 0.5 <= segment['speed'] <= 100.0:
                    audio_filter = input_stream.audio.filter('atempo', segment['speed'])
                    output_streams.append(audio_filter)
                else:
                    # Pass audio through for re-encoding without speed change
                    output_streams.append(input_stream.audio)
                    if segment['speed'] != 1.0:
                         logger.warning(f"Audio speed of {segment['speed']}x is outside 'atempo' range. Audio for this segment will not be sped up.")

            output = ffmpeg.output(*output_streams, temp_file, **output_kwargs)
            ffmpeg.run(output, overwrite_output=True, quiet=False)
        
        # Concatenate all segments
        processing_tasks[task_id]['status'] = 'concatenating'
        processing_tasks[task_id]['progress'] = 85
        
        # Create concat file using absolute paths for robustness
        concat_file = f"temp/concat_{task_id}.txt"
        with open(concat_file, 'w') as f:
            for temp_file in temp_files:
                f.write(f"file '{os.path.abspath(temp_file)}'\n")
        
        # Final concatenation
        concat_input = ffmpeg.input(concat_file, format='concat', safe=0)
        
        # Build final output based on stream availability
        final_output_streams = [concat_input.video]
        final_output_kwargs = {'vcodec': 'copy'}
        if has_audio:
            final_output_streams.append(concat_input.audio)
            final_output_kwargs['acodec'] = 'copy'

        final_output = ffmpeg.output(*final_output_streams, output_path, **final_output_kwargs)
        ffmpeg.run(final_output, overwrite_output=True, quiet=False)
        
        # Cleanup temp files
        processing_tasks[task_id]['status'] = 'cleanup'
        processing_tasks[task_id]['progress'] = 95
        
        for temp_file in temp_files:
            if os.path.exists(temp_file):
                os.remove(temp_file)
        if os.path.exists(concat_file):
            os.remove(concat_file)
        
        # Mark as completed
        processing_tasks[task_id]['status'] = 'completed'
        processing_tasks[task_id]['progress'] = 100
        processing_tasks[task_id]['output_file'] = os.path.basename(output_path)
        
    except ffmpeg.Error as e:
        logger.error(f"FFmpeg error during task {task_id}: {e.stderr.decode('utf-8') if e.stderr else 'No stderr'}")
        processing_tasks[task_id]['status'] = 'error'
        processing_tasks[task_id]['error'] = f"FFmpeg error: {e.stderr.decode('utf-8') if e.stderr else 'No stderr'}"
    except Exception as e:
        logger.error(f"Error processing video task {task_id}", exc_info=True)
        processing_tasks[task_id]['status'] = 'error'
        processing_tasks[task_id]['error'] = str(e)

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/videos")
async def get_videos():
    """Get list of available videos with metadata"""
    videos = []
    video_extensions = {'.mp4', '.avi', '.mov', '.mkv', '.webm', '.ogg'}
    
    if not os.path.exists("videos"):
        return {"videos": []}
    
    for filename in os.listdir("videos"):
        if any(filename.lower().endswith(ext) for ext in video_extensions):
            video_path = os.path.join("videos", filename)
            video_info = get_video_info(video_path)
            
            videos.append({
                "filename": filename,
                "size": format_file_size(video_info['size']),
                "duration": video_info['duration'],
                "width": video_info['width'],
                "height": video_info['height']
            })
    
    return {"videos": videos}

@app.post("/api/upload-video")
async def upload_video(file: UploadFile = File(...)):
    """Upload a video file."""
    upload_dir = "videos"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Sanitize filename
    safe_filename = os.path.basename(file.filename)
    file_path = os.path.join(upload_dir, safe_filename)

    # Check for existing file to avoid overwrites, add suffix if needed
    base, ext = os.path.splitext(file_path)
    counter = 1
    while os.path.exists(file_path):
        file_path = f"{base}_{counter}{ext}"
        counter += 1
        
    try:
        async with aiofiles.open(file_path, 'wb') as out_file:
            content = await file.read()
            await out_file.write(content)
    except Exception as e:
        logger.error(f"Error uploading file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="There was an error uploading the file.")
    finally:
        await file.close()

    return {"message": "File uploaded successfully", "filename": os.path.basename(file_path)}

@app.post("/api/process-video")
async def process_video(background_tasks: BackgroundTasks, request_data: dict):
    """Start video processing with speed adjustments"""
    filename = request_data.get('filename')
    segments = request_data.get('segments', [])
    
    if not filename or not segments:
        raise HTTPException(status_code=400, detail="Filename and segments are required")
    
    video_path = os.path.join("videos", filename)
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video file not found")
    
    # Generate task ID and output filename
    task_id = str(uuid.uuid4())
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_name = os.path.splitext(filename)[0]
    output_filename = f"{base_name}_processed_{timestamp}.mp4"
    output_path = os.path.join("processed", output_filename)
    
    # Initialize task
    processing_tasks[task_id] = {
        'status': 'queued',
        'progress': 0,
        'filename': filename,
        'output_filename': output_filename
    }
    
    # Start background processing
    background_tasks.add_task(process_video_segments, task_id, video_path, segments, output_path)
    
    return {"task_id": task_id}

@app.get("/api/progress/{task_id}")
async def get_progress(task_id: str):
    """Get processing progress for a task"""
    if task_id not in processing_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return processing_tasks[task_id]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8900)
