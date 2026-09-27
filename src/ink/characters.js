// The four mascots. Each one is a few imperfect shapes plus a personality:
// the same verbs (step, bump, celebrate...) performed in its own way.
// Local coordinates: feet at (0,0), up is negative y.

import { el, rng, blob, wobblyPoly, wobblyLine, leaf, smoothOpen, smoothClosed } from './ink.js';
import { E, spring } from './anim.js';

export const INK = '#2b2622';
const CREAM = '#fbf6ea';
const SW = 3; // outline weight shared by every character

const ink = (extra = {}) => ({ stroke: INK, 'stroke-width': SW, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...extra });

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rad = (d) => (d * Math.PI) / 180;

// ---------------------------------------------------------------- Brote
const brote = {
  id: 'brote',
  name: 'Brote',
  color: '#de8a56',
  eyes: [
    { x: -11, y: -39, rx: 6, ry: 7.2, pr: 3.1 },
    { x: 11, y: -39, rx: 6, ry: 7.2, pr: 3.1 },
  ],
  mouth: { x: 0, y: -26, w: 10 },
  top: -104,
  head: -70,
  pivot: -34,
  breathe: { period: 1.7, amp: 0.028 },
  defaults: { sprout: 0, leafNew: 1, leaves: 0 },
  build(g, uid) {
    const p = {};
    // sprout first so the body hides its root
    p.sprout = el('g', {}, g);
    el('path', { d: 'M0,5 C-4,-9 5,-17 1,-30', fill: 'none', ...ink({ 'stroke-width': 3 }) }, p.sprout);
    p.extra = [
      { x: 0, y: -14, a: -160, len: 17 },
      { x: 2.5, y: -21, a: -24, len: 16 },
      { x: 0.5, y: -6, a: -18, len: 14 },
    ].map((L) => {
      const outer = el('g', { transform: `translate(${L.x} ${L.y}) rotate(${L.a})` }, p.sprout);
      const inner = el('g', {}, outer);
      el('path', { d: leaf(0, 0, L.len, 0, 6.2), fill: '#b7c77f', ...ink({ 'stroke-width': 2.3 }) }, inner);
      return inner;
    });
    el('path', { d: leaf(1, -29, -19, -40, 8), fill: '#a4b86d', ...ink({ 'stroke-width': 2.6 }) }, p.sprout);
    el('path', { d: leaf(1, -29, 21, -38, 8), fill: '#a4b86d', ...ink({ 'stroke-width': 2.6 }) }, p.sprout);
    el('path', { d: 'M-3,-32 Q-9,-36 -14,-37', fill: 'none', stroke: INK, 'stroke-width': 1.3, opacity: 0.5 }, p.sprout);
    el('path', { d: 'M5,-31 Q11,-34 16,-35', fill: 'none', stroke: INK, 'stroke-width': 1.3, opacity: 0.5 }, p.sprout);
    p.flower = el('g', { transform: 'translate(1 -31)' }, p.sprout);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      el('circle', { cx: Math.cos(a) * 5, cy: Math.sin(a) * 5 - 3, r: 3.8, fill: '#e7a3a0', ...ink({ 'stroke-width': 1.6 }) }, p.flower);
    }
    el('circle', { cx: 0, cy: -3, r: 2.6, fill: '#f0d27a', ...ink({ 'stroke-width': 1.4 }) }, p.flower);

    // feet
    el('path', { d: blob(-12, -3, 8.5, 5.5, { seed: 3, n: 8 }), fill: '#c9733f', ...ink() }, g);
    el('path', { d: blob(12, -3, 8.5, 5.5, { seed: 4, n: 8 }), fill: '#c9733f', ...ink() }, g);

    // a seed: an egg that is wider at the bottom
    const egg = (cx, cy, rx, ry, seed) => {
      const R = rng(seed);
      const pts = [];
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        const k = 1 + (R() * 2 - 1) * 0.014;
        pts.push([cx + Math.cos(a) * rx * (1 + 0.13 * Math.sin(a)) * k, cy + Math.sin(a) * ry * k]);
      }
      return smoothClosed(pts);
    };
    const body = egg(0, -34, 29, 34, 21);
    const clip = el('clipPath', { id: `${uid}-body` }, g);
    el('path', { d: body }, clip);
    const fill = el('g', { 'clip-path': `url(#${uid}-body)` }, g);
    el('rect', { x: -40, y: -80, width: 80, height: 90, fill: '#c9733f' }, fill);
    el('path', { d: egg(-5, -37, 29, 34, 22), fill: '#de8a56' }, fill);
    // the seed's seam
    el('path', { d: 'M9,-8 Q21,-15 22,-31', fill: 'none', stroke: '#b8653a', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, fill);
    el('path', { d: body, fill: 'none', ...ink() }, g);
    // cheeks
    el('ellipse', { cx: -19, cy: -27, rx: 5, ry: 3, fill: '#eaa19b' }, g);
    el('ellipse', { cx: 19, cy: -27, rx: 5, ry: 3, fill: '#eaa19b' }, g);
    p.st = { a: 0, va: 0, s: 1, vs: 0 };
    return p;
  },
  render(r, p, st) {
    // follow-through: the sprout lags behind body motion like a spring
    const target = clamp(-st.vx * 0.09, -38, 38) + r.sprout - r.lean * 0.6;
    [p.st.a, p.st.va] = spring(p.st.a, p.st.va, target, 180, 9, st.dt);
    [p.st.s, p.st.vs] = spring(p.st.s, p.st.vs, 1 + clamp(st.ay * 0.00008, -0.35, 0.35), 260, 10, st.dt);
    p.sprout.setAttribute('transform', `translate(0 -66) rotate(${p.st.a.toFixed(2)}) scale(1 ${p.st.s.toFixed(3)})`);
    p.extra.forEach((leafG, i) => {
      let k = i < r.leaves ? 1 : 0;
      if (i === r.leaves - 1) k = r.leafNew;
      leafG.setAttribute('transform', `scale(${Math.max(0.001, k).toFixed(3)})`);
    });
    const fk = r.leaves > 3 ? (r.leaves === 4 ? r.leafNew : 1) : 0;
    p.flower.setAttribute('transform', `translate(1 -31) scale(${Math.max(0.001, fk).toFixed(3)})`);
  },
  m: {
    async step(A, to, d) {
      const r = A.rig;
      await A.T({ sy: 0.8, sx: 1.16, lean: -5 * d.dx }, 95, E.out);
      A.T({ x: to.x, y: to.y }, 300, E.inOut);
      A.T({ lean: 8 * d.dx }, 150, E.out);
      await A.T({ sy: 1.17, sx: 0.88, hop: -26 }, 150, E.out);
      await A.T({ sy: 1.02, sx: 0.98, hop: 0 }, 150, E.in);
      await A.T({ sy: 0.8, sx: 1.18, lean: 0 }, 70, E.out);
      await A.T({ sy: 1.07, sx: 0.95 }, 110, E.out);
      await A.T({ sy: 1, sx: 1 }, 110, E.inOut);
      r.hop = 0;
    },
    async bump(A, hit, d) {
      const r = A.rig;
      const home = { x: r.x, y: r.y };
      await A.T({ sy: 0.82, sx: 1.14 }, 90, E.out);
      A.T({ x: r.x + (hit.x - r.x) * 0.36, y: r.y + (hit.y - r.y) * 0.36 }, 170, E.in);
      await A.T({ hop: -14, sy: 1.12, sx: 0.9 }, 170, E.out);
      A.mark();
      // splat against the obstacle
      await A.T(d.dx ? { sx: 0.72, sy: 1.18, lean: -10 * d.dx } : { sy: 0.74, sx: 1.2 }, 60, E.out);
      A.bubble('¡Ay!');
      A.T({ x: home.x, y: home.y }, 330, E.out);
      await A.T({ hop: -18, sx: 1, sy: 1, lean: -14 * (d.dx || 1) }, 160, E.out);
      await A.T({ hop: 0 }, 170, E.in);
      await A.T({ sy: 0.82, sx: 1.16, lean: 0 }, 70, E.out);
      await A.T({ sy: 1, sx: 1 }, 160, E.back);
      A.dizzy(true);
      r.sprout = 40;
      await A.P(1500, (p, ms) => { r.lean = Math.sin(ms / 170) * 7 * (1 - p); });
      A.dizzy(false);
      r.sprout = 0;
    },
    async celebrate(A) {
      const r = A.rig;
      r.eyes = 'happy'; r.mouth = 'grin';
      for (let i = 0; i < 3; i++) {
        await A.T({ sy: 0.76, sx: 1.2 }, 90, E.out);
        await A.T({ sy: 1.2, sx: 0.86, hop: -40 + i * 6 }, 190, E.out);
        if (i === 1) {
          // grow a new leaf at the top of the jump: progress you can see
          r.leaves += 1; r.leafNew = 0;
          A.T({ leafNew: 1 }, 520, E.back);
        }
        await A.T({ sy: 1, sx: 1, hop: 0 }, 190, E.in);
        await A.T({ sy: 0.8, sx: 1.18 }, 70, E.out);
      }
      await A.T({ sy: 1, sx: 1 }, 220, E.back);
      await A.wait(500);
      r.mouth = 'smile';
    },
    async tap(A) {
      const r = A.rig;
      r.eyes = 'happy'; r.mouth = 'grin';
      A.bubble('¡Ji, ji!');
      await A.T({ sy: 0.78, sx: 1.2 }, 80, E.out);
      await A.T({ sy: 1.1, sx: 0.93 }, 120, E.out);
      await A.P(520, (p, ms) => {
        r.lean = Math.sin(ms / 32) * 6 * (1 - p);
        r.sy = 1 + Math.sin(ms / 45) * 0.05 * (1 - p);
      });
      await A.T({ sx: 1, sy: 1, lean: 0 }, 120);
      r.eyes = 'open'; r.mouth = 'smile';
    },
    async nod(A) {
      await A.T({ sy: 0.9, sx: 1.06 }, 90, E.out);
      await A.T({ sy: 1.04, sx: 0.98 }, 120, E.out);
      await A.T({ sy: 1, sx: 1 }, 120);
    },
    async sleep(A) {
      const r = A.rig;
      r.mouth = 'yawn'; r.eyes = 'closed';
      await A.T({ sy: 1.14, sx: 0.92, sprout: -12 }, 700, E.inOut);
      await A.wait(350);
      r.mouth = 'o';
      await A.T({ sy: 0.9, sx: 1.08, sprout: 38 }, 900, E.inOut);
    },
    async fidget(A) {
      const r = A.rig;
      A.lookAt(-1, 0.1, 700);
      r.sprout = 18;
      await A.wait(700);
      A.lookAt(1, 0.1, 700);
      r.sprout = -18;
      await A.wait(700);
      r.sprout = 0;
      await this.nod(A);
    },
  },
};

