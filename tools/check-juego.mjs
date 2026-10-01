// Scripted check of the 4to probe "Hacé tu juego" built step by step (T15),
// through the real UI, then its rows in Postgres. Two sessions:
//
// 4to — free play, the game maker's card (with `?caps=fast`: "seguir" after
//   8 s, the free step's arrow after 4 s):
//   1 move: no Scratch anywhere, four blocks in the palette, an empty
//     notebook, the character alone; an arrow with no rule (the character
//     stays); "cuando aprieto →" dragged into the notebook and "mover →"
//     dragged onto its card (real mouse drags), ← built by taps; → and ← on
//     the keyboard → done, the arrow;
//   2 stone: "siempre" dragged, "mover ↓" tapped, ▶: the stone falls and
//     stays down (the spoken hint), "cuando toco el suelo" + "volver arriba"
//     tapped → done;
//   3 seed_read: no blocks, the board plays by itself, the seed's tab tapped
//     → its two cards → done;
//   4 touch_rules: the points and lives appear; ✋ once (help step 1); the
//     two rules by taps; played (the arrows) until a life is lost and a point
//     won → done;
//   5 win: nothing done; "seguir" shows in the bar after the wait, tapped:
//     the rule is left built (ghost, filled), the page turns;
//   6 free: the bird added, "cuando recibo ¡ñam!" + "decir" (chip to ¡Pío!),
//     "avisar ¡ñam!" on the character's seed card, played until the bird
//     hears it; the arrow; "¿Te gustó?" yes; back to the menu.
// 5to — the adult's corner menu opens the probe (any grade); step 1: ✋ three
//   times, the ghost builds the step's rules (ghost edits); the arrows → done
//   with help; back to the menu.
//
// Then: probe_phase per step, rule_edit (own, ghost, filled), game_run, the
// liking answer, probe_end, activity_end and choice rows, no scratch_predict;
// v_probe_game_maker and v_probe_game_maker_by_grade agree with them.
//
// PW=<dir with playwright> node tools/check-juego.mjs [base]
//   base: the app with /api (vite dev on 8811 proxying to the API), default http://127.0.0.1:8811/
//   PSQL: the command that runs psql against the API's database, default
//         "docker exec -i camino-prueba-t15db psql -U postgres -d dev -tA"
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const [base = 'http://127.0.0.1:8811/'] = process.argv.slice(2);
const PSQL = process.env.PSQL ?? 'docker exec -i camino-prueba-t15db psql -U postgres -d dev -tA';
const sql = (q) => execSync(PSQL, { input: q }).toString().trim();
const json = (q) => JSON.parse(sql(`select coalesce(json_agg(_r), '[]') from (${q}) _r;`));

let failures = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failures++; };

async function newSession(p, grade) {
  await p.goto(`${base}?debug&caps=fast#/piloto`);
  await p.waitForSelector('.pp-setup');
  await p.getByRole('button', { name: grade, exact: true }).click();
  await p.waitForSelector('.choice-row');
  const sid = await p.evaluate(() => window.__piloto.session().id);
  await p.waitForTimeout(500);
  await p.locator('[data-choice-char="ovillo"]').click();
  await p.waitForTimeout(500);
  await p.evaluate(() => window.__piloto.jump('free_play'));
  await p.waitForSelector('.pp-menu');
  await p.waitForTimeout(800);
  return sid;
}
async function drain(p) {
  let st;
  for (let i = 0; i < 60; i++) {
    await p.evaluate(() => window.__piloto.flush());
    st = await p.evaluate(() => window.__piloto.status());
    if (st.pending === 0 && st.dirty === 0) break;
    await p.waitForTimeout(1000);
  }
  ok(st.pending === 0 && st.dirty === 0, `queue drained (pending ${st.pending})`);
}
const center = async (p, sel) => { const b = await p.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
/** A real mouse drag from one element to another (past the 8 px threshold, in steps). */
async function drag(p, from, to, dy = 0) {
  const [fx, fy] = await center(p, from);
  const [tx, ty] = await center(p, to);
  await p.mouse.move(fx, fy); await p.mouse.down(); await p.mouse.move(fx + 20, fy + 6, { steps: 4 });
  await p.mouse.move(tx, ty + dy, { steps: 14 }); await p.mouse.up();
  await p.waitForTimeout(350);
}
const tap = async (p, block) => { await p.click(`.gm-palette [data-block="${block}"]`); await p.waitForTimeout(250); };
const phase = (p, step) => p.waitForSelector(`.gm-root[data-phase="${step}"]`, { timeout: 20_000 });
const next = async (p) => { await p.locator('.gm-next').click({ force: true, timeout: 10_000 }); };
const flags = (p) => p.evaluate(() => window.__gmw.flags());
/** Presses the arrows towards `target(state, flags)` (a sprite id) until `until()`; at most `n` times. */
async function chase(p, n, target, until) {
  for (let i = 0; i < n; i++) {
    if (await until()) return true;
    const d = await p.evaluate((t) => {
      const s = window.__gmw.state(); const f = window.__gmw.flags(); const me = s.sprites.me;
      const sp = s.sprites[t === 'auto' ? (f.lostLife ? 'seed' : 'stone') : t];
      return !sp ? null : sp.c > me.c ? 'Right' : sp.c < me.c ? 'Left' : null;
    }, target);
    if (d) await p.keyboard.press(`Arrow${d}`);
    await p.waitForTimeout(200);
  }
  return until();
}

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
async function page() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|Failed to fetch/.test(m.text())) errors.push(m.text()); });
  return { ctx, p };
}

