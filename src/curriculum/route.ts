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
// A workshop (sheets 7 and 15):
//   #/1ro/hoja/<n>/taller                  the level editor
//   #/1ro/hoja/<n>/taller/probar           the author plays the level being made
//   #/1ro/hoja/<n>/cartelera               the class corkboard
//   #/1ro/hoja/<n>/cartelera/<card>        a level of the corkboard, played (ej-3, yo-1)
// The comodín (sheet 16), which has the corkboard too:
//   #/1ro/hoja/16/comodin                  three choices
//   #/1ro/hoja/16/recuperar                the bridge: the essential pages still pending
//   #/1ro/hoja/16/recuperar/<m>/<k>        sheet m's page k, played from the bridge
//   #/1ro/hoja/16/repaso/<m>/<i>           nothing pending: a review page, sheet m's easy door extra i
//   #/1ro/hoja/16/musica                   sheet 9's free song
// Sheet 1 asks the child to pick a character the first time:
//   #/1ro/hoja/1/personaje
// The showcase (sheet 17):
//   #/1ro/hoja/17/muestra                  its four steps on the riverbank
//   #/1ro/hoja/17/elegir                   the child picks two or three pages
//   #/1ro/hoja/17/familia/<i>              the family plays the i-th of them
//   #/1ro/hoja/17/jardin                   the garden tour
//   #/1ro/hoja/17/afiche                   the poster of the year
// The pilot playtest (a separate deploy opens it at the root):
//   #/piloto                               the playtest's session flow
//   #/demo                                 the demo's home (a playtest build's root is the playtest)
// The motivation layer, outside the sheets:
//   #/1ro/jardin                           the child's garden (…/jardin/<n>: dev preview with n seeds)
//   #/1ro/vestidor                         the wardrobe

import { DOORS, bossId, coreId, extraId, hasCore, isBuilt, type Door, type Sheet } from './model';
import { PRIMER, sheetByN } from './primer';
import { sheetState, type Progress } from './progress';
import { cardLevelId } from './workshop';

/** A level page (core, extra, boss) may be its gold-stamp challenge: the same board with fewer lines. */
export type SheetPage =
  | { kind: 'entry' }
  | { kind: 'core'; k: number; gold?: true }
  | { kind: 'doors' }
  | { kind: 'extra'; door: Door; i: number; gold?: true }
  | { kind: 'boss'; gold?: true }
  /** A workshop's level editor. */
  | { kind: 'taller' }
  /** A workshop: the author plays the level being made, with the notebook the classmates will get. */
  | { kind: 'probar' }
  /** The class corkboard (a workshop's, or the comodín's). */
  | { kind: 'cartelera' }
  /** A level of the corkboard, played. */
  | { kind: 'tarjeta'; card: string }
  /** The comodín's three choices. */
  | { kind: 'comodin' }
  /** The comodín: the bridge of the essential pages still pending. */
  | { kind: 'recuperar' }
  /** The comodín: sheet `n`'s pending essential page `k`, played from the bridge. */
  | { kind: 'pendiente'; n: number; k: number }
  /** The comodín: with nothing pending, a review page (the easy door's extra `i` of sheet `n`). */
  | { kind: 'repaso'; n: number; i: number }
  /** The comodín: the free song of the music recess. */
  | { kind: 'musica' }
  /** Sheet 1: the child picks a character (the first time the sheet opens). */
  | { kind: 'personaje' }
  /** The showcase: its four steps. */
  | { kind: 'muestra' }
  /** The showcase: the child picks the pages to show. */
  | { kind: 'elegir' }
  /** The showcase: the family plays the child's `i`-th page (from 1). */
  | { kind: 'familia'; i: number }
  /** The showcase: the garden tour. */
  | { kind: 'recorrido' }
  /** The showcase: the poster of the year. */
  | { kind: 'afiche' };

/** The free song the comodín offers: sheet 9's page 4. */
export const FREE_SONG = { n: 9, k: 4 } as const;

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
  | { screen: 'sheet'; n: number; page: SheetPage }
  /** The child's garden; `seeds`: the dev drawer's preview of a garden with that many. */
  | { screen: 'garden'; seeds?: number }
  | { screen: 'wardrobe' }
  /** Dev: every wardrobe piece on every character. */
  | { screen: 'fitting' }
  /** The pilot playtest (src/playtest): `#/piloto`, and the empty hash of a playtest build. */
  | { screen: 'piloto' };

/** The doors in the URL (Spanish, like `nivel` and `hoja`). */
const DOOR_SLUG: Record<Door, string> = { easy: 'facil', medium: 'media', hard: 'dificil' };
const doorOfSlug = (s: string): Door | null => DOORS.find((d) => DOOR_SLUG[d] === s) ?? null;

export const MAP_HREF = '#/1ro';
export const GARDEN_HREF = '#/1ro/jardin';
export const WARDROBE_HREF = '#/1ro/vestidor';
/** The showcase's sheet. */
export const SHOWCASE = 17;

