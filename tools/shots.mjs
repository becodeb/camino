// Screenshot tour with Playwright driving the system Chromium (no bundled browser needed).
// PW=/tmp/pw node tools/shots.mjs <outDir> [base] [only]
//   T1 scenarios are named t1-*, T2 scenarios t2-*, T3 scenarios t3-* (so `only=t2-` shoots the T2 tour);
//   1ro's year (feature primer-grado) is p1-* (its T1), p2-* (its T2: the formats, sheets 3, 5, 10–13, the river)
//   p3a-* (its T3a: the music recess, sheet 9, and the guardas, sheet 14) and p3b-* (its T3b: the workshops,
//   sheets 7 and 15, the class corkboard, and the comodín, sheet 16).
//   PW: a directory with playwright installed; base: the running app (default http://127.0.0.1:8797/)
//   only: run the scenarios whose name contains this text.
// Uses the ?debug hooks (window.__camino) to build programs and run them; waits in real time.
// A scenario with `progress` starts from that stored progress (curriculum/progress.ts), `null` from none.
import { createRequire } from 'node:module';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const [out = '.', base = 'http://127.0.0.1:8797/', only = ''] = process.argv.slice(2);
const url = (hash, q = '') => `${base}?debug${q}#${hash}`;
const cam = (page, js, arg) => page.evaluate(js, arg);
/** Sets a program (JSON, see game/model Program) and presses ▶ without waiting for the run. */
const runProgram = async (p, program, wait) => {
  await cam(p, (x) => window.__camino.setProgram(x), program);
  await p.waitForTimeout(400);
  cam(p, () => { void window.__camino.run(); });
  await p.waitForTimeout(wait);
};
const loop = (count, body) => [{ t: 'loop', count, body }];

const T1 = [
  { name: 'home-1366', size: [1366, 768], go: url('/', '&stamps=sala4-1,sala4-2') },
  { name: 'home-1280', size: [1280, 800], go: url('/') },
  { name: 'home-1920', size: [1920, 1080], go: url('/', '&stamps=sala4-1') },
  { name: 'sala4-1-idle', size: [1366, 768], go: url('/nivel/sala4-1') },
  {
    name: 'sala4-2-bump', size: [1366, 768], go: url('/nivel/sala4-2'),
    run: async (p) => { await cam(p, () => window.__camino.tap('right')); await p.waitForTimeout(1100); await cam(p, () => window.__camino.tap('right')); await p.waitForTimeout(330); },
  },
  {
    name: 'sala4-1-win', size: [1366, 768], go: url('/nivel/sala4-1'),
    run: async (p) => {
      for (const d of ['right', 'right', 'right', 'up', 'up']) { await cam(p, (x) => window.__camino.tap(x), d); await p.waitForTimeout(950); }
      await p.waitForTimeout(1600);
    },
  },
  { name: 'sala4-2-help', size: [1280, 800], go: url('/nivel/sala4-2'), run: async (p) => { await cam(p, () => window.__camino.help()); await p.waitForTimeout(900); } },
  { name: 'sala4-1-1920', size: [1920, 1080], go: url('/nivel/sala4-1') },
  { name: 'sala5-1-idle', size: [1366, 768], go: url('/nivel/sala5-1') },
  {
    name: 'sala5-1-midrun', size: [1366, 768], go: url('/nivel/sala5-1'),
    run: async (p) => { await cam(p, () => window.__camino.setProgram(window.__camino.cmdProgram(['right', 'right', 'up']))); await p.waitForTimeout(300); cam(p, () => { void window.__camino.run(); }); await p.waitForTimeout(1500); },
  },
  {
    name: 'sala5-1-help', size: [1280, 800], go: url('/nivel/sala5-1'),
    run: async (p) => { await cam(p, () => window.__camino.setProgram(window.__camino.cmdProgram(['right']))); await p.waitForTimeout(300); await cam(p, () => window.__camino.help()); await p.waitForTimeout(2150); },
  },
  {
    name: 'sala5-2-crash', size: [1366, 768], go: url('/nivel/sala5-2'),
    run: async (p) => { await cam(p, () => window.__camino.setProgram(window.__camino.cmdProgram(['up', 'up', 'up']))); await p.waitForTimeout(300); await cam(p, () => window.__camino.run()); await p.waitForTimeout(250); },
  },
  {
    name: 'sala5-2-potclosed', size: [1366, 768], go: url('/nivel/sala5-2'),
    run: async (p) => { await cam(p, () => window.__camino.setProgram(window.__camino.cmdProgram(['right', 'right', 'right']))); await p.waitForTimeout(300); cam(p, () => { void window.__camino.run(); }); await p.waitForTimeout(2750); },
  },
  {
    name: 'sala5-1-short', size: [1366, 768], go: url('/nivel/sala5-1'),
    run: async (p) => { await cam(p, () => window.__camino.setProgram(window.__camino.cmdProgram(['right']))); await p.waitForTimeout(300); await cam(p, () => window.__camino.run()); await p.waitForTimeout(700); },
  },
  {
    name: 'sala5-2-win', size: [1366, 768], go: url('/nivel/sala5-2'),
    run: async (p) => { await cam(p, () => window.__camino.setProgram(window.__camino.cmdProgram(['up', 'right', 'right', 'right', 'down']))); await p.waitForTimeout(300); await cam(p, () => window.__camino.run()); await p.waitForTimeout(600); },
  },
  {
    name: 'sala5-2-1920', size: [1920, 1080], go: url('/nivel/sala5-2'),
    run: async (p) => { await cam(p, () => window.__camino.setProgram(window.__camino.cmdProgram(['up', 'right']))); await p.waitForTimeout(400); },
  },
  { name: 'sala5-2-1280', size: [1280, 800], go: url('/nivel/sala5-2') },
].map((s) => ({ ...s, name: `t1-${s.name}` }));

