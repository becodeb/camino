// GET /api/export (Bearer EXPORT_TOKEN): the analyst-facing export used by
// tools/export-playtest.mjs. format=json returns both tables in one body;
// format=csv returns one table (default events) as CSV.

import { Hono } from 'hono';
import type pg from 'pg';
import { bearerAuth } from '../lib/auth.ts';
import { toCsv } from '../lib/csv.ts';
import { EVENT_COLUMNS, SESSION_COLUMNS, fetchAllEvents, fetchAllSessions } from '../lib/exportData.ts';
import { APP_VERSION } from '../version.ts';

export function exportRoute(pool: pg.Pool, exportToken: string | undefined): Hono {
  const app = new Hono();
  app.use('*', bearerAuth(exportToken));

  app.get('/', async (c) => {
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
