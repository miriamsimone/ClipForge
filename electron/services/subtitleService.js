const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const FormData = require('form-data');
const FFmpegService = require('./ffmpegService');

class SubtitleService {
  constructor() {
    this.ffmpegService = new FFmpegService();
    this.apiKey = process.env.OPENAI_API_KEY;
    
    if (!this.apiKey) {
      console.warn('OPENAI_API_KEY environment variable not set. Subtitle generation will fail.');
    }
  }

  /**
   * Generate subtitles for a video using OpenAI Whisper API
   * @param {string} videoPath - Path to the video file
   * @returns {Promise<string>} SRT format subtitle content
   */
  async generateSubtitles(videoPath) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.');
    }

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    let tempAudioPath = null;

    try {
      // Step 1: Extract audio from video
      console.log('Extracting audio from video...');
      const audioDir = os.tmpdir();
      const videoBase = path.basename(videoPath, path.extname(videoPath));
      tempAudioPath = path.join(audioDir, `subtitle_audio_${videoBase}_${Date.now()}.m4a`);

      await this.ffmpegService.extractAudio(videoPath, tempAudioPath, 'm4a');
      
      if (!fs.existsSync(tempAudioPath)) {
        throw new Error('Failed to extract audio from video');
      }

      // Step 2: Call OpenAI Whisper API
      console.log('Sending audio to OpenAI Whisper API...');
      const transcription = await this.callWhisperAPI(tempAudioPath);

      // Step 3: Convert to SRT format
      console.log('Converting transcription to SRT format...');
      const srtContent = this.convertToSRT(transcription);

      return srtContent;
    } catch (error) {
      console.error('Subtitle generation error:', error);
      throw new Error(`Failed to generate subtitles: ${error.message}`);
    } finally {
      // Clean up temporary audio file
      if (tempAudioPath && fs.existsSync(tempAudioPath)) {
        try {
          fs.unlinkSync(tempAudioPath);
        } catch (cleanupError) {
          console.warn('Failed to cleanup temp audio file:', cleanupError);
        }
      }
    }
  }

  /**
   * Call OpenAI Whisper API with audio file
   * @param {string} audioPath - Path to audio file
   * @returns {Promise<Object>} Transcription response from API
   */
  async callWhisperAPI(audioPath) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', fs.createReadStream(audioPath), {
        filename: path.basename(audioPath),
        contentType: 'audio/m4a'
      });
      form.append('model', 'whisper-1');
      form.append('response_format', 'verbose_json');

      const options = {
        hostname: 'api.openai.com',
        path: '/v1/audio/transcriptions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          ...form.getHeaders()
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const result = JSON.parse(data);
              resolve(result);
            } catch (error) {
              reject(new Error(`Failed to parse API response: ${error.message}`));
            }
          } else {
            let errorMessage = `API request failed with status ${res.statusCode}`;
            try {
              const errorJson = JSON.parse(data);
              errorMessage = errorJson.error?.message || errorMessage;
            } catch (e) {
              errorMessage = data || errorMessage;
            }
            reject(new Error(errorMessage));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      form.pipe(req);
    });
  }

  /**
   * Convert OpenAI Whisper API response to SRT format
   * @param {Object} transcription - Response from Whisper API with verbose_json format
   * @returns {string} SRT formatted subtitle content
   */
  convertToSRT(transcription) {
    if (!transcription.words || !Array.isArray(transcription.words)) {
      // Fallback: if no word-level timestamps, use segment-level
      if (transcription.segments && Array.isArray(transcription.segments)) {
        return this.convertSegmentsToSRT(transcription.segments);
      }
      // Last resort: single segment with full text
      const start = 0;
      const end = transcription.duration || 0;
      return `1\n${this.formatSRTTime(start)} --> ${this.formatSRTTime(end)}\n${transcription.text || ''}\n\n`;
    }

    // Group words into subtitle lines (approximately 3-4 words per line, ~3 seconds max)
    const lines = [];
    let currentLine = {
      words: [],
      startTime: null,
      endTime: null,
      text: ''
    };

    const maxWordsPerLine = 4;
    const maxDuration = 3.0; // seconds

    for (const word of transcription.words) {
      const wordStart = word.start;
      const wordEnd = word.end;

      // Start a new line if current line is full or too long
      if (currentLine.words.length >= maxWordsPerLine ||
          (currentLine.startTime !== null && (wordStart - currentLine.startTime) > maxDuration)) {
        if (currentLine.words.length > 0) {
          lines.push({
            startTime: currentLine.startTime,
            endTime: currentLine.endTime,
            text: currentLine.text.trim()
          });
        }
        currentLine = {
          words: [],
          startTime: wordStart,
          endTime: wordEnd,
          text: ''
        };
      }

      // Add word to current line
      if (currentLine.words.length === 0) {
        currentLine.startTime = wordStart;
      }
      currentLine.words.push(word);
      currentLine.endTime = wordEnd;
      currentLine.text += (currentLine.text ? ' ' : '') + word.word;
    }

    // Add the last line
    if (currentLine.words.length > 0) {
      lines.push({
        startTime: currentLine.startTime,
        endTime: currentLine.endTime,
        text: currentLine.text.trim()
      });
    }

    // Convert to SRT format
    let srtContent = '';
    lines.forEach((line, index) => {
      srtContent += `${index + 1}\n`;
      srtContent += `${this.formatSRTTime(line.startTime)} --> ${this.formatSRTTime(line.endTime)}\n`;
      srtContent += `${line.text}\n\n`;
    });

    return srtContent;
  }

  /**
   * Convert segments to SRT (fallback method)
   */
  convertSegmentsToSRT(segments) {
    let srtContent = '';
    segments.forEach((segment, index) => {
      srtContent += `${index + 1}\n`;
      srtContent += `${this.formatSRTTime(segment.start)} --> ${this.formatSRTTime(segment.end)}\n`;
      srtContent += `${segment.text.trim()}\n\n`;
    });
    return srtContent;
  }

  /**
   * Format time in seconds to SRT time format (HH:MM:SS,mmm)
   * @param {number} seconds - Time in seconds
   * @returns {string} Formatted time string
   */
  formatSRTTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  }
}

module.exports = SubtitleService;

