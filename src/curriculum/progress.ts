// The child's progress through the year: which levels are solved, the seeds
// earned, the sheet the teacher has opened, the levels made in the workshops,
// and the motivation layer (the character and what it wears, the garden, the
// showcase's pages). One player, in the browser only (accounts and server
// sync come next iteration).
//
// Two layers, so the next iteration can swap the storage without touching
// the screens:
// - pure transitions over a plain `Progress` value (`solve`, `grant`, …);
// - a small store that keeps the current value, notifies React, and writes
//   it to a versioned localStorage key. Every storage access is wrapped: with
//   storage blocked or broken the app keeps working in memory.

import { useSyncExternalStore } from 'react';
import { EXAMPLES } from './classmates';
import { DOORS, bossId, coreId, extraPrefix, hasCore, type Door, type Sheet } from './model';
import { SLOTS, isCharacterId, isCritterId, isItemId, itemById, type CharacterId, type CritterId, type ItemId, type Outfit, type Slot } from './motivation';
import { isDraft, isMadeLevel, type Draft, type MadeLevel } from './workshop';

export const STORAGE_KEY = 'camino.progress.v1';
export const LAST_SHEET = 17;
/** The showcase (sheet 17) shows a family two or three pages. */
export const MAX_FAVORITES = 3;

/** A spot in the garden, in its drawing's units (curriculum/garden.ts). */
export type Spot = readonly [number, number];

export interface Progress {
  v: 1;
  /** Solved level ids (see curriculum/model: coreId, extraId, bossId; workshop: cardLevelId). */
  solved: Readonly<Record<string, true>>;
  /**
   * Pages stamped in gold: their save-blocks challenge was solved (the ids of
   * the pages themselves). No seed: they grow rare gold flowers in the garden.
   */
  gold: Readonly<Record<string, true>>;
  /** One per first solve of a level, plus what the dev drawer grants. Never spent: the garden grows from them. */
  seeds: number;
  /** The sheet the teacher opened for the class: later sheets wait (faded on the map). */
  opened: number;
  /** The child's character (curriculum/motivation.ts: brote, mina, pliegue, ovillo). */
  character: CharacterId;
  /** Levels made in the workshops on this device, in the order they were pinned (curriculum/workshop.ts). T3b. */
  made: readonly MadeLevel[];
  /** How many times each corkboard level was played to a win on this device, by card id. */
  plays: Readonly<Record<string, number>>;
  /** The level being made in each workshop (by sheet number), kept between the editor and its test page. */
  drafts: Readonly<Record<string, Draft>>;
  /** Things done on a sheet that are not levels: the comodín's choices played (`1ro-h16-recuperar`, …), the showcase's. */
  goals: Readonly<Record<string, true>>;
  // ---------------------------------------------------------------- T4: the motivation layer
  /** The child picked their character (sheet 1 asks once; the wardrobe changes it). Until then it is Brote. */
  picked: boolean;
  /** What the character wears, one item per slot (curriculum/rewards.ts only shows the unlocked ones). */
  outfit: Outfit;
  /** Wardrobe items the dev drawer gave (the year's milestones unlock the rest: curriculum/rewards.ts). */
  items: Readonly<Partial<Record<ItemId, true>>>;
  /** Critters the dev drawer sent to the garden (the rest come from the bosses). */
  critters: Readonly<Partial<Record<CritterId, true>>>;
  /** Rewards already shown arriving (`item:capa`, `critter:coati`, `plant:girasol`): a new one is greeted once. */
  seen: Readonly<Record<string, true>>;
  /** Where the child dragged the garden's big plants (plant id → spot); the rest stand where the garden puts them. */
  garden: Readonly<Record<string, Spot>>;
  /** The pages picked for the showcase (level ids: core pages, bosses, levels made here), at most three. */
  favorites: readonly string[];
  /** Sheets whose end-of-sheet preview card was shown (by number). */
  previewed: Readonly<Record<string, true>>;
  /** The teacher opened the wardrobe (at the end of a class). Dev mode always may. */
  wardrobe: boolean;
}

