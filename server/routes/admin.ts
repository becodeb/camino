// Admin API. Two ways in:
// - el docente's password (ADMIN_PASSWORD) at POST /login, which sets a
//   signed HttpOnly cookie for 12 hours (lib/adminSession.ts), what the
//   /admin page uses;
// - `Authorization: Bearer ADMIN_TOKEN`, what the tools use.
// Requests that change something with the cookie must also carry the
// header `x-camino-admin: 1` (a cross-site form cannot set it; SameSite=
// Strict already keeps the cookie off cross-site requests).
//
// Routes: a live summary for /admin (demo sessions left out, with "terminó"
// and the survey per session), the class commands ("quedan 5 minutos",
// "terminar la clase", "cancelar aviso"), the same JSON/CSV export as
// /api/export, and the deletion of one session (check and test sessions).

import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import type pg from 'pg';
import { toCsv } from '../lib/csv.ts';
import { EVENT_COLUMNS, SESSION_COLUMNS, fetchAllEvents, fetchAllSessions } from '../lib/exportData.ts';
import {
  COOKIE_MAX_AGE_S, clientKey, cookieOf, createLoginLimiter, isHttps, passwordMatches, setCookieHeader, signCookie, verifyCookie,
  type AdminSecrets, type LoginLimiter,
} from '../lib/adminSession.ts';
import { COMMAND_KINDS, cancelWarnings, createCommand, liveCommands, type CommandKind } from '../lib/commands.ts';
import { APP_VERSION } from '../version.ts';

const ACTIVE_WINDOW_MINUTES = 2;
/** "Esta clase" on /admin: sessions seen in the last two hours. */
const CLASS_WINDOW_MINUTES = 120;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AdminOptions extends AdminSecrets {
  /** Tests: a limiter with other numbers. */
  limiter?: LoginLimiter;
}

function bearerMatches(c: Context, token: string | undefined): boolean {
  if (!token) return false;
  const header = c.req.header('authorization') ?? '';
  const [scheme, value] = header.split(' ');
  if (scheme !== 'Bearer' || !value) return false;
  const a = Buffer.from(value, 'utf8');
  const b = Buffer.from(token, 'utf8');
  if (a.length !== b.length) { timingSafeEqual(a, a); return false; }
  return timingSafeEqual(a, b);
}

function adminAuth(s: AdminSecrets): MiddlewareHandler {
  return async (c, next) => {
    if (!s.token && !s.password) return c.json({ error: 'not_configured' }, 503);
    if (bearerMatches(c, s.token)) return next();
    if (c.req.header('authorization')) return c.json({ error: 'unauthorized' }, 401);
    if (!verifyCookie(s, cookieOf(c))) return c.json({ error: 'unauthorized' }, 401);
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.header('x-camino-admin') !== '1') {
      return c.json({ error: 'missing_header' }, 403);
    }
    return next();
  };
}

