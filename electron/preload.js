const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Media operations
  openFileDialog: () => ipcRenderer.invoke('media:open-file-dialog'),
  getMetadata: (filePath) => ipcRenderer.invoke('media:get-metadata', filePath),
  generateThumbnail: (filePath, timestamp) => ipcRenderer.invoke('media:generate-thumbnail', filePath, timestamp),
  getVideoUrl: (filePath) => ipcRenderer.invoke('media:get-video-url', filePath),
  
  // FFmpeg operations
  executeFFmpeg: (args, options) => ipcRenderer.invoke('ffmpeg:execute', args, options),
  
  // Recording operations
  startScreenRecording: (options) => ipcRenderer.invoke('recording:start-screen', options),
  stopScreenRecording: () => ipcRenderer.invoke('recording:stop-screen'),
  
  // Export operations
  startExport: (options) => ipcRenderer.invoke('export:start', options),
  getExportProgress: () => ipcRenderer.invoke('export:get-progress'),
  cancelExport: () => ipcRenderer.invoke('export:cancel'),
  
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
