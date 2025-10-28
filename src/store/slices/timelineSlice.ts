import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { TimelineState, TimelineClip } from '../../types/timeline';
import { PIXELS_PER_SECOND } from '../../constants/timeline';

const initialState: TimelineState = {
  tracks: [
    { id: 1, name: 'Video 1', type: 'video', clips: [], height: 80, isMuted: false, isLocked: false },
    { id: 2, name: 'Video 2', type: 'video', clips: [], height: 80, isMuted: false, isLocked: false },
    { id: 3, name: 'Audio 1', type: 'audio', clips: [], height: 60, isMuted: false, isLocked: false },
    { id: 4, name: 'Overlay 1', type: 'overlay', clips: [], height: 80, isMuted: false, isLocked: false },
  ],
  playheadPosition: 0,
  zoom: 1,
  scrollPosition: 0,
  isPlaying: false,
  selectedClipIds: [],
  snapToGrid: true,
  snapToClips: true,
  pixelsPerSecond: PIXELS_PER_SECOND,
};

const timelineSlice = createSlice({
  name: 'timeline',
  initialState,
  reducers: {
    setPlayheadPosition: (state, action: PayloadAction<number>) => {
      state.playheadPosition = action.payload;
    },
    setPlaying: (state, action: PayloadAction<boolean>) => {
      state.isPlaying = action.payload;
    },
    setZoom: (state, action: PayloadAction<number>) => {
      state.zoom = Math.max(0.1, Math.min(10, action.payload));
    },
    setScrollPosition: (state, action: PayloadAction<number>) => {
      state.scrollPosition = action.payload;
    },
    addClip: (state, action: PayloadAction<{ trackId: number; clip: TimelineClip }>) => {
      const { trackId, clip } = action.payload;
      const track = state.tracks.find(t => t.id === trackId);
      if (track) {
        track.clips.push(clip);
      }
    },
    removeClip: (state, action: PayloadAction<{ trackId: number; clipId: string }>) => {
      const { trackId, clipId } = action.payload;
      const track = state.tracks.find(t => t.id === trackId);
      if (track) {
        track.clips = track.clips.filter(c => c.id !== clipId);
      }
      state.selectedClipIds = state.selectedClipIds.filter(id => id !== clipId);
    },
    moveClip: (state, action: PayloadAction<{ 
      clipId: string; 
      fromTrackId: number; 
      toTrackId: number; 
      newStartTime: number; 
    }>) => {
      const { clipId, fromTrackId, toTrackId, newStartTime } = action.payload;
      
      // Remove from source track
      const fromTrack = state.tracks.find(t => t.id === fromTrackId);
      if (fromTrack) {
        const clipIndex = fromTrack.clips.findIndex(c => c.id === clipId);
        if (clipIndex !== -1) {
          const clip = fromTrack.clips[clipIndex];
          fromTrack.clips.splice(clipIndex, 1);
          
          // Add to destination track
          const toTrack = state.tracks.find(t => t.id === toTrackId);
          if (toTrack) {
            clip.startTime = newStartTime;
            toTrack.clips.push(clip);
          }
        }
      }
    },
    updateClip: (state, action: PayloadAction<{ 
      trackId: number; 
      clipId: string; 
      updates: Partial<TimelineClip> 
    }>) => {
      const { trackId, clipId, updates } = action.payload;
      const track = state.tracks.find(t => t.id === trackId);
      if (track) {
        const clip = track.clips.find(c => c.id === clipId);
        if (clip) {
          Object.assign(clip, updates);
        }
      }
    },
    selectClip: (state, action: PayloadAction<string>) => {
      const clipId = action.payload;
      if (!state.selectedClipIds.includes(clipId)) {
        state.selectedClipIds.push(clipId);
      }
    },
    deselectClip: (state, action: PayloadAction<string>) => {
      state.selectedClipIds = state.selectedClipIds.filter(id => id !== action.payload);
    },
    clearSelection: (state) => {
      state.selectedClipIds = [];
    },
    splitClip: (state, action: PayloadAction<{ 
      trackId: number; 
      clipId: string; 
      splitTime: number 
    }>) => {
      const { trackId, clipId, splitTime } = action.payload;
      const track = state.tracks.find(t => t.id === trackId);
      if (track) {
        const clipIndex = track.clips.findIndex(c => c.id === clipId);
        if (clipIndex !== -1) {
          const originalClip = track.clips[clipIndex];
          const splitPosition = splitTime - originalClip.startTime;
          
          if (splitPosition > 0 && splitPosition < originalClip.duration) {
            // Create new clip for the second part
            const newClip: TimelineClip = {
              ...originalClip,
              id: `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              startTime: splitTime,
              duration: originalClip.duration - splitPosition,
              trimIn: originalClip.trimIn + splitPosition,
            };
            
            // Update original clip
            originalClip.duration = splitPosition;
            originalClip.trimOut = originalClip.trimIn + splitPosition;
            
            // Insert new clip after original
            track.clips.splice(clipIndex + 1, 0, newClip);
          }
        }
      }
    },
    duplicateClip: (state, action: PayloadAction<{ trackId: number; clipId: string }>) => {
      const { trackId, clipId } = action.payload;
      const track = state.tracks.find(t => t.id === trackId);
      if (track) {
        const originalClip = track.clips.find(c => c.id === clipId);
        if (originalClip) {
          const duplicatedClip: TimelineClip = {
            ...originalClip,
            id: `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            startTime: originalClip.startTime + originalClip.duration,
            isSelected: false,
          };
          track.clips.push(duplicatedClip);
        }
      }
    },
    toggleSnapToGrid: (state) => {
      state.snapToGrid = !state.snapToGrid;
    },
    toggleSnapToClips: (state) => {
      state.snapToClips = !state.snapToClips;
    },
    clearTimeline: (state) => {
      state.tracks.forEach(track => {
        track.clips = [];
      });
      state.selectedClipIds = [];
      state.playheadPosition = 0;
    },
    setPixelsPerSecond: (state, action: PayloadAction<number>) => {
      state.pixelsPerSecond = action.payload;
    },
  },
});

export const {
  setPlayheadPosition,
  setPlaying,
  setZoom,
  setScrollPosition,
  addClip,
  removeClip,
  moveClip,
  updateClip,
  selectClip,
  deselectClip,
  clearSelection,
  splitClip,
  duplicateClip,
  toggleSnapToGrid,
  toggleSnapToClips,
  clearTimeline,
  setPixelsPerSecond,
} = timelineSlice.actions;

export default timelineSlice.reducer;
