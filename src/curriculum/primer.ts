// 1er grado · Repetir: the whole year as 17 sheets (the approved activities
// plan, section "1er grado"). Sheets 1–9 walk the forest, 10–17 follow the
// river. A sheet with no core levels is not built yet: the map shows it as
// "próximamente" (reachable in dev mode); T2–T4 fill them in. The levels of
// the built sheets live in primerLevels.ts.

import type { Door, ExtraParams, Sheet } from './model';
import { SHEET_1, SHEET_2, SHEET_4, SHEET_6, SHEET_8 } from './primerLevels';

/** Extras of flat plans (review and long plans): the board, the plan's length and what is on it grow by door. */
const seq = (cols: number, rows: number, steps: [number, number], pickups: number, rocks: number): ExtraParams =>
  ({ family: 'sequence', cols, rows, steps, pickups, rocks });
/** Extras that need "repetir": the pattern's length and the number of passes grow by door. */
const rep = (body: 1 | 2 | 3, count: [number, number], pickups: 0 | 1 = 0): ExtraParams => ({ family: 'repeat', body, count, pickups });
const doors = (easy: ExtraParams, medium: ExtraParams, hard: ExtraParams): Record<Door, ExtraParams> => ({ easy, medium, hard });

export const PRIMER: Sheet[] = [
  {
    n: 1, grade: '1ro', kind: 'camino', zone: 'bosque', builtIn: 'T1',
    title: 'Llegada al bosque',
    say: 'Llegamos al bosque. Brote quiere recorrerlo con vos.',
    plan: 'Review sala 5 plans (arrows in the notebook, then ▶); choose a character (placeholder: Brote, T4 builds the choice).',
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
    core: [],
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
    core: [],
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
    plan: 'Create a level classmates play (level editor + classmates\' gallery).',
    core: [],
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
    say: 'Recreo: armá una canción. El estribillo se repite.',
    plan: 'Build a song; the chorus is a repeat.',
    core: [],
  },
  {
    n: 10, grade: '1ro', kind: 'camino', zone: 'rio', builtIn: 'T2',
    title: 'Vuelta: el río',
    say: 'Llegamos al río. Repasamos repetir con piedras y agua.',
    plan: 'Review repeat in the new zone.',
    core: [],
  },
  {
    n: 11, grade: '1ro', kind: 'camino', zone: 'rio', builtIn: 'T2',
    title: 'Ahorrá',
    say: 'Buscá lo que se repite en tu camino y ahorrá renglones.',
    plan: 'Find the pattern in their own solution; gold stamp.',
    core: [],
  },
  {
    n: 12, grade: '1ro', kind: 'camino', zone: 'rio', builtIn: 'T2',
    title: 'El repetir roto',
    say: 'Este repetir está roto. ¿Qué le pasa?',
    plan: 'Fix a wrong count or an extra block inside.',
    core: [],
  },
  {
    n: 13, grade: '1ro', kind: 'camino', zone: 'rio', builtIn: 'T2',
    title: 'Antes y después',
    say: 'Unos pasos, un repetir, y otros pasos más.',
    plan: 'Steps, a repeat, then steps again.',
    core: [],
  },
  {
    n: 14, grade: '1ro', kind: 'camino', zone: 'rio', builtIn: 'T3',
    title: 'Guardas',
    say: 'Con repetir se pintan guardas para el cuaderno.',
    plan: 'Repeat to draw notebook borders.',
    core: [],
  },
  {
    n: 15, grade: '1ro', kind: 'taller', zone: 'rio', builtIn: 'T3',
    title: 'Taller: un nivel con límite',
    say: 'Armá un nivel con pocos renglones para un compañero.',
    plan: 'A block-limited level for a classmate.',
    core: [],
  },
  {
    n: 16, grade: '1ro', kind: 'comodin', zone: 'rio', builtIn: 'T3',
    title: 'Comodín',
    say: 'Hoy elegís: jugar o terminar lo que quedó.',
    plan: 'Recess or catch-up.',
    core: [],
  },
  {
    n: 17, grade: '1ro', kind: 'muestra', zone: 'rio', builtIn: 'T4',
    title: 'Muestra',
    say: 'Hoy le enseñás un nivel a tu familia y le mostrás tu jardín.',
    plan: 'Teach their family a level; tour their garden.',
    core: [],
  },
];

export const sheetByN = (n: number) => PRIMER.find((s) => s.n === n) ?? null;
