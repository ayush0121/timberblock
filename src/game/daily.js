/**
 * Daily Seed.
 *
 * Every player in the world gets the same board on the same calendar day,
 * because the seed is derived from the UTC date and nothing else. No server
 * call is needed to agree on it - which is the whole point: the feature works
 * offline, costs nothing to host, and cannot drift between clients.
 *
 * UTC, deliberately: a shared board only means something if it rolls over for
 * everyone at the same instant.
 */

/** Day 1 of Timberblock. Never change this after launch. */
export const EPOCH_UTC = Date.UTC(2026, 0, 1);

/** Mixed into the hash so the sequence is ours, not guessable from the date. */
const SALT = "timberblock/v1";

/** "2026-09-07" for the given instant, in UTC. */
export function dateKey(d = new Date()) {
  return (
    d.getUTCFullYear() +
    "-" + String(d.getUTCMonth() + 1).padStart(2, "0") +
    "-" + String(d.getUTCDate()).padStart(2, "0")
  );
}

/** Day 1, Day 2, ... for the share card and the leaderboard. */
export function dayNumber(key = dateKey()) {
  const [y, m, d] = key.split("-").map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - EPOCH_UTC) / 86400000) + 1;
}

/** FNV-1a, then an avalanche step so adjacent dates look unrelated. */
export function dailySeed(key = dateKey()) {
  let h = 0x811c9dc5;
  const s = SALT + "|" + key;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h | 0;
}

/** Milliseconds until the next board. */
export function msUntilNextDay(now = Date.now()) {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return next - now;
}

/** "6h 42m" - what the home screen shows once today is played. */
export function untilNextLabel(ms = msUntilNextDay()) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Was `key` the day immediately before `today`? (streak bookkeeping) */
export function isYesterday(key, today = dateKey()) {
  if (!key) return false;
  return dayNumber(today) - dayNumber(key) === 1;
}

/** Whole days from `a` to `b` (both "YYYY-MM-DD"). 1 means b is the next day. */
export function daysBetween(a, b) {
  return dayNumber(b) - dayNumber(a);
}

/** ISO-8601 week of a date key, e.g. "2026-W41" - the weekly leaderboard's key. */
export function weekKey(key = dateKey()) {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;            // Mon=1 .. Sun=7
  t.setUTCDate(t.getUTCDate() + 4 - day);    // the Thursday of this week
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/* ── streaks and freezes ──────────────────────────────────────────── */
/** Freezes a player can hold. New players start with one; every 7-day
 *  milestone earns another. */
export const MAX_FREEZES = 2;

/**
 * The streak after finishing today's board. Missed days are covered by
 * freezes when there are enough of them; otherwise the streak restarts.
 * Returns { streak, freezes, used }.
 */
export function advanceStreak({ streak = 0, lastDaily = null, freezes = 0 }, today) {
  if (lastDaily === today) return { streak, freezes, used: 0 };
  const gap = lastDaily ? daysBetween(lastDaily, today) : Infinity;
  let used = 0, next;
  if (gap === 1) next = streak + 1;
  else if (streak > 0 && gap - 1 <= freezes) { used = gap - 1; next = streak + 1; }
  else next = 1;
  let left = freezes - used;
  if (next % 7 === 0) left = Math.min(MAX_FREEZES, left + 1);
  return { streak: next, freezes: left, used };
}

/**
 * Where a streak stands before today's board, for the home screen:
 *   none | done (played today) | due (play today) |
 *   frozen (missed days a freeze will cover) | broken
 */
export function streakState({ streak = 0, lastDaily = null, freezes = 0 }, today) {
  if (!streak || !lastDaily) return { live: 0, status: "none" };
  const gap = daysBetween(lastDaily, today);
  if (gap <= 0) return { live: streak, status: "done" };
  if (gap === 1) return { live: streak, status: "due" };
  if (gap - 1 <= freezes) return { live: streak, status: "frozen", need: gap - 1 };
  return { live: 0, status: "broken" };
}
