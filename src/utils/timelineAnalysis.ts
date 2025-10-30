import { TimelineState, TimelineClip, TimelineTrack } from '../types/timeline';

export interface TimelineGap {
  startTime: number;
  endTime: number;
  duration: number;
  trackId: number;
  trackType: 'video' | 'audio' | 'overlay';
}

export interface TimelineSegment {
  startTime: number;
  endTime: number;
  duration: number;
  clips: Array<{
    trackId: number;
    trackType: 'video' | 'audio' | 'overlay';
    clip: TimelineClip;
  }>;
}

export interface TimelineAnalysis {
  totalDuration: number;
  gaps: TimelineGap[];
  segments: TimelineSegment[];
  hasOverlappingClips: boolean;
  maxConcurrentTracks: number;
}

/**
 * Analyzes the timeline to detect gaps, overlapping clips, and calculate total duration
 */
export function analyzeTimeline(timeline: TimelineState): TimelineAnalysis {
  const gaps: TimelineGap[] = [];
  const segments: TimelineSegment[] = [];
  let totalDuration = 0;
  let hasOverlappingClips = false;
  let maxConcurrentTracks = 0;

  // Get all clips from all tracks with their track information
  const allClips: Array<{
    trackId: number;
    trackType: 'video' | 'audio' | 'overlay';
    clip: TimelineClip;
  }> = [];

  timeline.tracks.forEach(track => {
    track.clips.forEach(clip => {
      allClips.push({
        trackId: track.id,
        trackType: track.type as 'video' | 'audio' | 'overlay',
        clip
      });
    });
  });

  // Calculate total duration
  allClips.forEach(({ clip }) => {
    const clipEndTime = clip.startTime + clip.duration;
    totalDuration = Math.max(totalDuration, clipEndTime);
  });

  // Find gaps and segments for each track
  timeline.tracks.forEach(track => {
    const trackClips = track.clips
      .filter(clip => clip.duration > 0)
      .sort((a, b) => a.startTime - b.startTime);

    // Find gaps in this track
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
            trackType: track.type as 'video' | 'audio' | 'overlay'
          });
        }
      }
    }

    // Check for overlapping clips in this track
    for (let i = 0; i < trackClips.length - 1; i++) {
      const currentClip = trackClips[i];
      const nextClip = trackClips[i + 1];
      const currentEndTime = currentClip.startTime + currentClip.duration;

      if (currentEndTime > nextClip.startTime) {
        hasOverlappingClips = true;
      }
    }
  });

  // Create segments (time ranges with clips)
  const timePoints = new Set<number>();
  allClips.forEach(({ clip }) => {
    timePoints.add(clip.startTime);
    timePoints.add(clip.startTime + clip.duration);
  });

  const sortedTimePoints = Array.from(timePoints).sort((a, b) => a - b);

  for (let i = 0; i < sortedTimePoints.length - 1; i++) {
    const segmentStart = sortedTimePoints[i];
    const segmentEnd = sortedTimePoints[i + 1];
    const segmentDuration = segmentEnd - segmentStart;

    if (segmentDuration > 0) {
      const segmentClips = allClips.filter(({ clip }) => {
        const clipEndTime = clip.startTime + clip.duration;
        return clip.startTime < segmentEnd && clipEndTime > segmentStart;
      });

      if (segmentClips.length > 0) {
        segments.push({
          startTime: segmentStart,
          endTime: segmentEnd,
          duration: segmentDuration,
          clips: segmentClips
        });

        maxConcurrentTracks = Math.max(maxConcurrentTracks, segmentClips.length);
      }
    }
  }

  return {
    totalDuration,
    gaps,
    segments,
    hasOverlappingClips,
    maxConcurrentTracks
  };
}

/**
 * Gets all clips that should be included in export, sorted by start time
 * Note: This function only returns clips with valid duration, not resolved file paths
 */
export function getExportClips(timeline: TimelineState): Array<{
  trackId: number;
  trackType: 'video' | 'audio' | 'overlay';
  clip: TimelineClip;
}> {
  const allClips: Array<{
    trackId: number;
    trackType: 'video' | 'audio' | 'overlay';
    clip: TimelineClip;
  }> = [];

  timeline.tracks.forEach(track => {
    track.clips.forEach(clip => {
      if (clip.duration > 0) {
        allClips.push({
          trackId: track.id,
          trackType: track.type as 'video' | 'audio' | 'overlay',
          clip
        });
      }
    });
  });

  return allClips.sort((a, b) => a.clip.startTime - b.clip.startTime);
}

/**
 * Calculates the total duration of the timeline including gaps
 */
export function calculateTimelineDuration(timeline: TimelineState): number {
  const analysis = analyzeTimeline(timeline);
  return analysis.totalDuration;
}

/**
 * Checks if the timeline has any gaps that need to be filled during export
 */
export function hasTimelineGaps(timeline: TimelineState): boolean {
  const analysis = analyzeTimeline(timeline);
  return analysis.gaps.length > 0;
}

/**
 * Gets gaps for a specific track
 */
export function getTrackGaps(timeline: TimelineState, trackId: number): TimelineGap[] {
  const analysis = analyzeTimeline(timeline);
  return analysis.gaps.filter(gap => gap.trackId === trackId);
}
