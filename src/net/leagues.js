/** Client for friends leagues (server/leagues.js behind /api/league). */
import { apiUrl, call, available, playerId } from "./leaderboard.js";

const json = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Standings for a league, or { error } / null when offline. */
export async function standings(code) {
  if (!available()) return null;
  try {
    const q = new URLSearchParams({ code, id: await playerId() });
    const { status, body } = await call(apiUrl("/api/league") + "?" + q);
    return status === 200 ? body : { error: (body && body.error) || "error" };
  } catch (e) { return null; }
}

async function act(payload) {
  if (!available()) return null;
  try {
    const { status, body } = await call(apiUrl("/api/league"), json({ ...payload, id: await playerId() }));
    return status === 200 ? body : { error: (body && body.error) || "error" };
  } catch (e) { return null; }
}

export const create = (name, playerName) => act({ action: "create", name, playerName });
export const join = (code, playerName) => act({ action: "join", code: code.toUpperCase(), playerName });
export const leave = (code) => act({ action: "leave", code });
