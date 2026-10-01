// The placement ladder's own pages (round 2): twelve hand-designed items,
// one per concept rung, the same for every child. Round 1 played sheet pages
// that looked too much alike (two one-row strips in a row, three stone
// staircases in a row); the teacher asked for variety: "una escalera y
// después otra", "poner algún bloque antes del repetir". So every item
// differs from its neighbours in board size and shape, in what is on it
// (rocks, puddles, a river with stepping stones, a stone staircase, seeds to
// collect, fog, three worlds, a game), in where the goal is, and in its twist.
//
//  1 sequence           forest 4×3, two puddles in the middle, the seed up on the right
//  2 long_sequence      forest 6×4, two seeds in order (right, then down), the pot at the bottom
//  3 fix                river 6×3, a ford across; one arrow walks into the water
//  4 predict            forest 4×5 (tall), a program with two turns; tap where it ends
//  5 repeat             river 8×3, walk LEFT across the stones (the ghost shows repetir)
//  6 repeat_count       forest 3×6 chimney: up, up, … and two steps out; the count is missing
//  7 repeat_pattern     river staircase climbing ↑→ (5×5)
//  8 before_after_repeat forest 6×5: two steps to a second staircase, down it ↓→, one step after
//  9 fog_si             sandy bank 7×1 in fog, two rocks (the ghost shows repetir hasta llegar)
// 10 three_worlds       three short forest paths (6, 5, 6 cells) and one program
// 11 events_rules       a game: the ghost makes → and presses it; the way also needs ↑ (5×4)
// 12 rules_score        a game: seeds fall, ← → given; a new rule makes a seed worth a point (7×4)
//
// Titles are the bar's small print (a child may read them): kid-safe, with
// "Brote" (the chosen character's name is put in, characterName.ts).

import { shortestPlan } from '../game/engine';
import type { LevelDef, PaletteBlock } from '../game/levels';
import { HOLE, cmdProgram, type Board, type Dir, type Program } from '../game/model';
import type { Rule } from '../game/rules';
import { carvedBoard, grass, loop, openBoard } from '../curriculum/boards';

const cmd = (d: Dir | typeof HOLE): Program[number] => ({ t: 'cmd', cmd: d });
const times = (n: number, ...moves: Dir[]): Dir[] => Array.from({ length: n }, () => moves).flat();
const arrowRule = (d: Dir): Rule => ({ hat: `key:${d}`, actions: [d] });

type Bits = Omit<LevelDef, 'grade' | 'page' | 'mode' | 'blockLabel'> & Partial<Pick<LevelDef, 'mode' | 'blockLabel'>>;
/** A ladder page: the rung is its page number; 1ro's picture + word blocks up to rung 8, 2do's word + picture from 9. */
const item = (rung: number, l: Bits): LevelDef => ({
  grade: rung <= 8 ? '1ro' : rung <= 10 ? '2do' : '3ro',
  page: rung,
  mode: 'program',
  blockLabel: rung <= 8 ? 'picture-word' : 'word-picture',
  ...l,
});

/** A flat page: exactly as many lines as the shortest plan (with these arrows). */
function flat(board: Board, arrows: Dir[] = ['left', 'up', 'down', 'right']) {
  const plan = shortestPlan(board, arrows);
  if (!plan) throw new Error(`ladder board ${board.seed} has no way to the goal`);
  return { worlds: [board], blocks: arrows as PaletteBlock[], slots: plan.length, solution: cmdProgram(plan) };
}

/** A river crossing: the water between the banks and a ford of stepping stones. */
const river = (o: Parameters<typeof openBoard>[0]) => openBoard({ ...o, look: 'river' });

/** A one-row path to the right with rocks on it (2do's "si hay piedra"). */
function strip(cols: number, rocks: number[], seed: number, look?: 'river'): Board {
  return {
    cols, rows: 1, start: { c: 0, r: 0 }, goal: { c: cols - 1, r: 0 }, goalKind: 'seed',
    obstacles: rocks.map((c, i) => ({ c, r: 0, kind: 'rock' as const, seed: seed + i })),
    pickups: [], deco: [], seed, ...(look ? { look } : {}),
  };
}
const WALK_OR_JUMP: Program = [{ t: 'loop', count: 'goal', body: ['ifrock:right', 'right'] }];

// ------------------------------------------------------------------ 1 · sequence

const R1 = item(1, {
  id: 'pp-l1',
  title: 'Rodear los charcos',
  say: 'Llevá a Brote hasta la semilla. Los charcos no se pisan.',
  ...flat(openBoard({ cols: 4, rows: 3, start: [0, 2], goal: [3, 0], seed: 3101, puddles: [[1, 1], [2, 1]], grass: [[0, 0], [3, 2], [1, 0]] })),
});

