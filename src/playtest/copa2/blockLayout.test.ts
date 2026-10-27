import { describe, expect, it } from 'vitest';
import { FULL, MINI, PAL, heightOf, layoutScript, condCells, pickSlot, pillRows, withoutGap, type Layout, type Placed } from './blockLayout';
import { programBuilder, type Program } from './program';
import { trackById } from './tracks';

const b = programBuilder('t');
const W = 344;

/** copa 5's gold-like program: repetir vueltas [ repetir 6 [ si recta y nitro [ turbo, nitro ] si no [ si charco [saltar] si no [avanzar] ] ] ] */
const deep = (): Program => ({
  main: [b.repeat('laps', [b.repeat(6, [b.iff(['straight_ahead', 'nitro_positive'], [b.turbo(), b.nitro()], [b.iff('puddle_ahead', [b.jump()], [b.forward()])])])])],
});

const lay = (blocks: Program['main'], extra = {}): Layout => layoutScript(blocks, { script: 'main', width: W, sensors: ['puddle_ahead', 'straight_ahead', 'nitro_positive'], ...extra });
const item = (l: Layout, id: string): Placed => l.items.find((x) => x.id === id)!;

describe('stacking blocks', () => {
  it('plain blocks stack with no gap, one height each', () => {
    const p = { main: [b.forward(), b.jump(), b.brake()] };
    const l = lay(p.main);
    const ys = l.items.filter((x) => x.kind === 'cmd').map((x) => x.y);
    expect(ys).toEqual([0, FULL.h, 2 * FULL.h]);
    expect(l.height).toBeGreaterThanOrEqual(3 * FULL.h);
  });

  it('an empty program is one hole and one slot at its middle', () => {
    const l = lay([]);
    expect(l.items.map((x) => x.kind)).toEqual(['hole']);
    expect(l.slots).toHaveLength(1);
    expect(l.slots[0].y).toBe(FULL.hole / 2);
  });

  it('the start block and the event hat push the list down', () => {
    expect(lay([b.forward()], { start: true }).items.find((x) => x.kind === 'cmd')!.y).toBe(FULL.start);
    expect(lay([b.forward()], { hatId: 'h', script: 'event' }).items.find((x) => x.kind === 'cmd')!.y).toBe(FULL.hat);
  });
});

describe('containers', () => {
  it('a repetir wraps its body: arm, the body indented by the spine, then the foot', () => {
    const rep = b.repeat(3, [b.forward(), b.jump()]);
    const l = lay([rep, b.brake()]);
    const r = item(l, rep.id);
    expect(r.arm).toBe(FULL.arm);
    expect(r.mouth).toBe(2 * FULL.h);
    expect(r.h).toBe(FULL.arm + 2 * FULL.h + FULL.foot);
    const inner = l.items.filter((x) => x.kind === 'cmd' && x.x > 0);
    expect(inner.map((x) => [x.x, x.y])).toEqual([[FULL.spine, FULL.arm], [FULL.spine, FULL.arm + FULL.h]]);
    expect(inner[0].w).toBe(W - FULL.spine - FULL.pad);
    // what comes next starts under the foot
    expect(l.items.find((x) => x.kind === 'cmd' && x.x === 0)!.y).toBe(r.h);
  });

  it('an empty container keeps a hole in its mouth', () => {
    const rep = b.repeat(2, []);
    const l = lay([rep]);
    expect(item(l, rep.id).mouth).toBe(FULL.hole);
    expect(l.items.some((x) => x.kind === 'hole' && x.x === FULL.spine)).toBe(true);
  });

  it('si / si no has two mouths and the else bar between them', () => {
    const iff = b.iff('puddle_ahead', [b.jump()], [b.forward(), b.forward()]);
    const l = lay([iff]);
    const x = item(l, iff.id);
    expect(x.mouth).toBe(FULL.h);
    expect(x.mouthB).toBe(2 * FULL.h);
    expect(x.h).toBe(x.arm! + FULL.h + FULL.elseH + 2 * FULL.h + FULL.foot);
    const kids = l.items.filter((k) => k.kind === 'cmd');
    expect(kids.map((k) => k.y)).toEqual([x.arm, x.arm! + FULL.h + FULL.elseH, x.arm! + 2 * FULL.h + FULL.elseH]);
  });

  it('copa 5 nests four levels and every block stays inside its parent', () => {
    const p = deep();
    const l = lay(p.main);
    const boxes = l.items.filter((x) => x.kind !== 'hole');
    for (const x of boxes) {
      expect(x.x).toBeGreaterThanOrEqual(0);
      expect(x.x + x.w).toBeLessThanOrEqual(W);
      expect(x.y + x.h).toBeLessThanOrEqual(l.height);
    }
    const nested = (id: string) => item(l, id);
    const outer = p.main[0] as Extract<Program['main'][number], { kind: 'repeat' }>;
    const inner = outer.body[0] as Extract<typeof outer, { kind: 'repeat' }>;
    expect(nested(inner.id).x).toBe(FULL.spine);
    expect(nested(inner.id).y + nested(inner.id).h).toBeLessThanOrEqual(nested(outer.id).y + nested(outer.id).h);
    const leaf = l.items.filter((x) => x.kind === 'cmd');
    expect(Math.min(...leaf.map((x) => x.w))).toBeGreaterThanOrEqual(200); // the innermost block still has room for its picture and word
  });

  it('copa 5 repeats get the vueltas row', () => {
    const rep = b.repeat(2, [b.forward()]);
    expect(item(lay([rep], { laps: true }), rep.id).arm).toBe(FULL.arm + FULL.lapsRow);
    expect(item(lay([rep]), rep.id).arm).toBe(FULL.arm);
  });

  it('the palette and the faded reference use their own, smaller sizes', () => {
    const rep = b.repeat(2, [b.forward()]);
    const pal = layoutScript([rep], { script: 'main', width: 118, metrics: PAL });
    const mini = layoutScript([rep], { script: 'main', width: 232, metrics: MINI });
    expect(item(pal, rep.id).h).toBe(PAL.arm + PAL.h + PAL.foot);
    expect(item(mini, rep.id).h).toBeLessThan(item(lay([rep]), rep.id).h);
  });
});

