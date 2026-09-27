import { describe, expect, it } from 'vitest';
import { guardaBoard, guardaKey, guardaTrace, guideSegments, guidePath, segKey } from './guarda';
import { cmdProgram, type Dir, type Program } from './model';

const times = (n: number, ...moves: Dir[]): Dir[] => Array.from({ length: n }, () => moves).flat();
const loop = (count: number, ...body: Dir[]): Program[number] => ({ t: 'loop', count, body });
/** Battlements: up, along, down, along. */
const ALMENA: Dir[] = ['up', 'right', 'down', 'right'];

describe('the squared paper', () => {
  it('a segment is the same whichever way it is walked', () => {
    expect(segKey({ c: 1, r: 2 }, { c: 1, r: 1 })).toBe(segKey({ c: 1, r: 1 }, { c: 1, r: 2 }));
    expect(segKey({ c: 1, r: 1 }, { c: 2, r: 1 })).not.toBe(segKey({ c: 1, r: 1 }, { c: 1, r: 2 }));
  });

  it('the page is the guide with one square of paper all round, the pen on its first point, no goal', () => {
    const b = guardaBoard(times(2, ...ALMENA), 5, 'river');
    expect([b.cols, b.rows]).toEqual([4 + 3, 1 + 3]);
    expect(b.start).toEqual({ c: 1, r: 2 });
    expect(b.goalKind).toBe('none');
    expect(b.look).toBe('river');
    expect(b.obstacles).toEqual([]);
    const path = guidePath(b, { moves: times(2, ...ALMENA) });
    for (const p of path) {
      expect(p.c).toBeGreaterThanOrEqual(1);
      expect(p.r).toBeGreaterThanOrEqual(1);
      expect(p.c).toBeLessThanOrEqual(b.cols - 2);
      expect(p.r).toBeLessThanOrEqual(b.rows - 2);
    }
    expect(guardaBoard(['right', 'up'], 1).look).toBeUndefined();
  });
});

describe('drawing a guarda', () => {
  const moves = times(2, ...ALMENA);
  const b = guardaBoard(moves, 7);
  const def = { moves };

  it('the guide walked arrow by arrow inks it all: won on the last step', () => {
    const t = guardaTrace(b, def, cmdProgram(moves));
    expect(t.outcome).toBe('win');
    expect(t.steps).toHaveLength(8);
    expect(t.steps.every((s) => s.kind === 'move')).toBe(true);
    expect(t.steps.at(-1)!.won).toBe(true);
    expect(t.steps[0].cells).toEqual([{ c: 1, r: 1 }]);
    expect(guardaTrace(b, def, [loop(2, ...ALMENA)]).outcome).toBe('win');
  });

  it('a step off the guide smudges and stops: Brote walks it, its card is named', () => {
    const t = guardaTrace(b, def, [loop(2, 'up', 'right', 'up', 'right')]);
    expect(t.outcome).toBe('crash');
    expect(t.crashAt).toBe(2);
    const s = t.steps[2];
    expect(s.kind).toBe('crash');
    expect(s.ref).toEqual({ item: 0, inner: 2, iter: 0 });
    expect(s.crash).toEqual({ at: { c: 2, r: 0 }, out: false });
    expect(s.to).toMatchObject({ c: 2, r: 0 });
    expect(s.cells).toEqual([{ c: 2, r: 0 }]);
  });

  it('a pass too many draws past the guide\'s end: a smudge too', () => {
    const t = guardaTrace(b, def, [loop(3, ...ALMENA)]);
    expect(t.outcome).toBe('crash');
    expect(t.crashAt).toBe(8);
    expect(t.steps[8].ref.iter).toBe(2);
  });

  it('a step off the page bumps its edge and stays (only a page without a margin can be left on the guide)', () => {
    // with a square of paper round the guide, the first step off it is a smudge, before any edge
    expect(guardaTrace(b, def, cmdProgram(['left', 'left'])).crashAt).toBe(0);
    const tight = { ...guardaBoard(['right'], 1), cols: 2, rows: 1, start: { c: 0, r: 0 } };
    const edge = guardaTrace(tight, { moves: ['right'] }, cmdProgram(['right', 'right']));
    expect(edge.outcome).toBe('crash');
    const s = edge.steps[edge.crashAt!];
    expect(s.crash?.out).toBe(true);
    expect(s.to).toEqual(s.from);
    expect(s.cells).toEqual([]);
  });

  it('going back over an inked line is fine: the drawing counts, not the order', () => {
    // a fence: up, along, down, three times (the pen goes up the post it came down)
    const fence = times(3, 'up', 'right', 'down');
    const fb = guardaBoard(fence, 3);
    expect(guardaTrace(fb, { moves: fence }, [loop(3, 'up', 'right', 'down')]).outcome).toBe('win');
    // an extra trip up and down the first post draws nothing new, nothing off the guide
    expect(guardaTrace(fb, { moves: fence }, cmdProgram(['up', 'down', ...fence])).outcome).toBe('win');
    expect(guideSegments(fb, { moves: fence })).toHaveLength(3 + 4);
  });

  it('a notebook that ends with part of the guide still in pencil is short', () => {
    expect(guardaTrace(b, def, [loop(1 + 1, 'up', 'right')]).outcome).toBe('crash');
    expect(guardaTrace(b, def, cmdProgram(['up', 'right', 'down'])).outcome).toBe('short');
    expect(guardaTrace(b, def, []).outcome).toBe('short');
  });

  it('one repeat of a pattern is keyed like the guarda family; anything else by its arrows', () => {
    expect(guardaKey([loop(4, ...ALMENA)])).toBe('guarda:up,right,down,right:4');
    expect(guardaKey(cmdProgram(['up', 'right']))).toBe('guarda-path:up,right');
  });
});
