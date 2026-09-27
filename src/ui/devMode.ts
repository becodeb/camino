// Dev mode: for the adult who shows or tests the demo, never for the child.
// Off, the child's rules hold (sheets after the teacher's wait, doors open
// after the essential pages, the boss after the core). On, nothing is
// blocked and the dev drawer can jump anywhere. Turned on by the "dev" tab,
// the ` key (or typing d-e-v), or `?dev` in the URL; kept for the browser
// tab's session (sessionStorage, wrapped: it works without storage too).

import { useSyncExternalStore } from 'react';

export interface DevState {
  /** Nothing is blocked. */
  on: boolean;
  /** The drawer is open (it only opens while dev mode is on). */
  open: boolean;
}

const KEY = 'camino.dev.v1';
const OFF: DevState = { on: false, open: false };

function load(): DevState {
  try {
    if (typeof location !== 'undefined' && /[?&]dev\b/.test(location.search)) return { on: true, open: true };
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return OFF;
    const o = JSON.parse(raw) as Partial<DevState>;
    return { on: !!o.on, open: !!o.on && !!o.open };
  } catch {
    return OFF;
  }
}

let state: DevState = load();
const subs = new Set<() => void>();

function set(next: DevState) {
  state = { on: next.on, open: next.on && next.open };
  try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* no storage: dev mode lasts until reload */ }
  subs.forEach((f) => f());
}

export const devMode = {
  get: () => state,
  /** The tab and the key: off → on and open; open ⇄ folded away (still on). */
  toggle() { set(state.on ? { on: true, open: !state.open } : { on: true, open: true }); },
  off() { set(OFF); },
  subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; },
};

export function useDev(): DevState {
  return useSyncExternalStore(devMode.subscribe, devMode.get, devMode.get);
}
