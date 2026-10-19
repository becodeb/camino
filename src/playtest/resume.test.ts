import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialFlow, reduce, type FlowState } from './flow';
import {
  pickResume, rememberFlow, rememberPart, rememberProgress, resetResumeForTests, RESUME_KEY, RESUME_MAX_AGE_MS,
  resumedPart, takeResume,
} from './resume';

function fakeStorage() {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
}

/** The flow walked `n` steps from the setup. */
function walked(n: number, t0 = 1000): FlowState {
  let f = initialFlow(t0);
  for (let i = 0; i < n; i++) f = reduce(f, { type: 'next' }, t0 + (i + 1) * 1000).state;
  return f;
}

describe('resume after a reload', () => {
  let st: ReturnType<typeof fakeStorage>;
  beforeEach(() => { st = fakeStorage(); resetResumeForTests(st); });

  it('carries on the queue\'s current session on the step it was on, with its progress and parts', () => {
    const ladder = walked(3); // setup → character → tool_check → ladder
    rememberFlow('s1', ladder, 10_000);
    rememberProgress('{"seeds":3}', 11_000);
    rememberPart('ladder', { items: [1] }, 12_000);
    resetResumeForTests(st); // the reload: a fresh page with the same tab storage
    const r = takeResume('s1', 20_000)!;
    expect(r.flow.step).toBe('ladder');
    expect(r.flow.visits).toEqual(ladder.visits);
    expect(r.progress).toBe('{"seeds":3}');
    expect(resumedPart('ladder')).toEqual({ items: [1] });
  });

  it('T39: keeps 4to\'s own route and its open Arcade (the Workshop or the Arcade step resumes as such)', () => {
    let f = reduce(initialFlow(1000), { type: 'next', grade: 4, nameOn: true }, 2000).state;
    for (let i = 0; i < 4; i++) f = reduce(f, { type: 'next' }, 3000 + i * 1000).state;
    f = reduce(f, { type: 'arcade_open', via: 'workshop' }, 9000).state;
    expect(f).toMatchObject({ step: 'workshop', route: '4to', arcadeOpen: true, routeDone: true });
    rememberFlow('s4', f, 10_000);
    resetResumeForTests(st);
    const r = takeResume('s4', 20_000)!;
    expect(r.flow).toMatchObject({ step: 'workshop', route: '4to', arcadeOpen: true, routeDone: true });
    // another grade's flow never gains a route
    rememberFlow('s5', walked(3), 21_000);
    resetResumeForTests(st);
    expect(takeResume('s5', 22_000)!.flow.route).toBeUndefined();
  });

  it('keeps the parts while the step stays, forgets them when it changes', () => {
    const f = walked(3);
    rememberFlow('s1', f, 1);
    rememberPart('ladder', { a: 1 }, 2);
    rememberFlow('s1', reduce(f, { type: 'did', activity: 'ladder' }, 3).state, 3);
    expect(JSON.parse(st.m.get(RESUME_KEY)!).parts).toEqual({ ladder: { a: 1 } });
    rememberFlow('s1', reduce(f, { type: 'next' }, 4).state, 4);
    expect(JSON.parse(st.m.get(RESUME_KEY)!).parts).toEqual({});
  });

  it('a resumed step\'s parts are gone once the flow moves on', () => {
    const f = walked(4);
    rememberFlow('s1', f, 1);
    rememberPart('free_play', { visits: 2 }, 2);
    resetResumeForTests(st);
    takeResume('s1', 3);
    expect(resumedPart('free_play')).toEqual({ visits: 2 });
    rememberFlow('s1', reduce(f, { type: 'next' }, 4).state, 4);
    expect(resumedPart('free_play')).toBeUndefined();
  });

  it('starts fresh for another session, the setup, a stale or broken save', () => {
    rememberFlow('s1', walked(2), 1000);
    const raw = st.m.get(RESUME_KEY)!;
    expect(pickResume(raw, 's1', 2000)?.flow.step).toBe('tool_check');
    expect(pickResume(raw, 's2', 2000)).toBeNull();
    expect(pickResume(raw, null, 2000)).toBeNull();
    expect(pickResume(raw, 's1', 1000 + RESUME_MAX_AGE_MS + 1)).toBeNull();
    expect(pickResume('{nope', 's1', 2000)).toBeNull();
    expect(pickResume(JSON.stringify({ ...JSON.parse(raw), flow: { step: 'lost', visits: [], activities: [] } }), 's1', 2000)).toBeNull();
    // a tab saved by round 1 on its code screen: a step that no longer exists starts fresh
    expect(pickResume(JSON.stringify({ ...JSON.parse(raw), flow: { ...JSON.parse(raw).flow, step: 'code' } }), 's1', 2000)).toBeNull();
    rememberFlow('s1', initialFlow(3000), 3000);
    expect(st.m.has(RESUME_KEY)).toBe(false);
  });

  it('a new session does not inherit the last one\'s progress or parts', () => {
    rememberFlow('s1', walked(5), 1);
    rememberProgress('{"seeds":9}', 2);
    rememberPart('free_play', { visits: 3 }, 3);
    rememberFlow('s2', walked(1), 4);
    const saved = JSON.parse(st.m.get(RESUME_KEY)!);
    expect(saved.sid).toBe('s2');
    expect(saved.progress).toBeNull();
    expect(saved.parts).toEqual({});
  });

  it('takeResume forgets a save it will not use', () => {
    rememberFlow('s1', walked(3), 1);
    resetResumeForTests(st);
    expect(takeResume('other', 2)).toBeNull();
    expect(st.m.has(RESUME_KEY)).toBe(false);
  });

  it('T28: never resumes into class_end (opening the bookmark or reloading there always starts fresh)', () => {
    rememberFlow('s1', walked(2), 1000);
    const raw = st.m.get(RESUME_KEY)!;
    const atClassEnd = JSON.stringify({ ...JSON.parse(raw), flow: { ...JSON.parse(raw).flow, step: 'class_end' } });
    expect(pickResume(atClassEnd, 's1', 2000)).toBeNull();
  });

  it('works with no storage at all', () => {
    resetResumeForTests(null);
    rememberFlow('s1', walked(3), 1);
    rememberPart('x', 1, 2);
    expect(takeResume('s1', 3)).toBeNull();
  });
});

describe('T29: a closed tab (not just a reload) still resumes', () => {
  const fakeGlobalStorage = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m };
  };
  let fakeLocal: ReturnType<typeof fakeGlobalStorage>;
  let fakeSession: ReturnType<typeof fakeGlobalStorage>;
  beforeEach(() => {
    vi.resetModules();
    fakeLocal = fakeGlobalStorage();
    fakeSession = fakeGlobalStorage();
    vi.stubGlobal('localStorage', fakeLocal);
    vi.stubGlobal('sessionStorage', fakeSession);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('saves to localStorage, not sessionStorage (a fresh module instance, so it really probes the global itself)', async () => {
    const mod = await import('./resume');
    mod.rememberFlow('s1', walked(2), 1000);
    expect(fakeLocal.m.has(mod.RESUME_KEY)).toBe(true);
    expect(fakeSession.m.has(mod.RESUME_KEY)).toBe(false);
  });

  it('a reload of a DIFFERENT tab (a fresh module instance, same device, same global localStorage) still resumes the saved session', async () => {
    const tab1 = await import('./resume');
    tab1.rememberFlow('s1', walked(3), 1000); // setup → character → tool_check → ladder
    vi.resetModules();
    const tab2 = await import('./resume');
    const r = tab2.takeResume('s1', 2000)!;
    expect(r.flow.step).toBe('ladder');
  });
});
