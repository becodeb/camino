import { describe, expect, it, vi } from 'vitest';
import { ANIMALS, CODE_RE, makeCode } from './codes';
import { QUEUE_KEY, Telemetry, type Backing, type PostResult, type TelemetryDeps } from './telemetry';
import { createErrorLimiter, createIdleTracker, sourceFile } from './watch';

function fakeStorage(broken = false): Backing & { data: Map<string, string> } {
  const data = new Map<string, string>();
  const guard = () => { if (broken) throw new Error('SecurityError'); };
  return {
    data,
    getItem: (k) => { guard(); return data.get(k) ?? null; },
    setItem: (k, v) => { guard(); data.set(k, v); },
    removeItem: (k) => { guard(); data.delete(k); },
  };
}

interface Posted { body: { session: { id: string; current_step: string | null; end_reason: string | null }; events: { seq: number; type: string }[] }; keepalive: boolean }

/** A fake world: storage, a scriptable server, a manual clock and timers. */
function world(opts: { storage?: Backing & { data: Map<string, string> }; random?: () => number } = {}) {
  const storage = opts.storage ?? fakeStorage();
  const posts: Posted[] = [];
  let t = Date.parse('2026-09-30T12:00:00Z');
  const timers: { fn: () => void; at: number; id: number }[] = [];
  let timerId = 0;
  /** What the server does next: 'ok' (acks everything), a status, or 'down' (network error). */
  const script: (number | 'ok' | 'down')[] = [];
  const warn = vi.fn();
  const deps: TelemetryDeps = {
    storage,
    async post(body, o) {
      const parsed = JSON.parse(body) as Posted['body'];
      posts.push({ body: parsed, keepalive: o.keepalive });
      const next = script.shift() ?? 'ok';
      if (next === 'down') throw new TypeError('Failed to fetch');
      if (next === 'ok') return { status: 200, body: { ok: true, acked: parsed.events.map((e) => e.seq) } } satisfies PostResult;
      return { status: next, body: { error: 'x' } };
    },
    now: () => t,
    random: opts.random ?? (() => 0.5),
    uuid: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
    device: () => ({ ua: 'test', w: 1366, h: 768, vw: 1366, vh: 700, dpr: 1, touch: false, lang: 'es-AR' }),
    appVersion: '0.1.0',
    setTimer: (fn, ms) => { const id = ++timerId; timers.push({ fn, at: t + ms, id }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((x) => x.id === h); if (i >= 0) timers.splice(i, 1); },
    warn,
  };
  /** Moves the clock, firing due timers (and letting their posts settle). */
  const advance = async (ms: number) => {
    const end = t + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const due = timers[0];
      if (!due || due.at > end) break;
      timers.shift();
      t = due.at;
      due.fn();
      await settle();
    }
    t = end;
  };
  const nextTimerIn = () => (timers.length ? Math.min(...timers.map((x) => x.at)) - t : null);
  return { storage, posts, script, deps, advance, warn, nextTimerIn, now: () => t };
}

let ids = 0;
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

describe('session codes', () => {
  it('are a kid-friendly animal and a number from 10 to 99', () => {
    for (let i = 0; i < 200; i++) {
      const c = makeCode(Math.random);
      expect(c).toMatch(CODE_RE);
      const [animal, n] = c.split(' ');
      expect(ANIMALS).toContain(animal);
      expect(Number(n)).toBeGreaterThanOrEqual(10);
      expect(Number(n)).toBeLessThanOrEqual(99);
    }
  });

  it('avoid a code this device gave out recently', () => {
    const seq = [0, 0, 0, 0.99];
    let i = 0;
    const r = () => seq[i++ % seq.length];
    const first = makeCode(r);
    i = 0;
    expect(makeCode(r, [first])).not.toBe(first);
  });
});

