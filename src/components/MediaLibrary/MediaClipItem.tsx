import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../../store';
import { generateSubtitles } from '../../store/slices/mediaSlice';
import { MediaClip } from '../../types/media';
import './MediaClipItem.css';

interface MediaClipItemProps {
  clip: MediaClip;
  isSelected: boolean;
  onSelect: () => void;
}

const MediaClipItem: React.FC<MediaClipItemProps> = ({ clip, isSelected, onSelect }) => {
  const dispatch = useDispatch<AppDispatch>();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleGenerateSubtitles = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent clip selection when clicking button
    
    if (!clip.hasAudio) {
      setError('Video has no audio track');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      await dispatch(generateSubtitles({
        clipId: clip.id,
        filePath: clip.filePath
      })).unwrap();
    } catch (err) {
      setError((err as Error).message || 'Failed to generate subtitles');
    } finally {
      setIsGenerating(false);
    }
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
          {clip.codec ? clip.codec.toUpperCase() : 'Unknown'}
          {clip.hasAudio && ' + Audio'}
        </div>
        {clip.hasAudio && (
          <div className="media-clip-subtitle-section">
            {clip.subtitles ? (
              <div className="media-clip-subtitle-status">
                <span className="subtitle-badge">✓ Subtitles</span>
              </div>
            ) : (
              <button
                className="btn-subtitle-generate"
                onClick={handleGenerateSubtitles}
                disabled={isGenerating}
                title="Generate subtitles using AI"
              >
                {isGenerating ? 'Generating...' : 'Generate Subtitles'}
              </button>
            )}
            {error && (
              <div className="subtitle-error">{error}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaClipItem;
