-- "Del bloque al texto" rebuilt from zero for 5to (T16). Research question
-- 8: how well does a child who knows blocks but never wrote code understand
-- the text version of a block program?
--
-- The probe is now six steps, one idea each (`probe_phase.phase`): `move`
-- (a move block is a line), `seq` (several lines, top to bottom), `repeat`
-- (repetir is `for`), `typo` (fix one slip), `if` (si is `if`), `write` (the
-- optional stretch: write one line). Each step shows the blocks and their
-- text first, then one small task (`text_item.item`: `move_pick`,
-- `seq_word`, `repeat_number`, `typo_fix`, `if_predict`, `write_line`). A
-- step ends done alone (no ✋, the ghost did nothing), done with help (✋,
-- or the ghost did it), skipped ("seguir" after the wait), or not reached.
-- `first_try` says whether the task was right at the first attempt (the
-- first pick, the first run).
--
-- The columns change, so both views are dropped and created again. Like
-- every view since 008 they read only real sessions (`real_events`,
-- `real_sessions`). Round-1 sessions (T8's tour and items) still get a row:
-- their step columns are null.

DROP VIEW IF EXISTS v_probe_text_by_grade;
DROP VIEW IF EXISTS v_probe_text;

-- v_probe_text: one row per session that opened the probe.
CREATE VIEW v_probe_text AS
WITH touched AS (
  SELECT DISTINCT session_id
  FROM real_events
  WHERE (type = 'choice' AND payload->>'activity' = 'text_probe')
     OR (type IN ('probe_phase', 'probe_end') AND payload->>'probe' = 'text')
     OR type IN ('text_item', 'text_run')
     OR (type = 'survey_answer' AND payload->>'question' = 'text_probe_liked')
),
-- each step once (the last time it ended, if the probe was opened twice)
steps AS (
  SELECT DISTINCT ON (session_id, payload->>'phase')
    session_id,
    payload->>'phase' AS step,
    CASE
      WHEN (payload->>'completed')::boolean
        AND COALESCE((payload->>'help_levels')::int, 0) = 0
        AND NOT COALESCE((payload->>'ghost')::boolean, false) THEN 'alone'
      WHEN (payload->>'completed')::boolean THEN 'help'
      ELSE 'skipped'
    END AS result,
    (payload->>'time_ms')::numeric / 1000 AS seconds,
    COALESCE((payload->>'teach_runs')::int, 0) AS teach_runs,
    COALESCE((payload->>'links')::int, 0) AS links
  FROM real_events
  WHERE type = 'probe_phase' AND payload->>'probe' = 'text'
    AND payload->>'phase' IN ('move', 'seq', 'repeat', 'typo', 'if', 'write')
  ORDER BY session_id, payload->>'phase', seq DESC
),
per AS (
  SELECT
    session_id,
    count(*) FILTER (WHERE step <> 'write') AS steps_reached,
    count(*) FILTER (WHERE result = 'alone' AND step <> 'write') AS steps_alone,
    count(*) FILTER (WHERE result = 'help' AND step <> 'write') AS steps_with_help,
    count(*) FILTER (WHERE result = 'skipped' AND step <> 'write') AS steps_skipped,
    max(result) FILTER (WHERE step = 'move') AS move_result,
    max(seconds) FILTER (WHERE step = 'move') AS move_seconds,
    max(result) FILTER (WHERE step = 'seq') AS seq_result,
    max(seconds) FILTER (WHERE step = 'seq') AS seq_seconds,
    max(result) FILTER (WHERE step = 'repeat') AS repeat_result,
    max(seconds) FILTER (WHERE step = 'repeat') AS repeat_seconds,
    max(result) FILTER (WHERE step = 'typo') AS typo_result,
    max(seconds) FILTER (WHERE step = 'typo') AS typo_seconds,
    max(result) FILTER (WHERE step = 'if') AS if_result,
    max(seconds) FILTER (WHERE step = 'if') AS if_seconds,
    max(result) FILTER (WHERE step = 'write') AS write_result,
    max(seconds) FILTER (WHERE step = 'write') AS write_seconds,
    sum(teach_runs) AS teach_runs,
    sum(links) AS links
  FROM steps
  GROUP BY session_id
),
-- each task once (its last row)
tasks AS (
  SELECT DISTINCT ON (session_id, payload->>'item')
    session_id,
    payload->>'step' AS step,
    COALESCE((payload->>'first_try')::boolean, false) AS first_try,
    COALESCE((payload->>'correct')::boolean, false) AS correct,
    payload->>'answer' AS answer,
    payload->>'text' AS text
  FROM real_events
  WHERE type = 'text_item' AND payload ? 'step'
  ORDER BY session_id, payload->>'item', seq DESC
),
task_per AS (
  SELECT
    session_id,
    count(*) FILTER (WHERE correct) AS tasks_correct,
    count(*) FILTER (WHERE first_try) AS tasks_first_try,
    bool_or(first_try) FILTER (WHERE step = 'move') AS move_first_try,
    bool_or(first_try) FILTER (WHERE step = 'seq') AS seq_first_try,
    bool_or(first_try) FILTER (WHERE step = 'repeat') AS repeat_first_try,
    bool_or(first_try) FILTER (WHERE step = 'typo') AS typo_first_try,
    bool_or(first_try) FILTER (WHERE step = 'if') AS if_first_try,
    max(answer) FILTER (WHERE step = 'move') AS move_answer,
    max(answer) FILTER (WHERE step = 'if') AS if_answer,
    max(text) FILTER (WHERE step = 'write') AS write_text
  FROM tasks
  GROUP BY session_id
),
-- the tasks' runs (the teaching screens' runs are counted in teach_runs)
runs AS (
  SELECT
    session_id,
    count(*) AS runs,
    count(*) FILTER (WHERE (payload->>'ok')::boolean) AS runs_parsed,
    count(*) FILTER (WHERE payload->>'result' = 'win') AS runs_won,
    count(*) FILTER (WHERE NOT (payload->>'ok')::boolean) AS parse_errors,
    string_agg(DISTINCT payload->>'error_kind', ',' ORDER BY payload->>'error_kind') AS error_kinds
  FROM real_events
  WHERE type = 'text_run' AND payload->>'item' NOT LIKE '%\_teach' AND payload->>'item' <> 'tour'
  GROUP BY session_id
),
liked AS (
  SELECT DISTINCT ON (session_id) session_id, payload->>'answer' AS liked
  FROM real_events
  WHERE type = 'survey_answer' AND payload->>'question' = 'text_probe_liked'
  ORDER BY session_id, seq DESC
),
ends AS (
  SELECT DISTINCT ON (session_id) session_id, payload->>'reason' AS end_reason, (payload->>'time_ms')::numeric / 1000 AS probe_seconds
  FROM real_events
  WHERE type = 'probe_end' AND payload->>'probe' = 'text'
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
  p.move_result, p.move_seconds, tp.move_first_try, tp.move_answer,
  p.seq_result, p.seq_seconds, tp.seq_first_try,
  p.repeat_result, p.repeat_seconds, tp.repeat_first_try,
  p.typo_result, p.typo_seconds, tp.typo_first_try,
  p.if_result, p.if_seconds, tp.if_first_try, tp.if_answer,
  p.write_result, p.write_seconds, tp.write_text,
  COALESCE(tp.tasks_correct, 0) AS tasks_correct,
  COALESCE(tp.tasks_first_try, 0) AS tasks_first_try,
  COALESCE(p.teach_runs, 0) AS teach_runs,
  COALESCE(p.links, 0) AS links,
  COALESCE(r.runs, 0) AS runs,
  COALESCE(r.runs_parsed, 0) AS runs_parsed,
  COALESCE(r.runs_won, 0) AS runs_won,
  COALESCE(r.parse_errors, 0) AS parse_errors,
  r.error_kinds,
  l.liked,
  en.end_reason,
  en.probe_seconds
FROM touched t
JOIN real_sessions s ON s.id = t.session_id
LEFT JOIN per p ON p.session_id = t.session_id
LEFT JOIN task_per tp ON tp.session_id = t.session_id
LEFT JOIN runs r ON r.session_id = t.session_id
LEFT JOIN liked l ON l.session_id = t.session_id
LEFT JOIN ends en ON en.session_id = t.session_id;

-- v_probe_text_by_grade: RQ 8 per grade at a glance. For each idea: how many
-- children did it alone, with help, or skipped it, the median seconds, and
-- how many were right at the first try; the stretch; the liking.
CREATE VIEW v_probe_text_by_grade AS
SELECT
  grade,
  count(*) AS sessions,
  count(*) FILTER (WHERE move_result = 'alone') AS move_alone,
  count(*) FILTER (WHERE move_result = 'help') AS move_help,
  count(*) FILTER (WHERE move_result = 'skipped') AS move_skipped,
  count(*) FILTER (WHERE move_first_try) AS move_first_try,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY move_seconds) AS move_median_s,
  count(*) FILTER (WHERE seq_result = 'alone') AS seq_alone,
  count(*) FILTER (WHERE seq_result = 'help') AS seq_help,
  count(*) FILTER (WHERE seq_result = 'skipped') AS seq_skipped,
  count(*) FILTER (WHERE seq_first_try) AS seq_first_try,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY seq_seconds) AS seq_median_s,
  count(*) FILTER (WHERE repeat_result = 'alone') AS repeat_alone,
  count(*) FILTER (WHERE repeat_result = 'help') AS repeat_help,
  count(*) FILTER (WHERE repeat_result = 'skipped') AS repeat_skipped,
  count(*) FILTER (WHERE repeat_first_try) AS repeat_first_try,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY repeat_seconds) AS repeat_median_s,
  count(*) FILTER (WHERE typo_result = 'alone') AS typo_alone,
  count(*) FILTER (WHERE typo_result = 'help') AS typo_help,
  count(*) FILTER (WHERE typo_result = 'skipped') AS typo_skipped,
  count(*) FILTER (WHERE typo_first_try) AS typo_first_try,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY typo_seconds) AS typo_median_s,
  count(*) FILTER (WHERE if_result = 'alone') AS if_alone,
  count(*) FILTER (WHERE if_result = 'help') AS if_help,
  count(*) FILTER (WHERE if_result = 'skipped') AS if_skipped,
  count(*) FILTER (WHERE if_first_try) AS if_first_try,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY if_seconds) AS if_median_s,
  count(*) FILTER (WHERE write_result IS NOT NULL) AS write_reached,
  count(*) FILTER (WHERE write_result = 'alone') AS write_alone,
  count(*) FILTER (WHERE write_result = 'help') AS write_help,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY steps_alone) FILTER (WHERE steps_reached > 0) AS median_steps_alone,
  sum(parse_errors) AS parse_errors,
  count(*) FILTER (WHERE liked = 'yes') AS liked_yes,
  count(*) FILTER (WHERE liked = 'mid') AS liked_mid,
  count(*) FILTER (WHERE liked = 'no') AS liked_no
FROM v_probe_text
GROUP BY grade
ORDER BY grade;
