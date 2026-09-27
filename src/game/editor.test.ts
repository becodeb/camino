import { describe, expect, it } from 'vitest';
// Ported from habilidades (editor.test.ts @ 9b90d1d), without the event log.
import {
  DIMS, appendSlot, cards, homeSlot, insertAt, layoutProgram, moveBlock, refusal, removeAt, resolveDrop, slotAt,
  type Block, type Slot,
} from './editor';
import { solves } from './engine';
import { LEVELS } from './levels';
import type { Program } from './model';

const cmd = (id: string): Block => ({ t: 'cmd', cmd: id });
const tape = (count: number | 'goal' = 2, body: string[] = []): Block => ({ t: 'loop', count, body });

/** Builds a program the way a child does: every block dragged in, in order. */
function build(program: Program): Program {
  let p: Program = [];
  program.forEach((it, i) => {
    p = insertAt(p, { at: i }, it.t === 'loop' ? tape(it.count) : it);
    if (it.t === 'loop') it.body.forEach((c, j) => { p = insertAt(p, { tape: i, at: j }, cmd(c)); });
  });
  return p;
}

describe('block editor model', () => {
  it('inserts at the start, between blocks and at the end', () => {
    let p: Program = [];
    p = insertAt(p, { at: 0 }, cmd('a'));
    p = insertAt(p, { at: 1 }, cmd('c'));
    p = insertAt(p, { at: 1 }, cmd('b'));
    p = insertAt(p, { at: 0 }, cmd('z'));
    expect(p).toEqual([cmd('z'), cmd('a'), cmd('b'), cmd('c')]);
  });

  it('nests cards in a C-block and refuses a C-block inside another', () => {
    let p: Program = [cmd('a'), tape(3)];
    p = insertAt(p, { tape: 1, at: 0 }, cmd('b'));
    p = insertAt(p, { tape: 1, at: 0 }, cmd('c'));
    p = insertAt(p, { tape: 1, at: 2 }, cmd('d'));
    expect(p).toEqual([cmd('a'), { t: 'loop', count: 3, body: ['c', 'b', 'd'] }]);
    expect(refusal(p, { tape: 1, at: 0 }, tape())).toBe('nested');
    expect(refusal(p, { tape: 0, at: 0 }, cmd('x'))).toBe('bad_slot');
    expect(() => insertAt(p, { tape: 1, at: 0 }, tape())).toThrow();
  });

  it('respects the card limit (a tape itself is not a card)', () => {
    const p: Program = [cmd('a'), tape(2, ['b'])];
    expect(cards(p)).toBe(2);
    expect(refusal(p, { at: 2 }, cmd('c'), { maxCards: 2 })).toBe('full');
    expect(refusal(p, { at: 2 }, tape(), { maxCards: 2 })).toBeNull();
    expect(refusal(p, { tape: 1, at: 1 }, cmd('c'), { maxCards: 3 })).toBeNull();
  });

  it('deletes a card, a card inside a tape, and a whole tape with its cards', () => {
    const p: Program = [cmd('a'), tape(2, ['b', 'c']), cmd('d')];
    expect(removeAt(p, { item: 0 }).program).toEqual([tape(2, ['b', 'c']), cmd('d')]);
    expect(removeAt(p, { item: 1, inner: 0 })).toEqual({ program: [cmd('a'), tape(2, ['c']), cmd('d')], block: cmd('b') });
    expect(removeAt(p, { item: 1 })).toEqual({ program: [cmd('a'), cmd('d')], block: tape(2, ['b', 'c']) });
    expect(p).toEqual([cmd('a'), tape(2, ['b', 'c']), cmd('d')]); // never mutated
  });

  it('reorders: take it out, put it in the gap of what is left', () => {
    const p: Program = [cmd('a'), cmd('b'), cmd('c'), tape(2, ['d'])];
    expect(moveBlock(p, { item: 0 }, { at: 2 })).toEqual([cmd('b'), cmd('c'), cmd('a'), tape(2, ['d'])]);
    expect(moveBlock(p, { item: 2 }, { at: 0 })).toEqual([cmd('c'), cmd('a'), cmd('b'), tape(2, ['d'])]);
    // into a tape, out of a tape, inside a tape
    expect(moveBlock(p, { item: 1 }, { tape: 2, at: 1 })).toEqual([cmd('a'), cmd('c'), tape(2, ['d', 'b'])]);
    expect(moveBlock(p, { item: 3, inner: 0 }, { at: 0 })).toEqual([cmd('d'), cmd('a'), cmd('b'), cmd('c'), tape(2, [])]);
    const q: Program = [tape(2, ['x', 'y', 'z'])];
    expect(moveBlock(q, { item: 0, inner: 2 }, { tape: 0, at: 0 })).toEqual([tape(2, ['z', 'x', 'y'])]);
    // a tape moves with its cards, and never into itself or another tape
    expect(moveBlock(p, { item: 3 }, { at: 0 })).toEqual([tape(2, ['d']), cmd('a'), cmd('b'), cmd('c')]);
    expect(moveBlock([tape(2, ['a']), tape(3, ['b'])], { item: 0 }, { tape: 0, at: 0 })).toBeNull();
  });

  it('the home slot of a block gives back the same program', () => {
    const p: Program = [cmd('a'), tape(2, ['b', 'c']), cmd('d')];
    for (const ref of [{ item: 0 }, { item: 1 }, { item: 2 }, { item: 1, inner: 0 }, { item: 1, inner: 1 }]) {
      expect(moveBlock(p, ref, homeSlot(ref))).toEqual(p);
    }
  });

  it('a tap appends to the end, or to the end of the active tape', () => {
    const p: Program = [cmd('a'), tape(2, ['b'])];
    expect(appendSlot(p, null, cmd('c'))).toEqual({ at: 2 });
    expect(appendSlot(p, 1, cmd('c'))).toEqual({ tape: 1, at: 1 });
    expect(appendSlot(p, 1, tape())).toEqual({ at: 2 });
    expect(appendSlot(p, 0, cmd('c'))).toEqual({ at: 2 });
  });

  it('building every level reference program block by block gives exactly that program', () => {
    for (const level of LEVELS.filter((l) => l.mode !== 'realtime')) {
      const built = build(level.solution);
      expect(JSON.stringify(built)).toBe(JSON.stringify(level.solution));
      for (const b of level.worlds) expect(solves(b, built)).toBe(true);
    }
  });
});

