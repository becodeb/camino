// The block editor as data: where a block can go, what dropping it does to
// the program, and where each block sits on screen. Pure and headless so the
// drag logic can be tested in Node. Every edit returns a plain `Program`
// (model.ts), the one the engine runs.
// Ported from habilidades (app/src/areas/algorithmic/editor.ts @ 9b90d1d)
// without its event log; `emptySlots` draws the notebook's N lines (rule 8).

import type { Program, ProgramItem } from './model';

/** What is being placed: a command block or a repeat C-block (a tape). */
export type Block = ProgramItem;

/** A block in the program: a top-level item, or a card inside a tape. */
export interface BlockRef { item: number; inner?: number }

/** A gap between blocks: before top-level item `at`, or inside tape `tape` before card `at`. */
export type Slot = { at: number; tape?: undefined } | { tape: number; at: number };

export const isInner = (s: Slot): s is { tape: number; at: number } => s.tape != null;
export const slotKey = (s: Slot | null | undefined) => (s ? (isInner(s) ? `${s.tape}:${s.at}` : `${s.at}`) : '');
export const sameSlot = (a: Slot | null | undefined, b: Slot | null | undefined) => slotKey(a) === slotKey(b) && !!a === !!b;

/** Cards the child has placed (a tape itself is not a card), as model.cardCount. */
export function cards(p: Program): number {
  return p.reduce((n, it) => n + (it.t === 'cmd' ? 1 : it.body.length), 0);
}

const blockCards = (b: Block) => (b.t === 'cmd' ? 1 : b.body.length);

export function blockAt(p: Program, ref: BlockRef): Block | null {
  const it = p[ref.item];
  if (!it) return null;
  if (ref.inner == null) return it;
  if (it.t !== 'loop' || ref.inner >= it.body.length) return null;
  return { t: 'cmd', cmd: it.body[ref.inner] };
}

/**
 * Why a block cannot go into a slot, or null when it can. A tape never goes
 * inside a tape (the program model has one level of repetition), and the
 * program never holds more than `maxCards` cards.
 */
export function refusal(p: Program, slot: Slot, block: Block, opts: { maxCards?: number; moving?: boolean } = {}): 'nested' | 'full' | 'bad_slot' | null {
  if (isInner(slot)) {
    const t = p[slot.tape];
    if (!t || t.t !== 'loop' || slot.at < 0 || slot.at > t.body.length) return 'bad_slot';
    if (block.t === 'loop') return 'nested';
  } else if (slot.at < 0 || slot.at > p.length) return 'bad_slot';
  if (!opts.moving && opts.maxCards != null && cards(p) + blockCards(block) > opts.maxCards) return 'full';
  return null;
}

/** The program with `block` placed in `slot`. Throws on a refused slot. */
export function insertAt(p: Program, slot: Slot, block: Block): Program {
  const why = refusal(p, slot, block);
  if (why) throw new Error(`cannot place a ${block.t} at ${slotKey(slot)}: ${why}`);
  const next = structuredClone(p);
  const b = structuredClone(block);
  if (isInner(slot)) (next[slot.tape] as Extract<ProgramItem, { t: 'loop' }>).body.splice(slot.at, 0, (b as Extract<Block, { t: 'cmd' }>).cmd);
  else next.splice(slot.at, 0, b);
  return next;
}

/** The program without the block at `ref` (a tape goes with its cards), and that block. */
export function removeAt(p: Program, ref: BlockRef): { program: Program; block: Block } {
  const block = blockAt(p, ref);
  if (!block) throw new Error(`no block at ${ref.item}:${ref.inner ?? ''}`);
  const next = structuredClone(p);
  if (ref.inner != null) (next[ref.item] as Extract<ProgramItem, { t: 'loop' }>).body.splice(ref.inner, 1);
  else next.splice(ref.item, 1);
  return { program: next, block: structuredClone(block) };
}

/** Where a block that was at `ref` would be dropped back without change (slots of the program without it). */
export function homeSlot(ref: BlockRef): Slot {
  return ref.inner != null ? { tape: ref.item, at: ref.inner } : { at: ref.item };
}

/**
 * Moves the block at `from` to `slot`. `slot` is a gap of the program
 * *without* the moving block (what the child sees while dragging it), so a
 * drop is simply "take it out, put it there". Returns null for a refused slot.
 */
export function moveBlock(p: Program, from: BlockRef, slot: Slot): Program | null {
  const { program: base, block } = removeAt(p, from);
  if (refusal(base, slot, block, { moving: true })) return null;
  return insertAt(base, slot, block);
}

/** Where a tap on a palette block puts it: the end of the active tape, or the end of the program. */
export function appendSlot(p: Program, activeTape: number | null | undefined, block: Block): Slot {
  const t = activeTape != null ? p[activeTape] : undefined;
  if (t && t.t === 'loop' && block.t === 'cmd') return { tape: activeTape!, at: t.body.length };
  return { at: p.length };
}

// ------------------------------------------------------------------ layout

