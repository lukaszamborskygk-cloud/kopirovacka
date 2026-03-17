import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, AlertCircle, Check, Keyboard } from 'lucide-react';
import { useStore } from '../store/useStore';
import { applyThemeToDOM } from '../App';

// ===== THEME DEFINITIONS =====
interface ThemeDef {
  id: string;
  mode: 'dark' | 'light';
  accentHex: string;
  bgHex: string;
}

const THEMES: ThemeDef[] = [
  { id: 'dark-blue', mode: 'dark', accentHex: '#3b82f6', bgHex: '#0a0a0f' },
  { id: 'dark-pink', mode: 'dark', accentHex: '#ec4899', bgHex: '#0a0a0f' },
  { id: 'dark-red', mode: 'dark', accentHex: '#ef4444', bgHex: '#0a0a0f' },
  { id: 'dark-purple', mode: 'dark', accentHex: '#a855f7', bgHex: '#0a0a0f' },
  { id: 'dark-amber', mode: 'dark', accentHex: '#f59e0b', bgHex: '#0a0a0f' },
  { id: 'light-amber', mode: 'light', accentHex: '#f59e0b', bgHex: '#f5f5f5' },
  { id: 'light-pink', mode: 'light', accentHex: '#ec4899', bgHex: '#f5f5f5' },
  { id: 'light-blue', mode: 'light', accentHex: '#3b82f6', bgHex: '#f5f5f5' },
  { id: 'light-red', mode: 'light', accentHex: '#ef4444', bgHex: '#f5f5f5' },
];

// ===== SHORTCUT HELPERS =====
function formatShortcutDisplay(accelerator: string): string {
  return accelerator
    .replace('CommandOrControl', 'Ctrl')
    .replace('CmdOrCtrl', 'Ctrl')
    .replace('Control', 'Ctrl')
    .replace('Command', 'Cmd')
    .replace(/\+/g, ' + ');
}

// Maps e.code (physical key position) → Electron accelerator key name.
// Layout-independent: works regardless of keyboard locale.
const CODE_TO_KEY: Record<string, string> = {
  KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyD: 'D', KeyE: 'E', KeyF: 'F',
  KeyG: 'G', KeyH: 'H', KeyI: 'I', KeyJ: 'J', KeyK: 'K', KeyL: 'L',
  KeyM: 'M', KeyN: 'N', KeyO: 'O', KeyP: 'P', KeyQ: 'Q', KeyR: 'R',
  KeyS: 'S', KeyT: 'T', KeyU: 'U', KeyV: 'V', KeyW: 'W', KeyX: 'X',
  KeyY: 'Y', KeyZ: 'Z',
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  Minus: '-', Equal: '=', Backquote: '`', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Space: 'Space', Backspace: 'Backspace', Tab: 'Tab', Enter: 'Return', Escape: 'Escape',
  Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End',
  PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
  F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
};

function keyEventToAccelerator(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  if (parts.length === 0) return null;

  const keyName = CODE_TO_KEY[e.code];
  if (!keyName) return null;

  parts.push(keyName);
  return parts.join('+');
}

