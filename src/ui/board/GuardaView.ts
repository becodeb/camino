// Sheet 14's board: a page of the squared notebook ("cuaderno
// cuadriculado") lying on the riverbank, the river running past its top.
// The guarda to draw is a faint pencil line on it. Brote walks the paper's
// lines from crossing to crossing, and every step inks the segment under his
// feet in blue pen: he is the pen. A step off the pencil guide smudges the
// ink (a blot, "¡Uy!") and stops the run; a notebook that ends too soon
// leaves the next pencil segment calling. The guarda finished, the teacher's
// blue loop goes round it, stars pop along the ink and Brote celebrates.
//
// A subclass of the board view: the same Brote and run contract (play with
// onStep, the outcome), a different world. The grid's points are the board's
// cells, at Brote's feet (BoardView.feet).

import { blob, el, penLoop, rng, smoothOpen, wobblyLine, wobblyPoly } from '../../ink/ink.js';
import { E } from '../../ink/anim.js';
import { INK } from '../../ink/characters.js';
import { REDUCED } from '../runtime';
import { guidePath, segKey, type GuardaDef } from '../../game/guarda';
import type { Board, Cell, Trace, TraceStep } from '../../game/model';
import { BoardView, S, drawOn, feet, popAnim, type Frame } from './BoardView';

type Actor = NonNullable<BoardView['actor']>;

const PEN = '#3d6ea5';
const PENCIL = '#47444c';
const SAND = '#f3e8cf';
const WATER = '#9dbbd8';
const GROUND = '#eef0da';
const PAPER = '#fdfbf4';
const SQUARES = '#9dbbd8';
const SHADOW = 'rgba(84, 62, 38, 0.2)';

/** The paper around the page: the river above, the bank below. */
export const GUARDA_FRAME: Frame = { top: 64, right: 0, bottom: 58 };
/** The notebook page: inside the board's area, its squares' crossings at Brote's feet. */
const pageOf = (b: Board) => ({ x0: 10, y0: 14, x1: b.cols * S - 10, y1: b.rows * S + 42 });
const point = (c: Cell) => feet(c.c, c.r);

export class GuardaView extends BoardView {
  /** The segments inked in this run (by segKey). */
  private inked = new Set<string>();

  constructor(svg: SVGSVGElement, readonly def: GuardaDef) {
    super(svg);
  }

  setBoard(board: Board, opts: { pop?: boolean; frame?: Frame } = {}) {
    super.setBoard(board, { ...opts, frame: opts.frame ?? GUARDA_FRAME });
    this.L.floor.textContent = '';
    this.L.deco.textContent = '';
    this.inked.clear();
    this.drawBank(board);
    this.drawPage(board);
    this.drawGuide(board);
  }

  // ---------------------------------------------------------------- the world

  /** Sand (or the forest floor) all round; by the river, the water past the top with its ink edge, pebbles and reeds. */
  private drawBank(b: Board) {
    const f = this.frameT, river = b.look === 'river';
    const left = -16, right = b.cols * S + 16 + f.right, top = -f.top, bottom = b.rows * S + f.bottom;
    el('rect', { x: left, y: top, width: right - left, height: bottom - top, fill: river ? SAND : GROUND }, this.L.floor);
    const R = rng(b.seed + 13);
    if (river) {
      const pts: [number, number][] = Array.from({ length: 9 }, (_, i) => [left + ((right - left) * i) / 8, top + 34 + Math.sin(i * 1.4 + b.seed) * 5 + (R() - 0.5) * 5]);
      const edge = smoothOpen(pts);
      el('path', { d: `M${left},${top} L${right},${top} L${right},${pts[8][1]} ${smoothOpen([...pts].reverse()).replace(/^M/, 'L')} Z`, fill: WATER }, this.L.floor);
      el('path', { d: edge, transform: 'translate(0 -6)', fill: 'none', stroke: '#fbf7ee', 'stroke-width': 2.2, opacity: 0.85, 'stroke-linecap': 'round' }, this.L.floor);
      el('path', { d: edge, fill: 'none', stroke: INK, 'stroke-width': 2.6, 'stroke-linecap': 'round' }, this.L.floor);
      for (let i = 0; i < Math.max(3, b.cols); i++) {
        const x = left + 40 + ((right - left - 80) * (i + R() * 0.6)) / Math.max(3, b.cols), y = top + 10 + R() * 12;
        el('path', { d: `M${x.toFixed(1)},${y.toFixed(1)} q7,-4.5 14,0 t14,0`, fill: 'none', stroke: '#fbf7ee', 'stroke-width': 2.4, 'stroke-linecap': 'round', opacity: 0.9 }, this.L.floor);
      }
      const lx = right - 90, ly = top + 18;
      el('path', { d: blob(lx, ly, 14, 7, { seed: b.seed + 2, n: 9 }), fill: '#a4b86d', stroke: INK, 'stroke-width': 2 }, this.L.floor);
      el('path', { d: `M${lx},${ly} l12,-2`, stroke: WATER, 'stroke-width': 3, 'stroke-linecap': 'round' }, this.L.floor);
    }
    // pebbles (sand) or tufts (forest) round the page
    const page = pageOf(b);
    for (let i = 0; i < 10; i++) {
      const side = i % 4;
      const x = side === 0 ? left + 4 + R() * 8 : side === 1 ? right - 10 - R() * 8 : page.x0 + R() * (page.x1 - page.x0);
      const y = side < 2 ? page.y0 + R() * (page.y1 - page.y0) : page.y1 + 12 + R() * (bottom - page.y1 - 16);
      if (river) el('ellipse', { cx: x.toFixed(1), cy: y.toFixed(1), rx: (3 + R() * 2.4).toFixed(1), ry: (2.2 + R() * 1.4).toFixed(1), fill: '#d8c9a6', stroke: INK, 'stroke-width': 1.1, opacity: 0.6 }, this.L.floor);
      else if (i % 3 === 0) el('path', { d: `M${x - 3},${y} l-5,-9 M${x},${y} l0,-12 M${x + 3},${y} l6,-8`, stroke: INK, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.7, fill: 'none' }, this.L.floor);
    }
    // reeds on the strip of sand between the water and the page
    if (river) {
      this.reeds(page.x0 + 44, page.y0 - 3, b.seed + 1);
      this.reeds(page.x1 - 70, page.y0 - 2, b.seed + 5);
    }
  }

