// Postgres pool and the idempotent migration runner. Migrations run at
// startup from server/migrations/*.sql, in filename order, each inside its
// own transaction, tracked in schema_migrations so a re-run only applies new
// files. A Postgres advisory lock protects against two instances racing on
// the same database at boot (Coolify can restart both app replicas at once).

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const MIGRATIONS_LOCK_KEY = 875_142_001; // arbitrary, fixed for this app

export function createPool(databaseUrl: string): pg.Pool {
  return new Pool({ connectionString: databaseUrl });
}

function migrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, 'migrations');
}

export async function migrate(pool: pg.Pool): Promise<string[]> {
  const dir = migrationsDir();
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATIONS_LOCK_KEY]);
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      const { rows } = await client.query<{ id: string }>('SELECT id FROM schema_migrations');
      const done = new Set(rows.map((r) => r.id));

      for (const file of files) {
        if (done.has(file)) continue;
        const sql = await readFile(path.join(dir, file), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
          await client.query('COMMIT');
          applied.push(file);
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATIONS_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
  return applied;
}
