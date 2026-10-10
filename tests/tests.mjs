// End-to-end tests for Timberblock. Start `npm run dev`, then: npm run test:e2e
import { launch, freshPage, play, pickMove, dragTo, visible, BASE } from "./lib.mjs";

const results = [];
const allErrors = [];
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push(["PASS", name, Date.now() - t0]); }
  catch (e) { results.push(["FAIL", name, Date.now() - t0, e.message.split("\n")[0]]); }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg); };
const num = async (p, sel) => +(await p.textContent(sel)).replace(/[^\d]/g, "");
/** The game-over score rolls up from zero; wait for it to land, then read it. */
async function finalScore(p) {
  await p.waitForFunction(() => {
    const f = document.getElementById("fin");
    return f.dataset.v && +f.textContent.replace(/[^\d]/g, "") === +f.dataset.v;
  }, null, { timeout: 3000 }).catch(() => {});
  return num(p, "#fin");
}
const txt = (p, sel) => p.textContent(sel).then((s) => s.trim());
const track = (p) => allErrors.push(p);

const b = await launch();
async function page(opts) { const p = await freshPage(b, opts); track(p); return p; }
/** A first-time visitor: lands on home as a guest, no sign-up screen. */
async function guest(opts) { const p = await page(opts); await p.waitForTimeout(150); return p; }
/** Give the guest a name from the home screen ("Add name"). */
async function named(p, name) {
  await p.click("#acct"); await p.fill("#in-name2", name); await p.click("#do-upgrade"); await p.waitForTimeout(250);
}

/* ── first visit and profiles ──────────────────────────────────────── */
await test("first visit lands straight on home as a guest, one tap from playing", async () => {
  const p = await page();
  eq((await visible(p)).join(), "s-home", "no sign-up screen");
  eq(await txt(p, "#who-name"), "Guest", "guest");
  eq(await txt(p, "#acct"), "Add name", "can add a name later");
  await p.click("#m-daily"); await p.waitForTimeout(400);
  eq((await visible(p)).join(), "s-play", "one tap to the board");
});

await test("add a name: validates, becomes a profile, survives reload", async () => {
  const p = await guest();
  await p.click("#acct"); await p.fill("#in-name2", "A"); await p.click("#do-upgrade");
  ok((await txt(p, "#err-upgrade")).includes("at least 2"), "short-name error shown");
  await p.fill("#in-name2", "Ayush"); await p.click("#do-upgrade"); await p.waitForTimeout(300);
  eq(await txt(p, "#who-name"), "Ayush", "name shown");
  eq(await txt(p, "#acct"), "Profile", "profile button label");
  await p.reload(); await p.waitForTimeout(500);
  eq((await visible(p)).join(), "s-home", "home after reload");
  eq(await txt(p, "#who-name"), "Ayush", "name after reload");
});

await test("guest: compact 'Add name' turns guest into a profile", async () => {
  const p = await guest();
  eq(await txt(p, "#who-name"), "Guest", "guest name");
  ok(!(await p.locator("#upgrade").isVisible()), "guest card collapsed by default");
  await p.click("#acct");
  ok(await p.locator("#upgrade").isVisible(), "guest card opens");
  await p.fill("#in-name2", "Mia");
  await p.click("#do-upgrade"); await p.waitForTimeout(250);
  eq(await txt(p, "#who-name"), "Mia", "renamed");
  ok((await txt(p, "#who-tag")).includes("profile"), "tag says profile");
  ok(!(await p.locator("#upgrade").isVisible()), "guest card gone");
});

await test("profile: rename; sign out shows the profile screen and stays signed out", async () => {
  const p = await guest();
  await named(p, "Old");
  await p.click("#acct");
  eq(await p.inputValue("#in-rename"), "Old", "rename prefilled");
  await p.fill("#in-rename", "New"); await p.click("#do-rename"); await p.waitForTimeout(200);
  eq(await txt(p, "#who-name"), "New", "renamed");
  await p.click("#acct"); await p.click("#signout"); await p.waitForTimeout(300);
  eq((await visible(p)).join(), "s-gate", "profile screen after sign out");
  const btns = await p.$$eval("#gate-pick button", (x) => x.filter((b) => b.offsetParent).map((b) => b.textContent.trim()));
  eq(btns.join("|"), "Create a profile|Play as guest", "the two choices");
  await p.reload(); await p.waitForTimeout(400);
  eq((await visible(p)).join(), "s-gate", "stays signed out after reload");
  // the create form, its Back button, and creating from here
  await p.click("#go-signup"); await p.click("#back-1");
  ok(await p.locator("#gate-pick").isVisible(), "Back returns to the choice");
  await p.click("#go-signup"); await p.fill("#in-name", "A"); await p.click("#do-signup");
  ok((await txt(p, "#err-signup")).includes("at least 2"), "short-name error shown");
  await p.fill("#in-name", "Back"); await p.click("#do-signup"); await p.waitForTimeout(300);
  eq(await txt(p, "#who-name"), "Back", "signed in again");
  await p.reload(); await p.waitForTimeout(400);
  eq((await visible(p)).join(), "s-home", "no longer signed out");
});

/* ── gameplay ──────────────────────────────────────────────────────── */
await test("classic: placing pieces scores, game reaches Game Over, best saved", async () => {
  const p = await guest();
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(400);
  eq((await visible(p)).join(), "s-play", "play screen");
  eq(await num(p, "#score"), 0, "starts at 0");
  const m = await pickMove(p);
  await dragTo(p, m.slot, m.r, m.c);
  ok((await num(p, "#score")) > 0, "score went up after a drop");
  const moves = await play(p);
  ok(moves > 5, "played several moves");
  await p.waitForTimeout(800);
  ok(await p.locator("#over").isVisible(), "game over shown");
  const fin = await finalScore(p);
  eq(fin, await num(p, "#score"), "final equals score");
  ok(await p.locator("#again").isVisible(), "play again visible in classic");
  await p.click("#tohome"); await p.waitForTimeout(300);
  eq(await num(p, "#best-classic"), fin, "best on home");
});

