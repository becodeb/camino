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

function durationMs(s: PtSession): number {
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

// ------------------------------------------------------------------ T37: motivation profiles (a heuristic, not a measurement)

export type Profile = 'racer' | 'collector' | 'dresser' | 'explorer' | 'keyboard' | 'undecided';

export interface ChildProfile {
  sessionId: string;
  profile: Profile;
  evidence: string;
}

/** Named thresholds, so the rule is documented in one place, not buried in arithmetic. */
export const PROFILE_RULES = {
  /** Below this total score every signal gives, the child is `undecided` (too little free-play data). */
  MIN_TOTAL_SCORE: 3,
  /** A voluntary "¡Otra carrera!" counts for more than just finishing the first race (it was not required). */
  RACE_AGAIN_WEIGHT: 3,
  RACE_FINISH_WEIGHT: 2,
  /** Wardrobe pieces tried on/off (not how long): the "collector" count signal, alongside cups won. */
  WARDROBE_TAP_WEIGHT: 1,
  CUP_WEIGHT: 2,
  /** Every 10s in the wardrobe is one "dresser" point: this profile is about lingering, not counting. */
  WARDROBE_MS_PER_POINT: 10_000,
  /** `explorer` only scores when activities are both numerous AND short-lived (many quick tries, not one deep one). */
  EXPLORER_MIN_ACTIVITIES: 3,
  EXPLORER_MAX_MEDIAN_MS: 90_000,
  EXPLORER_WEIGHT_PER_ACTIVITY: 2,
  /** Every 5 physical keypresses in the typing game is one "keyboard" point. */
  KEYBOARD_KEYS_PER_POINT: 5,
};

interface ChildSignals {
  sessionId: string;
  racesStarted: number;
  racesAgain: number;
  cups: number;
  distinctActivities: number;
  medianActivityMs: number | null;
  wardrobeTaps: number;
  wardrobeMs: number;
  physicalTypingKeys: number;
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
    const wardrobeTaps = rows.filter((e) => e.type === 'wardrobe' && (e.payload.action === 'on' || e.payload.action === 'off')).length;
    const wardrobeClose = rows.find((e) => e.type === 'wardrobe' && e.payload.action === 'close');
    const wardrobeMs = Number(wardrobeClose?.payload.duration_ms ?? 0) || 0;
    const physicalTypingKeys = rows.filter((e) => e.type === 'typing' && e.payload.input === 'physical').length;
    return {
      sessionId: s.id,
      racesStarted: starts.length,
      racesAgain: starts.filter((e) => e.payload.again === true).length,
      cups: lastCups,
      distinctActivities,
      medianActivityMs,
      wardrobeTaps,
      wardrobeMs,
      physicalTypingKeys,
    };
  });
}

/**
 * A simple, documented heuristic learned from free-play behaviour only
 * (never from the core route): the highest-scoring profile wins, `racer`
 * breaking a tie with `collector` since a race finish already implies at
 * least one cup. Below `MIN_TOTAL_SCORE` the child is `undecided` — this is
 * a rule to learn from, not a diagnosis.
 */
export function classifyChild(sig: ChildSignals): ChildProfile {
  const r = PROFILE_RULES;
  const racerScore = sig.racesStarted * r.RACE_FINISH_WEIGHT + sig.racesAgain * r.RACE_AGAIN_WEIGHT;
  const collectorScore = sig.cups * r.CUP_WEIGHT + sig.wardrobeTaps * r.WARDROBE_TAP_WEIGHT;
  const dresserScore = sig.wardrobeMs / r.WARDROBE_MS_PER_POINT;
  const explorerScore = sig.distinctActivities >= r.EXPLORER_MIN_ACTIVITIES
    && sig.medianActivityMs != null && sig.medianActivityMs < r.EXPLORER_MAX_MEDIAN_MS
    ? sig.distinctActivities * r.EXPLORER_WEIGHT_PER_ACTIVITY : 0;
  const keyboardScore = sig.physicalTypingKeys / r.KEYBOARD_KEYS_PER_POINT;

  const scores: Array<[Profile, number]> = [
    ['racer', racerScore], ['collector', collectorScore], ['dresser', dresserScore],
    ['explorer', explorerScore], ['keyboard', keyboardScore],
  ];
  const [top, topScore] = scores.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
  if (topScore < r.MIN_TOTAL_SCORE) {
    return { sessionId: sig.sessionId, profile: 'undecided', evidence: 'too little free-play signal' };
  }
  const evidence = `races ${sig.racesStarted} (again ${sig.racesAgain}), cups ${sig.cups}, activities ${sig.distinctActivities}`
    + `, wardrobe ${sig.wardrobeTaps} taps/${Math.round(sig.wardrobeMs / 1000)}s, physical keys ${sig.physicalTypingKeys}`;
  return { sessionId: sig.sessionId, profile: top, evidence };
}

export interface ProfileReport {
  children: ChildProfile[];
  distribution: Record<string, number>;
  byGrade: Record<string, Record<string, number>>;
}

export function profileReport(sessions: PtSession[], events: PtEvent[]): ProfileReport {
  const signals = collectChildSignals(sessions, events);
  const children = signals.map(classifyChild);
  const gradeOf = new Map(sessions.map((s) => [s.id, s.grade]));
  const byGrade: Record<string, Record<string, number>> = {};
  for (const c of children) {
    const g = String(gradeOf.get(c.sessionId) ?? '—');
    const bucket = byGrade[g] ?? {};
    bucket[c.profile] = (bucket[c.profile] ?? 0) + 1;
    byGrade[g] = bucket;
  }
  return { children, distribution: count(children, (c) => c.profile), byGrade };
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
  profiles: ProfileReport;
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
    predict: predictReport(events),
    typing: typingReport(events),
    help: helpReport(events),
    attention: attentionReport(events),
    classCommands: classCommandReport(events),
    survey: surveyReport(events),
    race: raceReport(events),
    profiles: profileReport(kept, events),
  };
}
