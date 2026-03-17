import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  clipboard,
  Tray,
  Menu,
  nativeImage,
  screen,
  dialog,
} from 'electron';
import path from 'path';
import { createDatabase, getDb } from './database';
import { ClipboardWatcher } from './clipboardWatcher';
import {
  registerNativeShortcut,
  unregisterNativeShortcut,
  stopNativeHook,
} from './nativeShortcut';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let clipboardWatcher: ClipboardWatcher | null = null;
let isWindowPinned = false;

const isDev = !app.isPackaged;
const DEFAULT_WIDTH = 650;
const DEFAULT_HEIGHT = 500;
let WINDOW_WIDTH = DEFAULT_WIDTH;
let WINDOW_HEIGHT = DEFAULT_HEIGHT;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 380,
    minHeight: 350,
    show: false,
    frame: false,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Log all renderer console messages to stdout
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const levelStr = ['LOG', 'WARN', 'ERROR'][level] || 'INFO';
    // Skip devtools internal messages
    if (sourceId && !sourceId.startsWith('devtools://')) {
      console.log(`[RENDERER ${levelStr}] ${message} (${sourceId}:${line})`);
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window once DOM is ready
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[MAIN] did-finish-load fired, showing window');
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription) => {
    console.error(`[MAIN] did-fail-load: ${errorCode} ${errorDescription}`);
  });

  mainWindow.on('blur', () => {
    if (isWindowPinned) return; // pinned — stay open
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide();
    }
  });

  // Save window size when user resizes manually
  mainWindow.on('resize', () => {
    if (!mainWindow) return;
    const [w, h] = mainWindow.getSize();
    WINDOW_WIDTH = w;
    WINDOW_HEIGHT = h;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showWindowAtCursor() {
  if (!mainWindow) return;

  const cursorPoint = screen.getCursorScreenPoint();
  const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const { workArea } = currentDisplay;

  let x = cursorPoint.x - Math.floor(WINDOW_WIDTH / 2);
  let y = cursorPoint.y - 20;

  // Keep window within screen bounds
  if (x + WINDOW_WIDTH > workArea.x + workArea.width) {
    x = workArea.x + workArea.width - WINDOW_WIDTH;
  }
  if (x < workArea.x) x = workArea.x;
  if (y + WINDOW_HEIGHT > workArea.y + workArea.height) {
    y = workArea.y + workArea.height - WINDOW_HEIGHT;
  }
  if (y < workArea.y) y = workArea.y;

  mainWindow.setPosition(x, y);
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('window-shown');
}

function toggleWindow() {
  if (!mainWindow) return;

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    showWindowAtCursor();
  }
}

function createTrayDataUrl(size: number): string {
  const pixels = Buffer.alloc(size * size * 4);
  pixels.fill(0);

  // Alpha-blend a pixel
  function blend(x: number, y: number, r: number, g: number, b: number, a: number = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    const alpha = a / 255;
    pixels[i]   = Math.round(r * alpha + pixels[i]   * (1 - alpha));
    pixels[i+1] = Math.round(g * alpha + pixels[i+1] * (1 - alpha));
    pixels[i+2] = Math.round(b * alpha + pixels[i+2] * (1 - alpha));
    pixels[i+3] = Math.min(255, pixels[i+3] + Math.round(a * (1 - pixels[i+3] / 255)));
  }

  // SVG content bbox 280×280 starting at (200,180) — same as generate-icon.js
  const drawSize = size * 0.9;
  const margin   = size * 0.05;
  const sc = drawSize / 280;
  const ox = margin - 200 * sc;
  const oy = margin - 180 * sc;
  const sv = (v: number) => Math.round(v * sc);
  const sx = (x: number) => Math.round(x * sc + ox);
  const sy = (y: number) => Math.round(y * sc + oy);

  function rrect(x: number, y: number, w: number, h: number, r: number, cr: number, cg: number, cb: number, ca: number = 255) {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        const lx = px - x, ly = py - y;
        let ok = true;
        if      (lx < r && ly < r)       ok = (lx-r)**2+(ly-r)**2 <= r*r;
        else if (lx >= w-r && ly < r)    ok = (lx-(w-r))**2+(ly-r)**2 <= r*r;
        else if (lx < r && ly >= h-r)    ok = (lx-r)**2+(ly-(h-r))**2 <= r*r;
        else if (lx >= w-r && ly >= h-r) ok = (lx-(w-r))**2+(ly-(h-r))**2 <= r*r;
        if (ok) blend(px, py, cr, cg, cb, ca);
      }
    }
  }

  function rrectBorder(x: number, y: number, w: number, h: number, r: number, sw: number, cr: number, cg: number, cb: number, ca: number = 255) {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        const lx = px - x, ly = py - y;
        let inO = true;
        if      (lx < r && ly < r)       inO = (lx-r)**2+(ly-r)**2 <= r*r;
        else if (lx >= w-r && ly < r)    inO = (lx-(w-r))**2+(ly-r)**2 <= r*r;
        else if (lx < r && ly >= h-r)    inO = (lx-r)**2+(ly-(h-r))**2 <= r*r;
        else if (lx >= w-r && ly >= h-r) inO = (lx-(w-r))**2+(ly-(h-r))**2 <= r*r;
        if (!inO) continue;
        const ix = lx-sw, iy = ly-sw, iw = w-sw*2, ih = h-sw*2, ir = Math.max(0, r-sw);
        let inI = false;
        if (iw > 0 && ih > 0 && ix >= 0 && iy >= 0 && ix < iw && iy < ih) {
          inI = true;
          if      (ix < ir && iy < ir)         inI = (ix-ir)**2+(iy-ir)**2 <= ir*ir;
          else if (ix >= iw-ir && iy < ir)     inI = (ix-(iw-ir))**2+(iy-ir)**2 <= ir*ir;
          else if (ix < ir && iy >= ih-ir)     inI = (ix-ir)**2+(iy-(ih-ir))**2 <= ir*ir;
          else if (ix >= iw-ir && iy >= ih-ir) inI = (ix-(iw-ir))**2+(iy-(ih-ir))**2 <= ir*ir;
        }
        if (!inI) blend(px, py, cr, cg, cb, ca);
      }
    }
  }

  function hline(x1: number, y: number, x2: number, sw: number, cr: number, cg: number, cb: number, ca: number = 255) {
    const half = sw / 2;
    for (let py = Math.floor(y - half); py <= Math.ceil(y + half); py++)
      for (let px = x1; px <= x2; px++)
        blend(px, py, cr, cg, cb, ca);
  }

  // Back square — amber
  rrect(sx(200), sy(180), sv(230), sv(230), Math.max(1, sv(36)), 0xf5, 0x9e, 0x0b);
  // Front square — dark fill
  rrect(sx(250), sy(230), sv(230), sv(230), Math.max(1, sv(36)), 22, 22, 31);
  // Front square — amber border
  rrectBorder(sx(250), sy(230), sv(230), sv(230), Math.max(1, sv(36)), Math.max(1, sv(8)), 0xf5, 0x9e, 0x0b);
  // Lines (only if big enough to be visible)
  if (sv(10) >= 1) {
    hline(sx(292), sy(300), sx(442), Math.max(1, sv(10)), 255, 255, 255, 255);
    hline(sx(292), sy(332), sx(415), Math.max(1, sv(8)),  255, 255, 255, 128);
    hline(sx(292), sy(362), sx(390), Math.max(1, sv(7)),  255, 255, 255, 64);
  }

  const img = nativeImage.createFromBitmap(pixels, { width: size, height: size });
  return img.toDataURL();
}