export const EMPTY: Progress = Object.freeze({
  v: 1, solved: Object.freeze({}), gold: Object.freeze({}), seeds: 0, opened: 1, character: 'brote',
  made: Object.freeze([]) as readonly MadeLevel[], plays: Object.freeze({}), drafts: Object.freeze({}), goals: Object.freeze({}),
  picked: false, outfit: Object.freeze({}), items: Object.freeze({}), critters: Object.freeze({}), seen: Object.freeze({}),
  garden: Object.freeze({}), favorites: Object.freeze([]) as readonly string[], previewed: Object.freeze({}), wardrobe: false,
});

// ------------------------------------------------------------------ pure transitions

/** Marks a level solved; the first time it also earns a seed. */
export function solve(p: Progress, id: string): Progress {
  if (p.solved[id]) return p;
  return { ...p, solved: { ...p.solved, [id]: true }, seeds: p.seeds + 1 };
}

/** Stamps a page in gold (its save-blocks challenge); the page counts as solved too. */
export function earnGold(p: Progress, id: string): Progress {
  if (p.gold[id]) return p;
  const base = p.solved[id] ? p : solve(p, id);
  return { ...base, gold: { ...base.gold, [id]: true } };
}

export const grant = (p: Progress, n: number): Progress => ({ ...p, seeds: Math.max(0, p.seeds + Math.round(n)) });
export const openSheet = (p: Progress, n: number): Progress => ({ ...p, opened: clampSheet(n) });
const clampSheet = (n: number) => Math.min(LAST_SHEET, Math.max(1, Math.round(n) || 1));

// ------------------------------------------------------------------ the motivation layer (T4)

/** The child picks a character (sheet 1, the wardrobe). An unknown id changes nothing. */
export const chooseCharacter = (p: Progress, id: string): Progress =>
  (isCharacterId(id) && (id !== p.character || !p.picked) ? { ...p, character: id, picked: true } : p);

/** Puts an item on its slot (null takes that slot's item off). Whether it is unlocked is curriculum/rewards.ts's `wear`. */
export function setOutfit(p: Progress, slot: Slot, item: ItemId | null): Progress {
  const outfit: Partial<Record<Slot, ItemId>> = { ...p.outfit };
  if (item && itemById(item)?.slot === slot) outfit[slot] = item;
  else delete outfit[slot];
  return { ...p, outfit };
}

/** The dev drawer gives an item before its milestone. */
export const grantItem = (p: Progress, id: ItemId): Progress => (p.items[id] ? p : { ...p, items: { ...p.items, [id]: true } });
/** The dev drawer sends a critter to the garden before its boss. */
export const grantCritter = (p: Progress, id: CritterId): Progress => (p.critters[id] ? p : { ...p, critters: { ...p.critters, [id]: true } });

/** Rewards shown arriving (a critter walked into the garden, a new item was greeted). */
export function markSeen(p: Progress, keys: readonly string[]): Progress {
  const fresh = keys.filter((k) => !p.seen[k]);
  if (!fresh.length) return p;
  return { ...p, seen: { ...p.seen, ...Object.fromEntries(fresh.map((k) => [k, true as const])) } };
}

/** The child dragged one of the garden's big plants to a new spot (null puts it back where the garden places it). */
export function placeInGarden(p: Progress, id: string, spot: Spot | null): Progress {
  const garden = { ...p.garden };
  if (spot) garden[id] = [Math.round(spot[0]), Math.round(spot[1])];
  else delete garden[id];
  return { ...p, garden };
}

/** A page picked for the showcase, or put back; a fourth one waits (the child puts one back first). */
export function toggleFavorite(p: Progress, id: string): Progress {
  if (p.favorites.includes(id)) return { ...p, favorites: p.favorites.filter((f) => f !== id) };
  if (p.favorites.length >= MAX_FAVORITES) return p;
  return { ...p, favorites: [...p.favorites, id] };
}

/** The end-of-sheet preview card of sheet `n` was shown. */
export const markPreviewed = (p: Progress, n: number): Progress => (p.previewed[String(n)] ? p : { ...p, previewed: { ...p.previewed, [String(n)]: true } });
/** The teacher opens (or closes) the wardrobe. */
export const setWardrobe = (p: Progress, open: boolean): Progress => (p.wardrobe === open ? p : { ...p, wardrobe: open });

/** The level being made in workshop `n` (null forgets it). */
export function saveDraft(p: Progress, n: number, draft: Draft | null): Progress {
  const drafts = { ...p.drafts };
  if (draft) drafts[String(n)] = structuredClone(draft);
  else delete drafts[String(n)];
  return { ...p, drafts };
}

