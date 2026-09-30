// Scripted check of the pilot playtest's data path, through the real UI,
// then the rows in Postgres. Three sessions:
//
// 1ro — setup, code, character; the real tool check (tap, ▶, drag, ↺, ✋);
//   the ladder from rung 1: pass 1, pass 2, then rung 3 (the fix page) with
//   an offline stretch: the three helps, 🔊, a fourth ✋ raises the hand, the
//   adult answers, a failed run ends the item (fail) and the ladder stops
//   (ceiling 2); the cheer; free play: the menu, sheet 6 (three core pages,
//   the easy door and its first extra), back to the menu, the music recess
//   (one song), back, the time runs out on the menu (the cheer); the typing
//   placeholder turned; the wardrobe (the scarf kept, the hat on and off, the
//   crown locked, "listo"); the survey, the goodbye garden with the session's
//   seeds, the adult form.
// 5to — enters at rung 9 (fog): two failed runs (fail), the floor check on
//   rung 8 passes, the ladder stops (floor, ceiling 8); the adult ends the
//   session from the corner.
// 3ro — the rule game (rung 11, opened with the ?debug ladder hook): a game
//   stopped before any arrow (no_play), one stopped after arrows (stopped),
//   then the rules and the arrows that win it.
//
// Then: every event in Postgres with seq 0..n-1 and no gaps, the tool_check
// and ladder_step rows, the ladder's ceiling agreeing with v_ladder_ceiling
// and v_session_summary, the rule game's runs, free play's choices, pages,
// activity_end rows and v_activity_time, the demo's progress key untouched.
//
// PW=<dir with playwright> node tools/check-piloto.mjs [base]
//   base: the app with /api (vite dev on 8811 proxying to the API, or the API serving dist/), default http://127.0.0.1:8811/
//   PSQL: the command that runs psql against the API's database, default
//         "docker exec -i camino-prueba-t5db psql -U postgres -tA"
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const [base = 'http://127.0.0.1:8811/'] = process.argv.slice(2);
const PSQL = process.env.PSQL ?? 'docker exec -i camino-prueba-t5db psql -U postgres -tA';
const sql = (q) => execSync(PSQL, { input: q }).toString().trim();
const json = (q) => sql(`select coalesce(json_agg(_r), '[]') from (${q}) _r;`);

let failures = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failures++; };

async function hold(p, x, y, ms) {
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.waitForTimeout(ms);
  await p.mouse.up();
}
const center = async (p, sel) => { const b = await p.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const idle = (p) => p.waitForFunction(() => document.querySelector('main.level')?.dataset.busy !== 'true', null, { timeout: 30_000 });
const onLevel = (p, id) => p.waitForSelector(`main.level[data-level="${id}"]`, { timeout: 30_000 });

/** Drags the palette block `cmd` into the notebook with the mouse. */
async function drag(p, cmd) {
  const [fx, fy] = await center(p, `.zone-palette [data-cmd="${cmd}"]`);
  const t = await p.locator('.zone-program').boundingBox();
  await p.mouse.move(fx, fy); await p.mouse.down(); await p.mouse.move(fx + 30, fy + 10, { steps: 4 });
  await p.mouse.move(t.x + t.width / 2, t.y + 140, { steps: 12 }); await p.mouse.up();
  await p.waitForTimeout(400);
}

/** Solves the page on screen with its reference solution (the ?debug hook), then turns it. */
async function solve(p) {
  await p.waitForTimeout(700);
  await p.evaluate(() => { window.__camino.setProgram(window.__camino.level.solution); });
  await p.waitForTimeout(300);
  await p.locator('.btn-play').click();
  await p.locator('.next-page').click({ force: true, timeout: 30_000 });
}

/** A run that bumps: one step up on a page whose way does not start up. */
async function failRun(p, program = [{ t: 'cmd', cmd: 'up' }]) {
  await p.evaluate((prog) => { window.__camino.setProgram(prog); }, program);
  await p.waitForTimeout(250);
  await p.locator('.btn-play').click();
  await p.waitForTimeout(500);
  await idle(p);
  await p.waitForTimeout(400);
}

async function newSession(p, grade, query = 'debug') {
  await p.goto(`${base}?${query}#/piloto`);
  await p.waitForSelector('.pp-setup');
  await p.getByRole('button', { name: grade, exact: true }).click();
  await p.getByRole('button', { name: 'A', exact: true }).click();
  await p.getByRole('checkbox').click();
  await p.getByRole('button', { name: 'Empezar' }).click();
  const code = await p.locator('.pp-code-word').getAttribute('data-code');
  const sid = await p.evaluate(() => window.__piloto.session().id);
  await p.getByRole('button', { name: 'Empezar' }).click();
  await p.waitForSelector('.choice-row');
  await p.waitForTimeout(500);
  await p.locator('[data-choice-char="mina"]').click();
  await p.waitForTimeout(600);
  return { code, sid };
}

async function drain(p) {
  let st;
  for (let i = 0; i < 90; i++) {
    await p.evaluate(() => window.__piloto.flush());
    st = await p.evaluate(() => window.__piloto.status());
    if (st.pending === 0 && st.dirty === 0) break;
    await p.waitForTimeout(1000);
  }
  ok(st.pending === 0 && st.dirty === 0, `queue drained (pending ${st.pending}, dirty ${st.dirty})`);
}

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
async function page() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(m.text())) errors.push(m.text()); });
  return { ctx, p };
}

