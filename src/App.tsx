import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useStore } from './store/useStore';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import ClipList from './components/ClipList';
import PreviewPanel from './components/PreviewPanel';
import SettingsPanel from './components/SettingsPanel';

const THEME_ACCENTS: Record<string, { rgb: string; hoverRgb: string }> = {
  amber: { rgb: '245 158 11', hoverRgb: '251 191 36' },
  blue: { rgb: '59 130 246', hoverRgb: '96 165 250' },
  pink: { rgb: '236 72 153', hoverRgb: '244 114 182' },
  red: { rgb: '239 68 68', hoverRgb: '248 113 113' },
  purple: { rgb: '168 85 247', hoverRgb: '192 132 252' },
};

function applyThemeToDOM(themeId: string) {
  // Handle legacy values like plain "dark" or "light"
  if (themeId === 'dark' || themeId === 'light') {
    themeId = `${themeId}-amber`;
  }

  const parts = themeId.split('-');
  const mode = parts[0] as 'dark' | 'light';
  const accentName = parts[1] || 'amber';
  const accent = THEME_ACCENTS[accentName] || THEME_ACCENTS.amber;

  const html = document.documentElement;
  html.classList.remove('dark', 'light');
  html.classList.add(mode);

  // Set CSS variables for accent color
  html.style.setProperty('--color-accent', accent.rgb);
  html.style.setProperty('--color-accent-hover', accent.hoverRgb);

  // Update body colors
  if (mode === 'light') {
    document.body.style.backgroundColor = '#f5f5f5';
    document.body.style.color = '#1a1a1a';
  } else {
    document.body.style.backgroundColor = '#0a0a0f';
    document.body.style.color = '#ffffff';
  }
}

export { applyThemeToDOM, THEME_ACCENTS };

export default function App() {
  const { fetchClips, fetchCounts, settingsOpen } = useStore();

  useEffect(() => {
    fetchClips();
    fetchCounts();

    // Load initial theme from settings
    window.electronAPI.getAllSettings().then((settings) => {
      applyThemeToDOM(settings.theme || 'dark-amber');
    });

    const unsubClips = window.electronAPI.onClipsUpdated(() => {
      fetchClips();
      fetchCounts();
    });

    const unsubShown = window.electronAPI.onWindowShown(() => {
      fetchClips();
      fetchCounts();
    });

    // Listen for theme changes from main process
    const unsubTheme = window.electronAPI.onThemeChanged((newTheme: string) => {
      applyThemeToDOM(newTheme);
    });

    return () => {
      unsubClips();
      unsubShown();
      unsubTheme();
    };
  }, [fetchClips, fetchCounts]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.electronAPI.hideWindow();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="w-full h-screen flex flex-col rounded-xl overflow-hidden border bg-[#f5f5f5] dark:bg-surface text-[#1a1a1a] dark:text-white border-black/10 dark:border-surface-border">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <ClipList />
          <PreviewPanel />
        </div>
      </div>
      <AnimatePresence>
        {settingsOpen && <SettingsPanel />}
      </AnimatePresence>
    </div>
  );
}
