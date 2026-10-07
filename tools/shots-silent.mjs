// T20/T21 (silent classroom round, 1ro first): a screenshot tour of the
// muted 1ro route, the real way a child opens it — the bookmark link
// (`?grado=1&sonido=no`), no `?debug` quirks beyond the automation hooks
// every shots-*.mjs tool already uses to jump around.
//
// PW=<dir with playwright> node tools/shots-silent.mjs <outDir> [base] [only]
//   base: the app serving the VITE_PLAYTEST build (node server/index.ts), default http://127.0.0.1:8810/
//   only: run the scenarios whose name contains this text.
// Every scenario runs at 1366×768 and 1280×800. Fails on console errors.
import { createRequire } from 'node:module';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const [out = '.', base = 'http://127.0.0.1:8810/', only = ''] = process.argv.slice(2);
const SIZES = (process.env.SIZES ?? '1366x768,1280x800').split(',').map((x) => x.split('x').map(Number));

const pil = (p, js, arg) => p.evaluate(js, arg);
const jump = (p, step) => pil(p, (s) => window.__piloto.jump(s), step);

/** The bookmark link: `?grado=1&sonido=no`, lands on the character step with no grade cards (T19/T18). */
async function toCharacter(p) {
  await p.goto(`${base}?debug&grado=1&sonido=no#/piloto`);
  await p.waitForSelector('.choice-row', { timeout: 20_000 });
}
async function pickCharacter(p) {
  await toCharacter(p);
  await p.waitForTimeout(500);
  await p.locator('.choice-btn').nth(2).click();
  await p.waitForTimeout(400);
}
async function toTool(p) {
  await pickCharacter(p);
  await p.waitForTimeout(600);
  await p.locator('.doors-next').click({ force: true });
  await p.waitForSelector('main.level[data-level="tool-1"]', { timeout: 20_000 });
}
async function toRung(p, rung) {
  await pickCharacter(p);
  await jump(p, 'ladder');
  await p.waitForSelector('main.level');
  await pil(p, (r) => window.__ladder.go(r), rung);
  await p.waitForTimeout(400);
}
async function toFreePlay(p) {
  await pickCharacter(p);
  await jump(p, 'free_play');
  await p.waitForSelector('.pp-menu');
  await p.waitForTimeout(600);
}
async function toTyping(p) {
  await pickCharacter(p);
  await jump(p, 'typing');
  await p.waitForSelector('.pp-typing');
  await p.waitForFunction(() => window.__typing?.state().phase === 'play', null, { timeout: 20_000 }).catch(() => {});
}
/** The wardrobe after a few sheet pages solved in free play (seeds for the hooks to show). */
async function toWardrobe(p) {
  await toFreePlay(p);
  await p.locator('.pp-fp-card[data-activity="sheet"]').click();
  await p.waitForSelector('.pp-fp-activity[data-activity="sheet"] main.level[data-level]');
  await p.waitForTimeout(600);
  for (let i = 0; i < 4; i++) {
    await pil(p, () => { window.__camino.setProgram(window.__camino.level.solution); });
    await p.waitForTimeout(250);
    await pil(p, () => window.__camino.run());
    await p.waitForTimeout(700);
    await p.locator('.next-page').click({ force: true, timeout: 30_000 });
    await p.waitForTimeout(600);
  }
  await jump(p, 'wardrobe');
  await p.waitForSelector('.mode-wardrobe .hooks');
  await p.waitForTimeout(800);
}

const SCENARIOS = [
  // the bookmark's very first screen: on-screen text forced on, capital letters (grade 1)
  { name: 'ps-character', run: async (p) => { await toCharacter(p); await p.waitForTimeout(900); } },
  { name: 'ps-tool', run: async (p) => { await toTool(p); await p.waitForTimeout(700); } },
  // a level left untouched for ~16s: the idle nudge (✋ pulses, the goal glows)
  { name: 'ps-tool-idle', run: async (p) => { await toTool(p); await p.waitForTimeout(16_500); } },
  // the wordless demos, caught mid-play (never the solution)
  { name: 'ps-l1-path-demo', run: async (p) => { await toRung(p, 1); await p.waitForTimeout(2600); } },
  { name: 'ps-l1-path-after', run: async (p) => { await toRung(p, 1); await p.waitForTimeout(4600); } },
  { name: 'ps-l3-fix-demo', run: async (p) => { await toRung(p, 3); await p.waitForTimeout(3300); } },
  { name: 'ps-l4-predict-demo', run: async (p) => { await toRung(p, 4); await p.waitForTimeout(2200); } },
  { name: 'ps-l5-repeat-demo', run: async (p) => { await toRung(p, 5); await p.waitForTimeout(500); } },
  { name: 'ps-l6-count', run: async (p) => { await toRung(p, 6); await p.waitForTimeout(500); } },
  { name: 'ps-l9-fog', run: async (p) => { await toRung(p, 9); await p.waitForTimeout(500); } },
  { name: 'ps-l10-worlds-demo', run: async (p) => { await toRung(p, 10); await p.waitForTimeout(2200); } },
  // free play: 1ro's menu while muted, no recess (music) card
  { name: 'ps-freeplay-menu', run: async (p) => { await toFreePlay(p); } },
  { name: 'ps-typing', run: async (p) => { await toTyping(p); await p.waitForTimeout(1500); } },
  { name: 'ps-wardrobe', run: async (p) => { await toWardrobe(p); } },
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
console.log(failed ? `${failed} scenario(s) failed` : 'all scenarios ok');
process.exit(failed ? 1 : 0);
