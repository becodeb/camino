import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY, grant } from '../curriculum/progress';
import { ITEMS } from '../curriculum/motivation';
import { isUnlocked, setUnlocks, unlockOf, unlockedItems } from '../curriculum/rewards';
import { gardenOf } from '../curriculum/garden';
import { PLAYTEST_UNLOCKS } from './WardrobeStep';
import { frameOf } from './SessionGarden';

afterEach(() => setUnlocks(null));

describe('the playtest wardrobe', () => {
  it('unlocks two pieces for everyone, then more with more seeds, in the year\'s order', () => {
    setUnlocks(PLAYTEST_UNLOCKS);
    expect(unlockedItems(EMPTY)).toEqual(['bufanda', 'hongo']);
    expect(unlockedItems(grant(EMPTY, 4))).toEqual(['bufanda', 'hongo', 'mochila']);
    expect(unlockedItems(grant(EMPTY, 16))).toEqual(ITEMS.map((i) => i.id));
    const seeds = ITEMS.map((i) => PLAYTEST_UNLOCKS[i.id].seeds);
    expect(seeds).toEqual([...seeds].sort((a, b) => a - b));
  });

  it('shows the playtest\'s thresholds while set, and the year\'s again after', () => {
    const corona = ITEMS.find((i) => i.id === 'corona')!;
    setUnlocks(PLAYTEST_UNLOCKS);
    expect(unlockOf(corona)).toEqual({ seeds: 16 });
    expect(isUnlocked(corona, grant(EMPTY, 16))).toBe(true);
    setUnlocks(null);
    expect(unlockOf(corona)).toEqual(corona.unlock);
    expect(isUnlocked(corona, grant(EMPTY, 16))).toBe(false);
    expect(unlockedItems(EMPTY)).toEqual([]);
  });
});

describe('the goodbye garden\'s frame', () => {
  it('stays inside the garden, 2:1, and holds what grew', () => {
    const g = gardenOf(grant(EMPTY, 9));
    const [x, y, w, h] = frameOf(g);
    expect(w / h).toBeCloseTo(2);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + w).toBeLessThanOrEqual(1200);
    expect(y + h).toBeLessThanOrEqual(600);
    const b = g.beds[0];
    expect(b.x > x && b.x < x + w && b.y > y && b.y < y + h).toBe(true);
  });
});
