// The motivation layer of 1ro's year as data (the approved plan, "Juego y
// motivación"): the four characters, the wardrobe's pieces and when each one
// unlocks, and what each sheet's boss sends to the garden. Progress is a
// growing world, not points: everything here is known in advance (the
// wardrobe and the garden show what is still to come as silhouettes), nothing
// is random, nothing is bought, and seeds are never spent. No imports: the
// progress store reads its stored values against these lists.

/** The four characters (ink/characters.js). Brote until the child picks one on sheet 1. */
export const CHARACTER_IDS = ['brote', 'mina', 'pliegue', 'ovillo'] as const;
export type CharacterId = typeof CHARACTER_IDS[number];
export const isCharacterId = (x: unknown): x is CharacterId => (CHARACTER_IDS as readonly unknown[]).includes(x);
/** For speech and the adult (es-AR). */
export const CHARACTER_NAME: Record<CharacterId, string> = { brote: 'Brote', mina: 'Mina', pliegue: 'Pliegue', ovillo: 'Ovillo' };

// ------------------------------------------------------------------ the wardrobe

/** Where a piece goes on a character: one piece per slot. */
export const SLOTS = ['head', 'neck', 'back', 'waist', 'feet'] as const;
export type Slot = typeof SLOTS[number];

export type ItemId = 'bufanda' | 'hongo' | 'mochila' | 'capa' | 'botas' | 'flotador' | 'corona';

/** When a piece unlocks: a number of seeds in the pouch (never spent), or a sheet finished. */
export type Unlock = { seeds: number } | { sheet: number };

export interface Item {
  id: ItemId;
  slot: Slot;
  /** Spoken (es-AR), with its article. */
  name: string;
  unlock: Unlock;
}

/**
 * The wardrobe of the forest and the river, in the order they unlock over a
 * year: the first seeds of the first class, the long paths of sheet 2, the
 * river after the music recess (sheet 9), the pond of sheet 13.
 */
export const ITEMS: readonly Item[] = [
  { id: 'bufanda', slot: 'neck', name: 'la bufanda', unlock: { seeds: 3 } },
  { id: 'hongo', slot: 'head', name: 'el gorro de hongo', unlock: { seeds: 10 } },
  { id: 'mochila', slot: 'back', name: 'la mochila de explorador', unlock: { sheet: 2 } },
  { id: 'capa', slot: 'back', name: 'la capa de hoja', unlock: { seeds: 25 } },
  { id: 'botas', slot: 'feet', name: 'las botas de lluvia', unlock: { sheet: 9 } },
  { id: 'flotador', slot: 'waist', name: 'el flotador de patito', unlock: { sheet: 13 } },
  { id: 'corona', slot: 'head', name: 'la corona de flores', unlock: { seeds: 50 } },
];
export const itemById = (id: string): Item | null => ITEMS.find((i) => i.id === id) ?? null;
export const isItemId = (x: unknown): x is ItemId => typeof x === 'string' && !!itemById(x);

/** What a character wears: one item per slot. */
export type Outfit = Readonly<Partial<Record<Slot, ItemId>>>;

// ------------------------------------------------------------------ what the bosses send to the garden

/** The garden's critters (1ro's list): six bosses spread over the year send one each. */
export const CRITTER_IDS = ['coati', 'lechuza', 'zorro', 'carpintero', 'carpincho', 'rana'] as const;
export type CritterId = typeof CRITTER_IDS[number];
export const isCritterId = (x: unknown): x is CritterId => (CRITTER_IDS as readonly unknown[]).includes(x);

/** The other bosses send a special plant. */
export const RARE_IDS = ['girasol', 'hongos', 'diente', 'helecho', 'juncos', 'nenufar', 'ceibo'] as const;
export type RareId = typeof RARE_IDS[number];

export type BossReward =
  | { sheet: number; kind: 'critter'; id: CritterId; name: string }
  | { sheet: number; kind: 'plant'; id: RareId; name: string };

/**
 * One reward per boss, known in advance (its silhouette waits on the boss
 * page and in the garden's row of who is still coming). The critters go where
 * they fit: the coatí walks the long paths (2), the owl says "hu-hu" again and
 * again (4, repeat), the fox climbs the staircase (6), the woodpecker drums the
 * music recess (9), the capybara waits by the river (10), the frog in the pond
 * (13); the plants fill the sheets between them.
 */
export const BOSS_REWARDS: readonly BossReward[] = [
  { sheet: 1, kind: 'plant', id: 'girasol', name: 'un girasol' },
  { sheet: 2, kind: 'critter', id: 'coati', name: 'el coatí' },
  { sheet: 3, kind: 'plant', id: 'hongos', name: 'una ronda de hongos' },
  { sheet: 4, kind: 'critter', id: 'lechuza', name: 'la lechuza' },
  { sheet: 5, kind: 'plant', id: 'diente', name: 'un diente de león' },
  { sheet: 6, kind: 'critter', id: 'zorro', name: 'el zorro' },
  { sheet: 8, kind: 'plant', id: 'helecho', name: 'un helecho' },
  { sheet: 9, kind: 'critter', id: 'carpintero', name: 'el pájaro carpintero' },
  { sheet: 10, kind: 'critter', id: 'carpincho', name: 'el carpincho' },
  { sheet: 11, kind: 'plant', id: 'juncos', name: 'unos juncos con una libélula' },
  { sheet: 12, kind: 'plant', id: 'nenufar', name: 'un nenúfar en flor' },
  { sheet: 13, kind: 'critter', id: 'rana', name: 'la rana' },
  { sheet: 14, kind: 'plant', id: 'ceibo', name: 'un ceibo en flor' },
];
export const rewardOf = (sheet: number): BossReward | null => BOSS_REWARDS.find((r) => r.sheet === sheet) ?? null;
export const critterReward = (id: CritterId) => BOSS_REWARDS.find((r) => r.kind === 'critter' && r.id === id)!;
/** A reward's key among the things already seen arriving (`critter:coati`, `plant:girasol`, `item:capa`). */
export const rewardKey = (r: Pick<BossReward, 'kind' | 'id'>) => `${r.kind}:${r.id}`;
export const itemKey = (id: ItemId) => `item:${id}`;
