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
// The classroom round (T14): the core route ends with the green flag and
// endless free play (flow.ts); el docente's class commands arrive with the
// sync answers (telemetry.ts onCommand): "quedan 5 minutos" shows a banner
// and wraps the session up (the item on screen, the wardrobe, the survey),
// "terminar la clase" shows "Actividad terminada" (classroom.tsx) and ends
// it. T37's "Juegos para todos" (`games_all`) moves a device still on the
// core route straight to the free-play menu (a short banner, no end). A
// demo session (demo.ts) gets the demo bar (DemoBar.tsx).
//
// T18 (the silent classroom round): the device's `?sonido=`/localStorage
// baseline is set as early as possible (before Setup even renders), and
// every change of the effective setting (the admin's sync answers, the
// adult's corner-menu toggle) is logged and kept on `device.sound` while a
// session is open (soundSetting.ts does the resolving; ui/mute.ts is the
// actual switch).
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
import { forgetSilentDemos } from '../ui/silentDemo';
import { resetCopaMemory } from './copa2/store';
import { setSpeechFilter } from '../ui/speech';
import { clearCaption, installCaptions, setCaptions } from './captions';
import { Captions } from './Captions';
import { PLAYTEST_UNLOCKS } from './WardrobeStep';
import { withName } from './characterName';
import { nameParamFromUrl, nameScreenOn } from './childName';
import { holdHash } from './hashHold';
import { AdultControls } from './AdultControls';
import { PlaytestContext, type AdultHelpKind, type AdultHelpVia, type HandState, type LevelTrack, type PlaytestApi } from './context';
import { classicRouteFromUrl, initialFlow, is4to, isLiveStep, reduce, routeOf, visited, wrapPending, type FlowAction, type FlowState, type StepId, type Transition } from './flow';
import { savePreviousChild } from './previousChild';
import { ClassEndBanner, FiveMinBanner, GamesAllBanner, RouteFlag, isLateEndClass } from './classroom';
import { DemoBar } from './DemoBar';
import { setFast } from './demo';
import { setPageHooks } from '../screens/levelKit';
import { enterPlaytestProgress, leavePlaytestProgress } from './progressScope';
import { rememberFlow, takeResume, type SavedSession } from './resume';
import { browserStorage, installWatchers, telemetry } from './runtime';
import { initDeviceSound, setAdminSound, subscribeSound, currentSound } from './soundSetting';
import { initDeviceVoice } from './voiceSetting';
import { isVoiceOff, subscribeVoiceOff } from '../ui/voice';
import { STEP_VIEWS } from './steps';
import type { SessionRecord, StartInput } from './telemetry';
import './playtest.css';

