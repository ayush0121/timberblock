/**
 * Web advertising, behind a switch.
 *
 * With no client id configured in config.js, every function here is a no-op
 * and every ad slot stays hidden - the game is complete without ads, and the
 * site is safe to launch before AdSense approval (which requires a live site
 * with real content, so this ordering is forced on you anyway).
 *
 * Two products, two different approvals:
 *   - AdSense display  -> the banner under the menu. Standard, widely approved.
 *   - H5 Games Ads     -> rewarded and interstitial for web games. Separate
 *                         opt-in inside AdSense; verify the current API and
 *                         eligibility before relying on the rewarded path.
 *
 * Policy notes that matter more than the code:
 *   - never place an ad where a mis-tap looks like gameplay
 *   - no ads on the board itself, and none during a run
 *   - EU/UK visitors need consent before personalised ads (see CONSENT below)
 */
import { ADSENSE_CLIENT, ADSENSE_SLOT_MENU, ADS_ENABLED } from "../config.js";

let loaded = false;
let rewardedReady = false;

export const adsConfigured = () => ADS_ENABLED && !!ADSENSE_CLIENT;

/** Inject the AdSense tag once, lazily, after the game is interactive. */
export async function initAds() {
  if (!adsConfigured() || loaded) return;
  loaded = true;
  // The static tag in index.html <head> (needed for AdSense site verification)
  // may already have loaded the library; don't inject a second copy.
  const tagged = document.querySelector('script[src*="pagead/js/adsbygoogle.js"]');
  if (!tagged) await new Promise((res) => {
    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src =
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
      encodeURIComponent(ADSENSE_CLIENT);
    s.onload = res;
    s.onerror = res; // a blocked script must never break the game
    document.head.appendChild(s);
  });

  // H5 Games Ads placement config. Harmless if the account is not enrolled.
  try {
    window.adsbygoogle = window.adsbygoogle || [];
    if (typeof window.adConfig === "function") {
      window.adConfig({
        preloadAdBreaks: "on",
        sound: "on",
        onReady: () => { rewardedReady = true; },
      });
    }
  } catch (e) { /* ignore */ }
}

/** Fill a reserved banner container. Does nothing when ads are off. */
export function mountBanner(host) {
  if (!adsConfigured() || !host) return;
  host.hidden = false;
  host.textContent = "";
  const ins = document.createElement("ins");
  ins.className = "adsbygoogle";
  ins.style.display = "block";
  ins.setAttribute("data-ad-client", ADSENSE_CLIENT);
  ins.setAttribute("data-ad-slot", ADSENSE_SLOT_MENU);
  ins.setAttribute("data-ad-format", "auto");
  ins.setAttribute("data-full-width-responsive", "true");
  host.appendChild(ins);
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (e) { /* ignore */ }
}

/**
 * Rewarded ad. Resolves true only if the viewer actually earned the reward.
 * Callers MUST treat false as "no reward" and carry on gracefully.
 *
 * On the web the ad network is the only witness, so this is inherently
 * client-trusted. Keep web rewards cosmetic or low-value; when the native
 * apps ship, move to AdMob server-side verification for anything that
 * touches a leaderboard.
 */
export function showRewarded() {
  return new Promise((resolve) => {
    if (!adsConfigured() || typeof window.adBreak !== "function") {
      resolve(false);
      return;
    }
    let earned = false;
    try {
      window.adBreak({
        type: "reward",
        name: "continue-run",
        beforeReward: (showAdFn) => showAdFn(),
        adViewed: () => { earned = true; },
        adDismissed: () => { earned = false; },
        afterAd: () => resolve(earned),
        adBreakDone: () => resolve(earned),
      });
    } catch (e) {
      resolve(false);
    }
    setTimeout(() => resolve(earned), 45000); // never hang the game
  });
}

export const isRewardedReady = () => adsConfigured() && rewardedReady;

/* ── CONSENT ───────────────────────────────────────────────────────
 * Before serving personalised ads to visitors in the EEA/UK you need a
 * Google-certified CMP. The simplest route is to enable Google's own
 * consent management inside the AdSense console - it injects the banner
 * for you and needs no code here. Do that before you switch ADS_ENABLED
 * on, not after.
 * ────────────────────────────────────────────────────────────────── */
