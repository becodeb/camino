import { afterEach, describe, expect, it, vi } from 'vitest';
import { isVoiceOff, setVoiceOff, subscribeVoiceOff } from './voice';

describe('the per-device "Voz" switch (T27)', () => {
  afterEach(() => { setVoiceOff(false); vi.unstubAllGlobals(); });

  it('is off (voice on) by default and toggles', () => {
    expect(isVoiceOff()).toBe(false);
    setVoiceOff(true);
    expect(isVoiceOff()).toBe(true);
    setVoiceOff(false);
    expect(isVoiceOff()).toBe(false);
  });

  it('notifies subscribers only on an actual change', () => {
    const seen: boolean[] = [];
    const off = subscribeVoiceOff(() => seen.push(isVoiceOff()));
    setVoiceOff(false); // already on: no notification
    setVoiceOff(true);
    setVoiceOff(true); // already off: no notification
    setVoiceOff(false);
    off();
    setVoiceOff(true); // unsubscribed: not seen
    expect(seen).toEqual([true, false]);
  });

  it('turning the voice off cancels anything speaking; turning it on does not need to', () => {
    const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { cancel });
    setVoiceOff(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    setVoiceOff(false);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('without a speechSynthesis (or one that throws) turning it off never throws', () => {
    expect(() => setVoiceOff(true)).not.toThrow();
    setVoiceOff(false);
    vi.stubGlobal('speechSynthesis', { cancel() { throw new Error('no engine'); } });
    expect(() => setVoiceOff(true)).not.toThrow();
  });
});
