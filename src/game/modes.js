/** The two game modes and the Professional difficulty curve. */

export const MODES = {
  classic: {
    id: "classic",
    name: "Classic",
    blurb: "No clock, no levels. Place until nothing fits.",
    timed: false,
  },
  pro: {
    id: "pro",
    name: "Professional",
    blurb: "Timed levels. Hit the target before the clock runs out.",
    timed: true,
  },
  challenge: {
    id: "challenge",
    name: "Challenge",
    blurb: "A friend's exact board. Beat their score.",
    timed: false,
  },
  zen: {
    id: "zen",
    name: "Zen",
    blurb: "No clock, no game over. Just place and clear.",
    timed: false,
  },
  adventure: {
    id: "adventure",
    name: "Adventure",
    blurb: "Levels with goals and a move limit. Earn up to three stars.",
    timed: false,
  },
  event: {
    id: "event",
    name: "Weekly event",
    blurb: "A twist on the rules, one board for everyone, all week.",
    timed: false,
  },
  archive: {
    id: "archive",
    name: "Archive",
    blurb: "A past Daily Seed, for practice. Unranked, as many tries as you like.",
    timed: false,
  },
  season: {
    id: "season",
    name: "Seasonal",
    blurb: "A limited-time board with its own twist.",
    timed: false,
  },
  tutorial: {
    id: "tutorial",
    name: "Tutorial",
    blurb: "Three boards that teach the game.",
    timed: false,
  },
  daily: {
    id: "daily",
    name: "Daily Seed",
    blurb: "Everyone in the world plays the same board today. One attempt.",
    timed: false,
  },
};

/** Points needed WITHIN level L. */
export const target = (L) => 220 + 110 * (L - 1) + 10 * (L - 1) * (L - 1);

/** Seconds granted for level L. */
export const clock = (L) => Math.max(45, 90 - 4 * (L - 1));
