// The wardrobe's pieces, drawn in ink on any of the four characters (the
// figure BoardView builds for the board, the portraits, the stage). Each
// character has its fitting points (where a hat sits, where a neck would be,
// its back, its waist, its feet); each piece is drawn once around such a
// point, so it follows the body as it squashes, leans and turns (it lives
// inside the figure's body group). Same recipe as the characters
// (docs/style-guide.md §5): a few shapes, one ink outline, a darker flat facet,
// finer inner lines; no gradients. Imperative on purpose, like
// ink/characters.js: the actor redraws nothing per frame.

import { blob, el, leaf, rng, smoothClosed, smoothOpen, wobblyLine, wobblyPoly } from '../ink/ink.js';
import type { CharacterDef } from '../ink/characters.js';
import type { ItemId, Outfit, Slot } from '../curriculum/motivation';

const INK = '#2b2622';
const CREAM = '#fbf7ee';
const SW = 2.6;
const ink = (extra: Record<string, string | number> = {}) => ({ stroke: INK, 'stroke-width': SW, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...extra });

/** Where something sits: a point, the body's half-width there, a tilt. */
interface Anchor { x: number; y: number; w: number; rot?: number }
/** A character's fitting points (local coordinates: feet at 0, up is negative). */
interface Fit {
  /** The hat's brim, on top of the head. */
  head: Anchor;
  /** The flower crown (round the head; a bird's pointed head wears it lower). */
  crown?: Anchor;
  /** Round the neck (under the mouth). */
  neck: Anchor;
  /** The shoulders (the cape and the backpack hang from here); `h`: down to where they end; `side`: the back's side (−1 left); `strap`: one across the chest (a bird seen from the side). */
  back: Anchor & { h: number; side: -1 | 1; strap?: 'one' | 'none' };
  /** Round the waist (the float ring). */
  waist: Anchor;
  /** Where each boot stands, and their size. */
  feet: [number, number][];
  boot: number;
  /** Pliegue's boots go in his legs' group (they fold with them when he tucks his legs in). */
  bootsInLegs?: boolean;
}

/** Fitted by eye on each body (ink/characters.js), checked on screenshots of every piece on every character. */
const FITS: Record<CharacterDef['id'], Fit> = {
  // an egg: head and body in one, a sprout on top (it pokes out of a hat)
  brote: {
    head: { x: 0, y: -61, w: 27, rot: -7 },
    neck: { x: 0, y: -14, w: 27 },
    back: { x: 0, y: -58, w: 26, h: 56, side: -1 },
    waist: { x: 0, y: -9, w: 32 },
    feet: [[-13, 1], [13, 1]], boot: 1,
  },
  // a pencil: the eraser is the top of the head, the paint is the face and the body
  mina: {
    head: { x: 0, y: -82, w: 21, rot: -5 },
    neck: { x: 0, y: -30, w: 18 },
    back: { x: 0, y: -66, w: 17, h: 50, side: -1 },
    waist: { x: 0, y: -22, w: 22 },
    feet: [[-8, 1], [8, 1]], boot: 0.8,
  },
  // a folded paper bird facing right: the hat perches on the tip, the back is on the left (the tail's side)
  pliegue: {
    head: { x: 3, y: -83, w: 16, rot: 9 },
    crown: { x: 3, y: -73, w: 11, rot: 9 },
    neck: { x: 1, y: -37, w: 22 },
    back: { x: -2, y: -64, w: 19, h: 44, side: -1, strap: 'one' },
    waist: { x: 0, y: -21, w: 30 },
    feet: [[-7, 0], [7, 0]], boot: 0.7, bootsInLegs: true,
  },
  // a ball of yarn: the needle sticks out on the right, so the hat leans left
  ovillo: {
    head: { x: -7, y: -57, w: 24, rot: -13 },
    neck: { x: 0, y: -14, w: 27 },
    back: { x: 0, y: -52, w: 27, h: 50, side: -1 },
    waist: { x: 0, y: -6, w: 33 },
    feet: [[-14, 2], [14, 2]], boot: 0.92,
  },
};

