// T33's scripted check: "La carrera" played through the real UI, muted, in
// 1ro, and its telemetry in Postgres.
//
// - A fresh muted 1ro session (`?grado=1&sonido=no`, a real character pick)
//   reaches free play. T43 (2026-10-25): La carrera left 1ro's route and
//   menu (1ro's arcade of monster games); this check now opens it the only
//   way 1ro has, from the adult corner menu ("Abrir «La carrera»"), and
//   checks it is not on the menu.
// - Race 1 (tier 1): the first-time wordless ghost demo shows a block
//   carried into the first slot; then every stretch is built with real
//   input: taps on the palette, one keyboard arrow, one real mouse drag,
//   one wrong block (the kart bumps a bush, the block pops out, nothing is
//   lost), one tap on a filled slot (it comes out and is placed again). The
//   kart zooms by itself after each full tape; the child crosses first; the
//   podium shows a cup on the shelf.
// - "¡Otra carrera!" starts race 2 at tier 2 (a voluntary `again`).
// - Race 3 at tier 3 (the debug hook jumps the tier: the script does not
//   replay tier 2): built for real again; the first turbo straight with the
//   palette's real `repetir` (turbo), the second by hand (single arrows).
// - "volver al menú", then a reload keeps the shelf: back in free play, the
//   race card opens race 4 at tier 4 with two cups in the bar; one block,
//   then "volver al menú" (the race left).
// - Postgres: race_start x4 (again on 2 and 3), race_end finished x2 / left
//   x2 with a positive margin, the stretches with their sources (tap, drag,
//   key), the wrong block, the removed block, one turbo used and one done
//   by hand, the intro ghost demo once, the free-play visits' activity_end,
//   and the v_race_by_grade / v_race_stretches_by_tier views.
//
// PW=<dir with playwright> node tools/check-race.mjs [base]
//   base:     the app with /api (default http://127.0.0.1:8810/: the API serving a VITE_PLAYTEST=1 build)
//   PSQL:     psql against the API's database (default "docker exec -i camino-prueba-testdb psql -U postgres -tA")
//   SHOTS:    optional directory for screenshots (<name>-<width>.png)
//   VIEWPORT: e.g. 1280x800 (default 1366x768)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const base = (process.argv[2] ?? 'http://127.0.0.1:8810/').replace(/\/?$/, '/');
const PSQL = process.env.PSQL ?? 'docker exec -i camino-prueba-testdb psql -U postgres -tA';
const SHOTS = process.env.SHOTS ?? '';
const [VW, VH] = (process.env.VIEWPORT ?? '1366x768').split('x').map(Number);
const sql = (q) => execSync(PSQL, { input: q }).toString().trim();
const json = (q) => JSON.parse(sql(`select coalesce(json_agg(_r), '[]') from (${q}) _r;`) || '[]');

