// Server-side leaderboard tests. No browser needed: node tests/leaderboard.mjs
import { handle, memoryStore, cleanName } from "../server/leaderboard.js";
import { Run } from "../src/game/run.js";
import { dateKey, dailySeed } from "../src/game/daily.js";

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log("PASS -", name); }
  catch (e) { fail++; console.log("FAIL -", name, "\n     ->", e.message); }
}
const ok = (v, m) => { if (!v) throw new Error(m); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

const NOW = Date.UTC(2026, 9, 9, 12);
const TODAY = dateKey(new Date(NOW));

/** Play today's daily board with a simple strategy; `skip` varies the line. */
function playDaily(skip = 0, date = TODAY) {
  const run = new Run({ mode: "daily", seed: dailySeed(date), tones: 7 });
  let t = 0, k = 0;
  while (!run.over && run.moves.length < 400) {
    const legal = [];
    for (let s = 0; s < 3; s++) if (run.tray[s])
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (run.legal(s, r, c)) legal.push([s, r, c]);
    if (!legal.length) break;
    const [s, r, c] = legal[(skip * 7 + k++ * 3) % legal.length];
    t += 300 + ((k * 7919) % 900);
    run.place(s, r, c, t);
  }
  return { date, moves: run.moves, score: run.score, tones: 7 };
}

const post = (store, body, now = NOW) => handle({ method: "POST", body }, store, now);
const get = (store, query, now = NOW) => handle({ method: "GET", query }, store, now);

await test("honest run is accepted and ranked", async () => {
  const s = memoryStore();
  const run = playDaily(0);
  const r = await post(s, { ...run, id: "player-aaaa1", name: "Ayush" });
  eq(r.status, 200, "status");
  eq(r.body.n, 1, "one player");
  eq(r.body.me.rank, 1, "rank 1");
  eq(r.body.top[0].name, "Ayush", "name");
  eq(r.body.top[0].score, run.score, "score is the replayed score");
});

await test("inflated score is rejected", async () => {
  const s = memoryStore();
  const run = playDaily(1);
  const r = await post(s, { ...run, score: run.score + 5000, id: "player-bbbb1", name: "Cheat" });
  eq(r.status, 422, "status");
  eq(r.body.code, "score_mismatch", "code");
  eq((await get(s, {})).body.n, 0, "nothing recorded");
});

await test("a run on another day's seed is rejected", async () => {
  const s = memoryStore();
  const run = playDaily(2, "2026-10-01");
  const r = await post(s, { ...run, date: TODAY, id: "player-cccc1", name: "Old" });
  eq(r.status, 422, "status");
});

await test("dates other than today/yesterday are refused", async () => {
  const s = memoryStore();
  const run = playDaily(2, "2026-10-01");
  eq((await post(s, { ...run, id: "player-cccc2", name: "Old" })).status, 400, "status");
});

await test("one attempt per player per board", async () => {
  const s = memoryStore();
  eq((await post(s, { ...playDaily(3), id: "player-dddd1", name: "Dee" })).status, 200, "first");
  const again = await post(s, { ...playDaily(4), id: "player-dddd1", name: "Dee" });
  eq(again.status, 409, "second");
  eq(again.body.n, 1, "still one entry");
});

await test("board orders by score and reports percentile", async () => {
  const s = memoryStore();
  const runs = [0, 1, 2, 3, 4, 5].map((k) => ({ ...playDaily(k), id: "player-eeee" + k, name: "P" + k }));
  for (const r of runs) await post(s, r);
  const scores = runs.map((r) => r.score).sort((a, b) => b - a);
  const b = (await get(s, { id: "player-eeee0" })).body;
  eq(b.n, 6, "count");
  eq(b.top.map((e) => e.score).join(), scores.join(), "order");
  const me = b.top.find((e) => e.me);
  ok(me && me.name === "P0", "my row is flagged");
  ok(b.me.beats >= 0 && b.me.beats <= 1, "beats is a fraction");
});

await test("concurrent submissions all land", async () => {
  const s = memoryStore();
  const runs = Array.from({ length: 12 }, (_, k) => ({ ...playDaily(k), id: "player-ffff" + k, name: "C" + k }));
  const res = await Promise.all(runs.map((r) => post(s, r)));
  ok(res.every((r) => r.status === 200), "all 200");
  eq((await get(s, {})).body.n, 12, "count");
});

await test("week board sums a player's dailies; all-time keeps their best", async () => {
  const s = memoryStore();
  const DAY1 = Date.UTC(2026, 9, 5, 12);     // Monday of 2026-W41
  const DAY2 = Date.UTC(2026, 9, 6, 12);
  const d1 = dateKey(new Date(DAY1)), d2 = dateKey(new Date(DAY2));
  const a1 = playDaily(0, d1), a2 = playDaily(1, d2), b1 = playDaily(2, d1);
  eq((await post(s, { ...a1, id: "player-week-a", name: "Ann" }, DAY1)).status, 200, "a day1");
  eq((await post(s, { ...b1, id: "player-week-b", name: "Bob" }, DAY1)).status, 200, "b day1");
  eq((await post(s, { ...a2, id: "player-week-a", name: "Ann" }, DAY2)).status, 200, "a day2");

  const wk = (await handle({ method: "GET", query: { scope: "week", id: "player-week-a" } }, s, DAY2)).body;
  eq(wk.n, 2, "two players this week");
  const ann = wk.top.find((e) => e.name === "Ann");
  eq(ann.score, a1.score + a2.score, "Ann's week is the sum");
  eq(wk.top.filter((e) => e.name === "Ann").length, 1, "one row per player");
  ok(wk.me && wk.me.score === ann.score, "my week total");

  const all = (await handle({ method: "GET", query: { scope: "all" } }, s, DAY2)).body;
  eq(all.n, 2, "two players all-time");
  eq(all.top.find((e) => e.name === "Ann").score, Math.max(a1.score, a2.score), "Ann's best day");
});

await test("weekly event: verified with the week's rules, best attempt kept", async () => {
  const { eventFor } = await import("../src/game/events.js");
  const { weekKey } = await import("../src/game/daily.js");
  const s = memoryStore();
  const week = weekKey(TODAY);
  const ev = eventFor(week);
  const playEvent = (skip) => {
    const run = new Run({ mode: "event", seed: ev.seed, tones: 7, rules: ev.rules });
    let t = 0, k = 0;
    while (!run.over && run.moves.length < 300) {
      const legal = [];
      for (let sl = 0; sl < 3; sl++) if (run.tray[sl])
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (run.legal(sl, r, c)) legal.push([sl, r, c]);
      if (!legal.length) break;
      const [sl, r, c] = legal[(skip * 5 + k++ * 7) % legal.length];
      t += 300 + ((k * 7919) % 900);
      run.place(sl, r, c, t);
    }
    return { kind: "event", week, moves: run.moves, score: run.score, tones: 7 };
  };
  const a = playEvent(0), b = playEvent(3);
  const [lo, hi] = a.score <= b.score ? [a, b] : [b, a];
  eq((await post(s, { ...lo, id: "player-evt-1", name: "Eve" })).status, 200, "first attempt");
  const r2 = await post(s, { ...hi, id: "player-evt-1", name: "Eve" });
  eq(r2.status, 200, "second attempt allowed");
  eq(r2.body.top[0].score, hi.score, "best kept");
  eq(r2.body.n, 1, "still one player");
  const cheat = await post(s, { ...hi, score: hi.score + 100, id: "player-evt-2", name: "Mal" });
  eq(cheat.status, 422, "inflated event score rejected");
  const wrongWeek = await post(s, { ...hi, week: "2020-W01", id: "player-evt-3", name: "Old" });
  eq(wrongWeek.status, 400, "old week refused");
});

await test("leagues: create, join, standings from verified weekly totals, leave", async () => {
  const { handleLeague } = await import("../server/leagues.js");
  const s = memoryStore();
  const L = (body) => handleLeague({ method: "POST", body }, s, NOW);
  const made = await L({ action: "create", name: "Office", id: "player-lg-a", playerName: "Ann" });
  eq(made.status, 200, "created");
  const code = made.body.code;
  ok(/^[A-Z2-9]{6}$/.test(code), "six-letter code " + code);
  eq((await L({ action: "join", code, id: "player-lg-b", playerName: "Bob" })).status, 200, "joined");
  eq((await L({ action: "join", code: "ZZZZZZ", id: "player-lg-b", playerName: "Bob" })).status, 404, "unknown code");
  // Bob finishes today's daily: his verified weekly total should lead the league
  const run = playDaily(5);
  eq((await post(s, { ...run, id: "player-lg-b", name: "Bob" })).status, 200, "bob's daily");
  const st = (await handleLeague({ method: "GET", query: { code, id: "player-lg-a" } }, s, NOW)).body;
  eq(st.n, 2, "two members");
  eq(st.rows[0].name, "Bob", "Bob leads");
  eq(st.rows[0].score, run.score, "with his verified score");
  ok(st.rows.find((r) => r.me).name === "Ann", "Ann is me");
  eq((await L({ action: "leave", code, id: "player-lg-b" })).status, 200, "left");
  eq((await handleLeague({ method: "GET", query: { code } }, s, NOW)).body.n, 1, "one member left");
});

await test("analytics: one count per player per day, day-1 and day-7 retention", async () => {
  const { ping, report } = await import("../server/analytics.js");
  const s = memoryStore();
  const D0 = Date.UTC(2026, 9, 1, 12), D1 = D0 + 86400000, D7 = D0 + 7 * 86400000;
  const first = dateKey(new Date(D0));
  for (const id of ["player-an-1", "player-an-2", "player-an-3", "player-an-4"]) await ping(s, { id, first }, D0);
  await ping(s, { id: "player-an-1", first }, D0);                    // repeat: not counted twice
  await ping(s, { id: "player-an-1", first }, D1);
  await ping(s, { id: "player-an-2", first }, D1);
  await ping(s, { id: "player-an-3", first }, D7);
  const days = (await report(s, 10, D7)).body.days;
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  eq(byDate[first].active, 4, "4 active on day 0");
  eq(byDate[first].new, 4, "all new");
  eq(byDate[dateKey(new Date(D1))].d1, 0.5, "half came back next day");
  eq(byDate[dateKey(new Date(D7))].d7, 0.25, "a quarter came back on day 7");
});

await test("names are cleaned", async () => {
  eq(cleanName("  <b>Bob</b>\u0007  the   great "), "bBob/b the great", "strips tags and controls");
  eq(cleanName("x".repeat(40)).length, 18, "capped");
});

await test("analytics: visits are counted once a day per browser, apart from players", async () => {
  const { ping, report } = await import("../server/analytics.js");
  const s = memoryStore();
  const D0 = Date.UTC(2026, 9, 10, 12);
  for (const id of ["visitor-a1", "visitor-b2", "visitor-c3"]) await ping(s, { id, kind: "visit" }, D0);
  await ping(s, { id: "visitor-a1", kind: "visit" }, D0);          // repeat: not counted twice
  await ping(s, { id: "visitor-a1", first: "2026-10-10" }, D0);    // one of them plays
  eq((await ping(s, { id: "x", kind: "visit" }, D0)).status, 400, "bad id refused");
  const day = (await report(s, 1, D0)).body.days[0];
  eq(day.visitors, 3, "three visitors");
  eq(day.active, 1, "one player");
});

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