const T2 = [
  { name: 'home-1366', size: [1366, 768], go: url('/', '&stamps=sala4-1,sala4-2,sala5-1,sala5-2,1ro-1') },
  { name: 'sala5-1-idle', size: [1366, 768], go: url('/nivel/sala5-1') },
  { name: 'sala5-2-idle', size: [1366, 768], go: url('/nivel/sala5-2') },
  { name: '1ro-1-idle', size: [1366, 768], go: url('/nivel/1ro-1') },
  {
    name: '1ro-1-full', size: [1366, 768], go: url('/nivel/1ro-1'),
    run: async (p) => { for (let i = 0; i < 4; i++) { await cam(p, () => window.__camino.tapPalette('right')); await p.waitForTimeout(i < 3 ? 350 : 470); } },
  },
  {
    name: '1ro-1-demo', size: [1366, 768], go: url('/nivel/1ro-1'),
    run: async (p) => { for (let i = 0; i < 4; i++) { await cam(p, () => window.__camino.tapPalette('right')); await p.waitForTimeout(350); } await p.waitForTimeout(Number(process.env.DEMO_MS ?? 4300)); },
  },
  { name: '1ro-1-demo-end', size: [1366, 768], go: url('/nivel/1ro-1'), run: async (p) => { await cam(p, () => window.__camino.playIntro()); await p.waitForTimeout(9000); } },
  { name: '1ro-1-midrun', size: [1366, 768], go: url('/nivel/1ro-1'), run: (p) => runProgram(p, loop(8, ['right']), Number(process.env.RUN_MS ?? 3600)) },
  { name: '1ro-1-short', size: [1280, 800], go: url('/nivel/1ro-1'), run: (p) => runProgram(p, loop(3, ['right']), 4200) },
  { name: '1ro-1-win', size: [1280, 800], go: url('/nivel/1ro-1'), run: (p) => runProgram(p, loop(8, ['right']), 11000) },
  { name: '1ro-2-idle', size: [1280, 800], go: url('/nivel/1ro-2') },
  { name: '1ro-2-midrun', size: [1366, 768], go: url('/nivel/1ro-2'), run: (p) => runProgram(p, loop(4, ['right', 'up']), 3000) },
  { name: '1ro-2-crash', size: [1366, 768], go: url('/nivel/1ro-2'), run: (p) => runProgram(p, loop(4, ['up', 'right']), 1500) },
  {
    name: '1ro-2-help', size: [1366, 768], go: url('/nivel/1ro-2'),
    run: async (p) => { await cam(p, (x) => window.__camino.setProgram(x), loop(2, ['right', 'up'])); await p.waitForTimeout(400); await cam(p, () => window.__camino.help()); await p.waitForTimeout(1500); },
  },
  { name: '2do-1-idle', size: [1366, 768], go: url('/nivel/2do-1') },
  { name: '2do-1-1280', size: [1280, 800], go: url('/nivel/2do-1'), run: async (p) => { await cam(p, (x) => window.__camino.setProgram(x), loop('goal', ['ifrock:right', 'right'])); await p.waitForTimeout(500); } },
  { name: '2do-1-fogrun', size: [1366, 768], go: url('/nivel/2do-1'), run: (p) => runProgram(p, loop('goal', ['ifrock:right', 'right']), Number(process.env.RUN_MS ?? 3200)) },
  { name: '2do-1-crash', size: [1366, 768], go: url('/nivel/2do-1'), run: (p) => runProgram(p, loop('goal', ['right']), 4200) },
  { name: '2do-1-win', size: [1366, 768], go: url('/nivel/2do-1'), run: (p) => runProgram(p, loop('goal', ['ifrock:right', 'right']), 9500) },
  { name: '2do-2-idle', size: [1366, 768], go: url('/nivel/2do-2') },
  { name: '2do-2-midrun', size: [1366, 768], go: url('/nivel/2do-2'), run: (p) => runProgram(p, loop('goal', ['ifrock:right', 'right']), 2600) },
  { name: '2do-2-fail', size: [1366, 768], go: url('/nivel/2do-2'), run: (p) => runProgram(p, loop('goal', ['right', 'ifrock:right']), 9000) },
  { name: '2do-2-win', size: [1280, 800], go: url('/nivel/2do-2'), run: (p) => runProgram(p, loop('goal', ['ifrock:right', 'right']), 12000) },
].map((s) => ({ ...s, name: `t2-${s.name}` }));

/** 3ro: every 150 ms, press the arrow towards the seed that lands first (like the tests' player). */
const chase = async (p, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await cam(p, () => {
      const c = window.__camino, s = c.sim();
      if (!c.running() || s.busy || s.queue.length) return;
      const t = s.seeds.filter((f) => !f.touched).sort((a, b) => b.y - a.y)[0];
      if (t && t.c !== s.robot.c) c.press(t.c > s.robot.c ? 'right' : 'left');
    });
    await p.waitForTimeout(150);
  }
};
const R = (d) => ({ hat: `key:${d}`, actions: [d] });
const ARROWS4 = ['left', 'up', 'down', 'right'].map(R);
const TOUCH = { hat: 'touch:seed', actions: ['score'] };
const PATH1 = ['up', 'up', 'right', 'right', 'right', 'down', 'right', 'right', 'up', 'up'];

