// 1ro's practice formats as pure functions (see levels.Format): what a page's
// notebook starts with, what is pinned on it, where Brote ends on a predict
// page, how two programs of the same shape differ (a fix page's one mistake),
// and the gold-stamp challenge of a page. The level screen, the curriculum and
// the tests share them.

import { simulate } from './engine';
import { refKey, type BlockRef } from './editor';
import { isHole, type Board, type Cell, type Dir, type Program } from './model';
import type { Format, LevelDef } from './levels';

export const formatOf = (l: Pick<LevelDef, 'format'>): Format => l.format ?? 'solve';

/** The palette's order of the arrows. */
export const ARROW_ORDER: readonly Dir[] = ['left', 'up', 'down', 'right'];
/** The arrows some programs use, in the palette's order. */
export const arrowsIn = (...ps: Program[]): Dir[] =>
  ARROW_ORDER.filter((d) => ps.some((p) => p.some((it) => (it.t === 'cmd' ? it.cmd === d : it.body.includes(d)))));
export const hasLoop = (p: Program) => p.some((it) => it.t === 'loop');
/** The program has empty lines (a complete page with cards to bring). */
export const hasHoles = (p: Program) => p.some((it) => (it.t === 'cmd' ? isHole(it.cmd) : it.body.some(isHole)));

/** Pages whose lines stay in place: a block taken out leaves its line empty. */
export const hasFixedLines = (l: Pick<LevelDef, 'format'>) => formatOf(l) === 'complete' || formatOf(l) === 'fix';

/** What the notebook holds when the page opens, and again after ↺. */
export const startProgram = (l: LevelDef): Program => (formatOf(l) === 'solve' ? [] : structuredClone(l.given ?? []));

export interface Pins {
  /** Cards (refKeys). */
  cards: Set<string>;
  /** Counts of tapes (their item). */
  counts: Set<number>;
  /** Tapes (their item): the C-block itself. */
  tapes: Set<number>;
}

/**
 * A complete page: every card, tape and count already written is pinned to
 * the page (it does not move); the empty lines and the missing counts (0) are
 * the child's. Other formats pin nothing.
 */
export function pinsOf(l: LevelDef): Pins {
  const pins: Pins = { cards: new Set(), counts: new Set(), tapes: new Set() };
  if (formatOf(l) !== 'complete') return pins;
  (l.given ?? []).forEach((it, item) => {
    if (it.t === 'cmd') {
      if (!isHole(it.cmd)) pins.cards.add(refKey({ item }));
      return;
    }
    pins.tapes.add(item);
    it.body.forEach((c, inner) => { if (!isHole(c)) pins.cards.add(refKey({ item, inner })); });
    if (it.count !== 0) pins.counts.add(item);
  });
  return pins;
}

/** A predict board has no goal: Brote never "arrives", the child's ring is the only target. */
export const NO_GOAL: Cell = { c: -1, r: -1 };

/** Where a program leaves Brote (on a predict page, the cell to tap). */
export function endOf(b: Board, p: Program): Cell {
  const t = simulate(b, p);
  return { c: t.final.c, r: t.final.r };
}

/** The same items in the same places: tapes where tapes are, with as many lines each. */
export function sameShape(a: Program, b: Program): boolean {
  return a.length === b.length && a.every((x, i) => {
    const y = b[i];
    return x.t === y.t && (x.t === 'cmd' || (y.t === 'loop' && x.body.length === y.body.length));
  });
}

export type Diff =
  | { kind: 'line'; ref: BlockRef; from: string; to: string }
  | { kind: 'count'; item: number; from: number | 'goal'; to: number | 'goal' };

/** Where two programs of the same shape differ, line by line and count by count. */
export function differences(a: Program, b: Program): Diff[] {
  if (!sameShape(a, b)) throw new Error('programs of different shapes');
  const out: Diff[] = [];
  a.forEach((x, item) => {
    const y = b[item];
    if (x.t === 'cmd' && y.t === 'cmd') {
      if (x.cmd !== y.cmd) out.push({ kind: 'line', ref: { item }, from: x.cmd, to: y.cmd });
      return;
    }
    if (x.t !== 'loop' || y.t !== 'loop') return;
    x.body.forEach((c, inner) => { if (c !== y.body[inner]) out.push({ kind: 'line', ref: { item, inner }, from: c, to: y.body[inner] }); });
    if (x.count !== y.count) out.push({ kind: 'count', item, from: x.count, to: y.count });
  });
  return out;
}

/** Spoken on a gold-stamp challenge (es-AR). */
export const GOLD_SAY = 'Ahora, con menos renglones. Buscá lo que se repite y ahorrá bloques.';

/**
 * The gold-stamp challenge of a page as a page of its own: the same board, a
 * notebook with the fewest lines that can win, and "repetir" in the palette.
 * Null when the page has none.
 */
export function goldLevel(l: LevelDef): LevelDef | null {
  const s = l.save;
  if (!s) return null;
  return {
    ...l,
    id: `${l.id}-oro`,
    say: GOLD_SAY,
    format: 'solve',
    given: undefined,
    save: undefined,
    intro: undefined,
    slots: s.slots,
    solution: s.solution,
    blocks: s.blocks ?? [...l.blocks.filter((b) => b !== 'repeat'), 'repeat'],
  };
}
