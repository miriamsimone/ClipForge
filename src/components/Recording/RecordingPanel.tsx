import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../../store';
import { closeAllModals } from '../../store/slices/uiSlice';
import { 
  startRecording, 
  stopRecording, 
  saveRecording, 
  setRecordingDuration,
  resetRecording
} from '../../store/slices/recordingSlice';
import { addMediaClip } from '../../store/slices/mediaSlice';
import { RecordingOptions } from '../../types/recording';
import { SimpleWebcamRecorder } from '../../utils/simpleWebcamRecorder';
import { VideoConverter } from '../../utils/videoConverter';
import './RecordingPanel.css';

const RecordingPanel: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { isRecording, duration, outputPath, error, isLoading } = useSelector((state: RootState) => state.recording);
  
  const [recordingMode, setRecordingMode] = useState<'screen' | 'webcam'>('webcam');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high' | 'maximum'>('high');
  const [includeAudio, setIncludeAudio] = useState(true);
  const [countdown, setCountdown] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  
  // screenRecorderRef removed - now using backend service for screen recording
  const webcamRecorderRef = useRef<SimpleWebcamRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    console.log('Recording state changed:', { isRecording, duration, outputPath, error, isLoading });
  }, [isRecording, duration, outputPath, error, isLoading]);

  useEffect(() => {
    if (isRecording) {
      // Start timer
      timerRef.current = setInterval(() => {
        dispatch(setRecordingDuration(duration + 1));
      }, 1000);
    } else {
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording, duration, dispatch]);

  const handleClose = () => {
    if (isRecording) {
      handleStopRecording();
    }
    dispatch(closeAllModals());
  };

  const handleStartRecording = async () => {
    console.log('Start recording clicked, mode:', recordingMode);
    console.log('Current recording state:', { isRecording, duration, error, isLoading });

    try {
      console.log('Starting countdown...');
      // Start countdown
      setCountdown(3);
      for (let i = 3; i > 0; i--) {
        setCountdown(i);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      setCountdown(0);

      const options: RecordingOptions = {
        sourceId: recordingMode === 'screen' ? 'screen' : 'webcam',
        audio: includeAudio,
        video: true,
        frameRate: 30,
        quality: quality
      };

      if (recordingMode === 'screen') {
        console.log('Starting screen recording via backend service...');
        
        // Get screen sources and let user select, or use first available
        const sources = await window.electronAPI.getScreenSources();
        console.log('Available screen sources:', sources);
        
        if (!sources || sources.length === 0) {
          throw new Error('No screen sources available for recording');
        }
        
        // For now, use the first screen source (or could show a dialog for selection)
        const selectedSource = sources.find(s => s.name.toLowerCase().includes('screen')) || sources[0];
        console.log('Selected source:', selectedSource);
        
        // Use backend recording service instead of browser APIs
        const backendOptions = {
          sourceId: selectedSource.id,
          audio: includeAudio,
          video: true,
          frameRate: 30,
          quality: quality
        };
        
        const result = await window.electronAPI.startScreenRecording(backendOptions);
        console.log('Backend recording started:', result);
      } else {
        console.log('Initializing webcam recorder...');
        webcamRecorderRef.current = new SimpleWebcamRecorder();
        console.log('SimpleWebcamRecorder instance created');
        
        console.log('Starting webcam recording with options:', options);
        await webcamRecorderRef.current.startRecording(options, videoRef.current || undefined);
        console.log('SimpleWebcamRecorder.startRecording completed');
      }
      
      console.log('Dispatching startRecording action...');
      dispatch(startRecording(options));
      console.log('startRecording action dispatched');
      
      console.log('Recording started successfully');
    } catch (error) {
      console.error('Failed to start recording:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to start recording: ${errorMessage}`);
    }
  };

  const handleStopRecording = async () => {
    if (recordingMode === 'screen') {
      // Use backend recording service
      try {
        console.log('Stopping screen recording via backend service...');
        const result = await window.electronAPI.stopScreenRecording();
        console.log('Backend recording stopped:', result);
        
        dispatch(stopRecording());
        
        // Add the recorded file to media library
        if (result.outputPath) {
          try {
            const metadata = await window.electronAPI.getMetadata(result.outputPath);
            console.log('Recording metadata:', metadata);
            
            const mediaClip = {
              id: `recorded_${Date.now()}`,
              filePath: result.outputPath,
              fileName: result.fileName,
              duration: metadata.duration || 0,
              width: metadata.width || 1920,
              height: metadata.height || 1080,
              frameRate: metadata.frameRate || 30,
              fileSize: metadata.fileSize || 0,
              codec: metadata.codec || 'H264',
              audioCodec: metadata.audioCodec || 'AAC',
              hasAudio: metadata.hasAudio || includeAudio,
              hasVideo: true,
              format: metadata.format || 'mp4',
              createdAt: Date.now()
            };
            
            dispatch(addMediaClip(mediaClip));
            console.log('Recording added to media library');
            setShowPreview(true);
            
            // Close the recording panel after a short delay
            setTimeout(() => {
              dispatch(closeAllModals());
            }, 2000);
          } catch (metadataError) {
            console.error('Failed to get metadata:', metadataError);
            // Still show success
            setShowPreview(true);
            setTimeout(() => {
              dispatch(closeAllModals());
            }, 2000);
          }
        }
        return;
      } catch (error) {
        console.error('Failed to stop screen recording:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        alert(`Failed to stop recording: ${errorMessage}`);
        return;
      }
    }
    
    // Webcam recording uses the old approach
    const currentRecorder = webcamRecorderRef.current;
    
    if (!currentRecorder) {
      console.log(`No ${recordingMode} recorder instance found`);
      return;
    }

    try {
      console.log('Stopping recording...');
      console.log(`${recordingMode} recorder state:`, currentRecorder.getRecordingStatus());
      
      // Stop recording and get blob
      const originalBlob = await currentRecorder.stopRecording();
      dispatch(stopRecording());

      console.log('Recording stopped, blob:', originalBlob);
      console.log('Blob type:', originalBlob.type);
      console.log('Blob size:', originalBlob.size, 'bytes');

      // Convert WebM to MP4 for better compatibility
      let finalBlob = originalBlob;
      let extension = 'webm';

      if (originalBlob.type.includes('webm')) {
        console.log('Converting WebM to MP4...');
        try {
          finalBlob = await VideoConverter.convertWebMToMP4(originalBlob, {
            quality: quality
          });
          console.log('MP4 conversion successful, new size:', finalBlob.size);
          extension = 'mp4';
        } catch (conversionError) {
          console.warn('MP4 conversion failed, using original WebM:', conversionError);
          extension = 'webm';
        }
      }

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${recordingMode}_recording_${timestamp}.${extension}`;

      console.log('Saving recording as:', fileName);

      // Save the recording and add to media library
      try {
        const arrayBuffer = await finalBlob.arrayBuffer();
        console.log('ArrayBuffer size:', arrayBuffer.byteLength);

        await dispatch(saveRecording({
          buffer: arrayBuffer,
          fileName
        }));
        console.log('Recording saved to media library');
        setShowPreview(true);
      } catch (saveError) {
        console.error('Failed to save recording:', saveError);
        // Still show preview even if save fails
        setShowPreview(true);
      }
      
      console.log('Recording flow completed');
      
      // Clear video preview
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      // Close the recording panel after a short delay
      setTimeout(() => {
        dispatch(closeAllModals());
      }, 2000);
    } catch (error) {
      console.error('Failed to stop recording:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to stop recording: ${errorMessage}`);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleNewRecording = () => {
    setShowPreview(false);
    dispatch(resetRecording());
  };

  return (
    <div className="recording-panel-overlay">
      <div className="recording-panel">
        <div className="recording-panel-header">
          <h3 className="recording-panel-title">Recording</h3>
          <button className="btn btn-secondary" onClick={handleClose}>
            ✕
          </button>
        </div>
        
        <div className="recording-panel-content">
          {countdown > 0 && (
            <div className="countdown-overlay">
              <div className="countdown-number">{countdown}</div>
              <p>Recording will start in...</p>
            </div>
          )}

          {showPreview && outputPath ? (
            <div className="recording-preview">
              <h4>Recording Complete!</h4>
              <p>Your recording has been saved and added to the media library.</p>
              <div className="preview-actions">
                <button className="btn btn-primary" onClick={handleNewRecording}>
                  Record Another
                </button>
                <button className="btn btn-secondary" onClick={handleClose}>
                  Close
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="recording-status">
                <div className="recording-indicator">
                  {isRecording ? '🔴' : '⚪'}
                </div>
                <div className="recording-info">
                  <h4>{isRecording ? 'Recording...' : 'Ready to Record'}</h4>
                  <p className="text-gray-400">
                    {isRecording ? `Duration: ${formatTime(duration)}` : 'Select recording options below'}
                  </p>
                </div>
              </div>
              
              <div className="recording-options">
                <div className="option-group">
                  <label>Recording Mode</label>
                  <div className="option-buttons">
                    <button 
                      className={`btn ${recordingMode === 'webcam' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setRecordingMode('webcam')}
                      disabled={isRecording}
                    >
                      Webcam
                    </button>
                    <button 
                      className={`btn ${recordingMode === 'screen' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setRecordingMode('screen')}
                      disabled={isRecording}
                    >
                      Screen
                    </button>
                  </div>
                </div>

                {recordingMode === 'webcam' && (
                  <div className="option-group">
                    <label>Webcam Preview</label>
                    <video 
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      style={{
                        width: '100%',
                        maxWidth: '400px',
                        height: 'auto',
                        backgroundColor: '#000',
                        borderRadius: '8px',
                        display: isRecording ? 'block' : 'none'
                      }}
                    />
                    {!isRecording && (
                      <div style={{
                        width: '100%',
                        maxWidth: '400px',
                        height: '225px',
                        backgroundColor: '#333',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#666',
                        fontSize: '14px'
                      }}>
                        Webcam preview will appear when recording starts
                      </div>
                    )}
                  </div>
                )}

                <div className="option-group">
                  <label>{recordingMode === 'webcam' ? 'Webcam' : 'Screen'} Recording</label>
                  <div className="option-buttons">
                    <button 
                      className={`btn ${isRecording ? 'btn-danger' : 'btn-primary'}`}
                      onClick={() => {
                        console.log('Button clicked! isRecording:', isRecording, 'mode:', recordingMode);
                        if (isRecording) {
                          handleStopRecording();
                        } else {
                          handleStartRecording();
                        }
                      }}
                      disabled={isLoading}
                    >
                      {isLoading ? 'Processing...' : isRecording ? 'Stop Recording' : 'Start Recording'}
                    </button>
                  </div>
                </div>

                
                <div className="option-group">
                  <label>Quality</label>
                  <select 
                    className="input"
                    value={quality}
                    onChange={(e) => setQuality(e.target.value as any)}
                  >
                    <option value="high">High (1080p)</option>
                    <option value="medium">Medium (720p)</option>
                    <option value="low">Low (480p)</option>
                  </select>
                </div>
                
                <div className="option-group">
                  <label>Audio</label>
                  <div className="option-checkboxes">
                    <label>
                      <input 
                        type="checkbox" 
                        checked={includeAudio}
                        onChange={(e) => setIncludeAudio(e.target.checked)}
                      />
                      Microphone
                    </label>
                  </div>
                </div>
                
              </div>

              {error && (
                <div className="error-message">
                  <p>{error}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecordingPanel;
