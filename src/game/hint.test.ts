import { describe, expect, it } from 'vitest';
import { countTaps, linesHint, nextCount, nextHint } from './hint';
import { judgeOf } from './judge';
import { HOLE, cmdProgram, type Board, type Program } from './model';
import { xylophone, type Tone } from './music';

const line = (over: Partial<Board> = {}): Board => ({
  cols: 9, rows: 3, start: { c: 0, r: 1 }, goal: { c: 8, r: 1 }, goalKind: 'seed',
  obstacles: [], pickups: [], deco: [], seed: 1, ...over,
});
const eight: Program = [{ t: 'loop', count: 8, body: ['right'] }];

describe('the count of a repeat', () => {
  it('cycles 2 → 10 and back to 2', () => {
    expect(nextCount(2)).toBe(3);
    expect(nextCount(10)).toBe(2);
    expect(countTaps(3, 8)).toBe(5);
    expect(countTaps(10, 8)).toBe(7);
    expect(countTaps(4, 4)).toBe(0);
  });

  it('a missing count (0) takes its first tap to 2', () => {
    expect(nextCount(0)).toBe(2);
    expect(countTaps(0, 2)).toBe(1);
    expect(countTaps(0, 6)).toBe(5);
  });
});

describe('help on a notebook with fixed lines', () => {
  const w = [line()];
  const target: Program = [{ t: 'loop', count: 7, body: ['right'] }, { t: 'cmd', cmd: 'right' }];

  it('a card that does not belong leaves first; then its line gets the right card', () => {
    expect(linesHint(w, [{ t: 'loop', count: 7, body: ['right'] }, { t: 'cmd', cmd: 'up' }], target)).toEqual({ kind: 'empty', ref: { item: 1 } });
    expect(linesHint(w, [{ t: 'loop', count: 7, body: ['right'] }, { t: 'cmd', cmd: HOLE }], target)).toEqual({ kind: 'fill', ref: { item: 1 }, cmd: 'right' });
  });

  it('the count, from a missing one or a wrong one', () => {
    expect(linesHint(w, [{ t: 'loop', count: 0, body: ['right'] }, { t: 'cmd', cmd: 'right' }], target)).toEqual({ kind: 'count', item: 0, taps: 6 });
    expect(linesHint(w, [{ t: 'loop', count: 5, body: ['right'] }, { t: 'cmd', cmd: 'right' }], target)).toEqual({ kind: 'count', item: 0, taps: 2 });
  });

  it('an extra card in a repeat leaves (the reference keeps its line empty); a winning notebook: ▶', () => {
    const fixed: Program = [{ t: 'loop', count: 4, body: ['right', HOLE] }];
    expect(linesHint(w, [{ t: 'loop', count: 4, body: ['right', 'up'] }], fixed)).toEqual({ kind: 'empty', ref: { item: 0, inner: 1 } });
    expect(linesHint(w, target, target)).toEqual({ kind: 'run' });
  });
});

