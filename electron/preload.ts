import { contextBridge, ipcRenderer } from 'electron';

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

const electronAPI = {
  getClips: (options: {
    filter?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => ipcRenderer.invoke('get-clips', options),

  getClip: (id: number) => ipcRenderer.invoke('get-clip', id),

  deleteClip: (id: number) => ipcRenderer.invoke('delete-clip', id),

  togglePin: (id: number) => ipcRenderer.invoke('toggle-pin', id),

  toggleFavorite: (id: number) => ipcRenderer.invoke('toggle-favorite', id),

  copyToClipboard: (id: number) => ipcRenderer.invoke('copy-to-clipboard', id),

  clearClips: () => ipcRenderer.invoke('clear-clips'),

  getClipCounts: () => ipcRenderer.invoke('get-clip-counts'),

  getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),

  setSetting: (key: string, value: any) => ipcRenderer.invoke('set-setting', key, value),

  getAllSettings: () => ipcRenderer.invoke('get-all-settings'),

  // Live settings
  updateShortcut: (shortcut: string) => ipcRenderer.invoke('update-shortcut', shortcut),
  updateWatcherInterval: (interval: number) => ipcRenderer.invoke('update-watcher-interval', interval),
  setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('set-auto-launch', enabled),
  applyTheme: (theme: string) => ipcRenderer.invoke('apply-theme', theme),
  updateMaxItems: (maxItems: number) => ipcRenderer.invoke('update-max-items', maxItems),

  // Window controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  hideWindow: () => ipcRenderer.send('window-hide'),

  // Listeners
  onClipsUpdated: (callback: () => void) => {
    ipcRenderer.on('clips-updated', callback);
    return () => ipcRenderer.removeListener('clips-updated', callback);
  },

  onWindowShown: (callback: () => void) => {
    ipcRenderer.on('window-shown', callback);
    return () => ipcRenderer.removeListener('window-shown', callback);
  },

  onThemeChanged: (callback: (theme: string) => void) => {
    const handler = (_event: any, theme: string) => callback(theme);
    ipcRenderer.on('theme-changed', handler);
    return () => ipcRenderer.removeListener('theme-changed', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
