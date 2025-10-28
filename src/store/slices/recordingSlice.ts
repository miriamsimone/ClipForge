import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { RecordingState, RecordingOptions, ScreenSource, RecordingSession } from '../../types/recording';

// Async thunks
export const getScreenSources = createAsyncThunk(
  'recording/getScreenSources',
  async () => {
    // This would need to be implemented with proper Electron API calls
    // For now, return mock data
    return [
      { id: 'screen:0', name: 'Entire Screen', thumbnail: '', type: 'screen' as const },
      { id: 'window:1', name: 'Chrome', thumbnail: '', type: 'window' as const },
    ];
  }
);

export const startRecording = createAsyncThunk(
  'recording/start',
  async (options: RecordingOptions) => {
    const result = await window.electronAPI.startScreenRecording(options);
    return { result, options };
  }
);

export const stopRecording = createAsyncThunk(
  'recording/stop',
  async () => {
    const result = await window.electronAPI.stopScreenRecording();
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
        state.error = null;
      })
      .addCase(startRecording.rejected, (state, action) => {
        state.isRecording = false;
        state.error = action.error.message || 'Failed to start recording';
      })
      .addCase(stopRecording.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(stopRecording.fulfilled, (state, action) => {
        state.isRecording = false;
        state.isPaused = false;
        state.outputPath = action.payload.outputPath || null;
        state.duration = 0;
      })
      .addCase(stopRecording.rejected, (state, action) => {
        state.isRecording = false;
        state.error = action.error.message || 'Failed to stop recording';
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
