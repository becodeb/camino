-- "Hacé tu juego" built step by step (T15). Research question 8: can 4to
-- build a small game with rules, points and lives, understanding what each
-- rule does, and do they like it?
--
-- The probe is now six steps (`probe_phase.phase`): `move` (the character
-- moves with the arrows), `stone` (the stone falls and comes back),
-- `seed_read` (read the seed's ready-made rules), `touch_rules` (a life lost,
-- a point won by touching), `win` (when the game is won), `free` (change
-- anything). Each build step ends completed alone (no ✋, the ghost built
-- nothing), completed with help (✋ used, or the ghost built its rules),
-- skipped ("seguir" after the wait; its rules are left built, logged as
-- `rule_edit` {ghost, filled}), or not reached. The Scratch column and the
-- Scratch predictions are gone (round 1's `scratch_predict` rows stay in the
-- events, not in these views).
--
-- The columns change, so both views are dropped and created again (CREATE OR
-- REPLACE cannot drop columns). Like every view since 008 they read only real
-- sessions (`real_events`, `real_sessions`). Round-1 sessions (phases
-- play/change/make) still get a row: their step columns are null.

DROP VIEW IF EXISTS v_probe_game_maker_by_grade;
DROP VIEW IF EXISTS v_probe_game_maker;

-- v_probe_game_maker: one row per session that opened the probe.
CREATE VIEW v_probe_game_maker AS
WITH touched AS (
  SELECT DISTINCT session_id
  FROM real_events
  WHERE (type = 'choice' AND payload->>'activity' = 'game_maker')
     OR (type IN ('probe_phase', 'rule_edit', 'game_run', 'probe_end') AND payload->>'probe' = 'game_maker')
     OR (type = 'survey_answer' AND payload->>'question' = 'game_maker_liked')
),
-- each step once (the last time it ended, if the probe was opened twice)
steps AS (
  SELECT DISTINCT ON (session_id, payload->>'phase')
    session_id,
    payload->>'phase' AS step,
    CASE
      WHEN payload->>'phase' = 'free' THEN 'ended'
      WHEN (payload->>'completed')::boolean
        AND COALESCE((payload->>'help_levels')::int, 0) = 0
        AND NOT COALESCE((payload->>'ghost_built')::boolean, false) THEN 'alone'
      WHEN (payload->>'completed')::boolean THEN 'help'
      ELSE 'skipped'
    END AS result,
    (payload->>'time_ms')::numeric / 1000 AS seconds
  FROM real_events
  WHERE type = 'probe_phase' AND payload->>'probe' = 'game_maker'
    AND payload->>'phase' IN ('move', 'stone', 'seed_read', 'touch_rules', 'win', 'free')
  ORDER BY session_id, payload->>'phase', seq DESC
),
per AS (
  SELECT
    session_id,
    count(*) FILTER (WHERE step <> 'free') AS steps_reached,
    count(*) FILTER (WHERE result = 'alone') AS steps_alone,
    count(*) FILTER (WHERE result = 'help') AS steps_with_help,
    count(*) FILTER (WHERE result = 'skipped') AS steps_skipped,
    max(result) FILTER (WHERE step = 'move') AS move_result,
    max(seconds) FILTER (WHERE step = 'move') AS move_seconds,
    max(result) FILTER (WHERE step = 'stone') AS stone_result,
    max(seconds) FILTER (WHERE step = 'stone') AS stone_seconds,
    max(result) FILTER (WHERE step = 'seed_read') AS seed_read_result,
    max(seconds) FILTER (WHERE step = 'seed_read') AS seed_read_seconds,
    max(result) FILTER (WHERE step = 'touch_rules') AS touch_rules_result,
    max(seconds) FILTER (WHERE step = 'touch_rules') AS touch_rules_seconds,
    max(result) FILTER (WHERE step = 'win') AS win_result,
    max(seconds) FILTER (WHERE step = 'win') AS win_seconds,
    bool_or(step = 'free') AS free_reached,
    max(seconds) FILTER (WHERE step = 'free') AS free_seconds
  FROM steps
  GROUP BY session_id
),
-- the child's own edits (the ghost's and a skip's left out)
edits AS (
  SELECT
    session_id,
    count(*) AS rule_edits,
    count(*) FILTER (WHERE payload->>'phase' = 'free') AS free_edits,
    count(*) FILTER (WHERE payload->>'phase' = 'free' AND payload->>'op' = 'add' AND payload->>'hat' IS NOT NULL AND payload->>'action' IS NULL) AS free_rules_added,
    count(*) FILTER (WHERE payload->>'phase' = 'free' AND payload->>'op' = 'add' AND payload->>'action' IS NOT NULL) AS free_actions_added,
    bool_or(payload->>'op' IN ('add', 'change') AND (payload->>'action' LIKE 'send:%' OR (payload->>'action' IS NULL AND payload->>'hat' LIKE 'recv:%'))) AS used_avisar,
    bool_or(payload->>'object' = 'bird' AND payload->>'op' = 'add' AND payload->>'hat' IS NULL) AS bird_added
  FROM real_events
  WHERE type = 'rule_edit' AND payload->>'probe' = 'game_maker' AND NOT COALESCE((payload->>'ghost')::boolean, false)
  GROUP BY session_id
),
runs AS (
  SELECT
    session_id,
    count(*) AS games_run,
    count(*) FILTER (WHERE (payload->>'keys')::int > 0) AS games_played,
    count(*) FILTER (WHERE payload->>'result' = 'win') AS games_won,
    count(*) FILTER (WHERE payload->>'result' = 'lose') AS games_lost,
    count(*) FILTER (WHERE payload->>'phase' = 'free') AS free_games,
    COALESCE(sum((payload->>'messages_heard')::int), 0) AS messages_heard,
    (array_agg(payload->>'rules' ORDER BY seq DESC))[1] AS last_rules
  FROM real_events
  WHERE type = 'game_run' AND payload->>'probe' = 'game_maker'
  GROUP BY session_id
),
liked AS (
  SELECT DISTINCT ON (session_id) session_id, payload->>'answer' AS liked
  FROM real_events
  WHERE type = 'survey_answer' AND payload->>'question' = 'game_maker_liked'
  ORDER BY session_id, seq DESC
),
ends AS (
  SELECT DISTINCT ON (session_id) session_id, payload->>'reason' AS end_reason, (payload->>'time_ms')::numeric / 1000 AS probe_seconds
  FROM real_events
  WHERE type = 'probe_end' AND payload->>'probe' = 'game_maker'
  ORDER BY session_id, seq DESC
)
SELECT
  s.id AS session_id,
  s.code,
  s.grade,
  s.division,
  COALESCE(p.steps_reached, 0) AS steps_reached,
  COALESCE(p.steps_alone, 0) AS steps_alone,
  COALESCE(p.steps_with_help, 0) AS steps_with_help,
  COALESCE(p.steps_skipped, 0) AS steps_skipped,
  p.move_result, p.move_seconds,
  p.stone_result, p.stone_seconds,
  p.seed_read_result, p.seed_read_seconds,
  p.touch_rules_result, p.touch_rules_seconds,
  p.win_result, p.win_seconds,
  COALESCE(p.free_reached, false) AS free_reached,
  p.free_seconds,
  COALESCE(e.rule_edits, 0) AS rule_edits,
  COALESCE(e.free_edits, 0) AS free_edits,
  COALESCE(e.free_rules_added, 0) AS free_rules_added,
  COALESCE(e.free_actions_added, 0) AS free_actions_added,
  COALESCE(e.used_avisar, false) AS used_avisar,
  COALESCE(e.bird_added, false) AS bird_added,
  COALESCE(r.games_run, 0) AS games_run,
  COALESCE(r.games_played, 0) AS games_played,
  COALESCE(r.games_won, 0) AS games_won,
  COALESCE(r.games_lost, 0) AS games_lost,
  COALESCE(r.free_games, 0) AS free_games,
  COALESCE(r.messages_heard, 0) AS messages_heard,
  l.liked,
  en.end_reason,
  en.probe_seconds,
  r.last_rules
