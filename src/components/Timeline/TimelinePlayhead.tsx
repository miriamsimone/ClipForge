import React from 'react';

interface TimelinePlayheadProps {
  position: number;
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
}

const TimelinePlayhead: React.FC<TimelinePlayheadProps> = React.memo(({ position, onMouseDown }) => {
  return (
    <div
      className="timeline-playhead"
      style={{ 
        left: `${position}px`,
        transform: 'translateZ(0)' // Enable hardware acceleration
      }}
      onMouseDown={onMouseDown}
    >
      <div className="playhead-line"></div>
    </div>
  );
});

TimelinePlayhead.displayName = 'TimelinePlayhead';

export default TimelinePlayhead;

