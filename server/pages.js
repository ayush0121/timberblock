/**
 * Server-rendered pages for search engines: one per Daily Seed
 * (/daily/283), an index (/daily/), and a sitemap of them all
 * (/sitemap-daily.xml).
 *
 * Every page is real, unique content - the date, how many played, the top
 * score, how hard the board was by its actual score spread, the opening hand
 * drawn from the day's seed, the top ten - plus a button that drops the
 * visitor straight into that exact board. Rendered on request from the same
 * store the leaderboard writes, then cached at the CDN.
 *
 * Same store contract as leaderboard.js. Returns { status, type, body, maxAge }.
 */
import { dateKey, dayNumber, dailySeed, EPOCH_UTC } from "../src/game/daily.js";
import { Run } from "../src/game/run.js";
import { THEMES } from "../src/ui/themes.js";
import { BUCKET } from "./leaderboard.js";

const SITE = "https://timberblock.online";
const fmt = (n) => (n || 0).toLocaleString("en-US");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dateOfDay = (n) => dateKey(new Date(EPOCH_UTC + (n - 1) * 86400000));
const longDate = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB",
  { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const shortDate = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB",
  { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

async function boardOf(store, date) {
  const got = await store.getJSON(`b/${date}`);
  return got ? got.data : { date, n: 0, top: [], hist: {} };
}

/** Median score, read off the histogram (to the middle of its bucket). */
function median(board) {
  if (!board.n) return 0;
  let seen = 0;
  for (const k of Object.keys(board.hist).map(Number).sort((a, b) => a - b)) {
    seen += board.hist[k];
    if (seen >= board.n / 2) return k * BUCKET + BUCKET / 2;
  }
  return 0;
}

/** How hard was it? Judged by what typical players actually scored. */
function difficulty(board) {
  if (board.n < 5) return null;
  const m = median(board);
  return m < 250 ? "Hard" : m < 600 ? "Medium" : "Easy";
}

/** The day's first three pieces, as an SVG drawn in the default skin. */
function openingHand(date) {
  const run = new Run({ mode: "daily", seed: dailySeed(date), tones: 7 });
  const tones = THEMES.voltage.tones;
  const cell = 26, gap = 3, slot = 5 * (cell + gap);
  let out = "";
  run.tray.forEach((p, i) => {
    const rows = Math.max(...p.cells.map((c) => c[0])) + 1;
    const cols = Math.max(...p.cells.map((c) => c[1])) + 1;
    const ox = i * (slot + 24) + (slot - cols * (cell + gap)) / 2;
    const oy = (slot - rows * (cell + gap)) / 2;
    const t = tones[p.tone % tones.length];
    for (const [r, c] of p.cells) {
      out += `<rect x="${ox + c * (cell + gap)}" y="${oy + r * (cell + gap)}" width="${cell}" height="${cell}" rx="6" fill="${t.b}" stroke="${t.h}" stroke-width="1.5"/>`;
    }
  });
  const w = 3 * slot + 2 * 24;
  return `<svg class="hand" viewBox="0 0 ${w} ${slot}" role="img" aria-label="The opening hand: three pieces">${out}</svg>`;
}

const STYLE = `
:root{--bg:#080614;--card:#140E2C;--ink:#EDE9FF;--ink2:#8F87C0;--accent:#22E7FF;--accent2:#FF2D95;--rule:rgba(160,140,255,.2)}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(90% 40% at 15% -5%,#2A0F55 0%,transparent 60%),var(--bg);color:var(--ink);
  font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;padding:28px 16px 64px}
main{max-width:720px;margin:0 auto}
a{color:var(--accent)}
.brand{font:800 20px/1 Georgia,serif;text-decoration:none;color:var(--ink)} .brand span{color:var(--accent)}
nav.crumbs{font-size:13px;color:var(--ink2);margin:10px 0 18px} nav.crumbs a{color:var(--ink2)}
h1{font-size:32px;line-height:1.15;margin:0 0 4px} .date{color:var(--ink2);margin:0 0 22px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:22px}
.tile{background:var(--card);border:1px solid var(--rule);border-radius:10px;padding:12px 14px}
.tile span{display:block;color:var(--ink2);font-size:11px;letter-spacing:.12em;text-transform:uppercase}
.tile b{display:block;font:600 24px/1.25 ui-monospace,monospace;margin-top:3px}
.play{display:block;text-align:center;font-weight:700;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;
  color:#04121A;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:10px;padding:15px;margin:6px 0 26px}
h2{font-size:18px;margin:28px 0 10px;color:var(--accent)}
.hand{width:100%;max-width:520px;height:auto;display:block;margin:6px 0 4px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
td,th{padding:8px 10px;border-bottom:1px solid var(--rule);text-align:left} td:last-child,th:last-child{text-align:right}
th{color:var(--ink2);font-weight:500;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
.muted{color:var(--ink2)} .pn{display:flex;justify-content:space-between;gap:12px;margin-top:30px;font-size:14px}
ul.days{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px}
ul.days a{display:grid;grid-template-columns:70px 1fr auto;gap:10px;align-items:center;text-decoration:none;color:var(--ink);
  background:var(--card);border:1px solid var(--rule);border-radius:9px;padding:10px 12px}
ul.days .n{color:var(--accent);font-family:ui-monospace,monospace} ul.days .s{color:var(--ink2);font-size:13px}
footer{margin-top:40px;padding-top:16px;border-top:1px solid var(--rule);color:var(--ink2);font-size:13px}
`;

function page({ title, description, path, jsonld, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${path}">
<link rel="icon" href="/icons/favicon-32.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Timberblock">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}/icons/og-card.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>
<style>${STYLE}</style>
</head>
<body>
<main>
<a class="brand" href="/">Timber<span>block</span></a>
${body}
<footer><a href="/">Play Timberblock</a> · <a href="/daily/">All daily puzzles</a> · <a href="/how-to-play.html">How to play</a> · <a href="/privacy.html">Privacy</a></footer>
</main>
</body>
</html>`;
}

/** /daily/<n> */
export async function dayPage(n, store, now = Date.now()) {
  const today = dayNumber(dateKey(new Date(now)));
  if (!Number.isInteger(n) || n < 1 || n > today) return { status: 404, type: "text/html", body: notFound(), maxAge: 300 };
  const date = dateOfDay(n);
  const board = await boardOf(store, date);
  const isToday = n === today;
  const diff = difficulty(board);
  const top = board.top[0];
  const med = median(board);

  const title = `Timberblock Daily #${n} · ${shortDate(date)} ${date.slice(0, 4)} block puzzle`;
  let description = `Timberblock daily block puzzle #${n} for ${longDate(date)}. ` +
    (board.n ? `${fmt(board.n)} played; top score ${fmt(top.score)}. ` : "") +
    `See the opening pieces and play this exact board free.`;
  if (description.length > 165) description = description.slice(0, 162).replace(/\s+\S*$/, "") + "…";

  const rows = board.top.slice(0, 10).map((e, i) =>
    `<tr><td>${i + 1}</td><td>${esc(e.name)}</td><td>${fmt(e.score)}</td></tr>`).join("");
  const playHref = isToday ? "/" : `/#day=${n}`;
  const body = `
<nav class="crumbs"><a href="/">Home</a> › <a href="/daily/">Daily puzzles</a> › #${n}</nav>
<h1>Daily puzzle #${n}</h1>
<p class="date">${longDate(date)}${isToday ? " · today's board" : ""}</p>
<div class="tiles">
  <div class="tile"><span>Players</span><b>${fmt(board.n)}</b></div>
  <div class="tile"><span>Top score</span><b>${top ? fmt(top.score) : "–"}</b></div>
  <div class="tile"><span>Typical score</span><b>${board.n >= 5 ? "~" + fmt(med) : "–"}</b></div>
  <div class="tile"><span>Difficulty</span><b>${diff || "–"}</b></div>
</div>
<a class="play" href="${playHref}">${isToday ? "Play today's board" : "Play this board"} ›</a>
<h2>The opening hand</h2>
<p class="muted">Everyone started Day #${n} with these three pieces, in this order. Every piece after them was the same for everyone too.</p>
${openingHand(date)}
<h2>Top scores</h2>
${rows ? `<table><thead><tr><th>#</th><th>Player</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table>`
  : `<p class="muted">No scores yet${isToday ? " - be the first on today's board." : "."}</p>`}
<h2>About the daily puzzle</h2>
<p class="muted">Timberblock is a free 8×8 block puzzle. Every day, everyone in the world is dealt the same pieces in the same order,
with one attempt to score as high as possible by filling and clearing rows and columns. ${isToday ? "Today's board closes at midnight UTC." :
`Day #${n} is closed for ranking, but you can still play it as practice from the archive.`}</p>
<div class="pn">
  ${n > 1 ? `<a href="/daily/${n - 1}">‹ Day #${n - 1}</a>` : "<span></span>"}
  ${n < today ? `<a href="/daily/${n + 1}">Day #${n + 1} ›</a>` : "<span></span>"}
</div>`;
  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${SITE}/daily/${n}`, name: title, description, datePublished: date,
        isPartOf: { "@id": `${SITE}/#site` } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Daily puzzles", item: `${SITE}/daily/` },
        { "@type": "ListItem", position: 3, name: `Day #${n}`, item: `${SITE}/daily/${n}` } ] },
    ],
  };
  // today changes by the minute; yesterday can still take late finishes; older days are settled
  const maxAge = isToday ? 300 : n === today - 1 ? 3600 : 86400;
  return { status: 200, type: "text/html", body: page({ title, description, path: `/daily/${n}`, jsonld, body }), maxAge };
}