/** A shape with its darker flat facet: clipped, the dark tone, the light one shifted over it, the outline on top. */
function facet(parent: SVGElement, d: string, light: string, dark: string, id: string, shift: [number, number] = [-3, -3], sw = SW) {
  const clip = el('clipPath', { id }, parent);
  el('path', { d }, clip);
  const g = el('g', { 'clip-path': `url(#${id})` }, parent);
  el('path', { d, fill: dark }, g);
  el('path', { d, fill: light, transform: `translate(${shift[0]} ${shift[1]})` }, g);
  const outline = el('path', { d, fill: 'none', ...ink({ 'stroke-width': sw }) }, parent);
  // details drawn inside the shape (veins, stripes) stay under its outline
  return { inside: g, outline };
}

const at = (parent: SVGElement, a: Anchor, item: string) =>
  el('g', { transform: `translate(${a.x} ${a.y})${a.rot ? ` rotate(${a.rot})` : ''}`, 'data-item': item }, parent);

// ------------------------------------------------------------------ the pieces

/** A mushroom cap: red with cream spots, its gills underneath; the brim's centre at the anchor. */
function hongo(front: SVGElement, a: Anchor, uid: string) {
  const g = at(front, a, 'hongo');
  const w = a.w * 1.18;
  el('path', { d: `M${-0.84 * w},${0.02 * w} Q0,${0.34 * w} ${0.84 * w},${0.02 * w} Z`, fill: '#ecd3ad', ...ink({ 'stroke-width': 2.2 }) }, g);
  for (const x of [-0.45, -0.15, 0.15, 0.45]) el('path', { d: `M${x * w},${0.05 * w} L${x * w * 0.9},${0.2 * w}`, stroke: INK, 'stroke-width': 1.3, opacity: 0.5 }, g);
  const R = rng(7);
  const pts: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const t = Math.PI + (i / 12) * Math.PI;
    pts.push([Math.cos(t) * w * (1 + (R() - 0.5) * 0.04), Math.sin(t) * w * 0.86 + 0.04 * w]);
  }
  facet(g, smoothDome(pts, w), '#c9574a', '#a8463b', `${uid}-hongo`, [-4, -4]);
  for (const [x, y, r] of [[-0.46, -0.46, 0.16], [0.18, -0.64, 0.13], [0.56, -0.26, 0.12], [-0.06, -0.3, 0.08], [-0.78, -0.12, 0.08]] as const) {
    el('path', { d: blob(x * w, y * w, r * w, r * w * 0.8, { seed: Math.round(x * 100 + 50), n: 7 }), fill: CREAM }, g);
  }
}

/** The dome of a cap through the given points (its underside a gentle curve). */
function smoothDome(pts: [number, number][], w: number) {
  return `${smoothOpen(pts)} Q0,${(0.24 * w).toFixed(1)} ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)} Z`;
}

/** A crown of flowers round the head: leaves behind, five small flowers in front. */
function corona(front: SVGElement, behind: SVGElement, a: Anchor) {
  const w = a.w * 1.02;
  const back = at(behind, a, 'corona');
  for (let i = 0; i < 5; i++) {
    const t = Math.PI + ((i + 0.5) / 5) * Math.PI;
    const x = Math.cos(t) * w, y = Math.sin(t) * w * 0.32 - 4;
    el('path', { d: leaf(x, y, x + (i < 2 ? -9 : i > 2 ? 9 : 0), y - 8, 3.6), fill: '#a4b86d', ...ink({ 'stroke-width': 1.8 }) }, back);
  }
  const g = at(front, a, 'corona');
  el('path', { d: `M${-w},-2 Q0,${w * 0.34} ${w},-2`, fill: 'none', stroke: '#879b52', 'stroke-width': 3.4, 'stroke-linecap': 'round' }, g);
  const colors = ['#e7a3a0', '#f0d27a', '#7298c1', '#f0d27a', '#e7a3a0'];
  for (let i = 0; i < 5; i++) {
    const t = (i / 4) * Math.PI;
    const x = -Math.cos(t) * w * 0.92, y = Math.sin(t) * w * 0.3 - 2;
    if (i % 2 === 0) el('path', { d: leaf(x, y, x + (i === 0 ? -8 : i === 4 ? 8 : 6), y + 6, 3.2), fill: '#a4b86d', ...ink({ 'stroke-width': 1.6 }) }, g);
    const f = el('g', { transform: `translate(${x.toFixed(1)} ${(y - 3).toFixed(1)})` }, g);
    for (let k = 0; k < 5; k++) {
      const an = (k / 5) * Math.PI * 2 - Math.PI / 2;
      el('circle', { cx: (Math.cos(an) * 3.6).toFixed(2), cy: (Math.sin(an) * 3.6).toFixed(2), r: 3, fill: colors[i], ...ink({ 'stroke-width': 1.3 }) }, f);
    }
    el('circle', { r: 2, fill: i === 1 || i === 3 ? '#de8a56' : '#f0d27a', ...ink({ 'stroke-width': 1.1 }) }, f);
  }
}

