import { describe, expect, it } from 'vitest';
import { rng } from './race';
import { honestRanking } from './honestRace';
import { totalChars } from './honestRace';
import { wordsFor, wpm } from './typingRace';
import {
  ADAPT_START, AFTER_LOSS, AFTER_WIN, BASE_MAX_WPM, BASE_MIN_WPM, EASE_MS, PRIOR_WPM, firstRaceTarget, SPREAD, adaptOf, advanceRival, afterRace, liveWpm,
  readAdapt, rivalBase, rivalFinish, rivalWpms, startRival, type AdaptState,
} from './typingAdapt';

describe('the adaptive rule', () => {
  it('the first race has no base (the rivals follow the child live), and reads as "first"', () => {
    expect(adaptOf(ADAPT_START)).toBe('first');
    expect(rivalBase(ADAPT_START)).toBeNull();
  });

  it('after a loss the base is 0.90 of the last measured wpm, after a win 1.05', () => {
    expect(adaptOf({ lastWpm: 10, lastWon: false })).toBe('after_loss');
    expect(rivalBase({ lastWpm: 10, lastWon: false })).toBeCloseTo(10 * AFTER_LOSS, 6);
    expect(adaptOf({ lastWpm: 10, lastWon: true })).toBe('after_win');
    expect(rivalBase({ lastWpm: 10, lastWon: true })).toBeCloseTo(10 * AFTER_WIN, 6);
    expect(AFTER_LOSS).toBe(0.9);
    expect(AFTER_WIN).toBe(1.05);
  });

  it('the base is clamped to sane bounds, however extreme the last race was', () => {
    expect(rivalBase({ lastWpm: 0.3, lastWon: false })).toBe(BASE_MIN_WPM);
    expect(rivalBase({ lastWpm: 300, lastWon: true })).toBe(BASE_MAX_WPM);
  });

  it('two rivals around the base, the slower first, so all three places exist', () => {
    const [slow, fast] = rivalWpms(10);
    expect(slow).toBeLessThan(10);
    expect(fast).toBeLessThan(10); // both rivals sit under the base: a child at the base pace is 1st
    expect(slow).toBeCloseTo(10 * SPREAD[0], 6);
    expect(fast).toBeCloseTo(10 * SPREAD[1], 6);
    expect(slow).toBeLessThan(fast);
  });

  it('afterRace records the measured pace and whether it was a win; a race with no measurable pace changes nothing', () => {
    expect(afterRace(ADAPT_START, { wpm: 12.34, won: false })).toEqual({ lastWpm: 12.3, lastWon: false });
    const s: AdaptState = { lastWpm: 9, lastWon: true };
    expect(afterRace(s, { wpm: null, won: false })).toBe(s);
    expect(afterRace(s, { wpm: 0, won: false })).toBe(s);
  });

  it('readAdapt takes only a well-formed state', () => {
    expect(readAdapt({ lastWpm: 8, lastWon: true })).toEqual({ lastWpm: 8, lastWon: true });
    expect(readAdapt(undefined)).toEqual(ADAPT_START);
    expect(readAdapt({ lastWpm: 'x', lastWon: true })).toEqual(ADAPT_START);
    expect(readAdapt({ lastWpm: -3, lastWon: true })).toEqual(ADAPT_START);
    expect(readAdapt({ lastWpm: 5 })).toEqual(ADAPT_START);
  });

  it('after a loss the next race is slower, after a win faster (for the same measured pace)', () => {
    expect(rivalBase({ lastWpm: 10, lastWon: false })!).toBeLessThan(rivalBase({ lastWpm: 10, lastWon: true })!);
  });
});

describe('the live pace (first race)', () => {
  it('is the prior (the bottom of the range, never a fast guess) until two right keys exist', () => {
    expect(liveWpm([], 0, 5000)).toBe(PRIOR_WPM);
    expect(liveWpm([1000], 0, 5000)).toBe(PRIOR_WPM);
  });

  it('settles on the child\'s real pace once the window is full', () => {
    // 20 wpm = 100 chars a minute = a key every 600 ms
    const keys = Array.from({ length: 60 }, (_, i) => (i + 1) * 600);
    expect(liveWpm(keys, 0, 36_000)).toBeCloseTo(20, 0);
    // 4 wpm = a key every 3000 ms
    const slow = Array.from({ length: 12 }, (_, i) => (i + 1) * 3000);
    // a ten-second window holds 3 or 4 keys of a slow typist: within one key of the real pace
    expect(Math.abs(liveWpm(slow, 0, 36_000) - 4)).toBeLessThanOrEqual(1.3);
  });

  it('follows a slowdown, in the window\'s time', () => {
    const fast = Array.from({ length: 30 }, (_, i) => (i + 1) * 600); // 20 wpm for 18 s
    const slowKeys = Array.from({ length: 6 }, (_, i) => 18_000 + (i + 1) * 3000); // then 4 wpm for 18 s
    const keys = [...fast, ...slowKeys];
    expect(liveWpm(keys, 0, 36_000)).toBeLessThan(8);
  });
});

