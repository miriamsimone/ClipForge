const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Import services
const MediaService = require('./services/mediaService');
const FFmpegService = require('./services/ffmpegService');
const RecordingService = require('./services/recordingService');
const ExportService = require('./services/exportService');

let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  // Load the app
  if (isDev) {
    // Try multiple ports for development
    const devPorts = [5173, 5174, 5175, 5176];
    let currentPort = 0;
    
    const tryLoadDevUrl = () => {
      if (currentPort < devPorts.length) {
        const url = `http://localhost:${devPorts[currentPort]}`;
        mainWindow.loadURL(url).catch(() => {
          currentPort++;
          tryLoadDevUrl();
        });
      } else {
        console.error('Could not connect to Vite dev server on any port');
        mainWindow.loadURL('data:text/html,<h1>Development server not found</h1><p>Please start the Vite dev server first.</p>');
      }
    };
    
    tryLoadDevUrl();
  } else {
    // Production build
    const startUrl = `file://${path.join(__dirname, '../dist/index.html')}`;
    mainWindow.loadURL(startUrl);
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register custom protocol for serving video files
app.whenReady().then(() => {
  // Register a custom protocol to serve video files
  protocol.registerFileProtocol('video', (request, callback) => {
    const filePath = request.url.substr(7); // Remove 'video://' prefix
    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        callback({ path: filePath });
      } else {
        callback({ error: -6 }); // FILE_NOT_FOUND
      }
    } catch (error) {
      callback({ error: -6 }); // FILE_NOT_FOUND
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Initialize services
const mediaService = new MediaService();
const ffmpegService = new FFmpegService();
const recordingService = new RecordingService();
const exportService = new ExportService();

// IPC handlers
ipcMain.handle('media:open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'mkv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result;
});

ipcMain.handle('media:get-metadata', async (event, filePath) => {
  return await mediaService.getMetadata(filePath);
});

ipcMain.handle('media:generate-thumbnail', async (event, filePath, timestamp) => {
  return await mediaService.generateThumbnail(filePath, timestamp);
});

ipcMain.handle('media:get-video-url', async (event, filePath) => {
  // Use custom video protocol to serve the file
  return `video://${filePath}`;
});

ipcMain.handle('ffmpeg:execute', async (event, args, options) => {
  return await ffmpegService.executeCommand(args, options);
});

ipcMain.handle('recording:start-screen', async (event, options) => {
  return await recordingService.startScreenRecording(options);
});

ipcMain.handle('recording:stop-screen', async () => {
  return await recordingService.stopScreenRecording();
});

ipcMain.handle('export:start', async (event, options) => {
  return await exportService.startExport(options);
});

ipcMain.handle('export:get-progress', async () => {
  return await exportService.getProgress();
});

ipcMain.handle('export:cancel', async () => {
  return await exportService.cancelExport();
});
