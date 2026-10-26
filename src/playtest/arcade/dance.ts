// "Copiá el baile" (T45), the pure part: the monster's poses, the dance a
// round shows (it grows by one pose each round: Simon says, silent), and the
// judge of the child's taps. Sequence and memory: the child watches the
// whole dance, then repeats it pose by pose; a miss is a funny tumble and
// the same dance again (same length), never "game over".

import { rng } from '../../ink/ink.js';

/** The four poses (each one a card): arms up, a star, a squat, on one foot. */
export const POSES = ['up', 'star', 'squat', 'flamingo'] as const;
export type Pose = typeof POSES[number];

export const DANCE_MAX_TIER = 6;

/** Poses in a dance at a tier: 2, 3, 4… up to 7 (the guided pass plays 2, 3, 4). */
export const lengthOf = (tier: number) => Math.max(1, Math.min(DANCE_MAX_TIER, Math.floor(tier))) + 1;

/**
 * A dance of `n` poses: `prefix` kept (the dance before, so each round adds
 * one pose to what the child already knows), then random poses, never the
 * same pose twice in a row (two equal beats would look like one).
 */
export function danceSequence(n: number, rand: () => number, prefix: readonly Pose[] = []): Pose[] {
  const out = prefix.slice(0, n);
  while (out.length < n) {
    const last = out[out.length - 1];
    const bag = POSES.filter((p) => p !== last);
    out.push(bag[Math.floor(rand() * bag.length) % bag.length]);
  }
  return out;
}

export interface DanceRound {
  tier: number;
  seq: Pose[];
}

/**
 * A round at a tier, from a seed. `prev`: the dance before; when it is one
 * pose shorter (the next round, "¡Otra vez!") it is kept and one pose added.
 */
export function danceRound(tier: number, seed: number, prev?: readonly Pose[]): DanceRound {
  const t = Math.max(1, Math.min(DANCE_MAX_TIER, Math.floor(tier)));
  const n = lengthOf(t);
  const keep = prev && prev.length < n ? prev : [];
  return { tier: t, seq: danceSequence(n, rng(seed), keep) };
}

export type StepVerdict =
  /** The tap was the right pose; `done` when the whole dance is copied. */
  | { ok: true; done: boolean }
  /** A miss at pose `at` (0-based): the tumble, then the same dance again. */
  | { ok: false; at: number };

/** Judges the child's taps so far (`input`, the last one just tapped) against the dance. */
export function judgeStep(seq: readonly Pose[], input: readonly Pose[]): StepVerdict {
  const at = input.length - 1;
  if (at < 0) return { ok: true, done: false };
  if (at >= seq.length || input[at] !== seq[at]) return { ok: false, at: Math.min(at, seq.length - 1) };
  return { ok: true, done: input.length === seq.length };
}
