import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { UIState } from '../../types/ui';

const initialState: UIState = {
  showRecordingPanel: false,
  showExportDialog: false,
  showMediaLibrary: true,
  showTimeline: true,
  activeModal: null,
  sidebarWidth: 300,
  timelineHeight: 200,
  theme: 'dark',
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleRecordingPanel: (state) => {
      console.log('toggleRecordingPanel called, current state:', state.showRecordingPanel);
      state.showRecordingPanel = !state.showRecordingPanel;
      state.activeModal = state.showRecordingPanel ? 'recording' : null;
      console.log('toggleRecordingPanel updated, new state:', state.showRecordingPanel);
    },
    toggleExportDialog: (state) => {
      state.showExportDialog = !state.showExportDialog;
      state.activeModal = state.showExportDialog ? 'export' : null;
    },
    toggleMediaLibrary: (state) => {
      state.showMediaLibrary = !state.showMediaLibrary;
    },
    toggleTimeline: (state) => {
      state.showTimeline = !state.showTimeline;
    },
    setActiveModal: (state, action: PayloadAction<string | null>) => {
      state.activeModal = action.payload;
      state.showRecordingPanel = action.payload === 'recording';
      state.showExportDialog = action.payload === 'export';
    },
    closeAllModals: (state) => {
      state.showRecordingPanel = false;
      state.showExportDialog = false;
      state.activeModal = null;
    },
    setSidebarWidth: (state, action: PayloadAction<number>) => {
      state.sidebarWidth = Math.max(200, Math.min(500, action.payload));
    },
    setTimelineHeight: (state, action: PayloadAction<number>) => {
      state.timelineHeight = Math.max(100, Math.min(400, action.payload));
    },
    setTheme: (state, action: PayloadAction<'dark' | 'light'>) => {
      state.theme = action.payload;
    },
  },
});

export const {
  toggleRecordingPanel,
  toggleExportDialog,
  toggleMediaLibrary,
  toggleTimeline,
  setActiveModal,
  closeAllModals,
  setSidebarWidth,
  setTimelineHeight,
  setTheme,
} = uiSlice.actions;

export default uiSlice.reducer;
