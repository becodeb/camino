import { describe, expect, it } from 'vitest';
import { simulate } from '../game/engine';
import { GESTURES, GHOST_AFTER_MS, MOVE_ON_MS, SHOW_MS, gestureHit, toolLevels } from './toolCheck';

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

  it('reads each gesture from the events the page logs: a tap or a drag both put the block in', () => {
    const drop = (success: boolean) => ({ phase: 'drop', success, from: 'palette' });
    // the first data showed {"via":"drag","done":false,"gesture":"tap"}: a drag answers a tap now, and a tap a drag
    expect(gestureHit('tap', 'tap_add', {})).toEqual({ hit: 'done', via: 'tap' });
    expect(gestureHit('tap', 'drag', drop(true))).toEqual({ hit: 'done', via: 'drag' });
    expect(gestureHit('drag', 'drag', drop(true))).toEqual({ hit: 'done', via: 'drag' });
    expect(gestureHit('drag', 'tap_add', {})).toEqual({ hit: 'done', via: 'tap' });
    expect(gestureHit('drag', 'drag', drop(false))).toEqual({ hit: 'try', via: 'drag' });
    expect(gestureHit('tap', 'drag', { phase: 'start' })).toBeNull();
    expect(gestureHit('play', 'run', { result: 'empty' })).toEqual({ hit: 'done' });
    expect(gestureHit('reset', 'reset', {})).toEqual({ hit: 'done' });
    expect(gestureHit('help', 'help', { step: 1 })).toEqual({ hit: 'done' });
    expect(gestureHit('help', 'run', {})).toBeNull();
  });

  it('asks the three gestures that make a program and only shows ↺ and ✋; short waits', () => {
    expect(GESTURES.filter((g) => g.asked).map((g) => g.id)).toEqual(['tap', 'play', 'drag']);
    expect(GESTURES.filter((g) => !g.asked).map((g) => g.ghost.do)).toEqual(['point', 'point']);
    expect(GHOST_AFTER_MS).toBeLessThanOrEqual(8_000);
    expect(MOVE_ON_MS).toBeLessThanOrEqual(15_000);
    // the whole check for a child who never touches anything stays near a minute
    expect(3 * MOVE_ON_MS + 2 * SHOW_MS).toBeLessThanOrEqual(60_000);
  });
});
