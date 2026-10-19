-- T38: the child's first name (4to/5to by default, optional for any grade
-- via `?nombre=si`), typed once on its own screen before the character
-- choice. Stored only when given; a session with no name keeps this NULL
-- (round 1-3 of this pilot, and every other session where the name screen
-- is off). With a name the session is no longer anonymous — see the
-- "Anonymous by design" note in docs/prueba-piloto-datos.md. Same
-- retention as the rest of the row (RETENTION_DAYS).
--
-- `real_sessions` (008_class_control.sql) is `SELECT * FROM sessions WHERE
-- NOT demo`, but Postgres expands `*` into an explicit column list at
-- CREATE VIEW time, so the view does NOT pick up a column added to the
-- table afterwards on its own (found while verifying this migration against
-- a real Postgres — the export route 500'd on `real_sessions.child_name
-- does not exist`). CREATE OR REPLACE VIEW refreshes it; child_name is the
-- table's last column (ALTER TABLE ADD COLUMN always appends), so the new
-- view's column list is still a superset in the same order, as CREATE OR
-- REPLACE VIEW requires. Every view built on `real_sessions` (an alias, not
-- a `SELECT *`) is unaffected and needs no change.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS child_name text;

CREATE OR REPLACE VIEW real_sessions AS
SELECT * FROM sessions WHERE NOT demo;
