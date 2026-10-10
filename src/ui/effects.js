/** Particle chips, floating score pops, and the banner over the board. */
import { N } from "../game/board.js";

export class Effects {
  constructor(canvas, wrap, board) {
    this.cv = canvas;
    this.cx = canvas.getContext("2d");
    this.wrap = wrap;
    this.board = board;
    this.bits = [];
    this.raf = 0;
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const r = this.board.el.getBoundingClientRect();
    if (!r.width) return;
    const d = window.devicePixelRatio || 1;
    this.cv.width = r.width * d;
    this.cv.height = r.height * d;
    this.cv.style.width = r.width + "px";
    this.cv.style.height = r.height + "px";
    this.cx.setTransform(d, 0, 0, d, 0, 0);
  }

  /** Shatter one cell into chips in the tone's colours. */
  burst(r, c, tone, theme, power = 1) {
    const t = theme.tones[tone % theme.tones.length];
    const g = this.board.geom();
    const x = g.pad + c * g.step + g.size / 2;
    const y = g.pad + r * g.step + g.size / 2;
    const n = Math.round(7 * power);
    for (let i = 0; i < n; i++) {
      this.bits.push({
        x, y,
        vx: (Math.random() - 0.5) * 3.6 * power,
        vy: -Math.random() * 3.4 * power - 0.6,
        a: Math.random() * 6.3,
        va: (Math.random() - 0.5) * 0.4,
        s: 2 + Math.random() * 4,
        life: 1,
        col: Math.random() < 0.5 ? t.b : t.h,
      });
    }
    if (!this.raf) this.raf = requestAnimationFrame(() => this.tick());
  }

  burstCells(indices, grid, theme, tones, power = 1) {
    for (const i of indices) {
      const r = Math.floor(i / N), c = i % N;
      const tone = tones ? tones[i] : grid[r][c];
      if (tone >= 0) this.burst(r, c, tone, theme, power);
    }
  }

  /** A bright bar that sweeps along each cleared row and column. */
  sweep(rows, cols) {
    const g = this.board.geom();
    const span = N * g.step - (g.step - g.size);
    const bar = (vertical, i, delay) => {
      const d = document.createElement("div");
      d.className = "sweep" + (vertical ? " v" : "");
      const at = g.pad + i * g.step;
      Object.assign(d.style, vertical
        ? { left: at + "px", top: g.pad + "px", width: g.size + "px", height: span + "px" }
        : { left: g.pad + "px", top: at + "px", width: span + "px", height: g.size + "px" });
      d.style.animationDelay = delay + "ms";
      this.wrap.appendChild(d);
      setTimeout(() => d.remove(), 600 + delay);
    };
    rows.forEach((r, k) => bar(false, r, k * 40));
    cols.forEach((c, k) => bar(true, c, (rows.length + k) * 40));
  }

  /** Jolt the board; strength 1..3. */
  shake(strength) {
    const el = this.wrap;
    el.style.setProperty("--shake", Math.min(3, strength) * 2.5 + "px");
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
    clearTimeout(this.shakeT);
    this.shakeT = setTimeout(() => el.classList.remove("shake"), 420);
  }

  /** Big centred praise word, with an optional smaller line under it. */
  callout(word, sub, tier = 1) {
    const old = this.wrap.querySelector(".callout");
    if (old) old.remove();
    const d = document.createElement("div");
    d.className = "callout t" + tier;
    const w = document.createElement("b");
    w.textContent = word;
    d.appendChild(w);
    if (sub) {
      const s = document.createElement("small");
      s.textContent = sub;
      d.appendChild(s);
    }
    this.wrap.appendChild(d);
    setTimeout(() => d.remove(), 1300);
  }

  /** Confetti from the top edge, across the whole board, in every tone. */
  celebrate(theme, count = 70) {
    const g = this.board.geom();
    for (let i = 0; i < count; i++) {
      const t = theme.tones[i % theme.tones.length];
      this.bits.push({
        x: Math.random() * g.width,
        y: -10 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 2.4,
        vy: Math.random() * 2,
        a: Math.random() * 6.3,
        va: (Math.random() - 0.5) * 0.3,
        s: 4 + Math.random() * 5,
        life: 1.6 + Math.random() * 0.6,
        col: Math.random() < 0.5 ? t.b : t.h,
        drift: true,
      });
    }
    if (!this.raf) this.raf = requestAnimationFrame(() => this.tick());
  }

  tick() {
    this.cx.clearRect(0, 0, this.cv.width, this.cv.height);
    this.bits = this.bits.filter((p) => {
      if (p.drift) { p.vy = Math.min(p.vy + 0.08, 3.2); p.vx += Math.sin(p.y / 30) * 0.05; }
      else p.vy += 0.22;
      p.x += p.vx; p.y += p.vy; p.a += p.va; p.life -= 0.016;
      if (p.life <= 0) return false;
      this.cx.save();
      this.cx.translate(p.x, p.y);
      this.cx.rotate(p.a);
      this.cx.globalAlpha = Math.max(0, Math.min(1, p.life));
      this.cx.fillStyle = p.col;
      this.cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      this.cx.restore();
      return true;
    });
    this.raf = this.bits.length ? requestAnimationFrame(() => this.tick()) : 0;
  }

  /** Confetti the whole board at game over. */
  collapse(grid, theme) {
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++)
        if (grid[r][c] >= 0 && Math.random() < 0.4) this.burst(r, c, grid[r][c], theme);
  }

  pop(text, r, c) {
    const g = this.board.geom();
    const d = document.createElement("div");
    d.className = "pop";
    d.style.left = g.pad + c * g.step + g.size / 2 + "px";
    d.style.top = g.pad + r * g.step - 4 + "px";
    d.textContent = text;
    this.wrap.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  }

  banner(text) {
    const d = document.createElement("div");
    d.className = "banner";
    d.textContent = text;
    this.wrap.appendChild(d);
    setTimeout(() => d.remove(), 3000);
  }
}
