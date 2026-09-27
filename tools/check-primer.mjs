// Scripted browser check of 1ro's year (feature primer-grado) through the real UI: the home's 1ro
// tab opens the map; a core level is solved with taps and a drag and its seed lands in the pouch;
// finishing the core stamps the sheet on the map; the dev drawer jumps and marks levels solved;
// a reload keeps the progress; cleared or blocked storage does not break the app.
// Exits non-zero on the first failure.
// PW=/tmp/pw node tools/check-primer.mjs [base]
import { createRequire } from 'node:module';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const [base = 'http://127.0.0.1:8797/'] = process.argv.slice(2);
const fail = (msg) => { console.error(`FAIL ${msg}`); process.exitCode = 1; throw new Error(msg); };
const ok = (msg) => console.log(`ok   ${msg}`);

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
};

try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  watch(page);
  const hash = () => page.evaluate(() => location.hash);
  const seeds = () => page.evaluate(() => Number(document.querySelector('.seed-pouch')?.getAttribute('data-count')));
  const count = (sel) => page.locator(sel).count();
  // the "next page" button bobs forever (it waits for the child): no stable box, so it is clicked without waiting for one
  const tap = async (sel) => { await page.click(sel, { force: sel === '.next-page' }); await page.waitForTimeout(260); };
  const expectHash = async (want, what) => {
    for (let i = 0; i < 20 && (await hash()) !== want; i++) await page.waitForTimeout(100);
    const h = await hash();
    if (h !== want) fail(`${what}: expected ${want}, at ${h}`);
  };
  const drag = async (from, to) => {
    const a = await page.locator(from).boundingBox(), b = await page.locator(to).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    const tx = b.x + b.width / 2, ty = b.y + b.height / 2;
    for (let i = 1; i <= 14; i++) await page.mouse.move(a.x + a.width / 2 + ((tx - a.x - a.width / 2) * i) / 14, a.y + a.height / 2 + ((ty - a.y - a.height / 2) * i) / 14);
    await page.mouse.up();
    await page.waitForTimeout(350);
  };
  /** Builds the page's reference plan in the notebook (the first card dragged, the rest tapped) and presses ▶. */
  const solveByHand = async ({ dragFirst }) => {
    const plan = await page.evaluate(() => window.__camino.level.solution.map((it) => it.cmd));
    for (const [i, cmd] of plan.entries()) {
      if (i === 0 && dragFirst) await drag(`.zone-palette [data-cmd="${cmd}"]`, '.zone-program [data-key="end0"]');
      else await tap(`.zone-palette [data-cmd="${cmd}"]`);
    }
    const built = await page.evaluate(() => window.__camino.program.map((it) => it.cmd));
    if (JSON.stringify(built) !== JSON.stringify(plan)) fail(`the notebook should hold ${plan.join(' ')}, holds ${built.join(' ')}`);
    await tap('.btn-play');
    await page.waitForSelector('.next-page', { timeout: 25000 });
    await page.waitForTimeout(1400); // the seed flies into the pouch
  };

  // ---------------------------------------------------------------- a fresh start, from the home page
  await page.goto(`${base}?debug#/`);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.waitForTimeout(800);
  await tap('.book-tab.is-year');
  await expectHash('#/1ro', 'the home\'s 1ro tab');
  if (!(await count('.stop.is-here[data-sheet="1"]'))) fail('Brote should wait on sheet 1');
  if (await count('a.stop[data-sheet="2"]')) fail('sheet 2 should wait for the teacher (not a link)');
  if (await count('.map-stamp')) fail('a fresh map has no stamps');
  if ((await seeds()) !== 0) fail('a fresh pouch is empty');
  ok('the home\'s 1ro tab opens the map: Brote on sheet 1, sheet 2 waits, no stamps, 0 seeds');

  // ---------------------------------------------------------------- solve the first pages through the real UI
  await tap('a.stop[data-sheet="1"]');
  await expectHash('#/1ro/hoja/1/1', 'sheet 1 opens on its first page');
  await page.waitForTimeout(900);
  await solveByHand({ dragFirst: false });
  if ((await seeds()) !== 1) fail(`the pouch should hold 1 seed after the first page, holds ${await seeds()}`);
  if (!(await count('.sheet-pages a[data-core="1"] .stamp'))) fail('page 1 should be stamped in the bar');
  ok('page 1 solved with taps and ▶: stamped in the bar, the seed count rose to 1');

  await tap('.next-page');
  await expectHash('#/1ro/hoja/1/2', 'next page');
  await page.waitForTimeout(900);
  await solveByHand({ dragFirst: true });
  if ((await seeds()) !== 2) fail(`2 seeds expected, ${await seeds()}`);
  ok('page 2 solved (the first block dragged): 2 seeds');

  // ---------------------------------------------------------------- the dev drawer: mark page 3 solved, skip to the doors
  await tap('.sheet-pages a[data-core="3"]');
  await expectHash('#/1ro/hoja/1/3', 'page 3 from the bar');
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(300);
  if (!(await count('.dev-drawer'))) fail('the ` key should open the dev drawer');
  if ((await page.textContent('[data-dev="level-id"]')) !== '1ro-h1-3') fail('the drawer should show the level id');
  await tap('.dev-drawer button:has-text("marcar resuelto")');
  await page.waitForTimeout(1200);
  if ((await seeds()) !== 3) fail(`3 seeds expected after marking page 3, ${await seeds()}`);
  await tap('.dev-drawer button:has-text("saltar")');
  await expectHash('#/1ro/hoja/1/puertas', 'skip after the last page');
  if ((await count('a.door-btn')) !== 3 || (await count('a.boss-btn')) !== 1) fail('the three doors and the boss should be open');
  ok('the dev drawer (` key) shows the id, marks page 3 solved (3 seeds) and skips to the open doors');

  // the doors page: a door opens its first extra
  await page.locator('a.door-btn[data-door="easy"]').click();
  await expectHash('#/1ro/hoja/1/puerta/facil/1', 'the easy door');
  if (!/^\d+$/.test(await page.textContent('[data-dev="seed"]'))) fail('an extra shows its generator seed');
  ok('the easy door opens its first generated extra (the drawer shows its seed)');

  // ---------------------------------------------------------------- the map: sheet 1 stamped
  await tap('.quit');
  await expectHash('#/1ro', '"salir" from a sheet');
  if (!(await count('.stop.is-done[data-sheet="1"] .map-stamp'))) fail('sheet 1 should be stamped on the map');
  ok('finishing the core stamps sheet 1 on the map');

  // ---------------------------------------------------------------- dev jumps: any sheet, the boss, a door
  await tap('.dev-sheets a[data-dev-sheet="6"]');
  await expectHash('#/1ro/hoja/6/1', 'a dev jump to sheet 6');
  await tap('.dev-drawer a[data-dev-boss]');
  await expectHash('#/1ro/hoja/6/jefe', 'a dev jump to the boss');
  if (!(await count('.level.is-boss .boss-frame'))) fail('the boss page should have its frame');
  if ((await page.textContent('[data-dev="level-id"]')) !== '1ro-h6-jefe') fail('the drawer shows the boss id');
  await tap('.dev-drawer a[data-dev-door="hard"]');
  await expectHash('#/1ro/hoja/6/puerta/dificil/1', 'a dev jump to the hard door');
  await tap('.dev-sheets a[data-dev-sheet="12"]');
  await expectHash('#/1ro/hoja/12', 'a dev jump to a sheet not built yet');
  if (!(await count('.soon'))) fail('sheet 12 should show its "próximamente" page');
  ok('dev jumps: sheet 6, its boss (framed), its hard door, and sheet 12 (próximamente)');
  await tap('.dev-drawer button:has-text("apagar")');

  // ---------------------------------------------------------------- a reload keeps the progress
  await page.goto(`${base}?debug#/1ro`);
  await page.reload();
  await page.waitForTimeout(900);
  if ((await seeds()) !== 3) fail(`after a reload the pouch should hold 3, holds ${await seeds()}`);
  if (!(await count('.stop.is-done[data-sheet="1"]'))) fail('after a reload sheet 1 is still stamped');
  if (await count('.dev-drawer')) fail('dev mode was turned off');
  ok('a reload keeps the seeds and the stamp');

  // ---------------------------------------------------------------- cleared storage: a fresh start, nothing breaks
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(900);
  if ((await seeds()) !== 0 || (await count('.map-stamp'))) fail('cleared storage should start the year again');
  await tap('a.stop[data-sheet="1"]');
  await expectHash('#/1ro/hoja/1/1', 'sheet 1 after clearing');
  if (!(await count('.btn-play'))) fail('the level page should load');
  ok('cleared storage starts the year again and the pages still load');

  // ---------------------------------------------------------------- blocked storage: the app plays in memory
  const blocked = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  watch(blocked);
  await blocked.addInitScript(() => {
    const deny = () => { throw new DOMException('blocked', 'SecurityError'); };
    for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(window, name, { get: deny, configurable: true });
  });
  await blocked.goto(`${base}?debug#/1ro/hoja/1/1`);
  await blocked.waitForTimeout(1200);
  const plan = await blocked.evaluate(() => window.__camino.level.solution.map((it) => it.cmd));
  for (const cmd of plan) { await blocked.click(`.zone-palette [data-cmd="${cmd}"]`); await blocked.waitForTimeout(260); }
  await blocked.click('.btn-play');
  await blocked.waitForSelector('.next-page', { timeout: 25000 });
  await blocked.waitForTimeout(1400);
  const n = await blocked.evaluate(() => Number(document.querySelector('.seed-pouch')?.getAttribute('data-count')));
  if (n !== 1) fail(`with storage blocked the seed is still counted in memory, got ${n}`);
  ok('with storage blocked the page plays and counts the seed in memory');

  if (errors.length) fail(`console errors: ${errors.join(' | ')}`);
  ok('no console errors');
} finally {
  await browser.close();
}