const T3 = [
  { name: 'home-1366', size: [1366, 768], go: url('/', '&stamps=sala4-1,sala4-2,sala5-1,sala5-2,1ro-1,1ro-2,2do-1,2do-2,3ro-1') },
  { name: 'home-1280', size: [1280, 800], go: url('/') },
  { name: '3ro-1-idle', size: [1366, 768], go: url('/nivel/3ro-1', '&nointro') },
  { name: '3ro-1-intro', size: [1366, 768], go: url('/nivel/3ro-1'), run: async (p) => { await p.waitForTimeout(Number(process.env.INTRO_MS ?? 2600)); } },
  { name: '3ro-1-intro-end', size: [1366, 768], go: url('/nivel/3ro-1'), run: async (p) => { await p.waitForTimeout(8000); } },
  {
    name: '3ro-1-shrug', size: [1366, 768], go: url('/nivel/3ro-1', '&nointro'),
    run: async (p) => {
      await cam(p, (x) => window.__camino.setRules(x), [R('right')]);
      await p.waitForTimeout(300); await cam(p, () => window.__camino.start());
      await cam(p, () => window.__camino.press('right')); await p.waitForTimeout(900);
      await cam(p, () => window.__camino.press('up')); await p.waitForTimeout(Number(process.env.SHRUG_MS ?? 380));
    },
  },
  {
    name: '3ro-1-running', size: [1280, 800], go: url('/nivel/3ro-1', '&nointro'),
    run: async (p) => {
      await cam(p, (x) => window.__camino.setRules(x), [R('right'), R('up')]);
      await p.waitForTimeout(300); await cam(p, () => window.__camino.start());
      for (const d of ['up', 'up', 'right']) { await cam(p, (x) => window.__camino.press(x), d); await p.waitForTimeout(620); }
      await cam(p, () => window.__camino.press('right')); await p.waitForTimeout(200);
    },
  },
  {
    name: '3ro-1-win', size: [1366, 768], go: url('/nivel/3ro-1', '&nointro'),
    run: async (p) => {
      await cam(p, (x) => window.__camino.setRules(x), ARROWS4);
      await p.waitForTimeout(300); await cam(p, () => window.__camino.start());
      for (const d of PATH1) { await cam(p, (x) => window.__camino.press(x), d); await p.waitForTimeout(620); }
      await p.waitForTimeout(1400);
    },
  },
  { name: '3ro-1-help', size: [1366, 768], go: url('/nivel/3ro-1', '&nointro'), run: async (p) => { await cam(p, (x) => window.__camino.setRules(x), [R('right')]); await p.waitForTimeout(300); await cam(p, () => window.__camino.help()); await p.waitForTimeout(1500); } },
  { name: '3ro-2-idle', size: [1366, 768], go: url('/nivel/3ro-2') },
  {
    name: '3ro-2-nopoint', size: [1366, 768], go: url('/nivel/3ro-2'),
    run: async (p) => { await cam(p, () => window.__camino.start()); await chase(p, Number(process.env.NOPOINT_MS ?? 9200)); },
  },
  {
    name: '3ro-2-running', size: [1366, 768], go: url('/nivel/3ro-2'),
    run: async (p) => {
      await cam(p, (x) => window.__camino.setRules(x), [R('left'), R('right'), TOUCH]);
      await p.waitForTimeout(300); await cam(p, () => window.__camino.start()); await chase(p, Number(process.env.RUN_MS ?? 11000));
    },
  },
  {
    name: '3ro-2-win', size: [1280, 800], go: url('/nivel/3ro-2'),
    run: async (p) => {
      await cam(p, (x) => window.__camino.setRules(x), [R('left'), R('right'), TOUCH]);
      await p.waitForTimeout(300); await cam(p, () => window.__camino.start());
      for (let i = 0; i < 90 && !(await cam(p, () => window.__camino.sim().won)); i++) await chase(p, 1000);
      await p.waitForTimeout(1300);
    },
  },
  // T2 fixes: (a) the lone strip gets a sky, (b) the jump stays on the sheet, (c) the tape strip sits on the culprit, (d) stone stairs
  { name: 'fix-2do-1-idle', size: [1366, 768], go: url('/nivel/2do-1') },
  { name: 'fix-2do-1-jump', size: [1366, 768], go: url('/nivel/2do-1'), run: (p) => runProgram(p, loop('goal', ['ifrock:right', 'right']), Number(process.env.JUMP_MS ?? 4350)) },
  { name: 'fix-2do-2-jump', size: [1366, 768], go: url('/nivel/2do-2'), run: (p) => runProgram(p, loop('goal', ['ifrock:right', 'right']), Number(process.env.JUMP2_MS ?? 2050)) },
  { name: 'fix-2do-2-fail', size: [1366, 768], go: url('/nivel/2do-2'), run: (p) => runProgram(p, loop('goal', ['right', 'ifrock:right']), 9000) },
  { name: 'fix-1ro-2-idle', size: [1366, 768], go: url('/nivel/1ro-2') },
  { name: 'fix-1ro-2-midrun', size: [1280, 800], go: url('/nivel/1ro-2'), run: (p) => runProgram(p, loop(4, ['right', 'up']), 3000) },
].map((s) => ({ ...s, name: `t3-${s.name}` }));

// ---------------------------------------------------------------- 1ro's year: the map, the sheets, doors, boss, extras, dev
const solvedAll = (ids) => Object.fromEntries(ids.map((id) => [id, true]));
const core = (n, ks) => ks.map((k) => `1ro-h${n}-${k}`);
/** Sheets 1 and 2 done (with their bosses and a few extras), sheet 4 started, the teacher at sheet 6. */
const MIDYEAR = {
  v: 1, seeds: 17, opened: 6, character: 'brote',
  solved: solvedAll([...core(1, [1, 2, 3, 'jefe', 'easy-1', 'easy-2', 'medium-1']), ...core(2, [1, 2, 3, 4, 'jefe', 'easy-1', 'hard-1']), ...core(4, [1, 3])]),
};
const yr = (hash, q = '') => url(hash, q);

const P1 = [
  { name: 'map-fresh-1366', size: [1366, 768], go: yr('/1ro'), progress: null },
  { name: 'map-fresh-1280', size: [1280, 800], go: yr('/1ro'), progress: null },
  { name: 'map-progress-1366', size: [1366, 768], go: yr('/1ro'), progress: MIDYEAR },
  { name: 'map-progress-1280', size: [1280, 800], go: yr('/1ro'), progress: MIDYEAR },
  { name: 'home-1366', size: [1366, 768], go: url('/'), progress: null },
  { name: 'sheet1-core1', size: [1366, 768], go: yr('/1ro/hoja/1/1'), progress: null },
  { name: 'sheet2-core1', size: [1366, 768], go: yr('/1ro/hoja/2/1'), progress: MIDYEAR },
  { name: 'sheet4-core1', size: [1366, 768], go: yr('/1ro/hoja/4/1'), progress: MIDYEAR },
  { name: 'sheet6-core1', size: [1366, 768], go: yr('/1ro/hoja/6/1'), progress: MIDYEAR },
  { name: 'sheet8-core1', size: [1366, 768], go: yr('/1ro/hoja/8/1'), progress: MIDYEAR },
  { name: 'sheet6-core1-1280', size: [1280, 800], go: yr('/1ro/hoja/6/1'), progress: MIDYEAR },
  { name: 'sheet2-long-12', size: [1366, 768], go: yr('/1ro/hoja/2/jefe'), progress: MIDYEAR },
  {
    name: 'sheet1-win', size: [1366, 768], go: yr('/1ro/hoja/1/1'), progress: null,
    run: async (p) => { await cam(p, () => window.__camino.setProgram(window.__camino.level.solution)); await p.waitForTimeout(400); cam(p, () => { void window.__camino.run(); }); await p.waitForTimeout(6500); },
  },
  {
    name: 'sheet6-intro', size: [1366, 768], go: yr('/1ro/hoja/6/1'), progress: MIDYEAR,
    run: async (p) => { for (const id of ['right', 'up', 'right']) { await cam(p, (x) => window.__camino.tapPalette(x), id); await p.waitForTimeout(380); } await p.waitForTimeout(Number(process.env.INTRO_MS ?? 4200)); },
  },
  { name: 'doors', size: [1366, 768], go: yr('/1ro/hoja/2/puertas'), progress: MIDYEAR },
  { name: 'doors-shut-1280', size: [1280, 800], go: yr('/1ro/hoja/4/puertas'), progress: { ...MIDYEAR, solved: solvedAll(core(4, [1])) } },
  { name: 'boss', size: [1366, 768], go: yr('/1ro/hoja/6/jefe'), progress: MIDYEAR },
  { name: 'extra-easy', size: [1366, 768], go: yr('/1ro/hoja/4/puerta/facil/1'), progress: MIDYEAR },
  { name: 'extra-medium', size: [1366, 768], go: yr('/1ro/hoja/6/puerta/media/1'), progress: MIDYEAR },
  { name: 'extra-hard', size: [1366, 768], go: yr('/1ro/hoja/8/puerta/dificil/1'), progress: MIDYEAR },
  { name: 'extra-hard-seq', size: [1280, 800], go: yr('/1ro/hoja/2/puerta/dificil/2'), progress: MIDYEAR },
  { name: 'dev-open', size: [1366, 768], go: yr('/1ro/hoja/6/puerta/media/1', '&dev'), progress: MIDYEAR },
  { name: 'dev-map', size: [1280, 800], go: yr('/1ro', '&dev'), progress: MIDYEAR },
  { name: 'soon', size: [1366, 768], go: yr('/1ro/hoja/17', '&dev'), progress: MIDYEAR },
].map((s) => ({ ...s, name: `p1-${s.name}` }));

