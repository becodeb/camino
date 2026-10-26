import { describe, expect, it } from 'vitest';
import { checkProgram, findBlock, programBuilder, replaceBlock, slotCount, type Block, type Program } from './program';
import { simulate } from './sim';
import { tileAt, validateTrack, worldFor } from './track';
import {
  ALL_TRACKS, COPAS, COPA_IDS, PALETTES, SLOTS, TARGET_MARGIN_MS, TIERS, copaOf, foxProgram, referenceTimes, rivalTargets, trackById,
  type Tier, type TrackSpec,
} from './tracks';

const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

/** The child beats a rival iff the child's time is below the rival's target. */
const beats = (track: TrackSpec, ms: number, rival: Tier) => ms < rivalTargets(track)[rival];

describe('the five copas', () => {
  it('are five, with 2 or 3 tracks each, and every track is valid', () => {
    expect(COPAS.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
    for (const c of COPAS) {
      expect(c.tracks.length, `copa ${c.id}`).toBeGreaterThanOrEqual(2);
      expect(c.tracks.length, `copa ${c.id}`).toBeLessThanOrEqual(3);
    }
    expect(new Set(ALL_TRACKS.map((t) => t.id)).size).toBe(ALL_TRACKS.length);
    for (const t of ALL_TRACKS) expect(validateTrack(t), t.id).toEqual([]);
  });

  it('palettes only grow: the program built so far keeps working in the next copa', () => {
    for (const id of COPA_IDS.slice(1)) {
      const before = PALETTES[(id - 1) as 1 | 2 | 3 | 4];
      const now = PALETTES[id];
      for (const k of before.blocks) expect(now.blocks, `copa ${id} keeps ${k}`).toContain(k);
      for (const s of before.sensors) expect(now.sensors).toContain(s);
      if (before.event) expect(now.event).toBe(true);
    }
    expect(PALETTES[1].blocks).not.toContain('repeat');
    expect(PALETTES[2].blocks).toContain('repeat');
    expect(PALETTES[3].blocks).toContain('if');
    expect(PALETTES[4].event).toBe(true);
    expect(PALETTES[3].event).toBe(false);
    expect(PALETTES[5].blocks).toContain('turbo');
    expect(PALETTES[5].sensors).toContain('nitro_positive');
    expect(PALETTES[4].blocks).not.toContain('turbo');
  });

  it('look up by id', () => {
    expect(trackById('c2-a')?.copa).toBe(2);
    expect(trackById('nope')).toBeUndefined();
    expect(copaOf(3).name).toBe('La pista cambia');
  });

  it('each copa has the features of its concept (puddles that move from copa 3, logs from copa 4, laps and nitro in copa 5)', () => {
    for (const t of ALL_TRACKS) {
      expect('fixed' in t.puddles, t.id).toBe(t.copa <= 2);
      expect(!!t.logs, t.id).toBe(t.copa >= 4);
      expect(t.laps, t.id).toBe(t.copa === 5 ? 3 : 1);
      expect(t.nitro, t.id).toBe(t.copa === 5 ? 3 : undefined);
      expect(t.slots, t.id).toBe(SLOTS[t.copa]);
    }
  });
});

describe.each(ALL_TRACKS.map((t) => [t.id, t] as const))('track %s', (_id, track) => {
  const palette = PALETTES[track.copa];

  it('its three reference programs and the deer\'s fit the palette and the memory', () => {
    for (const tier of TIERS) expect(checkProgram(track.refs[tier], { palette, slots: track.slots }), tier).toEqual([]);
    expect(checkProgram(track.deer.program, { palette, slots: track.slots })).toEqual([]);
  });

  it('every reference program finishes on every seed, in the same time on all of them', () => {
    for (const tier of TIERS) {
      const times = new Set<number>();
      for (const seed of SEEDS) {
        const r = simulate(track.refs[tier], track, seed);
        expect(r.outcome, `${tier} seed ${seed}: ${JSON.stringify(r.crash ?? {})}`).toBe('finish');
        times.add(r.timeMs);
      }
      expect([...times], `${tier} times`).toHaveLength(1);
      expect([...times][0]).toBe(referenceTimes(track)[tier]);
    }
  });

  it('gold is faster than silver, faster than bronze, with room between the targets', () => {
    const t = referenceTimes(track);
    expect(t.gold).toBeLessThan(t.silver);
    expect(t.silver).toBeLessThan(t.bronze);
    const targets = rivalTargets(track);
    // each program beats its own tier's rival and loses to the one above: the margin never makes two tiers overlap
    expect(t.gold + TARGET_MARGIN_MS).toBe(targets.gold);
    expect(t.silver).toBeGreaterThanOrEqual(targets.gold);
    expect(t.bronze).toBeGreaterThanOrEqual(targets.silver);
  });

  it('the gold program beats all three rivals, silver beats bronze and silver, bronze beats only bronze', () => {
    const t = referenceTimes(track);
    expect(TIERS.map((r) => beats(track, t.gold, r))).toEqual([true, true, true]);
    expect(TIERS.map((r) => beats(track, t.silver, r))).toEqual([true, true, false]);
    expect(TIERS.map((r) => beats(track, t.bronze, r))).toEqual([true, false, false]);
  });

  it('the fox\'s program is the gold one, and its trick block is in it', () => {
    expect(foxProgram(track)).toBe(track.refs.gold);
    expect(findBlock(foxProgram(track), track.trickBlockId)).not.toBeNull();
  });

  it('the deer\'s program has one bug that keeps it from finishing, on every seed, and fixing that block (as the fox has it) makes it finish', () => {
    const fox = foxProgram(track);
    for (const seed of SEEDS) {
      const r = simulate(track.deer.program, track, seed);
      expect(r.outcome, `deer seed ${seed}`).not.toBe('finish');
      if (track.deer.kind === 'wrong_block' || track.deer.kind === 'missing_block' || track.deer.kind === 'short_event') expect(r.outcome).toBe('crash');
      // a wrong count either stops short of the line or drives on into the tail's blocks at the wrong place
      if (track.deer.kind === 'wrong_count') expect(['stuck', 'crash']).toContain(r.outcome);
    }
    const hat = fox.onLog?.id === track.deer.bugBlockId;
    expect(findBlock(track.deer.program, track.deer.bugBlockId), 'the bug block exists in the deer program').not.toBeNull();
    const fixed: Program = hat ? { ...track.deer.program, onLog: fox.onLog } : replaceBlock(track.deer.program, track.deer.bugBlockId, findBlock(fox, track.deer.bugBlockId) as Block);
    for (const seed of SEEDS.slice(0, 20)) expect(simulate(fixed, track, seed).outcome, `fixed seed ${seed}`).toBe('finish');
    expect(simulate(fixed, track, 1).timeMs).toBe(referenceTimes(track).gold);
  });

  it('the deer\'s crash names a block, and for a wrong block it is the buggy one', () => {
    if (track.deer.kind !== 'wrong_block') return;
    const r = simulate(track.deer.program, track, 3);
    expect(r.crash?.blockId).toBe(track.deer.bugBlockId);
  });

  it('is deterministic: the same seed twice is the very same run', () => {
    for (const tier of TIERS) expect(simulate(track.refs[tier], track, 17)).toEqual(simulate(track.refs[tier], track, 17));
  });
});

describe('copa 1: a fixed sequence', () => {
  it('about eight tiles, one block per tile fits the memory, and the puddles never move', () => {
    for (const t of COPAS[0].tracks) {
      expect(t.tiles.length).toBe(8);
      expect(slotCount(t.refs.gold)).toBeLessThanOrEqual(t.slots);
      const a = worldFor(t, 1).puddles;
      for (const seed of SEEDS) expect([...worldFor(t, seed).puddles]).toEqual([...a]);
    }
  });
});

describe('copa 2: the road does not fit without `repetir`', () => {
  it('one block per tile is longer than the memory on every track, and the gold program (with a `repetir`) fits', () => {
    for (const t of COPAS[1].tracks) {
      expect(t.tiles.length, t.id).toBeGreaterThan(t.slots);
      expect(slotCount(t.refs.gold), t.id).toBeLessThanOrEqual(t.slots);
      expect(t.refs.gold.main.some((b) => b.kind === 'repeat'), t.id).toBe(true);
    }
  });

  it('a naive one-block-per-tile sequence is rejected by the memory check, even though it would finish', () => {
    for (const t of COPAS[1].tracks) {
      const b = programBuilder('naive');
      const blocks: Block[] = t.tiles.map((tile, i) => (tile.kind === 'rise' ? b.up() : tile.kind === 'drop' ? b.down() : 'fixed' in t.puddles && t.puddles.fixed.includes(i) ? b.jump() : b.forward()));
      const naive: Program = { main: blocks };
      expect(simulate(naive, t, 1).outcome, t.id).toBe('finish');
      expect(checkProgram(naive, { palette: PALETTES[2], slots: t.slots }).map((p) => p.code), t.id).toEqual(['too_many_blocks']);
    }
  });

  it('the first track is `repetir 4 [→ saltar ↑ ↓]`: several blocks inside the loop, and ↑/↓ make small hills', () => {
    const a = trackById('c2-a')!;
    const loop = a.refs.gold.main[0];
    expect(loop).toMatchObject({ kind: 'repeat', n: 4 });
    expect((loop as { body: Block[] }).body.map((x) => x.kind)).toEqual(['forward', 'jump', 'up', 'down']);
    const heights = simulate(a.refs.gold, a, 1).timeline.filter((f) => f.kind === 'exec').map((f) => f.h);
    expect(Math.max(...heights)).toBe(1);
    expect(Math.min(...heights)).toBe(0);
    expect(heights.filter((h) => h === 1)).toHaveLength(4);
  });
});

describe('copa 3: the puddles move, so the kart has to look', () => {
  const tracks = COPAS[2].tracks;

  it('the puddles are in a different place on different seeds, the same number every time', () => {
    for (const t of tracks) {
      const layouts = new Set(SEEDS.map((s) => [...worldFor(t, s).puddles].join(',')));
      expect(layouts.size, t.id).toBeGreaterThan(10);
      for (const s of SEEDS) expect(worldFor(t, s).puddles.size).toBe('count' in t.puddles ? t.puddles.count : -1);
    }
  });

  it('a fixed pattern (`repetir [avanzar, saltar]`) skids on some seeds; the `si` program never skids', () => {
    for (const t of tracks) {
      const b = programBuilder('fixed');
      const fixed: Program = { main: [b.repeat(t.tiles.length / 2, [b.forward(), b.jump()])] };
      expect(checkProgram(fixed, { palette: PALETTES[3], slots: t.slots })).toEqual([]);
      const skids = SEEDS.map((s) => simulate(fixed, t, s).stats.skids);
      expect(skids.some((n) => n > 0), `${t.id} fixed pattern skids somewhere`).toBe(true);
      for (const s of SEEDS) expect(simulate(t.refs.gold, t, s).stats.skids, `${t.id} gold seed ${s}`).toBe(0);
    }
  });

  it('always jumping never skids but loses to the gold rival; always driving skids on every seed', () => {
    for (const t of tracks) {
      for (const s of SEEDS) {
        expect(simulate(t.refs.silver, t, s).stats.skids).toBe(0);
        expect(simulate(t.refs.bronze, t, s).stats.skids).toBe('count' in t.puddles ? t.puddles.count : -1);
      }
      expect(beats(t, referenceTimes(t).silver, 'gold')).toBe(false);
    }
  });

  it('the kart must be built with `si` inside `repetir` to fit: a plain sequence does not fit the memory', () => {
    for (const t of tracks) expect(t.tiles.length).toBeGreaterThan(t.slots);
  });
});

describe('copa 4: a log falls at a moment nobody knows', () => {
  const tracks = COPAS[3].tracks;
  const withoutEvent = (t: TrackSpec): Program => ({ main: t.refs.gold.main });

  it('without the event script the kart crashes into the log on (almost) every seed; with it, never', () => {
    for (const t of tracks) {
      let crashed = 0;
      for (const s of SEEDS) {
        const r = simulate(withoutEvent(t), t, s);
        if (r.outcome === 'crash') { crashed++; expect(r.crash?.cause).toBe('log'); expect(findBlock(t.refs.gold, r.crash!.blockId), 'a main block').not.toBeNull(); }
        const ok = simulate(t.refs.gold, t, s);
        expect(ok.outcome, `${t.id} seed ${s}`).toBe('finish');
        expect(ok.logs).toHaveLength(1);
        expect(ok.stats.eventRuns).toBe(1);
      }
      expect(crashed, `${t.id}: crashes without the event script`).toBeGreaterThanOrEqual(SEEDS.length * 0.9);
    }
  });

  it('the log falls at different moments, always inside the window and always on the road', () => {
    for (const t of tracks) {
      const falls = new Set<number>();
      for (const s of SEEDS) {
        const r = simulate(t.refs.gold, t, s);
        const [a, b] = t.logs!.windowMs;
        expect(r.logs[0].fallMs).toBeGreaterThanOrEqual(a);
        expect(r.logs[0].fallMs).toBeLessThanOrEqual(b);
        falls.add(r.logs[0].fallMs);
      }
      expect(falls.size, t.id).toBeGreaterThan(10);
    }
  });

  it('the main loop keeps the copa 3 logic: the gold main script is the same as copa 3\'s', () => {
    for (const t of tracks) {
      expect(t.refs.gold.main[0]).toMatchObject({ kind: 'repeat' });
      expect(t.refs.gold.onLog?.body.map((b) => b.kind)).toEqual(['brake', 'wait']);
    }
  });

  it('the log lands on the road ahead of the kart, and the timeline shows it before the kart moves on', () => {
    const t = tracks[0];
    const r = simulate(t.refs.gold, t, 5);
    const fall = r.timeline.findIndex((f) => f.kind === 'log_fall');
    expect(fall).toBeGreaterThan(0);
    expect(r.timeline[fall].tile).toBeGreaterThanOrEqual(1);
    expect(r.timeline[fall].blockId).toBe(t.refs.gold.onLog!.id);
  });
});

describe('copa 5: the Gran Premio', () => {
  const tracks = COPAS[4].tracks;

  it('three laps, three nitro cans, straights, puddles and a log', () => {
    for (const t of tracks) {
      expect(t.laps).toBe(3);
      expect(t.nitro).toBe(3);
      expect(t.tiles.some((x) => x.straight)).toBe(true);
      expect(t.logs).toBeDefined();
      expect(slotCount(t.refs.gold)).toBeLessThanOrEqual(t.slots);
    }
  });

  it('gold uses its three nitro cans exactly on straights, never sputters, and ends with the variable at zero', () => {
    for (const t of tracks) {
      for (const s of SEEDS.slice(0, 20)) {
        const r = simulate(t.refs.gold, t, s);
        expect(r.stats).toMatchObject({ turbos: 3, sputters: 0, skids: 0, nitroLeft: 0 });
        const turbos = r.timeline.filter((f) => f.fx.includes('turbo'));
        expect(turbos).toHaveLength(3);
        for (const f of turbos) expect(tileAt(t, f.from).straight, `${t.id} seed ${s}: turbo on tile ${f.from}`).toBe(true);
      }
    }
  });

  it('silver leaves the nitro unused (it is "no turbo" that separates it from gold); bronze skids on every puddle', () => {
    for (const t of tracks) {
      expect(simulate(t.refs.silver, t, 2).stats).toMatchObject({ turbos: 0, skids: 0 });
      expect(simulate(t.refs.bronze, t, 2).stats.skids).toBe(6);
    }
  });

  it('forgetting `cambiar nitro` shows: the real tank runs dry and the engine sputters', () => {
    for (const t of tracks) {
      const noCount = withoutNitro(t.refs.gold);
      expect(simulate(noCount, t, 4).stats.sputters, t.id).toBeGreaterThan(0);
    }
  });

  it('driving one lap only is stuck; `repetir vueltas` is what drives all three', () => {
    for (const t of tracks) {
      const r = simulate(t.deer.program, t, 1);
      expect(r.outcome).toBe('stuck');
      expect(r.pos).toBe(2 * t.tiles.length);
    }
  });

  it('crashes name the right block: a `subir` on the flat lap is reported on that block', () => {
    const t = tracks[0];
    const b = programBuilder('x');
    const bad = b.up();
    const r = simulate({ main: [b.forward(), bad], onLog: t.refs.gold.onLog }, t, 1);
    expect(r.crash).toMatchObject({ blockId: bad.id, tile: 1, cause: 'no_ramp' });
  });
});

function withoutNitro(p: Program): Program {
  const strip = (blocks: Block[]): Block[] => blocks.filter((b) => b.kind !== 'nitro').map((b) => (b.kind === 'repeat' ? { ...b, body: strip(b.body) } : b.kind === 'if' ? { ...b, then: strip(b.then), else: strip(b.else) } : b));
  return { main: strip(p.main), ...(p.onLog ? { onLog: p.onLog } : {}) };
}