describe('a rival running', () => {
  const total = 60;
  it('at a constant speed it finishes exactly when the plain wpm formula says', () => {
    let r = startRival(10);
    r = advanceRival(r, 10_000, total, 10, 0);
    expect(r.finishMs).toBeNull();
    r = advanceRival(r, 90_000, total, 10, 0);
    expect(r.finishMs).toBeCloseTo((total / 5 / 10) * 60_000, 3);
    expect(r.chars).toBe(total);
  });

  it('does not depend on how the time is chunked', () => {
    let a = startRival(6);
    for (let t = 1000; t <= 20_000; t += 1000) a = advanceRival(a, t, total, 12, EASE_MS);
    const b = advanceRival(startRival(6), 20_000, total, 12, EASE_MS);
    expect(a.chars).toBeCloseTo(b.chars, 6);
    expect(a.wpm).toBeCloseTo(b.wpm, 6);
  });

  it('eases towards a new target instead of snapping to it', () => {
    const r = advanceRival(startRival(6), 1000, total, 30, EASE_MS);
    expect(r.wpm).toBeGreaterThan(6);
    expect(r.wpm).toBeLessThan(14);
    const later = advanceRival(r, 60_000, 10_000, 30, EASE_MS);
    expect(later.wpm).toBeCloseTo(30, 1);
  });

  it('once finished it stays finished; an unfinished one projects its finish at its current speed', () => {
    const fin = advanceRival(startRival(60), 60_000, total, 60, 0);
    expect(advanceRival(fin, 120_000, total, 5, 0)).toBe(fin);
    const mid = advanceRival(startRival(10), 12_000, total, 10, 0); // 10 wpm = 50 chars/min; 12 s = 10 chars
    expect(mid.chars).toBeCloseTo(10, 6);
    expect(rivalFinish(mid, total)).toBeCloseTo((total / 5 / 10) * 60_000, 3);
    expect(rivalFinish(fin, total)).toBe(fin.finishMs);
  });
});

// ------------------------------------------------------------------ simulations

const WORDS = wordsFor(2, 5);
const TOTAL = totalChars(WORDS);

