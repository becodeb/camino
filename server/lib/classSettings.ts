// The sound switch (T18): el docente's class-wide setting from /admin
// ("Con sonido" / "Sin sonido" / "Como diga el link"). Unlike
// class_commands (a one-time instruction each device applies once by its
// id), this is a current value: GET /api/class-settings (public, cheap,
// called at page load before the first spoken line) and every POST
// /api/sync answer both read the same live row.

import type pg from 'pg';

export type SoundSetting = 'on' | 'off' | 'link';
export const SOUND_SETTINGS_KEY = 'sound';
/** `'on'`/`'off'` fall back to `'link'` (no class override) 4 hours after being set, so tomorrow's class starts fresh. */
export const SOUND_SETTING_TTL_MS = 4 * 60 * 60_000;

export interface LiveSoundSetting {
  value: SoundSetting;
  set_at: string | null;
  expires_at: string | null;
}

interface Row { value: string; set_at: Date; expires_at: Date | null }

const isSoundSetting = (v: string): v is SoundSetting => v === 'on' || v === 'off' || v === 'link';

/** The live value: `'link'` (no override) when never set or expired. */
export async function liveSoundSetting(client: pg.Pool | pg.PoolClient): Promise<LiveSoundSetting> {
  const { rows } = await client.query<Row>(
    `SELECT value, set_at, expires_at FROM class_settings
     WHERE key = $1 AND (expires_at IS NULL OR expires_at > now())`,
    [SOUND_SETTINGS_KEY],
  );
  const row = rows[0];
  if (!row || !isSoundSetting(row.value)) return { value: 'link', set_at: null, expires_at: null };
  return { value: row.value, set_at: row.set_at.toISOString(), expires_at: row.expires_at?.toISOString() ?? null };
}

export async function setSoundSetting(pool: pg.Pool, value: SoundSetting, ttlMs = SOUND_SETTING_TTL_MS): Promise<LiveSoundSetting> {
  await pool.query(
    `INSERT INTO class_settings (key, value, set_at, expires_at)
     VALUES ($1, $2, now(), now() + ($3 || ' milliseconds')::interval)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, set_at = now(), expires_at = EXCLUDED.expires_at`,
    [SOUND_SETTINGS_KEY, value, String(ttlMs)],
  );
  return liveSoundSetting(pool);
}
