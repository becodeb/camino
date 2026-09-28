import { describe, expect, it } from 'vitest';
import { simulate, solves } from '../game/engine';
import { COUNT_MAX, COUNT_MIN } from '../game/hint';
import { cardCount, cmdProgram, inside, obstacleAt, type Program, type ProgramItem } from '../game/model';
import { CLASSMATES, EXAMPLES, classmateById } from './classmates';
import { sheetByN } from './primer';
import { EMPTY, publish, solve } from './progress';
import {
  MADE_COLS, MADE_ROWS, MAX_LINES, applyTool, boardOf, cardById, cardLevel, cardLevelId, cardsOf, clampLines, defaultDraft, draftLevel, fewestProgram,
  flatPlan, isArrowProgram, isDraft, isMadeBoard, isMadeLevel, movePiece, nextMadeId, pieceAt, usesRepeat, verdictOf,
  type MadeBoard,
} from './workshop';

const W7 = sheetByN(7)!, W15 = sheetByN(15)!;
const B: MadeBoard = { start: [0, 2], seed: [2, 2], goal: [5, 2], rocks: [[3, 0]] };
const ARROWS = ['left', 'up', 'down', 'right'];

/**
 * Every program a notebook of `slots` lines holds, the ones with fewer cards
 * first: arrows, repeats one level deep (patterns of up to four arrows).
 */
function* programs(slots: number): Generator<Program> {
  const items: { it: ProgramItem; cards: number }[] = ARROWS.map((cmd) => ({ it: { t: 'cmd', cmd }, cards: 1 }));
  let layer: string[][] = [[]];
  for (let n = 1; n <= Math.min(4, slots); n++) {
    layer = layer.flatMap((s) => ARROWS.map((a) => [...s, a]));
    for (const body of layer) for (let c = COUNT_MIN; c <= COUNT_MAX; c++) items.push({ it: { t: 'loop', count: c, body }, cards: body.length });
  }
  const exactly = function* (acc: Program, room: number): Generator<Program> {
    if (!room) { yield acc; return; }
    for (const { it, cards } of items) if (cards <= room) yield* exactly([...acc, it], room - cards);
  };
  for (let n = 1; n <= slots; n++) yield* exactly([], n);
}

describe('the editor\'s edits', () => {
  it('Brote, the seed and the pot move to a free cell; a rock is added there', () => {
    expect(applyTool(B, 'start', [1, 0])).toEqual({ board: { ...B, start: [1, 0] }, changed: true });
    expect(applyTool(B, 'seed', [4, 3]).board.seed).toEqual([4, 3]);
    expect(applyTool(B, 'goal', [5, 0]).board.goal).toEqual([5, 0]);
    expect(applyTool(B, 'rock', [1, 1]).board.rocks).toEqual([[3, 0], [1, 1]]);
  });

  it('a cell holding something else refuses (its piece wiggles); the same piece on its own cell does nothing', () => {
    expect(applyTool(B, 'rock', [0, 2])).toEqual({ board: B, changed: false, refused: [0, 2] });
    expect(applyTool(B, 'seed', [3, 0])).toEqual({ board: B, changed: false, refused: [3, 0] });
    expect(applyTool(B, 'rock', [3, 0])).toEqual({ board: B, changed: false, refused: [3, 0] });
    expect(applyTool(B, 'goal', [5, 2])).toEqual({ board: B, changed: false });
  });

  it('the eraser takes rocks away, never Brote, the seed or the pot (the level is never missing them)', () => {
    expect(applyTool(B, 'eraser', [3, 0])).toEqual({ board: { ...B, rocks: [] }, changed: true });
    for (const at of [B.start, B.seed, B.goal]) expect(applyTool(B, 'eraser', at)).toEqual({ board: B, changed: false, refused: at });
    expect(applyTool(B, 'eraser', [4, 3])).toEqual({ board: B, changed: false });
  });

  it('a piece dragged on the board goes to a free cell; nothing leaves the board', () => {
    expect(movePiece(B, [3, 0], [4, 1]).board.rocks).toEqual([[4, 1]]);
    expect(movePiece(B, [0, 2], [0, 0]).board.start).toEqual([0, 0]);
    expect(movePiece(B, [0, 2], [2, 2])).toEqual({ board: B, changed: false, refused: [2, 2] });
    expect(movePiece(B, [1, 1], [1, 2]).changed).toBe(false); // nothing there
    expect(movePiece(B, [0, 2], [6, 2]).changed).toBe(false);
    expect(applyTool(B, 'rock', [-1, 0]).changed).toBe(false);
    expect(pieceAt(B, [5, 2])).toBe('goal');
  });

  it('the lines setting stays between 1 and 8', () => {
    expect([clampLines(0), clampLines(3), clampLines(12), clampLines(Number.NaN)]).toEqual([1, 3, 8, 1]);
  });
});

