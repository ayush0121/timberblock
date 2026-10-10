/**
 * Native capabilities, degrading silently on the web.
 *
 * Capacitor plugins are imported lazily so the web build does not pay for
 * them and so a missing plugin can never crash the game.
 */
let cap = null;
let haptics = null;
let appPlugin = null;
let hapticsOn = true;

/** The Vibration setting. */
export function setHaptics(on) { hapticsOn = !!on; }

export const isNative = () =>
  !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

export const platform = () =>
  (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || "web";

/** Load the native plugins once, if we are actually running natively. */
export async function initDevice({ onPause, statusBarColor } = {}) {
  if (!isNative()) {
    if (onPause) {
      document.addEventListener("visibilitychange", () => { if (document.hidden) onPause(); });
      window.addEventListener("pagehide", onPause);
    }
    return;
  }
  try {
    cap = window.Capacitor;
    const [h, a, sb, ss] = await Promise.all([
      import("@capacitor/haptics").catch(() => null),
      import("@capacitor/app").catch(() => null),
      import("@capacitor/status-bar").catch(() => null),
      import("@capacitor/splash-screen").catch(() => null),
    ]);
    haptics = h;
    appPlugin = a;

    if (a && onPause) {
      a.App.addListener("appStateChange", ({ isActive }) => { if (!isActive) onPause(); });
      a.App.addListener("pause", onPause);
    }
    if (sb && statusBarColor) {
      await sb.StatusBar.setBackgroundColor({ color: statusBarColor }).catch(() => {});
    }
    if (ss) await ss.SplashScreen.hide().catch(() => {});
  } catch (e) {
    /* web build, or plugin missing - the game does not depend on any of it */
  }
}

/** Called on every placement. Cheap, ignorable, and it matters a lot on phone. */
export function tap(strength = "light") {
  if (!hapticsOn) return;
  if (!haptics) {
    // Android browsers can vibrate too; iOS Safari simply ignores this
    if (navigator.vibrate) navigator.vibrate(strength === "light" ? 8 : strength === "medium" ? 16 : 28);
    return;
  }
  const { Haptics, ImpactStyle } = haptics;
  const style = strength === "heavy" ? ImpactStyle.Heavy
    : strength === "medium" ? ImpactStyle.Medium : ImpactStyle.Light;
  Haptics.impact({ style }).catch(() => {});
}

export function buzz() {
  if (!hapticsOn) return;
  if (!haptics) { if (navigator.vibrate) navigator.vibrate([20, 40, 30]); return; }
  haptics.Haptics.notification({ type: "SUCCESS" }).catch(() => {});
}

/** Android hardware back button. */
export function onBack(handler) {
  if (appPlugin) appPlugin.App.addListener("backButton", handler);
}

export async function setStatusBar(color) {
  if (!isNative()) return;
  const sb = await import("@capacitor/status-bar").catch(() => null);
  if (sb) sb.StatusBar.setBackgroundColor({ color }).catch(() => {});
}

/* ── daily reminder (apps only) ───────────────────────────────────── */
const REMINDER_ID = 2801;

/** Native apps can schedule an on-device notification; the web can't reliably. */
export const canRemind = () => isNative();

/**
 * Turn the daily 7 pm reminder on or off. On-device scheduling: no server,
 * no push tokens. Resolves false if the player declined permission.
 */
export async function setReminder(on, { title, body } = {}) {
  if (!isNative()) return false;
  const mod = await import("@capacitor/local-notifications").catch(() => null);
  if (!mod) return false;
  const { LocalNotifications } = mod;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
    if (!on) return true;
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return false;
    await LocalNotifications.schedule({
      notifications: [{
        id: REMINDER_ID, title, body,
        schedule: { on: { hour: 19, minute: 0 }, allowWhileIdle: true },
      }],
    });
    return true;
  } catch (e) { return false; }
}
