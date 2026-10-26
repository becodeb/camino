import { describe, expect, it } from 'vitest';
import { CONNECTOR, ZOOM_SPEED, TURBO_SPEED, courseOf, generateRace, type RaceDef } from './race';
import { typedSpot, typingRaceDef, wordsFor } from './typingRace';
import {
  HONEST_PACE, HONEST_WPM, RIVAL_TIER_PAIRS, RIVAL_TIERS, honestFinishMs, honestPosition, honestRanking, honestResult, msPerChar, reasonFor,
  resultLine, rivalTiersFor, totalChars, typingFinishMs, typingPosition,
} from './honestRace';

/** A wrong block locks input this long (Race.tsx's own BUMP_MS), used by the calibration below. */
const BUMP_MS = 750;
/** The uncovered tail of a stretch after the last right block (race.ts's LURCH caps `restingSpot` at `length - 0.35`). */
const TAIL = 0.35;

/**
 * Simulates one input policy over a real generated race: `perBlockMs` to
 * place each right block (no thinking time modelled beyond that), `wrong`
 * wrong blocks per stretch (each costing BUMP_MS), and whether the turbo
 * repeat is taken on every turbo stretch (one placement instead of the
 * stretch's whole length, and TURBO_SPEED instead of ZOOM_SPEED for the
 * stretch's zoom). Mirrors Race.tsx's own timing exactly enough to check
 * HONEST_PACE's ordering against the real generator, not just the rule table
 * honestRace.ts's header comment describes.
 */
function simulateBlockRace(def: RaceDef, policy: { perBlockMs: number; wrong: number; useTurbo: boolean }): number {
  const course = courseOf(def);
  let ms = 0;
  def.stretches.forEach((st, i) => {
    const takeTurbo = st.turbo && policy.useTurbo;
    const blocks = takeTurbo ? 1 : st.road.length;
    ms += blocks * policy.perBlockMs + policy.wrong * BUMP_MS;
    const last = i === def.stretches.length - 1;
    const tail = TAIL + (last ? CONNECTOR : CONNECTOR);
    ms += (tail / (takeTurbo ? TURBO_SPEED : ZOOM_SPEED)) * 1000;
  });
  void course;
  return ms;
}

describe('the block race pace (course units/s)', () => {
  it('gold is the fastest tier, silver the middle, bronze the slowest', () => {
    expect(HONEST_PACE.gold).toBeGreaterThan(HONEST_PACE.silver);
    expect(HONEST_PACE.silver).toBeGreaterThan(HONEST_PACE.bronze);
  });

  it('a good program (turbo taken, few errors) beats gold, and a slow no-turbo one loses to bronze, on real generated races', () => {
    for (const tier of [1, 2, 3, 4]) {
      for (const seed of [1, 7, 23, 101]) {
        const def = generateRace(tier, seed);
        const course = courseOf(def);
        const goodMs = simulateBlockRace(def, { perBlockMs: 900, wrong: 0.15, useTurbo: true });
        const slowMs = simulateBlockRace(def, { perBlockMs: 3200, wrong: 1.5, useTurbo: false });
        expect(goodMs, `tier ${tier} seed ${seed}`).toBeLessThan(honestFinishMs('gold', course.finish));
        expect(slowMs, `tier ${tier} seed ${seed}`).toBeGreaterThan(honestFinishMs('bronze', course.finish));
      }
    }
  });

  it('a no-turbo tape loses to the fastest (gold) rival on a turbo course, even placing every block right (turbo is what makes the difference)', () => {
    for (const tier of [3, 4]) { // tiers with turbo stretches
      for (const seed of [1, 7, 23, 101]) {
        const def = generateRace(tier, seed);
        const course = courseOf(def);
        const cleanNoTurboMs = simulateBlockRace(def, { perBlockMs: 1300, wrong: 0, useTurbo: false });
        expect(cleanNoTurboMs, `tier ${tier} seed ${seed}`).toBeGreaterThan(honestFinishMs('gold', course.finish));
      }
    }
  });

  it('an okay program (no turbo, some errors) lands close to silver, neither always first nor always last', () => {
    const tiers = [1, 2, 3, 4];
    const places = tiers.map((tier) => {
      const def = generateRace(tier, 11);
      const course = courseOf(def);
      const okayMs = simulateBlockRace(def, { perBlockMs: 1500, wrong: 0.4, useTurbo: false });
      return honestResult({ meMs: okayMs, rivalsMs: [honestFinishMs('bronze', course.finish), honestFinishMs('gold', course.finish)], wrongTotal: 2, idleMs: 0 }).place;
    });
    // never dead last (beats bronze) and never the automatic winner (gold still ahead of "okay")
    expect(places.every((p) => p === 2)).toBe(true);
  });

  it('honestPosition never passes the finish line and stands still before the race starts', () => {
    expect(honestPosition('gold', 0, 20)).toBe(0);
    expect(honestPosition('gold', -500, 20)).toBe(0);
    expect(honestPosition('bronze', 10_000_000, 20)).toBe(20);
  });
});

