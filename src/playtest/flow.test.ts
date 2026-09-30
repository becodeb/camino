import { describe, expect, it } from 'vitest';
import { BUDGET_MS, STEPS, initialFlow, reduce, stepAfter, timeOnStep, type FlowState } from './flow';

const walk = (state: FlowState, n: number, t0 = 0) => {
  let s = state;
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'next' }, t0 + (i + 1) * 1000).state;
  return s;
};

describe('the playtest flow', () => {
  it('starts on the adult setup and walks every step in order', () => {
    const s0 = initialFlow(0);
    expect(s0.step).toBe('setup');
    const seen = [s0.step];
    let s = s0;
    for (let i = 1; i < STEPS.length; i++) {
      s = reduce(s, { type: 'next' }, i * 1000).state;
      seen.push(s.step);
    }
    expect(seen).toEqual([...STEPS]);
    // the adult form is the last step: next goes nowhere
    expect(reduce(s, { type: 'next' }, 99_000).change).toBeNull();
    expect(stepAfter('adult_form')).toBeNull();
  });

  it('reports each change with the time spent and the step budget', () => {
    const s1 = reduce(initialFlow(0), { type: 'next' }, 0).state; // code
    const t = reduce(s1, { type: 'next' }, 70_000);
    expect(t.state.step).toBe('character');
    expect(t.change).toEqual({ from: 'code', to: 'character', reason: 'next', time_ms: 70_000, budget_ms: BUDGET_MS.code, over_budget: true });
    expect(t.state.visits.at(-2)).toMatchObject({ step: 'code', left: 70_000, how: 'next' });
    expect(timeOnStep(t.state, 75_000)).toBe(5_000);
  });

  it('skips a child step but never the setup or the code', () => {
    const s0 = initialFlow(0);
    expect(reduce(s0, { type: 'skip' }, 1).change).toBeNull();
    const onCharacter = walk(s0, 2);
    expect(onCharacter.step).toBe('character');
    const t = reduce(onCharacter, { type: 'skip' }, 10_000);
    expect(t.state.step).toBe('tool_check');
    expect(t.change?.reason).toBe('skip');
  });

  it('"end now" jumps from any child step to the survey, once', () => {
    const onLadder = walk(initialFlow(0), 4);
    expect(onLadder.step).toBe('ladder');
    const t = reduce(onLadder, { type: 'end_now' }, 50_000);
    expect(t.state.step).toBe('survey');
    expect(t.state.endedEarly).toBe(true);
    expect(t.change).toMatchObject({ from: 'ladder', to: 'survey', reason: 'end_now' });
    // already on the survey, the goodbye, the adult form, or still on the setup: nothing to end
    expect(reduce(t.state, { type: 'end_now' }, 60_000).change).toBeNull();
    expect(reduce(initialFlow(0), { type: 'end_now' }, 1).change).toBeNull();
  });

  it('keeps the activities done once each, in order', () => {
    let s = initialFlow(0);
    for (const a of ['character', 'ladder', 'character', 'recess']) s = reduce(s, { type: 'did', activity: a }, 1).state;
    expect(s.activities).toEqual(['character', 'ladder', 'recess']);
  });
});
