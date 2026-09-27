// Sheet 9's board: the recess in the forest. A big xylophone lies on the
// grass, its bars from do (long, red) to sol (short, blue) on two wooden
// rails. Brote plays it by hopping from bar to bar: each landing rings the
// bar (a soft marimba tone, ui/sound.ts), the bar dips and lights up and a
// note floats off it; on a silence he closes his eyes for a beat. Above, the
// song to copy is taped on as a strip of the same coloured bars, phrase by
// phrase: a tap on it plays it (its bars light up as it sounds); while Brote
// plays, a blue pen mark follows it and ticks every beat he got right. A
// wrong beat stops the song: the beat that was due is circled on the strip
// and its bar blinks in blue pen. On a free page the strip starts empty and
// writes the child's song down as Brote plays it. Every step works without
// sound: what sounds also shows.
//
// A subclass of the board view: the same Brote, the same run contract
// (play(trace) with onStep, the outcome), a different world.

import { blob, el, penLoop, rng, smoothOpen, wobblyLine, wobblyPoly } from '../../ink/ink.js';
import { E } from '../../ink/anim.js';
import { INK } from '../../ink/characters.js';
import { REDUCED } from '../runtime';
import { ringNote } from '../sound';
import { BAR_DARK, BAR_FILL, BAR_LEN, REST_PATH, barPath, toneSeed } from '../noteArt';
import { PITCHES, barCell, phrasesOf, toneOf, type MusicDef, type Pitch, type Tone } from '../../game/music';
import type { Board, Program, Trace, TraceStep } from '../../game/model';
import { BoardView, S, drawOn, feet, popAnim, type Frame } from './BoardView';

type Actor = NonNullable<BoardView['actor']>;
type Pt = { x: number; y: number };

const PEN = '#3d6ea5';
const PAPER = '#fbf7ee';
const SHADOW = 'rgba(84, 62, 38, 0.2)';
const TAPE = 'rgba(222, 204, 158, 0.85)';
const GROUND = '#eef0da';

/** One beat, in ms: a hop onto a bar and its note (about 107 beats a minute). */
export const BEAT = 560;
/** The paper around the xylophone: the song strip and the floating notes above, the grass below, a little room on the right. */
export const MUSIC_FRAME: Frame = { top: 244, right: 40, bottom: 64 };

const BAR_W = 76;
/** The bars' middle line (the row is 0–100; Brote's feet are at 78). */
const BAR_Y = 50;
/** The song strip, in board units, and where its notes go. */
const STRIP = { x0: 6, x1: 650, y0: -230, y1: -136 };
const MID = (STRIP.y0 + STRIP.y1) / 2;
const NOTES = { x0: 76, x1: 632 };
/** The widest a beat may be on the strip (short songs spread out and sit in the middle). */
const MAX_SLOT = 62;
/** A free page writes this many notes at most on its strip. */
const MAX_WRITTEN = 19;
const WRITE_SLOT = 29;

const barX = (p: Pitch) => barCell(p).c * S + S / 2;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let uid = 0;

/** A shape with its flat facet (docs/05 §5): clipped, the dark tone, the light one shifted up-left, the ink outline. */
function faceted(parent: SVGElement, d: string, light: string, dark: string, shift: [number, number], sw: number) {
  const id = `mv${++uid}`;
  const clip = el('clipPath', { id }, parent);
  el('path', { d }, clip);
  const f = el('g', { 'clip-path': `url(#${id})` }, parent);
  el('path', { d, fill: dark }, f);
  el('path', { d, fill: light, transform: `translate(${shift[0]} ${shift[1]})` }, f);
  el('path', { d, fill: 'none', stroke: INK, 'stroke-width': sw, 'stroke-linejoin': 'round' }, parent);
}

/** A strip of paper tape with jagged ends, centred on (x, y). */
function tape(parent: SVGElement, x: number, y: number, rot: number, w = 64, h = 20) {
  const pts: [number, number][] = [[0, 8], [6, 0], [12, 10], [18, 2], [82, 3], [88, 11], [94, 0], [100, 9], [100, 92], [94, 100], [88, 90], [82, 98], [18, 97], [12, 89], [6, 100], [0, 91]];
  const d = `M${pts.map(([px, py]) => `${((px / 100 - 0.5) * w).toFixed(1)},${((py / 100 - 0.5) * h).toFixed(1)}`).join(' L')} Z`;
  el('path', { d, fill: TAPE, transform: `translate(${x} ${y}) rotate(${rot})` }, parent);
}

