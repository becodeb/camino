// The master sound switch (T18, the silent classroom round): muted, no
// audio plays at all, in the playtest or the demo alike. `speech.ts` still
// filters every line and feeds it to the on-screen text listener when
// muted (so captions keep working); it just never calls
// `speechSynthesis.speak`, and muting cancels anything already speaking.
// `sound.ts`'s `ringNote` (the xylophone) does nothing while muted.
//
// What decides the effective value (the admin's class setting, the
// bookmark's `?sonido=`, the adult's corner-menu override) lives in
// `src/playtest/soundSetting.ts`, which calls `setMuted` whenever that
// resolves to a new value. This module only holds the live on/off switch
// itself, so the demo (which never touches soundSetting.ts) can still be
// muted by a future caller without pulling in the playtest's policy.
//
// Decision on the 🔊 "escuchar otra vez" buttons (every one of them: the
// setup's, a level bar's, the typing game's, the probes'): they are left
// as they are, never hidden. A tap on one calls `speak(text)` with the
// instruction's own text, and `speak` always feeds the on-screen text
// listener even while muted (only the call to `speechSynthesis.speak` is
// skipped) — so while muted, pressing 🔊 already does something useful:
// it re-shows the line on screen, exactly the "re-show the on-screen
// line" alternative the brief offers. Hiding every 🔊 button across every
// step, the typing game and both probes would touch many more files for
// no behavioural gain (muted, they already do the harmless, useful thing)
// and risks exactly the layout breakage the brief warns about.

import { useSyncExternalStore } from 'react';

const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

let muted = false;

export const isMuted = (): boolean => muted;

export function setMuted(v: boolean): void {
  if (muted === v) return;
  muted = v;
  if (v && typeof speechSynthesis !== 'undefined') {
    try { speechSynthesis.cancel(); } catch { /* no speech engine here */ }
  }
  notify();
}

/** Subscribes to every change; returns the unsubscriber. */
export function subscribeMuted(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}

export const useMuted = (): boolean => useSyncExternalStore(subscribeMuted, isMuted, isMuted);
