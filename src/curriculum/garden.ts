// The child's garden (Mi jardín), laid out from the progress as a pure
// function: the drawing (screens/GardenScreen.tsx) only paints what this
// returns. Every seed earned is planted in a bed of ten (two rows of five,
// like a ten-frame) and grows as the year goes on: the newest seeds are
// sprouts, older ones leafy plants, the oldest flowers. A page stamped in
// gold grows a rare gold flower in a pot along the front; a finished sheet
// adds something bigger (a tree in the forest's half, a bush by the river);
// the bosses' special plants and critters have their places. Beds fill from
// the front and the middle outwards and back, so the garden reads the same
// with none, ten or a hundred and fifty seeds. The child may drag the big
// plants to other spots (kept in the progress); the beds stay in their rows.

import { PRIMER } from './primer';
import { sheetState, type Progress, type Spot } from './progress';
import { arrivedCritters, arrivedPlants, newArrivals } from './rewards';
import { rewardKey, type CritterId, type RareId } from './motivation';

/** The garden's drawing, in its own units (a 2 : 1 page, like the doors pages). */
export const GARDEN_W = 1200;
export const GARDEN_H = 600;
/** Where things may stand: the meadow under the river's bank. */
export const MEADOW = { x0: 40, x1: 1160, y0: 190, y1: 588 } as const;
export const BED_PLANTS = 10;
export const MAX_BEDS = 15;
/** Seeds drawn at most (15 beds of ten); the pouch still counts every one. */
export const MAX_PLANTED = BED_PLANTS * MAX_BEDS;
export const MAX_POTS = 12;

/** How a seed looks as more are planted after it. */
export type Stage = 'sprout' | 'plant' | 'flower';
/** `age`: 1 for the newest seed, 2 for the one before… Two sprouts, then plants, then flowers. */
export const stageOf = (age: number): Stage => (age <= 2 ? 'sprout' : age <= 6 ? 'plant' : 'flower');

/** A planted seed: its place, its stage and its flower's colour (an index into the palette's flower colours). */
export interface SeedPlant { i: number; x: number; y: number; stage: Stage; color: number }
/** A bed of ten: its centre, its perspective scale and its plants; `open`: dug for the next seeds, still empty. */
export interface Bed { i: number; x: number; y: number; s: number; plants: SeedPlant[]; open: boolean }
export type BigKind = 'tree' | 'pine' | 'bush' | 'bloom';
/** Something bigger for a finished sheet: `hoja-<n>`. */
export interface BigPlant { id: string; sheet: number; kind: BigKind; x: number; y: number; s: number; moved: boolean }
/** A boss's special plant. */
export interface RarePlant { id: RareId; x: number; y: number; s: number; moved: boolean; fresh: boolean }
/** A gold page's rare flower, in a pot. */
export interface Pot { id: string; x: number; y: number }
/** A critter at home. */
export interface CritterSpot { id: CritterId; x: number; y: number; s: number; fresh: boolean }

export interface Garden {
  seeds: number;
  beds: Bed[];
  big: BigPlant[];
  rare: RarePlant[];
  pots: Pot[];
  critters: CritterSpot[];
  /** Where the child's character stands. */
  me: { x: number; y: number };
}

// ------------------------------------------------------------------ the places

/** Beds: four rows from the front, the middle ones first; the rows further back are smaller. */
const ROWS: { y: number; s: number; xs: number[] }[] = [
  { y: 506, s: 1, xs: [560, 720, 400, 880] },
  { y: 424, s: 0.92, xs: [560, 710, 410, 860] },
  { y: 350, s: 0.85, xs: [565, 705, 425, 845] },
  { y: 284, s: 0.78, xs: [570, 700, 440] },
];
const BED_SLOTS = ROWS.flatMap((r) => r.xs.map((x) => ({ x, y: r.y, s: r.s })));

/** Where each finished sheet's tree (the forest, 1–9, on the left and behind) or bush (the river, 10–17, on the right) grows. */
const BIG_SLOTS: Record<number, [number, number, number]> = {
  1: [104, 262, 1.05], 2: [192, 214, 0.92], 3: [62, 372, 1.12], 4: [170, 318, 1], 5: [282, 200, 0.84],
  6: [76, 500, 1.18], 7: [372, 190, 0.78], 8: [196, 430, 1.04], 9: [468, 184, 0.74],
  10: [1112, 230, 1], 11: [1022, 204, 0.86], 12: [1148, 330, 1.05], 13: [930, 196, 0.8],
  14: [1062, 404, 1.02], 15: [836, 190, 0.76], 16: [1156, 470, 1.08], 17: [760, 186, 0.72],
};
const bigKind = (n: number): BigKind => (n <= 9 ? (n % 2 ? 'tree' : 'pine') : n % 2 ? 'bloom' : 'bush');

