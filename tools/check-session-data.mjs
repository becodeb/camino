// Checks the rows of the sessions tools/check-session.mjs created, in an
// export written by tools/export-playtest.mjs (the JSON and both CSVs), and,
// with PSQL set (a local database), in the SQL views too. Needs no secret:
// it reads the files the export wrote.
//
// T14: also the route done (route_done after the wardrobe), the survey the
// adult opened from free play, and the end from the corner menu.
//
// Per session: the row (grade, code, ended as completed, the survey's four
// answers, the adult form), its events with seq 0..n-1 and no gaps, the
// event types a scripted session of its grade must have, and a few payloads
// (the ladder's end, the resume after the offline reload, the adult's help,
// the workshop's test page, the probes, the free rule page). Both CSVs hold
// the session and all its events.
//
// node tools/check-session-data.mjs <export> <id,id,…>
//   export: exports/playtest-<stamp> (or its .json); the .sessions.csv and .events.csv beside it
//   ids:    the SESSION_IDS line of check-session.mjs (with or without "SESSION_IDS=")
//   PSQL:   optional, e.g. "docker exec -i camino-prueba-db psql -U camino -d camino_prueba -tA"
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const [exportArg, idsArg] = process.argv.slice(2);
if (!exportArg || !idsArg) {
  console.error('usage: node tools/check-session-data.mjs <exports/playtest-…> <SESSION_IDS>');
  process.exit(2);
}
const stem = exportArg.replace(/\.json$/, '');
const ids = idsArg.replace(/^SESSION_IDS=/, '').split(',').map((x) => x.trim()).filter(Boolean);

let failures = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failures++; return cond; };

const data = JSON.parse(readFileSync(`${stem}.json`, 'utf8'));
const sessionsCsv = readFileSync(`${stem}.sessions.csv`, 'utf8');
const eventsCsv = readFileSync(`${stem}.events.csv`, 'utf8');
const allSessions = data.sessions ?? [];
const allEvents = data.events ?? [];
ok(Array.isArray(data.sessions) && Array.isArray(data.events), `the export has sessions (${allSessions.length}) and events (${allEvents.length})`);

const COMMON = ['step', 'choice', 'tool_check', 'tap_add', 'drag', 'help', 'level_start', 'run', 'level_end', 'ladder_step', 'ladder_end', 'activity_end', 'typing', 'typing_round', 'typing_end', 'wardrobe', 'survey_answer', 'garden_view', 'adult_form', 'route_done'];
const BY_GRADE = {
  1: ['ghost_demo', 'speak', 'call_adult', 'call_adult_end', 'adult_help', 'resume'],
  3: [],
  5: ['resume', 'text_item', 'text_run', 'probe_end', 'rule_edit', 'game_run', 'scratch_predict'],
};

