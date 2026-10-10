/**
 * The store contract (getJSON / setJSON with onlyIfNew / onlyIfMatch) over
 * Netlify Blobs, shared by every function in netlify/functions/.
 */
import { getStore } from "@netlify/blobs";

export function blobStore(name = "leaderboard") {
  const s = getStore({ name, consistency: "strong" });
  return {
    async getJSON(key) {
      const r = await s.getWithMetadata(key, { type: "json" });
      return r ? { data: r.data, etag: r.etag } : null;
    },
    setJSON: (key, value, opts) => s.setJSON(key, value, opts),
  };
}

export const CORS = {
  // the native apps call these from capacitor://localhost
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Parse a JSON body with a size cap; null when absent or malformed. */
export async function readBody(req, limit = 400_000) {
  if (req.method !== "POST") return null;
  const text = await req.text();
  if (text.length > limit) return { tooLarge: true };
  try { return JSON.parse(text); } catch { return null; }
}
