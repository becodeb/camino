// Copa de 4to (C03): the screen. Five circuits, each one concept and one
// empty slot (the rest of the program already in place — never a blank
// tape), raced against two fixed-pace rivals (honestRace.ts: silver and
// gold, the fox always gold). Reuses race.ts's own Stretch/judge/Palette/
// Tape for circuits 1 (sequence), 2 (turbo) and the podium art for every
// circuit's result; circuits 3 (puddle) and 4 (log event) are a simpler
// two-button choice (no text reading beyond one big label), and 5 (laps) a
// row of number buttons for `vueltas`. Not wired into the 4to route yet
// (C04): `Copa` takes its own props so it can be driven standalone (and
// screenshotted via the dev-only `?debug#/copa-dev` entry below).
//
// Logged by the caller's `logger` prop: `copa_start`, `copa_end`,
// `copa_revancha` (docs/prueba-piloto-datos.md).

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CritterId } from '../curriculum/motivation';
import { speak } from '../ui/speech';
import { REDUCED } from '../ui/runtime';
import { CritterArt } from '../ui/critterArt';
import { DEBUG } from '../screens/levelKit';
import {
  checkSlotChoice, copaMeMs, copaReason, copaPlacement, generateCircuit, medalLabel, rivalsMsFor,
  type CircuitDef, type CircuitId, type CopaResult, type Medal,
} from './copa';
import { honestRanking, type Racer } from './honestRace';
import { arrowBlock, filledOf, judge, repeatFor, type Block, type RoadDir, type Stretch } from './race';
import { AgainArt, Cup, FlagIcon, MiniRoad, PodiumSteps, Shelf } from './raceArt';
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

  return (
    <main className={`pp-page pp-race copa-page${phase === 'result' ? ' is-podium' : ''}`} data-circuit={id} data-phase={phase}>
      <header className="bar copa-bar">
        <span className="copa-bar-title"><b>Copa de 4to</b> {`circuito ${id} de 5`}</span>
        <span className="copa-bar-actions">
          {phase === 'play' && <button type="button" className="cut copa-hint-btn" onClick={onHint} aria-label="Pista">🔊 Pista</button>}
          {onExit && <button type="button" className="cut copa-exit-btn" onClick={onExit} aria-label="Salir">Salir</button>}
        </span>
      </header>
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
  if (def.kind === 'sequence') return <SequencePlay def={def} factsRef={factsRef} helpLevel={helpLevel} onFinish={onFinish} />;
  if (def.kind === 'turbo') return <TurboPlay def={def} factsRef={factsRef} helpLevel={helpLevel} onFinish={onFinish} />;
  if (def.kind === 'puddle') return <HazardPlay kind="puddle" pieces={def.pieces} slotIndex={def.slotIndex} factsRef={factsRef} helpLevel={helpLevel} onFinish={onFinish} />;
  if (def.kind === 'event') return <HazardPlay kind="event" pieces={def.pieces} slotIndex={def.slotIndex} factsRef={factsRef} helpLevel={helpLevel} onFinish={onFinish} />;
  return <LapsPlay def={def} factsRef={factsRef} helpLevel={helpLevel} onFinish={onFinish} />;
}

function SequencePlay({ def, factsRef, helpLevel, onFinish }: {
  def: Extract<CircuitDef, { kind: 'sequence' }>; factsRef: { current: Facts }; helpLevel: number; onFinish(ok: boolean): void;
}) {
  const prefilled = useMemo(() => def.road.slice(0, def.emptySlot).map((d) => arrowBlock(d)), [def]);
  const [tape, setTape] = useState(prefilled);
  const [wrong, setWrong] = useState(false);
  const stretch: Stretch = { road: [...def.road], turbo: false };
  const place = (b: Block) => {
    const r = judge(stretch.road, tape, b);
    if (r.verdict === 'wrong') {
      factsRef.current.wrongAttempts++;
      setTape(r.tape);
      setWrong(true);
      setTimeout(() => { setTape(prefilled); setWrong(false); }, 750);
      return;
    }
    setTape(r.tape);
    if (r.verdict === 'complete') onFinish(checkSlotChoice(def, (b as { cmd: RoadDir }).cmd));
  };
  const h0 = Math.round(0);
  return (
    <section className="copa-circuit">
      <section className="sheet copa-road">
        <MiniRoad road={def.road} turbo={false} h0={h0} covered={wrong ? filledOf(tape) - 1 : filledOf(tape)} next={filledOf(tape) < def.road.length ? filledOf(tape) : null} colors={{ right: '#6aa84f', up: '#3d85c6', down: '#cc4125' } as Record<RoadDir, string>} />
        <Tape road={def.road} tape={tape} label={LABEL} wrong={wrong} turbo={false} active={!wrong} onTap={() => {}} />
      </section>
      <Palette label={LABEL} repeat={null} reserve={false} disabled={wrong} onPlace={(b) => place(b)} />
      {helpLevel >= 2 && <p className="copa-highlight" role="status">👉 ¡Ahí! Completá esa flecha.</p>}
    </section>
  );
}

