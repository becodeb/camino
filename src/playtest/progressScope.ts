// The playtest's own progress: the app's progress store (curriculum/
// progress.ts) moved onto a memory storage under its own key while the
// playtest is on screen, so the demo's `camino.progress.v1` is never read or
// written. Every write is also handed to resume.ts, so a reload of the tab
// carries on with the same seeds, character and outfit.

import { browserStorage, progress, STORAGE_KEY, type Backing } from '../curriculum/progress';
import { rememberProgress } from './resume';

export const PILOT_PROGRESS_KEY = 'camino.piloto.progress';

const memory = new Map<string, string>();
const memoryBacking: Backing = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => { memory.set(k, v); rememberProgress(v); },
  removeItem: (k) => { memory.delete(k); rememberProgress(null); },
};

/** Moves the store onto the playtest's memory, holding `saved` (a resumed session's progress) or nothing. */
export function enterPlaytestProgress(saved: string | null = null) {
  memory.clear();
  if (saved) memory.set(PILOT_PROGRESS_KEY, saved);
  progress.swap(memoryBacking, PILOT_PROGRESS_KEY);
}

/** Back to the demo's progress (the playtest left the screen, e.g. #/1ro in a dev build). */
export function leavePlaytestProgress() {
  progress.swap(browserStorage(), STORAGE_KEY);
}
