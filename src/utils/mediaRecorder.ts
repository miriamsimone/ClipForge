import { RecordingOptions } from '../types/recording';

export class ScreenRecorder {
  private isRecording = false;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  constructor() {
    console.log('ScreenRecorder constructor called, initial state:', this.isRecording);
    this.instanceId = Math.random().toString(36).substr(2, 9);
    console.log('ScreenRecorder instance ID:', this.instanceId);
  }

  private instanceId: string;

  async startRecording(_sourceId: string, options: RecordingOptions): Promise<void> {
    console.log('ScreenRecorder.startRecording called, current state:', this.isRecording);
    
    if (this.isRecording) {
      throw new Error('Recording is already in progress');
    }

    try {
      console.log('Starting screen recording via browser APIs...');
      this.stream = await this.acquireScreenStream(options);
      console.log('Screen stream obtained:', this.stream);

      // Set up MediaRecorder
      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        videoBitsPerSecond: this.getVideoBitrate(options.quality)
      });

      // Clear previous chunks
      this.recordedChunks = [];

      // Handle data available event
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
          console.log('Data chunk received, size:', event.data.size);
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

      // Start recording
      this.mediaRecorder.start(1000); // Collect data every second
      this.isRecording = true;
      console.log('Screen recording started with MediaRecorder');
      
    } catch (error) {
      console.error('Failed to start screen recording:', error);
      this.isRecording = false;
      this.cleanup();
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to start screen recording: ${errorMessage}`);
    }
  }

  async stopRecording(options?: RecordingOptions): Promise<Blob> {
    console.log('ScreenRecorder.stopRecording called, current state:', this.isRecording);
    
    if (!this.isRecording || !this.mediaRecorder) {
      throw new Error('No recording in progress');
    }

    try {
      console.log('Stopping screen recording...');
      console.log('Instance ID:', this.instanceId);

      // Stop the MediaRecorder
      this.mediaRecorder.stop();
      
      // Wait for the stop event to fire and chunks to be collected
      await new Promise<void>((resolve) => {
        if (this.mediaRecorder) {
          this.mediaRecorder.onstop = () => {
            console.log('MediaRecorder stopped, chunks collected:', this.recordedChunks.length);
            this.isRecording = false;
            resolve();
          };
        } else {
          resolve();
        }
      });

      // Create blob from recorded chunks
      const blob = new Blob(this.recordedChunks, { 
        type: this.mediaRecorder.mimeType || 'video/webm' 
      });
      
      console.log('Recording blob created, size:', blob.size);
      console.log('ScreenRecorder state set to false');
      
      // Cleanup
      this.cleanup();
      
      return blob;
    } catch (error) {
      console.error('Failed to stop screen recording:', error);
      this.isRecording = false;
      this.cleanup();
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to stop screen recording: ${errorMessage}`);
    }
  }

  private getSupportedMimeType(): string {
    const types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log('Using MIME type:', type);
        return type;
      }
    }

    console.log('Using fallback MIME type: video/webm');
    return 'video/webm';
  }

  private async acquireScreenStream(options: RecordingOptions): Promise<MediaStream> {
    if (!navigator.mediaDevices) {
      throw new Error('Media capture APIs are unavailable in this environment');
    }

    const supportsGetDisplayMedia = typeof navigator.mediaDevices.getDisplayMedia === 'function';
    console.log('getDisplayMedia support detected:', supportsGetDisplayMedia);

    if (supportsGetDisplayMedia) {
      return this.acquireWithGetDisplayMedia(options);
    }

    console.warn('getDisplayMedia not available, falling back to desktopCapturer stream');
    return this.acquireWithDesktopCapturer(options);
  }

  private async acquireWithGetDisplayMedia(options: RecordingOptions): Promise<MediaStream> {
    const preferredConstraints: MediaStreamConstraints = {
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: options.frameRate || 30 }
      },
      audio: options.audio ? {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100
      } : false
    };

    console.log('Requesting getDisplayMedia with constraints:', preferredConstraints);

    try {
      return await navigator.mediaDevices.getDisplayMedia(preferredConstraints);
    } catch (error) {
      console.error('getDisplayMedia failed with specified constraints:', error);
      console.log('Retrying getDisplayMedia with minimal constraints');

      const minimalConstraints: MediaStreamConstraints = {
        video: true,
        audio: options.audio || false
      };

      return await navigator.mediaDevices.getDisplayMedia(minimalConstraints);
    }
  }

  private async acquireWithDesktopCapturer(options: RecordingOptions): Promise<MediaStream> {
    if (!window.electronAPI || !window.electronAPI.getScreenSources) {
      throw new Error('Screen capture fallback APIs are unavailable');
    }

    const sources = await window.electronAPI.getScreenSources();
    console.log('Available screen sources for fallback:', sources);

    if (!sources || sources.length === 0) {
      throw new Error('No screen sources available for recording');
    }

    const preferredSource =
      sources.find((source) => source.id.toLowerCase().includes('screen')) ?? sources[0];

    console.log('Selected fallback source:', preferredSource);

    const videoConstraints: any = {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: preferredSource.id,
        maxFrameRate: options.frameRate || 30
      }
    };

    const audioConstraints: any = options.audio
      ? {
          mandatory: {
            chromeMediaSource: 'desktop'
          }
        }
      : false;

    return await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: audioConstraints
    } as MediaStreamConstraints);
  }

  private getVideoBitrate(quality?: string): number {
    switch (quality) {
      case 'low':
        return 1000000; // 1 Mbps
      case 'medium':
        return 2500000; // 2.5 Mbps
      case 'high':
        return 5000000; // 5 Mbps
      case 'maximum':
        return 10000000; // 10 Mbps
      default:
        return 5000000; // 5 Mbps
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
}
