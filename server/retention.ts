// Deletes sessions (and their events, via ON DELETE CASCADE) older than
// RETENTION_DAYS, demo sessions (T14) older than DEMO_RETENTION_HOURS, and
// class commands that expired a week ago. Run at startup and every hour
// from index.ts (demo sessions must not outlive their day).

import type pg from 'pg';

export const DEMO_RETENTION_HOURS = 24;

export async function deleteOldSessions(pool: pg.Pool, retentionDays: number): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM sessions WHERE started_at < now() - ($1 || ' days')::interval`,
    [retentionDays],
  );
  return rowCount ?? 0;
}

/** Demo sessions started more than `hours` ago (by the device's clock or the server's first sight, whichever is earlier). */
export async function deleteOldDemoSessions(pool: pg.Pool, hours = DEMO_RETENTION_HOURS): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM sessions WHERE demo AND LEAST(started_at, created_at) < now() - ($1 || ' hours')::interval`,
    [hours],
  );
  return rowCount ?? 0;
}

export async function deleteOldCommands(pool: pg.Pool): Promise<number> {
  const { rowCount } = await pool.query(`DELETE FROM class_commands WHERE expires_at < now() - interval '7 days'`);
  return rowCount ?? 0;
}
