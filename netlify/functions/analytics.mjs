/**
 * Netlify Function: POST /api/ping (one anonymous ping per player per day)
 * and GET /api/stats (the retention table). Logic in server/analytics.js.
 */
import { ping, report } from "../../server/analytics.js";
import { blobStore, CORS, readBody } from "../../server/blobstore.js";

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  try {
    const store = blobStore("analytics");
    if (url.pathname.endsWith("/ping") && req.method === "POST") {
      const body = await readBody(req, 1_000);
      const { status, body: out } = await ping(store, body || {});
      return Response.json(out, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
    }
    if (url.pathname.endsWith("/stats") && req.method === "GET") {
      const { status, body: out } = await report(store, +url.searchParams.get("days") || 30);
      return Response.json(out, { status, headers: { ...CORS, "Netlify-CDN-Cache-Control": "public, s-maxage=300" } });
    }
    return Response.json({ error: "not_found" }, { status: 404, headers: CORS });
  } catch (e) {
    return Response.json({ error: "server" }, { status: 500, headers: CORS });
  }
};

export const config = { path: ["/api/ping", "/api/stats"] };
