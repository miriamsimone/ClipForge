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
          hasVideo: metadata.hasVideo,
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
  async (_: { clipId: string; timestamp: string }): Promise<never> => {
    // This would need to be implemented with proper clip lookup
    throw new Error('Not implemented');
  }
);

export const generateSubtitles = createAsyncThunk(
  'media/generateSubtitles',
  async ({ clipId, filePath }: { clipId: string; filePath: string }) => {
    const result = await window.electronAPI.generateSubtitles(filePath);
    return {
      clipId,
      subtitles: {
        srtContent: result.srtContent,
        generatedAt: result.generatedAt
      }
    };
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
      .addCase(generateThumbnail.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to generate thumbnail';
      })
      .addCase(generateSubtitles.pending, (state, action) => {
        // Set loading state for the specific clip
        const clip = state.clips.find(c => c.id === action.meta.arg.clipId);
        if (clip) {
          // Mark clip as generating subtitles (we'll use a custom property for UI state)
        }
      })
      .addCase(generateSubtitles.fulfilled, (state, action) => {
        const { clipId, subtitles } = action.payload;
        const clip = state.clips.find(c => c.id === clipId);
        if (clip) {
          clip.subtitles = subtitles;
        }
      })
      .addCase(generateSubtitles.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to generate subtitles';
      });
  },
});

export const { selectClip, removeClip, clearError, updateClip, addMediaClip } = mediaSlice.actions;
export default mediaSlice.reducer;
