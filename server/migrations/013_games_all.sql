-- T37: a third class command, "Juegos para todos" (`games_all`), next to
-- "Quedan 5 minutos" (`five_min`) and "Terminar la clase" (`end_class`):
-- opens the free-play games zone on every device still on the core route
-- (tool check, ladder, typing, wardrobe), for the last minutes of class, so
-- a slow child also gets to play before the bell. Delivery is identical to
-- the other commands (a class_commands row, handed out by /api/sync); it is
-- cancellable like `five_min` while still pending.
--
-- Widens the kind CHECK constraint added by 008_class_control.sql. Runs
-- once (tracked in schema_migrations), but DROP CONSTRAINT IF EXISTS keeps
-- it safe to run by hand too.
ALTER TABLE class_commands DROP CONSTRAINT IF EXISTS class_commands_kind_check;
ALTER TABLE class_commands ADD CONSTRAINT class_commands_kind_check
  CHECK (kind IN ('five_min', 'end_class', 'games_all'));
