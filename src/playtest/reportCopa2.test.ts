import { describe, expect, it } from 'vitest';
import {
  analyze, COPA2_UNDERSTANDING_RULE, copa2ChildReport, copa2Report, copa2Understanding, copaOfTrackId, gradeEvaluation,
  type PtEvent, type PtSession,
} from './report';

const ev = (session_id: string, seq: number, type: string, payload: Record<string, unknown> = {}, client_t?: string): PtEvent => ({ session_id, seq, type, payload, ...(client_t ? { client_t } : {}) });
const s4 = (id: string, over: Partial<PtSession> = {}): PtSession => ({ grade: 4, id, started_at: '2026-10-27T12:00:00.000Z', ended_at: '2026-10-27T12:40:00.000Z', ...over });

/** A tiny builder: one child's rows in order, seq numbered by itself. */
function rows(id: string) {
  let seq = 0;
  const out: PtEvent[] = [];
  const add = (type: string, payload: Record<string, unknown> = {}) => { out.push(ev(id, seq++, type, payload)); return api; };
  const api = {
    out,
    place: (start_copa: number, ceiling_rung: number | null = null) => add('garage_place', { start_copa, ceiling_rung, start_tier: 'bronze' }),
    copa: (copa: number) => add('garage_copa_start', { copa, via: 'next' }),
    run: (track: string, outcome: 'finish' | 'crash' | 'stuck' | 'timeout', extra: Record<string, unknown> = {}) =>
      add('garage_run', { track, run_n: 1, outcome, time_ms: 6000, blocks: 4, slots: 4, rival_tier: 'bronze', seed: 1, ...(outcome === 'finish' ? { place: 1 } : {}), ...extra }),
    ghost: (track: string, extra: Record<string, unknown> = {}) => add('garage_ghost', { track, failures: 2, ...extra }),
    deer: (copa: number, fixed: boolean, attempts = 2, extra: Record<string, unknown> = {}) => add('garage_debug', { copa, attempts, fixed, ms: 40_000, ...extra }),
    spy: (track: string, correct: boolean) => add('garage_spy', { track, rival: 'gold', tapped_block_kind: 'repeat', correct }),
    revancha: (track: string) => add('garage_revancha', { track, won: false, rival: 'silver' }),
    skip: (from_copa: number) => add('garage_skip', { from_copa, to_copa: from_copa + 1, track: `c${from_copa}-a`, place: 1, time_ms: 5000 }),
  };
  return api;
}

describe('copaOfTrackId', () => {
  it('reads the copa from a track id, and nothing from anything else', () => {
    expect(copaOfTrackId('c3-b')).toBe(3);
    expect(copaOfTrackId('c5-a')).toBe(5);
    expect(copaOfTrackId('c6-a')).toBeNull();
    expect(copaOfTrackId(undefined)).toBeNull();
    expect(copaOfTrackId('x')).toBeNull();
  });
});