// ================================================================== 1ro: tool check, ladder 1 ✓ 2 ✓ 3 ✗ (offline), end, survey
console.log('--- 1ro');
const one = await page();
let p = one.p;
const s1 = await newSession(p, '1ro');
ok(/^\p{Lu}\p{Ll}+ [1-9]\d$/u.test(s1.code), `session code "${s1.code}"`);
await p.locator('.doors-next').click({ force: true });

// the tool check, gesture by gesture
await onLevel(p, 'tool-1');
await p.waitForTimeout(1200);
await p.locator('.zone-palette [data-cmd="right"]').first().click(); // tap
await p.waitForTimeout(1200);
await p.locator('.btn-play').click(); // ▶
await onLevel(p, 'tool-2');
await p.waitForTimeout(1300);
await drag(p, 'right'); // drag
await p.waitForTimeout(1200);
await p.locator('.btn-restart').click(); // ↺
await p.waitForTimeout(1200);
await p.locator('.level-bar .help').click(); // ✋
await p.waitForSelector('[data-interlude="walk"]', { timeout: 15_000 });
ok(true, 'the tool check walks on to the ladder');

// ladder: rung 1 and rung 2 solved
await onLevel(p, '1ro-h1-2');
await solve(p);
await p.waitForSelector('[data-interlude="walk"]');
await onLevel(p, '1ro-h2-1');
await solve(p);
await onLevel(p, '1ro-h3-3');
await p.waitForTimeout(900);

// rung 3 offline: the helps, the hand, the adult's answer, then a failed run ends it
await one.ctx.setOffline(true);
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
await failRun(p, [{ t: 'cmd', cmd: 'right' }]);
await p.waitForSelector('[data-interlude="cheer"]', { timeout: 15_000 });
ok(true, 'a failed run after the solution hint ends the item; the ladder stops with the cheer');
const offline = await p.evaluate(() => window.__piloto.status());
ok(offline.pending > 5 && offline.failures > 0, `offline: ${offline.pending} events wait, ${offline.failures} failed posts`);
await one.ctx.setOffline(false);
await p.locator('.pp-cheer-next').click({ force: true });

