// Dev mode: for the adult who shows or tests the demo, never for the child.
// Off, the child's rules hold (sheets after the teacher's wait, doors open
// after the essential pages, the boss after the core). On, nothing is
// blocked and the dev drawer can jump anywhere. Turned on by the "dev" tab,
// the ` key (or typing d-e-v), or `?dev` in the URL; kept for the browser
// tab's session (sessionStorage, wrapped: it works without storage too).
// A pilot playtest build (VITE_PLAYTEST=1) is played by children at school:
// there dev mode never comes on (not by the keys, the URL or a stored state)
// unless the URL has ?debug.

import { useSyncExternalStore } from 'react';

export interface DevState {
  /** Nothing is blocked. */
  on: boolean;
  /** The drawer is open (it only opens while dev mode is on). */
  open: boolean;
}

const KEY = 'camino.dev.v1';
const OFF: DevState = { on: false, open: false };

/** Whether dev mode may come on: always in the demo's build; in a playtest build only with ?debug in the URL. */
export function devAllowed(playtestBuild: boolean, search: string): boolean {
  return !playtestBuild || /[?&]debug\b/.test(search);
}

const PLAYTEST_BUILD = import.meta.env.VITE_PLAYTEST === '1';
const allowed = () => devAllowed(PLAYTEST_BUILD, typeof location !== 'undefined' ? location.search : '');

function load(): DevState {
  try {
    if (!allowed()) return OFF;
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
  toggle() { if (allowed()) set(state.on ? { on: true, open: !state.open } : { on: true, open: true }); },
  off() { set(OFF); },
  subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; },
};

/** The key events dev mode listens to (a subset of KeyboardEvent). */
export interface DevKey {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: EventTarget | null;
  preventDefault(): void;
}

/**
 * The keydown listener of the dev drawer: the ` key toggles dev mode, and so
 * does typing "dev" (for keyboards where ` is a dead key). Nothing happens
 * while dev mode is not allowed (a playtest build without ?debug), nor in a
 * text field.
 */
export function devKeyListener(toggle: () => void, may: () => boolean = allowed): (e: DevKey) => void {
  let typed = '';
  return (e) => {
    if (!may()) { typed = ''; return; }
    const t = e.target as HTMLElement | null | undefined;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'Backquote' || e.key === '`') { e.preventDefault(); toggle(); return; }
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    typed = (typed + e.key.toLowerCase()).slice(-3);
    if (typed === 'dev') { typed = ''; toggle(); }
  };
}

export function useDev(): DevState {
  return useSyncExternalStore(devMode.subscribe, devMode.get, devMode.get);
}
