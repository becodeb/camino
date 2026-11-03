// T43/T44's scripted check, rewritten in T59 (2026-11-03) for 1ro's route as
// it is after the in-class changes of that day: "Los juegos del monstruo"
// played through the real UI by the bookmark link (`?grado=1&sonido=no`), and
// its telemetry in Postgres.
//
// The route: character → the guided pass (`games`: "La receta del monstruo"
// then "¿Qué salió mal?", FIVE rounds each; the dance and "Tocá y pasa" are no
// longer in it) → the green flag → the gentle blocks ladder (`ladder`, entry
// rung 1) → the arcade (`free_play`), four big cards: ¡Pum! Letras, Carrera de
// teclas, Vestidor, La receta. No survey anywhere.
//
// - The character choice → the guided pass, never the tool check; the
//   first-time wordless ghost demo plays.
// - "La receta del monstruo", round 1: the sandwich built upside down with
//   real taps → the bell → the monster eats, makes a disgusted face and
//   spits it out, the wrong layer circled; only the right layers under it
//   stay. Then built right (one card dragged with the mouse, one layer
//   tapped off and put back) → the monster's happy face, confetti.
//   Round 2: very fast taps on the tray make the character dizzy (input
//   waits, `rapid_taps`); then built right. Rounds 3, 4 and 5 (tiers 3–5, the
//   last with two monsters) → the guided turn ends with a cheer.
// - T52 (understood by a 6-year-old): the recipe's first-time ghost really
//   puts the bread on the plate (then hands over), the plate shows the
//   wanted layers faded in their places, the next one marked, and a layer
//   that is not wanted makes the monster frown at once.
// - "¿Qué salió mal?": the strip plays (taps ignored), the child's turn; a
//   right step shakes ("no"), the wrong one is circled in a red frame; a wrong
//   option shakes, the right one dragged onto it → the routine plays again
//   right. Round 2 (the wrong order): the step lifts, a tap on a step that is
//   not its partner shakes, the partner swaps them. Round 3, then rounds 4 and
//   5 played generically → the cheer → the ladder.
// - The gentle ladder (T53, 2026-11-03: ~7 minutes, never kicks a child out):
//   the green flag is up; rung 1 and 2 solved with the reference solution;
//   rung 3 (the fix page) failed four times stays open, the fifth failed run
//   ends the item and the ladder steps DOWN (`check: 'floor'` rung 2) instead
//   of stopping; "Quedan 5 minutos" during the ladder shows only the banner
//   (the level stays, nothing ends); "Juegos para todos" during the floor item
//   waits for the level (it stays on screen), and when it is solved the ladder
//   ends (`wrap_up`), the cheer, and the arcade (needs ADMIN_PASSWORD; without
//   it the arcade is reached by the debug jump).
// - The arcade: four big cards (`pop typing_race wardrobe recipe`), all in
//   view, big, the caption not cut. ¡Pum! Letras: the first-time ghost pops a
//   bubble, a wrong key loses nothing (the bubble stays, `wrong` counts), the
//   physical key and the drawn one both pop (`sources`), the wave cleared →
//   confetti and the two large choices "¡Otra vez!" / "Otro juego", the next
//   wave one tier up, the corner button leaves. The recipe from the arcade
//   opens at the tier reached (5: two monsters), "¡Otra vez!" one tier up, the
//   bar's small button leaves.
// - T51: every end screen offers "¡Otra vez!" and "Otro juego" side by side
//   (≥ 96 px tall, different drawings); while playing any card the corner's
//   drawn "Otro juego" is a large button (≥ 64 px) over no target. Ways out
//   in Postgres: `game_exit` with each `via`. The wardrobe and the typing
//   letters race, left by the corner button / their podium's "Otro juego".
// - T49 (with ADMIN_PASSWORD): /admin names the game on screen ("juego libre ·
//   ¡Pum! Letras"); "Quedan 5 minutos" in the arcade shows only the banner
//   (the game stays, no survey, no wardrobe); "terminar la clase" → the
//   countdown, then the rest screen.
// - Everything inside the viewport (no scrolling), targets ≥ 48 px; no page
//   errors.
// - Postgres: game_start (guided recipe, oops; arcade pop and recipe with
//   voluntary/replay), game_round per round (recipe round 1: 2 attempts, an
//   order error; five guided rounds each; pop's wave fields), game_end,
//   rapid_taps, the ghost demos, the steps character → games → ladder →
//   free_play, route_done at the end of the guided pass, the gentle ladder's
//   rows (a floor step down, `ladder_end.reason` wrap_up), `class_command`
//   five_min with no `wrap_up` step and no survey_answer at all.
//
// Not covered here (left the 1ro route on 2026-11-03): "Copiá el baile" (its
// card is only on the classic menu, `?ruta=clasica`; no check opens it now, the
// tools/check-piloto.mjs visit to that menu is ¡Pum! Letras) and "Tocá y pasa"
// (in no menu any more).
//
// PW=<dir with playwright> node tools/check-monstruo.mjs [base]
//   base:     the app with /api (default http://127.0.0.1:8812/: the API serving a VITE_PLAYTEST=1 build)
//   PSQL:     psql against the API's database (default "docker exec -i camino-prueba-1ro-db psql -U postgres -tA")
//   SHOTS:    optional directory for screenshots (<name>-<width>.png)
//   VIEWPORT: e.g. 1280x800 (default 1366x768)
//   ADMIN_PASSWORD: the local throwaway (the ladder's "Quedan 5 minutos" / "Juegos para todos", T49's /admin and class-end part; skipped without it)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const base = (process.argv[2] ?? 'http://127.0.0.1:8812/').replace(/\/?$/, '/');
const PSQL = process.env.PSQL ?? 'docker exec -i camino-prueba-1ro-db psql -U postgres -tA';
const SHOTS = process.env.SHOTS ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const [VW, VH] = (process.env.VIEWPORT ?? '1366x768').split('x').map(Number);
const sql = (q) => execSync(PSQL, { input: q }).toString().trim();
const json = (q) => JSON.parse(sql(`select coalesce(json_agg(_r), '[]') from (${q}) _r;`) || '[]');