// free play: the menu, the sheet (three core pages, a door, its extra), back to the menu, the music recess (one song), back
await p.waitForSelector('.pp-menu');
const cards = await p.locator('.pp-fp-card').evaluateAll((els) => els.map((e) => e.dataset.activity));
ok(cards.join(',') === 'sheet,recess,guardas,editor', `1ro menu: ${cards.join(',')}`);
await p.waitForTimeout(800);
await p.locator('.pp-fp-card[data-activity="sheet"]').click();
await onLevel(p, '1ro-h6-1');
ok((await p.locator('.level-bar .adult-title').innerText()).includes('Escalones'), 'the sheet page\'s own title in the bar');
for (const id of ['1ro-h6-1', '1ro-h6-2', '1ro-h6-3']) { await onLevel(p, id); await solve(p); }
await onLevel(p, '1ro-h6-4');
await p.waitForTimeout(600);
await p.locator('.level-bar .bar-door[data-door="easy"]').click();
await onLevel(p, '1ro-h6-easy-1');
ok(true, 'the easy door (a link in the bar) opened its first extra page');
await solve(p);
await p.waitForTimeout(800);
await p.locator('.pp-menu-back').click();
await p.waitForSelector('.pp-menu');
ok(true, 'back to the menu');
await p.waitForTimeout(600);
await p.locator('.pp-fp-card[data-activity="recess"]').click();
await onLevel(p, '1ro-h9-1');
await solve(p);
await onLevel(p, '1ro-h9-2');
await p.waitForTimeout(500);
await p.locator('.pp-menu-back').click();
await p.waitForSelector('.pp-menu');
const seedsFree = await p.evaluate(() => Number(document.querySelector('.seed-pouch')?.dataset.count));
// the time runs out on the menu: the cheer, and the next step
await p.evaluate(() => window.__freePlay.budget(0));
await p.waitForSelector('[data-interlude="cheer"]', { timeout: 15_000 });
ok(true, `free play's time is over on the menu: the cheer (${seedsFree} seeds in the pouch)`);
await p.locator('.pp-cheer-next').click({ force: true });

// the typing minigame (still a placeholder): turned
await p.waitForSelector('.pp-soon');
await p.locator('.pp-soon .next-page').click();

// the wardrobe: the scarf on, the mushroom hat on and off, the crown locked; "listo"
await p.waitForSelector('.mode-wardrobe .hooks');
await p.waitForTimeout(900);
const locked = await p.locator('.prenda[data-locked]').evaluateAll((els) => els.map((e) => e.dataset.prenda));
ok(!locked.includes('bufanda') && !locked.includes('hongo') && locked.includes('corona'), `wardrobe: scarf and hat open for everyone, locked: ${locked.join(',')}`);
for (const id of ['bufanda', 'hongo', 'hongo', 'corona']) { await p.locator(`[data-prenda="${id}"]`).click(); await p.waitForTimeout(700); }
await p.locator('.wardrobe-next').click({ force: true });

// the survey, the goodbye, the adult form
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
await p.waitForSelector('.pp-bye .pp-garden-svg');
await p.waitForTimeout(1200);
const byeSeeds = Number(await p.locator('.pp-garden-svg').getAttribute('data-seeds'));
const planted = await p.locator('.pp-garden-plant').count();
ok(byeSeeds === planted && byeSeeds >= seedsFree && byeSeeds >= 8, `the goodbye garden grows the session's ${byeSeeds} seeds (${planted} plants; the tool check, the ladder and free play)`);
ok(await p.locator('.pp-garden-svg .garden-me').count() === 1, 'the character stands in the goodbye garden');
await p.locator('.pp-for-adult').click();
await p.locator('[data-value="high"]').click();
await p.locator('[data-value="some"]').click();
await p.fill('.pp-comment textarea', 'Probó arrastrar sin ayuda.');
await p.getByRole('button', { name: 'Guardar' }).click();
await drain(p);
ok((await p.evaluate(() => localStorage.getItem('camino.progress.v1'))) === null, 'the demo\'s camino.progress.v1 was never written');
await one.ctx.close();

