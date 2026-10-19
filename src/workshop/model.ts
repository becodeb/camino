// The Workshop's block model (T40), pure: a project is sprites, each with
// its own scripts lying loose on a free workspace (`stacks`: an x, y and a
// list of blocks); blocks have typed inputs (a literal, or a reporter
// plugged in) and C-blocks hold substacks in their mouths. Everything the
// editor does is a function here, unit-tested (model.test.ts): picking a
// stack up by its top block or from the middle, dropping it below a block,
// inside a mouth, on top of a hat-less stack, a reporter into a slot, loose,
// deleting, duplicating, editing an input.
//
// Layout (sizes and positions in workspace pixels) is computed here too, so
// the editor draws exactly what the drop targets are computed from: the
// snap shadow is the real result of the drop (`applyDrop` on a copy).

import { hasMouths, isValueShape, mouthCount, spec, type BlockSpec, type Cat, type InType, type MenuKind, type Op, type Shape, tokens, type VarName } from './blocks';

// ------------------------------------------------------------------ data

/** An input: its literal value (kept while a reporter covers it, like Scratch's shadow) and the reporter plugged in. */
export interface Slot { v: string; r?: Block }
export interface Block { id: string; op: Op; in: Record<string, Slot>; subs?: Block[][] }
export interface Stack { id: string; x: number; y: number; blocks: Block[] }

export type SpriteKind = 'stage' | 'player' | 'floor' | 'obstacle' | 'seed' | 'bird' | 'star';
export interface Sprite {
  id: string;
  name: string;
  kind: SpriteKind;
  /** Where it starts (every ▶ starts from here). */
  x: number;
  y: number;
  /** Scratch's direction: 90 is right, -90 left (`mover n pasos`). */
  dir: number;
  visible: boolean;
  costume: string;
  stacks: Stack[];
}
export interface Project { v: 1; sprites: Sprite[]; vars: Record<VarName, number> }

let seq = 0;
const PREFIX = Math.random().toString(36).slice(2, 6);
/** A new id, unique in practice across page loads (a random prefix per load). */
export const newId = () => `${PREFIX}${(++seq).toString(36)}`;

type Value = string | number | Block;

/** A block with its inputs (a number or text is the literal, a block is plugged in) and its mouths. */
export function make(op: Op, values: Record<string, Value> = {}, subs?: Block[][]): Block {
  const s = spec(op);
  const inputs: Record<string, Slot> = {};
  for (const [name, is] of Object.entries(s.inputs)) {
    const v = values[name];
    if (v && typeof v === 'object') inputs[name] = { v: is.def, r: v };
    else inputs[name] = { v: v === undefined ? is.def : String(v) };
  }
  const b: Block = { id: newId(), op, in: inputs };
  const n = mouthCount(s.shape);
  if (n) b.subs = Array.from({ length: n }, (_, i) => subs?.[i] ?? []);
  return b;
}

export const stackOf = (x: number, y: number, blocks: Block[]): Stack => ({ id: newId(), x, y, blocks });

/** A deep copy with new ids (duplicate). */
export function cloneBlock(b: Block): Block {
  return {
    id: newId(),
    op: b.op,
    in: Object.fromEntries(Object.entries(b.in).map(([k, s]) => [k, s.r ? { v: s.v, r: cloneBlock(s.r) } : { v: s.v }])),
    ...(b.subs ? { subs: b.subs.map((l) => l.map(cloneBlock)) } : {}),
  };
}

const deep = <T>(x: T): T => structuredClone(x);

// ------------------------------------------------------------------ walking

export interface Where {
  /** The list the block sits in (a stack's blocks or a mouth), or null for a reporter in a slot. */
  list: Block[] | null;
  index: number;
  stack: Stack;
  /** For a reporter: the block and input holding it. */
  holder?: { block: Block; name: string };
  block: Block;
}

function findIn(list: Block[], id: string, stack: Stack): Where | null {
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.id === id) return { list, index: i, stack, block: b };
    const inner = findInBlock(b, id, stack);
    if (inner) return inner;
  }
  return null;
}
function findInBlock(b: Block, id: string, stack: Stack): Where | null {
  for (const [name, s] of Object.entries(b.in)) {
    if (!s.r) continue;
    if (s.r.id === id) return { list: null, index: 0, stack, holder: { block: b, name }, block: s.r };
    const inner = findInBlock(s.r, id, stack);
    if (inner) return inner;
  }
  for (const l of b.subs ?? []) {
    const w = findIn(l, id, stack);
    if (w) return w;
  }
  return null;
}

