import {
  Layers,
  Pin,
  Heart,
  Image,
  Code2,
  Trash2,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import type { FilterType } from '../types';

const filters: { key: FilterType; label: string; icon: typeof Layers; countKey: keyof ReturnType<typeof useStore.getState>['counts'] }[] = [
  { key: 'all', label: 'Všetko', icon: Layers, countKey: 'all' },
  { key: 'pinned', label: 'Pripnuté', icon: Pin, countKey: 'pinned' },
  { key: 'favorites', label: 'Obľúbené', icon: Heart, countKey: 'favorites' },
  { key: 'images', label: 'Obrázky', icon: Image, countKey: 'images' },
  { key: 'code', label: 'Kód', icon: Code2, countKey: 'code' },
];

export default function Sidebar() {
  const { activeFilter, setFilter, counts, clearAll } = useStore();

  return (
    <div className="w-[140px] flex flex-col border-r border-black/10 dark:border-surface-border bg-white/50 dark:bg-surface/50 py-2 px-2">
      {/* Logo */}
      <div className="px-3 py-2 mb-1">
        <h1 className="text-xs font-semibold text-accent tracking-wide">KOPIROVAČKA</h1>
      </div>

      {/* Filter items */}
      <nav className="flex-1 flex flex-col gap-0.5">
        {filters.map(({ key, label, icon: Icon, countKey }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`sidebar-item ${activeFilter === key ? 'sidebar-item-active' : ''}`}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1 text-left truncate">{label}</span>
            <span className="text-[10px] opacity-50">{counts[countKey]}</span>
          </button>
        ))}
      </nav>

      {/* Clear button */}
      <button
        onClick={clearAll}
        className="sidebar-item text-red-400/50 hover:text-red-400 hover:bg-red-400/10 mt-1"
      >
        <Trash2 className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-left">Vymazať</span>
      </button>
    </div>
  );
}
