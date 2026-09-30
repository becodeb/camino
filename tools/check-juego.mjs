// Scripted check of the 4to probe "Hacé tu juego" (T7), through the real UI,
// then its rows in Postgres. Two sessions:
//
// 4to — free play, the game maker's card: phase 1, the ready game played
//   with the arrows until it ends (won or lost), the page turned; phase 2,
//   the seed's number tapped (worth 2), a game played, stopped; phase 3, the
//   bird added (its tab), "cuando recibo ¡ñam!" dragged into the notebook
//   (a real drag), "decir" tapped into it and its chip tapped to ¡Pío!, the
//   seed's catch rule made active and "avisar ¡ñam!" tapped into it, the
//   game's win condition changed (5 → 10), a game played until a seed is
//   caught and the bird answers, stopped; the three Scratch predictions (right,
//   wrong, right); "¿Te gustó?" yes; back to the menu.
// 5to — the adult's corner menu opens the probe (any grade); phase 3; ✋
//   three times: the ghost hand builds the broadcast rules (ghost edits, not
//   the child's); back to the menu.
//
// Then: probe_phase, rule_edit, game_run, scratch_predict, the liking
// answer, probe_end, activity_end and choice rows; v_probe_game_maker and
// v_probe_game_maker_by_grade agree with them.
//
// PW=<dir with playwright> node tools/check-juego.mjs [base]
//   base: the app with /api (vite dev on 8811 proxying to the API), default http://127.0.0.1:8811/
//   PSQL: the command that runs psql against the API's database, default
//         "docker exec -i camino-prueba-t7db psql -U postgres -tA"
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const [base = 'http://127.0.0.1:8811/'] = process.argv.slice(2);
const PSQL = process.env.PSQL ?? 'docker exec -i camino-prueba-t7db psql -U postgres -tA';
const sql = (q) => execSync(PSQL, { input: q }).toString().trim();
const json = (q) => JSON.parse(sql(`select coalesce(json_agg(_r), '[]') from (${q}) _r;`));

let failures = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failures++; };

async function newSession(p, grade) {
  await p.goto(`${base}?debug#/piloto`);
  await p.waitForSelector('.pp-setup');
  await p.getByRole('button', { name: grade, exact: true }).click();
  await p.getByRole('checkbox').click();
  await p.getByRole('button', { name: 'Empezar' }).click();
  const sid = await p.evaluate(() => window.__piloto.session().id);
  await p.getByRole('button', { name: 'Empezar' }).click();
  await p.waitForSelector('.choice-row');
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
/** Presses the arrow towards the seed, `n` times or until `until()` holds. */
async function chase(p, n, until = async () => false) {
  for (let i = 0; i < n; i++) {
    if (await until()) return true;
    const d = await p.evaluate(() => { const s = window.__gmw.state(); const me = s.sprites.me, seed = s.sprites.seed; return seed.c > me.c ? 'Right' : seed.c < me.c ? 'Left' : null; });
    if (d) await p.keyboard.press(`Arrow${d}`);
    await p.waitForTimeout(220);
  }
  return until();
}
const center = async (p, sel) => { const b = await p.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
async function page() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|Failed to fetch/.test(m.text())) errors.push(m.text()); });
  return { ctx, p };
}

// ================================================================== 4to: the three phases, the predictions, the liking
console.log('--- 4to');
const four = await page();
let p = four.p;
const s4 = await newSession(p, '4to');
const menu = await p.locator('.pp-fp-card').evaluateAll((els) => els.map((e) => e.dataset.activity));
ok(menu.join(',') === 'rule_game,editor,recess,game_maker', `4to menu: ${menu.join(',')}`);
await p.locator('.pp-fp-card[data-activity="game_maker"]').click();
await p.waitForSelector('.gm-root[data-phase="play"]');
ok(await p.locator('.gm-palette .gm-blk:not([disabled])').count() === 0, 'phase 1: the rules cannot be edited yet');
ok(await p.locator('.gm-card').count() === 3 && await p.locator('.gm-tr').count() === 3, 'the character\'s three rule cards, each with its Scratch script beside it');
ok((await p.locator('.gm-tr').first().innerText()).includes('al presionar tecla'), 'La Traductora: "al presionar tecla flecha izquierda"');

