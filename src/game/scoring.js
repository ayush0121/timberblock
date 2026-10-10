/** All point maths in one place, so the server and client cannot drift. */

/** One point per cell laid down. */
export const placementPoints = (cellCount) => cellCount;

/**
 * Clearing n lines at once, with a combo streak.
 *   1 line  ->  20     2 -> 60     3 -> 120     4 -> 200
 * Streak multiplies by 1 + 0.25 per consecutive clearing placement.
 */
export const clearPoints = (n, streak, step = 0.25) =>
  n <= 0 ? 0 : Math.round(((20 * n * (n + 1)) / 2) * (1 + streak * step));

/** Professional mode: leftover seconds converted to points on level clear. */
export const timeBonus = (secondsLeft) => Math.round(secondsLeft * 4);
