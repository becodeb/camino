// "La carrera" (T33): the pure logic of the race. The child's kart races two
// forest critters on a side-scrolling road; each stretch of road ahead is a
// short row of pieces (flat →, a ramp up ↑, a ramp down ↓) with an empty
// slot under each piece. A right arrow block nudges the kart forward; a full,
// right tape makes it zoom through the stretch; long straights offer
// `repetir` as a turbo. The child never loses: the critters are
// rubber-banded to the child's own pace and always cross the line after.
//
// Everything here is pure and deterministic (seeded), so it is unit-tested:
// the stretch generator by tier (race.test.ts checks every tier rule over
// many seeds), checking a tape (a real Program, with a real repeat) against a
// road, the course geometry, and the rubber band.

import { unroll } from '../game/engine';
import type { Program, ProgramItem } from '../game/model';

/** The road's directions in the side view: flat (→), a ramp up (↑), a ramp down (↓). No ← in the race. */
export type RoadDir = 'right' | 'up' | 'down';
export const ROAD_DIRS: readonly RoadDir[] = ['right', 'up', 'down'];

export interface Stretch {
  road: RoadDir[];
  /** A long straight that offers `repetir` (the turbo). */
  turbo: boolean;
}

export interface RaceDef { tier: number; seed: number; stretches: Stretch[] }

/** The road climbs at most two steps above the ground (and never below it): every stretch is drivable. */
export const MAX_HEIGHT = 2;
/** A turbo straight's length. */
export const TURBO_LEN = { min: 4, max: 6 } as const;

export interface TierRule {
  stretches: number;
  /** Arrows per ordinary stretch. */
  min: number;
  max: number;
  /** Ordinary stretches mix directions (tier 2 on); tier 1 keeps one direction per stretch. */
  mixed: boolean;
  /** How many turbo straights the race has. */
  turbo: number;
}

/**
 * The tiers ("¡Otra carrera!" goes one up, endless; 4 and beyond stay as 4).
 * Tuned for a race of about 60–90 s for a typical 1ro child (see the
 * feature document's T33 tuning notes): about 9 arrows in tier 1, about 15
 * in tier 2, about 13 plus two turbos in tier 3, about 20 plus two turbos in tier 4.
 */
const RULES: readonly TierRule[] = [
  { stretches: 6, min: 1, max: 2, mixed: false, turbo: 0 }, // and at least two stretches of two (raceProblems)
  { stretches: 6, min: 2, max: 3, mixed: true, turbo: 0 },
  { stretches: 7, min: 2, max: 3, mixed: true, turbo: 2 },
  { stretches: 7, min: 3, max: 5, mixed: true, turbo: 2 },
];

export const tierRule = (tier: number): TierRule => RULES[Math.min(RULES.length, Math.max(1, Math.floor(tier) || 1)) - 1];

