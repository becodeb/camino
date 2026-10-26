// Copa v2 (C10): the child's JOURNEY through the five copas, as pure data.
//
// Where the engine (program, sim, tracks, rivals, hints) says what a run is,
// this says how a child moves through the Copa: which copa they start in
// (placement from the ladder), the steps of each copa (Ayudá al ciervo, then
// the tracks in order), when a track counts as done, the skip offer, the rival
// tier of the next race, the ghost hand after two failed runs, and the one
// program that grows across the copas (what is carried to the next track, what
// starts empty and is only shown faded, "tu programa anterior").
//
// Nothing here touches the DOM or storage: the flow (CopaStep.tsx) keeps one
// `Journey` and calls these functions; `store.ts` persists it.
//
// Rules (Design v2 in odd/tasks/copa-4to.md):
//  - A track is DONE when the child finishes it, in any place. Losing never
//    blocks: ¡Revancha! is always there.
//  - SKIP: finishing the copa's FIRST track on the FIRST run beating at least
//    the silver target offers "¡Saltar a la copa siguiente!" (never in copa 5).
//  - PLACEMENT: from the ladder's ceiling rung, never later than copa 3.
//  - GHOST: two failed runs in a row (a crash, a program that ends short, or
//    one that never ends) on the same track turn the ghost hand on.
//  - PROGRAM: within a copa it carries from track to track; copas 3 -> 4 and
//    4 -> 5 carry the main program; 1 -> 2 and 2 -> 3 start empty and show the
//    previous program as a faded reference.

import { slotCount, type Block, type Program } from './program';
import { nextRival, startTier } from './rivals';
import { COPA_IDS, TIERS, copaOf, type CopaId, type Tier, type TrackSpec } from './tracks';

export type Medal = 'gold' | 'silver' | 'bronze';
export const MEDAL_LABEL: Readonly<Record<Medal, string>> = { gold: 'oro', silver: 'plata', bronze: 'bronce' };

/** The best tier whose target the child beat; null when none (a track finished, but slower than the bronze program). */
export function medalOf(beaten: readonly Tier[]): Medal | null {
  return beaten.includes('gold') ? 'gold' : beaten.includes('silver') ? 'silver' : beaten.includes('bronze') ? 'bronze' : null;
}
const MEDAL_RANK: Record<Medal, number> = { bronze: 1, silver: 2, gold: 3 };
const betterMedal = (a: Medal | null, b: Medal | null): Medal | null => (!a ? b : !b ? a : MEDAL_RANK[b] > MEDAL_RANK[a] ? b : a);

// ------------------------------------------------------------------ placement

/** The ladder rungs (ladder.ts `CONCEPTS`) that open a copa: 5 `repeat`, 9 `fog_si` (conditions). */
export const PLACEMENT_RUNG = { repeat: 5, conditions: 9 } as const;

/**
 * The copa a child starts in, from the ladder's ceiling (the highest rung passed): `repetir` passed (rung 5+) starts at
 * copa 2, conditions passed (rung 9+, which also covers the events and variables rungs above it) at copa 3, and never
 * later than 3 (the events and variables copas are for everybody to arrive at, not to be placed into). No ladder: copa 1.
 */
export function placementCopa(ceilingRung: number | null | undefined): CopaId {
  if (typeof ceilingRung !== 'number' || !Number.isFinite(ceilingRung)) return 1;
  if (ceilingRung >= PLACEMENT_RUNG.conditions) return 3;
  if (ceilingRung >= PLACEMENT_RUNG.repeat) return 2;
  return 1;
}

// ------------------------------------------------------------------ the steps of a copa

export type JStep = { kind: 'deer'; copa: CopaId } | { kind: 'track'; copa: CopaId; track: TrackSpec };
export const stepKey = (s: JStep): string => (s.kind === 'deer' ? `deer-${s.copa}` : s.track.id);

/** "Ayudá al ciervo" opens copas 2 to 5 (the deer's program shows the concept the copa is about), then the copa's tracks in order. */
export function stepsOf(copa: CopaId): JStep[] {
  return [
    ...(copa >= 2 ? [{ kind: 'deer', copa } as JStep] : []),
    ...copaOf(copa).tracks.map((track) => ({ kind: 'track', copa, track }) as JStep),
  ];
}

export const copaOfTrack = (trackId: string): CopaId => Number(trackId.slice(1, 2)) as CopaId;

// ------------------------------------------------------------------ the journey

