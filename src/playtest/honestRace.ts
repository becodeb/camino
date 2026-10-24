// Honest rivals (C02, 4to only): `race.ts`'s BAND rubber-bands the critters
// to the child's own pace, so the child always crosses first by a small
// margin — exactly what the 2026-10-20 4to class noticed and found flat
// ("everyone always wins"). An honest rival instead drives at a FIXED pace,
// completely independent of the child: three tiers, named like time-trial
// medals (bronze the slowest, gold the fastest). A genuinely good program
// can beat gold; a slow or careless one can lose to bronze. This module is
// pure and deterministic, so it is unit-tested (honestRace.test.ts); nothing
// here is wired into 1ro-3ro or 5to, whose races keep the band unchanged
// (TypingRace.tsx's `rivals` prop defaults to `'band'`; see its own test
// that 1ro still uses the band).
//
// Two paces are calibrated, for the two places this races against today:
//
// 1. Course units/s, for C03's Copa circuits (`race.ts`'s block race). The
//    real race's own timing constants (ZOOM_SPEED, TURBO_SPEED, and the
//    750ms BUMP_MS a wrong block locks input for) were used to simulate
//    three input policies — GOOD (900ms/block, ~1 wrong block total, turbo
//    taken whenever offered), OKAY (1500ms/block, a handful of wrong
//    blocks, turbo skipped) and SLOW (2600ms/block, many wrong blocks, no
//    turbo) — over `race.ts`'s own tier table (`RULES`, tiers 1-4). Their
//    simulated paces land close to 1.2-1.7 (good, higher on turbo-heavy
//    tiers, since GOOD always cashes the turbo in), 0.73-0.81 (okay) and
//    0.43-0.48 (slow) course units/s. HONEST_PACE sits just inside that
//    spread (1.1 / 0.75 / 0.45) so a program that plays well — especially
//    one that takes the turbo — clears gold, an okay one lands around
//    silver, and a slow or careless one sits around bronze, rather than
//    always finishing first or last. honestRace.test.ts reruns the same
//    three policies (over real `generateRace` output, not the rule table)
//    and checks that ordering.
// 2. Words per minute, for the typing race (`typingRace.ts`), per the
//    design doc: 6 (bronze), 10 (silver), 15 (gold) — the 4to pilot's own
//    median was 9.3 words per minute, so these three straddle a real
//    child's typical pace instead of sitting comfortably above or below
//    all of it.

import type { Course } from './race';
import { typedSpot } from './typingRace';

export type RivalTier = 'bronze' | 'silver' | 'gold';
export const RIVAL_TIERS: readonly RivalTier[] = ['bronze', 'silver', 'gold'];

// ------------------------------------------------------------------ the block race's pace (course units/s), for C03

/** Fixed pace, in course units per second, never adjusted to the child's own play. */
export const HONEST_PACE: Readonly<Record<RivalTier, number>> = { bronze: 0.45, silver: 0.75, gold: 1.1 };

/** When a fixed-pace rival crosses the finish line, ms from the moment both start racing. */
export const honestFinishMs = (tier: RivalTier, finish: number): number => (finish / HONEST_PACE[tier]) * 1000;

/** Where a fixed-pace rival sits after `elapsedMs`, capped at the finish line (never beyond: it waits there, like the band's own rivals do). */
export function honestPosition(tier: RivalTier, elapsedMs: number, finish: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.min(finish, (HONEST_PACE[tier] * elapsedMs) / 1000);
}

// ------------------------------------------------------------------ the typing race's pace (words per minute)

/** Fixed typing pace, in words per minute (a "word" is 5 characters, the usual way `wpm()` in typingRace.ts counts it too). */
export const HONEST_WPM: Readonly<Record<RivalTier, number>> = { bronze: 6, silver: 10, gold: 15 };

/** How long a fixed-pace rival takes to type one character, ms. */
export const msPerChar = (tier: RivalTier): number => 60_000 / (HONEST_WPM[tier] * 5);

/** How many characters the race's words are, the space between them included (the same count `RACE_CHARS`/`wpm()` use: every space typed, no trailing one). */
export const totalChars = (words: readonly string[]): number => words.reduce((n, w, i) => n + w.length + (i < words.length - 1 ? 1 : 0), 0);

/** When a fixed-pace rival finishes typing every word, ms from the moment both start racing. */
export const typingFinishMs = (tier: RivalTier, words: readonly string[]): number => totalChars(words) * msPerChar(tier);

/**
 * Where a fixed-pace rival sits on the track after `elapsedMs` of typing at
 * its fixed wpm, by walking the same words the child types (so it lands on
 * the same road the child's own kart does, via `typedSpot`).
 */
export function typingPosition(tier: RivalTier, elapsedMs: number, words: readonly string[], course: Pick<Course, 'starts' | 'ends' | 'finish'>): number {
  if (elapsedMs <= 0) return 0;
  let charsLeft = elapsedMs / msPerChar(tier);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const withSpace = w.length + (i < words.length - 1 ? 1 : 0);
    if (charsLeft < withSpace) return typedSpot(course.starts, course.ends, i, Math.min(charsLeft, w.length), w.length);
    charsLeft -= withSpace;
  }
  return course.finish;
}

