import { describe, expect, it } from 'vitest';
import { rng } from '../../ink/ink.js';
import {
  ADAPT_DOWN_WRONG, ADAPT_UP_STREAK, LETTERS_1, PIC_WORDS, POP_MAX_TIER, WAVE_MS, accuracyPct, adaptStep, atOnceOf, expectedOf, fallMsOf,
  judge, newAdapt, normKey, pickLane, pickText, shouldSpawn, targetOf, tierSpec, waveOver, type Adapt, type Live,
} from './pop';

const live = (text: string, o: Partial<Live> = {}): Live => ({ id: o.seq ?? 0, text, typed: 0, seq: 0, landed: false, ...o });

describe('"¡Pum! Letras" waves', () => {
  it('start with a few capital vowels, one at a time, then more letters, then words with a picture', () => {
    expect(tierSpec(1).letters).toEqual(LETTERS_1);
    expect(tierSpec(1).atOnce[0]).toBe(1);
    expect(tierSpec(1).wordShare).toBe(0);
    expect(tierSpec(3).letters.length).toBeGreaterThan(tierSpec(2).letters.length);
    expect(tierSpec(3).atOnce[2]).toBeGreaterThan(tierSpec(1).atOnce[2]);
    expect(tierSpec(4).wordShare).toBeGreaterThan(0);
    expect(tierSpec(5).wordShare).toBe(1);
    expect(tierSpec(0)).toBe(tierSpec(1));
    expect(tierSpec(POP_MAX_TIER + 3)).toBe(tierSpec(POP_MAX_TIER));
    for (let t = 1; t <= POP_MAX_TIER; t++) {
      for (const l of tierSpec(t).letters) expect(l).toMatch(/^[A-Z]$/);
      const f = tierSpec(t).fallMs;
      expect(f[0] >= f[1] && f[1] >= f[2]).toBe(true);
    }
    for (const w of PIC_WORDS) expect(w).toMatch(/^[A-Z]{2,3}$/);
  });

  it('never put two bubbles with the same first letter on screen, nor the same one twice in a row', () => {
    const r = rng(7);
    for (let t = 1; t <= POP_MAX_TIER; t++) {
      for (let i = 0; i < 200; i++) {
        const on = [live(pickText(t, r, [], null))];
        const next = pickText(t, r, on, on[0].text);
        expect(next[0]).not.toBe(on[0].text[0]);
        expect(next).not.toBe(on[0].text);
      }
    }
  });

  it('draw words only from tier 4 on, and only words (when one is free) at tier 5', () => {
    const r = rng(3);
    const t1 = Array.from({ length: 100 }, () => pickText(1, r, [], null));
    expect(t1.every((x) => x.length === 1)).toBe(true);
    const t4 = Array.from({ length: 200 }, () => pickText(4, r, [], null));
    expect(t4.some((x) => x.length > 1) && t4.some((x) => x.length === 1)).toBe(true);
    const t5 = Array.from({ length: 100 }, () => pickText(5, r, [], null));
    expect(t5.every((x) => (PIC_WORDS as readonly string[]).includes(x))).toBe(true);
  });

  it('spread the bubbles over free lanes', () => {
    const r = rng(11);
    for (let i = 0; i < 100; i++) {
      const lane = pickLane(r, [1, 3], 6, 2);
      expect([0, 4, 5]).toContain(lane);
    }
    expect(pickLane(r, [0, 1], 2)).toBeGreaterThanOrEqual(0);
  });

  it('bring a new bubble while the wave lasts, when there is room and after a gap; the wave ends with a clear sky', () => {
    const base = { now: 5000, waveAt: 0, lastAt: 0, live: 0, atOnce: 1, gapMs: 900 };
    expect(shouldSpawn(base)).toBe(true);
    expect(shouldSpawn({ ...base, live: 1 })).toBe(false);
    expect(shouldSpawn({ ...base, lastAt: 4500 })).toBe(false);
    expect(shouldSpawn({ ...base, now: WAVE_MS + 1 })).toBe(false);
    expect(waveOver(WAVE_MS - 1, 0)).toBe(false);
    expect(waveOver(WAVE_MS + 10, 1)).toBe(false);
    expect(waveOver(WAVE_MS + 10, 0)).toBe(true);
  });
});

