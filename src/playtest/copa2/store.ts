// Copa v2 (C10): where the journey lives. One `Journey` (journey.ts) per
// session, in localStorage under the session id (so a reload, a closed tab and
// a trip to the Arcade and back all keep the child's programs, medals and
// place) plus an in-memory copy (a same-tab remount never reads a stale copy).
// Every access is try/catch, like the rest of the app (resume.ts): a private
// window or full storage just loses the memory across a reload.
//
// The ladder's ceiling rung (the placement's input) is kept the same way: Ladder.tsx
// notes it when the ladder ends, CopaStep reads it when the Copa opens.

import { parseJourney, type Journey } from './journey';

const KEY = 'camino.piloto.copa2.v1';
const CEILING_KEY = 'camino.piloto.copa2.ceiling.v1';

interface Stored<T> { sid: string; at: number; value: T }

function read<T>(key: string, sid: string | undefined): T | null {
  if (!sid) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const o = JSON.parse(raw) as Stored<T>;
    return o && o.sid === sid ? o.value : null;
  } catch { return null; }
}

function write<T>(key: string, sid: string | undefined, value: T): void {
  if (!sid) return;
  try { localStorage.setItem(key, JSON.stringify({ sid, at: Date.now(), value } satisfies Stored<T>)); } catch { /* lost on this reload only */ }
}

let memory: { sid: string; journey: Journey } | null = null;
let ceilingMemory: { sid: string; rung: number | null } | null = null;

/** The session's journey, or null when the child has not opened the Copa yet. */
export function loadJourney(sid: string | undefined): Journey | null {
  if (!sid) return null;
  if (memory?.sid === sid) return memory.journey;
  const j = parseJourney(read<unknown>(KEY, sid));
  if (j) memory = { sid, journey: j };
  return j;
}

export function saveJourney(sid: string | undefined, journey: Journey): void {
  if (!sid) return;
  memory = { sid, journey };
  write(KEY, sid, journey);
}

/** A new child starts fresh (PlaytestScreen's `start`/`newSession`). */
export function resetCopaMemory(): void {
  memory = null;
  ceilingMemory = null;
  try { localStorage.removeItem(KEY); localStorage.removeItem(CEILING_KEY); } catch { /* nothing to clear */ }
}

/** The ladder ended with this ceiling (the highest rung passed; null: none). */
export function noteLadderCeiling(sid: string | undefined, rung: number | null): void {
  if (!sid) return;
  ceilingMemory = { sid, rung };
  write(CEILING_KEY, sid, { rung });
}

export function readLadderCeiling(sid: string | undefined): number | null {
  if (!sid) return null;
  if (ceilingMemory?.sid === sid) return ceilingMemory.rung;
  const v = read<{ rung: number | null }>(CEILING_KEY, sid);
  return typeof v?.rung === 'number' ? v.rung : null;
}