/** Three short strokes of grass. */
function tuft(parent: SVGElement, x: number, y: number, seed: number) {
  const R = rng(seed);
  const a = -0.5 - R() * 0.3, b = 0.4 + R() * 0.3;
  el('path', {
    d: `M${x - 3},${y} l${(a * 10).toFixed(1)},-9 M${x},${y} l${((R() - 0.5) * 3).toFixed(1)},-12 M${x + 3},${y} l${(b * 10).toFixed(1)},-8`,
    stroke: INK, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.75, fill: 'none',
  }, parent);
}

interface Strip {
  /** The notes of the song (their animated inner groups), and where they sit. */
  notes: SVGGElement[];
  at: Pt[];
  /** The double bar at the end of the song. */
  end: Pt;
  slot: number;
  /** Pen marks: the cursor, the ticks, the rings. */
  marks: SVGGElement;
  /** A free page: the notes written as they are played. */
  written: SVGGElement;
}

export class MusicView extends BoardView {
  private bars = new Map<Pitch, SVGGElement>();
  private strip: Strip | null = null;
  /** Bumped to cancel a listening in progress. */
  private listenRun = 0;
  private cursorNode: SVGElement | null = null;

  constructor(svg: SVGSVGElement, readonly def: MusicDef, readonly reference: Program) {
    super(svg);
  }

  setBoard(board: Board, opts: { pop?: boolean; frame?: Frame } = {}) {
    super.setBoard(board, { ...opts, frame: opts.frame ?? MUSIC_FRAME });
    // the xylophone is not a grid: the board's floor and sky give way to the clearing
    this.L.floor.textContent = '';
    this.L.deco.textContent = '';
    this.bars.clear();
    this.cursorNode = null;
    this.drawBackdrop(board);
    this.drawGround(board);
    this.drawXylophone(board);
    this.drawStrip(board);
    if (opts.pop) [...this.bars.values()].forEach((g, i) => popAnim(g, { dur: 320, delay: 80 + i * 70, origin: '50% 50%' }));
  }

  // ---------------------------------------------------------------- the world

  /** The clearing: a band of forest floor with a wavy ink edge, a few tufts of grass. */
  private drawGround(b: Board) {
    const f = this.frameT;
    const left = -16, right = b.cols * S + 16 + f.right, bottom = b.rows * S + f.bottom;
    const R = rng(b.seed + 21);
    const pts: [number, number][] = Array.from({ length: 9 }, (_, i) => [left + ((right - left) * i) / 8, -44 + Math.sin(i * 1.7 + b.seed) * 5 + (R() - 0.5) * 6]);
    const edge = smoothOpen(pts);
    el('path', { d: `${edge} L${right},${bottom} L${left},${bottom} Z`, fill: GROUND }, this.L.floor);
    el('path', { d: edge, fill: 'none', stroke: INK, 'stroke-width': 2.2, opacity: 0.45, 'stroke-linecap': 'round' }, this.L.floor);
    [[22, 140], [88, 154], [318, 156], [646, 104], [24, -8]].forEach(([x, y], i) => tuft(this.L.floor, x, y, b.seed + i * 5));
    // a small bush at the right end, where the xylophone ends
    const bush = blob(622, 148, 26, 15, { wob: 0.12, n: 10, seed: b.seed + 8 });
    el('path', { d: bush, transform: 'translate(4 5)', fill: SHADOW }, this.L.floor);
    faceted(this.L.floor, bush, '#b4c47f', '#98ab66', [-6, -3], 2.6);
  }

