// Copa v2: the SIMULATION. `simulate(program, track, seed)` runs the kart's
// program on a track and returns what happened: how it ended, how long it
// took, where and why it crashed, a timeline for the UI to animate ("Ver
// paso a paso" lights each block as its frame comes up) and some stats.
// Pure and deterministic: the same program, track and seed always give the
// same result (the seed draws the puddles and the logs' falling times).
//
// How a run goes:
// - The main script runs block by block. Blocks that move the kart or make
//   it wait take time (TIMING below); `repetir`, `si` and `cambiar nitro` are
//   decisions and take none (their frames have `dur: 0`).
// - A LEAF block is the move the kart actually makes: avanzar, subir, bajar,
//   saltar, turbo, frenar, esperar. Each is checked against the next tile:
//     avanzar / turbo / saltar into a ramp up or down tile -> crash (`wall` /
//       `drop`: the program drives into a step it should have climbed);
//     subir / bajar where there is no such ramp -> crash (`no_ramp`);
//     avanzar / turbo over a puddle -> a skid (time lost, NOT a crash);
//     saltar onto a puddle -> flies over it, no skid.
// - Turbo covers a tile in half the time, but only on a straight tile. On a
//   track with nitro the tank holds `nitro` cans, one used per turbo tile:
//   with the tank empty the engine sputters (a normal tile plus a little time).
//   The `nitro` VARIABLE is the program's own bookkeeping (`cambiar nitro en
//   -1`, `si nitro > 0`): forget to count and the tank runs dry anyway.
// - A LOG falls at a random moment (the world's `logFalls`) on the tile
//   right in front of the kart. The kart finishes the move it is making;
//   then, before the next main block, the event script (`cuando cae un
//   tronco`) runs, taking over from the main script until it is done. The log
//   stays LOG_MS. If a main block tries to enter that tile while the log is
//   there: crash (`log`): without an event script the next move always does,
//   and an event script that does not wait long enough (just `frenar`) does too.
// - The run ends when: the kart crosses the finish line (`finish`), a block
//   crashes it (`crash`), the program ends before the line (`stuck`), or it
//   goes on for too long (`timeout`, a safety net).

import { MAX_REPEAT, MAX_WAIT, type Block, type Leaf, type Program, type Sensor } from './program';
import { tileAt, totalTiles, worldFor, type TrackDef, type World } from './track';

/** Step timing, in milliseconds (the numbers every reference time is made of). */
export const TIMING = {
  /** avanzar onto a flat tile. */
  MOVE_MS: 600,
  /** subir: climbing is slower. */
  UP_MS: 800,
  /** bajar. */
  DOWN_MS: 500,
  /** saltar: a little slower than driving (so jumping everywhere is safe, not optimal). */
  JUMP_MS: 700,
  /** turbo on a straight: half of MOVE_MS. */
  TURBO_MS: 300,
  /** frenar. */
  BRAKE_MS: 300,
  /** esperar 1 = this long. */
  WAIT_UNIT_MS: 1000,
  /** Extra time of a skid over a puddle (on top of the move). Longer than a jump costs, so jumping a puddle always pays. */
  SKID_MS: 1200,
  /** Extra time when turbo is asked with an empty tank (the move itself is a normal one). */
  SPUTTER_MS: 200,
  /** A log stays on the road this long after the kart reaches the block boundary where it falls. frenar + esperar 1 = 1300 clears it. */
  LOG_MS: 1200,
  /** The run is called a timeout after this. */
  TIMEOUT_MS: 300_000,
} as const;

/** Frames beyond this are a runaway program (a `repetir` inside a `repetir` of nothing): a timeout. */
export const MAX_FRAMES = 20_000;

export type Outcome = 'finish' | 'crash' | 'stuck' | 'timeout';
export type CrashCause = 'wall' | 'drop' | 'no_ramp' | 'log';
export type Fx = 'skid' | 'jump' | 'turbo' | 'sputter' | 'brake' | 'crash';

export interface Frame {
  /** ms from the start of the run when this starts. */
  t: number;
  /** How long it lasts (0 for a decision block). */
  dur: number;
  kind: 'exec' | 'check' | 'loop' | 'set' | 'log_fall' | 'log_gone' | 'crash' | 'finish';
  /** Which script the block belongs to (null for the world's own frames). */
  script: 'main' | 'event' | null;
  /** The block that is running (UI highlights it); the event's frames carry the hat's id for `log_fall`. */
  blockId: string | null;
  /** exec frames: the block kind. */
  action?: Leaf['kind'];
  /** Tiles completed before / after this frame (absolute: lap * tiles + i). */
  from: number;
  to: number;
  /** The kart's height (tile units) at the end of the frame. */
  h: number;
  fx: Fx[];
  /** check: whether the condition held. loop: which round (1-based). set: the variable's new value. log_fall: the tile the log lands on (absolute). */
  result?: boolean;
  round?: number;
  nitro?: number;
  tile?: number;
}

