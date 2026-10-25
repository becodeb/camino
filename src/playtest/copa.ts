// Copa de 4to (C03): five kart circuits, each teaching one block concept
// with a single empty slot, raced against honest (fixed-pace) rivals from
// `honestRace.ts` — same honest-rival idea as C02's typing race and block
// race, reused here rather than duplicated. Pure and deterministic (seeded),
// so it is unit-tested (copa.test.ts): circuit generation by seed/variant,
// the per-concept slot check, and the place/margin against the rival tiers
// (a concept-right program beats gold; a concept-wrong one does not).
//
// Each circuit leaves exactly one empty slot (the rest of its program is
// pre-filled, never a blank tape):
//  1. Sequence  — the stretch's last arrow piece is the slot; a wrong guess
//     is a bush bump (reuses race.ts's own Stretch/RoadDir shape).
//  2. Turbo     — one long straight; the slot is "one arrow at a time" vs
//     the real `repetir` block (the turbo).
//  3. Puddle    — `si hay charco: despacio / si no: acelerá`; the slot is
//     the branch at the one puddle piece left for the child.
//  4. Event     — `al aparecer un tronco → saltar`; the slot is the
//     reaction at the one log left for the child.
//  5. Laps      — a 3-lap circuit; the slot is `vueltas` itself (a number
//     chosen from a few options), the lap body already a full right tape.
//
// Score: the child's own finish time depends only on whether the slot ended
// up right, not on anything else (no rubber band — the 4to class explicitly
// asked for races it could lose). A concept-right run is fast enough to beat
// COPA_RIVALS[1] (gold, the fox); a concept-wrong one is not, matching the
// design note ("without turbo the fox wins, with turbo the child can win").
// A wrong guess before the slot is finally right (or the adult's reveal)
// costs time too, so a child who gets there by trial and error still runs
// slower than one who got it in one.

import { generateRace, rng, type RoadDir } from './race';
import { honestFinishMs, type RivalTier } from './honestRace';

export type CircuitId = 1 | 2 | 3 | 4 | 5;
export const CIRCUIT_IDS: readonly CircuitId[] = [1, 2, 3, 4, 5];

export type ConceptReason = 'no_turbo' | 'crashes' | 'skid' | 'log_hit' | 'wrong_laps' | 'slow_idle';

/** The reason that fits each circuit's own slot, when the slot ended up wrong. */
const WRONG_REASON: Readonly<Record<CircuitId, ConceptReason>> = {
  1: 'crashes', 2: 'no_turbo', 3: 'skid', 4: 'log_hit', 5: 'wrong_laps',
};

// ------------------------------------------------------------------ the rivals every circuit races

/** Only two animals race the Copa (the fox is always gold, like the design note says). */
export const COPA_RIVALS: readonly [RivalTier, RivalTier] = ['silver', 'gold'];
/** Course units: a shared, arbitrary length every circuit's pace is measured against. */
export const COPA_FINISH = 20;
/** Clears gold (1.1 units/s, honestRace.ts) when the slot is right; does not when it is wrong. */
export const COPA_PACE = { ok: 1.3, bad: 0.9 } as const;
/** One wrong guess at the slot before it is finally right: this much slower. */
export const COPA_PENALTY_MS = 1200;
/** Thinking this long with nothing placed, after the slot is otherwise right: `slow_idle` instead of a clean win reason. */
export const COPA_IDLE_MS = 4000;

export const rivalsMsFor = (tiers: readonly [RivalTier, RivalTier] = COPA_RIVALS): [number, number] =>
  [honestFinishMs(tiers[0], COPA_FINISH), honestFinishMs(tiers[1], COPA_FINISH)];

// ------------------------------------------------------------------ the result: place, margin, reason

export interface CopaFacts {
  /** The slot ended up right, and not by the adult's reveal (help level 3). */
  conceptOk: boolean;
  /** Wrong tries at the slot before it was right (or revealed). */
  wrongAttempts: number;
  /** Idle ms before the slot was finally filled (0 if it never idled past COPA_IDLE_MS). */
  idleMs: number;
}

export interface CopaResult { place: 1 | 2 | 3; marginMs: number; timeMs: number; reason: ConceptReason | 'fast_and_clean' }

/** The child's own finish time: pure function of the facts, no rubber band. */
export function copaMeMs(f: Pick<CopaFacts, 'conceptOk' | 'wrongAttempts'>): number {
  const pace = f.conceptOk ? COPA_PACE.ok : COPA_PACE.bad;
  return Math.round((COPA_FINISH / pace) * 1000) + Math.max(0, f.wrongAttempts) * COPA_PENALTY_MS;
}

