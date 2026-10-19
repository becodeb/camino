// The Workshop's blocks drawn (T40): Scratch 3's shapes (the puzzle notch,
// the hat's cap, C and E mouths, round reporters, hexagonal booleans) as
// flat paper in Scratch's category colours softened for the notebook, an
// ink outline and a flat offset shadow (docs/style-guide.md: no gradients,
// no blur). Exact geometry and no SVG filters: the workspace pans and drags
// smoothly on the classroom's Raspberry-Pi-class machines.
//
// Everything is drawn from model.ts's layout, so what you see is what the
// drop targets are computed from. Each block's group carries `data-block`
// (its id) and `data-op`; an input carries `data-field` (its name) and
// `data-type`, so the editor's pointer handling reads the DOM directly.

import { memo } from 'react';
import { catOf, type MenuKind } from './blocks';
import { DIM, layoutBlock, type BlockL, type LayoutCtx, type Measure, type PartL } from './model';

export const INK = '#2b2622';
const SHADOW = 'rgba(84, 62, 38, 0.22)';
export const FONT = '700 14px Andika, system-ui, sans-serif';

// ------------------------------------------------------------------ text measure

let canvas: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();
/** The browser's width of a label in the blocks' font (cached; a fallback before fonts load or with no canvas). */
export const measure: Measure = (s) => {
  const hit = widths.get(s);
  if (hit !== undefined) return hit;
  if (canvas === undefined) {
    try { canvas = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null; } catch { canvas = null; }
  }
  let w = s.length * 7.8;
  if (canvas) { canvas.font = FONT; w = Math.ceil(canvas.measureText(s).width); }
  widths.set(s, w);
  return w;
};
/** The fonts arrived: widths measured with the fallback font are forgotten. */
export function resetMeasure() { widths.clear(); }

// ------------------------------------------------------------------ shapes

const NOTCH = (x: number, y: number, dir: 1 | -1) => (dir > 0
  ? `L${x + 12},${y} L${x + 18},${y + 5} L${x + 30},${y + 5} L${x + 36},${y}`
  : `L${x + 36},${y} L${x + 30},${y + 5} L${x + 18},${y + 5} L${x + 12},${y}`);

/** A block's outline, in workspace coordinates (its own x, y). */
export function blockPath(l: BlockL): string {
  const { x, y, w, h } = l;
  const r = 5;
  if (l.shape === 'reporter') {
    const k = h / 2;
    return `M${x + k},${y} L${x + w - k},${y} A${k},${k} 0 0 1 ${x + w - k},${y + h} L${x + k},${y + h} A${k},${k} 0 0 1 ${x + k},${y} Z`;
  }
  if (l.shape === 'boolean') {
    const k = h / 2;
    return `M${x + k},${y} L${x + w - k},${y} L${x + w},${y + k} L${x + w - k},${y + h} L${x + k},${y + h} L${x},${y + k} Z`;
  }
  const cap = !!l.spec.cap;
  let d: string;
  if (l.shape === 'hat') {
    const t = y + DIM.hatTop;
    d = `M${x},${t} C${x + 22},${y - 4} ${x + 78},${y - 4} ${x + 100},${t} L${x + w - r},${t} Q${x + w},${t} ${x + w},${t + r}`;
  } else {
    d = `M${x},${y + r} Q${x},${y} ${x + r},${y} ${NOTCH(x, y, 1)} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r}`;
  }
  if (l.mouths.length) {
    const a = x + DIM.arm;
    for (let m = 0; m < l.mouths.length; m++) {
      const mo = l.mouths[m];
      // the arm's underside (a tab into the mouth), down the inside, the mouth's floor (a dent)
      d += ` L${x + w},${mo.y} ${NOTCH(a, mo.y, -1)} L${a},${mo.y} L${a},${mo.y + mo.h} ${NOTCH(a, mo.y + mo.h, 1)} L${x + w - r},${mo.y + mo.h} Q${x + w},${mo.y + mo.h} ${x + w},${mo.y + mo.h + r}`;
    }
  }
  d += ` L${x + w},${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h}`;
  d += cap ? ` L${x + r},${y + h}` : ` ${NOTCH(x, y + h, -1)} L${x + r},${y + h}`;
  d += ` Q${x},${y + h} ${x},${y + h - r} Z`;
  return d;
}

const pill = (x: number, y: number, w: number, h: number) => {
  const k = h / 2;
  return `M${x + k},${y} L${x + w - k},${y} A${k},${k} 0 0 1 ${x + w - k},${y + h} L${x + k},${y + h} A${k},${k} 0 0 1 ${x + k},${y} Z`;
};
const hex = (x: number, y: number, w: number, h: number) => {
  const k = h / 2;
  return `M${x + k},${y} L${x + w - k},${y} L${x + w},${y + k} L${x + w - k},${y + h} L${x + k},${y + h} L${x},${y + k} Z`;
};

/** Scratch's green flag, drawn small (the flag hat, the ▶ button). */
export function FlagGlyph({ x = 0, y = 0, s = 1 }: { x?: number; y?: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4,2 L4,23" stroke={INK} strokeWidth={2.4} fill="none" />
      <path d="M4.5,3 C9,0.5 13,5.5 18,3 C20,2.2 21.5,2 22,2.5 L22,13.5 C17,16 13,10.5 8,13 C6.5,13.6 5.4,14 4.5,14 Z" fill="#6fbf5a" stroke={INK} strokeWidth={1.8} />
    </g>
  );
}

// ------------------------------------------------------------------ drawing

