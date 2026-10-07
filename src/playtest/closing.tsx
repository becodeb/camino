// The end of a session.
// - The survey: four spoken questions (🔊 says each one again), answered by
//   tapping drawn faces or pictures, never by reading. "¿Qué te gustó más?"
//   shows only the activities the child did (asked when there are two or
//   more). Each answer is a `survey_answer`; all of them go on the session.
// - The goodbye: the session's garden (every page solved planted a seed; a
//   boss won sent its critter or plant) with the character in it, wearing
//   the outfit kept in the wardrobe; a big drawn "jugar otra vez" starts the
//   next session (back to the setup), and so does the goodbye by itself
//   after GOODBYE_MS (paused while the adult's menu is open). No code is
//   shown anywhere (round 2).
// - The adult's comment (AdultFormPanel): optional, from the corner menu at
//   any time of the session: engagement, help needed, a comment without
//   names (`sessions.adult_form`).
// - T22: PreviousAdultFormPanel is the same questions, for the previous
//   session ended on this device ("Comentario del chico anterior", the
//   corner menu), sent to its own small endpoint (previousChild.ts): the
//   session being played may already be a different child's.

import { useEffect, useRef, useState } from 'react';
import { CHARACTER_NAME, isCharacterId } from '../curriculum/motivation';
import { progress, useProgress } from '../curriculum/progress';
import { arrivedCritters, arrivedPlants, outfitOf } from '../curriculum/rewards';
import { charDef, PlayerFace } from '../screens/player';
import { PenRing, Portrait, SeedIcon } from '../ui/art';
import { SpeakerIcon } from '../ui/icons';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { adultSheetOpen } from './adultState';
import { usePlaytest } from './context';
import { postPreviousAdultForm } from './runtime';
import type { AdultFormValue, PreviousChild } from './previousChild';
import { submitPreviousAdultForm } from './previousChild';
import { ActivityPicture, DifficultyArt, DifficultyHeaderArt, Face, LikedHeaderArt, YesNo } from './surveyArt';
import type { StepViewProps } from './steps';
import { PlayAgainArt } from './round2Art';
import { SessionGarden } from './SessionGarden';

type QuestionId = 'liked' | 'difficulty' | 'favorite_activity' | 'play_again';
interface Option { value: string; word: string; art: React.ReactNode }
interface Question { id: QuestionId; say: string; adult: string; options: Option[]; header?: React.ReactNode }

/** How each activity is named aloud when its picture is tapped. */
const ACTIVITY_WORD: Record<string, string> = {
  character: 'Elegir personaje', ladder: 'Los caminos', tool_check: 'Probar las herramientas', typing: 'Las teclas',
  wardrobe: 'El vestidor', free_play: 'Jugar libre', sheet: 'Una hoja', recess: 'La música', guardas: 'Las guardas',
  editor: 'Hacer un nivel', corkboard: 'La cartelera', rule_game: 'El juego de reglas', game_maker: 'Hacer tu juego', text_probe: 'Bloques y texto',
};

