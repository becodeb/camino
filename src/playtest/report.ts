// T34: the pilot's class report, read the same way for every new class.
// Pure logic only (no fs, no fetch) so it is unit-testable with small
// synthetic fixtures (report.test.ts) and runnable from plain Node without
// a build step (tools/analyze-playtest.mjs imports this file directly by
// its .ts path — Node 24 strips the types at load time, so this module
// sticks to erasable syntax: no enums, no namespaces, no parameter
// properties).
//
// Input shape: the JSON `tools/export-playtest.mjs` writes (`{sessions,
// events}`, the same shape `GET /api/export?format=json` answers) — see
// docs/prueba-piloto-datos.md for every event's payload. This module never
// assumes which event types exist (T33's race events are absent from data
// recorded before that round; every report section that finds nothing says
// so rather than printing a bogus zero).

export interface PtDevice {
  sound?: boolean;
  voice?: boolean;
  touch?: boolean;
  [k: string]: unknown;
}

export interface PtSession {
  id: string;
  code?: string;
  /** T38: the child's first name, when the name screen was on; null/absent for every anonymous session. */
  child_name?: string | null;
  grade: number;
  division?: string | null;
  started_at: string;
  ended_at?: string | null;
  end_reason?: string | null;
  device?: PtDevice | null;
  survey?: Record<string, unknown> | null;
  adult_form?: { comment?: string; [k: string]: unknown } | null;
  current_step?: string | null;
  last_seen_at?: string | null;
  demo?: boolean;
}