// ---------------------------------------------------------------- 1ro's year, T2: the formats, sheets 3, 5, 10–13, the river
/** Waits until the page is not running (a run, Brote's reaction, a ghost demo). */
const idle = async (p, after = 0) => {
  await p.waitForTimeout(250);
  await p.waitForFunction(() => !document.querySelector('.level[data-busy]'), null, { timeout: 40000 });
  await p.waitForTimeout(after);
};
/** Presses ▶ on the page (the real button) without waiting. */
const play = (p) => p.click('.btn-play', { force: true });
/** Sets the page's reference program through the ?debug hooks and runs it to the end. */
const solveHere = async (p, after = 600) => {
  await cam(p, () => window.__camino.setProgram(window.__camino.level.solution));
  await p.waitForTimeout(400);
  await play(p);
  await idle(p, after);
};
/** Sheets 1–5 done (bosses of 1 and 2 too), sheet 10's first page, 11's first page in gold; the teacher at sheet 13. */
const LATE = {
  v: 1, seeds: 36, opened: 13, character: 'brote',
  solved: solvedAll([
    ...core(1, [1, 2, 3, 'jefe']), ...core(2, [1, 2, 3, 4, 'jefe']), ...core(3, [1, 2, 3, 4]), ...core(4, [1, 2, 3]),
    ...core(5, [1, 2, 3, 4]), ...core(6, [1, 2, 3, 4]), ...core(8, [1, 2, 3]), ...core(10, [1, 3]), ...core(11, [1]),
  ]),
  gold: solvedAll(core(11, [1])),
};
const FRESH = { v: 1, seeds: 12, opened: 17, character: 'brote', solved: {}, gold: {} };

