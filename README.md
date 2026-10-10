# Timberblock

A block puzzle for iOS, Android and the web. One codebase, three build targets.

## Layout

    src/game/      pure logic, no DOM, no browser APIs  <- also runs on the server
      rng.js       seeded PRNG (deterministic, serializable)
      shapes.js    polyomino families + weighted draw
      board.js     grid, legality, line detection
      scoring.js   points and combo maths
      modes.js     classic + professional curves
      run.js       the engine: one run, its move log, its snapshot
    src/ui/        everything that touches the DOM
    src/platform/  storage, haptics, app lifecycle, audio (web + native)
    src/net/       cloud sync adapters
    server/        reference replay verifier (imports src/game unchanged)

The hard rule: `src/game/` never imports from `src/ui/` or `src/platform/`.
That is what lets the server replay a run with the exact code the client ran.

## Develop

    npm install
    npm run dev

## Build

    npm run build          # dist/        -> Capacitor wraps this
    npm run build:single   # dist-single/ -> one self-contained .html

## Native

    npx cap add android
    npx cap add ios        # macOS only
    npm run android        # build + sync + open Android Studio
    npm run ios            # build + sync + open Xcode

## Verify a run server-side

    npm run verify

Replays a submitted `{seed, moves}` through the same engine the client used and
returns the authoritative score. See `server/verify.js`.

## Determinism

`Math.random()` appears nowhere in `src/game/`. Every piece a player is dealt
comes from `Rng`, seeded once per run. Given the seed and the move list, the run
is exactly reproducible - which is the whole basis of server-side cheat
detection. Do not break this.

## Daily Seed

`src/game/daily.js` derives the day's seed from the **UTC date** with FNV-1a
over a salted key. No network call is needed for every player on earth to agree
on today's board — which is why the feature works offline and costs nothing to
host.

    dateKey()   -> "2026-09-07"
    dayNumber() -> 250
    dailySeed() -> a stable 32-bit seed for that date

`EPOCH_UTC` in that file is Day 1. **Never change it after launch** — it would
renumber every share card ever posted.

One attempt per board. An unfinished daily run is resumable (the save carries
`dailyDate`); a finished one locks until the next UTC midnight. Streaks count
consecutive days played.

## Daily leaderboard

`GET/POST /api/daily`, served by `netlify/functions/daily.mjs`, a thin wrapper
around `server/leaderboard.js`. When a daily run ends, the client posts its
moves. The server replays them against that day's seed with `verifyRun`, and
stores only the replayed score. Fabricated scores, another day's seed, and
bot-like timing are all rejected. One entry per player per board is enforced
with a create-only write.

Storage is Netlify Blobs (store `leaderboard`, strong consistency). There is
nothing to configure: it works on deploy. Per day it holds one entry per
player, plus one board record (top 100, a score histogram for percentiles,
and a count).

- `npm run dev` serves the same handler from memory (see `vite.config.js`), so
  the board works locally and in the e2e tests. It resets on restart.
- `node tests/leaderboard.mjs` runs the server tests, no browser needed.
- Players are anonymous ids stored on the device (`tb.player`). Guests show
  as "Guest XXXX".
- The single board record is the write hotspot. It is fine at launch scale,
  but at sustained high traffic (many finishes per second), move to a
  database with an indexed score column.

### Week and all-time boards

Every verified daily also rolls up into two more boards, served by the same
endpoint with `?scope=week` or `?scope=all`:

- **This week** (`bw/<ISO week>`): each player's daily scores added up,
  Monday to Sunday. Turning up every day beats one lucky board.
- **All-time** (`ba`): each player's best single daily.

Per-player running values live in `w/<week>/<id>` and `a/<id>`. A player's
new value replaces their old row (`upsertBoard`).

## New players

- **Tutorial** (`src/ui/tutorial.js`): three scripted boards (fill a row,
  fill a column, both at once) with an animated hand. It runs once, before
  whatever a new player picks first. It can be skipped, and replayed from
  the "Tutorial" link on home. Seen-state is stored in `tb.tutorial`.
- **Gentle first games**: a player's first 3 Classic games use
  `new Run({ gentle: true })`. For the first 30 placements the engine deals
  no 3×3 slabs, five-longs, big corners or 2×3 blocks, and prefers hands
  where some piece can complete a line. Dealing still comes only from the
  run's `Rng`, `gentle` is recorded in snapshots and submissions, and
  challenge links carry it, so replays and friends' boards match exactly.
  The daily is never gentle.

## Progression

- **Achievements** (`src/game/achievements.js`): 28 of them. Each is a test
  on the profile (lifetime `stats`, bests, streaks), so earning is
  "is this now true?" with no event bookkeeping. Toasts come from
  `src/ui/trophies.js`.
- **Earned skins**: Frost (finish a daily), Magma (×5 combo), Candy
  (3-day streak), Pixel (play 10 games) and Space (reach Adventure level 5).
  `unlock` in `ui/themes.js` names the achievement.
- **Stats & trophies** screen: lifetime numbers, the last 14 daily scores,
  and every trophy with how to earn it.
