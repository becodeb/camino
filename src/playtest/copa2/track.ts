// Copa v2: the TRACK. A 1-D side-scrolling road of tiles. The kart drives
// tile by tile and every tile asks for one thing:
//
//   flat    '-'  plain road: avanzar (or saltar; turbo on a straight)
//   straight '=' flat road where turbo is worth it (a long clear stretch)
//   rise    'u'  a step/ramp UP: needs `subir`. `avanzar` into it is a crash (a wall)
//   drop    'd'  a step/ramp DOWN: needs `bajar`. `avanzar` into it is a crash
//
// So ↑ and ↓ are the terrain: a road of `--ud` is flat, flat, a step up and
// a step down: a small hill, and `repetir 4 [→ → ↑ ↓]` drives four of them.
// The height never goes below the ground nor above MAX_HEIGHT (checked).
//
// Puddles sit on flat, non-straight tiles. Fixed positions (copas 1-2) or
// placed by SEED (copa 3 on): the same count every run, in a different place,
// including "¡Revancha!". Driving over one with avanzar is a skid (time lost,
// not a crash); saltar flies over it. Logs (copa 4 on) fall at a random TIME
// (not a place): see sim.ts.
//
// A track may have laps (copa 5): `tiles` is one lap, the kart drives it
// `laps` times, and the puddles are drawn again for every lap.

import { rng } from '../race';

export type TileKind = 'flat' | 'rise' | 'drop';
export interface Tile { kind: TileKind; straight: boolean }

export const MAX_HEIGHT = 3;

/** Terrain from text: `-` flat, `=` straight, `u` rise, `d` drop (spaces ignored). */
export function parseTiles(spec: string): Tile[] {
  const tiles: Tile[] = [];
  for (const ch of spec.replace(/\s+/g, '')) {
    if (ch === '-') tiles.push({ kind: 'flat', straight: false });
    else if (ch === '=') tiles.push({ kind: 'flat', straight: true });
    else if (ch === 'u') tiles.push({ kind: 'rise', straight: false });
    else if (ch === 'd') tiles.push({ kind: 'drop', straight: false });
    else throw new Error(`bad terrain character ${JSON.stringify(ch)}`);
  }
  return tiles;
}

/** `rep('--ud', 4)` = the pattern four times. */
export const rep = (pattern: string, n: number): string => pattern.repeat(n);

export type PuddleRule = { fixed: readonly number[] } | { count: number; minGap: number };

export interface LogRule {
  /** Logs that fall during one run (each at its own random time). */
  count: number;
  /** Each log falls at a random moment in this window, ms from the start of the run. */
  windowMs: readonly [number, number];
}

export interface TrackDef {
  id: string;
  copa: 1 | 2 | 3 | 4 | 5;
  /** Kid-facing name (Rioplatense Spanish). */
  name: string;
  /** One lap. */
  tiles: readonly Tile[];
  laps: number;
  /** Memory: how many blocks fit (program.ts `slotCount`). */
  slots: number;
  puddles: PuddleRule;
  logs?: LogRule;
  /** Nitro cans in the tank (and the starting value of the `nitro` variable). Undefined: turbo is not limited. */
  nitro?: number;
}

/** The height after each tile of one lap (0 at the start). */
export function heights(tiles: readonly Tile[]): number[] {
  let h = 0;
  return tiles.map((t) => { h += t.kind === 'rise' ? 1 : t.kind === 'drop' ? -1 : 0; return h; });
}

/** Tiles in the whole race. */
export const totalTiles = (t: Pick<TrackDef, 'tiles' | 'laps'>): number => t.tiles.length * t.laps;

/** What is wrong with a track definition (empty: fine). */
export function validateTrack(t: TrackDef): string[] {
  const bad: string[] = [];
  if (!t.tiles.length) bad.push('no tiles');
  const hs = heights(t.tiles);
  if (hs.some((h) => h < 0 || h > MAX_HEIGHT)) bad.push(`height out of range: ${hs.join(',')}`);
  if (hs.length && hs[hs.length - 1] !== 0) bad.push('a lap must end at ground level');
  if ('fixed' in t.puddles) {
    for (const i of t.puddles.fixed) if (t.tiles[i]?.kind !== 'flat' || t.tiles[i]?.straight) bad.push(`puddle ${i} is not on plain flat road`);
  } else if (eligiblePuddleTiles(t.tiles).length < t.puddles.count) bad.push('not enough room for the puddles');
  if (t.laps < 1) bad.push('laps < 1');
  return bad;
}

// ------------------------------------------------------------------ the world of one run

export interface World {
  /** Absolute tile index of every puddle (lap * tiles + i). */
  puddles: ReadonlySet<number>;
  /** When each log falls, ms from the start (ascending). */
  logFalls: readonly number[];
}

/** Where a puddle may sit: plain flat road, never the first tile. */
export const eligiblePuddleTiles = (tiles: readonly Tile[]): number[] => tiles.flatMap((t, i) => (i >= 1 && t.kind === 'flat' && !t.straight ? [i] : []));

/** A lap's puddles for `seed` (the same seed always draws the same lap). */
export function drawPuddles(track: TrackDef, seed: number, lap: number): number[] {
  if ('fixed' in track.puddles) return [...track.puddles.fixed];
  const { count, minGap } = track.puddles;
  const r = rng(((seed >>> 0) * 31 + lap * 977 + 17) >>> 0);
  const pool = eligiblePuddleTiles(track.tiles);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const chosen: number[] = [];
  for (const gap of [minGap, 1]) {
    for (const i of pool) {
      if (chosen.length >= count) break;
      if (!chosen.includes(i) && chosen.every((c) => Math.abs(c - i) >= gap)) chosen.push(i);
    }
  }
  return chosen.sort((a, b) => a - b);
}

/** Everything random in one run, drawn from the seed (deterministic). */
export function worldFor(track: TrackDef, seed: number): World {
  const puddles = new Set<number>();
  for (let lap = 0; lap < track.laps; lap++) for (const i of drawPuddles(track, seed, lap)) puddles.add(lap * track.tiles.length + i);
  const logFalls: number[] = [];
  if (track.logs) {
    const r = rng(((seed >>> 0) * 53 + 211) >>> 0);
    const [a, b] = track.logs.windowMs;
    for (let k = 0; k < track.logs.count; k++) logFalls.push(Math.round((a + r() * (b - a)) / 10) * 10);
    logFalls.sort((x, y) => x - y);
  }
  return { puddles, logFalls };
}

/** The tile the kart enters next when `pos` tiles are behind it. */
export const tileAt = (track: Pick<TrackDef, 'tiles'>, pos: number): Tile => track.tiles[pos % track.tiles.length];