export function surveyQuestions(activities: readonly string[], grade = 1): Question[] {
  const qs: Question[] = [
    {
      id: 'liked',
      say: '¿Te gustó jugar? Tocá una carita: mucho, más o menos, o no.',
      adult: '¿Te gustó?',
      header: <LikedHeaderArt />,
      options: [
        { value: 'yes', word: '¡Mucho!', art: <Face mood="happy" seed={1} /> },
        { value: 'mid', word: 'Más o menos.', art: <Face mood="mid" seed={2} /> },
        { value: 'no', word: 'No.', art: <Face mood="sad" seed={3} /> },
      ],
    },
    {
      id: 'difficulty',
      say: '¿Fue fácil o difícil? Tocá un camino: fácil, más o menos, o difícil.',
      adult: '¿Fue fácil o difícil?',
      // T23: drawn differently from the liking faces (the "¿Cómo seguís?" hills), so a muted 1ro never confuses the two questions
      header: <DifficultyHeaderArt />,
      options: [
        { value: 'easy', word: 'Fácil.', art: <DifficultyArt level="easy" /> },
        { value: 'mid', word: 'Más o menos.', art: <DifficultyArt level="mid" /> },
        { value: 'hard', word: 'Difícil.', art: <DifficultyArt level="hard" /> },
      ],
    },
  ];
  if (activities.length >= 2) {
    qs.push({
      id: 'favorite_activity',
      say: '¿Qué te gustó más? Tocá el dibujo.',
      adult: '¿Qué te gustó más?',
      options: activities.map((a) => ({ value: a, word: ACTIVITY_WORD[a] ?? '', art: <ActivityPicture activity={a} grade={grade} /> })),
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
  const [questions] = useState(() => surveyQuestions(api.flow.activities, api.session?.grade));
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
      <section className="sheet pp-card pp-question" key={q.id} aria-label={q.adult}>
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        {q.header && <div className="pp-q-header">{q.header}</div>}
        <div className={`pp-options n${q.options.length}`}>
          {q.options.map((o) => (
            <button key={o.value} type="button" className={`pp-option cut${picked === o.value ? ' is-picked' : ''}${picked && picked !== o.value ? ' is-other' : ''}`}
              data-answer={o.value} aria-label={o.word || o.value} onClick={() => answer(o)}>
              {o.art}
              {picked === o.value && <PenRing seed={o.value.length + 4} />}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

// ------------------------------------------------------------------ goodbye

const BYE = {
  say: (name: string) => `¡Gracias por jugar! Chau, ${name}. ¡Hasta la próxima!`,
};

/** The goodbye starts the next session by itself after this long (the adult's menu open pauses it). */
export const GOODBYE_MS = 45_000;

export function Goodbye({ newSession }: StepViewProps) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const p = useProgress();
  const since = useRef(Date.now());
  const left = useRef(false);
  const [cheer, setCheer] = useState(0);
  const name = isCharacterId(p.character) ? CHARACTER_NAME[p.character] : 'Brote';

  /** The garden's time and what it showed, then the next session (logged first: the setup logs nothing). */
  const leave = (how: 'again' | 'time' | 'left') => {
    if (left.current) return;
    left.current = true;
    const q = progress.get();
    apiRef.current.log('garden_view', { duration_ms: Date.now() - since.current, seeds: q.seeds, critters: arrivedCritters(q), plants: arrivedPlants(q), outfit: outfitOf(q), left: how });
    if (how !== 'left') { stopSpeaking(); newSession(); }
  };
  const leaveRef = useRef(leave);
  leaveRef.current = leave;

  useEffect(() => {
    const off = speakWhenAllowed(BYE.say(name));
    const t = setTimeout(() => setCheer(1), 900);
    // the next child: after GOODBYE_MS, not while the adult's menu is open
    const tick = setInterval(() => {
      if (Date.now() - since.current >= GOODBYE_MS && !adultSheetOpen()) leaveRef.current('time');
    }, 1000);
    return () => {
      off();
      clearTimeout(t);
      clearInterval(tick);
      leaveRef.current('left');
    };
    // once, when the goodbye opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="pp-page pp-bye">
      <section className="sheet pp-bye-card" aria-label="Chau">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <div className="pp-bye-garden" onClick={() => setCheer((c) => c + 1)}>
          <SessionGarden cheer={cheer} />
        </div>
        <p className="pp-bye-seeds" aria-label={`${p.seeds} semillas`}><SeedIcon size={34} /> <b>{p.seeds}</b></p>
      </section>
      <button type="button" className="pp-again cut" aria-label="Jugar otra vez" onClick={() => leave('again')}><PlayAgainArt /></button>
    </main>
  );
}

// ------------------------------------------------------------------ the adult's comment (from the corner menu)

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

/** The adult's optional comment on this session (`sessions.adult_form`); saving again replaces it. */
export function AdultFormPanel({ done }: { done: () => void }) {
  const api = usePlaytest();
  const prev = api.session?.adult_form as { engagement?: 'low' | 'mid' | 'high'; help_needed?: 'none' | 'some' | 'a_lot'; comment?: string } | null | undefined;
  const [engagement, setEngagement] = useState<'low' | 'mid' | 'high' | null>(prev?.engagement ?? null);
  const [help, setHelp] = useState<'none' | 'some' | 'a_lot' | null>(prev?.help_needed ?? null);
  const [comment, setComment] = useState(prev?.comment ?? '');
  const save = () => {
    const form: Record<string, unknown> = { engagement, help_needed: help, step: api.flow.step };
    const text = comment.trim().slice(0, 2000);
    if (text) form.comment = text;
    api.patchSession({ adult_form: form });
    api.log('adult_form', { step: api.flow.step, engagement, help_needed: help, comment: !!text });
    done();
  };
  return (
    <div className="pp-adult-form">
      <Choice legend="¿Cuánto se enganchó?" options={ENGAGEMENT} value={engagement} set={setEngagement} />
      <Choice legend="¿Cuánta ayuda necesitó?" options={HELP} value={help} set={setHelp} />
      <label className="pp-comment">
        <span>Comentario <small>(sin nombres)</small></span>
        <textarea rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Lo que viste, sin nombres." />
      </label>
      <button type="button" className="btn btn-play cut pp-start" data-act="save-form" disabled={!engagement && !help && !comment.trim()} onClick={save}>Guardar</button>
    </div>
  );
}

// ------------------------------------------------------------------ T22: the previous child's comment

/** "Comentario del chico anterior": which child it is about, never a name — the previous character and how long ago. */
export function PreviousChildHeader({ info }: { info: PreviousChild }) {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(info.ended_at)) / 60_000));
  return (
    <p className="pp-adult-note pp-prev-who">
      <Portrait def={charDef(info.character ?? 'brote')} className="bar-face" />
      {mins <= 0 ? 'Recién terminó.' : `Hace ${mins} min.`}
    </p>
  );
}

/**
 * The same questions as AdultFormPanel, for the previous session ended on
 * this device (prefilled from previousChild.ts's own cache if this exact
 * panel already saved one); sent to its own small endpoint, not
 * `patchSession` (the session being played, if any, is a different one).
 */
export function PreviousAdultFormPanel({ info, done }: { info: PreviousChild; done: () => void }) {
  const prev = info.adult_form;
  const [engagement, setEngagement] = useState<'low' | 'mid' | 'high' | null>(prev?.engagement ?? null);
  const [help, setHelp] = useState<'none' | 'some' | 'a_lot' | null>(prev?.help_needed ?? null);
  const [comment, setComment] = useState(prev?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const save = () => {
    const form: AdultFormValue = { engagement, help_needed: help };
    const text = comment.trim().slice(0, 2000);
    if (text) form.comment = text;
    setSaving(true);
    void submitPreviousAdultForm(info.id, form, postPreviousAdultForm).finally(() => { setSaving(false); done(); });
  };
  return (
    <div className="pp-adult-form">
      <Choice legend="¿Cuánto se enganchó?" options={ENGAGEMENT} value={engagement} set={setEngagement} />
      <Choice legend="¿Cuánta ayuda necesitó?" options={HELP} value={help} set={setHelp} />
      <label className="pp-comment">
        <span>Comentario <small>(sin nombres)</small></span>
        <textarea rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Lo que viste, sin nombres." />
      </label>
      <button type="button" className="btn btn-play cut pp-start" data-act="save-previous-form" disabled={saving || (!engagement && !help && !comment.trim())} onClick={save}>Guardar</button>
    </div>
  );
}