/** /daily/ - the most recent 60 boards. */
export async function indexPage(store, now = Date.now()) {
  const today = dayNumber(dateKey(new Date(now)));
  const days = [];
  for (let n = today; n >= Math.max(1, today - 59); n--) days.push(n);
  const boards = await Promise.all(days.map((n) => boardOf(store, dateOfDay(n))));
  const items = days.map((n, i) => {
    const b = boards[i];
    return `<li><a href="/daily/${n}"><span class="n">#${n}</span><span>${shortDate(dateOfDay(n))}${n === today ? " · today" : ""}</span>` +
      `<span class="s">${b.n ? `${fmt(b.n)} played · top ${fmt(b.top[0].score)}` : "no scores yet"}</span></a></li>`;
  }).join("");
  const title = "Daily Block Puzzle Archive · Timberblock";
  const description = "Every Timberblock daily block puzzle: how many played, the top score and how hard it was. " +
    "Open any day to see its pieces and play it free.";
  const body = `
<nav class="crumbs"><a href="/">Home</a> › Daily puzzles</nav>
<h1>Daily block puzzles</h1>
<p class="date">One board a day, the same for everyone. Today is Day #${today}.</p>
<a class="play" href="/">Play today's board ›</a>
<ul class="days">${items}</ul>`;
  const jsonld = { "@context": "https://schema.org", "@type": "CollectionPage", name: title, description, url: `${SITE}/daily/` };
  return { status: 200, type: "text/html", body: page({ title, description, path: "/daily/", jsonld, body }), maxAge: 600 };
}

