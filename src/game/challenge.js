/**
 * Challenge links.
 *
 * "I scored 4,120 on this board — try it." The link carries the seed, so the
 * recipient is dealt the identical pieces in the identical order. No server,
 * no accounts, no lobby: determinism is doing all the work.
 *
 * The token is deliberately not signed. It is a party invitation, not a
 * credential - the worst a tampered token can do is deal someone a different
 * board or an easier target, which only cheats the tamperer. Scores that
 * matter go through server-side replay verification (server/verify.js).
 */

const VERSION = "1";
const SEP = "~";

/* ── base64url, unicode-safe ──────────────────────────────────────── */
function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(token) {
  const pad = token.length % 4 ? "=".repeat(4 - (token.length % 4)) : "";
  const bin = atob(token.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ── token ────────────────────────────────────────────────────────── */
/**
 * @param {object} o
 * @param {number} o.seed    the run's seed
 * @param {number} o.score   the score to beat
 * @param {string} o.name    who set it
 * @param {string} [o.label] optional board label, e.g. "Day #250"
 * @param {boolean} [o.gentle] the run used beginner dealing; the friend must too
 */
export function encodeChallenge({ seed, score, name, label = "", gentle = false }) {
  const clean = (s) => String(s || "").replace(new RegExp(SEP, "g"), " ").slice(0, 24).trim();
  return b64urlEncode(
    [
      VERSION,
      (seed >>> 0).toString(36),
      Math.max(0, score | 0).toString(36),
      clean(name),
      clean(label),
      gentle ? "g" : "",
    ].join(SEP)
  );
}

/** Returns null for anything malformed - never throws at the call site. */
export function decodeChallenge(token) {
  try {
    const parts = b64urlDecode(String(token).trim()).split(SEP);
    if (parts[0] !== VERSION || parts.length < 4) return null;
    const seed = parseInt(parts[1], 36);
    const score = parseInt(parts[2], 36);
    if (!Number.isFinite(seed) || !Number.isFinite(score)) return null;
    return {
      seed: seed | 0,
      score,
      name: parts[3] || "A friend",
      label: parts[4] || "",
      gentle: parts[5] === "g",   // absent in older links: a normal board
    };
  } catch (e) {
    return null;
  }
}

/* ── links ────────────────────────────────────────────────────────── */
/**
 * The shareable URL. Uses the hash rather than the query string: hashes
 * survive redirects, are never sent to the server, and cost nothing in the
 * static-hosting setup.
 */
export function challengeLink(base, token) {
  const clean = String(base || "").split("#")[0].replace(/\/+$/, "");
  return `${clean}/#c=${token}`;
}

/** Pull a challenge out of the current URL, if there is one. */
export function challengeFromLocation(loc = window.location) {
  const fromHash = /[#&]c=([A-Za-z0-9\-_]+)/.exec(loc.hash || "");
  const fromQuery = /[?&]c=([A-Za-z0-9\-_]+)/.exec(loc.search || "");
  const token = (fromHash || fromQuery || [])[1];
  return token ? decodeChallenge(token) : null;
}

/** Accept a pasted code OR a pasted full link. People paste both. */
export function parsePasted(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const inUrl = /[#?&]c=([A-Za-z0-9\-_]+)/.exec(s);
  return decodeChallenge(inUrl ? inUrl[1] : s);
}

/** Drop the token from the address bar so a reload does not re-trigger it. */
export function clearLocationToken() {
  try {
    if (/[#?&]c=/.test(location.hash + location.search)) {
      history.replaceState(null, "", location.pathname);
    }
  } catch (e) { /* file:// and sandboxed frames */ }
}