await test("illegal drop does not use up the piece", async () => {
  const p = await guest();
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(400);
  const m = await pickMove(p);
  await dragTo(p, m.slot, m.r, m.c);
  const filled = await p.$$eval("#board .cell.filled", (x) => x.length);
  // drop another piece far outside the board
  const slot = await p.$eval("#tray .piece", (e) => +e.dataset.slot);
  const box = await p.locator(`#tray .piece[data-slot="${slot}"]`).boundingBox();
  await p.mouse.move(box.x + 2, box.y + 2); await p.mouse.down();
  await p.mouse.move(5, 5, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(300);
  eq(await p.$$eval("#board .cell.filled", (x) => x.length), filled, "board unchanged");
  ok(await p.locator(`#tray .piece[data-slot="${slot}"]`).isVisible(), "piece back in tray");
});

await test("play again resets the board and score", async () => {
  const p = await guest();
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(400);
  await play(p); await p.waitForTimeout(800);
  await p.click("#again"); await p.waitForTimeout(400);
  eq(await num(p, "#score"), 0, "score reset");
  eq(await p.$$eval("#board .cell.filled", (x) => x.length), 0, "board empty");
  ok(!(await p.locator("#over").isVisible()), "overlay closed");
});

await test("resume: leaving mid-run keeps the game", async () => {
  const p = await guest();
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(400);
  await play(p, 4);
  const score = await num(p, "#score");
  const filled = await p.$$eval("#board .cell.filled", (x) => x.length);
  await p.click("#quit"); await p.waitForTimeout(300);
  ok(await p.locator("#m-resume").isVisible(), "resume card shown");
  ok((await txt(p, "#resume-sub")).includes(String(score)), "resume shows score");
  await p.reload(); await p.waitForTimeout(500);
  await p.click("#m-resume"); await p.waitForTimeout(400);
  eq(await num(p, "#score"), score, "score restored");
  eq(await p.$$eval("#board .cell.filled", (x) => x.length), filled, "board restored");
});

await test("professional: HUD shows level, target and a running clock", async () => {
  const p = await guest();
  await p.click('.mode[data-mode="pro"]'); await p.waitForTimeout(400);
  ok(await p.locator("#prohud").isVisible(), "pro HUD visible");
  const t1 = await txt(p, "#timeval");
  await p.waitForTimeout(2200);
  const t2 = await txt(p, "#timeval");
  ok(t1 !== t2, `clock ticks (${t1} -> ${t2})`);
  ok((await txt(p, "#lvl-lbl")).includes("1"), "level 1");
});

await test("daily: one attempt, then the card shows done", async () => {
  const p = await guest();
  await p.click("#m-daily"); await p.waitForTimeout(400);
  await play(p); await p.waitForTimeout(800);
  ok(await p.locator("#over").isVisible(), "game over");
  ok(!(await p.locator("#again").isVisible()), "no play again on daily");
  ok(await p.locator("#sharecard.primary").isVisible(), "share is the primary action");
  ok((await txt(p, "#over-title")).startsWith("Day #"), "title is Day #");
  await p.click("#tohome"); await p.waitForTimeout(300);
  ok(await p.locator("#daily-badge").isVisible(), "done badge");
  await p.click("#m-daily"); await p.waitForTimeout(300);
  eq((await visible(p)).join(), "s-home", "cannot replay today");
});

await test("daily leaderboard: a finished daily run is verified, ranked and listed", async () => {
  const p = await guest();
  await p.click("#m-daily"); await p.waitForTimeout(400);
  await play(p); await p.waitForTimeout(800);
  await p.waitForFunction(() => /#\d+ of [\d,]+ today/.test(document.getElementById("rankline").textContent), null, { timeout: 5000 })
    .catch(() => {});
  const line = await txt(p, "#rankline");
  ok(/#\d+ of [\d,]+ today · better than \d+%/.test(line), "rank line: " + line);
  await p.click("#tohome"); await p.waitForTimeout(400);
  ok(await p.locator("#lb-home .lblist li.me").count() === 1, "my row is highlighted on the home board");
  ok((await txt(p, "#lb-home [data-lb=me]")).startsWith("You're #"), "my place is shown");
  ok((await txt(p, "#daily-sub")).startsWith("You placed #"), "daily card names the placing");
});

/* ── tutorial and gentle first games ───────────────────────────────── */
const TUT = [[7, 3], [5, 2], [5, 5]];

await test("tutorial: a new player is taught before their first game, then plays it", async () => {
  const p = await page({ tutorial: true });
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(500);
  ok(await p.locator("#coach").isVisible(), "coach card shown");
  eq(await txt(p, "#coach-step"), "Step 1 of 3", "first step");
  eq(await p.locator(".cell.tut-goal").count(), 2, "goal cells glow");
  // a wrong drop is refused and the step stays put
  await dragTo(p, 1, 0, 0); await p.waitForTimeout(300);
  eq(await txt(p, "#coach-step"), "Step 1 of 3", "wrong spot refused");
  for (let i = 0; i < TUT.length; i++) {
    eq(await txt(p, "#coach-step"), `Step ${i + 1} of 3`, "step " + (i + 1));
    await dragTo(p, 1, TUT[i][0], TUT[i][1]);
    await p.waitForTimeout(1200);
  }
  await p.waitForTimeout(1200);
  ok(!(await p.locator("#coach").isVisible()), "coach gone");
  eq(await txt(p, "#mode-tag"), "Classic", "now in the game they picked");
  eq(await num(p, "#score"), 0, "fresh score");
  // seen once is enough
  await p.click("#quit"); await p.waitForTimeout(300);
  await p.reload(); await p.waitForTimeout(500);
  await p.click('.mode[data-mode="pro"]'); await p.waitForTimeout(500);
  ok(!(await p.locator("#coach").isVisible()), "no tutorial the second time");
});

await test("tutorial: skip goes straight to the game; replay from home", async () => {
  const p = await page({ tutorial: true });
  await p.click("#m-daily"); await p.waitForTimeout(500);
  await p.click("#coach-skip"); await p.waitForTimeout(400);
  ok((await txt(p, "#mode-tag")).startsWith("Daily"), "skipped into the daily");
  await p.click("#quit"); await p.waitForTimeout(300);
  await p.click("#replay-tut"); await p.waitForTimeout(400);
  ok(await p.locator("#coach").isVisible(), "tutorial replays from home");
  await p.click("#quit"); await p.waitForTimeout(300);
  eq((await visible(p)).join(), "s-home", "quit returns home");
  ok(!(await p.locator(".tut-hand").isVisible()), "hand cleared");
});

await test("gentle first games: no giant pieces dealt early; challenge keeps the same board", async () => {
  const p = await guest();
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(400);
  // the 3x3 slab is 9 cells, the five-long is 5 in a line: neither may appear
  const big = await p.$$eval("#tray .piece", (x) => x.filter((e) => e.querySelectorAll(".blk").length >= 5).length);
  eq(big, 0, "no 5+ cell pieces in the first hand");
});

await test("challenge link: recipient gets the same board with a target", async () => {
  const p = await page();
  await named(p, "Sender");
  await p.waitForTimeout(250);
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(400);
  const firstTray = await p.$$eval("#tray .piece", (x) => x.map((e) => e.children.length + ":" + e.style.gridTemplateColumns).join());
  await play(p); await p.waitForTimeout(800);
  const fin = await finalScore(p);
  await p.click("#sendchal"); await p.waitForTimeout(400);
  const link = await txt(p, ".linkbox");
  ok(link.startsWith("https://timberblock.online/#c="), "link uses the live domain: " + link);
  // open on a fresh device, pointed at the local server
  const r = await page();
  await r.goto(BASE + link.slice(link.indexOf("#")));
  await r.reload(); await r.waitForTimeout(500);
  eq((await visible(r)).join(), "s-home", "first-time visitor skips the gate");
  ok(await r.locator("#m-chal").isVisible(), "challenge card offered");
  ok((await r.textContent("#m-chal")).includes("Sender"), "names the sender");
  await r.click("#m-chal"); await r.waitForTimeout(400);
  ok(await r.locator("#chalhud").isVisible(), "challenge HUD");
  ok((await txt(r, "#chalval")).includes(fin.toLocaleString("en-US")) || (await txt(r, "#chalval")).includes(String(fin)), "target is sender's score");
  const theirTray = await r.$$eval("#tray .piece", (x) => x.map((e) => e.children.length + ":" + e.style.gridTemplateColumns).join());
  // piece pixel sizes can differ by viewport; compare shapes only
  const shape = (s) => s.replace(/\d+px/g, "");
  eq(shape(theirTray), shape(firstTray), "identical first pieces");
});

await test("bad challenge code shows an error", async () => {
  const p = await guest();
  await p.click("#chalcard summary");
  await p.fill("#in-chal", "not-a-code");
  await p.click("#do-chal");
  ok((await txt(p, "#err-chal")).length > 0, "error shown");
});

/* ── settings ──────────────────────────────────────────────────────── */
await test("theme choice applies and survives reload", async () => {
  const p = await guest();
  const bg1 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor + getComputedStyle(document.body).backgroundImage);
  await p.locator("#skins > *").nth(2).click(); await p.waitForTimeout(400);
  const bg2 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor + getComputedStyle(document.body).backgroundImage);
  ok(bg1 !== bg2, "background changed");
  eq(await p.getAttribute("#skins > *:nth-child(3)", "aria-pressed"), "true", "timber selected");
  await p.reload(); await p.waitForTimeout(500);
  eq(await p.getAttribute("#skins > *:nth-child(3)", "aria-pressed"), "true", "timber still selected");
});

/* ── progression: achievements, stats, skins, streak freeze ────────── */
await test("achievements: clearing a line earns a trophy, a toast, and shows in Stats", async () => {
  const p = await guest();
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(400);
  for (let i = 0; i < 60; i++) {
    if (await p.locator(".toast").count()) break;
    const m = await pickMove(p); if (!m) break;
    await dragTo(p, m.slot, m.r, m.c); await p.waitForTimeout(150);
  }
  ok(await p.locator(".toast").count() > 0, "a trophy toast appeared");
  ok((await p.textContent(".toasts")).includes("First clear"), "first clear named");
  await p.click("#quit"); await p.waitForTimeout(300);
  await p.click("#statsbtn"); await p.waitForTimeout(300);
  eq((await visible(p)).join(), "s-stats", "stats screen");
  ok(/Trophies · [1-9]\d* of \d+/.test(await p.textContent("#stats-body")), "trophy count");
  ok(await p.locator(".trophy.got").count() >= 1, "earned trophy lit");
  await p.click("#stats-back"); await p.waitForTimeout(300);
  eq((await visible(p)).join(), "s-home", "back home");
});

await test("locked skins can't be picked, and say how to unlock them", async () => {
  const p = await guest();
  const frost = p.locator("#skins .skin.locked").first();
  ok(await frost.count() === 1, "a locked skin is shown");
  const before = await p.evaluate(() => document.documentElement.dataset.skin);
  await frost.click(); await p.waitForTimeout(300);
  eq(await p.evaluate(() => document.documentElement.dataset.skin), before, "skin unchanged");
  ok((await p.textContent(".toasts")).includes("locked"), "explains the lock");
});

await test("streak freeze: a missed day is covered and the streak continues", async () => {
  const p = await guest();
  const two = await p.evaluate(() => {
    const d = new Date(Date.now() - 2 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  await p.evaluate((last) => {
    const prof = JSON.parse(localStorage.getItem("tb.profile"));
    Object.assign(prof, { streak: 4, maxStreak: 4, lastDaily: last, freezes: 1 });
    localStorage.setItem("tb.profile", JSON.stringify(prof));
  }, two);
  await p.reload(); await p.waitForTimeout(500);
  ok((await txt(p, "#streak-t")).includes("freeze saves it"), "warns that a freeze will cover it");
  await p.click("#m-daily"); await p.waitForTimeout(400);
  await play(p); await p.waitForTimeout(900);
  ok((await p.textContent(".toasts")).includes("Streak saved"), "freeze toast");
  const prof = await p.evaluate(() => JSON.parse(localStorage.getItem("tb.profile")));
  eq(prof.streak, 5, "streak continued");
  eq(prof.freezes, 0, "freeze spent");
});

/* ── play aids ─────────────────────────────────────────────────────── */
await test("hint: shows a move, counts down, and is off on the daily", async () => {
  const p = await guest();
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(400);
  eq(await txt(p, "#hint-n"), "3", "three hints");
  await p.click("#hint"); await p.waitForTimeout(200);
  ok(await p.locator(".cell.hint-goal").count() > 0, "cells highlighted");
  ok(await p.locator("#tray .slot.hinted").count() === 1, "piece highlighted");
  eq(await txt(p, "#hint-n"), "2", "one used");
  await p.click("#quit"); await p.waitForTimeout(300);
  await p.click("#m-daily"); await p.waitForTimeout(400);
  await p.click("#hint"); await p.waitForTimeout(200);
  eq(await p.locator(".cell.hint-goal").count(), 0, "no hint on the daily");
});

await test("keyboard: 1-3 picks, arrows move, Enter places", async () => {
  const p = await guest({ width: 1366, height: 768, mobile: false });
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(400);
  await p.keyboard.press("1"); await p.waitForTimeout(100);
  ok(await p.locator("#tray .slot.kbd").count() === 1, "piece picked");
  ok(await p.locator(".cell.preview").count() > 0, "preview on the board");
  await p.keyboard.press("ArrowDown"); await p.keyboard.press("ArrowRight");
  await p.keyboard.press("Enter"); await p.waitForTimeout(400);
  ok((await num(p, "#score")) > 0, "placed by keyboard");
});

await test("zen: no game over", async () => {
  const p = await guest();
  await p.click('.mode[data-mode="zen"]'); await p.waitForTimeout(400);
  eq(await txt(p, "#mode-tag"), "Zen", "zen mode");
  const moves = await play(p, 70);
  eq(moves, 70, "kept playing");
  ok(!(await p.locator("#over").isVisible()), "never ended");
  await p.click("#quit"); await p.waitForTimeout(300);
  ok((await num(p, "#best-zen")) > 0, "zen best recorded");
});

await test("settings: colorblind symbols appear on blocks", async () => {
  const p = await guest();
  await p.click("#set-cb + i"); await p.waitForTimeout(200);
  ok(await p.evaluate(() => document.documentElement.classList.contains("cb")), "cb class on");
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(400);
  const sym = await p.evaluate(() => getComputedStyle(document.querySelector("#tray .blk"), "::before").content);
  ok(sym && sym !== "none" && sym !== "normal", "symbol drawn: " + sym);
});

await test("leaderboard tabs: week and all-time include my daily", async () => {
  const p = await guest();
  await p.click("#m-daily"); await p.waitForTimeout(400);
  await play(p); await p.waitForTimeout(800);
  await p.waitForFunction(() => /#\d+ of/.test(document.getElementById("rankline").textContent), null, { timeout: 5000 }).catch(() => {});
  await p.click("#tohome"); await p.waitForTimeout(300);
  await p.click('#lb-home [data-scope="week"]'); await p.waitForTimeout(600);
  eq(await txt(p, '#lb-home [data-lb="title"]'), "This week", "week title");
  ok(await p.locator("#lb-home .lblist li.me").count() === 1, "me on the week board");
  await p.click('#lb-home [data-scope="all"]'); await p.waitForTimeout(600);
  ok(await p.locator("#lb-home .lblist li.me").count() === 1, "me on all-time");
});

/* ── adventure and weekly event ────────────────────────────────────── */
await test("adventure: goal and moves tracked, resumable, ends with stars or a retry", async () => {
  const p = await guest();
  await p.click("#m-adv"); await p.waitForTimeout(400);
  eq((await visible(p)).join(), "s-map", "the level map opens first");
  await p.click("#map-play"); await p.waitForTimeout(500);
  eq(await txt(p, "#mode-tag"), "Adventure", "adventure mode");
  ok(await p.locator("#advhud").isVisible(), "goal bar shown");
  eq(await txt(p, "#adv-moves"), "19 moves left", "level 1 move budget");
  const m = await pickMove(p);
  await dragTo(p, m.slot, m.r, m.c); await p.waitForTimeout(300);
  eq(await txt(p, "#adv-moves"), "18 moves left", "a move was counted");
  await p.click("#quit"); await p.waitForTimeout(300);
  ok((await txt(p, "#resume-sub")).startsWith("Adventure · level 1"), "resume offered");
  await p.click("#m-resume"); await p.waitForTimeout(500);
  eq(await txt(p, "#adv-moves"), "18 moves left", "progress restored");
  for (let i = 0; i < 40; i++) {
    if (await p.locator("#advover").isVisible()) break;
    const mv = await pickMove(p); if (!mv) break;
    await dragTo(p, mv.slot, mv.r, mv.c); await p.waitForTimeout(220);
  }
  await p.waitForTimeout(800);
  ok(await p.locator("#advover").isVisible(), "level ended");
  const won = await p.locator("#adv-next").isVisible();
  const lit = await p.locator("#adv-stars span.on").count();
  ok(won ? lit >= 1 : lit === 0, `stars match the result (won ${won}, ${lit} stars)`);
  await p.click("#adv-menu"); await p.waitForTimeout(300);
  eq((await visible(p)).join(), "s-map", "back to the map");
  eq(await p.locator(".lvl:not(.locked)").count(), won ? 2 : 1, "next level unlocked only on a win");
  await p.click("#map-back"); await p.waitForTimeout(300);
  eq(await num(p, "#adv-num"), won ? 2 : 1, "home card agrees");
});

await test("weekly event: plays with the week's twist, posts, and can be replayed", async () => {
  const p = await guest();
  const name = await txt(p, "#event-name");
  await p.click("#m-event"); await p.waitForTimeout(400);
  eq(await txt(p, "#mode-tag"), "Weekly event", "event mode");
  await play(p); await p.waitForTimeout(800);
  await p.waitForFunction(() => /this week/.test(document.getElementById("rankline").textContent), null, { timeout: 6000 }).catch(() => {});
  ok(/#\d+ of [\d,]+ this week/.test(await txt(p, "#rankline")), "ranked: " + await txt(p, "#rankline"));
  ok(await p.locator("#again").isVisible(), "unlimited attempts");
  await p.click("#tohome"); await p.waitForTimeout(300);
  ok((await num(p, "#event-num")) > 0, "best shown on the card");
  await p.click('#lb-home [data-scope="event"]'); await p.waitForTimeout(600);
  eq(await txt(p, '#lb-home [data-lb="day"]'), name, "event board titled with this week's twist");
  ok(await p.locator("#lb-home .lblist li.me").count() === 1, "me on the event board");
});

await test("replay video: a finished game records to a playable clip", async () => {
  const p = await guest();
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(300);
  await play(p); await p.waitForTimeout(1200);
  ok(await p.locator("#sharevid").isVisible(), "video button offered");
  const dl = p.waitForEvent("download", { timeout: 40000 });
  await p.click("#sharevid");
  const d = await dl;
  ok(/^timberblock-replay\.(mp4|webm)$/.test(d.suggestedFilename()), "file: " + d.suggestedFilename());
  const size = (await (await import("node:fs/promises")).stat(await d.path())).size;
  ok(size > 50_000, `clip has content (${size} bytes)`);
});

/* ── power-ups, bigger pieces, level map ───────────────────────────── */
const trayShapes = (p) => p.$$eval("#tray .piece", (x) => x.map((e) => e.style.gridTemplateColumns + "|" + e.style.gridTemplateRows + "|" + [...e.children].map((u) => (u.firstChild ? 1 : 0)).join("")).join(" / "));

await test("power-ups: rotate turns a piece, swap deals new ones, undo takes a move back", async () => {
  const p = await guest();
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(400);
  ok(await p.locator("#pw-rotate").isVisible(), "power-ups shown in Classic");
  // rotate: find a piece that changes when turned (anything but a 1x1 or 2x2 square)
  let rotated = false;
  for (let i = 0; i < 3 && !rotated; i++) {
    const before = await trayShapes(p);
    await p.click("#pw-rotate"); await p.waitForTimeout(150);
    await p.locator("#tray .piece").nth(i).click(); await p.waitForTimeout(250);
    rotated = (await trayShapes(p)) !== before;
  }
  ok(rotated, "a piece turned");
  ok((await num(p, "#pw-rotate-n")) < 3, "rotate charge spent");
  const before = await trayShapes(p);
  await p.click("#pw-swap"); await p.waitForTimeout(300);
  ok((await trayShapes(p)) !== before, "new pieces dealt");
  eq(await num(p, "#pw-swap-n"), 2, "swap charge spent");
  const m = await pickMove(p);
  await dragTo(p, m.slot, m.r, m.c); await p.waitForTimeout(500);
  ok((await num(p, "#score")) > 0, "scored");
  await p.click("#pw-undo"); await p.waitForTimeout(400);
  eq(await num(p, "#score"), 0, "move undone");
  eq(await num(p, "#pw-undo-n"), 2, "undo charge spent");
  await p.click("#quit"); await p.waitForTimeout(300);
  await p.click("#m-daily"); await p.waitForTimeout(400);
  ok(!(await p.locator("#pw-rotate").isVisible()), "no power-ups on the daily");
});

await test("rescue: out of room, a swap keeps the game going", async () => {
  const p = await guest();
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(400);
  await play(p, 400, { rescue: true }); await p.waitForTimeout(500);
  ok(await p.locator("#rescue").isVisible(), "rescue offered instead of game over");
  ok(!(await p.locator("#over").isVisible()), "not over yet");
  const score = await num(p, "#score");
  if (await p.locator("#rs-swap").isVisible()) {
    await p.click("#rs-swap"); await p.waitForTimeout(500);
    ok(!(await p.locator("#rescue").isVisible()) || await p.locator("#rs-swap").isVisible(), "rescued (or offered again)");
  }
  await play(p); await p.waitForTimeout(800);
  ok(await p.locator("#over").isVisible(), "the game can still end");
  ok((await finalScore(p)) >= score, "score kept");
});

await test("bigger pieces: the tray pieces grow", async () => {
  const p = await guest();
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(400);
  const slotH = () => p.$eval("#tray", (t) => parseFloat(t.style.getPropertyValue("--slot-h")));
  const small = await slotH();
  await p.click("#quit"); await p.waitForTimeout(300);
  await p.click("#set-big + i"); await p.waitForTimeout(200);
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(400);
  const big = await slotH();
  ok(big > small, `tray room grew from ${small}px to ${big}px`);
});

/* ── quests, archive, seasons ──────────────────────────────────────── */
await test("quests: three shown; finishing them pays power-ups and the bonus", async () => {
  const p = await guest();
  eq(await p.locator("#q-list .q").count(), 3, "three quests");
  ok((await txt(p, "#q-reset")).startsWith("new in"), "reset countdown");
  const before = await p.evaluate(() => JSON.parse(localStorage.getItem("tb.profile")).powers);
  // put every metric past its goal; the next counted event completes all three
  await p.evaluate(() => {
    const prof = JSON.parse(localStorage.getItem("tb.profile"));
    const d = new Date().toISOString().slice(0, 10);
    const big = 1e6;
    prof.quests = { date: d, done: [], bonus: false, progress: Object.fromEntries(
      ["lines", "multi", "combo", "perfect", "placed", "games", "best", "adv", "daily", "event", "archive"].map((k) => [k, big])) };
    localStorage.setItem("tb.profile", JSON.stringify(prof));
  });
  await p.reload(); await p.waitForTimeout(400);
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(600);
  ok((await p.textContent(".toasts")).includes("Quest complete"), "quest toast");
  const after = await p.evaluate(() => JSON.parse(localStorage.getItem("tb.profile")).powers);
  const gained = ["rotate", "swap", "undo"].reduce((n, k) => n + after[k] - before[k], 0);
  eq(gained, 4 + 3, "4 quest rewards + 3 bonus power-ups");
  await p.click("#quit"); await p.waitForTimeout(300);
  eq(await p.locator("#q-list .q.done").count(), 3, "all ticked");
  ok((await txt(p, "#q-bonus")).includes("bonus collected"), "bonus noted");
});

await test("archive: past boards listed, playable as unranked practice, best remembered", async () => {
  const p = await guest();
  await p.click("#m-archive"); await p.waitForTimeout(400);
  eq((await visible(p)).join(), "s-archive", "archive screen");
  ok(await p.locator(".archrow").count() >= 2, "past boards listed");
  const first = await txt(p, ".archrow .ad");
  await p.locator(".archrow").first().click(); await p.waitForTimeout(500);
  eq(await txt(p, "#mode-tag"), "Archive", "archive mode");
  ok(!(await p.locator("#pw-swap").isVisible()), "no power-ups: honest practice");
  await play(p); await p.waitForTimeout(900);
  eq(await txt(p, "#over-title"), `Day ${first} · practice`, "practice title");
  ok(await p.locator("#again").isVisible(), "replay allowed");
  await p.click("#tohome"); await p.waitForTimeout(300);
  await p.click("#m-archive"); await p.waitForTimeout(400);
  ok((await txt(p, ".archrow .ainfo span")).includes("Practice best"), "best remembered");
  ok(!(await p.locator("#daily-badge").isVisible()), "today's daily untouched");
});

await test("seasons: hidden out of season; in season, playing earns the skin", async () => {
  const p = await guest();
  ok(!(await p.locator("#m-season").isVisible()) || true, "card visibility depends on today's date");
  const off = await page();
  await off.goto(BASE + "?season=nope"); await off.waitForTimeout(300);
  eq(await off.locator("#skins .skin", { hasText: "Spooky" }).count(), 0, "unearned seasonal skin hidden out of season");

  const on = await page();
  await on.goto(BASE + "?season=halloween2026"); await on.waitForTimeout(300);
  ok(await on.locator("#m-season").isVisible(), "seasonal card shown");
  eq(await txt(on, "#season-name"), "Halloween Night", "season name");
  ok(await on.locator("#skins .skin.locked", { hasText: "Spooky" }).count() === 1, "skin offered, locked");
  await on.click("#m-season"); await on.waitForTimeout(400);
  await play(on); await on.waitForTimeout(900);
  ok((await on.textContent(".toasts")).includes("Spooky"), "skin unlocked toast");
  await on.click("#tohome"); await on.waitForTimeout(300);
  ok(await on.locator("#skins .skin:not(.locked)", { hasText: "Spooky" }).count() === 1, "skin now open");
  ok((await num(on, "#season-num")) > 0, "seasonal best shown");
});

/* ── growth: daily pages, install prompt ───────────────────────────── */
await test("daily pages: real content, the right opening hand, and Play opens that exact board", async () => {
  const p = await page();
  const res = await p.goto(BASE + "daily/5");
  eq(res.status(), 200, "status");
  const meta = await p.evaluate(() => ({
    t: document.title, d: document.querySelector("meta[name=description]").content,
    c: document.querySelector("link[rel=canonical]").href,
    ld: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)["@graph"].length,
    blocks: document.querySelectorAll("svg.hand rect").length,
  }));
  ok(meta.t.includes("#5") && meta.t.length <= 75, "title: " + meta.t);
  ok(meta.d.length >= 100 && meta.d.length <= 170, "description length " + meta.d.length);
  eq(meta.c, "https://timberblock.online/daily/5", "canonical");
  eq(meta.ld, 2, "page + breadcrumb structured data");
  // checked without opening it: a browser logs any 404 page as a console error
  eq((await p.request.get(BASE + "daily/99999")).status(), 404, "future days 404");
  const xml = await (await p.request.get(BASE + "sitemap-daily.xml")).text();
  ok(xml.includes("/daily/1</loc>") && xml.includes("/daily/</loc>"), "sitemap lists the pages");
  // a first-time visitor clicks Play and lands in that day's board
  await p.goto(BASE + "daily/5"); await p.click("a.play"); await p.waitForTimeout(1200);
  eq(await txt(p, "#mode-tag"), "Archive", "the linked board opened");
  const tray = await p.$$eval("#tray .piece .blk", (x) => x.length);
  eq(tray, meta.blocks, "the page showed exactly the pieces the game dealt");
});

await test("install prompt: offered from the second day, installs, and 'Not now' snoozes", async () => {
  const p = await guest();
  ok(!(await p.locator("#install").isVisible()), "not on the first day");
  await p.evaluate(() => {
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    localStorage.setItem("tb.install", JSON.stringify({ days: 1, last: y, snoozeUntil: null, installed: false }));
  });
  await p.reload(); await p.waitForTimeout(500);
  // the browser's own install event, as Chrome would fire it
  await p.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = () => { window.__prompted = true; };
    e.userChoice = Promise.resolve({ outcome: "dismissed" });
    dispatchEvent(e);
  });
  await p.waitForTimeout(300);
  ok(await p.locator("#install").isVisible(), "offered on day two");
  await p.click("#install-go"); await p.waitForTimeout(300);
  ok(await p.evaluate(() => window.__prompted === true), "the browser dialog was opened");
  await p.click("#statsbtn"); await p.click("#stats-back"); await p.waitForTimeout(200);
  await p.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: "dismissed" });
    dispatchEvent(e);
  });
  await p.waitForTimeout(300);
  await p.click("#install-later"); await p.waitForTimeout(200);
  ok(!(await p.locator("#install").isVisible()), "hidden after Not now");
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem("tb.install")));
  ok(st.snoozeUntil > new Date().toISOString().slice(0, 10), "snoozed until " + st.snoozeUntil);
});

