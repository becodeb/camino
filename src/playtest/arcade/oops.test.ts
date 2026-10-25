import { describe, expect, it } from 'vitest';
import { OOPS_MAX_TIER, ROUTINES, isRightFix, isSwapPartner, isWrongStep, optionsOf, routineFor, routineProblems } from './oops';

describe('T46: ¿qué salió mal?', () => {
  it('has at least four routines, each well formed', () => {
    expect(ROUTINES.length).toBeGreaterThanOrEqual(4);
    for (const r of ROUTINES) expect(routineProblems(r), r.id).toEqual([]);
    expect(new Set(ROUTINES.map((r) => r.id)).size).toBe(ROUTINES.length);
    // a wrong-thing mistake and a wrong-order one
    expect(ROUTINES.some((r) => r.kind === 'replace')).toBe(true);
    expect(ROUTINES.some((r) => r.kind === 'swap')).toBe(true);
  });

  it('the wrong strip differs from the right one where the mistake is (and its result after it)', () => {
    for (const r of ROUTINES) {
      const first = Math.min(...r.wrongAt);
      for (let i = 0; i < first; i++) expect(r.wrong[i], `${r.id} ${i}`).toBe(r.right[i]);
      for (const i of r.wrongAt) expect(r.wrong[i], `${r.id} ${i}`).not.toBe(r.right[i]);
      // the funny result: the last step is not the happy one
      expect(r.wrong[r.wrong.length - 1]).not.toBe(r.right[r.right.length - 1]);
    }
  });

  it('tiers take the routines in order; past the last, round and round, never the same twice', () => {
    expect([1, 2, 3, 4].map((t) => routineFor(t).id)).toEqual(ROUTINES.map((r) => r.id));
    expect(routineFor(0).id).toBe(ROUTINES[0].id);
    let prev = routineFor(OOPS_MAX_TIER).id;
    const seen = new Set([prev]);
    for (let i = 0; i < 8; i++) {
      const next = routineFor(OOPS_MAX_TIER + 3, prev).id;
      expect(next).not.toBe(prev);
      seen.add(next);
      prev = next;
    }
    expect(seen.size).toBe(ROUTINES.length);
    // a lower tier with its own routine just played: the next one
    expect(routineFor(1, ROUTINES[0].id).id).toBe(ROUTINES[1].id);
  });

  it('the options are the routine\'s own, the right one not always first', () => {
    const r = ROUTINES.find((x) => x.id === 'cold')!;
    const firsts = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const o = optionsOf(r, seed);
      expect([...o].sort()).toEqual([...r.options!].sort());
      firsts.add(o[0]);
    }
    expect(firsts.size).toBeGreaterThan(1);
    expect(optionsOf(ROUTINES.find((x) => x.kind === 'swap')!, 3)).toEqual([]);
  });

  it('judges the taps: the wrong step, the right fix, the swap partner', () => {
    const cold = ROUTINES.find((x) => x.id === 'cold')!;
    expect([0, 1, 2].map((i) => isWrongStep(cold, i))).toEqual([false, true, false]);
    expect(isRightFix(cold, 'coat_on')).toBe(true);
    expect(isRightFix(cold, 'sunhat_on')).toBe(false);
    const socks = ROUTINES.find((x) => x.id === 'socks')!;
    expect([0, 1, 2].map((i) => isWrongStep(socks, i))).toEqual([true, true, false]);
    expect(isSwapPartner(socks, 0, 1)).toBe(true);
    expect(isSwapPartner(socks, 1, 0)).toBe(true);
    expect(isSwapPartner(socks, 0, 2)).toBe(false);
    expect(isSwapPartner(socks, 0, 0)).toBe(false);
    expect(isRightFix(socks, 'socks_on')).toBe(false);
  });
});
