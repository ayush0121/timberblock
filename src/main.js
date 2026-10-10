/**
 * Application controller. Owns the profile, the active Run, and the screens;
 * everything else is a module it drives.
 */
import "./styles/themes.css";
import "./styles/base.css";
import "./styles/game.css";
import "./styles/juice.css";
import "./styles/layout.css";
import "./styles/skins-extra.css";
import "./styles/features.css";

import { Run } from "./game/run.js";
import { localSeed } from "./game/rng.js";
import { MODES, target, clock } from "./game/modes.js";
import {
  dateKey, dayNumber, dailySeed, untilNextLabel, advanceStreak, streakState,
} from "./game/daily.js";
import { award } from "./game/achievements.js";
import { findHint } from "./game/hint.js";
import { level as advLevel, startState as advStart, track as advTrack, stars as advStars } from "./game/adventure.js";
import { eventFor } from "./game/events.js";
import { questsFor, today as questsToday, bump as questBumpRaw, progressOf } from "./game/quests.js";
import { SEASONS, activeSeason, daysLeft, seasonSeed } from "./game/seasons.js";
import { EPOCH_UTC } from "./game/daily.js";
import { weekKey } from "./game/daily.js";
import { rotateCells } from "./game/shapes.js";
import { anywhere } from "./game/board.js";
import {
  encodeChallenge, challengeLink, challengeFromLocation, parsePasted, clearLocationToken,
} from "./game/challenge.js";
import { N, EMPTY } from "./game/board.js";

import {
  THEMES, THEME_IDS, DEFAULT_THEME, TONE_COUNT, getTheme, applyTheme, isUnlocked,
} from "./ui/themes.js";
import { byId as achievementById } from "./game/achievements.js";
import { announce, renderStats, toast } from "./ui/trophies.js";
import { attachKeys } from "./ui/keys.js";
import { recordReplay, deliverReplay, recorderType } from "./ui/replay.js";
import { BoardView } from "./ui/boardview.js";
import { renderTray, setBigPieces } from "./ui/tray.js";
import { attachDrag } from "./ui/drag.js";
import { Effects } from "./ui/effects.js";
import { renderShare, copy } from "./ui/share.js";
import { SHARE_URL } from "./config.js";
import { renderShareCard, offerCard, fontsReady } from "./ui/sharecard.js";
import { STEPS, loadStep, isGoal, Coach } from "./ui/tutorial.js";

import * as store from "./platform/storage.js";
import * as audio from "./platform/audio.js";
import {
  initDevice, tap, buzz, onBack, setStatusBar, setHaptics, canRemind, setReminder,
} from "./platform/device.js";
import { getCloud, blankProfile } from "./net/cloud.js";
import { initAds, mountBanner, adsConfigured } from "./net/ads.js";
import * as lb from "./net/leaderboard.js";
import * as leagues from "./net/leagues.js";
import { dailyPing } from "./net/analytics.js";
import * as installer from "./ui/install.js";

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString("en-US");

/* ── state ───────────────────────────────────────────────────────── */
let theme = getTheme(DEFAULT_THEME);
let profile = null;          // the player record
let profileId = null;        // cloud id, or "local"
let cloud = null;            // adapter or null
let run = null;              // active Run
let running = false;         // a run is in progress (may be paused)
let accepting = false;       // input allowed right now
let ticker = 0;
let syncTimer = 0;
let runDailyKey = null;   // which board today's daily run belongs to
let pending = null;       // a challenge waiting to be accepted
let facing = null;        // the challenge the active run is answering
let lbData = null;        // today's leaderboard view, as last fetched
let lbFetchedAt = 0;
let lbState = "loading";  // "loading" | "ok" | "offline"
let tut = null;           // the tutorial in progress: { step, then }
let lbScope = "day";      // which board the home card shows
const scoped = { week: null, all: null, event: null };
let hintsLeft = 0;
let hintTimer = 0;
let zenLines = 0;         // lines cleared in this Zen session
let adv = null;           // the Adventure level in play: { lv, st }
let undoStack = [];       // snapshots before each placement (power-up modes)
let powerMode = null;     // "rotate" while waiting for the player to tap a piece
let tutorialSeen = false;

const board = new BoardView($("board"), theme);
const fx = new Effects($("chips"), $("board").parentElement, board);
const coach = new Coach(board, $("tray"));

/** A player's first few Classic games deal beginner-friendly hands. */
const GENTLE_GAMES = 3;
/** Hints would make shared boards unfair, so they're off on daily and challenges. */
const HINT_MODES = new Set(["classic", "pro", "zen", "adventure", "archive", "season"]);
const HINTS_PER_GAME = 3;
/** Power-ups would make shared and timed boards unfair: off there. */
const POWER_MODES = new Set(["classic", "zen", "adventure", "season"]);
const POWERS = ["rotate", "swap", "undo"];
const UNDO_DEPTH = 5;

/** Older profiles predate the daily fields. Fill them in on load. */
function migrate(p) {
  p.best = p.best || { classic: 0, pro: 0 };
  if (p.best.daily == null) p.best.daily = 0;
  if (p.best.challenge == null) p.best.challenge = 0;
  p.streak = p.streak || 0;
  p.maxStreak = p.maxStreak || 0;
  p.lastDaily = p.lastDaily || null;
  p.daily = p.daily || null;          // {date, score, done}
  if (p.guest === undefined) p.guest = p.name === "Guest";
  p.stats = { lines: 0, maxLines: 0, perfect: 0, bestCombo: 0, dailies: 0, sent: 0, beaten: 0, ...(p.stats || {}) };
  p.trophies = p.trophies || {};
  if (p.freezes == null) p.freezes = 1;              // everyone starts with one
  p.dailyHistory = p.dailyHistory || [];
  if (p.best.zen == null) p.best.zen = 0;
  p.settings = { cb: false, haptics: true, remind: false, big: false, ...(p.settings || {}) };
  p.adventure = { level: 1, stars: {}, ...(p.adventure || {}) };
  p.eventBest = p.eventBest || null;   // { week, score }
  p.league = p.league || null;         // the friends-league code this player is in
  p.powers = { rotate: 3, swap: 3, undo: 3, ...(p.powers || {}) };
  p.quests = p.quests || null;           // today's quest progress
  p.archiveBest = p.archiveBest || {};   // { date: best practice score }
  p.seasons = p.seasons || {};           // { seasonId: first date played }
  p.seasonBest = p.seasonBest || {};     // { seasonId: best score }
  return p;
}

/* ── profile persistence ─────────────────────────────────────────── */
async function persist(now) {
  if (!profile) return;
  profile.updatedAt = new Date().toISOString();
  await store.set(store.KEYS.profile, profile);
  if (!cloud || profileId === "local") return;
  clearTimeout(syncTimer);
  const push = () => cloud.save(profileId, profile).catch(() => {});
  if (now) push();
  else syncTimer = setTimeout(push, 1200);
}

function saveRun(now) {
  if (!running || !run || run.mode === "tutorial") return;
  profile.save = run.snapshot();
  if (run.mode === "daily") profile.save.dailyDate = runDailyKey;
  if (run.mode === "challenge") profile.save.chal = facing;
  if (run.mode === "archive") profile.save.archiveDate = run.archiveDate;
  if (run.mode === "season") profile.save.seasonId = run.seasonId;
  if (run.mode === "adventure" && adv) {
    profile.save.adv = { n: adv.lv.n, moves: adv.st.moves, lines: adv.st.lines, gemsLeft: [...adv.st.gemsLeft] };
  }
  persist(now);
}

/* ── screens ─────────────────────────────────────────────────────── */
function show(which) {
  for (const s of ["gate", "home", "play", "stats", "map", "archive"]) $("s-" + s).hidden = s !== which;
  if (which === "play") requestAnimationFrame(() => fx.resize());
}

const gatePanels = { pick: "gate-pick", up: "gate-signup" };
function gate(which) {
  for (const [k, id] of Object.entries(gatePanels)) $(id).hidden = k !== which;
}

function showHome() {
  $("who-name").textContent = profile.name;
  $("who-tag").textContent =
    profile.guest ? "guest · this device only"
      : profileId === "local" ? "profile · this device" : "profile · synced";
  $("acctpanel").hidden = true;
  $("upgrade").hidden = true;
  $("acct").textContent = profile.guest ? "Add name" : "Profile";

  $("best-classic").innerHTML = fmt(profile.best.classic) + "<small>best</small>";
  $("best-pro").innerHTML =
    fmt(profile.best.pro) +
    "<small>best" + (profile.bestLevel ? " · lv " + profile.bestLevel : "") + "</small>";

  $("best-zen").innerHTML = fmt(profile.best.zen || 0) + "<small>best</small>";
  renderAdventureCard();
  renderEventCard();
  renderQuests();
  renderSeasonCard();
  renderArchiveCard();
  applySettings();

  const rb = $("m-resume");
  if (profile.save) {
    rb.hidden = false;
    const s = profile.save;
    const label = s.mode === "pro" ? `Professional · level ${s.level}`
      : s.mode === "daily" ? `Daily #${dayNumber(s.dailyDate || dateKey())}`
      : s.mode === "challenge" ? `Challenge · ${(s.chal && s.chal.name) || "a friend"}`
      : s.mode === "zen" ? "Zen"
      : s.mode === "adventure" ? `Adventure · level ${(s.adv && s.adv.n) || 1}`
      : s.mode === "event" ? eventFor().name
      : s.mode === "archive" ? `Archive · Day #${dayNumber(s.archiveDate || dateKey())}`
      : s.mode === "season" ? ((SEASONS.find((x) => x.id === s.seasonId) || {}).name || "Seasonal")
      : "Classic";
    $("resume-sub").textContent = `${label} · ${fmt(s.score)} points`;
  } else rb.hidden = true;

  renderChallenge();
  renderDaily();
  renderSkins();
  renderShare($("share-home"), bestBrag());
  renderBoards();
  refreshBoard();
  renderLeague();
  dailyPing();
  renderInstall();
  show("home");
  if (adsConfigured()) mountBanner($("ad-menu"));
}

/* ── daily seed ──────────────────────────────────────────────────── */
function todaysSave() {
  const s = profile.save;
  return s && s.mode === "daily" && s.dailyDate === dateKey() ? s : null;
}
function playedToday() {
  return !!(profile.daily && profile.daily.date === dateKey() && profile.daily.done);
}