  /** Far behind the clearing, in pencil: low hills and the round tops of a few trees (the forest the recess is in). */
  private drawBackdrop(b: Board) {
    const f = this.frameT;
    const right = b.cols * S + 16 + f.right;
    const R = rng(b.seed + 31);
    const g = el('g', { class: 'backdrop', opacity: 0.7 }, this.L.deco);
    for (const [x, y, r] of [[118, -62, 22], [160, -70, 28], [446, -66, 24], [488, -58, 18], [590, -64, 22]]) {
      el('path', { d: `M${x},${y + r * 0.7} L${x},${-40}`, stroke: INK, 'stroke-width': 1.8, opacity: 0.5, 'stroke-linecap': 'round' }, g);
      el('path', { d: blob(x, y, r, r * 0.86, { wob: 0.1, n: 9, seed: b.seed + x }), fill: '#dfe3c2', stroke: INK, 'stroke-width': 1.8, opacity: 0.9 }, g);
    }
    const pts: [number, number][] = [[-16, -44]];
    for (let i = 1; i < 8; i++) pts.push([-16 + ((right + 16) * i) / 8, -44 - (i % 2 ? 22 + R() * 16 : 6 + R() * 8)]);
    pts.push([right, -44]);
    el('path', { d: `${smoothOpen(pts)} Z`, fill: '#e7eacd' }, g);
    el('path', { d: smoothOpen(pts), fill: 'none', stroke: INK, 'stroke-width': 1.8, opacity: 0.45, 'stroke-linecap': 'round' }, g);
  }

  /** Two wooden rails, closer together towards sol, and the five bars lying across them. */
  private drawXylophone(b: Board) {
    const g = el('g', { class: 'xylophone' }, this.L.floor);
    const x0 = barX('do'), x4 = barX('sol');
    for (const side of [-1, 1]) {
      const ya = BAR_Y + side * (BAR_LEN.do / 2 - 24), yb = BAR_Y + side * (BAR_LEN.sol / 2 - 24);
      const y = (x: number) => ya + ((yb - ya) * (x - x0)) / (x4 - x0);
      const l = x0 - 56, r = x4 + 56, T = 9;
      const d = wobblyPoly([[l, y(l) - T], [r, y(r) - T], [r, y(r) + T], [l, y(l) + T]], { wob: 0.8, bow: 1, seed: b.seed + side + 7 });
      el('path', { d, transform: 'translate(4 5)', fill: SHADOW }, g);
      faceted(g, d, '#b08560', '#8d6844', [0, -3], 2.6);
      el('path', { d: wobblyLine(l + 12, y(l + 12) - 1, r - 12, y(r - 12) - 1, { bow: 1, seed: b.seed + side }), stroke: INK, 'stroke-width': 1.4, opacity: 0.4, fill: 'none', 'stroke-linecap': 'round' }, g);
    }
    for (const p of PITCHES) {
      const len = BAR_LEN[p], s = b.seed + toneSeed(p);
      const outer = el('g', { transform: `translate(${barX(p)} ${BAR_Y})`, class: 'xylo-bar', 'data-bar': p, role: 'button', 'aria-label': `Barra ${p}` }, g);
      const inner = el('g', {}, outer);
      const d = barPath(0, 0, BAR_W, len, 9, s);
      el('path', { d, transform: 'translate(4 5)', fill: SHADOW }, inner);
      faceted(inner, d, BAR_FILL[p], BAR_DARK[p], [-5, -4], 3);
      el('path', { d: `M${-BAR_W / 2 + 11},${-len / 2 + 14} L${-BAR_W / 2 + 11},${len / 2 - 34}`, stroke: PAPER, 'stroke-width': 3, opacity: 0.5, 'stroke-linecap': 'round' }, inner);
      for (const side of [-1, 1]) el('circle', { cx: 0, cy: side * (len / 2 - 24), r: 4.6, fill: '#e6dccb', stroke: INK, 'stroke-width': 2 }, inner);
      el('path', { d, fill: PAPER, opacity: 0, class: 'bar-flash' }, inner);
      outer.addEventListener('click', () => this.tapBar(p));
      this.bars.set(p, inner);
    }
  }

