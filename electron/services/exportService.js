const fs = require('fs');
const path = require('path');
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
        timelineClips,
        outputPath,
        resolution = '1920x1080',
        framerate = 30,
        quality = 'high',
        codec = 'libx264'
      } = options;

      this.exportProgress = {
        stage: 'preparing',
        progress: 0,
        message: 'Preparing export...',
        outputPath
      };

      // Create concat file for FFmpeg
      const concatFilePath = await this.createConcatFile(timelineClips);
      
      this.exportProgress = {
        stage: 'encoding',
        progress: 10,
        message: 'Starting video encoding...',
        outputPath
      };

      // Start FFmpeg export
      const exportProcess = await this.ffmpegService.executeCommand([
        '-y', // Overwrite output file
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFilePath,
        '-c:v', codec,
        '-preset', 'medium',
        '-crf', this.getQualityCRF(quality),
        '-r', framerate.toString(),
        '-s', resolution,
        '-c:a', 'aac',
        '-b:a', '128k',
        '-progress', 'pipe:1', // Output progress to stdout
        outputPath
      ]);

      this.currentExport = {
        process: exportProcess,
        concatFilePath,
        outputPath,
        startTime: Date.now()
      };

      // Monitor progress
      this.monitorProgress();

      return {
        success: true,
        message: 'Export started successfully'
      };
    } catch (error) {
      this.cleanup();
      throw new Error(`Failed to start export: ${error.message}`);
    }
  }

  async createConcatFile(timelineClips) {
    const concatFilePath = path.join(
      require('os').tmpdir(),
      `clipforge_concat_${Date.now()}.txt`
    );

    const concatContent = timelineClips
      .sort((a, b) => a.startTime - b.startTime)
      .map(clip => `file '${clip.filePath}'`)
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

      // Parse FFmpeg progress from stderr
      // This is a simplified version - in reality, you'd parse the actual FFmpeg output
      const elapsed = Date.now() - this.currentExport.startTime;
      const estimatedTotal = elapsed * 2; // Rough estimate
      const progress = Math.min(90, (elapsed / estimatedTotal) * 100);

      this.exportProgress = {
        ...this.exportProgress,
        progress: Math.round(progress),
        message: `Encoding... ${Math.round(progress)}%`
      };

      if (progress < 90) {
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
      // Cancel FFmpeg process
      if (this.currentExport.process && this.currentExport.process.kill) {
        this.currentExport.process.kill('SIGTERM');
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

  cleanup() {
    if (this.currentExport) {
      // Clean up concat file
      if (this.currentExport.concatFilePath && fs.existsSync(this.currentExport.concatFilePath)) {
        fs.unlinkSync(this.currentExport.concatFilePath);
      }
    }

    this.currentExport = null;
    this.exportProgress = {
      stage: 'idle',
      progress: 0,
      message: '',
      outputPath: null
    };
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