/** Where a block is in these stacks (the stacks are walked as given: mutate the result only on a copy). */
export function findBlock(stacks: Stack[], id: string): Where | null {
  for (const st of stacks) {
    const w = findIn(st.blocks, id, st);
    if (w) return w;
  }
  return null;
}

/** Every block (reporters and mouths included), depth first. */
export function* allBlocks(blocks: readonly Block[]): Generator<Block> {
  for (const b of blocks) {
    yield b;
    for (const s of Object.values(b.in)) if (s.r) yield* allBlocks([s.r]);
    for (const l of b.subs ?? []) yield* allBlocks(l);
  }
}
export const countBlocks = (blocks: readonly Block[]) => { let n = 0; for (const _ of allBlocks(blocks)) n++; return n; };

// ------------------------------------------------------------------ layout

export type Measure = (text: string) => number;
/** A stand-in for the browser's text measure (Andika bold 15 px): tests and the first paint. */
export const approxMeasure: Measure = (s) => s.length * 8.3;

/** Sizes in workspace pixels. */
export const DIM = {
  padX: 10, gap: 6, rowH: 46, hatTop: 18, arm: 16, foot: 24, elseH: 34, emptyMouth: 26,
  fieldH: 28, fieldPad: 9, fieldMin: 32, menuArrow: 14, boolMin: 40, repH: 32, repPad: 11, boolPad: 14, icon: 26, minW: 60, textH: 20,
} as const;

export interface LayoutCtx {
  measure: Measure;
  /** What a dropdown shows for a value (a sprite's id → its name). */
  menuText?(kind: MenuKind, v: string): string;
}

export interface PartL {
  kind: 'text' | 'icon' | 'field' | 'menu' | 'bool' | 'name' | 'block';
  x: number; y: number; w: number; h: number;
  text?: string;
  input?: string;
  type?: InType;
  menu?: MenuKind;
  child?: BlockL;
}
export interface MouthL { x: number; y: number; h: number; items: BlockL[] }
export interface BlockL {
  block: Block;
  spec: BlockSpec;
  shape: Shape;
  cat: Cat;
  x: number; y: number; w: number; h: number;
  /** The first row's height (hat bump excluded) and where it starts. */
  rowH: number;
  rowY: number;
  parts: PartL[];
  elseY?: number;
  elseParts?: PartL[];
  mouths: MouthL[];
}

function shift(l: BlockL, dx: number, dy: number): void {
  l.x += dx; l.y += dy; l.rowY += dy;
  if (l.elseY !== undefined) l.elseY += dy;
  for (const p of [...l.parts, ...(l.elseParts ?? [])]) {
    p.x += dx; p.y += dy;
    if (p.child) shift(p.child, dx, dy);
  }
  for (const m of l.mouths) {
    m.x += dx; m.y += dy;
    for (const it of m.items) shift(it, dx, dy);
  }
}

function rowParts(label: string, b: Block, s: BlockSpec, ctx: LayoutCtx, value: boolean): { parts: PartL[]; w: number; h: number } {
  const parts: PartL[] = [];
  for (const t of tokens(label)) {
    if (t.t === 'text') parts.push({ kind: 'text', x: 0, y: 0, w: ctx.measure(t.s), h: DIM.textH, text: t.s });
    else if (t.t === 'icon') parts.push({ kind: 'icon', x: 0, y: 0, w: DIM.icon, h: 24, text: t.s });
    else if (t.t === 'name') {
      const v = b.in[t.name]?.v ?? '';
      parts.push({ kind: 'name', x: 0, y: 0, w: ctx.measure(v), h: DIM.textH, text: v, input: t.name });
    } else {
      const is = s.inputs[t.name];
      const slot = b.in[t.name] ?? { v: is.def };
      if (slot.r) {
        const child = layoutBlock(slot.r, ctx);
        parts.push({ kind: 'block', x: 0, y: 0, w: child.w, h: child.h, input: t.name, type: is.type, child });
      } else if (is.type === 'bool') {
        parts.push({ kind: 'bool', x: 0, y: 0, w: DIM.boolMin, h: DIM.fieldH, input: t.name, type: 'bool' });
      } else if (is.type === 'menu') {
        const shown = ctx.menuText?.(is.menu!, slot.v) ?? slot.v;
        parts.push({ kind: 'menu', x: 0, y: 0, w: ctx.measure(shown || ' ') + DIM.fieldPad * 2 + DIM.menuArrow, h: DIM.fieldH, text: shown, input: t.name, type: 'menu', menu: is.menu });
      } else {
        parts.push({ kind: 'field', x: 0, y: 0, w: Math.max(DIM.fieldMin, ctx.measure(slot.v) + DIM.fieldPad * 2), h: DIM.fieldH, text: slot.v, input: t.name, type: is.type });
      }
    }
  }
  const pad = !value ? DIM.padX : s.shape === 'boolean' ? DIM.boolPad : DIM.repPad;
  let x = pad;
  let h = 0;
  for (const p of parts) { p.x = x; x += p.w + DIM.gap; h = Math.max(h, p.h); }
  return { parts, w: x - DIM.gap + pad, h };
}