// ================================================================== 5to: enters at rung 9, fails it, the floor check passes
console.log('--- 5to');
const five = await page();
p = five.p;
const s5 = await newSession(p, '5to');
await p.locator('.doors-next').click({ force: true });
// the tool check: the tap never comes; the ghost shows it at 20 s, the check moves on at 40 s; ▶ on an empty notebook still counts
await onLevel(p, 'tool-1');
await p.waitForTimeout(21_500);
ok(await p.locator('.ghost-layer svg').count() > 0, 'no tap in 20 s: the ghost hand shows it');
await p.waitForFunction(() => document.querySelector('.pp-cue') && document.querySelector('.pp-cue').getBoundingClientRect().left > 300, null, { timeout: 30_000 });
ok(true, 'at 40 s the check moved on to ▶ (the ring is on Probar)');
await p.locator('.btn-play').click();
await onLevel(p, 'tool-2');
await p.evaluate(() => window.__piloto.jump('ladder'));
await onLevel(p, '2do-1');
ok(true, '5to enters the ladder at rung 9 (2do-1, the fog)');
await p.waitForTimeout(900);
await failRun(p, [{ t: 'loop', count: 'goal', body: ['right'] }]);
await failRun(p, [{ t: 'loop', count: 'goal', body: ['right'] }]);
await onLevel(p, '1ro-h13-2');
ok(true, 'two failed runs end the item; the floor check opens rung 8');
await solve(p);
await p.waitForSelector('[data-interlude="cheer"]', { timeout: 15_000 });
// the adult ends the session from the corner: straight to the survey
await hold(p, 18, 18, 1700);
await p.locator('[data-act="end"]').click();
await p.locator('[data-act="end-confirm"]').click();
await p.waitForSelector('.pp-survey');
ok(true, 'the adult ended the 5to session from the corner: the survey');
await drain(p);
await five.ctx.close();

// ================================================================== 3ro: the rule game's runs
console.log('--- 3ro');
const three = await page();
p = three.p;
// no first-entry demo (it would press ▶ itself); straight to the ladder's rule game
const s3b = await newSession(p, '3ro', 'debug&nointro');
await p.evaluate(() => window.__piloto.jump('ladder'));
await p.waitForSelector('main.level');
await p.evaluate(() => window.__ladder.go(11));
await onLevel(p, '3ro-1');
await p.waitForTimeout(900);
// ▶ then ■ at once: no arrow pressed
await p.locator('.btn-play').click(); await p.waitForTimeout(700);
await p.locator('.btn-play').click(); await p.waitForTimeout(500);
// one rule, ▶, two arrows, ■
await p.evaluate(() => window.__camino.setRules([{ hat: 'key:right', actions: ['right'] }]));
await p.locator('.btn-play').click(); await p.waitForTimeout(500);
for (const k of ['ArrowRight', 'ArrowRight']) { await p.keyboard.press(k); await p.waitForTimeout(700); }
await p.locator('.btn-play').click(); await p.waitForTimeout(500);
// the reference rules and the way to the seed
await p.evaluate(() => window.__camino.setRules(window.__camino.level.realtime.solution));
await p.locator('.btn-play').click(); await p.waitForTimeout(500);
for (const k of ['Up', 'Up', 'Right', 'Right', 'Right', 'Down', 'Right', 'Right', 'Up', 'Up']) { await p.keyboard.press(`Arrow${k}`); await p.waitForTimeout(650); }
await p.locator('.next-page').click({ force: true, timeout: 15_000 });
await p.waitForSelector('[data-interlude="walk"]');
ok(true, 'the rule game was won by the arrows and the page turned');
await drain(p);
await three.ctx.close();

ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();

