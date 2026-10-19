// T40's scripted check: the Game Workshop played through the real UI with
// real drags, in a 4to session, and its telemetry in Postgres.
//
// - `?grado=4`: T38's name screen (a name is typed), the character, the tool
//   check skipped by the debug jump to free play; the Workshop's card is
//   picked for real.
// - Challenge 1: the predict question answered (wrong on purpose), ▶, the
//   reveal; the floor's script built from the palette with real mouse drags
//   (a hat loose on the paper, `por siempre` under it, blocks dropped into
//   C-block mouths, a boolean into the `si`, a reporter into the boolean,
//   numbers typed on the number pad), ▶ → passed.
// - The paper panned by dragging its background; a whole stack dragged by
//   its hat to another place.
// - Challenge 2: the investigate question answered (right), the buggy block
//   dragged out from the middle of its script onto the palette (deleted),
//   `si … si no` built, ▶ → passed.
// - Challenge 3: the log duplicated with its card's button, the copy's two
//   y numbers changed, ▶ → passed.
// - Challenge 4: one help level asked (the hint line), the hit built in both
//   logs (a dropdown changed to `vidas`), ▶ → passed.
// - Challenges 5–7 built the same way; "¡Tu juego ya está en el Arcade!"
//   after 5; the free challenges' list after 7.
// - The game won once: points set to 19 through the debug hook, then a real
//   seed is caught while it runs (no keys: the character stays on the floor
//   where the seed runs) → "¡Ganaste!".
// - A reload: the same session, the Workshop's card again, the project and
//   the stars as they were.
// - Postgres: workshop_challenge rows (start/predict/investigate/solved per
//   challenge, the predict wrong and the investigate right, the help level),
//   workshop_edit batches, workshop_run rows (a won one), workshop_end, and
//   the views of 015_workshop.sql.
//
// PW=<dir with playwright> node tools/check-workshop.mjs [base]
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
const shot = async (name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${name}-${VW}.png`) }); };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
const p = await ctx.newPage();
// the Raspberry Pi is shared: give every wait room when other sessions load it
p.setDefaultTimeout(60_000);
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch|401|429/.test(m.text())) errors.push(m.text()); });

// ---------------------------------------------------------------- the Workshop's own handles

const ws = () => p.evaluate(() => window.__workshop.state());
const project = () => p.evaluate(() => window.__workshop.project());
const blocks = () => p.evaluate(() => window.__wsEditor.blocks());
const ops = (sprite) => p.evaluate((id) => {
  const walk = (bs) => bs.map((b) => [b.op, Object.fromEntries(Object.entries(b.in).map(([k, s]) => [k, s.r ? walk([s.r])[0] : s.v])), ...(b.subs ?? []).map(walk)]);
  return window.__workshop.project().sprites.find((s) => s.id === id || s.name === id).stacks.map((st) => walk(st.blocks));
}, sprite);
const findBlock = async (pred) => (await blocks()).find(pred);
const waitPhase = (phase, n) => p.waitForFunction(([ph, nn]) => { const s = window.__workshop?.state(); return s && s.phase === ph && (nn == null || s.current === nn); }, [phase, n ?? null], { timeout: 45_000 });

/** A real mouse drag, in steps. */
async function drag(from, to, steps = 12) {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  for (let i = 1; i <= steps; i++) await p.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  await p.waitForTimeout(120);
  await p.mouse.up();
  await p.waitForTimeout(220);
}

const PAL_SCALE = 0.86;
const PAL_PAD = 6;
const HAT = new Set(['flag', 'key', 'receive']);
const CAT = {
  flag: 'events', key: 'events', receive: 'events', broadcast: 'events',
  changeX: 'motion', setX: 'motion', changeY: 'motion', setY: 'motion', goto: 'motion', move: 'motion', xpos: 'motion', ypos: 'motion',
  sayFor: 'looks', say: 'looks', costume: 'looks', show: 'looks', hide: 'looks', sound: 'sound',
  wait: 'control', repeat: 'control', forever: 'control', if: 'control', ifElse: 'control', stop: 'control',
  touching: 'sensing', keyPressed: 'sensing', add: 'operators', sub: 'operators', random: 'operators', lt: 'operators', gt: 'operators', eq: 'operators', and: 'operators',
  var: 'variables', setVar: 'variables', changeVar: 'variables', win: 'game', lose: 'game',
};
const VALUE = new Set(['xpos', 'ypos', 'add', 'sub', 'random', 'lt', 'gt', 'eq', 'and', 'touching', 'keyPressed', 'var']);

/**
 * Where a point is, brought into view first: when it lies under the
 * paper's bottom (or over its top), the paper is scrolled with the real
 * mouse wheel and the point asked again. `at` is a point or a function that
 * finds it (blocks move when the paper scrolls).
 */
async function inView(at) {
  const get = typeof at === 'function' ? at : async () => at;
  let pt = await get();
  for (let i = 0; i < 6; i++) {
    const pp = await p.evaluate(() => window.__wsEditor.paper());
    const dy = pt.y > pp.bottom - 90 ? pt.y - (pp.bottom - 200) : pt.y < pp.top + 20 ? pt.y - (pp.top + 120) : 0;
    if (!dy) return pt;
    await p.mouse.move(pp.x + pp.width / 2, pp.y + pp.height / 2);
    await p.mouse.wheel(0, dy);
    await p.waitForTimeout(200);
    pt = await get();
  }
  return pt;
}

/**
 * Drags a new block from the palette so that its top-left lands at `tl`
 * (client pixels; a reporter: its left edge at tl.x, its middle at tl.y).
 */
async function fromPalette(key, at) {
  const tl = await inView(at);
  const op = key.startsWith('var-') ? 'var' : key;
  await p.locator(`.ws-cat[data-cat="${CAT[op]}"]`).click();
  await p.waitForTimeout(250);
  const item = p.locator(`.ws-pal-item[data-pal="${key}"]`);
  await item.scrollIntoViewIfNeeded();
  const r = await item.boundingBox();
  // grab inside the block's first row (a hat's row sits under its bump)
  const gx = 6, gy = (HAT.has(op) ? 18 : 0) + (VALUE.has(op) ? 10 : 12);
  const from = { x: r.x + (PAL_PAD + gx) * PAL_SCALE, y: r.y + (PAL_PAD + gy) * PAL_SCALE };
  const to = VALUE.has(op) ? { x: tl.x + gx, y: tl.y - 16 + gy } : { x: tl.x + gx, y: tl.y + gy };
  await drag(from, to);
}
/** The point below a block (its top-left for the next block). */
const after = (b) => ({ x: b.x, y: b.y + b.h });
const mouth = (b, m = 0) => ({ x: b.mouths[m].x, y: b.mouths[m].y });
const slot = (b, name) => { const i = b.inputs.find((x) => x.name === name); return { x: i.x + 2, y: i.y + i.h / 2 }; };
/** Types a number into a block's input with the number pad (the keyboard types too). */
async function setNum(b0, name, v) {
  const b = await refind(b0);
  const i = b.inputs.find((x) => x.name === name);
  await p.mouse.click(i.x + i.w / 2, i.y + i.h / 2);
  await p.waitForSelector('.ws-numpad', { timeout: 3000 });
  for (const ch of String(v)) await p.locator(`.ws-key[data-key="${ch}"]`).click();
  await p.locator('.ws-key[data-key="ok"]').click();
  await p.waitForSelector('.ws-numpad', { state: 'detached', timeout: 3000 });
}
/** A block again, by id (where it is drawn now). */
const byId = async (b0) => (await blocks()).find((x) => x.id === b0.id);
/** A block again, by id, scrolled into view. */
async function refind(b0) {
  return inView(async () => (await blocks()).find((x) => x.id === b0.id)).then(async () => (await blocks()).find((x) => x.id === b0.id));
}
async function setMenu(b0, name, value) {
  const b = await refind(b0);
  const i = b.inputs.find((x) => x.name === name);
  await p.mouse.click(i.x + i.w / 2, i.y + i.h / 2);
  await p.locator(`.ws-opt[data-value="${value}"]`).click();
}
const latest = async (op, sprite) => { const all = (await blocks()).filter((b) => b.op === op); return all[all.length - 1]; };
const selectSprite = async (id) => { await p.locator(`.ws-sprite[data-sprite="${id}"]`).click(); await p.waitForTimeout(300); };
/** ▶, and waits for the challenge to pass (the celebration) or for its "Casi" line. */
async function runAndCheck(n) {
  await p.locator('.ws-go').click();
  await p.waitForFunction((nn) => { const s = window.__workshop.state(); return s.current > nn || !!s.why; }, n, { timeout: 45_000 });
  const s = await ws();
  if (s.current > n) {
    await p.waitForSelector('.ws-party', { timeout: 3000 }).catch(() => {});
    return { passed: true };
  }
  return { passed: false, why: s.why };
}
async function closeParty() {
  await p.waitForSelector('.ws-party', { state: 'detached', timeout: 12_000 });
  await p.locator('.ws-stop').click({ force: true }).catch(() => {});
}

// ---------------------------------------------------------------- the scenario

try {
  await p.goto(`${base}?debug&nointro&grado=4&sonido=no#/piloto`);
  await p.waitForSelector('.pp-name-input', { timeout: 30_000 });
  await p.locator('.pp-name-input').fill('Toño');
  await p.locator('.pp-name-input').press('Enter');
  await p.waitForSelector('.choice-btn[data-choice-char="mina"]', { timeout: 20_000 });
  await p.locator('.choice-btn[data-choice-char="mina"]').click();
  await p.locator('.next-page').click({ force: true });
  await p.waitForSelector('.piloto[data-step="tool_check"]', { timeout: 20_000 });
  const sid = await p.evaluate(() => window.__piloto.session()?.id);
  ok(!!sid, `session ${sid} (4to, named)`);
  await p.evaluate(() => window.__piloto.jump('free_play'));
  await p.waitForSelector('.pp-fp-card', { timeout: 20_000 });
  ok(await p.locator('.pp-fp-card').first().getAttribute('data-activity') === 'workshop', '4to\'s free-play menu opens with the Workshop\'s card');
  await p.locator('.pp-fp-card[data-activity="workshop"]').click();
  await p.waitForSelector('.ws-page', { timeout: 20_000 });

  // ---------------------------------------------------------------- 1: predict, run, make
  await p.waitForSelector('[data-card="predict"]', { timeout: 10_000 });
  await p.waitForTimeout(1500);
  await shot('ws-c1-predict');
  ok(await p.locator('.ws-choice').count() === 3, 'challenge 1 opens with its predict question: three drawn choices, inside the screen');
  await p.locator('.ws-choice[data-choice="leaves"]').click();
  await waitPhase('run', 1);
  await shot('ws-c1-run');
  await p.locator('.ws-go').click();
  await p.waitForSelector('[data-card="reveal"]', { timeout: 15_000 });
  ok(await p.locator('[data-card="reveal"]').getAttribute('data-ok') === 'false', 'a wrong prediction: ▶ runs it and the reveal explains what happened');
  await shot('ws-c1-reveal');
  await p.locator('[data-act="go-make"]').click();
  await waitPhase('make', 1);
  ok((await ws()).sel === 'floor', 'the floor is selected to program');
  const paper = await p.evaluate(() => window.__wsEditor.paper());
  // the floor's script, block by block
  await fromPalette('flag', { x: paper.x + 40, y: paper.y + 30 });
  let hat = await latest('flag');
  ok(!!hat, 'a hat dragged from the palette lies loose on the paper');
  await fromPalette('forever', async () => after(await byId(hat)));
  let fe = await latest('forever');
  await fromPalette('changeX', async () => mouth(await byId(fe)));
  let cx = await latest('changeX');
  await setNum(cx, 'DX', '-6');
  cx = await latest('changeX');
  await fromPalette('if', async () => after(await byId(cx)));
  let iff = await latest('if');
  await fromPalette('lt', async () => slot(await byId(iff), 'COND'));
  let lt = await latest('lt');
  await fromPalette('xpos', async () => slot(await byId(lt), 'A'));
  lt = await latest('lt');
  await setNum(lt, 'B', '-240');
  iff = await latest('if');
  await fromPalette('setX', async () => mouth(await byId(iff)));
  let sx = await latest('setX');
  await setNum(sx, 'X', '240');
  const floor = await ops('floor');
  ok(JSON.stringify(floor) === JSON.stringify([[['flag', {}], ['forever', {}, [['changeX', { DX: '-6' }], ['if', { COND: ['lt', { A: ['xpos', {}], B: '-240' }] }, [['setX', { X: '240' }]]]]]]]),
    `the floor's script built by real drags: hat, «por siempre» under it, blocks into C mouths, a boolean into «si», a reporter into the boolean (${JSON.stringify(floor)})`);
  // a drag with its snap shadow, mid-air (for the screenshot), dropped back on the palette
  await p.locator('.ws-cat[data-cat="looks"]').click();
  await p.waitForTimeout(300);
  {
    const n0 = (await blocks()).length;
    const r = await p.locator('.ws-pal-item[data-pal="show"]').boundingBox();
    const t = after(await latest('setX'));
    await p.mouse.move(r.x + 10, r.y + 12); await p.mouse.down();
    // held a little off its place, so the dragged block and its shadow both show
    for (let i = 1; i <= 10; i++) await p.mouse.move(r.x + 10 + (t.x + 30 - r.x - 10) * i / 10, r.y + 12 + (t.y + 34 - r.y - 12) * i / 10);
    await p.waitForTimeout(300);
    ok(await p.locator('.ws-blk.is-shadow').count() > 0, 'while dragging, the gray snap shadow shows where it will go');
    await shot('ws-drag-shadow');
    for (let i = 1; i <= 10; i++) await p.mouse.move(t.x + 30 + (r.x + 20 - t.x - 30) * i / 10, t.y + 34 + (r.y + 20 - t.y - 34) * i / 10);
    await p.mouse.up();
    await p.waitForTimeout(200);
    ok((await blocks()).length === n0, 'dropped back on the palette: nothing added');
  }
  // pan the paper by its background, then drag the whole stack by its hat
  {
    const before = await p.evaluate(() => window.__wsEditor.scroll());
    const pp = await p.evaluate(() => window.__wsEditor.paper());
    await drag({ x: pp.x + pp.width - 140, y: pp.y + pp.height - 150 }, { x: pp.x + pp.width - 40, y: pp.y + pp.height - 90 });
    const after1 = await p.evaluate(() => window.__wsEditor.scroll());
    ok(before.x - after1.x >= 90 && before.y - after1.y >= 50, `the paper pans when its background is dragged (scroll ${before.x},${before.y} → ${after1.x},${after1.y})`);
    hat = await latest('flag');
    const n0 = (await blocks()).length;
    const up = Math.max(0, Math.min(80, hat.rowY - 40 - pp.top)); // up, toward the paper's top, so there is room below
    await drag({ x: hat.x + 8, y: hat.rowY + 12 }, { x: hat.x + 8 + 160, y: hat.rowY + 12 - up });
    const hat2 = await latest('flag');
    const all = await blocks();
    ok(Math.round(hat2.x - hat.x) === 160 && all.length === n0 && all.filter((b) => b.stack === hat2.stack).length === n0, 'dragging the hat carries the whole stack');
    await shot('ws-c1-built');
    // detach from the middle: «cambiar x en» (with the «si» below it) out of «por siempre», left loose on the paper
    const script = await ops('floor');
    const cxm = await latest('changeX');
    const feb = await latest('forever');
    const pp2 = await p.evaluate(() => window.__wsEditor.paper());
    const to = { x: pp2.x + 30, y: feb.y + 190 }; // below the emptied «por siempre», out of its reach
    await drag({ x: cxm.x + 8, y: cxm.rowY + 12 }, to);
    const two = await ops('floor');
    ok(two.length === 2 && JSON.stringify(two[0]) === JSON.stringify([['flag', {}], ['forever', {}, []]]) && JSON.stringify(two[1].map((b) => b[0])) === JSON.stringify(['changeX', 'if']),
      `a block taken from the middle of a stack takes everything below it, and lies loose (${JSON.stringify(two.map((st) => st.map((b) => b[0])))})`);
    await shot('ws-loose-stacks');
    // ... and dragged by its top block back into the empty C-block's mouth
    const cxl = await latest('changeX');
    const m = mouth(await latest('forever'));
    await drag({ x: cxl.x + 8, y: cxl.rowY + 12 }, { x: m.x + 8, y: m.y + (cxl.rowY - cxl.y) + 12 });
    ok(JSON.stringify(await ops('floor')) === JSON.stringify(script), 'the loose stack dragged by its top block back into «por siempre»: the script as it was');
  }
  let r1 = await runAndCheck(1);
  ok(r1.passed, `challenge 1 passes on ▶ (${r1.why ?? 'celebrated'})`);
  await p.waitForTimeout(400);
  await shot('ws-party');
  await closeParty();

  // ---------------------------------------------------------------- 2: investigate, fix
  await p.waitForSelector('[data-card="investigate"]', { timeout: 10_000 });
  await p.waitForTimeout(1200);
  await shot('ws-c2-card');
  await p.locator('[data-act="go-card"]').click();
  await waitPhase('investigate', 2);
  await shot('ws-c2-investigate');
  const bug = await latest('setY');
  await p.mouse.click(bug.x + 10, bug.rowY + 12);
  await p.waitForSelector('[data-card="reveal"]', { timeout: 5000 });
  ok(await p.locator('[data-card="reveal"]').getAttribute('data-ok') === 'true', 'the investigate question answered by tapping the block to blame (right)');
  await p.locator('[data-act="go-make"]').click();
  await waitPhase('make', 2);
  // the buggy block taken out from the middle of its script, onto the palette (deleted)
  {
    const b = await latest('setY');
    const pal = await p.locator('.ws-pal').boundingBox();
    await drag({ x: b.x + 10, y: b.rowY + 12 }, { x: pal.x + 120, y: pal.y + 300 });
    const pl = await ops('player');
    ok(pl.some((st) => st.length === 1 && st[0][0] === 'key') && !(await blocks()).some((x) => x.op === 'setY'), 'a block dragged from the middle of its script and dropped on the palette is deleted (the hat stays)');
  }
  const key = (await blocks()).find((b) => b.op === 'key');
  await fromPalette('ifElse', async () => after(await byId(key)));
  let ie = await latest('ifElse');
  await fromPalette('lt', async () => slot(await byId(ie), 'COND'));
  let lt2 = await latest('lt');
  await fromPalette('ypos', async () => slot(await byId(lt2), 'A'));
  lt2 = await latest('lt');
  await setNum(lt2, 'B', '0');
  ie = await latest('ifElse');
  await fromPalette('setY', async () => mouth(await byId(ie), 0));
  await setNum(await latest('setY'), 'Y', '100');
  ie = await latest('ifElse');
  await fromPalette('setY', async () => mouth(await byId(ie), 1));
  await setNum(await latest('setY'), 'Y', '-100');
  const r2 = await runAndCheck(2);
  ok(r2.passed, `challenge 2 passes: space flips both ways (${r2.why ?? 'celebrated'})`);
  await closeParty();

  // ---------------------------------------------------------------- 3: duplicate, modify
  await p.waitForSelector('[data-card="goal"]', { timeout: 10_000 });
  await p.waitForTimeout(1500);
  await shot('ws-c3-card');
  await p.locator('[data-act="go-card"]').click();
  await waitPhase('make', 3);
  await p.locator('.ws-sprite[data-sprite="log"] [data-act="dup"]').click();
  await p.waitForTimeout(400);
  const copyId = (await ws()).sel;
  ok(copyId !== 'log' && (await project()).sprites.find((s) => s.id === copyId)?.name === 'Tronco2', 'the log duplicated with its card\'s button: "Tronco2", selected');
  for (const g of (await blocks()).filter((b) => b.op === 'goto')) await setNum(g, 'Y', '100');
  const r3 = await runAndCheck(3);
  ok(r3.passed, `challenge 3 passes: one log on the ceiling (${r3.why ?? 'celebrated'})`);
  await closeParty();

  // ---------------------------------------------------------------- 4: a hint, the hits
  await p.waitForSelector('[data-card="goal"]', { timeout: 10_000 });
  await p.locator('[data-act="go-card"]').click();
  await waitPhase('make', 4);
  await p.locator('[data-act="hint"]').click();
  await p.waitForSelector('.ws-note-hint', { timeout: 3000 });
  ok((await ws()).recs[4].help === 1, 'one help level: the hint line, inside the screen');
  await shot('ws-c4-hint');
  for (const [id, y] of [['log', -100], [copyId, 100]]) {
    await selectSprite(id);
    const lastIf = (await blocks()).filter((b) => b.op === 'if').sort((a, b) => a.y - b.y)[0];
    await fromPalette('if', async () => after(await byId(lastIf)));
    let hit = (await blocks()).filter((b) => b.op === 'if').sort((a, b) => b.y - a.y)[0];
    await fromPalette('touching', async () => slot(await byId(hit), 'COND'));
    hit = (await blocks()).filter((b) => b.op === 'if').sort((a, b) => b.y - a.y)[0];
    await fromPalette('changeVar', async () => mouth(await byId(hit)));
    let cv = await latest('changeVar');
    await setMenu(cv, 'VAR', 'vidas');
    cv = await latest('changeVar');
    await setNum(cv, 'V', '-1');
    cv = await latest('changeVar');
    await fromPalette('goto', async () => after(await byId(cv)));
    let g = await latest('goto');
    await setNum(g, 'X', '240');
    g = await latest('goto');
    await setNum(g, 'Y', String(y));
  }
  const r4 = await runAndCheck(4);
  ok(r4.passed, `challenge 4 passes: a hit takes one life and sends the log back (${r4.why ?? 'celebrated'})`);
  await closeParty();

  // ---------------------------------------------------------------- 5: points
  await p.waitForSelector('[data-card="goal"]', { timeout: 10_000 });
  await p.locator('[data-act="go-card"]').click();
  await waitPhase('make', 5);
  ok((await ws()).sel === 'seed', 'the seed is selected, shown, with its given run');
  {
    const lastIf = (await blocks()).filter((b) => b.op === 'if').sort((a, b) => a.y - b.y)[0];
    await fromPalette('if', async () => after(await byId(lastIf)));
    let hit = (await blocks()).filter((b) => b.op === 'if').sort((a, b) => b.y - a.y)[0];
    await fromPalette('touching', async () => slot(await byId(hit), 'COND'));
    hit = (await blocks()).filter((b) => b.op === 'if').sort((a, b) => b.y - a.y)[0];
    await fromPalette('changeVar', async () => mouth(await byId(hit)));
    await fromPalette('goto', async () => after(await byId(await latest('changeVar'))));
    let g = await latest('goto');
    await setNum(g, 'X', '240');
    g = await latest('goto');
    await setNum(g, 'Y', '-100');
  }
  const r5 = await runAndCheck(5);
  ok(r5.passed, `challenge 5 passes: a point per seed, and it comes back (${r5.why ?? 'celebrated'})`);
  await p.waitForSelector('.ws-party-arcade', { timeout: 4000 }).then(() => ok(true, '"¡Tu juego ya está en el Arcade!" after challenge 5'), () => ok(false, 'the Arcade line after challenge 5'));
  await shot('ws-arcade');
  ok((await ws()).arcade === true, 'the Arcade flag is set');
  await closeParty();

  // ---------------------------------------------------------------- 6: speed in an expression
  await p.waitForSelector('[data-card="goal"]', { timeout: 10_000 });
  await p.locator('[data-act="go-card"]').click();
  await waitPhase('make', 6);
  for (const id of ['log', copyId]) {
    await selectSprite(id);
    let cx6 = await latest('changeX');
    await fromPalette('sub', async () => slot(await byId(cx6), 'DX'));
    cx6 = await latest('changeX');
    let sub = await latest('sub');
    await setNum(sub, 'A', '0');
    sub = await latest('sub');
    await fromPalette('var-velocidad', async () => slot(await byId(sub), 'B'));
  }
  await selectSprite('seed');
  {
    const cv = await latest('changeVar');
    await fromPalette('changeVar', async () => after(await byId(cv)));
    const cv2 = (await blocks()).filter((b) => b.op === 'changeVar').sort((a, b) => b.y - a.y)[0];
    await setMenu(cv2, 'VAR', 'velocidad');
  }
  const r6 = await runAndCheck(6);
  ok(r6.passed, `challenge 6 passes: the logs use velocidad, and it goes up with each seed (${r6.why ?? 'celebrated'})`);
  await closeParty();

  // ---------------------------------------------------------------- 7: win or lose
  await p.waitForSelector('[data-card="goal"]', { timeout: 10_000 });
  await p.locator('[data-act="go-card"]').click();
  await waitPhase('make', 7);
  ok((await ws()).sel === 'stage', 'the stage is selected for the rules');
  {
    const pp = await p.evaluate(() => window.__wsEditor.paper());
    await fromPalette('flag', { x: pp.x + 40, y: pp.y + 30 });
    await fromPalette('forever', async () => after(await byId(await latest('flag'))));
    await fromPalette('if', async () => mouth(await byId(await latest('forever'))));
    let i1 = await latest('if');
    await fromPalette('lt', async () => slot(await byId(i1), 'COND'));
    await fromPalette('var-vidas', async () => slot(await byId(await latest('lt')), 'A'));
    await setNum(await latest('lt'), 'B', '1');
    i1 = await latest('if');
    await fromPalette('lose', async () => mouth(await byId(i1)));
    i1 = await latest('if');
    await fromPalette('if', async () => after(await byId(i1)));
    let i2 = (await blocks()).filter((b) => b.op === 'if').sort((a, b) => b.y - a.y)[0];
    await fromPalette('gt', async () => slot(await byId(i2), 'COND'));
    await fromPalette('var-puntos', async () => slot(await byId(await latest('gt')), 'A'));
    await setNum(await latest('gt'), 'B', '19');
    i2 = (await blocks()).filter((b) => b.op === 'if').sort((a, b) => b.y - a.y)[0];
    await fromPalette('win', async () => mouth(await byId(i2)));
  }
  const r7 = await runAndCheck(7);
  ok(r7.passed, `challenge 7 passes: 0 lives → perder, 20 points → ganar (${r7.why ?? 'celebrated'})`);
  await closeParty();
  await p.waitForSelector('[data-card="free"]', { timeout: 8000 });
  await p.waitForTimeout(500);
  await shot('ws-free-list');
  ok(await p.locator('.ws-free-item').count() === 6, 'after challenge 7: the free challenges\' list (six, each with its own star)');
  const st7 = await ws();
  ok([1, 2, 3, 4, 5, 6, 7].every((k) => st7.recs[k]?.solved), 'all seven core challenges solved');
  await p.locator('[data-act="close-free"]').click();

  // ---------------------------------------------------------------- win the game once (a real seed caught at 19 points)
  await p.locator('.ws-go').click();
  await p.waitForFunction(() => window.__workshop.running(), null, { timeout: 5000 });
  await p.waitForTimeout(400);
  await shot('ws-running');
  // the screenshots freeze the drawing for a moment (rAF callbacks held, then released), so a 170 ms flip can be caught mid-air on a slow host
  const freeze = () => p.evaluate(() => { const w = window; w.__raf0 = w.__raf0 ?? w.requestAnimationFrame.bind(w); w.__rafq = []; w.requestAnimationFrame = (cb) => { w.__rafq.push(cb); return 0; }; });
  const thaw = () => p.evaluate(() => { const w = window; w.requestAnimationFrame = w.__raf0; w.__rafq.splice(0).forEach((cb) => w.__raf0(cb)); });
  await p.evaluate(() => window.__workshop.poke({ vidas: 99 }));
  await p.keyboard.press('Space');
  await p.waitForTimeout(60);
  await freeze();
  await p.waitForTimeout(80);
  await shot('ws-flip');
  await thaw();
  await p.waitForTimeout(600);
  await p.keyboard.press('Space'); // back to the floor, where the logs and the seeds run
  await p.waitForSelector('.ws-fx-hit', { timeout: 25_000 }).then(async () => { await freeze(); await shot('ws-hit'); await thaw(); ok(true, 'a log hits the character: the burst and the shake'); }, () => ok(false, 'no hit seen in 25 s'));
  await p.evaluate(() => window.__workshop.poke({ puntos: 19 }));
  await p.locator('.ws-stage[data-end="won"]').waitFor({ timeout: 25_000 }).then(() => ok(true, 'the game won: "¡Ganaste!" over the stage'), () => ok(false, 'the game was not won'));
  await shot('ws-won');
  await p.locator('.ws-strip').screenshot({ path: SHOTS ? path.join(SHOTS, `ws-strip-${VW}.png`) : '/dev/null' }).catch(() => {});

  // ---------------------------------------------------------------- reload: everything kept
  const before = await project();
  await p.reload();
  await p.waitForSelector('.pp-fp-card, .ws-page', { timeout: 30_000 });
  if (await p.locator('.pp-fp-card').count()) await p.locator('.pp-fp-card[data-activity="workshop"]').click();
  await p.waitForSelector('.ws-page', { timeout: 20_000 });
  const sid2 = await p.evaluate(() => window.__piloto.session()?.id);
  const st = await ws();
  const afterReload = await project();
  ok(sid2 === sid, 'a reload keeps the session');
  ok(JSON.stringify(afterReload.sprites.map((s) => [s.name, s.stacks.length])) === JSON.stringify(before.sprites.map((s) => [s.name, s.stacks.length])), 'a reload keeps every sprite and its scripts');
  ok(st.current === 8 && st.phase === 'free' && [1, 2, 3, 4, 5, 6, 7].every((k) => st.recs[k]?.solved) && st.arcade, 'a reload keeps the stars and the Arcade flag');
  ok(await p.locator('.ws-star-slot.is-solved').count() === 7, 'the strip shows seven stars');
  await p.locator('[data-act="close-free"]').click().catch(() => {});

  // leave the Workshop (workshop_end) through free play's own "volver al menú"
  await p.locator('.pp-menu-back').click();
  await p.waitForSelector('.pp-fp-card', { timeout: 10_000 });
  await p.waitForTimeout(6500); // the queue syncs every 5 s

  // ---------------------------------------------------------------- Postgres
  const rows = json(`select type, payload from events where session_id = '${sid}' and type like 'workshop%' order by seq`);
  const ch = rows.filter((r) => r.type === 'workshop_challenge').map((r) => r.payload);
  ok([1, 2, 3, 4, 5, 6, 7].every((k) => ch.some((c) => c.n === k && c.phase === 'start') && ch.some((c) => c.n === k && c.phase === 'solved')), 'workshop_challenge: start and solved for each of the seven');
  ok(ch.some((c) => c.n === 1 && c.phase === 'predict' && c.predict_choice === 'leaves' && c.predict_correct === false), 'workshop_challenge: the predict, wrong');
  ok(ch.some((c) => c.n === 2 && c.phase === 'investigate' && c.investigate_block === 'setY' && c.investigate_correct === true), 'workshop_challenge: the investigate, right');
  ok(ch.some((c) => c.n === 4 && c.phase === 'solved' && c.help_level === 1), 'workshop_challenge: challenge 4 solved with help level 1');
  ok(ch.filter((c) => c.phase === 'solved').every((c) => c.runs >= 1 && c.ms > 0), 'every solved row has its runs and its time');
  const edits = rows.filter((r) => r.type === 'workshop_edit').map((r) => r.payload);
  ok(edits.length >= 7 && edits.length < 40 && edits.some((e) => (e.counts.add ?? 0) > 3) && edits.some((e) => e.counts.delete) && edits.some((e) => e.counts.input) && edits.some((e) => e.counts.duplicate) && edits.some((e) => e.counts.move),
    `workshop_edit comes in batches (${edits.length} rows), with adds, a delete, inputs, a duplicate and a move`);
  const runs = rows.filter((r) => r.type === 'workshop_run').map((r) => r.payload);
  ok(runs.some((r) => r.result === 'won') && runs.some((r) => r.check === 'pass'), 'workshop_run: a won run, and runs that passed their check');
  ok(rows.some((r) => r.type === 'workshop_end' && r.payload.challenges_solved === 7), 'workshop_end: seven solved');
  const view = json(`select * from v_workshop_challenges where session_id = '${sid}' order by n`);
  ok(view.length >= 7 && view.find((v) => v.n === 1)?.predict_correct === false && view.find((v) => v.n === 2)?.investigate_correct === true, 'v_workshop_challenges: one row per challenge, with the predict and investigate answers');
  const byGrade = json('select * from v_workshop_by_grade where grade = 4');
  ok(byGrade.length === 1 && Number(byGrade[0].sessions) >= 1, 'v_workshop_by_grade has 4to');
} catch (e) {
  console.log('FAIL', e.message);
  failures++;
  await shot('ws-error').catch(() => {});
}
ok(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(' | ')}` : ''}`);
await browser.close();
console.log(failures ? `${failures} FAILED` : 'all checks passed');
process.exit(failures ? 1 : 0);
