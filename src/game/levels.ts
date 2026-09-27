// The level runtime's data: every level of the demo is one declarative
// LevelDef in LEVELS. The home page, the level screen, the help and the
// solvability tests all read from here; adding a level is adding an entry.

import type { Board, Deco, Obstacle, Program } from './model';
import { cmdProgram } from './model';
import type { MusicDef } from './music';
import type { RealtimeDef, Rule } from './rules';

export type GradeId = 'sala4' | 'sala5' | '1ro' | '2do' | '3ro';

/** The five grades of the tramo, in order. `label` is for the adult (small print). */
export const GRADES: readonly { id: GradeId; label: string; color: string }[] = [
  { id: 'sala4', label: 'Sala 4', color: '#e7a3a0' },
  { id: 'sala5', label: 'Sala 5', color: '#f0d27a' },
  { id: '1ro', label: '1ro', color: '#a4b86d' },
  { id: '2do', label: '2do', color: '#7298c1' },
  { id: '3ro', label: '3ro', color: '#de8a56' },
];

/**
 * How the child drives Brote:
 * - `direct`: big arrow buttons, each tap is one step right away (sala 4). No program.
 * - `program`: blocks stacked under the start block, then ▶ Probar (sala 5 → 2do).
 * - `realtime`: rule cards that keep reacting while the game runs (3ro, game/rules.ts).
 */
export type Mode = 'direct' | 'program' | 'realtime';

/**
 * How a block is labelled (design rule 5): sala 5 picture only; 1ro picture
 * plus one word; 2do and 3ro word plus picture.
 */
export type BlockLabel = 'picture' | 'picture-word' | 'word-picture';

/** A palette entry: a command id (see model.CommandId), a C-block, or (3ro) a hat or an action of game/rules. */
export type PaletteBlock = string | 'repeat' | 'repeat-goal';

/**
 * The practice formats of a program page (1ro's year, game/formats.ts):
 * - `solve` (the default): an empty notebook of `slots` lines.
 * - `complete`: `given` arrives partly built. Its cards and counts are pinned
 *   to the page; its empty lines (model.HOLE) and missing counts (0) are the
 *   child's. `solution` is `given` filled in.
 * - `fix`: `given` arrives complete with exactly one mistake (a wrong arrow,
 *   a count too short, an extra card in a repeat). Every line can be changed
 *   in place. `solution` is `given` fixed in place (an extra card becomes an
 *   empty line), so the two differ in exactly one line or count.
 * - `predict`: `given` is read-only (and equals `solution`); the child taps
 *   the cell where Brote will end, then ▶ plays it. The board has no goal.
 */
export type Format = 'solve' | 'complete' | 'fix' | 'predict';

/**
 * Save blocks: after a page is solved, a gold seal offers the same board with
 * fewer notebook lines (the fewest cards that win); solving it stamps the page
 * in gold. Optional, never in the way.
 */
export interface SaveChallenge {
  slots: number;
  /** A program of `slots` cards that wins (the tests prove none with fewer does). */
  solution: Program;
  /** The palette of the challenge; by default the page's blocks and "repetir". */
  blocks?: PaletteBlock[];
}