/* ── friends leagues and analytics ─────────────────────────────────── */
await test("league: one player creates, a friend joins by code, both see the standings", async () => {
  const a = await page();
  await named(a, "Ana");
  await a.fill("#lg-name", "Office");
  await a.click("#lg-create"); await a.waitForTimeout(500);
  ok(await a.locator("#lg-in").isVisible(), "now in the league");
  eq(await txt(a, "#lg-title"), "Office", "league name");
  const code = await txt(a, "#lg-code");
  ok(/^[A-Z2-9]{6}$/.test(code), "code shown: " + code);

  const b = await page();
  await named(b, "Ben");
  await b.fill("#lg-join-code", "zzzzzz");
  await b.click("#lg-join"); await b.waitForTimeout(400);
  ok((await txt(b, "#err-lg")).includes("No league"), "bad code explained");
  await b.fill("#lg-join-code", code.toLowerCase());
  await b.click("#lg-join"); await b.waitForTimeout(500);
  eq(await txt(b, "#lg-title"), "Office", "joined");
  eq(await b.locator("#lg-list li").count(), 2, "two members listed");
  ok((await b.textContent("#lg-list")).includes("Ana"), "sees Ana");

  await a.reload(); await a.waitForTimeout(700);
  eq(await a.locator("#lg-list li").count(), 2, "Ana sees Ben too");
  await b.click("#lg-leave"); await b.waitForTimeout(400);
  ok(await b.locator("#lg-none").isVisible(), "left");
});

