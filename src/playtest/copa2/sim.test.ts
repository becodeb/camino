import { describe, expect, it } from 'vitest';
import { programBuilder, type Program } from './program';
import { TIMING, simulate } from './sim';
import { parseTiles, worldFor, validateTrack, type TrackDef } from './track';

const { MOVE_MS, UP_MS, DOWN_MS, JUMP_MS, TURBO_MS, BRAKE_MS, WAIT_UNIT_MS, SKID_MS, SPUTTER_MS } = TIMING;

/** A throwaway track for the engine tests (the real copas are in tracks.test.ts). */
const track = (spec: string, over: Partial<TrackDef> = {}): TrackDef => ({
  id: 't', copa: 1, name: 't', tiles: parseTiles(spec), laps: 1, slots: 99, puddles: { fixed: [] }, ...over,
});

describe('a run that finishes', () => {
  it('takes the sum of its steps and ends on the line', () => {
    const b = programBuilder('p');
    const r = simulate({ main: [b.repeat(5, [b.forward()])] }, track('-----'), 1);
    expect(r.outcome).toBe('finish');
    expect(r.timeMs).toBe(5 * MOVE_MS);
    expect(r.pos).toBe(5);
    expect(r.crash).toBeUndefined();
    expect(r.stats).toMatchObject({ moves: 5, skids: 0, jumps: 0, turbos: 0 });
    expect(r.timeline.at(-1)).toMatchObject({ kind: 'finish', t: 5 * MOVE_MS });
  });

  it('subir and bajar climb and drop the kart, and each costs its own time', () => {
    const b = programBuilder('p');
    const p: Program = { main: [b.forward(), b.up(), b.up(), b.down(), b.down(), b.forward()] };
    const r = simulate(p, track('-uudd-'), 1);
    expect(r.outcome).toBe('finish');
    expect(r.timeMs).toBe(2 * MOVE_MS + 2 * UP_MS + 2 * DOWN_MS);
    const heights = r.timeline.filter((f) => f.kind === 'exec').map((f) => f.h);
    expect(heights).toEqual([0, 1, 2, 1, 0, 0]);
  });

  it('frenar and esperar take their time and do not move the kart', () => {
    const b = programBuilder('p');
    const r = simulate({ main: [b.brake(), b.wait(2), b.forward()] }, track('-'), 1);
    expect(r.timeMs).toBe(BRAKE_MS + 2 * WAIT_UNIT_MS + MOVE_MS);
    expect(r.stats.brakes).toBe(1);
    expect(r.stats.waitMs).toBe(2 * WAIT_UNIT_MS);
  });

  it('decision blocks take no time but show up in the timeline for "Ver paso a paso"', () => {
    const b = programBuilder('p');
    const loop = b.repeat(2, [b.forward()]);
    const r = simulate({ main: [loop] }, track('--'), 1);
    const frames = r.timeline.filter((f) => f.blockId === loop.id);
    expect(frames.map((f) => [f.kind, f.dur, f.round])).toEqual([['loop', 0, 1], ['loop', 0, 2]]);
    expect(r.timeMs).toBe(2 * MOVE_MS);
  });
});

describe('a run that does not finish', () => {
  it('stuck: the program ends before the line', () => {
    const b = programBuilder('p');
    const r = simulate({ main: [b.repeat(3, [b.forward()])] }, track('-----'), 1);
    expect(r.outcome).toBe('stuck');
    expect(r.pos).toBe(3);
    expect(r.timeMs).toBe(3 * MOVE_MS);
  });

  it('an empty program is stuck at the start', () => {
    const r = simulate({ main: [] }, track('--'), 1);
    expect(r).toMatchObject({ outcome: 'stuck', pos: 0, timeMs: 0 });
  });

  it('timeout: a runaway program stops the run (a safety net)', () => {
    const b = programBuilder('p');
    const r = simulate({ main: [b.repeat(99, [b.repeat(99, [b.repeat(99, [])])])] }, track('--'), 1);
    expect(r.outcome).toBe('timeout');
  });

  it('timeout: a run that goes on for minutes', () => {
    const b = programBuilder('p');
    const r = simulate({ main: [b.repeat(99, [b.wait(9)]), b.forward()] }, track('-'), 1);
    expect(r.outcome).toBe('timeout');
    expect(r.timeMs).toBeGreaterThanOrEqual(TIMING.TIMEOUT_MS);
  });
});