// ------------------------------------------------------------------ 2 · long sequence, a turn, seeds in order

const R2 = item(2, {
  id: 'pp-l2',
  title: 'Dos semillas y la maceta',
  say: 'Juntá la semilla de arriba, después la de abajo, y llevalas a la maceta.',
  ...flat(openBoard({
    cols: 6, rows: 4, start: [0, 0], goal: [5, 3], seed: 3102,
    pickups: [[3, 0], [3, 3]], rocks: [[2, 1], [2, 2], [4, 1], [4, 2], [5, 0]], grass: [[0, 3], [1, 2], [5, 1]],
  })),
});

// ------------------------------------------------------------------ 3 · fix (one arrow into the water)

const FORD = { cols: 6, rows: 3, start: [0, 2] as [number, number], goal: [5, 0] as [number, number], seed: 3103,
  water: [[2, 0], [3, 0], [2, 2], [3, 2]] as [number, number][], ford: [[2, 1], [3, 1]] as [number, number][], grass: [[0, 0], [5, 2], [1, 0]] as [number, number][] };
const R3_PLAN: Dir[] = ['up', 'right', 'right', 'right', 'right', 'up', 'right'];
const R3 = item(3, {
  id: 'pp-l3',
  title: 'Una flecha se mete al agua',
  say: 'Brote se confundió de flecha y se mete al agua. Probá, buscá la flecha que está mal y cambiala.',
  worlds: [river(FORD)],
  format: 'fix',
  given: cmdProgram(R3_PLAN.map((d, i) => (i === 3 ? 'up' : d))),
  solution: cmdProgram(R3_PLAN),
  slots: R3_PLAN.length,
  blocks: ['up', 'right'],
});

// ------------------------------------------------------------------ 4 · predict (a tall board, two turns)

const R4_PROGRAM = cmdProgram(['up', 'up', 'up', 'right', 'right', 'down']);
const R4 = item(4, {
  id: 'pp-l4',
  title: '¿Dónde se queda Brote?',
  say: 'Seguí las flechas con el dedo. ¿Dónde se queda Brote? Tocá ese lugar y después Probar.',
  worlds: [openBoard({ cols: 4, rows: 5, start: [0, 4], goal: null, seed: 3104, rocks: [[1, 3], [3, 0], [2, 4]], grass: [[3, 4], [0, 0], [3, 2]] })],
  format: 'predict',
  given: R4_PROGRAM,
  solution: R4_PROGRAM,
  slots: R4_PROGRAM.length,
  blocks: ['up', 'down', 'right'],
});

// ------------------------------------------------------------------ 5 · repeat (walk left across the river)

const across: [number, number][] = [], banks: [number, number][] = [];
for (let c = 1; c < 7; c++) { banks.push([c, 0], [c, 2]); across.push([c, 1]); }
const R5 = item(5, {
  id: 'pp-l5',
  title: 'Cruzar el río para el otro lado',
  say: 'Cruzá el río por las piedras, para este lado, hasta la semilla. Hay pocos renglones.',
  worlds: [river({ cols: 8, rows: 3, start: [7, 1], goal: [0, 1], seed: 3105, water: banks, ford: across, grass: [[7, 0], [7, 2], [0, 0], [0, 2]] })],
  blocks: ['left', 'repeat'],
  slots: 2,
  solution: [loop(7, ['left'])],
  intro: { program: [loop(3, ['left'])], after: 'full' },
});

// ------------------------------------------------------------------ 6 · complete the count (a chimney)

const R6 = item(6, {
  id: 'pp-l6',
  title: '¿Cuántas veces para arriba?',
  say: 'Brote sube por la chimenea de piedra. ¿Cuántas veces sube? Contá los escalones y tocá el número.',
  worlds: [carvedBoard([0, 5], [...times(5, 'up'), 'right', 'right'], { seed: 3106 })],
  format: 'complete',
  given: [loop(0, ['up']), cmd('right'), cmd('right')],
  solution: [loop(5, ['up']), cmd('right'), cmd('right')],
  slots: 3,
  blocks: [],
});

// ------------------------------------------------------------------ 7 · repeat a pattern (a staircase ↑→)

const R7 = item(7, {
  id: 'pp-l7',
  title: 'La escalera de piedras',
  say: 'Subí la escalera de piedras hasta la semilla. Mirá bien: ¿qué se repite?',
  worlds: [carvedBoard([0, 4], times(4, 'up', 'right'), { seed: 3107, look: 'river' })],
  blocks: ['up', 'right', 'repeat'],
  slots: 2,
  solution: [loop(4, ['up', 'right'])],
});

// ------------------------------------------------------------------ 8 · steps before and after a repeat (a second, different staircase)

