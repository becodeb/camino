-- "Del bloque al texto", the 5to probe (T8). Research question 8: can 5to
-- read and edit the text version of a block program (readiness for text
-- and Python)?
--
-- v_probe_text: one row per session that opened the probe (its free-play
-- card, or the adult menu). The tour (`probe_phase` 'intro': ran the
-- program, lines and blocks linked by a tap), the items (`text_item`, one
-- row per item and visit: an item left and solved later counts once, as
-- solved) by kind, tried and correct; `correct` is the child's own (a text
-- the help's ghost fixed is not correct; `solo`: correct with no help at
-- all), the runs (`text_run`: parsed or not, and the parse errors by
-- kind), the predict and blocks→text answers, the liking answer
-- (`survey_answer` {question: 'text_probe_liked'}) and the time in the
-- probe (`probe_end`).
CREATE OR REPLACE VIEW v_probe_text AS
WITH touched AS (
  SELECT DISTINCT session_id
  FROM events
  WHERE (type = 'choice' AND payload->>'activity' = 'text_probe')
     OR (type IN ('probe_phase', 'probe_end') AND payload->>'probe' = 'text')
     OR type IN ('text_item', 'text_run')
     OR (type = 'survey_answer' AND payload->>'question' = 'text_probe_liked')
),
tour AS (
  SELECT DISTINCT ON (session_id)
    session_id,
    (payload->>'completed')::boolean AS tour_done,
    COALESCE((payload->>'runs')::int, 0) AS tour_runs,
    COALESCE((payload->>'links')::int, 0) AS tour_links
  FROM events
  WHERE type = 'probe_phase' AND payload->>'probe' = 'text' AND payload->>'phase' = 'intro'
  ORDER BY session_id, seq DESC
),
per_item AS (
  SELECT
    session_id,
    payload->>'item' AS item,
    min(payload->>'kind') AS kind,
    bool_or(payload->>'reason' <> 'left') AS tried,
    bool_or((payload->>'correct')::boolean) AS correct,
    bool_or((payload->>'correct')::boolean AND COALESCE((payload->>'help_levels')::int, 0) = 0 AND NOT COALESCE((payload->>'adult_helped')::boolean, false)) AS solo,
    bool_or(COALESCE((payload->>'ghost_fixed')::boolean, false)) AS ghost_fixed,
    (array_agg(payload->>'answer' ORDER BY seq) FILTER (WHERE payload->>'answer' IS NOT NULL))[1] AS answer
  FROM events
  WHERE type = 'text_item'
  GROUP BY session_id, payload->>'item'
),
items AS (
  SELECT
    session_id,
    count(*) FILTER (WHERE tried) AS items_tried,
    count(*) FILTER (WHERE correct) AS items_correct,
    count(*) FILTER (WHERE solo) AS items_solo,
    count(*) FILTER (WHERE ghost_fixed) AS items_ghost_fixed,
    count(*) FILTER (WHERE tried AND kind = 'predict') AS predict_tried,
    count(*) FILTER (WHERE correct AND kind = 'predict') AS predict_correct,
    count(*) FILTER (WHERE tried AND kind = 'number') AS number_tried,
    count(*) FILTER (WHERE correct AND kind = 'number') AS number_correct,
    count(*) FILTER (WHERE tried AND kind = 'typo') AS typo_tried,
    count(*) FILTER (WHERE correct AND kind = 'typo') AS typo_correct,
    count(*) FILTER (WHERE tried AND kind = 'blocks_to_text') AS blocks_tried,
    count(*) FILTER (WHERE correct AND kind = 'blocks_to_text') AS blocks_correct,
    count(*) FILTER (WHERE tried AND kind = 'write') AS write_tried,
    count(*) FILTER (WHERE correct AND kind = 'write') AS write_correct,
    string_agg(item || ':' || answer, ',' ORDER BY item) FILTER (WHERE answer IS NOT NULL) AS answers
  FROM per_item
  GROUP BY session_id
),
runs AS (
  SELECT
    session_id,
    count(*) FILTER (WHERE payload->>'item' <> 'tour') AS runs,
    count(*) FILTER (WHERE payload->>'item' <> 'tour' AND (payload->>'ok')::boolean) AS runs_parsed,
    count(*) FILTER (WHERE payload->>'result' = 'win' AND payload->>'item' <> 'tour') AS runs_won,
    count(*) FILTER (WHERE NOT (payload->>'ok')::boolean) AS parse_errors,
    string_agg(DISTINCT payload->>'error_kind', ',' ORDER BY payload->>'error_kind') FILTER (WHERE NOT (payload->>'ok')::boolean) AS error_kinds
  FROM events
  WHERE type = 'text_run'
  GROUP BY session_id
),
liked AS (
  SELECT DISTINCT ON (session_id) session_id, payload->>'answer' AS liked
  FROM events
  WHERE type = 'survey_answer' AND payload->>'question' = 'text_probe_liked'
  ORDER BY session_id, seq DESC
),
ends AS (
  SELECT DISTINCT ON (session_id) session_id, payload->>'reason' AS end_reason, (payload->>'time_ms')::numeric / 1000 AS probe_seconds
  FROM events
  WHERE type = 'probe_end' AND payload->>'probe' = 'text'
  ORDER BY session_id, seq DESC
)
SELECT
  s.id AS session_id,
  s.code,
  s.grade,
  s.division,
  COALESCE(tr.tour_done, false) AS tour_done,
  COALESCE(tr.tour_runs, 0) AS tour_runs,
  COALESCE(tr.tour_links, 0) AS tour_links,
  COALESCE(i.items_tried, 0) AS items_tried,
  COALESCE(i.items_correct, 0) AS items_correct,
  COALESCE(i.items_solo, 0) AS items_solo,
  COALESCE(i.items_ghost_fixed, 0) AS items_ghost_fixed,
  COALESCE(i.predict_tried, 0) AS predict_tried,
  COALESCE(i.predict_correct, 0) AS predict_correct,
  COALESCE(i.number_tried, 0) AS number_tried,
  COALESCE(i.number_correct, 0) AS number_correct,
  COALESCE(i.typo_tried, 0) AS typo_tried,
  COALESCE(i.typo_correct, 0) AS typo_correct,
  COALESCE(i.blocks_tried, 0) AS blocks_tried,
  COALESCE(i.blocks_correct, 0) AS blocks_correct,
  COALESCE(i.write_tried, 0) AS write_tried,
  COALESCE(i.write_correct, 0) AS write_correct,
  COALESCE(r.runs, 0) AS runs,
  COALESCE(r.runs_parsed, 0) AS runs_parsed,
  COALESCE(r.runs_won, 0) AS runs_won,
  COALESCE(r.parse_errors, 0) AS parse_errors,
  r.error_kinds,
  i.answers,
  l.liked,
  en.end_reason,
  en.probe_seconds
