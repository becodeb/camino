-- "Teclas del bosque" in rounds (T12, round 2 of the pilot).
--
-- The game is now three rounds, each with a goal (a garden bed of N holes),
-- harder on purpose round by round. Every `typing` key carries its `round`;
-- every round logs one `typing_round` {round, set, goal, filled, caught,
-- golden, completed, reason, time_ms, keys, correct, landed, pace_end};
-- `typing_end` adds rounds_done, filled and golden.
--
-- v_typing_by_grade, redefined: the columns of 003_typing.sql unchanged and
-- first, then how many sessions logged rounds, how many finished all three,
-- the median rounds finished and the golden seeds planted (from typing_end).
-- Round-1 sessions of the pilot (no rounds) still count in the old columns.
DROP VIEW IF EXISTS v_typing_by_grade;
CREATE VIEW v_typing_by_grade AS
WITH keys AS (
  SELECT
    s.grade,
    e.session_id,
    (e.payload->>'correct')::boolean AS correct,
    (e.payload->>'latency_ms')::numeric AS latency_ms,
    e.payload->>'input' AS input
  FROM events e
  JOIN sessions s ON s.id = e.session_id
  WHERE e.type = 'typing'
),
k AS (
  SELECT
    grade,
    count(*) AS attempts,
    count(*) FILTER (WHERE correct) AS correct_count,
    round(100.0 * count(*) FILTER (WHERE correct) / NULLIF(count(*), 0), 1) AS accuracy_pct,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS median_latency_ms,
    count(DISTINCT session_id) AS sessions,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE correct) AS median_correct_latency_ms,
    count(*) FILTER (WHERE input = 'touch') AS touch_attempts
  FROM keys
  GROUP BY grade
),
l AS (
  SELECT
    s.grade,
    count(*) FILTER (WHERE e.payload->>'answer' = 'yes') AS liked_yes,
    count(*) FILTER (WHERE e.payload->>'answer' = 'mid') AS liked_mid,
    count(*) FILTER (WHERE e.payload->>'answer' = 'no') AS liked_no
  FROM events e
  JOIN sessions s ON s.id = e.session_id
  WHERE e.type = 'survey_answer' AND e.payload->>'question' = 'typing_liked'
  GROUP BY s.grade
),
r AS (
  SELECT
    s.grade,
    count(DISTINCT e.session_id) FILTER (WHERE e.type = 'typing_round') AS rounds_sessions,
    count(*) FILTER (WHERE e.type = 'typing_end' AND (e.payload->>'rounds_done')::int >= 3) AS all_rounds_sessions,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY (e.payload->>'rounds_done')::numeric)
      FILTER (WHERE e.type = 'typing_end' AND e.payload ? 'rounds_done') AS median_rounds_done,
    COALESCE(sum((e.payload->>'golden')::int) FILTER (WHERE e.type = 'typing_end'), 0) AS golden_total
  FROM events e
  JOIN sessions s ON s.id = e.session_id
  WHERE e.type IN ('typing_round', 'typing_end')
  GROUP BY s.grade
)
SELECT
  COALESCE(k.grade, l.grade, r.grade) AS grade,
  COALESCE(k.attempts, 0) AS attempts,
  COALESCE(k.correct_count, 0) AS correct_count,
  k.accuracy_pct,
  k.median_latency_ms,
  COALESCE(k.sessions, 0) AS sessions,
  k.median_correct_latency_ms,
  COALESCE(k.touch_attempts, 0) AS touch_attempts,
  COALESCE(l.liked_yes, 0) AS liked_yes,
  COALESCE(l.liked_mid, 0) AS liked_mid,
  COALESCE(l.liked_no, 0) AS liked_no,
  COALESCE(r.rounds_sessions, 0) AS rounds_sessions,
  COALESCE(r.all_rounds_sessions, 0) AS all_rounds_sessions,
  r.median_rounds_done,
  COALESCE(r.golden_total, 0) AS golden_total
FROM k
FULL JOIN l ON l.grade = k.grade
FULL JOIN r ON r.grade = COALESCE(k.grade, l.grade)
ORDER BY 1;

-- v_typing_rounds_by_grade: one row per grade and round. From `typing_round`:
-- sessions that reached the round, how many filled its bed, the median time
-- and catches, the golden seeds; from the `typing` keys of that round:
-- attempts, right keys, accuracy and the median latency of the right keys.
CREATE OR REPLACE VIEW v_typing_rounds_by_grade AS
WITH rr AS (
  SELECT
    s.grade,
    (e.payload->>'round')::int AS round,
    e.session_id,
    (e.payload->>'completed')::boolean AS completed,
    (e.payload->>'time_ms')::numeric AS time_ms,
    (e.payload->>'caught')::numeric AS caught,
    COALESCE((e.payload->>'golden')::int, 0) AS golden
  FROM events e
  JOIN sessions s ON s.id = e.session_id
  WHERE e.type = 'typing_round'
),
kk AS (
  SELECT
    s.grade,
    (e.payload->>'round')::int AS round,
    count(*) AS attempts,
    count(*) FILTER (WHERE (e.payload->>'correct')::boolean) AS correct_count,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY (e.payload->>'latency_ms')::numeric)
      FILTER (WHERE (e.payload->>'correct')::boolean) AS median_correct_latency_ms
  FROM events e
  JOIN sessions s ON s.id = e.session_id
  WHERE e.type = 'typing' AND e.payload ? 'round'
  GROUP BY s.grade, (e.payload->>'round')::int
),
agg AS (
  SELECT
    grade,
    round,
    count(DISTINCT session_id) AS sessions,
    count(*) FILTER (WHERE completed) AS completed,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY time_ms) AS median_time_ms,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY time_ms) FILTER (WHERE completed) AS median_completed_time_ms,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY caught) AS median_caught,
    sum(golden) AS golden
  FROM rr
  GROUP BY grade, round
)
SELECT
  COALESCE(a.grade, kk.grade) AS grade,
  COALESCE(a.round, kk.round) AS round,
  COALESCE(a.sessions, 0) AS sessions,
  COALESCE(a.completed, 0) AS completed,
  a.median_time_ms,
  a.median_completed_time_ms,
  a.median_caught,
  COALESCE(a.golden, 0) AS golden,
  COALESCE(kk.attempts, 0) AS attempts,
  COALESCE(kk.correct_count, 0) AS correct_count,
  round(100.0 * kk.correct_count / NULLIF(kk.attempts, 0), 1) AS accuracy_pct,
  kk.median_correct_latency_ms
FROM agg a
FULL JOIN kk ON kk.grade = a.grade AND kk.round = a.round
ORDER BY 1, 2;
