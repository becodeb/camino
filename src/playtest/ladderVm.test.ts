import { describe, expect, it } from 'vitest';
import { make, stackOf, type Project } from '../workshop/model';
import { checkVm, nearestSpot, predictEnd, scriptsText, VM_ITEMS, VM_VARIANT_ITEMS, vmItem, type VmItem } from './ladderVm';

const ALL: VmItem[] = [...VM_ITEMS, ...Object.values(VM_VARIANT_ITEMS)];
const edit = ALL.filter((i) => i.format !== 'predict');
const predict = ALL.filter((i) => i.format === 'predict');

/** Adds a script to a sprite. */
const add = (p: Project, id: string, blocks: ReturnType<typeof make>[]): Project => ({
  ...p, sprites: p.sprites.map((s) => (s.id === id ? { ...s, stacks: [...s.stacks, stackOf(30, 400, blocks)] } : s)),
});

describe('T39 rungs 13–18 on the Workshop blocks', () => {
  it('six rungs, 13 to 18, each with a second, different item of the same concept', () => {
    expect(VM_ITEMS.map((i) => i.rung)).toEqual([13, 14, 15, 16, 17, 18]);
    expect(VM_ITEMS.map((i) => i.concept)).toEqual(['events_predict', 'fix_rule', 'if_else', 'variables', 'broadcast', 'modify_make']);
    for (const i of VM_ITEMS) {
      const b = VM_VARIANT_ITEMS[i.rung];
      expect(b, `${i.id} has a second item`).toBeTruthy();
      expect(b.concept).toBe(i.concept);
      expect(b.format).toBe(i.format);
      expect(b.id).not.toBe(i.id);
      expect(scriptsText(b.project())).not.toBe(scriptsText(i.project()));
      expect(vmItem(i.id)).toBe(i);
      expect(vmItem(b.id)).toBe(b);
    }
  });

  it('every edit item fails as it opens and passes with its solution', () => {
    for (const i of edit) {
      const given = checkVm(i, i.project());
      expect(given.ok, `${i.id} given`).toBe(false);
      expect(given.why, `${i.id} names what it saw`).toBeTruthy();
      expect(checkVm(i, i.solve(i.project())), `${i.id} solved`).toEqual({ ok: true });
    }
  });

  it('every predict item has exactly one right spot, the run lands on it, and the others are wrong', () => {
    for (const i of predict) {
      const pr = i.predict!;
      const end = predictEnd(i);
      const right = nearestSpot(pr.spots, end);
      expect(Math.hypot(pr.spots[right].x - end.x, pr.spots[right].y - end.y), i.id).toBeLessThan(5);
      expect(checkVm(i, i.project(), right)).toEqual({ ok: true });
      pr.spots.forEach((_, k) => { if (k !== right) expect(checkVm(i, i.project(), k).ok, `${i.id} spot ${k}`).toBe(false); });
      expect(checkVm(i, i.project()).ok).toBe(false);
    }
  });

  it('13: one key twice, read both scripts (only the matching key in the first item; both scripts on one key in the second)', () => {
    const [a, b] = [VM_ITEMS[0], VM_VARIANT_ITEMS[13]];
    expect(predictEnd(a)).toEqual({ x: 50, y: -100 });
    expect(predictEnd(b)).toEqual({ x: -50, y: 100 });
  });

  it('14: pointing the rule at the wrong thing, or changing the wrong variable, is named', () => {
    const i = VM_ITEMS[1];
    expect(checkVm(i, i.project()).why).toMatch(/puntos no cambian/);
    const b = VM_VARIANT_ITEMS[14];
    expect(checkVm(b, b.project()).why).toMatch(/puntos no cambian/);
  });

  it('15: walking through the rock, or jumping before touching it, does not pass', () => {
    const i = VM_ITEMS[2];
    const p = i.project();
    // only the step under the hat: it walks through
    const walk = { ...p, sprites: p.sprites.map((s) => (s.id === 'player' ? { ...s, stacks: [stackOf(30, 30, [make('key', { KEY: 'flecha derecha' }), make('changeX', { DX: 25 })])] } : s)) };
    expect(checkVm(i, walk).why).toMatch(/adentro/);
    // the jump without the condition: up at once
    const jump = { ...p, sprites: p.sprites.map((s) => (s.id === 'player' ? { ...s, stacks: [stackOf(30, 30, [make('key', { KEY: 'flecha derecha' }), make('changeX', { DX: 25 }), make('setY', { Y: 100 })])] } : s)) };
    expect(checkVm(i, jump).ok).toBe(false);
    // the mouths swapped: it jumps at the first press and never touches
    const swapped = { ...p, sprites: p.sprites.map((s) => (s.id === 'player' ? { ...s, stacks: [stackOf(30, 30, [make('key', { KEY: 'flecha derecha' }), make('ifElse', { COND: make('touching', { OBJ: 'rock' }) }, [[make('changeX', { DX: 25 })], [make('setY', { Y: 100 })]])])] } : s)) };
    expect(checkVm(i, swapped).ok).toBe(false);
    // an `if` after the step (no else) is a correct solution too
    const ifOnly = { ...p, sprites: p.sprites.map((s) => (s.id === 'player' ? { ...s, stacks: [stackOf(30, 30, [make('key', { KEY: 'flecha derecha' }), make('changeX', { DX: 25 }), make('if', { COND: make('touching', { OBJ: 'rock' }) }, [[make('setY', { Y: 100 })]])])] } : s)) };
    expect(checkVm(i, ifOnly)).toEqual({ ok: true });
  });

  it('16: a change in the wrong place (every frame) is not one per seed', () => {
    const i = VM_ITEMS[3];
    const p = add(i.project(), 'stage', [make('flag'), make('forever', {}, [[make('changeVar', { VAR: 'puntos', V: 1 })]])]);
    expect(checkVm(i, p).ok).toBe(false);
  });

  it('17: points straight in the sender, without a message, do not pass; the receiver on any sprite does', () => {
    const i = VM_ITEMS[4];
    const solved = i.solve(i.project());
    expect(checkVm(i, solved).ok).toBe(true);
    const onPlayer = add(i.project(), 'player', [make('receive', { MSG: 'punto' }), make('changeVar', { VAR: 'puntos', V: 1 })]);
    expect(checkVm(i, onPlayer)).toEqual({ ok: true });
    const wrongMsg = add(i.project(), 'stage', [make('receive', { MSG: 'choque' }), make('changeVar', { VAR: 'puntos', V: 1 })]);
    expect(checkVm(i, wrongMsg).ok).toBe(false);
  });

  it('18: winning at once, or never, does not pass; `= 5` passes too', () => {
    const i = VM_ITEMS[5];
    expect(checkVm(i, add(i.project(), 'stage', [make('flag'), make('win')])).ok).toBe(false);
    const eq = add(i.project(), 'stage', [make('flag'), make('forever', {}, [[make('if', { COND: make('eq', { A: make('var', { VAR: 'puntos' }), B: 5 }) }, [[make('win')]])]])]);
    expect(checkVm(i, eq)).toEqual({ ok: true });
    const b = VM_VARIANT_ITEMS[18];
    expect(checkVm(b, add(b.project(), 'player', [make('flag'), make('lose')])).ok).toBe(false);
  });

  it('goals are kid-safe and not too long', () => {
    for (const i of ALL) {
      for (const t of [i.title, i.goal, i.hint]) expect(t, i.id).not.toMatch(/pp-|\d(ro|do)\b|rung|nivel|ladder/i);
      expect(i.goal.length, i.id).toBeLessThanOrEqual(150);
    }
  });
});