/** A block's layout at (0, 0) (its top-left; a hat's bump included). */
export function layoutBlock(b: Block, ctx: LayoutCtx): BlockL {
  const s = spec(b.op);
  const value = isValueShape(s.shape);
  const row = rowParts(s.label, b, s, ctx, value);
  const rowH = value ? Math.max(DIM.repH, row.h + 6) : Math.max(DIM.rowH, row.h + 14);
  const rowY = s.shape === 'hat' ? DIM.hatTop : 0;
  for (const p of row.parts) {
    const dy = rowY + (rowH - p.h) / 2;
    p.y = dy;
    if (p.child) shift(p.child, p.x, dy);
  }
  const l: BlockL = { block: b, spec: s, shape: s.shape, cat: s.cat, x: 0, y: 0, w: Math.max(value ? 0 : DIM.minW, row.w), h: rowY + rowH, rowH, rowY, parts: row.parts, mouths: [] };
  if (s.shape === 'hat') l.w = Math.max(l.w, 120);
  if (hasMouths(s.shape)) {
    let y = rowH;
    const subs = b.subs ?? [];
    for (let m = 0; m < mouthCount(s.shape); m++) {
      const list = layoutList(subs[m] ?? [], DIM.arm, y, ctx);
      const h = Math.max(DIM.emptyMouth, list.h);
      l.mouths.push({ x: DIM.arm, y, h, items: list.items });
      y += h;
      if (m === 0 && s.shape === 'e') {
        const er = rowParts(s.elseLabel ?? 'si no', b, s, ctx, false);
        l.elseY = y;
        for (const p of er.parts) p.y = y + (DIM.elseH - p.h) / 2;
        l.elseParts = er.parts;
        y += DIM.elseH;
      }
    }
    l.h = y + DIM.foot;
  }
  return l;
}

/** A list of blocks one under the other, from (x, y). */
export function layoutList(blocks: readonly Block[], x: number, y: number, ctx: LayoutCtx): { items: BlockL[]; w: number; h: number } {
  const items: BlockL[] = [];
  let at = y;
  let w = 0;
  for (const b of blocks) {
    const l = layoutBlock(b, ctx);
    shift(l, x, at);
    items.push(l);
    at += l.h;
    w = Math.max(w, l.w + subsW(l));
  }
  return { items, w, h: at - y };
}
/** How far a block's mouths reach past its own width. */
function subsW(l: BlockL): number {
  let w = 0;
  for (const m of l.mouths) for (const it of m.items) w = Math.max(w, it.x - l.x + it.w + subsW(it) - l.w);
  return Math.max(0, w);
}

export interface StackL { stack: Stack; items: BlockL[]; w: number; h: number }
export function layoutStack(st: Stack, ctx: LayoutCtx): StackL {
  const l = layoutList(st.blocks, st.x, st.y, ctx);
  return { stack: st, items: l.items, w: l.w, h: l.h };
}

/** Every block layout in these layouts (mouths and reporters included). */
export function* allLayouts(items: readonly BlockL[]): Generator<BlockL> {
  for (const l of items) {
    yield l;
    for (const p of l.parts) if (p.child) yield* allLayouts([p.child]);
    for (const m of l.mouths) yield* allLayouts(m.items);
  }
}

// ------------------------------------------------------------------ drop targets