describe('the typing race pace (words per minute)', () => {
  it('matches the design doc: bronze 6, silver 10, gold 15 (the 4to median was 9.3, between bronze and silver)', () => {
    expect(HONEST_WPM).toEqual({ bronze: 6, silver: 10, gold: 15 });
  });

  it('msPerChar and typingFinishMs agree with the plain wpm formula (5 chars a word)', () => {
    const words = ['repetir', 'esperar'];
    const chars = totalChars(words);
    expect(chars).toBe(7 + 1 + 7);
    for (const tier of RIVAL_TIERS) {
      const expectedMs = (chars / 5 / HONEST_WPM[tier]) * 60_000;
      expect(typingFinishMs(tier, words)).toBeCloseTo(expectedMs, 5);
      expect(msPerChar(tier) * chars).toBeCloseTo(expectedMs, 5);
    }
  });

  it('typingPosition walks the same words the child types, landing on typedSpot and never past the finish', () => {
    const words = wordsFor(3, 5);
    const def = typingRaceDef(words, 3, 5);
    const course = courseOf(def);
    expect(typingPosition('gold', 0, words, course)).toBe(0);
    expect(typingPosition('gold', 10_000_000, words, course)).toBe(course.finish);
    // halfway through the first word: lands where typedSpot says a half-typed first word would
    const halfFirst = (words[0].length / 2) * msPerChar('silver');
    expect(typingPosition('silver', halfFirst, words, course)).toBeCloseTo(typedSpot(course.starts, course.ends, 0, words[0].length / 2, words[0].length), 3);
  });

  it('a 15wpm typist beats a 6wpm one on the same words, every time', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const words = wordsFor(2, seed);
      expect(typingFinishMs('gold', words)).toBeLessThan(typingFinishMs('bronze', words));
    }
  });
});

describe('which two tiers race today', () => {
  it('cycles bronze+silver, silver+gold, bronze+gold, like the critter pair already cycles by race number', () => {
    expect(rivalTiersFor(1)).toEqual(['bronze', 'silver']);
    expect(rivalTiersFor(2)).toEqual(['silver', 'gold']);
    expect(rivalTiersFor(3)).toEqual(['bronze', 'gold']);
    expect(rivalTiersFor(4)).toEqual(RIVAL_TIER_PAIRS[0]);
    expect(rivalTiersFor(0)).toEqual(RIVAL_TIER_PAIRS[0]); // never a negative or zero index
  });
});

