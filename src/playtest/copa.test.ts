import { describe, expect, it } from 'vitest';
import {
  CIRCUIT_IDS, checkSlotChoice, circuitProblems, copaMeMs, copaPlacement, copaResult, copaResultLine, generateCircuit, rivalsMsFor,
  type CircuitId,
} from './copa';
import { HONEST_PACE } from './honestRace';

describe('generateCircuit', () => {
  it('draws a valid circuit for every id over many seeds and variants', () => {
    for (const id of CIRCUIT_IDS) {
      for (let seed = 1; seed <= 60; seed++) {
        for (const variant of [0, 1, 2]) {
          const def = generateCircuit(id, seed, variant);
          expect(circuitProblems(id, def)).toEqual([]);
        }
      }
    }
  });

  it('is deterministic: same id/seed/variant draws the same circuit', () => {
    const a = generateCircuit(3, 42, 1);
    const b = generateCircuit(3, 42, 1);
    expect(a).toEqual(b);
  });

  it('"¡Otra carrera!" (a new variant) tends to draw a different circuit', () => {
    const ids: CircuitId[] = [1, 2, 3, 4, 5];
    for (const id of ids) {
      const seen = new Set(Array.from({ length: 5 }, (_, v) => JSON.stringify(generateCircuit(id, 7, v))));
      expect(seen.size).toBeGreaterThan(1);
    }
  });

  it('circuit 1 leaves exactly the stretch\'s last piece empty', () => {
    const def = generateCircuit(1, 5, 0);
    if (def.kind !== 'sequence') throw new Error('expected sequence');
    expect(def.emptySlot).toBe(def.road.length - 1);
  });

  it('circuit 2\'s turbo straight is 4-6 pieces, same as race.ts\'s own TURBO_LEN', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const def = generateCircuit(2, seed, 0);
      if (def.kind !== 'turbo') throw new Error('expected turbo');
      expect(def.turboLen).toBeGreaterThanOrEqual(4);
      expect(def.turboLen).toBeLessThanOrEqual(6);
    }
  });

  it('circuit 3 always has at least one puddle, and the slot sits on one', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const def = generateCircuit(3, seed, 0);
      if (def.kind !== 'puddle') throw new Error('expected puddle');
      expect(def.pieces).toContain('puddle');
      expect(def.pieces[def.slotIndex]).toBe('puddle');
    }
  });

  it('circuit 4 always has at least one log, and the slot sits on one', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const def = generateCircuit(4, seed, 0);
      if (def.kind !== 'event') throw new Error('expected event');
      expect(def.pieces).toContain('log');
      expect(def.pieces[def.slotIndex]).toBe('log');
    }
  });

  it('circuit 5 offers the correct lap count (3) among its options', () => {
    const def = generateCircuit(5, 9, 0);
    if (def.kind !== 'laps') throw new Error('expected laps');
    expect(def.options).toContain(3);
    expect(def.correctLaps).toBe(3);
  });
});

describe('checkSlotChoice', () => {
  it('judges the sequence slot against the stretch\'s own last piece', () => {
    const def = generateCircuit(1, 11, 0);
    if (def.kind !== 'sequence') throw new Error('expected sequence');
    const right = def.road[def.emptySlot];
    const wrong = (['right', 'up', 'down'] as const).find((d) => d !== right)!;
    expect(checkSlotChoice(def, right)).toBe(true);
    expect(checkSlotChoice(def, wrong)).toBe(false);
  });

  it('judges turbo/puddle/event/laps slots', () => {
    expect(checkSlotChoice(generateCircuit(2, 1, 0), 'turbo')).toBe(true);
    expect(checkSlotChoice(generateCircuit(2, 1, 0), 'single')).toBe(false);
    expect(checkSlotChoice(generateCircuit(3, 1, 0), 'slow')).toBe(true);
    expect(checkSlotChoice(generateCircuit(3, 1, 0), 'fast')).toBe(false);
    expect(checkSlotChoice(generateCircuit(4, 1, 0), 'jump')).toBe(true);
    expect(checkSlotChoice(generateCircuit(4, 1, 0), 'none')).toBe(false);
    expect(checkSlotChoice(generateCircuit(5, 1, 0), 3)).toBe(true);
    expect(checkSlotChoice(generateCircuit(5, 1, 0), 2)).toBe(false);
  });
});

describe('the honest result (no rubber band)', () => {
  const rivalsMs = rivalsMsFor();

  it('a concept-right, clean run beats gold', () => {
    const ms = copaMeMs({ conceptOk: true, wrongAttempts: 0 });
    expect(ms).toBeLessThan(rivalsMs[1]);
  });

  it('a concept-wrong run loses to gold', () => {
    const ms = copaMeMs({ conceptOk: false, wrongAttempts: 0 });
    expect(ms).toBeGreaterThan(rivalsMs[1]);
  });

  it('every circuit\'s own id: concept right wins 1st, concept wrong does not', () => {
    for (const id of CIRCUIT_IDS) {
      const won = copaResult(id, { conceptOk: true, wrongAttempts: 0, idleMs: 0 });
      const lost = copaResult(id, { conceptOk: false, wrongAttempts: 0, idleMs: 0 });
      expect(won.place).toBe(1);
      expect(won.reason).toBe('fast_and_clean');
      expect(lost.place).not.toBe(1);
    }
  });

  it('each circuit\'s wrong reason matches its own concept', () => {
    expect(copaResult(1, { conceptOk: false, wrongAttempts: 0, idleMs: 0 }).reason).toBe('crashes');
    expect(copaResult(2, { conceptOk: false, wrongAttempts: 0, idleMs: 0 }).reason).toBe('no_turbo');
    expect(copaResult(3, { conceptOk: false, wrongAttempts: 0, idleMs: 0 }).reason).toBe('skid');
    expect(copaResult(4, { conceptOk: false, wrongAttempts: 0, idleMs: 0 }).reason).toBe('log_hit');
    expect(copaResult(5, { conceptOk: false, wrongAttempts: 0, idleMs: 0 }).reason).toBe('wrong_laps');
  });

  it('a slow but concept-right win reads as slow_idle instead of fast_and_clean', () => {
    const r = copaResult(1, { conceptOk: true, wrongAttempts: 0, idleMs: 9000 });
    expect(r.place).toBe(1);
    expect(r.reason).toBe('slow_idle');
  });

  it('enough wrong attempts before getting it right costs enough time to drop a place', () => {
    const clean = copaResult(1, { conceptOk: true, wrongAttempts: 0, idleMs: 0 });
    const messy = copaResult(1, { conceptOk: true, wrongAttempts: 5, idleMs: 0 });
    expect(clean.place).toBe(1);
    expect(messy.place).toBeGreaterThan(1);
  });

  it('a tie favours the child (copaPlacement)', () => {
    const rivals: [number, number] = [10_000, 12_000];
    expect(copaPlacement(10_000, rivals).place).toBe(1);
  });

  it('honestRace.ts\'s own gold pace sits strictly between COPA_PACE.bad and COPA_PACE.ok', () => {
    expect(HONEST_PACE.gold).toBeGreaterThan(0.9);
    expect(HONEST_PACE.gold).toBeLessThan(1.3);
  });

  it('copaResultLine reads a real place and margin', () => {
    const r = copaResult(2, { conceptOk: true, wrongAttempts: 0, idleMs: 0 });
    expect(copaResultLine(r)).toMatch(/^¡1ro por \d+ s!$/);
    const lost = copaResult(2, { conceptOk: false, wrongAttempts: 0, idleMs: 0 });
    expect(copaResultLine(lost)).toContain('usó turbo');
  });
});
