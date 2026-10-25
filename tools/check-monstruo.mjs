// T43/T44's scripted check: 1ro's fun round, "Los juegos del monstruo",
// played through the real UI by the bookmark link (`?grado=1&sonido=no`),
// and its telemetry in Postgres.
//
// - The character choice → the guided pass (the `games` step), never the
//   tool check or the ladder; the first-time wordless ghost demo plays.
// - "La receta del monstruo", round 1: the sandwich built upside down with
//   real taps → the bell → the monster eats, makes a disgusted face and
//   spits it out, the wrong layer circled; only the right layers under it
//   stay. Then built right (one card dragged with the mouse, one layer
//   tapped off and put back) → the monster's happy face, confetti.
// - Round 2: very fast taps on the tray make the character dizzy (input
//   waits, `rapid_taps`); then built right. Round 3 right → the guided pass
//   ends → the next guided game.
// - T45 "Copiá el baile": the monster dances (the cards dimmed: a tap then
//   is ignored), then the child's turn (the spotlight on the child's
//   character, the cards lit up); a miss is a tumble and the same dance
//   again; then right → confetti. Round 2 keeps the dance and adds a pose;
//   very fast taps make the character dizzy. Round 3 → the next game.
// - T46 "¿Qué salió mal?": the strip plays (taps ignored), the child's turn;
//   a right step shakes ("no"), the wrong one is circled; a wrong option
//   shakes, the right one dragged onto it → the routine plays again right.
//   Round 2 (the wrong order): the step lifts, a tap on a step that is not
//   its partner shakes, the partner swaps them. Round 3 → the guided pass
//   ends → 1ro's arcade (the green flag): the three monster games, the
//   character, the wardrobe, the typing letters; no La carrera, no sheet; it
//   fits, with a short caption that is not cut off.
// - The arcade: the dance and "¿Qué salió mal?" open at the tier reached;
//   the recipe again (a voluntary replay) opens at the tier reached; a won round offers "¡Otra vez!", one tier harder; "Tu
//   personaje" opens the character choice; the adult corner menu offers La
//   carrera and the ladder.
// - Everything inside the viewport (no scrolling), targets ≥ 48 px; no page
//   errors.
// - Postgres: game_start (guided; arcade with voluntary/replay), game_round
//   per round (round 1: 2 attempts, an order error), game_end finished,
//   rapid_taps, the ghost demo, the steps character → games → free_play and
//   route_done.
//
// PW=<dir with playwright> node tools/check-monstruo.mjs [base]
//   base:     the app with /api (default http://127.0.0.1:8812/: the API serving a VITE_PLAYTEST=1 build)
//   PSQL:     psql against the API's database (default "docker exec -i camino-prueba-1ro-db psql -U postgres -tA")
//   SHOTS:    optional directory for screenshots (<name>-<width>.png)
//   VIEWPORT: e.g. 1280x800 (default 1366x768)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const base = (process.argv[2] ?? 'http://127.0.0.1:8812/').replace(/\/?$/, '/');
const PSQL = process.env.PSQL ?? 'docker exec -i camino-prueba-1ro-db psql -U postgres -tA';
const SHOTS = process.env.SHOTS ?? '';
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
async function pose(x) {
  const n = (await st()).input?.length ?? 0;
  await p.locator(`.dz-card[data-pose="${x}"]`).click();
  await p.waitForTimeout(520);
  return n;
}
/** Plays the dance's round `round` to the end from whatever is on screen (a show, the child's turn, a tumble). */
async function playDance(round) {
  for (let k = 0; k < 4; k++) {
    await p.waitForFunction((r) => { const x = window.__monster.state(); return x.round !== r || x.phase === 'turn' || x.phase === 'won' || x.phase === 'yay'; }, round, { timeout: 25_000 });
    const x = await st();
    if (x.round !== round || x.phase !== 'turn') return;
    for (const q of x.seq.slice(x.input.length)) await pose(q);
    await p.waitForFunction((r) => { const y = window.__monster.state(); return y.round !== r || y.phase !== 'turn'; }, round, { timeout: 8000 });
    const y = await st();
    if (y.phase !== 'tumble') return;
  }
}
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

