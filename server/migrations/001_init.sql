-- Pilot playtest schema: anonymous sessions and their events.
-- Everything here must stay idempotent-safe to re-run (the migration runner
-- only runs a file once per schema_migrations row, but CREATE ... IF NOT
-- EXISTS / OR REPLACE keeps a manual re-run harmless too).

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  code text NOT NULL,
  grade smallint NOT NULL CHECK (grade BETWEEN 1 AND 5),
  division text CHECK (division IS NULL OR division ~ '^[A-Za-z]$'),
  consent boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  end_reason text,
  app_version text,
  device jsonb NOT NULL DEFAULT '{}'::jsonb,
  survey jsonb,
  adult_form jsonb,
  current_step text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq integer NOT NULL CHECK (seq >= 0),
  client_t timestamptz NOT NULL,
  server_t timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (session_id, seq)
);

CREATE INDEX IF NOT EXISTS events_type_idx ON events (type);
CREATE INDEX IF NOT EXISTS events_session_client_t_idx ON events (session_id, client_t);

-- Highest concept rung passed per (session, concept), from ladder_step
-- events whose payload is {concept, rung (int), item, result: 'pass'|'fail'|'floor', next}.
-- Defined before v_session_summary, which reads from it.
CREATE OR REPLACE VIEW v_ladder_ceiling AS
SELECT
  session_id,
  payload->>'concept' AS concept,
  max((payload->>'rung')::int) AS rung
FROM events
WHERE type = 'ladder_step' AND payload->>'result' = 'pass'
GROUP BY session_id, payload->>'concept';

-- Per-session summary: duration, per-type event counts, levels won, ladder
-- ceiling (highest concept rung passed), adult-call and adult-help counts.
CREATE OR REPLACE VIEW v_session_summary AS
SELECT
  s.id AS session_id,
  s.code,
  s.grade,
  s.division,
  s.started_at,
  s.ended_at,
  s.last_seen_at,
  s.current_step,
  s.end_reason,
  EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_seen_at) - s.started_at)) AS duration_seconds,
  (SELECT COALESCE(jsonb_object_agg(t.type, t.n), '{}'::jsonb)
     FROM (SELECT type, count(*) AS n FROM events e WHERE e.session_id = s.id GROUP BY type) t
  ) AS event_counts,
  (SELECT count(*) FROM events e WHERE e.session_id = s.id AND e.type = 'level_end' AND e.payload->>'outcome' = 'win') AS levels_won,
  (SELECT count(*) FROM events e WHERE e.session_id = s.id AND e.type = 'call_adult') AS calls_to_adult,
  (SELECT count(*) FROM events e WHERE e.session_id = s.id AND e.type = 'adult_help') AS adult_helps,
  (SELECT max(l.rung) FROM v_ladder_ceiling l WHERE l.session_id = s.id) AS ladder_ceiling_rung
FROM sessions s;

-- Time spent per free-play activity: pairs each level_end with the nearest
-- preceding level_start in the same session (by seq) and sums client-side
-- elapsed time. Postgres does not support FILTER on a non-aggregate window
-- function such as lag(), so instead each row is tagged with the running
-- count of level_start events seen so far in the session ("grp"); a
-- level_end always shares its grp with the level_start that opened it (a
-- child never has two levels open at once in this app), and the two are
-- joined back together on that grp.
CREATE OR REPLACE VIEW v_activity_time AS
WITH marked AS (
  SELECT
    session_id,
    seq,
    type,
    client_t,
    payload,
    sum(CASE WHEN type = 'level_start' THEN 1 ELSE 0 END) OVER (PARTITION BY session_id ORDER BY seq) AS grp
  FROM events
  WHERE type IN ('level_start', 'level_end')
),
starts AS (
  SELECT session_id, grp, client_t AS start_t, payload->>'activity' AS start_activity
  FROM marked
  WHERE type = 'level_start'
)
SELECT
  m.session_id,
  COALESCE(m.payload->>'activity', s.start_activity) AS activity,
  sum(EXTRACT(EPOCH FROM (m.client_t - s.start_t))) AS seconds
FROM marked m
JOIN starts s ON s.session_id = m.session_id AND s.grp = m.grp
WHERE m.type = 'level_end'
GROUP BY m.session_id, COALESCE(m.payload->>'activity', s.start_activity);

-- Typing minigame accuracy and median latency by grade, from typing events
-- {key, expected, correct (bool), latency_ms}.
CREATE OR REPLACE VIEW v_typing_by_grade AS
SELECT
  s.grade,
  count(*) AS attempts,
  count(*) FILTER (WHERE (e.payload->>'correct')::boolean) AS correct_count,
  round(100.0 * count(*) FILTER (WHERE (e.payload->>'correct')::boolean) / NULLIF(count(*), 0), 1) AS accuracy_pct,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY (e.payload->>'latency_ms')::numeric) AS median_latency_ms
FROM events e
JOIN sessions s ON s.id = e.session_id
WHERE e.type = 'typing'
GROUP BY s.grade
ORDER BY s.grade;