for (const id of ids) {
  const s = allSessions.find((x) => x.id === id);
  if (!ok(!!s, `${id}: in the export`)) continue;
  const tag = `${s.grade}° ${s.code}`;
  const ev = allEvents.filter((e) => e.session_id === id).sort((a, b) => a.seq - b.seq);
  const of = (type) => ev.filter((e) => e.type === type).map((e) => e.payload);
  ok(s.ended_at && s.end_reason === 'completed', `${tag}: ended, ${s.end_reason}`);
  ok(['liked', 'difficulty', 'favorite_activity', 'play_again'].every((k) => s.survey?.[k]), `${tag}: survey ${JSON.stringify(s.survey)}`);
  ok(s.adult_form?.engagement && s.adult_form?.help_needed, `${tag}: adult form ${JSON.stringify(s.adult_form)}`);
  ok(s.current_step === 'goodbye', `${tag}: current_step ${s.current_step}`);
  ok(s.consent === null, `${tag}: no consent tick since round 2 (consent ${s.consent})`);
  ok(ev.length > 30 && ev.every((e, i) => e.seq === i), `${tag}: ${ev.length} events, seq 0..${ev.length - 1} with no gaps`);
  const types = new Set(ev.map((e) => e.type));
  const missing = [...COMMON, ...(BY_GRADE[s.grade] ?? [])].filter((t) => !types.has(t));
  ok(missing.length === 0, `${tag}: every expected event type${missing.length ? `; missing ${missing.join(', ')}` : ''} (${[...types].sort().join(' ')})`);
  const end = of('ladder_end')[0];
  const ceiling = { 1: 2, 3: 6, 5: 10 }[s.grade];
  ok(end?.ceiling_rung === ceiling && end?.reason === 'ceiling', `${tag}: ladder_end ceiling ${end?.ceiling_rung} (${end?.reason})`);
  // round 2's own item bank (pp-l<rung>), and why each item ended
  const ladder = of('ladder_step');
  ok(ladder.every((x) => x.item === `pp-l${x.rung}`), `${tag}: the round-2 items ${ladder.map((x) => x.item).join(' ')}`);
  const REASONS = ['solved', 'runs', 'solution_hint', 'adult', 'time_cap', 'idle_cap', 'ladder_time', 'left'];
  ok(ladder.every((x) => REASONS.includes(x.end_reason) && (x.result === 'pass') === (x.end_reason === 'solved' && x.help_levels < 3 && !x.adult_helped)), `${tag}: end reasons ${ladder.map((x) => `${x.rung}:${x.end_reason}`).join(' ')}`);
  const ladderEnds = of('level_end').filter((x) => x.activity === 'ladder');
  ok(ladderEnds.filter((x) => x.outcome === 'fail').every((x) => REASONS.includes(x.end_reason)), `${tag}: every failed ladder page's level_end has its end_reason`);
  ok(of('survey_answer').some((x) => x.question === 'typing_liked') && of('typing_end').length === 1, `${tag}: the typing game ended and was rated`);
  {
    const te = of('typing_end')[0] ?? {};
    const tr = of('typing_round');
    const keysByRound = (n) => of('typing').filter((x) => x.round === n).length;
    ok(of('typing').every((x) => [1, 2, 3].includes(x.round)) && tr.length >= 1 && tr.every((r, i) => r.round === i + 1 && r.keys === keysByRound(r.round))
      && te.rounds_done === tr.filter((r) => r.completed).length && ['rounds', 'time', 'done', 'wrap_up'].includes(te.reason),
      `${tag}: typing rounds ${tr.map((r) => `${r.round}:${r.set}:${r.caught}/${r.goal}:${r.reason}`).join(' ')}, typing_end ${te.reason} (${te.rounds_done} done)`);
  }
  ok(of('wardrobe').some((x) => x.action === 'close'), `${tag}: the wardrobe closed with an outfit`);
  // T14: the route done (the green flag) after the wardrobe, then the survey the adult opened, back to free play, the end from the corner
  {
    const steps = of('step').map((x) => `${x.to}:${x.reason}`);
    const rd = of('route_done')[0];
    const iWard = steps.indexOf('wardrobe:next') + 1;
    ok(rd?.via === 'route' && rd.time_ms > 0 && rd.survey_done === false, `${tag}: route_done ${JSON.stringify(rd)}`);
    ok(steps.slice(iWard).join(' ') === 'free_play:next survey:adult free_play:next goodbye:end_now', `${tag}: after the wardrobe ${steps.slice(iWard).join(' ')}`);
    ok(!s.division, `${tag}: no division (T14 setup)`);
  }
  if (s.grade === 1) {
    const r = of('resume')[0];
    ok(r?.step === 'ladder', `1° ${s.code}: resume after the offline reload at the ladder ${JSON.stringify(r)}`);
    const steps = of('ladder_step').map((x) => `${x.rung}${x.result === 'pass' ? '✓' : '✗'}`).join(' ');
    ok(steps === '1✓ 2✓ 3✗', `1° ${s.code}: ladder ${steps}`);
    ok(of('call_adult').length >= 1 && of('adult_help').some((x) => x.kind === 'hint' && x.prompted), `1° ${s.code}: the raised hand and the adult's answer`);
    const choices = of('choice').filter((x) => x.activity !== 'character').map((x) => x.activity);
    ok(choices.slice(0, 2).join(',') === 'sheet,recess', `1° ${s.code}: free-play choices ${choices.join(',')}`);
  }
  if (s.grade === 5) {
    ok(of('resume')[0]?.step === 'free_play', `5° ${s.code}: resume after the offline reload on free play`);
    ok(of('level_end').some((x) => x.sheet === 15 && x.page === 'test' && x.outcome === 'win'), `5° ${s.code}: the workshop's test page (sheet 15) won`);
    ok(of('text_item').length >= 3 && of('scratch_predict').length === 3, `5° ${s.code}: text items ${of('text_item').length}, Scratch predictions ${of('scratch_predict').length}`);
    ok(of('choice').some((x) => x.activity === 'game_maker' && x.by === 'adult'), `5° ${s.code}: the game maker opened by the adult`);
    ok(of('activity_end').map((x) => x.activity).join(',') === 'editor,text_probe,game_maker', `5° ${s.code}: activity_end ${of('activity_end').map((x) => x.activity).join(',')}`);
  }
  if (s.grade === 3) {
    const rules = of('level_end').filter((x) => x.activity === 'rule_game');
    ok(rules.map((x) => `${x.level_id}:${x.outcome}`).join(' ') === '3ro-1:win 3ro-2:win pp-reglas:win', `3° ${s.code}: rule game pages ${rules.map((x) => `${x.level_id}:${x.outcome}`).join(' ')}`);
    const a = of('activity_end').find((x) => x.activity === 'rule_game');
    ok(a?.levels === 3 && a?.wins === 3 && a?.reason === 'done', `3° ${s.code}: activity_end ${JSON.stringify(a)}`);
  }
  // the CSVs
  ok(sessionsCsv.split('\n').some((l) => l.startsWith(`${id},`) || l.startsWith(`"${id}",`)), `${tag}: in the sessions CSV`);
  const csvRows = eventsCsv.split('\n').filter((l) => l.startsWith(`${id},`) || l.startsWith(`"${id}",`)).length;
  ok(csvRows === ev.length, `${tag}: ${csvRows} rows in the events CSV (JSON ${ev.length})`);
}

