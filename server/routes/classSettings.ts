// GET /api/class-settings (T18): public, no auth — every device reads this
// at page load, before the setup's spoken question, so a class-wide "sin
// sonido" from /admin is already in effect even for a device that opens
// the bookmark link after the teacher pressed the button. Tiny JSON,
// never cached, rate-limited per IP like /api/sync (reusing the same
// in-memory limiter shape) but with a much smaller cap: a device reads
// this once per page load, not every few seconds.

import { Hono } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import type pg from 'pg';
import { createRateLimiter } from '../lib/rateLimit.ts';
import { liveSoundSetting } from '../lib/classSettings.ts';

export const CLASS_SETTINGS_RATE_LIMIT = 120;
export const CLASS_SETTINGS_RATE_WINDOW_MS = 60_000;

export function classSettingsRoute(pool: pg.Pool, rateLimit = CLASS_SETTINGS_RATE_LIMIT): Hono {
  const app = new Hono();
  const limiter = createRateLimiter(rateLimit, CLASS_SETTINGS_RATE_WINDOW_MS);

  app.get('/', async (c) => {
    let ip = 'unknown';
    try {
      ip = getConnInfo(c).remote.address ?? 'unknown';
    } catch {
      // no real socket behind this request (tests' app.request())
    }
    if (!limiter.check(ip)) return c.json({ error: 'rate_limited' }, 429);
    const setting = await liveSoundSetting(pool);
    return c.json({ sound: setting.value, expires_at: setting.expires_at }, 200, { 'cache-control': 'no-store' });
  });

  return app;
}
