// The end of a session.
// - The survey: four spoken questions (🔊 says each one again), answered by
//   tapping drawn faces or pictures, never by reading. "¿Qué te gustó más?"
//   shows only the activities the child did (asked when there are two or
//   more). Each answer is a `survey_answer`; all of them go on the session.
// - The goodbye: the character, alive, the seeds this session grew, and the
//   session code again for the adult; a small "para el adulto" link.
// - The adult form (after the child leaves): engagement, help needed, a
//   comment without names; then a new session.

import { useEffect, useRef, useState } from 'react';
import { CHARACTER_NAME, isCharacterId } from '../curriculum/motivation';
import { useProgress } from '../curriculum/progress';
import { PlayerFace, usePlayer, useStage } from '../screens/player';
import { PenRing, SeedIcon } from '../ui/art';
import { SpeakerIcon } from '../ui/icons';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { SyncDot } from './AdultControls';
import { usePlaytest } from './context';
import { ActivityPicture, Face, YesNo } from './surveyArt';
import type { StepViewProps } from './steps';
import { GRADE_LABEL } from './labels';

type QuestionId = 'liked' | 'difficulty' | 'favorite_activity' | 'play_again';
interface Option { value: string; word: string; art: React.ReactNode }
interface Question { id: QuestionId; say: string; adult: string; options: Option[] }

/** How each activity is named aloud when its picture is tapped. */
const ACTIVITY_WORD: Record<string, string> = {
  character: 'Elegir personaje', ladder: 'Los caminos', tool_check: 'Probar las herramientas', typing: 'Las teclas',
  wardrobe: 'El vestidor', free_play: 'Jugar libre', sheet: 'Una hoja', recess: 'La música', guardas: 'Las guardas',
  editor: 'Hacer un nivel', corkboard: 'La cartelera', rule_game: 'El juego de reglas', game_maker: 'Hacer tu juego', text_probe: 'Bloques y texto',
};

export function surveyQuestions(activities: readonly string[]): Question[] {
  const qs: Question[] = [
    {
      id: 'liked',
      say: '¿Te gustó jugar? Tocá una carita: mucho, más o menos, o no.',
      adult: '¿Te gustó?',
      options: [
        { value: 'yes', word: '¡Mucho!', art: <Face mood="happy" seed={1} /> },
        { value: 'mid', word: 'Más o menos.', art: <Face mood="mid" seed={2} /> },
        { value: 'no', word: 'No.', art: <Face mood="sad" seed={3} /> },
      ],
    },
    {
      id: 'difficulty',
      say: '¿Fue fácil o difícil? Tocá una carita: fácil, más o menos, o difícil.',
      adult: '¿Fue fácil o difícil?',
      options: [
        { value: 'easy', word: 'Fácil.', art: <Face mood="easy" seed={4} /> },
        { value: 'mid', word: 'Más o menos.', art: <Face mood="mid" seed={5} /> },
        { value: 'hard', word: 'Difícil.', art: <Face mood="hard" seed={6} /> },
      ],
    },
  ];
  if (activities.length >= 2) {
    qs.push({
      id: 'favorite_activity',
      say: '¿Qué te gustó más? Tocá el dibujo.',
      adult: '¿Qué te gustó más?',
      options: activities.map((a) => ({ value: a, word: ACTIVITY_WORD[a] ?? '', art: <ActivityPicture activity={a} /> })),
    });
  }
  qs.push({
    id: 'play_again',
    say: '¿Querés volver a jugar otro día? Tocá sí o no.',
    adult: '¿Querés volver a jugar?',
    options: [
      { value: 'yes', word: '¡Sí!', art: <YesNo yes /> },
      { value: 'no', word: 'No.', art: <YesNo yes={false} /> },
    ],
  });
  return qs;
}

export function Survey() {
  const api = usePlaytest();
  const [questions] = useState(() => surveyQuestions(api.flow.activities));
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const answers = useRef<Record<string, string>>({});
  const q = questions[i];

  useEffect(() => {
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(q.say); }, 350);
    return () => { clearTimeout(t); off(); };
  }, [q]);
  useEffect(() => () => stopSpeaking(), []);

  const answer = (o: Option) => {
    if (picked) return;
    setPicked(o.value);
    if (o.word) speak(o.word);
    api.log('survey_answer', { question: q.id, answer: o.value });
    answers.current = { ...answers.current, [q.id]: o.value };
    setTimeout(() => {
      if (i + 1 < questions.length) {
        setI(i + 1);
        setPicked(null);
      } else {
        api.patchSession({ survey: answers.current });
        api.next();
      }
    }, 1100);
  };

  return (
    <main className="pp-page pp-survey" data-question={q.id}>
      <header className="pp-survey-bar level-bar cut">
        <button type="button" className="speak cut" aria-label="Escuchar otra vez" onClick={() => speak(q.say)}><SpeakerIcon /></button>
        <PlayerFace className="bar-face" />
        <p className="pp-survey-adult">{q.adult}</p>
        <ol className="pp-survey-dots" aria-label="Preguntas">
          {questions.map((x, k) => <li key={x.id} className={k < i ? 'is-done' : k === i ? 'is-here' : ''} />)}
        </ol>
      </header>
      <section className={`sheet pp-card pp-options n${q.options.length}`} key={q.id} aria-label={q.adult}>
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        {q.options.map((o) => (
          <button key={o.value} type="button" className={`pp-option cut${picked === o.value ? ' is-picked' : ''}${picked && picked !== o.value ? ' is-other' : ''}`}
            data-answer={o.value} aria-label={o.word || o.value} onClick={() => answer(o)}>
            {o.art}
            {picked === o.value && <PenRing seed={o.value.length + 4} />}
          </button>
        ))}
      </section>
    </main>
  );
}

