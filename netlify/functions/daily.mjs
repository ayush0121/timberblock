/**
 * Netlify Function: /api/daily. A thin adapter - all the logic lives in
 * server/leaderboard.js, shared with the dev server and the tests.
 */
import { handle } from "../../server/leaderboard.js";
import { blobStore, CORS, readBody } from "../../server/blobstore.js";

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const body = await readBody(req);
  if (body && body.tooLarge) return Response.json({ error: "too_large" }, { status: 413, headers: CORS });
  const query = Object.fromEntries(new URL(req.url).searchParams);

  try {
    const { status, body: out } = await handle({ method: req.method, query, body }, blobStore());
    const cache = req.method === "GET" && !query.id
      ? { "Netlify-CDN-Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" }
      : { "Cache-Control": "no-store" };
    return Response.json(out, { status, headers: { ...CORS, ...cache } });
  } catch (e) {
    return Response.json({ error: "server" }, { status: 500, headers: CORS });
  }
};

export const config = { path: "/api/daily" };
