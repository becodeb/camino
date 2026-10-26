// Copa v2: the five copas, their tracks and the reference programs.
//
// One program grows across the whole Copa; every copa brings tracks where
// the program so far stops being enough:
//
//   1 Conocés la pista       a fixed road: a sequence of arrows (and a jump over the puddle)
//   2 La pista no entra      the memory holds 8 blocks and the road is longer: only `repetir` fits
//   3 La pista cambia        the puddles move every run: `si charco adelante` inside the `repetir`
//   4 Cosas que pasan de golpe  a log falls at a moment nobody knows: `cuando cae un tronco`
//   5 Gran Premio            3 laps (`vueltas`), 3 nitro cans, straights, puddles and a log
//
// REFERENCE PROGRAMS. Each track carries three programs that define how the
// animals race (the rivals are tied to program quality, not to the child's
// speed):
//   bronze  a working program that is slow or skids (it finishes, no more)
//   silver  a good program with no skids, that still loses some time
//           (it jumps where it did not have to, or leaves the nitro unused)
//   gold    the optimal program (the fox's program)
// The target time of a rival tier is the simulated time of its program plus
// TARGET_MARGIN_MS: the child beats a rival iff the child's time is below that
// target. So the gold program beats all three rivals, silver beats bronze and
// silver but not gold, bronze beats only bronze (tracks.test.ts proves it on
// every seed: each reference program takes the same time on every seed, because
// the puddles move but their number does not, and the gold/silver programs
// look before they leap).
//
// Besides, each track has the "deer's broken program" (the gold program with
// ONE bug, for "Ayudá al ciervo") and the "trick block" of the fox's program
// ("Espiá el programa del zorro": tap where the trick is).

import {
  programBuilder, replaceBlock, type Block, type BlockKind, type Palette, type Program, type ProgramBuilder, type Sensor,
} from './program';
import { simulate } from './sim';
import { parseTiles, rep, type TrackDef } from './track';

export type CopaId = 1 | 2 | 3 | 4 | 5;
export const COPA_IDS: readonly CopaId[] = [1, 2, 3, 4, 5];

export type Tier = 'bronze' | 'silver' | 'gold';
export const TIERS: readonly Tier[] = ['bronze', 'silver', 'gold'];

/** A rival's target time is its reference program's time plus this (so a child with an equally good program beats it). */
export const TARGET_MARGIN_MS = 150;

// ------------------------------------------------------------------ the palettes (what each copa lets the child build with)

const BASE: BlockKind[] = ['forward', 'up', 'down', 'jump'];
const ALL_SENSORS: Sensor[] = ['puddle_ahead', 'straight_ahead', 'nitro_positive'];

export const PALETTES: Readonly<Record<CopaId, Palette>> = {
  1: { blocks: BASE, sensors: [], event: false },
  2: { blocks: [...BASE, 'repeat'], sensors: [], event: false },
  3: { blocks: [...BASE, 'repeat', 'if'], sensors: ['puddle_ahead'], event: false },
  4: { blocks: [...BASE, 'repeat', 'if', 'brake', 'wait'], sensors: ['puddle_ahead'], event: true },
  5: { blocks: [...BASE, 'turbo', 'brake', 'wait', 'repeat', 'if', 'nitro'], sensors: ALL_SENSORS, event: true },
};

/** Memory (slots) of each copa's tracks: a block counts 1, containers and the event hat included (program.ts `slotCount`). */
export const SLOTS: Readonly<Record<CopaId, number>> = { 1: 10, 2: 8, 3: 6, 4: 9, 5: 12 };

// ------------------------------------------------------------------ what a track carries

export type BugKind = 'wrong_block' | 'wrong_count' | 'missing_block' | 'short_event';

export interface DeerProgram {
  /** The gold program with one bug. It never finishes. */
  program: Program;
  /** The block (or the event hat) where the bug is. Replacing it as the fox has it fixes the program. */
  bugBlockId: string;
  kind: BugKind;
}

export interface TrackSpec extends TrackDef {
  refs: Readonly<Record<Tier, Program>>;
  /** The block of the fox's (gold) program that holds the trick: where the child taps in "Espiá". */
  trickBlockId: string;
  deer: DeerProgram;
}

export interface CopaDef {
  id: CopaId;
  /** Kid-facing (Rioplatense Spanish). */
  name: string;
  /** The new idea, in a short sentence. */
  concept: string;
  palette: Palette;
  slots: number;
  tracks: readonly TrackSpec[];
}

/** The fox's program on a track: the gold reference. */
export const foxProgram = (t: TrackSpec): Program => t.refs.gold;

