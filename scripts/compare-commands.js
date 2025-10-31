/**
 * Compare test FFmpeg command with what the app would generate
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

process.env.NODE_ENV = 'development';
process.resourcesPath = path.join(__dirname, '..', 'electron', 'resources');

const ExportService = require('../electron/services/exportService');

// Simulate what the app does for a single clip export
const videoPath = path.join(__dirname, '..', 'subtitle-test.mp4');
const outputPath = path.join(os.tmpdir(), 'app_export_test.mp4');

// Mock subtitle content (what would come from Redux after generation)
const mockSubtitles = {
  srtContent: `1
00:00:00,000 --> 00:00:08,279
Hello, I am just testing the video with talking, so hello, I hope you're having a good day

2
00:00:08,279 --> 00:00:10,960
and I'll talk to you later, goodbye, love you.
`,
  generatedAt: Date.now()
};

async function compareCommands() {
  console.log('🔍 Comparing Test vs App Export Commands\n');
  console.log('='.repeat(60));
  
  const exportService = new ExportService();
  
  // Simulate app export scenario: single clip, no trimming
  const appClips = [
    {
      id: 'clip-1',
      filePath: videoPath,
      trimIn: 0,
      trimOut: 30,
      duration: 30,
      startTime: 0,
      hasAudio: true,
      hasVideo: true,
      subtitles: mockSubtitles
    }
  ];
  
  console.log('\n1. Preparing subtitles (app scenario)...');
  const tempSubtitleFiles = await exportService.prepareSubtitles(appClips);
  
  if (tempSubtitleFiles.length === 0) {
    console.error('❌ Failed to prepare subtitle files');
    return;
  }
  
  console.log(`✅ Subtitle file: ${tempSubtitleFiles[0]}`);
  
  // Check file content
  const srtContent = fs.readFileSync(tempSubtitleFiles[0], 'utf8');
  console.log(`   Size: ${srtContent.length} bytes`);
  console.log(`   First 150 chars:\n   ${srtContent.substring(0, 150)}...\n`);
  
  console.log('2. Building FFmpeg command (app scenario)...');
  const appFFmpegArgs = exportService.buildSingleTrackFFmpegCommand(
    appClips.map(c => ({
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
  
  console.log('\n3. App FFmpeg Command Structure:');
  console.log(`   Total args: ${appFFmpegArgs.length}`);
  
  const filterComplexIndex = appFFmpegArgs.indexOf('-filter_complex');
  if (filterComplexIndex !== -1) {
    const filterComplex = appFFmpegArgs[filterComplexIndex + 1];
    console.log(`\n   Filter Complex:`);
    console.log(`   ${filterComplex}\n`);
    
    // Check for subtitles
    if (filterComplex.includes('subtitles')) {
      console.log('   ✅ Subtitle filter found');
      
      // Extract subtitle path
      const subtitleMatch = filterComplex.match(/subtitles='([^']+)'/);
      if (subtitleMatch) {
        const subtitlePathInFilter = subtitleMatch[1];
        console.log(`   Subtitle path in filter: ${subtitlePathInFilter}`);
        
        // Check if it matches our file
        if (subtitlePathInFilter === tempSubtitleFiles[0]) {
          console.log('   ✅ Path matches subtitle file');
        } else {
          console.log(`   ⚠️  Path mismatch!`);
          console.log(`      Expected: ${tempSubtitleFiles[0]}`);
          console.log(`      Got:      ${subtitlePathInFilter}`);
        }
      }
    } else {
      console.log('   ❌ Subtitle filter NOT found!');
    }
    
    // Check mapping
    const mapIndex = appFFmpegArgs.indexOf('-map');
    if (mapIndex !== -1) {
      console.log(`\n   Map targets:`);
      for (let i = mapIndex; i < appFFmpegArgs.length && i < mapIndex + 4; i++) {
        if (appFFmpegArgs[i] === '-map') {
          console.log(`     -map ${appFFmpegArgs[i + 1]}`);
        }
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Command comparison complete\n');
  console.log('💡 Check the filter_complex above - it should include:');
  console.log('   [outv]subtitles=\'...path...\'[subtitled]');
  console.log('\n   And the -map should reference [subtitled] not [outv]\n');
  
  // Cleanup
  tempSubtitleFiles.forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
}

compareCommands().catch(console.error);