// phase 1: play the ready game until it ends
await p.click('.gm-root .btn-play');
const ended = await chase(p, 400, async () => (await p.locator('.gm-end').count()) > 0);
const end1 = await p.locator('.gm-end').getAttribute('data-end').catch(() => null);
ok(ended && (end1 === 'win' || end1 === 'lose'), `the ready game ended: ${end1}`);
ok(await p.locator('.gm-again').isVisible(), 'the end card says "¡Otra vez!"');
await p.locator('.gm-next').click({ timeout: 10_000, force: true });
await p.waitForSelector('.gm-root[data-phase="change"]');
ok(true, 'phase 1 → 2 (the page turned after the game ended)');

// phase 2: the seed worth 2, played again
await p.waitForTimeout(600);
ok(await p.locator('.gm-tab.is-on[data-obj="seed"]').count() === 1, 'phase 2 opens on the seed\'s rules');
await p.click('[data-chip="seed:1:0"]');
await p.waitForTimeout(300);
ok((await p.locator('.gm-row').nth(1).locator('.gm-tr').innerText()).replace(/\s+/g, ' ').includes('sumar 2 a'), 'the Scratch script follows the chip: "sumar 2 a puntos"');
await p.click('.gm-root .btn-play');
await chase(p, 12);
await p.click('.gm-root .btn-play');
await p.locator('.gm-next').click({ timeout: 10_000, force: true });
await p.waitForSelector('.gm-root[data-phase="make"]');
ok(true, 'phase 2 → 3 after an edit and a game');

// phase 3: the bird, avisar and cuando recibo, the win condition
await p.waitForTimeout(600);
await p.click('.gm-tab[data-obj="add-bird"]');
await p.waitForSelector('.gm-tab.is-on[data-obj="bird"]');
ok(await p.locator('.gm-sprite[data-sprite="bird"]').count() === 1, 'the bird is on the board');
{ // a real drag: the "cuando recibo" hat into the notebook
  const [fx, fy] = await center(p, '.gm-palette [data-block="recv:yum"]');
  const nb = await p.locator('.gm-notebook').boundingBox();
  await p.mouse.move(fx, fy); await p.mouse.down(); await p.mouse.move(fx + 30, fy + 8, { steps: 4 });
  await p.mouse.move(nb.x + nb.width / 2, nb.y + 220, { steps: 12 }); await p.mouse.up();
  await p.waitForTimeout(400);
}
ok(await p.locator('.gm-card[data-card="bird:0"]').count() === 1, 'dragged: the bird has a "cuando recibo ¡ñam!" card');
await p.click('.gm-palette [data-block="say:mia"]');
await p.waitForTimeout(250);
for (let i = 0; i < 2; i++) { await p.click('[data-chip="bird:0:0"]'); await p.waitForTimeout(250); }
ok((await p.locator('.gm-card[data-card="bird:0"]').innerText()).includes('¡Pío!'), 'tapped in "decir", its chip tapped to ¡Pío!');
await p.click('.gm-tab[data-obj="seed"]');
await p.waitForTimeout(250);
await p.locator('.gm-card[data-card="seed:1"] .gm-hat').click({ position: { x: 30, y: 30 } });
await p.waitForTimeout(250);
await p.click('.gm-palette [data-block="send:yum"]');
await p.waitForTimeout(300);
ok((await p.locator('.gm-card[data-card="seed:1"]').innerText()).includes('avisar'), 'the seed\'s catch rule now says "avisar ¡ñam!"');
ok((await p.locator('.gm-row').nth(1).locator('.gm-tr').innerText()).includes('enviar'), 'La Traductora: "enviar ¡ñam!"');
await p.click('.gm-tab[data-obj="game"]');
await p.waitForTimeout(250);
await p.click('[data-chip="game:0:h"]');
await p.waitForTimeout(250);
ok((await p.locator('.gm-card[data-card="game:0"]').innerText()).includes('10'), 'the win condition: 5 → 10 points');
await p.click('.gm-tab[data-obj="bird"]');
await p.click('.gm-root .btn-play');
const heard = await chase(p, 300, async () => (await p.evaluate(() => window.__gmw.state().heard)) > 0);
ok(heard, 'a seed caught: the seed "avisa" and the bird hears it');
await p.waitForTimeout(150);
await p.click('.gm-root .btn-play');
await p.locator('.gm-next').click({ timeout: 10_000, force: true });

