// Scripted check of the 5to probe "Del bloque al texto" (T8), through the
// real UI, then its rows in Postgres. Two sessions:
//
// 5to — free play, the text probe's card: the tour (a tap on a text line
//   rings its block, ▶ runs it with the line lit); predict_loop right,
//   predict_if wrong; the number item typed with the real keyboard
//   (Backspace, 4: the blocks' repeat shows 4; a backtick typed in the
//   editor does not open the dev drawer, then erased), run to the seed;
//   typo_name run first (the friendly error on line 3), fixed by typing the
//   missing letter (the note goes), run to the seed; typo_colon the same
//   with the missing ":"; blocks_loop right, blocks_until wrong; the stretch
//   item written (saltar() on the empty line) and run to the seed; "¿Te
//   gustó escribir el programa?" yes; the cheer; back to the menu.
// 3ro — the adult's corner menu opens the probe (any grade); after the
//   tour, the typo_colon stamp; ✋ three times: the ghost writes the fix;
//   ▶ reaches the seed (solved, not the child's: ghost_fixed); back to the
//   menu (the probe left).
//
// Then: text_item, text_run, probe_phase, probe_end, the liking answer,
// activity_end and choice rows; v_probe_text and v_probe_text_by_grade
// agree with them.
//
// PW=<dir with playwright> node tools/check-texto.mjs [base]
//   base: the app with /api (vite dev on 8811 proxying to the API), default http://127.0.0.1:8811/
//   PSQL: the command that runs psql against the API's database, default
//         "docker exec -i camino-prueba-t8db psql -U postgres -tA"
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const [base = 'http://127.0.0.1:8811/'] = process.argv.slice(2);
const PSQL = process.env.PSQL ?? 'docker exec -i camino-prueba-t8db psql -U postgres -tA';
const sql = (q) => execSync(PSQL, { input: q }).toString().trim();
const json = (q) => JSON.parse(sql(`select coalesce(json_agg(_r), '[]') from (${q}) _r;`));

let failures = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failures++; };

async function newSession(p, grade) {
  await p.goto(`${base}?debug#/piloto`);
  await p.waitForSelector('.pp-setup');
  // round 2: one tap on the grade starts (no consent tick, no code screen)
  await p.getByRole('button', { name: grade, exact: true }).click();
  await p.waitForSelector('.choice-row');
  const sid = await p.evaluate(() => window.__piloto.session().id);
  await p.waitForTimeout(500);
  await p.locator('[data-choice-char="mina"]').click();
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
const item = (p) => p.locator('.tx-root').getAttribute('data-item');
async function waitItem(p, id) { await p.waitForSelector(`.tx-root[data-item="${id}"]`, { timeout: 20_000 }); await p.waitForTimeout(700); }
async function next(p) { await p.locator('.tx-next').waitFor({ timeout: 30_000 }); await p.locator('.tx-next').click({ force: true }); }
/** ▶ and the run's end (the button enabled again). */
async function run(p) {
  await p.click('.tx-root .btn-play');
  await p.waitForTimeout(300);
  await p.waitForFunction(() => !document.querySelector('.tx-root[data-busy="true"]'), null, { timeout: 30_000 });
  await p.waitForTimeout(400);
}
const textNow = (p) => p.locator('.tx-input').inputValue();

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
async function page() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|Failed to fetch/.test(m.text())) errors.push(m.text()); });
  return { ctx, p };
}

// ================================================================== 5to: every item kind through the real UI
console.log('--- 5to');
const five = await page();
let p = five.p;
const s5 = await newSession(p, '5to');
const menu = await p.locator('.pp-fp-card').evaluateAll((els) => els.map((e) => e.dataset.activity));
ok(menu.join() === 'rule_game,editor,recess,text_probe', `5to menu: ${menu.join()}`);
await p.locator('.pp-fp-card[data-activity="text_probe"]').click();
await p.waitForSelector('.tx-root[data-item="tour"]');
await p.waitForTimeout(900);

