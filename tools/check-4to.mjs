// T39's scripted check: a whole 4to session through the real UI, on a local
// stack, and its rows in Postgres.
//
// - Device K (`?grado=4`): T38's name screen (a typed name), the character,
//   the short tool check played gesture by gesture, then the long ladder from
//   rung 7 with the climbing path beside the page and word-picture labels:
//   7, 8, 9 passed with the solution hook; 10's first item failed (two
//   failed runs) and its second item passed; 11 (the arrows game) and 12
//   (the seeds game) won by keys; 13 (predict an event script, on the
//   Workshop's blocks) answered by tapping the right place on the stage; 14
//   (fix a buggy rule) fixed by changing the dropdown in the paper and ▶;
//   15 and its second item failed twice each → the ceiling is 14.
// - The Workshop opens as the mandatory step; challenges 1–5 solved (the
//   Workshop's own hooks put each canonical solution in place; the predict
//   and investigate questions are answered by tapping); after 5: "¡Se abrió
//   el Arcade!", large, inside the screen; the Arcade button in the bar; the
//   Arcade's menu (back to the Workshop, La carrera from tier 4, the
//   wardrobe; no xylophone, sheet editor, rule game or old game maker); La
//   carrera opens at tier 4; back to the Workshop and to the Arcade again;
//   a reload resumes on the Arcade with 4to's route kept.
// - Device G (another 4to child) mid-ladder: el docente's "Juegos para
//   todos" opens the Arcade there (the notice says so), never the green flag.
// - /admin shows K's rung while in the ladder, the challenge while in the
//   Workshop, "Arcade" once open.
// - "Quedan 5 minutos": K leaves the Arcade for the survey (its question
//   large inside the card); "Terminar la clase" ends both.
// - Postgres: the name, every `ladder_step` with its `variant` (10's second
//   item passed), the vm rungs' level_start/run, `ladder_end` ceiling ≥ 13,
//   workshop_challenge solved 1–5, `arcade_open` (workshop / games_all),
//   4to's `route_done` (workshop) and none for G, the step reasons.
//
// PW=<dir with playwright> ADMIN_PASSWORD=<the local throwaway> node tools/check-4to.mjs [base]
//   base:     the API serving a VITE_PLAYTEST=1 build (default http://127.0.0.1:8810/)
//   PSQL:     psql against the API's database (default "docker exec -i camino-prueba-testdb psql -U postgres -tA")
//   SHOTS:    optional directory for screenshots (<name>-<width>.png), incl. a tour of rungs 13–18
//   VIEWPORT: e.g. 1280x800 (default 1366x768)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const base = (process.argv[2] ?? 'http://127.0.0.1:8810/').replace(/\/?$/, '/');
const PASSWORD = process.env.ADMIN_PASSWORD;
const PSQL = process.env.PSQL ?? 'docker exec -i camino-prueba-testdb psql -U postgres -tA';
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
  // the Raspberry Pi is shared: give every wait room when other sessions load it
  p.setDefaultTimeout(60_000);
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch|401|429/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  return { ctx, p };
};

