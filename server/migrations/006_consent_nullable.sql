-- Round 2 (2026-10-01): the setup no longer asks the adult for a consent
-- tick (the school's authorization is kept outside the app, and nothing in
-- the data names a child). New sessions write `consent` as NULL; sessions
-- recorded before keep their `true`. Idempotent: DROP NOT NULL and DROP
-- DEFAULT do nothing when already dropped.
ALTER TABLE sessions ALTER COLUMN consent DROP NOT NULL;
ALTER TABLE sessions ALTER COLUMN consent DROP DEFAULT;
