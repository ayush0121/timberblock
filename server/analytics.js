/**
 * Retention analytics, the privacy-friendly way: once a day a client says
 * "anonymous id X, first played on date F". Nothing else - no IP logging,
 * no device data, no third party. From that the server counts, per day:
 *
 *   visitors distinct browsers that opened the game (kind: "visit", sent on
 *            page load, before any play) - visitors vs active is the share
 *            of arrivals who actually start a game
 *   active   distinct players (sent when a game starts)
 *   new      players whose first day it was
 *   ret1     players back the day after their first day   -> day-1 retention
 *   ret7     players back 7 days after their first day    -> day-7 retention
 *
 *   seen/<date>/<id>   one marker per player per day (dedupes repeat pings)
 *   vis/<date>/<id>    the same, for visits
 *   st/<date>          the counters
 *
 * Same store contract as leaderboard.js.
 */
import { dateKey, daysBetween } from "../src/game/daily.js";

const ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function bump(store, k, fields) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, Math.random() * 15 * Math.min(attempt, 6)));
    const got = await store.getJSON(k);
    const row = got ? got.data : { visitors: 0, active: 0, new: 0, ret1: 0, ret7: 0 };
    for (const f of fields) row[f] = (row[f] || 0) + 1;
    const res = await store.setJSON(k, row, got ? { onlyIfMatch: got.etag } : { onlyIfNew: true });
    if (res.modified) return row;
  }
  throw new Error("busy");
}

/** POST { id, first } once a day; { id, kind: "visit" } once a day per browser. */
export async function ping(store, { id, first, kind }, now = Date.now()) {
  const today = dateKey(new Date(now));
  if (kind === "visit") {
    if (!ID_RE.test(id || "")) return { status: 400, body: { error: "bad" } };
    const fresh = await store.setJSON(`vis/${today}/${id}`, 1, { onlyIfNew: true });
    if (!fresh.modified) return { status: 200, body: { counted: false } };
    await bump(store, `st/${today}`, ["visitors"]);
    return { status: 200, body: { counted: true } };
  }
  if (!ID_RE.test(id || "") || !DATE_RE.test(first || "")) return { status: 400, body: { error: "bad" } };
  const age = daysBetween(first, today);
  if (age < 0 || age > 3650) return { status: 400, body: { error: "first" } };
  const fresh = await store.setJSON(`seen/${today}/${id}`, 1, { onlyIfNew: true });
  if (!fresh.modified) return { status: 200, body: { counted: false } };
  const fields = ["active"];
  if (age === 0) fields.push("new");
  if (age === 1) fields.push("ret1");
  if (age === 7) fields.push("ret7");
  await bump(store, `st/${today}`, fields);
  return { status: 200, body: { counted: true } };
}

/** GET the last `days` days, newest first, with retention rates filled in. */
export async function report(store, days = 30, now = Date.now()) {
  days = Math.max(1, Math.min(90, days | 0 || 30));
  const keys = Array.from({ length: days + 7 }, (_, i) => dateKey(new Date(now - i * 86400000)));
  const rows = await Promise.all(keys.map(async (d) => {
    const got = await store.getJSON(`st/${d}`);
    return { date: d, visitors: 0, ...(got ? got.data : { active: 0, new: 0, ret1: 0, ret7: 0 }) };
  }));
  const at = Object.fromEntries(rows.map((r) => [r.date, r]));
  const out = rows.slice(0, days).map((r) => {
    const prev = at[dateKey(new Date(Date.parse(r.date) - 86400000))];
    const wk = at[dateKey(new Date(Date.parse(r.date) - 7 * 86400000))];
    return {
      ...r,
      // of the players new on the day before / the week before, how many came back today
      d1: prev && prev.new ? r.ret1 / prev.new : null,
      d7: wk && wk.new ? r.ret7 / wk.new : null,
    };
  });
  return { status: 200, body: { days: out } };
}
