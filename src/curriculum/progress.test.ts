import { describe, expect, it } from 'vitest';
import { EXAMPLES } from './classmates';
import { DOORS, bossId, coreId, extraId, goalId, hasCore } from './model';
import { PRIMER, sheetByN } from './primer';
import {
  EMPTY, STORAGE_KEY, clearMade, createProgressStore, earnGold, grant, openSheet, parse, played, publish, reachGoal, saveDraft, sheetState, solve,
  type Backing, type Progress,
} from './progress';
import { cardLevelId, defaultDraft, nextMadeId, type MadeLevel } from './workshop';

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

  it('every sheet of pages has extras for the three doors', () => {
    for (const s of PRIMER.filter(hasCore)) for (const d of DOORS) expect(s.extras?.[d]).toBeDefined();
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
      s.update((p) => publish(p, made('yo-1', 7)));
      expect(s.get().made).toHaveLength(1);
      s.reset();
      expect(s.get()).toBe(EMPTY);
    }
  });

  it('swaps onto another storage without reading or writing the first key (the pilot playtest)', () => {
    const disk = fakeStorage();
    disk.data.set(STORAGE_KEY, JSON.stringify({ ...EMPTY, seeds: 7 }));
    const reads: string[] = [];
    const spy = { ...disk, getItem: (k: string) => { reads.push(k); return disk.getItem(k); } };
    const s = createProgressStore(spy);
    const memory = fakeStorage();
    let calls = 0;
    s.subscribe(() => calls++);
    s.swap(memory, 'pilot');
    expect(s.get().seeds).toBe(0);
    s.update((p) => grant(p, 2));
    expect(reads).not.toContain(STORAGE_KEY);
    expect(JSON.parse(disk.data.get(STORAGE_KEY)!).seeds).toBe(7);
    expect(JSON.parse(memory.data.get('pilot')!).seeds).toBe(2);
    s.reset();
    expect(s.get()).toBe(EMPTY);
    // back to the demo's key: its progress is there, untouched
    s.swap(spy);
    expect(s.get().seeds).toBe(7);
    expect(calls).toBeGreaterThanOrEqual(3);
  });
});

/** A level made on this device in workshop `sheet`, from its default board. */
const made = (id: string, sheet: number): MadeLevel => ({
  id, sheet, board: defaultDraft(sheet === 15).board, lines: sheet === 15 ? 2 : 5,
  solution: sheet === 15 ? [{ t: 'loop', count: 5, body: ['right'] }] : Array.from({ length: 5 }, () => ({ t: 'cmd' as const, cmd: 'right' })),
});
const W7 = sheetByN(7)!, W15 = sheetByN(15)!, HUB = sheetByN(16)!;
const example = (limited: boolean) => EXAMPLES.find((e) => (e.sheet === 15) === limited)!;

