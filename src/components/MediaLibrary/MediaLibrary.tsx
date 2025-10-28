import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { selectClip } from '../../store/slices/mediaSlice';
import MediaClipItem from './MediaClipItem';
import './MediaLibrary.css';

const MediaLibrary: React.FC = () => {
  const dispatch = useDispatch();
  const { clips, selectedClipId, isLoading } = useSelector((state: RootState) => state.media);

  const handleClipSelect = (clipId: string) => {
    dispatch(selectClip(clipId));
  };

  return (
    <div className="media-library">
      <div className="media-library-header">
        <h3 className="media-library-title">Media Library</h3>
        <span className="media-library-count">{clips.length} items</span>
      </div>
      
      <div className="media-library-content">
        {isLoading ? (
          <div className="media-library-loading">
            <div className="loading-spinner"></div>
            <p>Loading media files...</p>
          </div>
        ) : clips.length === 0 ? (
          <div className="media-library-empty">
            <p>No media files imported yet.</p>
            <p className="text-gray-400">Click "Import Media" to get started.</p>
          </div>
        ) : (
          <div className="media-library-grid">
            {clips.map((clip) => (
              <MediaClipItem
                key={clip.id}
                clip={clip}
                isSelected={selectedClipId === clip.id}
                onSelect={() => handleClipSelect(clip.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaLibrary;
