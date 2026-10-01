// The playtest's steps, one component each, in STEP_VIEWS. A step is
// rendered while the flow is on it and gets the playtest's API from
// usePlaytest(): `next()` when it is done, `skip()` to leave it undone,
// `did(activity)` for the survey, `log()` for its events. Later tasks plug
// their step in here. T4's tool check and ladder: ToolCheck.tsx, Ladder.tsx;
// T5's free play and wardrobe: FreePlay.tsx, WardrobeStep.tsx; T6's typing
// minigame: TypingStep.tsx.
// Round 2: the setup is one tap on the grade (the child can do it); there is
// no session-code screen and no adult-form step (the adult's comment is in
// the corner menu; the goodbye starts the next session).

import { useEffect, useState, type ComponentType, type CSSProperties } from 'react';
import { ChoicePage } from '../screens/WardrobeScreen';
import { PlayerFace } from '../screens/player';
import { SpeakerIcon } from '../ui/icons';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { captionsFor, type CaptionsSetting } from './captions';
import { usePlaytest } from './context';
import type { StepId } from './flow';
import { GRADES, GRADE_LABEL } from './labels';
import { Goodbye, Survey } from './closing';
import { CaptionsIcon, GradeArt } from './round2Art';
import { FreePlay } from './FreePlay';
import { Ladder } from './Ladder';
import { ToolCheck } from './ToolCheck';
import { TypingStep } from './TypingStep';
import { WardrobeStep } from './WardrobeStep';
import type { StartInput } from './telemetry';
import { ClassEnd } from './classroom';
import { useHold } from './AdultControls';
import { demoMode, useDemo } from './demo';

export interface StepViewProps {
  /** The setup's grade tap: a new session with this grade, division and on-screen text. */
  start(input: StartInput): void;
  /** The goodbye's "jugar otra vez" (or its time): back to the setup, fresh progress. */
  newSession(): void;
}

// ------------------------------------------------------------------ the setup: one tap

const SETUP_SAY = '¡Hola! ¿En qué grado estás? Tocá tu grado.';
const CAPTION_CHOICES: { v: CaptionsSetting; label: string }[] = [
  { v: 'auto', label: 'Automático (desde 3ro)' },
  { v: 'on', label: 'Siempre' },
  { v: 'off', label: 'Nunca' },
];

/**
 * One screen anyone can do: "¿En qué grado estás?" said aloud (🔊 again),
 * five big drawn grade cards, and the tap on a grade starts. Before it, the
 * adult may set the on-screen text (small, secondary). The classroom round
 * (T14) dropped the division buttons: `division` is stored as null.
 */
function Setup({ start }: StepViewProps) {
  const [cap, setCap] = useState<CaptionsSetting>('auto');
  const demo = useDemo();
  useEffect(() => {
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(SETUP_SAY); }, 450);
    return () => { clearTimeout(t); off(); };
  }, []);
  const go = (g: number) => {
    stopSpeaking();
    start({ grade: g, division: null, captions: captionsFor(g, cap), captionsSet: cap === 'auto' ? 'grade' : 'setup', ...(demo.on ? { demo: true } : {}) });
  };
  return (
    <main className={`pp-page pp-setup${demo.on ? ' is-demo' : ''}`}>
      <header className="pp-setup-q">
        <button type="button" className="speak cut" aria-label="Escuchar otra vez" onClick={() => speak(SETUP_SAY)}><SpeakerIcon /></button>
        <PlayerFace className="bar-face" />
        <h1 id="pp-setup-title">¿En qué grado estás?</h1>
      </header>
      <ul className="pp-grade-cards" aria-labelledby="pp-setup-title">
        {GRADES.map((g, i) => (
          <li key={g} style={{ '--tilt': `${[-1.6, 1.1, -0.7, 1.4, -1.2][i]}deg` } as CSSProperties}>
            <button type="button" className={`pp-grade-card cut g${g}`} data-grade={g} aria-label={GRADE_LABEL[g]} onClick={() => go(g)}>
              <span className="pp-grade-n" aria-hidden="true">{GRADE_LABEL[g]}</span>
              <GradeArt g={g} />
            </button>
          </li>
        ))}
      </ul>
      <section className="pp-setup-adult" aria-label="Para el adulto (opcional)">
        <div className="pp-setup-row">
          <span className="pp-setup-label"><CaptionsIcon on={cap !== 'off'} /> Texto en pantalla</span>
          <div className="pp-divisions">
            {CAPTION_CHOICES.map((c) => (
              <button key={c.v} type="button" className={`pp-div pp-cap-choice cut${cap === c.v ? ' is-on' : ''}`} data-captions={c.v} aria-pressed={cap === c.v} onClick={() => setCap(c.v)}>{c.label}</button>
            ))}
          </div>
        </div>
      </section>
      <DemoToggle />
    </main>
  );
}

