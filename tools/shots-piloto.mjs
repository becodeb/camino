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
/** The tool check's first page, by the real UI from the character. */
async function toTool(p) {
  await toCharacter(p);
  await p.waitForTimeout(500);
  await p.locator('.choice-btn').nth(2).click();
  await p.waitForTimeout(600);
  await p.locator('.doors-next').click({ force: true });
  await p.waitForSelector('main.level[data-level="tool-1"]');
  await p.waitForTimeout(400);
}
const tapArrow = async (p) => { await p.locator('.zone-palette [data-cmd="right"]').first().click(); await p.waitForTimeout(300); };
/** Drags the palette's arrow into the notebook with the mouse. */
async function dragArrow(p) {
  const f = await p.locator('.zone-palette [data-cmd="right"]').first().boundingBox();
  const t = await p.locator('.zone-program').boundingBox();
  const [fx, fy] = [f.x + f.width / 2, f.y + f.height / 2];
  await p.mouse.move(fx, fy); await p.mouse.down(); await p.mouse.move(fx + 30, fy + 10, { steps: 4 });
  await p.mouse.move(t.x + t.width / 2, t.y + 140, { steps: 12 }); await p.mouse.up();
  await p.waitForTimeout(400);
}
/** The tool check's second page: tap, ▶, and the first page's win. */
async function toToolPage2(p) {
  await toTool(p);
  await tapArrow(p);
  await p.waitForTimeout(900);
  await p.click('.btn-play');
  await p.waitForSelector('main.level[data-level="tool-2"]', { timeout: 20_000 });
  await p.waitForTimeout(500);
}
/** A rung of the ladder's item bank (the debug hook), after the character. */
async function toRung(p, rung, extra = '') {
  if (extra) await p.goto(`${base}?debug&${extra}#/piloto`);
  await toCharacter(p);
  await p.waitForTimeout(500);
  await p.locator('.choice-btn').nth(2).click();
  await p.waitForTimeout(400);
  await jump(p, 'ladder');
  await p.waitForSelector('main.level');
  await pil(p, (r) => window.__ladder.go(r), rung);
  await p.waitForTimeout(1500);
}
async function helps(p, n) {
  for (let i = 0; i < n; i++) { await p.click('.level-bar .help'); await p.waitForTimeout(i < n - 1 ? 3300 : 300); }
}
async function toLevel(p) {
  await toCharacter(p);
  await p.waitForTimeout(500);
  await p.locator('.choice-btn').nth(2).click();
  await p.waitForTimeout(400);
  await jump(p, 'ladder');
  await p.waitForSelector('main.level');
  await p.waitForTimeout(900);
}