function renderDaily() {
  const key = dateKey();
  const n = dayNumber(key);
  const card = $("m-daily");
  const badge = $("daily-badge");

  $("daily-num").innerHTML = "#" + n + "<small>today</small>";

  if (playedToday()) {
    card.classList.add("done");
    badge.hidden = false;
    badge.textContent = "played";
    const me = lbData && lbData.date === key && lbData.me;
    $("daily-sub").textContent = me && me.rank
      ? `You placed #${me.rank} of ${fmt(lbData.n)} with ${fmt(profile.daily.score)}. Next board in ${untilNextLabel()}.`
      : `You scored ${fmt(profile.daily.score)}. Next board in ${untilNextLabel()}.`;
  } else if (todaysSave()) {
    card.classList.remove("done");
    badge.hidden = false;
    badge.textContent = "in progress";
    $("daily-sub").textContent =
      `Continue today's board — ${fmt(todaysSave().score)} so far.`;
  } else {
    card.classList.remove("done");
    badge.hidden = true;
    $("daily-sub").textContent = "Everyone in the world plays this board today.";
  }

  const sc = $("streakcard");
  if (profile.streak > 0 || profile.maxStreak > 0) {
    sc.hidden = false;
    const ss = streakState(profile, key);
    $("streak-n").textContent = ss.live === 1 ? "1 day streak" : `${ss.live} day streak`;
    const f = profile.freezes || 0;
    const ice = f ? ` · 🧊 ${f} freeze${f === 1 ? "" : "s"}` : "";
    $("streak-t").textContent =
      ss.status === "done" ? "come back tomorrow to keep it" + ice
      : ss.status === "due" ? "play today to keep it alive" + ice
      : ss.status === "frozen" ? `missed ${ss.need} day${ss.need === 1 ? "" : "s"} · play today and a freeze saves it`
      : "play the daily board to start one" + ice;
    sc.classList.toggle("warn", ss.status === "frozen");
    $("streak-best").textContent = profile.maxStreak;
  } else sc.hidden = true;
}

function recordDaily() {
  const key = dateKey();
  if (profile.lastDaily !== key) {
    const before = profile.freezes || 0;
    const r = advanceStreak(profile, key);
    profile.streak = r.streak;
    profile.freezes = r.freezes;
    profile.lastDaily = key;
    if (profile.streak > profile.maxStreak) profile.maxStreak = profile.streak;
    if (r.used) {
      toast({ icon: "🧊", kicker: "Streak saved", title: `${r.used} freeze${r.used === 1 ? "" : "s"} used`,
              text: `Your ${profile.streak}-day streak lives on.` });
    } else if (r.freezes > before) {
      toast({ icon: "🧊", kicker: "Freeze earned", title: `${profile.streak}-day streak`,
              text: "Miss a day and a freeze keeps your streak alive." });
    }
    profile.stats.dailies += 1;
    grantPowers(["undo"], "for today's Daily Seed");
    profile.dailyHistory.push({ date: key, score: run.score });
    if (profile.dailyHistory.length > 60) profile.dailyHistory.shift();
  }
  profile.daily = { date: key, score: run.score, done: true };
  if (run.score > (profile.best.daily || 0)) profile.best.daily = run.score;
}

/* ── daily leaderboard ───────────────────────────────────────────── */
const pct = (x) => Math.max(1, Math.min(99, Math.round(x * 100)));

/** Fetch today's board, at most every 20s unless forced. Never blocks play. */
async function refreshBoard(force) {
  if (!force && Date.now() - lbFetchedAt < 20000) return;
  lbFetchedAt = Date.now();
  const data = await lb.fetchBoard(dateKey());
  if (data) { lbData = data; lbState = "ok"; }
  else if (!lbData) lbState = "offline";
  renderBoards();
  if (!$("s-home").hidden) renderDaily();
}

function renderBoards() {
  renderBoard($("lb-home"), 10);
  renderBoard($("lb-play"), 10);
}

const SCOPE_TITLE = { day: "Today's leaderboard", week: "This week", all: "All-time best", event: "Weekly event" };

/** Switch the home card between Today, This week and All-time. */
async function setScope(scope) {
  lbScope = scope;
  for (const b of document.querySelectorAll("#lb-home [data-scope]"))
    b.setAttribute("aria-selected", String(b.dataset.scope === scope));
  renderBoard($("lb-home"), 10);
  if (scope !== "day") {
    const data = await lb.fetchBoard(dateKey(), scope);
    if (data) scoped[scope] = data;
    renderBoard($("lb-home"), 10);
  }
}

/** Paint one leaderboard card. The home card follows lbScope; the play
 *  panel always shows today. */
function renderBoard(card, limit) {
  const part = (k) => card.querySelector(`[data-lb="${k}"]`);
  const key = dateKey();
  const scope = card.id === "lb-home" ? lbScope : "day";
  if (part("title")) part("title").textContent = SCOPE_TITLE[scope];
  part("day").textContent = scope === "day" ? "Day #" + dayNumber(key)
    : scope === "week" ? "Mon – Sun" : scope === "event" ? eventFor().name : "best single day";
  const list = part("list"), note = part("note"), me = part("me");
  list.textContent = "";
  const data = scope === "day" ? (lbData && lbData.date === key ? lbData : null) : scoped[scope];

  if (!data) {
    me.hidden = true;
    note.hidden = false;
    note.textContent = lbState === "offline"
      ? "The leaderboard is offline right now. Your daily score is kept and posted later."
      : "Loading…";
    return;
  }

  const rows = data.top.slice(0, limit);
  // outside the visible top? pin your own row underneath it
  if (data.me && !rows.some((e) => e.me)) {
    rows.push({ gap: true });
    rows.push({ rank: data.me.rank || "–", name: "You", score: data.me.score, me: true });
  }
  for (const e of rows) {
    const li = document.createElement("li");
    if (e.gap) { li.className = "gap"; li.setAttribute("aria-hidden", "true"); list.appendChild(li); continue; }
    li.className = (e.me ? "me " : "") + (e.rank <= 3 ? "medal r" + e.rank : "");
    const rank = document.createElement("span"); rank.className = "rk tnum"; rank.textContent = e.rank;
    const name = document.createElement("span"); name.className = "nm"; name.textContent = e.name;
    const sc = document.createElement("span"); sc.className = "sc tnum"; sc.textContent = fmt(e.score);
    li.append(rank, name, sc);
    list.appendChild(li);
  }

  const mine = data.me;
  me.hidden = !mine;
  if (mine) {
    me.textContent = (mine.rank ? `You're #${mine.rank} · ` : "You · ") +
      `${fmt(mine.score)} pts · better than ${pct(mine.beats)}% of ${fmt(data.n)}`;
  }
  note.hidden = false;
  if (scope !== "day") {
    note.textContent = scope === "week"
      ? "Every Daily Seed you finish this week adds to your total."
      : scope === "event" ? `${eventFor().blurb} Best attempt counts.`
      : "Each player's best single Daily Seed, ever.";
    if (!data.n) note.textContent = scope === "event"
      ? "No scores yet. Play this week's event and take first place."
      : "No scores yet. Finish a Daily Seed to get on it.";
    return;
  }
  note.textContent = !data.n
    ? "No scores yet. Play the Daily Seed and take first place."
    : mine ? `${fmt(data.n)} ${data.n === 1 ? "player" : "players"} today · next board in ${untilNextLabel()}`
    : `${fmt(data.n)} ${data.n === 1 ? "player has" : "players have"} played today. Play the Daily Seed to get on the board.`;
  projectRank();
}

/** During today's daily run: where the current score would land right now. */
function projectRank() {
  const me = $("lb-play").querySelector('[data-lb="me"]');
  if (!run || !running || run.mode !== "daily" || !lbData || lbData.date !== runDailyKey) return;
  const top = lbData.top;
  const above = top.filter((e) => e.score >= run.score).length;
  me.hidden = false;
  me.textContent = above < top.length || top.length < 50
    ? `Right now you'd place #${above + 1}`
    : `Keep going: the top ${top.length} starts at ${fmt(top[top.length - 1].score)}`;
}

/** The name shown on the board. Guests get a short tag so rows stay distinct. */
async function boardName() {
  if (!profile.guest) return profile.name;
  const id = await lb.playerId();
  return "Guest " + id.slice(-4).toUpperCase();
}

/** Post the daily run that just ended, then show where it placed. */
async function postDaily(finished, date) {
  const line = $("rankline");
  line.hidden = false;
  line.textContent = "Posting to today's leaderboard…";
  const view = await lb.submit({
    date, name: await boardName(), moves: finished.moves, score: finished.claimedScore, tones: TONE_COUNT,
  });
  if (view && view.date === dateKey()) { lbData = view; lbState = "ok"; lbFetchedAt = Date.now(); }
  const mine = view && view.me;
  if (mine && mine.rank) {
    profile.stats.bestRank = Math.min(profile.stats.bestRank || 999, mine.rank);
    const h = profile.dailyHistory.find((d) => d.date === date);
    if (h) h.rank = mine.rank;
    checkTrophies();
    persist(false);
  }
  scoped.week = scoped.all = null;   // stale now
  line.textContent = view && view.rejected
    ? "This run couldn't be verified, so it isn't on the leaderboard."
    : mine
    ? (mine.rank ? `#${mine.rank} of ${fmt(view.n)} today` : `${fmt(view.n)} players today`) +
      ` · better than ${pct(mine.beats)}%`
    : lb.available() ? "Saved. It posts to the leaderboard once you're back online."
    : "The leaderboard needs the online version of the game.";
  renderBoards();
}

/* ── stats panel (wide screens) ──────────────────────────────────── */
const TIPS = [
  "Keep the centre open. Big 3×3 pieces need somewhere to land.",
  "Clear on consecutive turns to build a combo multiplier.",
  "A row and a column together score far more than one at a time.",
  "Fill edges and corners first; they are the hardest cells to reach later.",
  "Before you drop, check the other two pieces still have a home.",
  "An empty board after a clear is the rarest shout in the game.",
];
function paintStats() {
  $("st-classic").textContent = fmt(profile.best.classic || 0);
  $("st-pro").textContent = fmt(profile.best.pro || 0);
  $("st-streak").textContent = profile.streak || 0;
  $("st-games").textContent = fmt(profile.games || 0);
  $("st-tip").textContent = "Tip · " + TIPS[Math.floor(Math.random() * TIPS.length)];
}

/* ── challenge ───────────────────────────────────────────────────── */
function renderChallenge() {
  const card = $("m-chal");
  if (!pending) { card.hidden = true; return; }
  card.hidden = false;
  $("chal-sub").textContent =
    `${pending.name} scored ${fmt(pending.score)} on this board` +
    (pending.label ? ` · ${pending.label}` : "");
}

function offerChallenge(chal) {
  pending = chal;
  renderChallenge();
}

function startChallenge() {
  if (!pending) return;
  facing = pending;
  runDailyKey = null;
  run = new Run({ mode: "challenge", seed: pending.seed, tones: TONE_COUNT, gentle: !!pending.gentle });
  profile.games = (profile.games || 0) + 1;
  pending = null;
  clearLocationToken();
  openRun(false);
}

function drawChallenge() {
  if (!facing) return;
  const beat = run.score > facing.score;
  $("chal-lbl").textContent = beat ? "Ahead" : "Beat";
  $("chalfill").style.width =
    Math.min(1, facing.score ? run.score / facing.score : 1) * 100 + "%";
  $("chalval").textContent = `${fmt(run.score)} / ${fmt(facing.score)}`;
  $("chalhud").classList.toggle("chal-done", beat);
}

