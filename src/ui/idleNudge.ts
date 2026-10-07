// T20 (silent classroom round): muted, there is no spoken nudge if the
// child freezes on a level — so if nothing happens for a while (no tap,
// drag or key; the ghost hand's own moves never count, since it never
// dispatches a real pointer or keyboard event), the ✋ button pulses and the
// goal glows (ghost.ts's existing wiggleHelp/glowTargets), gently and
// repeatedly, until the child acts. It never solves anything by itself.
//
// Paused while a run is playing (`data-busy`), the ghost is already
// demoing (there is at most one `.ghost-hand` on screen at a time), the
// page is already solved (`.next-page` is on screen: nothing left to point
// at) or the tab is hidden. Not muted: never fires.

import { useEffect } from 'react';
import { glowTargets, wiggleHelp } from './ghost';
import { useMuted } from './mute';

export const IDLE_NUDGE_MS = 15_000;
export const IDLE_NUDGE_REPEAT_MS = 4_000;
const TICK_MS = 1000;

/** Pure: is it time to nudge again, given when the child last acted and the last nudge? */
export function dueForNudge(now: number, lastInput: number, lastNudge: number): boolean {
  return now - lastInput >= IDLE_NUDGE_MS && now - lastNudge >= IDLE_NUDGE_REPEAT_MS;
}

/** Whether `el` is in a state the nudge should skip (and treat as fresh input). */
function paused(el: HTMLElement): boolean {
  return document.hidden || el.getAttribute('data-busy') === 'true' || !!el.querySelector('.next-page') || !!document.querySelector('.ghost-hand');
}

/** The ghost hand's layer: level pages mount this on their root (levelKit.tsx's Shell). */
export function useIdleNudge(root: { current: HTMLElement | null }): void {
  const muted = useMuted();
  useEffect(() => {
    if (!muted) return;
    const el = root.current;
    if (!el) return;
    let lastInput = Date.now();
    let lastNudge = 0;
    const onInput = () => { lastInput = Date.now(); };
    el.addEventListener('pointerdown', onInput, true);
    el.addEventListener('keydown', onInput, true);
    const id = window.setInterval(() => {
      const now = Date.now();
      if (paused(el)) { lastInput = now; return; }
      if (!dueForNudge(now, lastInput, lastNudge)) return;
      lastNudge = now;
      wiggleHelp(el);
      glowTargets(el);
    }, TICK_MS);
    return () => {
      el.removeEventListener('pointerdown', onInput, true);
      el.removeEventListener('keydown', onInput, true);
      clearInterval(id);
    };
  }, [root, muted]);
}
