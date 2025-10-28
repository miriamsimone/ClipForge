export interface RecordingOptions {
  sourceId: string;
  audio: boolean;
  video: boolean;
  frameRate: number;
  quality: 'low' | 'medium' | 'high' | 'maximum';
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  outputPath: string | null;
  options: RecordingOptions | null;
  error: string | null;
  isLoading: boolean;
}

export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
  type: 'screen' | 'window';
}

export interface RecordingSession {
  id: string;
  startTime: number;
  endTime?: number;
  duration: number;
  outputPath: string;
  options: RecordingOptions;
}
