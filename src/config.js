/** Build-wide constants. Nothing secret belongs in this file - it ships. */

export const APP_NAME = "Timberblock";
export const APP_ID = "com.timberblock.game";

/** Your live site. Change this once, everywhere follows: share text, the
 *  share card footer, the OG tags in index.html, sitemap.xml, manifest. */
export const SITE_URL = "https://timberblock.online";

/** Where "share my score" points people. The site while it is web-only;
 *  swap for a smart store link once the apps ship. */
export const SHARE_URL = SITE_URL;

export const STORE_LINKS = {
  ios: "",      // https://apps.apple.com/app/idXXXXXXXXX
  android: "",  // https://play.google.com/store/apps/details?id=com.timberblock.game
};

/** Server that issues run seeds and verifies submissions (Phase 2/3).
 *  Empty means offline play: seeds are generated locally and nothing is
 *  submitted. The game is fully playable either way. */
export const API_BASE = "";

export const PROFILE_CODE_PREFIX = "TMBR";

/* ── advertising ───────────────────────────────────────────────────
 * Leave ADS_ENABLED false until the site is live, has real traffic, and
 * AdSense has approved it. Ads on an empty new site are the fastest way
 * to get an application rejected.
 * ────────────────────────────────────────────────────────────────── */
export const ADS_ENABLED = false;
export const ADSENSE_CLIENT = "ca-pub-7924324318308807";
export const ADSENSE_SLOT_MENU = "";   // the menu banner unit id
