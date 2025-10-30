import { RecordingOptions } from '../types/recording';

export class SimpleWebcamRecorder {
  private isRecording = false;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  /**
   * Get the best supported mime type for MediaRecorder
   */
  private getSupportedMimeType(): string {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log('Selected mime type:', type);
        return type;
      }
    }

    console.warn('No preferred mime types supported, using default');
    return 'video/webm';
  }

  /**
   * Get video constraints based on quality setting
   */
  private getVideoConstraints(quality: string = 'high'): MediaTrackConstraints {
    const qualitySettings: Record<string, MediaTrackConstraints> = {
      low: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24 }
      },
      medium: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      },
      high: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 }
      },
      maximum: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 60 }
      }
    };

    return qualitySettings[quality] || qualitySettings.high;
  }

  /**
   * Get bitrate based on quality setting
   */
  private getBitrate(quality: string = 'high'): number {
    const bitrateSettings: Record<string, number> = {
      low: 1000000,      // 1 Mbps
      medium: 2500000,   // 2.5 Mbps
      high: 5000000,     // 5 Mbps
      maximum: 8000000   // 8 Mbps
    };

    return bitrateSettings[quality] || bitrateSettings.high;
  }

  async startRecording(options: RecordingOptions, previewElement?: HTMLVideoElement): Promise<void> {
    console.log('SimpleWebcamRecorder.startRecording called with options:', options);

    if (this.isRecording) {
      throw new Error('Recording is already in progress');
    }

    try {
      // Get video constraints based on quality
      const videoConstraints = this.getVideoConstraints(options.quality || 'high');

      // Get webcam stream
      const constraints: MediaStreamConstraints = {
        video: videoConstraints,
        audio: options.audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000
        } : false
      };

      console.log('Requesting webcam with constraints:', constraints);
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Webcam stream obtained:', this.stream);
      console.log('Video track settings:', this.stream.getVideoTracks()[0]?.getSettings());

      // If a preview element is provided, attach the stream
      if (previewElement) {
        previewElement.srcObject = this.stream;
        previewElement.play();
        console.log('Webcam stream attached to preview element');
      }

      // Get supported mime type
      const mimeType = this.getSupportedMimeType();
      const bitrate = this.getBitrate(options.quality || 'high');

      // Set up MediaRecorder with proper options
      const recorderOptions: MediaRecorderOptions = {
        mimeType: mimeType,
        videoBitsPerSecond: bitrate
      };

      console.log('MediaRecorder options:', recorderOptions);
      this.mediaRecorder = new MediaRecorder(this.stream, recorderOptions);
      this.recordedChunks = [];

      // Handle data available event
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
          console.log('Data chunk received, size:', event.data.size, 'total chunks:', this.recordedChunks.length);
        }
      };

      // Handle recording stop event
      this.mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped');
        this.isRecording = false;
      };

      // Handle errors
      this.mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        this.isRecording = false;
      };

      // Start recording - don't specify timeslice to let browser optimize
      this.mediaRecorder.start();
      this.isRecording = true;
      console.log('Webcam recording started with mime type:', mimeType);
      console.log('MediaRecorder state:', this.mediaRecorder.state);

    } catch (error) {
      console.error('Failed to start webcam recording:', error);
      this.isRecording = false;
      this.cleanup();
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to start webcam recording: ${errorMessage}`);
    }
  }

  async stopRecording(): Promise<Blob> {
    console.log('SimpleWebcamRecorder.stopRecording called');

    if (!this.isRecording || !this.mediaRecorder) {
      throw new Error('No recording in progress');
    }

    try {
      console.log('Stopping webcam recording...');
      console.log('MediaRecorder state:', this.mediaRecorder.state);
      console.log('Current chunks before stop:', this.recordedChunks.length);

      const mimeType = this.mediaRecorder.mimeType;
      console.log('Recording mime type:', mimeType);

      // Stop the MediaRecorder and wait for final chunks
      const blob = await new Promise<Blob>((resolve, reject) => {
        if (!this.mediaRecorder) {
          reject(new Error('MediaRecorder is null'));
          return;
        }

        const timeout = setTimeout(() => {
          console.error('Timeout waiting for MediaRecorder to stop');
          reject(new Error('Timeout waiting for recording to stop'));
        }, 10000);

        this.mediaRecorder.onstop = () => {
          clearTimeout(timeout);
          console.log('MediaRecorder stopped, total chunks collected:', this.recordedChunks.length);

          // Log chunk sizes
          const chunkSizes = this.recordedChunks.map(c => c.size);
          console.log('Chunk sizes:', chunkSizes);
          console.log('Total data size:', chunkSizes.reduce((a, b) => a + b, 0));

          this.isRecording = false;

          // Ensure we have data
          if (this.recordedChunks.length === 0) {
            reject(new Error('No data was recorded'));
            return;
          }

          // Create blob from recorded chunks with the correct mime type
          const resultBlob = new Blob(this.recordedChunks, {
            type: mimeType || 'video/webm'
          });

          console.log('Recording blob created:');
          console.log('  - Size:', resultBlob.size, 'bytes');
          console.log('  - Type:', resultBlob.type);
          console.log('  - Chunks:', this.recordedChunks.length);

          // Validate blob has data
          if (resultBlob.size === 0) {
            reject(new Error('Recording blob is empty'));
            return;
          }

          resolve(resultBlob);
        };

        this.mediaRecorder.onerror = (event: Event) => {
          clearTimeout(timeout);
          console.error('MediaRecorder error during stop:', event);
          reject(new Error('MediaRecorder error'));
        };

        // Stop the recorder
        console.log('Calling mediaRecorder.stop()...');
        this.mediaRecorder.stop();
      });

      // Don't cleanup immediately - keep stream for preview
      // Just clear the recorder reference
      this.mediaRecorder = null;
      this.recordedChunks = [];

      return blob;
    } catch (error) {
      console.error('Failed to stop webcam recording:', error);
      this.isRecording = false;
      this.cleanup();
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to stop webcam recording: ${errorMessage}`);
    }
  }

  private cleanup(): void {
    if (this.mediaRecorder) {
      this.mediaRecorder = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    this.recordedChunks = [];
    this.isRecording = false;
  }

  getRecordingStatus(): { isRecording: boolean } {
    return { isRecording: this.isRecording };
  }

  getStream(): MediaStream | null {
    return this.stream;
  }
}