- **Streak freezes** (`advanceStreak` in `src/game/daily.js`): players start
  with 1 and earn 1 every 7-day milestone, holding at most 2. Missed days
  spend freezes instead of breaking the streak, and home warns when one is
  about to be used.

## Play aids and modes

- **Zen**: never ends. When nothing fits, the fullest rows dissolve (no
  points), deterministically (`Run.relieve`).
- **Hints** (`src/game/hint.js`): 3 per game in Classic, Professional and
  Zen. Off on the daily and on challenges, so shared boards stay fair.
- **Keyboard** (`src/ui/keys.js`): 1/2/3 to pick a piece, arrows (or WASD)
  to move, Enter or Space to place, Esc to cancel, H for a hint.
- **Settings**: sound, colorblind symbols (a shape per colour on every
  block), bigger tray pieces, vibration (also on Android browsers), and, in the apps only, a
  7 pm daily reminder via `@capacitor/local-notifications`. Reminders are
  scheduled on the device, with no push server. Run `npx cap sync` after
  installing.

## Adventure

`src/game/adventure.js` generates level *n* from its number, so there is no
level data to ship and the map never ends. Level 12 is the same for everyone.
Goal types rotate: clear N lines, reach a score, collect gems (clear the row
or column under each gem), and clear lines on a board full of stone. Each goal
has a move budget, and a win earns 1–3 stars for moves left over (40%+ spare
is 3 stars, 15%+ is 2). Score targets are set at 8 points per move, rising to
11.5, against about 12 for solid play. The hint bot wins about 33 of the first
40 levels. Hints are allowed and steer toward gems.

The home card opens the **level map**: chapters of 7, stars on every finished
level, an icon for each goal type, and the next level highlighted. Any
finished level can be replayed for more stars.

## Power-ups

Rotate (turn a tray piece 90°), Swap (deal three new pieces) and Undo (take
back the last placement, up to 5 deep). They work in Classic, Zen and
Adventure only: daily, events, challenges and Professional stay pure skill.

- Rotate and Swap are engine moves (`Run.rotate`, `Run.swap`), logged as
  `[slot, -1, 0, t]` and `[0, -2, 0, t]`. `Run.apply` replays them, so replay
  videos stay exact. `verify.js` replays with `place()` only, so a verified
  board containing a power-up fails as `illegal_move`.
- Undo restores a snapshot taken before the placement (dealer state
  included), so it leaves nothing in the move log.
- **Rescue:** running out of room in those modes opens "Stuck!" instead of
  game over, offering Swap, Undo, or Rotate (only when turning a piece would
  make it fit).
- **Earning:** everyone starts with 3 of each, gets +1 Undo per finished
  Daily Seed, and +1 power-up per new Adventure star.
- **Keys:** R arms rotate (then 1/2/3 or click a piece), U undoes, Shift+S swaps.

## Daily quests

`src/game/quests.js`: three goals a day (easy, medium and hard), chosen from
the date, so everyone shares them, with no two on the same metric. Progress
counts across every mode: lines, multi-line clears, combos, board clears,
pieces placed, games, best single score, Adventure wins, the Daily, events
and archive boards. Each finished quest pays power-ups (easy +Undo, medium
+Swap, hard +Rotate +Undo), and finishing all three pays one of each. Quests
reset at UTC midnight with the daily board.

## Puzzle archive

Every past Daily Seed, replayed from `dailySeed(date)` as unranked practice
(`mode: "archive"`) with unlimited tries. It doesn't touch the streak, the
leaderboards or today's attempt. Hints are allowed; power-ups aren't, so
practice matches the real thing. Each row shows the original daily score
and rank, plus the best practice score (`profile.archiveBest`).

## Seasons

`src/game/seasons.js` lists limited-time seasons, each with a UTC date window,
a board with its own `rules`, and a skin:

- **Halloween Night**, 17–31 Oct 2026: tombstones on the board, a stronger
  combo bonus, and the Spooky skin.
- **Festival of Lights** (Diwali), 1–15 Nov 2026: small pieces, double
  combos, and the Diya skin.

Playing the season's board while it runs unlocks its skin for good. Outside
the window, an unearned seasonal skin is hidden rather than shown locked. To
add next year's seasons, append to `SEASONS`; nothing else changes. To
preview one locally, open `http://localhost:5173/?season=halloween2026`
(the switch only works on localhost).

## Growth

### Daily puzzle pages (for search engines)

`server/pages.js` behind `netlify/functions/pages.mjs` server-renders three
routes, and the CDN caches them:

