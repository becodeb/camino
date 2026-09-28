import { describe, expect, it } from 'vitest';
import type { LevelDef } from '../game/levels';
import { DOORS, bossId, coreId, extraId, goalId, hasCore, type Sheet } from './model';
import { PRIMER, sheetByN } from './primer';
import { EMPTY, openSheet, played, publish, reachGoal, solve } from './progress';
import {
  FREE_SONG, MAP_HREF, bossOpen, currentSheet, doorsOpen, entryPage, goldPage, isGold, levelIdOf, nextExtra, nextHref, parseRoute, pendingEssentials,
  plainPage, reviewPage, sheetHref, sheetOpen,
  type SheetPage,
} from './route';
import { EXAMPLES } from './classmates';
import { cardLevelId, defaultDraft } from './workshop';

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

  it('a level page\'s gold challenge is the page plus /oro, and leads where the page does', () => {
    const pages: SheetPage[] = [{ kind: 'core', k: 2, gold: true }, { kind: 'boss', gold: true }, { kind: 'extra', door: 'medium', i: 3, gold: true }];
    for (const page of pages) {
      expect(parseRoute(sheetHref(11, page))).toEqual({ screen: 'sheet', n: 11, page });
      expect(isGold(page)).toBe(true);
      expect(isGold(plainPage(page))).toBe(false);
      expect(goldPage(plainPage(page))).toEqual(page);
      expect(nextHref(built(11), page)).toBe(nextHref(built(11), plainPage(page)));
      expect(levelIdOf(built(11), page)).toBe(levelIdOf(built(11), plainPage(page)));
    }
    expect(sheetHref(11, { kind: 'core', k: 2, gold: true })).toBe('#/1ro/hoja/11/2/oro');
    expect(parseRoute('#/1ro/hoja/11/puertas/oro')).toEqual({ screen: 'sheet', n: 11, page: { kind: 'doors' } });
    expect(goldPage({ kind: 'doors' })).toEqual({ kind: 'doors' });
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
    expect(doorsOpen({ ...PRIMER[2], core: [] }, EMPTY)).toBe(false); // a sheet not built yet has no doors
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
    expect(sheetOpen({ ...PRIMER[2], core: [] }, openSheet(EMPTY, 17))).toBe(false); // not built: "próximamente"
  });

  it('Brote waits on the first open sheet that is not complete', () => {
    expect(currentSheet(EMPTY).n).toBe(1);
  });

  it('the workshops and the comodín are stops like the others: open when the teacher opened them, and Brote waits on them', () => {
    const W7 = sheetByN(7)!;
    expect(sheetOpen(W7, openSheet(EMPTY, 6))).toBe(false);
    expect(sheetOpen(W7, openSheet(EMPTY, 7))).toBe(true);
    let p = openSheet(EMPTY, 8);
    for (const s of PRIMER.filter((x) => hasCore(x) && x.n < 7)) s.core.forEach((_, i) => { p = solve(p, coreId(s, i + 1)); });
    expect(currentSheet(p).n).toBe(7);
    p = played(publish(p, { id: 'yo-1', sheet: 7, board: defaultDraft(false).board, lines: 5, solution: [] }), 'ej-1');
    expect(currentSheet(p).n).toBe(8);
  });
});

describe('the workshops\' pages', () => {
  const W = sheetByN(7)!;

  it('have URLs that parse back', () => {
    const pages: SheetPage[] = [{ kind: 'taller' }, { kind: 'probar' }, { kind: 'cartelera' }, { kind: 'tarjeta', card: 'ej-3' }, { kind: 'tarjeta', card: 'yo-12' }];
    for (const page of pages) expect(parseRoute(sheetHref(15, page))).toEqual({ screen: 'sheet', n: 15, page });
    expect(sheetHref(7, { kind: 'probar' })).toBe('#/1ro/hoja/7/taller/probar');
    expect(sheetHref(7, { kind: 'tarjeta', card: 'ej-3' })).toBe('#/1ro/hoja/7/cartelera/ej-3');
  });

  it('a workshop opens on its editor, then on the corkboard once a level of it is pinned', () => {
    expect(entryPage(W, EMPTY)).toEqual({ kind: 'taller' });
    const p = publish(EMPTY, { id: 'yo-1', sheet: 7, board: defaultDraft(false).board, lines: 5, solution: [] });
    expect(entryPage(W, p)).toEqual({ kind: 'cartelera' });
    expect(entryPage(sheetByN(15)!, p)).toEqual({ kind: 'taller' });
  });

  it('the test page (once the level is pinned) and a played card lead to the corkboard, the corkboard to the map', () => {
    expect(nextHref(W, { kind: 'probar' })).toBe(sheetHref(7, { kind: 'cartelera' }));
    expect(nextHref(W, { kind: 'tarjeta', card: 'ej-1' })).toBe(sheetHref(7, { kind: 'cartelera' }));
    expect(nextHref(W, { kind: 'cartelera' })).toBe(MAP_HREF);
  });

  it('a card is a level with its own id; the editor and the test page are not levels of the progress', () => {
    expect(levelIdOf(W, { kind: 'tarjeta', card: 'ej-2' })).toBe(cardLevelId('ej-2'));
    expect(levelIdOf(W, { kind: 'taller' })).toBeNull();
    expect(levelIdOf(W, { kind: 'probar' })).toBeNull();
    expect(cardLevelId('ej-2')).toBe('1ro-c-ej-2');
  });
});

