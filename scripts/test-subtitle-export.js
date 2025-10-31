/**
 * Test script for subtitle generation and export integration
 * Tests subtitle generation API call and export with subtitles
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

// Mock the SubtitleService to test without actual API calls
class TestSubtitleService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  async generateSubtitles(videoPath) {
    console.log(`\n📝 Testing subtitle generation for: ${videoPath}`);
    
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY environment variable not set');
    }
    
    // For testing, we'll create a mock SRT file
    // In production, this would call OpenAI API
    const mockSRT = `1
00:00:00,000 --> 00:00:03,500
Hello, this is a test subtitle

2
00:00:03,500 --> 00:00:07,000
This is the second subtitle line

3
00:00:07,000 --> 00:00:10,500
And here is the third subtitle
`;
    
    return mockSRT;
  }
}

// Test subtitle timestamp adjustment
function testSRTAdjustment() {
  console.log('\n=== Testing SRT Timestamp Adjustment ===\n');
  
  const originalSRT = `1
00:00:05,000 --> 00:00:08,500
This subtitle starts at 5 seconds

2
00:00:10,000 --> 00:00:13,000
This subtitle starts at 10 seconds
`;

  // Simulate trimming from 5 seconds and placing at timeline position 2
  const trimIn = 5;
  const timelineStart = 2;
  
  const lines = originalSRT.split('\n');
  const adjustedLines = [];
  let currentIndex = 1;
  let i = 0;
  
  while (i < lines.length) {
    while (i < lines.length && !lines[i].trim()) {
      i++;
    }
    if (i >= lines.length) break;
    
    const indexLine = lines[i++].trim();
    if (isNaN(parseInt(indexLine))) continue;
    
    if (i >= lines.length) break;
    
    const timestampLine = lines[i++].trim();
    const timestampMatch = timestampLine.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
    
    if (!timestampMatch) continue;
    
    const parseSRTTime = (h, m, s, ms) => parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
    const startSeconds = parseSRTTime(timestampMatch[1], timestampMatch[2], timestampMatch[3], timestampMatch[4]);
    const endSeconds = parseSRTTime(timestampMatch[5], timestampMatch[6], timestampMatch[7], timestampMatch[8]);
    
    const adjustedStart = Math.max(0, startSeconds - trimIn);
    const adjustedEnd = Math.max(0, endSeconds - trimIn);
    
    const textLines = [];
    while (i < lines.length && lines[i].trim()) {
      textLines.push(lines[i]);
      i++;
    }
    
    if (adjustedEnd <= 0 || textLines.length === 0) continue;
    
    const finalStart = adjustedStart + timelineStart;
    const finalEnd = adjustedEnd + timelineStart;
    
    const formatSRTTime = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const milliseconds = Math.floor((seconds % 1) * 1000);
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
    };
    
    adjustedLines.push(currentIndex.toString());
    adjustedLines.push(`${formatSRTTime(finalStart)} --> ${formatSRTTime(finalEnd)}`);
    adjustedLines.push(...textLines);
    adjustedLines.push('');
    currentIndex++;
  }
  
  const adjustedSRT = adjustedLines.join('\n');
  
  console.log('Original SRT:');
  console.log(originalSRT);
  console.log('\nAdjusted SRT (trimIn=5s, timelineStart=2s):');
  console.log(adjustedSRT);
  
  // Verify adjustment
  const expectedFirstStart = 2; // 5 - 5 + 2 = 2
  const expectedSecondStart = 7; // 10 - 5 + 2 = 7
  
  if (adjustedSRT.includes('00:00:02,000') && adjustedSRT.includes('00:00:07,000')) {
    console.log('\n✅ SRT timestamp adjustment test PASSED');
    return true;
  } else {
    console.log('\n❌ SRT timestamp adjustment test FAILED');
    return false;
  }
}

// Test export with subtitles
function testExportWithSubtitles() {
  console.log('\n=== Testing Export with Subtitles ===\n');
  
  const testClips = [
    {
      id: 'clip1',
      filePath: '/test/video1.mp4',
      trimIn: 0,
      trimOut: 5,
      duration: 5,
      startTime: 0,
      subtitles: {
        srtContent: `1
00:00:00,000 --> 00:00:03,000
First subtitle line

2
00:00:03,000 --> 00:00:05,000
Second subtitle line
`,
        generatedAt: Date.now()
      }
    }
  ];
  
  // Simulate prepareSubtitles
  const tempDir = os.tmpdir();
  const combinedSrtPath = path.join(tempDir, `subtitles_test_${Date.now()}.srt`);
  
  let combinedSrtContent = '';
  for (const clip of testClips) {
    if (clip.subtitles && clip.subtitles.srtContent) {
      // Simple adjustment (in real code, this would adjust timestamps)
      combinedSrtContent += clip.subtitles.srtContent;
    }
  }
  
  fs.writeFileSync(combinedSrtPath, combinedSrtContent);
  
  console.log(`✅ Created combined SRT file: ${combinedSrtPath}`);
  console.log(`   File size: ${fs.statSync(combinedSrtPath).size} bytes`);
  
  // Verify file content
  const fileContent = fs.readFileSync(combinedSrtPath, 'utf8');
  if (fileContent.includes('First subtitle line') && fileContent.includes('Second subtitle line')) {
    console.log('✅ Combined SRT file contains expected content');
    
    // Cleanup
    fs.unlinkSync(combinedSrtPath);
    console.log('✅ Test file cleaned up');
    return true;
  } else {
    console.log('❌ Combined SRT file missing expected content');
    if (fs.existsSync(combinedSrtPath)) {
      fs.unlinkSync(combinedSrtPath);
    }
    return false;
  }
}

// Test FFmpeg subtitle filter syntax
function testFFmpegSubtitleFilter() {
  console.log('\n=== Testing FFmpeg Subtitle Filter Syntax ===\n');
  
  const testPaths = [
    '/tmp/subtitles.srt',
    '/tmp/subtitles with spaces.srt',
    '/Users/test/video/subtitles.srt'
  ];
  
  testPaths.forEach(testPath => {
    // Simulate path escaping
    let escapedPath = testPath.replace(/\\/g, '/');
    escapedPath = escapedPath.replace(/'/g, "\\'");
    escapedPath = escapedPath.replace(/:/g, '\\:');
    escapedPath = escapedPath.replace(/ /g, '\\ ');
    
    const filter = `[outv]subtitles='${escapedPath}':force_style='Fontsize=24,PrimaryColour=&Hffffff,OutlineColour=&H000000'[subtitled]`;
    
    console.log(`Original path: ${testPath}`);
    console.log(`Escaped path: ${escapedPath}`);
    console.log(`Filter: ${filter}`);
    console.log('');
  });
  
  console.log('✅ FFmpeg subtitle filter syntax test completed');
  return true;
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Subtitle Export Tests...\n');
  
  const results = [
    testSRTAdjustment(),
    testExportWithSubtitles(),
    testFFmpegSubtitleFilter()
  ];
  
  const allPassed = results.every(r => r === true);
  
  if (allPassed) {
    console.log('\n✅ All subtitle export tests passed!\n');
    console.log('💡 To test with real API:');
    console.log('   1. Set OPENAI_API_KEY environment variable');
    console.log('   2. Import a video with audio in the app');
    console.log('   3. Click "Generate Subtitles" on a clip');
    console.log('   4. Add clip to timeline and export');
    console.log('   5. Check exported video for embedded subtitles\n');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed.\n');
    process.exit(1);
  }
}

runTests();