// ================================================================== 4to: the six steps, the liking
console.log('--- 4to');
const four = await page();
let p = four.p;
const s4 = await newSession(p, '4to');
const menu = await p.locator('.pp-fp-card').evaluateAll((els) => els.map((e) => e.dataset.activity));
ok(menu.join(',') === 'rule_game,editor,recess,game_maker', `4to menu: ${menu.join(',')}`);
await p.locator('.pp-fp-card[data-activity="game_maker"]').click();

// 1 move
await phase(p, 'move');
await p.waitForTimeout(600);
ok(!/scratch|traductora/i.test(await p.locator('.gm-root').innerText()) && await p.locator('.sb-script, .gm-tr').count() === 0, 'no Scratch column, no Scratch words');
ok(await p.locator('.gm-palette .gm-blk').count() === 4, 'step 1: four blocks in the palette');
ok(await p.locator('.gm-card').count() === 0 && await p.locator('.gm-tab').count() === 1, 'step 1: an empty notebook, the character\'s tab alone');
ok(await p.locator('.gm-sprite').count() === 1 && await p.locator('.gm-lives').count() === 0, 'step 1: the character alone on the board, no points or lives yet');
ok((await p.locator('.gm-goal').innerText()).includes('Ovillo'), 'the step\'s goal on the note names the character');
const c0 = await p.evaluate(() => window.__gmw.state().sprites.me.c);
await p.keyboard.press('ArrowRight');
await p.waitForTimeout(500);
ok(await p.evaluate(() => window.__gmw.state().sprites.me.c) === c0, 'an arrow with no rule: the character stays');
await drag(p, '.gm-palette [data-block="key:right"]', '.gm-notebook .gm-sheet');
ok(await p.locator('.gm-card[data-card="me:0"]').count() === 1, 'dragged: a "cuando aprieto →" card');
await drag(p, '.gm-palette [data-block="move:right"]', '.gm-card[data-card="me:0"]');
ok((await p.evaluate(() => window.__gm.game()))[0].rules[0].actions.join() === 'move:right', 'dragged: "mover →" into its card');
await tap(p, 'key:left');
await tap(p, 'move:left');
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(400);
await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(500);
await p.waitForSelector('.gm-root.is-done', { timeout: 5000 });
ok(await p.locator('.gm-goal.is-done').count() === 1 && await p.locator('.gm-next').count() === 1, 'step 1 done: the note stamped, the arrow');
await next(p);

// 2 stone
await phase(p, 'stone');
await p.waitForTimeout(500);
ok(await p.locator('.gm-tab.is-on[data-obj="stone"]').count() === 1 && await p.locator('.gm-sprite[data-sprite="stone"]').count() === 1, 'step 2 opens on the stone, now on the board');
await drag(p, '.gm-palette [data-block="tick"]', '.gm-notebook .gm-sheet');
await tap(p, 'move:down');
await p.click('.gm-root .btn-play');
await p.waitForFunction(() => window.__gmw.flags().stoneStuck, null, { timeout: 20_000 });
await p.waitForTimeout(400);
ok((await p.locator('.level-bar').innerText()).includes('se queda abajo'), 'the stone stays down: "Hacé que vuelva arriba…" (captioned)');
await tap(p, 'touch:ground');
await tap(p, 'top');
await p.waitForSelector('.gm-root.is-done', { timeout: 20_000 });
ok(true, 'step 2 done: the stone fell and came back');
await next(p);