let sid = null;
try {
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
  const sizes = await p.evaluate(() => [...document.querySelectorAll('.rx-card, .ga-ready, .level-bar .help')].map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  ok(sizes.length >= 6 && sizes.every((s) => s >= 48), `every card and the bell are ≥ 48 px (${sizes.map(Math.round).join(', ')})`);

  // ---------------------------------------------------------------- round 1: wrong order → disgust and spit; then right
  await waitBuild(1);
  let s = await st();
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

  // ---------------------------------------------------------------- round 3, then the arcade
  await waitBuild(3);
  s = await st();
  ok(s.tier === 3 && s.order.length === 4, `round 3: 4 layers (${s.order.join(' ')})`);
  await build(s.order);
  await shot(p, 'recipe-round3');
  await p.locator('.ga-ready.is-ready').click();
  await p.waitForSelector('.pp-cheer', { timeout: 10_000 });
  ok(true, 'the recipe\'s guided turn ends with a cheer');
  await p.locator('.pp-cheer-next').click();

  // ---------------------------------------------------------------- T45 "Copiá el baile"
  await p.waitForSelector('.piloto[data-step="games"] .dz-game', { timeout: 15_000 });
  ok(true, 'the guided pass goes on: "Copiá el baile"');
  await waitPhase('dance', 'show', 1);
  s = await st();
  ok(s.tier === 1 && s.seq.length === 2, `round 1: a dance of 2 poses (${s.seq.join(' ')})`);
  await p.waitForTimeout(900);
  // (the dance of 2 poses lasts under 3 s: the tap first, then the slow screenshot)
  await rawTap(`.dz-card[data-pose="${s.seq[0]}"]`);
  const dancing = await st();
  ok(dancing.phase === 'show' && dancing.input.length === 0, 'a tap on a card while the monster dances is ignored');
  ok((await p.locator('.dz-panel.is-watch').count()) === 1 && (await p.locator('.dz-spot.is-on').count()) === 1, 'while it dances: the spotlight on the monster, the cards dimmed');
  await shot(p, 'dance-show');
  await waitPhase('dance', 'turn', 1);
  await p.waitForTimeout(700);
  await shot(p, 'dance-turn');
  ok((await p.locator('.dz-panel.is-turn').count()) === 1 && (await p.locator('.dz-spot-you.is-on').count()) === 1 && (await p.locator('.pz-puppet.is-point').count()) === 1,
    'the child\'s turn: the spotlight on the child\'s character, the monster points, the cards light up');
  ok(await p.waitForSelector('.ghost-hand', { timeout: 4000 }).then(() => true).catch(() => false), 'the first-time ghost demo taps a card');
  await p.waitForSelector('.ghost-hand', { state: 'detached', timeout: 10_000 }).catch(() => {});
  ok(await fits(), 'the dance fits the viewport');
  const dsizes = await p.evaluate(() => [...document.querySelectorAll('.dz-card')].map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  ok(dsizes.length === 4 && dsizes.every((x) => x >= 48), `four pose cards ≥ 48 px (${dsizes.map(Math.round).join(', ')})`);
  // a miss: the first pose right, the second wrong → the tumble, the same dance again
  const first = s.seq;
  await pose(first[0]);
  const wrongPose = ['up', 'star', 'squat', 'flamingo'].find((x) => x !== first[1]);
  await pose(wrongPose);
  await p.waitForSelector('.pz-puppet.is-dizzy', { timeout: 3000 });
  await p.waitForTimeout(250);
  await shot(p, 'dance-tumble');
  ok((await st()).phase === 'tumble' && (await p.locator('.dz-slot .rx-wrong-ring').count()) === 1, 'a miss: the monster tumbles over, the wrong beat circled');
  await waitPhase('dance', 'show', 1);
  s = await st();
  ok(s.seq.join() === first.join() && s.input.length === 0, 'then the same dance again (same length, never game over)');
  await waitPhase('dance', 'turn', 1);
  for (const x of s.seq) await pose(x);
  await p.waitForSelector('.dz-game[data-phase="yay"]', { timeout: 4000 });
  await p.waitForTimeout(600);
  await shot(p, 'dance-yay');
  ok((await p.locator('.ga-confetti').count()) === 1, 'copied right: they dance it together, confetti');
  // round 2: the same dance plus one pose; very fast taps → dizzy
  await waitPhase('dance', 'show', 2);
  s = await st();
  ok(s.seq.length === 3 && s.seq.slice(0, 2).join() === first.join(), `round 2 keeps the dance and adds one pose (${s.seq.join(' ')})`);
  await waitPhase('dance', 'turn', 2);
  const cb = await p.locator('.dz-card[data-pose="squat"]').boundingBox();
  for (let i = 0; i < 5; i++) { await p.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2); await p.waitForTimeout(60); }
  await p.waitForSelector('.dz-game.is-dizzy', { timeout: 3000 }).catch(() => {});
  ok((await p.locator('.dz-game.is-dizzy').count()) === 1, 'very fast taps on the cards: the character sits dizzy');
  await p.waitForTimeout(400);
  await shot(p, 'dance-dizzy');
  await p.waitForSelector('.dz-game.is-dizzy', { state: 'detached', timeout: 5000 });
  // the fast taps may have counted (and missed): play on from whatever is on screen
  await playDance(2);
  await waitPhase('dance', 'show', 3);
  s = await st();
  ok(s.seq.length === 4, `round 3: 4 poses (${s.seq.join(' ')})`);
  await playDance(3);
  await p.waitForSelector('.pp-cheer', { timeout: 12_000 });
  ok(true, 'the dance\'s guided turn ends with a cheer');
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
  await p.waitForSelector('.pp-cheer', { timeout: 16_000 });
  ok(true, 'the guided pass ends with a cheer');
  await p.locator('.pp-cheer-next').click();
  await p.waitForSelector('.piloto[data-step="free_play"] .pp-menu', { timeout: 15_000 });
  const menu = await p.locator('.pp-menu').getAttribute('data-menu');
  ok(menu === 'recipe dance oops buddy wardrobe typing_race', `1ro's arcade: ${menu} (no La carrera, no sheet)`);
  ok((await p.locator('.piloto.route-done').count()) === 1, 'leaving the guided pass raised the green flag');
  await p.waitForTimeout(800);
  ok(await fits(), 'the arcade menu fits the viewport');
  const msizes = await p.evaluate(() => [...document.querySelectorAll('.pp-fp-card')].map((e) => { const r = e.getBoundingClientRect(); return [Math.min(r.width, r.height), r.bottom <= innerHeight && r.right <= innerWidth]; }));
  ok(msizes.length === 6 && msizes.every(([x, inView]) => x >= 48 && inView), `six cards, all in view and ≥ 48 px (${msizes.map(([x]) => Math.round(x)).join(', ')})`);
  const cap = await p.evaluate(() => { const t = document.querySelector('.pp-cap-text'); return t ? { text: t.textContent, cut: t.scrollHeight > t.clientHeight + 4, h: [t.scrollHeight, t.clientHeight] } : null; });
  ok(!!cap && !cap.cut && !/receta/i.test(cap.text), `the menu's caption is short and not cut off (${cap?.text} ${cap?.h})`);
  await shot(p, 'arcade-menu');

  // ---------------------------------------------------------------- the arcade: the dance and "¿Qué salió mal?" from the menu
  await p.locator('.pp-fp-card[data-activity="dance"]').click();
  await p.waitForSelector('.dz-game', { timeout: 10_000 });
  await waitPhase('dance', 'show', 1);
  s = await st();
  ok(s.tier === 3 && s.seq.length === 4, `the dance from the arcade opens at the tier reached (tier ${s.tier}, ${s.seq.length} poses)`);
  await waitPhase('dance', 'turn', 1);
  ok((await p.locator('.ghost-hand').count()) === 0, 'no ghost demo the second time');
  for (const x of s.seq) await pose(x);
  await p.waitForSelector('.ga-again', { timeout: 10_000 });
  await p.waitForTimeout(900);
  await shot(p, 'dance-again');
  await p.locator('.ga-again').click();
  await waitPhase('dance', 'show', 2);
  const s2 = await st();
  ok(s2.seq.length === 5 && s2.seq.slice(0, 4).join() === s.seq.join(), '"¡Otra vez!": the same dance plus one pose');
  await p.locator('.pp-menu-back').click();
  await p.waitForSelector('.pp-menu', { timeout: 10_000 });
  await p.locator('.pp-fp-card[data-activity="oops"]').click();
  await p.waitForSelector('.oo-game', { timeout: 10_000 });
  await waitPhase('oops', 'play', 1);
  s = await st();
  ok(s.tier === 3 && s.routine === 'soup', `"¿Qué salió mal?" from the arcade opens at the tier reached (${s.routine})`);
  await p.evaluate(() => window.__monster.tier(4));
  await waitPhase('oops', 'find', 2);
  await p.waitForTimeout(900);
  await shot(p, 'oops-teeth');
  s = await st();
  await p.locator(`.oo-frame[data-i="${s.wrongAt[0]}"]`).click();
  await waitPhase('oops', 'fix', 2);
  await p.waitForTimeout(700);
  await shot(p, 'oops-teeth-options');
  await p.locator('.pp-menu-back').click();
  await p.waitForSelector('.pp-menu', { timeout: 10_000 });

  // ---------------------------------------------------------------- the arcade: the recipe again, "¡Otra vez!"
  await p.locator('.pp-fp-card[data-activity="recipe"]').click();
  await p.waitForSelector('.rx-game', { timeout: 10_000 });
  await waitBuild(1);
  s = await st();
  ok(s.tier === 3, `the recipe from the arcade opens at the tier reached (tier ${s.tier})`);
  ok((await p.locator('.ghost-hand').count()) === 0, 'no ghost demo the second time');
  await build(s.order);
  await p.locator('.ga-ready.is-ready').click();
  await p.waitForSelector('.ga-again', { timeout: 8000 });
  await p.waitForTimeout(1200);
  await shot(p, 'arcade-won');
  ok(true, 'a won round in the arcade offers "¡Otra vez!"');
  await p.locator('.ga-again').click();
  await waitBuild(2);
  s = await st();
  ok(s.tier === 4 && s.order.length === 5, `"¡Otra vez!": a little harder (tier ${s.tier}, ${s.order.length} layers)`);
  await build(s.order);
  await p.locator('.ga-ready.is-ready').click();
  await p.waitForSelector('.ga-again', { timeout: 8000 });
  await p.locator('.ga-again').click();
  await waitBuild(3);
  s = await st();
  ok(s.monsters === 2, `tier 5: two monsters (${s.order.join(' ')})`);
  await p.waitForTimeout(500);
  await shot(p, 'recipe-two');
  await build(s.order);
  await p.locator('.ga-ready.is-ready').click();
  await p.waitForFunction(() => { const x = window.__monster.state(); return x.phase === 'build' && x.monster === 1; }, null, { timeout: 8000 });
  ok(true, 'the first monster served, the second one\'s turn');
  await p.locator('.pp-menu-back').click();
  await p.waitForSelector('.pp-menu', { timeout: 10_000 });
  ok(true, '"volver al menú" mid-round');

  // ---------------------------------------------------------------- "Tu personaje", the adult menu
  await p.locator('.pp-fp-card[data-activity="buddy"]').click();
  await p.waitForSelector('.choice-row', { timeout: 10_000 });
  await p.locator('.choice-btn[data-choice-char="mina"]').click();
  await p.waitForTimeout(700);
  await shot(p, 'arcade-buddy');
  await p.locator('.doors-next').click({ force: true });
  await p.waitForSelector('.pp-menu', { timeout: 10_000 });
  ok(true, '"Tu personaje": the character choice, then back to the menu');
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
  ok(allStarts.filter((x) => x.mode === 'guided').map((x) => x.game).join(' ') === 'recipe dance oops', `the guided pass: recipe, dance, oops (${allStarts.map((x) => `${x.game}:${x.mode}`).join(' ')})`);
  const starts = allStarts.filter((x) => x.game === 'recipe');
  ok(starts.length === 2 && starts[0].mode === 'guided' && starts[0].voluntary === false && starts[1].mode === 'arcade' && starts[1].voluntary === true && starts[1].replay === true && starts[1].play_no === 2,
    `game_start: guided, then the arcade's voluntary replay (${JSON.stringify(starts.map((x) => [x.mode, x.play_no, x.tier, x.voluntary, x.replay]))})`);
  const allRounds = ev('game_round');
  const rounds = allRounds.filter((x) => x.game === 'recipe');
  const r1 = rounds[0];
  ok(r1 && r1.round === 1 && r1.attempts === 2 && r1.correct === false && r1.order_errors === 1 && r1.wrong_at?.[0] === 0 && r1.sources?.drag === 1,
    `game_round 1: two attempts, one order error at the bottom layer, one drag (${JSON.stringify(r1)})`);
  ok(rounds[1]?.correct === true && rounds[2]?.correct === true && rounds.slice(0, 3).every((r) => r.mode === 'guided' && r.ms > 0 && r.first_input_ms != null),
    `game_round 2 and 3 right on the first try, with their times (${rounds.length} rows)`);
  ok(rounds.some((r) => r.mode === 'arcade' && r.again === true), 'an arcade round started by "¡Otra vez!" is flagged `again`');
  ok(rounds.some((r) => r.mode === 'arcade' && r.solved === false), 'the round left mid-way is logged unsolved');
  // T45: the dance
  const dr = allRounds.filter((x) => x.game === 'dance');
  ok(dr[0] && dr[0].round === 1 && dr[0].length === 2 && dr[0].attempts === 2 && dr[0].correct === false && dr[0].misses === 1 && dr[0].miss_at?.[0] === 1 && dr[0].shows === 2,
    `dance round 1: 2 poses, a miss at the second, shown twice (${JSON.stringify(dr[0])})`);
  ok(dr.filter((x) => x.mode === 'guided' && x.solved).map((x) => x.length).join() === '2,3,4' && dr.every((x) => x.ms > 0), `dance rounds grow 2, 3, 4 (${dr.map((x) => `${x.mode}:${x.length}`).join(' ')})`);
  const de = ev('game_end').filter((x) => x.game === 'dance');
  ok(de[0]?.reason === 'finished' && de[0]?.rounds === 3 && de[0]?.longest === 4, `dance game_end: finished, the longest dance 4 (${JSON.stringify(de.map((x) => [x.mode, x.reason, x.rounds, x.longest]))})`);
  ok(de[1]?.mode === 'arcade' && de[1]?.longest === 4 && de[1]?.reason === 'quit', 'the arcade\'s dance: quit mid-round, its longest dance 4');
  ok(allStarts.some((x) => x.game === 'dance' && x.mode === 'arcade' && x.voluntary && x.replay && x.tier === 3), 'the arcade\'s dance: a voluntary replay at tier 3');
  // T46: ¿qué salió mal?
  const orr = allRounds.filter((x) => x.game === 'oops' && x.solved);
  ok(orr[0]?.routine === 'cold' && orr[0].found_try === 2 && orr[0].fix_correct === false && orr[0].fix_tries === 2 && orr[0].sources?.drag === 1 && orr[0].attempts === 3 && orr[0].correct === false && orr[0].first_tap_ms > 0,
    `oops round 1: found at the 2nd try, a wrong fix, then dragged right (${JSON.stringify(orr[0])})`);
  ok(orr[1]?.routine === 'socks' && orr[1].kind === 'swap' && orr[1].found_try === 1 && orr[1].fix_tries === 2 && orr[1].fix_correct === false, `oops round 2: the swap (${JSON.stringify(orr[1])})`);
  ok(orr[2]?.routine === 'soup' && orr[2].found_try === 1 && orr[2].fix_correct === true && orr[2].correct === true, `oops round 3: right at once (${JSON.stringify(orr[2])})`);
  const oe = ev('game_end').filter((x) => x.game === 'oops');
  ok(oe[0]?.reason === 'finished' && oe[0]?.rounds === 3, `oops game_end: finished, 3 rounds (${JSON.stringify(oe.map((x) => [x.mode, x.reason, x.rounds]))})`);
  const ends = ev('game_end').filter((x) => x.game === 'recipe');
  ok(ends.length === 2 && ends[0].reason === 'finished' && ends[0].rounds === 3 && ends[1].reason === 'quit', `game_end: the guided pass finished (3 rounds), the arcade play quit mid-round (${JSON.stringify(ends.map((x) => [x.mode, x.reason, x.rounds]))})`);
  const rapid = ev('rapid_taps');
  ok(rapid.length >= 1 && rapid[0].game === 'recipe' && rapid[0].taps >= 4 && rapid[0].window_ms <= 1000, `rapid_taps: ${JSON.stringify(rapid)}`);
  const demos = ev('ghost_demo');
  ok(['recipe', 'dance', 'oops'].every((g) => demos.filter((d) => d.level_id === `game:${g}` && d.kind === 'intro').length === 1), `each game's ghost demo once (${JSON.stringify(demos)})`);
  ok(rapid.some((r) => r.game === 'dance'), 'rapid_taps in the dance too');
  const steps = ev('step').map((x) => `${x.from}>${x.to}`);
  ok(steps.slice(0, 3).join(' ') === 'setup>character character>games games>free_play', `steps: ${steps.join(' ')}`);
  ok(ev('route_done').length === 1, 'route_done once');
  const choices = ev('choice').filter((c) => c.activity === 'recipe' || c.activity === 'buddy');
  ok(choices.length >= 3, `arcade picks and the character's pick logged (${JSON.stringify(choices)})`);
} catch (e) {
  ok(false, `database check stopped: ${String(e.message ?? e).split('\n')[0]}`);
}

ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
