// Copa v2: the GARAGE and the race screen (C09). One track at a time; the 5-copa
// flow around it is C10. See odd/tasks/copa-4to.md, "Design v2":
//
//   You are the engineer, not the driver. The garage has no clock: the track is
//   on top (the kart and the rivals parked at the line, revving), the program
//   is below, and ¡Largar! runs it. A crash sends the child back to the garage
//   with the program intact and the failing block marked red; "Ver paso a
//   paso" replays the last run one block at a time. A finish ends in the result:
//   the place against the rival tier, by how much, and why.
//
// The engine (simulate, tracks, rivals, hints) is copa2/*; the editor's rules
// (caret, memory, nesting) are editor.ts; this file is the screen.

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { speak } from '../../ui/speech';
import { CritterArt } from '../../ui/critterArt';
import { playGhost, type GhostRun } from '../../ui/ghost';
import { NAME } from '../Race';
import { allBlocks, slotCount, type BlockKind, type Program, type Sensor } from './program';
import { simulate, type SimResult } from './sim';
import { PALETTES, rivalTargets, type Tier, type TrackSpec } from './tracks';
import { RIVAL_ANIMAL, raceField, raceResult, type RaceResult } from './rivals';
import { nextBlockHint, type Position } from './hints';
import {
  addBlock, addEventScript, ancestorsOf, blockById, bumpNumber, hasEdits, listAt, locate, moveSelected, newEditor, removeSelected,
  sameSlot, selectBlock, setCaret, setLaps, takeEdits, toggleSensor, type Caret, type EditorState, type Rules,
} from './editor';
import { stateAt, stateAtStep, stepsOf, type SceneState } from './playback';
import { CRASH_TEXT, STUCK_TEXT, TIMEOUT_TEXT, BLOCK_LABEL, aAnimal, seconds } from './labels';
import { BlockIcon } from './blockArt';
import { MemoryMeter, NO_LIVE, ProgramPanel, type Live } from './ProgramPanel';
import { CAM_MIN, COAST_U, PARK_U, RUN_W, Scene, camFor, courseFor, maybePuddles, previewWidth, uOfPos, type KartLook } from './Scene';
import { GarageResult } from './GarageResult';
import '../playtest.css';
import '../race.css';
import './garage.css';

export interface GarageResultPayload {
  trackId: string;
  rival: Tier;
  won: boolean;
  place: 1 | 2 | 3;
  result: RaceResult;
  program: Program;
  timeMs: number;
  /** Runs made on this track so far (revanchas included). */
  runs: number;
  slots: number;
  used: number;
}

export interface GarageProps {
  track: TrackSpec;
  /** The rival to beat: its target time is the goal (the other animal on the track is its neighbour tier). */
  rivalTier: Tier;
  /** The program so far (it grows across the whole Copa). */
  initialProgram?: Program;
  /** Show the ghost hand with the next block only (after two failures on the track). */
  ghostHint?: boolean;
  onResult(r: GarageResultPayload): void;
  /** Told after every edit, so the flow can keep the program across tracks and reloads. */
  onProgramChange?(p: Program): void;
  logger?(type: string, payload: Record<string, unknown>): void;
  /** Seed of each run (default: a fresh random one). Tests and screenshots pin it. */
  seedFor?(runNumber: number): number;
  /** The race clock's speed over the engine's (default 1.4). Screenshots slow it to catch a moment. */
  raceSpeed?: number;
}

type Phase = 'garage' | 'run' | 'step' | 'result';

/** The race plays this much faster than the engine's clock (rivals too). */
const RACE_SPEED = 1.4;
const ZOOM_MS = 700;
const FINISH_HOLD_MS = 1900;
const CRASH_HOLD_MS = 2200;
const STEP_MS = 800;

interface Run { sim: SimResult; program: Program; seed: number; result: RaceResult | null; n: number }

