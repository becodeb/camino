// Adaptive typing-race rivals (C07, 4to only). C02's rivals typed at a FIXED
// 6/10/15 wpm: a very slow typist could never win and a very fast one never
// lost, which is not what the user meant ("rivals adapt to the child's speed").
// The rule, all pure and unit-tested (typingAdapt.test.ts):
//
// - FIRST race: nothing is known about the child yet, so the two rivals follow
//   the child's LIVE pace, gently: their target is the child's pace over the
//   last few seconds times a factor a bit below 1, and their speed eases
//   towards it slowly. It is a soft band, not the 1ro band that always lets
//   the child win: if the child slows down for a while the rivals do not fully
//   follow, so they can pass the child.
// - From the SECOND race: the rivals' base pace is the child's measured wpm of
//   the previous race, times 0.90 after a loss (the next race is a bit
//   slower) or 1.05 after a win (a bit faster), clamped to sane bounds. The
//   two rivals sit around the base (SPREAD) at a constant speed, so the places
//   1/2/3 are all possible and the result is truthful (they really typed that
//   fast). A child who types the same every race wins about 2 of 3.
//
// SPREAD was tuned by simulation: with the child's pace varying ~10% from one
// race to the next (typingAdapt.test.ts), a 2 wpm and a 25 wpm child both win
// roughly 60-70% of their races. The rule is relative to the child's own pace,
// so it does not care how fast that is; the clamp only bounds the extremes.

import { wpm } from './typingRace';

export type Adapt = 'first' | 'after_win' | 'after_loss';

/** What carries over between typing races (in memory, and across a reload through resume.ts). */
export interface AdaptState {
  /** The child's measured wpm in their last finished race (null before any). */
  lastWpm: number | null;
  /** Whether they won (1st place) that race (null before any). */
  lastWon: boolean | null;
}
export const ADAPT_START: AdaptState = { lastWpm: null, lastWon: null };

/** The rivals' base pace is clamped here (words per minute). A 4to child's median is 9.3; nothing real is below ~1.5 or above 40. */
export const BASE_MIN_WPM = 1.2;
export const BASE_MAX_WPM = 40;
/** The next race's base against the child's measured wpm of the previous one. */
export const AFTER_LOSS = 0.9;
export const AFTER_WIN = 1.05;
/** The two rivals around the base: [slower, faster]. The slower one can finish behind the child, the faster one decides a win. */
export const SPREAD: readonly [number, number] = [0.84, 0.95];
/**
 * The first race's rivals, as a fraction of the child's live pace: a little
 * under it, so a child who keeps going wins by a small margin...
 */
export const FIRST_SPREAD: readonly [number, number] = [0.88, 0.97];
/**
 * ...but a rival that falls behind catches up (wpm of extra speed per
 * character behind, up to PULL_MAX_WPM). That is the soft band: the rivals
 * hover about a character or two behind a steady child, close enough that
 * when the child slows down (the live pace and the rival's speed both lag
 * behind it by a few seconds) they really do pass. The 1ro band instead eases
 * the rivals off at the end so the child always wins.
 */
export const PULL_WPM_PER_CHAR = 0.6;
export const PULL_MAX_WPM = 10;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

export const adaptOf = (s: AdaptState): Adapt => (s.lastWpm == null || s.lastWon == null ? 'first' : s.lastWon ? 'after_win' : 'after_loss');

/** The base pace of this race's rivals, from the state (null in the first race: they follow the child's live pace instead). */
export function rivalBase(s: AdaptState): number | null {
  const a = adaptOf(s);
  if (a === 'first') return null;
  return clamp((s.lastWpm as number) * (a === 'after_win' ? AFTER_WIN : AFTER_LOSS), BASE_MIN_WPM, BASE_MAX_WPM);
}

/** The two rivals' constant speeds around a base: [slower, faster], in words per minute. */
export const rivalWpms = (base: number): [number, number] => [base * SPREAD[0], base * SPREAD[1]];

/** The state after a finished race. A race without a measurable pace (no time or no right key) leaves the state as it was. */
export function afterRace(s: AdaptState, r: { wpm: number | null; won: boolean }): AdaptState {
  if (r.wpm == null || !(r.wpm > 0)) return s;
  return { lastWpm: round1(r.wpm), lastWon: r.won };
}

