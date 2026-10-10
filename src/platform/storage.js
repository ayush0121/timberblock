/**
 * Key/value storage that works in three places:
 *   - native app  -> @capacitor/preferences (survives app updates)
 *   - browser     -> localStorage
 *   - anywhere it fails (private mode, blocked cookies) -> in-memory
 *
 * Every method is async so the native path is not a special case.
 */
import { isNative } from "./device.js";

let prefs = null;
const memory = new Map();

async function backend() {
  if (prefs !== null) return prefs;
  if (isNative()) {
    const mod = await import("@capacitor/preferences").catch(() => null);
    prefs = mod ? mod.Preferences : false;
  } else prefs = false;
  return prefs;
}

export async function get(key, fallback = null) {
  const p = await backend();
  try {
    if (p) {
      const { value } = await p.get({ key });
      return value == null ? fallback : JSON.parse(value);
    }
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch (e) {
    return memory.has(key) ? memory.get(key) : fallback;
  }
}

export async function set(key, value) {
  const p = await backend();
  memory.set(key, value);
  try {
    const s = JSON.stringify(value);
    if (p) await p.set({ key, value: s });
    else localStorage.setItem(key, s);
  } catch (e) { /* memory copy stands in */ }
}

export async function remove(key) {
  const p = await backend();
  memory.delete(key);
  try {
    if (p) await p.remove({ key });
    else localStorage.removeItem(key);
  } catch (e) { /* ignore */ }
}

export const KEYS = {
  profile: "tb.profile",       // the local player record
  session: "tb.session",       // cloud profile id, when signed in
  skin: "tb.skin",             // chosen theme
  sound: "tb.sound",
  player: "tb.player",         // leaderboard id; survives sign-out on purpose
  pending: "tb.pending",       // a daily result waiting to be posted
  tutorial: "tb.tutorial",     // finished (or skipped) the first-run tutorial
  firstDay: "tb.first",        // the date this device first played (analytics)
  pinged: "tb.pinged",         // last day the anonymous analytics ping went out
  install: "tb.install",       // install-prompt bookkeeping: days visited, snooze
};
