const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

class FFmpegService {
  constructor() {
    this.ffmpegPath = this.getFFmpegPath();
    this.activeProcesses = new Map();
  }

  getFFmpegPath() {
    const arch = os.arch();
    const isDev = process.env.NODE_ENV === 'development';
    
    if (isDev) {
      return path.join(__dirname, '..', 'resources', 'ffmpeg', `ffmpeg-${arch}`);
    } else {
      return path.join(process.resourcesPath, 'ffmpeg', `ffmpeg-${arch}`);
    }
  }

  async executeCommand(args, options = {}) {
    let currentProcessId = null;

    const commandPromise = new Promise((resolve, reject) => {
      // Check if FFmpeg binary exists
      if (!fs.existsSync(this.ffmpegPath)) {
        reject(new Error(`FFmpeg binary not found at ${this.ffmpegPath}`));
        return;
      }

      const processId = Date.now().toString();
      currentProcessId = processId;
      const process = spawn(this.ffmpegPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options
      });

      this.activeProcesses.set(processId, process);

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        this.activeProcesses.delete(processId);
        
        if (code === 0) {
          resolve({ stdout, stderr, code, processId });
        } else {
          reject(new Error(`FFmpeg process exited with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        this.activeProcesses.delete(processId);
        reject(error);
      });
    });
    commandPromise.processId = currentProcessId;
    return commandPromise;
  }

  async getMetadata(filePath) {
    const args = [
      '-i', filePath,
      '-v', 'info',
      '-f', 'null',
      '-'
    ];

    try {
      console.log('FFmpeg path:', this.ffmpegPath);
      console.log('FFmpeg args:', args);
      
      const result = await this.executeCommand(args);
      // FFmpeg outputs info to stderr
      const output = result.stderr;
      
      console.log('FFmpeg stdout length:', result.stdout.length);
      console.log('FFmpeg stderr length:', output.length);
      console.log('FFmpeg stderr preview:', output.substring(0, 200));
      
      if (!output) {
        throw new Error('No output from FFmpeg');
      }
      
      // Parse FFmpeg output to extract metadata
      return this.parseFFmpegOutput(output);
    } catch (error) {
      console.error('FFmpeg metadata error:', error);
      throw new Error(`Failed to get metadata: ${error.message}`);
    }
  }

  parseFFmpegOutput(output) {
    const lines = output.split('\n');
    let duration = 0;
    let width = 0;
    let height = 0;
    let frameRate = 30;
    let codec = 'unknown';
    let audioCodec = 'none';
    let hasAudio = false;

    for (const line of lines) {
      // Parse duration
      const durationMatch = line.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (durationMatch) {
        const hours = parseInt(durationMatch[1]);
        const minutes = parseInt(durationMatch[2]);
        const seconds = parseFloat(durationMatch[3]);
        duration = hours * 3600 + minutes * 60 + seconds;
      }

      // Parse video stream info - only match input streams (not output streams)
      const videoMatch = line.match(/Stream #0:\d+\[0x[0-9a-f]+\]\([^)]+\): Video: (\w+)/);
      if (videoMatch) {
        codec = videoMatch[1];
      }

      // Parse audio stream info - only match input streams
      const audioMatch = line.match(/Stream #0:\d+\[0x[0-9a-f]+\]\([^)]+\): Audio: (\w+)/);
      if (audioMatch) {
        audioCodec = audioMatch[1];
        hasAudio = true;
      }

      // Parse resolution - look for the specific pattern in video stream
      const resolutionMatch = line.match(/(\d+)x(\d+),/);
      if (resolutionMatch) {
        width = parseInt(resolutionMatch[1]);
        height = parseInt(resolutionMatch[2]);
      }

      // Parse frame rate - look for fps in the video stream line
      const frameRateMatch = line.match(/(\d+(?:\.\d+)?) fps/);
      if (frameRateMatch) {
        frameRate = parseFloat(frameRateMatch[1]);
      }
    }

    return {
      format: {
        duration: duration
      },
      streams: [
        {
          codec_type: 'video',
          codec_name: codec,
          width: width,
          height: height,
          r_frame_rate: `${frameRate}/1`
        },
        ...(hasAudio ? [{
          codec_type: 'audio',
          codec_name: audioCodec
        }] : [])
      ]
    };
  }

  async generateThumbnail(filePath, timestamp = '00:00:01') {
    const outputPath = path.join(
      path.dirname(filePath),
      `.thumb_${path.basename(filePath, path.extname(filePath))}.jpg`
    );

    const args = [
      '-i', filePath,
      '-ss', timestamp,
      '-vframes', '1',
      '-q:v', '2',
      '-y',
      outputPath
    ];

    try {
      await this.executeCommand(args);
      return outputPath;
    } catch (error) {
      throw new Error(`Failed to generate thumbnail: ${error.message}`);
    }
  }

  async exportVideo(inputFiles, outputPath, options = {}) {
    const {
      resolution = '1920x1080',
      framerate = 30,
      quality = 'high',
      codec = 'libx264'
    } = options;

    const args = [
      '-y', // Overwrite output file
      '-f', 'concat',
      '-safe', '0',
      '-i', inputFiles, // This should be a concat file
      '-c:v', codec,
      '-preset', 'medium',
      '-crf', quality === 'high' ? '18' : quality === 'medium' ? '23' : '28',
      '-r', framerate.toString(),
      '-s', resolution,
      '-c:a', 'aac',
      '-b:a', '128k',
      outputPath
    ];

    try {
      const result = await this.executeCommand(args);
      return { success: true, outputPath, ...result };
    } catch (error) {
      throw new Error(`Failed to export video: ${error.message}`);
    }
  }

  cancelProcess(processId) {
    const process = this.activeProcesses.get(processId);
    if (process) {
      process.kill('SIGTERM');
      this.activeProcesses.delete(processId);
      return true;
    }
    return false;
  }

  cancelAllProcesses() {
    for (const [processId, process] of this.activeProcesses) {
      process.kill('SIGTERM');
    }
    this.activeProcesses.clear();
  }
}

module.exports = FFmpegService;
