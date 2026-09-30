// Entry point: run with plain `node server/index.ts` (Node 24 strips the
// types at load time; no compile step, no enums/namespaces/param
// properties). Runs migrations, serves the built front end from dist/ plus
// /api, and schedules retention.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createPool, migrate } from './db.ts';
import { createApp } from './app.ts';
import { deleteOldSessions } from './retention.ts';

const RETENTION_SWEEP_MS = 24 * 60 * 60 * 1000;

export async function main(): Promise<{ close: () => Promise<void> }> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const port = Number(process.env.PORT ?? 3000);
  const retentionDays = Number(process.env.RETENTION_DAYS ?? 180);
  const adminToken = process.env.ADMIN_TOKEN;
  const exportToken = process.env.EXPORT_TOKEN;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.join(here, '..', 'dist');

  const pool = createPool(databaseUrl);
  const applied = await migrate(pool);
  if (applied.length > 0) {
    console.log(`applied migrations: ${applied.join(', ')}`);
  }

  async function sweepRetention() {
    try {
      const deleted = await deleteOldSessions(pool, retentionDays);
      if (deleted > 0) console.log(`retention: deleted ${deleted} session(s) older than ${retentionDays} days`);
    } catch (err) {
      console.error('retention sweep failed', err);
    }
  }
  await sweepRetention();
  const retentionTimer = setInterval(sweepRetention, RETENTION_SWEEP_MS);

  const app = createApp(pool, { adminToken, exportToken, distDir });

  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`camino-prueba listening on :${info.port}`);
  });

  return {
    async close() {
      clearInterval(retentionTimer);
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await pool.end();
    },
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().then(
    (app) => {
      const shutdown = () => {
        app.close().then(() => process.exit(0));
      };
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    },
    (err) => {
      console.error('failed to start', err);
      process.exit(1);
    },
  );
}
