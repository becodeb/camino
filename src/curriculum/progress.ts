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
import { DOORS, bossId, coreId, extraPrefix, type Door, type Sheet } from './model';

export const STORAGE_KEY = 'camino.progress.v1';
export const LAST_SHEET = 17;

export interface Progress {
  v: 1;
  /** Solved level ids (see curriculum/model: coreId, extraId, bossId). */
  solved: Readonly<Record<string, true>>;
  /** One per first solve of a level, plus what the dev drawer grants. */
  seeds: number;
  /** The sheet the teacher opened for the class: later sheets wait (faded on the map). */
  opened: number;
  /** The child's character (T4 builds the choice and the wardrobe). */
  character: string;
}

export const EMPTY: Progress = Object.freeze({ v: 1, solved: Object.freeze({}), seeds: 0, opened: 1, character: 'brote' });

// ------------------------------------------------------------------ pure transitions

/** Marks a level solved; the first time it also earns a seed. */
export function solve(p: Progress, id: string): Progress {
  if (p.solved[id]) return p;
  return { ...p, solved: { ...p.solved, [id]: true }, seeds: p.seeds + 1 };
}

export const grant = (p: Progress, n: number): Progress => ({ ...p, seeds: Math.max(0, p.seeds + Math.round(n)) });
export const openSheet = (p: Progress, n: number): Progress => ({ ...p, opened: clampSheet(n) });
export const chooseCharacter = (p: Progress, id: string): Progress => ({ ...p, character: id });
const clampSheet = (n: number) => Math.min(LAST_SHEET, Math.max(1, Math.round(n) || 1));

/** Reads a stored value. Anything unknown, old or broken becomes a fresh start (never a crash). */
export function parse(raw: string | null | undefined): Progress {
  if (!raw) return EMPTY;
  try {
    const o = JSON.parse(raw) as Partial<Progress> | null;
    if (!o || o.v !== 1) return EMPTY;
    const solved: Record<string, true> = {};
    if (o.solved && typeof o.solved === 'object') for (const k of Object.keys(o.solved)) solved[k] = true;
    return {
      v: 1,
      solved,
      seeds: Number.isFinite(o.seeds) ? Math.max(0, Math.round(o.seeds!)) : Object.keys(solved).length,
      opened: clampSheet(Number(o.opened)),
      character: typeof o.character === 'string' ? o.character : 'brote',
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
}

export function sheetState(s: Sheet, p: Progress): SheetState {
  const core = s.core.map((c, i) => ({ essential: !!c.essential, done: !!p.solved[coreId(s, i + 1)] }));
  const extras = {} as Record<Door, number>;
  for (const d of DOORS) {
    const pre = extraPrefix(s, d);
    extras[d] = Object.keys(p.solved).filter((k) => k.startsWith(pre)).length;
  }
  const coreSolved = core.filter((c) => c.done).length;
  return {
    coreSolved,
    coreTotal: core.length,
    essentialSolved: core.filter((c) => c.essential && c.done).length,
    essentialTotal: core.filter((c) => c.essential).length,
    complete: core.length > 0 && coreSolved === core.length,
    bossSolved: !!p.solved[bossId(s)],
    extras,
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
