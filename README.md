# ClipForge

A streamlined desktop video editor for macOS built with Electron and React.

## Features

- **Media Import**: Import MP4 and MOV video files with drag & drop support
- **Timeline Editing**: Multi-track timeline with trim, split, and arrange capabilities
- **Screen Recording**: Record screen, webcam, or both with custom region selection
- **Video Export**: Export to MP4 with customizable resolution, quality, and frame rate
- **Packaged FFmpeg**: No system dependencies - FFmpeg is included in the app bundle

## Prerequisites

- Node.js 18+ 
- npm or yarn
- macOS 11.0+ (Big Sur and later)

## Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ClipForge
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Download FFmpeg binaries**
   ```bash
   npm run download-ffmpeg
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

This will start both the Vite development server and Electron app.

## Building for Production

1. **Build the app**
   ```bash
   npm run build:mac
   ```

2. **Create distributable**
   ```bash
   npm run dist
   ```

The built app will be available in the `dist/` directory.

## Project Structure

```
ClipForge/
├── electron/                 # Electron main process
│   ├── main.js              # Main process entry point
│   ├── preload.js           # Preload script for secure IPC
│   └── services/            # Backend services
│       ├── mediaService.js  # Media file handling
│       ├── ffmpegService.js # FFmpeg process management
│       ├── recordingService.js # Screen recording
│       └── exportService.js # Video export
├── src/                     # React frontend
│   ├── components/          # UI components
│   ├── store/              # Redux store and slices
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Utility functions
├── scripts/                # Build scripts
│   └── download-ffmpeg.js  # FFmpeg download script
└── electron-builder.yml    # Electron packaging config
```

## Architecture

- **Frontend**: React with Redux Toolkit for state management
- **Backend**: Node.js with Electron for desktop integration
- **Media Processing**: Packaged FFmpeg binary for video operations
- **UI Framework**: Custom CSS with modern design patterns

## FFmpeg Integration

The app includes pre-built FFmpeg binaries for both Intel (x64) and Apple Silicon (arm64) Macs. The binaries are automatically downloaded during the build process and packaged with the application.

## Development Notes

- The app uses Electron's context isolation for security
- All file operations go through the main process
- FFmpeg processes are managed through Node.js child_process
- State is managed with Redux Toolkit for predictable updates

## License

MIT License - see LICENSE file for details.
