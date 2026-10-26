import { describe, expect, it } from 'vitest';
import { simulate, TIMING } from './sim';
import { ALL_TRACKS, trackById } from './tracks';
import { activeFrame, FALL_MS, moveDuration, rivalPos, stateAt, stateAtStep, stepsOf } from './playback';
import { programBuilder } from './program';
import { ancestorsOf } from './editor';
import { reasonText, seconds } from './labels';

const gold = (id: string) => trackById(id)!.refs.gold;

describe('stateAt', () => {
  it('starts at the start line and ends at the finish', () => {
    const track = trackById('c1-a')!;
    const sim = simulate(gold('c1-a'), track, 7);
    const first = stateAt(sim, 0);
    expect(first.pos).toBe(0);
    expect(first.blockId).toBe(sim.timeline.find((f) => f.kind === 'exec')!.blockId);
    const end = stateAt(sim, sim.timeMs);
    expect(end.pos).toBe(sim.total);
    expect(end.finished).toBe(true);
    expect(end.crashed).toBe(false);
  });

  it('the kart moves forward and never back, over the whole run, on every track', () => {
    for (const track of ALL_TRACKS) {
      const sim = simulate(track.refs.gold, track, 11);
      let prev = -1;
      for (let t = 0; t <= sim.timeMs; t += 50) {
        const s = stateAt(sim, t);
        expect(s.pos).toBeGreaterThanOrEqual(prev);
        expect(s.pos).toBeLessThanOrEqual(sim.total);
        prev = s.pos;
      }
    }
  });

  it('a move is spread over its duration, a jump lifts the kart and comes back', () => {
    const b = programBuilder('t');
    const track = trackById('c1-a')!; // '-uudd---', puddle on tile 6
    const sim = simulate({ main: [b.forward(), b.up(), b.up(), b.down(), b.down(), b.forward(), b.jump(), b.forward()] }, track, 1);
    expect(sim.outcome).toBe('finish');
    const jump = sim.timeline.find((f) => f.action === 'jump')!;
    expect(stateAt(sim, jump.t).lift).toBe(0);
    const mid = stateAt(sim, jump.t + jump.dur / 2);
    expect(mid.lift).toBeCloseTo(1, 1);
    expect(mid.action).toBe('jump');
    expect(mid.pos).toBeGreaterThan(jump.from);
    expect(mid.pos).toBeLessThan(jump.to);
    expect(stateAt(sim, jump.t + jump.dur).lift).toBe(0);
  });

  it('a skid arrives first and then spins in place', () => {
    const track = trackById('c1-a')!;
    const sim = simulate(track.refs.bronze, track, 1);
    const skid = sim.timeline.find((f) => f.fx.includes('skid'))!;
    const arrive = stateAt(sim, skid.t + moveDuration(skid) + 10);
    expect(arrive.pos).toBe(skid.to);
    expect(arrive.skidding).toBe(true);
    expect(stateAt(sim, skid.t + 10).skidding).toBe(false);
    expect(stateAt(sim, skid.t + skid.dur + 1).skidding).toBe(false);
  });

  it('turbo and brake are only on while their frame lasts', () => {
    const track = trackById('c5-a')!;
    const sim = simulate(gold('c5-a'), track, 3);
    const execs = sim.timeline.filter((f) => f.kind === 'exec');
    const i = execs.findIndex((f, k) => f.fx.includes('turbo') && !execs[k + 1]?.fx.includes('turbo'));
    const turbo = execs[i];
    expect(stateAt(sim, turbo.t + 1).turbo).toBe(true);
    expect(stateAt(sim, turbo.t + turbo.dur + 1).turbo).toBe(false);
  });

  it('a crash stops the kart at the tile it tried to enter', () => {
    const track = trackById('c1-a')!;
    const b = programBuilder('t');
    const sim = simulate({ main: [b.forward(), b.forward()] }, track, 1); // tile 1 is a rise: avanzar crashes
    expect(sim.outcome).toBe('crash');
    const s = stateAt(sim, sim.timeMs + 500);
    expect(s.crashed).toBe(true);
    expect(s.finished).toBe(false);
    expect(s.pos).toBe(sim.crash!.tile);
    expect(s.blockId).toBe(sim.crash!.blockId);
  });

  it('a stuck run keeps the kart where the program ended', () => {
    const track = trackById('c1-a')!;
    const b = programBuilder('t');
    const sim = simulate({ main: [b.forward()] }, track, 1);
    expect(sim.outcome).toBe('stuck');
    const s = stateAt(sim, sim.timeMs + 1000);
    expect(s.pos).toBe(1);
    expect(s.finished).toBe(false);
    expect(s.crashed).toBe(false);
  });

  it('logs show from the moment they fall until they are gone', () => {
    const track = trackById('c4-a')!;
    const sim = simulate(gold('c4-a'), track, 5);
    expect(sim.logs.length).toBeGreaterThan(0);
    const l = sim.logs[0];
    expect(stateAt(sim, l.fallMs - 1).logs).toEqual([]);
    const during = stateAt(sim, l.fallMs + FALL_MS + 5).logs;
    expect(during).toEqual([{ tile: l.tile, age: FALL_MS + 5 }]);
    expect(stateAt(sim, l.expiresAt + 1).logs).toEqual([]);
  });

  it('activeFrame is the last block that started', () => {
    const track = trackById('c1-a')!;
    const sim = simulate(gold('c1-a'), track, 1);
    const execs = sim.timeline.filter((f) => f.kind === 'exec');
    expect(activeFrame(sim, execs[2].t)?.frame).toBe(execs[2]);
    expect(activeFrame(sim, -5)).toBeNull();
  });
});

