// The workshops of 1ro's year (sheets 7 and 15): a child makes a level for a
// classmate on a small board, proves it by solving it with the normal
// notebook, and pins it on the class corkboard, next to the classmates'
// levels (curriculum/classmates.ts). Pure: the made board as data and the
// edits the editor makes on it, the board and the page a made level becomes,
// and the solver's verdict. Every level must be solvable and fit a notebook;
// a limited one (sheet 15) keeps the author's number of lines and must need a
// repeat: no plan without one fits them.

import { shortestPlan, simulate } from '../game/engine';
import { COUNT_MAX, COUNT_MIN } from '../game/hint';
import type { LevelDef, PaletteBlock } from '../game/levels';
import { cardCount, cmdProgram, initialState, isWin, type Board, type Dir, type Program, type ProgramItem, type RobotState } from '../game/model';
import { ARROWS, openBoard } from './boards';
import { EXAMPLES, classmateById } from './classmates';
import type { Sheet } from './model';
import type { Progress } from './progress';

/** A cell as stored: [column, row]. */
export type At = readonly [number, number];

/** The editor's board: 6 × 4, cells big enough for a finger. */
export const MADE_COLS = 6;
export const MADE_ROWS = 4;
/** The longest notebook a made level gets (twelve lines still fit a 768 px screen). */
export const MAX_LINES = 12;
/** The limited workshop's lines setting. */
export const MIN_SET_LINES = 1;
export const MAX_SET_LINES = 8;
/** The longest pattern the solver tries inside a repeat (a 6 × 4 board has no room for more). */
const MAX_BODY = 4;

/** A board made in the editor: where Brote starts, the one seed he picks up, the pot where he plants it, the rocks. */
export interface MadeBoard {
  start: At;
  seed: At;
  goal: At;
  rocks: At[];
}

/** What stands on a made board, and the editor's tools (one each of Brote, the seed and the pot; rocks as many as wanted). */
export type Piece = 'start' | 'seed' | 'goal' | 'rock';
export type Tool = Piece | 'eraser';
export const TOOLS: readonly Tool[] = ['start', 'seed', 'goal', 'rock', 'eraser'];

/** What the child is making in a workshop, kept between the editor and the test page. */
export interface Draft {
  board: MadeBoard;
  /** The notebook's lines, a setting of the limited workshop (elsewhere the shortest plan decides). */
  lines: number;
  /** The author's winning program on the test page, for this very board and these lines (any edit clears it). */
  proof?: Program;
}

/** A level on the corkboard: made on this device (`yo-<n>`), or an example by a fictional classmate (`ej-<n>`, `by`). */
export interface MadeLevel {
  id: string;
  /** The workshop sheet it was made in: its zone is the level's look; a limited workshop's levels need a repeat. */
  sheet: number;
  board: MadeBoard;
  /** The notebook's lines. */
  lines: number;
  /** The author's own winning program. */
  solution: Program;
  /** An example's fictional author (a classmate id); absent on a level made on this device. */
  by?: string;
}

const same = (a: At, b: At) => a[0] === b[0] && a[1] === b[1];
export const insideMade = ([c, r]: At) => Number.isInteger(c) && Number.isInteger(r) && c >= 0 && r >= 0 && c < MADE_COLS && r < MADE_ROWS;

// ------------------------------------------------------------------ the editor's edits

export function pieceAt(b: MadeBoard, at: At): Piece | null {
  if (same(b.start, at)) return 'start';
  if (same(b.seed, at)) return 'seed';
  if (same(b.goal, at)) return 'goal';
  return b.rocks.some((r) => same(r, at)) ? 'rock' : null;
}

/** An edit: the board after it, whether it changed, and the cell whose piece refused it (it wiggles). */
export interface Edit { board: MadeBoard; changed: boolean; refused?: At }

/**
 * A tool used on a cell. Brote, the seed and the pot move there (there is one
 * of each); a rock is added; the eraser takes a rock away. A cell holding
 * something else refuses, and Brote, the seed and the pot cannot be erased:
 * a made level is never missing one of them.
 */
export function applyTool(b: MadeBoard, tool: Tool, at: At): Edit {
  if (!insideMade(at)) return { board: b, changed: false };
  const here = pieceAt(b, at);
  if (tool === 'eraser') {
    if (here === 'rock') return { board: { ...b, rocks: b.rocks.filter((r) => !same(r, at)) }, changed: true };
    return here ? { board: b, changed: false, refused: at } : { board: b, changed: false };
  }
  if (here === tool && tool !== 'rock') return { board: b, changed: false };
  if (here) return { board: b, changed: false, refused: at };
  if (tool === 'rock') return { board: { ...b, rocks: [...b.rocks, at] }, changed: true };
  return { board: { ...b, [tool]: at }, changed: true };
}

