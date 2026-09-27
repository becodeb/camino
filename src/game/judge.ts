// What a program does on a page, whatever kind of page it is: a walk on the
// page's board(s) (engine.ts), a song on the xylophone (music.ts), a guarda
// drawn on squared paper (guarda.ts). Every run comes out as the engine's
// Trace (a step per card, won / crashed / short), so the level page, the
// help and the tests treat them all alike.

import { simulateAll } from './engine';
import { guardaTrace } from './guarda';
import type { LevelDef } from './levels';
import type { Program, Trace } from './model';
import { songTrace } from './music';

type Page = Pick<LevelDef, 'worlds' | 'music' | 'guarda'>;

/** One trace per world (a song or a guarda has one). */
export function tracesOf(l: Page, program: Program): Trace[] {
  if (l.music) return [songTrace(l.worlds[0], l.music, program)];
  if (l.guarda) return [guardaTrace(l.worlds[0], l.guarda, program)];
  return simulateAll(l.worlds, program);
}

/** The trace of a page with one world. */
export const traceOf = (l: Page, program: Program): Trace => tracesOf(l, program)[0];

/** The program wins the page (in every world). */
export const wins = (l: Page, program: Program) => tracesOf(l, program).every((t) => t.outcome === 'win');

/** The page's judge, for the help (hint.ts). */
export const judgeOf = (l: Page) => (program: Program) => wins(l, program);
