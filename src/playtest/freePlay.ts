// Free play (10–15 min): what each grade's drawn menu offers, as data. The
// child picks freely; every pick, every page and the time in each activity
// are logged (FreePlay.tsx). Activities reuse the year's screens with the
// session's own progress: a whole sheet of 1ro with its three doors and its
// boss, the music recess, the guardas, the workshop (make a level, pin it,
// play the corkboard), and for 3ro–5to the rule game. The 4to and 5to probes
// (T7 "Hacé tu juego", T8 "Del bloque al texto") get a card only once their
// component is in PROBES (probes.ts). T33: "La carrera" (Race.tsx), a kart
// race against two critters built with arrow blocks, first on 1ro's and
// 2do's menus. T40: "El taller de juegos" (src/workshop/), the Scratch-like
// Game Workshop, first on 4to's and 5to's menus (T39 makes it 4to's
// mandatory step). T41: 4to's Arcade adds "Carrera de teclas" (TypingRace.tsx,
// the race driven by typing) and "Tu juego" (OwnGame.tsx, the child's own
// Workshop game) in front.

import { sheetByN } from '../curriculum/primer';

export type ActivityId = 'sheet' | 'recess' | 'guardas' | 'editor' | 'rule_game' | 'game_maker' | 'text_probe' | 'race' | 'workshop' | 'wardrobe' | 'typing_race' | 'own_game';
export type ProbeId = Extract<ActivityId, 'game_maker' | 'text_probe' | 'workshop'>;

/**
 * How an activity is played: a sheet of 1ro's year (its pages move by the hash), the rule game's pages, a probe's component, or the race (T33).
 * T39 (4to's Arcade): `step`, a flow step of its own (the Workshop, the wardrobe): the card moves the flow there.
 * T41 (4to's Arcade): `typing`, the typing race; `own`, the child's own Workshop game.
 */
export type ActivityKind = { sheet: number } | { rules: true } | { probe: ProbeId } | { race: true } | { step: 'workshop' | 'wardrobe' } | { typing: true } | { own: true };

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

/** What each grade's menu shows, in order (a probe only when it is registered). T33: the race first for 1ro and 2do. */
export const MENU: Record<number, readonly ActivityId[]> = {
  // 2026-10-20: 1ro ran out of activities; the typing race (letters, Cokitos' moto race) joins its menu.
  1: ['race', 'typing_race', 'sheet', 'recess', 'guardas', 'editor'],
  2: ['race', 'sheet', 'recess', 'guardas', 'editor'],
  3: ['rule_game', 'sheet', 'recess', 'editor'],
  // T39/T41: 4to's free play is the Arcade (flow.ts): the typing race, the child's own game, La carrera from tier 4,
  // back to the Workshop, the wardrobe. No xylophone, no 1ro sheet, no rule game, no old game maker.
  4: ['typing_race', 'own_game', 'race', 'workshop', 'wardrobe'],
  5: ['workshop', 'rule_game', 'editor', 'recess', 'text_probe'],
};

const title = (n: number) => sheetByN(n)?.title ?? '';

