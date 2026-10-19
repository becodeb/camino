// T39: 4to's mandatory step, the Game Workshop (src/workshop/, T40) as a
// flow step. Its challenges 1–5 done (the Workshop's own `arcade` flag)
// open the Arcade (flow.ts `arcade_open`, also 4to's green flag): once the
// Workshop's own celebration is over, a large in-screen announcement
// ("¡Se abrió el Arcade!", never only in the bar) offers the Arcade or
// staying, and from then on an Arcade button sits in the Workshop's bar —
// the child goes back and forth (`arcade` moves). "Terminé" (challenges 1–7)
// goes to the Arcade.
//
// "Quedan 5 minutos": the challenge on screen is the last one — the step
// moves on (to the survey) when it is done, or after WRAP_GRACE_MS, or at
// once in the free challenges.

import { useEffect, useRef, useState } from 'react';
import { speak } from '../ui/speech';
import { Workshop, type WorkshopInfo } from '../workshop/Workshop';
import { LAST_CORE } from '../workshop/progress';
import { GameControllerArt } from './classroom';
import { usePlaytest } from './context';
import { is4to, wrapPending } from './flow';

/** "Quedan 5 minutos" in the Workshop: the challenge on screen gets this long at most. */
export const WRAP_GRACE_MS = 90_000;
const ARCADE_SAY = '¡Se abrió el Arcade! Ya podés jugar. El taller sigue acá: podés volver cuando quieras.';

export function WorkshopStep() {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const info = useRef<WorkshopInfo | null>(null);
  const [announce, setAnnounce] = useState(false);
  const open = !!api.flow.arcadeOpen;

  useEffect(() => { apiRef.current.did('workshop'); }, []);

  const onProgress = (i: WorkshopInfo) => {
    info.current = i;
    const a = apiRef.current;
    // challenges 1–5 done: the green flag (also after "Juegos para todos" opened the Arcade already); the announcement only when it opens now
    if (i.arcade && is4to(a.flow) && !a.flow.routeDone) {
      const was = !!a.flow.arcadeOpen;
      a.openArcade();
      if (!was) setAnnounce(true);
    }
  };

  // the announcement waits for the Workshop's own celebration to end
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!announce || shown) return;
    const id = window.setInterval(() => {
      if (document.querySelector('.ws-party')) return;
      setShown(true);
      speak(ARCADE_SAY);
    }, 400);
    return () => clearInterval(id);
  }, [announce, shown]);

  // "quedan 5 minutos": after the challenge on screen
  const wrap = wrapPending(api.flow);
  useEffect(() => {
    if (!wrap) return;
    const from = info.current?.current ?? 0;
    const t0 = Date.now();
    const id = window.setInterval(() => {
      const cur = info.current?.current ?? from;
      if (cur !== from || cur > LAST_CORE || Date.now() - t0 >= WRAP_GRACE_MS) apiRef.current.next();
    }, 1000);
    return () => clearInterval(id);
  }, [wrap]);

  const toArcade = () => { setAnnounce(false); apiRef.current.arcade('free_play'); };

  return (
    <>
      <Workshop
        grade={api.session?.grade ?? 4}
        onProgress={onProgress}
        onDone={() => (apiRef.current.flow.arcadeOpen ? toArcade() : undefined)}
        barExtra={open ? (
          <button type="button" className="pp-arcade-btn cut" data-act="arcade" aria-label="Ir al Arcade" onClick={toArcade}>
            <GameControllerArt /><span>Arcade</span>
          </button>
        ) : undefined}
      />
      {announce && shown && (
        <div className="pp-arcade-open" role="dialog" aria-label="Se abrió el Arcade">
          <div className="pp-arcade-open-card sheet">
            <span className="tape tape-l" aria-hidden="true" />
            <span className="tape tape-r" aria-hidden="true" />
            <GameControllerArt />
            <p className="pp-arcade-open-title">¡Se abrió el Arcade!</p>
            <p className="pp-arcade-open-sub">Ya podés jugar. El taller sigue acá: podés volver cuando quieras.</p>
            <div className="pp-arcade-open-btns">
              <button type="button" className="pp-arcade-go cut" data-act="arcade-go" onClick={toArcade}>Ir al Arcade</button>
              <button type="button" className="pp-arcade-stay cut" data-act="arcade-stay" onClick={() => setAnnounce(false)}>Seguir en el taller</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