export type Target =
  /** Below a block (what was below it goes below the dropped blocks). */
  | { kind: 'after'; id: string; x: number; y: number; last: boolean }
  /** At the top of a C-block's mouth `m`. */
  | { kind: 'mouth'; id: string; m: number; x: number; y: number; empty: boolean }
  /** On top of a hat-less stack (the dropped blocks' bottom meets its top). */
  | { kind: 'before'; stack: string; x: number; y: number }
  /** A reporter into an input slot. */
  | { kind: 'slot'; id: string; name: string; x: number; y: number; accepts: 'reporter' | 'boolean'; filled: boolean };

/** Every place something could snap, in workspace pixels. */
export function targetsOf(stacks: readonly Stack[], ctx: LayoutCtx): Target[] {
  const out: Target[] = [];
  for (const st of stacks) {
    const sl = layoutStack(st, ctx);
    const first = st.blocks[0];
    if (first) {
      const sh = spec(first.op).shape;
      if (sh !== 'hat' && !isValueShape(sh)) out.push({ kind: 'before', stack: st.id, x: st.x, y: st.y });
    }
    const lists = (items: BlockL[]) => {
      items.forEach((l, i) => {
        if (!isValueShape(l.shape) && !l.spec.cap) out.push({ kind: 'after', id: l.block.id, x: l.x, y: l.y + l.h, last: i === items.length - 1 });
        l.mouths.forEach((m, k) => {
          out.push({ kind: 'mouth', id: l.block.id, m: k, x: m.x, y: m.y, empty: m.items.length === 0 });
          lists(m.items);
        });
        slots(l);
      });
    };
    const slots = (l: BlockL) => {
      for (const p of [...l.parts]) {
        if (p.kind === 'field' || p.kind === 'bool' || (p.kind === 'block' && p.type !== 'menu')) {
          out.push({ kind: 'slot', id: l.block.id, name: p.input!, x: p.x, y: p.y + p.h / 2, accepts: p.type === 'bool' ? 'boolean' : 'reporter', filled: p.kind === 'block' });
        }
        if (p.child) slots(p.child);
      }
    };
    lists(sl.items);
  }
  return out;
}

/** The drop radius (workspace pixels; y counts a bit more than x). */
export const SNAP = 46;

const endsInCap = (blocks: readonly Block[]) => !!spec(blocks[blocks.length - 1].op).cap;
/** A single C-block with an empty first mouth wraps whatever is below where it drops (Scratch 3). */
const wraps = (blocks: readonly Block[]) => blocks.length === 1 && hasMouths(spec(blocks[0].op).shape) && (blocks[0].subs?.[0]?.length ?? 0) === 0;

/** The height of a list of blocks. */
export const listHeight = (blocks: readonly Block[], ctx: LayoutCtx) => layoutList(blocks, 0, 0, ctx).h;

/**
 * Where `dragged` (a list of blocks whose top-left is at `at`) would snap,
 * or null (it lands loose). The same rules Scratch has: a hat only on top of
 * a hat-less stack; a reporter only into a slot of its shape; a stack ending
 * in a cap block (por siempre, detener todo) only at the end of a list,
 * unless it is an empty C that wraps what follows.
 */
export function findDrop(stacks: readonly Stack[], dragged: readonly Block[], at: { x: number; y: number }, ctx: LayoutCtx): Target | null {
  if (!dragged.length) return null;
  const sh = spec(dragged[0].op).shape;
  const h = listHeight(dragged, ctx);
  const cap = endsInCap(dragged);
  const wrap = wraps(dragged);
  let best: Target | null = null;
  let bestD = Infinity;
  const consider = (t: Target, ax: number, ay: number) => {
    const d = Math.hypot(t.x - ax, (t.y - ay) * 1.25);
    if (d < SNAP && d < bestD) { best = t; bestD = d; }
  };
  for (const t of targetsOf(stacks, ctx)) {
    if (isValueShape(sh)) {
      if (t.kind !== 'slot' || t.accepts !== sh) continue;
      consider(t, at.x, at.y + h / 2);
      continue;
    }
    if (t.kind === 'slot') continue;
    if (sh === 'hat') {
      if (t.kind === 'before') consider(t, at.x, at.y + h);
      continue;
    }
    if (t.kind === 'after') { if (cap && !t.last && !wrap) continue; consider(t, at.x, at.y); }
    else if (t.kind === 'mouth') { if (cap && !t.empty && !wrap) continue; consider(t, at.x, at.y); }
    else if (t.kind === 'before') { if (cap && !wrap) continue; consider(t, at.x, at.y + h); }
  }
  return best;
}

