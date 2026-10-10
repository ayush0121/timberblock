/** Polyomino families, their distinct rotations, and a weighted draw. */

const normalize = (c) => {
  const mr = Math.min(...c.map((p) => p[0]));
  const mc = Math.min(...c.map((p) => p[1]));
  return c
    .map(([r, q]) => [r - mr, q - mc])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
};
const keyOf = (c) => c.map((p) => p.join(",")).join(";");
const quarterTurn = (c) => normalize(c.map(([r, q]) => [q, -r]));
/** A shape turned 90° clockwise, re-anchored at the top-left. */
export const rotateCells = quarterTurn;

function rotations(c) {
  const out = [];
  let cur = normalize(c);
  for (let i = 0; i < 4; i++) {
    if (!out.some((o) => keyOf(o) === keyOf(cur))) out.push(cur);
    cur = quarterTurn(cur);
  }
  return out;
}

const line = (n) => Array.from({ length: n }, (_, i) => [0, i]);

/** weight = relative frequency. Small and mid pieces dominate on purpose. */
export const FAMILIES = [
  { id: "peg",     w: 3, c: [[0, 0]] },
  { id: "line2",   w: 9, c: line(2) },
  { id: "line3",   w: 9, c: line(3) },
  { id: "line4",   w: 5, c: line(4) },
  { id: "line5",   w: 3, c: line(5) },
  { id: "square2", w: 8, c: [[0,0],[0,1],[1,0],[1,1]] },
  { id: "square3", w: 2, c: [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]] },
  { id: "corner3", w: 9, c: [[0,0],[0,1],[1,0]] },
  { id: "corner5", w: 4, c: [[0,0],[0,1],[0,2],[1,0],[2,0]] },
  { id: "ell",     w: 6, c: [[0,0],[1,0],[2,0],[2,1]] },
  { id: "jay",     w: 6, c: [[0,1],[1,1],[2,1],[2,0]] },
  { id: "ess",     w: 4, c: [[0,1],[0,2],[1,0],[1,1]] },
  { id: "zee",     w: 4, c: [[0,0],[0,1],[1,1],[1,2]] },
  { id: "tee",     w: 5, c: [[0,0],[0,1],[0,2],[1,1]] },
  { id: "rect23",  w: 4, c: [[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]] },
];

/** Every distinct orientation of every family, flattened for weighted draw. */
export const POOL = FAMILIES.flatMap((f) =>
  rotations(f.c).map((c) => ({ id: f.id, cells: c, w: f.w }))
);
const TOTAL_W = POOL.reduce((s, p) => s + p.w, 0);

/** A beginner's pool: no 3x3 slabs, five-longs or big corners, which are
 *  what end most first games before the player has learned to plan. */
const HARD = new Set(["square3", "line5", "corner5", "rect23"]);
export const GENTLE_POOL = POOL.filter((p) => !HARD.has(p.id));

/** Event pools: "tiny" is everything of four blocks or fewer; "big" is the
 *  heavyweights plus just enough mid pieces to stay playable. */
const BIG = new Set(["square3", "line5", "corner5", "rect23", "line4", "square2"]);
export const POOLS = { tiny: GENTLE_POOL, big: POOL.filter((p) => BIG.has(p.id)) };

export const spanRows = (c) => Math.max(...c.map((p) => p[0])) + 1;
export const spanCols = (c) => Math.max(...c.map((p) => p[1])) + 1;

/**
 * Draw one piece. `tones` is the number of colours the active theme offers;
 * the colour is drawn from the same Rng so replays match exactly.
 */
export function drawPiece(rng, tones, pool = POOL) {
  const total = pool === POOL ? TOTAL_W : pool.reduce((s, p) => s + p.w, 0);
  let t = rng.next() * total;
  let chosen = pool[0];
  for (const p of pool) {
    t -= p.w;
    if (t <= 0) { chosen = p; break; }
  }
  return { id: chosen.id, cells: chosen.cells, tone: rng.int(tones) };
}
