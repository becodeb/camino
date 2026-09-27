// 1ro's guardas (sheet 14) as pure data and functions: notebook borders
// drawn on squared paper. The board's cells are the points where the
// paper's lines cross; Brote walks from point to point with absolute arrows
// and every step inks the segment under him. The border to draw (the guide)
// is a faint pencil line. The page asks for the guide's drawing exactly:
//
// - a step along the guide inks it; going back over a segment already inked
//   is fine (the pen goes over its own line);
// - a step off the guide smudges the ink and stops the run: its card is the
//   culprit (so does a step past the guide's end: an extra segment);
// - a step off the page bumps its edge;
// - the notebook ends with every segment of the guide inked: won; with some
//   still in pencil: "short".
//
// Runs come out as the engine's Trace, so the level page drives them like a
// walk (see guardaTrace).

import { unroll } from './engine';
import { NO_GOAL } from './formats';
import { DELTA, inside, parseCommand, type Board, type Cell, type Dir, type Program, type RobotState, type Trace, type TraceStep } from './model';

export interface GuardaDef {
  /** The guide: the border, as absolute arrows from the board's start. */
  moves: Dir[];
}

/** A segment of the squared paper between two neighbouring points, the same whichever way it is walked. */
export function segKey(a: Cell, b: Cell): string {
  const [p, q] = a.r < b.r || (a.r === b.r && a.c < b.c) ? [a, b] : [b, a];
  return `${p.c},${p.r}|${q.c},${q.r}`;
}

const step = (at: Cell, d: Dir): Cell => ({ c: at.c + DELTA[d][0], r: at.r + DELTA[d][1] });

/** The points the guide goes through, from the start. */
export function guidePath(board: Board, def: GuardaDef): Cell[] {
  const out = [board.start];
  for (const d of def.moves) out.push(step(out[out.length - 1], d));
  return out;
}

/** The guide's segments (each once), in the order the guide draws them. */
export function guideSegments(board: Board, def: GuardaDef): string[] {
  const path = guidePath(board, def);
  return [...new Set(path.slice(1).map((c, i) => segKey(path[i], c)))];
}

const at = (c: Cell): RobotState => ({ c: c.c, r: c.r, mask: 0 });

/**
 * What a notebook of arrows draws, as a Trace: a step per card (`cells: [the
 * point reached]`). A step off the guide is the step that crashes, and Brote
 * still walks it (`to` is the point reached, `crash.out` false: the smudge);
 * a step off the page crashes against its edge (`to` is where he was,
 * `crash.out` true). Won when the notebook ends with the whole guide inked.
 */
export function guardaTrace(board: Board, def: GuardaDef, program: Program): Trace {
  const guide = new Set(guideSegments(board, def));
  const inked = new Set<string>();
  const steps: TraceStep[] = [];
  let pos: Cell = board.start;
  for (const [index, { cmd, ref }] of unroll(program).entries()) {
    const { kind, dir } = parseCommand(cmd);
    if (kind !== 'step') throw new Error(`a guarda only walks: ${cmd}`);
    const next = step(pos, dir);
    const base = { index, cmd, ref, dir, from: at(pos), collected: [], won: false };
    if (!inside(board, next.c, next.r)) {
      steps.push({ ...base, kind: 'crash', to: at(pos), cells: [], crash: { at: next, out: true } });
      return { steps, final: at(pos), outcome: 'crash', crashAt: index };
    }
    const seg = segKey(pos, next);
    if (!guide.has(seg)) {
      steps.push({ ...base, kind: 'crash', to: at(next), cells: [next], crash: { at: next, out: false } });
      return { steps, final: at(next), outcome: 'crash', crashAt: index };
    }
    inked.add(seg);
    steps.push({ ...base, kind: 'move', to: at(next), cells: [next] });
    pos = next;
  }
  const done = guide.size > 0 && inked.size === guide.size;
  if (done && steps.length) steps[steps.length - 1].won = true;
  return { steps, final: at(pos), outcome: done ? 'win' : 'short' };
}

/**
 * The page of a guarda: the guide's bounding box of points with one more
 * row and column of paper all round (a step off the guide lands on paper,
 * where it smudges), the pen on the guide's first point, no goal.
 */
export function guardaBoard(moves: readonly Dir[], seed: number, look?: 'river'): Board {
  const path: Cell[] = [{ c: 0, r: 0 }];
  for (const d of moves) path.push(step(path[path.length - 1], d));
  const minC = Math.min(...path.map((x) => x.c)), minR = Math.min(...path.map((x) => x.r));
  const maxC = Math.max(...path.map((x) => x.c)), maxR = Math.max(...path.map((x) => x.r));
  return {
    cols: maxC - minC + 3, rows: maxR - minR + 3, start: { c: 1 - minC, r: 1 - minR }, goal: NO_GOAL, goalKind: 'none',
    obstacles: [], pickups: [], deco: [], seed, ...(look ? { look } : {}),
  };
}

/**
 * What makes two guarda pages the same (to keep a run of extras free of
 * repeats): one repeat of a pattern is `guarda:<pattern>:<count>`, like the
 * guarda family's; anything else is the guide itself.
 */
export function guardaKey(solution: Program): string {
  const only = solution.length === 1 ? solution[0] : null;
  if (only?.t === 'loop' && typeof only.count === 'number') return `guarda:${only.body.join(',')}:${only.count}`;
  return `guarda-path:${unroll(solution).map(({ cmd }) => cmd).join(',')}`;
}
