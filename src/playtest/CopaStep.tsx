// C04: 4to's mandatory step, the Copa de 4to (Copa.tsx, C03), as a flow
// step — it replaces the Game Workshop as 4to's core-route center (the
// Workshop stays reachable, now an optional Arcade card: freePlay.ts,
// WorkshopStep.tsx, unchanged).
//
// The Arcade unlocks the first of: the child finishing circuit 2, or 20
// minutes since the route started (ARCADE_TIME_MS, from the first visit
// past the setup — tool check, ladder, Copa). Either way a large, one-time
// "¡Se abrió el Arcade!" announcement follows (reusing WorkshopStep's own
// overlay styling), and from then on an Arcade button sits in the Copa's
// bar — the child goes back and forth (`arcade` moves).
//
// The mid-class survey (requirement 4) opens by itself at the first of:
// the child finishing circuit 3, or SURVEY_TIME_MS since the route started
// — but only once the Copa's own screen says it is safe to (`onPhase`,
// anything but `'play'`), so it never cuts a running race short; the same
// guard also covers "quedan 5 minutos" (`wrapPending`), which otherwise
// would want to move to the survey (or to the Arcade once it is open)
// immediately.
//
// "Quedan 5 minutos" on screen (the challenge is in the bar, like the
// Workshop's own one) is the item on screen (current circuit), then the
// survey, then the Arcade — same order as the Workshop's, generically
// already handled by flow.ts's wrapTarget/wrapPending for 4to.

import { useEffect, useRef, useState } from 'react';
import { speak } from '../ui/speech';
import { Copa, copaCircuitsDone } from './Copa';
import type { CircuitId } from './copa';
import { GameControllerArt } from './classroom';
import { usePlaytest } from './context';
import { wrapPending } from './flow';

/** C04: the Arcade opens at circuit 2, or by this long since the route started, whichever first. */
export const ARCADE_TIME_MS = 20 * 60_000;
/** C04: the mid-class survey, at circuit 3, or by this long since the route started, whichever first. */
export const SURVEY_TIME_MS = 25 * 60_000;
export const SURVEY_AFTER_CIRCUIT: CircuitId = 3;
export const ARCADE_AFTER_CIRCUIT: CircuitId = 2;
/** How often the two timers above are checked. */
const CHECK_MS = 1000;

const ARCADE_SAY = '¡Se abrió el Arcade! Ya podés jugar. La Copa sigue acá: podés volver cuando quieras.';

/** The earliest visit past the setup (name or character, whichever is first): when 4to's route really started. */
function routeStartAt(visits: readonly { step: string; at: number }[]): number {
  return visits.find((v) => v.step !== 'setup')?.at ?? visits[0]?.at ?? Date.now();
}

export function CopaStep() {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const [announce, setAnnounce] = useState(false);
  const [shown, setShown] = useState(false);
  const sessionId = api.session?.id;
  // seeded from Copa's own kept medals, so a remount (Arcade and back, or a reload) never resets the circuit-3 survey trigger
  const circuitsDone = useRef(copaCircuitsDone(sessionId));
  const phase = useRef<'intro' | 'play' | 'result'>('intro');
  const surveyAsked = useRef(false);
  const startAt = useRef(routeStartAt(api.flow.visits));
  const open = !!api.flow.arcadeOpen;

  useEffect(() => { apiRef.current.did('copa'); }, []);

  const openArcadeNow = () => {
    const a = apiRef.current;
    if (a.flow.arcadeOpen) return;
    a.openArcade('copa');
    setAnnounce(true);
  };

  const onCircuitDone = (circuit: CircuitId) => {
    // Copa's own `keep()` (its session-scoped store plus the in-memory cache) already ran before this fires
    circuitsDone.current = copaCircuitsDone(sessionId);
    if (circuit >= ARCADE_AFTER_CIRCUIT) openArcadeNow();
  };

  // the 20-minute Arcade timer and the 25-minute (or circuit 3) survey timer, both from the route's own start
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!apiRef.current.flow.arcadeOpen && Date.now() - startAt.current >= ARCADE_TIME_MS) openArcadeNow();
      const f = apiRef.current.flow;
      const due = !f.surveyDone && f.step !== 'survey'
        && (circuitsDone.current >= SURVEY_AFTER_CIRCUIT || Date.now() - startAt.current >= SURVEY_TIME_MS);
      // never mid-race: wait for the circuit's own intro or result screen
      if (due && !surveyAsked.current && phase.current !== 'play') { surveyAsked.current = true; apiRef.current.openSurvey('flag'); }
    }, CHECK_MS);
    return () => clearInterval(id);
  }, []);

  // the announcement waits a beat so the circuit's own result (confetti, the place) is seen first
  useEffect(() => {
    if (!announce || shown) return;
    const t = window.setTimeout(() => { setShown(true); speak(ARCADE_SAY); }, 1400);
    return () => clearTimeout(t);
  }, [announce, shown]);

  // "quedan 5 minutos": move on (to the survey, or to the Arcade once open) once it is safe to — never mid-race
  const wrap = wrapPending(api.flow);
  useEffect(() => {
    if (!wrap) return;
    const id = window.setInterval(() => { if (phase.current !== 'play') apiRef.current.next(); }, CHECK_MS);
    return () => clearInterval(id);
  }, [wrap]);

  const toArcade = () => { setAnnounce(false); apiRef.current.arcade('free_play'); };

  return (
    <>
      <Copa
        logger={api.log}
        sessionId={sessionId}
        onCircuitDone={onCircuitDone}
        onPhase={(p) => { phase.current = p; }}
        {...(open ? { onExit: toArcade } : {})}
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
            <p className="pp-arcade-open-sub">Ya podés jugar. La Copa sigue acá: podés volver cuando quieras.</p>
            <div className="pp-arcade-open-btns">
              <button type="button" className="pp-arcade-go cut" data-act="arcade-go" onClick={toArcade}>Ir al Arcade</button>
              <button type="button" className="pp-arcade-stay cut" data-act="arcade-stay" onClick={() => setAnnounce(false)}>Seguir en la Copa</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
