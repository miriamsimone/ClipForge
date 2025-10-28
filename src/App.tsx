import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from './store';
import Toolbar from './components/Toolbar/Toolbar';
import MediaLibrary from './components/MediaLibrary/MediaLibrary';
import Timeline from './components/Timeline/Timeline';
import Preview from './components/Preview/Preview';
import RecordingPanel from './components/Recording/RecordingPanel';
import ExportDialog from './components/Export/ExportDialog';
import './App.css';

function App() {
  const { showRecordingPanel, showExportDialog } = useSelector((state: RootState) => ({
    showRecordingPanel: state.ui.showRecordingPanel,
    showExportDialog: state.ui.showExportDialog,
  }));

  return (
    <div className="app">
      {/* Top Toolbar */}
      <Toolbar />
      
      {/* Main Content Area */}
      <div className="app-main">
        {/* Left Sidebar - Media Library */}
        <div className="app-sidebar">
          <MediaLibrary />
        </div>
        
        {/* Center Area - Preview and Timeline */}
        <div className="app-center">
          {/* Preview Window */}
          <div className="app-preview">
            <Preview />
          </div>
          
          {/* Timeline */}
          <div className="app-timeline">
            <Timeline />
          </div>
        </div>
      </div>
      
      {/* Modals */}
      {showRecordingPanel && <RecordingPanel />}
      {showExportDialog && <ExportDialog />}
    </div>
  );
}

export default App;
