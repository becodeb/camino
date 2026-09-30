import { afterEach, describe, expect, it, vi } from 'vitest';
import { devAllowed, devKeyListener, type DevKey } from './devMode';

const key = (k: string, o: Partial<DevKey> = {}): DevKey => ({ key: k, code: k === '`' ? 'Backquote' : `Key${k.toUpperCase()}`, preventDefault() {}, ...o });

function typeKeys(listener: (e: DevKey) => void, keys: string[]) {
  for (const k of keys) listener(key(k));
}

describe('dev mode in a pilot playtest build', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it('is allowed in the demo build, and in a playtest build only with ?debug', () => {
    expect(devAllowed(false, '')).toBe(true);
    expect(devAllowed(false, '?dev')).toBe(true);
    expect(devAllowed(true, '')).toBe(false);
    expect(devAllowed(true, '?dev')).toBe(false);
    expect(devAllowed(true, '?debugger')).toBe(false);
    expect(devAllowed(true, '?debug')).toBe(true);
    expect(devAllowed(true, '?debug&nointro')).toBe(true);
    expect(devAllowed(true, '?libre=3&debug')).toBe(true);
  });

  it('typing d-e-v or ` never toggles it in a playtest build without ?debug', () => {
    const toggle = vi.fn();
    const on = devKeyListener(toggle, () => devAllowed(true, '?libre=3'));
    typeKeys(on, ['d', 'e', 'v', '`', 'd', 'e', 'v']);
    on(key('Dead', { code: 'Backquote' }));
    expect(toggle).not.toHaveBeenCalled();
  });

  it('with ?debug (and in the demo build) the keys still toggle it', () => {
    for (const may of [() => devAllowed(true, '?debug'), () => devAllowed(false, '')]) {
      const toggle = vi.fn();
      const on = devKeyListener(toggle, may);
      typeKeys(on, ['s', 'd', 'e', 'v']);
      expect(toggle).toHaveBeenCalledTimes(1);
      on(key('`'));
      expect(toggle).toHaveBeenCalledTimes(2);
    }
  });

  it('ignores shortcuts with modifiers and text fields', () => {
    const toggle = vi.fn();
    const on = devKeyListener(toggle, () => true);
    on(key('d')); on(key('e', { ctrlKey: true })); on(key('v'));
    expect(toggle).not.toHaveBeenCalled();
    const field = { tagName: 'TEXTAREA' } as unknown as EventTarget;
    for (const k of ['d', 'e', 'v', '`']) on(key(k, { target: field }));
    expect(toggle).not.toHaveBeenCalled();
  });

  it('the store itself stays off in a playtest build without ?debug', async () => {
    vi.stubEnv('VITE_PLAYTEST', '1');
    vi.resetModules();
    const { devMode } = await import('./devMode');
    devMode.toggle();
    devMode.toggle();
    expect(devMode.get()).toEqual({ on: false, open: false });
  });

  it('and toggles in the demo build', async () => {
    vi.stubEnv('VITE_PLAYTEST', '');
    vi.resetModules();
    const { devMode } = await import('./devMode');
    devMode.toggle();
    expect(devMode.get()).toEqual({ on: true, open: true });
  });
});
