/**
 * The daily leaderboard. Host-agnostic: it takes a small key/value store and
 * plain request data, so the same code runs as a Netlify Function, inside the
 * Vite dev server, and in tests.
 *
 * Store contract (Netlify Blobs semantics):
 *   getJSON(key)                    -> { data, etag } | null
 *   setJSON(key, value, { onlyIfNew | onlyIfMatch }) -> { modified }
 *
 * Two kinds of record per day:
 *   e/<date>/<playerId>  one entry per player. Written with onlyIfNew, which is
 *                        what makes "one attempt per board" hold server-side.
 *   b/<date>             the board: top 100, a score histogram and a count.
 *                        Updated with optimistic concurrency (onlyIfMatch).
 *
 * Every score is earned, not claimed: the run is replayed against the day's
 * seed with the exact engine the client ran (verify.js), and only the score
 * that replay produces is stored.
 */
import { verifyRun } from "./verify.js";
import { dateKey, dayNumber, dailySeed, weekKey } from "../src/game/daily.js";
import { eventFor } from "../src/game/events.js";

export const TOP_KEEP = 100;      // stored on the board
export const TOP_SHOW = 50;       // returned to clients
export const BUCKET = 25;         // histogram width, in points
const TONES = 7;                  // must match ui/themes.js TONE_COUNT
const ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/*
 * Three scopes, one board shape:
 *   day   b/<date>    one entry per player: that day's score
 *   week  bw/<week>   one entry per player: the SUM of their daily scores
 *                     that ISO week, so showing up every day beats one
 *                     lucky board
 *   all   ba          one entry per player: their best single daily score
 * Per-player running values for week/all live in w/<week>/<id> and a/<id>.
 */
const boardKey = (date) => `b/${date}`;
const entryKey = (date, id) => `e/${date}/${id}`;
const weekBoardKey = (week) => `bw/${week}`;
const weekEntryKey = (week, id) => `w/${week}/${id}`;
const ALL_BOARD = "ba";
const allEntryKey = (id) => `a/${id}`;
const emptyBoard = (date) => ({ date, n: 0, top: [], hist: {} });
const WEEK_RE = /^\d{4}-W\d{2}$/;
const eventBoardKey = (week) => `be/${week}`;
const eventEntryKey = (week, id) => `ev/${week}/${id}`;

/** Today, and yesterday for a run that started before UTC midnight. */
function acceptedDates(now) {
  const today = dateKey(new Date(now));
  return [today, dateKey(new Date(now - 86400000))];
}

