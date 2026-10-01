// Full scripted sessions of the pilot playtest through the real UI, from the
// adult's setup to the adult form, against a playtest build (VITE_PLAYTEST=1:
// the production deploy, or the local compose run on 8810). Needs no secret:
// it only plays, as a child and an adult would, with the ?debug hooks
// solving pages. Prints the created session ids on the last line
// (`SESSION_IDS=<uuid>,<uuid>…`) so they can be checked in an export
// (tools/check-session-data.mjs) and then deleted (tools/delete-sessions.mjs).
//
// Round 2 (T10): the setup is one tap on the grade (no consent tick, no
// code screen), the adult's comment is saved from the corner menu, and the
// goodbye's "jugar otra vez" opens the next child's setup.
//
// 1ro — setup, the character (Pliegue), the real tool check (tap, ▶,
//   drag, ↺, ✋); the ladder: rungs 1 and 2 solved, rung 3 (the fix page)
//   OFFLINE: the three helps, 🔊, a fourth ✋ raises the hand, the adult
//   answers it; the tab RELOADS while offline (the service worker opens the
//   app; the session carries on at the same item with its seeds); two
//   failed runs end the item (ceiling 2); back online; free play: the menu
//   (its thumbnails draw Pliegue), sheet 6 (two pages), the music recess
//   (one song), the time runs out on the menu; the typing game (a 30 s cap):
//   five letters (round 1), the cap ends it, "¿Te gustó?" yes; the wardrobe (the scarf, "listo"); the
//   survey; the goodbye; the adult's comment; "jugar otra vez".
// 5to — Mina; the tool check; the ladder from rung 9: the fog and the three
//   worlds solved, the rule game (rung 11) stopped twice (ceiling 10); free
//   play: the workshop of sheet 15 (five lines refused, two lines: a level
//   that needs a repeat, solved with repetir 5 [→] and pinned); OFFLINE: the
//   text probe (the tour, two predictions, the number item, the liking
//   question), a reload on the menu (free play carries on), the game maker
//   from the adult's corner menu (a game, a rule changed, the three
//   predictions, the liking question); back online; the time runs out; the
//   typing game (one word a round: two words, then "listo"); the wardrobe;
//   the survey; the adult's comment.
// 3ro — Ovillo; the tool check; the ladder from rung 5: 5 and 6 solved, 7
//   failed twice (ceiling 6); free play: the rule game's three pages (3ro-1,
//   3ro-2 and the free page pp-reglas, each won with the arrows), back on
//   the menu; the time runs out; the typing game (one word, "listo"); the
//   wardrobe; the survey;
//   the adult's comment.
//
// Before the sessions it opens the app without ?debug: the adult's setup, and
// no dev tab (a playtest build keeps dev mode off without ?debug).
//
// PW=<dir with playwright> node tools/check-session.mjs [base] [grades…]
//   base:     default http://127.0.0.1:8810/ (e.g. https://camino-prueba.becode.com.ar/)
//   grades:   any of 1ro 3ro 5to (default: 1ro 5to 3ro)
//   SHOTS:    a directory: also a screenshot at every step of the flow, named
//             <grade>-<nn>-<step>-<width>.png (the tour; ?debug's dev tab is hidden in them)
//   VIEWPORT: e.g. 1280x800 (default 1366x768)
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) ?? 'http://127.0.0.1:8810/').replace(/\/?$/, '/');
const grades = args.filter((a) => !/^https?:\/\//.test(a));
const wanted = grades.length ? grades : ['1ro', '5to', '3ro'];
const SHOTS = process.env.SHOTS ?? '';
const [VW, VH] = (process.env.VIEWPORT ?? '1366x768').split('x').map(Number);

let failures = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failures++; return cond; };
const ids = [];

// the tour: a screenshot at each step (SHOTS)
let shotGrade = '';
let shotN = 0;
async function shot(p, name, settle = 700) {
  if (!SHOTS) return;
  await p.waitForTimeout(settle);
  const file = path.join(SHOTS, `${shotGrade}-${String(++shotN).padStart(2, '0')}-${name}-${VW}.png`);
  await p.screenshot({ path: file });
}