/** A piece dragged on the board to another cell: it goes there when the cell is free. */
export function movePiece(b: MadeBoard, from: At, to: At): Edit {
  const what = pieceAt(b, from);
  if (!what || same(from, to) || !insideMade(to)) return { board: b, changed: false };
  if (pieceAt(b, to)) return { board: b, changed: false, refused: to };
  if (what === 'rock') return { board: { ...b, rocks: b.rocks.map((r) => (same(r, from) ? to : r)) }, changed: true };
  return { board: { ...b, [what]: to }, changed: true };
}

/**
 * A new level is never broken: Brote, the seed and the pot on one row, a
 * short plan (the limited workshop: a straight path and two lines, so a
 * repeat is already needed). The child changes the rest.
 */
export function defaultDraft(limited: boolean): Draft {
  return limited
    ? { board: { start: [0, 3], seed: [2, 3], goal: [5, 3], rocks: [] }, lines: 2 }
    : { board: { start: [0, 2], seed: [2, 2], goal: [5, 2], rocks: [] }, lines: 5 };
}

/** The level being made in a workshop: its draft, or the default board when nothing was touched yet. */
export const draftFor = (p: Pick<Progress, 'drafts'>, s: Pick<Sheet, 'n' | 'workshop'>): Draft => p.drafts[String(s.n)] ?? defaultDraft(!!s.workshop?.limited);

/** The lines setting, kept in its range. */
export const clampLines = (n: number) => Math.min(MAX_SET_LINES, Math.max(MIN_SET_LINES, Math.round(n) || MIN_SET_LINES));

// ------------------------------------------------------------------ the board and the solver

/** The board a made level is: an open board (the forest floor, or the river's sand), the seed to pick up, the pot. */
export function boardOf(b: MadeBoard, o: { river: boolean; seed: number }): Board {
  const at = (x: At): [number, number] => [x[0], x[1]];
  return openBoard({
    cols: MADE_COLS, rows: MADE_ROWS, start: at(b.start), goal: at(b.goal), seed: o.seed,
    pickups: [at(b.seed)], rocks: b.rocks.map(at),
    ...(o.river ? { look: 'river' as const } : {}),
  });
}

/** The shortest plan of arrows (the seed first, then the pot), or null when Brote cannot get there. */
export const flatPlan = (board: Board): Dir[] | null => shortestPlan(board, ARROWS) as Dir[] | null;

/** Every flat list of arrows with 1..n items. */
function bodiesUpTo(n: number): string[][] {
  const out: string[][] = [];
  let layer: string[][] = [[]];
  for (let k = 1; k <= n; k++) {
    layer = layer.flatMap((s) => ARROWS.map((a) => [...s, a]));
    out.push(...layer);
  }
  return out;
}

const stateKey = (s: RobotState) => `${s.c},${s.r},${s.mask}`;

/**
 * The winning program with the fewest cards, arrows and repeats (one level
 * deep, counts 2 to 10, patterns of up to four arrows), with at most `max`
 * cards; null when there is none. A search over Brote's states (his cell and
 * the seeds picked up), cheapest first: a step costs one card, a repeat as
 * many cards as its pattern.
 */
export function fewestProgram(board: Board, max: number): Program | null {
  const start = initialState(board);
  if (isWin(board, start)) return [];
  const moves: { item: ProgramItem; cost: number }[] = ARROWS.map((cmd) => ({ item: { t: 'cmd' as const, cmd }, cost: 1 }));
  for (const body of bodiesUpTo(Math.min(MAX_BODY, max))) {
    for (let n = COUNT_MIN; n <= COUNT_MAX; n++) moves.push({ item: { t: 'loop', count: n, body }, cost: body.length });
  }
  const best = new Map<string, number>([[stateKey(start), 0]]);
  const buckets: { s: RobotState; program: Program }[][] = [[{ s: start, program: [] }]];
  const wins: (Program | undefined)[] = [];
  for (let cost = 0; cost <= max; cost++) {
    // every win of this cost was found from cheaper states
    if (wins[cost]) return wins[cost]!;
    for (const node of buckets[cost] ?? []) {
      if (best.get(stateKey(node.s)) !== cost) continue;
      for (const m of moves) {
        const c = cost + m.cost;
        if (c > max) continue;
        const t = simulate(board, [m.item], { from: node.s });
        if (t.outcome === 'crash') continue;
        const program = [...node.program, m.item];
        if (t.outcome === 'win') { wins[c] ??= program; continue; }
        const k = stateKey(t.final);
        if ((best.get(k) ?? Infinity) <= c) continue;
        best.set(k, c);
        (buckets[c] ??= []).push({ s: t.final, program });
      }
    }
  }
  return null;
}