// ------------------------------------------------------------------ building tracks

type Def = Pick<TrackDef, 'id' | 'name' | 'puddles' | 'logs' | 'nitro' | 'laps'> & { copa: CopaId; terrain: string };

const trackOf = ({ terrain, ...d }: Def, extra: Omit<TrackSpec, keyof TrackDef>): TrackSpec => ({
  ...d, tiles: parseTiles(terrain), slots: SLOTS[d.copa], ...extra,
});

/** One block per tile, exactly: ramps by their arrows, a jump on a puddle, avanzar elsewhere. `plainJumps` of the plain tiles jump anyway; `skid` makes puddles avanzar. */
function sequence(b: ProgramBuilder, terrain: string, puddles: readonly number[], o: { plainJumps?: number; skid?: boolean } = {}): { blocks: Block[]; jumpOverPuddle: Block[] } {
  const blocks: Block[] = [];
  const jumpOverPuddle: Block[] = [];
  let plain = 0;
  [...terrain.replace(/\s+/g, '')].forEach((ch, i) => {
    if (ch === 'u') blocks.push(b.up());
    else if (ch === 'd') blocks.push(b.down());
    else if (puddles.includes(i)) {
      const blk = o.skid ? b.forward() : b.jump();
      blocks.push(blk);
      if (!o.skid) jumpOverPuddle.push(blk);
    } else blocks.push((o.plainJumps ?? 0) > plain++ ? b.jump() : b.forward());
  });
  return { blocks, jumpOverPuddle };
}

// ---- copa 1: a fixed sequence

function copa1(id: string, name: string, terrain: string, puddles: number[], bugAt: number): TrackSpec {
  const g = programBuilder(`${id}-gold`);
  const gold = sequence(g, terrain, puddles);
  const silver = sequence(programBuilder(`${id}-silver`), terrain, puddles, { plainJumps: 3 });
  const bronze = sequence(programBuilder(`${id}-bronze`), terrain, puddles, { skid: true });
  // the deer's bug: the block at `bugAt` is swapped for an `avanzar` (or, if it already is one, a `subir`): the kart drives into a wall
  const bug = gold.blocks[bugAt];
  const deer = replaceBlock({ main: gold.blocks }, bug.id, { id: bug.id, kind: bug.kind === 'forward' ? 'up' : 'forward' });
  return trackOf(
    { id, copa: 1, name, terrain, laps: 1, puddles: { fixed: puddles } },
    { refs: { gold: { main: gold.blocks }, silver: { main: silver.blocks }, bronze: { main: bronze.blocks } }, trickBlockId: gold.jumpOverPuddle[0].id, deer: { program: deer, bugBlockId: bug.id, kind: 'wrong_block' } },
  );
}

// ---- copa 2: the road does not fit in the memory

/**
 * `repetir n [pattern]` programs. In a pattern string `u` is subir, `d` bajar, `j` a puddle tile (gold and silver jump it, bronze drives into it)
 * and `s` a plain tile (gold and bronze drive it, silver jumps it for nothing).
 */
function periodic(id: string, name: string, terrain: string, puddles: number[], n: number, pattern: string, o: { head?: string; tail?: string; deerKind: 'wrong_count' | 'missing_block' }): TrackSpec {
  const make = (tag: string, how: 'gold' | 'silver' | 'bronze') => {
    const b = programBuilder(`${id}-${tag}`);
    const arrows = (p: string, jumpPuddles: 'gold' | 'silver' | 'bronze'): Block[] => [...p].map((ch) => {
      if (ch === 'u') return b.up();
      if (ch === 'd') return b.down();
      if (ch === 'j') return jumpPuddles === 'bronze' ? b.forward() : b.jump(); // a puddle tile
      // a plain tile: silver jumps on it (loses a little time), the others drive
      return jumpPuddles === 'silver' && ch === 's' ? b.jump() : b.forward();
    });
    const head = o.head ? arrows(o.head, how) : [];
    const loopBody = arrows(pattern, how);
    const loop = b.repeat(n, loopBody);
    const tail = o.tail ? arrows(o.tail, how) : [];
    return { program: { main: [...head, loop, ...tail] } as Program, loop, loopBody, head, tail };
  };
  const gold = make('gold', 'gold');
  const silver = make('silver', 'silver');
  const bronze = make('bronze', 'bronze');
  let deer: Program;
  if (o.deerKind === 'wrong_count') deer = replaceBlock(gold.program, gold.loop.id, { ...gold.loop, n: n - 1 });
  else deer = replaceBlock(gold.program, gold.loop.id, { ...gold.loop, body: gold.loopBody.slice(0, -1) });
  return trackOf(
    { id, copa: 2, name, terrain, laps: 1, puddles: { fixed: puddles } },
    { refs: { gold: gold.program, silver: silver.program, bronze: bronze.program }, trickBlockId: gold.loop.id, deer: { program: deer, bugBlockId: gold.loop.id, kind: o.deerKind } },
  );
}

