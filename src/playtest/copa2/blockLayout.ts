// Copa v2 garage (C12): where every block of a program sits, as a pure function.
// The notched puzzle blocks of the other levels (src/blocks) are absolutely
// placed on a canvas whose layout is computed in code; this is the same model
// for the kart's program, extended to what the Copa needs: C-shaped containers
// that nest (`repetir`, `si / si no`), the event hat, and a gap or an insertion
// marker that opens where a block is dragged or will be added.
//
// A script (the main one, or the event one) is one canvas. Everything is
// measured in canvas pixels from the canvas' top-left corner. The screen
// (CopaBlocks.tsx) only draws what this says, and Garage.tsx only asks it
// "which slot is under the pointer".

import type { Block, Sensor } from './program';
import type { Position } from './hints';
import { SENSORS } from './program';

/** One set of sizes: the program (FULL), the palette (PAL) and the faded "tu programa anterior" (MINI). */
export interface Metrics {
  /** A plain block's height (also what the notch is cut for). */
  h: number;
  /** A container's top arm (at least). */
  arm: number;
  spine: number;
  /** A container's right margin past its children. */
  pad: number;
  foot: number;
  /** The `si no` bar. */
  elseH: number;
  /** An empty branch's hole. */
  hole: number;
  /** The insertion marker's height. */
  caret: number;
  start: number;
  hat: number;
  /** A condition pill's height and the row gap between pills. */
  pill: number;
  /** The extra row of a `repetir` where `vueltas` can be picked (copa 5). */
  lapsRow: number;
  /** Words are smaller and the number buttons go away. */
  small: boolean;
}

export const FULL: Metrics = { h: 56, arm: 58, spine: 20, pad: 12, foot: 24, elseH: 44, hole: 46, caret: 40, start: 58, hat: 66, pill: 34, lapsRow: 44, small: false };
export const PAL: Metrics = { h: 46, arm: 48, spine: 14, pad: 8, foot: 16, elseH: 28, hole: 16, caret: 0, start: 0, hat: 0, pill: 28, lapsRow: 0, small: true };
export const MINI: Metrics = { h: 38, arm: 40, spine: 12, pad: 6, foot: 12, elseH: 26, hole: 22, caret: 0, start: 40, hat: 44, pill: 26, lapsRow: 0, small: true };

/** How wide a block is in the program: the canvas width. */
export const CANVAS_W = 344;
export const MINI_W = 232;
export const PAL_W = 118;
export const PAL_WIDE = 244;

/** The widths of the condition pills (icon + words), by sensor. Measured with the garage's font. */
export const PILL_W: Readonly<Record<Sensor, number>> = { puddle_ahead: 188, straight_ahead: 176, nitro_positive: 132 };
const PILL_W_MINI = 0.72;
/** The word `si` and its margin, and the `y` that joins two pills. */
export const SI_W = 40;
export const AND_W = 26;
const ROW_GAP = 6;

export type ItemKind = 'start' | 'hat' | 'cmd' | 'repeat' | 'if' | 'hole' | 'gap' | 'caret';

export interface Placed {
  key: string;
  kind: ItemKind;
  /** A block's (or the hat's) id. */
  id?: string;
  block?: Block;
  /** Where it is (its own index in its list). */
  pos?: Position;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  /** Containers: height of the top arm, then the mouth(s) and the `si no` bar. */
  arm?: number;
  mouth?: number;
  mouthB?: number;
  /** `si`: the pills of the arm, in rows. */
  rows?: Sensor[][];
  /** `repetir` on a track with laps: the arm has a second row for `vueltas`. */
  lapsRow?: boolean;
  /** Holes and gaps: the list they stand for. */
  slot?: Position;
}

/** A place a block can go: the line at height `y` (the middle of an empty branch's hole), inside the list that starts at `x` and is `w` wide. */
export interface Slot { pos: Position; x: number; y: number; w: number }

export interface Layout {
  items: Placed[];
  slots: Slot[];
  width: number;
  height: number;
}

