// The Workshop's progress (T40), pure: which challenge is open and in which
// PRIMM moment, what each challenge took (runs, failed checks, the help
// level, the predict and investigate answers, the time), the free
// challenges' stars, whether "Tu juego" is in the Arcade (after challenge 5)
// and its best score. Also the telemetry payloads built from it, and the
// edit batcher (workshop_edit is counted per challenge and sent in batches,
// never one event per drag). Persisted with the project (store.ts).

import type { Op } from './blocks';
import { ARCADE_AFTER, CORE, FREE } from './challenges';

/** What an edit was (the editor reports every one; workshop_edit counts them). */
export type EditAction = 'add' | 'move' | 'detach' | 'delete' | 'input' | 'duplicate' | 'copy';
export interface EditInfo { action: EditAction; op: Op; sprite: string; stack_size: number }

export type Phase =
  /** The goal card is open (challenge 1 asks its predict question there, challenge 2 its investigate question). */
  | 'card'
  /** Challenge 1: predicted, waiting for the run that shows it. */
  | 'run'
  /** Challenge 2: tapping the block to blame. */
  | 'investigate'
  /** The answer to predict / investigate, explained. */
  | 'reveal'
  /** Building it: every ▶ is checked. */
  | 'make'
  /** All seven done: the free challenges. */
  | 'free';

export interface ChallengeRec {
  n: number;
  startedAt: number;
  ms: number;
  runs: number;
  /** Runs whose check failed (in the make phase). */
  attempts: number;
  /** The highest help level shown (0–3). */
  help: number;
  solved?: boolean;
  skipped?: boolean;
  predict?: { choice: string; correct: boolean };
  investigate?: { op: string; correct: boolean };
  /** Its `start` was logged (a reload never logs it twice). */
  logged?: boolean;
}

export interface WsProgress {
  v: 1;
  current: number;
  phase: Phase;
  recs: Record<number, ChallengeRec>;
  /** Free challenges solved. */
  free: Record<number, true>;
  /** The free challenge the note shows. */
  focus: number | null;
  /** "Tu juego" is in the Arcade (challenge 5 done). */
  arcade: boolean;
  /** "Tu juego"'s best score (points in one run). */
  best: number;
  /** The scripts as challenge 7 finished (free challenge 13 counts any change from here). */
  baseline: string | null;
  startedAt: number;
}

export const LAST_CORE = CORE[CORE.length - 1].n;

const rec = (n: number, now: number): ChallengeRec => ({ n, startedAt: now, ms: 0, runs: 0, attempts: 0, help: 0 });

export function initialProgress(now: number): WsProgress {
  return { v: 1, current: 1, phase: 'card', recs: { 1: rec(1, now) }, free: {}, focus: null, arcade: false, best: 0, baseline: null, startedAt: now };
}

export const isDone = (r?: ChallengeRec) => !!r && (!!r.solved || !!r.skipped);
export const solvedCount = (p: WsProgress) => CORE.filter((c) => p.recs[c.n]?.solved).length;
export const skippedCount = (p: WsProgress) => CORE.filter((c) => p.recs[c.n]?.skipped).length;
export const coreDone = (p: WsProgress) => CORE.every((c) => isDone(p.recs[c.n]));
export const freeCount = (p: WsProgress) => FREE.filter((c) => p.free[c.n]).length;

/** A challenge's record, updated. */
export function withRec(p: WsProgress, n: number, fn: (r: ChallengeRec) => ChallengeRec, now = Date.now()): WsProgress {
  const r = p.recs[n] ?? rec(n, now);
  return { ...p, recs: { ...p.recs, [n]: fn(r) } };
}