export function sheetHref(n: number, page: SheetPage = { kind: 'entry' }): string {
  const base = `#/1ro/hoja/${n}`;
  const gold = isGold(page) ? '/oro' : '';
  switch (page.kind) {
    case 'entry': return base;
    case 'core': return `${base}/${page.k}${gold}`;
    case 'doors': return `${base}/puertas`;
    case 'extra': return `${base}/puerta/${DOOR_SLUG[page.door]}/${page.i}${gold}`;
    case 'boss': return `${base}/jefe${gold}`;
    case 'taller': return `${base}/taller`;
    case 'probar': return `${base}/taller/probar`;
    case 'cartelera': return `${base}/cartelera`;
    case 'tarjeta': return `${base}/cartelera/${page.card}`;
    case 'comodin': return `${base}/comodin`;
    case 'recuperar': return `${base}/recuperar`;
    case 'pendiente': return `${base}/recuperar/${page.n}/${page.k}`;
    case 'repaso': return `${base}/repaso/${page.n}/${page.i}`;
    case 'musica': return `${base}/musica`;
    case 'personaje': return `${base}/personaje`;
    case 'muestra': return `${base}/muestra`;
    case 'elegir': return `${base}/elegir`;
    case 'familia': return `${base}/familia/${page.i}`;
    case 'recorrido': return `${base}/jardin`;
    case 'afiche': return `${base}/afiche`;
  }
}

/** The pages that take no number, by their slug. */
const PLAIN: Record<string, SheetPage> = {
  puertas: { kind: 'doors' }, jefe: { kind: 'boss' }, taller: { kind: 'taller' }, 'taller/probar': { kind: 'probar' },
  cartelera: { kind: 'cartelera' }, comodin: { kind: 'comodin' }, recuperar: { kind: 'recuperar' }, musica: { kind: 'musica' },
  personaje: { kind: 'personaje' }, muestra: { kind: 'muestra' }, elegir: { kind: 'elegir' }, jardin: { kind: 'recorrido' }, afiche: { kind: 'afiche' },
};

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, '').replace(/\/+$/, '');
  let m = h.match(/^\/nivel\/([\w-]+)$/);
  if (m) return { screen: 'level', id: m[1] };
  if (h === '/1ro') return { screen: 'map' };
  if (h === '/1ro/vestidor') return { screen: 'wardrobe' };
  if (h === '/probador') return { screen: 'fitting' };
  if (h === '/piloto') return { screen: 'piloto' };
  // the demo's home under its own name, for a playtest build whose root is the playtest
  if (h === '/demo') return { screen: 'home' };
  m = h.match(/^\/1ro\/jardin(?:\/(\d+))?$/);
  if (m) return m[1] ? { screen: 'garden', seeds: Number(m[1]) } : { screen: 'garden' };
  m = h.match(/^\/1ro\/hoja\/(\d+)(?:\/(.*))?$/);
  if (!m) return { screen: 'home' };
  const n = Number(m[1]);
  if (!sheetByN(n)) return { screen: 'map' };
  const all = m[2] ?? '';
  const gold = /\/oro$/.test(all);
  const rest = gold ? all.replace(/\/oro$/, '') : all;
  const sheet = (page: SheetPage): Route => ({ screen: 'sheet', n, page: gold ? goldPage(page) : page });
  if (!rest) return sheet({ kind: 'entry' });
  if (PLAIN[rest]) return sheet({ ...PLAIN[rest] });
  if (/^\d+$/.test(rest)) return sheet({ kind: 'core', k: Math.max(1, Number(rest)) });
  const x = rest.match(/^puerta\/(\w+)(?:\/(\d+))?$/);
  const door = x ? doorOfSlug(x[1]) : null;
  if (x && door) return sheet({ kind: 'extra', door, i: Math.max(1, Number(x[2] ?? 1)) });
  const card = rest.match(/^cartelera\/([\w-]+)$/);
  if (card) return sheet({ kind: 'tarjeta', card: card[1] });
  const fam = rest.match(/^familia\/(\d+)$/);
  if (fam) return sheet({ kind: 'familia', i: Math.max(1, Number(fam[1])) });
  const two = rest.match(/^(recuperar|repaso)\/(\d+)\/(\d+)$/);
  if (two) {
    const [m, k] = [Number(two[2]), Math.max(1, Number(two[3]))];
    return sheet(two[1] === 'recuperar' ? { kind: 'pendiente', n: m, k } : { kind: 'repaso', n: m, i: k });
  }
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

/** The sheet that asks the child to pick a character (the first time it opens). */
export const CHOICE_SHEET = 1;

/**
 * The page a sheet opens on: its first unsolved core level, or the doors once
 * the core is done; a workshop's editor, or its corkboard once a level of it
 * is pinned; the comodín's three choices; the showcase's steps. Sheet 1 first
 * asks for a character, until one is picked.
 */
