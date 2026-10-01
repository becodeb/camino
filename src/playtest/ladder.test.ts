import { describe, expect, it } from 'vitest';
import { formatOf } from '../game/formats';
import {
  CAPS, ENTRY, FAILED_RUNS, FAST_CAPS, HARD_MS, IDLE_MS, ITEM_MS, LADDER, LADDER_ROUND1, MAX_ITEMS, MAX_MS, TOP, capsFrom, ceiling, decide,
  entryRung, firstItem, itemResult, itemVerdict, newItemMemo, record, startLadder, type Attempt, type LadderState,
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
    expect(LADDER.map((r) => r.item)).toEqual(LADDER.map((r) => `pp-l${r.rung}`));
  });

  it('keeps the same twelve concepts as round 1, rung by rung, and round 1\'s pages still open', () => {
    expect(LADDER.map((r) => r.concept)).toEqual([
      'sequence', 'long_sequence', 'fix', 'predict', 'repeat', 'repeat_count',
      'repeat_pattern', 'before_after_repeat', 'fog_si', 'three_worlds', 'events_rules', 'rules_score',
    ]);
    expect(LADDER_ROUND1).toHaveLength(12);
    for (const id of LADDER_ROUND1) expect(pilotLevel(id), id).not.toBeNull();
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

  it('stops at MAX_ITEMS items (8 since the classroom round), not before', () => {
    // 1ro climbing from 1 with passes reaches the eighth item on rung 8
    let s = startLadder(1, T0);
    for (let r = 1; r < MAX_ITEMS; r++) s = record(s, pass(r));
    expect(decide(s, T0)).toEqual({ rung: 8, check: 'climb' });
    s = record(s, pass(8));
    expect(MAX_ITEMS).toBe(8);
    expect(decide(s, T0)).toEqual({ stop: 'max_items' });
    expect(ceiling(s)).toBe(8);
    // 3ro from rung 5 can still reach the top in 8 items
    let t = startLadder(3, T0);
    for (let r = 5; r <= 12; r++) t = record(t, pass(r));
    expect(t.items).toHaveLength(8);
    expect(ceiling(t)).toBe(12);
  });

  it('the ladder lasts at most 8 minutes (an item open then ends by 9)', () => {
    expect(MAX_MS).toBe(8 * 60_000);
    expect(HARD_MS).toBe(9 * 60_000);
  });

  it('stops once MAX_MS has passed, and not before', () => {
    const s = play(startLadder(2, T0), pass(2), pass(3));
    expect(decide(s, T0 + MAX_MS - 1)).toEqual({ rung: 4, check: 'climb' });
    expect(decide(s, T0 + MAX_MS)).toEqual({ stop: 'max_time' });
    expect(decide(s, T0 + FAST_CAPS.ladderMs, FAST_CAPS)).toEqual({ stop: 'max_time' });
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
    level_id: 'x', startedAt: T0, runs: 0, fails: 0, wins: 0, lastResult: null, helpStep: 0, adultHelped: false, won: false, lastInputAt: T0, ...o,
  });

  it('keeps going on one failed run, ends on the second', () => {
    const m = newItemMemo();
    expect(itemVerdict(stats({ runs: 1, fails: 1, lastResult: 'bump' }), m, T0)).toBeNull();
    expect(itemVerdict(stats({ runs: 3, fails: FAILED_RUNS, lastResult: 'short' }), m, T0)).toBe('runs');
  });

  it('ignores runs that ran nothing', () => {
    expect(itemVerdict(stats({ runs: 4, fails: 0, lastResult: 'empty' }), newItemMemo(), T0)).toBeNull();
  });

  it('ends after ITEM_MS without solving, even with input all along, never a solved page', () => {
    const busy = (now: number) => stats({ lastInputAt: now - 1000, runs: 1, lastResult: 'empty' });
    expect(itemVerdict(busy(T0 + ITEM_MS), newItemMemo(), T0 + ITEM_MS)).toBe('time_cap');
    expect(itemVerdict(busy(T0 + ITEM_MS - 1), newItemMemo(), T0 + ITEM_MS - 1)).toBeNull();
    expect(itemVerdict(stats({ won: true, fails: 5 }), newItemMemo(), T0 + ITEM_MS * 2)).toBeNull();
    expect(itemVerdict(stats({ lastResult: 'win', fails: 1 }), newItemMemo(), T0 + ITEM_MS)).toBeNull();
  });

  it('after the solution hint, one more try: the next failed run ends it', () => {
    const m = newItemMemo();
    expect(itemVerdict(stats({ helpStep: 3, fails: 1 }), m, T0)).toBeNull();
    expect(itemVerdict(stats({ helpStep: 3, fails: 1, runs: 2, lastResult: 'empty' }), m, T0)).toBeNull();
    expect(itemVerdict(stats({ helpStep: 3, fails: 2, runs: 3, lastResult: 'bump' }), m, T0)).toBe('solution_hint');
  });

  it('after an adult\'s help the same', () => {
    const m = newItemMemo();
    expect(itemVerdict(stats({ adultHelped: true }), m, T0)).toBeNull();
    expect(itemVerdict(stats({ adultHelped: true, fails: 1, runs: 1, lastResult: 'short' }), m, T0)).toBe('adult');
  });

  it('ends after IDLE_MS with no input at all, counted from the page\'s start or the last input', () => {
    expect(IDLE_MS).toBe(90_000);
    expect(itemVerdict(stats(), newItemMemo(), T0 + IDLE_MS - 1)).toBeNull();
    expect(itemVerdict(stats(), newItemMemo(), T0 + IDLE_MS)).toBe('idle_cap');
    // a tap 60 s in: the idle clock starts again
    expect(itemVerdict(stats({ lastInputAt: T0 + 60_000 }), newItemMemo(), T0 + IDLE_MS + 30_000)).toBeNull();
    expect(itemVerdict(stats({ lastInputAt: T0 + 60_000 }), newItemMemo(), T0 + 60_000 + IDLE_MS)).toBe('idle_cap');
  });

  it('the caps hold on wall time however late the check runs (a hidden tab)', () => {
    // round 1: a rule-game item checked only at 234 s, no input since 66 s
    expect(itemVerdict(stats({ lastInputAt: T0 + 66_000 }), newItemMemo(), T0 + 234_000)).toBe('time_cap');
    expect(itemVerdict(stats({ lastInputAt: T0 + 66_000 }), newItemMemo(), T0 + 160_000)).toBe('idle_cap');
  });

  it('an item started late ends by the ladder\'s hard time (~13 min), whatever its own clock', () => {
    const late = T0 + MAX_MS - 10_000;
    const s = stats({ startedAt: late, lastInputAt: late + HARD_MS - MAX_MS + 5_000 });
    expect(HARD_MS - MAX_MS).toBe(60_000);
    expect(itemVerdict(s, newItemMemo(), T0 + HARD_MS - 1, { ladderStart: T0 })).toBeNull();
    expect(itemVerdict(s, newItemMemo(), T0 + HARD_MS, { ladderStart: T0 })).toBe('ladder_time');
    // without the ladder's start, only the item's own clock
    expect(itemVerdict(s, newItemMemo(), T0 + HARD_MS)).toBeNull();
  });

  it('?caps=fast shortens every cap for the scripted checks', () => {
    expect(capsFrom('')).toBe(CAPS);
    expect(capsFrom('?debug&caps=fast')).toBe(FAST_CAPS);
    expect(capsFrom('?capsule')).toBe(CAPS);
    expect(FAST_CAPS.idleMs).toBeLessThan(FAST_CAPS.itemMs);
    expect(itemVerdict(stats(), newItemMemo(), T0 + FAST_CAPS.idleMs, { caps: FAST_CAPS })).toBe('idle_cap');
    expect(itemVerdict(stats({ lastInputAt: T0 + FAST_CAPS.itemMs - 1 }), newItemMemo(), T0 + FAST_CAPS.itemMs, { caps: FAST_CAPS })).toBe('time_cap');
  });
});
