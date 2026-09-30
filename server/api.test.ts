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
