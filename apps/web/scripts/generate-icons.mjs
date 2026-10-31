// Generates the app icons of the phone web app (T41: « Sur l'écran d'accueil », manifest):
// the four answer shapes (red ▲, blue ◆, yellow ●, green ■) on the brand purple, in
// public/icons/. Original work, no dependency: shapes are rasterized here (4×4 supersampling)
// and written as PNG with node:zlib. Deterministic — run `node scripts/generate-icons.mjs`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BRAND = [0x46, 0x17, 0x8f];
const RED = [0xe2, 0x1b, 0x3c];
const BLUE = [0x13, 0x68, 0xce];
const YELLOW = [0xd8, 0x9e, 0x00];
const GREEN = [0x26, 0x89, 0x0c];

// Everything in a unit square; the shapes stay inside the central 70 % (maskable safe zone).
const CELL = 0.3; // size of one shape
const GAP = 0.06;
const ORIGIN = (1 - 2 * CELL - GAP) / 2;
const cells = [
  { x: ORIGIN, y: ORIGIN, color: RED, inside: triangle },
  { x: ORIGIN + CELL + GAP, y: ORIGIN, color: BLUE, inside: diamond },
  { x: ORIGIN, y: ORIGIN + CELL + GAP, color: YELLOW, inside: circle },
  { x: ORIGIN + CELL + GAP, y: ORIGIN + CELL + GAP, color: GREEN, inside: square },
];

/** u, v in [0, 1] inside a cell. */
function triangle(u, v) {
  return v >= 0.08 && v <= 0.92 && Math.abs(u - 0.5) <= (v - 0.08) * 0.6;
}
function diamond(u, v) {
  return Math.abs(u - 0.5) + Math.abs(v - 0.5) <= 0.46;
}
function circle(u, v) {
  return (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.42 ** 2;
}
function square(u, v) {
  return u >= 0.1 && u <= 0.9 && v >= 0.1 && v <= 0.9;
}

function colorAt(x, y) {
  for (const c of cells) {
    const u = (x - c.x) / CELL;
    const v = (y - c.y) / CELL;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1 && c.inside(u, v)) return c.color;
  }
  return BRAND;
}

function render(size) {
  const SS = 4;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 3); // filter byte 0 + RGB
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          sum[0] += c[0];
          sum[1] += c[1];
          sum[2] += c[2];
        }
      for (let k = 0; k < 3; k++) row[1 + px * 3 + k] = Math.round(sum[k] / (SS * SS));
    }
    rows.push(row);
  }
  return png(size, Buffer.concat(rows));
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const pct = (v) => +(v * 100).toFixed(2);
function svg() {
  const [r, b, y, g] = cells;
  const at = (c, u, v) => `${pct(c.x + u * CELL)},${pct(c.y + v * CELL)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="18" fill="${hex(BRAND)}"/>
  <polygon points="${at(r, 0.5, 0.08)} ${at(r, 0.996, 0.92)} ${at(r, 0.004, 0.92)}" fill="${hex(RED)}"/>
  <polygon points="${at(b, 0.5, 0.04)} ${at(b, 0.96, 0.5)} ${at(b, 0.5, 0.96)} ${at(b, 0.04, 0.5)}" fill="${hex(BLUE)}"/>
  <circle cx="${pct(y.x + 0.5 * CELL)}" cy="${pct(y.y + 0.5 * CELL)}" r="${pct(0.42 * CELL)}" fill="${hex(YELLOW)}"/>
  <rect x="${pct(g.x + 0.1 * CELL)}" y="${pct(g.y + 0.1 * CELL)}" width="${pct(0.8 * CELL)}" height="${pct(0.8 * CELL)}" fill="${hex(GREEN)}"/>
</svg>
`;
}

mkdirSync(out, { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(join(out, name), render(size));
  console.log(`${name} (${size}×${size})`);
}
writeFileSync(join(out, 'icon.svg'), svg());
console.log('icon.svg');
