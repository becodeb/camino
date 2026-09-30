// Three ready-made Progress values for the dev drawer's "Presentación" row: a
// teacher preparing a school demo taps one and lands on the forest map,
// instead of playing (or faking, page by page) the whole year by hand.
//
// Each preset is built from the real sheet data (curriculum/primer.ts) and
// the store's own pure transitions (curriculum/progress.ts) — never from a
// hand-typed list of level ids. The year can grow a sheet or a page and these
// presets keep meaning the same thing.
//
// - "Arranque": a fresh year (what clearing progress gives).
// - "Mitad de año": sheets 1 to 8 done (the first workshop included), the
//   teacher a couple of sheets ahead, and a peek at the gold seal before the
//   river actually introduces it.
// - "Año completo": the whole year done — both workshops, the comodín, every
//   gold seal, the wardrobe open — with the showcase's favourites left empty
//   for the presenter to pick live in front of the family.

import { EXAMPLES } from './classmates';
import { bossId, coreId, goalId, hasCore, type Sheet } from './model';
import { BOSS_REWARDS, ITEMS, SLOTS, rewardKey } from './motivation';
import { PRIMER } from './primer';
import {
  EMPTY, LAST_SHEET, chooseCharacter, earnGold, grant, markPreviewed, markSeen, openSheet,
  played, publish, reachGoal, setOutfit, setWardrobe, solve, type Progress,
} from './progress';
import { hasArrived, isUnlocked } from './rewards';
import { cardLevelId, defaultDraft, nextMadeId, type MadeLevel } from './workshop';

// ------------------------------------------------------------------ small, data-driven helpers

/** Every id of `s` (its core pages, its boss) whose level offers a gold "save blocks" challenge. */
function goldEligible(s: Sheet): string[] {
  const core = s.core.flatMap((c, i) => (c.level.save ? [coreId(s, i + 1)] : []));
  return s.boss?.save ? [...core, bossId(s)] : core;
}
/** Every gold-eligible id in the year, in sheet order (today, only sheet 11's and sheet 14's first page have one). */
const GOLD_ELIGIBLE: readonly string[] = PRIMER.filter(hasCore).flatMap(goldEligible);

/** `s`'s core pages and boss, solved. */
function solveSheet(p: Progress, s: Sheet): Progress {
  let out = p;
  for (let k = 1; k <= s.core.length; k++) out = solve(out, coreId(s, k));
  if (s.boss) out = solve(out, bossId(s));
  return out;
}

/** A plausible level for the demo: `workshop.ts`'s own untouched board (a straight 5-step path), proved with a repeat when the workshop is limited (its lines cannot fit the flat plan). */
function demoMadeLevel(sheet: Sheet, id: string): MadeLevel {
  const limited = !!sheet.workshop?.limited;
  const { board, lines } = defaultDraft(limited);
  return {
    id, sheet: sheet.n, board, lines,
    solution: limited
      ? [{ t: 'loop', count: 5, body: ['right'] }]
      : Array.from({ length: lines }, () => ({ t: 'cmd' as const, cmd: 'right' })),
  };
}

/** A level made and pinned on this device for `sheet`'s workshop (its own card solved, as the real editor does when it pins one), and one of that sheet's classmates' cards played. */
function runWorkshop(p: Progress, sheet: Sheet): Progress {
  const level = demoMadeLevel(sheet, nextMadeId(p));
  const withCard = solve(publish(p, level), cardLevelId(level.id));
  const classmate = EXAMPLES.find((e) => e.sheet === sheet.n);
  return classmate ? played(withCard, classmate.id) : withCard;
}

/** Wears the first `count` slots this progress already has an unlocked piece for (curriculum/rewards.ts owns "unlocked"), in the wardrobe's own order. */
function dressFirstUnlocked(p: Progress, count: number): Progress {
  let out = p;
  let dressed = 0;
  for (const slot of SLOTS) {
    if (dressed >= count) break;
    const item = ITEMS.find((i) => i.slot === slot && isUnlocked(i, out));
    if (item) { out = setOutfit(out, slot, item.id); dressed++; }
  }
  return out;
}

/** Every reward that has arrived (a boss just solved sends one), marked seen. */
const markArrivedSeen = (p: Progress): Progress => markSeen(p, BOSS_REWARDS.filter((r) => hasArrived(r, p)).map(rewardKey));

/** Every sheet's end-of-sheet preview marked shown, so the live demo never trips one by surprise. */
const markAllPreviewed = (p: Progress): Progress => PRIMER.filter((s) => s.preview).reduce((acc, s) => markPreviewed(acc, s.n), p);

// ------------------------------------------------------------------ the three demo states

/** "Arranque": a fresh year, exactly what clearing progress gives (sheet 1 opens on the character choice). */
export function presetStart(): Progress {
  return EMPTY;
}

/** "Mitad de año": sheets 1–8 done (the first workshop's level made and a classmate's played too), the teacher opened to sheet 10, a character dressed with two pieces, and a first gold seal. */
export function presetMidYear(): Progress {
  const midSheets = PRIMER.filter(hasCore).filter((sh) => sh.n <= 8);
  const midWorkshops = PRIMER.filter((sh) => sh.workshop && sh.n <= 8);
  let p = EMPTY;
  for (const s of midSheets) p = solveSheet(p, s);
  for (const s of midWorkshops) p = runWorkshop(p, s);
  p = openSheet(p, 10);
  p = chooseCharacter(p, 'mina');
  p = dressFirstUnlocked(p, 2);
  p = markArrivedSeen(p);
  p = markAllPreviewed(p);
  // gold only starts on sheet 11 in the real curriculum; stamp its first eligible page early so the
  // demo can show what a gold seal looks like before the class actually reaches the river.
  const [firstGold] = GOLD_ELIGIBLE;
  if (firstGold) p = earnGold(p, firstGold);
  return p;
}

/** "Año completo": every regular sheet's core and boss solved, both workshops and the comodín done, every gold seal earned, the wardrobe open; the showcase's favourites are left for the presenter to pick live. */
export function presetFullYear(): Progress {
  const regular = PRIMER.filter(hasCore);
  const workshops = PRIMER.filter((sh) => sh.workshop);
  const hub = PRIMER.find((sh) => sh.hub);
  let p = EMPTY;
  for (const s of regular) p = solveSheet(p, s);
  for (const s of workshops) p = runWorkshop(p, s);
  if (hub) p = reachGoal(p, goalId(hub, 'musica'));
  for (const id of GOLD_ELIGIBLE) p = earnGold(p, id);
  p = markArrivedSeen(p);
  p = markAllPreviewed(p);
  p = openSheet(p, LAST_SHEET);
  p = grant(p, 150 - p.seeds); // the showcase's round number, whatever the year's real page count happens to be
  p = chooseCharacter(p, 'mina');
  p = dressFirstUnlocked(p, 3);
  p = setWardrobe(p, true);
  return p;
}

// ------------------------------------------------------------------ the dev drawer's "Presentación" row

export type PresetId = 'start' | 'mid' | 'full';
export const PRESET_IDS: readonly PresetId[] = ['start', 'mid', 'full'];

export interface Preset {
  /** Spoken to the adult (es-AR), on the dev drawer's button. */
  label: string;
  build: () => Progress;
}

export const PRESETS: Readonly<Record<PresetId, Preset>> = {
  start: { label: 'Arranque', build: presetStart },
  mid: { label: 'Mitad de año', build: presetMidYear },
  full: { label: 'Año completo', build: presetFullYear },
};
