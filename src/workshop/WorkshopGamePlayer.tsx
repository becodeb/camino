// "Tu juego" (T40, for T41's Arcade): the child's own "Al revés", played
// big and alone, with the best score to beat. It plays the project the
// Workshop saved for this session (store.ts) unless one is given; every
// run's points that beat the record become the new best (saved with the
// project, so the Workshop and the Arcade agree). Nothing here edits the
// game: the Workshop stays one tap away for that.

import { useRef, useState } from 'react';
import { usePlaytest } from '../playtest/context';
import { newProject } from './game';
import type { Project } from './model';
import { Stage, type RunResult, type StageHandle } from './Stage';
import { loadWorkshop, saveBest } from './store';
import './workshop.css';

export interface GamePlayerProps {
  /** The game to play (default: this session's saved Workshop project). */
  project?: Project;
  /** Every run's end, with the best score after it (the Arcade logs it as it sees fit). */
  onRun?(r: RunResult & { best: number; record: boolean }): void;
}

export function WorkshopGamePlayer({ project, onRun }: GamePlayerProps) {
  const sid = usePlaytest().session?.id ?? '';
  const [saved] = useState(() => loadWorkshop(sid));
  const game = project ?? saved?.project ?? newProject();
  const [best, setBest] = useState(saved?.progress.best ?? 0);
  const [record, setRecord] = useState(false);
  const stage = useRef<StageHandle>(null);
  const end = (r: RunResult) => {
    const isRecord = r.vars.puntos > best;
    const b = sid ? saveBest(sid, r.vars.puntos) : Math.max(best, r.vars.puntos);
    setBest(b);
    setRecord(isRecord);
    onRun?.({ ...r, best: b, record: isRecord });
  };
  return (
    <section className="ws-player" aria-label="Tu juego" data-best={best}>
      <header className="ws-player-head">
        <h2>Tu juego: «Al revés»</h2>
        <span className={`ws-player-best cut${record ? ' is-record' : ''}`}>{record ? '¡Récord! ' : 'Récord: '}<b>{best}</b> puntos</span>
      </header>
      <Stage ref={stage} project={game} monitors={['vidas', 'puntos']} keyboard overlays controls className="ws-player-stage" onStart={() => setRecord(false)} onEnd={end} />
      <p className="ws-player-tip">Espacio (o tocar el juego) para dar vuelta.</p>
    </section>
  );
}
