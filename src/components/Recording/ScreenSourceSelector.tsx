import React, { useEffect, useState } from 'react';
import { ScreenSource } from '../../types/recording';
import './ScreenSourceSelector.css';

interface ScreenSourceSelectorProps {
  onSourceSelect: (source: ScreenSource) => void;
  selectedSource: ScreenSource | null;
}

const ScreenSourceSelector: React.FC<ScreenSourceSelectorProps> = ({
  onSourceSelect,
  selectedSource
}) => {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadScreenSources();
  }, []);

  const loadScreenSources = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Loading screen sources...');
      const screenSources = await window.electronAPI.getScreenSources();
      console.log('Screen sources loaded:', screenSources);
      setSources(screenSources);
      
      // Auto-select first source if none selected
      if (screenSources.length > 0 && !selectedSource) {
        console.log('Auto-selecting first source:', screenSources[0]);
        onSourceSelect(screenSources[0]);
      }
    } catch (err) {
      console.error('Failed to load screen sources:', err);
      setError('Failed to load screen sources. Please check permissions.');
    } finally {
      setLoading(false);
    }
  };

  const handleSourceClick = (source: ScreenSource) => {
    onSourceSelect(source);
  };

  if (loading) {
    return (
      <div className="screen-source-selector">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading screen sources...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen-source-selector">
        <div className="error-state">
          <p className="error-message">{error}</p>
          <button className="btn btn-secondary" onClick={loadScreenSources}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="screen-source-selector">
        <div className="empty-state">
          <p>No screen sources available</p>
          <button className="btn btn-secondary" onClick={loadScreenSources}>
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen-source-selector">
      <h4>Select Screen Source</h4>
      <div className="sources-grid">
        {sources.map((source) => (
          <div
            key={source.id}
            className={`source-item ${selectedSource?.id === source.id ? 'selected' : ''}`}
            onClick={() => handleSourceClick(source)}
          >
            <div className="source-thumbnail">
              {source.thumbnail ? (
                <img src={source.thumbnail} alt={source.name} />
              ) : (
                <div className="thumbnail-placeholder">
                  {source.type === 'screen' ? '🖥️' : '🪟'}
                </div>
              )}
            </div>
            <div className="source-info">
              <h5>{source.name}</h5>
              <span className="source-type">
                {source.type === 'screen' ? 'Entire Screen' : 'Window'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScreenSourceSelector;
