// Copa v2 garage: playing a `SimResult` back. The engine returns a timeline of
// frames on the run's own clock; the screen animates it with
// `stateAt(sim, t)` (the race, at some speed) or step by step (the
// "Ver paso a paso" debugging tool: one block per press). Pure: given the
// result and a time, where is everything.

import { TIMING, type Frame, type SimResult } from './sim';
import type { Leaf, Program } from './program';
import { findBlock } from './program';
import { ancestorsOf } from './editor';
import { BLOCK_LABEL, SENSOR_QUESTION } from './labels';

export interface LogView {
  /** The absolute tile the log lies on. */
  tile: number;
  /** ms since it started to fall (under FALL_MS it is still in the air). */
  age: number;
}

/** A log takes this long to drop onto the road. */
export const FALL_MS = 450;

export interface SceneState {
  /** Tiles completed, fractional (the kart's place on the road). */
  pos: number;
  /** 0..1: how high above the road a jump has lifted the kart. */
  lift: number;
  action: Leaf['kind'] | null;
  turbo: boolean;
  /** The kart is spinning in a puddle (after the move itself). */
  skidding: boolean;
  sputter: boolean;
  braking: boolean;
  /** The block that is running now (the leaf), and its containers. */
  blockId: string | null;
  script: 'main' | 'event' | null;
  crashed: boolean;
  finished: boolean;
  logs: LogView[];
}


/** How long the movement part of a frame lasts (a skid keeps the kart spinning after it has arrived). */
export const moveDuration = (f: Frame): number => (f.fx.includes('skid') ? Math.max(1, f.dur - TIMING.SKID_MS) : f.dur);

/** The frame that is on (the last exec/crash frame that has started by `t`) and its index. */
export function activeFrame(sim: SimResult, t: number): { frame: Frame; index: number } | null {
  let hit = -1;
  for (let i = 0; i < sim.timeline.length; i++) {
    const f = sim.timeline[i];
    if (f.t > t) break;
    if (f.kind === 'exec' || f.kind === 'crash') hit = i;
  }
  return hit < 0 ? null : { frame: sim.timeline[hit], index: hit };
}

/** Everything on screen at run-clock time `t` (ms). */
export function stateAt(sim: SimResult, t: number): SceneState {
  const act = activeFrame(sim, t);
  const finishFrame = sim.timeline.find((f) => f.kind === 'finish');
  const crashFrame = sim.timeline.find((f) => f.kind === 'crash');
  const logs: LogView[] = sim.logs
    .filter((l) => t >= l.fallMs && t < l.expiresAt)
    .map((l) => ({ tile: l.tile, age: t - l.fallMs }));
  const base: SceneState = {
    pos: 0, lift: 0, action: null, turbo: false, skidding: false, sputter: false, braking: false,
    blockId: null, script: null, crashed: false, finished: false, logs,
  };
  if (!act) return base;
  const f = act.frame;
  const into = t - f.t;
  if (f.kind === 'crash') return { ...base, pos: f.tile ?? f.from, blockId: f.blockId, script: f.script, crashed: true };
  const mDur = moveDuration(f);
  const frac = f.to > f.from ? Math.min(1, into / mDur) : 0;
  const inFrame = into < f.dur;
  return {
    ...base,
    pos: f.from + (f.to - f.from) * frac,
    lift: f.fx.includes('jump') && inFrame ? Math.sin(Math.PI * Math.min(1, into / f.dur)) : 0,
    action: f.action ?? null,
    turbo: f.fx.includes('turbo') && inFrame,
    skidding: f.fx.includes('skid') && into >= mDur && inFrame,
    sputter: f.fx.includes('sputter') && inFrame,
    braking: f.fx.includes('brake') && inFrame,
    blockId: f.blockId,
    script: f.script,
    finished: !!finishFrame && t >= finishFrame.t,
    crashed: !!crashFrame && t >= crashFrame.t,
  };
}

/** Where a rival is, in tiles, `t` ms into the race: it drives its target time evenly from the start line to the finish. */
export const rivalPos = (targetMs: number, total: number, t: number): number => Math.max(0, Math.min(total, (t / Math.max(1, targetMs)) * total));

// ------------------------------------------------------------------ step by step

export interface Step {
  /** Index of the frame in the timeline. */
  index: number;
  frame: Frame;
  /** The block to light (null for the finish). */
  blockId: string | null;
  /** The containers around it, lit softly. */
  around: string[];
  /** What to say: what was decided just before, and what the kart does now. */
  caption: string[];
}

const ACTION_TEXT: Readonly<Record<Leaf['kind'], string>> = {
  forward: 'Avanza un lugar.', up: 'Sube la rampa.', down: 'Baja la rampa.', jump: 'Salta.', turbo: 'Turbo: avanza rápido.',
  brake: 'Frena.', wait: 'Espera.',
};

/** The frames "Ver paso a paso" goes through: every block that moves or stops the kart, and the crash. */
export function stepsOf(sim: SimResult, program: Program): Step[] {
  const out: Step[] = [];
  sim.timeline.forEach((f, index) => {
    if (f.kind !== 'exec' && f.kind !== 'crash') return;
    const caption: string[] = [];
    // the decisions taken right before this block (same clock tick, same script)
    for (let j = index - 1; j >= 0 && sim.timeline[j].t === f.t && sim.timeline[j].dur === 0; j--) {
      const d = sim.timeline[j];
      if (d.kind === 'loop') {
        const b = d.blockId ? findBlock(program, d.blockId) : null;
        const n = b && b.kind === 'repeat' && typeof b.n === 'number' ? b.n : null;
        caption.unshift(n != null ? `Repetir: vuelta ${d.round} de ${n}.` : `Repetir: vuelta ${d.round}.`);
      } else if (d.kind === 'check') {
        const b = d.blockId ? findBlock(program, d.blockId) : null;
        const q = b && b.kind === 'if' ? b.cond.map((s) => SENSOR_QUESTION[s]).join(' y ') : '¿Se cumple?';
        caption.unshift(`${q} ${d.result ? 'Sí' : 'No'}.`);
      } else if (d.kind === 'set') {
        caption.unshift(`Nitro ahora vale ${d.nitro}.`);
      }
    }
    if (f.kind === 'crash') {
      caption.push('¡Chocó!');
    } else {
      const label = f.action ? BLOCK_LABEL[f.action] : '';
      const where = f.script === 'event' ? ' (cuando cae un tronco)' : '';
      caption.push(`Bloque «${label}»${where}. ${f.action ? ACTION_TEXT[f.action] : ''}${f.fx.includes('skid') ? ' ¡Patina en el charco!' : ''}${f.fx.includes('sputter') ? ' El turbo se quedó sin nafta.' : ''}`.trim());
    }
    out.push({ index, frame: f, blockId: f.blockId, around: f.blockId ? ancestorsOf(program, f.blockId) : [], caption });
  });
  return out;
}

/** The scene while step `step` is `frac` (0..1) through: the clock advances only inside that frame. */
export function stateAtStep(sim: SimResult, step: Step, frac: number): SceneState {
  const f = step.frame;
  const t = f.t + Math.min(0.999, Math.max(0, frac)) * f.dur;
  return stateAt(sim, t);
}
