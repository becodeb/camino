import { describe, expect, it } from 'vitest';
import { DIZZY_MS, GAME_IDS, GUIDED, GUIDED_ROUNDS, GUIDED_TURN_MS, arcadeStartTier, createRapidTaps, guidedTier, guidedTurnOver, nextTier } from './kit';

describe('T43: the arcade kit', () => {
  it('the guided pass plays every registered game, each once', () => {
    expect(new Set(GUIDED).size).toBe(GUIDED.length);
    for (const g of GUIDED) expect(GAME_IDS).toContain(g);
  });

  it('a game gets a little harder each "¡Otra vez!", never past its top tier', () => {
    expect(nextTier(1, 6)).toBe(2);
    expect(nextTier(5, 6)).toBe(6);
    expect(nextTier(6, 6)).toBe(6);
    expect(nextTier(0, 6)).toBe(1);
    expect([1, 2, 3].map((r) => guidedTier(r, 6))).toEqual([1, 2, 3]);
    expect(guidedTier(9, 4)).toBe(4);
    expect(arcadeStartTier(undefined, 6)).toBe(1);
    expect(arcadeStartTier(4, 6)).toBe(4);
    expect(arcadeStartTier(9, 6)).toBe(6);
  });

  it('a guided turn ends after its rounds, or after the round on screen once its time is up (four games fit ~15 min)', () => {
    expect(guidedTurnOver(GUIDED_ROUNDS - 1, 0, 60_000)).toBe(false);
    expect(guidedTurnOver(GUIDED_ROUNDS, 0, 60_000)).toBe(true);
    expect(guidedTurnOver(1, 0, GUIDED_TURN_MS)).toBe(true);
    expect(4 * GUIDED_TURN_MS).toBeLessThanOrEqual(16 * 60_000);
  });

  describe('the rapid-tap detector', () => {
    it('a calm child (a tap every 400 ms) is never dizzy', () => {
      const d = createRapidTaps();
      for (let t = 0; t < 10_000; t += 400) expect(d.tap(t)).toMatchObject({ allowed: true, dizzy: false });
    });

    it('four taps within a second make the character dizzy; that tap and the ones during the spell do not count', () => {
      const d = createRapidTaps();
      expect(d.tap(0).allowed).toBe(true);
      expect(d.tap(150).allowed).toBe(true);
      expect(d.tap(300).allowed).toBe(true);
      const fourth = d.tap(450);
      expect(fourth).toEqual({ allowed: false, dizzy: true, taps: 4, window_ms: 450 });
      expect(d.isDizzy(500)).toBe(true);
      expect(d.tap(600)).toMatchObject({ allowed: false, dizzy: false });
      // after the spell, a fresh start: one tap counts again, nothing left over from before
      expect(d.isDizzy(450 + DIZZY_MS)).toBe(false);
      expect(d.tap(450 + DIZZY_MS)).toMatchObject({ allowed: true, dizzy: false, taps: 1 });
    });

    it('three quick taps then a pause are fine (only taps inside the window count)', () => {
      const d = createRapidTaps();
      d.tap(0); d.tap(100); d.tap(200);
      expect(d.tap(1300)).toMatchObject({ allowed: true, dizzy: false, taps: 1 });
    });

    it('the threshold and the window can be tuned, and reset clears a spell', () => {
      const d = createRapidTaps({ n: 2, windowMs: 300, dizzyMs: 1000 });
      d.tap(0);
      expect(d.tap(200).dizzy).toBe(true);
      d.reset();
      expect(d.isDizzy(300)).toBe(false);
      expect(d.tap(300).allowed).toBe(true);
    });
  });
});