// ================================================================== the database
console.log('--- database');
for (const [name, s] of [['1ro', s1], ['5to', s5], ['3ro', s3b]]) {
  const rows = sql(`select seq from events where session_id = '${s.sid}' order by seq;`).split('\n').filter(Boolean).map(Number);
  ok(rows.length > 10 && rows.every((x, i) => x === i), `${name}: ${rows.length} events, seq 0..${rows.length - 1} with no gaps`);
}
// free play
const picks = JSON.parse(json(`select payload p from events where session_id = '${s1.sid}' and type = 'choice' and payload->>'activity' <> 'character' order by seq`)).map((x) => x.p);
ok(picks.map((x) => x.door ? `door:${x.door}` : `${x.activity}#${x.visit}`).join(' ') === 'sheet#1 door:easy recess#2', `free-play choices: ${JSON.stringify(picks)}`);
const fpEnds = JSON.parse(json(`select payload p from events where session_id = '${s1.sid}' and type = 'activity_end' order by seq`)).map((x) => x.p);
ok(fpEnds.length === 2 && fpEnds.every((x) => x.reason === 'menu' && x.time_ms > 0), `activity_end rows: ${JSON.stringify(fpEnds)}`);
// 6-1, 6-2, 6-3 solved, 6-4 left by the door, the easy extra solved, the next extra left by the menu button
ok(fpEnds[0]?.activity === 'sheet' && fpEnds[0]?.levels === 6 && fpEnds[0]?.wins === 4 && fpEnds[0]?.extras === 1, `the sheet visit counts its pages, wins and the extra solved: ${JSON.stringify(fpEnds[0])}`);
const sheetEnds = JSON.parse(json(`select payload p from events where session_id = '${s1.sid}' and type = 'level_end' and payload->>'activity' = 'sheet' order by seq`)).map((x) => x.p);
ok(sheetEnds.some((x) => x.page === 'extra' && x.door === 'easy' && x.outcome === 'win' && x.sheet === 6), 'the door\'s extra page: level_end with page extra, door easy, won');
ok(sheetEnds.filter((x) => x.page === 'core' && x.outcome === 'win').length === 3, 'three core pages won in the sheet');
const recessStart = JSON.parse(json(`select payload p from events where session_id = '${s1.sid}' and type = 'level_start' and payload->>'activity' = 'recess' order by seq`)).map((x) => x.p);
ok(recessStart[0]?.level_id === '1ro-h9-1' && recessStart[0]?.sheet === 9, `the recess page's level_start: ${JSON.stringify(recessStart[0])}`);
ok(Number(sql(`select count(*) from events where session_id = '${s1.sid}' and type = 'run' and payload->>'level_id' = '1ro-h9-1';`)) >= 1, 'the song\'s run was logged');
const times = Object.fromEntries(sql(`select activity || '=' || round(seconds) from v_activity_time where session_id = '${s1.sid}';`).split('\n').map((x) => x.split('=')));
ok(Number(times.sheet) > 5 && Number(times.recess) > 1 && Number(times.ladder) > 1 && Number(times.tool_check) > 1, `v_activity_time: ${JSON.stringify(times)}`);
ok(Math.abs(Number(times.sheet) - fpEnds[0].time_ms / 1000) <= 1, 'the sheet\'s time is its visit (activity_end), not only its pages');
// the wardrobe and the goodbye garden
const ward = JSON.parse(json(`select payload p from events where session_id = '${s1.sid}' and type = 'wardrobe' order by seq`)).map((x) => x.p);
ok(ward.map((x) => x.action).join(',') === 'open,on,on,off,locked,close', `wardrobe events: ${ward.map((x) => x.action).join(',')}`);
ok(ward[0]?.unlocked?.includes('bufanda') && ward[0]?.seeds === byeSeeds, `wardrobe open: ${JSON.stringify(ward[0])}`);
ok(ward[4]?.outfit_id === 'corona' && ward[4]?.needs === 16, `a locked piece says what it needs: ${JSON.stringify(ward[4])}`);
const close = ward[5];
ok(close?.reason === 'done' && close?.outfit?.neck === 'bufanda' && !close?.outfit?.head && close?.duration_ms > 1000 && close?.taps === 4, `the outfit kept: ${JSON.stringify(close)}`);
const gv = JSON.parse(json(`select payload p from events where session_id = '${s1.sid}' and type = 'garden_view'`))[0]?.p;
ok(gv?.seeds === byeSeeds && gv?.duration_ms > 500 && gv?.outfit?.neck === 'bufanda', `garden_view: ${JSON.stringify(gv)}`);
ok(Number(times.wardrobe ?? 0) === 0, 'the wardrobe is not a free-play activity in v_activity_time');
const types = sql(`select type || ':' || count(*) from events where session_id = '${s1.sid}' group by type order by type;`).split('\n');
console.log(`     1ro: ${types.join(' ')}`);
for (const t of ['step', 'choice', 'tool_check', 'level_start', 'run', 'level_end', 'help', 'ghost_demo', 'speak', 'tap_add', 'drag', 'call_adult', 'adult_help', 'ladder_step', 'ladder_end', 'activity_end', 'wardrobe', 'survey_answer', 'garden_view']) {
  ok(types.some((x) => x.startsWith(`${t}:`)), `1ro has ${t}`);
}

