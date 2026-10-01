// The classroom round's scripted check (T14): two devices in sessions and
// el docente on /admin, in one browser (three contexts).
//
// - /admin: the password form; a wrong password is refused; the right one
//   opens the class panel (the cookie; nothing is typed again on reload).
// - Device A (2do) plays the ladder; device B (4to) is in free play and
//   then goes OFFLINE.
// - "Quedan 5 minutos": A shows the banner, finishes its item and goes to
//   the wardrobe. "Cancelar aviso" before that, then the warning again:
//   the cancel is applied and the second warning wraps A up.
// - "Terminar la clase" (with its confirm): A shows "Actividad terminada"
//   with the countdown, ends the session (class_end) and rests.
// - B reconnects: the commands reach it (the cancelled warning is ignored,
//   the second warning and the class end applied): "Actividad terminada",
//   class_end.
// - The panel lists both sessions (step, terminó, encuesta); with PSQL, the
//   rows: class_command events, end_reason and current_step class_end.
//
// PW=<dir with playwright> ADMIN_PASSWORD=<the local throwaway> node tools/check-class.mjs [base]
//   base:      the app with /api and /admin (the API serving a build, e.g. http://127.0.0.1:8810/, the default)
//   PSQL:      optional, psql against the API's database (e.g. "docker exec -i camino-prueba-t14db psql -U postgres -d dev -tA")
//   SHOTS:     optional directory: the admin login and panel, the banner, "Actividad terminada" (<name>-<width>.png)
//   VIEWPORT:  e.g. 1920x911 (default 1366x768)
// The admin password is read from the environment only and never printed.
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
const ids = [];

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
const newPage = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch|401|429/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  return { ctx, p };
};

/** A device: a session of `grade` on `step` (the ?debug hooks jump there), synced. */
async function device(name, grade, step) {
  const d = await newPage(name);
  await d.p.goto(`${base}?debug&nointro#/piloto`);
  await d.p.waitForSelector('.pp-setup', { timeout: 60_000 });
  await d.p.locator(`.pp-grade-card[data-grade="${grade}"]`).click();
  await d.p.waitForSelector('.choice-row');
  await d.p.evaluate((s) => window.__piloto.jump(s), step);
  await d.p.waitForSelector(`.piloto[data-step="${step}"]`);
  d.sid = await d.p.evaluate(() => window.__piloto.session().id);
  ids.push(d.sid);
  await d.p.evaluate(() => window.__piloto.flush());
  console.log(`     ${name}: session ${d.sid} (${grade}°, ${step})`);
  return d;
}

const step = (d) => d.p.evaluate(() => window.__piloto.flow().step);
const flow = (d) => d.p.evaluate(() => window.__piloto.flow());

