/**
 * Replay video: re-simulate a finished run from its seed and move log, draw
 * every placement and clear onto a canvas, and record it as a short square
 * clip (MP4 where the browser can, WebM otherwise) to share or save.
 *
 * Determinism makes this exact: the same Run, fed the same moves, produces
 * the same boards the player saw. Nothing is stored while playing.
 */
import { N, EMPTY } from "../game/board.js";

const SIZE = 720;            // px, square: fits every social feed
const FPS = 30;
const MAX_SECONDS = 14;

const roundRect = (cx, x, y, w, h, r) => {
  cx.beginPath();
  cx.moveTo(x + r, y);
  cx.arcTo(x + w, y, x + w, y + h, r);
  cx.arcTo(x + w, y + h, x, y + h, r);
  cx.arcTo(x, y + h, x, y, r);
  cx.arcTo(x, y, x + w, y, r);
  cx.closePath();
};

/** What MediaRecorder can produce here, best first. */
export function recorderType() {
  if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) return null;
  for (const t of ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return null;
}

/**
 * Record a replay.
 *   makeRun()  -> a fresh Run in the run's starting state
 *   moves      -> the run's move log
 *   theme      -> the active skin (tones)
 *   title      -> e.g. "Day #283" or "Classic"
 *   site       -> footer text
 *   onProgress -> 0..1 while recording
 * Resolves to a File.
 */
