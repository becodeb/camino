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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { speak } from '../../ui/speech';
import { CritterArt } from '../../ui/critterArt';
import { playGhost, type GhostRun } from '../../ui/ghost';
import { NAME } from '../Race';
import { allBlocks, slotCount, type Block, type BlockKind, type Program, type Sensor } from './program';
import { simulate, type SimResult } from './sim';
import { PALETTES, rivalTargets, type Tier, type TrackSpec } from './tracks';
import { RIVAL_ANIMAL, raceField, raceResult, type RaceResult } from './rivals';
import { nextBlockHint, type Position } from './hints';
import {
  addBlock, addEventScript, addSensor, ancestorsOf, blockById, bumpNumber, emptyConditions, hasEdits, lapsAllowed, listAt, locate, makeBlock, moveBlock, moveSelected, newEditor,
  removeBlock, removeSensor, removeSelected, sameSlot, selectBlock, sensorTarget, setCaret, setLaps, takeEdits, type Caret, type EditorState, type Rules,
} from './editor';
import { stateAt, stateAtStep, stepsOf, type SceneState } from './playback';
import { CRASH_TEXT, STUCK_TEXT, TIMEOUT_TEXT, BLOCK_LABEL, SENSOR_LABEL, aAnimal, seconds } from './labels';
import { BlockIcon } from './blockArt';
import { HeldBlock, HeldHat, HeldSensor, PaletteBlock, PaletteSensor } from './CopaBlocks';
import { CANVAS_W, PILL_W, heightOf } from './blockLayout';
import { dragDemoSeen, noteDragDemo } from './store';
import { MemoryMeter, NO_LIVE, ProgramPanel, ReferencePanel, type DndView, type HitCondFn, type HitFn, type Live } from './ProgramPanel';
import { CAM_MIN, COAST_U, PARK_U, RUN_W, Scene, camFor, courseFor, maybePuddles, previewWidth, uOfPos, type KartLook } from './Scene';
import { DeerDeed, DeerDriver } from './DeerArt';
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

/** What a ¡Largar! turned out to be, told to the flow the moment it starts (the engine is deterministic: the outcome is already known). */
export interface RunReport {
  n: number;
  outcome: SimResult['outcome'];
  timeMs: number;
  crashCause?: string;
  /** A finished run only. */
  result?: RaceResult;
}

export type GaragePhase = 'garage' | 'run' | 'step' | 'result';