export interface LevelDef {
  /** Stable id used in the URL: `#/nivel/<id>`. */
  id: string;
  grade: GradeId;
  /** Page within the grade (1 or 2). */
  page: number;
  /** For the adult: shown small in the bar and on the home page. */
  title: string;
  /** The instruction, spoken on entry and by the 🔊 button (es-AR). */
  say: string;
  mode: Mode;
  /**
   * The board(s). Most levels have one; a level can ask one program to work
   * in several worlds at once (2do level 2). The UI draws worlds[0] for now.
   */
  worlds: Board[];
  /** Palette, in order. Only these blocks exist in the level (rule 7). */
  blocks: PaletteBlock[];
  blockLabel: BlockLabel;
  /** Program mode: the notebook has exactly this many slots (rule 8). */
  slots?: number;
  /** A reference solution; the tests check it wins in every world. Direct mode: plain steps. */
  solution: Program;
  /** 2do: the board is covered and only the cells next to Brote show. */
  fog?: boolean;
  /**
   * A new concept, shown by the ghost hand with real edits: it builds this
   * program (the idea, not the answer). It plays by itself once, the first
   * time the notebook is full (`full`) or a run without the idea fails
   * (`fail`), and again from ✋ while the program has no loop.
   */
  intro?: { program: Program; after: 'full' | 'fail' };
  /** 3ro: the rules, how the page is won and what falls from the sky. `solution` stays empty. */
  realtime?: RealtimeDef;
  /** 1ro's practice format (see Format); a plain page when absent. */
  format?: Format;
  /** What the notebook starts with on complete, fix and predict pages. */
  given?: Program;
  /** The gold-stamp challenge of the page, if it has one. */
  save?: SaveChallenge;
  /**
   * 1ro's music recess (sheet 9): the notebook holds note cards and the page
   * is won by playing its song on the xylophone (game/music.ts). The one
   * world is the xylophone as a board (`music.xylophone`).
   */
  music?: MusicDef;
}

const grass = (seed: number, cells: [number, number][]): Deco[] =>
  cells.map(([c, r], i) => ({ c, r, dx: ((seed * 7 + i * 13) % 30) - 15, dy: 22 + ((seed + i * 5) % 12), seed: seed * 10 + i }));
const rock = (c: number, r: number, seed = 3): Obstacle => ({ c, r, kind: 'rock', seed });
const ARROWS = ['left', 'up', 'down', 'right'];
/** 2do: a one-row path to the right with rocks on it. */
const strip = (cols: number, goal: number, rocks: number[], seed: number): Board => ({
  cols, rows: 1, start: { c: 0, r: 0 }, goal: { c: goal, r: 0 }, goalKind: 'seed',
  obstacles: rocks.map((c, i) => rock(c, 0, seed + i)), pickups: [], deco: [], seed,
});
const WALK_OR_JUMP: Program = [{ t: 'loop', count: 'goal', body: ['ifrock:right', 'right'] }];
/** A stone mass: every cell of the board but `path` (1ro's staircase is carved into it). */
const carved = (cols: number, rows: number, path: [number, number][], seed: number): Obstacle[] => {
  const out: Obstacle[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!path.some(([pc, pr]) => pc === c && pr === r)) out.push({ c, r, kind: 'earth', seed: seed + c * 5 + r });
  }
  return out;
};
const STAIRS: [number, number][] = [[0, 4], [1, 4], [1, 3], [2, 3], [2, 2], [3, 2], [3, 1], [4, 1], [4, 0]];
/** 3ro: one rule per arrow key, each moving Brote that way. */
const arrowRule = (d: 'left' | 'up' | 'down' | 'right'): Rule => ({ hat: `key:${d}`, actions: [d] });

