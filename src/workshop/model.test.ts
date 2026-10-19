import { describe, expect, it } from 'vitest';
import { labelText, tokens } from './blocks';
import {
  applyDrop, approxMeasure, boundsOf, cloneBlock, copyName, copyStackTo, countBlocks, deleteFrom, duplicateFrom, duplicateSprite, findBlock, findDrop,
  layoutBlock, layoutStack, make, pickUp, setInput, stackOf, targetsOf, tidy, type Block, type Stack,
} from './model';
import type { Project, Sprite } from './model';

const SPRITE_IDS = { stage: 'stage', player: 'player', floor: 'floor', log: 'log' } as const;
const runner = () => [make('flag'), make('goto', { X: 240, Y: -100 }), make('forever', {}, [[make('changeX', { DX: -6 })]])];
const sp = (id: string, name: string, kind: Sprite['kind'], blocks: Block[][] = []): Sprite => ({ id, name, kind, x: 0, y: 0, dir: 90, visible: true, costume: 'x', stacks: blocks.map((b) => stackOf(30, 30, b)) });
const newProject = (): Project => ({
  v: 1, vars: { puntos: 0, vidas: 3, velocidad: 6, poder: 0 },
  sprites: [sp('stage', 'Escenario', 'stage'), sp('player', 'Personaje', 'player'), sp('floor', 'Suelo', 'floor'), sp('log', 'Tronco', 'obstacle', [runner()])],
});

const ctx = { measure: approxMeasure };
const lfor0 = (stacks: readonly Stack[]) => layoutStack(stacks[0], ctx).items[2].block.id;
const ops = (blocks: readonly Block[]): unknown[] => blocks.map((b) => (b.subs ? [b.op, b.subs.map(ops)] : b.op));
const shape = (stacks: readonly Stack[]) => stacks.map((s) => ops(s.blocks));
/** The top-left of a block, as laid out. */
function posOf(stacks: readonly Stack[], id: string) {
  for (const st of stacks) {
    const walk = (items: ReturnType<typeof layoutStack>['items']): { x: number; y: number } | null => {
      for (const l of items) {
        if (l.block.id === id) return { x: l.x, y: l.y };
        for (const p of l.parts) if (p.child) { const r = walk([p.child]); if (r) return r; }
        for (const m of l.mouths) { const r = walk(m.items); if (r) return r; }
      }
      return null;
    };
    const r = walk(layoutStack(st, ctx).items);
    if (r) return r;
  }
  throw new Error(`no ${id}`);
}

/** flag → goto → forever { changeX ; if (x < -240) { goto } } at (100, 100), and a loose say at (500, 400). */
function scene() {
  const goto2 = make('goto', { X: 240, Y: -100 });
  const iff = make('if', { COND: make('lt', { A: make('xpos'), B: -240 }) }, [[goto2]]);
  const step = make('changeX', { DX: -6 });
  const forever = make('forever', {}, [[step, iff]]);
  const goto1 = make('goto', { X: 240, Y: -100 });
  const flag = make('flag');
  const say = make('say');
  const stacks = [stackOf(100, 100, [flag, goto1, forever]), stackOf(500, 400, [say])];
  return { stacks, flag, goto1, forever, step, iff, goto2, say };
}

describe('blocks', () => {
  it('splits a label into words, icons and inputs, in Scratch 3 Spanish', () => {
    expect(tokens('ir a x: %X y: %Y')).toEqual([{ t: 'text', s: 'ir a x:' }, { t: 'input', name: 'X' }, { t: 'text', s: 'y:' }, { t: 'input', name: 'Y' }]);
    expect(tokens('al hacer clic en @flag')).toEqual([{ t: 'text', s: 'al hacer clic en' }, { t: 'icon', s: 'flag' }]);
    expect(labelText('repeat')).toBe('repetir [10]');
    expect(labelText('key')).toBe('al presionar tecla [espacio]');
    expect(labelText('setVar', { VAR: 'vidas', V: '3' })).toBe('fijar [vidas] a [3]');
    expect(labelText('var', { VAR: 'velocidad' })).toBe('velocidad');
  });
});