describe('the telemetry queue', () => {
  it('starts a session with a code, the device and no name', () => {
    const w = world();
    const tel = new Telemetry(w.deps);
    const s = tel.startSession({ grade: 2, division: 'B', captions: true, captionsSet: 'setup' });
    expect(s.code).toMatch(CODE_RE);
    expect(s).toMatchObject({ grade: 2, division: 'B', consent: null, app_version: '0.1.0', ended_at: null });
    expect(s.device).toMatchObject({ captions: true, captions_set: 'setup' });
    expect(Object.keys(s).sort()).toEqual(['adult_form', 'app_version', 'code', 'consent', 'current_step', 'device', 'division', 'ended_at', 'end_reason', 'grade', 'id', 'started_at', 'survey'].sort());
  });

  it('numbers events 0, 1, 2… per session, stores them first and removes what the server acked', async () => {
    const w = world();
    const tel = new Telemetry(w.deps);
    tel.startSession({ grade: 1, division: null });
    expect(tel.log('level_start', { level_id: 'a' })).toBe(0);
    expect(tel.log('run', { level_id: 'a' })).toBe(1);
    expect(tel.log('level_end', { level_id: 'a' })).toBe(2);
    // stored before any post
    expect(JSON.parse(w.storage.data.get(QUEUE_KEY)!).entries).toBeDefined();
    expect(tel.status().pending).toBe(3);
    expect(w.posts).toHaveLength(0);
    await w.advance(5_000);
    expect(w.posts).toHaveLength(1);
    expect(w.posts[0].body.events.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(tel.status().pending).toBe(0);
    // a new session starts from seq 0 again
    tel.startSession({ grade: 3, division: null });
    expect(tel.log('step')).toBe(0);
  });

  it('sends at once when 25 events wait', async () => {
    const w = world();
    const tel = new Telemetry(w.deps);
    tel.startSession({ grade: 1, division: null });
    for (let i = 0; i < 25; i++) tel.log('drag', { phase: 'start' });
    await settle();
    expect(w.posts).toHaveLength(1);
    expect(w.posts[0].body.events).toHaveLength(25);
  });

  it('keeps only the events the server acked', async () => {
    const w = world();
    const deps = { ...w.deps, post: async (body: string) => ({ status: 200, body: { acked: (JSON.parse(body).events as { seq: number }[]).slice(0, 1).map((e) => e.seq) } }) };
    const tel = new Telemetry(deps);
    tel.startSession({ grade: 1, division: null });
    tel.log('a'); tel.log('b');
    await tel.flush();
    // one acked per post: the loop keeps sending until the queue is empty
    expect(tel.status().pending).toBe(0);
  });

  it('never drops events offline: backs off exponentially with jitter (capped) and sends everything once back', async () => {
    const w = world();
    const tel = new Telemetry(w.deps);
    tel.startSession({ grade: 4, division: null });
    tel.log('level_start');
    w.script.push('down', 'down', 'down', 'down', 'down', 'down', 'down', 503, 429);
    await w.advance(5_000);
    expect(w.posts).toHaveLength(1);
    expect(tel.status()).toMatchObject({ pending: 1, failures: 1 });
    // random() is 0.5: each wait is 75 % of its step (1 s, 2 s, 4 s … capped at 60 s)
    const waits: number[] = [];
    for (let i = 0; i < 9; i++) {
      tel.log('run');
      const wait = w.nextTimerIn()!;
      waits.push(wait);
      await w.advance(wait);
    }
    expect(waits).toEqual([750, 1500, 3000, 6000, 12000, 24000, 45000, 45000, 45000]);
    // the tenth post went through: nothing lost, no gaps
    expect(tel.status()).toMatchObject({ pending: 0, failures: 0 });
    const seqs = w.posts.at(-1)!.body.events.map((e) => e.seq);
    expect(seqs).toEqual(Array.from({ length: 10 }, (_, i) => i));
    expect(w.warn).not.toHaveBeenCalled();
  });

  it('jitter stays between half and all of the step', () => {
    const lo = new Telemetry(world({ random: () => 0 }).deps);
    const hi = new Telemetry(world({ random: () => 0.999999 }).deps);
    expect(lo.backoffDelay(3)).toBe(2000);
    expect(hi.backoffDelay(3)).toBe(4000);
    expect(hi.backoffDelay(30)).toBe(60000);
  });

  it('drops a batch only on a 400, with a warning', async () => {
    const w = world();
    const tel = new Telemetry(w.deps);
    tel.startSession({ grade: 1, division: null });
    tel.log('bad');
    w.script.push(400);
    await tel.flush();
    expect(tel.status().pending).toBe(0);
    expect(w.warn).toHaveBeenCalledOnce();
    tel.log('good');
    await tel.flush();
    expect(w.posts.at(-1)!.body.events.map((e) => e.seq)).toEqual([1]);
  });

  it('halves the batch on a 413 and goes on', async () => {
    const w = world();
    const tel = new Telemetry(w.deps, { maxPerPost: 8 });
    tel.startSession({ grade: 1, division: null });
    for (let i = 0; i < 8; i++) tel.log('x');
    w.script.push(413);
    await tel.flush();
    expect(w.posts.map((p) => p.body.events.length)).toEqual([8, 4, 4]);
    expect(tel.status().pending).toBe(0);
  });

  it('syncs session changes (step, end, survey) through the same queue', async () => {
    const w = world();
    const tel = new Telemetry(w.deps);
    tel.startSession({ grade: 5, division: null });
    await tel.flush();
    expect(tel.status().dirty).toBe(0);
    tel.updateSession({ current_step: 'survey' });
    expect(tel.status().dirty).toBe(1);
    await tel.flush();
    expect(w.posts.at(-1)!.body).toMatchObject({ session: { current_step: 'survey' }, events: [] });
    expect(tel.status().dirty).toBe(0);
  });

  it('survives a reload: the queue of an earlier page load syncs, and its unfinished session is closed as abandoned', async () => {
    const storage = fakeStorage();
    const a = world({ storage });
    a.script.push('down');
    const tel1 = new Telemetry(a.deps);
    const s1 = tel1.startSession({ grade: 2, division: null });
    tel1.log('level_start'); tel1.log('run');
    await tel1.flush();
    expect(tel1.status().pending).toBe(2);

    // the page reloads (a new client over the same storage)
    const b = world({ storage });
    const tel2 = new Telemetry(b.deps);
    expect(tel2.status().pending).toBe(2);
    tel2.startSession({ grade: 2, division: null });
    await b.advance(5_000);
    const first = b.posts.find((p) => p.body.session.id === s1.id)!;
    expect(first.body.events.map((e) => e.seq)).toEqual([0, 1]);
    expect(first.body.session.end_reason).toBe('abandoned');
    expect(tel2.status().pending).toBe(0);
    // the synced old session leaves the stored queue
    expect(Object.keys(JSON.parse(storage.data.get(QUEUE_KEY)!).entries)).not.toContain(s1.id);
  });

  it('works in memory when storage is blocked', async () => {
    const w = world({ storage: fakeStorage(true) });
    const tel = new Telemetry(w.deps);
    tel.startSession({ grade: 1, division: null });
    expect(tel.log('x')).toBe(0);
    await tel.flush();
    expect(w.posts).toHaveLength(1);
  });

  it('keepalive posts fit in a keepalive request', async () => {
    const w = world();
    const tel = new Telemetry(w.deps, { keepaliveBytes: 2_000 });
    tel.startSession({ grade: 1, division: null });
    for (let i = 0; i < 20; i++) tel.log('x', { pad: 'x'.repeat(200) });
    tel.flushKeepalive();
    await settle();
    const post = w.posts.find((p) => p.keepalive)!;
    expect(JSON.stringify(post.body).length).toBeLessThanOrEqual(2_000);
    expect(post.body.events.length).toBeGreaterThan(0);
    expect(tel.status().pending).toBe(20 - post.body.events.length);
  });
});

describe('automatic events', () => {
  it('idle: one stretch per 30 s without input, reported when input resumes; hidden time does not count', () => {
    const idle = createIdleTracker(0);
    expect(idle.input(10_000)).toBeNull();
    expect(idle.input(45_000)).toBe(35_000);
    expect(idle.input(46_000)).toBeNull();
    expect(idle.pause(80_000)).toBe(34_000);
    expect(idle.input(200_000)).toBeNull();
    idle.resume(300_000);
    expect(idle.input(310_000)).toBeNull();
  });

  it('errors: file name only, deduplicated and capped', () => {
    expect(sourceFile('https://camino-prueba.becode.com.ar/assets/index-abc.js?v=1#x')).toBe('index-abc.js');
    const limit = createErrorLimiter(3, 10_000);
    expect(limit({ message: 'boom', source: 'a.js', line: 1 }, 0)).not.toBeNull();
    expect(limit({ message: 'boom', source: 'a.js', line: 1 }, 5_000)).toBeNull();
    expect(limit({ message: 'boom', source: 'a.js', line: 1 }, 20_000)).not.toBeNull();
    expect(limit({ message: 'x'.repeat(900) }, 0)!.message).toHaveLength(300);
    expect(limit({ message: 'other' }, 0)).toBeNull();
  });
});