let failures = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failures++; return cond; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${name}-${VW}.png`) }); };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch|401|429/.test(m.text())) errors.push(m.text()); });

const state = () => p.evaluate(() => window.__race.state());
const KEY = { right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
const OTHER = { right: 'up', up: 'down', down: 'right' };
/** Waits for the race to want input on stretch `k` (1-based). */
const waitStretch = (k) => p.waitForFunction((kk) => { const s = window.__race?.state(); return s && s.phase === 'input' && s.stretch === kk; }, k, { timeout: 30_000 });
const tap = (cmd) => p.locator(`.rc-pal [data-cmd="${cmd}"]`).click();
/** A real mouse drag from a palette block onto the stretch card. */
async function drag(cmd) {
  const from = await p.locator(`.rc-pal [data-cmd="${cmd}"]`).boundingBox();
  const to = await p.locator('.rc-stretch').boundingBox();
  await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(from.x + (to.x + to.width / 2 - from.x) * (i / 8), from.y + (to.y + to.height / 2 - from.y) * (i / 8));
  await p.mouse.up();
}
let removed = 0;
/** T43: the adult corner menu (hold the top-left corner) opens La carrera for 1ro. */
async function openRaceFromAdultMenu() {
  await p.mouse.move(20, 20); await p.mouse.down(); await p.waitForTimeout(1100); await p.mouse.up();
  await p.waitForSelector('.pp-adult-sheet [data-act="open-race"]', { timeout: 5000 });
  await p.locator('.pp-adult-sheet [data-act="open-race"]').click();
}
const filledIs = (n) => p.waitForFunction((nn) => window.__race.state().filled === nn, n, { timeout: 5000 });

/**
 * Builds a whole race through the palette (and the keys, a drag, a wrong
 * block, a removal where asked). `plan(k, i, s)` returns how to place piece
 * i of stretch k: 'tap' | 'key' | 'drag' | 'repeat'.
 */
async function playRace(plan, extras = {}) {
  const first = await state();
  for (let k = 1; k <= first.stretches; k++) {
    await waitStretch(k);
    const s = await state();
    if (extras.wrongAt === k) {
      const before = s.filled;
      await tap(OTHER[s.road[0]]);
      await p.waitForSelector('.rc-slot.is-wrong', { timeout: 3000 });
      await p.waitForSelector('.rc-bush', { timeout: 3000 });
      await shot(p, 'race-wrong');
      await p.waitForSelector('.rc-slot.is-wrong', { state: 'detached', timeout: 4000 });
      ok((await state()).filled === before, `race ${s.raceNo}, stretch ${k}: a wrong block bumps a bush and pops out, nothing lost`);
    }
    for (let i = (await state()).filled; i < s.road.length;) {
      const how = plan(k, i, s);
      if (how === 'repeat') {
        await p.waitForSelector('.rc-pal [data-cmd="repeat"]', { timeout: 5000 });
        const count = Number(await p.locator('.rc-pal [data-cmd="repeat"]').getAttribute('data-count'));
        ok(count === s.road.length - i, `race ${s.raceNo}, stretch ${k}: the palette offers a real repeat whose count is the pieces left (${count})`);
        await shot(p, 'race-turbo-offer');
        await tap('repeat');
        await p.waitForSelector('.rc-me.is-turbo', { timeout: 5000 });
        await p.waitForTimeout(250);
        await shot(p, 'race-turbo');
        ok(true, `race ${s.raceNo}, stretch ${k}: the repeat fills the straight — the kart goes turbo (flames)`);
        break;
      }
      if (how === 'key') await p.keyboard.press(KEY[s.road[i]]);
      else if (how === 'drag') await drag(s.road[i]);
      else await tap(s.road[i]);
      i++;
      if (i < s.road.length) await filledIs(i);
      if (extras.removeAt === k && i === 1 && s.road.length > 1) {
        await p.locator('.rc-slot.is-filled[data-slot="0"]').click();
        await filledIs(0);
        ok(true, `race ${s.raceNo}, stretch ${k}: a tap on a filled slot takes the block out`);
        removed++;
        i = 0;
        extras.removeAt = -1;
      }
      if (extras.midShot === k && i === 1) await shot(p, 'race-mid');
    }
  }
}

try {
  // ---------------------------------------------------------------- a fresh muted 1ro session reaches free play
  await p.goto(`${base}?debug&nointro&grado=1&sonido=no#/piloto`);
  await p.waitForSelector('.piloto[data-step="character"]', { timeout: 30_000 });
  await p.locator('.choice-btn[data-choice-char="brote"]').click();
  await p.locator('.next-page').click({ force: true });
  // T43: 1ro's route goes from the character to the guided monster games
  await p.waitForSelector('.piloto[data-step="games"]', { timeout: 20_000 });
  const sid = await p.evaluate(() => window.__piloto.session()?.id);
  ok(!!sid, `session ${sid} (grade 1, muted)`);
  await p.evaluate(() => window.__piloto.jump('free_play'));
  await p.waitForSelector('.pp-fp-card', { timeout: 20_000 });
  ok((await p.locator('.pp-fp-card[data-activity="race"]').count()) === 0, 'T43: the race is not on 1ro\'s menu any more');
  await p.waitForTimeout(600);
  await shot(p, 'race-menu');
  await openRaceFromAdultMenu();
  await p.waitForSelector('.pp-race', { timeout: 20_000 });

  // ---------------------------------------------------------------- race 1, tier 1: the ghost demo, then real input
  await p.waitForSelector('.ghost-hand', { timeout: 6000 });
  ok(true, 'race 1: the first-time wordless ghost demo plays (a block carried to the first slot)');
  await p.waitForTimeout(700);
  await shot(p, 'race-ghost');
  const s1 = await state();
  ok(s1.tier === 1 && s1.raceNo === 1 && s1.stretches === 6, `race 1 is tier 1 with 6 stretches (${s1.roads.join(' ')})`);
  const t0 = Date.now();
  await playRace((k, i) => (k === 2 && i === 0 ? 'key' : k === 4 && i === 0 ? 'drag' : 'tap'), {
    wrongAt: 3, removeAt: (s1.roads.findIndex((r, j) => j > 0 && r.length > 1) + 1) || -1, midShot: 5,
  });
  await p.waitForSelector('.pp-race.is-podium', { timeout: 30_000 });
  ok(true, `race 1: crossed the line, the podium (${Math.round((Date.now() - t0) / 1000)} s of scripted play)`);
  await p.waitForSelector('.rc-shelf[data-cups="1"]', { timeout: 5000 });
  ok(true, 'race 1: a cup on the shelf');
  await p.waitForTimeout(1800);
  await shot(p, 'race-podium');

  // ---------------------------------------------------------------- "¡Otra carrera!": tier 2
  await p.locator('.rc-again').click();
  await p.waitForFunction(() => { const s = window.__race?.state(); return s && s.raceNo === 2; }, null, { timeout: 10_000 });
  const s2 = await state();
  ok(s2.tier === 2, `"¡Otra carrera!" starts race 2 at tier 2 (${s2.roads.join(' ')})`);
  await waitStretch(1);
  await p.waitForTimeout(500);
  await shot(p, 'race-tier2');

  // ---------------------------------------------------------------- race 3, tier 3: one turbo with the repeat, one by hand
  await p.evaluate(() => window.__race.tier(3));
  await p.waitForFunction(() => { const s = window.__race?.state(); return s && s.raceNo === 3; }, null, { timeout: 10_000 });
  const s3 = await state();
  ok(s3.tier === 3 && s3.roads.filter((r) => r.startsWith('T')).length === 2, `race 3 is tier 3 with two turbo straights (${s3.roads.join(' ')})`);
  const turbos = s3.roads.map((r, i) => (r.startsWith('T') ? i + 1 : 0)).filter(Boolean);
  await playRace((k) => (k === turbos[0] ? 'repeat' : 'tap'), { midShot: 2 });
  await p.waitForSelector('.pp-race.is-podium', { timeout: 30_000 });
  await p.waitForSelector('.rc-shelf[data-cups="2"]', { timeout: 5000 });
  ok(true, 'race 3: crossed the line; two cups on the shelf');

  // ---------------------------------------------------------------- back to the menu; a reload keeps the shelf; race 4 is left
  await p.waitForTimeout(1500);
  await p.locator('.pp-menu-back').click();
  await p.waitForSelector('.pp-fp-card', { timeout: 10_000 });
  await p.evaluate(() => window.__piloto.flush());
  await p.reload();
  await p.waitForSelector('.pp-fp-card', { timeout: 30_000 });
  await p.waitForTimeout(600);
  await openRaceFromAdultMenu();
  await p.waitForFunction(() => window.__race?.state().phase === 'input', null, { timeout: 15_000 });
  const s4 = await state();
  const cupsBar = await p.locator('.rc-cups').getAttribute('data-cups');
  ok(s4.raceNo === 4 && s4.tier === 4 && cupsBar === '2', `after a reload: race 4 at tier 4, the bar shows 2 cups (race ${s4.raceNo}, tier ${s4.tier}, cups ${cupsBar})`);
  await tap(s4.road[0]);
  await p.waitForTimeout(400);
  await p.locator('.pp-menu-back').click();
  await p.waitForSelector('.pp-fp-card', { timeout: 10_000 });
  ok(true, 'race 4: "volver al menú" leaves the race');
  await p.evaluate(() => window.__piloto.flush());
  await p.waitForTimeout(2500);

  // ---------------------------------------------------------------- Postgres
  const ev = (type) => json(`select seq, payload from events where session_id = '${sid}' and type = '${type}' order by seq`);
  const starts = ev('race_start');
  ok(starts.length === 4, `race_start x4 (${starts.length})`);
  ok(JSON.stringify(starts.map((e) => !!e.payload.again)) === '[false,true,true,false]', `race_start.again on races 2 and 3 only (${starts.map((e) => !!e.payload.again)})`);
  ok(JSON.stringify(starts.map((e) => e.payload.tier)) === '[1,2,3,4]', `tiers 1, 2, 3, 4 (${starts.map((e) => e.payload.tier)})`);
  const ends = ev('race_end');
  ok(JSON.stringify(ends.map((e) => e.payload.reason)) === '["finished","left","finished","left"]', `race_end: finished, left, finished, left (${ends.map((e) => e.payload.reason)})`);
  const fin = ends.filter((e) => e.payload.reason === 'finished');
  ok(fin.every((e) => e.payload.margin_ms > 0), `the child crossed first: margin_ms ${fin.map((e) => e.payload.margin_ms)}`);
  ok(removed === 1, 'race 1 had a stretch of two pieces to take a block out of');
  ok(fin[0]?.payload.wrong_total === 1 && fin[0]?.payload.removed === removed, `race 1: one wrong block, ${removed} removed (${fin[0]?.payload.wrong_total}, ${fin[0]?.payload.removed})`);
  ok(fin[1]?.payload.turbo_offered === 2 && fin[1]?.payload.turbo_used === 1, `race 3: two turbos offered, one used (${fin[1]?.payload.turbo_offered}, ${fin[1]?.payload.turbo_used})`);
  ok(fin.map((e) => e.payload.cups).join() === '1,2', `cups after each win: ${fin.map((e) => e.payload.cups)}`);
  const stretches = ev('race_stretch');
  const r1 = stretches.filter((e) => e.payload.race_no === 1);
  ok(r1.length === 6 && r1.every((e) => e.payload.completed), `race 1: six race_stretch rows, all completed (${r1.length})`);
  const src = r1.reduce((a, e) => ({ tap: a.tap + e.payload.sources.tap, drag: a.drag + e.payload.sources.drag, key: a.key + e.payload.sources.key }), { tap: 0, drag: 0, key: 0 });
  ok(src.key >= 1 && src.drag >= 1 && src.tap >= 1, `race 1: blocks by tap ${src.tap}, drag ${src.drag}, key ${src.key}`);
  ok(r1[2]?.payload.wrong_blocks === 1, `race 1 stretch 3 logs its wrong block (${r1[2]?.payload.wrong_blocks})`);
  const r3t = stretches.filter((e) => e.payload.race_no === 3 && e.payload.turbo_offered);
  ok(r3t.length === 2 && r3t[0].payload.used_repeat === true && r3t[1].payload.used_repeat === false, `race 3: the first turbo with the repeat, the second by hand (${r3t.map((e) => e.payload.used_repeat)})`);
  ok(r3t[0] && r3t[0].payload.blocks_placed === 1, `race 3: the turbo straight took one block (${r3t[0]?.payload.blocks_placed})`);
  const r4 = stretches.filter((e) => e.payload.race_no === 4);
  ok(r4.length === 1 && r4[0].payload.completed === false, `race 4: its open stretch logged as not completed (${r4.length})`);
  const ghosts = json(`select payload from events where session_id = '${sid}' and type = 'ghost_demo' and payload->>'level_id' = 'race'`);
  ok(ghosts.length === 1 && ghosts[0].payload.kind === 'intro', `the race's intro ghost demo logged once (${ghosts.length})`);
  const visits = json(`select payload from events where session_id = '${sid}' and type = 'activity_end' and payload->>'activity' = 'race'`);
  // every race won counts as a won level of the visit, also when "¡Otra carrera!" came before the podium's moment ended (race 1)
  ok(visits.length === 2 && visits[0].payload.wins === 2 && visits[0].payload.reason === 'menu' && visits[1].payload.wins === 0,
    `activity_end per race visit: the first with its 2 wins, the second (race 4, left) with none (${visits.map((v) => `${v.payload.wins}/${v.payload.reason}`)})`);
  const view = json('select * from v_race_by_grade where grade = 1');
  ok(view.length === 1 && Number(view[0].races_started) >= 4 && Number(view[0].turbo_used) >= 1, `v_race_by_grade has grade 1 (${JSON.stringify(view[0] ?? {})})`);
  const tiers = json('select tier, stretches_done from v_race_stretches_by_tier where grade = 1 order by tier');
  ok(tiers.some((t) => Number(t.tier) === 3), `v_race_stretches_by_tier has tier 3 (${JSON.stringify(tiers)})`);
} catch (e) {
  failures++;
  console.log(`FAIL ${e.message}`);
  await shot(p, 'race-error').catch(() => {});
}
ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
await browser.close();
console.log(failures ? `${failures} FAILED` : 'all checks passed');
process.exit(failures ? 1 : 0);