/** mulberry32: the same seed draws the same race. */
function rng(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const step = (d: RoadDir) => (d === 'up' ? 1 : d === 'down' ? -1 : 0);

/** The directions allowed at height `h` (the road stays between the ground and MAX_HEIGHT). */
const allowedAt = (h: number): RoadDir[] => ROAD_DIRS.filter((d) => h + step(d) >= 0 && h + step(d) <= MAX_HEIGHT);

/** One attempt at a race (it may break a rule: generateRace keeps the first that does not). */
function draft(tier: number, seed: number, attempt: number): RaceDef {
  const rule = tierRule(tier);
  const r = rng(seed * 31 + attempt * 7919 + tier * 101);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = <T,>(xs: readonly T[], weights: readonly number[]) => {
    const total = weights.reduce((a, b) => a + b, 0);
    let x = r() * total;
    for (let i = 0; i < xs.length; i++) { x -= weights[i]; if (x < 0) return xs[i]; }
    return xs[xs.length - 1];
  };
  const turboAt = new Set<number>();
  if (rule.turbo >= 1) turboAt.add(int(2, 3));
  if (rule.turbo >= 2) turboAt.add(Math.min(rule.stretches - 1, [...turboAt][0] + int(2, 3)));
  const stretches: Stretch[] = [];
  let h = 0;
  for (let i = 0; i < rule.stretches; i++) {
    if (turboAt.has(i)) {
      stretches.push({ road: Array<RoadDir>(int(TURBO_LEN.min, TURBO_LEN.max)).fill('right'), turbo: true });
      continue;
    }
    // tier 1 opens with one flat piece: the first-time ghost demo shows → under a flat road
    if (tier <= 1 && i === 0) { stretches.push({ road: ['right'], turbo: false }); continue; }
    const len = int(rule.min, rule.max);
    let road: RoadDir[] = [];
    if (!rule.mixed) {
      // one direction: as many pieces as the height lets it
      const dirs = allowedAt(h);
      const d = pick(dirs, dirs.map((x) => (x === 'right' ? 1 : 1.3)));
      const room = d === 'up' ? MAX_HEIGHT - h : d === 'down' ? h : len;
      road = Array<RoadDir>(Math.max(1, Math.min(len, room))).fill(d);
    } else {
      for (let tries = 0; tries < 20; tries++) {
        road = [];
        let hh = h;
        for (let j = 0; j < len; j++) {
          const dirs = allowedAt(hh);
          const d = pick(dirs, dirs.map((x) => (x === 'right' ? 1 : 1.2)));
          road.push(d);
          hh += step(d);
        }
        if (new Set(road).size >= 2) break;
      }
    }
    for (const d of road) h += step(d);
    stretches.push({ road, turbo: false });
  }
  return { tier: Math.max(1, Math.floor(tier) || 1), seed, stretches };
}

/** Every rule a race breaks (none for a good race): what generateRace guarantees and race.test.ts checks. */
export function raceProblems(race: RaceDef): string[] {
  const rule = tierRule(race.tier);
  const out: string[] = [];
  if (race.stretches.length !== rule.stretches) out.push(`stretches ${race.stretches.length} != ${rule.stretches}`);
  let h = 0;
  const seen = new Set<RoadDir>();
  race.stretches.forEach((s, i) => {
    if (!s.road.length) out.push(`stretch ${i} is empty`);
    if (s.turbo) {
      if (s.road.some((d) => d !== 'right')) out.push(`turbo stretch ${i} is not straight`);
      if (s.road.length < TURBO_LEN.min || s.road.length > TURBO_LEN.max) out.push(`turbo stretch ${i} length ${s.road.length}`);
      if (i === 0) out.push('the race opens with a turbo');
    } else {
      const lo = race.tier <= 1 && i === 0 ? 1 : rule.min;
      if (s.road.length < lo || s.road.length > rule.max) out.push(`stretch ${i} length ${s.road.length}`);
      const kinds = new Set(s.road).size;
      if (rule.mixed && kinds < 2) out.push(`stretch ${i} does not mix directions`);
      if (!rule.mixed && kinds !== 1) out.push(`stretch ${i} mixes directions`);
    }
    for (const d of s.road) {
      seen.add(d);
      h += step(d);
      if (h < 0 || h > MAX_HEIGHT) out.push(`stretch ${i} leaves the road (height ${h})`);
    }
  });
  const turbos = race.stretches.filter((s) => s.turbo).length;
  if (turbos !== rule.turbo) out.push(`turbos ${turbos} != ${rule.turbo}`);
  for (let i = 1; i < race.stretches.length; i++) if (race.stretches[i].turbo && race.stretches[i - 1].turbo) out.push(`turbos ${i - 1} and ${i} touch`);
  if (race.tier <= 1) {
    if (race.stretches[0]?.road.join() !== 'right') out.push('tier 1 does not open with one flat piece');
    // a race of single pieces only would be over in a few taps: at least two stretches of two
    if (race.stretches.filter((x) => x.road.length >= 2).length < 2) out.push('tier 1 has fewer than two stretches of two pieces');
    if (!seen.has('up') || !seen.has('down')) out.push('tier 1 lacks an up or a down stretch');
  } else if (seen.size < 3) out.push('the race does not use all three directions');
  return out;
}

/** A known good race per tier: only if no seeded draft passes (never seen in the tests). */
const FALLBACK: Record<number, RaceDef['stretches']> = {
  1: [['right'], ['up'], ['right', 'right'], ['down'], ['up', 'up'], ['down', 'down']].map((road) => ({ road: road as RoadDir[], turbo: false })),
  2: [['right', 'up'], ['right', 'down'], ['up', 'right', 'down'], ['right', 'up'], ['up', 'down'], ['right', 'down', 'right']].map((road) => ({ road: road as RoadDir[], turbo: false })),
  3: [['right', 'up'], ['right', 'down'], ['right', 'right', 'right', 'right', 'right'], ['up', 'right'], ['right', 'right', 'right', 'right'], ['down', 'right'], ['up', 'down']]
    .map((road, i) => ({ road: road as RoadDir[], turbo: i === 2 || i === 4 })),
  4: [['right', 'up', 'right'], ['down', 'right', 'up'], ['right', 'right', 'right', 'right', 'right', 'right'], ['right', 'down', 'right', 'up'], ['right', 'right', 'right', 'right', 'right'], ['down', 'right', 'right'], ['up', 'right', 'down']]
    .map((road, i) => ({ road: road as RoadDir[], turbo: i === 2 || i === 4 })),
};

/** The race of a tier, drawn from `seed` (deterministic). Every rule of raceProblems holds. */
export function generateRace(tier: number, seed: number): RaceDef {
  const t = Math.max(1, Math.floor(tier) || 1);
  for (let attempt = 0; attempt < 200; attempt++) {
    const r = draft(t, seed, attempt);
    if (!raceProblems(r).length) return r;
  }
  return { tier: t, seed, stretches: FALLBACK[Math.min(4, t)].map((s) => ({ road: [...s.road], turbo: s.turbo })) };
}

/** A road as one letter a piece (telemetry): R(ight), U(p), D(own). */
export const roadCode = (road: readonly RoadDir[]) => road.map((d) => (d === 'right' ? 'R' : d === 'up' ? 'U' : 'D')).join('');

// ------------------------------------------------------------------ the tape

export type Block = ProgramItem;
export const arrowBlock = (d: RoadDir): Block => ({ t: 'cmd', cmd: d });

/** The arrows a tape plays, in order (a repeat unrolled), as the engine plays a program. */
export const tapeDirs = (tape: Program): string[] => unroll(tape).map((c) => c.cmd);
/** How many pieces of the road the tape covers (a repeat covers `count`). */
export const filledOf = (tape: Program) => tapeDirs(tape).length;

export type Verdict = 'right' | 'wrong' | 'complete' | 'full';

/**
 * A block placed at the end of the tape: `right` (it matches the next piece
 * of the road), `complete` (…and the tape now covers the whole stretch),
 * `wrong` (it does not match: the returned tape holds it so it can be drawn
 * before it pops out), or `full` (nothing more fits; tape unchanged).
 */
export function judge(road: readonly RoadDir[], tape: Program, block: Block): { verdict: Verdict; tape: Program } {
  if (filledOf(tape) >= road.length) return { verdict: 'full', tape };
  const next = [...tape, structuredClone(block)];
  const dirs = tapeDirs(next);
  const fits = dirs.length <= road.length && dirs.every((d, i) => d === road[i]);
  if (!fits) return { verdict: 'wrong', tape: next };
  return { verdict: dirs.length === road.length ? 'complete' : 'right', tape: next };
}

/**
 * The turbo block a stretch offers now: a real repeat holding one → whose
 * count is the pieces still empty (so it always fills the rest of the
 * straight), only on a turbo straight with at least two pieces left.
 */
export function repeatFor(stretch: Stretch, tape: Program): Block | null {
  if (!stretch.turbo) return null;
  const left = stretch.road.length - filledOf(tape);
  if (left < 2) return null;
  return { t: 'loop', count: left, body: ['right'] };
}

/** The tape item that covers piece `slot` (0-based), or null when that piece is still empty. */
export function ownerOf(tape: Program, slot: number): number | null {
  let at = 0;
  for (let i = 0; i < tape.length; i++) {
    const n = filledOf([tape[i]]);
    if (slot < at + n) return i;
    at += n;
  }
  return null;
}

/** The tape without the block covering piece `slot` and everything after it (a tap on a filled slot). */
export function cutAt(tape: Program, slot: number): Program {
  const i = ownerOf(tape, slot);
  return i == null ? tape : tape.slice(0, i);
}

// ------------------------------------------------------------------ the course

/** Course units: one road piece is one unit. */
export const START = 1;
/** Where the start line is drawn (the karts wait just behind it). */
export const START_LINE = 1.55;
/** The critters line up a little behind the child (the child starts in front: and the three karts do not hide each other). */
export const RIVAL_START: readonly [number, number] = [START - 0.5, START - 0.95];
/** A flat unit between stretches: the kart cruises it on its own while the next stretch appears. */
export const CONNECTOR = 1;
/** Flat road after the finish line (the karts slow down and park there). */
export const RUN_OUT = 6;
/** Where the child's kart parks after the finish line. */
export const PARK = 2.6;

export interface Course {
  /** The road's height (in steps) at every whole unit, from 0 to `length`. */
  heights: number[];
  /** Each stretch's first and last unit. */
  starts: number[];
  ends: number[];
  finish: number;
  length: number;
}

/** The road of a race: a flat lead-in, the stretches with a flat connector after each, the finish line, the run-out. */
export function courseOf(race: RaceDef): Course {
  const heights = [0, 0];
  let h = 0;
  const starts: number[] = [];
  const ends: number[] = [];
  for (const s of race.stretches) {
    starts.push(heights.length - 1);
    for (const d of s.road) { h += step(d); heights.push(h); }
    ends.push(heights.length - 1);
    for (let i = 0; i < CONNECTOR; i++) heights.push(h);
  }
  const finish = heights.length - 1;
  for (let i = 0; i < RUN_OUT; i++) heights.push(h);
  return { heights, starts, ends, finish, length: heights.length - 1 };
}

/** The road's height (in steps) at any point of the course (linear along each piece). */
export function heightAt(c: Course, u: number): number {
  if (u <= 0) return c.heights[0];
  if (u >= c.length) return c.heights[c.length];
  const i = Math.floor(u);
  const f = u - i;
  return c.heights[i] + (c.heights[i + 1] - c.heights[i]) * f;
}

/** The slope of the piece under `u`: +1 a ramp up, -1 down, 0 flat. */
export function slopeAt(c: Course, u: number): number {
  const i = Math.max(0, Math.min(c.length - 1, Math.floor(u)));
  return c.heights[i + 1] - c.heights[i];
}

/** How far a right block nudges the kart into its stretch (the moto game's per-key lurch). */
export const LURCH = 0.3;
/** Where the kart waits in stretch `k` with `filled` pieces covered (never at the stretch's end: that is the zoom's). */
export function restingSpot(c: Course, k: number, filled: number): number {
  const len = c.ends[k] - c.starts[k];
  return c.starts[k] + Math.min(filled * LURCH, Math.max(0, len - 0.35));
}

/** Course units a second: the zoom through a stretch, and the turbo's. */
export const ZOOM_SPEED = 2.6;
export const TURBO_SPEED = 5.2;

// ------------------------------------------------------------------ the rubber band

/**
 * The critters follow the child's own pace (units/s over the last few
 * seconds), each towards a spot relative to the child that changes along
 * the race: the bold one (role 0) leads a while in the middle, the other
 * (role 1) a bit later; in the last stretch both drop behind. They never get
 * more than MAX_LEAD ahead, never reach the line before the child, and
 * almost stop when the child is idle. Once the child crossed, they drive on
 * at AFTER_SPEED (the margin is measured from there).
 */
export const BAND = {
  maxLead: 1.3,
  maxSpeed: 2.2,
  /** Far behind where it wants to be (a fast child left it): it may hurry this much, so the race stays close. */
  catchUp: 3.0,
  catchUpFrom: 2.5,
  /** Still alive while behind: a slow creep forward. */
  creep: 0.12,
  /** The last stretch: they creep slower and wait well before the line. */
  lastCreep: 0.05,
  finishGap: 1.6,
  gain: 0.9,
  /** Pace used before the child has any (the start). */
  minPace: 0.15,
  idleFrom: 4000,
  idleFull: 10_000,
  /** The share of their speed left when the child has been idle for idleFull. */
  idleFloor: 0.05,
  afterSpeed: 1.9,
} as const;

export interface BandInput {
  /** The child's kart (course units). */
  me: number;
  finish: number;
  /** The child's recent pace (units/s). */
  pace: number;
  /** How long the child has not placed a block (0 while the kart is zooming). */
  idleMs: number;
  /** The child is on the race's last stretch. */
  last: boolean;
  /** The child crossed the line. */
  meDone: boolean;
}

/** Where a critter wants to be relative to the child, by how far the child is (0–1). */
export function rivalOffset(role: 0 | 1, progress: number, last: boolean): number {
  if (last) return role === 0 ? -1.0 : -1.5;
  if (role === 0) return progress >= 0.25 && progress < 0.62 ? 0.9 : -0.6;
  return progress >= 0.55 && progress < 0.8 ? 0.5 : -1.1;
}

/** A critter's speed now (units/s). */
export function rivalSpeed(pos: number, inp: BandInput, role: 0 | 1): number {
  if (inp.meDone) return BAND.afterSpeed;
  const desired = inp.me + rivalOffset(role, inp.me / Math.max(1, inp.finish), inp.last);
  const pace = Math.max(BAND.minPace, inp.pace);
  const creep = inp.last ? BAND.lastCreep : BAND.creep;
  const top = desired - pos > BAND.catchUpFrom ? BAND.catchUp : BAND.maxSpeed;
  const v = Math.min(top, Math.max(creep, pace + BAND.gain * (desired - pos)));
  const idle = inp.idleMs <= BAND.idleFrom ? 1
    : Math.max(BAND.idleFloor, 1 - (inp.idleMs - BAND.idleFrom) / (BAND.idleFull - BAND.idleFrom) * (1 - BAND.idleFloor));
  return v * idle;
}

/** A critter's next position after `dt` seconds: never backwards, never past the caps while the child has not crossed. */
export function stepRival(pos: number, dt: number, inp: BandInput, role: 0 | 1): number {
  const next = pos + rivalSpeed(pos, inp, role) * dt;
  if (inp.meDone) return next;
  const cap = Math.min(inp.me + BAND.maxLead, inp.finish - BAND.finishGap);
  return Math.max(pos, Math.min(next, cap));
}

/** The child's pace: units gained over the last `windowMs` (from timestamped positions). */
export function paceOf(samples: readonly { t: number; me: number }[], now: number, windowMs = 10_000): number {
  if (samples.length < 2) return 0;
  const from = now - windowMs;
  const old = samples.find((s) => s.t >= from) ?? samples[0];
  const cur = samples[samples.length - 1];
  const dt = (now - Math.min(old.t, cur.t)) / 1000;
  return dt > 0.5 ? Math.max(0, (cur.me - old.me) / dt) : 0;
}

// ------------------------------------------------------------------ the session's race state

/** What carries over between races (and across a reload): cups won, races started, the next race's tier. */
export interface RaceSaved { cups: number; raceNo: number; tier: number }
export const RACE_START: RaceSaved = { cups: 0, raceNo: 0, tier: 1 };

/** A finished race: a cup, and the next one a tier harder. */
export const afterWin = (s: RaceSaved): RaceSaved => ({ ...s, cups: s.cups + 1, tier: s.tier + 1 });

/**
 * Each cup won is also a level solved in the session's progress (it plants
 * the race's seed): `race-cup-<n>`. The progress outlives a step change and
 * a reload (resume.ts keeps it), so the cups are counted from it too.
 */
export const CUP_PREFIX = 'race-cup-';
export const cupsIn = (solved: Readonly<Record<string, boolean>>) => Object.keys(solved).filter((k) => k.startsWith(CUP_PREFIX) && solved[k]).length;

/** A saved race state reconciled with the cups in the progress: never fewer cups, races or tiers than the wins say. */
export const withCups = (s: RaceSaved, cups: number): RaceSaved => ({ cups: Math.max(s.cups, cups), raceNo: Math.max(s.raceNo, cups), tier: Math.max(s.tier, cups + 1) });

/** Reads a saved race state (resume), falling back to the start for anything malformed. */
export function readSaved(x: unknown): RaceSaved {
  const o = (x && typeof x === 'object' ? x : {}) as Partial<RaceSaved>;
  const n = (v: unknown, lo: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo ? Math.floor(v) : null);
  return { cups: n(o.cups, 0) ?? 0, raceNo: n(o.raceNo, 0) ?? 0, tier: n(o.tier, 1) ?? 1 };
}
