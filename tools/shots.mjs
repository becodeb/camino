// Screenshot tour with Playwright driving the system Chromium (no bundled browser needed).
// PW=/tmp/pw node tools/shots.mjs <outDir> [base] [only]
//   T1 scenarios are named t1-*, T2 scenarios t2-*, T3 scenarios t3-* (so `only=t2-` shoots the T2 tour);
//   1ro's year (feature primer-grado) is p1-*.
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
  { name: 'soon', size: [1366, 768], go: yr('/1ro/hoja/5', '&dev'), progress: MIDYEAR },
].map((s) => ({ ...s, name: `p1-${s.name}` }));

const S = [...T1, ...T2, ...T3, ...P1];

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
