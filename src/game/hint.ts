// Help for programs with loops (1ro, 2do): the one next thing the ghost hand
// shows, found by comparing the child's program with the level's reference
// solution. Pure, so it is tested without a screen.

import { solvesAll } from './engine';
import type { Block, BlockRef, Slot } from './editor';
import { cardCount, type Board, type Program } from './model';

/** The counts a tape cycles through when its number is tapped. */
export const COUNT_MIN = 2;
export const COUNT_MAX = 10;
export const nextCount = (n: number) => (n >= COUNT_MAX ? COUNT_MIN : n + 1);
/** Taps on the count to go from `from` to `to` (it wraps from 10 back to 2). */
export const countTaps = (from: number, to: number) => {
  const span = COUNT_MAX - COUNT_MIN + 1;
  return (((to - from) % span) + span) % span;
};

export type Hint =
  /** The program already works: press ▶. */
  | { kind: 'run' }
  /** Bring this block from the palette to this gap. */
  | { kind: 'add'; block: Block; slot: Slot }
  /** Take this block out of the notebook. */
  | { kind: 'remove'; ref: BlockRef }
  /** Tap the count of tape `item` this many times. */
  | { kind: 'count'; item: number; taps: number };

const emptyLike = (b: Block): Block => (b.t === 'loop' ? { t: 'loop', count: b.count === 'goal' ? 'goal' : COUNT_MIN, body: [] } : b);

/** The first place where `program` leaves `solution`, as the gesture that fixes it. */
function divergence(program: Program, solution: Program): Hint {
  const n = Math.max(program.length, solution.length);
  for (let i = 0; i < n; i++) {
    const a = program[i], b = solution[i];
    if (!a) return { kind: 'add', block: emptyLike(b), slot: { at: i } };
    if (!b) return { kind: 'remove', ref: { item: i } };
    if (a.t === 'cmd' && b.t === 'cmd') {
      if (a.cmd === b.cmd) continue;
      // something is missing before a card that is right further on: it goes in here
      const later = solution[i + 1];
      if (program.length < solution.length && later?.t === 'cmd' && later.cmd === a.cmd) return { kind: 'add', block: b, slot: { at: i } };
      return { kind: 'remove', ref: { item: i } };
    }
    // a repeat is missing here: it goes in before what the child has
    if (a.t === 'cmd' && b.t === 'loop') return { kind: 'add', block: emptyLike(b), slot: { at: i } };
    if (a.t === 'loop' && b.t === 'cmd') return { kind: 'remove', ref: { item: i } };
    if (a.t !== 'loop' || b.t !== 'loop') continue;
    if ((a.count === 'goal') !== (b.count === 'goal')) return { kind: 'remove', ref: { item: i } };
    const m = Math.max(a.body.length, b.body.length);
    for (let j = 0; j < m; j++) {
      const x = a.body[j], y = b.body[j];
      if (x == null) return { kind: 'add', block: { t: 'cmd', cmd: y }, slot: { tape: i, at: j } };
      if (x === y) continue;
      if (y != null && a.body.length < b.body.length && b.body[j + 1] === x) return { kind: 'add', block: { t: 'cmd', cmd: y }, slot: { tape: i, at: j } };
      return { kind: 'remove', ref: { item: i, inner: j } };
    }
    if (a.count !== 'goal' && b.count !== 'goal' && a.count !== b.count) {
      return { kind: 'count', item: i, taps: countTaps(a.count, b.count) };
    }
  }
  return { kind: 'run' };
}

/**
 * What the ghost hand shows next. A program that already wins everywhere is
 * run; otherwise the first difference with the reference solution is fixed.
 * On a full notebook an extra card has to leave before another can come in.
 */
export function nextHint(worlds: readonly Board[], program: Program, solution: Program, slots?: number): Hint {
  if (program.length && solvesAll(worlds, program)) return { kind: 'run' };
  const h = divergence(program, solution);
  if (h.kind === 'add' && h.block.t === 'cmd' && slots != null && cardCount(program) >= slots) {
    return { kind: 'remove', ref: lastExtraCard(program, solution) };
  }
  return h;
}

/** The card to take out first on a full notebook: the last one past the solution, or else the last card. */
function lastExtraCard(program: Program, solution: Program): BlockRef {
  for (let i = program.length - 1; i >= 0; i--) {
    const it = program[i];
    if (it.t === 'cmd' && i >= solution.length) return { item: i };
  }
  for (let i = program.length - 1; i >= 0; i--) {
    const it = program[i];
    if (it.t === 'cmd') return { item: i };
    if (it.body.length) return { item: i, inner: it.body.length - 1 };
  }
  return { item: 0 };
}
