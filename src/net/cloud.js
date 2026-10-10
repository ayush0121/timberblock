/**
 * Cloud profile storage, behind one interface with swappable adapters.
 *
 *   artifact  - the Claude artifact database. Works in the web demo only.
 *   firebase  - the production adapter. Stub below; fill in at Phase 2.
 *   null      - no cloud. Guest play still works completely.
 *
 * Adapter contract:
 *   load(id)          -> profile object | null
 *   save(id, profile) -> void
 *   create(profile)   -> id
 */
import { PROFILE_CODE_PREFIX } from "../config.js";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I O 0 1

export function newProfileCode() {
  const pick = (n) =>
    Array.from({ length: n }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");
  return `${PROFILE_CODE_PREFIX}-${pick(4)}-${pick(4)}`;
}

export const CODE_RE = new RegExp(`^${PROFILE_CODE_PREFIX}-[A-Z0-9]{4}-[A-Z0-9]{4}$`);

export const blankProfile = (name) => ({
  name,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  best: { classic: 0, pro: 0 },
  bestLevel: 0,
  games: 0,
  skin: null,
  save: null,
});

/* ── artifact adapter (web demo) ─────────────────────────────────── */
async function artifactAdapter() {
  if (!(window.claude && window.claude.use)) return null;
  const db = await window.claude.use("db").catch(() => null);
  if (!db) return null;
  const ref = (id) => db.doc("players/" + id);
  return {
    kind: "artifact",
    async load(id) {
      const snap = await ref(id).get();
      return snap.exists ? snap.data() : null;
    },
    async save(id, profile) { await ref(id).set(profile); },
    async create(profile) {
      const id = newProfileCode();
      await ref(id).set(profile);
      return id;
    },
  };
}

/* ── firebase adapter (production) ───────────────────────────────── */
// Phase 2. Shape it exactly like the adapter above, with these differences:
//   - the id is the Firebase Auth uid, not a shareable code
//   - `best`, `entitlements` and the leaderboard row are written ONLY by
//     Cloud Functions after server-side replay verification; this adapter
//     must never write them
//   - `save()` writes users/{uid}/saves/current, debounced by the caller
//
// async function firebaseAdapter() {
//   const { initializeApp } = await import("firebase/app");
//   const { getAuth, signInAnonymously } = await import("firebase/auth");
//   const { getFirestore, doc, getDoc, setDoc } = await import("firebase/firestore");
//   ...
// }

let cached;
export async function getCloud() {
  if (cached !== undefined) return cached;
  cached = (await artifactAdapter()) || null;
  return cached;
}
