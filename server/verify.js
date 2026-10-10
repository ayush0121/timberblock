/**
 * Reference replay verifier.
 *
 * Deploy as a Cloud Function. It imports the SAME engine the client runs -
 * never a second implementation, which would silently drift and start
 * rejecting honest players' scores.
 *
 *   1. the seed must be the one this server issued for this runId
 *   2. every move must be legal on the replayed board
 *   3. the replayed score must equal the claimed score
 *   4. move timings must be humanly plausible
 *
 * Only after all four does the caller write `best` and the leaderboard row.
 */
import { Run } from "../src/game/run.js";

export const MIN_MOVE_MS = 90;         // nobody places pieces faster than this
export const MAX_RUN_MS = 6 * 3600e3;  // six hours

export function verifyRun({ seed, mode, tones, moves, claimedScore, gentle = false, rules = null }) {
  if (!Array.isArray(moves) || moves.length === 0) return { ok: false, code: "empty" };
  if (moves.length > 20000) return { ok: false, code: "too_many_moves" };

  const run = new Run({ mode, seed, tones, gentle, rules });
  let lastT = -1;
  const gaps = [];

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!Array.isArray(m) || m.length !== 4) return { ok: false, code: "malformed", at: i };
    const [slot, r, c, t] = m;

    if (t < lastT || t > MAX_RUN_MS) return { ok: false, code: "bad_time", at: i };
    if (lastT >= 0) gaps.push(t - lastT);

    // Professional mode: advance the clock to this move's timestamp before
    // applying it, so a run that kept playing after time expired is caught.
    if (run.timed && lastT >= 0) {
      if (run.tick((t - lastT) / 1000)) return { ok: false, code: "expired", at: i };
    }
    lastT = t;

    if (!run.place(slot, r, c, t)) return { ok: false, code: "illegal_move", at: i };
  }

  if (run.score !== claimedScore)
    return { ok: false, code: "score_mismatch", computed: run.score, claimed: claimedScore };

  const fast = gaps.filter((g) => g < MIN_MOVE_MS).length;
  if (fast > gaps.length * 0.1)
    return { ok: false, code: "inhuman_speed", fast, total: gaps.length };

  // Bots are rhythmically regular in a way people never are.
  if (gaps.length >= 20) {
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
    if (mean > 0 && sd / mean < 0.06)
      return { ok: false, code: "robotic_cadence", cv: +(sd / mean).toFixed(4) };
  }

  return { ok: true, score: run.score, level: run.level, moves: moves.length };
}

// node server/verify.js --demo
if (process.argv.includes("--demo")) {
  const run = new Run({ mode: "classic", seed: 12345, tones: 7 });
  let t = 0;
  while (!run.over && run.moves.length < 500) {
    let placed = false;
    search:
    for (let s = 0; s < 3; s++) {
      if (!run.tray[s]) continue;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        if (run.legal(s, r, c)) {
          t += 400 + Math.floor(Math.random() * 900);
          run.place(s, r, c, t);
          placed = true;
          break search;
        }
      }
    }
    if (!placed) break;
  }
  const sub = run.submission();
  console.log("honest run   ->", verifyRun(sub));
  console.log("inflated     ->", verifyRun({ ...sub, claimedScore: sub.claimedScore + 50000 }));
  console.log("tampered seed->", verifyRun({ ...sub, seed: sub.seed + 1 }));
}
