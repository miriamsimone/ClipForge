import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { RecordingState, RecordingOptions, ScreenSource, RecordingSession } from '../../types/recording';
import { addMediaClip } from './mediaSlice';

// Async thunks
// Screen source selection now handled by browser's getDisplayMedia() picker
// export const getScreenSources = createAsyncThunk(
//   'recording/getScreenSources',
//   async () => {
//     return await window.electronAPI.getScreenSources();
//   }
// );

export const startRecording = createAsyncThunk(
  'recording/start',
  async (options: RecordingOptions) => {
    // This will be handled by the ScreenRecorder class in the component
    return { options };
  }
);

export const stopRecording = createAsyncThunk(
  'recording/stop',
  async (_, { dispatch }) => {
    // This will be handled by the ScreenRecorder class in the component
    // The actual stop logic will be in the component and will call saveRecording
    return { success: true };
  }
);

export const saveRecording = createAsyncThunk(
  'recording/save',
  async ({ buffer, fileName }: { buffer: ArrayBuffer; fileName: string }, { dispatch }) => {
    console.log('saveRecording thunk called with:', { fileName, bufferSize: buffer.byteLength });
    const result = await window.electronAPI.saveRecording(buffer, fileName);
    console.log('saveRecording result:', result);
    
    // Get metadata and add to media library
    if (result.outputPath) {
      console.log('Getting metadata for:', result.outputPath);
      
      let metadata = {};
      try {
        metadata = await window.electronAPI.getMetadata(result.outputPath);
        console.log('Metadata:', metadata);
      } catch (error) {
        console.log('Failed to get metadata, using defaults:', error);
        // Use default values if metadata fails
        metadata = {
          duration: 0,
          width: 1920,
          height: 1080,
          frameRate: 30,
          fileSize: 0
        };
      }
      
      const mediaClip = {
        id: `recorded_${Date.now()}`,
        filePath: result.outputPath,
        fileName: result.fileName,
        duration: metadata.duration || 0,
        width: metadata.width || 1920,
        height: metadata.height || 1080,
        frameRate: metadata.frameRate || 30,
        fileSize: metadata.fileSize || 0,
        codec: metadata.codec || 'WEBM',
        audioCodec: metadata.audioCodec || 'AAC',
        hasAudio: metadata.hasAudio || true,
        format: metadata.format || 'webm',
        createdAt: Date.now()
      };
      
      console.log('Dispatching addMediaClip with:', mediaClip);
      dispatch(addMediaClip(mediaClip));
    } else {
      console.log('No outputPath in result, not adding to media library');
    }
    
    return result;
  }
);

const initialState: RecordingState = {
  isRecording: false,
  isPaused: false,
  duration: 0,
  outputPath: null,
  options: null,
  error: null,
  isLoading: false,
};

const recordingSlice = createSlice({
  name: 'recording',
  initialState,
  reducers: {
    setRecordingDuration: (state, action: PayloadAction<number>) => {
      state.duration = action.payload;
    },
    pauseRecording: (state) => {
      state.isPaused = true;
    },
    resumeRecording: (state) => {
      state.isPaused = false;
    },
    clearError: (state) => {
      state.error = null;
    },
    resetRecording: (state) => {
      state.isRecording = false;
      state.isPaused = false;
      state.duration = 0;
      state.outputPath = null;
      state.options = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(startRecording.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(startRecording.fulfilled, (state, action) => {
        state.isRecording = true;
        state.isPaused = false;
        state.options = action.payload.options;
        state.isLoading = false;
        state.error = null;
        console.log('Redux state updated - isRecording:', state.isRecording);
      })
      .addCase(startRecording.rejected, (state, action) => {
        state.isRecording = false;
        state.error = action.error.message || 'Failed to start recording';
        state.isLoading = false;
      })
      .addCase(stopRecording.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(stopRecording.fulfilled, (state, action) => {
        state.isRecording = false;
        state.isPaused = false;
        state.outputPath = action.payload.outputPath || null;
        state.duration = 0;
        state.isLoading = false;
      })
      .addCase(stopRecording.rejected, (state, action) => {
        state.isRecording = false;
        state.error = action.error.message || 'Failed to stop recording';
        state.isLoading = false;
      });
  },
});

export const {
  setRecordingDuration,
  pauseRecording,
  resumeRecording,
  clearError,
  resetRecording,
} = recordingSlice.actions;

export default recordingSlice.reducer;
