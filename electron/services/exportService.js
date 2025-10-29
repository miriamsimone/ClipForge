const fs = require('fs');
const path = require('path');
const os = require('os');

class ExportService {
  constructor() {
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

      // Validate timeline clips
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

      // Set up export state for UI
      this.exportProgress = {
        stage: 'encoding',
        progress: 10,
        message: 'Starting video encoding...',
        outputPath: resolvedOutputPath
      };

      // TODO: Implement actual export logic here
      // For now, simulate export completion
      this.currentExport = {
        outputPath: resolvedOutputPath,
        startTime: Date.now(),
        tempFiles: []
      };

      // Simulate export process
      setTimeout(() => {
        this.exportProgress = {
          stage: 'complete',
          progress: 100,
          message: 'Export complete',
          outputPath: resolvedOutputPath
        };
        this.finishHistoryEntry(options, 'completed');
        this.cleanup({ resetProgress: false });
      }, 2000);

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
      // TODO: Implement actual cancellation logic here
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
