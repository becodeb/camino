import { describe, expect, it } from 'vitest';
import { MAX_PASSES, applyCommand, completeProgram, move, nextMove, shortestMoves, simulate, solves } from './engine';
import { cmdProgram, initialState, parseCommand, type Board, type Program } from './model';

const board = (over: Partial<Board> = {}): Board => ({
  cols: 5, rows: 3, start: { c: 0, r: 1 }, goal: { c: 4, r: 1 }, goalKind: 'seed',
  obstacles: [], pickups: [], deco: [], seed: 1, ...over,
});
const rock = (c: number, r: number) => ({ c, r, kind: 'rock' as const, seed: 1 });

describe('commands', () => {
  it('parses plain directions, jumps and "if rock, jump"', () => {
    expect(parseCommand('up')).toEqual({ kind: 'step', dir: 'up' });
    expect(parseCommand('jump:left')).toEqual({ kind: 'jump', dir: 'left' });
    expect(parseCommand('ifrock:right')).toEqual({ kind: 'ifrock', dir: 'right' });
    expect(() => parseCommand('turn')).toThrow();
  });

  it('a step moves one cell; the edge and rocks stop Brote where he was', () => {
    const b = board({ obstacles: [rock(1, 1)] });
    const s = initialState(b);
    expect(move(b, s, 'up').to).toMatchObject({ c: 0, r: 0 });
    const edge = move(b, s, 'left');
    expect(edge.kind).toBe('crash');
    expect(edge.to).toEqual(s);
    expect(edge.crash).toEqual({ at: { c: -1, r: 1 }, out: true });
    const bump = move(b, s, 'right');
    expect(bump.crash).toEqual({ at: { c: 1, r: 1 }, out: false });
  });

  it('a jump flies over a rock; "if rock" jumps only when there is one', () => {
    const b = board({ obstacles: [rock(1, 1)] });
    const s = initialState(b);
    expect(applyCommand(b, 'jump:right', s)).toMatchObject({ kind: 'jump', to: { c: 2, r: 1 } });
    expect(applyCommand(b, 'ifrock:right', s)).toMatchObject({ kind: 'jump', to: { c: 2, r: 1 } });
    expect(applyCommand(b, 'ifrock:up', s)).toMatchObject({ kind: 'move', to: { c: 0, r: 0 } });
  });
});

describe('programs', () => {
  it('wins on the goal, even with blocks left', () => {
    const b = board({ goal: { c: 2, r: 1 } });
    const t = simulate(b, cmdProgram(['right', 'right', 'right']));
    expect(t.outcome).toBe('win');
    expect(t.steps).toHaveLength(2);
    expect(t.steps[1].won).toBe(true);
  });

  it('stops at the first crash and names the culprit block', () => {
    const b = board({ obstacles: [rock(2, 1)] });
    const t = simulate(b, cmdProgram(['right', 'right', 'up']));
    expect(t.outcome).toBe('crash');
    expect(t.crashAt).toBe(1);
    expect(t.steps[1].ref).toEqual({ item: 1 });
    expect(t.final).toMatchObject({ c: 1, r: 1 });
  });

  it('ends "short" when the blocks run out before the goal', () => {
    expect(simulate(board(), cmdProgram(['right'])).outcome).toBe('short');
    expect(simulate(board(), []).outcome).toBe('short');
  });

  it('the pot stays closed until every seed was collected: Brote bumps into it', () => {
    const b = board({ goal: { c: 2, r: 1 }, goalKind: 'pot', pickups: [{ c: 1, r: 0 }] });
    const early = simulate(b, cmdProgram(['right', 'right']));
    expect(early.outcome).toBe('crash');
    expect(early.steps[1].crash).toEqual({ at: { c: 2, r: 1 }, out: false, closed: true });
    const t = simulate(b, cmdProgram(['up', 'right', 'right', 'down']));
    expect(t.outcome).toBe('win');
    expect(t.steps[1].collected).toEqual([0]);
  });

  it('repeats a loop body, with the pass in each ref', () => {
    const b = board({ goal: { c: 4, r: 1 } });
    const p: Program = [{ t: 'loop', count: 4, body: ['right'] }];
    const t = simulate(b, p);
    expect(t.outcome).toBe('win');
    expect(t.steps.map((s) => s.ref)).toEqual([0, 1, 2, 3].map((iter) => ({ item: 0, inner: 0, iter })));
  });

  it('a staircase: repeat [→ ↑]', () => {
    const b = board({ cols: 4, rows: 4, start: { c: 0, r: 3 }, goal: { c: 3, r: 0 } });
    expect(solves(b, [{ t: 'loop', count: 3, body: ['right', 'up'] }])).toBe(true);
    expect(solves(b, [{ t: 'loop', count: 2, body: ['right', 'up'] }])).toBe(false);
  });

  it('"repeat until the goal" stops on the goal and gives up after MAX_PASSES', () => {
    const b = board({ obstacles: [rock(2, 1)] });
    expect(solves(b, [{ t: 'loop', count: 'goal', body: ['ifrock:right'] }])).toBe(true);
    const never = board({ cols: 3, rows: 3, start: { c: 0, r: 0 }, goal: { c: 2, r: 2 } });
    const t = simulate(never, [{ t: 'loop', count: 'goal', body: ['right', 'left'] }]);
    expect(t.outcome).toBe('short');
    expect(t.steps).toHaveLength(MAX_PASSES * 2);
  });
});

describe('help', () => {
  it('finds the shortest way round a rock, and the next arrow from anywhere', () => {
    const b = board({ obstacles: [rock(2, 1)] });
    const path = shortestMoves(b)!;
    expect(path).toHaveLength(6);
    expect(solves(b, cmdProgram(path))).toBe(true);
    expect(nextMove(b, { c: 1, r: 0, mask: 0 })).toBe('right');
    expect(nextMove(b, { c: 4, r: 1, mask: 0 })).toBeNull(); // already there
  });

  it('shortest moves go through every pickup, round the closed pot', () => {
    const b = board({ goal: { c: 2, r: 1 }, goalKind: 'pot', pickups: [{ c: 0, r: 0 }] });
    const path = shortestMoves(b)!;
    expect(path[0]).toBe('up');
    expect(solves(b, cmdProgram(path))).toBe(true);
  });

  it('completes a program prefix within the slots, or says it cannot', () => {
    const b = board({ goal: { c: 2, r: 0 } });
    const arrows = ['left', 'up', 'down', 'right'];
    const full = completeProgram(b, ['right'], arrows, 3)!;
    expect(full.slice(0, 1)).toEqual(['right']);
    expect(full).toHaveLength(3);
    expect(solves(b, cmdProgram(full))).toBe(true);
    expect(completeProgram(b, ['left'], arrows, 3)).toBeNull(); // crashes
    expect(completeProgram(b, ['down'], arrows, 3)).toBeNull(); // too far now
    expect(completeProgram(b, ['up', 'right', 'right'], arrows, 3)).toEqual(['up', 'right', 'right']);
  });
});
