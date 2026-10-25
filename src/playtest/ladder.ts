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
//
// T39, 4to's long ladder (`long` on the state, set by startLadder for 4to;
// every other grade keeps the rules above, unchanged): up to MAX_ITEMS_LONG
// items, up to rung 18 (six new rungs, 13–18, built on the Game Workshop's
// blocks: ladderVm.ts), and a second item per rung from 7 (`variant` 1): a
// first item not passed gets the rung's second item before the ladder steps
// down or stops; the second item's result is the rung's. The floor check
// and the ceiling are the same rules. C04: CAPS_LONG's time fields are the
// same 8/9 minutes as every other grade (MAX_MS/HARD_MS) — only the item
// count stays higher (18), since the Copa now needs the rest of the class.

import type { LevelStats } from './PlaytestLevel';
import { LADDER_ITEMS, LADDER_VARIANT_ITEMS } from './ladderItems';
import { VM_ITEMS, VM_VARIANT_ITEMS } from './ladderVm';

export interface Rung {
  rung: number;
  /** The concept the rung measures (docs/prueba-piloto-datos.md, `ladder_step.concept`). */
  concept: string;
  /** The page played (curriculum/primer.ts or game/levels.ts; rungs 13–18: ladderVm.ts). */
  item: string;
  /** T39: the rung's second item (rungs 7–18), played by the long ladder after a first item not passed. */
  variant?: string;
  /** T39: a level page (`grid`: PlaytestLevel) or a Workshop-blocks item (`vm`: LadderVmItem). */
  engine: 'grid' | 'vm';
}

const CONCEPTS = [
  'sequence', 'long_sequence', 'fix', 'predict', 'repeat', 'repeat_count',
  'repeat_pattern', 'before_after_repeat', 'fog_si', 'three_worlds', 'events_rules', 'rules_score',
  // T39: 4to's long ladder, on the Workshop's blocks (ladderVm.ts)
  'events_predict', 'fix_rule', 'if_else', 'variables', 'broadcast', 'modify_make',
] as const;

/** The base bank's top rung (the round-2 pages): every grade but 4to stops here. */
export const TOP = LADDER_ITEMS.length;

/** The item bank, easiest first: round 2's own pages (ladderItems.ts), one per concept; T39: rungs 13–18 on the Workshop's blocks. */
export const LADDER: readonly Rung[] = CONCEPTS.map((concept, i) => {
  const rung = i + 1;
  const vm = i >= TOP;
  const item = vm ? VM_ITEMS[i - TOP].id : LADDER_ITEMS[i].id;
  const variant = vm ? VM_VARIANT_ITEMS[rung]?.id : LADDER_VARIANT_ITEMS[rung]?.id;
  return { rung, concept, item, ...(variant ? { variant } : {}), engine: vm ? 'vm' : 'grid' };
});

/** T39: the long ladder's top rung. */
export const TOP_LONG = LADDER.length;
/** T39: the grades with the long ladder. */
export const LONG_GRADES: readonly number[] = [4];

/** Round 1's bank (sheet and demo pages), kept for reading round 1's data: same rungs and concepts. */
export const LADDER_ROUND1: readonly string[] = [
  '1ro-h1-2', '1ro-h2-1', '1ro-h3-3', '1ro-h3-4', '1ro-h4-1', '1ro-h5-1', '1ro-h6-2', '1ro-h13-2', '2do-1', '2do-2', '3ro-1', '3ro-2',
];

export const rungOf = (n: number): Rung => LADDER[n - 1];
/** The item a rung plays: its first, or (T39) its second (`variant` 1). */
export const itemOf = (r: Rung, variant = 0): string => (variant && r.variant ? r.variant : r.item);

/** Where each grade (1–5) starts. */
export const ENTRY: Readonly<Record<number, number>> = { 1: 1, 2: 2, 3: 5, 4: 7, 5: 9 };
export const entryRung = (grade: number) => ENTRY[grade] ?? 1;

/**
 * The classroom round (T14): 8 items or 8 minutes (round 2: 10 / 12). The
 * ceiling is the pilot's most important number, and with the entry by
 * grade 8 items still let a child who keeps passing climb far (1ro from
 * rung 1 to 8, 3ro from 5 to the top); 8 minutes keep the ladder a short
 * part of a free class.
 */
