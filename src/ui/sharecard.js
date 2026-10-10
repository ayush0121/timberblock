/**
 * The share card: the finished board rendered to a square image.
 *
 * People post pictures, not sentences. Wordle's growth was almost entirely
 * this. The card carries the day number so it is obvious that everyone played
 * the same board, and the site URL so the image is its own advert.
 */
import { N, EMPTY } from "../game/board.js";
import { SITE_URL } from "../config.js";

const W = 1080;

function roundRect(cx, x, y, w, h, r) {
  cx.beginPath();
  cx.moveTo(x + r, y);
  cx.arcTo(x + w, y, x + w, y + h, r);
  cx.arcTo(x + w, y + h, x, y + h, r);
  cx.arcTo(x, y + h, x, y, r);
  cx.arcTo(x, y, x + w, y, r);
  cx.closePath();
}

/**
 * @param {object} o
 * @param {object} o.theme      active skin
 * @param {number[][]} o.grid   final board
 * @param {number} o.score
 * @param {string} o.headline   "Day #251" or "Classic"
 * @param {string} [o.badge]    the brag: "#3 of 120 today · beat 97%"
 * @param {string} [o.footnote] "12 day streak" etc.
 * @param {string} [o.cta]      the line that sells the click
 * @param {"square"|"story"} [o.format] 1080x1080, or 1080x1920 for
 *   WhatsApp Status / Instagram Stories
 * @returns {HTMLCanvasElement}
 */
export function renderShareCard({ theme, grid, score, headline, badge = "", footnote = "", cta = "", format = "square" }) {
  const story = format === "story";
  const H = story ? 1920 : 1080;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const cx = cv.getContext("2d");
  const t = theme.tones;

  // ── ground ────────────────────────────────────────────────────────
  const surface = getComputedStyle(document.documentElement);
  const tok = (v, d) => (surface.getPropertyValue(v) || d).trim();
  const bg = tok("--bg", "#080614"), ink = tok("--ink", "#EDE9FF"), ink2 = tok("--ink-2", "#8F87C0");
  const accent = tok("--accent", "#22E7FF"), accent2 = tok("--accent-2", "#FF2D95");
  const accentInk = tok("--accent-ink", "#04121A");
  const frame = tok("--frame", "#171034"), socket = tok("--socket", "#130C2C");

  cx.fillStyle = bg;
  cx.fillRect(0, 0, W, H);
  const glow = cx.createRadialGradient(W * 0.2, 0, 0, W * 0.2, 0, H * 0.8);
  glow.addColorStop(0, hexA(t[0].b, 0.24));
  glow.addColorStop(1, hexA(t[0].b, 0));
  cx.fillStyle = glow;
  cx.fillRect(0, 0, W, H);
  const glow2 = cx.createRadialGradient(W, H, 0, W, H, H * 0.7);
  glow2.addColorStop(0, hexA(t[1].b, 0.2));
  glow2.addColorStop(1, hexA(t[1].b, 0));
  cx.fillStyle = glow2;
  cx.fillRect(0, 0, W, H);

  // vertical rhythm: the story format spreads the same blocks over more height
  const L = story
    ? { head: 170, score: 430, unit: 482, badge: 560, board: 660, boardSize: 900, foot: 1660, cta: 1780 }
    : { head: 112, score: 262, unit: 298, badge: 362, board: 400, boardSize: 548, foot: 996, cta: 1046 };

  // ── header ────────────────────────────────────────────────────────
  cx.textBaseline = "alphabetic";
  if (story) {
    cx.textAlign = "center";
    cx.fillStyle = ink;
    cx.font = `400 92px "Alfa Slab One", Georgia, serif`;
    const a = cx.measureText("Timber").width, bw = cx.measureText("block").width;
    cx.textAlign = "left";
    cx.fillText("Timber", (W - a - bw) / 2, L.head);
    cx.fillStyle = accent;
    cx.fillText("block", (W - a - bw) / 2 + a, L.head);
    cx.textAlign = "center";
    cx.fillStyle = ink2;
    cx.font = `500 30px "IBM Plex Mono", ui-monospace, monospace`;
    cx.letterSpacing = "8px";
    cx.fillText(headline.toUpperCase(), W / 2, L.head + 70);
    cx.letterSpacing = "0px";
  } else {
    cx.fillStyle = ink2;
    cx.font = `500 26px "IBM Plex Mono", ui-monospace, monospace`;
    cx.letterSpacing = "7px";
    cx.textAlign = "left";
    cx.fillText("TIMBERBLOCK", 80, L.head);
    cx.fillStyle = accent;
    cx.textAlign = "right";
    cx.fillText(headline.toUpperCase(), W - 80, L.head);
    cx.letterSpacing = "0px";
    cx.strokeStyle = hexA(ink2, 0.28);
    cx.lineWidth = 2;
    cx.beginPath(); cx.moveTo(80, 140); cx.lineTo(W - 80, 140); cx.stroke();
  }

  // ── score ─────────────────────────────────────────────────────────
  cx.textAlign = "center";
  cx.fillStyle = ink;
  cx.font = `400 ${story ? 190 : 124}px "Alfa Slab One", Georgia, serif`;
  cx.fillText(score.toLocaleString("en-US"), W / 2, L.score);
  cx.fillStyle = ink2;
  cx.font = `500 ${story ? 30 : 22}px "IBM Plex Mono", ui-monospace, monospace`;
  cx.letterSpacing = "6px";
  cx.fillText("POINTS", W / 2, L.unit);
  cx.letterSpacing = "0px";

  // ── the brag, in a pill ───────────────────────────────────────────
  if (badge) {
    cx.font = `600 ${story ? 40 : 30}px Archivo, system-ui, sans-serif`;
    const tw = cx.measureText(badge).width;
    const ph = story ? 76 : 56, pw = Math.min(W - 120, tw + (story ? 80 : 60));
    const px0 = (W - pw) / 2, py0 = L.badge - ph * 0.7;
    const g = cx.createLinearGradient(px0, 0, px0 + pw, 0);
    g.addColorStop(0, accent); g.addColorStop(1, accent2);
    cx.fillStyle = g;
    roundRect(cx, px0, py0, pw, ph, ph / 2);
    cx.fill();
    cx.fillStyle = accentInk;
    cx.fillText(badge, W / 2, py0 + ph * 0.66, pw - 40);
  }

  // ── board ─────────────────────────────────────────────────────────
  const boardSize = L.boardSize;
  const bx = (W - boardSize) / 2, by = L.board;
  const pad = boardSize * 0.03, gap = boardSize * 0.0095;
  const cell = (boardSize - pad * 2 - gap * (N - 1)) / N;
  cx.fillStyle = frame;
  roundRect(cx, bx, by, boardSize, boardSize, 22);
  cx.fill();
  cx.strokeStyle = hexA(accent, 0.35);
  cx.lineWidth = 2;
  cx.stroke();
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const x = bx + pad + c * (cell + gap), y = by + pad + r * (cell + gap);
      const tone = grid[r][c];
      if (tone === EMPTY) {
        cx.fillStyle = socket;
        roundRect(cx, x, y, cell, cell, cell * 0.14);
        cx.fill();
      } else {
        const w = t[tone % t.length];
        const g = cx.createLinearGradient(x, y, x + cell, y + cell);
        g.addColorStop(0, w.h); g.addColorStop(0.5, w.b); g.addColorStop(1, w.l);
        cx.fillStyle = g;
        roundRect(cx, x, y, cell, cell, cell * 0.14);
        cx.fill();
        cx.fillStyle = hexA("#ffffff", 0.3);
        roundRect(cx, x + cell * 0.18, y + cell * 0.13, cell * 0.64, cell * 0.16, cell * 0.08);
        cx.fill();
      }
    }
  }

  // ── footer ────────────────────────────────────────────────────────
  cx.textAlign = "center";
  if (footnote) {
    cx.fillStyle = accent;
    cx.font = `500 ${story ? 40 : 28}px "IBM Plex Mono", ui-monospace, monospace`;
    cx.fillText(footnote, W / 2, L.foot);
  }
  cx.fillStyle = story ? ink : ink2;
  cx.font = `${story ? 600 : 400} ${story ? 40 : 24}px ${story ? "Archivo, system-ui, sans-serif" : '"IBM Plex Mono", ui-monospace, monospace'}`;
  cx.letterSpacing = story ? "0px" : "3px";
  cx.fillText(cta || prettyHost(SITE_URL), W / 2, L.cta, W - 100);
  cx.letterSpacing = "0px";
  return cv;
}