/** Build the link for the run that just ended and hand it to the player. */
async function sendChallenge(btn) {
  const label = btn.textContent;
  const token = encodeChallenge({
    seed: run.seed,
    score: run.score,
    name: profile.guest ? "A friend" : profile.name,
    label: run.mode === "daily" ? `Day #${dayNumber(runDailyKey)}` : MODES[run.mode].name,
    gentle: run.gentle,
  });
  const base = /^https?:/.test(SHARE_URL) ? SHARE_URL : location.origin + location.pathname;
  const link = challengeLink(base, token);
  profile.stats.sent += 1;
  checkTrophies();
  persist(false);
  const text = `${who()} scored ${fmt(run.score)} on this Timberblock board. Play the exact same pieces: ${link}`;

  showLink(link, token);

  if (navigator.share) {
    try { await navigator.share({ title: "Timberblock", text }); btn.textContent = "Sent"; }
    catch (e) { copy(text, btn); }
  } else copy(text, btn);
  setTimeout(() => { btn.textContent = label; }, 2200);
}

function showLink(link, token) {
  const host = $("over");
  const old = host.querySelector(".linkbox");
  if (old) old.remove();
  const box = document.createElement("div");
  box.className = "linkbox";
  box.textContent = link;
  box.title = "Challenge code: " + token;
  host.appendChild(box);
}

/* ── theme picker ────────────────────────────────────────────────── */
function renderSkins() {
  const host = $("skins");
  host.textContent = "";
  const season = seasonNow();
  for (const id of THEME_IDS) {
    const t = THEMES[id];
    const open = isUnlocked(id, profile);
    if (t.season && !open && (!season || season.id !== t.season)) continue;
    const b = document.createElement("button");
    b.className = "skin" + (open ? "" : " locked");
    b.setAttribute("aria-pressed", String(id === theme.id));
    const need = !open && achievementById[t.unlock];
    b.innerHTML =
      `<span class="sw">${t.tones.slice(0, 4)
        .map((x) => `<i style="background:linear-gradient(150deg,${x.h},${x.b} 55%,${x.l})"></i>`)
        .join("")}</span>` +
      `<span class="sn">${open ? "" : "🔒 "}${t.name}</span>` +
      `<span class="st">${open ? t.tagline : need ? need.name : "locked"}</span>`;
    if (need) b.title = "Unlock: " + need.desc;
    b.onclick = () => open ? selectSkin(id)
      : toast({ icon: "🔒", kicker: t.name + " is locked", title: need.name, text: need.desc });
    host.appendChild(b);
  }
  paintSwatches();
}

/** The little 3x3 block mark beside the home title, in the active skin. */
const LOGO = [1, 1, 0, 1, 0, 1, 0, 1, 1];
function paintLogo() {
  const host = $("home-logo");
  host.textContent = "";
  LOGO.forEach((on, i) => {
    const cell = document.createElement("i");
    if (on) {
      const b = document.createElement("span");
      b.className = "blk";
      const t = theme.tones[i % theme.tones.length];
      b.style.setProperty("--base", t.b);
      b.style.setProperty("--hi", t.h);
      b.style.setProperty("--lo", t.l);
      b.style.animationDelay = i * 70 + "ms";
      cell.appendChild(b);
    }
    host.appendChild(cell);
  });
}

function paintSwatches() {
  paintLogo();
  const host = $("gate-swatches");
  if (!host) return;
  host.textContent = "";
  for (const t of theme.tones) {
    const i = document.createElement("i");
    i.className = "blk";
    i.style.position = "relative";
    i.style.setProperty("--base", t.b);
    i.style.setProperty("--hi", t.h);
    i.style.setProperty("--lo", t.l);
    host.appendChild(i);
  }
}

async function selectSkin(id) {
  theme = applyTheme(id);
  board.setTheme(theme);
  audio.setVoice(id);
  setStatusBar(theme.statusBar);
  if (profile) { profile.skin = id; persist(false); }
  await store.set(store.KEYS.skin, id);
  if (run) { board.syncAll(run.grid); renderTray($("tray"), run, theme); }
  renderSkins();
}

/* ── achievements ────────────────────────────────────────────────── */
/** Award anything newly earned, and tell the player. */
function checkTrophies() {
  if (!profile) return;
  const fresh = award(profile, dateKey());
  if (!fresh.length) return;
  announce(fresh);
  persist(false);
  if (!$("s-home").hidden) renderSkins();
}

/** Lifetime stats from one placement. */
function noteMove(ev, perfect) {
  const st = profile.stats;
  questBump("placed");
  if (ev.lines) {
    questBump("lines", ev.lines);
    questBump("combo", ev.streak);
    if (ev.lines >= 2) questBump("multi");
    if (perfect) questBump("perfect");
  }
  if (ev.lines) {
    st.lines += ev.lines;
    st.maxLines = Math.max(st.maxLines, ev.lines);
    st.bestCombo = Math.max(st.bestCombo, ev.streak);
    if (perfect) st.perfect += 1;
    if (run.mode === "zen") zenLines += ev.lines;
  }
  checkTrophies();
}

function showStats() {
  renderStats($("stats-body"), profile);
  show("stats");
  scrollTo(0, 0);
}

/* ── hints ───────────────────────────────────────────────────────── */
function paintHint() {
  const on = !!run && HINT_MODES.has(run.mode);
  $("hint").classList.toggle("off", !on || hintsLeft <= 0);
  $("hint-n").textContent = on ? hintsLeft : "–";
}

function clearHint() {
  clearTimeout(hintTimer);
  for (const el of board.cells) el.classList.remove("hint-goal");
  for (const sl of $("tray").children) sl.classList.remove("hinted");
}

function showHint() {
  if (!run || !accepting || tut) return;
  if (!HINT_MODES.has(run.mode)) { fx.banner("Hints are off on shared boards"); return; }
  if (hintsLeft <= 0) { fx.banner("No hints left this game"); return; }
  const h = findHint(run, adv ? adv.st.gemsLeft : null);
  if (!h) return;
  hintsLeft -= 1;
  paintHint();
  clearHint();
  for (const [dr, dc] of h.cells) board.at(h.r + dr, h.c + dc).classList.add("hint-goal");
  const slot = $("tray").children[h.slot];
  if (slot) slot.classList.add("hinted");
  hintTimer = setTimeout(clearHint, 4500);
}

/* ── settings ────────────────────────────────────────────────────── */
function applySettings() {
  const st = profile.settings;
  document.documentElement.classList.toggle("cb", !!st.cb);
  setHaptics(st.haptics !== false);
  setBigPieces(!!st.big);
  $("set-big").checked = !!st.big;
  $("set-cb").checked = !!st.cb;
  $("set-haptics").checked = st.haptics !== false;
  $("set-sound").checked = audio.isEnabled();
  $("row-remind").hidden = !canRemind();
  $("set-remind").checked = !!st.remind;
}

/* ── tutorial ────────────────────────────────────────────────────── */
/** New players see the tutorial once, before whatever they picked first. */
function firstTime(go) {
  if (tutorialSeen || (profile && profile.games > 0)) go();
  else startTutorial(go);
}

function startTutorial(then) {
  stopTicker();
  facing = null;
  runDailyKey = null;
  tut = { step: 0, then };
  run = new Run({ mode: "tutorial", seed: 1, tones: TONE_COUNT });
  $("over").hidden = true;
  $("levelup").hidden = true;
  $("mode-tag").textContent = MODES.tutorial.name;
  $("prohud").hidden = true;
  $("chalhud").hidden = true;
  show("play");
  paintScore(true);
  paintStats();
  renderBoards();
  running = true;
  accepting = true;
  tutStep(0);
}

function tutStep(i) {
  tut.step = i;
  loadStep(run, i);
  board.syncAll(run.grid);
  renderTray($("tray"), run, theme);
  const s = STEPS[i];
  $("coach").hidden = false;
  $("coach-step").textContent = `Step ${i + 1} of ${STEPS.length}`;
  $("coach-title").textContent = s.title;
  $("coach-text").textContent = s.text;
  requestAnimationFrame(() => coach.show(i));
}

/** The move just made in the tutorial was right: celebrate, then next step. */
function tutAdvance() {
  run.tray = [null, null, null];
  renderTray($("tray"), run, theme);
  coach.hide();
  accepting = false;
  const next = tut.step + 1;
  setTimeout(() => {
    if (!tut) return;
    accepting = true;
    if (next < STEPS.length) tutStep(next); else endTutorial(false);
  }, 1000);
}

function closeTutorial() {
  coach.hide();
  $("coach").hidden = true;
  tut = null;
}

async function endTutorial(skipped) {
  const then = tut && tut.then;
  closeTutorial();
  running = false;
  accepting = false;
  tutorialSeen = true;
  await store.set(store.KEYS.tutorial, true);
  if (!skipped && profile) { profile.stats.tutorial = true; checkTrophies(); }
  if (!skipped) {
    fx.callout("You're ready!", "Let's play", 3);
    fx.celebrate(theme, 50);
    audio.levelUp();
  }
  setTimeout(() => { runStart = Date.now(); (then || showHome)(); }, skipped ? 0 : 1400);
}

/* ── adventure ───────────────────────────────────────────────────── */
function renderAdventureCard() {
  const a = profile.adventure;
  const total = Object.values(a.stars).reduce((x, y) => x + y, 0);
  const lv = advLevel(a.level);
  $("adv-num").innerHTML = a.level + "<small>level</small>";
  $("adv-sub").textContent = `Next: ${lv.title}.` + (total ? ` ${total} ★ earned.` : " Earn up to three stars a level.");
}

const TYPE_ICON = { gems: "◆", stones: "▦", score: "★", lines: "≡" };

/** The level map: chapters of seven, stars on every finished level. */
function showMap() {
  const a = profile.adventure;
  const total = Object.values(a.stars).reduce((x, y) => x + y, 0);
  $("map-stars").textContent = `${total} ★ earned · level ${a.level}`;
  $("map-play").textContent = `Play level ${a.level} →`;
  const host = $("map");
  host.textContent = "";
  const last = Math.max(21, Math.ceil((a.level + 7) / 7) * 7);
  for (let ch = 0; ch * 7 < last; ch++) {
    const head = document.createElement("div");
    head.className = "mapch eyebrow";
    head.textContent = `Chapter ${ch + 1}`;
    const row = document.createElement("div");
    row.className = "maprow";
    for (let n = ch * 7 + 1; n <= ch * 7 + 7; n++) {
      const b = document.createElement("button");
      const got = a.stars[n] || 0;
      const open = n <= a.level;
      b.className = "lvl" + (n === a.level ? " next" : "") + (got ? " done" : "") + (open ? "" : " locked");
      b.disabled = !open;
      const lv = advLevel(n);
      b.title = open ? `Level ${n}: ${lv.title}` : `Level ${n} (locked)`;
      b.innerHTML = `<span class="ln">${open ? n : "🔒"}</span><span class="lt">${open ? TYPE_ICON[lv.type] : ""}</span>` +
        `<span class="ls">${[1, 2, 3].map((i) => `<i class="${i <= got ? "on" : ""}">★</i>`).join("")}</span>`;
      if (open) b.onclick = () => { audio.unlock(); runStart = Date.now(); startAdventure(n); };
      row.appendChild(b);
    }
    host.append(head, row);
  }
  show("map");
  scrollTo(0, 0);
  const next = host.querySelector(".lvl.next");
  if (next) next.scrollIntoView({ block: "center" });
}