export function entryPage(s: Sheet, p: Progress): SheetPage {
  if (s.hub) return { kind: 'comodin' };
  if (s.showcase) return { kind: 'muestra' };
  if (s.workshop) return sheetState(s, p).published ? { kind: 'cartelera' } : { kind: 'taller' };
  if (s.n === CHOICE_SHEET && !p.picked) return { kind: 'personaje' };
  const k = s.core.findIndex((_, i) => !p.solved[coreId(s, i + 1)]);
  return k >= 0 ? { kind: 'core', k: k + 1 } : { kind: 'doors' };
}

/**
 * Where "next page" leads: the next core level, then the doors; the next
 * extra of the same door; after the boss, the map. A gold challenge leads
 * where its page does. A workshop: its test page, once the level is pinned,
 * and a card played lead to the corkboard, and the corkboard to the map. The
 * comodín: its pages lead back to its choices (a page of the bridge, to the
 * bridge), the choices to the map. The character choice leads to the first
 * page. The showcase: the pages picked lead to the family's first one, each
 * family page to the next (the showcase's steps after the last), the garden
 * tour back to the steps, the poster to the map.
 */
export function nextHref(s: Sheet, from: SheetPage, favorites = 3): string {
  const page = plainPage(from);
  switch (page.kind) {
    case 'core': return page.k < s.core.length ? sheetHref(s.n, { kind: 'core', k: page.k + 1 }) : sheetHref(s.n, { kind: 'doors' });
    case 'extra': return sheetHref(s.n, { ...page, i: page.i + 1 });
    case 'boss': case 'comodin': case 'muestra': case 'afiche': return MAP_HREF;
    case 'taller': case 'probar': case 'tarjeta': return sheetHref(s.n, { kind: 'cartelera' });
    case 'cartelera': return s.hub ? sheetHref(s.n, { kind: 'comodin' }) : MAP_HREF;
    case 'recuperar': case 'musica': return sheetHref(s.n, { kind: 'comodin' });
    case 'pendiente': case 'repaso': return sheetHref(s.n, { kind: 'recuperar' });
    case 'personaje': return sheetHref(s.n, { kind: 'core', k: 1 });
    case 'elegir': return sheetHref(s.n, { kind: 'familia', i: 1 });
    case 'familia': return page.i < favorites ? sheetHref(s.n, { kind: 'familia', i: page.i + 1 }) : sheetHref(s.n, { kind: 'muestra' });
    case 'recorrido': return sheetHref(s.n, { kind: 'muestra' });
    default: return sheetHref(s.n, { kind: 'doors' });
  }
}

/** The level id of a page, when it is a level (a gold challenge counts as its page; the comodín's pages are other sheets' levels). */
export function levelIdOf(s: Sheet, page: SheetPage): string | null {
  const other = (n: number) => ({ grade: s.grade, n });
  switch (page.kind) {
    case 'core': return coreId(s, page.k);
    case 'extra': return extraId(s, page.door, page.i);
    case 'boss': return bossId(s);
    case 'tarjeta': return cardLevelId(page.card);
    case 'pendiente': return coreId(other(page.n), page.k);
    case 'repaso': return extraId(other(page.n), 'easy', page.i);
    case 'musica': return coreId(other(FREE_SONG.n), FREE_SONG.k);
    default: return null;
  }
}

// ------------------------------------------------------------------ the comodín's bridge

/** The sheets of pages the child can catch up on: the ones the teacher opened (all of them in dev mode). */
const catchUpSheets = (p: Progress, all: boolean) => PRIMER.filter((s) => hasCore(s) && (all || s.n <= p.opened));

/** The essential pages still to solve on the sheets the teacher opened, in the year's order (the bridge of "Recuperar"). */
export function pendingEssentials(p: Progress, all = false): { n: number; k: number }[] {
  return catchUpSheets(p, all).flatMap((s) => s.core.flatMap((c, i) => (c.essential && !p.solved[coreId(s, i + 1)] ? [{ n: s.n, k: i + 1 }] : [])));
}

/**
 * With nothing pending, a review page: the next extra behind the easy door of
 * one of those sheets, taken at random (`r` in [0, 1)); null without any.
 */
export function reviewPage(p: Progress, r: number, all = false): { n: number; i: number } | null {
  const sheets = catchUpSheets(p, all).filter((s) => s.extras);
  if (!sheets.length) return null;
  const s = sheets[Math.min(sheets.length - 1, Math.max(0, Math.floor(r * sheets.length)))];
  return { n: s.n, i: nextExtra(s, 'easy', p) };
}

/**
 * The sheet Brote waits on: the first built sheet the teacher has opened that
 * is not complete yet; when all of them are, the last one of them.
 */
export function currentSheet(p: Progress): Sheet {
  const open = PRIMER.filter((s) => sheetOpen(s, p));
  return open.find((s) => !sheetState(s, p).complete) ?? open[open.length - 1] ?? PRIMER[0];
}
