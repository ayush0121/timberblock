/** The three-piece rail below the board, or beside it on landscape screens. */
import { spanRows, spanCols } from "../game/shapes.js";
import { paintTone } from "./themes.js";

/** Build the DOM for one piece at a given cell size. */
export function pieceGrid(cells, tone, theme, cellPx, cssVar) {
  const rows = spanRows(cells), cols = spanCols(cells);
  const g = document.createElement("div");
  g.className = "piece";
  g.style.setProperty(cssVar, cellPx + "px");
  g.style.gridTemplateColumns = `repeat(${cols},${cellPx}px)`;
  g.style.gridTemplateRows = `repeat(${rows},${cellPx}px)`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = document.createElement("div");
      u.className = "u";
      if (cells.some(([a, b]) => a === r && b === c)) {
        const b = document.createElement("div");
        b.className = "blk";
        paintTone(b, theme, tone);
        u.appendChild(b);
      }
      g.appendChild(u);
    }
  }
  return g;
}

/** The "Bigger pieces" setting: easier to see and grab. */
let big = false;
export function setBigPieces(on) { big = !!on; }

/** On landscape layouts the CSS stands the tray up beside the board. */
const isVertical = (trayEl) =>
  getComputedStyle(trayEl).getPropertyValue("--vertical").trim() === "1";

/** Usable square room for one piece. The tray may still be hidden on first
 *  render, so fall back to the app column it will fill. */
function trayRoom(trayEl) {
  if (isVertical(trayEl) && trayEl.clientHeight) {
    // three slots stacked; leave space for each slot's label and padding
    const slotH = (trayEl.clientHeight - 24) / 3 - 26;
    return Math.min(trayEl.clientWidth - 24, slotH) * 0.9;
  }
  const w = trayEl.clientWidth || (trayEl.closest(".app") || document.body).clientWidth;
  return ((w - 36) / 3) * (big ? 0.95 : 0.82);
}

const cellPx = (room, span, max) => Math.max(12, Math.min(max, Math.floor(room / Math.max(3, span))));

export function renderTray(trayEl, run, theme) {
  trayEl.textContent = "";
  const vertical = isVertical(trayEl);
  const max = vertical ? (big ? 40 : 32) : (big ? 34 : 26);
  // tall enough for a five-long piece standing up, so the tray never jumps
  // (a vertical tray takes its height from the board instead)
  const tallest = 5 * cellPx(trayRoom(trayEl), 5, max) + 4 * 3;
  trayEl.style.setProperty("--slot-h", vertical ? "0px" : tallest + 26 + "px");
  const dead = run.deadSlots();
  run.tray.forEach((p, i) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    if (!p) { slot.classList.add("taken"); trayEl.appendChild(slot); return; }
    if (dead[i]) slot.classList.add("dead");

    // Size from the room each slot really has: bigger pieces are easier to
    // grab on a phone. Pieces of 3 cells or less share one size so the tray
    // doesn't look like it was dealt at random scales.
    const px = cellPx(trayRoom(trayEl), Math.max(spanRows(p.cells), spanCols(p.cells)), max);
    const g = pieceGrid(p.cells, p.tone, theme, px, "--pc");
    g.dataset.slot = String(i);

    const lab = document.createElement("div");
    lab.className = "label";
    lab.textContent = theme.tones[p.tone % theme.tones.length].n;

    slot.append(g, lab);
    trayEl.appendChild(slot);
  });
}
