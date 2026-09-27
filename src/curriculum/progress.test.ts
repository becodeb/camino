import { describe, expect, it } from 'vitest';
import { DOORS, bossId, coreId, extraId, isBuilt } from './model';
import { PRIMER, sheetByN } from './primer';
import { EMPTY, STORAGE_KEY, createProgressStore, earnGold, grant, openSheet, parse, sheetState, solve, type Backing } from './progress';

/** An in-memory Web Storage; `broken` throws on every call, like blocked site data. */
function fakeStorage(broken = false): Backing & { data: Map<string, string> } {
  const data = new Map<string, string>();
  const guard = () => { if (broken) throw new Error('SecurityError'); };
  return {
    data,
    getItem: (k) => { guard(); return data.get(k) ?? null; },
    setItem: (k, v) => { guard(); data.set(k, v); },
    removeItem: (k) => { guard(); data.delete(k); },
  };
}

describe('the year of 1ro', () => {
  it('has 17 sheets numbered 1 to 17, forest then river', () => {
    expect(PRIMER.map((s) => s.n)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
    expect(PRIMER.filter((s) => s.zone === 'bosque').map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(sheetByN(7)?.kind).toBe('taller');
    expect(sheetByN(17)?.kind).toBe('muestra');
    for (const s of PRIMER) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.say.length).toBeGreaterThan(0);
    }
  });

  it('every built sheet has extras for the three doors', () => {
    for (const s of PRIMER.filter(isBuilt)) for (const d of DOORS) expect(s.extras?.[d]).toBeDefined();
  });
});

describe('progress transitions', () => {
  it('a first solve earns one seed, a second one nothing', () => {
    const a = solve(EMPTY, 'x');
    expect(a.seeds).toBe(1);
    expect(a.solved.x).toBe(true);
    expect(solve(a, 'x')).toBe(a);
    expect(solve(a, 'y').seeds).toBe(2);
    expect(EMPTY.seeds).toBe(0);
  });

  it('grants seeds (never below zero) and clamps the opened sheet', () => {
    expect(grant(EMPTY, 5).seeds).toBe(5);
    expect(grant(grant(EMPTY, 2), -9).seeds).toBe(0);
    expect(openSheet(EMPTY, 40).opened).toBe(17);
    expect(openSheet(EMPTY, 0).opened).toBe(1);
  });

  it('parses stored values, and anything broken or from another version is a fresh start', () => {
    const p = openSheet(solve(EMPTY, 'a'), 4);
    expect(parse(JSON.stringify(p))).toEqual(p);
    expect(parse(null)).toBe(EMPTY);
    expect(parse('{not json')).toBe(EMPTY);
    expect(parse(JSON.stringify({ v: 2, seeds: 9 }))).toBe(EMPTY);
    expect(parse(JSON.stringify({ v: 1, solved: { a: true, b: true } })).seeds).toBe(2);
  });

  it('a gold stamp is kept apart from the seeds, and solves its page if it was not yet', () => {
    const a = earnGold(solve(EMPTY, '1ro-h11-1'), '1ro-h11-1');
    expect(a.gold['1ro-h11-1']).toBe(true);
    expect(a.seeds).toBe(1);
    expect(earnGold(a, '1ro-h11-1')).toBe(a);
    const b = earnGold(EMPTY, '1ro-h11-2');
    expect(b.solved['1ro-h11-2']).toBe(true);
    expect(b.seeds).toBe(1);
    expect(sheetState(PRIMER[10], earnGold(b, '1ro-h11-jefe')).gold).toBe(2);
    expect(sheetState(PRIMER[0], b).gold).toBe(0); // sheet 1 is not sheet 11
    expect(parse(JSON.stringify(a))).toEqual(a);
    // stored before gold stamps existed
    expect(parse(JSON.stringify({ v: 1, solved: { a: true }, seeds: 1 })).gold).toEqual({});
  });

  it('a sheet is complete (stamped) when every core level is solved', () => {
    const s = { ...PRIMER[0], core: [{ level: {} as never, essential: true }, { level: {} as never }] };
    let p = solve(EMPTY, coreId(s, 1));
    let st = sheetState(s, p);
    expect([st.coreSolved, st.essentialSolved, st.essentialTotal, st.complete]).toEqual([1, 1, 1, false]);
    p = solve(solve(solve(p, coreId(s, 2)), extraId(s, 'medium', 1)), extraId(s, 'medium', 2));
    st = sheetState(s, solve(p, bossId(s)));
    expect(st.complete).toBe(true);
    expect(st.bossSolved).toBe(true);
    expect(st.extras).toEqual({ easy: 0, medium: 2, hard: 0 });
    expect(st.gold).toBe(0);
  });
});

describe('the progress store', () => {
  it('saves under a versioned key and reloads it', () => {
    const disk = fakeStorage();
    const a = createProgressStore(disk);
    a.update((p) => solve(p, 'l1'));
    expect(JSON.parse(disk.data.get(STORAGE_KEY)!).v).toBe(1);
    const b = createProgressStore(disk);
    expect(b.get().solved.l1).toBe(true);
    expect(b.get().seeds).toBe(1);
  });

  it('notifies subscribers and forgets everything on reset', () => {
    const disk = fakeStorage();
    const s = createProgressStore(disk);
    let calls = 0;
    const off = s.subscribe(() => calls++);
    s.update((p) => grant(p, 3));
    s.reset();
    off();
    s.update((p) => grant(p, 1));
    expect(calls).toBe(2);
    expect(createProgressStore(disk).get().seeds).toBe(1);
  });

  it('works in memory when storage throws or does not exist', () => {
    for (const backing of [fakeStorage(true), null]) {
      const s = createProgressStore(backing);
      expect(s.get()).toBe(EMPTY);
      s.update((p) => solve(p, 'l1'));
      expect(s.get().seeds).toBe(1);
      s.reset();
      expect(s.get()).toBe(EMPTY);
    }
  });
});