describe('crashes name the block that caused them', () => {
  it('avanzar into a ramp up is a wall', () => {
    const b = programBuilder('p');
    const bad = b.forward();
    const r = simulate({ main: [b.forward(), bad, b.forward()] }, track('-u-'), 1);
    expect(r.outcome).toBe('crash');
    expect(r.crash).toEqual({ blockId: bad.id, tile: 1, cause: 'wall' });
    expect(r.timeMs).toBe(MOVE_MS);
    expect(r.timeline.at(-1)).toMatchObject({ kind: 'crash', blockId: bad.id });
  });

  it('avanzar or saltar into a drop is a drop crash; saltar into a ramp is a wall', () => {
    const b = programBuilder('p');
    const f = b.forward();
    expect(simulate({ main: [f] }, track('d'), 1).crash).toEqual({ blockId: f.id, tile: 0, cause: 'drop' });
    const j = b.jump();
    expect(simulate({ main: [j] }, track('d'), 1).crash?.cause).toBe('drop');
    expect(simulate({ main: [j] }, track('u'), 1).crash?.cause).toBe('wall');
  });

  it('subir or bajar where there is no such ramp is a crash', () => {
    const b = programBuilder('p');
    const u = b.up();
    expect(simulate({ main: [u] }, track('-'), 1).crash).toEqual({ blockId: u.id, tile: 0, cause: 'no_ramp' });
    expect(simulate({ main: [u] }, track('d'), 1).crash?.cause).toBe('no_ramp');
    const d = b.down();
    expect(simulate({ main: [d] }, track('u'), 1).crash?.cause).toBe('no_ramp');
  });

  it('inside a `repetir`, the crash is reported on the inner block, not the container', () => {
    const b = programBuilder('p');
    const inner = b.up();
    const loop = b.repeat(3, [b.forward(), inner]);
    const r = simulate({ main: [loop] }, track('-u-u-d'), 1);
    expect(r.crash?.blockId).toBe(inner.id);
    expect(r.crash?.tile).toBe(5);
  });
});