// the tour: a tap on line 3 rings its block; ▶ lights the lines as it runs
const l3 = await p.locator('.tx-code .tx-line[data-line="3"]').boundingBox();
await p.mouse.click(l3.x + 30, l3.y + l3.height / 2);
await p.waitForTimeout(300);
ok(await p.locator('.tx-blocks [data-ref="1:0"] .ring').count() === 1, 'tour: a tap on line 3 rings its block (the arrow inside the repeat)');
ok(await p.locator('.tx-band.is-link').count() === 1, 'tour: the line is lit with its block');
await p.click('.tx-root .btn-play');
let litSeen = new Set();
for (let i = 0; i < 40; i++) {
  const l = await p.evaluate(() => document.querySelector('.tx-gutter li.is-lit')?.textContent);
  if (l) litSeen.add(l);
  if (await p.locator('.tx-next').count()) break;
  await p.waitForTimeout(150);
}
ok(['1', '3', '4'].every((l) => litSeen.has(l)), `tour: the run lit lines ${[...litSeen].sort().join(',')}`);
await next(p);

// predict_loop: the right drawing; the run plays; next → predict_if
await waitItem(p, 'predict_loop');
await p.click('[data-answer="end_2_0"]');
await next(p);
await waitItem(p, 'predict_if');
await p.click('[data-answer="bump_1"]');
await next(p);

// number: the caret is on the for line after the 2; the real keyboard
await waitItem(p, 'number');
await p.keyboard.press('Backspace');
await p.keyboard.type('4');
await p.waitForTimeout(300);
ok((await textNow(p)).split('\n')[1] === 'for i in range(4):', 'number: Backspace and 4 typed at the caret');
ok((await p.locator('.tx-blocks .blk-count b').first().textContent()) === '4', 'number: the blocks follow the text (the repeat shows 4)');
await p.keyboard.type('`');
await p.waitForTimeout(300);
ok((await p.locator('.dev-tab.is-on, .dev-drawer').count()) === 0 && (await textNow(p)).split('\n')[1] === 'for i in range(4`):', 'number: a backtick typed in the editor goes into the text; dev mode stays off');
await p.keyboard.press('Backspace');
ok((await p.locator('.tx-input').getAttribute('spellcheck')) === 'false' && (await p.locator('.tx-input').getAttribute('autocorrect')) === 'off' && (await p.locator('.tx-input').getAttribute('autocapitalize')) === 'none', 'the editor: no spellcheck, autocorrect or autocapitalize');
await run(p);
ok(await p.locator('.tx-next').count() === 1, 'number: range(4) reaches the seed');
await next(p);

// typo_name: ▶ first: the friendly error on line 3; the missing letter typed; the note goes; the seed
await waitItem(p, 'typo_name');
await p.click('.tx-root .btn-play');
await p.waitForSelector('.tx-note[data-error="unknown_name"]');
const note = await p.locator('.tx-note p').textContent();
ok(/línea 3/.test(note) && /derecha/.test(note), `typo_name: the note says "${note}"`);
ok(await p.locator('.tx-gutter li.is-error').textContent() === '3', 'typo_name: line 3 is marked');
await p.locator('.tx-input').focus();
// the caret starts at the start of line 3: after the d, an e
await p.evaluate(() => { const t = document.querySelector('.tx-input'); const o = t.value.indexOf('drecha') + 1; t.setSelectionRange(o, o); });
await p.keyboard.type('e');
await p.waitForTimeout(300);
ok(await p.locator('.tx-note').count() === 0, 'typo_name: the note goes once the text is right');
await run(p);
ok(await p.locator('.tx-next').count() === 1, 'typo_name: fixed, it reaches the seed');
await next(p);

// typo_colon: the error, then ":" at the end of line 1 (End key)
await waitItem(p, 'typo_colon');
await p.click('.tx-root .btn-play');
await p.waitForSelector('.tx-note[data-error="missing_colon"]');
await p.locator('.tx-input').focus();
await p.evaluate(() => { const t = document.querySelector('.tx-input'); t.setSelectionRange(0, 0); });
await p.keyboard.press('End');
await p.keyboard.type(':');
await run(p);
ok(await p.locator('.tx-next').count() === 1, 'typo_colon: ":" typed at the end of line 1, it reaches the seed');
await next(p);

// blocks → text
await waitItem(p, 'blocks_loop');
await p.click('[data-answer="same"]');
await next(p);
await waitItem(p, 'blocks_until');
await p.click('[data-answer="inside_if"]');
await next(p);