/** Display names are shown to everyone: trim, strip control characters, cap. */
export function cleanName(raw) {
  const s = String(raw || "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
  return s.slice(0, 18);
}

/** Share of players this score beats, 0..1, read off the histogram. */
export function beats(board, score) {
  if (!board.n) return 0;
  const b = Math.floor(score / BUCKET);
  let below = 0;
  for (const [k, count] of Object.entries(board.hist)) {
    if (+k < b) below += count;
    else if (+k === b) below += count * ((score - b * BUCKET) / BUCKET);
  }
  return Math.max(0, Math.min(1, below / board.n));
}

/** What a client sees: the top of the board and, if they played, where they sit. */
export function view(board, id) {
  const out = {
    date: board.date,
    day: DATE_RE.test(board.date) ? dayNumber(board.date) : null,
    n: board.n,
    top: board.top.slice(0, TOP_SHOW).map((e, i) => ({
      rank: i + 1, name: e.name, score: e.score, ...(e.id === id ? { me: true } : {}),
    })),
    me: null,
  };
  if (id) {
    const i = board.top.findIndex((e) => e.id === id);
    const mine = i >= 0 ? board.top[i] : null;
    if (mine) out.me = { rank: i + 1, score: mine.score, beats: beats(board, mine.score) };
  }
  return out;
}

async function readBoardAt(store, key, label) {
  const got = await store.getJSON(key);
  return got ? { board: got.data, etag: got.etag } : { board: emptyBoard(label), etag: null };
}
const readBoard = (store, date) => readBoardAt(store, boardKey(date), date);

/**
 * Fold one score into a board, retrying on concurrent writers. `prev` is the
 * player's previous value on this board (week/all), which it replaces;
 * null means they are new to it.
 */
async function upsertBoard(store, key, label, entry, prev = null) {
  for (let attempt = 0; attempt < 30; attempt++) {
    // back off with jitter so simultaneous finishers stop colliding
    if (attempt) await new Promise((r) => setTimeout(r, Math.random() * 15 * Math.min(attempt, 8)));
    const { board, etag } = await readBoardAt(store, key, label);
    if (prev == null) board.n += 1;
    else {
      const pb = Math.floor(prev / BUCKET);
      if (board.hist[pb]) board.hist[pb] -= 1;
      board.top = board.top.filter((e) => e.id !== entry.id);
    }
    const b = Math.floor(entry.score / BUCKET);
    board.hist[b] = (board.hist[b] || 0) + 1;
    if (board.top.length < TOP_KEEP || entry.score > board.top[board.top.length - 1].score) {
      board.top.push(entry);
      // ties go to whoever posted first, so a later equal score never jumps ahead
      board.top.sort((a, b2) => b2.score - a.score || a.at - b2.at);
      board.top.length = Math.min(board.top.length, TOP_KEEP);
    }
    const res = await store.setJSON(key, board, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
    if (res.modified) return board;
  }
  throw new Error("board_busy");
}

const addToBoard = (store, date, entry) => upsertBoard(store, boardKey(date), date, entry);

/** After a verified daily: add it to the player's week total and all-time best. */
async function rollUp(store, date, entry) {
  const week = weekKey(date);
  const wk = await store.getJSON(weekEntryKey(week, entry.id));
  const prevWeek = wk ? wk.data.score : null;
  const weekEntry = { ...entry, score: (prevWeek || 0) + entry.score };
  await store.setJSON(weekEntryKey(week, entry.id), weekEntry);
  await upsertBoard(store, weekBoardKey(week), week, weekEntry, prevWeek);

  const al = await store.getJSON(allEntryKey(entry.id));
  const prevBest = al ? al.data.score : null;
  if (prevBest == null || entry.score > prevBest) {
    await store.setJSON(allEntryKey(entry.id), entry);
    await upsertBoard(store, ALL_BOARD, "all", entry, prevBest);
  }
}

/**
 * A weekly-event run: replayed with that week's seed AND rules, then kept
 * only if it beats the player's best for the week. Unlimited attempts.
 */
async function postEvent(store, body, now) {
  const { week, id, moves, score, tones } = body;
  const weeks = [weekKey(dateKey(new Date(now))), weekKey(dateKey(new Date(now - 86400000)))];
  if (!weeks.includes(week)) return { status: 400, body: { error: "week" } };
  if (!ID_RE.test(id || "")) return { status: 400, body: { error: "id" } };
  if (tones !== TONES) return { status: 400, body: { error: "tones" } };
  const name = cleanName(body.name);
  if (name.length < 2) return { status: 400, body: { error: "name" } };

  const ev = eventFor(week);
  const v = verifyRun({ seed: ev.seed, mode: "event", tones, moves, claimedScore: score, rules: ev.rules });
  if (!v.ok) return { status: 422, body: { error: "rejected", code: v.code } };

  const prevRec = await store.getJSON(eventEntryKey(week, id));
  const prev = prevRec ? prevRec.data.score : null;
  const entry = { id, name, score: v.score, at: now };
  let board;
  if (prev == null || v.score > prev) {
    await store.setJSON(eventEntryKey(week, id), entry);
    board = await upsertBoard(store, eventBoardKey(week), week, entry, prev);
  } else {
    board = (await readBoardAt(store, eventBoardKey(week), week)).board;
  }
  const out = { scope: "event", improved: prev == null || v.score > prev, ...view(board, id) };
  if (!out.me) out.me = { rank: null, score: Math.max(prev || 0, v.score), beats: beats(board, Math.max(prev || 0, v.score)) };
  return { status: 200, body: out };
}

/** GET for the week, all-time or event scope. */
async function getScope(store, scope, query, id, today) {
  const week = WEEK_RE.test(query.week || "") ? query.week : weekKey(today);
  const [key, label, mineKey] = scope === "week"
    ? [weekBoardKey(week), week, id && weekEntryKey(week, id)]
    : scope === "event"
    ? [eventBoardKey(week), week, id && eventEntryKey(week, id)]
    : [ALL_BOARD, "all", id && allEntryKey(id)];
  const { board } = await readBoardAt(store, key, label);
  const out = { scope, ...view(board, id) };
  if (id && !out.me) {
    const mine = await store.getJSON(mineKey);
    if (mine) out.me = { rank: null, score: mine.data.score, beats: beats(board, mine.data.score) };
  }
  return { status: 200, body: out };
}

/**
 * GET  ?date=&id=          -> view of that day's board
 * POST {date,id,name,moves,score,tones} -> verify, record once, return the view
 *
 * Returns { status, body } - the host turns that into an HTTP response.
 */
export async function handle({ method, query = {}, body = null }, store, now = Date.now()) {
  const dates = acceptedDates(now);

  if (method === "GET") {
    const date = DATE_RE.test(query.date || "") ? query.date : dates[0];
    const id = ID_RE.test(query.id || "") ? query.id : null;
    if (["week", "all", "event"].includes(query.scope)) return getScope(store, query.scope, query, id, dates[0]);
    const { board } = await readBoard(store, date);
    const out = view(board, id);
    if (id && !out.me) {
      const mine = await store.getJSON(entryKey(date, id));
      if (mine) out.me = { rank: null, score: mine.data.score, beats: beats(board, mine.data.score) };
    }
    return { status: 200, body: out };
  }

  if (method !== "POST") return { status: 405, body: { error: "method" } };
  if (!body || typeof body !== "object") return { status: 400, body: { error: "body" } };
  if (body.kind === "event") return postEvent(store, body, now);

  const { date, id, moves, score, tones } = body;
  if (!dates.includes(date)) return { status: 400, body: { error: "date" } };
  if (!ID_RE.test(id || "")) return { status: 400, body: { error: "id" } };
  if (tones !== TONES) return { status: 400, body: { error: "tones" } };
  const name = cleanName(body.name);
  if (name.length < 2) return { status: 400, body: { error: "name" } };

  const v = verifyRun({ seed: dailySeed(date), mode: "daily", tones, moves, claimedScore: score });
  if (!v.ok) return { status: 422, body: { error: "rejected", code: v.code } };

  const entry = { id, name, score: v.score, at: now };
  const first = await store.setJSON(entryKey(date, id), entry, { onlyIfNew: true });
  if (!first.modified) {
    // already on today's board: one attempt per player per board
    const { board } = await readBoard(store, date);
    return { status: 409, body: { error: "already_played", ...view(board, id) } };
  }
  const board = await addToBoard(store, date, entry);
  await rollUp(store, date, entry);
  const out = view(board, id);
  if (!out.me) out.me = { rank: null, score: v.score, beats: beats(board, v.score) };
  return { status: 200, body: out };
}

/** An in-memory store with the same conditional-write semantics, for dev and tests. */
export function memoryStore() {
  const m = new Map();
  let tick = 0;
  return {
    async getJSON(key) {
      const r = m.get(key);
      return r ? { data: JSON.parse(r.v), etag: r.etag } : null;
    },
    async setJSON(key, value, opts = {}) {
      const r = m.get(key);
      if (opts.onlyIfNew && r) return { modified: false };
      if (opts.onlyIfMatch && (!r || r.etag !== opts.onlyIfMatch)) return { modified: false };
      m.set(key, { v: JSON.stringify(value), etag: "e" + ++tick });
      return { modified: true };
    },
  };
}
