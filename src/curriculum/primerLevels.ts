// The handmade levels of 1ro's built sheets: 3–4 short core levels each (the
// essential ones are the teacher's minimum) and a boss, an optional
// challenge. Flat levels get their reference plan and their notebook from the
// solver (exactly as many lines as the shortest plan); repeat levels are
// written by hand and proved in the tests to need the loop.
// Titles are for the adult; `say` is spoken to the child (es-AR).

import { levelById, type LevelDef, type PaletteBlock } from '../game/levels';
import { shortestPlan } from '../game/engine';
import { arrowsIn, hasHoles, hasLoop } from '../game/formats';
import { HOLE, cardCount, cmdProgram, type Board, type Dir, type Program } from '../game/model';
import { ARROWS, bossLevel, carvedBoard, coreLevel, loop, openBoard } from './boards';
import { coreId, type CoreLevel, type Sheet } from './model';

type Built = Pick<Sheet, 'core' | 'boss' | 'concept'>;

// ------------------------------------------------------------------ the formats, as level parts

/** Predict: the program is read-only, the board has no goal. */
const predict = (board: Board, program: Program) => ({
  worlds: [board], format: 'predict' as const, given: program, solution: program, slots: cardCount(program),
  blocks: [...arrowsIn(program), ...(hasLoop(program) ? ['repeat'] : [])] as PaletteBlock[],
});

/** Fix: the program arrives with one mistake; `solution` is it fixed in place (an extra card becomes HOLE). */
const fix = (board: Board, given: Program, solution: Program) => ({
  worlds: [board], format: 'fix' as const, given, solution, slots: cardCount(given), blocks: arrowsIn(given, solution) as PaletteBlock[],
});

/** Complete: what is written is pinned; with only counts missing there is nothing to bring (no palette). */
const complete = (board: Board, given: Program, solution: Program) => ({
  worlds: [board], format: 'complete' as const, given, solution, slots: cardCount(solution),
  blocks: (hasHoles(given) ? arrowsIn(solution) : []) as PaletteBlock[],
});

/** A flat plan written by hand, and the arrow at `at` changed: a fix page on a flat level. */
const fixPlan = (board: Board, plan: Dir[], at: number, wrong: Dir) =>
  fix(board, cmdProgram(plan.map((d, i) => (i === at ? wrong : d))), cmdProgram(plan));

/** A flat level whose gold challenge (save blocks) is `better`: the same board, fewer lines, with "repetir". */
const withGold = (bits: ReturnType<typeof flat>, better: Program) => ({ ...bits, save: { slots: cardCount(better), solution: better } });

const cmd = (d: Dir | typeof HOLE): Program[number] => ({ t: 'cmd', cmd: d });
const times = (n: number, ...moves: Dir[]): Dir[] => Array.from({ length: n }, () => moves).flat();

/**
 * A river strip: banks of sand at both ends, the water between them and one
 * row of stepping stones across (every cell of that row is a stone).
 */
function riverStrip(cols: number, seed: number, pickups?: [number, number][]): Board {
  const water: [number, number][] = [], ford: [number, number][] = [];
  for (let c = 1; c < cols - 1; c++) { water.push([c, 0], [c, 2]); ford.push([c, 1]); }
  return openBoard({ cols, rows: 3, start: [0, 1], goal: [cols - 1, 1], seed, water, ford, pickups, look: 'river', grass: [[0, 0], [0, 2], [cols - 1, 0], [cols - 1, 2]] });
}

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

// ------------------------------------------------------------------ 3 · Brote se confundió (fix and predict, still without repeat)

