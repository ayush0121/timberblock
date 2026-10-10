/**
 * Friends leagues: a private weekly board for a group ("Office", "Family").
 *
 * A league is a 6-letter code and a member list. Its board is computed on
 * read from each member's verified weekly total (w/<week>/<id>, written by
 * the daily leaderboard), so a league adds no write traffic to scoring and
 * no score can enter a league without passing replay verification first.
 *
 *   lg/<code>   { code, name, owner, members: [{ id, name }], created }
 *
 * Same store contract as leaderboard.js.
 */
import { dateKey, weekKey } from "../src/game/daily.js";

export const MAX_MEMBERS = 50;
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no I O 0 1
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const key = (code) => `lg/${code}`;

const cleanName = (raw, max = 18) =>
  String(raw || "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

function newCode() {
  const a = new Uint8Array(6);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => ALPHA[b % ALPHA.length]).join("");
}

/** Read-modify-write a league with optimistic concurrency. */
async function mutate(store, code, fn) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, Math.random() * 20 * Math.min(attempt, 6)));
    const got = await store.getJSON(key(code));
    if (!got) return { error: "not_found" };
    const league = got.data;
    const err = fn(league);
    if (err) return { error: err };
    const res = await store.setJSON(key(code), league, { onlyIfMatch: got.etag });
    if (res.modified) return { league };
  }
  return { error: "busy" };
}

/** This week's standings: every member's verified weekly total. */
async function standings(store, league, id, now) {
  const week = weekKey(dateKey(new Date(now)));
  const rows = await Promise.all(league.members.map(async (m) => {
    const rec = await store.getJSON(`w/${week}/${m.id}`);
    return { name: m.name, score: rec ? rec.data.score : 0, ...(m.id === id ? { me: true } : {}) };
  }));
  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return {
    code: league.code, name: league.name, week, n: rows.length,
    owner: league.owner === id, member: league.members.some((m) => m.id === id), rows,
  };
}

/**
 * GET  ?code=&id=                                -> standings
 * POST { action: "create", name, id, playerName } -> new league (creator joins)
 *      { action: "join", code, id, playerName }
 *      { action: "leave", code, id }
 */
export async function handleLeague({ method, query = {}, body = null }, store, now = Date.now()) {
  if (method === "GET") {
    const code = String(query.code || "").toUpperCase();
    if (!CODE_RE.test(code)) return { status: 400, body: { error: "code" } };
    const got = await store.getJSON(key(code));
    if (!got) return { status: 404, body: { error: "not_found" } };
    const id = ID_RE.test(query.id || "") ? query.id : null;
    return { status: 200, body: await standings(store, got.data, id, now) };
  }
  if (method !== "POST" || !body) return { status: 405, body: { error: "method" } };
  const { action, id } = body;
  if (!ID_RE.test(id || "")) return { status: 400, body: { error: "id" } };
  const playerName = cleanName(body.playerName);

  if (action === "create") {
    const name = cleanName(body.name, 24);
    if (name.length < 2) return { status: 400, body: { error: "name" } };
    if (playerName.length < 2) return { status: 400, body: { error: "playerName" } };
    for (let i = 0; i < 6; i++) {
      const code = newCode();
      const league = { code, name, owner: id, members: [{ id, name: playerName }], created: now };
      const res = await store.setJSON(key(code), league, { onlyIfNew: true });
      if (res.modified) return { status: 200, body: await standings(store, league, id, now) };
    }
    return { status: 503, body: { error: "busy" } };
  }

  const code = String(body.code || "").toUpperCase();
  if (!CODE_RE.test(code)) return { status: 400, body: { error: "code" } };

  if (action === "join") {
    if (playerName.length < 2) return { status: 400, body: { error: "playerName" } };
    const r = await mutate(store, code, (lg) => {
      const me = lg.members.find((m) => m.id === id);
      if (me) { me.name = playerName; return null; }
      if (lg.members.length >= MAX_MEMBERS) return "full";
      lg.members.push({ id, name: playerName });
      return null;
    });
    if (r.error) return { status: r.error === "not_found" ? 404 : r.error === "full" ? 409 : 503, body: { error: r.error } };
    return { status: 200, body: await standings(store, r.league, id, now) };
  }

  if (action === "leave") {
    const r = await mutate(store, code, (lg) => {
      lg.members = lg.members.filter((m) => m.id !== id);
      return null;
    });
    if (r.error) return { status: r.error === "not_found" ? 404 : 503, body: { error: r.error } };
    return { status: 200, body: { left: code } };
  }
  return { status: 400, body: { error: "action" } };
}
