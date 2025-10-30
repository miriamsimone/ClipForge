import { TimelineState, TimelineClip } from '../types/timeline';
import { MediaClip } from '../types/media';

export interface TestScenario {
  name: string;
  description: string;
  setupTimeline: () => TimelineState;
  expectedBehavior: string;
  testSteps: string[];
}

/**
 * Test scenarios for multi-track export functionality
 */
export const multiTrackExportTestScenarios: TestScenario[] = [
  {
    name: 'Basic Multi-Track Export',
    description: 'Export timeline with clips on different tracks',
    setupTimeline: () => ({
      tracks: [
        {
          id: 1,
          name: 'Video 1',
          type: 'video',
          clips: [
            {
              id: 'clip1',
              mediaClipId: 'media1',
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
    }),
    expectedBehavior: 'Should export with video clips overlaid and audio mixed',
    testSteps: [
      'Create timeline with clips on different tracks',
      'Start export',
      'Verify FFmpeg command includes overlay filters',
      'Check that exported video shows both video clips',
      'Verify audio is properly mixed'
    ]
  },

  {
    name: 'Gap Handling Export',
    description: 'Export timeline with gaps between clips',
    setupTimeline: () => ({
      tracks: [
        {
          id: 1,
          name: 'Video 1',
          type: 'video',
          clips: [
            {
              id: 'clip1',
              mediaClipId: 'media1',
              startTime: 0,
              duration: 3,
              trimIn: 0,
              trimOut: 3,
              isSelected: false,
            },
            {
              id: 'clip2',
              mediaClipId: 'media2',
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
    }),
    expectedBehavior: 'Should fill gaps with black frames',
    testSteps: [
      'Create timeline with gaps between clips',
      'Start export',
      'Verify FFmpeg command includes color source for gaps',
      'Check that exported video has black frames in gaps',
      'Verify total duration includes gap time'
    ]
  },

  {
    name: 'Complex Multi-Track with Gaps',
    description: 'Export complex timeline with multiple tracks and gaps',
    setupTimeline: () => ({
      tracks: [
        {
          id: 1,
          name: 'Video 1',
          type: 'video',
          clips: [
            {
              id: 'clip1',
              mediaClipId: 'media1',
              startTime: 0,
              duration: 2,
              trimIn: 0,
              trimOut: 2,
              isSelected: false,
            },
            {
              id: 'clip2',
              mediaClipId: 'media2',
              startTime: 5, // Gap 2-5 seconds
              duration: 3,
              trimIn: 0,
              trimOut: 3,
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
              id: 'clip3',
              mediaClipId: 'media3',
              startTime: 1,
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
              id: 'clip4',
              mediaClipId: 'media4',
              startTime: 0,
              duration: 8,
              trimIn: 0,
              trimOut: 8,
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
    }),
    expectedBehavior: 'Should handle complex layering with gaps and overlays',
    testSteps: [
      'Create complex timeline with multiple tracks and gaps',
      'Start export',
      'Verify FFmpeg command handles all tracks and gaps',
      'Check that video layers are properly composed',
      'Verify gaps are filled with black frames',
      'Test audio mixing across all tracks'
    ]
  },

  {
    name: 'Empty Track Export',
    description: 'Export timeline with empty tracks',
    setupTimeline: () => ({
      tracks: [
        {
          id: 1,
          name: 'Video 1',
          type: 'video',
          clips: [
            {
              id: 'clip1',
              mediaClipId: 'media1',
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
          clips: [], // Empty track
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
    }),
    expectedBehavior: 'Should export successfully with empty tracks ignored',
    testSteps: [
      'Create timeline with some empty tracks',
      'Start export',
      'Verify export completes successfully',
      'Check that empty tracks are ignored in FFmpeg command'
    ]
  },

  {
    name: 'Overlapping Clips Export',
    description: 'Export timeline with overlapping clips on same track',
    setupTimeline: () => ({
      tracks: [
        {
          id: 1,
          name: 'Video 1',
          type: 'video',
          clips: [
            {
              id: 'clip1',
              mediaClipId: 'media1',
              startTime: 0,
              duration: 4,
              trimIn: 0,
              trimOut: 4,
              isSelected: false,
            },
            {
              id: 'clip2',
              mediaClipId: 'media2',
              startTime: 2, // Overlaps with clip1
              duration: 3,
              trimIn: 0,
              trimOut: 3,
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
    }),
    expectedBehavior: 'Should warn about overlapping clips and export with last clip taking precedence',
    testSteps: [
      'Create timeline with overlapping clips',
      'Start export',
      'Verify warning is shown about overlapping clips',
      'Check that export completes with overlapping clips handled',
      'Verify only the last clip is visible in overlap area'
    ]
  }
];

/**
 * Helper function to create mock media clips for testing
 */
export function createMockMediaClips(): MediaClip[] {
  return [
    {
      id: 'media1',
      filePath: '/path/to/video1.mp4',
      name: 'Video 1',
      duration: 10,
      hasAudio: true,
      hasVideo: true,
      width: 1920,
      height: 1080,
      framerate: 30,
      fileSize: 1024000,
      createdAt: Date.now(),
    },
    {
      id: 'media2',
      filePath: '/path/to/video2.mp4',
      name: 'Video 2',
      duration: 8,
      hasAudio: true,
      hasVideo: true,
      width: 1920,
      height: 1080,
      framerate: 30,
      fileSize: 1024000,
      createdAt: Date.now(),
    },
    {
      id: 'media3',
      filePath: '/path/to/video3.mp4',
      name: 'Video 3',
      duration: 6,
      hasAudio: true,
      hasVideo: true,
      width: 1920,
      height: 1080,
      framerate: 30,
      fileSize: 1024000,
      createdAt: Date.now(),
    },
    {
      id: 'media4',
      filePath: '/path/to/audio1.mp3',
      name: 'Audio 1',
      duration: 15,
      hasAudio: true,
      hasVideo: false,
      width: 0,
      height: 0,
      framerate: 0,
      fileSize: 512000,
      createdAt: Date.now(),
    }
  ];
}

/**
 * Run a test scenario
 */
export async function runTestScenario(scenario: TestScenario): Promise<{
  success: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Setup timeline
    const timeline = scenario.setupTimeline();
    
    // Validate timeline
    const { analyzeTimeline } = await import('./timelineAnalysis');
    const analysis = analyzeTimeline(timeline);
    
    // Check for expected behaviors
    if (scenario.name.includes('Gap') && analysis.gaps.length === 0) {
      errors.push('Expected gaps but none found');
    }
    
    if (scenario.name.includes('Overlapping') && !analysis.hasOverlappingClips) {
      errors.push('Expected overlapping clips but none found');
    }
    
    if (analysis.gaps.length > 0) {
      warnings.push(`Found ${analysis.gaps.length} gaps in timeline`);
    }
    
    if (analysis.hasOverlappingClips) {
      warnings.push('Timeline contains overlapping clips');
    }
    
    return {
      success: errors.length === 0,
      errors,
      warnings
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Test failed: ${error instanceof Error ? error.message : String(error)}`],
      warnings
    };
  }
}