- `/daily/<n>`: one page per Daily Seed. It shows the date, players, top
  score, typical (median) score, a difficulty rating from that median, the
  opening hand drawn from the day's seed, the top 10, and prev/next links.
  The **Play this board** button links to `/#day=<n>`, which the game opens
  as that exact board (today's daily, or the archive for past days),
  creating a guest profile for first-time visitors. Cached for 5 minutes
  (today), 1 hour (yesterday) or 1 day (older).
- `/daily/`: the last 60 days.
- `/sitemap-daily.xml`: every day so far, listed in `robots.txt` alongside
  `sitemap.xml`.

After deploying, submit `https://timberblock.online/sitemap-daily.xml` in
Google Search Console so the pages get indexed sooner.

### Install prompt

`src/ui/install.js`. From a player's second day, the home screen offers to
install the game. Chrome, Edge and Android get the browser's one-tap dialog
(`beforeinstallprompt`); iPhone and iPad Safari get the Share → Add to Home
Screen steps. It never shows during play, in the native apps or once
installed, and "Not now" snoozes it for 14 days (`tb.install`). The manifest
allows any orientation, so the installed app keeps the landscape layout.

### Share cards

`src/ui/sharecard.js` draws a tall 1080×1920 card on phones (for WhatsApp
Status and Stories) and a square one elsewhere. Each card has a headline
badge (`cardBadge()` in `main.js`) that only shows good news: #1, a top-10
rank among 10+ players, beating 50%+ of the field, a new personal best, or
beating a friend's challenge. Otherwise it shows the streak, or "Same board
for everyone. Can you beat me?". Every card ends with a call to play.

## Weekly event

`src/game/events.js`: one twist per ISO week, rotating between Stone Garden
(stones on the board), Tiny Pieces, Combo Fever (each combo step is worth
double) and Giants (big pieces only). Everyone plays the same event board all
week, with unlimited attempts. The twist is a `rules` object on the `Run`, so
the server replays an event run with exactly those rules and keeps each
player's best (`be/<week>`, `POST /api/daily` with `kind: "event"`).

## Friends leagues

`server/leagues.js` behind `/api/league`. A league is a 6-character code and
up to 50 members. Its standings are computed on read from each member's
verified weekly total (`w/<week>/<id>`), so leagues add no scoring writes and
no unverified score can get in. Invite links are `/#lg=CODE`.

## Analytics

`server/analytics.js` behind `POST /api/ping` and `GET /api/stats`. Once a day
the client sends its anonymous player id and the date it first played, and
nothing else. The server counts daily players, new players, and day-1 and
day-7 returners. Read the numbers at **/stats.html** (not indexed). These are
the numbers to watch before building anything else.

## Replay video

`src/ui/replay.js` re-simulates a finished run from its seed and moves,
draws it to a 720×720 canvas, and records it with `MediaRecorder` (MP4 where
supported, WebM otherwise), capped at about 14 seconds. It then shares the
file through the native share sheet, or downloads it. The Video button only
appears where recording is supported.

## Not built (needs accounts or services only you can set up)

- **Rewarded ads / "watch an ad to continue"**: needs an ad network account
  (AdMob for the apps, Google Ad Manager rewarded units for the web).
- **In-app purchases** (skin packs, remove ads): needs Google Play and App
  Store developer accounts, plus a purchases plugin such as RevenueCat.
- **Live head-to-head**: needs a realtime server (WebSockets). Netlify
  Functions can't hold connections open. Challenge links already give
  asynchronous duels.
- **Translations**: the strings need extracting into a language system, and
  each language needs a native speaker to check it.

## Tests

    node tests/engine.mjs        # engine, gentle dealing, Zen, hints, streaks, events, adventure
    node tests/leaderboard.mjs   # server: verification and all three boards
    npm run test:e2e             # the browser suite (needs `npm run dev`)

Don't edit `src/` while the browser suite runs. The dev server reloads open
pages on every save, which breaks tests mid-step.

## Share card

`src/ui/sharecard.js` renders the finished board to a 1080x1080 PNG: day
number, score, the board itself in the active theme, streak, and the site URL.
Delivery is native share sheet with the image where supported (phones), a
download everywhere else, and the canvas is always shown in the overlay as a
last resort.

## Web deployment

    npm run icons     # regenerate PWA icons from code (no image editor needed)
    npm run build     # -> dist/

`dist/` is a static site. It ships a web manifest, a service worker (offline +
installable), `robots.txt`, `sitemap.xml`, `ads.txt`, security headers in
`_headers`, an SPA fallback in `_redirects`, and a privacy policy at
`/privacy.html`.

**Cloudflare Pages** (recommended, free tier, global): connect the repo, build
command `npm run build`, output directory `dist`. `_headers` and `_redirects`
are read automatically.

**Netlify**: `netlify.toml` is already configured; connect the repo or drag
`dist/` onto the dashboard.

Before going live, in this order:

1. Set `SITE_URL` in `src/config.js` to your real domain. It feeds the share
   text, the share card footer and the sitemap.
2. Search and replace `timberblock.game` in `public/robots.txt`,
   `public/sitemap.xml` and the OG tags in `index.html`.
3. Put a real contact address in `public/privacy.html`.
4. Deploy, verify the site works, then apply to AdSense.
5. Only once approved: set `ADS_ENABLED`, `ADSENSE_CLIENT` and
   `ADSENSE_SLOT_MENU` in `src/config.js`, and put your publisher id in
   `public/ads.txt`. Enable Google's consent management in the AdSense console
   before serving personalised ads in the EEA/UK.
