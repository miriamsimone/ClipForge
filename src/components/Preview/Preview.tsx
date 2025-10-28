import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setPlaying, setPlayheadPosition } from '../../store/slices/timelineSlice';
import './Preview.css';

const Preview: React.FC = () => {
  const dispatch = useDispatch();
  const { isPlaying, tracks, pixelsPerSecond } = useSelector((state: RootState) => state.timeline);
  const { clips: mediaClips } = useSelector((state: RootState) => state.media);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);

  const timelineClips = useMemo(() => {
    const allClips = tracks?.flatMap(track => track.clips || []) ?? [];
    return allClips
      .slice()
      .sort((a, b) => {
        const startA = typeof a.startTime === 'number' ? a.startTime : 0;
        const startB = typeof b.startTime === 'number' ? b.startTime : 0;
        if (startA === startB) {
          return a.id.localeCompare(b.id);
        }
        return startA - startB;
      });
  }, [tracks]);

  const clipOffsets = useMemo(() => {
    let runningOffset = 0;
    return timelineClips.map(clip => {
      const clipDuration = clip.duration || 0;
      const explicitStart = typeof clip.startTime === 'number' ? clip.startTime : null;
      const offset = explicitStart !== null ? explicitStart : runningOffset;
      runningOffset = Math.max(runningOffset, offset + clipDuration);
      return offset;
    });
  }, [timelineClips]);

  const currentTimelineClip = timelineClips[currentClipIndex] ?? null;
  const currentClipOffset = clipOffsets[currentClipIndex] ?? 0;

  const currentMediaClip = useMemo(() => {
    if (!currentTimelineClip || !mediaClips) {
      return null;
    }
    return mediaClips.find(clip => clip.id === currentTimelineClip.mediaClipId) ?? null;
  }, [currentTimelineClip, mediaClips]);

  const timelineDuration = useMemo(() => {
    return timelineClips.reduce((max, clip, index) => {
      const clipDuration = clip.duration || 0;
      const start = clipOffsets[index] ?? 0;
      return Math.max(max, start + clipDuration);
    }, 0);
  }, [timelineClips, clipOffsets]);

  // Video playback control
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(console.error);
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying]);

  // Sync video time with playhead and advance between clips
  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    const video = videoRef.current;

    const handleTimeUpdate = () => {
      const timelineTime = currentClipOffset + video.currentTime;
      setCurrentTime(timelineTime);
      dispatch(setPlayheadPosition(timelineTime * pixelsPerSecond));
    };

    const handleLoadedMetadata = () => {
      const timelineTime = currentClipOffset + video.currentTime;
      setCurrentTime(timelineTime);
      dispatch(setPlayheadPosition(timelineTime * pixelsPerSecond));
      if (isPlaying) {
        video.play().catch(console.error);
      }
    };

    const handleEnded = () => {
      const nextIndex = currentClipIndex + 1;
      if (nextIndex < timelineClips.length) {
        setCurrentClipIndex(nextIndex);
      } else {
        const finalTime = timelineDuration;
        setCurrentTime(finalTime);
        dispatch(setPlayheadPosition(finalTime * pixelsPerSecond));
        dispatch(setPlaying(false));
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('ended', handleEnded);
    };
  }, [
    videoUrl,
    dispatch,
    pixelsPerSecond,
    currentClipOffset,
    isPlaying,
    currentClipIndex,
    timelineClips.length,
    timelineDuration,
  ]);

  useEffect(() => {
    dispatch(setPlayheadPosition(currentTime * pixelsPerSecond));
  }, [pixelsPerSecond, currentTime, dispatch]);

  // Keep total duration in sync with the timeline layout
  useEffect(() => {
    setTotalDuration(timelineDuration);
  }, [timelineDuration]);

  // If playback restarts while at the end, jump back to the first clip
  useEffect(() => {
    if (
      isPlaying &&
      timelineClips.length > 0 &&
      timelineDuration > 0 &&
      currentTime >= timelineDuration
    ) {
      setCurrentClipIndex(0);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
      }
      const startingOffset = clipOffsets[0] ?? 0;
      setCurrentTime(startingOffset);
      dispatch(setPlayheadPosition(startingOffset * pixelsPerSecond));
    }
  }, [
    isPlaying,
    timelineClips,
    timelineDuration,
    currentTime,
    clipOffsets,
    dispatch,
    pixelsPerSecond,
  ]);

  // Keep current clip index within bounds when timeline changes
  useEffect(() => {
    if (timelineClips.length === 0) {
      setCurrentClipIndex(0);
      setCurrentTime(0);
      dispatch(setPlayheadPosition(0));
      return;
    }

    if (currentClipIndex >= timelineClips.length) {
      setCurrentClipIndex(timelineClips.length - 1);
    }
  }, [timelineClips, currentClipIndex, dispatch]);

  // Get video URL when media clip changes
  useEffect(() => {
    let isCancelled = false;

    if (currentTimelineClip && currentMediaClip) {
      window.electronAPI.getVideoUrl(currentMediaClip.filePath)
        .then((url: string) => {
          if (!isCancelled) {
            setVideoUrl(url);
          }
        })
        .catch((error: unknown) => {
          if (!isCancelled) {
            console.error('Error getting video URL:', error);
            setVideoUrl(null);
          }
        });
    } else {
      setVideoUrl(null);
    }

    return () => {
      isCancelled = true;
    };
  }, [currentTimelineClip, currentMediaClip]);

  const handlePlayPause = () => {
    dispatch(setPlaying(!isPlaying));
  };

  const handleStop = () => {
    dispatch(setPlaying(false));
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.pause();
    }
    setCurrentClipIndex(0);
    setCurrentTime(0);
    dispatch(setPlayheadPosition(0));
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="preview">
      <div className="preview-header">
        <h3 className="preview-title">Preview</h3>
        <div className="preview-info">
          <span>1920×1080</span>
          <span>30fps</span>
        </div>
      </div>
      
      <div className="preview-content">
        <div className="preview-controls">
          <button className="btn btn-secondary">
            ⏮️
          </button>
          <button className="btn btn-primary" onClick={handlePlayPause}>
            {isPlaying ? '⏸️' : '▶️'}
          </button>
          <button className="btn btn-secondary" onClick={handleStop}>
            ⏹️
          </button>
          <button className="btn btn-secondary">
            🔄
          </button>
        </div>
        
        <div className="preview-video">
          {currentMediaClip && videoUrl ? (
            <div className="preview-video-container">
              <video
                key={currentTimelineClip?.id ?? 'preview-video'}
                ref={videoRef}
                src={videoUrl}
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'contain',
                  maxWidth: '100%',
                  maxHeight: '100%'
                }}
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    setTotalDuration(videoRef.current.duration);
                  }
                }}
                onError={(e) => {
                  console.error('Video load error:', e);
                  console.error('Video src:', videoUrl);
                }}
                controls
              />
              {isPlaying && (
                <div className="preview-playing-overlay">
                  ▶️ Playing...
                </div>
              )}
              {/* Debug info */}
              <div style={{ position: 'absolute', bottom: '10px', left: '10px', color: 'white', fontSize: '10px', background: 'rgba(0,0,0,0.7)', padding: '4px' }}>
                File: {currentMediaClip.fileName}
                <br />
                Video: {currentMediaClip.width}×{currentMediaClip.height}
                <br />
                Container: {videoRef.current?.clientWidth}×{videoRef.current?.clientHeight}
                <br />
                Preview: {document.querySelector('.app-preview')?.clientHeight}px
                <br />
                Timeline: {document.querySelector('.app-timeline')?.clientHeight}px
              </div>
            </div>
          ) : currentMediaClip && !videoUrl ? (
            <div className="preview-placeholder">
              <div className="preview-icon">⏳</div>
              <p>Loading video...</p>
              <p className="text-gray-400">Preparing video for playback</p>
            </div>
          ) : (
            <div className="preview-placeholder">
              <div className="preview-icon">🎬</div>
              <p>No video selected</p>
              <p className="text-gray-400">Drag a video to the timeline</p>
              {isPlaying && (
                <div style={{ marginTop: '10px', color: '#007AFF', fontSize: '14px' }}>
                  ▶️ Playing...
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="preview-timeline">
          <div className="preview-scrubber">
            <div 
              className="preview-progress" 
              style={{ 
                width: totalDuration > 0 ? `${(currentTime / totalDuration) * 100}%` : '0%' 
              }}
            ></div>
            <div 
              className="preview-handle" 
              style={{ 
                left: totalDuration > 0 ? `${(currentTime / totalDuration) * 100}%` : '0%' 
              }}
            ></div>
          </div>
          <div className="preview-time">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(totalDuration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Preview;
