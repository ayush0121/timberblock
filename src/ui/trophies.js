/**
 * Achievement toasts and the Stats & trophies screen. DOM only - what has
 * been earned is decided by game/achievements.js.
 */
import { ACHIEVEMENTS, earnedCount } from "../game/achievements.js";
import { THEMES } from "./themes.js";

const fmt = (n) => (n || 0).toLocaleString("en-US");
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/* ── toasts ───────────────────────────────────────────────────────── */
let host = null;
function toastHost() {
  if (!host) {
    host = el("div", "toasts");
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  return host;
}

/** A small card that slides in at the top: icon, eyebrow, title, line. */
export function toast({ icon = "🏆", kicker = "Achievement", title, text }) {
  const t = el("div", "toast");
  t.append(el("span", "ti", icon));
  const body = el("div", "tb");
  body.append(el("span", "tk", kicker), el("b", null, title));
  if (text) body.append(el("span", "tt", text));
  t.append(body);
  toastHost().appendChild(t);
  setTimeout(() => t.classList.add("out"), 3600);
  setTimeout(() => t.remove(), 4100);
}

/** Toasts for a batch of newly earned achievements, plus any skins they open. */
export function announce(fresh) {
  fresh.forEach((a, i) => setTimeout(() => {
    toast({ title: a.name, text: a.desc });
    const skin = Object.values(THEMES).find((t) => t.unlock === a.id);
    if (skin) setTimeout(() => toast({ icon: "🎨", kicker: "New skin unlocked", title: skin.name, text: skin.blurb }), 700);
  }, i * 900));
}

/* ── stats screen ─────────────────────────────────────────────────── */
function tile(label, value, sub) {
  const t = el("div", "stile");
  t.append(el("span", "sk", label), el("b", "sv tnum", value));
  if (sub) t.append(el("span", "ss", sub));
  return t;
}

/** Last 14 daily scores as bars: one series, one colour, hover for detail. */
function historyChart(history) {
  const wrap = el("div", "hchart");
  const days = history.slice(-14);
  if (!days.length) {
    wrap.append(el("p", "aside", "Play the Daily Seed and your scores will chart here."));
    return wrap;
  }
  const max = Math.max(...days.map((d) => d.score), 1);
  const bars = el("div", "hbars");
  bars.setAttribute("aria-hidden", "true");
  for (const d of days) {
    const col = el("div", "hcol");
    const bar = el("i", "hbar");
    bar.style.height = Math.max(3, (d.score / max) * 100) + "%";
    const tip = `${d.date} · ${fmt(d.score)}${d.rank ? ` · #${d.rank}` : ""}`;
    col.title = tip;
    col.dataset.tip = tip;
    col.tabIndex = 0;
    col.append(bar, el("span", "hday", d.date.slice(8)));
    bars.append(col);
  }
  wrap.append(bars);
  // the same data as text, for screen readers
  const list = el("ul", "sr");
  for (const d of days) list.append(el("li", null, `${d.date}: ${fmt(d.score)} points${d.rank ? `, rank ${d.rank}` : ""}`));
  wrap.append(list);
  return wrap;
}

export function renderStats(root, profile) {
  const st = profile.stats || {};
  root.textContent = "";

  const grid = el("div", "stiles");
  grid.append(
    tile("Games", fmt(profile.games)),
    tile("Lines cleared", fmt(st.lines)),
    tile("Board clears", fmt(st.perfect)),
    tile("Best combo", st.bestCombo ? "×" + st.bestCombo : "–"),
    tile("Best Classic", fmt(profile.best?.classic)),
    tile("Best Professional", fmt(profile.best?.pro), profile.bestLevel ? "level " + profile.bestLevel : ""),
    tile("Best Zen", fmt(profile.best?.zen)),
    tile("Dailies played", fmt(st.dailies)),
    tile("Best daily rank", st.bestRank ? "#" + st.bestRank : "–"),
    tile("Longest streak", fmt(profile.maxStreak), (profile.freezes || 0) + " freeze" + (profile.freezes === 1 ? "" : "s") + " saved"),
  );

  const chartCard = el("div", "card");
  chartCard.append(el("div", "eyebrow", "Daily scores · last 14 boards"), historyChart(profile.dailyHistory || []));

  const trophies = el("div", "card");
  const earned = earnedCount(profile);
  trophies.append(el("div", "eyebrow", `Trophies · ${earned} of ${ACHIEVEMENTS.length}`));
  const tg = el("div", "trophies");
  for (const a of ACHIEVEMENTS) {
    const got = profile.trophies && profile.trophies[a.id];
    const t = el("div", "trophy" + (got ? " got" : ""));
    t.append(el("span", "tic", got ? "🏆" : "🔒"));
    const body = el("div");
    body.append(el("b", null, a.name), el("span", null, a.desc));
    const skin = Object.values(THEMES).find((x) => x.unlock === a.id);
    if (skin) body.append(el("span", "tskin", "Unlocks the " + skin.name + " skin"));
    t.append(body);
    tg.append(t);
  }
  trophies.append(tg);

  root.append(grid, chartCard, trophies);
}
