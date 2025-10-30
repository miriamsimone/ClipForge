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

    const commandPromise = new Promise(async (resolve, reject) => {
      try {
        // Check if FFmpeg binary exists
        if (!fs.existsSync(this.ffmpegPath)) {
          reject(new Error(`FFmpeg binary not found at ${this.ffmpegPath}`));
          return;
        }

        // Handle input data if provided
        let tempInputPath = null;
        let tempOutputPath = null;

        if (options.inputData && options.inputFileName) {
          tempInputPath = path.join(os.tmpdir(), options.inputFileName);

          // Convert inputData to Buffer properly
          // When Uint8Array is passed through IPC, it becomes a plain object with numeric keys
          let buffer;
          if (Buffer.isBuffer(options.inputData)) {
            buffer = options.inputData;
          } else if (options.inputData instanceof Uint8Array) {
            buffer = Buffer.from(options.inputData);
          } else if (Array.isArray(options.inputData)) {
            buffer = Buffer.from(options.inputData);
          } else if (typeof options.inputData === 'object') {
            // Handle plain object with numeric keys (from IPC serialization)
            const values = Object.values(options.inputData);
            buffer = Buffer.from(values);
          } else {
            console.error('Unknown inputData type:', typeof options.inputData);
            buffer = Buffer.from(options.inputData);
          }

          fs.writeFileSync(tempInputPath, buffer);
          console.log('Created temporary input file:', tempInputPath);
          console.log('File exists:', fs.existsSync(tempInputPath));
          console.log('File size:', fs.statSync(tempInputPath).size, 'bytes');
          console.log('Expected size:', buffer.length, 'bytes');

          // Verify first few bytes to check file integrity
          if (buffer.length > 0) {
            const header = buffer.slice(0, Math.min(16, buffer.length));
            console.log('File header (hex):', header.toString('hex'));
          }

          // Replace the input filename in args with the temp path
          const inputIndex = args.indexOf(options.inputFileName);
          if (inputIndex !== -1) {
            args[inputIndex] = tempInputPath;
          }
        }

        if (options.outputFileName) {
          tempOutputPath = path.join(os.tmpdir(), options.outputFileName);
          // Replace the output filename in args with the temp path
          const outputIndex = args.lastIndexOf(options.outputFileName);
          if (outputIndex !== -1) {
            args[outputIndex] = tempOutputPath;
          }
        }

        console.log('Final FFmpeg args:', args);
        console.log('FFmpeg path:', this.ffmpegPath);
        
        const processId = Date.now().toString();
        currentProcessId = processId;
        const process = spawn(this.ffmpegPath, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          ...options
        });

        this.activeProcesses.set(processId, process);

        let stdout = '';
        let stderr = '';
        let outputData = null;

        process.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        process.on('close', (code) => {
          this.activeProcesses.delete(processId);

          // Clean up temporary files
          if (tempInputPath && fs.existsSync(tempInputPath)) {
            fs.unlinkSync(tempInputPath);
          }

          if (code === 0) {
            // Read output file if it exists
            if (tempOutputPath && fs.existsSync(tempOutputPath)) {
              outputData = fs.readFileSync(tempOutputPath);
              console.log('FFmpeg output file read:');
              console.log('  - Size:', outputData.length, 'bytes');

              // Verify output file has content
              if (outputData.length === 0) {
                console.error('FFmpeg output file is empty!');
                if (tempOutputPath && fs.existsSync(tempOutputPath)) {
                  fs.unlinkSync(tempOutputPath);
                }
                reject(new Error('FFmpeg produced an empty output file'));
                return;
              }

              // Verify MP4 header if output is MP4
              if (tempOutputPath.endsWith('.mp4')) {
                const header = outputData.slice(4, 8).toString('ascii');
                console.log('  - MP4 ftyp header:', header);
                if (!header.includes('ftyp')) {
                  console.error('FFmpeg output does not have valid MP4 header!');
                  console.error('  - First 32 bytes:', outputData.slice(0, 32).toString('hex'));
                }
              }

              fs.unlinkSync(tempOutputPath);
            }

            resolve({
              success: true,
              stdout,
              stderr,
              code,
              processId,
              outputData: outputData ? Array.from(outputData) : null
            });
          } else {
            // Clean up output file on error
            if (tempOutputPath && fs.existsSync(tempOutputPath)) {
              fs.unlinkSync(tempOutputPath);
            }
            console.error('FFmpeg failed with code:', code);
            console.error('FFmpeg stderr:', stderr);
            reject(new Error(`FFmpeg process exited with code ${code}: ${stderr}`));
          }
        });

        process.on('error', (error) => {
          this.activeProcesses.delete(processId);
          // Clean up temporary files on error
          if (tempInputPath && fs.existsSync(tempInputPath)) {
            fs.unlinkSync(tempInputPath);
          }
          if (tempOutputPath && fs.existsSync(tempOutputPath)) {
            fs.unlinkSync(tempOutputPath);
          }
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
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

  /**
   * Extract audio track from a video file
   * @param {string} videoPath - Path to input video file
   * @param {string} outputPath - Path where audio file should be saved
   * @param {string} audioFormat - Output format: 'mp3', 'aac', 'wav', 'm4a' (default: 'aac')
   * @returns {Promise<string>} Path to extracted audio file
   */
  async extractAudio(videoPath, outputPath = null, audioFormat = 'aac') {
    // Generate output path if not provided
    if (!outputPath) {
      const inputDir = path.dirname(videoPath);
      const inputBase = path.basename(videoPath, path.extname(videoPath));
      outputPath = path.join(inputDir, `${inputBase}_audio.${audioFormat}`);
    }

    const args = [
      '-i', videoPath,
      '-vn', // No video
      '-acodec', this.getAudioCodec(audioFormat),
      ...this.getAudioCodecOptions(audioFormat),
      '-y', // Overwrite output
      outputPath
    ];

    try {
      console.log('Extracting audio from video:', videoPath);
      console.log('FFmpeg args:', args);
      await this.executeCommand(args);
      console.log('Audio extracted successfully to:', outputPath);
      return outputPath;
    } catch (error) {
      console.error('Audio extraction failed:', error);
      throw new Error(`Failed to extract audio: ${error.message}`);
    }
  }

  /**
   * Get the appropriate audio codec for the given format
   */
  getAudioCodec(format) {
    const codecMap = {
      'mp3': 'libmp3lame',
      'aac': 'aac',
      'wav': 'pcm_s16le',
      'm4a': 'aac',
      'flac': 'flac',
      'ogg': 'libvorbis'
    };
    return codecMap[format.toLowerCase()] || 'aac';
  }

  /**
   * Get codec-specific options
   */
  getAudioCodecOptions(format) {
    const options = [];
    switch (format.toLowerCase()) {
      case 'mp3':
        options.push('-b:a', '192k'); // Bitrate
        options.push('-ar', '44100'); // Sample rate
        break;
      case 'aac':
      case 'm4a':
        options.push('-b:a', '192k');
        options.push('-ar', '44100');
        break;
      case 'wav':
        // WAV uses PCM, just set sample rate
        options.push('-ar', '44100');
        break;
      case 'flac':
        // FLAC is lossless, no bitrate needed
        options.push('-compression_level', '5');
        break;
      case 'ogg':
        options.push('-b:a', '192k');
        options.push('-ar', '44100');
        break;
    }
    return options;
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