const P2 = [
  { name: 'map-1366', size: [1366, 768], go: yr('/1ro'), progress: LATE },
  { name: 'map-1280', size: [1280, 800], go: yr('/1ro'), progress: LATE },
  // the first page of each sheet built in T2
  ...[3, 5, 10, 11, 12, 13].map((n) => ({ name: `sheet${n}-core1`, size: [1366, 768], go: yr(`/1ro/hoja/${n}/1`), progress: FRESH })),
  // fix: idle, the culprit shaking, a block taken out (its line stays), won
  { name: 'fix-idle', size: [1366, 768], go: yr('/1ro/hoja/3/1'), progress: FRESH },
  {
    name: 'fix-culprit', size: [1366, 768], go: yr('/1ro/hoja/3/1'), progress: FRESH,
    run: async (p) => { await play(p); await p.waitForSelector('.blk.is-culprit', { timeout: 20000 }); await p.waitForTimeout(Number(process.env.SHAKE_MS ?? 160)); },
  },
  {
    name: 'fix-hole-1280', size: [1280, 800], go: yr('/1ro/hoja/12/2'), progress: FRESH,
    run: async (p) => { await play(p); await idle(p, 200); await p.click('.zone-program [data-ref="0:2"]', { force: true }); await p.waitForTimeout(700); },
  },
  {
    name: 'fix-won', size: [1366, 768], go: yr('/1ro/hoja/12/3'), progress: FRESH,
    run: async (p) => { await p.click('.zone-program [data-ref="0:1"]', { force: true }); await p.waitForTimeout(400); await p.click('.zone-palette [data-cmd="down"]', { force: true }); await p.waitForTimeout(400); await play(p); await idle(p, 700); },
  },
  // complete: a missing count, the count set and the passes filling, holes before and after the repeat
  { name: 'complete-idle', size: [1366, 768], go: yr('/1ro/hoja/5/1'), progress: FRESH },
  {
    name: 'complete-midrun', size: [1366, 768], go: yr('/1ro/hoja/5/1'), progress: FRESH,
    run: async (p) => { for (let i = 0; i < 4; i++) { await p.click('.zone-program .tape-count', { force: true }); await p.waitForTimeout(260); } await play(p); await p.waitForTimeout(Number(process.env.RUN_MS ?? 2300)); },
  },
  {
    name: 'complete-won', size: [1366, 768], go: yr('/1ro/hoja/5/3'), progress: FRESH,
    run: async (p) => { await p.click('.zone-program .tape-count', { force: true }); await p.waitForTimeout(260); await p.click('.zone-program .tape-count', { force: true }); await p.waitForTimeout(260); await play(p); await idle(p, 700); },
  },
  {
    name: 'complete-holes-1280', size: [1280, 800], go: yr('/1ro/hoja/13/1'), progress: FRESH,
    run: async (p) => { await p.click('.zone-palette [data-cmd="up"]', { force: true }); await p.waitForTimeout(400); await play(p); await p.waitForTimeout(400); },
  },
  // predict: idle, a guess, a wrong guess after the run, a right one
  { name: 'predict-idle', size: [1366, 768], go: yr('/1ro/hoja/3/2'), progress: FRESH },
  {
    name: 'predict-guess', size: [1366, 768], go: yr('/1ro/hoja/3/4'), progress: FRESH,
    run: async (p) => { await p.click('.board [data-cell="1,0"]', { force: true }); await p.mouse.move(5, 5); await p.waitForTimeout(700); },
  },
  {
    name: 'predict-missed', size: [1366, 768], go: yr('/1ro/hoja/3/2'), progress: FRESH,
    run: async (p) => { await p.click('.board [data-cell="2,2"]', { force: true }); await p.mouse.move(5, 5); await p.waitForTimeout(400); await play(p); await idle(p, 0); await p.waitForTimeout(Number(process.env.MISS_MS ?? 0)); },
  },
  {
    name: 'predict-won', size: [1366, 768], go: yr('/1ro/hoja/3/2'), progress: FRESH,
    run: async (p) => { await p.click('.board [data-cell="3,2"]', { force: true }); await p.mouse.move(5, 5); await p.waitForTimeout(400); await play(p); await idle(p, 900); },
  },
  {
    name: 'predict-loop-1280', size: [1280, 800], go: yr('/1ro/hoja/5/2'), progress: FRESH,
    run: async (p) => { await p.click('.board [data-cell="4,1"]', { force: true }); await p.mouse.move(5, 5); await p.waitForTimeout(400); await play(p); await p.waitForTimeout(Number(process.env.RUN_MS ?? 2100)); },
  },
  // save blocks: the gold seal offered after a win, the challenge with the child's plan, the gold stamp
  { name: 'save-seal', size: [1366, 768], go: yr('/1ro/hoja/11/2'), progress: FRESH, run: (p) => solveHere(p, 900) },
  { name: 'save-gold-page', size: [1366, 768], go: yr('/1ro/hoja/11/2/oro'), progress: LATE },
  { name: 'save-gold-won', size: [1366, 768], go: yr('/1ro/hoja/11/2/oro'), progress: LATE, run: (p) => solveHere(p, 900) },
  { name: 'save-gold-1280', size: [1280, 800], go: yr('/1ro/hoja/11/jefe/oro'), progress: LATE },
  // the river
  { name: 'river-zigzag', size: [1366, 768], go: yr('/1ro/hoja/10/3'), progress: FRESH },
  { name: 'river-stream', size: [1366, 768], go: yr('/1ro/hoja/10/4'), progress: FRESH },
  { name: 'river-boss', size: [1366, 768], go: yr('/1ro/hoja/12/jefe'), progress: FRESH },
  { name: 'river-doors', size: [1366, 768], go: yr('/1ro/hoja/10/puertas'), progress: LATE },
  // one extra per new family
  { name: 'extra-fix', size: [1366, 768], go: yr('/1ro/hoja/3/puerta/media/1'), progress: LATE },
  { name: 'extra-predict', size: [1366, 768], go: yr('/1ro/hoja/3/puerta/media/2'), progress: LATE },
  { name: 'extra-complete', size: [1366, 768], go: yr('/1ro/hoja/5/puerta/media/1'), progress: LATE },
  { name: 'extra-complete-card', size: [1366, 768], go: yr('/1ro/hoja/13/puerta/media/2'), progress: LATE },
  { name: 'extra-fix-river', size: [1366, 768], go: yr('/1ro/hoja/12/puerta/media/1'), progress: LATE },
  { name: 'extra-save', size: [1366, 768], go: yr('/1ro/hoja/11/puerta/media/1'), progress: LATE },
  { name: 'extra-around', size: [1366, 768], go: yr('/1ro/hoja/13/puerta/dificil/1'), progress: LATE },
  // the bar at 1280 (sheet 2: three seeds, four pages, the doors, the boss, the pouch)
  { name: 'bar-sheet2-1280', size: [1280, 800], go: yr('/1ro/hoja/2/3'), progress: LATE },
  { name: 'bar-sheet2-boss-1280', size: [1280, 800], go: yr('/1ro/hoja/2/jefe'), progress: LATE },
  { name: 'dev-gold', size: [1366, 768], go: yr('/1ro/hoja/11/1/oro', '&dev'), progress: LATE },
].map((s) => ({ ...s, name: `p2-${s.name}` }));

// ---------------------------------------------------------------- 1ro's year, T3a: the music recess (sheet 9) and the guardas (sheet 14)
const notes = (...ts) => ts.map((t) => ({ t: 'cmd', cmd: t === 'rest' ? 'rest' : `note:${t}` }));
const nloop = (count, ...ts) => ({ t: 'loop', count, body: ts.map((t) => (t === 'rest' ? 'rest' : `note:${t}`)) });
const cmds = (...ds) => ds.map((cmd) => ({ t: 'cmd', cmd }));
const ALMENA = ['up', 'right', 'down', 'right'];
/** Sets a program through the ?debug hooks and presses ▶ (the real button), waiting `ms` (or until the page is idle). */
const runIt = async (p, program, ms) => {
  await cam(p, (x) => window.__camino.setProgram(x), program);
  await p.waitForTimeout(400);
  await play(p);
  if (ms == null) await idle(p, 700); else await p.waitForTimeout(ms);
};
/** Everything up to sheet 13 done, the teacher at sheet 17: the map shows 9 and 14 built. */
const T3A = {
  v: 1, seeds: 58, opened: 17, character: 'brote',
  solved: solvedAll([
    ...core(1, [1, 2, 3, 'jefe']), ...core(2, [1, 2, 3, 4]), ...core(3, [1, 2, 3, 4]), ...core(4, [1, 2, 3]), ...core(5, [1, 2, 3, 4]),
    ...core(6, [1, 2, 3, 4]), ...core(8, [1, 2, 3]), ...core(9, [1, 2, 3, 4, 'jefe']), ...core(10, [1, 2, 3, 4]), ...core(11, [1, 2, 3, 4]),
    ...core(12, [1, 2, 3, 4]), ...core(13, [1, 2, 3, 4]),
  ]),
  gold: {},
};