describe('the solver', () => {
  it('the board is an open 6 × 4 board with the seed and the pot, forest or river', () => {
    const b = boardOf(B, { river: true, seed: 4 });
    expect([b.cols, b.rows, b.goalKind, b.look, b.pickups]).toEqual([MADE_COLS, MADE_ROWS, 'pot', 'river', [{ c: 2, r: 2 }]]);
    expect(obstacleAt(b, 3, 0)?.kind).toBe('rock');
    expect(boardOf(B, { river: false, seed: 4 }).look).toBeUndefined();
  });

  it('the fewest cards: never more than any program a notebook holds, and it wins', () => {
    const boards: MadeBoard[] = [
      B,
      { start: [0, 3], seed: [2, 1], goal: [3, 0], rocks: [[0, 2], [1, 1], [2, 0]] },
      { start: [0, 0], seed: [5, 0], goal: [5, 3], rocks: [] },
      { start: [5, 3], seed: [4, 3], goal: [0, 0], rocks: [[3, 3], [3, 2]] },
    ];
    for (const m of boards) {
      const b = boardOf(m, { river: false, seed: 1 });
      const best = fewestProgram(b, 3);
      let brute: number | null = null;
      for (const p of programs(3)) if (solves(b, p)) { brute = cardCount(p); break; }
      expect(best && cardCount(best), JSON.stringify(m)).toBe(brute);
      if (best) expect(solves(b, best)).toBe(true);
    }
  }, 30000);

  it('a board with no way through has no plan and no program', () => {
    const walled: MadeBoard = { start: [0, 0], seed: [5, 3], goal: [5, 0], rocks: [[1, 0], [1, 1], [1, 2], [1, 3]] };
    const b = boardOf(walled, { river: false, seed: 1 });
    expect(flatPlan(b)).toBeNull();
    expect(fewestProgram(b, 6)).toBeNull();
  });
});

