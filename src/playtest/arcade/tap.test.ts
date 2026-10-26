import { describe, expect, it } from 'vitest';
import {
  ANIMALS, EFFECTS, EFFECT_MS, HUES, MAX_RULES, TAP_MAX_TIER, addRule, madeRule, newRound, nextHue, removeRule, ruleCount,
  rulesOf, rulesSnapshot, runMs, sceneOf, unmadeRule, winsRound, type Rules,
} from './tap';

describe('"Tocá y pasa" scenes', () => {
  it('unlock more with the tier: three effects, then five, then a fourth animal', () => {
    expect(sceneOf(1)).toEqual({ animals: ['rana', 'zorro', 'carpincho'], effects: ['jump', 'colour', 'confetti'] });
    expect(sceneOf(2).effects).toEqual(EFFECTS);
    expect(sceneOf(2).animals).toHaveLength(3);
    expect(sceneOf(3).animals).toEqual(ANIMALS);
    expect(sceneOf(TAP_MAX_TIER + 5)).toEqual(sceneOf(TAP_MAX_TIER));
    expect(sceneOf(0)).toEqual(sceneOf(1));
  });
  it('every effect has a duration, and a tap plays the rules one after another', () => {
    for (const e of EFFECTS) expect(EFFECT_MS[e]).toBeGreaterThan(0);
    expect(runMs(['jump', 'spin'])).toBe(EFFECT_MS.jump + EFFECT_MS.spin);
    expect(runMs([])).toBe(0);
  });
  it('the colours go round', () => {
    expect(nextHue(0)).toBe(1);
    expect(nextHue(HUES.length - 1)).toBe(0);
  });
});

describe('the rules model', () => {
  it('adds rules in order, a few per animal (a full sign takes no more)', () => {
    let rules: Rules = {};
    for (const e of ['jump', 'jump', 'confetti'] as const) {
      const r = addRule(rules, 'rana', e);
      expect(r.added).toBe(true);
      rules = r.rules;
    }
    expect(rulesOf(rules, 'rana')).toEqual(['jump', 'jump', 'confetti']);
    const full = addRule(rules, 'rana', 'spin');
    expect(full.added).toBe(false);
    expect(full.rules).toBe(rules);
    expect(rulesOf(rules, 'rana')).toHaveLength(MAX_RULES);
    expect(rulesOf(rules, 'zorro')).toEqual([]);
  });
  it('takes a rule off by its place, never mutating the old rules', () => {
    const rules: Rules = { zorro: ['hide', 'spin', 'colour'] };
    const r = removeRule(rules, 'zorro', 1);
    expect(r.removed).toBe('spin');
    expect(rulesOf(r.rules, 'zorro')).toEqual(['hide', 'colour']);
    expect(rules.zorro).toEqual(['hide', 'spin', 'colour']);
    expect(removeRule(rules, 'zorro', 5).removed).toBeNull();
    expect(removeRule(rules, 'rana', 0).removed).toBeNull();
  });
  it('counts and snapshots only the animals with rules', () => {
    const rules: Rules = { rana: ['jump'], zorro: [], coati: ['spin', 'hide'] };
    expect(ruleCount(rules)).toBe(3);
    expect(rulesSnapshot(rules)).toEqual({ rana: ['jump'], coati: ['spin', 'hide'] });
  });
});

describe('a round: a rule made, then used', () => {
  it('is won by tapping, in play mode, an animal that got a rule in this round', () => {
    let rules: Rules = addRule({}, 'rana', 'jump').rules;
    let r = madeRule(newRound(), 'rana');
    expect(winsRound(r, 'zorro', rules)).toBe(false);
    expect(winsRound(r, 'rana', rules)).toBe(true);
    // an animal with old rules (made in an earlier round) does not win it
    rules = addRule(rules, 'zorro', 'spin').rules;
    expect(winsRound(newRound(), 'zorro', rules)).toBe(false);
    r = madeRule(r, 'rana');
    expect(r.fresh).toEqual(['rana']);
  });
  it('a rule taken off leaves the animal fresh only while it still has one', () => {
    let rules: Rules = addRule({}, 'rana', 'jump').rules;
    let r = madeRule(newRound(), 'rana');
    rules = removeRule(rules, 'rana', 0).rules;
    r = unmadeRule(r, 'rana', rules);
    expect(r.fresh).toEqual([]);
    expect(winsRound(r, 'rana', rules)).toBe(false);
    rules = addRule(addRule({}, 'zorro', 'hide').rules, 'zorro', 'spin').rules;
    r = unmadeRule(madeRule(newRound(), 'zorro'), 'zorro', removeRule(rules, 'zorro', 0).rules);
    expect(r.fresh).toEqual(['zorro']);
  });
});