export function PlaytestScreen() {
  // T18: before Setup even renders (so its first spoken line, if any, is already muted or not)
  useState(() => { initDeviceSound(typeof location !== 'undefined' ? location.search : '', browserStorage()); return true; });
  // T27: this device's saved "Voz" choice, restored the same way
  useState(() => { initDeviceVoice(browserStorage()); return true; });
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
  /** "Quedan 5 minutos" on screen (the command's id), or null. */
  const [banner, setBanner] = useState<number | null>(null);
  /** T28: "terminar la clase"'s own non-blocking countdown on screen (the command's id), or null; while set, the five-minute banner stays hidden. */
  const [ending, setEnding] = useState<number | null>(null);
  /** T37: "Juegos para todos"'s short notice on screen (the command's id), or null; only set when the device actually moved (see onCommand). */
  const [gamesAll, setGamesAll] = useState<number | null>(null);
  // a reloaded demo session keeps the page hooks the demo bar plays through
  useState(() => { if (resumed && tel.session?.demo) setPageHooks(true); return true; });
  const handRef = useRef(hand);
  handRef.current = hand;
  const level = useRef<LevelTrack | null>(null);

  const log = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    if (flowRef.current.step === 'setup') return;
    tel.log(type, payload);
  }, [tel]);

  /**
   * T22: a session ending with no real child input yet (still on the
   * character screen, nothing picked, never reached a step of the core
   * route: the device auto-returned to `?grado` between two classes and
   * nobody sat down before the next class command, or the adult, ended it)
   * is marked `abandoned` instead of whatever reason would otherwise land
   * on it, so it does not look like a played class in the data (it already
   * carries no `level_start`, per the dictionary's existing `abandoned`
   * meaning). A session that really was played is cached locally
   * (previousChild.ts) so "Comentario del chico anterior" can still reach
   * it once the device has moved on.
   */
  const finishSession = useCallback((patch: Parameters<typeof tel.updateSession>[0], flowAtEnd: FlowState) => {
    // T39: 4to's Arcade (free_play, not on its core route) counts as played too, as it always did for the default route
    const empty = flowAtEnd.activities.length === 0 && ![...routeOf(flowAtEnd), 'free_play' as const].some((s) => visited(flowAtEnd, s));
    tel.updateSession(empty && patch.end_reason ? { ...patch, end_reason: 'abandoned' } : patch);
    const s = tel.session;
    if (s && s.ended_at && !s.demo && !empty) {
      savePreviousChild({ id: s.id, ended_at: s.ended_at, grade: s.grade, character: progress.get().character, current_step: s.current_step });
    }
  }, [tel]);

  const apply = useCallback((action: FlowAction): Transition | null => {
    const now = Date.now();
    const prev = flowRef.current;
    const t = reduce(prev, action, now);
    if (t.state === prev) return null;
    flowRef.current = t.state;
    setFlow(t.state);
    rememberFlow(tel.session?.id, t.state, now);
    const c = t.change;
    // C04 (4to): the Arcade opened (the Copa's circuit 2, the Workshop's challenges 1–5, "Juegos para todos", the demo, the 20-minute timer)
    if (t.state.arcadeOpen && !prev.arcadeOpen) {
      tel.log('arcade_open', { via: action.type === 'games_all' ? 'games_all' : action.type === 'route_done' ? 'demo' : action.type === 'arcade_open' ? action.via : 'workshop', step: prev.step });
    }
    if (!c) {
      // C04: 4to's green flag rises in the Copa (or the Workshop), with no step change
      if (t.routeDoneNow) {
        const started = tel.session?.started_at ? Date.parse(tel.session.started_at) : now;
        tel.log('route_done', { time_ms: now - started, via: action.type === 'arcade_open' ? action.via : 'workshop', survey_done: !!t.state.surveyDone });
      }
      return t;
    }
    tel.log('step', { ...c });
    const patch: Parameters<typeof tel.updateSession>[0] = { current_step: c.to };
    const at = new Date(now).toISOString();
    // the adult ended it: after the route that is a completed session (the child did it all)
    if (c.reason === 'end_now') Object.assign(patch, { ended_at: at, end_reason: t.state.routeDone ? 'completed' : 'adult_ended' });
    else if (c.to === 'goodbye' && !t.state.endedEarly) Object.assign(patch, { ended_at: at, end_reason: c.reason === 'demo' ? 'demo_ended' : 'completed' });
    finishSession(patch, t.state);
    // the core route is done: the green flag (the admin's "terminó")
    if (t.routeDoneNow) {
      const started = tel.session?.started_at ? Date.parse(tel.session.started_at) : now;
      tel.log('route_done', { time_ms: now - started, via: c.reason === 'demo' ? 'demo' : flowRef.current.wrapUp ? 'wrap_up' : 'route', survey_done: !!t.state.surveyDone });
    }
    // a new step: the last line's text goes, and a hand nobody answered goes down (the child moved on)
    clearCaption();
    endHandRef.current('moved_on');
    return t;
  }, [tel, finishSession]);

  const start = useCallback((input: StartInput) => {
    setCaptions(!!input.captions);
    setFast(false);
    setPageHooks(!!input.demo);
    setBanner(null);
    setGamesAll(null);
    progress.reset();
    // a new child: the pages' first-entry demos play again
    forgetRealtimeIntros();
    forgetWorkshopGuides();
    forgetSilentDemos();
    // C04: a new child starts the Copa fresh too (its own module-cache, resume.ts's own parts are cleared by `start`'s session change)
    resetCopaMemory();
    setHand(null);
    level.current = null;
    setSession(tel.startSession(input));
    // T38: decided once, right as the session starts (the grade is known, nothing else is yet)
    const nameOn = nameScreenOn(input.grade, nameParamFromUrl(typeof location !== 'undefined' ? location.search : ''));
    // T39: the grade picks the route (4to's own; T43: 1ro's own, unless the link says `ruta=clasica`), once
    apply({ type: 'next', nameOn, grade: input.grade, classic: classicRouteFromUrl(typeof location !== 'undefined' ? location.search : '') });
  }, [tel, apply]);

  const newSession = useCallback(() => {
    progress.reset();
    setFast(false);
    setPageHooks(false);
    setBanner(null);
    setGamesAll(null);
    resetCopaMemory();
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

  const adultHelp = useCallback((kind: AdultHelpKind, prompted: boolean, via?: AdultHelpVia) => {
    const lv = level.current;
    const up = handRef.current;
    log('adult_help', {
      ...(lv ? { level_id: lv.id } : {}),
      kind,
      prompted,
      ...(prompted && up ? { duration_ms: Date.now() - up.since } : {}),
      ...(via ? { via } : {}),
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

  const endSession = useCallback((reason: 'class_end') => {
    const cur = tel.session;
    if (!cur || cur.ended_at) return;
    finishSession({ ended_at: new Date().toISOString(), end_reason: reason }, flowRef.current);
    void tel.flush();
  }, [tel, finishSession]);

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
    openSurvey: () => { apply({ type: 'survey' }); },
    endSession,
    demoGoto: (to) => { apply({ type: 'goto', to }); },
    demoRouteDone: () => { apply({ type: 'route_done' }); },
    arcade: (to) => { apply({ type: 'arcade', to }); },
    openArcade: (via = 'workshop') => { apply({ type: 'arcade_open', via }); },
    adultGoto: (to) => { apply({ type: 'adult_goto', to }); },
    demoEnd: () => { apply({ type: 'goto', to: 'goodbye' }); },
  }), [session, flow, apply, log, hand, raiseHand, lowerHand, adultHelp, toggleCaptions, tel, endSession]);

  // el docente's class commands (T14), as the sync answers bring them (each once)
  useEffect(() => tel.onCommand((cmd) => {
    const received = { id: cmd.id, sent_at: cmd.at, received_at: new Date().toISOString(), step: flowRef.current.step };
    if (cmd.kind === 'five_min') {
      if (cmd.cancelled) {
        log('class_command', { kind: 'cancel_five_min', ...received });
        setBanner(null);
        apply({ type: 'wrap_up', on: false });
        return;
      }
      log('class_command', { kind: 'five_min', ...received });
      setBanner(cmd.id);
      apply({ type: 'wrap_up', on: true });
    } else if (cmd.kind === 'games_all') {
      // T37: a command cancelled before this device ever saw it is dropped
      // by telemetry.ts's own queue and never reaches here (same as
      // `five_min`'s "a warning cancelled before this device ever saw it is
      // never applied"); `cmd.cancelled` here means a device that already
      // moved just learned it was cancelled — the move was immediate, so
      // there is nothing left to undo, only to log.
      log('class_command', { kind: cmd.cancelled ? 'cancel_games_all' : 'games_all', ...received });
      if (cmd.cancelled) return;
      // `apply` returns null when nothing changed (flow.ts's `canGamesAll`:
      // already in free play, or not past the character screen) — then
      // there is nothing to announce.
      if (apply({ type: 'games_all' })) setGamesAll(cmd.id);
    } else {
      // T28: a device asleep (lid closed) when this was sent can wake up long
      // after, with a new child already sitting down — never show them the
      // old child's countdown or garden; end the stale session silently and
      // go straight to a fresh start instead (T22's own guard still marks a
      // never-really-played session `abandoned`, not `class_end`).
      const late = isLateEndClass(cmd.at, Date.now());
      log('class_command', { kind: 'end_class', ...received, ...(late ? { late: true } : {}) });
      setBanner(null);
      if (late) {
        setEnding(null);
        endSession('class_end');
        newSession();
      } else {
        // the non-blocking countdown (ClassEndBanner, below); only once it
        // reaches zero does the session actually end and the flow move to
        // `class_end` (the resting garden) — the child keeps playing until then
        setEnding(cmd.id);
      }
    }
  }), [tel, log, apply, endSession, newSession]);

  // T18: the admin's sound setting, as every sync answer carries it
  useEffect(() => tel.onAdminSound(setAdminSound), [tel]);
  // T18: logged only once a session exists (the setup's own session-start input already carries the value it started with)
  // T27: the `voice` field rides along on the same `sound` event/`device` fields (see the `voice` effect just below)
  useEffect(() => subscribeSound((s) => {
    if (!tel.session || flowRef.current.step === 'setup') return;
    log('sound', { on: s.on, source: s.source, voice: !isVoiceOff() });
    const d = tel.session.device;
    tel.updateSession({ device: { ...d, sound: s.on, sound_source: s.source, voice: !isVoiceOff() } });
  }), [log, tel]);
  // T27: the adult corner menu's "Voz: sí / no" for this device — kept consistent with the `sound` event/`device` fields above
  useEffect(() => subscribeVoiceOff(() => {
    if (!tel.session || flowRef.current.step === 'setup') return;
    const s = currentSound();
    log('sound', { on: s.on, source: s.source, voice: !isVoiceOff() });
    const d = tel.session.device;
    tel.updateSession({ device: { ...d, sound: s.on, sound_source: s.source, voice: !isVoiceOff() } });
  }), [log, tel]);

  // "quedan 5 minutos" on a step with no item to finish (the character, the tool check): on to the wardrobe now
  useEffect(() => {
    if ((flow.step === 'character' || flow.step === 'tool_check') && wrapPending(flow)) apply({ type: 'next' });
  }, [flow, apply]);

  useEffect(() => installWatchers(() => (flowRef.current.step === 'setup' ? null : flowRef.current.step)), []);

  // T29: closing the tab never loses progress (resume.ts), but the browser's
  // own leave prompt still gives a second chance — only while a session is
  // actually being played (isLiveStep: not the setup, not resting after
  // "terminar la clase", not the goodbye). None of the app's own transitions
  // (the goodbye's restart, the adult's "Terminar la sesión", demo mode) ever
  // navigate the page away — they only change this same tab's React state —
  // so this can never block any of them; it only ever answers a real close,
  // reload or address-bar navigation.
  useEffect(() => {
    if (!session || !isLiveStep(flow.step)) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [session, flow.step]);

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
      /** Straight to a step (screenshots, checks). */
      jump: (to: StepId) => { apply({ type: 'goto', to }); },
      routeDone: () => { apply({ type: 'route_done' }); },
      /** C04 (4to): the Arcade opened as by the Copa (or the Workshop), and the moves between them and the Arcade. */
      openArcade: (via: 'workshop' | 'copa' = 'copa') => { apply({ type: 'arcade_open', via }); },
      arcade: (to: 'workshop' | 'copa' | 'free_play' | 'wardrobe') => { apply({ type: 'arcade', to }); },
      /** Checks: the hand raised as after the third help step (the child's hold no longer raises it). */
      raiseHand: () => raiseHand('help_step_3'),
      start,
    };
  });

  const View = STEP_VIEWS[flow.step];
  const live = isLiveStep(flow.step);
  const flagOn = !!session && !!flow.routeDone && live;
  return (
    <PlaytestContext.Provider value={api}>
      <PlayerContext.Provider value={useYearPlayer()}>
        <div className={`piloto step-${flow.step}${flagOn ? ' route-done' : ''}${session?.demo ? ' is-demo' : ''}`} data-step={flow.step} data-route={flow.route}>
          <View key={flow.visits.length} start={start} newSession={newSession} />
          {session && flow.step !== 'class_end' && <Captions step={flow.step} />}
          {flagOn && <RouteFlag />}
          {/* T28: the "terminar la clase" countdown takes priority over "quedan 5 minutos" (both can be queued together for a device that was offline) */}
          {session && ending != null && live && (
            <ClassEndBanner key={ending} done={() => { setEnding(null); endSession('class_end'); apply({ type: 'class_end' }); }} />
          )}
          {session && banner != null && ending == null && live && <FiveMinBanner key={banner} done={() => setBanner(null)} />}
          {session && gamesAll != null && ending == null && live && <GamesAllBanner key={gamesAll} done={() => setGamesAll(null)} {...(is4to(flow) ? { text: '¡Se abrió el Arcade!' } : {})} />}
          {session && flow.step !== 'class_end' && <AdultControls />}
          {session?.demo && <DemoBar />}
        </div>
      </PlayerContext.Provider>
    </PlaytestContext.Provider>
  );
}