interface Notice {
  kind: 'crash' | 'stuck' | 'timeout';
  text: string;
  blockId?: string;
  /** The block (crash) or the whole program (stuck) as it was: the notice goes away when it is edited. */
  sig: string;
}

const ORDER: readonly BlockKind[] = ['forward', 'up', 'down', 'jump', 'turbo', 'brake', 'wait', 'repeat', 'if', 'nitro'];
const ease = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

const fullMessage = (copa: number) => (copa >= 2 ? 'No entra. ¿Hay algo que se repite?' : 'No entra. Probá sacar algún bloque.');

function noticeApplies(n: Notice | null, program: Program): boolean {
  if (!n) return false;
  if (n.kind === 'crash') {
    const b = n.blockId ? (program.onLog?.id === n.blockId ? { hat: true } : blockById(program, n.blockId)) : null;
    return !!b && JSON.stringify(b) === n.sig;
  }
  return JSON.stringify(program) === n.sig;
}

export function Garage({ track, rivalTier, initialProgram, ghostHint = false, onResult, onProgramChange, logger, seedFor, raceSpeed = RACE_SPEED }: GarageProps) {
  const rules = useMemo<Rules>(() => ({ palette: PALETTES[track.copa], slots: track.slots }), [track]);
  const [ed, setEdState] = useState(() => newEditor(initialProgram));
  const edRef = useRef(ed);
  const setEd = useCallback((next: EditorState | ((s: EditorState) => EditorState)) => {
    const v = typeof next === 'function' ? next(edRef.current) : next;
    edRef.current = v;
    setEdState(v);
  }, []);

  const [phase, setPhase] = useState<Phase>('garage');
  const [run, setRun] = useState<Run | null>(null);
  const [last, setLast] = useState<Run | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [clock, setClock] = useState(0);
  const [step, setStep] = useState<{ i: number; since: number }>({ i: -1, since: 0 });
  const [auto, setAuto] = useState(false);
  const [drag, setDrag] = useState<{ kind: BlockKind; x: number; y: number } | null>(null);
  const runCount = useRef(0);
  const page = useRef<HTMLElement>(null);
  const log = useCallback((type: string, payload: Record<string, unknown>) => logger?.(type, { track: track.id, ...payload }), [logger, track.id]);

  // ---------------------------------------------------------------- the track

  const { course, road, total } = useMemo(() => courseFor(track, track.laps), [track]);
  const lapTiles = track.tiles.length;
  const field = raceField(rivalTier);
  const pair = [RIVAL_ANIMAL[field[0]], RIVAL_ANIMAL[field[1]]] as const;
  const targets = useMemo(() => rivalTargets(track), [track]);
  const rivalName = NAME[RIVAL_ANIMAL[rivalTier]];
  const movingPuddles = !('fixed' in track.puddles);
  const previewW = previewWidth(1 + lapTiles);
  const previewCam = CAM_MIN;

  // ---------------------------------------------------------------- data: the edits, batched

  const flushEdits = useCallback(() => {
    const { counts, state } = takeEdits(edRef.current);
    if (!hasEdits(counts)) return;
    edRef.current = state;
    log('copa2_edit', { ...counts });
  }, [log]);
  useEffect(() => () => {
    const { counts } = takeEdits(edRef.current);
    if (hasEdits(counts)) logger?.('copa2_edit', { track: track.id, ...counts });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { onProgramChange?.(ed.program); }, [ed.program, onProgramChange]);

  // ---------------------------------------------------------------- the editor's actions

  const [msgTimer, setMsgTimer] = useState(0);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4500);
    return () => clearTimeout(t);
  }, [msg, msgTimer]);

  const tryAdd = useCallback((kind: BlockKind, at?: Caret) => {
    const res = addBlock(edRef.current, kind, rules, at);
    if (res.ok) { setEd(res.state); setMsg(null); return; }
    if (res.reason === 'full') {
      setShake((n) => n + 1);
      setMsg(fullMessage(track.copa));
      setMsgTimer((n) => n + 1);
      speak(fullMessage(track.copa));
    }
  }, [rules, setEd, track.copa]);

  const handlers = useMemo(() => ({
    onSelect: (id: string) => { setMsg(null); setEd((s) => selectBlock(s, id)); },
    onCaret: (c: Caret) => setEd((s) => setCaret(s, c)),
    onBump: (id: string, d: number) => setEd((s) => bumpNumber(s, id, d)),
    onLaps: (id: string, on: boolean) => setEd((s) => setLaps(s, id, on, rules)),
    onSensor: (id: string, s: Sensor) => setEd((st) => toggleSensor(st, id, s, rules)),
    onAddEvent: () => {
      const res = addEventScript(edRef.current, rules);
      if (res.ok) setEd(res.state);
      else if (res.reason === 'full') { setShake((n) => n + 1); setMsg(fullMessage(track.copa)); setMsgTimer((n) => n + 1); }
    },
  }), [rules, setEd, track.copa]);

  // ---------------------------------------------------------------- the ghost hand (after two failures): only the NEXT block

  const hint = useMemo(() => (ghostHint && phase === 'garage' ? nextBlockHint(ed.program, track) : null), [ghostHint, phase, ed.program, track]);
  const hintKey = hint ? JSON.stringify([hint.block, hint.position, hint.wrongBlockId ?? null]) : '';
  useEffect(() => {
    if (!hint) return;
    if (hint.wrongBlockId) setEd((s) => (s.selected === hint.wrongBlockId ? s : selectBlock(s, hint.wrongBlockId!)));
    else if (hint.block.kind !== 'on_log') setEd((s) => (sameSlot(s.caret, hint.position) && !s.selected ? s : setCaret(s, hint.position)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintKey]);
  useEffect(() => {
    if (!hint || !page.current) return;
    const root = page.current;
    let dead = false;
    let current: GhostRun | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const at = hint.wrongBlockId ? ['.gx-tool-remove'] : hint.block.kind === 'on_log' ? ['.gx-lane-add'] : [`[data-pal="${hint.block.kind}"]`, '.gx-caret'];
    const play = () => {
      if (dead) return;
      current = playGhost(root, [{ do: 'point', at }, { do: 'wait', ms: 700 }]);
      void current.done.then(() => { if (!dead) timer = setTimeout(play, 1800); });
    };
    timer = setTimeout(play, 600);
    return () => { dead = true; clearTimeout(timer); current?.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintKey]);

  // ---------------------------------------------------------------- ¡Largar!

  const largar = useCallback(() => {
    const program = edRef.current.program;
    if (!program.main.length && !program.onLog) return;
    flushEdits();
    runCount.current += 1;
    const seed = seedFor ? seedFor(runCount.current) : Math.floor(Math.random() * 2 ** 31);
    const sim = simulate(program, track, seed);
    const result = sim.outcome === 'finish' ? raceResult(sim, track, rivalTier) : null;
    const r: Run = { sim, program, seed, result, n: runCount.current };
    log('copa2_run', {
      run_n: r.n, outcome: sim.outcome, time_ms: sim.timeMs,
      ...(sim.crash ? { crash_cause: sim.crash.cause, crash_block_kind: blockKindOf(program, sim.crash.blockId) } : {}),
      blocks: allBlocks(program).length, slots: slotCount(program),
      ...(result ? { place: result.place } : {}), rival_tier: rivalTier, seed,
    });
    setNotice(null);
    setMsg(null);
    setRun(r);
    setLast(r);
    setClock(0);
    setPhase('run');
  }, [flushEdits, log, rivalTier, seedFor, track]);

  const backToGarage = useCallback((r: Run) => {
    const s = r.sim;
    if (s.outcome === 'crash' && s.crash) {
      const b = r.program.onLog?.id === s.crash.blockId ? { hat: true } : blockById(r.program, s.crash.blockId);
      setNotice({ kind: 'crash', text: CRASH_TEXT[s.crash.cause], blockId: s.crash.blockId, sig: JSON.stringify(b) });
    } else if (s.outcome === 'stuck') setNotice({ kind: 'stuck', text: STUCK_TEXT, sig: JSON.stringify(r.program) });
    else setNotice({ kind: 'timeout', text: TIMEOUT_TEXT, sig: JSON.stringify(r.program) });
    setRun(null);
    setPhase('garage');
  }, []);

  const toResult = useCallback(() => setPhase('result'), []);

  // the animation clock (race and step view)
  const actions = useRef({ backToGarage, toResult });
  actions.current = { backToGarage, toResult };
  const ended = useRef(false);
  useEffect(() => {
    if (phase !== 'run' && phase !== 'step') return;
    ended.current = false;
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const real = now - t0;
      setClock(real);
      if (phase === 'run' && run && !ended.current) {
        const endReal = run.sim.timeMs / raceSpeed;
        if (run.sim.outcome === 'finish' && real >= endReal + FINISH_HOLD_MS) { ended.current = true; actions.current.toResult(); }
        else if (run.sim.outcome !== 'finish' && real >= endReal + CRASH_HOLD_MS) { ended.current = true; actions.current.backToGarage(run); }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, run, raceSpeed]);

  // ---------------------------------------------------------------- Ver paso a paso

  const stepList = useMemo(() => (last ? stepsOf(last.sim, last.program) : []), [last]);
  const openStep = () => {
    if (!last) return;
    log('copa2_step_view', {});
    flushEdits();
    setNotice(null);
    setStep({ i: -1, since: 0 });
    setAuto(false);
    setClock(0);
    setPhase('step');
  };
  const goStep = (i: number) => {
    const n = Math.max(-1, Math.min(stepList.length - 1, i));
    setStep({ i: n, since: clock });
  };
  const stepFrac = step.i < 0 ? 0 : Math.max(0, Math.min(1, (clock - step.since) / STEP_MS));
  useEffect(() => {
    if (phase !== 'step' || !auto) return;
    if (step.i >= stepList.length - 1) { setAuto(false); return; }
    if (step.i >= 0 && stepFrac < 1) return;
    const t = setTimeout(() => goStep(step.i + 1), step.i < 0 ? 300 : 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, auto, step.i, stepFrac >= 1]);

  // ---------------------------------------------------------------- the scene for this moment

  let me: KartLook = { u: PARK_U.me, revving: true };
  let rivals: [KartLook, KartLook] = [{ u: PARK_U.r0, revving: true }, { u: PARK_U.r1, revving: true }];
  let viewW = previewW;
  let cam = previewCam;
  let puddles: { real: readonly number[] } | { maybe: readonly number[] } = movingPuddles ? { maybe: maybePuddles(track) } : { real: 'fixed' in track.puddles ? track.puddles.fixed : [] };
  let logs: SceneState['logs'] = [];
  let live: Live = NO_LIVE;
  let sceneState: SceneState | null = null;
  let tNow = 0;
  const active = phase === 'run' ? run : phase === 'step' ? last : null;
  if (active && phase === 'run') {
    const sim = active.sim;
    const real = clock;
    tNow = real * raceSpeed;
    if (sim.outcome !== 'finish') tNow = Math.min(tNow, sim.timeMs);
    sceneState = stateAt(sim, tNow);
    const coast = sim.outcome === 'finish' && tNow > sim.timeMs ? Math.min(COAST_U, (tNow - sim.timeMs) / 600) : 0;
    const z = ease(real / ZOOM_MS);
    const meU = uOfPos(sceneState.pos + coast);
    me = lookOf(sceneState, meU);
    rivals = [0, 1].map((k) => {
      const tier = field[k];
      const start = k === 0 ? PARK_U.r0 : PARK_U.r1;
      const frac = tNow / targets[tier];
      const u = start + (total + 0.5 - start) * Math.min(1, frac) + (frac > 1 ? Math.min(COAST_U, (tNow - targets[tier]) / 600) : 0);
      return { u, revving: tNow < 600 } as KartLook;
    }) as [KartLook, KartLook];
    viewW = lerp(previewW, RUN_W, z);
    cam = lerp(previewCam, camFor(meU, RUN_W, 1 + total), z);
    puddles = { real: sim.puddles };
    logs = sceneState.logs;
    live = sceneState.blockId ? { leaf: sceneState.blockId, around: new Set(ancestorsOf(active.program, sceneState.blockId)) } : NO_LIVE;
  } else if (active && phase === 'step') {
    const sim = active.sim;
    const s = step.i >= 0 ? stepList[step.i] : null;
    sceneState = s ? stateAtStep(sim, s, stepFrac) : stateAt(sim, -1);
    const meU = uOfPos(sceneState.pos);
    me = lookOf(sceneState, meU);
    rivals = [{ u: PARK_U.r0 }, { u: PARK_U.r1 }];
    viewW = RUN_W;
    cam = camFor(meU, RUN_W, 1 + total);
    puddles = { real: sim.puddles };
    logs = sceneState.logs;
    live = s?.blockId ? { leaf: s.blockId, around: new Set(s.around) } : NO_LIVE;
  }

  // ---------------------------------------------------------------- what the screen says

  const noticeOn = phase === 'garage' && noticeApplies(notice, ed.program) ? notice : null;
  const crashId = phase === 'step' && last?.sim.crash && sceneState?.crashed ? last.sim.crash.blockId : noticeOn?.kind === 'crash' ? noticeOn.blockId ?? null : null;
  const lap = sceneState ? Math.min(track.laps, Math.floor(Math.min(sceneState.pos, total - 0.001) / lapTiles) + 1) : 1;
  const pal = ORDER.filter((k) => rules.palette.blocks.includes(k));
  const runEnd = phase === 'run' && run ? run.sim.timeMs / raceSpeed : 0;
  const runOver = phase === 'run' && run && run.sim.outcome !== 'finish' && clock >= runEnd + 200;

  // the tap on the crash overlay brings the child back at once
  const skipOverlay = () => { if (phase === 'run' && run && run.sim.outcome !== 'finish' && !ended.current) { ended.current = true; backToGarage(run); } };

  // ---------------------------------------------------------------- the palette: tap to add, drag to place

  const dragState = useRef<{ kind: BlockKind; x: number; y: number; moved: boolean } | null>(null);
  const palDown = (e: ReactPointerEvent, kind: BlockKind) => {
    if (phase !== 'garage') return;
    dragState.current = { kind, x: e.clientX, y: e.clientY, moved: false };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
  };
  const palMove = (e: ReactPointerEvent) => {
    const d = dragState.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) d.moved = true;
    if (d.moved) setDrag({ kind: d.kind, x: e.clientX, y: e.clientY });
  };
  const palUp = (e: ReactPointerEvent) => {
    const d = dragState.current;
    dragState.current = null;
    setDrag(null);
    if (!d) return;
    if (!d.moved) { tryAdd(d.kind); return; }
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-drop]');
    if (hit?.dataset.drop) tryAdd(d.kind, JSON.parse(hit.dataset.drop) as Position);
  };
  const palKey = (e: React.KeyboardEvent, kind: BlockKind) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tryAdd(kind); } };

  // ---------------------------------------------------------------- the selected block's tools

  const sel = ed.selected;
  const selAt = sel && ed.program.onLog?.id !== sel ? locate(ed.program, sel) : null;
  const selList = selAt ? listAt(ed.program, selAt.script, selAt.path) : null;
  const canBefore = !!selAt && selAt.index > 0;
  const canAfter = !!selAt && !!selList && selAt.index < selList.length - 1;
  const tools = (
    <div className="gx-tools">
      {sel ? (
        <>
          <button type="button" className="cut gx-tool gx-tool-remove" onClick={() => setEd((s) => removeSelected(s))}>
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M4,7 H20 M9,7 V4 H15 V7 M6,7 L7,21 H17 L18,7 M10,11 V17 M14,11 V17" fill="none" stroke="#2b2622" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Sacar
          </button>
          {selAt && (
            <>
              <button type="button" className="cut gx-tool gx-tool-before" disabled={!canBefore} onClick={() => setEd((s) => moveSelected(s, -1).state)}>
                <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M20,12 H5 M11,5 L4,12 L11,19" fill="none" stroke="#2b2622" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Antes
              </button>
              <button type="button" className="cut gx-tool gx-tool-after" disabled={!canAfter} onClick={() => setEd((s) => moveSelected(s, 1).state)}>
                Después
                <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M4,12 H19 M13,5 L20,12 L13,19" fill="none" stroke="#2b2622" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </>
          )}
        </>
      ) : <p className="gx-tools-hint">Tocá un bloque para sacarlo o moverlo.</p>}
    </div>
  );

  const banner = (
    <>
      {noticeOn && <p className={`gx-banner is-${noticeOn.kind}`} role="status"><b>{noticeOn.kind === 'crash' ? '¡Chocaste!' : noticeOn.kind === 'stuck' ? '¡Falta camino!' : '¡No termina!'}</b> {noticeOn.text}</p>}
      {!noticeOn && hint?.wrongBlockId && <p className="gx-banner is-hint" role="status">Este bloque no va ahí. Sacalo.</p>}
    </>
  );

  // ---------------------------------------------------------------- the result

  if (phase === 'result' && run?.result) {
    const done = run;
    return (
      <GarageResult
        track={track} sim={done.sim} result={done.result!}
        onRevancha={() => { setRun(null); setPhase('garage'); }}
        onNext={() => onResult({
          trackId: track.id, rival: rivalTier, won: done.result!.won, place: done.result!.place, result: done.result!, program: done.program,
          timeMs: done.sim.timeMs, runs: runCount.current, slots: track.slots, used: slotCount(done.program),
        })}
      />
    );
  }

  const inGarage = phase === 'garage';
  const goalMs = targets[rivalTier];
  const stepNow = step.i >= 0 ? stepList[step.i] : null;
  const atEnd = step.i >= stepList.length - 1;
  const showScene = sceneState ?? null;

  return (
    <main className={`gx-page${hint ? ' has-hint' : ''}`} data-phase={phase} data-track={track.id} data-copa={track.copa} ref={page}>
      <header className="gx-head">
        <div className="gx-title">
          <small>Copa {track.copa}</small>
          <h1>{track.name}</h1>
        </div>
        <div className="gx-goal" aria-label={`Ganale ${aAnimal(rivalName)}`}>
          <span className="gx-goal-critter"><svg viewBox="-60 -90 120 100" width="64" height="54" aria-hidden="true"><CritterArt id={RIVAL_ANIMAL[rivalTier]} bare /></svg></span>
          <span className="gx-goal-text">Ganale {aAnimal(rivalName).split(' ')[0]} <b>{rivalName.replace(/^el /, '')}</b>: llegá en menos de <b>{seconds(goalMs)}</b></span>
        </div>
      </header>

      <section className="sheet gx-scene-card">
        <Scene
          course={course} road={road} lapTiles={lapTiles} viewW={viewW} cam={cam} me={me} rivals={rivals} pair={pair}
          puddles={puddles} logs={logs} numbers={inGarage} spinKey={sceneState?.skidding ? 1 : 0}
        />
        {inGarage && <TrackNotes track={track} moving={movingPuddles} />}
        {phase === 'run' && sceneState && !runOver && (
          <div className="gx-hud" aria-live="off">
            <span className="gx-clock">{seconds(Math.min(tNow, run!.sim.timeMs))}</span>
            {track.laps > 1 && <span className="gx-lap">Vuelta {lap} de {track.laps}</span>}
          </div>
        )}
        {runOver && run && (
          <button type="button" className={`gx-overlay is-${run.sim.outcome}`} onClick={skipOverlay}>
            <b>{run.sim.outcome === 'crash' ? '¡Chocaste!' : run.sim.outcome === 'stuck' ? '¡Te quedaste sin programa!' : '¡Nunca termina!'}</b>
            <span>{run.sim.outcome === 'crash' && run.sim.crash ? CRASH_TEXT[run.sim.crash.cause] : run.sim.outcome === 'stuck' ? STUCK_TEXT : TIMEOUT_TEXT}</span>
            <small>Tocá para volver al garaje</small>
          </button>
        )}
        {showScene && phase === 'step' && showScene.finished && <p className="gx-flag">¡Llegó a la meta!</p>}
      </section>

      <div className="gx-body">
        <div className="gx-left">
          <ProgramPanel
            program={inGarage ? ed.program : (active?.program ?? ed.program)}
            rules={rules} caret={ed.caret} selected={inGarage ? ed.selected : null}
            live={live} crashId={crashId} wrongId={inGarage ? hint?.wrongBlockId ?? null : null}
            readOnly={!inGarage} handlers={handlers} banner={banner} toolbar={inGarage ? tools : undefined}
          />
        </div>

        <aside className="gx-side">
          {inGarage && <MemoryMeter program={ed.program} rules={rules} shake={shake} />}
          {inGarage && msg && <p className="gx-banner is-nofit" role="alert">{msg}</p>}
          {inGarage && (
            <>
              <section className="sheet gx-palette" aria-label="Bloques">
                <div className="gx-pal-grid" style={{ ['--cols' as string]: pal.length <= 6 ? pal.length : Math.ceil(pal.length / 2) }}>
                  {pal.map((k) => (
                    <button
                      key={k} type="button" data-pal={k}
                      className={`cut gx-pal${hint && !hint.wrongBlockId && hint.block.kind === k ? ' is-hinted' : ''}${slotCount(ed.program) >= rules.slots ? ' is-full' : ''}`}
                      onPointerDown={(e) => palDown(e, k)} onPointerMove={palMove} onPointerUp={palUp}
                      onPointerCancel={() => { dragState.current = null; setDrag(null); }}
                      onKeyDown={(e) => palKey(e, k)}
                    >
                      <BlockIcon kind={k} size={44} />
                      <span>{BLOCK_LABEL[k]}</span>
                    </button>
                  ))}
                </div>
                {hint && !hint.wrongBlockId && <p className="gx-hint-caption">Pista: poné <b>{hintLabel(hint.block)}</b></p>}
              </section>
              <div className="gx-actions">
                <button type="button" className="cut gx-largar" disabled={!ed.program.main.length && !ed.program.onLog} onClick={largar}>
                  <svg viewBox="0 0 40 40" width="46" height="46" aria-hidden="true"><path d="M8,5 V36" stroke="#2b2622" strokeWidth="4" strokeLinecap="round" /><path d="M8,6 L34,10 L28,18 L34,26 L8,22 Z" fill="#fbf7ee" stroke="#2b2622" strokeWidth="3" strokeLinejoin="round" /></svg>
                  ¡Largar!
                </button>
                <button type="button" className="cut gx-stepbtn" disabled={!last} onClick={openStep}>
                  <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><circle cx="13" cy="13" r="8" fill="#fbf7ee" stroke="#2b2622" strokeWidth="3" /><path d="M19,19 L28,28" stroke="#2b2622" strokeWidth="4" strokeLinecap="round" /></svg>
                  Ver paso a paso
                </button>
              </div>
            </>
          )}
          {phase === 'run' && (
            <section className="sheet gx-runbox" aria-live="polite">
              <p className="gx-run-title">¡Allá va!</p>
              <p className="gx-run-sub">Mirá qué bloque está andando: se ilumina.</p>
            </section>
          )}
          {phase === 'step' && (
            <section className="sheet gx-stepbox" aria-label="Paso a paso">
              <p className="gx-step-count">{step.i < 0 ? 'Antes de largar' : `Paso ${step.i + 1} de ${stepList.length}`}</p>
              <div className="gx-step-caption">
                {stepNow ? stepNow.caption.map((c, i) => <p key={i} className={i === stepNow.caption.length - 1 ? 'is-main' : ''}>{c}</p>) : <p className="is-main">Tocá «Siguiente» y mirá qué bloque anda primero.</p>}
              </div>
              <div className="gx-step-btns">
                <button type="button" className="cut gx-step-prev" disabled={step.i < 0} onClick={() => { setAuto(false); goStep(step.i - 1); }}>Antes</button>
                <button type="button" className="cut gx-step-next" disabled={atEnd} onClick={() => { setAuto(false); goStep(step.i + 1); }}>Siguiente</button>
              </div>
              <div className="gx-step-btns">
                <button type="button" className={`cut gx-step-auto${auto ? ' is-on' : ''}`} disabled={atEnd} onClick={() => setAuto((a) => !a)}>{auto ? 'Pausa' : 'Seguir despacio'}</button>
                <button type="button" className="cut gx-step-back" onClick={() => { setAuto(false); setPhase('garage'); }}>Volver al garaje</button>
              </div>
            </section>
          )}
        </aside>
      </div>
      {drag && <div className="gx-dragghost" style={{ left: drag.x, top: drag.y }}><BlockIcon kind={drag.kind} size={52} /></div>}
    </main>
  );
}