// ------------------------------------------------------------------ helpers
async function hold(p, x, y, ms) {
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.waitForTimeout(ms);
  await p.mouse.up();
}
const center = async (p, sel) => { const b = await p.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const idle = (p) => p.waitForFunction(() => document.querySelector('main.level')?.dataset.busy !== 'true', null, { timeout: 30_000 });
const onLevel = (p, id) => p.waitForSelector(`main.level[data-level="${id}"]`, { timeout: 30_000 });
const step = (p) => p.evaluate(() => document.querySelector('.piloto')?.dataset.step);
/** The session's progress as the tab keeps it for a reload (seeds, character). */
const kept = (p) => p.evaluate(() => { try { return JSON.parse(JSON.parse(sessionStorage.getItem('camino.piloto.resume.v1')).progress); } catch { return null; } });
const cheerNext = async (p, name) => {
  await p.waitForSelector('[data-interlude="cheer"]', { timeout: 30_000 });
  if (name) await shot(p, name, 1200);
  await p.locator('.pp-cheer-next').click({ force: true, timeout: 30_000 });
};

/** Drags the palette block `cmd` into the notebook with the mouse. */
async function drag(p, cmd) {
  const [fx, fy] = await center(p, `.zone-palette [data-cmd="${cmd}"]`);
  const t = await p.locator('.zone-program').boundingBox();
  await p.mouse.move(fx, fy); await p.mouse.down(); await p.mouse.move(fx + 30, fy + 10, { steps: 4 });
  await p.mouse.move(t.x + t.width / 2, t.y + 140, { steps: 12 }); await p.mouse.up();
  await p.waitForTimeout(400);
}

/** Solves the page on screen with its reference solution (the ?debug hook), then turns it. */
async function solve(p, name) {
  await p.waitForTimeout(700);
  await p.waitForFunction(() => !document.querySelector('.ghost-hand'), null, { timeout: 30_000 });
  await idle(p);
  if (name) await shot(p, name, 300);
  await p.evaluate(() => { window.__camino.setProgram(window.__camino.level.solution); });
  await p.waitForTimeout(300);
  await p.locator('.btn-play').click();
  await p.locator('.next-page').click({ force: true, timeout: 30_000 });
}

/** A run that does not win. */
async function failRun(p, program = [{ t: 'cmd', cmd: 'up' }]) {
  await p.waitForFunction(() => !document.querySelector('.ghost-hand'), null, { timeout: 30_000 });
  await idle(p);
  await p.evaluate((prog) => { window.__camino.setProgram(prog); }, program);
  await p.waitForTimeout(250);
  await p.locator('.btn-play').click();
  await p.waitForTimeout(500);
  await idle(p);
  await p.waitForTimeout(400);
}

/** A rule game (3ro-1, 3ro-2, pp-reglas): the rules given, ▶, the arrows towards the seeds until the page is won; the page turned. */
async function winRuleGame(p, rules) {
  await p.waitForTimeout(900);
  await p.evaluate((r) => window.__camino.setRules(r ?? window.__camino.level.realtime.solution), rules);
  await p.waitForTimeout(300);
  await p.locator('.btn-play').click();
  await p.waitForTimeout(400);
  const end = Date.now() + 150_000;
  while (Date.now() < end) {
    const st = await p.evaluate(() => {
      const s = window.__camino.sim();
      if (s.won) return { won: true };
      if (s.busy || s.queue.length) return {};
      if (s.seeds?.length) {
        const t = s.seeds.filter((f) => !f.touched).sort((a, b) => b.y - a.y)[0];
        return { key: t && t.c !== s.robot.c ? (t.c > s.robot.c ? 'ArrowRight' : 'ArrowLeft') : null };
      }
      return { maze: true };
    });
    if (st.won) break;
    if (st.maze) {
      // 3ro-1: the way to the seed
      for (const k of ['Up', 'Up', 'Right', 'Right', 'Right', 'Down', 'Right', 'Right', 'Up', 'Up']) { await p.keyboard.press(`Arrow${k}`); await p.waitForTimeout(650); }
      await p.waitForTimeout(1500);
      continue;
    }
    if (st.key) await p.keyboard.press(st.key);
    await p.waitForTimeout(120);
  }
  const won = await p.evaluate(() => window.__camino.sim().won);
  await p.locator('.next-page').click({ force: true, timeout: 20_000 });
  return won;
}

async function newSession(p, grade, character, query) {
  await p.goto(`${base}?${query}#/piloto`);
  await p.waitForSelector('.pp-setup', { timeout: 60_000 });
  await p.getByRole('button', { name: 'A', exact: true }).click();
  await shot(p, 'setup', 200);
  // round 2: one tap on the grade starts (no consent tick, no code screen)
  ok(!(await p.getByRole('checkbox').count()), 'no consent tick at setup');
  await p.getByRole('button', { name: grade, exact: true }).click();
  await p.waitForSelector('.choice-row');
  const sid = await p.evaluate(() => window.__piloto.session().id);
  const code = await p.evaluate(() => window.__piloto.session().code);
  ids.push(sid);
  console.log(`     session ${sid} "${code}" (${grade})`);
  ok(!(await p.evaluate((c) => document.body.innerText.includes(c), code)), 'the session code is shown nowhere');
  await p.waitForTimeout(500);
  await shot(p, 'character');
  await p.locator(`[data-choice-char="${character}"]`).click();
  await p.waitForTimeout(600);
  await shot(p, 'character-picked', 300);
  await p.locator('.doors-next').click({ force: true });
  return { sid, code };
}

/** The service worker controls the page (an offline reload needs it). */
async function serviceWorker(p) {
  const on = await p.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const ready = await Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 15_000))]);
    for (let i = 0; ready && i < 50 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 200));
    return !!navigator.serviceWorker.controller;
  });
  return ok(on, 'the service worker controls the page');
}

