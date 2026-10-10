/** Renders the grid and answers geometry questions for the drag layer. */
import { N, EMPTY } from "../game/board.js";
import { paintTone } from "./themes.js";

export class BoardView {
  constructor(el, theme) {
    this.el = el;
    this.theme = theme;
    this.cells = [];
    for (let i = 0; i < N * N; i++) {
      const d = document.createElement("div");
      d.className = "cell";
      const b = document.createElement("div");
      b.className = "blk";
      b.style.display = "none";
      d.appendChild(b);
      el.appendChild(d);
      this.cells.push(d);
    }
  }

  setTheme(theme) { this.theme = theme; }

  /** Live sets of cell indices drawn as gems / stones (Adventure, events).
   *  The board reads them on every draw, so they never drift from the run. */
  setMarks(gems = null, stones = null) {
    this.gems = gems;
    this.stones = stones;
  }
  at(r, c) { return this.cells[r * N + c]; }

  /** Redraw one cell from the grid. */
  draw(grid, r, c) {
    const el = this.at(r, c), tone = grid[r][c];
    const blk = el.firstChild;
    const filled = tone !== EMPTY;
    el.classList.toggle("filled", filled);
    const i = r * N + c;
    el.classList.toggle("gem", filled && !!this.gems && this.gems.has(i));
    el.classList.toggle("stone", filled && !!this.stones && this.stones.has(i));
    blk.style.display = filled ? "" : "none";
    if (filled) paintTone(blk, this.theme, tone);
  }

  syncAll(grid) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) this.draw(grid, r, c);
  }

  /** Drop every transient mark, restoring what the grid actually holds. */
  clearMarks(grid) {
    this.cells.forEach((el, i) => {
      el.classList.remove("preview", "willclear", "blocked");
      const r = Math.floor(i / N), c = i % N;
      if (grid[r][c] === EMPTY && !el.classList.contains("clearing"))
        el.firstChild.style.display = "none";
    });
  }

  /** Ghost the piece into place and light up any line it would complete. */
  showPreview(cells, r, c, tone, lines) {
    for (const [dr, dc] of cells) {
      const el = this.at(r + dr, c + dc);
      el.classList.add("preview");
      el.firstChild.style.display = "";
      paintTone(el.firstChild, this.theme, tone);
    }
    for (const rr of lines.rows) for (let i = 0; i < N; i++) this.at(rr, i).classList.add("willclear");
    for (const cc of lines.cols) for (let i = 0; i < N; i++) this.at(i, cc).classList.add("willclear");
  }

  showBlocked(cells, r, c) {
    for (const [dr, dc] of cells) {
      if (r + dr < 0 || r + dr >= N || c + dc < 0 || c + dc >= N) continue;
      this.at(r + dr, c + dc).classList.add("blocked");
    }
  }

  /** Animate a set of cell indices out, then hand back control. */
  animateClear(indices, after) {
    for (const i of indices) this.cells[i].classList.add("clearing");
    setTimeout(() => {
      for (const i of indices) this.cells[i].classList.remove("clearing");
      after();
    }, 290);
  }

  /** Pixel geometry of the live board, measured (never assumed). */
  geom() {
    const b = this.el.getBoundingClientRect();
    const a = this.cells[0].getBoundingClientRect();
    const a2 = this.cells[1].getBoundingClientRect();
    return {
      left: b.left, top: b.top, width: b.width,
      pad: a.left - b.left,
      size: a.width,
      step: (a2.left - a.left) || a.width,
    };
  }
}
