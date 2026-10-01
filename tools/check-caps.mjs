// Scripted check of the ladder's caps (T11), with the fast caps of
// `?caps=fast` (src/playtest/ladder.ts FAST_CAPS: an item 30 s, no input
// 12 s, the ladder 60 s, an item open at the ladder's end 70 s):
//
// 2do — enters at rung 2: no input at all → the item ends at the idle cap
//   (end_reason idle_cap, 0 attempts); the floor check on rung 1 gets taps
//   on the palette every few seconds but no run → it ends at the item's time
//   cap (time_cap), the ladder stops (floor).
// 5to — the first rule-game item (rung 11): the ghost's intro (its rule, ▶,
//   its key), the line after it ("tocá las flechas…") on screen, ↑ without a
//   rule (the "no rule yet" line), → pressed: the game keeps running, nobody
//   stops it → the time cap ends it and the game still running is the
//   item's first attempt (run `unfinished` with its keys, attempts 1).
// 3ro — rungs 5 and 6 solved, rung 7 opened with the ladder's time almost
//   over and played (taps) → it ends at the ladder's hard time
//   (ladder_time) long before its own cap; the ladder stops (max_time).
//
// PW=<dir with playwright> node tools/check-caps.mjs [base]
//   base: the app with /api (vite dev on 8811 or the API serving a build), default http://127.0.0.1:8811/
//   PSQL: psql against the API's database, default "docker exec -i camino-prueba-t11db psql -U postgres -tA"
//   PARTS: which sessions to run, default "2do,5to,3ro"
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const [base = 'http://127.0.0.1:8811/'] = process.argv.slice(2);
const PSQL = process.env.PSQL ?? 'docker exec -i camino-prueba-t11db psql -U postgres -tA';
const sql = (q) => execSync(PSQL, { input: q }).toString().trim();
const json = (q) => JSON.parse(sql(`select coalesce(json_agg(_r), '[]') from (${q}) _r;`));

const PARTS = (process.env.PARTS ?? '2do,5to,3ro').split(',');
let failures = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failures++; };
const onLevel = (p, id, timeout = 30_000) => p.waitForSelector(`main.level[data-level="${id}"]`, { timeout });

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
async function session(grade, extra = '') {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`${base}?debug&caps=fast${extra}#/piloto`);
  await p.waitForSelector('.pp-setup');
  await p.locator(`.pp-grade-card[aria-label="${grade}"]`).click();
  await p.waitForSelector('.choice-row');
  const sid = await p.evaluate(() => window.__piloto.session().id);
  await p.waitForTimeout(500);
  await p.locator('[data-choice-char="ovillo"]').click();
  await p.waitForTimeout(500);
  await p.evaluate(() => window.__piloto.jump('ladder'));
  return { ctx, p, sid };
}
async function drain(p) {
  for (let i = 0; i < 60; i++) {
    await p.evaluate(() => window.__piloto.flush());
    const st = await p.evaluate(() => window.__piloto.status());
    if (st.pending === 0 && st.dirty === 0) return;
    await p.waitForTimeout(1000);
  }
  ok(false, 'queue drained');
}
/** Taps a palette block (input, never a run) every `every` ms for `ms`, or until `until()` holds. */
async function keepTapping(p, ms, every = 3000, until = async () => false, sel = '.zone-palette [data-cmd]') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms && !(await until())) {
    await p.locator(sel).first().click({ timeout: 2000, position: sel.includes('stage') ? { x: 12, y: 12 } : undefined }).catch(() => {});
    await p.waitForTimeout(every);
  }
}
/** A tap on the paper around the board: input, nothing else. */
const PAPER = '.level-stage .sheet';
async function solve(p) {
  await p.waitForTimeout(700);
  await p.evaluate(() => { window.__camino.setProgram(window.__camino.level.solution); });
  await p.waitForTimeout(300);
  await p.locator('.btn-play').click();
  await p.locator('.next-page').click({ force: true, timeout: 30_000 });
}
const steps = (sid) => json(`select (payload->>'rung')::int rung, payload->>'check' chk, payload->>'result' result, payload->>'end_reason' why, (payload->>'time_ms')::int ms, (payload->>'attempts')::int attempts from events where session_id = '${sid}' and type = 'ladder_step' order by seq`);
const ladderEnd = (sid) => json(`select payload p from events where session_id = '${sid}' and type = 'ladder_end'`)[0]?.p;

