import { describe, expect, it } from 'vitest';
import { BOSS_REWARDS, CRITTER_IDS, ITEMS, SLOTS, critterReward, itemById, rewardOf, type ItemId } from './motivation';
import { bossId, coreId, goalId, hasCore } from './model';
import { PRIMER, sheetByN } from './primer';
import {
  EMPTY, MAX_FAVORITES, STORAGE_KEY, chooseCharacter, createProgressStore, earnGold, grant, grantCritter, grantItem, markPreviewed, markSeen, parse,
  placeInGarden, publish, reachGoal, setOutfit, setWardrobe, sheetState, solve, toggleFavorite,
  type Backing, type Progress,
} from './progress';
import {
  arrivalSay, arrivedCritters, arrivedPlants, comingSay, isUnlocked, newArrivals, newItems, outfitOf, stillComing, unlockSay, unlockedItems, wear,
} from './rewards';
import { BED_PLANTS, GARDEN_H, GARDEN_W, MAX_BEDS, MAX_PLANTED, MAX_POTS, MEADOW, bedBox, gardenOf, movable, stageOf } from './garden';
import { MIN_FAVORITES, favoritePages, showPages } from './showcase';
import { cardLevelId, defaultDraft, type MadeLevel } from './workshop';

function fakeStorage(broken = false): Backing & { data: Map<string, string> } {
  const data = new Map<string, string>();
  const guard = () => { if (broken) throw new Error('SecurityError'); };
  return {
    data,
    getItem: (k) => { guard(); return data.get(k) ?? null; },
    setItem: (k, v) => { guard(); data.set(k, v); },
    removeItem: (k) => { guard(); data.delete(k); },
  };
}

/** Every core page of sheet `n` solved (the sheet is finished). */
const finish = (p: Progress, n: number) => sheetByN(n)!.core.reduce((q, _, i) => solve(q, coreId({ grade: '1ro', n }, i + 1)), p);
const seeds = (n: number) => grant(EMPTY, n);

describe('the motivation layer in the progress', () => {
  it('starts with Brote not picked yet, nothing worn, given, seen, moved or chosen, and the wardrobe shut', () => {
    expect(EMPTY).toMatchObject({ character: 'brote', picked: false, outfit: {}, items: {}, critters: {}, seen: {}, garden: {}, favorites: [], previewed: {}, wardrobe: false });
  });

  it('a character is picked once on sheet 1 and changed in the wardrobe; an unknown one changes nothing', () => {
    const a = chooseCharacter(EMPTY, 'mina');
    expect([a.character, a.picked]).toEqual(['mina', true]);
    expect(chooseCharacter(a, 'mina')).toBe(a);
    expect(chooseCharacter(a, 'dragon')).toBe(a);
    // picking Brote on purpose counts as picked
    expect(chooseCharacter(EMPTY, 'brote').picked).toBe(true);
  });

  it('an outfit holds one item per slot, each on its own slot', () => {
    let p = setOutfit(EMPTY, 'head', 'hongo');
    p = setOutfit(p, 'head', 'corona');
    expect(p.outfit).toEqual({ head: 'corona' });
    expect(setOutfit(p, 'neck', 'botas').outfit).toEqual({ head: 'corona' }); // boots are not a scarf
    expect(setOutfit(p, 'head', null).outfit).toEqual({});
  });

  it('picks at most three favourites; a tap on one picked puts it back', () => {
    let p = ['a', 'b', 'c'].reduce(toggleFavorite, EMPTY);
    expect(p.favorites).toEqual(['a', 'b', 'c']);
    expect(toggleFavorite(p, 'd')).toBe(p);
    p = toggleFavorite(p, 'b');
    expect(p.favorites).toEqual(['a', 'c']);
    expect(toggleFavorite(p, 'd').favorites).toEqual(['a', 'c', 'd']);
    expect(MAX_FAVORITES).toBe(3);
  });

  it('keeps what was seen, what was previewed, the wardrobe switch and the garden\'s moved plants', () => {
    const a = markSeen(EMPTY, ['critter:coati', 'item:capa']);
    expect(Object.keys(a.seen).sort()).toEqual(['critter:coati', 'item:capa']);
    expect(markSeen(a, ['critter:coati'])).toBe(a);
    expect(markPreviewed(EMPTY, 4).previewed).toEqual({ 4: true });
    expect(setWardrobe(setWardrobe(EMPTY, true), true).wardrobe).toBe(true);
    expect(setWardrobe(EMPTY, false)).toBe(EMPTY);
    const g = placeInGarden(EMPTY, 'hoja-3', [120.4, 300.6]);
    expect(g.garden).toEqual({ 'hoja-3': [120, 301] });
    expect(placeInGarden(g, 'hoja-3', null).garden).toEqual({});
  });

  it('stores and reads back every new field; older values read as nothing yet', () => {
    let p = chooseCharacter(grantCritter(grantItem(EMPTY, 'capa'), 'rana'), 'ovillo');
    p = setWardrobe(markPreviewed(placeInGarden(toggleFavorite(markSeen(setOutfit(p, 'back', 'capa'), ['item:capa']), '1ro-h2-1'), 'girasol', [300, 400]), 2), true);
    expect(parse(JSON.stringify(p))).toEqual(p);
    const old = parse(JSON.stringify({ v: 1, solved: { a: true }, seeds: 1, character: 'brote' }));
    expect(old).toMatchObject({ picked: false, outfit: {}, items: {}, critters: {}, seen: {}, garden: {}, favorites: [], previewed: {}, wardrobe: false });
  });

  it('leaves out what it does not know on read', () => {
    const p = parse(JSON.stringify({
      v: 1, seeds: 4, character: 'dragon', picked: 'yes',
      outfit: { head: 'botas', neck: 'bufanda', tail: 'capa', back: 42 },
      items: { capa: true, sombrero: true }, critters: { rana: true, leon: true },
      garden: { 'hoja-1': [10, 20], girasol: [1, 'x'], ceibo: [1, 2, 3], zorro: 'aqui' },
      favorites: ['a', 7, 'a', 'b', 'c', 'd'], previewed: { 3: true }, wardrobe: 1,
    }));
    expect(p).toMatchObject({
      character: 'brote', picked: false, outfit: { neck: 'bufanda' }, items: { capa: true }, critters: { rana: true },
      garden: { 'hoja-1': [10, 20] }, favorites: ['a', 'b', 'c'], previewed: { 3: true }, wardrobe: false,
    });
  });

  it('the store keeps it across a reload, and plays in memory without storage', () => {
    const disk = fakeStorage();
    createProgressStore(disk).update((p) => toggleFavorite(setOutfit(chooseCharacter(p, 'pliegue'), 'head', 'hongo'), '1ro-h1-1'));
    expect(JSON.parse(disk.data.get(STORAGE_KEY)!).character).toBe('pliegue');
    const b = createProgressStore(disk).get();
    expect([b.character, b.picked, b.outfit.head, b.favorites]).toEqual(['pliegue', true, 'hongo', ['1ro-h1-1']]);
    for (const backing of [fakeStorage(true), null]) {
      const s = createProgressStore(backing);
      s.update((p) => grantCritter(chooseCharacter(p, 'mina'), 'zorro'));
      expect(s.get().character).toBe('mina');
      expect(s.get().critters.zorro).toBe(true);
    }
  });
});