describe('rivals', () => {
  it('drive evenly and reach the finish exactly at their target time', () => {
    expect(rivalPos(10_000, 8, 0)).toBe(0);
    expect(rivalPos(10_000, 8, 5000)).toBe(4);
    expect(rivalPos(10_000, 8, 10_000)).toBe(8);
    expect(rivalPos(10_000, 8, 99_999)).toBe(8);
  });
});

describe('step by step', () => {
  it('one step per block that acts, in clock order, with the decisions that led to it', () => {
    const track = trackById('c3-a')!;
    const program = gold('c3-a');
    const sim = simulate(program, track, 4);
    const steps = stepsOf(sim, program);
    expect(steps.length).toBe(sim.timeline.filter((f) => f.kind === 'exec').length);
    expect(steps.every((s, i) => i === 0 || steps[i - 1].frame.t <= s.frame.t)).toBe(true);
    expect(steps[0].caption[0]).toBe('Repetir: vuelta 1 de 10.');
    expect(steps[0].caption[1]).toMatch(/^¿Hay un charco adelante\? (Sí|No)\.$/);
    expect(steps[0].caption[2]).toMatch(/^Bloque «(saltar|avanzar)»/);
    // the lit block's containers are the loop and the si
    const first = steps[0];
    expect(first.around).toEqual(ancestorsOf(program, first.blockId!));
    expect(first.around).toHaveLength(2);
  });

  it('a crash is its own last step and says so', () => {
    const track = trackById('c1-a')!;
    const b = programBuilder('t');
    const program = { main: [b.forward(), b.forward()] };
    const sim = simulate(program, track, 1);
    const steps = stepsOf(sim, program);
    expect(steps[steps.length - 1].caption).toContain('¡Chocó!');
    expect(steps[steps.length - 1].blockId).toBe(sim.crash!.blockId);
  });

  it('the event script\'s blocks are marked as such', () => {
    const track = trackById('c4-a')!;
    const program = gold('c4-a');
    const sim = simulate(program, track, 9);
    const steps = stepsOf(sim, program);
    const ev = steps.filter((s) => s.frame.script === 'event');
    expect(ev.length).toBeGreaterThan(0);
    expect(ev[0].caption.join(' ')).toContain('cuando cae un tronco');
  });

  it('stateAtStep stays inside its step', () => {
    const track = trackById('c1-a')!;
    const program = gold('c1-a');
    const sim = simulate(program, track, 1);
    const steps = stepsOf(sim, program);
    const s = steps[2];
    const a = stateAtStep(sim, s, 0);
    const b = stateAtStep(sim, s, 1);
    expect(a.pos).toBe(s.frame.from);
    expect(b.pos).toBeCloseTo(s.frame.to, 2);
    expect(a.blockId).toBe(s.blockId);
    expect(b.blockId).toBe(s.blockId);
  });
});

describe('words', () => {
  it('seconds uses a decimal comma', () => {
    expect(seconds(5400)).toBe('5,4 s');
    expect(seconds(-1250)).toBe('1,3 s');
  });

  it('reason lines are truthful about what happened', () => {
    const base = { rivalName: 'el zorro', rivalIsFox: true, skids: 2, sputters: 1, wastedJumps: 3 };
    expect(reasonText('skids', base)).toBe('Patinaste 2 veces en charcos.');
    expect(reasonText('no_turbo', base)).toBe('El zorro usó turbo en las rectas.');
    expect(reasonText('no_turbo', { ...base, rivalIsFox: false })).toContain('turbo');
    expect(reasonText('wasted_jumps', base)).toContain('3 veces');
    expect(reasonText('slow', { ...base, rivalName: 'el coatí' })).toBe('Tu programa anduvo bien, pero el coatí fue más rápido.');
  });

  it('TIMING sanity: a skid frame lasts longer than its movement', () => {
    expect(TIMING.SKID_MS).toBeGreaterThan(0);
  });
});
