// The curriculum of a grade's year, as data. A year is a list of sheets
// (hojas): each sheet has a few short core levels (some marked essential), a
// handmade optional boss, and extras that a generator makes on the spot
// behind three doors (easy, medium, hard). Screens, progress, the dev drawer
// and the tests all read from here; adding a sheet is adding an entry.

import type { LevelDef } from '../game/levels';
import type { Program } from '../game/model';

/**
 * What kind of class the sheet is (the approved activities plan):
 * `camino` a regular sheet of the path; `taller` the kids make a level for a
 * classmate; `recreo` a playful break; `comodin` recess or catch-up;
 * `muestra` the showcase for the families.
 */
export type SheetKind = 'camino' | 'taller' | 'recreo' | 'comodin' | 'muestra';
/** Where the sheet sits on the map: 1ro walks the forest, then follows the river. */
export type Zone = 'bosque' | 'rio';

/** The three doors of extras, from the smallest sprout to a little tree. */
export type Door = 'easy' | 'medium' | 'hard';
export const DOORS: readonly Door[] = ['easy', 'medium', 'hard'];
/** For the adult (dev drawer, titles). */
export const DOOR_LABEL: Record<Door, string> = { easy: 'fácil', medium: 'media', hard: 'difícil' };

/**
 * What the extras generator builds behind a door (curriculum/generate.ts):
 * - `sequence`: a flat plan of arrows, collecting seeds on the way before the
 *   pot; the notebook has exactly as many lines as the shortest plan.
 * - `repeat`: a path made of one pattern (`body` arrows) walked `count` times,
 *   with a notebook of `body` lines, so no plan without "repetir" fits.
 */
export type ExtraParams =
  | { family: 'sequence'; cols: number; rows: number; steps: [number, number]; pickups: number; rocks: number }
  | { family: 'repeat'; body: 1 | 2 | 3; count: [number, number]; pickups: 0 | 1 };
export type ExtraFamily = ExtraParams['family'];

export interface CoreLevel {
  level: LevelDef;
  /** The teacher's minimum: a sheet counts as covered when its essential levels are solved. */
  essential?: boolean;
}

export interface Sheet {
  /** 1 to 17 in 1ro: its place on the map and in the URL (`#/1ro/hoja/<n>`). */
  n: number;
  grade: '1ro';
  kind: SheetKind;
  zone: Zone;
  /** For the adult: small print on the map, the bar and the dev drawer. */
  title: string;
  /** Spoken when the child opens the sheet for the first time (es-AR). */
  say: string;
  /** What the kids do in this sheet (the approved plan), for the adult and for the tasks still to build it. */
  plan: string;
  /**
   * The new idea of the sheet, shown by the ghost hand with real edits the
   * first time (it becomes the `intro` of the first core level).
   */
  concept?: { program: Program; after: 'full' | 'fail' };
  /** The core levels, 3–4 short ones. Empty: the sheet is not built yet ("próximamente"). */
  core: CoreLevel[];
  /** Optional challenge after the core, with a special frame. */
  boss?: LevelDef;
  /** What each door generates. */
  extras?: Record<Door, ExtraParams>;
  /** The line the end of the sheet leaves hanging, towards the next one (T4 draws the preview card). */
  preview?: string;
  /** The task that builds (or built) this sheet. */
  builtIn: 'T1' | 'T2' | 'T3' | 'T4';
}

export const isBuilt = (s: Sheet) => s.core.length > 0;

// ------------------------------------------------------------------ level ids
// Stable ids, used as progress keys and shown in the dev drawer.

export const coreId = (s: Pick<Sheet, 'grade' | 'n'>, k: number) => `${s.grade}-h${s.n}-${k}`;
export const bossId = (s: Pick<Sheet, 'grade' | 'n'>) => `${s.grade}-h${s.n}-jefe`;
export const extraId = (s: Pick<Sheet, 'grade' | 'n'>, door: Door, i: number) => `${s.grade}-h${s.n}-${door}-${i}`;
/** Every extra of a door shares this prefix (to count them in the progress). */
export const extraPrefix = (s: Pick<Sheet, 'grade' | 'n'>, door: Door) => `${s.grade}-h${s.n}-${door}-`;
