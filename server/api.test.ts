// API tests against a REAL Postgres (TEST_DATABASE_URL), skipped with a
// clear message when that env var is absent. Run the disposable database
// yourself, e.g.:
//   docker run -d --rm --name camino-prueba-testdb -e POSTGRES_PASSWORD=test -p 54340:5432 postgres:16-alpine
//   TEST_DATABASE_URL=postgres://postgres:test@localhost:54340/postgres npm run test:api
//   docker stop camino-prueba-testdb

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { migrate } from './db.ts';
import { createApp } from './app.ts';
import { csvEscape, toCsv } from './lib/csv.ts';
import { deleteOldSessions } from './retention.ts';
import { createRateLimiter } from './lib/rateLimit.ts';
import { SYNC_RATE_LIMIT, SYNC_RATE_WINDOW_MS } from './routes/sync.ts';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe('csv quoting (no database needed)', () => {
  it('quotes fields with commas, quotes and newlines', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape({ a: 1 })).toBe('"{""a"":1}"');
  });

  it('builds a full CSV with a header row', () => {
    const csv = toCsv([{ a: 'x,y', b: 2 }], ['a', 'b']);
    expect(csv).toBe('a,b\r\n"x,y",2\r\n');
  });
});

describe('sync rate limit (no database needed)', () => {
  it('lets a class of 25 devices behind one NAT sync every 5 s with room to spare', () => {
    const perDevicePerWindow = SYNC_RATE_WINDOW_MS / 5_000;
    expect(SYNC_RATE_LIMIT).toBeGreaterThanOrEqual(25 * perDevicePerWindow * 4);
    const limiter = createRateLimiter(SYNC_RATE_LIMIT, SYNC_RATE_WINDOW_MS);
    // one minute of a class: 25 devices x 12 posts, plus a flush each when the page hides
    for (let i = 0; i < 25 * perDevicePerWindow + 25; i++) expect(limiter.check('10.0.0.1')).toBe(true);
  });

  it('still stops one runaway IP within the window, and not the others', () => {
    const limiter = createRateLimiter(SYNC_RATE_LIMIT, SYNC_RATE_WINDOW_MS);
    for (let i = 0; i < SYNC_RATE_LIMIT; i++) limiter.check('10.0.0.2');
    expect(limiter.check('10.0.0.2')).toBe(false);
    expect(limiter.check('10.0.0.3')).toBe(true);
  });
});

const dbDescribe = TEST_DATABASE_URL ? describe : describe.skip;
if (!TEST_DATABASE_URL) {
  console.warn(
    'skipping API tests against Postgres: TEST_DATABASE_URL is not set. ' +
      'Start a disposable database and re-run, e.g.\n' +
      '  docker run -d --rm --name camino-prueba-testdb -e POSTGRES_PASSWORD=test -p 54340:5432 postgres:16-alpine\n' +
      '  TEST_DATABASE_URL=postgres://postgres:test@localhost:54340/postgres npm run test:api',
  );
}

