import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMuted, setMuted, subscribeMuted } from './mute';

describe('the master mute (T18)', () => {
  afterEach(() => { setMuted(false); vi.unstubAllGlobals(); });

  it('is off by default and toggles', () => {
    expect(isMuted()).toBe(false);
    setMuted(true);
    expect(isMuted()).toBe(true);
    setMuted(false);
    expect(isMuted()).toBe(false);
  });

  it('notifies subscribers only on an actual change', () => {
    const seen: boolean[] = [];
    const off = subscribeMuted(() => seen.push(isMuted()));
    setMuted(false); // already off: no notification
    setMuted(true);
    setMuted(true); // already on: no notification
    setMuted(false);
    off();
    setMuted(true); // unsubscribed: not seen
    expect(seen).toEqual([true, false]);
  });

  it('muting cancels anything speaking; unmuting does not need to', () => {
    const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { cancel });
    setMuted(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    setMuted(false);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('without a speechSynthesis (or one that throws) muting never throws', () => {
    expect(() => setMuted(true)).not.toThrow();
    setMuted(false);
    vi.stubGlobal('speechSynthesis', { cancel() { throw new Error('no engine'); } });
    expect(() => setMuted(true)).not.toThrow();
  });
});
