/**
 * Utility functions for video format conversion using FFmpeg
 */

export interface ConversionOptions {
  inputFormat?: string;
  outputFormat?: string;
  quality?: 'low' | 'medium' | 'high' | 'maximum';
  onProgress?: (progress: number) => void;
}

export class VideoConverter {
  /**
   * Convert a WebM blob to MP4 using FFmpeg
   */
  static async convertWebMToMP4(
    webmBlob: Blob, 
    options: ConversionOptions = {}
  ): Promise<Blob> {
    console.log('Starting WebM to MP4 conversion...');
    console.log('Input blob size:', webmBlob.size);
    console.log('Input blob type:', webmBlob.type);

    try {
      // Convert blob to ArrayBuffer
      const arrayBuffer = await webmBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Create a temporary file name
      const timestamp = Date.now();
      const inputFileName = `temp_input_${timestamp}.webm`;
      const outputFileName = `temp_output_${timestamp}.mp4`;

      // Validate WebM header
      const header = uint8Array.slice(0, 4);
      const headerHex = Array.from(header).map(b => b.toString(16).padStart(2, '0')).join('');
      console.log('WebM file header:', headerHex);

      // WebM files should start with EBML header: 1A 45 DF A3
      if (header[0] !== 0x1A || header[1] !== 0x45 || header[2] !== 0xDF || header[3] !== 0xA3) {
        console.warn('Warning: File may not be a valid WebM file. Expected 1A45DFA3, got:', headerHex);
      }

      // Prepare FFmpeg arguments with better error handling
      const ffmpegArgs = [
        '-loglevel', 'verbose',  // Get detailed error messages
        '-i', inputFileName,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', this.getQualityCRF(options.quality || 'high'),
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',  // Ensure compatibility
        '-y', // Overwrite output file
        outputFileName
      ];

      console.log('FFmpeg args:', ffmpegArgs.join(' '));

      // Call FFmpeg service
      const result = await window.electronAPI.executeFFmpeg(ffmpegArgs, {
        inputData: uint8Array,
        inputFileName,
        outputFileName
      });

      console.log('FFmpeg conversion result:', result);

      if (result.success && result.outputData) {
        // Convert output data back to blob
        // outputData comes as an array of numbers from IPC, convert to Uint8Array first
        const uint8Output = new Uint8Array(result.outputData);
        const mp4Blob = new Blob([uint8Output], { type: 'video/mp4' });

        console.log('Conversion successful:');
        console.log('  - Output data length:', result.outputData.length);
        console.log('  - MP4 blob size:', mp4Blob.size);

        // Validate MP4 header (should start with ftyp)
        const mp4Header = uint8Output.slice(4, 8);
        const mp4HeaderStr = String.fromCharCode(...mp4Header);
        console.log('  - MP4 header:', mp4HeaderStr, '(should contain "ftyp")');

        return mp4Blob;
      } else {
        // Log detailed error information
        console.error('FFmpeg conversion failed:');
        console.error('  - Exit code:', result.code);
        console.error('  - stderr:', result.stderr);
        console.error('  - stdout:', result.stdout);
        throw new Error(`FFmpeg conversion failed: ${result.stderr || result.error || 'Unknown error'}`);
      }

    } catch (error) {
      console.error('Video conversion error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to convert video: ${errorMessage}`);
    }
  }

  /**
   * Get CRF value based on quality setting
   */
  private static getQualityCRF(quality: string): string {
    switch (quality) {
      case 'low':
        return '28'; // Lower quality, smaller file
      case 'medium':
        return '23'; // Balanced quality
      case 'high':
        return '18'; // High quality
      case 'maximum':
        return '15'; // Maximum quality
      default:
        return '18';
    }
  }

  /**
   * Get video duration from blob using FFmpeg
   */
  static async getVideoDuration(blob: Blob): Promise<number> {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const timestamp = Date.now();
      const inputFileName = `temp_duration_${timestamp}.${blob.type.includes('webm') ? 'webm' : 'mp4'}`;

      // Use FFprobe to get duration
      const ffprobeArgs = [
        '-v', 'quiet',
        '-show_entries', 'format=duration',
        '-of', 'csv=p=0',
        inputFileName
      ];

      const result = await window.electronAPI.executeFFmpeg(ffprobeArgs, {
        inputData: uint8Array,
        inputFileName
      });

      if (result.success && result.stdout) {
        const duration = parseFloat(result.stdout.trim());
        console.log('Video duration detected:', duration, 'seconds');
        return duration;
      } else {
        console.warn('Could not detect video duration, using fallback');
        return 0; // Fallback duration
      }

    } catch (error) {
      console.error('Error getting video duration:', error);
      return 0;
    }
  }
}
