// Shared helpers for the end-to-end tests (drives the installed Chrome).
import { chromium } from "playwright-core";

export const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
export const BASE = process.env.BASE || "http://localhost:5173/";

export async function launch() {
  return chromium.launch({ executablePath: CHROME, headless: true });
}

export async function freshPage(browser, { width = 390, height = 844, mobile = true, scheme = "dark", tutorial = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2,
    isMobile: mobile, hasTouch: mobile, colorScheme: scheme,
  });
  // most tests are about the game itself: mark the first-run tutorial as seen
  if (!tutorial) await ctx.addInitScript(() => { try { localStorage.setItem("tb.tutorial", "true"); } catch (e) {} });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // the API answers bad input with 4xx on purpose and the app shows it on screen
    if (/status of 4\d\d/.test(m.text()) && /\/api\//.test((m.location() || {}).url || "")) return;
    page.errors.push("console: " + m.text());
  });
  await page.goto(BASE);
  await page.waitForSelector(".screen:not([hidden])");
  await page.waitForTimeout(300);
  return page;
}

export const visible = (page) =>
  page.$$eval(".screen", (s) => s.filter((x) => !x.hidden).map((x) => x.id));

/** Read board + tray from the DOM and pick the best legal move (most lines cleared). */
export async function pickMove(page) {
  return page.evaluate(() => {
    const N = 8;
    const cells = [...document.querySelectorAll("#board .cell")];
    const g = cells.map((c) => c.classList.contains("filled"));
    const pieces = [...document.querySelectorAll("#tray .slot")].map((slot, i) => {
      const p = slot.querySelector(".piece");
      if (!p || slot.classList.contains("taken")) return null;
      const cols = p.style.gridTemplateColumns.match(/repeat\((\d+)/)[1] | 0;
      const us = [...p.children];
      const shape = [];
      us.forEach((u, k) => { if (u.querySelector(".blk")) shape.push([Math.floor(k / cols), k % cols]); });
      return { i, shape };
    });
    let best = null;
    for (const pc of pieces) {
      if (!pc) continue;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        let ok = true;
        for (const [dr, dc] of pc.shape) {
          const rr = r + dr, cc = c + dc;
          if (rr >= N || cc >= N || g[rr * N + cc]) { ok = false; break; }
        }
        if (!ok) continue;
        const h = g.slice();
        for (const [dr, dc] of pc.shape) h[(r + dr) * N + c + dc] = true;
        let lines = 0;
        for (let k = 0; k < N; k++) {
          if ([...Array(N)].every((_, j) => h[k * N + j])) lines++;
          if ([...Array(N)].every((_, j) => h[j * N + k])) lines++;
        }
        const score = lines * 100 - r - c;
        if (!best || score > best.score) best = { slot: pc.i, r, c, score, lines };
      }
    }
    return best;
  });
}

/** Drag a tray piece so its top-left cell lands on board cell (r, c). */
export async function dragTo(page, slot, r, c) {
  const piece = page.locator(`#tray .piece[data-slot="${slot}"]`);
  const pb = await piece.boundingBox();
  const geo = await page.evaluate(() => {
    const b = document.getElementById("board").getBoundingClientRect();
    const cs = document.querySelectorAll("#board .cell");
    const a = cs[0].getBoundingClientRect(), a2 = cs[1].getBoundingClientRect();
    return { left: b.left, top: b.top, pad: a.left - b.left, size: a.width, step: a2.left - a.left };
  });
  // grab just inside the piece's top-left corner -> anchor is ~0
  const sx = pb.x + 1, sy = pb.y + 1;
  const tx = geo.left + geo.pad + c * geo.step + 2;
  const ty = geo.top + geo.pad + r * geo.step + 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 4 });
  await page.mouse.move(tx, ty, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(380);
}

/** Play greedy moves until game over or `max` moves. Returns moves made. */
export async function play(page, max = 400, opts = {}) {
  let n = 0;
  for (; n < max; n++) {
    if (await page.locator("#over").isVisible()) break;
    // out of room with power-ups left: the game offers a rescue; decline it
    // unless the caller wants to test it
    if (await page.locator("#rescue").isVisible()) {
      if (opts.rescue) break;
      await page.click("#rs-giveup"); await page.waitForTimeout(400);
      continue;
    }
    if (await page.locator("#advover").isVisible()) break;
    if (await page.locator("#levelup").isVisible()) { await page.click("#nextlvl"); await page.waitForTimeout(300); }
    const m = await pickMove(page);
    if (!m) { await page.waitForTimeout(600); if (await page.locator("#over").isVisible()) break; continue; }
    const before = await page.$$eval("#tray .slot.taken", (x) => x.length);
    // a little human unevenness: the leaderboard rejects metronome-regular
    // play as a bot (server/verify.js, robotic_cadence)
    await page.waitForTimeout(40 + Math.floor(Math.random() * 360));
    await dragTo(page, m.slot, m.r, m.c);
    const after = await page.$$eval("#tray .slot.taken", (x) => x.length);
    if (after === before && before !== 2) throw new Error(`drop did not register: ${JSON.stringify(m)}`);
  }
  return n;
}
