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
// - At most MAX_ITEMS items or MAX_MS: then stop (checked between items);
//   an item open at MAX_MS still ends by HARD_MS (its own cap, `ladder_time`).
// - An item ends as a fail on its own caps (itemVerdict, with a reason).
// The ceiling is the highest rung passed (v_ladder_ceiling /
// v_session_summary.ladder_ceiling_rung read the same from `ladder_step`).

import type { LevelStats } from './PlaytestLevel';
import { LADDER_ITEMS } from './ladderItems';

export interface Rung {
  rung: number;
  /** The concept the rung measures (docs/prueba-piloto-datos.md, `ladder_step.concept`). */
  concept: string;
  /** The page played (curriculum/primer.ts or game/levels.ts). */
  item: string;
}

const CONCEPTS = [
  'sequence', 'long_sequence', 'fix', 'predict', 'repeat', 'repeat_count',
  'repeat_pattern', 'before_after_repeat', 'fog_si', 'three_worlds', 'events_rules', 'rules_score',
] as const;

/** The item bank, easiest first: round 2's own pages (ladderItems.ts), one per concept. */
export const LADDER: readonly Rung[] = CONCEPTS.map((concept, i) => ({ rung: i + 1, concept, item: LADDER_ITEMS[i].id }));

/** Round 1's bank (sheet and demo pages), kept for reading round 1's data: same rungs and concepts. */
export const LADDER_ROUND1: readonly string[] = [
  '1ro-h1-2', '1ro-h2-1', '1ro-h3-3', '1ro-h3-4', '1ro-h4-1', '1ro-h5-1', '1ro-h6-2', '1ro-h13-2', '2do-1', '2do-2', '3ro-1', '3ro-2',
];

export const TOP = LADDER.length;
export const rungOf = (n: number): Rung => LADDER[n - 1];

/** Where each grade (1–5) starts. */
export const ENTRY: Readonly<Record<number, number>> = { 1: 1, 2: 2, 3: 5, 4: 7, 5: 9 };
export const entryRung = (grade: number) => ENTRY[grade] ?? 1;

export const MAX_ITEMS = 10;
export const MAX_MS = 12 * 60_000;
/** An item open when the ladder's time is over ends by then, whatever its own clock says. */
export const HARD_MS = 13 * 60_000;
/** An item not solved in this time (wall time: a hidden tab counts too) ends as a fail. */
export const ITEM_MS = 3 * 60_000;
/** An item with no input at all (no tap, no drag, no key) for this long ends as a fail. */
export const IDLE_MS = 90_000;

export interface Caps { itemMs: number; idleMs: number; ladderMs: number; hardMs: number }
export const CAPS: Caps = { itemMs: ITEM_MS, idleMs: IDLE_MS, ladderMs: MAX_MS, hardMs: HARD_MS };
/** `?caps=fast` (scripted checks, a quick look): the same rules in seconds. */
export const FAST_CAPS: Caps = { itemMs: 30_000, idleMs: 12_000, ladderMs: 60_000, hardMs: 70_000 };
export const capsFrom = (search: string): Caps => (/[?&]caps=fast\b/.test(search) ? FAST_CAPS : CAPS);
/** Failed runs (levels.ts `isFailedRun`) that end an item. */
export const FAILED_RUNS = 2;

export type ItemResult = 'pass' | 'fail';
/** `climb`: a step of the way up (the entry included); `floor`: the one easier item after the first non-pass. */
export type Check = 'climb' | 'floor';
export type StopReason = 'top' | 'ceiling' | 'floor' | 'bottom' | 'max_items' | 'max_time';
/**
 * Why an item ended as a fail (`level_end.end_reason`, `ladder_step.end_reason`):
 * two failed runs; a failed run after the solution hint or after an adult's
 * help; the item's time; no input at all; the ladder's own time.
 */
export type EndReason = 'runs' | 'solution_hint' | 'adult' | 'time_cap' | 'idle_cap' | 'ladder_time';

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
export function decide(s: LadderState, now: number, caps: Caps = CAPS): Decision {
  const last = s.items[s.items.length - 1];
  if (!last) return firstItem(s);
  if (last.check === 'floor') return { stop: 'floor' };
  if (s.items.length >= MAX_ITEMS) return { stop: 'max_items' };
  if (now - s.startedAt >= caps.ladderMs) return { stop: 'max_time' };
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
 * Ends an item as a fail, with the reason (PlaytestLevel's `watch`, after
 * every run, every help, every input, when the tab shows again and every few
 * seconds): two failed runs (`runs`); once the solution hint was shown or an
 * adult helped (the result is already a fail), the next failed run
 * (`solution_hint`, `adult`): one more try with that help, never an endless
 * page; the item's wall time (`time_cap`); no input at all for idleMs since
 * the page opened or the last input (`idle_cap`); the ladder's hard time
 * (`ladder_time`, from `ladderStart`). A solved page is never cut: the child
 * turns it (or it turns by itself).
 */
export function itemVerdict(stats: LevelStats, memo: ItemMemo, now: number, o: { caps?: Caps; ladderStart?: number } = {}): EndReason | null {
  const caps = o.caps ?? CAPS;
  if (stats.won || stats.lastResult === 'win') return null;
  if (stats.helpStep >= 3 || stats.adultHelped) {
    if (memo.failsAtHelp == null) memo.failsAtHelp = stats.fails;
    else if (stats.fails > memo.failsAtHelp) return stats.helpStep >= 3 ? 'solution_hint' : 'adult';
  }
  if (stats.fails >= FAILED_RUNS) return 'runs';
  if (o.ladderStart != null && now - o.ladderStart >= caps.hardMs) return 'ladder_time';
  if (now - stats.startedAt >= caps.itemMs) return 'time_cap';
  if (now - Math.max(stats.startedAt, stats.lastInputAt ?? 0) >= caps.idleMs) return 'idle_cap';
  return null;
}
