import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { ExportState, ExportOptions, ExportProgress, ExportSession } from '../../types/export';

// Async thunks
export const startExport = createAsyncThunk(
  'export/start',
  async (options: ExportOptions & { timelineData?: any }) => {
    const result = await window.electronAPI.startExport(options);
    return { result, options };
  }
);

export const getExportProgress = createAsyncThunk(
  'export/getProgress',
  async () => {
    const progress = await window.electronAPI.getExportProgress();
    return progress;
  }
);

export const cancelExport = createAsyncThunk(
  'export/cancel',
  async () => {
    const result = await window.electronAPI.cancelExport();
    return result;
  }
);

const initialState: ExportState = {
  isExporting: false,
  progress: {
    stage: 'idle',
    progress: 0,
    message: '',
    outputPath: null,
  },
  history: [],
  error: null,
};

const exportSlice = createSlice({
  name: 'export',
  initialState,
  reducers: {
    updateProgress: (state, action: PayloadAction<ExportProgress>) => {
      state.progress = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    addToHistory: (state, action: PayloadAction<ExportSession>) => {
      state.history.unshift(action.payload);
      // Keep only last 50 exports
      if (state.history.length > 50) {
        state.history = state.history.slice(0, 50);
      }
    },
    clearHistory: (state) => {
      state.history = [];
    },
    resetExport: (state) => {
      state.isExporting = false;
      state.progress = {
        stage: 'idle',
        progress: 0,
        message: '',
        outputPath: null,
      };
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(startExport.pending, (state) => {
        state.isExporting = true;
        state.progress = {
          stage: 'preparing',
          progress: 0,
          message: 'Preparing export...',
          outputPath: null,
        };
        state.error = null;
      })
      .addCase(startExport.fulfilled, (state, action) => {
        state.isExporting = true;
        state.progress = {
          stage: 'encoding',
          progress: 0,
          message: 'Starting export...',
          outputPath: action.payload.options.outputPath,
        };
      })
      .addCase(startExport.rejected, (state, action) => {
        state.isExporting = false;
        state.progress = {
          stage: 'error',
          progress: 0,
          message: 'Export failed',
          outputPath: null,
        };
        state.error = action.error.message || 'Failed to start export';
      })
      .addCase(getExportProgress.fulfilled, (state, action) => {
        state.progress = action.payload;
        
        if (action.payload.stage === 'complete') {
          state.isExporting = false;
          // Add to history
          const session: ExportSession = {
            id: `export_${Date.now()}`,
            startTime: Date.now() - (action.payload.timeRemaining || 0),
            endTime: Date.now(),
            duration: action.payload.timeRemaining || 0,
            outputPath: action.payload.outputPath || '',
            options: {} as ExportOptions, // This would need to be stored properly
            status: 'completed',
            fileSize: 0, // This would need to be calculated
          };
          state.history.unshift(session);
        }
      })
      .addCase(cancelExport.fulfilled, (state, action) => {
        state.isExporting = false;
        state.progress = {
          stage: 'idle',
          progress: 0,
          message: 'Export cancelled',
          outputPath: null,
        };
      })
      .addCase(cancelExport.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to cancel export';
      });
  },
});

export const {
  updateProgress,
  clearError,
  addToHistory,
  clearHistory,
  resetExport,
} = exportSlice.actions;

export default exportSlice.reducer;
