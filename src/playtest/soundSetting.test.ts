import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isMuted } from '../ui/mute';
import {
  deviceSoundFrom, ensureSoundSettingStarted, currentSound, initDeviceSound, parseSoundParam,
  resetSoundSettingForTests, resolveSound, setAdminSound, setAdultOverride, subscribeSound,
} from './soundSetting';

describe('?sonido= parsing', () => {
  it('accepts no/si, 0/1, off/on, case-insensitively; null otherwise', () => {
    expect(parseSoundParam('?sonido=no')).toBe(false);
    expect(parseSoundParam('?sonido=SI')).toBe(true);
    expect(parseSoundParam('?debug&sonido=0')).toBe(false);
    expect(parseSoundParam('?sonido=1')).toBe(true);
    expect(parseSoundParam('?sonido=off')).toBe(false);
    expect(parseSoundParam('?sonido=ON')).toBe(true);
    expect(parseSoundParam('?sonido=maybe')).toBeNull();
    expect(parseSoundParam('')).toBeNull();
    expect(parseSoundParam('?grado=1')).toBeNull();
  });
});

describe('the device baseline', () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, _m: m };
  };

  it('a URL param is persisted so a later reload without it keeps the value', () => {
    const s = store();
    expect(deviceSoundFrom('?sonido=no', s)).toBe(false);
    expect(s._m.get('camino.sound.v1')).toBe('0');
    expect(deviceSoundFrom('', s)).toBe(false);
    expect(deviceSoundFrom('?sonido=si', s)).toBe(true);
    expect(deviceSoundFrom('', s)).toBe(true);
  });

  it('no URL and nothing stored: null (the default applies)', () => {
    expect(deviceSoundFrom('', store())).toBeNull();
    expect(deviceSoundFrom('', null)).toBeNull();
  });

  it('storage that throws never breaks it', () => {
    const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    expect(deviceSoundFrom('?sonido=no', bad)).toBe(false);
    expect(deviceSoundFrom('', bad)).toBeNull();
  });
});

describe('resolveSound: admin > adult (this load) > device/url > default on', () => {
  it('the admin setting wins while live', () => {
    expect(resolveSound('on', false, false)).toEqual({ on: true, source: 'admin' });
    expect(resolveSound('off', true, true)).toEqual({ on: false, source: 'admin' });
  });
  it('"link" (no class override) falls through to the adult, then the device', () => {
    expect(resolveSound('link', true, false)).toEqual({ on: true, source: 'adult' });
    expect(resolveSound('link', null, false)).toEqual({ on: false, source: 'url' });
    expect(resolveSound('link', null, null)).toEqual({ on: true, source: 'default' });
  });
});

describe('the live store', () => {
  beforeEach(() => { resetSoundSettingForTests(); });
  afterEach(() => { resetSoundSettingForTests(); vi.restoreAllMocks(); });

  it('drives ui/mute.ts and notifies only on a real change', () => {
    const seen: boolean[] = [];
    const off = subscribeSound((s) => seen.push(s.on));
    expect(isMuted()).toBe(false);
    initDeviceSound('?sonido=no', null);
    expect(isMuted()).toBe(true);
    expect(currentSound()).toEqual({ on: false, source: 'url' });
    expect(setAdminSound('link')).toBe(false); // already link: no change
    expect(setAdminSound('off')).toBe(true); // same `on` value (false), but the source changes url -> admin: still a change
    expect(setAdminSound('on')).toBe(true);
    expect(isMuted()).toBe(false);
    off();
    expect(seen).toEqual([false, false, true]);
  });

  it('the admin setting beats the adult override, which beats the device baseline', () => {
    initDeviceSound('?sonido=si', null);
    expect(currentSound()).toEqual({ on: true, source: 'url' });
    setAdultOverride(false);
    expect(currentSound()).toEqual({ on: false, source: 'adult' });
    setAdminSound('on');
    expect(currentSound()).toEqual({ on: true, source: 'admin' });
    setAdminSound('link'); // expired: falls back to the adult's still-live override
    expect(currentSound()).toEqual({ on: false, source: 'adult' });
  });

  it('ensureSoundSettingStarted applies the fetched value once, and is idempotent', async () => {
    const fetchFn = vi.fn().mockResolvedValue('off' as const);
    await ensureSoundSettingStarted(fetchFn);
    await ensureSoundSettingStarted(fetchFn); // cached: the fetch is not called again
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(currentSound()).toEqual({ on: false, source: 'admin' });
  });

  it('a failed or timed-out fetch (null) leaves the device/url baseline in charge', async () => {
    initDeviceSound('?sonido=no', null);
    await ensureSoundSettingStarted(() => Promise.resolve(null));
    expect(currentSound()).toEqual({ on: false, source: 'url' });
  });

  it('a rejected fetch never throws out of ensureSoundSettingStarted', async () => {
    await expect(ensureSoundSettingStarted(() => Promise.reject(new Error('network')))).resolves.toBeUndefined();
  });
});
