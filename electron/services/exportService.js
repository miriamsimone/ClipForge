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
        timelineData = null, // New parameter for timeline analysis
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
            hasVideo: Boolean(clip.hasVideo ?? true), // Default to true for backward compatibility
            subtitles: clip.subtitles, // Preserve subtitles from timeline clip
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

      // Build FFmpeg command with timeline analysis
      const exportOptions = {
        ...options,
        timelineData
      };
      
      // Prepare subtitle files if needed
      let tempSubtitleFiles = [];
      try {
        tempSubtitleFiles = await this.prepareSubtitles(preparedClips);
      } catch (error) {
        console.warn('Failed to prepare subtitles:', error);
        // Continue with export even if subtitle preparation fails
      }
      
      const ffmpegArgs = this.buildFFmpegCommand(preparedClips, resolvedOutputPath, exportOptions, tempSubtitleFiles);

      console.log('FFmpeg command:', ffmpegArgs.join(' '));

      // Execute the FFmpeg command
      const exportPromise = this.ffmpegService.executeCommand(ffmpegArgs);

      this.currentExport = {
        processPromise: exportPromise,
        processId: exportPromise.processId,
        outputPath: resolvedOutputPath,
        startTime: Date.now(),
        tempFiles: tempSubtitleFiles
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

  buildFFmpegCommand(preparedClips, outputPath, options, tempSubtitleFiles = []) {
    const {
      resolution = '1920x1080',
      framerate = 30,
      quality = 'high',
      codec = 'libx264',
      audioCodec = 'aac',
      container = 'mp4',
      timelineData = null // New parameter for timeline analysis
    } = options;

    const args = ['-y']; // Overwrite output file

    // Use multi-track approach if:
    // 1. We have gaps (need to fill with black/silence)
    // 2. We have multiple concurrent tracks (need composition/overlaying)
    // 3. We have overlapping clips (need proper layering)
    const hasGaps = timelineData && timelineData.gaps && timelineData.gaps.length > 0;
    const hasMultipleTracks = timelineData && timelineData.maxConcurrentTracks && timelineData.maxConcurrentTracks > 1;
    const hasOverlapping = timelineData && timelineData.hasOverlappingClips;
    
    if (hasGaps || hasMultipleTracks || hasOverlapping) {
      return this.buildMultiTrackFFmpegCommand(preparedClips, outputPath, options, timelineData, tempSubtitleFiles);
    }

    // Original single-track approach for backward compatibility (simple sequential clips)
    return this.buildSingleTrackFFmpegCommand(preparedClips, outputPath, options, tempSubtitleFiles);
  }

  /**
   * Prepare subtitle files for export
   * Creates temporary SRT files with time-adjusted subtitles for each clip
   */
  async prepareSubtitles(preparedClips) {
    const tempFiles = [];
    const clipsWithSubtitles = preparedClips.filter(clip => clip.subtitles && clip.subtitles.srtContent);
    
    if (clipsWithSubtitles.length === 0) {
      return [];
    }

    // Create a combined SRT file for all subtitles
    const combinedSrtPath = path.join(os.tmpdir(), `subtitles_combined_${Date.now()}.srt`);
    let combinedSrtContent = '';

    for (const clip of clipsWithSubtitles) {
      const adjustedSrt = this.adjustSRTTimestamps(
        clip.subtitles.srtContent,
        clip.trimIn,
        clip.startTime
      );
      
      // Append adjusted subtitles to combined file
      combinedSrtContent += adjustedSrt;
    }

    fs.writeFileSync(combinedSrtPath, combinedSrtContent);
    tempFiles.push(combinedSrtPath);

    return tempFiles;
  }

  /**
   * Adjust SRT timestamps for clip trimming and timeline position
   * @param {string} srtContent - Original SRT content
   * @param {number} trimIn - Start time of trim in seconds
   * @param {number} timelineStart - Timeline start position in seconds
   * @returns {string} Adjusted SRT content
   */
  adjustSRTTimestamps(srtContent, trimIn, timelineStart) {
    const lines = srtContent.split('\n');
    const adjustedLines = [];
    let currentIndex = 1;
    let i = 0;
    
    while (i < lines.length) {
      // Skip empty lines at start
      while (i < lines.length && !lines[i].trim()) {
        i++;
      }
      if (i >= lines.length) break;
      
      // Parse subtitle block: index, timestamp, text lines, empty line
      const indexLine = lines[i++].trim();
      
      // Check if this is actually an index (number)
      if (isNaN(parseInt(indexLine))) {
        // Not a valid subtitle block, skip
        continue;
      }
      
      if (i >= lines.length) break;
      
      // Get timestamp line
      const timestampLine = lines[i++].trim();
      const timestampMatch = timestampLine.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
      
      if (!timestampMatch) {
        // Invalid timestamp, skip this block
        while (i < lines.length && lines[i].trim()) {
          i++; // Skip text lines
        }
        continue;
      }
      
      // Parse timestamps
      const startSeconds = this.parseSRTTime(timestampMatch[1], timestampMatch[2], timestampMatch[3], timestampMatch[4]);
      const endSeconds = this.parseSRTTime(timestampMatch[5], timestampMatch[6], timestampMatch[7], timestampMatch[8]);
      
      // Adjust for trim (subtract trimIn)
      const adjustedStart = Math.max(0, startSeconds - trimIn);
      const adjustedEnd = Math.max(0, endSeconds - trimIn);
      
      // Collect text lines
      const textLines = [];
      while (i < lines.length && lines[i].trim()) {
        textLines.push(lines[i]);
        i++;
      }
      
      // If subtitle is completely before trim point or has no text, skip it
      if (adjustedEnd <= 0 || textLines.length === 0) {
        continue;
      }
      
      // Add timeline start offset
      const finalStart = adjustedStart + timelineStart;
      const finalEnd = adjustedEnd + timelineStart;
      
      // Write adjusted subtitle block
      adjustedLines.push(currentIndex.toString());
      adjustedLines.push(this.formatSRTTime(finalStart) + ' --> ' + this.formatSRTTime(finalEnd));
      adjustedLines.push(...textLines);
      adjustedLines.push(''); // Empty line between blocks
      currentIndex++;
    }
    
    return adjustedLines.join('\n') + (adjustedLines.length > 0 ? '\n' : '');
  }

  parseSRTTime(hours, minutes, seconds, milliseconds) {
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(milliseconds) / 1000;
  }

  formatSRTTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  }

  buildSingleTrackFFmpegCommand(preparedClips, outputPath, options, tempSubtitleFiles = []) {
    const {
      resolution = '1920x1080',
      framerate = 30,
      quality = 'high',
      codec = 'libx264',
      audioCodec = 'aac',
      container = 'mp4'
    } = options;

    const args = ['-y']; // Overwrite output file

    // Add input files
    preparedClips.forEach(clip => {
      args.push('-i', clip.filePath);
    });

    // Build filter_complex
    const videoFilters = preparedClips.map((clip, i) => 
      `[${i}:v]trim=start=${clip.trimIn}:end=${clip.trimOut},setpts=PTS-STARTPTS[v${i}]`
    ).join('; ');

    const audioFilters = preparedClips.map((clip, i) => 
      `[${i}:a]atrim=start=${clip.trimIn}:end=${clip.trimOut},asetpts=PTS-STARTPTS[a${i}]`
    ).join('; ');

    const concatInputs = preparedClips.map((_, i) => `[v${i}][a${i}]`).join('');
    const concatFilter = `${concatInputs}concat=n=${preparedClips.length}:v=1:a=1[outv][outa]`;

    // Add subtitle filter if we have subtitles
    let finalVideoFilter = '[outv]';
    if (tempSubtitleFiles.length > 0 && tempSubtitleFiles[0]) {
      const subtitlePath = tempSubtitleFiles[0];
      // FFmpeg subtitles filter - path needs to be in single quotes
      // Escape single quotes in the path itself
      let escapedPath = subtitlePath.replace(/\\/g, '/');
      escapedPath = escapedPath.replace(/'/g, "'\\''"); // Escape single quotes: ' -> '\''
      // Wrap in single quotes for FFmpeg filter
      finalVideoFilter = `[outv]subtitles='${escapedPath}'[subtitled]`;
    }

    const filterComplex = `${videoFilters}; ${audioFilters}; ${concatFilter}${finalVideoFilter !== '[outv]' ? '; ' + finalVideoFilter : ''}`;

    args.push('-filter_complex', filterComplex);
    args.push('-map', finalVideoFilter.includes('subtitled') ? '[subtitled]' : '[outv]');
    args.push('-map', '[outa]');

    // Add encoding options if not using source settings
    if (resolution !== 'source') {
      args.push('-c:v', codec);
      args.push('-preset', 'medium');
      args.push('-crf', this.getQualityCRF(quality));
      
      if (typeof resolution === 'string' && resolution !== 'source') {
        args.push('-s', resolution);
      }
      
      args.push('-c:a', audioCodec || 'aac', '-b:a', '128k');
    } else {
      // Use stream copy for no re-encoding
      args.push('-c', 'copy');
    }

    if (container === 'mp4') {
      args.push('-movflags', '+faststart');
    }

    args.push(outputPath);

    return args;
  }

  buildMultiTrackFFmpegCommand(preparedClips, outputPath, options, timelineData, tempSubtitleFiles = []) {
    const {
      resolution = '1920x1080',
      framerate = 30,
      quality = 'high',
      codec = 'libx264',
      audioCodec = 'aac',
      container = 'mp4'
    } = options;

    const args = ['-y']; // Overwrite output file
    const totalDuration = timelineData.totalDuration;
    const gaps = timelineData.gaps || [];
    const segments = timelineData.segments || [];

    // Add input files
    preparedClips.forEach(clip => {
      args.push('-i', clip.filePath);
    });

    // Create a color source for black frames
    args.push('-f', 'lavfi', '-i', `color=black:size=${resolution}:duration=${totalDuration}:rate=${framerate}`);

    // Create a silence source for audio gaps
    args.push('-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=44100`);

    const colorInputIndex = preparedClips.length;
    const silenceInputIndex = preparedClips.length + 1;

    // Build complex filter for multi-track composition
    const filters = [];
    let inputIndex = 0;

    // Process each clip
    preparedClips.forEach((clip, i) => {
      // Handle video if present
      if (clip.hasVideo) {
        const videoFilter = `[${i}:v]trim=start=${clip.trimIn}:end=${clip.trimOut},setpts=PTS-STARTPTS[v${i}]`;
        filters.push(videoFilter);
      }
      
      // Handle audio if present
      if (clip.hasAudio) {
        const audioFilter = `[${i}:a]atrim=start=${clip.trimIn}:end=${clip.trimOut},asetpts=PTS-STARTPTS[a${i}]`;
        filters.push(audioFilter);
      }
    });

    // Create base video and audio tracks with black/silence
    const baseVideoFilter = `[${colorInputIndex}:v]trim=duration=${totalDuration}[base_video]`;
    const baseAudioFilter = `[${silenceInputIndex}:a]atrim=duration=${totalDuration}[base_audio]`;
    
    filters.push(baseVideoFilter);
    filters.push(baseAudioFilter);

    // Overlay clips onto base tracks
    let currentVideoTrack = 'base_video';
    let currentAudioTrack = 'base_audio';
    let overlayIndex = 0;

    preparedClips.forEach((clip, i) => {
      const startTime = clip.startTime;
      const duration = clip.duration;
      
      // Video overlay (only if clip has video)
      if (clip.hasVideo) {
        const videoOverlay = `[${currentVideoTrack}][v${i}]overlay=x=0:y=0:enable='between(t,${startTime},${startTime + duration})'[overlay_v${overlayIndex}]`;
        filters.push(videoOverlay);
        currentVideoTrack = `overlay_v${overlayIndex}`;
      }
      
      // Audio mix (only if clip has audio)
      if (clip.hasAudio) {
        const audioMix = `[${currentAudioTrack}][a${i}]amix=inputs=2:duration=longest:weights=1 1[overlay_a${overlayIndex}]`;
        filters.push(audioMix);
        currentAudioTrack = `overlay_a${overlayIndex}`;
      }
      
      overlayIndex++;
    });

    // Final output mapping with subtitle overlay if needed
    let finalVideoFilter = `[${currentVideoTrack}]format=yuv420p`;
    if (tempSubtitleFiles.length > 0 && tempSubtitleFiles[0]) {
      const subtitlePath = tempSubtitleFiles[0];
      // FFmpeg subtitles filter - path needs to be in single quotes
      let escapedPath = subtitlePath.replace(/\\/g, '/');
      escapedPath = escapedPath.replace(/'/g, "'\\''"); // Escape single quotes: ' -> '\''
      // Wrap in single quotes for FFmpeg filter
      finalVideoFilter += `[formatted]; [formatted]subtitles='${escapedPath}'[outv]`;
    } else {
      finalVideoFilter += `[outv]`;
    }
    filters.push(finalVideoFilter);
    // Audio track is already properly formatted from the mixing chain

    const filterComplex = filters.join('; ');

    args.push('-filter_complex', filterComplex);
    args.push('-map', '[outv]');
    args.push('-map', `[${currentAudioTrack}]`);

    // Add encoding options
    args.push('-c:v', codec);
    args.push('-preset', 'medium');
    args.push('-crf', this.getQualityCRF(quality));
    
    if (typeof resolution === 'string' && resolution !== 'source') {
      args.push('-s', resolution);
    }
    
    args.push('-c:a', audioCodec || 'aac', '-b:a', '128k');

    if (container === 'mp4') {
      args.push('-movflags', '+faststart');
    }

    args.push(outputPath);

    return args;
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