const P3A = [
  { name: 'map-1366', size: [1366, 768], go: yr('/1ro'), progress: T3A },
  // 9 · música: the copy page idle, listening, mid-run, a wrong note, won
  { name: 'm9-copy-idle', size: [1366, 768], go: yr('/1ro/hoja/9/1'), progress: FRESH },
  { name: 'm9-copy-listen', size: [1366, 768], go: yr('/1ro/hoja/9/1'), progress: FRESH, run: async (p) => { await p.click('.song-strip', { force: true }); await p.waitForTimeout(Number(process.env.LISTEN_MS ?? 1500)); } },
  { name: 'm9-copy-midrun', size: [1366, 768], go: yr('/1ro/hoja/9/1'), progress: FRESH, run: (p) => runIt(p, notes('do', 're', 'mi', 'do'), Number(process.env.RUN_MS ?? 2250)) },
  { name: 'm9-copy-wrong', size: [1366, 768], go: yr('/1ro/hoja/9/1'), progress: FRESH, run: async (p) => { await runIt(p, notes('do', 're', 'do', 'mi'), 0); await p.waitForSelector('.blk.is-culprit', { timeout: 20000 }); await p.waitForTimeout(Number(process.env.SHAKE_MS ?? 160)); } },
  { name: 'm9-copy-won', size: [1366, 768], go: yr('/1ro/hoja/9/1'), progress: FRESH, run: (p) => runIt(p, notes('do', 're', 'mi', 'do')) },
  { name: 'm9-copy-1280', size: [1280, 800], go: yr('/1ro/hoja/9/1'), progress: FRESH, run: async (p) => { await cam(p, (x) => window.__camino.setProgram(x), notes('do', 're')); await p.waitForTimeout(500); } },
  // the chorus in a repeat
  { name: 'm9-chorus-idle', size: [1366, 768], go: yr('/1ro/hoja/9/2'), progress: FRESH },
  { name: 'm9-chorus-midrun', size: [1366, 768], go: yr('/1ro/hoja/9/2'), progress: FRESH, run: (p) => runIt(p, [nloop(3, 'do', 'mi', 'sol', 'mi')], Number(process.env.RUN_MS ?? 4000)) },
  { name: 'm9-chorus-won', size: [1366, 768], go: yr('/1ro/hoja/9/2'), progress: FRESH, run: (p) => runIt(p, [nloop(3, 'do', 'mi', 'sol', 'mi')]) },
  // how many times: the count missing, too few passes, the right count
  { name: 'm9-count-idle', size: [1366, 768], go: yr('/1ro/hoja/9/3'), progress: FRESH },
  { name: 'm9-count-short', size: [1366, 768], go: yr('/1ro/hoja/9/3'), progress: FRESH, run: async (p) => { for (let i = 0; i < 2; i++) { await p.click('.zone-program .tape-count', { force: true }); await p.waitForTimeout(260); } await play(p); await idle(p, 300); } },
  { name: 'm9-count-won', size: [1366, 768], go: yr('/1ro/hoja/9/3'), progress: FRESH, run: async (p) => { for (let i = 0; i < 3; i++) { await p.click('.zone-program .tape-count', { force: true }); await p.waitForTimeout(260); } await play(p); await idle(p, 700); } },
  // a free song, written on the strip as it is played
  { name: 'm9-free-idle', size: [1366, 768], go: yr('/1ro/hoja/9/4'), progress: FRESH },
  { name: 'm9-free-played', size: [1366, 768], go: yr('/1ro/hoja/9/4'), progress: FRESH, run: (p) => runIt(p, [notes('sol')[0], nloop(3, 'mi', 'rest', 'do'), ...notes('re', 'do')]) },
  // Martinillo
  { name: 'm9-boss-idle', size: [1366, 768], go: yr('/1ro/hoja/9/jefe'), progress: FRESH },
  { name: 'm9-boss-midrun', size: [1366, 768], go: yr('/1ro/hoja/9/jefe'), progress: FRESH, run: (p) => runIt(p, [nloop(2, 'do', 're', 'mi', 'do'), nloop(2, 'mi', 'fa', 'sol', 'rest')], Number(process.env.RUN_MS ?? 6000)) },
  { name: 'm9-boss-won', size: [1366, 768], go: yr('/1ro/hoja/9/jefe'), progress: FRESH, run: (p) => runIt(p, [nloop(2, 'do', 're', 'mi', 'do'), nloop(2, 'mi', 'fa', 'sol', 'rest')]) },
  // one extra behind each door, and the doors page
  { name: 'm9-extra-easy', size: [1366, 768], go: yr('/1ro/hoja/9/puerta/facil/1'), progress: T3A },
  { name: 'm9-extra-medium', size: [1366, 768], go: yr('/1ro/hoja/9/puerta/media/1'), progress: T3A },
  { name: 'm9-extra-hard', size: [1366, 768], go: yr('/1ro/hoja/9/puerta/dificil/1'), progress: T3A },
  { name: 'm9-doors', size: [1366, 768], go: yr('/1ro/hoja/9/puertas'), progress: T3A },
  // 14 · guardas: the first page idle, mid-run, a smudge, won; battlements with a repeat, short and won; the fence; the fix; the castle
  { name: 'g14-first-idle', size: [1366, 768], go: yr('/1ro/hoja/14/1'), progress: FRESH },
  { name: 'g14-first-midrun', size: [1366, 768], go: yr('/1ro/hoja/14/1'), progress: FRESH, run: (p) => runIt(p, cmds(...ALMENA, ...ALMENA), Number(process.env.RUN_MS ?? 3300)) },
  { name: 'g14-first-smudge', size: [1366, 768], go: yr('/1ro/hoja/14/1'), progress: FRESH, run: async (p) => { await runIt(p, cmds('up', 'right', 'down', 'right', 'up', 'up', 'right', 'down'), null); await p.waitForTimeout(200); } },
  { name: 'g14-first-won', size: [1366, 768], go: yr('/1ro/hoja/14/1'), progress: FRESH, run: (p) => runIt(p, cmds(...ALMENA, ...ALMENA)) },
  { name: 'g14-gold', size: [1366, 768], go: yr('/1ro/hoja/14/1/oro'), progress: T3A },
  { name: 'g14-gold-won', size: [1366, 768], go: yr('/1ro/hoja/14/1/oro'), progress: T3A, run: (p) => runIt(p, [{ t: 'loop', count: 2, body: ALMENA }]) },
  { name: 'g14-first-1280', size: [1280, 800], go: yr('/1ro/hoja/14/1'), progress: FRESH, run: async (p) => { await cam(p, (x) => window.__camino.setProgram(x), cmds('up', 'right', 'down')); await p.waitForTimeout(500); } },
  { name: 'g14-almenas-idle', size: [1366, 768], go: yr('/1ro/hoja/14/2'), progress: FRESH },
  { name: 'g14-almenas-short', size: [1366, 768], go: yr('/1ro/hoja/14/2'), progress: FRESH, run: (p) => runIt(p, [{ t: 'loop', count: 3, body: ALMENA }], null) },
  { name: 'g14-almenas-won', size: [1366, 768], go: yr('/1ro/hoja/14/2'), progress: FRESH, run: (p) => runIt(p, [{ t: 'loop', count: 4, body: ALMENA }]) },
  { name: 'g14-fence-midrun', size: [1366, 768], go: yr('/1ro/hoja/14/3'), progress: FRESH, run: (p) => runIt(p, [{ t: 'loop', count: 4, body: ['up', 'right', 'down'] }], Number(process.env.RUN_MS ?? 4200)) },
  { name: 'g14-fence-won', size: [1366, 768], go: yr('/1ro/hoja/14/3'), progress: FRESH, run: (p) => runIt(p, [{ t: 'loop', count: 4, body: ['up', 'right', 'down'] }]) },
  { name: 'g14-fix-idle', size: [1366, 768], go: yr('/1ro/hoja/14/4'), progress: FRESH },
  { name: 'g14-fix-smudge', size: [1366, 768], go: yr('/1ro/hoja/14/4'), progress: FRESH, run: async (p) => { await play(p); await p.waitForSelector('.blk.is-culprit', { timeout: 20000 }); await p.waitForTimeout(Number(process.env.SHAKE_MS ?? 160)); } },
  { name: 'g14-fix-won', size: [1366, 768], go: yr('/1ro/hoja/14/4'), progress: FRESH, run: async (p) => { await p.click('.zone-program [data-ref="0:3"]', { force: true }); await p.waitForTimeout(400); await p.click('.zone-palette [data-cmd="down"]', { force: true }); await p.waitForTimeout(400); await play(p); await idle(p, 900); } },
  { name: 'g14-boss-idle', size: [1366, 768], go: yr('/1ro/hoja/14/jefe'), progress: FRESH },
  { name: 'g14-boss-won', size: [1366, 768], go: yr('/1ro/hoja/14/jefe'), progress: FRESH, run: (p) => runIt(p, [...cmds('up', 'up'), { t: 'loop', count: 3, body: ['right', 'down', 'right', 'up'] }, ...cmds('down', 'down')]) },
  { name: 'g14-extra-easy', size: [1366, 768], go: yr('/1ro/hoja/14/puerta/facil/1'), progress: T3A },
  { name: 'g14-extra-medium', size: [1366, 768], go: yr('/1ro/hoja/14/puerta/media/1'), progress: T3A },
  { name: 'g14-extra-hard', size: [1366, 768], go: yr('/1ro/hoja/14/puerta/dificil/1'), progress: T3A },
  { name: 'g14-doors', size: [1366, 768], go: yr('/1ro/hoja/14/puertas'), progress: { ...T3A, solved: { ...T3A.solved, ...solvedAll(core(14, [1, 2])) } } },
].map((s) => ({ ...s, name: `p3a-${s.name}` }));