describe('the result: place, margin, reason', () => {
  it('1st when faster than both rivals, margin to the closer (faster) of the two', () => {
    const r = honestResult({ meMs: 10_000, rivalsMs: [12_000, 11_000], wrongTotal: 0, idleMs: 0 });
    expect(r).toEqual({ place: 1, marginMs: 1000, reason: 'fast_and_clean' });
  });

  it('2nd when between the two rivals, margin to the one that beat it (not the one behind)', () => {
    const r = honestResult({ meMs: 11_000, rivalsMs: [9_000, 14_000], wrongTotal: 0, idleMs: 0 });
    expect(r.place).toBe(2);
    expect(r.marginMs).toBe(2000);
  });

  it('3rd when slower than both, margin to the closer (slower) of the two', () => {
    const r = honestResult({ meMs: 20_000, rivalsMs: [9_000, 14_000], wrongTotal: 0, idleMs: 0 });
    expect(r.place).toBe(3);
    expect(r.marginMs).toBe(6000);
  });

  it('a tie favours the child: never worse than a rival it merely matched', () => {
    const r = honestResult({ meMs: 10_000, rivalsMs: [10_000, 12_000], wrongTotal: 0, idleMs: 0 });
    expect(r.place).toBe(1);
  });

  describe('reasonFor', () => {
    it('winning is always fast_and_clean, regardless of other facts', () => {
      expect(reasonFor({ place: 1, turboOffered: 2, turboUsed: 0, wrongTotal: 9, idleMs: 9000 })).toBe('fast_and_clean');
    });
    it('skipping an offered turbo explains a loss first', () => {
      expect(reasonFor({ place: 2, turboOffered: 1, turboUsed: 0, wrongTotal: 5, idleMs: 9000 })).toBe('no_turbo');
    });
    it('several wrong blocks/keys explains a loss when turbo was taken or not offered', () => {
      expect(reasonFor({ place: 3, turboOffered: 0, turboUsed: 0, wrongTotal: 4, idleMs: 0 })).toBe('crashes');
      expect(reasonFor({ place: 2, turboOffered: 1, turboUsed: 1, wrongTotal: 3, idleMs: 0 })).toBe('crashes');
    });
    it('a long idle stretch explains a clean but slow loss', () => {
      expect(reasonFor({ place: 3, turboOffered: 0, turboUsed: 0, wrongTotal: 1, idleMs: 5000 })).toBe('slow_idle');
    });
    it('C10: with no other signal (no missed turbo, fewer than 3 errors, no long pause) the rival simply came in faster: it never blames the child', () => {
      expect(reasonFor({ place: 2, turboOffered: 0, turboUsed: 0, wrongTotal: 0, idleMs: 0 })).toBe('rival_faster');
      expect(reasonFor({ place: 3, turboOffered: 0, turboUsed: 0, wrongTotal: 2, idleMs: 3999 })).toBe('rival_faster');
      expect(reasonFor({ place: 2, turboOffered: 1, turboUsed: 1, wrongTotal: 0, idleMs: 0 })).toBe('rival_faster');
    });
  });
});

describe('honestRanking', () => {
  it('fastest first, the child included; a tie favours the child over a rival', () => {
    expect(honestRanking(10_000, [12_000, 11_000])).toEqual(['me', 1, 0]);
    expect(honestRanking(10_000, [10_000, 12_000])).toEqual(['me', 0, 1]);
  });
});

describe('resultLine (Rioplatense Spanish, kid-facing)', () => {
  it('1st: "¡1ro por N s!", no reason needed', () => {
    expect(resultLine({ place: 1, marginMs: 2000, reason: 'fast_and_clean' })).toBe('¡1ro por 2 s!');
  });
  it('2nd/3rd: place, margin, and the reason line, naming the rival when given', () => {
    expect(resultLine({ place: 2, marginMs: 3000, reason: 'no_turbo' }, 'el zorro')).toBe('2do — te faltaron 3 s. el zorro usó turbo en la recta.');
    expect(resultLine({ place: 3, marginMs: 6000, reason: 'crashes' })).toBe('3ro — te faltaron 6 s. Te chocaste varias veces.');
    expect(resultLine({ place: 2, marginMs: 2000, reason: 'rival_faster' }, 'el zorro')).toBe('2do — te faltaron 2 s. Esta vez el zorro vino más rápido.');
    expect(resultLine({ place: 2, marginMs: 2000, reason: 'rival_faster' })).toBe('2do — te faltaron 2 s. Esta vez el rival vino más rápido.');
  });
});