export function activityFor(id: ActivityId, grade: number): Activity | null {
  switch (id) {
    case 'sheet': {
      const n = SHEET_FOR[grade];
      if (!n) return null;
      return { id, kind: { sheet: n }, say: `${title(n)}: una hoja con caminos y un desafío.`, caption: title(n) };
    }
    case 'recess': return { id, kind: { sheet: RECESS_SHEET }, say: 'La música: armá canciones en el xilofón.', caption: 'La música' };
    case 'guardas': return { id, kind: { sheet: GUARDAS_SHEET }, say: 'Las guardas: pintá dibujos que se repiten.', caption: 'Las guardas' };
    case 'editor': return { id, kind: { sheet: WORKSHOP_FOR[grade] ?? 7 }, say: 'El taller: armá un nivel y jugá los de tus compañeros.', caption: 'El taller' };
    case 'rule_game': return { id, kind: { rules: true }, say: 'El juego de reglas: armá tu propio juego.', caption: 'Juego de reglas' };
    case 'game_maker': return { id, kind: { probe: id }, say: 'Hacé tu juego.', caption: 'Hacé tu juego' };
    case 'text_probe': return { id, kind: { probe: id }, say: 'Del bloque al texto.', caption: 'Bloques y texto' };
    case 'race': return { id, kind: { race: true }, say: 'La carrera: armá el camino con flechas y ganá la carrera.', caption: 'La carrera' };
    // T39: in 4to's Arcade the Workshop card goes back to the Workshop step
    case 'workshop': return grade === 4
      ? { id, kind: { step: 'workshop' }, say: 'El taller de juegos: volvé a tu juego.', caption: 'Taller de juegos' }
      : { id, kind: { probe: id }, say: 'El taller de juegos: programá tu propio juego, como en Scratch.', caption: 'Taller de juegos' };
    case 'wardrobe': return { id, kind: { step: 'wardrobe' }, say: 'El vestidor: cambiale la ropa a tu personaje.', caption: 'El vestidor' };
    // T41: 4to's Arcade
    case 'typing_race': return { id, kind: { typing: true }, say: grade === 1 ? 'Carrera de teclas: apretá las letras y ganá la carrera.' : 'Carrera de teclas: escribí las palabras y ganá la carrera.', caption: 'Carrera de teclas' };
    case 'own_game': return { id, kind: { own: true }, say: 'Tu juego: jugá el juego que hiciste en el taller.', caption: 'Tu juego' };
    default: return null;
  }
}

/**
 * The menu of a grade: its activities, a probe only when `hasProbe` says its
 * component is there. T20 (silent classroom round): 1ro's recess (the
 * xylophone song) is music through and through — it depends on hearing, so
 * it is left off 1ro's menu while muted rather than built out as a visual
 * activity (the smaller change, and 1ro has three other cards already).
 */
export function menuFor(grade: number, hasProbe: (id: ProbeId) => boolean, muted = false): Activity[] {
  return (MENU[grade] ?? MENU[1])
    .map((id) => activityFor(id, grade))
    .filter((a): a is Activity => !!a && (!('probe' in a.kind) || hasProbe(a.kind.probe)))
    .filter((a) => !(muted && grade === 1 && a.id === 'recess'));
}

/** Said when the menu opens (then each card's name), and when the child comes back to it. */
export const MENU_LINES = {
  first: '¿A qué querés jugar? Tocá un dibujo.',
  again: 'Elegí otro juego, o el mismo otra vez.',
  /** The time for free play is over: after the page the child was on. */
  over: '¡Ahora vamos a otro juego!',
  /** T41: 4to's Arcade opens with its name. */
  arcade: '¡El Arcade! Elegí un juego.',
};

/** T39: the race starts at this tier in a grade's free play (4to's Arcade: the turbo straights); 1 elsewhere. */
export const RACE_START_TIER: Readonly<Record<number, number>> = { 4: 4 };

/** C02: 4to's Carrera de teclas has honest, fixed-pace rivals (it can really lose); every other grade keeps the band (always wins). */
export const raceRivalsFor = (grade: number): 'band' | 'honest' => (grade === 4 ? 'honest' : 'band');

// ------------------------------------------------------------------ the time

/**
 * Free play's first pass (on the core route, before the typing game) lasts
 * at least this long (grade-independent), or until FREE_PLAY_MIN_VISITS
 * activities were picked; then the next step comes after the page on
 * screen. After the route is done (T14) free play has no end at all.
 */
export const FREE_PLAY_BUDGET_MS = 8 * 60_000;
/** T14: four activities picked (the child back on the menu after the fourth) also end the first pass. */
export const FREE_PLAY_MIN_VISITS = 4;
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
 * `visits` and `onMainMenu`: four activities picked and the child back on
 * the drawn menu also end it.
 */
export function budgetVerdict(o: {
  now: number; startedAt: number; budget: number; onMenu: boolean; levelOpen: boolean; dueSince: number | null;
  visits?: number; onMainMenu?: boolean;
}): 'wait' | 'now' | 'after_level' {
  if ((o.visits ?? 0) >= FREE_PLAY_MIN_VISITS && o.onMainMenu) return 'now';
  if (o.now - o.startedAt < o.budget) return 'wait';
  if (o.onMenu) return 'now';
  if (o.levelOpen) return 'after_level';
  const since = o.dueSince ?? o.now;
  return o.now - since >= FREE_PLAY_GRACE_MS ? 'now' : 'after_level';
}