// ---- copa 3 and 4: `si charco adelante` inside the `repetir`

/** The classic loop. `silver`: always jump. `bronze`: always avanzar. Optionally with the event script (copa 4). */
function lookAndLeap(id: string, copa: 3 | 4, name: string, tiles: number, puddles: { count: number; minGap: number }, logs?: { count: number; windowMs: [number, number] }): TrackSpec {
  const terrain = rep('-', tiles);
  const mk = (tag: string, kind: 'gold' | 'silver' | 'bronze') => {
    const b = programBuilder(`${id}-${tag}`);
    const jump = b.jump();
    const forward = b.forward();
    const check = b.iff('puddle_ahead', [jump], [forward]);
    const body = kind === 'gold' ? [check] : [kind === 'silver' ? b.jump() : b.forward()];
    const loop = b.repeat(tiles, body);
    // the event script (copa 4): gold waits just enough, silver the same, bronze waits too long
    const hat = copa === 4 ? b.onLog(kind === 'bronze' ? [b.wait(2)] : [b.brake(), b.wait(1)]) : undefined;
    return { program: { main: [loop], ...(hat ? { onLog: hat } : {}) } as Program, loop, check, jump, hat };
  };
  const gold = mk('gold', 'gold');
  const silver = mk('silver', 'silver');
  const bronze = mk('bronze', 'bronze');
  let deer: Program;
  let bugBlockId: string;
  let kind: BugKind;
  if (copa === 3) {
    // a `subir` where the kart has to jump: it climbs a ramp that is not there
    deer = replaceBlock(gold.program, gold.jump.id, { id: gold.jump.id, kind: 'up' });
    bugBlockId = gold.jump.id;
    kind = 'wrong_block';
  } else {
    // the event script only brakes: the kart sets off again with the log still there
    const hat = gold.hat!;
    deer = { main: gold.program.main, onLog: { id: hat.id, body: hat.body.slice(0, 1) } };
    bugBlockId = hat.id;
    kind = 'short_event';
  }
  return trackOf(
    { id, copa, name, terrain, laps: 1, puddles, ...(logs ? { logs } : {}) },
    { refs: { gold: gold.program, silver: silver.program, bronze: bronze.program }, trickBlockId: copa === 4 ? gold.hat!.id : gold.check.id, deer: { program: deer, bugBlockId, kind } },
  );
}

// ---- copa 5: the Gran Premio

function granPremio(id: string, name: string, lap: string, puddles: { count: number; minGap: number }, logs: { count: number; windowMs: [number, number] }): TrackSpec {
  const tiles = lap.replace(/\s+/g, '').length;
  const nitro = 3;
  const mk = (tag: string, kind: 'gold' | 'silver' | 'bronze', laps: number | 'laps' = 'laps') => {
    const b = programBuilder(`${id}-${tag}`);
    const turbo = b.turbo();
    const spend = b.nitro(-1);
    const jump = b.jump();
    const forward = b.forward();
    const look = b.iff('puddle_ahead', [jump], [forward]);
    const step = kind === 'gold'
      ? b.iff(['straight_ahead', 'nitro_positive'], [turbo, spend], [look])
      : kind === 'silver' ? look : null;
    const inner = b.repeat(tiles, step ? [step] : [b.forward()]);
    const outer = b.repeat(laps, [inner]);
    const hat = b.onLog(kind === 'bronze' ? [b.wait(2)] : [b.brake(), b.wait(1)]);
    return { program: { main: [outer], onLog: hat } as Program, outer, turbo, hat };
  };
  const gold = mk('gold', 'gold');
  const silver = mk('silver', 'silver');
  const bronze = mk('bronze', 'bronze');
  // the deer drives two laps instead of `vueltas`: it stops before the line
  const deer = replaceBlock(gold.program, gold.outer.id, { ...gold.outer, n: 2 });
  return trackOf(
    { id, copa: 5, name, terrain: lap, laps: 3, nitro, puddles, logs },
    { refs: { gold: gold.program, silver: silver.program, bronze: bronze.program }, trickBlockId: gold.turbo.id, deer: { program: deer, bugBlockId: gold.outer.id, kind: 'wrong_count' } },
  );
}

