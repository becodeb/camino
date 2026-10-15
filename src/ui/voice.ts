// T27: a per-device "Voz" switch, separate from the master mute (ui/mute.ts):
// silences speech only — speech.ts gates speechSynthesis.speak on it the
// same way it already gates on isMuted — while sfx and music (sound.ts,
// ringNote) keep playing regardless. A teacher can turn a computer's volume
// up and still silence just the one that is talking too much.
//
// What decides the persisted value (localStorage, the adult corner menu)
// lives in playtest/voiceSetting.ts, which calls setVoiceOff whenever it
// changes. This module only holds the live on/off switch itself, mirroring
// how ui/mute.ts holds the master switch while playtest/soundSetting.ts owns
// its policy and persistence.

import { useSyncExternalStore } from 'react';

const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

let voiceOff = false;

export const isVoiceOff = (): boolean => voiceOff;

export function setVoiceOff(v: boolean): void {
  if (voiceOff === v) return;
  voiceOff = v;
  if (v && typeof speechSynthesis !== 'undefined') {
    try { speechSynthesis.cancel(); } catch { /* no speech engine here */ }
  }
  notify();
}

/** Subscribes to every change; returns the unsubscriber. */
export function subscribeVoiceOff(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}

export const useVoiceOff = (): boolean => useSyncExternalStore(subscribeVoiceOff, isVoiceOff, isVoiceOff);
