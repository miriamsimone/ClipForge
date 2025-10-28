export interface ElectronAPI {
  // Media operations
  openFileDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  getMetadata: (filePath: string) => Promise<any>;
  generateThumbnail: (filePath: string, timestamp?: string) => Promise<string>;
  getVideoUrl: (filePath: string) => Promise<string>;
  
  // FFmpeg operations
  executeFFmpeg: (args: string[], options?: any) => Promise<any>;
  
  // Recording operations
  startScreenRecording: (options: any) => Promise<any>;
  stopScreenRecording: () => Promise<any>;
  
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
