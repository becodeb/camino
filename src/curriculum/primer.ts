// 1er grado · Repetir: the whole year as 17 sheets (the approved activities
// plan, section "1er grado"). Sheets 1–9 walk the forest, 10–17 follow the
// river. The workshops (7, 15) have an editor and the class corkboard instead
// of pages (curriculum/workshop.ts), the comodín (16) three choices, the
// showcase (17) the family's visit. The levels of the sheets of pages live in
// primerLevels.ts; a door may take several families of extras in turns (a
// fix, then a predict…). What each boss sends to the garden is in
// motivation.ts.

import type { CompleteHole, Door, DoorExtras, ExtraParams, FixBug, GuardaParams, MelodyParams, RepeatParams, SequenceParams } from './model';
import type { Sheet } from './model';
import { SHEET_1, SHEET_10, SHEET_11, SHEET_12, SHEET_13, SHEET_14, SHEET_2, SHEET_3, SHEET_4, SHEET_5, SHEET_6, SHEET_8, SHEET_9 } from './primerLevels';

/** Extras of flat plans (review and long plans): the board, the plan's length and what is on it grow by door. */
const seq = (cols: number, rows: number, steps: [number, number], pickups: number, rocks: number): SequenceParams =>
  ({ family: 'sequence', cols, rows, steps, pickups, rocks });
/** Extras that need "repetir": the pattern's length and the number of passes grow by door (and steps around it, or a gold challenge). */
const rep = (body: 1 | 2 | 3, count: [number, number], pickups: 0 | 1 = 0, more: Partial<Pick<RepeatParams, 'pre' | 'post' | 'save'>> = {}): RepeatParams =>
  ({ family: 'repeat', body, count, pickups, ...more });
/** Where does Brote end: a flat program, or one repeat. */
const pred = (cols: number, rows: number, steps: [number, number], rocks: number, loop?: { body: 1 | 2; count: [number, number] }): ExtraParams =>
  ({ family: 'predict', cols, rows, steps, rocks, ...(loop ? { loop } : {}) });
/** One mistake to find, on a level of `base`. */
const fixOf = (base: SequenceParams | RepeatParams, ...bugs: FixBug[]): ExtraParams => ({ family: 'fix', base, bugs });
/** Something missing on a repeat level. */
const completeOf = (base: RepeatParams, ...holes: CompleteHole[]): ExtraParams => ({ family: 'complete', base, holes });
const doors = (easy: DoorExtras, medium: DoorExtras, hard: DoorExtras): Record<Door, DoorExtras> => ({ easy, medium, hard });
/** Songs on the xylophone: a motif of `motif` beats played several times, from the notes of `pitches` (and a silence). */
const mel = (motif: MelodyParams['motif'], count: [number, number], pitches: MelodyParams['pitches'], rest = false): ExtraParams =>
  ({ family: 'melody', motif, count, pitches, ...(rest ? { rest } : {}) });
/** Guardas on squared paper: a pattern of `body` arrows drawn several times. */
const gua = (body: GuardaParams['body'], count: [number, number]): ExtraParams => ({ family: 'guarda', body, count });

