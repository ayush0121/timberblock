/** Netlify Function: /api/league. Logic in server/leagues.js. */
import { handleLeague } from "../../server/leagues.js";
import { blobStore, CORS, readBody } from "../../server/blobstore.js";

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const body = await readBody(req, 10_000);
  if (body && body.tooLarge) return Response.json({ error: "too_large" }, { status: 413, headers: CORS });
  const query = Object.fromEntries(new URL(req.url).searchParams);
  try {
    const { status, body: out } = await handleLeague({ method: req.method, query, body }, blobStore());
    return Response.json(out, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: "server" }, { status: 500, headers: CORS });
  }
};

export const config = { path: "/api/league" };
