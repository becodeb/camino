// "Tu juego" (T41, 4to's Arcade): the child's own "Al revés" from the
// Workshop, played full-size (WorkshopGamePlayer), with the session's best
// score ("Tu récord: N"), "Jugar otra vez" and "Mejorarlo en el taller",
// which goes back to the Workshop. Whatever the child built plays as it is:
// a game still without its flip or its points is honest about it, and a
// reason to go and improve it. Every child in the Arcade gets it, also one
// who reached it with "Juegos para todos" before Workshop challenge 5.
//
// Logged: `own_game_run` {ms, points, result, best, record} at every run's
// end (`result: 'left'` when the child leaves mid-run), `help` and `speak`
// with `level_id: 'own_game'` (docs/prueba-piloto-datos.md).

import { useEffect, useRef } from 'react';
import { Bar } from '../screens/LevelBar';
import { PlayerFace } from '../screens/player';
import { SeedPouch } from '../screens/yearKit';
import { ThenArrow } from '../ui/art';
import { glowTargets } from '../ui/ghost';
import { speak, speakWhenAllowed } from '../ui/speech';
import { WorkshopGamePlayer } from '../workshop/WorkshopGamePlayer';
import { WorkshopCardArt } from '../workshop/art';
import { loadWorkshop } from '../workshop/store';
import { usePlaytest } from './context';

const LEVEL_ID = 'own_game';
const LINES = {
  open: 'Tu juego, el que hiciste en el taller. ¡Superá tu récord!',
  help: 'Tocá la bandera verde o «Jugar» para empezar. Con espacio das vuelta. Si querés cambiar algo, tocá «Mejorarlo en el taller».',
};

export function OwnGame({ improve }: { improve(): void }) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const rootRef = useRef<HTMLElement>(null);
  /** The run on screen (for a child who leaves mid-run), and the best so far. */
  const run = useRef<{ at: number } | null>(null);
  const best = useRef(loadWorkshop(api.session?.id)?.progress.best ?? 0);
  const help = useRef(0);

  useEffect(() => {
    apiRef.current.level.current = { id: LEVEL_ID, helpStep: 0, adultHelped: false };
    const off = speakWhenAllowed(LINES.open);
    return () => {
      off();
      const r = run.current;
      if (r) apiRef.current.log('own_game_run', { ms: Date.now() - r.at, points: null, result: 'left', best: best.current, record: false });
      apiRef.current.level.current = null;
    };
  }, []);

  const onHelp = () => {
    const a = apiRef.current;
    if (help.current >= 3) { a.raiseHand('help_step_3'); return; }
    help.current++;
    if (a.level.current) a.level.current.helpStep = help.current;
    a.log('help', { level_id: LEVEL_ID, step: help.current });
    speak(LINES.help);
    if (rootRef.current) glowTargets(rootRef.current, 3000);
  };

  return (
    <main ref={rootRef} className="pp-page pp-own" data-activity="own_game">
      <Bar
        instruction={<span className="drawn-task" aria-hidden="true"><PlayerFace className="bar-face" /><ThenArrow /><span className="pp-own-task"><WorkshopCardArt /></span></span>}
        title={<b>Tu juego</b>}
        pages={null}
        aside={<SeedPouch />}
        onSpeak={() => { apiRef.current.log('speak', { level_id: LEVEL_ID }); speak(LINES.open); }}
        onHelp={onHelp}
      />
      <WorkshopGamePlayer
        onStart={() => { run.current = { at: Date.now() }; }}
        onRun={(r) => {
          run.current = null;
          best.current = r.best;
          apiRef.current.log('own_game_run', { ms: r.ms, points: r.vars.puntos ?? 0, result: r.result, best: r.best, record: r.record, frames: r.frames });
        }}
        onImprove={() => { apiRef.current.log('own_game_improve', {}); improve(); }}
      />
    </main>
  );
}
