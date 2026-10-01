// Class commands (T14): /admin's "quedan 5 minutos" and "terminar la clase"
// for every device of the class. A command is a row (class_commands) with an
// expiry; each POST /api/sync answers with the commands its session must
// see, so a device that was offline gets them when it reconnects, unless
// they expired. Still anonymous: a command is for "the sessions active now",
// never for a child.
//
// A session sees a command when:
// - it started before the command was sent (a child who starts afterwards
//   is not told to finish): the earlier of the device's start time and the
//   server's first sight of it, so a device clock running ahead does not
//   hide a session that really was playing, and
// - it was seen (synced) within ACTIVE_WINDOW_MS before the command, or is
//   syncing for the first time (it started before it, offline), and
// - the command has not expired.
// A cancelled warning is still handed out (`cancelled: true`) until it
// expires, so a device that has it pending drops it; the client applies
// each command id once.

import type pg from 'pg';

export type CommandKind = 'five_min' | 'end_class';
export const COMMAND_KINDS: readonly CommandKind[] = ['five_min', 'end_class'];
export const COMMAND_TTL_MS = 2 * 60 * 60_000;
export const ACTIVE_WINDOW_MS = 2 * 60 * 60_000;

export interface ClassCommand {
  id: number;
  kind: CommandKind;
  at: string;
  expires_at: string;
  cancelled: boolean;
}

interface Row { id: string; kind: CommandKind; created_at: Date; expires_at: Date; cancelled_at: Date | null }

const toCommand = (r: Row): ClassCommand => ({
  id: Number(r.id),
  kind: r.kind,
  at: r.created_at.toISOString(),
  expires_at: r.expires_at.toISOString(),
  cancelled: r.cancelled_at != null,
});

export async function createCommand(pool: pg.Pool, kind: CommandKind, ttlMs = COMMAND_TTL_MS): Promise<ClassCommand> {
  const { rows } = await pool.query<Row>(
    `INSERT INTO class_commands (kind, expires_at) VALUES ($1, now() + ($2 || ' milliseconds')::interval)
     RETURNING id, kind, created_at, expires_at, cancelled_at`,
    [kind, String(ttlMs)],
  );
  return toCommand(rows[0]);
}

/** "Cancelar aviso": the five-minute warnings still live. Returns how many. */
export async function cancelWarnings(pool: pg.Pool): Promise<number> {
  const res = await pool.query(
    `UPDATE class_commands SET cancelled_at = now()
     WHERE kind = 'five_min' AND cancelled_at IS NULL AND expires_at > now()`,
  );
  return res.rowCount ?? 0;
}

/** The commands still live (not expired), newest first: /admin shows the class's state from them. */
export async function liveCommands(pool: pg.Pool): Promise<ClassCommand[]> {
  const { rows } = await pool.query<Row>(
    `SELECT id, kind, created_at, expires_at, cancelled_at FROM class_commands
     WHERE expires_at > now() ORDER BY id DESC LIMIT 20`,
  );
  return rows.map(toCommand);
}

/**
 * What one session must see. `startedAt`: when it started (the earlier of
 * its own clock and the server's first sync); `lastSeen` its last sync
 * before this one (null: its first).
 */
export async function commandsFor(
  client: pg.Pool | pg.PoolClient,
  startedAt: Date,
  lastSeen: Date | null,
): Promise<ClassCommand[]> {
  const { rows } = await client.query<Row>(
    `SELECT id, kind, created_at, expires_at, cancelled_at FROM class_commands
     WHERE expires_at > now()
       AND created_at > $1::timestamptz
       AND ($2::timestamptz IS NULL OR $2::timestamptz > created_at - ($3 || ' milliseconds')::interval)
     ORDER BY id`,
    [startedAt, lastSeen, String(ACTIVE_WINDOW_MS)],
  );
  return rows.map(toCommand);
}