describe('layout', () => {
  it('stacks blocks one under the other, a hat taller, a C-block around its mouth', () => {
    const { stacks, flag, goto1, forever, step } = scene();
    expect(lfor0(stacks)).toBe(forever.id);
    const l = layoutStack(stacks[0], ctx);
    const [lf, lg, lfor] = l.items;
    expect(lf.block).toBe(flag);
    expect(lg.y).toBe(lf.y + lf.h);
    expect(lfor.y).toBe(lg.y + lg.h);
    expect(lf.h).toBeGreaterThan(lg.h);
    expect(lfor.mouths[0].items[0].block).toBe(step);
    expect(lfor.mouths[0].items[0].x).toBe(lfor.x + 16);
    expect(lfor.h).toBeGreaterThan(lfor.mouths[0].h);
    expect(goto1.id).toBeTruthy();
  });
  it('makes a reporter in a slot as wide as it needs, and an empty boolean slot hexagonal-sized', () => {
    const empty = layoutBlock(make('if'), ctx);
    const full = layoutBlock(make('if', { COND: make('lt', { A: make('ypos'), B: 0 }) }), ctx);
    expect(full.w).toBeGreaterThan(empty.w);
    const slot = full.parts.find((p) => p.input === 'COND')!;
    expect(slot.kind).toBe('block');
    expect(slot.child!.parts.find((p) => p.input === 'A')!.child!.block.op).toBe('ypos');
  });
  it('lays out an if/else with two mouths and its "si no" row', () => {
    const l = layoutBlock(make('ifElse', {}, [[make('setY', { Y: 100 })], [make('setY', { Y: -100 })]]), ctx);
    expect(l.mouths).toHaveLength(2);
    expect(l.elseY).toBeGreaterThan(l.mouths[0].y);
    expect(l.mouths[1].y).toBeGreaterThan(l.elseY!);
    expect(l.elseParts![0].text).toBe('si no');
  });
});

describe('picking up', () => {
  it('takes the whole stack by its top block (the hat)', () => {
    const { stacks, flag } = scene();
    const p = pickUp(stacks, flag.id, ctx)!;
    expect(p.from).toBe('stack');
    expect(ops(p.dragged)).toEqual(['flag', 'goto', ['forever', [['changeX', ['if', [['goto']]]]]]]);
    expect(p.stacks).toHaveLength(1);
    expect(p.at).toEqual({ x: 100, y: 100 });
    expect(stacks).toHaveLength(2); // pure
  });
  it('takes a block from the middle with everything below it', () => {
    const { stacks, goto1 } = scene();
    const at = posOf(stacks, goto1.id);
    const p = pickUp(stacks, goto1.id, ctx)!;
    expect(p.from).toBe('middle');
    expect(ops(p.dragged)).toEqual(['goto', ['forever', [['changeX', ['if', [['goto']]]]]]]);
    expect(shape(p.stacks)).toEqual([['flag'], ['say']]);
    expect(p.at).toEqual(at);
  });
  it('takes a block out of a C-block mouth with what follows it inside', () => {
    const { stacks, step } = scene();
    const p = pickUp(stacks, step.id, ctx)!;
    expect(ops(p.dragged)).toEqual(['changeX', ['if', [['goto']]]]);
    expect(shape(p.stacks)[0]).toEqual(['flag', 'goto', ['forever', [[]]]]);
  });
  it('takes a reporter out of its slot, alone, leaving the slot empty', () => {
    const { stacks, iff } = scene();
    const lt = iff.in.COND.r!;
    const p = pickUp(stacks, lt.id, ctx)!;
    expect(p.from).toBe('slot');
    expect(p.dragged[0].op).toBe('lt');
    expect(findBlock(p.stacks, iff.id)!.block.in.COND.r).toBeUndefined();
  });
});