function startAdventure(n = profile.adventure.level) {
  const lv = advLevel(n);
  runDailyKey = null;
  facing = null;
  run = new Run({ mode: "adventure", seed: lv.seed, tones: TONE_COUNT });
  run.grid = lv.grid.map((r) => r.slice());
  run.stones = new Set(lv.stones);
  run.refill();                      // deal for the level's board, not an empty one
  adv = { lv, st: advStart(lv) };
  profile.games = (profile.games || 0) + 1;
  openRun(false);
}

function drawAdv(res) {
  const { lv, st } = adv;
  const value = res ? res.value : lv.type === "gems" ? lv.target - st.gemsLeft.size
    : lv.type === "score" ? Math.min(st.score, lv.target) : Math.min(st.lines, lv.target);
  const left = lv.moves - st.moves;
  $("adv-lbl").textContent = "Lv " + lv.n;
  $("advfill").style.width = Math.min(1, value / lv.target) * 100 + "%";
  const unit = lv.type === "gems" ? "gems" : lv.type === "score" ? "pts" : "lines";
  $("advval").textContent = `${fmt(value)} / ${fmt(lv.target)} ${unit}`;
  $("adv-goal").textContent = lv.title;
  $("adv-moves").textContent = `${left} move${left === 1 ? "" : "s"} left`;
  $("advhud").classList.toggle("low", left <= 3);
}

/** Called after every Adventure placement. True if the level just ended. */
function advAfterMove(ev) {
  const res = advTrack(adv.lv, adv.st, ev, run.score);
  drawAdv(res);
  if (res.done) { setTimeout(() => advEnd(true), ev.lines ? 450 : 150); return true; }
  if (res.failed) { setTimeout(() => advEnd(false), ev.lines ? 450 : 150); return true; }
  if (ev.over) { setTimeout(() => (canRescue() ? showRescue() : advEnd(false)), ev.lines ? 450 : 150); return true; }
  return false;
}

function advEnd(won) {
  running = false;
  accepting = false;
  const { lv, st } = adv;
  const a = profile.adventure;
  const got = won ? advStars(lv, st.moves) : 0;
  if (won) {
    questBump("adv");
    const firstTime = !a.stars[lv.n];
    if (firstTime || got > a.stars[lv.n]) {
      // a power-up per star newly earned on this level
      const fresh = got - (a.stars[lv.n] || 0);
      grantPowers(Array.from({ length: fresh }, (_, i) => POWERS[(lv.n + i) % 3]), `for ${fresh} new star${fresh === 1 ? "" : "s"}`);
    }
    a.stars[lv.n] = Math.max(a.stars[lv.n] || 0, got);
    if (lv.n >= a.level) a.level = lv.n + 1;
    buzz();
    audio.levelUp();
    fx.celebrate(theme, 40 + got * 20);
  } else audio.gameOver();
  profile.save = null;
  checkTrophies();
  persist(true);
  $("adv-title").textContent = won ? `Level ${lv.n} complete` : ev_outOf(lv, st);
  const starEl = $("adv-stars");
  starEl.textContent = "";
  for (let i = 1; i <= 3; i++) {
    const sp = document.createElement("span");
    sp.textContent = "★";
    sp.className = i <= got ? "on" : "";
    sp.style.animationDelay = 0.25 + i * 0.18 + "s";
    starEl.appendChild(sp);
  }
  starEl.setAttribute("aria-label", `${got} of 3 stars`);
  $("adv-note").textContent = won
    ? `${lv.moves - st.moves} moves to spare` + (got < 3 ? " · finish faster for more stars" : "")
    : "so close · try it again";
  $("adv-next").hidden = !won;
  $("adv-next").textContent = `Level ${lv.n + 1} →`;
  $("adv-retry").classList.toggle("primary", !won);
  $("advover").hidden = false;
}
const ev_outOf = (lv, st) => (lv.moves - st.moves <= 0 ? "Out of moves" : "Out of room");

/* ── daily quests ────────────────────────────────────────────────── */
const TIER_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" };
const rewardText = (kinds) => kinds.map((k) => "+" + k[0].toUpperCase() + k.slice(1)).join(" ");

/** Count something toward today's quests, and pay out anything finished. */
function questBump(metric, value = 1) {
  if (!profile || (run && run.mode === "tutorial" && !$("s-play").hidden)) return;
  profile.quests = questsToday(profile.quests, dateKey());
  const { finished, bonus } = questBumpRaw(profile.quests, metric, value);
  for (const q of finished) {
    profile.stats.quests = (profile.stats.quests || 0) + 1;
    grantPowers(q.reward, "Quest complete: " + q.text);
  }
  if (bonus) grantPowers(POWERS, "All three quests done today!");
  if (finished.length) { checkTrophies(); persist(false); }
}

function renderQuests() {
  const st = questsToday(profile.quests, dateKey());
  const list = $("q-list");
  list.textContent = "";
  for (const q of questsFor(st.date)) {
    const done = st.done.includes(q.id);
    const v = progressOf(st, q);
    const li = document.createElement("li");
    li.className = "q " + q.tier + (done ? " done" : "");
    li.innerHTML = `<span class="qtick" aria-hidden="true">${done ? "✓" : ""}</span>` +
      `<span class="qbody"><span class="qtext"></span><span class="qbar"><i></i></span></span>` +
      `<span class="qside"><span class="qval tnum"></span><span class="qrew"></span></span>`;
    li.querySelector(".qtext").textContent = q.text;
    li.querySelector(".qbar i").style.width = (v / q.goal) * 100 + "%";
    li.querySelector(".qval").textContent = done ? "done" : `${fmt(v)} / ${fmt(q.goal)}`;
    li.querySelector(".qrew").textContent = "⚡ " + rewardText(q.reward);
    li.title = `${TIER_LABEL[q.tier]} quest`;
    list.appendChild(li);
  }
  $("q-reset").textContent = "new in " + untilNextLabel();
  $("q-bonus").textContent = st.bonus
    ? "All three done: bonus collected. New quests tomorrow."
    : "Finish all three for a bonus: one of every power-up.";
}

/* ── puzzle archive ──────────────────────────────────────────────── */
const ARCHIVE_PAGE = 30;
let archiveShown = ARCHIVE_PAGE;
const dateOfDay = (n) => dateKey(new Date(EPOCH_UTC + (n - 1) * 86400000));

function renderArchiveCard() {
  const past = dayNumber(dateKey()) - 1;
  $("arch-num").innerHTML = fmt(Math.max(0, past)) + "<small>boards</small>";
  const played = Object.keys(profile.archiveBest).length;
  $("arch-sub").textContent = played
    ? `Replay any past Daily Seed. You've practised ${played} board${played === 1 ? "" : "s"}.`
    : "Replay any past Daily Seed. Practice, unranked, unlimited tries.";
}

function showArchive(reset = true) {
  if (reset) archiveShown = ARCHIVE_PAGE;
  const today = dayNumber(dateKey());
  const host = $("arch-list");
  host.textContent = "";
  const daily = Object.fromEntries((profile.dailyHistory || []).map((d) => [d.date, d]));
  const last = Math.max(1, today - archiveShown);
  for (let n = today - 1; n >= last; n--) {
    const date = dateOfDay(n);
    const mine = daily[date];
    const best = profile.archiveBest[date];
    const b = document.createElement("button");
    b.className = "archrow";
    b.innerHTML = `<span class="ad mono">#${n}</span><span class="ainfo"><b></b><span></span></span><span class="ago">Play ›</span>`;
    b.querySelector("b").textContent = new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    b.querySelector(".ainfo span").textContent = [
      mine ? `Your daily: ${fmt(mine.score)}${mine.rank ? " · #" + mine.rank : ""}` : null,
      best != null ? `Practice best: ${fmt(best)}` : null,
    ].filter(Boolean).join(" · ") || "Not played yet";
    b.onclick = () => { audio.unlock(); runStart = Date.now(); startArchive(date); };
    host.appendChild(b);
  }
  $("arch-more").hidden = last <= 1;
  show("archive");
  if (reset) scrollTo(0, 0);
}

function startArchive(date) {
  runDailyKey = null;
  facing = null;
  run = new Run({ mode: "archive", seed: dailySeed(date), tones: TONE_COUNT });
  run.archiveDate = date;
  profile.games = (profile.games || 0) + 1;
  openRun(false);
}

/* ── seasons ─────────────────────────────────────────────────────── */
/** The season running today. On localhost, ?season=<id> previews one. */
function seasonNow() {
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    const forced = new URLSearchParams(location.search).get("season");
    if (forced) return SEASONS.find((x) => x.id === forced) || null;
  }
  return activeSeason(dateKey());
}

function renderSeasonCard() {
  const s = seasonNow();
  $("m-season").hidden = !s;
  $("season-deco").hidden = !s;
  if (!s) return;
  $("season-deco").textContent = s.deco;
  $("season-name").textContent = s.name;
  const left = daysLeft(s, dateKey());
  $("season-badge").textContent = left === 1 ? "last day" : `${left} days left`;
  const skin = THEMES[s.skin];
  $("season-sub").textContent = s.blurb + (profile.seasons[s.id] ? "" : ` Play it to keep the ${skin.name} skin forever.`);
  $("season-num").innerHTML = fmt(profile.seasonBest[s.id] || 0) + "<small>best</small>";
}

function startSeason() {
  const s = seasonNow();
  if (!s) return;
  runDailyKey = null;
  facing = null;
  run = new Run({ mode: "season", seed: seasonSeed(s), tones: TONE_COUNT, rules: s.rules });
  run.seasonId = s.id;
  profile.games = (profile.games || 0) + 1;
  openRun(false);
}

/* ── install prompt ──────────────────────────────────────────────── */
async function renderInstall() {
  const kind = await installer.offer();
  $("install").hidden = !kind;
  if (!kind) return;
  $("install-ios").hidden = kind !== "ios";
  $("install-go").textContent = kind === "ios" ? "Got it" : "Install";
}

/* ── friends league ──────────────────────────────────────────────── */
const LEAGUE_ERRORS = {
  not_found: "No league has that code. Check it and try again.",
  full: "That league is full (50 players).",
  code: "A league code is 6 letters and numbers.",
  name: "Give the league a name of at least 2 characters.",
};
const leagueError = (r) => r ? (LEAGUE_ERRORS[r.error] || "Something went wrong. Try again.") : "Leagues need an internet connection.";

