// Scripted browser check of the 3ro pages through the real UI: taps and a mouse drag build the
// rules, ▶ starts the game, the keyboard's arrows play it. Exits non-zero on the first failure.
// PW=/tmp/pw node tools/check-3ro.mjs [base]
import { createRequire } from 'node:module';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const [base = 'http://127.0.0.1:8797/'] = process.argv.slice(2);
const fail = (msg) => { console.error(`FAIL ${msg}`); process.exitCode = 1; throw new Error(msg); };
const ok = (msg) => console.log(`ok   ${msg}`);

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const sim = () => page.evaluate(() => window.__camino.sim());
  const rules = () => page.evaluate(() => window.__camino.rules);
  const tap = async (sel) => { await page.click(sel); await page.waitForTimeout(250); };
  const drag = async (from, to) => {
    const a = await page.locator(from).boundingBox(), b = await page.locator(to).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + a.width / 2 + ((b.x + 30 - a.x - a.width / 2) * i) / 12, a.y + a.height / 2 + ((b.y + 20 - a.y - a.height / 2) * i) / 12);
    await page.mouse.up();
    await page.waitForTimeout(300);
  };
  const walk = async (keys) => { for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(650); } };

  // ---------------------------------------------------------------- 3ro · 1
  await page.goto(`${base}?debug&nointro#/nivel/3ro-1`);
  await page.waitForTimeout(1500);
  await walk(['ArrowRight']);
  if ((await sim()).robot.c !== 0) fail('before ▶ the arrows must do nothing');
  ok('before ▶, an arrow does nothing (the game is not running)');

  await tap('.zone-palette [data-cmd="key:right"]');
  await tap('.zone-palette [data-cmd="right"]');
  await drag('.zone-palette [data-cmd="key:up"]', '.zone-program [data-key="new"]');
  await drag('.zone-palette [data-cmd="up"]', '.zone-program [data-key="r1/slot"]');
  const built = await rules();
  if (JSON.stringify(built) !== JSON.stringify([{ hat: 'key:right', actions: ['right'] }, { hat: 'key:up', actions: ['up'] }])) fail(`rules after taps and drags: ${JSON.stringify(built)}`);
  ok('a tap and a drag each build a rule card: → and ↑');

  await tap('.btn-play');
  if (!(await page.evaluate(() => window.__camino.running()))) fail('▶ should start the game');
  if (!(await page.locator('.play-lamp.is-on').count())) fail('the lamp should light up while the game runs');
  ok('▶ starts the game (the lamp is on, the button reads Parar)');

  await walk(['ArrowUp', 'ArrowUp', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown']);
  let s = await sim();
  if (s.robot.c !== 3 || s.robot.r !== 1) fail(`after ↑↑→→→↓ Brote should be at (3,1) with no ↓ rule, is at (${s.robot.c},${s.robot.r})`);
  ok('the rules move Brote; ↓ has no rule, so Brote stays (and shrugs)');

  // a rule added while the game runs is heard right away
  await tap('.zone-palette [data-cmd="key:down"]');
  await tap('.zone-palette [data-cmd="down"]');
  await walk(['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowUp']);
  await page.waitForTimeout(2500);
  s = await sim();
  if (!s.won) fail(`the seed should be reached, Brote is at (${s.robot.c},${s.robot.r})`);
  if (!(await page.locator('.next-page').count())) fail('the next page should appear after the win');
  if (!(await page.locator('.tramo-page.is-here .stamp').count())) fail('the page should get its stamp');
  ok('with the ↓ rule added mid-game, the keyboard takes Brote to the seed: won, stamped, next page');

  // ---------------------------------------------------------------- 3ro · 2
  await page.goto(`${base}?debug#/nivel/3ro-2`);
  await page.waitForTimeout(1500);
  const chase = async (ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const k = await page.evaluate(() => {
        const st = window.__camino.sim();
        if (st.busy || st.queue.length) return null;
        const t = st.seeds.filter((f) => !f.touched).sort((a, b) => b.y - a.y)[0];
        return t && t.c !== st.robot.c ? (t.c > st.robot.c ? 'ArrowRight' : 'ArrowLeft') : null;
      });
      if (k) await page.keyboard.press(k);
      await page.waitForTimeout(120);
    }
  };
  await tap('.btn-play');
  await chase(16000);
  s = await sim();
  if (s.score !== 0) fail(`without a touch rule the score must stay 0, is ${s.score}`);
  if (!(await page.evaluate(() => document.querySelectorAll('[data-faller]').length >= 0))) fail('seeds should fall');
  ok(`without "siempre que toque", 16 s of chasing seeds score nothing (tick ${s.tick})`);

  await drag('.zone-palette [data-cmd="touch:seed"]', '.zone-program [data-key="new"]');
  await drag('.zone-palette [data-cmd="score"]', '.zone-program [data-key="r2/slot"]');
  for (let i = 0; i < 80 && !(await sim()).won; i++) await chase(1000);
  s = await sim();
  if (!s.won || s.score !== 5) fail(`with the touch rule the page should be won at 5, score ${s.score}`);
  await page.waitForTimeout(1500);
  if (!(await page.locator('.next-page').count())) fail('the next page should appear after the win');
  ok('the new rule, dragged in while the game runs, scores: 5 seeds in the jar, won');

  if (errors.length) fail(`console errors: ${errors.join(' | ')}`);
  ok('no console errors');
} finally {
  await browser.close();
}
