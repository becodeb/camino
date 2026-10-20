import { describe, expect, it } from 'vitest';
import { courseOf, MAX_HEIGHT } from './race';
import {
  accuracy, bankFor, fold, judgeKey, MIN_WORDS, RACE_CHARS, stretchLen, typedSpot, typingRaceDef, WORD_BANK, wordsFor, wpm,
} from './typingRace';

describe('the word bank', () => {
  it('tiers by length: short words, longer words, phrases, phrases with numbers', () => {
    expect(WORD_BANK[1].every((w) => !w.includes(' ') && w.length <= 6)).toBe(true);
    expect(WORD_BANK[2].every((w) => !w.includes(' ') && w.length >= 7)).toBe(true);
    expect(WORD_BANK[3].every((w) => w.includes(' ') && !/\d/.test(w))).toBe(true);
    expect(WORD_BANK[4].every((w) => w.includes(' ') && /\d/.test(w))).toBe(true);
  });

  it('only letters, digits and single spaces any keyboard types (no ñ, punctuation or minus sign)', () => {
    for (const w of Object.values(WORD_BANK).flat()) {
      expect(w).toMatch(/^[a-záéíóú0-9]+( [a-záéíóú0-9]+)*$/);
      expect(w).not.toMatch(/ñ/);
    }
  });

  it('the tiers are endless: 5 and beyond use tier 4', () => {
    expect(bankFor(7)).toBe(WORD_BANK[4]);
    expect(bankFor(0)).toBe(WORD_BANK[1]);
  });
});

describe('wordsFor', () => {
  it('is deterministic per seed, never repeats a word, and reaches the tier\'s letters', () => {
    for (const tier of [1, 2, 3, 4, 5]) {
      for (let seed = 1; seed < 60; seed++) {
        const w = wordsFor(tier, seed);
        expect(wordsFor(tier, seed)).toEqual(w);
        expect(new Set(w).size).toBe(w.length);
        expect(w.length).toBeGreaterThanOrEqual(MIN_WORDS);
        const need = RACE_CHARS[Math.min(4, tier) as 1 | 2 | 3 | 4];
        expect(w.join('').length).toBeGreaterThanOrEqual(need);
        // not much more than it needs either (the last word tops it up)
        expect(w.slice(0, -1).join('').length < need || w.length - 1 < MIN_WORDS).toBe(true);
        expect(w.every((x) => bankFor(tier).includes(x))).toBe(true);
      }
    }
  });

  it('different seeds draw different races', () => {
    const seen = new Set(Array.from({ length: 20 }, (_, i) => wordsFor(2, i + 1).join('|')));
    expect(seen.size).toBeGreaterThan(10);
  });
});

describe('judging a key', () => {
  it('right and wrong letters, case-insensitive', () => {
    expect(judgeKey('m', 'm')).toBe('right');
    expect(judgeKey('m', 'M')).toBe('right');
    expect(judgeKey('m', 'n')).toBe('wrong');
  });

  it('accents are optional: the unaccented letter types the accented one (and the accented one too)', () => {
    expect(judgeKey('ó', 'o')).toBe('right');
    expect(judgeKey('ó', 'ó')).toBe('right');
    expect(judgeKey('ó', 'Ó')).toBe('right');
    expect(judgeKey('o', 'ó')).toBe('right');
    expect(judgeKey('í', 'a')).toBe('wrong');
    expect(fold('Á')).toBe('a');
    expect(fold('ñ')).toBe('ñ');
  });

  it('the space between words is required, and a space is wrong mid-word', () => {
    expect(judgeKey(' ', ' ')).toBe('right');
    expect(judgeKey(' ', 's')).toBe('wrong');
    expect(judgeKey('s', ' ')).toBe('wrong');
  });

  it('digits for the phrases with numbers', () => {
    expect(judgeKey('1', '1')).toBe('right');
    expect(judgeKey('1', '7')).toBe('wrong');
  });

  it('keys that type no letter are ignored (Shift, a dead accent key, Backspace, Enter, arrows)', () => {
    for (const k of ['Shift', 'Dead', 'Backspace', 'Enter', 'ArrowLeft', 'CapsLock', 'Tab']) expect(judgeKey('a', k)).toBe('ignore');
  });

  it('typing a whole accented word without its accent, with one slip, ends right', () => {
    const word = 'posición';
    let i = 0;
    let wrong = 0;
    for (const k of [...'posx', ...'icion'].map((c) => (c === 'x' ? 'q' : c))) {
      const v = judgeKey(word[i], k);
      if (v === 'right') i++;
      else if (v === 'wrong') wrong++;
    }
    // "pos" + a slip + "icion": the slip costs nothing, the next right key carries on
    expect(i).toBe(word.length);
    expect(wrong).toBe(1);
  });
});

describe('the road under the words', () => {
  it('one stretch per word, about a piece for every three letters, on the drivable heights', () => {
    for (let seed = 1; seed < 40; seed++) {
      const words = wordsFor(4, seed);
      const def = typingRaceDef(words, 4, seed);
      expect(def.stretches).toHaveLength(words.length);
      def.stretches.forEach((s, i) => {
        expect(s.road).toHaveLength(stretchLen(words[i]));
        expect(s.turbo).toBe(false);
      });
      let h = 0;
      for (const d of def.stretches.flatMap((s) => s.road)) {
        h += d === 'up' ? 1 : d === 'down' ? -1 : 0;
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(MAX_HEIGHT);
      }
      expect(typingRaceDef(words, 4, seed)).toEqual(def);
    }
  });

  it('stretch length: 2 to 7 pieces', () => {
    expect(stretchLen('si no')).toBe(2);
    expect(stretchLen('decir hola por 2 segundos')).toBe(7);
    expect(stretchLen('cambiar puntos en 1')).toBe(6);
  });

  it('the kart moves along its stretch letter by letter, and never reaches its end before the word is done', () => {
    const def = typingRaceDef(['mover', 'por siempre'], 3, 5);
    const c = courseOf(def);
    expect(typedSpot(c.starts, c.ends, 1, 0, 11)).toBe(c.starts[1]);
    const spots = Array.from({ length: 12 }, (_, t) => typedSpot(c.starts, c.ends, 1, t, 11));
    for (let i = 1; i < spots.length; i++) expect(spots[i]).toBeGreaterThan(spots[i - 1]);
    expect(spots[11]).toBeLessThan(c.ends[1]);
  });
});

describe('the numbers', () => {
  it('words per minute: five letters a word', () => {
    expect(wpm(50, 60_000)).toBe(10);
    expect(wpm(25, 30_000)).toBe(10);
    expect(wpm(45, 90_000)).toBe(6);
    expect(wpm(0, 10_000)).toBe(0);
    expect(wpm(10, 0)).toBeNull();
  });

  it('accuracy: right keys over all keys', () => {
    expect(accuracy(45, 5)).toBe(90);
    expect(accuracy(2, 1)).toBe(66.7);
    expect(accuracy(0, 0)).toBeNull();
  });
});