/** Place (1-3) and margin, same tie-break as honestRace.ts (a tie favours the child). */
export function copaPlacement(meMs: number, rivalsMs: readonly [number, number]): { place: 1 | 2 | 3; marginMs: number } {
  const entries: { id: 'me' | 0 | 1; ms: number }[] = [{ id: 'me', ms: meMs }, { id: 0, ms: rivalsMs[0] }, { id: 1, ms: rivalsMs[1] }];
  entries.sort((a, b) => a.ms - b.ms || (a.id === 'me' ? -1 : b.id === 'me' ? 1 : 0));
  const idx = entries.findIndex((e) => e.id === 'me');
  const place = (idx + 1) as 1 | 2 | 3;
  const msOf = (i: number) => entries[i].ms;
  const marginMs = Math.max(0, Math.round(place === 1 ? msOf(idx + 1) - meMs : meMs - msOf(idx - 1)));
  return { place, marginMs };
}

/** Why the result reads the way it does: the circuit's own reason when the slot was wrong, `slow_idle` when it was right but slow, `fast_and_clean` on a clean win. */
export function copaReason(id: CircuitId, f: CopaFacts, place: 1 | 2 | 3): ConceptReason | 'fast_and_clean' {
  if (!f.conceptOk) return WRONG_REASON[id];
  if (place !== 1 || f.idleMs >= COPA_IDLE_MS) return 'slow_idle';
  return 'fast_and_clean';
}

export function copaResult(id: CircuitId, f: CopaFacts, tiers: readonly [RivalTier, RivalTier] = COPA_RIVALS): CopaResult {
  const meMs = copaMeMs(f);
  const rivalsMs = rivalsMsFor(tiers);
  const { place, marginMs } = copaPlacement(meMs, rivalsMs);
  return { place, marginMs, timeMs: meMs, reason: copaReason(id, f, place) };
}

const REASON_WORD: Record<ConceptReason, string> = {
  no_turbo: 'El zorro usó turbo en la recta.',
  crashes: 'Te chocaste con un arbusto.',
  skid: 'Patinaste en el charco.',
  log_hit: 'Te chocaste con el tronco.',
  wrong_laps: 'Dieron mal las vueltas.',
  slow_idle: 'Te quedaste pensando mucho rato.',
};
const PLACE_WORD: Record<1 | 2 | 3, string> = { 1: '1ro', 2: '2do', 3: '3ro' };

/** The result's big, in-screen Spanish line (same shape as honestRace.ts's own `resultLine`). */
export function copaResultLine(r: CopaResult): string {
  const s = Math.round(r.marginMs / 1000);
  if (r.place === 1) return `¡1ro por ${s} s!`;
  return `${PLACE_WORD[r.place]} — te faltaron ${s} s. ${r.reason === 'fast_and_clean' ? '' : REASON_WORD[r.reason as ConceptReason]}`.trim();
}

// ------------------------------------------------------------------ circuit 1: sequence

export interface SequenceCircuit { kind: 'sequence'; road: readonly RoadDir[]; emptySlot: number }

// ------------------------------------------------------------------ circuit 2: repetir = turbo

export interface TurboCircuit { kind: 'turbo'; lead: readonly RoadDir[]; turboLen: number }

// ------------------------------------------------------------------ circuit 3: si hay charco / si no

export type PuddlePiece = 'dry' | 'puddle';
export interface PuddleCircuit { kind: 'puddle'; pieces: readonly PuddlePiece[]; slotIndex: number }

// ------------------------------------------------------------------ circuit 4: al aparecer un tronco -> saltar

export type EventPiece = 'plain' | 'log';
export interface EventCircuit { kind: 'event'; pieces: readonly EventPiece[]; slotIndex: number }

// ------------------------------------------------------------------ circuit 5: la variable vueltas

export interface LapsCircuit { kind: 'laps'; lapRoad: readonly RoadDir[]; options: readonly number[]; correctLaps: number }

export type CircuitDef = SequenceCircuit | TurboCircuit | PuddleCircuit | EventCircuit | LapsCircuit;