describe('the wardrobe: pieces unlocked by seeds and finished sheets, known in advance', () => {
  it('every slot has a piece, every piece its unlock, spoken for the child', () => {
    for (const slot of SLOTS) expect(ITEMS.some((i) => i.slot === slot)).toBe(true);
    for (const i of ITEMS) expect(unlockSay(i.unlock)).toMatch(/^Se abre cuando (juntes \d+ semillas|termines la hoja \d+)\.$/);
    expect(unlockSay({ seeds: 25 })).toBe('Se abre cuando juntes 25 semillas.');
    expect(unlockSay({ sheet: 9 })).toBe('Se abre cuando termines la hoja 9.');
  });

  it('seeds unlock pieces as they grow (never spent); finished sheets unlock theirs', () => {
    expect(unlockedItems(EMPTY)).toEqual([]);
    expect(unlockedItems(seeds(3))).toEqual(['bufanda']);
    expect(unlockedItems(seeds(10))).toEqual(['bufanda', 'hongo']);
    expect(unlockedItems(seeds(50))).toEqual(['bufanda', 'hongo', 'capa', 'corona']);
    const two = finish(EMPTY, 2);
    expect(sheetState(sheetByN(2)!, two).complete).toBe(true);
    expect(unlockedItems(two)).toContain('mochila');
    expect(isUnlocked(itemById('botas')!, finish(EMPTY, 9))).toBe(true);
    expect(isUnlocked(itemById('flotador')!, finish(EMPTY, 12))).toBe(false);
    // wearing costs nothing
    const w = wear(seeds(3), 'bufanda');
    expect(w.seeds).toBe(3);
  });

  it('only unlocked pieces are worn; a tap on a worn piece takes it off; one piece per slot', () => {
    expect(wear(EMPTY, 'hongo')).toBe(EMPTY);
    let p = wear(seeds(50), 'hongo');
    expect(outfitOf(p)).toEqual({ head: 'hongo' });
    p = wear(p, 'corona');
    expect(outfitOf(p)).toEqual({ head: 'corona' });
    p = wear(wear(p, 'capa'), 'bufanda');
    expect(outfitOf(p)).toEqual({ head: 'corona', back: 'capa', neck: 'bufanda' });
    expect(outfitOf(wear(p, 'capa'))).toEqual({ head: 'corona', neck: 'bufanda' });
  });

  it('a piece stored but locked does not show; the dev drawer\'s gift unlocks it', () => {
    const p = setOutfit(seeds(3), 'back', 'capa');
    expect(outfitOf(p)).toEqual({});
    expect(outfitOf(grantItem(p, 'capa'))).toEqual({ back: 'capa' });
    expect(newItems(grantItem(p, 'capa'))).toEqual(['bufanda', 'capa']);
    expect(newItems(markSeen(grantItem(p, 'capa'), ['item:bufanda']))).toEqual(['capa']);
  });
});

