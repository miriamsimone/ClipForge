import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { splitClip, duplicateClip, removeClip } from '../store/slices/timelineSlice';

export const useKeyboardShortcuts = () => {
  const dispatch = useDispatch();
  const { tracks, playheadPosition, selectedClipIds, pixelsPerSecond } = useSelector((state: RootState) => state.timeline);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;

      // Split at playhead: S or Cmd/Ctrl+K
      if (event.key === 's' || event.key === 'S' || (cmdOrCtrl && event.key === 'k')) {
        event.preventDefault();
        handleSplit();
      }

      // Duplicate: Cmd/Ctrl+D
      if (cmdOrCtrl && event.key === 'd') {
        event.preventDefault();
        handleDuplicate();
      }

      // Delete: Delete or Backspace
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        handleDelete(event.shiftKey); // Shift+Delete for ripple delete
      }
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

          console.log('Split check:', {
            playheadPixels: playheadPosition,
            playheadSeconds: playheadTimeSeconds,
            clipStart,
            clipEnd,
            pixelsPerSecond
          });

          if (playheadTimeSeconds >= clipStart && playheadTimeSeconds <= clipEnd) {
            // Use the playhead time in seconds for split
            const splitTime = playheadTimeSeconds;

            console.log('Splitting clip:', {
              clipId: clip.id,
              trackId: track.id,
              splitTime,
              clipStart,
              clipEnd
            });

            dispatch(splitClip({
              trackId: track.id,
              clipId: clip.id,
              splitTime
            }));
            return;
          } else {
            console.log('Playhead not within selected clip bounds');
          }
        }
      }
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
          console.log('Duplicating clip:', clip.id);
          dispatch(duplicateClip({
            trackId: track.id,
            clipId: clip.id
          }));
          return;
        }
      }
    };

    const handleDelete = (ripple: boolean) => {
      if (selectedClipIds.length === 0) {
        console.log('No clip selected for delete');
        return;
      }

      // Delete all selected clips
      for (const track of tracks) {
        for (const clip of track.clips) {
          if (selectedClipIds.includes(clip.id)) {
            console.log('Deleting clip:', clip.id, ripple ? '(ripple)' : '(normal)');
            dispatch(removeClip({
              trackId: track.id,
              clipId: clip.id
            }));

            // TODO: Implement ripple delete (shift remaining clips)
            if (ripple) {
              console.log('Ripple delete not yet implemented');
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dispatch, tracks, playheadPosition, selectedClipIds, pixelsPerSecond]);
};
