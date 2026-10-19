// T38: "¿Cómo te llamás?" — a full screen between the setup (the grade
// known) and the character choice, on by default for 4to and 5to and
// optional for any grade via `?nombre=si` (childName.ts's `nameScreenOn`,
// decided once in PlaytestScreen.tsx's `start`, right after the session is
// created — the session already exists here, same as on `character`, so the
// adult's corner menu (AdultControls.tsx) is already available and "Saltar
// este paso" (flow.ts's generic `canSkip`) already works). A reload resumes
// on this very step without asking again (resume.ts, unchanged: `name` is
// an ordinary step like any other); a brand new session (the goodbye's
// restart, "Terminar la clase") always starts over from `setup`, so the
// next child is asked again.
//
// The name is never spoken aloud and never shown anywhere else on screen
// (not even a "¡Hola, Sofía!" on the character screen): a classroom seats
// children close together, so anything audible here could reach a
// neighbour's device too — the one firm rule this task carries is that a
// name is never shown to another child (see docs/prueba-piloto-datos.md).

import { useEffect, useRef, useState } from 'react';
import { PlayerFace } from '../screens/player';
import { SpeakerIcon } from '../ui/icons';
import { speak, speakWhenAllowed } from '../ui/speech';
import { MAX_CHILD_NAME_CHARS, nameParamFromUrl, nameScreenOn, normalizeChildName } from './childName';
import { usePlaytest } from './context';
import type { StepViewProps } from './steps';

const SAY = '¿Cómo te llamás?';

export function NamePrompt(_props: StepViewProps) {
  const api = usePlaytest();
  const grade = api.session?.grade ?? 1;
  // computed once, when this step first mounts: the session (and its grade) already exist by then
  const [on] = useState(() => nameScreenOn(grade, nameParamFromUrl(typeof location !== 'undefined' ? location.search : '')));
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const name = normalizeChildName(value);

  useEffect(() => {
    // a link with an off grade default but no `?nombre=` override, or `?nombre=no`: nothing to show, on to the character choice
    if (!on) { api.next(); return undefined; }
    inputRef.current?.focus();
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(SAY); }, 350);
    return () => { clearTimeout(t); off(); };
    // once, when the step opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  if (!on) return null;

  const submit = () => {
    if (!name) return;
    api.patchSession({ child_name: name });
    api.log('choice', { activity: 'name' });
    api.next();
  };

  return (
    <main className="pp-page pp-name">
      <section className="sheet pp-card pp-name-card" aria-label={SAY}>
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <header className="pp-name-q">
          <button type="button" className="speak cut" aria-label="Escuchar otra vez" onClick={() => speak(SAY)}><SpeakerIcon /></button>
          <PlayerFace className="bar-face" />
          <h1>{SAY}</h1>
        </header>
        <input
          ref={inputRef}
          className="pp-name-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          // generous: normalizeChildName (not this cap) is what actually limits the stored name
          maxLength={MAX_CHILD_NAME_CHARS * 2}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          aria-label="Tu nombre"
          placeholder="Tu nombre"
        />
        <button type="button" className="btn btn-play cut pp-name-go" disabled={!name} onClick={submit}>Listo</button>
      </section>
    </main>
  );
}
