// What the progress has earned in the motivation layer, derived (never
// stored twice): the wardrobe's pieces unlocked by seeds and finished sheets,
// what the character wears, the critters and special plants the bosses sent
// to the garden, and what is still coming. The dev drawer's gifts count too.
// Nothing here is spent or taken away: seeds only grow, sheets stay finished.

import { sheetByN } from './primer';
import { bossId } from './model';
import { setOutfit, sheetState, type Progress } from './progress';
import {
  BOSS_REWARDS, ITEMS, SLOTS, itemById, itemKey, rewardKey,
  type BossReward, type CritterId, type Item, type ItemId, type Outfit, type RareId, type Slot, type Unlock,
} from './motivation';

/** A sheet counts as finished for the wardrobe when it carries its stamp on the map. */
const finished = (n: number, p: Progress) => {
  const s = sheetByN(n);
  return !!s && sheetState(s, p).complete;
};

/** Whether an unlock condition is met (seeds in the pouch, or a sheet finished). */
export const reached = (u: Unlock, p: Progress) => ('seeds' in u ? p.seeds >= u.seeds : finished(u.sheet, p));

/**
 * Other milestones for a while (the pilot playtest unlocks the pieces at a
 * few seeds of one session); null goes back to the year's. Nothing is
 * stored: it is how the pieces are read while it is set.
 */
let unlocks: Partial<Record<ItemId, Unlock>> | null = null;
export function setUnlocks(table: Partial<Record<ItemId, Unlock>> | null): void {
  unlocks = table;
}
/** What unlocks a piece (the year's milestone, or the one set by setUnlocks). */
export const unlockOf = (item: Item): Unlock => unlocks?.[item.id] ?? item.unlock;

/** Unlocked: its milestone reached, or given by the dev drawer. */
export const isUnlocked = (item: Item, p: Progress) => !!p.items[item.id] || reached(unlockOf(item), p);

export const unlockedItems = (p: Progress): ItemId[] => ITEMS.filter((i) => isUnlocked(i, p)).map((i) => i.id);

/** What the character wears: the stored outfit, unlocked pieces only. */
export function outfitOf(p: Progress): Outfit {
  const out: Partial<Record<Slot, ItemId>> = {};
  for (const slot of SLOTS) {
    const id = p.outfit[slot];
    const item = id ? itemById(id) : null;
    if (item && item.slot === slot && isUnlocked(item, p)) out[slot] = item.id;
  }
  return out;
}

/** Wears an unlocked piece (it takes its slot), or takes it off if it is worn. A locked piece changes nothing. */
export function wear(p: Progress, id: ItemId): Progress {
  const item = itemById(id);
  if (!item || !isUnlocked(item, p)) return p;
  return setOutfit(p, item.slot, outfitOf(p)[item.slot] === id ? null : id);
}

/** The pieces unlocked that were never greeted in the wardrobe (a sparkle on each, once). */
export const newItems = (p: Progress): ItemId[] => unlockedItems(p).filter((id) => !p.seen[itemKey(id)]);

// ------------------------------------------------------------------ the garden's guests

/** A boss's reward is in the garden once its boss is solved (or the dev drawer sent the critter). */
export const hasArrived = (r: BossReward, p: Progress) =>
  !!p.solved[bossId({ grade: '1ro', n: r.sheet })] || (r.kind === 'critter' && !!p.critters[r.id]);

export const arrivedCritters = (p: Progress): CritterId[] =>
  BOSS_REWARDS.filter((r): r is Extract<BossReward, { kind: 'critter' }> => r.kind === 'critter' && hasArrived(r, p)).map((r) => r.id);
export const arrivedPlants = (p: Progress): RareId[] =>
  BOSS_REWARDS.filter((r): r is Extract<BossReward, { kind: 'plant' }> => r.kind === 'plant' && hasArrived(r, p)).map((r) => r.id);

/** Who is still coming, in the year's order (the garden's row of silhouettes). */
export const stillComing = (p: Progress): BossReward[] => BOSS_REWARDS.filter((r) => !hasArrived(r, p));

/** Rewards in the garden that were never shown arriving (they walk or grow in once). */
export const newArrivals = (p: Progress): BossReward[] => BOSS_REWARDS.filter((r) => hasArrived(r, p) && !p.seen[rewardKey(r)]);

// ------------------------------------------------------------------ what is said about them (es-AR)

/** "Se abre cuando juntes 25 semillas." / "Se abre cuando termines la hoja 9." */
export const unlockSay = (u: Unlock) => ('seeds' in u ? `Se abre cuando juntes ${u.seeds} semillas.` : `Se abre cuando termines la hoja ${u.sheet}.`);

/** "La lechuza llega cuando ganes el desafío de la hoja 4." */
export const comingSay = (r: BossReward) => `${cap(r.name)} ${plural(r) ? 'llegan' : 'llega'} cuando ganes el desafío de la hoja ${r.sheet}.`;

/** "¡El coatí se va a vivir a tu jardín!" / "¡Un girasol crece en tu jardín!" */
export const arrivalSay = (r: BossReward) =>
  (r.kind === 'critter' ? `¡${cap(r.name)} se va a vivir a tu jardín!` : `¡${cap(r.name)} ${plural(r) ? 'crecen' : 'crece'} en tu jardín!`);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (r: BossReward) => /^un[oa]s /.test(r.name);