/** A level pinned on the corkboard; its workshop starts a new one. Its seed comes when it is solved (cardLevelId). */
export function publish(p: Progress, level: MadeLevel): Progress {
  if (p.made.some((m) => m.id === level.id)) return p;
  return saveDraft({ ...p, made: [...p.made, structuredClone(level)] }, level.sheet, null);
}

/** A corkboard level was played to a win on this device. */
export const played = (p: Progress, card: string): Progress => ({ ...p, plays: { ...p.plays, [card]: (p.plays[card] ?? 0) + 1 } });

/** Forgets the levels made on this device, their plays and the drafts; the seeds they earned stay. */
export function clearMade(p: Progress): Progress {
  const mine = new Set(p.made.map((m) => m.id));
  const plays = Object.fromEntries(Object.entries(p.plays).filter(([k]) => !mine.has(k)));
  return { ...p, made: [], plays, drafts: {} };
}

/** Something done on a sheet that is not a level (the comodín's choices). */
export const reachGoal = (p: Progress, id: string): Progress => (p.goals[id] ? p : { ...p, goals: { ...p.goals, [id]: true } });

/** Reads a stored value. Anything unknown, old or broken becomes a fresh start (never a crash). */
export function parse(raw: string | null | undefined): Progress {
  if (!raw) return EMPTY;
  try {
    const o = JSON.parse(raw) as Partial<Progress> | null;
    if (!o || o.v !== 1) return EMPTY;
    const ids = (x: unknown) => {
      const out: Record<string, true> = {};
      if (x && typeof x === 'object') for (const k of Object.keys(x)) out[k] = true;
      return out;
    };
    const record = <T>(x: unknown, keep: (v: unknown) => v is T) => {
      const out: Record<string, T> = {};
      if (x && typeof x === 'object' && !Array.isArray(x)) for (const [k, v] of Object.entries(x)) if (keep(v)) out[k] = v;
      return out;
    };
    const count = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
    const solved = ids(o.solved);
    const made = Array.isArray(o.made) ? o.made.filter(isMadeLevel) : [];
    const only = <K extends string>(x: unknown, keep: (k: string) => k is K) => Object.fromEntries(Object.keys(ids(x)).filter(keep).map((k) => [k, true as const])) as Partial<Record<K, true>>;
    const outfit: Partial<Record<Slot, ItemId>> = {};
    if (o.outfit && typeof o.outfit === 'object') {
      for (const slot of SLOTS) {
        const it = (o.outfit as Record<string, unknown>)[slot];
        if (isItemId(it) && itemById(it)!.slot === slot) outfit[slot] = it;
      }
    }
    const spot = (v: unknown): v is Spot => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(n));
    const favorites = Array.isArray(o.favorites) ? o.favorites.filter((f, i, a): f is string => typeof f === 'string' && a.indexOf(f) === i).slice(0, MAX_FAVORITES) : [];
    return {
      v: 1,
      solved,
      // stored before gold stamps existed: none yet
      gold: ids(o.gold),
      seeds: Number.isFinite(o.seeds) ? Math.max(0, Math.round(o.seeds!)) : Object.keys(solved).length,
      opened: clampSheet(Number(o.opened)),
      character: isCharacterId(o.character) ? o.character : 'brote',
      // stored before the workshops existed: nothing made, played or reached yet; a broken entry is left out
      made: made.filter((m, i) => made.findIndex((x) => x.id === m.id) === i),
      plays: record(o.plays, count),
      drafts: record(o.drafts, isDraft),
      goals: ids(o.goals),
      // stored before the motivation layer (T4): nothing picked, worn, given, seen, moved or chosen yet; unknown ids are left out
      picked: o.picked === true,
      outfit,
      items: only(o.items, isItemId),
      critters: only(o.critters, isCritterId),
      seen: ids(o.seen),
      garden: record(o.garden, spot),
      favorites,
      previewed: ids(o.previewed),
      wardrobe: o.wardrobe === true,
    };
  } catch {
    return EMPTY;
  }
}

// ------------------------------------------------------------------ what a sheet looks like from the progress