describe('the verdict', () => {
  it('a new level is never broken: the defaults are good levels, the limited one needs its repeat', () => {
    const d7 = verdictOf(defaultDraft(false), false);
    expect(d7).toEqual({ ok: true, lines: 5, solution: cmdProgram(['right', 'right', 'right', 'right', 'right']) });
    const d15 = verdictOf(defaultDraft(true), true);
    expect(d15.ok).toBe(true);
    if (d15.ok) { expect(d15.lines).toBe(2); expect(usesRepeat(d15.solution)).toBe(true); }
  });

  it('a level Brote cannot finish is refused', () => {
    const walled: MadeBoard = { start: [0, 0], seed: [2, 0], goal: [5, 0], rocks: [[1, 0], [0, 1]] };
    expect(verdictOf({ board: walled, lines: 3 }, false)).toEqual({ ok: false, why: 'unreachable' });
    // the pot is closed until the seed is picked up: a seed behind the pot cannot be reached through it
    const behind: MadeBoard = { start: [0, 0], seed: [5, 0], goal: [4, 0], rocks: [[4, 1], [5, 1]] };
    expect(verdictOf({ board: behind, lines: 3 }, true)).toEqual({ ok: false, why: 'unreachable' });
  });

  it('a first workshop\'s level gets a notebook as long as its shortest plan, and no longer than twelve lines', () => {
    const v = verdictOf({ board: B, lines: 1 }, false);
    expect(v).toMatchObject({ ok: true, lines: 5 });
    // a snake: longer than any notebook
    const snake: MadeBoard = { start: [0, 0], seed: [2, 1], goal: [5, 3], rocks: [[1, 0], [1, 1], [1, 2], [3, 1], [3, 2], [3, 3]] };
    const plan = flatPlan(boardOf(snake, { river: false, seed: 1 }));
    expect(plan!.length).toBeGreaterThan(MAX_LINES);
    expect(verdictOf({ board: snake, lines: 3 }, false)).toEqual({ ok: false, why: 'long' });
  });

  it('a limited level must need a repeat: refused when a plan without one fits its lines', () => {
    const short: MadeBoard = { start: [0, 3], seed: [1, 3], goal: [2, 3], rocks: [] };
    expect(verdictOf({ board: short, lines: 2 }, true)).toEqual({ ok: false, why: 'flat', lines: 2 });
    expect(verdictOf({ board: B, lines: 5 }, true)).toEqual({ ok: false, why: 'flat', lines: 5 });
  });

  it('refused when even with repeats it needs more lines (it says how many), and when a repeat never saves a line', () => {
    const zig: MadeBoard = { start: [0, 0], seed: [2, 1], goal: [4, 2], rocks: [[3, 0], [1, 1], [5, 1]] };
    expect(verdictOf({ board: zig, lines: 2 }, true)).toEqual({ ok: false, why: 'more', lines: 3 });
    expect(verdictOf({ board: zig, lines: 3 }, true)).toMatchObject({ ok: true, lines: 3 });
    // a crooked path: up to the seed, then round to the pot; each step goes another way, nothing repeats
    const crooked: MadeBoard = { start: [0, 1], seed: [0, 0], goal: [1, 1], rocks: [] };
    expect(flatPlan(boardOf(crooked, { river: false, seed: 1 }))).toHaveLength(3);
    expect(verdictOf({ board: crooked, lines: 2 }, true)).toEqual({ ok: false, why: 'pattern' });
  });

  it('an accepted limited level: no program without a repeat fits its lines, and its reference program has one', () => {
    for (const m of [defaultDraft(true), { board: { start: [0, 0], seed: [5, 0], goal: [5, 3], rocks: [] } as MadeBoard, lines: 2 }]) {
      const v = verdictOf(m, true);
      expect(v.ok).toBe(true);
      if (!v.ok) continue;
      const b = boardOf(m.board, { river: true, seed: 1 });
      for (const p of programs(m.lines)) if (!usesRepeat(p)) expect(solves(b, p)).toBe(false);
      expect(usesRepeat(v.solution) && solves(b, v.solution) && cardCount(v.solution) <= m.lines).toBe(true);
    }
  });
});

describe('the classmates\' example levels', () => {
  it('are six to eight, by fictional classmates, half from each workshop', () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(6);
    expect(EXAMPLES.length).toBeLessThanOrEqual(8);
    expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(EXAMPLES.length);
    for (const e of EXAMPLES) {
      expect(e.id).toMatch(/^ej-\d+$/);
      expect(classmateById(e.by!)).not.toBeNull();
      expect([7, 15]).toContain(e.sheet);
    }
    expect(EXAMPLES.filter((e) => e.sheet === 7).length).toBe(EXAMPLES.filter((e) => e.sheet === 15).length);
    expect(new Set(CLASSMATES.map((c) => c.id)).size).toBe(CLASSMATES.length);
  });

  for (const e of EXAMPLES) {
    it(`${e.id} (${e.by}, sheet ${e.sheet}) is a sane board the solver accepts, and its author's program wins within its lines`, () => {
      const limited = e.sheet === 15;
      expect(isMadeLevel({ ...e, id: 'yo-1' })).toBe(true);
      const b = boardOf(e.board, { river: limited, seed: 1 });
      for (const cell of [b.start, b.goal, ...b.pickups]) expect(inside(b, cell.c, cell.r) && !obstacleAt(b, cell.c, cell.r)).toBe(true);
      expect(verdictOf(e, limited)).toMatchObject({ ok: true, lines: e.lines });
      expect(simulate(b, e.solution).outcome).toBe('win');
      expect(cardCount(e.solution)).toBeLessThanOrEqual(e.lines);
      if (limited) {
        expect(usesRepeat(e.solution)).toBe(true);
        expect(flatPlan(b)!.length).toBeGreaterThan(e.lines);
      } else {
        expect(usesRepeat(e.solution)).toBe(false);
        expect(e.lines).toBe(flatPlan(b)!.length);
      }
    });
  }

  it('are varied: no two share a board', () => {
    const boards = EXAMPLES.map((e) => JSON.stringify(e.board));
    expect(new Set(boards).size).toBe(boards.length);
  });
});