export const PRIMER: Sheet[] = [
  {
    n: 1, grade: '1ro', kind: 'camino', zone: 'bosque', builtIn: 'T1',
    title: 'Llegada al bosque',
    say: 'Llegamos al bosque. Brote quiere recorrerlo con vos.',
    plan: 'Review sala 5 plans (arrows in the notebook, then ▶); choose a character (Brote, Mina, Pliegue or Ovillo: the sheet opens on the choice the first time).',
    ...SHEET_1,
    extras: doors(seq(4, 3, [3, 4], 0, 1), seq(5, 3, [5, 6], 1, 2), seq(5, 4, [7, 8], 1, 3)),
    preview: 'Mañana los caminos son más largos.',
  },
  {
    n: 2, grade: '1ro', kind: 'camino', zone: 'bosque', builtIn: 'T1',
    title: 'Caminos largos',
    say: 'Hoy los caminos son largos. Juntá las semillas en orden.',
    plan: '8–12 step plans collecting things in order; still no repeat.',
    ...SHEET_2,
    extras: doors(seq(5, 4, [7, 8], 1, 2), seq(6, 4, [9, 10], 2, 3), seq(7, 4, [11, 12], 2, 4)),
    preview: 'Brote se va a confundir…',
  },
  {
    n: 3, grade: '1ro', kind: 'camino', zone: 'bosque', builtIn: 'T2',
    title: 'Brote se confundió',
    say: 'Brote se confundió de camino. ¿Lo ayudás a arreglarlo?',
    plan: 'Fix and predict formats, still without repeat.',
    ...SHEET_3,
    // every door takes turns: a plan with one wrong arrow, then "where does Brote end?"
    extras: doors(
      [fixOf(seq(4, 3, [3, 4], 0, 1), 'arrow'), pred(4, 3, [3, 4], 1)],
      [fixOf(seq(5, 3, [5, 6], 1, 2), 'arrow'), pred(5, 4, [5, 6], 2)],
      [fixOf(seq(5, 4, [7, 8], 1, 3), 'arrow', 'extra'), pred(6, 4, [7, 8], 3)],
    ),
    preview: 'Mañana los caminos son tan largos que no entran en el cuaderno.',
  },
  {
    n: 4, grade: '1ro', kind: 'camino', zone: 'bosque', builtIn: 'T1',
    title: 'Otra vez',
    say: 'Hay caminos muy largos y pocos renglones. Vas a aprender algo nuevo.',
    plan: 'Not enough lines → repeat with one block (the demo level 1ro-1 and its ghost-hand intro).',
    ...SHEET_4,
    // one arrow gives few different paths: wide counts keep a run of extras free of repeats
    extras: doors(rep(1, [3, 5]), rep(1, [5, 9]), rep(1, [8, 10], 1)),
    preview: '¿Cuántas veces hay que repetir?',
  },
  {
    n: 5, grade: '1ro', kind: 'camino', zone: 'bosque', builtIn: 'T2',
    title: '¿Cuántas veces?',
    say: '¿Cuántas veces hay que repetir? Contá los pasos.',
    plan: 'Complete the count; count the passes with the dots.',
    ...SHEET_5,
    // the count to complete (only one wins: the path turns after the repeat), then a repeat to follow with the dots
    extras: doors(
      [completeOf(rep(1, [3, 5], 0, { post: [1, 1] }), 'count'), pred(5, 3, [3, 5], 1, { body: 1, count: [3, 5] })],
      [completeOf(rep(1, [5, 8], 0, { post: [1, 1] }), 'count'), pred(6, 4, [4, 8], 2, { body: 2, count: [2, 4] })],
      [completeOf(rep(2, [3, 4], 0, { post: [1, 2] }), 'count'), pred(7, 5, [6, 8], 3, { body: 2, count: [3, 4] })],
    ),
    preview: 'Se vienen escalones.',
  },
  {
    n: 6, grade: '1ro', kind: 'camino', zone: 'bosque', builtIn: 'T1',
    title: 'La escalera',
    say: 'Mirá los escalones: se repiten de a dos.',
    plan: 'Repeat a two-block pattern (the demo level 1ro-2, the carved staircase).',
    ...SHEET_6,
    extras: doors(rep(2, [2, 3]), rep(2, [3, 4]), rep(2, [4, 5], 1)),
    preview: 'La próxima, vos armás un nivel.',
  },
  {
    n: 7, grade: '1ro', kind: 'taller', zone: 'bosque', builtIn: 'T3',
    title: 'Taller: mi primer nivel',
    say: 'Hoy armás un nivel para un compañero.',
    plan: 'Create a level classmates play: the level editor (Brote, the seed, the pot, rocks), solved by its author with the notebook, pinned on the class corkboard; play a classmate\'s level.',
    core: [],
    workshop: { limited: false },
    preview: 'Mañana los caminos hacen zigzag.',
  },
  {
    n: 8, grade: '1ro', kind: 'camino', zone: 'bosque', builtIn: 'T1',
    title: 'Zigzag',
    say: 'Ahora los caminos hacen zigzag. Buscá los tres pasos que se repiten.',
    plan: 'Three-block patterns.',
    ...SHEET_8,
    extras: doors(rep(2, [3, 4]), rep(3, [2, 3]), rep(3, [3, 4], 1)),
    preview: 'Se viene el recreo con música.',
  },
  {
    n: 9, grade: '1ro', kind: 'recreo', zone: 'bosque', builtIn: 'T3',
    title: 'Recreo: música',
    say: 'Recreo: tocamos canciones en el xilofón. El estribillo se repite.',
    plan: 'Build a song; the chorus is a repeat.',
    ...SHEET_9,
    // a motif of two, three and four notes played several times (the hard door may hold a silence)
    extras: doors(mel(2, [3, 4], 3), mel(3, [3, 4], 4), mel(4, [3, 4], 5, true)),
    preview: 'Después del recreo, llegamos al río.',
  },
  {
    n: 10, grade: '1ro', kind: 'camino', zone: 'rio', builtIn: 'T2',
    title: 'Vuelta: el río',
    say: 'Llegamos al río. Repasamos repetir con piedras y agua.',
    plan: 'Review repeat in the new zone.',
    ...SHEET_10,
    extras: doors(rep(1, [4, 7]), rep(2, [3, 4]), rep(3, [3, 4], 1)),
    preview: 'Mañana, a ahorrar bloques.',
  },
  {
    n: 11, grade: '1ro', kind: 'camino', zone: 'rio', builtIn: 'T2',
    title: 'Ahorrá',
    say: 'Buscá lo que se repite en tu camino y ahorrá renglones.',
    plan: 'Find the pattern in their own solution; gold stamp.',
    ...SHEET_11,
    // a long flat plan first, then the gold challenge with "repetir"
    // one arrow gives few different paths: a wide count keeps a run of extras free of repeats
    extras: doors(rep(1, [4, 8], 0, { save: true }), rep(2, [3, 4], 0, { save: true }), rep(3, [3, 3], 0, { save: true })),
    preview: 'Un repetir se rompió…',
  },
  {
    n: 12, grade: '1ro', kind: 'camino', zone: 'rio', builtIn: 'T2',
    title: 'El repetir roto',
    say: 'Este repetir está roto. ¿Qué le pasa?',
    plan: 'Fix a wrong count or an extra block inside.',
    ...SHEET_12,
    extras: doors(fixOf(rep(1, [4, 7]), 'count'), fixOf(rep(2, [3, 4]), 'count', 'extra'), fixOf(rep(3, [3, 3], 1), 'extra', 'arrow')),
    preview: '¿Y si hay pasos antes y después del repetir?',
  },
  {
    n: 13, grade: '1ro', kind: 'camino', zone: 'rio', builtIn: 'T2',
    title: 'Antes y después',
    say: 'Unos pasos, un repetir, y otros pasos más.',
    plan: 'Steps, a repeat, then steps again.',
    ...SHEET_13,
    extras: doors(
      [rep(1, [3, 5], 0, { pre: [1, 1] }), rep(1, [3, 5], 0, { post: [1, 1] })],
      [rep(2, [2, 3], 0, { pre: [1, 1], post: [1, 1] }), completeOf(rep(2, [2, 3], 0, { pre: [1, 1], post: [1, 1] }), 'card')],
      rep(2, [3, 4], 1, { pre: [1, 2], post: [1, 2] }),
    ),
    preview: 'Con repetir se pintan guardas.',
  },
  {
    n: 14, grade: '1ro', kind: 'camino', zone: 'rio', builtIn: 'T3',
    title: 'Guardas',
    say: 'Con repetir se pintan guardas para el cuaderno.',
    plan: 'Repeat to draw notebook borders.',
    ...SHEET_14,
    // a staircase of two arrows, a pattern of three, battlements of four: longer patterns behind bigger doors
    extras: doors(gua(2, [3, 5]), gua(3, [3, 4]), gua(4, [3, 4])),
    preview: 'La próxima, armás un nivel con pocos renglones para un compañero.',
  },
  {
    n: 15, grade: '1ro', kind: 'taller', zone: 'rio', builtIn: 'T3',
    title: 'Taller: un nivel con límite',
    say: 'Armá un nivel con pocos renglones para un compañero.',
    plan: 'A block-limited level for a classmate: the editor with the notebook\'s lines as a setting; the level must need a repeat (no plan without one fits the lines, the author\'s own program uses one).',
    core: [],
    workshop: { limited: true },
    preview: 'La próxima, elegís vos: jugar o terminar lo que quedó.',
  },
  {
    n: 16, grade: '1ro', kind: 'comodin', zone: 'rio', builtIn: 'T3',
    title: 'Comodín',
    say: 'Hoy elegís: jugar o terminar lo que quedó.',
    plan: 'Recess or catch-up: three choices. The essential pages still pending, on a bridge (or a review page when none is); sheet 9\'s free song; the classmates\' levels on the corkboard.',
    core: [],
    hub: true,
    preview: 'La próxima, le mostrás a tu familia todo lo que aprendiste.',
  },
  {
    n: 17, grade: '1ro', kind: 'muestra', zone: 'rio', builtIn: 'T4',
    title: 'Muestra',
    say: 'Hoy le enseñás un nivel a tu familia y le mostrás tu jardín.',
    plan: 'The family showcase: pick two or three favourite pages (solved ones, own workshop levels too), the family plays them while the child guides (the child\'s character cheers), a garden tour, a poster of the year.',
    core: [],
    showcase: true,
    // the end of the year: 2nd grade walks into the fog
    preview: 'El año que viene, el bosque se llena de niebla…',
  },
];

export const sheetByN = (n: number) => PRIMER.find((s) => s.n === n) ?? null;