function createTray() {
  const size = 32;
  const dataUrl = createTrayDataUrl(size);
  const trayIcon = nativeImage.createFromDataURL(dataUrl);

  tray = new Tray(trayIcon);
  tray.setToolTip('Kopirovačka');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Otvoriť Kopirovačku',
      click: () => showWindowAtCursor(),
    },
    { type: 'separator' },
    {
      label: 'Vymazať históriu',
      click: () => {
        const db = getDb();
        if (db) {
          db.prepare('DELETE FROM clips WHERE is_pinned = 0 AND is_favorite = 0').run();
          mainWindow?.webContents.send('clips-updated');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Ukončiť',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => toggleWindow());
}


function setupIPC() {
  const db = getDb();
  if (!db) return;

  // Get clips
  ipcMain.handle('get-clips', (_event, options: {
    filter?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    let query = 'SELECT * FROM clips';
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.filter === 'pinned') {
      conditions.push('is_pinned = 1');
    } else if (options.filter === 'favorites') {
      conditions.push('is_favorite = 1');
    } else if (options.filter === 'images') {
      conditions.push("content_type = 'image'");
    } else if (options.filter === 'code') {
      conditions.push("(content_type = 'code' OR category = 'code')");
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY is_pinned DESC, created_at DESC';
    query += ` LIMIT ${options.limit || 100} OFFSET ${options.offset || 0}`;

    return db.prepare(query).all(...params);
  });

  // Get single clip
  ipcMain.handle('get-clip', (_event, id: number) => {
    return db.prepare('SELECT * FROM clips WHERE id = ?').get(id);
  });

  // Delete clip
  ipcMain.handle('delete-clip', (_event, id: number) => {
    db.prepare('DELETE FROM clips WHERE id = ?').run(id);
    mainWindow?.webContents.send('clips-updated');
    return true;
  });

  // Toggle pin
  ipcMain.handle('toggle-pin', (_event, id: number) => {
    db.prepare('UPDATE clips SET is_pinned = CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
    mainWindow?.webContents.send('clips-updated');
    return db.prepare('SELECT * FROM clips WHERE id = ?').get(id);
  });

  // Toggle favorite
  ipcMain.handle('toggle-favorite', (_event, id: number) => {
    db.prepare('UPDATE clips SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
    mainWindow?.webContents.send('clips-updated');
    return db.prepare('SELECT * FROM clips WHERE id = ?').get(id);
  });

  // Copy clip content to system clipboard (no Ctrl+V simulation, no window hide)
  ipcMain.handle('copy-to-clipboard', async (_event, id: number) => {
    const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as any;
    if (!clip) {
      console.error(`[COPY] Clip not found: id=${id}`);
      return false;
    }

    console.log(`[COPY] id=${clip.id} type=${clip.content_type} content="${(clip.content || '').substring(0, 80)}"`);

    // Update usage stats
    db.prepare('UPDATE clips SET use_count = use_count + 1, last_used_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);

    // Pause watcher to avoid re-capturing our own clipboard write
    clipboardWatcher?.pause();

    // Write to clipboard based on content type
    if (clip.content_type === 'image') {
      const img = nativeImage.createFromDataURL(clip.content);
      clipboard.writeImage(img);
    } else if (clip.content_type === 'html') {
      clipboard.write({
        text: clip.plain_text || clip.content,
        html: clip.content,
      });
    } else {
      clipboard.writeText(clip.content);
    }

    console.log(`[COPY] Written to clipboard OK`);

    // Resume watcher after a delay so it doesn't re-capture our write
    setTimeout(() => {
      clipboardWatcher?.resume();
    }, 1000);

    return true;
  });

  // Clear all clips
  ipcMain.handle('clear-clips', () => {
    db.prepare('DELETE FROM clips WHERE is_pinned = 0 AND is_favorite = 0').run();
    mainWindow?.webContents.send('clips-updated');
    return true;
  });

  // Get clip count by filter
  ipcMain.handle('get-clip-counts', () => {
    const all = (db.prepare('SELECT COUNT(*) as count FROM clips').get() as any).count;
    const pinned = (db.prepare('SELECT COUNT(*) as count FROM clips WHERE is_pinned = 1').get() as any).count;
    const favorites = (db.prepare('SELECT COUNT(*) as count FROM clips WHERE is_favorite = 1').get() as any).count;
    const images = (db.prepare("SELECT COUNT(*) as count FROM clips WHERE content_type = 'image'").get() as any).count;
    const code = (db.prepare("SELECT COUNT(*) as count FROM clips WHERE content_type = 'code' OR category = 'code'").get() as any).count;
    return { all, pinned, favorites, images, code };
  });

  // Settings
  ipcMain.handle('get-setting', (_event, key: string) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
    return row ? JSON.parse(row.value) : null;
  });

  ipcMain.handle('set-setting', (_event, key: string, value: any) => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
    return true;
  });

  // Window controls
  ipcMain.on('window-minimize', () => mainWindow?.hide());
  ipcMain.on('window-close', () => mainWindow?.hide());
  ipcMain.on('window-hide', () => mainWindow?.hide());

  // Pin window — keep open when clicking elsewhere
  ipcMain.handle('toggle-pin-window', () => {
    isWindowPinned = !isWindowPinned;
    db?.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('windowPinned', JSON.stringify(isWindowPinned));
    return isWindowPinned;
  });

  ipcMain.handle('get-pin-state', () => isWindowPinned);

  // Set window size preset
  ipcMain.handle('set-window-size', (_event, width: number, height: number) => {
    if (!mainWindow) return;
    WINDOW_WIDTH = width;
    WINDOW_HEIGHT = height;
    mainWindow.setSize(width, height);
    db?.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('windowWidth', JSON.stringify(width));
    db?.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('windowHeight', JSON.stringify(height));
    return true;
  });

  // Get all settings
  ipcMain.handle('get-all-settings', () => {
    const rows = db.prepare('SELECT * FROM settings').all() as any[];
    const settings: Record<string, any> = {};
    for (const row of rows) {
      settings[row.key] = JSON.parse(row.value);
    }
    return settings;
  });

  // ===== LIVE SETTINGS HANDLERS =====

  // Update global shortcut — uses native uiohook for full key support
  ipcMain.handle('update-shortcut', (_event, newShortcut: string) => {
    console.log(`[SETTINGS] Updating shortcut to: ${newShortcut}`);

    // Unregister previous shortcuts (both systems)
    globalShortcut.unregisterAll();
    unregisterNativeShortcut();

    // Try native hook first — supports ALL keys including punctuation
    const nativeRegistered = registerNativeShortcut(newShortcut, () => {
      console.log(`[MAIN] Shortcut pressed (native): ${newShortcut}`);
      toggleWindow();
    });

    if (nativeRegistered) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('shortcut', JSON.stringify(newShortcut));
      return { success: true, shortcut: newShortcut };
    }

    // Fallback to globalShortcut for keys not in our map
    try {
      const registered = globalShortcut.register(newShortcut, () => {
        console.log(`[MAIN] Shortcut pressed (global): ${newShortcut}`);
        toggleWindow();
      });
      if (registered) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('shortcut', JSON.stringify(newShortcut));
        return { success: true, shortcut: newShortcut };
      }
    } catch (err: any) {
      console.error(`[SETTINGS] globalShortcut failed:`, err);
    }

    // Nothing worked — restore previous shortcut
    const oldRow = db.prepare("SELECT value FROM settings WHERE key = 'shortcut'").get() as any;
    const oldShortcut = oldRow ? JSON.parse(oldRow.value) : 'CommandOrControl+Shift+V';
    registerNativeShortcut(oldShortcut, () => { toggleWindow(); });
    return { success: false, error: 'Skratku sa nepodarilo zaregistrovať' };
  });

  // Update watcher interval
  ipcMain.handle('update-watcher-interval', (_event, interval: number) => {
    console.log(`[SETTINGS] Updating watcher interval to: ${interval}ms`);
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('pollInterval', JSON.stringify(interval));
    if (clipboardWatcher) {
      clipboardWatcher.restart(interval);
    }
    return true;
  });

  // Set auto-launch
  ipcMain.handle('set-auto-launch', (_event, enabled: boolean) => {
    console.log(`[SETTINGS] Setting auto-launch to: ${enabled}`);
    app.setLoginItemSettings({ openAtLogin: enabled });
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('autoStart', JSON.stringify(enabled));
    return true;
  });

  // Apply theme — sends theme string to renderer, saves to DB
  ipcMain.handle('apply-theme', (_event, themeId: string) => {
    console.log(`[SETTINGS] Applying theme: ${themeId}`);
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('theme', JSON.stringify(themeId));
    // Update background color for frameless window
    const mode = themeId.startsWith('light') ? 'light' : 'dark';
    if (mainWindow) {
      mainWindow.setBackgroundColor(mode === 'dark' ? '#0a0a0f' : '#f5f5f5');
    }
    // Notify renderer to apply theme
    mainWindow?.webContents.send('theme-changed', themeId);
    return true;
  });

  // Update max items — saves to DB (watcher already reads from DB on each check)
  ipcMain.handle('update-max-items', (_event, maxItems: number) => {
    console.log(`[SETTINGS] Updating max items to: ${maxItems}`);
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('maxItems', JSON.stringify(maxItems));
    return true;
  });
}

// Single instance lock — prevent duplicate app instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  dialog.showErrorBox(
    'Kopirovačka',
    'Aplikácia už beží na pozadí.\n\nSkontroluj klávesovú skratku alebo ikonu v zásobníku (pravý dolný roh).'
  );
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) showWindowAtCursor();
});

