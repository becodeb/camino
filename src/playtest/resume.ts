// Closing the tab (or reloading it) does not lose the child's session. The
// classroom's tab may reload (a stray F5, a Chromebook discarding a
// background tab, the adult reloading an app that looked stuck) or get
// closed outright (T29: a child or an adult closes it by mistake, a
// Chromebook kills it instead of merely discarding it, the bookmark is
// tapped again later), often while the internet is down (the service
// worker, serviceWorker.ts, still opens the app then). Without this the
// adult would have to set the session up again and the same child would
// show up in the data as a second child with a new code.
//
// So this device keeps, in localStorage (T29: not sessionStorage — it must
// survive the tab closing, not just a reload of the same tab), the flow of
// the session being played, the playtest's progress (seeds, character,
// outfit) and a few steps' own state (`parts`: the ladder's items so far,
// free play's clock). Reopening the app (a reload, or the bookmark again)
// opens on the step it was on, from that step's start (the ladder and free
// play carry on where they were), and logs `resume`. The event queue itself
// was never lost either: it already lives in localStorage (telemetry.ts).
//
// A resume needs the queue's current session to be the one saved, a step
// past the adult's setup (and never the class-end/rest screen: pickResume
// below), and a save younger than RESUME_MAX_AGE_MS (the tab left closed
// overnight starts fresh). Being in localStorage, this is now shared by
// every tab of this device rather than private to one: two tabs open on the
// same device at once would overwrite each other's saved step (the last
// write wins) — a real risk only if someone deliberately opens the kiosk
// bookmark twice, not the ordinary one-tab-per-device classroom use this is
// built for; left as a known limitation (see the feature document).

import { STEPS, type FlowState } from './flow';

export const RESUME_KEY = 'camino.piloto.resume.v1';
export const RESUME_MAX_AGE_MS = 2 * 60 * 60_000;

export interface SavedSession {
  v: 1;
  /** The session (telemetry's current one). */
  sid: string;
  /** Last saved. */
  at: number;
  flow: FlowState;
  /** The playtest's progress as its store wrote it (progressScope.ts). */
  progress: string | null;
  /** The current step's own state, by name; emptied when the step changes. */
  parts: Record<string, unknown>;
}

type Backing = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** What to resume, from the stored text, for the queue's current session (pure). */
export function pickResume(raw: string | null, sessionId: string | null | undefined, now: number): SavedSession | null {
  if (!raw || !sessionId) return null;
  let o: SavedSession;
  try { o = JSON.parse(raw) as SavedSession; } catch { return null; }
  if (!o || o.v !== 1 || o.sid !== sessionId || typeof o.at !== 'number') return null;
  if (now - o.at < 0 || now - o.at > RESUME_MAX_AGE_MS) return null;
  const f = o.flow;
  // T28: the class-end/rest screen is never resumed into — a reload or a reopened
  // bookmark there always starts fresh, the same as the setup (and a session that
  // reached it is always ended, so this also keeps an ended session from resuming)
  if (!f || !STEPS.includes(f.step) || f.step === 'setup' || f.step === 'class_end' || !Array.isArray(f.visits) || !f.visits.length || !Array.isArray(f.activities)) return null;
  return {
    v: 1,
    sid: o.sid,
    at: o.at,
    flow: {
      step: f.step, visits: f.visits, activities: f.activities, endedEarly: !!f.endedEarly,
      ...(f.routeDone ? { routeDone: true } : {}), ...(f.surveyDone ? { surveyDone: true } : {}), ...(f.wrapUp ? { wrapUp: true } : {}),
      // T39: 4to's own route and its Arcade (T43: 1ro's own route)
      ...(f.route === '4to' || f.route === '1ro' ? { route: f.route as '4to' | '1ro' } : {}), ...(f.arcadeOpen ? { arcadeOpen: true } : {}),
    },
    progress: typeof o.progress === 'string' ? o.progress : null,
    parts: o.parts && typeof o.parts === 'object' ? o.parts : {},
  };
}

/** T29: localStorage (not sessionStorage), so a closed tab still resumes; try/catch, like every storage access here (a private window, or storage blocked or full, falls back to "no resume": a reopened tab just starts fresh). */
function deviceStorage(): Backing | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    localStorage.getItem(RESUME_KEY);
    return localStorage;
  } catch {
    return null;
  }
}

let storage: Backing | null | undefined;
const store = () => (storage === undefined ? (storage = deviceStorage()) : storage);
let saved: SavedSession | null = null;
/** The resumed step's parts (only until the step changes). */
let resumed: Record<string, unknown> = {};

function write() {
  try {
    if (saved) store()?.setItem(RESUME_KEY, JSON.stringify(saved));
    else store()?.removeItem(RESUME_KEY);
  } catch { /* storage full or blocked: a reload starts over */ }
}

/** Called once as the playtest opens: the saved session to carry on, or null (and the saved one is forgotten). */
export function takeResume(sessionId: string | null | undefined, now = Date.now()): SavedSession | null {
  let raw: string | null = null;
  try { raw = store()?.getItem(RESUME_KEY) ?? null; } catch { raw = null; }
  const s = pickResume(raw, sessionId, now);
  saved = s;
  resumed = s ? { ...s.parts } : {};
  if (!s) write();
  return s;
}

/** The flow moved (or a session started); the adult's setup forgets the saved session. */
export function rememberFlow(sessionId: string | null | undefined, flow: FlowState, now = Date.now()): void {
  if (!sessionId || flow.step === 'setup') {
    saved = null;
    resumed = {};
    write();
    return;
  }
  const same = saved?.sid === sessionId;
  const sameStep = same && saved!.flow.step === flow.step && saved!.flow.visits.length === flow.visits.length;
  if (!sameStep) resumed = {};
  saved = { v: 1, sid: sessionId, at: now, flow, progress: same ? saved!.progress : null, parts: sameStep ? saved!.parts : {} };
  write();
}

/** The playtest's progress was written (null: forgotten). */
export function rememberProgress(json: string | null, now = Date.now()): void {
  if (!saved) return;
  saved = { ...saved, at: now, progress: json };
  write();
}

/** A step keeps some of its own state for a reload. */
export function rememberPart(name: string, value: unknown, now = Date.now()): void {
  if (!saved) return;
  saved = { ...saved, at: now, parts: { ...saved.parts, [name]: value } };
  write();
}

/** What the step on screen kept before the reload (undefined when it was not resumed). */
export function resumedPart<T>(name: string): T | undefined {
  return resumed[name] as T | undefined;
}

/** Tests: forget the page's state and use this storage. */
export function resetResumeForTests(backing: Backing | null): void {
  storage = backing;
  saved = null;
  resumed = {};
}