// the tool check
const tools = JSON.parse(json(`select payload->>'gesture' g, (payload->>'done')::boolean done, (payload->>'attempts')::int attempts, (payload->>'shown_by_ghost')::boolean ghost, payload->>'level_id' lv, (payload->>'time_ms')::int ms from events where session_id = '${s1.sid}' and type = 'tool_check' order by seq`));
ok(tools.map((x) => x.g).join(',') === 'tap,play,drag,reset,help', `tool_check gestures in order: ${tools.map((x) => x.g).join(',')}`);
ok(tools.every((x) => x.done && !x.ghost && x.attempts >= 1 && x.ms > 0), `every gesture done, alone: ${JSON.stringify(tools)}`);
ok(tools.slice(0, 2).every((x) => x.lv === 'tool-1') && tools.slice(2).every((x) => x.lv === 'tool-2'), 'gestures on their pages');
const drags = JSON.parse(json(`select payload->>'level_id' lv, payload->>'phase' ph, payload->>'success' ok from events where session_id = '${s1.sid}' and type = 'drag' and payload->>'level_id' = 'tool-2'`));
ok(drags.some((d) => d.ph === 'drop' && d.ok === 'true'), 'the tool check\'s drag is also a drag event (drop, success)');
ok(Number(sql(`select count(*) from events where session_id = '${s1.sid}' and type = 'tap_add' and payload->>'level_id' = 'tool-1';`)) === 1, 'the tool check\'s tap is a tap_add event');

// the 1ro ladder
const steps1 = JSON.parse(json(`select (payload->>'rung')::int rung, payload->>'item' item, payload->>'concept' concept, payload->>'check' chk, payload->>'result' result, payload->>'next' nxt, (payload->>'help_levels')::int help, (payload->>'adult_helped')::boolean adult, (payload->>'attempts')::int attempts from events where session_id = '${s1.sid}' and type = 'ladder_step' order by seq`));
ok(steps1.map((x) => `${x.rung}${x.result === 'pass' ? '✓' : '✗'}`).join(' ') === '1✓ 2✓ 3✗', `1ro ladder: ${steps1.map((x) => `${x.rung}${x.result === 'pass' ? '✓' : '✗'}`).join(' ')}`);
ok(steps1[0]?.nxt === '1ro-h2-1' && steps1[1]?.nxt === '1ro-h3-3' && steps1[2]?.nxt === null, 'next items recorded, null at the stop');
ok(steps1[2]?.help === 3 && steps1[2]?.adult === true && steps1[2]?.concept === 'fix', `the fix item records help 3 and the adult's help: ${JSON.stringify(steps1[2])}`);
const end1 = JSON.parse(json(`select payload p from events where session_id = '${s1.sid}' and type = 'ladder_end'`))[0]?.p;
ok(end1?.reason === 'ceiling' && end1?.ceiling_rung === 2 && end1?.entry_rung === 1 && end1?.items === 3, `1ro ladder_end ${JSON.stringify(end1)}`);
const view1 = sql(`select ladder_ceiling_rung from v_session_summary where session_id = '${s1.sid}';`);
const conc1 = sql(`select string_agg(concept || ':' || rung, ',' order by rung) from v_ladder_ceiling where session_id = '${s1.sid}';`);
ok(view1 === '2' && conc1 === 'sequence:1,long_sequence:2', `views agree: ladder_ceiling_rung ${view1}, v_ladder_ceiling ${conc1}`);
const lvEnd3 = JSON.parse(json(`select payload p from events where session_id = '${s1.sid}' and type = 'level_end' and payload->>'item' = '1ro-h3-3'`))[0]?.p;
ok(lvEnd3?.outcome === 'fail' && lvEnd3?.adult_helped === true && lvEnd3?.rung === 3, `the fix page's level_end: ${lvEnd3?.outcome}, adult_helped ${lvEnd3?.adult_helped}`);
ok(Number(sql(`select count(*) from events where session_id = '${s1.sid}' and type = 'run' and (payload->>'after_ghost')::boolean;`)) >= 1, 'a run after the ghost demo is marked after_ghost');
const sess = JSON.parse(sql(`select row_to_json(s) from (select code, grade, division, consent, ended_at is not null as ended, end_reason, survey, adult_form from sessions where id = '${s1.sid}') s;`));
ok(sess.code === s1.code && sess.division === 'A' && sess.consent === true, `session ${sess.code}, grade ${sess.grade}, division ${sess.division}`);
ok(sess.ended && sess.end_reason === 'completed', `ended, end_reason ${sess.end_reason}`);
ok(sql(`select end_reason from sessions where id = '${s5.sid}';`) === 'adult_ended', '5to: end_reason adult_ended');
ok(sess.survey?.liked === 'yes' && sess.survey?.favorite_activity === 'ladder' && sess.survey?.play_again === 'yes', `survey ${JSON.stringify(sess.survey)}`);
ok(sess.adult_form?.engagement === 'high' && sess.adult_form?.help_needed === 'some', `adult form ${JSON.stringify(sess.adult_form)}`);

