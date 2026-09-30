// API tests against a REAL Postgres (TEST_DATABASE_URL), skipped with a
// clear message when that env var is absent. Run the disposable database
// yourself, e.g.:
//   docker run -d --rm --name camino-prueba-testdb -e POSTGRES_PASSWORD=test -p 54340:5432 postgres:16-alpine
//   TEST_DATABASE_URL=postgres://postgres:test@localhost:54340/postgres npm run test:api
//   docker stop camino-prueba-testdb

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { migrate } from './db.ts';
import { createApp } from './app.ts';
import { csvEscape, toCsv } from './lib/csv.ts';
import { deleteOldSessions } from './retention.ts';
import { createRateLimiter } from './lib/rateLimit.ts';
import { SYNC_RATE_LIMIT, SYNC_RATE_WINDOW_MS } from './routes/sync.ts';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe('csv quoting (no database needed)', () => {
  it('quotes fields with commas, quotes and newlines', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape({ a: 1 })).toBe('"{""a"":1}"');
  });

  it('builds a full CSV with a header row', () => {
    const csv = toCsv([{ a: 'x,y', b: 2 }], ['a', 'b']);
    expect(csv).toBe('a,b\r\n"x,y",2\r\n');
  });
});

describe('sync rate limit (no database needed)', () => {
  it('lets a class of 25 devices behind one NAT sync every 5 s with room to spare', () => {
    const perDevicePerWindow = SYNC_RATE_WINDOW_MS / 5_000;
    expect(SYNC_RATE_LIMIT).toBeGreaterThanOrEqual(25 * perDevicePerWindow * 4);
    const limiter = createRateLimiter(SYNC_RATE_LIMIT, SYNC_RATE_WINDOW_MS);
    // one minute of a class: 25 devices x 12 posts, plus a flush each when the page hides
    for (let i = 0; i < 25 * perDevicePerWindow + 25; i++) expect(limiter.check('10.0.0.1')).toBe(true);
  });

  it('still stops one runaway IP within the window, and not the others', () => {
    const limiter = createRateLimiter(SYNC_RATE_LIMIT, SYNC_RATE_WINDOW_MS);
    for (let i = 0; i < SYNC_RATE_LIMIT; i++) limiter.check('10.0.0.2');
    expect(limiter.check('10.0.0.2')).toBe(false);
    expect(limiter.check('10.0.0.3')).toBe(true);
  });
});

const dbDescribe = TEST_DATABASE_URL ? describe : describe.skip;
if (!TEST_DATABASE_URL) {
  console.warn(
    'skipping API tests against Postgres: TEST_DATABASE_URL is not set. ' +
      'Start a disposable database and re-run, e.g.\n' +
      '  docker run -d --rm --name camino-prueba-testdb -e POSTGRES_PASSWORD=test -p 54340:5432 postgres:16-alpine\n' +
      '  TEST_DATABASE_URL=postgres://postgres:test@localhost:54340/postgres npm run test:api',
  );
}