export interface SheetState {
  coreSolved: number;
  coreTotal: number;
  essentialSolved: number;
  essentialTotal: number;
  /** Every core level solved: the sheet gets its stamp on the map. */
  complete: boolean;
  bossSolved: boolean;
  /** Extras solved behind each door. */
  extras: Record<Door, number>;
  /** Pages of the sheet (core, boss, extras) stamped in gold. */
  gold: number;
  /** A workshop: the levels pinned from it on this device. */
  published: number;
  /** A workshop: a classmate's level was played (a limited one, on the limited workshop). */
  playedOthers: boolean;
  /** The comodín: its choices played (goal names: `recuperar`, `musica`, `companeros`); the showcase: its steps (`familia`, `jardin`, `afiche`). */
  goals: string[];
}

export function sheetState(s: Sheet, p: Progress): SheetState {
  const core = s.core.map((c, i) => ({ essential: !!c.essential, done: !!p.solved[coreId(s, i + 1)] }));
  const extras = {} as Record<Door, number>;
  for (const d of DOORS) {
    const pre = extraPrefix(s, d);
    extras[d] = Object.keys(p.solved).filter((k) => k.startsWith(pre)).length;
  }
  const coreSolved = core.filter((c) => c.done).length;
  const own = `${s.grade}-h${s.n}-`;
  const published = s.workshop ? p.made.filter((m) => m.sheet === s.n).length : 0;
  const playedOthers = !!s.workshop && EXAMPLES.some((e) => (p.plays[e.id] ?? 0) > 0 && (!s.workshop!.limited || e.sheet === s.n));
  const goals = s.hub || s.showcase ? Object.keys(p.goals).filter((k) => k.startsWith(own)).map((k) => k.slice(own.length)) : [];
  return {
    coreSolved,
    coreTotal: core.length,
    essentialSolved: core.filter((c) => c.essential && c.done).length,
    essentialTotal: core.filter((c) => c.essential).length,
    // the showcase is done once the family played one of the child's pages
    complete: hasCore(s) ? coreSolved === core.length : s.workshop ? published > 0 && playedOthers : s.showcase ? goals.includes('familia') : goals.length > 0,
    bossSolved: !!p.solved[bossId(s)],
    extras,
    gold: Object.keys(p.gold).filter((k) => k.startsWith(own)).length,
    published,
    playedOthers,
    goals,
  };
}

// ------------------------------------------------------------------ the store

/** The part of Web Storage the store needs (a fake one in tests; null when storage is blocked). */
export type Backing = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ProgressStore {
  get(): Progress;
  /** Applies a transition, notifies and saves. */
  update(fn: (p: Progress) => Progress): Progress;
  /** Forgets everything (and the stored copy). */
  reset(): void;
  subscribe(fn: () => void): () => void;
  /**
   * Moves the store onto another storage (the pilot playtest keeps its own
   * progress, in memory, and never touches the demo's key); the value is read
   * from there on next use and every screen redraws.
   */
  swap(backing: Backing | null, key?: string): void;
}

/** The store reads its storage lazily, on first use, so a mode that swaps it before any screen reads it never reads the other key. */
export function createProgressStore(backing: Backing | null, key = STORAGE_KEY): ProgressStore {
  let current = EMPTY;
  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    try { current = parse(backing?.getItem(key)); } catch { current = EMPTY; }
  };
  const subs = new Set<() => void>();
  const save = () => {
    try { backing?.setItem(key, JSON.stringify(current)); } catch { /* storage full or blocked: keep playing in memory */ }
  };
  const set = (next: Progress) => {
    if (next === current) return;
    current = next;
    save();
    subs.forEach((f) => f());
  };
  return {
    get: () => { load(); return current; },
    update(fn) { load(); set(fn(current)); return current; },
    reset() {
      try { backing?.removeItem(key); } catch { /* nothing stored, nothing to forget */ }
      loaded = true;
      current = EMPTY;
      subs.forEach((f) => f());
    },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    swap(next, nextKey = STORAGE_KEY) {
      if (next === backing && nextKey === key) return;
      backing = next;
      key = nextKey;
      loaded = false;
      current = EMPTY;
      subs.forEach((f) => f());
    },
  };
}

/** localStorage, or null where touching it throws (privacy modes, blocked site data). */
export function browserStorage(): Backing | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = `${STORAGE_KEY}.probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

/** The app's one store. */
export const progress = createProgressStore(browserStorage());

export function useProgress(): Progress {
  return useSyncExternalStore(progress.subscribe, progress.get, progress.get);
}
