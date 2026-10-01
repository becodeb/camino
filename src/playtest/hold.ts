// A long press, as a pure state machine (useHold in AdultControls.tsx wires
// it to the window's pointer events, a timer and a ring that fills): a press
// that starts where `where` says, stays within SLOP_PX and lasts `ms` fires;
// letting go earlier, moving away, or another press cancels it. When it
// fires, the click that ends the press is swallowed (so ✋ under the adult's
// finger does not also give the child a help); a short tap is left alone,
// so the control under it works as before.

export const SLOP_PX = 14;

export interface HoldPointer { x: number; y: number; id: number }

export interface HoldDeps {
  ms: number;
  where(e: HoldPointer): boolean;
  fire(): void;
  /** The click that ends a fired press must not reach the page. */
  swallowClick(): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(h: unknown): void;
}

export interface Hold {
  down(e: HoldPointer, now: number): void;
  move(e: HoldPointer): void;
  up(e: HoldPointer): void;
  /** 0–1 while held, null otherwise. */
  progress(now: number): number | null;
  cancel(): void;
}

export function createHold(d: HoldDeps): Hold {
  let start: (HoldPointer & { t: number }) | null = null;
  let timer: unknown = null;
  const stop = () => {
    if (timer != null) d.clearTimer(timer);
    timer = null;
    start = null;
  };
  return {
    down(e, now) {
      if (!d.where(e)) return;
      stop();
      start = { ...e, t: now };
      timer = d.setTimer(() => {
        timer = null;
        start = null;
        d.swallowClick();
        d.fire();
      }, d.ms);
    },
    move(e) {
      if (start && e.id === start.id && Math.hypot(e.x - start.x, e.y - start.y) > SLOP_PX) stop();
    },
    up(e) { if (start && e.id === start.id) stop(); },
    progress(now) { return start ? Math.min(1, (now - start.t) / d.ms) : null; },
    cancel: stop,
  };
}