/** Sizes in CSS pixels. `compact` is used on phones and for long programs. */
export interface Dims {
  /** Width and height of a command block. */
  w: number;
  h: number;
  /** Height of the start block ("al empezar"). */
  start: number;
  /** A tape: top arm, spine width, bottom arm, and the width of its arms. */
  arm: number;
  spine: number;
  foot: number;
  cw: number;
  /** A conditional block's fixed mouth (it wraps what it does on a blot). */
  condMouth: number;
}

export const DIMS: Dims = { w: 78, h: 54, start: 58, arm: 54, spine: 22, foot: 22, cw: 124, condMouth: 40 };
export const DIMS_COMPACT: Dims = { w: 64, h: 46, start: 50, arm: 46, spine: 18, foot: 18, cw: 104, condMouth: 34 };

export type PlacedKind = 'start' | 'cmd' | 'loop' | 'slot' | 'gap';

export interface Placed {
  /** Stable enough for React: command id and occurrence, so equal blocks can swap unnoticed. */
  key: string;
  kind: PlacedKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Blocks: where they are in the program. */
  ref?: BlockRef;
  cmd?: string;
  /** Tapes: height of the mouth between the arms, and the count. */
  mouth?: number;
  count?: number | 'goal';
  /** Tapes: height of the top arm (the mouth starts under it). */
  arm?: number;
  /** Slots and gaps: which gap of the program they stand for. */
  slot?: Slot;
  /** Slot inside an active tape (taps go there) or where "something is missing". */
  active?: boolean;
}

export interface LayoutOptions {
  dims?: Dims;
  /** Open a gap here (drag preview), sized for this kind of block. */
  gap?: Slot | null;
  gapBlock?: Block | null;
  /** Commands drawn as a C-shape with a fixed mouth ("si hay mancha"). */
  isCond?: (cmd: string) => boolean;
  /** Show the dashed "next block goes here" slot at the end. */
  endSlot?: boolean;
  /** Draw this many dashed slots at the end instead (the notebook's free lines). */
  emptySlots?: number;
  /** The tape receiving taps: it shows a slot at the end of its mouth. */
  activeTape?: number | null;
}

export interface Layout {
  items: Placed[];
  height: number;
  width: number;
}

const cardH = (cmd: string, d: Dims, isCond: (cmd: string) => boolean) => (isCond(cmd) ? d.arm + d.condMouth + d.foot : d.h);

export function blockHeight(b: Block, d: Dims, isCond: (cmd: string) => boolean): number {
  if (b.t === 'cmd') return cardH(b.cmd, d, isCond);
  return d.arm + (b.body.reduce((s, c) => s + cardH(c, d, isCond), 0) || d.h) + d.foot;
}

/**
 * Stacks the program under the start block, as it is drawn: blocks hang from
 * "al empezar", tapes indent their cards by the spine. With `gap`, a hole of
 * the dragged block's height opens there (the rest slide down).
 */
export function layoutProgram(p: Program, o: LayoutOptions = {}): Layout {
  const d = o.dims ?? DIMS;
  const isCond = o.isCond ?? (() => false);
  const items: Placed[] = [{ key: 'start', kind: 'start', x: 0, y: 0, w: d.w, h: d.start }];
  const seen = new Map<string, number>();
  const keyOf = (base: string) => {
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}#${n}`;
  };
  const gapH = o.gapBlock ? blockHeight(o.gapBlock, d, isCond) : d.h;
  const gapW = o.gapBlock?.t === 'loop' || (o.gapBlock?.t === 'cmd' && isCond(o.gapBlock.cmd)) ? d.cw : d.w;
  const gapAt = (s: Slot) => !!o.gap && sameSlot(o.gap, s);
  let y = d.start;
  let width = d.cw;

  p.forEach((it, i) => {
    if (gapAt({ at: i })) {
      items.push({ key: 'gap', kind: 'gap', x: 0, y, w: gapW, h: gapH, slot: { at: i } });
      y += gapH;
    }
    if (it.t === 'cmd') {
      const cond = isCond(it.cmd);
      const h = cond ? d.arm + d.condMouth + d.foot : d.h;
      items.push({ key: keyOf(`c-${it.cmd}`), kind: 'cmd', x: 0, y, w: cond ? d.cw : d.w, h, ref: { item: i }, cmd: it.cmd, ...(cond ? { mouth: d.condMouth } : {}) });
      y += h;
      return;
    }
    const tapeKey = keyOf('loop');
    const tape: Placed = { key: tapeKey, kind: 'loop', x: 0, y, w: d.cw, h: 0, ref: { item: i }, count: it.count, mouth: 0, arm: d.arm };
    items.push(tape);
    let iy = y + d.arm;
    let innerW = d.w;
    const inner = new Map<string, number>();
    const showEnd = o.activeTape === i;
    it.body.forEach((cmd, j) => {
      if (gapAt({ tape: i, at: j })) {
        items.push({ key: `${tapeKey}/gap`, kind: 'gap', x: d.spine, y: iy, w: gapW, h: gapH, slot: { tape: i, at: j } });
        iy += gapH;
        innerW = Math.max(innerW, gapW);
      }
      const n = inner.get(cmd) ?? 0;
      inner.set(cmd, n + 1);
      const cond = isCond(cmd);
      const h = cardH(cmd, d, isCond);
      const w = cond ? d.cw : d.w;
      items.push({ key: `${tapeKey}/c-${cmd}#${n}`, kind: 'cmd', x: d.spine, y: iy, w, h, ref: { item: i, inner: j }, cmd, ...(cond ? { mouth: d.condMouth } : {}) });
      iy += h;
      innerW = Math.max(innerW, w);
    });
    const endGap = gapAt({ tape: i, at: it.body.length });
    if (endGap || !it.body.length || showEnd) {
      // an empty mouth always shows where cards go; a gap there takes its place
      const h = endGap ? gapH : d.h;
      items.push({
        key: `${tapeKey}/slot`, kind: endGap ? 'gap' : 'slot', x: d.spine, y: iy, w: endGap ? gapW : d.w, h,
        slot: { tape: i, at: it.body.length }, active: showEnd,
      });
      iy += h;
      if (endGap) innerW = Math.max(innerW, gapW);
    }
    // a tape is always wider than what it holds
    tape.w = Math.max(d.cw, d.spine + innerW + 16);
    tape.mouth = iy - (y + d.arm);
    tape.h = d.arm + tape.mouth + d.foot;
    y += tape.h;
    width = Math.max(width, tape.w);
  });

  const endGap = gapAt({ at: p.length });
  const free = o.emptySlots ?? (o.endSlot ? 1 : 0);
  if (endGap) {
    items.push({ key: 'end-gap', kind: 'gap', x: 0, y, w: gapW, h: gapH, slot: { at: p.length } });
    y += gapH;
  }
  // a gap takes one of the free lines: the notebook never grows while dragging
  for (let n = endGap ? 1 : 0; n < free; n++) {
    items.push({ key: `end${n}`, kind: 'slot', x: 0, y, w: d.w, h: d.h, slot: { at: p.length }, active: n === 0 });
    y += d.h;
  }
  return { items, height: y, width };
}

