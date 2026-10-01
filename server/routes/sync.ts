// POST /api/sync: the only write endpoint the kid app uses. Idempotent so
// the offline client can retry a batch blindly — upserting the session
// never overwrites a non-null field with null, and events are inserted with
// ON CONFLICT (session_id, seq) DO NOTHING, so acked always lists every seq
// in the batch once this call succeeds.

import { Hono } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import type pg from 'pg';
import { validateSyncBody } from '../lib/validate.ts';
import { createRateLimiter } from '../lib/rateLimit.ts';
import { commandsFor, type ClassCommand } from '../lib/commands.ts';
import type { EventInput, SessionInput } from '../types.ts';

// Requests per IP per minute. A whole class (~25 devices) sits behind one
// school NAT, so one IP is many children: each device posts about every 5 s
// (12/min) plus flushes when the page hides, ~300/min for a class; 1500
// leaves 5x headroom and still stops a runaway client.
export const SYNC_RATE_LIMIT = 1500;
export const SYNC_RATE_WINDOW_MS = 60_000;

/** The session as the server saw it before this sync (null: its first). */
interface Before { lastSeen: Date; createdAt: Date }

async function upsertSessionAndEvents(
  client: pg.PoolClient,
  session: SessionInput,
  events: EventInput[],
): Promise<Before | null> {
  await client.query('BEGIN');
  try {
    const prev = await client.query<{ last_seen_at: Date; created_at: Date }>(
      'SELECT last_seen_at, created_at FROM sessions WHERE id = $1',
      [session.id],
    );
    await client.query(
      `INSERT INTO sessions (
         id, code, grade, division, consent, started_at, ended_at, end_reason,
         app_version, device, survey, adult_form, current_step, last_seen_at, demo
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now(), $14)
       ON CONFLICT (id) DO UPDATE SET
         code = COALESCE(EXCLUDED.code, sessions.code),
         grade = COALESCE(EXCLUDED.grade, sessions.grade),
         division = COALESCE(EXCLUDED.division, sessions.division),
         consent = COALESCE(EXCLUDED.consent, sessions.consent),
         started_at = COALESCE(EXCLUDED.started_at, sessions.started_at),
         ended_at = COALESCE(EXCLUDED.ended_at, sessions.ended_at),
         end_reason = COALESCE(EXCLUDED.end_reason, sessions.end_reason),
         app_version = COALESCE(EXCLUDED.app_version, sessions.app_version),
         device = COALESCE(EXCLUDED.device, sessions.device),
         survey = COALESCE(EXCLUDED.survey, sessions.survey),
         adult_form = COALESCE(EXCLUDED.adult_form, sessions.adult_form),
         current_step = COALESCE(EXCLUDED.current_step, sessions.current_step),
         last_seen_at = now(),
         demo = sessions.demo OR EXCLUDED.demo`,
      [
        session.id,
        session.code,
        session.grade,
        session.division,
        session.consent,
        session.started_at,
        session.ended_at,
        session.end_reason,
        session.app_version,
        JSON.stringify(session.device),
        session.survey === null ? null : JSON.stringify(session.survey),
        session.adult_form === null ? null : JSON.stringify(session.adult_form),
        session.current_step,
        session.demo === true,
      ],
    );

    for (const ev of events) {
      await client.query(
        `INSERT INTO events (session_id, seq, client_t, type, payload)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (session_id, seq) DO NOTHING`,
        [session.id, ev.seq, ev.client_t, ev.type, JSON.stringify(ev.payload)],
      );
    }

    await client.query('COMMIT');
    const row = prev.rows[0];
    return row ? { lastSeen: row.last_seen_at, createdAt: row.created_at } : null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

export function syncRoute(pool: pg.Pool, rateLimit = SYNC_RATE_LIMIT): Hono {
  const app = new Hono();
  const limiter = createRateLimiter(rateLimit, SYNC_RATE_WINDOW_MS);

  app.post('/', async (c) => {
    let ip = 'unknown';
    try {
      ip = getConnInfo(c).remote.address ?? 'unknown';
    } catch {
      // No real socket behind this request (e.g. Hono's app.request() in
      // tests, which builds a plain fetch Request with no Node connection
      // attached). Fall back to a single shared bucket for that case.
    }
    if (!limiter.check(ip)) {
      return c.json({ error: 'rate_limited' }, 429);
    }

    const raw = await c.req.text();
    const byteLength = Buffer.byteLength(raw, 'utf8');

    let parsed: unknown;
    try {
      parsed = raw.length === 0 ? {} : JSON.parse(raw);
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }

    const result = validateSyncBody(parsed, byteLength);
    if (!result.ok) {
      return c.json({ error: result.message }, result.status);
    }

    const { session, events } = result.value;
    const client = await pool.connect();
    let commands: ClassCommand[] = [];
    try {
      const before = await upsertSessionAndEvents(client, session, events);
      // the class's commands (T14) for this session: from when it started (the earlier of its clock and the server's first sight)
      const own = Date.parse(session.started_at);
      const seen = before?.createdAt.getTime() ?? Date.now();
      commands = await commandsFor(client, new Date(Math.min(own, seen)), before?.lastSeen ?? null);
    } finally {
      client.release();
    }

    return c.json({ ok: true, acked: events.map((e) => e.seq), commands }, 200);
  });

  return app;
}
