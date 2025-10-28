# ClipForge Product Requirements Document

## Product Overview

**Product Name:** ClipForge  
**Type:** Desktop Video Editor  
**Platform:** macOS desktop application (Electron-based)  
**Target Users:** Content creators, educators, professionals who need quick video editing capabilities

**Core Value Proposition:** A streamlined desktop video editor that enables users to record, import, arrange, and export professional videos without the complexity of traditional editing software.

---

## Goals & Success Metrics

### Primary Goals
- Enable users to create edited videos from import to export in a single application
- Provide intuitive timeline-based editing with minimal learning curve
- Support MOV video import with reliable playback
- Export production-ready MP4 videos

### Success Metrics
- Application launches successfully on macOS
- Users can complete import → edit → export workflow without crashes
- Timeline remains responsive with 10+ clips loaded
- Export process completes without data loss
- Preview playback maintains 30+ fps

---

## User Personas

### Primary Persona: The Quick Creator
- Needs to record tutorials, demos, or presentations
- Values speed over advanced features
- Expects drag-and-drop simplicity
- Wants professional output without technical knowledge

### Secondary Persona: The Content Assembler
- Imports existing video clips
- Needs basic trimming and sequencing
- Exports for social media or sharing
- Requires consistent quality across platforms

---

## Functional Requirements

### 1. Application Foundation

**Desktop App Infrastructure**
- Launch native application on macOS
- Single-window interface with persistent state
- Menu bar with standard File/Edit/View options
- Application icon and proper OS integration

**File System Integration**
- Read access for importing media files
- Write access for exporting finished videos
- Support for native file picker dialogs
- Support for drag and drop from file system/explorer

---

### 2. Media Import

**Supported Import Methods**
- Drag and drop video files directly into application (from file system/explorer)
- Drag and drop directly onto timeline (bypasses media library)
- File picker dialog for manual selection
- Support for multiple file selection

**Supported Formats**
- MP4 (H.264, H.265)
- MOV (QuickTime)

**Media Library Panel**
- Grid or list view of imported clips
- Thumbnail preview generation
- Display metadata: duration, resolution, file size
- Search/filter imported clips
- Delete clips from library

---

### 3. Recording Capabilities

**Screen Recording**
- Custom region selection (drag to define area)
- Display recording controls overlay
- Output format: MP4 or MOV

**Webcam Recording**
- Access system camera
- Camera preview before recording
- Resolution: 720p, 1080p
- Output format: MP4 or MOV

**Audio Capture**
- Microphone input selection
- System audio capture (desktop sound)
- Combined mic + system audio
- Audio level monitoring during recording
- Mute/unmute controls

**Recording Controls**
- Start/Stop recording buttons
- Pause/Resume capability
- Recording timer display
- Countdown before recording starts (3-2-1)
- Recording indicator (visual cue that recording is active)
- Keyboard shortcuts for start/stop

**Post-Recording**
- Automatic addition to media library
- Preview recorded clip immediately
- Option to re-record if unsatisfied
- Save recording with default or custom naming

---

### 4. Timeline Editor

**Timeline Structure**
- Horizontal timeline with time ruler (showing seconds/minutes)
- Playhead (red line) indicating current time position
- Multiple tracks (minimum 2, expandable to 4+)
- Track types: Video, Overlay, Audio

**Clip Management**
- Drag clips from media library to timeline
- Drag clips directly from file system/explorer to timeline
- Rearrange clips along timeline (change order)
- Move clips between tracks
- Snap-to-clip edges for alignment
- Snap-to-grid for precision
- Visual indication of clip boundaries

**Clip Editing Operations**
- **Trim:** Adjust clip start point (trim-in)
- **Trim:** Adjust clip end point (trim-out)
- **Split:** Cut clip at playhead position into two clips
- **Delete:** Remove clip from timeline
- **Duplicate:** Create copy of clip on timeline
- **Ripple Delete:** Remove clip and close gap automatically

**Trim Interface**
- Handles on clip edges (draggable)
- Preview updates in real-time during trim
- Display remaining duration as you trim
- Numerical input for precise trim values (seconds)

**Timeline Navigation**
- Zoom in/out (timeline scale adjustment)
- Horizontal scrolling for long projects
- Click anywhere on timeline to move playhead
- Keyboard shortcuts: Space (play/pause), Left/Right arrows (frame step)

**Visual Feedback**
- Clip thumbnails on timeline
- Waveform display for audio clips
- Color coding by track type
- Selection highlighting