async function renderLeague() {
  const code = profile.league;
  $("lg-none").hidden = !!code;
  $("lg-in").hidden = !code;
  $("lg-code").textContent = code || "";
  if (!code) return;
  const st = await leagues.standings(code);
  if (st && st.error === "not_found") { profile.league = null; persist(false); return renderLeague(); }
  if (!st || st.error) {
    $("lg-title").textContent = "Your league";
    $("lg-list").textContent = "";
    $("lg-note").textContent = leagueError(st);
    return;
  }
  $("lg-title").textContent = st.name;
  const list = $("lg-list");
  list.textContent = "";
  for (const r of st.rows) {
    const li = document.createElement("li");
    li.className = (r.me ? "me " : "") + (r.rank <= 3 && r.score ? "medal r" + r.rank : "");
    const rk = document.createElement("span"); rk.className = "rk tnum"; rk.textContent = r.rank;
    const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = r.name;
    const sc = document.createElement("span"); sc.className = "sc tnum"; sc.textContent = fmt(r.score);
    li.append(rk, nm, sc);
    list.appendChild(li);
  }
  $("lg-note").textContent = st.n < 2
    ? "Just you so far. Invite friends with the code " + st.code + "."
    : `${st.n} players · daily scores added up this week · resets Monday`;
}

async function leagueAction(fn) {
  $("err-lg").textContent = "";
  const r = await fn();
  if (!r || r.error) { $("err-lg").textContent = leagueError(r); return null; }
  return r;
}

function leagueLink(code) {
  const base = /^https?:/.test(SHARE_URL) ? SHARE_URL : location.origin + location.pathname;
  return base.split("#")[0].replace(/\/+$/, "") + "/#lg=" + code;
}

/* ── weekly event ────────────────────────────────────────────────── */
const eventBestNow = () => {
  const b = profile.eventBest;
  return b && b.week === weekKey() ? b.score : 0;
};

function renderEventCard() {
  const ev = eventFor();
  $("event-name").textContent = ev.name;
  $("event-sub").textContent = ev.blurb;
  $("event-num").innerHTML = fmt(eventBestNow()) + "<small>best</small>";
}

function startEvent() {
  const ev = eventFor();
  runDailyKey = null;
  facing = null;
  run = new Run({ mode: "event", seed: ev.seed, tones: TONE_COUNT, rules: ev.rules });
  run.week = ev.week;
  profile.games = (profile.games || 0) + 1;
  openRun(false);
}

async function postEvent(finished, week) {
  const line = $("rankline");
  line.hidden = false;
  line.textContent = "Posting to the event leaderboard…";
  const view = await lb.submitEvent({
    week, name: await boardName(), moves: finished.moves, score: finished.claimedScore, tones: TONE_COUNT,
  });
  const mine = view && view.me;
  if (mine && mine.rank) {
    profile.stats.bestEventRank = Math.min(profile.stats.bestEventRank || 999, mine.rank);
    checkTrophies();
    persist(false);
  }
  if (view && !view.rejected) scoped.event = view;
  line.textContent = view && view.rejected
    ? "This run couldn't be verified, so it isn't on the leaderboard."
    : mine ? (mine.rank ? `#${mine.rank} of ${fmt(view.n)} this week` : `${fmt(view.n)} players this week`) +
      ` · your best ${fmt(mine.score)}`
    : "Saved here. The event board needs a connection.";
}

/* ── power-ups ───────────────────────────────────────────────────── */
const powersOn = () => !!run && POWER_MODES.has(run.mode) && !tut;

function paintPowers() {
  const on = powersOn();
  for (const k of POWERS) {
    const b = $("pw-" + k);
    b.hidden = !on;
    $(`pw-${k}-n`).textContent = profile.powers[k];
    b.classList.toggle("off", profile.powers[k] <= 0 || (k === "undo" && !undoStack.length));
  }
  $("pw-rotate").classList.toggle("armed", powerMode === "rotate");
  document.querySelector("#s-play .bar-row").classList.toggle("powers", on);
}

function grantPowers(kinds, why) {
  if (!kinds.length) return;
  for (const k of kinds) profile.powers[k] = (profile.powers[k] || 0) + 1;
  const names = kinds.map((k) => k[0].toUpperCase() + k.slice(1)).join(", ");
  toast({ icon: "⚡", kicker: "Power-up" + (kinds.length > 1 ? "s" : ""), title: "+ " + names, text: why });
}

/** Called just before a placement in power-up modes. */
function pushUndo() {
  undoStack.push({
    snap: run.snapshot(),
    adv: adv && { moves: adv.st.moves, lines: adv.st.lines, score: adv.st.score, gemsLeft: [...adv.st.gemsLeft] },
    zenLines,
  });
  if (undoStack.length > UNDO_DEPTH) undoStack.shift();
}

/** Back on the board after a power-up (from play, or from the rescue). */
function afterPower() {
  board.setMarks(adv ? adv.st.gemsLeft : null, run.stones);
  board.syncAll(run.grid);
  renderTray($("tray"), run, theme);
  paintScore(true);
  if (adv) drawAdv();
  paintPowers();
  if (!$("rescue").hidden && !run.over) {
    $("rescue").hidden = true;
    running = true;
    accepting = true;
  } else if (!$("rescue").hidden && run.over) {
    showRescue();   // still stuck: offer what's left
  }
  persist(false);
  saveRun(false);
}

function useUndo() {
  if (!powersOn() || profile.powers.undo <= 0 || !undoStack.length) return;
  const u = undoStack.pop();
  run = Run.restore(u.snap);
  if (adv && u.adv) {
    adv.st.moves = u.adv.moves; adv.st.lines = u.adv.lines; adv.st.score = u.adv.score;
    adv.st.gemsLeft = new Set(u.adv.gemsLeft);
  }
  zenLines = u.zenLines;
  profile.powers.undo -= 1;
  fx.banner("Move undone");
  afterPower();
}

function useSwap() {
  if (!powersOn() || profile.powers.swap <= 0) return;
  if (!run.swap(Date.now() - runStart)) return;
  profile.powers.swap -= 1;
  fx.banner("Fresh pieces");
  afterPower();
}

/** Arm rotate: the next piece tapped turns 90°. */
function armRotate() {
  if (!powersOn() || profile.powers.rotate <= 0) return;
  powerMode = powerMode === "rotate" ? null : "rotate";
  $("tray").classList.toggle("rotating", powerMode === "rotate");
  if (powerMode) fx.banner("Tap a piece to turn it");
  paintPowers();
}

function rotateSlot(slot) {
  powerMode = null;
  $("tray").classList.remove("rotating");
  if (!run.rotate(slot, Date.now() - runStart)) { paintPowers(); return; }
  profile.powers.rotate -= 1;
  audio.place();
  afterPower();
}

/** Could turning any tray piece make it fit? (Is Rotate worth offering?) */
function rotateHelps() {
  return run.tray.some((p) => {
    if (!p) return false;
    let c = p.cells;
    for (let i = 0; i < 3; i++) { c = rotateCells(c); if (anywhere(run.grid, c)) return true; }
    return false;
  });
}

function canRescue() {
  if (!powersOn()) return false;
  const pw = profile.powers;
  return pw.swap > 0 || (pw.undo > 0 && undoStack.length > 0) || (pw.rotate > 0 && rotateHelps());
}

function showRescue() {
  accepting = false;
  const pw = profile.powers;
  const set = (k, ok) => {
    $("rs-" + k).hidden = !ok;
    $(`rs-${k}-n`).textContent = "· " + pw[k] + " left";
  };
  set("swap", pw.swap > 0);
  set("undo", pw.undo > 0 && undoStack.length > 0);
  set("rotate", pw.rotate > 0 && rotateHelps());
  $("rescue").hidden = false;
}

function giveUp() {
  $("rescue").hidden = true;
  if (adv) advEnd(false); else endRun();
}

/* ── run lifecycle ───────────────────────────────────────────────── */
function startRun(mode) {
  // In production the SERVER issues this seed (see config.API_BASE).
  runDailyKey = null;
  facing = null;
  const gentle = mode === "classic" && (profile.classicRuns || 0) < GENTLE_GAMES;
  if (mode === "classic") profile.classicRuns = (profile.classicRuns || 0) + 1;
  run = new Run({ mode, seed: localSeed(), tones: TONE_COUNT, gentle });
  profile.games = (profile.games || 0) + 1;
  openRun(false);
}

/** Today's board. The seed comes from the UTC date, so it is identical for
 *  every player on earth without a single network call. */
function startDaily() {
  facing = null;
  runDailyKey = dateKey();
  run = new Run({ mode: "daily", seed: dailySeed(runDailyKey), tones: TONE_COUNT });
  profile.games = (profile.games || 0) + 1;
  openRun(false);
}

function resumeRun() {
  if (!profile.save) return;
  runDailyKey = profile.save.dailyDate || null;
  facing = profile.save.chal || null;
  run = Run.restore(profile.save);
  run.archiveDate = profile.save.archiveDate || null;
  run.seasonId = profile.save.seasonId || null;
  adv = null;
  if (run.mode === "adventure" && profile.save.adv) {
    const a = profile.save.adv;
    adv = { lv: advLevel(a.n), st: advStart(advLevel(a.n)) };
    adv.st.moves = a.moves; adv.st.lines = a.lines; adv.st.score = run.score;
    adv.st.gemsLeft = new Set(a.gemsLeft);
  }
  // keep move times continuous across the break, or the server replay
  // would see the clock run backwards
  const last = run.moves.length ? run.moves[run.moves.length - 1][3] : 0;
  runStart = Date.now() - last;
  openRun(true);
}

function openRun(resumed) {
  $("over").hidden = true;
  $("levelup").hidden = true;
  $("mode-tag").textContent = MODES[run.mode].name;
  $("prohud").hidden = !run.timed;
  $("chalhud").hidden = run.mode !== "challenge";
  $("advhud").hidden = run.mode !== "adventure";
  $("advover").hidden = true;
  if (run.mode !== "adventure") adv = null;
  board.setMarks(adv ? adv.st.gemsLeft : null, run.stones);
  show("play");

  board.syncAll(run.grid);
  renderTray($("tray"), run, theme);
  paintScore(true);
  if (run.timed) { drawPro(); startTicker(); } else stopTicker();

  running = true;
  accepting = true;
  hintsLeft = HINTS_PER_GAME;
  if (!resumed) { zenLines = 0; questBump("games"); }
  undoStack = [];
  powerMode = null;
  $("tray").classList.remove("rotating");
  $("rescue").hidden = true;
  paintPowers();
  clearHint();
  paintHint();
  paintStats();
  renderBoards();
  refreshBoard();
  const b = profile.best[run.mode] || 0;
  if (run.mode === "challenge") drawChallenge();
  if (adv) drawAdv();
  const evNow = run.mode === "event" ? eventFor() : null;
  fx.banner(
    run.mode === "challenge"
      ? `Beat ${facing.name} · ${fmt(facing.score)}`
      : run.mode === "daily"
      ? `Day #${dayNumber(runDailyKey)} · one attempt`
      : resumed ? `Resumed · best ${fmt(b)}`
      : run.mode === "zen" ? "Zen · no game over, just play"
      : adv ? `Level ${adv.lv.n} · ${adv.lv.title}`
      : evNow ? `${evNow.name} · best ${fmt(eventBestNow())}`
      : run.mode === "archive" ? `Day #${dayNumber(run.archiveDate)} · practice, unranked`
      : run.mode === "season" ? `${(SEASONS.find((x) => x.id === run.seasonId) || {}).name || "Seasonal"} · limited time`
      : run.timed ? `Level 1 · target ${fmt(target(1))}`
      : b ? `Best to beat · ${fmt(b)}` : "First run — set a mark"
  );
  saveRun(true);
}