/** A knitted scarf: a striped band round the neck, knotted on one side, two fringed tails hanging. */
function bufanda(front: SVGElement, a: Anchor, uid: string) {
  const g = at(front, a, 'bufanda');
  const w = a.w + 3;
  const band = `M${-w},-6 Q0,1 ${w},-6 L${w + 1},4 Q0,12 ${-w - 1},4 Z`;
  const tail = (x0: number, len: number, sway: number) =>
    wobblyPoly([[x0 - 5, 2], [x0 + 5, 2], [x0 + 6 + sway, len], [x0 - 4 + sway, len + 1]], { wob: 0.4, bow: 0.8, seed: Math.round(len) });
  const kx = w * 0.46;
  const tails = [tail(kx + 3, 26, 3), tail(kx - 6, 20, -1)];
  for (const [i, d] of tails.entries()) {
    el('path', { d, fill: '#c9574a', ...ink({ 'stroke-width': 2.2 }) }, g);
    const clip = el('clipPath', { id: `${uid}-bt${i}` }, g);
    el('path', { d }, clip);
    const s = el('g', { 'clip-path': `url(#${uid}-bt${i})` }, g);
    for (const y of [9, 16]) el('rect', { x: kx - 14, y, width: 30, height: 3.4, fill: CREAM }, s);
    el('path', { d, fill: 'none', ...ink({ 'stroke-width': 2.2 }) }, g);
    const end = i ? { x: kx - 6 - 1, y: 21 } : { x: kx + 3 + 3, y: 27 };
    for (const dx of [-3, 0, 3]) el('path', { d: `M${end.x + dx},${end.y} l${dx * 0.2},4`, stroke: INK, 'stroke-width': 1.5 }, g);
  }
  facet(g, band, '#c9574a', '#a8463b', `${uid}-bband`, [0, -2], 2.4);
  const clip = el('clipPath', { id: `${uid}-bstripes` }, g);
  el('path', { d: band }, clip);
  const st = el('g', { 'clip-path': `url(#${uid}-bstripes)` }, g);
  for (let x = -w + 6; x < w; x += 11) el('rect', { x, y: -12, width: 3.6, height: 30, fill: CREAM, transform: `rotate(8 ${x} 0)` }, st);
  el('path', { d: band, fill: 'none', ...ink({ 'stroke-width': 2.4 }) }, g);
  el('path', { d: blob(kx, 3, 5.6, 4.6, { seed: 3, n: 8 }), fill: '#c9574a', ...ink({ 'stroke-width': 2.2 }) }, g);
}

/**
 * A big leaf worn as a cape: its blade hangs behind the body, wider than it
 * (green on both sides, its tip down the back to the ground), its midrib and
 * veins; in front, its stem goes round the neck and ends in a curl.
 */