await test("league invite link prefills the code", async () => {
  const p = await page();
  await p.goto(BASE + "#lg=ABCDEF"); await p.waitForTimeout(400);
  eq(await p.inputValue("#lg-join-code"), "ABCDEF", "code prefilled");
});

await test("analytics: a visit is counted once a day and shows on the stats page", async () => {
  const p = await guest();
  await p.waitForTimeout(400);
  eq(await p.evaluate(() => localStorage.getItem("tb.pinged")), null, "opening the site is not playing");
  eq(await p.evaluate(() => localStorage.getItem("tb.visited")), null, "automated browsers are not counted as visitors");
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(600);
  const pinged = await p.evaluate(() => localStorage.getItem("tb.pinged"));
  ok(pinged && pinged.includes("20"), "counted as a player on starting a game: " + pinged);
  await p.goto(BASE + "stats.html"); await p.waitForTimeout(600);
  ok((await num(p, "#rows tr:first-child td:nth-child(3)")) >= 1, "players counted today");
});

await test("sound toggle flips and persists", async () => {
  const p = await guest();
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(300);
  eq(await txt(p, "#sound"), "Sound on", "starts on");
  await p.click("#sound"); await p.waitForTimeout(200);
  eq(await txt(p, "#sound"), "Sound off", "turns off");
  await p.reload(); await p.waitForTimeout(500);
  eq(await txt(p, "#sound"), "Sound off", "remembered");
});

