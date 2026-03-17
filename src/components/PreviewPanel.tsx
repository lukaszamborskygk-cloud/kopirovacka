import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown, Copy, ExternalLink } from 'lucide-react';
import { useStore } from '../store/useStore';

export default function PreviewPanel() {
  const { selectedClipId, filteredClips, previewExpanded, togglePreview } = useStore();

  const selectedClip = filteredClips.find((c) => c.id === selectedClipId);

  return (
    <div className="border-t border-black/10 dark:border-surface-border">
      {/* Toggle bar */}
      <button
        onClick={togglePreview}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-black/30 dark:text-white/30 hover:text-black/50 dark:hover:text-white/50 transition-colors"
      >
        <span>
          {selectedClip
            ? `Náhľad — ${selectedClip.content_type.toUpperCase()} · ${selectedClip.char_count} znakov`
            : 'Vyber položku pre náhľad'}
        </span>
        {previewExpanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronUp className="w-3 h-3" />
        )}
      </button>

      {/* Expandable content */}
      <AnimatePresence>
        {previewExpanded && selectedClip && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 150, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2">
              {selectedClip.content_type === 'image' ? (
                <div className="w-full h-[130px] rounded-btn overflow-hidden bg-black/5 dark:bg-white/5">
                  <img
                    src={selectedClip.content}
                    alt="Preview"
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : selectedClip.content_type === 'html' ? (
                <div
                  className="text-xs text-black/60 dark:text-white/60 font-mono bg-black/[0.03] dark:bg-white/[0.02] rounded-btn p-2 h-[130px] overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: selectedClip.content }}
                />
              ) : (
                <pre className={`text-xs leading-relaxed h-[130px] overflow-y-auto rounded-btn p-2 bg-black/[0.03] dark:bg-white/[0.02] ${
                  selectedClip.category === 'code'
                    ? 'font-mono text-emerald-700/70 dark:text-emerald-300/60'
                    : 'text-black/50 dark:text-white/50 whitespace-pre-wrap'
                }`}>
                  {selectedClip.content}
                </pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
