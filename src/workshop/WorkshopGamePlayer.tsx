// "Tu juego" (T40, for T41's Arcade): the child's own "Al revés", played
// big and alone, with the best score to beat. It plays the project the
// Workshop saved for this session (store.ts) unless one is given; every
// run's points that beat the record become the new best (saved with the
// project, so the Workshop and the Arcade agree). Nothing here edits the
// game: the Workshop stays one tap away for that (T41: `onImprove`, the
// "Mejorarlo en el taller" button). A project that is still unfinished (no
// flip yet, no points) plays just what was built: honest, and a reason to
// go back and improve it.

import { useEffect, useRef, useState } from 'react';
import { usePlaytest } from '../playtest/context';
import { DEBUG } from '../screens/levelKit';
import { newProject } from './game';
import type { Project } from './model';
import { Stage, type RunResult, type StageHandle } from './Stage';
import { loadWorkshop, saveBest } from './store';
import './workshop.css';

export interface GamePlayerProps {
  /** The game to play (default: this session's saved Workshop project). */
  project?: Project;
  /** A run started (▶, the green flag or "Jugar otra vez"). */
  onStart?(): void;
  /** Every run's end, with the best score after it (the Arcade logs it as it sees fit). */
  onRun?(r: RunResult & { best: number; record: boolean }): void;
  /** T41: "Mejorarlo en el taller" (absent: no such button). */
  onImprove?(): void;
}

/** The session's best while the page lives, also for a child with no Workshop save yet (a game never edited: nothing to keep it with). */
const bestMemory = new Map<string, number>();

export function WorkshopGamePlayer({ project, onStart, onRun, onImprove }: GamePlayerProps) {
  const sid = usePlaytest().session?.id ?? '';
  const [saved] = useState(() => loadWorkshop(sid));
  const game = project ?? saved?.project ?? newProject();
  const [best, setBest] = useState(() => Math.max(saved?.progress.best ?? 0, bestMemory.get(sid) ?? 0));
  const [record, setRecord] = useState(false);
  const [runs, setRuns] = useState(0);
  const [running, setRunning] = useState(false);
  const stage = useRef<StageHandle>(null);
  const rootRef = useRef<HTMLElement>(null);
  const end = (r: RunResult) => {
    const isRecord = r.vars.puntos > best;
    const b = Math.max(best, r.vars.puntos, sid ? saveBest(sid, r.vars.puntos) : 0);
    bestMemory.set(sid, b);
    setBest(b);
    setRecord(isRecord);
    setRuns((n) => n + 1);
    setRunning(false);
    onRun?.({ ...r, best: b, record: isRecord });
  };

  // space is the game's key: it never presses a button here that kept the focus ("Jugar otra vez" would restart the game)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== ' ') return;
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'BUTTON' && rootRef.current?.contains(t)) { e.preventDefault(); t.blur(); }
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
  }, []);

  // checks and screenshots (?debug only): run, poke the score, stop
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __gamePlayer: unknown }).__gamePlayer = {
      start: () => stage.current?.start(), stop: () => stage.current?.stop(), running: () => !!stage.current?.running(),
      poke: (v: Record<string, number>) => stage.current?.poke(v), press: (k: string) => stage.current?.press(k),
    };
    return () => { delete (window as unknown as { __gamePlayer?: unknown }).__gamePlayer; };
  }, []);

  return (
    <section ref={rootRef} className="ws-player" aria-label="Tu juego" data-best={best} data-runs={runs}>
      <h2 className="ws-player-title">Tu juego: «Al revés»</h2>
      <Stage
        ref={stage} project={game} monitors={['vidas', 'puntos']} keyboard overlays controls className="ws-player-stage"
        onStart={() => { setRecord(false); setRunning(true); onStart?.(); }} onEnd={end}
      />
      <aside className="ws-player-side">
        <p className={`ws-player-best cut${record ? ' is-record' : ''}`} data-record={record || undefined}>
          {record ? '¡Récord nuevo!' : 'Tu récord:'} <b>{best}</b>
        </p>
        {!running && (
          <button type="button" className="ws-player-go cut" data-act="play-again" onClick={() => stage.current?.start()}>
            {runs ? 'Jugar otra vez' : '¡Jugar!'}
          </button>
        )}
        {onImprove && <button type="button" className="ws-player-improve cut" data-act="improve" onClick={onImprove}>Mejorarlo en el taller</button>}
        <p className="ws-player-tip">Espacio (o tocar el juego) para dar vuelta.</p>
      </aside>
    </section>
  );
}
