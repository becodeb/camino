// Screenshot tour of the pilot playtest (#/piloto), scenario prefix pp-.
// PW=<dir with playwright> node tools/shots-piloto.mjs <outDir> [base] [only]
//   base: the running app (vite dev on 8811 with the /api proxy, or the API serving dist/), default http://127.0.0.1:8811/
//   only: run the scenarios whose name contains this text.
// Every scenario runs at 1366×768 and 1280×800 (suffixes -1366, -1280). Uses the ?debug hooks
// (window.__piloto for the flow, window.__camino for the level on screen). Fails on console errors.
import { createRequire } from 'node:module';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const [out = '.', base = 'http://127.0.0.1:8811/', only = ''] = process.argv.slice(2);
// SIZES=1920x911,1366x650 for other windows (round 2: the user's browser was 1920×911, not fullscreen)
const SIZES = (process.env.SIZES ?? '1366x768,1280x800').split(',').map((x) => x.split('x').map(Number));

/** The setup, by the real UI (round 2): the division, then one tap on the grade starts. */
async function setup(p, grade = '1ro', division = 'B') {
  if (division) await p.getByRole('button', { name: division, exact: true }).click();
  await p.getByRole('button', { name: grade, exact: true }).click();
  await p.waitForSelector('.choice-row');
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
async function toCharacter(p, grade = '1ro') {
  await setup(p, grade);
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
/** The grade that enters the ladder at or below each rung (1ro 1, 2do 2, 3ro 5, 4to 7, 5to 9). */
const GRADE_AT = [null, '1ro', '2do', '2do', '2do', '3ro', '3ro', '4to', '4to', '5to', '5to', '5to', '5to'];
async function toRung(p, rung, extra = '', grade = '1ro') {
  if (extra) await p.goto(`${base}?debug&${extra}#/piloto`);
  await toCharacter(p, grade);
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
/** Free play of 4to, the game maker's card, and (?debug hook) a later stage of it. */
async function toGameMaker(p, stage = 'play', who = 'mina') {
  await toFreePlay(p, '4to', who);
  await pickCard(p, 'game_maker', 'main');
  if (stage !== 'play') { await pil(p, (s) => window.__gm.go(s), stage); await p.waitForTimeout(1200); }
}
/** Free play of 5to, the text probe's card; `item`: an item of the probe (the debug hook), after the tour. */
async function toText(p, item = null, who = 'mina') {
  await toFreePlay(p, '5to', who);
  await pickCard(p, 'text_probe', 'main');
  if (item != null) { await pil(p, (i) => window.__tx.item(i), item); await p.waitForTimeout(1400); }
}
/** Plays the ready game for a while: the arrows towards the seed. */
async function playChase(p, n) {
  for (let i = 0; i < n; i++) {
    const d = await pil(p, () => { const s = window.__gmw.state(); const me = s.sprites.me, seed = s.sprites.seed; return seed.c > me.c ? 'Right' : seed.c < me.c ? 'Left' : null; });
    if (d) await p.keyboard.press(`Arrow${d}`);
    await p.waitForTimeout(260);
  }
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

/** The wardrobe after `n` pages of sheet 6 solved in free play (n seeds), Mina chosen. */
async function toWardrobe(p, n = 4) {
  await toFreePlay(p, '1ro', 'mina');
  await pickCard(p, 'sheet', 'main.level[data-level]');
  for (let i = 0; i < n; i++) await solveTurn(p);
  await jump(p, 'wardrobe');
  await p.waitForSelector('.mode-wardrobe .hooks');
  await p.waitForTimeout(1200);
}

/** "Teclas del bosque" for a grade (the character picked, the steps before skipped); `play`: wait for the intro to end. */
async function toTyping(p, grade = '1ro', query = '', play = true) {
  if (query) await p.goto(`${base}?debug&${query}#/piloto`);
  await setup(p, grade);
  await p.waitForTimeout(500);
  await p.locator('[data-choice-char="mina"]').click();
  await p.waitForTimeout(400);
  await jump(p, 'typing');
  await p.waitForSelector('.pp-typing');
  if (play) await p.waitForFunction(() => window.__typing?.state().phase === 'play', null, { timeout: 20_000 });
}
/** Ends the round on screen at once (its bed counts as full); `play`: wait for the next round to start. */
async function skipRound(p, play = true) {
  const r = await pil(p, () => window.__typing.state().round);
  await pil(p, () => window.__typing.skipRound());
  if (play) await p.waitForFunction((n) => window.__typing.state().phase === 'play' && window.__typing.state().round === n + 1, r, { timeout: 20_000 });
}
/** Waits for something to fall, then presses its keys (all, or `n` of them). */
async function typeTarget(p, n = 99) {
  await p.waitForFunction(() => window.__typing.expected(), null, { timeout: 15_000 });
  for (let i = 0; i < n; i++) {
    const k = await pil(p, () => window.__typing.expected());
    if (!k) break;
    await p.keyboard.press(k === ' ' ? 'Space' : k);
    await p.waitForTimeout(260);
  }
}

const SCENARIOS = [
  { name: 'pp-setup', run: async (p) => { await p.waitForSelector('.pp-setup'); } },
  {
    name: 'pp-setup-filled',
    run: async (p) => {
      await p.getByRole('button', { name: 'C', exact: true }).click();
      await p.locator('[data-captions="on"]').click();
    },
  },
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
      await hold(p, 18, 18, 1700);
      await p.click('[data-act="adult-form"]');
      await p.click('[data-value="high"]'); await p.click('[data-value="some"]');
      await p.fill('.pp-comment textarea', 'Arrastró sin problemas; pidió ayuda con la consigna.');
    },
  },
  // ---------------------------------------------------------------- T4: the tool check
  { name: 'pp-tool-tap', run: async (p) => { await toTool(p); await p.waitForTimeout(1200); } },
  { name: 'pp-tool-play', run: async (p) => { await toTool(p); await tapArrow(p); await p.waitForTimeout(1300); } },
  { name: 'pp-tool-drag', run: async (p) => { await toToolPage2(p); await p.waitForTimeout(1300); } },
  { name: 'pp-tool-reset', run: async (p) => { await toToolPage2(p); await dragArrow(p); await p.waitForTimeout(1300); } },
  {
    name: 'pp-tool-help',
    run: async (p) => { await toToolPage2(p); await dragArrow(p); await p.waitForTimeout(900); await p.click('.btn-restart'); await p.waitForTimeout(1400); },
  },
  // the drag not done in 8 s: the ghost hand shows it, mid-way
  { name: 'pp-tool-ghost', run: async (p) => { await toToolPage2(p); await p.waitForTimeout(8_000 + 1300); } },
  // ---------------------------------------------------------------- T10: on-screen text, the new bar, "¿Cómo seguís?", the wardrobe
  { name: 'pp-cap-3ro-ladder', run: async (p) => { await toCharacter(p, '3ro'); await jump(p, 'ladder'); await p.waitForSelector('main.level'); await p.waitForTimeout(2500); } },
  { name: 'pp-cap-1ro-ladder', run: async (p) => { await toCharacter(p, '1ro'); await jump(p, 'ladder'); await p.waitForSelector('main.level'); await p.waitForTimeout(2500); } },
  { name: 'pp-cap-3ro-menu', run: async (p) => { await toFreePlay(p, '3ro'); } },
  {
    name: 'pp-next-choice',
    run: async (p) => {
      await toFreePlay(p, '1ro');
      await pil(p, () => window.__freePlay.pick('sheet'));
      await p.waitForSelector('main.level');
      await pil(p, () => window.__freePlay.solveCores());
      await p.evaluate(() => { location.hash = '#/1ro/hoja/6/puertas'; });
      await p.waitForSelector('.pp-next');
      await p.waitForTimeout(1500);
    },
  },
  // ---------------------------------------------------------------- T4: the ladder, one item of each kind of board
  // ---------------------------------------------------------------- T11: the round-2 item bank, every rung as it opens and with ✋ 3 (the solution's footprints)
  ...Array.from({ length: 12 }, (_, i) => i + 1).flatMap((n) => [
    // the grade that meets the rung first (from 3ro the line also shows in the bar)
    { name: `pp-l${n}-start`, run: async (p) => { await toRung(p, n, n >= 11 ? 'nointro' : '', GRADE_AT[n]); await p.waitForTimeout(2500); } },
    n >= 11
      // the games: the ghost's intro (its rule, ▶, its key) and the line after it
      ? { name: `pp-l${n}-intro`, run: async (p) => { await toRung(p, n, '', GRADE_AT[n]); await p.waitForTimeout(9000); } }
      : { name: `pp-l${n}-prints`, run: async (p) => { await toRung(p, n, '', GRADE_AT[n]); await helps(p, 3); await p.waitForTimeout(1800); } },
  ]),
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
  // the wardrobe with this session's seeds: two pieces for everyone, the rest locked with their seeds
  { name: 'pp-wardrobe-open', run: async (p) => { await toWardrobe(p); } },
  {
    name: 'pp-wardrobe-tried',
    run: async (p) => {
      await toWardrobe(p);
      for (const id of ['bufanda', 'hongo', 'mochila']) { await p.locator(`[data-prenda="${id}"]`).click(); await p.waitForTimeout(900); }
      await p.locator('[data-prenda="corona"]').click();
      await p.waitForTimeout(900);
    },
  },
  {
    name: 'pp-bye-garden',
    run: async (p) => {
      await toWardrobe(p);
      for (const id of ['bufanda', 'mochila']) { await p.locator(`[data-prenda="${id}"]`).click(); await p.waitForTimeout(700); }
      await p.locator('.wardrobe-next').click({ force: true });
      await jump(p, 'goodbye');
      await p.waitForSelector('.pp-bye .pp-garden-svg');
      await p.waitForTimeout(2600);
    },
  },
  // the survey's favourite with free play's pictures
  {
    name: 'pp-fp-survey',
    run: async (p) => {
      await toFreePlay(p);
      for (const id of ['sheet', 'recess', 'editor']) { await pickCard(p, id, 'main'); await p.locator('.pp-menu-back').click(); await p.waitForSelector('.pp-menu'); await p.waitForTimeout(400); }
      await jump(p, 'survey');
      for (const a of ['yes', 'mid']) { await p.locator(`[data-answer="${a}"]`).click(); await p.waitForTimeout(1400); }
      await p.waitForSelector('[data-question="favorite_activity"]');
      await p.waitForTimeout(800);
    },
  },
  // ---------------------------------------------------------------- T6: Teclas del bosque
  { name: 'pp-tk-1ro-intro', run: async (p) => { await toTyping(p, '1ro', '', false); await p.waitForTimeout(2600); } },
  { name: 'pp-tk-1ro-falling', run: async (p) => { await toTyping(p, '1ro'); await p.waitForTimeout(2500); } },
  { name: 'pp-tk-1ro-catch', run: async (p) => { await toTyping(p, '1ro'); await p.waitForTimeout(1500); await typeTarget(p, 1); await p.waitForTimeout(40); } },
  {
    name: 'pp-tk-1ro-wrong',
    run: async (p) => {
      await toTyping(p, '1ro'); await p.waitForTimeout(1500);
      await p.waitForFunction(() => window.__typing.expected());
      const k = await pil(p, () => window.__typing.expected());
      await p.keyboard.press(k === 'p' ? 'q' : 'p');
      await p.waitForTimeout(220);
    },
  },
  { name: 'pp-tk-1ro-help', run: async (p) => { await toTyping(p, '1ro'); await p.waitForTimeout(1500); await p.click('.level-bar .help'); await p.waitForTimeout(600); } },
  // T12: the rounds. pp-tk-<grade>-half: the bed half full; -golden: three early catches; -roundend: the
  // bloom and the critter; -card: the next round's card; -r3: round 3; -finale: the sign
  { name: 'pp-tk-1ro-two', run: async (p) => { await toTyping(p, '1ro'); await skipRound(p); await p.waitForTimeout(6500); } },
  {
    name: 'pp-tk-1ro-golden',
    run: async (p) => {
      await toTyping(p, '1ro');
      for (let i = 0; i < 3; i++) { await typeTarget(p, 1); if (i < 2) await p.waitForTimeout(700); }
      await p.waitForTimeout(450);
    },
  },
  { name: 'pp-tk-1ro-roundend', run: async (p) => { await toTyping(p, '1ro', 'metas=2'); await typeTarget(p, 1); await p.waitForTimeout(800); await typeTarget(p, 1); await p.waitForTimeout(1500); } },
  { name: 'pp-tk-1ro-card', run: async (p) => { await toTyping(p, '1ro'); await skipRound(p, false); await p.waitForTimeout(3600); } },
  { name: 'pp-tk-1ro-r3', run: async (p) => { await toTyping(p, '1ro'); await skipRound(p); await skipRound(p); await typeTarget(p, 1); await p.waitForTimeout(300); } },
  { name: 'pp-tk-1ro-finale', run: async (p) => { await toTyping(p, '1ro', 'metas=1'); for (let i = 0; i < 60 && !(await p.locator('.tk-finale').count()); i++) { const k = await pil(p, () => window.__typing?.expected()); if (k) await p.keyboard.press(k); await p.waitForTimeout(500); } await p.waitForSelector('.tk-finale', { timeout: 10_000 }); await p.waitForTimeout(1500); } },
  { name: 'pp-tk-2do-word', run: async (p) => { await toTyping(p, '2do'); await skipRound(p); await skipRound(p); await typeTarget(p, 2); await p.waitForTimeout(300); } },
  { name: 'pp-tk-2do-half', run: async (p) => { await toTyping(p, '2do'); await pil(p, () => window.__typing.fill(4)); await p.waitForTimeout(1500); } },
  { name: 'pp-tk-3ro-word', run: async (p) => { await toTyping(p, '3ro'); await skipRound(p); await typeTarget(p, 3); await p.waitForTimeout(300); } },
  { name: 'pp-tk-3ro-phrase', run: async (p) => { await toTyping(p, '3ro'); await skipRound(p); await skipRound(p); await typeTarget(p, 6); await p.waitForTimeout(300); } },
  { name: 'pp-tk-5to-word', run: async (p) => { await toTyping(p, '5to'); await p.waitForTimeout(1200); await typeTarget(p, 1); await p.waitForTimeout(300); } },
  { name: 'pp-tk-5to-phrase', run: async (p) => { await toTyping(p, '5to'); await skipRound(p); await skipRound(p); await pil(p, () => window.__typing.fill(2)); await typeTarget(p, 7); await p.waitForTimeout(300); } },
  { name: 'pp-tk-5to-landed', run: async (p) => { await toTyping(p, '5to', 'teclas=2'); await pil(p, () => window.__typing.pace(2)); await p.waitForFunction(() => window.__typing.state().items.some((x) => x.state === 'landed'), null, { timeout: 40_000 }); await p.waitForTimeout(300); } },
  {
    name: 'pp-tk-3ro-touch',
    run: async (p) => {
      await toTyping(p, '3ro', 'tactil');
      await p.waitForTimeout(1200);
      await p.waitForFunction(() => window.__typing.expected());
      const k = await pil(p, () => window.__typing.expected());
      await p.locator(`.pp-kb [data-key="${k}"]`).click({ force: true });
      await p.waitForTimeout(400);
    },
  },
  { name: 'pp-tk-listo', run: async (p) => { await toTyping(p, '3ro'); await skipRound(p); await p.waitForTimeout(900); } },
  { name: 'pp-tk-liked', run: async (p) => { await toTyping(p, '1ro'); await skipRound(p); await pil(p, () => window.__typing.stop()); await p.click('.pp-tk-next', { force: true }); await p.waitForSelector('[data-question="typing_liked"]'); await p.waitForTimeout(800); } },
  // the survey's favourites after the typing game: its picture among them
  {
    name: 'pp-tk-survey',
    run: async (p) => {
      await toTyping(p, '1ro'); await typeTarget(p, 1); await skipRound(p); await pil(p, () => window.__typing.stop());
      await p.click('.pp-tk-next', { force: true });
      await p.click('[data-question="typing_liked"] [data-answer="yes"]');
      await p.waitForSelector('[data-interlude="cheer"]');
      await jump(p, 'survey');
      for (const a of ['yes', 'easy']) { await p.locator(`[data-answer="${a}"]`).click(); await p.waitForTimeout(1400); }
      await p.waitForSelector('[data-question="favorite_activity"] [data-answer="typing"]');
      await p.waitForTimeout(800);
    },
  },
  {
    name: 'pp-tk-cheer',
    run: async (p) => {
      await toTyping(p, '1ro'); await skipRound(p); await pil(p, () => window.__typing.stop());
      await p.click('.pp-tk-next', { force: true });
      await p.click('[data-question="typing_liked"] [data-answer="yes"]');
      await p.waitForSelector('[data-interlude="cheer"]'); await p.waitForTimeout(2000);
    },
  },
  // ---------------------------------------------------------------- T7: "Hacé tu juego" (4to)
  { name: 'pp-gm-menu-4to', run: async (p) => { await toFreePlay(p, '4to'); } },
  { name: 'pp-gm-play', run: async (p) => { await toGameMaker(p); await p.click('.gm-root .btn-play'); await playChase(p, 14); } },
  { name: 'pp-gm-play-stone', run: async (p) => { await toGameMaker(p); await pil(p, () => window.__gmw.select('stone')); await p.waitForTimeout(400); } },
  { name: 'pp-gm-change', run: async (p) => { await toGameMaker(p, 'change'); await p.waitForTimeout(7500); } },
  { name: 'pp-gm-change-done', run: async (p) => { await toGameMaker(p, 'change'); await p.click('[data-chip="seed:1:0"]'); await p.waitForTimeout(500); } },
  { name: 'pp-gm-game-tab', run: async (p) => { await toGameMaker(p, 'make'); await p.click('.gm-tab[data-obj="game"]'); await p.waitForTimeout(500); } },
  {
    name: 'pp-gm-broadcast',
    run: async (p) => {
      await toGameMaker(p, 'make');
      await pil(p, () => window.__gm.setGame([
        { id: 'me', rules: [{ hat: 'key:left', actions: ['move:left'] }, { hat: 'key:right', actions: ['move:right'] }, { hat: 'key:up', actions: ['send:yum', 'say:mia'] }] },
        { id: 'seed', rules: [{ hat: 'tick', actions: ['move:down'] }, { hat: 'touch:ground', actions: ['top'] }] },
        { id: 'stone', rules: [] },
        { id: 'bird', rules: [{ hat: 'tick', actions: ['move:ahead'] }, { hat: 'touch:edge', actions: ['turn'] }, { hat: 'recv:yum', actions: ['say:pio'] }] },
        { id: 'game', rules: [{ hat: 'points:5', actions: ['win'] }, { hat: 'lives0', actions: ['lose'] }] },
      ]));
      await p.waitForTimeout(300);
      await pil(p, () => window.__gmw.select('bird'));
      await p.click('.gm-root .btn-play'); await p.waitForTimeout(900);
      await p.keyboard.press('ArrowUp'); await p.waitForTimeout(480);
    },
  },
  {
    name: 'pp-gm-win',
    run: async (p) => {
      await toGameMaker(p, 'make');
      await pil(p, () => window.__gm.setGame([
        { id: 'me', rules: [{ hat: 'key:right', actions: ['score:1'] }] }, { id: 'seed', rules: [] }, { id: 'stone', rules: [] },
        { id: 'game', rules: [{ hat: 'points:3', actions: ['win'] }] },
      ]));
      await p.click('.gm-root .btn-play'); await p.waitForTimeout(400);
      for (let i = 0; i < 3; i++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(250); }
      await p.waitForSelector('.gm-end[data-end="win"]'); await p.waitForTimeout(1200);
    },
  },
  {
    name: 'pp-gm-lose',
    run: async (p) => {
      await toGameMaker(p, 'make');
      await pil(p, () => window.__gm.setGame([
        { id: 'me', rules: [{ hat: 'key:right', actions: ['lives:-1'] }] }, { id: 'seed', rules: [] }, { id: 'stone', rules: [] },
        { id: 'game', rules: [{ hat: 'lives0', actions: ['lose'] }] },
      ]));
      await p.click('.gm-root .btn-play'); await p.waitForTimeout(400);
      for (let i = 0; i < 3; i++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(250); }
      await p.waitForSelector('.gm-end[data-end="lose"]'); await p.waitForTimeout(1400);
    },
  },
  { name: 'pp-gm-help-make', run: async (p) => { await toGameMaker(p, 'make'); for (let i = 0; i < 3; i++) { await p.click('.gm-root .level-bar .help'); await p.waitForFunction(() => !document.querySelector('.gm-root.is-demo'), null, { timeout: 30_000 }); await p.waitForTimeout(i < 2 ? 2500 : 600); } await p.click('.gm-tab[data-obj="bird"]'); await p.waitForTimeout(500); } },
  { name: 'pp-gm-predict-1', run: async (p) => { await toGameMaker(p, 'predict'); } },
  { name: 'pp-gm-predict-2', run: async (p) => { await toGameMaker(p, 'predict'); await p.click('[data-answer="right"]'); await p.waitForSelector('.gm-predict[data-item="star"]'); await p.waitForTimeout(900); } },
  {
    name: 'pp-gm-predict-3',
    run: async (p) => {
      await toGameMaker(p, 'predict');
      await p.click('[data-answer="right"]'); await p.waitForSelector('.gm-predict[data-item="star"]'); await p.waitForTimeout(500);
      await p.click('[data-answer="life_lost"]'); await p.waitForSelector('.gm-predict[data-item="broadcast"]'); await p.waitForTimeout(900);
    },
  },
  { name: 'pp-gm-liked', run: async (p) => { await toGameMaker(p, 'liked'); } },
  // T8: "Del bloque al texto" (5to)
  { name: 'pp-tx-menu-5to', run: async (p) => { await toFreePlay(p, '5to'); } },
  { name: 'pp-tx-tour', run: async (p) => { await toText(p); } },
  { name: 'pp-tx-tour-link', run: async (p) => { await toText(p); const b = await p.locator('.tx-code .tx-line[data-line="3"]').boundingBox(); await p.mouse.move(b.x + 40, b.y + b.height / 2); await p.waitForTimeout(400); } },
  { name: 'pp-tx-tour-run', run: async (p) => { await toText(p); await p.click('.tx-root .btn-play'); await p.waitForTimeout(2600); } },
  { name: 'pp-tx-predict', run: async (p) => { await toText(p, 0); } },
  { name: 'pp-tx-predict-run', run: async (p) => { await toText(p, 0); await p.click('[data-answer="end_2_0"]'); await p.waitForTimeout(2400); } },
  { name: 'pp-tx-predict-if', run: async (p) => { await toText(p, 1); } },
  { name: 'pp-tx-predict-if-run', run: async (p) => { await toText(p, 1); await p.click('[data-answer="bump_1"]'); await p.waitForTimeout(3400); } },
  { name: 'pp-tx-number', run: async (p) => { await toText(p, 2); } },
  { name: 'pp-tx-number-edit', run: async (p) => { await toText(p, 2); await p.keyboard.press('Backspace'); await p.keyboard.type('4'); await p.waitForTimeout(500); } },
  { name: 'pp-tx-number-run', run: async (p) => { await toText(p, 2); await p.keyboard.press('Backspace'); await p.keyboard.type('4'); await p.click('.tx-root .btn-play'); await p.waitForTimeout(2800); } },
  { name: 'pp-tx-typo-error', run: async (p) => { await toText(p, 3); await p.click('.tx-root .btn-play'); await p.waitForTimeout(1200); } },
  { name: 'pp-tx-typo-colon', run: async (p) => { await toText(p, 4); await p.click('.tx-root .btn-play'); await p.waitForTimeout(1200); } },
  { name: 'pp-tx-typo-help', run: async (p) => { await toText(p, 3); for (let i = 0; i < 3; i++) { await p.click('.tx-root .level-bar .help'); await p.waitForFunction(() => !document.querySelector('.tx-root.is-demo'), null, { timeout: 30_000 }); await p.waitForTimeout(i < 2 ? 1500 : 200); } } },
  { name: 'pp-tx-blocks', run: async (p) => { await toText(p, 5); } },
  { name: 'pp-tx-blocks-until', run: async (p) => { await toText(p, 6); await p.click('[data-answer="same"]'); await p.waitForTimeout(700); } },
  { name: 'pp-tx-write', run: async (p) => { await toText(p, 7); } },
  { name: 'pp-tx-write-error', run: async (p) => { await toText(p, 7); await p.click('.tx-root .btn-play'); await p.waitForTimeout(1200); } },
  { name: 'pp-tx-liked', run: async (p) => { await toText(p); await pil(p, () => window.__tx.go('liked')); await p.waitForTimeout(900); } },
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