const R8 = item(8, {
  id: 'pp-l8',
  title: 'Caminar, bajar la escalera y un paso más',
  say: 'Caminá hasta la escalera, bajala hasta abajo y da un paso más hasta la semilla. Hay un renglón antes y otro después del repetir.',
  worlds: [carvedBoard([0, 0], ['right', 'right', ...times(3, 'down', 'right'), 'down'], { seed: 3108 })],
  blocks: ['down', 'right', 'repeat'],
  slots: 4,
  solution: [cmd('right'), cmd('right'), loop(3, ['down', 'right']), cmd('down')],
});

// ------------------------------------------------------------------ 9 · fog and "si hay piedra"

const R9 = item(9, {
  id: 'pp-l9',
  title: 'Niebla en la orilla',
  say: 'Hay niebla: Brote solo ve lo que tiene al lado. Hacé que camine hasta la semilla y que salte si hay una piedra.',
  worlds: [strip(7, [2, 5], 3109, 'river')],
  blocks: ['right', 'ifrock:right', 'repeat-goal'],
  slots: 3,
  solution: WALK_OR_JUMP,
  fog: true,
  intro: { program: [{ t: 'loop', count: 'goal', body: ['right'] }], after: 'fail' },
});

// ------------------------------------------------------------------ 10 · three worlds, one program (short paths)

const R10 = item(10, {
  id: 'pp-l10',
  title: 'Tres caminos cortos, un programa',
  say: 'Un solo programa para los tres caminos. Tiene que llegar a la semilla en los tres.',
  // the first rock right at the start: the look comes before the step
  worlds: [strip(6, [1, 4], 3110), strip(5, [3], 3111), strip(6, [2], 3112)],
  blocks: ['right', 'ifrock:right', 'repeat-goal'],
  slots: 3,
  solution: WALK_OR_JUMP,
});

// ------------------------------------------------------------------ 11 · a game: rules for the arrow keys

const R11 = item(11, {
  id: 'pp-l11',
  title: 'Un juego: cada flecha mueve a Brote',
  say: 'Esto es un juego: cuando aprieto una flecha, Brote se mueve. Mirá.',
  mode: 'realtime',
  worlds: [{
    cols: 5, rows: 4, start: { c: 0, r: 3 }, goal: { c: 4, r: 0 }, goalKind: 'seed',
    // → alone bumps the puddles, ↑ alone bumps the top puddle: the way needs both
    obstacles: [
      { c: 2, r: 3, kind: 'puddle', seed: 3111 }, { c: 3, r: 3, kind: 'puddle', seed: 3112 },
      { c: 0, r: 0, kind: 'puddle', seed: 3113 }, { c: 3, r: 1, kind: 'rock', seed: 3114 },
    ],
    pickups: [], deco: grass(3111, [[4, 3], [1, 0], [2, 1]]), seed: 3111,
  }],
  blocks: ['key:up', 'key:right', 'up', 'right'],
  solution: [],
  realtime: {
    initial: [],
    solution: [arrowRule('right'), arrowRule('up')],
    win: { kind: 'goal' },
    maxActions: 2,
    intro: arrowRule('right'),
    afterIntro: 'Ahora vos: tocá las flechas del teclado o de la pantalla para mover a Brote hasta la semilla.',
    noRule: 'Esa flecha todavía no tiene regla. Armala: cuando aprieto esa flecha, Brote se mueve.',
  },
});

// ------------------------------------------------------------------ 12 · a game with a score

const R12 = item(12, {
  id: 'pp-l12',
  title: 'Un juego: semillas que suman puntos',
  say: 'Caen semillas. Para juntar puntos hace falta una regla nueva: cuando Brote toca una semilla, suma un punto.',
  mode: 'realtime',
  worlds: [{
    cols: 7, rows: 4, start: { c: 3, r: 3 }, goal: { c: 0, r: 0 }, goalKind: 'none',
    obstacles: [], pickups: [], deco: grass(3121, [[0, 1], [6, 0], [5, 2], [1, 2]]), seed: 3121, look: 'river',
  }],
  blocks: ['key:left', 'key:right', 'touch:seed', 'left', 'right', 'score'],
  solution: [],
  realtime: {
    initial: [arrowRule('left'), arrowRule('right')],
    solution: [arrowRule('left'), arrowRule('right'), { hat: 'touch:seed', actions: ['score'] }],
    win: { kind: 'score', n: 4 },
    spawner: { every: [28, 38], speed: 0.05, seed: 11, first: 10 },
    maxActions: 2,
    intro: arrowRule('right'),
    afterIntro: 'Ahora vos: movete con las flechas del teclado o de la pantalla y juntá cuatro semillas.',
  },
});

/** The bank, rung 1 to 12. */
export const LADDER_ITEMS: readonly LevelDef[] = [R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12];
export const ladderItem = (id: string) => LADDER_ITEMS.find((l) => l.id === id) ?? null;
