/** The 8x8 grid. Cells hold a tone index, or -1 for empty. */
import { spanRows, spanCols } from "./shapes.js";

export const N = 8;
export const EMPTY = -1;

export const emptyGrid = () => Array.from({ length: N }, () => Array(N).fill(EMPTY));

export const cloneGrid = (g) => g.map((row) => row.slice());

export function fits(grid, cells, r, c) {
  for (const [dr, dc] of cells) {
    const rr = r + dr, cc = c + dc;
    if (rr < 0 || rr >= N || cc < 0 || cc >= N) return false;
    if (grid[rr][cc] !== EMPTY) return false;
  }
  return true;
}

/** Can this shape be placed anywhere at all on this grid? */
export function anywhere(grid, cells) {
  const maxR = N - spanRows(cells), maxC = N - spanCols(cells);
  for (let r = 0; r <= maxR; r++)
    for (let c = 0; c <= maxC; c++)
      if (fits(grid, cells, r, c)) return true;
  return false;
}

/** Rows and columns that are currently complete. */
export function fullLines(grid) {
  const rows = [], cols = [];
  for (let r = 0; r < N; r++)
    if (grid[r].every((v) => v !== EMPTY)) rows.push(r);
  for (let c = 0; c < N; c++) {
    let full = true;
    for (let r = 0; r < N; r++) if (grid[r][c] === EMPTY) { full = false; break; }
    if (full) cols.push(c);
  }
  return { rows, cols };
}

/** Cell indices (r*N+c) covered by the given complete lines. */
export function lineCells(rows, cols) {
  const hit = new Set();
  for (const r of rows) for (let c = 0; c < N; c++) hit.add(r * N + c);
  for (const c of cols) for (let r = 0; r < N; r++) hit.add(r * N + c);
  return hit;
}

export const flatten = (grid) => grid.flat();
export const unflatten = (flat) =>
  Array.from({ length: N }, (_, r) => flat.slice(r * N, r * N + N));