// the predictions and the liking question
await p.waitForSelector('.gm-predict[data-item="key"]');
ok((await p.locator('.gm-predict .sb-script').innerText()).includes('al presionar tecla'), 'prediction 1 shows a Scratch script');
await p.click('[data-answer="right"]');
await p.waitForSelector('.gm-predict[data-item="star"]');
ok((await p.locator('.gm-predict-say').innerText()).includes('Ovillo'), 'the question names the child\'s character');
await p.click('[data-answer="star_says"]');
await p.waitForSelector('.gm-predict[data-item="broadcast"]');
await p.click('[data-answer="bird_says"]');
await p.waitForSelector('[data-question="game_maker_liked"]');
await p.click('[data-answer="yes"]');
await p.waitForSelector('[data-interlude="cheer"]');
await p.waitForSelector('.pp-menu', { timeout: 20_000 });
ok(true, 'the cheer, then back to the menu');
await drain(p);
await four.ctx.close();

// ================================================================== 5to: the adult opens it; ✋ builds a rule
console.log('--- 5to');
const five = await page();
p = five.p;
const s5 = await newSession(p, '5to');
ok(!(await p.locator('.pp-fp-card').evaluateAll((els) => els.map((e) => e.dataset.activity))).includes('game_maker'), '5to menu has no game maker card');
await p.mouse.move(12, 12); await p.mouse.down(); await p.waitForTimeout(1700); await p.mouse.up();
await p.locator('[data-act="open-game-maker"]').click();
await p.waitForSelector('.gm-root[data-phase="play"]');
ok(true, 'the adult\'s corner menu opened "Hacé tu juego" for 5to');
await p.evaluate(() => window.__gm.go('make'));
await p.waitForSelector('.gm-root[data-phase="make"]');
await p.waitForTimeout(800);
for (let i = 0; i < 3; i++) {
  await p.click('.gm-root .level-bar .help');
  await p.waitForTimeout(300);
  await p.waitForFunction(() => !document.querySelector('.gm-root.is-demo'), null, { timeout: 30_000 });
  await p.waitForTimeout(400);
}
const g5 = await p.evaluate(() => window.__gm.game());
ok(g5.some((o) => o.id === 'bird' && o.rules.some((r) => r.hat === 'recv:yum' && r.actions.includes('say:pio'))), '✋ 3: the ghost hand built "cuando recibo ¡ñam! → decir ¡Pío!" on the bird');
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