export const SHEET_3: Built = {
  core: [
    essential(coreLevel(3, 1, {
      title: 'La flecha que se equivocó',
      say: 'Brote se confundió de flecha y se choca. Probá, tocá la flecha que está mal para sacarla y poné la buena.',
      ...fixPlan(openBoard({ cols: 4, rows: 3, start: [0, 2], goal: [3, 0], seed: 1301, rocks: [[2, 2]], grass: [[0, 0], [3, 2], [2, 1]] }),
        ['right', 'up', 'up', 'right', 'right'], 1, 'right'),
    })),
    plain(coreLevel(3, 2, {
      title: '¿Dónde termina Brote?',
      say: '¿Dónde va a terminar Brote? Seguí las flechas con el dedo, tocá ese lugar del tablero y después tocá Probar.',
      ...predict(openBoard({ cols: 5, rows: 3, start: [0, 1], goal: null, seed: 1302, rocks: [[2, 0], [4, 2]], grass: [[4, 0], [1, 2], [3, 0]] }),
        cmdProgram(['right', 'right', 'down', 'right'])),
    })),
    essential(coreLevel(3, 3, {
      title: 'Casi llega a la maceta',
      say: 'Brote juntó la semilla, pero se equivocó antes de llegar a la maceta. Buscá la flecha que está mal y arreglala.',
      ...fixPlan(openBoard({ cols: 5, rows: 3, start: [0, 2], goal: [4, 2], seed: 1303, pickups: [[2, 0]], rocks: [[1, 1], [3, 1]], grass: [[1, 2], [3, 2]] }),
        ['up', 'up', 'right', 'right', 'right', 'right', 'down', 'down'], 6, 'right'),
    })),
    plain(coreLevel(3, 4, {
      title: 'Un camino con vueltas',
      say: 'Seguí las flechas una por una. ¿Dónde se va a quedar Brote? Tocá ese lugar y probá.',
      ...predict(openBoard({ cols: 5, rows: 4, start: [4, 3], goal: null, seed: 1304, rocks: [[1, 1], [3, 0]], grass: [[0, 3], [0, 0], [4, 0]] }),
        cmdProgram(['up', 'left', 'left', 'up', 'up'])),
    })),
  ],
  boss: bossLevel(3, {
    title: 'Once flechas y una equivocada',
    say: 'Un camino muy largo, con dos semillas. Una sola flecha está mal: encontrala y arreglala.',
    ...fixPlan(openBoard({ cols: 6, rows: 4, start: [0, 3], goal: [5, 3], seed: 1309, pickups: [[1, 0], [4, 0]], rocks: [[2, 1], [3, 1]], puddles: [[3, 3]], grass: [[2, 3], [5, 0]] }),
      ['up', 'up', 'up', 'right', 'right', 'right', 'right', 'down', 'down', 'down', 'right'], 8, 'left'),
  }),
};

// ------------------------------------------------------------------ 5 · ¿Cuántas veces? (complete the count, count the passes)

export const SHEET_5: Built = {
  core: [
    essential(coreLevel(5, 1, {
      title: '¿Cuántas veces para llegar a la esquina?',
      say: '¿Cuántas veces hay que repetir? Contá los pasos hasta la esquina y tocá el número.',
      ...complete(carvedBoard([0, 1], [...times(5, 'right'), 'up'], { seed: 1501 }),
        [loop(0, ['right']), cmd('up')], [loop(5, ['right']), cmd('up')]),
    })),
    plain(coreLevel(5, 2, {
      title: 'Contar las vueltas',
      say: 'El repetir hace la flecha varias veces: contá los puntitos. ¿Dónde va a terminar Brote? Tocá ese lugar y probá.',
      ...predict(openBoard({ cols: 6, rows: 3, start: [0, 1], goal: null, seed: 1502, rocks: [[3, 0], [5, 2]], grass: [[1, 2], [5, 0]] }),
        [loop(4, ['right'])]),
    })),
    essential(coreLevel(5, 3, {
      title: 'Escalones y un salto abajo',
      say: 'Subí los escalones y bajá hasta la semilla. ¿Cuántas veces se repiten los escalones? Tocá el número.',
      ...complete(carvedBoard([0, 4], [...times(3, 'up', 'right'), 'down'], { seed: 1503 }),
        [loop(0, ['up', 'right']), cmd('down')], [loop(3, ['up', 'right']), cmd('down')]),
    })),
    plain(coreLevel(5, 4, {
      title: 'La escalera que baja',
      say: 'Contá cuántas veces baja el escalón. ¿Dónde se queda Brote? Tocá ese lugar y probá.',
      ...predict(openBoard({ cols: 5, rows: 4, start: [0, 0], goal: null, seed: 1504, rocks: [[3, 0], [0, 3]], grass: [[4, 1], [1, 3]] }),
        [loop(3, ['down', 'right'])]),
    })),
  ],
  boss: bossLevel(5, {
    title: 'Dos números que faltan',
    say: 'Faltan dos números: cuántas veces a la derecha y cuántas para arriba. Contá los dos y tocalos.',
    ...complete(carvedBoard([0, 4], [...times(4, 'right'), ...times(3, 'up'), 'right'], { seed: 1509 }),
      [loop(0, ['right']), loop(0, ['up']), cmd('right')], [loop(4, ['right']), loop(3, ['up']), cmd('right')]),
  }),
};

// ------------------------------------------------------------------ 10 · Vuelta: el río (repeat again, on stepping stones)

