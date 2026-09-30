// The playtest's steps, one component each, in STEP_VIEWS. A step is
// rendered while the flow is on it and gets the playtest's API from
// usePlaytest(): `next()` when it is done, `skip()` to leave it undone,
// `did(activity)` for the survey, `log()` for its events. Later tasks plug
// their step in here (T5: free_play and wardrobe; T6: typing) in place of
// the placeholder. T4's tool check and ladder: ToolCheck.tsx, Ladder.tsx;
// T5's free play and wardrobe: FreePlay.tsx, WardrobeStep.tsx.

import { useState, type ComponentType } from 'react';
import { ChoicePage } from '../screens/WardrobeScreen';
import { PlayerFace } from '../screens/player';
import { NextPageArt, PenRing } from '../ui/art';
import { usePlaytest } from './context';
import type { StepId } from './flow';
import { GRADES, GRADE_LABEL, STEP_NAME } from './labels';
import { AdultForm, Goodbye, Survey } from './closing';
import { FreePlay } from './FreePlay';
import { Ladder } from './Ladder';
import { ToolCheck } from './ToolCheck';
import { WardrobeStep } from './WardrobeStep';
import type { StartInput } from './telemetry';

export interface StepViewProps {
  /** The setup's "Empezar": a new session with this grade and division. */
  start(input: StartInput): void;
  /** The adult form's "Nueva sesión": back to the setup, fresh progress. */
  newSession(): void;
}

const DIVISIONS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

// ------------------------------------------------------------------ the adult's setup

function Setup({ start }: StepViewProps) {
  const [grade, setGrade] = useState<number | null>(null);
  const [division, setDivision] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const ready = grade != null && consent;
  return (
    <main className="pp-page pp-setup">
      <section className="sheet pp-card" aria-labelledby="pp-setup-title">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <h1 id="pp-setup-title" className="pp-adult-title">Prueba piloto de Camino <small>para el adulto</small></h1>

        <fieldset className="pp-field">
          <legend>Grado</legend>
          <div className="pp-grades">
            {GRADES.map((g) => (
              <button key={g} type="button" className={`pp-grade cut g${g}${grade === g ? ' is-on' : ''}`} aria-pressed={grade === g} onClick={() => setGrade(g)}>
                {GRADE_LABEL[g]}
                {grade === g && <PenRing seed={g + 2} />}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="pp-field">
          <legend>División <small>(si hace falta)</small></legend>
          <div className="pp-divisions">
            {DIVISIONS.map((d) => (
              <button key={d} type="button" className={`pp-div cut${division === d ? ' is-on' : ''}`} aria-pressed={division === d} onClick={() => setDivision(division === d ? null : d)}>{d}</button>
            ))}
          </div>
        </fieldset>

        <button type="button" className={`pp-consent cut${consent ? ' is-on' : ''}`} role="checkbox" aria-checked={consent} onClick={() => setConsent(!consent)}>
          <span className="pp-check" aria-hidden="true">{consent && <svg viewBox="0 0 24 24"><path d="M4,13 L10,19 L20,5" fill="none" stroke="#3d6ea5" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>
          <span>La escuela autorizó esta prueba; no se guardan nombres.</span>
        </button>

        <button type="button" className="btn btn-play cut pp-start" disabled={!ready} onClick={() => ready && start({ grade: grade!, division, consent })}>
          Empezar
        </button>
      </section>
    </main>
  );
}

// ------------------------------------------------------------------ the session code

function Code() {
  const { session, next } = usePlaytest();
  if (!session) return null;
  const [animal, n] = session.code.split(' ');
  return (
    <main className="pp-page pp-code">
      <section className="sheet pp-card" aria-label="Código de la sesión">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <p className="pp-adult-title">Código de esta sesión · {GRADE_LABEL[session.grade]}{session.division ? ` ${session.division}` : ''}</p>
        <p className="pp-code-word" data-code={session.code}>
          <span>{animal}</span> <span className="pp-code-n">{n}</span>
          <svg className="pp-code-under" viewBox="0 0 400 20" preserveAspectRatio="none" aria-hidden="true">
            <path d="M6,12 C90,4 180,16 260,9 S360,6 394,11" fill="none" stroke="#3d6ea5" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </p>
        <p className="pp-adult-note">Anotalo en tu hoja, sin el nombre del chico o la chica.</p>
        <button type="button" className="btn btn-play cut pp-start" onClick={next}>Empezar</button>
      </section>
    </main>
  );
}

// ------------------------------------------------------------------ the character

function Character() {
  const { next, log, did, session } = usePlaytest();
  return (
    <ChoicePage
      sheet={{ n: 0, say: '', title: 'Prueba piloto' }}
      pages={null}
      quit={null}
      title={<><b>Prueba piloto · personaje</b> {session ? `${session.code} · ${GRADE_LABEL[session.grade]}` : ''}</>}
      onPick={(id) => { log('choice', { activity: 'character', character: id }); did('character'); }}
      next={next}
    />
  );
}

// ------------------------------------------------------------------ steps still to come

/** A step later tasks build (free play, typing, wardrobe): a page to turn; leaving it is a skip. */
function Placeholder() {
  const { flow, skip } = usePlaytest();
  return (
    <main className="pp-page pp-soon">
      <section className="sheet pp-card" aria-label="Próximamente">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <PlayerFace className="pp-soon-face" />
        <p className="pp-adult-note">Próximamente: {STEP_NAME[flow.step]}</p>
        <button type="button" className="next-page cut" aria-label="Seguir" onClick={skip}><NextPageArt /></button>
      </section>
    </main>
  );
}

export const STEP_VIEWS: Record<StepId, ComponentType<StepViewProps>> = {
  setup: Setup,
  code: Code,
  character: Character,
  tool_check: ToolCheck,
  ladder: Ladder,
  free_play: FreePlay,
  typing: Placeholder,
  wardrobe: WardrobeStep,
  survey: Survey,
  goodbye: Goodbye,
  adult_form: AdultForm,
};
