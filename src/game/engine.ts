// The pure engine: what a command, a tap or a whole program does on a board.
// No DOM, no timing: the board view only animates the trace this returns.

import {
  DELTA, DIRS, cmdProgram, fullMask, initialState, inside, isHole, isWin, obstacleAt, parseCommand, sameCell,
  type Board, type CardRef, type Cell, type Dir, type Program, type RobotState, type Trace, type TraceStep,
} from './model';

/**
 * A "repeat until the goal" loop gives up after this many passes, or as soon
 * as a pass starts where an earlier one started (it would go round forever).
 */
export const MAX_PASSES = 40;

type StepResult = Omit<TraceStep, 'index' | 'cmd' | 'ref'>;

const stateKey = (s: RobotState) => `${s.c},${s.r},${s.mask}`;

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
  if (kind === 'ifrock') return obstacleAt(b, s.c + dc, s.r + dr) ? jump() : result('look', s, []);
  return step();
}

/** Direct control (sala 4, and key presses in 3ro): one tap, one step. */
export function move(b: Board, s: RobotState, dir: Dir): StepResult {
  return applyCommand(b, dir, s);
}

/**
 * Runs a program. Stops at the first crash, as soon as Brote wins (even with
 * blocks left, like habilidades), or when the program ends ("short"). Empty
 * lines are skipped where they are, so every step still names its block.
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
      if (isHole(it.cmd)) continue;
      if (exec(it.cmd, { item }) === 'stop') return finish();
      continue;
    }
    const passes = it.count === 'goal' ? MAX_PASSES : it.count;
    const starts = new Set<string>();
    for (let iter = 0; iter < passes; iter++) {
      if (it.count === 'goal' && isWin(b, s)) break;
      if (!it.body.length) break;
      if (it.count === 'goal') {
        // a pass is a pure function of where it starts: same start, same pass, forever
        if (starts.has(stateKey(s))) break;
        starts.add(stateKey(s));
      }
      for (let inner = 0; inner < it.body.length; inner++) {
        if (isHole(it.body[inner])) continue;
        if (exec(it.body[inner], { item, inner, iter }) === 'stop') return finish();
      }
    }
  }
  return finish();
}

export const solves = (b: Board, program: Program) => simulate(b, program).outcome === 'win';

/**
 * The cards a program plays, in order, each with where it came from: empty
 * lines are skipped, a repeat plays its body `count` times (a count still
 * missing, or "until the goal", plays no pass). For the pages whose program is
 * not a walk to a goal: a song (music.ts), a guarda (guarda.ts).
 */
export function unroll(program: Program): { cmd: string; ref: CardRef }[] {
  const out: { cmd: string; ref: CardRef }[] = [];
  program.forEach((it, item) => {
    if (it.t === 'cmd') {
      if (!isHole(it.cmd)) out.push({ cmd: it.cmd, ref: { item } });
      return;
    }
    const passes = typeof it.count === 'number' ? it.count : 0;
    for (let iter = 0; iter < passes; iter++) {
      it.body.forEach((cmd, inner) => { if (!isHole(cmd)) out.push({ cmd, ref: { item, inner, iter } }); });
    }
  });
  return out;
}

/**
 * One program in several worlds at once (2do page 2). Every block runs as
 * exactly one step in every world, so while two worlds are both still going,
 * their step `i` comes from the same block: the notebook can follow all of
 * them. The program works only when it wins in every world.
 */
export const simulateAll = (worlds: readonly Board[], program: Program): Trace[] => worlds.map((b) => simulate(b, program));
export const solvesAll = (worlds: readonly Board[], program: Program) => worlds.every((b) => solves(b, program));

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
 * The shortest list of commands (from `commands`, in that order of
 * preference) that wins from `from`, or null. Breadth-first over Brote's
 * states (cell + seeds collected): a closed pot is a wall, a peek that finds
 * nothing is no move. Proves generated levels solvable and measures them;
 * completes a child's flat program for the help.
 */
export function shortestPlan(b: Board, commands: readonly string[], from: RobotState = initialState(b), maxDepth = 40): string[] | null {
  if (isWin(b, from)) return [];
  const prev = new Map<string, { parent: string | null; cmd: string | null; depth: number }>([[stateKey(from), { parent: null, cmd: null, depth: 0 }]]);
  let frontier: RobotState[] = [from];
  while (frontier.length) {
    const next: RobotState[] = [];
    for (const s of frontier) {
      const k = stateKey(s);
      const depth = prev.get(k)!.depth;
      if (depth >= maxDepth) continue;
      for (const cmd of commands) {
        const st = applyCommand(b, cmd, s);
        if (st.kind === 'crash' || st.kind === 'look') continue;
        const nk = stateKey(st.to);
        if (prev.has(nk)) continue;
        prev.set(nk, { parent: k, cmd, depth: depth + 1 });
        if (st.won) return unwind(prev, nk);
        next.push(st.to);
      }
    }
    frontier = next;
  }
  return null;
}

function unwind(prev: Map<string, { parent: string | null; cmd: string | null }>, k: string): string[] {
  const out: string[] = [];
  for (let cur: string | null = k; cur; cur = prev.get(cur)!.parent) {
    const cmd = prev.get(cur)!.cmd;
    if (cmd) out.unshift(cmd);
  }
  return out;
}

/**
 * Program help for flat programs (sala 5, 1ro's long plans): a winning
 * program of plain blocks that starts with `prefix` and fits in `slots`
 * cards, or null when `prefix` cannot be completed. The shortest completion
 * (a search over states, so twelve lines cost nothing).
 */
export function completeProgram(b: Board, prefix: string[], blocks: readonly string[], slots: number): string[] | null {
  if (prefix.length > slots) return null;
  const pre = simulate(b, cmdProgram(prefix));
  if (pre.outcome === 'win') return prefix;
  if (pre.outcome === 'crash') return null;
  const rest = shortestPlan(b, blocks, pre.final, slots - prefix.length);
  return rest ? [...prefix, ...rest] : null;
}

/** Every pickup collected, for the goal to "open". */
export const goalOpen = (b: Board, s: RobotState) => s.mask === fullMask(b);