export const SHEET_10: Built = {
  core: [
    essential(coreLevel(10, 1, {
      title: 'Piedras para cruzar el río',
      say: 'Llegamos al río. Cruzalo por las piedras hasta la otra orilla. Hay pocos renglones: usá repetir.',
      worlds: [riverStrip(9, 2001)],
      blocks: ['right', 'repeat'],
      slots: 2,
      solution: [loop(8, ['right'])],
    })),
    plain(coreLevel(10, 2, {
      title: 'Escalera de piedras',
      say: 'Las piedras suben como una escalera. ¿Qué se repite?',
      worlds: [carvedBoard([0, 3], times(3, 'right', 'up'), { seed: 2002, look: 'river' })],
      blocks: ['up', 'right', 'repeat'],
      slots: 2,
      solution: [loop(3, ['right', 'up'])],
    })),
    essential(coreLevel(10, 3, {
      title: 'La bajada del río',
      say: 'Bajá por las piedras, juntá la semilla y llevala a la maceta. Buscá los tres pasos que se repiten.',
      worlds: [carvedBoard([0, 0], times(3, 'right', 'right', 'down'), { seed: 2003, seedAt: 4, look: 'river' })],
      blocks: ['down', 'right', 'repeat'],
      slots: 3,
      solution: [loop(3, ['right', 'right', 'down'])],
    })),
    plain(coreLevel(10, 4, {
      title: '¿Dónde sale del agua?',
      say: 'Brote cruza el arroyo por una piedra. ¿Dónde va a terminar? Tocá ese lugar y probá.',
      ...predict(openBoard({ cols: 6, rows: 4, start: [0, 3], goal: null, seed: 2004, water: [[3, 0], [3, 1], [3, 3]], ford: [[3, 2]], rocks: [[5, 3]], look: 'river', grass: [[0, 0], [1, 1], [5, 0]] }),
        [loop(2, ['right', 'right', 'up'])]),
    })),
  ],
  boss: bossLevel(10, {
    title: 'El puente de piedras',
    say: 'Subí por las piedras, juntá la semilla de arriba y bajá del otro lado hasta la maceta.',
    worlds: [carvedBoard([0, 4], [...times(4, 'right', 'up'), ...times(4, 'right', 'down')], { seed: 2009, seedAt: 8, look: 'river' })],
    blocks: ['up', 'down', 'right', 'repeat'],
    slots: 4,
    solution: [loop(4, ['right', 'up']), loop(4, ['right', 'down'])],
  }),
};

// ------------------------------------------------------------------ 11 · Ahorrá (the pattern in their own solution: the gold stamp)

export const SHEET_11: Built = {
  core: [
    essential(coreLevel(11, 1, {
      title: 'Siete piedras seguidas',
      say: 'Cruzá el río con flechas, una por piedra. Después buscá el sello dorado: con menos renglones.',
      ...withGold(flat(riverStrip(8, 2101)), [loop(7, ['right'])]),
    })),
    plain(coreLevel(11, 2, {
      title: 'La escalera larga',
      say: 'Subí la escalera de piedras con flechas. Mirá tu camino: ¿qué se repite? Con eso ganás el sello dorado.',
      ...withGold(flat(carvedBoard([0, 4], times(4, 'right', 'up'), { seed: 2102, look: 'river' })), [loop(4, ['right', 'up'])]),
    })),
    essential(coreLevel(11, 3, {
      title: 'Ahorrar desde el principio',
      say: 'Ahora hay pocos renglones desde el principio. Buscá lo que se repite y usá repetir.',
      worlds: [carvedBoard([0, 0], times(3, 'down', 'right', 'right'), { seed: 2103, look: 'river' })],
      blocks: ['down', 'right', 'repeat'],
      slots: 3,
      solution: [loop(3, ['down', 'right', 'right'])],
    })),
    plain(coreLevel(11, 4, {
      title: 'La semilla en la bajada',
      say: 'Bajá por las piedras, juntá la semilla y llevala a la maceta. Después, el sello dorado.',
      ...withGold(flat(carvedBoard([0, 0], times(4, 'right', 'down'), { seed: 2104, seedAt: 3, look: 'river' })), [loop(4, ['right', 'down'])]),
    })),
  ],
  boss: bossLevel(11, {
    title: 'Doce piedras: subir y bajar',
    say: 'El camino más largo del río: doce piedras, la semilla arriba y la maceta abajo. ¿Te animás al sello dorado?',
    ...withGold(flat(carvedBoard([0, 3], [...times(3, 'right', 'up'), ...times(3, 'right', 'down')], { seed: 2109, seedAt: 6, look: 'river' })),
      [loop(3, ['right', 'up']), loop(3, ['right', 'down'])]),
  }),
};

// ------------------------------------------------------------------ 12 · El repetir roto (a wrong count, an extra card inside)