  /** Reeds on the bank: thin stems, brown tops. */
  private reeds(x: number, y: number, seed: number) {
    const R = rng(seed);
    const g = el('g', { opacity: 0.9 }, this.L.floor);
    [-8, -2, 5, 11].forEach((dx, i) => {
      const h = 30 + R() * 16, lean = (R() - 0.5) * 8;
      el('path', { d: `M${x + dx},${y} Q${x + dx + lean / 2},${y - h / 2} ${x + dx + lean},${y - h}`, fill: 'none', stroke: INK, 'stroke-width': 1.8, 'stroke-linecap': 'round' }, g);
      if (i % 2 === 0) el('path', { d: blob(x + dx + lean, y - h + 6, 3, 7, { seed: seed + i, n: 7 }), fill: '#9c6b43', stroke: INK, 'stroke-width': 1.4 }, g);
    });
  }

  /** The notebook page: whiter paper with a flat shadow, pale blue squares through the crossings, the red margin line. */
  private drawPage(b: Board) {
    const p = pageOf(b);
    const d = wobblyPoly([[p.x0, p.y0], [p.x1, p.y0 + 2], [p.x1 - 1, p.y1], [p.x0 + 2, p.y1 - 1]], { wob: 1.2, bow: 2, seed: b.seed + 4 });
    el('path', { d, transform: 'translate(6 7)', fill: SHADOW }, this.L.floor);
    el('path', { d, fill: PAPER }, this.L.floor);
    const g = el('g', { class: 'squares', stroke: SQUARES, 'stroke-width': 1.8, opacity: 0.75, 'stroke-linecap': 'round', fill: 'none' }, this.L.floor);
    for (let c = 0; c < b.cols; c++) {
      const x = c * S + S / 2;
      el('path', { d: wobblyLine(x, p.y0 + 3, x, p.y1 - 3, { bow: 1, seed: b.seed + c * 7, segs: 3, jit: 0.6 }) }, g);
    }
    for (let r = 0; r < b.rows; r++) {
      const y = point({ c: 0, r }).y;
      el('path', { d: wobblyLine(p.x0 + 3, y, p.x1 - 3, y, { bow: 1, seed: b.seed + r * 11, segs: 4, jit: 0.6 }) }, g);
    }
    el('path', { d: wobblyLine(p.x0 + 22, p.y0 + 3, p.x0 + 22, p.y1 - 3, { bow: 1, seed: b.seed + 9, segs: 3 }), stroke: '#c9574a', 'stroke-width': 2.2, opacity: 0.55, fill: 'none', 'stroke-linecap': 'round' }, this.L.floor);
    el('path', { d, fill: 'none', stroke: INK, 'stroke-width': 2.6, 'stroke-linejoin': 'round' }, this.L.floor);
  }

