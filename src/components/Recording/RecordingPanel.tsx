import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { closeAllModals } from '../../store/slices/uiSlice';
import './RecordingPanel.css';

const RecordingPanel: React.FC = () => {
  const dispatch = useDispatch();
  const { isRecording, duration } = useSelector((state: RootState) => state.recording);

  const handleClose = () => {
    dispatch(closeAllModals());
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
          <div className="recording-status">
            <div className="recording-indicator">
              {isRecording ? '🔴' : '⚪'}
            </div>
            <div className="recording-info">
              <h4>{isRecording ? 'Recording...' : 'Ready to Record'}</h4>
              <p className="text-gray-400">
                {isRecording ? `Duration: ${Math.floor(duration / 60)}:${(duration % 60).toFixed(0).padStart(2, '0')}` : 'Select recording options below'}
              </p>
            </div>
          </div>
          
          <div className="recording-options">
            <div className="option-group">
              <label>Recording Type</label>
              <div className="option-buttons">
                <button className="btn btn-secondary">Screen</button>
                <button className="btn btn-secondary">Webcam</button>
                <button className="btn btn-secondary">Both</button>
              </div>
            </div>
            
            <div className="option-group">
              <label>Quality</label>
              <select className="input">
                <option value="high">High (1080p)</option>
                <option value="medium">Medium (720p)</option>
                <option value="low">Low (480p)</option>
              </select>
            </div>
            
            <div className="option-group">
              <label>Audio</label>
              <div className="option-checkboxes">
                <label>
                  <input type="checkbox" defaultChecked />
                  Microphone
                </label>
                <label>
                  <input type="checkbox" />
                  System Audio
                </label>
              </div>
            </div>
          </div>
          
          <div className="recording-controls">
            <button className="btn btn-primary">
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>
            <button className="btn btn-secondary">
              Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecordingPanel;