/**
 * Whether a made board can go on the corkboard, and the notebook it gets:
 * - `unreachable`: Brote cannot get to the seed and then to the pot;
 * - `long` (not limited): the shortest plan is longer than a notebook;
 * - limited (sheet 15), the level must need a repeat: `flat`, a plan without
 *   repeat fits the lines; `more`, even with repeats it needs more lines
 *   (`lines`: how many); `pattern`, a repeat never saves a card on this path.
 * A good level gets its lines (the shortest plan's length, or the author's
 * setting) and a reference program for the help.
 */
export type Verdict =
  | { ok: true; lines: number; solution: Program }
  | { ok: false; why: 'unreachable' | 'long' | 'pattern' }
  | { ok: false; why: 'flat' | 'more'; lines: number };

export function verdictOf(d: Pick<Draft, 'board' | 'lines'>, limited: boolean): Verdict {
  const board = boardOf(d.board, { river: false, seed: 1 });
  const flat = flatPlan(board);
  if (!flat) return { ok: false, why: 'unreachable' };
  if (!limited) return flat.length > MAX_LINES ? { ok: false, why: 'long' } : { ok: true, lines: flat.length, solution: cmdProgram(flat) };
  if (flat.length <= d.lines) return { ok: false, why: 'flat', lines: flat.length };
  const best = fewestProgram(board, flat.length - 1);
  if (!best) return { ok: false, why: 'pattern' };
  if (cardCount(best) > d.lines) return { ok: false, why: 'more', lines: cardCount(best) };
  return { ok: true, lines: d.lines, solution: best };
}

/** A limited level's own program must use a repeat (no plan without one fits its lines). */
export const usesRepeat = (p: Program) => p.some((it) => it.t === 'loop');

/**
 * On a level Brote cannot finish, what he cannot get to: the seed, or the pot
 * after it (the pot stays closed until the seed is picked up, so it is a wall
 * on the way to the seed).
 */
export function blockedPiece(b: MadeBoard): 'seed' | 'goal' {
  const key = (x: At) => `${x[0]},${x[1]}`;
  const wall = new Set([...b.rocks, b.goal].map(key));
  const seen = new Set([key(b.start)]);
  const queue: At[] = [b.start];
  while (queue.length) {
    const [c, r] = queue.shift()!;
    for (const n of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]] as At[]) {
      if (!insideMade(n) || wall.has(key(n)) || seen.has(key(n))) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return seen.has(key(b.seed)) ? 'goal' : 'seed';
}

/** A draft nobody touched yet: the workshop's default board and lines. */
export const untouched = (d: Draft, limited: boolean) => {
  const def = defaultDraft(limited);
  return JSON.stringify(d.board) === JSON.stringify(def.board) && d.lines === def.lines;
};

// ------------------------------------------------------------------ the pages a made level becomes

/** Level ids of the corkboard's cards (progress keys: their seed, their stamp). */
export const cardLevelId = (card: string) => `1ro-c-${card}`;
/** The level being made, on its test page. */
export const draftLevelId = (s: Pick<Sheet, 'n'>) => `1ro-h${s.n}-taller`;

/** The notebook's palette: the four arrows, and "repetir" on a limited workshop. */
export const madeBlocks = (limited: boolean): PaletteBlock[] => (limited ? [...ARROWS, 'repeat'] : [...ARROWS]);

type WorkshopSheet = Pick<Sheet, 'n' | 'zone' | 'workshop'>;
const limitedOf = (s: WorkshopSheet) => !!s.workshop?.limited;

function madePage(s: WorkshopSheet, o: { id: string; title: string; say: string; board: MadeBoard; seed: number; lines: number; solution: Program }): LevelDef {
  return {
    id: o.id, grade: '1ro', page: 1, title: o.title, say: o.say, mode: 'program',
    worlds: [boardOf(o.board, { river: s.zone === 'rio', seed: o.seed })],
    blocks: madeBlocks(limitedOf(s)), blockLabel: 'picture-word', slots: o.lines, solution: o.solution,
  };
}

/** Spoken on the test page (es-AR). */
export const TEST_SAY = 'Ahora jugalo vos: armá el camino en el cuaderno y tocá Probar.';

