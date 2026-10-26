// 1ro's `games` step (T43): the guided first pass through the monster games,
// each once, in a fixed order (kit.ts GUIDED), a few short rounds each
// (GUIDED_ROUNDS, or GUIDED_TURN_MS: the four games fit ~20 minutes; each
// game ends its own turn with kit.ts guidedTurnOver); a
// cheer between games; then the arcade (flow.ts: the green flag). "Quedan 5
// minutos" ends the pass after the round on screen.

import { useState } from 'react';
import { usePlaytest } from '../context';
import { wrapPending } from '../flow';
import { Cheer } from '../interlude';
import { rememberPart, resumedPart } from '../resume';
import { GamePlay } from './games';
import { GUIDED, GUIDED_ROUNDS } from './kit';

const LINES = {
  between: '¡Muy bien! ¡Ahora otro juego!',
  end: '¡Muy bien! Ahora elegí vos a qué jugar.',
};

export function GuidedGames() {
  const api = usePlaytest();
  // a reloaded tab goes on with the game it was on
  const [i, setI] = useState(() => Math.min(GUIDED.length, resumedPart<{ i: number }>('games')?.i ?? 0));
  const [cheer, setCheer] = useState(false);
  const go = (n: number) => { rememberPart('games', { i: n }); setI(n); };
  const finished = () => {
    if (wrapPending(api.flow) || i + 1 >= GUIDED.length) { go(GUIDED.length); setCheer(true); return; }
    go(i + 1);
    setCheer(true);
  };
  if (cheer || i >= GUIDED.length) {
    const last = i >= GUIDED.length;
    return <Cheer key={`cheer-${i}`} line={last ? '¡A jugar!' : '¡Otro juego!'} say={last ? LINES.end : LINES.between} done={() => { setCheer(false); if (last) api.next(); }} autoMs={3500} />;
  }
  return <GamePlay key={i} id={GUIDED[i]} mode="guided" rounds={GUIDED_ROUNDS} done={finished} stopAfterRound={() => wrapPending(api.flow)} />;
}