export interface DrawOpts {
  /** Blocks drawn as the gray snap shadow. */
  shadow?: ReadonlySet<string>;
  /** Blocks that glow (help, the investigate answer, the palette hint). */
  glow?: ReadonlySet<string>;
  /** Blocks dimmed (another block was picked in an investigate question). */
  dim?: ReadonlySet<string>;
}

function Part({ p, l, o }: { p: PartL; l: BlockL; o: DrawOpts }) {
  const cat = catOf(l.cat);
  const cy = p.y + p.h / 2;
  switch (p.kind) {
    case 'text': case 'name':
      return <text className="ws-txt" x={p.x} y={cy + 5.2}>{p.text}</text>;
    case 'icon':
      return <FlagGlyph x={p.x} y={cy - 12} />;
    case 'field':
      return (
        <g data-field={p.input} data-type={p.type} className="ws-field">
          <path d={pill(p.x, p.y, p.w, p.h)} fill="#fffdf6" stroke={INK} strokeWidth={1.6} />
          <text className="ws-txt ws-val" x={p.x + p.w / 2} y={cy + 5.2} textAnchor="middle">{p.text}</text>
        </g>
      );
    case 'menu':
      return (
        <g data-field={p.input} data-type="menu" data-menu={p.menu} className="ws-field">
          <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={6} fill={cat.dark} stroke={INK} strokeWidth={1.6} />
          <text className="ws-txt" x={p.x + DIM.fieldPad} y={cy + 5.2}>{p.text}</text>
          <path d={`M${p.x + p.w - 18},${cy - 2.5} l5,5.5 l5,-5.5`} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'bool':
      return <path data-slot={p.input} d={hex(p.x, p.y, p.w, p.h)} fill={cat.dark} stroke={INK} strokeWidth={1.4} opacity={0.85} />;
    case 'block':
      return p.child ? <BlockG l={p.child} o={o} /> : null;
  }
}

/** One block, its inputs and what its mouths hold. */
export function BlockG({ l, o = {}, top = false }: { l: BlockL; o?: DrawOpts; top?: boolean }) {
  const id = l.block.id;
  const isShadow = o.shadow?.has(id);
  const cat = catOf(l.cat);
  const d = blockPath(l);
  const cls = `ws-blk${o.glow?.has(id) ? ' is-glow' : ''}${o.dim?.has(id) ? ' is-dim' : ''}${isShadow ? ' is-shadow' : ''}`;
  return (
    <g className={cls} data-block={id} data-op={l.block.op}>
      {top && !isShadow && <path d={d} transform="translate(2.5 3.5)" fill={SHADOW} />}
      <path className="ws-shape" d={d} fill={isShadow ? '#b9b2a6' : cat.fill} stroke={isShadow ? '#8f887d' : INK} strokeWidth={isShadow ? 1.6 : 2.2} strokeLinejoin="round" />
      {!isShadow && l.parts.map((p, i) => <Part key={i} p={p} l={l} o={o} />)}
      {!isShadow && l.elseParts?.map((p, i) => <Part key={`e${i}`} p={p} l={l} o={o} />)}
      {l.mouths.map((m, k) => m.items.map((it) => <BlockG key={`${k}-${it.block.id}`} l={it} o={o} />))}
      {isShadow && l.parts.filter((p) => p.child).map((p, i) => <BlockG key={`s${i}`} l={p.child!} o={o} />)}
    </g>
  );
}

/** A list of blocks (a stack) drawn from its layout. */
export const StackG = memo(function StackG({ items, o }: { items: readonly BlockL[]; o?: DrawOpts }) {
  return <>{items.map((l, i) => <BlockG key={l.block.id} l={l} o={o} top={i === 0} />)}</>;
});

/** The layout context the editor uses (the browser's measure; sprite ids shown by their names). */
export function layoutCtx(names: (kind: MenuKind, v: string) => string): LayoutCtx {
  return { measure, menuText: names };
}

/** A block drawn alone (the palette, the worked example), as its own small SVG. */
export function BlockPicture({ blocks, ctx, o, className, pad = 6, scale = 1 }: { blocks: import('./model').Block[]; ctx: LayoutCtx; o?: DrawOpts; className?: string; pad?: number; scale?: number }) {
  let y = 0;
  let w = 0;
  const items: BlockL[] = [];
  for (const b of blocks) {
    const l = layoutBlock(b, ctx);
    shiftTo(l, 0, y);
    items.push(l);
    y += l.h;
    w = Math.max(w, l.w + reach(l));
  }
  const h = y + 8;
  return (
    <svg className={className} width={(w + pad * 2 + 4) * scale} height={(h + pad * 2) * scale} viewBox={`${-pad} ${-pad} ${w + pad * 2 + 4} ${h + pad * 2}`} aria-hidden="true">
      <StackG items={items} o={o} />
    </svg>
  );
}

function reach(l: BlockL): number {
  let r = 0;
  for (const m of l.mouths) for (const it of m.items) r = Math.max(r, it.x - l.x + it.w + reach(it) - l.w);
  return Math.max(0, r);
}
/** Moves a laid-out block (and everything in it) so its top-left is at (x, y). */
export function shiftTo(l: BlockL, x: number, y: number) {
  const dx = x - l.x, dy = y - l.y;
  const go = (b: BlockL) => {
    b.x += dx; b.y += dy; b.rowY += dy;
    if (b.elseY !== undefined) b.elseY += dy;
    for (const p of [...b.parts, ...(b.elseParts ?? [])]) { p.x += dx; p.y += dy; if (p.child) go(p.child); }
    for (const m of b.mouths) { m.x += dx; m.y += dy; m.items.forEach(go); }
  };
  if (dx || dy) go(l);
}
