import { describe, expect, it } from 'vitest';
import { createHold, SLOP_PX, type HoldPointer } from './hold';
import { HELP_BUTTON, HELP_HOLD_MS } from './AdultControls';

/** A hold on a fake clock; `on` says whether the press started on ✋. */
function rig(ms = HELP_HOLD_MS) {
  let now = 0;
  const timers: { fn: () => void; at: number; id: number }[] = [];
  let n = 0;
  const log: string[] = [];
  let onHelp = true;
  const hold = createHold({
    ms,
    where: () => onHelp,
    fire: () => log.push('question'),
    swallowClick: () => log.push('swallow'),
    setTimer: (fn, t) => { const id = ++n; timers.push({ fn, at: now + t, id }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((x) => x.id === h); if (i >= 0) timers.splice(i, 1); },
  });
  const advance = (ms2: number) => {
    now += ms2;
    for (const t of timers.filter((x) => x.at <= now)) { timers.splice(timers.indexOf(t), 1); t.fn(); }
  };
  const p = (x = 10, y = 10, id = 1): HoldPointer => ({ x, y, id });
  return { hold, log, advance, p, now: () => now, set onHelp(v: boolean) { onHelp = v; } };
}

describe('holding ✋ (T14): the adult\'s "¿En qué lo ayudaste?"', () => {
  it('watches every ✋ of a page bar, for 1.5 s', () => {
    expect(HELP_BUTTON).toBe('.level-bar .help');
    expect(HELP_HOLD_MS).toBe(1500);
  });

  it('a short tap does nothing here: the click reaches ✋ and the child gets the help as before', () => {
    const r = rig();
    r.hold.down(r.p(), r.now());
    r.advance(300);
    r.hold.up(r.p());
    r.advance(5000);
    expect(r.log).toEqual([]);
    // even a long-ish tap under the time
    r.hold.down(r.p(), r.now());
    r.advance(HELP_HOLD_MS - 1);
    r.hold.up(r.p());
    r.advance(5000);
    expect(r.log).toEqual([]);
  });

  it('held 1.5 s it opens the question once, and the click that ends the press is swallowed (no help step)', () => {
    const r = rig();
    r.hold.down(r.p(), r.now());
    r.advance(750);
    expect(r.hold.progress(r.now())).toBeCloseTo(0.5);
    r.advance(750);
    expect(r.log).toEqual(['swallow', 'question']);
    expect(r.hold.progress(r.now())).toBeNull();
    r.hold.up(r.p());
    r.advance(5000);
    expect(r.log).toEqual(['swallow', 'question']);
  });

  it('a finger that slides away, or a press elsewhere, does not open it', () => {
    const r = rig();
    r.hold.down(r.p(), r.now());
    r.advance(500);
    r.hold.move(r.p(10 + SLOP_PX - 2, 10));
    r.advance(200);
    r.hold.move(r.p(10 + SLOP_PX + 6, 10));
    r.advance(3000);
    expect(r.log).toEqual([]);
    r.onHelp = false;
    r.hold.down(r.p(), r.now());
    r.advance(3000);
    expect(r.log).toEqual([]);
  });

  it('another finger lifting does not cancel the adult\'s press', () => {
    const r = rig();
    r.hold.down(r.p(10, 10, 1), r.now());
    r.advance(800);
    r.hold.up(r.p(200, 200, 2));
    r.advance(700);
    expect(r.log).toEqual(['swallow', 'question']);
  });
});
