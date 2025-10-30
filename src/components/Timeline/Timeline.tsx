import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { addClip, setPixelsPerSecond, setPlayheadPosition, setPlaying, setZoom, splitClip, duplicateClip, removeClip } from '../../store/slices/timelineSlice';
import { addMediaClip } from '../../store/slices/mediaSlice';
import { MediaClip } from '../../types/media';
import { TimelineClip } from '../../types/timeline';
import { MIN_PIXELS_PER_SECOND, PIXELS_PER_SECOND, TIMELINE_PADDING } from '../../constants/timeline';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import './Timeline.css';
import TimelineClipItem from './TimelineClip';
import TimelinePlayhead from './TimelinePlayhead';

const Timeline: React.FC = () => {
  const dispatch = useDispatch();
  const { tracks, playheadPosition, isPlaying, zoom, pixelsPerSecond, selectedClipIds } = useSelector((state: RootState) => state.timeline);
  const [dragOverTrackId, setDragOverTrackId] = useState<number | null>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const MIN_CLIP_WIDTH = 48;
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Enable keyboard shortcuts
  useKeyboardShortcuts();

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

  const calculateSnapPosition = (targetTime: number, targetTrack: typeof tracks[0], excludeClipId?: string): number => {
    if (!tracks || tracks.length === 0) return targetTime;

    const snapThreshold = 0.2; // 0.2 seconds snap threshold
    let snappedTime = targetTime;
    let minDistance = snapThreshold;

    // Check all clips in all tracks for snap points
    tracks.forEach(track => {
      track.clips.forEach(clip => {
        if (clip.id === excludeClipId) return; // Don't snap to self

        const clipStart = clip.startTime || 0;
        const clipEnd = clipStart + (clip.duration || 0);

        // Check snap to clip start
        const distanceToStart = Math.abs(targetTime - clipStart);
        if (distanceToStart < minDistance) {
          minDistance = distanceToStart;
          snappedTime = clipStart;
        }

        // Check snap to clip end
        const distanceToEnd = Math.abs(targetTime - clipEnd);
        if (distanceToEnd < minDistance) {
          minDistance = distanceToEnd;
          snappedTime = clipEnd;
        }
      });
    });

    // Snap to timeline start (0)
    if (Math.abs(targetTime) < snapThreshold) {
      snappedTime = 0;
    }

    return Math.max(0, snappedTime); // Don't allow negative times
  };

  const handleDragOver = (e: React.DragEvent, trackId: number) => {
    e.preventDefault();

    const data = e.dataTransfer.types.includes('application/json')
      ? e.dataTransfer.getData('application/json')
      : null;

    if (data) {
      try {
        const parsed = JSON.parse(data);
        // Set different drop effects for different drag types
        if (parsed.type === 'timeline-clip') {
          e.dataTransfer.dropEffect = 'move';
        } else {
          e.dataTransfer.dropEffect = 'copy';
        }
      } catch {
        e.dataTransfer.dropEffect = 'copy';
      }
    }

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

      // Use the timeline-content container bounds (the main scrollable area)
      if (!timelineContentRef.current) {
        console.error('Timeline content ref not available');
        return;
      }

      const timelineRect = timelineContentRef.current.getBoundingClientRect();
      const scrollLeft = timelineContentRef.current.scrollLeft;

      // Handle timeline clip reordering
      if (data.type === 'timeline-clip') {
        const { clipId, trackId: fromTrackId, clip: draggedClip, dragOffsetSeconds = 0 } = data;

        // Calculate drop position relative to timeline-content
        const relativeX = e.clientX - timelineRect.left + scrollLeft;
        const cursorTimeSeconds = relativeX / pixelsPerSecond;

        // Adjust for where the user grabbed the clip
        const dropTimeSeconds = cursorTimeSeconds - dragOffsetSeconds;

        // Apply snapping
        const targetTrack = tracks.find(t => t.id === trackId);
        const snappedTime = calculateSnapPosition(dropTimeSeconds, targetTrack!, clipId);

        console.log('Dropping clip:', {
          clipId,
          fromTrackId,
          toTrackId: trackId,
          cursorTimeSeconds,
          dragOffsetSeconds,
          dropTimeSeconds,
          snappedTime
        });

        // Dispatch move action
        dispatch(removeClip({ trackId: fromTrackId, clipId }));
        dispatch(addClip({
          trackId,
          clip: {
            ...draggedClip,
            startTime: snappedTime,
            track: trackId
          }
        }));
      }
      // Handle new media clip from library
      else if (data.type === 'media-clip' && data.mediaClip) {
        const mediaClip: MediaClip = data.mediaClip;

        // Calculate drop position relative to timeline-content
        const relativeX = e.clientX - timelineRect.left + scrollLeft;
        const dropTimeSeconds = Math.max(0, relativeX / pixelsPerSecond);

        console.log('Dropping new media clip:', {
          clientX: e.clientX,
          timelineRectLeft: timelineRect.left,
          scrollLeft,
          relativeX,
          dropTimeSeconds,
          pixelsPerSecond,
          message: 'Calculated relative to timeline-content container'
        });

        // Apply snapping for new clips too
        const targetTrack = tracks.find(t => t.id === trackId);
        const snappedTime = calculateSnapPosition(dropTimeSeconds, targetTrack!);

        console.log('After snapping:', snappedTime);

        // Check if we're dropping a video file on an audio track
        const isAudioTrack = targetTrack?.type === 'audio';
        const isVideoWithAudio = mediaClip.hasVideo && mediaClip.hasAudio;

        // If dropping video on audio track, extract audio first
        if (isAudioTrack && isVideoWithAudio) {
          console.log('Extracting audio from video for audio track...');
          
          // Show loading state
          window.electronAPI.extractAudioFromVideo(mediaClip.filePath, null, 'aac')
            .then((audioMetadata: any) => {
              console.log('Audio extracted successfully:', audioMetadata);
              
              // Create a new media clip entry for the extracted audio
              const audioMediaClip: MediaClip = {
                id: `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                filePath: audioMetadata.filePath,
                fileName: audioMetadata.fileName || `${mediaClip.fileName}_audio.aac`,
                fileSize: audioMetadata.fileSize || 0,
                duration: audioMetadata.duration || mediaClip.duration,
                width: 0,
                height: 0,
                frameRate: 0,
                codec: 'unknown',
                audioCodec: audioMetadata.audioCodec || 'aac',
                hasAudio: true,
                hasVideo: false,
                format: 'aac',
                createdAt: Date.now()
              };

              // Create timeline clip from extracted audio
              const timelineClip: TimelineClip = {
                id: `timeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                mediaClipId: audioMediaClip.id,
                track: trackId,
                startTime: snappedTime,
                duration: audioMetadata.duration || mediaClip.duration,
                trimIn: 0,
                trimOut: audioMetadata.duration || mediaClip.duration,
                isSelected: false,
              };

              // Add the audio media clip to the store
              dispatch(addMediaClip(audioMediaClip));
              
              // Add to timeline
              dispatch(addClip({ trackId, clip: timelineClip }));
            })
            .catch((error: Error) => {
              console.error('Failed to extract audio from video:', error);
              alert(`Failed to extract audio: ${error.message}`);
            });
        } else {
          // Regular behavior: just add the media clip to the timeline
          const timelineClip: TimelineClip = {
            id: `timeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            mediaClipId: mediaClip.id,
            track: trackId,
            startTime: snappedTime,
            duration: mediaClip.duration,
            trimIn: 0,
            trimOut: mediaClip.duration,
            isSelected: false,
          };

          // Add to timeline
          dispatch(addClip({ trackId, clip: timelineClip }));
        }
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

  const handleSplit = () => {
    if (selectedClipIds.length === 0) {
      console.log('No clip selected for split');
      return;
    }

    // Convert playhead position from pixels to seconds
    const playheadTimeSeconds = playheadPosition / pixelsPerSecond;

    // Find the selected clip and its track
    for (const track of tracks) {
      const clip = track.clips.find(c => selectedClipIds.includes(c.id));
      if (clip) {
        // Check if playhead is within the clip
        const clipStart = clip.startTime || 0;
        const clipEnd = clipStart + (clip.duration || 0);

        if (playheadTimeSeconds >= clipStart && playheadTimeSeconds <= clipEnd) {
          dispatch(splitClip({
            trackId: track.id,
            clipId: clip.id,
            splitTime: playheadTimeSeconds
          }));
          return;
        }
      }
    }
    console.warn('Playhead not within selected clip bounds');
  };

  const handleDuplicate = () => {
    if (selectedClipIds.length === 0) {
      console.log('No clip selected for duplicate');
      return;
    }

    // Duplicate the first selected clip
    for (const track of tracks) {
      const clip = track.clips.find(c => selectedClipIds.includes(c.id));
      if (clip) {
        dispatch(duplicateClip({
          trackId: track.id,
          clipId: clip.id
        }));
        return;
      }
    }
  };

  const handleDelete = () => {
    if (selectedClipIds.length === 0) {
      console.log('No clip selected for delete');
      return;
    }

    // Delete all selected clips
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (selectedClipIds.includes(clip.id)) {
          dispatch(removeClip({
            trackId: track.id,
            clipId: clip.id
          }));
        }
      }
    }
  };

  const hasSelection = selectedClipIds.length > 0;
  const canSplit = useMemo(() => {
    if (!hasSelection) return false;

    // Convert playhead position from pixels to seconds
    const playheadTimeSeconds = playheadPosition / pixelsPerSecond;

    for (const track of tracks) {
      const clip = track.clips.find(c => selectedClipIds.includes(c.id));
      if (clip) {
        const clipStart = clip.startTime || 0;
        const clipEnd = clipStart + (clip.duration || 0);
        return playheadTimeSeconds >= clipStart && playheadTimeSeconds <= clipEnd;
      }
    }
    return false;
  }, [hasSelection, tracks, selectedClipIds, playheadPosition, pixelsPerSecond]);

  return (
    <div className="timeline">
      <div className="timeline-header">
        <h3 className="timeline-title">Timeline</h3>
        <div className="timeline-controls">
          <button className="btn btn-secondary" onClick={handlePlayPause}>
            {isPlaying ? '⏸️' : '▶️'}
          </button>
          <button className="btn btn-secondary" onClick={handleStop}>⏹️</button>
          <div className="timeline-divider"></div>
          <button
            className="btn btn-secondary"
            onClick={handleSplit}
            disabled={!canSplit}
            title={canSplit ? "Split clip at playhead (S or Cmd+K)" : "Select clip and position playhead within it"}
          >
            ✂️
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleDuplicate}
            disabled={!hasSelection}
            title={hasSelection ? "Duplicate clip (Cmd+D)" : "Select a clip to duplicate"}
          >
            📋
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleDelete}
            disabled={!hasSelection}
            title={hasSelection ? "Delete clip (Del)" : "Select a clip to delete"}
          >
            🗑️
          </button>
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
            >
              <div className="timeline-track-header">
                <span className="track-name">{track.name}</span>
                <div className="track-controls">
                  <button className="track-btn">🔇</button>
                  <button className="track-btn">🔒</button>
                </div>
              </div>
              <div
                className="timeline-track-content"
                onDragOver={(e) => handleDragOver(e, track.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, track.id)}
              >
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
