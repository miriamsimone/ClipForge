import React, { useEffect, useRef } from 'react';
import './ClipContextMenu.css';

export interface ContextMenuAction {
  label: string;
  icon?: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  separator?: boolean;
}

interface ClipContextMenuProps {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onClose: () => void;
}

const ClipContextMenu: React.FC<ClipContextMenuProps> = ({ x, y, actions, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Add event listeners after a small delay to prevent immediate close
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 100);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position if menu would go off screen
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (rect.right > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }

      if (rect.bottom > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      menuRef.current.style.left = `${adjustedX}px`;
      menuRef.current.style.top = `${adjustedY}px`;
    }
  }, [x, y]);

  const handleAction = (action: ContextMenuAction) => {
    if (!action.disabled) {
      action.onClick();
      onClose();
    }
  };

  return (
    <div
      ref={menuRef}
      className="clip-context-menu"
      style={{ left: x, top: y }}
    >
      {actions.map((action, index) => (
        action.separator ? (
          <div key={`separator-${index}`} className="context-menu-separator" />
        ) : (
          <button
            key={index}
            className={`context-menu-item ${action.disabled ? 'disabled' : ''}`}
            onClick={() => handleAction(action)}
            disabled={action.disabled}
          >
            <span className="context-menu-label">
              {action.icon && <span className="context-menu-icon">{action.icon}</span>}
              {action.label}
            </span>
            {action.shortcut && (
              <span className="context-menu-shortcut">{action.shortcut}</span>
            )}
          </button>
        )
      ))}
    </div>
  );
};

export default ClipContextMenu;
