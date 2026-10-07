// T22 (back-to-back classes): "Comentario del chico anterior" in the adult
// corner menu. By the time an adult wants to comment on the child who just
// left, the device may already be playing the next child's own session (or
// sitting on the setup, waiting), so the previous session's full record is
// long gone from telemetry.ts's own queue (synced and pruned, or never kept
// at all once it ends). This device keeps a tiny, independent record of its
// last ended, really-played, non-demo session — id, when it ended, grade,
// character and last known step (for the comment's own `step`), and
// whatever this exact feature already saved for it (so reopening the panel
// is prefilled) — in its own localStorage key, never touched by
// telemetry.ts's queue or pruning.
//
// The comment itself goes to a small dedicated endpoint
// (POST /api/adult-form/:id, see runtime.ts's `postPreviousAdultForm`), not
// the normal /api/sync path: reconstructing a full, idempotent session
// record for a session this device no longer tracks would be more code than
// one small endpoint that only needs the id and the form. `submit` below
// retries once by itself (the network came back, a page reload) rather than
// losing a comment typed while the wifi was down; it is not the full
// offline queue telemetry.ts has (one pending comment is not a stream of
// events), which is the trade-off of not reusing the sync path.
//
// Shown only for a session that really had a child (not an empty
// between-classes gap: see PlaytestScreen.tsx's own check before caching;
// not a demo session) and that ended within PREVIOUS_MAX_AGE_MS.

export type AdultFormValue = {
  engagement: 'low' | 'mid' | 'high' | null;
  help_needed: 'none' | 'some' | 'a_lot' | null;
  comment?: string;
};

export interface PreviousChild {
  id: string;
  ended_at: string;
  grade: number;
  character?: string;
  current_step: string | null;
  /** Prefills the panel if this exact feature already saved one; never read from the server. */
  adult_form?: AdultFormValue | null;
}

export const PREVIOUS_KEY = 'camino.piloto.previous.v1';
/** "Recent", per the brief: ended no more than this long ago. */
export const PREVIOUS_MAX_AGE_MS = 3 * 3600_000;

type Backing = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function parse(raw: string | null): PreviousChild | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<PreviousChild> | null;
    if (!o || typeof o.id !== 'string' || typeof o.ended_at !== 'string' || typeof o.grade !== 'number') return null;
    return {
      id: o.id,
      ended_at: o.ended_at,
      grade: o.grade,
      ...(typeof o.character === 'string' ? { character: o.character } : {}),
      current_step: typeof o.current_step === 'string' ? o.current_step : null,
      ...(o.adult_form && typeof o.adult_form === 'object' ? { adult_form: o.adult_form as AdultFormValue } : {}),
    };
  } catch {
    return null;
  }
}

function tabStorage(): Backing | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    localStorage.getItem(PREVIOUS_KEY);
    return localStorage;
  } catch {
    return null;
  }
}

let storage: Backing | null | undefined;
const store = () => (storage === undefined ? (storage = tabStorage()) : storage);

function write(v: PreviousChild | null) {
  try {
    if (v) store()?.setItem(PREVIOUS_KEY, JSON.stringify(v));
    else store()?.removeItem(PREVIOUS_KEY);
  } catch { /* storage full or blocked: the item just never appears */ }
}

function read(): PreviousChild | null {
  try {
    return parse(store()?.getItem(PREVIOUS_KEY) ?? null);
  } catch {
    return null;
  }
}

/** Called once a real session (non-demo, non-empty) ends, whatever the reason. Replaces any earlier record. */
export function savePreviousChild(info: { id: string; ended_at: string; grade: number; character?: string; current_step: string | null }): void {
  write({
    id: info.id,
    ended_at: info.ended_at,
    grade: info.grade,
    ...(info.character ? { character: info.character } : {}),
    current_step: info.current_step,
  });
}

/** The device's previous session, if any and recent enough; null otherwise (nothing to show in the corner menu). */
export function getPreviousChild(now = Date.now(), maxAgeMs = PREVIOUS_MAX_AGE_MS): PreviousChild | null {
  const v = read();
  if (!v) return null;
  const ended = Date.parse(v.ended_at);
  if (Number.isNaN(ended) || now - ended > maxAgeMs || now < ended) return null;
  return v;
}

/** The panel saved (or tried to save) a comment for this id: keep it locally too, so reopening the panel is prefilled. */
export function rememberPreviousAdultForm(id: string, form: AdultFormValue): void {
  const v = read();
  if (!v || v.id !== id) return;
  write({ ...v, adult_form: form });
}

// ---------------------------------------------------------------- sending (its own tiny retry, not the full queue)

export interface PendingSubmit { id: string; form: AdultFormValue }
const PENDING_KEY = 'camino.piloto.previousForm.pending.v1';

function readPending(): PendingSubmit | null {
  try {
    const raw = store()?.getItem(PENDING_KEY) ?? null;
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<PendingSubmit> | null;
    return o && typeof o.id === 'string' && o.form && typeof o.form === 'object' ? { id: o.id, form: o.form as AdultFormValue } : null;
  } catch {
    return null;
  }
}

function writePending(v: PendingSubmit | null) {
  try {
    if (v) store()?.setItem(PENDING_KEY, JSON.stringify(v));
    else store()?.removeItem(PENDING_KEY);
  } catch { /* no storage: a failed post is simply lost, same as any other kind of save without storage */ }
}

/**
 * Saves the comment locally (so the panel is prefilled next time) and posts
 * it with `post` (runtime.ts's `postPreviousAdultForm`, injected so this
 * stays pure and testable). A failed post is kept as one pending submission
 * and retried by `retryPendingSubmit` (the next app load, the `online`
 * event); a later call with a different id or form replaces the pending one
 * (only the latest comment for the previous child matters).
 */
export async function submitPreviousAdultForm(id: string, form: AdultFormValue, post: (id: string, form: AdultFormValue) => Promise<boolean>): Promise<boolean> {
  rememberPreviousAdultForm(id, form);
  const ok = await post(id, form).catch(() => false);
  writePending(ok ? null : { id, form });
  return ok;
}

/** The app's start, and every `online` event: a comment that failed to post earlier, retried once. */
export async function retryPendingSubmit(post: (id: string, form: AdultFormValue) => Promise<boolean>): Promise<void> {
  const p = readPending();
  if (!p) return;
  const ok = await post(p.id, p.form).catch(() => false);
  if (ok) writePending(null);
}

/** Tests: forget the module's state and use this storage. */
export function resetPreviousChildForTests(backing: Backing | null): void {
  storage = backing;
  writePending(null);
}
