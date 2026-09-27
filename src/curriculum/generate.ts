// Extras: levels made on the spot behind the three doors of a sheet. Ported
// and adapted from habilidades' generator (app/src/areas/algorithmic/
// generate.ts + search.ts @ 9b90d1d) to camino's engine: absolute arrows
// only, the notebook's lines as the block limit, seeds and the pot.
//
// Deterministic: a sheet, a door and an index always give the same level
// (the seed is shown in the dev drawer). Every level is proved solvable by
// running its reference solution, and its limits are checked with the
// engine's breadth-first search over Brote's states (cell + seeds collected).

import { rng } from '../ink/ink.js';
import { shortestPlan, simulate, solves } from '../game/engine';
import type { LevelDef, PaletteBlock } from '../game/levels';
import {
  DELTA, DIRS, cmdProgram, sameCell,
  type Board, type Cell, type Deco, type Dir, type Obstacle, type Program,
} from '../game/model';
import { DOOR_LABEL, extraId, type Door, type ExtraParams, type Sheet } from './model';

export const GENERATOR_VERSION = 'camino-extras/1';

// ------------------------------------------------------------------ seeded randomness

/** A 32-bit hash of the parts (FNV-1a), to seed one level. */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface Rng { int(n: number): number; range(a: number, b: number): number; pick<T>(xs: readonly T[]): T; chance(p: number): boolean; shuffle<T>(xs: readonly T[]): T[] }

