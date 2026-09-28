// The drawn board: a port of habilidades' BoardView (app/src/ui/board @ 9b90d1d,
// itself a port of demo-estilo/js/app.js) for boards of any size: floor,
// rocks, seeds to collect, the goal (a seed, or a pot that opens once the
// seeds are collected), Brote and his effects. Imperative on purpose: React
// owns the page, this class owns one <svg>. It only animates traces the pure
// engine (game/engine.ts) computed.

import { el, rng, blob, wobblyPoly, wobblyLine, penLoop, spiral, smoothClosed, smoothOpen, leaf } from '../../ink/ink.js';
import { tween, proc, wait, E, ABORT, engine } from '../../ink/anim.js';
import { INK, type CharacterDef } from '../../ink/characters.js';
import { onFrame, REDUCED } from '../runtime';
import { dress, outfitWords } from '../outfit';
import type { Outfit } from '../../curriculum/motivation';
import { DELTA, obstacleAt, visibleFrom, type Board, type Cell, type Dir, type Obstacle, type RobotState, type Trace, type TraceStep } from '../../game/model';

export const S = 100;
/** Space above the grid, in board units. */
export const TOP = 46;
/** A one-row path alone on its sheet gets a sky: room for Brote's jumps, and a landscape so the sheet fills its zone. */
const SKY = 320;
/** Stacked one-row sheets (2do page 2): a little headroom, and Brote hops low on them (see `low`). */
const LOW_TOP = 100;
/** 3ro page 2: room on the right of the grid for the jar of points. */
export const JAR_W = 150;
const SCALE = 1.1;
const CONFETTI = ['#de8a56', '#c9574a', '#e7a3a0', '#7298c1', '#f0d27a', '#a4b86d'];
const PERSIST = ['leaves', 'leafNew', 'roll', 'size'];
const now = () => performance.now();
export const feet = (c: number, r: number) => ({ x: c * S + S / 2, y: r * S + 78 });
/** The paper around the grid, in board units: headroom above, the jar's room on the right, a margin below. */
export interface Frame { top: number; right: number; bottom: number }

/**
 * The frame of a board: one-row paths get headroom for their jumps (a whole
 * sky when the path is alone on its sheet, a little when three sheets are
 * stacked); a game needs room above the grid (hops, falling seeds); the jar
 * of points sits on the right.
 */
export function frameOf(b: Board, o: { worlds?: number; game?: boolean; jar?: boolean } = {}): Frame {
  // a game (3ro) is won in the top row: Brote's celebration stays on the sheet; seeds appear up there too
  const top = b.rows === 1 ? ((o.worlds ?? 1) > 1 ? LOW_TOP : SKY) : o.game ? 128 : TOP;
  return { top, right: o.jar ? JAR_W : 0, bottom: 16 };
}

/** Width / height of a board's viewBox, so the sheet around it can keep its shape. */
export const aspectOf = (b: Board, f: Frame = frameOf(b)) => (b.cols * S + 32 + f.right) / (b.rows * S + f.top + f.bottom);

type Rig = Record<string, any>;

// ------------------------------------------------------------------ figure
let uidN = 0;