/** The open challenge is done (solved, or skipped): its time is kept, and the next one opens with its card (after the last: the free challenges). */
export function finishCurrent(p: WsProgress, how: 'solved' | 'skipped', now: number, baseline: string | null = null): WsProgress {
  const n = p.current;
  let q = withRec(p, n, (r) => ({ ...r, [how]: true, ms: now - r.startedAt }), now);
  if (n >= ARCADE_AFTER) q = { ...q, arcade: true };
  if (n >= LAST_CORE) return { ...q, current: LAST_CORE + 1, phase: 'free', baseline: q.baseline ?? baseline };
  const next = n + 1;
  return { ...q, current: next, phase: 'card', recs: { ...q.recs, [next]: q.recs[next] ?? rec(next, now) } };
}

/** A free challenge solved (any order, once each). */
export function solveFree(p: WsProgress, n: number): WsProgress {
  return p.free[n] ? p : { ...p, free: { ...p.free, [n]: true } };
}

/** One star per core challenge in the strip: solved, skipped (a hollow star), the open one, or still ahead. */
export function stripOf(p: WsProgress): { n: number; state: 'solved' | 'skipped' | 'here' | 'todo' }[] {
  return CORE.map((c) => {
    const r = p.recs[c.n];
    return { n: c.n, state: r?.solved ? 'solved' : r?.skipped ? 'skipped' : c.n === p.current ? 'here' : 'todo' };
  });
}

// ------------------------------------------------------------------ telemetry payloads

/** `workshop_challenge` for a challenge at one of its moments (docs/prueba-piloto-datos.md). */
export function challengePayload(p: WsProgress, n: number, phase: 'start' | 'predict' | 'investigate' | 'solved' | 'skipped', now: number): Record<string, unknown> {
  const r = p.recs[n] ?? rec(n, now);
  const out: Record<string, unknown> = {
    n, phase, attempts: r.attempts, help_level: r.help, runs: r.runs, ms: phase === 'start' ? 0 : Math.max(0, (r.solved || r.skipped ? r.ms : now - r.startedAt)),
  };
  if (FREE.some((c) => c.n === n)) out.free = true;
  if (r.predict) { out.predict_choice = r.predict.choice; out.predict_correct = r.predict.correct; }
  if (r.investigate) { out.investigate_block = r.investigate.op; out.investigate_correct = r.investigate.correct; }
  return out;
}

export function endPayload(p: WsProgress, now: number): Record<string, unknown> {
  return {
    challenges_solved: solvedCount(p), challenges_skipped: skippedCount(p), free_challenges: freeCount(p), current: p.current,
    arcade: p.arcade, best: p.best, ms: Math.max(0, now - p.startedAt),
  };
}

// ------------------------------------------------------------------ edits, in batches

export const EDIT_ACTIONS: readonly EditAction[] = ['add', 'move', 'detach', 'delete', 'input', 'duplicate', 'copy'];

/**
 * Counts the edits of one challenge; `take()` gives one `workshop_edit`
 * payload with everything since the last take (null when nothing happened).
 * Sent when the challenge ends, when the Workshop closes, and once a minute.
 */
export class EditBatch {
  private counts: Record<string, number> = {};
  private ops: Record<string, Record<string, number>> = {};
  private sprites: Record<string, number> = {};
  private maxStack = 0;
  private edits = 0;

  add(e: EditInfo, spriteName: string): void {
    this.edits++;
    this.counts[e.action] = (this.counts[e.action] ?? 0) + 1;
    const o = (this.ops[e.action] ??= {});
    o[e.op] = (o[e.op] ?? 0) + 1;
    this.sprites[spriteName] = (this.sprites[spriteName] ?? 0) + 1;
    this.maxStack = Math.max(this.maxStack, e.stack_size);
  }
  get size() { return this.edits; }
  take(n: number): Record<string, unknown> | null {
    if (!this.edits) return null;
    const out = { n, edits: this.edits, counts: this.counts, ops: this.ops, sprites: this.sprites, max_stack: this.maxStack };
    this.counts = {}; this.ops = {}; this.sprites = {}; this.maxStack = 0; this.edits = 0;
    return out;
  }
}
