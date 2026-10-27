import { describe, expect, it } from 'vitest';
import { programBuilder, slotCount, type Block, type Program } from './program';
import { nextBlockHint, type Hint } from './hints';
import { simulate } from './sim';
import { ALL_TRACKS, COPAS, referenceTimes, trackById, type TrackSpec } from './tracks';

let counter = 0;
/** What the UI would do: put the hinted block where the ghost hand points (an empty container for a container). */
function apply(program: Program, hint: Hint): Program {
  const id = `h${++counter}`;
  const hb = hint.block;
  if (hb.kind === 'on_log') return { ...program, onLog: { id, body: [] } };
  if (hb.kind === 'sensor') {
    // the condition piece goes into the `si` the hint names
    const put = (list: Block[]): Block[] => list.map((b) => (b.kind === 'if' && b.id === hint.ifId ? { ...b, cond: [...b.cond, hb.sensor!] } : b.kind === 'repeat' ? { ...b, body: put(b.body) } : b.kind === 'if' ? { ...b, then: put(b.then), else: put(b.else) } : b));
    return { ...program, main: put(program.main), ...(program.onLog ? { onLog: { ...program.onLog, body: put(program.onLog.body) } } : {}) };
  }
  const block: Block = hb.kind === 'repeat' ? { id, kind: 'repeat', n: hb.n ?? 1, body: [] }
    : hb.kind === 'wait' ? { id, kind: 'wait', n: (hb.n as number) ?? 1 }
      : hb.kind === 'if' ? { id, kind: 'if', cond: [], then: [], else: [] }
        : hb.kind === 'nitro' ? { id, kind: 'nitro', delta: hb.delta ?? -1 }
          : { id, kind: hb.kind };
  const place = (list: Block[], path: Hint['position']['path'], at: number): Block[] => {
    if (!path.length) {
      const out = [...list];
      if (hint.wrongBlockId && out[at]?.id === hint.wrongBlockId) out.splice(at, 1, block); else out.splice(at, 0, block);
      return out;
    }
    const [step, ...rest] = path;
    return list.map((b, i) => {
      if (i !== step.index) return b;
      if (b.kind === 'repeat') return { ...b, body: place(b.body, rest, at) };
      if (b.kind === 'if') return step.branch === 'then' ? { ...b, then: place(b.then, rest, at) } : { ...b, else: place(b.else, rest, at) };
      return b;
    });
  };
  if (hint.position.script === 'main') return { ...program, main: place(program.main, hint.position.path, hint.position.index) };
  return { ...program, onLog: { ...program.onLog!, body: place(program.onLog!.body, hint.position.path, hint.position.index) } };
}

describe('the ghost hand adds one block at a time', () => {
  it.each(ALL_TRACKS.map((t) => [t.id, t] as const))('on %s, following the hints from an empty program builds a program that finishes in gold or silver time', (_id, track) => {
    let p: Program = { main: [] };
    let steps = 0;
    for (let hint = nextBlockHint(p, track); hint; hint = nextBlockHint(p, track)) {
      p = apply(p, hint);
      if (++steps > 40) throw new Error('the hints never end');
    }
    const times = referenceTimes(track);
    const r = simulate(p, track, 3);
    expect(r.outcome).toBe('finish');
    expect([times.gold, times.silver]).toContain(r.timeMs);
    // the hints are the gold solution (a tie goes to gold, so from an empty program that is the one followed)
    expect(r.timeMs).toBe(times.gold);
    expect(slotCount(p)).toBe(slotCount(track.refs.gold));
  });

  it('from empty, the first hint is the first block of the gold solution', () => {
    const t1 = trackById('c1-a')!;
    expect(nextBlockHint({ main: [] }, t1)).toMatchObject({ block: { kind: 'forward' }, position: { script: 'main', path: [], index: 0 }, from: 'gold', matched: 0 });
    const t2 = trackById('c2-a')!;
    expect(nextBlockHint({ main: [] }, t2)?.block).toEqual({ kind: 'repeat', n: 4 });
    const t5 = trackById('c5-a')!;
    expect(nextBlockHint({ main: [] }, t5)?.block).toEqual({ kind: 'repeat', n: 'laps' });
  });
});