export interface PtEvent {
  session_id: string;
  seq: number;
  client_t?: string;
  server_t?: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface PtExport {
  sessions: PtSession[];
  events: PtEvent[];
  exported_at?: string;
  app_version?: string;
}

// ------------------------------------------------------------------ small pure helpers

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function pct(n: number, total: number): number | null {
  return total > 0 ? (n / total) * 100 : null;
}

export function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = keyOf(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/** T38: how a session reads in the report's per-child lines — its given name when the name screen was on, else the anonymous code (or the raw id as a last resort). */
export function childLabel(s: Pick<PtSession, 'child_name' | 'code' | 'id'>): string {
  const name = s.child_name?.trim();
  return name ? name : (s.code ?? s.id);
}

export function count<T>(items: T[], keyOf: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const k = keyOf(it);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** UTC-3 clock time (es-AR), e.g. "14:05". Argentina has had no DST since 2009. */
export function localTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

/** The UTC calendar date (YYYY-MM-DD) a session's `started_at` falls on — the window the noise filter's `--since`/`--until` compare against. */
export function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

export function durationMs(s: PtSession): number {
  const start = Date.parse(s.started_at);
  const end = Date.parse(s.ended_at ?? s.last_seen_at ?? s.started_at);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
}

// ------------------------------------------------------------------ noise filter

export interface FilterOptions {
  since?: string;
  until?: string;
}

export interface DroppedSession {
  session: PtSession;
  reason: 'demo' | 'short' | 'projector' | 'outside_window';
}

export interface NoiseFilterResult {
  kept: PtSession[];
  dropped: DroppedSession[];
}

const SHORT_EVENT_COUNT = 10;
const SHORT_DURATION_MS = 60_000;

/**
 * Drops, in this order (a session is dropped once, for the first reason
 * that applies): demo sessions; sessions with ≤10 events or under 60s
 * (`end_reason`/`last_seen_at` stand in for `ended_at` on a session never
 * closed); a session whose adult_form comment mentions "proyector" (the
 * teacher's own display computer, played once to show the class); sessions
 * outside the `--since`/`--until` window (by `started_at`'s UTC date).
 */
export function filterNoise(sessions: PtSession[], events: PtEvent[], opts: FilterOptions = {}): NoiseFilterResult {
  const eventCount = count(events, (e) => e.session_id);
  const kept: PtSession[] = [];
  const dropped: DroppedSession[] = [];
  for (const s of sessions) {
    if (s.demo) { dropped.push({ session: s, reason: 'demo' }); continue; }
    const n = eventCount[s.id] ?? 0;
    if (n <= SHORT_EVENT_COUNT || durationMs(s) < SHORT_DURATION_MS) { dropped.push({ session: s, reason: 'short' }); continue; }
    const comment = s.adult_form?.comment;
    if (typeof comment === 'string' && /proyector/i.test(comment)) { dropped.push({ session: s, reason: 'projector' }); continue; }
    const day = dateOf(s.started_at);
    if ((opts.since && day < opts.since) || (opts.until && day > opts.until)) { dropped.push({ session: s, reason: 'outside_window' }); continue; }
    kept.push(s);
  }
  return { kept, dropped };
}

// ------------------------------------------------------------------ classes (sessions clustered by start time)

export interface ClassCluster {
  sessions: PtSession[];
  startedAt: string;
  endedAt: string;
  grades: number[];
  endReasons: Record<string, number>;
}

const CLASS_GAP_MS = 20 * 60_000;

/** Clusters sessions by `started_at`: a gap over 20 minutes since the previous one starts a new class. */
export function clusterClasses(sessions: PtSession[], gapMs = CLASS_GAP_MS): ClassCluster[] {
  const sorted = [...sessions].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  const clusters: PtSession[][] = [];
  for (const s of sorted) {
    const last = clusters.at(-1);
    const prev = last?.at(-1);
    if (prev && Date.parse(s.started_at) - Date.parse(prev.started_at) > gapMs) clusters.push([s]);
    else if (last) last.push(s);
    else clusters.push([s]);
  }
  return clusters.map((group) => {
    const ends = group.map((s) => Date.parse(s.ended_at ?? s.last_seen_at ?? s.started_at));
    return {
      sessions: group,
      startedAt: group[0].started_at,
      endedAt: new Date(Math.max(...ends)).toISOString(),
      grades: [...new Set(group.map((s) => s.grade))].sort((a, b) => a - b),
      endReasons: count(group, (s) => s.end_reason ?? 'open'),
    };
  });
}

// ------------------------------------------------------------------ the ladder

export interface LadderReport {
  sessionsReached: number;
  ceilingDist: Record<string, number>;
  endReasons: Record<string, number>;
  medianTimeMs: number | null;
  medianItems: number | null;
}

export function ladderReport(events: PtEvent[]): LadderReport {
  const ends = events.filter((e) => e.type === 'ladder_end');
  return {
    sessionsReached: ends.length,
    ceilingDist: count(ends, (e) => String(e.payload.ceiling_rung ?? 'null')),
    endReasons: count(ends, (e) => String(e.payload.reason ?? '—')),
    medianTimeMs: median(ends.map((e) => Number(e.payload.time_ms)).filter(Number.isFinite)),
    medianItems: median(ends.map((e) => Number(e.payload.items)).filter(Number.isFinite)),
  };
}

// ------------------------------------------------------------------ free play

export interface FreePlayReport {
  activityCounts: Record<string, number>;
  medianDistinctActivitiesPerChild: number | null;
  medianTimePerActivityMs: Record<string, number | null>;
  sessionsReachedGreenFlag: number;
  medianFreePlayMsAfterGreenFlag: number | null;
}

/** A free-play pick (not the character pick, not a door choice): `choice` with `activity` and a numeric `visit`. */
function isFreePlayPick(e: PtEvent): boolean {
  return e.type === 'choice' && typeof e.payload.activity === 'string' && typeof e.payload.visit === 'number';
}

export function freePlayReport(sessions: PtSession[], events: PtEvent[]): FreePlayReport {
  const picks = events.filter(isFreePlayPick);
  const picksBySession = groupBy(picks, (e) => e.session_id);
  const distinctPerChild = [...picksBySession.values()].map((rows) => new Set(rows.map((e) => String(e.payload.activity))).size);

  const activityEnds = events.filter((e) => e.type === 'activity_end');
  const byActivity = groupBy(activityEnds, (e) => String(e.payload.activity ?? '—'));
  const medianTimePerActivityMs: Record<string, number | null> = {};
  for (const [activity, rows] of byActivity) {
    medianTimePerActivityMs[activity] = median(rows.map((e) => Number(e.payload.time_ms)).filter(Number.isFinite));
  }

  const routeDoneBySession = new Map<string, PtEvent>();
  for (const e of events) if (e.type === 'route_done' && !routeDoneBySession.has(e.session_id)) routeDoneBySession.set(e.session_id, e);
  const sessionsById = new Map(sessions.map((s) => [s.id, s]));
  const afterGreenFlagMs: number[] = [];
  for (const [sid, e] of routeDoneBySession) {
    const s = sessionsById.get(sid);
    const timeMs = Number(e.payload.time_ms);
    if (!s || !Number.isFinite(timeMs)) continue;
    afterGreenFlagMs.push(Math.max(0, durationMs(s) - timeMs));
  }

  return {
    activityCounts: count(picks, (e) => String(e.payload.activity)),
    medianDistinctActivitiesPerChild: median(distinctPerChild),
    medianTimePerActivityMs,
    sessionsReachedGreenFlag: routeDoneBySession.size,
    medianFreePlayMsAfterGreenFlag: median(afterGreenFlagMs),
  };
}

// ------------------------------------------------------------------ the repeat: dropped right after instead of inside

/** Splits a `run.program` string into its top-level tokens (parens nest a repeat's body; its own tokens are never split on). */
export function topLevelTokens(program: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of program.trim()) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ' ' && depth === 0) {
      if (cur) tokens.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

const REPEAT_TOKEN_RE = /^rep(?:\d+|\?|goal)\((.*)\)$/;

/**
 * The level needs the block inside the repeat, but the child placed it
 * right after the loop at top level instead (or left the loop empty): a
 * `rep…(…)` token immediately followed by a plain command token (not
 * another `rep…`, not `_`), or a `rep…()` with nothing in it.
 */
export function droppedAfterRepeat(program: string): boolean {
  const tokens = topLevelTokens(program);
  for (let i = 0; i < tokens.length; i++) {
    const m = REPEAT_TOKEN_RE.exec(tokens[i]);
    if (!m) continue;
    if (m[1].trim() === '') return true;
    const next = tokens[i + 1];
    if (next && !next.startsWith('rep') && next !== '_') return true;
  }
  return false;
}

export const REPEAT_CONCEPTS = ['repeat', 'repeat_count', 'repeat_pattern', 'before_after_repeat'];
export const SEQUENCE_CONCEPTS = ['sequence', 'long_sequence'];

export interface RepeatDropReport {
  sessionsWithDrop: number;
  attempts: number;
  medianAttemptsRepeatConcepts: number | null;
  medianAttemptsSequenceConcepts: number | null;
}

export function repeatDropReport(events: PtEvent[]): RepeatDropReport {
  const sessionsWithDrop = new Set<string>();
  let attempts = 0;
  for (const e of events) {
    if (e.type !== 'run') continue;
    const program = e.payload.program;
    if (typeof program !== 'string' || !program.includes('rep')) continue;
    if (droppedAfterRepeat(program)) { attempts++; sessionsWithDrop.add(e.session_id); }
  }
  const steps = events.filter((e) => e.type === 'ladder_step');
  const attemptsOf = (concepts: string[]) => median(
    steps.filter((e) => concepts.includes(String(e.payload.concept))).map((e) => Number(e.payload.attempts)).filter(Number.isFinite),
  );
  return {
    sessionsWithDrop: sessionsWithDrop.size,
    attempts,
    medianAttemptsRepeatConcepts: attemptsOf(REPEAT_CONCEPTS),
    medianAttemptsSequenceConcepts: attemptsOf(SEQUENCE_CONCEPTS),
  };
}

// ------------------------------------------------------------------ predict

export interface PredictReport {
  noGuessPresses: number;
  noGuessSessions: number;
  wrongThenRight: number;
  wrongThenWrong: number;
}

export function predictReport(events: PtEvent[]): PredictReport {
  const runs = events.filter((e) => e.type === 'run');
  const noGuess = runs.filter((e) => e.payload.result === 'no_guess');

  const byLevel = groupBy(runs.filter((e) => e.payload.result === 'wrong_guess' || e.payload.result === 'win'), (e) => `${e.session_id}:${e.payload.level_id}`);
  let wrongThenRight = 0;
  let wrongThenWrong = 0;
  for (const rows of byLevel.values()) {
    const ordered = [...rows].sort((a, b) => Number(a.payload.attempt ?? 0) - Number(b.payload.attempt ?? 0));
    for (let i = 0; i < ordered.length - 1; i++) {
      if (ordered[i].payload.result !== 'wrong_guess') continue;
      if (ordered[i + 1].payload.result === 'win') wrongThenRight++;
      else if (ordered[i + 1].payload.result === 'wrong_guess') wrongThenWrong++;
    }
  }
  return {
    noGuessPresses: noGuess.length,
    noGuessSessions: new Set(noGuess.map((e) => e.session_id)).size,
    wrongThenRight,
    wrongThenWrong,
  };
}

// ------------------------------------------------------------------ typing

export interface TypingReport {
  touchKeys: number;
  physicalKeys: number;
  touchAccuracyPct: number | null;
  physicalAccuracyPct: number | null;
  touchSharePct: number | null;
  roundsCompletedDist: Record<string, number>;
  medianRoundsCompleted: number | null;
}

export function typingReport(events: PtEvent[]): TypingReport {
  const keys = events.filter((e) => e.type === 'typing');
  const touch = keys.filter((e) => e.payload.input === 'touch');
  const physical = keys.filter((e) => e.payload.input === 'physical');
  const ends = events.filter((e) => e.type === 'typing_end');
  return {
    touchKeys: touch.length,
    physicalKeys: physical.length,
    touchAccuracyPct: pct(touch.filter((e) => e.payload.correct === true).length, touch.length),
    physicalAccuracyPct: pct(physical.filter((e) => e.payload.correct === true).length, physical.length),
    touchSharePct: pct(touch.length, touch.length + physical.length),
    roundsCompletedDist: count(ends, (e) => String(e.payload.rounds_done ?? '—')),
    medianRoundsCompleted: median(ends.map((e) => Number(e.payload.rounds_done)).filter(Number.isFinite)),
  };
}

// ------------------------------------------------------------------ help

export interface HelpReport {
  helpSessions: number;
  helpTouches: number;
  callAdultSessions: number;
  callAdultCount: number;
  adultHelpSessions: number;
  adultHelpCount: number;
}

export function helpReport(events: PtEvent[]): HelpReport {
  const help = events.filter((e) => e.type === 'help');
  const callAdult = events.filter((e) => e.type === 'call_adult');
  const adultHelp = events.filter((e) => e.type === 'adult_help');
  return {
    helpSessions: new Set(help.map((e) => e.session_id)).size,
    helpTouches: help.length,
    callAdultSessions: new Set(callAdult.map((e) => e.session_id)).size,
    callAdultCount: callAdult.length,
    adultHelpSessions: new Set(adultHelp.map((e) => e.session_id)).size,
    adultHelpCount: adultHelp.length,
  };
}

// ------------------------------------------------------------------ garden, reloads, visibility, idle

export interface AttentionReport {
  gardenViewSessions: number;
  resumeSessions: number;
  resumeCount: number;
  visibilityHiddenCount: number;
  idleCount: number;
  medianIdleMs: number | null;
}

export function attentionReport(events: PtEvent[]): AttentionReport {
  const garden = events.filter((e) => e.type === 'garden_view');
  const resume = events.filter((e) => e.type === 'resume');
  const hidden = events.filter((e) => e.type === 'visibility' && e.payload.state === 'hidden');
  const idle = events.filter((e) => e.type === 'idle');
  return {
    gardenViewSessions: new Set(garden.map((e) => e.session_id)).size,
    resumeSessions: new Set(resume.map((e) => e.session_id)).size,
    resumeCount: resume.length,
    visibilityHiddenCount: hidden.length,
    idleCount: idle.length,
    medianIdleMs: median(idle.map((e) => Number(e.payload.duration_ms)).filter(Number.isFinite)),
  };
}

// ------------------------------------------------------------------ class commands: devices that got them late

export interface ClassCommandReport {
  byKind: Record<string, { devices: number; lateDevices: number }>;
}

const LATE_CLASS_COMMAND_MS = 2 * 60_000;

/** A device counts as "late" by `payload.late` (T28 on) or, for older data without that field, by comparing `sent_at`/`received_at` itself. */
function isLateCommand(e: PtEvent, thresholdMs: number): boolean {
  if (e.payload.late === true) return true;
  const sent = Date.parse(String(e.payload.sent_at ?? ''));
  const received = Date.parse(String(e.payload.received_at ?? ''));
  return Number.isFinite(sent) && Number.isFinite(received) && received - sent > thresholdMs;
}

export function classCommandReport(events: PtEvent[], thresholdMs = LATE_CLASS_COMMAND_MS): ClassCommandReport {
  const rows = events.filter((e) => e.type === 'class_command');
  const byKind: Record<string, { devices: number; lateDevices: number }> = {};
  for (const e of rows) {
    const kind = String(e.payload.kind ?? '—');
    const bucket = byKind[kind] ?? { devices: 0, lateDevices: 0 };
    bucket.devices++;
    if (isLateCommand(e, thresholdMs)) bucket.lateDevices++;
    byKind[kind] = bucket;
  }
  return { byKind };
}

// ------------------------------------------------------------------ survey

export interface SurveyReport {
  byQuestion: Record<string, Record<string, number>>;
}

export function surveyReport(events: PtEvent[]): SurveyReport {
  const answers = events.filter((e) => e.type === 'survey_answer');
  const byQuestion: Record<string, Record<string, number>> = {};
  for (const e of answers) {
    const q = String(e.payload.question ?? '—');
    const a = String(e.payload.answer ?? '—');
    const bucket = byQuestion[q] ?? {};
    bucket[a] = (bucket[a] ?? 0) + 1;
    byQuestion[q] = bucket;
  }
  return { byQuestion };
}

// ------------------------------------------------------------------ T33: "La carrera"

export interface RaceReport {
  sessionsWithRace: number;
  racesStarted: number;
  voluntaryAgainRaces: number;
  medianRacesPerChild: number | null;
  turboByTier: Record<string, { offered: number; used: number }>;
  medianStretchMsByTier: Record<string, number | null>;
  wrongBlocksPerStretchMedian: number | null;
  inputSources: { tap: number; drag: number; key: number };
}

export function raceReport(events: PtEvent[]): RaceReport {
  const starts = events.filter((e) => e.type === 'race_start');
  const stretches = events.filter((e) => e.type === 'race_stretch');
  if (starts.length === 0) {
    return {
      sessionsWithRace: 0, racesStarted: 0, voluntaryAgainRaces: 0, medianRacesPerChild: null,
      turboByTier: {}, medianStretchMsByTier: {}, wrongBlocksPerStretchMedian: null,
      inputSources: { tap: 0, drag: 0, key: 0 },
    };
  }
  const tierOf = new Map<string, number>();
  for (const e of starts) tierOf.set(`${e.session_id}:${e.payload.race_no}`, Number(e.payload.tier));

  const racesPerChild = [...groupBy(starts, (e) => e.session_id).values()].map((rows) => rows.length);
  const turboByTier: Record<string, { offered: number; used: number }> = {};
  const stretchMsByTier = new Map<string, number[]>();
  const wrongBlocks: number[] = [];
  const sources = { tap: 0, drag: 0, key: 0 };
  for (const e of stretches) {
    const tier = String(tierOf.get(`${e.session_id}:${e.payload.race_no}`) ?? '—');
    if (e.payload.turbo_offered) {
      const b = turboByTier[tier] ?? { offered: 0, used: 0 };
      b.offered++;
      if (e.payload.used_repeat) b.used++;
      turboByTier[tier] = b;
    }
    const ms = Number(e.payload.ms);
    if (Number.isFinite(ms)) {
      const arr = stretchMsByTier.get(tier) ?? [];
      arr.push(ms);
      stretchMsByTier.set(tier, arr);
    }
    const wrong = Number(e.payload.wrong_blocks);
    if (Number.isFinite(wrong)) wrongBlocks.push(wrong);
    const s = e.payload.sources as { tap?: number; drag?: number; key?: number } | undefined;
    if (s) { sources.tap += s.tap ?? 0; sources.drag += s.drag ?? 0; sources.key += s.key ?? 0; }
  }
  const medianStretchMsByTier: Record<string, number | null> = {};
  for (const [tier, arr] of stretchMsByTier) medianStretchMsByTier[tier] = median(arr);

  return {
    sessionsWithRace: new Set(starts.map((e) => e.session_id)).size,
    racesStarted: starts.length,
    voluntaryAgainRaces: starts.filter((e) => e.payload.again === true).length,
    medianRacesPerChild: median(racesPerChild),
    turboByTier,
    medianStretchMsByTier,
    wrongBlocksPerStretchMedian: median(wrongBlocks),
    inputSources: sources,
  };
}

// ------------------------------------------------------------------ T41: 4to's Arcade ("Carrera de teclas", "Tu juego")

export interface ArcadeChild {
  sessionId: string;
  /** The child's name, or the anonymous session code (`childLabel`). */
  code: string;
  typingRaces: number;
  /** Voluntary "¡Otra carrera!" in the typing race. */
  typingAgain: number;
  typingFinished: number;
  /** Words per minute: the best finished race, and the median over finished races. */
  bestWpm: number | null;
  medianWpm: number | null;
  /** Right keys over all keys, every typing race (finished or left), 0–100. */
  accuracy: number | null;
  ownGameRuns: number;
  /** The best score of "Tu juego" seen in its runs. */
  ownGameBest: number | null;
}

export interface ArcadeReport {
  sessionsWithTypingRace: number;
  typingRaces: number;
  typingAgain: number;
  medianWpm: number | null;
  medianAccuracy: number | null;
  /** A finished typing race's duration on screen (mount → finish line), the 60–90 s target. */
  medianRaceMs: number | null;
  sessionsWithOwnGame: number;
  ownGameRuns: number;
  /** One row per child with any Arcade activity. */
  children: ArcadeChild[];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

export function arcadeReport(sessions: PtSession[], events: PtEvent[]): ArcadeReport {
  const bySession = groupBy(events.filter((e) => e.type.startsWith('typing_race_') || e.type === 'own_game_run'), (e) => e.session_id);
  const children: ArcadeChild[] = [];
  const allWpm: number[] = [];
  const allAcc: number[] = [];
  const raceMs: number[] = [];
  for (const s of sessions) {
    const rows = bySession.get(s.id);
    if (!rows?.length) continue;
    const starts = rows.filter((e) => e.type === 'typing_race_start');
    const ends = rows.filter((e) => e.type === 'typing_race_end');
    const finished = ends.filter((e) => e.payload.reason === 'finished');
    const wpms = finished.map((e) => num(e.payload.wpm)).filter((x): x is number => x != null);
    const right = ends.reduce((n, e) => n + (num(e.payload.right) ?? 0), 0);
    const wrong = ends.reduce((n, e) => n + (num(e.payload.wrong) ?? 0), 0);
    const acc = pct(right, right + wrong);
    const runs = rows.filter((e) => e.type === 'own_game_run');
    const bests = runs.map((e) => num(e.payload.best)).filter((x): x is number => x != null);
    allWpm.push(...wpms);
    if (acc != null) allAcc.push(acc);
    raceMs.push(...finished.map((e) => num(e.payload.ms)).filter((x): x is number => x != null));
    children.push({
      sessionId: s.id,
      code: childLabel(s),
      typingRaces: starts.length,
      typingAgain: starts.filter((e) => e.payload.again === true).length,
      typingFinished: finished.length,
      bestWpm: wpms.length ? Math.max(...wpms) : null,
      medianWpm: median(wpms),
      accuracy: acc,
      ownGameRuns: runs.length,
      ownGameBest: bests.length ? Math.max(...bests) : null,
    });
  }
  return {
    sessionsWithTypingRace: children.filter((c) => c.typingRaces > 0).length,
    typingRaces: children.reduce((n, c) => n + c.typingRaces, 0),
    typingAgain: children.reduce((n, c) => n + c.typingAgain, 0),
    medianWpm: median(allWpm),
    medianAccuracy: median(allAcc),
    medianRaceMs: median(raceMs),
    sessionsWithOwnGame: children.filter((c) => c.ownGameRuns > 0).length,
    ownGameRuns: children.reduce((n, c) => n + c.ownGameRuns, 0),
    children,
  };
}

// ------------------------------------------------------------------ C05: Copa de 4to (5 honest circuits, replaces the Workshop as the main route)
//
// `docs/prueba-piloto-datos.md`'s "Copa de 4to" section (C03/C04) is the
// contract: `copa_start`/`copa_end`/`copa_revancha`, one concept family per
// circuit (1 sequence, 2 repeat/turbo, 3 conditions/puddle, 4 events/log,
// 5 variables/laps — the same `CONCEPT_FAMILIES` keys the ladder already
// uses). Unlike the Workshop, the Copa is 4to's MANDATORY route since C04,
// so "reached" is expected to be true for every post-C04 4to session; it
// still reads `false` for older exports (no `copa_*` rows at all), which is
// how `gradeChildReport` below knows to keep using the Workshop's own
// understanding signal for them.

export type CopaCircuitId = 1 | 2 | 3 | 4 | 5;
export const COPA_CIRCUIT_IDS: readonly CopaCircuitId[] = [1, 2, 3, 4, 5];
/** Each circuit's one concept, the same family keys as `CONCEPT_FAMILIES` (sequence/repeat/conditions/events/variables). */
export const COPA_CIRCUIT_FAMILY: Record<CopaCircuitId, string> = {
  1: 'sequence', 2: 'repeat', 3: 'conditions', 4: 'events', 5: 'variables',
};

export interface CopaCircuitChild {
  /** Any `copa_end` row for this circuit this session (a struggling child still always finishes — never "stuck"). */
  reached: boolean;
  /** `copa_end` rows for this circuit (the first try plus every revancha). */
  attempts: number;
  firstPlace: 1 | 2 | 3 | null;
  /** The best (lowest) place over every attempt, including revanchas. */
  bestPlace: 1 | 2 | 3 | null;
  /** The best attempt's own margin (how far from the next place up). */
  marginMs: number | null;
  /** Distinct reason codes seen, in first-seen order (a clean 1st still carries one — see the data dictionary). */
  reasons: string[];
  revanchas: number;
  /** The concept slot ended up right (not the adult's reveal) in ANY attempt. */
  conceptOk: boolean;
  /** The concept slot was right on the FIRST attempt — no revancha needed to get it. */
  conceptOkFirstTry: boolean;
  /** The highest help level shown across every attempt (0 none, 1 spoken hint, 2 the slot highlighted). */
  helpLevelMax: number;
}

function emptyCopaCircuitChild(): CopaCircuitChild {
  return {
    reached: false, attempts: 0, firstPlace: null, bestPlace: null, marginMs: null,
    reasons: [], revanchas: 0, conceptOk: false, conceptOkFirstTry: false, helpLevelMax: 0,
  };
}

export interface CopaChildReport {
  /** Any `copa_*` row at all this session. */
  reached: boolean;
  circuits: Record<CopaCircuitId, CopaCircuitChild>;
  /** Distinct circuits with at least one `copa_end` row. */
  circuitsReached: number;
  revanchasTotal: number;
  understanding: UnderstandingSignal;
}

export const COPA_UNDERSTANDING_RULE = {
  /** The Copa has no free/optional circuits like the Workshop's 8+: all 5 are "core". */
  TOTAL_CIRCUITS: 5,
  /** Fewer circuits reached than this (an interrupted session) is never enough to call it "entiende" or "a medias". */
  MIN_CIRCUITS_REACHED: 3,
  /** "entiende": the concept right on the FIRST try in at least this many circuits reached, with no circuit needing help level 2 (the slot highlighted). */
  MIN_FIRST_TRY_OK_FOR_ENTIENDE: 4,
  MAX_HELP_LEVEL_FOR_ENTIENDE: 1,
  /** "copia o no llegó": the concept right on the first try in at most this many circuits (the rest needed a revancha or the slot highlighted to get there), or too few circuits reached at all. */
  MAX_FIRST_TRY_OK_FOR_COPIA: 1,
} as const;

/** This module's own rule (printed in the report, not a claim from the data dictionary) — the Copa's analogue of `UNDERSTANDING_RULE` for the Workshop. */
export function copaUnderstanding(c: Pick<CopaChildReport, 'circuitsReached' | 'circuits'>): UnderstandingSignal {
  const r = COPA_UNDERSTANDING_RULE;
  const reachedCircuits = COPA_CIRCUIT_IDS.map((id) => c.circuits[id]).filter((x) => x.reached);
  const firstTryOk = reachedCircuits.filter((x) => x.conceptOkFirstTry).length;
  const maxHelp = reachedCircuits.length ? Math.max(...reachedCircuits.map((x) => x.helpLevelMax)) : 0;
  if (c.circuitsReached < r.MIN_CIRCUITS_REACHED || firstTryOk <= r.MAX_FIRST_TRY_OK_FOR_COPIA) return 'copia_o_no_llego';
  if (firstTryOk >= r.MIN_FIRST_TRY_OK_FOR_ENTIENDE && maxHelp <= r.MAX_HELP_LEVEL_FOR_ENTIENDE) return 'entiende';
  return 'a_medias';
}

/** `rows` must already be this one session's `copa_*` rows (any order; sorted here). */
export function copaChildReport(rows: PtEvent[]): CopaChildReport {
  const ends = [...rows.filter((e) => e.type === 'copa_end')].sort((a, b) => a.seq - b.seq);
  const revanchas = rows.filter((e) => e.type === 'copa_revancha');
  const circuits: Record<CopaCircuitId, CopaCircuitChild> = {
    1: emptyCopaCircuitChild(), 2: emptyCopaCircuitChild(), 3: emptyCopaCircuitChild(), 4: emptyCopaCircuitChild(), 5: emptyCopaCircuitChild(),
  };
  for (const e of ends) {
    const id = Number(e.payload.circuit) as CopaCircuitId;
    const c = circuits[id];
    if (!c) continue;
    const place = Number(e.payload.place) as 1 | 2 | 3;
    const validPlace = ([1, 2, 3] as const).includes(place) ? place : null;
    const margin = Number(e.payload.margin_ms);
    const reason = String(e.payload.reason ?? '—');
    const conceptOk = e.payload.concept_ok === true;
    const help = Number(e.payload.help_level ?? 0) || 0;
    if (!c.reached) { c.reached = true; c.firstPlace = validPlace; c.conceptOkFirstTry = conceptOk; }
    c.attempts++;
    if (validPlace != null && (c.bestPlace == null || validPlace < c.bestPlace)) {
      c.bestPlace = validPlace;
      c.marginMs = Number.isFinite(margin) ? margin : null;
    }
    if (!c.reasons.includes(reason)) c.reasons.push(reason);
    if (conceptOk) c.conceptOk = true;
    c.helpLevelMax = Math.max(c.helpLevelMax, help);
  }
  for (const e of revanchas) {
    const id = Number(e.payload.circuit) as CopaCircuitId;
    if (circuits[id]) circuits[id].revanchas++;
  }
  const circuitsReached = COPA_CIRCUIT_IDS.filter((id) => circuits[id].reached).length;
  const reached = circuitsReached > 0;
  const base = { reached, circuits, circuitsReached, revanchasTotal: revanchas.length };
  return { ...base, understanding: reached ? copaUnderstanding(base) : 'copia_o_no_llego' };
}

export interface CopaChild extends CopaChildReport {
  sessionId: string;
  code: string;
}

export interface CopaReport {
  /** One row per child with any Copa activity (every post-C04 4to session; none for an older export). */
  children: CopaChild[];
  reachedByCircuit: Record<CopaCircuitId, number>;
  /** Of the children who reached each circuit, the share (%) who got the concept right on the first try. */
  conceptOkFirstTryShareByCircuit: Record<CopaCircuitId, number | null>;
  revanchasTotal: number;
  /** "¡Otra carrera!" voluntary restarts in the honest-rival typing race (C02, 4to only) among these children. */
  typingAgainHonestTotal: number;
  /** How the Arcade unlocked for each child who unlocked it: finishing circuit 2, the 20-minute timer, the admin's "Juegos para todos", or something else (the demo/adult default). `circuit_2` vs `timer` is inferred from elapsed time since the session's first event (no direct field says which fired first — see the comment on `ARCADE_UNLOCK_TIMER_MS`), so it is a close heuristic, not an exact read. */
  arcadeUnlockVia: { circuit_2: number; timer: number; admin: number; other: number };
  /** Kept doing Copa circuits (any `copa_*` row) after `arcade_open` — the same voluntary-engagement idea as the Workshop's own `voluntaryWorkshopContinuation`. */
  keptPlayingAfterArcade: number;
  /** Honest typing-race places (1/2/3), over every finished race among these children. */
  typingPlaceDistHonest: Record<string, number>;
}

/** Mirrors `CopaStep.tsx`'s own `ARCADE_TIME_MS` (the Arcade's 20-minute fallback timer) — duplicated here because this module stays dependency-free from the UI layer; a drift between the two only ever softens the `circuit_2`/`timer` split below, never the report's other numbers. */
const ARCADE_UNLOCK_TIMER_MS = 20 * 60_000;

export function copaReport(sessions: PtSession[], events: PtEvent[]): CopaReport {
  const eventsBySession = groupBy(events, (e) => e.session_id);
  const children: CopaChild[] = [];
  for (const s of sessions) {
    const rows = eventsBySession.get(s.id) ?? [];
    const copaRows = rows.filter((e) => e.type.startsWith('copa_'));
    if (copaRows.length === 0) continue;
    children.push({ sessionId: s.id, code: childLabel(s), ...copaChildReport(copaRows) });
  }

  const reachedByCircuit: Record<CopaCircuitId, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const firstTryOkByCircuit: Record<CopaCircuitId, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const c of children) {
    for (const id of COPA_CIRCUIT_IDS) {
      if (!c.circuits[id].reached) continue;
      reachedByCircuit[id]++;
      if (c.circuits[id].conceptOkFirstTry) firstTryOkByCircuit[id]++;
    }
  }
  const conceptOkFirstTryShareByCircuit: Record<CopaCircuitId, number | null> = { 1: null, 2: null, 3: null, 4: null, 5: null };
  for (const id of COPA_CIRCUIT_IDS) conceptOkFirstTryShareByCircuit[id] = pct(firstTryOkByCircuit[id], reachedByCircuit[id]);

  const sessionIds = new Set(children.map((c) => c.sessionId));
  const typingStarts = events.filter((e) => sessionIds.has(e.session_id) && e.type === 'typing_race_start' && e.payload.rival_mode === 'honest');
  const typingEnds = events.filter((e) => sessionIds.has(e.session_id) && e.type === 'typing_race_end' && e.payload.rival_mode === 'honest');
  const typingAgainHonestTotal = typingStarts.filter((e) => e.payload.again === true).length;
  const typingPlaceDistHonest = count(typingEnds.filter((e) => e.payload.place != null), (e) => String(e.payload.place));

  const arcadeUnlockVia = { circuit_2: 0, timer: 0, admin: 0, other: 0 };
  let keptPlayingAfterArcade = 0;
  for (const sid of sessionIds) {
    const rows = [...(eventsBySession.get(sid) ?? [])].sort((a, b) => a.seq - b.seq);
    const open = rows.find((e) => e.type === 'arcade_open');
    if (!open) continue;
    const via = String(open.payload.via ?? '—');
    if (via === 'games_all') arcadeUnlockVia.admin++;
    else if (via === 'copa') {
      const first = rows[0];
      const firstT = Date.parse(first?.client_t ?? first?.server_t ?? '');
      const openT = Date.parse(open.client_t ?? open.server_t ?? '');
      const elapsed = Number.isFinite(firstT) && Number.isFinite(openT) ? openT - firstT : null;
      if (elapsed != null && elapsed < ARCADE_UNLOCK_TIMER_MS) arcadeUnlockVia.circuit_2++;
      else arcadeUnlockVia.timer++;
    } else arcadeUnlockVia.other++;
    if (rows.some((e) => e.type.startsWith('copa_') && e.seq > open.seq)) keptPlayingAfterArcade++;
  }

  return {
    children,
    reachedByCircuit,
    conceptOkFirstTryShareByCircuit,
    revanchasTotal: children.reduce((n, c) => n + c.revanchasTotal, 0),
    typingAgainHonestTotal,
    arcadeUnlockVia,
    keptPlayingAfterArcade,
    typingPlaceDistHonest,
  };
}

// ------------------------------------------------------------------ T37: motivation profiles (a heuristic, not a measurement)
//
// Parent review (2026-10-17, on the real export): the first cut let the
// wardrobe dominate the distribution — but the wardrobe is a MANDATORY
// route step every child passes through once, never a free choice, so its
// taps/time are not evidence of a "collector" or "dresser" preference by
// themselves. Rewritten to rest on signals that are actually voluntary:
// - `racer`: races started and, especially, a voluntary "¡Otra carrera!".
// - `collector`: cups won (the tangible reward of racing) and returning to
//   the SAME free-play activity more than once (`repeatPicks` — choosing
//   more of something, not just trying it once).
// - `dresser`: the wardrobe IS used, but only as a weak, relative signal —
//   this app has no way to tell a voluntary wardrobe revisit from the one
//   mandatory pass (it is not a free-play menu card, so it cannot be
//   reopened from there, and the data carries no "reopened" marker), so a
//   session only counts as notably-dressed when its wardrobe time is at
//   least `DRESSER_MEDIAN_MULTIPLIER`× this report's own median — and even
//   then it scores a small, fixed, deliberately weak amount, never enough
//   on its own to call a child `collector`.
// - `explorer`: many distinct free-play activities, each visited briefly.
// - `keyboard`: typing is also a mandatory route step, so total exposure is
//   not voluntary either — but WHICH input the child reaches for (the real
//   keyboard vs. the on-screen one, always offered alongside it) is a real
//   choice, so physical keypresses are the signal, not keys overall.
// T41 (4to's Arcade): the typing race is both a race and keyboard play,
// and it is voluntary (an Arcade card): its races and its voluntary
// "¡Otra carrera!" count for `racer` like T33's, and for `keyboard` a little
// more (TYPING_RACE_WEIGHT per race), so a child who only types reads
// `keyboard`. "Tu juego" runs are reported per child, not scored.
// Character taps are not scored: no such event is logged yet (see
// "Recorded, not implemented" in the feature document), so `explorer`
// relies on free-play breadth alone. "Typing beyond what the route
// requires" was considered too (the brief's own wording) but found
// undetectable: the game's length is fixed by rounds/time/budget, not by
// the child's choice, so there is no "extra" to measure from this data.

export type Profile = 'racer' | 'collector' | 'dresser' | 'explorer' | 'keyboard' | 'undecided';

export interface ChildProfile {
  sessionId: string;
  /** T38: the child's name when the name screen gave one, else the anonymous session code (e.g. "Zorro 27") — never the UUID — for reading the evidence list (`childLabel`). */
  code: string;
  profile: Profile;
  evidence: string;
}

/** Named thresholds, so the rule is documented in one place, not buried in arithmetic. */
export const PROFILE_RULES = {
  /** Below this total score every signal gives, the child is `undecided` (too little voluntary signal). */
  MIN_TOTAL_SCORE: 3,
  /** A voluntary "¡Otra carrera!" counts for more than just finishing the first race (it was not required). */
  RACE_AGAIN_WEIGHT: 3,
  RACE_START_WEIGHT: 1,
  /** Cups are the tangible reward collected by racing. */
  CUP_WEIGHT: 2,
  /** Choosing the SAME free-play activity again (not just trying many): a collecting-more-of-it signal. */
  REPEAT_PICK_WEIGHT: 1,
  /** `explorer` only scores when activities are both numerous AND short-lived (many quick tries, not one deep one). */
  EXPLORER_MIN_ACTIVITIES: 3,
  EXPLORER_MAX_MEDIAN_MS: 90_000,
  EXPLORER_WEIGHT_PER_ACTIVITY: 2,
  /** Every 5 physical keypresses in the typing game is one "keyboard" point (the choice of input, not the total). */
  KEYBOARD_KEYS_PER_POINT: 5,
  /** T41: each typing race started (4to's Arcade, voluntary) is this many "keyboard" points (one more than a race's `racer` point). */
  TYPING_RACE_WEIGHT: 2,
  /** The wardrobe (a mandatory step) only counts as a "dresser" signal once it clears this multiple of the class's own median wardrobe time. */
  DRESSER_MEDIAN_MULTIPLIER: 1.5,
  /** Fixed and deliberately small: just enough to clear `MIN_TOTAL_SCORE` alone, so it is read as weak and never outweighs a real voluntary signal elsewhere. */
  DRESSER_WEAK_WARDROBE_SCORE: 3,
};

interface ChildSignals {
  sessionId: string;
  code: string;
  racesStarted: number;
  racesAgain: number;
  cups: number;
  distinctActivities: number;
  totalFreePlayPicks: number;
  repeatPicks: number;
  medianActivityMs: number | null;
  wardrobeMs: number;
  physicalTypingKeys: number;
  /** T41: typing races started and voluntary "¡Otra carrera!" in them (absent: 0, data from before T41). */
  typingRaces?: number;
  typingAgain?: number;
  /** T41: "Tu juego" runs (evidence only, not scored). */
  ownGameRuns?: number;
}

function collectChildSignals(sessions: PtSession[], events: PtEvent[]): ChildSignals[] {
  const bySession = groupBy(events, (e) => e.session_id);
  return sessions.map((s): ChildSignals => {
    const rows = bySession.get(s.id) ?? [];
    const starts = rows.filter((e) => e.type === 'race_start');
    const raceEnds = rows.filter((e) => e.type === 'race_end' && e.payload.reason === 'finished');
    const lastCups = raceEnds.length ? Number(raceEnds.at(-1)!.payload.cups ?? 0) : 0;
    const picks = rows.filter(isFreePlayPick);
    const distinctActivities = new Set(picks.map((e) => String(e.payload.activity))).size;
    const activityEnds = rows.filter((e) => e.type === 'activity_end');
    const medianActivityMs = median(activityEnds.map((e) => Number(e.payload.time_ms)).filter(Number.isFinite));
    const wardrobeClose = rows.find((e) => e.type === 'wardrobe' && e.payload.action === 'close');
    const wardrobeMs = Number(wardrobeClose?.payload.duration_ms ?? 0) || 0;
    const physicalTypingKeys = rows.filter((e) => e.type === 'typing' && e.payload.input === 'physical').length;
    const typingStarts = rows.filter((e) => e.type === 'typing_race_start');
    return {
      sessionId: s.id,
      code: childLabel(s),
      racesStarted: starts.length,
      racesAgain: starts.filter((e) => e.payload.again === true).length,
      cups: lastCups,
      distinctActivities,
      totalFreePlayPicks: picks.length,
      repeatPicks: Math.max(0, picks.length - distinctActivities),
      medianActivityMs,
      wardrobeMs,
      physicalTypingKeys,
      typingRaces: typingStarts.length,
      typingAgain: typingStarts.filter((e) => e.payload.again === true).length,
      ownGameRuns: rows.filter((e) => e.type === 'own_game_run').length,
    };
  });
}

/**
 * A simple, documented heuristic learned from voluntary behaviour only
 * (never from a mandatory route step, except the wardrobe's weak,
 * relative-to-the-class fallback — see the section comment above): the
 * highest-scoring profile wins. Below `MIN_TOTAL_SCORE` the child is
 * `undecided` — this is a rule to learn from, not a diagnosis.
 */
export function classifyChild(sig: ChildSignals, classMedianWardrobeMs: number): ChildProfile {
  const r = PROFILE_RULES;
  const typingRaces = sig.typingRaces ?? 0;
  const typingAgain = sig.typingAgain ?? 0;
  const racerScore = (sig.racesStarted + typingRaces) * r.RACE_START_WEIGHT + (sig.racesAgain + typingAgain) * r.RACE_AGAIN_WEIGHT;
  const collectorScore = sig.cups * r.CUP_WEIGHT + sig.repeatPicks * r.REPEAT_PICK_WEIGHT;
  const wardrobeNotable = classMedianWardrobeMs > 0 && sig.wardrobeMs >= classMedianWardrobeMs * r.DRESSER_MEDIAN_MULTIPLIER;
  const dresserScore = wardrobeNotable ? r.DRESSER_WEAK_WARDROBE_SCORE : 0;
  const explorerScore = sig.distinctActivities >= r.EXPLORER_MIN_ACTIVITIES
    && sig.medianActivityMs != null && sig.medianActivityMs < r.EXPLORER_MAX_MEDIAN_MS
    ? sig.distinctActivities * r.EXPLORER_WEIGHT_PER_ACTIVITY : 0;
  const keyboardScore = sig.physicalTypingKeys / r.KEYBOARD_KEYS_PER_POINT + typingRaces * r.TYPING_RACE_WEIGHT + typingAgain * r.RACE_AGAIN_WEIGHT;

  const scores: Array<[Profile, number]> = [
    ['racer', racerScore], ['collector', collectorScore], ['dresser', dresserScore],
    ['explorer', explorerScore], ['keyboard', keyboardScore],
  ];
  const [top, topScore] = scores.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
  const wardrobeNote = wardrobeNotable
    ? `wardrobe ${Math.round(sig.wardrobeMs / 1000)}s (weak: ≥${r.DRESSER_MEDIAN_MULTIPLIER}× the class median of ${Math.round(classMedianWardrobeMs / 1000)}s, never alone enough for collector)`
    : `wardrobe ${Math.round(sig.wardrobeMs / 1000)}s (mandatory step, not counted as voluntary)`;
  // always the full, honest evidence line — even `undecided` says what little voluntary signal there was, not just that it was too little.
  const evidence = `races ${sig.racesStarted} (again ${sig.racesAgain}), cups ${sig.cups}`
    + `, free play ${sig.totalFreePlayPicks} picks (${sig.distinctActivities} distinct, ${sig.repeatPicks} repeat)`
    + `, ${wardrobeNote}, physical typing keys ${sig.physicalTypingKeys}`
    + (typingRaces || sig.ownGameRuns ? `, typing races ${typingRaces} (again ${typingAgain}), own game runs ${sig.ownGameRuns ?? 0}` : '');
  if (topScore < r.MIN_TOTAL_SCORE) {
    return { sessionId: sig.sessionId, code: sig.code, profile: 'undecided', evidence: `too little voluntary signal — ${evidence}` };
  }
  return { sessionId: sig.sessionId, code: sig.code, profile: top, evidence };
}

export interface ProfileReport {
  children: ChildProfile[];
  distribution: Record<string, number>;
  byGrade: Record<string, Record<string, number>>;
  /** This report's own median wardrobe time (ms) — the reference the weak `dresser` signal compares against. */
  classMedianWardrobeMs: number;
  /** False when no `race_start` exists at all (data from before T33): `racer`/`collector` then have almost no voluntary signal to work with. */
  hasRaceData: boolean;
}

export function profileReport(sessions: PtSession[], events: PtEvent[]): ProfileReport {
  const signals = collectChildSignals(sessions, events);
  const classMedianWardrobeMs = median(signals.map((s) => s.wardrobeMs)) ?? 0;
  const children = signals.map((s) => classifyChild(s, classMedianWardrobeMs));
  const gradeOf = new Map(sessions.map((s) => [s.id, s.grade]));
  const byGrade: Record<string, Record<string, number>> = {};
  for (const c of children) {
    const g = String(gradeOf.get(c.sessionId) ?? '—');
    const bucket = byGrade[g] ?? {};
    bucket[c.profile] = (bucket[c.profile] ?? 0) + 1;
    byGrade[g] = bucket;
  }
  return {
    children,
    distribution: count(children, (c) => c.profile),
    byGrade,
    classMedianWardrobeMs,
    hasRaceData: events.some((e) => e.type === 'race_start'),
  };
}

// ------------------------------------------------------------------ T42: 4to's (and 5to's) per-child evaluation
//
// `docs/prueba-piloto-datos.md`'s own "Concepts for the per-child profile"
// (right after the long-ladder's rungs 13–18 table) is the contract this
// module follows literally: seven families that partition every ladder
// concept (round-1 and round-2's original 12, plus T39's 13–18), each
// grouping the rungs a child met. A family's own status is read from the
// DEEPEST concept of the family the child actually attempted this session
// (ladder rungs only ever increase, so the deepest concept touched is both
// the hardest and the last): `not_reached` with no row at all, else that
// concept's own result — the rung's SECOND item's result when a second item
// was played (`variant: 1`, "got it the second time"), its first item's
// otherwise (T39's own documented rule: "the second item's result is the
// rung's").

export interface ConceptFamily {
  key: string;
  /** Spanish label, as the data dictionary itself names the family. */
  label: string;
  concepts: string[];
}

export const CONCEPT_FAMILIES: ConceptFamily[] = [
  { key: 'sequence', label: 'secuencia', concepts: ['sequence', 'long_sequence'] },
  { key: 'reading_fixing', label: 'leer y corregir', concepts: ['fix', 'predict', 'fix_rule'] },
  { key: 'repeat', label: 'repetir', concepts: ['repeat', 'repeat_count', 'repeat_pattern', 'before_after_repeat'] },
  { key: 'conditions', label: 'condiciones', concepts: ['fog_si', 'three_worlds', 'if_else'] },
  { key: 'events', label: 'eventos', concepts: ['events_rules', 'rules_score', 'events_predict'] },
  { key: 'variables', label: 'variables', concepts: ['variables', 'modify_make'] },
  { key: 'broadcast', label: 'difusión (broadcast)', concepts: ['broadcast'] },
];

export type ConceptStatus = 'passed' | 'failed' | 'not_reached';

export interface ConceptResult {
  status: ConceptStatus;
  /** Only set when `status === 'passed'`: the rung's first item, or its second (variant). */
  via?: 'first' | 'variant';
  /** The deepest rung of the family actually attempted (absent when `not_reached`). */
  rung?: number;
}

/** `steps` must already be this one session's `ladder_step` rows. */
export function familyResult(steps: PtEvent[], family: ConceptFamily): ConceptResult {
  const rows = steps.filter((e) => family.concepts.includes(String(e.payload.concept)));
  if (rows.length === 0) return { status: 'not_reached' };
  const maxRung = Math.max(...rows.map((e) => Number(e.payload.rung) || 0));
  const atMaxRung = rows.filter((e) => Number(e.payload.rung) === maxRung);
  // The second item (variant 1), when it was played, carries the rung's final result.
  const final = atMaxRung.find((e) => Number(e.payload.variant) === 1) ?? atMaxRung[0];
  if (final.payload.result === 'pass') {
    return { status: 'passed', via: Number(final.payload.variant) === 1 ? 'variant' : 'first', rung: maxRung };
  }
  return { status: 'failed', rung: maxRung };
}

// ------------------------------------------------------------------ T42: the Workshop's "understands vs copies" signal
//
// `docs/prueba-piloto-datos.md`'s own "Understands vs copies (T42)" note
// (in the Game Workshop section) names the inputs: `predict_correct`
// (challenge 1) and `investigate_correct` (challenge 2), both first answers
// given before any help could show them; `help_level` and how many core
// challenges were solved at help level 0 ("built alone"). The three-way
// read below is this module's own rule — named constants, documented here,
// printed in the report itself (the brief: "the rule... stated in the
// output") — not a claim from the data dictionary.

export type UnderstandingSignal = 'entiende' | 'a_medias' | 'copia_o_no_llego';

export const UNDERSTANDING_RULE = {
  /** Core challenges (1–7); 8–13 are the free, unscored ones. */
  CORE_CHALLENGES: 7,
  /** "entiende": both first answers right AND at least this many core challenges solved at help level 0. */
  MIN_SOLVED_WITHOUT_HELP_FOR_ENTIENDE: 5,
  /** "copia o no llegó": either first answer wrong, or at most this many core challenges solved at all (help or not). */
  MAX_CORE_SOLVED_FOR_COPIA: 2,
} as const;

export interface WorkshopChildReport {
  /** The Workshop was opened at all this session (any `workshop_challenge` row). */
  reached: boolean;
  coreSolved: number;
  coreTotal: number;
  freeSolved: number;
  predictCorrect: boolean | null;
  investigateCorrect: boolean | null;
  helpLevelByChallenge: Record<number, number>;
  solvedWithoutHelp: number;
  understanding: UnderstandingSignal;
}

function emptyWorkshopChildReport(): WorkshopChildReport {
  return {
    reached: false, coreSolved: 0, coreTotal: UNDERSTANDING_RULE.CORE_CHALLENGES, freeSolved: 0,
    predictCorrect: null, investigateCorrect: null, helpLevelByChallenge: {}, solvedWithoutHelp: 0,
    understanding: 'copia_o_no_llego',
  };
}

export function workshopChildReport(events: PtEvent[]): WorkshopChildReport {
  const rows = events.filter((e) => e.type === 'workshop_challenge');
  if (rows.length === 0) return emptyWorkshopChildReport();

  // The final (last-recorded) row per challenge: `help_level`/`attempts` are already cumulative,
  // and `phase` tells whether it ended solved, skipped, or never finished this session.
  const sorted = [...rows].sort((a, b) => a.seq - b.seq);
  const finalByN = new Map<number, PtEvent>();
  for (const e of sorted) finalByN.set(Number(e.payload.n), e);

  let coreSolved = 0;
  let freeSolved = 0;
  let solvedWithoutHelp = 0;
  const helpLevelByChallenge: Record<number, number> = {};
  for (const [n, e] of finalByN) {
    const solved = e.payload.phase === 'solved';
    const help = Number(e.payload.help_level ?? 0) || 0;
    helpLevelByChallenge[n] = help;
    if (n <= UNDERSTANDING_RULE.CORE_CHALLENGES) { if (solved) coreSolved++; } else if (solved) freeSolved++;
    if (solved && help === 0) solvedWithoutHelp++;
  }
  const c1 = finalByN.get(1);
  const c2 = finalByN.get(2);
  const predictCorrect = typeof c1?.payload.predict_correct === 'boolean' ? c1.payload.predict_correct : null;
  const investigateCorrect = typeof c2?.payload.investigate_correct === 'boolean' ? c2.payload.investigate_correct : null;

  const r = UNDERSTANDING_RULE;
  let understanding: UnderstandingSignal;
  if (predictCorrect === false || investigateCorrect === false || coreSolved <= r.MAX_CORE_SOLVED_FOR_COPIA) {
    understanding = 'copia_o_no_llego';
  } else if (predictCorrect === true && investigateCorrect === true && solvedWithoutHelp >= r.MIN_SOLVED_WITHOUT_HELP_FOR_ENTIENDE) {
    understanding = 'entiende';
  } else {
    understanding = 'a_medias';
  }
  return { reached: true, coreSolved, coreTotal: r.CORE_CHALLENGES, freeSolved, predictCorrect, investigateCorrect, helpLevelByChallenge, solvedWithoutHelp, understanding };
}

// ------------------------------------------------------------------ T42: on-task vs hidden-tab time, idle, help asked

export interface ChildTimeReport {
  totalMs: number;
  /** Summed stretches between a `visibility` `hidden` and the next `visible` (or the session's own end, if it never came back). */
  hiddenMs: number;
  /** Summed `idle.duration_ms` (30s+ of no input; already excludes hidden-tab time per the data dictionary). */
  idleMs: number;
  onTaskMs: number;
  helpTouches: number;
  callAdultCount: number;
}

export function childTimeReport(s: PtSession, events: PtEvent[]): ChildTimeReport {
  const totalMs = durationMs(s);
  const vis = [...events.filter((e) => e.type === 'visibility')].sort((a, b) => a.seq - b.seq);
  let hiddenMs = 0;
  let hiddenSince: number | null = null;
  for (const e of vis) {
    const t = Date.parse(e.client_t ?? e.server_t ?? '');
    if (!Number.isFinite(t)) continue;
    if (e.payload.state === 'hidden') hiddenSince = t;
    else if (e.payload.state === 'visible' && hiddenSince != null) { hiddenMs += Math.max(0, t - hiddenSince); hiddenSince = null; }
  }
  if (hiddenSince != null) {
    const end = Date.parse(s.ended_at ?? s.last_seen_at ?? s.started_at);
    if (Number.isFinite(end)) hiddenMs += Math.max(0, end - hiddenSince);
  }
  const idleMs = events.filter((e) => e.type === 'idle').reduce((n, e) => n + (Number(e.payload.duration_ms) || 0), 0);
  return {
    totalMs,
    hiddenMs,
    idleMs,
    onTaskMs: Math.max(0, totalMs - hiddenMs - idleMs),
    helpTouches: events.filter((e) => e.type === 'help').length,
    callAdultCount: events.filter((e) => e.type === 'call_adult').length,
  };
}

// ------------------------------------------------------------------ T42: the per-child 4to/5to table, and the class summary

export interface GradeChildReport {
  sessionId: string;
  /** The child's name, or the anonymous session code (`childLabel`). */
  code: string;
  grade: number;
  ladderCeiling: number | null;
  /** Keyed by `ConceptFamily.key`. */
  concepts: Record<string, ConceptResult>;
  workshop: WorkshopChildReport;
  /** C05: Copa de 4to (C04's own route, replacing the Workshop's position); `null` for a session with no Copa activity at all (every pre-C04 export, and every non-4to grade). */
  copa: CopaChildReport | null;
  /**
   * The final "entiende / a medias / copia o no llegó" signal for this child
   * — the Workshop's own `workshop.understanding` when the Workshop was
   * reached (unchanged, so old sessions keep reading exactly as before),
   * else the Copa's `copa.understanding` when the Copa was reached (C04's
   * own mandatory route), else the old Workshop-not-reached default
   * ('copia o no llegó') when neither was.
   */
  understanding: UnderstandingSignal;
  understandingSource: 'workshop' | 'copa' | 'none';
  /** From `arcadeReport` (T41); `null` for a session with no Arcade activity at all (every 5to, and a 4to who never reached it). */
  arcade: ArcadeChild | null;
  time: ChildTimeReport;
}

function gradeChildReport(s: PtSession, events: PtEvent[], arcadeBySession: Map<string, ArcadeChild>): GradeChildReport {
  const steps = events.filter((e) => e.type === 'ladder_step');
  const ladderEnd = events.find((e) => e.type === 'ladder_end');
  const rawCeiling = ladderEnd?.payload.ceiling_rung;
  const ladderCeiling = rawCeiling == null ? null : Number(rawCeiling);
  const concepts: Record<string, ConceptResult> = {};
  for (const fam of CONCEPT_FAMILIES) concepts[fam.key] = familyResult(steps, fam);
  const workshop = workshopChildReport(events);
  const copaRows = events.filter((e) => e.type.startsWith('copa_'));
  const copa = copaRows.length ? copaChildReport(copaRows) : null;
  const understandingSource: 'workshop' | 'copa' | 'none' = workshop.reached ? 'workshop' : copa ? 'copa' : 'none';
  const understanding = workshop.reached ? workshop.understanding : copa ? copa.understanding : workshop.understanding;
  return {
    sessionId: s.id,
    code: childLabel(s),
    grade: s.grade,
    ladderCeiling: Number.isFinite(ladderCeiling) ? ladderCeiling : null,
    concepts,
    workshop,
    copa,
    understanding,
    understandingSource,
    arcade: arcadeBySession.get(s.id) ?? null,
    time: childTimeReport(s, events),
  };
}

export const BELOW_ENTRY_RULE = {
  /** A child at least this many rungs below the class median ceiling counts as "clearly below". */
  RUNGS_BELOW_MEDIAN: 2,
  /** A ceiling at or under this rung counts as "clearly below" on its own (even close to the median): still near 4to's own entry rung (7). */
  MAX_CEILING_STILL_BELOW: 9,
} as const;

export interface GradeClassSummary {
  childCount: number;
  medianCeiling: number | null;
  modeCeiling: number | null;
  /** The `ConceptFamily.key` most children passed — "the concept most children have". */
  mostCommonConcept: string | null;
  belowEntry: Array<{ code: string; reason: string }>;
  /** `ConceptFamily.key`s with at least one attempt in the class, weakest (lowest pass rate) first. */
  weakestConcepts: string[];
  medianOnTaskMinutes: number | null;
  medianHiddenPct: number | null;
  /** Children who kept working in the Workshop (any `workshop_*` row) after `arcade_open`. */
  voluntaryWorkshopContinuation: number;
  medianTypingRaces: number | null;
}

function modeOf(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const freq = new Map<number, number>();
  for (const n of nums) freq.set(n, (freq.get(n) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = -1;
  for (const [n, c] of freq) if (c > bestCount) { best = n; bestCount = c; }
  return best;
}

function gradeClassSummary(children: GradeChildReport[], eventsBySession: Map<string, PtEvent[]>): GradeClassSummary {
  const ceilings = children.map((c) => c.ladderCeiling).filter((x): x is number => x != null);
  const med = median(ceilings);
  const mode = modeOf(ceilings);

  const familyPassed: Record<string, number> = {};
  const familyAttempted: Record<string, number> = {};
  for (const c of children) {
    for (const fam of CONCEPT_FAMILIES) {
      const r = c.concepts[fam.key];
      if (r.status === 'not_reached') continue;
      familyAttempted[fam.key] = (familyAttempted[fam.key] ?? 0) + 1;
      if (r.status === 'passed') familyPassed[fam.key] = (familyPassed[fam.key] ?? 0) + 1;
    }
  }
  let mostCommonConcept: string | null = null;
  let mostCount = -1;
  for (const fam of CONCEPT_FAMILIES) {
    const n = familyPassed[fam.key] ?? 0;
    if (n > mostCount) { mostCount = n; mostCommonConcept = fam.key; }
  }
  const weakestConcepts = CONCEPT_FAMILIES
    .filter((fam) => (familyAttempted[fam.key] ?? 0) > 0)
    .sort((a, b) => (familyPassed[a.key] ?? 0) / familyAttempted[a.key] - (familyPassed[b.key] ?? 0) / familyAttempted[b.key])
    .map((f) => f.key);

  const belowEntry: Array<{ code: string; reason: string }> = [];
  for (const c of children) {
    if (c.ladderCeiling == null) { belowEntry.push({ code: c.code, reason: 'nunca llegó a un techo de escalera' }); continue; }
    if (med != null && med - c.ladderCeiling >= BELOW_ENTRY_RULE.RUNGS_BELOW_MEDIAN) {
      belowEntry.push({ code: c.code, reason: `techo ${c.ladderCeiling}, ${med - c.ladderCeiling} escalón(es) debajo de la mediana (${med})` });
    } else if (c.ladderCeiling <= BELOW_ENTRY_RULE.MAX_CEILING_STILL_BELOW) {
      belowEntry.push({ code: c.code, reason: `techo ${c.ladderCeiling} (≤ ${BELOW_ENTRY_RULE.MAX_CEILING_STILL_BELOW})` });
    }
  }

  const onTaskMinutes = children.map((c) => c.time.onTaskMs / 60_000);
  const hiddenPct = children.map((c) => pct(c.time.hiddenMs, c.time.totalMs)).filter((x): x is number => x != null);
  let voluntaryWorkshopContinuation = 0;
  for (const c of children) {
    const rows = eventsBySession.get(c.sessionId) ?? [];
    const open = rows.find((e) => e.type === 'arcade_open');
    if (!open) continue;
    const kept = rows.some((e) => e.type.startsWith('workshop_') && e.seq > open.seq);
    if (kept) voluntaryWorkshopContinuation++;
  }
  const typingRaces = children.map((c) => c.arcade?.typingRaces ?? 0);

  return {
    childCount: children.length,
    medianCeiling: med,
    modeCeiling: mode,
    mostCommonConcept,
    belowEntry,
    weakestConcepts,
    medianOnTaskMinutes: median(onTaskMinutes),
    medianHiddenPct: median(hiddenPct),
    voluntaryWorkshopContinuation,
    medianTypingRaces: median(typingRaces),
  };
}

export interface GradeEvaluation {
  grade4: GradeChildReport[];
  grade5: GradeChildReport[];
  /** Only computed over 4to (the group entering 5to next year); `null` when no 4to session is in this export. */
  summary4to: GradeClassSummary | null;
}

/** T42: printed by the report only when a 4to or 5to session exists in this export. */
export function gradeEvaluation(sessions: PtSession[], events: PtEvent[]): GradeEvaluation {
  const eventsBySession = groupBy(events, (e) => e.session_id);
  const arcade = arcadeReport(sessions, events);
  const arcadeBySession = new Map(arcade.children.map((c) => [c.sessionId, c]));
  const build = (grade: number) => sessions
    .filter((s) => s.grade === grade)
    .map((s) => gradeChildReport(s, eventsBySession.get(s.id) ?? [], arcadeBySession));
  const grade4 = build(4);
  const grade5 = build(5);
  return {
    grade4,
    grade5,
    summary4to: grade4.length ? gradeClassSummary(grade4, eventsBySession) : null,
  };
}

// ------------------------------------------------------------------ putting a report together

export interface Analysis {
  totalSessions: number;
  kept: PtSession[];
  dropped: DroppedSession[];
  classes: ClassCluster[];
  ladder: LadderReport;
  freePlay: FreePlayReport;
  repeatDrop: RepeatDropReport;
  predict: PredictReport;
  typing: TypingReport;
  help: HelpReport;
  attention: AttentionReport;
  classCommands: ClassCommandReport;
  survey: SurveyReport;
  race: RaceReport;
  arcade: ArcadeReport;
  copa: CopaReport;
  profiles: ProfileReport;
  grades: GradeEvaluation;
}

export function analyze(data: PtExport, opts: FilterOptions = {}): Analysis {
  const { kept, dropped } = filterNoise(data.sessions, data.events, opts);
  const keptIds = new Set(kept.map((s) => s.id));
  const events = data.events.filter((e) => keptIds.has(e.session_id));
  return {
    totalSessions: data.sessions.length,
    kept,
    dropped,
    classes: clusterClasses(kept),
    ladder: ladderReport(events),
    freePlay: freePlayReport(kept, events),
    repeatDrop: repeatDropReport(events),
    copa: copaReport(kept, events),
    predict: predictReport(events),
    typing: typingReport(events),
    help: helpReport(events),
    attention: attentionReport(events),
    classCommands: classCommandReport(events),
    survey: surveyReport(events),
    race: raceReport(events),
    arcade: arcadeReport(kept, events),
    profiles: profileReport(kept, events),
    grades: gradeEvaluation(kept, events),
  };
}
