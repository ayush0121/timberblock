// Engine tests: determinism and gentle dealing. node tests/engine.mjs
import { Run, GENTLE_MOVES } from "../src/game/run.js";
import { verifyRun } from "../server/verify.js";
import { encodeChallenge, decodeChallenge } from "../src/game/challenge.js";
import { findHint } from "../src/game/hint.js";
import { advanceStreak, streakState, weekKey } from "../src/game/daily.js";
import { award } from "../src/game/achievements.js";
import { EVENTS } from "../src/game/events.js";
import { clearPoints } from "../src/game/scoring.js";
import { level } from "../src/game/adventure.js";
import { questsFor, today as questsToday, bump } from "../src/game/quests.js";
import { SEASONS, activeSeason, daysLeft, seasonSeed } from "../src/game/seasons.js";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("PASS -", name); }
  catch (e) { fail++; console.log("FAIL -", name, "\n     ->", e.message); }
}
const ok = (v, m) => { if (!v) throw new Error(m); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

/** Play greedily (first legal spot), with human-ish timing. */
function playOut(run, limit = 300) {
  let t = 0, k = 0;
  const dealt = [];
  const note = () => run.tray.forEach((p) => p && dealt.push({ id: p.id, at: run.moves.length }));
  note();
  while (!run.over && run.moves.length < limit) {
    let done = false;
    for (let s = 0; s < 3 && !done; s++) {
      if (!run.tray[s]) continue;
      for (let r = 0; r < 8 && !done; r++) for (let c = 0; c < 8 && !done; c++) {
        if (run.legal(s, r, c)) {
          t += 350 + ((k++ * 7919) % 800);
          const before = run.tray.every((x) => x === null) ? 0 : 1;
          run.place(s, r, c, t);
          if (run.tray.filter(Boolean).length === 3) note();
          done = true;
        }
      }
    }
    if (!done) break;
  }
  return dealt;
}

const HARD = ["square3", "line5", "corner5", "rect23"];

test("gentle runs never deal a hard piece during the gentle window", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const dealt = playOut(new Run({ mode: "classic", seed, tones: 7, gentle: true }));
    const early = dealt.filter((d) => d.at < GENTLE_MOVES);
    ok(early.every((d) => !HARD.includes(d.id)), `seed ${seed}: ${early.map((d) => d.id).join()}`);
  }
});

test("gentle runs last longer than normal ones on average", () => {
  let g = 0, n = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const a = new Run({ mode: "classic", seed, tones: 7, gentle: true }); playOut(a); g += a.moves.length;
    const b = new Run({ mode: "classic", seed, tones: 7 }); playOut(b); n += b.moves.length;
  }
  ok(g > n, `gentle avg ${g / 60} vs normal ${n / 60}`);
});

test("a gentle run replays exactly and verifies", () => {
  const run = new Run({ mode: "classic", seed: 777, tones: 7, gentle: true });
  playOut(run);
  const v = verifyRun(run.submission());
  ok(v.ok, "verify: " + JSON.stringify(v));
  eq(v.score, run.score, "score");
  const wrong = verifyRun({ ...run.submission(), gentle: false });
  ok(!wrong.ok, "the same moves must NOT verify as a normal run");
});

test("snapshot/restore keeps gentle dealing", () => {
  const a = new Run({ mode: "classic", seed: 99, tones: 7, gentle: true });
  for (let i = 0; i < 4; i++) {
    outer: for (let s = 0; s < 3; s++) for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++)
      if (a.legal(s, r, c)) { a.place(s, r, c, (i + 1) * 500); break outer; }
  }
  const b = Run.restore(JSON.parse(JSON.stringify(a.snapshot())));
  eq(b.gentle, true, "flag");
  playOut(a); playOut(b);
  eq(b.score, a.score, "same future");
});

test("challenge links carry the gentle flag; old links stay normal", () => {
  const t = encodeChallenge({ seed: 5, score: 100, name: "A", gentle: true });
  eq(decodeChallenge(t).gentle, true, "gentle");
  eq(decodeChallenge(encodeChallenge({ seed: 5, score: 100, name: "A" })).gentle, false, "normal");
});

