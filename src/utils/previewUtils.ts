import { TimelineState, TimelineClip, TimelineTrack } from '../types/timeline';
import { MediaClip } from '../types/media';

export interface ActiveClip {
  clip: TimelineClip;
  trackId: number;
  trackType: 'video' | 'audio' | 'overlay';
  mediaClip: MediaClip;
  clipStartTime: number;
  clipEndTime: number;
}

export interface ActiveClipsAtTime {
  video: ActiveClip[];
  audio: ActiveClip[];
  overlay: ActiveClip[];
}

/**
 * Gets all active clips at a given timeline time, organized by track type
 */
export function getActiveClipsAtTime(
  timeline: TimelineState,
  mediaClips: MediaClip[],
  time: number
): ActiveClipsAtTime {
  const active: ActiveClipsAtTime = {
    video: [],
    audio: [],
    overlay: []
  };

  timeline.tracks.forEach(track => {
    const trackClips = getTrackClipsForTime(track, time);
    
    trackClips.forEach(clipData => {
      const mediaClip = mediaClips.find(mc => mc.id === clipData.clip.mediaClipId);
      if (!mediaClip) return;

      const activeClip: ActiveClip = {
        clip: clipData.clip,
        trackId: track.id,
        trackType: track.type as 'video' | 'audio' | 'overlay',
        mediaClip,
        clipStartTime: clipData.clip.startTime || 0,
        clipEndTime: (clipData.clip.startTime || 0) + (clipData.clip.duration || 0)
      };

      if (track.type === 'video') {
        active.video.push(activeClip);
      } else if (track.type === 'audio') {
        active.audio.push(activeClip);
      } else if (track.type === 'overlay') {
        active.overlay.push(activeClip);
      }
    });
  });

  // Sort by track ID to ensure consistent ordering
  active.video.sort((a, b) => a.trackId - b.trackId);
  active.audio.sort((a, b) => a.trackId - b.trackId);
  active.overlay.sort((a, b) => a.trackId - b.trackId);

  return active;
}

/**
 * Gets active clips in a specific track at a given time
 */
export function getTrackClipsForTime(
  track: TimelineTrack,
  time: number
): Array<{ clip: TimelineClip; isActive: boolean }> {
  return track.clips
    .filter(clip => {
      const clipStart = clip.startTime || 0;
      const clipEnd = clipStart + (clip.duration || 0);
      return time >= clipStart && time < clipEnd;
    })
    .map(clip => ({
      clip,
      isActive: true
    }));
}

/**
 * Calculates what time to play in the source media for a given clip at a timeline time
 */
export function calculateClipPlaybackTime(
  clip: TimelineClip,
  timelineTime: number,
  mediaClip: MediaClip
): number {
  const clipStartTime = clip.startTime || 0;
  const relativeTime = Math.max(0, timelineTime - clipStartTime);
  const trimIn = clip.trimIn || 0;
  const sourceTime = trimIn + relativeTime;
  
  // Clamp to media duration and trimOut
  const trimOut = clip.trimOut ?? mediaClip.duration ?? Infinity;
  return Math.min(sourceTime, trimOut);
}

/**
 * Gets the primary video clip (first video track, or first overlay if no video)
 */
export function getPrimaryVideoClip(activeClips: ActiveClipsAtTime): ActiveClip | null {
  if (activeClips.video.length > 0) {
    return activeClips.video[0];
  }
  if (activeClips.overlay.length > 0) {
    return activeClips.overlay[0];
  }
  return null;
}

/**
 * Checks if there are any active clips at a given time
 */
export function hasActiveClips(activeClips: ActiveClipsAtTime): boolean {
  return activeClips.video.length > 0 || 
         activeClips.audio.length > 0 || 
         activeClips.overlay.length > 0;
}

