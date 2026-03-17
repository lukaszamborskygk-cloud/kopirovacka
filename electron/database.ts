import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

let db: Database.Database | null = null;

export function createDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'kopirovacka.db');

  db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS clips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'text' CHECK(content_type IN ('text', 'image', 'html', 'rtf', 'file')),
      plain_text TEXT,
      preview TEXT,
      hash TEXT NOT NULL UNIQUE,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      category TEXT,
      tags TEXT,
      char_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
      use_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at);
    CREATE INDEX IF NOT EXISTS idx_clips_hash ON clips(hash);
    CREATE INDEX IF NOT EXISTS idx_clips_is_pinned ON clips(is_pinned);
    CREATE INDEX IF NOT EXISTS idx_clips_is_favorite ON clips(is_favorite);
    CREATE INDEX IF NOT EXISTS idx_clips_content_type ON clips(content_type);
    CREATE INDEX IF NOT EXISTS idx_clips_category ON clips(category);
    CREATE INDEX IF NOT EXISTS idx_clips_last_used ON clips(last_used_at);
  `);

  // Insert default settings if not present
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );

  const defaults: Record<string, any> = {
    maxItems: 1000,
    autoStart: false,
    shortcut: 'CommandOrControl+;',
    excludedApps: [],
    theme: 'dark',
    pollInterval: 500,
  };

  const insertMany = db.transaction(() => {
    for (const [key, value] of Object.entries(defaults)) {
      insertSetting.run(key, JSON.stringify(value));
    }
  });

  insertMany();
}

export function getDb(): Database.Database | null {
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
