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

import { type Block, type BlockKind, type Program, type Sensor } from './program';
import type { Tier, TrackSpec } from './tracks';

export type Branch = 'body' | 'then' | 'else';
export interface PathStep { index: number; branch: Branch }
/** Where a block goes: in the main or event script, inside the containers of `path`, at `index` of the list there (-1: the event hat itself). */
export interface Position { script: 'main' | 'event'; path: PathStep[]; index: number }

export interface HintBlock {
  kind: BlockKind | 'on_log';
  n?: number | 'laps';
  cond?: Sensor[];
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
}

interface Token { key: string; id: string; block: HintBlock; position: Position }

const keyOf = (b: HintBlock, depth: number, branch: Branch | null): string =>
  `${depth}|${branch ?? '-'}|${b.kind}|${b.n ?? ''}|${(b.cond ?? []).slice().sort().join('+')}|${b.delta ?? ''}`;

function tokensOf(p: Program): Token[] {
  const out: Token[] = [];
  const walk = (blocks: readonly Block[], script: 'main' | 'event', path: PathStep[], branch: Branch | null) => {
    blocks.forEach((b, index) => {
      const hb: HintBlock = b.kind === 'repeat' ? { kind: 'repeat', n: b.n } : b.kind === 'wait' ? { kind: 'wait', n: b.n }
        : b.kind === 'if' ? { kind: 'if', cond: b.cond } : b.kind === 'nitro' ? { kind: 'nitro', delta: b.delta } : { kind: b.kind };
      out.push({ key: keyOf(hb, path.length, branch), id: b.id, block: hb, position: { script, path: [...path], index } });
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
export function nextBlockHint(program: Program, track: Pick<TrackSpec, 'refs'>): Hint | null {
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
  return {
    block: want.block,
    position: want.position,
    from,
    matched,
    ...(matched < cur.length ? { wrongBlockId: cur[matched].id } : {}),
  };
}