---

### 5. Preview & Playback

**Preview Window**
- Real-time composition preview of entire timeline
- Shows current frame at playhead position
- Scales to fit preview area
- Displays resolution and framerate

**Playback Controls**
- Play button (starts from playhead position)
- Pause button
- Stop button (returns to start)
- Loop toggle (repeat playback)
- Playback speed selector (0.5x, 1x, 1.5x, 2x)

**Scrubbing**
- Click and drag playhead to any position
- Frame-accurate seeking
- Audio scrubbing (hear audio while dragging)
- Thumbnail preview while scrubbing

**Audio Sync**
- Audio playback synchronized with video
- No drift during long previews
- Volume control in preview window
- Mute toggle

---

### 6. Export & Output

**Export Configuration**
- Resolution selector: 480p, 720p, 1080p, Source (max 1080p)
- Frame rate: 24fps, 30fps, 60fps, Source
- Quality/bitrate selector: Low, Medium, High, Maximum
- Output format: MP4 (H.264)
- Audio codec: AAC
- File naming and save location selection

**Export Process**
- Progress bar with percentage
- Time remaining estimate
- Current stage indicator (Processing, Encoding, Finalizing)
- Cancel export option
- Preview thumbnail during export

**Post-Export**
- Open containing folder button
- Play exported video button
- Export log/report for troubleshooting

---

## Non-Functional Requirements

### Performance
- Application launch time: <5 seconds
- Timeline UI responsiveness: No lag with 10+ clips
- Preview playback: 30fps minimum, no dropped frames
- Memory usage: Stable during 15+ minute editing sessions
- Export speed: Reasonable encoding time (1-2x real-time for 1080p)

### Reliability
- No crashes during normal operation
- Graceful error handling for corrupted media files
- Local crash reporting for development/debugging

### Compatibility
- macOS 11.0+ (Big Sur and later)
- Support for MOV video format (primary import format)
- Handle MOV files without transcoding when possible
- Variable frame rate support (if FFmpeg handles natively)
- Packaged FFmpeg binary (no system dependency)

### File Size
- Exported videos maintain quality without excessive file size
- Efficient codec usage (H.264 with optimized settings)
- Option to prioritize quality vs. file size

---

## Technical Architecture

### Tech Stack
- **Desktop Framework:** Electron (Node.js backend, web frontend)
- **Frontend:** React with Vite
- **Media Processing:** FFmpeg (packaged binary via Node.js child processes)
- **Timeline UI:** Canvas-based rendering with Konva.js
- **Video Player:** HTML5 `<video>` element or Video.js
- **State Management:** Redux Toolkit
- **File Handling:** Node.js fs API and Electron's dialog API

### Key Components
1. **Media Engine:** Handles encoding, decoding, format conversion using packaged FFmpeg
2. **Timeline Controller:** Manages clip arrangement and editing operations
3. **Preview Renderer:** Real-time composition of timeline
4. **Export Pipeline:** Stitches clips and encodes final output
5. **File Import Manager:** Handles MOV file import and validation
6. **FFmpeg Manager:** Manages packaged FFmpeg binary and process execution

### Data Models

**MediaClip**
```
{
  id: string,
  filePath: string,
  duration: number,
  resolution: { width, height },
  thumbnail: string,
  metadata: object
}
```

**TimelineClip**
```
{
  id: string,
  mediaClipId: string,
  track: number,
  startTime: number,
  duration: number,
  trimIn: number,
  trimOut: number
}
```

---

## FFmpeg Packaging Requirements

### Binary Distribution
- **Packaged FFmpeg:** Include FFmpeg binary within Electron app bundle
- **No System Dependency:** Application must work without requiring user to install FFmpeg
- **macOS Architecture:** Support both Intel (x64) and Apple Silicon (arm64) architectures
- **Binary Location:** Store FFmpeg in `resources/ffmpeg/` within app bundle
- **Execution Path:** Use relative path from app bundle to locate FFmpeg binary

### FFmpeg Configuration
- **Codec Support:** H.264, H.265, AAC audio codecs
- **Format Support:** MP4, MOV input/output formats
- **Optimization:** Use hardware acceleration when available (VideoToolbox on macOS)
- **Size Optimization:** Use static build to minimize dependencies

