import { describe, expect, it } from 'vitest';
import { simulate } from '../game/engine';
import { fromProgram, parseText, runText, toProgram } from '../game/textCode';
import { ITEMS, NEXT_AFTER_MS, TOUR, blocksOfText, nextOpen, predictEnd, textWins, type ChoiceItem, type EditItem, type PredictItem } from './textProbe';

const predicts = ITEMS.filter((i): i is PredictItem => i.kind === 'predict');
const edits = ITEMS.filter((i): i is EditItem => i.kind === 'number' || i.kind === 'typo' || i.kind === 'write');
const choices = ITEMS.filter((i): i is ChoiceItem => i.kind === 'blocks_to_text');

describe('the fixed items', () => {
  it('are 8, with unique ids, every kind, in a fixed order', () => {
    expect(ITEMS.map((i) => i.id)).toEqual(['predict_loop', 'predict_if', 'number', 'typo_name', 'typo_colon', 'blocks_loop', 'blocks_until', 'write_if']);
    expect(new Set(ITEMS.map((i) => i.kind))).toEqual(new Set(['predict', 'number', 'typo', 'blocks_to_text', 'write']));
  });

  it('the tour runs to the seed and is the same program as blocks and as text', () => {
    const p = parseText(TOUR.text);
    expect(p.ok && runText(TOUR.board, p.code).trace.outcome).toBe('win');
    expect(fromProgram(blocksOfText(TOUR.text)!)).toBe(TOUR.text);
  });

  it.each(predicts.map((i) => [i.id, i] as const))('%s: the right drawing is where the program really ends; the others are not', (_, it) => {
    const real = predictEnd(it);
    const right = it.options.find((o) => o.id === it.answer)!;
    expect(right.end).toEqual(real.end);
    expect(!!right.bump).toBe(real.bump);
    for (const o of it.options.filter((x) => x.id !== it.answer)) expect([o.end.c, o.end.r, !!o.bump]).not.toEqual([real.end.c, real.end.r, real.bump]);
    expect(new Set(it.options.map((o) => o.id)).size).toBe(3);
    // the text has blocks too (its round trip is exact)
    expect(fromProgram(blocksOfText(it.text)!)).toBe(it.text);
    const parsed = parseText(it.text);
    expect(parsed.ok && runText(it.board, parsed.code).trace).toEqual(simulate(it.board, blocksOfText(it.text)!));
  });

  it('answer positions are fixed: 2nd, 1st, then 3rd and 2nd for the blocks', () => {
    const pos = [...predicts, ...choices].map((i) => i.options.findIndex((o) => o.id === i.answer));
    expect(pos).toEqual([1, 0, 2, 1]);
  });

  it.each(edits.map((i) => [i.id, i] as const))('%s: the given text does not reach the seed, the fixed one does, and they differ on the focus line', (_, it) => {
    expect(textWins(it, it.text)).toBe(false);
    expect(textWins(it, it.fixed)).toBe(true);
    const a = it.text.split('\n'), b = it.fixed.split('\n');
    expect(a.length).toBe(b.length);
    expect(a.map((l, k) => (l === b[k] ? null : k + 1)).filter(Boolean)).toEqual([it.focusLine]);
    expect(it.caret.line).toBe(it.focusLine);
    expect(it.caret.col).toBeLessThanOrEqual(a[it.caret.line - 1].length);
    // round trip text ↔ Program of the fixed text
    expect(fromProgram(blocksOfText(it.fixed)!)).toBe(it.fixed);
  });

  it('the number item parses and runs short; the typos show their error on the focus line; the empty line of the stretch too', () => {
    const [num, name, colon, write] = edits;
    const p = parseText(num.text);
    expect(p.ok && runText(num.board, p.code).trace.outcome).toBe('short');
    expect(parseText(name.text)).toMatchObject({ ok: false, error: { kind: 'unknown_name', line: 3, suggestion: 'derecha' } });
    expect(parseText(colon.text)).toMatchObject({ ok: false, error: { kind: 'missing_colon', line: 1 } });
    expect(parseText(write.text)).toMatchObject({ ok: false, error: { kind: 'empty_block', line: 2 } });
    expect(num.blocks && write.blocks && !name.blocks && !colon.blocks).toBe(true);
  });

  it.each(choices.map((i) => [i.id, i] as const))('%s: exactly the answer is the same program as the blocks', (_, it) => {
    for (const o of it.options) {
      const p = parseText(o.text);
      expect(p.ok).toBe(true);
      const same = JSON.stringify(p.ok ? toProgram(p.code) : null) === JSON.stringify(it.program);
      expect(same).toBe(o.id === it.answer);
    }
    expect(fromProgram(it.program)).toBe(it.options.find((o) => o.id === it.answer)!.text);
  });
});

describe('moving through the items', () => {
  it('goes to the next item not finished, wrapping, and to none when all are', () => {
    expect(nextOpen(0, new Set())).toBe(1);
    expect(nextOpen(7, new Set())).toBe(0);
    expect(nextOpen(1, new Set(['number', 'typo_name']))).toBe(4);
    expect(nextOpen(3, new Set(ITEMS.map((i) => i.id)))).toBeNull();
    expect(nextOpen(2, new Set(ITEMS.filter((i) => i.id !== 'number').map((i) => i.id)))).toBe(2);
  });

  it('shows the next page on a stuck item after a while, the stretch sooner, never before a pick', () => {
    expect(NEXT_AFTER_MS.write).toBeLessThan(NEXT_AFTER_MS.typo);
    expect(NEXT_AFTER_MS.predict).toBe(Infinity);
  });
});