// the 5to ladder
const steps5 = JSON.parse(json(`select (payload->>'rung')::int rung, payload->>'check' chk, payload->>'result' result, payload->>'next' nxt, (payload->>'attempts')::int attempts from events where session_id = '${s5.sid}' and type = 'ladder_step' order by seq`));
ok(steps5.map((x) => `${x.rung}${x.chk === 'floor' ? 'f' : ''}${x.result === 'pass' ? '✓' : '✗'}`).join(' ') === '9✗ 8f✓', `5to ladder: ${steps5.map((x) => `${x.rung}${x.chk === 'floor' ? 'f' : ''}${x.result === 'pass' ? '✓' : '✗'}`).join(' ')}`);
const end5 = JSON.parse(json(`select payload p from events where session_id = '${s5.sid}' and type = 'ladder_end'`))[0]?.p;
ok(end5?.reason === 'floor' && end5?.ceiling_rung === 8 && end5?.entry_rung === 9, `5to ladder_end ${JSON.stringify(end5)}`);
ok(sql(`select ladder_ceiling_rung from v_session_summary where session_id = '${s5.sid}';`) === '8', 'v_session_summary agrees (8)');
const fogRuns = JSON.parse(json(`select payload->>'result' r from events where session_id = '${s5.sid}' and type = 'run' and payload->>'level_id' = '2do-1' order by seq`));
ok(fogRuns.length === 2 && fogRuns.every((x) => x.r !== 'win'), `the fog page's two runs: ${fogRuns.map((x) => x.r).join(',')}`);

const tools5 = JSON.parse(json(`select payload->>'gesture' g, (payload->>'done')::boolean done, (payload->>'shown_by_ghost')::boolean ghost, (payload->>'time_ms')::int ms from events where session_id = '${s5.sid}' and type = 'tool_check' order by seq`));
ok(tools5[0]?.g === 'tap' && tools5[0].done === false && tools5[0].ghost === true && tools5[0].ms >= 40_000, `5to tap not done, shown by the ghost: ${JSON.stringify(tools5[0])}`);
ok(tools5[1]?.g === 'play' && tools5[1].done === true && tools5[1].ghost === false, `5to ▶ done: ${JSON.stringify(tools5[1])}`);
ok(Number(sql(`select count(*) from events where session_id = '${s5.sid}' and type = 'ghost_demo' and payload->>'kind' = 'tool';`)) === 1, 'one ghost_demo of kind tool');

// the rule game's runs
const rt = JSON.parse(json(`select payload->>'result' r, (payload->>'keys')::int keys, (payload->>'score')::int score, payload->>'program' prog, (payload->>'blocks_used')::int blocks from events where session_id = '${s3b.sid}' and type = 'run' and payload->>'level_id' = '3ro-1' order by seq`));
ok(rt.map((x) => x.r).join(',') === 'no_play,stopped,win', `rule game runs: ${rt.map((x) => `${x.r}(${x.keys} keys)`).join(' ')}`);
ok(rt[1]?.keys === 2 && rt[1]?.prog === 'key:right(right)' && rt[1]?.blocks === 2, `a game's rules and keys: ${JSON.stringify(rt[1])}`);
ok(rt[2]?.keys >= 10 && rt[2]?.prog.includes('key:down(down)'), `the winning game: ${JSON.stringify(rt[2])}`);
const step3 = JSON.parse(json(`select payload p from events where session_id = '${s3b.sid}' and type = 'ladder_step'`)).map((x) => x.p);
const rule = step3.find((x) => x.rung === 11);
ok(rule?.result === 'pass' && rule?.attempts === 3, `the rule game item: ${rule?.result}, ${rule?.attempts} runs`);

console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
