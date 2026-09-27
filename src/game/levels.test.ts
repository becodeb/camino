import { describe, expect, it } from 'vitest';
import { completeProgram, shortestMoves, simulate, solves } from './engine';
import { GRADES, LEVELS, levelsOf, nextLevel } from './levels';
import { cardCount, cmdProgram, inside, obstacleAt, sameCell, type Program } from './model';

const commandsOf = (p: Program) => p.flatMap((it) => (it.t === 'cmd' ? [it.cmd] : it.body));
const loopsOf = (p: Program) => p.filter((it) => it.t === 'loop');

describe('every level', () => {
  it('has a unique id and a known grade, at most two pages per grade', () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
    for (const g of GRADES) expect(levelsOf(g.id).length).toBeLessThanOrEqual(2);
    for (const l of LEVELS) expect(GRADES.some((g) => g.id === l.grade)).toBe(true);
  });

  for (const level of LEVELS) {
    describe(level.id, () => {
      it('has sane boards: start, goal, pickups inside and free', () => {
        expect(level.worlds.length).toBeGreaterThan(0);
        for (const b of level.worlds) {
          for (const cell of [b.start, b.goal, ...b.pickups]) {
            expect(inside(b, cell.c, cell.r)).toBe(true);
            expect(obstacleAt(b, cell.c, cell.r)).toBeUndefined();
          }
          expect(sameCell(b.start, b.goal)).toBe(false);
          if (b.pickups.length) expect(b.goalKind).toBe('pot');
        }
      });

      it('its reference solution wins in every world', () => {
        for (const b of level.worlds) expect(simulate(b, level.solution).outcome).toBe('win');
      });

      it('the solution only uses blocks from its palette', () => {
        for (const cmd of commandsOf(level.solution)) expect(level.blocks).toContain(cmd);
        for (const loop of loopsOf(level.solution)) {
          expect(level.blocks).toContain(loop.t === 'loop' && loop.count === 'goal' ? 'repeat-goal' : 'repeat');
        }
      });

      if (level.mode === 'program') {
        it('the solution fits in the notebook, and the notebook is not bigger than needed', () => {
          expect(level.slots).toBeGreaterThan(0);
          expect(cardCount(level.solution)).toBeLessThanOrEqual(level.slots!);
          if (!loopsOf(level.solution).length) {
            // flat levels: the slots are exactly the shortest path, so the limit means something
            expect(shortestMoves(level.worlds[0])!.length).toBe(level.slots);
            expect(completeProgram(level.worlds[0], [], level.blocks, level.slots!)).not.toBeNull();
          }
        });
      }
    });
  }
});

describe('the approved level ideas', () => {
  it('sala 4 · 2: the straight line bumps into the rock', () => {
    const b = LEVELS.find((l) => l.id === 'sala4-2')!.worlds[0];
    expect(simulate(b, cmdProgram(['right', 'right', 'right', 'right'])).outcome).toBe('crash');
  });

  it('sala 5 · 2: going straight to the pot bumps its lid, the seed comes first', () => {
    const l = LEVELS.find((x) => x.id === 'sala5-2')!;
    const b = l.worlds[0];
    expect(simulate(b, cmdProgram(['right', 'right', 'right'])).outcome).toBe('crash');
    expect(solves(b, l.solution)).toBe(true);
    expect(cardCount(l.solution)).toBe(5);
  });

  it('pages chain in tramo order', () => {
    expect(nextLevel('sala4-1')?.id).toBe('sala4-2');
    expect(nextLevel('sala4-2')?.id).toBe('sala5-1');
    const last = LEVELS[LEVELS.length - 1];
    expect(nextLevel(last.id)).toBeNull();
  });
});
