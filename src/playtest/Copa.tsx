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
export function Copa({ initial = 1, logger, onCircuitDone, onExit }: CopaProps) {
  const [id, setId] = useState<CircuitId>(initial);
  const [phase, setPhase] = useState<Phase>('intro');
  const [medals, setMedals] = useState<Record<CircuitId, Medal>>({ 1: undefined, 2: undefined, 3: undefined, 4: undefined, 5: undefined });
  const [result, setResult] = useState<CopaResult | null>(null);
  const [ranking, setRanking] = useState<readonly Racer[]>(['me', 0, 1]);
  const [lastConceptOk, setLastConceptOk] = useState(true);
  const factsRef = useRef(newFacts());
  const startedAt = useRef(Date.now());
  const log = (type: string, payload: Record<string, unknown>) => logger?.(type, payload);

  const def = useMemo(() => generateCircuit(id, SEED_OF[id], 0), [id]);

  function startCircuit(next: CircuitId) {
    setId(next);
    factsRef.current = newFacts();
    startedAt.current = Date.now();
    setPhase('play');
    log('copa_start', { circuit: next, variant: 0 });
  }

  function finish(conceptOk: boolean, usedTurbo?: boolean) {
    const f = factsRef.current;
    f.idleMs = Date.now() - startedAt.current;
    const meMs = copaMeMs({ conceptOk, wrongAttempts: f.wrongAttempts });
    const rivalsMs = rivalsMsFor();
    const { place, marginMs } = copaPlacement(meMs, rivalsMs);
    const reason = copaReason(id, { conceptOk, wrongAttempts: f.wrongAttempts, idleMs: f.idleMs }, place);
    const r: CopaResult = { place, marginMs, timeMs: meMs, reason };
    setResult(r);
    setRanking(honestRanking(meMs, rivalsMs));
    setLastConceptOk(conceptOk);
    setMedals((m) => ({ ...m, [id]: m[id] == null || place < m[id]! ? place : m[id] }));
    setPhase('result');
    log('copa_end', {
      circuit: id, variant: 0, place, margin_ms: marginMs, reason, time_ms: meMs, errors: f.wrongAttempts,
      help_level: helpLevel, ...(usedTurbo != null ? { used_turbo: usedTurbo } : {}), concept_ok: conceptOk,
    });
    onCircuitDone?.(id, r, place < (medals[id] ?? 4) ? place : medals[id]);
  }

  const [helpLevel, setHelpLevel] = useState(0);
  const onHint = () => {
    setHelpLevel((h) => Math.min(2, h + 1));
    speak(CIRCUIT_HINT[id]);
  };

  // ---------------------------------------------------------------- the five bodies

  const goNext = () => { setHelpLevel(0); startCircuit(id === 5 ? 1 : ((id + 1) as CircuitId)); };
  const goRevancha = () => { log('copa_revancha', { circuit: id }); setHelpLevel(0); startCircuit(id); };

  let body: ReactNode;
  if (phase === 'intro') {
    body = (
      <section className="copa-intro sheet" aria-label="Siguiente circuito">
        <h2 className="copa-goal">{CIRCUIT_GOAL[id]}</h2>
        <GhostHint def={def} />
        <button type="button" className="cut copa-start-btn" onClick={() => startCircuit(id)}>¡Arrancamos!</button>
      </section>
    );
  } else if (phase === 'play') {
    body = <CircuitPlay def={def} factsRef={factsRef} helpLevel={helpLevel} onFinish={finish} />;
  } else if (result) {
    body = (
      <CopaResultScreen
        pair={CIRCUIT_PAIR} ranking={ranking} result={result} won={result.place === 1 && lastConceptOk} cups={0}
        onRevancha={goRevancha} onNext={goNext}
        extra={<MedalStrip medals={medals} current={id} />}
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
      <Bar
        instruction={instruction}
        title={<><b>Copa de 4to</b>{` circuito ${id} de 5`}</>}
        pages={phase === 'play' ? <p className="copa-reminder">{CIRCUIT_GOAL[id]}</p> : null}
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

function CircuitPlay({ def, factsRef, helpLevel, onFinish }: {
  def: CircuitDef; factsRef: { current: Facts }; helpLevel: number;
  onFinish(conceptOk: boolean, usedTurbo?: boolean): void;
}) {
  if (def.kind === 'sequence') {
    const stretch: Stretch = { road: [...def.road], turbo: false };
    return (
      <OneStretchRace
        stretch={stretch} prefilledCount={def.emptySlot} allowTurbo={false} factsRef={factsRef} helpLevel={helpLevel}
        conceptOkFor={() => true} onFinish={onFinish}
      />
    );
  }
  if (def.kind === 'turbo') {
    const stretch: Stretch = { road: [...def.lead, ...Array<RoadDir>(def.turboLen).fill('right')], turbo: true };
    return (
      <OneStretchRace
        stretch={stretch} prefilledCount={def.lead.length} allowTurbo factsRef={factsRef} helpLevel={helpLevel}
        conceptOkFor={(usedTurbo) => checkSlotChoice(def, usedTurbo ? 'turbo' : 'single')} onFinish={onFinish}
      />
    );
  }
  if (def.kind === 'puddle') return <HazardRun kind="puddle" pieces={def.pieces} helpLevel={helpLevel} onFinish={onFinish} />;
  if (def.kind === 'event') return <HazardRun kind="event" pieces={def.pieces} helpLevel={helpLevel} onFinish={onFinish} />;
  return <LapsRun def={def} helpLevel={helpLevel} onFinish={onFinish} />;
}

// ------------------------------------------------------------------ circuits 1 & 2: live, block-by-block (exactly like La carrera)

function OneStretchRace({ stretch, prefilledCount, allowTurbo, factsRef, helpLevel, conceptOkFor, onFinish }: {
  stretch: Stretch; prefilledCount: number; allowTurbo: boolean; factsRef: { current: Facts }; helpLevel: number;
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

function HazardRun({ kind, pieces, helpLevel, onFinish }: {
  kind: 'puddle' | 'event'; pieces: readonly string[]; helpLevel: number; onFinish(conceptOk: boolean): void;
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
      {helpLevel >= 2 && !running && <p className="copa-highlight" role="status">{kind === 'puddle' ? 'Si hay charco, hay que ir despacio.' : 'Cuando aparece el tronco, hay que saltar.'}</p>}
    </section>
  );
}

// ------------------------------------------------------------------ circuit 5: laps

function LapsRun({ def, helpLevel, onFinish }: {
  def: Extract<CircuitDef, { kind: 'laps' }>; helpLevel: number; onFinish(conceptOk: boolean): void;
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

function MedalStrip({ medals, current }: { medals: Record<CircuitId, Medal>; current: CircuitId }) {
  return (
    <div className="copa-strip" role="img" aria-label="Tus medallas de la Copa">
      {([1, 2, 3, 4, 5] as const).map((cid) => {
        const m = medals[cid];
        return (
          <span key={cid} className={`copa-strip-dot${cid === current ? ' is-current' : ''}${m ? ` is-medal-${m}` : ''}`} title={m ? medalLabel[m] : 'sin jugar'}>
            {cid}
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
