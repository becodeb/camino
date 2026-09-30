// The placement ladder's rules, pure (the screen is Ladder.tsx): a FIXED
// item bank of twelve rungs, one concept each, the same pages for every
// child so the data is comparable; where each grade enters; what counts as
// a pass; when an item ends; and where the ladder goes after each item.
//
// - Enter by grade (1ro rung 1, 2do 2, 3ro 5, 4to 7, 5to 9).
// - A pass goes up one rung (a pass on the top rung stops the ladder).
// - The first non-pass: if the rung below was not passed in this ladder, try
//   it once (the floor check) and stop whatever happens; if it was passed
//   (or there is none), stop.
// - At most MAX_ITEMS items or MAX_MS: then stop (checked between items).
// The ceiling is the highest rung passed (v_ladder_ceiling /
// v_session_summary.ladder_ceiling_rung read the same from `ladder_step`).

import type { LevelStats } from './PlaytestLevel';

export interface Rung {
  rung: number;
  /** The concept the rung measures (docs/prueba-piloto-datos.md, `ladder_step.concept`). */
  concept: string;
  /** The page played (curriculum/primer.ts or game/levels.ts). */
  item: string;
}

/** The item bank, easiest first. */
export const LADDER: readonly Rung[] = [
  { rung: 1, concept: 'sequence', item: '1ro-h1-2' },
  { rung: 2, concept: 'long_sequence', item: '1ro-h2-1' },
  { rung: 3, concept: 'fix', item: '1ro-h3-3' },
  { rung: 4, concept: 'predict', item: '1ro-h3-4' },
  { rung: 5, concept: 'repeat', item: '1ro-h4-1' },
  { rung: 6, concept: 'repeat_count', item: '1ro-h5-1' },
  { rung: 7, concept: 'repeat_pattern', item: '1ro-h6-2' },
  { rung: 8, concept: 'before_after_repeat', item: '1ro-h13-2' },
  { rung: 9, concept: 'fog_si', item: '2do-1' },
  { rung: 10, concept: 'three_worlds', item: '2do-2' },
  { rung: 11, concept: 'events_rules', item: '3ro-1' },
  { rung: 12, concept: 'rules_score', item: '3ro-2' },
];

export const TOP = LADDER.length;
export const rungOf = (n: number): Rung => LADDER[n - 1];

/** Where each grade (1–5) starts. */
export const ENTRY: Readonly<Record<number, number>> = { 1: 1, 2: 2, 3: 5, 4: 7, 5: 9 };
export const entryRung = (grade: number) => ENTRY[grade] ?? 1;

export const MAX_ITEMS = 10;
export const MAX_MS = 12 * 60_000;
/** An item not solved in this time ends as a fail. */
export const ITEM_MS = 3 * 60_000;
/** Failed runs (levels.ts `isFailedRun`) that end an item. */
export const FAILED_RUNS = 2;

export type ItemResult = 'pass' | 'fail';
/** `climb`: a step of the way up (the entry included); `floor`: the one easier item after the first non-pass. */
export type Check = 'climb' | 'floor';
export type StopReason = 'top' | 'ceiling' | 'floor' | 'bottom' | 'max_items' | 'max_time';

export interface Attempt { rung: number; check: Check; result: ItemResult }

export interface LadderState {
  entry: number;
  startedAt: number;
  items: Attempt[];
}

export type Decision = { rung: number; check: Check } | { stop: StopReason };

export function startLadder(grade: number, now: number): LadderState {
  return { entry: entryRung(grade), startedAt: now, items: [] };
}

export const firstItem = (s: LadderState): Decision => ({ rung: s.entry, check: 'climb' });

export const record = (s: LadderState, a: Attempt): LadderState => ({ ...s, items: [...s.items, a] });

/** A pass: solved, the solution hint (help step 3) never shown, no adult help while it was open. */
export function itemResult(end: { outcome: string; help_levels: number; adult_helped: boolean }): ItemResult {
  return end.outcome === 'win' && end.help_levels < 3 && !end.adult_helped ? 'pass' : 'fail';
}

const passed = (s: LadderState, rung: number) => s.items.some((a) => a.rung === rung && a.result === 'pass');

/** Where the ladder goes after its last item (`now`: for the time cap). */
export function decide(s: LadderState, now: number): Decision {
  const last = s.items[s.items.length - 1];
  if (!last) return firstItem(s);
  if (last.check === 'floor') return { stop: 'floor' };
  if (s.items.length >= MAX_ITEMS) return { stop: 'max_items' };
  if (now - s.startedAt >= MAX_MS) return { stop: 'max_time' };
  if (last.result === 'pass') return last.rung >= TOP ? { stop: 'top' } : { rung: last.rung + 1, check: 'climb' };
  const below = last.rung - 1;
  if (below < 1) return { stop: 'bottom' };
  if (passed(s, below)) return { stop: 'ceiling' };
  return { rung: below, check: 'floor' };
}

/** The highest rung passed, or null. */
export function ceiling(s: LadderState): number | null {
  const ok = s.items.filter((a) => a.result === 'pass').map((a) => a.rung);
  return ok.length ? Math.max(...ok) : null;
}

/** What an item's watch remembers between calls: the failed runs when help changed its result. */
export interface ItemMemo { failsAtHelp: number | null }
export const newItemMemo = (): ItemMemo => ({ failsAtHelp: null });

/**
 * Ends an item as a fail (PlaytestLevel's `watch`, after every run, every
 * help and every few seconds): two failed runs; ITEM_MS without solving it;
 * or, once the solution hint was shown or an adult helped (the result is
 * already a fail), the next failed run: the child gets one more try with
 * that help, never an endless page. A solved page is never cut: the child
 * turns it.
 */
export function itemVerdict(stats: LevelStats, memo: ItemMemo, now: number): 'fail' | null {
  if (stats.won || stats.lastResult === 'win') return null;
  if (stats.fails >= FAILED_RUNS) return 'fail';
  if (now - stats.startedAt >= ITEM_MS) return 'fail';
  if (stats.helpStep >= 3 || stats.adultHelped) {
    if (memo.failsAtHelp == null) memo.failsAtHelp = stats.fails;
    else if (stats.fails > memo.failsAtHelp) return 'fail';
  }
  return null;
}
