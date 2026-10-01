// The playtest's telemetry client: every event is written to a local queue
// first (localStorage, or memory when storage is blocked) and a sender posts
// it to POST /api/sync in batches, so a classroom whose internet drops loses
// nothing and the session keeps working fully offline.
//
// - Each session (one child, one sitting) gets a client uuid, an anonymous
//   code ("Zorro 27", for the admin page only: the kid app never shows it
//   since round 2), its grade and division, and the device; never a name.
//   `consent` is null since round 2 (no tick at setup: the school's
//   authorization is kept outside the app).
// - `log(type, payload)` gives the event the session's next `seq` (0, 1, 2…)
//   and the client time, and appends it to the queue.
// - The sender posts the session record with up to `maxPerPost` of its events
//   every `batchMs`, or at once when `batchMax` are waiting; the server's
//   `acked` seqs leave the queue. A network error, a 429 or a 5xx is retried
//   with exponential backoff (capped, with jitter) and never drops anything;
//   only a 400 (the server will never accept that batch) drops it, with a
//   console warning.
// - `flushKeepalive()` (the page is hidden or closing) posts what fits in a
//   keepalive request.
// - Sessions left in the queue by earlier page loads sync too; a session
//   that was never ended is closed as 'abandoned' when the next one starts.
//
// Pure of the browser: storage, the network, time, randomness and timers are
// injected (see `browserTelemetry` in ./runtime.ts), so the tests drive it.

import { makeCode } from './codes';

export const QUEUE_KEY = 'camino.piloto.queue.v1';
export const CODES_KEY = 'camino.piloto.codes.v1';

export type Backing = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface Device {
  ua: string;
  /** Screen size in CSS pixels. */
  w: number;
  h: number;
  /** The viewport (the browser window) in CSS pixels. */
  vw: number;
  vh: number;
  dpr: number;
  touch: boolean;
  lang: string;
  /** On-screen text (captions.ts): its state now, and how it was set at the start (by the grade, or the setup). */
  captions?: boolean;
  captions_set?: 'grade' | 'setup';
}

/** The `sessions` row, as POST /api/sync takes it (docs/prueba-piloto-datos.md). */
export interface SessionRecord {
  id: string;
  code: string;
  grade: number;
  division: string | null;
  /** Null since round 2 (no tick); earlier sessions: true. */
  consent: boolean | null;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
  app_version: string | null;
  device: Device;
  survey: Record<string, unknown> | null;
  adult_form: Record<string, unknown> | null;
  current_step: string | null;
}

export type SessionPatch = Partial<Pick<SessionRecord, 'ended_at' | 'end_reason' | 'survey' | 'adult_form' | 'current_step' | 'device'>>;

export interface QueuedEvent {
  seq: number;
  client_t: string;
  type: string;
  payload: Record<string, unknown>;
}

interface Entry {
  session: SessionRecord;
  nextSeq: number;
  /** Bumped by every session update; `synced` is the last one the server has. */
  rev: number;
  synced: number;
  events: QueuedEvent[];
}

interface QueueState {
  v: 1;
  current: string | null;
  entries: Record<string, Entry>;
}

export interface PostResult {
  status: number;
  body?: unknown;
}

export interface TelemetryDeps {
  storage: Backing | null;
  /** POSTs the JSON body to /api/sync; rejects on a network error. */
  post(body: string, opts: { keepalive: boolean }): Promise<PostResult>;
  now(): number;
  random(): number;
  uuid(): string;
  device(): Device;
  appVersion: string | null;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  warn(...args: unknown[]): void;
}

export interface TelemetryOptions {
  batchMs: number;
  batchMax: number;
  maxPerPost: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  /** Browsers cap a keepalive request's body at 64 KB. */
  keepaliveBytes: number;
}

export const DEFAULTS: TelemetryOptions = {
  batchMs: 5_000,
  batchMax: 25,
  maxPerPost: 100,
  backoffBaseMs: 1_000,
  backoffMaxMs: 60_000,
  keepaliveBytes: 60_000,
};

export interface SyncStatus {
  /** Events still waiting to reach the server (every session in the queue). */
  pending: number;
  /** Sessions whose record changed since the last sync. */
  dirty: number;
  /** Consecutive failed posts (0: the last one went through). */
  failures: number;
  lastOkAt: number | null;
  lastError: string | null;
}

export interface StartInput {
  grade: number;
  division: string | null;
  /** On-screen text at the start, and whether the grade or the setup decided it. */
  captions?: boolean;
  captionsSet?: 'grade' | 'setup';
}

const EMPTY_STATE = (): QueueState => ({ v: 1, current: null, entries: {} });

