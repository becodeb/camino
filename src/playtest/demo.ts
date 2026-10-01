// The adult's demo mode (T14): to show the pilot to el docente, or to try it
// before a class, without touching the data. Turned on at the setup by a
// tiny "demo" word in a corner (a 2-second press and a confirm, so a child
// does not find it); it lasts for the browser tab (sessionStorage) until it
// is turned off at the setup. A session started in demo mode is synced with
// `demo: true`: the server keeps it out of the export, /admin and every
// view, and deletes it after 24 hours.
//
// In a demo session the demo bar (DemoBar.tsx) offers clearly named tools:
// "Más rápido ×3" (setFast), "Saltar este nivel" / "Resolver este nivel"
// (what the screen on show registers with provideDemoActions), "Ir a…",
// "Mostrar que terminó", "Terminar la sesión".
//
// "Más rápido ×3" speeds up what the pages time: the character's runs and
// moves (the tween engine's speed), the page's own waits (setTimeout and
// setInterval run three times sooner) and every CSS and Web Animation
// (playbackRate 3: walks, the typing game's fall, the ghost hand). Speech
// is not sped up. The playtest's own adult timers (long presses, the class
// end's countdown) use the real clock (realTimeout below).

import { useSyncExternalStore } from 'react';
import { engine } from '../ink/anim.js';
import { simulate } from '../game/engine';
import type { Board, Program } from '../game/model';

const KEY = 'camino.piloto.demo.v1';
export const FAST = 3;

/** The real timers, captured before any speed-up: the adult's long presses and the class end's countdown use them. */
export const realTimeout: (fn: () => void, ms: number) => number = typeof window !== 'undefined'
  ? window.setTimeout.bind(window) as unknown as (fn: () => void, ms: number) => number
  : ((fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number);
export const realInterval: (fn: () => void, ms: number) => number = typeof window !== 'undefined'
  ? window.setInterval.bind(window) as unknown as (fn: () => void, ms: number) => number
  : ((fn: () => void, ms: number) => setInterval(fn, ms) as unknown as number);

interface DemoState { on: boolean; fast: boolean }

function load(): DemoState {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(KEY) : null;
    const o = raw ? JSON.parse(raw) as Partial<DemoState> : null;
    return { on: !!o?.on, fast: false };
  } catch {
    return { on: false, fast: false };
  }
}

let state: DemoState = load();
const subs = new Set<() => void>();
function set(next: DemoState) {
  state = next;
  try { sessionStorage.setItem(KEY, JSON.stringify({ on: state.on })); } catch { /* no storage: the mode lasts until reload */ }
  subs.forEach((f) => f());
}

export const demoMode = {
  get: () => state,
  /** The setup's toggle (after its long press and confirm). */
  setOn(on: boolean) { if (!on) setFast(false); set({ ...state, on }); },
  subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; },
};

export function useDemo(): DemoState {
  return useSyncExternalStore(demoMode.subscribe, demoMode.get, demoMode.get);
}

// ------------------------------------------------------------------ "Más rápido ×3"

type TimerFn = (handler: TimerHandler, ms?: number, ...args: unknown[]) => number;
let patched: { st: TimerFn; si: TimerFn; tick: number } | null = null;

/** Turns the speed-up on or off (demo sessions only; a new session turns it off). */
export function setFast(on: boolean) {
  if (typeof window === 'undefined' || on === !!patched) { if (state.fast !== on) set({ ...state, fast: on }); return; }
  const w = window as unknown as { setTimeout: TimerFn; setInterval: TimerFn };
  if (on) {
    const st = w.setTimeout;
    const si = w.setInterval;
    w.setTimeout = ((h: TimerHandler, ms?: number, ...a: unknown[]) => st.call(window, h, typeof ms === 'number' ? ms / FAST : ms, ...a)) as TimerFn;
    w.setInterval = ((h: TimerHandler, ms?: number, ...a: unknown[]) => si.call(window, h, typeof ms === 'number' ? Math.max(16, ms / FAST) : ms, ...a)) as TimerFn;
    const rate = () => {
      try { for (const a of document.getAnimations()) if (a.playbackRate !== FAST) a.playbackRate = FAST; } catch { /* no Web Animations: CSS stays at its speed */ }
    };
    rate();
    const tick = realInterval(rate, 80);
    patched = { st, si, tick };
    (engine as { speed: number }).speed = 1 / FAST;
  } else if (patched) {
    w.setTimeout = patched.st;
    w.setInterval = patched.si;
    window.clearInterval(patched.tick);
    patched = null;
    (engine as { speed: number }).speed = 1;
    try { for (const a of document.getAnimations()) a.playbackRate = 1; } catch { /* nothing to reset */ }
  }
  set({ ...state, fast: on });
}