// ================================================================== 2do: idle cap, then the time cap
if (PARTS.includes('2do')) {
  console.log('--- 2do: no input, then input without a run');
  const { ctx, p, sid } = await session('2do');
  await onLevel(p, 'pp-l2');
  const t0 = Date.now();
  await p.waitForSelector('[data-interlude="walk"]', { timeout: 30_000 });
  const idleS = (Date.now() - t0) / 1000;
  ok(idleS >= 11 && idleS < 20, `no input: the item ended at the idle cap (${idleS.toFixed(1)} s)`);
  await onLevel(p, 'pp-l1');
  const t1 = Date.now();
  await keepTapping(p, 45_000, 3000, async () => (await p.locator('[data-interlude="cheer"]').count()) > 0);
  await p.waitForSelector('[data-interlude="cheer"]', { timeout: 15_000 });
  const capS = (Date.now() - t1) / 1000;
  ok(capS >= 29 && capS < 40, `taps but no run: the item ended at the time cap (${capS.toFixed(1)} s), the ladder stopped`);
  await drain(p);
  const st = steps(sid);
  ok(st.map((x) => `${x.rung}${x.chk === 'floor' ? 'f' : ''}:${x.why}`).join(' ') === '2:idle_cap 1f:time_cap', `ladder_step reasons: ${JSON.stringify(st)}`);
  ok(st[0]?.result === 'fail' && st[0]?.attempts === 0 && st[0]?.ms >= 12_000 && st[0]?.ms < 18_000, `idle item: fail, 0 attempts, ${st[0]?.ms} ms`);
  ok(st[1]?.result === 'fail' && st[1]?.ms >= 30_000 && st[1]?.ms < 36_000, `timed item: fail, ${st[1]?.ms} ms`);
  const lvEnd = json(`select payload->>'end_reason' why from events where session_id = '${sid}' and type = 'level_end' and payload->>'activity' = 'ladder' order by seq`).map((x) => x.why);
  ok(lvEnd.join(',') === 'idle_cap,time_cap', `level_end.end_reason: ${lvEnd.join(',')}`);
  ok(Number(sql(`select count(*) from events where session_id = '${sid}' and type = 'tap_add' and payload->>'level_id' = 'pp-l1';`)) >= 5, 'the taps on rung 1 were logged');
  ok(ladderEnd(sid)?.reason === 'floor', `ladder_end ${JSON.stringify(ladderEnd(sid))}`);
  await ctx.close();
}