export interface Crash {
  blockId: string;
  /** The absolute tile (lap * tiles + i) the kart was trying to enter. */
  tile: number;
  cause: CrashCause;
}

export interface Stats {
  /** Blocks in the program (program.ts `slotCount`) are counted by the caller; these are what the run did. */
  moves: number;
  skids: number;
  jumps: number;
  /** Jumps onto tiles with no puddle (they cost time for nothing). */
  wastedJumps: number;
  turbos: number;
  sputters: number;
  brakes: number;
  waitMs: number;
  /** Times the event script ran. */
  eventRuns: number;
  /** Final value of the `nitro` variable. */
  nitroLeft: number;
}

export interface SimResult {
  outcome: Outcome;
  /** The run's own clock when it ended: the finish time for `finish`. */
  timeMs: number;
  crash?: Crash;
  timeline: Frame[];
  stats: Stats;
  /** Tiles the kart completed. */
  pos: number;
  total: number;
  seed: number;
  /** The run's randomness, for drawing it: puddles (absolute tile index) and the logs that actually fell. */
  puddles: number[];
  logs: { fallMs: number; tile: number; expiresAt: number }[];
}

class Runaway extends Error {}

const clampRepeat = (n: number) => Math.max(0, Math.min(MAX_REPEAT, Math.floor(n) || 0));
const clampWait = (n: number) => Math.max(1, Math.min(MAX_WAIT, Math.floor(n) || 1));