/** Roll a number up to its new value instead of jumping. */
const rolling = new Map();
function rollTo(el, to, ms = 320) {
  cancelAnimationFrame(rolling.get(el));
  const from = +el.dataset.v || 0;
  el.dataset.v = to;
  if (ms <= 0 || from === to || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = fmt(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
    if (k < 1) rolling.set(el, requestAnimationFrame(step));
  };
  rolling.set(el, requestAnimationFrame(step));
}

function paintScore(instant) {
  const el = $("score");
  const prev = +el.dataset.v || 0;
  rollTo(el, run.score, instant ? 0 : 320);
  if (!instant && run.score > prev) {
    el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
  }
  $("best").textContent = fmt(Math.max(profile.best[run.mode] || 0, run.score));
  const combo = $("combo");
  combo.hidden = run.streak < 2;
  combo.textContent = "×" + run.streak + " combo";
  projectRank();
}

/** The praise word for a clear: bigger clears and longer combos shout louder. */
function praise(ev, perfect) {
  if (perfect) return ["Board clear!", `+${fmt(ev.lineScore)}`, 3];
  const sub = ev.streak > 1 ? `Combo ×${ev.streak}` : `${ev.lines} lines`;
  if (ev.lines >= 4) return ["Unreal!", sub, 3];
  if (ev.lines === 3) return ["Amazing!", sub, 3];
  if (ev.lines === 2) return ["Great!", sub, 2];
  if (ev.streak >= 5) return ["On fire!", sub, 2];
  if (ev.streak >= 3) return ["Nice!", sub, 1];
  return null;
}

function drawPro() {
  $("lvl-lbl").textContent = "Lv " + run.level;
  const t = run.levelTarget;
  $("tgtfill").style.width = Math.min(1, run.levelScore / t) * 100 + "%";
  $("tgtval").textContent = fmt(Math.min(run.levelScore, t)) + " / " + fmt(t);

  const total = run.levelClock;
  $("timefill").style.width = Math.max(0, (run.timeLeft / total) * 100) + "%";
  const s = Math.max(0, Math.ceil(run.timeLeft));
  $("timeval").textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  $("timegauge").classList.toggle("low", run.timeLeft <= 15);
}

function startTicker() {
  stopTicker();
  ticker = setInterval(() => {
    if (!accepting || document.hidden) return;
    if (run.tick(0.1)) { drawPro(); endRun(); return; }
    drawPro();
  }, 100);
}
function stopTicker() { if (ticker) { clearInterval(ticker); ticker = 0; } }

/* ── a move ──────────────────────────────────────────────────────── */
let runStart = 0;

function onDrop(target_) {
  if (tut && !isGoal(tut.step, target_)) {
    audio.reject();
    if (target_) fx.banner("Try the glowing spot");
    coach.resume();
    return;
  }
  if (!target_) { audio.reject(); return; }
  if (powersOn()) pushUndo();
  const ev = run.place(target_.slot, target_.r, target_.c, Date.now() - runStart);
  if (!ev) { if (powersOn()) undoStack.pop(); audio.reject(); return; }
  clearHint();
  let perfect = false;

  // the placed piece
  for (const [dr, dc] of ev.placed.cells) board.draw(run.grid, ev.placed.r + dr, ev.placed.c + dc);

  if (ev.lines > 0) {
    // the engine already emptied those cells; re-show them for the animation
    const tones = [];
    for (const i of ev.cleared) tones[i] = ev.placed.tone;
    for (const i of ev.cleared) {
      const el = board.cells[i];
      el.firstChild.style.display = "";
    }
    perfect = run.grid.every((row) => row.every((t) => t === EMPTY));
    const power = Math.min(2.2, 1 + (ev.lines - 1) * 0.35 + (perfect ? 0.6 : 0));
    fx.burstCells(ev.cleared, run.grid, theme, tones, power);
    fx.sweep(ev.rows, ev.cols);
    const said = praise(ev, perfect);
    if (said) fx.callout(...said);
    if (ev.lines >= 2 || perfect) fx.shake(perfect ? 3 : ev.lines);
    if (perfect) fx.celebrate(theme, 60);
    board.animateClear(ev.cleared, () => {
      board.syncAll(run.grid);
      saveRun(false);
    });
    fx.pop(
      ev.streak > 1 ? `+${fmt(ev.lineScore)}  ×${ev.streak}` : `+${fmt(ev.lineScore)}`,
      ev.rows.length ? ev.rows[0] : 0,
      ev.cols.length ? ev.cols[0] : 3
    );
    audio.clear(ev.lines, ev.streak);
    tap("medium");
  } else {
    audio.place();
    tap("light");
  }

  paintScore();
  if (tut) { tutAdvance(); return; }
  noteMove(ev, perfect);
  if (adv) {
    renderTray($("tray"), run, theme);
    saveRun(false);
    advAfterMove(ev);
    return;
  }
  if (ev.relief) {
    // Zen: nothing fitted, so the fullest rows dissolved to make room
    fx.sweep(ev.relief, []);
    setTimeout(() => board.syncAll(run.grid), ev.lines ? 320 : 0);
    fx.banner("Room to breathe");
  }
  renderTray($("tray"), run, theme);
  if (run.timed) drawPro();
  if (run.mode === "challenge") drawChallenge();

  if (ev.levelUp) { levelCleared(ev); return; }
  saveRun(false);
  paintPowers();
  if (ev.over) setTimeout(() => (canRescue() ? showRescue() : endRun()), ev.lines ? 420 : 120);
}

function levelCleared(ev) {
  accepting = false;
  stopTicker();
  buzz();
  audio.levelUp();
  if (ev.clearedLevel > (profile.bestLevel || 0)) profile.bestLevel = ev.clearedLevel;

  board.syncAll(run.grid);
  renderTray($("tray"), run, theme);
  paintScore();
  drawPro();

  $("lvbonus").textContent = "+" + fmt(ev.bonus);
  $("lvnote").textContent = `${ev.secondsLeft}s left · next target ${fmt(ev.nextTarget)}`;
  $("nextlvl").textContent = `Level ${ev.nextLevel} →`;
  $("levelup").hidden = false;
  saveRun(true);
}

function endRun() {
  if (!running) return;
  running = false;
  accepting = false;
  stopTicker();

  const was = profile.best[run.mode] || 0;
  const isDaily = run.mode === "daily";
  if (run.score > was) profile.best[run.mode] = run.score;
  if (run.timed && run.level > (profile.bestLevel || 0)) profile.bestLevel = run.level;
  if (isDaily) recordDaily();
  $("rankline").hidden = true;
  if (isDaily) postDaily(run.submission(), runDailyKey);
  questBump("best", run.score);
  if (isDaily) questBump("daily");
  if (run.mode === "event") questBump("event");
  if (run.mode === "archive") {
    const d = run.archiveDate;
    profile.archiveBest[d] = Math.max(profile.archiveBest[d] || 0, run.score);
    profile.stats.archive = (profile.stats.archive || 0) + 1;
    questBump("archive");
  }
  if (run.mode === "season" && run.seasonId) {
    const id = run.seasonId;
    profile.seasonBest[id] = Math.max(profile.seasonBest[id] || 0, run.score);
    if (!profile.seasons[id]) profile.seasons[id] = dateKey();
  }
  checkTrophies();
  if (run.mode === "event") {
    const wk = run.week || weekKey();
    if (run.score > eventBestNow()) profile.eventBest = { week: wk, score: run.score };
    profile.stats.events = (profile.stats.events || 0) + 1;
    checkTrophies();
    postEvent(run.submission(), wk);
  }
  profile.save = null;
  persist(true);

  // In production: POST run.submission() here and let the server decide the
  // authoritative score. Offline, the local score stands.
  const isChal = run.mode === "challenge";
  const beat = isChal && run.score > facing.score;
  const tie = isChal && run.score === facing.score;
  if (beat) { profile.stats.beaten += 1; checkTrophies(); }
  $("over-title").textContent = isChal
    ? (beat ? "You beat them" : tie ? "Dead heat" : "Not quite")
    : isDaily ? `Day #${dayNumber(runDailyKey)}`
    : run.mode === "archive" ? `Day #${dayNumber(run.archiveDate)} · practice`
    : run.mode === "season" ? ((SEASONS.find((x) => x.id === run.seasonId) || {}).name || "Seasonal")
    : run.reason === "time" ? "Out of time" : "Out of room";
  paintScore(true);
  const fin = $("fin");
  fin.dataset.v = 0;
  fin.textContent = "0";
  setTimeout(() => rollTo(fin, run.score, 900), 250);
  const newBest = !isDaily && !isChal && run.score > was && run.score > 0;
  $("over").classList.toggle("best", newBest);
  if (newBest || beat) setTimeout(() => fx.celebrate(theme), 350);
  $("fnote").textContent = isChal
    ? (beat ? `${fmt(run.score - facing.score)} ahead of ${facing.name}`
      : tie ? `matched ${facing.name} exactly`
      : `${fmt(facing.score - run.score)} short of ${facing.name}'s ${fmt(facing.score)}`)
    : isDaily
    ? (profile.streak > 1 ? `${profile.streak} day streak · next board in ${untilNextLabel()}`
                          : `next board in ${untilNextLabel()}`)
    : run.score > was
      ? "new personal best" + (run.timed ? ` · level ${run.level}` : "")
      : run.timed ? `level ${run.level} · best ${fmt(was)}` : `best ${fmt(was)}`;
  $("again").hidden = isDaily;          // one attempt per board
  $("sharecard").classList.toggle("primary", isDaily);
  $("sendchal").textContent = isChal ? "Rematch" : "Challenge";
  $("sharevid").hidden = !recorderType();
  renderShare($("share-over"), brag());
  $("over").hidden = false;
  fx.collapse(run.grid, theme);
  audio.gameOver();
}

/* ── share copy ──────────────────────────────────────────────────── */
const brag = () =>
  run.mode === "challenge"
    ? (run.score > facing.score
        ? `Beat ${facing.name}'s ${fmt(facing.score)} with ${fmt(run.score)} on the same Timberblock board.`
        : run.score === facing.score
          ? `Dead heat with ${facing.name} at ${fmt(run.score)} on the same Timberblock board.`
          : `${fmt(run.score)} against ${facing.name}'s ${fmt(facing.score)} on the same Timberblock board. Rematch.`)
    : run.mode === "daily"
    ? `Timberblock Day #${dayNumber(runDailyKey)} · ${fmt(run.score)} points` +
      (profile.streak > 1 ? ` · 🔥${profile.streak}` : "") +
      "\n" + mosaic(run.grid) + "\nSame board for everyone. Beat me?"
    : run.timed
      ? `${who()} reached level ${run.level} in Timberblock (Professional) with ${fmt(run.score)} points. Beat that.`
      : run.mode === "archive"
      ? `${who()} scored ${fmt(run.score)} on Timberblock Day #${dayNumber(run.archiveDate)} (from the archive). Beat that.`
      : `${who()} scored ${fmt(run.score)} in Timberblock (${MODES[run.mode].name}). Beat that.`;

/**
 * The finished board as emoji, Wordle-style: it reads at a glance in a group
 * chat and makes people ask what it is. Same colour per tone in every skin.
 */
const MOSAIC = ["🟥", "🟦", "🟩", "🟨", "🟪", "🟧", "🟫"];
const mosaic = (grid) =>
  grid.map((row) => row.map((t) => (t === EMPTY ? "⬛" : MOSAIC[t % MOSAIC.length])).join("")).join("\n");

/** Share copy speaks as the player; "Guest scored 900" reads like a bug. */
const who = () => (profile.guest ? "I" : profile.name);

function bestBrag() {
  const p = [];
  if (profile.best.classic) p.push(`${fmt(profile.best.classic)} in Classic`);
  if (profile.best.pro)
    p.push(`${fmt(profile.best.pro)} in Professional${profile.bestLevel ? ` (level ${profile.bestLevel})` : ""}`);
  return p.length
    ? `${profile.guest ? "My" : profile.name + "'s"} Timberblock best: ${p.join(" and ")}. Beat that.`
    : "I'm playing Timberblock — an 8×8 block puzzle. Come take a turn.";
}

/* ── share card ──────────────────────────────────────────────────── */
async function shareTheCard(btn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Drawing…";
  try {
    await fontsReady();
    const isDaily = run.mode === "daily";
    const cv = renderShareCard({
      theme,
      grid: run.grid,
      score: run.score,
      headline: isDaily ? `Day #${dayNumber(runDailyKey)}` : MODES[run.mode].name,
      badge: cardBadge(),
      footnote: isDaily
        ? (profile.streak > 1 ? `🔥 ${profile.streak} day streak` : "")
        : run.timed ? `Level ${run.level}` : "",
      cta: isDaily ? `Play today's board free · ${SHARE_URL.replace(/^https?:\/\//, "")}`
        : `Play free · ${SHARE_URL.replace(/^https?:\/\//, "")}`,
      // phones share to WhatsApp Status and Stories: tall; desktops: square
      format: matchMedia("(pointer: coarse)").matches ? "story" : "square",
    });
    const how = await offerCard(cv, { text: brag(), filename: "timberblock.png" });
    btn.textContent = how === "downloaded" ? "Saved" : how === "shared" ? "Shared" : label;
    showCardPreview(cv, how);
  } catch (e) {
    btn.textContent = "Couldn't draw it";
  }
  setTimeout(() => { btn.disabled = false; btn.textContent = label; }, 2200);
}

/** The one line worth bragging about, for the share card. */
function cardBadge() {
  const me = (v) => v && v.me;
  if (run.mode === "daily") {
    // only good news goes on the card: a last-place rank is not a brag
    const m = me(lbData && lbData.date === runDailyKey ? lbData : null);
    if (m && m.rank === 1 && lbData.n > 1) return `🏆 #1 of ${fmt(lbData.n)} today`;
    if (m && m.rank && m.rank <= 10 && lbData.n >= 10) return `#${m.rank} of ${fmt(lbData.n)} today`;
    if (m && m.beats >= 0.5 && lbData.n >= 4) return `Beat ${pct(m.beats)}% of players today`;
    return profile.streak > 1 ? `🔥 ${profile.streak} day streak` : "Same board for everyone. Can you beat me?";
  }
  if (run.mode === "event") {
    const m = me(scoped.event);
    return m && m.rank && (m.rank <= 10 || m.beats >= 0.5) && scoped.event.n > 1
      ? `#${m.rank} of ${fmt(scoped.event.n)} this week` : eventFor().name;
  }
  if (run.mode === "challenge" && facing) {
    return run.score > facing.score ? `Beat ${facing.name}'s ${fmt(facing.score)}`
      : `${facing.name} scored ${fmt(facing.score)}`;
  }
  if (run.mode === "archive") return `Day #${dayNumber(run.archiveDate)} from the archive`;
  if ($("over").classList.contains("best")) return "New personal best!";
  return run.timed ? `Reached level ${run.level}` : "";
}

/* ── replay video ────────────────────────────────────────────────── */
/** A fresh Run in the finished run's starting state, for the replay. */
function replaySource(r) {
  const make = () => new Run({ mode: r.mode, seed: r.seed, tones: r.tones, gentle: r.gentle, rules: r.rules });
  return { makeRun: make, moves: r.moves.slice() };
}

async function shareReplay(btn) {
  const label = btn.textContent;
  btn.disabled = true;
  const isDaily = run.mode === "daily";
  try {
    await fontsReady();
    const file = await recordReplay({
      ...replaySource(run),
      theme,
      title: isDaily ? `Day #${dayNumber(runDailyKey)} · ${fmt(run.score)}` : `${MODES[run.mode].name} · ${fmt(run.score)}`,
      site: SHARE_URL.replace(/^https?:\/\//, ""),
      onProgress: (k) => { btn.textContent = Math.round(k * 100) + "%"; },
    });
    const how = await deliverReplay(file);
    btn.textContent = how === "shared" ? "Shared" : how === "downloaded" ? "Saved" : label;
  } catch (e) {
    btn.textContent = "Can't record";
  }
  setTimeout(() => { btn.disabled = false; btn.textContent = label; }, 2400);
}

/** Show what was produced, so a viewer who can't download can long-press it. */
function showCardPreview(cv, how) {
  const host = $("over");
  const old = host.querySelector(".cardwrap");
  if (old) old.remove();
  const wrap = document.createElement("div");
  wrap.className = "cardwrap";
  cv.style.maxWidth = "100%";
  wrap.appendChild(cv);
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent =
    how === "shared" ? "Shared"
      : how === "downloaded" ? "Saved to your downloads"
      : "Long-press the image to save it";
  wrap.appendChild(hint);
  host.appendChild(wrap);
}

function clearOverlayExtras() {
  for (const sel of [".cardwrap", ".linkbox"]) {
    const el = $("over").querySelector(sel);
    if (el) el.remove();
  }
}

/* ── wiring ──────────────────────────────────────────────────────── */
attachDrag({
  trayEl: $("tray"),
  board,
  getRun: () => run,
  getTheme: () => theme,
  canPlay: () => accepting && !!run && !powerMode,
  onDrop,
});

$("go-signup").onclick = () => { gate("up"); $("in-name").focus(); };
$("back-1").onclick = () => gate("pick");

$("go-guest").onclick = async () => {
  audio.unlock();
  profile = migrate(blankProfile("Guest"));
  profile.guest = true;
  profileId = "local";
  await persist(true);
  showHome();
};

/** A profile is a name on this device, plus a cloud copy when a server is configured. */
async function makeProfile(name) {
  profile.name = name;
  profile.guest = false;
  if (cloud) {
    try {
      profileId = await cloud.create(profile);
      await store.set(store.KEYS.session, profileId);
    } catch (e) { profileId = "local"; }   // the server being down never blocks play
  } else profileId = "local";
  await persist(true);
  showHome();
}

const nameError = (name) =>
  name.length < 2 ? "Give yourself a name of at least 2 characters." : "";

$("do-signup").onclick = async () => {
  const name = $("in-name").value.trim();
  const err = $("err-signup");
  if ((err.textContent = nameError(name))) return;
  audio.unlock();
  profile = migrate(blankProfile(name));
  profile.skin = theme.id;
  await makeProfile(name);
};

$("do-upgrade").onclick = async () => {
  const name = $("in-name2").value.trim();
  const err = $("err-upgrade");
  if ((err.textContent = nameError(name))) return;
  await makeProfile(name);
};

$("acct").onclick = () => {
  if (profile.guest) {
    const open = $("upgrade").hidden;
    $("upgrade").hidden = !open;
    if (open) { $("err-upgrade").textContent = ""; $("in-name2").focus(); }
    return;
  }
  const open = $("acctpanel").hidden;
  $("acctpanel").hidden = !open;
  if (open) { $("in-rename").value = profile.name; $("err-rename").textContent = ""; }
};

$("do-rename").onclick = async () => {
  const name = $("in-rename").value.trim();
  const err = $("err-rename");
  if ((err.textContent = nameError(name))) return;
  profile.name = name;
  profile.guest = false;
  await persist(true);
  showHome();
};

$("signout").onclick = async () => {
  await persist(true);
  await store.remove(store.KEYS.session);
  await store.remove(store.KEYS.profile);
  profile = null; profileId = null;
  $("in-name").value = "";
  gate("pick"); show("gate");
};

for (const b of document.querySelectorAll(".mode[data-mode]")) {
  b.onclick = () => { audio.unlock(); runStart = Date.now(); firstTime(() => startRun(b.dataset.mode)); };
}
$("m-resume").onclick = () => { audio.unlock(); runStart = Date.now(); resumeRun(); };

$("m-daily").onclick = () => {
  audio.unlock();
  if (playedToday()) {
    fx.banner(`Played · next board in ${untilNextLabel()}`);
    return;
  }
  runStart = Date.now();
  if (todaysSave()) resumeRun(); else firstTime(startDaily);
};

$("sharecard").onclick = (e) => shareTheCard(e.currentTarget);
$("sendchal").onclick = (e) => sendChallenge(e.currentTarget);
$("sharevid").onclick = (e) => shareReplay(e.currentTarget);

$("m-chal").onclick = () => { audio.unlock(); runStart = Date.now(); firstTime(startChallenge); };

$("do-chal").onclick = () => {
  const err = $("err-chal");
  const chal = parsePasted($("in-chal").value);
  if (!chal) { err.textContent = "That doesn't look like a Timberblock challenge."; return; }
  err.textContent = "";
  $("in-chal").value = "";
  audio.unlock();
  offerChallenge(chal);
  runStart = Date.now();
  firstTime(startChallenge);
};

$("nextlvl").onclick = () => {
  $("levelup").hidden = true;
  accepting = true;
  startTicker();
  fx.banner(`Level ${run.level} · target ${fmt(run.levelTarget)}`);
};
$("again").onclick = () => {
  clearOverlayExtras();
  $("over").hidden = true;
  runStart = Date.now();
  if (run.mode === "event") startEvent();
  else if (run.mode === "archive") startArchive(run.archiveDate);
  else if (run.mode === "season") startSeason();
  else startRun(run.mode);
};
$("tohome").onclick = () => {
  $("over").hidden = true;
  clearOverlayExtras();
  showHome();
};
$("coach-skip").onclick = () => endTutorial(true);
$("replay-tut").onclick = () => { audio.unlock(); startTutorial(showHome); };
// the hand gets out of the way while the player drags
$("tray").addEventListener("pointerdown", () => { if (tut) coach.pause(); });

$("quit").onclick = () => {
  if (tut) closeTutorial();
  clearHint();
  if (run && running && run.mode === "zen") {
    // Zen never ends on its own: leaving is the end of the session
    profile.best.zen = Math.max(profile.best.zen || 0, run.score);
    profile.best.zenLines = Math.max(profile.best.zenLines || 0, zenLines);
    questBump("best", run.score);
    checkTrophies();
  }
  saveRun(true);
  running = false; accepting = false; stopTicker();
  showHome();
};

$("statsbtn").onclick = showStats;
$("install-go").onclick = async () => {
  if (!$("install-ios").hidden) { await installer.snooze(); $("install").hidden = true; return; }
  const outcome = await installer.install();
  if (outcome === "accepted") toast({ icon: "📲", kicker: "Installed", title: "Timberblock is on your home screen", text: "See you tomorrow for the next board." });
  renderInstall();
};
$("install-later").onclick = async () => { await installer.snooze(); $("install").hidden = true; };
$("m-archive").onclick = () => { audio.unlock(); firstTime(() => showArchive()); };
$("arch-back").onclick = () => showHome();
$("arch-more").onclick = () => { archiveShown += ARCHIVE_PAGE; showArchive(false); };
$("m-season").onclick = () => { audio.unlock(); runStart = Date.now(); firstTime(startSeason); };
$("pw-rotate").onclick = armRotate;
$("pw-swap").onclick = useSwap;
$("pw-undo").onclick = useUndo;
$("rs-swap").onclick = useSwap;
$("rs-undo").onclick = useUndo;
$("rs-rotate").onclick = () => { $("rescue").hidden = true; accepting = true; armRotate(); };
$("rs-giveup").onclick = giveUp;
// in rotate mode, tapping a tray piece turns it instead of picking it up
$("tray").addEventListener("pointerdown", (e) => {
  if (powerMode !== "rotate") return;
  const sl = e.target.closest(".slot");
  const pc = sl && sl.querySelector(".piece");
  if (pc) rotateSlot(+pc.dataset.slot);
});
addEventListener("keydown", (e) => {
  if ($("s-play").hidden || e.ctrlKey || e.metaKey || e.altKey || !powersOn()) return;
  if (/^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || "")) return;
  const k = e.key.toLowerCase();
  if (powerMode === "rotate" && (k === "1" || k === "2" || k === "3")) {
    if (run.tray[+k - 1]) rotateSlot(+k - 1);
    e.preventDefault(); e.stopImmediatePropagation();
    return;
  }
  if (k === "u") { useUndo(); e.preventDefault(); }
  else if (k === "r" && accepting) { armRotate(); e.preventDefault(); }
  else if (k === "s" && e.shiftKey) { useSwap(); e.preventDefault(); }
});
$("lg-create").onclick = async () => {
  const name = $("lg-name").value.trim();
  if (name.length < 2) { $("err-lg").textContent = LEAGUE_ERRORS.name; return; }
  const r = await leagueAction(async () => leagues.create(name, await boardName()));
  if (!r) return;
  profile.league = r.code;
  persist(true);
  renderLeague();
  toast({ icon: "👥", kicker: "League created", title: name, text: `Share the code ${r.code} with your friends.` });
};
$("lg-join").onclick = async () => {
  const code = $("lg-join-code").value.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) { $("err-lg").textContent = LEAGUE_ERRORS.code; return; }
  const r = await leagueAction(async () => leagues.join(code, await boardName()));
  if (!r) return;
  profile.league = r.code;
  persist(true);
  renderLeague();
  toast({ icon: "👥", kicker: "Joined", title: r.name, text: "Your Daily Seed scores now count here." });
};
$("lg-invite").onclick = async (e) => {
  const link = leagueLink(profile.league);
  const text = `Join my Timberblock league! Code ${profile.league}: ${link}`;
  if (navigator.share) { try { await navigator.share({ title: "Timberblock league", text }); return; } catch (err) { /* fall through */ } }
  copy(text, e.currentTarget);
};
$("lg-leave").onclick = async () => {
  const code = profile.league;
  await leagues.leave(code);
  profile.league = null;
  persist(true);
  renderLeague();
};
$("m-adv").onclick = () => { audio.unlock(); firstTime(showMap); };
$("map-back").onclick = () => showHome();
$("map-play").onclick = () => { audio.unlock(); runStart = Date.now(); startAdventure(); };
$("m-event").onclick = () => { audio.unlock(); runStart = Date.now(); firstTime(startEvent); };
$("adv-next").onclick = () => { $("advover").hidden = true; runStart = Date.now(); startAdventure(adv.lv.n + 1); };
$("adv-retry").onclick = () => { $("advover").hidden = true; runStart = Date.now(); startAdventure(adv.lv.n); };
$("adv-menu").onclick = () => { $("advover").hidden = true; showMap(); };
$("stats-back").onclick = () => showHome();
for (const b of document.querySelectorAll("#lb-home [data-scope]")) b.onclick = () => setScope(b.dataset.scope);
$("hint").onclick = showHint;
$("tray").addEventListener("pointerdown", clearHint);

