/**
 * Daily quests: three small goals a day - one easy, one medium, one hard -
 * chosen from the date, so everyone shares the same three. Progress counts
 * across every mode; finishing one awards a power-up, finishing all three a
 * bonus of one of each.
 *
 * Pure: the UI feeds events in with bump(), and reads progress back.
 */

/**
 * Metrics a quest can count:
 *   lines     lines cleared            multi   moves clearing 2+ lines
 *   combo     best combo reached       perfect board clears
 *   placed    pieces placed            games   games started
 *   best      best single-game score   adv     Adventure levels won
 *   daily     Daily Seed finished      event   weekly-event games
 *   archive   archive boards played
 * "combo" and "best" keep the max; everything else adds up.
 */
const MAX_METRICS = new Set(["combo", "best"]);

const POOL = {
  easy: [
    { metric: "lines", goal: 10, text: (g) => `Clear ${g} lines` },
    { metric: "placed", goal: 40, text: (g) => `Place ${g} pieces` },
    { metric: "games", goal: 2, text: (g) => `Play ${g} games` },
    { metric: "daily", goal: 1, text: () => "Finish today's Daily Seed" },
    { metric: "combo", goal: 2, text: (g) => `Reach a ×${g} combo` },
  ],
  medium: [
    { metric: "lines", goal: 30, text: (g) => `Clear ${g} lines` },
    { metric: "multi", goal: 3, text: (g) => `Clear 2+ lines with one piece ${g} times` },
    { metric: "combo", goal: 4, text: (g) => `Reach a ×${g} combo` },
    { metric: "adv", goal: 1, text: () => "Win an Adventure level" },
    { metric: "best", goal: 800, text: (g) => `Score ${g.toLocaleString("en-US")} in one game` },
    { metric: "event", goal: 1, text: () => "Play this week's event" },
  ],
  hard: [
    { metric: "lines", goal: 60, text: (g) => `Clear ${g} lines` },
    { metric: "combo", goal: 6, text: (g) => `Reach a ×${g} combo` },
    { metric: "best", goal: 2000, text: (g) => `Score ${g.toLocaleString("en-US")} in one game` },
    { metric: "multi", goal: 8, text: (g) => `Clear 2+ lines with one piece ${g} times` },
    { metric: "adv", goal: 3, text: (g) => `Win ${g} Adventure levels` },
    { metric: "perfect", goal: 1, text: () => "Clear the whole board" },
    { metric: "archive", goal: 2, text: (g) => `Play ${g} past Daily Seeds` },
  ],
};
const REWARD = { easy: ["undo"], medium: ["swap"], hard: ["rotate", "undo"] };

function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 15;
  return h >>> 0;
}

/** The day's three quests. Never two on the same metric. */
export function questsFor(date) {
  const out = [];
  for (const tier of ["easy", "medium", "hard"]) {
    const pool = POOL[tier];
    let i = hash(date + "|" + tier) % pool.length;
    for (let k = 0; k < pool.length && out.some((q) => q.metric === pool[i].metric); k++) i = (i + 1) % pool.length;
    const t = pool[i];
    out.push({ id: `${date}:${tier}`, tier, metric: t.metric, goal: t.goal, text: t.text(t.goal), reward: REWARD[tier] });
  }
  return out;
}

/** Today's quest state, fresh if the stored one is from another day. */
export function today(state, date) {
  return state && state.date === date ? state : { date, progress: {}, done: [], bonus: false };
}

/**
 * Count something. Returns the quests this completed (and whether that
 * finished all three), so the UI can hand out rewards and toast.
 */
export function bump(state, metric, value = 1) {
  const p = state.progress;
  p[metric] = MAX_METRICS.has(metric) ? Math.max(p[metric] || 0, value) : (p[metric] || 0) + value;
  const quests = questsFor(state.date);
  const finished = [];
  for (const q of quests) {
    if (state.done.includes(q.id)) continue;
    if ((p[q.metric] || 0) >= q.goal) { state.done.push(q.id); finished.push(q); }
  }
  let bonus = false;
  if (!state.bonus && state.done.length === quests.length) { state.bonus = true; bonus = true; }
  return { finished, bonus };
}

export const progressOf = (state, q) => Math.min(q.goal, state.progress[q.metric] || 0);
