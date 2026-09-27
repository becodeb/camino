// Extras: levels made on the spot behind the three doors of a sheet. Ported
// and adapted from habilidades' generator (app/src/areas/algorithmic/
// generate.ts + search.ts @ 9b90d1d, its `build`, `loop`, `predict` and
// `debug` families) to camino's engine: absolute arrows only, the notebook's
// lines as the block limit, seeds and the pot, and 1ro's practice formats.
//
// Families: `sequence` (flat plans), `repeat` (one pattern walked several
// times; with steps around it, or as a long flat plan with a gold challenge),
// `predict` (where does Brote end?), `fix` (one mistake to find), `complete`
// (a count or a card missing).
//
// Deterministic: a sheet, a door and an index always give the same level
// (the seed is shown in the dev drawer). Every level is proved by running its
// reference program, and its limits are checked with the engine: the
// breadth-first search over Brote's states, and small exhaustive searches
// over programs where a format needs one answer only.

import { rng } from '../ink/ink.js';
import { shortestPlan, simulate, solves } from '../game/engine';
import { writeLine, emptyLine } from '../game/editor';
import { NO_GOAL, arrowsIn as arrowsOf, formatOf } from '../game/formats';
import { COUNT_MAX, COUNT_MIN } from '../game/hint';
import type { Format, LevelDef, PaletteBlock, SaveChallenge } from '../game/levels';
import {
  DELTA, DIRS, HOLE, cardCount, cmdProgram, isHole, sameCell,
  type Board, type Cell, type Deco, type Dir, type Obstacle, type Program, type ProgramItem,
} from '../game/model';
import { riverize } from './boards';
import {
  DOOR_LABEL, extraId, paramsAt,
  type CompleteHole, type CompleteParams, type Door, type ExtraParams, type FixBug, type FixParams, type PredictParams,
  type RepeatParams, type SequenceParams, type Sheet, type Zone,
} from './model';

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
  /** The reference program: the shortest plan (sequence), the repeat, the program fixed in place or filled in, the program to read. */
  solution: Program;
  /** The notebook's lines. */
  slots: number;
  /** The palette, in the fixed order of the arrows. */
  blocks: PaletteBlock[];
  /** Steps of the shortest plan without "repetir" (what the notebook would need without the idea); on a predict page, the steps walked. */
  flat: number;
  /** What makes two levels the same, to keep a run free of repeats. */
  key: string;
  /** The page's format (a plain page when absent) and what its notebook starts with. */
  format?: Format;
  given?: Program;
  /** The gold challenge (save blocks). */
  save?: SaveChallenge;
  /** Fix: the mistake. Complete: what is missing. For the difficulty and the dev drawer. */
  bug?: FixBug;
  hole?: CompleteHole;
}

const PALETTE_ORDER: readonly Dir[] = ['left', 'up', 'down', 'right'];
const ARROWS = PALETTE_ORDER as readonly string[];
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const key = (c: number, r: number) => `${c},${r}`;
const cellOf = (R: Rng, cols: number, rows: number): Cell => ({ c: R.int(cols), r: R.int(rows) });
const loopOf = (count: number, body: readonly string[]): ProgramItem => ({ t: 'loop', count, body: [...body] });

/** A few tufts of grass on free cells (decoration only), like the handmade levels. */
function grass(b: Board, busy: Set<string>, R: Rng, n: number): Deco[] {
  const free: Cell[] = [];
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) if (!busy.has(key(c, r))) free.push({ c, r });
  return R.shuffle(free).slice(0, n).map((x, i) => ({ ...x, dx: R.int(30) - 15, dy: 22 + R.int(12), seed: b.seed * 10 + i }));
}

/** Every flat list of `alphabet` with 1..max items. */
function* sequencesOf(alphabet: readonly string[], max: number): Generator<string[]> {
  let layer: string[][] = [[]];
  for (let n = 1; n <= max; n++) {
    layer = layer.flatMap((s) => alphabet.map((a) => [...s, a]));
    yield* layer;
  }
}

/** Some repeat on its own (up to `lines` cards inside, any count) wins: the steps around it are not needed. */
function loneRepeatWins(b: Board, arrows: readonly string[], lines: number): boolean {
  for (const body of sequencesOf(arrows, lines)) {
    for (let n = COUNT_MIN; n <= COUNT_MAX; n++) if (solves(b, [loopOf(n, body)])) return true;
  }
  return false;
}