/** How long the adult holds the setup's tiny "demo" word before the confirm (a child tapping it gets nothing). */
export const DEMO_HOLD_MS = 2000;

/**
 * The demo mode's discreet switch (T14): a tiny "demo" word in the bottom
 * corner; held 2 s, it asks the adult to confirm. On, the setup says so
 * with a "DEMO" stamp and a way out; every session started then is a demo
 * session (not in the data, deleted after 24 h) with the demo bar.
 */
function DemoToggle() {
  const demo = useDemo();
  const [ask, setAsk] = useState(false);
  const [hold, setHold] = useState<number | null>(null);
  useHold(DEMO_HOLD_MS, (e) => !demo.on && !!(e.target as Element | null)?.closest?.('.pp-demo-link'), () => setAsk(true), setHold);
  if (demo.on) {
    return (
      <div className="pp-demo-on" role="status">
        <span className="pp-demo-stamp">DEMO</span>
        <span>Modo demo: las sesiones no se guardan en los datos.</span>
        <button type="button" className="pp-div cut" data-demo="off" onClick={() => demoMode.setOn(false)}>Salir del modo demo</button>
      </div>
    );
  }
  return (
    <>
      <button type="button" className="pp-demo-link" aria-label="Modo demo (para el adulto: mantené apretado)" style={hold != null ? { ['--hold' as string]: hold } : undefined}>demo</button>
      {ask && (
        <div className="pp-adult-veil" role="dialog" aria-modal="true" aria-label="Modo demo">
          <section className="sheet pp-adult-sheet pp-demo-ask">
            <span className="tape tape-l" aria-hidden="true" />
            <h2 className="pp-adult-h">¿Activar el modo demo?</h2>
            <p className="pp-adult-note">Para mostrar o probar la prueba. Las sesiones de demo no se guardan en los datos (se borran solas en un día) y tienen una barra de herramientas: más rápido, saltar o resolver un nivel, ir a cualquier parte.</p>
            <div className="pp-kinds">
              <button type="button" className="pp-adult-btn cut" data-demo="confirm" onClick={() => { demoMode.setOn(true); setAsk(false); }}>Sí, modo demo</button>
              <button type="button" className="pp-adult-btn cut" data-demo="cancel" onClick={() => setAsk(false)}>No, volver</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ the character

function Character() {
  const { next, log, did } = usePlaytest();
  return (
    <ChoicePage
      sheet={{ n: 0, say: '', title: 'Prueba piloto' }}
      pages={null}
      quit={null}
      title={<b>Tu personaje</b>}
      onPick={(id) => { log('choice', { activity: 'character', character: id }); did('character'); }}
      next={next}
    />
  );
}

export const STEP_VIEWS: Record<StepId, ComponentType<StepViewProps>> = {
  setup: Setup,
  character: Character,
  tool_check: ToolCheck,
  ladder: Ladder,
  free_play: FreePlay,
  typing: TypingStep,
  wardrobe: WardrobeStep,
  survey: Survey,
  goodbye: Goodbye,
  class_end: ClassEnd,
};