export async function recordReplay({ makeRun, moves, theme, title, site, onProgress }) {
  const type = recorderType();
  if (!type) throw new Error("unsupported");
  const css = getComputedStyle(document.documentElement);
  const col = (v, d) => (css.getPropertyValue(v).trim() || d);
  const C = {
    bg: col("--bg", "#080614"), frame: col("--frame", "#171034"), socket: col("--socket", "#130C2C"),
    ink: col("--ink", "#EDE9FF"), ink2: col("--ink-2", "#8F87C0"), accent: col("--accent", "#22E7FF"),
  };

  const cv = document.createElement("canvas");
  cv.width = cv.height = SIZE;
  const cx = cv.getContext("2d");
  // header (title, score) above, the site name below: the board gets the rest
  const pad = 60, top = 146, boardPx = SIZE - top - 52;
  const bx = (SIZE - boardPx) / 2, cell = (boardPx - 24) / N, gap = 3;

  const tone = (t) => theme.tones[t % theme.tones.length];
  function block(x, y, s, t, alpha = 1, scale = 1) {
    const tn = tone(t);
    const o = (s * (1 - scale)) / 2;
    cx.globalAlpha = alpha;
    const g = cx.createLinearGradient(x, y, x + s, y + s);
    g.addColorStop(0, tn.h); g.addColorStop(0.5, tn.b); g.addColorStop(1, tn.l);
    cx.fillStyle = g;
    roundRect(cx, x + o, y + o, s * scale, s * scale, s * 0.18);
    cx.fill();
    cx.fillStyle = "rgba(255,255,255,.28)";
    roundRect(cx, x + o + s * 0.18 * scale, y + o + s * 0.1 * scale, s * 0.64 * scale, s * 0.16 * scale, s * 0.08);
    cx.fill();
    cx.globalAlpha = 1;
  }

  function frame(grid, score, flash, drop, k) {
    cx.fillStyle = C.bg;
    cx.fillRect(0, 0, SIZE, SIZE);
    cx.fillStyle = C.ink;
    cx.font = "400 46px 'Alfa Slab One', Georgia, serif";
    cx.textBaseline = "alphabetic";
    cx.fillText("Timber", pad, 92);
    const w = cx.measureText("Timber").width;
    cx.fillStyle = C.accent;
    cx.fillText("block", pad + w, 92);
    cx.font = "500 15px 'IBM Plex Mono', monospace";
    cx.fillStyle = C.ink2;
    cx.fillText(title.toUpperCase(), pad, 120);
    cx.textAlign = "right";
    cx.fillStyle = C.ink;
    cx.font = "500 44px 'IBM Plex Mono', monospace";
    cx.fillText(score.toLocaleString("en-US"), SIZE - pad, 92);
    cx.font = "500 13px 'IBM Plex Mono', monospace";
    cx.fillStyle = C.ink2;
    cx.fillText("SCORE", SIZE - pad, 120);
    cx.textAlign = "left";

    cx.fillStyle = C.frame;
    roundRect(cx, bx, top, boardPx, boardPx, 18);
    cx.fill();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const x = bx + 12 + c * cell + gap / 2, y = top + 12 + r * cell + gap / 2, s = cell - gap;
      cx.fillStyle = C.socket;
      roundRect(cx, x, y, s, s, s * 0.18);
      cx.fill();
      const i = r * N + c;
      if (flash && flash.cells.has(i)) block(x, y, s, flash.tone, 1 - k, 1 + k * 0.25);
      else if (grid[r][c] !== EMPTY) {
        const dropping = drop && drop.has(i);
        block(x, y, s, grid[r][c], 1, dropping ? 0.75 + 0.25 * k : 1);
      }
    }
    cx.textAlign = "center";
    cx.font = "500 16px 'IBM Plex Mono', monospace";
    cx.fillStyle = C.ink2;
    cx.fillText(site, SIZE / 2, SIZE - 18);
    cx.textAlign = "left";
  }

  // Simulate first, so frame pacing is known before recording starts.
  const run = makeRun();
  const steps = [{ grid: run.grid.map((r) => r.slice()), score: run.score }];
  for (const [slot, r, c, t] of moves) {
    // rotate / swap power-ups change the tray, not the board: nothing to draw
    if (r < 0) { run.apply([slot, r, c, t]); continue; }
    const before = run.grid.map((row) => row.slice());
    const ev = run.place(slot, r, c, t);
    if (!ev) break;
    const placed = new Set(ev.placed.cells.map(([dr, dc]) => (r + dr) * N + c + dc));
    // the board with the piece down but lines not yet cleared, for the flash
    const landed = before.map((row) => row.slice());
    for (const i of placed) landed[Math.floor(i / N)][i % N] = ev.placed.tone;
    steps.push({ grid: run.grid.map((x) => x.slice()), landed, placed, cleared: ev.cleared, tone: ev.placed.tone, score: run.score });
  }

  const per = Math.max(3, Math.min(12, Math.floor((MAX_SECONDS * FPS - 45) / Math.max(1, steps.length - 1))));
  const frames = [];
  frames.push(...Array(12).fill({ s: 0, k: 1 }));
  for (let i = 1; i < steps.length; i++) {
    for (let f = 0; f < per; f++) frames.push({ s: i, k: (f + 1) / per });
  }
  frames.push(...Array(36).fill({ s: steps.length - 1, k: 1, end: true }));

  const stream = cv.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => { rec.onstop = res; });
  rec.start(250);

  await new Promise((resolve) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => {
      // keep to wall-clock time: the recorder samples in real time
      const due = Math.min(frames.length, Math.floor(((performance.now() - t0) / 1000) * FPS) + 1);
      while (n < due) {
        const fr = frames[n++];
        const st = steps[fr.s];
        if (fr.s === 0 || fr.end) frame(st.grid, st.score, null, null, 1);
        else if (st.cleared && fr.k > 0.45) {
          frame(st.grid, st.score, { cells: st.cleared, tone: st.tone }, null, (fr.k - 0.45) / 0.55);
        } else frame(st.landed, steps[fr.s - 1].score, null, st.placed, Math.min(1, fr.k / 0.45));
      }
      if (onProgress) onProgress(n / frames.length);
      if (n >= frames.length) resolve(); else requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  const ext = type.startsWith("video/mp4") ? "mp4" : "webm";
  return new File(chunks, `timberblock-replay.${ext}`, { type: type.split(";")[0] });
}

/** Share the clip where the platform can; otherwise download it. */
export async function deliverReplay(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Timberblock replay" }); return "shared"; }
    catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  return "downloaded";
}
