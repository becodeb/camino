import { describe, expect, it } from 'vitest';
import {
  COMMANDS, COMMON, KEY_ROWS, LETTER_NAME, MAX_TYPING_SEEDS, SPEED_START, TYPING_LISTO_MS, TYPING_MS, VOWELS, WORDS,
  adapt, createPicker, fallMs, keyOf, maxItems, maxLevel, modeOf, pressOn, seedsFor, typingTimes, wordSetOf, type Speed,
} from './typing';

describe('what falls, by grade', () => {
  it('1ro plays letters, 2do short words, 3ro and up the words of programming', () => {
    expect([1, 2, 3, 4, 5].map(modeOf)).toEqual(['letters', 'words', 'words', 'words', 'words']);
    expect([1, 2, 3, 4, 5].map(wordSetOf)).toEqual(['letters', 'words', 'commands', 'commands', 'commands']);
  });

  it('every letter and word can be typed on the drawn keyboard, and is said aloud', () => {
    const keys = KEY_ROWS.join('');
    for (const w of [...VOWELS, ...COMMON, ...WORDS, ...COMMANDS]) for (const ch of w) expect(keys).toContain(ch);
    for (const ch of keys) expect(LETTER_NAME[ch]).toBeTruthy();
    expect(keys).toContain('ñ');
  });

  it('the word lists are short, lowercase and without accents', () => {
    for (const w of [...WORDS, ...COMMANDS]) {
      expect(w).toMatch(/^[a-zñ]{2,7}$/);
    }
    expect(COMMANDS).toEqual(expect.arrayContaining(['si', 'repetir', 'mover', 'saltar', 'avanzar']));
    expect(WORDS).toEqual(expect.arrayContaining(['sol', 'mar', 'pato']));
  });

  it('1ro: the five vowels first, then vowels and common letters, never twice in a row', () => {
    const next = createPicker(1, 7);
    const picks = Array.from({ length: 60 }, () => next(1));
    expect(picks.slice(0, 5).map((p) => p.text).sort()).toEqual([...VOWELS].sort());
    expect(picks.slice(0, 5).every((p) => p.set === 'vowels')).toBe(true);
    const later = picks.slice(5);
    expect(later.some((p) => p.set === 'letters')).toBe(true);
    expect(later.some((p) => p.set === 'vowels')).toBe(true);
    for (const p of later) expect([...VOWELS, ...COMMON]).toContain(p.text);
    for (let i = 1; i < picks.length; i++) expect(picks[i].text).not.toBe(picks[i - 1].text);
  });

  it('words: short ones while it is slow, longer ones as it speeds up, none of the last three again', () => {
    const two = createPicker(2, 3);
    const slow = Array.from({ length: 30 }, () => two(1));
    expect(slow.every((p) => p.text.length === 3 && p.set === 'words')).toBe(true);
    const fast = Array.from({ length: 40 }, () => two(4));
    expect(fast.some((p) => p.text.length === 4)).toBe(true);
    const three = createPicker(3, 5);
    const s3 = Array.from({ length: 30 }, () => three(1));
    expect(s3.every((p) => p.text.length <= 5 && p.set === 'commands')).toBe(true);
    const f3 = Array.from({ length: 60 }, () => three(3)).map((p) => p.text);
    expect(f3).toContain('repetir');
    for (let i = 3; i < f3.length; i++) expect(f3.slice(i - 3, i)).not.toContain(f3[i]);
  });

  it('is seeded: the same seed replays the same game', () => {
    const a = createPicker(1, 11), b = createPicker(1, 11);
    expect(Array.from({ length: 20 }, () => a(2).text)).toEqual(Array.from({ length: 20 }, () => b(2).text));
  });
});

describe('a key press', () => {
  it('reads a keydown as one lowercase letter, accents off, ñ kept', () => {
    expect(keyOf('a')).toBe('a');
    expect(keyOf('A')).toBe('a');
    expect(keyOf('Ñ')).toBe('ñ');
    expect(keyOf('ñ')).toBe('ñ');
    expect(keyOf('á')).toBe('a');
    expect(keyOf('7')).toBe('7');
    for (const k of ['Shift', 'Enter', 'ArrowLeft', 'Dead', ' ', 'Backspace', '']) expect(keyOf(k)).toBeNull();
  });

  it('types a word in order: the right letter moves on, a wrong one loses nothing', () => {
    let t = { text: 'sol', pos: 0 };
    let r = pressOn(t, 's');
    expect(r).toEqual({ correct: true, expected: 's', pos: 1, done: false });
    t = { ...t, pos: r.pos };
    r = pressOn(t, 'l');
    expect(r).toEqual({ correct: false, expected: 'o', pos: 1, done: false });
    r = pressOn(t, 'o');
    t = { ...t, pos: r.pos };
    r = pressOn(t, 'l');
    expect(r).toEqual({ correct: true, expected: 'l', pos: 3, done: true });
  });

  it('catches a letter with its one key', () => {
    expect(pressOn({ text: 'm', pos: 0 }, 'm')).toEqual({ correct: true, expected: 'm', pos: 1, done: true });
    expect(pressOn({ text: 'm', pos: 0 }, 'n').done).toBe(false);
  });
});