dbDescribe('API against Postgres', () => {
  let pool: pg.Pool;
  const distDir = '/tmp/camino-prueba-test-dist-does-not-exist';

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(pool);
  }, 30_000);

  afterAll(async () => {
    await pool.end();
  });

  function newSession(overrides: Record<string, unknown> = {}) {
    return {
      id: randomUUID(),
      code: 'Zorro 27',
      grade: 3,
      division: 'B',
      consent: true,
      started_at: new Date().toISOString(),
      app_version: '0.1.0',
      device: { ua: 'test', w: 1366, h: 768, touch: false },
      ...overrides,
    };
  }

  function event(seq: number, overrides: Record<string, unknown> = {}) {
    return {
      seq,
      client_t: new Date().toISOString(),
      type: 'tool_check',
      payload: { ok: true },
      ...overrides,
    };
  }

  it('migrations are idempotent: running them twice applies nothing new', async () => {
    const applied = await migrate(pool);
    expect(applied).toEqual([]);
  });

  it('accepts a sync batch, upserts the session and inserts events', async () => {
    const app = createApp(pool, { distDir });
    const session = newSession();
    const events = [event(0), event(1, { type: 'run', payload: { result: 'win' } })];

    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, events }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, acked: [0, 1] });

    const { rows: sessionRows } = await pool.query('SELECT * FROM sessions WHERE id = $1', [session.id]);
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0].code).toBe('Zorro 27');

    const { rows: eventRows } = await pool.query(
      'SELECT seq, type FROM events WHERE session_id = $1 ORDER BY seq',
      [session.id],
    );
    expect(eventRows).toEqual([
      { seq: 0, type: 'tool_check' },
      { seq: 1, type: 'run' },
    ]);
  });

  it('round 2: a session without consent (null) is stored as null; a later sync updates the device captions; a string consent is refused', async () => {
    const app = createApp(pool, { distDir });
    const post = (body: unknown) => app.request('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const session = newSession({ consent: null, device: { ua: 'test', w: 1920, h: 1080, vw: 1920, vh: 911, touch: false, captions: false, captions_set: 'grade' } });
    expect((await post({ session, events: [event(0, { type: 'captions', payload: { on: true, where: 'bar' } })] })).status).toBe(200);
    expect((await post({ session: { ...session, device: { ...session.device, captions: true } }, events: [] })).status).toBe(200);
    const { rows } = await pool.query('SELECT consent, device FROM sessions WHERE id = $1', [session.id]);
    expect(rows[0].consent).toBeNull();
    expect(rows[0].device).toMatchObject({ captions: true, captions_set: 'grade', vh: 911 });
    const old = newSession();
    expect((await post({ session: old, events: [] })).status).toBe(200);
    expect((await pool.query('SELECT consent FROM sessions WHERE id = $1', [old.id])).rows[0].consent).toBe(true);
    expect((await post({ session: newSession({ consent: 'yes' }), events: [] })).status).toBe(400);
  });

  it('v_activity_time counts a free-play visit whole (activity_end) and the other activities by their pages', async () => {
    const app = createApp(pool, { distDir });
    const session = newSession();
    const at = (s: number) => new Date(Date.UTC(2026, 8, 30, 10, 0, s)).toISOString();
    const events = [
      // the ladder: one page, 40 s
      event(0, { client_t: at(0), type: 'level_start', payload: { level_id: '1ro-h1-2', activity: 'ladder' } }),
      event(1, { client_t: at(40), type: 'level_end', payload: { level_id: '1ro-h1-2', activity: 'ladder', outcome: 'win' } }),
      // free play: the sheet, picked at 50 s; a page of 30 s inside it; left at 170 s (visit: 120 s)
      event(2, { client_t: at(50), type: 'choice', payload: { activity: 'sheet', visit: 1 } }),
      event(3, { client_t: at(60), type: 'level_start', payload: { level_id: '1ro-h6-1', activity: 'sheet' } }),
      event(4, { client_t: at(90), type: 'level_end', payload: { level_id: '1ro-h6-1', activity: 'sheet', outcome: 'win' } }),
      event(5, { client_t: at(170), type: 'activity_end', payload: { activity: 'sheet', visit: 1, time_ms: 120_000, reason: 'menu' } }),
      // the editor: no level page at all, 45 s
      event(6, { client_t: at(215), type: 'activity_end', payload: { activity: 'editor', visit: 2, time_ms: 45_000, reason: 'menu' } }),
      // the sheet again: 15 s more
      event(7, { client_t: at(240), type: 'activity_end', payload: { activity: 'sheet', visit: 3, time_ms: 15_000, reason: 'budget' } }),
    ];
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, events }),
    });
    expect(res.status).toBe(200);
    const { rows } = await pool.query('SELECT activity, seconds::float AS seconds FROM v_activity_time WHERE session_id = $1 ORDER BY activity', [session.id]);
    expect(rows).toEqual([
      { activity: 'editor', seconds: 45 },
      { activity: 'ladder', seconds: 40 },
      { activity: 'sheet', seconds: 135 },
    ]);
  });

  it('v_typing_by_grade reads the typing keys, the liking answer and the rounds; v_typing_rounds_by_grade by round; v_activity_time counts the typing game whole', async () => {
    const app = createApp(pool, { distDir });
    const post = (session: Record<string, unknown>, events: unknown[]) => app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, events }),
    });
    const key = (seq: number, correct: boolean, latency_ms: number, input = 'physical', round = 1) =>
      event(seq, { type: 'typing', payload: { key: correct ? 'a' : 'p', expected: 'a', correct, latency_ms, speed_level: 1, input, item: 'a', set: 'vowels', pos: 0, round } });
    const round = (seq: number, n: number, completed: boolean, time_ms: number, caught: number, golden: number) =>
      event(seq, { type: 'typing_round', payload: { round: n, set: 'commands', goal: 5, filled: completed ? 5 : 2, caught, golden, completed, reason: completed ? 'goal' : 'done', time_ms, keys: 9, correct: 8, landed: 0, pace_end: 1 } });
    // 5to (no other test writes grade 5): two sessions
    const a = newSession({ grade: 5 });
    expect((await post(a, [
      key(0, true, 1000), key(1, false, 3000), key(2, true, 2000, 'physical', 2), key(3, true, 4000, 'touch', 3),
      round(4, 1, true, 40_000, 4, 1), round(5, 2, true, 50_000, 5, 0), round(6, 3, true, 70_000, 3, 1),
      event(7, { type: 'typing_end', payload: { reason: 'rounds', time_ms: 245_000, keys: 4, correct: 3, rounds_done: 3, golden: 2 } }),
      event(8, { type: 'survey_answer', payload: { question: 'typing_liked', answer: 'yes' } }),
      // the final survey's own "liked" is not the game's
      event(9, { type: 'survey_answer', payload: { question: 'liked', answer: 'no' } }),
    ])).status).toBe(200);
    const b = newSession({ grade: 5 });
    expect((await post(b, [
      key(0, false, 500),
      round(1, 1, false, 30_000, 2, 0),
      event(2, { type: 'typing_end', payload: { reason: 'done', time_ms: 40_000, keys: 1, correct: 0, rounds_done: 0, golden: 0 } }),
      event(3, { type: 'survey_answer', payload: { question: 'typing_liked', answer: 'mid' } }),
    ])).status).toBe(200);

    const { rows } = await pool.query('SELECT * FROM v_typing_by_grade WHERE grade = 5');
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(Number(r.attempts)).toBe(5);
    expect(Number(r.correct_count)).toBe(3);
    expect(Number(r.accuracy_pct)).toBe(60);
    expect(Number(r.median_latency_ms)).toBe(2000);
    expect(Number(r.sessions)).toBe(2);
    expect(Number(r.median_correct_latency_ms)).toBe(2000);
    expect(Number(r.touch_attempts)).toBe(1);
    expect([Number(r.liked_yes), Number(r.liked_mid), Number(r.liked_no)]).toEqual([1, 1, 0]);
    // the rounds (T12)
    expect(Number(r.rounds_sessions)).toBe(2);
    expect(Number(r.all_rounds_sessions)).toBe(1);
    expect(Number(r.median_rounds_done)).toBe(1.5);
    expect(Number(r.golden_total)).toBe(2);
    const byRound = (await pool.query('SELECT * FROM v_typing_rounds_by_grade WHERE grade = 5 ORDER BY round')).rows;
    expect(byRound.map((x) => Number(x.round))).toEqual([1, 2, 3]);
    expect(byRound.map((x) => Number(x.sessions))).toEqual([2, 1, 1]);
    expect(byRound.map((x) => Number(x.completed))).toEqual([1, 1, 1]);
    expect(Number(byRound[0].median_time_ms)).toBe(35_000);
    expect(Number(byRound[0].median_completed_time_ms)).toBe(40_000);
    expect(Number(byRound[0].median_caught)).toBe(3);
    expect(byRound.map((x) => Number(x.golden))).toEqual([1, 0, 1]);
    // keys by round: round 1 has a's 1000 ✓ and 3000 ✗ and b's 500 ✗; round 2 one ✓; round 3 one ✓ (touch)
    expect(byRound.map((x) => Number(x.attempts))).toEqual([3, 1, 1]);
    expect(byRound.map((x) => Number(x.correct_count))).toEqual([1, 1, 1]);
    expect(Number(byRound[0].accuracy_pct)).toBe(33.3);
    expect(Number(byRound[2].median_correct_latency_ms)).toBe(4000);

    const t = await pool.query("SELECT seconds::float AS seconds FROM v_activity_time WHERE session_id = $1 AND activity = 'typing'", [a.id]);
    expect(t.rows).toEqual([{ seconds: 245 }]);
  });

  it('v_probe_game_maker sums up the game maker probe per session; the by-grade view counts it for RQ 8', async () => {
    const app = createApp(pool, { distDir });
    const post = (session: Record<string, unknown>, events: unknown[]) => app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, events }),
    });
    const ev = (seq: number, type: string, payload: Record<string, unknown>) => event(seq, { type, payload });
    const edit = (seq: number, phase: string, op: string, object: string, hat: string | null, action: string | null, extra: Record<string, unknown> = {}) =>
      ev(seq, 'rule_edit', { probe: 'game_maker', phase, object, hat, action, op, rules: 9, running: false, ...extra });
    const run = (seq: number, phase: string, result: string, keys: number, heard: number, broadcasts: string[], win_points: number | null) =>
      ev(seq, 'game_run', { probe: 'game_maker', phase, result, keys, duration_ms: 20_000, score: 3, lives: 2, rules: 'me[key:left>move:left] game[points:5>win]', rule_count: 9, objects: ['me', 'game'], broadcasts, messages_heard: heard, win_points, lose_lives: true });
    // 4to (no other test writes grade 4): one child goes all the way, one leaves after phase 1
    const a = newSession({ grade: 4 });
    expect((await post(a, [
      ev(0, 'choice', { activity: 'game_maker', visit: 1 }),
      run(1, 'play', 'win', 12, 0, [], 5),
      ev(2, 'probe_phase', { probe: 'game_maker', phase: 'play', completed: true, time_ms: 60_000, runs: 1, edits: 0, help_levels: 0 }),
      edit(3, 'change', 'change', 'seed', 'touch:me', 'score:2', { from: 'score:1', to: 'score:2' }),
      run(4, 'change', 'lose', 8, 0, [], 5),
      ev(5, 'probe_phase', { probe: 'game_maker', phase: 'change', completed: true, time_ms: 70_000, runs: 1, edits: 1, help_levels: 0 }),
      edit(6, 'make', 'add', 'bird', null, null),
      edit(7, 'make', 'add', 'bird', 'recv:yum', null),
      edit(8, 'make', 'add', 'bird', 'recv:yum', 'say:pio'),
      edit(9, 'make', 'add', 'seed', 'touch:me', 'send:yum'),
      edit(10, 'make', 'change', 'game', 'points:10', null, { from: 'points:5', to: 'points:10' }),
      edit(11, 'make', 'remove', 'stone', 'tick', null),
      // the help's ghost hand building a rule is not the child's edit
      edit(12, 'make', 'add', 'me', 'key:up', null, { ghost: true }),
      run(13, 'make', 'stopped', 5, 2, ['yum'], 10),
      ev(14, 'probe_phase', { probe: 'game_maker', phase: 'make', completed: true, time_ms: 200_000, runs: 1, edits: 6, help_levels: 3 }),
      ev(15, 'scratch_predict', { item: 'key', answer: 'right', correct: true, position: 1, time_ms: 4000 }),
      ev(16, 'scratch_predict', { item: 'star', answer: 'life_lost', correct: false, position: 2, time_ms: 6000 }),
      ev(17, 'scratch_predict', { item: 'broadcast', answer: 'bird_says', correct: true, position: 2, time_ms: 5000 }),
      ev(18, 'survey_answer', { question: 'game_maker_liked', answer: 'yes' }),
      ev(19, 'probe_end', { probe: 'game_maker', reason: 'done', time_ms: 420_000 }),
    ])).status).toBe(200);
    const b = newSession({ grade: 4 });
    expect((await post(b, [
      ev(0, 'choice', { activity: 'game_maker', visit: 1 }),
      run(1, 'play', 'stopped', 0, 0, [], 5),
      ev(2, 'probe_end', { probe: 'game_maker', reason: 'left', time_ms: 50_000 }),
    ])).status).toBe(200);

    const { rows } = await pool.query('SELECT * FROM v_probe_game_maker WHERE session_id = $1', [a.id]);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect([Number(r.phases_reached), Number(r.phases_completed), r.play_done, r.change_done, r.make_done]).toEqual([3, 3, true, true, true]);
    expect(Number(r.make_seconds)).toBe(200);
    expect([Number(r.rule_edits), Number(r.adds), Number(r.removes), Number(r.changes), Number(r.make_edits)]).toEqual([7, 4, 1, 2, 6]);
    expect(r.bird_added).toBe(true);
    expect(Number(r.broadcast_edits)).toBe(2);
    expect(Number(r.win_condition_edits)).toBe(1);
    expect(Number(r.lose_condition_edits)).toBe(0);
    expect([Number(r.games_run), Number(r.games_played), Number(r.wins), Number(r.losses)]).toEqual([3, 3, 1, 1]);
    expect([Number(r.games_with_broadcast), Number(r.messages_heard), r.make_game_can_win]).toEqual([1, 2, true]);
    expect([Number(r.predictions), Number(r.predictions_correct)]).toEqual([3, 2]);
    expect(r.prediction_answers).toBe('key:right,star:life_lost,broadcast:bird_says');
    expect([r.liked, r.end_reason, Number(r.probe_seconds)]).toEqual(['yes', 'done', 420]);
    expect(r.last_rules).toContain('game[points:5>win]');

    const left = (await pool.query('SELECT * FROM v_probe_game_maker WHERE session_id = $1', [b.id])).rows[0];
    expect([Number(left.phases_reached), Number(left.games_run), Number(left.games_played), left.liked, left.end_reason]).toEqual([0, 1, 0, null, 'left']);

    const g = (await pool.query('SELECT * FROM v_probe_game_maker_by_grade WHERE grade = 4')).rows[0];
    expect([Number(g.sessions), Number(g.play_done), Number(g.make_done), Number(g.used_broadcast), Number(g.played_a_broadcast), Number(g.set_win_condition), Number(g.added_the_bird)]).toEqual([2, 1, 1, 1, 1, 1, 1]);
    expect([Number(g.predictions_correct), Number(g.predictions), Number(g.liked_yes)]).toEqual([2, 3, 1]);
    expect(Number(g.median_rule_edits)).toBe(3.5);
  });

  it('v_probe_text sums up the text probe per session (an item left and solved later counts once); the by-grade view counts it for RQ 8', async () => {
    const app = createApp(pool, { distDir });
    const post = (session: Record<string, unknown>, events: unknown[]) => app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, events }),
    });
    const ev = (seq: number, type: string, payload: Record<string, unknown>) => event(seq, { type, payload });
    const item = (seq: number, id: string, kind: string, reason: string, correct: boolean, extra: Record<string, unknown> = {}) =>
      ev(seq, 'text_item', { item: id, kind, reason, correct, attempts: 1, errors: [], time_ms: 30_000, help_levels: 0, adult_helped: false, ...extra });
    const run = (seq: number, id: string, ok: boolean, result: string | null, error_kind: string | null = null, line: number | null = null) =>
      ev(seq, 'text_run', { item: id, ok, result, error_kind, line, attempt: 1 });
    // 5to: one child through every item, one who leaves in the tour; a 3ro opened by the adult
    const a = newSession({ grade: 5 });
    expect((await post(a, [
      ev(0, 'choice', { activity: 'text_probe', visit: 1 }),
      run(1, 'tour', true, 'win'),
      ev(2, 'probe_phase', { probe: 'text', phase: 'intro', completed: true, time_ms: 40_000, runs: 1, links: 3, help_levels: 0 }),
      item(3, 'predict_loop', 'predict', 'answered', true, { answer: 'end_2_0', position: 1 }),
      item(4, 'predict_if', 'predict', 'answered', false, { answer: 'bump_1', position: 1 }),
      run(5, 'number', true, 'short'),
      // left without solving, then back: solved (counts once, as solved, not solo: it had help)
      item(6, 'number', 'number', 'left', false, { text: 'derecha()', attempts: 1 }),
      run(7, 'number', true, 'win'),
      item(8, 'number', 'number', 'solved', true, { text: 'derecha()\nfor i in range(4):\n    arriba()\nderecha()', help_levels: 1 }),
      run(9, 'typo_name', false, null, 'unknown_name', 3),
      run(10, 'typo_name', true, 'win'),
      item(11, 'typo_name', 'typo', 'solved', true, { errors: ['unknown_name'], attempts: 2 }),
      run(12, 'typo_colon', false, null, 'missing_colon', 1),
      run(13, 'typo_colon', false, null, 'missing_colon', 1),
      // the ghost wrote the fix: solved, not correct
      run(14, 'typo_colon', true, 'win'),
      item(15, 'typo_colon', 'typo', 'solved', false, { ghost_fixed: true, help_levels: 3 }),
      item(16, 'blocks_loop', 'blocks_to_text', 'answered', true, { answer: 'same', position: 2 }),
      item(17, 'blocks_until', 'blocks_to_text', 'answered', false, { answer: 'inside_if', position: 0 }),
      run(18, 'write_if', false, null, 'empty_block', 2),
      ev(19, 'probe_phase', { probe: 'text', phase: 'items', completed: true, time_ms: 400_000, runs: 7, picks: 4, items_tried: 7, items_correct: 5, help_levels: 3 }),
      ev(20, 'survey_answer', { question: 'text_probe_liked', answer: 'mid' }),
      ev(21, 'probe_end', { probe: 'text', reason: 'done', time_ms: 480_000 }),
    ])).status).toBe(200);
    const b = newSession({ grade: 5 });
    expect((await post(b, [
      ev(0, 'choice', { activity: 'text_probe', visit: 1 }),
      ev(1, 'probe_end', { probe: 'text', reason: 'left', time_ms: 20_000 }),
    ])).status).toBe(200);

    const r = (await pool.query('SELECT * FROM v_probe_text WHERE session_id = $1', [a.id])).rows[0];
    expect([r.tour_done, Number(r.tour_runs), Number(r.tour_links)]).toEqual([true, 1, 3]);
    expect([Number(r.items_tried), Number(r.items_correct), Number(r.items_solo), Number(r.items_ghost_fixed)]).toEqual([7, 4, 3, 1]);
    expect([Number(r.predict_tried), Number(r.predict_correct), Number(r.number_tried), Number(r.number_correct)]).toEqual([2, 1, 1, 1]);
    expect([Number(r.typo_tried), Number(r.typo_correct), Number(r.blocks_tried), Number(r.blocks_correct), Number(r.write_tried), Number(r.write_correct)]).toEqual([2, 1, 2, 1, 0, 0]);
    expect([Number(r.runs), Number(r.runs_parsed), Number(r.runs_won), Number(r.parse_errors)]).toEqual([8, 4, 3, 4]);
    expect(r.error_kinds).toBe('empty_block,missing_colon,unknown_name');
    expect(r.answers).toBe('blocks_loop:same,blocks_until:inside_if,predict_if:bump_1,predict_loop:end_2_0');
    expect([r.liked, r.end_reason, Number(r.probe_seconds)]).toEqual(['mid', 'done', 480]);

    const left = (await pool.query('SELECT * FROM v_probe_text WHERE session_id = $1', [b.id])).rows[0];
    expect([left.tour_done, Number(left.items_tried), Number(left.runs), left.liked, left.end_reason]).toEqual([false, 0, 0, null, 'left']);

    const g = (await pool.query('SELECT * FROM v_probe_text_by_grade WHERE grade = 5')).rows[0];
    expect([Number(g.sessions), Number(g.tour_done), Number(g.items_correct), Number(g.items_tried), Number(g.parse_errors), Number(g.liked_mid)]).toEqual([2, 1, 4, 7, 4, 1]);
    expect([Number(g.typo_correct), Number(g.typo_tried), Number(g.blocks_correct), Number(g.blocks_tried)]).toEqual([1, 2, 1, 2]);
    expect(Number(g.median_items_correct)).toBe(2);
  });

  it('retrying the exact same batch is idempotent: one row per seq, all acked again', async () => {
    const app = createApp(pool, { distDir });
    const session = newSession();
    const events = [event(0), event(1)];
    const body = JSON.stringify({ session, events });

    const first = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(first.status).toBe(200);

    const second = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, acked: [0, 1] });

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM events WHERE session_id = $1', [session.id]);
    expect(rows[0].n).toBe(2);
  });

  it('never overwrites a non-null field with null on a later sync', async () => {
    const app = createApp(pool, { distDir });
    const session = newSession({ division: 'C', app_version: '0.1.0' });

    await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, events: [] }),
    });

    // Second sync omits division and app_version (sent as null): they must
    // survive from the first sync instead of being wiped.
    const secondSession = { ...session, division: null, app_version: null, current_step: 'survey' };
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session: secondSession, events: [] }),
    });
    expect(res.status).toBe(200);

    const { rows } = await pool.query('SELECT division, app_version, current_step FROM sessions WHERE id = $1', [
      session.id,
    ]);
    expect(rows[0]).toEqual({ division: 'C', app_version: '0.1.0', current_step: 'survey' });
  });

  it('rejects an invalid sync body with 400', async () => {
    const app = createApp(pool, { distDir });
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session: { ...newSession(), grade: 9 }, events: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects an oversized sync body with 413', async () => {
    const app = createApp(pool, { distDir });
    const session = newSession();
    const hugeEvents = Array.from({ length: 400 }, (_, i) => event(i, { payload: { blob: 'x'.repeat(4000) } }));
    const res = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, events: hugeEvents }),
    });
    expect(res.status).toBe(413);
  });

  it('answers 429 once the per-IP limit is spent', async () => {
    const app = createApp(pool, { distDir, syncRateLimit: 2 });
    const post = () => app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session: newSession(), events: [] }),
    });
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(429);
  });

  describe('deleting a session (admin)', () => {
    const auth = { authorization: 'Bearer right-token' };

    it('removes the session and cascades its events', async () => {
      const app = createApp(pool, { adminToken: 'right-token', distDir });
      const session = newSession({ code: 'Prueba 1' });
      await app.request('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session, events: [event(0), event(1)] }),
      });
      const res = await app.request(`/api/admin/sessions/${session.id}`, { method: 'DELETE', headers: auth });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, deleted: session.id });
      const { rows: s } = await pool.query('SELECT id FROM sessions WHERE id = $1', [session.id]);
      expect(s).toHaveLength(0);
      const { rows: e } = await pool.query('SELECT seq FROM events WHERE session_id = $1', [session.id]);
      expect(e).toHaveLength(0);
    });

    it('is 404 for an unknown session and 400 for a malformed id', async () => {
      const app = createApp(pool, { adminToken: 'right-token', distDir });
      expect((await app.request(`/api/admin/sessions/${randomUUID()}`, { method: 'DELETE', headers: auth })).status).toBe(404);
      expect((await app.request('/api/admin/sessions/not-a-uuid', { method: 'DELETE', headers: auth })).status).toBe(400);
    });

    it('needs the admin token (the export token does not do)', async () => {
      const app = createApp(pool, { adminToken: 'right-token', exportToken: 'export-token', distDir });
      const session = newSession();
      await app.request('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session, events: [event(0)] }),
      });
      expect((await app.request(`/api/admin/sessions/${session.id}`, { method: 'DELETE' })).status).toBe(401);
      expect((await app.request(`/api/admin/sessions/${session.id}`, { method: 'DELETE', headers: { authorization: 'Bearer export-token' } })).status).toBe(401);
      const { rows } = await pool.query('SELECT id FROM sessions WHERE id = $1', [session.id]);
      expect(rows).toHaveLength(1);
    });
  });

  describe('admin token', () => {
    it('is 503 when ADMIN_TOKEN is not configured', async () => {
      const app = createApp(pool, { distDir });
      const res = await app.request('/api/admin/summary');
      expect(res.status).toBe(503);
    });

    it('is 401 with the wrong token', async () => {
      const app = createApp(pool, { adminToken: 'right-token', distDir });
      const res = await app.request('/api/admin/summary', { headers: { authorization: 'Bearer wrong-token' } });
      expect(res.status).toBe(401);
    });

    it('is 200 with the right token', async () => {
      const app = createApp(pool, { adminToken: 'right-token', distDir });
      const res = await app.request('/api/admin/summary', { headers: { authorization: 'Bearer right-token' } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('sessions');
      expect(body).toHaveProperty('counts_by_grade');
      expect(body).toHaveProperty('active_now');
    });
  });

  describe('export token', () => {
    it('is 503 when EXPORT_TOKEN is not configured', async () => {
      const app = createApp(pool, { distDir });
      const res = await app.request('/api/export?format=json');
      expect(res.status).toBe(503);
    });

    it('is 401 with the wrong token', async () => {
      const app = createApp(pool, { exportToken: 'right-token', distDir });
      const res = await app.request('/api/export?format=json', { headers: { authorization: 'Bearer nope' } });
      expect(res.status).toBe(401);
    });

    it('is 200 with the right token and returns sessions + events CSV correctly quoted', async () => {
      const app = createApp(pool, { exportToken: 'right-token', distDir });
      const session = newSession({ code: 'Comma, Fox "27"' });
      await app.request('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session, events: [] }),
      });

      const jsonRes = await app.request('/api/export?format=json', { headers: { authorization: 'Bearer right-token' } });
      expect(jsonRes.status).toBe(200);
      const jsonBody = await jsonRes.json();
      expect(jsonBody).toHaveProperty('sessions');
      expect(jsonBody).toHaveProperty('events');
      expect(jsonBody).toHaveProperty('exported_at');
      expect(jsonBody).toHaveProperty('app_version');

      const csvRes = await app.request('/api/export?format=csv&table=sessions', {
        headers: { authorization: 'Bearer right-token' },
      });
      expect(csvRes.status).toBe(200);
      const csvText = await csvRes.text();
      expect(csvText).toContain('"Comma, Fox ""27"""');
    });
  });

  describe('retention', () => {
    it('deletes sessions older than RETENTION_DAYS along with their events', async () => {
      const oldSession = newSession({
        id: randomUUID(),
        started_at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const app = createApp(pool, { distDir });
      await app.request('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session: oldSession, events: [event(0)] }),
      });

      const deleted = await deleteOldSessions(pool, 180);
      expect(deleted).toBeGreaterThanOrEqual(1);

      const { rows: sessionRows } = await pool.query('SELECT id FROM sessions WHERE id = $1', [oldSession.id]);
      expect(sessionRows).toHaveLength(0);
      const { rows: eventRows } = await pool.query('SELECT seq FROM events WHERE session_id = $1', [oldSession.id]);
      expect(eventRows).toHaveLength(0);
    });
  });
});
