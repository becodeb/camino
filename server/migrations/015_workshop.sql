-- The Game Workshop (T40): 4to's Scratch-like editor and its game "Al
-- revés", built through PRIMM challenges (1–7, then free ones 8–13).
--
-- Events (docs/prueba-piloto-datos.md): `workshop_challenge` {n, phase:
-- start|predict|investigate|solved|skipped, attempts, help_level, runs, ms,
-- free?, predict_choice?, predict_correct?, investigate_block?,
-- investigate_correct?}, `workshop_edit` (batched counts per challenge),
-- `workshop_run` {n, ms_played, result, lives, points, check, why?},
-- `workshop_end` {challenges_solved, challenges_skipped, free_challenges,
-- current, arcade, best, ms}.
--
-- Two views on real sessions only (real_events/real_sessions, 008):
-- v_workshop_challenges (one row per session and challenge: how it went —
-- the predict and investigate answers, solved or skipped, failed checks,
-- help, runs, time; the base of T42's "understands vs copies" signal) and
-- v_workshop_by_grade (one row per grade). Idempotent: views only.

DROP VIEW IF EXISTS v_workshop_by_grade;
DROP VIEW IF EXISTS v_workshop_challenges;

CREATE VIEW v_workshop_challenges AS
WITH c AS (
  SELECT e.session_id, s.grade, s.child_name, (e.payload->>'n')::int AS n, e.payload AS p, e.payload->>'phase' AS phase
  FROM real_events e
  JOIN real_sessions s ON s.id = e.session_id
  WHERE e.type = 'workshop_challenge'
)
SELECT
  session_id,
  grade,
  child_name,
  n,
  bool_or(COALESCE((p->>'free')::boolean, false)) AS free,
  bool_or(phase = 'start') AS started,
  max(p->>'predict_choice') FILTER (WHERE phase = 'predict') AS predict_choice,
  bool_or((p->>'predict_correct')::boolean) FILTER (WHERE phase = 'predict') AS predict_correct,
  max(p->>'investigate_block') FILTER (WHERE phase = 'investigate') AS investigate_block,
  bool_or((p->>'investigate_correct')::boolean) FILTER (WHERE phase = 'investigate') AS investigate_correct,
  CASE WHEN bool_or(phase = 'solved') THEN 'solved' WHEN bool_or(phase = 'skipped') THEN 'skipped' END AS outcome,
  max((p->>'attempts')::int) AS attempts,
  max((p->>'help_level')::int) AS help_level,
  max((p->>'runs')::int) AS runs,
  max((p->>'ms')::numeric) FILTER (WHERE phase IN ('solved', 'skipped')) AS ms
FROM c
GROUP BY session_id, grade, child_name, n;

CREATE VIEW v_workshop_by_grade AS
WITH ch AS (SELECT * FROM v_workshop_challenges),
per AS (
  SELECT
    grade, session_id,
    count(*) FILTER (WHERE NOT free AND outcome = 'solved') AS core_solved,
    count(*) FILTER (WHERE NOT free AND outcome = 'solved' AND COALESCE(help_level, 0) = 0) AS core_alone,
    count(*) FILTER (WHERE NOT free AND outcome = 'skipped') AS core_skipped,
    count(*) FILTER (WHERE free AND outcome = 'solved') AS free_solved,
    bool_or(NOT free AND n = 5 AND outcome IS NOT NULL) AS arcade
  FROM ch
  GROUP BY grade, session_id
),
answers AS (
  SELECT
    grade,
    count(*) FILTER (WHERE predict_correct IS NOT NULL) AS predicted,
    count(*) FILTER (WHERE predict_correct) AS predicted_right,
    count(*) FILTER (WHERE investigate_correct IS NOT NULL) AS investigated,
    count(*) FILTER (WHERE investigate_correct) AS investigated_right,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE NOT free AND outcome = 'solved') AS median_challenge_ms,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY runs) FILTER (WHERE NOT free AND outcome = 'solved') AS median_runs_per_challenge
  FROM ch
  GROUP BY grade
),
runs AS (
  SELECT s.grade, count(*) AS runs, count(*) FILTER (WHERE e.payload->>'result' = 'won') AS runs_won, count(*) FILTER (WHERE e.payload->>'result' = 'lost') AS runs_lost
  FROM real_events e
  JOIN real_sessions s ON s.id = e.session_id
  WHERE e.type = 'workshop_run'
  GROUP BY s.grade
),
edits AS (
  SELECT s.grade, COALESCE(sum((e.payload->>'edits')::int), 0) AS edits
  FROM real_events e
  JOIN real_sessions s ON s.id = e.session_id
  WHERE e.type = 'workshop_edit'
  GROUP BY s.grade
)
SELECT
  per.grade,
  count(*) AS sessions,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY per.core_solved) AS median_core_solved,
  max(per.core_solved) AS max_core_solved,
  sum(per.core_alone) AS core_solved_without_help,
  sum(per.core_skipped) AS core_skipped,
  sum(per.free_solved) AS free_solved,
  count(*) FILTER (WHERE per.arcade) AS arcade_sessions,
  max(answers.predicted) AS predicted,
  max(answers.predicted_right) AS predicted_right,
  max(answers.investigated) AS investigated,
  max(answers.investigated_right) AS investigated_right,
  max(answers.median_challenge_ms) AS median_challenge_ms,
  max(answers.median_runs_per_challenge) AS median_runs_per_challenge,
  COALESCE(max(runs.runs), 0) AS runs,
  COALESCE(max(runs.runs_won), 0) AS runs_won,
  COALESCE(max(runs.runs_lost), 0) AS runs_lost,
  COALESCE(max(edits.edits), 0) AS edits
FROM per
LEFT JOIN answers ON answers.grade = per.grade
LEFT JOIN runs ON runs.grade = per.grade
LEFT JOIN edits ON edits.grade = per.grade
GROUP BY per.grade;
