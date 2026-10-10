/**
 * One run of the game: the authoritative state machine.
 *
 * Pure logic - no DOM, no timers, no browser APIs. The UI drives it and reads
 * the events it returns; server/verify.js drives the identical class with a
 * recorded move log. If those two ever disagree, the client is lying.
 */
import { Rng } from "./rng.js";
import { drawPiece, spanRows, spanCols, GENTLE_POOL, POOLS, POOL, rotateCells } from "./shapes.js";
import {
  N, EMPTY, emptyGrid, fits, anywhere, fullLines, lineCells, flatten, unflatten,
} from "./board.js";
import { placementPoints, clearPoints, timeBonus } from "./scoring.js";
import { MODES, target, clock } from "./modes.js";

export const TRAY_SIZE = 3;

/** A gentle run deals beginner-friendly hands for this many placements,
 *  then quietly becomes a normal game. */
export const GENTLE_MOVES = 30;

export class Run {
  /**
   * @param {object} o
   * @param {string} o.mode   "classic" | "pro"
   * @param {number} o.seed   issued by the server in production
   * @param {number} o.tones  how many colours the active theme has
   * @param {boolean} [o.gentle] beginner dealing for the opening moves
   * @param {object} [o.rules] event twists: { pool: "tiny"|"big",
   *   comboStep: number, stones: count }. Recorded with the run.
   */
  constructor({ mode = "classic", seed = 1, tones = 7, gentle = false, rules = null }) {
    this.mode = MODES[mode] ? mode : "classic";
    this.seed = seed | 0;
    this.tones = tones;
    this.rng = new Rng(this.seed);

    this.grid = emptyGrid();
    this.tray = [];
    this.score = 0;
    this.streak = 0;
    this.level = 1;
    this.levelScore = 0;
    this.timeLeft = MODES[this.mode].timed ? clock(1) : 0;
    this.over = false;
    this.reason = null;          // "room" | "time"
    this.moves = [];             // [traySlot, row, col, msSinceStart]
    this.gentle = !!gentle;
    this.rules = rules || null;
    this.stones = new Set();     // cell indices holding stone; they clear like blocks
    if (this.rules && this.rules.stones) this.placeStones(this.rules.stones);

    this.refill();
  }

  get timed() { return MODES[this.mode].timed; }
  get levelTarget() { return target(this.level); }
  get levelClock() { return clock(this.level); }

  // ── tray ──────────────────────────────────────────────────────────
  /**
   * Deal three pieces. Re-rolls (deterministically) until at least one of
   * them fits, so a player never loses to a dealt-dead hand.
   */
  refill() {
    const easy = this.mode === "zen" || (this.gentle && this.moves.length < GENTLE_MOVES);
    if (easy && this.gentleRefill()) return;
    const pool = (this.rules && POOLS[this.rules.pool]) || POOL;
    for (let attempt = 0; attempt < 50; attempt++) {
      const trio = [
        drawPiece(this.rng, this.tones, pool),
        drawPiece(this.rng, this.tones, pool),
        drawPiece(this.rng, this.tones, pool),
      ];
      if (trio.some((p) => anywhere(this.grid, p.cells))) { this.tray = trio; return; }
    }
    this.tray = [
      drawPiece(this.rng, this.tones, pool),
      drawPiece(this.rng, this.tones, pool),
      drawPiece(this.rng, this.tones, pool),
    ];
  }

