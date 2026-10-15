// The back-to-back classes round's scripted check (T22/T23): one computer
// (device A) across two classes, through the real bookmark `?grado=1&sonido=no`,
// and el docente on /admin.
//
// - A: the bookmark lands on the character choice directly; a real pick and
//   a few real skips/a free-play card reach the survey (now with the
//   favourite-activity question too, since two activities were done),
//   answered for real, muted and captioned (T23's wordless questions).
// - el docente: "Terminar la clase" (T28) — A keeps playing through a
//   non-blocking 10 s countdown banner, THEN the session ends (`class_end`,
//   not abandoned: it was really played) and A rests on its own garden.
//   The device goes back to the character choice by itself once the lid
//   closes and reopens (simulated: `visibilitychange`), no adult hold,
//   with a NEW session id.
// - The new session never reacts to the class's old commands.
// - The corner menu's "Comentario del chico anterior" reaches the session
//   that just ended (the previous character, "hace N min", never a name);
//   saved, with PSQL, the previous session's own row gets the adult_form
//   and an `adult_form` event with `previous: true`.
// - The device then sits idle on the character screen: no new session is
//   created by itself (one check over ~60 s); a second "Terminar la clase"
//   on that untouched session marks it `abandoned`, not `class_end` (T22's
//   empty-session guard). T28/T29: reloading WHILE resting never resumes
//   into the rest screen — it starts a fresh session right away.
// - T28: a device offline when "Terminar la clase" was sent, whose own
//   clock has run more than two minutes (LATE_END_CLASS_MS) past the
//   command's `at` by the time it is finally seen (its Date.now() alone is
//   moved ahead, standing in for a real lid left closed across the class
//   break): no countdown, no garden — the stale session ends silently and
//   the device goes straight to a fresh start.
//
// PW=<dir with playwright> ADMIN_PASSWORD=<the local throwaway> node tools/check-backtoback.mjs [base]
//   base:      the app with /api and /admin (e.g. http://127.0.0.1:8810/, the default)
//   PSQL:      optional, psql against the API's database (required for the late-command check)
//   SHOTS:     optional directory: survey questions, the countdown banner, the resting garden, the restored start, the corner menu (<name>-<width>.png)
//   VIEWPORT:  e.g. 1280x800 (default 1366x768)
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
const sql = (q) => execSync(PSQL, { input: q }).toString().trim();
const hold = async (p, x, y, ms) => { await p.mouse.move(x, y); await p.mouse.down(); await p.waitForTimeout(ms); await p.mouse.up(); };
/** Holds the top-left corner (the adult's gesture) and waits for the menu. */
const openCorner = async (p) => { await hold(p, 18, 18, 1700); await p.waitForSelector('.pp-adult-sheet'); };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
const ids = [];

const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(`A: ${e}`));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch|401|429/.test(m.text())) errors.push(`A: ${m.text()}`); });

const admin = await browser.newContext({ viewport: { width: VW, height: VH } });
const a = await admin.newPage();
a.on('pageerror', (e) => errors.push(`admin: ${e}`));

const sessionId = () => p.evaluate(() => window.__piloto.session()?.id ?? null);
const step = () => p.evaluate(() => window.__piloto.flow().step);
const endClass = async () => { await a.click('#end-class'); await a.click('#end-class'); };
/** T28: the lid closes and reopens (a real close/open is untestable headless; this is the same `visibilitychange` the page itself listens to), past REST_HIDDEN_MIN_MS so it counts as real, not a flicker. */
const closeAndReopenLid = async (page) => {
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(2200);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
};

