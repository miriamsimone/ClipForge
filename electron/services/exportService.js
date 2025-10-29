const fs = require('fs');
const path = require('path');
const os = require('os');
const FFmpegService = require('./ffmpegService');

class ExportService {
  constructor() {
    this.ffmpegService = new FFmpegService();
    this.currentExport = null;
    this.exportProgress = {
      stage: 'idle',
      progress: 0,
      message: '',
      outputPath: null
    };
  }

  async startExport(options) {
    if (this.currentExport) {
      throw new Error('Export already in progress');
    }

    try {
      const {
        timelineClips = [],
        outputPath,
        resolution = '1920x1080',
        framerate = 30,
        quality = 'high',
        codec = 'libx264',
        audioCodec = 'aac',
        container = 'mp4'
      } = options;

      const resolvedOutputPath = this.resolveOutputPath(outputPath, container);

      this.exportProgress = {
        stage: 'preparing',
        progress: 0,
        message: 'Preparing export...',
        outputPath: resolvedOutputPath
      };

      const preparedClips = timelineClips
        .map(clip => {
          if (!clip || !clip.filePath) {
            return null;
          }

          const trimIn = Math.max(0, Number(clip.trimIn ?? 0));
          const trimOut = Math.max(trimIn, Number(clip.trimOut ?? trimIn));
          const duration = Math.max(0, Number(clip.duration ?? (trimOut - trimIn)));

          if (duration <= 0.01) {
            return null;
          }

          return {
            filePath: clip.filePath,
            trimIn,
            trimOut,
            duration,
            startTime: Number(clip.startTime ?? 0),
            hasAudio: Boolean(clip.hasAudio),
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.startTime - b.startTime);

      if (!preparedClips.length) {
        throw new Error('No clips available to export. Ensure clips have duration after trimming.');
      }

      this.exportProgress = {
        stage: 'encoding',
        progress: 10,
        message: 'Starting video encoding...',
        outputPath: resolvedOutputPath
      };
      const includeAudio = preparedClips.every(clip => clip.hasAudio);

      // Use simple approach like the working command
      const tempFiles = [];
      const ffmpegArgs = ['-y'];

      try {
      console.log(`Number of prepared clips: ${preparedClips.length}`);
      console.log('Prepared clips:', preparedClips.map(c => ({ filePath: c.filePath, trimIn: c.trimIn, trimOut: c.trimOut, duration: c.duration })));
      if (preparedClips.length === 1) {
        console.log('Using SINGLE CLIP path');
          // Single clip - use the simple approach like your working command
          const clip = preparedClips[0];
          const startTime = this.formatTime(clip.trimIn);
          const endTime = this.formatTime(clip.trimOut);

          console.log(`Single clip export:`, {
            input: clip.filePath,
            startTime,
            endTime,
            output: resolvedOutputPath
          });

          ffmpegArgs.push(
            '-i', clip.filePath,
            '-ss', startTime,
            '-to', endTime
          );

          if (resolution !== 'source') {
            // Re-encode if we need to change resolution
            ffmpegArgs.push('-c:v', codec);
            ffmpegArgs.push('-preset', 'medium');
            ffmpegArgs.push('-crf', this.getQualityCRF(quality));
            
            if (typeof resolution === 'string' && resolution !== 'source') {
              ffmpegArgs.push('-s', resolution);
            }
            
            if (includeAudio) {
              ffmpegArgs.push('-c:a', audioCodec || 'aac', '-b:a', '128k');
            }
          } else {
            // Use stream copy for no re-encoding
            ffmpegArgs.push('-c', 'copy');
          }

          if (container === 'mp4') {
            ffmpegArgs.push('-movflags', '+faststart');
          }

          ffmpegArgs.push('-progress', 'pipe:1', resolvedOutputPath);

          console.log('Single clip FFmpeg command:', ffmpegArgs.join(' '));

          var exportPromise = this.ffmpegService.executeCommand(ffmpegArgs);
        } else {
          console.log('Using MULTI-CLIP path');
          // Multiple clips - create temp files and concatenate
          for (let i = 0; i < preparedClips.length; i++) {
            const clip = preparedClips[i];
            const tempFile = path.join(os.tmpdir(), `clipforge_temp_${Date.now()}_${i}.mp4`);
            tempFiles.push(tempFile);

            const startTime = this.formatTime(clip.trimIn);
            const endTime = this.formatTime(clip.trimOut);

            const trimArgs = [
              '-y',
              '-i', clip.filePath,
              '-ss', startTime,
              '-to', endTime,
              '-c', 'copy' // Use stream copy like your working command
            ];

            console.log(`Trimming clip ${i + 1}/${preparedClips.length}:`, {
              input: clip.filePath,
              startTime,
              endTime,
              output: tempFile
            });

            try {
              await this.ffmpegService.executeCommand(trimArgs);
              console.log(`✅ Successfully trimmed clip ${i + 1}`);
            } catch (error) {
              console.error(`❌ Failed to trim clip ${i + 1}:`, error.message);
              throw new Error(`Failed to trim clip ${i + 1}: ${error.message}`);
            }
          }

          // Concatenate using simple concat demuxer
          const concatFile = path.join(os.tmpdir(), `clipforge_concat_${Date.now()}.txt`);
          const concatContent = tempFiles.map(file => `file '${file.replace(/\\/g, '/')}'`).join('\n');
          fs.writeFileSync(concatFile, concatContent);
          tempFiles.push(concatFile);

          console.log('Concatenating files:', {
            concatFile,
            files: tempFiles.slice(0, -1),
            content: concatContent
          });

          ffmpegArgs.push(
            '-f', 'concat',
            '-safe', '0',
            '-i', concatFile,
            '-c', 'copy' // Use stream copy for concatenation
          );

          if (resolution !== 'source' || (typeof framerate === 'number' && Number.isFinite(framerate))) {
            // Only re-encode if we need to change resolution or framerate
            ffmpegArgs.pop(); // Remove '-c', 'copy'
            ffmpegArgs.push('-c:v', codec);
            ffmpegArgs.push('-preset', 'medium');
            ffmpegArgs.push('-crf', this.getQualityCRF(quality));

            if (typeof framerate === 'number' && Number.isFinite(framerate)) {
              ffmpegArgs.push('-r', framerate.toString());
            }

            if (typeof resolution === 'string' && resolution !== 'source') {
              ffmpegArgs.push('-s', resolution);
            }

            if (includeAudio) {
              ffmpegArgs.push('-c:a', audioCodec || 'aac', '-b:a', '128k');
            }
          }

          if (container === 'mp4') {
            ffmpegArgs.push('-movflags', '+faststart');
          }

          ffmpegArgs.push('-progress', 'pipe:1', resolvedOutputPath);

          console.log('Multi-clip FFmpeg command:', ffmpegArgs.join(' '));

          var exportPromise = this.ffmpegService.executeCommand(ffmpegArgs);
        }

        this.currentExport = {
          processPromise: exportPromise,
          processId: exportPromise.processId,
          outputPath: resolvedOutputPath,
          startTime: Date.now(),
          tempFiles: tempFiles, // Store temp files for cleanup
        };

        exportPromise
          .then(() => {
            this.exportProgress = {
              stage: 'complete',
              progress: 100,
              message: 'Export complete',
              outputPath: resolvedOutputPath
            };
            this.finishHistoryEntry(options, 'completed');
            this.cleanup({ resetProgress: false });
          })
          .catch((error) => {
            this.exportProgress = {
              stage: 'error',
              progress: 0,
              message: error.message,
              outputPath: null
            };
            this.finishHistoryEntry(options, 'failed');
            this.cleanup();
          });
      } catch (error) {
        // Clean up temp files on error
        this.cleanupTempFiles(tempFiles);
        throw error;
      }

      this.monitorProgress();

      return {
        success: true,
        message: 'Export started successfully',
        options: {
          ...options,
          outputPath: resolvedOutputPath,
        }
      };
    } catch (error) {
      this.cleanup();
      throw new Error(`Failed to start export: ${error.message}`);
    }
  }

  getQualityCRF(quality) {
    const qualityMap = {
      'low': '28',
      'medium': '23',
      'high': '18',
      'maximum': '15'
    };
    return qualityMap[quality] || '23';
  }

  formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  monitorProgress() {
    if (!this.currentExport) return;

    const checkProgress = () => {
      if (!this.currentExport) return;

      const previousProgress = Number.isFinite(this.exportProgress.progress)
        ? this.exportProgress.progress
        : 10;
      const newProgress = previousProgress >= 90 ? previousProgress : Math.min(90, previousProgress + 5);
      const message = this.exportProgress.stage === 'complete'
        ? this.exportProgress.message
        : `Encoding... ${Math.round(newProgress)}%`;

      this.exportProgress = {
        ...this.exportProgress,
        progress: newProgress,
        message,
      };

      if (this.currentExport && this.exportProgress.stage === 'encoding') {
        setTimeout(checkProgress, 1000);
      }
    };

    checkProgress();
  }

  async getProgress() {
    return { ...this.exportProgress };
  }

  async cancelExport() {
    if (!this.currentExport) {
      return { success: false, message: 'No export in progress' };
    }

    try {
      if (this.currentExport.processId) {
        this.ffmpegService.cancelProcess(this.currentExport.processId);
      }

      this.cleanup();

      return {
        success: true,
        message: 'Export cancelled successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to cancel export: ${error.message}`
      };
    }
  }

  cleanup({ resetProgress = true } = {}) {
    // Clean up temporary files if they exist
    if (this.currentExport && this.currentExport.tempFiles) {
      this.cleanupTempFiles(this.currentExport.tempFiles);
    }
    
    this.currentExport = null;
    if (resetProgress) {
      this.exportProgress = {
        stage: 'idle',
        progress: 0,
        message: '',
        outputPath: null
      };
    }
  }

  cleanupTempFiles(tempFiles) {
    if (!tempFiles || !Array.isArray(tempFiles)) return;
    
    tempFiles.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.warn(`Failed to delete temporary file ${filePath}:`, error.message);
      }
    });
  }

  finishHistoryEntry(options, status) {
    // Placeholder for history tracking
    if (!this.exportProgress) {
      return;
    }

    // Could push to history array or log if needed
  }

  resolveOutputPath(outputPath, container) {
    if (!outputPath || typeof outputPath !== 'string') {
      throw new Error('Please select an output file.');
    }

    let resolved = outputPath.trim();
    if (resolved.startsWith('~')) {
      resolved = path.join(os.homedir(), resolved.slice(1));
    }

    resolved = path.resolve(resolved);

    const desiredExt = container === 'mov' ? '.mov' : '.mp4';
    if (path.extname(resolved).toLowerCase() !== desiredExt) {
      resolved += desiredExt;
    }

    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return resolved;
  }

  async getExportHistory() {
    // This would typically read from a database or file
    // For now, return empty array
    return [];
  }

  async cleanupOldExports(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days
    const outputDir = path.dirname(this.exportProgress.outputPath || '');
    if (!fs.existsSync(outputDir)) return;

    const files = fs.readdirSync(outputDir);
    const now = Date.now();

    for (const file of files) {
      if (file.startsWith('ClipForge_Export_')) {
        const filePath = path.join(outputDir, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
        }
      }
    }
  }
}

module.exports = ExportService;
