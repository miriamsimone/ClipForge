export interface TimelineClip {
  id: string;
  mediaClipId: string;
  track: number;
  startTime: number;
  duration: number;
  trimIn: number;
  trimOut: number;
  isSelected: boolean;
}

export interface TimelineTrack {
  id: number;
  name: string;
  type: 'video' | 'audio' | 'overlay';
  clips: TimelineClip[];
  height: number;
  isMuted: boolean;
  isLocked: boolean;
}

export interface TimelineState {
  tracks: TimelineTrack[];
  playheadPosition: number;
  zoom: number;
  scrollPosition: number;
  isPlaying: boolean;
  selectedClipIds: string[];
  snapToGrid: boolean;
  snapToClips: boolean;
  pixelsPerSecond: number;
}

export interface TimelineOperation {
  type: 'add' | 'remove' | 'move' | 'trim' | 'split' | 'duplicate';
  clipId: string;
  data?: any;
}