try {
  // ---------------------------------------------------------------- el docente logs in
  await a.goto(`${base}admin`);
  await a.waitForSelector('#login-card:not([hidden])', { timeout: 30_000 });
  await a.fill('#password', PASSWORD);
  await a.click('#login-btn');
  await a.waitForSelector('#panel:not([hidden])', { timeout: 10_000 });
  ok(true, '/admin: logged in');

  // ---------------------------------------------------------------- the bookmark: straight to the character choice
  await p.goto(`${base}?debug&nointro&grado=1&sonido=no#/piloto`);
  await p.waitForSelector('.piloto[data-step="character"]', { timeout: 30_000 });
  ok(true, 'A: ?grado=1&sonido=no landed on the character choice directly (no grade cards)');

  // ---------------------------------------------------------------- a real, muted, captioned session
  await p.locator('.choice-btn[data-choice-char="brote"]').click();
  await p.locator('.next-page').click({ force: true });
  await p.waitForSelector('.piloto[data-step="tool_check"]', { timeout: 20_000 });
  const sidA1 = await sessionId();
  ids.push(sidA1);
  ok(!!sidA1, `A: session ${sidA1} (grade 1, muted, a real character pick)`);

  // real skips through tool_check and the ladder (the adult's own shortcut, a real UI action)
  await openCorner(p); await p.click('[data-act="skip"]');
  await p.waitForSelector('.piloto[data-step="ladder"]', { timeout: 20_000 });
  await openCorner(p); await p.click('[data-act="skip"]');
  await p.waitForSelector('.piloto[data-step="free_play"]', { timeout: 20_000 });
  // one real free-play pick (a second activity, so the survey later offers a favourite)
  await p.waitForSelector('.pp-fp-card', { timeout: 20_000 });
  await p.locator('.pp-fp-card').first().click();
  await p.waitForTimeout(400);
  await openCorner(p); await p.click('[data-act="skip"]');
  await p.waitForSelector('.piloto[data-step="typing"]', { timeout: 20_000 });
  await openCorner(p); await p.click('[data-act="skip"]');
  await p.waitForSelector('.piloto[data-step="wardrobe"]', { timeout: 20_000 });
  await openCorner(p); await p.click('[data-act="skip"]');
  await p.waitForSelector('.pp-flag', { timeout: 20_000 });
  ok(true, 'A: the route is done (the green flag) after a real pick, two skips, a free-play card and two more skips');

  // the adult opens the survey; T23: the four questions, muted, with their own pictures (not words/faces reused)
  await openCorner(p); await p.click('[data-act="survey"]');
  await p.waitForSelector('.pp-survey', { timeout: 20_000 });
  const SURVEY = [['liked', 'yes'], ['difficulty', 'hard'], ['favorite_activity', null], ['play_again', 'yes']];
  for (const [q, answer] of SURVEY) {
    await p.waitForSelector(`[data-question="${q}"]`, { timeout: 15_000 });
    await p.waitForTimeout(700); // the options' own pop-in animation (up to ~540 ms for the last one)
    await shot(p, `survey-${q}`);
    const pick = answer ?? (await p.locator('[data-question="favorite_activity"] .pp-option').first().getAttribute('data-answer'));
    ok(!!pick, `survey: "${q}" has a pickable option`);
    await p.locator(`[data-answer="${pick}"]`).first().click();
    await p.waitForTimeout(1300);
  }
  await p.waitForSelector('.piloto[data-step="free_play"]', { timeout: 20_000 });
  ok(true, 'A: the survey answered (favourite activity included: two were done); back in free play');

  // ---------------------------------------------------------------- "terminar la clase" (T28): non-blocking, a really-played session
  await endClass();
  await p.waitForSelector('.pp-end-banner', { timeout: 20_000 });
  ok(await p.locator('.piloto[data-step="free_play"]').count() === 1, 'A: the countdown banner shows over free play — still there, not replaced');
  await shot(p, 'class-end-banner');
  const sMidBanner = await p.evaluate(() => window.__piloto.session());
  ok(!sMidBanner.ended_at, 'A: not ended yet while the banner counts down');
  await p.waitForSelector('[data-class-end="rest"]', { timeout: 20_000 });
  await shot(p, 'class-end-rest');
  ok(await p.locator('.pp-end-garden .pp-garden-svg').isVisible(), 'A: rests on its own garden');
  const endedA1 = await p.evaluate(() => window.__piloto.session());
  ok(endedA1.end_reason === 'class_end' && !!endedA1.ended_at, `A: session 1 ended (${endedA1.end_reason}) once the countdown reached zero, not abandoned (it was really played)`);

  // ---------------------------------------------------------------- T28: back to the start once the lid closes and reopens, no adult hold
  const t0 = Date.now();
  await closeAndReopenLid(p);
  await p.waitForSelector('.piloto[data-step="character"]', { timeout: 20_000 });
  const backMs = Date.now() - t0;
  await shot(p, 'class-end-restart');
  const sidA2 = await sessionId();
  ids.push(sidA2);
  ok(sidA2 !== sidA1, `A: a NEW session (${sidA2}) within ~${backMs} ms of the lid reopening, no adult hold needed`);
  ok((await p.locator('.pp-setup').count()) === 0, 'A: the character choice directly (the bookmark\'s ?grado), not the grade cards');

  // the new session never reacts to the class's old commands
  await p.waitForTimeout(12_000);
  ok((await step()) === 'character' && (await p.locator('.pp-end, .pp-five').count()) === 0, 'A: 12 s later, session 2 is still untouched by the ended class\'s commands');
  if (PSQL) {
    const cmds = sql(`select count(*)::int from events where session_id = '${sidA2}' and type = 'class_command';`);
    ok(cmds === '0', `session 2 has no class_command events (${cmds})`);
  }

  // ---------------------------------------------------------------- T22: "Comentario del chico anterior"
  await openCorner(p);
  ok((await p.locator('[data-act="previous-form"]').count()) === 1, 'the corner menu offers "Comentario del chico anterior" (a recent previous session on this device)');
  await p.click('[data-act="previous-form"]');
  await p.waitForSelector('.pp-prev-who', { timeout: 10_000 });
  const who = await p.locator('.pp-prev-who').innerText();
  ok(/hace|reci[eé]n/i.test(who) && !/brote|mina|pliegue|ovillo/i.test(who.toLowerCase().replace(/[^a-z\s]/g, '')), `shows "when", never a name as text: "${who.trim()}"`);
  await shot(p, 'previous-child-panel');
  await p.click('[data-value="high"]');
  await p.fill('.pp-comment textarea', 'Jugo bien, se quedo enganchado con el taller.');
  await p.click('[data-act="save-previous-form"]');
  await p.waitForFunction(() => !document.querySelector('[data-act="save-previous-form"]'), null, { timeout: 10_000 });
  ok(true, 'the comment for the previous session was saved');
  await p.keyboard.press('Escape').catch(() => {});
  await p.locator('.pp-adult-close').click().catch(() => {});
  await p.waitForTimeout(500);

  if (PSQL) {
    const form = sql(`select adult_form::text from sessions where id = '${sidA1}';`);
    ok(/"engagement":\s*"high"/.test(form) && /Jugo bien/.test(form), `session 1's own row carries the comment: ${form}`);
    const ev = sql(`select payload::text from events where session_id = '${sidA1}' and type = 'adult_form' and payload->>'previous' = 'true';`);
    ok(/"previous":\s*true/.test(ev), `session 1 has an adult_form event with previous: true: ${ev}`);
  }

  // ---------------------------------------------------------------- T22: no new sessions pile up while nobody plays
  await p.waitForTimeout(60_000);
  ok((await sessionId()) === sidA2, 'A: 60 s idle on the character choice, still the same session (no new ones created)');

  // ---------------------------------------------------------------- T22: an untouched (empty) session is marked abandoned, not class_end
  await endClass();
  await p.waitForSelector('.pp-end-banner', { timeout: 20_000 });
  await p.waitForSelector('[data-class-end="rest"]', { timeout: 20_000 });
  const endedA2 = await p.evaluate(() => window.__piloto.session());

  // ---------------------------------------------------------------- T28/T29: reloading WHILE resting never resumes into it — a fresh start right away
  await p.reload();
  await p.waitForSelector('.piloto[data-step="character"]', { timeout: 20_000 });
  ok((await p.locator('[data-class-end], .pp-end').count()) === 0, 'A: reloading on the resting garden never resumes into it');
  const sidA3 = await sessionId();
  ids.push(sidA3);
  ok(sidA3 !== sidA2, `A: a fresh session right after reloading on the resting page (session ${sidA3})`);
  if (PSQL) {
    await p.evaluate(() => window.__piloto.flush());
    await p.waitForTimeout(800);
    const reason = sql(`select end_reason from sessions where id = '${sidA2}';`);
    ok(reason === 'abandoned', `session 2 (never touched: nobody sat down) ended as abandoned, not class_end (${reason})`);
  } else {
    ok(endedA2.end_reason === 'abandoned', `session 2 (never touched) ended as abandoned, not class_end (${endedA2.end_reason})`);
  }

  // ---------------------------------------------------------------- T28: a command seen too late (the device's own clock has run far ahead of the command's `at` by the time it is seen — standing in for a lid left closed across the class break) skips the countdown and the garden entirely
  if (PSQL) {
    await ctx.setOffline(true);
    await a.click('#end-class'); await a.click('#end-class'); // the command's own `at` is real, sent normally, after session 3 started
    // the device's own Date.now() alone runs 5 minutes ahead (past LATE_END_CLASS_MS) once it reconnects —
    // setTimeout/Date() stay real, so nothing else on screen is disturbed by this
    await p.evaluate(() => {
      const real = Date.now.bind(Date);
      window.__realDateNow = real;
      Date.now = () => real() + 5 * 60_000 + 5000;
    });
    const t1 = Date.now();
    await ctx.setOffline(false);
    await p.evaluate(() => window.dispatchEvent(new Event('online')));
    // A is already on the character step (session 3, from the reload test) — wait for the
    // session id itself to change, not just for a selector that was already satisfied
    await p.waitForFunction((prev) => window.__piloto.session()?.id !== prev, sidA3, { timeout: 20_000 });
    await p.waitForSelector('.piloto[data-step="character"]', { timeout: 20_000 });
    const lateMs = Date.now() - t1;
    await p.evaluate(() => { if (window.__realDateNow) Date.now = window.__realDateNow; });
    const sidA4 = await sessionId();
    ids.push(sidA4);
    ok(sidA4 !== sidA3, `A: a fresh session (${sidA4}) within ~${lateMs} ms, no countdown or garden ever shown for the late command`);
    ok((await p.locator('.pp-end-banner, [data-class-end], .pp-end').count()) === 0, 'A: no countdown banner and no garden were ever shown for the late command');
    await p.evaluate(() => window.__piloto.flush());
    await p.waitForTimeout(800);
    const late = sql(`select payload->>'late' from events where session_id = '${sidA3}' and type = 'class_command' and payload->>'kind' = 'end_class';`);
    ok(late === 'true', `session 3's end_class class_command is flagged late: ${late}`);
  } else {
    console.log('skip the late-command check: needs PSQL (to backdate the command), not run without it');
  }

  await ctx.close();
  await admin.close();
  if (PSQL) sql('DELETE FROM class_commands;');
} catch (e) {
  ok(false, `stopped: ${String(e.message ?? e).split('\n')[0]}`);
} finally {
  await browser.close();
}
ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
console.log(`SESSION_IDS=${ids.join(',')}`);
process.exit(failures ? 1 : 0);