function TurboPlay({ def, factsRef, helpLevel, onFinish }: {
  def: Extract<CircuitDef, { kind: 'turbo' }>; factsRef: { current: Facts }; helpLevel: number; onFinish(ok: boolean, usedTurbo: boolean): void;
}) {
  const road = useMemo(() => [...def.lead, ...Array<RoadDir>(def.turboLen).fill('right')], [def]);
  const prefilled = useMemo(() => def.lead.map((d) => arrowBlock(d)), [def]);
  const [tape, setTape] = useState(prefilled);
  const [wrong, setWrong] = useState(false);
  const [usedTurbo, setUsedTurbo] = useState(false);
  const stretch: Stretch = { road, turbo: true };
  const repeat = repeatFor(stretch, tape);
  const place = (b: Block) => {
    const r = judge(stretch.road, tape, b);
    if (r.verdict === 'wrong') {
      factsRef.current.wrongAttempts++;
      setTape(r.tape);
      setWrong(true);
      setTimeout(() => { setTape(prefilled); setWrong(false); }, 750);
      return;
    }
    const turboNow = usedTurbo || b.t === 'loop';
    setUsedTurbo(turboNow);
    setTape(r.tape);
    if (r.verdict === 'complete') onFinish(checkSlotChoice(def, turboNow ? 'turbo' : 'single'), turboNow);
  };
  return (
    <section className="copa-circuit has-turbo">
      <section className="sheet copa-road">
        <MiniRoad road={road} turbo covered={wrong ? filledOf(tape) - 1 : filledOf(tape)} h0={0} next={filledOf(tape) < road.length ? filledOf(tape) : null} colors={{ right: '#6aa84f', up: '#3d85c6', down: '#cc4125' } as Record<RoadDir, string>} />
        <Tape road={road} tape={tape} label={LABEL} wrong={wrong} turbo active={!wrong} onTap={() => {}} />
      </section>
      <Palette label={LABEL} repeat={repeat} reserve disabled={wrong} onPlace={(b) => place(b)} />
      {helpLevel >= 2 && <p className="copa-highlight" role="status">👉 ¡Repetir es turbo!</p>}
    </section>
  );
}

function HazardPlay({ kind, pieces, slotIndex, factsRef, helpLevel, onFinish }: {
  kind: 'puddle' | 'event'; pieces: readonly string[]; slotIndex: number; factsRef: { current: Facts }; helpLevel: number; onFinish(ok: boolean): void;
}) {
  const [shake, setShake] = useState(false);
  const correct = kind === 'puddle' ? 'slow' : 'jump';
  const CHOICES = kind === 'puddle' ? [{ v: 'slow', label: 'Despacio' }, { v: 'fast', label: 'Acelerá' }] : [{ v: 'jump', label: '¡Saltar!' }, { v: 'none', label: 'Nada' }];
  const choose = (v: string) => {
    if (v === correct) { onFinish(true); return; }
    factsRef.current.wrongAttempts++;
    setShake(true);
    setTimeout(() => setShake(false), 650);
  };
  return (
    <section className="copa-circuit copa-hazard">
      <div className="copa-pieces" role="img" aria-label={kind === 'puddle' ? 'El camino con un charco' : 'El camino con un tronco'}>
        {pieces.map((p, i) => (
          <span key={i} className={`copa-piece copa-piece-${p}${i === slotIndex ? ' is-slot' : ''}${i === slotIndex && shake ? ' is-shake' : ''}`}>
            {p === 'puddle' && <PuddleIcon />}
            {p === 'log' && <LogIcon />}
            {i !== slotIndex && (p === 'puddle' || p === 'log') && <span className="copa-piece-ok" aria-hidden="true">✓</span>}
            {i === slotIndex && <span className="copa-piece-slot-mark" aria-hidden="true">?</span>}
          </span>
        ))}
      </div>
      <div className="copa-choices">
        {CHOICES.map((c) => <button key={c.v} type="button" className="cut copa-choice-btn" onClick={() => choose(c.v)}>{c.label}</button>)}
      </div>
      {helpLevel >= 2 && <p className="copa-highlight" role="status">👉 Mirá el {kind === 'puddle' ? 'charco' : 'tronco'} marcado con el ?.</p>}
    </section>
  );
}

function LapsPlay({ def, factsRef, helpLevel, onFinish }: {
  def: Extract<CircuitDef, { kind: 'laps' }>; factsRef: { current: Facts }; helpLevel: number; onFinish(ok: boolean): void;
}) {
  const choose = (n: number) => {
    if (checkSlotChoice(def, n)) { onFinish(true); return; }
    factsRef.current.wrongAttempts++;
  };
  return (
    <section className="copa-circuit copa-laps">
      <section className="sheet copa-road">
        <MiniRoad road={def.lapRoad} turbo={false} h0={0} covered={def.lapRoad.length} next={null} colors={{ right: '#6aa84f', up: '#3d85c6', down: '#cc4125' } as Record<RoadDir, string>} />
        <p className="copa-lap-label">repetir ( <b className="copa-lap-blank">?</b> ) vueltas</p>
      </section>
      <div className="copa-choices">
        {def.options.map((n) => <button key={n} type="button" className="cut copa-choice-btn copa-laps-btn" onClick={() => choose(n)}>{n}</button>)}
      </div>
      {helpLevel >= 2 && <p className="copa-highlight" role="status">👉 Contá: 1, 2, 3 vueltas.</p>}
    </section>
  );
}

function PuddleIcon() {
  return (
    <svg viewBox="0 0 60 36" width={78} height={48} aria-hidden="true">
      <ellipse cx={30} cy={22} rx={26} ry={10} fill="#5fa8d3" stroke="#2b2622" strokeWidth={2} />
      <ellipse cx={22} cy={18} rx={6} ry={3} fill="#a9d6ef" opacity={0.8} />
    </svg>
  );
}
function LogIcon() {
  return (
    <svg viewBox="0 0 60 36" width={78} height={48} aria-hidden="true">
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
    };
    return () => { delete (window as unknown as { __copa?: unknown }).__copa; };
  });
  return null;
}
