import { describe, expect, it } from 'vitest';
import { GOLD_SAY, NO_GOAL, differences, endOf, formatOf, goldLevel, hasFixedLines, pinsOf, sameShape, startProgram } from './formats';
import { solves } from './engine';
import type { LevelDef } from './levels';
import { HOLE, cmdProgram, type Board, type Program } from './model';

const board = (over: Partial<Board> = {}): Board => ({
  cols: 6, rows: 3, start: { c: 0, r: 1 }, goal: { c: 5, r: 1 }, goalKind: 'seed',
  obstacles: [], pickups: [], deco: [], seed: 1, ...over,
});
const page = (over: Partial<LevelDef>): LevelDef => ({
  id: 'x', grade: '1ro', page: 1, title: 't', say: 's', mode: 'program', worlds: [board()],
  blocks: ['right', 'up', 'repeat'], blockLabel: 'picture-word', slots: 2, solution: [], ...over,
});
const loop = (count: number, body: string[]): Program[number] => ({ t: 'loop', count, body });

describe('formats', () => {
  it('a page without a format is a plain one; complete and fix pages keep their lines in place', () => {
    expect(formatOf(page({}))).toBe('solve');
    expect(hasFixedLines(page({ format: 'complete' }))).toBe(true);
    expect(hasFixedLines(page({ format: 'fix' }))).toBe(true);
    expect(hasFixedLines(page({ format: 'predict' }))).toBe(false);
  });

  it('the notebook starts empty, or with its given program (a copy: ↺ gets it back untouched)', () => {
    const given: Program = [loop(0, ['right'])];
    expect(startProgram(page({ given }))).toEqual([]);
    const p = page({ format: 'complete', given });
    const start = startProgram(p);
    expect(start).toEqual(given);
    expect(start).not.toBe(given);
    (start[0] as { count: number }).count = 5;
    expect(startProgram(p)).toEqual(given);
  });

  it('a complete page pins what is written: cards and counts, never the empty lines or a missing count', () => {
    const given: Program = [{ t: 'cmd', cmd: 'up' }, loop(0, ['right', HOLE]), loop(3, [HOLE]), { t: 'cmd', cmd: HOLE }];
    const pins = pinsOf(page({ format: 'complete', given }));
    expect([...pins.cards].sort()).toEqual(['0', '1:0']);
    expect([...pins.counts]).toEqual([2]);
    expect([...pins.tapes]).toEqual([1, 2]);
    const fix = pinsOf(page({ format: 'fix', given: cmdProgram(['up']) }));
    expect(fix.cards.size + fix.counts.size + fix.tapes.size).toBe(0);
  });

  it('a fix page differs from its reference in one line or one count; an extra card becomes an empty line', () => {
    const given: Program = [loop(4, ['right', 'up', 'right'])];
    const fixed: Program = [loop(4, ['right', 'up', HOLE])];
    expect(sameShape(given, fixed)).toBe(true);
    expect(differences(given, fixed)).toEqual([{ kind: 'line', ref: { item: 0, inner: 2 }, from: 'right', to: HOLE }]);
    expect(differences([loop(3, ['right'])], [loop(5, ['right'])])).toEqual([{ kind: 'count', item: 0, from: 3, to: 5 }]);
    expect(sameShape([loop(3, ['right'])], cmdProgram(['right']))).toBe(false);
    expect(() => differences([loop(3, ['right'])], [loop(3, ['right', 'up'])])).toThrow();
  });

  it('predict: where the program leaves Brote, on a board with no goal', () => {
    const b = board({ goalKind: 'none', goal: NO_GOAL });
    expect(endOf(b, [loop(3, ['right']), { t: 'cmd', cmd: 'up' }])).toEqual({ c: 3, r: 0 });
    expect(solves(b, cmdProgram(['right', 'right', 'right', 'right', 'right']))).toBe(false);
  });

  it('the gold challenge: the same board, the fewest lines, "repetir" in the palette', () => {
    const flat = page({ blocks: ['up', 'right'], slots: 8, solution: cmdProgram(Array(5).fill('right')), save: { slots: 1, solution: [loop(5, ['right'])] } });
    const gold = goldLevel(flat)!;
    expect(gold.id).toBe('x-oro');
    expect(gold.worlds).toBe(flat.worlds);
    expect(gold.slots).toBe(1);
    expect(gold.blocks).toEqual(['up', 'right', 'repeat']);
    expect(gold.say).toBe(GOLD_SAY);
    expect(gold.save).toBeUndefined();
    expect(solves(gold.worlds[0], gold.solution)).toBe(true);
    expect(goldLevel(page({}))).toBeNull();
  });
});
