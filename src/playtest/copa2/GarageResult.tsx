// Copa v2 garage: the result screen. The same podium art as every honest race
// (PodiumSteps, PodiumMe, the critters), with Copa v2's own truthful line: the
// place against the rival tier, by how much, and WHY (rivals.ts reason codes,
// from what the run really did). ¡Revancha! goes back to the garage with the
// same program; ¡Seguir! hands the result to the flow.

import { useEffect } from 'react';
import type { CritterId } from '../../curriculum/motivation';
import { speak } from '../../ui/speech';
import { CritterArt } from '../../ui/critterArt';
import { AgainArt, Cup, FlagIcon, PodiumSteps } from '../raceArt';
import { NAME, PodiumMe } from '../Race';
import { RIVAL_ANIMAL, type RaceResult } from './rivals';
import type { SimResult } from './sim';
import type { Tier, TrackSpec } from './tracks';
import { rivalTargets } from './tracks';
import { PLACE_WORD, aAnimal, reasonText, seconds } from './labels';

type Racer = 'me' | 0 | 1;

/** Fastest first. A rival wins a tie (the child must be strictly under the target, as `raceResult` says). */
export function podiumOrder(timeMs: number, field: readonly [Tier, Tier], track: TrackSpec): Racer[] {
  const t = rivalTargets(track);
  const all: { id: Racer; ms: number; tie: number }[] = [
    { id: 0, ms: t[field[0]], tie: 0 }, { id: 1, ms: t[field[1]], tie: 1 }, { id: 'me', ms: timeMs, tie: 2 },
  ];
  return all.sort((a, b) => a.ms - b.ms || a.tie - b.tie).map((x) => x.id);
}

const SLOT: Record<1 | 2 | 3, { x: number; y: number; scale: number }> = {
  1: { x: 402, y: 140, scale: 1 }, 2: { x: 232, y: 200, scale: 0.9 }, 3: { x: 582, y: 230, scale: 0.85 },
};

/** The words of the result: the headline (place and margin) and the reason. */
export function resultWords(result: RaceResult, sim: SimResult): { headline: string; reason: string } {
  const animal = RIVAL_ANIMAL[result.rival];
  const rivalName = NAME[animal];
  const margin = Math.abs(result.marginMs ?? 0);
  const headline = result.won
    ? `¡Ganaste! Le sacaste ${seconds(margin)} ${aAnimal(rivalName)}.`
    : `${PLACE_WORD[result.place]}: te faltaron ${seconds(margin)} para ganarle ${aAnimal(rivalName)}.`;
  const reason = reasonText(result.reason, {
    rivalName, rivalIsFox: animal === 'zorro', skids: sim.stats.skids, sputters: sim.stats.sputters, wastedJumps: sim.stats.wastedJumps,
  });
  return { headline, reason };
}

/** "del zorro": the animals' names come with their article ("el zorro", "la rana"). */
export const delAnimal = (name: string): string => (name.startsWith('el ') ? `del ${name.slice(3)}` : `de ${name}`);

export function GarageResult({ track, sim, result, onRevancha, onNext, onSpy, onSkip }: {
  track: TrackSpec; sim: SimResult; result: RaceResult; onRevancha(): void; onNext(): void;
  /** After a loss: look at the rival's program before trying again (C10). */
  onSpy?(): void;
  /** The first-run silver finish of a copa's first track: go to the next copa (C10). */
  onSkip?(): void;
}) {
  const pair: readonly [CritterId, CritterId] = [RIVAL_ANIMAL[result.field[0]], RIVAL_ANIMAL[result.field[1]]];
  const order = podiumOrder(sim.timeMs, result.field, track);
  const placeOf = (r: Racer) => (order.indexOf(r) + 1) as 1 | 2 | 3;
  const { headline, reason } = resultWords(result, sim);
  useEffect(() => { speak(`${headline} ${reason}`); }, [headline, reason]);
  return (
    <main className="pp-page pp-race is-podium gx-result-page" data-place={result.place} data-won={result.won ? 1 : 0}>
      <section className="sheet rc-podium rc-honest-podium gx-result" aria-label="El resultado">
        <svg className="rc-podium-scene" viewBox="100 -60 640 380" role="img" aria-label={headline}>
          <PodiumSteps />
          {([0, 1] as const).map((r) => {
            const { x, y, scale } = SLOT[placeOf(r)];
            return (
              <g key={r} transform={`translate(${x} ${y})`}>
                <g className={`rc-podium-critter${placeOf(r) === 3 ? ' is-late' : ''}`}><g transform={`scale(${scale})`}><CritterArt id={pair[r]} bare /></g></g>
              </g>
            );
          })}
          {(() => { const { x, y } = SLOT[placeOf('me')]; return <PodiumMe x={x} y={y} win={result.place === 1} />; })()}
          {result.won && <g transform="translate(478 140)" className="rc-podium-cup"><Cup seed={2} /></g>}
        </svg>
        <div className="gx-result-text">
          <p className="gx-result-line">{headline}</p>
          <p className="gx-result-reason">{reason}</p>
          <p className="gx-result-times">Tu programa: <b>{seconds(sim.timeMs)}</b></p>
        </div>
        {(onSkip || onSpy) && (
          <div className="gx-result-extra">
          {onSkip && (
            <button type="button" className="cut gx-skip" data-act="skip-copa" onClick={onSkip}>
              <FlagIcon size={44} />
              <span>¡Saltar a la copa siguiente!</span>
            </button>
          )}
          {onSpy && (
            <button type="button" className="cut gx-spy-btn" data-act="spy" onClick={onSpy}>
              <svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true"><circle cx="13" cy="13" r="8" fill="#fbf7ee" stroke="#2b2622" strokeWidth="3" /><path d="M19,19 L28,28" stroke="#2b2622" strokeWidth="4" strokeLinecap="round" /></svg>
              <span>Espiá el programa {delAnimal(NAME[RIVAL_ANIMAL[result.rival]])}</span>
            </button>
          )}
          </div>
        )}
        <div className="rc-honest-buttons">
          <button type="button" className="cut rc-again rc-revancha gx-revancha" onClick={onRevancha}>
            <span className="rc-revancha-flip"><AgainArt /></span>
            <span className="rc-again-word" aria-hidden="true">¡Revancha!</span>
          </button>
          <button type="button" className="cut rc-again gx-seguir" onClick={onNext}>
            <FlagIcon size={40} />
            <span className="rc-again-word" aria-hidden="true">¡Seguir!</span>
          </button>
        </div>
      </section>
    </main>
  );
}