// ------------------------------------------------------------------ helpers

function lookOf(s: SceneState, u: number): KartLook {
  return { u, lift: s.lift, turbo: s.turbo, skidding: s.skidding, sputter: s.sputter, crashed: s.crashed, braking: s.braking };
}

function blockKindOf(p: Program, id: string): string {
  if (p.onLog?.id === id) return 'on_log';
  return blockById(p, id)?.kind ?? 'unknown';
}

function hintLabel(b: { kind: string; n?: number | 'laps'; cond?: Sensor[] }): string {
  if (b.kind === 'on_log') return '«Si cae un tronco»';
  const base = BLOCK_LABEL[b.kind as BlockKind] ?? b.kind;
  if (b.kind === 'repeat') return `«${base}» ${b.n === 'laps' ? 'vueltas' : `${b.n} veces`}`;
  if (b.kind === 'wait') return `«${base}» ${b.n} s`;
  return `«${base}»`;
}

/** What the track does that the picture alone does not say: the moving puddles, the falling log, the laps. */
function TrackNotes({ track, moving }: { track: TrackSpec; moving: boolean }) {
  const count = 'count' in track.puddles ? track.puddles.count : 0;
  return (
    <ul className="gx-notes">
      {moving && (
        <li><svg viewBox="0 0 48 48" width="28" height="28" aria-hidden="true"><ellipse cx="24" cy="28" rx="20" ry="10" fill="#5fa8d3" stroke="#2b2622" strokeWidth="3" /></svg>
          {count} {count === 1 ? 'charco' : 'charcos'}: pueden aparecer en cualquier lado</li>
      )}
      {track.logs && (
        <li><BlockIcon kind="on_log" size={28} bare /> Un tronco cae sin avisar</li>
      )}
      {track.laps > 1 && <li><BlockIcon kind="repeat" size={28} bare /> {track.laps} vueltas{track.nitro ? `, ${track.nitro} nitros` : ''}</li>}
    </ul>
  );
}
