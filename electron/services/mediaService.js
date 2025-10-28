const fs = require('fs');
const path = require('path');
const FFmpegService = require('./ffmpegService');

class MediaService {
  constructor() {
    this.ffmpegService = new FFmpegService();
  }

  async getMetadata(filePath) {
    try {
      const stats = fs.statSync(filePath);
      const ffmpegMetadata = await this.ffmpegService.getMetadata(filePath);
      
      // Extract video stream info
      const videoStream = ffmpegMetadata.streams?.find(stream => stream.codec_type === 'video');
      const audioStream = ffmpegMetadata.streams?.find(stream => stream.codec_type === 'audio');
      
      return {
        filePath,
        fileName: path.basename(filePath),
        fileSize: stats.size,
        duration: parseFloat(ffmpegMetadata.format?.duration) || 0,
        width: parseInt(videoStream?.width) || 0,
        height: parseInt(videoStream?.height) || 0,
        frameRate: this.parseFrameRate(videoStream?.r_frame_rate),
        codec: videoStream?.codec_name || 'unknown',
        audioCodec: audioStream?.codec_name || 'none',
        hasAudio: !!audioStream,
        format: ffmpegMetadata.format?.format_name || 'unknown'
      };
    } catch (error) {
      throw new Error(`Failed to get metadata for ${filePath}: ${error.message}`);
    }
  }

  async generateThumbnail(filePath, timestamp = '00:00:01') {
    try {
      const thumbnailPath = await this.ffmpegService.generateThumbnail(filePath, timestamp);
      
      // Convert to base64 for frontend use
      const thumbnailBuffer = fs.readFileSync(thumbnailPath);
      const base64 = thumbnailBuffer.toString('base64');
      
      // Clean up temporary file
      fs.unlinkSync(thumbnailPath);
      
      return `data:image/jpeg;base64,${base64}`;
    } catch (error) {
      throw new Error(`Failed to generate thumbnail: ${error.message}`);
    }
  }

  async generateMultipleThumbnails(filePath, count = 5) {
    try {
      const metadata = await this.getMetadata(filePath);
      const duration = metadata.duration;
      const interval = duration / (count + 1);
      
      const thumbnails = [];
      
      for (let i = 1; i <= count; i++) {
        const timestamp = this.formatTime(interval * i);
        const thumbnail = await this.generateThumbnail(filePath, timestamp);
        thumbnails.push({
          timestamp: interval * i,
          data: thumbnail
        });
      }
      
      return thumbnails;
    } catch (error) {
      throw new Error(`Failed to generate multiple thumbnails: ${error.message}`);
    }
  }

  parseFrameRate(frameRateString) {
    if (!frameRateString) return 30;
    
    const parts = frameRateString.split('/');
    if (parts.length === 2) {
      return parseFloat(parts[0]) / parseFloat(parts[1]);
    }
    
    return parseFloat(frameRateString) || 30;
  }

  formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  async validateVideoFile(filePath) {
    try {
      const metadata = await this.getMetadata(filePath);
      
      // Check if it's a valid video file
      if (metadata.width === 0 || metadata.height === 0) {
        throw new Error('Invalid video file: no video stream found');
      }
      
      if (metadata.duration === 0) {
        throw new Error('Invalid video file: zero duration');
      }
      
      return {
        valid: true,
        metadata
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

module.exports = MediaService;
