// T38: the child's name (4to by default; also used by 5to), scripted end to
// end against the real bookmark `?grado=4`.
//
// - A fresh device shows "¿Cómo te llamás?" straight after the grade cards
//   are skipped by `?grado=4` (default on for 4to/5to), before the
//   character choice; "Listo" stays disabled until a usable name is typed;
//   Enter submits.
// - The name reaches Postgres (`sessions.child_name`), `/api/admin/summary`
//   (JSON) and `/admin`'s own live table (HTML), first column.
// - A reload resumes past the name screen without asking again (the same
//   session, the same name).
// - "Terminar la clase" + the lid closing and reopening (T28's own
//   simulated `visibilitychange`, same as check-backtoback.mjs) starts a
//   fresh session for the next child on the same bookmark: the name screen
//   asks again, from empty.
// - A 4to survey question is screenshotted too (T38 §5: the question's text
//   large inside the card, not just small in the bar).
//
// PW=<dir with playwright> ADMIN_PASSWORD=<local throwaway> node tools/check-name.mjs [base]
//   base:     the app with /api and /admin (the API serving a build, e.g. http://127.0.0.1:8810/, the default)
//   PSQL:     optional, psql against the API's database (e.g. "docker exec -i camino-prueba-t38db psql -U postgres -tA")
//   SHOTS:    optional directory: the name screen, /admin with names, a 4to survey question (<name>-<width>.png)
//   VIEWPORT: e.g. 1280x800 (default 1366x768)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const base = (process.argv[2] ?? 'http://127.0.0.1:8810/').replace(/\/?$/, '/');
const PASSWORD = process.env.ADMIN_PASSWORD;
const SHOTS = process.env.SHOTS ?? '';
const [VW, VH] = (process.env.VIEWPORT ?? '1366x768').split('x').map(Number);
const PSQL = process.env.PSQL ?? '';
if (!PASSWORD) { console.error('ADMIN_PASSWORD is required (a local throwaway)'); process.exit(2); }

