import { describe, expect, it } from 'vitest';
import {
  allBlocks, checkProgram, findBlock, mapProgram, programBuilder, replaceBlock, slotCount, type Palette, type Program,
} from './program';

const PALETTE: Palette = { blocks: ['forward', 'up', 'down', 'jump', 'repeat'], sensors: [], event: false };
const FULL: Palette = { blocks: ['forward', 'up', 'down', 'jump', 'turbo', 'brake', 'wait', 'repeat', 'if', 'nitro'], sensors: ['puddle_ahead', 'straight_ahead', 'nitro_positive'], event: true };

describe('slotCount (the memory a program uses)', () => {
  it('every block counts 1, containers included', () => {
    const b = programBuilder('t');
    const p: Program = { main: [b.forward(), b.repeat(4, [b.forward(), b.jump(), b.up(), b.down()])] };
    expect(slotCount(p)).toBe(1 + 1 + 4);
  });

  it('a `si` counts 1 plus the blocks of both branches', () => {
    const b = programBuilder('t');
    const p: Program = { main: [b.repeat(12, [b.iff('puddle_ahead', [b.jump()], [b.forward()])])] };
    expect(slotCount(p)).toBe(4);
  });

  it('the event script counts its hat and its blocks', () => {
    const b = programBuilder('t');
    const p: Program = { main: [b.forward()], onLog: b.onLog([b.brake(), b.wait(1)]) };
    expect(slotCount(p)).toBe(1 + 1 + 2);
  });

  it('an empty program uses nothing', () => {
    expect(slotCount({ main: [] })).toBe(0);
  });
});

describe('ids and lookup', () => {
  it('the builder makes unique, stable ids in creation order', () => {
    const b = programBuilder('fox');
    const x = b.forward();
    const y = b.jump();
    expect(x.id).toBe('fox-1');
    expect(y.id).toBe('fox-2');
    const b2 = programBuilder('fox');
    expect(b2.forward().id).toBe('fox-1');
  });

  it('findBlock finds nested blocks and the event hat', () => {
    const b = programBuilder('t');
    const inner = b.jump();
    const hat = b.onLog([b.brake()]);
    const p: Program = { main: [b.repeat(3, [b.iff('puddle_ahead', [inner], [])])], onLog: hat };
    expect(findBlock(p, inner.id)).toBe(inner);
    expect(findBlock(p, hat.id)).toEqual({ kind: 'on_log', id: hat.id });
    expect(findBlock(p, 'nope')).toBeNull();
    expect(allBlocks(p).map((x) => x.kind)).toEqual(['repeat', 'if', 'jump', 'brake']);
  });
});

describe('editing is pure', () => {
  it('replaceBlock swaps one block anywhere and leaves the original program alone', () => {
    const b = programBuilder('t');
    const bug = b.up();
    const p: Program = { main: [b.forward(), b.repeat(2, [bug])] };
    const fixed = replaceBlock(p, bug.id, { id: bug.id, kind: 'forward' });
    expect(allBlocks(fixed).map((x) => x.kind)).toEqual(['forward', 'repeat', 'forward']);
    expect(allBlocks(p).map((x) => x.kind)).toEqual(['forward', 'repeat', 'up']);
  });

  it('mapProgram can drop and splice blocks, event script included', () => {
    const b = programBuilder('t');
    const p: Program = { main: [b.forward(), b.jump()], onLog: b.onLog([b.brake(), b.wait(1)]) };
    const q = mapProgram(p, (x) => (x.kind === 'jump' ? null : x.kind === 'brake' ? [x, b.brake()] : x));
    expect(q.main.map((x) => x.kind)).toEqual(['forward']);
    expect(q.onLog?.body.map((x) => x.kind)).toEqual(['brake', 'brake', 'wait']);
  });
});

describe('checkProgram', () => {
  const rules = { palette: PALETTE, slots: 6 };

  it('a program inside the palette and the memory has no problems', () => {
    const b = programBuilder('t');
    expect(checkProgram({ main: [b.repeat(4, [b.forward(), b.up()])] }, rules)).toEqual([]);
  });

  it('too many blocks', () => {
    const b = programBuilder('t');
    const p: Program = { main: Array.from({ length: 7 }, () => b.forward()) };
    expect(checkProgram(p, rules).map((x) => x.code)).toEqual(['too_many_blocks']);
  });

  it('blocks, sensors and the event script outside the palette', () => {
    const b = programBuilder('t');
    const p: Program = { main: [b.turbo(), b.iff('puddle_ahead', [], [])], onLog: b.onLog([]) };
    const codes = checkProgram(p, rules).map((x) => x.code);
    expect(codes).toContain('block_not_available');
    expect(codes).toContain('sensor_not_available');
    expect(codes).toContain('event_not_available');
    expect(checkProgram({ main: [b.turbo(), b.iff(['puddle_ahead', 'nitro_positive'], [b.nitro()], [])], onLog: b.onLog([b.brake()]) }, { palette: FULL, slots: 9 })).toEqual([]);
  });

  it('duplicate ids, bad numbers and an empty condition', () => {
    const dup = { id: 'x', kind: 'forward' as const };
    const p: Program = { main: [dup, { ...dup }, { id: 'r', kind: 'repeat', n: 0, body: [] }, { id: 'w', kind: 'wait', n: 99 }, { id: 'i', kind: 'if', cond: [], then: [], else: [] }] };
    const codes = checkProgram(p, { palette: FULL, slots: 99 }).map((x) => x.code).sort();
    expect(codes).toEqual(['bad_number', 'bad_number', 'duplicate_id', 'empty_condition']);
  });

  it('`repetir vueltas` is a valid count', () => {
    const b = programBuilder('t');
    expect(checkProgram({ main: [b.repeat('laps', [b.forward()])] }, { palette: FULL, slots: 9 })).toEqual([]);
  });
});
