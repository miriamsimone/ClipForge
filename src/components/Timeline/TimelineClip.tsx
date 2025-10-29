import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { TimelineClip as TimelineClipType } from '../../types/timeline';
import { updateClip } from '../../store/slices/timelineSlice';

interface TimelineClipProps {
  clip: TimelineClipType;
  trackId: number;
  pixelsPerSecond: number;
  minWidth: number;
}

const MIN_DURATION_SECONDS = 0.1;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const TimelineClip: React.FC<TimelineClipProps> = ({ clip, trackId, pixelsPerSecond, minWidth }) => {
  const dispatch = useDispatch();
  const mediaClip = useSelector((state: RootState) =>
    state.media.clips.find(item => item.id === clip.mediaClipId)
  );

  const resizeStateRef = useRef<{
    edge: 'start' | 'end';
    startX: number;
    initialTrimIn: number;
    initialTrimOut: number;
    currentTrimIn: number;
    currentTrimOut: number;
  } | null>(null);
  const [previewTrim, setPreviewTrim] = useState<{ trimIn: number; trimOut: number } | null>(null);

  const sourceDuration = useMemo(() => {
    if (mediaClip?.duration) {
      return mediaClip.duration;
    }
    if (typeof clip.trimOut === 'number') {
      return clip.trimOut;
    }
    return clip.duration || 0;
  }, [mediaClip, clip.trimOut, clip.duration]);

  const commitTrimUpdate = useCallback((trimIn: number, trimOut: number) => {
    const nextDuration = Math.max(MIN_DURATION_SECONDS, trimOut - trimIn);
    dispatch(updateClip({
      trackId,
      clipId: clip.id,
      updates: {
        trimIn,
        trimOut,
        duration: nextDuration,
      },
    }));
  }, [clip.id, dispatch, trackId]);

  const handleResizeMouseMove = useCallback((event: MouseEvent) => {
    if (!resizeStateRef.current || pixelsPerSecond <= 0) {
      return;
    }

    const { edge, startX, initialTrimIn, initialTrimOut } = resizeStateRef.current;
    const deltaPixels = event.clientX - startX;
    const deltaSeconds = deltaPixels / pixelsPerSecond;

    if (edge === 'start') {
      const maxTrimIn = initialTrimOut - MIN_DURATION_SECONDS;
      const nextTrimIn = clamp(initialTrimIn + deltaSeconds, 0, maxTrimIn);
      resizeStateRef.current.currentTrimIn = nextTrimIn;
      setPreviewTrim({ trimIn: nextTrimIn, trimOut: resizeStateRef.current.currentTrimOut });
    } else {
      const minTrimOut = initialTrimIn + MIN_DURATION_SECONDS;
      const maxTrimOut = sourceDuration;
      const nextTrimOut = clamp(initialTrimOut + deltaSeconds, minTrimOut, maxTrimOut);
      resizeStateRef.current.currentTrimOut = nextTrimOut;
      setPreviewTrim({ trimIn: resizeStateRef.current.currentTrimIn, trimOut: nextTrimOut });
    }
  }, [pixelsPerSecond, sourceDuration]);

  const handleMouseUp = useCallback(() => {
    window.removeEventListener('mousemove', handleResizeMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);

    const state = resizeStateRef.current;
    resizeStateRef.current = null;
    if (state) {
      commitTrimUpdate(state.currentTrimIn, state.currentTrimOut);
    }
    setPreviewTrim(null);
  }, [commitTrimUpdate, handleResizeMouseMove]);

  const startResizing = useCallback((edge: 'start' | 'end') => (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();

    resizeStateRef.current = {
      edge,
      startX: event.clientX,
      initialTrimIn: clip.trimIn ?? 0,
      initialTrimOut: clip.trimOut ?? clip.duration ?? 0,
      currentTrimIn: clip.trimIn ?? 0,
      currentTrimOut: clip.trimOut ?? clip.duration ?? 0,
    };
    setPreviewTrim({
      trimIn: clip.trimIn ?? 0,
      trimOut: clip.trimOut ?? clip.duration ?? 0,
    });

    window.addEventListener('mousemove', handleResizeMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [clip.duration, clip.trimIn, clip.trimOut, handleMouseUp, handleResizeMouseMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleResizeMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseUp, handleResizeMouseMove]);

  const baseTrimIn = clip.trimIn ?? 0;
  const baseTrimOut = clip.trimOut ?? clip.duration ?? Math.max(baseTrimIn + MIN_DURATION_SECONDS, baseTrimIn);
  const baseDuration = Math.max(MIN_DURATION_SECONDS, (baseTrimOut - baseTrimIn) || MIN_DURATION_SECONDS);

  const previewTrimIn = previewTrim?.trimIn ?? baseTrimIn;
  const previewTrimOut = previewTrim?.trimOut ?? baseTrimOut;
  const leftDelta = Math.max(0, previewTrimIn - baseTrimIn);
  const rightDelta = Math.max(0, baseTrimOut - previewTrimOut);
  const previewDuration = Math.max(
    MIN_DURATION_SECONDS,
    baseDuration - leftDelta - rightDelta
  );

  const isPreviewActive = previewTrim !== null;
  const visualWidthDuration = isPreviewActive ? previewDuration : baseDuration;
  const visualWidth = Math.max(visualWidthDuration * pixelsPerSecond, minWidth);
  const leftOffset = isPreviewActive ? Math.max(0, leftDelta * pixelsPerSecond) : 0;
  const clipLabel = mediaClip?.fileName ?? clip.mediaClipId;

  return (
    <div
      className="timeline-clip"
      style={{
        width: `${visualWidth}px`,
        flexBasis: `${visualWidth}px`,
        marginLeft: `${leftOffset}px`,
      }}
      title={clipLabel}
    >
      <div
        className="timeline-clip-handle timeline-clip-handle--start"
        onMouseDown={startResizing('start')}
      />
      <div className="timeline-clip-content">
        <div className="timeline-clip-name">{clipLabel}</div>
        <div className="timeline-clip-duration">
          {visualWidthDuration.toFixed(2)}s
        </div>
      </div>
      <div
        className="timeline-clip-handle timeline-clip-handle--end"
        onMouseDown={startResizing('end')}
      />
    </div>
  );
};

export default TimelineClip;
