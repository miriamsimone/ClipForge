/**
 * Full end-to-end test that actually runs FFmpeg export with subtitles
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Mock Electron environment
process.env.NODE_ENV = 'development';
process.resourcesPath = path.join(__dirname, '..', 'electron', 'resources');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SubtitleService = require('../electron/services/subtitleService');
const ExportService = require('../electron/services/exportService');
const FFmpegService = require('../electron/services/ffmpegService');

async function runFullExportTest() {
  console.log('🚀 Full End-to-End Export Test with Real FFmpeg\n');
  console.log('=' .repeat(60) + '\n');
  
  const videoPath = process.argv[2] || path.join(__dirname, '..', 'subtitle-test.mp4');
  
  if (!fs.existsSync(videoPath)) {
    console.error(`❌ Video file not found: ${videoPath}`);
    process.exit(1);
  }
  
  console.log(`📹 Using video: ${videoPath}\n`);
  
  // Step 1: Generate subtitles
  console.log('Step 1: Generating subtitles...');
  const subtitleService = new SubtitleService();
  
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not set in .env file');
    process.exit(1);
  }
  
  let srtContent;
  try {
    srtContent = await subtitleService.generateSubtitles(videoPath);
    const subtitleCount = srtContent.split('\n\n').filter(s => s.trim()).length;
    console.log(`✅ Generated ${subtitleCount} subtitle entries\n`);
    
    // Show preview
    const preview = srtContent.split('\n').slice(0, 10).join('\n');
    console.log('Preview:');
    console.log(preview);
    console.log('...\n');
  } catch (error) {
    console.error(`❌ Subtitle generation failed: ${error.message}`);
    process.exit(1);
  }
  
  // Step 2: Prepare export with subtitles
  console.log('\nStep 2: Preparing export...');
  const exportService = new ExportService();
  
  const testClips = [
    {
      id: 'test-clip-1',
      filePath: videoPath,
      trimIn: 0,
      trimOut: 30, // First 30 seconds
      duration: 30,
      startTime: 0,
      hasAudio: true,
      hasVideo: true,
      subtitles: {
        srtContent: srtContent,
        generatedAt: Date.now()
      }
    }
  ];
  
  // Prepare subtitle files
  const tempSubtitleFiles = await exportService.prepareSubtitles(testClips);
  if (tempSubtitleFiles.length === 0) {
    console.error('❌ Failed to prepare subtitle files');
    process.exit(1);
  }
  
  console.log(`✅ Prepared subtitle file: ${tempSubtitleFiles[0]}`);
  
  // Verify subtitle file
  const subtitleFileContent = fs.readFileSync(tempSubtitleFiles[0], 'utf8');
  console.log(`   File size: ${subtitleFileContent.length} bytes`);
  console.log(`   Subtitle entries: ${subtitleFileContent.split('\n\n').filter(s => s.trim()).length}\n`);
  
  // Step 3: Build FFmpeg command
  console.log('Step 3: Building FFmpeg export command...');
  const outputPath = path.join(os.tmpdir(), `test_export_with_subtitles_${Date.now()}.mp4`);
  
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
  
  // Check if subtitle filter is included
  const filterComplexIndex = ffmpegArgs.indexOf('-filter_complex');
  if (filterComplexIndex === -1) {
    console.error('❌ FFmpeg command missing -filter_complex');
    process.exit(1);
  }
  
  const filterComplex = ffmpegArgs[filterComplexIndex + 1];
  if (!filterComplex.includes('subtitles')) {
    console.error('❌ FFmpeg command missing subtitle filter!');
    console.log('Filter complex:', filterComplex.substring(0, 200));
    process.exit(1);
  }
  
  console.log('✅ FFmpeg command includes subtitle filter');
  console.log(`   Output will be: ${outputPath}\n`);
  
  // Show the command (first 500 chars)
  const commandPreview = ffmpegArgs.slice(0, 10).join(' ') + ' ... [filter_complex] ...';
  console.log('Command preview:', commandPreview);
  console.log('   (Full command logged below)\n');
  
  // Step 4: Actually run FFmpeg export
  console.log('Step 4: Running FFmpeg export (this may take a minute)...\n');
  
  const ffmpegService = new FFmpegService();
  
  try {
    console.log('Executing FFmpeg command...');
    const startTime = Date.now();
    
    const result = await ffmpegService.executeCommand(ffmpegArgs);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    if (result.success) {
      console.log(`\n✅ Export completed successfully in ${duration}s!`);
      
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log(`✅ Output file created: ${outputPath}`);
        console.log(`   File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        
        console.log('\n' + '='.repeat(60));
        console.log('\n🎉 SUCCESS! Video exported with subtitles!\n');
        console.log(`📁 Output file: ${outputPath}`);
        console.log('\n💡 Next steps:');
        console.log('   1. Open the exported video in a video player');
        console.log('   2. Verify subtitles are visible during playback');
        console.log('   3. If subtitles appear, the feature is working correctly!');
        console.log('   4. If not, check the FFmpeg error output above\n');
      } else {
        console.log('⚠️  Export completed but output file not found');
      }
    } else {
      console.error('❌ FFmpeg export failed');
      console.error('Stderr:', result.stderr);
    }
    
    // Cleanup temp subtitle file
    tempSubtitleFiles.forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
    
  } catch (error) {
    console.error(`\n❌ Export failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
runFullExportTest().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});

