// Copa de 4to (C03): the screen. Five circuits, each one concept and one
// empty slot (the rest of the program already in place — never a blank
// tape), raced on the SAME live view as 1ro's own "La carrera"
// (race.ts/raceArt.tsx, reused via copaTrack.tsx): a side-scrolling road,
// the child's kart, two critters — never a bare quiz. The two rivals are
// never the rubber band: they drive continuously at their fixed honest pace
// (honestRace.ts) from the moment a circuit starts, independent of the
// child, so the fox visibly pulls ahead when the child is slow and the
// turbo visibly overtakes it. Circuits 1 (sequence) and 2 (turbo) are live,
// block-by-block, exactly like La carrera (instant per-block feedback, the
// kart nudges at once); circuits 3 (puddle), 4 (log event) and 5 (laps) are
// "pick the block, then ¡Correr!": the child places the one concept slot
// once, then watches the live consequence play out (slows/skids, jumps/
// crashes, the right/wrong lap count), landing on the same honest result
// podium as every other grade's honest races. Not wired into the 4to route
// yet (C04): `Copa` takes its own props so it can be driven standalone
// (and screenshotted via the dev-only `?debug#/copa-dev` entry below).
//
// Logged by the caller's `logger` prop: `copa_start`, `copa_end`,
// `copa_revancha` (docs/prueba-piloto-datos.md).
//
// C04: the medal strip, best time per circuit and the replay variant (drawn
// from the same seed plus `variant * 7919`, generateCircuit) survive both a
// reload AND an ordinary trip to the Arcade and back (no reload). resume.ts's
// own `parts` mechanism (rememberPart/resumedPart) is scoped to one step by
// design — "emptied when the step changes" — so it cannot carry the Copa's
// progress through the Arcade and back; a dedicated localStorage key
// (COPA_KEY, below), looked up by session id and kept independent of
// whatever step the reload happens to land on, plus an in-memory module
// cache for a same-tab remount with no reload at all, does the real job.
// The variant cycles by itself: whenever a circuit is started again
// (¡Revancha!, or looping back to an already-medalled circuit from the
// Arcade) rather than played for the first time, so a repeat never looks
// identical to the last attempt. `onPhase` (optional) lets the caller
// (CopaStep.tsx) know when it is safe to interrupt with the mid-class
// survey: never while `'play'`.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CritterId } from '../curriculum/motivation';
import { speak } from '../ui/speech';
import { REDUCED } from '../ui/runtime';
import { CritterArt } from '../ui/critterArt';
import { DEBUG } from '../screens/levelKit';
import { PlayerFace } from '../screens/player';
import { Bar } from '../screens/LevelBar';
import { ThenArrow } from '../ui/art';
import {
  checkSlotChoice, copaMeMs, copaReason, copaPlacement, generateCircuit, medalLabel, rivalsMsFor,
  COPA_RIVALS, type CircuitDef, type CircuitId, type CopaResult, type Medal,
} from './copa';
import { honestRanking, type Racer } from './honestRace';
import {
  PARK, RIVAL_START, START, TURBO_SPEED, ZOOM_SPEED, arrowBlock, filledOf, judge, repeatFor, restingSpot,
  type Block, type RoadDir, type Stretch,
} from './race';
import { buildCourse, nextCam, rivalPositions, RaceScene, type SceneDust } from './copaTrack';
import { AgainArt, Cup, FlagIcon, PodiumSteps, Shelf } from './raceArt';
import { Palette, PodiumMe, Tape } from './Race';
import '../blocks/blocks.css';
import './playtest.css';
import './race.css';
import './copa.css';

export interface CopaProps {
  initial?: CircuitId;
  logger?(type: string, payload: Record<string, unknown>): void;
  onCircuitDone?(circuit: CircuitId, result: CopaResult, medal: Medal): void;
  onExit?(): void;
  /** C04: told every time the screen's own phase changes (a safe-to-interrupt moment is anything but `'play'`). */
  onPhase?(phase: 'intro' | 'play' | 'result'): void;
  /** C04: an extra button in the bar (CopaStep.tsx's "Ir al Arcade", once it is open), same spot as Workshop.tsx's own `barExtra`. */
  barExtra?: ReactNode;
  /** C04: the session id — the medals/best-times/variants store's own key, so a new child never inherits the last one's progress. */
  sessionId?: string;
}

type Medals = Record<CircuitId, Medal>;
type BestMs = Partial<Record<CircuitId, number>>;
type Variants = Record<CircuitId, number>;
interface CopaKept { id: CircuitId; medals: Medals; bestMs: BestMs; variants: Variants }
const BLANK_MEDALS: Medals = { 1: undefined, 2: undefined, 3: undefined, 4: undefined, 5: undefined };
const BLANK_VARIANTS: Variants = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

