// Builds the Hono app (routes + static) without binding a port, so both
// index.ts (real server) and the API tests (Hono's app.request(), no
// listener needed) share the exact same wiring.

import { Hono } from 'hono';
import type pg from 'pg';
import { healthRoute } from './routes/health.ts';
import { syncRoute } from './routes/sync.ts';
import { adminRoute } from './routes/admin.ts';
import { exportRoute } from './routes/export.ts';
import { classSettingsRoute } from './routes/classSettings.ts';
import { previousAdultFormRoute } from './routes/previousAdultForm.ts';
import { serveDist } from './static.ts';
import { ADMIN_PAGE_HTML } from './admin/page.ts';
import type { LoginLimiter } from './lib/adminSession.ts';

export interface AppOptions {
  adminToken?: string;
  /** El docente's /admin password (ADMIN_PASSWORD); unset: no password login. */
  adminPassword?: string;
  /** Tests: the login limiter. */
  adminLimiter?: LoginLimiter;
  exportToken?: string;
  distDir: string;
  /** /api/sync requests per IP per minute (tests lower it). */
  syncRateLimit?: number;
  /** T18: /api/class-settings requests per IP per minute (tests lower it). */
  classSettingsRateLimit?: number;
  /** T22: /api/adult-form/:id requests per IP per minute (tests lower it). */
  adultFormRateLimit?: number;
}

export function createApp(pool: pg.Pool, opts: AppOptions): Hono {
  const app = new Hono();
  app.route('/api/health', healthRoute(pool));
  app.route('/api/sync', syncRoute(pool, opts.syncRateLimit));
  app.route('/api/class-settings', classSettingsRoute(pool, opts.classSettingsRateLimit));
  app.route('/api/adult-form', previousAdultFormRoute(pool, opts.adultFormRateLimit));
  app.route('/api/admin', adminRoute(pool, { token: opts.adminToken, password: opts.adminPassword, limiter: opts.adminLimiter }));
  app.route('/api/export', exportRoute(pool, opts.exportToken));
  app.get('/admin', (c) => c.html(ADMIN_PAGE_HTML, 200, { 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer' }));
  app.get('*', serveDist(opts.distDir));
  return app;
}