export const SHEET_12: Built = {
  core: [
    essential(coreLevel(12, 1, {
      title: 'El repetir no alcanza',
      say: 'Este repetir está roto: Brote se queda en el medio del río. Probá y arreglá el número.',
      ...fix(riverStrip(9, 2201), [loop(4, ['right'])], [loop(8, ['right'])]),
    })),
    plain(coreLevel(12, 2, {
      title: 'Un bloque de más',
      say: 'Adentro del repetir hay un bloque de más. Probá, mirá dónde se choca Brote y sacalo.',
      ...fix(carvedBoard([0, 3], times(3, 'right', 'up'), { seed: 2202, look: 'river' }), [loop(3, ['right', 'up', 'up'])], [loop(3, ['right', 'up', HOLE])]),
    })),
    essential(coreLevel(12, 3, {
      title: 'Una flecha al revés',
      say: 'Una flecha del repetir apunta para el lado equivocado. Probá, sacala y poné la buena.',
      ...fix(carvedBoard([0, 0], times(3, 'right', 'down', 'right'), { seed: 2203, look: 'river' }), [loop(3, ['right', 'up', 'right'])], [loop(3, ['right', 'down', 'right'])]),
    })),
    plain(coreLevel(12, 4, {
      title: 'Falta repetir más',
      say: 'Brote no llega a la semilla. ¿Cuántas veces tiene que repetir? Arreglá el número.',
      ...fix(carvedBoard([0, 0], times(4, 'down', 'right'), { seed: 2204, seedAt: 5, look: 'river' }), [loop(2, ['down', 'right'])], [loop(4, ['down', 'right'])]),
    })),
  ],
  boss: bossLevel(12, {
    title: 'El valle: dos repetir, uno roto',
    say: 'Bajá al valle, juntá la semilla y subí hasta la maceta. Uno de los dos repetir está roto: arreglalo.',
    ...fix(carvedBoard([0, 0], [...times(3, 'right', 'down'), ...times(3, 'right', 'up')], { seed: 2209, seedAt: 6, look: 'river' }),
      [loop(3, ['right', 'down']), loop(2, ['right', 'up'])], [loop(3, ['right', 'down']), loop(3, ['right', 'up'])]),
  }),
};

// ------------------------------------------------------------------ 13 · Antes y después (steps, a repeat, steps again)

export const SHEET_13: Built = {
  core: [
    essential(coreLevel(13, 1, {
      title: 'Un paso antes y un paso después',
      say: 'El repetir ya está. Falta un paso antes y un paso después. Poné las flechas en los renglones vacíos.',
      ...complete(carvedBoard([0, 1], ['up', ...times(5, 'right'), 'down'], { seed: 2301, look: 'river' }),
        [cmd(HOLE), loop(5, ['right']), cmd(HOLE)], [cmd('up'), loop(5, ['right']), cmd('down')]),
    })),
    plain(coreLevel(13, 2, {
      title: 'Subir la cascada',
      say: 'Un paso, después repetir para subir, y otro paso al final. Pensá qué va antes y qué va después.',
      worlds: [carvedBoard([0, 4], ['right', ...times(4, 'up'), 'right'], { seed: 2302, look: 'river' })],
      blocks: ['up', 'right', 'repeat'],
      slots: 3,
      solution: [cmd('right'), loop(4, ['up']), cmd('right')],
    })),
    essential(coreLevel(13, 3, {
      title: 'Bajar, subir la escalera y seguir',
      say: 'Primero bajá una piedra, después subí la escalera juntando la semilla, y al final un paso hasta la maceta.',
      worlds: [carvedBoard([0, 3], ['down', ...times(3, 'right', 'up'), 'right'], { seed: 2303, seedAt: 5, look: 'river' })],
      blocks: ['up', 'down', 'right', 'repeat'],
      slots: 4,
      solution: [cmd('down'), loop(3, ['right', 'up']), cmd('right')],
    })),
    plain(coreLevel(13, 4, {
      title: 'Antes, repetir, después',
      say: 'Un paso antes, el repetir y un paso después. ¿Dónde termina Brote? Tocá ese lugar y probá.',
      ...predict(openBoard({ cols: 6, rows: 4, start: [0, 2], goal: null, seed: 2304, water: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]], rocks: [[5, 3]], look: 'river', grass: [[1, 3], [4, 3], [5, 1]] }),
        [cmd('up'), loop(3, ['right']), cmd('down')]),
    })),
  ],
  boss: bossLevel(13, {
    title: 'La isla: antes, repetir y después',
    say: 'Dos pasos antes, una escalera de piedras y dos pasos después, con la semilla en el medio. Seis renglones.',
    worlds: [carvedBoard([0, 4], [...times(2, 'right'), ...times(3, 'up', 'right'), ...times(2, 'down')], { seed: 2309, seedAt: 5, look: 'river' })],
    blocks: ['up', 'down', 'right', 'repeat'],
    slots: 6,
    solution: [cmd('right'), cmd('right'), loop(3, ['up', 'right']), cmd('down'), cmd('down')],
  }),
};
