/**
 * One anonymous ping per day: the leaderboard's random player id and the
 * date this device first played. That's all - enough for the server to
 * count daily players and day-1 / day-7 return rates (server/analytics.js).
 */
import { apiUrl, call, available, playerId } from "./leaderboard.js";
import * as store from "../platform/storage.js";
import { dateKey } from "../game/daily.js";

export async function dailyPing() {
  if (!available()) return;
  const today = dateKey();
  try {
    let first = await store.get(store.KEYS.firstDay);
    if (!first) { first = today; await store.set(store.KEYS.firstDay, first); }
    if ((await store.get(store.KEYS.pinged)) === today) return;
    const { status } = await call(apiUrl("/api/ping"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: await playerId(), first }),
    });
    if (status === 200) await store.set(store.KEYS.pinged, today);
  } catch (e) { /* analytics never matters more than the game */ }
}

/**
 * One anonymous "someone opened the game" ping per browser per day, sent on
 * page load before any play. Compared with dailyPing (sent when a game
 * starts), it shows how many arrivals actually play. Automated browsers that
 * say so (navigator.webdriver) are not counted.
 */
export async function dailyVisit() {
  if (!available() || navigator.webdriver) return;
  const today = dateKey();
  try {
    if ((await store.get(store.KEYS.visited)) === today) return;
    const { status } = await call(apiUrl("/api/ping"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: await playerId(), kind: "visit" }),
    });
    if (status === 200) await store.set(store.KEYS.visited, today);
  } catch (e) { /* analytics never matters more than the game */ }
}