// ------------------------------------------------------------------ the five copas

export const COPAS: readonly CopaDef[] = [
  {
    id: 1, name: 'Conocés la pista', concept: 'Una secuencia de bloques lleva al auto por la pista.', palette: PALETTES[1], slots: SLOTS[1],
    tracks: [
      copa1('c1-a', 'La primera vuelta', '-uudd---', [6], 2),
      copa1('c1-b', 'Saltá el charco', '--u-d---', [3, 6], 2),
      copa1('c1-c', 'Sube y baja', 'u-d-u-d-', [1, 5], 4),
    ],
  },
  {
    id: 2, name: 'La pista no entra', concept: 'La memoria es corta: repetir hace entrar la pista.', palette: PALETTES[2], slots: SLOTS[2],
    tracks: [
      periodic('c2-a', 'Las lomas', rep('--ud', 4), [1, 5, 9, 13], 4, 'sjud', { deerKind: 'wrong_count' }),
      periodic('c2-b', 'La montaña grande', rep('--uudd', 3), [1, 7, 13], 3, 'sjuudd', { deerKind: 'missing_block' }),
      periodic('c2-c', 'El camino con curvas', '--' + rep('ud', 4) + '---', [1, 11], 4, 'ud', { head: 'sj', tail: 'sjs', deerKind: 'wrong_count' }),
    ],
  },
  {
    id: 3, name: 'La pista cambia', concept: 'Los charcos cambian de lugar: el auto mira antes de decidir.', palette: PALETTES[3], slots: SLOTS[3],
    tracks: [
      lookAndLeap('c3-a', 3, 'Charcos que se mueven', 10, { count: 3, minGap: 2 }),
      lookAndLeap('c3-b', 3, 'Cuidado con los charcos', 12, { count: 4, minGap: 2 }),
      lookAndLeap('c3-c', 3, 'La ruta larga', 14, { count: 4, minGap: 3 }),
    ],
  },
  {
    id: 4, name: 'Cosas que pasan de golpe', concept: 'Un tronco cae cuando nadie lo espera: un segundo programa lo atiende.', palette: PALETTES[4], slots: SLOTS[4],
    tracks: [
      lookAndLeap('c4-a', 4, 'El bosque de los troncos', 12, { count: 3, minGap: 2 }, { count: 1, windowMs: [1500, 3500] }),
      lookAndLeap('c4-b', 4, 'Camino del aserradero', 14, { count: 4, minGap: 2 }, { count: 1, windowMs: [1500, 4000] }),
    ],
  },
  {
    id: 5, name: 'Gran Premio', concept: 'Tres vueltas, tres nitros: todo lo aprendido junto.', palette: PALETTES[5], slots: SLOTS[5],
    tracks: [
      granPremio('c5-a', 'El Gran Premio del zorro', '-===--=---', { count: 2, minGap: 2 }, { count: 1, windowMs: [2000, 7000] }),
      granPremio('c5-b', 'El Gran Premio de la selva', '-=-==--===-', { count: 2, minGap: 2 }, { count: 1, windowMs: [2000, 7000] }),
    ],
  },
];

export const ALL_TRACKS: readonly TrackSpec[] = COPAS.flatMap((c) => c.tracks);
export const trackById = (id: string): TrackSpec | undefined => ALL_TRACKS.find((t) => t.id === id);
export const copaOf = (id: CopaId): CopaDef => COPAS[id - 1];

// ------------------------------------------------------------------ the reference times

const timeCache = new Map<string, Record<Tier, number>>();

/** The simulated time of each reference program on a track (every seed gives the same: see tracks.test.ts). Throws if a reference does not finish: that is a bug in the track definition. */
export function referenceTimes(track: TrackSpec): Record<Tier, number> {
  const hit = timeCache.get(track.id);
  if (hit) return hit;
  const out = {} as Record<Tier, number>;
  for (const tier of TIERS) {
    const r = simulate(track.refs[tier], track, 1);
    if (r.outcome !== 'finish') throw new Error(`reference program ${track.id}/${tier} does not finish: ${r.outcome} ${JSON.stringify(r.crash ?? {})}`);
    out[tier] = r.timeMs;
  }
  timeCache.set(track.id, out);
  return out;
}

/** What each rival takes on a track: its reference time plus the margin. The child beats a rival iff its time is below this. */
export function rivalTargets(track: TrackSpec): Record<Tier, number> {
  const t = referenceTimes(track);
  return { bronze: t.bronze + TARGET_MARGIN_MS, silver: t.silver + TARGET_MARGIN_MS, gold: t.gold + TARGET_MARGIN_MS };
}