// ---------------------------------------------------------------- Mina
const mina = {
  id: 'mina',
  name: 'Mina',
  color: '#ecc35d',
  eyes: [
    { x: -7, y: -49, rx: 5, ry: 6.2, pr: 2.6 },
    { x: 7, y: -49, rx: 5, ry: 6.2, pr: 2.6 },
  ],
  mouth: { x: 0, y: -37.5, w: 7.5 },
  top: -88,
  head: -88,
  pivot: -40,
  breathe: { period: 1.15, amp: 0.016 },
  defaults: { armL: 12, armR: 12, bendL: 22, bendR: 22 },
  trail: { kind: 'pencil' },
  build(g, uid) {
    const p = {};
    p.armL = el('path', { fill: 'none', ...ink({ 'stroke-width': 2.4 }) }, g);
    p.armR = el('path', { fill: 'none', ...ink({ 'stroke-width': 2.4 }) }, g);
    p.handL = el('circle', { r: 2.6, fill: INK }, g);
    p.handR = el('circle', { r: 2.6, fill: INK }, g);
    el('path', { d: wobblyPoly([[0, 0.5], [-5.5, -10], [5.5, -10]], { wob: 0.5, bow: 0.4, seed: 5 }), fill: '#4a474d', ...ink({ 'stroke-width': 2.4 }) }, g);
    el('path', { d: wobblyPoly([[-5.5, -10], [-15.5, -27], [15.5, -27], [5.5, -10]], { wob: 0.6, bow: 0.8, seed: 6 }), fill: '#efd2a6', ...ink() }, g);
    // painted body with the scalloped edge where the sharpener cut the paint
    let d = 'M-16,-27';
    const sc = 6;
    for (let i = 0; i < sc; i++) d += `q${(32 / sc / 2).toFixed(2)},${i % 2 ? 4.2 : 5} ${(32 / sc).toFixed(2)},0`;
    d += 'L16.5,-62L-16.5,-62Z';
    const clip = el('clipPath', { id: `${uid}-body` }, g);
    el('path', { d }, clip);
    const fill = el('g', { 'clip-path': `url(#${uid}-body)` }, g);
    el('rect', { x: -20, y: -70, width: 40, height: 50, fill: '#ecc35d' }, fill);
    el('rect', { x: 6.5, y: -70, width: 14, height: 50, fill: '#d5a646' }, fill);
    el('path', { d: wobblyLine(-5.5, -61, -5.5, -29, { bow: 0.6, seed: 7 }), stroke: INK, 'stroke-width': 1.3, opacity: 0.45, fill: 'none' }, fill);
    el('path', { d: wobblyLine(6.5, -61, 6.5, -30, { bow: 0.6, seed: 8 }), stroke: INK, 'stroke-width': 1.3, opacity: 0.45, fill: 'none' }, fill);
    el('path', { d, fill: 'none', ...ink() }, g);
    el('path', { d: wobblyPoly([[-17, -62], [17, -62], [17, -71.5], [-17, -71.5]], { wob: 0.4, bow: 0.5, seed: 9 }), fill: '#b5bfc2', ...ink() }, g);
    el('path', { d: 'M-16,-66.8 L16,-66.8', stroke: INK, 'stroke-width': 1.4, opacity: 0.55 }, g);
    p.eraser = el('path', { d: 'M-15,-71 L-15,-79 Q-15.5,-86 -8,-85.5 L8,-86 Q15.5,-85.5 15,-79 L15,-71 Z', fill: '#e7a3a0', ...ink() }, g);
    p.st = { ta: 0, tv: 0 };
    return p;
  },
  render(r, p, st) {
    const arm = (sx, a, bend) => {
      const s = [sx * 15.5, -42];
      const e = [s[0] + sx * Math.sin(rad(a)) * 10, s[1] + Math.cos(rad(a)) * 10];
      const h = [e[0] + sx * Math.sin(rad(a + bend)) * 9, e[1] + Math.cos(rad(a + bend)) * 9];
      return { d: `M${s[0]},${s[1]} Q${e[0].toFixed(1)},${e[1].toFixed(1)} ${h[0].toFixed(1)},${h[1].toFixed(1)}`, h };
    };
    // arms swing with a little lag behind horizontal speed
    [p.st.ta, p.st.tv] = spring(p.st.ta, p.st.tv, clamp(Math.abs(st.vx) * 0.08, 0, 30), 120, 10, st.dt);
    const L = arm(-1, r.armL + p.st.ta, r.bendL);
    const R = arm(1, r.armR - p.st.ta * 0.4, r.bendR);
    p.armL.setAttribute('d', L.d);
    p.armR.setAttribute('d', R.d);
    p.handL.setAttribute('cx', L.h[0].toFixed(1)); p.handL.setAttribute('cy', L.h[1].toFixed(1));
    p.handR.setAttribute('cx', R.h[0].toFixed(1)); p.handR.setAttribute('cy', R.h[1].toFixed(1));
  },
  m: {
    async step(A, to, d) {
      // three quick tippy-toe hops per cell; the tip only draws while touching paper
      const r = A.rig;
      const from = { x: r.x, y: r.y };
      await A.T({ lean: 11 * d.dx, sy: 0.92, armL: 40, armR: 40 }, 90, E.out);
      const hops = 3;
      for (let i = 1; i <= hops; i++) {
        const k = i / hops;
        A.T({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }, 150, E.inOut);
        A.T({ armL: i % 2 ? 55 : 20, armR: i % 2 ? 20 : 55 }, 150, E.inOut);
        await A.T({ hop: -8, sy: 1.08 }, 70, E.out);
        await A.T({ hop: 0, sy: 0.94 }, 80, E.in);
      }
      await A.T({ lean: -3 * d.dx, sy: 1.03, armL: 12, armR: 12 }, 90, E.out);
      await A.T({ lean: 0, sy: 1 }, 110, E.inOut);
    },
    async bump(A, hit, d) {
      const r = A.rig;
      const home = { x: r.x, y: r.y };
      await A.T({ lean: 12 * d.dx, sy: 0.92 }, 80, E.out);
      await A.T({ x: r.x + (hit.x - r.x) * 0.3, y: r.y + (hit.y - r.y) * 0.3, hop: -6 }, 150, E.in);
      A.mark();
      A.bubble('¡Ay!');
      r.hop = 0; r.armL = 80; r.armR = 80; r.eyes = 'dizzy'; r.mouth = 'wavy';
      // stiff like a twanged ruler: fast, decaying vibration around the tip
      const base = -8 * (d.dx || 1);
      await A.P(650, (p, ms) => { r.lean = base + Math.sin(ms / 22) * 20 * Math.pow(1 - p, 1.6); });
      r.lean = 0;
      await A.T({ x: home.x, y: home.y, armL: 12, armR: 12 }, 260, E.inOut);
      A.dizzy(true);
      await A.P(1300, (p, ms) => { r.lean = Math.sin(ms / 110) * 5 * (1 - p); });
      A.dizzy(false);
    },
    async celebrate(A) {
      const r = A.rig;
      r.eyes = 'happy'; r.mouth = 'grin';
      const c = { x: r.x, y: r.y };
      // draw a victory loop on the paper with the tip
      await A.T({ armL: 150, armR: 150, bendL: -10, bendR: -10 }, 160, E.back);
      await A.P(900, (p) => {
        const a = p * Math.PI * 2 * 1.1 - Math.PI / 2;
        r.x = c.x + Math.cos(a) * 20;
        r.y = c.y + 6 + Math.sin(a) * 9;
        r.lean = Math.cos(a) * -10;
        r.face = Math.sin(a) >= 0 ? 1 : -1;
      });
      await A.T({ x: c.x, y: c.y, lean: 0 }, 160, E.out);
      for (let i = 0; i < 2; i++) {
        await A.T({ sy: 0.86 }, 70, E.out);
        await A.T({ hop: -22, sy: 1.12, face: i % 2 ? 1 : -1 }, 170, E.out);
        await A.T({ hop: 0, sy: 1 }, 160, E.in);
      }
      await A.T({ sy: 0.9 }, 60, E.out);
      await A.T({ sy: 1, armL: 12, armR: 12, bendL: 22, bendR: 22, face: 1 }, 200, E.back);
      await A.wait(400);
      r.mouth = 'smile';
    },
    async tap(A) {
      const r = A.rig;
      r.eyes = 'happy'; r.mouth = 'grin';
      A.bubble('¡Ji, ji!');
      await A.T({ sy: 0.86, armL: 120, armR: 120 }, 70, E.out);
      await A.P(560, (p, ms) => {
        r.lean = Math.sin(ms / 28) * 7 * (1 - p);
        r.armL = 120 + Math.sin(ms / 40) * 30;
        r.armR = 120 - Math.sin(ms / 40) * 30;
        r.sy = 1 + Math.abs(Math.sin(ms / 60)) * 0.06;
      });
      await A.T({ lean: 0, sy: 1, armL: 12, armR: 12 }, 160, E.inOut);
      r.eyes = 'open'; r.mouth = 'smile';
    },
    async nod(A) {
      await A.T({ hop: -5, sy: 1.05, armR: 60 }, 70, E.out);
      await A.T({ hop: 0, sy: 0.93 }, 70, E.in);
      await A.T({ sy: 1, armR: 12 }, 120, E.out);
    },
    async sleep(A) {
      const r = A.rig;
      r.mouth = 'yawn'; r.eyes = 'closed';
      await A.T({ sy: 1.12, armL: 160, armR: 160, bendL: -20, bendR: -20 }, 650, E.inOut);
      await A.wait(300);
      r.mouth = 'o';
      await A.T({ sy: 1, lean: -16, armL: 4, armR: 4, bendL: 8, bendR: 8 }, 1100, E.inOut);
    },
    async fidget(A) {
      const r = A.rig;
      // fussy: tap-tap, then a tiny twirl to check everything is in order
      for (let i = 0; i < 2; i++) {
        await A.T({ hop: -4 }, 60, E.out);
        await A.T({ hop: 0 }, 60, E.in);
      }
      await A.T({ face: -r.face }, 160, E.inOut);
      await A.wait(250);
      await A.T({ face: -r.face }, 160, E.inOut);
    },
  },
};