/** /sitemap-daily.xml - the index and every day so far. */
export function sitemap(now = Date.now()) {
  const today = dayNumber(dateKey(new Date(now)));
  const urls = [`<url><loc>${SITE}/daily/</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`];
  for (let n = today; n >= 1; n--) {
    urls.push(`<url><loc>${SITE}/daily/${n}</loc><lastmod>${dateOfDay(n)}</lastmod>` +
      `<changefreq>${n === today ? "hourly" : "monthly"}</changefreq><priority>${n === today ? "0.9" : "0.5"}</priority></url>`);
  }
  return { status: 200, type: "application/xml",
    body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`,
    maxAge: 3600 };
}

function notFound() {
  return page({ title: "Daily puzzle not found · Timberblock", description: "That daily puzzle doesn't exist yet. Play today's Timberblock board, or browse every past daily block puzzle in the archive.",
    path: "/daily/", jsonld: { "@context": "https://schema.org", "@type": "WebPage" },
    body: `<h1>That puzzle doesn't exist yet</h1><p class="muted">Boards appear at midnight UTC.</p><a class="play" href="/daily/">See all daily puzzles ›</a>` });
}

/** Route a path to a page. */
export async function route(path, store, now = Date.now()) {
  if (path === "/sitemap-daily.xml") return sitemap(now);
  if (path === "/daily" || path === "/daily/") return indexPage(store, now);
  const m = /^\/daily\/(\d{1,5})\/?$/.exec(path);
  if (m) return dayPage(+m[1], store, now);
  return { status: 404, type: "text/html", body: notFound(), maxAge: 300 };
}