// ------------------------------------------------------------------ what the screen on show offers

/** What the demo bar's "Saltar" and "Resolver" do on the screen on show. */
export interface DemoActions {
  /** 2: a level page; 1: an activity or a game around pages; 0: the step. The highest (then the latest) wins. */
  rank: number;
  skip?: () => void;
  solve?: () => void;
  /** What the buttons name: "nivel" (a page), "ronda" (the typing game's round), "juego" (an activity), "paso" (a whole step). */
  noun?: 'nivel' | 'ronda' | 'juego' | 'paso';
}

let entries: { a: DemoActions; n: number }[] = [];
let counter = 0;
const actionSubs = new Set<() => void>();
let snap: DemoActions | null = null;
function changed() {
  snap = currentDemoActions();
  actionSubs.forEach((f) => f());
}

/** Registers the screen's demo actions; returns the unregister. */
export function provideDemoActions(a: DemoActions): () => void {
  const e = { a, n: ++counter };
  entries = [...entries, e];
  changed();
  return () => {
    entries = entries.filter((x) => x !== e);
    changed();
  };
}

/** The actions in charge now (the highest rank, the latest registered). */
export function currentDemoActions(): DemoActions | null {
  let best: { a: DemoActions; n: number } | null = null;
  for (const e of entries) if (!best || e.a.rank > best.a.rank || (e.a.rank === best.a.rank && e.n > best.n)) best = e;
  return best?.a ?? null;
}

export function useDemoActions(): DemoActions | null {
  return useSyncExternalStore(
    (fn) => { actionSubs.add(fn); return () => { actionSubs.delete(fn); }; },
    () => snap,
    () => null,
  );
}

/** Tests: forget every registration. */
export function resetDemoActionsForTests() { entries = []; snap = null; }

// ------------------------------------------------------------------ "Resolver este nivel" on a level page

interface PageHooks {
  level?: { solution?: Program; format?: string; worlds?: Board[]; realtime?: { solution?: unknown[] } };
  program?: Program;
  setProgram?: (p: Program) => void;
  run?: () => void;
  guess?: (c: number, r: number) => void;
  setRules?: (r: unknown[]) => void;
  start?: () => void;
}

/**
 * Solves the level page on screen the way a child would, through the page's
 * own hooks (levelKit's useDebugHooks, on in demo sessions): a program
 * page gets its reference solution and ▶; a predict page the cell where
 * the character really ends, and ▶; a rule game its rules and ▶ (the arrows
 * are still played by hand). False when the page offers no way.
 */
export function solvePageOnScreen(): boolean {
  const hooks = () => (window as unknown as { __camino?: PageHooks }).__camino;
  // ▶ after the page re-rendered with the new program (its hooks are refreshed every render)
  const play = (start = false) => realTimeout(() => { const n = hooks(); if (start) n?.start?.(); else n?.run?.(); }, 300);
  const h = hooks();
  const lv = h?.level;
  if (!h || !lv) return false;
  if (lv.format === 'predict' && h.guess && h.run && lv.worlds?.[0] && h.program) {
    const f = simulate(lv.worlds[0], h.program).final;
    h.guess(f.c, f.r);
    play();
    return true;
  }
  if (lv.solution && h.setProgram && h.run) {
    h.setProgram(structuredClone(lv.solution));
    play();
    return true;
  }
  if (lv.realtime?.solution && h.setRules && h.start) {
    h.setRules(lv.realtime.solution);
    play(true);
    return true;
  }
  return false;
}
