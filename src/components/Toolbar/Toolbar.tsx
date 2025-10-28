import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { toggleRecordingPanel, toggleExportDialog } from '../../store/slices/uiSlice';
import { importMediaFiles } from '../../store/slices/mediaSlice';
import './Toolbar.css';

const Toolbar: React.FC = () => {
  const dispatch = useDispatch();
  const { isRecording, isExporting } = useSelector((state: RootState) => ({
    isRecording: state.recording.isRecording,
    isExporting: state.export.isExporting,
  }));

  const handleImportFiles = () => {
    dispatch(importMediaFiles());
  };

  const handleStartRecording = () => {
    dispatch(toggleRecordingPanel());
  };

  const handleExport = () => {
    dispatch(toggleExportDialog());
  };

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <button className="btn btn-primary" onClick={handleImportFiles}>
          📁 Import Media
        </button>
        <button 
          className="btn btn-secondary" 
          onClick={handleStartRecording}
          disabled={isRecording}
        >
          {isRecording ? '⏹️ Recording...' : '🎥 Record'}
        </button>
      </div>
      
      <div className="toolbar-center">
        <h1 className="toolbar-title">ClipForge</h1>
      </div>
      
      <div className="toolbar-right">
        <button 
          className="btn btn-primary" 
          onClick={handleExport}
          disabled={isExporting}
        >
          {isExporting ? '⏳ Exporting...' : '📤 Export'}
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