// ---------------------------------------------------------------- Pliegue
const pliegue = {
  id: 'pliegue',
  name: 'Pliegue',
  color: '#7298c1',
  eyes: [
    { x: -6, y: -54, rx: 5.6, ry: 6.8, pr: 2.9 },
    { x: 9, y: -55, rx: 5.6, ry: 6.8, pr: 2.9 },
  ],
  mouth: null,
  top: -90,
  head: -90,
  pivot: -46,
  breathe: { period: 2.3, amp: 0.02 },
  defaults: { wing: 0, beak: 0, tail: 0, crumple: 0, legs: 1 },
  build(g, uid) {
    const p = {};
    p.legs = el('g', {}, g);
    el('path', { d: 'M-6,-18 L-7,-1 M-13,0.5 L-7,-1 L-2,0.5 M6,-18 L7,-1 M2,0.5 L7,-1 L12,0.5', fill: 'none', ...ink({ 'stroke-width': 2.4 }) }, p.legs);
    p.tail = el('g', {}, g);
    el('path', { d: wobblyPoly([[-20, -26], [-47, -50], [-40, -22]], { wob: 0.5, bow: 0.8, seed: 31 }), fill: '#58799f', ...ink() }, p.tail);
    el('path', { d: 'M-22,-25 L-43,-45', stroke: INK, 'stroke-width': 1.3, opacity: 0.45 }, p.tail);
    // body: one folded triangle of paper, light facet and dark facet split by the crease
    const body = wobblyPoly([[-31, -21], [3, -88], [31, -23], [15, -16], [-15, -16]], { wob: 0.6, bow: 1.3, seed: 32 });
    const clip = el('clipPath', { id: `${uid}-body` }, g);
    el('path', { d: body }, clip);
    const fill = el('g', { 'clip-path': `url(#${uid}-body)` }, g);
    el('rect', { x: -40, y: -95, width: 80, height: 85, fill: '#7ea2c9' }, fill);
    el('path', { d: 'M3,-92 L40,-24 L40,-10 L1,-10 Z', fill: '#5f84ad' }, fill);
    el('path', { d: wobblyLine(3, -86, 1, -17, { bow: 0.8, seed: 33, segs: 2 }), stroke: INK, 'stroke-width': 1.5, opacity: 0.5, fill: 'none' }, fill);
    p.crumple = el('path', { d: 'M-22,-26 L-12,-32 L-15,-22 L-4,-27 M12,-40 L20,-33 L15,-27 M-8,-72 L-2,-66 L-5,-60 M18,-60 L22,-54', stroke: INK, 'stroke-width': 1.5, fill: 'none', opacity: 0 }, fill);
    el('path', { d: body, fill: 'none', ...ink() }, g);
    p.beakLow = el('path', { d: wobblyPoly([[17, -47], [30, -45], [18, -41]], { wob: 0.3, bow: 0.3, seed: 36 }), fill: '#d9ae52', ...ink({ 'stroke-width': 2.3 }), opacity: 0 }, g);
    p.beak = el('g', {}, g);
    el('path', { d: wobblyPoly([[16, -54], [33, -47.5], [17, -43]], { wob: 0.3, bow: 0.4, seed: 35 }), fill: '#efcd70', ...ink({ 'stroke-width': 2.5 }) }, p.beak);
    // wing: a small folded flap
    p.wing = el('g', {}, g);
    el('path', { d: wobblyPoly([[-8, -43], [-30, -27], [-3, -25]], { wob: 0.4, bow: 0.8, seed: 37 }), fill: '#9dbad8', ...ink({ 'stroke-width': 2.7 }) }, p.wing);
    el('path', { d: 'M-8,-42 L-14,-26', stroke: INK, 'stroke-width': 1.3, opacity: 0.45 }, p.wing);
    p.st = { t: 0, tv: 0 };
    return p;
  },
  render(r, p, st) {
    [p.st.t, p.st.tv] = spring(p.st.t, p.st.tv, clamp(st.ay * -0.0006, -18, 18) + r.tail, 150, 7, st.dt);
    p.tail.setAttribute('transform', `rotate(${p.st.t.toFixed(2)} -24 -24)`);
    p.wing.setAttribute('transform', `rotate(${(-r.wing).toFixed(2)} -7 -41)`);
    p.crumple.setAttribute('opacity', (r.crumple * 0.8).toFixed(2));
    p.beak.setAttribute('transform', `rotate(${(-r.beak * 10).toFixed(2)} 17 -50)`);
    p.beakLow.setAttribute('opacity', r.beak > 0.2 ? 1 : 0);
    p.beakLow.setAttribute('transform', `rotate(${(r.beak * 8).toFixed(2)} 17 -45)`);
    p.legs.setAttribute('transform', `translate(0 ${(-18 * (1 - r.legs)).toFixed(2)}) scale(1 ${r.legs.toFixed(3)})`);
  },
  m: {
    async step(A, to, d) {
      // big crouch, a floaty hop with hang time, soft landing: light and a bit proud
      const r = A.rig;
      await A.T({ sy: 0.76, sx: 1.12, lean: -6 * d.dx, wing: -10, tail: 12 }, 140, E.out);
      A.T({ x: to.x, y: to.y }, 520, E.inOut);
      A.T({ wing: 70 }, 130, E.out).then(() => A.T({ wing: -5 }, 170, E.inOut)).then(() => A.T({ wing: 55 }, 140, E.out)).then(() => A.T({ wing: 0 }, 120, E.in)).catch(() => {});
      await A.T({ sy: 1.16, sx: 0.9, hop: -44, lean: 5 * d.dx, legs: 0.8, tail: 0 }, 260, E.out3);
      await A.T({ hop: -48, sy: 1.04, sx: 0.98 }, 90, E.inOut);
      await A.T({ hop: 0, sy: 1.05, lean: 0 }, 170, E.in);
      await A.T({ sy: 0.88, sx: 1.08, legs: 1 }, 70, E.out);
      await A.T({ sy: 1, sx: 1 }, 160, E.back);
    },
    async bump(A, hit, d) {
      const r = A.rig;
      const home = { x: r.x, y: r.y };
      await A.T({ sy: 0.78, sx: 1.12 }, 120, E.out);
      A.T({ wing: 60 }, 120, E.out);
      await A.T({ x: r.x + (hit.x - r.x) * 0.38, y: r.y + (hit.y - r.y) * 0.38, hop: -22, sy: 1.12, sx: 0.9 }, 190, E.out);
      A.mark();
      A.bubble('¡Ay!');
      // crumples like a ball of paper, then unfolds
      r.eyes = 'dizzy';
      await A.T(d.dx ? { sx: 0.66, sy: 0.9, crumple: 1, wing: -10, lean: -14 * d.dx } : { sx: 1.1, sy: 0.7, crumple: 1, wing: -10 }, 70, E.out);
      A.T({ x: home.x, y: home.y }, 320, E.out);
      await A.T({ hop: 0, lean: 0 }, 320, E.in);
      await A.T({ sy: 0.72, sx: 1.2 }, 70, E.out);
      A.dizzy(true);
      await A.P(520, (p, ms) => { r.sx = 1.2 - p * 0.2 + Math.sin(ms / 25) * 0.04 * (1 - p); r.sy = 0.72 + p * 0.28; });
      await A.T({ crumple: 0 }, 400);
      await A.P(900, (p, ms) => { r.lean = Math.sin(ms / 140) * 6 * (1 - p); });
      A.dizzy(false);
    },
    async celebrate(A) {
      const r = A.rig;
      r.eyes = 'happy';
      r.beak = 1;
      await A.T({ sy: 0.72, sx: 1.16, wing: -10 }, 160, E.out);
      A.T({ wing: 80 }, 120, E.out);
      await A.T({ hop: -70, sy: 1.2, sx: 0.88, legs: 0.7 }, 280, E.out3);
      // a full somersault at the top
      await A.T({ spin: 360 * r.face, wing: 10 }, 380, E.inOut);
      r.spin = 0;
      A.T({ wing: 70 }, 110, E.out);
      await A.T({ hop: 0, sy: 1.05, sx: 1, legs: 1 }, 260, E.in);
      await A.T({ sy: 0.84, sx: 1.1, wing: 0 }, 70, E.out);
      await A.T({ sy: 1, sx: 1 }, 180, E.back);
      await A.P(700, (p, ms) => { r.wing = Math.abs(Math.sin(ms / 60)) * 70; });
      r.wing = 0;
      await A.wait(300);
      r.beak = 0;
    },
    async tap(A) {
      const r = A.rig;
      r.eyes = 'happy'; r.beak = 1;
      A.bubble('¡Pío!');
      await A.T({ sy: 0.86, sx: 1.08 }, 70, E.out);
      await A.P(600, (p, ms) => {
        r.wing = Math.abs(Math.sin(ms / 45)) * 75 * (1 - p * 0.6);
        r.sx = 1 + Math.sin(ms / 20) * 0.03;
        r.sy = 1.02;
      });
      await A.T({ wing: 0, sx: 1, sy: 1 }, 160);
      r.eyes = 'open'; r.beak = 0;
    },
    async nod(A) {
      const r = A.rig;
      const dir = r.face || 1;
      await A.T({ spin: 9 * dir }, 90, E.out);
      await A.T({ spin: -3 * dir }, 110, E.inOut);
      await A.T({ spin: 0 }, 110, E.out);
    },
    async sleep(A) {
      const r = A.rig;
      r.beak = 1; r.eyes = 'closed';
      await A.T({ sy: 1.12, wing: 40 }, 650, E.inOut);
      await A.wait(250);
      r.beak = 0;
      await A.T({ sy: 0.88, sx: 1.06, spin: 10 * (r.face || 1), wing: -6, legs: 0.6 }, 1100, E.inOut);
    },
    async fidget(A) {
      const r = A.rig;
      // a curious bird tilt, then a quick preen
      await A.T({ spin: -12 * (r.face || 1) }, 140, E.out);
      await A.wait(600);
      await A.T({ spin: 0 }, 140, E.out);
      await A.T({ wing: 40 }, 90, E.out);
      await A.T({ wing: 0 }, 150, E.back);
    },
  },
};