function createRng(seed: number): Rng {
  const next = rng(seed);
  const int = (n: number) => Math.floor(next() * n);
  return {
    int,
    range: (a, b) => a + int(b - a + 1),
    pick: (xs) => xs[int(xs.length)],
    chance: (p) => next() < p,
    shuffle: (xs) => {
      const a = [...xs];
      for (let i = a.length - 1; i > 0; i--) { const j = int(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    },
  };
}

// ------------------------------------------------------------------ what a generated level is

export interface Generated {
  board: Board;
  /** The reference solution: the shortest plan (sequence) or the one repeat (repeat). */
  solution: Program;
  /** The notebook's lines. */
  slots: number;
  /** The palette, in the fixed order of the arrows. */
  blocks: PaletteBlock[];
  /** Steps of the shortest plan without "repetir" (what the notebook would need without the idea). */
  flat: number;
  /** What makes two levels the same, to keep a run free of repeats. */
  key: string;
}

const PALETTE_ORDER: readonly Dir[] = ['left', 'up', 'down', 'right'];
const ARROWS = PALETTE_ORDER as readonly string[];
const key = (c: number, r: number) => `${c},${r}`;
const cellOf = (R: Rng, cols: number, rows: number): Cell => ({ c: R.int(cols), r: R.int(rows) });

/** A few tufts of grass on free cells (decoration only), like the handmade levels. */
function grass(b: Board, busy: Set<string>, R: Rng, n: number): Deco[] {
  const free: Cell[] = [];
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) if (!busy.has(key(c, r))) free.push({ c, r });
  return R.shuffle(free).slice(0, n).map((x, i) => ({ ...x, dx: R.int(30) - 15, dy: 22 + R.int(12), seed: b.seed * 10 + i }));
}

// ------------------------------------------------------------------ what makes two levels the same

/** A flat plan: where Brote starts, where he goes, the seeds and what is in the way. */
const seqKey = (b: Board) => `seq:${JSON.stringify([b.start, b.goal, b.pickups, b.obstacles.filter((o) => o.kind !== 'earth').map((o) => [o.c, o.r])])}`;
/** A repeat: the pattern, the passes, and where on the path the seed waits (-1: none). */
const repKey = (body: readonly string[], count: number, pickupAt: number) => `rep:${body.join('')}:${count}:${pickupAt}`;

/**
 * The key a handmade level would have as an extra (null when no family makes
 * it): the extras behind a sheet's doors never repeat its core or its boss.
 */
export function keyOfLevel(l: LevelDef): string | null {
  const b = l.worlds[0];
  if (l.worlds.length !== 1 || !b) return null;
  if (l.solution.every((it) => it.t === 'cmd')) return seqKey(b);
  const only = l.solution[0];
  if (l.solution.length !== 1 || only.t !== 'loop' || typeof only.count !== 'number') return null;
  const t = simulate(b, l.solution);
  const cells = [b.start, ...t.steps.flatMap((s) => s.cells)];
  const pickupAt = b.pickups.length ? cells.findIndex((c) => sameCell(c, b.pickups[0])) : -1;
  return repKey(only.body, only.count, pickupAt);
}

// ------------------------------------------------------------------ family: sequence

/**
 * A flat plan: a start, a goal and rocks on a small board; with pickups the
 * goal is the pot, closed until every seed is collected, and the seeds must
 * cost a detour (so the order of the plan matters). The notebook has exactly
 * as many lines as the shortest plan.
 */
function genSequence(p: Extract<ExtraParams, { family: 'sequence' }>, R: Rng): Generated | null {
  for (let tries = 0; tries < 1500; tries++) {
    const start = cellOf(R, p.cols, p.rows);
    const goal = cellOf(R, p.cols, p.rows);
    if (goal.c === start.c && goal.r === start.r) continue;
    const taken = new Set([key(start.c, start.r), key(goal.c, goal.r)]);
    const pickups: Cell[] = [];
    while (pickups.length < p.pickups) {
      const x = cellOf(R, p.cols, p.rows);
      if (taken.has(key(x.c, x.r))) continue;
      taken.add(key(x.c, x.r));
      pickups.push(x);
    }
    const obstacles: Obstacle[] = [];
    for (let guard = 0; obstacles.length < p.rocks && guard < 40; guard++) {
      const x = cellOf(R, p.cols, p.rows);
      if (taken.has(key(x.c, x.r))) continue;
      taken.add(key(x.c, x.r));
      obstacles.push({ ...x, kind: 'rock', seed: R.int(1e6) });
    }
    const board: Board = { cols: p.cols, rows: p.rows, start, goal, goalKind: pickups.length ? 'pot' : 'seed', obstacles, pickups, deco: [], seed: R.int(1e6) };
    const plan = shortestPlan(board, ARROWS);
    if (!plan || plan.length < p.steps[0] || plan.length > p.steps[1]) continue;
    if (new Set(plan).size < 2) continue;
    if (pickups.length) {
      const direct = shortestPlan({ ...board, pickups: [], goalKind: 'seed' }, ARROWS);
      if (!direct || direct.length >= plan.length) continue;
    }
    board.deco = grass(board, taken, R, Math.min(4, Math.round((p.cols * p.rows) / 5)));
    return { board, solution: cmdProgram(plan), slots: plan.length, blocks: [...ARROWS], flat: plan.length, key: seqKey(board) };
  }
  return null;
}

// ------------------------------------------------------------------ family: repeat

const perpendicular = (a: Dir, b: Dir) => DELTA[a][0] * DELTA[b][0] + DELTA[a][1] * DELTA[b][1] === 0;

/** The patterns of `n` arrows: one arrow; two perpendicular ones (a stair); three (a ramp or a zigzag). */
export function patterns(n: 1 | 2 | 3): Dir[][] {
  if (n === 1) return DIRS.map((d) => [d]);
  const pairs = DIRS.flatMap((a) => DIRS.filter((b) => perpendicular(a, b)).map((b) => [a, b] as [Dir, Dir]));
  if (n === 2) return pairs;
  return pairs.flatMap(([a, b]) => [[a, a, b], [a, b, b], [a, b, a]]);
}

/** The biggest boards a door may draw (a one-row path may be longer). */
const MAX = { cols: 9, rows: 6, lineCols: 11 };

/**
 * One pattern walked `count` times. The path never crosses itself; around a
 * pattern of two or three arrows the rest of the board is carved stone (like
 * the demo's staircase), so the pattern is the only way. The notebook has as
 * many lines as the pattern: no plan without "repetir" fits.
 */
function genRepeat(p: Extract<ExtraParams, { family: 'repeat' }>, R: Rng): Generated | null {
  for (let tries = 0; tries < 400; tries++) {
    const body = R.pick(patterns(p.body));
    const count = R.range(p.count[0], p.count[1]);
    const path: Cell[] = [{ c: 0, r: 0 }];
    for (let i = 0; i < count; i++) for (const d of body) {
      const last = path[path.length - 1];
      path.push({ c: last.c + DELTA[d][0], r: last.r + DELTA[d][1] });
    }
    if (new Set(path.map((x) => key(x.c, x.r))).size !== path.length) continue;
    const minC = Math.min(...path.map((x) => x.c)), minR = Math.min(...path.map((x) => x.r));
    const w = Math.max(...path.map((x) => x.c)) - minC + 1, h = Math.max(...path.map((x) => x.r)) - minR + 1;
    const line = p.body === 1;
    // a one-arrow path runs along the middle of a three-cell-wide strip, like the demo's long path
    const cols = line && h > 1 ? 3 : w;
    const rows = line && w > 1 ? 3 : h;
    if (rows > MAX.rows || cols > (line && rows === 3 ? MAX.lineCols : MAX.cols)) continue;
    const off = { c: line && h > 1 ? 1 - minC : -minC, r: line && w > 1 ? 1 - minR : -minR };
    const cells = path.map((x) => ({ c: x.c + off.c, r: x.r + off.r }));
    const onPath = new Set(cells.map((x) => key(x.c, x.r)));
    const seed = R.int(1e6);
    const obstacles: Obstacle[] = [];
    if (!line) {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!onPath.has(key(c, r))) obstacles.push({ c, r, kind: 'earth', seed: seed + c * 5 + r });
    } else {
      const spare: Cell[] = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!onPath.has(key(c, r))) spare.push({ c, r });
      for (const x of R.shuffle(spare).slice(0, R.int(3))) obstacles.push({ ...x, kind: 'rock', seed: R.int(1e6) });
    }
    const pickupAt = p.pickups ? 1 + R.int(cells.length - 2) : -1;
    const pickups = pickupAt > 0 ? [cells[pickupAt]] : [];
    const board: Board = {
      cols, rows, start: cells[0], goal: cells[cells.length - 1], goalKind: pickups.length ? 'pot' : 'seed',
      obstacles, pickups, deco: [], seed,
    };
    const solution: Program = [{ t: 'loop', count, body: [...body] }];
    if (!solves(board, solution)) continue;
    const blocks = PALETTE_ORDER.filter((d) => body.includes(d));
    const flat = shortestPlan(board, blocks);
    if (!flat || flat.length <= p.body) continue; // the loop must be needed
    const busy = new Set([...onPath, ...obstacles.map((o) => key(o.c, o.r))]);
    board.deco = grass(board, busy, R, line ? 4 : 0);
    return { board, solution, slots: p.body, blocks: [...blocks, 'repeat'], flat: flat.length, key: repKey(body, count, pickupAt) };
  }
  return null;
}