let failures = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failures++; return cond; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${name}-${VW}.png`) }); };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch|401|429/.test(m.text())) errors.push(m.text()); });

const st = () => p.evaluate(() => window.__monster.state());
const card = (ing) => p.locator(`.rx-card[data-ing="${ing}"]`);
const stackIs = (n) => p.waitForFunction((nn) => window.__monster.state().stack.length === nn, n, { timeout: 8000 });
const waitBuild = (round) => p.waitForFunction((r) => { const s = window.__monster?.state(); return s && s.phase === 'build' && (r == null || s.round === r); }, round ?? null, { timeout: 20_000 });
/** Taps the cards of `items` one by one, at a child's calm pace. */
async function build(items) {
  for (const ing of items) {
    const n = (await st()).stack.length;
    await card(ing).click();
    await stackIs(n + 1);
    await p.waitForTimeout(450);
  }
}
/** A real mouse drag from a tray card onto the plate. */
async function drag(ing) {
  const from = await card(ing).boundingBox();
  const to = await p.locator('.rx-plate-hit').boundingBox();
  await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(from.x + from.width / 2 + (to.x + to.width / 2 - from.x - from.width / 2) * (i / 10), from.y + from.height / 2 + (to.y + to.height / 2 - from.y - from.height / 2) * (i / 10));
  await p.mouse.up();
}
/** A real mouse tap at an element's centre, even while it is aria-disabled (a child taps it anyway). */
async function rawTap(sel) { const b = await p.locator(sel).boundingBox(); await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
/** Waits for a monster game's phase (and round). */
const waitPhase = (game, phase, round) => p.waitForFunction(([g, ph, r]) => { const x = window.__monster?.state(); return x && x.game === g && x.phase === ph && (r == null || x.round === r); }, [game, phase, round ?? null], { timeout: 25_000 });
/** Taps a pose card at a child's pace. */
/** A real mouse drag from one element to another. */
async function dragTo(fromSel, toSel) {
  const from = await p.locator(fromSel).boundingBox();
  const to = await p.locator(toSel).boundingBox();
  const a = { x: from.x + from.width / 2, y: from.y + from.height / 2 }, b = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  await p.mouse.move(a.x, a.y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(a.x + (b.x - a.x) * (i / 12), a.y + (b.y - a.y) * (i / 12));
  await p.mouse.up();
}
/** No scrolling: the page fits the viewport. */
const fits = () => p.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
async function hold(x, y, ms) { await p.mouse.move(x, y); await p.mouse.down(); await p.waitForTimeout(ms); await p.mouse.up(); }
const wrongOf = (order) => {
  // the same ingredients in another order (an order error): swap the first two different layers
  const o = order.slice();
  const j = o.findIndex((x) => x !== o[0]);
  [o[0], o[j]] = [o[j], o[0]];
  return o;
};

/** T51: the corner's "Otro juego" while playing: large, in view, over no target (and not in the bar). */
async function homeOk(name) {
  const r = await p.evaluate(() => {
    const b = document.querySelector('.pp-play-home');
    if (!b || getComputedStyle(b).display === 'none') return null;
    const h = b.getBoundingClientRect();
    const hit = (e) => { const x = e.getBoundingClientRect(); return x.width > 0 && x.height > 0 && x.left < h.right && x.right > h.left && x.top < h.bottom && x.bottom > h.top; };
    const sel = '.ga-target, .ga-ready, .ga-again, .tp-mode, .cast-btn, .choice-btn, .doors-next, .wardrobe-next, .hook button, .level-bar, .tr-text';
    const over = [...document.querySelectorAll(sel)].filter((e) => !b.contains(e) && getComputedStyle(e).visibility !== 'hidden' && hit(e)).map((e) => e.className.baseVal ?? e.className);
    return { w: h.width, h: h.height, inView: h.left >= 0 && h.bottom <= innerHeight, art: !!b.querySelector('.ga-home-art'), over };
  });
  ok(!!r && r.w >= 64 && r.h >= 64 && r.inView && r.art && r.over.length === 0, `${name}: the corner's drawn "Otro juego" is large and over no target (${r ? `${Math.round(r.w)}×${Math.round(r.h)}${r.over.length ? `, over ${r.over.join(' / ')}` : ''}` : 'missing'})`);
}
/** T51: an end screen's two large choices side by side, with different drawings; the corner button hidden meanwhile. */
async function endOk(name, againSel = '.ga-again', stackedOk = false) {
  await p.waitForSelector('.ga-end .ga-home', { timeout: 10_000 });
  await p.waitForTimeout(1600);
  const r = await p.evaluate((aSel) => {
    const a = document.querySelector(aSel.startsWith('/') ? aSel.slice(1) : `.ga-end ${aSel}`), h = document.querySelector('.ga-end .ga-home');
    if (!a || !h) return null;
    const ra = a.getBoundingClientRect(), rh = h.getBoundingClientRect();
    const corner = document.querySelector('.pp-play-home');
    return {
      ah: ra.height, hh: rh.height, side: Math.abs((ra.top + ra.bottom) / 2 - (rh.top + rh.bottom) / 2) < 12 && ra.right <= rh.left,
      stacked: ra.bottom <= rh.top && Math.abs((ra.left + ra.right) / 2 - (rh.left + rh.right) / 2) < 12,
      inView: rh.bottom <= innerHeight && rh.right <= innerWidth, distinct: !!h.querySelector('.ga-home-art') && !a.querySelector('.ga-home-art'),
      cornerHidden: !corner || getComputedStyle(corner).display === 'none',
    };
  }, againSel);
  ok(!!r && r.ah >= 96 && r.hh >= 96 && (r.side || (stackedOk && r.stacked)) && r.inView && r.distinct && r.cornerHidden, `${name}: the end screen's "¡Otra vez!" and "Otro juego", large, ${stackedOk ? 'side by side or one over the other' : 'side by side'}, different drawings (${r ? `${Math.round(r.ah)} / ${Math.round(r.hh)} px${r.side ? ', side by side' : r.stacked ? ', stacked' : ', neither'}` : 'missing'})`);
}


