// The handmade levels of 1ro's built sheets: 3–4 short core levels each (the
// essential ones are the teacher's minimum) and a boss, an optional
// challenge. Flat levels get their reference plan and their notebook from the
// solver (exactly as many lines as the shortest plan); repeat levels are
// written by hand and proved in the tests to need the loop.
// Titles are for the adult; `say` is spoken to the child (es-AR).

import { levelById, type LevelDef } from '../game/levels';
import { shortestPlan } from '../game/engine';
import { cmdProgram, type Board, type Program } from '../game/model';
import { ARROWS, bossLevel, carvedBoard, coreLevel, loop, openBoard } from './boards';
import { coreId, type CoreLevel, type Sheet } from './model';

type Built = Pick<Sheet, 'core' | 'boss' | 'concept'>;

/** A flat level: the notebook has exactly as many lines as the shortest plan. */
function flat(board: Board): { worlds: Board[]; blocks: string[]; slots: number; solution: Program } {
  const plan = shortestPlan(board, ARROWS);
  if (!plan) throw new Error(`board ${board.seed} has no way to the goal`);
  return { worlds: [board], blocks: [...ARROWS], slots: plan.length, solution: cmdProgram(plan) };
}

/** A demo level folded into a sheet: same board, blocks and ghost intro; the sheet's id and page. */
const fromDemo = (id: string, sheet: number, k: number): LevelDef =>
  ({ ...levelById(id)!, id: coreId({ grade: '1ro', n: sheet }, k), page: k });

const essential = (level: LevelDef): CoreLevel => ({ level, essential: true });
const plain = (level: LevelDef): CoreLevel => ({ level });

// ------------------------------------------------------------------ 1 · Llegada al bosque (review of sala 5's plans)

export const SHEET_1: Built = {
  core: [
    essential(coreLevel(1, 1, {
      title: 'Cuatro pasos hasta la semilla',
      say: 'Armá el camino de Brote con flechas en el cuaderno. Después tocá Probar.',
      ...flat(openBoard({ cols: 4, rows: 3, start: [0, 2], goal: [3, 1], seed: 1101, rocks: [[2, 2]], grass: [[0, 0], [3, 2], [2, 0]] })),
    })),
    plain(coreLevel(1, 2, {
      title: 'Entre dos piedras',
      say: 'Hay piedras en el camino. Buscá por dónde pasar.',
      ...flat(openBoard({ cols: 5, rows: 3, start: [0, 0], goal: [4, 2], seed: 1102, rocks: [[2, 0], [2, 2]], grass: [[1, 2], [4, 0], [3, 2]] })),
    })),
    essential(coreLevel(1, 3, {
      title: 'Primero la semilla, después la maceta',
      say: 'Primero juntá la semilla, y después llevala a la maceta.',
      ...flat(openBoard({ cols: 4, rows: 3, start: [0, 2], goal: [3, 2], seed: 1103, pickups: [[1, 1]], grass: [[3, 0], [0, 0], [2, 0]] })),
    })),
  ],
  boss: bossLevel(1, {
    title: 'El bosque tupido',
    say: 'Un camino largo entre piedras y charcos. Juntá la semilla y plantala en la maceta.',
    ...flat(openBoard({ cols: 5, rows: 3, start: [0, 2], goal: [4, 2], seed: 1109, pickups: [[2, 0]], rocks: [[1, 1], [2, 2]], puddles: [[3, 1]], grass: [[1, 2], [3, 2]] })),
  }),
};

// ------------------------------------------------------------------ 2 · Caminos largos (8 to 12 steps, seeds on the way)

