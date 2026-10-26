// Copa v2 (C10): the copa strip. The five copas as cards, each with its tracks,
// the medal (gold, silver, bronze) and the best time of every track the child
// has finished: it is the map of the Copa and also "Tu mejor tiempo" when the
// child comes back from the Arcade. The copas the child has reached can be
// tapped (the ones before the starting copa too: placement skips them, it
// never locks them); the ones ahead wait. One big button goes on.

import type { ReactNode } from 'react';
import { copaDone, copaFinishedHere, copasFinished, MEDAL_LABEL, type Journey, type Medal } from './journey';
import { COPAS, COPA_IDS, copaOf, type CopaId } from './tracks';
import { seconds } from './labels';
import './flow.css';

export type HubNote = 'placement' | 'copa_done' | 'skipped' | 'all_done' | 'back' | null;

const MEDAL_FILL: Record<Medal, string> = { gold: '#f0c94a', silver: '#d3d6df', bronze: '#d79a62' };

export function MedalDot({ medal, done, size = 30 }: { medal: Medal | null; done: boolean; size?: number }) {
  const label = medal ? `medalla de ${MEDAL_LABEL[medal]}` : done ? 'terminada' : 'sin jugar';
  return (
    <svg className={`hb-medal${medal ? ` is-${medal}` : done ? ' is-done' : ''}`} viewBox="0 0 30 30" width={size} height={size} role="img" aria-label={label}>
      <circle cx="15" cy="15" r="11" fill={medal ? MEDAL_FILL[medal] : done ? '#e9e3d3' : 'none'} stroke="#2b2622" strokeWidth="2.6" strokeDasharray={medal || done ? undefined : '4 3'} />
      {medal && <path d="M9.5,15.5 L13.5,19.5 L21,11" fill="none" stroke="#2b2622" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

export function Hub({ journey, note, arcadeOpen, onGoCopa, onGoTrack, onContinue, extra }: {
  journey: Journey; note: HubNote; arcadeOpen: boolean;
  onGoCopa(copa: CopaId): void; onGoTrack(trackId: string): void; onContinue(): void; extra?: ReactNode;
}) {
  const here = copaOf(journey.copa);
  const finished = copaFinishedHere(journey);
  const all = copasFinished(journey) >= 5;
  const nextId = (journey.copa + 1) as CopaId;
  let headline: string;
  let sub: string;
  let go: string;
  if (all || note === 'all_done') { headline = '¡Terminaste la Copa de 4to!'; sub = 'Podés volver a cualquier pista y mejorar tu tiempo.'; go = 'Volver a jugar'; }
  else if (note === 'placement') { headline = `Empezás en la Copa ${here.id}`; sub = here.concept; go = '¡A la pista!'; }
  else if (note === 'skipped') { headline = `¡Saltaste a la Copa ${here.id}!`; sub = here.concept; go = '¡A la pista!'; }
  else if ((note === 'copa_done' || note === 'back') && finished && nextId <= 5) { const n = copaOf(nextId); headline = `¡Copa ${journey.copa} completa!`; sub = `Sigue la Copa ${n.id}: ${n.name}. ${n.concept}`; go = `¡A la Copa ${n.id}!`; }
  else { headline = `Copa ${here.id}: ${here.name}`; sub = here.concept; go = note === 'back' ? 'Seguir' : '¡Seguir!'; }
  const nextCopa = finished && !all && nextId <= 5;
  return (
    <main className="hb-page" data-note={note ?? ''} data-copa={journey.copa}>
      <h1 className="hb-title">Copa de 4to</h1>
      <ol className="hb-strip" aria-label="Las cinco copas">
        {COPA_IDS.map((id) => {
          const c = COPAS[id - 1];
          const reachable = id <= journey.furthest || (id > 1 && copaDone(journey, (id - 1) as CopaId));
          const done = copaDone(journey, id);
          const skipped = journey.skipped.includes(id);
          return (
            <li key={id} className={`hb-copa${id === journey.copa ? ' is-here' : ''}${done ? ' is-done' : ''}${reachable ? '' : ' is-ahead'}`} data-copa={id}>
              <button type="button" className="cut hb-copa-head" disabled={!reachable} onClick={() => onGoCopa(id)} aria-label={`Copa ${id}: ${c.name}`}>
                <small>Copa {id}</small>
                <b>{c.name}</b>
              </button>
              <ul className="hb-tracks">
                {c.tracks.map((t) => {
                  const r = journey.tracks[t.id];
                  return (
                    <li key={t.id}>
                      <button type="button" className="hb-track" data-track={t.id} disabled={!reachable} onClick={() => onGoTrack(t.id)}>
                        <MedalDot medal={r?.medal ?? null} done={!!r?.done} size={26} />
                        <span className="hb-track-name">{t.name}</span>
                        <span className="hb-track-time">{r?.bestMs != null ? seconds(r.bestMs) : skipped ? 'saltada' : ''}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
      <section className="sheet hb-card">
        <h2 className="hb-headline">{headline}</h2>
        <p className="hb-sub">{sub}</p>
        <div className="hb-buttons">
          <button
            type="button" className="cut hb-go" data-act="hub-go"
            onClick={nextCopa ? () => onGoCopa(nextId) : onContinue}
          >
            {go}
          </button>
          {extra}
        </div>
        {arcadeOpen && <p className="hb-arcade">El Arcade está abierto: podés ir cuando quieras.</p>}
      </section>
    </main>
  );
}