// the views, from a local database
if (process.env.PSQL && ids.length) {
  const sql = (q) => execSync(process.env.PSQL, { input: q }).toString().trim();
  const rows = (q) => JSON.parse(sql(`select coalesce(json_agg(_r), '[]') from (${q}) _r;`));
  const list = ids.map((x) => `'${x.replace(/[^0-9a-f-]/g, '')}'`).join(',');
  const summary = rows(`select session_id, grade, end_reason, duration_seconds, levels_won, calls_to_adult, adult_helps, ladder_ceiling_rung from v_session_summary where session_id in (${list}) order by grade`);
  console.log(`     v_session_summary: ${JSON.stringify(summary)}`);
  ok(summary.length === ids.length && summary.every((r) => r.end_reason === 'completed' && r.duration_seconds > 30 && r.levels_won >= 3 && r.ladder_ceiling_rung >= 2), 'v_session_summary: a completed row per session, with its time, levels won and ceiling');
  const ceilings = rows(`select session_id, max(rung) top, count(*) n from v_ladder_ceiling where session_id in (${list}) group by 1`);
  ok(ceilings.length === ids.length && ceilings.every((r) => summary.find((x) => x.session_id === r.session_id)?.ladder_ceiling_rung === r.top), `v_ladder_ceiling agrees with the summary's ceilings: ${JSON.stringify(ceilings.map((r) => r.top))}`);
  const times = rows(`select session_id, string_agg(activity || '=' || round(seconds), ' ' order by activity) t from v_activity_time where session_id in (${list}) group by 1`);
  console.log(`     v_activity_time: ${times.map((r) => r.t).join(' | ')}`);
  ok(times.length === ids.length && times.every((r) => /ladder=\d/.test(r.t) && /typing=\d/.test(r.t) && /tool_check=\d/.test(r.t)), 'v_activity_time: tool check, ladder, free-play activities and typing per session');
  const typing = rows('select grade, attempts, correct_count, accuracy_pct, sessions, liked_yes, liked_mid, liked_no from v_typing_by_grade order by grade');
  console.log(`     v_typing_by_grade: ${JSON.stringify(typing)}`);
  const gradesHere = [...new Set(allSessions.filter((s) => ids.includes(s.id)).map((s) => s.grade))];
  ok(gradesHere.every((g) => typing.some((r) => r.grade === g && r.attempts > 0)), `v_typing_by_grade: rows for grades ${gradesHere.join(',')}`);
  const rounds = rows('select grade, round, sessions, completed, attempts from v_typing_rounds_by_grade order by grade, round');
  console.log(`     v_typing_rounds_by_grade: ${JSON.stringify(rounds)}`);
  ok(gradesHere.every((g) => rounds.some((r) => r.grade === g && r.round === 1 && r.sessions > 0)), `v_typing_rounds_by_grade: round 1 for grades ${gradesHere.join(',')}`);
  const five = allSessions.filter((s) => ids.includes(s.id) && s.grade === 5).map((s) => s.id);
  if (five.length) {
    const gm = rows(`select grade, rule_edits, games_run, predictions, predictions_correct, liked, end_reason from v_probe_game_maker where session_id = '${five[0]}'`);
    console.log(`     v_probe_game_maker: ${JSON.stringify(gm)}`);
    ok(gm.length === 1 && gm[0].predictions === 3 && gm[0].rule_edits >= 1 && gm[0].liked === 'mid', 'v_probe_game_maker: the 5to session\'s edits, predictions and liking');
    const gmg = rows('select grade, sessions, predictions, predictions_correct from v_probe_game_maker_by_grade where grade = 5');
    ok(gmg.length === 1 && gmg[0].sessions >= 1, `v_probe_game_maker_by_grade (5): ${JSON.stringify(gmg)}`);
    const tx = rows(`select grade, items_tried, items_correct, predict_tried, number_correct, runs, runs_won, liked from v_probe_text where session_id = '${five[0]}'`);
    console.log(`     v_probe_text: ${JSON.stringify(tx)}`);
    ok(tx.length === 1 && tx[0].items_tried >= 3 && tx[0].number_correct >= 1 && tx[0].liked === 'yes', 'v_probe_text: the 5to session\'s items, the number item and the liking');
    const txg = rows('select grade, sessions, items_tried, items_correct from v_probe_text_by_grade where grade = 5');
    ok(txg.length === 1 && txg[0].sessions >= 1, `v_probe_text_by_grade (5): ${JSON.stringify(txg)}`);
  }
}

console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