  /**
   * Beginner hand: small and mid pieces only, and - when the board allows -
   * at least one piece that can complete a line, so a new player gets a
   * clear early. Every choice still comes from this.rng: replays match.
   */
  gentleRefill() {
    let fallback = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const trio = [0, 1, 2].map(() => drawPiece(this.rng, this.tones, GENTLE_POOL));
      if (!trio.some((p) => anywhere(this.grid, p.cells))) continue;
      if (trio.some((p) => this.canClear(p.cells))) { this.tray = trio; return true; }
      fallback = fallback || trio;
    }
    if (fallback) { this.tray = fallback; return true; }
    return false;
  }

  /** Could this shape complete a row or column anywhere right now? */
  canClear(cells) {
    const g = this.grid;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (!fits(g, cells, r, c)) continue;
      for (const [dr, dc] of cells) g[r + dr][c + dc] = 0;
      const { rows, cols } = fullLines(g);
      for (const [dr, dc] of cells) g[r + dr][c + dc] = EMPTY;
      if (rows.length || cols.length) return true;
    }
    return false;
  }

  /** Scatter stones from the run's own Rng, never completing a line. */
  placeStones(count) {
    let guard = 0;
    while (this.stones.size < count && guard++ < 500) {
      const r = this.rng.int(N), c = this.rng.int(N);
      if (this.grid[r][c] !== EMPTY) continue;
      this.grid[r][c] = 6;
      const { rows, cols } = fullLines(this.grid);
      if (rows.length || cols.length) { this.grid[r][c] = EMPTY; continue; }
      this.stones.add(r * N + c);
    }
  }

  legal(slot, r, c) {
    const p = this.tray[slot];
    return !!p && !this.over && fits(this.grid, p.cells, r, c);
  }

  /** Which lines WOULD clear if this piece landed here. For the preview. */
  wouldClear(slot, r, c) {
    if (!this.legal(slot, r, c)) return { rows: [], cols: [] };
    const p = this.tray[slot];
    for (const [dr, dc] of p.cells) this.grid[r + dr][c + dc] = p.tone;
    const lines = fullLines(this.grid);
    for (const [dr, dc] of p.cells) this.grid[r + dr][c + dc] = EMPTY;
    return lines;
  }

  isStuck() {
    return !this.tray.some((p) => p && anywhere(this.grid, p.cells));
  }

  /** Slots that currently have nowhere to go - the UI greys these out. */
  deadSlots() {
    return this.tray.map((p) => !!p && !anywhere(this.grid, p.cells));
  }

  // ── the move ──────────────────────────────────────────────────────
  /**
   * Place tray[slot] at (r,c). Returns an event describing what happened,
   * or null if the move was illegal.
   */
  place(slot, r, c, tMs) {
    if (!this.legal(slot, r, c)) return null;
    const p = this.tray[slot];
    this.moves.push([slot, r, c, tMs | 0]);

    for (const [dr, dc] of p.cells) this.grid[r + dr][c + dc] = p.tone;
    this.tray[slot] = null;

    let gained = placementPoints(p.cells.length);
    const { rows, cols } = fullLines(this.grid);
    const n = rows.length + cols.length;
    let cleared = null, lineScore = 0;
    const streakBefore = this.streak;

    if (n > 0) {
      lineScore = clearPoints(n, streakBefore, (this.rules && this.rules.comboStep) || 0.25);
      gained += lineScore;
      cleared = lineCells(rows, cols);
      for (const i of cleared) this.stones.delete(i);
      for (const i of cleared) this.grid[Math.floor(i / N)][i % N] = EMPTY;
      this.streak++;
    } else {
      this.streak = 0;
    }

    this.score += gained;
    this.levelScore += gained;
    if (this.tray.every((x) => x === null)) this.refill();

    const ev = {
      placed: { cells: p.cells, r, c, tone: p.tone },
      gained, lineScore, lines: n, rows, cols, cleared,
      streak: this.streak, levelUp: false, over: false,
    };

    if (this.timed && this.levelScore >= this.levelTarget) {
      ev.levelUp = true;
      ev.bonus = timeBonus(this.timeLeft);
      ev.clearedLevel = this.level;
      ev.secondsLeft = Math.ceil(this.timeLeft);
      this.score += ev.bonus;
      this.advanceLevel();
      ev.nextLevel = this.level;
      ev.nextTarget = this.levelTarget;
    } else if (this.isStuck()) {
      if (this.mode === "zen") ev.relief = this.relieve();
      else { this.end("room"); ev.over = true; }
    }
    return ev;
  }

  /**
   * Zen never ends: when nothing fits, the fullest rows dissolve (no points)
   * until something does. Deterministic - fullest first, top to bottom.
   */
  relieve() {
    const rows = [];
    while (this.isStuck() && rows.length < N) {
      const order = [...Array(N).keys()]
        .filter((r) => !rows.includes(r))
        .sort((a, b) => this.grid[b].filter((v) => v !== EMPTY).length -
                        this.grid[a].filter((v) => v !== EMPTY).length || a - b);
      for (const r of order.slice(0, 3)) { this.grid[r].fill(EMPTY); rows.push(r); }
    }
    this.streak = 0;
    return rows;
  }

  advanceLevel() {
    this.level++;
    this.levelScore = 0;
    this.timeLeft = clock(this.level);
    this.grid = emptyGrid();
    this.streak = 0;
    this.refill();
  }

  /** Called by the UI's ticker. Returns true if time just ran out. */
  tick(dtSeconds) {
    if (!this.timed || this.over) return false;
    this.timeLeft -= dtSeconds;
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.end("time"); return true; }
    return false;
  }

  end(reason) { this.over = true; this.reason = reason; }

  // ── power-ups ─────────────────────────────────────────────────────
  // Logged in the move list as [slot, -1, 0, t] (rotate) and
  // [0, -2, 0, t] (swap), so a replay reproduces them exactly. They are
  // never legal on verified boards: place() refuses negative rows, so the
  // server's replay of a daily/event/challenge run rejects them.

  /** Running out of room can be undone by a power-up; time can't. */
  get rescuable() { return !this.over || this.reason === "room"; }

  /** Turn a tray piece 90° clockwise. */
  rotate(slot, tMs) {
    const p = this.tray[slot];
    if (!p || !this.rescuable) return false;
    this.tray[slot] = { ...p, cells: rotateCells(p.cells) };
    this.moves.push([slot, -1, 0, tMs | 0]);
    this.reopen();
    return true;
  }

  /** Throw the tray away and deal three new pieces. */
  swap(tMs) {
    if (!this.rescuable) return false;
    this.refill();
    this.moves.push([0, -2, 0, tMs | 0]);
    this.reopen();
    return true;
  }

  /** After a power-up, a run that had run out of room may have room again. */
  reopen() {
    if (this.over && this.reason === "room") { this.over = false; this.reason = null; }
    if (!this.over && this.tray.some(Boolean) && this.isStuck()) this.end("room");
  }

  /** Apply any logged move: placement, rotate or swap. */
  apply([slot, r, c, t]) {
    if (r === -1) return this.rotate(slot, t);
    if (r === -2) return this.swap(t);
    return this.place(slot, r, c, t);
  }

  // ── persistence ───────────────────────────────────────────────────
  snapshot() {
    return {
      v: 1,
      mode: this.mode, seed: this.seed, tones: this.tones, gentle: this.gentle,
      rules: this.rules, stones: [...this.stones],
      rng: this.rng.state,
      grid: flatten(this.grid),
      tray: this.tray.map((p) => (p ? { i: p.id, c: p.cells, t: p.tone } : null)),
      score: this.score, streak: this.streak,
      level: this.level, levelScore: this.levelScore, timeLeft: this.timeLeft,
      moves: this.moves,
      updatedAt: Date.now(),
    };
  }

  static restore(s) {
    const run = new Run({ mode: s.mode, seed: s.seed, tones: s.tones, gentle: s.gentle, rules: s.rules });
    run.rng.state = s.rng;
    run.grid = unflatten(s.grid);
    run.tray = s.tray.map((p) => (p ? { id: p.i, cells: p.c, tone: p.t } : null));
    if (run.tray.every((x) => x === null)) run.refill();
    run.score = s.score; run.streak = s.streak;
    run.level = s.level; run.levelScore = s.levelScore; run.timeLeft = s.timeLeft;
    run.moves = Array.isArray(s.moves) ? s.moves : [];
    run.stones = new Set(Array.isArray(s.stones) ? s.stones : []);
    return run;
  }

  /** What gets submitted for server verification at run end. */
  submission() {
    return {
      mode: this.mode, seed: this.seed, tones: this.tones, gentle: this.gentle,
      rules: this.rules, moves: this.moves, claimedScore: this.score, level: this.level,
      reason: this.reason,
    };
  }
}

export { N, spanRows, spanCols, target, clock, MODES };
