export interface ExportOptions {
  outputPath: string;
  resolution: '480p' | '720p' | '1080p' | 'source';
  framerate: 24 | 30 | 60 | 'source';
  quality: 'low' | 'medium' | 'high' | 'maximum';
  codec: 'h264' | 'h265';
  audioCodec: 'aac' | 'mp3';
  bitrate?: number;
  customResolution?: {
    width: number;
    height: number;
  };
}

export interface ExportProgress {
  stage: 'idle' | 'preparing' | 'encoding' | 'finalizing' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  outputPath: string | null;
  timeRemaining?: number;
  currentFrame?: number;
  totalFrames?: number;
}

export interface ExportState {
  isExporting: boolean;
  progress: ExportProgress;
  history: ExportSession[];
  error: string | null;
}

export interface ExportSession {
  id: string;
  startTime: number;
  endTime?: number;
  duration: number;
  outputPath: string;
  options: ExportOptions;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  fileSize?: number;
}
