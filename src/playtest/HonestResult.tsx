// C02's honest result screen (4to only): T33/T41's own `Podium` (Race.tsx)
// always draws "me" on the tallest, middle step — true in band mode, where
// the child always crosses first. Honest mode's result can be any of the
// three steps, so this screen draws whoever actually finished first/
// second/third (the child or either critter) in the matching pedestal,
// with the race's own big Spanish line (`resultLine`, honestRace.ts) and a
// reason when the child did not win. Reuses T33's own art (PodiumSteps,
// Cup, Shelf, AgainArt, PodiumMe) so it reads as the same podium, not a
// different screen. "¡Revancha!" (the same race again) sits next to the
// existing "¡Otra carrera!" (a new one).

import { useEffect, useState, type ReactNode } from 'react';
import type { CritterId } from '../curriculum/motivation';
import { speak } from '../ui/speech';
import { REDUCED } from '../ui/runtime';
import { CritterArt } from '../ui/critterArt';
import type { HonestResult as HonestResultData, Racer } from './honestRace';
import { resultLine } from './honestRace';
import { AgainArt, Cup, PodiumSteps, Shelf } from './raceArt';
import { NAME, PodiumMe } from './Race';

const AGAIN = '¡Otra carrera!';
const REVANCHA = '¡Revancha!';

export function HonestResultScreen({ pair, ranking, result, cups, won, onAgain, onRevancha, extra }: {
  pair: readonly [CritterId, CritterId];
  /** Fastest first: 'me' or the rival's index in `pair`. */
  ranking: readonly Racer[];
  result: HonestResultData;
  /** Cups on the shelf, including this race's if it was won. */
  cups: number;
  won: boolean;
  onAgain(): void;
  onRevancha(): void;
  extra?: ReactNode;
}) {
  const [fresh, setFresh] = useState(!won);
  useEffect(() => { if (!won) return; const t = setTimeout(() => setFresh(true), REDUCED ? 0 : 1700); return () => clearTimeout(t); }, [won]);
  const rivalName = ranking[0] !== 'me' ? NAME[pair[ranking[0]]] : undefined;
  const line = resultLine(result, rivalName);
  useEffect(() => { speak(line); }, [line]);
  // The pedestal per PodiumSteps (same translate targets the band's own Podium uses): 2nd on the left (shorter, scale 0.9),
  // 1st in the middle (tallest, PodiumMe's own x/y), 3rd on the right (scale 0.85).
  const SLOT: Record<1 | 2 | 3, { x: number; y: number; scale: number }> = {
    1: { x: 402, y: 140, scale: 1 }, 2: { x: 232, y: 200, scale: 0.9 }, 3: { x: 582, y: 230, scale: 0.85 },
  };
  const placeOf = (id: Racer) => (ranking.indexOf(id) + 1) as 1 | 2 | 3;
  return (
    <section className="sheet rc-podium rc-honest-podium" aria-label="El resultado" data-place={result.place} data-rival-mode="honest">
      <span className="tape tape-l" aria-hidden="true" />
      <span className="tape tape-r" aria-hidden="true" />
      <svg className="rc-podium-scene" viewBox="100 -60 640 380" role="img" aria-label={line}>
        <g className="rc-podium-sun" filter="url(#rough)">
          {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M410,40 L${410 + Math.cos((i * Math.PI) / 6) * 260},${40 + Math.sin((i * Math.PI) / 6) * 260}`} stroke="#f0d27a" strokeWidth={14} opacity={0.35} />)}
        </g>
        <PodiumSteps />
        {([0, 1] as const).map((r) => {
          const place = placeOf(r);
          const { x, y, scale } = SLOT[place];
          return (
            <g key={r} transform={`translate(${x} ${y})`}>
              <g className={`rc-podium-critter${place === 3 ? ' is-late' : ''}`}><g transform={`scale(${scale})`}><CritterArt id={pair[r]} bare /></g></g>
            </g>
          );
        })}
        {(() => { const { x, y } = SLOT[placeOf('me')]; return <PodiumMe x={x} y={y} win={result.place === 1} />; })()}
        <g transform="translate(478 140)" className="rc-podium-cup"><Cup seed={2} /></g>
      </svg>
      <p className="rc-honest-line">{line}</p>
      <div className="rc-shelf-box">
        <Shelf cups={fresh ? cups : Math.max(0, cups - (won ? 1 : 0))} fresh={fresh && won} />
        {extra}
      </div>
      <div className="rc-honest-buttons">
        <button type="button" className="cut rc-again" aria-label={AGAIN} onClick={() => { speak(AGAIN); onAgain(); }}>
          <AgainArt />
          <span className="rc-again-word" aria-hidden="true">{AGAIN}</span>
        </button>
        <button type="button" className="cut rc-again rc-revancha" aria-label={REVANCHA} onClick={() => { speak(REVANCHA); onRevancha(); }}>
          <span className="rc-revancha-flip"><AgainArt /></span>
          <span className="rc-again-word" aria-hidden="true">{REVANCHA}</span>
        </button>
      </div>
    </section>
  );
}
