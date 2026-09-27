// Hand-drawn geometry helpers: seeded randomness and slightly imperfect shapes.

export const NS = 'http://www.w3.org/2000/svg';

export function rng(seed) {
  // mulberry32: small, deterministic, good enough for doodles
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => Math.round(n * 10) / 10;
const pt = (p) => `${f(p[0])},${f(p[1])}`;

/** Closed Catmull-Rom spline through points, as cubic Beziers. */
export function smoothClosed(pts) {
  const n = pts.length;
  let d = `M${pt(pts[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return d + 'Z';
}

/** Open Catmull-Rom spline through points. */
export function smoothOpen(pts) {
  if (pts.length < 2) return '';
  let d = `M${pt(pts[0])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return d;
}

/** Wobbly ellipse-ish blob. */
export function blob(cx, cy, rx, ry, { wob = 0.04, n = 10, seed = 1, rot = 0 } = {}) {
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rot;
    const k = 1 + (r() * 2 - 1) * wob;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return smoothClosed(pts);
}

/** Polygon with jittered corners and slightly bowed edges: "cut with scissors". */
export function wobblyPoly(points, { wob = 1, bow = 1.4, seed = 1 } = {}) {
  const r = rng(seed);
  const P = points.map(([x, y]) => [x + (r() * 2 - 1) * wob, y + (r() * 2 - 1) * wob]);
  let d = `M${pt(P[0])}`;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    const o = (r() * 2 - 1) * bow;
    d += `Q${pt([mx + nx * o, my + ny * o])} ${pt(b)}`;
  }
  return d + 'Z';
}

/** A single ink stroke between two points, bowed and jittered. */
export function wobblyLine(x1, y1, x2, y2, { bow = 2, seed = 1, segs = 1, jit = 0.8 } = {}) {
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const j = i === 0 || i === segs ? jit * 0.5 : jit;
    pts.push([x1 + (x2 - x1) * t + (r() * 2 - 1) * j, y1 + (y2 - y1) * t + (r() * 2 - 1) * j]);
  }
  let d = `M${pt(pts[0])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    const o = (r() * 2 - 1) * bow;
    d += `Q${pt([(a[0] + b[0]) / 2 + nx * o, (a[1] + b[1]) / 2 + ny * o])} ${pt(b)}`;
  }
  return d;
}

/** A quick pen loop around a point: more than one turn, ends do not meet. */
export function penLoop(cx, cy, rx, ry, { seed = 1, turns = 1.18, start = -2.2 } = {}) {
  const r = rng(seed);
  const n = 40;
  const pts = [];
  const w1 = r() * 6, w2 = r() * 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = start + t * turns * Math.PI * 2;
    // low-frequency wobble (a hand, not noise) plus the drift of a quick loop
    const k = 1 + Math.sin(a * 2 + w1) * 0.025 + Math.sin(a * 3 + w2) * 0.015 + (t - 0.5) * 0.09;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return smoothOpen(pts);
}

/** Leaf shape from base to tip. */
export function leaf(x0, y0, x1, y1, w) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
  return `M${pt([x0, y0])}Q${pt([mx + nx * w, my + ny * w])} ${pt([x1, y1])}Q${pt([mx - nx * w * 0.8, my - ny * w * 0.8])} ${pt([x0, y0])}Z`;
}

/** Small hand-drawn spiral (dizzy swirl). */
export function spiral(cx, cy, r, turns = 2.2, seed = 1) {
  const rr = rng(seed);
  const pts = [];
  const n = 22;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    const k = r * t * (1 + (rr() - 0.5) * 0.12);
    pts.push([cx + Math.cos(a) * k, cy + Math.sin(a) * k * 0.8]);
  }
  return smoothOpen(pts);
}

export function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(node);
  return node;
}
