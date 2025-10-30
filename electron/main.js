const { app, BrowserWindow, ipcMain, dialog, protocol, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

console.log('📁 Main process starting...');
console.log('📦 Dependencies loaded, isDev:', isDev);

if (!isDev) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

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
      contextIsolation: true, // Keep security enabled
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // Allow desktop capture
      experimentalFeatures: true, // Enable experimental features
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
    const fallbackIndexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    if (!fs.existsSync(fallbackIndexPath)) {
      console.error('Production index.html not found at expected location:', fallbackIndexPath);
    } else {
      console.log('Validated production index.html at:', fallbackIndexPath);
    }

    const startUrl = isDev ? pathToFileURL(fallbackIndexPath).toString() : 'app://index.html';
    console.log('Loading production bundle from:', startUrl);
    mainWindow.loadURL(startUrl);
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    mainWindow.show();
  });

  // Handle page load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Page failed to load:', errorCode, errorDescription, validatedURL);
  });

  // Handle page load success
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page finished loading');
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
app.whenReady().then(async () => {
  console.log('🚀 App is ready! Platform:', process.platform);

  if (!isDev) {
    protocol.registerFileProtocol('app', (request, callback) => {
      try {
        const url = new URL(request.url);
        let pathname = decodeURI(url.pathname);
        if (!pathname || pathname === '/' || pathname === '/index.html') {
          pathname = 'index.html';
        } else if (pathname.startsWith('/')) {
          pathname = pathname.slice(1);
        }

        const targetPath = path.join(app.getAppPath(), 'dist', pathname);
        callback({ path: targetPath });
      } catch (error) {
        console.error('Failed to resolve app:// URL:', request.url, error);
        callback({ error: -6 });
      }
    });
  }
  
  // Request screen recording permissions on macOS
  if (process.platform === 'darwin') {
    console.log('🍎 Running on macOS - checking screen recording permissions');
    try {
      // Check current permission status first
      const currentStatus = systemPreferences.getMediaAccessStatus('screen');
      console.log('Current screen recording permission status:', currentStatus);
      
      // Only ask if permission hasn't been determined yet
      if (currentStatus === 'not-determined') {
        console.log('Requesting screen recording permission...');
        const hasPermission = await systemPreferences.askForMediaAccess('screen');
        console.log('Screen recording permission granted:', hasPermission);
        if (!hasPermission) {
          console.warn('Screen recording permission denied. Recording may not work properly.');
        }
      } else {
        console.log('Screen recording permission already determined:', currentStatus);
      }
    } catch (error) {
      console.error('Error requesting screen recording permission:', error);
    }
  }

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

  // Request screen capture permissions
  app.commandLine.appendSwitch('enable-usermedia-screen-capture');
  app.commandLine.appendSwitch('auto-select-desktop-capture-source', 'Entire Screen');
  app.commandLine.appendSwitch('enable-features', 'WebRTC');
  app.commandLine.appendSwitch('enable-experimental-web-platform-features');
  app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');

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

// Screen recording legacy APIs for fallback support
ipcMain.handle('recording:get-sources', async () => {
  return await recordingService.getScreenSources();
});

ipcMain.handle('recording:save-file', async (event, buffer, fileName) => {
  const os = require('os');
  // fileName already includes extension and timestamp, just add ClipForge prefix
  const outputPath = path.join(os.homedir(), 'Desktop', `ClipForge_${fileName}`);

  console.log('Saving recording file:');
  console.log('  - Output path:', outputPath);
  console.log('  - Buffer size:', buffer.byteLength, 'bytes');

  try {
    // Write the buffer to file
    fs.writeFileSync(outputPath, Buffer.from(buffer));

    // Verify file was written
    const stats = fs.statSync(outputPath);
    console.log('  - File written successfully, size:', stats.size, 'bytes');

    return {
      outputPath,
      fileName: path.basename(outputPath),
      fileSize: stats.size
    };
  } catch (error) {
    console.error('Error saving recording file:', error);
    throw error;
  }
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