describe('the next hint for loop programs', () => {
  const w = [line()];

  it('a program that already wins: press ▶', () => {
    expect(nextHint(w, eight, eight, 3)).toEqual({ kind: 'run' });
    // more passes than needed also wins: Brote stops on the seed
    expect(nextHint(w, [{ t: 'loop', count: 10, body: ['right'] }], eight, 3)).toEqual({ kind: 'run' });
  });

  it('an empty notebook: bring the repeat', () => {
    expect(nextHint(w, [], eight, 3)).toEqual({ kind: 'add', block: { t: 'loop', count: 2, body: [] }, slot: { at: 0 } });
  });

  it('plain arrows where a repeat goes: the repeat goes in before them', () => {
    const h = nextHint(w, cmdProgram(['right', 'right']), eight, 3);
    expect(h).toEqual({ kind: 'add', block: { t: 'loop', count: 2, body: [] }, slot: { at: 0 } });
  });

  it('an empty repeat: its card goes inside', () => {
    expect(nextHint(w, [{ t: 'loop', count: 2, body: [] }], eight, 3)).toEqual({ kind: 'add', block: { t: 'cmd', cmd: 'right' }, slot: { tape: 0, at: 0 } });
  });

  it('a full notebook: an extra card leaves first', () => {
    const p: Program = [{ t: 'loop', count: 2, body: [] }, ...cmdProgram(['right', 'right', 'right'])];
    expect(nextHint(w, p, eight, 3)).toEqual({ kind: 'remove', ref: { item: 3 } });
  });

  it('the right cards but too few passes: tap the count', () => {
    expect(nextHint(w, [{ t: 'loop', count: 3, body: ['right'] }], eight, 3)).toEqual({ kind: 'count', item: 0, taps: 5 });
  });

  it('a wrong card inside the repeat: it leaves', () => {
    const stairs: Program = [{ t: 'loop', count: 4, body: ['right', 'up'] }];
    const b = line({ cols: 5, rows: 5, start: { c: 0, r: 4 }, goal: { c: 4, r: 0 }, obstacles: [{ c: 0, r: 3, kind: 'rock', seed: 1 }] });
    expect(nextHint([b], [{ t: 'loop', count: 4, body: ['up', 'right'] }], stairs, 3)).toEqual({ kind: 'remove', ref: { item: 0, inner: 0 } });
    expect(nextHint([b], [{ t: 'loop', count: 4, body: ['right'] }], stairs, 3)).toEqual({ kind: 'add', block: { t: 'cmd', cmd: 'up' }, slot: { tape: 0, at: 1 } });
  });

  it('several worlds: winning in one is not enough', () => {
    const p: Program = [{ t: 'loop', count: 'goal', body: ['right'] }];
    const ref: Program = [{ t: 'loop', count: 'goal', body: ['ifrock:right', 'right'] }];
    const rocky = line({ rows: 1, start: { c: 0, r: 0 }, goal: { c: 5, r: 0 }, obstacles: [{ c: 1, r: 0, kind: 'rock', seed: 1 }] });
    const clear = line({ rows: 1, start: { c: 0, r: 0 }, goal: { c: 5, r: 0 } });
    // the "if" is missing before the arrow: it goes in first
    expect(nextHint([clear, rocky], p, ref, 3)).toEqual({ kind: 'add', block: { t: 'cmd', cmd: 'ifrock:right' }, slot: { tape: 0, at: 0 } });
    // the arrow first, then the "if": same cards in the wrong order, the first one leaves
    const swapped: Program = [{ t: 'loop', count: 'goal', body: ['right', 'ifrock:right'] }];
    expect(nextHint([clear, rocky], swapped, ref, 3)).toEqual({ kind: 'remove', ref: { item: 0, inner: 0 } });
  });
});

describe('help judged by the page itself (a song, not a walk)', () => {
  const song: Tone[] = ['do', 'mi', 'sol', 'mi', 'do', 'mi', 'sol', 'mi'];
  const page = { worlds: [xylophone(3)], music: { song } };
  const ref: Program = [{ t: 'loop', count: 2, body: ['note:do', 'note:mi', 'note:sol', 'note:mi'] }];

  it('▶ once the song is right, the next note to bring, the wrong one to take out, the count', () => {
    expect(nextHint(judgeOf(page), ref, ref, 4)).toEqual({ kind: 'run' });
    expect(nextHint(judgeOf(page), [{ t: 'loop', count: 2, body: ['note:do', 'note:mi'] }], ref, 4)).toEqual({ kind: 'add', block: { t: 'cmd', cmd: 'note:sol' }, slot: { tape: 0, at: 2 } });
    expect(nextHint(judgeOf(page), [{ t: 'loop', count: 2, body: ['note:do', 'note:re', 'note:sol', 'note:mi'] }], ref, 4)).toEqual({ kind: 'remove', ref: { item: 0, inner: 1 } });
    expect(nextHint(judgeOf(page), [{ t: 'loop', count: 3, body: ref[0].t === 'loop' ? ref[0].body : [] }], ref, 4)).toEqual({ kind: 'count', item: 0, taps: 8 });
    expect(linesHint(judgeOf(page), [{ t: 'loop', count: 0, body: ['note:do', 'note:mi', 'note:sol', 'note:mi'] }], ref)).toEqual({ kind: 'count', item: 0, taps: 1 });
  });
});