export const MAX_ITEMS = 8;
export const MAX_MS = 8 * 60_000;
/** An item open when the ladder's time is over ends by then, whatever its own clock says. */
export const HARD_MS = 9 * 60_000;
/** An item not solved in this time (wall time: a hidden tab counts too) ends as a fail. */
export const ITEM_MS = 3 * 60_000;
/** An item with no input at all (no tap, no drag, no key) for this long ends as a fail. */
export const IDLE_MS = 90_000;

export interface Caps { itemMs: number; idleMs: number; ladderMs: number; hardMs: number }
export const CAPS: Caps = { itemMs: ITEM_MS, idleMs: IDLE_MS, ladderMs: MAX_MS, hardMs: HARD_MS };
/** `?caps=fast` (scripted checks, a quick look): the same rules in seconds. */
export const FAST_CAPS: Caps = { itemMs: 30_000, idleMs: 12_000, ladderMs: 60_000, hardMs: 70_000 };
/**
 * C04: the 4to class's first half (2026-10-20) found the 15-minute ladder
 * too long for a 40-minute class with the Copa after it; capped at the same
 * 8 minutes as every other grade (MAX_MS/HARD_MS), keeping the item-count
 * cap (18) and every per-item/floor/ceiling rule unchanged.
 */
export const MAX_ITEMS_LONG = 18;
export const CAPS_LONG: Caps = { itemMs: ITEM_MS, idleMs: IDLE_MS, ladderMs: MAX_MS, hardMs: HARD_MS };
export const FAST_CAPS_LONG: Caps = { itemMs: 30_000, idleMs: 12_000, ladderMs: FAST_CAPS.ladderMs, hardMs: FAST_CAPS.hardMs };
export const capsFrom = (search: string, long = false): Caps => (/[?&]caps=fast\b/.test(search) ? (long ? FAST_CAPS_LONG : FAST_CAPS) : long ? CAPS_LONG : CAPS);
/** Failed runs (levels.ts `isFailedRun`) that end an item. */
export const FAILED_RUNS = 2;

export type ItemResult = 'pass' | 'fail';
/** `climb`: a step of the way up (the entry included); `floor`: the one easier item after the first non-pass. */
export type Check = 'climb' | 'floor';
/** `wrap_up`: el docente's "quedan 5 minutos" (T14) ended the ladder after the item on screen. */
export type StopReason = 'top' | 'ceiling' | 'floor' | 'bottom' | 'max_items' | 'max_time' | 'wrap_up';
/**
 * Why an item ended as a fail (`level_end.end_reason`, `ladder_step.end_reason`):
 * two failed runs; a failed run after the solution hint or after an adult's
 * help; the item's time; no input at all; the ladder's own time.
 */
export type EndReason = 'runs' | 'solution_hint' | 'adult' | 'time_cap' | 'idle_cap' | 'ladder_time';

export interface Attempt {
  rung: number;
  check: Check;
  result: ItemResult;
  /** T39: the rung's second item (absent: its first). */
  variant?: 1;
}

export interface LadderState {
  entry: number;
  startedAt: number;
  items: Attempt[];
  /** T39: 4to's long ladder (MAX_ITEMS_LONG, rungs up to TOP_LONG, a second item per rung). */
  long?: boolean;
}

export type Decision = { rung: number; check: Check; variant?: 1 } | { stop: StopReason };

export function startLadder(grade: number, now: number): LadderState {
  return { entry: entryRung(grade), startedAt: now, items: [], ...(LONG_GRADES.includes(grade) ? { long: true } : {}) };
}

const maxItemsOf = (s: LadderState) => (s.long ? MAX_ITEMS_LONG : MAX_ITEMS);
const topOf = (s: LadderState) => (s.long ? TOP_LONG : TOP);

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
  if (s.items.length >= maxItemsOf(s)) return { stop: 'max_items' };
  if (now - s.startedAt >= caps.ladderMs) return { stop: 'max_time' };
  if (last.result === 'pass') return last.rung >= topOf(s) ? { stop: 'top' } : { rung: last.rung + 1, check: 'climb' };
  // T39: the long ladder's second chance on the same rung, a different item
  if (s.long && !last.variant && rungOf(last.rung)?.variant) return { rung: last.rung, check: 'climb', variant: 1 };
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