try {
  // ---------------------------------------------------------------- el docente logs in
  const admin = await newPage('admin');
  const a = admin.p;
  await a.goto(`${base}admin`);
  await a.waitForSelector('#login-card:not([hidden])', { timeout: 30_000 });
  await shot(a, 'admin-login');
  ok(await a.locator('#panel').isHidden(), '/admin: the password form, no panel before logging in');
  await a.fill('#password', 'not-the-password');
  await a.click('#login-btn');
  await a.waitForFunction(() => document.getElementById('login-status').textContent.length > 0);
  ok(/incorrecta/.test(await a.locator('#login-status').innerText()) && await a.locator('#panel').isHidden(), '/admin: a wrong password is refused');
  await a.fill('#password', PASSWORD);
  await a.click('#login-btn');
  await a.waitForSelector('#panel:not([hidden])', { timeout: 10_000 });
  const cookie = (await admin.ctx.cookies()).find((c) => c.name === 'camino_admin');
  ok(cookie && cookie.httpOnly && cookie.sameSite === 'Strict' && !cookie.value.includes(PASSWORD), '/admin: logged in; the cookie is HttpOnly, SameSite=Strict, signed (no password in it)');
  await a.reload();
  await a.waitForSelector('#panel:not([hidden])', { timeout: 10_000 });
  ok(await a.locator('#login-card').isHidden(), '/admin: a reload keeps the login (the cookie)');

  // ---------------------------------------------------------------- two devices
  const A = await device('A', 2, 'ladder');
  const B = await device('B', 4, 'free_play');
  await a.waitForFunction((n) => document.querySelectorAll('#class-rows tr[data-id]').length >= n, 2, { timeout: 20_000 });
  ok(true, '/admin: both sessions in "Esta clase"');
  await B.ctx.setOffline(true);
  console.log('     B is offline');

  // ---------------------------------------------------------------- "quedan 5 minutos", cancelled, then again
  await a.click('#five-min');
  await A.p.waitForSelector('.pp-five', { timeout: 20_000 });
  await shot(A.p, 'class-five-min');
  ok((await flow(A)).wrapUp === true && (await step(A)) === 'ladder', 'A: the banner "¡Quedan 5 minutos!"; it finishes the item on screen first (still on the ladder)');
  await a.waitForSelector('#cancel-warn:not([hidden])', { timeout: 10_000 });
  await a.click('#cancel-warn');
  await A.p.waitForFunction(() => !window.__piloto.flow().wrapUp, null, { timeout: 20_000 });
  ok(true, 'A: "Cancelar aviso" reached it: no wrap-up any more');
  await a.click('#five-min');
  await A.p.waitForFunction(() => window.__piloto.flow().wrapUp === true, null, { timeout: 20_000 });
  // A finishes its item: solved as the child would, then the page turned
  await A.p.waitForSelector('main.level', { timeout: 20_000 });
  await A.p.waitForFunction(() => !document.querySelector('.ghost-hand'), null, { timeout: 30_000 });
  await A.p.evaluate(() => window.__camino.setProgram(window.__camino.level.solution));
  await A.p.waitForTimeout(300);
  await A.p.locator('.btn-play').click();
  await A.p.locator('.next-page').click({ force: true, timeout: 30_000 });
  await A.p.waitForSelector('[data-interlude="cheer"]', { timeout: 20_000 });
  await A.p.locator('.pp-cheer-next').click({ force: true });
  await A.p.waitForSelector('.piloto[data-step="wardrobe"]', { timeout: 20_000 });
  ok(true, 'A: the second warning: the item finished, the ladder ended, on to the wardrobe');

  // ---------------------------------------------------------------- the panel
  await a.waitForFunction((sid) => /vestidor/.test(document.querySelector(`#class-rows tr[data-id="${sid}"]`)?.textContent ?? ''), A.sid, { timeout: 20_000 });
  ok(true, '/admin: A shows "vestidor"');
  await shot(a, 'admin-panel');

  // ---------------------------------------------------------------- "terminar la clase"
  await a.click('#end-class');
  ok(/Seguro/.test(await a.locator('#end-label').innerText()), '/admin: "Terminar la clase" asks to confirm (a second tap)');
  await a.click('#end-class');
  await A.p.waitForSelector('.pp-end', { timeout: 20_000 });
  await A.p.waitForTimeout(1200);
  await shot(A.p, 'class-end');
  ok(await A.p.locator('.pp-countdown').isVisible() && await A.p.locator('.pp-end-wave').isVisible(), 'A: "Actividad terminada", the character waving and the countdown');
  await A.p.waitForSelector('[data-class-end="rest"]', { timeout: 20_000 });
  const sa = await A.p.evaluate(() => window.__piloto.session());
  ok(sa.end_reason === 'class_end' && !!sa.ended_at, `A: the session ended (${sa.end_reason}) after the countdown; the resting page`);
  await A.p.evaluate(() => window.__piloto.flush());
  await shot(A.p, 'class-rest');
  ok(await A.p.locator('.pp-rest-start').isVisible() && !(await A.p.locator('.pp-setup').count()), 'A: rests; a new session only with the adult\'s long press');
  await a.waitForSelector('#class-state b', { timeout: 10_000 });
  ok(/terminada/i.test(await a.locator('#class-state').innerText()), '/admin: says the class was ended');

  // ---------------------------------------------------------------- B comes back
  await B.ctx.setOffline(false);
  await B.p.evaluate(() => window.dispatchEvent(new Event('online')));
  await B.p.waitForSelector('.pp-end', { timeout: 40_000 });
  ok(true, 'B: back online, the commands arrived: "Actividad terminada"');
  await B.p.waitForSelector('[data-class-end="rest"]', { timeout: 20_000 });
  const sb = await B.p.evaluate(() => window.__piloto.session());
  ok(sb.end_reason === 'class_end', `B: the session ended (${sb.end_reason})`);
  await B.p.evaluate(() => window.__piloto.flush());
  await B.p.waitForTimeout(1500);

  // the adult's long press starts a new session on A
  const box = await A.p.locator('.pp-rest-start').boundingBox();
  await A.p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await A.p.mouse.down(); await A.p.waitForTimeout(600); await A.p.mouse.up();
  ok(!(await A.p.locator('.pp-setup').count()), 'A: a short press on the resting page does nothing');
  await A.p.mouse.down(); await A.p.waitForTimeout(2300); await A.p.mouse.up();
  await A.p.waitForSelector('.pp-setup', { timeout: 10_000 });
  ok(true, 'A: the adult\'s 2-second press: the setup for the next class');

  // ---------------------------------------------------------------- the rows
  if (PSQL) {
    const cmds = (sid) => sql(`select string_agg(payload->>'kind', ',' order by seq) from events where session_id = '${sid}' and type = 'class_command';`);
    ok(cmds(A.sid) === 'five_min,cancel_five_min,five_min,end_class', `A's class_command events: ${cmds(A.sid)}`);
    ok(cmds(B.sid) === 'five_min,end_class', `B's class_command events (the cancelled warning never applied): ${cmds(B.sid)}`);
    for (const d of [A, B]) {
      const r = sql(`select end_reason || ' ' || current_step || ' ' || (ended_at is not null) from sessions where id = '${d.sid}';`);
      ok(r === 'class_end class_end true', `${d === A ? 'A' : 'B'}: ${r}`);
    }
    const ladderEnd = sql(`select payload->>'reason' from events where session_id = '${A.sid}' and type = 'ladder_end';`);
    ok(ladderEnd === 'wrap_up', `A: ladder_end reason ${ladderEnd}`);
    const wrapSteps = sql(`select string_agg(payload->>'to' || ':' || coalesce(payload->>'wrap_up', '-'), ' ' order by seq) from events where session_id = '${A.sid}' and type = 'step';`);
    ok(wrapSteps.endsWith('wardrobe:true class_end:-'), `A's steps: ${wrapSteps}`);
    sql('DELETE FROM class_commands;');
  }
  await admin.ctx.close();
  await A.ctx.close();
  await B.ctx.close();
} catch (e) {
  ok(false, `stopped: ${String(e.message ?? e).split('\n')[0]}`);
} finally {
  await browser.close();
}
ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
console.log(`SESSION_IDS=${ids.join(',')}`);
process.exit(failures ? 1 : 0);
