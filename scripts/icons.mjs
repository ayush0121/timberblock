/**
 * Generates the PWA / favicon PNGs from code - no image editor, no
 * dependencies, no binary assets in the repo. Run after changing the mark:
 *
 *   node scripts/icons.mjs
 *
 * Draws the Timberblock mark: four glowing blocks in the Voltage palette on
 * the app's own ground, supersampled 3x for clean edges, then encoded as PNG
 * with node's built-in zlib.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../public/icons");
mkdirSync(outDir, { recursive: true });

const BG = [8, 6, 20];
const BLOCKS = [
  [0x22, 0xe7, 0xff], // Ion
  [0xff, 0x2d, 0x95], // Plasma
  [0x9b, 0xff, 0x3d], // Acid
  [0xa8, 0x55, 0xf7], // Violet
];

/* ── PNG encoding ─────────────────────────────────────────────────── */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ── drawing ──────────────────────────────────────────────────────── */
/** Signed distance to a rounded rectangle; negative inside. */
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

function drawIcon(size, { padding = 0.18, glow = true } = {}) {
  const SS = 3;
  const S = size * SS;
  const acc = new Float32Array(S * S * 3);

  const margin = S * padding;
  const gap = S * 0.045;
  const block = (S - margin * 2 - gap) / 2;
  const r = block * 0.24;

  const rects = [
    [margin + block / 2, margin + block / 2],
    [margin + block + gap + block / 2, margin + block / 2],
    [margin + block / 2, margin + block + gap + block / 2],
    [margin + block + gap + block / 2, margin + block + gap + block / 2],
  ];

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let rr = BG[0], gg = BG[1], bb = BG[2];
      for (let i = 0; i < 4; i++) {
        const [cx, cy] = rects[i];
        const col = BLOCKS[i];
        const d = sdRoundRect(x + 0.5, y + 0.5, cx, cy, block / 2, block / 2, r);
        if (d <= 0) {
          // inside: vertical sheen from highlight to shade
          const t = (y - (cy - block / 2)) / block;
          const k = 1.25 - 0.5 * t;
          rr = Math.min(255, col[0] * k);
          gg = Math.min(255, col[1] * k);
          bb = Math.min(255, col[2] * k);
        } else if (glow) {
          const fall = Math.max(0, 1 - d / (block * 0.55));
          const a = fall * fall * 0.55;
          rr += col[0] * a; gg += col[1] * a; bb += col[2] * a;
        }
      }
      const o = (y * S + x) * 3;
      acc[o] = Math.min(255, rr);
      acc[o + 1] = Math.min(255, gg);
      acc[o + 2] = Math.min(255, bb);
    }
  }

  // box-downsample the supersampled buffer
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r0 = 0, g0 = 0, b0 = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = ((y * SS + sy) * S + (x * SS + sx)) * 3;
          r0 += acc[o]; g0 += acc[o + 1]; b0 += acc[o + 2];
        }
      }
      const n = SS * SS;
      const p = (y * size + x) * 4;
      out[p] = Math.round(r0 / n);
      out[p + 1] = Math.round(g0 / n);
      out[p + 2] = Math.round(b0 / n);
      out[p + 3] = 255;
    }
  }
  return encodePng(size, size, out);
}

/* ── output ───────────────────────────────────────────────────────── */
const jobs = [
  ["favicon-32.png", 32, { padding: 0.12 }],
  ["icon-180.png", 180, { padding: 0.16 }],   // apple-touch-icon
  ["icon-192.png", 192, { padding: 0.18 }],
  ["icon-512.png", 512, { padding: 0.18 }],
  ["icon-maskable-512.png", 512, { padding: 0.28 }], // safe zone for Android
];

for (const [name, size, opts] of jobs) {
  const buf = drawIcon(size, opts);
  writeFileSync(resolve(outDir, name), buf);
  console.log(`${name.padEnd(24)} ${size}x${size}  ${(buf.length / 1024).toFixed(1)} kB`);
}