export interface LayoutOpts {
  script: 'main' | 'event';
  width: number;
  metrics?: Metrics;
  /** The selected block: a `si` shows all the sensors it could look at. */
  selected?: string | null;
  /** The copa's sensors (a `si` shows them as pills to switch on and off). */
  sensors?: readonly Sensor[];
  /** The copa lets a `repetir` repeat `vueltas`. */
  laps?: boolean;
  /** The insertion marker (the editor's caret); null in read-only views. */
  caret?: Position | null;
  /** A hole of this height opens here (a block is being dragged over). */
  gap?: { pos: Position; h: number } | null;
  /** The event script: its hat's id (drawn on top of its blocks). */
  hatId?: string | null;
  /** The start block of the main script. */
  start?: boolean;
}

const same = (a: Position | null | undefined, b: Position): boolean =>
  !!a && a.script === b.script && a.index === b.index && a.path.length === b.path.length && a.path.every((s, i) => s.index === b.path[i].index && s.branch === b.path[i].branch);

/** Greedy rows of pills for a `si` arm of width `w`. Each pill after the first carries its `y`. */
export function pillRows(w: number, shown: readonly Sensor[], m: Metrics = FULL): Sensor[][] {
  const k = m.small ? PILL_W_MINI : 1;
  const usable = w - 2 * m.pad - SI_W * (m.small ? 0.8 : 1);
  const rows: Sensor[][] = [[]];
  let used = 0;
  shown.forEach((s, i) => {
    const need = PILL_W[s] * k + (i > 0 ? AND_W * k : 0);
    if (rows[rows.length - 1].length && used + need > usable) { rows.push([]); used = 0; }
    rows[rows.length - 1].push(s);
    used += need;
  });
  return rows;
}

/** The sensors a `si` shows: its own, or (selected) every one its copa offers, in the engine's order. */
export function shownSensors(b: Extract<Block, { kind: 'if' }>, selected: boolean, offered: readonly Sensor[]): Sensor[] {
  if (!selected) return SENSORS.filter((s) => b.cond.includes(s));
  return SENSORS.filter((s) => offered.includes(s) || b.cond.includes(s));
}

const armOf = (rows: number, m: Metrics) => Math.max(m.arm, 2 * 12 + rows * m.pill + (rows - 1) * ROW_GAP);

