// Copa v2: the rivals. They are tied to PROGRAM QUALITY, not to the child's
// speed: each track has three target times (tracks.ts `rivalTargets`: the
// simulated time of the bronze, silver and gold reference programs plus a
// small margin), the child beats a rival iff the child's time is below that
// rival's target, and the next race is against the tier the result points to:
//
//   lose -> the rival below (bronze is the floor)
//   win  -> the rival above (gold is the ceiling)
//
// The first race starts at the tier the ladder suggests (its ceiling rung) or
// bronze. Winning always means the program was better, and `raceResult` says
// why a loss happened from what the run really did, never a guess.

import type { CritterId } from '../../curriculum/motivation';
import type { SimResult } from './sim';
import { TIERS, rivalTargets, type Tier, type TrackSpec } from './tracks';

export { TIERS, type Tier } from './tracks';

/** The animals: gold is the fox (the design's own "el zorro usó turbo"), then the coati, then the capybara. */
export const RIVAL_ANIMAL: Readonly<Record<Tier, CritterId>> = { bronze: 'carpincho', silver: 'coati', gold: 'zorro' };

export const tierIndex = (t: Tier): number => TIERS.indexOf(t);

/** The rival of the next race: the tier below after a loss, above after a win, clamped to bronze..gold. */
export function nextRival(prev: Tier | null | undefined, won: boolean): Tier {
  const i = prev ? tierIndex(prev) : 0;
  return TIERS[Math.max(0, Math.min(TIERS.length - 1, i + (won ? 1 : -1)))];
}

/** The ladder's ceiling rung (docs: the 4to ladder runs to rung 18; the 2026-10-20 class's median was 8) chooses the first rival: bronze below rung 10, silver 10-14, gold from 15. No ladder result: bronze. */
export function startTier(ceilingRung: number | null | undefined): Tier {
  if (typeof ceilingRung !== 'number' || !Number.isFinite(ceilingRung)) return 'bronze';
  return ceilingRung >= 15 ? 'gold' : ceilingRung >= 10 ? 'silver' : 'bronze';
}

/** The two animals on the track with the child: the rival to beat and its neighbour (the tier above, or below for gold). */
export function raceField(rival: Tier): [Tier, Tier] {
  const i = tierIndex(rival);
  return [rival, TIERS[i < TIERS.length - 1 ? i + 1 : i - 1]];
}

export type ReasonCode = 'fast_and_clean' | 'crash' | 'stuck' | 'skids' | 'sputters' | 'no_turbo' | 'wasted_jumps' | 'slow';

export interface RaceResult {
  /** The child finished and beat the rival's target. */
  won: boolean;
  /** Place among the child and the two animals of the field (a run that did not finish is last). */
  place: 1 | 2 | 3;
  field: [Tier, Tier];
  rival: Tier;
  /** ms: how much the child won by over the rival (positive) or lost by (the rival's target minus the child's time, negative). Null when the run did not finish. */
  marginMs: number | null;
  /** The tiers whose targets the child beat (any of the three, not only the field). */
  beaten: Tier[];
  reason: ReasonCode;
}

/** Why a race went the way it did, from what the run did (the loudest signal first). */
export function reasonFor(sim: SimResult, track: TrackSpec, won: boolean): ReasonCode {
  if (won) return 'fast_and_clean';
  if (sim.outcome === 'crash') return 'crash';
  if (sim.outcome !== 'finish') return 'stuck';
  if (sim.stats.skids > 0) return 'skids';
  if (sim.stats.sputters > 0) return 'sputters';
  if (track.nitro && sim.stats.turbos < track.nitro) return 'no_turbo';
  if (sim.stats.wastedJumps > 0) return 'wasted_jumps';
  return 'slow';
}

/** The result of a run against a rival tier. */
export function raceResult(sim: SimResult, track: TrackSpec, rival: Tier): RaceResult {
  const targets = rivalTargets(track);
  const finished = sim.outcome === 'finish';
  const field = raceField(rival);
  const beaten = finished ? TIERS.filter((t) => sim.timeMs < targets[t]) : [];
  const ahead = finished ? field.filter((t) => targets[t] <= sim.timeMs).length : 2;
  const won = finished && sim.timeMs < targets[rival];
  return {
    won,
    place: (ahead + 1) as 1 | 2 | 3,
    field,
    rival,
    marginMs: finished ? Math.round(targets[rival] - sim.timeMs) : null,
    beaten,
    reason: reasonFor(sim, track, won),
  };
}
