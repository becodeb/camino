// 4to's mandatory step: the Copa de 4to, version 2 (C10; the garage and the
// engine are src/playtest/copa2/). It replaces C04's single-slot circuits.
//
//   You are the engineer: ONE program grows across five copas, ¡Largar! runs it
//   on a track, a crash sends the child back to the garage. This file is the
//   flow around the garage (the journey itself, the rules, is copa2/journey.ts):
//
//   - the copa strip (Hub) is where the child starts (placement from the ladder's
//     ceiling), comes back to from the Arcade ("Tu mejor tiempo"), and moves
//     between the copas reached so far;
//   - each copa 2-5 opens with Ayudá al ciervo, then its tracks in order; a
//     track is done when it is finished, in any place;
//   - after a loss, Espiá el programa del <rival>; after a first-run silver
//     finish of a copa's first track, "¡Saltar a la copa siguiente!";
//   - two failed runs on a track turn the ghost hand on.
//
// The Arcade unlocks the first of: copa 2 finished, or 20 minutes since the
// route started (past the setup); the mid-class survey the first of: copa 3
// finished, or 25 minutes — never during a run (the garage reports its phase).
// "¡Se abrió el Arcade!" is announced large inside the screen, once, and from
// then on an Arcade button sits in the garage's header. "Quedan 5 minutos" moves
// on (the survey, then the Arcade) once it is safe, never mid-run.
//
// Data (docs/prueba-piloto-datos.md, "Copa v2"): the garage's `garage_run`,
// `garage_edit`, `garage_step_view`, plus this flow's `garage_place`,
// `garage_copa_start`, `garage_track_done`, `garage_revancha`, `garage_ghost`,
// `garage_skip`, `garage_spy`, `garage_debug`.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { speak } from '../ui/speech';
import { DEBUG } from '../screens/levelKit';
import { GameControllerArt } from './classroom';
import { usePlaytest } from './context';
import { clearCaption } from './captions';
import { wrapPending } from './flow';
import { CupIcon } from './raceArt';
import { Garage, type GarageResultPayload, type RunReport } from './copa2/Garage';
import { Hub, type HubNote } from './copa2/Hub';
import { Spy } from './copa2/Spy';
import {
  afterRace, completeDeer, completeTrack, copaFinishedHere, copasFinished, currentStep, deerCanGiveUp, deerGhostOn, deerSetup, enterCopa,
  ghostOn, medalOf, newJourney, offerSkip, programFor, recordDeerRun, recordRun, setDeerProgram, setProgram, skipCopa, startDeer, stepsOf,
  type Journey,
} from './copa2/journey';
import { loadJourney, readLadderCeiling, saveJourney } from './copa2/store';
import { startTier } from './copa2/rivals';
import { trackById, type CopaId } from './copa2/tracks';
import type { Program } from './copa2/program';
import './copa2/flow.css';

/** The Arcade opens at copa 2, or by this long since the route started, whichever first. */
export const ARCADE_TIME_MS = 20 * 60_000;
/** The mid-class survey, at copa 3, or by this long since the route started, whichever first. */
export const SURVEY_TIME_MS = 25 * 60_000;
export const SURVEY_AFTER_COPA = 3;
export const ARCADE_AFTER_COPA = 2;
/** How often the two timers above are checked. */
const CHECK_MS = 1000;

const ARCADE_SAY = '¡Se abrió el Arcade! Ya podés jugar. La Copa sigue acá: podés volver cuando quieras.';

/** The earliest visit past the setup (name or character, whichever is first): when 4to's route really started. */
function routeStartAt(visits: readonly { step: string; at: number }[]): number {
  return visits.find((v) => v.step !== 'setup')?.at ?? visits[0]?.at ?? Date.now();
}

type View =
  | { kind: 'hub'; note: HubNote }
  | { kind: 'track'; trackId: string; n: number }
  | { kind: 'deer'; copa: CopaId; n: number }
  | { kind: 'spy'; trackId: string; tier: ReturnType<typeof startTier>; n: number };

