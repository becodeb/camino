import { Hono } from 'hono';
import type pg from 'pg';

export function healthRoute(pool: pg.Pool): Hono {
  const app = new Hono();
  app.get('/', async (c) => {
    try {
      await pool.query('SELECT 1');
      return c.json({ ok: true }, 200);
    } catch {
      return c.json({ ok: false }, 500);
    }
  });
  return app;
}
