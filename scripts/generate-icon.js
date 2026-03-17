/**
 * Generates build/icon.png + build/icon.ico
 * Design: two overlapping squares (back amber, front dark+amber border) + 3 white lines
 * SVG source: kopirovacka_icon_only.svg — viewBox 0 0 680 680
 * Pure Node.js (zlib built-in), no external dependencies.
 */
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const SIZE = 256;
const pixels = new Uint8Array(SIZE * SIZE * 4); // RGBA

// Alpha-blend a pixel (supports semi-transparent paints)
function blend(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  const alpha = a / 255;
  pixels[i]   = Math.round(r * alpha + pixels[i]   * (1 - alpha));
  pixels[i+1] = Math.round(g * alpha + pixels[i+1] * (1 - alpha));
  pixels[i+2] = Math.round(b * alpha + pixels[i+2] * (1 - alpha));
  pixels[i+3] = Math.min(255, pixels[i+3] + Math.round(a * (1 - pixels[i+3] / 255)));
}

// Filled rounded rect
function rrect(x, y, w, h, r, cr, cg, cb, ca = 255) {
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

// Rounded rect border only (strokeWidth px)
function rrectBorder(x, y, w, h, r, sw, cr, cg, cb, ca = 255) {
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
        if      (ix < ir && iy < ir)        inI = (ix-ir)**2+(iy-ir)**2 <= ir*ir;
        else if (ix >= iw-ir && iy < ir)    inI = (ix-(iw-ir))**2+(iy-ir)**2 <= ir*ir;
        else if (ix < ir && iy >= ih-ir)    inI = (ix-ir)**2+(iy-(ih-ir))**2 <= ir*ir;
        else if (ix >= iw-ir && iy >= ih-ir) inI = (ix-(iw-ir))**2+(iy-(ih-ir))**2 <= ir*ir;
      }
      if (!inI) blend(px, py, cr, cg, cb, ca);
    }
  }
}

// Horizontal line with round-ish ends (anti-aliased via blending)
function hline(x1, y, x2, sw, cr, cg, cb, ca = 255) {
  const half = sw / 2;
  for (let py = Math.floor(y - half); py <= Math.ceil(y + half); py++) {
    for (let px = x1; px <= x2; px++) {
      blend(px, py, cr, cg, cb, ca);
    }
  }
}

// ── Clear (transparent) ───────────────────────────────────────────────────────
pixels.fill(0);

// SVG content bbox: x 200→480, y 180→460  (280×280 within 680×680 viewBox)
// Map to 240×240 output with 8px margin on each side
const scale = 240 / 280;
const ox = Math.round(8 - 200 * scale);   // offset so SVG x=200 → pixel x=8
const oy = Math.round(8 - 180 * scale);   // offset so SVG y=180 → pixel y=8
const sv = v => Math.round(v * scale);
const sx = x => Math.round(x * scale + ox);
const sy = y => Math.round(y * scale + oy);

// ── 1. Back square — amber ────────────────────────────────────────────────────
rrect(sx(200), sy(180), sv(230), sv(230), sv(36), 245, 158, 11);

// ── 2. Front square — dark fill ───────────────────────────────────────────────
rrect(sx(250), sy(230), sv(230), sv(230), sv(36), 22, 22, 31);

// ── 3. Front square — amber border (stroke-width 8) ──────────────────────────
rrectBorder(sx(250), sy(230), sv(230), sv(230), sv(36), Math.max(2, sv(8)), 245, 158, 11);

// ── 4. Three horizontal lines inside front square ────────────────────────────
hline(sx(292), sy(300), sx(442), Math.max(2, sv(10)), 255, 255, 255, 255); // full white
hline(sx(292), sy(332), sx(415), Math.max(2, sv(8)),  255, 255, 255, 128); // 50% white
hline(sx(292), sy(362), sx(390), Math.max(2, sv(7)),  255, 255, 255, 64);  // 25% white

// ── PNG encoder ───────────────────────────────────────────────────────────────
function createPNG(w, h, px) {
  const crcT = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcT[i] = c;
  }
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcT[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type, 'ascii');
    const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const cv = Buffer.alloc(4); cv.writeUInt32BE(crc32(Buffer.concat([t, d])));
    return Buffer.concat([len, t, d, cv]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  const row = w * 4;
  const raw = Buffer.alloc(h * (row + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (row + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const pi = (y * w + x) * 4, ri = y * (row + 1) + 1 + x * 4;
      raw[ri] = px[pi]; raw[ri+1] = px[pi+1]; raw[ri+2] = px[pi+2]; raw[ri+3] = px[pi+3];
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function pngToIco(pngBuf) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  const dir = Buffer.alloc(16);
  dir[0] = 0; dir[1] = 0;
  dir.writeUInt16LE(1, 4); dir.writeUInt16LE(32, 6);
  dir.writeUInt32LE(pngBuf.length, 8); dir.writeUInt32LE(22, 12);
  return Buffer.concat([header, dir, pngBuf]);
}

const buildDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });
const png = createPNG(SIZE, SIZE, pixels);
fs.writeFileSync(path.join(buildDir, 'icon.png'), png);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), pngToIco(png));
console.log('✓ build/icon.png + build/icon.ico generated (two-squares design)');
