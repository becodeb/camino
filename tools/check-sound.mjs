// The silent classroom round's scripted check (T18/T19): speechSynthesis is
// stubbed per browser context (addInitScript) so we can count whether the
// voice was ever asked to speak, without a real speech engine.
//
// - A: `?grado=1&sonido=no` lands straight past the grade cards (grade 1,
//   logged exactly like a tap) with speechSynthesis.speak never called,
//   while the caption (the on-screen line) still updates from the first
//   step's own instruction.
// - B: a plain link (no `?sonido`): speech is called normally.
// - admin logs in, presses "Sin sonido": A (already open, mid-session)
//   stops speaking after its next sync; a device C opened AFTER the press
//   starts muted from its very first line.
// - admin presses "Como diga el link": a fresh device D (no `?sonido`)
//   speaks again (the url/device baseline, not the class override).
//
// PW=<dir with playwright> ADMIN_PASSWORD=<the local throwaway> node tools/check-sound.mjs [base]
//   base: the app with /api and /admin (e.g. http://127.0.0.1:8810/, the default)
import { createRequire } from 'node:module';

const { chromium } = createRequire(`${process.env.PW ?? '/tmp/pw'}/`)('playwright');
const base = (process.argv[2] ?? 'http://127.0.0.1:8810/').replace(/\/?$/, '/');
const PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) { console.error('ADMIN_PASSWORD is required (a local throwaway)'); process.exit(2); }

let failures = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failures++; return cond; };

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];

/** A stub speechSynthesis the page cannot distinguish from a real (silent) one; counts .speak() calls. */
const STUB_SPEECH = `(() => {
  window.__speakCalls = 0;
  const stub = {
    speak() { window.__speakCalls++; },
    cancel() {},
    getVoices() { return []; },
    addEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: stub, configurable: true });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
})();`;

const newDevice = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.addInitScript(STUB_SPEECH);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch|401|429/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  return { ctx, p };
};

const speakCalls = (p) => p.evaluate(() => window.__speakCalls);
const captionLine = (p) => p.evaluate(() => document.querySelector('.pp-cap-text')?.textContent ?? null);

try {
  // ---------------------------------------------------------------- A: ?grado=1&sonido=no
  const A = await newDevice('A');
  await A.p.goto(`${base}?debug&nointro&grado=1&sonido=no#/piloto`);
  await A.p.waitForSelector('.piloto[data-step="character"]', { timeout: 30_000 });
  ok(true, 'A: ?grado=1 skipped the grade cards and started grade 1 directly');
  const sa = await A.p.evaluate(() => window.__piloto.session());
  ok(sa.grade === 1 && sa.device.sound === false && sa.device.sound_source === 'url', `A: session grade 1, device.sound false, source url (${JSON.stringify(sa.device.sound)}/${sa.device.sound_source})`);
  await A.p.waitForTimeout(600);
  ok((await speakCalls(A.p)) === 0, 'A: speechSynthesis.speak was never called while muted');
  // move it on to a step with its own spoken instruction, and turn captions on so the on-screen line is checkable
  await A.p.evaluate(() => window.__piloto.jump('tool_check'));
  await A.p.waitForSelector('.piloto[data-step="tool_check"]');
  await A.p.evaluate(() => { const api = window.__piloto; if (!api.flow().step) return; });
  // the 💬 toggle (always present on a bar) turns the on-screen line on, independent of ?sonido
  const capBtn = A.p.locator('.pp-cap-toggle');
  if (await capBtn.count()) await capBtn.click();
  await A.p.waitForTimeout(600);
  const lineA = await captionLine(A.p);
  ok(!!lineA && lineA.length > 0, `A: muted, the caption (on-screen line) still updates ("${lineA}")`);
  ok((await speakCalls(A.p)) === 0, 'A: still muted after moving to another step with its own instruction');

  // ---------------------------------------------------------------- B: no ?sonido at all
  const B = await newDevice('B');
  await B.p.goto(`${base}?debug&nointro#/piloto`);
  await B.p.waitForSelector('.pp-setup', { timeout: 30_000 });
  await B.p.waitForTimeout(2200); // the setup's spoken question, after its 450 ms delay and the (fast, local) settings fetch
  ok((await speakCalls(B.p)) > 0, 'B: without ?sonido, speech is called (the setup\'s own question)');
  await B.p.locator('.pp-grade-card[data-grade="2"]').click();
  await B.p.waitForSelector('.choice-row');
  const sb = await B.p.evaluate(() => window.__piloto.session());
  ok(sb.device.sound === true && sb.device.sound_source === 'default', `B: device.sound true, source default (${sb.device.sound}/${sb.device.sound_source})`);

  // ---------------------------------------------------------------- el docente logs in and mutes the class
  const admin = await newDevice('admin');
  const a = admin.p;
  await a.goto(`${base}admin`);
  await a.waitForSelector('#login-card:not([hidden])', { timeout: 30_000 });
  await a.fill('#password', PASSWORD);
  await a.click('#login-btn');
  await a.waitForSelector('#panel:not([hidden])', { timeout: 10_000 });
  await a.click('#sound-off');
  await a.waitForFunction(() => document.getElementById('sound-off').classList.contains('is-current'), null, { timeout: 10_000 });
  ok(true, '/admin: "Sin sonido" sent, the button shows as current');

  // A (already open, mid-session) stops speaking after its next sync
  await A.p.evaluate(() => window.__piloto.flush());
  await A.p.waitForFunction(() => window.__piloto.status().pending === 0, null, { timeout: 15_000 });
  await A.p.waitForTimeout(11_000); // the ~10 s poll carries the setting even with nothing queued
  await A.p.evaluate(() => { window.__speakCalls = 0; });
  await A.p.evaluate(() => window.__piloto.jump('typing'));
  await A.p.waitForSelector('.piloto[data-step="typing"]');
  await A.p.waitForTimeout(600);
  ok((await speakCalls(A.p)) === 0, 'A: still silent after the admin set "sin sonido"');
  // A's own url baseline already said no: prove the admin layer itself took over (not a coincidence) by its source
  const saAfter = await A.p.evaluate(() => window.__piloto.session());
  ok(saAfter.device.sound_source === 'admin', `A: device.sound_source is now 'admin' (${saAfter.device.sound_source}), not just the url baseline that happened to agree`);

  // a device opened AFTER the admin's press starts muted from its very first line
  const C = await newDevice('C');
  await C.p.goto(`${base}?debug&nointro#/piloto`);
  await C.p.waitForSelector('.pp-setup', { timeout: 30_000 });
  await C.p.waitForTimeout(2200);
  ok((await speakCalls(C.p)) === 0, 'C: opened after the admin\'s "sin sonido", muted from the very first line (the setup\'s question)');

  // ---------------------------------------------------------------- "Como diga el link"
  await a.click('#sound-link');
  await a.waitForFunction(() => document.getElementById('sound-link').classList.contains('is-current'), null, { timeout: 10_000 });
  ok(true, '/admin: "Como diga el link" sent');
  const D = await newDevice('D');
  await D.p.goto(`${base}?debug&nointro#/piloto`);
  await D.p.waitForSelector('.pp-setup', { timeout: 30_000 });
  await D.p.waitForTimeout(2200);
  ok((await speakCalls(D.p)) > 0, 'D: after "como diga el link", a fresh device with no ?sonido speaks again (the url/device default)');

  await A.ctx.close();
  await B.ctx.close();
  await C.ctx.close();
  await D.ctx.close();
  await admin.ctx.close();
} catch (e) {
  ok(false, `stopped: ${String(e.message ?? e).split('\n')[0]}`);
} finally {
  await browser.close();
}
ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
