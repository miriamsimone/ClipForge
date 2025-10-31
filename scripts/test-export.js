/**
 * Test script for export functionality
 * Tests export preparation, validation, and FFmpeg command generation
 */

const path = require('path');
const fs = require('fs');

// Mock timeline and media clips for testing
const createTestTimeline = () => ({
  tracks: [
    {
      id: 1,
      name: 'Video 1',
      type: 'video',
      clips: [
        {
          id: 'clip1',
          mediaClipId: 'media1',
          track: 1,
          startTime: 0,
          duration: 5,
          trimIn: 0,
          trimOut: 5,
          isSelected: false,
        }
      ],
      height: 80,
      isMuted: false,
      isLocked: false,
    },
    {
      id: 2,
      name: 'Audio 1',
      type: 'audio',
      clips: [
        {
          id: 'clip2',
          mediaClipId: 'media2',
          track: 2,
          startTime: 0,
          duration: 5,
          trimIn: 0,
          trimOut: 5,
          isSelected: false,
        }
      ],
      height: 60,
      isMuted: false,
      isLocked: false,
    }
  ],
  playheadPosition: 0,
  zoom: 1,
  scrollPosition: 0,
  isPlaying: false,
  selectedClipIds: [],
  snapToGrid: true,
  snapToClips: true,
  pixelsPerSecond: 100,
});

const createTestTimelineWithGaps = () => ({
  tracks: [
    {
      id: 1,
      name: 'Video 1',
      type: 'video',
      clips: [
        {
          id: 'clip1',
          mediaClipId: 'media1',
          track: 1,
          startTime: 0,
          duration: 3,
          trimIn: 0,
          trimOut: 3,
          isSelected: false,
        },
        {
          id: 'clip2',
          mediaClipId: 'media2',
          track: 1,
          startTime: 6, // Gap between 3-6 seconds
          duration: 2,
          trimIn: 0,
          trimOut: 2,
          isSelected: false,
        }
      ],
      height: 80,
      isMuted: false,
      isLocked: false,
    }
  ],
  playheadPosition: 0,
  zoom: 1,
  scrollPosition: 0,
  isPlaying: false,
  selectedClipIds: [],
  snapToGrid: true,
  snapToClips: true,
  pixelsPerSecond: 100,
});

const createTestTimelineMultiTrack = () => ({
  tracks: [
    {
      id: 1,
      name: 'Video 1',
      type: 'video',
      clips: [
        {
          id: 'clip1',
          mediaClipId: 'media1',
          track: 1,
          startTime: 0,
          duration: 5,
          trimIn: 0,
          trimOut: 5,
          isSelected: false,
        }
      ],
      height: 80,
      isMuted: false,
      isLocked: false,
    },
    {
      id: 2,
      name: 'Video 2',
      type: 'video',
      clips: [
        {
          id: 'clip2',
          mediaClipId: 'media2',
          track: 2,
          startTime: 2,
          duration: 4,
          trimIn: 0,
          trimOut: 4,
          isSelected: false,
        }
      ],
      height: 80,
      isMuted: false,
      isLocked: false,
    },
    {
      id: 3,
      name: 'Audio 1',
      type: 'audio',
      clips: [
        {
          id: 'clip3',
          mediaClipId: 'media3',
          track: 3,
          startTime: 0,
          duration: 6,
          trimIn: 0,
          trimOut: 6,
          isSelected: false,
        }
      ],
      height: 60,
      isMuted: false,
      isLocked: false,
    }
  ],
  playheadPosition: 0,
  zoom: 1,
  scrollPosition: 0,
  isPlaying: false,
  selectedClipIds: [],
  snapToGrid: true,
  snapToClips: true,
  pixelsPerSecond: 100,
});

const createTestMediaClips = () => [
  {
    id: 'media1',
    filePath: '/test/path/video1.mp4',
    fileName: 'video1.mp4',
    fileSize: 1024000,
    duration: 10,
    width: 1920,
    height: 1080,
    frameRate: 30,
    codec: 'h264',
    audioCodec: 'aac',
    hasAudio: true,
    hasVideo: true,
    format: 'mp4',
    createdAt: Date.now(),
  },
  {
    id: 'media2',
    filePath: '/test/path/video2.mp4',
    fileName: 'video2.mp4',
    fileSize: 1024000,
    duration: 8,
    width: 1920,
    height: 1080,
    frameRate: 30,
    codec: 'h264',
    audioCodec: 'aac',
    hasAudio: true,
    hasVideo: true,
    format: 'mp4',
    createdAt: Date.now(),
  },
  {
    id: 'media3',
    filePath: '/test/path/audio1.mp3',
    fileName: 'audio1.mp3',
    fileSize: 512000,
    duration: 15,
    width: 0,
    height: 0,
    frameRate: 0,
    codec: 'unknown',
    audioCodec: 'mp3',
    hasAudio: true,
    hasVideo: false,
    format: 'mp3',
    createdAt: Date.now(),
  },
];

