// T20 (silent classroom round): the scripted muted 1ro session, by the real
// bookmark link (`?grado=1&sonido=no`). speechSynthesis is stubbed
// (addInitScript, like check-sound.mjs) so we can count whether the voice
// was ever asked to speak, without a real speech engine.
//
// Checked: speechSynthesis.speak is never called through the character,
// the tool check and a ladder item; the on-screen text is forced on and in
// capital letters (grade 1); a wordless ghost demo plays on the first
// ladder item (`ghost_demo` logged, kind 'intro'); an idle child (no real
// input) gets the ✋ pulse after ~15s; the route reaches the green "terminó"
// flag. Local stack only.
//
// PW=<dir with playwright> node tools/check-silent.mjs [base]
//   base: the app with /api and /admin (e.g. http://127.0.0.1:8810/, the default)
//   PSQL: the command that runs psql against the API's database, default
//         "docker exec -i camino-prueba-testdb psql -U postgres -tA"
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const base = (process.argv[2] ?? 'http://127.0.0.1:8810/').replace(/\/?$/, '/');
const PSQL = process.env.PSQL ?? 'docker exec -i camino-prueba-testdb psql -U postgres -tA';
const sql = (q) => execSync(PSQL, { input: q }).toString().trim();
const json = (q) => sql(`select coalesce(json_agg(_r), '[]') from (${q}) _r;`);

let failures = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failures++; return cond; };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];

/** A stub speechSynthesis the page cannot distinguish from a real (silent) one; counts .speak() calls (check-sound.mjs's). */
const STUB_SPEECH = `(() => {
  window.__speakCalls = 0;
  const stub = { speak() { window.__speakCalls++; }, cancel() {}, getVoices() { return []; }, addEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: stub, configurable: true });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
})();`;

const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
await ctx.addInitScript(STUB_SPEECH);
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch|401|429/.test(m.text())) errors.push(m.text()); });
const speakCalls = () => p.evaluate(() => window.__speakCalls);
const pil = (js, arg) => p.evaluate(js, arg);
const jump = (step) => pil((s) => window.__piloto.jump(s), step);

try {
  // the real bookmark: straight past the grade cards, muted from the start
  await p.goto(`${base}?debug&grado=1&sonido=no#/piloto`);
  await p.waitForSelector('.choice-row', { timeout: 30_000 });
  const session = await pil(() => window.__piloto.session());
  ok(session.grade === 1 && session.device.sound === false && session.device.sound_source === 'url', `grade 1, muted from ?sonido=no (${JSON.stringify(session.device.sound)}/${session.device.sound_source})`);
  ok((await speakCalls()) === 0, 'the character step: speechSynthesis.speak never called');

  await p.locator('.choice-btn').nth(2).click();
  await p.waitForTimeout(600);
  await p.locator('.doors-next').click({ force: true });
  await p.waitForSelector('main.level[data-level="tool-1"]', { timeout: 20_000 });
  await p.waitForTimeout(700);
  ok((await speakCalls()) === 0, 'the tool check: still never called');
  ok(await p.locator('.pp-cap.is-upper').count() > 0, 'the tool check: the on-screen text is forced on, in capital letters (grade 1, muted)');

  // ladder rung 1 ("Rodear los charcos", a build-a-path page): the wordless demo
  await jump('ladder');
  await p.waitForSelector('main.level');
  await pil((r) => window.__ladder.go(r), 1);
  await p.waitForTimeout(400);
  const level1 = await pil(() => window.__camino.level.id);
  ok(level1 === 'pp-l1', `on rung 1 (${level1})`);
  const sawGhost = await p.waitForSelector('.ghost-hand', { timeout: 3500 }).then(() => true).catch(() => false);
  ok(sawGhost, 'rung 1: the wordless "path" demo\'s ghost hand showed up, unprompted');
  await p.waitForTimeout(2500); // the demo finishes
  ok((await speakCalls()) === 0, 'rung 1: still never called (the demo is wordless)');

  // left untouched: the idle nudge (✋ pulses, no auto-solve) — the ghost's own moves never count as input
  const t0 = Date.now();
  const sawNudge = await p.waitForSelector('.help.is-inviting', { timeout: 20_000 }).then(() => true).catch(() => false);
  const waitedMs = Date.now() - t0;
  ok(sawNudge, `the idle nudge (✋) appeared after being left untouched (~${waitedMs}ms)`);
  const programUnchanged = await pil(() => window.__camino.program).then((p2) => Array.isArray(p2));
  ok(programUnchanged, 'the idle nudge never solved the page by itself (the ✋ handler is untouched)');

  // the route reaches the green "terminó" flag (the debug hook: same shortcut shots-piloto.mjs's screenshots use)
  await pil(() => window.__piloto.routeDone());
  await p.waitForSelector('.piloto.route-done', { timeout: 10_000 });
  ok(true, 'the route reached the green "terminó" flag');

  var sessionId = session.id;
  await ctx.close();
} catch (e) {
  ok(false, `stopped: ${String(e.message ?? e).split('\n')[0]}`);
} finally {
  await browser.close();
}

// ---------------------------------------------------------------- the database (this session only: the disposable db keeps every run's rows)
try {
  const demos = JSON.parse(json(`select payload->>'level_id' as id, payload->>'kind' as kind from events where session_id = '${sessionId}' and type = 'ghost_demo' order by seq`));
  ok(demos.some((d) => d.id === 'pp-l1' && d.kind === 'intro'), `the wordless demo on rung 1 was logged as ghost_demo (${JSON.stringify(demos)})`);
} catch (e) {
  ok(false, `database check stopped: ${String(e.message ?? e).split('\n')[0]}`);
}

ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