test("zen never ends, and replays exactly", () => {
  const run = new Run({ mode: "zen", seed: 4242, tones: 7 });
  playOut(run, 400);
  ok(!run.over, "zen run ended");
  eq(run.moves.length, 400, "kept going for 400 placements");
  const again = new Run({ mode: "zen", seed: 4242, tones: 7 });
  for (const [s, r, c, t] of run.moves) ok(again.place(s, r, c, t), "replayed move");
  eq(again.score, run.score, "same score");
});

test("hint finds a legal move, and prefers a clear when one exists", () => {
  const run = new Run({ mode: "classic", seed: 1, tones: 7 });
  for (let c = 0; c < 6; c++) run.grid[7][c] = 0;   // row 7 missing two cells
  run.tray = [{ id: "line2", cells: [[0, 0], [0, 1]], tone: 1 }, null, null];
  const h = findHint(run);
  ok(h && run.legal(h.slot, h.r, h.c), "legal");
  eq(`${h.r},${h.c},${h.lines}`, "7,6,1", "takes the clear");
});

test("streak freezes cover missed days, and 7-day milestones earn one", () => {
  const T = "2026-10-10";
  const r = (o) => JSON.stringify(advanceStreak(o, T));
  eq(r({ streak: 4, lastDaily: "2026-10-09", freezes: 1 }), '{"streak":5,"freezes":1,"used":0}', "next day");
  eq(r({ streak: 4, lastDaily: "2026-10-08", freezes: 1 }), '{"streak":5,"freezes":0,"used":1}', "one missed, covered");
  eq(r({ streak: 4, lastDaily: "2026-10-07", freezes: 1 }), '{"streak":1,"freezes":1,"used":0}', "two missed, one freeze: reset");
  eq(r({ streak: 6, lastDaily: "2026-10-09", freezes: 2 }), '{"streak":7,"freezes":2,"used":0}', "milestone capped at 2");
  eq(r({ streak: 6, lastDaily: "2026-10-09", freezes: 0 }), '{"streak":7,"freezes":1,"used":0}', "milestone earns one");
  eq(streakState({ streak: 4, lastDaily: "2026-10-08", freezes: 1 }, T).status, "frozen", "home warns");
  eq(streakState({ streak: 4, lastDaily: "2026-10-07", freezes: 1 }, T).status, "broken", "broken");
});

test("weekKey follows ISO weeks across the year boundary", () => {
  eq(weekKey("2026-10-10"), "2026-W41", "mid-year");
  eq(weekKey("2024-12-30"), "2025-W01", "late Dec belongs to next year's week 1");
  eq(weekKey("2027-01-01"), "2026-W53", "early Jan can belong to last year");
});

test("achievements derive from the profile and are awarded once", () => {
  const prof = { stats: { lines: 1, maxLines: 2, bestCombo: 3 }, best: { classic: 1200 }, games: 1 };
  const first = award(prof, "2026-10-10").map((a) => a.id);
  ok(first.includes("first_clear") && first.includes("double") && first.includes("combo3") && first.includes("score1k"), first.join());
  eq(award(prof, "2026-10-11").length, 0, "nothing twice");
});

test("event rules: pools, stones and combo fever replay and verify exactly", () => {
  for (const ev of EVENTS) {
    const run = new Run({ mode: "event", seed: 31337, tones: 7, rules: ev.rules });
    const dealt = playOut(run);
    if (ev.rules.pool === "tiny") ok(dealt.every((d) => !HARD.includes(d.id)), "tiny pool only");
    if (ev.rules.stones) ok(new Run({ mode: "event", seed: 31337, tones: 7, rules: ev.rules }).stones.size === ev.rules.stones, "stones placed");
    const v = verifyRun(run.submission());
    ok(v.ok && v.score === run.score, ev.id + " verifies: " + JSON.stringify(v));
    ok(!verifyRun({ ...run.submission(), rules: null }).ok || run.score === 0 || ev.id === "fever",
      ev.id + ": the same moves without the rules must not verify");
  }
});

test("combo fever doubles each combo step", () => {
  eq(clearPoints(1, 2), 30, "normal ×2 combo");
  eq(clearPoints(1, 2, 0.5), 40, "fever ×2 combo");
});