export function adminRoute(pool: pg.Pool, opts: AdminOptions | string | undefined): Hono {
  const o: AdminOptions = typeof opts === 'string' || opts === undefined ? { token: opts } : opts;
  const secrets: AdminSecrets = { token: o.token, password: o.password };
  const limiter = o.limiter ?? createLoginLimiter();
  const app = new Hono();

  // ---------------------------------------------------------------- login (no auth)

  app.post('/login', async (c) => {
    if (!secrets.password) return c.json({ error: 'not_configured' }, 503);
    const key = clientKey(c);
    const wait = limiter.blockedFor(key);
    if (wait > 0) return c.json({ error: 'too_many_tries', retry_after_s: Math.ceil(wait / 1000) }, 429, { 'retry-after': String(Math.ceil(wait / 1000)) });
    let body: unknown;
    try { body = await c.req.json(); } catch { body = null; }
    const typed = (body as { password?: unknown } | null)?.password;
    if (!passwordMatches(secrets, typed)) {
      limiter.fail(key);
      return c.json({ error: 'wrong_password' }, 401);
    }
    limiter.ok(key);
    return c.json({ ok: true, expires_in_s: COOKIE_MAX_AGE_S }, 200, { 'set-cookie': setCookieHeader(signCookie(secrets), isHttps(c)) });
  });

  app.post('/logout', (c) => c.json({ ok: true }, 200, { 'set-cookie': setCookieHeader('', isHttps(c), 0) }));

  app.use('*', async (c, next) => {
    if (c.req.method === 'POST' && (c.req.path.endsWith('/login') || c.req.path.endsWith('/logout'))) return next();
    return adminAuth(secrets)(c, next);
  });

  app.get('/me', (c) => c.json({ ok: true }));

  // ---------------------------------------------------------------- the class

  app.get('/summary', async (c) => {
    const sessionsQuery = pool.query(
      `SELECT
         s.id AS session_id, s.code, s.grade, s.division, s.started_at, s.last_seen_at,
         s.current_step, s.ended_at, s.end_reason,
         EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at)) AS duration_seconds,
         (SELECT count(*) FROM events e WHERE e.session_id = s.id) AS event_count,
         EXISTS (SELECT 1 FROM events e WHERE e.session_id = s.id AND e.type = 'route_done') AS route_done,
         (s.survey IS NOT NULL) AS survey_done,
         (s.last_seen_at > now() - ($1 || ' minutes')::interval) AS in_class
       FROM sessions s
       WHERE NOT s.demo
       ORDER BY s.started_at DESC`,
      [CLASS_WINDOW_MINUTES],
    );
    const countsQuery = pool.query('SELECT grade, count(*)::int AS n FROM sessions WHERE NOT demo GROUP BY grade ORDER BY grade');
    const activeQuery = pool.query(
      `SELECT count(*)::int AS n FROM sessions
       WHERE NOT demo AND ended_at IS NULL AND last_seen_at > now() - ($1 || ' minutes')::interval`,
      [ACTIVE_WINDOW_MINUTES],
    );
    const demoQuery = pool.query('SELECT count(*)::int AS n FROM sessions WHERE demo');

    const [sessions, counts, active, demo, commands] = await Promise.all([sessionsQuery, countsQuery, activeQuery, demoQuery, liveCommands(pool)]);

    const countsByGrade: Record<number, number> = {};
    for (const row of counts.rows as Array<{ grade: number; n: number }>) countsByGrade[row.grade] = row.n;
    const inClass = (sessions.rows as Array<{ in_class: boolean; route_done: boolean; survey_done: boolean }>).filter((s) => s.in_class);

    return c.json({
      sessions: sessions.rows,
      counts_by_grade: countsByGrade,
      active_now: (active.rows[0] as { n: number }).n,
      active_window_minutes: ACTIVE_WINDOW_MINUTES,
      class_window_minutes: CLASS_WINDOW_MINUTES,
      class_counts: {
        sessions: inClass.length,
        route_done: inClass.filter((s) => s.route_done).length,
        survey_done: inClass.filter((s) => s.survey_done).length,
      },
      demo_hidden: (demo.rows[0] as { n: number }).n,
      commands,
      generated_at: new Date().toISOString(),
    });
  });

  // "quedan 5 minutos" / "terminar la clase" for every device of the class
  app.post('/commands', async (c) => {
    let body: unknown;
    try { body = await c.req.json(); } catch { body = null; }
    const kind = (body as { kind?: unknown } | null)?.kind;
    if (typeof kind !== 'string' || !COMMAND_KINDS.includes(kind as CommandKind)) {
      return c.json({ error: 'kind must be five_min or end_class' }, 400);
    }
    const command = await createCommand(pool, kind as CommandKind);
    return c.json({ ok: true, command });
  });

  // "cancelar aviso": the five-minute warning is dropped where it is still pending
  app.post('/commands/cancel', async (c) => c.json({ ok: true, cancelled: await cancelWarnings(pool) }));

  // Removes one session and (ON DELETE CASCADE) all its events: check and
  // test sessions must not stay in the pilot's data.
  app.delete('/sessions/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID_RE.test(id)) return c.json({ error: 'invalid_id' }, 400);
    const res = await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
    if (!res.rowCount) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true, deleted: id });
  });

  app.get('/export', async (c) => {
    const format = c.req.query('format') ?? 'json';
    const table = c.req.query('table') ?? 'events';

    if (format === 'json') {
      const [sessions, events] = await Promise.all([fetchAllSessions(pool), fetchAllEvents(pool)]);
      return c.json({ sessions, events, exported_at: new Date().toISOString(), app_version: APP_VERSION });
    }

    if (format === 'csv') {
      if (table === 'sessions') {
        const csv = toCsv(await fetchAllSessions(pool), SESSION_COLUMNS);
        return c.text(csv, 200, { 'content-type': 'text/csv; charset=utf-8' });
      }
      if (table === 'events') {
        const csv = toCsv(await fetchAllEvents(pool), EVENT_COLUMNS);
        return c.text(csv, 200, { 'content-type': 'text/csv; charset=utf-8' });
      }
      return c.json({ error: 'table must be sessions or events' }, 400);
    }

    return c.json({ error: 'format must be json or csv' }, 400);
  });

  return app;
}
