import { describe, expect, it } from 'vitest';
import { INGREDIENTS, RECIPE_MAX_TIER, judgeSandwich, keepAfterWrong, layersOf, recipeRound, sandwich, trayOf } from './recipe';
import { rng } from '../../ink/ink.js';

describe('T44: la receta del monstruo', () => {
  it('the layers grow from 2 to 5, then two monsters', () => {
    expect([1, 2, 3, 4, 5, 6].map(layersOf)).toEqual([[2], [3], [4], [5], [3, 4], [4, 5]]);
    expect(layersOf(99)).toEqual(layersOf(RECIPE_MAX_TIER));
    expect(layersOf(0)).toEqual([2]);
  });

  it('every sandwich starts with bread, has bread on top from 3 layers, and its fillings are all different', () => {
    for (let seed = 1; seed < 200; seed++) {
      for (let tier = 1; tier <= RECIPE_MAX_TIER; tier++) {
        const r = recipeRound(tier, seed);
        expect(r.orders.map((o) => o.length)).toEqual(layersOf(tier));
        for (const o of r.orders) {
          expect(o[0]).toBe('pan');
          if (o.length >= 3) expect(o[o.length - 1]).toBe('pan');
          const mid = o.length >= 3 ? o.slice(1, -1) : o.slice(1);
          expect(mid).not.toContain('pan');
          expect(new Set(mid).size).toBe(mid.length);
          for (const i of o) expect(trayOf(tier)).toContain(i);
        }
      }
    }
  });

  it('the egg joins the tray from tier 4; the tray always has the bread first', () => {
    expect(trayOf(1)).toEqual(['pan', 'queso', 'tomate', 'lechuga', 'jamon']);
    expect(trayOf(4)).toContain('huevo');
    expect(trayOf(6)[0]).toBe('pan');
    expect(INGREDIENTS).toHaveLength(6);
  });

  it('a round never repeats the previous order, and two monsters never want the same', () => {
    let prev = recipeRound(2, 7);
    for (let seed = 8; seed < 120; seed++) {
      const r = recipeRound(2, seed, prev);
      expect(r.orders[0].join()).not.toBe(prev.orders[0].join());
      prev = r;
    }
    for (let seed = 1; seed < 120; seed++) {
      const r = recipeRound(5, seed);
      expect(r.orders[0].join()).not.toBe(r.orders[1].join());
    }
    expect(sandwich(3, rng(1), ['queso'], ['pan', 'queso', 'pan'])).toEqual(['pan', 'queso', 'pan']);
  });

  it('the judge: right, the order wrong (same ingredients), or a wrong ingredient, with the first wrong layer', () => {
    const order = ['pan', 'queso', 'tomate', 'pan'] as const;
    expect(judgeSandwich(order, ['pan', 'queso', 'tomate', 'pan'])).toEqual({ ok: true });
    expect(judgeSandwich(order, ['pan', 'tomate', 'queso', 'pan'])).toEqual({ ok: false, at: 1, kind: 'order' });
    expect(judgeSandwich(order, ['queso', 'pan', 'tomate', 'pan'])).toEqual({ ok: false, at: 0, kind: 'order' });
    expect(judgeSandwich(order, ['pan', 'queso', 'jamon', 'pan'])).toEqual({ ok: false, at: 2, kind: 'ingredient' });
    expect(judgeSandwich(order, ['pan', 'queso'])).toEqual({ ok: false, at: 2, kind: 'ingredient' });
  });

  it('after a wrong sandwich only the right layers under the wrong one stay', () => {
    expect(keepAfterWrong(['pan', 'tomate', 'queso', 'pan'], 1)).toEqual(['pan']);
    expect(keepAfterWrong(['queso', 'pan'], 0)).toEqual([]);
  });
});