export interface TrackRecord {
  /** The child finished it (any place) and moved on (¡Seguir! or the skip). */
  done: boolean;
  /** ¡Largar! presses (revanchas included) and how many of them did not finish. */
  runs: number;
  fails: number;
  /** Failed runs in a row since the last finished one: 2 turns the ghost hand on. */
  failStreak: number;
  /** The ghost hand was shown on this track at some point. */
  ghost: boolean;
  bestPlace: 1 | 2 | 3 | null;
  bestMs: number | null;
  medal: Medal | null;
}

export interface DeerRecord {
  /** The step was left: fixed, or given up. */
  done: boolean;
  fixed: boolean;
  runs: number;
  failStreak: number;
  ghost: boolean;
  /** When the child first saw the deer's program (ms since the epoch); `ms` is set when it is left. */
  startedAt: number | null;
  ms: number | null;
}

export interface Journey {
  v: 2;
  startCopa: CopaId;
  ceiling: number | null;
  /** The rival to beat in the next race: starts from the ladder (`startTier`), then `nextRival` after every race. */
  rival: Tier;
  /** Where the child is: a copa and the index into `stepsOf(copa)` (`steps.length`: the copa is finished). */
  copa: CopaId;
  step: number;
  tracks: Record<string, TrackRecord>;
  deer: Partial<Record<CopaId, DeerRecord>>;
  /** The program of each track as the child left it (kept across a reload). */
  programs: Record<string, Program>;
  deerPrograms: Partial<Record<CopaId, Program>>;
  /** Copas the child skipped past ("¡Saltar a la copa siguiente!"). */
  skipped: CopaId[];
  /** The program the previous copa ended with (the next copa carries or shows it). */
  carry: Program | null;
  /** The program last edited on an own track, and in which copa. */
  last: { copa: CopaId; program: Program } | null;
  furthest: CopaId;
  /** `garage_place` was logged. */
  placed: boolean;
}

export const blankTrack = (): TrackRecord => ({ done: false, runs: 0, fails: 0, failStreak: 0, ghost: false, bestPlace: null, bestMs: null, medal: null });
export const blankDeer = (): DeerRecord => ({ done: false, fixed: false, runs: 0, failStreak: 0, ghost: false, startedAt: null, ms: null });

export const EMPTY: Program = { main: [] };
const isEmpty = (p: Program | null | undefined): boolean => !p || (!p.main.length && !p.onLog);

const isStepDone = (j: Journey, s: JStep): boolean => (s.kind === 'deer' ? !!j.deer[s.copa]?.done : !!j.tracks[s.track.id]?.done);

/** The copa is finished: all its tracks done, or the child skipped past it. */
export function copaDone(j: Journey, copa: CopaId): boolean {
  return j.skipped.includes(copa) || copaOf(copa).tracks.every((t) => j.tracks[t.id]?.done);
}
/** The highest copa finished (0 when none). The Arcade opens at 2, the mid-class survey at 3. */
export function copasFinished(j: Journey): number {
  return COPA_IDS.reduce((max, c) => (copaDone(j, c) ? c : max), 0);
}

export function newJourney(ceilingRung: number | null | undefined): Journey {
  const startCopa = placementCopa(ceilingRung);
  return enterCopa({
    v: 2, startCopa, ceiling: typeof ceilingRung === 'number' && Number.isFinite(ceilingRung) ? ceilingRung : null,
    rival: startTier(ceilingRung), copa: startCopa, step: 0, tracks: {}, deer: {}, programs: {}, deerPrograms: {},
    skipped: [], carry: null, last: null, furthest: startCopa, placed: false,
  }, startCopa);
}

/** The step a child lands on in a copa: the first one not done, or the first track to play it again once everything is done. */
function landingStep(j: Journey, copa: CopaId): number {
  const steps = stepsOf(copa);
  const open = steps.findIndex((s) => !isStepDone(j, s));
  return open >= 0 ? open : steps.findIndex((s) => s.kind === 'track');
}

/** Moves to a copa (the strip, the next copa, the skip). What the previous copa ended with becomes the carry. */
export function enterCopa(j: Journey, copa: CopaId): Journey {
  const carry = j.last && j.last.copa < copa && !isEmpty(j.last.program) ? j.last.program : j.carry;
  return { ...j, copa, step: landingStep(j, copa), carry, furthest: Math.max(j.furthest, copa) as CopaId };
}

/** A finished copa (`step` past its last step) moves on to the next one. */
export const copaFinishedHere = (j: Journey): boolean => j.step >= stepsOf(j.copa).length;

export function currentStep(j: Journey): JStep | null {
  return stepsOf(j.copa)[j.step] ?? null;
}