$("set-sound").onchange = () => { if ($("set-sound").checked !== audio.isEnabled()) soundBtn.click(); };
$("set-cb").onchange = () => {
  profile.settings.cb = $("set-cb").checked;
  applySettings(); persist(false);
  if (run) { board.syncAll(run.grid); renderTray($("tray"), run, theme); }
};
$("set-big").onchange = () => {
  profile.settings.big = $("set-big").checked;
  applySettings(); persist(false);
};
$("set-haptics").onchange = () => {
  profile.settings.haptics = $("set-haptics").checked;
  applySettings(); persist(false);
  if (profile.settings.haptics) tap("medium");
};
$("set-remind").onchange = async () => {
  const want = $("set-remind").checked;
  const okay = await setReminder(want, {
    title: "Today's Timberblock board is live",
    body: "One attempt, same board for everyone. Keep your streak going.",
  });
  profile.settings.remind = want && okay;
  $("set-remind").checked = profile.settings.remind;
  if (want && !okay) toast({ icon: "🔕", kicker: "Reminder", title: "Notifications are off", text: "Allow them in your phone's settings to get the daily reminder." });
  persist(false);
};

attachKeys({
  board,
  trayEl: $("tray"),
  getRun: () => run,
  canPlay: () => accepting && !!run && !powerMode,
  isPlaying: () => !$("s-play").hidden,
  onDrop,
  onHint: showHint,
});