// ---------------------------------------------------------------- 1ro's year, T3b: the workshops (7, 15), the corkboard, the comodín (16)
/** Every sheet of pages done up to 14 (the gold of none), the teacher at 17: the map shows 7, 15 and 16 built, Brote waits on 7. */
const T3B = { ...T3A, seeds: 64, solved: { ...T3A.solved, ...solvedAll(core(14, [1, 2, 3, 4])) } };
/** A level being made on the first workshop: rocks round a seed, the pot in a corner. */
const EDIT7 = { board: { start: [0, 3], seed: [2, 1], goal: [5, 0], rocks: [[1, 2], [2, 2], [4, 1], [4, 0], [3, 3]] }, lines: 5 };
/** A level of the limited workshop with too many lines: a plan without repeat fits them. */
const FLAT15 = { board: { start: [0, 3], seed: [2, 3], goal: [5, 3], rocks: [[1, 1], [4, 1]] }, lines: 6 };
/** A zigzag that needs three lines with a repeat, on two. */
const MORE15 = { board: { start: [0, 0], seed: [2, 1], goal: [4, 2], rocks: [[3, 0], [1, 1], [5, 1]] }, lines: 2 };
/** One level pinned from each workshop, played on this device, and a few classmates' levels played. */
const MINE = [
  { id: 'yo-1', sheet: 7, board: EDIT7.board, lines: 10, solution: cmds('up', 'up', 'right', 'right', 'right', 'down', 'right', 'right', 'up', 'up') },
  { id: 'yo-2', sheet: 15, board: { start: [0, 0], seed: [5, 0], goal: [5, 3], rocks: [[2, 2]] }, lines: 2, solution: [{ t: 'loop', count: 5, body: ['right'] }, { t: 'loop', count: 3, body: ['down'] }] },
];
const CORK = { ...T3B, made: MINE, plays: { 'yo-1': 3, 'ej-2': 2, 'ej-6': 1 }, solved: { ...T3B.solved, '1ro-c-yo-1': true, '1ro-c-yo-2': true, '1ro-c-ej-2': true, '1ro-c-ej-6': true } };
/** The comodín with essential pages pending on sheets 3, 5, 10 and 12. */
const PENDING = { ...T3B, solved: Object.fromEntries(Object.entries(T3B.solved).filter(([k]) => !['1ro-h3-1', '1ro-h5-3', '1ro-h10-1', '1ro-h12-3'].includes(k))) };
const tapLine = (p, which) => p.click(`[data-lines-btn="${which}"]`, { force: true });
/** Sets the page's reference program through the ?debug hooks and presses ▶, waiting `ms` (or until the page is idle). */
const runSolution = async (p, ms) => {
  await cam(p, () => window.__camino.setProgram(window.__camino.level.solution));
  await p.waitForTimeout(400);
  await play(p);
  if (ms == null) await idle(p, 700); else await p.waitForTimeout(ms);
};