/** Goes to a specific track of the current copa (the hub's list). */
export function goToTrack(j: Journey, trackId: string): Journey {
  const copa = copaOfTrack(trackId);
  const at = stepsOf(copa).findIndex((s) => s.kind === 'track' && s.track.id === trackId);
  return at < 0 ? j : { ...enterCopa(j, copa), step: at };
}

// ------------------------------------------------------------------ runs, results, advancing

export interface RunInfo {
  outcome: 'finish' | 'crash' | 'stuck' | 'timeout';
  place?: 1 | 2 | 3;
  /** The tiers whose targets the run beat (`RaceResult.beaten`). */
  beaten?: readonly Tier[];
  timeMs?: number;
}

const FAILS_FOR_GHOST = 2;
export const GHOST_AFTER_FAILS = FAILS_FOR_GHOST;
export const ghostOn = (j: Journey, trackId: string): boolean => (j.tracks[trackId]?.failStreak ?? 0) >= FAILS_FOR_GHOST;
export const deerGhostOn = (j: Journey, copa: CopaId): boolean => (j.deer[copa]?.failStreak ?? 0) >= FAILS_FOR_GHOST;
/** The deer can be given up (and the copa goes on) after this many failed runs in a row. */
export const DEER_GIVE_UP_AFTER = 4;
export const deerCanGiveUp = (j: Journey, copa: CopaId): boolean => (j.deer[copa]?.failStreak ?? 0) >= DEER_GIVE_UP_AFTER;

/** A ¡Largar! on a track: counts the run, the failure streak (the ghost hand) and the best place, time and medal. `ghostNow`: the hand turned on with this run. */
export function recordRun(j: Journey, trackId: string, r: RunInfo): { journey: Journey; ghostNow: boolean } {
  const t = { ...(j.tracks[trackId] ?? blankTrack()) };
  t.runs++;
  let ghostNow = false;
  if (r.outcome === 'finish') {
    t.failStreak = 0;
    if (r.place != null && (t.bestPlace == null || r.place < t.bestPlace)) t.bestPlace = r.place;
    if (r.timeMs != null && (t.bestMs == null || r.timeMs < t.bestMs)) t.bestMs = r.timeMs;
    t.medal = betterMedal(t.medal, medalOf(r.beaten ?? []));
  } else {
    t.fails++;
    t.failStreak++;
    if (t.failStreak >= FAILS_FOR_GHOST && !t.ghost) { t.ghost = true; ghostNow = true; }
  }
  return { journey: { ...j, tracks: { ...j.tracks, [trackId]: t } }, ghostNow };
}

export function recordDeerRun(j: Journey, copa: CopaId, outcome: RunInfo['outcome'], now: number): { journey: Journey; ghostNow: boolean } {
  const d = { ...(j.deer[copa] ?? blankDeer()) };
  d.runs++;
  d.startedAt ??= now;
  let ghostNow = false;
  if (outcome === 'finish') d.failStreak = 0;
  else {
    d.failStreak++;
    if (d.failStreak >= FAILS_FOR_GHOST && !d.ghost) { d.ghost = true; ghostNow = true; }
  }
  return { journey: { ...j, deer: { ...j.deer, [copa]: d } }, ghostNow };
}

/** The race is over and the child leaves its result (¡Seguir!, ¡Revancha!, Espiá or the skip): the next rival is the tier the result points to. */
export const afterRace = (j: Journey, won: boolean): Journey => ({ ...j, rival: nextRival(j.rival, won) });

/** The first step after `index` that is not done, else the copa's end. */
function nextOpen(j: Journey, copa: CopaId, index: number): number {
  const steps = stepsOf(copa);
  for (let i = index + 1; i < steps.length; i++) if (!isStepDone(j, steps[i])) return i;
  return steps.length;
}

/** ¡Seguir! on a finished track: it is done and the child moves to the next step. */
export function completeTrack(j: Journey, trackId: string): Journey {
  const copa = copaOfTrack(trackId);
  const rec = { ...(j.tracks[trackId] ?? blankTrack()), done: true };
  const next: Journey = { ...j, tracks: { ...j.tracks, [trackId]: rec } };
  const index = stepsOf(copa).findIndex((s) => s.kind === 'track' && s.track.id === trackId);
  return { ...next, copa, step: nextOpen(next, copa, index) };
}

/** The child sees the deer's program: the clock of "ms" starts (once). */
export const startDeer = (j: Journey, copa: CopaId, now: number): Journey =>
  j.deer[copa]?.startedAt != null ? j : { ...j, deer: { ...j.deer, [copa]: { ...(j.deer[copa] ?? blankDeer()), startedAt: now } } };

