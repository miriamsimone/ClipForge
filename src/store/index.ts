import { configureStore } from '@reduxjs/toolkit';
import mediaReducer from './slices/mediaSlice';
import timelineReducer from './slices/timelineSlice';
import recordingReducer from './slices/recordingSlice';
import exportReducer from './slices/exportSlice';
import uiReducer from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    media: mediaReducer,
    timeline: timelineReducer,
    recording: recordingReducer,
    export: exportReducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
