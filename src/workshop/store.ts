// The Workshop's own save (T40): the child's project (every sprite's
// scripts, where it starts, the variables' starting values) and its
// challenge progress, in device storage under the session's id. Unlike the
// resume parts (resume.ts, emptied whenever the flow changes step), this
// outlives a step change: T41's Arcade plays the same project as "Tu juego"
// from another step, and the Workshop opens where it was after a reload or
// a closed tab. A new session never sees another session's game (the id is
// checked); the save is replaced by the next session's first save.

import type { Project } from './model';
import type { WsProgress } from './progress';

export const WORKSHOP_KEY = 'camino.piloto.workshop.v1';

export interface WorkshopSaved { v: 1; sid: string; at: number; project: Project; progress: WsProgress }

type Backing = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
let backing: Backing | null | undefined;
function store(): Backing | null {
  if (backing !== undefined) return backing;
  try { backing = typeof localStorage !== 'undefined' ? localStorage : null; backing?.getItem(WORKSHOP_KEY); } catch { backing = null; }
  return backing;
}

const looksLike = (o: unknown): o is WorkshopSaved => {
  const s = o as WorkshopSaved;
  return !!s && s.v === 1 && typeof s.sid === 'string' && !!s.project && Array.isArray(s.project.sprites) && !!s.progress && typeof s.progress.current === 'number';
};

/** The saved Workshop of this session, or null (none, another session's, or unreadable). */
export function loadWorkshop(sid: string | null | undefined): WorkshopSaved | null {
  if (!sid) return null;
  try {
    const raw = store()?.getItem(WORKSHOP_KEY);
    const o = raw ? JSON.parse(raw) : null;
    return looksLike(o) && o.sid === sid ? o : null;
  } catch {
    return null;
  }
}

export function saveWorkshop(s: Omit<WorkshopSaved, 'v' | 'at'>, now = Date.now()): void {
  try { store()?.setItem(WORKSHOP_KEY, JSON.stringify({ v: 1, at: now, ...s })); } catch { /* full or blocked: a reload starts the Workshop over */ }
}

/** "Tu juego"'s best score (the Arcade, T41): kept with the project. */
export function saveBest(sid: string, points: number): number {
  const s = loadWorkshop(sid);
  if (!s) return points;
  if (points > s.progress.best) saveWorkshop({ sid, project: s.project, progress: { ...s.progress, best: points } });
  return Math.max(points, s.progress.best);
}

/** Tests: use this storage. */
export function setWorkshopStorageForTests(b: Backing | null) { backing = b; }
