const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFMPEG_URLS = {
  x64: 'https://evermeet.cx/ffmpeg/ffmpeg-6.0.zip',
  arm64: 'https://evermeet.cx/ffmpeg/ffmpeg-6.0.zip' // Same binary works for both architectures
};

async function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
      
      file.on('error', (err) => {
        fs.unlink(outputPath, () => {}); // Delete the file on error
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function downloadFFmpeg() {
  console.log('🎬 Downloading FFmpeg binaries for ClipForge...');
  
  const resourcesDir = path.join(__dirname, '..', 'electron', 'resources', 'ffmpeg');
  
  // Create resources directory if it doesn't exist
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
    console.log(`📁 Created directory: ${resourcesDir}`);
  }

  const architectures = [
    { name: 'x64', url: FFMPEG_URLS.x64 },
    { name: 'arm64', url: FFMPEG_URLS.arm64 }
  ];

  for (const arch of architectures) {
    const zipPath = path.join(resourcesDir, `ffmpeg-${arch.name}.zip`);
    const binaryPath = path.join(resourcesDir, `ffmpeg-${arch.name}`);
    
    // Skip if binary already exists
    if (fs.existsSync(binaryPath)) {
      console.log(`✅ FFmpeg ${arch.name} already exists, skipping...`);
      continue;
    }

    try {
      console.log(`📥 Downloading FFmpeg for ${arch.name}...`);
      await downloadFile(arch.url, zipPath);
      
      console.log(`📦 Extracting FFmpeg ${arch.name}...`);
      execSync(`unzip -o "${zipPath}" -d "${resourcesDir}"`);
      
      // Move the extracted binary to the correct name
      const extractedPath = path.join(resourcesDir, 'ffmpeg');
      if (fs.existsSync(extractedPath)) {
        fs.renameSync(extractedPath, binaryPath);
      }
      
      // Make binary executable
      fs.chmodSync(binaryPath, '755');
      
      // Clean up zip file
      fs.unlinkSync(zipPath);
      
      console.log(`✅ FFmpeg ${arch.name} downloaded and configured successfully`);
    } catch (error) {
      console.error(`❌ Failed to download FFmpeg ${arch.name}:`, error.message);
      
      // Clean up on error
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    }
  }

  console.log('🎉 FFmpeg setup complete!');
}

// Run the download if this script is executed directly
if (require.main === module) {
  downloadFFmpeg().catch(console.error);
}

module.exports = { downloadFFmpeg };
