-- "Hacé tu juego", the 4to probe (T7). Research question 8: can 4to build a
-- small game with rules, points, lives and messages in about 10 minutes,
-- and do they like it?
--
-- v_probe_game_maker: one row per session that opened the probe (its
-- free-play card, or the adult menu). Phases reached and completed
-- (`probe_phase`), the child's own rule edits by kind (`rule_edit` without
-- `ghost`, the help's hand building a rule: adds, removes, chip
-- changes, in phase 3, the bird added, broadcast blocks placed, win and
-- lose conditions set or changed), games played and how they ended
-- (`game_run`: wins, losses, games whose rules had a message sent and
-- heard, messages heard while playing), the Scratch predictions
-- (`scratch_predict`) and the liking answer (`survey_answer` {question:
-- 'game_maker_liked'}), the time in the probe (`probe_end`) and the last
-- game's rules as the child left them.
CREATE OR REPLACE VIEW v_probe_game_maker AS
WITH touched AS (
  SELECT DISTINCT session_id
  FROM events
  WHERE (type = 'choice' AND payload->>'activity' = 'game_maker')
     OR (type IN ('probe_phase', 'rule_edit', 'game_run', 'probe_end') AND payload->>'probe' = 'game_maker')
     OR type = 'scratch_predict'
     OR (type = 'survey_answer' AND payload->>'question' = 'game_maker_liked')
),
phases AS (
  SELECT
    session_id,
    count(*) AS phases_reached,
    count(*) FILTER (WHERE (payload->>'completed')::boolean) AS phases_completed,
    bool_or((payload->>'completed')::boolean) FILTER (WHERE payload->>'phase' = 'play') AS play_done,
    bool_or((payload->>'completed')::boolean) FILTER (WHERE payload->>'phase' = 'change') AS change_done,
    bool_or((payload->>'completed')::boolean) FILTER (WHERE payload->>'phase' = 'make') AS make_done,
    sum((payload->>'time_ms')::numeric) FILTER (WHERE payload->>'phase' = 'make') / 1000 AS make_seconds
  FROM events
  WHERE type = 'probe_phase' AND payload->>'probe' = 'game_maker'
  GROUP BY session_id
),
edits AS (
  SELECT
    session_id,
    count(*) AS rule_edits,
    count(*) FILTER (WHERE payload->>'op' = 'add') AS adds,
    count(*) FILTER (WHERE payload->>'op' = 'remove') AS removes,
    count(*) FILTER (WHERE payload->>'op' = 'change') AS changes,
    count(*) FILTER (WHERE payload->>'phase' = 'make') AS make_edits,
    bool_or(payload->>'object' = 'bird' AND payload->>'op' = 'add' AND payload->>'hat' IS NULL) AS bird_added,
    count(*) FILTER (WHERE payload->>'op' IN ('add', 'change') AND (payload->>'action' LIKE 'send:%' OR (payload->>'action' IS NULL AND payload->>'hat' LIKE 'recv:%'))) AS broadcast_edits,
    count(*) FILTER (WHERE payload->>'op' IN ('add', 'change') AND payload->>'hat' LIKE 'points:%' AND (payload->>'action' IS NULL OR payload->>'action' = 'win')) AS win_condition_edits,
    count(*) FILTER (WHERE payload->>'op' IN ('add', 'change') AND payload->>'hat' = 'lives0' AND (payload->>'action' IS NULL OR payload->>'action' = 'lose')) AS lose_condition_edits
  FROM events
  WHERE type = 'rule_edit' AND payload->>'probe' = 'game_maker' AND NOT COALESCE((payload->>'ghost')::boolean, false)
  GROUP BY session_id
),
runs AS (
  SELECT
    session_id,
    count(*) AS games_run,
    count(*) FILTER (WHERE (payload->>'keys')::int > 0) AS games_played,
    count(*) FILTER (WHERE payload->>'result' = 'win') AS wins,
    count(*) FILTER (WHERE payload->>'result' = 'lose') AS losses,
    count(*) FILTER (WHERE jsonb_array_length(COALESCE(payload->'broadcasts', '[]'::jsonb)) > 0) AS games_with_broadcast,
    COALESCE(sum((payload->>'messages_heard')::int), 0) AS messages_heard,
    bool_or(payload->>'phase' = 'make' AND payload->>'win_points' IS NOT NULL) AS make_game_can_win,
    (array_agg(payload->>'rules' ORDER BY seq DESC))[1] AS last_rules
  FROM events
  WHERE type = 'game_run' AND payload->>'probe' = 'game_maker'
  GROUP BY session_id
),
pred AS (
  SELECT
    session_id,
    count(*) AS predictions,
    count(*) FILTER (WHERE (payload->>'correct')::boolean) AS predictions_correct,
    string_agg((payload->>'item') || ':' || (payload->>'answer'), ',' ORDER BY seq) AS prediction_answers
  FROM events
  WHERE type = 'scratch_predict'
  GROUP BY session_id
),
liked AS (
  SELECT DISTINCT ON (session_id) session_id, payload->>'answer' AS liked
  FROM events
  WHERE type = 'survey_answer' AND payload->>'question' = 'game_maker_liked'
  ORDER BY session_id, seq DESC
),
ends AS (
  SELECT DISTINCT ON (session_id) session_id, payload->>'reason' AS end_reason, (payload->>'time_ms')::numeric / 1000 AS probe_seconds
  FROM events
  WHERE type = 'probe_end' AND payload->>'probe' = 'game_maker'
  ORDER BY session_id, seq DESC
)
SELECT
  s.id AS session_id,
  s.code,
  s.grade,
  s.division,
  COALESCE(p.phases_reached, 0) AS phases_reached,
  COALESCE(p.phases_completed, 0) AS phases_completed,
  COALESCE(p.play_done, false) AS play_done,
  COALESCE(p.change_done, false) AS change_done,
  COALESCE(p.make_done, false) AS make_done,
  p.make_seconds,
  COALESCE(e.rule_edits, 0) AS rule_edits,
  COALESCE(e.adds, 0) AS adds,
  COALESCE(e.removes, 0) AS removes,
  COALESCE(e.changes, 0) AS changes,
  COALESCE(e.make_edits, 0) AS make_edits,
  COALESCE(e.bird_added, false) AS bird_added,
  COALESCE(e.broadcast_edits, 0) AS broadcast_edits,
  COALESCE(e.win_condition_edits, 0) AS win_condition_edits,
  COALESCE(e.lose_condition_edits, 0) AS lose_condition_edits,
  COALESCE(r.games_run, 0) AS games_run,
  COALESCE(r.games_played, 0) AS games_played,
  COALESCE(r.wins, 0) AS wins,
  COALESCE(r.losses, 0) AS losses,
  COALESCE(r.games_with_broadcast, 0) AS games_with_broadcast,
  COALESCE(r.messages_heard, 0) AS messages_heard,
  COALESCE(r.make_game_can_win, false) AS make_game_can_win,
  COALESCE(pr.predictions, 0) AS predictions,
  COALESCE(pr.predictions_correct, 0) AS predictions_correct,
  pr.prediction_answers,
  l.liked,
  en.end_reason,
  en.probe_seconds,
  r.last_rules
