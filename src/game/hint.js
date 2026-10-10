/**
 * The hint: a good move for the current tray, by a simple evaluation.
 *
 *   + lines cleared (by far the most important)
 *   + snugness: how many sides of the piece touch blocks or walls
 *   - isolated holes left behind (single empty cells nothing small can fill)
 *   - leaving another tray piece with nowhere to go (almost a loss)
 *
 * Pure: reads the Run, never changes it.
 */
import { N, EMPTY, cloneGrid, fits, anywhere, fullLines } from "./board.js";

function holes(g) {
  let n = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (g[r][c] !== EMPTY) continue;
    let walls = 0;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= N || cc < 0 || cc >= N || g[rr][cc] !== EMPTY) walls++;
    }
    if (walls === 4) n++;
  }
  return n;
}

function contact(g, cells, r, c) {
  const mine = new Set(cells.map(([dr, dc]) => (r + dr) * N + c + dc));
  let n = 0;
  for (const [dr, dc] of cells) {
    for (const [ar, ac] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr + ar, cc = c + dc + ac;
      if (rr < 0 || rr >= N || cc < 0 || cc >= N) n++;
      else if (!mine.has(rr * N + cc) && g[rr][cc] !== EMPTY) n++;
    }
  }
  return n;
}

/**
 * Best { slot, r, c, cells, lines } for this run, or null if nothing fits.
 * `prefer` (optional) is a set of cell indices worth clearing - Adventure's
 * gems - and each one a move would clear counts like an extra line.
 */
export function findHint(run, prefer = null) {
  let best = null;
  run.tray.forEach((p, slot) => {
    if (!p) return;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (!fits(run.grid, p.cells, r, c)) continue;
      const g = cloneGrid(run.grid);
      for (const [dr, dc] of p.cells) g[r + dr][c + dc] = p.tone;
      const touch = contact(g, p.cells, r, c);
      const { rows, cols } = fullLines(g);
      let bonus = 0;
      if (prefer && prefer.size) {
        for (const i of prefer) {
          if (rows.includes(Math.floor(i / N)) || cols.includes(i % N)) bonus += 1500;
        }
      }
      for (const rr of rows) for (let k = 0; k < N; k++) g[rr][k] = EMPTY;
      for (const cc of cols) for (let k = 0; k < N; k++) g[k][cc] = EMPTY;
      const lines = rows.length + cols.length;
      const stranded = run.tray.some((q, i) => q && i !== slot && !anywhere(g, q.cells));
      const score = lines * 1000 + bonus + touch * 6 - holes(g) * 40 - (stranded ? 5000 : 0);
      if (!best || score > best.score) best = { slot, r, c, cells: p.cells, lines, score };
    }
  });
  return best;
}
