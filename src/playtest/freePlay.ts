// Free play (10–15 min): what each grade's drawn menu offers, as data. The
// child picks freely; every pick, every page and the time in each activity
// are logged (FreePlay.tsx). Activities reuse the year's screens with the
// session's own progress: a whole sheet of 1ro with its three doors and its
// boss, the music recess, the guardas, the workshop (make a level, pin it,
// play the corkboard), and for 3ro–5to the rule game. The 4to and 5to probes
// (T7 "Hacé tu juego", T8 "Del bloque al texto") get a card only once their
// component is in PROBES (probes.ts).

import { sheetByN } from '../curriculum/primer';

export type ActivityId = 'sheet' | 'recess' | 'guardas' | 'editor' | 'rule_game' | 'game_maker' | 'text_probe';
export type ProbeId = Extract<ActivityId, 'game_maker' | 'text_probe'>;

/** How an activity is played: a sheet of 1ro's year (its pages move by the hash), the rule game's pages, or a probe's component. */
export type ActivityKind = { sheet: number } | { rules: true } | { probe: ProbeId };

export interface Activity {
  id: ActivityId;
  kind: ActivityKind;
  /** Said when the menu opens, and when the card is held (es-AR). */
  say: string;
  /** The small caption under the picture (the child does not need to read it). */
  caption: string;
}

/** The sheet with doors and boss for each grade: the staircase for 1ro, the zigzag for 2do, steps before and after a repeat for 3ro. */
export const SHEET_FOR: Record<number, number> = { 1: 6, 2: 8, 3: 13 };
/** The workshop: the free one for 1ro–3ro; the one with few lines (the level must need a repeat) for 4to and 5to. */
export const WORKSHOP_FOR: Record<number, number> = { 1: 7, 2: 7, 3: 7, 4: 15, 5: 15 };
/** The music recess and the guardas (sheets 9 and 14). */
export const RECESS_SHEET = 9;
export const GUARDAS_SHEET = 14;

/** What each grade's menu shows, in order (a probe only when it is registered). */
export const MENU: Record<number, readonly ActivityId[]> = {
  1: ['sheet', 'recess', 'guardas', 'editor'],
  2: ['sheet', 'recess', 'guardas', 'editor'],
  3: ['rule_game', 'sheet', 'recess', 'editor'],
  4: ['rule_game', 'editor', 'recess', 'game_maker'],
  5: ['rule_game', 'editor', 'recess', 'text_probe'],
};

const title = (n: number) => sheetByN(n)?.title ?? '';

export function activityFor(id: ActivityId, grade: number): Activity | null {
  switch (id) {
    case 'sheet': {
      const n = SHEET_FOR[grade];
      if (!n) return null;
      return { id, kind: { sheet: n }, say: `${title(n)}: una hoja con puertas y un desafío.`, caption: title(n) };
    }
    case 'recess': return { id, kind: { sheet: RECESS_SHEET }, say: 'La música: armá canciones en el xilofón.', caption: 'La música' };
    case 'guardas': return { id, kind: { sheet: GUARDAS_SHEET }, say: 'Las guardas: pintá dibujos que se repiten.', caption: 'Las guardas' };
    case 'editor': return { id, kind: { sheet: WORKSHOP_FOR[grade] ?? 7 }, say: 'El taller: armá un nivel y jugá los de tus compañeros.', caption: 'El taller' };
    case 'rule_game': return { id, kind: { rules: true }, say: 'El juego de reglas: armá tu propio juego.', caption: 'Juego de reglas' };
    case 'game_maker': return { id, kind: { probe: id }, say: 'Hacé tu juego.', caption: 'Hacé tu juego' };
    case 'text_probe': return { id, kind: { probe: id }, say: 'Del bloque al texto.', caption: 'Bloques y texto' };
    default: return null;
  }
}

/** The menu of a grade: its activities, a probe only when `hasProbe` says its component is there. */
export function menuFor(grade: number, hasProbe: (id: ProbeId) => boolean): Activity[] {
  return (MENU[grade] ?? MENU[1])
    .map((id) => activityFor(id, grade))
    .filter((a): a is Activity => !!a && (!('probe' in a.kind) || hasProbe(a.kind.probe)));
}

/** Said when the menu opens (then each card's name), and when the child comes back to it. */
export const MENU_LINES = {
  first: '¿A qué querés jugar? Tocá un dibujo.',
  again: 'Elegí otro juego, o el mismo otra vez.',
  /** The time for free play is over: after the page the child was on. */
  over: '¡Ahora vamos a otro juego!',
};

// ------------------------------------------------------------------ the time

/** The planned time for free play (grade-independent): when it runs out, the next step comes after the page on screen. */
export const FREE_PLAY_BUDGET_MS = 12 * 60_000;
/** A page that is not a level (the doors, the editor, the corkboard): once the time is over, it gets this long before moving on. */
export const FREE_PLAY_GRACE_MS = 2 * 60_000;

/** `?libre=<minutes>` in the URL sets the budget (1–30 minutes), e.g. for a short class; otherwise the default. */
export function budgetFrom(search: string): number {
  const m = /[?&]libre=(\d+(?:\.\d+)?)/.exec(search);
  const min = m ? Number(m[1]) : NaN;
  return Number.isFinite(min) && min > 0 && min <= 30 ? Math.round(min * 60_000) : FREE_PLAY_BUDGET_MS;
}

/**
 * What to do about the time: `wait` (keep playing), `now` (move on at once:
 * the menu is on screen, or a page that is not a level has had its grace),
 * or `after_level` (a level is open: move on when it ends, never cutting it).
 */
export function budgetVerdict(o: { now: number; startedAt: number; budget: number; onMenu: boolean; levelOpen: boolean; dueSince: number | null }): 'wait' | 'now' | 'after_level' {
  if (o.now - o.startedAt < o.budget) return 'wait';
  if (o.onMenu) return 'now';
  if (o.levelOpen) return 'after_level';
  const since = o.dueSince ?? o.now;
  return o.now - since >= FREE_PLAY_GRACE_MS ? 'now' : 'after_level';
}