/** Ayudá al ciervo is left: fixed, or given up. */
export function completeDeer(j: Journey, copa: CopaId, fixed: boolean, now: number): Journey {
  const d = { ...(j.deer[copa] ?? blankDeer()), done: true, fixed, ms: 0 };
  d.ms = d.startedAt != null ? Math.max(0, now - d.startedAt) : 0;
  const next: Journey = { ...j, deer: { ...j.deer, [copa]: d } };
  return { ...next, copa, step: nextOpen(next, copa, 0) };
}

/** "¡Saltar a la copa siguiente!": the copa counts as finished and the child enters the next one (never past copa 5). */
export function skipCopa(j: Journey, copa: CopaId): Journey {
  if (copa >= 5) return j;
  return enterCopa({ ...j, skipped: j.skipped.includes(copa) ? j.skipped : [...j.skipped, copa] }, (copa + 1) as CopaId);
}

/** The offer to skip, when a run finished: the copa's FIRST track, on the FIRST run of that track, beating at least the silver target. Never in copa 5. */
export function offerSkip(j: Journey, p: { trackId: string; beaten: readonly Tier[] }): boolean {
  const copa = copaOfTrack(p.trackId);
  if (copa >= 5 || j.skipped.includes(copa)) return false;
  if (copaOf(copa).tracks[0].id !== p.trackId) return false;
  const t = j.tracks[p.trackId];
  if (!t || t.runs !== 1 || t.fails !== 0) return false;
  return p.beaten.includes('silver') || p.beaten.includes('gold');
}

// ------------------------------------------------------------------ the growing program

/** Where the first track of a copa starts, and what is shown faded beside it. */
export function copaStart(j: Journey, copa: CopaId): { program: Program; reference: Program | null } {
  // copas 4 and 5 carry the program (they add to it: the event lane, nitro and laps); 2 and 3 start empty and show the previous one
  if (copa >= 4) return { program: j.carry ?? EMPTY, reference: null };
  if (copa >= 2 && !isEmpty(j.carry)) return { program: EMPTY, reference: j.carry };
  return { program: EMPTY, reference: null };
}

/**
 * The program a track opens with: the child's own last edit on it, else the previous track's (same copa), else the copa's
 * start. The faded reference ("tu programa anterior", copas 2 and 3) stays beside the FIRST track of the copa while the
 * child works on it, whatever they have built so far.
 */
export function programFor(j: Journey, trackId: string): { program: Program; reference: Program | null } {
  const copa = copaOfTrack(trackId);
  const first = copaOf(copa).tracks[0].id === trackId;
  const reference = first ? copaStart(j, copa).reference : null;
  const own = j.programs[trackId];
  if (own) return { program: own, reference };
  if (j.last && j.last.copa === copa) return { program: j.last.program, reference: null };
  return { program: copaStart(j, copa).program, reference };
}

/** The garage told the program changed. Nothing changes when it is the same (the garage reports once on mount). */
export function setProgram(j: Journey, trackId: string, program: Program): Journey {
  const prev = j.programs[trackId];
  if (prev ? JSON.stringify(prev) === JSON.stringify(program) : isEmpty(program)) return j; // the garage reports once on mount: an untouched, empty program is not an edit
  const copa = copaOfTrack(trackId);
  return { ...j, programs: { ...j.programs, [trackId]: program }, last: { copa, program } };
}

export function setDeerProgram(j: Journey, copa: CopaId, program: Program): Journey {
  const prev = j.deerPrograms[copa];
  return prev && JSON.stringify(prev) === JSON.stringify(program) ? j : { ...j, deerPrograms: { ...j.deerPrograms, [copa]: program } };
}

/** Ayudá al ciervo: the first track of the copa, with a memory of the deer's program size plus ONE spare place. */
export function deerSetup(copa: CopaId): { track: TrackSpec; program: Program; slots: number; bugBlockId: string } | null {
  if (copa < 2) return null;
  const base = copaOf(copa).tracks[0];
  const slots = slotCount(base.deer.program) + 1;
  return { track: { ...base, slots }, program: base.deer.program, slots, bugBlockId: base.deer.bugBlockId };
}

// ------------------------------------------------------------------ Espiá el programa del zorro

const flat = (blocks: readonly Block[], out: Block[] = []): Block[] => {
  for (const b of blocks) {
    out.push(b);
    if (b.kind === 'repeat') flat(b.body, out);
    else if (b.kind === 'if') { flat(b.then, out); flat(b.else, out); }
  }
  return out;
};

