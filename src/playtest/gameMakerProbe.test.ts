import { describe, expect, it } from 'vitest';
import { menuFor } from './freePlay';
import { hasProbe } from './probes';
import {
  PHASE_FALLBACK_MS, PLAY_MS, newTrack, phaseCompleted, phaseReady, predictItems, trackEdit, trackRunEnd, trackRunStart,
} from './gameMakerProbe';

describe('the phases of "Hacé tu juego"', () => {
  it('phase 1 is done once a game was played with the arrows; the page turns after a game ends or a minute of play', () => {
    let t = newTrack(0);
    expect(phaseReady('play', t, 10_000)).toBe(false);
    t = trackRunStart(t, 1000);
    t = trackRunEnd(t, { keys: 0, result: 'stopped' });
    expect(phaseCompleted('play', t)).toBe(false);
    t = trackRunStart(t, 2000);
    t = trackRunEnd(t, { keys: 4, result: 'stopped' });
    expect(phaseCompleted('play', t)).toBe(true);
    expect(phaseReady('play', t, 20_000)).toBe(false);
    expect(phaseReady('play', t, 1000 + PLAY_MS)).toBe(true);
    const ended = trackRunEnd(trackRunStart(t, 3000), { keys: 2, result: 'lose' });
    expect(phaseReady('play', ended, 21_000)).toBe(true);
  });

  it('phases 2 and 3 are done after an edit and a game started after it', () => {
    let t = newTrack(0);
    t = trackRunStart(t, 100);
    t = trackRunEnd(t, { keys: 3, result: 'stopped' });
    t = trackEdit(t, 200);
    expect(phaseCompleted('change', t)).toBe(false);
    t = trackRunStart(t, 300);
    expect(t.runsAfterEdit).toBe(1);
    expect(phaseCompleted('change', t)).toBe(true);
    expect(phaseReady('make', t, 400)).toBe(true);
  });

  it('nobody gets stuck: every phase can move on after a while, not completed', () => {
    for (const phase of ['play', 'change', 'make'] as const) {
      const t = newTrack(0);
      expect(phaseReady(phase, t, PHASE_FALLBACK_MS[phase] - 1)).toBe(false);
      expect(phaseReady(phase, t, PHASE_FALLBACK_MS[phase])).toBe(true);
      expect(phaseCompleted(phase, t)).toBe(false);
    }
  });
});

describe('the prediction task', () => {
  it('has three fixed items, each with three answers and the right one at a different place', () => {
    const items = predictItems('Mina');
    expect(items.map((i) => i.id)).toEqual(['key', 'star', 'broadcast']);
    expect(items.map((i) => i.options.length)).toEqual([3, 3, 3]);
    expect(items.map((i) => i.options.indexOf(i.answer))).toEqual([1, 0, 2]);
    expect(predictItems('Mina')).toEqual(items);
  });

  it('names the character in the questions and in the scripts', () => {
    const items = predictItems('Ovillo');
    expect(items[1].say).toContain('Ovillo');
    expect(JSON.stringify(items[2].scripts)).toContain('¿tocando Ovillo?');
    expect(JSON.stringify(items)).not.toContain('Brote');
  });

  it('the broadcast item shows both sides: one sprite sends, another receives', () => {
    const b = predictItems('Mina')[2];
    const text = JSON.stringify(b.scripts);
    expect(b.scripts.map((s) => s.sprite)).toEqual(['stone', 'bird']);
    expect(text).toContain('enviar');
    expect(text).toContain('al recibir');
  });
});

describe('the probe on the menu', () => {
  it('is registered: its card shows on 4to\'s menu (not on 5to\'s, where the adult can open it)', () => {
    expect(hasProbe('game_maker')).toBe(true);
    expect(menuFor(4, hasProbe).map((a) => a.id)).toContain('game_maker');
    expect(menuFor(5, hasProbe).map((a) => a.id)).not.toContain('game_maker');
  });
});
