/**
 * "Add Timberblock to your home screen."
 *
 * Installed players come back far more often, so from a player's second day
 * the home screen offers it - never during play, never more than once a
 * fortnight after "Not now", and never when it can't work:
 *
 *   Chrome / Edge / Android  -> the browser's own install dialog
 *                               (beforeinstallprompt), one tap
 *   iPhone / iPad Safari     -> no dialog exists; show the two-step how-to
 *   already installed, in the native app, or anywhere else -> nothing
 */
import * as store from "../platform/storage.js";
import { isNative } from "../platform/device.js";
import { dateKey } from "../game/daily.js";

const SNOOZE_DAYS = 14;
let deferred = null;          // the browser's saved install prompt
let onChange = () => {};

export const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

/** iOS Safari: can install, but only by hand via the Share sheet. */
export const isIosSafari = () => {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
};

/** Start listening as early as possible: the browser fires the event once. */
export function initInstall(changed) {
  onChange = changed || onChange;
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();          // we choose the moment, not the browser
    deferred = e;
    onChange();
  });
  addEventListener("appinstalled", async () => {
    deferred = null;
    await store.set(store.KEYS.install, { ...(await state()), installed: true });
    onChange();
  });
}

async function state() {
  return (await store.get(store.KEYS.install)) || { days: 0, last: null, snoozeUntil: null, installed: false };
}

/** Count distinct days played; call once per session. */
export async function noteVisit() {
  const s = await state();
  const today = dateKey();
  if (s.last !== today) { s.days += 1; s.last = today; await store.set(store.KEYS.install, s); }
  return s;
}

/** What to offer right now: "prompt" (one-tap), "ios" (how-to), or null. */
export async function offer() {
  if (isNative() || isStandalone()) return null;
  const s = await state();
  if (s.installed || s.days < 2) return null;
  if (s.snoozeUntil && dateKey() < s.snoozeUntil) return null;
  if (deferred) return "prompt";
  if (isIosSafari()) return "ios";
  return null;
}

/** Show the browser's install dialog. Resolves "accepted" | "dismissed" | null. */
export async function install() {
  if (!deferred) return null;
  const e = deferred;
  deferred = null;
  e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === "accepted") await store.set(store.KEYS.install, { ...(await state()), installed: true });
  return outcome;
}

/** "Not now": ask again in two weeks. */
export async function snooze() {
  const until = dateKey(new Date(Date.now() + SNOOZE_DAYS * 86400000));
  await store.set(store.KEYS.install, { ...(await state()), snoozeUntil: until });
}
