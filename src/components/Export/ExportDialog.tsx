import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { closeAllModals } from '../../store/slices/uiSlice';
import './ExportDialog.css';

const ExportDialog: React.FC = () => {
  const dispatch = useDispatch();
  const { isExporting, progress } = useSelector((state: RootState) => state.export);

  const handleClose = () => {
    dispatch(closeAllModals());
  };

  return (
    <div className="export-dialog-overlay">
      <div className="export-dialog">
        <div className="export-dialog-header">
          <h3 className="export-dialog-title">Export Video</h3>
          <button className="btn btn-secondary" onClick={handleClose}>
            ✕
          </button>
        </div>
        
        <div className="export-dialog-content">
          {isExporting ? (
            <div className="export-progress">
              <div className="export-progress-header">
                <h4>Exporting Video...</h4>
                <span className="export-progress-percentage">{progress.progress}%</span>
              </div>
              
              <div className="export-progress-bar">
                <div 
                  className="export-progress-fill" 
                  style={{ width: `${progress.progress}%` }}
                ></div>
              </div>
              
              <div className="export-progress-info">
                <p>{progress.message}</p>
                {progress.timeRemaining && (
                  <p className="text-gray-400">
                    Time remaining: {Math.floor(progress.timeRemaining / 60)}:{(progress.timeRemaining % 60).toFixed(0).padStart(2, '0')}
                  </p>
                )}
              </div>
              
              <div className="export-progress-controls">
                <button className="btn btn-danger">
                  Cancel Export
                </button>
              </div>
            </div>
          ) : (
            <div className="export-options">
              <div className="option-group">
                <label>Output Format</label>
                <select className="input" defaultValue="mp4">
                  <option value="mp4">MP4 (H.264)</option>
                  <option value="mov">MOV (H.264)</option>
                </select>
              </div>
              
              <div className="option-group">
                <label>Resolution</label>
                <select className="input" defaultValue="1080p">
                  <option value="480p">480p (SD)</option>
                  <option value="720p">720p (HD)</option>
                  <option value="1080p">1080p (Full HD)</option>
                  <option value="source">Source Resolution</option>
                </select>
              </div>
              
              <div className="option-group">
                <label>Frame Rate</label>
                <select className="input" defaultValue="30">
                  <option value="24">24 fps</option>
                  <option value="30">30 fps</option>
                  <option value="60">60 fps</option>
                  <option value="source">Source Frame Rate</option>
                </select>
              </div>
              
              <div className="option-group">
                <label>Quality</label>
                <select className="input" defaultValue="high">
                  <option value="low">Low (Smaller file)</option>
                  <option value="medium">Medium (Balanced)</option>
                  <option value="high">High (Better quality)</option>
                  <option value="maximum">Maximum (Best quality)</option>
                </select>
              </div>
              
              <div className="option-group">
                <label>Output Location</label>
                <div className="file-input-group">
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="Choose output location..."
                    defaultValue="~/Desktop/ClipForge_Export.mp4"
                  />
                  <button className="btn btn-secondary">Browse</button>
                </div>
              </div>
              
              <div className="export-controls">
                <button className="btn btn-primary">
                  Start Export
                </button>
                <button className="btn btn-secondary" onClick={handleClose}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;
