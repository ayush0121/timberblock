/**
 * Client for the daily leaderboard (server/leaderboard.js behind /api/daily).
 *
 * The game never waits on this. Reads fail quietly to "offline"; a finished
 * daily run that cannot be posted is kept and retried on the next visit.
 */
import { API_BASE, SITE_URL } from "../config.js";
import { isNative } from "../platform/device.js";
import * as store from "../platform/storage.js";

/** Same-origin on the web; the live site from inside the native apps. */
export function apiUrl(path) {
  const base = API_BASE || (isNative() ? SITE_URL : "");
  return base.replace(/\/$/, "") + path;
}
const endpoint = () => apiUrl("/api/daily");

/** A file:// preview or the single-file artifact has no server to talk to. */
export const available = () => isNative() || /^https?:$/.test(location.protocol);

/** A stable anonymous id for this device's leaderboard rows. */
export async function playerId() {
  let id = await store.get(store.KEYS.player);
  if (!id) {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    id = "p" + Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
    await store.set(store.KEYS.player, id);
  }
  return id;
}

export async function call(url, init) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } finally { clearTimeout(t); }
}

/** A board - "day" (today's, or `date`'s), "week" or "all" - with this
 *  player's place if they're on it. */
export async function fetchBoard(date, scope = "day") {
  if (!available()) return null;
  try {
    const q = new URLSearchParams({ date, id: await playerId() });
    if (scope !== "day") q.set("scope", scope);
    const { status, body } = await call(endpoint() + "?" + q);
    return status === 200 ? body : null;
  } catch (e) { return null; }
}

/**
 * Post a finished daily run. Resolves to the board view on success (or when
 * the server already has this player's run), to { rejected } when the server
 * refused the run, else null - in which case it is parked for retry().
 */
export async function submit({ date, name, moves, score, tones }) {
  const payload = { date, id: await playerId(), name, moves, score, tones };
  if (!available()) return null;
  try {
    const { status, body } = await call(endpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (status === 200 || status === 409) { await store.remove(store.KEYS.pending); return body; }
    if (status >= 500 || status === 0) { await store.set(store.KEYS.pending, payload); return null; }
    await store.remove(store.KEYS.pending);   // refused for good; don't retry forever
    return { rejected: true, code: body && body.code };
  } catch (e) {
    await store.set(store.KEYS.pending, payload);
    return null;
  }
}

/** Try again to post a daily result that failed earlier (offline, server down). */
export async function retry() {
  const p = await store.get(store.KEYS.pending);
  if (!p) return null;
  return submit(p);
}

/** Post a weekly-event run. Every attempt is sent; the server keeps the best.
 *  Resolves to the event board view, { rejected }, or null when offline. */
export async function submitEvent({ week, name, moves, score, tones }) {
  if (!available()) return null;
  try {
    const { status, body } = await call(endpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "event", week, id: await playerId(), name, moves, score, tones }),
    });
    if (status === 200) return body;
    if (status >= 400 && status < 500) return { rejected: true, code: body && body.code };
    return null;
  } catch (e) { return null; }
}
