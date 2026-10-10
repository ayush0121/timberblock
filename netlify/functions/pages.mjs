/**
 * Netlify Function: the daily puzzle pages (/daily/, /daily/<n>) and their
 * sitemap (/sitemap-daily.xml). Logic in server/pages.js.
 */
import { route } from "../../server/pages.js";
import { blobStore } from "../../server/blobstore.js";

export default async (req) => {
  const { pathname } = new URL(req.url);
  try {
    const out = await route(pathname, blobStore());
    return new Response(out.body, {
      status: out.status,
      headers: {
        "Content-Type": out.type + "; charset=utf-8",
        "Cache-Control": "public, max-age=60",
        "Netlify-CDN-Cache-Control": `public, s-maxage=${out.maxAge}, stale-while-revalidate=${out.maxAge}`,
      },
    });
  } catch (e) {
    return new Response("Something went wrong.", { status: 500, headers: { "Content-Type": "text/plain" } });
  }
};

export const config = { path: ["/daily", "/daily/*", "/sitemap-daily.xml"] };
