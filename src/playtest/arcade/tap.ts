// "Tocá y pasa" (T47), the pure part: events, cause and effect, free play.
// A meadow with a few animals; the child gives each animal rules "when I tap
// it → it jumps / changes colour / throws confetti / hides / spins", picked
// as picture cards (the "when I tap" trigger is a pointing hand on the
// animal, each effect a picture of it happening), then plays: tapping an
// animal runs its rules, one after another. No wrong answers.
//
// A round is "a rule made, then used": it starts with the first rule made
// since the last round, and it is won the first time the child, in play
// mode, taps an animal that got a new rule in it. The tiers unlock more:
// tier 1 three animals and three effects, tier 2 all five effects, tier 3
// a fourth animal.

import type { CritterId } from '../../curriculum/motivation';

export const EFFECTS = ['jump', 'colour', 'confetti', 'hide', 'spin'] as const;
export type EffectId = typeof EFFECTS[number];

/** The animals of the meadow (the garden's critters, critterArt.tsx), in the order they come in. */
export const ANIMALS = ['rana', 'zorro', 'carpincho', 'coati'] as const satisfies readonly CritterId[];
export type AnimalId = typeof ANIMALS[number];

/** A few rules per animal: its sign has this many slots. */
export const MAX_RULES = 3;
export const TAP_MAX_TIER = 3;

export interface TapScene {
  animals: readonly AnimalId[];
  effects: readonly EffectId[];
}

export function sceneOf(tier: number): TapScene {
  const t = Math.max(1, Math.min(TAP_MAX_TIER, Math.floor(tier)));
  return {
    animals: ANIMALS.slice(0, t >= 3 ? 4 : 3),
    effects: t >= 2 ? EFFECTS : EFFECTS.slice(0, 3),
  };
}

/** How long each effect plays (ms) when an animal is tapped; its rules play one after another. */
export const EFFECT_MS: Record<EffectId, number> = { jump: 700, colour: 600, confetti: 900, hide: 1500, spin: 750 };

/** The colours an animal goes through ("changes colour"): a hue turn per step, 0 = its own. */
export const HUES = [0, 120, 200, 290] as const;
export const nextHue = (i: number) => (Math.floor(i) + 1) % HUES.length;

/** Every animal's rules, in order (each one an effect of "when I tap it"). */
export type Rules = Partial<Record<AnimalId, readonly EffectId[]>>;

export const rulesOf = (rules: Rules, a: AnimalId): readonly EffectId[] => rules[a] ?? [];

/** Adds a rule to an animal; a full sign (MAX_RULES) takes no more. */
export function addRule(rules: Rules, a: AnimalId, e: EffectId): { rules: Rules; added: boolean } {
  const now = rulesOf(rules, a);
  if (now.length >= MAX_RULES) return { rules, added: false };
  return { rules: { ...rules, [a]: [...now, e] }, added: true };
}

/** Takes the rule at `i` off an animal's sign. */
export function removeRule(rules: Rules, a: AnimalId, i: number): { rules: Rules; removed: EffectId | null } {
  const now = rulesOf(rules, a);
  if (i < 0 || i >= now.length) return { rules, removed: null };
  return { rules: { ...rules, [a]: now.filter((_, k) => k !== i) }, removed: now[i] };
}

export const ruleCount = (rules: Rules) => Object.values(rules).reduce((n, r) => n + (r?.length ?? 0), 0);

/** The rules as plain data for the telemetry (only the animals that have some). */
export function rulesSnapshot(rules: Rules): Record<string, EffectId[]> {
  const out: Record<string, EffectId[]> = {};
  for (const a of ANIMALS) if (rulesOf(rules, a).length) out[a] = [...rulesOf(rules, a)];
  return out;
}

/** How long tapping an animal plays (its rules one after another), 0 without rules. */
export const runMs = (effects: readonly EffectId[]) => effects.reduce((n, e) => n + EFFECT_MS[e], 0);

// ------------------------------------------------------------------ the round: a rule made, then used

export interface RoundTrack {
  /** The animals that got a rule in this round (still on their sign). */
  fresh: readonly AnimalId[];
}

export const newRound = (): RoundTrack => ({ fresh: [] });

/** A rule was made on `a` in this round. */
export const madeRule = (r: RoundTrack, a: AnimalId): RoundTrack => (r.fresh.includes(a) ? r : { fresh: [...r.fresh, a] });

/** A rule taken off: the animal stays fresh only while it still has a rule. */
export const unmadeRule = (r: RoundTrack, a: AnimalId, rules: Rules): RoundTrack =>
  rulesOf(rules, a).length ? r : { fresh: r.fresh.filter((x) => x !== a) };

/** Tapping `a` in play mode wins the round: it has a rule made in this round. */
export const winsRound = (r: RoundTrack, a: AnimalId, rules: Rules) => r.fresh.includes(a) && rulesOf(rules, a).length > 0;
