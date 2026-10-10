/**
 * Adventure: numbered levels, each a goal with a move limit and a 1-3 star
 * result. Levels are generated from their number (seeded), so there is no
 * level data to ship and no end to the map, but level 12 is the same
 * level 12 for everyone, every time.
 *
 * Goal types, rotating so consecutive levels feel different:
 *   lines   clear N lines
 *   score   reach N points
 *   gems    clear the lines that hold every gem
 *   stones  clear N lines on a board seeded with stone blocks
 *
 * Pure: no DOM. The UI tracks progress with track() after each placement.
 */
import { Rng } from "./rng.js";
import { N, EMPTY, emptyGrid, fullLines } from "./board.js";

const TYPES = ["lines", "score", "gems", "lines", "stones", "score", "gems"];

/** FNV-1a: a stable seed per level. */
function levelSeed(n) {
  let h = 0x811c9dc5;
  const s = "timberblock/adventure|" + n;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h | 0;
}

/** Scatter `count` blocks without completing any line. */
function scatter(rng, grid, count, tone) {
  let placed = 0, guard = 0;
  while (placed < count && guard++ < 500) {
    const r = rng.int(N), c = rng.int(N);
    if (grid[r][c] !== EMPTY) continue;
    grid[r][c] = tone == null ? rng.int(7) : tone;
    const { rows, cols } = fullLines(grid);
    if (rows.length || cols.length) { grid[r][c] = EMPTY; continue; }
    placed++;
  }
  return placed;
}

/** Level n's definition. */
export function level(n) {
  n = Math.max(1, n | 0);
  const rng = new Rng(levelSeed(n));
  const type = n === 1 ? "lines" : TYPES[(n - 1) % TYPES.length];
  const tier = Math.floor((n - 1) / TYPES.length);          // 0,1,2... every 7 levels
  const grid = emptyGrid();
  const gems = [];
  const stones = [];
  let target, moves, title, text;

  if (type === "lines") {
    target = Math.min(4 + tier * 2 + (n % 3), 24);
    moves = Math.round(target * 2.6 + 6 - Math.min(tier, 6));
    scatter(rng, grid, Math.min(4 + tier * 2, 18));
    title = `Clear ${target} lines`;
    text = `Clear ${target} rows or columns in ${moves} moves.`;
  } else if (type === "score") {
    // ~12 points a move is what solid play earns; ask for 8, rising to 11.5
    moves = 18 + Math.min(tier * 3, 18);
    target = Math.round((moves * Math.min(8 + tier, 11.5)) / 10) * 10;
    scatter(rng, grid, Math.min(6 + tier * 2, 20));
    title = `Score ${target.toLocaleString("en-US")}`;
    text = `Reach ${target.toLocaleString("en-US")} points in ${moves} moves.`;
  } else if (type === "gems") {
    const count = Math.min(3 + tier, 10);
    scatter(rng, grid, Math.min(8 + tier * 2, 22));
    // gems sit on existing blocks, at least two apart so one clear can't take them all
    let guard = 0;
    while (gems.length < count && guard++ < 400) {
      const r = rng.int(N), c = rng.int(N);
      if (grid[r][c] === EMPTY) continue;
      const i = r * N + c;
      if (gems.some((g) => Math.floor(g / N) === r || g % N === c)) continue;
      gems.push(i);
    }
    target = gems.length;
    moves = 12 + target * 5 - Math.min(tier, 6);
    title = `Collect ${target} gems`;
    text = `Clear the row or column under every gem in ${moves} moves.`;
  } else {
    // stones: drawn grey by the UI (see `stones`), whatever their tone
    target = Math.min(5 + tier * 2, 20);
    scatter(rng, grid, Math.min(10 + tier * 3, 26), 6);
    for (let i = 0; i < N * N; i++) if (grid[Math.floor(i / N)][i % N] !== EMPTY) stones.push(i);
    moves = Math.round(target * 2.8 + 6);
    title = `Break through: ${target} lines`;
    text = `Clear ${target} lines on a board full of stone in ${moves} moves.`;
  }
  return { n, type, target, moves, grid, gems, stones, seed: levelSeed(n), title, text };
}

/** A fresh progress record for a level. */
export const startState = (lv) => ({ moves: 0, lines: 0, score: 0, gemsLeft: new Set(lv.gems) });

/**
 * Fold one placement event into progress. Returns
 * { done, failed, value, of, left } - left is moves remaining.
 */
export function track(lv, st, ev, runScore) {
  st.moves += 1;
  st.lines += ev.lines || 0;
  st.score = runScore;
  if (ev.cleared) for (const i of ev.cleared) st.gemsLeft.delete(i);
  const value = lv.type === "score" ? Math.min(st.score, lv.target)
    : lv.type === "gems" ? lv.target - st.gemsLeft.size
    : Math.min(st.lines, lv.target);
  const done = value >= lv.target;
  const left = lv.moves - st.moves;
  return { done, failed: !done && left <= 0, value, of: lv.target, left };
}

/** 3 stars with 40%+ of the moves to spare, 2 with 15%+, else 1. */
export function stars(lv, movesUsed) {
  const spare = (lv.moves - movesUsed) / lv.moves;
  return spare >= 0.4 ? 3 : spare >= 0.15 ? 2 : 1;
}
