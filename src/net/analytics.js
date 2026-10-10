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
