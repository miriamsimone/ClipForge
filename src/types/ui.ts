export interface UIState {
  showRecordingPanel: boolean;
  showExportDialog: boolean;
  showMediaLibrary: boolean;
  showTimeline: boolean;
  activeModal: string | null;
  sidebarWidth: number;
  timelineHeight: number;
  theme: 'dark' | 'light';
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
}

export interface NotificationState {
  notifications: Notification[];
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  timestamp: number;
}
