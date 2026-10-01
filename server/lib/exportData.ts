// Shared read-only queries for /api/export and /api/admin/export: both
// endpoints expose the same two tables, gated by different bearer tokens.
// Demo sessions (T14) are never exported: both read the `real_*` views
// (migration 008), which leave them out.

import type pg from 'pg';

export const SESSION_COLUMNS = [
  'id',
  'code',
  'grade',
  'division',
  'consent',
  'started_at',
  'ended_at',
  'end_reason',
  'app_version',
  'device',
  'survey',
  'adult_form',
  'current_step',
  'created_at',
  'last_seen_at',
];

export const EVENT_COLUMNS = ['session_id', 'seq', 'client_t', 'server_t', 'type', 'payload'];

export async function fetchAllSessions(pool: pg.Pool): Promise<Array<Record<string, unknown>>> {
  const { rows } = await pool.query(`SELECT ${SESSION_COLUMNS.join(', ')} FROM real_sessions ORDER BY started_at`);
  return rows;
}

export async function fetchAllEvents(pool: pg.Pool): Promise<Array<Record<string, unknown>>> {
  const { rows } = await pool.query(`SELECT ${EVENT_COLUMNS.join(', ')} FROM real_events ORDER BY session_id, seq`);
  return rows;
}
