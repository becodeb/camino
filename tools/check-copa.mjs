// C10's scripted check: 4to's Copa v2 through the real UI, on a local stack —
// name → the ladder (left at once: its own walk is T39's check) → placement →
// copa 1 (a first-run win, the revancha, a carried-over program that crashes,
// the ghost hand) → copa 2 (Ayudá al ciervo, a loss and Espiá) → the Arcade
// unlock → "Tu mejor tiempo" → a reload that keeps the program → the mid-class
// survey, never during a run → /admin and the Postgres rows. A second child
// is placed by the ladder's ceiling (copa 3), reaches the earlier copas from
// the strip and uses "¡Saltar a la copa siguiente!".
//
// - Device K (`?grado=4`): T38's name screen, the character, the tool check,
//   the ladder (left: ceiling null → copa 1). Copa 1's first track (c1-a)
//   is built with taps on the palette (gold program) and won on its first run
//   → the skip is offered; ¡Revancha! (no skip the second time); ¡Seguir!.
//   c1-b opens with c1-a's program (it carries over), crashes twice (the red
//   block, "Ver paso a paso", the ghost hand after the second failure), is
//   rebuilt and won. Copa 2: Ayudá al ciervo (repetir 3 → 4), then c2-a with
//   a bronze program that loses to the gold rival → "Espiá el programa del
//   zorro": the trick tapped, the rival's run watched, "¡A tu taller!" with
//   the program intact; then the gold program wins. Copa 2 finished → the
//   Arcade opens; its menu; "Tu mejor tiempo" is the strip with medals and times.
//   A reload keeps the program. Copa 3 finished while a run is on screen: the
//   survey waits for the run to end.
// - Device M: placed in copa 3 by a ladder ceiling of 15 (rival: gold); copa 1
//   and 2 are on the strip; copa 1's first track on the first run beats silver:
//   "¡Saltar a la copa siguiente!" → copa 2.
// - /admin shows K's copa, track and medals; Postgres has `garage_place`,
//   `garage_run`, `garage_ghost`, `garage_debug`, `garage_spy`, `garage_track_done`,
//   `garage_revancha`, `garage_skip`, `arcade_open` and `route_done` (via copa).
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
const journey = (p) => p.evaluate(() => window.__copaFlow.journey());
const waitStep = (p, step) => p.waitForSelector(`.piloto[data-step="${step}"]`, { timeout: 30_000 });
const adminRow = (a, sid) => a.evaluate((id) => document.querySelector(`#class-rows tr[data-id="${id}"]`)?.textContent ?? '', sid);
const waitAdmin = (a, sid, re) => a.waitForFunction(([id, src]) => new RegExp(src).test(document.querySelector(`#class-rows tr[data-id="${id}"]`)?.textContent ?? ''), [sid, re.source], { timeout: 30_000 });

/** A 4to child up to the tool check: the name typed, the character chosen. `ceiling`: the ladder's ceiling the Copa places by (injected when the ladder is not walked). */
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