/** The ladder's helpers (the same as tools/check-piloto.mjs; the page's own ?debug hook). */
const center = async (sel) => { const b = await p.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const levelIdle = () => p.waitForFunction(() => document.querySelector('main.level')?.dataset.busy !== 'true', null, { timeout: 30_000 });
const onLevel = (id, timeout = 30_000) => p.waitForSelector(`main.level[data-level="${id}"]`, { timeout });
/** Solves the page on screen with its reference solution (the ?debug hook), then turns it. */
async function solvePage() {
  // the first page of a kind plays its wordless ghost demo (it runs the notebook itself): let it finish
  await p.waitForTimeout(1500);
  await p.waitForSelector('.ghost-hand', { state: 'detached', timeout: 30_000 }).catch(() => {});
  await levelIdle();
  await p.waitForTimeout(500);
  await p.evaluate(() => { window.__camino.setProgram(window.__camino.level.solution); });
  await p.waitForTimeout(300);
  await p.locator('.btn-play').click();
  await p.locator('.next-page').click({ force: true, timeout: 30_000 });
}
/** A full-length run that does not win: the reference solution with its last arrow changed (a shorter notebook is "incomplete", and the fix page's given program run unchanged is not a failed run). */
async function failRun() {
  await p.evaluate(() => {
    const sol = window.__camino.level.solution;
    const prog = sol.map((c, i) => (i === sol.length - 1 && c.t === 'cmd' ? { ...c, cmd: c.cmd === 'up' ? 'right' : 'up' } : c));
    window.__camino.setProgram(prog);
  });
  await p.waitForTimeout(250);
  await p.locator('.btn-play').click();
  await p.waitForTimeout(500);
  await levelIdle();
  await p.waitForTimeout(400);
}
const ladderState = () => p.evaluate(() => window.__ladder.state());
/** The class panel (/admin) as the teacher: logged in once, on its own context. */
let actx = null, apage = null;
async function adminPage() {
  if (apage) return apage;
  actx = await browser.newContext({ viewport: { width: VW, height: VH } });
  apage = await actx.newPage();
  apage.on('pageerror', (e) => errors.push(`admin: ${e}`));
  await apage.goto(`${base}admin`);
  await apage.waitForSelector('#login-card:not([hidden])', { timeout: 30_000 });
  await apage.fill('#password', ADMIN_PASSWORD);
  await apage.click('#login-btn');
  await apage.waitForSelector('#panel:not([hidden])', { timeout: 10_000 });
  return apage;
}
/** The kid app polls for class commands with its sync: push it. */
const syncNow = () => p.evaluate(() => window.__piloto.flush());

let sid = null;
try {
  let s;
  // ---------------------------------------------------------------- the bookmark: character → the guided games
  await p.goto(`${base}?debug&grado=1&sonido=no#/piloto`);
  await p.waitForSelector('.piloto[data-step="character"] .choice-row', { timeout: 30_000 });
  sid = await p.evaluate(() => window.__piloto.session()?.id);
  ok(!!sid, `session ${sid} (grade 1, muted)`);
  await p.locator('.choice-btn[data-choice-char="brote"]').click();
  await p.waitForTimeout(500);
  await p.locator('.doors-next').click({ force: true });
  await p.waitForSelector('.piloto[data-step="games"] .rx-game', { timeout: 20_000 });
  ok(true, 'after the character: the guided monster games (no tool check, no ladder)');
  ok((await p.locator('.pp-cap.is-upper').count()) > 0, 'muted 1ro: the on-screen text is on, in capital letters');
  const ghost = await p.waitForSelector('.ghost-hand', { timeout: 6000 }).then(() => true).catch(() => false);
  ok(ghost, 'the first-time wordless ghost demo plays (the bubble, a card to the plate, the bell)');
  await p.waitForTimeout(900);
  await shot(p, 'recipe-ghost');
  await p.waitForSelector('.ghost-hand', { state: 'detached', timeout: 15_000 }).catch(() => {});
  ok(await fits(), 'the game fits the viewport (no scrolling)');
  // T52: the ghost's drag really put the bread on the plate; the rest of the sandwich faded in its place, the next layer marked
  s = await st();
  ok(s.stack.join() === 'pan', `T52: the first-time ghost really put the bread on the plate, then handed over (${s.stack.join(' ')})`);
  ok((await p.locator('.rx-ghost').count()) === s.order.length - 1 && (await p.locator(`.rx-ghost.is-next[data-ing="${s.order[1]}"]`).count()) === 1,
    'T52: the plate shows the layers still to put, faded in their places, the next one marked');
  await shot(p, 'recipe-handover');
  // a layer that is not wanted: the monster frowns at once (judged only at the bell), then it comes off
  const notWanted = ['queso', 'tomate', 'lechuga', 'jamon'].find((x) => !s.order.includes(x));
  await card(notWanted).click();
  await p.waitForSelector('.mx-monster.is-yuck', { timeout: 2000 });
  ok((await st()).phase === 'build', 'T52: a layer it does not want makes the monster frown at once (still building)');
  await p.waitForTimeout(450);
  await p.locator('.rx-layer.ga-target[data-layer="0"]').click();
  await stackIs(0);
  await p.waitForTimeout(450);
  const sizes = await p.evaluate(() => [...document.querySelectorAll('.rx-card, .ga-ready, .level-bar .help')].map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  ok(sizes.length >= 6 && sizes.every((s) => s >= 48), `every card and the bell are ≥ 48 px (${sizes.map(Math.round).join(', ')})`);

  // ---------------------------------------------------------------- round 1: wrong order → disgust and spit; then right
  await waitBuild(1);
  s = await st();
  ok(s.tier === 1 && s.monsters === 1 && s.order.length === 2 && s.order[0] === 'pan', `round 1: one monster, a 2-layer sandwich (${s.order.join(' ')})`);
  const wrong = wrongOf(s.order);
  await build(wrong);
  await shot(p, 'recipe-full-wrong');
  await p.locator('.ga-ready.is-ready').click();
  await p.waitForSelector('.mx-monster.is-yuck', { timeout: 4000 });
  await p.waitForTimeout(300);
  await shot(p, 'recipe-yuck');
  ok(true, 'a wrong order: the monster makes a disgusted face');
  await p.waitForSelector('.rx-layer.is-wrong', { timeout: 4000 });
  ok((await p.locator('.rx-wrong-ring').count()) === 1, 'it spits it out: back on the plate with the wrong layer circled');
  await p.waitForTimeout(400);
  await shot(p, 'recipe-spit');
  await waitBuild(1);
  s = await st();
  ok(s.stack.length === 0, `only the right layers under the wrong one stay (${s.stack.length} left)`);
  // right: the first by a real drag, the second by a tap; then one tapped off and put back
  await drag(s.order[0]);
  await stackIs(1);
  ok(true, 'a card dragged onto the plate lands like a tap');
  await card(s.order[1]).click();
  await stackIs(2);
  await p.waitForTimeout(450);
  await p.locator('.rx-layer.ga-target[data-layer="1"]').click();
  await stackIs(1);
  ok(true, 'a tap on a layer takes it off');
  await p.waitForTimeout(450);
  await card(s.order[1]).click();
  await stackIs(2);
  await p.waitForTimeout(450);
  await p.locator('.ga-ready.is-ready').click();
  await p.waitForSelector('.mx-monster.is-yum', { timeout: 4000 });
  await p.waitForTimeout(700);
  await shot(p, 'recipe-yum');
  ok((await p.locator('.ga-confetti').count()) === 1, 'the right one: the monster is happy, confetti');
  await p.waitForFunction(() => window.__monster.state().phase === 'won', null, { timeout: 6000 });

  // ---------------------------------------------------------------- round 2: very fast taps → dizzy; then right
  await waitBuild(2);
  s = await st();
  ok(s.tier === 2 && s.order.length === 3, `round 2 is a little harder: 3 layers (${s.order.join(' ')})`);
  await p.waitForTimeout(400);
  // a child hammering one card: raw mouse clicks ~60 ms apart
  const tb = await card('tomate').boundingBox();
  for (let i = 0; i < 6; i++) { await p.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2); await p.waitForTimeout(60); }
  await p.waitForSelector('.ga-game.is-dizzy', { timeout: 3000 });
  await p.waitForTimeout(500);
  await shot(p, 'recipe-dizzy');
  const during = (await st()).stack.length;
  ok((await p.locator('.ga-dizzy-stars').count()) === 1, `very fast taps: the character sits dizzy (${during} of 6 taps counted)`);
  await card('pan').click();
  await p.waitForTimeout(200);
  ok((await st()).stack.length === during, 'while dizzy, a tap does nothing (and nothing is lost)');
  await p.waitForSelector('.ga-game.is-dizzy', { state: 'detached', timeout: 5000 });
  ok(true, 'the character stands up again');
  if ((await st()).stack.length) { await p.locator('.rx-layer.ga-target[data-layer="0"]').click(); await stackIs(0); }
  await p.waitForTimeout(450);
  await build(s.order);
  await p.locator('.ga-ready.is-ready').click();
  await p.waitForSelector('.mx-monster.is-yum', { timeout: 4000 });

  // ---------------------------------------------------------------- rounds 3, 4 and 5 (T54: five rounds a game), then "¿Qué salió mal?"
  await waitBuild(3);
  s = await st();
  ok(s.tier === 3 && s.order.length === 4, `round 3: 4 layers (${s.order.join(' ')})`);
  await build(s.order);
  await shot(p, 'recipe-round3');
  await p.locator('.ga-ready.is-ready').click();
  /** A recipe round served with the debug hook's right plate, one monster after the other. */
  async function serveRound(r) {
    await waitBuild(r);
    const x = await st();
    for (let m = 0; m < x.monsters; m++) {
      if (m > 0) await p.waitForFunction((mm) => { const y = window.__monster.state(); return y.phase === 'build' && y.monster === mm; }, m, { timeout: 10_000 });
      await p.waitForTimeout(500);
      await p.evaluate(() => window.__monster.fill());
      await p.waitForFunction((n) => window.__monster.state().stack.length === n, (await st()).order.length, { timeout: 5000 });
      await p.waitForTimeout(400);
      await p.locator('.ga-ready.is-ready').click();
    }
    return x;
  }
  s = await serveRound(4);
  ok(s.tier === 4 && s.order.length === 5 && s.monsters === 1, `round 4 is the fourth round of the pass: tier 4, ${s.order.length} layers`);
  s = await serveRound(5);
  ok(s.tier === 5 && s.monsters === 2, `round 5, the last of the pass: tier 5, two monsters (${s.monsters})`);
  await p.waitForSelector('.pp-cheer', { timeout: 15_000 });
  ok(true, 'the recipe\'s guided turn ends with a cheer after FIVE rounds');
  await p.locator('.pp-cheer-next').click();

  // ---------------------------------------------------------------- T46 "¿Qué salió mal?"
  await p.waitForSelector('.piloto[data-step="games"] .oo-game', { timeout: 15_000 });
  ok(true, 'the guided pass goes on: "¿Qué salió mal?"');
  await waitPhase('oops', 'play', 1);
  s = await st();
  ok(s.routine === 'cold' && s.kind === 'replace' && s.steps.length === 3, `round 1: ${s.routine}, ${s.steps.join(' ')}`);
  await p.waitForTimeout(1500);
  await rawTap('.oo-frame[data-i="1"]');
  const playing = await st();
  ok(playing.phase === 'play' && playing.found === null, 'a tap while the strip plays is ignored');
  await shot(p, 'oops-play');
  await waitPhase('oops', 'find', 1);
  await p.waitForTimeout(700);
  await shot(p, 'oops-find');
  ok((await p.locator('.oo-sheet.is-turn').count()) === 1, 'the child\'s turn: the steps light up');
  ok((await p.locator('.oo-frame.is-bad[data-i="2"]').count()) === 1, 'T52: the funny bad result keeps acting, in a red frame');
  ok(await p.waitForSelector('.ghost-hand', { timeout: 4000 }).then(() => true).catch(() => false), 'the first-time ghost demo taps a step');
  await p.waitForSelector('.ghost-hand', { state: 'detached', timeout: 10_000 }).catch(() => {});
  ok(await fits(), '"¿Qué salió mal?" fits the viewport');
  const fsizes = await p.evaluate(() => [...document.querySelectorAll('.oo-frame')].map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  ok(fsizes.every((x) => x >= 48), `the steps are ≥ 48 px (${fsizes.map(Math.round).join(', ')})`);
  await p.locator('.oo-frame[data-i="0"]').click();
  await p.waitForSelector('.oo-frame.is-no', { timeout: 2000 });
  await p.waitForTimeout(120);
  await shot(p, 'oops-no');
  ok((await st()).phase === 'find', 'a right step tapped: it shakes, a gentle "no"; still looking');
  await p.waitForTimeout(500);
  await p.locator('.oo-frame[data-i="1"]').click();
  await waitPhase('oops', 'fix', 1);
  await p.waitForTimeout(700);
  await shot(p, 'oops-found');
  ok((await p.locator('.oo-ring').count()) === 1 && (await p.locator('.oo-option').count()) === 3, 'the wrong step circled in red pen; three options below');
  const osizes = await p.evaluate(() => [...document.querySelectorAll('.oo-option')].map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  ok(osizes.every((x) => x >= 48), `the options are ≥ 48 px (${osizes.map(Math.round).join(', ')})`);
  await p.locator('.oo-option[data-step="sunhat_on"]').click();
  await p.waitForSelector('.oo-option.is-no', { timeout: 2000 });
  ok((await st()).phase === 'fix', 'a wrong option shakes and stays');
  await p.waitForTimeout(500);
  await dragTo('.oo-option[data-step="coat_on"]', '.oo-frame[data-i="1"]');
  await p.waitForFunction(() => window.__monster.state().phase === 'replay', null, { timeout: 4000 });
  ok(true, 'the right option dragged onto the circled step: fixed, the routine plays again');
  await p.waitForTimeout(2600);
  await shot(p, 'oops-replay');
  await waitPhase('oops', 'won', 1);
  await p.waitForTimeout(500);
  await shot(p, 'oops-won');
  ok((await p.locator('.ga-confetti').count()) === 1 && (await st()).steps.join() === 'window_snow,coat_on,snow_play', 'it ends happy, confetti');
  // round 2: the wrong order
  await waitPhase('oops', 'find', 2);
  s = await st();
  ok(s.routine === 'socks' && s.kind === 'swap', `round 2: ${s.routine} (${s.steps.join(' ')})`);
  await p.waitForSelector('.oo-sheet.is-turn', { timeout: 3000 });
  await p.waitForTimeout(800);
  await p.locator('.oo-frame[data-i="1"]').click();
  await waitPhase('oops', 'swap', 2);
  await p.waitForTimeout(500);
  await shot(p, 'oops-lifted');
  await p.locator('.oo-frame[data-i="2"]').click();
  await p.waitForSelector('.oo-frame.is-no', { timeout: 2000 });
  ok((await st()).phase === 'swap', 'a step that is not its partner shakes');
  await p.waitForTimeout(500);
  await p.locator('.oo-frame[data-i="0"]').click();
  await p.waitForTimeout(250);
  await shot(p, 'oops-swap');
  await p.waitForFunction(() => window.__monster.state().steps.join() === 'socks_on,shoes_on,walk_happy', null, { timeout: 4000 });
  ok(true, 'the partner tapped: they swap, socks first');
  await waitPhase('oops', 'won', 2);
  // round 3: soup, found and fixed at the first try
  await waitPhase('oops', 'find', 3);
  s = await st();
  ok(s.routine === 'soup' && s.steps.length === 4, `round 3: ${s.routine}, 4 steps`);
  await p.waitForTimeout(900);
  await shot(p, 'oops-four');
  await p.locator(`.oo-frame[data-i="${s.wrongAt[0]}"]`).click();
  await waitPhase('oops', 'fix', 3);
  await p.waitForTimeout(500);
  await p.locator('.oo-option[data-step="spoon_take"]').click();
  /** Rounds 4 and 5, played from whatever the routine is (a wrong step to replace, or two to swap). */
  async function playOops(r) {
    await waitPhase('oops', 'find', r);
    await p.waitForSelector('.oo-sheet.is-turn', { timeout: 8000 });
    await p.waitForTimeout(900);
    const o = await st();
    if (o.kind === 'replace') {
      await p.locator(`.oo-frame[data-i="${o.wrongAt[0]}"]`).click();
      await waitPhase('oops', 'fix', r);
      await p.waitForTimeout(600);
      await p.locator(`.oo-option[data-step="${o.right[o.wrongAt[0]]}"]`).click();
    } else {
      await p.locator(`.oo-frame[data-i="${o.wrongAt[0]}"]`).click();
      await waitPhase('oops', 'swap', r);
      await p.waitForTimeout(500);
      await p.locator(`.oo-frame[data-i="${o.wrongAt[1]}"]`).click();
    }
    return o;
  }
  s = await playOops(4);
  ok(s.routine === 'teeth' && s.steps.length === 4, `round 4: ${s.routine}, 4 steps`);
  s = await playOops(5);
  ok(['cold', 'socks', 'soup', 'teeth'].includes(s.routine), `round 5, the last of the pass: ${s.routine}`);
  await p.waitForSelector('.pp-cheer', { timeout: 20_000 });
  ok(true, '"¿Qué salió mal?"\'s guided turn ends with a cheer after FIVE rounds');
  await p.locator('.pp-cheer-next').click();

  // ---------------------------------------------------------------- the gentle ladder (T53, 2026-11-03)
  await p.waitForSelector('.piloto[data-step="ladder"]', { timeout: 30_000 });
  ok(true, 'after the guided pass: the blocks ladder, not the arcade');
  ok((await p.locator('.piloto.route-done').count()) === 1, 'leaving the guided pass raised the green flag');
  await onLevel('pp-l1', 40_000);
  ok((await ladderState()).entry === 1 && (await ladderState()).gentle === true, 'the ladder is the gentle one (entry rung 1)');
  ok((await p.locator('.pp-chapter-strip').count()) === 0, 'no progress strip over the ladder (the user took it off)');
  await shot(p, 'ladder-1');
  await solvePage();
  await onLevel('pp-l2');
  await solvePage();
  await onLevel('pp-l3');
  await p.waitForTimeout(800);
  // "Quedan 5 minutos" is only the banner: the level stays, nothing ends
  if (ADMIN_PASSWORD) {
    const a = await adminPage();
    await a.click('#five-min');
    await syncNow();
    await p.waitForSelector('.pp-five', { timeout: 25_000 });
    await shot(p, 'ladder-five-banner');
    await p.waitForTimeout(4000);
    ok((await p.locator('main.level[data-level="pp-l3"]').count()) === 1 && (await ladderState()).items.length === 2 && (await p.evaluate(() => window.__piloto.flow().step)) === 'ladder',
      '"Quedan 5 minutos" during the ladder: the banner only, the level and the ladder stay');
  }
  // five failed runs end the item (not two)
  for (let i = 1; i <= 4; i++) {
    await failRun();
    ok((await p.locator('main.level[data-level="pp-l3"]').count()) === 1 && (await ladderState()).items.length === 2, `failed run ${i} of 5: the item stays open`);
  }
  // the fifth failed run ends it (a press of ▶ that the page was too busy to take is pressed again: `attempts` in Postgres says it was five)
  for (let i = 0; i < 4; i++) {
    await failRun();
    if (await p.waitForSelector('main.level[data-level="pp-l3"]', { state: 'detached', timeout: 4000 }).then(() => true).catch(() => false)) break;
  }
  // (the walk to the next page is short: wait for the next page itself)
  await onLevel('pp-l2', 25_000);
  let ls = await ladderState();
  ok(ls.items.length === 3 && ls.items[2].rung === 3 && ls.items[2].result === 'fail', `the fifth failed run ends the item as a fail (${JSON.stringify(ls.items[2])})`);
  // the ladder never kicks a child out: it steps one rung down
  ok(ls.items.length === 3, 'the ladder did not stop: it stepped down to the easier rung 2 (the next page is pp-l2)');
  await shot(p, 'ladder-floor');
  if (ADMIN_PASSWORD) {
    const a = await adminPage();
    await a.click('#games-all');
    await syncNow();
    await p.waitForTimeout(7000);
    await syncNow();
    ok((await p.locator('main.level[data-level="pp-l2"]').count()) === 1 && (await p.evaluate(() => window.__piloto.flow().step)) === 'ladder',
      '"Juegos para todos" during the ladder waits: the level on screen is not cut');
    ok((await p.evaluate(() => window.__piloto.flow().gamesAllPending)) === true, 'the flow keeps `gamesAllPending` while the level is open');
    await solvePage();
    await p.waitForSelector('[data-interlude="cheer"]', { timeout: 20_000 });
    ok(true, 'the level solved: the ladder ends with the cheer');
    await p.locator('.pp-cheer-next').click({ force: true });
  } else {
    console.log('     (no ADMIN_PASSWORD: "Quedan 5 minutos" / "Juegos para todos" on the ladder are skipped; the arcade by the debug jump)');
    await p.evaluate(() => window.__piloto.jump('free_play'));
  }

  // ---------------------------------------------------------------- the arcade: four big cards
  await p.waitForSelector('.piloto[data-step="free_play"] .pp-menu', { timeout: 20_000 });
  const menu = await p.locator('.pp-menu').getAttribute('data-menu');
  ok(menu === 'pop typing_race wardrobe recipe', `1ro's arcade: ${menu} (four cards)`);
  await p.waitForTimeout(800);
  ok(await fits(), 'the arcade menu fits the viewport');
  const msizes = await p.evaluate(() => [...document.querySelectorAll('.pp-fp-card')].map((e) => { const r = e.getBoundingClientRect(); return [Math.min(r.width, r.height), r.bottom <= innerHeight && r.right <= innerWidth]; }));
  ok(msizes.length === 4 && msizes.every(([x, inView]) => x >= 120 && inView), `four big cards, all in view and ≥ 120 px (${msizes.map(([x]) => Math.round(x)).join(', ')})`);
  const cap = await p.evaluate(() => { const t = document.querySelector('.pp-cap-text'); return t ? { text: t.textContent, cut: t.scrollHeight > t.clientHeight + 4, h: [t.scrollHeight, t.clientHeight] } : null; });
  ok(!!cap && !cap.cut && !/receta/i.test(cap.text), `the menu's caption is short and not cut off (${cap?.text} ${cap?.h})`);
  await shot(p, 'arcade-menu');

  // ---------------------------------------------------------------- ¡Pum! Letras
  await p.locator('.pp-fp-card[data-activity="pop"]').click();
  await p.waitForSelector('.pz-game', { timeout: 15_000 });
  await p.waitForFunction(() => window.__monster?.state().game === 'pop' && window.__monster.state().items.length > 0, null, { timeout: 15_000 });
  const popGhost = await p.waitForSelector('.ghost-hand', { timeout: 8000 }).then(() => true).catch(() => false);
  ok(popGhost, 'the first-time wordless ghost demo plays (it points at a bubble and taps its key)');
  await p.waitForSelector('.ghost-hand', { state: 'detached', timeout: 20_000 }).catch(() => {});
  ok(await fits(), '¡Pum! Letras fits the viewport');
  s = await st();
  ok(s.round === 1 && s.tier === 1 && s.phase === 'play' && s.wrong === 0, `wave 1 at tier 1 (${s.items.map((x) => x.text).join(' ')})`);
  ok((await p.locator('.pz-kb .pp-key').count()) >= 26 && (await p.locator('.pz-item.is-target').count()) === 1, 'the drawn keyboard under the scene, one bubble to type now (circled)');
  await shot(p, 'pop-play');
  // a wrong key loses nothing
  s = await st();
  const live = s.items.map((x) => x.text[0]);
  const wrongKey = 'zxqwkj'.split('').find((k) => !live.includes(k.toUpperCase()));
  await p.keyboard.press(wrongKey);
  await p.waitForTimeout(250);
  const afterWrong = await st();
  ok(afterWrong.wrong === s.wrong + 1 && afterWrong.items.length === s.items.length && afterWrong.stars === s.stars, `a wrong key (${wrongKey}) loses nothing: ${afterWrong.items.length} bubbles stay, wrong ${afterWrong.wrong}`);
  // the physical keyboard pops the bubble to type now
  s = await st();
  await p.keyboard.press(s.expected.toLowerCase());
  await p.waitForFunction((n) => window.__monster.state().stars === n + 1, s.stars, { timeout: 4000 });
  ok(true, `the physical key "${s.expected}" popped its bubble: a star on the pile`);
  // the drawn keyboard pops too
  // (the bubble to type can change under the finger as bubbles come and go: read it fresh and try again)
  let touched = null;
  for (let k = 0; k < 6 && !touched; k++) {
    await p.waitForFunction(() => !!window.__monster.state().expected, null, { timeout: 15_000 });
    s = await st();
    // (the key to press pulses, so Playwright never sees it "stable": a real mouse tap at its centre, as a child's finger)
    await rawTap(`.pz-kb [data-key="${s.expected}"]`).catch(() => {});
    if (await p.waitForFunction((n) => window.__monster.state().stars > n, s.stars, { timeout: 2500 }).then(() => true).catch(() => false)) touched = s.expected;
  }
  ok(!!touched, `the drawn key "${touched}" popped its bubble too`);
  await homeOk('¡Pum! Letras');
  // clearing the wave: confetti and the two large choices
  await p.evaluate(() => window.__monster.clear());
  await endOk('¡Pum! Letras');
  await shot(p, 'pop-end');
  ok((await p.locator('.ga-confetti').count()) >= 1, 'the sky is clear: confetti');
  await p.locator('.ga-again').click();
  await p.waitForFunction(() => window.__monster.state().round === 2, null, { timeout: 6000 });
  s = await st();
  ok(s.round === 2 && s.tier === 2, `"¡Otra vez!": wave 2, one tier up (tier ${s.tier})`);
  await p.waitForFunction(() => window.__monster.state().items.length > 0, null, { timeout: 10_000 });
  await shot(p, 'pop-wave2');
  await p.evaluate(() => window.__monster.clear());
  await p.waitForSelector('.ga-end .ga-home', { timeout: 10_000 });
  await p.waitForTimeout(1600);
  await p.locator('.ga-end .ga-home').click();
  await p.waitForSelector('.pp-menu', { timeout: 10_000 });
  ok(true, '¡Pum! Letras: wave 2 cleared, and left by the end screen\'s "Otro juego"');

  // ---------------------------------------------------------------- the arcade: the recipe again, "¡Otra vez!"
  await p.locator('.pp-fp-card[data-activity="recipe"]').click();
  await p.waitForSelector('.rx-game', { timeout: 10_000 });
  await waitBuild(1);
  s = await st();
  ok(s.tier === 5 && s.monsters === 2, `the recipe from the arcade opens at the tier reached (tier ${s.tier}, ${s.monsters} monsters)`);
  ok((await p.locator('.ghost-hand').count()) === 0, 'no ghost demo the second time');
  await build(s.order);
  await homeOk('the recipe (the plate full, two monsters)');
  await p.locator('.ga-ready.is-ready').click();
  await p.waitForFunction(() => { const x = window.__monster.state(); return x.phase === 'build' && x.monster === 1; }, null, { timeout: 8000 });
  ok(true, 'the first monster served, the second one\'s turn');
  await p.evaluate(() => window.__monster.fill());
  await p.waitForTimeout(500);
  await p.locator('.ga-ready.is-ready').click();
  await endOk('the recipe');
  await shot(p, 'arcade-won');
  ok(true, 'a won round in the arcade offers "¡Otra vez!"');
  await p.locator('.ga-again').click();
  await waitBuild(2);
  s = await st();
  ok(s.tier === 6, `"¡Otra vez!": a little harder (tier ${s.tier}, ${s.monsters} monsters, ${s.order.length} layers)`);
  await p.waitForTimeout(500);
  await shot(p, 'recipe-hardest');
  await serveRound(2);
  await p.waitForSelector('.ga-again', { timeout: 10_000 });
  await p.locator('.ga-again').click();
  await waitBuild(3);
  await p.waitForTimeout(500);
  await card((await st()).order[0]).click();
  await p.waitForTimeout(500);
  await p.locator('.pp-menu-back').click();
  await p.waitForSelector('.pp-menu', { timeout: 10_000 });
  ok(true, '"volver al menú" mid-round (the bar\'s small button, kept for adults)');

  // ---------------------------------------------------------------- T51: the wardrobe and the typing letters race, and back by their "Otro juego"
  await p.locator('.pp-fp-card[data-activity="wardrobe"]').click();
  await p.waitForSelector('.piloto[data-step="wardrobe"] .mode-wardrobe', { timeout: 10_000 });
  await p.waitForTimeout(900);
  await homeOk('the wardrobe');
  await shot(p, 'wardrobe-home');
  await p.locator('.pp-play-home').click();
  await p.waitForSelector('.piloto[data-step="free_play"] .pp-menu', { timeout: 10_000 });
  ok(true, 'the wardrobe left by the corner\'s "Otro juego"');
  await p.locator('.pp-fp-card[data-activity="typing_race"]').click();
  await p.waitForSelector('main.pp-trace', { timeout: 20_000 });
  await p.waitForTimeout(1200);
  await homeOk('the typing letters race');
  await shot(p, 'typing-home');
  for (let i = 0; i < 120; i++) {
    const t = await p.evaluate(() => window.__typingRace?.state());
    if (!t || t.phase !== 'input' || t.crossed) break;
    if (t.word && t.typed < t.word.length) await p.keyboard.press(t.word[t.typed]);
    await p.waitForTimeout(320);
  }
  await p.waitForSelector('.pp-trace.is-podium', { timeout: 40_000 });
  await endOk('the typing letters race\'s podium', '/.rc-again', true);
  await p.waitForTimeout(1500);
  await shot(p, 'typing-end');
  await p.locator('.ga-end .ga-home').click();
  await p.waitForSelector('.pp-menu', { timeout: 10_000 });
  ok(true, 'a typing letters race finished, and back to the games by its podium\'s "Otro juego"');
  await hold(20, 20, 1100);
  await p.waitForSelector('.pp-adult-sheet', { timeout: 5000 });
  const acts = await p.locator('.pp-adult-sheet [data-act]').evaluateAll((els) => els.map((e) => e.getAttribute('data-act')));
  ok(acts.includes('open-race') && acts.includes('open-ladder') && !acts.includes('open-game-maker'), `the adult menu opens La carrera and the ladder, not the 4to/5to probes (${acts.join(', ')})`);
  await p.locator('.pp-adult-close').scrollIntoViewIfNeeded();
  const closeBox = await p.locator('.pp-adult-close').boundingBox();
  ok(!!closeBox && closeBox.y + closeBox.height / 2 <= VH, 'the adult menu\'s "Cerrar" can be reached (the sheet scrolls inside the veil when it is taller than the window)');
  await shot(p, 'arcade-adult-menu');
  await p.locator('.pp-adult-close').click();
  await p.evaluate(() => window.__piloto.flush());
  await p.waitForTimeout(2500);


  // ---------------------------------------------------------------- T49: /admin names the game; "quedan 5 minutos" is only the banner; "terminar la clase"
  if (ADMIN_PASSWORD) {
    const a = await adminPage();
    await p.locator('.pp-fp-card[data-activity="pop"]').click();
    await p.waitForSelector('.pz-game', { timeout: 10_000 });
    await p.waitForFunction(() => window.__monster?.state().expected, null, { timeout: 15_000 });
    await p.keyboard.press((await st()).expected.toLowerCase());
    await syncNow();
    await a.waitForFunction((id) => /¡Pum! Letras/.test(document.querySelector(`#class-rows tr[data-id="${id}"]`)?.textContent ?? ''), sid, { timeout: 25_000 });
    const where = await a.locator(`#class-rows tr[data-id="${sid}"] td[data-where]`).innerText();
    ok(/juego libre · ¡Pum! Letras/.test(where), `/admin names the game on screen ("${where}")`);
    await a.locator(`#class-rows tr[data-id="${sid}"]`).scrollIntoViewIfNeeded();
    await shot(a, 'admin-game');
    // "quedan 5 minutos" in the arcade: only the banner; the game stays, no survey, no wardrobe
    await a.click('#five-min');
    await a.click('#five-min').catch(() => {});
    await syncNow();
    await p.waitForSelector('.pp-five', { timeout: 25_000 });
    await shot(p, 'arcade-five-banner');
    await p.waitForTimeout(6000);
    const stepNow = await p.evaluate(() => window.__piloto.flow().step);
    ok(stepNow === 'free_play' && (await p.locator('.pz-game').count()) === 1 && (await p.locator('.pp-survey').count()) === 0, `"Quedan 5 minutos": only the banner (step ${stepNow}, the game goes on, no survey)`);
    await p.locator('.pp-play-home').click();
    await p.waitForSelector('.pp-menu', { timeout: 10_000 });
    ok(true, 'after the warning the arcade menu is still there');
    // "terminar la clase": the countdown, then the rest screen
    await a.click('#end-class'); await a.click('#end-class');
    await p.waitForSelector('.pp-end-banner', { timeout: 20_000 });
    await shot(p, 'class-end-banner');
    await p.waitForSelector('[data-class-end="rest"]', { timeout: 25_000 });
    await shot(p, 'class-end-rest');
    const ended = await p.evaluate(() => window.__piloto.session());
    ok(ended.end_reason === 'class_end' && !!ended.ended_at, `"terminar la clase": the countdown, then the session ended (${ended.end_reason})`);
    await actx.close();
  } else console.log('     (no ADMIN_PASSWORD: the /admin, "Quedan 5 minutos" and class-end part is skipped)');
} catch (e) {
  ok(false, `stopped: ${String(e.message ?? e).split('\n')[0]}`);
  await shot(p, 'stopped');
} finally {
  await browser.close();
}

// ---------------------------------------------------------------- Postgres (this session only)
try {
  const ev = (type) => json(`select payload from events where session_id = '${sid}' and type = '${type}' order by seq`).map((r) => r.payload);
  const allStarts = ev('game_start');
  ok(allStarts.filter((x) => x.mode === 'guided').map((x) => x.game).join(' ') === 'recipe oops', `the guided pass: recipe, oops (${allStarts.map((x) => `${x.game}:${x.mode}`).join(' ')})`);
  const starts = allStarts.filter((x) => x.game === 'recipe');
  ok(starts.length === 2 && starts[0].mode === 'guided' && starts[0].voluntary === false && starts[1].mode === 'arcade' && starts[1].voluntary === true && starts[1].replay === true && starts[1].play_no === 2 && starts[1].tier === 5,
    `game_start: guided, then the arcade's voluntary replay at the tier reached (${JSON.stringify(starts.map((x) => [x.mode, x.play_no, x.tier, x.voluntary, x.replay]))})`);
  const allRounds = ev('game_round');
  const rounds = allRounds.filter((x) => x.game === 'recipe');
  const r1 = rounds[0];
  ok(r1 && r1.round === 1 && r1.attempts === 2 && r1.correct === false && r1.order_errors === 1 && r1.wrong_at?.[0] === 0 && r1.sources?.drag === 1 && r1.ghost_placed === 1,
    `game_round 1: two attempts, one order error at the bottom layer, one drag (${JSON.stringify(r1)})`);
  ok(rounds[1]?.correct === true && rounds[2]?.correct === true && rounds.slice(0, 5).every((r) => r.mode === 'guided' && r.ms > 0 && r.first_input_ms != null),
    `game_round 2 and 3 right on the first try, with their times (${rounds.length} rows)`);
  ok(rounds.slice(0, 5).map((r) => r.round).join() === '1,2,3,4,5' && rounds.slice(0, 5).map((r) => r.tier).join() === '1,2,3,4,5', 'the guided recipe is five rounds, tiers 1 to 5');
  ok(rounds.some((r) => r.mode === 'arcade' && r.again === true), 'an arcade round started by "¡Otra vez!" is flagged `again`');
  ok(rounds.some((r) => r.mode === 'arcade' && r.solved === false), 'the round left mid-way is logged unsolved');
  // ¿qué salió mal?
  const orr = allRounds.filter((x) => x.game === 'oops' && x.solved);
  ok(orr[0]?.routine === 'cold' && orr[0].found_try === 2 && orr[0].fix_correct === false && orr[0].fix_tries === 2 && orr[0].sources?.drag === 1 && orr[0].attempts === 3 && orr[0].correct === false && orr[0].first_tap_ms > 0,
    `oops round 1: found at the 2nd try, a wrong fix, then dragged right (${JSON.stringify(orr[0])})`);
  ok(orr[1]?.routine === 'socks' && orr[1].kind === 'swap' && orr[1].found_try === 1 && orr[1].fix_tries === 2 && orr[1].fix_correct === false, `oops round 2: the swap (${JSON.stringify(orr[1])})`);
  ok(orr[2]?.routine === 'soup' && orr[2].found_try === 1 && orr[2].fix_correct === true && orr[2].correct === true, `oops round 3: right at once (${JSON.stringify(orr[2])})`);
  ok(orr.length === 5 && orr.every((x) => x.mode === 'guided'), `oops: five guided rounds (${orr.map((x) => x.routine).join(' ')})`);
  const allEnds = ev('game_end');
  const oe = allEnds.filter((x) => x.game === 'oops');
  ok(oe[0]?.reason === 'finished' && oe[0]?.rounds === 5, `oops game_end: finished, 5 rounds (${JSON.stringify(oe.map((x) => [x.mode, x.reason, x.rounds]))})`);
  const ends = allEnds.filter((x) => x.game === 'recipe');
  ok(ends.length === 2 && ends[0].reason === 'finished' && ends[0].rounds === 5 && ends[1].reason === 'quit', `recipe game_end: the guided pass finished (5 rounds), the arcade play quit mid-round (${JSON.stringify(ends.map((x) => [x.mode, x.reason, x.rounds]))})`);
  const rapid = ev('rapid_taps');
  ok(rapid.length >= 1 && rapid[0].game === 'recipe' && rapid[0].taps >= 4 && rapid[0].window_ms <= 1000, `rapid_taps: ${JSON.stringify(rapid)}`);
  const demos = ev('ghost_demo');
  ok(['recipe', 'oops', 'pop'].every((g) => demos.filter((d) => d.level_id === `game:${g}` && d.kind === 'intro').length === 1), `each game's ghost demo once (${JSON.stringify(demos)})`);

  // ¡Pum! Letras
  const ps = allStarts.filter((x) => x.game === 'pop');
  ok(ps.length === 2 && ps.every((x) => x.mode === 'arcade' && x.voluntary === true) && ps[1].replay === true && ps[0].replay === false && ps[0].tier === 1, `pop game_start: the arcade pick, then the pick again (${JSON.stringify(ps.map((x) => [x.mode, x.play_no, x.tier, x.replay]))})`);
  const pr = allRounds.filter((x) => x.game === 'pop');
  const w1 = pr.find((x) => x.solved === true);
  ok(w1 && w1.mode === 'arcade' && w1.round === 1 && w1.tier === 1 && w1.popped >= 2 && w1.wrong >= 1 && w1.right >= 2 && w1.correct === false && w1.attempts === w1.right + w1.wrong && w1.accuracy < 100 && w1.sources?.key >= 1 && w1.sources?.touch >= 1 && w1.landed >= 0 && w1.tier_end >= 1 && w1.tier_ups >= 0 && Array.isArray(w1.texts) && w1.texts.length >= w1.popped && w1.wave_ms > 0 && w1.adapt_top >= 0,
    `pop game_round: a wave won with its measures (${JSON.stringify({ ...w1, texts: `${w1?.texts?.length} texts` })})`);
  const won = pr.filter((x) => x.solved === true);
  ok(won.length === 2 && won[1].round === 2 && won[1].tier === 2 && won[1].again === true && won[0].again == null, `pop: two waves won, the second by "¡Otra vez!" at tier 2 (${JSON.stringify(won.map((x) => [x.round, x.tier, x.again, x.tier_end]))})`);
  ok(pr.some((x) => x.solved === false && x.play_no === 2 && x.round === 1 && x.mode === 'arcade'), 'the wave left mid-way (a key typed) is logged unsolved');
  const pe = allEnds.filter((x) => x.game === 'pop');
  ok(pe.length === 2 && pe[0].reason === 'finished' && pe[0].rounds === 2 && pe[0].physical >= 1 && pe[0].touch >= 1 && pe[0].popped >= 2 && pe[0].right === pe[0].keys_typed - pe[0].wrong && pe[0].accuracy < 100 && pe[1].reason === 'quit' && pe[1].rounds === 0 && pe[1].physical === 1,
    `pop game_end: the first play finished (two waves, the totals), the second left mid-wave (${JSON.stringify(pe.map((x) => [x.reason, x.rounds, x.physical, x.touch, x.popped, x.accuracy]))})`);

  // the route: steps, the green flag, the gentle ladder
  const stepRows = ev('step');
  const steps = stepRows.map((x) => `${x.from}>${x.to}`);
  ok(steps.slice(0, 4).join(' ') === 'setup>character character>games games>ladder ladder>free_play', `steps: ${steps.join(' ')}`);
  ok(stepRows.every((x) => !x.wrap_up) && !steps.some((x) => /survey|wardrobe>/.test(x) && !/free_play>wardrobe|wardrobe>free_play/.test(x)), 'no step was a "Quedan 5 minutos" way out, none went through a survey');
  ok(ev('route_done').length === 1, 'route_done once');
  const lsteps = ev('ladder_step');
  const seq = lsteps.map((x) => `${x.rung}${x.check === 'floor' ? 'f' : ''}${x.result === 'pass' ? '✓' : '✗'}`).join(' ');
  ok(seq === '1✓ 2✓ 3✗ 2f✓', `the gentle ladder: 1✓ 2✓ 3✗ then a step down 2f✓ (${seq})`);
  ok(lsteps[2].attempts === 5 && lsteps[2].end_reason === 'runs', `the fix page took five failed runs before it ended (${JSON.stringify([lsteps[2].attempts, lsteps[2].end_reason])})`);
  const lend = ev('ladder_end');
  if (ADMIN_PASSWORD) ok(lend.length === 1 && lend[0].reason === 'wrap_up' && lend[0].ceiling_rung === 2 && lend[0].entry_rung === 1 && lend[0].items === 4, `ladder_end: wrap_up ("Juegos para todos" waited for the level) (${JSON.stringify(lend)})`);
  else ok(lend.length === 1 && lend[0].reason === 'left', `ladder_end: left (the debug jump) (${JSON.stringify(lend)})`);
  if (ADMIN_PASSWORD) {
    const cmds = ev('class_command').map((x) => x.kind);
    ok(cmds.includes('games_all') && cmds.filter((k) => k === 'five_min').length >= 1 && cmds.includes('end_class'), `class_command: five_min, games_all, end_class (${cmds.join(' ')})`);
    ok(ev('survey_answer').length === 0, 'no survey_answer at all (1ro has no survey any more)');
    const survey = json(`select survey from sessions where id = '${sid}'`)[0]?.survey;
    ok(survey == null || Object.keys(survey).length === 0, `sessions.survey stays empty (${JSON.stringify(survey)})`);
  }
  // T51: every way back to the menu, with its via
  const exits = ev('game_exit').map((x) => `${x.game}:${x.via}`);
  const want = ['pop:end_button', 'pop:play_button', 'recipe:bar_menu', 'wardrobe:play_button', 'typing_race:end_button'];
  ok(want.every((w) => exits.includes(w)) && ev('game_exit').every((x) => ['end_button', 'play_button', 'bar_menu'].includes(x.via)), `game_exit with its via (${exits.join(' ')})`);
} catch (e) {
  ok(false, `database check stopped: ${String(e.message ?? e).split('\n')[0]}`);
}

ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
