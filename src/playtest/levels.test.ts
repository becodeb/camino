import { describe, expect, it } from 'vitest';
import { blocksOf, isFailedRun, optimalBlocks, pilotLevel, programText, ruleBlocksOf, rulesText } from './levels';

describe('playtest levels', () => {
  it('finds 1ro sheet pages and demo pages by id', () => {
    expect(pilotLevel('1ro-h1-1')?.id).toBe('1ro-h1-1');
    expect(pilotLevel('1ro-h13-4')?.id).toBe('1ro-h13-4');
    expect(pilotLevel('2do-1')?.id).toBe('2do-1');
    expect(pilotLevel('3ro-2')?.id).toBe('3ro-2');
    expect(pilotLevel('1ro-h99-1')).toBeNull();
    expect(pilotLevel('nope')).toBeNull();
  });

  it('writes a program as one short line and counts its blocks', () => {
    const p = [
      { t: 'cmd' as const, cmd: 'right' },
      { t: 'loop' as const, count: 3, body: ['up', ''] },
      { t: 'cmd' as const, cmd: '' },
      { t: 'loop' as const, count: 'goal' as const, body: ['right'] },
      { t: 'loop' as const, count: 0, body: [] },
    ];
    expect(programText(p)).toBe('right rep3(up _) _ repgoal(right) rep?()');
    expect(blocksOf(p)).toBe(6);
    expect(programText([])).toBe('');
  });

  it('writes a rule game\'s rules as one line and counts their cards', () => {
    const rules = [{ hat: 'key:right' as const, actions: ['right' as const] }, { hat: 'touch:seed' as const, actions: ['score' as const] }];
    expect(rulesText(rules)).toBe('key:right(right) touch:seed(score)');
    expect(ruleBlocksOf(rules)).toBe(4);
    expect(optimalBlocks(pilotLevel('3ro-2')!)).toBe(6);
    expect(optimalBlocks(pilotLevel('1ro-h4-1')!)).toBe(2);
  });

  it('counts as failed only runs that ran and did not win', () => {
    const seq = pilotLevel('1ro-h1-2')!;
    const some = [{ t: 'cmd' as const, cmd: 'right' }];
    expect(isFailedRun(seq, 'bump', some)).toBe(true);
    expect(isFailedRun(seq, 'short', some)).toBe(true);
    expect(isFailedRun(seq, 'win', some)).toBe(false);
    for (const r of ['empty', 'incomplete', 'no_guess', 'no_play']) expect(isFailedRun(seq, r, []), r).toBe(false);
    expect(isFailedRun(pilotLevel('1ro-h3-2')!, 'wrong_guess', pilotLevel('1ro-h3-2')!.given!)).toBe(true);
    expect(isFailedRun(pilotLevel('3ro-1')!, 'stopped', [])).toBe(true);
  });

  it('does not count the given program run unchanged on a fix page', () => {
    const fix = pilotLevel('1ro-h3-3')!;
    expect(isFailedRun(fix, 'bump', fix.given!)).toBe(false);
    expect(isFailedRun(fix, 'bump', fix.given!.slice(0, -1))).toBe(true);
  });
});