### Implementation Details
- **Process Management:** Use Node.js `child_process` to execute FFmpeg commands
- **Error Handling:** Capture and parse FFmpeg output for error reporting
- **Progress Tracking:** Parse FFmpeg progress output for export progress bars
- **Resource Management:** Ensure FFmpeg processes are properly terminated

### macOS-Specific Considerations
- **Architecture Support:** Universal binary supporting both Intel (x64) and Apple Silicon (arm64)
- **Code Signing:** Proper code signing for macOS distribution
- **Notarization:** Apple notarization for distribution outside App Store
- **Sandboxing:** Respect macOS sandboxing requirements
- **Hardware Acceleration:** Utilize VideoToolbox for hardware-accelerated encoding
- **File Permissions:** Handle macOS file system permissions properly
- **App Bundle Structure:** Follow macOS app bundle conventions

---

## User Interface Design

### Main Window Layout
- **Top:** Menu bar and toolbar (import, record, export buttons)
- **Left:** Media library panel (collapsible)
- **Center-Top:** Preview window with playback controls
- **Center-Bottom:** Timeline editor with tracks
- **Right:** Properties panel for selected clip (optional)

### Visual Hierarchy
- Primary actions: Large, prominent buttons (Record, Export)
- Secondary actions: Smaller icons in toolbar
- Timeline takes majority of bottom half
- Preview sized for 16:9 aspect ratio

### Interaction Patterns
- Drag and drop for all media operations (from library or file system)
- Right-click context menus on clips
- Hover tooltips for unfamiliar icons
- Confirmation dialogs for destructive actions

---

## Testing Scenarios

### Basic Workflow Test
1. Launch application
2. Import 3 video clips via drag and drop
3. Drag clips to timeline in sequence
4. Trim second clip by 5 seconds
5. Split first clip at 10-second mark
6. Export timeline as 1080p MP4
7. Verify exported video plays correctly

### Direct File System Import Test
1. Launch application
2. Drag video file directly from file explorer to timeline
3. Verify clip loads and plays
4. Drag additional file from file system to media library
5. Verify both workflows work correctly

### Recording Test
1. Click screen record button
2. Select custom region
3. Record for 30 seconds
4. Stop recording
5. Verify clip appears in media library
6. Drag to timeline and export

### Complex Edit Test
1. Import 5 clips of varying lengths
2. Arrange on timeline with gaps
3. Trim multiple clips
4. Split clips at various points
5. Rearrange clip order
6. Add audio track
7. Export and verify no sync issues

### Stress Test
1. Import 15+ video clips
2. Add all to timeline
3. Perform multiple edits (trim, split, move)
4. Scrub through timeline rapidly
5. Verify UI remains responsive
6. Export long video (5+ minutes)

### Edge Cases
- Import corrupted video file
- Export with no clips on timeline
- Record with no camera/microphone available
- Fill timeline with 50+ clips
- Export while timeline is playing
- Drag unsupported file format to timeline

---

## Success Criteria

### MVP Gate (Must Have)
- ✓ Desktop app launches
- ✓ Import video files (MP4/MOV)
- ✓ Timeline displays imported clips
- ✓ Preview player works
- ✓ Trim functionality (in/out points)
- ✓ Export to MP4
- ✓ Packaged as native app

### Phase 1 Complete (Core Features)
- ✓ Screen recording (custom region)
- ✓ Webcam recording
- ✓ Audio capture (mic + system)
- ✓ Media library with thumbnails
- ✓ Multi-track timeline
- ✓ Trim, split, delete clips
- ✓ Real-time preview playback
- ✓ Export with resolution options
- ✓ Progress indicator during export
- ✓ Drag and drop from file system to timeline

### Quality Bar
- ✓ No crashes during normal use
- ✓ Responsive UI with 10+ clips
- ✓ Smooth preview playback (30fps)
- ✓ Successful export without corruption
- ✓ Works on macOS (Intel and Apple Silicon)
- ✓ Local crash reporting for development

---

## Deliverables

1. **GitHub Repository**
   - Source code
   - README with setup instructions
   - Architecture documentation
   - Build instructions

2. **Demo Video (3-5 minutes)**
   - Show import workflow
   - Demonstrate recording
   - Edit clips on timeline
   - Export final video

3. **Packaged Application**
   - Distributable for macOS (.dmg or .app)
   - Includes packaged FFmpeg binary
   - Download links or build instructions

4. **Documentation**
   - User guide (how to use the app)
   - Developer guide (how to build/modify)
   - Known issues and limitations
