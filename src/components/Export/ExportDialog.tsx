import React, { useEffect, useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../../store';
import { closeAllModals } from '../../store/slices/uiSlice';
import { startExport, getExportProgress, cancelExport, resetExport } from '../../store/slices/exportSlice';
import { ExportOptions, ExportTimelineClip } from '../../types/export';
import './ExportDialog.css';

type ResolutionOption = '480p' | '720p' | '1080p' | 'source';
type FrameRateOption = '24' | '30' | '60' | 'source';
type QualityOption = 'low' | 'medium' | 'high' | 'maximum';

const ExportDialog: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { isExporting, progress, error } = useSelector((state: RootState) => state.export);
  const { tracks } = useSelector((state: RootState) => state.timeline);
  const { clips: mediaClips } = useSelector((state: RootState) => state.media);
  const timelineEmptyMessage = 'Add clips to the timeline before exporting.';
  const [outputPath, setOutputPath] = useState('~/Desktop/ClipForge_Export.mp4');
  const [container, setContainer] = useState<'mp4' | 'mov'>('mp4');
  const [resolution, setResolution] = useState<ResolutionOption>('1080p');
  const [framerate, setFramerate] = useState<FrameRateOption>('30');
  const [quality, setQuality] = useState<QualityOption>('high');
  const [formError, setFormError] = useState<string | null>(null);

  const handleClose = () => {
    if (isExporting) {
      return;
    }
    dispatch(resetExport());
    dispatch(closeAllModals());
  };

  const timelineClipsForExport = useMemo<ExportTimelineClip[]>(() => {
    const flattened = tracks.flatMap(track =>
      track.clips.map(clip => {
        const mediaClip = mediaClips.find(item => item.id === clip.mediaClipId);
        if (!mediaClip) {
          return null;
        }

        const baseTrimIn = Math.max(0, Number(clip.trimIn ?? 0));
        const baseDuration = clip.duration ?? mediaClip.duration ?? 0;
        const rawTrimOut = Number.isFinite(clip.trimOut)
          ? Number(clip.trimOut)
          : baseTrimIn + baseDuration;
        const boundedTrimOut = Math.max(baseTrimIn, Math.min(rawTrimOut, mediaClip.duration ?? rawTrimOut));
        const trimmedDuration = Math.max(0, boundedTrimOut - baseTrimIn);

        if (trimmedDuration <= 0.01) {
          return null;
        }

        return {
          id: clip.id,
          filePath: mediaClip.filePath,
          startTime: clip.startTime ?? 0,
          duration: trimmedDuration,
          trimIn: baseTrimIn,
          trimOut: boundedTrimOut,
          trackId: track.id,
          hasAudio: Boolean(mediaClip.hasAudio),
        } satisfies ExportTimelineClip;
      })
    );

    return flattened
      .filter((clip): clip is ExportTimelineClip => Boolean(clip && clip.filePath))
      .sort((a, b) => a.startTime - b.startTime);
  }, [tracks, mediaClips]);
  const hasExportableClips = timelineClipsForExport.length > 0;

  useEffect(() => {
    if (hasExportableClips && formError === timelineEmptyMessage) {
      setFormError(null);
    }
  }, [hasExportableClips, formError, timelineEmptyMessage]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    if (isExporting) {
      intervalId = setInterval(() => {
        dispatch(getExportProgress());
      }, 1000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [dispatch, isExporting]);

  useEffect(() => {
    if (!isExporting && progress.stage === 'complete') {
      const timeoutId = setTimeout(() => {
        dispatch(resetExport());
        dispatch(closeAllModals());
      }, 1500);

      return () => clearTimeout(timeoutId);
    }
  }, [dispatch, isExporting, progress.stage]);

  const resolutionMap: Record<ResolutionOption, '640x480' | '1280x720' | '1920x1080' | 'source'> = {
    '480p': '640x480',
    '720p': '1280x720',
    '1080p': '1920x1080',
    'source': 'source',
  };

  const handleStartExport = async () => {
    if (!timelineClipsForExport.length) {
      setFormError(timelineEmptyMessage);
      return;
    }

    setFormError(null);

    if (!outputPath.trim()) {
      setFormError('Please choose an output file.');
      return;
    }

    let normalizedOutputPath = outputPath.trim();
    if (container === 'mov' && normalizedOutputPath.toLowerCase().endsWith('.mp4')) {
      normalizedOutputPath = normalizedOutputPath.replace(/\.mp4$/i, '.mov');
      setOutputPath(normalizedOutputPath);
    } else if (container === 'mp4' && normalizedOutputPath.toLowerCase().endsWith('.mov')) {
      normalizedOutputPath = normalizedOutputPath.replace(/\.mov$/i, '.mp4');
      setOutputPath(normalizedOutputPath);
    }

    const codec: ExportOptions['codec'] = 'libx264';
    const resolvedResolution = resolutionMap[resolution];
    const exportOptions: ExportOptions = {
      outputPath: normalizedOutputPath,
      resolution: resolvedResolution,
      framerate: framerate === 'source' ? 'source' : Number(framerate) as 24 | 30 | 60,
      quality,
      codec,
      audioCodec: 'aac',
      container,
      timelineClips: timelineClipsForExport,
    };

    try {
      await dispatch(startExport(exportOptions)).unwrap();
      dispatch(getExportProgress());
    } catch (err) {
      setFormError((err as Error).message ?? 'Failed to start export');
    }
  };

  const handleBrowse = async () => {
    if (isExporting) {
      return;
    }
    try {
      const result = await window.electronAPI.openFileDialog();
      if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        setOutputPath(selectedPath);
      }
    } catch (err) {
      setFormError('Unable to open file dialog.');
    }
  };

  const handleCancelExport = () => {
    dispatch(cancelExport())
      .unwrap()
      .catch(() => {
        setFormError('Failed to cancel export.');
      })
      .finally(() => {
        dispatch(getExportProgress());
      });
  };

  return (
    <div className="export-dialog-overlay">
      <div className="export-dialog">
        <div className="export-dialog-header">
          <h3 className="export-dialog-title">Export Video</h3>
          <button className="btn btn-secondary" onClick={handleClose} disabled={isExporting}>
            ✕
          </button>
        </div>
        
        <div className="export-dialog-content">
          {isExporting ? (
            <div className="export-progress">
              <div className="export-progress-header">
                <h4>Exporting Video...</h4>
                <span className="export-progress-percentage">
                  {Number.isFinite(progress.progress) ? `${Math.round(progress.progress)}%` : '--'}
                </span>
              </div>
              
              <div className="export-progress-bar">
                <div
                  className="export-progress-fill"
                  style={{
                    width: Number.isFinite(progress.progress)
                      ? `${Math.max(0, Math.min(100, progress.progress))}%`
                      : '0%'
                  }}
                ></div>
              </div>
              
              <div className="export-progress-info">
                <p>{progress.message}</p>
                {progress.timeRemaining && (
                  <p className="text-gray-400">
                    Time remaining: {Math.floor(progress.timeRemaining / 60)}:{(progress.timeRemaining % 60).toFixed(0).padStart(2, '0')}
                  </p>
                )}
              </div>
              
              <div className="export-progress-controls">
                <button className="btn btn-danger" onClick={handleCancelExport}>
                  Cancel Export
                </button>
              </div>
            </div>
          ) : (
            <div className="export-options">
              {formError && (
                <div className="export-error">
                  {formError}
                </div>
              )}
              {error && !formError && (
                <div className="export-error">
                  {error}
                </div>
              )}
              <div className="option-group">
                <label>Output Format</label>
                <select 
                  className="input" 
                  value={container} 
                  onChange={(event) => {
                    const nextValue = event.target.value as 'mp4' | 'mov';
                    setContainer(nextValue);
                    if (nextValue === 'mov' && outputPath.endsWith('.mp4')) {
                      setOutputPath(prev => prev.replace(/\.mp4$/i, '.mov'));
                    }
                    if (nextValue === 'mp4' && outputPath.endsWith('.mov')) {
                      setOutputPath(prev => prev.replace(/\.mov$/i, '.mp4'));
                    }
                  }}
                >
                  <option value="mp4">MP4 (H.264)</option>
                  <option value="mov">MOV (H.264)</option>
                </select>
              </div>
              
              <div className="option-group">
                <label>Resolution</label>
                <select 
                  className="input" 
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value as ResolutionOption)}
                >
                  <option value="480p">480p (SD)</option>
                  <option value="720p">720p (HD)</option>
                  <option value="1080p">1080p (Full HD)</option>
                  <option value="source">Source Resolution</option>
                </select>
              </div>
              
              <div className="option-group">
                <label>Frame Rate</label>
                <select 
                  className="input" 
                  value={framerate}
                  onChange={(event) => setFramerate(event.target.value as FrameRateOption)}
                >
                  <option value="24">24 fps</option>
                  <option value="30">30 fps</option>
                  <option value="60">60 fps</option>
                  <option value="source">Source Frame Rate</option>
                </select>
              </div>
              
              <div className="option-group">
                <label>Quality</label>
                <select 
                  className="input" 
                  value={quality}
                  onChange={(event) => setQuality(event.target.value as QualityOption)}
                >
                  <option value="low">Low (Smaller file)</option>
                  <option value="medium">Medium (Balanced)</option>
                  <option value="high">High (Better quality)</option>
                  <option value="maximum">Maximum (Best quality)</option>
                </select>
              </div>
              
              <div className="option-group">
                <label>Output Location</label>
                <div className="file-input-group">
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="Choose output location..."
                    value={outputPath}
                    onChange={(event) => setOutputPath(event.target.value)}
                  />
                  <button className="btn btn-secondary" onClick={handleBrowse}>Browse</button>
                </div>
              </div>
              
              <div className="export-controls">
                <button 
                  className="btn btn-primary"
                  onClick={handleStartExport}
                  disabled={isExporting}
                  aria-disabled={!hasExportableClips}
                  title={!hasExportableClips ? timelineEmptyMessage : undefined}
                >
                  Start Export
                </button>
                <button className="btn btn-secondary" onClick={handleClose}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;
