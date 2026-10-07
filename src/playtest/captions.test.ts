import { afterEach, describe, expect, it } from 'vitest';
import { setSpeechFilter, speak, stopSpeaking } from '../ui/speech';
import { captionsByGrade, captionsFor, captionsOn, captionsShown, captionsUpper, clearCaption, installCaptions, setCaptions } from './captions';
import * as captions from './captions';

describe('on-screen text', () => {
  let off: (() => void) | null = null;
  afterEach(() => { off?.(); off = null; setSpeechFilter(null); });

  it('is on by default from 3ro, off for 1ro and 2do; the setup can force it', () => {
    expect([1, 2, 3, 4, 5].map(captionsByGrade)).toEqual([false, false, true, true, true]);
    expect(captionsFor(1, 'on')).toBe(true);
    expect(captionsFor(5, 'off')).toBe(false);
    expect(captionsFor(2, 'auto')).toBe(false);
    expect(captionsFor(3, 'auto')).toBe(true);
  });

  it('T20: muted, the text is always shown, in capital letters for 1ro/2do only', () => {
    expect(captionsShown(false, false)).toBe(false);
    expect(captionsShown(false, true)).toBe(true);
    expect(captionsShown(true, false)).toBe(true);
    expect(captionsShown(true, true)).toBe(true);
    expect([1, 2, 3, 4, 5].map((g) => captionsUpper(true, g))).toEqual([true, true, false, false, false]);
    expect([1, 2, 3, 4, 5].map((g) => captionsUpper(false, g))).toEqual([false, false, false, false, false]);
  });

  it('hears every spoken line (after the speech filter) and drops it when speech stops', () => {
    const seen: (string | null)[] = [];
    off = installCaptions();
    const unsub = subscribeLine((l) => seen.push(l));
    setSpeechFilter((t) => t.replace('Brote', 'Mina'));
    speak('Ayudá a Brote a llegar.');
    speak('Ayudá a Brote a llegar.'); // the same line again (🔊): no new caption
    stopSpeaking();
    speak('Otra línea.');
    clearCaption();
    unsub();
    expect(seen).toEqual(['Ayudá a Mina a llegar.', null, 'Otra línea.', null]);
  });

  it('the demo never installs it: lines are said, nothing is kept', () => {
    const seen: (string | null)[] = [];
    const unsub = subscribeLine((l) => seen.push(l));
    speak('Una línea del demo.');
    unsub();
    expect(seen).toEqual([]);
  });

  it('keeps the on/off state until the playtest goes', () => {
    off = installCaptions();
    setCaptions(true);
    expect(captionsOn()).toBe(true);
    off();
    off = null;
    expect(captionsOn()).toBe(false);
  });
});

/** Follows the current line through the store's own snapshot (what useCaptionLine reads). */
function subscribeLine(f: (text: string | null) => void): () => void {
  return captions.subscribeCaptions(() => f(captions.captionLine()?.text ?? null));
}