let failures = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failures++; return cond; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${name}-${VW}.png`) }); };
const sql = (q) => (PSQL ? execSync(PSQL, { input: q }).toString().trim() : '');

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
const newPage = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch|401|429/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  return p;
};
/** T28: the lid closes and reopens (a real close/open is untestable headless), same `visibilitychange` check-backtoback.mjs uses. */
const closeAndReopenLid = async (p) => {
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(2200);
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
};

try {
  // ---------------------------------------------------------------- el docente logs in
  const a = await newPage('admin');
  await a.goto(`${base}admin`);
  await a.waitForSelector('#login-card:not([hidden])', { timeout: 30_000 });
  await a.fill('#password', PASSWORD);
  await a.click('#login-btn');
  await a.waitForSelector('#panel:not([hidden])', { timeout: 10_000 });
  ok(true, '/admin: logged in');

  // ---------------------------------------------------------------- the bookmark, 4to: the name screen before the character choice
  const p = await newPage('device');
  await p.goto(`${base}?debug&nointro&grado=4#/piloto`);
  await p.waitForSelector('.pp-name-input', { timeout: 30_000 });
  ok(await p.locator('.pp-name-q h1').innerText().then((t) => t === '¿Cómo te llamás?'), 'the name screen: "¿Cómo te llamás?", straight past the grade cards (?grado=4)');
  ok(!(await p.locator('.pp-setup').count()), 'the name screen: no grade cards shown (the bookmark already knows the grade)');
  ok(await p.locator('.pp-name-go').isDisabled(), '"Listo" starts disabled (no name yet)');
  await shot(p, 'pp-name-screen');

  await p.locator('.pp-name-input').fill('Sofía');
  ok(!(await p.locator('.pp-name-go').isDisabled()), '"Listo" enables once a usable name is typed');
  await p.locator('.pp-name-input').press('Enter'); // Enter submits, same as tapping "Listo"
  await p.waitForSelector('.choice-row', { timeout: 10_000 });
  const sid1 = await p.evaluate(() => window.__piloto.session().id);
  ok(await p.evaluate(() => window.__piloto.session().child_name) === 'Sofía', 'the character screen: session.child_name is "Sofía"');

  // "plays a bit"
  await p.locator('[data-choice-char="brote"]').click();
  await p.waitForTimeout(400);
  await p.evaluate(() => window.__piloto.jump('ladder'));
  await p.waitForSelector('main.level', { timeout: 15_000 });
  await p.waitForTimeout(500);
  await p.evaluate(() => window.__piloto.flush());

  // ---------------------------------------------------------------- the database
  if (PSQL) {
    const dbName = sql(`select child_name from sessions where id = '${sid1}';`);
    ok(dbName === 'Sofía', `Postgres: sessions.child_name = "Sofía" (${JSON.stringify(dbName)})`);
  } else {
    ok(true, 'Postgres check skipped (no PSQL given)');
  }

  // ---------------------------------------------------------------- /api/admin/summary (JSON) and /admin (HTML)
  const summary = await a.evaluate(() => fetch('/api/admin/summary', { credentials: 'same-origin', headers: { 'x-camino-admin': '1' } }).then((r) => r.json()));
  const row = summary.sessions.find((s) => s.session_id === sid1);
  ok(row?.child_name === 'Sofía', `/api/admin/summary: the session's own row carries child_name "Sofía" (${JSON.stringify(row?.child_name)})`);
  await a.waitForFunction((code) => {
    const rows = [...document.querySelectorAll('#class-rows tr')];
    return rows.some((r) => r.textContent.includes(code));
  }, 'Sofía', { timeout: 10_000 });
  ok(true, '/admin (HTML): "Sofía" shows in the live class table, first column');
  await a.locator('#class-rows tr', { hasText: 'Sofía' }).first().scrollIntoViewIfNeeded();
  await shot(a, 'admin-with-name');

  // ---------------------------------------------------------------- reload: resumes past the name screen, same session, same name
  await p.reload();
  await p.waitForSelector('.piloto', { timeout: 15_000 });
  const stepAfterReload = await p.evaluate(() => document.querySelector('.piloto')?.dataset.step);
  ok(stepAfterReload !== 'name' && stepAfterReload !== 'setup', `reload: resumed straight to "${stepAfterReload}", never asked for the name again`);
  const resumed = await p.evaluate(() => window.__piloto.session());
  ok(resumed.id === sid1 && resumed.child_name === 'Sofía', 'reload: the same session, the name still "Sofía"');

  // ---------------------------------------------------------------- a 4to survey question: the text large inside the card
  await p.evaluate(() => window.__piloto.jump('survey'));
  await p.waitForSelector('.pp-survey', { timeout: 10_000 });
  ok(await p.locator('.pp-q-text').isVisible(), '4to survey: the question\'s own text shows large inside the card (.pp-q-text)');
  await shot(p, 'pp-survey-4to');

  // ---------------------------------------------------------------- "Terminar la clase": the next child is asked again
  await a.click('#end-class');
  await a.click('#end-class');
  await p.waitForSelector('.piloto[data-step="class_end"]', { timeout: 15_000 });
  ok(true, '"Terminar la clase": the countdown ended and the session closed');
  await closeAndReopenLid(p);
  await p.waitForSelector('.pp-name-input', { timeout: 15_000 });
  const sid2 = await p.evaluate(() => window.__piloto.session().id);
  ok(sid2 !== sid1, 'the lid closing and reopening: a brand new session (next child)');
  ok(await p.evaluate(() => window.__piloto.session().child_name) == null, 'the next child: no name carried over from the previous one');
  await p.locator('.pp-name-input').fill('Toño');
  await p.locator('.pp-name-go').click();
  await p.waitForSelector('.choice-row', { timeout: 10_000 });
  ok(await p.evaluate(() => window.__piloto.session().child_name) === 'Toño', 'the next child: asked again, named "Toño" independently of the first');

  await p.context().close();
  await a.context().close();
} catch (e) {
  ok(false, `stopped: ${String(e.message ?? e).split('\n')[0]}`);
} finally {
  await browser.close();
}

ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