function parseState(raw: string | null | undefined): QueueState {
  if (!raw) return EMPTY_STATE();
  try {
    const o = JSON.parse(raw) as QueueState;
    if (!o || o.v !== 1 || typeof o.entries !== 'object' || !o.entries) return EMPTY_STATE();
    const entries: Record<string, Entry> = {};
    for (const [id, e] of Object.entries(o.entries)) {
      if (!e || typeof e !== 'object' || !e.session || e.session.id !== id || !Array.isArray(e.events)) continue;
      entries[id] = {
        session: e.session,
        nextSeq: Number.isInteger(e.nextSeq) ? e.nextSeq : e.events.reduce((m, x) => Math.max(m, x.seq + 1), 0),
        rev: Number(e.rev) || 0,
        synced: Number(e.synced) || 0,
        events: e.events.filter((x) => x && Number.isInteger(x.seq) && typeof x.type === 'string'),
      };
    }
    return { v: 1, current: typeof o.current === 'string' && entries[o.current] ? o.current : null, entries };
  } catch {
    return EMPTY_STATE();
  }
}

const needsSync = (e: Entry) => e.events.length > 0 || e.rev > e.synced;

export class Telemetry {
  private state: QueueState;
  private timer: unknown = null;
  private inflight = false;
  private failures = 0;
  private lastOkAt: number | null = null;
  private lastError: string | null = null;
  private perPost: number;
  private subs = new Set<() => void>();
  private readonly o: TelemetryOptions;

  constructor(private readonly deps: TelemetryDeps, opts: Partial<TelemetryOptions> = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.perPost = this.o.maxPerPost;
    let raw: string | null = null;
    try { raw = deps.storage?.getItem(QUEUE_KEY) ?? null; } catch { raw = null; }
    this.state = parseState(raw);
    // what earlier page loads left behind goes out soon
    if (Object.values(this.state.entries).some(needsSync)) this.arm(this.o.batchMs);
  }

  // ---------------------------------------------------------------- sessions and events

  /** The session being played, if any. */
  get session(): SessionRecord | null {
    const id = this.state.current;
    return id ? this.state.entries[id]?.session ?? null : null;
  }

  startSession(input: StartInput): SessionRecord {
    const now = this.deps.now();
    const prev = this.state.current ? this.state.entries[this.state.current] : null;
    if (prev && !prev.session.ended_at) {
      const lastT = prev.events.length ? Date.parse(prev.events[prev.events.length - 1].client_t) : now;
      this.patch(prev, { ended_at: new Date(Math.min(lastT, now)).toISOString(), end_reason: 'abandoned' });
    }
    const code = makeCode(() => this.deps.random(), this.recentCodes());
    this.rememberCode(code);
    const session: SessionRecord = {
      id: this.deps.uuid(),
      code,
      grade: input.grade,
      division: input.division,
      consent: null,
      started_at: new Date(now).toISOString(),
      ended_at: null,
      end_reason: null,
      app_version: this.deps.appVersion,
      device: { ...this.deps.device(), ...(input.captions != null ? { captions: input.captions, captions_set: input.captionsSet ?? 'grade' } : {}) },
      survey: null,
      adult_form: null,
      current_step: null,
    };
    this.state.entries[session.id] = { session, nextSeq: 0, rev: 1, synced: 0, events: [] };
    this.state.current = session.id;
    this.prune();
    this.save();
    this.arm(this.o.batchMs);
    this.notify();
    return session;
  }

  /** Records one event of the current session; returns its seq (null with no session). */
  log(type: string, payload: Record<string, unknown> = {}): number | null {
    const e = this.state.current ? this.state.entries[this.state.current] : null;
    if (!e) return null;
    const seq = e.nextSeq++;
    e.events.push({ seq, client_t: new Date(this.deps.now()).toISOString(), type, payload });
    this.save();
    if (e.events.length >= this.o.batchMax && this.failures === 0 && !this.inflight) {
      this.disarm();
      void this.flush();
    } else {
      this.arm(this.o.batchMs);
    }
    this.notify();
    return seq;
  }

  /** Changes the current session's record (step, end, survey, adult form); synced like events. */
  updateSession(patch: SessionPatch): void {
    const e = this.state.current ? this.state.entries[this.state.current] : null;
    if (!e) return;
    this.patch(e, patch);
    this.save();
    this.arm(this.o.batchMs);
    this.notify();
  }

  private patch(e: Entry, patch: SessionPatch) {
    e.session = { ...e.session, ...patch };
    e.rev++;
  }

  // ---------------------------------------------------------------- status

