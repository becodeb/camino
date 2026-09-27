import { describe, expect, it } from 'vitest';
import type { LevelDef } from '../game/levels';
import { DOORS, bossId, coreId, extraId, type Sheet } from './model';
import { PRIMER } from './primer';
import { EMPTY, openSheet, solve } from './progress';
import { MAP_HREF, bossOpen, currentSheet, doorsOpen, entryPage, levelIdOf, nextExtra, nextHref, parseRoute, sheetHref, sheetOpen, type SheetPage } from './route';

/** A built sheet: three core levels, the first and the third essential, and a boss. */
const built = (n: number): Sheet => ({
  ...PRIMER[n - 1],
  core: [{ level: {} as LevelDef, essential: true }, { level: {} as LevelDef }, { level: {} as LevelDef, essential: true }],
  boss: {} as LevelDef,
});

describe('routes', () => {
  it('every sheet page has a URL that parses back to itself', () => {
    const pages: SheetPage[] = [
      { kind: 'entry' }, { kind: 'core', k: 2 }, { kind: 'doors' }, { kind: 'boss' },
      ...DOORS.map((door, i) => ({ kind: 'extra' as const, door, i: i + 3 })),
    ];
    for (const page of pages) expect(parseRoute(sheetHref(4, page))).toEqual({ screen: 'sheet', n: 4, page });
    expect(sheetHref(4, { kind: 'extra', door: 'medium', i: 2 })).toBe('#/1ro/hoja/4/puerta/media/2');
  });

  it('keeps the demo routes and falls back sensibly', () => {
    expect(parseRoute('#/')).toEqual({ screen: 'home' });
    expect(parseRoute('')).toEqual({ screen: 'home' });
    expect(parseRoute('#/nivel/1ro-2')).toEqual({ screen: 'level', id: '1ro-2' });
    expect(parseRoute(MAP_HREF)).toEqual({ screen: 'map' });
    expect(parseRoute('#/1ro/')).toEqual({ screen: 'map' });
    expect(parseRoute('#/1ro/hoja/99')).toEqual({ screen: 'map' });
    expect(parseRoute('#/1ro/hoja/3/qué')).toEqual({ screen: 'sheet', n: 3, page: { kind: 'entry' } });
    expect(parseRoute('#/1ro/hoja/3/puerta/facil')).toEqual({ screen: 'sheet', n: 3, page: { kind: 'extra', door: 'easy', i: 1 } });
  });
});

describe('the child\'s way through a sheet', () => {
  const s = built(2);

  it('opens on the first unsolved core level, then on the doors', () => {
    expect(entryPage(s, EMPTY)).toEqual({ kind: 'core', k: 1 });
    const p = solve(solve(EMPTY, coreId(s, 1)), coreId(s, 3));
    expect(entryPage(s, p)).toEqual({ kind: 'core', k: 2 });
    expect(entryPage(s, solve(p, coreId(s, 2)))).toEqual({ kind: 'doors' });
  });

  it('next page: the next core level, the doors after the last, the next extra, the map after the boss', () => {
    expect(nextHref(s, { kind: 'core', k: 1 })).toBe(sheetHref(2, { kind: 'core', k: 2 }));
    expect(nextHref(s, { kind: 'core', k: 3 })).toBe(sheetHref(2, { kind: 'doors' }));
    expect(nextHref(s, { kind: 'extra', door: 'hard', i: 4 })).toBe(sheetHref(2, { kind: 'extra', door: 'hard', i: 5 }));
    expect(nextHref(s, { kind: 'boss' })).toBe(MAP_HREF);
  });

  it('the doors open with the essential pages, the boss with the whole core', () => {
    let p = solve(EMPTY, coreId(s, 1));
    expect(doorsOpen(s, p)).toBe(false);
    p = solve(p, coreId(s, 3));
    expect(doorsOpen(s, p)).toBe(true);
    expect(bossOpen(s, p)).toBe(false);
    expect(bossOpen(s, solve(p, coreId(s, 2)))).toBe(true);
    expect(doorsOpen(PRIMER[2], EMPTY)).toBe(false); // a sheet not built yet has no doors
  });

  it('each door continues from its first unsolved extra', () => {
    const p = solve(solve(EMPTY, extraId(s, 'easy', 1)), extraId(s, 'easy', 2));
    expect(nextExtra(s, 'easy', p)).toBe(3);
    expect(nextExtra(s, 'hard', p)).toBe(1);
  });

  it('names the level of each page', () => {
    expect(levelIdOf(s, { kind: 'core', k: 2 })).toBe(coreId(s, 2));
    expect(levelIdOf(s, { kind: 'boss' })).toBe(bossId(s));
    expect(levelIdOf(s, { kind: 'extra', door: 'easy', i: 1 })).toBe(extraId(s, 'easy', 1));
    expect(levelIdOf(s, { kind: 'doors' })).toBeNull();
  });
});

describe('the map', () => {
  it('a sheet opens when it is built and the teacher opened it', () => {
    expect(sheetOpen(built(1), EMPTY)).toBe(true);
    expect(sheetOpen(built(2), EMPTY)).toBe(false);
    expect(sheetOpen(built(2), openSheet(EMPTY, 2))).toBe(true);
    expect(sheetOpen(PRIMER[2], openSheet(EMPTY, 17))).toBe(false);
  });

  it('Brote waits on the first open sheet that is not complete', () => {
    expect(currentSheet(EMPTY).n).toBe(1);
  });
});
