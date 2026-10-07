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
import { deleteOldCommands, deleteOldDemoSessions, deleteOldSessions } from './retention.ts';
import { createLoginLimiter, signCookie } from './lib/adminSession.ts';
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
    expect(body).toEqual({ ok: true, acked: [0, 1], commands: [], settings: { sound: 'link' } });

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

  it('v_probe_game_maker sums up the step-by-step game maker per session; the by-grade view counts each step for RQ 8', async () => {
    const app = createApp(pool, { distDir });
    const post = (session: Record<string, unknown>, events: unknown[]) => app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, events }),
    });
    const ev = (seq: number, type: string, payload: Record<string, unknown>) => event(seq, { type, payload });
    const edit = (seq: number, phase: string, op: string, object: string, hat: string | null, action: string | null, extra: Record<string, unknown> = {}) =>
      ev(seq, 'rule_edit', { probe: 'game_maker', phase, object, hat, action, op, rules: 9, running: false, ...extra });
    const run = (seq: number, phase: string, result: string, keys: number, heard = 0) =>
      ev(seq, 'game_run', { probe: 'game_maker', phase, result, keys, duration_ms: 20_000, score: 3, lives: 2, rules: `me[key:left>move:left] game[points:5>win] #${seq}`, rule_count: 9, objects: ['me', 'game'], broadcasts: [], messages_heard: heard, win_points: 5, lose_lives: true });
    const step = (seq: number, phase: string, completed: boolean, time_ms: number, help_levels = 0, o: { skipped?: boolean; ghost_built?: boolean } = {}) =>
      ev(seq, 'probe_phase', { probe: 'game_maker', phase, completed, skipped: !!o.skipped, time_ms, help_levels, ghost_built: !!o.ghost_built, runs: 1, edits: 2 });
    // 4to (no other test writes grade 4): one child goes all the way, one leaves during step 2
    const a = newSession({ grade: 4 });
    expect((await post(a, [
      ev(0, 'choice', { activity: 'game_maker', visit: 1 }),
      edit(1, 'move', 'add', 'me', 'key:right', null),
      edit(2, 'move', 'add', 'me', 'key:right', 'move:right'),
      run(3, 'move', 'stopped', 6),
      step(4, 'move', true, 40_000),
      edit(5, 'stone', 'add', 'stone', 'tick', null),
      run(6, 'stone', 'stopped', 0),
      step(7, 'stone', true, 70_000, 2),
      step(8, 'seed_read', true, 9_000),
      // ✋ 3: the ghost built the rules (not the child's edits)
      edit(9, 'touch_rules', 'add', 'me', 'touch:stone', null, { ghost: true }),
      run(10, 'touch_rules', 'stopped', 20),
      step(11, 'touch_rules', true, 80_000, 3, { ghost_built: true }),
      // "seguir" after the wait: the rule is left built (ghost, filled)
      edit(12, 'win', 'add', 'game', 'points:5', null, { ghost: true, filled: true }),
      step(13, 'win', false, 95_000, 0, { skipped: true }),
      edit(14, 'free', 'add', 'bird', null, null),
      edit(15, 'free', 'add', 'bird', 'recv:yum', null),
      edit(16, 'free', 'add', 'bird', 'recv:yum', 'say:pio'),
      edit(17, 'free', 'add', 'seed', 'touch:me', 'send:yum'),
      edit(18, 'free', 'change', 'stone', 'tick', 'move:down', { from: 'move:right', to: 'move:down' }),
      run(19, 'free', 'win', 30, 2),
      run(20, 'free', 'lose', 25),
      step(21, 'free', false, 180_000),
      ev(22, 'survey_answer', { question: 'game_maker_liked', answer: 'yes' }),
      ev(23, 'probe_end', { probe: 'game_maker', reason: 'done', time_ms: 480_000 }),
    ])).status).toBe(200);
    const b = newSession({ grade: 4 });
    expect((await post(b, [
      ev(0, 'choice', { activity: 'game_maker', visit: 1 }),
      step(1, 'move', true, 25_000),
      run(2, 'stone', 'stopped', 0),
      ev(3, 'probe_end', { probe: 'game_maker', reason: 'left', time_ms: 50_000 }),
    ])).status).toBe(200);
    // a round-1 session (phases play/change/make, Scratch predictions): a row, its step columns empty
    const c = newSession({ grade: 4 });
    expect((await post(c, [
      ev(0, 'probe_phase', { probe: 'game_maker', phase: 'play', completed: true, time_ms: 60_000, runs: 1, edits: 0, help_levels: 0 }),
      ev(1, 'scratch_predict', { item: 'key', answer: 'right', correct: true, position: 1, time_ms: 4000 }),
    ])).status).toBe(200);

    const r = (await pool.query('SELECT * FROM v_probe_game_maker WHERE session_id = $1', [a.id])).rows[0];
    expect([Number(r.steps_reached), Number(r.steps_alone), Number(r.steps_with_help), Number(r.steps_skipped)]).toEqual([5, 2, 2, 1]);
    expect([r.move_result, r.stone_result, r.seed_read_result, r.touch_rules_result, r.win_result]).toEqual(['alone', 'help', 'alone', 'help', 'skipped']);
    expect([r.move_seconds, r.stone_seconds, r.seed_read_seconds, r.touch_rules_seconds, r.win_seconds, r.free_seconds].map(Number)).toEqual([40, 70, 9, 80, 95, 180]);
    expect(r.free_reached).toBe(true);
    expect([Number(r.rule_edits), Number(r.free_edits), Number(r.free_rules_added), Number(r.free_actions_added)]).toEqual([8, 5, 1, 2]);
    expect([r.used_avisar, r.bird_added]).toEqual([true, true]);
    expect([Number(r.games_run), Number(r.games_played), Number(r.games_won), Number(r.games_lost), Number(r.free_games), Number(r.messages_heard)]).toEqual([5, 4, 1, 1, 2, 2]);
    expect([r.liked, r.end_reason, Number(r.probe_seconds)]).toEqual(['yes', 'done', 480]);
    expect(r.last_rules).toContain('#20');

    const left = (await pool.query('SELECT * FROM v_probe_game_maker WHERE session_id = $1', [b.id])).rows[0];
    expect([Number(left.steps_reached), left.move_result, left.stone_result, left.free_reached, Number(left.games_run), left.liked, left.end_reason]).toEqual([1, 'alone', null, false, 1, null, 'left']);
    const old = (await pool.query('SELECT * FROM v_probe_game_maker WHERE session_id = $1', [c.id])).rows[0];
    expect([Number(old.steps_reached), old.move_result]).toEqual([0, null]);

    const g = (await pool.query('SELECT * FROM v_probe_game_maker_by_grade WHERE grade = 4')).rows[0];
    expect(Number(g.sessions)).toBe(3);
    expect([g.move_alone, g.move_help, g.move_skipped, g.stone_help, g.touch_rules_help, g.win_skipped].map(Number)).toEqual([2, 0, 0, 1, 1, 1]);
    expect(Number(g.move_median_s)).toBe(32.5);
    expect([g.free_reached, g.changed_in_free, g.used_avisar, g.added_the_bird, g.won_a_game, g.liked_yes].map(Number)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(Number(g.median_free_rules_added)).toBe(1);
  });

  it('v_probe_text reports each idea of the text probe (T16) done alone, with help or skipped, and right at the first try; the by-grade view counts them', async () => {
    const app = createApp(pool, { distDir });
    const post = (session: Record<string, unknown>, events: unknown[]) => app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, events }),
    });
    const ev = (seq: number, type: string, payload: Record<string, unknown>) => event(seq, { type, payload });
    const phase = (seq: number, step: string, completed: boolean, seconds: number, extra: Record<string, unknown> = {}) =>
      ev(seq, 'probe_phase', { probe: 'text', phase: step, completed, skipped: !completed, time_ms: seconds * 1000, help_levels: 0, ghost: false, teach_runs: 1, links: 0, ...extra });
    const task = (seq: number, item: string, kind: string, step: string, reason: string, correct: boolean, firstTry: boolean, extra: Record<string, unknown> = {}) =>
      ev(seq, 'text_item', { item, kind, step, reason, correct, first_try: firstTry, attempts: 1, errors: [], time_ms: 20_000, help_levels: 0, ghost: false, adult_helped: false, ...extra });
    const run = (seq: number, item: string, ok: boolean, result: string | null, error_kind: string | null = null) =>
      ev(seq, 'text_run', { item, step: item.split('_')[0], ok, result, error_kind, line: error_kind ? 2 : null, attempt: 1 });
    // 5to: every step (seq with help, repeat with the ghost, if skipped), the stretch written
    const a = newSession({ grade: 5 });
    expect((await post(a, [
      ev(0, 'choice', { activity: 'text_probe', visit: 1 }),
      run(1, 'move_teach', true, 'win'),
      task(2, 'move_pick', 'pick', 'move', 'answered', true, false, { answer: 'abajo', attempts: 2 }),
      phase(3, 'move', true, 40, { links: 2 }),
      run(4, 'seq_teach', true, 'win'),
      run(5, 'seq_word', true, 'short'),
      run(6, 'seq_word', true, 'win'),
      task(7, 'seq_word', 'word', 'seq', 'solved', true, false, { attempts: 2, help_levels: 1, text: 'derecha()\nderecha()\narriba()' }),
      phase(8, 'seq', true, 70, { help_levels: 1 }),
      run(9, 'repeat_teach', true, 'win'),
      run(10, 'repeat_number', true, 'win'),
      task(11, 'repeat_number', 'number', 'repeat', 'solved', false, false, { help_levels: 3, ghost: true }),
      phase(12, 'repeat', true, 90, { help_levels: 3, ghost: true }),
      run(13, 'typo_fix', false, null, 'unknown_name'),
      run(14, 'typo_fix', true, 'win'),
      task(15, 'typo_fix', 'typo', 'typo', 'solved', true, false, { attempts: 2, errors: ['unknown_name'] }),
      phase(16, 'typo', true, 50, { teach_runs: 0 }),
      run(17, 'if_teach', true, 'win'),
      task(18, 'if_predict', 'predict', 'if', 'skipped', false, false, { attempts: 0 }),
      phase(19, 'if', false, 95),
      run(20, 'write_line', true, 'win'),
      task(21, 'write_line', 'write', 'write', 'solved', true, true, { text: 'derecha()\nderecha()\narriba()' }),
      phase(22, 'write', true, 30, { teach_runs: 0 }),
      ev(23, 'survey_answer', { question: 'text_probe_liked', answer: 'yes' }),
      ev(24, 'probe_end', { probe: 'text', reason: 'done', time_ms: 480_000 }),
    ])).status).toBe(200);
    // 5to: two steps alone at the first try, then left
    const b = newSession({ grade: 5 });
    expect((await post(b, [
      ev(0, 'choice', { activity: 'text_probe', visit: 1 }),
      task(1, 'move_pick', 'pick', 'move', 'answered', true, true, { answer: 'arriba' }),
      phase(2, 'move', true, 20),
      run(3, 'seq_word', true, 'win'),
      task(4, 'seq_word', 'word', 'seq', 'solved', true, true),
      phase(5, 'seq', true, 30),
      ev(6, 'probe_end', { probe: 'text', reason: 'left', time_ms: 60_000 }),
    ])).status).toBe(200);
    // a round-1 (T8) session: a row with empty step columns
    const c = newSession({ grade: 5 });
    expect((await post(c, [
      ev(0, 'probe_phase', { probe: 'text', phase: 'intro', completed: true, time_ms: 40_000, runs: 1, links: 3, help_levels: 0 }),
      ev(1, 'text_item', { item: 'predict_loop', kind: 'predict', reason: 'answered', correct: true, attempts: 1, errors: [], time_ms: 9000, help_levels: 0, adult_helped: false }),
      ev(2, 'text_run', { item: 'tour', ok: true, result: 'win', error_kind: null, line: null }),
    ])).status).toBe(200);

    const r = (await pool.query('SELECT * FROM v_probe_text WHERE session_id = $1', [a.id])).rows[0];
    expect([Number(r.steps_reached), Number(r.steps_alone), Number(r.steps_with_help), Number(r.steps_skipped)]).toEqual([5, 2, 2, 1]);
    expect([r.move_result, r.seq_result, r.repeat_result, r.typo_result, r.if_result, r.write_result]).toEqual(['alone', 'help', 'help', 'alone', 'skipped', 'alone']);
    expect([r.move_seconds, r.seq_seconds, r.repeat_seconds, r.typo_seconds, r.if_seconds, r.write_seconds].map(Number)).toEqual([40, 70, 90, 50, 95, 30]);
    expect([r.move_first_try, r.seq_first_try, r.repeat_first_try, r.typo_first_try, r.if_first_try]).toEqual([false, false, false, false, false]);
    expect([r.move_answer, r.if_answer, r.write_text]).toEqual(['abajo', null, 'derecha()\nderecha()\narriba()']);
    expect([Number(r.tasks_correct), Number(r.tasks_first_try), Number(r.teach_runs), Number(r.links)]).toEqual([4, 1, 4, 2]);
    expect([Number(r.runs), Number(r.runs_parsed), Number(r.runs_won), Number(r.parse_errors), r.error_kinds]).toEqual([6, 5, 4, 1, 'unknown_name']);
    expect([r.liked, r.end_reason, Number(r.probe_seconds)]).toEqual(['yes', 'done', 480]);

    const left = (await pool.query('SELECT * FROM v_probe_text WHERE session_id = $1', [b.id])).rows[0];
    expect([Number(left.steps_reached), Number(left.steps_alone), left.move_first_try, left.seq_first_try, left.repeat_result, left.end_reason]).toEqual([2, 2, true, true, null, 'left']);
    const old = (await pool.query('SELECT * FROM v_probe_text WHERE session_id = $1', [c.id])).rows[0];
    expect([Number(old.steps_reached), old.move_result, Number(old.tasks_correct), Number(old.runs)]).toEqual([0, null, 0, 0]);

    const g = (await pool.query('SELECT * FROM v_probe_text_by_grade WHERE grade = 5')).rows[0];
    expect(Number(g.sessions)).toBe(3);
    expect([g.move_alone, g.move_first_try, g.seq_alone, g.seq_help, g.seq_first_try, g.repeat_help, g.typo_alone, g.if_skipped, g.write_reached, g.write_alone].map(Number)).toEqual([2, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect([Number(g.move_median_s), Number(g.seq_median_s), Number(g.median_steps_alone), Number(g.parse_errors), Number(g.liked_yes)]).toEqual([30, 50, 2, 1, 1]);
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
    expect(await second.json()).toEqual({ ok: true, acked: [0, 1], commands: [], settings: { sound: 'link' } });

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
  // ------------------------------------------------------------------ T14: the classroom round

  describe('admin login (password, cookie, brute force)', () => {
    const PW = 'throwaway-test-password';
    const json = { 'content-type': 'application/json' };
    const login = (app: ReturnType<typeof createApp>, password: unknown, headers: Record<string, string> = {}) =>
      app.request('/api/admin/login', { method: 'POST', headers: { ...json, ...headers }, body: JSON.stringify({ password }) });
    const cookieFrom = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0];

    it('is 503 without ADMIN_PASSWORD; 401 with a wrong password (no cookie)', async () => {
      expect((await login(createApp(pool, { adminToken: 't', distDir }), 'x')).status).toBe(503);
      const app = createApp(pool, { adminToken: 't', adminPassword: PW, adminLimiter: createLoginLimiter(), distDir });
      const res = await login(app, 'wrong');
      expect(res.status).toBe(401);
      expect(res.headers.get('set-cookie')).toBeNull();
      expect((await login(app, '')).status).toBe(401);
      expect((await login(app, 42)).status).toBe(401);
    });

    it('the right password sets a signed HttpOnly SameSite=Strict cookie for 12 h that opens the admin API', async () => {
      const app = createApp(pool, { adminToken: 't', adminPassword: PW, adminLimiter: createLoginLimiter(), distDir });
      const res = await login(app, PW);
      expect(res.status).toBe(200);
      const set = res.headers.get('set-cookie') ?? '';
      expect(set).toMatch(/^camino_admin=v1\.\d+\.[A-Za-z0-9_-]{43}; Path=\/; Max-Age=43200; HttpOnly; SameSite=Strict$/);
      expect(set).not.toContain(PW);
      const cookie = cookieFrom(res);
      expect((await app.request('/api/admin/me', { headers: { cookie } })).status).toBe(200);
      expect((await app.request('/api/admin/summary', { headers: { cookie } })).status).toBe(200);
      expect((await app.request('/api/admin/summary')).status).toBe(401);
      // behind the https proxy the cookie is Secure
      expect((await login(app, PW, { 'x-forwarded-proto': 'https' })).headers.get('set-cookie')).toMatch(/; Secure$/);
      // the Bearer token still works for the tools
      expect((await app.request('/api/admin/summary', { headers: { authorization: 'Bearer t' } })).status).toBe(200);
    });

    it('refuses a tampered, expired or foreign cookie; a change needs the x-camino-admin header', async () => {
      const app = createApp(pool, { adminToken: 't', adminPassword: PW, adminLimiter: createLoginLimiter(), distDir });
      const good = cookieFrom(await login(app, PW));
      const tampered = good.replace(/v1\.(\d+)\./, (_m, n) => `v1.${Number(n) + 1000}.`);
      expect((await app.request('/api/admin/summary', { headers: { cookie: tampered } })).status).toBe(401);
      const expired = `camino_admin=${signCookie({ token: 't', password: PW }, Math.floor(Date.now() / 1000) - 50_000)}`;
      expect((await app.request('/api/admin/summary', { headers: { cookie: expired } })).status).toBe(401);
      const foreign = `camino_admin=${signCookie({ token: 't', password: 'another' })}`;
      expect((await app.request('/api/admin/summary', { headers: { cookie: foreign } })).status).toBe(401);
      const noHeader = await app.request('/api/admin/commands', { method: 'POST', headers: { ...json, cookie: good }, body: JSON.stringify({ kind: 'five_min' }) });
      expect(noHeader.status).toBe(403);
      const logout = await app.request('/api/admin/logout', { method: 'POST' });
      expect(logout.headers.get('set-cookie')).toMatch(/^camino_admin=; Path=\/; Max-Age=0; HttpOnly; SameSite=Strict$/);
      expect((await pool.query('SELECT count(*)::int AS n FROM class_commands')).rows[0].n).toBe(0);
    });

    it('locks a client out after 10 wrong tries in 10 minutes (even with the right password), not the others', async () => {
      const app = createApp(pool, { adminToken: 't', adminPassword: PW, adminLimiter: createLoginLimiter(), distDir });
      const a = { 'x-forwarded-for': '203.0.113.7' };
      for (let i = 0; i < 10; i++) expect((await login(app, `guess-${i}`, a)).status).toBe(401);
      const blocked = await login(app, PW, a);
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(500);
      expect((await login(app, PW, { 'x-forwarded-for': '203.0.113.8' })).status).toBe(200);
      // Cloudflare's header names the client when present
      expect((await login(app, PW, { 'cf-connecting-ip': '203.0.113.7' })).status).toBe(429);
    });

    it('the limiter: a success clears the client; the window ends; a global cap stops many addresses', () => {
      const l = createLoginLimiter(3, 5, 1000);
      l.fail('a', 0); l.fail('a', 0);
      l.ok('a');
      l.fail('a', 0); l.fail('a', 0);
      expect(l.blockedFor('a', 10)).toBe(0);
      l.fail('a', 10);
      expect(l.blockedFor('a', 10)).toBe(990);
      expect(l.blockedFor('a', 1000)).toBe(0);
      const g = createLoginLimiter(100, 5, 1000);
      for (let i = 0; i < 5; i++) g.fail(`ip${i}`, 0);
      expect(g.blockedFor('fresh', 1)).toBe(999);
    });
  });

  describe('class commands', () => {
    const auth = { authorization: 'Bearer t', 'content-type': 'application/json' };
    const app = () => createApp(pool, { adminToken: 't', distDir });
    const sync = async (a: ReturnType<typeof createApp>, session: Record<string, unknown>, events: unknown[] = []) => {
      const res = await a.request('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session, events }) });
      expect(res.status).toBe(200);
      return (await res.json()) as { commands: Array<{ id: number; kind: string; cancelled: boolean; at: string; expires_at: string }> };
    };
    const send = async (a: ReturnType<typeof createApp>, kind: string) => {
      const res = await a.request('/api/admin/commands', { method: 'POST', headers: auth, body: JSON.stringify({ kind }) });
      return res;
    };

    it('hands a command to every session active now, also to one that comes back online; never to a session started after it', async () => {
      await pool.query('DELETE FROM class_commands');
      const a = app();
      const early = new Date(Date.now() - 20 * 60_000).toISOString();
      const online = newSession({ started_at: early });
      const offline = newSession({ started_at: early });
      expect((await sync(a, online)).commands).toEqual([]);
      const res = await send(a, 'five_min');
      expect(res.status).toBe(200);
      const { command } = await res.json() as { command: { id: number; kind: string } };
      expect(command.kind).toBe('five_min');
      // the online device on its next poll; the same command again on the one after (the client applies each id once)
      const got = (await sync(a, online)).commands;
      expect(got.map((c) => [c.id, c.kind, c.cancelled])).toEqual([[command.id, 'five_min', false]]);
      expect(Date.parse(got[0].expires_at) - Date.parse(got[0].at)).toBe(2 * 60 * 60_000);
      expect((await sync(a, online)).commands).toHaveLength(1);
      // the device that was offline while it was sent: its first sync, later
      expect((await sync(a, offline, [event(0)])).commands.map((c) => c.id)).toEqual([command.id]);
      // a child who starts after the command
      expect((await sync(a, newSession())).commands).toEqual([]);
      // "terminar la clase" too
      const end = (await (await send(a, 'end_class')).json()) as { command: { id: number } };
      expect((await sync(a, online)).commands.map((c) => c.kind)).toEqual(['five_min', 'end_class']);
      expect(end.command.id).toBeGreaterThan(command.id);
      // T22 (back-to-back classes): a new child's session on this same device, after "terminar la clase",
      // never sees the five_min or the end_class that just closed the class before it
      expect((await sync(a, newSession())).commands).toEqual([]);
      await pool.query('DELETE FROM class_commands');
    });

    it('a device clock running ahead does not hide a session the server saw before the command', async () => {
      await pool.query('DELETE FROM class_commands');
      const a = app();
      const ahead = newSession({ started_at: new Date(Date.now() + 10 * 60_000).toISOString() });
      await sync(a, ahead);
      await new Promise((r) => setTimeout(r, 20));
      await send(a, 'five_min');
      expect((await sync(a, ahead)).commands.map((c) => c.kind)).toEqual(['five_min']);
      await pool.query('DELETE FROM class_commands');
    });

    it('"cancelar aviso" marks the warning cancelled; expired commands and sessions not seen for 2 h get nothing', async () => {
      await pool.query('DELETE FROM class_commands');
      const a = app();
      const s = newSession({ started_at: new Date(Date.now() - 60_000).toISOString() });
      await sync(a, s);
      await send(a, 'five_min');
      const cancel = await a.request('/api/admin/commands/cancel', { method: 'POST', headers: auth });
      expect(await cancel.json()).toEqual({ ok: true, cancelled: 1 });
      expect((await sync(a, s)).commands.map((c) => [c.kind, c.cancelled])).toEqual([['five_min', true]]);
      await pool.query(`UPDATE class_commands SET expires_at = now() - interval '1 second'`);
      expect((await sync(a, s)).commands).toEqual([]);
      await pool.query('DELETE FROM class_commands');
      // a session last seen three hours before the command (a tab left open since a morning class)
      const stale = newSession({ started_at: new Date(Date.now() - 4 * 3600_000).toISOString() });
      await sync(a, stale);
      await pool.query(`UPDATE sessions SET last_seen_at = now() - interval '3 hours' WHERE id = $1`, [stale.id]);
      await send(a, 'end_class');
      expect((await sync(a, stale)).commands).toEqual([]);
      // the summary lists the live commands
      const sum = await (await a.request('/api/admin/summary', { headers: auth })).json() as { commands: Array<{ kind: string }> };
      expect(sum.commands.map((c) => c.kind)).toEqual(['end_class']);
      expect((await send(a, 'reboot')).status).toBe(400);
      await pool.query('DELETE FROM class_commands');
      expect(await deleteOldCommands(pool)).toBe(0);
    });
  });

  describe('the sound setting (T18)', () => {
    const auth = { authorization: 'Bearer t', 'content-type': 'application/json' };
    const app = () => createApp(pool, { adminToken: 't', distDir });
    const settings = (a: ReturnType<typeof createApp>) => a.request('/api/class-settings');
    const sync = async (a: ReturnType<typeof createApp>, session: Record<string, unknown>) => {
      const res = await a.request('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session, events: [] }) });
      expect(res.status).toBe(200);
      return (await res.json()) as { settings: { sound: string } };
    };

    it('GET /api/class-settings is public, cheap, never cached, and link by default', async () => {
      await pool.query(`DELETE FROM class_settings`);
      const a = app();
      const res = await settings(a);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.json()).toEqual({ sound: 'link', expires_at: null });
    });

    it('POST /api/admin/settings needs auth, validates the value, and the new value shows at once on the public endpoint and in /api/sync', async () => {
      await pool.query(`DELETE FROM class_settings`);
      const a = app();
      expect((await a.request('/api/admin/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sound: 'off' }) })).status).toBe(401);
      const bad = await a.request('/api/admin/settings', { method: 'POST', headers: auth, body: JSON.stringify({ sound: 'mute' }) });
      expect(bad.status).toBe(400);
      const res = await a.request('/api/admin/settings', { method: 'POST', headers: auth, body: JSON.stringify({ sound: 'off' }) });
      expect(res.status).toBe(200);
      const body = await res.json() as { ok: true; setting: { value: string; expires_at: string | null } };
      expect(body.setting.value).toBe('off');
      expect(body.setting.expires_at).not.toBeNull();
      expect(await (await settings(a)).json()).toMatchObject({ sound: 'off' });
      const got = await sync(a, newSession());
      expect(got.settings).toEqual({ sound: 'off' });
      // a device already open gets the change within one sync cycle (no new session needed)
      await a.request('/api/admin/settings', { method: 'POST', headers: auth, body: JSON.stringify({ sound: 'on' }) });
      expect((await sync(a, newSession())).settings).toEqual({ sound: 'on' });
    });

    it('expires 4 hours after being set: falls back to "link" by itself', async () => {
      await pool.query(`DELETE FROM class_settings`);
      const a = app();
      await a.request('/api/admin/settings', { method: 'POST', headers: auth, body: JSON.stringify({ sound: 'off' }) });
      expect(await (await settings(a)).json()).toMatchObject({ sound: 'off' });
      await pool.query(`UPDATE class_settings SET expires_at = now() - interval '1 second' WHERE key = 'sound'`);
      expect(await (await settings(a)).json()).toMatchObject({ sound: 'link', expires_at: null });
    });

    it('setting it again (on, then link) replaces the row rather than accumulating rows', async () => {
      await pool.query(`DELETE FROM class_settings`);
      const a = app();
      await a.request('/api/admin/settings', { method: 'POST', headers: auth, body: JSON.stringify({ sound: 'on' }) });
      await a.request('/api/admin/settings', { method: 'POST', headers: auth, body: JSON.stringify({ sound: 'link' }) });
      const { rows } = await pool.query(`SELECT value FROM class_settings WHERE key = 'sound'`);
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe('link');
      await pool.query(`DELETE FROM class_settings`);
    });

    it('a class-settings request is rate-limited per IP (the same shape as /api/sync, a smaller cap)', async () => {
      const a = createApp(pool, { adminToken: 't', distDir, classSettingsRateLimit: 2 });
      expect((await settings(a)).status).toBe(200);
      expect((await settings(a)).status).toBe(200);
      expect((await settings(a)).status).toBe(429);
    });

    it('/api/admin/summary carries the live setting too', async () => {
      await pool.query(`DELETE FROM class_settings`);
      const a = app();
      await a.request('/api/admin/settings', { method: 'POST', headers: auth, body: JSON.stringify({ sound: 'on' }) });
      const sum = await (await a.request('/api/admin/summary', { headers: auth })).json() as { sound_setting: { value: string } };
      expect(sum.sound_setting.value).toBe('on');
      await pool.query(`DELETE FROM class_settings`);
    });
  });

  describe('demo sessions', () => {
    it('are stored with demo = true but left out of the export, /admin and every view; deleted after 24 h', async () => {
      const a = createApp(pool, { adminToken: 't', exportToken: 'x', distDir });
      const post = (session: Record<string, unknown>, events: unknown[]) => a.request('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session, events }) });
      const evs = [
        event(0, { type: 'level_start', payload: { level_id: 'pp-l1', activity: 'ladder' } }),
        event(1, { type: 'level_end', payload: { level_id: 'pp-l1', activity: 'ladder', outcome: 'win' } }),
        event(2, { type: 'ladder_step', payload: { concept: 'sequence', rung: 1, item: 'pp-l1', result: 'pass', check: 'climb' } }),
        event(3, { type: 'typing', payload: { key: 'a', expected: 'a', correct: true, latency_ms: 900, round: 1 } }),
        event(4, { type: 'route_done', payload: { time_ms: 1000 } }),
      ];
      const demo = newSession({ code: 'Demo 1', grade: 4, demo: true });
      const real = newSession({ code: 'Real 1', grade: 4 });
      expect((await post(demo, evs)).status).toBe(200);
      expect((await post(real, evs)).status).toBe(200);
      // a later sync without the flag never turns a demo session real
      expect((await post({ ...demo, demo: false }, [])).status).toBe(200);
      expect((await pool.query('SELECT demo FROM sessions WHERE id = $1', [demo.id])).rows[0].demo).toBe(true);
      expect((await post(newSession({ demo: 'yes' }), [])).status).toBe(400);

      const exp = await (await a.request('/api/export?format=json', { headers: { authorization: 'Bearer x' } })).json() as { sessions: Array<{ id: string }>; events: Array<{ session_id: string }> };
      expect(exp.sessions.map((s) => s.id)).toContain(real.id);
      expect(exp.sessions.map((s) => s.id)).not.toContain(demo.id);
      expect(exp.events.some((e) => e.session_id === demo.id)).toBe(false);
      const csv = await (await a.request('/api/export?format=csv&table=events', { headers: { authorization: 'Bearer x' } })).text();
      expect(csv).not.toContain(demo.id);
      const adminCsv = await (await a.request('/api/admin/export?format=csv&table=sessions', { headers: { authorization: 'Bearer t' } })).text();
      expect(adminCsv).not.toContain(demo.id);

      const sum = await (await a.request('/api/admin/summary', { headers: { authorization: 'Bearer t' } })).json() as {
        sessions: Array<{ session_id: string; route_done: boolean; survey_done: boolean; in_class: boolean }>; demo_hidden: number; class_counts: { route_done: number };
      };
      expect(sum.sessions.map((s) => s.session_id)).not.toContain(demo.id);
      const mine = sum.sessions.find((s) => s.session_id === real.id)!;
      expect(mine).toMatchObject({ route_done: true, survey_done: false, in_class: true });
      expect(sum.demo_hidden).toBe(1);
      expect(sum.class_counts.route_done).toBeGreaterThanOrEqual(1);

      for (const v of ['v_session_summary', 'v_ladder_ceiling', 'v_activity_time']) {
        const { rows } = await pool.query(`SELECT session_id FROM ${v} WHERE session_id IN ($1, $2)`, [demo.id, real.id]);
        expect(rows.map((r) => r.session_id), v).toEqual([real.id]);
      }
      // the views by grade: grade 4 is this test's own, the demo's keys are not counted
      const t = await pool.query('SELECT attempts::int FROM v_typing_by_grade WHERE grade = 4');
      expect(t.rows[0].attempts).toBe(1);

      // retention: the demo session from yesterday goes, the real one stays
      expect(await deleteOldDemoSessions(pool)).toBe(0);
      await pool.query(`UPDATE sessions SET created_at = now() - interval '25 hours' WHERE id IN ($1, $2)`, [demo.id, real.id]);
      expect(await deleteOldDemoSessions(pool)).toBe(1);
      expect((await pool.query('SELECT id FROM sessions WHERE id IN ($1, $2)', [demo.id, real.id])).rows.map((r) => r.id)).toEqual([real.id]);
      expect((await pool.query('SELECT count(*)::int AS n FROM events WHERE session_id = $1', [demo.id])).rows[0].n).toBe(0);
    });

    it('every analysis view reads the real rows (migration 008 rewrote them all)', async () => {
      const { rows } = await pool.query(`SELECT viewname, definition FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'v\\_%'`);
      expect(rows.length).toBeGreaterThanOrEqual(9);
      for (const r of rows as Array<{ viewname: string; definition: string }>) {
        expect(r.definition, r.viewname).not.toMatch(/\b(FROM|JOIN)\s+(public\.)?(events|sessions)\b/);
      }
    });
  });

  describe("the previous child's comment (T22, back-to-back classes)", () => {
    const app = () => createApp(pool, { adminToken: 't', distDir });
    const post = (a: ReturnType<typeof createApp>, id: string, body: unknown) =>
      a.request(`/api/adult-form/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

    it('writes sessions.adult_form and logs an adult_form event with previous: true, once the session has ended', async () => {
      const a = app();
      const session = newSession();
      await a.request('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session: { ...session, current_step: 'goodbye' }, events: [event(0)] }) });

      // not ended yet: refused
      expect((await post(a, session.id, { engagement: 'high', help_needed: 'none' })).status).toBe(400);

      await a.request('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session: { ...session, current_step: 'goodbye', ended_at: new Date().toISOString(), end_reason: 'completed' }, events: [] }) });
      const res = await post(a, session.id, { engagement: 'high', help_needed: 'none', comment: 'Jugó solo, muy enganchado' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });

      const { rows } = await pool.query('SELECT adult_form FROM sessions WHERE id = $1', [session.id]);
      expect(rows[0].adult_form).toEqual({ engagement: 'high', help_needed: 'none', comment: 'Jugó solo, muy enganchado', step: 'goodbye' });

      const { rows: evs } = await pool.query("SELECT seq, payload FROM events WHERE session_id = $1 AND type = 'adult_form' ORDER BY seq", [session.id]);
      expect(evs).toHaveLength(1);
      expect(evs[0].seq).toBe(1); // after the one real event (seq 0): the server picks its own free seq, never colliding
      expect(evs[0].payload).toEqual({ step: 'goodbye', engagement: 'high', help_needed: 'none', comment: true, previous: true });

      // saving again replaces the form (does not accumulate events beyond the one more per save)
      await post(a, session.id, { engagement: 'low', help_needed: 'a_lot' });
      const again = await pool.query('SELECT adult_form FROM sessions WHERE id = $1', [session.id]);
      expect(again.rows[0].adult_form).toEqual({ engagement: 'low', help_needed: 'a_lot', step: 'goodbye' });
      const { rows: evs2 } = await pool.query("SELECT seq FROM events WHERE session_id = $1 AND type = 'adult_form'", [session.id]);
      expect(evs2).toHaveLength(2);
    });

    it('refuses an unknown id, a demo session, a bad body, and rate-limits per IP', async () => {
      const a = app();
      expect((await post(a, 'not-a-uuid', {})).status).toBe(400);
      expect((await post(a, randomUUID(), {})).status).toBe(404);

      const demo = newSession({ demo: true, ended_at: new Date().toISOString(), end_reason: 'demo_ended' });
      await a.request('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session: demo, events: [] }) });
      expect((await post(a, demo.id, { engagement: 'high', help_needed: 'none' })).status).toBe(404);

      const ended = newSession({ ended_at: new Date().toISOString(), end_reason: 'completed' });
      await a.request('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session: ended, events: [] }) });
      expect((await post(a, ended.id, { engagement: 'mucho' })).status).toBe(400);
      expect((await post(a, ended.id, { help_needed: 'bastante' })).status).toBe(400);

      const limited = createApp(pool, { distDir, adultFormRateLimit: 2 });
      expect((await post(limited, ended.id, { engagement: null, help_needed: null })).status).toBe(200);
      expect((await post(limited, ended.id, { engagement: null, help_needed: null })).status).toBe(200);
      expect((await post(limited, ended.id, { engagement: null, help_needed: null })).status).toBe(429);
    });
  });
});