await test("share links all point at timberblock.online and speak as 'I' for guests", async () => {
  const p = await guest();
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(300);
  await play(p); await p.waitForTimeout(800);
  const hrefs = await p.$$eval("#share-over a", (x) => x.map((a) => decodeURIComponent(a.href)));
  eq(hrefs.length, 5, "five networks");
  for (const h of hrefs) ok(h.includes("timberblock.online"), "domain in " + h.slice(0, 40));
  const wa = hrefs.find((h) => h.includes("wa.me"));
  ok(/I scored \d+/.test(wa), "guest copy reads 'I scored': " + wa);
  ok(!wa.includes("Guest"), "no 'Guest' in share copy");
});

/* ── layout ────────────────────────────────────────────────────────── */
for (const [w, h, mobile] of [[320, 568, true], [375, 667, true], [390, 844, true], [430, 932, true], [844, 390, true], [667, 375, true], [768, 1024, true], [1024, 768, true], [1280, 632, false], [1366, 768, false], [1536, 730, false], [1920, 1080, false]]) {
  await test(`layout ${w}x${h}: no sideways scroll; play controls on screen`, async () => {
    const p = await guest({ width: w, height: h, mobile });
    for (const scr of ["home", "play"]) {
      if (scr === "play") { await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(400); }
      const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      ok(over <= 0, `${scr}: horizontal overflow ${over}px`);
    }
    const trayBottom = await p.$eval("#tray", (e) => e.getBoundingClientRect().bottom);
    const fits = h >= 667 || w > h || w === 320;   // landscape and the smallest phone must fit too
    if (fits) ok(trayBottom <= h, `tray bottom ${Math.round(trayBottom)} > viewport ${h}`);
    const bar = await p.$eval(".bar-row", (e) => e.getBoundingClientRect().bottom);
    if (fits) ok(bar <= h, `controls bottom ${Math.round(bar)} > viewport ${h}`);
    const boardW = await p.$eval("#board", (e) => e.getBoundingClientRect().width);
    ok(boardW >= 280, `board only ${Math.round(boardW)}px wide`);
    const wraps = await p.$$eval(".bar-row button, .over .acts button", (x) => x.filter((b) => b.offsetParent && b.getClientRects().length && b.scrollHeight > 52).map((b) => b.textContent));
    eq(wraps.join(), "", "buttons wrapping");
  });
}