// ------------------------------------------------------------------ public API

/** One level of a family from a seed; tries nearby seeds until one fits. */
export function generate(params: ExtraParams, seed: number): Generated & { seed: number } {
  for (let attempt = 0; attempt < 20; attempt++) {
    const s = hashSeed(seed, attempt);
    const R = createRng(s);
    const g = params.family === 'sequence' ? genSequence(params, R) : genRepeat(params, R);
    if (g) return { ...g, seed: s };
  }
  throw new Error(`could not generate ${params.family} ${JSON.stringify(params)}`);
}

/**
 * How hard a generated level is, for the tests and the dev drawer: its steps
 * without the idea, plus the seeds to collect first and the pattern's length.
 */
export function difficultyOf(g: Generated): number {
  const body = g.solution.find((it) => it.t === 'loop');
  return g.flat + 3 * g.board.pickups.length + (body?.t === 'loop' ? 3 * (body.body.length - 1) : 0);
}

/** Spoken on entering an extra (es-AR): the board says the rest. */
function sayFor(g: Generated): string {
  const loop = g.solution.some((it) => it.t === 'loop');
  if (loop) return g.board.pickups.length ? 'Pocos renglones: buscá lo que se repite. Juntá la semilla y llevala a la maceta.' : 'Pocos renglones: buscá lo que se repite.';
  if (g.board.pickups.length > 1) return 'Juntá las semillas y después llevalas a la maceta.';
  if (g.board.pickups.length) return 'Primero juntá la semilla, después llevala a la maceta.';
  return 'Llevá a Brote hasta la semilla.';
}

export interface Extra extends Generated {
  seed: number;
  level: LevelDef;
}

const runs = new Map<string, Extra[]>();

/**
 * The first `n` extras behind a door, in order. A run never repeats a level,
 * nor one of the sheet's own (its core and its boss): when a seed gives one
 * already seen, the next seed is tried.
 */
export function extraRun(sheet: Sheet, door: Door, n: number): Extra[] {
  const params = sheet.extras?.[door];
  if (!params) return [];
  const id = `${sheet.grade}/${sheet.n}/${door}/${JSON.stringify(params)}`;
  const run = runs.get(id) ?? [];
  runs.set(id, run);
  const own = [...sheet.core.map((c) => c.level), ...(sheet.boss ? [sheet.boss] : [])].map(keyOfLevel);
  const seen = new Set([...own.filter((k): k is string => !!k), ...run.map((e) => e.key)]);
  for (let i = run.length + 1; run.length < n; i++) {
    for (let attempt = 0; ; attempt++) {
      const g = generate(params, hashSeed(GENERATOR_VERSION, sheet.grade, sheet.n, door, i, attempt));
      if (seen.has(g.key) && attempt < 30) continue;
      seen.add(g.key);
      run.push({
        ...g,
        level: {
          id: extraId(sheet, door, i),
          grade: sheet.grade,
          page: i,
          title: `${sheet.title} · puerta ${DOOR_LABEL[door]} ${i}`,
          say: sayFor(g),
          mode: 'program',
          worlds: [g.board],
          blocks: g.blocks,
          blockLabel: 'picture-word',
          slots: g.slots,
          solution: g.solution,
        },
      });
      break;
    }
  }
  return run.slice(0, n);
}

/** The i-th extra (from 1) behind a door. */
export const extraFor = (sheet: Sheet, door: Door, i: number): Extra | null => extraRun(sheet, door, Math.max(1, i))[Math.max(1, i) - 1] ?? null;