/** The stacks with `dragged` dropped on `target` (or loose at `at`). Pure: the input is not changed. */
export function applyDrop(stacks: readonly Stack[], dragged: readonly Block[], target: Target | null, at: { x: number; y: number }, ctx: LayoutCtx): Stack[] {
  const out = deep(stacks) as Stack[];
  const drop = deep(dragged) as Block[];
  const wrap = wraps(drop);
  const join = (rest: Block[]): Block[] => {
    if (!rest.length) return drop;
    if (wrap) { drop[0].subs![0] = rest; return drop; }
    if (endsInCap(drop)) {
      // never reached through findDrop: what was below goes loose rather than vanish
      out.push(stackOf(at.x, at.y + listHeight(drop, ctx) + 20, rest));
      return drop;
    }
    return [...drop, ...rest];
  };
  if (!target) { out.push(stackOf(Math.round(at.x), Math.round(at.y), drop)); return out; }
  if (target.kind === 'before') {
    const st = out.find((s) => s.id === target.stack);
    if (!st) { out.push(stackOf(at.x, at.y, drop)); return out; }
    // the stack stays where it was: what is dropped goes above it (a wrapping C puts it in its mouth)
    const h = wrap ? layoutBlock(drop[0], ctx).rowH : listHeight(drop, ctx);
    st.blocks = join(st.blocks);
    st.y = Math.round(st.y - h);
    return out;
  }
  const w = findBlock(out, target.id);
  if (!w) { out.push(stackOf(at.x, at.y, drop)); return out; }
  if (target.kind === 'after' && w.list) {
    const rest = w.list.splice(w.index + 1);
    w.list.push(...join(rest));
  } else if (target.kind === 'mouth') {
    const subs = w.block.subs ?? (w.block.subs = []);
    const existing = subs[target.m] ?? [];
    subs[target.m] = join(existing);
  } else if (target.kind === 'slot') {
    const slot = w.block.in[target.name];
    if (!slot) { out.push(stackOf(at.x, at.y, drop)); return out; }
    const old = slot.r;
    slot.r = drop[0];
    if (old) out.push(stackOf(Math.round(target.x + 16), Math.round(target.y + 40), [old]));
  }
  return out;
}

export interface PickUp {
  stacks: Stack[];
  dragged: Block[];
  /** The top-left of what was picked up, in workspace pixels (the drag starts from there). */
  at: { x: number; y: number };
  from: 'stack' | 'middle' | 'slot';
  /** The stack it came from (a whole stack taken keeps its id for a drop back where it was). */
  stackId: string;
}

/**
 * Picks up a block: its whole stack when it is the stack's top (a hat or the
 * first block), the block and everything below it when it is in the middle
 * of a list (a mouth included), a reporter alone out of its slot.
 */
export function pickUp(stacks: readonly Stack[], id: string, ctx: LayoutCtx): PickUp | null {
  const pos = new Map<string, { x: number; y: number }>();
  for (const st of stacks) for (const l of allLayouts(layoutStack(st, ctx).items)) pos.set(l.block.id, { x: l.x, y: l.y });
  const out = deep(stacks) as Stack[];
  const w = findBlock(out, id);
  if (!w) return null;
  const at = pos.get(id) ?? { x: w.stack.x, y: w.stack.y };
  if (w.holder) {
    const r = w.holder.block.in[w.holder.name].r!;
    delete w.holder.block.in[w.holder.name].r;
    return { stacks: out, dragged: [r], at, from: 'slot', stackId: w.stack.id };
  }
  if (w.list === w.stack.blocks && w.index === 0) {
    const i = out.indexOf(w.stack);
    out.splice(i, 1);
    return { stacks: out, dragged: w.stack.blocks, at: { x: w.stack.x, y: w.stack.y }, from: 'stack', stackId: w.stack.id };
  }
  const dragged = w.list!.splice(w.index);
  return { stacks: out, dragged, at, from: 'middle', stackId: w.stack.id };
}