/** A reload while offline: the app opens from the service worker's cache and the session carries on at `want`. */
async function offlineReload(p, sid, want) {
  const before = await p.evaluate(() => window.__piloto.status().pending);
  await p.reload({ timeout: 30_000 });
  await p.waitForSelector(`.piloto[data-step="${want}"]`, { timeout: 30_000 });
  const same = await p.evaluate(() => window.__piloto.session()?.id);
  ok(same === sid, `offline reload: the app opened from the cache and the session carried on (step ${want})`);
  const after = await p.evaluate(() => window.__piloto.status());
  ok(after.pending >= before, `offline reload: the queue kept its ${after.pending} events`);
}

async function drain(p) {
  let st;
  for (let i = 0; i < 120; i++) {
    await p.evaluate(() => window.__piloto.flush());
    st = await p.evaluate(() => window.__piloto.status());
    if (st.pending === 0 && st.dirty === 0) break;
    await p.waitForTimeout(1000);
  }
  ok(st.pending === 0 && st.dirty === 0, `queue drained (pending ${st.pending}, dirty ${st.dirty})`);
}

/** The real tool check: tap, ▶, drag, ↺, ✋. */
async function toolCheck(p) {
  await onLevel(p, 'tool-1');
  await p.waitForTimeout(1200);
  await shot(p, 'tool-tap', 0);
  await p.locator('.zone-palette [data-cmd="right"]').first().click();
  await p.waitForTimeout(1200);
  await p.locator('.btn-play').click();
  await onLevel(p, 'tool-2');
  await p.waitForTimeout(1300);
  await shot(p, 'tool-drag', 0);
  await drag(p, 'right');
  await p.waitForTimeout(1200);
  await p.locator('.btn-restart').click();
  await p.waitForTimeout(1200);
  await p.locator('.level-bar .help').click();
  await p.waitForSelector('[data-interlude="walk"]', { timeout: 15_000 });
  await shot(p, 'walk', 900);
  ok(true, 'the tool check (tap, ▶, drag, ↺, ✋) walks on to the ladder');
}

/** Waits for something to fall in the typing game and returns the key it expects. */
async function expectedKey(p) {
  await p.waitForFunction(() => window.__typing?.expected(), null, { timeout: 30_000 });
  return p.evaluate(() => window.__typing.expected());
}

/**
 * The typing game (T12: rounds): `n` things caught with the keyboard (a wrong key among them); then
 * `listo` (shown after round 1) or the cap ends it: the finale, then the liking answer.
 */
