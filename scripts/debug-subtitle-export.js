/**
 * Debug script to check subtitle export flow
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Mock Electron environment
process.env.NODE_ENV = 'development';
process.resourcesPath = path.join(__dirname, '..', 'electron', 'resources');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ExportService = require('../electron/services/exportService');

// Simulate what happens during export
const testClips = [
  {
    id: 'test-clip',
    filePath: path.join(__dirname, '..', 'subtitle-test.mp4'),
    trimIn: 0,
    trimOut: 10,
    duration: 10,
    startTime: 0,
    hasAudio: true,
    hasVideo: true,
    subtitles: {
      srtContent: `1
00:00:00,000 --> 00:00:08,279
Hello, I am just testing the video with talking, so hello, I hope you're having a good day

2
00:00:08,279 --> 00:00:10,960
and I'll talk to you later, goodbye, love you.
`,
      generatedAt: Date.now()
    }
  }
];

async function debugExport() {
  console.log('🔍 Debugging Subtitle Export Flow\n');
  
  const exportService = new ExportService();
  
  console.log('1. Checking clip data:');
  console.log(`   Has subtitles: ${!!testClips[0].subtitles}`);
  console.log(`   Subtitles content length: ${testClips[0].subtitles?.srtContent?.length || 0}`);
  console.log(`   SRT preview: ${testClips[0].subtitles?.srtContent?.substring(0, 100)}...\n`);
  
  console.log('2. Preparing subtitles...');
  try {
    const tempSubtitleFiles = await exportService.prepareSubtitles(testClips);
    
    if (tempSubtitleFiles.length === 0) {
      console.log('   ❌ No subtitle files created!');
      console.log('   This means prepareSubtitles() is not finding subtitles in clips.\n');
      return;
    }
    
    console.log(`   ✅ Created ${tempSubtitleFiles.length} subtitle file(s)`);
    console.log(`   Path: ${tempSubtitleFiles[0]}\n`);
    
    // Read and verify the file
    const srtContent = fs.readFileSync(tempSubtitleFiles[0], 'utf8');
    console.log('3. Verifying subtitle file content:');
    console.log(`   File size: ${srtContent.length} bytes`);
    console.log(`   Subtitle blocks: ${srtContent.split('\\n\\n').filter(s => s.trim()).length}`);
    console.log(`   First 200 chars:\n${srtContent.substring(0, 200)}\n`);
    
    // Test FFmpeg command generation
    console.log('4. Testing FFmpeg command generation...');
    const outputPath = path.join(os.tmpdir(), 'debug_export.mp4');
    const ffmpegArgs = exportService.buildSingleTrackFFmpegCommand(
      testClips.map(c => ({
        filePath: c.filePath,
        trimIn: c.trimIn,
        trimOut: c.trimOut,
        duration: c.duration,
        startTime: c.startTime,
        hasAudio: c.hasAudio,
        hasVideo: c.hasVideo
      })),
      outputPath,
      {
        resolution: '1920x1080',
        framerate: 30,
        quality: 'high',
        codec: 'libx264',
        audioCodec: 'aac',
        container: 'mp4'
      },
      tempSubtitleFiles
    );
    
    // Check for subtitle filter
    const filterComplexIndex = ffmpegArgs.indexOf('-filter_complex');
    if (filterComplexIndex !== -1 && filterComplexIndex + 1 < ffmpegArgs.length) {
      const filterComplex = ffmpegArgs[filterComplexIndex + 1];
      console.log(`   Filter complex (first 300 chars):\n${filterComplex.substring(0, 300)}...\n`);
      
      if (filterComplex.includes('subtitles')) {
        console.log('   ✅ Subtitle filter found in FFmpeg command');
        
        // Extract the subtitle path from the filter
        const subtitleMatch = filterComplex.match(/subtitles='([^']+)'/);
        if (subtitleMatch) {
          console.log(`   Subtitle file path in filter: ${subtitleMatch[1]}`);
          
          // Check if file exists
          const filePath = subtitleMatch[1].replace(/\\:/g, ':').replace(/\\ /g, ' ').replace(/\\'/g, "'");
          console.log(`   Unescaped path: ${filePath}`);
          if (fs.existsSync(filePath)) {
            console.log('   ✅ Subtitle file exists at the path specified in filter');
          } else {
            console.log('   ❌ Subtitle file NOT found at the path specified in filter!');
          }
        }
      } else {
        console.log('   ❌ Subtitle filter NOT found in FFmpeg command!');
      }
    }
    
    // Cleanup
    tempSubtitleFiles.forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
    
  } catch (error) {
    console.error('   ❌ Error:', error.message);
    console.error(error.stack);
  }
}

debugExport();