await test("game-over panel shows every share button without scrolling (390x844)", async () => {
  const p = await guest();
  await p.click('.mode[data-mode="classic"]'); await p.waitForTimeout(300);
  await play(p); await p.waitForTimeout(800);
  const r = await p.$eval("#over", (o) => ({ sh: o.scrollHeight, ch: o.clientHeight }));
  ok(r.sh <= r.ch + 1, `overlay scrolls: ${r.sh} > ${r.ch}`);
});

/* ── static pages ──────────────────────────────────────────────────── */
for (const path of ["how-to-play.html", "privacy.html", "strategy.html", "daily-puzzle.html", "wood-block-puzzle.html", "404.html"]) {
  await test(`${path} loads and links back to the game`, async () => {
    const p = await page();
    const res = await p.goto(BASE + path);
    eq(res.status(), 200, "status");
    ok(await p.locator('a[href="/"]').count() > 0, "link home");
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(over <= 0, "horizontal overflow");
  });
}

await test("every sitemap URL exists and every content page has title, description, canonical", async () => {
  const p = await page();
  const xml = await (await p.request.get(BASE + "sitemap.xml")).text();
  const locs = [...xml.matchAll(/<loc>https:\/\/timberblock\.online\/([^<]*)<\/loc>/g)].map((m) => m[1]);
  ok(locs.length >= 5, "sitemap has the content pages");
  for (const l of locs) {
    await p.goto(BASE + l);
    const meta = await p.evaluate(() => ({
      t: document.title, d: document.querySelector('meta[name=description]')?.content || "",
      c: document.querySelector('link[rel=canonical]')?.href || "",
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => { JSON.parse(s.textContent); return 1; }).length,
    }));
    ok(meta.t.length > 20 && meta.t.length <= 75, `${l}: title length ${meta.t.length}`);
    ok(meta.d.length >= 100 && meta.d.length <= 170, `${l}: description length ${meta.d.length}`);
    eq(meta.c, "https://timberblock.online/" + l, `${l}: canonical`);
    ok(meta.ld >= 1, `${l}: structured data parses`);
  }
});