FROM touched t
JOIN sessions s ON s.id = t.session_id
LEFT JOIN phases p ON p.session_id = t.session_id
LEFT JOIN edits e ON e.session_id = t.session_id
LEFT JOIN runs r ON r.session_id = t.session_id
LEFT JOIN pred pr ON pr.session_id = t.session_id
LEFT JOIN liked l ON l.session_id = t.session_id
LEFT JOIN ends en ON en.session_id = t.session_id;

-- v_probe_game_maker_by_grade: RQ 8 per grade at a glance.
CREATE OR REPLACE VIEW v_probe_game_maker_by_grade AS
SELECT
  grade,
  count(*) AS sessions,
  count(*) FILTER (WHERE play_done) AS play_done,
  count(*) FILTER (WHERE change_done) AS change_done,
  count(*) FILTER (WHERE make_done) AS make_done,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY rule_edits) AS median_rule_edits,
  count(*) FILTER (WHERE broadcast_edits > 0) AS used_broadcast,
  count(*) FILTER (WHERE messages_heard > 0) AS played_a_broadcast,
  count(*) FILTER (WHERE win_condition_edits > 0) AS set_win_condition,
  count(*) FILTER (WHERE bird_added) AS added_the_bird,
  sum(predictions_correct) AS predictions_correct,
  sum(predictions) AS predictions,
  count(*) FILTER (WHERE liked = 'yes') AS liked_yes,
  count(*) FILTER (WHERE liked = 'mid') AS liked_mid,
  count(*) FILTER (WHERE liked = 'no') AS liked_no
FROM v_probe_game_maker
GROUP BY grade
ORDER BY grade;