  /** The song strip taped above the xylophone: a speaker (tap to listen) and the song's bars in phrases; or, on a free page, a pencil and room to write. */
  private drawStrip(b: Board) {
    const g = el('g', { class: 'song-strip', role: 'button', tabindex: '0', 'aria-label': this.def.song ? 'Escuchar la canción' : 'Tu canción' }, this.L.deco);
    const d = wobblyPoly([[STRIP.x0, STRIP.y0], [STRIP.x1, STRIP.y0 + 3], [STRIP.x1 - 2, STRIP.y1], [STRIP.x0 + 3, STRIP.y1 - 2]], { wob: 1.2, bow: 2, seed: b.seed + 3 });
    el('path', { d, transform: 'translate(5 6)', fill: SHADOW }, g);
    el('path', { d, fill: PAPER, stroke: INK, 'stroke-width': 2.6, 'stroke-linejoin': 'round', class: 'strip-paper' }, g);
    // a faint pencil line the notes stand on, like a line of a songbook
    el('path', { d: wobblyLine(NOTES.x0 - 8, STRIP.y1 - 16, STRIP.x1 - 14, STRIP.y1 - 15, { bow: 1.2, seed: b.seed + 4, segs: 3 }), stroke: INK, 'stroke-width': 1.4, opacity: 0.22, fill: 'none', 'stroke-linecap': 'round' }, g);
    tape(g, STRIP.x0 + 60, STRIP.y0 + 1, -7);
    tape(g, STRIP.x1 - 110, STRIP.y0 + 3, 6);
    if (this.def.song) this.drawSpeaker(g); else this.drawPencil(g);

    const song = this.def.song ?? [];
    const groups = phrasesOf(this.reference);
    const gs = groups.length && groups.reduce((a, n) => a + n, 0) === song.length ? groups : [song.length];
    const gaps = Math.max(0, gs.length - 1);
    const slot = Math.min(MAX_SLOT, (NOTES.x1 - NOTES.x0) / (song.length + gaps * 0.7 + 1));
    const width = (song.length + gaps * 0.7 + 1) * slot;
    const at: Pt[] = [];
    let x = NOTES.x0 + (NOTES.x1 - NOTES.x0 - width) / 2 + slot / 2;
    gs.forEach((n, gi) => {
      for (let k = 0; k < n; k++) { at.push({ x, y: MID }); x += slot; }
      if (gi < gaps) x += slot * 0.7;
    });
    const notesG = el('g', { class: 'strip-notes' }, g);
    const notes = song.map((t, i) => this.stripNote(notesG, t, at[i], slot, b.seed + i * 3));
    const end = { x: x - slot / 2 + slot * 0.5, y: MID };
    if (song.length) {
      // the double bar that ends a song
      el('path', { d: wobblyLine(end.x, MID - 32, end.x, MID + 30, { bow: 0.8, seed: b.seed + 5 }), stroke: INK, 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }, g);
      el('path', { d: wobblyLine(end.x + 7, MID - 32, end.x + 7, MID + 30, { bow: 0.8, seed: b.seed + 6 }), stroke: INK, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }, g);
    }
    const written = el('g', { class: 'strip-written' }, g);
    const marks = el('g', { class: 'strip-marks' }, g);
    this.strip = { notes, at, end, slot, marks, written };
    if (this.def.song) {
      g.addEventListener('click', () => void this.listen());
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void this.listen(); } });
    }
  }

  /** "Listen": a small yellow speaker and its sound, like the bar's, at the start of the strip. */
  private drawSpeaker(g: SVGElement) {
    const s = el('g', { class: 'strip-speaker', transform: `translate(24 ${MID})` }, g);
    el('path', { d: 'M-12,-8 L-4,-8 L7,-18 L7,18 L-4,8 L-12,8 Z', fill: '#f0d27a', stroke: INK, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, s);
    const w = el('g', { class: 'strip-waves', fill: 'none', stroke: PEN, 'stroke-width': 3, 'stroke-linecap': 'round' }, s);
    el('path', { d: 'M15,-9 Q21,0 15,9' }, w);
    el('path', { d: 'M22,-17 Q32,0 22,17' }, w);
  }

  /** A free page: a pencil lying at the start of the strip (a song to write). */
  private drawPencil(g: SVGElement) {
    const p = el('g', { transform: `translate(34 ${MID + 4}) rotate(-58)`, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', stroke: INK }, g);
    el('path', { d: 'M-4,-22 L4,-22 L4,14 L-4,14 Z', fill: '#f0d27a', 'stroke-width': 2 }, p);
    el('path', { d: 'M-4,-22 L4,-22 L4,-29 L-4,-29 Z', fill: '#e7a3a0', 'stroke-width': 2 }, p);
    el('path', { d: 'M-4,14 L0,25 L4,14 Z', fill: '#ecd3ad', 'stroke-width': 2 }, p);
    el('path', { d: 'M-1.4,21 L0,25 L1.4,21 Z', fill: INK, 'stroke-width': 1 }, p);
  }

  /** One beat on the strip: a small bar in its colour (as long as the note is low), or the rest sign. Returns the group that animates. */
  private stripNote(parent: SVGElement, t: Tone, at: Pt, slot: number, seed: number): SVGGElement {
    const outer = el('g', { transform: `translate(${at.x.toFixed(1)} ${at.y})` }, parent);
    const inner = el('g', {}, outer);
    if (t === 'rest') {
      el('path', { d: REST_PATH, transform: 'scale(1.3) translate(-24 -24)', fill: 'none', stroke: INK, 'stroke-width': 3.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, inner);
      return inner;
    }
    const len = BAR_LEN[t] * 0.44, w = Math.min(21, slot * 0.56);
    const d = barPath(0, 0, w, len, 4, seed);
    el('path', { d, transform: 'translate(2.5 3)', fill: SHADOW }, inner);
    el('path', { d, fill: BAR_DARK[t] }, inner);
    el('path', { d: barPath(-1.4, -1.6, w - 3.5, len - 3.5, 3.4, seed + 1), fill: BAR_FILL[t] }, inner);
    el('path', { d, fill: 'none', stroke: INK, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, inner);
    return inner;
  }

  // ---------------------------------------------------------------- sounds and marks

  /** A bar rings: its note (if there is sound), a dip, a flash, a note floating off, two lines of sound. */
  private ringBar(p: Pitch) {
    ringNote(p);
    const g = this.bars.get(p);
    if (!g || REDUCED) return;
    g.style.transformBox = 'fill-box';
    g.style.transformOrigin = '50% 50%';
    g.animate([{ transform: 'none' }, { transform: 'translateY(4px) scale(0.97, 0.95)', offset: 0.18 }, { transform: 'none' }], { duration: 340, easing: 'ease-out' });
    g.querySelector('.bar-flash')?.animate([{ opacity: 0.6 }, { opacity: 0 }], { duration: 420, easing: 'ease-out' });
    this.floatNote(p);
  }

  /** An eighth note in the bar's colour floats up off it and fades. */
  private floatNote(p: Pitch) {
    const R = Math.random;
    const outer = el('g', { transform: `translate(${(barX(p) + (R() - 0.5) * 24).toFixed(1)} ${BAR_Y - BAR_LEN[p] / 2 - 4})` }, this.L.fx);
    const inner = el('g', { filter: 'url(#boil)' }, outer);
    el('path', { d: 'M8,-3 L8,-38 C14,-33 21,-28 18,-17', fill: 'none', stroke: INK, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, inner);
    el('ellipse', { cx: 1, cy: -1, rx: 9.5, ry: 7, transform: 'rotate(-22 1 -1)', fill: BAR_FILL[p], stroke: INK, 'stroke-width': 2.6 }, inner);
    for (const s of [-1, 1]) {
      el('path', { d: `M${s * 44},-4 l${s * 11},-7 M${s * 46},10 l${s * 12},1`, stroke: PEN, 'stroke-width': 2.6, 'stroke-linecap': 'round', fill: 'none' }, outer)
        .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, fill: 'forwards' });
    }
    inner.style.transformBox = 'fill-box';
    inner.style.transformOrigin = '50% 100%';
    const sway = (R() - 0.5) * 30;
    inner.animate([
      { transform: 'translate(0, 0) scale(0.5)', opacity: 0 },
      { transform: `translate(${(-sway / 3).toFixed(1)}px, -28px) scale(1.1)`, opacity: 1, offset: 0.22 },
      { transform: `translate(${sway.toFixed(1)}px, -90px) scale(0.95)`, opacity: 0 },
    ], { duration: 1150, easing: 'ease-out', fill: 'forwards' }).finished.then(() => outer.remove(), () => outer.remove());
  }

  /** The bar that was due: a dashed blue pen outline blinks round it and stays until the next run. */
  private hintBar(p: Pitch) {
    const outer = el('g', { class: 'bump-mark', transform: `translate(${barX(p)} ${BAR_Y})` }, this.L.fx);
    const g = el('g', { filter: 'url(#boil)' }, outer);
    el('path', { d: barPath(0, 0, BAR_W + 22, BAR_LEN[p] + 22, 16, 3), fill: 'none', stroke: PEN, 'stroke-width': 3.4, 'stroke-dasharray': '8 8', 'stroke-linecap': 'round' }, g);
    if (!REDUCED) g.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], { duration: 900, iterations: 2 });
  }

  private clearStripMarks() {
    if (this.strip) this.strip.marks.textContent = '';
    this.cursorNode = null;
  }

  private clearWritten() {
    if (this.strip) this.strip.written.textContent = '';
  }

  /** The blue pen follows the song: a stroke under the beat that sounds now. */
  private cursor(i: number) {
    const s = this.strip;
    this.cursorNode?.remove();
    this.cursorNode = null;
    const at = s?.at[i];
    if (!s || !at) return;
    const w = s.slot * 0.36;
    const path = el('path', { d: wobblyLine(at.x - w, STRIP.y1 - 9, at.x + w, STRIP.y1 - 10, { bow: 1, seed: i + 2 }), stroke: PEN, 'stroke-width': 3.6, fill: 'none', 'stroke-linecap': 'round' }, s.marks);
    drawOn(path, 150);
    this.cursorNode = path;
  }

  /** A beat Brote got right: a small blue tick under it, and the note bounces. */
  private tick(i: number) {
    const s = this.strip;
    const at = s?.at[i];
    if (!s || !at) return;
    const dot = el('circle', { cx: at.x, cy: STRIP.y1 - 9, r: 3.6, fill: PEN }, s.marks);
    popAnim(dot, { dur: 220, origin: '50% 50%' });
    this.bounce(i);
  }

  private bounce(i: number) {
    const n = this.strip?.notes[i];
    if (!n || REDUCED) return;
    n.style.transformBox = 'fill-box';
    n.style.transformOrigin = '50% 100%';
    n.animate([{ transform: 'none' }, { transform: 'translateY(-5px) scale(1.12)', offset: 0.35 }, { transform: 'none' }], { duration: 300, easing: 'ease-out' });
  }

  /** A pen loop round a spot of the strip (the beat that was due), that pulses a few times. */
  private ringStrip(at: Pt, rx: number) {
    const s = this.strip;
    if (!s) return;
    const g = el('g', { class: 'strip-ring', filter: 'url(#boil)' }, s.marks);
    const path = el('path', { d: penLoop(at.x, at.y + 2, rx, 46, { seed: Math.round(at.x) }), fill: 'none', stroke: PEN, 'stroke-width': 3.8, 'stroke-linecap': 'round' }, g);
    drawOn(path, 420);
    if (!REDUCED) g.animate([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], { duration: 700, delay: 450, iterations: 3 });
  }

  /** A free page: the note just played is written on the strip. */
  private write(i: number, t: Tone) {
    const s = this.strip;
    if (!s || i >= MAX_WRITTEN) return;
    const n = this.stripNote(s.written, t, { x: NOTES.x0 + WRITE_SLOT / 2 + i * WRITE_SLOT, y: MID }, WRITE_SLOT, i * 7 + 1);
    popAnim(n, { dur: 260, origin: '50% 100%' });
  }

  /** Brote looks at a point of the board for a while. */
  private lookAtPoint(a: Actor, p: Pt, ms: number) {
    const ex = a.rig.x, ey = a.rig.y - 43;
    const dx = p.x - ex, dy = p.y - ey, d = Math.hypot(dx, dy) || 1;
    a.lookAt(dx / d, dy / d, ms);
  }

  // ---------------------------------------------------------------- the child's taps

  /** A bar tapped: it rings (Brote glances at it). */
  private tapBar(p: Pitch) {
    if (this.running) return;
    this.stopListening();
    this.ringBar(p);
    const a = this.actor;
    if (a) this.lookAtPoint(a, { x: barX(p), y: BAR_Y }, 900);
  }

  /** A note card brought to the notebook rings its bar. */
  cardAdded(cmd: string) {
    const t = toneOf(cmd);
    if (t && t !== 'rest' && !this.running) this.ringBar(t);
  }

  /** The strip tapped: the song plays on the xylophone (without Brote), its beats lighting up one by one. */
  async listen() {
    const song = this.def.song;
    if (!song || this.running) return;
    const run = ++this.listenRun;
    this.clearStripMarks();
    const a = this.actor;
    for (let i = 0; i < song.length; i++) {
      if (run !== this.listenRun || this.running) return;
      const t = song[i];
      this.cursor(i);
      this.bounce(i);
      if (t !== 'rest') this.ringBar(t);
      if (a && !a.busy) {
        this.lookAtPoint(a, this.strip?.at[i] ?? { x: 300, y: MID }, BEAT + 200);
        void a.act(async () => { await a.T({ sy: 0.94, sx: 1.04 }, 90, E.out); await a.T({ sy: 1, sx: 1 }, 150, E.inOut); });
      }
      await sleep(BEAT);
    }
    if (run === this.listenRun && !this.running) this.clearStripMarks();
  }

  stopListening() {
    this.listenRun++;
  }

  // ---------------------------------------------------------------- running

  /** One beat of a run: a hop onto the note's bar and its sound, or a silence with the eyes closed. */
  private async beat(a: Actor, s: TraceStep) {
    const t = toneOf(s.cmd)!;
    const right = s.kind !== 'crash';
    this.cursor(s.index);
    if (t === 'rest') {
      a.rig.eyes = 'closed';
      a.rig.mouth = 'o';
      if (REDUCED) await a.wait(BEAT);
      else {
        await a.T({ sy: 0.95, sx: 1.04 }, 140, E.out);
        await a.wait(BEAT - 280);
        await a.T({ sy: 1, sx: 1 }, 140, E.inOut);
      }
      a.rig.eyes = 'open';
      a.rig.mouth = 'smile';
      if (right) { this.tick(s.index); if (this.def.free) this.write(s.index, t); }
      return;
    }
    const to = feet(s.to.c, s.to.r);
    const dx = Math.sign(to.x - a.rig.x);
    const land = () => {
      this.pos = { c: s.to.c, r: s.to.r, mask: 0 };
      this.ringBar(t);
      if (right) { this.tick(s.index); if (this.def.free) this.write(s.index, t); }
    };
    if (REDUCED) {
      Object.assign(a.rig, { x: to.x, y: to.y, face: dx || a.rig.face });
      land();
      await a.wait(BEAT);
      return;
    }
    const dist = Math.abs(to.x - a.rig.x) / S;
    const arc = dist ? 30 + dist * 8 : 20;
    if (dx && Math.sign(a.rig.face) !== dx) await a.T({ face: dx }, 70, E.inOut);
    a.lookAt(dx, 0.5, 500);
    await a.T({ sy: 0.84, sx: 1.12 }, dx ? 60 : 70, E.out);
    const lift = a.P(250, (p) => {
      const k = Math.sin(p * Math.PI);
      a.rig.hop = -k * arc;
      a.rig.sy = 1 + k * 0.12;
      a.rig.sx = 1 - k * 0.08;
    });
    await Promise.all([a.T({ x: to.x, y: to.y }, 250, E.inOut), lift]);
    a.rig.hop = 0;
    land();
    await a.T({ sy: 0.8, sx: 1.18 }, 60, E.out);
    await a.T({ sy: 1.05, sx: 0.96 }, 90, E.out);
    await a.T({ sy: 1, sx: 1 }, 90, E.inOut);
  }

  /**
   * Plays a run: Brote hops the notes in rhythm. `onStep` fires as each beat
   * starts (the notebook rings the card). Resolves with the outcome once
   * Brote has reacted: the dance, or a look at the beat that was due.
   */
  async play(trace: Trace, opts: {
    onStep?: (s: TraceStep) => void; celebrate?: boolean; quiet?: boolean; gate?: () => Promise<void>; onDone?: () => void;
  } = {}): Promise<'win' | 'crash' | 'short' | 'aborted'> {
    const a = this.actor, b = this.board;
    if (!a || !b) return 'aborted';
    this.stopListening();
    this.running = true;
    this.clearMarks();
    this.clearStripMarks();
    if (this.def.free) this.clearWritten();
    const away = this.pos.c !== b.start.c || this.pos.r !== b.start.r;
    let result = 'short' as 'win' | 'crash' | 'short';
    const ok = await a.act(async () => {
      await a.settle(120);
      if (away) {
        this.pos = { c: b.start.c, r: b.start.r, mask: 0 };
        await a.poofTo(feet(b.start.c, b.start.r));
        await a.wait(150);
      }
      for (const s of trace.steps) {
        if (opts.gate) await opts.gate();
        opts.onStep?.(s);
        await this.beat(a, s);
        if (s.kind === 'crash') { result = 'crash'; return; }
      }
      result = trace.outcome === 'win' ? 'win' : 'short';
    }).finally(() => opts.onDone?.());
    this.cursorNode?.remove();
    this.cursorNode = null;
    if (!ok) { this.running = false; return 'aborted'; }
    if (result === 'win') { if (opts.celebrate !== false) await this.celebrate(); }
    else if (result === 'crash') await this.dueBeat(trace.steps[trace.crashAt!]?.index ?? trace.steps.length - 1, !!trace.steps[trace.crashAt!]?.crash?.out);
    else if (!opts.quiet) await this.dueBeat(trace.steps.length, false);
    this.running = false;
    // a long song is not a quiet page: Brote dozes off only after a while without anyone
    this.lastInput = performance.now();
    return result;
  }

  /**
   * The song and the notebook parted here: the beat that was due is circled
   * on the strip (or its end, when the song was over) and its bar blinks;
   * Brote looks at it, "¿Mmm?". A free page only puzzles him.
   */
  private async dueBeat(i: number, over: boolean) {
    const a = this.actor, s = this.strip;
    if (!a) return;
    const due = this.def.song?.[i];
    const spot = s && this.def.song ? (over || !s.at[i] ? s.end : s.at[i]) : null;
    if (spot && s) this.ringStrip(spot, over || !s.at[i] ? 22 : s.slot * 0.6);
    if (due && due !== 'rest' && !over) this.hintBar(due);
    await a.act(async () => {
      if (spot) this.lookAtPoint(a, spot, 1700);
      a.rig.mouth = 'wavy';
      a.bubble('¿Mmm?');
      await a.wait(1150);
      a.rig.mouth = 'smile';
    });
  }

  /** The song is right: its beats light up one after the other, notes burst off the xylophone, Brote dances. */
  async celebrate() {
    const a = this.actor;
    if (!a) return;
    const s = this.strip;
    s?.notes.forEach((_, i) => setTimeout(() => {
      this.bounce(i);
      const at = s.at[i];
      const star = el('path', { d: `M${at.x},${STRIP.y0 - 12} l2.8,6.4 6.8,0 -5.5,4.3 2.1,6.8 -6.2,-4 -6.2,4 2.1,-6.8 -5.5,-4.3 6.8,0 Z`, fill: '#f0d27a', stroke: INK, 'stroke-width': 1.7, 'stroke-linejoin': 'round' }, s.marks);
      popAnim(star, { dur: 260, origin: '50% 50%' });
    }, REDUCED ? 0 : i * 70));
    this.burstNotes(barX('mi'), -30);
    await a.act(async () => {
      a.rig.eyes = 'happy';
      a.rig.mouth = 'grin';
      if (!REDUCED) {
        for (let i = 0; i < 4; i++) {
          const side = i % 2 ? 1 : -1;
          await a.T({ lean: 12 * side, hop: -16, sy: 1.08, sx: 0.94 }, 170, E.out);
          await a.T({ hop: 0, sy: 0.9, sx: 1.08 }, 130, E.in);
        }
        await a.T({ lean: 0, sy: 1, sx: 1 }, 120, E.inOut);
      }
      await a.perform('celebrate');
    });
  }

  /** Confetti made of notes in the bars' colours. */
  private burstNotes(x: number, y: number) {
    if (REDUCED) return;
    const R = Math.random;
    for (let i = 0; i < 20; i++) {
      const node = el('g', {}, this.L.fx);
      el('path', { d: 'M5,-2 L5,-21 C9,-18 13,-15 11,-9', fill: 'none', stroke: INK, 'stroke-width': 2, 'stroke-linecap': 'round' }, node);
      el('ellipse', { cx: 0, cy: 0, rx: 6.4, ry: 4.8, transform: 'rotate(-22)', fill: BAR_FILL[PITCHES[i % PITCHES.length]], stroke: INK, 'stroke-width': 1.8 }, node);
      this.confetti.push({
        node, x, y, vx: (R() - 0.5) * 460, vy: -280 - R() * 330, rot: (R() - 0.5) * 50, vr: (R() - 0.5) * 240,
        ph: R() * 6, life: 0, max: 2.1 + R() * 0.7, flip: R() * 6,
      });
    }
  }

  async reset(opts: { keepMarks?: boolean } = {}) {
    this.stopListening();
    this.clearStripMarks();
    if (this.def.free) this.clearWritten();
    await super.reset(opts);
  }
}