const phases = rows(s4, 'probe_phase');
ok(phases.map((x) => `${x.phase}:${x.completed}`).join(',') === 'play:true,change:true,make:true', `probe_phase: ${phases.map((x) => `${x.phase}:${x.completed}`).join(',')}`);
const edits = rows(s4, 'rule_edit');
const sig = edits.map((e) => `${e.phase}/${e.op}/${e.object}/${e.hat ?? '-'}/${e.action ?? '-'}`);
const want = [
  'change/change/seed/touch:me/score:2',
  'make/add/bird/-/-',
  'make/add/bird/recv:yum/-',
  'make/add/bird/recv:yum/say:mia',
  'make/change/bird/recv:yum/say:ay',
  'make/change/bird/recv:yum/say:pio',
  'make/add/seed/touch:me/send:yum',
  'make/change/game/points:10/-',
];
ok(JSON.stringify(sig) === JSON.stringify(want), `rule_edit rows in order${JSON.stringify(sig) === JSON.stringify(want) ? '' : `: ${sig.join(' | ')}`}`);
ok(edits.every((e) => e.probe === 'game_maker' && !e.ghost && typeof e.rules === 'number'), 'rule_edit: probe, no ghost, the rule count');
const runs = rows(s4, 'game_run');
ok(runs.length >= 3 && runs[0].phase === 'play' && ['win', 'lose'].includes(runs[0].result) && runs[0].keys > 0, `game_run 1: phase play, ${runs[0]?.result}, ${runs[0]?.keys} keys`);
const mk = runs.find((r) => r.phase === 'make');
ok(mk && mk.result === 'stopped' && mk.broadcasts.join() === 'yum' && mk.messages_heard >= 1 && mk.win_points === 10 && mk.lose_lives === true, `game_run of phase 3: broadcasts ${mk?.broadcasts}, heard ${mk?.messages_heard}, win at ${mk?.win_points}`);
ok(mk && mk.rules.includes('bird[recv:yum>say:pio]') && mk.rules.includes('send:yum') && mk.objects.includes('bird'), 'game_run.rules: the compact snapshot has the bird and avisar');
const preds = rows(s4, 'scratch_predict');
ok(preds.map((x) => `${x.item}:${x.answer}:${x.correct}`).join(',') === 'key:right:true,star:star_says:false,broadcast:bird_says:true', `scratch_predict: ${preds.map((x) => `${x.item}:${x.correct}`).join(',')}`);
ok(preds.every((x) => x.time_ms > 0 && x.position >= 0), 'scratch_predict: time and position');
const liked = rows(s4, 'survey_answer').filter((x) => x.question === 'game_maker_liked');
ok(liked.length === 1 && liked[0].answer === 'yes', 'survey_answer game_maker_liked: yes');
const pend = rows(s4, 'probe_end');
ok(pend.length === 1 && pend[0].reason === 'done', `probe_end: ${pend.map((x) => x.reason)}`);
const aend = rows(s4, 'activity_end').filter((x) => x.activity === 'game_maker');
ok(aend.length === 1 && aend[0].reason === 'done' && aend[0].levels === 1 && aend[0].wins === 1, `activity_end game_maker: reason ${aend[0]?.reason}, levels ${aend[0]?.levels}, wins ${aend[0]?.wins}`);

const v = json(`select * from v_probe_game_maker where session_id = '${s4}'`)[0];
ok(v && v.phases_completed === 3 && v.play_done && v.change_done && v.make_done, 'view: three phases completed');
ok(v && v.rule_edits === 8 && v.adds === 4 && v.changes === 4 && v.removes === 0 && v.make_edits === 7, `view: edits ${v?.rule_edits} (adds ${v?.adds}, changes ${v?.changes})`);
ok(v && v.bird_added && v.broadcast_edits === 2 && v.win_condition_edits === 1, `view: bird ${v?.bird_added}, broadcast edits ${v?.broadcast_edits}, win condition edits ${v?.win_condition_edits}`);
ok(v && v.games_run === runs.length && v.games_with_broadcast >= 1 && v.messages_heard >= 1 && v.make_game_can_win, `view: games ${v?.games_run}, with broadcast ${v?.games_with_broadcast}, heard ${v?.messages_heard}`);
ok(v && v.predictions === 3 && v.predictions_correct === 2 && v.liked === 'yes' && v.end_reason === 'done', `view: predictions ${v?.predictions_correct}/${v?.predictions}, liked ${v?.liked}`);

const choice5 = rows(s5, 'choice').filter((x) => x.activity === 'game_maker');
ok(choice5.length === 1 && choice5[0].by === 'adult', 'the adult\'s pick: choice {activity: game_maker, by: adult}');
const ghost = rows(s5, 'rule_edit');
ok(ghost.length >= 4 && ghost.every((e) => e.ghost === true), `✋ 3's edits are marked ghost (${ghost.length})`);
const gd = rows(s5, 'ghost_demo').filter((x) => x.level_id === 'game_maker');
ok(gd.some((x) => x.kind === 'rule') && rows(s5, 'help').filter((x) => x.level_id === 'game_maker').map((x) => x.step).join() === '1,2,3', 'help steps 1,2,3 and a ghost_demo kind rule');
const v5 = json(`select * from v_probe_game_maker where session_id = '${s5}'`)[0];
ok(v5 && v5.rule_edits === 0 && v5.end_reason === 'left', `view (5to): the ghost's edits are not the child's (rule_edits ${v5?.rule_edits}), left`);
const byGrade = json('select grade, sessions::int, make_done::int from v_probe_game_maker_by_grade where grade in (4, 5) order by grade');
ok(byGrade.length === 2 && byGrade[0].make_done >= 1, `by grade: ${JSON.stringify(byGrade)}`);

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
