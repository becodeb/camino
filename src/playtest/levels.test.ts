import { describe, expect, it } from 'vitest';
import { SAMPLE_LEVELS, blocksOf, pilotLevel, programText } from './levels';

describe('playtest levels', () => {
  it('finds 1ro sheet pages and demo pages by id', () => {
    expect(pilotLevel('1ro-h1-1')?.id).toBe('1ro-h1-1');
    expect(pilotLevel('1ro-h13-4')?.id).toBe('1ro-h13-4');
    expect(pilotLevel('2do-1')?.id).toBe('2do-1');
    expect(pilotLevel('3ro-2')?.id).toBe('3ro-2');
    expect(pilotLevel('1ro-h99-1')).toBeNull();
    expect(pilotLevel('nope')).toBeNull();
    for (const id of SAMPLE_LEVELS) expect(pilotLevel(id), id).not.toBeNull();
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
});
