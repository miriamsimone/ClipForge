const { desktopCapturer, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class RecordingService {
  constructor() {
    this.isRecording = false;
    this.ffmpegProcess = null;
    this.outputPath = null;
  }

  async getScreenSources() {
    try {
      console.log('Getting screen sources...');
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 150, height: 150 }
      });
      
      console.log('Raw sources from desktopCapturer:', sources);
      
      const mappedSources = sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL()
      }));
      
      console.log('Mapped sources:', mappedSources);
      return mappedSources;
    } catch (error) {
      console.error('Error getting screen sources:', error);
      throw new Error(`Failed to get screen sources: ${error.message}`);
    }
  }

  async startScreenRecording(options = {}) {
    if (this.isRecording) {
      throw new Error('Recording is already in progress');
    }

    try {
      console.log('Starting screen recording with options:', options);
      
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

      console.log('Found source:', source);
      console.log('Source ID for FFmpeg:', sourceId);
      console.log('Source ID type:', typeof sourceId);
      console.log('Source ID length:', sourceId.length);

      // Generate output path
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.outputPath = path.join(
        require('os').homedir(),
        'Desktop',
        `ClipForge_Recording_${timestamp}.mp4`
      );

      // For macOS, we'll use FFmpeg with avfoundation
      // But first, we need to use screen capture API differently
      // The issue is that Electron source IDs don't map directly to FFmpeg device indices
      // So we'll use a simpler approach: list available screens and use the first one
      // Or better: use Electron's built-in screen capture with getUserMedia approach
      // For now, let's use FFmpeg with a default screen capture (will capture primary display)
      
      const ffmpegPath = this.getFFmpegPath();
      const args = [
        '-f', 'avfoundation',
        '-framerate', frameRate.toString(),
        '-capture_cursor', '1',
        '-capture_mouse_clicks', '1',
        '-i', '1:none', // Screen 1, no audio device initially
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', quality === 'high' ? '18' : quality === 'medium' ? '23' : '28',
        '-r', frameRate.toString(),
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart'
      ];

      // Add audio if requested - use system audio
      if (audio) {
        // Try to capture system audio using BlackHole or similar, or skip audio
        // For now, we'll skip audio in FFmpeg and handle it separately if needed
        args.push('-an'); // No audio for now - Electron stream approach handles audio better
      } else {
        args.push('-an');
      }

      args.push('-y', this.outputPath);

      console.log('FFmpeg command:', ffmpegPath, args.join(' '));

      // Start FFmpeg process
      this.ffmpegProcess = spawn(ffmpegPath, args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.ffmpegProcess.on('error', (error) => {
        console.error('FFmpeg process error:', error);
        this.isRecording = false;
        this.cleanup();
      });

      this.ffmpegProcess.on('exit', (code) => {
        console.log('FFmpeg process exited with code:', code);
        this.isRecording = false;
        this.cleanup();
      });

      // Log FFmpeg output for debugging
      this.ffmpegProcess.stdout.on('data', (data) => {
        console.log('FFmpeg stdout:', data.toString());
      });

      this.ffmpegProcess.stderr.on('data', (data) => {
        const errorOutput = data.toString();
        console.log('FFmpeg stderr:', errorOutput);
        
        // Check for critical errors
        if (errorOutput.includes('Invalid data') || errorOutput.includes('header parsing failed')) {
          console.error('FFmpeg recording failed - file will be corrupted');
          this.isRecording = false;
        }
      });

      this.isRecording = true;
      console.log('Recording state set to true');

      return {
        success: true,
        message: 'Screen recording started',
        sourceId: sourceId,
        outputPath: this.outputPath
      };
    } catch (error) {
      console.error('Error starting screen recording:', error);
      this.cleanup();
      throw new Error(`Failed to start screen recording: ${error.message}`);
    }
  }

  async stopScreenRecording() {
    console.log('stopScreenRecording called, isRecording:', this.isRecording);
    
    if (!this.isRecording) {
      throw new Error('No recording in progress');
    }

    try {
      console.log('Stopping screen recording...');
      
      if (this.ffmpegProcess) {
        console.log('Killing FFmpeg process...');
        // Store reference to process for timeout callback
        const processRef = this.ffmpegProcess;
        let processExited = false;
        let timeoutId = null;
        
        // Send SIGINT to gracefully stop FFmpeg
        processRef.kill('SIGINT');
        
        // Wait for the process to finish
        await new Promise((resolve) => {
          // Set up exit handler
          const exitHandler = (code) => {
            if (!processExited) {
              console.log('FFmpeg process stopped with code:', code);
              processExited = true;
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
              resolve();
            }
          };
          
          processRef.once('exit', exitHandler);
          
          // Timeout after 5 seconds
          timeoutId = setTimeout(() => {
            if (!processExited) {
              console.log('FFmpeg stop timeout, forcing kill');
              try {
                if (processRef && !processRef.killed) {
                  processRef.kill('SIGKILL');
                }
              } catch (error) {
                console.error('Error forcing kill on FFmpeg process:', error);
              }
              exitHandler(null); // Resolve even if kill failed
            }
          }, 5000);
        });
      }

      this.isRecording = false;
      console.log('Recording state set to false');

      // Wait a bit for file to be written
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Validate file exists and has content
      if (fs.existsSync(this.outputPath)) {
        const stats = fs.statSync(this.outputPath);
        if (stats.size === 0) {
          throw new Error('Recording file is empty - FFmpeg may have failed');
        }
        console.log('Recording file created successfully, size:', stats.size);
      } else {
        throw new Error('Recording file was not created');
      }

      return {
        success: true,
        message: 'Screen recording stopped',
        outputPath: this.outputPath,
        fileName: path.basename(this.outputPath)
      };
    } catch (error) {
      console.error('Error stopping screen recording:', error);
      this.isRecording = false;
      throw new Error(`Failed to stop screen recording: ${error.message}`);
    }
  }

  // saveRecording method removed - we now use FFmpeg to create files directly

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

  getFFmpegPath() {
    const isDev = process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged;
    
    if (isDev) {
      // Development: use FFmpeg from resources
      return path.join(__dirname, '../resources/ffmpeg/ffmpeg-arm64');
    } else {
      // Production: use FFmpeg from app resources
      return path.join(process.resourcesPath, 'ffmpeg/ffmpeg-arm64');
    }
  }

  cleanup() {
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGTERM');
      this.ffmpegProcess = null;
    }
    
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