// ------------------------------------------------------------------ what makes two levels the same

/** A flat plan: where Brote starts, where he goes, the seeds and what is in the way. */
const seqKey = (b: Board) => `seq:${JSON.stringify([b.start, b.goal, b.pickups, b.obstacles.filter((o) => o.kind !== 'earth').map((o) => [o.c, o.r])])}`;
/** A repeat: the pattern, the passes, and where on the path the seed waits (-1: none). */
const repKey = (body: readonly string[], count: number, pickupAt: number) => `rep:${body.join('')}:${count}:${pickupAt}`;

/** What a winning program says about its level: the flat board, or the repeat and the steps around it. */
function solvedKey(b: Board, program: Program): string | null {
  const p = program
    .filter((it) => !(it.t === 'cmd' && isHole(it.cmd)))
    .map((it) => (it.t === 'loop' ? { ...it, body: it.body.filter((c) => !isHole(c)) } : it));
  if (p.every((it) => it.t === 'cmd')) return seqKey(b);
  const at = p.findIndex((it) => it.t === 'loop');
  const only = p[at];
  if (p.filter((it) => it.t === 'loop').length !== 1 || only.t !== 'loop' || typeof only.count !== 'number') return null;
  const t = simulate(b, p);
  const cells = [b.start, ...t.steps.flatMap((s) => s.cells)];
  const pickupAt = b.pickups.length ? cells.findIndex((c) => sameCell(c, b.pickups[0])) : -1;
  const cmds = (xs: Program) => xs.map((it) => (it.t === 'cmd' ? it.cmd : '')).join('');
  const pre = cmds(p.slice(0, at)), post = cmds(p.slice(at + 1));
  if (!pre && !post) return repKey(only.body, only.count, pickupAt);
  return `rep:${pre}|${only.body.join('')}:${only.count}|${post}:${pickupAt}`;
}

/** The key of a level of any format; the same for a handmade level and for the extra that would be it. */
function keyOf(format: Format, b: Board, solution: Program, given?: Program, save?: SaveChallenge): string | null {
  if (format === 'predict') return `pred:${JSON.stringify([b.start, given ?? solution, b.obstacles.map((o) => [o.c, o.r])])}`;
  if (save) {
    const k = solvedKey(b, save.solution);
    return k && `save:${k}`;
  }
  const base = solvedKey(b, solution);
  if (format === 'fix' || format === 'complete') return base && `${format}:${JSON.stringify(given)}:${base}`;
  return base;
}

/**
 * The key a handmade level would have as an extra (null when no family makes
 * it): the extras behind a sheet's doors never repeat its core or its boss.
 */
export function keyOfLevel(l: LevelDef): string | null {
  const b = l.worlds[0];
  if (l.worlds.length !== 1 || !b) return null;
  return keyOf(formatOf(l), b, l.solution, l.given, l.save);
}

// ------------------------------------------------------------------ family: sequence

/**
 * A flat plan: a start, a goal and rocks on a small board; with pickups the
 * goal is the pot, closed until every seed is collected, and the seeds must
 * cost a detour (so the order of the plan matters). The notebook has exactly
 * as many lines as the shortest plan.
 */