// ---------------------------------------------------------------- Ovillo
const ovillo = {
  id: 'ovillo',
  name: 'Ovillo',
  color: '#d2685f',
  eyes: [
    { x: -10, y: -37, rx: 6, ry: 7.2, pr: 3.1 },
    { x: 10, y: -37, rx: 6, ry: 7.2, pr: 3.1 },
  ],
  mouth: { x: 0, y: -24.5, w: 9 },
  top: -84,
  head: -66,
  pivot: -32,
  breathe: { period: 3.2, amp: 0.032 },
  defaults: { roll: 0, size: 1, needle: 0 },
  trail: { kind: 'yarn' },
  build(g, uid) {
    const p = {};
    p.tail = el('path', { fill: 'none', stroke: '#b9524a', 'stroke-width': 2.6, 'stroke-linecap': 'round' }, g);
    p.needle = el('g', {}, g);
    el('path', { d: 'M4,-40 L27,-78', ...ink({ 'stroke-width': 6.4 }) }, p.needle);
    el('path', { d: 'M4,-40 L27,-78', stroke: '#7298c1', 'stroke-width': 3, 'stroke-linecap': 'round' }, p.needle);
    el('circle', { cx: 28, cy: -80, r: 4.6, fill: '#efcd70', ...ink({ 'stroke-width': 2.4 }) }, p.needle);
    const ball = blob(0, -32, 31, 31, { wob: 0.03, n: 11, seed: 41 });
    const clip = el('clipPath', { id: `${uid}-ball` }, g);
    el('path', { d: ball }, clip);
    const fill = el('g', { 'clip-path': `url(#${uid}-ball)` }, g);
    el('rect', { x: -40, y: -70, width: 80, height: 80, fill: '#d2685f' }, fill);
    p.strands = el('g', {}, fill);
    // wound yarn: bands of parallel strands, each band curving around the ball
    const band = (rot, n, spread, bend, color, w) => {
      const b = el('g', { transform: `rotate(${rot})` }, p.strands);
      for (let i = 0; i < n; i++) {
        const y = -spread / 2 + (i * spread) / (n - 1);
        const k = Math.sqrt(Math.max(0, 1 - Math.pow(y / 33, 2))) * 34;
        el('path', { d: `M${-k},${y} Q0,${y + bend * (1 - Math.abs(y) / 40)} ${k},${y}`, stroke: color, 'stroke-width': w, fill: 'none', 'stroke-linecap': 'round' }, b);
      }
      return b;
    };
    band(20, 7, 50, 14, '#a9483f', 2.2);
    const side = el('g', { 'clip-path': `url(#${uid}-half)` }, p.strands);
    const half = el('clipPath', { id: `${uid}-half` }, g);
    el('path', { d: 'M4,-40 C20,-30 26,0 8,40 L40,40 L40,-40 Z' }, half);
    const b2 = band(-62, 5, 30, -12, '#a9483f', 2.2);
    const b3 = band(-62, 5, 30, -12, '#ec9d92', 1.4);
    b3.setAttribute('transform', 'rotate(-62) translate(0 -3)');
    side.append(b2, b3);
    el('path', { d: 'M5,-40 C21,-30 27,0 9,40', stroke: INK, 'stroke-width': 1.3, fill: 'none', opacity: 0.35 }, side);
    el('path', { d: ball, fill: 'none', ...ink() }, g);
    el('ellipse', { cx: -20, cy: -27, rx: 5, ry: 3, fill: '#eea59a' }, g);
    el('ellipse', { cx: 20, cy: -27, rx: 5, ry: 3, fill: '#eea59a' }, g);
    p.st = { n: 0, nv: 0, w: 0 };
    return p;
  },
  render(r, p, st) {
    p.strands.setAttribute('transform', `translate(0 -32) rotate(${r.roll.toFixed(1)})`);
    [p.st.n, p.st.nv] = spring(p.st.n, p.st.nv, clamp(-st.vx * 0.06, -25, 25) + r.needle, 90, 5, st.dt);
    p.needle.setAttribute('transform', `rotate(${p.st.n.toFixed(2)} 6 -44)`);
    // loose thread end wags behind; hidden while the real thread trails on the paper
    p.st.w += st.dt;
    const w = Math.sin(p.st.w * 2.2) * 3 + clamp(st.vx * 0.03, -8, 8);
    p.tail.setAttribute('d', r.threaded ? '' : smoothOpen([[-22, -9], [-32, -4 + w * 0.3], [-40, -1], [-47, -5 - w], [-44, -10]]));
  },
  m: {
    async step(A, to, d) {
      // heavy: slow to start, rolls, overshoots a little and wobbles to a stop
      const r = A.rig;
      const dist = Math.hypot(to.x - r.x, to.y - r.y);
      const sign = d.dx ? d.dx : d.dy;
      A.T({ roll: r.roll + (dist / 31) * (180 / Math.PI) * sign }, 640, E.softBack);
      await A.T({ sx: 1.07, sy: 0.94, lean: 4 * d.dx }, 160, E.inOut);
      A.T({ x: to.x, y: to.y }, 480, E.softBack);
      await A.T({ sx: 1.02, sy: 0.99 }, 240, E.inOut);
      await A.T({ lean: -3 * d.dx, sx: 0.95, sy: 1.05 }, 240, E.out);
      await A.P(360, (p, ms) => {
        const k = Math.sin(ms / 45) * 0.05 * (1 - p);
        r.sx = 1 + k; r.sy = 1 - k; r.lean = -3 * d.dx * (1 - p);
      });
    },
    async bump(A, hit, d) {
      const r = A.rig;
      const home = { x: r.x, y: r.y };
      const sign = d.dx ? d.dx : d.dy;
      A.T({ roll: r.roll + 40 * sign }, 300, E.in);
      await A.T({ x: r.x + (hit.x - r.x) * 0.34, y: r.y + (hit.y - r.y) * 0.34 }, 300, E.in);
      A.mark();
      A.bubble('¡Ay!');
      r.eyes = 'dizzy';
      await A.T(d.dx ? { sx: 0.7, sy: 1.16 } : { sx: 1.25, sy: 0.74 }, 60, E.out);
      A.T({ roll: r.roll - 40 * sign }, 420, E.out);
      A.T({ x: home.x, y: home.y }, 420, E.out);
      await A.P(700, (p, ms) => {
        const k = Math.sin(ms / 38) * 0.18 * Math.pow(1 - p, 1.5);
        r.sx = 1 + k; r.sy = 1 - k;
      });
      A.dizzy(true);
      await A.P(1300, (p, ms) => { r.lean = Math.sin(ms / 200) * 6 * (1 - p); });
      A.dizzy(false);
    },
    async celebrate(A) {
      const r = A.rig;
      r.eyes = 'happy'; r.mouth = 'grin';
      const hs = [-44, -24, -10];
      for (const h of hs) {
        await A.T({ sx: 1.2, sy: 0.78 }, 80, E.out);
        A.T({ roll: r.roll + 180 }, 420, E.linear);
        await A.T({ hop: h, sx: 0.92, sy: 1.1 }, 200 + h * -1.5, E.out);
        await A.T({ hop: 0, sx: 1, sy: 1 }, 190 + h * -1.5, E.in);
      }
      await A.P(600, (p, ms) => {
        const k = Math.sin(ms / 50) * 0.16 * (1 - p);
        r.sx = 1 + k; r.sy = 1 - k;
      });
      await A.wait(300);
      r.mouth = 'smile';
    },
    async tap(A) {
      const r = A.rig;
      r.eyes = 'happy'; r.mouth = 'o';
      A.bubble('¡Blup!');
      await A.P(900, (p, ms) => {
        const k = Math.sin(ms / 55) * 0.2 * Math.pow(1 - p, 1.3);
        r.sx = 1 + k; r.sy = 1 - k;
      });
      r.eyes = 'open'; r.mouth = 'smile';
    },
    async nod(A) {
      const r = A.rig;
      await A.P(420, (p, ms) => {
        const k = Math.sin(ms / 60) * 0.07 * (1 - p);
        r.sx = 1 + k; r.sy = 1 - k;
      });
    },
    async sleep(A) {
      const r = A.rig;
      r.mouth = 'yawn'; r.eyes = 'closed';
      await A.T({ sy: 1.1, sx: 0.94 }, 800, E.inOut);
      await A.wait(300);
      r.mouth = 'o';
      await A.T({ sy: 0.86, sx: 1.1, needle: 28 }, 1400, E.inOut);
    },
    async fidget(A) {
      const r = A.rig;
      const x0 = r.x;
      await A.T({ x: x0 + 4, roll: r.roll + 14 }, 500, E.inOut);
      await A.T({ x: x0 - 4, roll: r.roll - 28 }, 800, E.inOut);
      await A.T({ x: x0, roll: r.roll + 14 }, 600, E.inOut);
    },
  },
};

export const CHARACTERS = [brote, mina, pliegue, ovillo];
