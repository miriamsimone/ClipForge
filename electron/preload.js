const { contextBridge, ipcRenderer } = require('electron');

// Ensure screen capture APIs are available
if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
  console.log('MediaDevices API available in preload');
} else {
  console.log('MediaDevices API not available in preload');
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Media operations
  openFileDialog: () => ipcRenderer.invoke('media:open-file-dialog'),
  getMetadata: (filePath) => ipcRenderer.invoke('media:get-metadata', filePath),
  generateThumbnail: (filePath, timestamp) => ipcRenderer.invoke('media:generate-thumbnail', filePath, timestamp),
  extractAudioFromVideo: (videoPath, outputPath, audioFormat) => ipcRenderer.invoke('media:extract-audio-from-video', videoPath, outputPath, audioFormat),
  getVideoUrl: (filePath) => ipcRenderer.invoke('media:get-video-url', filePath),
  
  // FFmpeg operations
  executeFFmpeg: (args, options) => ipcRenderer.invoke('ffmpeg:execute', args, options),
  
  // Recording operations
  getScreenSources: () => ipcRenderer.invoke('recording:get-sources'),
  startScreenRecording: (options) => ipcRenderer.invoke('recording:start-screen', options),
  stopScreenRecording: () => ipcRenderer.invoke('recording:stop-screen'),
  getRecordingStatus: () => ipcRenderer.invoke('recording:get-status'),
  saveRecording: (buffer, fileName) => ipcRenderer.invoke('recording:save-file', buffer, fileName),
  
  // Export operations
  startExport: (options) => ipcRenderer.invoke('export:start', options),
  getExportProgress: () => ipcRenderer.invoke('export:get-progress'),
  cancelExport: () => ipcRenderer.invoke('export:cancel'),
  
  // Subtitle operations
  generateSubtitles: (filePath) => ipcRenderer.invoke('subtitle:generate', filePath),
  
  // Event listeners
  onExportProgress: (callback) => {
    ipcRenderer.on('export:progress', callback);
  },
  onExportComplete: (callback) => {
    ipcRenderer.on('export:complete', callback);
  },
  onExportError: (callback) => {
    ipcRenderer.on('export:error', callback);
  },
  
  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