// the stretch: one line typed on the empty line (Enter keeps the indentation elsewhere; here just the line)
await waitItem(p, 'write_if');
await p.click('.tx-root .btn-play');
await p.waitForSelector('.tx-note[data-error="empty_block"]');
await p.locator('.tx-input').focus();
await p.evaluate(() => { const t = document.querySelector('.tx-input'); const o = t.value.indexOf('\n        \n') + 9; t.setSelectionRange(o, o); });
await p.keyboard.type('saltar()');
await run(p);
ok(await p.locator('.tx-next').count() === 1, 'write_if: saltar() written inside the if reaches the seed');
ok((await p.locator('.tx-stamp.is-done').count()) === 7, 'every stamp but the one on screen ticked');
await next(p);

// liking, cheer, menu
await p.waitForSelector('.tx-liked');
await p.click('.tx-liked [data-answer="yes"]');
await p.waitForSelector('.pp-cheer');
await p.click('.pp-cheer-next');
await p.waitForSelector('.pp-menu');
await drain(p);
await five.ctx.close();

// ================================================================== 3ro: the adult opens it; ✋ writes the fix
console.log('--- 3ro');
const three = await page();
p = three.p;
const s3 = await newSession(p, '3ro');
await p.mouse.move(12, 12); await p.mouse.down(); await p.waitForTimeout(1700); await p.mouse.up();
await p.locator('[data-act="open-text-probe"]').click();
await p.waitForSelector('.tx-root[data-item="tour"]');
ok(true, 'the adult\'s corner menu opened "Del bloque al texto" for 3ro');
await p.click('.tx-root .btn-play');
await next(p);
await waitItem(p, 'predict_loop');
await p.locator('.tx-stamp[data-item="typo_colon"]').click();
await waitItem(p, 'typo_colon');
for (let i = 0; i < 3; i++) {
  await p.click('.tx-root .level-bar .help');
  await p.waitForTimeout(300);
  await p.waitForFunction(() => !document.querySelector('.tx-root.is-demo'), null, { timeout: 30_000 });
  await p.waitForTimeout(400);
}
ok((await textNow(p)).startsWith('for i in range(2):'), '✋ 3: the ghost wrote the fix');
await run(p);
ok(await p.locator('.tx-next').count() === 1, 'the ghost\'s fix reaches the seed');
await p.locator('.pp-menu-back').click();
await p.waitForSelector('.pp-menu');
await drain(p);
await three.ctx.close();

ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();

// ================================================================== the database
console.log('--- database');
const rows = (sid, type) => json(`select payload p from events where session_id = '${sid}' and type = '${type}' order by seq`).map((x) => x.p);
const seqs = sql(`select seq from events where session_id = '${s5}' order by seq;`).split('\n').map(Number);
ok(seqs.every((x, i) => x === i), `5to: ${seqs.length} events, seq 0..${seqs.length - 1} with no gaps`);

const items = rows(s5, 'text_item');
const sig = items.map((x) => `${x.item}:${x.kind}:${x.reason}:${x.correct}`);
const want = [
  'predict_loop:predict:answered:true', 'predict_if:predict:answered:false', 'number:number:solved:true', 'typo_name:typo:solved:true',
  'typo_colon:typo:solved:true', 'blocks_loop:blocks_to_text:answered:true', 'blocks_until:blocks_to_text:answered:false', 'write_if:write:solved:true',
];
ok(JSON.stringify(sig) === JSON.stringify(want), `text_item rows in order${JSON.stringify(sig) === JSON.stringify(want) ? '' : `: ${sig.join(' | ')}`}`);
const byId = Object.fromEntries(items.map((x) => [x.item, x]));
ok(byId.predict_loop?.answer === 'end_2_0' && byId.predict_loop.position === 1 && byId.predict_if?.answer === 'bump_1', 'predict answers and positions');
ok(byId.number?.text === 'derecha()\nfor i in range(4):\n    arriba()\nderecha()' && byId.number.attempts === 1, `number: the text as typed (${JSON.stringify(byId.number?.text)})`);
ok(byId.typo_name?.errors.join() === 'unknown_name' && byId.typo_name.attempts === 2 && byId.typo_colon?.errors.join() === 'missing_colon', `typo items: errors ${byId.typo_name?.errors} / ${byId.typo_colon?.errors}, attempts ${byId.typo_name?.attempts}`);
ok(byId.write_if?.text.includes('        saltar()') && byId.write_if.errors.join() === 'empty_block', 'write_if: the line written, the empty_block error first');
ok(items.every((x) => x.time_ms > 0 && typeof x.help_levels === 'number' && x.adult_helped === false), 'text_item: time, help levels, adult help');
const tr = rows(s5, 'text_run');
const err = tr.filter((x) => !x.ok);
ok(err.map((x) => `${x.item}:${x.error_kind}:${x.line}`).join() === 'typo_name:unknown_name:3,typo_colon:missing_colon:1,write_if:empty_block:2', `text_run errors: ${err.map((x) => `${x.item}:${x.error_kind}:${x.line}`).join()}`);
ok(tr.filter((x) => x.ok && x.item !== 'tour').every((x) => x.result === 'win') && tr.some((x) => x.item === 'tour' && x.result === 'win'), 'text_run: every parsed run reached the seed (the tour too)');
const phases = rows(s5, 'probe_phase');
ok(phases.map((x) => `${x.probe}:${x.phase}:${x.completed}`).join() === 'text:intro:true,text:items:true', `probe_phase: ${phases.map((x) => `${x.phase}:${x.completed}`).join()}`);
ok(phases[0]?.links >= 1, `probe_phase intro: links ${phases[0]?.links}`);
const liked = rows(s5, 'survey_answer').filter((x) => x.question === 'text_probe_liked');
ok(liked.length === 1 && liked[0].answer === 'yes', 'survey_answer text_probe_liked: yes');
const pend = rows(s5, 'probe_end');
ok(pend.length === 1 && pend[0].probe === 'text' && pend[0].reason === 'done' && pend[0].items_correct === 6, `probe_end: ${JSON.stringify(pend[0])}`);
const aend = rows(s5, 'activity_end').filter((x) => x.activity === 'text_probe');
ok(aend.length === 1 && aend[0].reason === 'done' && aend[0].wins === 1, `activity_end text_probe: reason ${aend[0]?.reason}, levels ${aend[0]?.levels}, wins ${aend[0]?.wins}`);