describe('copa2ChildReport', () => {
  it('no Copa v2 rows at all: nothing reached', () => {
    const r = copa2ChildReport([]);
    expect(r).toMatchObject({ reached: false, startCopa: null, furthestCopa: null, conceptsReached: 0, understanding: 'copia_o_no_llego' });
    expect(r.concepts[1]).toMatchObject({ reached: false, own: null, spies: 0, skipped: false });
  });

  it('a clean child: placement, own tracks solved first try without the ghost hand, the deer fixed, the trick found → entiende', () => {
    const b = rows('a').place(2, 8);
    for (const copa of [2, 3, 4]) {
      b.copa(copa).deer(copa, true, 1).run(`c${copa}-a`, 'finish');
    }
    b.spy('c3-a', true);
    const r = copa2ChildReport(b.out);
    expect(r).toMatchObject({ startCopa: 2, ceilingRung: 8, furthestCopa: 4, conceptsReached: 3, conceptsCreated: 3, deerSeen: 3, deerFixed: 3, spies: 1, spiesCorrect: 1 });
    expect(r).toMatchObject({ reads: true, debugs: true, creates: true, understanding: 'entiende' });
    expect(r.concepts[3].own).toEqual({ track: 'c3-a', runs: 1, crashesBeforeSuccess: 0, solved: true, ghostUsed: false, solvedWithoutGhost: true, bestPlace: 1, revanchas: 0 });
    expect(r.concepts[1].reached).toBe(false); // placed past copa 1
  });

  it('crashes before the success are counted, and a ghost hand that turned on before it means the concept was shown, not made', () => {
    const b = rows('a').place(1).copa(1)
      .run('c1-a', 'crash', { crash_cause: 'wall' }).run('c1-a', 'stuck').ghost('c1-a').run('c1-a', 'finish', { place: 2 });
    const r = copa2ChildReport(b.out);
    expect(r.concepts[1].own).toMatchObject({ runs: 3, crashesBeforeSuccess: 2, solved: true, ghostUsed: true, solvedWithoutGhost: false, bestPlace: 2 });
    expect(r.conceptsCreated).toBe(0);
    expect(r.crashCauses).toEqual({ wall: 1, stuck: 1 });
  });

  it('an own track never solved: reached, not solved, every run counts as a failure', () => {
    const b = rows('a').place(1).copa(1).run('c1-a', 'crash', { crash_cause: 'no_ramp' }).run('c1-a', 'timeout');
    const r = copa2ChildReport(b.out);
    expect(r.concepts[1]).toMatchObject({ reached: true, own: { solved: false, crashesBeforeSuccess: 2, solvedWithoutGhost: false, bestPlace: null } });
    expect(r.crashCauses).toEqual({ no_ramp: 1, timeout: 1 });
  });

  it('the deer\'s runs are never the own track, and their crashes still count as crash causes', () => {
    const b = rows('a').place(2, 6).copa(2)
      .run('c2-a', 'crash', { deer: true, crash_cause: 'wall' }).run('c2-a', 'finish', { deer: true }).deer(2, true, 2)
      .run('c2-a', 'finish');
    const r = copa2ChildReport(b.out);
    expect(r.concepts[2].own).toMatchObject({ track: 'c2-a', runs: 1, crashesBeforeSuccess: 0, solvedWithoutGhost: true });
    expect(r.concepts[2].deer).toMatchObject({ seen: true, fixed: true, attempts: 2, ms: 40_000 });
    expect(r.crashCauses).toEqual({ wall: 1 });
  });

  it('a deer left unfinished (no summary row) is seen and not fixed; a deer never seen is neither', () => {
    const b = rows('a').place(2).copa(2).run('c2-a', 'crash', { deer: true, crash_cause: 'wall' });
    const r = copa2ChildReport(b.out);
    expect(r.concepts[2].deer).toMatchObject({ seen: true, fixed: false, attempts: 1 });
    expect(r.concepts[3].deer.seen).toBe(false);
    expect(r).toMatchObject({ deerSeen: 1, deerFixed: 0, debugs: false });
  });

  it('Espiá: right and wrong taps per copa, and the share decides `lee`', () => {
    const b = rows('a').place(3).spy('c3-a', true).spy('c3-b', false).spy('c4-a', false);
    const r = copa2ChildReport(b.out);
    expect(r.concepts[3]).toMatchObject({ spies: 2, spiesCorrect: 1 });
    expect(r.concepts[4]).toMatchObject({ spies: 1, spiesCorrect: 0 });
    expect(r).toMatchObject({ spies: 3, spiesCorrect: 1, reads: false });
    expect(copa2ChildReport(rows('a').spy('c3-a', true).spy('c3-a', false).out).reads).toBe(true); // 1 of 2: at least half
    expect(copa2ChildReport(rows('a').out).reads).toBeNull();
  });

  it('revanchas and skips: per own track, and the skipped copa', () => {
    const b = rows('a').place(1).run('c1-a', 'finish').revancha('c1-a').run('c1-a', 'finish', { place: 1 }).revancha('c1-a').skip(1);
    const r = copa2ChildReport(b.out);
    expect(r.revanchas).toBe(2);
    expect(r.skips).toBe(1);
    expect(r.concepts[1]).toMatchObject({ skipped: true, own: { runs: 2, revanchas: 2 } });
  });

  it('with no `garage_place` row the first copa opened is where the child started', () => {
    const r = copa2ChildReport(rows('a').copa(2).copa(3).out);
    expect(r.startCopa).toBe(2);
    expect(r.furthestCopa).toBe(3);
  });

  it('the furthest copa counts the deer and the track on screen, not only finished runs', () => {
    const b = rows('a').place(1).run('c1-a', 'finish');
    b.out.push(ev('a', 99, 'garage_track_start', { copa: 3, track: 'c3-a', deer: true }));
    expect(copa2ChildReport(b.out).furthestCopa).toBe(3);
  });
});