// ================================================================== 5to: the rule game's start and its first attempt
if (PARTS.includes('5to')) {
  console.log('--- 5to: the rule-game item, a game left running');
  const { ctx, p, sid } = await session('5to');
  await onLevel(p, 'pp-l9');
  await p.evaluate(() => window.__ladder.go(11));
  await onLevel(p, 'pp-l11');
  const t0 = Date.now();
  // the ghost's intro: its rule built, ▶ pressed, → pressed; then the line about the keys
  await p.waitForFunction(() => document.querySelector('.level-bar .pp-cap')?.textContent?.includes('flechas del teclado o de la pantalla'), null, { timeout: 25_000 });
  ok(true, `the line after the intro is on screen (${((Date.now() - t0) / 1000).toFixed(1)} s): "${(await p.locator('.level-bar .pp-cap').innerText()).replace(/\s+/g, ' ')}"`);
  ok((await p.locator('.level-bar .pp-cap').innerText()).includes('Ovillo'), 'the character\'s name is in the line');
  ok(await p.locator('.btn-play.is-running').count() === 1, 'the intro left the game running');
  ok(await p.locator('.keypad .key-btn').count() === 2, 'the on-screen keys: ↑ and →');
  await p.keyboard.press('ArrowUp');
  await p.waitForFunction(() => document.querySelector('.level-bar .pp-cap')?.textContent?.includes('no tiene regla'), null, { timeout: 5000 });
  ok(true, '↑ without a rule: the "no rule yet" line');
  await p.locator('.key-btn[data-dir="right"]').click();
  await p.waitForTimeout(800);
  // keep pressing now and then: never idle, never stopped
  const t1 = Date.now();
  while (!(await p.locator('[data-interlude]').count()) && Date.now() - t1 < 40_000) {
    await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(4000);
  }
  await p.waitForSelector('[data-interlude]', { timeout: 15_000 });
  const capS = (Date.now() - t0) / 1000;
  ok(capS >= 29 && capS < 40, `the item ended at the time cap (${capS.toFixed(1)} s)`);
  await drain(p);
  const runs = json(`select payload->>'result' r, (payload->>'keys')::int keys from events where session_id = '${sid}' and type = 'run' and payload->>'level_id' = 'pp-l11' order by seq`);
  ok(runs.length === 1 && runs[0].r === 'unfinished' && runs[0].keys >= 3, `the game still running is the first attempt: ${JSON.stringify(runs)}`);
  const st = steps(sid).find((x) => x.rung === 11);
  ok(st?.why === 'time_cap' && st?.attempts === 1 && st?.result === 'fail', `rung 11: ${JSON.stringify(st)}`);
  ok(Number(sql(`select count(*) from events where session_id = '${sid}' and type = 'ghost_demo' and payload->>'level_id' = 'pp-l11' and payload->>'kind' = 'intro';`)) === 1, 'one intro ghost_demo');
  await ctx.close();
}

// ================================================================== 3ro: an item opened at the end of the ladder's time
if (PARTS.includes('3ro')) {
  console.log('--- 3ro: the ladder\'s hard time');
  const { ctx, p, sid } = await session('3ro', '&nointro');
  const t0 = Date.now();
  // the ladder's clock started when the step opened: rung 6 is solved late enough that rung 7 opens near its end
  await onLevel(p, 'pp-l5');
  await keepTapping(p, 12_000 - (Date.now() - t0), 3000, async () => false, PAPER);
  await solve(p);
  await onLevel(p, 'pp-l6');
  await keepTapping(p, 36_000 - (Date.now() - t0), 3000, async () => false, PAPER);
  await solve(p);
  await onLevel(p, 'pp-l7');
  const t7 = Date.now();
  ok((t7 - t0) / 1000 > 40, `rung 7 opened late in the ladder (${((t7 - t0) / 1000).toFixed(1)} s; the ladder decided before its 60 s)`);
  await keepTapping(p, 40_000, 3000, async () => (await p.locator('[data-interlude="cheer"]').count()) > 0, PAPER);
  await p.waitForSelector('[data-interlude="cheer"]', { timeout: 15_000 });
  const endS = (Date.now() - t0) / 1000, itemS = (Date.now() - t7) / 1000;
  ok(itemS < 29, `rung 7 ended before its own 30 s cap (${itemS.toFixed(1)} s in, ${endS.toFixed(1)} s into the ladder)`);
  await drain(p);
  const st = steps(sid);
  ok(st.map((x) => `${x.rung}:${x.why}`).join(' ') === '5:solved 6:solved 7:ladder_time', `ladder_step reasons: ${st.map((x) => `${x.rung}:${x.why}`).join(' ')}`);
  ok(ladderEnd(sid)?.reason === 'max_time' && ladderEnd(sid)?.ceiling_rung === 6, `ladder_end ${JSON.stringify(ladderEnd(sid))}`);
  ok(ladderEnd(sid)?.time_ms >= 70_000 && ladderEnd(sid)?.time_ms < 78_000, `the ladder ran ${ladderEnd(sid)?.time_ms} ms (hard time 70 s)`);
  await ctx.close();
}

ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