describe('block editor layout and hit testing', () => {
  const p: Program = [cmd('a'), tape(3, ['b', 'c']), cmd('a')];

  it('stacks blocks under the start block, cards indented inside the tape', () => {
    const L = layoutProgram(p, { endSlot: true });
    const kinds = L.items.map((i) => i.kind);
    expect(kinds).toEqual(['start', 'cmd', 'loop', 'cmd', 'cmd', 'cmd', 'slot']);
    const [start, a, loop, b, c, a2, end] = L.items;
    expect(a.y).toBe(start.h);
    expect(loop.y).toBe(a.y + DIMS.h);
    expect(b.x).toBe(DIMS.spine);
    expect(b.y).toBe(loop.y + DIMS.arm);
    expect(loop.h).toBe(DIMS.arm + 2 * DIMS.h + DIMS.foot);
    expect(a2.y).toBe(loop.y + loop.h);
    expect(end.slot).toEqual({ at: 3 });
    expect(L.height).toBe(end.y + end.h);
    // equal blocks get distinct keys
    expect(new Set(L.items.map((i) => i.key)).size).toBe(L.items.length);
    expect(c.ref).toEqual({ item: 1, inner: 1 });
  });

  it('an empty tape shows a slot in its mouth; a gap opens where the drag points', () => {
    const L = layoutProgram([tape(2)], {});
    expect(L.items.map((i) => i.kind)).toEqual(['start', 'loop', 'slot']);
    const G = layoutProgram(p, { gap: { at: 1 }, gapBlock: cmd('x') });
    const gap = G.items.find((i) => i.kind === 'gap')!;
    expect(gap.y).toBe(DIMS.start + DIMS.h);
    expect(G.items.find((i) => i.kind === 'loop')!.y).toBe(gap.y + DIMS.h);
    const inner = layoutProgram(p, { gap: { tape: 1, at: 2 }, gapBlock: cmd('x') });
    expect(inner.items.find((i) => i.kind === 'loop')!.mouth).toBe(3 * DIMS.h);
  });

  it('maps a pointer height to the gap it falls into', () => {
    const L = layoutProgram(p);
    const [, a, loop, b, c, a2] = L.items;
    expect(slotAt(L, a.y + 5, cmd('x'))).toEqual({ at: 0 });
    expect(slotAt(L, a.y + a.h - 5, cmd('x'))).toEqual({ at: 1 });
    expect(slotAt(L, loop.y + 5, cmd('x'))).toEqual({ at: 1 });
    expect(slotAt(L, b.y + 5, cmd('x'))).toEqual({ tape: 1, at: 0 });
    expect(slotAt(L, c.y + 5, cmd('x'))).toEqual({ tape: 1, at: 1 });
    expect(slotAt(L, c.y + c.h - 5, cmd('x'))).toEqual({ tape: 1, at: 2 });
    expect(slotAt(L, loop.y + loop.h - 3, cmd('x'))).toEqual({ at: 2 });
    expect(slotAt(L, a2.y + a2.h + 40, cmd('x'))).toEqual({ at: 3 });
    // a tape over a tape's mouth stays at the top level: before or after it
    expect(slotAt(L, b.y + 5, tape())).toEqual({ at: 1 });
    expect(slotAt(L, c.y + c.h - 5, tape())).toEqual({ at: 2 });
  });
});

