import { describe, expect, it } from 'vitest';
import { MAX_PASSES, applyCommand, completeProgram, move, nextMove, shortestMoves, simulate, simulateAll, solves, solvesAll } from './engine';
import { HOLE, cardCount, cmdProgram, initialState, parseCommand, visibleFrom, type Board, type Program } from './model';

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

  it('a jump flies over a rock and lands two cells away', () => {
    const b = board({ obstacles: [rock(1, 1)] });
    expect(applyCommand(b, 'jump:right', initialState(b))).toMatchObject({ kind: 'jump', to: { c: 2, r: 1 }, cells: [{ c: 2, r: 1 }] });
  });

  it('a jump cannot land on a rock or off the board', () => {
    const b = board({ obstacles: [rock(2, 1)] });
    expect(applyCommand(b, 'jump:right', initialState(b))).toMatchObject({ kind: 'crash', crash: { at: { c: 2, r: 1 }, out: false } });
    expect(applyCommand(b, 'jump:left', initialState(b))).toMatchObject({ kind: 'crash', crash: { out: true } });
  });

  it('"si hay piedra, saltar" is an if-then: a rock ahead is jumped, otherwise Brote only looks', () => {
    const b = board({ obstacles: [rock(1, 1)] });
    const s = initialState(b);
    expect(applyCommand(b, 'ifrock:right', s)).toMatchObject({ kind: 'jump', to: { c: 2, r: 1 } });
    const look = applyCommand(b, 'ifrock:up', s);
    expect(look).toMatchObject({ kind: 'look', dir: 'up', cells: [], won: false });
    expect(look.to).toEqual(s);
    expect(look.crash).toBeUndefined();
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

  it('a counted repeat runs its body exactly `count` times, then the program goes on', () => {
    const b = board({ goal: { c: 3, r: 0 } });
    const t = simulate(b, [{ t: 'loop', count: 3, body: ['right'] }, { t: 'cmd', cmd: 'up' }]);
    expect(t.outcome).toBe('win');
    expect(t.steps.map((s) => s.cmd)).toEqual(['right', 'right', 'right', 'up']);
    expect(t.steps[3].ref).toEqual({ item: 1 });
  });

  it('a repeat stops as soon as Brote wins, even with passes left', () => {
    const t = simulate(board(), [{ t: 'loop', count: 10, body: ['right'] }]);
    expect(t.outcome).toBe('win');
    expect(t.steps).toHaveLength(4);
  });

  it('"repeat until the goal" with "if rock, jump" then a step walks any rocky path', () => {
    const p: Program = [{ t: 'loop', count: 'goal', body: ['ifrock:right', 'right'] }];
    const b = board({ cols: 8, rows: 1, start: { c: 0, r: 0 }, goal: { c: 7, r: 0 }, obstacles: [rock(2, 0), rock(5, 0)] });
    const t = simulate(b, p);
    expect(t.outcome).toBe('win');
    expect(t.steps.map((s) => s.kind)).toEqual(['look', 'move', 'jump', 'move', 'jump', 'move']);
    expect(t.steps.map((s) => s.ref.iter)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('"repeat until the goal" gives up when a pass starts where an earlier one did', () => {
    const never = board({ cols: 3, rows: 3, start: { c: 0, r: 0 }, goal: { c: 2, r: 2 } });
    const t = simulate(never, [{ t: 'loop', count: 'goal', body: ['right', 'left'] }]);
    expect(t.outcome).toBe('short');
    expect(t.steps).toHaveLength(2);
    // an if that never fires does not move Brote: one look and it is over
    const still = simulate(board(), [{ t: 'loop', count: 'goal', body: ['ifrock:right'] }]);
    expect(still.outcome).toBe('short');
    expect(still.steps).toHaveLength(1);
  });

  it('an empty line does nothing and keeps every step pointing at its own block', () => {
    const t = simulate(board(), [{ t: 'cmd', cmd: 'right' }, { t: 'cmd', cmd: HOLE }, { t: 'loop', count: 2, body: [HOLE, 'right'] }]);
    expect(t.steps.map((s) => s.ref)).toEqual([{ item: 0 }, { item: 2, inner: 1, iter: 0 }, { item: 2, inner: 1, iter: 1 }]);
    expect(t.final).toMatchObject({ c: 3, r: 1 });
    expect(cardCount([{ t: 'cmd', cmd: HOLE }, { t: 'loop', count: 3, body: ['up', HOLE] }])).toBe(1);
  });

  it('a missing count (0) makes no pass: Brote does not move', () => {
    const t = simulate(board(), [{ t: 'loop', count: 0, body: ['right'] }]);
    expect(t.outcome).toBe('short');
    expect(t.steps).toHaveLength(0);
  });

  it('"repeat until the goal" is capped at MAX_PASSES', () => {
    const long = board({ cols: MAX_PASSES + 10, rows: 1, start: { c: 0, r: 0 }, goal: { c: MAX_PASSES + 5, r: 0 } });
    const t = simulate(long, [{ t: 'loop', count: 'goal', body: ['right'] }]);
    expect(t.outcome).toBe('short');
    expect(t.steps).toHaveLength(MAX_PASSES);
  });
});

describe('several worlds at once', () => {
  const p: Program = [{ t: 'loop', count: 'goal', body: ['ifrock:right', 'right'] }];
  const a = board({ cols: 6, rows: 1, start: { c: 0, r: 0 }, goal: { c: 5, r: 0 }, obstacles: [rock(1, 0)] });
  const b = board({ cols: 6, rows: 1, start: { c: 0, r: 0 }, goal: { c: 3, r: 0 }, obstacles: [rock(2, 0)] });

  it('runs the same program in every world; it works only if it wins in all', () => {
    const traces = simulateAll([a, b], p);
    expect(traces.map((t) => t.outcome)).toEqual(['win', 'win']);
    expect(solvesAll([a, b], p)).toBe(true);
    expect(solvesAll([a, b], cmdProgram(['right', 'right', 'right']))).toBe(false);
  });

  it('step i comes from the same block in every world still going', () => {
    const [ta, tb] = simulateAll([a, b], p);
    const n = Math.min(ta.steps.length, tb.steps.length);
    for (let i = 0; i < n; i++) expect(ta.steps[i].ref).toEqual(tb.steps[i].ref);
  });
});

describe('fog', () => {
  it('Brote sees his cell and the four next to it, never beyond', () => {
    const b = board();
    const seen = visibleFrom(b, { c: 0, r: 1 });
    expect(seen).toEqual(expect.arrayContaining([{ c: 0, r: 1 }, { c: 1, r: 1 }, { c: 0, r: 0 }, { c: 0, r: 2 }]));
    expect(seen).toHaveLength(4);
    expect(seen.some((x) => x.c > 1)).toBe(false);
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

  it('completes a twelve-line plan through two seeds at once (a search over states, not over programs)', () => {
    const b = board({ cols: 7, rows: 4, start: { c: 0, r: 3 }, goal: { c: 6, r: 3 }, goalKind: 'pot', pickups: [{ c: 0, r: 0 }, { c: 6, r: 0 }] });
    const arrows = ['left', 'up', 'down', 'right'];
    const t = performance.now();
    const full = completeProgram(b, [], arrows, 12)!;
    expect(full).toHaveLength(12);
    expect(solves(b, cmdProgram(full))).toBe(true);
    expect(completeProgram(b, ['down'], arrows, 12)).toBeNull();
    expect(completeProgram(b, ['right'], arrows, 12)).toBeNull(); // one step the wrong way: no longer fits
    expect(performance.now() - t).toBeLessThan(200);
  });
});
