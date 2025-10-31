import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { setPlaying, setPlayheadPosition } from '../../store/slices/timelineSlice';
import { getActiveClipsAtTime, calculateClipPlaybackTime, getPrimaryVideoClip, hasActiveClips, ActiveClipsAtTime } from '../../utils/previewUtils';
import { parseSRT, adjustSubtitleCues, getActiveSubtitle } from '../../utils/subtitleUtils';
import './Preview.css';

const Preview: React.FC = () => {
  const dispatch = useDispatch();
  const { isPlaying, tracks, pixelsPerSecond, playheadPosition } = useSelector((state: RootState) => state.timeline);
  const { clips: mediaClips } = useSelector((state: RootState) => state.media);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const overlayVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const pendingSeekRef = useRef<Map<string, number>>(new Map());
  const lastDispatchedPlayheadRef = useRef<number>(playheadPosition);
  const lastTimelineTimeRef = useRef<number>(0);
  const playheadAnimationRef = useRef<number | null>(null);
  const isSeekingRef = useRef<boolean>(false);
  const lastSeekTimeRef = useRef<number>(0);
  const isPlayingSmoothlyRef = useRef<boolean>(false); // Track if video is playing smoothly
  const playbackInitializedRef = useRef<boolean>(false); // Track if playback has been initialized
  const [currentTime, setCurrentTime] = useState(0);
  const [smoothPlayheadTime, setSmoothPlayheadTime] = useState(0); // Smooth interpolated time for playhead rendering
  const smoothPlayheadTargetRef = useRef<number>(0); // Target time for smooth interpolation
  const smoothPlayheadCurrentRef = useRef<number>(0); // Current smooth position for animation
  const smoothPlayheadAnimationRef = useRef<number | null>(null);
  const [totalDuration, setTotalDuration] = useState(0);
  const [activeClips, setActiveClips] = useState<ActiveClipsAtTime>({ video: [], audio: [], overlay: [] });
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(new Map());
  const loadingUrlsRef = useRef<Set<string>>(new Set()); // Track URLs currently being loaded
  const [activeSubtitleText, setActiveSubtitleText] = useState<string | null>(null);

  // Calculate timeline duration from all tracks
  const timelineDuration = useMemo(() => {
    let maxDuration = 0;
    tracks.forEach(track => {
      track.clips.forEach(clip => {
        const clipEnd = (clip.startTime || 0) + (clip.duration || 0);
        maxDuration = Math.max(maxDuration, clipEnd);
      });
    });
    return maxDuration;
  }, [tracks]);

  // Update active clips when time changes
  useEffect(() => {
    const timelineState = { tracks, pixelsPerSecond, playheadPosition: 0, zoom: 1, scrollPosition: 0, isPlaying: false, selectedClipIds: [], snapToGrid: true, snapToClips: true };
    const active = getActiveClipsAtTime(timelineState, mediaClips || [], currentTime);
    setActiveClips(active);
  }, [tracks, mediaClips, currentTime, pixelsPerSecond]);

  // Get primary video clip for display
  const primaryVideoClip = useMemo(() => {
    return getPrimaryVideoClip(activeClips);
  }, [activeClips]);

  // Parse and adjust subtitles for the primary video clip
  const subtitleCues = useMemo(() => {
    if (!primaryVideoClip || !primaryVideoClip.mediaClip.subtitles?.srtContent) {
      return [];
    }

    const parsedCues = parseSRT(primaryVideoClip.mediaClip.subtitles.srtContent);
    const trimIn = primaryVideoClip.clip.trimIn || 0;
    const timelineStart = primaryVideoClip.clip.startTime || 0;
    return adjustSubtitleCues(parsedCues, trimIn, timelineStart);
  }, [primaryVideoClip]);

  // Update active subtitle text based on current time
  useEffect(() => {
    if (subtitleCues.length === 0) {
      setActiveSubtitleText(null);
      return;
    }

    const subtitle = getActiveSubtitle(subtitleCues, currentTime);
    setActiveSubtitleText(subtitle);
  }, [currentTime, subtitleCues]);

  const hasVideoTrack = activeClips.video.length > 0 || activeClips.overlay.length > 0;
  const hasAudioTrack = activeClips.audio.length > 0;

  // Safe seeking function for a specific media element
  const safeSeek = useCallback((element: HTMLMediaElement | null, clipId: string, targetTime: number, force = false) => {
    if (!element || element.readyState < 1) {
      pendingSeekRef.current.set(clipId, targetTime);
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

    const currentTime = element.currentTime;
    if (Math.abs(currentTime - targetTime) < 0.1) {
      return; // Already close enough
    }

    isSeekingRef.current = true;
    lastSeekTimeRef.current = now;

    try {
      element.currentTime = targetTime;
    } catch (error) {
      console.warn('Seek failed:', error);
    } finally {
      // Reset seeking flag after a short delay
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 50);
    }
  }, []);

  // Initialize smooth playhead
  useEffect(() => {
    smoothPlayheadCurrentRef.current = currentTime;
    smoothPlayheadTargetRef.current = currentTime;
    setSmoothPlayheadTime(currentTime);
  }, []); // Only on mount

  // Smooth playhead animation loop
  useEffect(() => {
    if (!isPlaying || !isPlayingSmoothlyRef.current) {
      // Stop animation when not playing
      if (smoothPlayheadAnimationRef.current !== null) {
        cancelAnimationFrame(smoothPlayheadAnimationRef.current);
        smoothPlayheadAnimationRef.current = null;
      }
      // Sync smooth playhead to current time when paused
      smoothPlayheadCurrentRef.current = currentTime;
      setSmoothPlayheadTime(currentTime);
      smoothPlayheadTargetRef.current = currentTime;
      return;
    }

    // Start smooth animation loop
    const animate = () => {
      // Smoothly interpolate towards target
      const current = smoothPlayheadCurrentRef.current;
      const target = smoothPlayheadTargetRef.current;
      const diff = target - current;
      
      if (Math.abs(diff) > 0.001) {
        // Smooth interpolation (easing) - adjust factor for smoothness
        const step = diff * 0.5; // 0.5 = balanced speed, higher = faster catch-up
        const newTime = current + step;
        smoothPlayheadCurrentRef.current = newTime;
        setSmoothPlayheadTime(newTime);
        smoothPlayheadAnimationRef.current = requestAnimationFrame(animate);
      } else {
        // Close enough, snap to target and keep animating
        smoothPlayheadCurrentRef.current = target;
        setSmoothPlayheadTime(target);
        smoothPlayheadAnimationRef.current = requestAnimationFrame(animate);
      }
    };

    smoothPlayheadAnimationRef.current = requestAnimationFrame(animate);

    return () => {
      if (smoothPlayheadAnimationRef.current !== null) {
        cancelAnimationFrame(smoothPlayheadAnimationRef.current);
        smoothPlayheadAnimationRef.current = null;
      }
    };
  }, [isPlaying, currentTime]);

  // Update timeline position based on primary video element (or timeline time if no video)
  const updateFromTimeline = useCallback(() => {
    if (isSeekingRef.current) {
      return;
    }

    // Use primary video element as time source, or use timeline time directly
    let sourceTime: number | null = null;
    if (primaryVideoClip && videoRef.current && videoRef.current.readyState >= 1) {
      const videoTime = videoRef.current.currentTime;
      const clipStart = primaryVideoClip.clip.startTime || 0;
      const trimIn = primaryVideoClip.clip.trimIn || 0;
      // Convert video element time back to timeline time
      sourceTime = clipStart + (videoTime - trimIn);
    }

    // Fallback to currentTime if no video element
    if (sourceTime === null) {
      sourceTime = currentTime;
    }

    // Check if we've reached the end of the timeline
    if (sourceTime >= timelineDuration) {
      const finalPx = timelineDuration * pixelsPerSecond;
      setCurrentTime(timelineDuration);
      smoothPlayheadTargetRef.current = timelineDuration;
      setSmoothPlayheadTime(timelineDuration);
      lastTimelineTimeRef.current = timelineDuration;
      lastDispatchedPlayheadRef.current = finalPx;
      dispatch(setPlayheadPosition(finalPx));
      dispatch(setPlaying(false));
      isPlayingSmoothlyRef.current = false;
      playbackInitializedRef.current = false;
      return;
    }

    // Update smooth playhead target frequently for smooth animation
    smoothPlayheadTargetRef.current = sourceTime;

    // Only update currentTime state if significantly changed (prevents unnecessary re-renders)
    const timeDelta = Math.abs(sourceTime - lastTimelineTimeRef.current);
    if (timeDelta > 0.05) {
      lastTimelineTimeRef.current = sourceTime;
      setCurrentTime(sourceTime);
      
      // Update Redux playhead position less frequently
      const playheadPx = sourceTime * pixelsPerSecond;
      const playheadDelta = Math.abs(playheadPx - lastDispatchedPlayheadRef.current);
      
      // Only dispatch if playhead moved significantly (reduces Redux updates)
      if (playheadDelta > 2.0) {
        lastDispatchedPlayheadRef.current = playheadPx;
        dispatch(setPlayheadPosition(playheadPx));
      }
    }
  }, [primaryVideoClip, currentTime, pixelsPerSecond, dispatch, timelineDuration]);

  // Multi-track playback control
  useEffect(() => {
    // Control video element
    if (hasVideoTrack && videoRef.current) {
      const videoUrl = primaryVideoClip ? mediaUrls.get(primaryVideoClip.clip.id) : null;
      
      if (isPlaying) {
        // If we don't have URL yet, wait for it to load
        if (!videoUrl) {
          playbackInitializedRef.current = false;
          return;
        }

        // Ensure video source is set
        if (videoRef.current.src !== videoUrl) {
          videoRef.current.src = videoUrl;
          playbackInitializedRef.current = false;
        }

        // Only seek if playback hasn't been initialized yet or if explicitly scrubbing
        // Don't seek on every currentTime change - let video play smoothly
        if (!playbackInitializedRef.current && primaryVideoClip) {
          const playbackTime = calculateClipPlaybackTime(
            primaryVideoClip.clip,
            currentTime,
            primaryVideoClip.mediaClip
          );
          
          // Wait for video to be ready
          if (videoRef.current.readyState >= 1) {
            videoRef.current.currentTime = playbackTime;
            videoRef.current.play().then(() => {
              playbackInitializedRef.current = true;
              isPlayingSmoothlyRef.current = true;
            }).catch(error => {
              console.error('Video play error:', error);
              playbackInitializedRef.current = false;
            });
          } else {
            // Wait for metadata to load
            const handleCanPlay = () => {
              if (videoRef.current && primaryVideoClip) {
                const playbackTime = calculateClipPlaybackTime(
                  primaryVideoClip.clip,
                  currentTime,
                  primaryVideoClip.mediaClip
                );
                videoRef.current.currentTime = playbackTime;
                videoRef.current.play().then(() => {
                  playbackInitializedRef.current = true;
                  isPlayingSmoothlyRef.current = true;
                }).catch(console.error);
              }
              videoRef.current?.removeEventListener('canplay', handleCanPlay);
            };
            videoRef.current.addEventListener('canplay', handleCanPlay);
            if (!videoRef.current.src) {
              videoRef.current.src = videoUrl;
            }
            videoRef.current.load(); // Trigger load if not already loading
          }
        } else if (!videoRef.current.paused && playbackInitializedRef.current) {
          // Video is already playing smoothly - just ensure it's playing
          if (videoRef.current.paused) {
            videoRef.current.play().catch(console.error);
          }
        }
      } else {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
        playbackInitializedRef.current = false;
        isPlayingSmoothlyRef.current = false;
      }
    }

    // Control all audio elements
    activeClips.audio.forEach(({ clip, mediaClip }) => {
      const audioElement = audioRefs.current.get(clip.id);
      if (audioElement) {
        if (isPlaying) {
          // Ensure audio is at correct time before playing
          const playbackTime = calculateClipPlaybackTime(clip, currentTime, mediaClip);
          if (audioElement.readyState >= 1) {
            audioElement.currentTime = playbackTime;
          }
          audioElement.play().catch(error => {
            console.error(`Audio play error for clip ${clip.id}:`, error);
          });
        } else {
          audioElement.pause();
        }
      }
    });

    // Control overlay video elements
    activeClips.overlay.forEach(({ clip, mediaClip }) => {
      const overlayElement = overlayVideoRefs.current.get(clip.id);
      if (overlayElement) {
        if (isPlaying) {
          // Ensure overlay is at correct time before playing
          const playbackTime = calculateClipPlaybackTime(clip, currentTime, mediaClip);
          if (overlayElement.readyState >= 1) {
            overlayElement.currentTime = playbackTime;
          }
          overlayElement.play().catch(error => {
            console.error(`Overlay play error for clip ${clip.id}:`, error);
          });
        } else {
          overlayElement.pause();
        }
      }
    });
  }, [isPlaying, hasVideoTrack, activeClips, primaryVideoClip, currentTime]);


  // Handle time updates from primary video element and sync audio/overlay elements
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    // Throttle sync operations to avoid excessive seeking
    let lastSyncTime = 0;
    const SYNC_INTERVAL = 500; // Sync every 500ms max (reduced frequency)

    const syncAllMediaElements = () => {
      if (!primaryVideoClip || !video || video.readyState < 1 || video.paused) {
        return;
      }

      const now = Date.now();
      if (now - lastSyncTime < SYNC_INTERVAL) {
        return; // Skip this sync to avoid excessive seeking
      }
      lastSyncTime = now;

      const videoTime = video.currentTime;
      const clipStart = primaryVideoClip.clip.startTime || 0;
      const trimIn = primaryVideoClip.clip.trimIn || 0;
      const timelineTime = clipStart + (videoTime - trimIn);

      // Sync audio elements - only if significantly out of sync
      activeClips.audio.forEach(({ clip, mediaClip }) => {
        const audioElement = audioRefs.current.get(clip.id);
        if (audioElement && audioElement.readyState >= 1 && !audioElement.paused) {
          const clipStart = clip.startTime || 0;
          const clipEnd = clipStart + (clip.duration || 0);
          
          // Only sync if timeline time is within this clip's range
          if (timelineTime >= clipStart && timelineTime < clipEnd) {
            const playbackTime = calculateClipPlaybackTime(clip, timelineTime, mediaClip);
            const currentAudioTime = audioElement.currentTime;
            
            // Only sync if significantly out of sync (more than 0.5s difference to reduce seeks)
            if (Math.abs(currentAudioTime - playbackTime) > 0.5) {
              audioElement.currentTime = playbackTime;
            }
          }
        }
      });

      // Sync overlay video elements - only if significantly out of sync
      activeClips.overlay.forEach(({ clip, mediaClip }) => {
        const overlayElement = overlayVideoRefs.current.get(clip.id);
        if (overlayElement && overlayElement.readyState >= 1 && !overlayElement.paused) {
          const clipStart = clip.startTime || 0;
          const clipEnd = clipStart + (clip.duration || 0);
          
          // Only sync if timeline time is within this clip's range
          if (timelineTime >= clipStart && timelineTime < clipEnd) {
            const playbackTime = calculateClipPlaybackTime(clip, timelineTime, mediaClip);
            const currentOverlayTime = overlayElement.currentTime;
            
            // Only sync if significantly out of sync (more than 0.5s difference to reduce seeks)
            if (Math.abs(currentOverlayTime - playbackTime) > 0.5) {
              overlayElement.currentTime = playbackTime;
            }
          }
        }
      });
    };

    // Update timeline frequently during playback for smooth playhead
    let lastUpdateTime = 0;
    let syncCounter = 0;
    const UPDATE_INTERVAL = 16; // ~60fps updates for smooth playhead
    const SYNC_CHECK_INTERVAL = 5; // Check sync less frequently

    const handleTimeUpdate = () => {
      // Only update if video is playing smoothly
      if (isPlaying && isPlayingSmoothlyRef.current && !video.paused) {
        const now = Date.now();
        // Update timeline frequently for smooth playhead interpolation
        if (now - lastUpdateTime >= UPDATE_INTERVAL) {
          updateFromTimeline();
          lastUpdateTime = now;
        }
        // Sync much less frequently during smooth playback
        syncCounter++;
        if (syncCounter >= SYNC_CHECK_INTERVAL) {
          syncCounter = 0;
          syncAllMediaElements();
        }
      } else if (!isPlaying || video.paused) {
        // Update immediately when paused
        updateFromTimeline();
      }
    };

    const handlePlay = () => {
      updateFromTimeline();
    };

    const handlePause = () => {
      if (playheadAnimationRef.current !== null) {
        cancelAnimationFrame(playheadAnimationRef.current);
        playheadAnimationRef.current = null;
      }
      updateFromTimeline();
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      if (playheadAnimationRef.current !== null) {
        cancelAnimationFrame(playheadAnimationRef.current);
        playheadAnimationRef.current = null;
      }
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [isPlaying, updateFromTimeline, hasVideoTrack, primaryVideoClip, activeClips]);

  // Handle video metadata and seeking events
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !primaryVideoClip) {
      return;
    }

    const handleLoadedMetadata = () => {
      updateFromTimeline();
      const clipId = primaryVideoClip.clip.id;
      const pendingSeek = pendingSeekRef.current.get(clipId);
      if (pendingSeek !== undefined) {
        pendingSeekRef.current.delete(clipId);
        const playbackTime = calculateClipPlaybackTime(
          primaryVideoClip.clip,
          currentTime,
          primaryVideoClip.mediaClip
        );
        safeSeek(video, clipId, playbackTime, true);
      }
      if (isPlaying) {
        video.play().catch(console.error);
        updateFromTimeline();
      }
    };

    const handleSeeking = () => {
      isSeekingRef.current = true;
    };

    const handleSeeked = () => {
      isSeekingRef.current = false;
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('seeked', handleSeeked);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('seeked', handleSeeked);
    };
  }, [updateFromTimeline, primaryVideoClip, currentTime, isPlaying, safeSeek]);

  // Keep total duration in sync with the timeline layout
  useEffect(() => {
    lastDispatchedPlayheadRef.current = playheadPosition;
  }, [playheadPosition]);

  useEffect(() => {
    setTotalDuration(timelineDuration);
  }, [timelineDuration]);

  // Reset to beginning if playback restarts at end
  useEffect(() => {
    if (
      isPlaying &&
      timelineDuration > 0 &&
      currentTime >= timelineDuration
    ) {
      if (videoRef.current) {
        safeSeek(videoRef.current, 'primary', 0, true);
      }
      setCurrentTime(0);
      lastTimelineTimeRef.current = 0;
      dispatch(setPlayheadPosition(0));
    }
  }, [
    isPlaying,
    timelineDuration,
    currentTime,
    dispatch,
    pixelsPerSecond,
    safeSeek,
  ]);

  // Load media URLs for all active clips
  useEffect(() => {
    const cancelled = new Set<string>();

    // Load URLs for all active clips
    const allActiveClips = [
      ...activeClips.video,
      ...activeClips.audio,
      ...activeClips.overlay
    ];

    // Create stable reference to active clip IDs
    const activeClipIds = new Set(allActiveClips.map(({ clip }) => clip.id));

    allActiveClips.forEach(({ clip, mediaClip }) => {
      const clipId = clip.id;
      // Only load if we don't already have the URL and aren't already loading it
      const alreadyHasUrl = mediaUrls.has(clipId);
      const alreadyLoading = loadingUrlsRef.current.has(clipId);

      if (!alreadyHasUrl && !alreadyLoading) {
        // Mark as loading
        loadingUrlsRef.current.add(clipId);

        // Load URL asynchronously
        window.electronAPI.getVideoUrl(mediaClip.filePath)
          .then((url: string) => {
            if (!cancelled.has(clipId)) {
              loadingUrlsRef.current.delete(clipId);
              setMediaUrls(prevMap => {
                const updated = new Map(prevMap);
                if (!updated.has(clipId)) {
                  updated.set(clipId, url);
                  return updated;
                }
                return prevMap;
              });
            } else {
              loadingUrlsRef.current.delete(clipId);
            }
          })
          .catch((error: unknown) => {
            console.error(`Error getting URL for clip ${clipId}:`, error);
            loadingUrlsRef.current.delete(clipId);
          });
      }
    });

    // Clean up URLs for clips that are no longer active
    setMediaUrls(prev => {
      let changed = false;
      const updated = new Map(prev);
      for (const [clipId] of updated) {
        if (!activeClipIds.has(clipId)) {
          updated.delete(clipId);
          loadingUrlsRef.current.delete(clipId); // Also remove from loading set
          changed = true;
        }
      }
      // Only return new map if something changed
      return changed ? updated : prev;
    });

    return () => {
      // Mark all as cancelled on cleanup
      allActiveClips.forEach(({ clip }) => {
        cancelled.add(clip.id);
        loadingUrlsRef.current.delete(clip.id);
      });
    };
  }, [activeClips]); // Only depend on activeClips, not mediaUrls

  // Start playing when URL becomes available and isPlaying is true
  useEffect(() => {
    if (isPlaying && hasVideoTrack && primaryVideoClip && videoRef.current) {
      const videoUrl = mediaUrls.get(primaryVideoClip.clip.id);
      if (videoUrl && videoRef.current.src !== videoUrl) {
        const playbackTime = calculateClipPlaybackTime(
          primaryVideoClip.clip,
          currentTime,
          primaryVideoClip.mediaClip
        );
        
        videoRef.current.src = videoUrl;
        videoRef.current.load();
        
        const handleCanPlay = () => {
          if (videoRef.current && isPlaying) {
            videoRef.current.currentTime = playbackTime;
            videoRef.current.play().catch(console.error);
          }
          videoRef.current?.removeEventListener('canplay', handleCanPlay);
        };
        
        videoRef.current.addEventListener('canplay', handleCanPlay);
        
        return () => {
          videoRef.current?.removeEventListener('canplay', handleCanPlay);
        };
      }
    }
  }, [isPlaying, hasVideoTrack, primaryVideoClip, mediaUrls, currentTime]);

  // Handle playhead scrubbing from timeline (only when user scrubs, not during playback)
  useEffect(() => {
    if (pixelsPerSecond <= 0) {
      return;
    }

    // Don't scrub if video is playing smoothly - playhead updates during playback
    // should come from video timeupdate events, not manual scrubbing
    if (isPlaying && isPlayingSmoothlyRef.current && playbackInitializedRef.current) {
      // During smooth playback, ignore playhead position changes from Redux
      // The video element drives the playhead position
      return;
    }

    const targetTime = playheadPosition / pixelsPerSecond;

    if (!Number.isFinite(targetTime) || Math.abs(targetTime - currentTime) < 0.05) {
      return;
    }

    // User is scrubbing or we need to initialize playback
    setCurrentTime(targetTime);
    smoothPlayheadTargetRef.current = targetTime;
    smoothPlayheadCurrentRef.current = targetTime;
    setSmoothPlayheadTime(targetTime); // Snap smooth playhead to scrubbed position
    lastTimelineTimeRef.current = targetTime;
    playbackInitializedRef.current = false; // Reset so playback control will seek

    // Seek all active media elements to the correct time
    if (primaryVideoClip && videoRef.current) {
      const playbackTime = calculateClipPlaybackTime(
        primaryVideoClip.clip,
        targetTime,
        primaryVideoClip.mediaClip
      );
      if (videoRef.current.readyState >= 1) {
        safeSeek(videoRef.current, primaryVideoClip.clip.id, playbackTime, true);
      } else {
        pendingSeekRef.current.set(primaryVideoClip.clip.id, playbackTime);
      }
    }

    // Seek all active audio elements
    activeClips.audio.forEach(({ clip, mediaClip }) => {
      const audioElement = audioRefs.current.get(clip.id);
      if (audioElement) {
        const playbackTime = calculateClipPlaybackTime(clip, targetTime, mediaClip);
        if (audioElement.readyState >= 1) {
          safeSeek(audioElement, clip.id, playbackTime, true);
        } else {
          pendingSeekRef.current.set(clip.id, playbackTime);
        }
      }
    });

    // Seek all overlay video elements
    activeClips.overlay.forEach(({ clip, mediaClip }) => {
      const overlayElement = overlayVideoRefs.current.get(clip.id);
      if (overlayElement) {
        const playbackTime = calculateClipPlaybackTime(clip, targetTime, mediaClip);
        if (overlayElement.readyState >= 1) {
          safeSeek(overlayElement, clip.id, playbackTime, true);
        } else {
          pendingSeekRef.current.set(clip.id, playbackTime);
        }
      }
    });
  }, [
    playheadPosition,
    pixelsPerSecond,
    currentTime,
    safeSeek,
    primaryVideoClip,
    activeClips,
    isPlaying,
  ]);

  const handlePlayPause = () => {
    dispatch(setPlaying(!isPlaying));
  };

  const handleStop = () => {
    dispatch(setPlaying(false));
    // Seek all media elements to beginning
    if (primaryVideoClip && videoRef.current) {
      safeSeek(videoRef.current, primaryVideoClip.clip.id, 0, true);
      videoRef.current.pause();
    }
    activeClips.audio.forEach(({ clip }) => {
      const audioElement = audioRefs.current.get(clip.id);
      if (audioElement) {
        safeSeek(audioElement, clip.id, 0, true);
        audioElement.pause();
      }
    });
    activeClips.overlay.forEach(({ clip }) => {
      const overlayElement = overlayVideoRefs.current.get(clip.id);
      if (overlayElement) {
        safeSeek(overlayElement, clip.id, 0, true);
        overlayElement.pause();
      }
    });
    setCurrentTime(0);
    smoothPlayheadTargetRef.current = 0;
    smoothPlayheadCurrentRef.current = 0;
    setSmoothPlayheadTime(0);
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
          {hasActiveClips(activeClips) ? (
            <div className="preview-video-container" style={{ position: 'relative', width: '100%', height: '100%' }}>
              {/* Primary video track */}
              {primaryVideoClip && (
                <video
                  key={primaryVideoClip.clip.id}
                  ref={videoRef}
                  src={mediaUrls.get(primaryVideoClip.clip.id) || undefined}
                  data-timeline-clip-id={primaryVideoClip.clip.id}
                  style={{ 
                    position: hasVideoTrack ? 'absolute' : 'relative',
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'contain',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    top: 0,
                    left: 0,
                    zIndex: 1
                  }}
                  preload="metadata"
                  playsInline
                  disablePictureInPicture
                  onLoadedMetadata={() => {
                    if (videoRef.current && !hasAudioTrack) {
                      setTotalDuration(videoRef.current.duration);
                    }
                    // If playing, ensure we seek to correct time and play
                    if (isPlaying && videoRef.current && primaryVideoClip) {
                      const playbackTime = calculateClipPlaybackTime(
                        primaryVideoClip.clip,
                        currentTime,
                        primaryVideoClip.mediaClip
                      );
                      videoRef.current.currentTime = playbackTime;
                      videoRef.current.play().catch(console.error);
                    }
                  }}
                  onError={(e) => {
                    console.error('Video load error:', e);
                  }}
                  controls={false}
                />
              )}

              {/* Overlay video tracks */}
              {activeClips.overlay.map(({ clip }) => {
                const overlayUrl = mediaUrls.get(clip.id);
                if (!overlayUrl) return null;

                return (
                  <video
                    key={clip.id}
                    ref={(el) => {
                      if (el) {
                        overlayVideoRefs.current.set(clip.id, el);
                      } else {
                        overlayVideoRefs.current.delete(clip.id);
                      }
                    }}
                    src={overlayUrl}
                    data-timeline-clip-id={clip.id}
                    style={{ 
                      position: 'absolute',
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'contain',
                      maxWidth: '100%',
                      maxHeight: '100%',
                      top: 0,
                      left: 0,
                      zIndex: 2
                    }}
                    preload="metadata"
                    playsInline
                    disablePictureInPicture
                    onError={(e) => {
                      console.error(`Overlay video load error for clip ${clip.id}:`, e);
                    }}
                    controls={false}
                  />
                );
              })}

              {/* Hidden audio elements */}
              {activeClips.audio.map(({ clip }) => {
                const audioUrl = mediaUrls.get(clip.id);
                if (!audioUrl) return null;

                return (
                  <audio
                    key={clip.id}
                    ref={(el) => {
                      if (el) {
                        audioRefs.current.set(clip.id, el);
                      } else {
                        audioRefs.current.delete(clip.id);
                      }
                    }}
                    src={audioUrl}
                    data-timeline-clip-id={clip.id}
                    preload="auto"
                    onLoadedMetadata={() => {
                      const audioElement = audioRefs.current.get(clip.id);
                      if (audioElement && !hasVideoTrack) {
                        setTotalDuration(audioElement.duration);
                      }
                    }}
                    onError={(e) => {
                      console.error(`Audio load error for clip ${clip.id}:`, e);
                    }}
                    controls={false}
                    style={{ display: 'none' }}
                  />
                );
              })}

              {/* Loading state */}
              {primaryVideoClip && !mediaUrls.has(primaryVideoClip.clip.id) && (
                <div className="preview-placeholder" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                  <div className="preview-icon">⏳</div>
                  <p>Loading media...</p>
                  <p className="text-gray-400">Preparing tracks for playback</p>
                </div>
              )}

              {/* Playing indicator */}
              {isPlaying && (
                <div className="preview-playing-overlay">
                  {hasVideoTrack ? '▶️ Playing...' : '🎵 Playing...'}
                </div>
              )}

              {/* Subtitle overlay */}
              {activeSubtitleText && (
                <div className="preview-subtitle">
                  {activeSubtitleText.split('\n').map((line, index) => (
                    <div key={index}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="preview-placeholder">
              <div className="preview-icon">🎬</div>
              <p>No media selected</p>
              <p className="text-gray-400">Drag a video or audio to the timeline</p>
              {isPlaying && (
                <div style={{ marginTop: '10px', color: '#007AFF', fontSize: '14px' }}>
                  {hasVideoTrack ? '▶️ Playing...' : '🎵 Playing...'}
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
                width: totalDuration > 0 ? `${(smoothPlayheadTime / totalDuration) * 100}%` : '0%',
                transition: 'none' // Remove transition for smooth animation frame updates
              }}
            ></div>
            <div 
              className="preview-handle" 
              style={{ 
                left: totalDuration > 0 ? `${(smoothPlayheadTime / totalDuration) * 100}%` : '0%',
                transition: 'none' // Remove transition for smooth animation frame updates
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
