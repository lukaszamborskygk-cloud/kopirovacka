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

const isDev = process.env.NODE_ENV !== 'production' || !app.isPackaged;
const WINDOW_WIDTH = 650;
const WINDOW_HEIGHT = 500;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
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
    // In dev mode, don't auto-hide (DevTools cause blur)
    if (isDev) return;
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide();
    }
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
  // Build a raw RGBA bitmap, then wrap it in a minimal BMP data-URL
  // We'll use Electron's built-in ability to parse raw bitmaps
  const pixels = Buffer.alloc(size * size * 4);
  // Fill with amber #f59e0b
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4] = 0xf5;     // R
    pixels[i * 4 + 1] = 0x9e; // G
    pixels[i * 4 + 2] = 0x0b; // B
    pixels[i * 4 + 3] = 0xff; // A
  }
  const img = nativeImage.createFromBitmap(pixels, { width: size, height: size });
  return img.toDataURL();
}

function createTray() {
  const size = 16;
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
