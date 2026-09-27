// 3ro: a game is not a list of steps that runs once, it is a set of RULES that
// keep applying while it runs ("si te toca, sos la mancha"). This is the pure
// engine of those games: the world advances in ticks, keys come in as input,
// seeds fall on their own, and every rule whose trigger happens fires. No DOM,
// no timers, no Math.random: the same rules, input and seed always give the
// same game, so it can be tested in Node and replayed by the view.

import { move } from './engine';
import { DIRS, initialState, type Board, type Cell, type Dir, type RobotState } from './model';

/** A rule's trigger (its hat): a key of the keyboard, or Brote touching a seed. */
export type KeyHat = `key:${Dir}`;
export type HatId = KeyHat | 'touch:seed';
/** What a rule does: one step in a direction, or one point more. */
export type ActionId = Dir | 'score';

export interface Rule { hat: HatId; actions: ActionId[] }

export const HATS: readonly HatId[] = [...DIRS.map((d) => `key:${d}` as const), 'touch:seed'];
export const isHat = (id: string): id is HatId => (HATS as readonly string[]).includes(id);
export const isAction = (id: string): id is ActionId => id === 'score' || (DIRS as readonly string[]).includes(id);
export const keyOf = (h: HatId): Dir | null => (h.startsWith('key:') ? (h.slice(4) as Dir) : null);
export const hatOfKey = (d: Dir): KeyHat => `key:${d}`;

/** Seeds that fall from the sky (3ro page 2): the world moves without the child. */
export interface Spawner {
  /** Ticks between two seeds: a pseudo-random number in [min, max]. */
  every: readonly [number, number];
  /** Fall speed, in cells per tick. */
  speed: number;
  /** Seed of the pseudo-random generator: the same seed, the same rain. */
  seed: number;
  /** Tick of the first seed. */
  first: number;
}

export interface RealtimeDef {
  /** The rules already on the page when it opens (and after ↺). */
  initial: Rule[];
  /** A reference set of rules; the tests play it with scripted keys and it wins. */
  solution: Rule[];
  /** Reach the goal cell, or reach a score. */
  win: { kind: 'goal' } | { kind: 'score'; n: number };
  spawner?: Spawner;
  /** Lines of a rule card: never more actions under one hat. */
  maxActions: number;
  /** The first time the page opens, the ghost hand builds this rule and presses its key (the idea, not the answer). */
  intro?: Rule;
}

/** One tick of the world, in ms (the view steps the engine on a timer). */
export const TICK_MS = 100;
/** A step of Brote takes this many ticks; keys pressed meanwhile wait their turn. */
export const MOVE_TICKS = 5;
/** Steps waiting for Brote at most (a child hammering a key does not queue a long walk). */
export const MAX_QUEUE = 2;
/** Where a falling seed appears (in rows, above the board). */
export const SPAWN_Y = -0.6;

/** A seed falling in column `c`; `y` is its centre in rows (fractional). */
export interface Faller { id: number; c: number; y: number; touched: boolean }

export interface RtState {
  tick: number;
  robot: RobotState;
  /** Where the current step started (Brote is between `from` and `robot` while `busy`). */
  from: Cell;
  /** Ticks left of the current step. */
  busy: number;
  queue: Dir[];
  score: number;
  seeds: Faller[];
  nextId: number;
  nextSpawn: number;
  rand: number;
  lastCol: number;
  won: boolean;
}

export type RtEvent =
  /** A rule's trigger happened: the rule runs (its hat's ear twitches, its card flashes). */
  | { t: 'fire'; rule: number; hat: HatId }
  /** A key without a rule: nothing happens, Brote shrugs. */
  | { t: 'shrug'; key: Dir }
  /** Brote starts a step (or bumps). */
  | { t: 'move'; step: ReturnType<typeof move>; dir: Dir }
  | { t: 'spawn'; id: number; c: number; y: number }
  /** A seed touched Brote and a touch rule took it. */
  | { t: 'collect'; id: number }
  /** A seed touched Brote but no rule listens to touches: it goes on falling. */
  | { t: 'pass'; id: number }
  /** A seed reached the ground and is gone. */
  | { t: 'lost'; id: number }
  | { t: 'score'; score: number }
  | { t: 'win' };

/** mulberry32: a tiny seeded generator. Returns a number in [0, 1) and the next state. */
export function nextRandom(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(s ^ (s >>> 15), 1 | s);
  r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, s];
}

export function rtInit(board: Board, def: RealtimeDef): RtState {
  const robot = initialState(board);
  return {
    tick: 0, robot, from: { c: robot.c, r: robot.r }, busy: 0, queue: [], score: 0, seeds: [], nextId: 1,
    nextSpawn: def.spawner?.first ?? Infinity, rand: def.spawner?.seed ?? 1, lastCol: -1, won: false,
  };
}

/** The row where a falling seed lands on the ground (it is lost there). */
export const landingY = (b: Board) => b.rows - 1 + 0.25;

/** Brote's cells for touching: both ends of a step while he is on his way (hitboxes are forgiving). */
function touchCells(s: RtState): Cell[] {
  return s.busy > 0 ? [s.from, s.robot] : [s.robot];
}

