// T41's scripted check: 4to's Arcade through the real UI, on a local stack,
// and its rows in Postgres.
//
// - Device K (`?grado=4`): name, character, the long ladder's first rung;
//   el docente's "Juegos para todos" opens the Arcade there (a child who has
//   not done Workshop challenge 5 still gets "Tu juego").
// - The Arcade's menu: five cards in order (Carrera de teclas, Tu juego, La
//   carrera, Taller de juegos, El vestidor), "Arcade" large, every card
//   inside the screen.
// - "Carrera de teclas" (tier 1), typed with the physical keyboard (real key
//   presses, no hooks): every word letter by letter, a few wrong letters (the
//   kart wobbles, the letter shakes red, nothing is lost: the next right key
//   carries on), an accented word typed without its accent, a click on the
//   track and on the bar's 🔊 mid-race (typing keeps working; space never
//   presses the focused button); the child wins (the podium, a cup);
//   "¡Otra carrera!" starts race 2 at tier 2; back to the menu.
// - "Tu juego": ¡Jugar!, a run with a score (the ?debug hook pokes the
//   points), "Tu récord: N" large; "Jugar otra vez", a second run that does
//   not beat it; "Mejorarlo en el taller" goes back to the Workshop, and the
//   Workshop's Arcade button back to the Arcade.
// - /admin shows K "Arcade" (not "juego libre").
// - Postgres: typing_race_start (race 2 `again`, tier 2), typing_race_word
//   per word (errors, the accented word), typing_race_end (finished, wpm,
//   accuracy < 100; race 2 left), own_game_run (points, best), the choices
//   and the step back to the Workshop.
//
// PW=<dir with playwright> ADMIN_PASSWORD=<the local throwaway> node tools/check-arcade.mjs [base]
//   base:     the API serving a VITE_PLAYTEST=1 build (default http://127.0.0.1:8810/)
//   PSQL:     psql against the API's database (default "docker exec -i camino-prueba-testdb psql -U postgres -tA")
//   SHOTS:    optional directory for screenshots (<name>-<width>.png)
//   VIEWPORT: e.g. 1280x800 (default 1366x768)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const base = (process.argv[2] ?? 'http://127.0.0.1:8810/').replace(/\/?$/, '/');
const PASSWORD = process.env.ADMIN_PASSWORD;
const PSQL = process.env.PSQL ?? 'docker exec -i camino-prueba-testdb psql -U postgres -tA';
const SHOTS = process.env.SHOTS ?? '';
const [VW, VH] = (process.env.VIEWPORT ?? '1366x768').split('x').map(Number);
if (!PASSWORD) { console.error('ADMIN_PASSWORD is required (a local throwaway)'); process.exit(2); }
const sql = (q) => execSync(PSQL, { input: q }).toString().trim();
const json = (q) => JSON.parse(sql(`select coalesce(json_agg(_r), '[]') from (${q}) _r;`) || '[]');

let failures = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failures++; return cond; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${name}-${VW}.png`) }); };

const ACCENTED = /[áéíóú]/;
/** The pause between keys (ms). */
const KEY_MS = Number(process.env.KEY_MS ?? 380);
/** typingRace.ts `fold`: accents off, lower case. */
const fold = (c) => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' })[c.toLowerCase()] ?? c.toLowerCase();

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
const newPage = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(60_000);
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch|401|429/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  return { ctx, p };
};
const flow = (p) => p.evaluate(() => window.__piloto.flow());
const tr = (p) => p.evaluate(() => window.__typingRace.state());
const waitAdmin = (a, sid, re) => a.waitForFunction(([id, src]) => new RegExp(src).test(document.querySelector(`#class-rows tr[data-id="${id}"]`)?.textContent ?? ''), [sid, re.source], { timeout: 30_000 });
/** One key of the physical keyboard (Playwright's real key events). */
const press = (p, ch) => p.keyboard.press(ch === ' ' ? 'Space' : ch);
/** Every card fully inside the viewport. */
const cardsInside = (p) => p.evaluate(() => [...document.querySelectorAll('.pp-fp-card')].every((c) => { const r = c.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; }));

