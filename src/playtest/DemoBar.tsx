// The demo bar (T14): in a demo session only, docked on the right edge of
// the window (the page is laid out in the rest, so it never covers the
// board, the palette or the page's buttons), with a "DEMO" mark that shows
// on every screenshot. Each button says what it does, in plain words for
// el docente:
// - "Más rápido ×3": runs, moves, waits and animations three times faster;
// - "Saltar este nivel" (or round, game, step): what the screen on show
//   registered (demo.ts provideDemoActions), else the step;
// - "Resolver este nivel": the page plays its own solution;
// - "Ir a…": the steps by the names the children know;
// - "Mostrar que terminó": the route done (the green flag), free play;
// - "Terminar la sesión": the goodbye at once.
// Nothing here is logged as the child's: a demo session is never in the data.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePlaytest } from './context';
import { setFast, useDemo, useDemoActions } from './demo';
import type { StepId } from './flow';

/** "Ir a…": the steps, by the names the children hear. */
export const DEMO_STEPS: { step: StepId; label: string }[] = [
  { step: 'character', label: 'Elegir el personaje' },
  { step: 'tool_check', label: 'Probar los botones' },
  { step: 'ladder', label: 'La escalera' },
  { step: 'free_play', label: 'Jugar libre' },
  { step: 'typing', label: 'Teclas del bosque' },
  { step: 'wardrobe', label: 'El vestidor' },
  { step: 'survey', label: 'La encuesta' },
];

const NOUN = { nivel: 'este nivel', ronda: 'esta ronda', juego: 'este juego', paso: 'este paso' } as const;

export function DemoBar() {
  const api = usePlaytest();
  const demo = useDemo();
  const actions = useDemoActions();
  const [goto, setGoto] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const step = api.flow.step;
  const playing = step !== 'goodbye' && step !== 'class_end';

  // the page is laid out beside the bar while it shows
  useEffect(() => {
    document.documentElement.classList.add('pp-demo');
    return () => document.documentElement.classList.remove('pp-demo');
  }, []);
  useEffect(() => { if (!confirmEnd) return; const t = window.setTimeout(() => setConfirmEnd(false), 5000); return () => window.clearTimeout(t); }, [confirmEnd]);

  const noun = actions?.skip ? NOUN[actions.noun ?? 'nivel'] : NOUN.paso;
  const skip = () => {
    if (actions?.skip) actions.skip();
    else api.skip();
  };

  return createPortal(
    <aside className="pp-demo-bar" aria-label="Herramientas de la demo">
      <p className="pp-demo-mark" aria-label="Modo demo: esta sesión no se guarda en los datos">DEMO<small>no se guarda</small></p>
      <button type="button" className={`pp-demo-btn${demo.fast ? ' is-on' : ''}`} data-demo="fast" aria-pressed={demo.fast} onClick={() => setFast(!demo.fast)}>
        Más rápido ×3<small>{demo.fast ? 'activado: tocá para la velocidad normal' : 'animaciones y esperas'}</small>
      </button>
      <button type="button" className="pp-demo-btn" data-demo="skip" disabled={!playing} onClick={skip}>
        Saltar {noun}<small>pasa al siguiente</small>
      </button>
      <button type="button" className="pp-demo-btn" data-demo="solve" disabled={!actions?.solve || !playing} onClick={() => actions?.solve?.()}>
        Resolver {actions?.solve ? noun : 'este nivel'}<small>{actions?.solve ? 'lo juega solo' : 'no hay nivel en pantalla'}</small>
      </button>
      <button type="button" className={`pp-demo-btn${goto ? ' is-on' : ''}`} data-demo="goto" aria-expanded={goto} onClick={() => setGoto(!goto)}>
        Ir a…<small>elegir una parte</small>
      </button>
      {goto && (
        <ul className="pp-demo-list">
          {DEMO_STEPS.map((s) => (
            <li key={s.step}>
              <button type="button" className={`pp-demo-go${s.step === step ? ' is-here' : ''}`} data-goto={s.step} onClick={() => { setGoto(false); api.demoGoto(s.step); }}>{s.label}</button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="pp-demo-btn" data-demo="route-done" disabled={!playing || (!!api.flow.routeDone && step === 'free_play')} onClick={() => api.demoRouteDone()}>
        Mostrar que terminó<small>la bandera verde</small>
      </button>
      <button type="button" className={`pp-demo-btn is-end${confirmEnd ? ' is-on' : ''}`} data-demo="end" disabled={!playing} onClick={() => {
        if (!confirmEnd) { setConfirmEnd(true); return; }
        setConfirmEnd(false);
        api.demoEnd();
      }}>
        {confirmEnd ? '¿Seguro? Tocá otra vez' : 'Terminar la sesión'}<small>va a la despedida</small>
      </button>
    </aside>,
    document.body,
  );
}