describe('the bosses\' rewards: critters and special plants', () => {
  const bosses = PRIMER.filter((s) => s.boss).map((s) => s.n);

  it('every boss sends one reward, known in advance; the six critters come from six bosses spread over the year', () => {
    expect(BOSS_REWARDS.map((r) => r.sheet)).toEqual(bosses);
    const critters = BOSS_REWARDS.filter((r) => r.kind === 'critter');
    expect(critters.map((r) => r.id).sort()).toEqual([...CRITTER_IDS].sort());
    expect(critters.some((r) => sheetByN(r.sheet)!.zone === 'bosque')).toBe(true);
    expect(critters.some((r) => sheetByN(r.sheet)!.zone === 'rio')).toBe(true);
    // never two critters in a row of bosses: plants between most of them
    expect(critters.map((r) => r.sheet)).toEqual([2, 4, 6, 9, 10, 13]);
    expect(rewardOf(7)).toBeNull();
    expect(comingSay(critterReward('lechuza'))).toBe('La lechuza llega cuando ganes el desafío de la hoja 4.');
    expect(arrivalSay(rewardOf(11)!)).toBe('¡Unos juncos con una libélula crecen en tu jardín!');
    expect(arrivalSay(critterReward('coati'))).toBe('¡El coatí se va a vivir a tu jardín!');
  });

  it('a boss solved sends its reward; what is still coming shrinks; each arrives once as new', () => {
    expect(stillComing(EMPTY)).toHaveLength(BOSS_REWARDS.length);
    let p = solve(EMPTY, bossId({ grade: '1ro', n: 2 }));
    expect(arrivedCritters(p)).toEqual(['coati']);
    p = solve(p, bossId({ grade: '1ro', n: 1 }));
    expect(arrivedPlants(p)).toEqual(['girasol']);
    expect(stillComing(p).map((r) => r.sheet)).not.toContain(2);
    expect(newArrivals(p).map((r) => r.id)).toEqual(['girasol', 'coati']);
    expect(newArrivals(markSeen(p, ['critter:coati'])).map((r) => r.id)).toEqual(['girasol']);
    expect(arrivedCritters(grantCritter(EMPTY, 'rana'))).toEqual(['rana']);
  });
});

