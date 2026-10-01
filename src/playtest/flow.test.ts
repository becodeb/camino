import { describe, expect, it } from 'vitest';
import { BUDGET_MS, STEPS, canOpenSurvey, initialFlow, reduce, routeComplete, stepAfter, timeOnStep, wrapPending, wrapTarget, type FlowAction, type FlowState } from './flow';

const walk = (state: FlowState, n: number, t0 = 0) => {
  let s = state;
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'next' }, t0 + (i + 1) * 1000).state;
  return s;
};
const act = (s: FlowState, a: FlowAction, t = 1) => reduce(s, a, t);

describe('the playtest flow', () => {
  it('walks the core route, marks it done when the wardrobe is left, and goes back to free play for good', () => {
    const seen: string[] = [];
    let s = initialFlow(0);
    seen.push(s.step);
    let done = 0;
    for (let i = 1; i <= 7; i++) {
      const t = reduce(s, { type: 'next' }, i * 1000);
      if (t.routeDoneNow) done++;
      s = t.state;
      seen.push(s.step);
    }
    expect(seen).toEqual(['setup', 'character', 'tool_check', 'ladder', 'free_play', 'typing', 'wardrobe', 'free_play']);
    expect(done).toBe(1);
    expect(s.routeDone).toBe(true);
    // free play after the route has no end
    expect(reduce(s, { type: 'next' }, 99_000).change).toBeNull();
    // round 2: no code screen, no adult form step; the survey is not on the route
    expect(STEPS).not.toContain('code');
    expect(STEPS).not.toContain('adult_form');
    expect(seen).not.toContain('survey');
    expect(stepAfter('goodbye')).toBeNull();
    expect(stepAfter('class_end')).toBeNull();
  });

  it('the route is done only with every step of it visited (a skipped step counts: the adult chose)', () => {
    let s = walk(initialFlow(0), 3); // ladder
    s = act(s, { type: 'skip' }).state; // free play skipped by the adult
    expect(s.step).toBe('free_play');
    s = act(s, { type: 'skip' }).state; // typing
    s = act(s, { type: 'skip' }).state; // wardrobe
    expect(routeComplete(s)).toBe(true);
    const t = act(s, { type: 'next' });
    expect(t.routeDoneNow).toBe(true);
    // a session that jumped to the wardrobe (the demo's "Ir a…") without the typing game did not finish
    let d = walk(initialFlow(0), 2);
    d = act(d, { type: 'goto', to: 'wardrobe' }).state;
    const td = act(d, { type: 'next' });
    expect(td.state.step).toBe('free_play');
    expect(td.routeDoneNow).toBeFalsy();
    expect(td.state.routeDone).toBeFalsy();
  });

  it('reports each change with the time spent and the step budget', () => {
    const s1 = reduce(initialFlow(0), { type: 'next' }, 0).state; // character
    const t = reduce(s1, { type: 'next' }, 70_000);
    expect(t.state.step).toBe('tool_check');
    expect(t.change).toEqual({ from: 'character', to: 'tool_check', reason: 'next', time_ms: 70_000, budget_ms: BUDGET_MS.character, over_budget: true });
    expect(t.state.visits.at(-2)).toMatchObject({ step: 'character', left: 70_000, how: 'next' });
    expect(timeOnStep(t.state, 75_000)).toBe(5_000);
  });

  it('skips a child step but never the setup', () => {
    const s0 = initialFlow(0);
    expect(reduce(s0, { type: 'skip' }, 1).change).toBeNull();
    const onCharacter = walk(s0, 1);
    expect(onCharacter.step).toBe('character');
    const t = reduce(onCharacter, { type: 'skip' }, 10_000);
    expect(t.state.step).toBe('tool_check');
    expect(t.change?.reason).toBe('skip');
  });

  it('"end now" jumps from any child step to the survey (the goodbye when it was done), once', () => {
    const onLadder = walk(initialFlow(0), 3);
    expect(onLadder.step).toBe('ladder');
    const t = reduce(onLadder, { type: 'end_now' }, 50_000);
    expect(t.state.step).toBe('survey');
    expect(t.state.endedEarly).toBe(true);
    expect(t.change).toMatchObject({ from: 'ladder', to: 'survey', reason: 'end_now' });
    expect(reduce(t.state, { type: 'next' }, 60_000).state.step).toBe('goodbye');
    // already on the survey, the goodbye, or still on the setup: nothing to end
    expect(reduce(t.state, { type: 'end_now' }, 60_000).change).toBeNull();
    expect(reduce(initialFlow(0), { type: 'end_now' }, 1).change).toBeNull();
    // after the survey was done: straight to the goodbye
    let s = walk(initialFlow(0), 7); // free play, route done
    s = act(s, { type: 'survey' }).state;
    s = act(s, { type: 'next' }).state;
    expect(s).toMatchObject({ step: 'free_play', surveyDone: true });
    expect(act(s, { type: 'end_now' }).state.step).toBe('goodbye');
  });

  it('the adult opens the survey; answered, it is done and the child returns to free play; skipped, it is not done', () => {
    const fp = walk(initialFlow(0), 7);
    const t = act(fp, { type: 'survey' });
    expect(t.change).toMatchObject({ from: 'free_play', to: 'survey', reason: 'adult' });
    const back = act(t.state, { type: 'next' }).state;
    expect(back).toMatchObject({ step: 'free_play', surveyDone: true });
    expect(canOpenSurvey(back)).toBe(false);
    expect(act(back, { type: 'survey' }).change).toBeNull();
    const skipped = act(t.state, { type: 'skip' }).state;
    expect(skipped.step).toBe('free_play');
    expect(skipped.surveyDone).toBeFalsy();
    expect(canOpenSurvey(skipped)).toBe(true);
    // also before the route is done (the adult's call): back to free play after it
    const ladder = walk(initialFlow(0), 3);
    const early = act(act(ladder, { type: 'survey' }).state, { type: 'next' }).state;
    expect(early.step).toBe('free_play');
    expect(canOpenSurvey(initialFlow(0))).toBe(false);
  });

  it('"quedan 5 minutos": the step ends, then the wardrobe, the survey and free play; a cancel restores the route', () => {
    const ladder = walk(initialFlow(0), 3);
    const on = act(ladder, { type: 'wrap_up', on: true }).state;
    expect(wrapPending(on)).toBe(true);
    expect(wrapTarget(on)).toBe('wardrobe');
    const w = act(on, { type: 'next' });
    expect(w.change).toMatchObject({ from: 'ladder', to: 'wardrobe', wrap_up: true });
    const sv = act(w.state, { type: 'next' }).state;
    expect(sv.step).toBe('survey');
    const fp = act(sv, { type: 'next' }).state;
    expect(fp).toMatchObject({ step: 'free_play', surveyDone: true });
    expect(fp.routeDone).toBeFalsy();
    expect(wrapPending(fp)).toBe(false);
    expect(act(fp, { type: 'next' }).change).toBeNull();
    // already in free play after the route with the survey done: nothing to do
    let done = walk(initialFlow(0), 7);
    done = act(act(done, { type: 'survey' }).state, { type: 'next' }).state;
    expect(wrapPending(act(done, { type: 'wrap_up', on: true }).state)).toBe(false);
    // in the wardrobe with the whole route behind: the route is still done on the way to the survey
    const ward = act(walk(initialFlow(0), 6), { type: 'wrap_up', on: true }).state;
    const t = act(ward, { type: 'next' });
    expect(t.state.step).toBe('survey');
    expect(t.routeDoneNow).toBe(true);
    // cancelled before the item ended: the ladder goes on to free play as usual
    const off = act(on, { type: 'wrap_up', on: false }).state;
    expect(act(off, { type: 'next' }).state.step).toBe('free_play');
    expect(act(off, { type: 'wrap_up', on: false }).change).toBeNull();
  });

  it('"terminar la clase" goes to the class-end screen from any step of a session, once', () => {
    const typing = walk(initialFlow(0), 5);
    const t = act(typing, { type: 'class_end' });
    expect(t.change).toMatchObject({ from: 'typing', to: 'class_end', reason: 'class_end' });
    expect(act(t.state, { type: 'class_end' }).change).toBeNull();
    expect(act(t.state, { type: 'next' }).change).toBeNull();
    expect(act(initialFlow(0), { type: 'class_end' }).change).toBeNull();
    const bye = act(act(walk(initialFlow(0), 3), { type: 'end_now' }).state, { type: 'next' }).state;
    expect(act(bye, { type: 'class_end' }).state.step).toBe('class_end');
  });

  it('the demo jumps: any step, and "mostrar que terminó"', () => {
    const s = walk(initialFlow(0), 1);
    const t = act(s, { type: 'goto', to: 'typing' });
    expect(t.change).toMatchObject({ from: 'character', to: 'typing', reason: 'demo' });
    const d = act(t.state, { type: 'route_done' });
    expect(d.routeDoneNow).toBe(true);
    expect(d.state).toMatchObject({ step: 'free_play', routeDone: true });
    expect(act(d.state, { type: 'route_done' }).change).toBeNull();
    expect(act(s, { type: 'goto', to: 'setup' }).change).toBeNull();
  });

  it('keeps the activities done once each, in order', () => {
    let s = initialFlow(0);
    for (const a of ['character', 'ladder', 'character', 'recess']) s = reduce(s, { type: 'did', activity: a }, 1).state;
    expect(s.activities).toEqual(['character', 'ladder', 'recess']);
  });
});