// ------------------------------------------------------------------ goodbye

const BYE = {
  say: (name: string) => `¡Gracias por jugar! Chau, ${name}. ¡Hasta la próxima!`,
};

export function Goodbye() {
  const api = usePlaytest();
  const p = useProgress();
  const player = usePlayer();
  const { ref, view } = useStage(player, { x: -92, y: -176, w: 184, h: 196 }, { shadow: true });
  const since = useRef(Date.now());
  const name = isCharacterId(p.character) ? CHARACTER_NAME[p.character] : 'Brote';

  useEffect(() => {
    const off = speakWhenAllowed(BYE.say(name));
    const t = setTimeout(() => { void view.current?.cheer(); }, 600);
    return () => { off(); clearTimeout(t); api.log('garden_view', { duration_ms: Date.now() - since.current, seeds: p.seeds }); };
    // once, when the goodbye opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = Math.min(p.seeds, 18);
  return (
    <main className="pp-page pp-bye">
      <section className="sheet pp-card pp-bye-card" aria-label="Chau">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <svg ref={ref} className="pp-bye-stage" aria-hidden="true" onClick={() => void view.current?.cheer()} />
        <div className="pp-bye-garden" aria-label={`${p.seeds} semillas`}>
          {Array.from({ length: shown }, (_, k) => <span key={k} className="pp-bye-seed" style={{ animationDelay: `${300 + k * 120}ms` }}><SeedIcon size={44} /></span>)}
          <svg className="pp-bye-soil" viewBox="0 0 600 40" preserveAspectRatio="none" aria-hidden="true">
            <path d="M4,14 C120,6 240,18 360,10 S520,8 596,14 L596,36 L4,36 Z" fill="#c9a979" stroke="#2b2622" strokeWidth={2.6} strokeLinejoin="round" />
          </svg>
        </div>
        {api.session && <p className="pp-bye-code">{api.session.code}</p>}
      </section>
      <button type="button" className="pp-for-adult" onClick={api.next}>para el adulto</button>
    </main>
  );
}

// ------------------------------------------------------------------ the adult form

const ENGAGEMENT = [{ v: 'low', label: 'Poco' }, { v: 'mid', label: 'Medio' }, { v: 'high', label: 'Mucho' }] as const;
const HELP = [{ v: 'none', label: 'Ninguna' }, { v: 'some', label: 'Algo' }, { v: 'a_lot', label: 'Mucha' }] as const;

function Choice<T extends string>({ legend, options, value, set }: { legend: string; options: readonly { v: T; label: string }[]; value: T | null; set: (v: T) => void }) {
  return (
    <fieldset className="pp-field">
      <legend>{legend}</legend>
      <div className="pp-grades">
        {options.map((o) => (
          <button key={o.v} type="button" className={`pp-div pp-choice cut${value === o.v ? ' is-on' : ''}`} aria-pressed={value === o.v} data-value={o.v} onClick={() => set(o.v)}>{o.label}</button>
        ))}
      </div>
    </fieldset>
  );
}

export function AdultForm({ newSession }: StepViewProps) {
  const api = usePlaytest();
  const [engagement, setEngagement] = useState<'low' | 'mid' | 'high' | null>(null);
  const [help, setHelp] = useState<'none' | 'some' | 'a_lot' | null>(null);
  const [comment, setComment] = useState('');
  const [saved, setSaved] = useState(false);
  const s = api.session;
  const save = () => {
    const form: Record<string, unknown> = { engagement, help_needed: help };
    const text = comment.trim().slice(0, 2000);
    if (text) form.comment = text;
    api.patchSession({ adult_form: form });
    setSaved(true);
  };
  return (
    <main className="pp-page pp-adult-form">
      <section className="sheet pp-card" aria-labelledby="pp-form-title">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <h1 id="pp-form-title" className="pp-adult-title">Para el adulto{s ? <small>{s.code} · {GRADE_LABEL[s.grade]}{s.division ? ` ${s.division}` : ''}</small> : null}</h1>
        {saved ? (
          <>
            <p className="pp-adult-note">Guardado. Se envía solo cuando hay conexión.</p>
            <SyncDot />
            <button type="button" className="btn btn-play cut pp-start" onClick={newSession}>Nueva sesión</button>
          </>
        ) : (
          <>
            <Choice legend="¿Cuánto se enganchó?" options={ENGAGEMENT} value={engagement} set={setEngagement} />
            <Choice legend="¿Cuánta ayuda necesitó?" options={HELP} value={help} set={setHelp} />
            <label className="pp-comment">
              <span>Comentario <small>(sin nombres)</small></span>
              <textarea rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Lo que viste, sin nombres." />
            </label>
            <button type="button" className="btn btn-play cut pp-start" disabled={!engagement || !help} onClick={save}>Guardar</button>
          </>
        )}
      </section>
    </main>
  );
}
