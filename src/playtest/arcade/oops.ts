// "¿Qué salió mal?" (T46), the pure part: the everyday routines, told as a
// strip of 3–4 drawn steps the monster acts out, each with one funny
// mistake (finding the error: debugging); and the judges of the child's
// taps. Two kinds of mistake:
//
// - `replace`: one step is the wrong thing (a swimsuit to go out into the
//   snow, a fork for the soup, no toothpaste on the brush); the child taps
//   it, then picks the right step among a few drawn options.
// - `swap`: two steps are in the wrong order (the shoes before the socks);
//   the child taps one of them, then the other: they swap.
//
// The strip plays with the mistake (and its funny result at the end), the
// child fixes it, and it plays again right.

import { rng } from '../../ink/ink.js';

/** Every drawn step (oopsArt.tsx draws each one). */
export type StepId =
  | 'window_snow' | 'coat_on' | 'swimsuit_on' | 'sunhat_on' | 'floatie_on' | 'snow_play' | 'snow_shiver'
  | 'socks_on' | 'shoes_on' | 'shoes_bare' | 'socks_over' | 'walk_happy' | 'walk_silly'
  | 'soup_served' | 'spoon_take' | 'fork_take' | 'knife_take' | 'comb_take' | 'soup_eat' | 'soup_drip' | 'soup_full' | 'soup_hungry'
  | 'brush_take' | 'paste_on' | 'paste_none' | 'ketchup_on' | 'crayon_on' | 'teeth_brush' | 'teeth_brush_dry' | 'teeth_shine' | 'teeth_stink';

export type RoutineId = 'cold' | 'socks' | 'soup' | 'teeth';

export interface Routine {
  id: RoutineId;
  kind: 'replace' | 'swap';
  /** The routine done right, step by step. */
  right: readonly StepId[];
  /** As it plays first: with the mistake, and its funny result. */
  wrong: readonly StepId[];
  /** The wrong step (`replace`), or the two swapped steps (`swap`). */
  wrongAt: readonly number[];
  /** `replace`: the steps offered to put in its place (the right one among them). */
  options?: readonly StepId[];
}

/** In the order the tiers take them: 3 steps, then 4; a wrong thing, then the wrong order. */
export const ROUTINES: readonly Routine[] = [
  {
    // going out into the snow in a swimsuit
    id: 'cold', kind: 'replace',
    right: ['window_snow', 'coat_on', 'snow_play'],
    wrong: ['window_snow', 'swimsuit_on', 'snow_shiver'],
    wrongAt: [1], options: ['coat_on', 'sunhat_on', 'floatie_on'],
  },
  {
    // getting dressed: the shoes before the socks
    id: 'socks', kind: 'swap',
    right: ['socks_on', 'shoes_on', 'walk_happy'],
    wrong: ['shoes_bare', 'socks_over', 'walk_silly'],
    wrongAt: [0, 1],
  },
  {
    // soup with a fork
    id: 'soup', kind: 'replace',
    right: ['soup_served', 'spoon_take', 'soup_eat', 'soup_full'],
    wrong: ['soup_served', 'fork_take', 'soup_drip', 'soup_hungry'],
    wrongAt: [1], options: ['spoon_take', 'knife_take', 'comb_take'],
  },
  {
    // brushing the teeth without toothpaste
    id: 'teeth', kind: 'replace',
    right: ['brush_take', 'paste_on', 'teeth_brush', 'teeth_shine'],
    wrong: ['brush_take', 'paste_none', 'teeth_brush_dry', 'teeth_stink'],
    wrongAt: [1], options: ['paste_on', 'ketchup_on', 'crayon_on'],
  },
];

export const OOPS_MAX_TIER = ROUTINES.length;

const idx = (id: RoutineId) => ROUTINES.findIndex((r) => r.id === id);

/**
 * The routine of a round: tier t plays the t-th routine. Past the last tier
 * ("¡Otra vez!" in the arcade) the next one after `prev`, round and round;
 * never the same routine twice in a row.
 */
export function routineFor(tier: number, prev?: RoutineId): Routine {
  const t = Math.max(1, Math.min(OOPS_MAX_TIER, Math.floor(tier)));
  if (prev && t >= OOPS_MAX_TIER) return ROUTINES[(idx(prev) + 1) % ROUTINES.length];
  const r = ROUTINES[t - 1];
  return r.id === prev ? ROUTINES[(idx(prev) + 1) % ROUTINES.length] : r;
}

/** A `replace` routine's options in a seeded order (the right one is not always first). */
export function optionsOf(r: Routine, seed: number): StepId[] {
  const out = (r.options ?? []).slice();
  const rand = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A tap on step `i` while looking for the mistake: is it (one of) the wrong step(s)? */
export const isWrongStep = (r: Routine, i: number) => r.wrongAt.includes(i);

/** `replace`: the option picked for the wrong step is the right one. */
export const isRightFix = (r: Routine, choice: StepId) => r.kind === 'replace' && choice === r.right[r.wrongAt[0]];

/** `swap`: after tapping `found`, a tap on step `to` is the other swapped step (then they swap). */
export const isSwapPartner = (r: Routine, found: number, to: number) => r.kind === 'swap' && to !== found && r.wrongAt.includes(to) && r.wrongAt.includes(found);

/** Every routine is well formed (the tests use it): same length, the mistake only where it says, the right one offered. */
export function routineProblems(r: Routine): string[] {
  const p: string[] = [];
  if (r.right.length !== r.wrong.length) p.push('length');
  if (r.right.length < 3 || r.right.length > 5) p.push('steps');
  if (r.kind === 'replace') {
    if (r.wrongAt.length !== 1) p.push('wrongAt');
    if (!r.options?.includes(r.right[r.wrongAt[0]])) p.push('options');
    if (r.options?.includes(r.wrong[r.wrongAt[0]])) p.push('wrong offered');
  } else {
    const [a, b] = r.wrongAt;
    if (r.wrongAt.length !== 2 || a === b) p.push('wrongAt');
  }
  return p;
}
