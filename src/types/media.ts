export interface MediaClip {
  id: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  codec: string;
  audioCodec: string;
  hasAudio: boolean;
  format: string;
  thumbnail?: string;
  thumbnails?: ThumbnailFrame[];
  createdAt: number;
}

export interface ThumbnailFrame {
  timestamp: number;
  data: string;
}

export interface MediaLibraryState {
  clips: MediaClip[];
  selectedClipId: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface ImportOptions {
  generateThumbnails: boolean;
  thumbnailCount: number;
}
