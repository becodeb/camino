-- "La carrera" (T33): a free-play activity for 1ro and 2do, a kart race
-- against two critters built with arrow blocks.
--
-- Events: `race_start` {race_no, tier, seed, stretches, roads, turbo_stretches,
-- rivals, again?}, `race_stretch` {race_no, stretch, road, length,
-- turbo_offered, used_repeat, blocks_placed, wrong_blocks, removed, sources
-- {tap, drag, key}, ms, completed} and `race_end` {race_no, tier, seed,
-- reason, ms, play_ms, stretches, stretches_done, blocks_placed, wrong_total,
-- removed, turbo_offered, turbo_used, sources, margin_ms, help_levels,
-- adult_helped, cups} (docs/prueba-piloto-datos.md).
--
-- Two views, on real sessions only (real_events/real_sessions, 008):
-- v_race_by_grade (one row per grade: who raced, how often, voluntary
-- "¡Otra carrera!", time per race and per stretch, wrong blocks, turbo use,
-- how blocks were placed) and v_race_stretches_by_tier (one row per grade
-- and tier: time per stretch, wrong blocks, and whether the repeat was
-- chosen when it paid). Idempotent: views only.

DROP VIEW IF EXISTS v_race_by_grade;
CREATE VIEW v_race_by_grade AS
WITH starts AS (
  SELECT s.grade, e.session_id, e.payload AS p
  FROM real_events e
  JOIN real_sessions s ON s.id = e.session_id
  WHERE e.type = 'race_start'
),
per_session AS (
  SELECT grade, session_id, count(*) AS races
  FROM starts
  GROUP BY grade, session_id
),
a AS (
  SELECT
    st.grade,
    count(DISTINCT st.session_id) AS sessions,
    count(*) AS races_started,
    count(*) FILTER (WHERE (st.p->>'again')::boolean) AS again_races,
    max((st.p->>'tier')::int) AS max_tier
  FROM starts st
  GROUP BY st.grade
),
b AS (
  SELECT grade, percentile_cont(0.5) WITHIN GROUP (ORDER BY races) AS median_races_per_session
  FROM per_session
  GROUP BY grade
),
ends AS (
  SELECT
    s.grade,
    count(*) FILTER (WHERE e.payload->>'reason' = 'finished') AS races_finished,
    count(*) FILTER (WHERE e.payload->>'reason' = 'left') AS races_left,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY (e.payload->>'ms')::numeric)
      FILTER (WHERE e.payload->>'reason' = 'finished') AS median_race_ms,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY (e.payload->>'wrong_total')::numeric)
      FILTER (WHERE e.payload->>'reason' = 'finished') AS median_wrong_per_race,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY (e.payload->>'margin_ms')::numeric)
      FILTER (WHERE e.payload->>'reason' = 'finished' AND e.payload->>'margin_ms' IS NOT NULL) AS median_margin_ms,
    count(*) FILTER (WHERE (e.payload->>'help_levels')::int > 0) AS races_with_help
  FROM real_events e
  JOIN real_sessions s ON s.id = e.session_id
  WHERE e.type = 'race_end'
  GROUP BY s.grade
),
stretches AS (
  SELECT
    s.grade,
    count(*) FILTER (WHERE COALESCE((e.payload->>'completed')::boolean, true)) AS stretches_done,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY (e.payload->>'ms')::numeric)
      FILTER (WHERE COALESCE((e.payload->>'completed')::boolean, true)) AS median_stretch_ms,
    COALESCE(sum((e.payload->>'wrong_blocks')::int), 0) AS wrong_blocks,
    count(*) FILTER (WHERE (e.payload->>'turbo_offered')::boolean AND COALESCE((e.payload->>'completed')::boolean, true)) AS turbo_offered,
    count(*) FILTER (WHERE (e.payload->>'turbo_offered')::boolean AND (e.payload->>'used_repeat')::boolean) AS turbo_used,
    COALESCE(sum((e.payload->'sources'->>'tap')::int), 0) AS placed_tap,
    COALESCE(sum((e.payload->'sources'->>'drag')::int), 0) AS placed_drag,
    COALESCE(sum((e.payload->'sources'->>'key')::int), 0) AS placed_key
  FROM real_events e
  JOIN real_sessions s ON s.id = e.session_id
  WHERE e.type = 'race_stretch'
  GROUP BY s.grade
)
SELECT
  a.grade,
  a.sessions,
  a.races_started,
  a.again_races,
  b.median_races_per_session,
  a.max_tier,
  COALESCE(ends.races_finished, 0) AS races_finished,
  COALESCE(ends.races_left, 0) AS races_left,
  ends.median_race_ms,
  ends.median_wrong_per_race,
  ends.median_margin_ms,
  COALESCE(ends.races_with_help, 0) AS races_with_help,
  COALESCE(stretches.stretches_done, 0) AS stretches_done,
  stretches.median_stretch_ms,
  COALESCE(stretches.wrong_blocks, 0) AS wrong_blocks,
  COALESCE(stretches.turbo_offered, 0) AS turbo_offered,
  COALESCE(stretches.turbo_used, 0) AS turbo_used,
  round(100.0 * stretches.turbo_used / NULLIF(stretches.turbo_offered, 0), 1) AS turbo_use_pct,
  COALESCE(stretches.placed_tap, 0) AS placed_tap,
  COALESCE(stretches.placed_drag, 0) AS placed_drag,
  COALESCE(stretches.placed_key, 0) AS placed_key
FROM a
JOIN b ON b.grade = a.grade
LEFT JOIN ends ON ends.grade = a.grade
LEFT JOIN stretches ON stretches.grade = a.grade;

DROP VIEW IF EXISTS v_race_stretches_by_tier;
CREATE VIEW v_race_stretches_by_tier AS
WITH starts AS (
  SELECT e.session_id, (e.payload->>'race_no')::int AS race_no, (e.payload->>'tier')::int AS tier
  FROM real_events e
  WHERE e.type = 'race_start'
),
st AS (
  SELECT s.grade, r.tier, e.payload AS p
  FROM real_events e
  JOIN real_sessions s ON s.id = e.session_id
  JOIN starts r ON r.session_id = e.session_id AND r.race_no = (e.payload->>'race_no')::int
  WHERE e.type = 'race_stretch'
)
SELECT
  grade,
  tier,
  count(*) FILTER (WHERE COALESCE((p->>'completed')::boolean, true)) AS stretches_done,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY (p->>'ms')::numeric)
    FILTER (WHERE COALESCE((p->>'completed')::boolean, true)) AS median_stretch_ms,
  round(avg((p->>'wrong_blocks')::numeric), 2) AS avg_wrong_per_stretch,
  count(*) FILTER (WHERE (p->>'wrong_blocks')::int = 0 AND COALESCE((p->>'completed')::boolean, true)) AS stretches_without_wrong,
  count(*) FILTER (WHERE (p->>'turbo_offered')::boolean AND COALESCE((p->>'completed')::boolean, true)) AS turbo_offered,
  count(*) FILTER (WHERE (p->>'turbo_offered')::boolean AND (p->>'used_repeat')::boolean) AS turbo_used,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY (p->>'ms')::numeric)
    FILTER (WHERE (p->>'turbo_offered')::boolean AND (p->>'used_repeat')::boolean) AS median_turbo_stretch_ms,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY (p->>'ms')::numeric)
    FILTER (WHERE (p->>'turbo_offered')::boolean AND NOT (p->>'used_repeat')::boolean AND COALESCE((p->>'completed')::boolean, true)) AS median_turbo_by_hand_ms
FROM st
GROUP BY grade, tier;
