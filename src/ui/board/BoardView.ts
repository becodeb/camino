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
import { DELTA, type Board, type Obstacle, type RobotState, type Trace, type TraceStep } from '../../game/model';

export const S = 100;
/** Space above the grid, in board units. */
export const TOP = 46;
const SCALE = 1.1;
const CONFETTI = ['#de8a56', '#c9574a', '#e7a3a0', '#7298c1', '#f0d27a', '#a4b86d'];
const PERSIST = ['leaves', 'leafNew', 'roll', 'size'];
const now = () => performance.now();
export const feet = (c: number, r: number) => ({ x: c * S + S / 2, y: r * S + 78 });
/** Width / height of a board's viewBox, so the sheet around it can keep its shape. */
export const aspectOf = (b: Board) => (b.cols * S + 32) / (b.rows * S + TOP + 16);

type Rig = Record<string, any>;

// ------------------------------------------------------------------ figure
let uidN = 0;

export function buildFigure(def: CharacterDef, parent: SVGElement) {
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

/** A still portrait (tabs, start screen): a complete rig so no NaN reaches a transform. */
export function drawPortrait(def: CharacterDef, svg: SVGSVGElement, look = { x: 0.15, y: 0.25 }, mood: 'smile' | 'grin' = 'smile') {
  svg.textContent = '';
  const fig = buildFigure(def, svg);
  const rig = { hop: 0, sx: 1, sy: 1, lean: 0, spin: 0, face: 1, eyes: mood === 'grin' ? 'happy' : 'open', mouth: mood, ...JSON.parse(JSON.stringify(def.defaults)) };
  poseFigure(fig, rig, look, 0);
  def.render(rig, fig.parts, { t: 0, dt: 0.016, vx: 0, vy: 0, ay: 0 });
}

// ------------------------------------------------------------------ board view
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
  private lastInput = now();
  private nextFidget = now() + 5000;
  private idleTimer: number;
  running = false;

  constructor(svg: SVGSVGElement) {
    this.svg = svg;
    svg.textContent = '';
    for (const n of ['floor', 'deco', 'marks', 'obst', 'goal', 'trail', 'shadow', 'actor', 'fx']) {
      this.L[n] = el('g', { class: `layer-${n}` }, svg);
    }
    for (const n of ['floor', 'deco', 'obst', 'trail']) this.L[n].setAttribute('filter', 'url(#boil)');
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
  setBoard(board: Board, opts: { pop?: boolean } = {}) {
    this.board = board;
    const w = board.cols * S, h = board.rows * S;
    // extra room on top: characters in the first row and their jumps stick out of the grid
    this.svg.setAttribute('viewBox', `-16 -${TOP} ${w + 32} ${h + TOP + 16}`);
    for (const n of ['floor', 'deco', 'marks', 'obst', 'goal', 'trail', 'fx']) this.L[n].textContent = '';
    this.confetti = [];
    const R = rng(board.seed + 5);
    el('rect', { x: 0, y: 0, width: w, height: h, fill: '#f6efdf' }, this.L.floor);
    for (let c = 1; c < board.cols; c++) {
      el('path', { d: wobblyLine(c * S + (R() - 0.5) * 2, 2, c * S + (R() - 0.5) * 2, h - 2, { bow: 1.6, seed: c * 11 + board.seed, segs: 3, jit: 1 }), stroke: INK, 'stroke-width': 1.8, opacity: 0.42, fill: 'none', 'stroke-linecap': 'round' }, this.L.floor);
    }
    for (let r = 1; r < board.rows; r++) {
      el('path', { d: wobblyLine(2, r * S + (R() - 0.5) * 2, w - 2, r * S + (R() - 0.5) * 2, { bow: 1.6, seed: r * 13 + board.seed, segs: 4, jit: 1 }), stroke: INK, 'stroke-width': 1.8, opacity: 0.42, fill: 'none', 'stroke-linecap': 'round' }, this.L.floor);
    }
    el('path', { d: wobblyPoly([[0, 0], [w, 0], [w, h], [0, h]], { wob: 1.5, bow: 2.5, seed: board.seed }), fill: 'none', stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' }, this.L.floor);

    for (const d of board.deco) {
      const x = d.c * S + S / 2 + d.dx, y = d.r * S + d.dy + 50;
      const RR = rng(d.seed);
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
      const g = el('g', { transform: `translate(${o.c * S + S / 2} ${o.r * S + S / 2})` }, this.L.obst);
      pops.push(drawObstacle(g, o));
    }
    this.pickupNodes = board.pickups.map((p, i) => {
      const g = el('g', { transform: `translate(${p.c * S + S / 2} ${p.r * S + S / 2 + 10})`, 'data-guide': 'pickup' }, this.L.goal);
      pops.push(drawPickup(g, board.seed + i));
      return g;
    });
    const gOuter = el('g', { transform: `translate(${board.goal.c * S + S / 2} ${board.goal.r * S + S / 2 + 6})`, 'data-guide': 'target' }, this.L.goal);
    this.goalNodes = board.goalKind === 'pot' ? drawPot(gOuter, board.seed) : drawSeedGoal(gOuter, board.seed);
    Object.assign(this.goalState, { hop: 0, dx: 0, spin: 0, scale: 1 });
    pops.push(this.goalNodes.mover);
    this.pos = { c: board.start.c, r: board.start.r, mask: 0 };
    this.setGoalOpen(board.pickups.length === 0, false);
    if (opts.pop) pops.forEach((n, i) => popAnim(n, { dur: 320, delay: 80 + i * 70 }));
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

  setCharacter(def: CharacterDef) {
    const face = this.actor ? Math.sign(this.actor.rig.face) || 1 : 1;
    if (this.actor) {
      this.puff(this.actor.rig.x, this.actor.rig.y + this.actor.def.pivot * SCALE);
      this.actor.destroy();
    }
    this.actor = new Actor(this, def, feet(this.pos.c, this.pos.r));
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
  async play(trace: Trace, opts: { onStep?: (s: TraceStep) => void; celebrate?: boolean; quiet?: boolean } = {}): Promise<'win' | 'crash' | 'short' | 'aborted'> {
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
        await a.poofTo(feet(b.start.c, b.start.r));
        await a.wait(150);
      }
      this.trail.start(a);
      for (const s of trace.steps) {
        opts.onStep?.(s);
        const outcome = await this.playStep(a, s, 'full');
        if (outcome === 'crash') { result = 'crash'; return; }
        if (s.won) { result = 'win'; return; }
        if (!REDUCED) await a.wait(90);
      }
    });
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
  private async playStep(a: Actor, s: TraceStep, bump: 'full' | 'gentle'): Promise<'ok' | 'crash'> {
    const b = this.board!;
    const [dx, dy] = DELTA[s.dir];
    const dir = { dx, dy };
    if (dx && Math.sign(a.rig.face) !== dx) await a.T({ face: dx }, REDUCED ? 1 : 150, E.inOut);
    if (dy) a.lookAt(0, dy, 800); else a.lookAt(dx, 0.1, 800);
    for (const cell of s.cells) {
      const to = feet(cell.c, cell.r);
      if (s.kind === 'jump' && !REDUCED) {
        // a jump is a step with a big arc on top: the character's own step, lifted
        const lift = proc(a, 520, (p) => { a.rig.lift = -Math.sin(p * Math.PI) * 58; });
        await Promise.all([a.perform('step', to, dir), lift]);
        a.rig.lift = 0;
      } else {
        await a.perform('step', to, dir);
      }
      this.pos = { c: cell.c, r: cell.r, mask: this.pos.mask };
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
    } else {
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
    const g = el('g', { class: 'goal-ring', filter: 'url(#boil)' }, this.L.fx);
    const p = el('path', { d: penLoop(cx + 6, cy + 4, 64, 56, { seed: b.seed }), fill: 'none', stroke: '#3d6ea5', 'stroke-width': 3.6, 'stroke-linecap': 'round' }, g);
    drawOn(p, 560, 160);
    this.burstConfetti(cx, cy - 10);
    await a.act(() => a.perform('celebrate'));
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
    const high = y - 12 - 45 < -TOP;
    if (high) { x += (x < maxX / 2 ? 1 : -1) * (w / 2 + 34); y = -TOP + 57; }
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

  // ---------------------------------------------------------------- per frame
  private frame(t: number, dt: number) {
    if (!this.svg.isConnected) return;
    const a = this.actor;
    if (a) {
      a.render(dt);
      this.trail.sample(a);
    }
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
  blinkNext = now() / 1000 + 1.5;
  blinkTwice = false;
  nextZ = 0;
  onMark: null | (() => void) = null;

  constructor(readonly view: BoardView, readonly def: CharacterDef, at: { x: number; y: number }) {
    this.rig = {
      x: at.x, y: at.y, hop: 0, lift: 0, sx: 1, sy: 1, lean: 0, spin: 0, face: 1,
      eyes: 'open', mouth: 'smile', dizzy: 0, threaded: false,
      ...JSON.parse(JSON.stringify(def.defaults)),
    };
    if (def.id === 'brote') this.rig.leaves = progress.leaves;
    const L = view.L;
    this.shadow = el('ellipse', { rx: 25, ry: 5.5, fill: 'url(#hatch)' }, L.shadow);
    this.pos = el('g', {}, L.actor);
    this.ink = el('g', { filter: 'url(#boil)' }, this.pos);
    this.fig = buildFigure(def, this.ink);
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