export const LEVELS: LevelDef[] = [
  {
    id: 'sala4-1',
    grade: 'sala4',
    page: 1,
    title: 'Llegar a la semilla',
    say: 'Llevá a Brote hasta la semilla. Tocá las flechas.',
    mode: 'direct',
    worlds: [{
      cols: 5, rows: 3, start: { c: 0, r: 2 }, goal: { c: 3, r: 0 }, goalKind: 'seed',
      obstacles: [], pickups: [], deco: grass(4, [[1, 0], [4, 2], [2, 1]]), seed: 41,
    }],
    blocks: ARROWS,
    blockLabel: 'picture',
    solution: cmdProgram(['right', 'right', 'right', 'up', 'up']),
  },
  {
    id: 'sala4-2',
    grade: 'sala4',
    page: 2,
    title: 'Esquivar la piedra',
    say: 'Llevá a Brote hasta la semilla. ¡Cuidado con la piedra!',
    mode: 'direct',
    worlds: [{
      cols: 5, rows: 3, start: { c: 0, r: 1 }, goal: { c: 4, r: 1 }, goalKind: 'seed',
      obstacles: [rock(2, 1, 5)], pickups: [], deco: grass(7, [[0, 0], [3, 2], [4, 0]]), seed: 52,
    }],
    blocks: ARROWS,
    blockLabel: 'picture',
    solution: cmdProgram(['right', 'up', 'right', 'right', 'down', 'right']),
  },
  {
    id: 'sala5-1',
    grade: 'sala5',
    page: 1,
    title: 'Planear tres pasos',
    say: 'Armá el camino de Brote con las flechas, en el cuaderno. Después tocá Probar.',
    mode: 'program',
    worlds: [{
      cols: 4, rows: 3, start: { c: 0, r: 2 }, goal: { c: 2, r: 1 }, goalKind: 'seed',
      obstacles: [], pickups: [], deco: grass(3, [[3, 0], [0, 0], [3, 2]]), seed: 63,
    }],
    blocks: ARROWS,
    blockLabel: 'picture',
    slots: 3,
    solution: cmdProgram(['right', 'right', 'up']),
  },
  {
    id: 'sala5-2',
    grade: 'sala5',
    page: 2,
    title: 'Juntar la semilla y plantarla',
    say: 'Primero Brote junta la semilla, y después la planta en la maceta. Armá el camino y tocá Probar.',
    mode: 'program',
    worlds: [{
      cols: 5, rows: 3, start: { c: 0, r: 2 }, goal: { c: 3, r: 2 }, goalKind: 'pot',
      obstacles: [], pickups: [{ c: 1, r: 1 }], deco: grass(9, [[4, 0], [2, 0], [4, 2]]), seed: 74,
    }],
    blocks: ARROWS,
    blockLabel: 'picture',
    slots: 5,
    solution: cmdProgram(['up', 'right', 'right', 'right', 'down']),
  },
  {
    id: '1ro-1',
    grade: '1ro',
    page: 1,
    title: 'Repetir: muchos pasos, pocos renglones',
    say: 'Llevá a Brote hasta la semilla. Está lejos, y el cuaderno tiene pocos renglones.',
    mode: 'program',
    worlds: [{
      cols: 9, rows: 3, start: { c: 0, r: 1 }, goal: { c: 8, r: 1 }, goalKind: 'seed',
      obstacles: [], pickups: [], deco: grass(11, [[1, 0], [3, 2], [5, 0], [7, 2], [6, 0]]), seed: 85,
    }],
    blocks: ['right', 'repeat'],
    blockLabel: 'picture-word',
    slots: 3,
    solution: [{ t: 'loop', count: 8, body: ['right'] }],
    intro: { program: [{ t: 'loop', count: 3, body: ['right'] }], after: 'full' },
  },
  {
    id: '1ro-2',
    grade: '1ro',
    page: 2,
    title: 'La escalera: repetir → ↑',
    say: 'Brote tiene que subir la escalera hasta la semilla. Mirá bien los escalones: se repiten.',
    mode: 'program',
    worlds: [{
      cols: 5, rows: 5, start: { c: 0, r: 4 }, goal: { c: 4, r: 0 }, goalKind: 'seed',
      // the stairs are carved in stone: steps below, a stone wall above, so only the stairs lead up
      obstacles: carved(5, 5, STAIRS, 96),
      pickups: [], deco: [], seed: 96,
    }],
    blocks: ['right', 'up', 'repeat'],
    blockLabel: 'picture-word',
    slots: 3,
    solution: [{ t: 'loop', count: 4, body: ['right', 'up'] }],
  },
  {
    id: '2do-1',
    grade: '2do',
    page: 1,
    title: 'Niebla: repetir hasta llegar, si hay piedra saltar',
    say: 'Hay niebla: Brote solo ve lo que tiene al lado. Hacé que camine hasta la semilla, y que salte si hay una piedra.',
    mode: 'program',
    worlds: [strip(9, 8, [3, 6], 107)],
    blocks: ['right', 'ifrock:right', 'repeat-goal'],
    blockLabel: 'word-picture',
    slots: 3,
    solution: WALK_OR_JUMP,
    fog: true,
    intro: { program: [{ t: 'loop', count: 'goal', body: ['right'] }], after: 'fail' },
  },
  {
    id: '2do-2',
    grade: '2do',
    page: 2,
    title: 'Tres caminos, un programa',
    say: 'Un solo programa para los tres caminos. Tiene que llegar a la semilla en los tres a la vez.',
    mode: 'program',
    worlds: [strip(8, 6, [2, 5], 118), strip(8, 7, [1, 4], 129), strip(8, 5, [3], 131)],
    blocks: ['right', 'ifrock:right', 'repeat-goal'],
    blockLabel: 'word-picture',
    slots: 3,
    solution: WALK_OR_JUMP,
  },
  {
    id: '3ro-1',
    grade: '3ro',
    page: 1,
    title: 'Mi primer juego: cuando aprieto una flecha, Brote se mueve',
    say: 'Ahora armás un juego. Poné reglas: cuando aprieto una flecha, Brote se mueve. Tocá Probar y jugá con las flechas hasta la semilla.',
    mode: 'realtime',
    worlds: [{
      cols: 6, rows: 4, start: { c: 0, r: 3 }, goal: { c: 5, r: 0 }, goalKind: 'seed',
      // a wall near the start and one near the seed: → and ↑ are not enough, the way round needs ↓
      obstacles: [rock(2, 3, 21), rock(2, 2, 23), rock(4, 1, 25), rock(4, 0, 27)],
      pickups: [], deco: grass(17, [[0, 0], [1, 3], [5, 3], [3, 0]]), seed: 141,
    }],
    blocks: ['key:left', 'key:up', 'key:down', 'key:right', 'left', 'up', 'down', 'right'],
    blockLabel: 'word-picture',
    solution: [],
    realtime: {
      initial: [],
      // in the order ✋ builds them: the rules the way needs first
      solution: [arrowRule('right'), arrowRule('up'), arrowRule('down'), arrowRule('left')],
      win: { kind: 'goal' },
      maxActions: 2,
      intro: arrowRule('right'),
    },
  },
  {
    id: '3ro-2',
    grade: '3ro',
    page: 2,
    title: 'Siempre que Brote toque una semilla, suma un punto',
    say: 'Caen semillas del cielo. Juntá cinco. Hace falta una regla nueva: siempre que Brote toque una semilla, suma un punto.',
    mode: 'realtime',
    worlds: [{
      // no goal cell: the page is won by points
      cols: 6, rows: 4, start: { c: 2, r: 3 }, goal: { c: 0, r: 0 }, goalKind: 'none',
      obstacles: [], pickups: [], deco: grass(19, [[0, 1], [4, 0], [5, 2], [1, 2]]), seed: 152,
    }],
    blocks: ['key:left', 'key:right', 'touch:seed', 'left', 'right', 'score'],
    blockLabel: 'word-picture',
    solution: [],
    realtime: {
      initial: [arrowRule('left'), arrowRule('right')],
      solution: [arrowRule('left'), arrowRule('right'), { hat: 'touch:seed', actions: ['score'] }],
      win: { kind: 'score', n: 5 },
      // slow and calm: a seed every 3 to 4 seconds, about 8 seconds to fall
      spawner: { every: [30, 42], speed: 0.045, seed: 7, first: 10 },
      maxActions: 2,
    },
  },
];

export const levelById = (id: string) => LEVELS.find((l) => l.id === id) ?? null;
export const levelsOf = (grade: GradeId) => LEVELS.filter((l) => l.grade === grade).sort((a, b) => a.page - b.page);
/** The level after this one in the tramo, or null at the end. */
export const nextLevel = (id: string) => {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? LEVELS[i + 1] ?? null : null;
};
