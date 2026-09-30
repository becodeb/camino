// The browser side of the playtest's telemetry: the one client of the page
// (localStorage when it works, memory otherwise; fetch to ./api/sync), and
// the watchers that feed it the automatic events (idle, visibility, errors)
// and flush the queue when the page is hidden or closed and when the network
// comes back.

import { useSyncExternalStore } from 'react';
import { Telemetry, type Backing, type Device, type PostResult, type SyncStatus } from './telemetry';
import { createErrorLimiter, createIdleTracker, sourceFile } from './watch';

declare const __CAMINO_VERSION__: string | undefined;

const SYNC_URL = './api/sync';

function browserStorage(): Backing | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = 'camino.piloto.probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

/** A v4 uuid; crypto.randomUUID only exists on https or localhost (a school LAN may serve plain http). */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch { /* insecure context: build it by hand */ }
  }
  const b = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function device(): Device {
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  return {
    ua: nav.userAgent.slice(0, 400),
    w: screen.width,
    h: screen.height,
    vw: window.innerWidth,
    vh: window.innerHeight,
    dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
    touch: (nav.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window,
    lang: nav.language || '',
  };
}

async function post(body: string, o: { keepalive: boolean }): Promise<PostResult> {
  const res = await fetch(SYNC_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: o.keepalive, cache: 'no-store' });
  let json: unknown;
  try { json = await res.json(); } catch { json = undefined; }
  return { status: res.status, body: json };
}

let client: Telemetry | null = null;

/** The page's one telemetry client (created on first use). */
export function telemetry(): Telemetry {
  if (!client) {
    client = new Telemetry({
      storage: browserStorage(),
      post,
      now: () => Date.now(),
      random: Math.random,
      uuid,
      device,
      appVersion: typeof __CAMINO_VERSION__ === 'string' ? __CAMINO_VERSION__ : null,
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (h) => window.clearTimeout(h as number),
      warn: (...a) => console.warn(...a),
    });
  }
  return client;
}

/** The sync status, live (the adult menu's dot). status() builds a new object: it is cached per notification so React sees a stable value. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeStatus, statusSnapshot, statusSnapshot);
}
let cached: SyncStatus | null = null;
function subscribeStatus(fn: () => void) { return telemetry().subscribe(() => { cached = null; fn(); }); }
function statusSnapshot(): SyncStatus {
  if (!cached) cached = telemetry().status();
  return cached;
}

/**
 * Installs the automatic events for the page: `idle` (30 s without pointer or
 * key input, logged when input resumes), `visibility`, `error`; flushes the
 * queue when the page is hidden or closed, and sends at once when the network
 * comes back. `step()` names the flow step for the idle event; while it is
 * null (the adult's setup, no session yet) nothing is logged. Returns the
 * uninstaller.
 */
export function installWatchers(step: () => string | null): () => void {
  const t = telemetry();
  const idle = createIdleTracker(Date.now());
  const limit = createErrorLimiter();
  const on = () => step() != null;
  const logIdle = (d: number | null) => { if (d != null && on()) t.log('idle', { step: step(), duration_ms: d }); };
  const onInput = () => logIdle(idle.input(Date.now()));
  const onVisibility = () => {
    const hidden = document.visibilityState === 'hidden';
    if (hidden) logIdle(idle.pause(Date.now()));
    else idle.resume(Date.now());
    if (on()) t.log('visibility', { state: hidden ? 'hidden' : 'visible' });
    if (hidden) t.flushKeepalive();
  };
  const onPageHide = () => t.flushKeepalive();
  const onOnline = () => t.online();
  const onError = (e: ErrorEvent) => {
    const info = limit({ message: e.message, source: sourceFile(e.filename), line: e.lineno || undefined, col: e.colno || undefined }, Date.now());
    if (info && on()) t.log('error', { ...info });
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    const r = e.reason as { message?: unknown } | undefined;
    const info = limit({ message: `unhandled rejection: ${typeof r?.message === 'string' ? r.message : String(e.reason)}` }, Date.now());
    if (info && on()) t.log('error', { ...info });
  };
  const inputs = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const;
  inputs.forEach((n) => window.addEventListener(n, onInput, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('online', onOnline);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    inputs.forEach((n) => window.removeEventListener(n, onInput, { capture: true }));
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