describe('dropping', () => {
  it('appends a block below a stack\'s last block when dropped near its bottom', () => {
    const { stacks, say } = scene();
    const sayAt = posOf(stacks, say.id);
    const show = [make('show')];
    const t = findDrop(stacks, show, { x: sayAt.x + 6, y: sayAt.y + 46 + 10 }, ctx);
    expect(t).toMatchObject({ kind: 'after', id: say.id });
    expect(shape(applyDrop(stacks, show, t, { x: 0, y: 0 }, ctx))[1]).toEqual(['say', 'show']);
  });
  it('inserts a block after a block in the middle (what was below goes below it)', () => {
    const { stacks, flag } = scene();
    const fa = posOf(stacks, flag.id);
    const blk = [make('show')];
    const t = findDrop(stacks, blk, { x: fa.x + 4, y: fa.y + layoutBlock(flag, ctx).h + 4 }, ctx);
    expect(t).toMatchObject({ kind: 'after', id: flag.id, last: false });
    expect(shape(applyDrop(stacks, blk, t, { x: 0, y: 0 }, ctx))[0]).toEqual(['flag', 'show', 'goto', ['forever', [['changeX', ['if', [['goto']]]]]]]);
  });
  it('drops into a C-block mouth, at its top', () => {
    const { stacks, forever } = scene();
    const l = layoutStack(stacks[0], ctx).items[2];
    const blk = [make('hide')];
    const t = findDrop(stacks, blk, { x: l.mouths[0].x + 3, y: l.mouths[0].y - 3 }, ctx);
    expect(t).toMatchObject({ kind: 'mouth', id: forever.id, m: 0 });
    expect(shape(applyDrop(stacks, blk, t, { x: 0, y: 0 }, ctx))[0]).toEqual(['flag', 'goto', ['forever', [['hide', 'changeX', ['if', [['goto']]]]]]]);
  });
  it('drops into the second mouth of an if/else', () => {
    const ie = make('ifElse', {}, [[make('setY', { Y: 100 })], []]);
    const stacks = [stackOf(0, 0, [make('key'), ie])];
    const l = layoutStack(stacks[0], ctx).items[1];
    const blk = [make('setY', { Y: -100 })];
    const t = findDrop(stacks, blk, { x: l.mouths[1].x, y: l.mouths[1].y }, ctx);
    expect(t).toMatchObject({ kind: 'mouth', id: ie.id, m: 1, empty: true });
    const out = applyDrop(stacks, blk, t, { x: 0, y: 0 }, ctx);
    expect(shape(out)[0]).toEqual(['key', ['ifElse', [['setY'], ['setY']]]]);
  });
  it('prepends onto a hat-less stack: the dropped blocks\' bottom meets its top, and the stack stays put', () => {
    const { stacks, say } = scene();
    const blk = [make('flag'), make('show')];
    const h = layoutStack(stackOf(0, 0, blk), ctx).h;
    const t = findDrop(stacks, blk, { x: 500, y: 400 - h + 5 }, ctx);
    expect(t).toMatchObject({ kind: 'before', stack: stacks[1].id });
    const out = applyDrop(stacks, blk, t, { x: 0, y: 0 }, ctx);
    expect(shape(out)[1]).toEqual(['flag', 'show', 'say']);
    expect(posOf(out, say.id)).toEqual(posOf(stacks, say.id));
  });
  it('never snaps a hat below a block, nor onto a stack that already has a hat', () => {
    const { stacks, flag } = scene();
    const fa = posOf(stacks, flag.id);
    const hat = [make('key')];
    expect(findDrop(stacks, hat, { x: fa.x, y: fa.y + 60 }, ctx)).toBeNull();
    const h = layoutStack(stackOf(0, 0, hat), ctx).h;
    expect(findDrop(stacks, hat, { x: 100, y: 100 - h }, ctx)).toBeNull();
  });
  it('a cap block (detener todo) only goes at the end of a list', () => {
    const { stacks, flag, say } = scene();
    const fa = posOf(stacks, flag.id);
    const stop = [make('stop')];
    expect(findDrop(stacks, stop, { x: fa.x, y: fa.y + layoutBlock(flag, ctx).h }, ctx)).toBeNull();
    const sa = posOf(stacks, say.id);
    expect(findDrop(stacks, stop, { x: sa.x, y: sa.y + 46 }, ctx)).toMatchObject({ kind: 'after', id: say.id });
  });
  it('an empty C-block dropped in the middle wraps what was below it (Scratch 3)', () => {
    const { stacks, flag } = scene();
    const fa = posOf(stacks, flag.id);
    const rep = [make('repeat', { N: 3 })];
    const t = findDrop(stacks, rep, { x: fa.x, y: fa.y + layoutBlock(flag, ctx).h }, ctx);
    expect(t).toMatchObject({ kind: 'after', id: flag.id });
    expect(shape(applyDrop(stacks, rep, t, { x: 0, y: 0 }, ctx))[0]).toEqual(['flag', ['repeat', [['goto', ['forever', [['changeX', ['if', [['goto']]]]]]]]]]);
    // a forever (a cap) may wrap too
    const fe = [make('forever')];
    const t2 = findDrop(stacks, fe, { x: fa.x, y: fa.y + layoutBlock(flag, ctx).h }, ctx);
    expect(t2).toMatchObject({ kind: 'after', id: flag.id });
  });
  it('drops a reporter into a round slot, and a boolean only into a hexagonal one', () => {
    const { stacks, step, iff } = scene();
    const l = layoutStack(stacks[0], ctx);
    const dxSlot = [...l.items[2].mouths[0].items[0].parts].find((p) => p.input === 'DX')!;
    const v = [make('var', { VAR: 'velocidad' })];
    const t = findDrop(stacks, v, { x: dxSlot.x + 2, y: dxSlot.y + dxSlot.h / 2 - 16 }, ctx);
    expect(t).toMatchObject({ kind: 'slot', id: step.id, name: 'DX', accepts: 'reporter' });
    const out = applyDrop(stacks, v, t, { x: 0, y: 0 }, ctx);
    expect(findBlock(out, step.id)!.block.in.DX.r!.op).toBe('var');
    expect(findBlock(out, step.id)!.block.in.DX.v).toBe('-6'); // the literal stays under it, like Scratch
    // a boolean never goes into a number slot
    expect(findDrop(stacks, [make('touching')], { x: dxSlot.x + 2, y: dxSlot.y + dxSlot.h / 2 - 16 }, ctx)?.kind).not.toBe('slot');
    // a reporter replacing another pops the old one out, loose
    const condAt = l.items[2].mouths[0].items[1].parts.find((p) => p.input === 'COND')!;
    const t2 = findDrop(stacks, [make('touching')], { x: condAt.x, y: condAt.y + condAt.h / 2 - 16 }, ctx);
    expect(t2).toMatchObject({ kind: 'slot', id: iff.id, name: 'COND', accepts: 'boolean', filled: true });
    const out2 = applyDrop(stacks, [make('touching')], t2, { x: 0, y: 0 }, ctx);
    expect(findBlock(out2, iff.id)!.block.in.COND.r!.op).toBe('touching');
    expect(out2).toHaveLength(3);
    expect(out2[2].blocks[0].op).toBe('lt');
  });
  it('lands loose when nothing is near, as a new stack where it was let go', () => {
    const { stacks } = scene();
    const blk = [make('show'), make('hide')];
    expect(findDrop(stacks, blk, { x: 900, y: 50 }, ctx)).toBeNull();
    const out = applyDrop(stacks, blk, null, { x: 900, y: 50 }, ctx);
    expect(out).toHaveLength(3);
    expect(out[2]).toMatchObject({ x: 900, y: 50 });
  });
  it('a picked-up stack dropped back where it was comes back the same', () => {
    const { stacks, goto1 } = scene();
    const p = pickUp(stacks, goto1.id, ctx)!;
    const t = findDrop(p.stacks, p.dragged, p.at, ctx);
    expect(shape(applyDrop(p.stacks, p.dragged, t, p.at, ctx))).toEqual(shape(stacks));
  });
  it('exposes a target under every block, in every mouth, above hat-less stacks and in every slot', () => {
    const { stacks } = scene();
    const ts = targetsOf(stacks, ctx);
    expect(ts.filter((t) => t.kind === 'after')).toHaveLength(6); // flag, goto, changeX, if, goto2 and say (forever is a cap)
    expect(ts.filter((t) => t.kind === 'mouth')).toHaveLength(2);
    expect(ts.filter((t) => t.kind === 'before')).toHaveLength(1);
    expect(ts.filter((t) => t.kind === 'slot').length).toBeGreaterThanOrEqual(7);
  });
});

