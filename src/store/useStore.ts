import { create } from 'zustand';
import type { ClipItem, ClipCounts, FilterType } from '../types';
import Fuse from 'fuse.js';

interface AppState {
  clips: ClipItem[];
  filteredClips: ClipItem[];
  counts: ClipCounts;
  activeFilter: FilterType;
  searchQuery: string;
  selectedClipId: number | null;
  copiedClipId: number | null;
  previewExpanded: boolean;
  settingsOpen: boolean;
  loading: boolean;
  fuse: Fuse<ClipItem> | null;

  setFilter: (filter: FilterType) => void;
  setSearchQuery: (query: string) => void;
  setSelectedClip: (id: number | null) => void;
  selectAndCopy: (id: number) => Promise<void>;
  togglePreview: () => void;
  setSettingsOpen: (open: boolean) => void;
  fetchClips: () => Promise<void>;
  fetchCounts: () => Promise<void>;
  deleteClip: (id: number) => Promise<void>;
  togglePin: (id: number) => Promise<void>;
  toggleFavorite: (id: number) => Promise<void>;
  clearAll: () => Promise<void>;
}

const fuseOptions = {
  keys: ['plain_text', 'preview', 'content', 'category', 'tags'],
  threshold: 0.3,
  distance: 200,
  minMatchCharLength: 2,
};

export const useStore = create<AppState>((set, get) => ({
  clips: [],
  filteredClips: [],
  counts: { all: 0, pinned: 0, favorites: 0, images: 0, code: 0 },
  activeFilter: 'all',
  searchQuery: '',
  selectedClipId: null,
  copiedClipId: null,
  previewExpanded: false,
  settingsOpen: false,
  loading: false,
  fuse: null,

  setFilter: (filter) => {
    set({ activeFilter: filter, searchQuery: '' });
    get().fetchClips();
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    const { clips, fuse } = get();

    if (!query.trim()) {
      set({ filteredClips: clips });
      return;
    }

    if (fuse) {
      const results = fuse.search(query);
      set({ filteredClips: results.map((r) => r.item) });
    }
  },

  setSelectedClip: (id) => set({ selectedClipId: id }),

  // Select item AND copy its content to system clipboard
  selectAndCopy: async (id) => {
    set({ selectedClipId: id, copiedClipId: id });
    await window.electronAPI.copyToClipboard(id);
  },

  togglePreview: () => set((s) => ({ previewExpanded: !s.previewExpanded })),

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  fetchClips: async () => {
    set({ loading: true });
    try {
      const { activeFilter } = get();
      const clips = await window.electronAPI.getClips({
        filter: activeFilter === 'all' ? undefined : activeFilter,
        limit: 200,
      });
      const fuse = new Fuse(clips, fuseOptions);
      set({ clips, filteredClips: clips, fuse, loading: false });

      // Re-apply search if active
      const { searchQuery } = get();
      if (searchQuery.trim()) {
        const results = fuse.search(searchQuery);
        set({ filteredClips: results.map((r) => r.item) });
      }
    } catch (err) {
      console.error('Failed to fetch clips:', err);
      set({ loading: false });
    }
  },

  fetchCounts: async () => {
    try {
      const counts = await window.electronAPI.getClipCounts();
      set({ counts });
    } catch (err) {
      console.error('Failed to fetch counts:', err);
    }
  },

  deleteClip: async (id) => {
    await window.electronAPI.deleteClip(id);
    const { selectedClipId, copiedClipId } = get();
    if (selectedClipId === id) {
      set({ selectedClipId: null });
    }
    if (copiedClipId === id) {
      set({ copiedClipId: null });
    }
  },

  togglePin: async (id) => {
    await window.electronAPI.togglePin(id);
  },

  toggleFavorite: async (id) => {
    await window.electronAPI.toggleFavorite(id);
  },

  clearAll: async () => {
    await window.electronAPI.clearClips();
  },
}));
