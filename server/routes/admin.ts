// Admin API (Bearer ADMIN_TOKEN): a live summary for the /admin page and the
// same JSON/CSV export the analyst-facing /api/export offers, so the
// teacher-facing admin token can also pull a copy during the pilot.

import { Hono } from 'hono';
import type pg from 'pg';
import { bearerAuth } from '../lib/auth.ts';
import { toCsv } from '../lib/csv.ts';
import { EVENT_COLUMNS, SESSION_COLUMNS, fetchAllEvents, fetchAllSessions } from '../lib/exportData.ts';
import { APP_VERSION } from '../version.ts';

const ACTIVE_WINDOW_MINUTES = 2;

export function adminRoute(pool: pg.Pool, adminToken: string | undefined): Hono {
  const app = new Hono();
  app.use('*', bearerAuth(adminToken));

  app.get('/summary', async (c) => {
    const sessionsQuery = pool.query(
      `SELECT
         s.id AS session_id, s.code, s.grade, s.division, s.started_at, s.last_seen_at,
         s.current_step, s.ended_at, s.end_reason,
         EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at)) AS duration_seconds,
         (SELECT count(*) FROM events e WHERE e.session_id = s.id) AS event_count
       FROM sessions s
       ORDER BY s.started_at DESC`,
    );
    const countsQuery = pool.query('SELECT grade, count(*)::int AS n FROM sessions GROUP BY grade ORDER BY grade');
    const activeQuery = pool.query(
      `SELECT count(*)::int AS n FROM sessions
       WHERE ended_at IS NULL AND last_seen_at > now() - ($1 || ' minutes')::interval`,
      [ACTIVE_WINDOW_MINUTES],
    );

    const [sessions, counts, active] = await Promise.all([sessionsQuery, countsQuery, activeQuery]);

    const countsByGrade: Record<number, number> = {};
    for (const row of counts.rows as Array<{ grade: number; n: number }>) countsByGrade[row.grade] = row.n;

    return c.json({
      sessions: sessions.rows,
      counts_by_grade: countsByGrade,
      active_now: (active.rows[0] as { n: number }).n,
      active_window_minutes: ACTIVE_WINDOW_MINUTES,
      generated_at: new Date().toISOString(),
    });
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
