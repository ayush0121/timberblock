/**
 * Every sound is synthesized in WebAudio - no audio files, no download size,
 * and the timbre follows the active skin.
 */
let ac = null;
let enabled = true;
let voice = "voltage";

export function setEnabled(v) { enabled = v; if (v) unlock(); }
export const isEnabled = () => enabled;
export function setVoice(skinId) { voice = skinId; }

/** Must be called from inside a user gesture on iOS. */
export function unlock() {
  if (ac || !enabled) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
  } catch (e) { ac = null; }
}

const ready = () => ac && enabled;

function env(dur, gain) {
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  g.connect(ac.destination);
  return g;
}

function noise(dur) {
  const n = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ac.createBufferSource();
  s.buffer = buf;
  return s;
}

function tone(freq, at, dur, gain, type = "triangle") {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ac.createGain();
  const t = ac.currentTime + at;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

/** Piece lands. Wood knocks, glass ticks, neon blips. */
export function place() {
  if (!ready()) return;
  if (voice === "timber") {
    const f = ac.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 1.1;
    f.connect(env(0.12, 0.32));
    const s = noise(0.12); s.connect(f); s.start();
    const o = ac.createOscillator(); o.type = "triangle";
    o.frequency.setValueAtTime(240, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(90, ac.currentTime + 0.1);
    o.connect(env(0.11, 0.18)); o.start(); o.stop(ac.currentTime + 0.12);
  } else if (voice === "chapel") {
    tone(1180, 0, 0.09, 0.14, "sine");
    tone(1760, 0.01, 0.16, 0.08, "sine");
  } else {
    tone(520, 0, 0.07, 0.16, "square");
    tone(780, 0.03, 0.09, 0.10, "square");
  }
}

/** Lines cleared. Rises with the combo streak. */
export function clear(lines, streak) {
  if (!ready()) return;
  const base = voice === "chapel" ? 523.25 : 392;
  const type = voice === "voltage" ? "sawtooth" : "triangle";
  const step = Math.min(streak - 1, 4) * 2;
  for (let i = 0; i < lines + 1; i++)
    tone(base * Math.pow(2, (i * 4 + step) / 12), i * 0.075, 0.34, 0.2, type);
}

/** Illegal drop. */
export function reject() {
  if (!ready()) return;
  const f = ac.createBiquadFilter();
  f.type = "lowpass"; f.frequency.value = 320;
  f.connect(env(0.13, 0.22));
  const s = noise(0.13); s.connect(f); s.start();
}

export function levelUp() {
  if (!ready()) return;
  [0, 4, 7, 12].forEach((st, i) => tone(392 * Math.pow(2, st / 12), i * 0.09, 0.45, 0.2));
}

export function gameOver() {
  if (!ready()) return;
  [0, -3, -7].forEach((st, i) => tone(330 * Math.pow(2, st / 12), i * 0.14, 0.5, 0.18, "sine"));
}