export const SHEET_2: Built = {
  core: [
    essential(coreLevel(2, 1, {
      title: 'Un camino largo',
      say: 'Un camino largo: juntá la semilla y llevala a la maceta.',
      ...flat(openBoard({ cols: 6, rows: 3, start: [0, 1], goal: [5, 2], seed: 1201, pickups: [[2, 0]], rocks: [[4, 0]], grass: [[1, 2], [5, 0], [3, 2]] })),
    })),
    plain(coreLevel(2, 2, {
      title: 'Dos semillas',
      say: 'Juntá las dos semillas, una después de la otra, y después andá a la maceta.',
      ...flat(openBoard({ cols: 6, rows: 3, start: [0, 2], goal: [5, 2], seed: 1202, pickups: [[1, 0], [4, 0]], rocks: [[2, 1], [3, 1]], grass: [[5, 0], [0, 0], [2, 2]] })),
    })),
    essential(coreLevel(2, 3, {
      title: 'Tres semillas en fila',
      say: 'Tres semillas y la maceta. Juntalas todas antes de llegar.',
      ...flat(openBoard({ cols: 7, rows: 3, start: [0, 2], goal: [6, 2], seed: 1203, pickups: [[1, 1], [3, 1], [5, 1]], rocks: [[2, 1]], puddles: [[4, 0]], grass: [[6, 0], [0, 0], [3, 2]] })),
    })),
    plain(coreLevel(2, 4, {
      title: 'Dos semillas y un muro de piedras',
      say: 'Juntá las semillas y llegá a la maceta. Las piedras no se pueden pisar.',
      ...flat(openBoard({ cols: 6, rows: 4, start: [0, 3], goal: [5, 3], seed: 1204, pickups: [[1, 1], [4, 1]], rocks: [[2, 1], [3, 1]], puddles: [[3, 3]], grass: [[5, 0], [0, 0], [2, 3]] })),
    })),
  ],
  boss: bossLevel(2, {
    title: 'La vuelta larga',
    say: 'El camino más largo del bosque: tres semillas, piedras y charcos. Después, a la maceta.',
    ...flat(openBoard({ cols: 7, rows: 4, start: [0, 3], goal: [6, 3], seed: 1209, pickups: [[0, 0], [3, 0], [6, 0]], rocks: [[1, 2], [2, 2], [4, 1], [5, 2]], puddles: [[3, 2]], grass: [[2, 3], [4, 3]] })),
  }),
};

// ------------------------------------------------------------------ 4 · Otra vez (not enough lines: repeat one block)

export const SHEET_4: Built = {
  concept: levelById('1ro-1')!.intro,
  core: [
    essential(fromDemo('1ro-1', 4, 1)),
    plain(coreLevel(4, 2, {
      title: 'Para arriba',
      say: 'Brote tiene que subir hasta la semilla. Hay pocos renglones: usá repetir.',
      worlds: [openBoard({ cols: 3, rows: 6, start: [1, 5], goal: [1, 0], seed: 1402, rocks: [[0, 2]], grass: [[2, 4], [0, 4], [2, 1]] })],
      blocks: ['up', 'repeat'],
      slots: 2,
      solution: [loop(5, ['up'])],
    })),
    essential(coreLevel(4, 3, {
      title: 'La semilla en el camino',
      say: 'Juntá la semilla y seguí hasta la maceta. Con repetir alcanza.',
      worlds: [openBoard({ cols: 8, rows: 3, start: [7, 1], goal: [0, 1], seed: 1403, pickups: [[3, 1]], rocks: [[5, 0], [2, 2]], grass: [[6, 2], [1, 0], [4, 0]] })],
      blocks: ['left', 'repeat'],
      slots: 2,
      solution: [loop(7, ['left'])],
    })),
  ],
  boss: bossLevel(4, {
    title: 'La ele: dos repetir',
    say: 'Primero derecho hasta la semilla, después para arriba hasta la maceta. Vas a necesitar dos repetir.',
    worlds: [openBoard({ cols: 7, rows: 5, start: [0, 4], goal: [6, 0], seed: 1409, pickups: [[6, 4]], rocks: [[2, 1], [4, 2], [1, 2]], grass: [[3, 0], [0, 0], [5, 3]] })],
    blocks: ['up', 'right', 'repeat'],
    slots: 2,
    solution: [loop(6, ['right']), loop(4, ['up'])],
  }),
};

// ------------------------------------------------------------------ 6 · La escalera (a two-block pattern)

const STAIRS_INTRO = { program: [loop(2, ['right', 'up'])], after: 'full' as const };

