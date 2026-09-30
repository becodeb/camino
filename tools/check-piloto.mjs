// Scripted check of the pilot playtest's data path: one whole session played
// through the real UI (setup, code, character, the ladder's levels with taps,
// a drag, runs, the three helps, the raised hand and the adult's answer, the
// adult menu's "end the session", the survey, the goodbye, the adult form),
// with an offline stretch in the middle; then it waits for the queue to
// drain and checks the rows in Postgres: every event there, seq 0..n-1 with
// no gaps, the session's end, survey and adult form, and the demo's progress
// key untouched.
//
// PW=<dir with playwright> node tools/check-piloto.mjs [base] [grade]
//   base: the app with /api (vite dev on 8811 proxying to the API, or the API serving dist/), default http://127.0.0.1:8811/
//   PSQL: the command that runs psql against the API's database, default
//         "docker exec -i camino-prueba-t2db psql -U postgres -tA"
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const [base = 'http://127.0.0.1:8811/', grade = '1ro'] = process.argv.slice(2);
const PSQL = process.env.PSQL ?? 'docker exec -i camino-prueba-t2db psql -U postgres -tA';
const sql = (q) => execSync(PSQL, { input: q }).toString().trim();

let failures = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failures++; };

async function hold(p, x, y, ms) {
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.waitForTimeout(ms);
  await p.mouse.up();
}
const center = async (p, sel) => { const b = await p.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(m.text())) errors.push(m.text()); });

await p.goto(`${base}?debug#/piloto`);
await p.waitForSelector('.pp-setup');

// the adult's setup and the code
await p.getByRole('button', { name: grade, exact: true }).click();
await p.getByRole('button', { name: 'A', exact: true }).click();
await p.getByRole('checkbox').click();
await p.getByRole('button', { name: 'Empezar' }).click();
const code = await p.locator('.pp-code-word').getAttribute('data-code');
ok(/^\p{Lu}\p{Ll}+ [1-9]\d$/u.test(code), `session code "${code}"`);
const sid = await p.evaluate(() => window.__piloto.session().id);
await p.getByRole('button', { name: 'Empezar' }).click();

// the character
await p.waitForSelector('.choice-row');
await p.waitForTimeout(500);
await p.locator('[data-choice-char="mina"]').click();
await p.waitForTimeout(600);
await p.locator('.doors-next').click({ force: true });

// placeholder: tool check (skipped by its page to turn)
await p.waitForSelector('.pp-soon');
await p.locator('.pp-soon .next-page').click({ force: true });

// ladder level 1: a tap, a drag, a run that bumps or falls short, the helps
await p.waitForSelector('main.level');
await p.waitForTimeout(900);
await p.locator('.zone-palette [data-cmd="right"]').first().click();
await p.waitForTimeout(300);
const [fx, fy] = await center(p, '.zone-palette [data-cmd="down"]');
const [tx, ty] = await center(p, '.zone-program');
await p.mouse.move(fx, fy); await p.mouse.down(); await p.mouse.move(fx + 30, fy + 10, { steps: 4 }); await p.mouse.move(tx, ty, { steps: 12 }); await p.mouse.up();
await p.waitForTimeout(400);
await p.locator('.btn-play').click();
await p.waitForTimeout(600);
await p.waitForFunction(() => document.querySelector('main.level')?.dataset.busy !== 'true', null, { timeout: 20000 });

// offline from here: the helps, the hand, the adult's answer, the win
await ctx.setOffline(true);
await p.locator('.level-bar .help').click(); await p.waitForTimeout(700);
await p.locator('.level-bar .help').click(); await p.waitForTimeout(3000);
await p.locator('.level-bar .help').click(); await p.waitForTimeout(1500);
await p.locator('.level-bar .speak').click(); await p.waitForTimeout(300);
await p.locator('.level-bar .help').click(); await p.waitForTimeout(800);
ok(await p.locator('.pp-hand').isVisible(), 'a fourth ✋ raises the hand');
const [hx, hy] = await center(p, '.pp-hand');
await hold(p, hx, hy, 1500);
await p.locator('[data-kind="hint"]').click();
ok(!(await p.locator('.pp-hand').count()), 'the adult answered: the hand is down');
await p.evaluate(() => { window.__camino.setProgram(window.__camino.level.solution); });
await p.waitForTimeout(300);
await p.locator('.btn-play').click();
await p.waitForSelector('.next-page', { timeout: 20000 });
await p.waitForTimeout(600);
const offlinePending = await p.evaluate(() => window.__piloto.status());
ok(offlinePending.pending > 5 && offlinePending.failures > 0, `offline: ${offlinePending.pending} events wait, ${offlinePending.failures} failed posts`);
await p.locator('.next-page').click({ force: true });
await p.waitForTimeout(1200);
await ctx.setOffline(false);

