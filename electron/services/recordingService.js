const { desktopCapturer } = require('electron');
const fs = require('fs');
const path = require('path');

class RecordingService {
  constructor() {
    this.isRecording = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.outputPath = null;
  }

  async getScreenSources() {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 150, height: 150 }
      });
      
      return sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL()
      }));
    } catch (error) {
      throw new Error(`Failed to get screen sources: ${error.message}`);
    }
  }

  async startScreenRecording(options = {}) {
    if (this.isRecording) {
      throw new Error('Recording is already in progress');
    }

    try {
      const {
        sourceId,
        audio = true,
        video = true,
        frameRate = 30,
        quality = 'high'
      } = options;

      // Get the screen source
      const sources = await this.getScreenSources();
      const source = sources.find(s => s.id === sourceId);
      
      if (!source) {
        throw new Error('Screen source not found');
      }

      // Create constraints for getUserMedia
      const constraints = {
        audio: audio ? {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        } : false,
        video: video ? {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minWidth: 1280,
            minHeight: 720,
            maxWidth: 1920,
            maxHeight: 1080,
            minFrameRate: frameRate,
            maxFrameRate: frameRate
          }
        } : false
      };

      // Get media stream
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Set up MediaRecorder
      const mimeType = this.getSupportedMimeType();
      const mediaRecorderOptions = {
        mimeType,
        videoBitsPerSecond: quality === 'high' ? 5000000 : quality === 'medium' ? 2500000 : 1000000
      };

      this.mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);
      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.saveRecording();
        this.cleanup();
      };

      this.mediaRecorder.onerror = (error) => {
        console.error('MediaRecorder error:', error);
        this.cleanup();
      };

      // Start recording
      this.mediaRecorder.start(1000); // Collect data every second
      this.isRecording = true;

      return {
        success: true,
        message: 'Screen recording started'
      };
    } catch (error) {
      this.cleanup();
      throw new Error(`Failed to start screen recording: ${error.message}`);
    }
  }

  async stopScreenRecording() {
    if (!this.isRecording || !this.mediaRecorder) {
      throw new Error('No recording in progress');
    }

    try {
      this.mediaRecorder.stop();
      this.isRecording = false;

      return {
        success: true,
        message: 'Screen recording stopped'
      };
    } catch (error) {
      throw new Error(`Failed to stop screen recording: ${error.message}`);
    }
  }

  async saveRecording() {
    if (this.recordedChunks.length === 0) {
      throw new Error('No recorded data to save');
    }

    try {
      const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
      const buffer = Buffer.from(await blob.arrayBuffer());
      
      // Generate output path
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.outputPath = path.join(
        require('os').homedir(),
        'Desktop',
        `ClipForge_Recording_${timestamp}.webm`
      );

      fs.writeFileSync(this.outputPath, buffer);

      return {
        success: true,
        outputPath: this.outputPath,
        fileSize: buffer.length
      };
    } catch (error) {
      throw new Error(`Failed to save recording: ${error.message}`);
    }
  }

  getSupportedMimeType() {
    const types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'video/webm'; // Fallback
  }

  cleanup() {
    if (this.mediaRecorder && this.mediaRecorder.stream) {
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
  }

  getRecordingStatus() {
    return {
      isRecording: this.isRecording,
      outputPath: this.outputPath
    };
  }
}

module.exports = RecordingService;
