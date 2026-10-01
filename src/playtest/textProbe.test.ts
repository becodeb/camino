import { describe, expect, it } from 'vitest';
import { simulate } from '../game/engine';
import { fromProgram, parseText, runText, toProgram } from '../game/textCode';
import {
  CORE_STEPS, FAST_TIMES, STEPS, STEP_DEFS, TIMES, TX_SAY, blocksOfText, liveGlosses, markIntact, predictEnd, textWins, timesFrom,
  type EditTask, type PickTask, type PredictTask,
} from './textProbe';

const defs = STEPS.map((s) => STEP_DEFS[s]);
const edits = defs.map((d) => d.task).filter((t): t is EditTask => ['word', 'number', 'typo', 'write'].includes(t.kind));
const teaches = defs.flatMap((d) => (d.teach ? [[d.id, d.teach] as const] : []));

describe('the steps', () => {
  it('are six, one idea each, in a fixed order; the stretch is the last and optional', () => {
    expect(STEPS).toEqual(['move', 'seq', 'repeat', 'typo', 'if', 'write']);
    expect(CORE_STEPS).toEqual(STEPS.slice(0, 5));
    expect(defs.map((d) => d.task.kind)).toEqual(['pick', 'word', 'number', 'typo', 'predict', 'write']);
    expect(defs.filter((d) => d.optional).map((d) => d.id)).toEqual(['write']);
    expect(new Set(defs.map((d) => d.task.id)).size).toBe(6);
  });

  it('never use while or else, and each idea is taught before a task uses it', () => {
    const texts = defs.flatMap((d) => [d.teach?.text ?? '', 'text' in d.task ? d.task.text : '', 'fixed' in d.task ? d.task.fixed : '']);
    for (const t of texts) expect(t).not.toMatch(/\bwhile\b|\belse\b/);
    const taught = new Set<string>();
    for (const d of defs) {
      for (const w of ['for', 'if']) if (d.teach?.text.includes(`${w} `)) taught.add(w);
      const t = 'text' in d.task ? d.task.text : '';
      for (const w of ['for', 'if']) if (t.includes(`${w} `)) expect(taught.has(w), `${d.id} uses ${w} before teaching it`).toBe(true);
    }
  });

  it.each(teaches)('%s: the teaching program reaches the seed and is the same as its blocks', (_, t) => {
    const p = parseText(t.text);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const tr = runText(t.board, p.code).trace;
    expect(tr.outcome).toBe('win');
    const prog = toProgram(p.code)!;
    expect(fromProgram(prog)).toBe(t.text);
    expect(simulate(t.board, prog)).toEqual(tr);
    for (const g of t.glosses) expect(g.line).toBeLessThanOrEqual(t.text.split('\n').length);
  });

  it.each(edits.map((t) => [t.id, t] as const))('%s: the given text does not reach the seed; the fix does, changing one line', (_, t) => {
    expect(textWins(t.board, t.text)).toBe(false);
    expect(textWins(t.board, t.fixed)).toBe(true);
    const a = t.text.split('\n'), b = t.fixed.split('\n');
    const changed = b.map((l, i) => (l !== (a[i] ?? '') ? i + 1 : 0)).filter(Boolean);
    expect(changed).toEqual([t.focusLine]);
    if (t.mark) {
      expect(t.mark.line).toBe(t.focusLine);
      expect(markIntact(t, t.text)).toBe(true);
      expect(markIntact(t, t.fixed)).toBe(false);
    }
  });

  it('the word task marks "derecha" and the number task the number', () => {
    const w = STEP_DEFS.seq.task as EditTask, n = STEP_DEFS.repeat.task as EditTask;
    const at = (t: EditTask) => t.text.split('\n')[t.mark!.line - 1].slice(t.mark!.from, t.mark!.to);
    expect(at(w)).toBe('derecha');
    expect(at(n)).toBe('2');
    expect(w.hint?.keys).toBe('arriba');
  });

  it('the slip says "¿Será «derecha»?" on its line', () => {
    const t = STEP_DEFS.typo.task as EditTask;
    const p = parseText(t.text);
    expect(p.ok).toBe(false);
    if (p.ok) return;
    expect(p.error).toMatchObject({ kind: 'unknown_name', line: t.focusLine, suggestion: 'derecha' });
    expect(p.error.show).toContain('¿Será «derecha»?');
  });

  it('the pick: the right line is the block, the other is not', () => {
    const t = STEP_DEFS.move.task as PickTask;
    expect(t.options).toHaveLength(2);
    for (const o of t.options) {
      const prog = blocksOfText(o.text)!;
      expect(prog).toHaveLength(1);
      expect(prog[0].t === 'cmd' && prog[0].cmd === t.block).toBe(o.id === t.answer);
    }
    expect(t.options.find((o) => o.id !== t.answer)!.say.length).toBeGreaterThan(10);
  });

  it('the predict: the right drawing is where the program really ends (no rock: no jump); the others are not', () => {
    const t = STEP_DEFS.if.task as PredictTask;
    const real = predictEnd(t);
    expect(t.options.find((o) => o.id === t.answer)!.end).toEqual(real.end);
    expect(real.bump).toBe(false);
    for (const o of t.options.filter((x) => x.id !== t.answer)) expect(o.end).not.toEqual(real.end);
    expect(t.text).toBe(STEP_DEFS.if.teach!.text);
    expect(t.board.obstacles).toHaveLength(0);
    // the answer is not first (a child tapping the first drawing is not right by chance)
    expect(t.options.findIndex((o) => o.id === t.answer)).toBe(1);
  });

  it('the live note of a for follows its number', () => {
    expect(liveGlosses('for i in range(2):\n    derecha()')).toEqual([{ line: 1, text: 'repetí 2 veces' }]);
    expect(liveGlosses('for i in range(1):\n    derecha()')).toEqual([{ line: 1, text: 'repetí 1 vez' }]);
    expect(liveGlosses('for i in range(:\n    derecha()')).toEqual([]);
  });

  it('times: seguir after 90 s, in seconds with ?caps=fast', () => {
    expect(TIMES.skipMs).toBe(90_000);
    expect(timesFrom('?debug&caps=fast')).toBe(FAST_TIMES);
    expect(timesFrom('?debug')).toBe(TIMES);
  });

  it('every line is short, encouraging, and never says "difícil" or "incorrecto"', () => {
    const lines = [
      ...Object.values(TX_SAY).flat(),
      ...defs.flatMap((d) => [d.task.say, d.teach?.say ?? '', d.teach?.after ?? '', ...('right' in d.task ? [d.task.right] : []), ...('other' in d.task ? [d.task.other] : []),
        ...(d.task.kind === 'pick' ? d.task.options.map((o) => o.say) : [])]),
    ].filter(Boolean);
    for (const l of lines) {
      expect(l).not.toMatch(/dif[ií]cil|incorrect|mal\b|error/i);
      expect(l.length).toBeLessThanOrEqual(150);
    }
  });
});
