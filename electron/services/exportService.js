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

      // Create concat file for FFmpeg
      const concatFilePath = await this.createConcatFile(timelineClips);
      
      this.exportProgress = {
        stage: 'encoding',
        progress: 10,
        message: 'Starting video encoding...',
        outputPath: resolvedOutputPath
      };

      // Start FFmpeg export
      const ffmpegArgs = [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFilePath,
        '-c:v', codec,
        '-preset', 'medium',
        '-crf', this.getQualityCRF(quality),
      ];

      if (typeof framerate === 'number' && Number.isFinite(framerate)) {
        ffmpegArgs.push('-r', framerate.toString());
      }

      if (typeof resolution === 'string' && resolution !== 'source') {
        ffmpegArgs.push('-s', resolution);
      }

      ffmpegArgs.push('-c:a', audioCodec || 'aac', '-b:a', '128k');

      if (container === 'mp4') {
        ffmpegArgs.push('-movflags', '+faststart');
      }

      ffmpegArgs.push('-progress', 'pipe:1', resolvedOutputPath);

      const exportPromise = this.ffmpegService.executeCommand(ffmpegArgs);

      this.currentExport = {
        processPromise: exportPromise,
        processId: exportPromise.processId,
        concatFilePath,
        outputPath: resolvedOutputPath,
        startTime: Date.now()
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

  async createConcatFile(timelineClips) {
    const concatFilePath = path.join(
      os.tmpdir(),
      `clipforge_concat_${Date.now()}.txt`
    );

    if (!Array.isArray(timelineClips) || timelineClips.length === 0) {
      throw new Error('Timeline is empty. Add clips before exporting.');
    }

    const concatContent = timelineClips
      .sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
      .map(clip => {
        if (!clip.filePath) {
          throw new Error('Timeline clip missing filePath');
        }
        return `file '${clip.filePath.replace(/'/g, "'\\''")}'`;
      })
      .join('\n');

    fs.writeFileSync(concatFilePath, concatContent);
    return concatFilePath;
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
    if (this.currentExport) {
      // Clean up concat file
      if (this.currentExport.concatFilePath && fs.existsSync(this.currentExport.concatFilePath)) {
        fs.unlinkSync(this.currentExport.concatFilePath);
      }
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
