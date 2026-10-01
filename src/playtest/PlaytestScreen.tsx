// The pilot playtest: one child, one sitting, 20–40 minutes, an adult next
// to them (or one teacher for the room). One tap on the grade starts (the
// child can do it), the child plays the flow's steps (flow.ts), and every
// step writes anonymous events to the offline queue (telemetry.ts → POST
// /api/sync); the goodbye starts the next session by itself. Hidden adult
// controls (AdultControls.tsx) end the session, skip a step, log help, take
// the adult's optional comment and answer the raised hand; a hand nobody
// answers goes down when the child solves the page or moves on. Every spoken
// line can also show as on-screen text (captions.ts, Captions.tsx).
//
// The playtest keeps its own progress in memory (never the demo's
// `camino.progress.v1`), fresh for every session. A reload of the tab
// carries on with the session on the step it was on (resume.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { progress } from '../curriculum/progress';
import { PlayerContext, useYearPlayer } from '../screens/player';
import { DEBUG } from '../screens/levelKit';
import { forgetRealtimeIntros } from '../screens/RealtimeLevel';
import { forgetWorkshopGuides } from '../screens/WorkshopScreen';
import { setUnlocks } from '../curriculum/rewards';
import { setSpeechFilter } from '../ui/speech';
import { clearCaption, installCaptions, setCaptions } from './captions';
import { Captions } from './Captions';
import { PLAYTEST_UNLOCKS } from './WardrobeStep';
import { withName } from './characterName';
import { holdHash } from './hashHold';
import { AdultControls } from './AdultControls';
import { PlaytestContext, type AdultHelpKind, type HandState, type LevelTrack, type PlaytestApi } from './context';
import { STEPS, canSkip, initialFlow, reduce, type FlowAction, type FlowState, type StepId } from './flow';
import { enterPlaytestProgress, leavePlaytestProgress } from './progressScope';
import { rememberFlow, takeResume, type SavedSession } from './resume';
import { installWatchers, telemetry } from './runtime';
import { STEP_VIEWS } from './steps';
import type { SessionRecord, StartInput } from './telemetry';
import './playtest.css';

export function PlaytestScreen() {
  // before any child reads the progress: the playtest's own, in memory (a reloaded tab's, when it carries on)
  const [resumed] = useState(() => {
    const r = takeResume(telemetry().session?.id);
    enterPlaytestProgress(r?.progress ?? null);
    return r;
  });
  useEffect(() => () => leavePlaytestProgress(), []);
  // the year's screens it hosts move by the hash: they stay inside
  useEffect(() => holdHash(), []);
  // the pages say "Brote": the child's own character's name is said instead
  useEffect(() => {
    setSpeechFilter((t) => withName(t, progress.get().character));
    return () => setSpeechFilter(null);
  }, []);
  // the wardrobe's pieces unlock at a few seeds of this session (the year's milestones are for a year)
  useState(() => { setUnlocks(PLAYTEST_UNLOCKS); return true; });
  useEffect(() => () => setUnlocks(null), []);
  // every spoken line can show as text (on from 3ro, or as the setup and 💬 say); a reloaded tab keeps its state
  useEffect(() => {
    const off = installCaptions();
    setCaptions(!!(resumed && telemetry().session?.device.captions));
    return off;
  }, [resumed]);
  return <Playtest resumed={resumed} />;
}