describe('puddles: a skid is time lost, not a crash', () => {
  const puddle = track('---', { puddles: { fixed: [1] } });

  it('avanzar over a puddle skids', () => {
    const b = programBuilder('p');
    const r = simulate({ main: [b.repeat(3, [b.forward()])] }, puddle, 1);
    expect(r.outcome).toBe('finish');
    expect(r.stats.skids).toBe(1);
    expect(r.timeMs).toBe(3 * MOVE_MS + SKID_MS);
    expect(r.timeline.find((f) => f.fx.includes('skid'))?.to).toBe(2);
  });

  it('saltar flies over it; jumping where there is no puddle works but wastes time', () => {
    const b = programBuilder('p');
    const smart: Program = { main: [b.forward(), b.jump(), b.forward()] };
    const r = simulate(smart, puddle, 1);
    expect(r.stats).toMatchObject({ skids: 0, jumps: 1, wastedJumps: 0 });
    expect(r.timeMs).toBe(2 * MOVE_MS + JUMP_MS);
    const always = simulate({ main: [b.repeat(3, [b.jump()])] }, puddle, 1);
    expect(always.stats).toMatchObject({ skids: 0, jumps: 3, wastedJumps: 2 });
    expect(always.timeMs).toBe(3 * JUMP_MS);
    expect(always.timeMs).toBeGreaterThan(r.timeMs);
    expect(always.timeMs).toBeLessThan(3 * MOVE_MS + SKID_MS); // jumping everywhere still beats skidding once
  });

  it('puddles are drawn from the seed: the same count, a different place', () => {
    const t = track('-'.repeat(12), { puddles: { count: 3, minGap: 2 } });
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const w = worldFor(t, seed);
      expect(w.puddles.size).toBe(3);
      const xs = [...w.puddles].sort((a, c) => a - c);
      expect(xs.every((x, i) => i === 0 || x - xs[i - 1] >= 2)).toBe(true);
      expect(xs[0]).toBeGreaterThanOrEqual(1);
      seen.add(xs.join(','));
      expect([...worldFor(t, seed).puddles]).toEqual([...w.puddles]); // deterministic
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  it('puddles never sit on a ramp or a straight', () => {
    const t = track('-u-d=-==-', { puddles: { count: 2, minGap: 1 } });
    for (let seed = 1; seed <= 40; seed++) for (const x of worldFor(t, seed).puddles) expect([2, 5, 8]).toContain(x);
  });

  it('each lap draws its own puddles', () => {
    const t = track('-'.repeat(10), { laps: 3, puddles: { count: 2, minGap: 2 } });
    const w = worldFor(t, 5);
    expect(w.puddles.size).toBe(6);
    const perLap = [0, 1, 2].map((l) => [...w.puddles].filter((x) => Math.floor(x / 10) === l).map((x) => x % 10).join(','));
    expect(new Set(perLap).size).toBeGreaterThan(1);
  });
});

describe('turbo and nitro', () => {
  const straight = track('=-==', { nitro: 2 });

  it('turbo covers a straight tile in half the time; on a plain tile it is just avanzar', () => {
    const b = programBuilder('p');
    const r = simulate({ main: [b.turbo(), b.turbo(), b.turbo(), b.turbo()] }, track('=-==', { nitro: 9 }), 1);
    expect(r.timeMs).toBe(TURBO_MS + MOVE_MS + 2 * TURBO_MS);
    expect(r.stats).toMatchObject({ turbos: 3, sputters: 0 });
  });

  it('the tank holds the track\'s nitro cans: with it empty the engine sputters', () => {
    const b = programBuilder('p');
    const r = simulate({ main: [b.turbo(), b.turbo(), b.turbo(), b.turbo()] }, straight, 1);
    expect(r.stats).toMatchObject({ turbos: 2, sputters: 1 });
    expect(r.timeMs).toBe(TURBO_MS + MOVE_MS + TURBO_MS + MOVE_MS + SPUTTER_MS);
  });

  it('a track without nitro has an unlimited turbo', () => {
    const b = programBuilder('p');
    const r = simulate({ main: [b.repeat(4, [b.turbo()])] }, track('===='), 1);
    expect(r.stats.turbos).toBe(4);
  });

  it('the `nitro` variable starts at the cans and changes with `cambiar nitro`; the sensor reads it', () => {
    const b = programBuilder('p');
    const p: Program = { main: [b.repeat(4, [b.iff(['straight_ahead', 'nitro_positive'], [b.turbo(), b.nitro(-1)], [b.forward()])])] };
    const r = simulate(p, straight, 1);
    expect(r.stats).toMatchObject({ turbos: 2, sputters: 0, nitroLeft: 0 });
    // tile 0 and tile 2 were straights with nitro; tile 1 plain; tile 3 a straight with the nitro gone
    expect(r.timeMs).toBe(TURBO_MS + MOVE_MS + TURBO_MS + MOVE_MS);
  });

  it('forgetting to count nitro empties the real tank anyway (the sputter shows it)', () => {
    const b = programBuilder('p');
    const p: Program = { main: [b.repeat(4, [b.iff(['straight_ahead', 'nitro_positive'], [b.turbo()], [b.forward()])])] };
    const r = simulate(p, straight, 1);
    expect(r.stats).toMatchObject({ turbos: 2, sputters: 1, nitroLeft: 2 });
  });
});

describe('`si` and `repetir vueltas`', () => {
  it('`si charco adelante` looks at the tile in front of the kart', () => {
    const b = programBuilder('p');
    const loop = b.repeat(3, [b.iff('puddle_ahead', [b.jump()], [b.forward()])]);
    const r = simulate({ main: [loop] }, track('---', { puddles: { fixed: [1] } }), 1);
    expect(r.stats).toMatchObject({ skids: 0, jumps: 1, wastedJumps: 0 });
    const checks = r.timeline.filter((f) => f.kind === 'check');
    expect(checks.map((f) => f.result)).toEqual([false, true, false]);
  });

  it('`y` needs every sensor to hold', () => {
    const b = programBuilder('p');
    const both = b.iff(['straight_ahead', 'puddle_ahead'], [b.jump()], [b.forward()]);
    const r = simulate({ main: [both] }, track('='), 1);
    expect(r.timeline.find((f) => f.kind === 'check')?.result).toBe(false);
  });

  it('nested `si` inside `si no`', () => {
    const b = programBuilder('p');
    const p: Program = { main: [b.repeat(3, [b.iff('straight_ahead', [b.turbo()], [b.iff('puddle_ahead', [b.jump()], [b.forward()])])])] };
    const r = simulate(p, track('=--', { puddles: { fixed: [2] } }), 1);
    expect(r.outcome).toBe('finish');
    expect(r.stats).toMatchObject({ turbos: 1, jumps: 1, skids: 0 });
  });

  it('`repetir vueltas` runs the body once per lap; the lap counts in absolute tiles', () => {
    const b = programBuilder('p');
    const r = simulate({ main: [b.repeat('laps', [b.repeat(2, [b.forward()])])] }, track('--', { laps: 3 }), 1);
    expect(r.outcome).toBe('finish'); // 3 laps x 2 tiles = 6 tiles
    expect(r.pos).toBe(6);
    const once = simulate({ main: [b.repeat(2, [b.forward()])] }, track('--', { laps: 3 }), 1);
    expect(once.outcome).toBe('stuck'); // forgetting the laps: only the first one is driven
    expect(once.pos).toBe(2);
  });
});

describe('logs fall at a random time and the event script handles them', () => {
  const road = track('-'.repeat(14), { logs: { count: 1, windowMs: [1500, 3500] }, puddles: { fixed: [] } });
  const drive = (b: ReturnType<typeof programBuilder>) => b.repeat(14, [b.forward()]);

  it('the log falls inside the window, on the tile in front of the kart, and the world draws it', () => {
    const b = programBuilder('p');
    const r = simulate({ main: [drive(b)] }, road, 4);
    expect(r.logs).toHaveLength(1);
    expect(r.logs[0].fallMs).toBeGreaterThanOrEqual(1500);
    expect(r.logs[0].fallMs).toBeLessThanOrEqual(3500);
    expect(r.timeline.some((f) => f.kind === 'log_fall')).toBe(true);
    expect([...Array(40)].map((_, s) => worldFor(road, s + 1).logFalls[0])).toSatisfy((xs: number[]) => new Set(xs).size > 10);
  });

  it('without the event script the next move runs into the log: a crash on (almost) every seed', () => {
    const b = programBuilder('p');
    const prog: Program = { main: [drive(b)] };
    let crashes = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = simulate(prog, road, seed);
      if (r.outcome === 'crash') { crashes++; expect(r.crash?.cause).toBe('log'); }
    }
    expect(crashes).toBe(40);
  });

  it('`cuando cae un tronco: frenar, esperar 1` never crashes, on any seed', () => {
    const b = programBuilder('p');
    const prog: Program = { main: [drive(b)], onLog: b.onLog([b.brake(), b.wait(1)]) };
    for (let seed = 1; seed <= 60; seed++) {
      const r = simulate(prog, road, seed);
      expect(r.outcome, `seed ${seed}`).toBe('finish');
      expect(r.stats.eventRuns).toBe(1);
      expect(r.timeMs).toBe(14 * MOVE_MS + BRAKE_MS + WAIT_UNIT_MS);
    }
  });

  it('an event script that does not wait long enough still crashes (frenar alone is not enough)', () => {
    const b = programBuilder('p');
    const prog: Program = { main: [drive(b)], onLog: b.onLog([b.brake()]) };
    expect(simulate(prog, road, 3).crash?.cause).toBe('log');
    const waitOnly: Program = { main: [drive(b)], onLog: b.onLog([b.wait(2)]) };
    expect(simulate(waitOnly, road, 3).outcome).toBe('finish');
  });

  it('the main script keeps its place: the event runs between two main blocks and the main carries on', () => {
    const b = programBuilder('p');
    const hat = b.onLog([b.brake(), b.wait(1)]);
    const r = simulate({ main: [drive(b)], onLog: hat }, road, 2);
    const scripts = r.timeline.filter((f) => f.kind === 'exec').map((f) => f.script);
    const first = scripts.indexOf('event');
    expect(first).toBeGreaterThan(0);
    expect(scripts.slice(first, first + 2)).toEqual(['event', 'event']);
    expect(scripts.filter((s) => s === 'main')).toHaveLength(14);
    expect(r.timeline.find((f) => f.kind === 'log_fall')?.blockId).toBe(hat.id);
  });

  it('a crash inside the event script is reported on the event\'s own block (driving on into the log)', () => {
    const b = programBuilder('p');
    const bad = b.forward();
    const r = simulate({ main: [drive(b)], onLog: b.onLog([bad]) }, road, 2);
    expect(r.crash).toMatchObject({ blockId: bad.id, cause: 'log' });
  });

  it('a log that falls with no room left (the kart is almost at the line) misses the road', () => {
    const b = programBuilder('p');
    const late = track('--', { logs: { count: 1, windowMs: [5000, 5000] } });
    const r = simulate({ main: [b.repeat(2, [b.forward()])] }, late, 1);
    expect(r.outcome).toBe('finish');
    expect(r.logs).toHaveLength(0);
  });
});

describe('determinism and the timeline', () => {
  it('the same program, track and seed give the very same result', () => {
    const b = programBuilder('p');
    const t = track('-'.repeat(10), { puddles: { count: 3, minGap: 2 }, logs: { count: 1, windowMs: [1000, 3000] } });
    const prog: Program = { main: [b.repeat(10, [b.iff('puddle_ahead', [b.jump()], [b.forward()])])], onLog: b.onLog([b.brake(), b.wait(1)]) };
    const a = simulate(prog, t, 77);
    expect(simulate(prog, t, 77)).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(simulate(prog, t, 78).puddles).not.toEqual(a.puddles);
  });

  it('the timeline is in clock order and each exec frame continues where the last move stopped', () => {
    const b = programBuilder('p');
    const t = track('-'.repeat(10), { puddles: { count: 3, minGap: 2 }, logs: { count: 1, windowMs: [1000, 3000] } });
    const r = simulate({ main: [b.repeat(10, [b.iff('puddle_ahead', [b.jump()], [b.forward()])])], onLog: b.onLog([b.brake(), b.wait(1)]) }, t, 9);
    for (let i = 1; i < r.timeline.length; i++) expect(r.timeline[i].t).toBeGreaterThanOrEqual(r.timeline[i - 1].t);
    const moves = r.timeline.filter((f) => f.kind === 'exec' && f.to > f.from);
    moves.forEach((f, i) => expect(f.from).toBe(i));
    expect(moves.at(-1)?.to).toBe(10);
  });
});

describe('validateTrack', () => {
  it('flags a lap that does not end on the ground, bad puddles and heights out of range', () => {
    expect(validateTrack(track('--'))).toEqual([]);
    expect(validateTrack(track('-u'))).toContain('a lap must end at ground level');
    expect(validateTrack(track('d-u'))[0]).toMatch(/height out of range/);
    expect(validateTrack(track('-u-d', { puddles: { fixed: [1] } }))[0]).toMatch(/puddle 1/);
    expect(validateTrack(track('--', { puddles: { count: 3, minGap: 1 } }))).toContain('not enough room for the puddles');
  });
});