function genSequence(p: SequenceParams, R: Rng): Generated | null {
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

/** `n` arrows walked before (`pre`) or after (`post`) the repeat: never straight back onto the pattern. */
function around(R: Rng, n: number, body: readonly Dir[], side: 'pre' | 'post'): Dir[] {
  const out: Dir[] = [];
  let next = side === 'pre' ? body[0] : body[body.length - 1];
  for (let i = 0; i < n; i++) {
    const d = R.pick(DIRS.filter((x) => x !== OPPOSITE[next]));
    if (side === 'pre') out.unshift(d); else out.push(d);
    next = d;
  }
  return out;
}

/** The biggest boards a door may draw (a one-row path may be longer). */
const MAX = { cols: 9, rows: 6, lineCols: 11 };

/**
 * One pattern walked `count` times, maybe with steps before and after. The
 * path never crosses itself; around it the rest of the board is carved stone
 * (like the demo's staircase; by the river, water with stepping stones), so
 * the path is the only way. A lone one-arrow repeat runs along the middle of
 * a three-cell-wide strip instead, like the demo's long path. The notebook
 * has as many lines as the program: no plan without "repetir" fits, and with
 * steps around it no lone repeat wins. `save`: the notebook holds the flat
 * plan and the repeat is the gold challenge.
 */
function genRepeat(p: RepeatParams, R: Rng, river = false): Generated | null {
  for (let tries = 0; tries < 400; tries++) {
    const body = R.pick(patterns(p.body));
    const count = R.range(p.count[0], p.count[1]);
    const pre = p.pre ? around(R, R.range(p.pre[0], p.pre[1]), body, 'pre') : [];
    const post = p.post ? around(R, R.range(p.post[0], p.post[1]), body, 'post') : [];
    const moves = [...pre, ...Array.from({ length: count }, () => body).flat(), ...post];
    const path: Cell[] = [{ c: 0, r: 0 }];
    for (const d of moves) {
      const last = path[path.length - 1];
      path.push({ c: last.c + DELTA[d][0], r: last.r + DELTA[d][1] });
    }
    if (new Set(path.map((x) => key(x.c, x.r))).size !== path.length) continue;
    const minC = Math.min(...path.map((x) => x.c)), minR = Math.min(...path.map((x) => x.r));
    const w = Math.max(...path.map((x) => x.c)) - minC + 1, h = Math.max(...path.map((x) => x.r)) - minR + 1;
    const line = p.body === 1 && !pre.length && !post.length;
    // a one-arrow path runs along the middle of a three-cell-wide strip, like the demo's long path
    const cols = line && h > 1 ? 3 : w;
    const rows = line && w > 1 ? 3 : h;
    if (rows > MAX.rows || cols > (line && rows === 3 ? MAX.lineCols : MAX.cols)) continue;
    const off = { c: line && h > 1 ? 1 - minC : -minC, r: line && w > 1 ? 1 - minR : -minR };
    const cells = path.map((x) => ({ c: x.c + off.c, r: x.r + off.r }));
    const onPath = new Set(cells.map((x) => key(x.c, x.r)));
    const seed = R.int(1e6);
    const obstacles: Obstacle[] = [];
    if (!line || river) {
      // by the river even the strip is stepping stones: the rest of it is water
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
    const solution: Program = [...cmdProgram(pre), loopOf(count, body), ...cmdProgram(post)];
    if (!solves(board, solution)) continue;
    const lines = pre.length + body.length + post.length;
    const arrows = PALETTE_ORDER.filter((d) => moves.includes(d));
    const flat = shortestPlan(board, arrows);
    if (!flat || flat.length <= lines) continue; // the loop must be needed
    if ((pre.length || post.length) && loneRepeatWins(board, arrows, lines)) continue; // and so must the steps around it
    if (p.save && flat.length > 12) continue; // the flat plan fits a notebook
    const busy = new Set([...onPath, ...obstacles.map((o) => key(o.c, o.r))]);
    board.deco = grass(board, busy, R, line ? 4 : 0);
    const b = river ? riverize(board) : board;
    if (p.save) {
      const save: SaveChallenge = { slots: lines, solution, blocks: [...arrows, 'repeat'] };
      return { board: b, solution: cmdProgram(flat), slots: flat.length, blocks: [...arrows], flat: flat.length, key: keyOf('solve', b, cmdProgram(flat), undefined, save)!, save };
    }
    const k = pre.length || post.length ? keyOf('solve', b, solution)! : repKey(body, count, pickupAt);
    return { board: b, solution, slots: lines, blocks: [...arrows, 'repeat'], flat: flat.length, key: k };
  }
  return null;
}

// ------------------------------------------------------------------ family: predict ("¿dónde termina?")

/**
 * A read-only program, flat (no arrow straight back after another) or one
 * repeat, on an open board with a few rocks off the path and no goal: the
 * child taps the cell where Brote will end. The path never crosses itself,
 * never bumps, and does not end where it starts.
 */
function genPredict(p: PredictParams, R: Rng): Generated | null {
  for (let tries = 0; tries < 800; tries++) {
    let program: Program;
    let moves: Dir[];
    if (p.loop) {
      const body = R.pick(patterns(p.loop.body));
      const count = R.range(p.loop.count[0], p.loop.count[1]);
      program = [loopOf(count, body)];
      moves = Array.from({ length: count }, () => body).flat();
    } else {
      const n = R.range(p.steps[0], p.steps[1]);
      moves = [];
      for (let i = 0; i < n; i++) moves.push(R.pick(i ? DIRS.filter((d) => d !== OPPOSITE[moves[i - 1]]) : DIRS));
      program = cmdProgram(moves);
    }
    if (moves.length < p.steps[0] || moves.length > p.steps[1]) continue;
    if (!p.loop && new Set(moves).size < 2) continue;
    const path: Cell[] = [{ c: 0, r: 0 }];
    for (const d of moves) {
      const last = path[path.length - 1];
      path.push({ c: last.c + DELTA[d][0], r: last.r + DELTA[d][1] });
    }
    if (new Set(path.map((x) => key(x.c, x.r))).size !== path.length) continue;
    const minC = Math.min(...path.map((x) => x.c)), minR = Math.min(...path.map((x) => x.r));
    const w = Math.max(...path.map((x) => x.c)) - minC + 1, h = Math.max(...path.map((x) => x.r)) - minR + 1;
    if (w > p.cols || h > p.rows) continue;
    const off = { c: R.int(p.cols - w + 1) - minC, r: R.int(p.rows - h + 1) - minR };
    const cells = path.map((x) => ({ c: x.c + off.c, r: x.r + off.r }));
    const onPath = new Set(cells.map((x) => key(x.c, x.r)));
    const spare: Cell[] = [];
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) if (!onPath.has(key(c, r))) spare.push({ c, r });
    const obstacles: Obstacle[] = R.shuffle(spare).slice(0, p.rocks).map((x) => ({ ...x, kind: 'rock' as const, seed: R.int(1e6) }));
    const board: Board = { cols: p.cols, rows: p.rows, start: cells[0], goal: NO_GOAL, goalKind: 'none', obstacles, pickups: [], deco: [], seed: R.int(1e6) };
    const t = simulate(board, program);
    if (t.outcome === 'crash' || sameCell(t.final, board.start)) continue;
    board.deco = grass(board, new Set([...onPath, ...obstacles.map((o) => key(o.c, o.r))]), R, 3);
    const blocks: PaletteBlock[] = [...arrowsOf(program), ...(p.loop ? ['repeat'] : [])];
    return {
      board, solution: program, given: program, format: 'predict', slots: cardCount(program), blocks,
      flat: moves.length, key: keyOf('predict', board, program, program)!,
    };
  }
  return null;
}

// ------------------------------------------------------------------ family: fix ("Brote se confundió")

/** Every line of a program with a card on it, in reading order. */
const cardLines = (p: Program) => p.flatMap((it, item) => (it.t === 'cmd' ? (isHole(it.cmd) ? [] : [{ item }]) : it.body.flatMap((c, inner) => (isHole(c) ? [] : [{ item, inner }]))));
/** Brote bumps, in the first pass, right on the block at `ref`: the mistake shows where it is. */
const bumpsAt = (b: Board, p: Program, ref: { item: number; inner?: number }) => {
  const t = simulate(b, p);
  const s = t.outcome === 'crash' ? t.steps[t.crashAt!] : null;
  return !!s && s.ref.item === ref.item && s.ref.inner === ref.inner && !s.ref.iter;
};

/** One mistake in a winning program: the program as it arrives, and the reference fixed in place. */
function makeBug(kind: FixBug, board: Board, solution: Program, R: Rng): { given: Program; fixed: Program } | null {
  if (kind === 'arrow') {
    for (const ref of R.shuffle(cardLines(solution))) {
      for (const d of R.shuffle(PALETTE_ORDER)) {
        const given = writeLine(solution, ref, d);
        if (JSON.stringify(given) !== JSON.stringify(solution) && bumpsAt(board, given, ref)) return { given, fixed: solution };
      }
    }
    return null;
  }
  if (kind === 'count') {
    const item = solution.findIndex((it) => it.t === 'loop' && typeof it.count === 'number' && it.count >= COUNT_MIN + 1);
    const it = solution[item];
    if (!it || it.t !== 'loop' || typeof it.count !== 'number') return null;
    const given = structuredClone(solution);
    (given[item] as { count: number }).count = it.count - 1 - R.int(it.count - COUNT_MIN);
    return simulate(board, given).outcome === 'short' ? { given, fixed: solution } : null;
  }
  // an extra card: inside the repeat, or (a flat plan) between two arrows
  const item = solution.findIndex((it) => it.t === 'loop');
  const spots: { item: number; inner?: number }[] = item >= 0
    ? Array.from({ length: (solution[item] as { body: string[] }).body.length + 1 }, (_, inner) => ({ item, inner }))
    : Array.from({ length: solution.length + 1 }, (_, i) => ({ item: i }));
  for (const at of R.shuffle(spots)) {
    for (const d of R.shuffle(PALETTE_ORDER)) {
      const insert = (card: string) => {
        const p = structuredClone(solution);
        if (at.inner != null) (p[at.item] as { body: string[] }).body.splice(at.inner, 0, card);
        else p.splice(at.item, 0, { t: 'cmd', cmd: card });
        return p;
      };
      const given = insert(d);
      if (bumpsAt(board, given, at)) return { given, fixed: insert(HOLE) };
    }
  }
  return null;
}

/**
 * A level of the base family with exactly one mistake. Brote shows it: a
 * wrong arrow or an extra card bumps right where it is (in the first pass);
 * a repeat with too few passes stops short. The notebook keeps its lines; the
 * palette has the arrows of the page.
 */
function genFix(p: FixParams, R: Rng, river: boolean): Generated | null {
  for (let tries = 0; tries < 40; tries++) {
    const g = p.base.family === 'sequence' ? genSequence(p.base, R) : genRepeat({ ...p.base, save: false }, R, river);
    if (!g) return null;
    const b = river ? riverize(g.board) : g.board;
    for (const bug of R.shuffle(p.bugs)) {
      const made = makeBug(bug, b, g.solution, R);
      if (!made || solves(b, made.given) || !solves(b, made.fixed)) continue;
      return {
        board: b, solution: made.fixed, given: made.given, format: 'fix', bug,
        slots: cardCount(made.given), blocks: arrowsOf(made.given, made.fixed), flat: g.flat,
        key: keyOf('fix', b, made.fixed, made.given)!,
      };
    }
  }
  return null;
}

// ------------------------------------------------------------------ family: complete ("¿cuántas veces?")

/**
 * A repeat level with something missing: its count (the path goes on after
 * the repeat, so only one count wins) or one card (only one arrow fits it).
 * What is written is pinned; with only the count missing there is nothing to
 * bring, and the palette is empty.
 */
function genComplete(p: CompleteParams, R: Rng, river: boolean): Generated | null {
  for (let tries = 0; tries < 40; tries++) {
    const g = genRepeat({ ...p.base, save: false }, R, river);
    if (!g) return null;
    for (const hole of R.shuffle(p.holes)) {
      let given: Program | null = null;
      if (hole === 'count') {
        const item = g.solution.findIndex((it) => it.t === 'loop');
        const it = g.solution[item];
        if (it?.t !== 'loop' || typeof it.count !== 'number') continue;
        const withCount = (n: number) => g.solution.map((x, i) => (i === item ? loopOf(n, it.body) : x));
        let unique = true;
        for (let n = COUNT_MIN; n <= COUNT_MAX && unique; n++) if (n !== it.count && solves(g.board, withCount(n))) unique = false;
        if (unique) given = withCount(0);
      } else {
        for (const ref of R.shuffle(cardLines(g.solution))) {
          const empty = emptyLine(g.solution, ref);
          const fits = PALETTE_ORDER.filter((d) => solves(g.board, writeLine(empty, ref, d)));
          if (fits.length === 1) { given = empty; break; }
        }
      }
      if (!given || solves(g.board, given)) continue;
      return {
        board: g.board, solution: g.solution, given, format: 'complete', hole,
        slots: cardCount(g.solution), blocks: hole === 'count' ? [] : arrowsOf(g.solution), flat: g.flat,
        key: keyOf('complete', g.board, g.solution, given)!,
      };
    }
  }
  return null;
}

// ------------------------------------------------------------------ public API

function genOf(params: ExtraParams, R: Rng, river: boolean): Generated | null {
  switch (params.family) {
    case 'sequence': {
      const g = genSequence(params, R);
      return g && river ? { ...g, board: riverize(g.board) } : g;
    }
    case 'repeat': return genRepeat(params, R, river);
    case 'predict': {
      const g = genPredict(params, R);
      return g && river ? { ...g, board: riverize(g.board) } : g;
    }
    case 'fix': return genFix(params, R, river);
    case 'complete': return genComplete(params, R, river);
  }
}

/** One level of a family from a seed; tries nearby seeds until one fits. By the river, its look. */
export function generate(params: ExtraParams, seed: number, zone: Zone = 'bosque'): Generated & { seed: number } {
  for (let attempt = 0; attempt < 20; attempt++) {
    const s = hashSeed(seed, attempt);
    const R = createRng(s);
    const g = genOf(params, R, zone === 'rio');
    if (g) return { ...g, seed: s };
  }
  throw new Error(`could not generate ${params.family} ${JSON.stringify(params)}`);
}

const turnsOf = (moves: readonly string[]) => moves.reduce((n, d, i) => n + (i && d !== moves[i - 1] ? 1 : 0), 0);
const movesOf = (p: Program) => p.flatMap((it) => (it.t === 'cmd' ? [it.cmd] : Array.from({ length: typeof it.count === 'number' ? it.count : 1 }, () => it.body).flat())).filter((c) => !isHole(c));
const BUG_WEIGHT: Record<FixBug, number> = { arrow: 0, count: 1, extra: 2 };

/**
 * How hard a generated level is, for the tests and the dev drawer: its steps
 * without the idea, plus the seeds to collect first, the pattern's length and
 * the steps around the repeat; a predict page by the steps to follow and the
 * turns; a mistake or a missing card adds a little.
 */
export function difficultyOf(g: Generated): number {
  if (g.format === 'predict') {
    const moves = movesOf(g.solution);
    return moves.length + turnsOf(moves) + (g.solution.some((it) => it.t === 'loop') ? 2 : 0);
  }
  const program = g.save?.solution ?? g.solution;
  const body = program.find((it) => it.t === 'loop');
  const around = body ? program.filter((it) => it.t === 'cmd' && !isHole(it.cmd)).length : 0;
  const base = g.flat + 3 * g.board.pickups.length + (body?.t === 'loop' ? 3 * (body.body.filter((c) => !isHole(c)).length - 1) : 0) + 2 * around;
  if (g.format === 'fix') return base + BUG_WEIGHT[g.bug ?? 'arrow'];
  if (g.format === 'complete') return base + (g.hole === 'card' ? 2 : 0);
  return base;
}

/** Spoken on entering an extra (es-AR): the board says the rest. */
function sayFor(g: Generated): string {
  if (g.format === 'predict') return '¿Dónde va a terminar Brote? Tocá ese lugar del tablero y después tocá Probar.';
  if (g.format === 'fix') return 'Brote se confundió. Probá, mirá dónde se equivoca y arreglá el cuaderno.';
  if (g.format === 'complete') return g.hole === 'count' ? '¿Cuántas veces hay que repetir? Contá los pasos y tocá el número.' : 'Falta un bloque. Poné el que va en el renglón vacío.';
  if (g.save) return 'Un camino largo: armalo con flechas. Después, si querés, buscá el sello dorado.';
  const loop = g.solution.some((it) => it.t === 'loop');
  if (loop && g.solution.length > 1) return 'Unos pasos antes, el repetir, y unos pasos después. Pensá qué va antes y qué va después.';
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
 * already seen, the next seed is tried. A door with several families takes
 * them in turns.
 */
export function extraRun(sheet: Sheet, door: Door, n: number): Extra[] {
  const d = sheet.extras?.[door];
  if (!d) return [];
  const id = `${sheet.grade}/${sheet.n}/${door}/${JSON.stringify(d)}`;
  const run = runs.get(id) ?? [];
  runs.set(id, run);
  const own = [...sheet.core.map((c) => c.level), ...(sheet.boss ? [sheet.boss] : [])].map(keyOfLevel);
  const seen = new Set([...own.filter((k): k is string => !!k), ...run.map((e) => e.key)]);
  for (let i = run.length + 1; run.length < n; i++) {
    const params = paramsAt(d, i);
    for (let attempt = 0; ; attempt++) {
      const g = generate(params, hashSeed(GENERATOR_VERSION, sheet.grade, sheet.n, door, i, attempt), sheet.zone);
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
          ...(g.format ? { format: g.format } : {}),
          ...(g.given ? { given: g.given } : {}),
          ...(g.save ? { save: g.save } : {}),
        },
      });
      break;
    }
  }
  return run.slice(0, n);
}

/** The i-th extra (from 1) behind a door. */
export const extraFor = (sheet: Sheet, door: Door, i: number): Extra | null => extraRun(sheet, door, Math.max(1, i))[Math.max(1, i) - 1] ?? null;