/** The bosses' special plants. */
const RARE_SLOTS: Record<RareId, [number, number, number]> = {
  girasol: [276, 470, 1], hongos: [86, 588, 1], diente: [1034, 346, 0.95], helecho: [208, 596, 0.88],
  juncos: [640, 158, 0.9], nenufar: [1040, 546, 1], ceibo: [972, 268, 0.95],
};

/** The critters' homes: the coatí on the meadow, the owl on its post, the fox by the bushes, the woodpecker on its trunk, the capybara by the water, the frog in the pond. */
const CRITTER_HOMES: Record<CritterId, [number, number, number]> = {
  coati: [446, 590, 1], lechuza: [250, 262, 0.95], zorro: [990, 486, 1], carpintero: [520, 204, 0.9],
  carpincho: [1000, 150, 0.95], rana: [1088, 560, 0.9],
};

const ME: { x: number; y: number } = { x: 318, y: 590 };
/** The pots stand in a row along the front, right of the middle. */
const potAt = (i: number): Pot['x'] => 532 + i * 40;

// ------------------------------------------------------------------ the layout

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** A spot the child chose, kept inside the meadow. */
export const inMeadow = ([x, y]: Spot): [number, number] => [clamp(Math.round(x), MEADOW.x0, MEADOW.x1), clamp(Math.round(y), MEADOW.y0, MEADOW.y1)];

/** A small, stable jitter so the rows look planted by hand. */
const jitter = (i: number, k: number) => (((i * 73 + k * 151) % 17) / 17 - 0.5);

function bedAt(i: number, seeds: number): Bed {
  const slot = BED_SLOTS[i];
  const plants: SeedPlant[] = [];
  for (let k = 0; k < BED_PLANTS; k++) {
    const n = i * BED_PLANTS + k;
    if (n >= seeds) break;
    const row = Math.floor(k / 5), col = k % 5;
    plants.push({
      i: n,
      x: Math.round(slot.x + ((col - 2) * 27 + jitter(n, 1) * 5) * slot.s),
      y: Math.round(slot.y + ((row ? 12 : -12) + jitter(n, 2) * 3) * slot.s),
      stage: stageOf(seeds - n),
      color: (n * 7 + Math.floor(n / 5) * 3) % 5,
    });
  }
  return { i, x: slot.x, y: slot.y, s: slot.s, plants, open: plants.length === 0 };
}

/** The garden of a progress; `seeds` overrides the count (the dev drawer's preview of a garden with N seeds). */
export function gardenOf(p: Progress, seeds = p.seeds): Garden {
  const shown = Math.max(0, Math.min(MAX_PLANTED, Math.round(seeds)));
  // every bed with seeds, and the next one dug and waiting (none past the last bed)
  const nBeds = Math.min(MAX_BEDS, Math.floor(shown / BED_PLANTS) + 1);
  const beds = Array.from({ length: nBeds }, (_, i) => bedAt(i, shown));
  const place = (id: string, [x, y]: [number, number]) => {
    const moved = p.garden[id];
    return moved ? { at: inMeadow(moved), moved: true } : { at: [x, y] as [number, number], moved: false };
  };
  const big = PRIMER.filter((s) => sheetState(s, p).complete).map((s) => {
    const [x, y, sc] = BIG_SLOTS[s.n];
    const { at, moved } = place(`hoja-${s.n}`, [x, y]);
    return { id: `hoja-${s.n}`, sheet: s.n, kind: bigKind(s.n), x: at[0], y: at[1], s: sc, moved };
  });
  const fresh = new Set(newArrivals(p).map(rewardKey));
  const rare = arrivedPlants(p).map((id) => {
    const [x, y, sc] = RARE_SLOTS[id];
    const { at, moved } = place(id, [x, y]);
    return { id, x: at[0], y: at[1], s: sc, moved, fresh: fresh.has(rewardKey({ kind: 'plant', id })) };
  });
  const pots = Object.keys(p.gold).slice(0, MAX_POTS).map((id, i) => ({ id, x: potAt(i), y: 590 }));
  const critters = arrivedCritters(p).map((id) => {
    const [x, y, sc] = CRITTER_HOMES[id];
    return { id, x, y, s: sc, fresh: fresh.has(rewardKey({ kind: 'critter', id })) };
  });
  return { seeds: shown, beds, big, rare, pots, critters, me: ME };
}

/** The ids the child may drag (the big plants and the special plants). */
export const movable = (g: Garden): string[] => [...g.big.map((b) => b.id), ...g.rare.map((r) => r.id)];

/** The soil a bed takes (the flowers of a bed in front may grow over the one behind it, as in any garden seen from the path). */
export const bedBox = (b: Pick<Bed, 'x' | 'y' | 's'>) => ({ x0: b.x - 76 * b.s, x1: b.x + 76 * b.s, y0: b.y - 30 * b.s, y1: b.y + 30 * b.s });
