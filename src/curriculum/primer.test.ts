import { describe, expect, it } from 'vitest';
import { completeProgram, shortestMoves, simulate, solves } from '../game/engine';
import { COUNT_MAX, COUNT_MIN } from '../game/hint';
import { LEVELS, levelById, type LevelDef } from '../game/levels';
import { cardCount, cmdProgram, inside, obstacleAt, sameCell, type Program, type ProgramItem } from '../game/model';
import { DOORS, bossId, coreId, isBuilt } from './model';
import { PRIMER, sheetByN } from './primer';

const BUILT = PRIMER.filter(isBuilt);
const cmdsOf = (l: LevelDef) => l.blocks.filter((b) => b !== 'repeat' && b !== 'repeat-goal');
const hasLoop = (p: Program) => p.some((it) => it.t === 'loop');
const levelsOf = (n: number) => { const s = sheetByN(n)!; return [...s.core.map((c) => c.level), s.boss!]; };

/** Every flat list of `alphabet` with 1..max arrows. */
function* sequences(alphabet: readonly string[], max: number): Generator<string[]> {
  let layer: string[][] = [[]];
  for (let n = 1; n <= max; n++) {
    layer = layer.flatMap((s) => alphabet.map((a) => [...s, a]));
    yield* layer;
  }
}

/** Every program the notebook of `l` holds: its palette, repeats one level deep, at most `slots` cards. */
function* programsOf(l: LevelDef): Generator<Program> {
  const cmds = cmdsOf(l);
  const items: { it: ProgramItem; cards: number }[] = cmds.map((cmd) => ({ it: { t: 'cmd', cmd }, cards: 1 }));
  if (l.blocks.includes('repeat')) {
    for (const body of sequences(cmds, l.slots!)) for (let n = COUNT_MIN; n <= COUNT_MAX; n++) items.push({ it: { t: 'loop', count: n, body }, cards: body.length });
  }
  const grow = function* (acc: Program, room: number): Generator<Program> {
    if (acc.length) yield acc;
    for (const { it, cards } of items) if (cards <= room) yield* grow([...acc, it], room - cards);
  };
  yield* grow([], l.slots!);
}

