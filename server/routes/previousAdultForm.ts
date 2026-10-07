// POST /api/adult-form/:id (T22, back-to-back classes): a device's
// "Comentario del chico anterior" (src/playtest/previousChild.ts), writing
// the adult's comment for a session that already ended on that device, once
// the next child's own session may already be the one it is playing. Not
// the normal /api/sync path: by the time this is used, the session's full
// record may be long gone from the device's own telemetry queue, and
// reconstructing it just to patch one field would be more code than this
// small, focused endpoint (it only needs the id and the form; the server
// already has everything else). Public (the kid app has no admin token),
// so rate-limited like /api/class-settings, and only ever touches a session
// that already ended — never a live one, never a demo one.

import { Hono } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import type pg from 'pg';
import { createRateLimiter } from '../lib/rateLimit.ts';
import { validateAdultForm } from '../lib/validate.ts';

export const ADULT_FORM_RATE_LIMIT = 120;
export const ADULT_FORM_RATE_WINDOW_MS = 60_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function previousAdultFormRoute(pool: pg.Pool, rateLimit = ADULT_FORM_RATE_LIMIT): Hono {
  const app = new Hono();
  const limiter = createRateLimiter(rateLimit, ADULT_FORM_RATE_WINDOW_MS);

  app.post('/:id', async (c) => {
    let ip = 'unknown';
    try {
      ip = getConnInfo(c).remote.address ?? 'unknown';
    } catch {
      // no real socket behind this request (tests' app.request())
    }
    if (!limiter.check(ip)) return c.json({ error: 'rate_limited' }, 429);

    const id = c.req.param('id');
    if (!UUID_RE.test(id)) return c.json({ error: 'invalid_id' }, 400);

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const result = validateAdultForm(raw);
    if (typeof result === 'string') return c.json({ error: result }, 400);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = await client.query<{ demo: boolean; ended_at: Date | null; current_step: string | null }>(
        'SELECT demo, ended_at, current_step FROM sessions WHERE id = $1 FOR UPDATE',
        [id],
      );
      const session = row.rows[0];
      if (!session) {
        await client.query('ROLLBACK');
        return c.json({ error: 'not_found' }, 404);
      }
      if (session.demo) {
        await client.query('ROLLBACK');
        return c.json({ error: 'not_found' }, 404);
      }
      if (!session.ended_at) {
        await client.query('ROLLBACK');
        return c.json({ error: 'session_not_ended' }, 400);
      }

      const form = { ...result, step: session.current_step ?? 'previous' };
      await client.query('UPDATE sessions SET adult_form = $1 WHERE id = $2', [JSON.stringify(form), id]);
      const seq = await client.query<{ next: number }>(
        'SELECT COALESCE(MAX(seq) + 1, 0) AS next FROM events WHERE session_id = $1',
        [id],
      );
      const payload = { step: form.step, engagement: result.engagement, help_needed: result.help_needed, comment: !!result.comment, previous: true };
      await client.query(
        `INSERT INTO events (session_id, seq, client_t, type, payload) VALUES ($1, $2, now(), 'adult_form', $3)`,
        [id, seq.rows[0].next, JSON.stringify(payload)],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return c.json({ ok: true }, 200);
  });

  return app;
}