describe('the speed adapts', () => {
  const quick = { kind: 'press' as const, correct: true, latency_ms: 900, first: true };
  const wrong = { kind: 'press' as const, correct: false, latency_ms: 900, first: true };
  const run = (grade: number, evs: Parameters<typeof adapt>[1][], s: Speed = SPEED_START) => evs.reduce((acc, e) => adapt(acc, e, grade), s);

  it('starts slow and speeds up after three quick right keys in a row', () => {
    expect(SPEED_START.level).toBe(1);
    expect(run(3, [quick, quick]).level).toBe(1);
    expect(run(3, [quick, quick, quick]).level).toBe(2);
    expect(run(3, Array(6).fill(quick)).level).toBe(3);
  });

  it('a middling right key breaks the streak without slowing down', () => {
    const mid = { ...quick, latency_ms: 3000 };
    expect(run(3, [quick, quick, mid, quick]).level).toBe(1);
    expect(run(3, [quick, quick, mid, quick, quick, quick]).level).toBe(2);
  });

  it('slows down after two wrong keys, after a slow key and after an item that reached the ground; never below 1', () => {
    const at3: Speed = { level: 3, streak: 0, misses: 0 };
    expect(run(3, [wrong], at3).level).toBe(3);
    expect(run(3, [wrong, wrong], at3).level).toBe(2);
    expect(run(3, [{ ...quick, latency_ms: 6000 }], at3).level).toBe(2);
    expect(run(3, [{ kind: 'press', correct: true, latency_ms: 4000, first: false }], at3).level).toBe(2);
    expect(run(3, [{ kind: 'landed' }], at3).level).toBe(2);
    expect(run(3, [{ kind: 'landed' }, { kind: 'landed' }, { kind: 'landed' }, wrong, wrong], at3).level).toBe(1);
  });

  it('a quick right key clears the misses: one wrong key now and then does not slow it down', () => {
    expect(run(3, [wrong, quick, wrong, quick, wrong], { level: 2, streak: 0, misses: 0 }).level).toBe(2);
  });

  it('the next letters of a word count as quick sooner than a first letter', () => {
    const next = { kind: 'press' as const, correct: true, latency_ms: 1500, first: false };
    expect(run(3, [next, next, next]).level).toBe(1);
    expect(run(3, [quick, quick, quick]).level).toBe(2);
  });

  it('never goes over the grade\'s top speed (1ro stays gentle)', () => {
    expect(run(1, Array(30).fill(quick)).level).toBe(maxLevel(1));
    expect(maxLevel(1)).toBeLessThan(maxLevel(3));
    expect(run(5, Array(60).fill(quick)).level).toBe(6);
  });

  it('falls faster as the level grows; a word gets time for each letter', () => {
    for (let l = 1; l < 6; l++) {
      expect(fallMs('letters', 'a', l + 1)).toBeLessThan(fallMs('letters', 'a', l));
      expect(fallMs('words', 'sol', l + 1)).toBeLessThan(fallMs('words', 'sol', l));
    }
    expect(fallMs('words', 'repetir', 1)).toBeGreaterThan(fallMs('words', 'si', 1));
    expect(fallMs('letters', 'a', 1)).toBeGreaterThanOrEqual(10_000);
  });

  it('one thing falls at a time; 1ro\'s letters two at most, only when it is faster', () => {
    expect(maxItems('letters', 1)).toBe(1);
    expect(maxItems('letters', 2)).toBe(1);
    expect(maxItems('letters', 3)).toBe(2);
    expect(maxItems('letters', 4)).toBe(2);
    for (let l = 1; l <= 6; l++) expect(maxItems('words', l)).toBe(1);
  });
});

describe('seeds and time', () => {
  it('plants a seed every five letters or two words, a few at most', () => {
    expect(seedsFor(4, 'letters')).toBe(0);
    expect(seedsFor(5, 'letters')).toBe(1);
    expect(seedsFor(12, 'letters')).toBe(2);
    expect(seedsFor(3, 'words')).toBe(1);
    expect(seedsFor(200, 'words')).toBe(MAX_TYPING_SEEDS);
  });

  it('lasts four minutes with "listo" after one; ?teclas sets another length', () => {
    expect(typingTimes('')).toEqual({ total: TYPING_MS, listo: TYPING_LISTO_MS });
    expect(typingTimes('?debug&teclas=2')).toEqual({ total: 120_000, listo: 60_000 });
    expect(typingTimes('?teclas=0.5')).toEqual({ total: 30_000, listo: 15_000 });
    expect(typingTimes('?teclas=0')).toEqual({ total: TYPING_MS, listo: TYPING_LISTO_MS });
    expect(typingTimes('?teclas=99')).toEqual({ total: TYPING_MS, listo: TYPING_LISTO_MS });
  });
});
