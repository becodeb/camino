// The pure engine: what a command, a tap or a whole program does on a board.
// No DOM, no timing: the board view only animates the trace this returns.

import {
  DELTA, DIRS, cmdProgram, fullMask, initialState, inside, isWin, obstacleAt, parseCommand, sameCell,
  type Board, type CardRef, type Cell, type Dir, type Program, type RobotState, type Trace, type TraceStep,
} from './model';

/** A "repeat until the goal" loop gives up after this many passes (a program that never gets there). */
export const MAX_PASSES = 40;

type StepResult = Omit<TraceStep, 'index' | 'cmd' | 'ref'>;

function land(b: Board, s: RobotState, c: number, r: number, collected: number[]): RobotState {
  let mask = s.mask;
  b.pickups.forEach((p, i) => {
    if (p.c === c && p.r === r && !(mask & (1 << i))) { mask |= 1 << i; collected.push(i); }
  });
  return { c, r, mask };
}

/**
 * Applies one command from `s`. Pure: a crash leaves Brote where he was.
 * A pot that still waits for seeds is closed: walking into it is a bump, the
 * board's own way of saying "the seed comes first".
 */
export function applyCommand(b: Board, cmd: string, s: RobotState): StepResult {
  const { kind, dir } = parseCommand(cmd);
  const collected: number[] = [];
  const [dc, dr] = DELTA[dir];
  const result = (k: StepResult['kind'], to: RobotState, cells: Cell[], crash?: StepResult['crash']): StepResult =>
    ({ kind: k, dir, from: s, to, cells, crash, collected, won: !crash && isWin(b, to) });
  const closed = (c: number, r: number) => sameCell({ c, r }, b.goal) && s.mask !== fullMask(b);
  const blocked = (c: number, r: number) => !inside(b, c, r) || !!obstacleAt(b, c, r) || closed(c, r);

  const crashAt = (c: number, r: number) => result('crash', s, [], { at: { c, r }, out: !inside(b, c, r), ...(closed(c, r) ? { closed: true } : {}) });
  const jump = () => {
    const c = s.c + dc * 2, r = s.r + dr * 2;
    if (blocked(c, r)) return crashAt(c, r);
    return result('jump', land(b, s, c, r, collected), [{ c, r }]);
  };
  const step = () => {
    const c = s.c + dc, r = s.r + dr;
    if (blocked(c, r)) return crashAt(c, r);
    return result('move', land(b, s, c, r, collected), [{ c, r }]);
  };

  if (kind === 'jump') return jump();
  if (kind === 'ifrock') return obstacleAt(b, s.c + dc, s.r + dr) ? jump() : step();
  return step();
}

/** Direct control (sala 4, and key presses in 3ro): one tap, one step. */
export function move(b: Board, s: RobotState, dir: Dir): StepResult {
  return applyCommand(b, dir, s);
}

/**
 * Runs a program. Stops at the first crash, as soon as Brote wins (even with
 * blocks left, like habilidades), or when the program ends ("short").
 */
export function simulate(b: Board, program: Program, opts: { from?: RobotState } = {}): Trace {
  let s = opts.from ?? initialState(b);
  const steps: TraceStep[] = [];
  const exec = (cmd: string, ref: CardRef): 'go' | 'stop' => {
    const st = applyCommand(b, cmd, s);
    steps.push({ index: steps.length, cmd, ref, ...st });
    s = st.to;
    return st.kind === 'crash' || st.won ? 'stop' : 'go';
  };
  const finish = (): Trace => {
    const last = steps[steps.length - 1];
    if (last?.kind === 'crash') return { steps, final: s, outcome: 'crash', crashAt: last.index };
    if (last?.won || isWin(b, s)) return { steps, final: s, outcome: 'win' };
    return { steps, final: s, outcome: 'short' };
  };

  for (let item = 0; item < program.length; item++) {
    const it = program[item];
    if (it.t === 'cmd') {
      if (exec(it.cmd, { item }) === 'stop') return finish();
      continue;
    }
    const passes = it.count === 'goal' ? MAX_PASSES : it.count;
    for (let iter = 0; iter < passes; iter++) {
      if (it.count === 'goal' && isWin(b, s)) break;
      if (!it.body.length) break;
      for (let inner = 0; inner < it.body.length; inner++) {
        if (exec(it.body[inner], { item, inner, iter }) === 'stop') return finish();
      }
    }
  }
  return finish();
}

export const solves = (b: Board, program: Program) => simulate(b, program).outcome === 'win';

const stateKey = (s: RobotState) => `${s.c},${s.r},${s.mask}`;

/**
 * The shortest list of steps from `s` that wins (collecting every pickup on
 * the way), or null. Used by the direct-control help and by level tests.
 */
export function shortestMoves(b: Board, s: RobotState = initialState(b)): Dir[] | null {
  const queue: { s: RobotState; path: Dir[] }[] = [{ s, path: [] }];
  const seen = new Set([stateKey(s)]);
  while (queue.length) {
    const { s: cur, path } = queue.shift()!;
    if (isWin(b, cur)) return path;
    for (const d of DIRS) {
      const st = move(b, cur, d);
      if (st.kind === 'crash' || seen.has(stateKey(st.to))) continue;
      seen.add(stateKey(st.to));
      queue.push({ s: st.to, path: [...path, d] });
    }
  }
  return null;
}

/** Direct-control help: the arrow to tap next from where Brote stands. */
export function nextMove(b: Board, s: RobotState): Dir | null {
  return shortestMoves(b, s)?.[0] ?? null;
}

/**
 * Program help for flat programs (sala 5): a winning program of plain blocks
 * that starts with `prefix` and fits in `slots` cards, or null when `prefix`
 * cannot be completed. Tries shorter completions first.
 */
export function completeProgram(b: Board, prefix: string[], blocks: readonly string[], slots: number): string[] | null {
  if (prefix.length > slots) return null;
  const pre = simulate(b, cmdProgram(prefix));
  if (pre.outcome === 'win') return prefix;
  if (pre.outcome === 'crash') return null;
  const room = slots - prefix.length;
  let found: string[] | null = null;
  const dfs = (s: RobotState, acc: string[], depth: number): boolean => {
    if (acc.length === depth) return false;
    for (const cmd of blocks) {
      const st = applyCommand(b, cmd, s);
      if (st.kind === 'crash') continue;
      const next = [...acc, cmd];
      if (st.won) { found = next; return true; }
      if (dfs(st.to, next, depth)) return true;
    }
    return false;
  };
  for (let depth = 1; depth <= room; depth++) {
    if (dfs(pre.final, [], depth)) return [...prefix, ...found!];
  }
  return null;
}

/** Every pickup collected, for the goal to "open". */
export const goalOpen = (b: Board, s: RobotState) => s.mask === fullMask(b);
