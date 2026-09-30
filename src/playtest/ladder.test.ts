import { describe, expect, it } from 'vitest';
import { formatOf } from '../game/formats';
import {
  ENTRY, FAILED_RUNS, ITEM_MS, LADDER, MAX_ITEMS, MAX_MS, TOP, ceiling, decide, entryRung, firstItem, itemResult,
  itemVerdict, newItemMemo, record, startLadder, type Attempt, type LadderState,
} from './ladder';
import { pilotLevel } from './levels';
import type { LevelStats } from './PlaytestLevel';

const T0 = 1_000_000;
const pass = (rung: number, check: Attempt['check'] = 'climb'): Attempt => ({ rung, check, result: 'pass' });
const fail = (rung: number, check: Attempt['check'] = 'climb'): Attempt => ({ rung, check, result: 'fail' });
const play = (s: LadderState, ...as: Attempt[]) => as.reduce(record, s);

describe('the item bank', () => {
  it('has twelve fixed rungs, each a real page, in order', () => {
    expect(LADDER.map((r) => r.rung)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(TOP).toBe(12);
    for (const r of LADDER) expect(pilotLevel(r.item), r.item).not.toBeNull();
    expect(new Set(LADDER.map((r) => r.concept)).size).toBe(12);
  });

  it('uses the right format and kind of page on each rung', () => {
    const fmt = (n: number) => formatOf(pilotLevel(LADDER[n - 1].item)!);
    expect([1, 2, 5, 7, 8].map(fmt)).toEqual(['solve', 'solve', 'solve', 'solve', 'solve']);
    expect(fmt(3)).toBe('fix');
    expect(fmt(4)).toBe('predict');
    expect(fmt(6)).toBe('complete');
    expect(pilotLevel(LADDER[4].item)!.intro).toBeTruthy();
    expect(pilotLevel(LADDER[8].item)!.fog).toBe(true);
    expect(pilotLevel(LADDER[9].item)!.worlds).toHaveLength(3);
    expect(pilotLevel(LADDER[10].item)!.mode).toBe('realtime');
    expect(pilotLevel(LADDER[11].item)!.realtime?.win.kind).toBe('score');
  });
});

describe('entry by grade', () => {
  it('starts 1ro on 1, 2do on 2, 3ro on 5, 4to on 7, 5to on 9', () => {
    expect([1, 2, 3, 4, 5].map(entryRung)).toEqual([1, 2, 5, 7, 9]);
    expect(ENTRY[5]).toBe(9);
    expect(firstItem(startLadder(4, T0))).toEqual({ rung: 7, check: 'climb' });
    expect(decide(startLadder(3, T0), T0)).toEqual({ rung: 5, check: 'climb' });
  });
});

describe('where the ladder goes', () => {
  it('steps up one rung after a pass', () => {
    const s = play(startLadder(1, T0), pass(1));
    expect(decide(s, T0 + 60_000)).toEqual({ rung: 2, check: 'climb' });
    expect(decide(play(s, pass(2)), T0)).toEqual({ rung: 3, check: 'climb' });
  });

  it('stops after passing the top rung', () => {
    const s = play(startLadder(5, T0), pass(9), pass(10), pass(11), pass(12));
    expect(decide(s, T0)).toEqual({ stop: 'top' });
    expect(ceiling(s)).toBe(12);
  });

  it('after a fail above a passed rung, stops (no floor check needed)', () => {
    const s = play(startLadder(1, T0), pass(1), pass(2), fail(3));
    expect(decide(s, T0)).toEqual({ stop: 'ceiling' });
    expect(ceiling(s)).toBe(2);
  });

  it('after failing the entry rung, tries the rung below once, then stops whatever happens', () => {
    const s = play(startLadder(3, T0), fail(5));
    expect(decide(s, T0)).toEqual({ rung: 4, check: 'floor' });
    expect(decide(play(s, pass(4, 'floor')), T0)).toEqual({ stop: 'floor' });
    expect(ceiling(play(s, pass(4, 'floor')))).toBe(4);
    expect(decide(play(s, fail(4, 'floor')), T0)).toEqual({ stop: 'floor' });
    expect(ceiling(play(s, fail(4, 'floor')))).toBeNull();
  });

  it('failing rung 1 stops: there is nothing below', () => {
    const s = play(startLadder(1, T0), fail(1));
    expect(decide(s, T0)).toEqual({ stop: 'bottom' });
    expect(ceiling(s)).toBeNull();
  });

  it('stops at MAX_ITEMS items', () => {
    // 1ro climbing from 1 with passes reaches the tenth item on rung 10
    let s = startLadder(1, T0);
    for (let r = 1; r <= MAX_ITEMS; r++) s = record(s, pass(r));
    expect(MAX_ITEMS).toBe(10);
    expect(decide(s, T0)).toEqual({ stop: 'max_items' });
    expect(ceiling(s)).toBe(10);
  });

  it('stops once MAX_MS has passed, and not before', () => {
    const s = play(startLadder(2, T0), pass(2), pass(3));
    expect(decide(s, T0 + MAX_MS - 1)).toEqual({ rung: 4, check: 'climb' });
    expect(decide(s, T0 + MAX_MS)).toEqual({ stop: 'max_time' });
  });

  it('the caps win over the floor check', () => {
    const s = play(startLadder(5, T0), fail(9));
    expect(decide(s, T0 + MAX_MS)).toEqual({ stop: 'max_time' });
  });
});

describe('an item\'s result', () => {
  it('passes a win with fewer than three helps and no adult help', () => {
    expect(itemResult({ outcome: 'win', help_levels: 0, adult_helped: false })).toBe('pass');
    expect(itemResult({ outcome: 'win', help_levels: 2, adult_helped: false })).toBe('pass');
  });
  it('fails with the solution hint, an adult\'s help, or no win', () => {
    expect(itemResult({ outcome: 'win', help_levels: 3, adult_helped: false })).toBe('fail');
    expect(itemResult({ outcome: 'win', help_levels: 0, adult_helped: true })).toBe('fail');
    expect(itemResult({ outcome: 'fail', help_levels: 0, adult_helped: false })).toBe('fail');
    expect(itemResult({ outcome: 'skipped', help_levels: 0, adult_helped: false })).toBe('fail');
  });
});

describe('when an item ends', () => {
  const stats = (o: Partial<LevelStats> = {}): LevelStats => ({
    level_id: 'x', startedAt: T0, runs: 0, fails: 0, wins: 0, lastResult: null, helpStep: 0, adultHelped: false, won: false, ...o,
  });

  it('keeps going on one failed run, ends on the second', () => {
    const m = newItemMemo();
    expect(itemVerdict(stats({ runs: 1, fails: 1, lastResult: 'bump' }), m, T0)).toBeNull();
    expect(itemVerdict(stats({ runs: 3, fails: FAILED_RUNS, lastResult: 'short' }), m, T0)).toBe('fail');
  });

  it('ignores runs that ran nothing', () => {
    expect(itemVerdict(stats({ runs: 4, fails: 0, lastResult: 'empty' }), newItemMemo(), T0)).toBeNull();
  });

  it('ends after ITEM_MS without solving, never a solved page', () => {
    expect(itemVerdict(stats(), newItemMemo(), T0 + ITEM_MS)).toBe('fail');
    expect(itemVerdict(stats(), newItemMemo(), T0 + ITEM_MS - 1)).toBeNull();
    expect(itemVerdict(stats({ won: true, fails: 5 }), newItemMemo(), T0 + ITEM_MS * 2)).toBeNull();
    expect(itemVerdict(stats({ lastResult: 'win', fails: 1 }), newItemMemo(), T0 + ITEM_MS)).toBeNull();
  });

  it('after the solution hint, one more try: the next failed run ends it', () => {
    const m = newItemMemo();
    expect(itemVerdict(stats({ helpStep: 3, fails: 1 }), m, T0)).toBeNull();
    expect(itemVerdict(stats({ helpStep: 3, fails: 1, runs: 2, lastResult: 'empty' }), m, T0)).toBeNull();
    expect(itemVerdict(stats({ helpStep: 3, fails: 2, runs: 3, lastResult: 'bump' }), m, T0)).toBe('fail');
  });

  it('after an adult\'s help the same', () => {
    const m = newItemMemo();
    expect(itemVerdict(stats({ adultHelped: true }), m, T0)).toBeNull();
    expect(itemVerdict(stats({ adultHelped: true, fails: 1, runs: 1, lastResult: 'short' }), m, T0)).toBe('fail');
  });
});