describe('the adaptivity inside a wave', () => {
  const run = (evs: Parameters<typeof adaptStep>[1][], a: Adapt = newAdapt()) => evs.reduce(adaptStep, a);
  const quick = { kind: 'pop', landed: false } as const;

  it('a run of quick pops brings more bubbles at once and a quicker fall, three steps at most', () => {
    const a = run(Array(ADAPT_UP_STREAK).fill(quick));
    expect(a.level).toBe(1);
    expect(a.ups).toBe(1);
    expect(atOnceOf(3, a)).toBeGreaterThanOrEqual(atOnceOf(3, newAdapt()));
    expect(fallMsOf(3, a)).toBeLessThan(fallMsOf(3, newAdapt()));
    const top = run(Array(ADAPT_UP_STREAK * 5).fill(quick));
    expect(top.level).toBe(2);
    expect(top.top).toBe(2);
  });

  it('a pop after the grass, or with wrong keys before it, breaks the run', () => {
    const a = run([quick, quick, quick, { kind: 'pop', landed: true }, quick]);
    expect(a.level).toBe(0);
    expect(a.streak).toBe(1);
    const b = run([quick, quick, quick, { kind: 'wrong' }, { kind: 'wrong' }, quick]);
    expect(b.level).toBe(0);
    expect(b.streak).toBe(0);
  });

  it('a bubble reaching the grass, or a burst of wrong keys, takes a step back (never below the first)', () => {
    const up = run(Array(ADAPT_UP_STREAK).fill(quick));
    expect(run([{ kind: 'landed' }], up).level).toBe(0);
    expect(run(Array(ADAPT_DOWN_WRONG).fill({ kind: 'wrong' }), up).level).toBe(0);
    expect(run(Array(ADAPT_DOWN_WRONG - 1).fill({ kind: 'wrong' }), up).level).toBe(1);
    expect(run([{ kind: 'landed' }, { kind: 'landed' }]).level).toBe(0);
  });
});

describe('matching a key', () => {
  it('reads letters in any case, accents dropped, and ignores the rest', () => {
    expect(normKey('a')).toBe('A');
    expect(normKey('Á')).toBe('A');
    expect(normKey('ñ')).toBe('Ñ');
    expect(normKey(' ')).toBeNull();
    expect(normKey('1')).toBeNull();
    expect(normKey('Enter')).toBeNull();
  });

  it('pops the bubble with that letter; another letter is a wrong key that loses nothing', () => {
    const on = [live('A', { id: 1, seq: 1 }), live('O', { id: 2, seq: 2 })];
    expect(judge(on, null, 'o')).toEqual({ kind: 'hit', id: 2, typed: 1, done: true });
    expect(judge(on, null, 'e')).toEqual({ kind: 'wrong', expected: 'A' });
    expect(judge(on, null, 'Shift')).toEqual({ kind: 'ignore' });
    expect(judge([], null, 'a')).toEqual({ kind: 'wrong', expected: null });
  });

  it('a word started takes the next keys, letter by letter', () => {
    const on = [live('SOL', { id: 1, seq: 1, typed: 1 }), live('A', { id: 2, seq: 2 })];
    expect(judge(on, 1, 'o')).toEqual({ kind: 'hit', id: 1, typed: 2, done: false });
    expect(judge(on, 1, 'a')).toEqual({ kind: 'wrong', expected: 'O' });
    expect(judge([{ ...on[0], typed: 2 }], 1, 'L')).toEqual({ kind: 'hit', id: 1, typed: 3, done: true });
    expect(judge([live('PAN', { id: 4 })], null, 'p')).toEqual({ kind: 'hit', id: 4, typed: 1, done: false });
  });

  it('the bubble to type is the word started, else one on the grass, else the first to come', () => {
    const a = live('A', { id: 1, seq: 1 });
    const e = live('E', { id: 2, seq: 2, landed: true });
    const w = live('SOL', { id: 3, seq: 3, typed: 1 });
    expect(targetOf([a, e, w], 3)?.id).toBe(3);
    expect(targetOf([a, e, w], null)?.id).toBe(2);
    expect(targetOf([a], 9)?.id).toBe(1);
    expect(targetOf([], null)).toBeNull();
    expect(expectedOf(w)).toBe('O');
    expect(expectedOf(null)).toBeNull();
  });

  it('accuracy is right keys over all keys', () => {
    expect(accuracyPct(0, 0)).toBeNull();
    expect(accuracyPct(3, 1)).toBe(75);
    expect(accuracyPct(2, 1)).toBe(66.7);
  });
});
