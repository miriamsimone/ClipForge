/**
 * Utilities for parsing and rendering SRT subtitles
 */

export interface SubtitleCue {
  index: number;
  startTime: number; // in seconds
  endTime: number; // in seconds
  text: string;
}

/**
 * Parse SRT subtitle content into cue objects
 */
export function parseSRT(srtContent: string): SubtitleCue[] {
  if (!srtContent || !srtContent.trim()) {
    return [];
  }

  const cues: SubtitleCue[] = [];
  const blocks = srtContent.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    if (!block.trim()) continue;

    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // Parse index (first line)
    const index = parseInt(lines[0].trim());
    if (isNaN(index)) continue;

    // Parse timestamp (second line)
    const timestampLine = lines[1].trim();
    const timestampMatch = timestampLine.match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
    if (!timestampMatch) continue;

    // Parse start and end times
    const startTime = parseSRTTime(timestampMatch[1], timestampMatch[2], timestampMatch[3], timestampMatch[4]);
    const endTime = parseSRTTime(timestampMatch[5], timestampMatch[6], timestampMatch[7], timestampMatch[8]);

    // Get text (remaining lines)
    const text = lines.slice(2).join('\n').trim();

    if (text) {
      cues.push({
        index,
        startTime,
        endTime,
        text,
      });
    }
  }

  return cues.sort((a, b) => a.startTime - b.startTime);
}

/**
 * Parse SRT time format (HH:MM:SS,mmm) to seconds
 */
function parseSRTTime(hours: string, minutes: string, seconds: string, milliseconds: string): number {
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(milliseconds) / 1000;
}

/**
 * Adjust subtitle cues for clip trimming and timeline position
 */
export function adjustSubtitleCues(
  cues: SubtitleCue[],
  trimIn: number,
  timelineStart: number
): SubtitleCue[] {
  return cues
    .map(cue => {
      // Adjust for trim
      const adjustedStart = Math.max(0, cue.startTime - trimIn);
      const adjustedEnd = Math.max(0, cue.endTime - trimIn);

      // Skip if completely before trim point
      if (adjustedEnd <= 0) {
        return null;
      }

      // Add timeline offset
      return {
        ...cue,
        startTime: adjustedStart + timelineStart,
        endTime: adjustedEnd + timelineStart,
      };
    })
    .filter((cue): cue is SubtitleCue => cue !== null);
}

/**
 * Get the active subtitle text at a given timeline time
 */
export function getActiveSubtitle(
  cues: SubtitleCue[],
  timelineTime: number
): string | null {
  for (const cue of cues) {
    if (timelineTime >= cue.startTime && timelineTime < cue.endTime) {
      return cue.text;
    }
  }
  return null;
}