// ------------------------------------------------------------------ which two tiers race today

/**
 * Only two animals race at once (the existing pair), so each race uses two
 * of the three tiers, cycling by race number like the critter pair already
 * does (`PAIRS[(no - 1) % PAIRS.length]` in Race.tsx/TypingRace.tsx): over a
 * session's races the child meets every pairing, including bronze+gold.
 */
export const RIVAL_TIER_PAIRS: readonly [RivalTier, RivalTier][] = [['bronze', 'silver'], ['silver', 'gold'], ['bronze', 'gold']];
export const rivalTiersFor = (raceNo: number): [RivalTier, RivalTier] => RIVAL_TIER_PAIRS[(Math.max(1, Math.floor(raceNo)) - 1) % RIVAL_TIER_PAIRS.length];

// ------------------------------------------------------------------ the result: place, margin, reason

export type ReasonCode = 'no_turbo' | 'crashes' | 'slow_idle' | 'fast_and_clean';

export interface HonestFacts {
  /** The child's own finish time, ms from the race's start (the same zero point as `rivalsMs`). */
  meMs: number;
  /** The two actual rivals' finish times, same units, in pair order. */
  rivalsMs: readonly [number, number];
  /** Block race only (0 for the typing race, which has no turbo). */
  turboOffered?: number;
  turboUsed?: number;
  wrongTotal: number;
  idleMs: number;
}

export interface HonestResult { place: 1 | 2 | 3; marginMs: number; reason: ReasonCode }

/** Who is racing: the child, or one of the two actual rivals (`pair[0]`/`pair[1]`). */
export type Racer = 'me' | 0 | 1;

/** The finishing order, fastest first (a tie favours the child). Used for the result screen's real podium slots. */
export function honestRanking(meMs: number, rivalsMs: readonly [number, number]): Racer[] {
  const entries: { id: Racer; ms: number }[] = [{ id: 'me', ms: meMs }, { id: 0, ms: rivalsMs[0] }, { id: 1, ms: rivalsMs[1] }];
  entries.sort((a, b) => a.ms - b.ms || (a.id === 'me' ? -1 : b.id === 'me' ? 1 : 0));
  return entries.map((e) => e.id);
}

/** The reason a result reads the way it does, from the race's own facts (never a guess: just the loudest signal). */
export function reasonFor(f: { place: 1 | 2 | 3; turboOffered: number; turboUsed: number; wrongTotal: number; idleMs: number }): ReasonCode {
  if (f.place === 1) return 'fast_and_clean';
  if (f.turboOffered > 0 && f.turboUsed === 0) return 'no_turbo';
  if (f.wrongTotal >= 3) return 'crashes';
  if (f.idleMs >= 4000) return 'slow_idle';
  return f.wrongTotal > 0 ? 'crashes' : 'slow_idle';
}

/**
 * Place (1-3), margin (ms to the next rival if won, to the rival that beat
 * you if not) and a reason, from the child's own finish time against the
 * two rivals racing today. A tie favours the child (place is never worse
 * than a rival it merely matched).
 */
export function honestResult(f: HonestFacts): HonestResult {
  const ranking = honestRanking(f.meMs, f.rivalsMs);
  const idx = ranking.indexOf('me');
  const place = (idx + 1) as 1 | 2 | 3;
  const msOf = (id: Racer) => (id === 'me' ? f.meMs : f.rivalsMs[id]);
  const marginMs = Math.max(0, Math.round(place === 1 ? msOf(ranking[idx + 1]) - f.meMs : f.meMs - msOf(ranking[idx - 1])));
  const reason = reasonFor({ place, turboOffered: f.turboOffered ?? 0, turboUsed: f.turboUsed ?? 0, wrongTotal: f.wrongTotal, idleMs: f.idleMs });
  return { place, marginMs, reason };
}

// ------------------------------------------------------------------ the kid-facing result line (Rioplatense Spanish)

const PLACE_WORD: Readonly<Record<1 | 2 | 3, string>> = { 1: '1ro', 2: '2do', 3: '3ro' };
const REASON_LINE: Readonly<Record<ReasonCode, (rivalName?: string) => string>> = {
  no_turbo: (rivalName) => `${rivalName ?? 'El rival'} usó turbo en la recta.`,
  crashes: () => 'Te chocaste varias veces.',
  slow_idle: () => 'Te quedaste pensando mucho rato.',
  fast_and_clean: () => '',
};

/** The result's big, in-screen Spanish line: "¡1ro por 2 s!" or "2do — te faltaron 3 s. El zorro usó turbo en la recta." */
export function resultLine(result: HonestResult, rivalName?: string): string {
  const s = Math.round(result.marginMs / 1000);
  if (result.place === 1) return `¡1ro por ${s} s!`;
  return `${PLACE_WORD[result.place]} — te faltaron ${s} s. ${REASON_LINE[result.reason](rivalName)}`.trim();
}