// Rotating a phone or resizing a laptop window can move the tray from under
// the board to beside it; re-measure the pieces for their new room.
let resizeT = 0;
addEventListener("resize", () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    if (run && !$("s-play").hidden) { renderTray($("tray"), run, theme); fx.resize(); }
  }, 120);
});

const soundBtn = $("sound");
function paintSound() {
  const on = audio.isEnabled();
  soundBtn.querySelector(".sr").textContent = on ? "Sound on" : "Sound off";
  soundBtn.setAttribute("aria-pressed", String(on));
  soundBtn.classList.toggle("off", !on);
}
soundBtn.onclick = async () => {
  const on = !audio.isEnabled();
  audio.setEnabled(on);
  paintSound();
  $("set-sound").checked = on;
  await store.set(store.KEYS.sound, on);
};

/* ── boot ────────────────────────────────────────────────────────── */
(async function boot() {
  const skin = (await store.get(store.KEYS.skin)) || DEFAULT_THEME;
  theme = applyTheme(skin);
  board.setTheme(theme);
  audio.setVoice(theme.id);

  installer.initInstall(() => { if (profile && !$("s-home").hidden) renderInstall(); });
  await installer.noteVisit();
  tutorialSeen = !!(await store.get(store.KEYS.tutorial));
  const soundOn = await store.get(store.KEYS.sound, true);
  audio.setEnabled(soundOn !== false);
  paintSound();

  await initDevice({ onPause: () => saveRun(true), statusBarColor: theme.statusBar });
  onBack(() => {
    if (!$("s-play").hidden) $("quit").click();
    else if (!$("s-stats").hidden || !$("s-map").hidden || !$("s-archive").hidden) showHome();
    else if (!$("s-home").hidden) { /* stay */ }
  });

  const incoming = challengeFromLocation();
  // league invites arrive as /#lg=CODE: on first load, or into an open tab
  const takeInvite = () => {
    const code = (/[#&]lg=([A-Za-z2-9]{6})/.exec(location.hash) || [])[1];
    if (!code) return;
    $("lg-join-code").value = code.toUpperCase();
    try { history.replaceState(null, "", location.pathname); } catch (e) { /* file:// */ }
    setTimeout(() => toast({ icon: "👥", kicker: "League invite", title: code.toUpperCase(),
      text: "Tap Join in the Friends league card to enter." }), 600);
  };
  takeInvite();
  addEventListener("hashchange", takeInvite);

  // "Play this board" on a /daily/<n> page lands here as /#day=<n>
  let dayLink = +((/[#&]day=(\d{1,5})/.exec(location.hash) || [])[1] || 0) || null;
  if (dayLink) { try { history.replaceState(null, "", location.pathname); } catch (e) { /* file:// */ } }
  /** Home, then straight into the linked board if there was one. */
  const land = () => {
    showHome();
    const n = dayLink;
    dayLink = null;
    if (!n) return;
    const today = dayNumber(dateKey());
    if (n === today) {
      if (playedToday()) fx.banner(`Played · next board in ${untilNextLabel()}`);
      else { runStart = Date.now(); firstTime(() => (todaysSave() ? resumeRun() : startDaily())); }
    } else if (n >= 1 && n < today) {
      runStart = Date.now();
      firstTime(() => startArchive(dateOfDay(n)));
    }
  };

  gate("pick");
  show("gate");
  paintSwatches();
  initAds();

  lb.retry().then((view) => {
    if (view && view.date === dateKey()) { lbData = view; lbState = "ok"; renderBoards(); }
  });

  cloud = await getCloud();
  // Restore a session, else a local profile, else stay on the gate.
  const sid = await store.get(store.KEYS.session);
  if (sid && cloud) {
    const d = await cloud.load(sid).catch(() => null);
    if (d) {
      profile = migrate(d); profileId = sid;
      if (profile.skin && profile.skin !== theme.id) await selectSkin(profile.skin);
      land();
      return;
    }
  }
  const local = await store.get(store.KEYS.profile);
  if (local) {
    profile = migrate(local); profileId = "local";
    if (incoming) offerChallenge(incoming);
    land();
    return;
  }

  // A first-time visitor arriving from a challenge link or a daily-puzzle
  // page should land on the board, not on a sign-up wall. Take them in as a
  // guest and go straight there.
  if (incoming || dayLink) {
    profile = migrate(blankProfile("Guest"));
    profile.guest = true;
    profileId = "local";
    if (incoming) offerChallenge(incoming);
    await persist(true);
    land();
  }
})();
