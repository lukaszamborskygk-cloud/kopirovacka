import { useRef, useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/useStore';
import ClipCard from './ClipCard';

export default function ClipList() {
  const { filteredClips, selectedClipId, copiedClipId, selectAndCopy, setSelectedClip, loading } = useStore();
  const listRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!filteredClips.length) return;

      const currentIndex = filteredClips.findIndex((c) => c.id === selectedClipId);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = currentIndex < filteredClips.length - 1 ? currentIndex + 1 : 0;
        setSelectedClip(filteredClips[next].id);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = currentIndex > 0 ? currentIndex - 1 : filteredClips.length - 1;
        setSelectedClip(filteredClips[prev].id);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedClipId) {
          selectAndCopy(selectedClipId);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        window.electronAPI.hideWindow();
      }
    },
    [filteredClips, selectedClipId, setSelectedClip, selectAndCopy]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Live time ticker — re-render every second so timestamps stay current
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Scroll to top when new clips are added
  const [prevClipCount, setPrevClipCount] = useState(0);
  useEffect(() => {
    if (filteredClips.length > prevClipCount && listRef.current) {
      listRef.current.scrollTop = 0;
    }
    setPrevClipCount(filteredClips.length);
  }, [filteredClips.length, prevClipCount]);

  // Auto-select first item
  useEffect(() => {
    if (filteredClips.length > 0 && !selectedClipId) {
      setSelectedClip(filteredClips[0].id);
    }
  }, [filteredClips, selectedClipId, setSelectedClip]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (filteredClips.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-black/20 dark:text-white/20 gap-2">
        <div className="text-3xl">📋</div>
        <p className="text-xs">Žiadne položky v clipboard</p>
        <p className="text-[10px] text-black/10 dark:text-white/10">Skopíruj niečo a objaví sa to tu</p>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="flex-1 overflow-y-auto p-2 space-y-1"
    >
      <AnimatePresence initial={false}>
        {filteredClips.map((clip, index) => (
          <motion.div
            key={clip.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.15, delay: index < 20 ? index * 0.02 : 0 }}
          >
            <ClipCard
              clip={clip}
              isSelected={selectedClipId === clip.id}
              isCopied={copiedClipId === clip.id}
              onSelectAndCopy={() => selectAndCopy(clip.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