/** Free play's menu for a grade (the character picked, the steps before skipped). */
async function toFreePlay(p, grade = '1ro', who = 'pliegue', query = '') {
  if (query) await p.goto(`${base}?debug&${query}#/piloto`);
  await setup(p, grade);
  await p.getByRole('button', { name: 'Empezar' }).click();
  await p.waitForSelector('.choice-row');
  await p.waitForTimeout(500);
  await p.locator(`[data-choice-char="${who}"]`).click();
  await p.waitForTimeout(400);
  await jump(p, 'free_play');
  await p.waitForSelector('.pp-menu');
  await p.waitForTimeout(900);
}
/** Picks a free-play card (a real tap) and waits for its first page. */
async function pickCard(p, id, wait = 'main') {
  await p.locator(`.pp-fp-card[data-activity="${id}"]`).click();
  await p.waitForSelector(`.pp-fp-activity[data-activity="${id}"] ${wait}`);
  await p.waitForTimeout(1600);
}
/** Solves the level page on screen with its reference solution and turns it. */
async function solveTurn(p) {
  await p.waitForTimeout(600);
  await pil(p, () => { window.__camino.setProgram(window.__camino.level.solution); });
  await p.waitForTimeout(250);
  await pil(p, () => window.__camino.run());
  await p.locator('.next-page').click({ force: true, timeout: 30_000 });
  await p.waitForTimeout(700);
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
  { name: 'pp-level', run: async (p) => { await toLevel(p); } },
  { name: 'pp-help1', run: async (p) => { await toLevel(p); await p.click('.level-bar .help'); await p.waitForTimeout(700); } },
  {
    name: 'pp-help3',
    run: async (p) => {
      await toLevel(p);
      for (let i = 0; i < 2; i++) { await p.click('.level-bar .help'); await p.waitForTimeout(3200); }
      await p.click('.level-bar .help');
      await p.waitForTimeout(1900);
    },
  },
  {
    name: 'pp-hand',
    run: async (p) => {
      await toLevel(p);
      const b = await p.locator('.level-bar .help').boundingBox();
      await hold(p, b.x + b.width / 2, b.y + b.height / 2, 1300);
      await p.waitForTimeout(900);
    },
  },
  {
    name: 'pp-hand-panel',
    run: async (p) => {
      await toLevel(p);
      const b = await p.locator('.level-bar .help').boundingBox();
      await hold(p, b.x + b.width / 2, b.y + b.height / 2, 1300);
      await p.waitForTimeout(800);
      const h = await p.locator('.pp-hand').boundingBox();
      await hold(p, h.x + h.width / 2, h.y + h.height / 2, 1500);
      await p.waitForTimeout(300);
    },
  },
  {
    name: 'pp-survey-liked',
    run: async (p) => { await toLevel(p); await pil(p, () => window.__piloto.endNow()); await p.waitForSelector('.pp-survey'); await p.waitForTimeout(700); },
  },
  {
    name: 'pp-survey-difficulty',
    run: async (p) => { await toLevel(p); await pil(p, () => window.__piloto.endNow()); await p.click('[data-answer="yes"]'); await p.waitForTimeout(1600); },
  },
  {
    name: 'pp-survey-favorite',
    run: async (p) => {
      await toLevel(p); await pil(p, () => window.__piloto.endNow());
      await p.click('[data-answer="yes"]'); await p.waitForTimeout(1400);
      await p.click('[data-answer="hard"]'); await p.waitForTimeout(1600);
    },
  },
  {
    name: 'pp-survey-again',
    run: async (p) => {
      await toLevel(p); await pil(p, () => window.__piloto.endNow());
      await p.click('[data-answer="mid"]'); await p.waitForTimeout(1400);
      await p.click('[data-answer="easy"]'); await p.waitForTimeout(1400);
      await p.click('[data-question="favorite_activity"] .pp-option >> nth=1'); await p.waitForTimeout(1400);
      await p.click('[data-answer="yes"]'); await p.waitForTimeout(500);
    },
  },
  {
    name: 'pp-goodbye',
    run: async (p) => {
      await toLevel(p);
      await pil(p, () => { window.__camino.setProgram(window.__camino.level.solution); });
      await p.waitForTimeout(300);
      await pil(p, () => window.__camino.run());
      await p.waitForTimeout(800);
      await p.locator('.next-page').click({ force: true });
      await p.waitForTimeout(900);
      await jump(p, 'survey');
      for (const a of ['yes', 'easy']) { await p.click(`[data-answer="${a}"]`); await p.waitForTimeout(1400); }
      await p.click('[data-question="favorite_activity"] .pp-option >> nth=0'); await p.waitForTimeout(1400);
      await p.click('[data-answer="yes"]'); await p.waitForTimeout(1500);
      await p.waitForSelector('.pp-bye'); await p.waitForTimeout(1500);
    },
  },
  {
    name: 'pp-adult-form',
    run: async (p) => {
      await toCharacter(p); await jump(p, 'goodbye'); await p.waitForSelector('.pp-bye');
      await p.click('.pp-for-adult');
      await p.click('[data-value="high"]'); await p.click('[data-value="some"]');
      await p.fill('.pp-comment textarea', 'Arrastró sin problemas; pidió ayuda con la consigna.');
    },
  },
  { name: 'pp-soon', run: async (p) => { await toCharacter(p); await jump(p, 'free_play'); await p.waitForTimeout(500); } },
  // ---------------------------------------------------------------- T4: the tool check
  { name: 'pp-tool-tap', run: async (p) => { await toTool(p); await p.waitForTimeout(1200); } },
  { name: 'pp-tool-play', run: async (p) => { await toTool(p); await tapArrow(p); await p.waitForTimeout(1300); } },
  { name: 'pp-tool-drag', run: async (p) => { await toToolPage2(p); await p.waitForTimeout(1300); } },
  { name: 'pp-tool-reset', run: async (p) => { await toToolPage2(p); await dragArrow(p); await p.waitForTimeout(1300); } },
  {
    name: 'pp-tool-help',
    run: async (p) => { await toToolPage2(p); await dragArrow(p); await p.waitForTimeout(900); await p.click('.btn-restart'); await p.waitForTimeout(1400); },
  },
  // the drag not done in 20 s: the ghost hand shows it, mid-way
  { name: 'pp-tool-ghost', run: async (p) => { await toToolPage2(p); await p.waitForTimeout(20_000 + 1300); } },
  // ---------------------------------------------------------------- T4: the ladder, one item of each kind of board
  { name: 'pp-ladder-sequence', run: async (p) => { await toRung(p, 1); } },
  { name: 'pp-ladder-fix', run: async (p) => { await toRung(p, 3); } },
  { name: 'pp-ladder-predict', run: async (p) => { await toRung(p, 4); } },
  { name: 'pp-ladder-repeat', run: async (p) => { await toRung(p, 5); } },
  { name: 'pp-ladder-count', run: async (p) => { await toRung(p, 6); } },
  { name: 'pp-ladder-pattern', run: async (p) => { await toRung(p, 7); } },
  { name: 'pp-ladder-fog', run: async (p) => { await toRung(p, 9); } },
  { name: 'pp-ladder-fog-prints', run: async (p) => { await toRung(p, 9); await helps(p, 3); await p.waitForTimeout(1600); } },
  { name: 'pp-ladder-worlds', run: async (p) => { await toRung(p, 10); } },
  { name: 'pp-ladder-worlds-prints', run: async (p) => { await toRung(p, 10); await helps(p, 3); await p.waitForTimeout(2000); } },
  { name: 'pp-ladder-rules', run: async (p) => { await toRung(p, 11, 'nointro'); } },
  { name: 'pp-ladder-score', run: async (p) => { await toRung(p, 12); await p.click('.btn-play'); await p.waitForTimeout(3500); } },
  {
    name: 'pp-ladder-walk',
    run: async (p) => {
      await toRung(p, 1);
      await pil(p, () => { window.__camino.setProgram(window.__camino.level.solution); });
      await p.waitForTimeout(300);
      await pil(p, () => window.__camino.run());
      await p.locator('.next-page').click({ force: true, timeout: 20_000 });
      await p.waitForSelector('[data-interlude="walk"]');
      await p.waitForTimeout(1700);
    },
  },
  {
    name: 'pp-ladder-cheer',
    run: async (p) => {
      // 1ro fails rung 1 (two bumps): nothing below, the ladder stops with the cheer
      await toRung(p, 1);
      for (let i = 0; i < 2; i++) {
        await pil(p, () => { window.__camino.setProgram([{ t: 'cmd', cmd: 'up' }]); });
        await p.waitForTimeout(200);
        await pil(p, () => window.__camino.run());
        await p.waitForFunction(() => document.querySelector('main.level')?.dataset.busy !== 'true', null, { timeout: 20_000 });
        await p.waitForTimeout(600);
      }
      await p.waitForSelector('[data-interlude="cheer"]');
      await p.waitForTimeout(2200);
    },
  },
  // ---------------------------------------------------------------- T5: free play
  { name: 'pp-fp-menu-1ro', run: async (p) => { await toFreePlay(p, '1ro'); } },
  { name: 'pp-fp-menu-3ro', run: async (p) => { await toFreePlay(p, '3ro'); } },
  { name: 'pp-fp-menu-5to', run: async (p) => { await toFreePlay(p, '5to'); } },
  { name: 'pp-fp-1ro-sheet', run: async (p) => { await toFreePlay(p); await pickCard(p, 'sheet', 'main.level[data-level]'); } },
  {
    name: 'pp-fp-1ro-doors',
    run: async (p) => {
      await toFreePlay(p);
      await pickCard(p, 'sheet', 'main.level[data-level]');
      // the sheet's core pages, solved one after the other, lead to the doors
      for (let i = 0; i < 8 && !(await p.locator('.mode-doors').count()); i++) await solveTurn(p);
      await p.waitForSelector('.mode-doors');
      await p.waitForTimeout(1500);
    },
  },
  { name: 'pp-fp-1ro-recess', run: async (p) => { await toFreePlay(p); await pickCard(p, 'recess', 'main.level[data-level]'); } },
  { name: 'pp-fp-1ro-guardas', run: async (p) => { await toFreePlay(p); await pickCard(p, 'guardas', 'main.level[data-level]'); } },
  { name: 'pp-fp-1ro-editor', run: async (p) => { await toFreePlay(p); await pickCard(p, 'editor', 'main'); await p.waitForTimeout(3000); } },
  { name: 'pp-fp-3ro-rules', run: async (p) => { await toFreePlay(p, '3ro', 'pliegue', 'nointro'); await pickCard(p, 'rule_game', 'main.level[data-level]'); } },
  { name: 'pp-fp-3ro-sheet', run: async (p) => { await toFreePlay(p, '3ro'); await pickCard(p, 'sheet', 'main.level[data-level]'); } },
  { name: 'pp-fp-5to-editor', run: async (p) => { await toFreePlay(p, '5to'); await pickCard(p, 'editor', 'main'); await p.waitForTimeout(3000); } },
  {
    name: 'pp-fp-over',
    run: async (p) => {
      await toFreePlay(p);
      await pil(p, () => window.__freePlay.budget(0));
      await p.waitForSelector('[data-interlude="cheer"]', { timeout: 15_000 });
      await p.waitForTimeout(2200);
    },
  },
  // the spoken-name check: Mina chosen, a page whose title says the character's name
  { name: 'pp-fp-name-mina', run: async (p) => { await toFreePlay(p, '3ro', 'mina', 'nointro'); await pickCard(p, 'rule_game', 'main.level[data-level]'); } },
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