function capa(front: SVGElement, behind: SVGElement, a: Fit['back'], neck: Anchor, uid: string) {
  const g = at(behind, { ...a, rot: a.side * 7 }, 'capa');
  const W = a.w + 13, h = a.h - 2, tip = a.side * 8;
  const d = smoothClosed([
    [0, -5], [W * 0.62, -1], [W, h * 0.3], [W * 0.96, h * 0.62], [W * 0.62, h * 0.88], [tip + W * 0.12, h],
    [tip, h + 6], [tip - W * 0.2, h * 0.98], [-W * 0.6, h * 0.86], [-W * 0.98, h * 0.6], [-W, h * 0.28], [-W * 0.6, -1],
  ]);
  el('path', { d, transform: 'translate(3 4)', fill: 'rgba(84, 62, 38, 0.2)' }, g);
  const { inside } = facet(g, d, '#a4b86d', '#879b52', `${uid}-capa`, [a.side * 7, -2]);
  el('path', { d: wobblyLine(0, -2, tip * 0.8, h + 2, { bow: 1.4, seed: 5, segs: 2 }), stroke: INK, 'stroke-width': 1.6, opacity: 0.5, fill: 'none' }, inside);
  for (let i = 1; i <= 3; i++) {
    const y = (h * i) / 4 - 4, k = 1 - i * 0.12;
    for (const s of [-1, 1]) el('path', { d: `M${(tip * y) / h * 0.8},${y} q${s * W * 0.45 * k},${-7} ${s * W * 0.82 * k},${-15}`, stroke: INK, 'stroke-width': 1.3, opacity: 0.45, fill: 'none' }, inside);
  }
  // the stem round the neck, a curl on one side
  const n = at(front, { x: neck.x, y: neck.y - 5, w: neck.w }, 'capa-tallo');
  const w = neck.w;
  el('path', { d: `M${-w * 0.92},-3 Q0,6 ${w * 0.92},-3`, fill: 'none', stroke: INK, 'stroke-width': 5.2, 'stroke-linecap': 'round' }, n);
  el('path', { d: `M${-w * 0.92},-3 Q0,6 ${w * 0.92},-3`, fill: 'none', stroke: '#879b52', 'stroke-width': 2.6, 'stroke-linecap': 'round' }, n);
  el('path', { d: leaf(w * 0.3, 2, w * 0.3 + 9, 9, 4), fill: '#a4b86d', ...ink({ 'stroke-width': 1.8 }) }, n);
  el('circle', { cx: w * 0.3, cy: 2.2, r: 2.6, fill: '#b08560', ...ink({ 'stroke-width': 1.6 }) }, n);
}

/** An explorer's backpack: a canvas pack on the back with its flap and a rolled red blanket; two straps in front. */
function mochila(front: SVGElement, behind: SVGElement, a: Fit['back'], uid: string) {
  const s = a.side;
  const g = at(behind, { x: a.x + s * (a.w - 2), y: a.y + 4, w: a.w }, 'mochila');
  const bw = 30, bh = Math.max(34, a.h * 0.68);
  const x0 = s < 0 ? -bw + 4 : -4;
  const body = wobblyPoly([[x0, 4], [x0 + bw, 2], [x0 + bw + 1, bh], [x0 - 1, bh + 1]], { wob: 0.6, bow: 1.4, seed: 11 });
  el('path', { d: body, transform: 'translate(3 4)', fill: 'rgba(84, 62, 38, 0.2)' }, g);
  facet(g, body, '#d9b98c', '#b8966a', `${uid}-moch`, [s * -4, -3]);
  const flap = wobblyPoly([[x0 - 1, 2], [x0 + bw + 1, 0], [x0 + bw, bh * 0.42], [x0, bh * 0.45]], { wob: 0.5, bow: 1, seed: 12 });
  el('path', { d: flap, fill: '#b08560', ...ink({ 'stroke-width': 2.2 }) }, g);
  el('rect', { x: x0 + bw / 2 - 3.5, y: bh * 0.38, width: 7, height: 6, rx: 1.5, fill: '#f0d27a', ...ink({ 'stroke-width': 1.6 }) }, g);
  el('path', { d: `M${x0 + 5},${bh * 0.7} L${x0 + bw - 5},${bh * 0.7}`, stroke: INK, 'stroke-width': 1.3, opacity: 0.45 }, g);
  // the rolled blanket on top
  const roll = wobblyPoly([[x0 - 4, -8], [x0 + bw + 4, -9], [x0 + bw + 4, 3], [x0 - 4, 4]], { wob: 0.5, bow: 0.8, seed: 13 });
  el('path', { d: roll, fill: '#c9574a', ...ink({ 'stroke-width': 2.2 }) }, g);
  el('ellipse', { cx: x0 + bw + 4, cy: -2.5, rx: 3, ry: 6, fill: '#a8463b', ...ink({ 'stroke-width': 1.8 }) }, g);
  el('path', { d: `M${x0 + 6},-8 L${x0 + 5},4 M${x0 + bw - 6},-9 L${x0 + bw - 7},3`, stroke: '#8d6844', 'stroke-width': 2.4 }, g);
  // the straps over the shoulders, in front (a bird seen from the side shows one, across its chest)
  const f = at(front, { x: a.x, y: a.y, w: a.w }, 'mochila-tiras');
  const straps = a.strap === 'none' ? []
    : a.strap === 'one' ? [`M${s * (a.w - 4)},${6} Q${-s * 2},${a.h * 0.42} ${-s * (a.w * 0.45)},${a.h * 0.8}`]
      : [-1, 1].map((k) => { const x = k * (a.w - 3); return `M${x},${2} Q${x + k * 2},${a.h * 0.4} ${x - k * 1},${a.h * 0.72}`; });
  for (const d of straps) {
    el('path', { d, fill: 'none', stroke: INK, 'stroke-width': 6.4, 'stroke-linecap': 'round' }, f);
    el('path', { d, fill: 'none', stroke: '#8d6844', 'stroke-width': 3.6, 'stroke-linecap': 'round' }, f);
  }
}

