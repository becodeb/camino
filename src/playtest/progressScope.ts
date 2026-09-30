// The playtest's own progress: the app's progress store (curriculum/
// progress.ts) moved onto a memory storage under its own key while the
// playtest is on screen, so the demo's `camino.progress.v1` is never read or
// written, and nothing of a child's session survives it (a reload starts
// over; only the event queue persists).

import { browserStorage, progress, STORAGE_KEY, type Backing } from '../curriculum/progress';

export const PILOT_PROGRESS_KEY = 'camino.piloto.progress';

const memory = new Map<string, string>();
const memoryBacking: Backing = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => { memory.set(k, v); },
  removeItem: (k) => { memory.delete(k); },
};

export function enterPlaytestProgress() {
  progress.swap(memoryBacking, PILOT_PROGRESS_KEY);
}

/** Back to the demo's progress (the playtest left the screen, e.g. #/1ro in a dev build). */
export function leavePlaytestProgress() {
  progress.swap(browserStorage(), STORAGE_KEY);
}