describe('robust to partial programs: the longest correct prefix', () => {
  it('a correct start continues from where it stops, inside the container when that is where the next block goes', () => {
    const t = trackById('c3-a')!;
    const b = programBuilder('c');
    let p: Program = { main: [b.repeat(10, [])] };
    let hint = nextBlockHint(p, t)!;
    expect(hint.block).toMatchObject({ kind: 'if' });
    expect(hint.position).toEqual({ script: 'main', path: [{ index: 0, branch: 'body' }], index: 0 });
    const empty = b.iff([], [], []);
    p = { main: [b.repeat(10, [empty])] };
    hint = nextBlockHint(p, t)!; // the condition piece is asked for before anything else
    expect(hint.block).toEqual({ kind: 'sensor', sensor: 'puddle_ahead' });
    expect(hint.ifId).toBe(empty.id);
    expect(hint.wrongBlockId).toBeUndefined();
    p = { main: [b.repeat(10, [b.iff('puddle_ahead', [], [])])] };
    hint = nextBlockHint(p, t)!;
    expect(hint.block.kind).toBe('jump');
    expect(hint.position.path).toEqual([{ index: 0, branch: 'body' }, { index: 0, branch: 'then' }]);
    p = { main: [b.repeat(10, [b.iff('puddle_ahead', [b.jump()], [])])] };
    hint = nextBlockHint(p, t)!;
    expect(hint.block.kind).toBe('forward');
    expect(hint.position.path).toEqual([{ index: 0, branch: 'body' }, { index: 0, branch: 'else' }]);
  });

  it('a wrong block in the way is named; the right one is hinted in its place', () => {
    const t = trackById('c1-a')!; // gold: → ↑ ↑ ↓ ↓ → saltar →
    const b = programBuilder('c');
    const wrong = b.forward();
    const p: Program = { main: [b.forward(), wrong] }; // the second should be ↑
    const hint = nextBlockHint(p, t)!;
    expect(hint.matched).toBe(1);
    expect(hint.block.kind).toBe('up');
    expect(hint.wrongBlockId).toBe(wrong.id);
    expect(hint.position).toMatchObject({ index: 1 });
  });

  it('a correct repetir with another count is never flagged for removal: its number is what to change', () => {
    const t = trackById('c2-a')!;
    const gold = t.refs.gold.main[0];
    if (gold.kind !== 'repeat') throw new Error('c2-a gold starts with a repetir');
    const b = programBuilder('c');
    const rep = b.repeat(2, gold.body.map((x) => ({ ...x, id: `${x.id}-mine` })));
    const hint = nextBlockHint({ main: [rep] }, t)!;
    expect(hint.wrongBlockId).toBeUndefined();
    expect(hint.changeNumberId).toBe(rep.id);
    expect(hint.block).toEqual({ kind: 'repeat', n: gold.n });
  });

  it('a program that finishes gets no hint to remove anything, even when it is not the reference program', () => {
    const t = trackById('c3-a')!;
    const b = programBuilder('c');
    // jumping on every tile is valid on this track, and it is not what the reference does
    const alt: Program = { main: [b.repeat(5, [b.jump(), b.jump()])] };
    expect(simulate(alt, t, 1).outcome).toBe('finish');
    expect(nextBlockHint(alt, t)).toBeNull();
    const alt2: Program = { main: [b.repeat(10, [b.jump()])] };
    expect(simulate(alt2, t, 1).outcome).toBe('finish');
    expect(nextBlockHint(alt2, t)).toBeNull();
  });

  it('a crashing program flags exactly the block the engine blames, and nothing it ran fine', () => {
    for (const t of ALL_TRACKS) {
      const b = programBuilder('c');
      const p: Program = { main: [b.down(), b.forward(), b.forward()] }; // a drop on a track that starts flat
      const sim = simulate(p, t, 1);
      if (sim.outcome !== 'crash') continue;
      const hint = nextBlockHint(p, t)!;
      expect(hint.wrongBlockId, t.id).toBe(sim.crash!.blockId);
    }
  });

  it('a program that ends before the line gets a block to ADD for the tile where the kart stopped, and nothing is flagged', () => {
    const t = trackById('c1-a')!;
    const b = programBuilder('c');
    const p: Program = { main: [b.jump()] }; // not the reference prefix, but it runs fine and stops short
    const sim = simulate(p, t, 1);
    expect(sim.outcome).toBe('stuck');
    const hint = nextBlockHint(p, t)!;
    expect(hint.wrongBlockId).toBeUndefined();
    expect(hint.changeNumberId).toBeUndefined();
    expect(hint.position).toEqual({ script: 'main', path: [], index: 1 });
    const tile = t.tiles[sim.pos % t.tiles.length];
    expect(hint.block.kind).toBe(tile.kind === 'rise' ? 'up' : tile.kind === 'drop' ? 'down' : 'forward');
  });

  it('following the hints from an empty program reaches a finishing program on every track', () => {
    for (const t of ALL_TRACKS) {
      let p: Program = { main: [] };
      for (let i = 0; i < 60; i++) {
        const h = nextBlockHint(p, t);
        if (!h) break;
        expect(h.wrongBlockId, t.id).toBeUndefined();
        p = apply(p, h);
      }
      expect(simulate(p, t, 1).outcome, t.id).toBe('finish');
    }
  });

  it('the condition is compared as a set (the order of `y` does not matter)', () => {
    const t = trackById('c5-a')!;
    const b = programBuilder('c');
    const p: Program = { main: [b.repeat('laps', [b.repeat(10, [b.iff(['nitro_positive', 'straight_ahead'], [], [])])])] };
    const hint = nextBlockHint(p, t)!;
    expect(hint.block.kind).toBe('turbo');
    expect(hint.wrongBlockId).toBeUndefined();
  });

  it('the event script comes after the main script: a finished main asks for the hat, then its blocks', () => {
    const t = trackById('c4-a')!;
    const b = programBuilder('c');
    const main: Block[] = [b.repeat(12, [b.iff('puddle_ahead', [b.jump()], [b.forward()])])];
    let hint = nextBlockHint({ main }, t)!;
    expect(hint.block).toEqual({ kind: 'on_log' });
    expect(hint.position.script).toBe('event');
    hint = nextBlockHint({ main, onLog: b.onLog([]) }, t)!;
    expect(hint.block.kind).toBe('brake');
    expect(hint.position).toEqual({ script: 'event', path: [], index: 0 });
    hint = nextBlockHint({ main, onLog: b.onLog([b.brake()]) }, t)!;
    expect(hint.block).toEqual({ kind: 'wait', n: 1 });
    expect(nextBlockHint({ main, onLog: b.onLog([b.brake(), b.wait(1)]) }, t)).toBeNull();
  });

  it('a program that already is a whole reference solution needs no hint (silver counts)', () => {
    for (const track of ALL_TRACKS) {
      expect(nextBlockHint(track.refs.gold, track), track.id).toBeNull();
      expect(nextBlockHint(track.refs.silver, track), track.id).toBeNull();
    }
  });

  it('the silver solution is followed when the child is further along it than along gold', () => {
    const t = trackById('c3-b')!; // silver: repetir 12 [saltar]; gold: repetir 12 [si charco [saltar] [avanzar]]
    const b = programBuilder('c');
    const p: Program = { main: [b.repeat(12, [b.jump()])] };
    expect(nextBlockHint(p, t)).toBeNull(); // that is silver, complete
    const q: Program = { main: [b.repeat(12, [b.jump(), b.jump()])] }; // silver plus a block: the extra is the wrong one... complete prefix of silver
    expect(nextBlockHint(q, t)).toBeNull();
  });

  it('a partial program with nothing right still gets the first block of the solution', () => {
    const t = trackById('c1-c')!;
    const b = programBuilder('c');
    const hint = nextBlockHint({ main: [b.down(), b.jump()] }, t)!;
    expect(hint.matched).toBe(0);
    expect(hint.position).toMatchObject({ index: 0 });
    expect(hint.wrongBlockId).toBeDefined();
  });
});

describe('every copa hints only blocks its palette has', () => {
  it('the hint stream never asks for a block the copa does not offer', () => {
    for (const c of COPAS) for (const t of c.tracks as readonly TrackSpec[]) {
      let p: Program = { main: [] };
      let guard = 0;
      for (let h = nextBlockHint(p, t); h; h = nextBlockHint(p, t)) {
        if (++guard > 40) throw new Error(`${t.id}: the hints never end (${JSON.stringify(h)})`);
        if (h.block.kind === 'sensor') expect(c.palette.sensors, `${t.id}: ${h.block.sensor}`).toContain(h.block.sensor);
        else if (h.block.kind !== 'on_log') expect(c.palette.blocks, `${t.id}: ${h.block.kind}`).toContain(h.block.kind);
        p = apply(p, h);
      }
    }
  });
});