// ladder level 2: hold ✋ one second (the hand), then the adult ends the session from the corner
await p.waitForTimeout(900);
const [bx, by] = await center(p, '.level-bar .help');
await hold(p, bx, by, 1300);
ok(await p.locator('.pp-hand').isVisible(), 'holding ✋ raises the hand');
await hold(p, 18, 18, 1700);
await p.locator('[data-act="end"]').click();
await p.locator('[data-act="end-confirm"]').click();

// the survey
await p.waitForSelector('.pp-survey');
for (const [q, a] of [['liked', 'yes'], ['difficulty', 'mid']]) {
  await p.waitForSelector(`[data-question="${q}"]`);
  await p.locator(`[data-answer="${a}"]`).click();
  await p.waitForTimeout(1300);
}
await p.waitForSelector('[data-question="favorite_activity"]');
await p.locator('[data-answer="ladder"]').click();
await p.waitForTimeout(1300);
await p.waitForSelector('[data-question="play_again"]');
await p.locator('[data-answer="yes"]').click();

// goodbye and the adult form
await p.waitForSelector('.pp-bye');
await p.waitForTimeout(1200);
await p.locator('.pp-for-adult').click();
await p.locator('[data-value="high"]').click();
await p.locator('[data-value="some"]').click();
await p.fill('.pp-comment textarea', 'Probó arrastrar sin ayuda.');
await p.getByRole('button', { name: 'Guardar' }).click();

// the queue drains
let st;
for (let i = 0; i < 90; i++) {
  await p.evaluate(() => window.__piloto.flush());
  st = await p.evaluate(() => window.__piloto.status());
  if (st.pending === 0 && st.dirty === 0) break;
  await p.waitForTimeout(1000);
}
ok(st.pending === 0 && st.dirty === 0, `queue drained (pending ${st.pending}, dirty ${st.dirty})`);
const demoKey = await p.evaluate(() => localStorage.getItem('camino.progress.v1'));
ok(demoKey === null, 'the demo\'s camino.progress.v1 was never written');
ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();

// the database
const rows = sql(`select seq from events where session_id = '${sid}' order by seq;`).split('\n').filter(Boolean).map(Number);
ok(rows.length > 20 && rows.every((s, i) => s === i), `${rows.length} events in Postgres, seq 0..${rows.length - 1} with no gaps`);
const types = sql(`select type || ':' || count(*) from events where session_id = '${sid}' group by type order by type;`).split('\n');
console.log(`     ${types.join(' ')}`);
for (const t of ['step', 'choice', 'level_start', 'run', 'level_end', 'help', 'ghost_demo', 'speak', 'tap_add', 'drag', 'call_adult', 'adult_help', 'survey_answer', 'garden_view']) {
  ok(types.some((x) => x.startsWith(`${t}:`)), `has ${t}`);
}
const sess = JSON.parse(sql(`select row_to_json(s) from (select code, grade, division, consent, ended_at is not null as ended, end_reason, current_step, survey, adult_form from sessions where id = '${sid}') s;`));
ok(sess.code === code && sess.division === 'A' && sess.consent === true, `session ${sess.code}, grade ${sess.grade}, division ${sess.division}`);
ok(sess.ended && sess.end_reason === 'adult_ended', `ended, end_reason ${sess.end_reason}`);
ok(sess.survey?.liked === 'yes' && sess.survey?.favorite_activity === 'ladder' && sess.survey?.play_again === 'yes', `survey ${JSON.stringify(sess.survey)}`);
ok(sess.adult_form?.engagement === 'high' && sess.adult_form?.help_needed === 'some', `adult form ${JSON.stringify(sess.adult_form)}`);
const helped = sql(`select payload->>'adult_helped' from events where session_id = '${sid}' and type = 'level_end' order by seq limit 1;`);
ok(helped === 'true', 'the first level_end records the adult help');
const offlineRun = sql(`select count(*) from events where session_id = '${sid}' and type = 'run' and (payload->>'after_ghost')::boolean;`);
ok(Number(offlineRun) >= 1, 'a run after the ghost demo is marked after_ghost');

console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