// 3 seed_read
await phase(p, 'seed_read');
await p.waitForTimeout(1500);
ok(await p.locator('.gm-palette .gm-blk').count() === 0, 'step 3: no blocks (a page to read)');
ok(await p.locator('.gm-sheet-board.is-playing').count() === 1, 'step 3: the board plays by itself (the seed falls)');
await p.locator('.gm-tab[data-obj="seed"]').click({ force: true });
await p.waitForSelector('.gm-root.is-done');
ok(await p.locator('.gm-card').count() === 2 && await p.locator('.gm-card .gm-chip:not(.is-still)').count() === 0, 'the seed\'s two cards, read only');
await next(p);

// 4 touch_rules
await phase(p, 'touch_rules');
await p.waitForTimeout(500);
ok(await p.locator('.gm-lives').count() === 1, 'step 4: points and lives appear');
await p.click('.gm-root .level-bar .help');
await p.waitForTimeout(400);
for (const b of ['touch:stone', 'lives:-1', 'touch:seed', 'score:1']) await tap(p, b);
await p.click('.gm-root .btn-play');
const both = await chase(p, 500, 'auto', async () => p.evaluate(() => window.__gmw.done()));
ok(both, 'step 4 done: a life lost and a point won while playing');
await next(p);

// 5 win: skipped after the wait
await phase(p, 'win');
ok(await p.locator('.gm-tab.is-on[data-obj="game"]').count() === 1 && (await p.locator('.gm-card').innerText()).includes('perdés'), 'step 5 opens on the game\'s card (losing already there)');
await p.waitForSelector('.gm-skip', { timeout: 15_000 });
ok(true, '"seguir" shows in the bar after the wait');
await p.locator('.gm-skip').click();
await phase(p, 'free');
const g5 = await p.evaluate(() => window.__gm.game());
ok(g5.find((o) => o.id === 'game').rules.some((r) => r.hat === 'points:5' && r.actions.includes('win')), 'the skipped step\'s rule was left built');

// 6 free
await p.waitForTimeout(600);
await p.click('.gm-tab[data-obj="add-bird"]');
await p.waitForSelector('.gm-tab.is-on[data-obj="bird"]');
await tap(p, 'recv:yum');
await tap(p, 'say:mia');
for (let i = 0; i < 2; i++) { await p.click('[data-chip="bird:0:0"]'); await p.waitForTimeout(250); }
ok((await p.locator('.gm-card[data-card="bird:0"]').innerText()).includes('¡Pío!'), 'the bird: "cuando recibo ¡ñam!" → "decir ¡Pío!"');
await p.click('.gm-tab[data-obj="me"]');
await p.waitForTimeout(300);
const seedCard = await p.evaluate(() => window.__gm.game()[0].rules.findIndex((r) => r.hat === 'touch:seed'));
await p.locator(`.gm-card[data-card="me:${seedCard}"] .gm-hat`).click({ position: { x: 30, y: 30 } });
await p.waitForTimeout(250);
await tap(p, 'send:yum');
ok((await p.locator(`.gm-card[data-card="me:${seedCard}"]`).innerText()).includes('avisar'), 'the character\'s seed card now also "avisa ¡ñam!"');
await p.click('.gm-root .btn-play');
const heard = await chase(p, 300, 'seed', async () => (await p.evaluate(() => window.__gmw.state().heard)) > 0);
ok(heard, 'a seed caught: the bird hears ¡ñam!');
await p.click('.gm-root .btn-play');
await next(p);
await p.waitForSelector('[data-question="game_maker_liked"]');
await p.click('[data-answer="yes"]');
await p.waitForSelector('[data-interlude="cheer"]');
await p.waitForSelector('.pp-menu', { timeout: 20_000 });
ok(true, 'the liking question, the cheer, back to the menu');
await drain(p);
await four.ctx.close();

