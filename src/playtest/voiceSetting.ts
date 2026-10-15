// T27: the per-device "Voz" switch's persistence (localStorage, survives a
// new session and a reload on the same computer) — unlike the corner menu's
// "Sonido" override (soundSetting.ts's adult layer), which is deliberately
// page-load-only, this one is a teacher's one-time choice for the machine.
// ui/voice.ts holds the live flag that speech.ts actually reads; this module
// is the one place that reads and writes it to storage.

import { setVoiceOff } from '../ui/voice';

export const VOICE_KEY = 'camino.voice.v1';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The persisted choice ("voice is on"), or null when nothing was ever saved here (on, the default, applies). */
export function voiceFromStorage(storage: Store | null): boolean | null {
  try {
    const raw = storage?.getItem(VOICE_KEY);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch { /* no storage here: on for this page load, never saved */ }
  return null;
}

let backing: Store | null = null;

/** The setup, once per app load: restores this device's saved choice (on by default). */
export function initDeviceVoice(storage: Store | null): void {
  backing = storage;
  setVoiceOff(voiceFromStorage(storage) === false);
}

/** The adult corner menu's "Voz: sí / no" for this device; persists the choice. */
export function setDeviceVoice(on: boolean): void {
  setVoiceOff(!on);
  try { backing?.setItem(VOICE_KEY, on ? '1' : '0'); } catch { /* no storage here: holds for this page load only */ }
}

/** Tests only: the module is a singleton across a whole test file otherwise. */
export function resetDeviceVoiceForTests(): void {
  backing = null;
  setVoiceOff(false);
}
