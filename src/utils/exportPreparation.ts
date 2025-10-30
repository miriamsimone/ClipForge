import { TimelineState } from '../types/timeline';
import { ExportOptions } from '../types/export';
import { MediaClip } from '../types/media';
import { analyzeTimeline, getExportClips } from './timelineAnalysis';

export interface PreparedExportData {
  timelineClips: Array<{
    id: string;
    filePath: string;
    trimIn: number;
    trimOut: number;
    duration: number;
    startTime: number;
    trackId: number;
    hasAudio: boolean;
  }>;
  timelineData: {
    totalDuration: number;
    gaps: Array<{
      startTime: number;
      endTime: number;
      duration: number;
      trackId: number;
      trackType: 'video' | 'audio' | 'overlay';
    }>;
    segments: Array<{
      startTime: number;
      endTime: number;
      duration: number;
      clips: Array<{
        trackId: number;
        trackType: 'video' | 'audio' | 'overlay';
        clip: any;
      }>;
    }>;
    hasOverlappingClips: boolean;
    maxConcurrentTracks: number;
  };
}

/**
 * Prepares timeline data for export, including gap analysis
 */
export function prepareTimelineForExport(timeline: TimelineState, mediaClips: MediaClip[]): PreparedExportData {
  // Analyze the timeline for gaps and structure
  const timelineAnalysis = analyzeTimeline(timeline);
  
  // Get all clips that should be exported
  const exportClips = getExportClips(timeline);
  
  // Convert to the format expected by the export service
  const timelineClips = exportClips.map(({ clip, trackId }) => {
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
  }).filter(clip => clip.duration > 0.01); // Filter out clips with zero duration

  return {
    timelineClips,
    timelineData: timelineAnalysis,
  };
}

/**
 * Creates export options with timeline analysis data
 */
export function createExportOptions(
  baseOptions: Omit<ExportOptions, 'timelineClips'>,
  timeline: TimelineState,
  mediaClips: MediaClip[]
): ExportOptions & { timelineData: any } {
  const preparedData = prepareTimelineForExport(timeline, mediaClips);
  
  return {
    ...baseOptions,
    timelineClips: preparedData.timelineClips,
    timelineData: preparedData.timelineData,
  };
}

/**
 * Validates that the timeline is ready for export
 */
export function validateTimelineForExport(timeline: TimelineState, mediaClips: MediaClip[]): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check if there are any clips to export
  const exportClips = getExportClips(timeline);
  if (exportClips.length === 0) {
    errors.push('No clips available for export');
    return { isValid: false, errors, warnings };
  }
  
  // Check for clips with missing media references
  const missingMedia = exportClips.filter(({ clip }) => {
    const mediaClip = mediaClips.find(mc => mc.id === clip.mediaClipId);
    return !mediaClip || !mediaClip.filePath;
  });
  if (missingMedia.length > 0) {
    errors.push(`${missingMedia.length} clips are missing media files`);
  }
  
  // Check for clips with zero duration
  const zeroDuration = exportClips.filter(({ clip }) => {
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
    errors.push(`${zeroDuration.length} clips have zero or negative duration after trimming`);
  }
  
  // Analyze timeline for warnings
  const analysis = analyzeTimeline(timeline);
  
  if (analysis.hasOverlappingClips) {
    warnings.push('Timeline contains overlapping clips - only the topmost clip will be visible');
  }
  
  if (analysis.gaps.length > 0) {
    warnings.push(`Timeline contains ${analysis.gaps.length} gaps - these will be filled with black frames/silence`);
  }
  
  if (analysis.maxConcurrentTracks > 1) {
    warnings.push(`Timeline uses ${analysis.maxConcurrentTracks} concurrent tracks - complex composition will be applied`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