export function CopaStep() {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const sessionId = api.session?.id;
  const [boot] = useState(() => {
    const saved = loadJourney(sessionId);
    return { journey: saved ?? newJourney(readLadderCeiling(sessionId)), fresh: !saved };
  });
  const [journey, setJourneyState] = useState<Journey>(boot.journey);
  const jref = useRef(journey);
  const [view, setView] = useState<View>({ kind: 'hub', note: boot.fresh ? 'placement' : 'back' });
  const [announce, setAnnounce] = useState(false);
  const [shown, setShown] = useState(false);
  /** 'busy': a run is on screen (the survey and "quedan 5 minutos" wait). */
  const busy = useRef(false);
  const surveyAsked = useRef(false);
  const startAt = useRef(routeStartAt(api.flow.visits));
  const open = !!api.flow.arcadeOpen;
  const log = useCallback((type: string, payload: Record<string, unknown> = {}) => apiRef.current.log(type, payload), []);

  const update = useCallback((fn: (j: Journey) => Journey): Journey => {
    const next = fn(jref.current);
    if (next !== jref.current) {
      jref.current = next;
      setJourneyState(next);
      saveJourney(apiRef.current.session?.id, next);
    }
    return next;
  }, []);

  useEffect(() => { apiRef.current.did('copa'); }, []);

  // where the child starts (once per journey): placement from the ladder's ceiling
  useEffect(() => {
    const j = jref.current;
    if (j.placed) return;
    log('garage_place', { start_copa: j.startCopa, ceiling_rung: j.ceiling, start_tier: startTier(j.ceiling) });
    update((x) => ({ ...x, placed: true }));
  }, [log, update]);

  // a new screen: the last spoken line's caption (a bubble floating over the garage's goal) goes
  useEffect(() => { clearCaption(); }, [view.kind, (view as { trackId?: string }).trackId]);

  // the first time a copa's step is on screen in this mount
  const loggedCopas = useRef(new Set<number>());
  const viaRef = useRef<'placement' | 'next' | 'skip' | 'strip' | 'back'>(boot.fresh ? 'placement' : 'back');
  useEffect(() => {
    if (view.kind === 'hub' || view.kind === 'spy') return;
    const copa = view.kind === 'deer' ? view.copa : trackById(view.trackId)!.copa;
    // the track (or the deer) now on screen: /admin reads it
    log('garage_track_start', view.kind === 'deer'
      ? { copa, track: `c${copa}-a`, deer: true }
      : { copa, track: view.trackId, rival: jref.current.rival, ghost: ghostOn(jref.current, view.trackId) });
    if (loggedCopas.current.has(copa)) return;
    loggedCopas.current.add(copa);
    log('garage_copa_start', { copa, via: viaRef.current, start_copa: jref.current.startCopa });
  }, [view, log]);

  // ---------------------------------------------------------------- the Arcade and the survey
  const openArcadeNow = useCallback(() => {
    const a = apiRef.current;
    if (a.flow.arcadeOpen) return;
    a.openArcade('copa');
    setAnnounce(true);
  }, []);
  const finishedCopas = copasFinished(journey);
  useEffect(() => { if (finishedCopas >= ARCADE_AFTER_COPA) openArcadeNow(); }, [finishedCopas, openArcadeNow]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!apiRef.current.flow.arcadeOpen && Date.now() - startAt.current >= ARCADE_TIME_MS) openArcadeNow();
      const f = apiRef.current.flow;
      const due = !f.surveyDone && f.step !== 'survey'
        && (copasFinished(jref.current) >= SURVEY_AFTER_COPA || Date.now() - startAt.current >= SURVEY_TIME_MS);
      // never mid-run: wait for the garage's own result, the strip or the garage
      if (due && !surveyAsked.current && !busy.current) { surveyAsked.current = true; apiRef.current.openSurvey('flag'); }
    }, CHECK_MS);
    return () => clearInterval(id);
  }, [openArcadeNow]);

  // the announcement waits a beat so the result (confetti, the place) is seen first
  useEffect(() => {
    if (!announce || shown) return;
    const t = window.setTimeout(() => { setShown(true); speak(ARCADE_SAY); }, 1400);
    return () => clearTimeout(t);
  }, [announce, shown]);

  // "quedan 5 minutos": move on (to the survey, or to the Arcade once open) once it is safe to — never mid-run
  const wrap = wrapPending(api.flow);
  useEffect(() => {
    if (!wrap) return;
    const id = window.setInterval(() => { if (!busy.current) apiRef.current.next(); }, CHECK_MS);
    return () => clearInterval(id);
  }, [wrap]);

  const toArcade = () => { setAnnounce(false); apiRef.current.arcade('free_play'); };

  // ---------------------------------------------------------------- moving through the copas
  const openStep = (j: Journey) => {
    const step = currentStep(j);
    if (!step) { setView({ kind: 'hub', note: j.copa >= 5 ? 'all_done' : 'copa_done' }); return; }
    if (step.kind === 'deer') {
      update((x) => startDeer(x, step.copa, Date.now()));
      setView({ kind: 'deer', copa: step.copa, n: Date.now() });
    } else setView({ kind: 'track', trackId: step.track.id, n: Date.now() });
  };

  const goCopa = (copa: CopaId, via: 'next' | 'strip') => {
    viaRef.current = via;
    openStep(update((j) => enterCopa(j, copa)));
  };
  const goTrack = (trackId: string) => {
    viaRef.current = 'strip';
    const copa = Number(trackId.slice(1, 2)) as CopaId;
    const at = stepsOf(copa).findIndex((s) => s.kind === 'track' && s.track.id === trackId);
    const j = update((x) => ({ ...enterCopa(x, copa), step: at }));
    openStep(j);
  };
  const toHub = () => setView({ kind: 'hub', note: 'back' });

  // ---------------------------------------------------------------- a track
  const onRun = (trackId: string) => (r: RunReport) => {
    const out = recordRun(jref.current, trackId, {
      outcome: r.outcome, ...(r.result ? { place: r.result.place, beaten: r.result.beaten } : {}), timeMs: r.timeMs,
    });
    update(() => out.journey);
    if (out.ghostNow) log('garage_ghost', { track: trackId, failures: out.journey.tracks[trackId].failStreak });
  };

  const trackDone = (p: GarageResultPayload, skip: boolean) => {
    const rec = jref.current.tracks[p.trackId];
    const copa = Number(p.trackId.slice(1, 2)) as CopaId;
    log('garage_track_done', {
      copa, track: p.trackId, place: p.place, won: p.won, medal: rec?.medal ?? medalOf(p.result.beaten), best_ms: rec?.bestMs ?? p.timeMs, time_ms: p.timeMs,
      runs: rec?.runs ?? p.runs, crashes: rec?.fails ?? 0, ghost: !!rec?.ghost, rival: p.rival, ...(skip ? { skipped_ahead: true } : {}),
    });
    return afterRace(completeTrack(jref.current, p.trackId), p.won);
  };

  const onNext = (p: GarageResultPayload) => {
    const j = update(() => trackDone(p, false));
    if (copaFinishedHere(j)) { setView({ kind: 'hub', note: j.copa >= 5 ? 'all_done' : 'copa_done' }); return; }
    openStep(j);
  };
  const onSkip = (p: GarageResultPayload) => {
    const from = Number(p.trackId.slice(1, 2)) as CopaId;
    log('garage_skip', { from_copa: from, to_copa: from + 1, track: p.trackId, place: p.place, time_ms: p.timeMs });
    viaRef.current = 'skip';
    const j = update(() => skipCopa(trackDone(p, true), from));
    setView({ kind: 'hub', note: 'skipped' });
    return j;
  };
  const onRevancha = (p: GarageResultPayload) => {
    log('garage_revancha', { track: p.trackId, won: p.won, rival: p.rival });
    update((j) => afterRace(j, p.won));
  };
  const onSpy = (p: GarageResultPayload) => {
    update((j) => afterRace(j, false));
    setView({ kind: 'spy', trackId: p.trackId, tier: p.rival, n: Date.now() });
  };

  // ---------------------------------------------------------------- the deer
  const deerRun = (copa: CopaId) => (r: RunReport) => {
    const out = recordDeerRun(jref.current, copa, r.outcome, Date.now());
    update(() => out.journey);
    if (out.ghostNow) log('garage_ghost', { track: `c${copa}-a`, deer: true, failures: out.journey.deer[copa]!.failStreak });
  };
  const deerLeft = (copa: CopaId, fixed: boolean) => {
    const d = jref.current.deer[copa];
    const j = update((x) => completeDeer(x, copa, fixed, Date.now()));
    log('garage_debug', { copa, attempts: d?.runs ?? 0, fixed, ms: j.deer[copa]?.ms ?? 0, ghost: !!d?.ghost });
    openStep(j);
  };

  // ---------------------------------------------------------------- the header's buttons
  const headerExtra = (
    <>
      <button type="button" className="cut gx-hbtn" data-act="copas" onClick={toHub} aria-label="Ver las copas">
        <CupIcon size={26} /><span>Copas</span>
      </button>
      {open && (
        <button type="button" className="cut gx-hbtn pp-arcade-btn" data-act="arcade" aria-label="Ir al Arcade" onClick={toArcade}>
          <GameControllerArt /><span>Arcade</span>
        </button>
      )}
    </>
  );
  const onPhase = useCallback((p: string) => { busy.current = p === 'run'; }, []);

  // ---------------------------------------------------------------- debug hooks (?debug): scripted checks
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __copaFlow: unknown }).__copaFlow = {
      journey: () => jref.current,
      view: () => view,
      /** Marks every track of copa `n` done (the adult's shortcut for checks): the same journey the child's own ¡Seguir! builds. */
      finishCopa: (n: CopaId) => { update((j) => stepsOf(n).reduce((acc, s) => (s.kind === 'track' ? completeTrack(acc, s.track.id) : completeDeer(acc, n, true, Date.now())), j)); },
      goCopa: (n: CopaId) => goCopa(n, 'strip'),
      finishDeer: (n: CopaId) => { update((j) => completeDeer(j, n, true, Date.now())); },
      /** Puts a track's reference program (gold, silver or bronze) in the journey, as the garage's own edit report would. */
      setRef: (trackId: string, tier: 'gold' | 'silver' | 'bronze' = 'gold') => { update((j) => setProgram(j, trackId, trackById(trackId)!.refs[tier])); },
      /** A program that is too big on purpose: the main scripts of several reference programs joined (the garage must say "No entra"). */
      setBig: (trackId: string, from: [string, 'gold' | 'silver' | 'bronze'][]) => {
        update((j) => setProgram(j, trackId, { main: from.flatMap(([id, tier]) => trackById(id)!.refs[tier].main) }));
      },
    };
    return () => { delete (window as unknown as { __copaFlow?: unknown }).__copaFlow; };
  });

  // ---------------------------------------------------------------- what is on screen
  let body: ReactElement;
  if (view.kind === 'hub') {
    body = (
      <Hub
        journey={journey} note={view.note} arcadeOpen={open}
        onGoCopa={(c) => goCopa(c, 'next')} onGoTrack={goTrack}
        onContinue={() => { viaRef.current = view.note === 'placement' ? 'placement' : 'back'; openStep(copaFinishedHere(jref.current) ? update((j) => enterCopa(j, j.copa)) : jref.current); }}
        extra={open ? (
          <button type="button" className="cut hb-arcade-btn pp-arcade-btn" data-act="arcade" onClick={toArcade}><GameControllerArt /><span>Arcade</span></button>
        ) : undefined}
      />
    );
  } else if (view.kind === 'spy') {
    const track = trackById(view.trackId)!;
    body = (
      <Spy
        key={view.n} track={track} tier={view.tier} logger={log}
        onPhase={(b) => { busy.current = b; }}
        onDone={() => { busy.current = false; setView({ kind: 'track', trackId: view.trackId, n: Date.now() }); }}
        headerExtra={headerExtra}
      />
    );
  } else if (view.kind === 'deer') {
    const setup = deerSetup(view.copa)!;
    body = (
      <DeerView
        key={view.n} copa={view.copa} journey={journey} setup={setup} headerExtra={headerExtra}
        onProgram={(p) => update((j) => setDeerProgram(j, view.copa, p))}
        onRun={deerRun(view.copa)} onPhase={onPhase} logger={log}
        onFixed={() => deerLeft(view.copa, true)} onGiveUp={() => deerLeft(view.copa, false)}
      />
    );
  } else {
    const track = trackById(view.trackId)!;
    const start = programFor(journey, track.id);
    body = (
      <Garage
        key={`${view.trackId}-${view.n}`} track={track} rivalTier={journey.rival}
        initialProgram={start.program} reference={start.reference}
        ghostHint={ghostOn(journey, track.id)} headerExtra={headerExtra}
        onProgramChange={(p) => update((j) => setProgram(j, track.id, p))}
        logger={log} onRun={onRun(track.id)} onPhase={onPhase}
        onResult={onNext} onRevancha={onRevancha} onSpy={onSpy}
        offerSkip={(p) => offerSkip(jref.current, { trackId: p.trackId, beaten: p.result.beaten })} onSkip={onSkip}
      />
    );
  }

  return (
    <>
      {body}
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

// ------------------------------------------------------------------ Ayudá al ciervo

function DeerView({ copa, journey, setup, headerExtra, onProgram, onRun, onPhase, logger, onFixed, onGiveUp }: {
  copa: CopaId; journey: Journey; setup: NonNullable<ReturnType<typeof deerSetup>>; headerExtra: ReactElement;
  onProgram(p: Program): void; onRun(r: RunReport): void; onPhase(p: string): void; logger(type: string, payload?: Record<string, unknown>): void;
  onFixed(): void; onGiveUp(): void;
}) {
  const track = useMemo(() => setup.track, [setup]);
  return (
    <Garage
      track={track} mode="deer" rivalTier="bronze" initialProgram={journey.deerPrograms[copa] ?? setup.program}
      ghostHint={deerGhostOn(journey, copa)} headerExtra={headerExtra}
      onProgramChange={onProgram} logger={logger} onRun={onRun} onPhase={onPhase} onResult={onFixed}
      giveUp={deerCanGiveUp(journey, copa) ? { label: 'Seguir sin arreglarlo', onGiveUp } : null}
    />
  );
}
