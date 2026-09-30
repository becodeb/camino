-- v_activity_time, redefined for free play (T5). A free-play activity is
-- more than its level pages (the doors page, the level editor, the
-- corkboard): free play logs one `activity_end` per visit with the whole
-- visit's `time_ms`, from the pick to leaving it. So an activity with
-- activity_end rows in a session counts those; any other activity (the tool
-- check, the ladder, the typing minigame…) keeps counting its level pages,
-- each level_end paired with the level_start before it (see 001_init.sql).
DROP VIEW IF EXISTS v_activity_time;
CREATE VIEW v_activity_time AS
WITH visits AS (
  SELECT session_id, payload->>'activity' AS activity, sum((payload->>'time_ms')::numeric) / 1000 AS seconds
  FROM events
  WHERE type = 'activity_end'
  GROUP BY session_id, payload->>'activity'
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
