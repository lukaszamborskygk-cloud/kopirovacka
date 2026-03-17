import { Search, Settings, Minus, X } from 'lucide-react';
import { useStore } from '../store/useStore';

export default function TitleBar() {
  const { searchQuery, setSearchQuery, setSettingsOpen } = useStore();

  return (
    <div className="drag-region flex items-center gap-2 px-3 py-2 border-b border-black/10 dark:border-surface-border bg-white/80 dark:bg-surface/80">
      {/* Search */}
      <div className="no-drag flex-1 relative">
        <input
          type="text"
          placeholder="Hľadať v clipboard..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input pr-8 text-xs h-8"
          autoFocus
        />
        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-black/30 dark:text-white/30" />
      </div>

      {/* Actions */}
      <div className="no-drag flex items-center gap-0.5">
        <button
          onClick={() => setSettingsOpen(true)}
          className="btn-ghost"
          title="Nastavenia"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => window.electronAPI.minimizeWindow()}
          className="btn-ghost"
          title="Minimalizovať"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => window.electronAPI.closeWindow()}
          className="btn-ghost hover:!text-red-400 hover:!bg-red-400/10"
          title="Zavrieť"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
