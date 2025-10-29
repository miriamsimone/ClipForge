export interface ExportTimelineClip {
  id: string;
  filePath: string;
  startTime: number;
  duration: number;
  trimIn: number;
  trimOut: number;
  trackId: number;
  hasAudio: boolean;
}

export interface ExportOptions {
  outputPath: string;
  resolution: '640x480' | '1280x720' | '1920x1080' | 'source';
  framerate: 24 | 30 | 60 | 'source';
  quality: 'low' | 'medium' | 'high' | 'maximum';
  codec: 'libx264' | 'libx265';
  audioCodec: 'aac' | 'mp3';
  container: 'mp4' | 'mov';
  timelineClips: ExportTimelineClip[];
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
