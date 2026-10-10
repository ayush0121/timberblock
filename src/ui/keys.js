/**
 * Keyboard play, for laptops and for players who can't drag.
 *
 *   1 2 3        pick a piece from the tray
 *   arrow keys   move it (WASD works too)
 *   Enter/Space  place it
 *   Esc          put it back
 *   H            hint
 *
 * It drives the same preview and drop path as the mouse, so a keyboard move
 * is indistinguishable from a dragged one.
 */
import { N } from "../game/board.js";
import { spanRows, spanCols } from "../game/shapes.js";

export function attachKeys({ board, trayEl, getRun, canPlay, isPlaying, onDrop, onHint }) {
  let sel = null;   // { slot, r, c }

  function paint() {
    const run = getRun();
    board.clearMarks(run.grid);
    trayEl.querySelectorAll(".slot").forEach((s, i) => s.classList.toggle("kbd", !!sel && sel.slot === i));
    if (!sel) return;
    const p = run.tray[sel.slot];
    if (run.legal(sel.slot, sel.r, sel.c)) {
      board.showPreview(p.cells, sel.r, sel.c, p.tone, run.wouldClear(sel.slot, sel.r, sel.c));
    } else board.showBlocked(p.cells, sel.r, sel.c);
  }

  function pick(slot) {
    const run = getRun();
    const p = run.tray[slot];
    if (!p) return;
    // start on the first spot that fits, scanning from the middle out
    const h = spanRows(p.cells), w = spanCols(p.cells);
    let r = Math.floor((N - h) / 2), c = Math.floor((N - w) / 2);
    outer: for (let rr = 0; rr <= N - h; rr++) for (let cc = 0; cc <= N - w; cc++) {
      if (run.legal(slot, rr, cc)) { r = rr; c = cc; break outer; }
    }
    sel = { slot, r, c };
    paint();
  }

  function move(dr, dc) {
    const p = getRun().tray[sel.slot];
    sel.r = Math.max(0, Math.min(N - spanRows(p.cells), sel.r + dr));
    sel.c = Math.max(0, Math.min(N - spanCols(p.cells), sel.c + dc));
    paint();
  }

  function cancel() {
    sel = null;
    const run = getRun();
    if (run) paint();
  }

  addEventListener("keydown", (e) => {
    if (!isPlaying() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || "")) return;
    if (!canPlay()) { if (sel) cancel(); return; }
    const k = e.key.toLowerCase();
    if (k === "1" || k === "2" || k === "3") { pick(+k - 1); e.preventDefault(); return; }
    if (k === "h") { onHint(); e.preventDefault(); return; }
    if (!sel) return;
    const dir = { arrowup: [-1, 0], w: [-1, 0], arrowdown: [1, 0], s: [1, 0],
                  arrowleft: [0, -1], a: [0, -1], arrowright: [0, 1], d: [0, 1] }[k];
    if (dir) { move(...dir); e.preventDefault(); return; }
    if (k === "escape") { cancel(); e.preventDefault(); return; }
    if (k === "enter" || k === " ") {
      e.preventDefault();
      const run = getRun();
      const target = run.legal(sel.slot, sel.r, sel.c) ? { slot: sel.slot, r: sel.r, c: sel.c } : null;
      if (!target) return onDrop(null);
      sel = null;
      board.clearMarks(run.grid);
      trayEl.querySelectorAll(".slot.kbd").forEach((s) => s.classList.remove("kbd"));
      onDrop(target);
    }
  });

  // a mouse or touch drag takes over from the keyboard
  trayEl.addEventListener("pointerdown", () => { if (sel) cancel(); });

  return { cancel };
}