describe('copa2Understanding: crea, depura, lee', () => {
  const base = { conceptsReached: 4, conceptsCreated: 4, reads: null, debugs: null } as const;
  it('entiende: most own tracks made without the ghost hand and nothing read or debugged wrong', () => {
    expect(copa2Understanding(base)).toBe('entiende');
    expect(copa2Understanding({ ...base, conceptsCreated: 3 })).toBe('entiende'); // 3 of 4 >= 2/3
    expect(copa2Understanding({ ...base, reads: true, debugs: true })).toBe('entiende');
  });
  it('a medias: made some of them, or read/debug failed', () => {
    expect(copa2Understanding({ ...base, conceptsCreated: 2 })).toBe('a_medias'); // 2 of 4 < 2/3
    expect(copa2Understanding({ ...base, reads: false })).toBe('a_medias');
    expect(copa2Understanding({ ...base, debugs: false })).toBe('a_medias');
  });
  it('copia o no llegó: fewer than two concepts reached, or at most one made without the ghost hand', () => {
    expect(copa2Understanding({ ...base, conceptsReached: 1, conceptsCreated: 1 })).toBe('copia_o_no_llego');
    expect(copa2Understanding({ ...base, conceptsCreated: 1 })).toBe('copia_o_no_llego');
    expect(copa2Understanding({ ...base, conceptsCreated: 0 })).toBe('copia_o_no_llego');
  });
  it('the rule\'s numbers are exported for the report to print', () => {
    expect(COPA2_UNDERSTANDING_RULE).toMatchObject({ MIN_CONCEPTS_REACHED: 2, MAX_CREATED_FOR_COPIA: 1, MIN_READ_DEBUG_SHARE: 0.5 });
  });
});

describe('copa2Report: the class', () => {
  /** A fixture class: A starts in copa 2 and flies, B starts in copa 1 and struggles, C is in another grade. */
  const events = (() => {
    const a = rows('A').place(2, 8);
    for (const copa of [2, 3]) a.copa(copa).deer(copa, true, 1).run(`c${copa}-a`, 'finish');
    a.run('c3-a', 'finish').revancha('c3-a').spy('c3-b', true);
    const b = rows('B').place(1, 3).copa(1)
      .run('c1-a', 'crash', { crash_cause: 'wall' }).run('c1-a', 'crash', { crash_cause: 'no_ramp' }).ghost('c1-a').run('c1-a', 'finish', { place: 3 })
      .copa(2).deer(2, false, 5, { ghost: true }).run('c2-a', 'stuck').run('c2-a', 'timeout').ghost('c2-a').run('c2-a', 'finish').skip(1);
    // the Arcade opened after copa 2 (A, 3 minutes in) / the 20-minute timer (B), and both keep running tracks afterwards
    const t = (min: number) => `2026-10-27T12:${String(min).padStart(2, '0')}:00.000Z`;
    const extra: PtEvent[] = [
      ev('A', 100, 'arcade_open', { via: 'copa', step: 'copa' }, t(9)), ev('A', 99, 'character', {}, t(0)),
      ev('A', 101, 'garage_run', { track: 'c4-a', outcome: 'finish', place: 2, run_n: 1 }),
      ev('B', 100, 'arcade_open', { via: 'copa', step: 'copa' }, t(25)), ev('B', 99, 'character', {}, t(0)),
      ev('B', 101, 'garage_run', { track: 'c2-b', outcome: 'finish', place: 3, run_n: 1 }),
      ev('A', 102, 'typing_race_start', { rival_mode: 'honest', again: true }), ev('A', 103, 'typing_race_end', { rival_mode: 'honest', place: 2 }),
      ev('C', 0, 'garage_run', { track: 'c1-a', outcome: 'finish', place: 1 }),
    ];
    return [...a.out, ...b.out, ...extra];
  })();

  it('only the kept sessions that have Copa v2 rows are children (C is in the data but not in `sessions` here)', () => {
    const r = copa2Report([s4('A'), s4('B'), s4('Z')], events);
    expect(r.children.map((c) => c.sessionId)).toEqual(['A', 'B']);
  });

  const r = copa2Report([s4('A'), s4('B')], events);

  it('where the class started and got to', () => {
    expect(r.startDist).toEqual({ '2': 1, '1': 1 });
    expect(r.furthestDist).toEqual({ '4': 1, '2': 1 });
    expect(r.reachedByCopa).toEqual({ 1: 1, 2: 2, 3: 1, 4: 1, 5: 0 });
  });

  it('per concept: who solved the own track, and who solved it without the ghost hand', () => {
    expect(r.solvedShareByCopa[1]).toBe(100); // B
    expect(r.createdShareByCopa[1]).toBe(0); // B needed the ghost hand
    expect(r.createdShareByCopa[2]).toBe(50); // A without, B with
    expect(r.solvedShareByCopa[5]).toBeNull();
  });

  it('crash causes over the class, voluntary revanchas, the skip, the ghost hand', () => {
    expect(r.crashCauses).toEqual({ wall: 1, no_ramp: 1, stuck: 1, timeout: 1 });
    expect(r.revanchasTotal).toBe(1);
    expect(r).toMatchObject({ skipChildren: 1, skipTotal: 1, ghostChildren: 1 });
  });

  it('Ayudá al ciervo and Espiá, over the class', () => {
    expect(r.deerSeenTotal).toBe(3); // A: copas 2 and 3; B: copa 2
    expect(r.deerFixedShare).toBeCloseTo(66.7, 0);
    expect(r.spyTotal).toBe(1);
    expect(r.spyCorrectShare).toBe(100);
  });

  it('the Arcade: copa 2 or the 20-minute timer by elapsed time, and who kept running tracks after it opened', () => {
    expect(r.arcadeUnlockVia).toEqual({ copa_2: 1, timer: 1, admin: 0, other: 0 });
    expect(r.keptPlayingAfterArcade).toBe(2);
  });

  it('the honest typing race among these children', () => {
    expect(r.typingAgainHonestTotal).toBe(1);
    expect(r.typingPlaceDistHonest).toEqual({ '2': 1 });
  });

  it('an export with no Copa v2 rows is empty, not an error', () => {
    const empty = copa2Report([s4('A')], [ev('A', 0, 'ladder_step', { concept: 'sequence', rung: 7 })]);
    expect(empty.children).toEqual([]);
    expect(empty.reachedByCopa[1]).toBe(0);
    expect(empty.spyCorrectShare).toBeNull();
    expect(empty.createdShareByCopa[2]).toBeNull();
  });
});

