import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { addClip, setPixelsPerSecond, setPlayheadPosition, setPlaying, setZoom } from '../../store/slices/timelineSlice';
import { MediaClip } from '../../types/media';
import { TimelineClip } from '../../types/timeline';
import { MIN_PIXELS_PER_SECOND, PIXELS_PER_SECOND, TIMELINE_PADDING } from '../../constants/timeline';
import './Timeline.css';
import TimelineClipItem from './TimelineClip';
import TimelinePlayhead from './TimelinePlayhead';

const Timeline: React.FC = () => {
  const dispatch = useDispatch();
  const { tracks, playheadPosition, isPlaying, zoom, pixelsPerSecond } = useSelector((state: RootState) => state.timeline);
  const [dragOverTrackId, setDragOverTrackId] = useState<number | null>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const MIN_CLIP_WIDTH = 48;
  const [isScrubbing, setIsScrubbing] = useState(false);

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
    return Math.max(baseScale, MIN_PIXELS_PER_SECOND);
  }, [zoom]);

  useEffect(() => {
    if (Math.abs(calculatedScale - pixelsPerSecond) > 0.1) {
      dispatch(setPixelsPerSecond(calculatedScale));
    }
  }, [calculatedScale, pixelsPerSecond, dispatch]);

  const updatePlayheadFromClientX = useCallback((clientX: number) => {
    if (!timelineContentRef.current) {
      return;
    }

    const rect = timelineContentRef.current.getBoundingClientRect();
    const scrollLeft = timelineContentRef.current.scrollLeft;
    const relativeX = clientX - rect.left + scrollLeft;
    const maxWidth = Math.max(
      rect.width,
      longestTrackDuration > 0 ? longestTrackDuration * pixelsPerSecond + TIMELINE_PADDING : rect.width,
    );
    const clampedX = Math.max(0, Math.min(relativeX, maxWidth));

    dispatch(setPlaying(false));
    dispatch(setPlayheadPosition(clampedX));
  }, [dispatch, longestTrackDuration, pixelsPerSecond]);

  useEffect(() => {
    if (!isScrubbing) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      updatePlayheadFromClientX(event.clientX);
    };

    const handleMouseUp = () => {
      setIsScrubbing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, updatePlayheadFromClientX]);

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

  const handleTimelineMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('.timeline-clip')) {
      return;
    }
    updatePlayheadFromClientX(event.clientX);
    setIsScrubbing(true);
  };

  const handlePlayheadMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    updatePlayheadFromClientX(event.clientX);
    setIsScrubbing(true);
  };

  const handleZoomChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const sliderValue = Number(event.target.value);
    const normalizedZoom = sliderValue / 100;
    dispatch(setZoom(normalizedZoom));
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
        <div className="timeline-zoom">
          <label htmlFor="timeline-zoom-slider">Zoom</label>
          <input
            id="timeline-zoom-slider"
            type="range"
            min={10}
            max={400}
            step={5}
            value={Math.round(zoom * 100)}
            onChange={handleZoomChange}
          />
          <span>{Math.round(zoom * 100)}%</span>
        </div>
      </div>
      
      <div
        className="timeline-content"
        ref={timelineContentRef}
        onMouseDown={handleTimelineMouseDown}
      >
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
                    <TimelineClipItem
                      key={clip.id}
                      clip={clip}
                      trackId={track.id}
                      pixelsPerSecond={pixelsPerSecond}
                      minWidth={MIN_CLIP_WIDTH}
                    />
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
        
        <TimelinePlayhead 
          position={playheadPosition}
          onMouseDown={handlePlayheadMouseDown}
        />
      </div>
    </div>
  );
};

export default Timeline;
