// The data every level is made of: boards, commands, programs and traces.
// Pure types and tiny helpers, shared by the engine, the editor and the UI.

/** Absolute screen directions (design rule 6: no relative turns). */
export type Dir = 'up' | 'right' | 'down' | 'left';
export const DIRS: readonly Dir[] = ['up', 'right', 'down', 'left'];
export const DELTA: Record<Dir, readonly [number, number]> = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

export interface Cell { c: number; r: number }
/** `earth`: a stone step or a stone wall (1ro's staircase), drawn as one mass with its neighbours. */
export type ObstacleKind = 'rock' | 'puddle' | 'blot' | 'earth';
export interface Obstacle extends Cell { kind: ObstacleKind; seed: number }
/** A tuft of grass drawn on the floor (decoration only). */
export interface Deco extends Cell { dx: number; dy: number; seed: number }

/**
 * What waits at the goal: the seed itself (sala 4, sala 5 level 1), or a pot
 * where Brote plants the seeds it picked up (it only "opens" once every
 * pickup is collected). `none`: no goal cell, the page is won another way
 * (3ro page 2, by points).
 */
export type GoalKind = 'seed' | 'pot' | 'none';

export interface Board {
  cols: number;
  rows: number;
  start: Cell;
  goal: Cell;
  goalKind: GoalKind;
  obstacles: Obstacle[];
  /** Seeds to collect before the goal counts. Collected by stepping on them. */
  pickups: Cell[];
  deco: Deco[];
  /** Seed for every hand-drawn wobble of this board. */
  seed: number;
}

/**
 * Command ids. A plain direction is one step. Later grades add:
 * `jump:<dir>` two cells, flying over whatever is between;
 * `ifrock:<dir>` "si hay piedra, saltar": if there is a rock right there,
 * jump it; otherwise nothing happens (Brote only looks). An if-then, no else:
 * walking on is the next block's job.
 */
export type CommandId = Dir | `jump:${Dir}` | `ifrock:${Dir}`;
export type CommandKind = 'step' | 'jump' | 'ifrock';

export function parseCommand(id: string): { kind: CommandKind; dir: Dir } {
  if ((DIRS as readonly string[]).includes(id)) return { kind: 'step', dir: id as Dir };
  const [kind, dir] = id.split(':');
  if ((kind === 'jump' || kind === 'ifrock') && (DIRS as readonly string[]).includes(dir)) return { kind, dir: dir as Dir };
  throw new Error(`unknown command ${id}`);
}

/**
 * A program: blocks stacked under the start block. A loop (C-block) repeats
 * its body `count` times, or until Brote is on the goal (`'goal'`). One
 * level of nesting, as the editor draws it. A count of 0 is a count still
 * missing (a "complete" page): the loop makes no pass.
 */
export type ProgramItem =
  | { t: 'cmd'; cmd: string }
  | { t: 'loop'; count: number | 'goal'; body: string[] };
export type Program = ProgramItem[];

export const cmdProgram = (ids: string[]): Program => ids.map((cmd) => ({ t: 'cmd', cmd }));

/**
 * An empty line of the notebook. On "complete" and "fix" pages every line
 * stays in place: a block taken out leaves its line empty, and a line can be
 * missing from the start. An empty line does nothing when the program runs.
 */
export const HOLE = '';
export const isHole = (cmd: string) => cmd === HOLE;

/** Where a primitive came from: the item index, the card inside a loop, and the loop pass. */
export interface CardRef { item: number; inner?: number; iter?: number }

export interface RobotState extends Cell {
  /** Bit i set once pickup i was collected. */
  mask: number;
}

/** `look`: an if that found nothing to do (Brote peeks ahead, stays put). */
export type StepKind = 'move' | 'jump' | 'crash' | 'look';

export interface TraceStep {
  /** Index among executed primitives. */
  index: number;
  cmd: string;
  ref: CardRef;
  kind: StepKind;
  dir: Dir;
  from: RobotState;
  to: RobotState;
  /** Cells Brote lands on, in order. */
  cells: Cell[];
  /** Where Brote bumped: a rock (or other obstacle), the edge of the board, or a pot still closed. */
  crash?: { at: Cell; out: boolean; closed?: boolean };
  /** Pickups collected during this step. */
  collected: number[];
  won: boolean;
}

export type Outcome = 'win' | 'crash' | 'short';

export interface Trace {
  steps: TraceStep[];
  final: RobotState;
  outcome: Outcome;
  /** Index of the step that crashed. */
  crashAt?: number;
}

export const sameCell = (a: Cell | null | undefined, b: Cell | null | undefined) => !!a && !!b && a.c === b.c && a.r === b.r;
export const inside = (b: Board, c: number, r: number) => c >= 0 && r >= 0 && c < b.cols && r < b.rows;
export const obstacleAt = (b: Board, c: number, r: number) => b.obstacles.find((o) => o.c === c && o.r === r);
export const fullMask = (b: Board) => (1 << b.pickups.length) - 1;
export const initialState = (b: Board): RobotState => ({ c: b.start.c, r: b.start.r, mask: 0 });
export const isWin = (b: Board, s: RobotState) => sameCell(s, b.goal) && s.mask === fullMask(b);

/** 2do fog: what Brote sees from a cell, the cell itself and the four next to it. */
export const visibleFrom = (b: Board, at: Cell): Cell[] =>
  [at, ...Object.values(DELTA).map(([dc, dr]) => ({ c: at.c + dc, r: at.r + dr }))].filter((x) => inside(b, x.c, x.r));

/** Cards the child placed (a loop itself is not a card, nor is an empty line). */
export const cardCount = (p: Program) =>
  p.reduce((n, it) => n + (it.t === 'cmd' ? (isHole(it.cmd) ? 0 : 1) : it.body.filter((c) => !isHole(c)).length), 0);