  /** The guarda to draw: a faint pencil line, a little wobbly, like one a teacher traced. */
  private drawGuide(b: Board) {
    const path = guidePath(b, this.def);
    const g = el('g', { class: 'guide', stroke: PENCIL, 'stroke-width': 5.5, opacity: 0.34, fill: 'none', 'stroke-linecap': 'round' }, this.L.deco);
    path.slice(1).forEach((c, i) => {
      const a = point(path[i]), z = point(c);
      el('path', { d: wobblyLine(a.x, a.y, z.x, z.y, { bow: 1.4, seed: b.seed + i * 3 }) }, g);
    });
  }

  // ---------------------------------------------------------------- ink

  /** One segment in blue pen, drawn from `a` to `b` in `ms` (after `delay`). */
  private ink(a: Cell, z: Cell, ms: number, delay = 0, seed = 1) {
    const p = point(a), q = point(z);
    const path = el('path', { d: wobblyLine(p.x, p.y, q.x, q.y, { bow: 1.2, seed }), stroke: PEN, 'stroke-width': 8, fill: 'none', 'stroke-linecap': 'round' }, this.L.trail);
    if (!REDUCED) drawOn(path, ms, delay);
  }

  /** The pen slipped: a blot of blue ink over the segment's end, a smear and two drops. */
  private smudge(a: Cell, z: Cell) {
    const p = point(a), q = point(z);
    const mx = p.x + (q.x - p.x) * 0.62, my = p.y + (q.y - p.y) * 0.62;
    const g = el('g', { class: 'smudge', transform: `translate(${mx.toFixed(1)} ${my.toFixed(1)})` }, this.L.trail);
    const inner = el('g', {}, g);
    const R = rng(Math.round(mx * 7 + my));
    el('path', { d: blob(0, 0, 30, 20, { wob: 0.22, n: 11, seed: Math.round(mx + my) }), fill: PEN, opacity: 0.32 }, inner);
    el('path', { d: blob(3, 2, 17, 11, { wob: 0.25, n: 9, seed: Math.round(mx) }), fill: PEN, opacity: 0.55 }, inner);
    el('path', { d: `M${-22 + R() * 6},${14} q14,8 30,2`, fill: 'none', stroke: PEN, 'stroke-width': 5, opacity: 0.4, 'stroke-linecap': 'round' }, inner);
    for (let i = 0; i < 2; i++) el('circle', { cx: (24 + R() * 10) * (i ? -1 : 1), cy: -14 + R() * 26, r: 3 + R() * 2.5, fill: PEN, opacity: 0.55 }, inner);
    popAnim(inner, { dur: 300, origin: '50% 50%' });
  }