const center = async (p, sel) => { const b = await p.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const idle = (p) => p.waitForFunction(() => document.querySelector('main.level')?.dataset.busy !== 'true', null, { timeout: 30_000 });
const onLevel = (p, id) => p.waitForSelector(`main.level[data-level="${id}"]`, { timeout: 60_000 });
const onVm = (p, id) => p.waitForSelector(`main.pp-vm[data-item="${id}"]`, { timeout: 60_000 });
const flow = (p) => p.evaluate(() => window.__piloto.flow());

/** Drags the palette block `cmd` into the notebook with the mouse. */
async function dragBlock(p, cmd) {
  const [fx, fy] = await center(p, `.zone-palette [data-cmd="${cmd}"]`);
  const t = await p.locator('.zone-program').boundingBox();
  await p.mouse.move(fx, fy); await p.mouse.down(); await p.mouse.move(fx + 30, fy + 10, { steps: 4 });
  await p.mouse.move(t.x + t.width / 2, t.y + 140, { steps: 12 }); await p.mouse.up();
  await p.waitForTimeout(400);
}
/** Solves the page on screen with its reference solution (the ?debug hook), then turns it. */
async function solvePage(p) {
  await p.waitForTimeout(900);
  await p.waitForFunction(() => !document.querySelector('.ghost-hand'), null, { timeout: 30_000 }).catch(() => {});
  await p.evaluate(() => { window.__camino.setProgram(window.__camino.level.solution); });
  await p.waitForTimeout(300);
  await p.locator('.btn-play').click();
  await p.locator('.next-page').click({ force: true, timeout: 30_000 });
}
/** A run that bumps (three steps right, every line filled: rung 10's first world has a rock in the way). */
async function failRun(p) {
  // after a bump the board waits for ↺ before the next ▶
  if (await p.locator('.btn-restart').isVisible().catch(() => false)) { await p.locator('.btn-restart').click(); await p.waitForTimeout(500); }
  await p.evaluate(() => { window.__camino.setProgram([{ t: 'cmd', cmd: 'right' }, { t: 'cmd', cmd: 'right' }, { t: 'cmd', cmd: 'right' }]); });
  // a real tap on empty paper first: it cancels a wordless demo that would make the page ignore ▶ (muted pages play one after a failed run)
  await p.mouse.click(30, 130); // the climbing path's column (no handler there)
  await p.waitForTimeout(600);
  await p.locator('.btn-play').click();
  await p.waitForTimeout(600);
  // three worlds run in lockstep: ▶ is disabled until all of them are done
  await p.waitForFunction(() => !document.querySelector('.btn-play')?.disabled, null, { timeout: 30_000 });
  await idle(p);
  await p.waitForTimeout(600);
}
/** A game page: its reference rules, ▶, then the keys: a fixed way (`keys`) or chasing the falling seeds. */
async function winGame(p, keys) {
  await p.waitForTimeout(1200);
  await p.waitForFunction(() => !document.querySelector('.ghost-hand'), null, { timeout: 30_000 }).catch(() => {});
  await p.evaluate(() => window.__camino.setRules(window.__camino.level.realtime.solution));
  await p.waitForTimeout(300);
  await p.locator('.btn-play').click();
  await p.waitForTimeout(500);
  if (keys) {
    for (const k of keys) { await p.keyboard.press(`Arrow${k}`); await p.waitForTimeout(650); }
  } else {
    const end = Date.now() + 150_000;
    while (Date.now() < end) {
      const st = await p.evaluate(() => {
        const s = window.__camino.sim();
        if (s.won) return { won: true };
        if (s.busy || s.queue.length || !s.seeds?.length) return {};
        const t = s.seeds.filter((f) => !f.touched).sort((a, b) => b.y - a.y)[0];
        return { key: t && t.c !== s.robot.c ? (t.c > s.robot.c ? 'ArrowRight' : 'ArrowLeft') : null };
      });
      if (st.won) break;
      if (st.key) await p.keyboard.press(st.key);
      await p.waitForTimeout(120);
    }
  }
  await p.locator('.next-page').click({ force: true, timeout: 30_000 });
}
/** A Workshop-blocks item: two real tries that do not pass (the step put under the hat alone, ▶, twice). */
async function failVmTwice(p) {
  for (let i = 0; i < 2; i++) {
    await p.evaluate(() => {
      const pr = window.__ladderVm.project();
      const pl = pr.sprites.find((s) => s.id === 'player');
      const hat = pl.stacks.find((st) => st.blocks[0]?.op === 'key');
      const step = pl.stacks.find((st) => st.blocks[0]?.op === 'changeX');
      if (step) { hat.blocks.push(step.blocks[0]); pl.stacks = pl.stacks.filter((st) => st !== step); }
      window.__ladderVm.setProject(pr);
    });
    await p.waitForTimeout(300);
    const before = await p.evaluate(() => window.__ladderVm.state().fails);
    await p.locator('.pp-vm .ws-go').click();
    await p.waitForFunction((n) => !window.__ladderVm || window.__ladderVm.state().fails > n || window.__ladderVm.state().ended, before, { timeout: 20_000 });
    await p.locator('.pp-vm .ws-stop').click({ force: true, timeout: 2000 }).catch(() => {});
    await p.waitForTimeout(300);
  }
}

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
  await p.waitForSelector('.piloto[data-step="tool_check"]');
  d.sid = await p.evaluate(() => window.__piloto.session().id);
  console.log(`     ${name}: session ${d.sid} (4to, "${kid}")`);
  return d;
}