describe('the per-child signal folds Copa v2 in', () => {
  const sessions = [s4('A'), s4('B'), s4('W')];

  it('a child who made 3 of 3 own tracks reads entiende, sourced from copa2; Workshop data still wins when present; older exports read as before', () => {
    const a = rows('A').place(2, 8);
    for (const copa of [2, 3, 4]) a.copa(copa).deer(copa, true, 1).run(`c${copa}-a`, 'finish');
    const b = rows('B').place(1).copa(1).run('c1-a', 'finish');
    const w = [ev('W', 0, 'workshop_challenge', { n: 1, phase: 'start' }), ev('W', 1, 'garage_run', { track: 'c1-a', outcome: 'finish', place: 1, run_n: 1 })];
    const g = gradeEvaluation(sessions, [...a.out, ...b.out, ...w]);
    const by = Object.fromEntries(g.grade4.map((c) => [c.sessionId, c]));
    expect(by.A).toMatchObject({ understanding: 'entiende', understandingSource: 'copa2' });
    expect(by.A.copa2?.conceptsCreated).toBe(3);
    expect(by.B).toMatchObject({ understanding: 'copia_o_no_llego', understandingSource: 'copa2' }); // one concept only
    expect(by.W.understandingSource).toBe('workshop');
    // the v1 fields stay null for a v2 child, and an export with no Copa rows reads "sin datos"
    expect(by.A.copa).toBeNull();
    const none = gradeEvaluation([s4('N')], [ev('N', 0, 'ladder_step', { concept: 'sequence', rung: 7, result: 'pass' })]);
    expect(none.grade4[0]).toMatchObject({ understandingSource: 'none', copa2: null, copa: null });
  });

  it('analyze() carries the Copa v2 section', () => {
    const many = Array.from({ length: 15 }, (_, i) => ev('A', 200 + i, 'run', {}));
    const a = rows('A').place(1).run('c1-a', 'finish');
    const r = analyze({ sessions: [s4('A')], events: [...a.out, ...many] });
    expect(r.copa2.children).toHaveLength(1);
    expect(r.copa2.reachedByCopa[1]).toBe(1);
    expect(r.copa.children).toEqual([]); // the v1 section is untouched
  });
});