  /** The pencil still to ink: a dashed blue pen over every segment of it, pulsing ("all this is missing"). Returns its middle. */
  private callRest() {
    const b = this.board;
    if (!b) return null;
    const path = guidePath(b, this.def);
    // on the paper, under Brote (he may stand on its first segment)
    const g = el('g', { class: 'guide-call', stroke: PEN, 'stroke-width': 5, 'stroke-dasharray': '3 11', 'stroke-linecap': 'round', fill: 'none' }, this.L.trail);
    const mids: { x: number; y: number }[] = [];
    for (let i = 1; i < path.length; i++) {
      if (this.inked.has(segKey(path[i - 1], path[i]))) continue;
      const p = point(path[i - 1]), q = point(path[i]);
      el('path', { d: `M${p.x},${p.y} L${q.x},${q.y}` }, g);
      mids.push({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    }
    if (!REDUCED) g.animate([{ opacity: 1 }, { opacity: 0.25 }, { opacity: 1 }], { duration: 700, iterations: 3 });
    return mids.length ? mids[Math.floor(mids.length / 2)] : null;
  }

  // ---------------------------------------------------------------- running

  /** One step: Brote walks to the next crossing and the pen follows him; off the guide it smudges; off the page he bumps. */
  private async walk(a: Actor, s: TraceStep): Promise<'ok' | 'smudge' | 'bump'> {
    if (s.crash?.out) {
      await this.playStep(a, s, 'full');
      return 'bump';
    }
    const from = { c: s.from.c, r: s.from.r }, to = s.cells[0];
    const dx = Math.sign(to.c - from.c), dy = Math.sign(to.r - from.r);
    if (dx && Math.sign(a.rig.face) !== dx) await a.T({ face: dx }, REDUCED ? 1 : 150, E.inOut);
    a.lookAt(dx, dy || 0.1, 800);
    this.ink(from, to, 300, 95, s.index * 7 + 3);
    await a.perform('step', point(to), { dx, dy });
    this.pos = { c: to.c, r: to.r, mask: 0 };
    if (s.kind !== 'crash') {
      this.inked.add(segKey(from, to));
      return 'ok';
    }
    this.smudge(from, to);
    a.lookAt(0, 0.9, 1200);
    a.rig.mouth = 'o';
    a.bubble('¡Uy!');
    if (!REDUCED) {
      await a.T({ sy: 0.86, sx: 1.12 }, 90, E.out);
      await a.T({ sy: 1.04, sx: 0.97, sprout: 30 }, 160, E.out);
      await a.T({ sy: 1, sx: 1 }, 160, E.inOut);
    }
    await a.wait(650);
    a.rig.mouth = 'smile';
    a.rig.sprout = 0;
    return 'smudge';
  }

  /**
   * Plays a run: Brote walks and inks. `onStep` fires as each step starts
   * (the notebook rings the card). Resolves with the outcome once Brote has
   * reacted: the celebration, the smudge, or a look at the next pencil line.
   */
  async play(trace: Trace, opts: {
    onStep?: (s: TraceStep) => void; celebrate?: boolean; quiet?: boolean; gate?: () => Promise<void>; onDone?: () => void;
  } = {}): Promise<'win' | 'crash' | 'short' | 'aborted'> {
    const a = this.actor, b = this.board;
    if (!a || !b) return 'aborted';
    this.running = true;
    this.clearMarks();
    const away = this.pos.c !== b.start.c || this.pos.r !== b.start.r || this.L.trail.childNodes.length > 0;
    let result = 'short' as 'win' | 'crash' | 'short';
    const ok = await a.act(async () => {
      await a.settle(120);
      if (away) {
        this.L.trail.textContent = '';
        this.inked.clear();
        this.pos = { c: b.start.c, r: b.start.r, mask: 0 };
        await a.poofTo(feet(b.start.c, b.start.r));
        await a.wait(150);
      }
      for (const s of trace.steps) {
        if (opts.gate) await opts.gate();
        opts.onStep?.(s);
        const r = await this.walk(a, s);
        if (r !== 'ok') { result = 'crash'; return; }
        if (!REDUCED) await a.wait(90);
      }
      result = trace.outcome === 'win' ? 'win' : 'short';
    }).finally(() => opts.onDone?.());
    if (!ok) { this.running = false; return 'aborted'; }
    if (result === 'win') { if (opts.celebrate !== false) await this.celebrate(); }
    else if (result === 'short' && !opts.quiet) await this.shortGuarda();
    this.running = false;
    // a long border is not a quiet page: Brote dozes off only after a while without anyone
    this.lastInput = performance.now();
    return result;
  }

  /** Too short: the pencil still to ink calls, Brote looks at it, "¿Mmm?". */
  private async shortGuarda() {
    const a = this.actor;
    if (!a) return;
    const spot = this.callRest();
    await a.act(async () => {
      if (spot) {
        const dx = spot.x - a.rig.x, dy = spot.y - (a.rig.y - 43), d = Math.hypot(dx, dy) || 1;
        a.lookAt(dx / d, dy / d, 1700);
      }
      a.rig.mouth = 'wavy';
      a.bubble('¿Mmm?');
      await a.wait(1150);
      a.rig.mouth = 'smile';
    });
  }

  /** The guarda is done: the teacher's blue loop round it, stars along the ink, confetti, Brote celebrates. */
  async celebrate() {
    const a = this.actor, b = this.board;
    if (!a || !b) return;
    const pts = guidePath(b, this.def).map(point);
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const rx = (Math.max(...xs) - Math.min(...xs)) / 2 + 58, ry = (Math.max(...ys) - Math.min(...ys)) / 2 + 52;
    const ring = el('g', { class: 'goal-ring', filter: 'url(#boil)' }, this.L.fx);
    const loop = el('path', { d: penLoop(cx, cy, rx, ry, { seed: b.seed }), fill: 'none', stroke: PEN, 'stroke-width': 4, 'stroke-linecap': 'round' }, ring);
    drawOn(loop, 700, 100);
    const corners = pts.filter((_, i) => i === 0 || i === pts.length - 1 || i % 2 === 0);
    corners.forEach((p, i) => setTimeout(() => {
      if (!ring.isConnected) return;
      const star = el('path', { d: `M${p.x},${p.y - 16} l3.2,7.2 7.8,0 -6.2,4.8 2.4,7.6 -7.2,-4.6 -7.2,4.6 2.4,-7.6 -6.2,-4.8 7.8,0 Z`, fill: '#f0d27a', stroke: INK, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, ring);
      popAnim(star, { dur: 280, origin: '50% 50%' });
    }, REDUCED ? 0 : 200 + i * 80));
    this.burstConfetti(a.rig.x, a.rig.y - 50);
    await a.act(() => a.perform('celebrate'));
  }

  async reset(opts: { keepMarks?: boolean } = {}) {
    this.inked.clear();
    await super.reset(opts);
  }
}
