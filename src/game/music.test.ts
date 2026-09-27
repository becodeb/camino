import { describe, expect, it } from 'vitest';
import { unroll } from './engine';
import { HOLE, type Program } from './model';
import { PITCHES, barCell, isNoteCmd, isPrimitive, melodyKey, noteCmd, phrasesOf, songTrace, toneOf, tonesOf, xylophone, type Tone } from './music';

const board = xylophone(7);
const notes = (...ts: Tone[]): Program => ts.map((t) => ({ t: 'cmd', cmd: noteCmd(t) }));
const rep = (count: number, ...ts: Tone[]): Program[number] => ({ t: 'loop', count, body: ts.map(noteCmd) });

describe('note cards', () => {
  it('a note card names its bar; the silence is its own card; arrows are not notes', () => {
    for (const p of PITCHES) expect(toneOf(noteCmd(p))).toBe(p);
    expect(noteCmd('rest')).toBe('rest');
    expect(toneOf('rest')).toBe('rest');
    expect(isNoteCmd('right')).toBe(false);
    expect(toneOf('note:la')).toBeNull();
    expect(toneOf('up')).toBeNull();
  });

  it('the bars are columns 1 to 5 of a one-row board, Brote waits on column 0', () => {
    expect(board.cols).toBe(6);
    expect(board.rows).toBe(1);
    expect(board.start).toEqual({ c: 0, r: 0 });
    expect(board.goalKind).toBe('none');
    expect(barCell('do')).toEqual({ c: 1, r: 0 });
    expect(barCell('sol')).toEqual({ c: 5, r: 0 });
  });
});

describe('unroll', () => {
  it('plays a repeat\'s body count times, skips empty lines, and a missing count plays nothing', () => {
    const p: Program = [{ t: 'cmd', cmd: 'a' }, { t: 'loop', count: 2, body: ['b', HOLE, 'c'] }, { t: 'cmd', cmd: HOLE }, { t: 'loop', count: 0, body: ['d'] }];
    expect(unroll(p)).toEqual([
      { cmd: 'a', ref: { item: 0 } },
      { cmd: 'b', ref: { item: 1, inner: 0, iter: 0 } }, { cmd: 'c', ref: { item: 1, inner: 2, iter: 0 } },
      { cmd: 'b', ref: { item: 1, inner: 0, iter: 1 } }, { cmd: 'c', ref: { item: 1, inner: 2, iter: 1 } },
    ]);
  });
});

describe('playing a song', () => {
  const song: Tone[] = ['do', 're', 'mi', 'do'];

  it('the same notes in the same order win: each note is a step onto its bar', () => {
    const t = songTrace(board, { song }, notes(...song));
    expect(t.outcome).toBe('win');
    expect(t.steps.map((s) => s.cells[0])).toEqual(song.map((x) => barCell(x as 'do')));
    expect(t.steps.every((s) => s.kind === 'move')).toBe(true);
    expect(t.steps.at(-1)!.won).toBe(true);
    expect(t.final).toMatchObject(barCell('do'));
  });

  it('the first wrong beat stops the song: Brote plays it, and the bar that was due is named', () => {
    const t = songTrace(board, { song }, notes('do', 're', 'fa', 'do'));
    expect(t.outcome).toBe('crash');
    expect(t.crashAt).toBe(2);
    expect(t.steps).toHaveLength(3);
    const s = t.steps[2];
    expect(s.kind).toBe('crash');
    expect(s.ref).toEqual({ item: 2 });
    expect(s.to).toMatchObject(barCell('fa'));
    expect(s.crash).toEqual({ at: barCell('mi'), out: false });
  });

  it('a beat past the end of the song is a wrong one too (the song was over)', () => {
    const t = songTrace(board, { song }, notes('do', 're', 'mi', 'do', 'do'));
    expect(t.outcome).toBe('crash');
    expect(t.crashAt).toBe(4);
    expect(t.steps[4].crash?.out).toBe(true);
  });

  it('a notebook that ends before the song is short; so is an empty one', () => {
    expect(songTrace(board, { song }, notes('do', 're')).outcome).toBe('short');
    expect(songTrace(board, { song }, []).outcome).toBe('short');
  });

  it('a repeat plays its notes again: the chorus, with the pass of each beat', () => {
    const chorus: Tone[] = ['do', 'mi', 'sol', 'mi'];
    const t = songTrace(board, { song: [...chorus, ...chorus, ...chorus] }, [rep(3, ...chorus)]);
    expect(t.outcome).toBe('win');
    expect(t.steps[5].ref).toEqual({ item: 0, inner: 1, iter: 1 });
    expect(songTrace(board, { song: [...chorus, ...chorus] }, [rep(3, ...chorus)]).outcome).toBe('crash');
    expect(songTrace(board, { song: [...chorus, ...chorus] }, [rep(0, ...chorus)]).outcome).toBe('short');
  });

  it('a silence is a beat that stays on its bar', () => {
    const t = songTrace(board, { song: ['sol', 'rest', 'sol'] }, notes('sol', 'rest', 'sol'));
    expect(t.outcome).toBe('win');
    expect(t.steps[1].kind).toBe('look');
    expect(t.steps[1].cells).toEqual([]);
    expect(t.steps[1].to).toMatchObject(barCell('sol'));
    const wrong = songTrace(board, { song: ['sol', 'rest', 'sol'] }, notes('sol', 'sol'));
    expect(wrong.crashAt).toBe(1);
    expect(wrong.steps[1].crash).toEqual({ at: barCell('sol'), out: false });
  });

  it('a free page: any tune with enough notes that sound is a concert (silences do not count)', () => {
    const free = { free: { min: 3 } };
    expect(songTrace(board, free, notes('fa', 'rest', 'rest')).outcome).toBe('short');
    expect(songTrace(board, free, notes('fa', 'rest', 'do', 'sol')).outcome).toBe('win');
    expect(songTrace(board, free, [rep(2, 'mi', 'do')]).outcome).toBe('win');
    expect(songTrace(board, free, []).outcome).toBe('short');
  });
});

describe('the song strip and the keys of songs', () => {
  it('every pass of a repeat is a phrase; the cards around it make their own', () => {
    expect(phrasesOf([rep(2, 'do', 're', 'mi', 'do'), rep(2, 'mi', 'fa', 'sol', 'rest')])).toEqual([4, 4, 4, 4]);
    expect(phrasesOf([...notes('do', 're'), rep(3, 'mi', 'sol'), ...notes('do')])).toEqual([2, 2, 2, 2, 1]);
    expect(phrasesOf(notes('do', 're', 'mi', 'do'))).toEqual([4]);
    expect(phrasesOf([rep(0, 'sol', 'mi')])).toEqual([]);
  });

  it('a motif is primitive unless a shorter one played again makes it', () => {
    expect(isPrimitive(['do', 'mi'])).toBe(true);
    expect(isPrimitive(['do', 'mi', 'do', 'mi'])).toBe(false);
    expect(isPrimitive(['sol', 'sol', 'mi'])).toBe(true);
    expect(isPrimitive(['do', 'do'])).toBe(false);
  });

  it('one repeat of a motif is keyed like the melody family; anything else by its song', () => {
    expect(melodyKey([rep(4, 'sol', 'mi')])).toBe('mel:note:sol,note:mi:4');
    expect(melodyKey(notes('do', 're'))).toBe('song:do,re');
    expect(tonesOf([rep(2, 'do', 'rest')])).toEqual(['do', 'rest', 'do', 'rest']);
  });
});
