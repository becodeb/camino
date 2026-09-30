// Scripted browser check of the dev drawer's "Presentación" row: each preset replaces the saved
// progress and opens the forest map in the state it promises.
// PW=/tmp/pw node tools/check-presets.mjs [base]
import { createRequire } from 'node:module';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const [base = 'http://127.0.0.1:8797/'] = process.argv.slice(2);
const fail = (msg) => { console.error(`FAIL ${msg}`); process.exitCode = 1; throw new Error(msg); };
const ok = (msg) => console.log(`ok   ${msg}`);

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const count = (sel) => page.locator(sel).count();
  const seeds = () => page.evaluate(() => Number(document.querySelector('.seed-pouch')?.getAttribute('data-count')));
  const hash = () => page.evaluate(() => location.hash);

  await page.goto(`${base}?dev#/1ro`);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.waitForTimeout(800);

  /** Opens the drawer if needed, taps a preset and waits for the map. */
  const apply = async (id) => {
    if (!(await page.locator(`[data-dev-preset="${id}"]`).isVisible())) {
      await page.keyboard.press('Backquote');
      await page.waitForTimeout(300);
    }
    await page.click(`[data-dev-preset="${id}"]`);
    for (let i = 0; i < 20 && (await hash()) !== '#/1ro'; i++) await page.waitForTimeout(100);
    if ((await hash()) !== '#/1ro') fail(`preset ${id} should open the map, at ${await hash()}`);
    // the map is already on #/1ro before the tap, so the hash alone says nothing: give the store and the
    // pouch time to show the new progress
    await page.waitForTimeout(1500);
  };

  await apply('full');
  const fullStamps = await count('.stop.is-done .map-stamp');
  if (fullStamps !== 16) fail(`"Año completo" should stamp 16 stops (all but the showcase), stamps ${fullStamps}`);
  if ((await seeds()) !== 150) fail(`"Año completo" should hold 150 seeds, holds ${await seeds()}`);
  ok(`"Año completo": ${fullStamps} stamped stops, 150 seeds, on the map`);

  await apply('mid');
  const midStamps = await count('.stop.is-done .map-stamp');
  const midDone = await page.evaluate(() => [...document.querySelectorAll('.stop.is-done')].map((el) => Number(el.getAttribute('data-sheet'))).sort((a, b) => a - b));
  if (JSON.stringify(midDone) !== JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8])) fail(`"Mitad de año" should finish sheets 1–8, finishes ${midDone.join(',')}`);
  ok(`"Mitad de año": sheets ${midDone.join(', ')} stamped (${midStamps} stamps), ${await seeds()} seeds`);

  await apply('start');
  if (await count('.map-stamp')) fail('"Arranque" should leave no stamps');
  if ((await seeds()) !== 0) fail(`"Arranque" should hold 0 seeds, holds ${await seeds()}`);
  await page.click('.stop.is-here[data-sheet="1"]');
  for (let i = 0; i < 20 && (await hash()) !== '#/1ro/hoja/1/personaje'; i++) await page.waitForTimeout(100);
  if ((await hash()) !== '#/1ro/hoja/1/personaje') fail(`"Arranque": sheet 1 should open on the character choice, at ${await hash()}`);
  ok('"Arranque": no stamps, 0 seeds, sheet 1 opens on the character choice');

  if (errors.length) fail(`console errors: ${errors.join(' | ')}`);
  ok('no console errors');
} finally {
  await browser.close();
}