describe('the pages a made level becomes', () => {
  it('the test page: the notebook the classmates will get, the look of the workshop\'s zone', () => {
    const d = defaultDraft(true);
    const v = verdictOf(d, true);
    if (!v.ok) throw new Error('the default is good');
    const l = draftLevel(W15, d, v);
    expect([l.id, l.slots, l.blocks, l.worlds[0].look, l.mode, l.blockLabel]).toEqual(['1ro-h15-taller', 2, ['left', 'up', 'down', 'right', 'repeat'], 'river', 'program', 'picture-word']);
    const l7 = draftLevel(W7, defaultDraft(false), verdictOf(defaultDraft(false), false) as Extract<ReturnType<typeof verdictOf>, { ok: true }>);
    expect([l7.slots, l7.blocks, l7.worlds[0].look]).toEqual([5, ['left', 'up', 'down', 'right'], undefined]);
  });

  it('a card: its id, its author\'s lines and program, the palette of its workshop', () => {
    const e = EXAMPLES.find((x) => x.sheet === 15)!;
    const l = cardLevel(e, W15);
    expect([l.id, l.slots, l.solution, l.blocks.includes('repeat'), l.worlds[0].look]).toEqual([cardLevelId(e.id), e.lines, e.solution, true, 'river']);
    expect(l.title).toContain(classmateById(e.by!)!.name);
    expect(cardLevel({ ...e, id: 'yo-3', by: undefined }, W15).title).toBe('Mi nivel con límite');
  });

  it('the corkboard: the levels made here first (the newest first), then the examples', () => {
    let p = publish(EMPTY, { ...EXAMPLES[0], id: 'yo-1', by: undefined });
    p = publish(p, { ...EXAMPLES[4], id: 'yo-2', by: undefined });
    expect(cardsOf(p).map((c) => c.id)).toEqual(['yo-2', 'yo-1', ...EXAMPLES.map((e) => e.id)]);
    expect(cardById(p, 'yo-1')?.sheet).toBe(7);
    expect(cardById(p, 'nope')).toBeNull();
    expect(nextMadeId(p)).toBe('yo-3');
    expect(nextMadeId(solve(EMPTY, cardLevelId('yo-7')))).toBe('yo-8');
  });
});

describe('reading made levels back from storage', () => {
  it('rejects boards with pieces off the board or on each other, programs with other blocks, drafts with too many lines', () => {
    expect(isMadeBoard(B)).toBe(true);
    expect(isMadeBoard({ ...B, seed: [6, 0] })).toBe(false);
    expect(isMadeBoard({ ...B, rocks: [[2, 2]] })).toBe(false);
    expect(isMadeBoard({ ...B, rocks: [[1, 1], [1, 1]] })).toBe(false);
    expect(isMadeBoard({ ...B, start: [0.5, 1] })).toBe(false);
    expect(isMadeBoard(null)).toBe(false);
    expect(isArrowProgram([{ t: 'loop', count: 3, body: ['up'] }, { t: 'cmd', cmd: 'left' }])).toBe(true);
    expect(isArrowProgram([{ t: 'loop', count: 'goal', body: ['up'] }])).toBe(false);
    expect(isArrowProgram([{ t: 'loop', count: 11, body: ['up'] }])).toBe(false);
    expect(isArrowProgram([{ t: 'cmd', cmd: 'note:do' }])).toBe(false);
    expect(isDraft({ board: B, lines: 3 })).toBe(true);
    expect(isDraft({ board: B, lines: 13 })).toBe(false);
    expect(isDraft({ board: B, lines: 3, proof: 'x' })).toBe(false);
  });
});
