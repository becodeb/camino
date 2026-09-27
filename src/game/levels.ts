// The level runtime's data: every level of the demo is one declarative
// LevelDef in LEVELS. The home page, the level screen, the help and the
// solvability tests all read from here; adding a level is adding an entry.

import type { Board, Deco, Obstacle, Program } from './model';
import { cmdProgram } from './model';

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
 * - `realtime`: rules that react to events while the game runs (3ro; engine added in T3).
 */
export type Mode = 'direct' | 'program' | 'realtime';

/**
 * How a block is labelled (design rule 5): sala 5 picture only; 1ro picture
 * plus one word; 2do and 3ro word plus picture.
 */
export type BlockLabel = 'picture' | 'picture-word' | 'word-picture';

/** A palette entry: a command id (see model.CommandId) or a C-block. */
export type PaletteBlock = string | 'repeat' | 'repeat-goal';

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
}

const grass = (seed: number, cells: [number, number][]): Deco[] =>
  cells.map(([c, r], i) => ({ c, r, dx: ((seed * 7 + i * 13) % 30) - 15, dy: 22 + ((seed + i * 5) % 12), seed: seed * 10 + i }));
const rock = (c: number, r: number, seed = 3): Obstacle => ({ c, r, kind: 'rock', seed });
const ARROWS = ['left', 'up', 'down', 'right'];

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
];

export const levelById = (id: string) => LEVELS.find((l) => l.id === id) ?? null;
export const levelsOf = (grade: GradeId) => LEVELS.filter((l) => l.grade === grade).sort((a, b) => a.page - b.page);
/** The level after this one in the tramo, or null at the end. */
export const nextLevel = (id: string) => {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? LEVELS[i + 1] ?? null : null;
};