let last = null;
try {
  // ---------------------------------------------------------------- el docente
  const admin = await newPage('admin');
  const a = admin.p;
  await a.goto(`${base}admin`);
  await a.waitForSelector('#login-card:not([hidden])', { timeout: 30_000 });
  await a.fill('#password', PASSWORD);
  await a.click('#login-btn');
  await a.waitForSelector('#panel:not([hidden])', { timeout: 10_000 });
  sql('DELETE FROM class_commands;');

  // ---------------------------------------------------------------- K: a 4to child mid-ladder; "Juegos para todos" opens the Arcade
  const K = await newPage('K');
  const k = K.p;
  last = k;
  await k.goto(`${base}?debug&nointro&grado=4&sonido=no#/piloto`);
  await k.waitForSelector('.pp-name-input');
  await k.locator('.pp-name-input').fill('Tobi');
  await k.locator('.pp-name-input').press('Enter');
  await k.locator('.choice-btn[data-choice-char="mina"]').click();
  await k.locator('.next-page').click({ force: true });
  await k.waitForSelector('.piloto[data-step="tool_check"]');
  const sid = await k.evaluate(() => window.__piloto.session().id);
  console.log(`     K: session ${sid}`);
  await k.evaluate(() => window.__piloto.jump('ladder'));
  await k.waitForSelector('main.level[data-level="pp-l7"]', { timeout: 60_000 });
  await k.evaluate(() => window.__piloto.flush());
  await a.click('#games-all');
  await k.waitForSelector('.piloto[data-step="free_play"] main.pp-menu', { timeout: 40_000 });
  const f0 = await flow(k);
  ok(f0.step === 'free_play' && f0.arcadeOpen === true && !f0.routeDone, '"Juegos para todos" opens the Arcade for 4to (no green flag)');
  sql('DELETE FROM class_commands;');

  // ---------------------------------------------------------------- the Arcade's menu
  const menu = await k.locator('main.pp-menu').getAttribute('data-menu');
  ok(menu === 'typing_race own_game race workshop wardrobe', `the Arcade's menu, in order: ${menu}`);
  ok(await k.locator('.pp-arcade-h').isVisible() && (await k.locator('.pp-arcade-h').innerText()).trim() === 'Arcade', '"Arcade" large inside the screen');
  ok(await cardsInside(k), `all five cards inside ${VW}×${VH}`);
  ok(await k.locator('.pp-fp-card[data-activity="own_game"]').count() === 1, '"Tu juego" is there for a child who has not done Workshop challenge 5');
  // the "¡Se abrió el Arcade!" notice goes by itself: the menu's picture without it
  await k.waitForSelector('.pp-games-all', { state: 'detached', timeout: 20_000 }).catch(() => {});
  await k.waitForTimeout(800);
  await shot(k, 'arcade-menu');

  // ---------------------------------------------------------------- Carrera de teclas
  // a seed whose tier-1 race holds an accented word (typed without its accent below): typingRace.ts wordsFor, by the ?debug hook
  const [SEED, WORDS1] = await k.evaluate((src) => {
    const re = new RegExp(src);
    let s = 1;
    while (!window.__typingWords(1, s).some((w) => re.test(w))) s++;
    window.__trSeed = s;
    return [s, window.__typingWords(1, s)];
  }, ACCENTED.source);
  console.log(`     typing race seed ${SEED}: ${WORDS1.join(' | ')}`);
  await k.locator('.pp-fp-card[data-activity="typing_race"]').click();
  await k.waitForSelector('main.pp-trace', { timeout: 20_000 });
  const s0 = await tr(k);
  ok(s0.tier === 1 && s0.raceNo === 1 && JSON.stringify(s0.words) === JSON.stringify(WORDS1), `race 1 at tier 1 with the seeded words (${s0.words.length})`);
  ok(await k.locator('.tr-text').isVisible() && (await k.locator('.tr-text').getAttribute('aria-label')) === WORDS1[0], 'the first word, large, under the track');
  const fontPx = await k.locator('.tr-text').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  ok(fontPx >= 44, `the word is large (${fontPx}px)`);
  ok(await k.locator('.kbd, .on-screen-keyboard, .ty-keys').count() === 0, 'no on-screen keyboard');
  await k.waitForTimeout(1500);

  let wrongPressed = 0;
  let accented = null;
  let shotMid = false;
  for (let w = 0; w < WORDS1.length; w++) {
    const word = WORDS1[w];
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      // word 2: two wrong letters in the middle (nothing to erase: the next right key carries on)
      if (w === 1 && i === 2) {
        for (const bad of ['q', 'z']) {
          if (fold(bad) === fold(ch)) continue;
          await press(k, bad);
          wrongPressed++;
          await k.waitForTimeout(90);
        }
        ok(await k.locator('.tr-ch.is-bad').count() === 1, 'a wrong letter: the expected letter shakes red');
        ok(await k.locator('.pp-trace .rc-me .rc-kart-in.is-bump').count() === 1, 'a wrong letter: the kart wobbles');
        if (!shotMid) { shotMid = true; await shot(k, 'typing-mid'); }
        const st = await tr(k);
        ok(st.typed === 2 && st.wrong === wrongPressed, `nothing lost: still ${st.typed} letters right, ${st.wrong} wrong`);
      }
      // word 3: a click on the track, then on the bar's 🔊 (it keeps the focus): typing goes on, space never presses it
      if (w === 2 && i === 1) {
        await k.locator('.rc-track').click({ position: { x: 60, y: 60 } });
        await k.locator('.level-bar .speak').click();
        await k.waitForTimeout(200);
      }
      const typedCh = ACCENTED.test(ch) ? fold(ch) : ch;
      if (typedCh !== ch) accented = word;
      await press(k, typedCh);
      // about a child's pace (two to three letters a second), so the rubber band is measured as in class
      await k.waitForTimeout(KEY_MS);
    }
    await k.waitForTimeout(250);
  }
  ok(!!accented, `an accented word typed without its accent: "${accented}"`);
  await k.waitForSelector('.pp-trace.is-podium', { timeout: 40_000 });
  const s1 = await tr(k).catch(() => null);
  ok(true, 'the child won: the podium');
  ok(await k.locator('.rc-cups [data-cups], .rc-cups').first().getAttribute('data-cups') === '1', 'a cup in the bar');
  await k.waitForTimeout(2800);
  ok(Number(await k.locator('.tr-numbers').getAttribute('data-wpm')) > 0 && await k.locator('.tr-numbers').isVisible(), 'the podium shows the race\'s own numbers (words per minute, right keys)');
  await shot(k, 'typing-podium');
  await k.locator('.rc-again').click();
  await k.waitForSelector('main.pp-trace:not(.is-podium)', { timeout: 20_000 });
  const s2 = await tr(k);
  ok(s2.raceNo === 2 && s2.tier === 2, `"¡Otra carrera!": race 2 at tier 2 (${s2.words.join(' | ')})`);
  for (const ch of s2.words[0].slice(0, 3)) { await press(k, ACCENTED.test(ch) ? fold(ch) : ch); await k.waitForTimeout(110); }
  ok((await tr(k)).typed === 3, 'race 2: typing works at once');
  await k.waitForTimeout(400);
  if (s1 === null) await k.waitForTimeout(1);
  await k.locator('.pp-menu-back').click({ force: true });
  await k.waitForSelector('main.pp-menu', { timeout: 20_000 });

  // ---------------------------------------------------------------- Tu juego
  await k.locator('.pp-fp-card[data-activity="own_game"]').click();
  await k.waitForSelector('main.pp-own .ws-player', { timeout: 20_000 });
  ok(/Tu récord:\s*0/.test(await k.locator('.ws-player-best').innerText()), '"Tu récord: 0" before any run');
  await k.locator('[data-act="play-again"]').click();
  await k.waitForFunction(() => window.__gamePlayer?.running(), null, { timeout: 10_000 });
  await k.keyboard.press('Space');
  await k.waitForTimeout(1200);
  await k.evaluate(() => window.__gamePlayer.poke({ puntos: 7 }));
  await k.waitForTimeout(400);
  await k.evaluate(() => window.__gamePlayer.stop());
  await k.waitForSelector('.ws-player-best[data-record]', { timeout: 10_000 });
  const bestTxt = await k.locator('.ws-player-best').innerText();
  ok(/7/.test(bestTxt), `a record shows: "${bestTxt.replace(/\s+/g, ' ')}"`);
  ok((await k.locator('[data-act="play-again"]').innerText()).includes('Jugar otra vez'), '"Jugar otra vez" after a run');
  await k.waitForTimeout(500);
  await shot(k, 'own-game');
  await k.locator('[data-act="play-again"]').click();
  await k.waitForFunction(() => window.__gamePlayer?.running(), null, { timeout: 10_000 });
  await k.waitForTimeout(800);
  await k.evaluate(() => window.__gamePlayer.stop());
  await k.waitForTimeout(500);
  ok(/Tu récord:\s*7/.test(await k.locator('.ws-player-best').innerText()), 'a run that does not beat it keeps "Tu récord: 7"');
  await k.locator('[data-act="improve"]').click();
  await k.waitForSelector('.piloto[data-step="workshop"] .ws-page', { timeout: 20_000 });
  ok((await flow(k)).step === 'workshop', '"Mejorarlo en el taller" goes back to the Workshop');
  // the Workshop's own welcome may cover the bar's Arcade button for a moment
  await k.waitForTimeout(1500);
  await k.locator('.level-bar [data-act="arcade"]').click({ timeout: 20_000 });
  await k.waitForSelector('.piloto[data-step="free_play"] main.pp-menu', { timeout: 20_000 });
  ok(true, 'and the Workshop\'s Arcade button back to the Arcade');

  // ---------------------------------------------------------------- /admin
  await k.evaluate(() => window.__piloto.flush());
  await waitAdmin(a, sid, /Arcade/);
  const row = await a.evaluate((id) => document.querySelector(`#class-rows tr[data-id="${id}"]`)?.textContent ?? '', sid);
  ok(/Arcade/.test(row) && !/juego libre/.test(row), `/admin: K shows "Arcade", not "juego libre" (${row.replace(/\s+/g, ' ').slice(0, 80)})`);
  await a.locator(`#class-rows tr[data-id="${sid}"]`).scrollIntoViewIfNeeded();
  await a.waitForTimeout(600);
  await shot(a, 'admin-arcade');

  // ---------------------------------------------------------------- the rows
  await k.evaluate(() => window.__piloto.flush());
  await k.waitForTimeout(1500);
  const starts = json(`select (payload->>'race_no')::int as no, (payload->>'tier')::int as tier, payload->>'again' as again, payload->'words' as words from events where session_id = '${sid}' and type = 'typing_race_start' order by seq`);
  ok(starts.length === 2 && starts[0].tier === 1 && starts[0].again == null && starts[1].tier === 2 && starts[1].again === 'true', `typing_race_start: ${starts.map((r) => `${r.no}:t${r.tier}${r.again ? ':again' : ''}`).join(' ')}`);
  const wordsRows = json(`select (payload->>'race_no')::int as no, payload->>'word' as word, (payload->>'ms')::int as ms, (payload->>'errors')::int as errors from events where session_id = '${sid}' and type = 'typing_race_word' order by seq`);
  const r1 = wordsRows.filter((r) => r.no === 1);
  ok(r1.length === WORDS1.length && r1.every((r, i) => r.word === WORDS1[i] && r.ms > 0), `typing_race_word: one per word of race 1 (${r1.length})`);
  ok(r1.reduce((n, r) => n + r.errors, 0) === wrongPressed && r1[1].errors === wrongPressed, `the errors are on word 2 (${r1.map((r) => r.errors).join(',')})`);
  ok(r1.some((r) => r.word === accented), `the accented word "${accented}" counted as typed`);
  const ends = json(`select (payload->>'race_no')::int as no, payload->>'reason' as reason, (payload->>'wpm')::float as wpm, (payload->>'accuracy')::float as acc, (payload->>'chars')::int as chars, (payload->>'wrong')::int as wrong, payload->>'again' as again, (payload->>'margin_ms')::int as margin from events where session_id = '${sid}' and type = 'typing_race_end' order by seq`);
  console.log('     typing_race_end:', JSON.stringify(ends));
  ok(ends.length === 2 && ends[0].reason === 'finished' && ends[0].wpm > 0 && ends[0].acc < 100 && ends[0].wrong === wrongPressed && ends[0].chars === WORDS1.join('').length && ends[0].again === 'false', 'typing_race_end race 1: finished, wpm, accuracy below 100, the wrong keys, every letter');
  ok(ends[0].margin > 0 && ends[0].margin < 4000, `the child won by a little (${ends[0].margin} ms ahead)`);
  ok(ends[1]?.reason === 'left' && ends[1]?.again === 'true', 'typing_race_end race 2: left, again');
  const runs = json(`select payload->>'result' as result, (payload->>'points')::int as points, (payload->>'best')::int as best, (payload->>'ms')::int as ms from events where session_id = '${sid}' and type = 'own_game_run' order by seq`);
  console.log('     own_game_run:', JSON.stringify(runs));
  ok(runs.length === 2 && runs[0].points === 7 && runs[0].best === 7 && runs[0].ms > 0 && runs[1].best === 7, 'own_game_run: 7 points (best 7), then a run that kept it');
  const choices = sql(`select string_agg(payload->>'activity', ' ' order by seq) from events where session_id = '${sid}' and type = 'choice';`);
  ok(/typing_race/.test(choices) && /own_game/.test(choices), `choice rows: ${choices}`);
  const aend = json(`select payload->>'activity' as activity, (payload->>'wins')::int as wins from events where session_id = '${sid}' and type = 'activity_end' order by seq`);
  ok(aend.some((r) => r.activity === 'typing_race' && r.wins === 1), `activity_end typing_race: 1 win (${JSON.stringify(aend)})`);
  const steps = sql(`select string_agg((payload->>'from') || '>' || (payload->>'to') || ':' || (payload->>'reason'), ' ' order by seq) from events where session_id = '${sid}' and type = 'step';`);
  ok(/ladder>free_play:games_all/.test(steps) && /free_play>workshop:arcade/.test(steps) && /workshop>free_play:arcade/.test(steps), `steps: ${steps}`);
} catch (e) {
  ok(false, `stopped: ${String(e.message ?? e).split('\n')[0]}`);
  if (last && SHOTS) await last.screenshot({ path: path.join(SHOTS, `stopped-${VW}.png`) }).catch(() => {});
  if (last) console.log('     at:', await last.evaluate(() => JSON.stringify({ step: window.__piloto?.flow().step, tr: window.__typingRace?.state() })).catch(() => '?'));
} finally {
  sql('DELETE FROM class_commands;');
  await browser.close();
}
ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 5).join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
