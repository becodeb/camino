// Scripted browser check of 1ro's year (feature primer-grado) through the real UI: the home's 1ro
// tab opens the map; a core level is solved with taps and a drag and its seed lands in the pouch;
// finishing the core stamps the sheet on the map; the dev drawer jumps and marks levels solved;
// a reload keeps the progress; cleared or blocked storage does not break the app.
// The practice formats (T2): a missing count is completed, a wrong block is fixed in place, a
// wrong and a right prediction, a gold stamp earned through the gold seal; a reload keeps them.
// The new mechanics (T3a): a song copied on the xylophone after listening to its strip, a wrong
// note that stops the song and names its card, a guarda drawn on squared paper, a wrong arrow that
// smudges it; a music page played with Web Audio missing or broken.
// The workshops (T3b): a level built with the editor's tools (taps and drags), refused while Brote
// cannot finish it, solved by its author and pinned on the corkboard; a classmate's card played
// twice (its play count rises); the limited workshop refuses a level without a repeat, then pins
// one that needs it; the comodín's bridge plays a pending essential page; a reload keeps it all.
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
  await tap('.dev-sheets a[data-dev-sheet="17"]');
  await expectHash('#/1ro/hoja/17', 'a dev jump to a sheet not built yet');
  if (!(await count('.soon'))) fail('sheet 17 should show its "próximamente" page');
  ok('dev jumps: sheet 6, its boss (framed), its hard door, and sheet 17 (próximamente)');
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

  // ---------------------------------------------------------------- the practice formats (T2), through the real UI
  /** Waits until the page is not running (a run and Brote's reaction). */
  const idle = async () => {
    await page.waitForTimeout(250);
    await page.waitForFunction(() => !document.querySelector('.level[data-busy]'), null, { timeout: 30000 });
    await page.waitForTimeout(300);
  };
  const program = () => page.evaluate(() => window.__camino.program);
  // things that call for a tap pulse forever: they are clicked without waiting for a stable box
  const press = async (sel) => { await page.click(sel, { force: true }); await page.waitForTimeout(280); };
  const open = async (hash) => { await page.goto(`${base}?debug#${hash}`); await page.waitForTimeout(1100); };
  const won = async () => { await page.waitForSelector('.next-page', { timeout: 30000 }); await page.waitForTimeout(1400); };
  let n0 = await seeds();

  // complete: the count is missing; ▶ does not run until it is there; four taps make 5, the dots follow
  await open('/1ro/hoja/5/1');
  if (!(await count('.zone-program .tape-count.is-empty'))) fail('sheet 5 page 1 should arrive with its count missing');
  if (await count('.zone-palette')) fail('a page missing only a count has nothing to bring (no palette)');
  await press('.btn-play');
  if (await count('.level[data-busy]')) fail('with the count missing ▶ should not run');
  for (let i = 0; i < 4; i++) await press('.zone-program .tape-count');
  const five = await program();
  if (five[0].count !== 5) fail(`four taps on a missing count should make 5, made ${five[0].count}`);
  if ((await count('.zone-program [data-pips="0"] circle')) !== 5) fail('the repeat should show five dots');
  if ((await page.textContent('.zone-program .tape-count')).trim() !== '5') fail('the count should read 5');
  await press('.btn-play');
  await won();
  if ((await seeds()) !== n0 + 1) fail(`completing the count should earn a seed (${n0} → ${await seeds()})`);
  ok('complete: the count arrives missing, ▶ waits for it, four taps make 5 (five dots), the run wins and earns a seed');

  // fix: the run bumps on the wrong arrow and it shakes; a tap takes it out (its line stays empty), a drag brings the right one
  n0 = await seeds();
  await open('/1ro/hoja/3/1');
  const given = await program();
  await press('.btn-play');
  await page.waitForSelector('.zone-program .blk.is-culprit', { timeout: 20000 });
  if ((await page.getAttribute('.zone-program .blk.is-culprit', 'data-ref')) !== '1') fail('the culprit should be the second arrow');
  await idle();
  await press('.zone-program [data-ref="1"]');
  const holed = await program();
  if (holed.length !== given.length || holed[1].cmd !== '') fail(`a tap should empty the line in place, got ${JSON.stringify(holed)}`);
  if (!(await count('.zone-program [data-hole="1"].is-active'))) fail('the emptied line should take the next block');
  await drag('.zone-palette [data-cmd="up"]', '.zone-program [data-hole="1"]');
  const fixed = await program();
  if (fixed[1].cmd !== 'up' || fixed.length !== given.length) fail(`the drag should fill the empty line with ↑, got ${JSON.stringify(fixed)}`);
  await press('.btn-play');
  await won();
  if ((await seeds()) !== n0 + 1) fail('fixing the arrow should earn a seed');
  ok('fix: the run bumps and the wrong arrow shakes; a tap leaves its line empty in place, a drag fills it with ↑, the run wins');

  // predict: ▶ first asks for a guess; a wrong guess plays and is not won; the right one is won
  n0 = await seeds();
  await open('/1ro/hoja/3/2');
  await press('.btn-play');
  if (await count('.level[data-busy]')) fail('▶ without a guess should not run');
  await press('.board [data-cell="2,2"]');
  if (!(await count('.board .guess'))) fail('a tap on a cell should draw the guess ring');
  await press('.btn-play');
  await idle();
  if (await count('.next-page')) fail('a wrong guess should not win the page');
  if ((await seeds()) !== n0) fail('a wrong guess should not earn a seed');
  await press('.board [data-cell="3,2"]');
  if ((await count('.board .guess')) !== 1) fail('a new tap should move the ring (one ring)');
  await press('.btn-play');
  await won();
  if ((await seeds()) !== n0 + 1) fail('the right guess should earn a seed');
  ok('predict: ▶ waits for a guess; the ring on (2,2) plays and Brote ends elsewhere (no seed); the ring on (3,2) wins');

  // save blocks: the flat plan wins, the gold seal appears, the challenge with the child's plan, the gold stamp
  n0 = await seeds();
  await open('/1ro/hoja/11/1');
  if (await count('.gold-seal')) fail('the gold seal waits until the page is solved');
  for (let i = 0; i < 7; i++) await tap('.zone-palette [data-cmd="right"]');
  await press('.btn-play');
  await won();
  if (!(await count('a.gold-seal'))) fail('solving a page with a gold challenge should show the gold seal');
  await press('a.gold-seal');
  await expectHash('#/1ro/hoja/11/1/oro', 'the gold seal opens the challenge');
  await page.waitForTimeout(900);
  if ((await count('.plan-note .plan-card')) !== 7) fail('the challenge should show the child\'s seven-arrow plan');
  if ((await count('.zone-program [data-key^="end"]')) !== 1) fail('the challenge notebook should have one line');
  await tap('.zone-palette [data-cmd="repeat"]');
  await tap('.zone-palette [data-cmd="right"]');
  for (let i = 0; i < 5; i++) await press('.zone-program .tape-count');
  const gold = await program();
  if (JSON.stringify(gold) !== JSON.stringify([{ t: 'loop', count: 7, body: ['right'] }])) fail(`taps should build repetir 7 [→], built ${JSON.stringify(gold)}`);
  await press('.btn-play');
  await page.waitForSelector('.gold-seal.is-earned', { timeout: 30000 });
  await page.waitForTimeout(1400);
  if (!(await count('.sheet-pages a[data-core="1"] .stamp.is-gold'))) fail('the page should be stamped in gold in the bar');
  if ((await seeds()) !== n0 + 1) fail(`the gold stamp earns no seed (only the page did): ${n0} → ${await seeds()}`);
  ok('save blocks: seven taps win the page and the gold seal appears; the challenge shows the plan and one line; repetir 7 [→] earns the gold stamp (no extra seed)');

  // a reload keeps the formats' progress and the gold stamp
  await page.reload();
  await page.waitForTimeout(1100);
  if (!(await count('.sheet-pages a[data-core="1"] .stamp.is-gold'))) fail('after a reload the gold stamp stays');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('camino.progress.v1')));
  for (const id of ['1ro-h5-1', '1ro-h3-1', '1ro-h3-2', '1ro-h11-1']) if (!stored.solved[id]) fail(`${id} should be stored as solved`);
  if (!stored.gold['1ro-h11-1']) fail('the gold stamp should be stored');
  await open('/1ro/hoja/3');
  await expectHash('#/1ro/hoja/3/3', 'sheet 3 opens on its first unsolved page after pages 1 and 2');
  ok('a reload keeps the gold stamp and the solved formats; sheet 3 now opens on its page 3');

  // ---------------------------------------------------------------- the music recess (T3a): listen, copy, a wrong note
  const note = (t) => `.zone-palette [data-cmd="${t === 'rest' ? 'rest' : `note:${t}`}"]`;
  n0 = await seeds();
  await open('/1ro/hoja/9/1');
  if ((await count('.xylo-bar')) !== 5) fail('the music page should draw the five bars of the xylophone');
  if ((await count('.song-strip .strip-notes > g')) !== 4) fail('the song strip should show the four notes of the song');
  await press('.song-strip');
  await page.waitForTimeout(700);
  if (!(await count('.song-strip .strip-marks path'))) fail('a tap on the strip should play the song (its blue pen follows it)');
  await page.waitForTimeout(2200);
  for (const t of ['do', 're', 'do', 'mi']) await tap(note(t));
  const song = await program();
  if (song.map((it) => it.cmd).join(' ') !== 'note:do note:re note:do note:mi') fail(`taps should write do re do mi, wrote ${JSON.stringify(song)}`);
  await press('.btn-play');
  await page.waitForSelector('.zone-program .blk.is-culprit', { timeout: 20000 });
  if ((await page.getAttribute('.zone-program .blk.is-culprit', 'data-ref')) !== '2') fail('the wrong note (the third card) should be the culprit');
  if (!(await count('.song-strip .strip-ring'))) fail('the beat that was due should be circled on the strip');
  await idle();
  if (await count('.next-page')) fail('a wrong note should not win the page');
  if ((await seeds()) !== n0) fail('a wrong note should not earn a seed');
  ok('music: the strip plays the song on a tap; do re do mi stops on the third beat, its card shakes and the beat that was due is circled; no seed');
  await press('.zone-program [data-ref="3"]');
  await press('.zone-program [data-ref="2"]');
  for (const t of ['mi', 'do']) await tap(note(t));
  if ((await program()).map((it) => it.cmd).join(' ') !== 'note:do note:re note:mi note:do') fail('taps on the notebook take cards out, taps on the palette bring them back');
  await press('.btn-play');
  await won();
  if ((await seeds()) !== n0 + 1) fail('the song played right should earn a seed');
  if ((await count('.song-strip .strip-marks circle')) !== 4) fail('every beat played right should be ticked on the strip');
  ok('music: two taps take the wrong notes out, two bring mi and do; the song plays right, every beat is ticked, a seed');

  // ---------------------------------------------------------------- the guardas (T3a): draw, smudge, fix
  n0 = await seeds();
  await open('/1ro/hoja/14/1');
  // the last arrow goes down off the pencil (↑ would only go back over the line just inked: that is fine)
  const arrows = ['up', 'right', 'down', 'right', 'up', 'right', 'down', 'down'];
  for (const d of arrows) await tap(`.zone-palette [data-cmd="${d}"]`);
  await press('.btn-play');
  await page.waitForSelector('.zone-program .blk.is-culprit', { timeout: 30000 });
  if ((await page.getAttribute('.zone-program .blk.is-culprit', 'data-ref')) !== '7') fail('the last arrow (↓ instead of →) should be the culprit');
  if (!(await count('.board .smudge'))) fail('a step off the pencil should smudge the ink');
  await idle();
  if (await count('.next-page')) fail('a smudged guarda should not win');
  ok('guarda: seven arrows ink the pencil in blue, the eighth goes off it: the ink smudges and that card shakes');
  await press('.zone-program [data-ref="7"]');
  await tap('.zone-palette [data-cmd="right"]');
  await press('.btn-play');
  await won();
  if (await count('.board .smudge')) fail('a new run starts from a clean page');
  if ((await seeds()) !== n0 + 1) fail('the guarda drawn right should earn a seed');
  if (!(await count('.board .goal-ring'))) fail('the finished guarda should get the blue loop round it');
  ok('guarda: the wrong arrow out, → in: the guarda is drawn on a clean page, looped in blue pen, a seed');

  // ---------------------------------------------------------------- the music page without Web Audio: silent, and nothing breaks
  for (const kind of ['missing', 'broken']) {
    const mute = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    watch(mute);
    await mute.addInitScript((k) => {
      if (k === 'missing') { delete window.AudioContext; delete window.webkitAudioContext; Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true }); }
      else Object.defineProperty(window, 'AudioContext', { value: class { constructor() { throw new Error('no audio device'); } }, configurable: true });
    }, kind);
    await mute.goto(`${base}?debug#/1ro/hoja/9/1`);
    await mute.waitForTimeout(1100);
    await mute.click('.song-strip', { force: true });
    await mute.waitForTimeout(600);
    await mute.click('.xylo-bar[data-bar="sol"]', { force: true });
    for (const t of ['do', 're', 'mi', 'do']) { await mute.click(note(t)); await mute.waitForTimeout(260); }
    await mute.click('.btn-play', { force: true });
    await mute.waitForSelector('.next-page', { timeout: 30000 });
    await mute.close();
  }
  ok('music with Web Audio missing, and with an AudioContext that throws: the strip, a bar, four notes and ▶ play silently and win');

  // ---------------------------------------------------------------- the workshops (T3b): make a level, prove it, pin it, play a classmate's
  const board = () => page.evaluate(() => JSON.parse(localStorage.getItem('camino.progress.v1') || '{}').drafts?.['7']?.board ?? null);
  const cell = (c, r) => `.editor-board [data-cell="${c},${r}"]`;
  const plays = (card) => page.evaluate((c) => Number(document.querySelector(`.cork [data-card="${c}"]`)?.getAttribute('data-plays')), card);
  await page.goto(`${base}?debug#/1ro`);
  await page.evaluate(() => {
    localStorage.clear();
    // everything before sheet 7 done: Brote waits on the first workshop
    const solved = {};
    const core = { 1: 3, 2: 4, 3: 4, 4: 3, 5: 4, 6: 4 };
    for (const [n, k] of Object.entries(core)) for (let i = 1; i <= k; i++) solved[`1ro-h${n}-${i}`] = true;
    localStorage.setItem('camino.progress.v1', JSON.stringify({ v: 1, seeds: 22, opened: 16, solved, gold: {} }));
    sessionStorage.clear();
  });
  await page.reload();
  await page.waitForTimeout(900);
  if (!(await count('.stop.is-here[data-sheet="7"]'))) fail('Brote should wait on the first workshop (sheet 7)');
  await tap('a.stop[data-sheet="7"]');
  await expectHash('#/1ro/hoja/7/taller', 'sheet 7 opens on its editor');
  // the guided start: the ghost hand places the seed on the board and points at ▶
  await page.waitForTimeout(6000);
  const guidedSeed = await board();
  if (!guidedSeed || JSON.stringify(guidedSeed.seed) !== '[2,1]') fail(`the guided start should put the seed on (2,1), the draft holds ${JSON.stringify(guidedSeed)}`);
  // tools through the real UI: taps on a tool and a cell, a drag of a tool, the eraser, a piece dragged on the board
  await tap('.zone-tools [data-tool="rock"]');
  for (const [c, r] of [[1, 1], [1, 2], [3, 2], [3, 1]]) await tap(cell(c, r));
  await drag('.zone-tools [data-tool="goal"]', cell(5, 0));
  await drag(cell(0, 2), cell(0, 3));
  await tap('.zone-tools [data-tool="eraser"]');
  await tap(cell(3, 1));
  await tap(cell(0, 3)); // the eraser never takes Brote away
  const made7 = await board();
  const want7 = { start: [0, 3], seed: [2, 1], goal: [5, 0], rocks: [[1, 1], [1, 2], [3, 2]] };
  if (JSON.stringify(made7) !== JSON.stringify(want7)) fail(`the editor should hold ${JSON.stringify(want7)}, holds ${JSON.stringify(made7)}`);
  ok('workshop 7: the guided start places the seed; taps and drags put rocks, the pot and Brote; the eraser takes a rock, never Brote');
  // a level Brote cannot finish is refused: walls round the pot
  await tap('.zone-tools [data-tool="rock"]');
  await tap(cell(4, 0));
  await tap(cell(5, 1));
  await press('.btn-play');
  if ((await hash()) !== '#/1ro/hoja/7/taller') fail('a level Brote cannot finish should be refused (no test page)');
  await page.waitForTimeout(1600);
  await tap('.zone-tools [data-tool="eraser"]');
  await tap(cell(4, 0));
  await tap(cell(5, 1));
  const verdict = await page.evaluate(() => window.__camino.verdict());
  if (!verdict.ok) fail(`the level should be good again, the solver says ${JSON.stringify(verdict)}`);
  ok(`a level with the pot walled in is refused on ▶ (Brote puzzled); two rocks erased, the solver accepts it (${verdict.lines} lines)`);
  // ▶ opens the test page; the author solves it with the normal notebook
  await press('.btn-play');
  await expectHash('#/1ro/hoja/7/taller/probar', '▶ opens the test page');
  await page.waitForTimeout(900);
  const lines7 = await page.evaluate(() => window.__camino.level.slots);
  if (lines7 !== verdict.lines) fail(`the test page's notebook should have ${verdict.lines} lines, has ${lines7}`);
  await solveByHand({ dragFirst: false });
  if (!(await count('.next-page .pin-card-art'))) fail('winning the test page offers the push-pin');
  const n7 = await seeds();
  await press('.next-page');
  await expectHash('#/1ro/hoja/7/cartelera', 'the push-pin pins the level on the corkboard');
  await page.waitForTimeout(2600);
  if (!(await count('.cork [data-card="yo-1"]'))) fail('the level made here should be on the corkboard');
  if ((await seeds()) !== n7 + 1) fail(`pinning the level should earn its seed (${n7} → ${await seeds()})`);
  const cards = await count('.cork .cork-card');
  if (cards < 7 || cards > 9) fail(`the corkboard should show the level made here and the classmates' examples, shows ${cards}`);
  ok(`solved by its author with the notebook, pinned with the push-pin: the card is on the corkboard (${cards} cards), a seed`);
  // play an example card, twice: the play count rises on this device
  if ((await plays('ej-4')) !== 0) fail('a card never played shows no plays');
  for (let round = 1; round <= 2; round++) {
    await press('.cork [data-card="ej-4"]');
    await expectHash('#/1ro/hoja/7/cartelera/ej-4', 'a card opens as a page');
    await page.waitForTimeout(900);
    await solveByHand({ dragFirst: round === 1 });
    await press('.next-page');
    await expectHash('#/1ro/hoja/7/cartelera', 'a played card leads back to the corkboard');
    await page.waitForTimeout(700);
    if ((await plays('ej-4')) !== round) fail(`after ${round} win(s) the card should say ${round}, says ${await plays('ej-4')}`);
  }
  if (!(await count('.cork [data-card="ej-4"] .tally'))) fail('the plays are drawn as tally marks');
  await page.goto(`${base}?debug#/1ro`);
  await page.waitForTimeout(900);
  if (!(await count('.stop.is-done[data-sheet="7"] .map-stamp'))) fail('sheet 7 should be stamped on the map: a level pinned and a classmate\'s played');
  ok('a classmate\'s card played twice: the tally on the card reads 1, then 2; sheet 7 is stamped on the map');

  // ---------------------------------------------------------------- the limited workshop (15): the refusal, then a level that needs a repeat
  await page.goto(`${base}?debug#/1ro/hoja/15/taller`);
  await page.waitForTimeout(7500); // its guided start points at the lines and ▶
  const lines = () => page.evaluate(() => Number(document.querySelector('.lines-note')?.getAttribute('data-lines')));
  if ((await lines()) !== 2) fail(`the limited workshop starts with two lines, has ${await lines()}`);
  for (let i = 0; i < 3; i++) await press('[data-lines-btn="more"]');
  if ((await lines()) !== 5) fail(`three taps on the pencil should make 5 lines, made ${await lines()}`);
  await press('.btn-play');
  await page.waitForTimeout(400);
  if ((await hash()) !== '#/1ro/hoja/15/taller') fail('five lines fit a plan without repeat: ▶ should be refused');
  if (!(await count('.board .thought'))) fail('Brote should think of the repeat block');
  if (!(await count('[data-lines-btn="less"].is-calling'))) fail('the eraser (one line less) should call');
  await page.waitForTimeout(3000);
  for (let i = 0; i < 3; i++) await press('[data-lines-btn="less"]');
  if ((await lines()) !== 2) fail(`three taps on the eraser should leave 2 lines, left ${await lines()}`);
  await press('.btn-play');
  await expectHash('#/1ro/hoja/15/taller/probar', 'two lines: the level needs a repeat and opens its test page');
  await page.waitForTimeout(900);
  if (!(await page.evaluate(() => window.__camino.level.blocks.includes('repeat')))) fail('a limited level\'s notebook brings repetir');
  await tap('.zone-palette [data-cmd="repeat"]');
  await tap('.zone-palette [data-cmd="right"]');
  for (let i = 0; i < 3; i++) await press('.zone-program .tape-count');
  const p15 = await program();
  if (JSON.stringify(p15) !== JSON.stringify([{ t: 'loop', count: 5, body: ['right'] }])) fail(`taps should build repetir 5 [→], built ${JSON.stringify(p15)}`);
  await press('.btn-play');
  await won();
  await press('.next-page');
  await expectHash('#/1ro/hoja/15/cartelera', 'the limited level is pinned');
  await page.waitForTimeout(1800);
  const stored15 = await page.evaluate(() => JSON.parse(localStorage.getItem('camino.progress.v1')).made.find((m) => m.sheet === 15));
  if (!stored15 || stored15.lines !== 2 || JSON.stringify(stored15.solution) !== JSON.stringify(p15)) fail(`the limited level should be stored with 2 lines and its repeat, stored ${JSON.stringify(stored15)}`);
  if (!(await count(`.cork [data-card="${stored15.id}"] .limit-badge`))) fail('a limited card carries the repeat\'s tape and its lines');
  ok('workshop 15: five lines fit a plan without repeat, so ▶ is refused (Brote thinks of the repeat, the eraser calls); two lines and repetir 5 [→] pin the level, stored with its lines and repeat');

  // ---------------------------------------------------------------- the comodín (16): "Recuperar" with a pending essential page
  n0 = await seeds();
  await page.goto(`${base}?debug#/1ro/hoja/16`);
  await page.waitForTimeout(1000);
  await expectHash('#/1ro/hoja/16/comodin', 'the comodín opens on its three choices');
  if ((await count('[data-choice]')) !== 3) fail('the comodín shows three choices');
  await press('[data-choice="recuperar"]');
  await expectHash('#/1ro/hoja/16/recuperar', 'the bridge');
  await page.waitForTimeout(700);
  // this progress left sheets 8–14 unplayed: their essential pages wait on the bridge, the first is sheet 8's page 1
  const firstPending = await page.getAttribute('.bridge-card', 'data-pending');
  if (firstPending !== '8-1') fail(`the bridge should start with sheet 8's page 1, starts with ${firstPending}`);
  await press('.bridge-card');
  await expectHash('#/1ro/hoja/16/recuperar/8/1', 'a pending page opens from the bridge');
  await page.waitForTimeout(900);
  // the ramp: repetir 3 [→ → ↑], built with taps
  await tap('.zone-palette [data-cmd="repeat"]');
  for (const c of ['right', 'right', 'up']) await tap(`.zone-palette [data-cmd="${c}"]`);
  await press('.zone-program .tape-count');
  const ramp = await program();
  if (JSON.stringify(ramp) !== JSON.stringify([{ t: 'loop', count: 3, body: ['right', 'right', 'up'] }])) fail(`taps should build repetir 3 [→ → ↑], built ${JSON.stringify(ramp)}`);
  await press('.btn-play');
  await won();
  if ((await seeds()) !== n0 + 1) fail('a pending page solved from the comodín earns its seed');
  await press('.next-page');
  await expectHash('#/1ro/hoja/16/recuperar', 'back to the bridge');
  await page.waitForTimeout(700);
  if ((await page.getAttribute('.bridge-card', 'data-pending')) === '8-1') fail('the solved page should leave the bridge');
  const st16 = await page.evaluate(() => JSON.parse(localStorage.getItem('camino.progress.v1')));
  if (!st16.solved['1ro-h8-1'] || !st16.goals['1ro-h16-recuperar']) fail('the page counts for sheet 8 and "recuperar" for the comodín');
  ok('comodín: "recuperar" shows the pending essential pages on a bridge; sheet 8\'s page 1 solved from it counts for sheet 8 (a seed) and leaves the bridge');

  // ---------------------------------------------------------------- a reload keeps the made levels and their plays
  await page.goto(`${base}?debug#/1ro/hoja/7/cartelera`);
  await page.reload();
  await page.waitForTimeout(1200);
  if (!(await count('.cork [data-card="yo-1"]')) || !(await count(`.cork [data-card="${stored15.id}"]`))) fail('after a reload the levels made here are still on the corkboard');
  if ((await plays('ej-4')) !== 2) fail(`after a reload the card still says it was played twice, says ${await plays('ej-4')}`);
  ok('a reload keeps both levels made here and the plays on the corkboard');

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
