import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A fresh copy of the module (it remembers a broken or started audio). */
const load = async () => (await import('./sound')).ringNote;

/** A stand-in AudioContext that records what the synth builds. */
class FakeAudio {
  static made: FakeAudio[] = [];
  state = 'suspended';
  currentTime = 1;
  destination = {};
  resumed = 0;
  freqs: number[] = [];
  gains: number[] = [];
  constructor() { FakeAudio.made.push(this); }
  resume() { this.resumed++; this.state = 'running'; return Promise.resolve(); }
  createOscillator() {
    const self = this;
    return {
      type: '', frequency: { set value(v: number) { self.freqs.push(v); } },
      connect() {}, start() {}, stop() {},
    };
  }
  createGain() {
    const self = this;
    return {
      gain: { set value(v: number) { self.gains.push(v); }, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {}, disconnect() {},
    };
  }
}

describe('the xylophone\'s voice', () => {
  beforeEach(() => { vi.resetModules(); FakeAudio.made = []; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('without a window (or without Web Audio) it is silent and never throws', async () => {
    const ring = await load();
    expect(() => ring('do')).not.toThrow();
    vi.stubGlobal('window', {});
    const again = await load();
    expect(() => { again('mi'); again('sol'); }).not.toThrow();
  });

  it('an AudioContext that throws is given up on quietly', async () => {
    vi.stubGlobal('window', { AudioContext: class { constructor() { throw new Error('no audio device'); } } });
    const ring = await load();
    expect(() => { ring('do'); ring('re'); }).not.toThrow();
  });

  it('before the page was ever tapped it waits (browsers refuse audio then)', async () => {
    vi.stubGlobal('window', { AudioContext: FakeAudio });
    vi.stubGlobal('navigator', { userActivation: { hasBeenActive: false } });
    const ring = await load();
    ring('do');
    expect(FakeAudio.made).toHaveLength(0);
  });

  it('rings a soft tone at the note, two octaves above it, and a click; quietly; resuming a suspended context', async () => {
    vi.stubGlobal('window', { AudioContext: FakeAudio });
    vi.stubGlobal('navigator', { userActivation: { hasBeenActive: true } });
    const ring = await load();
    const { VOLUME } = await import('./sound');
    ring('do');
    ring('sol');
    expect(FakeAudio.made).toHaveLength(1);
    const a = FakeAudio.made[0];
    expect(a.resumed).toBeGreaterThan(0);
    expect(a.freqs.slice(0, 3).map(Math.round)).toEqual([523, 2093, 5233]);
    expect(Math.round(a.freqs[3])).toBe(784);
    expect(a.gains.every((g) => g <= VOLUME)).toBe(true);
    expect(VOLUME).toBeLessThanOrEqual(0.2);
  });
});
