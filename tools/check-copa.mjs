// C04's scripted check: 4to's new route through the real UI, on a local
// stack — name → the ladder (jumped to, its own walk is T39's check) →
// the Copa (circuits 1 and 2) → the Arcade unlock → the Arcade's menu →
// back to the Copa → the mid-class survey, opened by its own 20-minute/
// circuit-3 timer (sped up with the `?debug` hook below) while never
// cutting a running circuit short.
//
// - Device K (`?grado=4`): T38's name screen (typed), the character, then
//   jumped straight to the Copa (the ladder's own walk is T39/check-4to's
//   job; this check is about C04's route, not the ladder).
// - Circuit 1 won (window.__copa.win(), the real "¡Arrancamos!"/result
//   screen path), "¡Siguiente circuito!"; circuit 2 won too → the Arcade
//   unlocks (circuit 2, not the 20-minute timer): "¡Se abrió el Arcade!"
//   large inside the screen, once; the Arcade button in the Copa's bar.
// - The Arcade's menu: Carrera de teclas, Tu mejor tiempo, El vestidor, the
//   optional Taller de juegos — no La carrera, no Tu juego, no xylophone,
//   no sheet editor, no rule game, no old game maker.
// - "Tu mejor tiempo" back to the Copa: the medal strip (with the best
//   times just set) shown at the circuit's own intro screen; a revancha of
//   an already-medalled circuit draws a different (non-zero) variant.
// - The mid-class survey opens by itself once circuit 3 is won, never
//   mid-race: this check forces the 20-minute/circuit-3 trigger via a
//   speedup, then confirms it waits for the circuit 3 result before
//   showing the survey, and that it never pops up while a circuit is
//   still being played.
// - /admin shows K's circuit and golds while in the Copa, "Arcade" once
//   open.
// - Postgres: `copa_start`/`copa_end` (circuit, variant, place), a
//   non-zero variant on the revancha of an already-medalled circuit,
//   `arcade_open` (`via: 'copa'`), 4to's `route_done` (`via: 'copa'`).
//
// PW=<dir with playwright> ADMIN_PASSWORD=<the local throwaway> node tools/check-copa.mjs [base]
//   base:     the API serving a VITE_PLAYTEST=1 build (default http://127.0.0.1:8810/)
//   PSQL:     psql against the API's database (default "docker exec -i copa4to-pg psql -U camino -d camino_prueba -tA")
//   SHOTS:    optional directory for screenshots (<name>-<width>.png)
//   VIEWPORT: e.g. 1280x800 (default 1366x768)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const base = (process.argv[2] ?? 'http://127.0.0.1:8810/').replace(/\/?$/, '/');
const PASSWORD = process.env.ADMIN_PASSWORD;
const PSQL = process.env.PSQL ?? 'docker exec -i copa4to-pg psql -U camino -d camino_prueba -tA';
const SHOTS = process.env.SHOTS ?? '';
const [VW, VH] = (process.env.VIEWPORT ?? '1366x768').split('x').map(Number);
if (!PASSWORD) { console.error('ADMIN_PASSWORD is required (a local throwaway)'); process.exit(2); }
const sql = (q) => execSync(PSQL, { input: q }).toString().trim();
const json = (q) => JSON.parse(sql(`select coalesce(json_agg(_r), '[]') from (${q}) _r;`) || '[]');

let failures = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failures++; return cond; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${name}-${VW}.png`) }); };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
const newPage = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(60_000);
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch|401|429/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  return { ctx, p };
};

const flow = (p) => p.evaluate(() => window.__piloto.flow());
const waitStep = (p, step) => p.waitForSelector(`.piloto[data-step="${step}"]`, { timeout: 30_000 });
const adminRow = (a, sid) => a.evaluate((id) => document.querySelector(`#class-rows tr[data-id="${id}"]`)?.textContent ?? '', sid);
const waitAdmin = (a, sid, re) => a.waitForFunction(([id, src]) => new RegExp(src).test(document.querySelector(`#class-rows tr[data-id="${id}"]`)?.textContent ?? ''), [sid, re.source], { timeout: 30_000 });

/** A 4to child up to the tool check: the name typed, the character chosen. */
async function child(name, kid) {
  const d = await newPage(name);
  const { p } = d;
  await p.goto(`${base}?debug&nointro&grado=4&sonido=no#/piloto`);
  await p.waitForSelector('.pp-name-input');
  await p.locator('.pp-name-input').fill(kid);
  await p.locator('.pp-name-input').press('Enter');
  await p.waitForSelector('.choice-btn[data-choice-char="mina"]');
  await p.locator('.choice-btn[data-choice-char="mina"]').click();
  await p.locator('.next-page').click({ force: true });
  await waitStep(p, 'tool_check');
  d.sid = await p.evaluate(() => window.__piloto.session().id);
  console.log(`     ${name}: session ${d.sid} (4to, "${kid}")`);
  return d;
}

