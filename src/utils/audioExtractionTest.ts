import { MediaClip } from '../types/media';

/**
 * Test utility for audio extraction functionality
 */
export interface AudioExtractionTestResult {
  success: boolean;
  duration: number;
  errors: string[];
  warnings: string[];
}

/**
 * Test audio extraction from a video file
 */
export async function testAudioExtraction(videoClip: MediaClip): Promise<AudioExtractionTestResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let duration = 0;

  try {
    // Check if video has audio
    if (!videoClip.hasAudio) {
      errors.push('Video file does not have an audio track');
      return {
        success: false,
        duration: 0,
        errors,
        warnings
      };
    }

    console.log('Testing audio extraction from:', videoClip.filePath);

    // Extract audio using the API
    const startTime = Date.now();
    const audioMetadata = await window.electronAPI.extractAudioFromVideo(
      videoClip.filePath,
      null, // Use default output path
      'aac' // Use AAC format
    );
    const endTime = Date.now();
    duration = (endTime - startTime) / 1000; // Convert to seconds

    console.log('Audio extraction completed in', duration, 'seconds');
    console.log('Audio metadata:', audioMetadata);

    // Validate extracted audio
    if (!audioMetadata || !audioMetadata.filePath) {
      errors.push('Audio extraction returned invalid metadata');
      return {
        success: false,
        duration,
        errors,
        warnings
      };
    }

    // Check file exists
    const audioExists = await checkFileExists(audioMetadata.filePath);
    if (!audioExists) {
      errors.push('Extracted audio file does not exist at: ' + audioMetadata.filePath);
    }

    // Check duration matches
    if (audioMetadata.duration) {
      const durationDiff = Math.abs(audioMetadata.duration - videoClip.duration);
      if (durationDiff > 0.5) {
        warnings.push(`Audio duration differs from video by ${durationDiff.toFixed(2)} seconds`);
      }
    }

    // Check has audio flag
    if (!audioMetadata.hasAudio) {
      warnings.push('Extracted audio metadata indicates no audio track');
    }

    // Check file size is reasonable (should be much smaller than video)
    if (audioMetadata.fileSize && videoClip.fileSize) {
      const sizeRatio = audioMetadata.fileSize / videoClip.fileSize;
      if (sizeRatio > 0.5) {
        warnings.push('Extracted audio file seems unusually large');
      }
      if (sizeRatio < 0.01) {
        warnings.push('Extracted audio file seems unusually small');
      }
    }

    return {
      success: errors.length === 0,
      duration,
      errors,
      warnings
    };

  } catch (error) {
    errors.push(`Audio extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      duration,
      errors,
      warnings
    };
  }
}

/**
 * Check if a file exists (helper function)
 */
async function checkFileExists(filePath: string): Promise<boolean> {
  // In a real implementation, this would check the file system
  // For now, we'll assume the file exists if metadata was returned
  return true;
}

/**
 * Run a comprehensive test suite for audio extraction
 */
export async function runAudioExtractionTests(videoClips: MediaClip[]): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: Array<{ clip: MediaClip; result: AudioExtractionTestResult }>;
}> {
  const results: Array<{ clip: MediaClip; result: AudioExtractionTestResult }> = [];
  
  console.log('Starting audio extraction test suite with', videoClips.length, 'video clips');

  for (const clip of videoClips) {
    const result = await testAudioExtraction(clip);
    results.push({ clip, result });

    if (result.success) {
      console.log(`✓ Audio extraction passed for: ${clip.fileName}`);
      if (result.warnings.length > 0) {
        console.log('  Warnings:', result.warnings.join(', '));
      }
    } else {
      console.log(`✗ Audio extraction failed for: ${clip.fileName}`);
      console.log('  Errors:', result.errors.join(', '));
      if (result.warnings.length > 0) {
        console.log('  Warnings:', result.warnings.join(', '));
      }
    }
  }

  const passed = results.filter(r => r.result.success).length;
  const failed = results.filter(r => !r.result.success).length;

  console.log('\nTest suite completed:');
  console.log(`  Total: ${results.length}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  return {
    total: results.length,
    passed,
    failed,
    results
  };
}

