// The child's progress through the year: which levels are solved, the seeds
// earned, the sheet the teacher has opened and the chosen character. One
// player, in the browser only (accounts and server sync come next iteration).
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
import { isDraft, isMadeLevel, type Draft, type MadeLevel } from './workshop';

export const STORAGE_KEY = 'camino.progress.v1';
export const LAST_SHEET = 17;

export interface Progress {
  v: 1;
  /** Solved level ids (see curriculum/model: coreId, extraId, bossId; workshop: cardLevelId). */
  solved: Readonly<Record<string, true>>;
  /**
   * Pages stamped in gold: their save-blocks challenge was solved (the ids of
   * the pages themselves). No seed: T4 grows rare flowers from them.
   */
  gold: Readonly<Record<string, true>>;
  /** One per first solve of a level, plus what the dev drawer grants. */
  seeds: number;
  /** The sheet the teacher opened for the class: later sheets wait (faded on the map). */
  opened: number;
  /** The child's character (T4 builds the choice and the wardrobe). */
  character: string;
  /** Levels made in the workshops on this device, in the order they were pinned (curriculum/workshop.ts). T3b. */
  made: readonly MadeLevel[];
  /** How many times each corkboard level was played to a win on this device, by card id. */
  plays: Readonly<Record<string, number>>;
  /** The level being made in each workshop (by sheet number), kept between the editor and its test page. */
  drafts: Readonly<Record<string, Draft>>;
  /** Things done on a sheet that are not levels: the comodín's choices played (`1ro-h16-recuperar`, …). */
  goals: Readonly<Record<string, true>>;
}

export const EMPTY: Progress = Object.freeze({
  v: 1, solved: Object.freeze({}), gold: Object.freeze({}), seeds: 0, opened: 1, character: 'brote',
  made: Object.freeze([]) as readonly MadeLevel[], plays: Object.freeze({}), drafts: Object.freeze({}), goals: Object.freeze({}),
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
export const chooseCharacter = (p: Progress, id: string): Progress => ({ ...p, character: id });
const clampSheet = (n: number) => Math.min(LAST_SHEET, Math.max(1, Math.round(n) || 1));

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
    return {
      v: 1,
      solved,
      // stored before gold stamps existed: none yet
      gold: ids(o.gold),
      seeds: Number.isFinite(o.seeds) ? Math.max(0, Math.round(o.seeds!)) : Object.keys(solved).length,
      opened: clampSheet(Number(o.opened)),
      character: typeof o.character === 'string' ? o.character : 'brote',
      // stored before the workshops existed: nothing made, played or reached yet; a broken entry is left out
      made: made.filter((m, i) => made.findIndex((x) => x.id === m.id) === i),
      plays: record(o.plays, count),
      drafts: record(o.drafts, isDraft),
      goals: ids(o.goals),
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
  /** The comodín: its choices played (goal names: `recuperar`, `musica`, `companeros`). */
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
  const goals = s.hub ? Object.keys(p.goals).filter((k) => k.startsWith(own)).map((k) => k.slice(own.length)) : [];
  return {
    coreSolved,
    coreTotal: core.length,
    essentialSolved: core.filter((c) => c.essential && c.done).length,
    essentialTotal: core.filter((c) => c.essential).length,
    complete: hasCore(s) ? coreSolved === core.length : s.workshop ? published > 0 && playedOthers : goals.length > 0,
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
}

export function createProgressStore(backing: Backing | null): ProgressStore {
  let current = EMPTY;
  try { current = parse(backing?.getItem(STORAGE_KEY)); } catch { current = EMPTY; }
  const subs = new Set<() => void>();
  const save = () => {
    try { backing?.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* storage full or blocked: keep playing in memory */ }
  };
  const set = (next: Progress) => {
    if (next === current) return;
    current = next;
    save();
    subs.forEach((f) => f());
  };
  return {
    get: () => current,
    update(fn) { set(fn(current)); return current; },
    reset() {
      try { backing?.removeItem(STORAGE_KEY); } catch { /* nothing stored, nothing to forget */ }
      current = EMPTY;
      subs.forEach((f) => f());
    },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}

/** localStorage, or null where touching it throws (privacy modes, blocked site data). */
function browserStorage(): Backing | null {
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
