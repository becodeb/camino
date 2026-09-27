// Screenshot tour with Playwright driving the system Chromium (no bundled browser needed).
// PW=/tmp/pw node tools/shots.mjs <outDir> [base] [only]
//   T1 scenarios are named t1-*, T2 scenarios t2-* (so `only=t2-` shoots the T2 tour).
//   PW: a directory with playwright installed; base: the running app (default http://127.0.0.1:8797/)
//   only: run the scenarios whose name contains this text.
// Uses the ?debug hooks (window.__camino) to build programs and run them; waits in real time.
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

const S = [...T1, ...T2];

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
try {
  for (const s of S.filter((x) => x.name.includes(only))) {
    const errs = [];
    const page = await browser.newPage({ viewport: { width: s.size[0], height: s.size[1] }, deviceScaleFactor: 1 });
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(e.message));
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