const P3B = [
  { name: 'map-1366', size: [1366, 768], go: yr('/1ro'), progress: T3B },
  // 7 · the first workshop: the guided start, a new level, one being made, its test (mid-run and won), pinned
  { name: 's7-intro', size: [1366, 768], go: yr('/1ro/hoja/7'), progress: T3B, run: async (p) => { await p.waitForTimeout(Number(process.env.INTRO_MS ?? 1500)); } },
  { name: 's7-editor-new', size: [1366, 768], go: yr('/1ro/hoja/7/taller'), progress: { ...T3B, drafts: { 7: { board: { start: [0, 2], seed: [2, 1], goal: [5, 2], rocks: [] }, lines: 5 } } } },
  { name: 's7-editor-level', size: [1366, 768], go: yr('/1ro/hoja/7/taller'), progress: { ...T3B, drafts: { 7: EDIT7 } } },
  { name: 's7-editor-level-1280', size: [1280, 800], go: yr('/1ro/hoja/7/taller'), progress: { ...T3B, drafts: { 7: EDIT7 } } },
  {
    name: 's7-editor-refused', size: [1366, 768], go: yr('/1ro/hoja/7/taller'), progress: { ...T3B, drafts: { 7: { ...EDIT7, board: { ...EDIT7.board, rocks: [...EDIT7.board.rocks, [5, 1]] } } } },
    run: async (p) => { await play(p); await p.waitForTimeout(Number(process.env.REFUSE_MS ?? 700)); },
  },
  {
    name: 's7-testing', size: [1366, 768], go: yr('/1ro/hoja/7/taller/probar'), progress: { ...T3B, drafts: { 7: EDIT7 } },
    run: (p) => runIt(p, MINE[0].solution, Number(process.env.RUN_MS ?? 4200)),
  },
  { name: 's7-proven', size: [1366, 768], go: yr('/1ro/hoja/7/taller/probar'), progress: { ...T3B, drafts: { 7: EDIT7 } }, run: (p) => runIt(p, MINE[0].solution) },
  {
    name: 's7-published', size: [1366, 768], go: yr('/1ro/hoja/7/taller/probar'), progress: { ...T3B, drafts: { 7: EDIT7 } },
    run: async (p) => { await runIt(p, MINE[0].solution); await p.click('.next-page', { force: true }); await p.waitForTimeout(Number(process.env.PIN_MS ?? 1300)); },
  },
  // the corkboard, and a classmate's level being played
  { name: 'cork-1366', size: [1366, 768], go: yr('/1ro/hoja/7/cartelera'), progress: CORK },
  { name: 'cork-1280', size: [1280, 800], go: yr('/1ro/hoja/7/cartelera'), progress: CORK },
  { name: 'card-playing', size: [1366, 768], go: yr('/1ro/hoja/7/cartelera/ej-2'), progress: CORK, run: (p) => runSolution(p, Number(process.env.RUN_MS ?? 3600)) },
  { name: 'card-won', size: [1366, 768], go: yr('/1ro/hoja/15/cartelera/ej-8'), progress: CORK, run: (p) => runSolution(p) },
  // 15 · the limited workshop: the notebook's lines, the refusals, the test page with repetir
  { name: 's15-editor', size: [1366, 768], go: yr('/1ro/hoja/15/taller'), progress: { ...T3B, drafts: { 15: { board: { start: [0, 3], seed: [2, 3], goal: [5, 3], rocks: [] }, lines: 2 } } } },
  { name: 's15-editor-1280', size: [1280, 800], go: yr('/1ro/hoja/15/taller'), progress: { ...T3B, drafts: { 15: FLAT15 } } },
  { name: 's15-needs-repeat', size: [1366, 768], go: yr('/1ro/hoja/15/taller'), progress: { ...T3B, drafts: { 15: FLAT15 } }, run: async (p) => { await play(p); await p.waitForTimeout(Number(process.env.REFUSE_MS ?? 900)); } },
  { name: 's15-needs-lines', size: [1366, 768], go: yr('/1ro/hoja/15/taller'), progress: { ...T3B, drafts: { 15: MORE15 } }, run: async (p) => { await play(p); await p.waitForTimeout(Number(process.env.REFUSE_MS ?? 600)); } },
  {
    name: 's15-fewer-lines', size: [1366, 768], go: yr('/1ro/hoja/15/taller'), progress: { ...T3B, drafts: { 15: FLAT15 } },
    run: async (p) => { await play(p); await idle(p, 300); for (let i = 0; i < 4; i++) { await tapLine(p, 'less'); await p.waitForTimeout(250); } await p.waitForTimeout(400); },
  },
  {
    name: 's15-testing', size: [1366, 768], go: yr('/1ro/hoja/15/taller/probar'), progress: { ...T3B, drafts: { 15: { ...FLAT15, lines: 2 } } },
    run: (p) => runIt(p, [{ t: 'loop', count: 5, body: ['right'] }], Number(process.env.RUN_MS ?? 2600)),
  },
  // 16 · the comodín: its three choices, the bridge (pages pending, or a review page), the free song
  { name: 's16-hub', size: [1366, 768], go: yr('/1ro/hoja/16'), progress: PENDING },
  { name: 's16-hub-1280', size: [1280, 800], go: yr('/1ro/hoja/16'), progress: { ...CORK, goals: { '1ro-h16-musica': true } } },
  { name: 's16-bridge', size: [1366, 768], go: yr('/1ro/hoja/16/recuperar'), progress: PENDING },
  { name: 's16-bridge-review', size: [1366, 768], go: yr('/1ro/hoja/16/recuperar'), progress: T3B },
  { name: 's16-pending-page', size: [1366, 768], go: yr('/1ro/hoja/16/recuperar/3/1'), progress: PENDING },
  { name: 's16-music', size: [1366, 768], go: yr('/1ro/hoja/16/musica'), progress: PENDING },
  { name: 'dev-workshop', size: [1366, 768], go: yr('/1ro/hoja/15/taller', '&dev'), progress: CORK },
].map((s) => ({ ...s, name: `p3b-${s.name}` }));

const S = [...T1, ...T2, ...T3, ...P1, ...P2, ...P3A, ...P3B];

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
try {
  for (const s of S.filter((x) => x.name.includes(only))) {
    const errs = [];
    const page = await browser.newPage({ viewport: { width: s.size[0], height: s.size[1] }, deviceScaleFactor: 1 });
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(e.message));
    if (s.progress !== undefined) {
      await page.addInitScript((p) => { try { localStorage.clear(); if (p) localStorage.setItem('camino.progress.v1', p); } catch { /* no storage */ } }, s.progress ? JSON.stringify(s.progress) : '');
    }
    await page.goto(s.go);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    if (s.run) await s.run(page);
    const file = `${out}/${s.name}.png`;
    await page.screenshot({ path: file });
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.documentElement.scrollHeight, document.documentElement.clientHeight]);
    console.log(file, 'scrollW/clientW', `${sw[0]}/${sw[1]}`, 'scrollH/clientH', `${sw[2]}/${sw[3]}`, errs.length ? `ERRORS: ${errs.join(' | ')}` : 'no console errors');
    await page.close();
  }
} finally {
  await browser.close();
}