export interface GarageProps {
  track: TrackSpec;
  /** `deer`: Ayudá al ciervo. The goal is the deer's program running to the end (no rivals, no podium); a finished run ends in a small thank-you. */
  mode?: 'race' | 'deer';
  /** The copa's name for the header, when it is not the track's own (the deer's). */
  title?: string;
  /** A previous program, shown faded beside the garage as "tu programa anterior" (copas 2 and 3 start empty). */
  reference?: Program | null;
  /** Small buttons for the header (the copa strip, the Arcade): the flow's. */
  headerExtra?: ReactNode;
  /** After enough failures the flow lets the child go on without fixing the deer. */
  giveUp?: { label: string; onGiveUp(): void } | null;
  onRun?(r: RunReport): void;
  onPhase?(phase: GaragePhase): void;
  /** ¡Revancha! pressed on a result (the rival of the next race follows from it). */
  onRevancha?(p: GarageResultPayload): void;
  /** After a loss: "Espiá el programa del <rival>". */
  onSpy?(p: GarageResultPayload): void;
  /** Whether the result offers "¡Saltar a la copa siguiente!" (the flow's rule: journey.offerSkip). */
  offerSkip?(p: GarageResultPayload): boolean;
  onSkip?(p: GarageResultPayload): void;
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

type Phase = GaragePhase;

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

/** The palette's groups, each with its small header (the "Mirar" group is the copa's sensor pieces). */
const GROUPS: readonly { name: string; kinds: readonly BlockKind[] }[] = [
  { name: 'Mover', kinds: ['forward', 'up', 'down', 'jump', 'turbo', 'nitro'] },
  { name: 'Repetir y decidir', kinds: ['repeat', 'if'] },
];
const WAIT_GROUP: readonly BlockKind[] = ['brake', 'wait'];

type Src = { from: 'palette'; kind: BlockKind } | { from: 'sensor'; sensor: Sensor } | { from: 'program'; id: string };
interface Pending { src: Src; el: HTMLElement; x0: number; y0: number; id: number }
interface Drag extends Pending { offX: number; offY: number; width: number; h: number; block: Block | null; x: number; y: number }
const noDemo = (): boolean => { try { return /[?&]nodemo\b/.test(location.search + location.hash); } catch { return false; } };
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

export function Garage({
  track, rivalTier, initialProgram, ghostHint = false, onResult, onProgramChange, logger, seedFor, raceSpeed = RACE_SPEED,
  mode = 'race', title, reference, headerExtra, giveUp, onRun, onPhase, onRevancha, onSpy, offerSkip, onSkip,
}: GarageProps) {
  const deer = mode === 'deer';
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
  const [drag, setDrag] = useState<Drag | null>(null);
  const [gap, setGap] = useState<{ pos: Position; h: number } | null>(null);
  const [overPalette, setOverPalette] = useState(false);
  const [warn, setWarn] = useState<string[]>([]);
  const [condTarget, setCondTarget] = useState<string | null>(null);
  const runCount = useRef(0);
  const page = useRef<HTMLElement>(null);
  const sceneCard = useRef<HTMLElement>(null);
  const log = useCallback((type: string, payload: Record<string, unknown>) => logger?.(type, { track: track.id, ...(deer ? { deer: true } : {}), ...payload }), [logger, track.id, deer]);
  const phaseRef = useRef<Phase>('garage');
  const phaseCb = useRef(onPhase);
  phaseCb.current = onPhase;
  phaseRef.current = phase;
  useEffect(() => { phaseCb.current?.(phase); }, [phase]);
  const payloadOf = useCallback((done: Run): GarageResultPayload => ({
    trackId: track.id, rival: rivalTier, won: done.result?.won ?? false, place: done.result?.place ?? 3, result: done.result!, program: done.program,
    timeMs: done.sim.timeMs, runs: runCount.current, slots: track.slots, used: slotCount(done.program),
  }), [rivalTier, track.id, track.slots]);

  // the track stays at the top while the page scrolls: the blocks scroll under it, so they need to know how tall it is
  useLayoutEffect(() => {
    const card = sceneCard.current;
    const root = page.current;
    if (!card || !root) return;
    const set = () => root.style.setProperty('--gx-stick', `${Math.round(card.getBoundingClientRect().height) + 10}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(card);
    return () => ro.disconnect();
  }, []);

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
    log('garage_edit', { ...counts });
  }, [log]);
  useEffect(() => () => {
    const { counts } = takeEdits(edRef.current);
    if (hasEdits(counts)) logger?.('garage_edit', { track: track.id, ...(deer ? { deer: true } : {}), ...counts });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // the flow gets the program after every edit (and once on mount); a new callback each render must not re-send it
  const programCb = useRef(onProgramChange);
  programCb.current = onProgramChange;
  useEffect(() => { programCb.current?.(ed.program); }, [ed.program]);

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

  /** A sensor piece into a `si` (dropped on its hole, or tapped: the `si` that takes it is chosen by the editor). */
  const trySensor = useCallback((sensor: Sensor, ifId?: string) => {
    const target = ifId ?? sensorTarget(edRef.current);
    if (!target) {
      setMsg('Primero poné un «si». Después le ponés qué mira.');
      setMsgTimer((n) => n + 1);
      speak('Primero poné un si.');
      return;
    }
    const res = addSensor(edRef.current, target, sensor, rules);
    if (res.ok) { setEd(res.state); setMsg(null); return; }
    if (res.reason === 'cond_full') { setMsg('Un «si» mira dos cosas como mucho.'); setMsgTimer((n) => n + 1); }
  }, [rules, setEd]);

  const handlers = useMemo(() => ({
    onSelect: (id: string) => { setMsg(null); setEd((s) => selectBlock(s, id)); },
    onCaret: (c: Caret) => setEd((s) => setCaret(s, c)),
    onBump: (id: string, d: number) => setEd((s) => bumpNumber(s, id, d)),
    onLaps: (id: string, on: boolean) => setEd((s) => setLaps(s, id, on, rules)),
    onUnsensor: (id: string, s: Sensor) => setEd((st) => removeSensor(st, id, s)),
    onAddEvent: () => {
      const res = addEventScript(edRef.current, rules);
      if (res.ok) setEd(res.state);
      else if (res.reason === 'full') { setShake((n) => n + 1); setMsg(fullMessage(track.copa)); setMsgTimer((n) => n + 1); }
    },
  }), [rules, setEd, track.copa]);

  // ---------------------------------------------------------------- the ghost hand (after two failures): only the NEXT block

  const hint = useMemo(() => (ghostHint && phase === 'garage' ? nextBlockHint(ed.program, track) : null), [ghostHint, phase, ed.program, track]);
  const hintKey = hint ? JSON.stringify([hint.block, hint.position, hint.wrongBlockId ?? null, hint.changeNumberId ?? null, hint.ifId ?? null, hint.wrongSensor ?? null]) : '';
  useEffect(() => {
    if (!hint) return;
    if (hint.changeNumberId) setEd((s) => (s.selected === hint.changeNumberId ? s : selectBlock(s, hint.changeNumberId!)));
    else if (hint.wrongBlockId) setEd((s) => (s.selected === hint.wrongBlockId ? s : selectBlock(s, hint.wrongBlockId!)));
    else if (hint.block.kind === 'sensor') { if (hint.ifId) setEd((s) => (s.selected === hint.ifId ? s : selectBlock(s, hint.ifId!))); }
    else if (hint.block.kind !== 'on_log') setEd((s) => (sameSlot(s.caret, hint.position) && !s.selected ? s : setCaret(s, hint.position)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintKey]);
  useEffect(() => {
    if (!hint || !page.current) return;
    const root = page.current;
    let dead = false;
    let current: GhostRun | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const at = hint.changeNumberId ? [`[data-id="${hint.changeNumberId}"] .gb-step`]
      : hint.wrongBlockId ? ['.gx-tool-remove']
      : hint.wrongSensor ? [`[data-cond-for="${hint.wrongSensor.ifId}"][data-sensor="${hint.wrongSensor.sensor}"] .gb-pill-x`]
        : hint.block.kind === 'on_log' ? ['.gx-lane-add']
          : hint.block.kind === 'sensor' ? [`[data-pal-sensor="${hint.block.sensor}"]`, `[data-cond-slot="${hint.ifId}"]`]
            : [`[data-pal="${hint.block.kind}"]`, '.gx-caret'];
    const play = () => {
      if (dead) return;
      current = playGhost(root, [{ do: 'point', at }, { do: 'wait', ms: 700 }]);
      void current.done.then(() => { if (!dead) timer = setTimeout(play, 1800); });
    };
    timer = setTimeout(play, 600);
    return () => { dead = true; clearTimeout(timer); current?.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintKey]);

  // ---------------------------------------------------------------- the first time: the ghost hand shows that blocks can be dragged
  // (the format only: a piece goes from the palette to the program and comes back; nothing is added, nothing says what to build)
  useEffect(() => {
    if (dragDemoSeen() || noDemo() || !page.current) return;
    const root = page.current;
    let run: GhostRun | null = null;
    const stop = () => { run?.cancel(); run = null; };
    const timer = setTimeout(() => {
      if (edRef.current.selected || phaseRef.current !== 'garage') return;
      noteDragDemo();
      const into = '.gx-program:not(.is-compact) .gx-lane-main .gb-hole, .gx-program:not(.is-compact) .gx-lane-main .gx-caret';
      run = playGhost(root, [
        { do: 'drag', from: '[data-pal="forward"]', to: into },
        { do: 'wait', ms: 500 },
        { do: 'drag', from: into, to: '.gx-palette' },
      ]);
      window.addEventListener('pointerdown', stop, { once: true });
    }, 1400);
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', stop); stop(); };
    // once, when the garage opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- ¡Largar!

  const largar = useCallback(() => {
    const program = edRef.current.program;
    if (!program.main.length && !program.onLog) return;
    if (slotCount(program) > rules.slots) return; // it does not fit the memory: the banner says so
    const empties = emptyConditions(program);
    if (empties.length) {
      // a `si` that looks at nothing: say so on the screen, at the hole, before anything runs
      setWarn(empties);
      speak('Al si le falta qué mirar. Poné una pieza en el casillero.');
      log('garage_empty_si', { count: empties.length });
      requestAnimationFrame(() => page.current?.querySelector('.gx-banner.is-emptycond')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
      return;
    }
    flushEdits();
    runCount.current += 1;
    const seed = seedFor ? seedFor(runCount.current) : Math.floor(Math.random() * 2 ** 31);
    const sim = simulate(program, track, seed);
    const result = sim.outcome === 'finish' ? raceResult(sim, track, rivalTier) : null;
    const r: Run = { sim, program, seed, result, n: runCount.current };
    log('garage_run', {
      run_n: r.n, outcome: sim.outcome, time_ms: sim.timeMs,
      ...(sim.crash ? { crash_cause: sim.crash.cause, crash_block_kind: blockKindOf(program, sim.crash.blockId) } : {}),
      blocks: allBlocks(program).length, slots: slotCount(program),
      ...(result ? { place: result.place } : {}), rival_tier: rivalTier, seed,
    });
    onRun?.({
      n: r.n, outcome: sim.outcome, timeMs: sim.timeMs,
      ...(sim.crash ? { crashCause: sim.crash.cause } : {}), ...(result ? { result } : {}),
    });
    setNotice(null);
    setMsg(null);
    setRun(r);
    setLast(r);
    setClock(0);
    setPhase('run');
  }, [flushEdits, log, onRun, rivalTier, rules.slots, seedFor, track]);

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
    log('garage_step_view', {});
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

  const inGarageEarly = phase === 'garage';
  const noticeOn = phase === 'garage' && noticeApplies(notice, ed.program) ? notice : null;
  const crashId = phase === 'step' && last?.sim.crash && sceneState?.crashed ? last.sim.crash.blockId : noticeOn?.kind === 'crash' ? noticeOn.blockId ?? null : null;
  const lap = sceneState ? Math.min(track.laps, Math.floor(Math.min(sceneState.pos, total - 0.001) / lapTiles) + 1) : 1;
  const pal = [...GROUPS.flatMap((g) => g.kinds), ...WAIT_GROUP].filter((k) => rules.palette.blocks.includes(k));
  const runEnd = phase === 'run' && run ? run.sim.timeMs / raceSpeed : 0;
  const runOver = phase === 'run' && run && run.sim.outcome !== 'finish' && clock >= runEnd + 200;

  // the tap on the crash overlay brings the child back at once
  const skipOverlay = () => { if (phase === 'run' && run && run.sim.outcome !== 'finish' && !ended.current) { ended.current = true; backToGarage(run); } };

  // ---------------------------------------------------------------- blocks in the hand: drag from the palette, reorder, throw away
  //
  // The same gesture as the other levels (src/blocks/BlockEditor.tsx): a pointer down on a block, a few pixels of
  // movement turn it into a drag, the block follows the pointer as a ghost, the program opens a hole where it would
  // land, a release places it. A placed block thrown on the palette is deleted; thrown anywhere else it goes back.
  // A tap that never became a drag is the tap-to-add / select path, which stays exactly as it was.

  const hitRef = useRef<HitFn | null>(null);
  const hitCondRef = useRef<HitCondFn | null>(null);
  const condRef = useRef<string | null>(null);
  const pending = useRef<Pending | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const gapRef = useRef<{ pos: Position; h: number } | null>(null);
  const overRef = useRef(false);
  const suppressTap = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 });
  const edReady = phase === 'garage';
  const stateRef = useRef({ rules, edReady });
  stateRef.current = { rules, edReady };

  const probe = (d: Drag, x: number, y: number): Position | null => hitRef.current?.(x - d.offX + 22, y - d.offY + 28) ?? null;
  const placeGhost = (x: number, y: number) => {
    const d = dragRef.current;
    if (!d || !ghostRef.current) return;
    ghostRef.current.style.transform = `translate(${x - d.offX}px, ${y - d.offY}px)`;
  };
  const begin = (pd: Pending, x: number, y: number) => {
    const r = pd.el.getBoundingClientRect();
    const sensors = rules.palette.sensors;
    let block: Block | null = null;
    let h = r.height;
    if (pd.src.from === 'sensor') {
      h = 40;
    } else if (pd.src.from === 'palette') {
      block = makeBlock(pd.src.kind, rules, 'held');
      h = heightOf(block, { width: CANVAS_W, sensors, laps: lapsAllowed(rules) });
    } else {
      const id = pd.src.id;
      block = edRef.current.program.onLog?.id === id ? null : blockById(edRef.current.program, id);
      h = block ? heightOf(block, { width: CANVAS_W, sensors, laps: lapsAllowed(rules) }) : 0;
    }
    const width = pd.src.from === 'sensor' ? PILL_W[pd.src.sensor] : pd.src.from === 'palette' ? CANVAS_W : r.width;
    const d: Drag = { ...pd, offX: Math.min(x - r.left, width - 10), offY: Math.min(y - r.top, 40), width, h, block, x, y };
    dragRef.current = d;
    setDrag(d);
    setMsg(null);
  };
  const clearDrag = () => {
    dragRef.current = null;
    pending.current = null;
    gapRef.current = null;
    overRef.current = false;
    condRef.current = null;
    setDrag(null);
    setGap(null);
    setCondTarget(null);
    setOverPalette(false);
  };
  const finish = (x: number, y: number, cancelled: boolean) => {
    const d = dragRef.current;
    suppressTap.current = true;
    setTimeout(() => { suppressTap.current = false; }, 0);
    if (!d) { pending.current = null; return; }
    if (d.src.from === 'sensor') {
      const target = cancelled ? null : hitCondRef.current?.(x - d.offX + 22, y - d.offY + 20) ?? null;
      const sensor = d.src.sensor;
      clearDrag();
      if (target) trySensor(sensor, target);
      return;
    }
    const pos = cancelled ? null : probe(d, x, y);
    const trash = !cancelled && overPaletteAt(x, y);
    clearDrag();
    if (cancelled) return;
    if (d.src.from === 'palette') {
      if (pos && !trash) tryAdd(d.src.kind, pos);
      return;
    }
    const id = d.src.id;
    if (trash) { setEd((s) => removeBlock(s, id)); return; }
    if (!pos) return;
    const res = moveBlock(edRef.current, id, pos, rules);
    if (res.ok) setEd(res.state);
    else if (res.reason === 'full') { setShake((n) => n + 1); setMsg(fullMessage(track.copa)); setMsgTimer((n) => n + 1); speak(fullMessage(track.copa)); }
  };
  const overPaletteAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-zone]')?.dataset.zone === 'palette';

  const fns = useRef({ begin, finish, probe, placeGhost });
  fns.current = { begin, finish, probe, placeGhost };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const pd = pending.current;
      if (!pd || e.pointerId !== pd.id) return;
      pointerRef.current = { x: e.clientX, y: e.clientY };
      if (!dragRef.current) {
        if (Math.hypot(e.clientX - pd.x0, e.clientY - pd.y0) < 8) return;
        fns.current.begin(pd, e.clientX, e.clientY);
      }
      const d = dragRef.current!;
      e.preventDefault();
      fns.current.placeGhost(e.clientX, e.clientY);
      if (d.src.from === 'sensor') {
        const t = hitCondRef.current?.(e.clientX - d.offX + 22, e.clientY - d.offY + 20) ?? null;
        if (t !== condRef.current) { condRef.current = t; setCondTarget(t); }
        return;
      }
      const over = d.src.from === 'program' && overPaletteAt(e.clientX, e.clientY);
      if (over !== overRef.current) { overRef.current = over; setOverPalette(over); }
      const pos = over || (d.src.from === 'program' && !d.block) ? null : fns.current.probe(d, e.clientX, e.clientY);
      const next = pos ? { pos, h: d.h } : null;
      if (JSON.stringify(next) !== JSON.stringify(gapRef.current)) { gapRef.current = next; setGap(next); }
    };
    const up = (e: PointerEvent) => {
      const pd = pending.current;
      if (!pd || e.pointerId !== pd.id) return;
      if (dragRef.current) fns.current.finish(e.clientX, e.clientY, false);
      pending.current = null;
    };
    const cancel = (e: PointerEvent) => {
      const pd = pending.current;
      if (!pd || e.pointerId !== pd.id) return;
      if (dragRef.current) fns.current.finish(e.clientX, e.clientY, true);
      pending.current = null;
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    // the handlers read everything through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => { if (drag) placeGhost(drag.x, drag.y); }, [drag]);

  // near the edge of the screen a drag scrolls the page (a long program is taller than the screen)
  useEffect(() => {
    if (!drag) return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const { x, y } = pointerRef.current;
      const top = (Number.parseFloat(getComputedStyle(page.current ?? document.body).getPropertyValue('--gx-stick')) || 0) + 36;
      // the speed grows as the pointer nears the edge (and the page only moves if it has room to)
      const edge = window.innerHeight - 60;
      const room = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      if (y > edge && room > 2) window.scrollBy(0, Math.min(room, Math.round(3 + ((y - edge) / 60) * 9)));
      else if (y < top && window.scrollY > 0) window.scrollBy(0, -Math.round(3 + Math.min(1, (top - y) / 60) * 9));
      if (dragRef.current && dragRef.current.src.from !== 'sensor') {
        const pos = dragRef.current.src.from === 'program' && !dragRef.current.block ? null : overRef.current ? null : probe(dragRef.current, x, y);
        const next = pos ? { pos, h: dragRef.current.h } : null;
        if (JSON.stringify(next) !== JSON.stringify(gapRef.current)) { gapRef.current = next; setGap(next); }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  const palDown = (e: ReactPointerEvent<HTMLElement>, kind: BlockKind) => {
    if (!stateRef.current.edReady || pending.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pending.current = { src: { from: 'palette', kind }, el: e.currentTarget, x0: e.clientX, y0: e.clientY, id: e.pointerId };
    pointerRef.current = { x: e.clientX, y: e.clientY };
  };
  const blockDown = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    if (!stateRef.current.edReady || pending.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pending.current = { src: { from: 'program', id }, el: e.currentTarget, x0: e.clientX, y0: e.clientY, id: e.pointerId };
    pointerRef.current = { x: e.clientX, y: e.clientY };
  };
  const sensorDown = (e: ReactPointerEvent<HTMLElement>, sensor: Sensor) => {
    if (!stateRef.current.edReady || pending.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pending.current = { src: { from: 'sensor', sensor }, el: e.currentTarget, x0: e.clientX, y0: e.clientY, id: e.pointerId };
    pointerRef.current = { x: e.clientX, y: e.clientY };
  };
  const sensorTap = (sensor: Sensor) => { if (!suppressTap.current && phase === 'garage') trySensor(sensor); };
  const palTap = (kind: BlockKind) => { if (!suppressTap.current && phase === 'garage') tryAdd(kind); };
  const dnd: DndView | undefined = edReady ? { dragId: drag?.src.from === 'program' ? drag.src.id : null, gap, hit: hitRef, hitCond: hitCondRef, onDown: blockDown, suppress: () => suppressTap.current } : undefined;

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
      ) : <p className="gx-tools-hint">Arrastrá un bloque para moverlo, o tocalo para elegirlo.</p>}
    </div>
  );

  // a program carried from the last track that does not fit this memory: shown as it is, gently, and ¡Largar! waits until it fits
  const used = slotCount(ed.program);
  const tooBig = inGarageEarly && used > rules.slots;
  const warnIds = useMemo(() => { const e = new Set(emptyConditions(ed.program)); return new Set(warn.filter((id) => e.has(id))); }, [warn, ed.program]);
  const banner = (
    <>
      {tooBig && <p className="gx-banner is-toobig" role="alert"><b>No entra: hay que achicarlo.</b> Tu programa usa {used} lugares y la memoria tiene {rules.slots}.{track.copa >= 2 ? ' ¿Hay algo que se repite?' : ''}</p>}
      {warnIds.size > 0 && <p className="gx-banner is-emptycond" role="alert"><b>¡Falta algo en el «si»!</b> No dice qué tiene que mirar el auto. Poné una pieza de <b>Mirar</b> en el casillero punteado{rules.palette.sensors[0] ? <>, por ejemplo <b>«{SENSOR_LABEL[rules.palette.sensors[0]]}»</b></> : null}.</p>}
      {noticeOn && <p className={`gx-banner is-${noticeOn.kind}`} role="status"><b>{noticeOn.kind === 'crash' ? '¡Chocaste!' : noticeOn.kind === 'stuck' ? '¡Falta camino!' : '¡No termina!'}</b> {noticeOn.text}</p>}
      {!noticeOn && hint?.changeNumberId && <p className="gx-banner is-hint" role="status">Este «repetir» está bien, pero probá con otro número.</p>}
      {!noticeOn && hint?.wrongSensor && <p className="gx-banner is-hint" role="status">Esa pieza no va ahí. Sacala con la cruz.</p>}
      {!noticeOn && hint?.wrongBlockId && <p className="gx-banner is-hint" role="status">Este bloque no va ahí. Sacalo.</p>}
    </>
  );

  // ---------------------------------------------------------------- the result

  if (phase === 'result' && run?.result) {
    const done = run;
    const payload = payloadOf(done);
    if (deer) {
      return (
        <main className="pp-page pp-race is-podium gx-result-page gx-deer-done" data-deer-fixed="1">
          <section className="sheet gx-deer-result" aria-label="El ciervo llegó">
            <DeerDeed />
            <p className="gx-result-line">¡Lo arreglaste! El ciervo llegó a la meta.</p>
            <p className="gx-result-reason">Tu programa lo hizo en <b>{seconds(done.sim.timeMs)}</b>.</p>
            <button type="button" className="cut gx-seguir gx-deer-next" onClick={() => onResult(payload)}>
              <span className="rc-again-word">¡Seguir!</span>
            </button>
          </section>
        </main>
      );
    }
    return (
      <GarageResult
        track={track} sim={done.sim} result={done.result!}
        onRevancha={() => { onRevancha?.(payload); setRun(null); setPhase('garage'); }}
        onNext={() => onResult(payload)}
        onSpy={!done.result!.won && onSpy ? () => onSpy(payload) : undefined}
        onSkip={onSkip && offerSkip?.(payload) ? () => onSkip(payload) : undefined}
      />
    );
  }

  const inGarage = phase === 'garage';
  const goalMs = targets[rivalTier];
  const stepNow = step.i >= 0 ? stepList[step.i] : null;
  const atEnd = step.i >= stepList.length - 1;
  const showScene = sceneState ?? null;
  const goalNode = deer ? (
    <div className="gx-goal gx-goal-deer" aria-label="Arreglá el programa del ciervo">
      <span className="gx-goal-critter"><svg viewBox="-60 -90 120 100" width="64" height="54" aria-hidden="true"><DeerDriver bare /></svg></span>
      <span className="gx-goal-text">El ciervo se chocó. <b>Arreglá su programa</b> para que llegue a la meta</span>
    </div>
  ) : (
    <div className="gx-goal" aria-label={`Ganale ${aAnimal(rivalName)}`}>
      <span className="gx-goal-critter"><svg viewBox="-60 -90 120 100" width="64" height="54" aria-hidden="true"><CritterArt id={RIVAL_ANIMAL[rivalTier]} bare /></svg></span>
      <span className="gx-goal-text">Ganale {aAnimal(rivalName).split(' ')[0]} <b>{rivalName.replace(/^el /, '')}</b>: llegá en menos de <b>{seconds(goalMs)}</b></span>
    </div>
  );
  const held = drag?.block ?? null;
  const blockPiece = (k: BlockKind) => (
    <PaletteBlock key={k} kind={k} rules={rules} hinted={!!hint && !hint.wrongBlockId && !hint.changeNumberId && hint.block.kind === k} full={slotCount(ed.program) >= rules.slots} onDown={palDown} onTap={palTap} />
  );

  return (
    <main className={`gx-page${hint ? ' has-hint' : ''}${drag ? ' is-dragging' : ''}${drag?.src.from === 'program' ? ' is-drag-program' : ''}`} data-phase={phase} data-track={track.id} data-copa={track.copa} ref={page}>
      <header className="gx-head">
        <div className="gx-title">
          <div className="gx-title-row">
            <small>Copa {track.copa}</small>
            {headerExtra}
          </div>
          <h1>{deer ? 'Ayudá al ciervo' : title ?? track.name}</h1>
        </div>
      </header>

      <section className="sheet gx-scene-card" ref={sceneCard}>
        <Scene
          course={course} road={road} lapTiles={lapTiles} viewW={viewW} cam={cam} me={me} rivals={rivals} pair={pair}
          puddles={puddles} logs={logs} numbers={inGarage} spinKey={sceneState?.skidding ? 1 : 0}
          meDriver={deer ? <DeerDriver /> : undefined} hideRivals={deer}
        />
        {inGarage && <TrackNotes track={track} moving={movingPuddles} />}
        {!runOver && phase !== 'run' && goalNode}
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
        <aside className={`gx-palette-col${inGarage ? '' : ' is-idle'}${overPalette ? ' is-trash' : ''}`} data-zone="palette" aria-label="Bloques">
          <section className="sheet gx-palette">
            {GROUPS.map((g) => {
              const ks = g.kinds.filter((k) => pal.includes(k));
              return ks.length ? <PalGroup key={g.name} name={g.name} first={g === GROUPS[0]} cls={ks.every((k) => k === 'repeat' || k === 'if') ? 'is-containers' : ''}>{ks.map(blockPiece)}</PalGroup> : null;
            })}
            {rules.palette.sensors.length > 0 && rules.palette.blocks.includes('if') && (
              <PalGroup name="Mirar" cls="is-sensors">
                {rules.palette.sensors.map((sn) => (
                  <PaletteSensor key={sn} sensor={sn} hinted={(!!hint && hint.block.kind === 'sensor' && hint.block.sensor === sn) || (warnIds.size > 0 && sn === rules.palette.sensors[0])} onDown={sensorDown} onTap={sensorTap} />
                ))}
              </PalGroup>
            )}
            {WAIT_GROUP.some((k) => pal.includes(k)) && <PalGroup name="Esperar" cls="">{WAIT_GROUP.filter((k) => pal.includes(k)).map(blockPiece)}</PalGroup>}
            {hint && !hint.wrongBlockId && !hint.changeNumberId && <p className="gx-hint-caption">Pista: poné <b>{hintLabel(hint.block)}</b></p>}
            <div className="gx-trash" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="34" height="34"><path d="M4,7 H20 M9,7 V4 H15 V7 M6,7 L7,21 H17 L18,7 M10,11 V17 M14,11 V17" fill="none" stroke="#2b2622" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <b>Soltalo acá para sacarlo</b>
            </div>
          </section>
        </aside>

        <div className={`gx-main${reference ? ' has-ref' : ''}`}>
          <ProgramPanel
            program={inGarage ? ed.program : (active?.program ?? ed.program)}
            rules={rules} caret={ed.caret} selected={inGarage ? ed.selected : null}
            live={live} crashId={crashId} wrongId={inGarage ? hint?.wrongBlockId ?? null : null}
            readOnly={!inGarage} handlers={handlers} banner={banner} toolbar={inGarage ? tools : undefined} dnd={dnd} condTarget={condTarget} warnIds={warnIds}
          />
        </div>

        <aside className="gx-side">
          <div className="gx-side-sticky">
            {inGarage && <MemoryMeter program={ed.program} rules={rules} shake={shake} />}
            {inGarage && msg && <p className="gx-banner is-nofit" role="alert">{msg}</p>}
            {inGarage && (
              <div className="gx-actions">
                <button type="button" className="cut gx-largar" disabled={(!ed.program.main.length && !ed.program.onLog) || tooBig} onClick={largar}>
                  <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><path d="M8,5 V36" stroke="#2b2622" strokeWidth="4" strokeLinecap="round" /><path d="M8,6 L34,10 L28,18 L34,26 L8,22 Z" fill="#fbf7ee" stroke="#2b2622" strokeWidth="3" strokeLinejoin="round" /></svg>
                  <span className="gx-largar-word">¡Largar!</span>
                </button>
                <button type="button" className="cut gx-stepbtn" disabled={!last} onClick={openStep}>
                  <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><circle cx="13" cy="13" r="8" fill="#fbf7ee" stroke="#2b2622" strokeWidth="3" /><path d="M19,19 L28,28" stroke="#2b2622" strokeWidth="4" strokeLinecap="round" /></svg>
                  Ver paso a paso
                </button>
                {giveUp && <button type="button" className="cut gx-giveup" onClick={giveUp.onGiveUp}>{giveUp.label}</button>}
              </div>
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
          </div>
          {reference && inGarage && <ReferencePanel program={reference} rules={rules} />}
        </aside>
      </div>
      {drag && createPortal(
        <div ref={ghostRef} className="blk-ghost" style={{ width: drag.width, height: Math.max(drag.h, 40) }} aria-hidden="true">
          <div className="blk-ghost-in">
            {drag.src.from === 'sensor' ? <HeldSensor sensor={drag.src.sensor} /> : held ? <HeldBlock block={held} width={drag.width} sensors={rules.palette.sensors} /> : <HeldHat width={drag.width} />}
          </div>
        </div>,
        document.body,
      )}
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

function hintLabel(b: { kind: string; n?: number | 'laps'; sensor?: Sensor }): string {
  if (b.kind === 'on_log') return '«Si cae un tronco»';
  if (b.kind === 'sensor') return b.sensor ? `«${SENSOR_LABEL[b.sensor]}» en el «si»` : 'una pieza de Mirar';
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

/** A palette group: a small header, then its pieces. */
function PalGroup({ name, cls, first, children }: { name: string; cls: string; first?: boolean; children: ReactNode }) {
  return (
    <div className={`gx-pal-group ${cls}`} data-group={name}>
      <h2 className="gx-pal-head">{name}{first && <span className="gx-pal-intro">Arrastrá o tocá</span>}</h2>
      <div className="gx-pal-grid">{children}</div>
    </div>
  );
}