/**
 * The gap a block dragged to (x, y) — canvas coordinates of a layout made
 * *without* a gap — falls into. Only height decides: over the upper half of
 * a block it goes before it; inside a tape's mouth a card goes among the
 * tape's cards; a tape never goes inside another.
 */
export function slotAt(layout: Layout, y: number, block: Block): Slot {
  const top = layout.items.filter((it) => (it.kind === 'cmd' || it.kind === 'loop') && it.ref && it.ref.inner == null);
  for (const it of top) {
    if (it.kind === 'loop' && block.t === 'cmd') {
      const i = it.ref!.item;
      const arm = it.arm ?? 0;
      const armMid = it.y + arm / 2;
      const footMid = it.y + arm + (it.mouth ?? 0) + (it.h - arm - (it.mouth ?? 0)) / 2;
      if (y < armMid) return { at: i };
      if (y < footMid) {
        const inner = layout.items.filter((c) => c.kind === 'cmd' && c.ref?.item === i && c.ref.inner != null);
        for (const c of inner) if (y < c.y + c.h / 2) return { tape: i, at: c.ref!.inner! };
        return { tape: i, at: inner.length };
      }
      continue;
    }
    if (y < it.y + it.h / 2) return { at: it.ref!.item };
  }
  return { at: top.length };
}

// ------------------------------------------------------------------ drops

export type DragSource = { from: 'palette'; block: Block } | { from: 'program'; ref: BlockRef; block: Block };
/** Where the pointer was released. */
export type DropZone = 'program' | 'palette' | 'stage' | 'bar' | 'outside';

/** What a release does to the program. */
export interface DropResult {
  program: Program | null;
  outcome: 'add' | 'move' | 'remove' | 'cancel' | 'rejected' | 'noop';
  /** Why a drop was rejected (the notebook is full, a loop inside a loop). */
  reason?: 'nested' | 'full' | 'bad_slot';
}

/**
 * Decides a release. `slot` is the gap under the pointer (in the program
 * without the moving block), or null when not over the program.
 * Palette → program adds; program → program reorders; program → elsewhere
 * deletes; palette → elsewhere does nothing.
 */
export function resolveDrop(p: Program, src: DragSource, slot: Slot | null, opts: { maxCards?: number } = {}): DropResult {
  if (src.from === 'palette') {
    if (!slot) return { program: null, outcome: 'cancel' };
    const why = refusal(p, slot, src.block, { maxCards: opts.maxCards });
    if (why) return { program: null, outcome: 'rejected', reason: why };
    return { program: insertAt(p, slot, src.block), outcome: 'add' };
  }
  const { program: base } = removeAt(p, src.ref);
  if (!slot) return { program: base, outcome: 'remove' };
  if (sameSlot(slot, homeSlot(src.ref))) return { program: null, outcome: 'noop' };
  const why = refusal(base, slot, src.block, { moving: true });
  if (why) return { program: null, outcome: 'rejected', reason: why };
  return { program: insertAt(base, slot, src.block), outcome: 'move' };
}
