/**
 * Seeded, serializable PRNG (mulberry32).
 *
 * Nothing in src/game/ may call Math.random(). Every random decision a run
 * makes flows through one Rng instance, seeded once at run start by the
 * server, so the whole run can be replayed exactly from {seed, moves}.
 */
export class Rng {
  constructor(seed) { this.s = seed | 0; }

  next() {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n) { return Math.floor(this.next() * n); }

  pick(arr) { return arr[this.int(arr.length)]; }

  /** Current internal state - enough to resume mid-run byte-for-byte. */
  get state() { return this.s | 0; }
  set state(v) { this.s = v | 0; }
}

/** Client-side seed, for offline play only. In production the SERVER issues
 *  the seed at run start so a player cannot shop for a favourable one. */
export function localSeed() {
  const a = new Uint32Array(1);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(a);
  else a[0] = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  return a[0] | 0;
}