/** Deletes a block as a drag onto the palette would: what pickUp takes is gone. */
export function deleteFrom(stacks: readonly Stack[], id: string, ctx: LayoutCtx): Stack[] {
  return pickUp(stacks, id, ctx)?.stacks ?? deep(stacks) as Stack[];
}

/** Scratch's "duplicar": a copy of the block and everything below it (a reporter alone), as a new stack beside it. */
export function duplicateFrom(stacks: readonly Stack[], id: string, ctx: LayoutCtx): { stacks: Stack[]; stack: Stack } | null {
  const p = pickUp(stacks, id, ctx);
  if (!p) return null;
  const copy = stackOf(Math.round(p.at.x + 28), Math.round(p.at.y + 28), p.dragged.map(cloneBlock));
  return { stacks: [...deep(stacks) as Stack[], copy], stack: copy };
}

/** An input's literal changed (a number typed, a dropdown option). */
export function setInput(stacks: readonly Stack[], id: string, name: string, v: string): Stack[] {
  const out = deep(stacks) as Stack[];
  const w = findBlock(out, id);
  if (w && w.block.in[name]) w.block.in[name].v = v;
  return out;
}

/** "Ordenar": the stacks in one column, in reading order, at the left. */
export function tidy(stacks: readonly Stack[], ctx: LayoutCtx, x = 24, y = 24, gap = 26): Stack[] {
  const out = deep(stacks) as Stack[];
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  let at = y;
  for (const st of out) {
    st.x = x;
    st.y = at;
    at += layoutStack(st, ctx).h + gap;
  }
  return out;
}

/** The workspace area the stacks cover (for "centrar" and the scroll range). */
export function boundsOf(stacks: readonly Stack[], ctx: LayoutCtx): { x: number; y: number; w: number; h: number } | null {
  if (!stacks.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const st of stacks) {
    const l = layoutStack(st, ctx);
    x0 = Math.min(x0, st.x); y0 = Math.min(y0, st.y);
    x1 = Math.max(x1, st.x + l.w); y1 = Math.max(y1, st.y + l.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ------------------------------------------------------------------ project helpers

export const spriteById = (p: Project, id: string) => p.sprites.find((s) => s.id === id) ?? null;
export function withSprite(p: Project, id: string, fn: (s: Sprite) => Sprite): Project {
  return { ...p, sprites: p.sprites.map((s) => (s.id === id ? fn(s) : s)) };
}
export const withStacks = (p: Project, id: string, stacks: Stack[]): Project => withSprite(p, id, (s) => ({ ...s, stacks }));

/** Scratch's name for a copy: "Tronco" → "Tronco2", "Tronco2" → "Tronco3". */
export function copyName(name: string, taken: readonly string[]): string {
  const base = name.replace(/\d+$/, '');
  for (let n = 2; ; n++) if (!taken.includes(`${base}${n}`)) return `${base}${n}`;
}

/**
 * Duplicates a sprite (its scripts, with new ids). Its own name inside its
 * scripts' `¿tocando?` menus stays pointing at the same others; any menu
 * that named the original sprite on the *copy* still names the original.
 */
export function duplicateSprite(p: Project, id: string): { project: Project; sprite: Sprite } | null {
  const s = spriteById(p, id);
  if (!s || s.kind === 'stage' || s.kind === 'player' || s.kind === 'floor') return null;
  const copy: Sprite = {
    ...deep(s),
    id: newId(),
    name: copyName(s.name, p.sprites.map((x) => x.name)),
    stacks: s.stacks.map((st) => ({ id: newId(), x: st.x, y: st.y, blocks: st.blocks.map(cloneBlock) })),
  };
  const i = p.sprites.indexOf(s);
  return { project: { ...p, sprites: [...p.sprites.slice(0, i + 1), copy, ...p.sprites.slice(i + 1)] }, sprite: copy };
}

/** Copies a stack onto another sprite (Scratch: a script dropped on a sprite's card), beside its own scripts. */
export function copyStackTo(p: Project, toSprite: string, blocks: readonly Block[], ctx: LayoutCtx): Project {
  return withSprite(p, toSprite, (s) => {
    const b = boundsOf(s.stacks, ctx);
    const x = b ? b.x : 24;
    const y = b ? b.y + b.h + 30 : 24;
    return { ...s, stacks: [...s.stacks, stackOf(x, y, blocks.map(cloneBlock))] };
  });
}
