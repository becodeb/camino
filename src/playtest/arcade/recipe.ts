// "La receta del monstruo" (T44), the pure part: the ingredients, the
// sandwich a monster wants at each tier, and the judge of what the child
// served. Sequence: the order matters (bread at the bottom, then what the
// drawing shows, in that order). Rounds grow from 2 to 5 layers; from tier 5
// two monsters each want their own.

import { rng } from '../../ink/ink.js';

export const INGREDIENTS = ['pan', 'queso', 'tomate', 'lechuga', 'jamon', 'huevo'] as const;
export type Ingredient = typeof INGREDIENTS[number];

/** The fillings (everything but the bread); the egg joins from tier 4 (more to choose from). */
const FILLINGS: readonly Ingredient[] = ['queso', 'tomate', 'lechuga', 'jamon'];
const FILLINGS_HARD: readonly Ingredient[] = [...FILLINGS, 'huevo'];

export const RECIPE_MAX_TIER = 6;

/** Layers per monster's sandwich at a tier: 2, 3, 4, 5, then two monsters (3 and 4), then two of 4 and 5. */
export function layersOf(tier: number): number[] {
  const t = Math.max(1, Math.min(RECIPE_MAX_TIER, Math.floor(tier)));
  return t <= 4 ? [t + 1] : t === 5 ? [3, 4] : [4, 5];
}

/** What the tray offers at a tier: the bread and the fillings, in a fixed order (the cards never jump around). */
export const trayOf = (tier: number): Ingredient[] => ['pan', ...(tier >= 4 ? FILLINGS_HARD : FILLINGS)];

/**
 * One sandwich of `n` layers: bread at the bottom; with 3 or more layers,
 * bread on top too; the fillings in between all different. `pool` the
 * fillings to draw from; `avoid` an order not to repeat (the previous one).
 */
export function sandwich(n: number, rand: () => number, pool: readonly Ingredient[] = FILLINGS, avoid?: readonly Ingredient[]): Ingredient[] {
  const k = Math.max(1, n - (n >= 3 ? 2 : 1));
  for (let tries = 0; tries < 12; tries++) {
    const bag = pool.slice();
    const mid: Ingredient[] = [];
    for (let i = 0; i < k && bag.length; i++) mid.push(bag.splice(Math.floor(rand() * bag.length), 1)[0]);
    const out: Ingredient[] = n >= 3 ? ['pan', ...mid, 'pan'] : ['pan', ...mid];
    if (!avoid || out.join() !== avoid.join()) return out;
  }
  const bag = pool.slice(0, k);
  return n >= 3 ? ['pan', ...bag, 'pan'] : ['pan', ...bag];
}

export interface RecipeRound {
  tier: number;
  /** One order per monster (one or two), each listed from the bottom layer up. */
  orders: Ingredient[][];
}

/** A round at a tier, from a seed; `prev`: the round before (its first order is not repeated). */
export function recipeRound(tier: number, seed: number, prev?: RecipeRound): RecipeRound {
  const t = Math.max(1, Math.min(RECIPE_MAX_TIER, Math.floor(tier)));
  const rand = rng(seed);
  const pool = t >= 4 ? FILLINGS_HARD : FILLINGS;
  const orders: Ingredient[][] = [];
  for (const n of layersOf(t)) orders.push(sandwich(n, rand, pool, orders.length ? orders[orders.length - 1] : prev?.orders[0]));
  return { tier: t, orders };
}

export type Verdict =
  | { ok: true }
  /**
   * `at`: the first layer that is not what the monster wanted (bottom = 0).
   * `kind`: `order` when the same ingredients were all there in another
   * order (the sequence error this game measures), `ingredient` otherwise.
   */
  | { ok: false; at: number; kind: 'order' | 'ingredient' };

/** Judges a full sandwich against the order (the child can only serve it full, "¡Listo!"). */
export function judgeSandwich(order: readonly Ingredient[], served: readonly Ingredient[]): Verdict {
  const n = Math.max(order.length, served.length);
  let at = -1;
  for (let i = 0; i < n; i++) if (order[i] !== served[i]) { at = i; break; }
  if (at < 0) return { ok: true };
  const sorted = (a: readonly Ingredient[]) => a.slice().sort().join();
  return { ok: false, at, kind: served.length === order.length && sorted(order) === sorted(served) ? 'order' : 'ingredient' };
}

/** After a wrong sandwich, what stays on the plate: the right layers under the wrong one (the rest falls off). */
export const keepAfterWrong = (served: readonly Ingredient[], at: number): Ingredient[] => served.slice(0, Math.max(0, at));