describe('editing', () => {
  it('deletes what a drag onto the palette would take', () => {
    const { stacks, iff, goto1 } = scene();
    expect(shape(deleteFrom(stacks, iff.id, ctx))[0]).toEqual(['flag', 'goto', ['forever', [['changeX']]]]);
    expect(shape(deleteFrom(stacks, goto1.id, ctx))).toEqual([['flag'], ['say']]);
  });
  it('duplicates a block and everything below it, with new ids, beside it', () => {
    const { stacks, goto1 } = scene();
    const d = duplicateFrom(stacks, goto1.id, ctx)!;
    expect(d.stacks).toHaveLength(3);
    expect(ops(d.stack.blocks)).toEqual(['goto', ['forever', [['changeX', ['if', [['goto']]]]]]]);
    expect(d.stack.blocks[0].id).not.toBe(goto1.id);
    expect(countBlocks(d.stack.blocks)).toBe(7);
  });
  it('edits an input literal', () => {
    const { stacks, goto2 } = scene();
    const out = setInput(stacks, goto2.id, 'Y', '100');
    expect(findBlock(out, goto2.id)!.block.in.Y.v).toBe('100');
    expect(findBlock(stacks, goto2.id)!.block.in.Y.v).toBe('-100');
  });
  it('tidies the stacks into one column and knows their bounds', () => {
    const { stacks } = scene();
    const t = tidy(stacks, ctx);
    expect(t.every((s) => s.x === 24)).toBe(true);
    expect(t[1].y).toBeGreaterThan(t[0].y + layoutStack(t[0], ctx).h);
    const b = boundsOf(stacks, ctx)!;
    expect(b.x).toBe(100);
    expect(b.y).toBe(100);
    expect(b.y + b.h).toBeGreaterThan(400);
  });
  it('clones deep with new ids', () => {
    const { forever } = scene();
    const c = cloneBlock(forever);
    expect(c.id).not.toBe(forever.id);
    expect(c.subs![0][1].in.COND.r!.id).not.toBe(forever.subs![0][1].in.COND.r!.id);
  });
});

