import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { MediaClip, MediaLibraryState, ImportOptions } from '../../types/media';

// Async thunks
export const importMediaFiles = createAsyncThunk(
  'media/importFiles',
  async (options: ImportOptions = { generateThumbnails: true, thumbnailCount: 5 }) => {
    const result = await window.electronAPI.openFileDialog();
    
    if (result.canceled) {
      throw new Error('File selection canceled');
    }

    const files = result.filePaths;
    const importedClips: MediaClip[] = [];

    for (const filePath of files) {
      try {
        const metadata = await window.electronAPI.getMetadata(filePath);
        const clip: MediaClip = {
          id: `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          filePath,
          fileName: metadata.fileName,
          fileSize: metadata.fileSize,
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
          frameRate: metadata.frameRate,
          codec: metadata.codec,
          audioCodec: metadata.audioCodec,
          hasAudio: metadata.hasAudio,
          format: metadata.format,
          createdAt: Date.now(),
        };

        // Generate thumbnail if requested
        if (options.generateThumbnails) {
          try {
            const thumbnail = await window.electronAPI.generateThumbnail(filePath);
            clip.thumbnail = thumbnail;
          } catch (error) {
            console.warn('Failed to generate thumbnail:', error);
          }
        }

        importedClips.push(clip);
      } catch (error) {
        console.error('Failed to import file:', filePath, error);
      }
    }

    return importedClips;
  }
);

export const generateThumbnail = createAsyncThunk(
  'media/generateThumbnail',
  async ({ clipId, timestamp }: { clipId: string; timestamp: string }) => {
    // This would need to be implemented with proper clip lookup
    throw new Error('Not implemented');
  }
);

const initialState: MediaLibraryState = {
  clips: [],
  selectedClipId: null,
  isLoading: false,
  error: null,
};

const mediaSlice = createSlice({
  name: 'media',
  initialState,
  reducers: {
    selectClip: (state, action: PayloadAction<string | null>) => {
      state.selectedClipId = action.payload;
    },
    removeClip: (state, action: PayloadAction<string>) => {
      state.clips = state.clips.filter(clip => clip.id !== action.payload);
      if (state.selectedClipId === action.payload) {
        state.selectedClipId = null;
      }
    },
    clearError: (state) => {
      state.error = null;
    },
    updateClip: (state, action: PayloadAction<{ id: string; updates: Partial<MediaClip> }>) => {
      const { id, updates } = action.payload;
      const clip = state.clips.find(c => c.id === id);
      if (clip) {
        Object.assign(clip, updates);
      }
    },
    addMediaClip: (state, action: PayloadAction<MediaClip>) => {
      console.log('addMediaClip called with:', action.payload);
      state.clips.push(action.payload);
      console.log('Media clips after adding:', state.clips.length);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(importMediaFiles.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(importMediaFiles.fulfilled, (state, action) => {
        state.isLoading = false;
        state.clips.push(...action.payload);
      })
      .addCase(importMediaFiles.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to import media files';
      })
      .addCase(generateThumbnail.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(generateThumbnail.fulfilled, (state, action) => {
        state.isLoading = false;
        // Handle thumbnail generation success
      })
      .addCase(generateThumbnail.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to generate thumbnail';
      });
  },
});

export const { selectClip, removeClip, clearError, updateClip, addMediaClip } = mediaSlice.actions;
export default mediaSlice.reducer;
