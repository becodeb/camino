import { beforeEach, describe, expect, it } from 'vitest';
import { newProject } from './game';
import {
  challengePayload, coreDone, EditBatch, endPayload, finishCurrent, freeCount, initialProgress, LAST_CORE, solvedCount, solveFree, stripOf, withRec,
} from './progress';
import { loadWorkshop, saveBest, saveWorkshop, setWorkshopStorageForTests, WORKSHOP_KEY } from './store';

describe('the challenges\' progress', () => {
  it('opens challenge 1 on its card', () => {
    const p = initialProgress(1000);
    expect(p).toMatchObject({ current: 1, phase: 'card', arcade: false, best: 0 });
    expect(p.recs[1]).toMatchObject({ n: 1, startedAt: 1000, runs: 0, attempts: 0, help: 0 });
  });
  it('a solved challenge keeps its time and opens the next one on its card; the Arcade after 5; the free challenges after 7', () => {
    let p = initialProgress(0);
    p = withRec(p, 1, (r) => ({ ...r, runs: 2, attempts: 1 }));
    p = finishCurrent(p, 'solved', 5000);
    expect(p.recs[1]).toMatchObject({ solved: true, ms: 5000, runs: 2, attempts: 1 });
    expect(p).toMatchObject({ current: 2, phase: 'card' });
    expect(p.recs[2].startedAt).toBe(5000);
    for (let n = 2; n <= 4; n++) p = finishCurrent(p, n === 3 ? 'skipped' : 'solved', 5000 + n * 1000);
    expect(p.arcade).toBe(false);
    p = finishCurrent(p, 'solved', 20_000);
    expect(p.arcade).toBe(true);
    p = finishCurrent(p, 'solved', 21_000);
    expect(coreDone(p)).toBe(false);
    p = finishCurrent(p, 'solved', 22_000, 'scripts-at-7');
    expect(p).toMatchObject({ current: LAST_CORE + 1, phase: 'free', baseline: 'scripts-at-7' });
    expect(coreDone(p)).toBe(true);
    expect(solvedCount(p)).toBe(6);
    expect(stripOf(p).map((s) => s.state)).toEqual(['solved', 'solved', 'skipped', 'solved', 'solved', 'solved', 'solved']);
  });
  it('the strip marks the open challenge and those still ahead', () => {
    const p = finishCurrent(initialProgress(0), 'solved', 1);
    expect(stripOf(p).slice(0, 3).map((s) => s.state)).toEqual(['solved', 'here', 'todo']);
  });
  it('free challenges are starred once each, in any order', () => {
    let p = initialProgress(0);
    p = solveFree(solveFree(solveFree(p, 11), 9), 11);
    expect(freeCount(p)).toBe(2);
  });
});

describe('telemetry payloads', () => {
  it('workshop_challenge carries the help level, runs, failed checks, time and the PRIMM answers', () => {
    let p = initialProgress(0);
    p = withRec(p, 1, (r) => ({ ...r, help: 2, runs: 3, attempts: 1, predict: { choice: 'leaves', correct: false } }));
    expect(challengePayload(p, 1, 'predict', 4000)).toEqual({ n: 1, phase: 'predict', attempts: 1, help_level: 2, runs: 3, ms: 4000, predict_choice: 'leaves', predict_correct: false });
    expect(challengePayload(p, 1, 'start', 4000).ms).toBe(0);
    p = finishCurrent(p, 'solved', 9000);
    p = withRec(p, 2, (r) => ({ ...r, investigate: { op: 'setY', correct: true } }));
    expect(challengePayload(p, 1, 'solved', 12_000)).toMatchObject({ phase: 'solved', ms: 9000 });
    expect(challengePayload(p, 2, 'investigate', 12_000)).toMatchObject({ investigate_block: 'setY', investigate_correct: true });
    expect(challengePayload(p, 10, 'solved', 1)).toMatchObject({ n: 10, free: true });
  });
  it('workshop_end sums up the Workshop', () => {
    const p = finishCurrent(initialProgress(0), 'solved', 10);
    expect(endPayload(p, 60_000)).toEqual({ challenges_solved: 1, challenges_skipped: 0, free_challenges: 0, current: 2, arcade: false, best: 0, ms: 60_000 });
  });
  it('edits are batched: one payload per take, with counts, blocks and sprites, then empty', () => {
    const b = new EditBatch();
    expect(b.take(1)).toBeNull();
    b.add({ action: 'add', op: 'flag', sprite: 'floor', stack_size: 1 }, 'Suelo');
    b.add({ action: 'add', op: 'forever', sprite: 'floor', stack_size: 1 }, 'Suelo');
    b.add({ action: 'move', op: 'flag', sprite: 'floor', stack_size: 5 }, 'Suelo');
    b.add({ action: 'delete', op: 'setY', sprite: 'player', stack_size: 1 }, 'Personaje');
    expect(b.size).toBe(4);
    expect(b.take(2)).toEqual({
      n: 2, edits: 4, counts: { add: 2, move: 1, delete: 1 }, ops: { add: { flag: 1, forever: 1 }, move: { flag: 1 }, delete: { setY: 1 } },
      sprites: { Suelo: 3, Personaje: 1 }, max_stack: 5,
    });
    expect(b.take(2)).toBeNull();
  });
});

describe('the save (device storage, by session)', () => {
  let mem: Map<string, string>;
  beforeEach(() => {
    mem = new Map();
    setWorkshopStorageForTests({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) });
  });
  it('keeps the project and the progress for the same session only', () => {
    const project = newProject();
    const progress = finishCurrent(initialProgress(0), 'solved', 5);
    saveWorkshop({ sid: 's1', project, progress }, 100);
    expect(loadWorkshop('s1')).toMatchObject({ v: 1, sid: 's1', at: 100, progress: { current: 2 } });
    expect(loadWorkshop('s1')!.project.sprites).toHaveLength(project.sprites.length);
    expect(loadWorkshop('s2')).toBeNull();
    expect(loadWorkshop(null)).toBeNull();
  });
  it('a broken or foreign save is ignored', () => {
    mem.set(WORKSHOP_KEY, '{not json');
    expect(loadWorkshop('s1')).toBeNull();
    mem.set(WORKSHOP_KEY, JSON.stringify({ v: 2, sid: 's1' }));
    expect(loadWorkshop('s1')).toBeNull();
  });
  it('the best score only goes up', () => {
    saveWorkshop({ sid: 's1', project: newProject(), progress: initialProgress(0) });
    expect(saveBest('s1', 7)).toBe(7);
    expect(saveBest('s1', 3)).toBe(7);
    expect(loadWorkshop('s1')!.progress.best).toBe(7);
  });
  it('storage that throws never breaks the Workshop', () => {
    setWorkshopStorageForTests({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => {} });
    expect(() => saveWorkshop({ sid: 's1', project: newProject(), progress: initialProgress(0) })).not.toThrow();
    expect(loadWorkshop('s1')).toBeNull();
  });
});