// ================================================================== 5to: the adult opens it; ✋ builds the step
console.log('--- 5to');
const five = await page();
p = five.p;
const s5 = await newSession(p, '5to');
ok(!(await p.locator('.pp-fp-card').evaluateAll((els) => els.map((e) => e.dataset.activity))).includes('game_maker'), '5to menu has no game maker card');
await p.mouse.move(12, 12); await p.mouse.down(); await p.waitForTimeout(1700); await p.mouse.up();
await p.locator('[data-act="open-game-maker"]').click();
await phase(p, 'move');
ok(true, 'the adult\'s corner menu opened "Hacé tu juego" for 5to');
await p.waitForTimeout(800);
for (let i = 0; i < 3; i++) {
  await p.click('.gm-root .level-bar .help');
  await p.waitForTimeout(300);
  await p.waitForFunction(() => !document.querySelector('.gm-root.is-demo'), null, { timeout: 30_000 });
  await p.waitForTimeout(400);
}
const g1 = await p.evaluate(() => window.__gm.game());
ok(g1[0].rules.map((r) => `${r.hat}>${r.actions}`).join(' ') === 'key:right>move:right key:left>move:left', '✋ 3: the ghost built the step\'s two rules');
await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(400);
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500);
await p.waitForSelector('.gm-root.is-done', { timeout: 5000 });
await next(p);
await phase(p, 'stone');
await p.locator('.pp-menu-back').click();
await p.waitForSelector('.pp-menu');
await drain(p);
await five.ctx.close();

ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();

// ================================================================== the database
console.log('--- database');
const rows = (sid, type) => json(`select payload p from events where session_id = '${sid}' and type = '${type}' order by seq`).map((x) => x.p);
const seqs = sql(`select seq from events where session_id = '${s4}' order by seq;`).split('\n').map(Number);
ok(seqs.every((x, i) => x === i), `4to: ${seqs.length} events, seq 0..${seqs.length - 1} with no gaps`);

const steps = rows(s4, 'probe_phase');
const sig = steps.map((x) => `${x.phase}:${x.completed ? (x.help_levels || x.ghost_built ? 'help' : 'alone') : x.skipped ? 'skipped' : 'ended'}`).join(',');
ok(sig === 'move:alone,stone:alone,seed_read:alone,touch_rules:help,win:skipped,free:ended', `probe_phase: ${sig}`);
ok(steps.every((x) => x.probe === 'game_maker' && x.time_ms > 0 && typeof x.runs === 'number' && typeof x.edits === 'number'), 'probe_phase: time, runs, edits');
const touch = steps.find((x) => x.phase === 'touch_rules');
ok(touch?.help_levels === 1 && touch.ghost_built === false, `touch_rules: help_levels ${touch?.help_levels}, nothing built by the ghost`);
const free = steps.find((x) => x.phase === 'free');
ok(free?.adds >= 3 && free.cards_added >= 1 && free.used_send === true, `free: adds ${free?.adds}, cards ${free?.cards_added}, avisar ${free?.used_send}`);
const edits = rows(s4, 'rule_edit');
const own = edits.filter((e) => !e.ghost).map((e) => `${e.phase}/${e.op}/${e.object}/${e.hat ?? '-'}/${e.action ?? '-'}`);
const want = [
  'move/add/me/key:right/-', 'move/add/me/key:right/move:right', 'move/add/me/key:left/-', 'move/add/me/key:left/move:left',
  'stone/add/stone/tick/-', 'stone/add/stone/tick/move:down', 'stone/add/stone/touch:ground/-', 'stone/add/stone/touch:ground/top',
  'touch_rules/add/me/touch:stone/-', 'touch_rules/add/me/touch:stone/lives:-1', 'touch_rules/add/me/touch:seed/-', 'touch_rules/add/me/touch:seed/score:1',
  'free/add/bird/-/-', 'free/add/bird/recv:yum/-', 'free/add/bird/recv:yum/say:mia', 'free/change/bird/recv:yum/say:ay', 'free/change/bird/recv:yum/say:pio',
  'free/add/me/touch:seed/send:yum',
];
ok(JSON.stringify(own) === JSON.stringify(want), `the child's rule_edit rows in order${JSON.stringify(own) === JSON.stringify(want) ? '' : `: ${own.join(' | ')}`}`);
const filled = edits.filter((e) => e.ghost);
ok(filled.length === 2 && filled.every((e) => e.filled && e.phase === 'win'), `the skipped step's rules: ${filled.map((e) => `${e.hat}/${e.action ?? '-'}`).join(', ')} (ghost, filled)`);
const runs = rows(s4, 'game_run');
ok(['move', 'stone', 'seed_read', 'touch_rules', 'free'].every((ph) => runs.some((r) => r.phase === ph)), `game_run in every step that played (${[...new Set(runs.map((r) => r.phase))].join(',')})`);
ok(runs.some((r) => r.phase === 'free' && r.messages_heard >= 1 && r.broadcasts.join() === 'yum' && r.rules.includes('bird[recv:yum>say:pio]')), 'the free game: the message sent and heard, the bird in the rules');
ok(rows(s4, 'help').filter((x) => x.level_id === 'game_maker').map((x) => `${x.phase}:${x.step}`).join() === 'touch_rules:1', 'help: one press on step 4');
ok(rows(s4, 'scratch_predict').length === 0, 'no scratch_predict rows');
const liked = rows(s4, 'survey_answer').filter((x) => x.question === 'game_maker_liked');
ok(liked.length === 1 && liked[0].answer === 'yes', 'survey_answer game_maker_liked: yes');
const pend = rows(s4, 'probe_end');
ok(pend.length === 1 && pend[0].reason === 'done' && pend[0].steps_completed === 4, `probe_end: ${pend.map((x) => `${x.reason}, ${x.steps_completed} steps`)}`);
const aend = rows(s4, 'activity_end').filter((x) => x.activity === 'game_maker');
ok(aend.length === 1 && aend[0].reason === 'done' && aend[0].levels === 1 && aend[0].wins === 0, `activity_end game_maker: reason ${aend[0]?.reason}, levels ${aend[0]?.levels}, wins ${aend[0]?.wins} (a step skipped)`);

