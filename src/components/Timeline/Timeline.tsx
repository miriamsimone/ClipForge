import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { addClip, setPixelsPerSecond, setPlaying } from '../../store/slices/timelineSlice';
import { MediaClip } from '../../types/media';
import { TimelineClip } from '../../types/timeline';
import { MIN_PIXELS_PER_SECOND, PIXELS_PER_SECOND, TIMELINE_PADDING } from '../../constants/timeline';
import './Timeline.css';

const Timeline: React.FC = () => {
  const dispatch = useDispatch();
  const { tracks, playheadPosition, isPlaying, zoom, pixelsPerSecond } = useSelector((state: RootState) => state.timeline);
  const [dragOverTrackId, setDragOverTrackId] = useState<number | null>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const MIN_CLIP_WIDTH = 48;

  useEffect(() => {
    const updateWidth = () => {
      if (timelineContentRef.current) {
        setContainerWidth(timelineContentRef.current.clientWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);

    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const longestTrackDuration = useMemo(() => {
    // Account for sequential clips (flex layout) and scheduled start times
    return tracks.reduce((maxDuration, track) => {
      const aggregates = track.clips.reduce<{ cumulative: number; end: number }>((acc, clip) => {
        const duration = clip.duration || 0;
        const clipEnd = (clip.startTime || 0) + duration;

        acc.cumulative += duration;
        acc.end = Math.max(acc.end, clipEnd);
        return acc;
      }, { cumulative: 0, end: 0 });

      return Math.max(maxDuration, aggregates.cumulative, aggregates.end);
    }, 0);
  }, [tracks]);

  const calculatedScale = useMemo(() => {
    const baseScale = PIXELS_PER_SECOND * zoom;

    if (longestTrackDuration <= 0 || containerWidth <= 0) {
      return baseScale;
    }

    const usableWidth = Math.max(containerWidth - TIMELINE_PADDING, containerWidth * 0.8);
    const fitScale = usableWidth / longestTrackDuration;
    const clampedScale = Math.min(baseScale, fitScale);

    return Math.max(clampedScale, MIN_PIXELS_PER_SECOND);
  }, [containerWidth, longestTrackDuration, zoom]);

  useEffect(() => {
    if (Math.abs(calculatedScale - pixelsPerSecond) > 0.1) {
      dispatch(setPixelsPerSecond(calculatedScale));
    }
  }, [calculatedScale, pixelsPerSecond, dispatch]);

  const handleDragOver = (e: React.DragEvent, trackId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverTrackId(trackId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverTrackId(null);
  };

  const handleDrop = (e: React.DragEvent, trackId: number) => {
    e.preventDefault();
    setDragOverTrackId(null);

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'media-clip' && data.mediaClip) {
        const mediaClip: MediaClip = data.mediaClip;
        const targetTrack = tracks.find(track => track.id === trackId);
        const nextStartTime = targetTrack
          ? targetTrack.clips.reduce((total, clip) => total + (clip.duration || 0), 0)
          : 0;

        // Create timeline clip from media clip
        const timelineClip: TimelineClip = {
          id: `timeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          mediaClipId: mediaClip.id,
          track: trackId,
          startTime: nextStartTime,
          duration: mediaClip.duration,
          trimIn: 0,
          trimOut: mediaClip.duration,
          isSelected: false,
        };

        // Add to timeline
        dispatch(addClip({ trackId, clip: timelineClip }));
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }
  };

  const handlePlayPause = () => {
    dispatch(setPlaying(!isPlaying));
  };

  const handleStop = () => {
    dispatch(setPlaying(false));
    // TODO: Reset playhead to beginning
  };

  return (
    <div className="timeline">
      <div className="timeline-header">
        <h3 className="timeline-title">Timeline</h3>
        <div className="timeline-controls">
          <button className="btn btn-secondary" onClick={handlePlayPause}>
            {isPlaying ? '⏸️' : '▶️'}
          </button>
          <button className="btn btn-secondary" onClick={handleStop}>⏹️</button>
        </div>
      </div>
      
      <div className="timeline-content" ref={timelineContentRef}>
        <div className="timeline-tracks">
          {tracks.map((track) => (
            <div 
              key={track.id} 
              className={`timeline-track ${dragOverTrackId === track.id ? 'drag-over' : ''}`}
              onDragOver={(e) => handleDragOver(e, track.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, track.id)}
            >
              <div className="timeline-track-header">
                <span className="track-name">{track.name}</span>
                <div className="track-controls">
                  <button className="track-btn">🔇</button>
                  <button className="track-btn">🔒</button>
                </div>
              </div>
              <div className="timeline-track-content">
                <div className="timeline-clips">
                  {track.clips.map((clip) => (
                    <div
                      key={clip.id}
                      className="timeline-clip"
                      style={{ width: `${Math.max(clip.duration * pixelsPerSecond, MIN_CLIP_WIDTH)}px` }}
                    >
                      {clip.mediaClipId}
                    </div>
                  ))}
                  {track.clips.length === 0 && (
                    <div className="timeline-drop-zone">
                      Drop video here
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="timeline-playhead" style={{ left: `${playheadPosition}px` }}>
          <div className="playhead-line"></div>
        </div>
        
        {/* Debug info */}
        <div style={{ position: 'absolute', top: '10px', right: '10px', color: 'white', fontSize: '12px', zIndex: 100 }}>
          Playing: {isPlaying ? 'Yes' : 'No'} | Position: {playheadPosition.toFixed(1)}px
        </div>
      </div>
    </div>
  );
};

export default Timeline;
