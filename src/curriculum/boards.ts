// Builders for the handmade levels of the year: open boards with rocks,
// puddles and seeds, and paths carved in stone (the staircases, ramps and
// hills of "repetir", like the demo's 1ro-2). By the river (sheets 10–17) a
// carved path becomes stepping stones across the water. Pure data helpers.

import type { LevelDef, PaletteBlock } from '../game/levels';
import { NO_GOAL } from '../game/formats';
import { DELTA, obstacleAt, type Board, type Cell, type Deco, type Dir, type Obstacle, type ObstacleKind, type Program } from '../game/model';
import { coreId, bossId } from './model';

export const ARROWS: PaletteBlock[] = ['left', 'up', 'down', 'right'];

export const loop = (count: number, body: Dir[] | string[]): Program[number] => ({ t: 'loop', count, body: [...body] });

/** The cells walked from `start` by `moves`, the start included. */
export function walk(start: Cell, moves: readonly Dir[]): Cell[] {
  const out = [start];
  for (const d of moves) {
    const last = out[out.length - 1];
    out.push({ c: last.c + DELTA[d][0], r: last.r + DELTA[d][1] });
  }
  return out;
}

/** Tufts of grass on these cells (decoration), placed like the demo's. */
export const grass = (seed: number, cells: [number, number][]): Deco[] =>
  cells.map(([c, r], i) => ({ c, r, dx: ((seed * 7 + i * 13) % 30) - 15, dy: 22 + ((seed + i * 5) % 12), seed: seed * 10 + i }));

/**
 * The river look (sheets 10–17). A path carved in stone becomes stepping
 * stones across the water: the stone is water, every cell of the path a
 * stone to stand on. An open board keeps what it has, on a sandy bank.
 */
export function riverize(b: Board): Board {
  if (!b.obstacles.some((o) => o.kind === 'earth')) return { ...b, look: 'river' };
  const ford: Cell[] = [];
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) if (!obstacleAt(b, c, r)) ford.push({ c, r });
  return { ...b, look: 'river', obstacles: b.obstacles.map((o) => (o.kind === 'earth' ? { ...o, kind: 'water' as const } : o)), ford };
}

/**
 * An open board: rocks, puddles and water block the way, seeds are picked up
 * before the pot. `goal: null` is a board with no goal (predict pages): the
 * child's ring is the target. `ford`: stepping stones in the water.
 */
export function openBoard(o: {
  cols: number; rows: number; start: [number, number]; goal: [number, number] | null; seed: number;
  rocks?: [number, number][]; puddles?: [number, number][]; water?: [number, number][]; ford?: [number, number][];
  pickups?: [number, number][]; grass?: [number, number][]; look?: 'river';
}): Board {
  const obstacle = (kind: ObstacleKind) => ([c, r]: [number, number], i: number): Obstacle => ({ c, r, kind, seed: o.seed * 3 + i });
  const pickups = (o.pickups ?? []).map(([c, r]) => ({ c, r }));
  return {
    cols: o.cols, rows: o.rows,
    start: { c: o.start[0], r: o.start[1] },
    goal: o.goal ? { c: o.goal[0], r: o.goal[1] } : NO_GOAL,
    goalKind: !o.goal ? 'none' : pickups.length ? 'pot' : 'seed',
    obstacles: [...(o.rocks ?? []).map(obstacle('rock')), ...(o.puddles ?? []).map(obstacle('puddle')), ...(o.water ?? []).map(obstacle('water'))],
    pickups,
    deco: grass(o.seed, o.grass ?? []),
    seed: o.seed,
    ...(o.look ? { look: o.look } : {}),
    ...(o.ford ? { ford: o.ford.map(([c, r]) => ({ c, r })) } : {}),
  };
}

/**
 * A path carved in stone: the board is the path's bounding box, every other
 * cell is stone, so the only way is the path. `seedAt`: a seed to pick up on
 * the way (an index into the path); the goal is then the pot. By the river
 * (`look: 'river'`) the path is stepping stones across the water.
 */
export function carvedBoard(start: [number, number], moves: readonly Dir[], o: { seed: number; seedAt?: number; look?: 'river' }): Board {
  const path = walk({ c: start[0], r: start[1] }, moves);
  const cols = Math.max(...path.map((x) => x.c)) + 1, rows = Math.max(...path.map((x) => x.r)) + 1;
  const on = new Set(path.map((x) => `${x.c},${x.r}`));
  const obstacles: Obstacle[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!on.has(`${c},${r}`)) obstacles.push({ c, r, kind: 'earth', seed: o.seed + c * 5 + r });
  const pickups = o.seedAt != null ? [path[o.seedAt]] : [];
  const b: Board = {
    cols, rows, start: path[0], goal: path[path.length - 1], goalKind: pickups.length ? 'pot' : 'seed',
    obstacles, pickups, deco: [], seed: o.seed,
  };
  return o.look === 'river' ? riverize(b) : b;
}

type LevelBits = Pick<LevelDef, 'title' | 'say' | 'worlds' | 'blocks' | 'slots' | 'solution'>
  & Partial<Pick<LevelDef, 'intro' | 'format' | 'given' | 'save' | 'music' | 'guarda'>>;

/** A core level of a sheet of 1ro: a program page, blocks with picture and word. */
export const coreLevel = (sheet: number, k: number, l: LevelBits): LevelDef =>
  ({ id: coreId({ grade: '1ro', n: sheet }, k), grade: '1ro', page: k, mode: 'program', blockLabel: 'picture-word', ...l });

/** The boss of a sheet of 1ro. */
export const bossLevel = (sheet: number, l: LevelBits): LevelDef =>
  ({ id: bossId({ grade: '1ro', n: sheet }), grade: '1ro', page: 0, mode: 'program', blockLabel: 'picture-word', ...l });
