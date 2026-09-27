import { describe, expect, it } from 'vitest';
import { completeProgram, shortestMoves, simulate, solves, solvesAll } from './engine';
import { COUNT_MAX, COUNT_MIN } from './hint';
import { GRADES, LEVELS, levelById, levelsOf, nextLevel, type LevelDef } from './levels';
import { cardCount, cmdProgram, inside, obstacleAt, sameCell, visibleFrom, type Program, type ProgramItem } from './model';

const commandsOf = (p: Program) => p.flatMap((it) => (it.t === 'cmd' ? [it.cmd] : it.body));
const loopsOf = (p: Program) => p.filter((it) => it.t === 'loop');
const level = (id: string) => levelById(id)!;
const cmdsOf = (l: LevelDef) => l.blocks.filter((b) => b !== 'repeat' && b !== 'repeat-goal');

/** Every sequence of `alphabet` of length 1..max. */
function* sequences(alphabet: readonly string[], max: number): Generator<string[]> {
  let layer: string[][] = [[]];
  for (let n = 1; n <= max; n++) {
    layer = layer.flatMap((s) => alphabet.map((a) => [...s, a]));
    yield* layer;
  }
}

/** Every program the notebook of `l` can hold: its palette, loops with one level of nesting, at most `slots` cards. */
function* programsOf(l: LevelDef): Generator<Program> {
  const cmds = cmdsOf(l);
  const counts: (number | 'goal')[] = [];
  if (l.blocks.includes('repeat')) for (let n = COUNT_MIN; n <= COUNT_MAX; n++) counts.push(n);
  if (l.blocks.includes('repeat-goal')) counts.push('goal');
  const items: { it: ProgramItem; cards: number }[] = cmds.map((cmd) => ({ it: { t: 'cmd', cmd }, cards: 1 }));
  for (const body of sequences(cmds, l.slots!)) for (const count of counts) items.push({ it: { t: 'loop', count, body }, cards: body.length });
  const grow = function* (acc: Program, room: number): Generator<Program> {
    if (acc.length) yield acc;
    for (const { it, cards } of items) if (cards <= room) yield* grow([...acc, it], room - cards);
  };
  yield* grow([], l.slots!);
}

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
          const goal = b.goalKind === 'none' ? [] : [b.goal];
          for (const cell of [b.start, ...goal, ...b.pickups]) {
            expect(inside(b, cell.c, cell.r)).toBe(true);
            expect(obstacleAt(b, cell.c, cell.r)).toBeUndefined();
          }
          if (b.goalKind !== 'none') expect(sameCell(b.start, b.goal)).toBe(false);
          else expect(level.realtime?.win.kind).toBe('score');
          if (b.pickups.length) expect(b.goalKind).toBe('pot');
        }
      });

      if (level.mode !== 'realtime') {
        it('its reference solution wins in every world', () => {
          for (const b of level.worlds) expect(simulate(b, level.solution).outcome).toBe('win');
        });
      } else {
        it('is a game of rules (its reference rules are played in rules.test)', () => {
          expect(level.realtime).toBeDefined();
          expect(level.solution).toEqual([]);
        });
      }

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

describe('1ro and 2do: loops are needed', () => {
  for (const id of ['1ro-1', '1ro-2', '2do-1', '2do-2']) {
    it(`${id}: no program without a loop fits the notebook and wins`, () => {
      const l = level(id);
      for (const seq of sequences(cmdsOf(l), l.slots!)) expect(solvesAll(l.worlds, cmdProgram(seq))).toBe(false);
    });
  }

  it('1ro · 1: eight steps, three lines; the ghost hand\'s repeat is the idea, not the answer', () => {
    const l = level('1ro-1');
    expect(shortestMoves(l.worlds[0])).toHaveLength(8);
    expect(l.slots).toBe(3);
    expect(solves(l.worlds[0], l.intro!.program)).toBe(false);
    expect(l.intro!.after).toBe('full');
  });

  it('1ro · 2: every program that fits and wins climbs with a repeat of → and ↑, at least four passes', () => {
    const l = level('1ro-2');
    let winners = 0;
    for (const p of programsOf(l)) {
      if (!solves(l.worlds[0], p)) continue;
      winners++;
      const stair = p.find((it) => it.t === 'loop' && it.body.length === 2 && it.body.includes('right') && it.body.includes('up'));
      expect(stair, JSON.stringify(p)).toBeDefined();
      expect((stair as { count: number }).count).toBeGreaterThanOrEqual(4);
    }
    expect(winners).toBeGreaterThan(0);
  });

  it('2do · 1: in the fog, Brote first sees neither the seed nor any rock', () => {
    const l = level('2do-1');
    const b = l.worlds[0];
    expect(l.fog).toBe(true);
    const seen = visibleFrom(b, b.start);
    expect(seen.some((c) => sameCell(c, b.goal))).toBe(false);
    expect(seen.some((c) => obstacleAt(b, c.c, c.r))).toBe(false);
    // walking on until the seed bumps into the first rock: the "if" is needed
    expect(simulate(b, l.intro!.program).outcome).toBe('crash');
  });

  it('2do · 2: the three worlds differ, and no fixed list of steps and jumps works in all three', () => {
    const l = level('2do-2');
    expect(l.worlds).toHaveLength(3);
    const shapes = l.worlds.map((b) => JSON.stringify([b.goal, b.obstacles.map((o) => o.c)]));
    expect(new Set(shapes).size).toBe(3);
    for (const seq of sequences(['right', 'jump:right'], 10)) expect(solvesAll(l.worlds, cmdProgram(seq))).toBe(false);
    // even the loop without the "if", or with it after the step, fails somewhere
    expect(solvesAll(l.worlds, [{ t: 'loop', count: 'goal', body: ['right'] }])).toBe(false);
    expect(solvesAll(l.worlds, [{ t: 'loop', count: 'goal', body: ['right', 'ifrock:right'] }])).toBe(false);
  });

  it('2do · 2: the programs that fit and win all check for a rock before stepping', () => {
    const l = level('2do-2');
    for (const p of programsOf(l)) {
      if (!solvesAll(l.worlds, p)) continue;
      const loop = p.find((it) => it.t === 'loop');
      expect(loop).toBeDefined();
      expect(commandsOf(p)).toContain('ifrock:right');
    }
  });
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
