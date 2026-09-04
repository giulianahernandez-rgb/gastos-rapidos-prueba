// Generates the PWA/apple-touch icons as real PNG files, no dependencies.
// Draws a solid rounded-square background with a white lightning-bolt mark
// (the "captura en segundos" idea) using simple polygon rasterization,
// then hand-builds a minimal PNG (IHDR/IDAT/IEND) via Node's built-in zlib.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ACCENT = [42, 120, 214]; // #2a78d6 — categorical slot 1 (blue)

// Lightning-bolt polygon in a 0..1 normalized box (y grows downward).
const BOLT = [
  [0.58, 0.06], [0.24, 0.56], [0.46, 0.56],
  [0.40, 0.94], [0.78, 0.42], [0.54, 0.42],
];

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function renderIcon(size, cornerRatio) {
  const data = Buffer.alloc(size * size * 4);
  const radius = size * cornerRatio;
  const SS = 3; // supersample factor for antialiasing

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // rounded-square mask via corner distance test
      let inRounded = true;
      const cx = x < radius ? radius : x > size - radius ? size - radius : null;
      const cy = y < radius ? radius : y > size - radius ? size - radius : null;
      if (cx !== null && cy !== null) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy > radius * radius) inRounded = false;
      }

      let boltHits = 0;
      if (inRounded) {
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const px = (x + (sx + 0.5) / SS) / size;
            const py = (y + (sy + 0.5) / SS) / size;
            if (pointInPolygon(px, py, BOLT)) boltHits++;
          }
        }
      }

      const idx = (y * size + x) * 4;
      if (!inRounded) {
        data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0; data[idx + 3] = 0;
        continue;
      }
      const boltAlpha = boltHits / (SS * SS);
      const r = ACCENT[0] + (255 - ACCENT[0]) * boltAlpha;
      const g = ACCENT[1] + (255 - ACCENT[1]) * boltAlpha;
      const b = ACCENT[2] + (255 - ACCENT[2]) * boltAlpha;
      data[idx] = Math.round(r);
      data[idx + 1] = Math.round(g);
      data[idx + 2] = Math.round(b);
      data[idx + 3] = 255;
    }
  }
  return data;
}

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { size: 192, name: 'icon-192.png', corner: 0.18 },
  { size: 512, name: 'icon-512.png', corner: 0.18 },
  { size: 180, name: 'apple-touch-icon.png', corner: 0 }, // iOS applies its own mask
  { size: 32, name: 'favicon-32.png', corner: 0.18 },
];

for (const t of targets) {
  const rgba = renderIcon(t.size, t.corner);
  const png = encodePNG(t.size, rgba);
  fs.writeFileSync(path.join(outDir, t.name), png);
  console.log(`wrote ${t.name} (${png.length} bytes)`);
}