dbDescribe('API against Postgres', () => {
  let pool: pg.Pool;
  const distDir = '/tmp/camino-prueba-test-dist-does-not-exist';

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(pool);
  }, 30_000);

  afterAll(async () => {
    await pool.end();
  });

  function newSession(overrides: Record<string, unknown> = {}) {
    return {
      id: randomUUID(),
      code: 'Zorro 27',
      grade: 3,
      division: 'B',
      consent: true,
      started_at: new Date().toISOString(),
      app_version: '0.1.0',
      device: { ua: 'test', w: 1366, h: 768, touch: false },
      ...overrides,
    };
  }

  function event(seq: number, overrides: Record<string, unknown> = {}) {
    return {
      seq,
      client_t: new Date().toISOString(),
      type: 'tool_check',
      payload: { ok: true },
      ...overrides,
    };
  }

  it('migrations are idempotent: running them twice applies nothing new', async () => {
    const applied = await migrate(pool);
    expect(applied).toEqual([]);
  });

  it('accepts a sync batch, upserts the session and inserts events', async () => {
    const app = createApp(pool, { distDir });
    const session = newSession();
    const events = [event(0), event(1, { type: 'run', payload: { result: 'win' } })];

    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, events }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, acked: [0, 1] });

    const { rows: sessionRows } = await pool.query('SELECT * FROM sessions WHERE id = $1', [session.id]);
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0].code).toBe('Zorro 27');

    const { rows: eventRows } = await pool.query(
      'SELECT seq, type FROM events WHERE session_id = $1 ORDER BY seq',
      [session.id],
    );
    expect(eventRows).toEqual([
      { seq: 0, type: 'tool_check' },
      { seq: 1, type: 'run' },
    ]);
  });

  it('v_activity_time counts a free-play visit whole (activity_end) and the other activities by their pages', async () => {
    const app = createApp(pool, { distDir });
    const session = newSession();
    const at = (s: number) => new Date(Date.UTC(2026, 8, 30, 10, 0, s)).toISOString();
    const events = [
      // the ladder: one page, 40 s
      event(0, { client_t: at(0), type: 'level_start', payload: { level_id: '1ro-h1-2', activity: 'ladder' } }),
      event(1, { client_t: at(40), type: 'level_end', payload: { level_id: '1ro-h1-2', activity: 'ladder', outcome: 'win' } }),
      // free play: the sheet, picked at 50 s; a page of 30 s inside it; left at 170 s (visit: 120 s)
      event(2, { client_t: at(50), type: 'choice', payload: { activity: 'sheet', visit: 1 } }),
      event(3, { client_t: at(60), type: 'level_start', payload: { level_id: '1ro-h6-1', activity: 'sheet' } }),
      event(4, { client_t: at(90), type: 'level_end', payload: { level_id: '1ro-h6-1', activity: 'sheet', outcome: 'win' } }),
      event(5, { client_t: at(170), type: 'activity_end', payload: { activity: 'sheet', visit: 1, time_ms: 120_000, reason: 'menu' } }),
      // the editor: no level page at all, 45 s
      event(6, { client_t: at(215), type: 'activity_end', payload: { activity: 'editor', visit: 2, time_ms: 45_000, reason: 'menu' } }),
      // the sheet again: 15 s more
      event(7, { client_t: at(240), type: 'activity_end', payload: { activity: 'sheet', visit: 3, time_ms: 15_000, reason: 'budget' } }),
    ];
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, events }),
    });
    expect(res.status).toBe(200);
    const { rows } = await pool.query('SELECT activity, seconds::float AS seconds FROM v_activity_time WHERE session_id = $1 ORDER BY activity', [session.id]);
    expect(rows).toEqual([
      { activity: 'editor', seconds: 45 },
      { activity: 'ladder', seconds: 40 },
      { activity: 'sheet', seconds: 135 },
    ]);
  });

  it('v_typing_by_grade reads the typing keys and the liking answer; v_activity_time counts the typing game whole', async () => {
    const app = createApp(pool, { distDir });
    const post = (session: Record<string, unknown>, events: unknown[]) => app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, events }),
    });
    const key = (seq: number, correct: boolean, latency_ms: number, input = 'physical') =>
      event(seq, { type: 'typing', payload: { key: correct ? 'a' : 'p', expected: 'a', correct, latency_ms, speed_level: 1, input, item: 'a', set: 'vowels', pos: 0 } });
    // 5to (no other test writes grade 5): two sessions
    const a = newSession({ grade: 5 });
    expect((await post(a, [
      key(0, true, 1000), key(1, false, 3000), key(2, true, 2000), key(3, true, 4000, 'touch'),
      event(4, { type: 'typing_end', payload: { reason: 'time', time_ms: 245_000, keys: 4, correct: 3 } }),
      event(5, { type: 'survey_answer', payload: { question: 'typing_liked', answer: 'yes' } }),
      // the final survey's own "liked" is not the game's
      event(6, { type: 'survey_answer', payload: { question: 'liked', answer: 'no' } }),
    ])).status).toBe(200);
    const b = newSession({ grade: 5 });
    expect((await post(b, [
      key(0, false, 500),
      event(1, { type: 'survey_answer', payload: { question: 'typing_liked', answer: 'mid' } }),
    ])).status).toBe(200);

    const { rows } = await pool.query('SELECT * FROM v_typing_by_grade WHERE grade = 5');
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(Number(r.attempts)).toBe(5);
    expect(Number(r.correct_count)).toBe(3);
    expect(Number(r.accuracy_pct)).toBe(60);
    expect(Number(r.median_latency_ms)).toBe(2000);
    expect(Number(r.sessions)).toBe(2);
    expect(Number(r.median_correct_latency_ms)).toBe(2000);
    expect(Number(r.touch_attempts)).toBe(1);
    expect([Number(r.liked_yes), Number(r.liked_mid), Number(r.liked_no)]).toEqual([1, 1, 0]);

    const t = await pool.query("SELECT seconds::float AS seconds FROM v_activity_time WHERE session_id = $1 AND activity = 'typing'", [a.id]);
    expect(t.rows).toEqual([{ seconds: 245 }]);
  });

  it('v_probe_game_maker sums up the game maker probe per session; the by-grade view counts it for RQ 8', async () => {
    const app = createApp(pool, { distDir });
    const post = (session: Record<string, unknown>, events: unknown[]) => app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, events }),
    });
    const ev = (seq: number, type: string, payload: Record<string, unknown>) => event(seq, { type, payload });
    const edit = (seq: number, phase: string, op: string, object: string, hat: string | null, action: string | null, extra: Record<string, unknown> = {}) =>
      ev(seq, 'rule_edit', { probe: 'game_maker', phase, object, hat, action, op, rules: 9, running: false, ...extra });
    const run = (seq: number, phase: string, result: string, keys: number, heard: number, broadcasts: string[], win_points: number | null) =>
      ev(seq, 'game_run', { probe: 'game_maker', phase, result, keys, duration_ms: 20_000, score: 3, lives: 2, rules: 'me[key:left>move:left] game[points:5>win]', rule_count: 9, objects: ['me', 'game'], broadcasts, messages_heard: heard, win_points, lose_lives: true });
    // 4to (no other test writes grade 4): one child goes all the way, one leaves after phase 1
    const a = newSession({ grade: 4 });
    expect((await post(a, [
      ev(0, 'choice', { activity: 'game_maker', visit: 1 }),
      run(1, 'play', 'win', 12, 0, [], 5),
      ev(2, 'probe_phase', { probe: 'game_maker', phase: 'play', completed: true, time_ms: 60_000, runs: 1, edits: 0, help_levels: 0 }),
      edit(3, 'change', 'change', 'seed', 'touch:me', 'score:2', { from: 'score:1', to: 'score:2' }),
      run(4, 'change', 'lose', 8, 0, [], 5),
      ev(5, 'probe_phase', { probe: 'game_maker', phase: 'change', completed: true, time_ms: 70_000, runs: 1, edits: 1, help_levels: 0 }),
      edit(6, 'make', 'add', 'bird', null, null),
      edit(7, 'make', 'add', 'bird', 'recv:yum', null),
      edit(8, 'make', 'add', 'bird', 'recv:yum', 'say:pio'),
      edit(9, 'make', 'add', 'seed', 'touch:me', 'send:yum'),
      edit(10, 'make', 'change', 'game', 'points:10', null, { from: 'points:5', to: 'points:10' }),
      edit(11, 'make', 'remove', 'stone', 'tick', null),
      // the help's ghost hand building a rule is not the child's edit
      edit(12, 'make', 'add', 'me', 'key:up', null, { ghost: true }),
      run(13, 'make', 'stopped', 5, 2, ['yum'], 10),
      ev(14, 'probe_phase', { probe: 'game_maker', phase: 'make', completed: true, time_ms: 200_000, runs: 1, edits: 6, help_levels: 3 }),
      ev(15, 'scratch_predict', { item: 'key', answer: 'right', correct: true, position: 1, time_ms: 4000 }),
      ev(16, 'scratch_predict', { item: 'star', answer: 'life_lost', correct: false, position: 2, time_ms: 6000 }),
      ev(17, 'scratch_predict', { item: 'broadcast', answer: 'bird_says', correct: true, position: 2, time_ms: 5000 }),
      ev(18, 'survey_answer', { question: 'game_maker_liked', answer: 'yes' }),
      ev(19, 'probe_end', { probe: 'game_maker', reason: 'done', time_ms: 420_000 }),
    ])).status).toBe(200);
    const b = newSession({ grade: 4 });
    expect((await post(b, [
      ev(0, 'choice', { activity: 'game_maker', visit: 1 }),
      run(1, 'play', 'stopped', 0, 0, [], 5),
      ev(2, 'probe_end', { probe: 'game_maker', reason: 'left', time_ms: 50_000 }),
    ])).status).toBe(200);

    const { rows } = await pool.query('SELECT * FROM v_probe_game_maker WHERE session_id = $1', [a.id]);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect([Number(r.phases_reached), Number(r.phases_completed), r.play_done, r.change_done, r.make_done]).toEqual([3, 3, true, true, true]);
    expect(Number(r.make_seconds)).toBe(200);
    expect([Number(r.rule_edits), Number(r.adds), Number(r.removes), Number(r.changes), Number(r.make_edits)]).toEqual([7, 4, 1, 2, 6]);
    expect(r.bird_added).toBe(true);
    expect(Number(r.broadcast_edits)).toBe(2);
    expect(Number(r.win_condition_edits)).toBe(1);
    expect(Number(r.lose_condition_edits)).toBe(0);
    expect([Number(r.games_run), Number(r.games_played), Number(r.wins), Number(r.losses)]).toEqual([3, 3, 1, 1]);
    expect([Number(r.games_with_broadcast), Number(r.messages_heard), r.make_game_can_win]).toEqual([1, 2, true]);
    expect([Number(r.predictions), Number(r.predictions_correct)]).toEqual([3, 2]);
    expect(r.prediction_answers).toBe('key:right,star:life_lost,broadcast:bird_says');
    expect([r.liked, r.end_reason, Number(r.probe_seconds)]).toEqual(['yes', 'done', 420]);
    expect(r.last_rules).toContain('game[points:5>win]');

    const left = (await pool.query('SELECT * FROM v_probe_game_maker WHERE session_id = $1', [b.id])).rows[0];
    expect([Number(left.phases_reached), Number(left.games_run), Number(left.games_played), left.liked, left.end_reason]).toEqual([0, 1, 0, null, 'left']);

    const g = (await pool.query('SELECT * FROM v_probe_game_maker_by_grade WHERE grade = 4')).rows[0];
    expect([Number(g.sessions), Number(g.play_done), Number(g.make_done), Number(g.used_broadcast), Number(g.played_a_broadcast), Number(g.set_win_condition), Number(g.added_the_bird)]).toEqual([2, 1, 1, 1, 1, 1, 1]);
    expect([Number(g.predictions_correct), Number(g.predictions), Number(g.liked_yes)]).toEqual([2, 3, 1]);
    expect(Number(g.median_rule_edits)).toBe(3.5);
  });

  it('retrying the exact same batch is idempotent: one row per seq, all acked again', async () => {
    const app = createApp(pool, { distDir });
    const session = newSession();
    const events = [event(0), event(1)];
    const body = JSON.stringify({ session, events });

    const first = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(first.status).toBe(200);

    const second = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, acked: [0, 1] });

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM events WHERE session_id = $1', [session.id]);
    expect(rows[0].n).toBe(2);
  });

  it('never overwrites a non-null field with null on a later sync', async () => {
    const app = createApp(pool, { distDir });
    const session = newSession({ division: 'C', app_version: '0.1.0' });

    await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, events: [] }),
    });

    // Second sync omits division and app_version (sent as null): they must
    // survive from the first sync instead of being wiped.
    const secondSession = { ...session, division: null, app_version: null, current_step: 'survey' };
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session: secondSession, events: [] }),
    });
    expect(res.status).toBe(200);

    const { rows } = await pool.query('SELECT division, app_version, current_step FROM sessions WHERE id = $1', [
      session.id,
    ]);
    expect(rows[0]).toEqual({ division: 'C', app_version: '0.1.0', current_step: 'survey' });
  });

  it('rejects an invalid sync body with 400', async () => {
    const app = createApp(pool, { distDir });
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session: { ...newSession(), grade: 9 }, events: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects an oversized sync body with 413', async () => {
    const app = createApp(pool, { distDir });
    const session = newSession();
    const hugeEvents = Array.from({ length: 400 }, (_, i) => event(i, { payload: { blob: 'x'.repeat(4000) } }));
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, events: hugeEvents }),
    });
    expect(res.status).toBe(413);
  });

  it('answers 429 once the per-IP limit is spent', async () => {
    const app = createApp(pool, { distDir, syncRateLimit: 2 });
    const post = () => app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session: newSession(), events: [] }),
    });
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(429);
  });

  describe('deleting a session (admin)', () => {
    const auth = { authorization: 'Bearer right-token' };

    it('removes the session and cascades its events', async () => {
      const app = createApp(pool, { adminToken: 'right-token', distDir });
      const session = newSession({ code: 'Prueba 1' });
      await app.request('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session, events: [event(0), event(1)] }),
      });
      const res = await app.request(`/api/admin/sessions/${session.id}`, { method: 'DELETE', headers: auth });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, deleted: session.id });
      const { rows: s } = await pool.query('SELECT id FROM sessions WHERE id = $1', [session.id]);
      expect(s).toHaveLength(0);
      const { rows: e } = await pool.query('SELECT seq FROM events WHERE session_id = $1', [session.id]);
      expect(e).toHaveLength(0);
    });

    it('is 404 for an unknown session and 400 for a malformed id', async () => {
      const app = createApp(pool, { adminToken: 'right-token', distDir });
      expect((await app.request(`/api/admin/sessions/${randomUUID()}`, { method: 'DELETE', headers: auth })).status).toBe(404);
      expect((await app.request('/api/admin/sessions/not-a-uuid', { method: 'DELETE', headers: auth })).status).toBe(400);
    });

    it('needs the admin token (the export token does not do)', async () => {
      const app = createApp(pool, { adminToken: 'right-token', exportToken: 'export-token', distDir });
      const session = newSession();
      await app.request('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session, events: [event(0)] }),
      });
      expect((await app.request(`/api/admin/sessions/${session.id}`, { method: 'DELETE' })).status).toBe(401);
      expect((await app.request(`/api/admin/sessions/${session.id}`, { method: 'DELETE', headers: { authorization: 'Bearer export-token' } })).status).toBe(401);
      const { rows } = await pool.query('SELECT id FROM sessions WHERE id = $1', [session.id]);
      expect(rows).toHaveLength(1);
    });
  });

  describe('admin token', () => {
    it('is 503 when ADMIN_TOKEN is not configured', async () => {
      const app = createApp(pool, { distDir });
      const res = await app.request('/api/admin/summary');
      expect(res.status).toBe(503);
    });

    it('is 401 with the wrong token', async () => {
      const app = createApp(pool, { adminToken: 'right-token', distDir });
      const res = await app.request('/api/admin/summary', { headers: { authorization: 'Bearer wrong-token' } });
      expect(res.status).toBe(401);
    });

    it('is 200 with the right token', async () => {
      const app = createApp(pool, { adminToken: 'right-token', distDir });
      const res = await app.request('/api/admin/summary', { headers: { authorization: 'Bearer right-token' } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('sessions');
      expect(body).toHaveProperty('counts_by_grade');
      expect(body).toHaveProperty('active_now');
    });
  });

  describe('export token', () => {
    it('is 503 when EXPORT_TOKEN is not configured', async () => {
      const app = createApp(pool, { distDir });
      const res = await app.request('/api/export?format=json');
      expect(res.status).toBe(503);
    });

    it('is 401 with the wrong token', async () => {
      const app = createApp(pool, { exportToken: 'right-token', distDir });
      const res = await app.request('/api/export?format=json', { headers: { authorization: 'Bearer nope' } });
      expect(res.status).toBe(401);
    });

    it('is 200 with the right token and returns sessions + events CSV correctly quoted', async () => {
      const app = createApp(pool, { exportToken: 'right-token', distDir });
      const session = newSession({ code: 'Comma, Fox "27"' });
      await app.request('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session, events: [] }),
      });

      const jsonRes = await app.request('/api/export?format=json', { headers: { authorization: 'Bearer right-token' } });
      expect(jsonRes.status).toBe(200);
      const jsonBody = await jsonRes.json();
      expect(jsonBody).toHaveProperty('sessions');
      expect(jsonBody).toHaveProperty('events');
      expect(jsonBody).toHaveProperty('exported_at');
      expect(jsonBody).toHaveProperty('app_version');

      const csvRes = await app.request('/api/export?format=csv&table=sessions', {
        headers: { authorization: 'Bearer right-token' },
      });
      expect(csvRes.status).toBe(200);
      const csvText = await csvRes.text();
      expect(csvText).toContain('"Comma, Fox ""27"""');
    });
  });

  describe('retention', () => {
    it('deletes sessions older than RETENTION_DAYS along with their events', async () => {
      const oldSession = newSession({
        id: randomUUID(),
        started_at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const app = createApp(pool, { distDir });
      await app.request('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session: oldSession, events: [event(0)] }),
      });

      const deleted = await deleteOldSessions(pool, 180);
      expect(deleted).toBeGreaterThanOrEqual(1);

      const { rows: sessionRows } = await pool.query('SELECT id FROM sessions WHERE id = $1', [oldSession.id]);
      expect(sessionRows).toHaveLength(0);
      const { rows: eventRows } = await pool.query('SELECT seq FROM events WHERE session_id = $1', [oldSession.id]);
      expect(eventRows).toHaveLength(0);
    });
  });
});