  status(): SyncStatus {
    const entries = Object.values(this.state.entries);
    return {
      pending: entries.reduce((n, e) => n + e.events.length, 0),
      dirty: entries.filter((e) => e.rev > e.synced).length,
      failures: this.failures,
      lastOkAt: this.lastOkAt,
      lastError: this.lastError,
    };
  }

  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    return () => { this.subs.delete(fn); };
  }

  private notify() { this.subs.forEach((f) => f()); }

  // ---------------------------------------------------------------- sending

  /** Sends now, whatever the batch timer says (the network came back, a test). Resolves when the queue is empty or a post failed. */
  async flush(): Promise<void> {
    if (this.inflight) return;
    this.disarm();
    for (;;) {
      const e = this.nextToSync();
      if (!e) return;
      const ok = await this.sendOne(e, false);
      if (!ok) {
        // a batch timer armed by a log during the post would retry too early
        this.disarm();
        this.arm(this.backoffDelay());
        return;
      }
    }
  }

  /** The page is going away: post what fits in one keepalive request per session (no waiting for the answer). */
  flushKeepalive(): void {
    this.save();
    for (const e of Object.values(this.state.entries)) {
      if (needsSync(e)) void this.sendOne(e, true);
    }
  }

  /** The network is back: forget the backoff and send. */
  online(): void {
    this.failures = 0;
    void this.flush();
  }

  private nextToSync(): Entry | null {
    const entries = Object.values(this.state.entries).filter(needsSync);
    // earlier sessions first: they have waited longest
    entries.sort((a, b) => Date.parse(a.session.started_at) - Date.parse(b.session.started_at));
    return entries[0] ?? null;
  }

  private bodyFor(e: Entry, keepalive: boolean): { body: string; seqs: number[] } {
    let events = e.events.slice(0, this.perPost);
    let body = JSON.stringify({ session: e.session, events });
    if (keepalive) {
      while (events.length > 0 && body.length > this.o.keepaliveBytes) {
        events = events.slice(0, Math.floor(events.length / 2));
        body = JSON.stringify({ session: e.session, events });
      }
    }
    return { body, seqs: events.map((x) => x.seq) };
  }

  /** One post of one session; true when the server took it (or refused it for good). */
  private async sendOne(e: Entry, keepalive: boolean): Promise<boolean> {
    const { body, seqs } = this.bodyFor(e, keepalive);
    const rev = e.rev;
    if (!keepalive) this.inflight = true;
    try {
      const res = await this.deps.post(body, { keepalive });
      if (res.status >= 200 && res.status < 300) {
        const acked = Array.isArray((res.body as { acked?: unknown })?.acked)
          ? ((res.body as { acked: unknown[] }).acked.filter((n) => Number.isInteger(n)) as number[])
          : seqs;
        this.remove(e, acked, rev);
        this.failures = 0;
        this.perPost = this.o.maxPerPost;
        this.lastOkAt = this.deps.now();
        this.lastError = null;
        return true;
      }
      if (res.status === 413 && seqs.length > 1) {
        // too big for the server: smaller posts, right away
        this.perPost = Math.max(1, Math.floor(seqs.length / 2));
        return true;
      }
      if (res.status === 400 || res.status === 413) {
        this.deps.warn(`[piloto] sync refused (${res.status}); dropping ${seqs.length} event(s) of session ${e.session.id}`, res.body);
        this.remove(e, seqs, rev);
        this.lastError = `HTTP ${res.status}`;
        return true;
      }
      this.failed(`HTTP ${res.status}`, keepalive);
      return false;
    } catch (err) {
      this.failed(err instanceof Error ? err.message : String(err), keepalive);
      return false;
    } finally {
      if (!keepalive) this.inflight = false;
      this.notify();
    }
  }

  private failed(msg: string, keepalive: boolean) {
    this.lastError = msg;
    if (!keepalive) this.failures++;
  }

  private remove(e: Entry, seqs: number[], rev: number) {
    const gone = new Set(seqs);
    e.events = e.events.filter((x) => !gone.has(x.seq));
    e.synced = Math.max(e.synced, rev);
    this.prune();
    this.save();
  }

  /** Exponential, capped, with jitter (half to all of the step). */
  backoffDelay(failures = this.failures): number {
    const step = Math.min(this.o.backoffMaxMs, this.o.backoffBaseMs * 2 ** Math.max(0, failures - 1));
    return Math.round(step * (0.5 + 0.5 * this.deps.random()));
  }

  private arm(ms: number) {
    if (this.timer != null) return;
    this.timer = this.deps.setTimer(() => { this.timer = null; void this.flush(); }, ms);
  }

  private disarm() {
    if (this.timer == null) return;
    this.deps.clearTimer(this.timer);
    this.timer = null;
  }

  // ---------------------------------------------------------------- storage

  /** Synced sessions leave the queue (the current one stays: it keeps its seq counter). */
  private prune() {
    for (const [id, e] of Object.entries(this.state.entries)) {
      if (id !== this.state.current && !needsSync(e)) delete this.state.entries[id];
    }
  }

  private save() {
    try { this.deps.storage?.setItem(QUEUE_KEY, JSON.stringify(this.state)); } catch { /* storage full or blocked: the queue lives in memory */ }
  }

  private recentCodes(): string[] {
    try {
      const raw = this.deps.storage?.getItem(CODES_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  private rememberCode(code: string) {
    try { this.deps.storage?.setItem(CODES_KEY, JSON.stringify([code, ...this.recentCodes()].slice(0, 60))); } catch { /* no storage: codes may repeat, the uuid still tells sessions apart */ }
  }
}