/**
 * `resumedPart`/`rememberPart` (resume.ts) only restore a real page reload
 * — by design, every other step's own "kept" state (free play's clock,
 * the ladder's items) works the same way. But the Copa's screen unmounts
 * and remounts every time the child leaves it for the Arcade and comes
 * back (CopaStep.tsx is a flow step, and PlaytestScreen keys every step
 * view by `visits.length`), with no reload in between — so a plain
 * in-memory module cache carries the medals, best times and variants
 * across those remounts too. PlaytestScreen.tsx clears it on a new session
 * (`resetCopaMemory`), the same way it resets every other per-session
 * module state (`forgetRealtimeIntros`, `setUnlocks(null)`, …).
 */
const COPA_KEY = 'camino.piloto.copa.v1';
interface CopaStore { sid: string; at: number; kept: CopaKept }

/** try/catch like every storage access in this app (resume.ts): a private window or blocked/full storage just loses the Copa's cross-reload memory, never throws. */
function loadCopaStore(sid: string | undefined): CopaKept | null {
  if (!sid) return null;
  try {
    const raw = localStorage.getItem(COPA_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as CopaStore;
    return o && o.sid === sid && o.kept ? o.kept : null;
  } catch { return null; }
}
function saveCopaStore(sid: string | undefined, kept: CopaKept): void {
  if (!sid) return;
  try { localStorage.setItem(COPA_KEY, JSON.stringify({ sid, at: Date.now(), kept } satisfies CopaStore)); } catch { /* lost on this reload only */ }
}

let copaMemory: CopaKept | null = null;
/** A new session (or a plain `newSession`): never inherit the last child's progress. */
export const resetCopaMemory = (): void => {
  copaMemory = null;
  try { localStorage.removeItem(COPA_KEY); } catch { /* nothing to clear */ }
};

/**
 * The in-memory cache (same tab, no reload in between) always wins once set
 * — it is strictly fresher than anything in storage. Only the very first
 * read of a mount (or a mount right after a reload) falls back to the
 * session-scoped store.
 */
function readKept(sessionId: string | undefined): CopaKept | null {
  if (copaMemory == null) copaMemory = loadCopaStore(sessionId);
  return copaMemory;
}

/** CopaStep.tsx: how many circuits already have a medal, across every Copa mount so far (a remount- and reload-safe `circuitsDone`, for the circuit-3 survey trigger). */
export function copaCircuitsDone(sessionId: string | undefined): number {
  const kept = readKept(sessionId);
  return kept ? (Object.values(kept.medals) as Medal[]).filter((m) => m != null).length : 0;
}

const CIRCUIT_PAIR: readonly [CritterId, CritterId] = ['coati', 'zorro']; // [silver, gold] — the fox is always gold
const SEED_OF: Record<CircuitId, number> = { 1: 101, 2: 202, 3: 303, 4: 404, 5: 505 };
const VIEW_W = 1200;

const CIRCUIT_GOAL: Record<CircuitId, string> = {
  1: 'Completá el camino',
  2: '¡Usá el turbo!',
  3: 'Cuidado con el charco',
  4: '¡Saltá el tronco!',
  5: 'Dale 3 vueltas',
};
const CIRCUIT_HINT: Record<CircuitId, string> = {
  1: 'Mirá bien el camino: ¿para dónde sigue?',
  2: 'Es un camino largo y derecho. El repetir te hace ir más rápido.',
  3: 'Si hay charco, hay que ir despacio.',
  4: 'Cuando aparece el tronco, hay que saltar.',
  5: 'Vueltas es la cantidad de veces que da la vuelta.',
};

type Phase = 'intro' | 'play' | 'result';

interface Facts { wrongAttempts: number; idleMs: number; usedReveal: boolean }
const newFacts = (): Facts => ({ wrongAttempts: 0, idleMs: 0, usedReveal: false });

/** The Copa activity: one circuit on screen, the result between them. Pure UI; all scoring lives in copa.ts. */
export function Copa({ initial = 1, logger, onCircuitDone, onExit, onPhase, barExtra, sessionId }: CopaProps) {
  const [kept] = useState(() => readKept(sessionId));
  const [id, setId] = useState<CircuitId>(kept?.id ?? initial);
  const [phase, setPhase] = useState<Phase>('intro');
  const [medals, setMedals] = useState<Medals>(kept?.medals ?? BLANK_MEDALS);
  const [bestMs, setBestMs] = useState<BestMs>(kept?.bestMs ?? {});
  const variantsRef = useRef<Variants>(kept?.variants ?? { ...BLANK_VARIANTS });
  const [variant, setVariant] = useState(variantsRef.current[kept?.id ?? initial]);
  const [result, setResult] = useState<CopaResult | null>(null);
  const [ranking, setRanking] = useState<readonly Racer[]>(['me', 0, 1]);
  const [lastConceptOk, setLastConceptOk] = useState(true);
  const factsRef = useRef(newFacts());
  const startedAt = useRef(Date.now());
  const log = (type: string, payload: Record<string, unknown>) => logger?.(type, payload);
  const keep = (next: CopaKept) => { copaMemory = next; saveCopaStore(sessionId, next); };

  const def = useMemo(() => generateCircuit(id, SEED_OF[id], variant), [id, variant]);

  useEffect(() => { onPhase?.(phase); }, [phase, onPhase]);

  function startCircuit(next: CircuitId, nextMedals: Medals = medals) {
    // a circuit already medalled (a revancha, or looping back from the Arcade) gets a different variant each time
    const v = nextMedals[next] != null ? variantsRef.current[next] + 1 : 0;
    variantsRef.current = { ...variantsRef.current, [next]: v };
    setId(next);
    setVariant(v);
    factsRef.current = newFacts();
    startedAt.current = Date.now();
    setPhase('play');
    log('copa_start', { circuit: next, variant: v });
    keep({ id: next, medals: nextMedals, bestMs, variants: variantsRef.current });
  }

  function finish(conceptOk: boolean, usedTurbo?: boolean) {
    const f = factsRef.current;
    f.idleMs = Date.now() - startedAt.current;
    const meMs = copaMeMs({ conceptOk, wrongAttempts: f.wrongAttempts });
    const rivalsMs = rivalsMsFor();
    const { place, marginMs } = copaPlacement(meMs, rivalsMs);
    const reason = copaReason(id, { conceptOk, wrongAttempts: f.wrongAttempts, idleMs: f.idleMs }, place);
    const r: CopaResult = { place, marginMs, timeMs: meMs, reason };
    const prevMedal = medals[id];
    const nextMedals: Medals = { ...medals, [id]: prevMedal == null || place < prevMedal ? place : prevMedal };
    const nextBestMs: BestMs = { ...bestMs, [id]: bestMs[id] == null || meMs < bestMs[id]! ? meMs : bestMs[id] };
    setResult(r);
    setRanking(honestRanking(meMs, rivalsMs));
    setLastConceptOk(conceptOk);
    setMedals(nextMedals);
    setBestMs(nextBestMs);
    setPhase('result');
    log('copa_end', {
      circuit: id, variant, place, margin_ms: marginMs, reason, time_ms: meMs, errors: f.wrongAttempts,
      help_level: helpLevel, ...(usedTurbo != null ? { used_turbo: usedTurbo } : {}), concept_ok: conceptOk,
    });
    keep({ id, medals: nextMedals, bestMs: nextBestMs, variants: variantsRef.current });
    onCircuitDone?.(id, r, nextMedals[id]);
  }

  const [helpLevel, setHelpLevel] = useState(0);
  const onHint = () => {
    setHelpLevel((h) => Math.min(2, h + 1));
    speak(CIRCUIT_HINT[id]);
  };

  // ---------------------------------------------------------------- the five bodies

  const goNext = () => { setHelpLevel(0); startCircuit(id === 5 ? 1 : ((id + 1) as CircuitId), medals); };
  const goRevancha = () => { log('copa_revancha', { circuit: id }); setHelpLevel(0); startCircuit(id, medals); };

  let body: ReactNode;
  if (phase === 'intro') {
    const played = (Object.values(medals) as Medal[]).some((m) => m != null);
    body = (
      <section className="copa-intro sheet" aria-label="Siguiente circuito">
        <h2 className="copa-goal">{CIRCUIT_GOAL[id]}</h2>
        <GhostHint def={def} />
        {played && <MedalStrip medals={medals} bestMs={bestMs} current={id} />}
        <button type="button" className="cut copa-start-btn" onClick={() => startCircuit(id)}>¡Arrancamos!</button>
      </section>
    );
  } else if (phase === 'play') {
    body = <CircuitPlay def={def} goal={CIRCUIT_GOAL[id]} factsRef={factsRef} helpLevel={helpLevel} onFinish={finish} />;
  } else if (result) {
    body = (
      <CopaResultScreen
        pair={CIRCUIT_PAIR} ranking={ranking} result={result} won={result.place === 1 && lastConceptOk} cups={0}
        onRevancha={goRevancha} onNext={goNext}
        extra={<MedalStrip medals={medals} bestMs={bestMs} current={id} />}
      />
    );
  }

  const instruction = (
    <span className="drawn-task" aria-hidden="true">
      <PlayerFace className="bar-face" />
      <ThenArrow />
      <FlagIcon size={42} />
    </span>
  );

  return (
    <main className={`pp-page pp-race copa-page${phase === 'result' ? ' is-podium' : ''}`} data-circuit={id} data-phase={phase}>
      {/* C04: 4to ignores the top bar — the goal lives large inside the play area instead (CircuitPlay's own PlayGoal) */}
      <Bar
        instruction={instruction}
        title={<><b>Copa de 4to</b>{` circuito ${id} de 5`}</>}
        pages={null}
        aside={barExtra}
        onSpeak={onHint}
        onHelp={onHint}
      />
      {onExit && (
        <button type="button" className="cut copa-exit-btn" onClick={onExit} aria-label="Salir">Salir</button>
      )}
      {body}
      {DEBUG && <DevHooks id={id} def={def} factsRef={factsRef} setHelpLevel={setHelpLevel} onFinish={finish} goCircuit={startCircuit} goRevancha={goRevancha} goNext={goNext} />}
    </main>
  );
}

// ------------------------------------------------------------------ the wordless format ghost (never the answer)

function GhostHint({ def }: { def: CircuitDef }) {
  if (def.kind === 'sequence' || def.kind === 'turbo') {
    return (
      <div className="copa-ghost" aria-hidden="true">
        <span className="copa-ghost-slot" />
        <span className="copa-ghost-q">?</span>
      </div>
    );
  }
  if (def.kind === 'laps') {
    return (
      <div className="copa-ghost copa-ghost-nums" aria-hidden="true">
        {[1, 2, 3].map((n) => <span key={n} className="copa-ghost-num">{n}</span>)}
      </div>
    );
  }
  return (
    <div className="copa-ghost copa-ghost-two" aria-hidden="true">
      <span className="copa-ghost-choice" /><span className="copa-ghost-choice" />
    </div>
  );
}

// ------------------------------------------------------------------ playing one circuit

const LABEL = 'word-picture' as const;

function CircuitPlay({ def, goal, factsRef, helpLevel, onFinish }: {
  def: CircuitDef; goal: string; factsRef: { current: Facts }; helpLevel: number;
  onFinish(conceptOk: boolean, usedTurbo?: boolean): void;
}) {
  if (def.kind === 'sequence') {
    const stretch: Stretch = { road: [...def.road], turbo: false };
    return (
      <OneStretchRace
        stretch={stretch} prefilledCount={def.emptySlot} allowTurbo={false} goal={goal} factsRef={factsRef} helpLevel={helpLevel}
        conceptOkFor={() => true} onFinish={onFinish}
      />
    );
  }
  if (def.kind === 'turbo') {
    const stretch: Stretch = { road: [...def.lead, ...Array<RoadDir>(def.turboLen).fill('right')], turbo: true };
    return (
      <OneStretchRace
        stretch={stretch} prefilledCount={def.lead.length} allowTurbo goal={goal} factsRef={factsRef} helpLevel={helpLevel}
        conceptOkFor={(usedTurbo) => checkSlotChoice(def, usedTurbo ? 'turbo' : 'single')} onFinish={onFinish}
      />
    );
  }
  if (def.kind === 'puddle') return <HazardRun kind="puddle" pieces={def.pieces} goal={goal} helpLevel={helpLevel} onFinish={onFinish} />;
  if (def.kind === 'event') return <HazardRun kind="event" pieces={def.pieces} goal={goal} helpLevel={helpLevel} onFinish={onFinish} />;
  return <LapsRun def={def} goal={goal} helpLevel={helpLevel} onFinish={onFinish} />;
}

/** C04: the circuit's goal, large inside the play area (4to ignores the top bar) — big while there's nothing else yet, a persistent but still large caption once the build panel/choices are showing. */
function PlayGoal({ goal, big }: { goal: string; big?: boolean }) {
  return <p className={`copa-goal-persist${big ? ' is-big' : ''}`}>{goal}</p>;
}

// ------------------------------------------------------------------ circuits 1 & 2: live, block-by-block (exactly like La carrera)

function OneStretchRace({ stretch, prefilledCount, allowTurbo, goal, factsRef, helpLevel, conceptOkFor, onFinish }: {
  stretch: Stretch; prefilledCount: number; allowTurbo: boolean; goal: string; factsRef: { current: Facts }; helpLevel: number;
  conceptOkFor(usedTurbo: boolean): boolean; onFinish(conceptOk: boolean, usedTurbo?: boolean): void;
}) {
  const course = useMemo(() => buildCourse([stretch]), [stretch]);
  const prefilled = useMemo(() => stretch.road.slice(0, prefilledCount).map((d) => arrowBlock(d)), [stretch, prefilledCount]);
  const startMe = useMemo(() => restingSpot(course, 0, prefilledCount), [course, prefilledCount]);
  const g = useRef({
    tape: prefilled, phase: 'input' as 'input' | 'zoom', me: startMe, meTarget: startMe,
    zoomTo: 0, zoomSpeed: ZOOM_SPEED, turboOn: false, ok: true, cam: 0, lastFrame: 0, startAt: Date.now(), finished: false,
  });
  const [tapeV, setTapeV] = useState(prefilled);
  const [wrong, setWrong] = useState(false);
  const [live, setLive] = useState({ me: startMe, r0: RIVAL_START[0], r1: RIVAL_START[1], cam: 0, turboOn: false });

  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const s = g.current;
      const dt = s.lastFrame ? Math.min(0.06, (t - s.lastFrame) / 1000) : 0;
      s.lastFrame = t;
      const elapsed = Date.now() - s.startAt;
      const [r0, r1] = rivalPositions(COPA_RIVALS, elapsed, course.finish);
      if (s.phase === 'zoom') {
        if (s.me < s.zoomTo) s.me = Math.min(s.zoomTo, s.me + s.zoomSpeed * dt);
        if (!s.finished && s.me >= course.finish) { s.finished = true; onFinish(s.ok, s.turboOn); }
      } else {
        s.me += (s.meTarget - s.me) * Math.min(1, dt * 7);
      }
      s.cam = nextCam(s.cam, s.me, VIEW_W, dt);
      setLive({ me: s.me, r0, r1, cam: s.cam, turboOn: s.turboOn && s.phase === 'zoom' });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course]);

  const place = (block: Block) => {
    const s = g.current;
    if (s.phase !== 'input') return;
    const r = judge(stretch.road, s.tape, block);
    if (r.verdict === 'full') return;
    if (r.verdict === 'wrong') {
      factsRef.current.wrongAttempts++;
      s.tape = r.tape; setTapeV(r.tape); setWrong(true);
      setTimeout(() => { s.tape = prefilled; setTapeV(prefilled); setWrong(false); }, 750);
      return;
    }
    s.tape = r.tape; setTapeV(r.tape);
    const filled = filledOf(r.tape);
    if (r.verdict === 'complete') {
      s.turboOn = block.t === 'loop';
      s.ok = conceptOkFor(s.turboOn);
      s.zoomTo = course.finish + PARK;
      s.zoomSpeed = s.turboOn ? TURBO_SPEED : ZOOM_SPEED;
      s.phase = 'zoom';
      return;
    }
    s.meTarget = Math.max(s.meTarget, restingSpot(course, 0, filled));
  };

  const repeat = allowTurbo ? repeatFor(stretch, tapeV) : null;
  return (
    <section className="copa-circuit">
      <section className="sheet copa-track-card">
        <RaceScene course={course} stretches={[stretch]} me={live.me} rivals={[live.r0, live.r1]} pair={CIRCUIT_PAIR} viewW={VIEW_W} cam={live.cam} turboOn={live.turboOn} />
      </section>
      <div className="copa-build-panel">
        <Palette label={LABEL} repeat={repeat} reserve={allowTurbo} disabled={wrong} onPlace={(b) => place(b)} />
        <Tape road={stretch.road} tape={tapeV} label={LABEL} wrong={wrong} turbo={stretch.turbo} active={!wrong} onTap={() => {}} />
      </div>
      <PlayGoal goal={goal} />
      {helpLevel >= 2 && <p className="copa-highlight" role="status">¡Ahí! Completá esa flecha.</p>}
    </section>
  );
}

