import { clipboard, nativeImage, BrowserWindow } from 'electron';
import crypto from 'crypto';
import { getDb } from './database';

export class ClipboardWatcher {
  private intervalId: NodeJS.Timeout | null = null;
  private lastHash: string = '';
  private pollInterval: number;
  private paused: boolean = false;

  constructor(pollInterval: number = 500) {
    this.pollInterval = pollInterval;
  }

  start(): void {
    // Initialize with current clipboard content hash
    this.lastHash = this.getCurrentHash();

    this.intervalId = setInterval(() => {
      if (this.paused) return;
      this.check();
    }, this.pollInterval);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  restart(newInterval: number): void {
    this.stop();
    this.pollInterval = newInterval;
    this.start();
    console.log(`[WATCHER] Restarted with interval ${newInterval}ms`);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    // Update last hash to current clipboard content to avoid re-capture
    this.lastHash = this.getCurrentHash();
    this.paused = false;
  }

  private getCurrentHash(): string {
    const text = clipboard.readText();
    const html = clipboard.readHTML();
    const image = clipboard.readImage();

    if (!image.isEmpty()) {
      const pngBuffer = image.toPNG();
      return crypto.createHash('sha256').update(pngBuffer).digest('hex');
    }

    if (html && html.trim().length > 0) {
      return crypto.createHash('sha256').update(html).digest('hex');
    }

    if (text && text.trim().length > 0) {
      return crypto.createHash('sha256').update(text).digest('hex');
    }

    return '';
  }

  private check(): void {
    const db = getDb();
    if (!db) return;

    try {
      const text = clipboard.readText();
      const html = clipboard.readHTML();
      const image = clipboard.readImage();

      let content = '';
      let contentType: 'text' | 'image' | 'html' | 'rtf' | 'file' | 'code' = 'text';
      let plainText = '';
      let preview = '';
      let hash = '';

      // Check image first
      if (!image.isEmpty()) {
        const pngBuffer = image.toPNG();
        hash = crypto.createHash('sha256').update(pngBuffer).digest('hex');
        content = image.toDataURL();
        contentType = 'image';
        plainText = '[Image]';
        const size = image.getSize();
        preview = `Image ${size.width}×${size.height}`;
      } else if (html && html.trim().length > 0 && text && text.trim().length > 0) {
        // Check if HTML is just a wrapper around plain text
        const strippedHtml = html.replace(/<[^>]*>/g, '').trim();
        if (strippedHtml !== text.trim()) {
          hash = crypto.createHash('sha256').update(html).digest('hex');
          content = html;
          contentType = 'html';
          plainText = text;
          preview = text.substring(0, 200);
        } else {
          hash = crypto.createHash('sha256').update(text).digest('hex');
          content = text;
          contentType = 'text';
          plainText = text;
          preview = text.substring(0, 200);
        }
      } else if (text && text.trim().length > 0) {
        hash = crypto.createHash('sha256').update(text).digest('hex');
        content = text;
        contentType = 'text';
        plainText = text;
        preview = text.substring(0, 200);
      } else {
        return; // Nothing useful in clipboard
      }

      // Skip if same as last
      if (hash === this.lastHash) return;
      this.lastHash = hash;
      console.log(`[WATCHER] New clipboard content detected: type=${contentType}, hash=${hash.substring(0, 12)}..., content="${(plainText || content).substring(0, 80)}"`);

      // Detect category
      const category = this.detectCategory(plainText || content, contentType);

      // If code detected and content is text, change content_type to 'code'
      if (category === 'code' && (contentType === 'text' || contentType === 'html')) {
        contentType = 'code';
      }

      // Check for duplicate (update last_used_at if exists)
      const existing = db.prepare('SELECT id FROM clips WHERE hash = ?').get(hash) as any;
      if (existing) {
        db.prepare("UPDATE clips SET last_used_at = datetime('now'), use_count = use_count + 1 WHERE id = ?")
          .run(existing.id);
        this.notifyRenderer();
        return;
      }

      // Enforce max items limit
      const maxItems = this.getMaxItems(db);
      const count = (db.prepare('SELECT COUNT(*) as count FROM clips').get() as any).count;
      if (count >= maxItems) {
        // Delete oldest non-pinned, non-favorite items
        db.prepare(`
          DELETE FROM clips WHERE id IN (
            SELECT id FROM clips
            WHERE is_pinned = 0 AND is_favorite = 0
            ORDER BY last_used_at ASC
            LIMIT ?
          )
        `).run(Math.max(1, count - maxItems + 1));
      }

      // Insert new clip
      db.prepare(`
        INSERT INTO clips (content, content_type, plain_text, preview, hash, category, char_count, created_at, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        content,
        contentType,
        plainText,
        preview,
        hash,
        category,
        (plainText || content).length
      );

      this.notifyRenderer();
    } catch (err) {
      console.error('Clipboard watcher error:', err);
    }
  }

  private detectCategory(text: string, contentType: string): string | null {
    if (contentType === 'image') return 'image';

    // Code detection — multi-criteria scoring
    const codeScore = this.getCodeScore(text);
    if (codeScore >= 2) return 'code';

    // URL detection
    if (/^https?:\/\/\S+$/i.test(text.trim())) return 'url';

    // Email detection
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim())) return 'email';

    // Path detection
    if (/^[A-Z]:\\[\w\\.-]+/i.test(text.trim()) || /^\/[\w/.-]+/.test(text.trim())) return 'path';

    return null;
  }

  private getCodeScore(text: string): number {
    let score = 0;

    // Criterion 1: syntax keyword patterns
    const syntaxPatterns = /\b(function|const|let|var|return|import|export|class|interface|type|enum|def|print|console\.log|SELECT|FROM|WHERE|#include)\b|=>|\(\)|<\?php|<div|<\/div/;
    if (syntaxPatterns.test(text)) score++;

    // Criterion 2: control flow patterns
    const controlFlow = /\b(if|for|while|switch|catch|try|finally|else|elif|foreach)\s*\(/;
    if (controlFlow.test(text)) score++;

    // Criterion 3: multiline with consistent indentation
    const lines = text.split('\n');
    if (lines.length >= 3) {
      const indentedLines = lines.filter(l => /^\s{2,}/.test(l));
      if (indentedLines.length / lines.length > 0.3) score++;
    }

    // Criterion 4: code character density > 5%
    const codeChars = text.match(/[{}\[\]();<>=]/g);
    if (codeChars && codeChars.length / text.length > 0.05) score++;

    // Criterion 5: comment patterns (// or /* or #)
    if (/\/\/.*|\/\*[\s\S]*?\*\/|^\s*#\s/m.test(text)) score++;

    return score;
  }

  private getMaxItems(db: any): number {
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'maxItems'").get() as any;
      return row ? JSON.parse(row.value) : 1000;
    } catch {
      return 1000;
    }
  }

  private notifyRenderer(): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('clips-updated');
    }
  }
}
