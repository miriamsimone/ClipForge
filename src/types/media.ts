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
  hasVideo: boolean;
  format: string;
  thumbnail?: string;
  thumbnails?: ThumbnailFrame[];
  subtitles?: SubtitleData;
  createdAt: number;
}

export interface ThumbnailFrame {
  timestamp: number;
  data: string;
}

export interface SubtitleData {
  srtContent: string;
  generatedAt: number;
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
