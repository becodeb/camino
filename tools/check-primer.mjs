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
// The motivation layer (T4): sheet 1 asks for a character; a sheet finished shows its preview card;
// a page solved grows the garden; a boss won sends its critter to the garden; the wardrobe opens
// when the teacher opens it, a piece unlocked is worn, a locked one waits; the character switched
// stands on the map and walks a board; the showcase: two pages picked, the family plays one while
// the child's character cheers, sheet 17 stamped; a reload keeps it all; blocked storage still plays.
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
  // the "next page" buttons bob forever (they wait for the child): no stable box, so they are clicked without waiting for one
  const tap = async (sel) => { await page.click(sel, { force: sel === '.next-page' || /-next\b/.test(sel) }); await page.waitForTimeout(260); };
  const expectHash = async (want, what) => {
    for (let i = 0; i < 20 && (await hash()) !== want; i++) await page.waitForTimeout(100);
    const h = await hash();
    if (h !== want) fail(`${what}: expected ${want}, at ${h}`);
  };
  /** The preview card goes away with a tap anywhere: on the card itself (its own button may sit under the dev drawer). */
  const closePreview = async () => { await page.click('.preview-card', { force: true, position: { x: 120, y: 60 } }); await page.waitForTimeout(300); };
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

  // ---------------------------------------------------------------- sheet 1 asks for a character first (T4); Brote here, the old checks' character
  await tap('a.stop[data-sheet="1"]');
  await expectHash('#/1ro/hoja/1/personaje', 'sheet 1 opens on the character choice the first time');
  await page.waitForTimeout(700);
  if ((await count('.choice-btn[data-choice-char]')) !== 4) fail('the choice shows the four characters');
  if (await count('.mode-choice .next-page')) fail('the page to turn waits until one is picked');
  await tap('.choice-btn[data-choice-char="brote"]');
  const picked = await page.evaluate(() => JSON.parse(localStorage.getItem('camino.progress.v1')));
  if (picked.character !== 'brote' || !picked.picked) fail(`Brote should be picked, stored ${picked.character} ${picked.picked}`);
  await tap('.next-page');
  await expectHash('#/1ro/hoja/1/1', 'the page to turn leads to sheet 1\'s first page');
  await page.waitForTimeout(900);
  ok('sheet 1 opens on the character choice (four on their stumps); Brote picked, the page to turn leads to page 1');

  // ---------------------------------------------------------------- solve the first pages through the real UI
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
  // the sheet just finished: its preview card comes up once (sheet 2's first page peeking), a tap puts it away
  await page.waitForSelector('.preview-veil[data-preview="1"]', { timeout: 5000 });
  if (!(await count('.preview-card .peek-page .thumb'))) fail('the preview card should show the next sheet\'s first page');
  await closePreview();
  if (await count('.preview-veil')) fail('a tap should put the preview card away');
  if (!(await page.evaluate(() => JSON.parse(localStorage.getItem('camino.progress.v1')).previewed['1']))) fail('the preview card of sheet 1 is kept as shown');
  ok('sheet 1 finished: its preview card comes up on the doors (sheet 2\'s first page peeking), a tap puts it away; kept as shown');

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
  await expectHash('#/1ro/hoja/17/muestra', 'a dev jump to the showcase (every sheet is built now)');
  if (!(await count('[data-station]')) || await count('.soon')) fail('sheet 17 should show the showcase\'s steps, not a "próximamente" page');
  ok('dev jumps: sheet 6, its boss (framed), its hard door, and sheet 17 (the showcase\'s four steps)');
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
  await expectHash('#/1ro/hoja/1/personaje', 'sheet 1 after clearing asks for a character again');
  await page.goto(`${base}?debug#/1ro/hoja/1/1`);
  await page.waitForTimeout(900);
  if (!(await count('.btn-play'))) fail('the level page should load');
  ok('cleared storage starts the year again (the character choice again) and the pages still load');

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
  // the guided start: the ghost hand places the seed on the board and points at ▶ (waited for until the hand is gone)
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => !document.querySelector('.ghost-hand'), null, { timeout: 20000 });
  await page.waitForTimeout(300);
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
    // the workshop is done with a classmate's level played: its preview card, once
    if (round === 1) {
      await page.waitForSelector('.preview-veil[data-preview="7"]', { timeout: 5000 });
      await closePreview();
    }
  }
  if (!(await count('.cork [data-card="ej-4"] .tally'))) fail('the plays are drawn as tally marks');
  await page.goto(`${base}?debug#/1ro`);
  await page.waitForTimeout(900);
  if (!(await count('.stop.is-done[data-sheet="7"] .map-stamp'))) fail('sheet 7 should be stamped on the map: a level pinned and a classmate\'s played');
  ok('a classmate\'s card played twice: the tally on the card reads 1, then 2; sheet 7 is stamped on the map');

  // ---------------------------------------------------------------- the limited workshop (15): the refusal, then a level that needs a repeat
  await page.goto(`${base}?debug#/1ro/hoja/15/taller`);
  // its guided start points at the lines and ▶ (waited for until the hand is gone)
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => !document.querySelector('.ghost-hand'), null, { timeout: 20000 });
  await page.waitForTimeout(300);
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

  // ---------------------------------------------------------------- the motivation layer (T4): the garden, a critter, the wardrobe, the character, the showcase
  const progressNow = () => page.evaluate(() => JSON.parse(localStorage.getItem('camino.progress.v1')));
  const plants = () => count('.garden-svg .garden-plant');
  await page.goto(`${base}?debug#/1ro`);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    // sheet 1 done (its card seen), sheet 2's pages 2–4: six seeds; Brote picked; the teacher opened the whole year
    const solved = { '1ro-h1-1': true, '1ro-h1-2': true, '1ro-h1-3': true, '1ro-h2-2': true, '1ro-h2-3': true, '1ro-h2-4': true };
    localStorage.setItem('camino.progress.v1', JSON.stringify({ v: 1, seeds: 6, opened: 17, character: 'brote', picked: true, solved, gold: {}, previewed: { 1: true } }));
  });
  await page.reload();
  await page.waitForTimeout(900);
  // the pouch opens the garden: six seeds planted
  await tap('.garden-link');
  await expectHash('#/1ro/jardin', 'the pouch opens the garden');
  await page.waitForTimeout(700);
  if ((await plants()) !== 6) fail(`the garden should hold 6 plants, holds ${await plants()}`);
  if (!(await count('[data-move="hoja-1"]'))) fail('sheet 1 finished grows its tree');
  if ((await count('.coming-card')) !== 13) fail(`thirteen bosses' rewards are still coming, shows ${await count('.coming-card')}`);
  // a page solved through the real UI: one more plant, the newest a sprout
  await tap('.garden-next');
  await expectHash('#/1ro', 'the garden leads back to the map');
  await tap('a.stop[data-sheet="2"]');
  await expectHash('#/1ro/hoja/2/1', 'sheet 2 opens on its page still to solve');
  await page.waitForTimeout(900);
  await solveByHand({ dragFirst: false });
  await tap('.quit');
  await tap('.garden-link');
  await page.waitForTimeout(700);
  if ((await plants()) !== 7) fail(`a page solved should plant one more (7), the garden holds ${await plants()}`);
  if ((await page.getAttribute('.is-newest .garden-plant', 'data-stage')) !== 'sprout') fail('the newest seed is a sprout');
  if (!(await count('[data-move="hoja-2"]'))) fail('sheet 2 finished grows its tree');
  ok('the pouch opens the garden (6 plants, the tree of sheet 1, 13 rewards still coming); page 2 of sheet 2 solved by hand plants a 7th, a sprout, and sheet 2\'s tree grows');

  // a boss won through the real UI sends its critter: the coatí of sheet 2
  await tap('.garden-next');
  await tap('a.stop[data-sheet="2"]');
  await expectHash('#/1ro/hoja/2/puertas', 'sheet 2 finished opens on its doors');
  await page.waitForSelector('.preview-veil[data-preview="2"]', { timeout: 5000 });
  await closePreview();
  if (!(await count('.boss-btn [data-reward="coati"]')) || await count('.boss-btn [data-reward="coati"][data-won]')) fail('the boss page carries the coatí as a silhouette');
  await page.locator('a.boss-btn').click();
  await expectHash('#/1ro/hoja/2/jefe', 'the boss');
  await page.waitForTimeout(900);
  if (!(await count('.reward-card[data-reward="coati"]:not([data-won])'))) fail('the boss\'s reward card waits as a silhouette');
  await solveByHand({ dragFirst: false });
  if (!(await count('.reward-card[data-reward="coati"][data-won]'))) fail('won, the reward card turns');
  await tap('.quit');
  await tap('.garden-link');
  await page.waitForTimeout(800);
  if (!(await count('[data-critter="coati"][data-fresh]'))) fail('the coatí should arrive in the garden');
  if (await count('.coming-card[data-coming="coati"]')) fail('the coatí is no longer coming');
  await page.waitForTimeout(3400);
  if (!(await progressNow()).seen['critter:coati']) fail('the coatí\'s arrival is kept as seen');
  ok('sheet 2\'s doors show its preview card; its boss page carries the coatí as a silhouette; won by hand, the card turns and the coatí walks into the garden (seen once)');

  // the wardrobe: shut until the teacher opens it; a piece unlocked is worn, a locked one waits; another character
  await tap('.garden-next');
  if ((await page.getAttribute('.wardrobe-link', 'data-wardrobe')) !== 'shut') fail('the wardrobe is shut until the teacher opens it');
  await tap('.wardrobe-link');
  await expectHash('#/1ro/vestidor', 'the wardrobe');
  await page.waitForTimeout(700);
  if (!(await count('.ropero-doors')) || await count('[data-prenda]')) fail('shut, the wardrobe shows its barred doors');
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(300);
  await tap('[data-dev-wardrobe="shut"]');
  await tap('.dev-drawer button:has-text("apagar")');
  if (!(await count('[data-prenda]'))) fail('opened by the teacher, the pieces hang on their hooks');
  if (await count('[data-prenda="mochila"][data-locked]') || !(await count('[data-prenda="hongo"][data-locked]'))) fail('sheet 2 finished unlocks the backpack; the mushroom hat waits for 10 seeds');
  await press('[data-prenda="hongo"]');
  await press('[data-prenda="mochila"]');
  if (!(await count('.prenda.is-on[data-prenda="mochila"]')) || await count('.prenda.is-on[data-prenda="hongo"]')) fail('the backpack is worn, the locked hat is not');
  if (!(await count('.mirror-stage g[data-character="brote"][data-outfit~="mochila"]'))) fail('Brote wears the backpack on the rug');
  await press('.cast-btn[data-cast="ovillo"]');
  await page.waitForTimeout(500);
  const dressed = await progressNow();
  if (dressed.character !== 'ovillo' || dressed.outfit.back !== 'mochila' || dressed.seeds !== 8) fail(`Ovillo in the backpack, 8 seeds (never spent): stored ${dressed.character} ${JSON.stringify(dressed.outfit)} ${dressed.seeds}`);
  if (!(await count('.mirror-stage g[data-character="ovillo"][data-outfit~="mochila"]'))) fail('Ovillo stands on the rug in the backpack');
  ok('the wardrobe: barred until the teacher opens it (the dev drawer\'s switch); the backpack (sheet 2) is worn, the hat (10 seeds) waits; Ovillo chosen keeps it; the seeds stay 8');

  // the character switched stands on the map and walks a board
  await tap('.wardrobe-next');
  await expectHash('#/1ro', 'the wardrobe leads back to the map');
  if (!(await count('.map-brote[data-player="ovillo"] svg[data-outfit~="mochila"]'))) fail('Ovillo in the backpack waits on the map');
  await tap('a.stop[data-sheet="2"]');
  await page.waitForTimeout(700);
  await page.locator('a.door-btn[data-door="easy"]').click();
  await expectHash('#/1ro/hoja/2/puerta/facil/1', 'the easy door');
  await page.waitForTimeout(900);
  if (!(await count('.board g[data-character="ovillo"][data-outfit~="mochila"]'))) fail('Ovillo in the backpack walks the board');
  if (!(await count('.level-bar svg.bar-face[data-character="ovillo"]'))) fail('the bar\'s portrait is Ovillo');
  ok('Ovillo in the backpack waits on the map, walks the easy door\'s board and is the bar\'s portrait');

  // the showcase: two pages picked, the family plays one while the child's character cheers
  await tap('.quit');
  await tap('a.stop[data-sheet="17"]');
  await expectHash('#/1ro/hoja/17/muestra', 'sheet 17 opens on the showcase\'s steps');
  await page.waitForTimeout(700);
  await press('[data-station="elegir"]');
  await expectHash('#/1ro/hoja/17/elegir', 'the first step: pick the pages');
  await page.waitForTimeout(700);
  if (await count('.pick-next')) fail('the family waits until two pages are picked');
  await press('[data-pick="1ro-h1-1"]');
  await press('[data-pick="1ro-h2-jefe"]');
  if ((await progressNow()).favorites.join() !== '1ro-h1-1,1ro-h2-jefe') fail(`two favourites expected, stored ${JSON.stringify((await progressNow()).favorites)}`);
  await press('.pick-next');
  await expectHash('#/1ro/hoja/17/familia/1', 'the family plays the first page');
  await page.waitForTimeout(1000);
  if (!(await count('.board g[data-character="brote"]'))) fail('the family plays with Brote');
  if (!(await count('.cheer[data-cheer="ovillo"] g[data-character="ovillo"]'))) fail('Ovillo cheers the family from the controls');
  await solveByHand({ dragFirst: true });
  if (!(await progressNow()).goals['1ro-h17-familia']) fail('the family\'s win is kept');
  await press('.next-page');
  await expectHash('#/1ro/hoja/17/familia/2', 'the next page for the family');
  await tap('.quit');
  if (!(await count('.stop.is-done[data-sheet="17"] .map-stamp'))) fail('sheet 17 is stamped once the family played');
  ok('the showcase: sheet 1\'s page 1 and sheet 2\'s boss picked; the family plays the first with Brote while Ovillo cheers, wins; sheet 17 stamped on the map');

  // a reload keeps it all
  await page.reload();
  await page.waitForTimeout(1000);
  const kept = await progressNow();
  if (kept.character !== 'ovillo' || kept.outfit.back !== 'mochila' || kept.favorites.length !== 2 || !kept.wardrobe || !kept.goals['1ro-h17-familia']) fail(`a reload should keep the character, the outfit, the favourites, the wardrobe and the showcase: ${JSON.stringify(kept)}`);
  if (!(await count('.map-brote[data-player="ovillo"]'))) fail('after a reload Ovillo still waits on the map');
  await tap('.garden-link');
  await page.waitForTimeout(700);
  // eight: the family's page was the child's, already solved (it earns no seed)
  if (!(await count('[data-critter="coati"]:not([data-fresh])')) || (await plants()) !== 8) fail(`after a reload the coatí lives in the garden (not new) and 8 plants grow (${await plants()})`);
  ok('a reload keeps Ovillo in the backpack, the open wardrobe, the two favourites, the family\'s win, the coatí at home and 8 plants (the family\'s win earns no seed)');

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
  await blocked.evaluate(() => { location.hash = '#/1ro/jardin'; });
  await blocked.waitForTimeout(900);
  if ((await blocked.locator('.garden-svg .garden-plant').count()) !== 1) fail('with storage blocked the garden grows the seed in memory');
  await blocked.evaluate(() => { location.hash = '#/1ro/hoja/1/personaje'; });
  await blocked.waitForTimeout(900);
  await blocked.click('.choice-btn[data-choice-char="pliegue"]');
  await blocked.waitForTimeout(400);
  await blocked.evaluate(() => { location.hash = '#/1ro/hoja/1/2'; });
  await blocked.waitForTimeout(1100);
  if (!(await blocked.locator('.board g[data-character="pliegue"]').count())) fail('with storage blocked the character picked walks the board');
  ok('with storage blocked the garden grows that seed and Pliegue, picked on sheet 1, walks the next page');

  if (errors.length) fail(`console errors: ${errors.join(' | ')}`);
  ok('no console errors');
} finally {
  await browser.close();
}