/** Short rain boots: two blue boots with a cream cuff and a dark sole; their tops just over the body's lower edge. */
function botas(front: SVGElement, parts: Record<string, unknown>, fit: Fit, uid: string) {
  const parent = fit.bootsInLegs && parts.legs instanceof SVGElement ? parts.legs : front;
  const layer = el('g', { 'data-item': 'botas' }, parent);
  const k = fit.boot;
  fit.feet.forEach(([x, y], i) => {
    const g = el('g', { transform: `translate(${x} ${y}) scale(${k})` }, layer);
    const d = 'M-6.4,-13 L6.4,-13 L6.8,-6 Q11,-4.6 11,-1.2 Q11,2.2 0,2.2 Q-11,2.2 -11,-1.2 Q-11,-4.6 -6.8,-6 Z';
    facet(g, d, '#7298c1', '#5a7fa6', `${uid}-bota${i}`, [-3, -2], 2.4);
    el('path', { d: 'M-10.4,0.7 Q0,3.4 10.4,0.7', fill: 'none', stroke: '#4a3b30', 'stroke-width': 2.8, 'stroke-linecap': 'round' }, g);
    el('path', { d: wobblyPoly([[-7.8, -16], [7.8, -16], [7.6, -10.5], [-7.6, -10.5]], { wob: 0.3, bow: 0.4, seed: 21 + i }), fill: CREAM, ...ink({ 'stroke-width': 2 }) }, g);
    el('path', { d: 'M-4.5,-4.5 q3,-2.4 7,-1', fill: 'none', stroke: CREAM, 'stroke-width': 1.8, 'stroke-linecap': 'round' }, g);
  });
}

