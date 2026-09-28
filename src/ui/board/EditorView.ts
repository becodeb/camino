// The workshops' board (sheets 7 and 15): the level being made, drawn like
// any board, with Brote standing on his start. Every cell takes taps and
// drops (a hit square each, `data-cell="c,r"`, over everything; the editor
// screen reads the pointer); the piece just placed pops in, Brote poofs to a
// new start, a piece that refuses a tool wiggles. When the level is refused
// Brote says so without words: he looks puzzled, or thinks of the repeat
// block the level needs (a thought bubble).

import { blob, el } from '../../ink/ink.js';
import { E } from '../../ink/anim.js';
import { INK } from '../../ink/characters.js';
import { REDUCED } from '../runtime';
import type { Board, Cell } from '../../game/model';
import { DIMS_COMPACT } from '../../game/editor';
import { TAPE_FILL, cPath, cardPath } from '../../blocks/blocks';
import { BoardView, S, popAnim, type Frame } from './BoardView';

const at = (c: Cell) => `${c.c},${c.r}`;

export class EditorView extends BoardView {
  /** The cell under a dragged piece, outlined in blue pen. */
  private target: string | null = null;

  /** Draws the level being made: the piece just placed (`placed`) pops in, Brote poofs to a start that moved. */
  show(board: Board, o: { frame?: Frame; placed?: Cell | null; first?: boolean } = {}) {
    const before = this.board;
    this.setBoard(board, { pop: !!o.first, frame: o.frame });
    this.tag(board);
    this.drawCells(board);
    if (o.placed) this.popAt(o.placed);
    const moved = !!before && (before.start.c !== board.start.c || before.start.r !== board.start.r);
    if (moved) void this.reset();
  }

  /** Marks each piece's node with its cell (`data-at`), to pop or wiggle it. */
  private tag(b: Board) {
    [...this.L.obst.children].forEach((g, i) => g.setAttribute('data-at', at(b.obstacles[i])));
    this.pickupNodes.forEach((g, i) => g.setAttribute('data-at', at(b.pickups[i])));
    this.L.goal.querySelector('[data-guide="target"]')?.setAttribute('data-at', at(b.goal));
  }