function prettyHost(url) {
  try { return new URL(url).host.replace(/^www\./, ""); }
  catch (e) { return "timberblock"; }
}

/** #rrggbb + alpha -> rgba(). Accepts already-rgb() strings unchanged. */
function hexA(hex, a) {
  const h = String(hex).trim();
  if (!h.startsWith("#")) return h;
  const n = h.length === 4
    ? h.slice(1).split("").map((c) => parseInt(c + c, 16))
    : [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${n[0]},${n[1]},${n[2]},${a})`;
}

const toBlob = (cv) =>
  new Promise((res) => cv.toBlob((b) => res(b), "image/png"));

/**
 * Offer the card. Native share sheet with the image where supported (phones),
 * a download everywhere else. Returns how it was delivered.
 */
export async function offerCard(cv, { text, filename = "timberblock.png" }) {
  const blob = await toBlob(cv);
  if (!blob) return "failed";

  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return "shared";
    } catch (e) {
      if (e && e.name === "AbortError") return "cancelled";
    }
  }

  // Inside the Claude artifact viewer a plain download link is inert; saving
  // is mediated by the downloads capability. Absent everywhere else, which is
  // exactly what the anchor below is for.
  if (window.claude && window.claude.use) {
    const dl = await window.claude.use("downloads").catch(() => null);
    if (dl) {
      try {
        await dl.save({ filename, data: blob });
        return "downloaded";
      } catch (e) {
        return e && e.code === "declined" ? "cancelled" : "preview";
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}

/** Fonts must be loaded before the canvas draws, or it silently falls back. */
export const fontsReady = () =>
  document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
