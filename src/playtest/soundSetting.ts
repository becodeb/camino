// T18 (the silent classroom round): what decides whether the playtest has
// sound at all, and the master mute (ui/mute.ts) that actually silences
// speech and sfx. Layers, highest precedence first:
//
// 1. The admin's class setting (`/admin`'s "Con sonido" / "Sin sonido" /
//    "Como diga el link"), while live (it expires a few hours after it was
//    set): `/api/class-settings` at page load and every `/api/sync` answer
//    carry it, so it reaches a device that opens the link after the
//    teacher pressed the button, and within one sync cycle on a device
//    already playing.
// 2. The adult's corner-menu "Sonido: sí / no" for this one device — but
//    only for the current page load: it is a live decision kept in memory,
//    never persisted. A fresh page load (the next class, a reload) goes
//    back to layer 3, so a `?sonido=` bookmark always wins again from the
//    next load. This departs from reading the brief's list
//    ("admin > url > corner menu") literally, because the corner menu is
//    the adult's own hands-on action on that one device right now and
//    must be felt at once, while the url/device baseline is only what a
//    fresh load falls back to; see `resolveSound`'s own comment.
// 3. The device's own default from the bookmark: `?sonido=no|si` (also
//    `0|1`, `off|on`), persisted to localStorage so a reload without the
//    param keeps it.
// 4. On, by default.
//
// `resolveSound` is the one pure function the three layers feed; every
// change recomputes it and calls `setMuted`. Session-start and the `sound`
// event (docs/prueba-piloto-datos.md) are logged by PlaytestScreen.tsx,
// which is the one place that has both a session and `log()`.

import { setMuted } from '../ui/mute';

export type SoundSource = 'admin' | 'url' | 'adult' | 'default';
export type AdminSound = 'on' | 'off' | 'link';

export interface SoundEffective {
  on: boolean;
  source: SoundSource;
}

export const SOUND_KEY = 'camino.sound.v1';

const SOUND_PARAM_RE = /[?&]sonido=([a-z0-9]+)/i;

/** `?sonido=no|si|0|1|off|on` (case-insensitive); null when absent or not one of those. */
export function parseSoundParam(search: string): boolean | null {
  const m = SOUND_PARAM_RE.exec(search);
  if (!m) return null;
  const v = m[1].toLowerCase();
  if (v === 'si' || v === '1' || v === 'on') return true;
  if (v === 'no' || v === '0' || v === 'off') return false;
  return null;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * The device's own baseline (layer 3): `?sonido=` in the URL, persisted to
 * `storage` so a reload without the param keeps it; otherwise the last
 * persisted value; null when neither ever said anything (the default
 * applies).
 */
export function deviceSoundFrom(search: string, storage: Store | null): boolean | null {
  const fromUrl = parseSoundParam(search);
  if (fromUrl != null) {
    try { storage?.setItem(SOUND_KEY, fromUrl ? '1' : '0'); } catch { /* no storage here: the reload loses it, nothing else breaks */ }
    return fromUrl;
  }
  try {
    const raw = storage?.getItem(SOUND_KEY);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch { /* no storage: the default applies */ }
  return null;
}

/**
 * Pure: the effective setting from the three layers (see the module
 * comment for the precedence and why the adult's live corner-menu choice
 * is read before the device/url baseline).
 */
export function resolveSound(admin: AdminSound, adult: boolean | null, device: boolean | null): SoundEffective {
  if (admin === 'on') return { on: true, source: 'admin' };
  if (admin === 'off') return { on: false, source: 'admin' };
  if (adult != null) return { on: adult, source: 'adult' };
  if (device != null) return { on: device, source: 'url' };
  return { on: true, source: 'default' };
}

// ---------------------------------------------------------------- the live store

let admin: AdminSound = 'link';
let adult: boolean | null = null;
let device: boolean | null = null;
let effective: SoundEffective = resolveSound(admin, adult, device);

const subs = new Set<(s: SoundEffective) => void>();

function recompute() {
  const next = resolveSound(admin, adult, device);
  const changed = next.on !== effective.on || next.source !== effective.source;
  effective = next;
  setMuted(!next.on);
  if (changed) subs.forEach((f) => f(next));
  return changed;
}

/** The setup, once per app load: the device's `?sonido=`/localStorage baseline. */
export function initDeviceSound(search: string, storage: Store | null): void {
  device = deviceSoundFrom(search, storage);
  recompute();
}

/** `/api/class-settings` at load, and every `/api/sync` answer's `settings.sound`. */
export function setAdminSound(v: AdminSound): boolean {
  if (admin === v) return false;
  admin = v;
  return recompute();
}

/** The adult's corner-menu "Sonido: sí / no" for this device, this page load only. */
export function setAdultOverride(v: boolean | null): boolean {
  if (adult === v) return false;
  adult = v;
  return recompute();
}

export const currentSound = (): SoundEffective => effective;

/** Fires on every real change (never on a repeated value), with the new effective setting. */
export function subscribeSound(f: (s: SoundEffective) => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}

// ---------------------------------------------------------------- readiness (before the first spoken line)

let ready: Promise<void> | null = null;

/**
 * Starts (once; later calls return the same promise) the admin layer's
 * fetch and resolves when it is applied or `fetchAdminSound` itself gave up
 * (its own ~1.5 s timeout: a dead network never blocks). The setup awaits
 * this before its first spoken line, so the admin's class setting — even
 * for a device opening the link after the teacher pressed the button — is
 * in effect before anything is said.
 */
export function ensureSoundSettingStarted(fetchAdminSound: () => Promise<AdminSound | null>): Promise<void> {
  if (!ready) {
    ready = fetchAdminSound().then((v) => { if (v != null) setAdminSound(v); }).catch(() => {});
  }
  return ready;
}

/** Tests only: the module is a singleton across a whole test file otherwise. */
export function resetSoundSettingForTests(): void {
  admin = 'link';
  adult = null;
  device = null;
  effective = resolveSound(admin, adult, device);
  ready = null;
  setMuted(false);
}
