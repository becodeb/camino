import { describe, expect, it } from 'vitest';
import {
  COMMANDS, COMMON, DIGIT_ROW, KEY_ROWS, LETTER_NAME, MAX_TYPING_SEEDS, PACE, PACE_START, PHRASES3, PHRASES4, ROUNDS, STREAK,
  SYLLABLES1, SYLLABLES2, TYPING_CAP_MS, VOWELS, WORDS, addCatch, adaptPace, createRoundPicker, demoOf, fallMs, goalOverride, isEarly, listoShown,
  keyFor, keyOf, landedOn, modeOf, needsDigits, pressOn, roundDone, roundsFor, seedsFor, setOf, startRound, typingCap, wordSetOf,
  type Pace, type PaceEvent,
} from './typing';

const GRADES = [1, 2, 3, 4, 5];

describe('the rounds, by grade', () => {
  it('every grade plays three rounds with a goal of a few things each', () => {
    for (const g of GRADES) {
      const rounds = roundsFor(g);
      expect(rounds.map((r) => r.n)).toEqual([1, 2, 3]);
      expect(rounds).toHaveLength(ROUNDS);
      for (const r of rounds) {
        expect(r.goal).toBeGreaterThanOrEqual(3);
        expect(r.goal).toBeLessThanOrEqual(8);
        expect(r.pool.length).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('1ro: vowels, then common letters two at once, then syllables', () => {
    const [a, b, c] = roundsFor(1);
    expect(a.set).toBe('vowels');
    expect([...a.pool].sort()).toEqual([...VOWELS].sort());
    expect(a.atOnce).toBe(1);
    expect(b.set).toBe('letters');
    expect(b.pool).toEqual(expect.arrayContaining([...COMMON]));
    expect(b.atOnce).toBe(2);
    expect(c.set).toBe('syllables');
    expect(c.pool.every((s) => s.length === 2)).toBe(true);
  });

  it('2do: letters, syllables, short words; 3ro: words, programming words, a command with its number', () => {
    expect(roundsFor(2).map((r) => r.set)).toEqual(['letters', 'syllables', 'words']);
    expect(roundsFor(3).map((r) => r.set)).toEqual(['words', 'commands', 'phrases']);
    expect(roundsFor(3)[2].pool).toEqual(PHRASES3);
    for (const g of [4, 5]) {
      expect(roundsFor(g).map((r) => r.set)).toEqual(['commands', 'commands', 'phrases']);
      expect(roundsFor(g)[2].pool).toEqual(PHRASES4);
    }
  });

  it('each round is harder on purpose: longer things to type, or two at once', () => {
    for (const g of GRADES) {
      const rounds = roundsFor(g);
      const longest = rounds.map((r) => Math.max(...r.pool.map((t) => t.length)));
      for (let i = 1; i < rounds.length; i++) {
        const harder = longest[i] > longest[i - 1] || rounds[i].atOnce > rounds[i - 1].atOnce;
        expect(harder, `grade ${g} round ${i + 1}`).toBe(true);
      }
    }
    // 4to–5to's second round: longer words, a bit quicker per letter
    const [a, b] = roundsFor(5);
    expect(b.perCharMs).toBeLessThan(a.perCharMs);
  });

  it('only round 1 starts without a line of its own (the intro says it); a butterfly from round 2', () => {
    for (const g of GRADES) {
      const [a, b, c] = roundsFor(g);
      expect(a.say).toBe('');
      expect(b.say.length).toBeGreaterThan(10);
      expect(c.say.length).toBeGreaterThan(10);
      expect(b.say.length).toBeLessThanOrEqual(95);
      expect(c.say.length).toBeLessThanOrEqual(95);
      expect([a.butterfly, b.butterfly, c.butterfly]).toEqual([false, true, true]);
    }
  });

  it('the number row is drawn only where a command carries a number', () => {
    expect(needsDigits(roundsFor(1))).toBe(false);
    expect(needsDigits(roundsFor(2))).toBe(false);
    for (const g of [3, 4, 5]) expect(needsDigits(roundsFor(g))).toBe(true);
  });

  it('every item can be typed on the drawn keyboard and is said aloud; lowercase, no accents', () => {
    const keys = KEY_ROWS.join('') + DIGIT_ROW + ' ';
    for (const g of GRADES) {
      for (const r of roundsFor(g)) {
        for (const t of r.pool) {
          expect(t).toMatch(/^[a-zñ]+( [1-9])?$/);
          for (const ch of t) { expect(keys).toContain(ch); expect(LETTER_NAME[ch]).toBeTruthy(); }
        }
      }
    }
    for (const w of [...WORDS, ...COMMANDS, ...SYLLABLES1, ...SYLLABLES2]) expect(w).toMatch(/^[a-zñ]{2,7}$/);
  });

  it('the intro\'s demo is round 1\'s kind of thing; the grade\'s mode and set keep round 1\'s names', () => {
    expect(GRADES.map(demoOf)).toEqual(['a', 'a', 'sol', 'si', 'si']);
    expect(GRADES.map(modeOf)).toEqual(['letters', 'words', 'words', 'words', 'words']);
    expect(GRADES.map(wordSetOf)).toEqual(['letters', 'words', 'commands', 'commands', 'commands']);
  });

  it('a vowel inside a round of letters is logged as a vowel', () => {
    const r2 = roundsFor(1)[1];
    expect(setOf('a', r2)).toBe('vowels');
    expect(setOf('m', r2)).toBe('letters');
    expect(setOf('ma', roundsFor(1)[2])).toBe('syllables');
  });
});

describe('what falls in a round', () => {
  it('1ro round 1: the five vowels first, then vowels again; never twice in a row', () => {
    const p = createRoundPicker(roundsFor(1)[0], 7);
    const picks = Array.from({ length: 30 }, () => p.next());
    expect(picks.slice(0, 5).map((x) => x.text).sort()).toEqual([...VOWELS].sort());
    for (const x of picks) expect(x.set).toBe('vowels');
    for (let i = 1; i < picks.length; i++) expect(picks[i].text).not.toBe(picks[i - 1].text);
  });

  it('nothing of the last two again', () => {
    for (const g of GRADES) {
      for (const r of roundsFor(g)) {
        const p = createRoundPicker(r, g * 13 + r.n);
        const t = Array.from({ length: 40 }, () => p.next().text);
        for (let i = 2; i < t.length; i++) expect(t.slice(i - 2, i)).not.toContain(t[i]);
      }
    }
  });

  it('something that reached the ground comes back two items later', () => {
    const p = createRoundPicker(roundsFor(3)[0], 5);
    const a = p.next().text;
    p.again(a);
    const next = [p.next().text, p.next().text, p.next().text];
    expect(next[1]).toBe(a);
  });

  it('is seeded: the same seed replays the same round', () => {
    const r = roundsFor(2)[1];
    const a = createRoundPicker(r, 11), b = createRoundPicker(r, 11);
    expect(Array.from({ length: 20 }, () => a.next().text)).toEqual(Array.from({ length: 20 }, () => b.next().text));
  });
});

describe('a key press', () => {
  it('reads a keydown as one lowercase letter, accents off, ñ kept', () => {
    expect(keyOf('a')).toBe('a');
    expect(keyOf('A')).toBe('a');
    expect(keyOf('Ñ')).toBe('ñ');
    expect(keyOf('á')).toBe('a');
    expect(keyOf('3')).toBe('3');
    for (const k of ['Shift', 'Enter', 'ArrowLeft', 'Dead', ' ', 'Backspace', '']) expect(keyOf(k)).toBeNull();
  });

  it('the space bar is a key only when a command waits for its space', () => {
    expect(keyFor(' ', ' ')).toBe(' ');
    expect(keyFor(' ', 'r')).toBeNull();
    expect(keyFor(' ', null)).toBeNull();
    expect(keyFor('R', ' ')).toBe('r');
  });

  it('types an item in order: the right letter moves on, a wrong one loses nothing', () => {
    let t = { text: 'mover 3', pos: 0 };
    for (const ch of 'mover') t = { ...t, pos: pressOn(t, ch).pos };
    expect(pressOn(t, '3')).toEqual({ correct: false, expected: ' ', pos: 5, done: false });
    t = { ...t, pos: pressOn(t, ' ').pos };
    expect(pressOn(t, '3')).toEqual({ correct: true, expected: '3', pos: 7, done: true });
    expect(pressOn({ text: 'm', pos: 0 }, 'm').done).toBe(true);
  });
});

describe('the goal, the progress and the golden streak', () => {
  const catches = (goal: number, early: boolean[]) => {
    let p = startRound(goal);
    const golden: boolean[] = [];
    for (const e of early) { const r = addCatch(p, e); golden.push(r.goldenNow); p = r; }
    return { p, golden };
  };

  it('each catch fills a hole; the round is done when the bed is full', () => {
    const { p } = catches(6, [false, false, false, false, false]);
    expect(p.filled).toBe(5);
    expect(p.caught).toBe(5);
    expect(roundDone(p)).toBe(false);
    expect(roundDone(addCatch(p, false))).toBe(true);
  });

  it('three early catches in a row make a golden seed that fills one more hole', () => {
    const { p, golden } = catches(8, [true, true, true]);
    expect(golden).toEqual([false, false, true]);
    expect(p.filled).toBe(4);
    expect(p.golden).toBe(1);
    expect(p.streak).toBe(0);
    expect(STREAK).toBe(3);
  });

  it('a late catch or a landed item only starts the streak again; nothing is taken away', () => {
    const { p } = catches(8, [true, true, false, true, true]);
    expect(p.golden).toBe(0);
    expect(p.filled).toBe(5);
    const landed = landedOn(p);
    expect(landed.filled).toBe(5);
    expect(landed.streak).toBe(0);
    expect(addCatch(landed, true).goldenNow).toBe(false);
  });

  it('the golden seed never fills past the goal; the last hole is an ordinary catch', () => {
    const { p, golden } = catches(3, [true, true, true]);
    expect(golden).toEqual([false, false, false]);
    expect(p.filled).toBe(3);
    const big = catches(4, [true, true, true]);
    expect(big.p.filled).toBe(4);
    expect(roundDone(big.p)).toBe(true);
  });

  it('early means before the middle of the fall', () => {
    expect(isEarly(0.2)).toBe(true);
    expect(isEarly(0.49)).toBe(true);
    expect(isEarly(0.5)).toBe(false);
    expect(isEarly(0.9)).toBe(false);
  });
});

describe('the pace adapts only gently', () => {
  const early: PaceEvent = { kind: 'caught', early: true };
  const late: PaceEvent = { kind: 'caught', early: false };
  const run = (evs: PaceEvent[], p: Pace = PACE_START) => evs.reduce(adaptPace, p);

  it('starts calm; three early catches in a row → one step livelier; never past the third step', () => {
    expect(PACE_START.step).toBe(0);
    expect(run([early, early]).step).toBe(0);
    expect(run([early, early, early]).step).toBe(1);
    expect(run(Array(30).fill(early)).step).toBe(2);
    expect(PACE).toHaveLength(3);
  });

  it('a late catch breaks the streak without slowing; something on the ground → one step calmer, never below calm', () => {
    expect(run([early, early, late, early]).step).toBe(0);
    expect(run([{ kind: 'landed' }], { step: 2, quick: 2 })).toEqual({ step: 1, quick: 0 });
    expect(run([{ kind: 'landed' }, { kind: 'landed' }, { kind: 'landed' }], { step: 2, quick: 0 }).step).toBe(0);
  });

  it('the steps are small: the livelier pace is still three quarters of the calm one', () => {
    for (let i = 1; i < PACE.length; i++) {
      expect(PACE[i]).toBeLessThan(PACE[i - 1]);
      expect(PACE[i - 1] - PACE[i]).toBeLessThanOrEqual(0.15);
    }
    expect(PACE[PACE.length - 1]).toBeGreaterThanOrEqual(0.7);
  });

  it('falls: a letter in seconds, a longer item gets time per letter, a butterfly slower, a livelier step quicker', () => {
    const [r1, , r3] = roundsFor(1);
    expect(fallMs('a', r1, 0)).toBe(10_000);
    expect(fallMs('a', r1, 2)).toBeLessThan(fallMs('a', r1, 0));
    expect(fallMs('ma', r3, 0)).toBeGreaterThan(fallMs('a', r1, 0) * 0.9);
    expect(fallMs('a', r1, 0, true)).toBeGreaterThan(fallMs('a', r1, 0));
    const p = roundsFor(5)[2];
    expect(fallMs('repetir 3', p, 0)).toBeGreaterThan(fallMs('mover 2', p, 0));
    expect(fallMs('a', r1, 9)).toBe(fallMs('a', r1, 2));
  });
});

describe('seeds and time', () => {
  it('a seed to the garden every three holes, a few at most', () => {
    expect(seedsFor(2)).toBe(0);
    expect(seedsFor(3)).toBe(1);
    expect(seedsFor(19)).toBe(6);
    expect(seedsFor(200)).toBe(MAX_TYPING_SEEDS);
  });

  it('the three rounds plant about six seeds in 1ro', () => {
    const holes = roundsFor(1).reduce((n, r) => n + r.goal, 0);
    expect(seedsFor(holes)).toBeGreaterThanOrEqual(5);
    expect(seedsFor(holes)).toBeLessThanOrEqual(MAX_TYPING_SEEDS);
  });

  it('a five-minute cap; ?teclas sets another (0.25–10 min)', () => {
    expect(typingCap('')).toBe(TYPING_CAP_MS);
    expect(TYPING_CAP_MS).toBe(300_000);
    expect(typingCap('?debug&teclas=2')).toBe(120_000);
    expect(typingCap('?teclas=0.5')).toBe(30_000);
    expect(typingCap('?teclas=0')).toBe(TYPING_CAP_MS);
    expect(typingCap('?teclas=99')).toBe(TYPING_CAP_MS);
  });

  it('?metas sets every round\'s goal (checks and screenshots)', () => {
    expect(goalOverride('')).toBeNull();
    expect(goalOverride('?debug&metas=2')).toBe(2);
    expect(goalOverride('?metas=0')).toBeNull();
    expect(goalOverride('?metas=99')).toBeNull();
  });
});

describe('listo (T14: only after half of round 2)', () => {
  const at = (o: Partial<{ roundsDone: number; round: number; filled: number; goal: number; phase: string }>) =>
    listoShown({ roundsDone: 0, round: 0, filled: 0, goal: 8, phase: 'play', ...o });
  it('never in round 1 nor between rounds 1 and 2', () => {
    expect(at({ filled: 8 })).toBe(false);
    expect(at({ roundsDone: 1, round: 0, phase: 'between' })).toBe(false);
    expect(at({ roundsDone: 1, round: 1, phase: 'between' })).toBe(false);
  });
  it('in round 2 once half its bed is filled (rounded up), and after', () => {
    expect(at({ roundsDone: 1, round: 1, filled: 3, goal: 8 })).toBe(false);
    expect(at({ roundsDone: 1, round: 1, filled: 4, goal: 8 })).toBe(true);
    expect(at({ roundsDone: 1, round: 1, filled: 2, goal: 5 })).toBe(false);
    expect(at({ roundsDone: 1, round: 1, filled: 3, goal: 5 })).toBe(true);
    expect(at({ roundsDone: 2, round: 1, phase: 'between' })).toBe(true);
    expect(at({ roundsDone: 2, round: 2, filled: 0 })).toBe(true);
  });
  it('not while stopping, in the intro or the finale', () => {
    for (const phase of ['intro', 'stopping', 'finale']) expect(at({ roundsDone: 2, round: 2, phase })).toBe(false);
  });
});
