/**
 * Pointer-driven drag and drop, one implementation for mouse and touch.
 *
 * On touch the piece is lifted about 1.5 cells above the finger so the
 * player can see where it will land - the single most important detail in
 * making a block puzzle feel right on a phone.
 */
import { N } from "../game/board.js";
import { spanRows, spanCols } from "../game/shapes.js";
import { pieceGrid } from "./tray.js";

export function attachDrag({ trayEl, board, getRun, getTheme, canPlay, onDrop }) {
  const ghost = document.createElement("div");
  ghost.id = "ghost";
  ghost.style.display = "none";
  document.body.appendChild(ghost);

  let drag = null;

  trayEl.addEventListener("pointerdown", (e) => {
    // the whole slot is the grab target, not just the piece's blocks: small
    // pieces are easy to hit, and so is a piece still animating in
    const slotHit = e.target.closest(".slot");
    const g = slotHit && slotHit.querySelector(".piece");
    if (!g || !canPlay()) return;
    if (slotHit.classList.contains("dead")) return;

    const run = getRun();
    const slot = +g.dataset.slot;
    const p = run.tray[slot];
    if (!p) return;
    e.preventDefault();

    const gm = board.geom();
    const rect = g.getBoundingClientRect();
    // grabbed beside the piece? hold it by its nearest edge
    const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const fy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const gap = gm.step - gm.size;
    const cols = spanCols(p.cells), rows = spanRows(p.cells);
    const w = cols * gm.size + (cols - 1) * gap;
    const h = rows * gm.size + (rows - 1) * gap;

    ghost.textContent = "";
    ghost.appendChild(pieceGrid(p.cells, p.tone, getTheme(), gm.size, "--gc"));
    // the inner .piece supplies the grid; hoist its template onto #ghost
    const inner = ghost.firstChild;
    ghost.style.setProperty("--gc", gm.size + "px");
    ghost.style.gridTemplateColumns = inner.style.gridTemplateColumns;
    ghost.style.gridTemplateRows = inner.style.gridTemplateRows;
    while (inner.firstChild) ghost.appendChild(inner.firstChild);
    inner.remove();
    ghost.style.display = "grid";

    const slotEl = g.closest(".slot");
    slotEl.style.visibility = "hidden";

    drag = {
      slot, piece: p, gm, slotEl,
      ax: fx * w, ay: fy * h,
      lift: e.pointerType === "mouse" ? 0 : gm.step * 1.5,
      target: null,
    };
    move(e);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", drop);
  });

  function move(e) {
    if (!drag) return;
    if (e.preventDefault) e.preventDefault();
    const run = getRun();
    const x = e.clientX - drag.ax;
    const y = e.clientY - drag.ay - drag.lift;
    ghost.style.transform = `translate(${x}px,${y}px)`;

    const gm = drag.gm;
    const c = Math.round((x - gm.left - gm.pad) / gm.step);
    const r = Math.round((y - gm.top - gm.pad) / gm.step);

    board.clearMarks(run.grid);
    const near = r > -2 && c > -2 && r < N + 1 && c < N + 1;

    if (near && run.legal(drag.slot, r, c)) {
      drag.target = [r, c];
      board.showPreview(drag.piece.cells, r, c, drag.piece.tone,
        run.wouldClear(drag.slot, r, c));
    } else {
      drag.target = null;
      if (near) board.showBlocked(drag.piece.cells, r, c);
    }
  }

  function drop() {
    if (!drag) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", drop);
    window.removeEventListener("pointercancel", drop);
    ghost.style.display = "none";
    drag.slotEl.style.visibility = "";
    const d = drag;
    drag = null;
    board.clearMarks(getRun().grid);
    onDrop(d.target ? { slot: d.slot, r: d.target[0], c: d.target[1] } : null);
  }

  return { cancel: () => { if (drag) drop(); } };
}