describe('the comodín', () => {
  const H = sheetByN(16)!;

  it('has URLs that parse back', () => {
    const pages: SheetPage[] = [
      { kind: 'comodin' }, { kind: 'recuperar' }, { kind: 'pendiente', n: 3, k: 1 }, { kind: 'repaso', n: 5, i: 2 }, { kind: 'musica' },
      { kind: 'cartelera' }, { kind: 'tarjeta', card: 'ej-7' },
    ];
    for (const page of pages) expect(parseRoute(sheetHref(16, page))).toEqual({ screen: 'sheet', n: 16, page });
    expect(sheetHref(16, { kind: 'pendiente', n: 3, k: 1 })).toBe('#/1ro/hoja/16/recuperar/3/1');
  });

  it('opens on its three choices; its pages lead back to them, a page of the bridge to the bridge', () => {
    expect(entryPage(H, EMPTY)).toEqual({ kind: 'comodin' });
    expect(nextHref(H, { kind: 'musica' })).toBe(sheetHref(16, { kind: 'comodin' }));
    expect(nextHref(H, { kind: 'cartelera' })).toBe(sheetHref(16, { kind: 'comodin' }));
    expect(nextHref(H, { kind: 'tarjeta', card: 'ej-1' })).toBe(sheetHref(16, { kind: 'cartelera' }));
    expect(nextHref(H, { kind: 'pendiente', n: 2, k: 1 })).toBe(sheetHref(16, { kind: 'recuperar' }));
    expect(nextHref(H, { kind: 'repaso', n: 2, i: 1 })).toBe(sheetHref(16, { kind: 'recuperar' }));
    expect(nextHref(H, { kind: 'comodin' })).toBe(MAP_HREF);
  });

  it('its pages are the other sheets\' levels: the pending page, the review extra, the free song', () => {
    expect(levelIdOf(H, { kind: 'pendiente', n: 3, k: 1 })).toBe('1ro-h3-1');
    expect(levelIdOf(H, { kind: 'repaso', n: 5, i: 2 })).toBe(extraId({ grade: '1ro', n: 5 }, 'easy', 2));
    expect(levelIdOf(H, { kind: 'musica' })).toBe('1ro-h9-4');
    const free = sheetByN(FREE_SONG.n)!.core[FREE_SONG.k - 1].level;
    expect(free.music?.free).toBeDefined();
  });

  it('the bridge lists the essential pages still pending on the sheets the teacher opened, in order (all of them in dev mode)', () => {
    let p = openSheet(EMPTY, 3);
    expect(pendingEssentials(p)).toEqual([{ n: 1, k: 1 }, { n: 1, k: 3 }, { n: 2, k: 1 }, { n: 2, k: 3 }, { n: 3, k: 1 }, { n: 3, k: 3 }]);
    p = solve(solve(p, '1ro-h1-1'), '1ro-h2-3');
    expect(pendingEssentials(p)).toEqual([{ n: 1, k: 3 }, { n: 2, k: 1 }, { n: 3, k: 1 }, { n: 3, k: 3 }]);
    expect(pendingEssentials(p, true).length).toBeGreaterThan(4);
    for (const { n, k } of pendingEssentials(p, true)) expect(sheetByN(n)!.core[k - 1].essential).toBe(true);
  });

  it('with nothing pending, a review page: the next extra behind the easy door of an opened sheet', () => {
    let p = openSheet(EMPTY, 2);
    for (const { n, k } of pendingEssentials(p)) p = solve(p, coreId({ grade: '1ro', n }, k));
    expect(pendingEssentials(p)).toEqual([]);
    expect(reviewPage(p, 0)).toEqual({ n: 1, i: 1 });
    expect(reviewPage(p, 0.99)).toEqual({ n: 2, i: 1 });
    p = solve(p, extraId({ grade: '1ro', n: 2 }, 'easy', 1));
    expect(reviewPage(p, 0.7)).toEqual({ n: 2, i: 2 });
    expect(reviewPage(openSheet(EMPTY, 17), 0.999, false)?.n).toBe(14);
  });

  it('its choices are goals of the progress', () => {
    expect(goalId(H, 'companeros')).toBe('1ro-h16-companeros');
    expect(currentSheet(reachGoal(openSheet(EMPTY, 16), goalId(H, 'recuperar'))).n).toBe(1);
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(6);
  });
});
