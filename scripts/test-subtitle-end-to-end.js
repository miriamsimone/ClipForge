/**
 * End-to-end test for subtitle generation and export
 * Tests actual subtitle service, OpenAI API, and export integration
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Mock Electron environment variables for testing
process.env.NODE_ENV = 'development';
process.resourcesPath = path.join(__dirname, '..', 'electron', 'resources');

// Import services
const SubtitleService = require('../electron/services/subtitleService');
const ExportService = require('../electron/services/exportService');

async function testSubtitleService() {
  console.log('\n=== Testing Subtitle Service ===\n');
  
  const subtitleService = new SubtitleService();
  
  // Check API key
  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️  OPENAI_API_KEY not set in environment or .env file');
    console.log('   Make sure .env file exists in project root with: OPENAI_API_KEY=your_key_here');
    return { skipped: true };
  }
  
  console.log('✅ OpenAI API key found (loaded from .env)');
  
  // Check command line argument first (highest priority)
  let testVideoPath = null;
  
  if (process.argv[2]) {
    testVideoPath = path.resolve(process.argv[2]);
    if (!fs.existsSync(testVideoPath)) {
      console.log(`❌ File not found: ${testVideoPath}`);
      return { skipped: true };
    }
    console.log(`📹 Using provided video: ${testVideoPath}`);
  } else {
    // Try to find any video file for testing
    const desktop = path.join(os.homedir(), 'Desktop');
    if (fs.existsSync(desktop)) {
      const files = fs.readdirSync(desktop);
      const videoFile = files.find(f => /\.(mp4|mov|avi|mkv)$/i.test(f));
      if (videoFile) {
        testVideoPath = path.join(desktop, videoFile);
        console.log(`📹 Found test video on Desktop: ${testVideoPath}`);
      }
    }
    
    if (!testVideoPath) {
      console.log('⚠️  No test video file found');
      console.log('   Please provide a video path as argument: node test-subtitle-end-to-end.js /path/to/video.mp4');
      return { skipped: true };
    }
  }
  
  // Check if file has audio
  console.log('\n📝 Starting subtitle generation...');
  console.log('   This may take 1-2 minutes depending on video length...\n');
  
  try {
    const startTime = Date.now();
    const srtContent = await subtitleService.generateSubtitles(testVideoPath);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`✅ Subtitle generation completed in ${duration}s`);
    
    const subtitleBlocks = srtContent.split('\n\n').filter(s => s.trim());
    console.log(`   Generated ${subtitleBlocks.length} subtitle entries`);
    
    if (subtitleBlocks.length === 0) {
      console.log('\n   ⚠️  No subtitles generated (video may be silent or have no speech)');
      console.log(`   SRT content length: ${srtContent.length} characters`);
      console.log(`   SRT preview: "${srtContent.substring(0, 100)}"`);
    } else {
      // Show first few lines of SRT
      const lines = srtContent.split('\n').slice(0, 15);
      console.log('\n   Preview of generated subtitles:');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`   ${line}`);
        }
      });
      if (srtContent.split('\n').length > 15) {
        console.log('   ...');
      }
    }
    
    // Save test SRT file
    const testSrtPath = path.join(os.tmpdir(), `test_subtitles_${Date.now()}.srt`);
    fs.writeFileSync(testSrtPath, srtContent);
    console.log(`\n✅ Saved test SRT file: ${testSrtPath}`);
    
    return {
      success: true,
      srtContent,
      srtPath: testSrtPath,
      videoPath: testVideoPath
    };
  } catch (error) {
    console.error(`\n❌ Subtitle generation failed: ${error.message}`);
    if (error.message.includes('API key')) {
      console.log('   Make sure OPENAI_API_KEY is set correctly');
    } else if (error.message.includes('no audio')) {
      console.log('   Video file has no audio track');
    } else if (error.message.includes('API request failed')) {
      console.log('   OpenAI API request failed - check your API key and internet connection');
    }
    return { success: false, error: error.message };
  }
}

async function testExportWithSubtitles(testData) {
  console.log('\n=== Testing Export with Subtitles ===\n');
  
  if (!testData || !testData.success) {
    console.log('⚠️  Skipping export test - subtitle generation failed or skipped');
    return { skipped: true };
  }
  
  const exportService = new ExportService();
  
  // Create a mock timeline clip with subtitles
  const testClips = [
    {
      id: 'test-clip-1',
      filePath: testData.videoPath,
      trimIn: 0,
      trimOut: 10, // First 10 seconds
      duration: 10,
      startTime: 0,
      hasAudio: true,
      hasVideo: true,
      subtitles: {
        srtContent: testData.srtContent,
        generatedAt: Date.now()
      }
    }
  ];
  
  console.log('📦 Preparing subtitles for export...');
  
  try {
    // Check if we have valid subtitle content
    if (!testData.srtContent || testData.srtContent.trim().length === 0) {
      console.log('⚠️  No subtitle content to prepare (video may be silent)');
      console.log('   Creating mock subtitles for export test...');
      
      // Create mock subtitles for testing export functionality
      testClips[0].subtitles.srtContent = `1
00:00:00,000 --> 00:00:03,000
Test subtitle line one

2
00:00:03,000 --> 00:00:06,000
Test subtitle line two
`;
    }
    
    // Test subtitle preparation
    const tempSubtitleFiles = await exportService.prepareSubtitles(testClips);
    
    if (tempSubtitleFiles.length === 0) {
      console.log('❌ No subtitle files were prepared');
      return { success: false };
    }
    
    console.log(`✅ Prepared ${tempSubtitleFiles.length} subtitle file(s)`);
    console.log(`   Path: ${tempSubtitleFiles[0]}`);
    
    // Verify file exists and has content
    if (fs.existsSync(tempSubtitleFiles[0])) {
      const stats = fs.statSync(tempSubtitleFiles[0]);
      const content = fs.readFileSync(tempSubtitleFiles[0], 'utf8');
      console.log(`   File size: ${stats.size} bytes`);
      console.log(`   Contains ${content.split('\n\n').filter(s => s.trim()).length} subtitle entries`);
      
      // Test SRT adjustment logic
      console.log('\n📐 Testing SRT timestamp adjustment...');
      const adjustedSrt = exportService.adjustSRTTimestamps(
        testData.srtContent,
        5, // trimIn: start at 5 seconds
        2  // timelineStart: place at 2 seconds on timeline
      );
      
      console.log(`   Adjusted ${adjustedSrt.split('\n\n').filter(s => s.trim()).length} subtitle entries`);
      
      // Verify adjustment worked
      if (adjustedSrt.includes('00:00:02') || adjustedSrt.includes('00:00:07')) {
        console.log('✅ Timestamp adjustment working correctly');
      }
    }
    
    // Test FFmpeg command generation
    console.log('\n🎬 Testing FFmpeg command generation...');
    const outputPath = path.join(os.tmpdir(), `test_export_${Date.now()}.mp4`);
    
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
    const hasSubtitleFilter = ffmpegArgs.some(arg => typeof arg === 'string' && arg.includes('subtitles'));
    
    if (hasSubtitleFilter) {
      console.log('✅ FFmpeg command includes subtitle filter');
      const filterIndex = ffmpegArgs.findIndex(arg => typeof arg === 'string' && arg.includes('subtitles'));
      if (filterIndex !== -1) {
        const filterComplex = ffmpegArgs[filterIndex === ffmpegArgs.indexOf('-filter_complex') + 1 ? filterIndex + 1 : -1];
        if (typeof filterComplex === 'string') {
          console.log('   Filter preview:', filterComplex.substring(0, 100) + '...');
        }
      }
    } else {
      console.log('❌ FFmpeg command missing subtitle filter');
      return { success: false };
    }
    
    console.log(`\n✅ Export command generation successful`);
    console.log(`   Output would be: ${outputPath}`);
    console.log(`   (Skipping actual export to avoid long processing time)`);
    
    // Cleanup temp subtitle files
    tempSubtitleFiles.forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
    
    return {
      success: true,
      ffmpegArgs,
      outputPath
    };
  } catch (error) {
    console.error(`\n❌ Export test failed: ${error.message}`);
    console.error(error.stack);
    return { success: false, error: error.message };
  }
}

async function runEndToEndTests() {
  console.log('🚀 Starting End-to-End Subtitle Export Tests...\n');
  console.log('=' .repeat(60));
  
  const results = {
    subtitleGeneration: null,
    exportTest: null
  };
  
  // Test 1: Subtitle generation
  results.subtitleGeneration = await testSubtitleService();
  
  // Test 2: Export with subtitles
  results.exportTest = await testExportWithSubtitles(results.subtitleGeneration);
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary:\n');
  
  if (results.subtitleGeneration.skipped) {
    console.log('⚠️  Subtitle Generation: SKIPPED (need video file or API key)');
  } else if (results.subtitleGeneration.success) {
    console.log('✅ Subtitle Generation: PASSED');
  } else {
    console.log('❌ Subtitle Generation: FAILED');
    console.log(`   Error: ${results.subtitleGeneration.error}`);
  }
  
  if (results.exportTest?.skipped) {
    console.log('⚠️  Export Test: SKIPPED');
  } else if (results.exportTest?.success) {
    console.log('✅ Export Test: PASSED');
  } else {
    console.log('❌ Export Test: FAILED');
    if (results.exportTest?.error) {
      console.log(`   Error: ${results.exportTest.error}`);
    }
  }
  
  const allPassed = 
    (results.subtitleGeneration.success || results.subtitleGeneration.skipped) &&
    (results.exportTest?.success || results.exportTest?.skipped);
  
  if (allPassed) {
    console.log('\n✅ All end-to-end tests completed!\n');
    console.log('💡 Next steps:');
    console.log('   1. Open the ClipForge app');
    console.log('   2. Import a video with audio');
    console.log('   3. Click "Generate Subtitles" on a clip');
    console.log('   4. Add clip to timeline and export');
    console.log('   5. Check exported video for embedded subtitles\n');
    
    // Cleanup test files
    if (results.subtitleGeneration.srtPath && fs.existsSync(results.subtitleGeneration.srtPath)) {
      fs.unlinkSync(results.subtitleGeneration.srtPath);
    }
    
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed.\n');
    process.exit(1);
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled error:', error);
  process.exit(1);
});

// Run tests
runEndToEndTests().catch(error => {
  console.error('\n❌ Test runner failed:', error);
  process.exit(1);
});

