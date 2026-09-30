// Spoken instructions (Web Speech API): the child never has to read.
// Ported from habilidades (app/src/ui/speech.ts @ 9b90d1d), plus speakWhenAllowed.
// Prefers an Argentine Spanish voice, then any Spanish one.

let chosen: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  const by = (test: (v: SpeechSynthesisVoice) => boolean) => voices.find(test) ?? null;
  return by((v) => /^es[-_]AR/i.test(v.lang))
    ?? by((v) => /^es[-_](419|UY|MX|US|CO|CL)/i.test(v.lang))
    ?? by((v) => /^es\b/i.test(v.lang))
    ?? null;
}

if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.addEventListener?.('voiceschanged', () => { chosen = pickVoice(); });
}

export function speechAvailable(): boolean {
  return typeof speechSynthesis !== 'undefined';
}

export function currentVoice(): { name: string | null; lang: string } {
  if (chosen === undefined) chosen = pickVoice();
  return { name: chosen?.name ?? null, lang: chosen?.lang ?? 'es-AR' };
}

/** Rewrites every line before it is said (the pilot playtest says the chosen character's name); null says lines as written. */
let filter: ((text: string) => string) | null = null;
export function setSpeechFilter(f: ((text: string) => string) | null): void {
  filter = f;
}

export function speak(text: string): void {
  if (!speechAvailable()) return;
  if (filter) text = filter(text);
  if (chosen === undefined) chosen = pickVoice();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = chosen?.lang ?? 'es-AR';
  if (chosen) u.voice = chosen;
  u.rate = 0.92;
  u.pitch = 1.05;
  speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (speechAvailable()) speechSynthesis.cancel();
}

/**
 * Speaks now if the browser lets the page (it was already tapped), otherwise
 * at the first tap anywhere: browsers block speech before any user gesture.
 * Returns a function that drops a line still waiting.
 */
export function speakWhenAllowed(text: string): () => void {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (!ua || ua.hasBeenActive) { speak(text); return () => {}; }
  const off = () => window.removeEventListener('pointerdown', go, true);
  const go = () => { off(); speak(text); };
  window.addEventListener('pointerdown', go, true);
  return off;
}
