// Screenshot tour of the pilot playtest (#/piloto), scenario prefix pp-.
// PW=<dir with playwright> node tools/shots-piloto.mjs <outDir> [base] [only]
//   base: the running app (vite dev on 8811 with the /api proxy, or the API serving dist/), default http://127.0.0.1:8811/
//   only: run the scenarios whose name contains this text.
// Every scenario runs at 1366×768 and 1280×800 (suffixes -1366, -1280). Uses the ?debug hooks
// (window.__piloto for the flow, window.__camino for the level on screen). Fails on console errors.
import { createRequire } from 'node:module';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const [out = '.', base = 'http://127.0.0.1:8811/', only = ''] = process.argv.slice(2);
const SIZES = [[1366, 768], [1280, 800]];

/** The adult's setup, by the real UI: grade, division, consent, Empezar. */
async function setup(p, grade = '1ro', division = 'B') {
  await p.getByRole('button', { name: grade, exact: true }).click();
  if (division) await p.getByRole('button', { name: division, exact: true }).click();
  await p.getByRole('checkbox').click();
  await p.getByRole('button', { name: 'Empezar' }).click();
  await p.waitForSelector('.pp-code-word');
}
const pil = (p, js, arg) => p.evaluate(js, arg);
const jump = (p, step) => pil(p, (s) => window.__piloto.jump(s), step);
/** Holds the pointer at (x, y) for `ms`. */
async function hold(p, x, y, ms) {
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.waitForTimeout(ms);
  await p.mouse.up();
}
async function toCharacter(p) {
  await setup(p);
  await p.getByRole('button', { name: 'Empezar' }).click();
  await p.waitForSelector('.choice-row');
}
async function toLevel(p) {
  await toCharacter(p);
  await jump(p, 'ladder');
  await p.waitForSelector('main.level');
  await p.waitForTimeout(900);
}

const SCENARIOS = [
  { name: 'pp-setup', run: async (p) => { await p.waitForSelector('.pp-setup'); } },
  {
    name: 'pp-setup-filled',
    run: async (p) => {
      await p.getByRole('button', { name: '3ro', exact: true }).click();
      await p.getByRole('button', { name: 'C', exact: true }).click();
      await p.getByRole('checkbox').click();
    },
  },
  { name: 'pp-code', run: async (p) => { await setup(p); } },
  { name: 'pp-character', run: async (p) => { await toCharacter(p); await p.waitForTimeout(900); } },
  {
    name: 'pp-character-picked',
    run: async (p) => { await toCharacter(p); await p.waitForTimeout(700); await p.locator('.choice-btn').nth(1).click(); await p.waitForTimeout(1200); },
  },
  { name: 'pp-adult-menu', run: async (p) => { await toCharacter(p); await hold(p, 20, 20, 1700); await p.waitForTimeout(300); } },
  { name: 'pp-soon', run: async (p) => { await toCharacter(p); await jump(p, 'tool_check'); await p.waitForTimeout(500); } },
];

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
let failed = 0;
for (const sc of SCENARIOS.filter((s) => s.name.includes(only))) {
  for (const [w, h] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    const errors = [];
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(`${base}?debug#/piloto`);
    await p.waitForSelector('.piloto');
    try {
      await sc.run(p);
      await p.screenshot({ path: `${out}/${sc.name}-${w}.png` });
    } catch (e) {
      errors.push(String(e));
    }
    if (errors.length) { failed++; console.error(`${sc.name}-${w}:`, errors.join('\n  ')); } else console.log(`${sc.name}-${w} ok`);
    await ctx.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