describe('the si block and its pills', () => {
  const ALL = ['puddle_ahead', 'straight_ahead', 'nitro_positive'] as const;

  it('an empty si shows the dashed condition hole; a full one only its pieces; one piece leaves room for a second by `y`', () => {
    expect(condCells(b.iff([], [], []), ALL)).toEqual(['slot']);
    expect(condCells(b.iff('puddle_ahead', [], []), ALL)).toEqual(['puddle_ahead', 'more']);
    expect(condCells(b.iff('puddle_ahead', [], []), ['puddle_ahead'])).toEqual(['puddle_ahead']); // the copa has nothing to join it with
    expect(condCells(b.iff(['straight_ahead', 'nitro_positive'], [], []), ALL)).toEqual(['straight_ahead', 'nitro_positive']);
  });

  it('cells wrap onto more rows when they do not fit, and the arm grows with the rows', () => {
    expect(pillRows(W, ['puddle_ahead']).length).toBe(1);
    expect(pillRows(W, ['puddle_ahead', 'straight_ahead', 'nitro_positive']).length).toBeGreaterThan(1);
    const iff = b.iff(['straight_ahead', 'nitro_positive'], [], []);
    const l = lay([iff]);
    const rows = item(l, iff.id).rows!;
    expect(item(l, iff.id).arm).toBeGreaterThanOrEqual(24 + rows.length * FULL.pill);
  });

  it('the empty hole is never wider than the arm, however deep the si is nested', () => {
    for (const w of [344, 310, 276, 242]) {
      for (const row of pillRows(w, ['slot'])) expect(row.length).toBeGreaterThan(0);
    }
    for (const w of [344, 310, 276, 242]) {
      for (const row of pillRows(w, ['puddle_ahead', 'straight_ahead', 'nitro_positive'])) expect(row.length).toBeGreaterThan(0);
    }
  });

  it('the palette si has no pills, only its arm', () => {
    const iff = b.iff([], [], []);
    const pal = layoutScript([iff], { script: 'main', width: 118, metrics: PAL });
    expect(item(pal, iff.id).rows).toEqual([]);
    expect(item(pal, iff.id).arm).toBe(PAL.arm);
  });
});

