import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setPlaying, setPlayheadPosition } from '../../store/slices/timelineSlice';
import './Preview.css';

const Preview: React.FC = () => {
  const dispatch = useDispatch();
  const { isPlaying, tracks, pixelsPerSecond, playheadPosition } = useSelector((state: RootState) => state.timeline);
  const { clips: mediaClips } = useSelector((state: RootState) => state.media);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const lastDispatchedPlayheadRef = useRef<number>(playheadPosition);
  const lastTimelineTimeRef = useRef<number>(0);
  const playheadAnimationRef = useRef<number | null>(null);
  const isSeekingRef = useRef<boolean>(false);
  const lastSeekTimeRef = useRef<number>(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);

  const timelineClips = useMemo(() => {
    // Get all clips from all tracks with their track information
    const allClips = tracks?.flatMap(track => 
      (track.clips || []).map(clip => ({
        clip,
        trackType: track.type as 'video' | 'audio' | 'overlay',
        trackId: track.id
      }))
    ) ?? [];
    
    // Sort by start time, prioritizing video tracks
    const sorted = allClips
      .slice()
      .sort((a, b) => {
        const startA = typeof a.clip.startTime === 'number' ? a.clip.startTime : 0;
        const startB = typeof b.clip.startTime === 'number' ? b.clip.startTime : 0;
        if (startA === startB) {
          // Prioritize video tracks over audio tracks when start times match
          const typePriority: Record<string, number> = { video: 1, overlay: 2, audio: 3 };
          const priorityA = typePriority[a.trackType] || 999;
          const priorityB = typePriority[b.trackType] || 999;
          if (priorityA !== priorityB) {
            return priorityA - priorityB;
          }
          return a.clip.id.localeCompare(b.clip.id);
        }
        return startA - startB;
      });
    
    // Debug: log all sorted clips
    console.log('Timeline clips sorted:', sorted.map((entry, idx) => {
      const mediaClip = mediaClips?.find(mc => mc.id === entry.clip.mediaClipId);
      return {
        index: idx,
        clipId: entry.clip.id,
        trackType: entry.trackType,
        startTime: entry.clip.startTime,
        duration: entry.clip.duration,
        mediaClipFileName: mediaClip?.fileName,
        hasVideo: mediaClip?.hasVideo,
        hasAudio: mediaClip?.hasAudio
      };
    }));
    
    return sorted;
  }, [tracks, mediaClips]);

  const clipOffsets = useMemo(() => {
    let runningOffset = 0;
    return timelineClips.map(({ clip }) => {
      const clipDuration = clip.duration || 0;
      const explicitStart = typeof clip.startTime === 'number' ? clip.startTime : null;
      const offset = explicitStart !== null ? explicitStart : runningOffset;
      runningOffset = Math.max(runningOffset, offset + clipDuration);
      return offset;
    });
  }, [timelineClips]);

  const timelineDuration = useMemo(() => {
    return timelineClips.reduce((max, { clip }, index) => {
      const clipDuration = clip.duration || 0;
      const start = clipOffsets[index] ?? 0;
      return Math.max(max, start + clipDuration);
    }, 0);
  }, [timelineClips, clipOffsets]);



  const currentTimelineClipEntry = timelineClips[currentClipIndex] ?? null;
  const currentTimelineClip = currentTimelineClipEntry?.clip ?? null;
  const currentClipOffset = clipOffsets[currentClipIndex] ?? 0;

  const currentMediaClip = useMemo(() => {
    if (!currentTimelineClip || !mediaClips) {
      return null;
    }
    return mediaClips.find(clip => clip.id === currentTimelineClip.mediaClipId) ?? null;
  }, [currentTimelineClip, mediaClips]);

  // Check if current clip is audio-only
  // Use trackType from the entry instead of mediaClip.hasVideo to properly detect audio-only clips
  const isAudioOnly = currentTimelineClipEntry 
    ? currentTimelineClipEntry.trackType === 'audio'
    : (currentMediaClip && !currentMediaClip.hasVideo && currentMediaClip.hasAudio);
  
  // Debug logging
  console.log('Preview clip info:', {
    clipIndex: currentClipIndex,
    clipId: currentTimelineClip?.id,
    trackType: currentTimelineClipEntry?.trackType,
    mediaClipId: currentTimelineClip?.mediaClipId,
    hasVideo: currentMediaClip?.hasVideo,
    hasAudio: currentMediaClip?.hasAudio,
    isAudioOnly,
    mediaClipFileName: currentMediaClip?.fileName
  });

  // Safe seeking function to prevent concurrent seeks
  const safeSeek = useCallback((targetTime: number, force = false) => {
    const mediaElement = isAudioOnly ? audioRef.current : videoRef.current;
    if (!mediaElement || mediaElement.readyState < 1) {
      pendingSeekRef.current = targetTime;
      return;
    }

    // Prevent concurrent seeks unless forced
    if (isSeekingRef.current && !force) {
      return;
    }

    // Throttle seeks to prevent rapid-fire seeking
    const now = Date.now();
    if (now - lastSeekTimeRef.current < 100 && !force) {
      return;
    }

    const currentTime = mediaElement.currentTime;
    if (Math.abs(currentTime - targetTime) < 0.1) {
      return; // Already close enough
    }

    isSeekingRef.current = true;
    lastSeekTimeRef.current = now;

    try {
      mediaElement.currentTime = targetTime;
    } catch (error) {
      console.warn('Seek failed:', error);
    } finally {
      // Reset seeking flag after a short delay
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 50);
    }
  }, [isAudioOnly]);

  const advanceToClip = useCallback((nextIndex: number) => {

    if (nextIndex >= timelineClips.length) {
      const finalTime = timelineDuration;
      const finalPx = finalTime * pixelsPerSecond;
      setCurrentClipIndex(Math.max(0, timelineClips.length - 1));
      setCurrentTime(finalTime);
      lastTimelineTimeRef.current = finalTime;
      lastDispatchedPlayheadRef.current = finalPx;
      dispatch(setPlayheadPosition(finalPx));
      dispatch(setPlaying(false));
      return;
    }

    const nextClipEntry = timelineClips[nextIndex];
    const nextClip = nextClipEntry?.clip;
    const nextOffset = clipOffsets[nextIndex] ?? 0;
    const trimIn = nextClip?.trimIn ?? 0;
    const playheadPx = nextOffset * pixelsPerSecond;

    setCurrentClipIndex(nextIndex);
    setCurrentTime(nextOffset);
    lastTimelineTimeRef.current = nextOffset;
    lastDispatchedPlayheadRef.current = playheadPx;
    dispatch(setPlayheadPosition(playheadPx));
    pendingSeekRef.current = trimIn;

    const mediaElement = isAudioOnly ? audioRef.current : videoRef.current;
    if (mediaElement) {
      const isSameSrc = mediaElement.dataset.timelineClipId === nextClip?.id;

      if (mediaElement.readyState >= 1 && isSameSrc) {
        safeSeek(trimIn, true); // Force seek when advancing clips
      }
      
      // Resume playback if we're supposed to be playing
      if (isPlaying) {
        mediaElement.play().catch(console.error);
      }
    }
  }, [clipOffsets, timelineClips, timelineDuration, dispatch, pixelsPerSecond, safeSeek, isPlaying, isAudioOnly]);

  const currentTrimIn = currentTimelineClip?.trimIn ?? 0;
  const originalMediaDuration = currentTimelineClip && currentMediaClip
    ? currentMediaClip.duration
    : currentTimelineClip?.duration ?? 0;
  const trimOut = currentTimelineClip?.trimOut ?? originalMediaDuration;
  const currentTrimmedDuration = Math.max(0, trimOut - currentTrimIn);

  // Video/Audio playback control
  useEffect(() => {
    if (isAudioOnly && audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(console.error);
      } else {
        audioRef.current.pause();
      }
    } else if (!isAudioOnly && videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(console.error);
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, isAudioOnly]);

  const updateFromVideo = useCallback(() => {
    const mediaElement = isAudioOnly ? audioRef.current : videoRef.current;
    if (!mediaElement || isSeekingRef.current) {
      return; // Skip updates during seeking to prevent conflicts
    }

    const sourceTime = mediaElement.currentTime;
    const relativeTime = Math.max(0, sourceTime - currentTrimIn);
    const timelineTime = currentClipOffset + relativeTime;
    const playheadPx = timelineTime * pixelsPerSecond;

    // Update local state for preview timeline (smooth)
    if (Math.abs(timelineTime - lastTimelineTimeRef.current) > 0.001) {
      lastTimelineTimeRef.current = timelineTime;
      setCurrentTime(prev => (Math.abs(prev - timelineTime) > 0.001 ? timelineTime : prev));
    }

    // Only update Redux if playhead moved significantly (throttle updates)
    // Use a small threshold to reduce dispatches while keeping it smooth
    const playheadDelta = Math.abs(playheadPx - lastDispatchedPlayheadRef.current);
    if (playheadDelta > 1.0) { // Only dispatch if moved more than 1 pixel
      lastDispatchedPlayheadRef.current = playheadPx;
      // Dispatch synchronously - requestAnimationFrame in updateFromVideo is already async
      dispatch(setPlayheadPosition(playheadPx));
    }

    // Check if we've reached the end of the current clip
    if (currentTrimmedDuration > 0 && relativeTime >= currentTrimmedDuration - 0.002) {
      // Check if there's a next clip
      const nextIndex = currentClipIndex + 1;

      if (nextIndex >= timelineClips.length) {
        // No more clips, stop playback
        const finalTime = timelineDuration;
        const finalPx = finalTime * pixelsPerSecond;
        setCurrentClipIndex(Math.max(0, timelineClips.length - 1));
        setCurrentTime(finalTime);
        lastTimelineTimeRef.current = finalTime;
        lastDispatchedPlayheadRef.current = finalPx;
        dispatch(setPlayheadPosition(finalPx));
        dispatch(setPlaying(false));
        return;
      }

      const currentClipEndTime = currentClipOffset + currentTrimmedDuration;
      const nextClipStartTime = clipOffsets[nextIndex] ?? 0;
      const gapDuration = nextClipStartTime - currentClipEndTime;

      // If there's a gap, pause video but keep playback active to animate through gap
      if (gapDuration > 0.05) {
        console.log('Gap detected:', {
          currentClipEndTime,
          nextClipStartTime,
          gapDuration
        });

        const mediaElement = isAudioOnly ? audioRef.current : videoRef.current;
        if (mediaElement) {
          mediaElement.pause();
        }

        // Calculate how long the gap should take at 1x speed (in milliseconds)
        const gapDurationMs = gapDuration * 1000;
        const startTime = performance.now();
        const startTimelineTime = currentClipEndTime;

        // Continue animating playhead through the gap
        const animateGap = () => {
          const elapsed = performance.now() - startTime;
          const progress = Math.min(elapsed / gapDurationMs, 1.0);
          const newTime = startTimelineTime + (gapDuration * progress);
          const newPx = newTime * pixelsPerSecond;

          setCurrentTime(newTime);
          lastTimelineTimeRef.current = newTime;
          lastDispatchedPlayheadRef.current = newPx;
          dispatch(setPlayheadPosition(newPx));

          console.log('Animating gap:', {
            elapsed,
            progress,
            newTime,
            nextClipStartTime
          });

          // If we've reached the next clip, start playing it
          if (progress >= 1.0 || newTime >= nextClipStartTime - 0.01) {
            console.log('Gap animation complete, advancing to next clip');
            advanceToClip(nextIndex);
            
            // Resume playback after advancing to next clip
            if (isPlaying) {
              const mediaElement = isAudioOnly ? audioRef.current : videoRef.current;
              if (mediaElement) {
                mediaElement.play().catch(console.error);
              }
            }
          } else if (isPlaying) {
            requestAnimationFrame(animateGap);
          }
        };
        requestAnimationFrame(animateGap);
      } else {
        // No gap, immediately advance to next clip
        advanceToClip(nextIndex);
      }
    }
  }, [
    currentTrimIn,
    currentClipOffset,
    pixelsPerSecond,
    dispatch,
    currentTrimmedDuration,
    advanceToClip,
    currentClipIndex,
    timelineClips,
    clipOffsets,
    timelineDuration,
    isPlaying,
    isAudioOnly,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    const mediaElement = isAudioOnly ? audio : video;
    
    if (!mediaElement) {
      return;
    }

    const handleTimeUpdate = () => {
      updateFromVideo();
    };

    const handlePlay = () => {
      // Start a smooth animation loop for playhead updates
      const animate = () => {
        updateFromVideo();
        if (isPlaying && !mediaElement.paused) {
          playheadAnimationRef.current = requestAnimationFrame(animate);
        }
      };
      animate();
    };

    const handlePause = () => {
      if (playheadAnimationRef.current !== null) {
        cancelAnimationFrame(playheadAnimationRef.current);
        playheadAnimationRef.current = null;
      }
      updateFromVideo();
    };

    // Use timeupdate as a fallback for smooth updates
    mediaElement.addEventListener('timeupdate', handleTimeUpdate);
    mediaElement.addEventListener('play', handlePlay);
    mediaElement.addEventListener('pause', handlePause);

    if (isPlaying && !mediaElement.paused) {
      handlePlay();
    }

    return () => {
      if (playheadAnimationRef.current !== null) {
        cancelAnimationFrame(playheadAnimationRef.current);
        playheadAnimationRef.current = null;
      }
      mediaElement.removeEventListener('timeupdate', handleTimeUpdate);
      mediaElement.removeEventListener('play', handlePlay);
      mediaElement.removeEventListener('pause', handlePause);
    };
  }, [isPlaying, updateFromVideo, isAudioOnly]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const handleLoadedMetadata = () => {
      updateFromVideo();
      if (pendingSeekRef.current !== null) {
        const seekTime = pendingSeekRef.current;
        pendingSeekRef.current = null;
        safeSeek(seekTime, true); // Force seek after metadata loads
      }
      if (isPlaying) {
        video.play().catch(console.error);
        updateFromVideo();
      }
    };

    const handleEnded = () => {
      advanceToClip(currentClipIndex + 1);
    };

    const handleSeeking = () => {
      isSeekingRef.current = true;
    };

    const handleSeeked = () => {
      isSeekingRef.current = false;
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('seeked', handleSeeked);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('seeked', handleSeeked);
    };
  }, [updateFromVideo, advanceToClip, currentClipIndex, isPlaying, safeSeek]);

  // Keep total duration in sync with the timeline layout
  useEffect(() => {
    lastDispatchedPlayheadRef.current = playheadPosition;
  }, [playheadPosition]);

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
        safeSeek(0, true); // Force seek to beginning
      }
      const startingOffset = clipOffsets[0] ?? 0;
      setCurrentTime(startingOffset);
      lastTimelineTimeRef.current = startingOffset;
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
      lastTimelineTimeRef.current = 0;
      lastDispatchedPlayheadRef.current = 0;
      dispatch(setPlayheadPosition(0));
      return;
    }

    if (currentClipIndex >= timelineClips.length) {
      setCurrentClipIndex(timelineClips.length - 1);
    }
  }, [timelineClips, currentClipIndex, dispatch]);

  // Get media URL when media clip changes
  useEffect(() => {
    let isCancelled = false;

    if (currentTimelineClip && currentMediaClip) {
      const trimIn = currentTimelineClip.trimIn ?? 0;
      pendingSeekRef.current = trimIn;

      if (isAudioOnly) {
        // Load audio URL for audio-only tracks
        window.electronAPI.getVideoUrl(currentMediaClip.filePath)
          .then((url: string) => {
            if (!isCancelled) {
              setAudioUrl(url);
              setVideoUrl(null);
            }
          })
          .catch((error: unknown) => {
            if (!isCancelled) {
              console.error('Error getting audio URL:', error);
              setAudioUrl(null);
            }
          });
      } else {
        // Load video URL for video tracks
        window.electronAPI.getVideoUrl(currentMediaClip.filePath)
          .then((url: string) => {
            if (!isCancelled) {
              setVideoUrl(url);
              setAudioUrl(null);
            }
          })
          .catch((error: unknown) => {
            if (!isCancelled) {
              console.error('Error getting video URL:', error);
              setVideoUrl(null);
            }
          });
      }
    } else {
      setVideoUrl(null);
      setAudioUrl(null);
    }

    return () => {
      isCancelled = true;
    };
  }, [currentTimelineClip, currentMediaClip, isAudioOnly]);

  useEffect(() => {
    if (!timelineClips.length || pixelsPerSecond <= 0) {
      return;
    }

    const targetTime = playheadPosition / pixelsPerSecond;

    if (!Number.isFinite(targetTime) || Math.abs(targetTime - currentTime) < 0.02) {
      return;
    }

    const clipIndex = timelineClips.findIndex(({ clip }, index) => {
      const clipOffset = clipOffsets[index] ?? 0;
      const clipDuration = clip.duration || 0;
      return targetTime >= clipOffset && targetTime <= clipOffset + clipDuration;
    });

    if (clipIndex === -1) {
      setCurrentTime(targetTime);
      lastTimelineTimeRef.current = targetTime;
      if (videoRef.current) {
        videoRef.current.pause();
      }
      return;
    }

    const clipOffset = clipOffsets[clipIndex] ?? 0;
    const clipEntry = timelineClips[clipIndex];
    const clip = clipEntry?.clip;
    if (!clip) return;
    const trimIn = clip.trimIn ?? 0;
    const relativeTimelineTime = Math.max(0, targetTime - clipOffset);
    const limitedTimelineTime = clip.duration
      ? Math.min(relativeTimelineTime, clip.duration)
      : relativeTimelineTime;
    const mediaTime = trimIn + limitedTimelineTime;

    setCurrentClipIndex(clipIndex);
    setCurrentTime(targetTime);
    lastTimelineTimeRef.current = targetTime;

    if (videoRef.current) {
      if (videoRef.current.readyState >= 1) {
        safeSeek(mediaTime, true); // Force seek for timeline scrubbing
      } else {
        pendingSeekRef.current = mediaTime;
      }
    } else {
      pendingSeekRef.current = mediaTime;
    }
  }, [
    playheadPosition,
    pixelsPerSecond,
    timelineClips,
    clipOffsets,
    currentTime,
    safeSeek,
  ]);

  const handlePlayPause = () => {
    dispatch(setPlaying(!isPlaying));
  };

  const handleStop = () => {
    dispatch(setPlaying(false));
    if (videoRef.current) {
      safeSeek(0, true); // Force seek to beginning
      videoRef.current.pause();
    }
    setCurrentClipIndex(0);
    setCurrentTime(0);
    lastTimelineTimeRef.current = 0;
    lastDispatchedPlayheadRef.current = 0;
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
          {currentMediaClip && (videoUrl || audioUrl) ? (
            <div className="preview-video-container">
              {isAudioOnly ? (
                <audio
                  key={currentTimelineClip?.id ?? 'preview-audio'}
                  ref={audioRef}
                  src={audioUrl || undefined}
                  data-timeline-clip-id={currentTimelineClip?.id ?? ''}
                  preload="auto"
                  onLoadedMetadata={() => {
                    if (audioRef.current) {
                      setTotalDuration(audioRef.current.duration);
                    }
                  }}
                  onError={(e) => {
                    console.error('Audio load error:', e);
                    console.error('Audio src:', audioUrl);
                  }}
                  controls={false}
                  style={{ display: 'none' }}
                />
              ) : (
                <video
                  key={currentTimelineClip?.id ?? 'preview-video'}
                  ref={videoRef}
                  src={videoUrl || undefined}
                  data-timeline-clip-id={currentTimelineClip?.id ?? ''}
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'contain',
                    maxWidth: '100%',
                    maxHeight: '100%'
                  }}
                  preload="auto"
                  playsInline
                  disablePictureInPicture
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      setTotalDuration(videoRef.current.duration);
                    }
                  }}
                  onError={(e) => {
                    console.error('Video load error:', e);
                    console.error('Video src:', videoUrl);
                  }}
                  controls={false}
                />
              )}
              {isPlaying && (
                <div className="preview-playing-overlay">
                  {isAudioOnly ? '🎵 Playing...' : '▶️ Playing...'}
                </div>
              )}
            </div>
          ) : currentMediaClip && !videoUrl && !audioUrl ? (
            <div className="preview-placeholder">
              <div className="preview-icon">⏳</div>
              <p>Loading {isAudioOnly ? 'audio' : 'video'}...</p>
              <p className="text-gray-400">Preparing {isAudioOnly ? 'audio' : 'video'} for playback</p>
            </div>
          ) : (
            <div className="preview-placeholder">
              <div className="preview-icon">🎬</div>
              <p>No media selected</p>
              <p className="text-gray-400">Drag a video or audio to the timeline</p>
              {isPlaying && (
                <div style={{ marginTop: '10px', color: '#007AFF', fontSize: '14px' }}>
                  {isAudioOnly ? '🎵 Playing...' : '▶️ Playing...'}
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
