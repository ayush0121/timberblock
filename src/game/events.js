/**
 * The weekly event: one twist on the rules per ISO week, one board for
 * everyone, as many attempts as you like. Your best counts on the event
 * leaderboard.
 *
 * The rules are part of the run (Run's `rules` option), so the server
 * replays an event run with exactly the twist the player had.
 */
import { weekKey } from "./daily.js";

/** Each rule set is what Run understands: pool, comboStep, stones. */
export const EVENTS = [
  {
    id: "stones",
    name: "Stone Garden",
    blurb: "The board starts with stones scattered across it. Clear around them.",
    rules: { stones: 9 },
  },
  {
    id: "tiny",
    name: "Tiny Pieces",
    blurb: "Nothing bigger than four blocks all week. Chase the long combos.",
    rules: { pool: "tiny" },
  },
  {
    id: "fever",
    name: "Combo Fever",
    blurb: "Every combo step is worth double. Keep the clears coming.",
    rules: { comboStep: 0.5 },
  },
  {
    id: "giants",
    name: "Giants",
    blurb: "Big pieces only: 3×3 slabs, five-longs and wide corners. Plan ahead.",
    rules: { pool: "big" },
  },
];

function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h | 0;
}

/** This week's event: { week, id, name, blurb, rules, seed }. */
export function eventFor(week = weekKey()) {
  const n = parseInt(week.slice(-2), 10) || 0;
  const ev = EVENTS[n % EVENTS.length];
  return { week, ...ev, seed: hash("timberblock/event|" + week) };
}