function Playtest({ resumed }: { resumed: SavedSession | null }) {
  const tel = telemetry();
  const [flow, setFlow] = useState<FlowState>(() => resumed?.flow ?? initialFlow(Date.now()));
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const [session, setSession] = useState<SessionRecord | null>(() => (resumed ? tel.session : null));
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
    rememberFlow(tel.session?.id, t.state, now);
    const c = t.change;
    if (!c) return;
    tel.log('step', { ...c });
    const patch: Parameters<typeof tel.updateSession>[0] = { current_step: c.to };
    if (c.reason === 'end_now') Object.assign(patch, { ended_at: new Date(now).toISOString(), end_reason: 'adult_ended' });
    else if (c.to === 'goodbye' && !t.state.endedEarly) Object.assign(patch, { ended_at: new Date(now).toISOString(), end_reason: 'completed' });
    tel.updateSession(patch);
    // a new step: the last line's text goes, and a hand nobody answered goes down (the child moved on)
    clearCaption();
    endHandRef.current('moved_on');
  }, [tel]);

  const start = useCallback((input: StartInput) => {
    setCaptions(!!input.captions);
    progress.reset();
    // a new child: the pages' first-entry demos play again
    forgetRealtimeIntros();
    forgetWorkshopGuides();
    setHand(null);
    level.current = null;
    setSession(tel.startSession(input));
    apply({ type: 'next' });
  }, [tel, apply]);

  const newSession = useCallback(() => {
    progress.reset();
    setHand(null);
    setCaptions(false);
    clearCaption();
    level.current = null;
    setSession(null);
    const s = initialFlow(Date.now());
    flowRef.current = s;
    setFlow(s);
    rememberFlow(null, s);
  }, []);

  /** A raised hand goes down: answered by the adult, or not (the child solved it alone, or moved on). */
  function endHand(resolved_by: 'adult' | 'self' | 'moved_on', levelId?: string) {
    const up = handRef.current;
    if (!up || (levelId != null && up.level_id !== levelId)) return;
    handRef.current = null;
    setHand(null);
    tel.log('call_adult_end', { ...(up.level_id ? { level_id: up.level_id } : {}), resolved_by, duration_ms: Date.now() - up.since });
  }
  const endHandRef = useRef(endHand);
  endHandRef.current = endHand;

  const raiseHand = useCallback((reason: HandState['reason']) => {
    const lv = level.current;
    const up = handRef.current;
    const next: HandState = up ?? { since: Date.now(), level_id: lv?.id, help_step: lv?.helpStep ?? 0, reason };
    log('call_adult', { ...(lv ? { level_id: lv.id } : {}), reason, help_step: lv?.helpStep ?? 0, hand_up: !!up });
    if (!up) { handRef.current = next; setHand(next); }
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
    if (prompted) endHandRef.current('adult');
  }, [log]);

  const lowerHand = useCallback((how: 'self' | 'moved_on', levelId?: string) => endHandRef.current(how, levelId), []);

  const toggleCaptions = useCallback((on: boolean, where: 'bar' | 'corner') => {
    setCaptions(on);
    log('captions', { on, where });
    const d = tel.session?.device;
    if (d) tel.updateSession({ device: { ...d, captions: on } });
  }, [log, tel]);

  const api = useMemo<PlaytestApi>(() => ({
    session,
    flow,
    next: () => apply({ type: 'next' }),
    skip: () => apply({ type: 'skip' }),
    endNow: () => apply({ type: 'end_now' }),
    did: (activity) => apply({ type: 'did', activity }),
    log,
    patchSession: (patch) => tel.updateSession(patch),
    level,
    hand,
    raiseHand,
    lowerHand,
    adultHelp,
    setCaptions: toggleCaptions,
  }), [session, flow, apply, log, hand, raiseHand, lowerHand, adultHelp, toggleCaptions, tel]);

  useEffect(() => installWatchers(() => (flowRef.current.step === 'setup' ? null : flowRef.current.step)), []);

  // a reloaded tab carried on: the data says so (the step starts over; the ladder and free play keep their state)
  const resumeLogged = useRef(false);
  useEffect(() => {
    if (!resumed || resumeLogged.current) return;
    resumeLogged.current = true;
    const visit = resumed.flow.visits[resumed.flow.visits.length - 1];
    log('resume', { step: resumed.flow.step, since_save_ms: Date.now() - resumed.at, step_ms: Date.now() - (visit?.at ?? Date.now()) });
  }, [resumed, log]);

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
          {session && <Captions step={flow.step} />}
          {session && <AdultControls />}
        </div>
      </PlayerContext.Provider>
    </PlaytestContext.Provider>
  );
}
