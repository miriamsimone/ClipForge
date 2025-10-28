import React from 'react';
import { MediaClip } from '../../types/media';
import './MediaClipItem.css';

interface MediaClipItemProps {
  clip: MediaClip;
  isSelected: boolean;
  onSelect: () => void;
}

const MediaClipItem: React.FC<MediaClipItemProps> = ({ clip, isSelected, onSelect }) => {
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'media-clip',
      mediaClip: clip
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div 
      className={`media-clip-item ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
      draggable
      onDragStart={handleDragStart}
    >
      <div className="media-clip-thumbnail">
        {clip.thumbnail ? (
          <img src={clip.thumbnail} alt={clip.fileName} />
        ) : (
          <div className="media-clip-placeholder">
            🎬
          </div>
        )}
        <div className="media-clip-duration">
          {formatDuration(clip.duration)}
        </div>
      </div>
      
      <div className="media-clip-info">
        <div className="media-clip-name" title={clip.fileName}>
          {clip.fileName}
        </div>
        <div className="media-clip-details">
          <span>{clip.width}×{clip.height}</span>
          <span>{formatFileSize(clip.fileSize)}</span>
        </div>
        <div className="media-clip-codec">
          {clip.codec.toUpperCase()}
          {clip.hasAudio && ' + Audio'}
        </div>
      </div>
    </div>
  );
};

export default MediaClipItem;
