// The monster games' registry (T43): one entry per game (kit.ts GAME_IDS),
// and what carries over between plays of a game in a session: how many
// times it was started (`play_no`, a pick of a game already played is a
// voluntary replay) and the hardest tier reached (the arcade opens it
// there). Kept in memory for the page's life, per session.

import { useEffect, useState, type ComponentType } from 'react';
import { usePlaytest } from '../context';
import type { LevelEnd } from '../PlaytestLevel';
import { arcadeStartTier, type GameId, type GameMode } from './kit';
import type { GameProps } from './Kit';
import { RecipeGame } from './Recipe';
import { RECIPE_MAX_TIER } from './recipe';
import { DanceGame } from './Dance';
import { DANCE_MAX_TIER } from './dance';
import { OopsGame } from './Oops';
import { OOPS_MAX_TIER } from './oops';
import { TapGame } from './Tap';
import { TAP_MAX_TIER } from './tap';

export interface GameEntry {
  Component: ComponentType<GameProps>;
  maxTier: number;
}

export const GAMES: Record<GameId, GameEntry> = {
  recipe: { Component: RecipeGame, maxTier: RECIPE_MAX_TIER },
  dance: { Component: DanceGame, maxTier: DANCE_MAX_TIER },
  oops: { Component: OopsGame, maxTier: OOPS_MAX_TIER },
  tap: { Component: TapGame, maxTier: TAP_MAX_TIER },
};

let memory: { sid: string; plays: Partial<Record<GameId, number>>; reached: Partial<Record<GameId, number>> } | null = null;
function mem(sid: string) {
  if (memory?.sid !== sid) memory = { sid, plays: {}, reached: {} };
  return memory;
}

/** One play of a game: the guided pass's (tier 1, `rounds` rounds) or an arcade pick (endless, from the tier reached). */
export function GamePlay({ id, mode, rounds, done, roundWon, stopAfterRound }: {
  id: GameId; mode: GameMode; rounds?: number; done(): void; roundWon?(end: LevelEnd): void; stopAfterRound?(): boolean;
}) {
  const api = usePlaytest();
  const sid = api.session?.id ?? '';
  const g = GAMES[id];
  // the survey's "¿Qué te gustó más?" offers it (an arcade pick already says so, FreePlay's `did`)
  useEffect(() => { if (mode === 'guided') api.did(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [play] = useState(() => {
    const m = mem(sid);
    const playNo = (m.plays[id] ?? 0) + 1;
    m.plays[id] = playNo;
    return { playNo, startTier: mode === 'guided' ? 1 : arcadeStartTier(m.reached[id], g.maxTier) };
  });
  const reached = (t: number) => { const m = mem(sid); m.reached[id] = Math.max(m.reached[id] ?? 1, t); };
  return (
    <g.Component
      mode={mode} startTier={play.startTier} rounds={rounds} playNo={play.playNo}
      done={done} roundWon={roundWon} stopAfterRound={stopAfterRound} reached={reached}
    />
  );
}
