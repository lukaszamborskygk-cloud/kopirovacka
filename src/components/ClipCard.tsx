import { useState } from 'react';
import {
  Pin,
  Heart,
  Trash2,
  FileText,
  Image,
  Code2,
  Globe,
  Mail,
  FolderOpen,
  FileCode2,
  Clock,
  Check,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import type { ClipItem } from '../types';

interface ClipCardProps {
  clip: ClipItem;
  isSelected: boolean;
  isCopied: boolean;
  onSelectAndCopy: () => void;
}

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  // SQLite datetime('now') returns UTC without timezone marker — append Z so JS parses it correctly
  const normalized = dateStr.includes('T') || dateStr.endsWith('Z') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return `${Math.floor(seconds / 604800)}w`;
}

function getTypeIcon(clip: ClipItem) {
  if (clip.content_type === 'image') return Image;
  if (clip.content_type === 'html') return FileCode2;
  if (clip.content_type === 'code' || clip.category === 'code') return Code2;
  if (clip.category === 'url') return Globe;
  if (clip.category === 'email') return Mail;
  if (clip.category === 'path') return FolderOpen;
  return FileText;
}

function getTypeLabel(clip: ClipItem): string {
  if (clip.content_type === 'image') return 'IMG';
  if (clip.content_type === 'html') return 'HTML';
  if (clip.content_type === 'code' || clip.category === 'code') return 'CODE';
  if (clip.category === 'url') return 'URL';
  if (clip.category === 'email') return 'EMAIL';
  if (clip.category === 'path') return 'PATH';
  return 'TXT';
}

function isCodeClip(clip: ClipItem): boolean {
  return clip.content_type === 'code' || clip.category === 'code';
}

export default function ClipCard({ clip, isSelected, isCopied, onSelectAndCopy }: ClipCardProps) {
  const [hovered, setHovered] = useState(false);
  const { togglePin, toggleFavorite, deleteClip } = useStore();

  const TypeIcon = getTypeIcon(clip);
  const typeLabel = getTypeLabel(clip);

  return (
    <div
      onClick={onSelectAndCopy}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`
        glass-card-hover group cursor-pointer px-3 py-2 flex items-start gap-2.5 transition-all duration-150
        ${isCopied
          ? 'border-accent/50 bg-accent/[0.08] ring-1 ring-accent/20'
          : isSelected
            ? 'border-accent/30 bg-accent/[0.04]'
            : ''
        }
      `}
    >
      {/* Type icon / copied checkmark */}
      <div className="mt-0.5 flex-shrink-0">
        {isCopied ? (
          <Check className="w-3.5 h-3.5 text-accent" />
        ) : (
          <TypeIcon className={`w-3.5 h-3.5 ${isSelected ? 'text-accent' : 'text-black/25 dark:text-white/25'}`} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {clip.content_type === 'image' ? (
          <div className="w-full h-12 rounded overflow-hidden bg-black/5 dark:bg-white/5">
            <img
              src={clip.content}
              alt="Clipboard image"
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <p className={`text-xs leading-relaxed truncate ${
            isCodeClip(clip) ? 'font-mono text-emerald-700/80 dark:text-emerald-300/70' : 'text-black/70 dark:text-white/70'
          }`}>
            {clip.preview || clip.plain_text}
          </p>
        )}

        {/* Meta */}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[9px] font-medium text-accent/60 bg-accent/10 px-1.5 py-0.5 rounded">
            {typeLabel}
          </span>
          {isCopied && (
            <span className="text-[9px] font-medium text-accent bg-accent/20 px-1.5 py-0.5 rounded">
              COPIED
            </span>
          )}
          <span className="text-[10px] text-black/25 dark:text-white/20 flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />
            {getTimeAgo(clip.created_at)}
          </span>
          <span className="text-[10px] text-black/20 dark:text-white/15">
            {clip.char_count > 1000
              ? `${(clip.char_count / 1000).toFixed(1)}k`
              : clip.char_count}{' '}
            znakov
          </span>
          {clip.is_pinned === 1 && (
            <Pin className="w-2.5 h-2.5 text-accent/50 fill-accent/50" />
          )}
          {clip.is_favorite === 1 && (
            <Heart className="w-2.5 h-2.5 text-pink-400/50 fill-pink-400/50" />
          )}
        </div>
      </div>

      {/* Hover actions */}
      <div
        className={`flex-shrink-0 flex items-center gap-0.5 transition-opacity duration-150 ${
          hovered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            togglePin(clip.id);
          }}
          className={`btn-ghost ${clip.is_pinned ? 'text-accent' : ''}`}
          title="Pripnúť"
        >
          <Pin className={`w-3 h-3 ${clip.is_pinned ? 'fill-current' : ''}`} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(clip.id);
          }}
          className={`btn-ghost ${clip.is_favorite ? 'text-pink-400' : ''}`}
          title="Obľúbené"
        >
          <Heart className={`w-3 h-3 ${clip.is_favorite ? 'fill-current' : ''}`} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteClip(clip.id);
          }}
          className="btn-ghost hover:!text-red-400"
          title="Vymazať"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