export function simulate(program: Program, track: TrackDef, seed: number): SimResult {
  const world: World = worldFor(track, seed);
  const total = totalTiles(track);
  const timeline: Frame[] = [];
  const stats: Stats = { moves: 0, skids: 0, jumps: 0, wastedJumps: 0, turbos: 0, sputters: 0, brakes: 0, waitMs: 0, eventRuns: 0, nitroLeft: 0 };
  const logs: SimResult['logs'] = [];

  let t = 0;
  let pos = 0;
  let h = 0;
  let nitro = track.nitro ?? 0;
  /** Cans left in the tank (the variable above is the program's own count). Unlimited when the track has no nitro. */
  let tank = track.nitro ?? Infinity;
  let nextFall = 0;
  let pendingEvents = 0;
  let outcome: Outcome | null = null;
  let crash: Crash | undefined;

  const frame = (f: Omit<Frame, 'from' | 'to' | 'h' | 'fx'> & Partial<Pick<Frame, 'from' | 'to' | 'h' | 'fx'>>) => {
    if (timeline.length >= MAX_FRAMES) throw new Runaway();
    timeline.push({ from: pos, to: pos, h, fx: [], ...f });
  };

  const sensor = (s: Sensor): boolean => {
    if (s === 'puddle_ahead') return pos < total && world.puddles.has(pos);
    if (s === 'straight_ahead') return pos < total && tileAt(track, pos).straight;
    return nitro > 0;
  };

  /** Logs whose time has come land on the tile in front of the kart (not the first, not the finish tile). */
  const landLogs = () => {
    while (nextFall < world.logFalls.length && world.logFalls[nextFall] <= t) {
      const fallMs = world.logFalls[nextFall++];
      if (pos < 1 || pos >= total - 1) continue; // no room: it misses the road
      const entry = { fallMs, tile: pos, expiresAt: t + TIMING.LOG_MS };
      logs.push(entry);
      pendingEvents++;
      frame({ t: fallMs, dur: 0, kind: 'log_fall', script: null, blockId: program.onLog?.id ?? null, tile: pos });
    }
  };
  const logAt = (tile: number) => logs.find((l) => l.tile === tile && t < l.expiresAt);

  function* walk(blocks: readonly Block[], script: 'main' | 'event'): Generator<Leaf, void, void> {
    for (const b of blocks) {
      if (b.kind === 'repeat') {
        const n = b.n === 'laps' ? track.laps : clampRepeat(b.n);
        for (let i = 1; i <= n; i++) {
          frame({ t, dur: 0, kind: 'loop', script, blockId: b.id, round: i });
          yield* walk(b.body, script);
        }
      } else if (b.kind === 'if') {
        const holds = b.cond.length > 0 && b.cond.every(sensor);
        frame({ t, dur: 0, kind: 'check', script, blockId: b.id, result: holds });
        yield* walk(holds ? b.then : b.else, script);
      } else if (b.kind === 'nitro') {
        nitro += b.delta;
        frame({ t, dur: 0, kind: 'set', script, blockId: b.id, nitro });
      } else {
        yield b;
      }
    }
  }

  /** Does one leaf block. Returns false when the run is over (crash or finish). */
  const perform = (leaf: Leaf, script: 'main' | 'event'): boolean => {
    const fx: Fx[] = [];
    const base = { t, script, blockId: leaf.id, kind: 'exec' as const, action: leaf.kind };

    if (leaf.kind === 'brake') {
      stats.brakes++;
      frame({ ...base, dur: TIMING.BRAKE_MS, fx: ['brake'] });
      t += TIMING.BRAKE_MS;
      return true;
    }
    if (leaf.kind === 'wait') {
      const ms = clampWait(leaf.n) * TIMING.WAIT_UNIT_MS;
      stats.waitMs += ms;
      frame({ ...base, dur: ms });
      t += ms;
      return true;
    }

    // a move: onto tile `pos`
    const tile = tileAt(track, pos);
    const fail = (cause: CrashCause): false => {
      crash = { blockId: leaf.id, tile: pos, cause };
      outcome = 'crash';
      frame({ ...base, dur: 0, kind: 'crash', fx: ['crash'], tile: pos });
      return false;
    };
    if (logAt(pos)) return fail('log');
    let dur: number;
    if (leaf.kind === 'up') {
      if (tile.kind !== 'rise') return fail('no_ramp');
      dur = TIMING.UP_MS;
    } else if (leaf.kind === 'down') {
      if (tile.kind !== 'drop') return fail('no_ramp');
      dur = TIMING.DOWN_MS;
    } else {
      if (tile.kind === 'rise') return fail('wall');
      if (tile.kind === 'drop') return fail('drop');
      const puddle = world.puddles.has(pos);
      if (leaf.kind === 'jump') {
        dur = TIMING.JUMP_MS;
        fx.push('jump');
        stats.jumps++;
        if (!puddle) stats.wastedJumps++;
      } else {
        dur = TIMING.MOVE_MS;
        if (leaf.kind === 'turbo' && tile.straight) {
          if (tank > 0) { dur = TIMING.TURBO_MS; fx.push('turbo'); stats.turbos++; tank--; }
          else { dur += TIMING.SPUTTER_MS; fx.push('sputter'); stats.sputters++; }
        }
        if (puddle) { dur += TIMING.SKID_MS; fx.push('skid'); stats.skids++; }
      }
    }
    stats.moves++;
    const from = pos;
    pos++;
    h += tile.kind === 'rise' ? 1 : tile.kind === 'drop' ? -1 : 0;
    frame({ ...base, dur, from, to: pos, h, fx });
    t += dur;
    if (pos >= total) {
      outcome = 'finish';
      frame({ t, dur: 0, kind: 'finish', script: null, blockId: null });
      return false;
    }
    return true;
  };

  /** Runs the event script as many times as logs have fallen, before the next main block. */
  const runEvents = (): boolean => {
    while (pendingEvents > 0) {
      pendingEvents--;
      if (!program.onLog) continue;
      stats.eventRuns++;
      for (const leaf of walk(program.onLog.body, 'event')) {
        if (t >= TIMING.TIMEOUT_MS) { outcome = 'timeout'; return false; }
        if (!perform(leaf, 'event')) return false;
        landLogs();
      }
    }
    return true;
  };

  try {
    const main = walk(program.main, 'main');
    for (;;) {
      const next = main.next();
      if (next.done) { outcome = 'stuck'; break; }
      landLogs();
      if (!runEvents()) break;
      if (t >= TIMING.TIMEOUT_MS) { outcome = 'timeout'; break; }
      if (!perform(next.value, 'main')) break;
      landLogs();
    }
  } catch (e) {
    if (!(e instanceof Runaway)) throw e;
    outcome = 'timeout';
  }

  stats.nitroLeft = nitro;
  // the world's own frames (a log falling) carry the moment they happened: keep the timeline in clock order (the sort is stable)
  timeline.sort((a, b) => a.t - b.t);
  return {
    outcome: outcome ?? 'stuck', timeMs: t, ...(crash ? { crash } : {}), timeline, stats, pos, total, seed,
    puddles: [...world.puddles].sort((a, b) => a - b), logs,
  };
}
