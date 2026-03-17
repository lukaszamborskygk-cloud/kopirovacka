/**
 * Generates build/icon.png + build/icon.ico
 * No external dependencies — pure Node.js (zlib built-in)
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SIZE = 256;
const RADIUS = 44; // rounded corner radius

// RGBA pixel buffer
const pixels = new Uint8Array(SIZE * SIZE * 4);

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = a;
}

// ── Rounded amber rectangle background ──────────────────────────────────────
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let inside = true;
    const R = RADIUS;
    if (x < R && y < R)                   inside = (x-R)**2 + (y-R)**2 <= R*R;
    else if (x >= SIZE-R && y < R)        inside = (x-(SIZE-R))**2 + (y-R)**2 <= R*R;
    else if (x < R && y >= SIZE-R)        inside = (x-R)**2 + (y-(SIZE-R))**2 <= R*R;
    else if (x >= SIZE-R && y >= SIZE-R)  inside = (x-(SIZE-R))**2 + (y-(SIZE-R))**2 <= R*R;
    if (inside) setPixel(x, y, 245, 158, 11); // #f59e0b amber
  }
}

// ── White "K" letter ─────────────────────────────────────────────────────────
function drawLine(x1, y1, x2, y2, thickness) {
  const dx = x2 - x1, dy = y2 - y1;
  const steps = Math.ceil(Math.sqrt(dx * dx + dy * dy));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = x1 + dx * t, cy = y1 + dy * t;
    const half = thickness / 2;
    for (let py = Math.floor(cy - half); py <= Math.ceil(cy + half); py++) {
      for (let px = Math.floor(cx - half); px <= Math.ceil(cx + half); px++) {
        if ((px - cx) ** 2 + (py - cy) ** 2 <= half * half) {
          setPixel(px, py, 255, 255, 255);
        }
      }
    }
  }
}

const SW = 22;   // stroke width
const KX = 82;   // left edge of K
const KY = 66;   // top of K
const KH = 124;  // height of K
const MID = KY + KH / 2;
const ARM_X = KX + SW + 60; // tip of K arms

// Vertical bar
drawLine(KX + SW/2, KY, KX + SW/2, KY + KH, SW);
// Upper arm
drawLine(KX + SW, MID - 2, ARM_X, KY, SW);
// Lower arm
drawLine(KX + SW, MID + 2, ARM_X, KY + KH, SW);

// ── PNG encoder ──────────────────────────────────────────────────────────────
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
    raw[y * (row + 1)] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const pi = (y * w + x) * 4, ri = y * (row + 1) + 1 + x * 4;
      raw[ri] = px[pi]; raw[ri+1] = px[pi+1]; raw[ri+2] = px[pi+2]; raw[ri+3] = px[pi+3];
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ── ICO wrapper (embeds PNG directly — supported by Windows Vista+) ──────────
function pngToIco(pngBuf) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  const dir = Buffer.alloc(16);
  dir[0] = 0; dir[1] = 0; // 0 = 256px
  dir.writeUInt16LE(1, 4); dir.writeUInt16LE(32, 6);
  dir.writeUInt32LE(pngBuf.length, 8); dir.writeUInt32LE(22, 12);
  return Buffer.concat([header, dir, pngBuf]);
}

// ── Write files ───────────────────────────────────────────────────────────────
const buildDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

const png = createPNG(SIZE, SIZE, pixels);
fs.writeFileSync(path.join(buildDir, 'icon.png'), png);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), pngToIco(png));
console.log('✓ build/icon.png + build/icon.ico generated');
