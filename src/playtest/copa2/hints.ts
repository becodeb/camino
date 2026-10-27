// Copa v2: the ghost hand. After two failures on the same track the UI shows
// ONLY the next block the solution would add, never the whole program.
// `nextBlockHint(program, track)` compares the child's (possibly partial)
// program with the gold and the silver reference programs, block by block in
// reading order (a container, then what is inside it; the main script, then
// the event script), keeps the solution the child's program matches longest
// (the longest correct prefix; gold wins a tie) and returns the first block
// after that prefix, with where it goes. A wrong block in the way is reported
// (`wrongBlockId`): the hint is then "this should be here instead".
//
// Blocks are compared by what they are (kind, count, sensors, nitro step) and
// where they sit (depth and branch), never by id: the child's ids are their own.

import { SENSORS, type Block, type BlockKind, type Program, type Sensor } from './program';
import { simulate } from './sim';
import { tileAt } from './track';
import type { Tier, TrackSpec } from './tracks';

export type Branch = 'body' | 'then' | 'else';
export interface PathStep { index: number; branch: Branch }
/** Where a block goes: in the main or event script, inside the containers of `path`, at `index` of the list there (-1: the event hat itself). */
export interface Position { script: 'main' | 'event'; path: PathStep[]; index: number }

export interface HintBlock {
  /** `sensor`: a condition piece for the `si` at `position` (the `si` itself comes first, with an empty hole). */
  kind: BlockKind | 'on_log' | 'sensor';
  n?: number | 'laps';
  sensor?: Sensor;
  delta?: number;
}

export interface Hint {
  block: HintBlock;
  position: Position;
  /** Which reference program the hint comes from. */
  from: Extract<Tier, 'silver' | 'gold'>;
  /** Blocks of the child's program that already match that solution, in reading order. */
  matched: number;
  /** The child's own block that sits where the hint's block should be, if there is one (replace it). */
  wrongBlockId?: string;
  /** A `sensor` hint: the child's own `si` that takes it (its hole is the target). */
  ifId?: string;
  /** The child's own condition that should not be in that `si` (take it out). Not produced any more: only the engine's culprit is ever flagged. */
  wrongSensor?: { ifId: string; sensor: Sensor };
  /** A `repetir` of the child's that is the right block with the wrong number: change its number (never delete it). */
  changeNumberId?: string;
}

interface Token { key: string; id: string; block: HintBlock; position: Position; ifId?: string }

const keyOf = (b: HintBlock, depth: number, branch: Branch | null): string =>
  `${depth}|${branch ?? '-'}|${b.kind}|${b.n ?? ''}|${b.sensor ?? ''}|${b.delta ?? ''}`;

function tokensOf(p: Program): Token[] {
  const out: Token[] = [];
  const walk = (blocks: readonly Block[], script: 'main' | 'event', path: PathStep[], branch: Branch | null) => {
    blocks.forEach((b, index) => {
      const hb: HintBlock = b.kind === 'repeat' ? { kind: 'repeat', n: b.n } : b.kind === 'wait' ? { kind: 'wait', n: b.n }
        : b.kind === 'if' ? { kind: 'if' } : b.kind === 'nitro' ? { kind: 'nitro', delta: b.delta } : { kind: b.kind };
      const position: Position = { script, path: [...path], index };
      out.push({ key: keyOf(hb, path.length, branch), id: b.id, block: hb, position });
      if (b.kind === 'if') {
        // the condition pieces come right after their `si`, in the engine's order
        for (const sensor of SENSORS.filter((x) => b.cond.includes(x))) {
          const sb: HintBlock = { kind: 'sensor', sensor };
          out.push({ key: keyOf(sb, path.length, branch), id: `${b.id}:${sensor}`, block: sb, position, ifId: b.id });
        }
      }
      if (b.kind === 'repeat') walk(b.body, script, [...path, { index, branch: 'body' }], 'body');
      else if (b.kind === 'if') {
        walk(b.then, script, [...path, { index, branch: 'then' }], 'then');
        walk(b.else, script, [...path, { index, branch: 'else' }], 'else');
      }
    });
  };
  walk(p.main, 'main', [], null);
  if (p.onLog) {
    const hat: HintBlock = { kind: 'on_log' };
    out.push({ key: keyOf(hat, 0, null), id: p.onLog.id, block: hat, position: { script: 'event', path: [], index: -1 } });
    walk(p.onLog.body, 'event', [], null);
  }
  return out;
}

/** How many leading tokens of `cur` equal those of `sol`. */
const prefixLength = (cur: readonly Token[], sol: readonly Token[]): number => {
  let n = 0;
  while (n < cur.length && n < sol.length && cur[n].key === sol[n].key) n++;
  return n;
};

/**
 * The next block to add to `program` on `track`, or null when the program
 * already contains a whole reference solution (the gold one, or the silver
 * one: it is as good as the child needs to be).
 */
function referenceHint(program: Program, track: Pick<TrackSpec, 'refs'>): Hint | null {
  const cur = tokensOf(program);
  let best: { from: 'gold' | 'silver'; sol: Token[]; matched: number } | null = null;
  for (const from of ['gold', 'silver'] as const) {
    const sol = tokensOf(track.refs[from]);
    const matched = prefixLength(cur, sol);
    if (matched === sol.length) return null;
    if (!best || matched > best.matched) best = { from, sol, matched };
  }
  const { from, sol, matched } = best!;
  const want = sol[matched];
  const wrong = matched < cur.length ? cur[matched] : null;
  // a sensor piece goes into the `si` the child already has at that place (the one just before in reading order)
  let ifId: string | undefined;
  if (want.block.kind === 'sensor') for (let i = matched - 1; i >= 0; i--) if (cur[i].block.kind === 'if') { ifId = cur[i].id; break; }
  return {
    block: want.block,
    position: want.position,
    from,
    matched,
    ...(ifId ? { ifId } : {}),
    // a missing condition is asked for first: the blocks the child already put inside the `si` may well be right
    ...(wrong && wrong.block.kind !== 'sensor' && want.block.kind !== 'sensor' ? { wrongBlockId: wrong.id } : {}),
    ...(wrong && wrong.block.kind === 'sensor' && wrong.ifId ? { wrongSensor: { ifId: wrong.ifId, sensor: wrong.block.sensor! } } : {}),
  };
}