describe('sprites', () => {
  it('names copies like Scratch', () => {
    expect(copyName('Tronco', ['Tronco'])).toBe('Tronco2');
    expect(copyName('Tronco2', ['Tronco', 'Tronco2'])).toBe('Tronco3');
  });
  it('duplicates an obstacle with its scripts (new ids), right after it; never the player or the stage', () => {
    const p = newProject();
    const d = duplicateSprite(p, SPRITE_IDS.log)!;
    const i = d.project.sprites.findIndex((s) => s.id === SPRITE_IDS.log);
    expect(d.project.sprites[i + 1]).toBe(d.sprite);
    expect(d.sprite.name).toBe('Tronco2');
    expect(ops(d.sprite.stacks[0].blocks)).toEqual(ops(p.sprites[i].stacks[0].blocks));
    expect(d.sprite.stacks[0].blocks[0].id).not.toBe(p.sprites[i].stacks[0].blocks[0].id);
    expect(duplicateSprite(p, SPRITE_IDS.player)).toBeNull();
    expect(duplicateSprite(p, SPRITE_IDS.stage)).toBeNull();
  });
  it('copies a script onto another sprite, below its own scripts', () => {
    const p = newProject();
    const log = p.sprites.find((s) => s.id === SPRITE_IDS.log)!;
    const q = copyStackTo(p, SPRITE_IDS.floor, log.stacks[0].blocks, ctx);
    const floor = q.sprites.find((s) => s.id === SPRITE_IDS.floor)!;
    expect(floor.stacks).toHaveLength(1);
    expect(ops(floor.stacks[0].blocks)).toEqual(ops(log.stacks[0].blocks));
  });
});