/** Does a falling seed touch Brote? Same column, and low enough to reach him. */
export function touches(s: RtState, f: Faller): boolean {
  return touchCells(s).some((c) => c.c === f.c && f.y >= c.r - 0.6 && f.y <= c.r + 0.3);
}

/**
 * One tick of the game. `keys` are the arrow keys pressed since the last
 * tick; `rules` are read live (the child may add one while the game runs).
 * Order inside a tick: keys fire their rules, Brote takes the next queued
 * step, a seed may appear, seeds fall and may touch Brote, then the win.
 */
export function rtStep(board: Board, def: RealtimeDef, rules: readonly Rule[], prev: RtState, keys: readonly Dir[] = []): { state: RtState; events: RtEvent[] } {
  if (prev.won) return { state: prev, events: [] };
  const s: RtState = { ...prev, tick: prev.tick + 1, queue: [...prev.queue], seeds: prev.seeds.map((f) => ({ ...f })) };
  const events: RtEvent[] = [];

  const run = (i: number) => {
    const rule = rules[i];
    events.push({ t: 'fire', rule: i, hat: rule.hat });
    for (const a of rule.actions) {
      if (a === 'score') {
        s.score += 1;
        events.push({ t: 'score', score: s.score });
      } else if (s.queue.length < MAX_QUEUE) s.queue.push(a);
    }
  };

  // 1. keys: every rule listening to that key fires; a key nobody listens to is a shrug
  for (const k of keys) {
    const i = rules.findIndex((r) => r.hat === hatOfKey(k));
    if (i < 0) events.push({ t: 'shrug', key: k });
    else run(i);
  }

  // 2. Brote: finish the step under way, or start the next one
  if (s.busy > 0) s.busy -= 1;
  if (s.busy === 0 && s.queue.length) {
    const dir = s.queue.shift()!;
    const step = move(board, s.robot, dir);
    events.push({ t: 'move', step, dir });
    s.from = { c: s.robot.c, r: s.robot.r };
    if (step.kind !== 'crash') s.robot = step.to;
    s.busy = MOVE_TICKS;
    if (def.win.kind === 'goal' && step.won) {
      s.won = true;
      events.push({ t: 'win' });
      return { state: s, events };
    }
  } else if (s.busy === 0) {
    s.from = { c: s.robot.c, r: s.robot.r };
  }

  // 3. the sky: a seed appears now and then, never twice in a row in the same column
  const sp = def.spawner;
  if (sp && s.tick >= s.nextSpawn) {
    let x: number;
    [x, s.rand] = nextRandom(s.rand);
    let c = Math.floor(x * board.cols);
    if (c === s.lastCol) c = (c + 1 + Math.floor(x * 97) % (board.cols - 1)) % board.cols;
    s.lastCol = c;
    const seed: Faller = { id: s.nextId++, c, y: SPAWN_Y, touched: false };
    s.seeds.push(seed);
    events.push({ t: 'spawn', id: seed.id, c, y: seed.y });
    [x, s.rand] = nextRandom(s.rand);
    s.nextSpawn = s.tick + sp.every[0] + Math.floor(x * (sp.every[1] - sp.every[0] + 1));
  }

  // 4. seeds fall; one that touches Brote fires the touch rule once, or passes through
  if (sp) {
    const land = landingY(board);
    const touchRule = rules.findIndex((r) => r.hat === 'touch:seed');
    const keep: Faller[] = [];
    for (const f of s.seeds) {
      f.y = Math.min(land, f.y + sp.speed);
      if (!f.touched && touches(s, f)) {
        f.touched = true;
        if (touchRule >= 0) {
          events.push({ t: 'collect', id: f.id });
          run(touchRule);
          continue;
        }
        events.push({ t: 'pass', id: f.id });
      }
      if (f.y >= land) { events.push({ t: 'lost', id: f.id }); continue; }
      keep.push(f);
    }
    s.seeds = keep;
  }

  // 5. the win
  if (def.win.kind === 'score' && s.score >= def.win.n) {
    s.won = true;
    events.push({ t: 'win' });
  }
  return { state: s, events };
}

/** Plays `ticks` ticks with keys from `input(state)`; for tests and help. */
export function rtPlay(board: Board, def: RealtimeDef, rules: readonly Rule[], ticks: number, input: (s: RtState) => Dir[] = () => []) {
  let state = rtInit(board, def);
  const events: RtEvent[] = [];
  for (let i = 0; i < ticks && !state.won; i++) {
    const r = rtStep(board, def, rules, state, input(state));
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/**
 * A simple player for page 2: when Brote is free, walk towards the seed that
 * lands first. Used by the tests and by ✋ (which arrow to press now).
 */
export function chaseSeed(s: RtState): Dir | null {
  if (!s.seeds.length) return null;
  const target = s.seeds.filter((f) => !f.touched).sort((a, b) => b.y - a.y)[0];
  if (!target || target.c === s.robot.c) return null;
  return target.c > s.robot.c ? 'right' : 'left';
}

/** The rules of `a` that do what the rule of the same hat in `ref` does (by hat). */
export const ruleFor = (rules: readonly Rule[], hat: HatId) => rules.find((r) => r.hat === hat) ?? null;