FROM touched t
JOIN real_sessions s ON s.id = t.session_id
LEFT JOIN per p ON p.session_id = t.session_id
LEFT JOIN edits e ON e.session_id = t.session_id
LEFT JOIN runs r ON r.session_id = t.session_id
LEFT JOIN liked l ON l.session_id = t.session_id
LEFT JOIN ends en ON en.session_id = t.session_id;

-- v_probe_game_maker_by_grade: RQ 8 per grade at a glance. For each build
-- step: how many children did it alone, with help, or skipped it, and the
-- median seconds it took; then the free step and the liking.
CREATE VIEW v_probe_game_maker_by_grade AS
SELECT
  grade,
  count(*) AS sessions,
  count(*) FILTER (WHERE move_result = 'alone') AS move_alone,
  count(*) FILTER (WHERE move_result = 'help') AS move_help,
  count(*) FILTER (WHERE move_result = 'skipped') AS move_skipped,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY move_seconds) AS move_median_s,
  count(*) FILTER (WHERE stone_result = 'alone') AS stone_alone,
  count(*) FILTER (WHERE stone_result = 'help') AS stone_help,
  count(*) FILTER (WHERE stone_result = 'skipped') AS stone_skipped,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY stone_seconds) AS stone_median_s,
  count(*) FILTER (WHERE seed_read_result = 'alone') AS seed_read_alone,
  count(*) FILTER (WHERE seed_read_result = 'help') AS seed_read_help,
  count(*) FILTER (WHERE seed_read_result = 'skipped') AS seed_read_skipped,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY seed_read_seconds) AS seed_read_median_s,
  count(*) FILTER (WHERE touch_rules_result = 'alone') AS touch_rules_alone,
  count(*) FILTER (WHERE touch_rules_result = 'help') AS touch_rules_help,
  count(*) FILTER (WHERE touch_rules_result = 'skipped') AS touch_rules_skipped,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY touch_rules_seconds) AS touch_rules_median_s,
  count(*) FILTER (WHERE win_result = 'alone') AS win_alone,
  count(*) FILTER (WHERE win_result = 'help') AS win_help,
  count(*) FILTER (WHERE win_result = 'skipped') AS win_skipped,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY win_seconds) AS win_median_s,
  count(*) FILTER (WHERE free_reached) AS free_reached,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY free_seconds) AS free_median_s,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY free_rules_added) FILTER (WHERE free_reached) AS median_free_rules_added,
  count(*) FILTER (WHERE free_rules_added > 0 OR free_actions_added > 0) AS changed_in_free,
  count(*) FILTER (WHERE used_avisar) AS used_avisar,
  count(*) FILTER (WHERE bird_added) AS added_the_bird,
  count(*) FILTER (WHERE games_won > 0) AS won_a_game,
  count(*) FILTER (WHERE liked = 'yes') AS liked_yes,
  count(*) FILTER (WHERE liked = 'mid') AS liked_mid,
  count(*) FILTER (WHERE liked = 'no') AS liked_no
FROM v_probe_game_maker
GROUP BY grade
ORDER BY grade;