// ---------------------------------------------------------------- the garage, by taps
const tap = (p, kind) => p.locator(`[data-pal="${kind}"]`).click();
const build = async (p, kinds) => { for (const k of kinds) await tap(p, k); };
// the faded "Tu programa anterior" panel is a compact ProgramPanel too: only the child's own program counts
const MAIN = '.gx-program:not(.is-compact) .gx-lane-main';
const rowsOf = (p) => p.locator(`${MAIN} .gx-row[data-kind]`).evaluateAll((els) => els.map((e) => e.dataset.kind));
async function setRepeat(p, n) {
  const num = () => p.locator('.gx-stepper .gx-num').first().innerText().then(Number);
  for (let i = 0; i < 30 && (await num()) !== n; i++) await p.locator(`.gx-step-btn[aria-label="${(await num()) < n ? 'más' : 'menos'}"]`).first().click();
}
const largar = (p) => p.locator('.gx-largar').click();
const waitResult = (p) => p.waitForSelector('.gx-result-page', { timeout: 90_000 });
const GOLD_C1A = ['forward', 'up', 'up', 'down', 'down', 'forward', 'jump', 'forward'];
const GOLD_C1B = ['forward', 'forward', 'up', 'jump', 'down', 'forward', 'jump', 'forward'];

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

  // ---------------------------------------------------------------- K: name, character, the ladder (left at once), placement
  const K = await child('K', 'Lola');
  const k = K.p;
  last = k;
  await k.locator('.next-page, [data-act="next"]').first().click({ force: true }).catch(() => {});
  await k.evaluate(() => window.__piloto.jump('ladder'));
  await waitStep(k, 'ladder');
  await k.waitForTimeout(800);
  await k.evaluate(() => window.__piloto.jump('copa')); // the ladder ends as "left": its ceiling (null: none passed) is what the Copa places by
  await waitStep(k, 'copa');
  await k.waitForSelector('.hb-page', { timeout: 20_000 });
  ok((await journey(k)).startCopa === 1, 'placement: no ladder ceiling → the Copa starts at copa 1');
  ok(/Empezás en la Copa 1/.test(await k.locator('.hb-headline').innerText()), 'the copa strip says where the child starts');
  ok(await k.locator('.hb-copa').count() === 5 && await k.locator('.hb-copa.is-ahead').count() === 4, 'the strip: five copas, the ones ahead dimmed');
  ok(await k.locator('[data-act="arcade"]').count() === 0, 'no Arcade button yet (closed)');
  await shot(k, 'hub-placement');
  await k.locator('[data-act="hub-go"]').click();
  await k.waitForSelector('.gx-page[data-track="c1-a"]', { timeout: 20_000 });

  // the bigger ¡Largar!
  const lb = await k.locator('.gx-largar').boundingBox();
  const lf = await k.locator('.gx-largar-word').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  ok(lb.height >= 80 && lf >= 48, `¡Largar! is large and bold (button ${Math.round(lb.height)} px tall, label ${lf} px)`);
  await shot(k, 'garage-c1a-empty');

  // c1-a: the gold sequence by taps, won on the first run → the skip is offered
  await build(k, GOLD_C1A);
  ok((await rowsOf(k)).length === 8, 'c1-a: eight blocks built by tapping the palette');
  await largar(k);
  await waitResult(k);
  await k.waitForTimeout(2200);
  ok(await k.locator('.gx-skip').isVisible(), 'c1-a first run beat silver: "¡Saltar a la copa siguiente!" is offered, big');
  ok(await k.locator('[data-act="spy"]').count() === 0, 'a win offers no Espiá');
  await shot(k, 'skip-offer-c1a');
  // ¡Revancha!: the same program again; a second run never offers the skip
  await k.locator('.gx-revancha').click();
  await k.waitForSelector('.gx-page[data-track="c1-a"]');
  await largar(k);
  await waitResult(k);
  await k.waitForTimeout(1500);
  ok(await k.locator('.gx-skip').count() === 0, 'after a ¡Revancha! the skip is not offered again');
  await k.locator('.gx-seguir').click();

  // c1-b: opens with c1-a's program (carried), which crashes on this track
  await k.waitForSelector('.gx-page[data-track="c1-b"]');
  ok((await rowsOf(k)).join() === GOLD_C1A.join(), 'c1-b opens with the program of c1-a (it carries over inside a copa)');
  await largar(k);
  await k.waitForSelector('.gx-banner.is-crash', { timeout: 30_000 });
  ok(await k.locator('.gx-row.is-crash').count() === 1, 'a crash: the failing block is red and the program is intact');
  await shot(k, 'crash-c1b-garage');
  await k.locator('.gx-stepbtn').click();
  await k.waitForSelector('.gx-stepbox');
  await k.locator('.gx-step-back').click();
  await k.waitForSelector('.gx-largar');
  await largar(k);
  await k.waitForSelector('.gx-banner.is-crash', { timeout: 30_000 });
  await k.waitForFunction(() => !!document.querySelector('.gx-page.has-hint'), null, { timeout: 15_000 });
  ok(true, 'two failed runs in a row on c1-b: the ghost hand is on');
  await shot(k, 'ghost-c1b');
  // rebuild: take every block out, then the right eight
  for (let i = 0; i < 8; i++) { await k.locator(`${MAIN} .gx-row[data-kind]`).first().click(); await k.locator('.gx-tool-remove').click(); }
  ok((await rowsOf(k)).length === 0, 'c1-b: the program emptied block by block (Sacar)');
  await build(k, GOLD_C1B);
  await largar(k);
  await waitResult(k);
  await k.locator('.gx-seguir').click();

  // c1-c: the adult's shortcut; copa 1 is finished; the strip, then copa 2
  await k.waitForSelector('.gx-page[data-track="c1-c"]');
  await k.evaluate(() => window.__copaFlow.finishCopa(1));
  await k.locator('[data-act="copas"]').click();
  await k.waitForSelector('.hb-page');
  await shot(k, 'hub-copa1-done');
  ok(await k.locator('.hb-copa[data-copa="1"].is-done').count() === 1, 'the strip marks copa 1 as done');
  ok(await k.locator('.hb-track[data-track="c1-a"] .hb-track-time').innerText().then((t) => /\d,\d s/.test(t)), 'the strip lists c1-a with its best time');
  await k.locator('.hb-copa[data-copa="2"] .hb-copa-head').click();

  // ---------------------------------------------------------------- copa 2: Ayudá al ciervo
  await k.waitForSelector('.gx-page[data-copa="2"][data-track="c2-a"] .gx-goal-deer', { timeout: 20_000 });
  ok(/Ayudá al ciervo/.test(await k.locator('.gx-title h1').innerText()), 'copa 2 opens with Ayudá al ciervo');
    await k.waitForTimeout(500);
  await shot(k, 'deer-c2');
  await largar(k);
  await k.waitForSelector('.gx-banner.is-stuck', { timeout: 40_000 });
  ok(true, 'the deer\'s program ends short ("Falta camino"): it did not reach the meta');
  await k.locator(`${MAIN} .gx-head-row`).first().click();
  await setRepeat(k, 4);
  await largar(k);
  await k.waitForSelector('.gx-deer-done', { timeout: 60_000 });
  await shot(k, 'deer-fixed');
  await k.locator('.gx-deer-next').click();

  // ---------------------------------------------------------------- c2-a: a bronze program loses to the gold rival → Espiá
  await k.waitForSelector('.gx-page[data-track="c2-a"]:not([data-phase="run"]) .gx-goal:not(.gx-goal-deer)', { timeout: 20_000 });
  ok(await k.locator('.gx-ref').count() === 1, 'c2-a: copa 1 left a program, so "Tu programa anterior" is on the side, faded');
  ok(/Ganale al zorro/.test(await k.locator('.gx-goal-text').innerText()), 'the goal names the rival the results led to: the fox');
  await tap(k, 'repeat');
  await setRepeat(k, 4);
  await build(k, ['forward', 'forward', 'up', 'down']);
  await largar(k);
  await waitResult(k);
  await k.waitForTimeout(2200);
  const lost = await k.locator('.gx-result-line').innerText();
  ok(/^3ro|^2do/.test(lost), `c2-a: the bronze program loses to the fox ("${lost}")`);
  await shot(k, 'result-lost-spy-offer');
  ok(/Espiá el programa del zorro/.test(await k.locator('[data-act="spy"]').innerText()), 'the result offers "Espiá el programa del zorro"');
  await k.locator('[data-act="spy"]').click();
  await k.waitForSelector('.gx-spy-page[data-spy="pick"]');
  ok(/¿Dónde está el truco\?/.test(await k.locator('.gx-spy-big').innerText()), 'Espiá: "¿Dónde está el truco?" large on screen');
  await k.waitForTimeout(500);
  await shot(k, 'spy-pick');
  await k.locator('.gx-program .gx-c-repeat > .gx-head-row').first().click(); // the fox's trick in copa 2 is the repetir
  await k.waitForSelector('.gx-spy-page[data-spy="told"]');
  ok(await k.locator('.gx-spy-card[data-correct="1"]').count() === 1, 'the trick tapped: right');
  await shot(k, 'spy-told');
  await k.locator('[data-act="spy-watch"]').click();
  await k.waitForSelector('.gx-spy-page[data-spy="watch"]');
  await k.waitForFunction(() => !!document.querySelector('.gx-row.is-live'), null, { timeout: 10_000 });
  ok(true, 'the rival\'s run plays with its executing block glowing');
  await shot(k, 'spy-watching');
  await k.locator('[data-act="spy-done"]').click({ timeout: 60_000 });
  await k.waitForSelector('.gx-page[data-track="c2-a"]');
  ok((await rowsOf(k)).length === 4, '¡A tu taller!: back in the garage with the program intact');
  // the child learned: the plain tile jumps over the puddle (the fox's trick is the repetir; the puddles are jumped)
  await k.locator(`${MAIN} .gx-row[data-kind="forward"]`).nth(1).click();
  await k.locator('.gx-tool-remove').click();
  await tap(k, 'jump');
  await largar(k);
  await waitResult(k);
  await k.waitForTimeout(1500);
  const won = await k.locator('.gx-result-line').innerText();
  ok(/Ganaste/.test(won), `c2-a: the fixed program wins ("${won}")`);
  await k.locator('.gx-seguir').click();

  // /admin: the track on screen and the medals
  await K.p.evaluate(() => window.__piloto.flush());
  await waitAdmin(a, K.sid, /Copa 2 · pista 2-/);
  ok(true, '/admin: K shows "Copa 2 · pista 2-…" with its medals');
  console.log(`     admin row: ${(await adminRow(a, K.sid)).replace(/\s+/g, ' ').slice(0, 140)}`);
  await a.locator(`#class-rows tr[data-id="${K.sid}"]`).scrollIntoViewIfNeeded();
  await shot(a, 'admin-copa');

  // ---------------------------------------------------------------- copa 2 finished: the Arcade opens
  ok(await flow(k).then((f) => !f.arcadeOpen), 'the Arcade is still closed with copa 2 half done');
  await k.evaluate(() => window.__copaFlow.finishCopa(2));
  await k.waitForSelector('.pp-arcade-open', { timeout: 20_000 });
  ok(/Se abrió el Arcade/.test(await k.locator('.pp-arcade-open-title').innerText()), '"¡Se abrió el Arcade!" large inside the screen, after copa 2');
  await k.waitForTimeout(500);
  await shot(k, 'arcade-unlock');
  const fk = await flow(k);
  ok(fk.arcadeOpen === true && fk.routeDone === true && fk.step === 'copa', 'the flow: the Arcade open, the green flag up, still in the Copa');
  await k.locator('[data-act="arcade-go"]').click();
  await waitStep(k, 'free_play');
  await k.waitForSelector('main.pp-menu', { timeout: 20_000 });
  const menu = await k.locator('main.pp-menu').getAttribute('data-menu');
  ok(menu === 'typing_race copa wardrobe workshop', `the Arcade's menu: ${menu}`);
  ok(await k.locator('.pp-fp-card[data-activity="copa"] .pp-fp-medals svg').count() === 5, '"Tu mejor tiempo": the card carries the five copas as medals');
  await k.waitForTimeout(500);
  await shot(k, 'arcade-menu');
  await k.locator('.pp-fp-card[data-activity="copa"]').click();
  await waitStep(k, 'copa');
  await k.waitForSelector('.hb-page');
  ok(await k.locator('.hb-track-time').evaluateAll((els) => els.filter((e) => /\d,\d s/.test(e.textContent)).length >= 3), '"Tu mejor tiempo": the strip lists copas and tracks with their best times');
  ok(await k.locator('.hb-medal.is-gold, .hb-medal.is-silver, .hb-medal.is-bronze').count() >= 1, 'the strip shows the medals earned');
  await shot(k, 'hub-best-times');

  // ---------------------------------------------------------------- a reload keeps the program
  await k.locator('.hb-track[data-track="c2-a"]').click();
  await k.waitForSelector('.gx-page[data-track="c2-a"]');
  const before = await rowsOf(k);
  const kept = !!(await journey(k)).programs['c2-a'];
  await k.reload();
  await waitStep(k, 'copa');
  await k.waitForSelector('.hb-page', { timeout: 30_000 });
  const fr = await flow(k);
  ok(fr.route === '4to' && fr.arcadeOpen === true && fr.routeDone === true, 'a reload: back on the Copa, 4to\'s route and the open Arcade kept');
  await k.locator('[data-act="hub-go"]').click();
  await k.waitForSelector('.gx-page');
  await k.locator('.hb-page').count();
  await k.locator('[data-act="copas"]').click();
  await k.locator('.hb-track[data-track="c2-a"]').click();
  await k.waitForSelector('.gx-page[data-track="c2-a"]');
  const after = await rowsOf(k);
  ok(before.length > 0 && after.join() === before.join() && kept, `a reload keeps the program of c2-a (${after.length} blocks)`);

  // ---------------------------------------------------------------- the mid-class survey, never during a run
  ok(await k.locator('.piloto[data-step="survey"]').count() === 0, 'mid-class survey: not yet (copa 3 not finished, the 25-minute timer not due)');
  await largar(k);
  await k.waitForSelector('.gx-page[data-phase="run"]', { timeout: 15_000 });
  await k.evaluate(() => window.__copaFlow.finishCopa(3));
  await k.waitForTimeout(3500);
  ok(await k.locator('.piloto[data-step="survey"]').count() === 0, 'mid-class survey: copa 3 is finished but a run is on screen: it waits');
  await k.waitForSelector('.piloto[data-step="survey"]', { timeout: 60_000 });
  ok(true, 'mid-class survey: opens once the run is over (never mid-run)');
  await k.waitForSelector('.pp-q-text', { timeout: 20_000 });
  await k.waitForTimeout(600);
  await shot(k, 'survey');

  // ---------------------------------------------------------------- M: placed in copa 3, the earlier copas on the strip, the skip
  const M = await child('M', 'Mateo');
  const m = M.p;
  last = m;
  await m.evaluate(() => { const sid = window.__piloto.session().id; localStorage.setItem('camino.piloto.copa2.ceiling.v1', JSON.stringify({ sid, at: Date.now(), value: { rung: 15 } })); });
  await m.evaluate(() => window.__piloto.jump('copa'));
  await m.waitForSelector('.hb-page', { timeout: 20_000 });
  const jm = await journey(m);
  ok(jm.startCopa === 3 && jm.rival === 'gold', 'M: a ladder ceiling of 15 places the child in copa 3 against the gold rival');
  ok(/Empezás en la Copa 3/.test(await m.locator('.hb-headline').innerText()), 'M: the strip says "Empezás en la Copa 3"');
  ok(await m.locator('.hb-copa[data-copa="1"] .hb-copa-head:not([disabled])').count() === 1, 'M: the copas before the starting copa are reachable from the strip');
  await shot(m, 'hub-placement-copa3');
  await m.locator('.hb-copa[data-copa="1"] .hb-copa-head').click();
  await m.waitForSelector('.gx-page[data-track="c1-a"]');
  await build(m, GOLD_C1A);
  await largar(m);
  await waitResult(m);
  await m.waitForTimeout(2200);
  ok(await m.locator('.gx-skip').isVisible(), 'M: copa 1\'s first track won on the first run → "¡Saltar a la copa siguiente!"');
  await m.locator('.gx-skip').click();
  await m.waitForSelector('.hb-page[data-note="skipped"]');
  ok(/Saltaste a la Copa 2/.test(await m.locator('.hb-headline').innerText()), 'M: the skip lands on the strip: "¡Saltaste a la Copa 2!"');
  await shot(m, 'hub-skipped');
  ok((await journey(m)).skipped.includes(1), 'M: copa 1 counts as finished');

  // ---------------------------------------------------------------- the rows
  const name = sql(`select child_name from sessions where id = '${K.sid}';`);
  ok(name === 'Lola', `K's name in sessions.child_name: ${name}`);
  await K.p.evaluate(() => window.__piloto.flush());
  await M.p.evaluate(() => window.__piloto.flush());
  const rows = (sid, type) => json(`select payload from events where session_id = '${sid}' and type = '${type}' order by seq`).map((r) => r.payload);
  const place = rows(K.sid, 'garage_place');
  ok(place.length === 1 && place[0].start_copa === 1, 'garage_place: K started in copa 1');
  const runs = rows(K.sid, 'garage_run');
  ok(runs.some((r) => r.track === 'c1-a' && r.outcome === 'finish' && r.place === 1) && runs.filter((r) => r.track === 'c1-b' && r.outcome === 'crash').length >= 2, `garage_run: c1-a won, c1-b crashed twice (${runs.length} runs)`);
  ok(runs.some((r) => r.deer === true && r.track === 'c2-a'), 'garage_run: the deer\'s runs carry deer: true');
  ok(rows(K.sid, 'garage_ghost').some((r) => r.track === 'c1-b'), 'garage_ghost: c1-b');
  ok(rows(K.sid, 'garage_step_view').length >= 1, 'garage_step_view: Ver paso a paso');
  ok(rows(K.sid, 'garage_revancha').some((r) => r.track === 'c1-a'), 'garage_revancha: c1-a');
  const debug = rows(K.sid, 'garage_debug');
  ok(debug.length === 1 && debug[0].copa === 2 && debug[0].fixed === true && debug[0].attempts >= 2, `garage_debug: copa 2 fixed in ${debug[0]?.attempts} attempts`);
  const spy = rows(K.sid, 'garage_spy');
  ok(spy.length === 1 && spy[0].track === 'c2-a' && spy[0].correct === true && spy[0].tapped_block_kind === 'repeat', `garage_spy: ${JSON.stringify(spy[0])}`);
  const done = rows(K.sid, 'garage_track_done');
  ok(done.some((r) => r.track === 'c1-a' && r.medal) && done.some((r) => r.track === 'c2-a'), `garage_track_done: ${done.map((r) => `${r.track}:${r.medal}`).join(' ')}`);
  ok(rows(K.sid, 'garage_copa_start').map((r) => r.copa).includes(2), 'garage_copa_start: copa 2');
  const skip = rows(M.sid, 'garage_skip');
  ok(skip.length === 1 && skip[0].from_copa === 1 && skip[0].to_copa === 2, 'garage_skip: M left copa 1 for copa 2');
  const mplace = rows(M.sid, 'garage_place');
  ok(mplace[0]?.start_copa === 3 && mplace[0]?.ceiling_rung === 15, 'garage_place: M started in copa 3 (ceiling 15)');
  const arc = json(`select payload->>'via' as via from events where session_id = '${K.sid}' and type = 'arcade_open'`);
  ok(arc.length === 1 && arc[0].via === 'copa', `arcade_open: via "${arc[0]?.via}" (copa 2 finished)`);
  const rd = json(`select payload->>'via' as via from events where session_id = '${K.sid}' and type = 'route_done'`);
  ok(rd.length === 1 && rd[0].via === 'copa', `route_done: via "${rd[0]?.via}"`);
  sql('DELETE FROM class_commands;');
} catch (e) {
  ok(false, `stopped: ${String(e.message ?? e).split('\n')[0]}`);
  if (last && SHOTS) await last.screenshot({ path: path.join(SHOTS, `stopped-${VW}.png`) }).catch(() => {});
  if (last) console.log('     at:', await last.evaluate(() => JSON.stringify({ step: window.__piloto?.flow().step, view: window.__copaFlow?.view() })).catch(() => '?'));
} finally {
  await browser.close();
}
ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 5).join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