// ------------------------------------------------------------------ circuits 3 & 4: pick the block, then ¡Correr! (the live consequence)

// The scripted circuits (3/4/5) have no live-building phase to naturally
// pace them against the honest rivals, so their cruise speed is calibrated
// against COPA_PACE (copa.ts), not race.ts's own ZOOM_SPEED (which is tuned
// for a short post-slot flourish, far faster than any honest rival) — a
// concept-right cruise clears gold (1.1 units/s, honestRace.ts) and a
// concept-wrong one does not, so the race on screen looks like the race the
// result screen reports, with the fox visibly close instead of lapped.
const CRUISE_OK = 1.5;
const CRUISE_BAD = 0.9;
const SPEED_SLOW = 0.5;
const SKID_PAUSE_MS = 650;

function HazardRun({ kind, pieces, goal, helpLevel, onFinish }: {
  kind: 'puddle' | 'event'; pieces: readonly string[]; goal: string; helpLevel: number; onFinish(conceptOk: boolean): void;
}) {
  const hazard = kind === 'puddle' ? 'puddle' : 'log';
  const stretch: Stretch = useMemo(() => ({ road: pieces.map(() => 'right' as const), turbo: false }), [pieces]);
  const course = useMemo(() => buildCourse([stretch]), [stretch]);
  const hazardAt = useMemo(() => pieces.reduce<number[]>((a, p, i) => (p === hazard ? [...a, course.starts[0] + i] : a), []), [pieces, hazard, course]);
  const [picked, setPicked] = useState<'right' | 'wrong' | null>(null);
  const [running, setRunning] = useState(false);
  const g = useRef({ me: START, cam: 0, lastFrame: 0, startAt: 0, finished: false, pauseUntil: 0, lastHazard: -1 });
  const [live, setLive] = useState({ me: START, r0: RIVAL_START[0], r1: RIVAL_START[1], cam: 0, jump: false, skid: false, fx: [] as SceneDust[] });

  useEffect(() => {
    if (!running) return;
    g.current.startAt = Date.now();
    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const s = g.current;
      const dt = s.lastFrame ? Math.min(0.06, (t - s.lastFrame) / 1000) : 0;
      s.lastFrame = t;
      const now = Date.now();
      const elapsed = now - s.startAt;
      const [r0, r1] = rivalPositions(COPA_RIVALS, elapsed, course.finish);
      let jump = false, skid = false;
      if (now >= s.pauseUntil) {
        const idx = Math.floor(s.me);
        const onHazard = hazardAt.includes(idx);
        let v = picked === 'right' ? CRUISE_OK : CRUISE_BAD;
        if (onHazard) {
          if (kind === 'puddle' && picked === 'right') v = SPEED_SLOW; // despacio en el charco
          if (picked === 'wrong' && s.lastHazard !== idx) { s.lastHazard = idx; s.pauseUntil = now + SKID_PAUSE_MS; skid = true; }
          else if (picked === 'right' && kind === 'event' && s.lastHazard !== idx) { s.lastHazard = idx; jump = true; }
        }
        s.me = Math.min(course.finish + PARK, s.me + v * dt);
      } else skid = kind === 'puddle';
      if (!s.finished && s.me >= course.finish) { s.finished = true; onFinish(picked === 'right'); }
      s.cam = nextCam(s.cam, s.me, VIEW_W, dt);
      setLive({ me: s.me, r0, r1, cam: s.cam, jump, skid, fx: [] });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const CHOICES = kind === 'puddle'
    ? [{ v: 'right' as const, label: 'Si hay charco: despacio', sub: 'Si no: acelerá' }, { v: 'wrong' as const, label: 'Si hay charco: acelerá', sub: 'Si no: despacio' }]
    : [{ v: 'right' as const, label: 'Al aparecer el tronco: saltar', sub: '' }, { v: 'wrong' as const, label: 'Al aparecer el tronco: nada', sub: '' }];

  return (
    <section className="copa-circuit">
      <section className="sheet copa-track-card">
        <RaceScene
          course={course} stretches={[stretch]} me={live.me} rivals={[live.r0, live.r1]} pair={CIRCUIT_PAIR} viewW={VIEW_W} cam={live.cam}
          meJump={live.jump} meSkid={live.skid} puddles={kind === 'puddle' ? hazardAt : undefined} logs={kind === 'event' ? hazardAt : undefined}
        />
      </section>
      {!running && (
        <div className="copa-choices">
          {CHOICES.map((c) => (
            <button key={c.v} type="button" className={`cut copa-choice-btn copa-if-btn${picked === c.v ? ' is-picked' : ''}`} onClick={() => setPicked(c.v)}>
              {kind === 'puddle' ? <PuddleIcon /> : <LogIcon />}
              <span className="copa-if-label">{c.label}{c.sub && <><br />{c.sub}</>}</span>
            </button>
          ))}
        </div>
      )}
      {!running && picked && (
        <button type="button" className="cut copa-run-btn" onClick={() => setRunning(true)}>¡Correr!</button>
      )}
      <PlayGoal goal={goal} big={!running} />
      {helpLevel >= 2 && !running && <p className="copa-highlight" role="status">{kind === 'puddle' ? 'Si hay charco, hay que ir despacio.' : 'Cuando aparece el tronco, hay que saltar.'}</p>}
    </section>
  );
}

// ------------------------------------------------------------------ circuit 5: laps

function LapsRun({ def, goal, helpLevel, onFinish }: {
  def: Extract<CircuitDef, { kind: 'laps' }>; goal: string; helpLevel: number; onFinish(conceptOk: boolean): void;
}) {
  const stretches = useMemo(() => Array.from({ length: def.correctLaps }, () => ({ road: [...def.lapRoad], turbo: false }) as Stretch), [def]);
  const course = useMemo(() => buildCourse(stretches), [stretches]);
  const [picked, setPicked] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const g = useRef({ me: START, cam: 0, lastFrame: 0, startAt: 0, finished: false, pausedOnce: false, pauseUntil: 0 });
  const [live, setLive] = useState({ me: START, r0: RIVAL_START[0], r1: RIVAL_START[1], cam: 0, lap: 1 });
  const wrong = picked != null && !checkSlotChoice(def, picked);

  useEffect(() => {
    if (!running) return;
    g.current.startAt = Date.now();
    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const s = g.current;
      const dt = s.lastFrame ? Math.min(0.06, (t - s.lastFrame) / 1000) : 0;
      s.lastFrame = t;
      const now = Date.now();
      const elapsed = now - s.startAt;
      const [r0, r1] = rivalPositions(COPA_RIVALS, elapsed, course.finish);
      if (wrong && !s.pausedOnce) { s.pausedOnce = true; s.pauseUntil = now + 900; }
      if (now >= s.pauseUntil) s.me = Math.min(course.finish + PARK, s.me + (wrong ? CRUISE_BAD : CRUISE_OK) * dt);
      if (!s.finished && s.me >= course.finish) { s.finished = true; onFinish(picked === def.correctLaps); }
      s.cam = nextCam(s.cam, s.me, VIEW_W, dt);
      const lap = Math.min(def.correctLaps, 1 + Math.floor((s.me - START) / (def.lapRoad.length + 1)));
      setLive({ me: s.me, r0, r1, cam: s.cam, lap });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return (
    <section className="copa-circuit">
      <section className="sheet copa-track-card">
        <RaceScene course={course} stretches={stretches} me={live.me} rivals={[live.r0, live.r1]} pair={CIRCUIT_PAIR} viewW={VIEW_W} cam={live.cam} />
        {running && <p className="copa-lap-counter">Vuelta {live.lap} de {def.correctLaps}</p>}
      </section>
      {!running && (
        <>
          <p className="copa-lap-label">repetir ( <b className="copa-lap-blank">{picked ?? '?'}</b> ) vueltas</p>
          <div className="copa-choices">
            {def.options.map((n) => <button key={n} type="button" className={`cut copa-choice-btn copa-laps-btn${picked === n ? ' is-picked' : ''}`} onClick={() => setPicked(n)}>{n}</button>)}
          </div>
          {picked != null && <button type="button" className="cut copa-run-btn" onClick={() => setRunning(true)}>¡Correr!</button>}
        </>
      )}
      <PlayGoal goal={goal} big={!running} />
      {helpLevel >= 2 && !running && <p className="copa-highlight" role="status">Contá: 1, 2, 3 vueltas.</p>}
    </section>
  );
}

function PuddleIcon() {
  return (
    <svg viewBox="0 0 60 36" width={56} height={34} aria-hidden="true">
      <ellipse cx={30} cy={22} rx={26} ry={10} fill="#5fa8d3" stroke="#2b2622" strokeWidth={2} />
      <ellipse cx={22} cy={18} rx={6} ry={3} fill="#a9d6ef" opacity={0.8} />
    </svg>
  );
}
function LogIcon() {
  return (
    <svg viewBox="0 0 60 36" width={56} height={34} aria-hidden="true">
      <rect x={6} y={12} width={48} height={16} rx={8} fill="#8a5a33" stroke="#2b2622" strokeWidth={2} />
      <circle cx={10} cy={20} r={7} fill="#c69765" stroke="#2b2622" strokeWidth={2} />
      <circle cx={50} cy={20} r={7} fill="#c69765" stroke="#2b2622" strokeWidth={2} />
    </svg>
  );
}

// ------------------------------------------------------------------ the result screen

function CopaResultScreen({ pair, ranking, result, won, cups, onRevancha, onNext, extra }: {
  pair: readonly [CritterId, CritterId]; ranking: readonly Racer[]; result: CopaResult; won: boolean; cups: number;
  onRevancha(): void; onNext(): void; extra?: ReactNode;
}) {
  const [fresh, setFresh] = useState(!won);
  useEffect(() => { if (!won) return; const t = setTimeout(() => setFresh(true), REDUCED ? 0 : 1700); return () => clearTimeout(t); }, [won]);
  const SLOT: Record<1 | 2 | 3, { x: number; y: number; scale: number }> = {
    1: { x: 402, y: 140, scale: 1 }, 2: { x: 232, y: 200, scale: 0.9 }, 3: { x: 582, y: 230, scale: 0.85 },
  };
  const placeOf = (r: Racer) => (ranking.indexOf(r) + 1) as 1 | 2 | 3;
  const line = resultLineFor(result);
  useEffect(() => { speak(line); }, [line]);
  return (
    <section className="sheet rc-podium rc-honest-podium copa-result" aria-label="El resultado" data-place={result.place}>
      <svg className="rc-podium-scene" viewBox="100 -60 640 380" role="img" aria-label={line}>
        <PodiumSteps />
        {([0, 1] as const).map((r) => {
          const place = placeOf(r);
          const { x, y, scale } = SLOT[place];
          return (
            <g key={r} transform={`translate(${x} ${y})`}>
              <g className={`rc-podium-critter${place === 3 ? ' is-late' : ''}`}><g transform={`scale(${scale})`}><CritterArt id={pair[r]} bare /></g></g>
            </g>
          );
        })}
        {(() => { const { x, y } = SLOT[placeOf('me')]; return <PodiumMe x={x} y={y} win={result.place === 1} />; })()}
        <g transform="translate(478 140)" className="rc-podium-cup"><Cup seed={2} /></g>
      </svg>
      <p className="rc-honest-line">{line}</p>
      <div className="rc-shelf-box">
        <Shelf cups={fresh ? cups + 1 : cups} fresh={fresh && won} />
        {extra}
      </div>
      <div className="rc-honest-buttons">
        <button type="button" className="cut rc-again rc-revancha" onClick={onRevancha}>
          <span className="rc-revancha-flip"><AgainArt /></span>
          <span className="rc-again-word" aria-hidden="true">¡Revancha!</span>
        </button>
        <button type="button" className="cut rc-again" onClick={onNext}>
          <FlagIcon size={40} />
          <span className="rc-again-word" aria-hidden="true">¡Siguiente circuito!</span>
        </button>
      </div>
    </section>
  );
}

const REASON_WORD: Record<string, string> = {
  no_turbo: 'El zorro usó turbo en la recta.', crashes: 'Te chocaste con un arbusto.', skid: 'Patinaste en el charco.',
  log_hit: 'Te chocaste con el tronco.', wrong_laps: 'Dieron mal las vueltas.', slow_idle: 'Te quedaste pensando mucho rato.', fast_and_clean: '',
};
const PLACE_WORD: Record<1 | 2 | 3, string> = { 1: '1ro', 2: '2do', 3: '3ro' };
function resultLineFor(r: CopaResult): string {
  const s = Math.round(r.marginMs / 1000);
  if (r.place === 1) return `¡1ro por ${s} s!`;
  return `${PLACE_WORD[r.place]} — te faltaron ${s} s. ${REASON_WORD[r.reason]}`.trim();
}

// ------------------------------------------------------------------ the medal strip

/** "Tus medallas de la Copa" — C04: also "Tu mejor tiempo" (the Arcade card's own promise) when a circuit has a best time. */
function MedalStrip({ medals, bestMs, current }: { medals: Medals; bestMs?: BestMs; current: CircuitId }) {
  return (
    <div className="copa-strip" role="img" aria-label="Tus medallas de la Copa">
      {([1, 2, 3, 4, 5] as const).map((cid) => {
        const m = medals[cid];
        const ms = bestMs?.[cid];
        const title = `${m ? medalLabel[m] : 'sin jugar'}${ms != null ? ` — ${(ms / 1000).toFixed(1)} s` : ''}`;
        return (
          <span key={cid} className={`copa-strip-dot${cid === current ? ' is-current' : ''}${m ? ` is-medal-${m}` : ''}`} title={title}>
            {cid}
            {ms != null && <small className="copa-strip-ms">{(ms / 1000).toFixed(1)}s</small>}
          </span>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ dev hooks (?debug): screenshots and checks

function DevHooks({ id, def, factsRef, setHelpLevel, onFinish, goCircuit, goRevancha, goNext }: {
  id: CircuitId; def: CircuitDef; factsRef: { current: Facts }; setHelpLevel(n: number): void;
  onFinish(ok: boolean, usedTurbo?: boolean): void; goCircuit(id: CircuitId): void; goRevancha(): void; goNext(): void;
}) {
  useEffect(() => {
    (window as unknown as { __copa: unknown }).__copa = {
      state: () => ({ id, kind: def.kind, def, wrongAttempts: factsRef.current.wrongAttempts }),
      goCircuit, revancha: goRevancha, next: goNext,
      /** Skips straight to the result (the "adult skip"): never counts as concept_ok, whatever the circuit. */
      skip: () => { factsRef.current.usedReveal = true; onFinish(false); },
      win: () => onFinish(true, true),
      lose: () => onFinish(false, false),
      help: () => setHelpLevel(2),
      /** Picks a hazard/laps circuit's choice and presses ¡Correr! (circuits 3/4/5 only; a click on the real DOM button is simpler for 1/2). */
      pickAndRun: (v: string | number) => {
        const btns = Array.from(document.querySelectorAll<HTMLButtonElement>('.copa-choice-btn'));
        const idx = typeof v === 'number' ? def.kind === 'laps' ? def.options.indexOf(v) : -1 : v === 'right' ? 0 : 1;
        btns[idx]?.click();
        setTimeout(() => document.querySelector<HTMLButtonElement>('.copa-run-btn')?.click(), 50);
      },
    };
    return () => { delete (window as unknown as { __copa?: unknown }).__copa; };
  });
  return null;
}