/** A duck float ring round the waist: its back half behind the body, the front half and the duck's head in front. */
function flotador(front: SVGElement, behind: SVGElement, a: Anchor, uid: string) {
  const rx = a.w + 8, ry = rx * 0.32, t = 7.5;
  const ring = `${ellipsePath(0, 0, rx, ry)} ${ellipsePath(0, 0, rx - t * 1.6, ry - t * 0.9)}`;
  const b = at(behind, a, 'flotador');
  el('path', { d: ring, fill: '#f0d27a', 'fill-rule': 'evenodd', ...ink({ 'stroke-width': 2.4 }) }, b);
  const f = at(front, a, 'flotador-frente');
  const clip = el('clipPath', { id: `${uid}-flot` }, f);
  el('rect', { x: -rx - 6, y: -1, width: rx * 2 + 12, height: ry + 12 }, clip);
  const half = el('g', { 'clip-path': `url(#${uid}-flot)` }, f);
  el('path', { d: ring, fill: '#f0d27a', 'fill-rule': 'evenodd', ...ink({ 'stroke-width': 2.4 }) }, half);
  el('path', { d: `M${-rx * 0.7},${ry * 0.55} Q0,${ry * 1.05} ${rx * 0.7},${ry * 0.55}`, fill: 'none', stroke: '#d3b25a', 'stroke-width': 3.2, 'stroke-linecap': 'round' }, half);
  el('path', { d: `M${-rx * 0.5},${ry * 0.2} Q${-rx * 0.2},${ry * 0.5} ${rx * 0.05},${ry * 0.55}`, fill: 'none', stroke: CREAM, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, half);
  // the duck's head, at the front on the right
  const d = el('g', { transform: `translate(${rx * 0.62} ${ry * 0.2})` }, f);
  el('path', { d: smoothClosed([[-6, 4], [-7, -8], [-2, -16], [6, -16], [9, -10], [5, -4], [5, 4]]), fill: '#f0d27a', ...ink({ 'stroke-width': 2.2 }) }, d);
  el('path', { d: 'M8,-12 Q16,-12 17,-9 Q14,-7 8,-8 Z', fill: '#de8a56', ...ink({ 'stroke-width': 1.8 }) }, d);
  el('circle', { cx: 3, cy: -11.5, r: 1.6, fill: INK }, d);
}

const ellipsePath = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${-rx * 2},0 Z`;

// ------------------------------------------------------------------ dressing a figure

/** The order pieces are put on (what goes on top): the back, the waist, the neck, the head, the feet. */
const ORDER: Slot[] = ['back', 'waist', 'neck', 'head', 'feet'];

/**
 * Dresses a character's figure: `body` is the figure's body group (the
 * character's own drawing, then its eyes and mouth), `parts` what its build
 * returned. Pieces behind the body go first in the group, the rest last.
 * Returns the two layers (undressing is building the figure again).
 */
export function dress(def: CharacterDef, body: SVGGElement, parts: Record<string, unknown>, outfit: Outfit | undefined, uid: string) {
  const fit = FITS[def.id];
  const behind = el('g', { class: 'outfit-behind' });
  body.insertBefore(behind, body.firstChild);
  const front = el('g', { class: 'outfit-front' }, body);
  if (!outfit) return { behind, front };
  const worn = (s: Slot) => outfit[s];
  for (const slot of ORDER) {
    const id = worn(slot);
    if (!id) continue;
    DRAW[id](front, behind, fit, uid, body, parts);
  }
  return { behind, front };
}

type Draw = (front: SVGElement, behind: SVGElement, fit: Fit, uid: string, body: SVGGElement, parts: Record<string, unknown>) => void;
const DRAW: Record<ItemId, Draw> = {
  hongo: (f, _b, fit, uid) => hongo(f, fit.head, uid),
  corona: (f, b, fit) => corona(f, b, fit.crown ?? fit.head),
  bufanda: (f, _b, fit, uid) => bufanda(f, fit.neck, uid),
  capa: (f, b, fit, uid) => capa(f, b, fit.back, fit.neck, uid),
  mochila: (f, b, fit, uid) => mochila(f, b, fit.back, uid),
  botas: (f, _b, fit, uid, _body, parts) => botas(f, parts, fit, uid),
  flotador: (f, b, fit, uid) => flotador(f, b, fit.waist, uid),
};

/** How the pieces sit alone on their hooks in the wardrobe (a 80 × 80 drawing centred on 0). */
const ICON: Fit = {
  head: { x: 0, y: 16, w: 29, rot: -6 },
  crown: { x: 0, y: 4, w: 30 },
  neck: { x: -5, y: -18, w: 26 },
  back: { x: 0, y: -32, w: 17, h: 62, side: -1, strap: 'none' },
  waist: { x: -3, y: 8, w: 24 },
  feet: [[-15, 22], [15, 22]], boot: 1.75,
};
/** The back's pieces sit a little to the right on their hook (the pack hangs from its side). */
const ICON_BACK: Record<string, Partial<Fit['back']>> = { mochila: { x: 20, y: -26, h: 66 }, capa: {} };

/** A piece alone, drawn into `svg` (viewBox −40 −40 80 80): the wardrobe's hooks, what unlocks next. */
export function drawItemIcon(svg: SVGSVGElement, id: ItemId, uid: string) {
  svg.textContent = '';
  const behind = el('g', {}, svg);
  const front = el('g', {}, svg);
  const fit: Fit = { ...ICON, back: { ...ICON.back, ...(ICON_BACK[id] ?? {}) } };
  const neck = id === 'capa' ? { x: 0, y: -30, w: 16 } : fit.neck;
  DRAW[id](front, behind, { ...fit, neck }, uid, front, {});
}

/** The outfit as a word list for the DOM (`data-outfit`), in slot order. */
export const outfitWords = (o: Outfit | undefined) => (o ? ORDER.map((s) => o[s]).filter(Boolean).join(' ') : '');