/** The program the child spies on: the rival tier's reference program (the fox's is the gold one). */
export const spiedProgram = (track: TrackSpec, tier: Tier): Program => track.refs[tier];

/**
 * The block ids that are "the trick" of a rival's program. The fox (gold): `trickBlockId` (copa 1: the jumps over the
 * puddles; copa 2 the `repetir`; copa 3 the `si`; copa 4 the event hat; copa 5 the turbo). The coatí (silver): its
 * first `saltar` (what lets it cross the puddles without skidding), else its first `repetir`. The carpincho (bronze):
 * its first `repetir`, else its first block (what it does is plain). Always at least one id, always in the program.
 */
export function trickIds(track: TrackSpec, tier: Tier): string[] {
  const p = track.refs[tier];
  const all = flat(p.main).concat(p.onLog ? flat(p.onLog.body) : []);
  if (tier === 'gold') {
    if (track.copa === 1) {
      const jumps = all.filter((b) => b.kind === 'jump').map((b) => b.id);
      if (jumps.length) return jumps;
    }
    return [track.trickBlockId];
  }
  const jump = all.find((b) => b.kind === 'jump');
  const repeat = all.find((b) => b.kind === 'repeat');
  const pick = tier === 'silver' ? jump ?? repeat : repeat;
  return [(pick ?? all[0]).id];
}

/** The tiers a child can spy on (every rival there is). */
export const SPY_TIERS: readonly Tier[] = TIERS;

// ------------------------------------------------------------------ reading a stored journey

const isMedal = (m: unknown): m is Medal => m === 'gold' || m === 'silver' || m === 'bronze';

/** A stored journey, checked: anything unexpected returns null (the flow starts a fresh one from the ladder). */
export function parseJourney(raw: unknown): Journey | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<Journey>;
  if (o.v !== 2 || !COPA_IDS.includes(o.copa as CopaId) || !COPA_IDS.includes(o.startCopa as CopaId)) return null;
  if (!TIERS.includes(o.rival as Tier) || typeof o.step !== 'number' || !o.tracks || typeof o.tracks !== 'object') return null;
  const tracks: Record<string, TrackRecord> = {};
  for (const [id, t] of Object.entries(o.tracks)) {
    if (!/^c[1-5]-[a-c]$/.test(id) || !t || typeof t !== 'object') continue;
    const r = t as Partial<TrackRecord>;
    tracks[id] = {
      ...blankTrack(), done: !!r.done, runs: Number(r.runs) || 0, fails: Number(r.fails) || 0, failStreak: Number(r.failStreak) || 0, ghost: !!r.ghost,
      bestPlace: r.bestPlace === 1 || r.bestPlace === 2 || r.bestPlace === 3 ? r.bestPlace : null,
      bestMs: typeof r.bestMs === 'number' ? r.bestMs : null, medal: isMedal(r.medal) ? r.medal : null,
    };
  }
  return {
    v: 2, startCopa: o.startCopa as CopaId, ceiling: typeof o.ceiling === 'number' ? o.ceiling : null, rival: o.rival as Tier,
    copa: o.copa as CopaId, step: Math.max(0, Math.min(stepsOf(o.copa as CopaId).length, Math.floor(o.step))), tracks,
    deer: o.deer && typeof o.deer === 'object' ? o.deer : {}, programs: o.programs && typeof o.programs === 'object' ? o.programs : {},
    deerPrograms: o.deerPrograms && typeof o.deerPrograms === 'object' ? o.deerPrograms : {},
    skipped: Array.isArray(o.skipped) ? o.skipped.filter((c): c is CopaId => COPA_IDS.includes(c)) : [],
    carry: o.carry && typeof o.carry === 'object' ? o.carry : null, last: o.last && typeof o.last === 'object' ? o.last : null,
    furthest: COPA_IDS.includes(o.furthest as CopaId) ? (o.furthest as CopaId) : (o.copa as CopaId), placed: !!o.placed,
  };
}

/** The best medal earned on each copa (and whether it is finished): the Arcade card's five dots. */
export function copaMedals(j: Journey | null): { copa: CopaId; medal: Medal | null; done: boolean }[] {
  return COPA_IDS.map((copa) => ({
    copa,
    medal: j ? copaOf(copa).tracks.reduce<Medal | null>((best, t) => betterMedal(best, j.tracks[t.id]?.medal ?? null), null) : null,
    done: !!j && copaDone(j, copa),
  }));
}