app.whenReady().then(() => {
  createDatabase();
  createWindow();
  createTray();
  setupIPC();

  const db = getDb();

  // Load saved settings
  function getSetting(key: string, defaultValue: any): any {
    try {
      const row = db?.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
      return row ? JSON.parse(row.value) : defaultValue;
    } catch { return defaultValue; }
  }

  const savedPollInterval = getSetting('pollInterval', 500);
  const savedShortcut = getSetting('shortcut', 'CommandOrControl+;');
  const savedAutoStart = getSetting('autoStart', false);
  const savedTheme = getSetting('theme', 'dark-amber');
  isWindowPinned = getSetting('windowPinned', false);
  WINDOW_WIDTH = getSetting('windowWidth', DEFAULT_WIDTH);
  WINDOW_HEIGHT = getSetting('windowHeight', DEFAULT_HEIGHT);
  if (mainWindow) mainWindow.setSize(WINDOW_WIDTH, WINDOW_HEIGHT);

  console.log(`[MAIN] Loaded settings: shortcut=${savedShortcut}, pollInterval=${savedPollInterval}, autoStart=${savedAutoStart}, theme=${savedTheme}`);

  // Start clipboard watcher with saved interval
  clipboardWatcher = new ClipboardWatcher(savedPollInterval);
  clipboardWatcher.start();

  // Apply auto-launch setting
  app.setLoginItemSettings({ openAtLogin: savedAutoStart });

  // Apply theme background color (renderer loads theme itself via getAllSettings)
  const themeMode = String(savedTheme).startsWith('light') ? 'light' : 'dark';
  if (mainWindow) {
    mainWindow.setBackgroundColor(themeMode === 'dark' ? '#0a0a0f' : '#f5f5f5');
  }

  // Register shortcut — native hook supports all keys including punctuation
  const nativeOk = registerNativeShortcut(savedShortcut, () => {
    console.log(`[MAIN] Shortcut pressed (native): ${savedShortcut}`);
    toggleWindow();
  });

  if (!nativeOk) {
    // Fallback to globalShortcut for keys not in native map
    const FALLBACK = 'CommandOrControl+Shift+V';
    const toTry = [savedShortcut, FALLBACK];
    for (const sc of toTry) {
      try {
        const ok = globalShortcut.register(sc, () => { toggleWindow(); });
        console.log(`[MAIN] globalShortcut ${sc} registered: ${ok}`);
        if (ok) {
          if (sc !== savedShortcut) {
            db?.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('shortcut', JSON.stringify(sc));
          }
          break;
        }
      } catch {}
    }
  }

});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  unregisterNativeShortcut();
  stopNativeHook();
  clipboardWatcher?.stop();
});

app.on('window-all-closed', () => {
  // Don't quit on window close - stay in tray
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
