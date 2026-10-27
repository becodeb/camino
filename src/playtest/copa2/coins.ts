// 4to's coins (C14): the wardrobe's currency is the seed bag (progress.seeds,
// never spent: a piece opens when the bag reaches its number). 1ro to 3ro earn
// one seed per solved level; 4to earns more, from the Copa and the typing race,
// so the pieces of the wardrobe are within reach of a 4to class.
//
// Pure: the amounts, and a per-child LEDGER of what was already paid so that
// repeating a track (¡Revancha!) never farms coins. The ledger persists with
// the Copa's other memory (store.ts); the seeds themselves live in the
// progress, which already survives a reload.
//
//  Track: finish 2 (once) · beat the rival: bronze 2, silver 3, gold 5 (once per
//  tier per track) · first try win +1 (once) · a revancha that improves the best
//  time by 0.1 s or more +1. Ayudá al ciervo: fixed +2 (once per copa). A
//  correct Espiá: +1 (once per track). Typing race: finished 2, first place 5.

import { TIERS, type Tier } from './tracks';

export const COIN = {
  finish: 2,
  beat: { bronze: 2, silver: 3, gold: 5 } as Readonly<Record<Tier, number>>,
  firstTry: 1,
  improved: 1,
  deer: 2,
  spy: 1,
  typing: 2,
  typingFirst: 5,
} as const;

/** The smallest gain (ms) that counts as a better time. */
export const IMPROVE_MS = 100;

export type CoinSource = 'copa_track' | 'copa_beat' | 'copa_first_try' | 'copa_revancha' | 'copa_deer' | 'copa_spy' | 'typing_race';

/** One part of an award: logged as `coins_earned { source, amount }`. */
export interface CoinPart { source: CoinSource; amount: number }
export interface Award { amount: number; parts: CoinPart[] }
export const NO_AWARD: Award = { amount: 0, parts: [] };

interface TrackPaid { finish: boolean; beat: Tier[]; first: boolean; bestMs: number | null }
export interface Ledger { v: 1; tracks: Record<string, TrackPaid>; deer: number[]; spy: string[] }
export const emptyLedger = (): Ledger => ({ v: 1, tracks: {}, deer: [], spy: [] });

const total = (parts: CoinPart[]): Award => ({ amount: parts.reduce((n, p) => n + p.amount, 0), parts });

/** What a run that just showed its result earns. `firstRun`: it was the first ¡Largar! ever on this track. */
export function trackAward(
  ledger: Ledger, trackId: string,
  run: { finished: boolean; won: boolean; rival: Tier; timeMs: number; firstRun: boolean },
): { award: Award; ledger: Ledger } {
  if (!run.finished) return { award: NO_AWARD, ledger };
  const was = ledger.tracks[trackId] ?? { finish: false, beat: [], first: false, bestMs: null };
  const now: TrackPaid = { ...was, beat: [...was.beat] };
  const parts: CoinPart[] = [];
  if (!was.finish) { now.finish = true; parts.push({ source: 'copa_track', amount: COIN.finish }); }
  if (run.won && !was.beat.includes(run.rival)) { now.beat.push(run.rival); parts.push({ source: 'copa_beat', amount: COIN.beat[run.rival] }); }
  if (run.won && run.firstRun && !was.first) { now.first = true; parts.push({ source: 'copa_first_try', amount: COIN.firstTry }); }
  if (was.bestMs !== null && run.timeMs <= was.bestMs - IMPROVE_MS) parts.push({ source: 'copa_revancha', amount: COIN.improved });
  now.bestMs = was.bestMs === null ? run.timeMs : Math.min(was.bestMs, run.timeMs);
  return { award: total(parts), ledger: { ...ledger, tracks: { ...ledger.tracks, [trackId]: now } } };
}

/** The deer was fixed (not given up): once per copa. */
export function deerAward(ledger: Ledger, copa: number): { award: Award; ledger: Ledger } {
  if (ledger.deer.includes(copa)) return { award: NO_AWARD, ledger };
  return { award: total([{ source: 'copa_deer', amount: COIN.deer }]), ledger: { ...ledger, deer: [...ledger.deer, copa] } };
}

/** A correct Espiá answer: once per track. */
export function spyAward(ledger: Ledger, trackId: string): { award: Award; ledger: Ledger } {
  if (ledger.spy.includes(trackId)) return { award: NO_AWARD, ledger };
  return { award: total([{ source: 'copa_spy', amount: COIN.spy }]), ledger: { ...ledger, spy: [...ledger.spy, trackId] } };
}

/** A typing race that was finished: `place` is 1 for a win. Every race is a new event, so there is no ledger. */
export function typingAward(place: 1 | 2 | 3): Award {
  return total([{ source: 'typing_race', amount: place === 1 ? COIN.typingFirst : COIN.typing }]);
}

/** A stored ledger, or a fresh one when it is not one. */
export function parseLedger(raw: unknown): Ledger {
  const o = raw as Partial<Ledger> | null;
  if (!o || o.v !== 1 || typeof o.tracks !== 'object' || !o.tracks || !Array.isArray(o.deer) || !Array.isArray(o.spy)) return emptyLedger();
  const tracks: Record<string, TrackPaid> = {};
  for (const [id, t] of Object.entries(o.tracks)) {
    if (!t || typeof t !== 'object') continue;
    tracks[id] = {
      finish: !!t.finish, first: !!t.first,
      beat: Array.isArray(t.beat) ? t.beat.filter((x): x is Tier => (TIERS as readonly string[]).includes(x as string)) : [],
      bestMs: typeof t.bestMs === 'number' && Number.isFinite(t.bestMs) ? t.bestMs : null,
    };
  }
  return { v: 1, tracks, deer: o.deer.filter((n): n is number => typeof n === 'number'), spy: o.spy.filter((s): s is string => typeof s === 'string') };
}
