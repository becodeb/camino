import { afterEach, describe, expect, it } from 'vitest';
import { isVoiceOff, setVoiceOff } from '../ui/voice';
import { initDeviceVoice, setDeviceVoice, voiceFromStorage, VOICE_KEY } from './voiceSetting';

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, _m: m };
};

describe('the "Voz" switch\'s device storage', () => {
  afterEach(() => setVoiceOff(false));

  it('nothing saved: null (the default, on, applies)', () => {
    expect(voiceFromStorage(store())).toBeNull();
    expect(voiceFromStorage(null)).toBeNull();
  });

  it('storage that throws never breaks it', () => {
    const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    expect(voiceFromStorage(bad)).toBeNull();
    expect(() => setDeviceVoice(false)).not.toThrow();
  });

  it('initDeviceVoice restores the saved choice (on by default)', () => {
    const s = store();
    initDeviceVoice(s);
    expect(isVoiceOff()).toBe(false);
    s._m.set(VOICE_KEY, '0');
    initDeviceVoice(s);
    expect(isVoiceOff()).toBe(true);
    s._m.set(VOICE_KEY, '1');
    initDeviceVoice(s);
    expect(isVoiceOff()).toBe(false);
  });

  it('setDeviceVoice persists the choice, so the next initDeviceVoice on the same storage restores it', () => {
    const s = store();
    initDeviceVoice(s);
    setDeviceVoice(false);
    expect(isVoiceOff()).toBe(true);
    expect(s._m.get(VOICE_KEY)).toBe('0');
    // a later session on the same device (a new PlaytestScreen mount): restored, not reset to on
    initDeviceVoice(s);
    expect(isVoiceOff()).toBe(true);
    setDeviceVoice(true);
    expect(isVoiceOff()).toBe(false);
    expect(s._m.get(VOICE_KEY)).toBe('1');
  });

  it('with no storage, the choice holds for this page load only (never throws)', () => {
    initDeviceVoice(null);
    expect(() => setDeviceVoice(false)).not.toThrow();
    expect(isVoiceOff()).toBe(true);
  });
});