/** A character drawn in `parent`, its eyes and mouth ready to pose, dressed in `outfit` (ui/outfit.ts). */
export function buildFigure(def: CharacterDef, parent: SVGElement, outfit?: Outfit) {
  const uid = `f${++uidN}`;
  const body = el('g', {}, parent);
  const parts = def.build(body, uid);
  const eyes = def.eyes.map((e, i) => {
    const g = el('g', {}, body);
    const open = el('g', {}, g);
    el('ellipse', { cx: e.x, cy: e.y, rx: e.rx, ry: e.ry, fill: '#fbf6ea', stroke: INK, 'stroke-width': 2.4 }, open);
    const pupil = el('circle', { cx: e.x, cy: e.y, r: e.pr, fill: INK }, open);
    const line = { fill: 'none', stroke: INK, 'stroke-width': 2.6, 'stroke-linecap': 'round' };
    const closed = el('path', { d: `M${e.x - e.rx},${e.y - 0.5} Q${e.x},${e.y + e.ry * 0.85} ${e.x + e.rx},${e.y - 0.5}`, ...line }, g);
    const happy = el('path', { d: `M${e.x - e.rx},${e.y + 2.5} Q${e.x},${e.y - e.ry * 1.15} ${e.x + e.rx},${e.y + 2.5}`, ...line }, g);
    const dizzy = el('path', { d: spiral(e.x, e.y, e.rx * 0.95, 2.1, 7 + i), ...line, 'stroke-width': 2 }, g);
    return { e, open, pupil, closed, happy, dizzy, mode: '' };
  });
  const mouth = def.mouth ? el('path', { stroke: INK, 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, body) : null;
  dress(def, body, parts, outfit, uid);
  return { def, body, parts, eyes, mouth, mouthType: '' };
}
type Figure = ReturnType<typeof buildFigure>;

function mouthShape(type: string, m: { x: number; y: number; w: number }): [string, string] {
  const { x, y, w } = m;
  const h = w / 2;
  switch (type) {
    case 'grin': return [`M${x - h * 1.15},${y - 1.5} Q${x},${y + w * 1.05} ${x + h * 1.15},${y - 1.5} Z`, '#7b3129'];
    case 'o': return [`M${x - 2.6},${y + 1} a2.6,3.2 0 1,0 5.2,0 a2.6,3.2 0 1,0 -5.2,0`, '#7b3129'];
    case 'yawn': return [`M${x - h},${y + 3} a${h},${h * 1.3} 0 1,0 ${2 * h},0 a${h},${h * 1.3} 0 1,0 ${-2 * h},0`, '#7b3129'];
    case 'wavy': return [`M${x - h},${y + 1} q${w / 8},-3 ${w / 4},0 t${w / 4},0 t${w / 4},0 t${w / 4},0`, 'none'];
    default: return [`M${x - h},${y - 1} Q${x},${y + w * 0.55} ${x + h},${y - 1}`, 'none'];
  }
}

export function poseFigure(fig: Figure, rig: Rig, look: { x: number; y: number }, blink: number) {
  for (const E_ of fig.eyes) {
    let mode = rig.eyes;
    if (mode === 'open' && blink > 0.82) mode = 'closed';
    if (mode !== E_.mode) {
      E_.open.setAttribute('display', mode === 'open' ? 'inline' : 'none');
      E_.closed.setAttribute('display', mode === 'closed' ? 'inline' : 'none');
      E_.happy.setAttribute('display', mode === 'happy' ? 'inline' : 'none');
      E_.dizzy.setAttribute('display', mode === 'dizzy' ? 'inline' : 'none');
      E_.mode = mode;
    }
    if (mode === 'open') {
      const e = E_.e;
      const s = Math.max(0.08, 1 - blink);
      E_.open.setAttribute('transform', `translate(0 ${e.y}) scale(1 ${s.toFixed(3)}) translate(0 ${-e.y})`);
      E_.pupil.setAttribute('cx', (e.x + look.x * (e.rx - e.pr - 0.4)).toFixed(2));
      E_.pupil.setAttribute('cy', (e.y + look.y * (e.ry - e.pr - 0.4)).toFixed(2));
    }
  }
  if (fig.mouth && fig.def.mouth && rig.mouth !== fig.mouthType) {
    const [d, fill] = mouthShape(rig.mouth, fig.def.mouth);
    fig.mouth.setAttribute('d', d);
    fig.mouth.setAttribute('fill', fill);
    fig.mouthType = rig.mouth;
  }
}

/** A still portrait (tabs, start screen, the map, the bar), dressed: a complete rig so no NaN reaches a transform. */
export function drawPortrait(def: CharacterDef, svg: SVGSVGElement, look = { x: 0.15, y: 0.25 }, mood: 'smile' | 'grin' = 'smile', outfit?: Outfit) {
  svg.textContent = '';
  svg.setAttribute('data-character', def.id);
  svg.setAttribute('data-outfit', outfitWords(outfit));
  const fig = buildFigure(def, svg, outfit);
  const rig = { hop: 0, sx: 1, sy: 1, lean: 0, spin: 0, face: 1, eyes: mood === 'grin' ? 'happy' : 'open', mouth: mood, ...JSON.parse(JSON.stringify(def.defaults)) };
  poseFigure(fig, rig, look, 0);
  def.render(rig, fig.parts, { t: 0, dt: 0.016, vx: 0, vy: 0, ay: 0 });
}

// ------------------------------------------------------------------ board view
let fogN = 0;

export class BoardView {
  readonly svg: SVGSVGElement;
  board: Board | null = null;
  L: Record<string, SVGGElement> = {};
  actor: Actor | null = null;
  goalNodes: GoalNodes | null = null;
  goalState = { hop: 0, dx: 0, spin: 0, scale: 1 };
  pickupNodes: SVGGElement[] = [];
  confetti: any[] = [];
  currentBubble: SVGGElement | null = null;
  gaze = { x: 250, y: 200, t: -1e9, override: null as null | { x: number; y: number; until: number }, idle: { x: 0, y: 0.2, next: 0 } };
  pos: RobotState = { c: 0, r: 0, mask: 0 };
  onCharacterTap: (() => void) | null = null;
  private unsub: () => void;
  /** The last time the child touched the page (Brote falls asleep 16 s after it). */
  protected lastInput = now();
  private nextFidget = now() + 5000;
  private idleTimer: number;
  running = false;

  constructor(svg: SVGSVGElement) {
    this.svg = svg;
    svg.textContent = '';
    for (const n of ['floor', 'deco', 'marks', 'obst', 'goal', 'trail', 'fog', 'shadow', 'actor', 'rain', 'fx', 'pick']) {
      this.L[n] = el('g', { class: `layer-${n}` }, svg);
    }
    for (const n of ['floor', 'deco', 'obst', 'trail', 'fog']) this.L[n].setAttribute('filter', 'url(#boil)');
    this.unsub = onFrame((t, dt) => this.frame(t, dt));
    const move = (e: PointerEvent) => {
      const p = this.toBoard(e.clientX, e.clientY);
      if (p) { this.gaze.x = p.x; this.gaze.y = p.y; this.gaze.t = now(); }
      this.lastInput = now();
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', this.wakeOnInput, { passive: true });
    this.removeListeners = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', this.wakeOnInput);
    };
    this.idleTimer = window.setInterval(() => this.idleTick(), 300);
  }

  private removeListeners: () => void;

  destroy() {
    this.unsub();
    this.removeListeners();
    clearInterval(this.idleTimer);
    this.actor?.destroy();
    this.actor = null;
    engine.abort('goal');
  }

  private wakeOnInput = () => {
    this.lastInput = now();
    if (this.actor?.sleeping) this.actor.wake();
  };

  toBoard(clientX: number, clientY: number) {
    const m = this.svg.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  // ---------------------------------------------------------------- drawing
  frameT: Frame = { top: TOP, right: 0, bottom: 16 };

  setBoard(board: Board, opts: { pop?: boolean; frame?: Frame } = {}) {
    this.board = board;
    const w = board.cols * S, h = board.rows * S;
    const f = this.frameT = opts.frame ?? frameOf(board);
    // extra room on top: characters in the first row and their jumps stick out of the grid
    this.svg.setAttribute('viewBox', `-16 -${f.top} ${w + 32 + f.right} ${h + f.top + f.bottom}`);
    for (const n of ['floor', 'deco', 'marks', 'obst', 'goal', 'trail', 'fog', 'rain', 'fx']) this.L[n].textContent = '';
    this.fallers.clear();
    this.jar = null;
    this.fogTiles.clear();
    this.confetti = [];
    const R = rng(board.seed + 5);
    const river = board.look === 'river';
    el('rect', { x: 0, y: 0, width: w, height: h, fill: river ? SAND : '#f6efdf' }, this.L.floor);
    if (river) drawSand(this.L.floor, board);
    for (let c = 1; c < board.cols; c++) {
      el('path', { d: wobblyLine(c * S + (R() - 0.5) * 2, 2, c * S + (R() - 0.5) * 2, h - 2, { bow: 1.6, seed: c * 11 + board.seed, segs: 3, jit: 1 }), stroke: INK, 'stroke-width': 1.8, opacity: 0.42, fill: 'none', 'stroke-linecap': 'round' }, this.L.floor);
    }
    for (let r = 1; r < board.rows; r++) {
      el('path', { d: wobblyLine(2, r * S + (R() - 0.5) * 2, w - 2, r * S + (R() - 0.5) * 2, { bow: 1.6, seed: r * 13 + board.seed, segs: 4, jit: 1 }), stroke: INK, 'stroke-width': 1.8, opacity: 0.42, fill: 'none', 'stroke-linecap': 'round' }, this.L.floor);
    }
    if (board.obstacles.some((o) => o.kind === 'earth')) drawStone(this.L.floor, board);
    if (board.obstacles.some((o) => o.kind === 'water') || board.ford?.length) drawWater(this.L.floor, board);
    el('path', { d: wobblyPoly([[0, 0], [w, 0], [w, h], [0, h]], { wob: 1.5, bow: 2.5, seed: board.seed }), fill: 'none', stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' }, this.L.floor);
    if (f.top >= 150) drawSky(this.L.deco, board, f.top);

    for (const d of board.deco) {
      const x = d.c * S + S / 2 + d.dx, y = d.r * S + d.dy + 50;
      const RR = rng(d.seed);
      if (river) { drawReeds(this.L.deco, x, y + 4, d.seed); continue; }
      const a = -0.5 - RR() * 0.3, b = 0.4 + RR() * 0.3;
      el('path', {
        d: `M${x - 3},${y} l${(a * 10).toFixed(1)},-9 M${x},${y} l${(RR() - 0.5) * 3},-12 M${x + 3},${y} l${(b * 10).toFixed(1)},-8`,
        stroke: INK, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.8, fill: 'none',
      }, this.L.deco);
    }

    const sp = feet(board.start.c, board.start.r);
    el('ellipse', { cx: sp.x, cy: sp.y, rx: 34, ry: 10, fill: 'none', stroke: '#3d6ea5', 'stroke-width': 2.6, 'stroke-dasharray': '2 7', 'stroke-linecap': 'round' }, this.L.marks);

    const pops: SVGElement[] = [];
    for (const o of board.obstacles) {
      if (o.kind === 'earth' || o.kind === 'water') continue;
      const g = el('g', { transform: `translate(${o.c * S + S / 2} ${o.r * S + S / 2})` }, this.L.obst);
      pops.push(drawObstacle(g, o));
    }
    this.pickupNodes = board.pickups.map((p, i) => {
      const g = el('g', { transform: `translate(${p.c * S + S / 2} ${p.r * S + S / 2 + 10})`, 'data-guide': 'pickup' }, this.L.goal);
      pops.push(drawPickup(g, board.seed + i));
      return g;
    });
    this.goalNodes = null;
    if (board.goalKind !== 'none') {
      const gOuter = el('g', { transform: `translate(${board.goal.c * S + S / 2} ${board.goal.r * S + S / 2 + 6})`, 'data-guide': 'target' }, this.L.goal);
      this.goalNodes = board.goalKind === 'pot' ? drawPot(gOuter, board.seed) : drawSeedGoal(gOuter, board.seed);
      pops.push(this.goalNodes.mover);
    }
    Object.assign(this.goalState, { hop: 0, dx: 0, spin: 0, scale: 1 });
    this.pos = { c: board.start.c, r: board.start.r, mask: 0 };
    this.setGoalOpen(board.pickups.length === 0, false);
    if (opts.pop) pops.forEach((n, i) => popAnim(n, { dur: 320, delay: 80 + i * 70 }));
    if (this.fog) this.coverFog();
    this.guess = null;
    if (this.onPick) this.drawPick();
  }

  // ---------------------------------------------------------------- predict: the child taps where Brote will end
  private onPick: ((cell: Cell) => void) | null = null;
  private guess: SVGGElement | null = null;

  /** The cells Brote could stand on take taps (a hit square each, `data-cell="c,r"`, over everything); null stops it. */
  setPicking(fn: ((cell: Cell) => void) | null) {
    this.onPick = fn;
    this.drawPick();
  }

  private drawPick() {
    const b = this.board;
    this.L.pick.textContent = '';
    if (!b || !this.onPick) return;
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        if (obstacleAt(b, c, r)) continue;
        const cell = el('rect', { x: c * S + 2, y: r * S + 2, width: S - 4, height: S - 4, rx: 10, class: 'cell-pick', 'data-cell': `${c},${r}` }, this.L.pick);
        cell.addEventListener('click', () => this.onPick?.({ c, r }));
      }
    }
  }

  /** The child's guess: a blue pen ring drawn round the cell, under Brote (null clears it). */
  setGuess(cell: Cell | null) {
    this.guess?.remove();
    this.guess = null;
    if (!cell || !this.board) return;
    const outer = el('g', { class: 'guess', transform: `translate(${cell.c * S + S / 2} ${cell.r * S + S / 2})`, 'data-guide': 'target' }, this.L.marks);
    const g = el('g', { filter: 'url(#boil)' }, outer);
    el('path', { d: blob(0, 4, 36, 32, { wob: 0.05, n: 10, seed: this.board.seed + cell.c * 7 + cell.r }), fill: 'rgba(114, 152, 193, 0.14)' }, g);
    const ring = el('path', { d: penLoop(0, 4, 42, 38, { seed: this.board.seed + cell.c + cell.r * 3 }), fill: 'none', stroke: '#3d6ea5', 'stroke-width': 4, 'stroke-linecap': 'round' }, g);
    drawOn(ring, 380);
    this.guess = outer;
  }

  /** ▶ before any guess: the cells ripple once, asking for a tap. */
  askPick() {
    if (REDUCED) return;
    this.L.pick.querySelectorAll<SVGRectElement>('.cell-pick').forEach((r, i) => {
      r.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 700, delay: (i % 7) * 40, easing: 'ease-in-out' });
    });
  }

  /** The run ended off the ring: Brote turns to it, it wiggles, "¿Mmm?". */
  async missed(guess: Cell) {
    const a = this.actor;
    if (!a) return;
    const dx = guess.c - this.pos.c, dy = guess.r - this.pos.r, d = Math.hypot(dx, dy) || 1;
    const inner = this.guess?.firstElementChild as SVGGElement | null;
    if (inner && !REDUCED) {
      inner.style.transformBox = 'fill-box';
      inner.style.transformOrigin = 'center';
      inner.animate([{ rotate: '0deg' }, { rotate: '-6deg', scale: '1.08' }, { rotate: '5deg' }, { rotate: '0deg', scale: '1' }], { duration: 520, delay: 200, easing: 'ease-out' });
    }
    await a.act(async () => {
      if (dx && Math.sign(a.rig.face) !== Math.sign(dx)) await a.T({ face: Math.sign(dx) }, REDUCED ? 1 : 150, E.inOut);
      a.lookAt(dx / d, dy / d, 1600);
      a.rig.mouth = 'wavy';
      a.bubble('¿Mmm?');
      await a.wait(1100);
      a.rig.mouth = 'smile';
    });
  }

  // ---------------------------------------------------------------- fog (2do)
  /** The board is covered in pencil fog; Brote only sees the cells next to him. */
  fog = false;
  private fogTiles = new Map<string, SVGGElement>();

  setFog(on: boolean) {
    this.fog = on;
    if (on) this.coverFog();
    else this.clearFog();
  }

  /** Fog everywhere but around the start cell: a hatched pencil smudge per cell, overlapping into one cloud. */
  private coverFog() {
    const b = this.board;
    if (!b) return;
    this.clearFog();
    // the fog stays on the sheet's grid: its puffs overlap each other, never the paper around
    const id = `fog-clip-${b.seed}-${++fogN}`;
    const cp = el('clipPath', { id }, this.L.fog);
    el('rect', { x: -3, y: -3, width: b.cols * S + 6, height: b.rows * S + 6 }, cp);
    const clip = el('g', { 'clip-path': `url(#${id})` }, this.L.fog);
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        const seed = b.seed * 31 + c * 7 + r * 13;
        const g = el('g', { class: 'fog-tile' }, clip);
        const d = blob(c * S + S / 2, r * S + S / 2, S * 0.7, S * 0.68, { wob: 0.1, n: 9, seed });
        el('path', { d, fill: '#e3dac6' }, g);
        el('path', { d, fill: 'url(#fog-hatch)' }, g);
        // a couple of loose pencil strokes, like shading done in a hurry
        const R = rng(seed);
        for (let i = 0; i < 2; i++) {
          const x = c * S + 18 + R() * 50, y = r * S + 24 + R() * 52;
          el('path', { d: wobblyLine(x, y, x + 26 + R() * 12, y - 16 - R() * 8, { bow: 2, seed: seed + i }), stroke: '#47444c', 'stroke-width': 1.8, opacity: 0.35, fill: 'none', 'stroke-linecap': 'round' }, g);
        }
        g.style.transformBox = 'fill-box';
        g.style.transformOrigin = 'center';
        this.fogTiles.set(`${c},${r}`, g);
      }
    }
    for (const cell of visibleFrom(b, b.start)) this.lift(cell, false);
  }

  private clearFog() {
    this.L.fog.textContent = '';
    this.fogTiles.clear();
  }

  /** The fog of one cell is rubbed out (an eraser, not a fade to blur). */
  private lift(cell: Cell, animate = true, delay = 0) {
    const k = `${cell.c},${cell.r}`;
    const g = this.fogTiles.get(k);
    if (!g) return;
    this.fogTiles.delete(k);
    if (!animate || REDUCED) { g.remove(); return; }
    g.animate([{ transform: 'scale(1) rotate(0deg)', opacity: 1 }, { transform: 'scale(0.35) rotate(-12deg)', opacity: 0 }], { duration: 420, delay, easing: 'ease-in', fill: 'forwards' })
      .finished.then(() => g.remove()).catch(() => g.remove());
  }

  /** Brote arrived at `cell`: he now sees it and the cells next to it. */
  revealAround(cell: Cell) {
    if (!this.fog || !this.board) return;
    for (const x of visibleFrom(this.board, cell)) this.lift(x);
  }

  /** After a run the whole world shows, from where Brote stands outwards. */
  revealAll() {
    if (!this.fog) return;
    for (const [k] of [...this.fogTiles]) {
      const [c, r] = k.split(',').map(Number);
      this.lift({ c, r }, true, 90 * (Math.abs(c - this.pos.c) + Math.abs(r - this.pos.r)));
    }
  }

  /**
   * The pot "opens" once every seed was collected: its paper lid pops off and a
   * dotted blue ring waits for Brote. Closed, the lid stays on (a seed goal is always open).
   */
  setGoalOpen(open: boolean, animate = true) {
    const g = this.goalNodes;
    if (!g?.lid || !g.ring) return;
    const was = g.lid.getAttribute('opacity') === '0';
    g.lid.setAttribute('opacity', open ? '0' : '1');
    g.ring.setAttribute('opacity', open ? '1' : '0');
    if (open && !was && animate) {
      const b = this.board!;
      this.puff(b.goal.c * S + S / 2, b.goal.r * S + S / 2 - 6);
      popAnim(g.ring, { dur: 360, origin: '50% 50%' });
    }
  }

  /**
   * Who plays on this board, dressed (a new one pops in with a puff where the
   * last one stood). `at`: a spot of its own (a stage without a board).
   */
  setCharacter(def: CharacterDef, outfit?: Outfit, at?: { x: number; y: number }) {
    const face = this.actor ? Math.sign(this.actor.rig.face) || 1 : 1;
    const where = at ?? (this.actor ? { x: this.actor.rig.x, y: this.actor.rig.y } : feet(this.pos.c, this.pos.r));
    if (this.actor) {
      this.puff(this.actor.rig.x, this.actor.rig.y + this.actor.def.pivot * SCALE);
      this.actor.destroy();
    }
    this.actor = new Actor(this, def, where, outfit);
    this.actor.rig.face = face;
    const a = this.actor;
    a.act(() => a.popIn());
  }

  /** Back to the start cell with a puff; clears marks, trail and collected seeds. */
  async reset(opts: { keepMarks?: boolean } = {}) {
    const b = this.board, a = this.actor;
    if (!b || !a) return;
    if (!opts.keepMarks) this.clearMarks();
    this.L.trail.textContent = '';
    this.resetGoal();
    this.pickupNodes.forEach((n) => n.setAttribute('opacity', '1'));
    this.svg.querySelectorAll('.planted').forEach((n) => n.remove());
    this.setGoalOpen(b.pickups.length === 0, false);
    const home = feet(b.start.c, b.start.r);
    this.pos = { c: b.start.c, r: b.start.r, mask: 0 };
    if (this.fog) this.coverFog();
    await a.act(async () => {
      if (Math.hypot(a.rig.x - home.x, a.rig.y - home.y) > 1) await a.poofTo(home);
      else await a.settle(150);
    });
  }

  clearMarks() {
    this.L.fx.querySelectorAll('.bump-mark, .goal-ring').forEach((n) => n.remove());
  }

  // ---------------------------------------------------------------- running
  /**
   * Plays a simulated trace. `onStep` fires as each primitive starts so the
   * notebook can ring the running block. Resolves with the outcome once
   * Brote has finished reacting.
   */
  async play(trace: Trace, opts: {
    onStep?: (s: TraceStep) => void;
    celebrate?: boolean;
    quiet?: boolean;
    /** Several boards: wait here before every step until the others are ready (see game/lockstep). */
    gate?: () => Promise<void>;
    /** The steps are over (before any celebration or puzzlement): the others need not wait any more. */
    onDone?: () => void;
  } = {}): Promise<'win' | 'crash' | 'short' | 'aborted'> {
    const a = this.actor, b = this.board;
    if (!a || !b) return 'aborted';
    this.running = true;
    this.clearMarks();
    this.resetGoal();
    const startsAway = this.pos.c !== b.start.c || this.pos.r !== b.start.r || this.pos.mask !== 0;
    let result = 'short' as 'win' | 'crash' | 'short';
    const ok = await a.act(async () => {
      await a.settle(120);
      if (startsAway || this.L.trail.childNodes.length) {
        this.L.trail.textContent = '';
        this.svg.querySelectorAll('.planted').forEach((n) => n.remove());
        this.pickupNodes.forEach((n) => n.setAttribute('opacity', '1'));
        this.setGoalOpen(b.pickups.length === 0, false);
        this.pos = { c: b.start.c, r: b.start.r, mask: 0 };
        if (this.fog) this.coverFog();
        await a.poofTo(feet(b.start.c, b.start.r));
        await a.wait(150);
      }
      this.trail.start(a);
      for (const s of trace.steps) {
        if (opts.gate) await opts.gate();
        opts.onStep?.(s);
        const outcome = await this.playStep(a, s, 'full');
        if (outcome === 'crash') { result = 'crash'; return; }
        if (s.won) { result = 'win'; return; }
        if (!REDUCED) await a.wait(90);
      }
    }).finally(() => opts.onDone?.());
    this.trail.active = false;
    if (!ok) { this.running = false; return 'aborted'; }
    if (result === 'win') {
      if (opts.celebrate !== false) await this.celebrate();
    } else if (result === 'short' && !opts.quiet) {
      await this.puzzled();
    }
    this.running = false;
    return result;
  }

  /**
   * One step of a trace. `bump` is how a crash looks: the full bump (dizzy,
   * program mode) or a gentle one (direct control, sala 4).
   */
  protected async playStep(a: Actor, s: TraceStep, bump: 'full' | 'gentle'): Promise<'ok' | 'crash'> {
    const b = this.board!;
    const [dx, dy] = DELTA[s.dir];
    const dir = { dx, dy };
    if (dx && Math.sign(a.rig.face) !== dx) await a.T({ face: dx }, REDUCED ? 1 : 150, E.inOut);
    if (dy) a.lookAt(0, dy, 800); else a.lookAt(dx, 0.1, 800);
    if (s.kind === 'look') {
      // "si hay piedra" and there is none: Brote leans and peeks ahead, and stays
      if (REDUCED) { await a.wait(220); return 'ok'; }
      await a.T({ lean: 8 * (dx || 0), sy: 1.05, sx: 0.97 }, 160, E.out);
      await a.wait(140);
      await a.T({ lean: 0, sy: 1, sx: 1 }, 160, E.inOut);
      return 'ok';
    }
    for (const cell of s.cells) {
      const to = feet(cell.c, cell.r);
      if (this.low && !REDUCED) {
        // a stacked sheet has little headroom: a low hop, and a jump is only a higher one
        await this.lowHop(a, to, s.kind === 'jump' ? 34 : 12, s.kind === 'jump' ? 560 : 420);
      } else if (s.kind === 'jump' && !REDUCED) {
        // a jump is a step with a big arc on top: the character's own step, lifted
        const lift = proc(a, 520, (p) => { a.rig.lift = -Math.sin(p * Math.PI) * 58; });
        await Promise.all([a.perform('step', to, dir), lift]);
        a.rig.lift = 0;
      } else {
        await a.perform('step', to, dir);
      }
      this.pos = { c: cell.c, r: cell.r, mask: this.pos.mask };
      this.revealAround(cell);
      for (const i of s.collected) {
        const p = b.pickups[i];
        if (p.c === cell.c && p.r === cell.r) this.collect(i);
      }
    }
    this.pos = { ...this.pos, mask: s.to.mask };
    if (s.crash) {
      const here = feet(this.pos.c, this.pos.r);
      const reach = s.kind === 'jump' ? 2 : 1;
      const target = { x: here.x + dx * 100 * reach, y: here.y + dy * 100 * reach };
      const at = s.crash.at;
      // the little burst sits where Brote hit: on the rock, or on the edge he walked into
      const hit = s.crash.out
        ? { x: this.pos.c * S + S / 2 + dx * 50, y: this.pos.r * S + S / 2 + dy * 50 + (dx ? 20 : 0) }
        : { x: at.c * S + S / 2 - dx * 26, y: at.r * S + S / 2 + 12 - dy * 26 };
      a.onMark = () => {
        this.drawBump(hit.x, hit.y);
        // the closed pot rattles its lid: "not yet"
        const lid = s.crash?.closed ? this.goalNodes?.lid : null;
        if (lid && !REDUCED) {
          lid.style.transformBox = 'fill-box';
          lid.style.transformOrigin = '50% 100%';
          lid.animate([{ rotate: '0deg' }, { rotate: '-9deg', translate: '0 -5px' }, { rotate: '7deg' }, { rotate: '-4deg' }, { rotate: '0deg' }], { duration: 520, easing: 'ease-out' });
        }
      };
      if (bump === 'gentle') await this.nudge(a, target, dir);
      else await a.perform('bump', target, dir);
      a.mark();
      return 'crash';
    }
    return 'ok';
  }

  /** A one-row sheet stacked with others: too little headroom for Brote's own springy step. */
  get low() { return this.board?.rows === 1 && this.frameT.top < 130; }

  private async lowHop(a: Actor, to: { x: number; y: number }, arc: number, ms: number) {
    const bounce = proc(a, ms, (p) => {
      const k = Math.sin(p * Math.PI);
      a.rig.hop = -k * arc;
      a.rig.sy = 1 + k * 0.04;
      a.rig.sx = 1 - k * 0.03;
    });
    await Promise.all([a.T({ x: to.x, y: to.y }, ms, E.inOut), bounce]);
    Object.assign(a.rig, { hop: 0, sx: 1, sy: 1 });
  }

  /** A gentle bump for the youngest: lean into it, squash, a small "¡Uy!", back. No dizziness. */
  private async nudge(a: Actor, hit: { x: number; y: number }, d: { dx: number; dy: number }) {
    if (REDUCED) { a.mark(); a.bubble('¡Uy!'); await a.wait(400); return; }
    const r = a.rig;
    const home = { x: r.x, y: r.y };
    await a.T({ sy: 0.86, sx: 1.1 }, 80, E.out);
    await a.T({ x: r.x + (hit.x - r.x) * 0.22, y: r.y + (hit.y - r.y) * 0.22, sy: 1.06, sx: 0.95 }, 140, E.out);
    a.mark();
    await a.T(d.dx ? { sx: 0.84, sy: 1.1, lean: -6 * d.dx } : { sy: 0.84, sx: 1.12 }, 70, E.out);
    a.bubble('¡Uy!');
    await a.T({ x: home.x, y: home.y, sx: 1, sy: 1, lean: 0 }, 260, E.back);
    a.lookAt(-d.dx || 0.1, -d.dy || 0.1, 600);
  }

  /** Direct control (sala 4): one step right away from where Brote stands. Returns the new state. */
  async playDirect(s: TraceStep): Promise<'ok' | 'crash' | 'win' | 'aborted'> {
    const a = this.actor;
    if (!a) return 'aborted';
    this.running = true;
    this.clearMarks();
    const res = { out: 'ok' as 'ok' | 'crash' | 'win' };
    const ok = await a.act(async () => {
      await a.settle(60);
      res.out = await this.playStep(a, s, 'gentle');
      if (res.out === 'ok' && s.won) res.out = 'win';
    });
    if (ok && res.out === 'win') await this.celebrate();
    this.running = false;
    return ok ? res.out : 'aborted';
  }

  /** A card was just brought to the notebook (a music page rings its note); nothing on a plain board. */
  cardAdded(_cmd: string): void {}

  collect(i: number) {
    const n = this.pickupNodes[i];
    if (!n) return;
    const t = n.getAttribute('transform')!.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!;
    this.puff(+t[1], +t[2]);
    n.setAttribute('opacity', '0');
    this.actor?.bubble('¡Mía!');
    const b = this.board!;
    const mask = this.pos.mask | (1 << i);
    if (mask === (1 << b.pickups.length) - 1) this.setGoalOpen(true);
  }

  async celebrate() {
    const a = this.actor, b = this.board;
    if (!a || !b) return;
    let cx = this.pos.c * S + S / 2;
    const cy = this.pos.r * S + S / 2;
    if (b.goalKind === 'seed') {
      tween('goal', this.goalState, { hop: -60, dx: 48, spin: 360, scale: 0.8 }, REDUCED ? 1 : 520, E.out3).catch(() => {});
    } else if (b.goalKind === 'pot') {
      // Brote hops aside so the pot shows, and the seed he planted sprouts
      const side = b.goal.c > 0 ? -1 : 1;
      await a.act(async () => {
        await a.settle(60);
        a.T({ x: a.rig.x + side * 46 }, REDUCED ? 1 : 300, E.inOut);
        await a.T({ hop: -18, sy: 1.1, sx: 0.92, face: -side }, REDUCED ? 1 : 150, E.out);
        await a.T({ hop: 0, sy: 1, sx: 1 }, REDUCED ? 1 : 150, E.in);
      });
      const g = el('g', { class: 'planted', transform: `translate(${b.goal.c * S + S / 2} ${b.goal.r * S + S / 2 - 4})` }, this.L.goal);
      popAnim(drawSprout(g), { dur: 420, origin: '50% 100%' });
      cx += side * 22;
    }
    if (!this.L.fx.querySelector('.goal-ring')) this.goalRing(cx, cy);
    this.burstConfetti(cx, cy - 10);
    // on a stacked sheet the big celebration jumps would land on the sheet above: two happy nods instead
    if (this.low) await a.act(async () => { a.rig.eyes = 'happy'; a.rig.mouth = 'grin'; await a.perform('nod'); await a.perform('nod'); await a.wait(500); });
    else await a.act(() => a.perform('celebrate'));
  }

  protected goalRing(cx: number, cy: number) {
    const g = el('g', { class: 'goal-ring', filter: 'url(#boil)' }, this.L.fx);
    const p = el('path', { d: penLoop(cx + 6, cy + 4, 64, 56, { seed: this.board!.seed }), fill: 'none', stroke: '#3d6ea5', 'stroke-width': 3.6, 'stroke-linecap': 'round' }, g);
    drawOn(p, 560, 160);
  }

  /**
   * One world of several reached its seed: the pen ring and a happy nod, no
   * confetti yet (the page is won only when every world is).
   */
  async smallWin() {
    const a = this.actor;
    if (!a || !this.board) return;
    this.goalRing(this.pos.c * S + S / 2, this.pos.r * S + S / 2);
    await a.act(async () => {
      a.rig.eyes = 'happy';
      a.rig.mouth = 'grin';
      await a.perform('nod');
      await a.wait(250);
    });
  }

  async puzzled() {
    const a = this.actor;
    if (!a) return;
    await a.act(async () => {
      a.rig.mouth = 'wavy';
      a.bubble('¿Mmm?');
      a.lookAt(-0.9, 0.1, 400); await a.wait(400);
      a.lookAt(0.9, 0.1, 400); await a.wait(400);
      a.lookAt(0, 0.2, 300);
      a.rig.mouth = 'smile';
    });
  }

  resetGoal() {
    if (!this.goalNodes) return;
    tween('goal', this.goalState, { hop: 0, dx: 0, spin: 0, scale: 1 }, 200, E.inOut).catch(() => {});
  }

  // ---------------------------------------------------------------- fx
  /** Several worlds: a bump mark stays until the next run, so the sheet that failed is still marked at the end. */
  keepBumps = false;

  /** Where Brote bumped: a small ink burst with a yellow star (never a red cross: nothing is "wrong"). */
  drawBump(x: number, y: number) {
    const outer = el('g', { class: 'bump-mark', transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, this.L.fx);
    const g = el('g', { filter: 'url(#boil)' }, outer);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      el('path', { d: `M${(Math.cos(a) * 13).toFixed(1)},${(Math.sin(a) * 12).toFixed(1)} L${(Math.cos(a) * 23).toFixed(1)},${(Math.sin(a) * 21).toFixed(1)}`, stroke: INK, 'stroke-width': 2.6, 'stroke-linecap': 'round' }, g);
    }
    el('path', { d: 'M0,-10 L2.8,-3 10,-3 4.4,1.8 6.4,9 0,4.8 -6.4,9 -4.4,1.8 -10,-3 -2.8,-3Z', fill: '#f0d27a', stroke: INK, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
    popAnim(g, { dur: 260, origin: '50% 50%' });
    if (this.keepBumps) return;
    setTimeout(() => {
      if (!outer.isConnected || REDUCED) return;
      g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).finished.then(() => outer.remove()).catch(() => {});
    }, 1400);
  }

  bubble(x: number, y: number, text: string) {
    if (this.currentBubble) this.currentBubble.remove();
    const b = this.board;
    const maxX = b ? b.cols * S + 10 : 510;
    const w = Math.max(56, text.length * 10.5 + 24);
    // in the top row the bubble would stick out of the sheet: it goes beside the head instead
    const top = this.frameT.top;
    const high = y - 12 - 45 < -top;
    if (high) { x += (x < maxX / 2 ? 1 : -1) * (w / 2 + 34); y = -top + 57; }
    const cx = Math.min(maxX - w / 2, Math.max(-10 + w / 2, x));
    const outer = el('g', { transform: `translate(${cx.toFixed(1)} ${(y - 12).toFixed(1)})` }, this.L.fx);
    const inner = el('g', {}, outer);
    el('path', { d: roundedPath(w, 34, 11, Math.floor(Math.random() * 1e6)), fill: '#fbf7ee', stroke: INK, 'stroke-width': 2.6, 'stroke-linejoin': 'round', filter: 'url(#boil)', transform: `translate(${(x - cx).toFixed(1)} 0)` }, inner);
    const t = el('text', { x: 0, y: -10, 'text-anchor': 'middle', 'font-family': 'Gochi Hand, Andika, sans-serif', 'font-size': 22, fill: INK }, inner);
    t.textContent = text;
    popAnim(inner, { dur: 240, origin: '50% 100%' });
    this.currentBubble = outer;
    setTimeout(() => {
      if (!outer.isConnected) return;
      if (REDUCED) { outer.remove(); return; }
      inner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished.then(() => outer.remove()).catch(() => {});
    }, 1300);
  }

  puff(x: number, y: number) {
    if (REDUCED) return;
    const outer = el('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, this.L.shadow);
    const inner = el('g', { filter: 'url(#boil)' }, outer);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      el('path', { d: `M${Math.cos(a) * 20},${Math.sin(a) * 18} L${Math.cos(a) * 32},${Math.sin(a) * 29}`, stroke: INK, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, inner);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 1;
      el('circle', { cx: Math.cos(a) * 24, cy: Math.sin(a) * 22, r: 4.5, fill: '#fbf7ee', stroke: INK, 'stroke-width': 2 }, inner);
    }
    inner.style.transformBox = 'fill-box';
    inner.style.transformOrigin = 'center';
    inner.animate([{ transform: 'scale(0.5)', opacity: 1 }, { transform: 'scale(1.25)', opacity: 0 }], { duration: 420, easing: 'ease-out', fill: 'forwards' })
      .finished.then(() => outer.remove()).catch(() => {});
  }

  spawnZ(x: number, y: number) {
    if (REDUCED) return;
    const outer = el('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, this.L.fx);
    const z = el('path', {
      d: 'M-5,-5.5 L5.5,-5 L-5,5 L5.5,5.5', fill: 'none', stroke: '#3d6ea5', 'stroke-width': 2.6,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', filter: 'url(#boil)',
    }, outer);
    z.style.transformBox = 'fill-box';
    z.style.transformOrigin = 'center';
    z.animate(
      [{ transform: 'translate(0,0) scale(.5) rotate(-10deg)', opacity: 0 }, { opacity: 1, offset: 0.2 },
        { transform: 'translate(18px,-44px) scale(1.5) rotate(12deg)', opacity: 0 }],
      { duration: 2400, easing: 'ease-out', fill: 'forwards' },
    ).finished.then(() => outer.remove()).catch(() => {});
  }

  burstConfetti(x: number, y: number) {
    if (REDUCED) return;
    const R = Math.random;
    for (let i = 0; i < 36; i++) {
      const w = 6 + R() * 6, h = 4 + R() * 4;
      const tri = R() < 0.35;
      const node = el('path', {
        d: tri ? `M0,${-h} L${w / 2},${h / 2} L${-w / 2},${h / 2}Z` : `M${-w / 2},${-h / 2} L${w / 2},${-h / 2 + 0.6} L${w / 2 - 0.4},${h / 2} L${-w / 2},${h / 2 - 0.5}Z`,
        fill: CONFETTI[i % CONFETTI.length], stroke: INK, 'stroke-width': 1.3, 'stroke-linejoin': 'round',
      }, this.L.fx);
      this.confetti.push({
        node, x, y, vx: (R() - 0.5) * 380, vy: -260 - R() * 330, rot: R() * 360, vr: (R() - 0.5) * 720,
        ph: R() * 6, life: 0, max: 2 + R() * 0.8, flip: R() * 6,
      });
    }
  }

  private updateConfetti(dt: number) {
    for (const p of this.confetti) {
      p.life += dt;
      p.vy += 620 * dt;
      p.vx *= 1 - 1.6 * dt;
      p.vy *= 1 - 1.1 * dt;
      p.x += (p.vx + Math.sin(p.life * 7 + p.ph) * 40) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const flip = Math.cos(p.life * 9 + p.flip);
      const op = p.life > p.max - 0.4 ? Math.max(0, (p.max - p.life) / 0.4) : 1;
      p.node.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rot.toFixed(0)}) scale(1 ${flip.toFixed(2)})`);
      p.node.setAttribute('opacity', op.toFixed(2));
    }
    this.confetti = this.confetti.filter((p) => {
      if (p.life < p.max) return true;
      p.node.remove();
      return false;
    });
  }

  // ---------------------------------------------------------------- trails (only Mina and Ovillo leave one; Brote does not)
  trail = {
    view: this as BoardView,
    kind: null as null | string, path: null as SVGPathElement | null, segs: [] as [number, number][][], active: false,
    clear() { this.view.L.trail.textContent = ''; this.path = null; this.segs = []; this.active = false; this.kind = null; },
    start(actor: Actor) {
      this.clear();
      const t = actor.def.trail;
      if (!t) return;
      this.kind = t.kind;
      this.path = el('path', { fill: 'none', stroke: '#47444c', 'stroke-width': 2.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': '9 7', opacity: 0.9 }, this.view.L.trail);
      this.segs = [[]];
      this.active = true;
    },
    sample(actor: Actor) {
      if (!this.active || !this.path) return;
      const r = actor.rig;
      const seg = this.segs[this.segs.length - 1];
      const p: [number, number] = [r.x + (Math.random() - 0.5) * 0.8, r.y + 1 + (Math.random() - 0.5) * 0.8];
      const q = seg[seg.length - 1];
      if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 2.5) seg.push(p);
      this.path.setAttribute('d', this.segs.filter((s) => s.length > 1).map((s) => smoothOpen(s)).join(''));
    },
  };

  // ---------------------------------------------------------------- realtime games (3ro)
  /** Seeds falling on their own. The engine owns their rows; the view glides them between ticks. */
  private fallers = new Map<number, { g: SVGGElement; c: number; y: number; at: number }>();
  /** Rows per tick and the tick length, to glide between two engine ticks. */
  fall = { speed: 0, tickMs: 100 };
  private jar: { slots: SVGGElement[]; digit: SVGTextElement; n: number; score: number } | null = null;
  /** A quick step of the game is under way (a shrug must not stop it half way). */
  private stepping = 0;

  addFaller(id: number, c: number, y: number) {
    const g = el('g', { 'data-faller': id }, this.L.rain);
    const inner = el('g', { filter: 'url(#boil)' }, g);
    seedArt(inner, this.board!.seed + id);
    this.fallers.set(id, { g, c, y, at: now() });
    this.placeFaller(this.fallers.get(id)!, now());
    popAnim(inner, { dur: 300, origin: '50% 50%' });
  }

  /** The engine's rows for the seeds still falling (after a tick). */
  syncFallers(seeds: readonly { id: number; y: number }[]) {
    const t = now();
    for (const f of seeds) {
      const n = this.fallers.get(f.id);
      if (n) { n.y = f.y; n.at = t; }
    }
  }

  private placeFaller(f: { g: SVGGElement; c: number; y: number; at: number }, t: number) {
    const y = f.y + this.fall.speed * Math.min(1, (t - f.at) / this.fall.tickMs);
    f.g.setAttribute('transform', `translate(${f.c * S + S / 2} ${(y * S + S / 2).toFixed(1)})`);
  }

  private fallerAt(id: number) {
    const f = this.fallers.get(id);
    if (!f) return null;
    this.fallers.delete(id);
    return { f, x: f.c * S + S / 2, y: f.y * S + S / 2 };
  }

  /** A touch rule took the seed: a puff, "¡Mía!". */
  collectFaller(id: number) {
    const p = this.fallerAt(id);
    if (!p) return;
    this.puff(p.x, p.y);
    p.f.g.remove();
    this.actor?.bubble('¡Mía!');
  }

  /** No rule listens to touches: the seed goes through, Brote only watches it go by. */
  passFaller(id: number) {
    if (!this.fallers.has(id)) return;
    this.actor?.lookAt(0, 0.9, 900);
  }

  /** A seed reached the ground: it squashes a little and sinks into the paper. */
  loseFaller(id: number) {
    const p = this.fallerAt(id);
    if (!p) return;
    const g = p.f.g.firstElementChild as SVGGElement | null;
    if (!g || REDUCED) { p.f.g.remove(); return; }
    g.style.transformBox = 'fill-box';
    g.style.transformOrigin = '50% 100%';
    g.animate([{ scale: '1 1', opacity: 1 }, { scale: '1.2 0.7', opacity: 0.9, offset: 0.25 }, { scale: '0.6 0.3', opacity: 0 }], { duration: 700, easing: 'ease-in', fill: 'forwards' })
      .finished.then(() => p.f.g.remove()).catch(() => p.f.g.remove());
  }

  clearFallers() {
    this.fallers.forEach((f) => f.g.remove());
    this.fallers.clear();
  }

  /** The jar of points, on the right of the grid: `n` dotted seeds to fill, and the number above. */
  setJar(n: number) {
    const b = this.board;
    if (!b) return;
    const x0 = b.cols * S + 26, w = JAR_W - 34, bottom = b.rows * S, h = Math.min(210, b.rows * S * 0.62);
    const g = el('g', { class: 'jar' }, this.L.deco);
    const glass = wobblyPoly([[x0 + 8, bottom - h], [x0 + w - 8, bottom - h], [x0 + w, bottom - h + 22], [x0 + w - 4, bottom - 4], [x0 + 4, bottom - 4], [x0, bottom - h + 22]], { wob: 0.8, bow: 1.4, seed: b.seed + 3 });
    el('path', { d: glass, transform: 'translate(3 4)', fill: 'rgba(84, 62, 38, 0.2)' }, g);
    el('path', { d: glass, fill: '#eef0e4', stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' }, g);
    el('path', { d: `M${x0 + 14},${bottom - h + 34} L${x0 + 12},${bottom - 30}`, stroke: '#fbf7ee', 'stroke-width': 5, 'stroke-linecap': 'round', opacity: 0.9 }, g);
    el('path', { d: wobblyPoly([[x0 + 2, bottom - h - 12], [x0 + w - 2, bottom - h - 12], [x0 + w - 4, bottom - h + 2], [x0 + 4, bottom - h + 2]], { wob: 0.5, bow: 0.6, seed: b.seed + 4 }), fill: '#de8a56', stroke: INK, 'stroke-width': 2.6, 'stroke-linejoin': 'round' }, g);
    // the seeds still to collect: dotted outlines, filled from the bottom up
    const slots: SVGGElement[] = [];
    const cols = 2, rowH = Math.min(40, (h - 40) / Math.ceil(n / cols));
    for (let i = 0; i < n; i++) {
      const cx = x0 + w / 2 + (i % cols ? 17 : -17) + (Math.floor(i / cols) % 2 ? 4 : -4);
      const cy = bottom - 26 - Math.floor(i / cols) * rowH;
      const slot = el('g', { transform: `translate(${cx.toFixed(1)} ${cy.toFixed(1)})` }, g);
      el('path', { d: blob(0, 0, 13, 11, { wob: 0.05, n: 9, seed: b.seed + i }), fill: 'none', stroke: '#3d6ea5', 'stroke-width': 2.2, 'stroke-dasharray': '1.5 5', 'stroke-linecap': 'round' }, slot);
      const full = el('g', { class: 'jar-seed', opacity: 0, transform: 'translate(0 -10) scale(0.9)' }, slot);
      seedArt(full, b.seed + i + 30);
      slots.push(full);
    }
    // the digit in Andika, the readers' face: in the hand font a 5 reads as an S
    const digit = el('text', { x: x0 + w / 2, y: bottom - h - 26, 'text-anchor': 'middle', 'font-family': 'Andika, sans-serif', 'font-weight': 700, 'font-size': 54, fill: INK, class: 'jar-digit' }, g);
    digit.textContent = '0';
    this.jar = { slots, digit, n, score: 0 };
  }

  /** Where the seeds come from: a few pencil clouds along the top of a rain board. */
  setClouds() {
    const b = this.board;
    if (!b) return;
    const g = el('g', { class: 'clouds', opacity: 0.8 }, this.L.deco);
    const R = rng(b.seed + 9);
    for (let i = 0; i < 3; i++) {
      const cx = (b.cols * S) * (0.15 + i * 0.35) + (R() - 0.5) * 40, cy = -this.frameT.top + 34 + R() * 8;
      for (const [dx, dy, rx, ry] of [[0, 0, 36, 15], [28, -9, 24, 14], [-26, -3, 20, 11]]) {
        el('path', { d: blob(cx + dx, cy + dy, rx, ry, { seed: b.seed + i * 7 + dx, n: 9 }), fill: '#fbf7ee', stroke: INK, 'stroke-width': 2, opacity: 0.85 }, g);
      }
    }
  }

  setScore(k: number) {
    const j = this.jar;
    if (!j) return;
    const grew = k > j.score;
    j.score = k;
    j.digit.textContent = String(k);
    j.slots.forEach((s, i) => s.setAttribute('opacity', i < k ? '1' : '0'));
    if (grew) {
      const s = j.slots[k - 1];
      if (s) popAnim(s, { dur: 360, origin: '50% 100%' });
      popAnim(j.digit, { dur: 320, origin: '50% 80%' });
    }
  }

  /**
   * One step of a running game: a quick hop to the next cell (`ms`, the
   * engine's step), or a gentle bump against a rock or the edge.
   */
  async rtMove(s: { kind: string; to: RobotState; crash?: { at: Cell; out: boolean } }, dir: Dir, ms: number): Promise<void> {
    const a = this.actor;
    if (!a) return;
    const [dx, dy] = DELTA[dir];
    this.stepping++;
    await a.act(async () => {
      Object.assign(a.rig, { sx: 1, sy: 1, lean: 0, hop: 0, lift: 0, eyes: 'open', mouth: 'smile' });
      if (dx && Math.sign(a.rig.face) !== dx) await a.T({ face: dx }, REDUCED ? 1 : 70, E.inOut);
      a.lookAt(dx || 0, dy || 0.1, 700);
      if (s.kind === 'crash') {
        const here = feet(this.pos.c, this.pos.r);
        const hit = s.crash!.out
          ? { x: this.pos.c * S + S / 2 + dx * 50, y: this.pos.r * S + S / 2 + dy * 50 + (dx ? 20 : 0) }
          : { x: s.crash!.at.c * S + S / 2 - dx * 26, y: s.crash!.at.r * S + S / 2 + 12 - dy * 26 };
        a.onMark = () => this.drawBump(hit.x, hit.y);
        await this.nudge(a, { x: here.x + dx * 100, y: here.y + dy * 100 }, { dx, dy });
        a.mark();
        return;
      }
      const to = feet(s.to.c, s.to.r);
      const d = REDUCED ? 1 : ms * 0.86;
      const bounce = proc(a, d, (p) => {
        const k = Math.sin(p * Math.PI);
        a.rig.hop = -k * 22;
        a.rig.sy = 1 + k * 0.1;
        a.rig.sx = 1 - k * 0.06;
      });
      await Promise.all([a.T({ x: to.x, y: to.y }, d, E.inOut), bounce]);
      Object.assign(a.rig, { hop: 0, sx: 1, sy: 1 });
      this.pos = { c: s.to.c, r: s.to.r, mask: s.to.mask };
    }).finally(() => { this.stepping--; });
  }

  /** A key nobody listens to: Brote looks that way, shrugs, "¿?". Never stops a step under way. */
  shrug(dir: Dir) {
    const a = this.actor;
    if (!a) return;
    const [dx, dy] = DELTA[dir];
    a.lookAt(dx || 0, dy || 0.1, 1000);
    a.bubble('¿?');
    if (this.stepping || REDUCED) return;
    void a.act(async () => {
      a.rig.mouth = 'wavy';
      await a.T({ sy: 0.9, sx: 1.08 }, 90, E.out);
      await a.T({ sy: 1.1, sx: 0.94, hop: -8, lean: 7 }, 150, E.out);
      await a.T({ lean: -7 }, 170, E.inOut);
      await a.T({ sy: 1, sx: 1, hop: 0, lean: 0 }, 200, E.inOut);
      a.rig.mouth = 'smile';
    });
  }

  /** Stop the game: seeds gone, jar empty, Brote home. */
  async rtReset() {
    this.clearFallers();
    if (this.jar) this.setScore(0);
    await this.reset();
  }

  // ---------------------------------------------------------------- per frame
  private frame(t: number, dt: number) {
    if (!this.svg.isConnected) return;
    const a = this.actor;
    if (a) {
      a.render(dt);
      this.trail.sample(a);
    }
    if (this.fallers.size) { const tt = now(); this.fallers.forEach((f) => this.placeFaller(f, tt)); }
    if (this.goalNodes) {
      const gs = this.goalState;
      const bob = REDUCED || gs.hop || this.board?.goalKind === 'pot' ? 0 : Math.sin(t / 520) * 1.6;
      this.goalNodes.mover.setAttribute('transform', `translate(${gs.dx.toFixed(1)} ${(gs.hop + bob).toFixed(1)}) rotate(${gs.spin.toFixed(1)}) scale(${gs.scale.toFixed(3)})`);
      this.goalNodes.shadow.setAttribute('transform', `translate(${gs.dx.toFixed(1)} 0) scale(${(1 - Math.min(0.5, -gs.hop / 120)).toFixed(3)})`);
      this.goalNodes.sparkle?.setAttribute('opacity', Math.sin(t / 300) > 0.2 ? '1' : '0');
    }
    this.updateConfetti(dt);
  }

  private idleTick() {
    const a = this.actor;
    if (!a || this.running || a.busy || a.sleeping) return;
    const t = now();
    if (t - this.lastInput > 16000) { a.goSleep(); return; }
    if (t > this.nextFidget && !REDUCED) {
      this.nextFidget = t + 5000 + Math.random() * 5000;
      a.act(() => a.perform('fidget'));
    }
  }

  /** Make the character glance at a screen point (a block just added). */
  glanceAt(clientX: number, clientY: number) {
    const a = this.actor;
    const p = this.toBoard(clientX, clientY);
    if (!a || !p) return;
    const ex = a.rig.x, ey = a.rig.y + a.def.eyes[0].y;
    const dx = p.x - ex, dy = p.y - ey, d = Math.hypot(dx, dy) || 1;
    a.lookAt(dx / d, dy / d, 1100);
    if (!this.running) a.act(async () => { await a.settle(70); await a.perform('nod'); });
  }

  tapCharacter() {
    const a = this.actor;
    this.lastInput = now();
    if (!a) return;
    if (a.sleeping) { a.wake(); return; }
    if (this.running) return;
    a.act(async () => { await a.settle(60); await a.perform('tap'); });
    this.onCharacterTap?.();
  }
}

// ------------------------------------------------------------------ the actor
const reducedMotion: Record<string, (A: Actor, ...args: any[]) => Promise<void>> = {
  async step(A, to) { await A.T({ x: to.x, y: to.y }, 200, E.inOut); },
  async bump(A) { A.mark(); A.dizzy(true); await A.wait(900); A.dizzy(false); },
  async celebrate(A) {
    A.rig.eyes = 'happy'; A.rig.mouth = 'grin';
    if (A.def.id === 'brote') { A.rig.leaves += 1; A.rig.leafNew = 1; }
    await A.wait(1200);
    A.rig.mouth = 'smile';
  },
  async tap(A) { A.rig.eyes = 'happy'; A.bubble('¡Ji, ji!'); await A.wait(700); A.rig.eyes = 'open'; },
  async nod() {},
  async sleep(A) { A.rig.eyes = 'closed'; A.rig.mouth = 'o'; },
  async fidget() {},
};

const progress = { leaves: 0 };

class Actor {
  rig: Rig;
  shadow: SVGEllipseElement;
  pos: SVGGElement;
  ink: SVGGElement;
  fig: Figure;
  swirl: SVGGElement;
  orbit: SVGPathElement[];
  gen = 0;
  busy = false;
  sleeping = false;
  phase = Math.random() * 6;
  pv: { x: number; y: number; vy: number };
  look = { x: 0, y: 0.2 };
  blinkAt = -1;
  /** The first blink comes at a random moment: several characters on one page never blink in unison. */
  blinkNext = now() / 1000 + 1 + Math.random() * 2.2;
  blinkTwice = false;
  nextZ = 0;
  onMark: null | (() => void) = null;

  constructor(readonly view: BoardView, readonly def: CharacterDef, at: { x: number; y: number }, readonly outfit?: Outfit) {
    this.rig = {
      x: at.x, y: at.y, hop: 0, lift: 0, sx: 1, sy: 1, lean: 0, spin: 0, face: 1,
      eyes: 'open', mouth: 'smile', dizzy: 0, threaded: false,
      ...JSON.parse(JSON.stringify(def.defaults)),
    };
    if (def.id === 'brote') this.rig.leaves = progress.leaves;
    const L = view.L;
    this.shadow = el('ellipse', { rx: 25, ry: 5.5, fill: 'url(#hatch)' }, L.shadow);
    this.pos = el('g', { 'data-character': def.id, 'data-outfit': outfitWords(outfit) }, L.actor);
    this.ink = el('g', { filter: 'url(#boil)' }, this.pos);
    this.fig = buildFigure(def, this.ink, outfit);
    const hit = el('ellipse', { class: 'hit', cx: 0, cy: def.pivot - 4, rx: 42, ry: 52, fill: 'transparent' }, this.fig.body);
    hit.addEventListener('pointerdown', (e) => { e.stopPropagation(); view.tapCharacter(); });
    this.swirl = el('g', { opacity: 0, filter: 'url(#boil)' }, this.pos);
    this.orbit = [
      el('path', { d: spiral(0, 0, 7, 2.2, 3), fill: 'none', stroke: INK, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, this.swirl),
      el('path', { d: 'M0,-7 L2,-2 7,-2 3,1.5 4.5,6.5 0,3.5 -4.5,6.5 -3,1.5 -7,-2 -2,-2Z', fill: '#f0d27a', stroke: INK, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, this.swirl),
      el('path', { d: spiral(0, 0, 6, 2, 9), fill: 'none', stroke: INK, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, this.swirl),
    ];
    this.pv = { x: at.x, y: at.y, vy: 0 };
  }

  T(props: Record<string, number>, dur: number, ease?: (t: number) => number) { return tween(this, this.rig, props, dur, ease); }
  P(dur: number, fn: (p: number, ms: number) => void) { return proc(this, dur, fn); }
  wait(ms: number) { return wait(this, ms); }
  lookAt(x: number, y: number, ms: number) { this.view.gaze.override = { x, y, until: now() + ms }; }
  mark() { if (this.onMark) { this.onMark(); this.onMark = null; } }
  bubble(text: string) { this.view.bubble(this.rig.x + 16 * Math.sign(this.rig.face || 1), this.rig.y + this.def.top * SCALE - 4, text); }
  dizzy(on: boolean) {
    const r = this.rig;
    if (on) { r.eyes = 'dizzy'; r.mouth = 'wavy'; } else { r.eyes = 'open'; r.mouth = 'smile'; }
    tween(this, r, { dizzy: on ? 1 : 0 }, 220, E.out);
  }

  interrupt() { this.gen++; engine.abort(this); this.busy = false; }

  async act(fn: () => Promise<unknown>) {
    this.interrupt();
    const g = this.gen;
    this.busy = true;
    try { await fn(); return true; } catch (e) { if (e !== ABORT) throw e; return false; } finally { if (g === this.gen) this.busy = false; }
  }

  settle(dur = 160) {
    const r = this.rig;
    r.eyes = 'open'; r.mouth = 'smile';
    const n: Record<string, number> = { sx: 1, sy: 1, hop: 0, lift: 0, lean: 0, spin: 0, dizzy: 0 };
    for (const k in this.def.defaults) if (!PERSIST.includes(k)) n[k] = this.def.defaults[k];
    return this.T(n, dur, E.inOut);
  }

  perform(name: string, ...args: any[]): Promise<void> {
    if (REDUCED) return reducedMotion[name](this, ...args);
    return (this.def.m as any)[name](this, ...args);
  }

  async poofTo(p: { x: number; y: number }) {
    this.view.puff(this.rig.x, this.rig.y + this.def.pivot * SCALE);
    await this.T({ sx: 0.15, sy: 0.15, hop: -8 }, REDUCED ? 1 : 150, E.in);
    Object.assign(this.rig, { x: p.x, y: p.y, hop: 0, lift: 0, threaded: false });
    this.pv = { x: p.x, y: p.y, vy: 0 };
    if ('size' in this.rig) this.rig.size = 1;
    this.view.puff(p.x, p.y + this.def.pivot * SCALE);
    await this.T({ sx: 1.14, sy: 1.14 }, REDUCED ? 1 : 170, E.out);
    await this.T({ sx: 1, sy: 1 }, REDUCED ? 1 : 150, E.inOut);
  }

  async popIn() {
    this.rig.sx = 0.1; this.rig.sy = 0.1;
    this.view.puff(this.rig.x, this.rig.y + this.def.pivot * SCALE);
    await this.T({ sx: 1.15, sy: 1.15 }, REDUCED ? 1 : 180, E.out);
    await this.T({ sx: 1, sy: 1 }, REDUCED ? 1 : 160, E.inOut);
  }

  goSleep() {
    this.sleeping = true;
    this.nextZ = now() / 1000 + 2.2;
    return this.act(async () => { await this.settle(200); await this.perform('sleep'); });
  }

  wake() {
    if (!this.sleeping) return;
    this.sleeping = false;
    this.act(async () => {
      const r = this.rig;
      r.eyes = 'open'; r.mouth = 'o';
      if (!REDUCED) {
        await this.T({ hop: -14, sy: 1.16, sx: 0.9 }, 110, E.out);
        await this.T({ hop: 0, sy: 0.92, sx: 1.06 }, 130, E.in);
      }
      await this.settle(220);
    });
  }

  destroy() {
    this.interrupt();
    if (this.def.id === 'brote') progress.leaves = this.rig.leaves;
    this.pos.remove();
    this.shadow.remove();
  }

  render(dt: number) {
    const r = this.rig, def = this.def, gaze = this.view.gaze;
    const wx = r.x, wy = r.y + r.hop + (r.lift ?? 0);
    const vx = (wx - this.pv.x) / dt, vy = (wy - this.pv.y) / dt;
    const ay = (vy - this.pv.vy) / dt;
    this.pv = { x: wx, y: wy, vy };

    const period = def.breathe.period * (this.sleeping ? 1.7 : 1);
    this.phase += (dt / period) * Math.PI * 2;
    const br = REDUCED ? 0 : Math.sin(this.phase) * def.breathe.amp * (this.sleeping ? 1.9 : 1);
    const size = r.size ?? 1;
    const sx = r.sx * (1 - br * 0.6) * size, sy = r.sy * (1 + br) * size;

    const tt = now();
    let lx: number, ly: number;
    if (gaze.override && tt < gaze.override.until) {
      lx = gaze.override.x; ly = gaze.override.y;
    } else if (tt - gaze.t < 3500) {
      const e0 = def.eyes[0], e1 = def.eyes[1];
      const ex = wx + ((e0.x + e1.x) / 2) * r.face * SCALE, ey = wy + ((e0.y + e1.y) / 2) * sy * SCALE;
      const dx = gaze.x - ex, dy = gaze.y - ey;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 70);
      lx = (dx / d) * k; ly = (dy / d) * k;
    } else {
      if (tt > gaze.idle.next) {
        const opts = [[0, 0.15], [0.75, 0.1], [-0.75, 0.1], [0.2, 0.85], [-0.3, -0.5], [0, 0.15]];
        const o = opts[Math.floor(Math.random() * opts.length)];
        gaze.idle = { x: o[0], y: o[1], next: tt + 1400 + Math.random() * 2600 };
      }
      lx = gaze.idle.x; ly = gaze.idle.y;
    }
    const kk = Math.min(1, dt * 16);
    this.look.x += (lx - this.look.x) * kk;
    this.look.y += (ly - this.look.y) * kk;
    const attn = this.busy || this.sleeping ? 0 : this.look.x * 2.5;

    this.pos.setAttribute('transform', `translate(${wx.toFixed(2)} ${wy.toFixed(2)}) scale(${SCALE})`);
    const pv = def.pivot;
    const fx = (r.face * sx).toFixed(3);
    this.fig.body.setAttribute('transform',
      `rotate(${(r.lean + attn).toFixed(2)}) translate(0 ${pv}) rotate(${r.spin.toFixed(2)}) translate(0 ${-pv}) scale(${fx === '0.000' || fx === '-0.000' ? '0.001' : fx} ${sy.toFixed(3)})`);

    const ts = tt / 1000;
    if (ts > this.blinkNext) {
      this.blinkAt = ts;
      this.blinkTwice = Math.random() < 0.22;
      this.blinkNext = ts + 1.6 + Math.random() * 3.6;
    }
    let blink = 0;
    const bt = ts - this.blinkAt;
    if (bt >= 0 && bt < 0.15) blink = Math.sin((bt / 0.15) * Math.PI);
    else if (this.blinkTwice && bt >= 0.22 && bt < 0.37) blink = Math.sin(((bt - 0.22) / 0.15) * Math.PI);

    const sgn = Math.sign(r.face) || 1;
    poseFigure(this.fig, r, { x: this.look.x * sgn, y: this.look.y }, blink);
    def.render(r, this.fig.parts, { t: ts, dt, vx, vy, ay });

    const lift = Math.min(0.55, Math.max(0, -(r.hop + (r.lift ?? 0))) / 110);
    this.shadow.setAttribute('transform', `translate(${r.x.toFixed(2)} ${(r.y + 1).toFixed(2)}) scale(${((1 - lift) * size * Math.min(1.3, r.sx) * SCALE).toFixed(3)} ${((1 - lift) * SCALE).toFixed(3)})`);

    if (r.dizzy > 0.01) {
      this.swirl.setAttribute('opacity', r.dizzy.toFixed(2));
      const top = def.head * sy - 6;
      this.orbit.forEach((o, i) => {
        const a = ts * 4 + (i * Math.PI * 2) / 3;
        o.setAttribute('transform', `translate(${(Math.cos(a) * 22).toFixed(1)} ${(top + Math.sin(a) * 6).toFixed(1)}) scale(${(0.85 + Math.sin(a) * 0.2).toFixed(2)})`);
      });
    } else this.swirl.setAttribute('opacity', '0');

    if (this.sleeping && ts > this.nextZ) {
      this.nextZ = ts + 1.25;
      this.view.spawnZ(wx + 18 * sgn, wy + def.head * sy * SCALE - 4);
    }
  }
}

// ------------------------------------------------------------------ drawing helpers
export function drawOn(path: SVGPathElement, dur: number, delay = 0) {
  const len = path.getTotalLength();
  if (REDUCED) return;
  path.style.strokeDasharray = `${len} ${len}`;
  path.style.strokeDashoffset = String(len);
  const a = path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: dur, delay, easing: 'ease-out', fill: 'forwards' });
  a.finished.then(() => { path.style.strokeDashoffset = '0'; }).catch(() => {});
}

export function popAnim(node: SVGElement | HTMLElement, { dur = 260, delay = 0, origin = '50% 100%' } = {}) {
  if (REDUCED) return;
  (node.style as CSSStyleDeclaration).transformBox = 'fill-box';
  node.style.transformOrigin = origin;
  node.animate(
    [{ transform: 'scale(0.2)', opacity: 0 }, { transform: 'scale(1.1)', opacity: 1, offset: 0.65 }, { transform: 'scale(1)', opacity: 1 }],
    { duration: dur, delay, easing: 'ease-out', fill: 'backwards' },
  );
}

function roundedPath(w: number, h: number, rr: number, seed: number) {
  const R = rng(seed);
  const j = () => (R() - 0.5) * 1.6;
  const x0 = -w / 2, x1 = w / 2, y0 = -h, y1 = 0;
  return `M${x0 + rr},${y0 + j()} L${x1 - rr},${y0 + j()} Q${x1},${y0} ${x1 + j()},${y0 + rr} L${x1 + j()},${y1 - rr}` +
    ` Q${x1},${y1} ${x1 - rr},${y1 + j()} L${6},${y1} L${-1},${y1 + 11} L${-6},${y1} L${x0 + rr},${y1 + j()}` +
    ` Q${x0},${y1} ${x0 + j()},${y1 - rr} L${x0 + j()},${y0 + rr} Q${x0},${y0} ${x0 + rr},${y0 + j()}Z`;
}

function drawObstacle(parent: SVGGElement, o: Obstacle) {
  const { kind, seed } = o;
  const R = rng(seed);
  const g = el('g', {}, parent);
  if (kind === 'rock') {
    const d = blob(0, 8, 30 + R() * 4, 21 + R() * 3, { wob: 0.09, n: 8, seed, rot: R() });
    const id = `rock${seed}-${o.c}-${o.r}`;
    const clip = el('clipPath', { id }, g);
    el('path', { d }, clip);
    const f = el('g', { 'clip-path': `url(#${id})` }, g);
    el('rect', { x: -40, y: -20, width: 80, height: 50, fill: '#9f937f' }, f);
    el('path', { d: blob(-5, 4, 30, 21, { wob: 0.06, n: 8, seed: seed + 1 }), fill: '#bdb09c' }, f);
    el('path', { d, fill: 'none', stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' }, g);
    el('path', { d: `M${-6 + R() * 4},-6 l5,7 l-3,6`, fill: 'none', stroke: INK, 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    el('path', { d: blob(32, 25, 6.5, 4.5, { seed: seed + 2, n: 7 }), fill: '#bdb09c', stroke: INK, 'stroke-width': 2.2 }, g);
  } else if (kind === 'puddle') {
    el('path', { d: blob(0, 24, 38, 14, { wob: 0.12, n: 9, seed }), fill: '#9dbbd8', stroke: INK, 'stroke-width': 2.8, 'stroke-linejoin': 'round' }, g);
    el('path', { d: 'M-18,22 q8,-5 16,0', fill: 'none', stroke: '#fbf7ee', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, g);
    el('path', { d: 'M6,28 q6,-4 12,0', fill: 'none', stroke: '#fbf7ee', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, g);
    el('path', { d: blob(33, 12, 4, 3, { seed: seed + 3, n: 6 }), fill: '#9dbbd8', stroke: INK, 'stroke-width': 2 }, g);
  } else {
    const pts: [number, number][] = [];
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = (i % 2 ? 20 : 26) * (0.8 + R() * 0.45);
      pts.push([Math.cos(a) * rr * 1.2, 6 + Math.sin(a) * rr * 0.85]);
    }
    el('path', { d: smoothClosed(pts), fill: INK }, g);
    for (let i = 0; i < 3; i++) {
      const a = R() * Math.PI * 2;
      el('circle', { cx: Math.cos(a) * 38, cy: 6 + Math.sin(a) * 24, r: 2.5 + R() * 3, fill: INK }, g);
    }
    el('path', { d: 'M-8,-2 q5,-4 11,-2', fill: 'none', stroke: '#fbf7ee', 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: 0.8 }, g);
  }
  return g;
}



/**
 * Stone (1ro's staircase): every `earth` cell is part of one mass. Each cell
 * is filled and bricked; an ink line runs only where the mass meets open
 * floor, so the steps show as one staircase, and each tread (a stone top with
 * floor above it) gets a lighter edge to stand on.
 */
function drawStone(parent: SVGGElement, b: Board) {
  const isStone = (c: number, r: number) => obstacleAt(b, c, r)?.kind === 'earth';
  const g = el('g', { class: 'stone' }, parent);
  const cells = b.obstacles.filter((o) => o.kind === 'earth');
  for (const o of cells) {
    const x = o.c * S, y = o.r * S;
    el('rect', { x: x - 1, y: y - 1, width: S + 2, height: S + 2, fill: '#d6c9b0' }, g);
  }
  for (const o of cells) {
    const x = o.c * S, y = o.r * S;
    const R = rng(o.seed);
    // two courses of bricks
    for (const [yy, off] of [[y + 34, 0], [y + 67, 1]] as const) {
      el('path', { d: wobblyLine(x + 4, yy, x + S - 4, yy + (R() - 0.5) * 2, { bow: 1, seed: o.seed + yy }), stroke: INK, 'stroke-width': 1.6, opacity: 0.35, fill: 'none', 'stroke-linecap': 'round' }, g);
      const jx = x + (off ? 30 : 62) + (R() - 0.5) * 8;
      el('path', { d: `M${jx.toFixed(1)},${yy + 2} L${(jx + 1).toFixed(1)},${yy + 30}`, stroke: INK, 'stroke-width': 1.6, opacity: 0.3, 'stroke-linecap': 'round' }, g);
    }
    const tread = !isStone(o.c, o.r - 1) && o.r > 0;
    if (tread) el('rect', { x: x, y: y, width: S, height: 14, fill: '#ece2cc' }, g);
    const edge = (x1: number, y1: number, x2: number, y2: number, k: number) =>
      el('path', { d: wobblyLine(x1, y1, x2, y2, { bow: 1.4, seed: o.seed * 4 + k }), stroke: INK, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }, g);
    if (o.r > 0 && !isStone(o.c, o.r - 1)) edge(x, y, x + S, y, 1);
    if (o.r < b.rows - 1 && !isStone(o.c, o.r + 1)) edge(x, y + S, x + S, y + S, 2);
    if (o.c > 0 && !isStone(o.c - 1, o.r)) edge(x, y, x, y + S, 3);
    if (o.c < b.cols - 1 && !isStone(o.c + 1, o.r)) edge(x + S, y, x + S, y + S, 4);
  }
}

// ------------------------------------------------------------------ the river (1ro's sheets 10–17)
const SAND = '#f3e8cf';
const WATER = '#9dbbd8';
let waterN = 0;

/** The river's bank: sand instead of the forest floor, with a few pebbles. */
function drawSand(parent: SVGGElement, b: Board) {
  const g = el('g', { class: 'sand' }, parent);
  for (let r = 0; r < b.rows; r++) {
    for (let c = 0; c < b.cols; c++) {
      if (obstacleAt(b, c, r)?.kind === 'water' || b.ford?.some((x) => x.c === c && x.r === r)) continue;
      const R = rng(b.seed * 5 + c * 11 + r * 23);
      for (let i = 0; i < 2; i++) {
        el('ellipse', { cx: (c * S + 14 + R() * 72).toFixed(1), cy: (r * S + 12 + R() * 76).toFixed(1), rx: (2.4 + R() * 2).toFixed(1), ry: (1.8 + R() * 1.2).toFixed(1), fill: '#d8c9a6', stroke: INK, 'stroke-width': 1, opacity: 0.55 }, g);
      }
    }
  }
}

/**
 * The river: water cells are one stream (Brote bumps at its edge, like at a
 * rock), with cream ripples and a lily pad now and then, and an ink edge with
 * a thin line of foam where it meets the bank. Stepping stones (`ford`) are
 * flat stones in the water, with a ring of ripples round them: Brote stands
 * on them.
 */
function drawWater(parent: SVGGElement, b: Board) {
  const ford = new Set((b.ford ?? []).map((x) => `${x.c},${x.r}`));
  const wet = (c: number, r: number) => c >= 0 && r >= 0 && c < b.cols && r < b.rows && (obstacleAt(b, c, r)?.kind === 'water' || ford.has(`${c},${r}`));
  const g = el('g', { class: 'water' }, parent);
  const cells: Cell[] = [];
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) if (wet(c, r)) cells.push({ c, r });
  for (const x of cells) el('rect', { x: x.c * S - 1, y: x.r * S - 1, width: S + 2, height: S + 2, fill: WATER }, g);
  for (const x of cells) {
    if (ford.has(`${x.c},${x.r}`)) continue;
    const R = rng(b.seed * 13 + x.c * 7 + x.r * 31);
    for (let i = 0; i < 2; i++) {
      const rx = x.c * S + 14 + R() * 40, ry = x.r * S + 28 + i * 38 + R() * 8;
      el('path', { d: `M${rx.toFixed(1)},${ry.toFixed(1)} q8,-5 16,0 t16,0`, fill: 'none', stroke: '#fbf7ee', 'stroke-width': 2.6, 'stroke-linecap': 'round', opacity: 0.9 }, g);
    }
    if (R() < 0.16) {
      const lx = x.c * S + 26 + R() * 48, ly = x.r * S + 30 + R() * 40;
      el('path', { d: blob(lx, ly, 13, 7.5, { seed: x.c * 3 + x.r, n: 9 }), fill: '#a4b86d', stroke: INK, 'stroke-width': 2 }, g);
      el('path', { d: `M${lx.toFixed(1)},${ly.toFixed(1)} l11,-2`, stroke: WATER, 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
    }
  }
  // the bank's edge
  for (const x of cells) {
    const X = x.c * S, Y = x.r * S;
    const edge = (x1: number, y1: number, x2: number, y2: number, fx: number, fy: number, k: number) => {
      const seed = b.seed * 3 + x.c * 17 + x.r * 5 + k;
      el('path', { d: wobblyLine(x1 + fx, y1 + fy, x2 + fx, y2 + fy, { bow: 1.2, seed: seed + 1 }), stroke: '#fbf7ee', 'stroke-width': 2.2, fill: 'none', 'stroke-linecap': 'round', opacity: 0.85 }, g);
      el('path', { d: wobblyLine(x1, y1, x2, y2, { bow: 1.4, seed }), stroke: INK, 'stroke-width': 2.8, fill: 'none', 'stroke-linecap': 'round' }, g);
    };
    if (x.r > 0 && !wet(x.c, x.r - 1)) edge(X, Y, X + S, Y, 0, 7, 1);
    if (x.r < b.rows - 1 && !wet(x.c, x.r + 1)) edge(X, Y + S, X + S, Y + S, 0, -7, 2);
    if (x.c > 0 && !wet(x.c - 1, x.r)) edge(X, Y, X, Y + S, 7, 0, 3);
    if (x.c < b.cols - 1 && !wet(x.c + 1, x.r)) edge(X + S, Y, X + S, Y + S, -7, 0, 4);
  }
  // the stepping stones
  const n = ++waterN;
  for (const s of b.ford ?? []) {
    const cx = s.c * S + S / 2, cy = s.r * S + S / 2 + 14;
    const seed = b.seed + s.c * 17 + s.r * 29;
    el('path', { d: blob(cx, cy + 3, 45, 31, { wob: 0.05, n: 10, seed: seed + 1 }), fill: 'none', stroke: '#fbf7ee', 'stroke-width': 2.4, opacity: 0.85 }, g);
    const d = blob(cx, cy, 38, 26, { wob: 0.07, n: 10, seed });
    const id = `ford${n}-${s.c}-${s.r}`;
    el('path', { d, transform: 'translate(3 4)', fill: 'rgba(84, 62, 38, 0.2)' }, g);
    const clip = el('clipPath', { id }, g);
    el('path', { d }, clip);
    const f = el('g', { 'clip-path': `url(#${id})` }, g);
    el('path', { d, fill: '#b8ab95' }, f);
    el('path', { d, fill: '#ddd4c3', transform: 'translate(-4 -5)' }, f);
    el('path', { d, fill: 'none', stroke: INK, 'stroke-width': 2.8, 'stroke-linejoin': 'round' }, g);
  }
}

/** Reeds on the bank (the river's grass): thin stems, two with brown tops. */
function drawReeds(parent: SVGGElement, x: number, y: number, seed: number) {
  const R = rng(seed);
  const g = el('g', { opacity: 0.9 }, parent);
  [-7, -1, 5].forEach((dx, i) => {
    const h = 22 + R() * 12, lean = (R() - 0.5) * 7;
    el('path', { d: `M${x + dx},${y} Q${x + dx + lean / 2},${y - h / 2} ${x + dx + lean},${y - h}`, fill: 'none', stroke: INK, 'stroke-width': 1.8, 'stroke-linecap': 'round' }, g);
    if (i !== 1) el('path', { d: blob(x + dx + lean, y - h + 5, 2.6, 6, { seed: seed + i, n: 7 }), fill: '#9c6b43', stroke: INK, 'stroke-width': 1.4 }, g);
  });
}

/** The sky over a lone one-row path: far hills, two clouds, all in pencil so the path stays the subject. */
function drawSky(parent: SVGGElement, b: Board, top: number) {
  const w = b.cols * S;
  const R = rng(b.seed + 11);
  const g = el('g', { class: 'sky', opacity: 0.75 }, parent);
  const base = -8;
  const pts: [number, number][] = [[0, base]];
  const humps = Math.max(3, Math.round(b.cols / 2.5));
  for (let i = 0; i <= humps * 2; i++) pts.push([(i / (humps * 2)) * w, base - (i % 2 ? 30 + R() * 34 : 6 + R() * 10)]);
  pts.push([w, base]);
  el('path', { d: `${smoothOpen(pts)} L${w},${base} L0,${base} Z`, fill: '#e3e5c6' }, g);
  el('path', { d: smoothOpen(pts.slice(1, -1)), fill: 'none', stroke: INK, 'stroke-width': 2, opacity: 0.55, 'stroke-linecap': 'round' }, g);
  for (let i = 0; i < 2; i++) {
    const cx = w * (0.22 + i * 0.5) + R() * 60, cy = -top * (0.62 - i * 0.12);
    const d = [blob(cx, cy, 34, 16, { seed: b.seed + i, n: 9 }), blob(cx + 30, cy - 10, 26, 16, { seed: b.seed + i + 3, n: 8 }), blob(cx - 26, cy - 4, 20, 12, { seed: b.seed + i + 6, n: 8 })];
    for (const p of d) el('path', { d: p, fill: '#fbf7ee', stroke: INK, 'stroke-width': 2, opacity: 0.8 }, g);
  }
  const sx = w - 70, sy = -top * 0.66;
  el('circle', { cx: sx, cy: sy, r: 22, fill: '#f0d27a', stroke: INK, 'stroke-width': 2.2 }, g);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    el('path', { d: `M${(sx + Math.cos(a) * 30).toFixed(1)},${(sy + Math.sin(a) * 30).toFixed(1)} L${(sx + Math.cos(a) * 40).toFixed(1)},${(sy + Math.sin(a) * 40).toFixed(1)}`, stroke: INK, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.7 }, g);
  }
}

interface GoalNodes {
  outer: SVGGElement;
  shadow: SVGEllipseElement;
  mover: SVGGElement;
  sparkle?: SVGGElement;
  /** Pot only: the paper lid (closed) and the dotted ring (open). */
  lid?: SVGGElement;
  ring?: SVGGElement;
}

/** "A seed with two leaves": the pickups, and (bigger, glinting) the goal of sala 4. */
function drawPickup(parent: SVGGElement, seed: number) {
  const inner = el('g', { filter: 'url(#boil)' }, parent);
  el('ellipse', { cx: 0, cy: 24, rx: 16, ry: 4, fill: 'url(#hatch)' }, inner);
  seedArt(inner, seed);
  return inner;
}

function seedArt(g: SVGGElement, seed: number) {
  el('path', { d: 'M0,4 C-2,-4 2,-9 0,-15', fill: 'none', stroke: INK, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, g);
  el('path', { d: leaf(0, -12, -14, -20, 5.5), fill: '#a4b86d', stroke: INK, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, g);
  el('path', { d: leaf(0, -14, 13, -23, 5.5), fill: '#a4b86d', stroke: INK, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, g);
  el('path', { d: blob(0, 10, 13, 11, { wob: 0.05, n: 9, seed }), fill: '#f0d27a', stroke: INK, 'stroke-width': 2.8 }, g);
  el('path', { d: 'M-5,6 q3,-3 7,-2', fill: 'none', stroke: '#fbf7ee', 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
}

function drawSeedGoal(parent: SVGGElement, seed: number): GoalNodes {
  const outer = el('g', {}, parent);
  const shadow = el('ellipse', { cx: 0, cy: 34, rx: 20, ry: 4.5, fill: 'url(#hatch)' }, outer);
  const mover = el('g', {}, outer);
  const ink = el('g', { filter: 'url(#boil)', transform: 'translate(0 2) scale(1.45)' }, mover);
  seedArt(ink, seed);
  const sparkle = el('g', { transform: 'translate(26 -30)' }, mover);
  el('path', { d: 'M0,-7 L0,-3 M0,3 L0,7 M-7,0 L-3,0 M3,0 L7,0', stroke: INK, 'stroke-width': 2, 'stroke-linecap': 'round' }, sparkle);
  return { outer, shadow, mover, sparkle };
}

/**
 * A clay pot. Closed: a paper lid with a dotted seed drawn on it ("bring a seed
 * here"). Open: the soil shows and a dotted blue ring waits for Brote.
 */
function drawPot(parent: SVGGElement, seed: number): GoalNodes {
  const outer = el('g', {}, parent);
  const shadow = el('ellipse', { cx: 0, cy: 36, rx: 26, ry: 5, fill: 'url(#hatch)' }, outer);
  const mover = el('g', {}, outer);
  const ring = el('g', { opacity: 0 }, mover);
  el('path', { d: penLoop(0, 8, 42, 36, { seed: seed + 3 }), fill: 'none', stroke: '#3d6ea5', 'stroke-width': 3, 'stroke-dasharray': '2 8', 'stroke-linecap': 'round', filter: 'url(#boil)' }, ring);
  const ink = el('g', { filter: 'url(#boil)' }, mover);
  const body = wobblyPoly([[-22, -4], [22, -4], [16, 32], [-16, 32]], { wob: 0.8, bow: 1.2, seed: seed + 1 });
  const id = `pot${seed}`;
  const clip = el('clipPath', { id }, ink);
  el('path', { d: body }, clip);
  const f = el('g', { 'clip-path': `url(#${id})` }, ink);
  el('rect', { x: -30, y: -10, width: 60, height: 50, fill: '#b8653a' }, f);
  el('path', { d: wobblyPoly([[-26, -8], [16, -8], [10, 36], [-22, 36]], { wob: 0.6, bow: 1, seed: seed + 2 }), fill: '#d98a5f' }, f);
  el('path', { d: body, fill: 'none', stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' }, ink);
  el('ellipse', { cx: 0, cy: -12, rx: 22, ry: 5, fill: '#6e5a48', stroke: INK, 'stroke-width': 2 }, ink);
  el('path', { d: wobblyPoly([[-27, -16], [27, -16], [26, -3], [-26, -3]], { wob: 0.6, bow: 0.8, seed: seed + 4 }), fill: '#de8a56', stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' }, ink);
  // the soil is seen through the rim's opening
  el('path', { d: 'M-21,-16 Q0,-21 21,-16', fill: '#6e5a48', stroke: INK, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, ink);
  el('path', { d: 'M-12,12 q5,-3 10,0', fill: 'none', stroke: INK, 'stroke-width': 1.4, opacity: 0.45, 'stroke-linecap': 'round' }, ink);
  const lid = el('g', {}, mover);
  const lidInk = el('g', { filter: 'url(#boil)' }, lid);
  el('path', { d: blob(0, -19, 30, 9, { wob: 0.04, n: 10, seed: seed + 5 }), fill: '#e6dccb', stroke: INK, 'stroke-width': 2.8 }, lidInk);
  el('path', { d: blob(0, -28, 6, 4, { seed: seed + 6, n: 7 }), fill: '#e6dccb', stroke: INK, 'stroke-width': 2.4 }, lidInk);
  // a dotted seed on the lid: "a seed goes here"
  el('path', { d: blob(-12, -19, 6.5, 4.6, { seed: seed + 7, n: 8 }), fill: 'none', stroke: '#3d6ea5', 'stroke-width': 2.2, 'stroke-dasharray': '1 4', 'stroke-linecap': 'round' }, lidInk);
  return { outer, shadow, mover, lid, ring };
}

/** What grows in the pot when the seed is planted. */
function drawSprout(parent: SVGGElement) {
  const g = el('g', { filter: 'url(#boil)' }, parent);
  el('path', { d: 'M0,-8 C-3,-20 3,-28 0,-40', fill: 'none', stroke: INK, 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
  el('path', { d: leaf(0, -30, -20, -42, 7.5), fill: '#a4b86d', stroke: INK, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, g);
  el('path', { d: leaf(0, -34, 19, -48, 7.5), fill: '#a4b86d', stroke: INK, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, g);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    el('circle', { cx: Math.cos(a) * 5, cy: -46 + Math.sin(a) * 5, r: 3.8, fill: '#e7a3a0', stroke: INK, 'stroke-width': 1.6 }, g);
  }
  el('circle', { cx: 0, cy: -46, r: 2.6, fill: '#f0d27a', stroke: INK, 'stroke-width': 1.4 }, g);
  return g;
}