describe('the workshops in the progress', () => {
  it('a draft is kept per workshop, and pinning its level starts a new one', () => {
    let p = saveDraft(EMPTY, 7, { ...defaultDraft(false), proof: [] });
    p = saveDraft(p, 15, defaultDraft(true));
    expect(Object.keys(p.drafts).sort()).toEqual(['15', '7']);
    p = publish(p, made('yo-1', 7));
    expect(p.made.map((m) => m.id)).toEqual(['yo-1']);
    expect(p.drafts['7']).toBeUndefined();
    expect(p.drafts['15']).toEqual(defaultDraft(true));
    expect(publish(p, made('yo-1', 7))).toBe(p); // the same card twice: nothing
    expect(saveDraft(p, 15, null).drafts).toEqual({});
  });

  it('counts the plays of a card, each win', () => {
    const p = played(played(played(EMPTY, 'ej-1'), 'ej-1'), 'yo-2');
    expect(p.plays).toEqual({ 'ej-1': 2, 'yo-2': 1 });
  });

  it('a workshop is done when one of its levels is pinned and a classmate\'s level was played', () => {
    let p = publish(EMPTY, made('yo-1', 7));
    expect(sheetState(W7, p)).toMatchObject({ published: 1, playedOthers: false, complete: false });
    p = played(p, 'yo-1'); // playing one's own level does not count
    expect(sheetState(W7, p).complete).toBe(false);
    p = played(p, example(false).id);
    expect(sheetState(W7, p)).toMatchObject({ published: 1, playedOthers: true, complete: true });
    expect(sheetState(W15, p).complete).toBe(false); // nothing pinned from 15
  });

  it('the limited workshop needs a limited level pinned from it and a limited classmate\'s level played', () => {
    let p = played(publish(EMPTY, made('yo-1', 15)), example(false).id);
    expect(sheetState(W15, p)).toMatchObject({ published: 1, playedOthers: false, complete: false });
    p = played(p, example(true).id);
    expect(sheetState(W15, p).complete).toBe(true);
    expect(sheetState(W7, p)).toMatchObject({ published: 0, complete: false });
  });

  it('the comodín is done once one of its choices was played from it', () => {
    expect(sheetState(HUB, EMPTY).complete).toBe(false);
    const p = reachGoal(EMPTY, goalId(HUB, 'musica'));
    expect(sheetState(HUB, p)).toMatchObject({ goals: ['musica'], complete: true });
    expect(reachGoal(p, goalId(HUB, 'musica'))).toBe(p);
    expect(sheetState(W7, p).complete).toBe(false);
  });

  it('clearing the made levels forgets them, their plays and the drafts, not the seeds nor the classmates\' plays', () => {
    let p = solve(publish(EMPTY, made('yo-1', 7)), cardLevelId('yo-1'));
    p = played(played(saveDraft(p, 15, defaultDraft(true)), 'yo-1'), 'ej-2');
    const c = clearMade(p);
    expect(c.made).toEqual([]);
    expect(c.plays).toEqual({ 'ej-2': 1 });
    expect(c.drafts).toEqual({});
    expect(c.seeds).toBe(1);
    // a new level never takes the id of a cleared one
    expect(nextMadeId(c)).toBe('yo-2');
  });

  it('the store keeps made levels, plays, drafts and goals across a reload', () => {
    const disk = fakeStorage();
    const a = createProgressStore(disk);
    a.update((p) => reachGoal(played(saveDraft(publish(p, made('yo-1', 15)), 7, defaultDraft(false)), 'ej-5'), goalId(HUB, 'recuperar')));
    const b = createProgressStore(disk).get();
    expect(b.made).toEqual([made('yo-1', 15)]);
    expect(b.plays).toEqual({ 'ej-5': 1 });
    expect(b.drafts['7']).toEqual(defaultDraft(false));
    expect(b.goals).toEqual({ [goalId(HUB, 'recuperar')]: true });
  });

  it('stored values from before the workshops read as nothing made; broken entries are left out', () => {
    const old = parse(JSON.stringify({ v: 1, solved: { a: true }, seeds: 1, opened: 3 }));
    expect([old.made, old.plays, old.drafts, old.goals]).toEqual([[], {}, {}, {}]);
    const good = made('yo-1', 7);
    const raw: Partial<Record<keyof Progress, unknown>> = {
      v: 1, seeds: 2, opened: 7,
      made: [good, { ...good, id: 'yo-2', board: { ...good.board, rocks: [good.board.start] } }, { ...good, id: 'ej-9' }, 'nope', { ...good, id: 'yo-3', solution: [{ t: 'cmd', cmd: 'jump:right' }] }, good],
      plays: { 'ej-1': 3, 'ej-2': -1, 'ej-3': 'x', 'ej-4': 1.5 },
      drafts: { 7: defaultDraft(false), 15: { board: { start: [9, 9] }, lines: 2 }, 16: { ...defaultDraft(true), lines: 99 } },
      goals: { [goalId(HUB, 'musica')]: true },
    };
    const p = parse(JSON.stringify(raw));
    expect(p.made).toEqual([good]);
    expect(p.plays).toEqual({ 'ej-1': 3 });
    expect(p.drafts).toEqual({ 7: defaultDraft(false) });
    expect(p.goals).toEqual({ [goalId(HUB, 'musica')]: true });
    expect(parse(JSON.stringify(p))).toEqual(p);
  });
});
