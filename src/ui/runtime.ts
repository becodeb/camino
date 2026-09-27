// One animation loop and one line-boil clock for the whole app (docs/05 §3).
// Boards register a per-frame callback; the tween engine advances here.

import { engine } from '../ink/anim.js';

export const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type FrameFn = (t: number, dt: number) => void;
const frames = new Set<FrameFn>();
let started = false;

export function onFrame(fn: FrameFn): () => void {
  frames.add(fn);
  start();
  return () => frames.delete(fn);
}

function start() {
  if (started) return;
  started = true;
  let last = performance.now();
  const loop = (t: number) => {
    const dt = Math.min(0.05, Math.max(0.001, (t - last) / 1000));
    last = t;
    engine.update(t);
    for (const f of [...frames]) f(t, dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // line boil: step the noise seed a few times per second, like frame-by-frame drawings
  if (!REDUCED) {
    let boilFrame = 0;
    setInterval(() => {
      boilFrame = (boilFrame + 1) % 3;
      document.getElementById('boil-noise')?.setAttribute('seed', String(boilFrame * 7 + 1));
    }, 130);
  }
}