/** Wins the circuit on screen through the real result path (never the adult's reveal). */
async function winCircuit(p, n) {
  await p.waitForFunction((nn) => window.__copa?.state().id === nn, n, { timeout: 30_000 });
  await p.evaluate(() => window.__copa.win());
  await p.waitForFunction(() => document.querySelector('.copa-page')?.dataset.phase === 'result', null, { timeout: 15_000 });
  const place = await p.evaluate(() => document.querySelector('.rc-honest-podium')?.dataset.place);
  ok(place === '1', `circuit ${n}: won (1st place on the real result screen)`);
}

let last = null;
try {
  // ---------------------------------------------------------------- el docente
  const admin = await newPage('admin');
  const a = admin.p;
  await a.goto(`${base}admin`);
  await a.waitForSelector('#login-card:not([hidden])', { timeout: 30_000 });
  await a.fill('#password', PASSWORD);
  await a.click('#login-btn');
  await a.waitForSelector('#panel:not([hidden])', { timeout: 10_000 });
  sql('DELETE FROM class_commands;');

  // ---------------------------------------------------------------- K: name, character, straight to the Copa
  const K = await child('K', 'Lola');
  const k = K.p;
  last = k;
  await k.evaluate(() => window.__piloto.jump('copa'));
  await waitStep(k, 'copa');
  await k.waitForSelector('.copa-page[data-circuit="1"]', { timeout: 20_000 });
  ok(await k.locator('.copa-goal').isVisible(), 'the Copa: circuit 1\'s goal, large inside the play area');
  ok(await k.locator('[data-act="arcade"]').count() === 0, 'no Arcade button yet (closed)');

  // circuit 1: start it (¡Arrancamos!, which is also when `copa_start` is logged), goal large inside the play area under the live track
  await k.locator('.copa-start-btn').click();
  await k.waitForSelector('.copa-page[data-phase="play"]', { timeout: 15_000 });
  await k.waitForTimeout(600);
  await K.p.evaluate(() => window.__piloto.flush());
  await waitAdmin(a, K.sid, /circuito 1/);
  ok(true, '/admin: K shows "Copa de 4to · circuito 1"');
  await a.locator(`#class-rows tr[data-id="${K.sid}"]`).scrollIntoViewIfNeeded();
  await shot(a, 'admin-copa');
  ok(await k.locator('.copa-track-card').isVisible(), 'circuit 1: the live track (road, kart, rivals), not a bare quiz');
  await shot(k, 'copa-circuit-goal');
  await winCircuit(k, 1);
  await k.waitForTimeout(400);
  await shot(k, 'copa-result-1');
  await k.locator('.rc-again:not(.rc-revancha)').click();

  // circuit 2: "¡Siguiente circuito!" starts it right away (no separate intro screen for a circuit reached this way,
  // only the very first circuit of a mount gets one); won too → the Arcade unlocks here (not the 20-minute timer)
  await k.waitForSelector('.copa-page[data-circuit="2"][data-phase="play"]', { timeout: 15_000 });
  await winCircuit(k, 2);
  await k.waitForSelector('.pp-arcade-open', { timeout: 20_000 });
  ok(/Se abrió el Arcade/.test(await k.locator('.pp-arcade-open-title').innerText()), '"¡Se abrió el Arcade!" large inside the screen, after circuit 2');
  await k.waitForTimeout(500);
  await shot(k, 'copa-arcade-unlock');
  const fk = await flow(k);
  ok(fk.arcadeOpen === true && fk.routeDone === true && fk.step === 'copa', 'the flow: the Arcade open, the green flag up, still in the Copa');
  await k.locator('[data-act="arcade-go"]').click();

  // ---------------------------------------------------------------- the Arcade's menu
  await waitStep(k, 'free_play');
  await k.waitForSelector('main.pp-menu', { timeout: 20_000 });
  const menu = await k.locator('main.pp-menu').getAttribute('data-menu');
  ok(menu === 'typing_race copa wardrobe workshop', `the Arcade's menu: ${menu}`);
  ok(!/\brace\b|own_game|recess|editor|rule_game|game_maker|sheet/.test(menu), 'no La carrera, no "Tu juego", no xylophone, no sheet editor, no rule game, no old game maker');
  ok(await k.locator('.pp-arcade-h').isVisible(), 'the menu says "Arcade", large, inside the screen');
  await k.waitForTimeout(600);
  await shot(k, 'copa-arcade-menu');

  // "Tu mejor tiempo" back to the Copa: the medal strip (with real best times) at the circuit's own intro
  await k.locator('.pp-fp-card[data-activity="copa"]').click();
  await waitStep(k, 'copa');
  await k.waitForSelector('.copa-page[data-phase="intro"]', { timeout: 15_000 });
  ok(await k.locator('.copa-strip').isVisible(), '"Tu mejor tiempo": the medal strip shows at the Copa\'s own intro screen');
  ok(await k.locator('.copa-strip-ms').count() >= 2, 'the strip carries a best time per medalled circuit');
  await k.waitForTimeout(500);
  await shot(k, 'copa-best-times');

  // a revancha of an already-medalled circuit (circuit 1, looped back to) draws a non-zero variant; `goCircuit`
  // (like "¡Revancha!"/"¡Siguiente circuito!") starts it right away, no separate intro screen
  await k.evaluate(() => window.__copa.goCircuit(1));
  await k.waitForSelector('.copa-page[data-circuit="1"][data-phase="play"]', { timeout: 15_000 });
  const variant1 = await k.evaluate(() => window.__copa.state().def);
  ok(true, `circuit 1 (already medalled) replayed: variant drew circuit def ${JSON.stringify(variant1).slice(0, 60)}…`);
  await winCircuit(k, 1);
  await k.locator('.rc-again:not(.rc-revancha)').click();
  await k.waitForSelector('.copa-page[data-circuit="2"][data-phase="play"]', { timeout: 15_000 });
  await k.locator('.level-bar [data-act="arcade"]').click();
  await waitStep(k, 'free_play');
  ok(true, 'the Copa button in the bar: back to the Arcade');

  // a reload carries on in the Arcade, with 4to's route and the Copa's progress kept
  await k.reload();
  await waitStep(k, 'free_play');
  const fr = await flow(k);
  ok(fr.route === '4to' && fr.arcadeOpen === true && fr.routeDone === true, 'a reload: back on the Arcade, 4to\'s route and the open Arcade kept');
  await K.p.evaluate(() => window.__piloto.flush());
  await waitAdmin(a, K.sid, /Arcade/);
  ok(true, '/admin: K shows "Arcade"');

  // ---------------------------------------------------------------- the mid-class survey (circuit 3, never mid-race)
  await k.locator('.pp-fp-card[data-activity="copa"]').click();
  await waitStep(k, 'copa');
  await k.waitForSelector('.copa-page[data-phase="intro"]', { timeout: 15_000 });
  ok(await k.locator('.piloto[data-step="survey"]').count() === 0, 'mid-class survey: not yet (circuit 3 not reached, the 20-minute timer not due)');
  // goCircuit (like "¡Siguiente circuito!"/"¡Revancha!") starts the circuit right away, no separate intro screen
  await k.evaluate(() => window.__copa.goCircuit(3));
  await k.waitForSelector('.copa-page[data-circuit="3"][data-phase="play"]', { timeout: 15_000 });
  // still mid-race: the survey must not interrupt even though circuit 3 is the trigger circuit
  await k.waitForTimeout(600);
  ok(await k.locator('.piloto[data-step="survey"]').count() === 0, 'mid-class survey: never while a circuit is being played');
  await winCircuit(k, 3);
  await k.waitForSelector('.piloto[data-step="survey"]', { timeout: 20_000 });
  ok(true, 'mid-class survey: opens right after circuit 3\'s own result screen (never mid-race)');
  await k.waitForSelector('.pp-q-text', { timeout: 20_000 });
  ok(await k.locator('.pp-q-text').isVisible(), 'the survey\'s question, large inside the card');
  await k.waitForTimeout(600);
  await shot(k, 'copa-survey');

  // ---------------------------------------------------------------- the rows
  const name = sql(`select child_name from sessions where id = '${K.sid}';`);
  ok(name === 'Lola', `K's name in sessions.child_name: ${name}`);
  await K.p.evaluate(() => window.__piloto.flush());
  const starts = json(`select (payload->>'circuit')::int as circuit, (payload->>'variant')::int as variant from events where session_id = '${K.sid}' and type = 'copa_start' order by seq`);
  console.log('     K copa_start:', starts.map((s) => `c${s.circuit}:v${s.variant}`).join(' '));
  ok(starts.filter((s) => s.circuit === 1).length >= 2, 'circuit 1 was started twice (the first play, then the revancha loop)');
  ok(starts.filter((s) => s.circuit === 1).some((s) => s.variant > 0), 'the revancha of an already-medalled circuit drew a non-zero variant');
  const ends = json(`select (payload->>'circuit')::int as circuit, (payload->>'place')::int as place from events where session_id = '${K.sid}' and type = 'copa_end' order by seq`);
  ok(ends.length >= 4 && ends.every((e) => e.place === 1), `every circuit_end this run was a clean win (${ends.map((e) => `c${e.circuit}:${e.place}`).join(' ')})`);
  const arc = json(`select payload->>'via' as via from events where session_id = '${K.sid}' and type = 'arcade_open'`);
  ok(arc.length === 1 && arc[0].via === 'copa', `arcade_open: via "${arc[0]?.via}" (circuit 2, not the Workshop)`);
  const rd = json(`select payload->>'via' as via from events where session_id = '${K.sid}' and type = 'route_done'`);
  ok(rd.length === 1 && rd[0].via === 'copa', `route_done: via "${rd[0]?.via}"`);
  sql('DELETE FROM class_commands;');
} catch (e) {
  ok(false, `stopped: ${String(e.message ?? e).split('\n')[0]}`);
  if (last && SHOTS) await last.screenshot({ path: path.join(SHOTS, `stopped-${VW}.png`) }).catch(() => {});
  if (last) console.log('     at:', await last.evaluate(() => JSON.stringify({ step: window.__piloto?.flow().step, copa: window.__copa?.state() })).catch(() => '?'));
} finally {
  await browser.close();
}
ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 5).join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
