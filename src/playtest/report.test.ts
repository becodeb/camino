import { describe, expect, it } from 'vitest';
import {
  classifyChild, classCommandReport, clusterClasses, droppedAfterRepeat, filterNoise, freePlayReport,
  helpReport, ladderReport, median, predictReport, PROFILE_RULES, profileReport, raceReport, repeatDropReport,
  surveyReport, topLevelTokens, typingReport,
  type PtEvent, type PtSession,
} from './report';

const session = (over: Partial<PtSession> & { id: string }): PtSession => ({
  grade: 1, started_at: '2026-10-13T12:00:00.000Z', ...over,
});
const ev = (session_id: string, type: string, payload: Record<string, unknown> = {}, seq = 0): PtEvent => ({ session_id, seq, type, payload });

describe('median', () => {
  it('odd and even counts, and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('filterNoise', () => {
  it('drops demo, short (by event count or duration), the projector session, and outside the date window — in that order', () => {
    const sessions: PtSession[] = [
      session({ id: 'demo', demo: true, started_at: '2026-10-13T12:00:00Z', ended_at: '2026-10-13T12:05:00Z' }),
      session({ id: 'short-events', started_at: '2026-10-13T12:00:00Z', ended_at: '2026-10-13T12:05:00Z' }),
      session({ id: 'short-duration', started_at: '2026-10-13T12:00:00Z', ended_at: '2026-10-13T12:00:30Z' }),
      session({ id: 'projector', started_at: '2026-10-13T12:00:00Z', ended_at: '2026-10-13T12:30:00Z', adult_form: { comment: 'la vimos con el proyector' } }),
      session({ id: 'other-day', started_at: '2026-10-14T12:00:00Z', ended_at: '2026-10-14T12:30:00Z' }),
      session({ id: 'good', started_at: '2026-10-13T12:00:00Z', ended_at: '2026-10-13T12:30:00Z' }),
    ];
    const manyEvents = (id: string) => Array.from({ length: 15 }, (_, i) => ev(id, 'run', {}, i));
    const events: PtEvent[] = [
      ...manyEvents('short-events').slice(0, 3),
      ...manyEvents('short-duration'),
      ...manyEvents('projector'),
      ...manyEvents('other-day'),
      ...manyEvents('good'),
    ];
    const { kept, dropped } = filterNoise(sessions, events, { since: '2026-10-13', until: '2026-10-13' });
    expect(kept.map((s) => s.id)).toEqual(['good']);
    expect(Object.fromEntries(dropped.map((d) => [d.session.id, d.reason]))).toEqual({
      demo: 'demo', 'short-events': 'short', 'short-duration': 'short', projector: 'projector', 'other-day': 'outside_window',
    });
  });

  it('with no window given, every date is kept', () => {
    const sessions = [session({ id: 'a', started_at: '2020-01-01T00:00:00Z', ended_at: '2020-01-01T00:05:00Z' })];
    const events = Array.from({ length: 15 }, (_, i) => ev('a', 'run', {}, i));
    expect(filterNoise(sessions, events).kept).toHaveLength(1);
  });
});

describe('clusterClasses', () => {
  it('groups by a gap over 20 minutes, reporting grades and end reasons', () => {
    const sessions = [
      session({ id: 'a1', grade: 1, started_at: '2026-10-13T12:00:00Z', ended_at: '2026-10-13T12:20:00Z', end_reason: 'class_end' }),
      session({ id: 'a2', grade: 2, started_at: '2026-10-13T12:05:00Z', ended_at: '2026-10-13T12:25:00Z', end_reason: 'completed' }),
      // a 25-minute gap: the next class
      session({ id: 'b1', grade: 3, started_at: '2026-10-13T12:50:00Z', ended_at: '2026-10-13T13:10:00Z', end_reason: 'class_end' }),
    ];
    const classes = clusterClasses(sessions);
    expect(classes).toHaveLength(2);
    expect(classes[0].sessions.map((s) => s.id)).toEqual(['a1', 'a2']);
    expect(classes[0].grades).toEqual([1, 2]);
    expect(classes[0].endReasons).toEqual({ class_end: 1, completed: 1 });
    expect(classes[1].sessions.map((s) => s.id)).toEqual(['b1']);
  });
});

describe('ladderReport', () => {
  it('the ceiling distribution, end reasons, and medians', () => {
    const events = [
      ev('a', 'ladder_end', { ceiling_rung: 1, reason: 'bottom', time_ms: 100_000, items: 1 }),
      ev('b', 'ladder_end', { ceiling_rung: 1, reason: 'ceiling', time_ms: 200_000, items: 2 }),
      ev('c', 'ladder_end', { ceiling_rung: null, reason: 'left', time_ms: 50_000, items: 1 }),
    ];
    const r = ladderReport(events);
    expect(r.sessionsReached).toBe(3);
    expect(r.ceilingDist).toEqual({ '1': 2, null: 1 });
    expect(r.endReasons).toEqual({ bottom: 1, ceiling: 1, left: 1 });
    expect(r.medianTimeMs).toBe(100_000);
    expect(r.medianItems).toBe(1);
  });
});

describe('freePlayReport', () => {
  it('activities chosen, distinct per child, time per activity, and time after the green flag', () => {
    const sessions = [
      session({ id: 'a', started_at: '2026-10-13T12:00:00Z', ended_at: '2026-10-13T12:20:00Z' }), // 20 min
    ];
    const events = [
      ev('a', 'choice', { activity: 'race', visit: 1 }),
      ev('a', 'choice', { activity: 'sheet', visit: 2 }),
      ev('b', 'choice', { activity: 'race', visit: 1 }),
      ev('a', 'activity_end', { activity: 'race', time_ms: 60_000 }),
      ev('a', 'activity_end', { activity: 'sheet', time_ms: 180_000 }),
      // route_done 5 minutes (300_000 ms) into a 20-minute session: 15 minutes (900_000 ms) of free play after it
      ev('a', 'route_done', { time_ms: 300_000 }),
    ];
    const r = freePlayReport(sessions, events);
    expect(r.activityCounts).toEqual({ race: 2, sheet: 1 });
    expect(r.medianDistinctActivitiesPerChild).toBe(1.5); // a: 2 distinct (race, sheet); b: 1 (race)
    expect(r.medianTimePerActivityMs).toEqual({ race: 60_000, sheet: 180_000 });
    expect(r.sessionsReachedGreenFlag).toBe(1);
    expect(r.medianFreePlayMsAfterGreenFlag).toBe(900_000);
  });
});

describe('topLevelTokens and droppedAfterRepeat', () => {
  it('splits on top-level spaces only, keeping a repeat\'s own body together', () => {
    expect(topLevelTokens('right right rep3(up) _')).toEqual(['right', 'right', 'rep3(up)', '_']);
    expect(topLevelTokens('rep2(right up) rep3(right)')).toEqual(['rep2(right up)', 'rep3(right)']);
  });

  it('flags a command right after a repeat at top level, or an empty repeat', () => {
    expect(droppedAfterRepeat('rep3(left) left')).toBe(true); // dropped after, not inside
    expect(droppedAfterRepeat('rep2()')).toBe(true); // empty loop
    expect(droppedAfterRepeat('left rep2(up) _')).toBe(false); // correctly inside, nothing stray after
    expect(droppedAfterRepeat('rep3(left) rep2(up)')).toBe(false); // two loops back to back is not this bug
    expect(droppedAfterRepeat('right right')).toBe(false); // no repeat at all
  });
});

describe('repeatDropReport', () => {
  it('counts sessions and attempts, and compares attempts on repeat vs sequence ladder items', () => {
    const events = [
      ev('a', 'run', { program: 'rep3(left) left' }),
      ev('a', 'run', { program: 'rep2(up) _' }),
      ev('b', 'run', { program: 'rep2()' }),
      ev('b', 'run', { program: 'right right' }), // no repeat token: never counted
      ev('a', 'ladder_step', { concept: 'repeat', attempts: 3 }),
      ev('b', 'ladder_step', { concept: 'repeat_count', attempts: 2 }),
      ev('a', 'ladder_step', { concept: 'sequence', attempts: 1 }),
      ev('b', 'ladder_step', { concept: 'long_sequence', attempts: 1 }),
    ];
    const r = repeatDropReport(events);
    expect(r.sessionsWithDrop).toBe(2);
    expect(r.attempts).toBe(2); // one of 'a's two runs was correctly inside, not counted
    expect(r.medianAttemptsRepeatConcepts).toBe(2.5);
    expect(r.medianAttemptsSequenceConcepts).toBe(1);
  });
});

describe('predictReport', () => {
  it('counts no-guess presses and classifies the attempt right after a wrong guess', () => {
    const events = [
      ev('a', 'run', { result: 'no_guess', level_id: 'pp-l4' }),
      ev('a', 'run', { result: 'no_guess', level_id: 'pp-l4' }),
      ev('a', 'run', { result: 'wrong_guess', level_id: 'pp-l4', attempt: 1 }),
      ev('a', 'run', { result: 'win', level_id: 'pp-l4', attempt: 2 }),
      ev('b', 'run', { result: 'wrong_guess', level_id: 'pp-l4', attempt: 1 }),
      ev('b', 'run', { result: 'wrong_guess', level_id: 'pp-l4', attempt: 2 }),
    ];
    const r = predictReport(events);
    expect(r.noGuessPresses).toBe(2);
    expect(r.noGuessSessions).toBe(1);
    expect(r.wrongThenRight).toBe(1);
    expect(r.wrongThenWrong).toBe(1);
  });
});

describe('typingReport', () => {
  it('physical vs touch accuracy and share, and rounds completed', () => {
    const events = [
      ev('a', 'typing', { input: 'touch', correct: true }),
      ev('a', 'typing', { input: 'touch', correct: false }),
      ev('a', 'typing', { input: 'touch', correct: true }),
      ev('a', 'typing', { input: 'physical', correct: true }),
      ev('a', 'typing', { input: 'physical', correct: false }),
      ev('a', 'typing', { input: 'physical', correct: false }),
      ev('a', 'typing', { input: 'physical', correct: false }),
      ev('a', 'typing_end', { rounds_done: 3 }),
      ev('b', 'typing_end', { rounds_done: 1 }),
    ];
    const r = typingReport(events);
    expect(r.touchKeys).toBe(3);
    expect(r.physicalKeys).toBe(4);
    expect(r.touchAccuracyPct).toBeCloseTo(66.7, 1);
    expect(r.physicalAccuracyPct).toBeCloseTo(25, 1);
    expect(r.touchSharePct).toBeCloseTo((3 / 7) * 100, 1);
    expect(r.roundsCompletedDist).toEqual({ '3': 1, '1': 1 });
    expect(r.medianRoundsCompleted).toBe(2);
  });
});

describe('helpReport', () => {
  it('help touches, call_adult and adult_help, by session and count', () => {
    const events = [
      ev('a', 'help', {}), ev('a', 'help', {}), ev('b', 'help', {}),
      ev('a', 'call_adult', {}),
      ev('a', 'adult_help', {}), ev('b', 'adult_help', {}),
    ];
    const r = helpReport(events);
    expect(r).toEqual({ helpSessions: 2, helpTouches: 3, callAdultSessions: 1, callAdultCount: 1, adultHelpSessions: 2, adultHelpCount: 2 });
  });
});

describe('classCommandReport', () => {
  it('counts devices per kind and flags the ones received late, by `late` or by the timestamps', () => {
    const events = [
      ev('a', 'class_command', { kind: 'five_min', late: undefined, sent_at: '2026-10-13T12:00:00Z', received_at: '2026-10-13T12:00:05Z' }),
      ev('b', 'class_command', { kind: 'end_class', sent_at: '2026-10-13T12:00:00Z', received_at: '2026-10-13T12:30:00Z' }), // 30 min: late by timing
      ev('c', 'class_command', { kind: 'end_class', late: true, sent_at: '2026-10-13T12:00:00Z', received_at: '2026-10-13T12:00:05Z' }), // late by the flag
    ];
    expect(classCommandReport(events).byKind).toEqual({
      five_min: { devices: 1, lateDevices: 0 },
      end_class: { devices: 2, lateDevices: 2 },
    });
  });
});

describe('surveyReport', () => {
  it('tallies every question and answer', () => {
    const events = [
      ev('a', 'survey_answer', { question: 'liked', answer: 'yes' }),
      ev('b', 'survey_answer', { question: 'liked', answer: 'yes' }),
      ev('c', 'survey_answer', { question: 'liked', answer: 'no' }),
      ev('a', 'survey_answer', { question: 'difficulty', answer: 'easy' }),
    ];
    expect(surveyReport(events).byQuestion).toEqual({ liked: { yes: 2, no: 1 }, difficulty: { easy: 1 } });
  });
});

describe('raceReport', () => {
  it('reports nothing wrong when there is no race data at all', () => {
    const r = raceReport([]);
    expect(r.sessionsWithRace).toBe(0);
    expect(r.medianRacesPerChild).toBeNull();
  });

  it('races per child, voluntary "otra carrera", turbo and stretch time by tier, wrong blocks, input sources', () => {
    const events = [
      ev('a', 'race_start', { race_no: 1, tier: 1 }),
      ev('a', 'race_start', { race_no: 2, tier: 2, again: true }),
      ev('b', 'race_start', { race_no: 1, tier: 1 }),
      ev('a', 'race_stretch', { race_no: 1, turbo_offered: false, ms: 4000, wrong_blocks: 1, sources: { tap: 2, drag: 0, key: 0 } }),
      ev('a', 'race_stretch', { race_no: 2, turbo_offered: true, used_repeat: true, ms: 6000, wrong_blocks: 0, sources: { tap: 0, drag: 1, key: 0 } }),
      ev('b', 'race_stretch', { race_no: 1, turbo_offered: true, used_repeat: false, ms: 5000, wrong_blocks: 2, sources: { tap: 0, drag: 0, key: 3 } }),
    ];
    const r = raceReport(events);
    expect(r.sessionsWithRace).toBe(2);
    expect(r.racesStarted).toBe(3);
    expect(r.voluntaryAgainRaces).toBe(1);
    expect(r.medianRacesPerChild).toBe(1.5);
    expect(r.turboByTier).toEqual({ '2': { offered: 1, used: 1 }, '1': { offered: 1, used: 0 } });
    expect(r.medianStretchMsByTier).toEqual({ '1': 4500, '2': 6000 });
    expect(r.wrongBlocksPerStretchMedian).toBe(1);
    expect(r.inputSources).toEqual({ tap: 2, drag: 1, key: 3 });
  });
});

describe('classifyChild and profileReport (T37)', () => {
  // classifyChild's second argument is the report's own median wardrobe
  // time (ms) — 0 here means "no reference, the wardrobe signal never
  // fires" (the common case when nobody's wardrobe time stands out).
  const sig = (over: Partial<Parameters<typeof classifyChild>[0]> & { sessionId: string }) => ({
    code: over.sessionId, racesStarted: 0, racesAgain: 0, cups: 0, distinctActivities: 0, totalFreePlayPicks: 0,
    repeatPicks: 0, medianActivityMs: null, wardrobeMs: 0, physicalTypingKeys: 0, ...over,
  });

  it('too little data is undecided', () => {
    expect(classifyChild(sig({ sessionId: 'a', distinctActivities: 1 }), 0).profile).toBe('undecided');
  });

  it('a racer: finished races and chose to race again voluntarily', () => {
    const p = classifyChild(sig({ sessionId: 'a', racesStarted: 3, racesAgain: 2, cups: 3 }), 0);
    expect(p.profile).toBe('racer');
  });

  it('a collector: cups and returning to the same free-play activity, not wardrobe', () => {
    const p = classifyChild(sig({ sessionId: 'a', racesStarted: 1, cups: 4, totalFreePlayPicks: 5, distinctActivities: 2, repeatPicks: 3 }), 0);
    expect(p.profile).toBe('collector');
  });

  it('the wardrobe alone, even with a lot of time, is never "collector" — it only ever scores "dresser", and only weakly', () => {
    // a lot of wardrobe time, nothing else at all — the median of this one
    // child's own time is itself (no spread across the class), so it never
    // clears 1.5x of *itself*: this is the "no reference" case too.
    const p = classifyChild(sig({ sessionId: 'a', wardrobeMs: 300_000 }), 300_000);
    expect(p.profile).toBe('undecided');
    expect(p.evidence).toMatch(/mandatory step, not counted as voluntary/);
  });

  it('a dresser: wardrobe time well above the class median (the only context the signal has)', () => {
    const p = classifyChild(sig({ sessionId: 'a', wardrobeMs: 120_000 }), 20_000); // 6x the median, past the 1.5x bar
    expect(p.profile).toBe('dresser');
    expect(p.evidence).toMatch(/weak: ≥1\.5× the class median/);
  });

  it('a notable wardrobe time never outscores a real voluntary signal elsewhere (it is deliberately weak)', () => {
    const p = classifyChild(sig({ sessionId: 'a', wardrobeMs: 120_000, racesStarted: 5, racesAgain: 3 }), 20_000);
    expect(p.profile).toBe('racer');
  });

  it('an explorer: many distinct short-lived activities', () => {
    const p = classifyChild(sig({ sessionId: 'a', distinctActivities: 4, medianActivityMs: 20_000 }), 0);
    expect(p.profile).toBe('explorer');
  });

  it('many activities but each one long-lived is not an explorer (a settler, not scored here, stays undecided)', () => {
    const p = classifyChild(sig({ sessionId: 'a', distinctActivities: 4, medianActivityMs: PROFILE_RULES.EXPLORER_MAX_MEDIAN_MS + 1 }), 0);
    expect(p.profile).toBe('undecided');
  });

  it('a keyboard kid: many physical keypresses', () => {
    const p = classifyChild(sig({ sessionId: 'a', physicalTypingKeys: 40 }), 0);
    expect(p.profile).toBe('keyboard');
  });

  it('the evidence line shows the session code, not raw ids', () => {
    const p = classifyChild({ ...sig({ sessionId: 'uuid-1' }), code: 'Zorro 27', racesStarted: 3, racesAgain: 2 }, 0);
    expect(p.code).toBe('Zorro 27');
    expect(p.sessionId).toBe('uuid-1');
  });

  it('T38: childLabel (via profileReport) prefers the child\'s name over the anonymous code; falls back to the code, then the raw id', () => {
    const sessions: PtSession[] = [
      session({ id: 'a', grade: 4, code: 'Zorro 27', child_name: 'Sofía' }),
      session({ id: 'b', grade: 4, code: 'Coatí 4', child_name: null }),
      session({ id: 'c', grade: 4, child_name: '   ' }), // blank: not a usable name
    ];
    const r = profileReport(sessions, []);
    expect(r.children.map((c) => c.code)).toEqual(['Sofía', 'Coatí 4', 'c']);
  });

  it('profileReport groups by grade, tallies the distribution, shows the session code, and flags missing race data', () => {
    const sessions: PtSession[] = [
      session({ id: 'a', grade: 1, code: 'Zorro 27' }),
      session({ id: 'b', grade: 2, code: 'Coatí 4' }),
    ];
    const events = [
      ev('a', 'race_start', { race_no: 1, again: false }),
      ev('a', 'race_start', { race_no: 2, again: true }),
      ev('a', 'race_start', { race_no: 3, again: true }),
      ev('a', 'race_end', { reason: 'finished', cups: 3 }),
      ev('b', 'help', {}), // not enough signal: undecided
    ];
    const r = profileReport(sessions, events);
    expect(r.children.map((c) => [c.code, c.profile])).toEqual([['Zorro 27', 'racer'], ['Coatí 4', 'undecided']]);
    expect(r.distribution).toEqual({ racer: 1, undecided: 1 });
    expect(r.byGrade).toEqual({ '1': { racer: 1 }, '2': { undecided: 1 } });
    expect(r.hasRaceData).toBe(true);
  });

  it('profileReport flags hasRaceData false when no race_start exists at all (data from before T33)', () => {
    const sessions: PtSession[] = [session({ id: 'a', grade: 1, code: 'Zorro 27' })];
    const events = [ev('a', 'wardrobe', { action: 'close', duration_ms: 10_000 })];
    expect(profileReport(sessions, events).hasRaceData).toBe(false);
  });

  it('collectChildSignals (via profileReport) counts repeat free-play picks correctly', () => {
    const sessions: PtSession[] = [session({ id: 'a', grade: 1, code: 'Zorro 27' })];
    const events = [
      ev('a', 'choice', { activity: 'sheet', visit: 1 }),
      ev('a', 'choice', { activity: 'sheet', visit: 2 }), // the same activity again: a repeat pick
      ev('a', 'choice', { activity: 'guardas', visit: 3 }),
      ev('a', 'race_start', { race_no: 1 }), // just enough to have race data so this is not the "weak" branch
    ];
    const r = profileReport(sessions, events);
    // 3 picks, 2 distinct, 1 repeat: collectorScore = 0 cups*2 + 1 repeat*1 = 1, racerScore = 1 start*1 = 1 — a tie under MIN_TOTAL_SCORE either way
    expect(r.children[0].profile).toBe('undecided');
    expect(r.children[0].evidence).toMatch(/3 picks \(2 distinct, 1 repeat\)/);
  });
});
