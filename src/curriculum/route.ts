// Where things are in 1ro's year, as pure functions: the URL of every page,
// which page a sheet opens on, where "next page" leads, what is open for the
// child, and which sheet Brote waits on. The screens, the dev drawer and the
// tests share them.
//
// Routes (hash):
//   #/1ro                                  the forest map
//   #/1ro/hoja/<n>                         a sheet: opens on its next page
//   #/1ro/hoja/<n>/<k>                     core level k
//   #/1ro/hoja/<n>/puertas                 the three doors and the boss page
//   #/1ro/hoja/<n>/puerta/<door>/<i>       the i-th extra behind a door (facil | media | dificil)
//   #/1ro/hoja/<n>/jefe                    the boss
//   …/oro after a level page               its gold-stamp challenge (save blocks)

import { DOORS, bossId, coreId, extraId, isBuilt, type Door, type Sheet } from './model';
import { PRIMER, sheetByN } from './primer';
import { sheetState, type Progress } from './progress';

/** A level page (core, extra, boss) may be its gold-stamp challenge: the same board with fewer lines. */
export type SheetPage =
  | { kind: 'entry' }
  | { kind: 'core'; k: number; gold?: true }
  | { kind: 'doors' }
  | { kind: 'extra'; door: Door; i: number; gold?: true }
  | { kind: 'boss'; gold?: true };

/** The page itself, not its gold challenge. */
export function plainPage(page: SheetPage): SheetPage {
  if (!('gold' in page)) return page;
  const out: { gold?: true } = { ...page };
  delete out.gold;
  return out as SheetPage;
}

/** The gold challenge of a level page (the page itself for the doors and the entry). */
export const goldPage = (page: SheetPage): SheetPage =>
  (page.kind === 'core' || page.kind === 'extra' || page.kind === 'boss' ? { ...plainPage(page), gold: true } as SheetPage : page);

export const isGold = (page: SheetPage) => 'gold' in page && !!page.gold;

export type Route =
  | { screen: 'home' }
  | { screen: 'level'; id: string }
  | { screen: 'map' }
  | { screen: 'sheet'; n: number; page: SheetPage };

/** The doors in the URL (Spanish, like `nivel` and `hoja`). */
const DOOR_SLUG: Record<Door, string> = { easy: 'facil', medium: 'media', hard: 'dificil' };
const doorOfSlug = (s: string): Door | null => DOORS.find((d) => DOOR_SLUG[d] === s) ?? null;

export const MAP_HREF = '#/1ro';

export function sheetHref(n: number, page: SheetPage = { kind: 'entry' }): string {
  const base = `#/1ro/hoja/${n}`;
  const gold = isGold(page) ? '/oro' : '';
  switch (page.kind) {
    case 'entry': return base;
    case 'core': return `${base}/${page.k}${gold}`;
    case 'doors': return `${base}/puertas`;
    case 'extra': return `${base}/puerta/${DOOR_SLUG[page.door]}/${page.i}${gold}`;
    case 'boss': return `${base}/jefe${gold}`;
  }
}

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, '').replace(/\/+$/, '');
  let m = h.match(/^\/nivel\/([\w-]+)$/);
  if (m) return { screen: 'level', id: m[1] };
  if (h === '/1ro') return { screen: 'map' };
  m = h.match(/^\/1ro\/hoja\/(\d+)(?:\/(.*))?$/);
  if (!m) return { screen: 'home' };
  const n = Number(m[1]);
  if (!sheetByN(n)) return { screen: 'map' };
  const all = m[2] ?? '';
  const gold = /\/oro$/.test(all);
  const rest = gold ? all.replace(/\/oro$/, '') : all;
  const sheet = (page: SheetPage): Route => ({ screen: 'sheet', n, page: gold ? goldPage(page) : page });
  if (!rest) return sheet({ kind: 'entry' });
  if (rest === 'puertas') return sheet({ kind: 'doors' });
  if (rest === 'jefe') return sheet({ kind: 'boss' });
  if (/^\d+$/.test(rest)) return sheet({ kind: 'core', k: Math.max(1, Number(rest)) });
  const x = rest.match(/^puerta\/(\w+)(?:\/(\d+))?$/);
  const door = x ? doorOfSlug(x[1]) : null;
  if (x && door) return sheet({ kind: 'extra', door, i: Math.max(1, Number(x[2] ?? 1)) });
  return { screen: 'sheet', n, page: { kind: 'entry' } };
}

// ------------------------------------------------------------------ what is open

/**
 * The doors open once the teacher's minimum is done (every essential core
 * level): a child who struggles later in the core can go practise behind the
 * easy door. The boss waits for the whole core.
 */
export function doorsOpen(s: Sheet, p: Progress): boolean {
  const st = sheetState(s, p);
  return st.essentialSolved === st.essentialTotal && st.coreTotal > 0;
}
export const bossOpen = (s: Sheet, p: Progress) => !!s.boss && sheetState(s, p).complete;

/** A sheet the child can open from the map: built, and not past the one the teacher opened. */
export const sheetOpen = (s: Sheet, p: Progress) => isBuilt(s) && s.n <= p.opened;

/** The first extra behind a door not solved yet (from 1). */
export function nextExtra(s: Sheet, door: Door, p: Progress): number {
  let i = 1;
  while (p.solved[extraId(s, door, i)]) i++;
  return i;
}

/** The page a sheet opens on: its first unsolved core level, or the doors once the core is done. */
export function entryPage(s: Sheet, p: Progress): SheetPage {
  const k = s.core.findIndex((_, i) => !p.solved[coreId(s, i + 1)]);
  return k >= 0 ? { kind: 'core', k: k + 1 } : { kind: 'doors' };
}

/**
 * Where "next page" leads: the next core level, then the doors; the next
 * extra of the same door; after the boss, the map. A gold challenge leads
 * where its page does.
 */
export function nextHref(s: Sheet, from: SheetPage): string {
  const page = plainPage(from);
  if (page.kind === 'core') return page.k < s.core.length ? sheetHref(s.n, { kind: 'core', k: page.k + 1 }) : sheetHref(s.n, { kind: 'doors' });
  if (page.kind === 'extra') return sheetHref(s.n, { ...page, i: page.i + 1 });
  if (page.kind === 'boss') return MAP_HREF;
  return sheetHref(s.n, { kind: 'doors' });
}

/** The level id of a page, when it is a level (a gold challenge counts as its page). */
export function levelIdOf(s: Sheet, page: SheetPage): string | null {
  if (page.kind === 'core') return coreId(s, page.k);
  if (page.kind === 'extra') return extraId(s, page.door, page.i);
  if (page.kind === 'boss') return bossId(s);
  return null;
}

/**
 * The sheet Brote waits on: the first built sheet the teacher has opened that
 * is not complete yet; when all of them are, the last one of them.
 */
export function currentSheet(p: Progress): Sheet {
  const open = PRIMER.filter((s) => sheetOpen(s, p));
  return open.find((s) => !sheetState(s, p).complete) ?? open[open.length - 1] ?? PRIMER[0];
}
