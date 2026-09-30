import { describe, expect, it } from 'vitest';
import { simulate } from '../game/engine';
import { GESTURES, ends, gestureHit, toolLevels } from './toolCheck';

describe('the tool check', () => {
  it('asks five gestures in order: tap and ▶ on the first page; drag, ↺ and ✋ on the second', () => {
    expect(GESTURES.map((g) => `${g.id}@${g.page}`)).toEqual(['tap@0', 'play@0', 'drag@1', 'reset@1', 'help@1']);
    for (const g of GESTURES) expect(g.say.length).toBeGreaterThan(8);
  });

  it('builds two tiny pages that their solution wins, with only the arrow to bring', () => {
    const [a, b] = toolLevels();
    expect([a.id, b.id]).toEqual(['tool-1', 'tool-2']);
    for (const l of [a, b]) {
      expect(l.blocks).toEqual(['right']);
      expect(simulate(l.worlds[0], l.solution).outcome).toBe('win');
      expect(l.title).not.toMatch(/tool|\d/);
    }
    expect(a.slots).toBe(1);
    expect(b.slots).toBe(3);
    // each page opens saying its first gesture
    expect(a.say).toBe(GESTURES[0].say);
    expect(b.say).toBe(GESTURES[2].say);
  });

  it('reads each gesture from the events the page logs', () => {
    const drop = (success: boolean) => ({ phase: 'drop', success, from: 'palette' });
    expect(gestureHit('tap', 'tap_add', {})).toBe('done');
    expect(gestureHit('tap', 'drag', drop(true))).toBe('other');
    expect(gestureHit('tap', 'drag', { phase: 'start' })).toBeNull();
    expect(gestureHit('play', 'run', { result: 'empty' })).toBe('done');
    expect(gestureHit('drag', 'drag', drop(true))).toBe('done');
    expect(gestureHit('drag', 'drag', drop(false))).toBe('try');
    expect(gestureHit('drag', 'tap_add', {})).toBe('other');
    expect(gestureHit('reset', 'reset', {})).toBe('done');
    expect(gestureHit('help', 'help', { step: 1 })).toBe('done');
    expect(gestureHit('help', 'run', {})).toBeNull();
  });

  it('a drag answers a tap (the block is in), a tap does not answer a drag', () => {
    expect(ends('tap', 'other')).toBe(true);
    expect(ends('drag', 'other')).toBe(false);
    expect(ends('drag', 'try')).toBe(false);
    expect(ends('drag', 'done')).toBe(true);
  });
});
