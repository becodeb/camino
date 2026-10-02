// Scripted check of the 5to probe "Del bloque al texto" as rebuilt in T16
// (six steps, one idea each, blocks first), through the real UI and the
// real keyboard, then its rows in Postgres. Two sessions (`?caps=fast`:
// "seguir" after 6 s instead of 90 s):
//
// 5to — free play, the probe's card:
//   move   the teaching screen (a tap on the line rings its block; ▶ lights
//          it); the pick: "abajo()" first (it dims and shows its arrow),
//          then "arriba()";
//   seq    the teaching run lights lines 1, 2, 3; the word task starts with
//          the marked word selected: "arriba" typed replaces it, the mark
//          goes, the blocks follow; ▶ reaches the seed at the first try;
//   repeat the teaching run; the number task: "4" typed over the marked
//          number, the note says "repetí 4 veces", the repeat block shows 4;
//          ✋ once; ▶ reaches the seed;
//   typo   ▶ first: the friendly note on line 2 ("¿Será «derecha»?"); the
//          missing "e" typed; the note goes; ▶ reaches the seed;
//   if     the teaching run; the predict task left alone until "seguir"
//          shows in the bar, then skipped;
//   write  the stretch: "arriba()" typed on the empty line; ▶ reaches the seed;
//   then "¿Te gustó escribir el programa?" yes, the cheer, the menu.
// 3ro — the adult's corner menu opens the probe (any grade); on the
//   teaching screen ✋ three times: the ghost runs it; on the pick ✋ three
//   times: the ghost picks; then back to the menu (the probe left).
//
// Then: text_item, text_run, probe_phase, probe_end, the liking answer,
// activity_end and choice rows; v_probe_text and v_probe_text_by_grade
// agree with them.
//
// PW=<dir with playwright> node tools/check-texto.mjs [base]
//   base: the app with /api (vite dev on 8811 proxying to the API), default http://127.0.0.1:8811/
//   PSQL: the command that runs psql against the API's database, default
//         "docker exec -i camino-prueba-t16db psql -U postgres -d dev -tA"
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const [base = 'http://127.0.0.1:8811/'] = process.argv.slice(2);
const PSQL = process.env.PSQL ?? 'docker exec -i camino-prueba-t16db psql -U postgres -d dev -tA';
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
const at = async (p, phase, screen) => { await p.waitForSelector(`.tx-root[data-phase="${phase}"][data-screen="${screen}"]`, { timeout: 30_000 }); await p.waitForTimeout(700); };
const busyOff = (p) => p.waitForFunction(() => !document.querySelector('.tx-root[data-busy="true"]'), null, { timeout: 30_000 });
const next = async (p) => { await p.locator('.tx-next').waitFor({ timeout: 30_000 }); await p.locator('.tx-next').click({ force: true }); };
/** ▶ and the run's end (the button enabled again). */
async function run(p) {
  await p.click('.tx-root .btn-play', { force: true });
  await p.waitForTimeout(300);
  await busyOff(p);
  await p.waitForTimeout(400);
}
/** The lines lit while a run plays. */
async function litWhileRunning(p) {
  await p.click('.tx-root .btn-play', { force: true });
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const l = await p.evaluate(() => document.querySelector('.tx-gutter li.is-lit')?.textContent);
    if (l) seen.add(l);
    if (i > 3 && !(await p.locator('.tx-root[data-busy="true"]').count())) break;
    await p.waitForTimeout(120);
  }
  await busyOff(p);
  return [...seen].sort();
}
const textNow = (p) => p.locator('.tx-input').inputValue();
const done = (p) => p.locator('.tx-root.is-done').count().then((n) => n === 1);
async function helpOnce(p) {
  await p.click('.tx-root .level-bar .help');
  await p.waitForTimeout(300);
  await p.waitForFunction(() => !document.querySelector('.tx-root.is-demo'), null, { timeout: 30_000 });
  await p.waitForTimeout(400);
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

// ================================================================== 5to: every step through the real UI
console.log('--- 5to');
const five = await page();
let p = five.p;
const s5 = await newSession(p, '5to');
const menu = await p.locator('.pp-fp-card').evaluateAll((els) => els.map((e) => e.dataset.activity));
ok(menu.join() === 'rule_game,editor,recess,text_probe', `5to menu: ${menu.join()}`);
await p.locator('.pp-fp-card[data-activity="text_probe"]').click();

// 1 move: a move block is a line
await at(p, 'move', 'teach');
ok(await p.locator('.pp-progress').count() === 1 && (await p.locator('.tx-blocks [data-ref="0"]').count()) === 1, 'move: the step path in the bar, the block beside its text');
ok((await p.locator('.tx-gloss').textContent()).includes('la flecha'), 'move: the blue pen note says what the line is');
const l1 = await p.locator('.tx-code .tx-line[data-line="1"]').boundingBox();
await p.mouse.click(l1.x + 30, l1.y + l1.height / 2);
await p.waitForTimeout(300);
ok(await p.locator('.tx-blocks [data-ref="0"] .ring').count() === 1, 'move: a tap on the line rings its block');
ok((await litWhileRunning(p)).join() === '1', 'move: ▶ lights line 1 while it runs');
await next(p);
await at(p, 'move', 'task');
ok(await p.locator('.tx-pick-card').count() === 2, 'move pick: two lines to choose from');
await p.click('[data-answer="abajo"]');
await p.waitForTimeout(400);
ok(await p.locator('[data-answer="abajo"].is-other .tx-pick-means').count() === 1 && !(await done(p)), 'move pick: "abajo()" dims and shows its own arrow; not done');
await p.click('[data-answer="arriba"]');
await p.waitForTimeout(400);
ok(await done(p) && (await p.locator('.pp-progress-art').count()) === 1, 'move pick: "arriba()" is the arrow: done');
await next(p);

// 2 seq: several lines, top to bottom; change one word
await at(p, 'seq', 'teach');
const lit2 = await litWhileRunning(p);
ok(lit2.join() === '1,2,3', `seq: the run lights lines ${lit2.join()}`);
await next(p);
await at(p, 'seq', 'task');
const sel = await p.evaluate(() => { const t = document.querySelector('.tx-input'); return t.value.slice(t.selectionStart, t.selectionEnd); });
ok(sel === 'derecha' && (await p.locator('.tx-mark').count()) === 1 && (await p.locator('.tx-keys kbd').count()) === 6, `seq word: the marked word is selected ("${sel}"), the hint spells a-r-r-i-b-a`);
await p.keyboard.type('arriba');
await p.waitForTimeout(300);
ok((await textNow(p)) === 'derecha()\nderecha()\narriba()' && (await p.locator('.tx-mark').count()) === 0, 'seq word: "arriba" typed replaces the word; the mark goes');
ok(await p.locator('.tx-blocks:not(.is-dim) [data-ref="2"]').count() === 1, 'seq word: the blocks follow the text');
await run(p);
ok(await done(p), 'seq word: it reaches the seed');
await next(p);

// 3 repeat: repetir is for; change the number
await at(p, 'repeat', 'teach');
ok((await p.locator('.tx-gloss').allTextContents()).join('|') === 'repetí 3 veces|lo corrido se repite', 'repeat: the notes say what the for means');
ok((await litWhileRunning(p)).join() === '2', 'repeat: the indented line lights on each pass');
await next(p);
await at(p, 'repeat', 'task');
await p.keyboard.type('4');
await p.waitForTimeout(300);
ok((await textNow(p)).startsWith('for i in range(4):') && (await p.locator('.tx-gloss').textContent()) === 'repetí 4 veces', 'repeat number: "4" typed over the marked 2; the note says "repetí 4 veces"');
ok((await p.locator('.tx-blocks .blk-count b').first().textContent()) === '4', 'repeat number: the repeat block shows 4');
await helpOnce(p);
await run(p);
ok(await done(p), 'repeat number: range(4) reaches the seed');
await next(p);

// 4 typo: one slip, a friendly note
await at(p, 'typo', 'task');
await p.click('.tx-root .btn-play', { force: true });
await p.waitForSelector('.tx-note[data-error="unknown_name"]');
const note = await p.locator('.tx-note p').textContent();
ok(/línea 2/.test(note) && /¿Será «derecha»\?/.test(note) && !/incorrect|difícil/i.test(note), `typo: the note says "${note}"`);
ok(await p.locator('.tx-gutter li.is-error').textContent() === '2', 'typo: line 2 is marked');
await p.locator('.tx-input').focus();
await p.evaluate(() => { const t = document.querySelector('.tx-input'); const o = t.value.indexOf('drecha') + 1; t.setSelectionRange(o, o); });
await p.keyboard.type('e');
await p.waitForTimeout(300);
ok(await p.locator('.tx-note').count() === 0, 'typo: the note goes once the word is right');
await run(p);
ok(await done(p), 'typo: fixed, it reaches the seed');
await next(p);

// 5 if: si is if; the predict skipped with "seguir"
await at(p, 'if', 'teach');
await run(p);
await next(p);
await at(p, 'if', 'task');
ok(await p.locator('.tx-option').count() === 3 && (await p.locator('.tx-blocks').count()) === 0, 'if predict: three drawings; the blocks hidden (reading the text)');
await p.locator('.pp-go-on.tx-skip').waitFor({ timeout: 20_000 });
ok(true, 'if predict: "seguir" shows in the bar after the wait (fast caps)');
await p.locator('.pp-go-on.tx-skip').click({ force: true });

// 6 write: the stretch
await at(p, 'write', 'task');
ok(await p.locator('.tx-bank-row').count() === 4 && (await p.locator('.tx-stretch').count()) === 1, 'write: the word bank (four moves, block and text) and "si querés"');
await p.keyboard.type('arriba()');
await run(p);
ok(await done(p), 'write: the line written reaches the seed');
ok((await p.locator('.pp-progress-art').count()) === 1, 'the step path is still in the bar');
await next(p);

await p.waitForSelector('.tx-liked');
await p.click('.tx-liked [data-answer="yes"]');
await p.waitForSelector('.pp-cheer');
await p.click('.pp-cheer-next');
await p.waitForSelector('.pp-menu');
await drain(p);
await five.ctx.close();

// ================================================================== 3ro: the adult opens it; ✋ ×3 twice
console.log('--- 3ro');
const three = await page();
p = three.p;
const s3 = await newSession(p, '3ro');
await p.mouse.move(12, 12); await p.mouse.down(); await p.waitForTimeout(1700); await p.mouse.up();
await p.locator('[data-act="open-text-probe"]').click();
await at(p, 'move', 'teach');
ok(true, 'the adult\'s corner menu opened "Del bloque al texto" for 3ro');
for (let i = 0; i < 3; i++) await helpOnce(p);
await p.waitForTimeout(2500);
ok(await done(p), '✋ 3 on the teaching screen: the ghost ran it');
await next(p);
await at(p, 'move', 'task');
for (let i = 0; i < 3; i++) await helpOnce(p);
await p.waitForTimeout(500);
ok(await done(p) && (await p.locator('[data-answer="arriba"].is-right').count()) === 1, '✋ 3 on the pick: the ghost picked "arriba()"');
await next(p);
await at(p, 'seq', 'teach');
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
const sig = items.map((x) => `${x.item}:${x.step}:${x.reason}:${x.correct}:${x.first_try}`);
const want = [
  'move_pick:move:answered:true:false', 'seq_word:seq:solved:true:true', 'repeat_number:repeat:solved:true:true', 'typo_fix:typo:solved:true:false',
  'if_predict:if:skipped:false:false', 'write_line:write:solved:true:true',
];
ok(JSON.stringify(sig) === JSON.stringify(want), `text_item rows in order${JSON.stringify(sig) === JSON.stringify(want) ? '' : `: ${sig.join(' | ')}`}`);
const byId = Object.fromEntries(items.map((x) => [x.item, x]));
ok(byId.move_pick?.answer === 'abajo' && byId.move_pick.attempts === 2 && byId.move_pick.position === 0, 'move_pick: first tap "abajo" (position 0), two attempts');
ok(byId.seq_word?.text === 'derecha()\nderecha()\narriba()' && byId.repeat_number?.text === 'for i in range(4):\n    derecha()', 'the texts as typed');
ok(byId.repeat_number?.help_levels === 1 && byId.repeat_number.ghost === false, 'repeat_number: one ✋, no ghost');
ok(byId.typo_fix?.errors.join() === 'unknown_name' && byId.typo_fix.attempts === 2, `typo_fix: errors ${byId.typo_fix?.errors}, attempts ${byId.typo_fix?.attempts}`);
ok(byId.write_line?.text === 'derecha()\nderecha()\narriba()', 'write_line: the line written');
ok(items.every((x) => x.time_ms > 0 && typeof x.help_levels === 'number' && x.adult_helped === false && x.kind), 'text_item: kind, time, help levels, adult help');
const tr = rows(s5, 'text_run');
ok(tr.filter((x) => !x.ok).map((x) => `${x.item}:${x.error_kind}:${x.line}`).join() === 'typo_fix:unknown_name:2', 'text_run: the one parse error (typo_fix line 2)');
ok(['move_teach', 'seq_teach', 'repeat_teach', 'if_teach'].every((t) => tr.some((x) => x.item === t && x.result === 'win')), 'text_run: each teaching screen ran to the seed');
const phases = rows(s5, 'probe_phase');
const ps = phases.map((x) => `${x.phase}:${x.completed}:${x.help_levels}:${x.ghost}`);
ok(ps.join() === 'move:true:0:false,seq:true:0:false,repeat:true:1:false,typo:true:0:false,if:false:0:false,write:true:0:false', `probe_phase per step: ${ps.join()}`);
ok(phases[0]?.links >= 1 && phases[0]?.teach_runs === 1 && phases.find((x) => x.phase === 'if')?.skipped === true, 'probe_phase: links, teach runs, the skip');
const liked = rows(s5, 'survey_answer').filter((x) => x.question === 'text_probe_liked');
ok(liked.length === 1 && liked[0].answer === 'yes', 'survey_answer text_probe_liked: yes');
const pend = rows(s5, 'probe_end');
ok(pend.length === 1 && pend[0].probe === 'text' && pend[0].reason === 'done' && pend[0].steps_completed === 5 && pend[0].steps_alone === 4, `probe_end: ${JSON.stringify(pend[0])}`);
const aend = rows(s5, 'activity_end').filter((x) => x.activity === 'text_probe');
ok(aend.length === 1 && aend[0].reason === 'done' && aend[0].wins === 0, `activity_end text_probe: reason ${aend[0]?.reason}, wins ${aend[0]?.wins} (a core step skipped: not a win)`);

const v = json(`select * from v_probe_text where session_id = '${s5}'`)[0];
ok(v && v.steps_reached === 5 && v.steps_alone === 3 && v.steps_with_help === 1 && v.steps_skipped === 1, `view: reached ${v?.steps_reached}, alone ${v?.steps_alone}, help ${v?.steps_with_help}, skipped ${v?.steps_skipped}`);
ok(v && [v.move_result, v.seq_result, v.repeat_result, v.typo_result, v.if_result, v.write_result].join() === 'alone,alone,help,alone,skipped,alone', 'view: each idea alone / with help / skipped');
ok(v && [v.move_first_try, v.seq_first_try, v.repeat_first_try, v.typo_first_try].join() === 'false,true,true,false' && v.move_answer === 'abajo', 'view: first tries');
ok(v && v.parse_errors === 1 && v.error_kinds === 'unknown_name' && v.teach_runs === 4 && v.liked === 'yes' && v.end_reason === 'done', `view: errors ${v?.parse_errors} (${v?.error_kinds}), teach runs ${v?.teach_runs}, ${v?.liked}, ${v?.end_reason}`);

const choice3 = rows(s3, 'choice').filter((x) => x.activity === 'text_probe');
ok(choice3.length === 1 && choice3[0].by === 'adult', 'the adult\'s pick: choice {activity: text_probe, by: adult}');
const it3 = rows(s3, 'text_item');
ok(it3.length === 1 && it3[0].item === 'move_pick' && it3[0].ghost === true && it3[0].correct === false && it3[0].help_levels === 3, `3ro: the ghost's pick is not the child's (${JSON.stringify(it3[0])})`);
const ph3 = rows(s3, 'probe_phase');
ok(ph3.length === 1 && ph3[0].phase === 'move' && ph3[0].ghost === true && ph3[0].help_levels === 3, '3ro: the move step done with help (ghost)');
ok(rows(s3, 'help').filter((x) => x.level_id === 'text_probe').map((x) => `${x.phase}:${x.step}`).join() === 'move_teach:1,move_teach:2,move_teach:3,move:1,move:2,move:3', 'help steps per screen');
ok(rows(s3, 'ghost_demo').map((x) => x.kind).join() === 'hint,run,hint,answer', `ghost_demo kinds: ${rows(s3, 'ghost_demo').map((x) => x.kind).join()}`);
ok(rows(s3, 'probe_end')[0]?.reason === 'left', 'the probe left from the menu button: probe_end left');
const v3 = json(`select * from v_probe_text where session_id = '${s3}'`)[0];
ok(v3 && v3.move_result === 'help' && v3.steps_alone === 0 && v3.end_reason === 'left', `view (3ro): move ${v3?.move_result}, ${v3?.end_reason}`);
const byGrade = json('select grade, sessions::int, move_alone::int, move_help::int, if_skipped::int, seq_first_try::int from v_probe_text_by_grade where grade in (3, 5) order by grade');
ok(byGrade.length === 2 && byGrade[0].move_help >= 1 && byGrade[1].move_alone >= 1 && byGrade[1].if_skipped >= 1 && byGrade[1].seq_first_try >= 1, `by grade: ${JSON.stringify(byGrade)}`);

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
