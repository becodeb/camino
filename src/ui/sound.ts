// The xylophone's voice (sheet 9), synthesized with Web Audio: a soft
// marimba-like tone. A sine at the note with a quick attack and about a
// second of decay, a quieter sine two octaves up that dies fast (the knock of
// the mallet) and a faint click. Quiet on purpose: a whole class may play at
// once.
//
// Nothing here may break a page. Without Web Audio, when it throws, or before
// the page was ever tapped (browsers refuse to start audio then, and the
// next tap tries again), nothing sounds: the board still shows every note.

import type { Pitch } from '../game/music';

/** The fifth octave: a toy xylophone's range, clear on laptop speakers. */
const FREQ: Record<Pitch, number> = { do: 523.25, re: 587.33, mi: 659.25, fa: 698.46, sol: 783.99 };
/** The master volume (0–1). */
export const VOLUME = 0.15;

type AudioCtor = new () => AudioContext;
let ctx: AudioContext | null = null;
/** Web Audio is missing or broken here: stop trying. */
let broken = false;

function audio(): AudioContext | null {
  if (ctx || broken) return ctx;
  if (typeof window === 'undefined') return null;
  // before the first tap the browser would refuse (and complain): wait for one
  const ua = typeof navigator !== 'undefined' ? (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation : undefined;
  if (ua && !ua.hasBeenActive) return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) { broken = true; return null; }
  ctx = new Ctor();
  return ctx;
}

/** One partial: a sine with an exponential envelope, into `out`. */
function partial(c: AudioContext, out: AudioNode, freq: number, amp: number, attack: number, decay: number, t: number) {
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(amp, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

/** Rings a bar of the xylophone now (silently when there is no sound). */
export function ringNote(p: Pitch): void {
  try {
    const c = audio();
    if (!c) return;
    if (c.state === 'suspended') void c.resume().catch(() => {});
    const t = c.currentTime + 0.01;
    const out = c.createGain();
    out.gain.value = VOLUME;
    out.connect(c.destination);
    const f = FREQ[p];
    partial(c, out, f, 1, 0.004, 1.1, t);
    partial(c, out, f * 4, 0.24, 0.002, 0.13, t);
    partial(c, out, f * 10, 0.05, 0.001, 0.03, t);
    setTimeout(() => { try { out.disconnect(); } catch { /* already gone */ } }, 1500);
  } catch {
    // no sound here: the page goes on, the bar still lights up
    broken = true;
    ctx = null;
  }
}