/** Lays one script out. */
export function layoutScript(blocks: readonly Block[], o: LayoutOpts): Layout {
  const m = o.metrics ?? FULL;
  const items: Placed[] = [];
  const slots: Slot[] = [];
  const offered = o.sensors ?? [];
  let n = 0;
  const key = (base: string) => `${base}${n++}`;
  let y = 0;
  if (o.start) { items.push({ key: 'start', kind: 'start', x: 0, y: 0, w: Math.min(o.width, 190), h: m.start, depth: 0 }); y = m.start; }
  if (o.hatId) { items.push({ key: 'hat', kind: 'hat', id: o.hatId, x: 0, y: 0, w: o.width, h: m.hat, depth: 0 }); y = m.hat; }

  /** Opens the slot at `pos` (and the gap or the marker there). Returns the new y and whether something took the place of an empty hole. */
  const open = (pos: Position, x: number, w: number, y0: number, empty: boolean, depth: number): { y: number; filled: boolean } => {
    const hole = empty ? m.hole : 0;
    slots.push({ pos, x, y: empty ? y0 + hole / 2 : y0, w });
    if (o.gap && same(o.gap.pos, pos)) {
      items.push({ key: 'gap', kind: 'gap', x, y: y0, w, h: o.gap.h, depth, slot: pos });
      return { y: y0 + o.gap.h, filled: true };
    }
    if (o.caret && same(o.caret, pos)) {
      items.push({ key: 'caret', kind: 'caret', x, y: y0, w, h: m.caret, depth, slot: pos });
      return { y: y0 + m.caret, filled: true };
    }
    return { y: y0, filled: false };
  };

  const list = (bs: readonly Block[], path: Position['path'], x: number, w: number, y0: number, depth: number): number => {
    let cy = y0;
    const at = (index: number): Position => ({ script: o.script, path: [...path], index });
    for (let i = 0; i < bs.length; i++) {
      cy = open(at(i), x, w, cy, false, depth).y;
      cy = block(bs[i], at(i), x, w, cy, depth);
    }
    const end = open(at(bs.length), x, w, cy, bs.length === 0, depth);
    cy = end.y;
    if (!bs.length && !end.filled) {
      items.push({ key: key('hole'), kind: 'hole', x, y: cy, w, h: m.hole, depth, slot: at(0) });
      cy += m.hole;
    }
    return cy;
  };

  const block = (b: Block, pos: Position, x: number, w: number, y0: number, depth: number): number => {
    if (b.kind === 'repeat') {
      const lapsRow = !!o.laps && m.lapsRow > 0;
      const arm = m.arm + (lapsRow ? m.lapsRow : 0);
      const item: Placed = { key: b.id, kind: 'repeat', id: b.id, block: b, pos, x, y: y0, w, h: 0, depth, arm, lapsRow };
      items.push(item);
      const inner = list(b.body, [...pos.path, { index: pos.index, branch: 'body' }], x + m.spine, w - m.spine - m.pad, y0 + arm, depth + 1);
      item.mouth = inner - (y0 + arm);
      item.h = arm + item.mouth + m.foot;
      return y0 + item.h;
    }
    if (b.kind === 'if') {
      const rows = pillRows(w, shownSensors(b, o.selected === b.id, offered), m);
      const arm = armOf(rows.length, m);
      const item: Placed = { key: b.id, kind: 'if', id: b.id, block: b, pos, x, y: y0, w, h: 0, depth, arm, rows };
      items.push(item);
      const cw = w - m.spine - m.pad;
      const a = list(b.then, [...pos.path, { index: pos.index, branch: 'then' }], x + m.spine, cw, y0 + arm, depth + 1);
      item.mouth = a - (y0 + arm);
      const bStart = a + m.elseH;
      const e = list(b.else, [...pos.path, { index: pos.index, branch: 'else' }], x + m.spine, cw, bStart, depth + 1);
      item.mouthB = e - bStart;
      item.h = e + m.foot - y0;
      return y0 + item.h;
    }
    items.push({ key: b.id, kind: 'cmd', id: b.id, block: b, pos, x, y: y0, w, h: m.h, depth });
    return y0 + m.h;
  };

  const end = list(blocks, [], 0, o.width, y, 0);
  return { items, slots, width: o.width, height: end + 8 };
}

/** The height a block takes with everything inside it, alone on a canvas (the gap that opens for it). */
export function heightOf(b: Block, o: Omit<LayoutOpts, 'script' | 'caret' | 'gap' | 'hatId' | 'start'>): number {
  const lay = layoutScript([b], { ...o, script: 'main', caret: null });
  return lay.items.filter((it) => it.depth === 0 && it.kind !== 'hole').reduce((s, it) => s + it.h, 0);
}

/**
 * The slot a block dragged to (px, py) falls into: the nearest line by height, a slot to the left of the pointer
 * (a container's body that starts further right) counting only when the pointer is past its spine. Of two lines at the
 * same height (the end of a body and the line after its container) the deeper one wins when the pointer is over it.
 */
export function pickSlot(slots: readonly Slot[], px: number, py: number): Slot | null {
  let best: Slot | null = null;
  let bestScore = Infinity;
  for (const s of slots) {
    let score = Math.abs(py - s.y);
    if (px < s.x) score += (s.x - px) * 1.4;
    else if (px > s.x + s.w) score += (px - s.x - s.w) * 0.6;
    score -= s.x * 0.001;
    if (score < bestScore) { bestScore = score; best = s; }
  }
  return best;
}

/** A pointer height seen in a layout that has a gap open (`gapAt`, `gapH`): the same point in the layout without it. */
export function withoutGap(py: number, gapAt: number, gapH: number): number {
  if (py >= gapAt + gapH) return py - gapH;
  if (py > gapAt) return gapAt;
  return py;
}