/** Deterministic: the same (id, seed, variant) always draws the same circuit ("¡Otra carrera!" bumps `variant`). */
export function generateCircuit(id: CircuitId, seed: number, variant = 0): CircuitDef {
  const s = (Math.max(1, Math.floor(seed) || 1) + variant * 7919) >>> 0 || 1;
  switch (id) {
    case 1: {
      const def = generateRace(1, s);
      const road = def.stretches[def.stretches.length - 1].road;
      return { kind: 'sequence', road, emptySlot: road.length - 1 };
    }
    case 2: {
      const r = rng(s);
      const leadLen = 1 + Math.floor(r() * 2); // 1-2 pieces before the straight
      const lead: RoadDir[] = Array.from({ length: leadLen }, () => 'right');
      const turboLen = 4 + Math.floor(r() * 3); // 4-6, same as race.ts's own TURBO_LEN
      return { kind: 'turbo', lead, turboLen };
    }
    case 3: {
      const r = rng(s);
      const n = 5;
      const pieces: PuddlePiece[] = Array.from({ length: n }, () => (r() < 0.45 ? 'puddle' : 'dry'));
      if (!pieces.includes('puddle')) pieces[2] = 'puddle';
      const idxs = pieces.reduce<number[]>((a, p, i) => (p === 'puddle' ? [...a, i] : a), []);
      return { kind: 'puddle', pieces, slotIndex: idxs[idxs.length - 1] };
    }
    case 4: {
      const r = rng(s);
      const n = 5;
      const pieces: EventPiece[] = Array.from({ length: n }, () => (r() < 0.4 ? 'log' : 'plain'));
      if (!pieces.includes('log')) pieces[3] = 'log';
      const idxs = pieces.reduce<number[]>((a, p, i) => (p === 'log' ? [...a, i] : a), []);
      return { kind: 'event', pieces, slotIndex: idxs[idxs.length - 1] };
    }
    case 5: {
      const def = generateRace(1, s);
      const longest = def.stretches.reduce((best, st) => (st.road.length > best.road.length ? st : best), def.stretches[0]);
      return { kind: 'laps', lapRoad: longest.road, options: [2, 3, 4], correctLaps: 3 };
    }
  }
}

/** Every rule a circuit breaks (none for a good one): what generateCircuit guarantees. */
export function circuitProblems(id: CircuitId, def: CircuitDef): string[] {
  const out: string[] = [];
  if (def.kind === 'sequence') {
    if (!def.road.length) out.push('sequence: empty road');
    if (def.emptySlot !== def.road.length - 1) out.push('sequence: the slot is not the last piece');
  } else if (def.kind === 'turbo') {
    if (def.turboLen < 4 || def.turboLen > 6) out.push(`turbo: length ${def.turboLen}`);
    if (!def.lead.length) out.push('turbo: no lead-in before the straight');
  } else if (def.kind === 'puddle') {
    if (def.slotIndex < 0 || def.pieces[def.slotIndex] !== 'puddle') out.push('puddle: the slot is not a puddle piece');
    if (!def.pieces.includes('puddle')) out.push('puddle: no puddle at all');
  } else if (def.kind === 'event') {
    if (def.slotIndex < 0 || def.pieces[def.slotIndex] !== 'log') out.push('event: the slot is not a log piece');
    if (!def.pieces.includes('log')) out.push('event: no log at all');
  } else if (def.kind === 'laps') {
    if (!def.options.includes(def.correctLaps)) out.push('laps: the correct count is not among the options');
    if (!def.lapRoad.length) out.push('laps: empty lap body');
  }
  if (id === 1 && def.kind !== 'sequence') out.push('circuit 1 is not a sequence circuit');
  if (id === 2 && def.kind !== 'turbo') out.push('circuit 2 is not a turbo circuit');
  if (id === 3 && def.kind !== 'puddle') out.push('circuit 3 is not a puddle circuit');
  if (id === 4 && def.kind !== 'event') out.push('circuit 4 is not an event circuit');
  if (id === 5 && def.kind !== 'laps') out.push('circuit 5 is not a laps circuit');
  return out;
}

// ------------------------------------------------------------------ checking the one slot

/** Whether a choice at the circuit's one slot is the concept-right one. */
export function checkSlotChoice(def: CircuitDef, choice: string | number): boolean {
  if (def.kind === 'sequence') return choice === def.road[def.emptySlot];
  if (def.kind === 'turbo') return choice === 'turbo';
  if (def.kind === 'puddle') return choice === 'slow';
  if (def.kind === 'event') return choice === 'jump';
  return choice === def.correctLaps;
}

// ------------------------------------------------------------------ medals (a circuit's own best place so far)

export type Medal = 1 | 2 | 3 | undefined;
export const medalLabel: Record<1 | 2 | 3, string> = { 1: 'oro', 2: 'plata', 3: 'bronce' };