async function typing(p, n, liked, listo = false) {
  await p.waitForSelector('.pp-typing', { timeout: 30_000 });
  await shot(p, 'typing-intro', 1500);
  await p.waitForFunction(() => window.__typing?.state().phase === 'play', null, { timeout: 30_000 });
  await shot(p, 'typing-play', 1200);
  for (let i = 0; i < 80 && (await p.evaluate(() => window.__typing.state().caught)) < n; i++) {
    const k = await expectedKey(p);
    if (i === 1) { await p.keyboard.press(k === 'q' ? 'w' : 'q'); await p.waitForTimeout(250); }
    await p.keyboard.press(k === ' ' ? 'Space' : k);
    await p.waitForTimeout(300);
  }
  const st = await p.evaluate(() => window.__typing.state());
  ok(st.caught >= n, `typing: ${st.caught} caught, round ${st.round}, ${st.roundsDone} round(s) done`);
  if (listo) {
    await p.locator('.pp-tk-listo').waitFor({ timeout: 20_000 });
    await p.locator('.pp-tk-listo').click({ force: true });
    ok(true, 'typing: "listo" after round 1');
  }
  await p.waitForSelector('.tk-finale', { timeout: 60_000 });
  await shot(p, 'typing-finale', 1200);
  await p.waitForSelector('[data-question="typing_liked"]', { timeout: 20_000 });
  await shot(p, 'typing-liked');
  await p.locator(`[data-question="typing_liked"] [data-answer="${liked}"]`).click();
  await cheerNext(p);
}

/** The wardrobe, the survey, the goodbye and the adult form. */
async function closing(p, favorite, form) {
  await p.waitForSelector('.mode-wardrobe .hooks', { timeout: 30_000 });
  await p.waitForTimeout(900);
  await shot(p, 'wardrobe', 300);
  await p.locator('[data-prenda="bufanda"]').click();
  await p.waitForTimeout(700);
  await shot(p, 'wardrobe-scarf', 300);
  await p.locator('.wardrobe-next').click({ force: true });
  await p.waitForSelector('.pp-survey');
  for (const [q, a] of [['liked', 'yes'], ['difficulty', 'mid']]) {
    await p.waitForSelector(`[data-question="${q}"]`);
    await shot(p, `survey-${q}`);
    await p.locator(`[data-answer="${a}"]`).click();
    await p.waitForTimeout(1300);
  }
  await p.waitForSelector('[data-question="favorite_activity"]');
  await shot(p, 'survey-favorite');
  const fav = await p.locator(`[data-question="favorite_activity"] [data-answer="${favorite}"]`).count() ? favorite : 'ladder';
  await p.locator(`[data-answer="${fav}"]`).click();
  await p.waitForTimeout(1300);
  await p.waitForSelector('[data-question="play_again"]');
  await shot(p, 'survey-again');
  await p.locator('[data-answer="yes"]').click();
  await p.waitForSelector('.pp-bye .pp-garden-svg', { timeout: 20_000 });
  await p.waitForTimeout(1200);
  await shot(p, 'goodbye', 800);
  const planted = await p.locator('.pp-garden-plant').count();
  ok(planted >= 3, `the goodbye garden grows the session's seeds (${planted} plants)`);
  // the adult's comment, from the corner menu (optional since round 2)
  await hold(p, 18, 18, 1700);
  await p.locator('[data-act="adult-form"]').click();
  await p.locator(`[data-value="${form.engagement}"]`).click();
  await p.locator(`[data-value="${form.help}"]`).click();
  await p.fill('.pp-comment textarea', form.comment);
  await shot(p, 'adult-form', 300);
  await p.locator('[data-act="save-form"]').click();
  await shot(p, 'saved', 300);
  await p.locator('.pp-adult-close').click();
  await drain(p);
  await p.locator('.pp-again').click();
  await p.waitForSelector('.pp-setup');
  ok(true, '"jugar otra vez": the next child\'s setup');
}

