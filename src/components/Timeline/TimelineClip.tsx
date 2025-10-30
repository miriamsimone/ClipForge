import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { TimelineClip as TimelineClipType } from '../../types/timeline';
import { updateClip, selectClip, deselectClip, splitClip, duplicateClip, removeClip } from '../../store/slices/timelineSlice';
import ClipContextMenu, { ContextMenuAction } from './ClipContextMenu';

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
  const { selectedClipIds, playheadPosition } = useSelector((state: RootState) => state.timeline);
  const isSelected = selectedClipIds.includes(clip.id);

  const resizeStateRef = useRef<{
    edge: 'start' | 'end';
    startX: number;
    initialTrimIn: number;
    initialTrimOut: number;
    currentTrimIn: number;
    currentTrimOut: number;
  } | null>(null);
  const [previewTrim, setPreviewTrim] = useState<{ trimIn: number; trimOut: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

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

  // Calculate position based on startTime (for absolute positioning)
  const clipStartPosition = (clip.startTime || 0) * pixelsPerSecond;
  const trimOffset = isPreviewActive ? Math.max(0, leftDelta * pixelsPerSecond) : 0;
  const clipLeftPosition = clipStartPosition + trimOffset;

  const clipLabel = mediaClip?.fileName ?? clip.mediaClipId;

  const [isDragging, setIsDragging] = useState(false);

  const handleClipClick = (event: React.MouseEvent) => {
    if (event.button !== 0) return; // Only handle left click
    event.stopPropagation();

    if (isSelected) {
      dispatch(deselectClip(clip.id));
    } else {
      dispatch(selectClip(clip.id));
    }
  };

  const handleDragStart = (event: React.DragEvent) => {
    // Don't allow dragging if we're resizing
    if (resizeStateRef.current) {
      event.preventDefault();
      return;
    }

    setIsDragging(true);

    // Select clip if not already selected
    if (!isSelected) {
      dispatch(selectClip(clip.id));
    }

    // Calculate offset within the clip where the drag started
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetTimeSeconds = offsetX / pixelsPerSecond;

    // Store clip data for drop handler
    const dragData = {
      type: 'timeline-clip',
      clipId: clip.id,
      trackId: trackId,
      clip: clip,
      dragOffsetSeconds: offsetTimeSeconds // Store the offset where user grabbed the clip
    };

    event.dataTransfer.setData('application/json', JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = 'move';

    // Set drag image to show we're moving a clip
    const dragImage = event.currentTarget.cloneNode(true) as HTMLElement;
    dragImage.style.opacity = '0.7';
    document.body.appendChild(dragImage);
    event.dataTransfer.setDragImage(dragImage, offsetX, 20);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    // Select clip if not already selected
    if (!isSelected) {
      dispatch(selectClip(clip.id));
    }

    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const handleSplit = () => {
    const clipStart = clip.startTime || 0;
    const clipEnd = clipStart + (clip.duration || 0);

    // Convert playhead position from pixels to seconds
    const playheadTimeSeconds = playheadPosition / pixelsPerSecond;

    // Check if playhead is within clip
    if (playheadTimeSeconds >= clipStart && playheadTimeSeconds <= clipEnd) {
      dispatch(splitClip({
        trackId,
        clipId: clip.id,
        splitTime: playheadTimeSeconds
      }));
    } else {
      console.warn('Playhead not within clip bounds for split');
    }
  };

  const handleDuplicate = () => {
    dispatch(duplicateClip({
      trackId,
      clipId: clip.id
    }));
  };

  const handleDelete = () => {
    dispatch(removeClip({
      trackId,
      clipId: clip.id
    }));
  };

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const splitShortcut = isMac ? '⌘K or S' : 'Ctrl+K or S';
  const duplicateShortcut = isMac ? '⌘D' : 'Ctrl+D';

  const clipStart = clip.startTime || 0;
  const clipEnd = clipStart + (clip.duration || 0);

  // Convert playhead position from pixels to seconds for comparison
  const playheadTimeSeconds = playheadPosition / pixelsPerSecond;
  const canSplit = playheadTimeSeconds >= clipStart && playheadTimeSeconds <= clipEnd;

  const contextMenuActions: ContextMenuAction[] = [
    {
      label: 'Split at Playhead',
      icon: '✂️',
      shortcut: splitShortcut,
      onClick: handleSplit,
      disabled: !canSplit
    },
    {
      label: 'Duplicate',
      icon: '📋',
      shortcut: duplicateShortcut,
      onClick: handleDuplicate
    },
    {
      label: 'Delete',
      icon: '🗑️',
      shortcut: 'Del',
      onClick: handleDelete
    }
  ];

  return (
    <>
      <div
        className={`timeline-clip ${isSelected ? 'timeline-clip--selected' : ''} ${isDragging ? 'timeline-clip--dragging' : ''}`}
        style={{
          left: `${clipLeftPosition}px`,
          width: `${visualWidth}px`,
        }}
        title={clipLabel}
        draggable={!resizeStateRef.current}
        onClick={handleClipClick}
        onContextMenu={handleContextMenu}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
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

      {contextMenu && (
        <ClipContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextMenuActions}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
};

export default TimelineClip;