describe('the built sheets of 1ro', () => {
  it('are 1, 2, 4, 6 and 8', () => {
    expect(BUILT.map((s) => s.n)).toEqual([1, 2, 4, 6, 8]);
  });

  for (const s of BUILT) {
    it(`sheet ${s.n}: 3 or 4 core levels, 1 or 2 essential, a boss, three doors of extras and a preview`, () => {
      expect(s.core.length).toBeGreaterThanOrEqual(3);
      expect(s.core.length).toBeLessThanOrEqual(4);
      const ess = s.core.filter((c) => c.essential).length;
      expect(ess).toBeGreaterThanOrEqual(1);
      expect(ess).toBeLessThanOrEqual(2);
      expect(s.boss).toBeDefined();
      for (const d of DOORS) expect(s.extras?.[d]).toBeDefined();
      expect(s.preview?.length).toBeGreaterThan(0);
      s.core.forEach((c, i) => {
        expect(c.level.id).toBe(coreId(s, i + 1));
        expect(c.level.page).toBe(i + 1);
      });
      expect(s.boss!.id).toBe(bossId(s));
    });
  }

  it('level ids are unique in the year and never collide with the demo', () => {
    const ids = BUILT.flatMap((s) => levelsOf(s.n).map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(LEVELS.some((l) => l.id === id)).toBe(false);
  });
});

describe('every level of the built sheets', () => {
  for (const s of BUILT) {
    for (const l of levelsOf(s.n)) {
      describe(l.id, () => {
        const b = l.worlds[0];

        it('is a 1ro program page with a sane board', () => {
          expect(l.mode).toBe('program');
          expect(l.blockLabel).toBe('picture-word');
          expect(l.grade).toBe('1ro');
          expect(l.worlds).toHaveLength(1);
          for (const cell of [b.start, b.goal, ...b.pickups]) {
            expect(inside(b, cell.c, cell.r)).toBe(true);
            expect(obstacleAt(b, cell.c, cell.r)).toBeUndefined();
          }
          expect(sameCell(b.start, b.goal)).toBe(false);
          expect(b.goalKind).toBe(b.pickups.length ? 'pot' : 'seed');
        });

        it('its reference solution wins, fits the notebook and uses only its palette', () => {
          expect(simulate(b, l.solution).outcome).toBe('win');
          expect(cardCount(l.solution)).toBeLessThanOrEqual(l.slots!);
          for (const it of l.solution) {
            if (it.t === 'cmd') expect(l.blocks).toContain(it.cmd);
            else { expect(l.blocks).toContain('repeat'); for (const c of it.body) expect(l.blocks).toContain(c); }
          }
        });

        if (!hasLoop(l.solution)) {
          it('flat: the notebook has exactly as many lines as the shortest plan', () => {
            expect(shortestMoves(b)!.length).toBe(l.slots);
            expect(completeProgram(b, [], l.blocks, l.slots!)).not.toBeNull();
          });
        } else {
          it('needs "repetir": no plan without it fits the notebook', () => {
            for (const seq of sequences(cmdsOf(l), l.slots!)) expect(solves(b, cmdProgram(seq))).toBe(false);
          });
        }
      });
    }
  }
});

describe('what each sheet teaches', () => {
  it('1 · a review of sala 5: short flat plans, then seed first and pot after', () => {
    for (const l of levelsOf(1)) expect(hasLoop(l.solution)).toBe(false);
    for (const c of sheetByN(1)!.core) expect(c.level.slots).toBeLessThanOrEqual(6);
    expect(levelsOf(1).some((l) => l.worlds[0].goalKind === 'pot')).toBe(true);
  });

  it('2 · long plans from 8 to 12 steps, with seeds that cost a detour', () => {
    const lens = levelsOf(2).map((l) => l.slots!);
    for (const n of lens) { expect(n).toBeGreaterThanOrEqual(8); expect(n).toBeLessThanOrEqual(12); }
    expect(lens).toContain(12);
    for (const l of levelsOf(2)) {
      const b = l.worlds[0];
      expect(b.pickups.length).toBeGreaterThan(0);
      expect(shortestMoves({ ...b, pickups: [], goalKind: 'seed' })!.length).toBeLessThan(l.slots!);
    }
  });

  it('4 · the demo\'s 1ro-1 and its ghost hand open the sheet; every level repeats one block', () => {
    const s = sheetByN(4)!;
    const demo = levelById('1ro-1')!;
    expect(s.core[0].level.worlds).toEqual(demo.worlds);
    expect(s.core[0].level.intro).toEqual(demo.intro);
    expect(s.concept).toEqual(demo.intro);
    for (const l of s.core.map((c) => c.level)) {
      const loops = l.solution.filter((it) => it.t === 'loop');
      expect(loops).toHaveLength(1);
      if (loops[0].t === 'loop') expect(loops[0].body).toHaveLength(1);
    }
  });

  it('4 · the boss needs two repeats: every program that fits and wins has two', () => {
    const l = sheetByN(4)!.boss!;
    let winners = 0;
    for (const p of programsOf(l)) {
      if (!solves(l.worlds[0], p)) continue;
      winners++;
      expect(p.filter((it) => it.t === 'loop'), JSON.stringify(p)).toHaveLength(2);
    }
    expect(winners).toBeGreaterThan(0);
  });

  it('6 · the demo\'s staircase is in; every winning program repeats a two-block pattern', () => {
    const s = sheetByN(6)!;
    expect(s.core[1].level.worlds).toEqual(levelById('1ro-2')!.worlds);
    for (const l of s.core.map((c) => c.level)) {
      let winners = 0;
      for (const p of programsOf(l)) {
        if (!solves(l.worlds[0], p)) continue;
        winners++;
        expect(p.some((it) => it.t === 'loop' && it.body.length === 2 && new Set(it.body).size === 2), JSON.stringify(p)).toBe(true);
      }
      expect(winners, l.id).toBeGreaterThan(0);
    }
  });

  it('8 · every winning program of the core repeats a three-block pattern', () => {
    for (const c of sheetByN(8)!.core) {
      const l = c.level;
      let winners = 0;
      for (const p of programsOf(l)) {
        if (!solves(l.worlds[0], p)) continue;
        winners++;
        expect(p.some((it) => it.t === 'loop' && it.body.length === 3), JSON.stringify(p)).toBe(true);
      }
      expect(winners, l.id).toBeGreaterThan(0);
    }
  });

  it('6 and 8 · the bosses climb and come down: two repeats of different patterns', () => {
    for (const n of [6, 8]) {
      const loops = sheetByN(n)!.boss!.solution.filter((it) => it.t === 'loop');
      expect(loops).toHaveLength(2);
      expect(JSON.stringify(loops[0])).not.toBe(JSON.stringify(loops[1]));
    }
  });

  it('a new idea is shown by the ghost hand on the first page, and never as the answer', () => {
    for (const n of [4, 6, 8]) {
      const s = sheetByN(n)!;
      const first = s.core[0].level;
      expect(first.intro).toEqual(s.concept);
      expect(solves(first.worlds[0], first.intro!.program)).toBe(false);
    }
  });
});