describe('slots and the drag preview', () => {
  const p = { main: [b.forward(), b.repeat(2, [b.jump()]), b.brake()] };

  it('records one slot per place a block can go, nested ones further right', () => {
    const l = lay(p.main);
    // main: 4 places; the repetir's body: 2
    expect(l.slots).toHaveLength(6);
    expect(l.slots.filter((s) => s.pos.path.length === 1).every((s) => s.x === FULL.spine)).toBe(true);
    expect(l.slots[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('a gap opens a hole of the dragged height and pushes what follows down', () => {
    const plain = lay(p.main);
    const gapped = lay(p.main, { gap: { pos: { script: 'main', path: [], index: 1 }, h: 56 } });
    expect(gapped.items.find((x) => x.kind === 'gap')).toMatchObject({ y: FULL.h, h: 56 });
    expect(gapped.height).toBe(plain.height + 56);
    expect(item(gapped, p.main[1].id).y).toBe(item(plain, p.main[1].id).y + 56);
  });

  it('a gap in an empty body takes the place of its hole', () => {
    const rep = b.repeat(2, []);
    const l = lay([rep], { gap: { pos: { script: 'main', path: [{ index: 0, branch: 'body' }], index: 0 }, h: 56 } });
    expect(l.items.some((x) => x.kind === 'hole')).toBe(false);
    expect(item(l, rep.id).mouth).toBe(56);
  });

  it('the insertion marker is a line of its own, only where the caret is', () => {
    const l = lay(p.main, { caret: { script: 'main', path: [], index: 3 } });
    expect(l.items.filter((x) => x.kind === 'caret')).toHaveLength(1);
    expect(lay(p.main).items.some((x) => x.kind === 'caret')).toBe(false);
  });

  it('heightOf: a container carries its body into the gap', () => {
    const rep = b.repeat(2, [b.forward(), b.forward()]);
    expect(heightOf(b.forward(), { width: W })).toBe(FULL.h);
    expect(heightOf(rep, { width: W })).toBe(FULL.arm + 2 * FULL.h + FULL.foot);
  });

  it('withoutGap maps a pointer seen over the gapped layout back to the plain one', () => {
    expect(withoutGap(30, 100, 56)).toBe(30);
    expect(withoutGap(120, 100, 56)).toBe(100);
    expect(withoutGap(200, 100, 56)).toBe(144);
  });
});

describe('pickSlot', () => {
  const p = { main: [b.forward(), b.repeat(2, [b.jump()]), b.brake()] };
  const l = lay(p.main);
  const rep = item(l, p.main[1].id);

  it('picks the line nearest in height', () => {
    expect(pickSlot(l.slots, 100, 4)!.pos).toMatchObject({ path: [], index: 0 });
    expect(pickSlot(l.slots, 100, FULL.h + 3)!.pos).toMatchObject({ path: [], index: 1 });
  });

  it('inside the repetir body when the pointer is past its spine, after the repetir when it is not', () => {
    const endOfBody = rep.y + rep.arm! + rep.mouth!;
    const inside = pickSlot(l.slots, FULL.spine + 30, endOfBody)!;
    expect(inside.pos.path).toHaveLength(1);
    expect(inside.pos.index).toBe(1);
    const after = pickSlot(l.slots, 4, endOfBody + FULL.foot)!;
    expect(after.pos.path).toHaveLength(0);
    expect(after.pos.index).toBe(2);
  });

  it('an empty container is a target in the middle of its hole', () => {
    const e = b.repeat(2, []);
    const le = lay([b.forward(), e]);
    const re = item(le, e.id);
    const hit = pickSlot(le.slots, FULL.spine + 20, re.y + re.arm! + FULL.hole / 2)!;
    expect(hit.pos.path).toEqual([{ index: 1, branch: 'body' }]);
  });

  it('nothing to pick from: null', () => {
    expect(pickSlot([], 0, 0)).toBeNull();
  });
});

describe('real tracks', () => {
  it('the gold program of every track lays out with no block outside the canvas or on top of a sibling', () => {
    for (const id of ['c1-a', 'c2-a', 'c3-a', 'c4-a', 'c5-a', 'c5-b']) {
      const track = trackById(id)!;
      const l = layoutScript(track.refs.gold.main, { script: 'main', width: W, sensors: ['puddle_ahead', 'straight_ahead', 'nitro_positive'], laps: id.startsWith('c5') });
      for (const x of l.items) { expect(x.x + x.w).toBeLessThanOrEqual(W); expect(x.h).toBeGreaterThan(0); }
      const tops = l.items.filter((x) => x.kind === 'cmd' && x.x === 0).map((x) => [x.y, x.y + x.h]);
      for (let i = 1; i < tops.length; i++) expect(tops[i][0]).toBeGreaterThanOrEqual(tops[i - 1][1]);
    }
  });
});
