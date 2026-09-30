// Deletes sessions (and their events, via ON DELETE CASCADE) older than
// RETENTION_DAYS. Run once at startup and every 24h from index.ts.

import type pg from 'pg';

export async function deleteOldSessions(pool: pg.Pool, retentionDays: number): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM sessions WHERE started_at < now() - ($1 || ' days')::interval`,
    [retentionDays],
  );
  return rowCount ?? 0;
}
