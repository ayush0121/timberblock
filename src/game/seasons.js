/**
 * Seasonal events: a limited-time board and a limited-time skin. Play the
 * season's board while it runs and the skin is yours to keep; once the
 * window closes, it can't be earned any more.
 *
 * Windows are UTC dates, inclusive. Add next year's seasons here - nothing
 * else needs to change.
 */
export const SEASONS = [
  {
    id: "halloween2026",
    name: "Halloween Night",
    skin: "spooky",
    from: "2026-10-17", to: "2026-10-31",
    deco: "🎃 👻 🦇",
    blurb: "Tombstones rise from the board. Clear them before the night is out.",
    rules: { stones: 7, comboStep: 0.35 },
  },
  {
    id: "diwali2026",
    name: "Festival of Lights",
    skin: "diya",
    from: "2026-11-01", to: "2026-11-15",
    deco: "🪔 ✨ 🪔",
    blurb: "Every combo burns brighter. Light up the board for Diwali.",
    rules: { comboStep: 0.5, pool: "tiny" },
  },
];

/** The season running on `date` ("YYYY-MM-DD"), or null. */
export const activeSeason = (date) => SEASONS.find((s) => s.from <= date && date <= s.to) || null;

/** Whole days left in a season, counting today. */
export function daysLeft(season, date) {
  const ms = Date.parse(season.to + "T00:00:00Z") - Date.parse(date + "T00:00:00Z");
  return Math.round(ms / 86400000) + 1;
}

/** Fixed per season, so everyone plays the same seasonal board. */
export function seasonSeed(season) {
  let h = 0x811c9dc5;
  const s = "timberblock/season|" + season.id;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h | 0;
}