FROM touched t
JOIN sessions s ON s.id = t.session_id
LEFT JOIN tour tr ON tr.session_id = t.session_id
LEFT JOIN items i ON i.session_id = t.session_id
LEFT JOIN runs r ON r.session_id = t.session_id
LEFT JOIN liked l ON l.session_id = t.session_id
LEFT JOIN ends en ON en.session_id = t.session_id;

-- v_probe_text_by_grade: RQ 8 per grade at a glance (correct / tried per kind, summed over sessions).
CREATE OR REPLACE VIEW v_probe_text_by_grade AS
SELECT
  grade,
  count(*) AS sessions,
  count(*) FILTER (WHERE tour_done) AS tour_done,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY items_correct) AS median_items_correct,
  sum(items_tried) AS items_tried,
  sum(items_correct) AS items_correct,
  sum(items_solo) AS items_solo,
  sum(predict_correct) AS predict_correct,
  sum(predict_tried) AS predict_tried,
  sum(number_correct) AS number_correct,
  sum(number_tried) AS number_tried,
  sum(typo_correct) AS typo_correct,
  sum(typo_tried) AS typo_tried,
  sum(blocks_correct) AS blocks_correct,
  sum(blocks_tried) AS blocks_tried,
  sum(write_correct) AS write_correct,
  sum(write_tried) AS write_tried,
  sum(parse_errors) AS parse_errors,
  count(*) FILTER (WHERE liked = 'yes') AS liked_yes,
  count(*) FILTER (WHERE liked = 'mid') AS liked_mid,
  count(*) FILTER (WHERE liked = 'no') AS liked_no
FROM v_probe_text
GROUP BY grade
ORDER BY grade;