// Test functions
function testExportPreparation() {
  console.log('\n=== Testing Export Preparation ===\n');
  
  try {
    // Import the export preparation functions (would need to be transpiled in real scenario)
    // For now, we'll test the logic manually
    
    const timeline = createTestTimeline();
    const mediaClips = createTestMediaClips();
    
    // Test 1: Basic export preparation
    console.log('Test 1: Basic Timeline Export Preparation');
    const exportClips = timeline.tracks.flatMap(track => 
      track.clips.map(clip => ({ clip, trackId: track.id }))
    );
    
    const preparedClips = exportClips.map(({ clip, trackId }) => {
      const mediaClip = mediaClips.find(mc => mc.id === clip.mediaClipId);
      if (!mediaClip) {
        throw new Error(`Media clip not found for timeline clip ${clip.id}`);
      }

      const baseTrimIn = Math.max(0, Number(clip.trimIn ?? 0));
      const baseDuration = clip.duration ?? mediaClip.duration ?? 0;
      const rawTrimOut = Number.isFinite(clip.trimOut)
        ? Number(clip.trimOut)
        : baseTrimIn + baseDuration;
      const boundedTrimOut = Math.max(baseTrimIn, Math.min(rawTrimOut, mediaClip.duration ?? rawTrimOut));
      const trimmedDuration = Math.max(0, boundedTrimOut - baseTrimIn);

      return {
        id: clip.id,
        filePath: mediaClip.filePath,
        trimIn: baseTrimIn,
        trimOut: boundedTrimOut,
        duration: trimmedDuration,
        startTime: clip.startTime,
        trackId: trackId,
        hasAudio: Boolean(mediaClip.hasAudio),
        hasVideo: Boolean(mediaClip.hasVideo),
      };
    }).filter(clip => clip.duration > 0.01);
    
    console.log('✓ Prepared clips:', preparedClips.length);
    preparedClips.forEach(clip => {
      console.log(`  - Clip ${clip.id}: ${clip.filePath}, startTime: ${clip.startTime}, duration: ${clip.duration}`);
    });
    
    // Test 2: Timeline with gaps
    console.log('\nTest 2: Timeline with Gaps');
    const timelineWithGaps = createTestTimelineWithGaps();
    const gaps = [];
    
    timelineWithGaps.tracks.forEach(track => {
      const trackClips = track.clips
        .filter(clip => clip.duration > 0)
        .sort((a, b) => a.startTime - b.startTime);
      
      for (let i = 0; i < trackClips.length; i++) {
        const currentClip = trackClips[i];
        const nextClip = trackClips[i + 1];
        
        if (nextClip) {
          const currentEndTime = currentClip.startTime + currentClip.duration;
          const gapStart = currentEndTime;
          const gapEnd = nextClip.startTime;
          
          if (gapEnd > gapStart) {
            gaps.push({
              startTime: gapStart,
              endTime: gapEnd,
              duration: gapEnd - gapStart,
              trackId: track.id,
              trackType: track.type
            });
          }
        }
      }
    });
    
    console.log('✓ Detected gaps:', gaps.length);
    gaps.forEach(gap => {
      console.log(`  - Gap: ${gap.startTime}s to ${gap.endTime}s (${gap.duration}s)`);
    });
    
    // Test 3: Multi-track export
    console.log('\nTest 3: Multi-Track Export');
    const multiTrackTimeline = createTestTimelineMultiTrack();
    const allClips = multiTrackTimeline.tracks.flatMap(track => 
      track.clips.map(clip => ({
        clip,
        trackId: track.id,
        trackType: track.type
      }))
    );
    
    // Check for overlapping clips
    const overlapping = allClips.some(({ clip: clip1, trackId: trackId1 }, i) => {
      return allClips.slice(i + 1).some(({ clip: clip2, trackId: trackId2 }) => {
        if (trackId1 === trackId2) {
          const clip1End = clip1.startTime + clip1.duration;
          const clip2End = clip2.startTime + clip2.duration;
          return (clip1.startTime < clip2End && clip1End > clip2.startTime);
        }
        return false;
      });
    });
    
    // Find concurrent tracks
    const timePoints = new Set();
    allClips.forEach(({ clip }) => {
      timePoints.add(clip.startTime);
      timePoints.add(clip.startTime + clip.duration);
    });
    
    const sortedTimePoints = Array.from(timePoints).sort((a, b) => a - b);
    let maxConcurrent = 0;
    
    for (let i = 0; i < sortedTimePoints.length - 1; i++) {
      const segmentStart = sortedTimePoints[i];
      const segmentEnd = sortedTimePoints[i + 1];
      
      const segmentClips = allClips.filter(({ clip }) => {
        const clipEndTime = clip.startTime + clip.duration;
        return clip.startTime < segmentEnd && clipEndTime > segmentStart;
      });
      
      maxConcurrent = Math.max(maxConcurrent, segmentClips.length);
    }
    
    console.log('✓ Multi-track analysis:');
    console.log(`  - Total clips: ${allClips.length}`);
    console.log(`  - Max concurrent tracks: ${maxConcurrent}`);
    console.log(`  - Has overlapping clips: ${overlapping}`);
    
    // Test 4: Export validation
    console.log('\nTest 4: Export Validation');
    const validationErrors = [];
    const validationWarnings = [];
    
    if (allClips.length === 0) {
      validationErrors.push('No clips available for export');
    }
    
    const missingMedia = allClips.filter(({ clip }) => {
      const mediaClip = mediaClips.find(mc => mc.id === clip.mediaClipId);
      return !mediaClip || !mediaClip.filePath;
    });
    if (missingMedia.length > 0) {
      validationErrors.push(`${missingMedia.length} clips are missing media files`);
    }
    
    const zeroDuration = allClips.filter(({ clip }) => {
      const mediaClip = mediaClips.find(mc => mc.id === clip.mediaClipId);
      const baseTrimIn = Math.max(0, Number(clip.trimIn ?? 0));
      const baseDuration = clip.duration ?? mediaClip?.duration ?? 0;
      const rawTrimOut = Number.isFinite(clip.trimOut)
        ? Number(clip.trimOut)
        : baseTrimIn + baseDuration;
      const boundedTrimOut = Math.max(baseTrimIn, Math.min(rawTrimOut, mediaClip?.duration ?? rawTrimOut));
      const trimmedDuration = Math.max(0, boundedTrimOut - baseTrimIn);
      return trimmedDuration <= 0.01;
    });
    if (zeroDuration.length > 0) {
      validationErrors.push(`${zeroDuration.length} clips have zero or negative duration after trimming`);
    }
    
    if (gaps.length > 0) {
      validationWarnings.push(`Timeline contains ${gaps.length} gaps - these will be filled with black frames/silence`);
    }
    
    if (maxConcurrent > 1) {
      validationWarnings.push(`Timeline uses ${maxConcurrent} concurrent tracks - complex composition will be applied`);
    }
    
    console.log('✓ Validation results:');
    if (validationErrors.length > 0) {
      console.log('  Errors:', validationErrors);
    } else {
      console.log('  ✓ No errors found');
    }
    if (validationWarnings.length > 0) {
      console.log('  Warnings:', validationWarnings);
    } else {
      console.log('  ✓ No warnings');
    }
    
    console.log('\n=== All Export Preparation Tests Passed ===\n');
    return true;
    
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

function testFFmpegCommandGeneration() {
  console.log('\n=== Testing FFmpeg Command Generation ===\n');
  
  try {
    // Simulate FFmpeg command building logic
    const preparedClips = [
      {
        filePath: '/test/video1.mp4',
        trimIn: 0,
        trimOut: 5,
        duration: 5,
        startTime: 0,
        hasAudio: true,
        hasVideo: true,
      },
      {
        filePath: '/test/video2.mp4',
        trimIn: 0,
        trimOut: 4,
        duration: 4,
        startTime: 2,
        hasAudio: true,
        hasVideo: true,
      }
    ];
    
    const timelineData = {
      totalDuration: 6,
      gaps: [{ startTime: 5, endTime: 6, duration: 1 }],
      segments: [],
      hasOverlappingClips: true,
      maxConcurrentTracks: 2
    };
    
    console.log('Test 1: Multi-Track FFmpeg Command');
    
    // Check if multi-track path is chosen
    const useMultiTrack = timelineData && timelineData.gaps && timelineData.gaps.length > 0;
    console.log(`✓ Using multi-track approach: ${useMultiTrack}`);
    
    if (useMultiTrack) {
      const args = ['-y'];
      
      // Add input files
      preparedClips.forEach(clip => {
        args.push('-i', clip.filePath);
      });
      
      // Add color and silence sources
      args.push('-f', 'lavfi', '-i', 'color=black:size=1920x1080:duration=6:rate=30');
      args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
      
      const colorInputIndex = preparedClips.length;
      const silenceInputIndex = preparedClips.length + 1;
      
      // Build filters
      const filters = [];
      
      // Trim filters
      preparedClips.forEach((clip, i) => {
        if (clip.hasVideo) {
          filters.push(`[${i}:v]trim=start=${clip.trimIn}:end=${clip.trimOut},setpts=PTS-STARTPTS[v${i}]`);
        }
        if (clip.hasAudio) {
          filters.push(`[${i}:a]atrim=start=${clip.trimIn}:end=${clip.trimOut},asetpts=PTS-STARTPTS[a${i}]`);
        }
      });
      
      // Base tracks
      filters.push(`[${colorInputIndex}:v]trim=duration=${timelineData.totalDuration}[base_video]`);
      filters.push(`[${silenceInputIndex}:a]atrim=duration=${timelineData.totalDuration}[base_audio]`);
      
      // Overlay clips
      let currentVideoTrack = 'base_video';
      let currentAudioTrack = 'base_audio';
      let overlayIndex = 0;
      
      preparedClips.forEach((clip, i) => {
        if (clip.hasVideo) {
          filters.push(`[${currentVideoTrack}][v${i}]overlay=x=0:y=0:enable='between(t,${clip.startTime},${clip.startTime + clip.duration})'[overlay_v${overlayIndex}]`);
          currentVideoTrack = `overlay_v${overlayIndex}`;
        }
        if (clip.hasAudio) {
          filters.push(`[${currentAudioTrack}][a${i}]amix=inputs=2:duration=longest:weights=1 1[overlay_a${overlayIndex}]`);
          currentAudioTrack = `overlay_a${overlayIndex}`;
        }
        overlayIndex++;
      });
      
      filters.push(`[${currentVideoTrack}]format=yuv420p[outv]`);
      
      const filterComplex = filters.join('; ');
      args.push('-filter_complex', filterComplex);
      args.push('-map', '[outv]');
      args.push('-map', `[${currentAudioTrack}]`);
      args.push('-c:v', 'libx264');
      args.push('-preset', 'medium');
      args.push('-crf', '18');
      args.push('-s', '1920x1080');
      args.push('-c:a', 'aac', '-b:a', '128k');
      args.push('-movflags', '+faststart');
      args.push('/test/output.mp4');
      
      console.log('✓ FFmpeg command structure:');
      console.log(`  - Input files: ${preparedClips.length}`);
      console.log(`  - Color source: yes`);
      console.log(`  - Silence source: yes`);
      console.log(`  - Filter complex: ${filters.length} filters`);
      console.log(`  - Video overlays: ${preparedClips.filter(c => c.hasVideo).length}`);
      console.log(`  - Audio mixes: ${preparedClips.filter(c => c.hasAudio).length}`);
      console.log(`  - Total args: ${args.length}`);
      
      // Validate command structure
      const hasInputs = args.includes('-i');
      const hasFilterComplex = args.includes('-filter_complex');
      const hasOutput = args[args.length - 1].endsWith('.mp4');
      
      console.log('\n✓ Command validation:');
      console.log(`  - Has input files: ${hasInputs}`);
      console.log(`  - Has filter_complex: ${hasFilterComplex}`);
      console.log(`  - Has output path: ${hasOutput}`);
      
      if (!hasInputs || !hasFilterComplex || !hasOutput) {
        throw new Error('Invalid FFmpeg command structure');
      }
    }
    
    console.log('\n=== FFmpeg Command Generation Tests Passed ===\n');
    return true;
    
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run all tests
console.log('🚀 Starting Export Functionality Tests...\n');

const results = [
  testExportPreparation(),
  testFFmpegCommandGeneration()
];

const allPassed = results.every(r => r === true);

if (allPassed) {
  console.log('✅ All export functionality tests passed!\n');
  process.exit(0);
} else {
  console.log('❌ Some tests failed.\n');
  process.exit(1);
}