/** The workshop's moments (T40's hooks and selectors, tools/check-workshop.mjs). */
const ws = (p) => p.evaluate(() => window.__workshop.state());
const waitPhase = (p, phase, n) => p.waitForFunction(([ph, nn]) => { const s = window.__workshop?.state(); return s && s.phase === ph && (nn == null || s.current === nn); }, [phase, n ?? null], { timeout: 45_000 });
async function solveChallenge(p, n) {
  await p.evaluate(() => window.__workshop.solve());
  await p.waitForTimeout(400);
  await p.locator('.ws-page .ws-go').click();
  await p.waitForFunction((nn) => { const s = window.__workshop.state(); return s.current > nn || !!s.why; }, n, { timeout: 45_000 });
  const s = await ws(p);
  ok(s.current > n, `Workshop challenge ${n} solved${s.why ? ` (why: ${s.why})` : ''}`);
  await p.waitForSelector('.ws-party', { state: 'detached', timeout: 15_000 }).catch(() => {});
  await p.locator('.ws-page .ws-stop').click({ force: true, timeout: 2000 }).catch(() => {});
}

/** The page last worked on (a screenshot when the check stops). */
let last = null;
const adminRow = (a, sid) => a.evaluate((id) => document.querySelector(`#class-rows tr[data-id="${id}"]`)?.textContent ?? '', sid);
const waitAdmin = (a, sid, re) => a.waitForFunction(([id, src]) => new RegExp(src).test(document.querySelector(`#class-rows tr[data-id="${id}"]`)?.textContent ?? ''), [sid, re.source], { timeout: 30_000 });

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

  // ---------------------------------------------------------------- the tour (screenshots of the new rungs, a session of its own, closed before any class command)
  if (SHOTS) {
    const T = await child('tour', 'Tour');
    await T.p.evaluate(() => window.__piloto.jump('ladder'));
    await T.p.waitForFunction(() => !!window.__ladder?.go, null, { timeout: 30_000 });
    for (const [r, v] of [[13, 0], [13, 1], [14, 0], [15, 0], [16, 0], [17, 0], [18, 0], [18, 1]]) {
      await T.p.evaluate(([rr, vv]) => window.__ladder.go(rr, vv || undefined), [r, v]);
      await onVm(T.p, `pp-l${r}${v ? 'b' : ''}`);
      await T.p.waitForTimeout(4500);
      await shot(T.p, `vm-r${r}${v ? 'b' : ''}`);
    }
    await T.p.evaluate(() => window.__piloto.endNow());
    await T.p.evaluate(() => window.__piloto.flush());
    await T.ctx.close();
  }

  // ---------------------------------------------------------------- K: name, character, the short tool check
  const K = await child('K', 'Lola');
  const k = K.p;
  last = k;
  await k.waitForSelector('main.level[data-level="tool-1"]', { timeout: 30_000 });
  await k.waitForTimeout(1200);
  await dragBlock(k, 'right');
  await k.waitForTimeout(1000);
  await k.locator('.btn-play').click();
  await onLevel(k, 'tool-2');
  await k.waitForTimeout(1300);
  await k.locator('.zone-palette [data-cmd="right"]').first().click();
  await k.waitForTimeout(1200);
  await k.locator('.btn-restart').click();
  await k.waitForTimeout(1200);
  await k.locator('.level-bar .help').click();
  await k.waitForSelector('[data-interlude="walk"]', { timeout: 20_000 });

  // ---------------------------------------------------------------- the long ladder
  await onLevel(k, 'pp-l7');
  ok(await k.locator('.pp-climb').isVisible(), 'ladder: the climbing path is beside the page');
  ok((await k.locator('.pp-climb-camp').count()) === 12 && (await k.locator('.pp-climb-camp.is-here[data-rung="7"]').count()) === 1, 'ladder: one camp per rung from 7 to 18, rung 7 circled');
  ok(await k.locator('.blk-labeled.is-word-picture').count() > 0 && await k.locator('.blk-labeled.is-picture-word').count() === 0, 'ladder: word-picture labels from the first item (no picture-first blocks)');
  await k.waitForTimeout(1500);
  await shot(k, 'ladder-r7');
  await K.p.evaluate(() => window.__piloto.flush());
  await waitAdmin(a, K.sid, /escalón 7/);
  ok(true, '/admin: K shows "escalera de niveles · escalón 7"');
  await solvePage(k);
  await onLevel(k, 'pp-l8'); await solvePage(k);
  await onLevel(k, 'pp-l9'); await solvePage(k);
  await onLevel(k, 'pp-l10');
  await k.waitForTimeout(1200);
  await failRun(k); await failRun(k);
  await onLevel(k, 'pp-l10b');
  ok(true, 'rung 10: the first item failed twice → its second item (pp-l10b), not a step down');
  await k.waitForTimeout(1500);
  await shot(k, 'ladder-variant');
  ok(await k.locator('.pp-climb-camp.is-passed').count() === 3 && await k.locator('.pp-climb-camp.is-here[data-rung="10"]').count() === 1, 'the path: three flags (7, 8, 9), rung 10 still circled');
  await solvePage(k);
  await onLevel(k, 'pp-l11'); await winGame(k, ['Right', 'Up', 'Up', 'Up', 'Right', 'Right', 'Right']);
  await onLevel(k, 'pp-l12'); await winGame(k, null);

  // 13: predict, on the Workshop's blocks: the right place tapped on the stage
  await onVm(k, 'pp-l13');
  ok(await k.locator('.pp-vm-goal-text').isVisible() && (await k.locator('.pp-vm-goal-text').innerText()).length > 40, 'rung 13: the goal large inside the screen');
  ok(await k.locator('.pp-vm-spot').count() === 6 && await k.locator('.pp-vm-scripts .pp-vm-script').count() === 2, 'rung 13: two scripts shown, six places to choose from');
  await k.waitForTimeout(3500);
  const right = await k.evaluate(() => window.__ladderVm.answer());
  await k.locator(`.pp-vm-spot[data-spot="${right}"] .pp-vm-spot-hit`).click({ force: true });
  await k.waitForFunction(() => window.__ladderVm?.state().won, null, { timeout: 15_000 });
  ok(true, 'rung 13: the right place tapped; the game ran with the keys and it is right');
  await shot(k, 'ladder-r13-right');

  // 14: fix the rule by its dropdown in the paper, then ▶
  await onVm(k, 'pp-l14');
  await k.waitForTimeout(2500);
  const touching = await k.evaluate(() => window.__wsEditor.blocks().find((b) => b.op === 'touching'));
  const inp = touching.inputs.find((x) => x.name === 'OBJ');
  await k.mouse.click(inp.x + inp.w / 2, inp.y + inp.h / 2);
  await k.locator('.ws-opt[data-value="player"]').click();
  await k.waitForTimeout(300);
  await k.locator('.pp-vm .ws-go').click();
  await k.waitForFunction(() => window.__ladderVm?.state().won, null, { timeout: 15_000 });
  ok(true, 'rung 14: the dropdown changed to Personaje in the paper, ▶: fixed');
  await shot(k, 'ladder-r14-won');

  // 15 and its second item: two tries that do not pass each → the ceiling is 14
  await onVm(k, 'pp-l15');
  await k.waitForTimeout(2500);
  await failVmTwice(k);
  await onVm(k, 'pp-l15b');
  ok(true, 'rung 15: the first item not passed → its second item');
  await k.waitForTimeout(2500);
  await failVmTwice(k);
  await k.waitForSelector('[data-interlude="cheer"]', { timeout: 30_000 });
  ok(true, 'rung 15\'s second item not passed: the ladder stops at its ceiling (14) with the cheer');
  await k.locator('.pp-cheer-next').click({ force: true });

  // ---------------------------------------------------------------- the Workshop, mandatory
  await k.waitForSelector('.piloto[data-step="workshop"] .ws-page', { timeout: 30_000 });
  ok(true, 'the Workshop opens as the next step');
  ok(await k.locator('[data-act="arcade"]').count() === 0, 'no Arcade button yet');
  // 1: predict (answered by tapping), run, reveal, make
  await k.waitForSelector('[data-card="predict"]', { timeout: 15_000 });
  await k.waitForTimeout(1200);
  await k.locator('.ws-choice').first().click();
  await waitPhase(k, 'run', 1);
  await k.locator('.ws-page .ws-go').click();
  await k.waitForSelector('[data-card="reveal"]', { timeout: 20_000 });
  await k.locator('[data-act="go-make"]').click();
  await waitPhase(k, 'make', 1);
  await K.p.evaluate(() => window.__piloto.flush());
  await waitAdmin(a, K.sid, /desafío 1/);
  ok(true, '/admin: K shows "taller de juegos · desafío 1"');
  await a.locator(`#class-rows tr[data-id="${K.sid}"]`).scrollIntoViewIfNeeded();
  await shot(a, 'admin-challenge');
  await solveChallenge(k, 1);
  // 2: investigate (the block to blame tapped), make
  await k.waitForSelector('[data-card="investigate"]', { timeout: 15_000 });
  await k.waitForTimeout(800);
  await k.locator('[data-act="go-card"]').click();
  await waitPhase(k, 'investigate', 2);
  const bug = await k.evaluate(() => window.__wsEditor.blocks().filter((b) => b.op === 'setY').pop());
  await k.mouse.click(bug.x + 10, bug.rowY + 12);
  await k.waitForSelector('[data-card="reveal"]', { timeout: 8000 });
  await k.locator('[data-act="go-make"]').click();
  await waitPhase(k, 'make', 2);
  await solveChallenge(k, 2);
  for (const n of [3, 4, 5]) {
    await k.waitForSelector('[data-card="goal"]', { timeout: 15_000 });
    await k.waitForTimeout(600);
    await k.locator('[data-act="go-card"]').click();
    await waitPhase(k, 'make', n);
    await solveChallenge(k, n);
  }

  // ---------------------------------------------------------------- the Arcade opens
  await k.waitForSelector('.pp-arcade-open', { timeout: 20_000 });
  ok(/Se abrió el Arcade/.test(await k.locator('.pp-arcade-open-title').innerText()), '"¡Se abrió el Arcade!" large inside the screen');
  await k.waitForTimeout(900);
  await shot(k, 'arcade-open');
  const fk = await flow(k);
  ok(fk.arcadeOpen === true && fk.routeDone === true && fk.step === 'workshop', 'the flow: the Arcade open, the green flag up, still in the Workshop');
  ok(await k.locator('.pp-flag, .route-done').count() > 0, 'the green "terminó" flag shows');
  await k.locator('[data-act="arcade-stay"]').click();
  ok(await k.locator('.level-bar [data-act="arcade"]').isVisible(), '"Seguir en el taller": the Arcade button stays in the Workshop\'s bar');
  await k.locator('.level-bar [data-act="arcade"]').click();
  await k.waitForSelector('.piloto[data-step="free_play"] main.pp-menu', { timeout: 20_000 });
  const menu = await k.locator('main.pp-menu').getAttribute('data-menu');
  ok(menu === 'workshop race wardrobe', `the Arcade's menu: ${menu}`);
  ok(!/recess|editor|rule_game|game_maker|sheet/.test(menu), 'no xylophone, no sheet editor, no rule game, no old game maker');
  ok(await k.locator('.pp-arcade-h').isVisible(), 'the menu says "Arcade", large, inside the screen');
  await k.waitForTimeout(800);
  await shot(k, 'arcade-menu');
  await k.locator('.pp-fp-card[data-activity="race"]').click();
  await k.waitForSelector('.pp-race', { timeout: 20_000 });
  ok(await k.locator('.pp-race').first().getAttribute('data-tier') === '4', 'La carrera starts at tier 4 (turbo straights)');
  await k.locator('.pp-menu-back').click({ force: true });
  await k.waitForSelector('main.pp-menu', { timeout: 20_000 });
  await k.locator('.pp-fp-card[data-activity="workshop"]').click();
  await k.waitForSelector('.piloto[data-step="workshop"] .ws-page', { timeout: 20_000 });
  ok((await ws(k)).current === 6, 'the Workshop card: back to the Workshop, on challenge 6');
  await k.locator('.level-bar [data-act="arcade"]').click();
  await k.waitForSelector('.piloto[data-step="free_play"] main.pp-menu', { timeout: 20_000 });
  ok(true, 'and back to the Arcade');
  // a reload carries on on the same step, with 4to's route and the Arcade open
  await k.reload();
  await k.waitForSelector('.piloto[data-step="free_play"] main.pp-menu', { timeout: 30_000 });
  const fr = await flow(k);
  ok(fr.route === '4to' && fr.arcadeOpen === true && fr.routeDone === true && await k.locator('main.pp-menu').getAttribute('data-menu') === 'workshop race wardrobe', 'a reload: back on the Arcade, 4to\'s route and the open Arcade kept');
  await K.p.evaluate(() => window.__piloto.flush());
  await waitAdmin(a, K.sid, /Arcade/);
  ok(true, '/admin: K shows "Arcade"');

  // ---------------------------------------------------------------- G: "Juegos para todos" mid-ladder
  const G = await child('G', 'Nico');
  const g = G.p;
  await g.evaluate(() => window.__piloto.jump('ladder'));
  await onLevel(g, 'pp-l7');
  await G.p.evaluate(() => window.__piloto.flush());
  await waitAdmin(a, G.sid, /escalón 7/);
  await a.locator(`#class-rows tr[data-id="${G.sid}"]`).scrollIntoViewIfNeeded();
  await a.waitForTimeout(800);
  await shot(a, 'admin-rung');
  await a.click('#games-all');
  await g.waitForSelector('.pp-games-all', { timeout: 30_000 });
  ok(/Se abrió el Arcade/.test(await g.locator('.pp-games-all-text').innerText()), 'G: the notice says "¡Se abrió el Arcade!"');
  await shot(g, 'games-all-4to');
  const fg = await flow(g);
  ok(fg.step === 'free_play' && fg.arcadeOpen === true && !fg.routeDone, 'G: in the Arcade, open, no green flag');
  await g.waitForSelector('main.pp-menu', { timeout: 20_000 });
  ok(await g.locator('main.pp-menu').getAttribute('data-menu') === 'workshop race wardrobe', 'G: the Arcade\'s menu');
  ok((await flow(k)).step === 'free_play', 'K: already in the Arcade, nothing moved');
  await G.p.evaluate(() => window.__piloto.flush());
  await waitAdmin(a, G.sid, /Arcade/);
  await a.locator(`#class-rows tr[data-id="${K.sid}"]`).scrollIntoViewIfNeeded();
  await a.waitForTimeout(800);
  await shot(a, 'admin-arcade');

  // ---------------------------------------------------------------- "quedan 5 minutos" → the survey; "terminar la clase"
  await a.click('#five-min');
  await k.waitForSelector('.pp-five', { timeout: 30_000 });
  await k.waitForSelector('[data-interlude="cheer"], .piloto[data-step="survey"]', { timeout: 30_000 });
  if (await k.locator('.pp-cheer-next').count()) await k.locator('.pp-cheer-next').click({ force: true });
  await k.waitForSelector('.piloto[data-step="survey"]', { timeout: 30_000 });
  await k.waitForSelector('.pp-q-text', { timeout: 20_000 });
  ok(await k.locator('.pp-q-text').isVisible(), 'K: "quedan 5 minutos" → the survey, its question large inside the card');
  await k.waitForTimeout(800);
  await shot(k, 'survey');
  await a.click('#end-class');
  await a.click('#end-class');
  await k.waitForSelector('[data-class-end="rest"]', { timeout: 40_000 });
  await g.waitForSelector('[data-class-end="rest"]', { timeout: 40_000 });
  ok(true, '"Terminar la clase": both devices end and rest');
  await K.p.evaluate(() => window.__piloto.flush());
  await G.p.evaluate(() => window.__piloto.flush());
  await k.waitForTimeout(1500);

  // ---------------------------------------------------------------- the rows
  const name = sql(`select child_name from sessions where id = '${K.sid}';`);
  ok(name === 'Lola', `K's name in sessions.child_name: ${name}`);
  const steps = json(`select payload->>'rung' as rung, payload->>'item' as item, payload->>'result' as result, payload->>'variant' as variant, payload->>'concept' as concept, payload->>'format' as format from events where session_id = '${K.sid}' and type = 'ladder_step' order by seq`);
  console.log('     K ladder_step:', steps.map((s) => `${s.item}:${s.result}:v${s.variant}`).join(' '));
  ok(steps.length >= 10 && steps.every((s) => s.variant === '0' || s.variant === '1'), 'every ladder_step carries its variant');
  ok(steps.some((s) => s.item === 'pp-l10' && s.result === 'fail' && s.variant === '0') && steps.some((s) => s.item === 'pp-l10b' && s.result === 'pass' && s.variant === '1'), 'rung 10: the first item failed, the second passed');
  ok(steps.some((s) => s.item === 'pp-l13' && s.result === 'pass' && s.concept === 'events_predict' && s.format === 'predict'), 'rung 13 (events_predict, predict) passed');
  ok(steps.some((s) => s.item === 'pp-l14' && s.result === 'pass' && s.concept === 'fix_rule'), 'rung 14 (fix_rule) passed');
  ok(steps.some((s) => s.item === 'pp-l15b' && s.result === 'fail' && s.variant === '1'), 'rung 15\'s second item failed');
  const lend = json(`select payload->>'ceiling_rung' as ceiling, payload->>'reason' as reason, payload->>'items' as items from events where session_id = '${K.sid}' and type = 'ladder_end'`);
  ok(lend.length === 1 && Number(lend[0].ceiling) >= 13 && lend[0].reason === 'ceiling', `ladder_end: ceiling ${lend[0]?.ceiling} (≥ 13), ${lend[0]?.reason}, ${lend[0]?.items} items`);
  const vmRuns = sql(`select count(*) from events where session_id = '${K.sid}' and type = 'run' and payload->>'level_id' in ('pp-l13', 'pp-l14', 'pp-l15', 'pp-l15b');`);
  ok(Number(vmRuns) >= 6, `the Workshop-blocks rungs logged their runs (${vmRuns})`);
  const wc = json(`select (payload->>'n')::int as n, payload->>'phase' as phase from events where session_id = '${K.sid}' and type = 'workshop_challenge'`);
  ok([1, 2, 3, 4, 5].every((n) => wc.some((c) => c.n === n && c.phase === 'solved')), 'workshop_challenge: 1–5 solved');
  const arc = json(`select session_id::text as sid, payload->>'via' as via from events where session_id in ('${K.sid}', '${G.sid}') and type = 'arcade_open'`);
  ok(arc.some((r) => r.sid === K.sid && r.via === 'workshop') && arc.some((r) => r.sid === G.sid && r.via === 'games_all'), `arcade_open: K by the Workshop, G by "Juegos para todos" (${arc.map((r) => r.via).join(', ')})`);
  const rd = json(`select session_id::text as sid, payload->>'via' as via from events where session_id in ('${K.sid}', '${G.sid}') and type = 'route_done'`);
  ok(rd.length === 1 && rd[0].sid === K.sid && rd[0].via === 'workshop', 'route_done: K once (via the Workshop), G never');
  const stepsK = sql(`select string_agg((payload->>'from') || '>' || (payload->>'to') || ':' || (payload->>'reason'), ' ' order by seq) from events where session_id = '${K.sid}' and type = 'step';`);
  console.log(`     K steps: ${stepsK}`);
  ok(/tool_check>ladder:next ladder>workshop:next workshop>free_play:arcade/.test(stepsK) && /free_play>workshop:arcade/.test(stepsK) && /free_play>survey:next/.test(stepsK), 'K\'s steps: the ladder → the Workshop → the Arcade and back, then the survey');
  ok(!/typing|wardrobe/.test(stepsK), 'K never went through the typing game or the wardrobe step');
  const stepG = sql(`select (payload->>'from') || '>' || (payload->>'to') || ':' || (payload->>'reason') from events where session_id = '${G.sid}' and type = 'step' and payload->>'reason' = 'games_all';`);
  ok(stepG === 'ladder>free_play:games_all', `G's "Juegos para todos" step: ${stepG}`);
  sql('DELETE FROM class_commands;');
} catch (e) {
  ok(false, `stopped: ${String(e.message ?? e).split('\n')[0]}`);
  if (last && SHOTS) await last.screenshot({ path: path.join(SHOTS, `stopped-${VW}.png`) }).catch(() => {});
  if (last) console.log('     at:', await last.evaluate(() => JSON.stringify({ step: window.__piloto?.flow().step, level: document.querySelector('main.level')?.dataset.level, vm: window.__ladderVm?.state(), ladder: window.__ladder?.state() })).catch(() => '?'));
} finally {
  await browser.close();
}
ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 5).join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