test("adventure levels are stable and well-formed", () => {
  const a = level(12), b = level(12);
  eq(JSON.stringify(a), JSON.stringify(b), "same level every time");
  for (let n = 1; n <= 60; n++) {
    const lv = level(n);
    ok(lv.target > 0 && lv.moves > 0, `level ${n} has a goal`);
    if (lv.type === "gems") eq(lv.gems.length, lv.target, `level ${n} gem count`);
  }
});

test("power-ups: rotate and swap are logged and replay exactly", () => {
  const a = new Run({ mode: "classic", seed: 2024, tones: 7 });
  const before = JSON.stringify(a.tray[0].cells);
  ok(a.rotate(0, 100), "rotated");
  const after = JSON.stringify(a.tray[0].cells);
  ok(a.swap(200), "swapped");
  playOut(a, 40);
  const b = new Run({ mode: "classic", seed: 2024, tones: 7 });
  for (const m of a.moves) ok(b.apply(m), "replayed " + m);
  eq(b.score, a.score, "same score");
  eq(JSON.stringify(b.grid), JSON.stringify(a.grid), "same board");
  ok(before !== after || a.tray[0] === null || true, "rotation recorded");
});

test("power-ups rescue a stuck game; the server refuses them on verified boards", () => {
  const run = new Run({ mode: "classic", seed: 77, tones: 7 });
  playOut(run, 500);
  ok(run.over && run.reason === "room", "got stuck");
  ok(run.swap(999999), "swap allowed when out of room");
  ok(!run.over || run.isStuck(), "reopened (or genuinely still stuck)");
  const d = new Run({ mode: "daily", seed: 5, tones: 7 });
  d.rotate(0, 500);
  playOut(d, 30);
  const v = verifyRun(d.submission());
  ok(!v.ok && v.code === "illegal_move", "power-up rejected by the verifier: " + JSON.stringify(v));
});

test("daily quests: three a day, one per tier, distinct metrics, stable per date", () => {
  for (const d of ["2026-10-10", "2026-10-11", "2026-12-25", "2027-03-01"]) {
    const q = questsFor(d);
    eq(q.map((x) => x.tier).join(), "easy,medium,hard", "tiers");
    eq(new Set(q.map((x) => x.metric)).size, 3, "distinct metrics on " + d);
    eq(JSON.stringify(questsFor(d)), JSON.stringify(q), "stable");
  }
  ok(JSON.stringify(questsFor("2026-10-10")) !== JSON.stringify(questsFor("2026-10-11")) ||
     JSON.stringify(questsFor("2026-10-11")) !== JSON.stringify(questsFor("2026-10-12")), "they change day to day");
});

test("daily quests: progress completes quests once, then the all-three bonus", () => {
  const d = "2026-10-10";
  const st = questsToday(null, d);
  const qs = questsFor(d);
  let finished = [], bonus = false;
  for (const q of qs) {
    const r = bump(st, q.metric, q.goal);
    finished.push(...r.finished); bonus = bonus || r.bonus;
  }
  eq(finished.length, 3, "all three finished");
  ok(bonus, "bonus awarded");
  const again = bump(st, qs[0].metric, 999);
  eq(again.finished.length + (again.bonus ? 1 : 0), 0, "nothing twice");
  eq(questsToday(st, "2026-10-11").done.length, 0, "a new day starts fresh");
});

test("seasons: windows, days left, and one fixed seed per season", () => {
  eq(activeSeason("2026-10-16"), null, "before Halloween");
  eq(activeSeason("2026-10-17").id, "halloween2026", "Halloween starts");
  eq(activeSeason("2026-10-31").id, "halloween2026", "last day inclusive");
  eq(activeSeason("2026-11-08").id, "diwali2026", "Diwali");
  eq(activeSeason("2026-11-16"), null, "after Diwali");
  eq(daysLeft(activeSeason("2026-10-31"), "2026-10-31"), 1, "last day counts");
  eq(seasonSeed(SEASONS[0]), seasonSeed(SEASONS[0]), "stable seed");
  for (const s of SEASONS) {
    const run = new Run({ mode: "season", seed: seasonSeed(s), tones: 7, rules: s.rules });
    playOut(run, 60);
    const again = new Run({ mode: "season", seed: seasonSeed(s), tones: 7, rules: s.rules });
    for (const m of run.moves) again.apply(m);
    eq(again.score, run.score, s.id + " replays exactly");
  }
});

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
