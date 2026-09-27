import { describe, expect, it } from 'vitest';
import { addAction, addRule, layoutRules, removeRef, resolveRuleDrop, ruleBlock, ruleRefusal, ruleTargetAt } from './ruleEditor';
import type { Rule } from './rules';

const O = { maxActions: 2, maxRules: 4 };
const R: Rule[] = [{ hat: 'key:right', actions: ['right'] }, { hat: 'key:up', actions: [] }];

describe('rule cards: edits', () => {
  it('a hat makes a new card; one card per trigger', () => {
    expect(addRule(R, 'key:left')).toHaveLength(3);
    expect(ruleRefusal(R, { newRule: true }, ruleBlock('key:right'), O)).toBe('dup');
    expect(ruleRefusal(R, { newRule: true }, ruleBlock('key:down'), O)).toBeNull();
  });

  it('an action needs a card, and a card has a fixed number of lines', () => {
    expect(ruleRefusal([], null, ruleBlock('right'), O)).toBe('orphan');
    expect(ruleRefusal(R, { newRule: true }, ruleBlock('right'), O)).toBe('orphan');
    const full = addAction(R, 0, 1, 'right');
    expect(ruleRefusal(full, { rule: 0, at: 2 }, ruleBlock('up'), O)).toBe('full');
    expect(ruleRefusal(full, { rule: 1, at: 0 }, ruleBlock('up'), O)).toBeNull();
  });

  it('drops: palette to card adds, card to card moves, out of the notebook removes (a hat takes its card)', () => {
    const add = resolveRuleDrop(R, { from: 'palette', block: ruleBlock('up') }, { rule: 1, at: 0 }, true, O);
    expect(add.outcome).toBe('add');
    expect(add.rules![1].actions).toEqual(['up']);
    const mv = resolveRuleDrop(R, { from: 'notebook', ref: { rule: 0, action: 0 }, block: ruleBlock('right') }, { rule: 1, at: 0 }, true, O);
    expect(mv.rules).toEqual([{ hat: 'key:right', actions: [] }, { hat: 'key:up', actions: ['right'] }]);
    expect(resolveRuleDrop(R, { from: 'notebook', ref: { rule: 0 }, block: ruleBlock('key:right') }, null, false, O).rules).toEqual([R[1]]);
    expect(resolveRuleDrop(R, { from: 'notebook', ref: { rule: 0, action: 0 }, block: ruleBlock('right') }, null, false, O).rules![0].actions).toEqual([]);
    const orphan = resolveRuleDrop(R, { from: 'palette', block: ruleBlock('left') }, null, true, O);
    expect(orphan).toMatchObject({ outcome: 'rejected', reason: 'orphan' });
    const dup = resolveRuleDrop(R, { from: 'palette', block: ruleBlock('key:up') }, { newRule: true }, true, O);
    expect(dup).toMatchObject({ outcome: 'rejected', reason: 'dup', rule: 1 });
  });

  it('removing a card removes its actions with it', () => {
    expect(removeRef(R, { rule: 0 })).toEqual([R[1]]);
  });
});

describe('rule cards: layout', () => {
  it('cards flow into two columns, the new card goes where there is room, and an empty card shows its free line', () => {
    const l = layoutRules(R, { maxActions: 2, maxRules: 4 });
    expect(l.cards).toHaveLength(2);
    expect(l.cards[0].x).toBe(0);
    expect(l.cards[1].x).toBeGreaterThan(0);
    expect(l.cards[0].slot).toBeNull();
    expect(l.cards[1].slot).not.toBeNull();
    expect(l.fresh).not.toBeNull();
    expect(layoutRules(addRule(addRule(R, 'key:left'), 'key:down'), O).fresh).toBeNull();
  });

  it('an action dropped over a card lands on the line under the pointer', () => {
    const l = layoutRules(R, { maxActions: 2, maxRules: 4, showSlots: true });
    const c = l.cards[0];
    expect(ruleTargetAt(l, c.x + 20, c.actions[0].y + 5, ruleBlock('up'))).toEqual({ rule: 0, at: 0 });
    expect(ruleTargetAt(l, c.x + 20, c.slot!.y + 20, ruleBlock('up'))).toEqual({ rule: 0, at: 1 });
    expect(ruleTargetAt(l, 5000, 5000, ruleBlock('up'))).toBeNull();
    expect(ruleTargetAt(l, 5000, 5000, ruleBlock('key:left'))).toEqual({ newRule: true });
  });
});