const v = json(`select * from v_probe_game_maker where session_id = '${s4}'`)[0];
ok(v && v.steps_reached === 5 && v.steps_alone === 3 && v.steps_with_help === 1 && v.steps_skipped === 1, `view: ${v?.steps_alone} alone, ${v?.steps_with_help} with help, ${v?.steps_skipped} skipped`);
ok(v && [v.move_result, v.stone_result, v.seed_read_result, v.touch_rules_result, v.win_result].join() === 'alone,alone,alone,help,skipped', 'view: each step\'s result');
ok(v && ['move', 'stone', 'seed_read', 'touch_rules', 'win', 'free'].every((s) => Number(v[`${s}_seconds`]) * 1000 === steps.find((x) => x.phase === s).time_ms), 'view: seconds per step = probe_phase.time_ms');
ok(v && v.free_reached && v.free_rules_added === 1 && v.used_avisar && v.bird_added, `view: free rules added ${v?.free_rules_added}, avisar ${v?.used_avisar}, bird ${v?.bird_added}`);
ok(v && v.rule_edits === own.length && v.games_run === runs.length && v.liked === 'yes' && v.end_reason === 'done', `view: edits ${v?.rule_edits}, games ${v?.games_run}, liked ${v?.liked}`);

const choice5 = rows(s5, 'choice').filter((x) => x.activity === 'game_maker');
ok(choice5.length === 1 && choice5[0].by === 'adult', 'the adult\'s pick: choice {activity: game_maker, by: adult}');
const ghost = rows(s5, 'rule_edit');
ok(ghost.length === 4 && ghost.every((e) => e.ghost === true && !e.filled), `✋ 3's edits are marked ghost (${ghost.length})`);
const st5 = rows(s5, 'probe_phase');
ok(st5.length === 1 && st5[0].phase === 'move' && st5[0].completed && st5[0].help_levels === 3 && st5[0].ghost_built, 'step 1 with help: completed, help 3, ghost built');
ok(rows(s5, 'help').map((x) => x.step).join() === '1,2,3' && rows(s5, 'ghost_demo').some((x) => x.kind === 'rule'), 'help steps 1,2,3 and a ghost_demo kind rule');
const v5 = json(`select * from v_probe_game_maker where session_id = '${s5}'`)[0];
ok(v5 && v5.move_result === 'help' && v5.rule_edits === 0 && v5.steps_with_help === 1 && v5.end_reason === 'left', `view (5to): move ${v5?.move_result}, own edits ${v5?.rule_edits}, ${v5?.end_reason}`);
const byGrade = json('select grade, sessions::int, move_alone::int, move_help::int, win_skipped::int, used_avisar::int, liked_yes::int from v_probe_game_maker_by_grade where grade in (4, 5) order by grade');
ok(byGrade.length === 2 && byGrade[0].move_alone >= 1 && byGrade[0].win_skipped >= 1 && byGrade[0].used_avisar >= 1 && byGrade[1].move_help >= 1, `by grade: ${JSON.stringify(byGrade)}`);

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