  /** A hit square per cell, over everything. */
  private drawCells(b: Board) {
    this.L.pick.textContent = '';
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        el('rect', { x: c * S + 3, y: r * S + 3, width: S - 6, height: S - 6, rx: 12, class: `cell-edit${this.target === `${c},${r}` ? ' is-target' : ''}`, 'data-cell': `${c},${r}` }, this.L.pick);
      }
    }
  }

  /** The cell a client point is on, or null off the board. */
  cellAt(clientX: number, clientY: number): Cell | null {
    const p = this.toBoard(clientX, clientY), b = this.board;
    if (!p || !b) return null;
    const c = Math.floor(p.x / S), r = Math.floor(p.y / S);
    return c >= 0 && r >= 0 && c < b.cols && r < b.rows ? { c, r } : null;
  }

  /** The cell a dragged piece would land on (null: none). */
  setTarget(cell: Cell | null) {
    const k = cell ? at(cell) : null;
    if (k === this.target) return;
    this.target = k;
    this.L.pick.querySelectorAll('.cell-edit').forEach((n) => n.classList.toggle('is-target', n.getAttribute('data-cell') === k));
  }

  /** The drawing of the piece on a cell (its inner group: the outer one holds the position). */
  private nodeAt(cell: Cell): SVGGElement | null {
    return (this.svg.querySelector(`[data-at="${at(cell)}"]`)?.firstElementChild as SVGGElement | null) ?? null;
  }

  popAt(cell: Cell) {
    const n = this.nodeAt(cell);
    if (n) popAnim(n, { dur: 340, origin: '50% 80%' });
  }

  /** "Not there": the piece on the cell wiggles (Brote shakes himself). */
  wiggleAt(cell: Cell) {
    const b = this.board;
    if (b && b.start.c === cell.c && b.start.r === cell.r) { void this.shake(); return; }
    const n = this.nodeAt(cell);
    if (!n || REDUCED) return;
    n.style.transformBox = 'fill-box';
    n.style.transformOrigin = '50% 90%';
    n.animate([{ rotate: '0deg' }, { rotate: '-12deg', offset: 0.2 }, { rotate: '10deg', offset: 0.45 }, { rotate: '-6deg', offset: 0.7 }, { rotate: '0deg' }], { duration: 560, easing: 'ease-out' });
  }

  /** Brote shakes himself, lips pressed: "no, not like that". */
  async shake() {
    const a = this.actor;
    if (!a) return;
    await a.act(async () => {
      a.rig.mouth = 'wavy';
      for (const lean of [-9, 8, -6, 0]) await a.T({ lean }, REDUCED ? 1 : 110, E.inOut);
      a.rig.mouth = 'smile';
    });
  }

  /**
   * Brote thinks of what the level needs: a thought bubble with the repeat
   * block in it (a tape with its coil and an arrow card inside), beside his
   * head, for a couple of seconds.
   */
  async think() {
    const a = this.actor, b = this.board;
    if (!a || !b) return;
    const w = b.cols * S, top = this.frameT.top;
    const side = a.rig.x < w / 2 ? 1 : -1;
    const hx = a.rig.x + side * 34, hy = a.rig.y - 96;
    const cx = Math.min(w - 84, Math.max(84, hx + side * 96)), cy = Math.max(-top + 64, hy - 50);
    const outer = el('g', { class: 'thought', transform: `translate(${cx.toFixed(1)} ${cy.toFixed(1)})` }, this.L.fx);
    const g = el('g', {}, outer);
    const ink = el('g', { filter: 'url(#boil)' }, g);
    // the little bubbles from his head to the cloud
    [[hx - cx, hy - cy, 5], [(hx - cx) * 0.62, (hy - cy) * 0.62 - 6, 8]].forEach(([x, y, r], i) => {
      el('path', { d: blob(x, y, r, r * 0.9, { seed: 40 + i, n: 8 }), fill: '#fbf7ee', stroke: INK, 'stroke-width': 2.4 }, ink);
    });
    const cloud = [blob(0, 0, 78, 50, { seed: 44, n: 11, wob: 0.06 }), blob(-46, -18, 34, 28, { seed: 45, n: 9 }), blob(42, -22, 36, 28, { seed: 46, n: 9 }), blob(8, 30, 42, 24, { seed: 47, n: 9 })];
    // one cloud of four puffs: every outline first (twice as thick: the fills cover its inner half), then the fills over them
    for (const d of cloud) el('path', { d, fill: '#fbf7ee', stroke: INK, 'stroke-width': 5.2 }, ink);
    for (const d of cloud) el('path', { d, fill: '#fbf7ee' }, ink);
    // the repeat block: a tape C-block, its coil on the arm, an arrow card in its mouth
    const d = DIMS_COMPACT, bw = 92, arm = 30, mouth = 30, foot = 14;
    const block = el('g', { transform: `translate(${-bw / 2} ${-(arm + mouth + foot) / 2})` }, g);
    el('path', { d: cPath(bw, arm, mouth, foot, d), transform: 'translate(2 3)', fill: 'rgba(84, 62, 38, 0.2)' }, block);
    el('path', { d: cPath(bw, arm, mouth, foot, d), fill: TAPE_FILL, stroke: INK, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, block);
    el('path', { d: 'M14,19 C17,8 21,8 22,14 C23,20 18,20 20,12 C22,5 27,6 28,13 C29,19 24,19 26,11 C28,5 33,7 34,12', fill: 'none', stroke: INK, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, block);
    const card = el('g', { transform: `translate(${d.spine} ${arm})` }, block);
    el('path', { d: cardPath(40, mouth, { ...d, h: mouth }), fill: '#eeac7f', stroke: INK, 'stroke-width': 2, 'stroke-linejoin': 'round' }, card);
    el('path', { d: 'M9,15 L29,15 M22,9 L29,15 L22,21', fill: 'none', stroke: INK, 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, card);
    popAnim(g, { dur: 320, origin: '50% 100%' });
    await a.act(async () => {
      a.lookAt(side * 0.8, -0.6, 2400);
      a.rig.mouth = 'o';
      await a.wait(REDUCED ? 1400 : 2400);
      a.rig.mouth = 'smile';
    });
    if (!outer.isConnected) return;
    if (REDUCED) { outer.remove(); return; }
    g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished.then(() => outer.remove()).catch(() => outer.remove());
  }
}