// ------------------------------------------------------------------ grounded in the simulation

const shapeOf = (b: Block): string => (b.kind === 'repeat' ? `r(${b.body.map(shapeOf).join(',')})` : b.kind === 'if' ? `i(${b.then.map(shapeOf).join(',')}|${b.else.map(shapeOf).join(',')})` : b.kind);

/** Every `repetir` of a program in reading order, with the ids of the blocks inside it (its whole subtree). */
function repeatsOf(p: Program): { block: Extract<Block, { kind: 'repeat' }>; inside: Set<string>; position: Position }[] {
  const out: { block: Extract<Block, { kind: 'repeat' }>; inside: Set<string>; position: Position }[] = [];
  const ids = (bs: readonly Block[], into: Set<string>) => bs.forEach((b) => { into.add(b.id); if (b.kind === 'repeat') ids(b.body, into); else if (b.kind === 'if') { ids(b.then, into); ids(b.else, into); } });
  const walk = (blocks: readonly Block[], script: 'main' | 'event', path: PathStep[]) => {
    blocks.forEach((b, index) => {
      if (b.kind === 'repeat') {
        const inside = new Set<string>();
        ids(b.body, inside);
        out.push({ block: b, inside, position: { script, path: [...path], index } });
        walk(b.body, script, [...path, { index, branch: 'body' }]);
      } else if (b.kind === 'if') {
        walk(b.then, script, [...path, { index, branch: 'then' }]);
        walk(b.else, script, [...path, { index, branch: 'else' }]);
      }
    });
  };
  walk(p.main, 'main', []);
  if (p.onLog) walk(p.onLog.body, 'event', []);
  return out;
}

/**
 * A `repetir` of the child's with the reference's own body but another number, when the engine's trouble is at it
 * (the culprit block is inside it, or the program ended / never ended): the fix is its number, not the block.
 */
function numberFix(program: Program, track: Pick<TrackSpec, 'refs'>, culprit: string | null): { id: string; n: number; position: Position; from: 'gold' | 'silver' } | null {
  const mine = repeatsOf(program);
  for (const from of ['gold', 'silver'] as const) {
    const theirs = repeatsOf(track.refs[from]);
    for (let i = 0; i < mine.length && i < theirs.length; i++) {
      const m = mine[i].block;
      const t = theirs[i].block;
      if (typeof m.n !== 'number' || typeof t.n !== 'number' || m.n === t.n || shapeOf(m) !== shapeOf(t)) continue;
      if (culprit && !mine[i].inside.has(culprit)) continue;
      return { id: m.id, n: t.n, position: mine[i].position, from };
    }
  }
  return null;
}

/**
 * The next thing to tell the child, grounded in what the program DOES (the engine's run), never in a comparison
 * with the reference programs: a block the run executed without trouble is never flagged.
 * - finishes: nothing to say (null);
 * - crashes: only the block the engine blames is flagged (unless it is the right block with the wrong number: then "change the number");
 * - ends before the line (or never ends): the next block to ADD for the tile where the kart stopped (the reference
 *   only picks the shape when the child is following it), or the number of a `repetir` that is off.
 */
export function nextBlockHint(program: Program, track: TrackSpec, seed = 1): Hint | null {
  const empty = !program.main.length && !program.onLog;
  const ref = referenceHint(program, track);
  if (empty) return ref;
  const sim = simulate(program, track, seed);
  if (sim.outcome === 'finish') return null;
  const cur = tokensOf(program);
  // a program that is exactly the start of a reference is unfinished, not wrong (a `repetir 4` with its body half built
  // crashes when run): carry on with the reference's next block
  if (ref && ref.matched === cur.length && !ref.wrongBlockId) return ref;
  const base = { from: ref?.from ?? 'gold', matched: ref?.matched ?? 0 } as const;

  if (sim.outcome === 'crash' && sim.crash) {
    const id = sim.crash.blockId;
    const fix = numberFix(program, track, id);
    if (fix) return { block: { kind: 'repeat', n: fix.n }, position: fix.position, from: fix.from, matched: base.matched, changeNumberId: fix.id };
    const at = cur.find((t) => t.id === id);
    return { block: ref?.block ?? { kind: 'forward' }, position: at?.position ?? ref?.position ?? { script: 'main', path: [], index: 0 }, ...base, wrongBlockId: id };
  }

  // stuck or timeout: add, or fix a number
  const fix = numberFix(program, track, null);
  if (fix && (sim.outcome === 'timeout' || !ref || ref.matched < cur.length)) return { block: { kind: 'repeat', n: fix.n }, position: fix.position, from: fix.from, matched: base.matched, changeNumberId: fix.id };
  if (sim.outcome === 'stuck') {
    // the child is following a reference: carry on with its next block (without ever flagging what is there)
    const tile = tileAt(track, sim.pos);
    const kind: BlockKind = tile.kind === 'rise' ? 'up' : tile.kind === 'drop' ? 'down' : sim.puddles.includes(sim.pos) ? 'jump' : 'forward';
    return { block: { kind }, position: { script: 'main', path: [], index: program.main.length }, ...base };
  }
  return null;
}
