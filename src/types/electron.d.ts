import { ScreenSource } from './recording';

export interface ElectronAPI {
  // Media operations
  openFileDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  getMetadata: (filePath: string) => Promise<any>;
  generateThumbnail: (filePath: string, timestamp?: string) => Promise<string>;
  extractAudioFromVideo: (videoPath: string, outputPath?: string, audioFormat?: string) => Promise<any>;
  getVideoUrl: (filePath: string) => Promise<string>;
  
  // FFmpeg operations
  executeFFmpeg: (args: string[], options?: any) => Promise<any>;
  // Recording operations
  getScreenSources: () => Promise<ScreenSource[]>;
  startScreenRecording: (options: any) => Promise<{ success: boolean; message: string; sourceId: string; outputPath: string }>;
  stopScreenRecording: () => Promise<{ success: boolean; message: string; outputPath: string; fileName: string }>;
  getRecordingStatus: () => Promise<{ isRecording: boolean; outputPath: string | null }>;
  saveRecording: (buffer: ArrayBuffer, fileName: string) => Promise<{ outputPath: string; fileName: string }>;
  
  // Export operations
  startExport: (options: any) => Promise<any>;
  getExportProgress: () => Promise<any>;
  cancelExport: () => Promise<any>;
  
  // Event listeners
  onExportProgress: (callback: (event: any, data: any) => void) => void;
  onExportComplete: (callback: (event: any, data: any) => void) => void;
  onExportError: (callback: (event: any, data: any) => void) => void;
  
  // Remove listeners
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