export const SHEET_6: Built = {
  concept: STAIRS_INTRO,
  core: [
    essential(coreLevel(6, 1, {
      title: 'Escalones chicos',
      say: 'Subí la escalera hasta la semilla. Mirá bien: los escalones se repiten.',
      worlds: [carvedBoard([0, 3], ['right', 'up', 'right', 'up', 'right', 'up'], { seed: 1601 })],
      blocks: ['right', 'up', 'repeat'],
      slots: 2,
      solution: [loop(3, ['right', 'up'])],
      intro: STAIRS_INTRO,
    })),
    plain(fromDemo('1ro-2', 6, 2)),
    essential(coreLevel(6, 3, {
      title: 'Bajar la escalera',
      say: 'Ahora la escalera baja. ¿Qué se repite?',
      worlds: [carvedBoard([0, 0], ['right', 'down', 'right', 'down', 'right', 'down', 'right', 'down'], { seed: 1603 })],
      blocks: ['down', 'right', 'repeat'],
      slots: 2,
      solution: [loop(4, ['right', 'down'])],
    })),
    plain(coreLevel(6, 4, {
      title: 'La escalera al revés',
      say: 'Esta escalera sube para el otro lado. Juntá la semilla en el camino y llegá a la maceta.',
      worlds: [carvedBoard([3, 3], ['left', 'up', 'left', 'up', 'left', 'up'], { seed: 1604, seedAt: 3 })],
      blocks: ['left', 'up', 'repeat'],
      slots: 2,
      solution: [loop(3, ['left', 'up'])],
    })),
  ],
  boss: bossLevel(6, {
    title: 'La montaña: subir y bajar',
    say: 'Subí la montaña, juntá la semilla de la cima y bajá hasta la maceta.',
    worlds: [carvedBoard([0, 3], ['right', 'up', 'right', 'up', 'right', 'up', 'right', 'down', 'right', 'down', 'right', 'down'], { seed: 1609, seedAt: 6 })],
    blocks: ['up', 'down', 'right', 'repeat'],
    slots: 4,
    solution: [loop(3, ['right', 'up']), loop(3, ['right', 'down'])],
  }),
};

// ------------------------------------------------------------------ 8 · Zigzag (three-block patterns)

const RAMP_INTRO = { program: [loop(2, ['right', 'right', 'up'])], after: 'full' as const };

export const SHEET_8: Built = {
  concept: RAMP_INTRO,
  core: [
    essential(coreLevel(8, 1, {
      title: 'La rampa: tres pasos que se repiten',
      say: 'Subí la rampa hasta la semilla. Buscá los tres pasos que se repiten.',
      worlds: [carvedBoard([0, 3], ['right', 'right', 'up', 'right', 'right', 'up', 'right', 'right', 'up'], { seed: 1801 })],
      blocks: ['up', 'right', 'repeat'],
      slots: 3,
      solution: [loop(3, ['right', 'right', 'up'])],
      intro: RAMP_INTRO,
    })),
    plain(coreLevel(8, 2, {
      title: 'Bajada empinada',
      say: 'Bajá hasta la semilla. ¿Cuáles son los tres pasos que se repiten?',
      worlds: [carvedBoard([0, 0], ['right', 'down', 'down', 'right', 'down', 'down'], { seed: 1802 })],
      blocks: ['down', 'right', 'repeat'],
      slots: 3,
      solution: [loop(2, ['right', 'down', 'down'])],
    })),
    essential(coreLevel(8, 3, {
      title: 'Zigzag',
      say: 'El camino hace zigzag. Juntá la semilla y llevala a la maceta.',
      worlds: [carvedBoard([0, 0], ['right', 'down', 'right', 'right', 'down', 'right', 'right', 'down', 'right'], { seed: 1803, seedAt: 5 })],
      blocks: ['down', 'right', 'repeat'],
      slots: 3,
      solution: [loop(3, ['right', 'down', 'right'])],
    })),
  ],
  boss: bossLevel(8, {
    title: 'La colina: subir y bajar de a tres',
    say: 'Subí la colina, juntá la semilla de arriba y bajá hasta la maceta.',
    worlds: [carvedBoard([0, 2], ['right', 'right', 'up', 'right', 'right', 'up', 'right', 'right', 'down', 'right', 'right', 'down'], { seed: 1809, seedAt: 7 })],
    blocks: ['up', 'down', 'right', 'repeat'],
    slots: 6,
    solution: [loop(2, ['right', 'right', 'up']), loop(2, ['right', 'right', 'down'])],
  }),
};