/** Reads a saved state (resume), falling back to the start for anything malformed. */
export function readAdapt(x: unknown): AdaptState {
  const o = (x && typeof x === 'object' ? x : {}) as Partial<AdaptState>;
  if (typeof o.lastWpm === 'number' && Number.isFinite(o.lastWpm) && o.lastWpm > 0 && typeof o.lastWon === 'boolean') return { lastWpm: o.lastWpm, lastWon: o.lastWon };
  return ADAPT_START;
}

// ------------------------------------------------------------------ the first race: following the child's live pace

/**
 * Until the child's pace can be measured the rivals ease up from this (the
 * bottom of the base range), never from a guess that could be faster than a
 * slow typist: a rival that starts quick builds a lead nobody can take back.
 */
export const PRIOR_WPM = BASE_MIN_WPM;
/** The child's live pace is measured over this window. */
export const LIVE_WINDOW_MS = 10_000;
/** ...and blended in from the prior over this long at the start. */
export const LIVE_RAMP_MS = 6000;
/** The first-race rivals' speed eases towards its target with this time constant: gentle, never a snap. */
export const EASE_MS = 3000;
/** Never let the live pace drive the rivals outside the base bounds. */
const liveBounds = (v: number) => clamp(v, BASE_MIN_WPM, BASE_MAX_WPM);

/**
 * The child's pace over the last LIVE_WINDOW_MS (or since the first key), from
 * the times of their right keys. The first key only starts the clock, so
 * while the window still reaches back to it that key is not counted. It is
 * blended in from the prior over the first LIVE_RAMP_MS, so three
 * quick keys at the start do not read as a record pace.
 */
export function liveWpm(rightAt: readonly number[], firstKeyAt: number, now: number): number {
  const elapsed = now - firstKeyAt;
  if (!(elapsed > 0) || rightAt.length < 2) return PRIOR_WPM;
  const win = Math.min(LIVE_WINDOW_MS, elapsed);
  let n = 0;
  for (let i = rightAt.length - 1; i >= 0 && rightAt[i] > now - win; i--) n++;
  if (elapsed <= LIVE_WINDOW_MS) n = Math.max(0, n - 1);
  const w = Math.min(1, elapsed / LIVE_RAMP_MS);
  return liveBounds((wpm(n, win) ?? PRIOR_WPM) * w + PRIOR_WPM * (1 - w));
}

// ------------------------------------------------------------------ a rival running (both modes)

/** One rival: its current speed, how many characters it has typed and when (ms from the race's first key) it finished. */
export interface RivalRun { t: number; wpm: number; chars: number; finishMs: number | null }

export const startRival = (wpm0: number): RivalRun => ({ t: 0, wpm: wpm0, chars: 0, finishMs: null });

const SUB_MS = 100;

/**
 * Advances a rival to `toMs` (ms since the race's first key), over `total`
 * characters. Its speed eases towards `targetWpm` with time constant `easeMs`
 * (0: it is the target at once, which is how the later races' constant-pace
 * rivals run). Stepped in 100 ms sub-steps, so it is deterministic and does
 * not depend on the frame rate.
 */
export function advanceRival(r: RivalRun, toMs: number, total: number, targetWpm: number, easeMs: number): RivalRun {
  if (r.finishMs != null || toMs <= r.t) return r;
  let { t, wpm: v, chars } = r;
  let finishMs: number | null = null;
  while (t < toMs) {
    const dt = Math.min(SUB_MS, toMs - t);
    v = easeMs > 0 ? v + (targetWpm - v) * (1 - Math.exp(-dt / easeMs)) : targetWpm;
    const gain = (v * 5 * dt) / 60_000;
    if (chars + gain >= total) { finishMs = t + (dt * (total - chars)) / gain; chars = total; t = toMs; break; }
    chars += gain;
    t += dt;
  }
  return { t, wpm: v, chars, finishMs };
}

/** When the rival finishes: the time it did, or (the child crossed first) a projection at its current speed. */
export function rivalFinish(r: RivalRun, total: number): number {
  if (r.finishMs != null) return r.finishMs;
  return r.t + ((total - r.chars) * 60_000) / (r.wpm * 5);
}

/** The first race's target speed for rival `i`: the child's live pace times its factor, plus the pull when it is behind the child. */
export function firstRaceTarget(i: 0 | 1, live: number, childChars: number, rivalChars: number): number {
  const behind = Math.max(0, childChars - rivalChars);
  return liveBounds(live * FIRST_SPREAD[i] + Math.min(PULL_MAX_WPM, PULL_WPM_PER_CHAR * behind));
}