describe('the garden', () => {
  const inside = (x: number, y: number) => x >= 0 && x <= GARDEN_W && y >= 0 && y <= GARDEN_H;

  it('grows each seed from a sprout to a plant to a flower as more are planted after it', () => {
    expect([1, 2, 3, 6, 7, 40].map(stageOf)).toEqual(['sprout', 'sprout', 'plant', 'plant', 'flower', 'flower']);
  });

  it('with no seeds: one bed dug and waiting, nothing planted', () => {
    const g = gardenOf(EMPTY);
    expect(g.beds).toHaveLength(1);
    expect(g.beds[0]).toMatchObject({ open: true, plants: [] });
    expect([g.big, g.rare, g.pots, g.critters]).toEqual([[], [], [], []]);
  });

  it('with ten seeds: a full bed of flowers, plants and sprouts, and the next bed dug', () => {
    const g = gardenOf(seeds(10));
    expect(g.beds.map((b) => b.plants.length)).toEqual([10, 0]);
    const stages = g.beds[0].plants.map((x) => x.stage);
    expect(stages.filter((s) => s === 'flower')).toHaveLength(4);
    expect(stages.filter((s) => s === 'plant')).toHaveLength(4);
    expect(stages.slice(-2)).toEqual(['sprout', 'sprout']);
  });

  it('with a hundred and fifty: fifteen full beds inside the page, none on another; more seeds are counted, not drawn', () => {
    const g = gardenOf(seeds(150));
    expect(g.beds).toHaveLength(MAX_BEDS);
    expect(g.beds.every((b) => b.plants.length === BED_PLANTS && !b.open)).toBe(true);
    for (const b of g.beds) for (const x of b.plants) expect(inside(x.x, x.y)).toBe(true);
    const boxes = g.beds.map(bedBox);
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => {
      const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
      expect(apart).toBe(true);
    }));
    expect(gardenOf(seeds(400)).beds.flatMap((b) => b.plants)).toHaveLength(MAX_PLANTED);
    expect(gardenOf(EMPTY, 150)).toEqual(g); // the dev drawer's preview draws the same garden
  });

  it('each finished sheet adds a tree (the forest) or a bush (the river); gold pages grow flowers in pots', () => {
    let p = finish(finish(EMPTY, 1), 10);
    const g = gardenOf(p);
    expect(g.big.map((b) => [b.id, b.kind])).toEqual([['hoja-1', 'tree'], ['hoja-10', 'bush']]);
    p = earnGold(earnGold(p, '1ro-h11-1'), '1ro-h11-jefe');
    expect(gardenOf(p).pots.map((x) => x.id)).toEqual(['1ro-h11-1', '1ro-h11-jefe']);
    const many = Array.from({ length: 20 }, (_, i) => `x-${i}`).reduce(earnGold, EMPTY);
    expect(gardenOf(many).pots).toHaveLength(MAX_POTS);
  });

  it('the bosses\' guests have their places; a new one is marked fresh until seen', () => {
    const p = solve(solve(EMPTY, bossId({ grade: '1ro', n: 13 })), bossId({ grade: '1ro', n: 12 }));
    const g = gardenOf(p);
    expect(g.critters.map((c) => [c.id, c.fresh])).toEqual([['rana', true]]);
    expect(g.rare.map((r) => [r.id, r.fresh])).toEqual([['nenufar', true]]);
    expect(gardenOf(markSeen(p, ['critter:rana'])).critters[0].fresh).toBe(false);
    for (const c of g.critters) expect(inside(c.x, c.y)).toBe(true);
  });

  it('the child may drag the big plants; a spot off the meadow is brought back onto it', () => {
    const p = placeInGarden(placeInGarden(finish(solve(EMPTY, bossId({ grade: '1ro', n: 1 })), 1), 'hoja-1', [700, 300]), 'girasol', [-50, 9000]);
    const g = gardenOf(p);
    expect(movable(g).sort()).toEqual(['girasol', 'hoja-1']);
    expect(g.big[0]).toMatchObject({ x: 700, y: 300, moved: true });
    expect(g.rare[0]).toMatchObject({ x: MEADOW.x0, y: MEADOW.y1, moved: true });
  });
});

describe('the showcase\'s pages', () => {
  const mine: MadeLevel = { id: 'yo-1', sheet: 7, board: defaultDraft(false).board, lines: 5, solution: Array.from({ length: 5 }, () => ({ t: 'cmd' as const, cmd: 'right' })) };

  it('offers every core page and boss solved, then the levels made here, in the year\'s order', () => {
    let p = solve(solve(EMPTY, '1ro-h2-3'), '1ro-h1-2');
    p = solve(solve(publish(p, mine), cardLevelId('yo-1')), bossId({ grade: '1ro', n: 1 }));
    const pages = showPages(p);
    expect(pages.map((x) => [x.id, x.kind])).toEqual([['1ro-h1-2', 'core'], ['1ro-h1-jefe', 'boss'], ['1ro-h2-3', 'core'], ['1ro-c-yo-1', 'made']]);
    expect(pages.every((x) => x.level.worlds.length > 0)).toBe(true);
    // extras are not the child's own pages
    expect(showPages(solve(EMPTY, '1ro-h1-easy-1'))).toEqual([]);
  });

  it('the favourites keep their order and leave out a page no longer there', () => {
    let p = ['1ro-h1-1', '1ro-h1-2', '1ro-h1-3'].reduce(solve, EMPTY);
    p = ['1ro-h1-3', 'gone', '1ro-h1-1'].reduce(toggleFavorite, p);
    expect(favoritePages(p).map((x) => x.id)).toEqual(['1ro-h1-3', '1ro-h1-1']);
    expect(MIN_FAVORITES).toBe(2);
  });

  it('the showcase is done when the family played a page', () => {
    const s = sheetByN(17)!;
    expect(s.showcase && !hasCore(s)).toBe(true);
    expect(sheetState(s, reachGoal(EMPTY, goalId(s, 'jardin'))).complete).toBe(false);
    expect(sheetState(s, reachGoal(EMPTY, goalId(s, 'familia')))).toMatchObject({ complete: true, goals: ['familia'] });
  });
});

describe('what the items are made of', () => {
  it('the wardrobe\'s pieces are the approved ones and a few more of the forest and the river', () => {
    const ids: ItemId[] = ['hongo', 'capa', 'botas', 'mochila'];
    for (const id of ids) expect(itemById(id)).not.toBeNull();
    expect(ITEMS.length).toBeGreaterThanOrEqual(6);
  });
});
