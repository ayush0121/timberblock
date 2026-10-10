/**
 * The first-run tutorial: three scripted boards that teach the whole game in
 * about twenty seconds - fill a row, fill a column, fill both at once.
 *
 * Each step is a preset grid, a one-piece tray and the one spot that piece
 * must go. An animated hand shows the drag; the goal cells pulse. Nothing
 * here is random and nothing is saved - it never touches a real run.
 */
import { N, EMPTY } from "../game/board.js";

/** Build an 8x8 grid with the given cells filled, cycling through tones. */
function gridWith(filled) {
  const g = Array.from({ length: N }, () => Array(N).fill(EMPTY));
  filled.forEach(([r, c], i) => { g[r][c] = (r * 3 + c + i) % 7; });
  return g;
}
const row = (r, except) => [...Array(N).keys()].filter((c) => !except.includes(c)).map((c) => [r, c]);
const col = (c, except) => [...Array(N).keys()].filter((r) => !except.includes(r)).map((r) => [r, c]);

export const STEPS = [
  {
    title: "Fill a row",
    text: "Drag the piece into the gap. A full row clears.",
    grid: () => gridWith(row(7, [3, 4])),
    piece: { id: "line2", cells: [[0, 0], [0, 1]], tone: 1 },
    at: [7, 3],
  },
  {
    title: "Columns clear too",
    text: "Fill the column from top to bottom.",
    grid: () => gridWith(col(2, [5, 6, 7])),
    piece: { id: "line3", cells: [[0, 0], [1, 0], [2, 0]], tone: 3 },
    at: [5, 2],
  },
  {
    title: "Both at once",
    text: "Finish a row AND a column with one piece for a big bonus.",
    grid: () => gridWith([...row(6, [5, 6]), ...col(6, [5, 6])]),
    piece: { id: "corner3", cells: [[0, 1], [1, 0], [1, 1]], tone: 0 },
    at: [5, 5],
  },
];

/** Load step `i` into a Run: its board, and its single piece in the middle slot. */
export function loadStep(run, i) {
  const s = STEPS[i];
  run.grid = s.grid();
  run.tray = [null, { ...s.piece }, null];
  run.over = false;
}

/** The only drop the step accepts. */
export const isGoal = (i, drop) => !!drop && drop.r === STEPS[i].at[0] && drop.c === STEPS[i].at[1];

/**
 * The pointing hand and the pulsing goal cells. `board` is the BoardView,
 * `trayEl` the tray. Call show(i) after the step renders, hide() to clear.
 */
export class Coach {
  constructor(board, trayEl) {
    this.board = board;
    this.trayEl = trayEl;
    this.hand = document.createElement("div");
    this.hand.className = "tut-hand";
    this.hand.setAttribute("aria-hidden", "true");
    this.hand.hidden = true;
    document.body.appendChild(this.hand);
    this.step = -1;
    addEventListener("resize", () => { if (this.step >= 0 && !this.hand.hidden) this.place(); });
  }

  show(i) {
    this.step = i;
    this.clearGoal();
    const s = STEPS[i];
    for (const [dr, dc] of s.piece.cells) this.board.at(s.at[0] + dr, s.at[1] + dc).classList.add("tut-goal");
    this.hand.hidden = false;
    this.place();
  }

  /** Aim the hand from the piece in the tray to the middle of the goal. */
  place() {
    const piece = this.trayEl.querySelector(".piece");
    if (!piece) return;
    const s = STEPS[this.step];
    const from = piece.getBoundingClientRect();
    const g = this.board.geom();
    const rows = Math.max(...s.piece.cells.map((c) => c[0])) + 1;
    const cols = Math.max(...s.piece.cells.map((c) => c[1])) + 1;
    const x1 = g.left + g.pad + (s.at[1] + cols / 2) * g.step;
    const y1 = g.top + g.pad + (s.at[0] + rows / 2) * g.step;
    const st = this.hand.style;
    st.setProperty("--x0", from.left + from.width / 2 + "px");
    st.setProperty("--y0", from.top + from.height / 2 + "px");
    st.setProperty("--x1", x1 + "px");
    st.setProperty("--y1", y1 + "px");
    // restart the loop so it begins from the tray every time
    this.hand.classList.remove("go"); void this.hand.offsetWidth; this.hand.classList.add("go");
  }

  /** While the player is dragging, get out of the way. */
  pause() { this.hand.hidden = true; }
  resume() { if (this.step >= 0) { this.hand.hidden = false; this.place(); } }

  clearGoal() {
    for (const el of this.board.cells) el.classList.remove("tut-goal");
  }

  hide() {
    this.step = -1;
    this.hand.hidden = true;
    this.clearGoal();
  }
}
