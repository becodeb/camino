// Tiny frame-driven tween engine. Every tween belongs to an owner so a whole
// performance (a character's walk, a celebration) can be aborted at once.

export const ABORT = Symbol('abort');

export const E = {
  linear: (t) => t,
  in: (t) => t * t,
  in3: (t) => t * t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  out3: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inOut3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => {
    const c = 1.9;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  softBack: (t) => {
    const c = 0.9;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  // ease-in-out with a long, floaty middle (hang time at the top of a hop)
  hang: (t) => {
    const s = t < 0.5 ? 1 - Math.pow(1 - 2 * t, 2.4) : Math.pow(2 * t - 1, 2.4);
    return t < 0.5 ? s / 2 : 0.5 + s / 2;
  },
};

class Engine {
  constructor() {
    this.items = new Set();
    this.time = performance.now();
    this.speed = 1;
  }
  update(time) {
    this.time = time;
    for (const it of [...this.items]) {
      const p = Math.min(1, (time - it.t0) / it.dur);
      if (it.fn) it.fn(p, time - it.t0);
      else {
        const e = it.ease(p);
        for (const k in it.to) it.target[k] = it.from[k] + (it.to[k] - it.from[k]) * e;
      }
      if (p >= 1) {
        this.items.delete(it);
        it.resolve();
      }
    }
  }
  abort(owner) {
    for (const it of [...this.items]) {
      if (it.owner === owner) {
        this.items.delete(it);
        it.reject(ABORT);
      }
    }
  }
}

export const engine = new Engine();

// Aborted tweens reject with ABORT; callers that fire-and-forget must not
// produce unhandled rejections, so every promise gets a silent handler too.
const handled = (p) => { p.catch(() => {}); return p; };

export function tween(owner, target, props, dur, ease = E.inOut) {
  return handled(new Promise((resolve, reject) => {
    for (const it of engine.items) {
      if (it.target === target && it.to) for (const k in props) delete it.to[k];
    }
    const from = {};
    for (const k in props) from[k] = target[k];
    engine.items.add({
      owner, target, from, to: { ...props }, ease, resolve, reject,
      t0: engine.time, dur: Math.max(1, dur * engine.speed),
    });
  }));
}

export function proc(owner, dur, fn) {
  return handled(new Promise((resolve, reject) => {
    engine.items.add({ owner, fn, resolve, reject, t0: engine.time, dur: Math.max(1, dur * engine.speed) });
  }));
}

export const wait = (owner, ms) => proc(owner, ms, () => {});

/** Damped spring toward a target; returns the new [value, velocity]. */
export function spring(x, v, target, k, damp, dt) {
  const a = -k * (x - target) - damp * v;
  v += a * dt;
  x += v * dt;
  return [x, v];
}
