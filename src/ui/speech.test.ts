// T18: muted, `speak` never reaches speechSynthesis.speak but still feeds
// the filter and the listener (the on-screen text keeps working). Loaded
// fresh per test (vi.resetModules) since speech.ts remembers a chosen
// voice and mute.ts remembers the muted flag at module scope.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const load = async () => {
  const speech = await import('./speech');
  const mute = await import('./mute');
  return { ...speech, ...mute };
};

describe('speak, muted (T18)', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('never calls speechSynthesis.speak while muted, but still filters and feeds the listener', async () => {
    const speakFn = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak: speakFn, cancel, getVoices: () => [] });
    const { speak, setMuted, setSpeechListener, setSpeechFilter } = await load();
    const seen: (string | null)[] = [];
    setSpeechListener((t) => seen.push(t));
    setSpeechFilter((t) => t.replace('Brote', 'Mina'));
    setMuted(true);
    speak('Ayudá a Brote.');
    expect(speakFn).not.toHaveBeenCalled();
    expect(seen).toEqual(['Ayudá a Mina.']);
    setSpeechListener(null);
    setSpeechFilter(null);
  });

  it('speaks normally once unmuted again', async () => {
    const speakFn = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak: speakFn, cancel: vi.fn(), getVoices: () => [] });
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
    const { speak, setMuted } = await load();
    setMuted(true);
    speak('Una línea.');
    expect(speakFn).not.toHaveBeenCalled();
    setMuted(false);
    speak('Otra línea.');
    expect(speakFn).toHaveBeenCalledTimes(1);
  });

  it('setMuted(true) cancels a line already speaking', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel, getVoices: () => [] });
    const { setMuted } = await load();
    setMuted(true);
    expect(cancel).toHaveBeenCalled();
  });
});