/** A seeded standard normal (Box-Muller). */
function normal(r: () => number): number {
  const u = Math.max(1e-9, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/**
 * A later race (constant-pace rivals) against a child typing at `pace` wpm:
 * the child's finish time against both rivals', exactly as TypingRace.tsx
 * ranks them (honestRanking), and the measured wpm the way the race logs it.
 */
function laterRace(state: AdaptState, pace: number): { won: boolean; place: number; next: AdaptState } {
  const base = rivalBase(state) as number;
  const rivals = rivalWpms(base).map((w) => rivalFinish(advanceRival(startRival(w), 0, TOTAL, w, 0), TOTAL)) as [number, number];
  const meMs = (TOTAL / 5 / pace) * 60_000;
  const place = honestRanking(meMs, rivals).indexOf('me') + 1;
  const measured = wpm(TOTAL, meMs);
  return { won: place === 1, place, next: afterRace(state, { wpm: measured, won: place === 1 }) };
}

/** The first race against a child typing at a constant `pace`, stepping the rivals the way the frame loop does. */
function firstRace(pace: number, slowFrom?: { atMs: number; pace: number }): { won: boolean; place: number; next: AdaptState } {
  const keys: number[] = [];
  let runs = [startRival(PRIOR_WPM), startRival(PRIOR_WPM)];
  let chars = 0;
  let t = 0;
  let meMs = 0;
  while (!meMs) {
    t += 100;
    const p = slowFrom && t > slowFrom.atMs ? slowFrom.pace : pace;
    const before = Math.floor(chars);
    chars += (p * 5 * 100) / 60_000;
    for (let c = before + 1; c <= Math.floor(chars); c++) keys.push(t);
    const live = liveWpm(keys, 0, t);
    runs = runs.map((r, i) => advanceRival(r, t, TOTAL, firstRaceTarget(i as 0 | 1, live, chars, r.chars), EASE_MS));
    if (chars >= TOTAL) meMs = t;
  }
  const rivals = runs.map((r) => rivalFinish(r, TOTAL)) as [number, number];
  const place = honestRanking(meMs, rivals).indexOf('me') + 1;
  return { won: place === 1, place, next: afterRace(ADAPT_START, { wpm: wpm(TOTAL, meMs), won: place === 1 }) };
}

/** 12 races: the first is adaptive-live, then the rule. The child's pace varies `sigma` from race to race. */
function session(pace: number, sigma: number, seed: number, races = 12): { wins: number; places: number[] } {
  const r = rng(seed);
  let state: AdaptState = ADAPT_START;
  const places: number[] = [];
  for (let i = 0; i < races; i++) {
    const p = pace * Math.exp(sigma * normal(r));
    const res = i === 0 ? firstRace(p) : laterRace(state, p);
    state = res.next;
    places.push(res.place);
  }
  return { wins: places.filter((p) => p === 1).length, places };
}

describe('the first race (soft band)', () => {
  it('a child who keeps their pace wins it, at any speed', () => {
    for (const pace of [2, 6, 12, 25]) expect(firstRace(pace).place, `${pace} wpm`).toBe(1);
  });

  it('a child who slows down a lot halfway can lose it (it is not the band that always lets them win)', () => {
    const res = firstRace(20, { atMs: 15_000, pace: 3 });
    expect(res.place).toBeGreaterThan(1);
    expect(res.won).toBe(false);
  });

  it('a child who types nothing loses nothing: the state stays at the start', () => {
    expect(afterRace(ADAPT_START, { wpm: null, won: false })).toBe(ADAPT_START);
  });
});

describe('the later races converge', () => {
  it('a steady 10 wpm child, alone, settles into an alternating or winning rhythm and never breaks the bounds', () => {
    let s: AdaptState = { lastWpm: 10, lastWon: true };
    for (let i = 0; i < 20; i++) {
      s = laterRace(s, 10).next;
      const base = rivalBase(s) as number;
      expect(base).toBeGreaterThanOrEqual(BASE_MIN_WPM);
      expect(base).toBeLessThanOrEqual(BASE_MAX_WPM);
      expect(Math.abs((s.lastWpm as number) - 10)).toBeLessThan(0.2); // the rivals never drag the child's own measured pace along
    }
  });

  it('a loss makes the very next race easier for the same pace, a win harder', () => {
    const pace = 10;
    const afterLoss = laterRace({ lastWpm: pace, lastWon: false }, pace);
    const afterWin = laterRace({ lastWpm: pace, lastWon: true }, pace);
    expect(afterLoss.place).toBeLessThanOrEqual(afterWin.place);
    expect(afterLoss.won).toBe(true);
  });

  it('the clamp keeps even absurd measured paces from running the rivals away', () => {
    expect(rivalWpms(rivalBase({ lastWpm: 500, lastWon: true }) as number)[1]).toBeLessThanOrEqual(BASE_MAX_WPM);
    expect(rivalWpms(rivalBase({ lastWpm: 0.01, lastWon: false }) as number)[0]).toBeGreaterThan(0);
  });

  it('all three places are reachable', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 60 && seen.size < 3; seed++) session(10, 0.3, seed).places.forEach((p) => seen.add(p));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
});

describe('a slow child and a fast child each win between 40% and 85% over 12 races (about 64% in practice: 2 of 3)', () => {
  const SEEDS = 200;
  const rate = (pace: number, sigma: number) => {
    let wins = 0;
    for (let seed = 1; seed <= SEEDS; seed++) wins += session(pace, sigma, seed).wins;
    return wins / (SEEDS * 12);
  };

  for (const pace of [2, 6, 10, 25]) {
    it(`${pace} wpm (pace varies ~10% race to race)`, () => {
      const r = rate(pace, 0.1);
      expect(r, `win rate at ${pace} wpm`).toBeGreaterThan(0.4);
      expect(r, `win rate at ${pace} wpm`).toBeLessThan(0.85);
    });
  }

  it('also holds when the child is more erratic (25% between races)', () => {
    for (const pace of [2, 25]) {
      const r = rate(pace, 0.25);
      expect(r, `win rate at ${pace} wpm, erratic`).toBeGreaterThan(0.4);
      expect(r, `win rate at ${pace} wpm, erratic`).toBeLessThan(0.85);
    }
  });

  it('a single session is not locked: the slow and the fast child lose some and win some', () => {
    for (const pace of [2, 25]) {
      const { wins } = session(pace, 0.1, 7);
      expect(wins).toBeGreaterThan(0);
      expect(wins).toBeLessThan(12);
    }
  });
});
