-- The classroom round (T14).
--
-- 1. Demo sessions. The adult can play the pilot in a demo mode (to show it,
--    to try it before class); those sessions sync like any other but carry
--    `demo = true`. They are left out of /api/export, of /admin's lists and
--    counts and of every analysis view, and the retention job deletes them
--    after 24 hours.
-- 2. Class commands. /admin sends "quedan 5 minutos" (`five_min`) and
--    "terminar la clase" (`end_class`) to every device of the class: a row
--    here, handed to each session in its /api/sync answer until it expires.
--    "Cancelar aviso" stamps `cancelled_at` on the warning (the devices that
--    still have it pending drop it).
-- 3. The analysis views read only real sessions. Every view defined by the
--    migrations before this one read `events` and `sessions` directly; here
--    two base views, `real_sessions` and `real_events`, hold the non-demo
--    rows, and each existing `v_*` view is redefined on them: its own
--    definition (pg_get_viewdef) with `FROM/JOIN events|sessions` swapped for
--    `real_events`/`real_sessions` (aliased as before), so the views' logic stays
--    what migrations 001–007 wrote. New views must read `real_events` and
--    `real_sessions` too.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS sessions_demo_idx ON sessions (started_at) WHERE demo;

CREATE TABLE IF NOT EXISTS class_commands (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('five_min', 'end_class')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  cancelled_at timestamptz
);
CREATE INDEX IF NOT EXISTS class_commands_expires_idx ON class_commands (expires_at);

CREATE OR REPLACE VIEW real_sessions AS
SELECT * FROM sessions WHERE NOT demo;

CREATE OR REPLACE VIEW real_events AS
SELECT e.* FROM events e JOIN sessions s ON s.id = e.session_id WHERE NOT s.demo;

-- Redefine the analysis views on the real rows, in dependency order (a view
-- that reads another, e.g. v_session_summary → v_ladder_ceiling, keeps
-- reading it: only the two tables' names are swapped). CREATE OR REPLACE
-- keeps every column, so nothing that depends on a view breaks.
DO $$
DECLARE
  v text;
  def text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'v_ladder_ceiling', 'v_session_summary', 'v_activity_time', 'v_typing_by_grade',
    'v_typing_rounds_by_grade', 'v_probe_game_maker', 'v_probe_game_maker_by_grade',
    'v_probe_text', 'v_probe_text_by_grade'
  ] LOOP
    IF to_regclass('public.' || v) IS NULL THEN
      CONTINUE;
    END IF;
    def := rtrim(pg_get_viewdef(('public.' || v)::regclass, false), E'; \n');
    -- pg_get_viewdef prints keywords in upper case and names in lower case:
    -- an aliased table (`FROM events e`) keeps its alias; an unaliased one
    -- (`FROM events`, whose columns it prints as `events.type`) gets its own
    -- name as the alias, so those references still resolve.
    def := regexp_replace(def, '\m(FROM|JOIN)(\s+)(public\.)?(events|sessions)(\s+)([a-z_][a-z0-9_]*)\M', '\1\2real_\4\5\6', 'g');
    def := regexp_replace(def, '\m(FROM|JOIN)(\s+)(public\.)?(events|sessions)\M', '\1\2real_\4 \4', 'g');
    EXECUTE format('CREATE OR REPLACE VIEW %I AS %s', v, def);
  END LOOP;
END
$$;