export default function SettingsPanel() {
  const { setSettingsOpen } = useStore();
  const [maxItems, setMaxItems] = useState(1000);
  const [autoStart, setAutoStart] = useState(false);
  const [shortcut, setShortcut] = useState('CommandOrControl+;');
  const [theme, setTheme] = useState('dark-amber');
  const [pollInterval, setPollInterval] = useState(500);
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);

  // Shortcut recorder state
  const [isRecording, setIsRecording] = useState(false);
  const [recordedShortcut, setRecordedShortcut] = useState<string | null>(null);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.getAllSettings().then((settings) => {
      if (settings.maxItems !== undefined) setMaxItems(settings.maxItems);
      if (settings.autoStart !== undefined) setAutoStart(settings.autoStart);
      if (settings.shortcut !== undefined) setShortcut(settings.shortcut);
      if (settings.theme !== undefined) {
        const t = settings.theme === 'dark' ? 'dark-amber' : settings.theme === 'light' ? 'light-amber' : settings.theme;
        setTheme(t);
      }
      if (settings.pollInterval !== undefined) setPollInterval(settings.pollInterval);
    });
  }, []);

  // ===== SHORTCUT RECORDER =====
  const handleRecordKeyDown = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const accel = keyEventToAccelerator(e);
    if (accel) {
      setRecordedShortcut(accel);
    }
  }, []);

  useEffect(() => {
    if (isRecording) {
      window.addEventListener('keydown', handleRecordKeyDown, true);
      return () => window.removeEventListener('keydown', handleRecordKeyDown, true);
    }
  }, [isRecording, handleRecordKeyDown]);

  const handleConfirmShortcut = async () => {
    if (!recordedShortcut) return;
    setShortcutError(null);
    const result = await window.electronAPI.updateShortcut(recordedShortcut);
    if (result.success) {
      // Use the actually registered shortcut (may differ if fallback was used)
      const actualShortcut = result.shortcut || recordedShortcut;
      setShortcut(actualShortcut);
      setIsRecording(false);
      setRecordedShortcut(null);
      if (result.warning) {
        setShortcutError(result.warning);
        // Keep the panel open to show warning — user can dismiss manually
        return;
      }
    } else {
      setShortcutError(result.error || 'Nepodarilo sa zaregistrovať skratku');
    }
  };

  const handleCancelRecording = () => {
    setIsRecording(false);
    setRecordedShortcut(null);
    setShortcutError(null);
  };

  // ===== THEME =====
  const handleThemeChange = async (themeId: string) => {
    setTheme(themeId);
    applyThemeToDOM(themeId);
    await window.electronAPI.applyTheme(themeId);
  };

  // ===== SAVE =====
  const handleSave = async () => {
    setSaving(true);
    await window.electronAPI.updateMaxItems(maxItems);
    await window.electronAPI.updateWatcherInterval(pollInterval);
    setSaving(false);
    setSavedFeedback(true);
    setTimeout(() => {
      setSavedFeedback(false);
      setSettingsOpen(false);
    }, 800);
  };

  const handleAutoStartToggle = async () => {
    const newValue = !autoStart;
    setAutoStart(newValue);
    await window.electronAPI.setAutoLaunch(newValue);
  };

  const isLight = theme.startsWith('light');
  const textMuted = isLight ? 'text-black/50' : 'text-white/50';
  const textMain = isLight ? 'text-black/80' : 'text-white/80';
  const borderColor = isLight ? 'border-black/10' : 'border-surface-border';
  const cardBg = isLight ? 'bg-white border-black/10' : 'glass-card';
  const inputBg = isLight
    ? 'bg-black/[0.04] border border-black/10 text-[#1a1a1a] placeholder-black/30 focus:border-accent/40 focus:ring-1 focus:ring-accent/20'
    : 'search-input';
  const overlayBg = isLight ? 'bg-black/30' : 'bg-black/60';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`absolute inset-0 z-50 flex items-center justify-center ${overlayBg} backdrop-blur-sm`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isRecording) setSettingsOpen(false);
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className={`${cardBg} w-[400px] max-h-[480px] overflow-y-auto rounded-card border`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${borderColor}`}>
          <h2 className={`text-sm font-semibold ${textMain}`}>Nastavenia</h2>
          <button onClick={() => setSettingsOpen(false)} className="btn-ghost">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Settings form */}
        <div className="p-4 space-y-4">
          {/* Theme Grid */}
          <div>
            <label className={`text-xs ${textMuted} block mb-2`}>Farebná téma</label>
            <div className="grid grid-cols-5 gap-2 justify-items-center">
              {THEMES.map((t) => {
                const isActive = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => handleThemeChange(t.id)}
                    className={`relative w-9 h-9 rounded-full overflow-hidden border-2 transition-all duration-150 hover:scale-110 ${
                      isActive
                        ? 'border-accent ring-2 ring-accent/30 scale-110'
                        : isLight ? 'border-black/10 hover:border-black/30' : 'border-white/10 hover:border-white/30'
                    }`}
                    title={t.id}
                  >
                    <div
                      className="absolute inset-0 w-1/2"
                      style={{ backgroundColor: t.bgHex }}
                    />
                    <div
                      className="absolute top-0 right-0 bottom-0 w-1/2"
                      style={{ backgroundColor: t.accentHex }}
                    />
                    {isActive && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Shortcut — Interactive Recorder */}
          <div>
            <label className={`text-xs ${textMuted} block mb-1`}>Klávesová skratka</label>
            {!isRecording ? (
              <div className="flex items-center gap-2">
                <span className={`flex-1 font-mono text-sm ${textMain} px-3 py-2 rounded-btn ${isLight ? 'bg-black/[0.04]' : 'bg-white/[0.04]'}`}>
                  {formatShortcutDisplay(shortcut)}
                </span>
                <button
                  onClick={() => { setIsRecording(true); setRecordedShortcut(null); setShortcutError(null); }}
                  className="px-3 py-2 text-xs font-medium rounded-btn bg-accent text-black hover:bg-accent-hover transition-all"
                >
                  Zmeniť
                </button>
              </div>
            ) : (
              <div className={`rounded-btn p-3 border ${isLight ? 'bg-black/[0.02] border-black/10' : 'bg-white/[0.02] border-white/10'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Keyboard className={`w-4 h-4 ${textMuted} animate-pulse`} />
                  <span className={`text-xs ${textMuted}`}>
                    {recordedShortcut
                      ? 'Zachytená skratka:'
                      : 'Stlačte novú klávesovú skratku...'}
                  </span>
                </div>
                {recordedShortcut && (
                  <div className={`font-mono text-sm font-semibold ${textMain} mb-2`}>
                    {formatShortcutDisplay(recordedShortcut)}
                  </div>
                )}
                {shortcutError && (
                  <div className="flex items-center gap-1 mb-2 text-red-400 text-[10px]">
                    <AlertCircle className="w-3 h-3" />
                    {shortcutError}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirmShortcut}
                    disabled={!recordedShortcut}
                    className="px-3 py-1.5 text-xs font-medium rounded-btn bg-accent text-black hover:bg-accent-hover transition-all disabled:opacity-30"
                  >
                    Potvrdiť
                  </button>
                  <button
                    onClick={handleCancelRecording}
                    className={`px-3 py-1.5 text-xs rounded-btn ${textMuted} ${isLight ? 'hover:bg-black/5' : 'hover:bg-white/5'} transition-all`}
                  >
                    Zrušiť
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Max items */}
          <div>
            <label className={`text-xs ${textMuted} block mb-1`}>Max. počet položiek</label>
            <input
              type="number"
              value={maxItems}
              onChange={(e) => setMaxItems(Number(e.target.value))}
              min={100}
              max={10000}
              className={`w-full rounded-btn px-3 py-2 text-sm transition-all duration-200 outline-none ${inputBg}`}
            />
          </div>

          {/* Poll interval */}
          <div>
            <label className={`text-xs ${textMuted} block mb-1`}>Interval kontroly (ms)</label>
            <input
              type="number"
              value={pollInterval}
              onChange={(e) => setPollInterval(Number(e.target.value))}
              min={100}
              max={5000}
              step={100}
              className={`w-full rounded-btn px-3 py-2 text-sm transition-all duration-200 outline-none ${inputBg}`}
            />
          </div>

          {/* Auto-start */}
          <div className="flex items-center justify-between">
            <label className={`text-xs ${textMuted}`}>Spustiť pri štarte Windows</label>
            <button
              onClick={handleAutoStartToggle}
              className={`w-9 h-5 rounded-full transition-all duration-200 ${
                autoStart ? 'bg-accent' : isLight ? 'bg-black/10' : 'bg-white/10'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full shadow-sm transition-transform duration-200 ${
                  autoStart ? 'translate-x-[18px] bg-white' : 'translate-x-[2px] bg-white'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className={`flex justify-end gap-2 px-4 py-3 border-t ${borderColor}`}>
          <button
            onClick={() => setSettingsOpen(false)}
            className={`px-3 py-1.5 text-xs ${textMuted} rounded-btn hover:bg-black/5 dark:hover:bg-white/5 transition-all`}
          >
            Zrušiť
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-3 py-1.5 text-xs font-medium rounded-btn transition-all flex items-center gap-1.5 disabled:opacity-50 ${
              savedFeedback
                ? 'bg-emerald-500 text-white'
                : 'bg-accent text-black hover:bg-accent-hover'
            }`}
          >
            {savedFeedback ? (
              <>
                <Check className="w-3 h-3" />
                Uložené!
              </>
            ) : (
              <>
                <Save className="w-3 h-3" />
                {saving ? 'Ukladám...' : 'Uložiť'}
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
