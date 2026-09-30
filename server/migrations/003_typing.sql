-- The typing minigame "Teclas del bosque" (T6).
--
-- v_typing_by_grade, redefined: the original columns (attempts, correct
-- keys, accuracy, median latency from `typing` events) plus how many
-- sessions typed, the median latency of the right keys only, the keys
-- tapped on the drawn keyboard of a touch screen, and whether they liked it
-- (the `survey_answer` {question: 'typing_liked'} asked at the end of the
-- game: yes / mid / no counts).
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
)
SELECT
  COALESCE(k.grade, l.grade) AS grade,
  COALESCE(k.attempts, 0) AS attempts,
  COALESCE(k.correct_count, 0) AS correct_count,
  k.accuracy_pct,
  k.median_latency_ms,
  COALESCE(k.sessions, 0) AS sessions,
  k.median_correct_latency_ms,
  COALESCE(k.touch_attempts, 0) AS touch_attempts,
  COALESCE(l.liked_yes, 0) AS liked_yes,
  COALESCE(l.liked_mid, 0) AS liked_mid,
  COALESCE(l.liked_no, 0) AS liked_no
FROM k
FULL JOIN l ON l.grade = k.grade
ORDER BY 1;

-- v_activity_time, redefined: the typing minigame logs no level pages; its
-- one `typing_end` per session carries the whole game's `time_ms` (from the
-- step's first screen to its end, the intro included), counted like a
-- free-play visit. Everything else as in 002_activity_time.sql.
DROP VIEW IF EXISTS v_activity_time;
CREATE VIEW v_activity_time AS
WITH visits AS (
  SELECT session_id, payload->>'activity' AS activity, sum((payload->>'time_ms')::numeric) / 1000 AS seconds
  FROM events
  WHERE type = 'activity_end'
  GROUP BY session_id, payload->>'activity'
  UNION ALL
  SELECT session_id, 'typing' AS activity, sum((payload->>'time_ms')::numeric) / 1000 AS seconds
  FROM events
  WHERE type = 'typing_end'
  GROUP BY session_id
),
marked AS (
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
),
pages AS (
  SELECT
    m.session_id,
    COALESCE(m.payload->>'activity', s.start_activity) AS activity,
    sum(EXTRACT(EPOCH FROM (m.client_t - s.start_t))) AS seconds
  FROM marked m
  JOIN starts s ON s.session_id = m.session_id AND s.grp = m.grp
  WHERE m.type = 'level_end'
  GROUP BY m.session_id, COALESCE(m.payload->>'activity', s.start_activity)
)
SELECT session_id, activity, seconds FROM visits
UNION ALL
SELECT p.session_id, p.activity, p.seconds
FROM pages p
WHERE NOT EXISTS (SELECT 1 FROM visits v WHERE v.session_id = p.session_id AND v.activity = p.activity);
