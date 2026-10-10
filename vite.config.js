import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * `npm run dev` serves the API from memory with the exact handlers the
 * Netlify Functions run (/api/daily, /api/league, /api/ping, /api/stats,
 * and the /daily/ pages),
 * so leaderboards, leagues and analytics work locally and in the e2e tests.
 * Everything resets when the dev server restarts.
 */
function devApi() {
  let mods = null;
  const load = async () => {
    if (mods) return mods;
    const lb = await import("./server/leaderboard.js");
    const lg = await import("./server/leagues.js");
    const an = await import("./server/analytics.js");
    const pg = await import("./server/pages.js");
    mods = { lb, lg, an, pg, store: lb.memoryStore(), stats: lb.memoryStore() };
    return mods;
  };
  const route = (fn) => async (req, res) => {
    const m = await load();
    let body = null;
    if (req.method === "POST") {
      let text = "";
      for await (const chunk of req) text += chunk;
      try { body = JSON.parse(text); } catch { body = null; }
    }
    const query = Object.fromEntries(new URL(req.url, "http://x").searchParams);
    const out = await fn(m, { method: req.method, query, body });
    res.statusCode = out.status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(out.body));
  };
  return {
    name: "dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/daily", route((m, r) => m.lb.handle(r, m.store)));
      server.middlewares.use("/api/league", route((m, r) => m.lg.handleLeague(r, m.store)));
      server.middlewares.use("/api/ping", route((m, r) => m.an.ping(m.stats, r.body || {})));
      server.middlewares.use("/api/stats", route((m, r) => m.an.report(m.stats, +r.query.days || 30)));
      // the server-rendered daily puzzle pages
      const html = async (req, res) => {
        const m = await load();
        const path = new URL(req.originalUrl || req.url, "http://x").pathname;
        const out = await m.pg.route(path, m.store);
        res.statusCode = out.status;
        res.setHeader("Content-Type", out.type + "; charset=utf-8");
        res.end(out.body);
      };
      server.middlewares.use("/daily", html);
      server.middlewares.use("/sitemap-daily.xml", html);
    },
  };
}

// Two build targets from one source:
//   npm run build         -> dist/          (multi-file, what Capacitor wraps)
//   npm run build:single  -> dist-single/   (one inlined .html, what we publish
//                                            as the Claude artifact / web demo)
export default defineConfig(({ mode }) => ({
  base: "",
  plugins: mode === "single" ? [viteSingleFile()] : [devApi()],
  build: {
    target: "es2019",
    outDir: mode === "single" ? "dist-single" : "dist",
    emptyOutDir: true,
    assetsInlineLimit: mode === "single" ? 100000000 : 4096,
  },
}));
