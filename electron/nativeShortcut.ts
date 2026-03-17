/**
 * Native keyboard hook for global shortcuts using uiohook-napi.
 * Works with ANY key including punctuation (;  '  .  ,  etc.)
 * regardless of keyboard layout.
 */
import { uIOhook, UiohookKey } from 'uiohook-napi';

// Full Electron accelerator → uiohook scan code mapping
const ACCELERATOR_KEY_MAP: Record<string, number> = {
  // Letters (A-Z)
  A: 30, B: 48, C: 46, D: 32, E: 18, F: 33, G: 34, H: 35,
  I: 23, J: 36, K: 37, L: 38, M: 50, N: 49, O: 24, P: 25,
  Q: 16, R: 19, S: 31, T: 20, U: 22, V: 47, W: 17, X: 45,
  Y: 21, Z: 44,
  // Digits
  '0': 11, '1': 2, '2': 3, '3': 4, '4': 5,
  '5': 6, '6': 7, '7': 8, '8': 9, '9': 10,
  // Punctuation (scan codes, layout-independent)
  ';': 39, "'": 40, ',': 51, '.': 52, '/': 53,
  '-': 12, '=': 13, '`': 41, '[': 26, ']': 27, '\\': 43,
  // Special
  Space: 57, Backspace: 14, Tab: 15, Return: 28, Escape: 1,
  Delete: 3667, Insert: 3666, Home: 3655, End: 3663,
  PageUp: 3657, PageDown: 3665,
  Up: 57416, Down: 57424, Left: 57419, Right: 57421,
  // F-keys
  F1: 59, F2: 60, F3: 61, F4: 62, F5: 63, F6: 64,
  F7: 65, F8: 66, F9: 67, F10: 68, F11: 87, F12: 88,
};

// Modifier key scan codes in uiohook
const CTRL_KEYS = new Set([UiohookKey.Ctrl, UiohookKey.CtrlRight]);
const ALT_KEYS = new Set([UiohookKey.Alt, UiohookKey.AltRight]);
const SHIFT_KEYS = new Set([UiohookKey.Shift, UiohookKey.ShiftRight]);

interface ParsedShortcut {
  keycode: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

function parseAccelerator(accelerator: string): ParsedShortcut | null {
  const parts = accelerator.split('+');
  const keyPart = parts[parts.length - 1];
  const mods = parts.slice(0, -1).map((m) => m.toLowerCase());

  const keycode = ACCELERATOR_KEY_MAP[keyPart] ?? ACCELERATOR_KEY_MAP[keyPart.toUpperCase()];
  if (!keycode) return null;

  return {
    keycode,
    ctrl: mods.includes('commandorcontrol') || mods.includes('ctrl') || mods.includes('command'),
    alt: mods.includes('alt'),
    shift: mods.includes('shift'),
  };
}

let hookStarted = false;
let currentShortcut: ParsedShortcut | null = null;
let currentCallback: (() => void) | null = null;

// Track modifier state manually (event.ctrlKey etc. may be unreliable on Windows)
let ctrlDown = false;
let altDown = false;
let shiftDown = false;

function ensureHookStarted() {
  if (hookStarted) return;

  uIOhook.on('keydown', (event) => {
    // Update modifier state
    if (CTRL_KEYS.has(event.keycode)) { ctrlDown = true; return; }
    if (ALT_KEYS.has(event.keycode)) { altDown = true; return; }
    if (SHIFT_KEYS.has(event.keycode)) { shiftDown = true; return; }

    if (!currentShortcut || !currentCallback) return;

    const { keycode, ctrl, alt, shift } = currentShortcut;
    const ctrlOk = !ctrl || ctrlDown;
    const altOk = !alt || altDown;
    const shiftOk = !shift || shiftDown;
    const keyOk = event.keycode === keycode;

    if (ctrlOk && altOk && shiftOk && keyOk) {
      console.log('[NATIVE_SHORTCUT] FIRED!');
      currentCallback();
    }
  });

  uIOhook.on('keyup', (event) => {
    if (CTRL_KEYS.has(event.keycode)) ctrlDown = false;
    if (ALT_KEYS.has(event.keycode)) altDown = false;
    if (SHIFT_KEYS.has(event.keycode)) shiftDown = false;
  });

  uIOhook.start();
  hookStarted = true;
  console.log('[NATIVE_SHORTCUT] uiohook started');
}

/**
 * Register a global shortcut via native hook.
 * Returns true if the accelerator could be parsed, false otherwise.
 */
export function registerNativeShortcut(accelerator: string, callback: () => void): boolean {
  const parsed = parseAccelerator(accelerator);
  if (!parsed) {
    console.warn(`[NATIVE_SHORTCUT] Cannot parse accelerator: ${accelerator}`);
    return false;
  }

  currentShortcut = parsed;
  currentCallback = callback;
  ensureHookStarted();
  console.log(`[NATIVE_SHORTCUT] Registered: ${accelerator} → keycode ${parsed.keycode}`);
  return true;
}

/** Unregister the current native shortcut (does not stop the hook). */
export function unregisterNativeShortcut(): void {
  currentShortcut = null;
  currentCallback = null;
}

/** Stop the uiohook entirely (call on app quit). */
export function stopNativeHook(): void {
  if (hookStarted) {
    uIOhook.stop();
    hookStarted = false;
  }
}
