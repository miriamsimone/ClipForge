import { RecordingOptions } from '../types/recording';

export class WebcamRecorder {
  private isRecording = false;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  constructor() {
    console.log('WebcamRecorder constructor called, initial state:', this.isRecording);
    this.instanceId = Math.random().toString(36).substr(2, 9);
    console.log('WebcamRecorder instance ID:', this.instanceId);
  }

  private instanceId: string;

  async startRecording(_sourceId: string, options: RecordingOptions): Promise<void> {
    console.log('WebcamRecorder.startRecording called, current state:', this.isRecording);
    
    if (this.isRecording) {
      throw new Error('Recording is already in progress');
    }

    try {
      console.log('Starting webcam recording via getUserMedia...');
      
      // Get webcam stream using the same pattern as screen recorder
      this.stream = await this.acquireWebcamStream(options);
      console.log('Webcam stream obtained:', this.stream);

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
      console.log('Webcam recording started with MediaRecorder');
      
    } catch (error) {
      console.error('Failed to start webcam recording:', error);
      this.isRecording = false;
      this.cleanup();
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to start webcam recording: ${errorMessage}`);
    }
  }

  private async acquireWebcamStream(options: RecordingOptions): Promise<MediaStream> {
    if (!navigator.mediaDevices) {
      throw new Error('Media capture APIs are unavailable in this environment');
    }

    const supportsGetUserMedia = typeof navigator.mediaDevices.getUserMedia === 'function';
    console.log('getUserMedia support detected:', supportsGetUserMedia);

    if (!supportsGetUserMedia) {
      throw new Error('getUserMedia is not supported in this browser');
    }

    const preferredConstraints: MediaStreamConstraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: options.frameRate || 30 }
      },
      audio: options.audio ? {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100
      } : false
    };

    console.log('Requesting webcam with constraints:', preferredConstraints);
    
    try {
      return await navigator.mediaDevices.getUserMedia(preferredConstraints);
    } catch (error) {
      console.warn('Failed with preferred constraints, trying minimal constraints:', error);
      
      // Fallback to minimal constraints
      const minimalConstraints: MediaStreamConstraints = {
        video: true,
        audio: options.audio || false
      };
      
      return await navigator.mediaDevices.getUserMedia(minimalConstraints);
    }
  }

  async stopRecording(options?: RecordingOptions): Promise<Blob> {
    console.log('WebcamRecorder.stopRecording called, current state:', this.isRecording);
    
    if (!this.isRecording || !this.mediaRecorder) {
      throw new Error('No recording in progress');
    }

    try {
      console.log('Stopping webcam recording...');
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
      console.log('WebcamRecorder state set to false');
      
      // Cleanup
      this.cleanup();
      
      return blob;
    } catch (error) {
      console.error('Failed to stop webcam recording:', error);
      this.isRecording = false;
      this.cleanup();
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to stop webcam recording: ${errorMessage}`);
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

  getStream(): MediaStream | null {
    return this.stream;
  }

  private getQualityFromOptions(quality?: string): 'low' | 'medium' | 'high' | 'maximum' {
    if (quality === 'low' || quality === 'medium' || quality === 'high' || quality === 'maximum') {
      return quality;
    }
    return 'high';
  }
}
