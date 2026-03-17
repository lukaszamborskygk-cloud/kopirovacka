export interface ClipItem {
  id: number;
  content: string;
  content_type: 'text' | 'image' | 'html' | 'rtf' | 'file' | 'code';
  plain_text: string;
  preview: string;
  hash: string;
  is_pinned: number;
  is_favorite: number;
  category: string | null;
  tags: string | null;
  char_count: number;
  created_at: string;
  last_used_at: string;
  use_count: number;
}

export interface ClipCounts {
  all: number;
  pinned: number;
  favorites: number;
  images: number;
  code: number;
}

export type FilterType = 'all' | 'pinned' | 'favorites' | 'images' | 'code';

export interface AppSettings {
  maxItems: number;
  autoStart: boolean;
  shortcut: string;
  excludedApps: string[];
  theme: 'dark' | 'light';
  pollInterval: number;
}

declare global {
  interface Window {
    electronAPI: {
      getClips: (options: {
        filter?: string;
        search?: string;
        limit?: number;
        offset?: number;
      }) => Promise<ClipItem[]>;
      getClip: (id: number) => Promise<ClipItem>;
      deleteClip: (id: number) => Promise<boolean>;
      togglePin: (id: number) => Promise<ClipItem>;
      toggleFavorite: (id: number) => Promise<ClipItem>;
      copyToClipboard: (id: number) => Promise<boolean>;
      clearClips: () => Promise<boolean>;
      getClipCounts: () => Promise<ClipCounts>;
      getSetting: (key: string) => Promise<any>;
      setSetting: (key: string, value: any) => Promise<boolean>;
      getAllSettings: () => Promise<Record<string, any>>;
      updateShortcut: (shortcut: string) => Promise<{ success: boolean; shortcut?: string; error?: string; warning?: string }>;
      updateWatcherInterval: (interval: number) => Promise<boolean>;
      setAutoLaunch: (enabled: boolean) => Promise<boolean>;
      applyTheme: (theme: string) => Promise<boolean>;
      updateMaxItems: (maxItems: number) => Promise<boolean>;
      minimizeWindow: () => void;
      closeWindow: () => void;
      hideWindow: () => void;
      togglePinWindow: () => Promise<boolean>;
      getPinState: () => Promise<boolean>;
      setWindowSize: (width: number, height: number) => Promise<boolean>;
      onClipsUpdated: (callback: () => void) => () => void;
      onWindowShown: (callback: () => void) => () => void;
      onThemeChanged: (callback: (theme: string) => void) => () => void;
    };
  }
}
