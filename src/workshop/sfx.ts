// The game's sounds (T40): Scratch's `iniciar sonido` plays one of four
// short synthesized effects (salto, punto, choque, ganar) with Web Audio,
// quiet on purpose (a whole class plays at once). Like ui/sound.ts: nothing
// here may break the page, nothing sounds before the page was ever tapped,
// and the master mute (ui/mute.ts) silences it all.

import { isMuted } from '../ui/mute';
import { VOLUME } from '../ui/sound';

type AudioCtor = new () => AudioContext;
let ctx: AudioContext | null = null;
let broken = false;

function audio(): AudioContext | null {
  if (ctx || broken || typeof window === 'undefined') return ctx;
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (ua && !ua.hasBeenActive) return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  const C = w.AudioContext ?? w.webkitAudioContext;
  if (!C) { broken = true; return null; }
  try { ctx = new C(); } catch { broken = true; }
  return ctx;
}

function tone(c: AudioContext, out: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, amp: number) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(amp, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Plays one of the game's sounds now (silently when muted or without audio). */
export function playSfx(name: string): void {
  if (isMuted()) return;
  try {
    const c = audio();
    if (!c) return;
    if (c.state === 'suspended') void c.resume().catch(() => {});
    const t = c.currentTime + 0.01;
    const out = c.createGain();
    out.gain.value = VOLUME;
    out.connect(c.destination);
    if (name === 'salto') tone(c, out, 'square', 320, 760, t, 0.16, 0.35);
    else if (name === 'punto') { tone(c, out, 'sine', 880, 880, t, 0.12, 0.8); tone(c, out, 'sine', 1320, 1320, t + 0.08, 0.2, 0.7); }
    else if (name === 'choque') { tone(c, out, 'sawtooth', 180, 50, t, 0.3, 0.5); tone(c, out, 'square', 90, 40, t, 0.25, 0.4); }
    else if (name === 'ganar') [523, 659, 784, 1047].forEach((f, i) => tone(c, out, 'triangle', f, f, t + i * 0.1, 0.3, 0.7));
    setTimeout(() => { try { out.disconnect(); } catch { /* gone */ } }, 1500);
  } catch {
    broken = true;
    ctx = null;
  }
}
