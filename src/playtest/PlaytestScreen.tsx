// The pilot playtest: one child, one sitting, 20–40 minutes, an adult next
// to them (or one teacher for the room). The adult sets the grade, the app
// gives an anonymous session code, the child plays the flow's steps
// (flow.ts), and every step writes anonymous events to the offline queue
// (telemetry.ts → POST /api/sync). Hidden adult controls (AdultControls.tsx)
// end the session, skip a step, log help and answer the raised hand.
//
// The playtest keeps its own progress in memory (never the demo's
// `camino.progress.v1`), fresh for every session.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { progress } from '../curriculum/progress';
import { PlayerContext, useYearPlayer } from '../screens/player';
import { DEBUG } from '../screens/levelKit';
import { AdultControls } from './AdultControls';
import { PlaytestContext, type AdultHelpKind, type HandState, type LevelTrack, type PlaytestApi } from './context';
import { STEPS, canSkip, initialFlow, reduce, type FlowAction, type FlowState, type StepId } from './flow';
import { enterPlaytestProgress, leavePlaytestProgress } from './progressScope';
import { installWatchers, telemetry } from './runtime';
import { STEP_VIEWS } from './steps';
import type { SessionRecord, StartInput } from './telemetry';
import './playtest.css';

export function PlaytestScreen() {
  // before any child reads the progress: the playtest's own, in memory
  useState(() => { enterPlaytestProgress(); return true; });
  useEffect(() => () => leavePlaytestProgress(), []);
  return <Playtest />;
}

function Playtest() {
  const tel = telemetry();
  const [flow, setFlow] = useState<FlowState>(() => initialFlow(Date.now()));
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [hand, setHand] = useState<HandState | null>(null);
  const handRef = useRef(hand);
  handRef.current = hand;
  const level = useRef<LevelTrack | null>(null);

  const log = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    if (flowRef.current.step === 'setup') return;
    tel.log(type, payload);
  }, [tel]);

  const apply = useCallback((action: FlowAction) => {
    const now = Date.now();
    const t = reduce(flowRef.current, action, now);
    if (t.state === flowRef.current) return;
    flowRef.current = t.state;
    setFlow(t.state);
    const c = t.change;
    if (!c) return;
    tel.log('step', { ...c });
    const patch: Parameters<typeof tel.updateSession>[0] = { current_step: c.to };
    if (c.reason === 'end_now') Object.assign(patch, { ended_at: new Date(now).toISOString(), end_reason: 'adult_ended' });
    else if (c.to === 'goodbye' && !t.state.endedEarly) Object.assign(patch, { ended_at: new Date(now).toISOString(), end_reason: 'completed' });
    tel.updateSession(patch);
    // the child's part is over: nobody is waiting with a raised hand
    if (c.to === 'survey') setHand(null);
  }, [tel]);

  const start = useCallback((input: StartInput) => {
    progress.reset();
    setHand(null);
    level.current = null;
    setSession(tel.startSession(input));
    apply({ type: 'next' });
  }, [tel, apply]);

  const newSession = useCallback(() => {
    progress.reset();
    setHand(null);
    level.current = null;
    setSession(null);
    const s = initialFlow(Date.now());
    flowRef.current = s;
    setFlow(s);
  }, []);

  const raiseHand = useCallback((reason: HandState['reason']) => {
    const lv = level.current;
    const up = handRef.current;
    const next: HandState = up ?? { since: Date.now(), level_id: lv?.id, help_step: lv?.helpStep ?? 0, reason };
    log('call_adult', { ...(lv ? { level_id: lv.id } : {}), reason, help_step: lv?.helpStep ?? 0, hand_up: !!up });
    if (!up) setHand(next);
  }, [log]);

  const adultHelp = useCallback((kind: AdultHelpKind, prompted: boolean) => {
    const lv = level.current;
    const up = handRef.current;
    log('adult_help', {
      ...(lv ? { level_id: lv.id } : {}),
      kind,
      prompted,
      ...(prompted && up ? { duration_ms: Date.now() - up.since } : {}),
    });
    if (lv) lv.adultHelped = true;
    if (prompted) setHand(null);
  }, [log]);

  const api = useMemo<PlaytestApi>(() => ({
    session,
    flow,
    next: () => apply({ type: 'next' }),
    skip: () => apply({ type: 'skip' }),
    endNow: () => apply({ type: 'end_now' }),
    did: (activity) => apply({ type: 'did', activity }),
    log,
    level,
    hand,
    raiseHand,
    adultHelp,
  }), [session, flow, apply, log, hand, raiseHand, adultHelp]);

  useEffect(() => installWatchers(() => (flowRef.current.step === 'setup' ? null : flowRef.current.step)), []);

  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __piloto: unknown }).__piloto = {
      flow: () => flowRef.current,
      session: () => tel.session,
      status: () => tel.status(),
      flush: () => tel.flush(),
      next: () => apply({ type: 'next' }),
      skip: () => apply({ type: 'skip' }),
      endNow: () => apply({ type: 'end_now' }),
      /** Skips forward to a step (screenshots). */
      jump: (to: StepId) => {
        for (let i = 0; i < STEPS.length && flowRef.current.step !== to; i++) apply({ type: canSkip(flowRef.current.step) ? 'skip' : 'next' });
      },
      start,
    };
  });

  const View = STEP_VIEWS[flow.step];
  return (
    <PlaytestContext.Provider value={api}>
      <PlayerContext.Provider value={useYearPlayer()}>
        <div className={`piloto step-${flow.step}`} data-step={flow.step}>
          <View key={flow.visits.length} start={start} newSession={newSession} />
          {session && <AdultControls />}
        </div>
      </PlayerContext.Provider>
    </PlaytestContext.Provider>
  );
}