describe('the notebook lines', () => {
  it('draws exactly the free lines left, and a drag gap takes one of them', () => {
    const L = layoutProgram([cmd('a')], { emptySlots: 2 });
    expect(L.items.map((i) => i.kind)).toEqual(['start', 'cmd', 'slot', 'slot']);
    expect(L.items.filter((i) => i.kind === 'slot').every((i) => i.slot!.at === 1)).toBe(true);
    expect(L.items[2].active).toBe(true);
    const G = layoutProgram([cmd('a')], { emptySlots: 2, gap: { at: 1 }, gapBlock: cmd('x') });
    expect(G.items.map((i) => i.kind)).toEqual(['start', 'cmd', 'gap', 'slot']);
    expect(G.height).toBe(L.height);
  });
});

describe('drops', () => {
  it('palette → program adds; palette → nowhere cancels; a full program rejects', () => {
    const r = resolveDrop([cmd('a')], { from: 'palette', block: cmd('b') }, { at: 0 });
    expect(r).toEqual({ program: [cmd('b'), cmd('a')], outcome: 'add' });
    expect(resolveDrop([], { from: 'palette', block: cmd('a') }, null)).toEqual({ program: null, outcome: 'cancel' });
    const full = resolveDrop([cmd('a')], { from: 'palette', block: cmd('b') }, { at: 1 }, { maxCards: 1 });
    expect(full).toMatchObject({ outcome: 'rejected', reason: 'full' });
  });

  it('a card into a tape; program → program reorders; program → outside deletes', () => {
    const r = resolveDrop([tape(2)], { from: 'palette', block: cmd('a') }, { tape: 0, at: 0 });
    expect(r.program).toEqual([tape(2, ['a'])]);
    const p: Program = [cmd('a'), cmd('b'), tape(2, ['c'])];
    const mv = resolveDrop(p, { from: 'program', ref: { item: 0 }, block: cmd('a') }, { tape: 1, at: 1 });
    expect(mv).toEqual({ program: [cmd('b'), tape(2, ['c', 'a'])], outcome: 'move' });
    const del = resolveDrop(p, { from: 'program', ref: { item: 2, inner: 0 }, block: cmd('c') }, null);
    expect(del).toEqual({ program: [cmd('a'), cmd('b'), tape(2, [])], outcome: 'remove' });
    expect(resolveDrop(p, { from: 'program', ref: { item: 1 }, block: cmd('b') }, { at: 1 }).outcome).toBe('noop');
    const nested = resolveDrop(p, { from: 'program', ref: { item: 2 }, block: tape(2, ['c']) }, { tape: 0, at: 0 } as Slot);
    expect(nested.outcome).toBe('rejected');
  });
});
