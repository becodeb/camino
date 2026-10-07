-- The sound switch (T18, the silent classroom round). Unlike
-- `class_commands` (one-time, each device applies an id once),
-- `class_settings` holds the current value of a setting: el docente's
-- "Con sonido" / "Sin sonido" / "Como diga el link" from /admin, read by
-- the public GET /api/class-settings at page load (before the first
-- spoken line) and carried in every POST /api/sync answer (so a change
-- reaches a device already playing within one sync cycle).

CREATE TABLE IF NOT EXISTS class_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