// ------------------------------------------------------------------ the sessions
const SESSIONS = {
  async '1ro'(ctx, p) {
    const { sid } = await newSession(p, '1ro', 'pliegue', 'debug&teclas=0.5');
    await serviceWorker(p);
    await toolCheck(p);
    await onLevel(p, 'pp-l1'); await solve(p, 'ladder-1-sequence');
    await onLevel(p, 'pp-l2'); await solve(p, 'ladder-2-long-sequence');
    await onLevel(p, 'pp-l3');
    await p.waitForTimeout(900);
    await shot(p, 'ladder-3-fix', 300);
    // offline: the helps, 🔊, the raised hand and the adult's answer
    await ctx.setOffline(true);
    await p.locator('.level-bar .help').click(); await p.waitForTimeout(700);
    await p.locator('.level-bar .help').click(); await p.waitForTimeout(3000);
    await p.locator('.level-bar .help').click(); await p.waitForTimeout(1500);
    await shot(p, 'ladder-3-help3-footprints', 0);
    await p.locator('.level-bar .speak').click(); await p.waitForTimeout(300);
    await p.locator('.level-bar .help').click(); await p.waitForTimeout(800);
    ok(await p.locator('.pp-hand').isVisible(), 'offline: a fourth ✋ raises the hand');
    await shot(p, 'ladder-3-hand-raised', 300);
    const [hx, hy] = await center(p, '.pp-hand');
    await hold(p, hx, hy, 1500);
    await shot(p, 'adult-help-panel', 300);
    await p.locator('[data-kind="hint"]').click();
    ok(!(await p.locator('.pp-hand').count()), 'offline: the adult answered, the hand is down');
    const before = await kept(p);
    // the tab reloads while offline
    await offlineReload(p, sid, 'ladder');
    await onLevel(p, 'pp-l3');
    await shot(p, 'ladder-3-after-offline-reload', 1200);
    ok(true, 'the ladder carried on with the item on screen (rung 3)');
    ok((await p.locator('.level-bar .adult-title').innerText()).length > 0 && !(await p.locator('.dev-drawer.is-open').count()), 'the page is the child\'s (no dev drawer open)');
    await failRun(p, [{ t: 'cmd', cmd: 'right' }]);
    await failRun(p, [{ t: 'cmd', cmd: 'right' }]);
    await p.waitForSelector('[data-interlude="cheer"]', { timeout: 20_000 });
    await shot(p, 'ladder-cheer', 1200);
    ok(true, 'two failed runs end the item; the ladder stops with the cheer (still offline)');
    const off = await p.evaluate(() => window.__piloto.status());
    ok(off.pending > 5 && off.failures > 0, `offline: ${off.pending} events wait, ${off.failures} failed posts`);
    await ctx.setOffline(false);
    await cheerNext(p);
    // free play
    await p.waitForSelector('.pp-menu');
    const cards = await p.locator('.pp-fp-card').evaluateAll((els) => els.map((e) => e.dataset.activity));
    ok(cards.join(',') === 'sheet,recess,guardas,editor', `1ro menu: ${cards.join(',')}`);
    await shot(p, 'menu', 1500);
    ok(await p.locator('.pp-fp-card[data-activity="sheet"] svg.thumb svg').count() >= 1, 'the menu\'s board thumbnails draw the child\'s character (Pliegue), not Brote');
    const after = await kept(p);
    ok(before?.seeds >= 2 && after?.seeds >= before.seeds && after?.character === 'pliegue', `the progress written after the reload kept the seeds and the character (${before?.seeds} → ${after?.seeds}, ${after?.character})`);
    await p.waitForTimeout(800);
    await p.locator('.pp-fp-card[data-activity="sheet"]').click();
    for (const id of ['1ro-h6-1', '1ro-h6-2']) { await onLevel(p, id); await solve(p, `fp-sheet-${id.slice(-1)}`); }
    await p.waitForTimeout(800);
    await p.locator('.pp-menu-back').click();
    await p.waitForSelector('.pp-menu');
    await p.waitForTimeout(600);
    await p.locator('.pp-fp-card[data-activity="recess"]').click();
    await onLevel(p, '1ro-h9-1'); await solve(p, 'fp-recess');
    await p.waitForTimeout(600);
    await p.locator('.pp-menu-back').click();
    await p.waitForSelector('.pp-menu');
    ok(true, 'free play: sheet 6 (two pages) and the recess (one song), back to the menu');
    await p.locator('.pp-fp-card[data-activity="guardas"]').click();
    await p.waitForSelector('main.level', { timeout: 20_000 });
    await shot(p, 'fp-guardas', 1500);
    await p.locator('.pp-menu-back').click();
    await p.waitForSelector('.pp-menu');
    await p.waitForTimeout(600);
    await p.locator('.pp-fp-card[data-activity="editor"]').click();
    await shot(p, 'fp-editor', 3000);
    await p.locator('.pp-menu-back').click();
    await p.waitForSelector('.pp-menu');
    await p.evaluate(() => window.__freePlay.budget(0));
    await cheerNext(p, 'fp-over');
    await typing(p, 5, 'yes');
    await closing(p, 'sheet', { engagement: 'high', help: 'some', comment: 'Chequeo automático: sesión completa de 1ro.' });
  },

  async '5to'(ctx, p) {
    const { sid } = await newSession(p, '5to', 'mina', 'debug&nointro&teclas=1&metas=1');
    await serviceWorker(p);
    await toolCheck(p);
    await onLevel(p, 'pp-l9'); await solve(p, 'ladder-9-fog');
    await onLevel(p, 'pp-l10'); await solve(p, 'ladder-10-worlds');
    await onLevel(p, 'pp-l11');
    await p.waitForTimeout(900);
    await shot(p, 'ladder-11-rules', 300);
    await p.evaluate(() => window.__camino.setRules([{ hat: 'key:right', actions: ['right'] }]));
    for (let i = 0; i < 2; i++) {
      await p.locator('.btn-play').click(); await p.waitForTimeout(500);
      for (const k of ['ArrowRight', 'ArrowRight']) { await p.keyboard.press(k); await p.waitForTimeout(700); }
      await p.locator('.btn-play').click(); await p.waitForTimeout(900);
    }
    await p.waitForSelector('[data-interlude="cheer"]', { timeout: 20_000 });
    ok(true, 'ladder: the fog and the three worlds solved, the rule game stopped twice: the cheer');
    await cheerNext(p, 'ladder-cheer');
    // free play: the limited workshop (sheet 15)
    await p.waitForSelector('.pp-menu');
    const cards = await p.locator('.pp-fp-card').evaluateAll((els) => els.map((e) => e.dataset.activity));
    ok(cards.join(',') === 'rule_game,editor,recess,text_probe', `5to menu: ${cards.join(',')}`);
    await shot(p, 'menu', 1500);
    await p.locator('.pp-fp-card[data-activity="editor"]').click();
    await p.waitForSelector('.lines-note', { timeout: 20_000 });
    await p.waitForTimeout(2500);
    await p.waitForFunction(() => !document.querySelector('.ghost-hand'), null, { timeout: 30_000 });
    await p.waitForTimeout(300);
    await shot(p, 'fp-workshop15', 300);
    const lines = () => p.evaluate(() => Number(document.querySelector('.lines-note')?.getAttribute('data-lines')));
    ok((await lines()) === 2, 'workshop 15: the notebook starts with two lines');
    for (let i = 0; i < 3; i++) { await p.click('[data-lines-btn="more"]', { force: true }); await p.waitForTimeout(260); }
    await p.click('.btn-play');
    await p.waitForTimeout(500);
    const pageKind = () => p.evaluate(() => window.__freePlay.view().page?.kind);
    await shot(p, 'fp-workshop15-refused', 300);
    ok((await pageKind()) === 'taller' && (await p.locator('.board .thought').count()) > 0, 'workshop 15: five lines fit a plan without repeat: ▶ is refused (the character thinks of the repeat)');
    await p.waitForTimeout(3000);
    for (let i = 0; i < 3; i++) { await p.click('[data-lines-btn="less"]', { force: true }); await p.waitForTimeout(260); }
    await p.click('.btn-play');
    await p.waitForFunction(() => window.__freePlay.view().page?.kind === 'probar', null, { timeout: 15_000 });
    await p.waitForTimeout(900);
    await p.click('.zone-palette [data-cmd="repeat"]'); await p.waitForTimeout(260);
    await p.click('.zone-palette [data-cmd="right"]'); await p.waitForTimeout(260);
    for (let i = 0; i < 3; i++) { await p.click('.zone-program .tape-count'); await p.waitForTimeout(260); }
    const prog = await p.evaluate(() => window.__camino.program);
    await shot(p, 'fp-workshop15-test', 300);
    ok(JSON.stringify(prog) === JSON.stringify([{ t: 'loop', count: 5, body: ['right'] }]), `workshop 15: the test page, repetir 5 [→] built with taps (${JSON.stringify(prog)})`);
    await p.click('.btn-play');
    await p.locator('.next-page').click({ force: true, timeout: 30_000 });
    await p.waitForFunction(() => window.__freePlay.view().page?.kind === 'cartelera', null, { timeout: 15_000 });
    await p.waitForTimeout(1200);
    await shot(p, 'fp-workshop15-corkboard', 300);
    ok(await p.locator('.cork .limit-badge').count() >= 1, 'workshop 15: the level is pinned on the corkboard with its repeat\'s tape');
    await p.locator('.pp-menu-back').click();
    await p.waitForSelector('.pp-menu');
    // offline: the text probe, a short path
    await ctx.setOffline(true);
    await p.waitForTimeout(600);
    await p.locator('.pp-fp-card[data-activity="text_probe"]').click();
    await p.waitForSelector('.tx-root[data-item="tour"]');
    await p.waitForTimeout(900);
    await shot(p, 'fp-text-tour', 300);
    await p.click('.tx-root .btn-play');
    await p.locator('.tx-next').click({ force: true, timeout: 30_000 });
    await p.waitForSelector('.tx-root[data-item="predict_loop"]'); await p.waitForTimeout(700);
    await shot(p, 'fp-text-predict', 300);
    await p.click('[data-answer="end_2_0"]');
    await p.locator('.tx-next').click({ force: true, timeout: 30_000 });
    await p.waitForSelector('.tx-root[data-item="predict_if"]'); await p.waitForTimeout(700);
    await p.click('[data-answer="end_8"]');
    await p.locator('.tx-next').click({ force: true, timeout: 30_000 });
    await p.waitForSelector('.tx-root[data-item="number"]'); await p.waitForTimeout(700);
    await shot(p, 'fp-text-number', 300);
    await p.keyboard.press('Backspace');
    await p.keyboard.type('4');
    await p.waitForTimeout(300);
    await p.click('.tx-root .btn-play');
    await p.waitForTimeout(300);
    await p.waitForFunction(() => !document.querySelector('.tx-root[data-busy="true"]'), null, { timeout: 30_000 });
    await shot(p, 'fp-text-number-solved', 300);
    ok(await p.locator('.tx-next').count() === 1, 'offline, text probe: the number item typed (range(4)) reaches the seed');
    await p.evaluate(() => window.__tx.go('liked'));
    await p.waitForSelector('.tx-liked');
    await shot(p, 'fp-text-liked');
    await p.click('.tx-liked [data-answer="yes"]');
    await cheerNext(p);
    await p.waitForSelector('.pp-menu');
    // the tab reloads offline on the menu: free play carries on
    await offlineReload(p, sid, 'free_play');
    await p.waitForSelector('.pp-menu');
    await shot(p, 'menu-after-offline-reload', 1500);
    // the game maker from the adult's corner menu
    await p.waitForTimeout(800);
    await hold(p, 12, 12, 1700);
    await shot(p, 'adult-menu', 300);
    await p.locator('[data-act="open-game-maker"]').click();
    await p.waitForSelector('.gm-root[data-phase="play"]');
    await shot(p, 'fp-game-maker', 800);
    await p.click('.gm-root .btn-play');
    for (let i = 0; i < 12; i++) {
      const d = await p.evaluate(() => { const s = window.__gmw.state(); const me = s.sprites.me, seed = s.sprites.seed; return seed.c > me.c ? 'Right' : seed.c < me.c ? 'Left' : null; });
      if (d) await p.keyboard.press(`Arrow${d}`);
      await p.waitForTimeout(220);
    }
    if (!(await p.locator('.gm-end').count())) await p.click('.gm-root .btn-play');
    await p.evaluate(() => window.__gm.go('change'));
    await p.waitForSelector('.gm-root[data-phase="change"]');
    await p.waitForTimeout(600);
    await p.click('[data-chip="seed:1:0"]');
    await p.waitForTimeout(300);
    await shot(p, 'fp-game-maker-change', 300);
    await p.evaluate(() => window.__gm.go('predict'));
    for (const [item, answer] of [['key', 'right'], ['star', 'star_points'], ['broadcast', 'bird_says']]) {
      await p.waitForSelector(`.gm-predict[data-item="${item}"]`);
      await p.waitForTimeout(400);
      await shot(p, `fp-game-maker-predict-${item}`, 300);
      await p.click(`[data-answer="${answer}"]`);
    }
    await p.waitForSelector('[data-question="game_maker_liked"]');
    await shot(p, 'fp-game-maker-liked');
    await p.click('[data-answer="mid"]');
    await p.waitForSelector('.pp-menu', { timeout: 30_000 });
    ok(true, 'offline, game maker (the adult\'s menu): a game, a rule changed, three predictions, the liking answer');
    const off = await p.evaluate(() => window.__piloto.status());
    ok(off.pending > 5 && off.failures > 0, `offline: ${off.pending} events wait, ${off.failures} failed posts`);
    await ctx.setOffline(false);
    await p.evaluate(() => window.__freePlay.budget(0));
    await cheerNext(p, 'fp-over');
    await typing(p, 2, 'mid', true);
    await closing(p, 'text_probe', { engagement: 'mid', help: 'none', comment: 'Chequeo automático: sesión completa de 5to.' });
  },

  async '3ro'(ctx, p) {
    await newSession(p, '3ro', 'ovillo', 'debug&nointro&teclas=1&metas=1');
    await serviceWorker(p);
    await toolCheck(p);
    await onLevel(p, 'pp-l5'); await solve(p, 'ladder-5-repeat');
    await onLevel(p, 'pp-l6'); await solve(p, 'ladder-6-count');
    await onLevel(p, 'pp-l7');
    await shot(p, 'ladder-7-pattern', 1200);
    await failRun(p);
    await failRun(p);
    await p.waitForSelector('[data-interlude="cheer"]', { timeout: 20_000 });
    ok(true, 'ladder: rungs 5 and 6 solved, 7 failed twice: the cheer');
    await cheerNext(p, 'ladder-cheer');
    await p.waitForSelector('.pp-menu');
    const cards = await p.locator('.pp-fp-card').evaluateAll((els) => els.map((e) => e.dataset.activity));
    ok(cards.join(',') === 'rule_game,sheet,recess,editor', `3ro menu: ${cards.join(',')}`);
    await shot(p, 'menu', 1500);
    await p.locator('.pp-fp-card[data-activity="rule_game"]').click();
    await onLevel(p, '3ro-1');
    await shot(p, 'fp-rules-1', 1200);
    ok(await winRuleGame(p), 'rule game 3ro-1 won with the arrows');
    await onLevel(p, '3ro-2');
    await shot(p, 'fp-rules-2', 1200);
    ok(await winRuleGame(p), 'rule game 3ro-2 won (five seeds)');
    await onLevel(p, 'pp-reglas');
    await shot(p, 'fp-rules-free', 1200);
    ok(await winRuleGame(p, [{ hat: 'key:left', actions: ['left'] }, { hat: 'key:right', actions: ['right'] }, { hat: 'touch:seed', actions: ['score'] }]), 'the free rule page pp-reglas won with the child\'s own rules (eight seeds)');
    await p.waitForSelector('.pp-menu', { timeout: 30_000 });
    ok(true, 'after the free page, back on the menu');
    await p.locator('.pp-fp-card[data-activity="sheet"]').click();
    await p.waitForSelector('main.level', { timeout: 20_000 });
    await shot(p, 'fp-sheet13', 1500);
    await p.locator('.pp-menu-back').click();
    await p.waitForSelector('.pp-menu');
    await p.evaluate(() => window.__freePlay.budget(0));
    await cheerNext(p, 'fp-over');
    await typing(p, 1, 'no', true);
    await closing(p, 'rule_game', { engagement: 'high', help: 'none', comment: 'Chequeo automático: sesión de 3ro.' });
  },
};

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
try {
  { // without ?debug: what the adult and the child see
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
    const p = await ctx.newPage();
    await p.goto(base);
    await p.waitForSelector('.pp-setup', { timeout: 60_000 });
    await p.waitForTimeout(1200);
    ok(await p.locator('.dev-tab, .dev-drawer').count() === 0, 'without ?debug the root opens the adult\'s setup and shows no dev tab');
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `all-00-setup-nodebug-${VW}.png`) });
    await ctx.close();
  }
  for (const g of wanted) {
    const run = SESSIONS[g];
    if (!run) { ok(false, `unknown grade ${g} (1ro, 3ro or 5to)`); continue; }
    console.log(`--- ${g} (${base})`);
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
    // the tour's pictures are the child's: ?debug's dev tab is hidden in them
    if (SHOTS) await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.dev-tab{display:none!important}'; document.head.append(st); }));
    shotGrade = g;
    shotN = 0;
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${g}: ${e}`));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(m.text())) errors.push(`${g}: ${m.text()}`); });
    const t0 = Date.now();
    try {
      await run(ctx, p);
    } catch (e) {
      ok(false, `${g} session stopped: ${String(e.message ?? e).split('\n')[0]}`);
      const shot = path.join(tmpdir(), `check-session-${g}-failure.png`);
      await p.screenshot({ path: shot }).then(() => console.log(`     screenshot: ${shot}`)).catch(() => {});
    }
    console.log(`     ${g}: ${Math.round((Date.now() - t0) / 1000)} s`);
    await ctx.close();
  }
  ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} finally {
  await browser.close();
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
console.log(`SESSION_IDS=${ids.join(',')}`);
process.exit(failures ? 1 : 0);