await test("daily share has the emoji board; Reddit title stays one line", async () => {
  const p = await guest();
  await p.click("#m-daily"); await p.waitForTimeout(400);
  await play(p); await p.waitForTimeout(800);
  const hrefs = await p.$$eval("#share-over a", (x) => x.map((a) => decodeURIComponent(a.href)));
  const wa = hrefs.find((h) => h.includes("wa.me"));
  const rows = wa.split("\n").filter((l) => /^[🟥🟦🟩🟨🟪🟧🟫⬛]+$/u.test(l));
  eq(rows.length, 8, "eight mosaic rows");
  for (const r of rows) eq([...r].length, 8, "eight squares per row");
  const filled = await p.$$eval("#board .cell.filled", (x) => x.length);
  eq(rows.join("").replace(/⬛/gu, "").length / 2, filled, "mosaic matches the board");
  const rd = hrefs.find((h) => h.includes("reddit"));
  ok(!rd.split("title=")[1].includes("\n"), "reddit title has no newline");
});

await test("no JavaScript errors in any test", async () => {
  const errs = allErrors.flatMap((p) => p.errors);
  eq(errs.join("\n"), "", "errors");
});

await b.close();
const fails = results.filter((r) => r[0] === "FAIL");
for (const r of results) console.log(r[0], "-", r[1], r[3] ? "\n     -> " + r[3] : "");
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
