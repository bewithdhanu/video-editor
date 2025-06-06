class VideoEditor {
  constructor() {
    this.videos = []
    this.currentVideo = null
    this.selections = []
    this.isSelecting = false
    this.selectionStart = 0
    this.currentTime = 0
    this.duration = 0
    this.processingTaskId = null
    this.playbackRates = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0]
    this.currentRateIndex = 3 // Corresponds to 1.0
    this.portionStartTime = 0
    this.processedFiles = JSON.parse(localStorage.getItem('processedFiles')) || {}

    // Initialize after DOM elements are available
    this.videoPlayer = null
    this.timeline = null
    this.ctx = null
    this.timelineWidth = 0
    this.timelineHeight = 60
  }

  init() {
    // Get DOM elements
    this.videoPlayer = document.getElementById("videoPlayer")
    this.timeline = document.getElementById("timeline")

    if (!this.timeline) {
      console.error("Timeline canvas not found")
      return
    }

    this.ctx = this.timeline.getContext("2d")

    if (!this.ctx) {
      console.error("Could not get canvas context")
      return
    }

    this.loadVideos()
    this.setupEventListeners()
    this.setupKeyboardShortcuts()
  }

  setupCanvas() {
    // The canvas should base its size on its parent container
    const container = this.timeline.parentElement
    if (!container) {
      console.error("Timeline container not found")
      return
    }

    const rect = container.getBoundingClientRect()
    const newWidth = rect.width
    
    if (newWidth === 0) {
      return // Don't try to resize if the container isn't visible
    }

    const dpr = window.devicePixelRatio || 1
    
    // Set the canvas drawing buffer size
    this.timeline.width = newWidth * dpr
    this.timeline.height = 60 * dpr
    
    // Set the CSS size of the canvas element
    this.timeline.style.width = `${newWidth}px`
    this.timeline.style.height = "60px"

    // The context is reset when the canvas is resized, so we must re-apply the scale
    this.ctx.scale(dpr, dpr)

    // Store the CSS pixel width for drawing calculations
    this.timelineWidth = newWidth
    this.timelineHeight = 60
  }

  async loadVideos() {
    try {
      const response = await fetch("/api/videos")
      const data = await response.json()
      this.videos = data.videos
      this.renderVideoList()
    } catch (error) {
      console.error("Error loading videos:", error)
      this.showNoVideosState()
    }

    // Show video editor
    document.getElementById("noVideoSelected").style.display = "none"
    document.getElementById("videoEditor").style.display = "flex"

    // Set up canvas now that editor is visible
    this.handleResize()
  }

  renderVideoList() {
    const videoList = document.getElementById("videoList")

    if (this.videos.length === 0) {
      this.showNoVideosState()
      return
    }

    videoList.innerHTML = this.videos
      .map((video) => {
        const processedFile = this.processedFiles[video.filename]
        const downloadButton = processedFile
          ? `
            <div class="video-item-actions">
                <a href="/processed/${processedFile}" download class="download-btn">
                    <i class="fas fa-download"></i> Download
                </a>
            </div>`
          : ''

        return `
            <div class="video-item" data-filename="${video.filename}">
                <div class="video-filename">${video.filename}</div>
                <div class="video-meta">
                    <span>${video.size}</span>
                    <span>${this.formatDuration(video.duration)}</span>
                </div>
                ${downloadButton}
            </div>
        `
      })
      .join("")

    // Add click listeners
    videoList.querySelectorAll(".video-item").forEach((item) => {
      item.addEventListener("click", () => {
        this.selectVideo(item.dataset.filename)
      })
    })
  }

  showNoVideosState() {
    const videoList = document.getElementById("videoList")
    videoList.innerHTML = `
            <div class="no-videos-state">
                <div class="no-video-icon">📁</div>
                <p><strong>No videos found</strong></p>
                <p>Add video files to the videos/ folder</p>
            </div>
        `
  }

  selectVideo(filename) {
    // Update UI
    document.querySelectorAll(".video-item").forEach((item) => {
      item.classList.remove("active")
    })
    document.querySelector(`[data-filename="${filename}"]`).classList.add("active")

    // Load video
    this.currentVideo = this.videos.find((v) => v.filename === filename)
    this.videoPlayer.src = `/videos/${encodeURIComponent(filename)}`
    this.selections = []

    // Reset controls
    const startPortionBtn = document.getElementById("startPortionBtn")
    const endPortionBtn = document.getElementById("endPortionBtn")
    if (startPortionBtn) startPortionBtn.disabled = false
    if (endPortionBtn) endPortionBtn.disabled = true

    this.currentRateIndex = 3 // 1.0x
    this.videoPlayer.playbackRate = this.playbackRates[this.currentRateIndex]
    const speedDisplay = document.getElementById("speedDisplay")
    if (speedDisplay) {
      speedDisplay.textContent = `${this.playbackRates[this.currentRateIndex].toFixed(2)}x`
    }

    this.updatePortionsTable()
    this.hideProcessingResults()

    // Show video editor
    document.getElementById("noVideoSelected").style.display = "none"
    document.getElementById("videoEditor").style.display = "flex"

    // Set up canvas now that editor is visible
    this.handleResize()
  }

  setupEventListeners() {
    // Video player events
    this.videoPlayer.addEventListener("loadedmetadata", () => {
      this.duration = this.videoPlayer.duration
      this.updateTimeDisplay()
      this.drawTimeline()
    })

    this.videoPlayer.addEventListener("timeupdate", () => {
      this.currentTime = this.videoPlayer.currentTime
      this.updateTimeDisplay()
      this.drawTimeline()
    })

    const playPauseBtn = document.getElementById("playPauseBtn")
    this.videoPlayer.addEventListener("play", () => {
      playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>'
    })

    this.videoPlayer.addEventListener("pause", () => {
      playPauseBtn.innerHTML = '<i class="fas fa-play"></i>'
    })

    // Timeline events
    this.timeline.addEventListener("mousedown", this.handleTimelineMouseDown.bind(this))
    this.timeline.addEventListener("mousemove", this.handleTimelineMouseMove.bind(this))
    this.timeline.addEventListener("mouseup", this.handleTimelineMouseUp.bind(this))
    this.timeline.addEventListener("click", this.handleTimelineClick.bind(this))

    // Process button
    document.getElementById("processBtn").addEventListener("click", this.processVideo.bind(this))

    // Window resize
    window.addEventListener("resize", this.debounce(this.handleResize.bind(this), 250))

    // Custom controls
    document.getElementById("rewind5sBtn").addEventListener("click", () => {
      this.videoPlayer.currentTime = Math.max(0, this.videoPlayer.currentTime - 5)
    })
    document.getElementById("rewind1sBtn").addEventListener("click", () => {
      this.videoPlayer.currentTime = Math.max(0, this.videoPlayer.currentTime - 1)
    })
    document.getElementById("playPauseBtn").addEventListener("click", () => {
      if (this.videoPlayer.paused) {
        this.videoPlayer.play()
      } else {
        this.videoPlayer.pause()
      }
    })
    document.getElementById("forward1sBtn").addEventListener("click", () => {
      this.videoPlayer.currentTime = Math.min(this.duration, this.videoPlayer.currentTime + 1)
    })
    document.getElementById("forward5sBtn").addEventListener("click", () => {
      this.videoPlayer.currentTime = Math.min(this.duration, this.videoPlayer.currentTime + 5)
    })

    // Playback speed controls
    document.getElementById("speedDownBtn").addEventListener("click", () => {
      if (this.currentRateIndex > 0) {
        this.currentRateIndex--
        this.updatePlaybackSpeed()
      }
    })
    document.getElementById("speedUpBtn").addEventListener("click", () => {
      if (this.currentRateIndex < this.playbackRates.length - 1) {
        this.currentRateIndex++
        this.updatePlaybackSpeed()
      }
    })

    // Portion buttons
    const startPortionBtn = document.getElementById("startPortionBtn")
    const endPortionBtn = document.getElementById("endPortionBtn")

    startPortionBtn.addEventListener("click", () => {
      this.portionStartTime = this.videoPlayer.currentTime
      startPortionBtn.disabled = true
      endPortionBtn.disabled = false
    })

    endPortionBtn.addEventListener("click", () => {
      const portionEndTime = this.videoPlayer.currentTime
      if (portionEndTime > this.portionStartTime) {
        this.addSelection(this.portionStartTime, portionEndTime, 'speed')
      }
      startPortionBtn.disabled = false
      endPortionBtn.disabled = true
    })

    // Fullscreen button
    const fullscreenBtn = document.getElementById("fullscreenBtn")
    const appContainer = document.querySelector(".app-container")

    if (fullscreenBtn && appContainer) {
      fullscreenBtn.addEventListener("click", () => {
        appContainer.classList.toggle("fullscreen-active")
        // Wait for CSS transitions to finish before recalculating
        setTimeout(() => this.handleResize(), 300)
      })
    }

    // Drag and Drop
    const dropZone = document.getElementById("dropZone")
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault()
        dropZone.classList.add("drag-over")
    })
    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("drag-over")
    })
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault()
        dropZone.classList.remove("drag-over")
        const files = e.dataTransfer.files
        if (files.length > 0) {
            this.uploadFiles(files)
        }
    })
  }

  setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (!this.currentVideo) return

      switch (e.code) {
        case "Space":
          e.preventDefault()
          if (this.videoPlayer.paused) {
            this.videoPlayer.play()
          } else {
            this.videoPlayer.pause()
          }
          break
        case "ArrowLeft":
          e.preventDefault()
          this.videoPlayer.currentTime = Math.max(0, this.videoPlayer.currentTime - 5)
          break
        case "ArrowRight":
          e.preventDefault()
          this.videoPlayer.currentTime = Math.min(this.duration, this.videoPlayer.currentTime + 5)
          break
      }
    })
  }

  handleTimelineMouseDown(e) {
    if (!this.duration) return

    const rect = this.timeline.getBoundingClientRect()
    const x = e.clientX - rect.left
    const time = (x / this.timelineWidth) * this.duration

    this.isSelecting = true
    this.selectionStart = time
    this.timeline.style.cursor = "crosshair"
  }

  handleTimelineMouseMove(e) {
    if (!this.isSelecting || !this.duration) return

    const rect = this.timeline.getBoundingClientRect()
    const x = e.clientX - rect.left
    const time = (x / this.timelineWidth) * this.duration

    // Draw preview selection
    this.drawTimeline()
    this.drawPreviewSelection(this.selectionStart, time)
  }

  handleTimelineMouseUp(e) {
    if (!this.isSelecting || !this.duration) return

    const rect = this.timeline.getBoundingClientRect()
    const x = e.clientX - rect.left
    const endTime = (x / this.timelineWidth) * this.duration

    const startTime = Math.min(this.selectionStart, endTime)
    const finalEndTime = Math.max(this.selectionStart, endTime)

    // Minimum selection of 1 second
    if (finalEndTime - startTime >= 1) {
      this.addSelection(startTime, finalEndTime, 'speed')
    }

    this.isSelecting = false
    this.timeline.style.cursor = "crosshair"
    this.drawTimeline()
  }

  handleTimelineClick(e) {
    if (this.isSelecting) return

    const rect = this.timeline.getBoundingClientRect()
    const x = e.clientX - rect.left
    const time = (x / this.timelineWidth) * this.duration

    this.videoPlayer.currentTime = time
  }

  addSelection(start, end, action = 'speed') {
    // Check for overlaps and merge if necessary
    const newSelection = { start, end, speed: 1.0, action }

    // Remove overlapping selections
    this.selections = this.selections.filter((selection) => {
      return !(start < selection.end && end > selection.start)
    })

    this.selections.push(newSelection)
    this.selections.sort((a, b) => a.start - b.start)

    this.updatePortionsTable()
    this.updateProcessButton()
  }

  updatePlaybackSpeed() {
    const newRate = this.playbackRates[this.currentRateIndex]
    this.videoPlayer.playbackRate = newRate
    document.getElementById("speedDisplay").textContent = `${newRate.toFixed(2)}x`
  }

  removeSelection(index) {
    this.selections.splice(index, 1)
    this.updatePortionsTable()
    this.updateProcessButton()
    this.drawTimeline()
  }

  updateSelectionAction(index, action) {
    this.selections[index].action = action
    this.updatePortionsTable()
  }

  updateSelectionSpeed(index, speed) {
    if (speed >= 0.1 && speed <= 5.0) {
      this.selections[index].speed = speed
    }
  }

  updatePortionsTable() {
    const tbody = document.getElementById("portionsTableBody")

    if (this.selections.length === 0) {
      tbody.innerHTML = '<tr class="empty-state"><td colspan="4">No portions selected</td></tr>'
      return
    }

    tbody.innerHTML = this.selections
      .map(
        (selection, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${this.formatTime(selection.start)} - ${this.formatTime(selection.end)}</td>
                <td>
                    <div class="speed-action-container">
                        <select class="action-select" onchange="videoEditor.updateSelectionAction(${index}, this.value)">
                            <option value="speed" ${selection.action === 'speed' ? 'selected' : ''}>Speed</option>
                            <option value="trim" ${selection.action === 'trim' ? 'selected' : ''}>Trim</option>
                        </select>
                        <input type="number" class="speed-input" value="${selection.speed.toFixed(2)}"
                               min="0.1" max="5.0" step="0.1"
                               ${selection.action !== 'speed' ? 'disabled' : ''}
                               onchange="videoEditor.updateSelectionSpeed(${index}, parseFloat(this.value))">
                    </div>
                </td>
                <td>
                    <button class="delete-btn" onclick="videoEditor.removeSelection(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `,
      )
      .join("")
  }

  updateProcessButton() {
    const processBtn = document.getElementById("processBtn")
    processBtn.disabled = this.selections.length === 0
  }

  drawTimeline() {
    if (!this.duration) return

    // Clear canvas
    this.ctx.clearRect(0, 0, this.timelineWidth, this.timelineHeight)

    // Draw background
    this.ctx.fillStyle = "#333"
    this.ctx.fillRect(0, 0, this.timelineWidth, this.timelineHeight)

    // Draw grid lines
    this.ctx.strokeStyle = "#444"
    this.ctx.lineWidth = 1

    const timeStep = this.duration / 10
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * this.timelineWidth
      this.ctx.beginPath()
      this.ctx.moveTo(x, 0)
      this.ctx.lineTo(x, this.timelineHeight)
      this.ctx.stroke()
    }

    // Draw selections
    this.selections.forEach((selection) => {
      const startX = (selection.start / this.duration) * this.timelineWidth
      const endX = (selection.end / this.duration) * this.timelineWidth
      const width = endX - startX

      // Selection background
      this.ctx.fillStyle = "rgba(85, 170, 153, 0.3)"
      this.ctx.fillRect(startX, 0, width, this.timelineHeight)

      // Selection border
      this.ctx.strokeStyle = "#5a9"
      this.ctx.lineWidth = 2
      this.ctx.strokeRect(startX, 0, width, this.timelineHeight)

      // Speed label
      this.ctx.fillStyle = "#f0f0f0"
      this.ctx.font = "12px Segoe UI"
      this.ctx.textAlign = "center"
      this.ctx.fillText(`${selection.speed.toFixed(2)}x`, startX + width / 2, this.timelineHeight / 2 + 4)
    })

    // Draw current time indicator
    if (this.currentTime > 0) {
      const currentX = (this.currentTime / this.duration) * this.timelineWidth

      // Line
      this.ctx.strokeStyle = "#e57373"
      this.ctx.lineWidth = 2
      this.ctx.beginPath()
      this.ctx.moveTo(currentX, 0)
      this.ctx.lineTo(currentX, this.timelineHeight)
      this.ctx.stroke()

      // Circle
      this.ctx.fillStyle = "#e57373"
      this.ctx.beginPath()
      this.ctx.arc(currentX, 8, 4, 0, 2 * Math.PI)
      this.ctx.fill()
    }
  }

  drawPreviewSelection(start, end) {
    const startX = (Math.min(start, end) / this.duration) * this.timelineWidth
    const endX = (Math.max(start, end) / this.duration) * this.timelineWidth
    const width = endX - startX

    this.ctx.fillStyle = "rgba(85, 170, 153, 0.2)"
    this.ctx.fillRect(startX, 0, width, this.timelineHeight)

    this.ctx.strokeStyle = "#5a9"
    this.ctx.lineWidth = 1
    this.ctx.setLineDash([5, 5])
    this.ctx.strokeRect(startX, 0, width, this.timelineHeight)
    this.ctx.setLineDash([])
  }

  updateTimeDisplay() {
    document.getElementById("currentTime").textContent = this.formatTime(this.currentTime)
    document.getElementById("totalTime").textContent = this.formatTime(this.duration)
  }

  async processVideo() {
    if (this.selections.length === 0) return

    const processBtn = document.getElementById("processBtn")
    const processingStatus = document.getElementById("processingStatus")

    processBtn.disabled = true
    processingStatus.style.display = "flex"

    try {
      // Start processing
      const response = await fetch("/api/process-video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: this.currentVideo.filename,
          segments: this.selections,
        }),
      })

      const data = await response.json()
      this.processingTaskId = data.task_id

      // Poll for progress
      this.pollProgress()
    } catch (error) {
      console.error("Error starting video processing:", error)
      this.showProcessingError("Failed to start processing")
    }
  }

  async pollProgress() {
    if (!this.processingTaskId) return

    try {
      const response = await fetch(`/api/progress/${this.processingTaskId}`)
      const data = await response.json()

      this.updateProgressDisplay(data)

      if (data.status === "completed") {
        this.showProcessingComplete(data)
      } else if (data.status === "error") {
        this.showProcessingError(data.error)
      } else {
        // Continue polling
        setTimeout(() => this.pollProgress(), 1000)
      }
    } catch (error) {
      console.error("Error polling progress:", error)
      this.showProcessingError("Failed to get progress")
    }
  }

  updateProgressDisplay(data) {
    const progressFill = document.getElementById("progressFill")
    const progressPercent = document.getElementById("progressPercent")
    const progressStatus = document.getElementById("progressStatus")

    progressFill.style.width = `${data.progress}%`
    progressPercent.textContent = `${Math.round(data.progress)}%`

    const statusMessages = {
      queued: "Queued for processing...",
      analyzing: "Analyzing video...",
      processing: "Processing video...",
      concatenating: "Combining segments...",
      cleanup: "Cleaning up...",
    }

    if (data.status.startsWith("processing_segment_")) {
      const segmentNum = data.status.split("_")[2]
      progressStatus.textContent = `Processing segment ${segmentNum}...`
    } else {
      progressStatus.textContent = statusMessages[data.status] || "Processing..."
    }
  }

  showProcessingComplete(data) {
    this.showToast("Video processed successfully!")

    this.processedFiles[this.currentVideo.filename] = data.output_filename
    localStorage.setItem('processedFiles', JSON.stringify(this.processedFiles))
    
    this.renderVideoList()

    document.getElementById("processingStatus").style.display = "none"
    document.getElementById("processBtn").disabled = false
  }

  showProcessingError(error) {
    document.getElementById("processingStatus").style.display = "none"
    document.getElementById("processBtn").disabled = this.selections.length === 0
    alert(`Processing failed: ${error}`)
  }

  hideProcessingResults() {
    document.getElementById("processingStatus").style.display = "none"
    document.getElementById("processBtn").disabled = this.selections.length === 0
  }

  handleResize() {
    this.setupCanvas()
    this.drawTimeline()
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  formatDuration(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  async uploadFiles(files) {
    this.showToast(`Uploading ${files.length} file(s)...`)
    const formData = new FormData()
    for (const file of files) {
        formData.append('file', file)
    }

    try {
        const response = await fetch('/api/upload-video', {
            method: 'POST',
            body: formData
        })

        if (!response.ok) {
            throw new Error('Upload failed')
        }
        this.showToast('Upload complete!')
        this.loadVideos() // Refresh the list
    } catch (error) {
        console.error('Error uploading files:', error)
        this.showToast('Upload failed. See console for details.', 'error')
    }
  }

  showToast(message, type = 'success') {
      const toast = document.createElement('div')
      toast.className = `toast toast-${type}`
      toast.textContent = message
      document.body.appendChild(toast)

      setTimeout(() => {
          toast.classList.add('show')
      }, 100)

      setTimeout(() => {
          toast.classList.remove('show')
          setTimeout(() => {
              document.body.removeChild(toast)
          }, 500)
      }, 3000)
  }

  debounce(func, delay) {
      let timeout
      return function(...args) {
          const context = this
          clearTimeout(timeout)
          timeout = setTimeout(() => func.apply(context, args), delay)
      }
  }
}

// Initialize the video editor when the page loads
let videoEditor
document.addEventListener("DOMContentLoaded", () => {
  // Add a small delay to ensure all elements are rendered
  setTimeout(() => {
    videoEditor = new VideoEditor()
    videoEditor.init()
  }, 100)
})