/** The level being made, on its test page: the notebook the classmates will get. */
export function draftLevel(s: WorkshopSheet, d: Draft, v: Extract<Verdict, { ok: true }>): LevelDef {
  return madePage(s, { id: draftLevelId(s), title: 'Mi nivel, a prueba', say: TEST_SAY, board: d.board, seed: 7000 + s.n, lines: v.lines, solution: v.solution });
}

/** A hash of an id, for a card's drawing seed. */
const seedOf = (id: string) => [...id].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0, 0x811c9dc5) % 100000;

/** The page of a corkboard card, as a classmate plays it. */
export function cardLevel(m: MadeLevel, s: WorkshopSheet): LevelDef {
  const limited = limitedOf(s);
  const who = m.by ? classmateById(m.by)?.name ?? 'un compañero' : null;
  return madePage(s, {
    id: cardLevelId(m.id),
    title: who ? `El nivel de ${who}${limited ? ', con límite' : ''}` : `Mi nivel${limited ? ' con límite' : ''}`,
    say: !who ? 'Tu nivel: jugalo otra vez.'
      : limited ? 'El nivel de un compañero, con pocos renglones: vas a necesitar repetir.'
        : 'El nivel de un compañero. Armá el camino en el cuaderno y tocá Probar.',
    board: m.board, seed: seedOf(m.id), lines: m.lines, solution: m.solution,
  });
}

// ------------------------------------------------------------------ the corkboard's cards

/** Every card of the corkboard: the levels made on this device (the newest first), then the classmates' examples. */
export const cardsOf = (p: Pick<Progress, 'made'>): MadeLevel[] => [...[...p.made].reverse(), ...EXAMPLES];
export const cardById = (p: Pick<Progress, 'made'>, id: string): MadeLevel | null => cardsOf(p).find((m) => m.id === id) ?? null;
export const isExample = (m: MadeLevel) => !!m.by;

/** The id the next level made on this device gets: never one used before, even after the levels were cleared. */
export function nextMadeId(p: Pick<Progress, 'made' | 'plays' | 'solved'>): string {
  const used = [...p.made.map((m) => m.id), ...Object.keys(p.plays), ...Object.keys(p.solved).map((k) => k.replace(/^1ro-c-/, ''))];
  const n = used.map((id) => /^yo-(\d+)$/.exec(id)?.[1]).filter(Boolean).map(Number);
  return `yo-${Math.max(0, ...n) + 1}`;
}

// ------------------------------------------------------------------ reading them back (storage)

const isAt = (x: unknown): x is At => Array.isArray(x) && x.length === 2 && insideMade(x as unknown as At);

/** A stored made board: every piece on the board, none on another. */
export function isMadeBoard(x: unknown): x is MadeBoard {
  if (!x || typeof x !== 'object') return false;
  const b = x as Partial<MadeBoard>;
  if (!isAt(b.start) || !isAt(b.seed) || !isAt(b.goal) || !Array.isArray(b.rocks) || !b.rocks.every(isAt)) return false;
  const cells = [b.start, b.seed, b.goal, ...b.rocks].map(([c, r]) => `${c},${r}`);
  return new Set(cells).size === cells.length;
}

/** A stored program of arrows and repeats. */
export function isArrowProgram(x: unknown): x is Program {
  const arrow = (c: unknown) => typeof c === 'string' && (ARROWS as readonly string[]).includes(c);
  return Array.isArray(x) && x.every((it) => it && typeof it === 'object' && (
    (it.t === 'cmd' && arrow(it.cmd))
    || (it.t === 'loop' && Number.isInteger(it.count) && it.count >= COUNT_MIN && it.count <= COUNT_MAX && Array.isArray(it.body) && it.body.every(arrow))
  ));
}

export function isMadeLevel(x: unknown): x is MadeLevel {
  if (!x || typeof x !== 'object') return false;
  const m = x as Partial<MadeLevel>;
  return typeof m.id === 'string' && /^yo-\d+$/.test(m.id) && Number.isInteger(m.sheet) && isMadeBoard(m.board)
    && Number.isInteger(m.lines) && m.lines! >= 1 && m.lines! <= MAX_LINES && isArrowProgram(m.solution);
}

export function isDraft(x: unknown): x is Draft {
  if (!x || typeof x !== 'object') return false;
  const d = x as Partial<Draft>;
  return isMadeBoard(d.board) && Number.isInteger(d.lines) && d.lines! >= 1 && d.lines! <= MAX_LINES && (d.proof === undefined || isArrowProgram(d.proof));
}