const v = json(`select * from v_probe_text where session_id = '${s5}'`)[0];
ok(v && v.tour_done && v.items_tried === 8 && v.items_correct === 6 && v.items_solo === 6, `view: tried ${v?.items_tried}, correct ${v?.items_correct}, solo ${v?.items_solo}`);
ok(v && v.predict_correct === 1 && v.number_correct === 1 && v.typo_correct === 2 && v.blocks_correct === 1 && v.write_correct === 1, 'view: correct by kind');
ok(v && v.parse_errors === 3 && v.error_kinds === 'empty_block,missing_colon,unknown_name' && v.runs === 7 && v.runs_won === 4, `view: runs ${v?.runs}, won ${v?.runs_won}, parse errors ${v?.parse_errors} (${v?.error_kinds})`);
ok(v && v.liked === 'yes' && v.end_reason === 'done' && v.answers.includes('predict_if:bump_1'), `view: liked ${v?.liked}, ${v?.end_reason}`);

const choice3 = rows(s3, 'choice').filter((x) => x.activity === 'text_probe');
ok(choice3.length === 1 && choice3[0].by === 'adult', 'the adult\'s pick: choice {activity: text_probe, by: adult}');
const it3 = rows(s3, 'text_item');
ok(it3.length === 1 && it3[0].item === 'typo_colon' && it3[0].ghost_fixed === true && it3[0].correct === false && it3[0].help_levels === 3, `3ro: the ghost's fix is not the child's (${JSON.stringify(it3[0])})`);
ok(rows(s3, 'help').filter((x) => x.level_id === 'text_probe').map((x) => x.step).join() === '1,2,3' && rows(s3, 'ghost_demo').some((x) => x.kind === 'fix'), 'help steps 1,2,3 and a ghost_demo kind fix');
ok(rows(s3, 'probe_end')[0]?.reason === 'left', 'the probe left from the menu button: probe_end left');
const v3 = json(`select * from v_probe_text where session_id = '${s3}'`)[0];
ok(v3 && v3.items_correct === 0 && v3.items_ghost_fixed === 1 && v3.end_reason === 'left', `view (3ro): correct ${v3?.items_correct}, ghost fixed ${v3?.items_ghost_fixed}, ${v3?.end_reason}`);
const byGrade = json('select grade, sessions::int, items_correct::int, typo_correct::int, typo_tried::int from v_probe_text_by_grade where grade in (3, 5) order by grade');
ok(byGrade.length === 2 && byGrade[1].items_correct >= 6 && byGrade[0].typo_tried >= 1, `by grade: ${JSON.stringify(byGrade)}`);

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
