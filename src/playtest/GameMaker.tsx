// "Hacé tu juego" (4to, about 10 minutes; T7 of the pilot playtest, rebuilt
// step by step in T15): can a child of 4to build a small game with rules,
// points and lives, understanding what each rule does, and do they like it?
// A probe of free play (probes.ts): the free-play menu shows its card on
// 4to's menu; the adult can open it for any grade.
//
// The game is built in six short steps, playing after each one (the steps,
// their blocks and when each counts as done live in gameMakerProbe.ts):
// move with the arrows, make the stone fall, read the seed that already
// falls, a life lost and a point won by touching, when you win, then free.
// One screen: the palette (only the step's blocks) | the notebook (the
// step's goal on a note, one object's cards at a time) | the board, big,
// with ▶ and the arrow keys above it. Each step's goal is said, captioned
// and drawn; the step path (six stones) is in the bar. ✋ has three steps
// (the goal again with its target wiggling; the ghost hand shows where the
// next block goes; the ghost builds the step's rules, logged as ghost), and
// after 90 s of trying a "seguir" in the bar lets the child move on (the
// step's rules are left built, so the next step works).
//
// The board runs on the pure engine of game/gameMaker.ts, stepped by a
// timer; the objects are drawn here (gameMakerArt.tsx), the child's
// character is its living self (StageView). Rules are read live: a card
// added while the game runs applies at once.
//
// Logged (docs/prueba-piloto-datos.md): `probe_phase` per step, `rule_edit`,
// `game_run`, `probe_end`, `survey_answer` {question: 'game_maker_liked'},
// and `help`, `speak`, `ghost_demo` with level_id 'game_maker'; the raised
// hand as everywhere.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { penLoop } from '../ink/ink.js';
import { CHARACTER_NAME, type CharacterId } from '../curriculum/motivation';
import {
  GM_COLS, GM_ROWS, SAY_WORD, addAction, addObject, addRule, broadcasts, changeChip, cloneGame, compact,
  endings, gmInit, gmStep, isGmHat, keysOf, objectOf, presentOf, removeBlock, ruleCount, TICK_MS,
  type EditResult, type GmEvent, type GmGame, type GmState, type MsgId, type ObjId, type SpriteId,
} from '../game/gameMaker';
import { DIRS, type Dir } from '../game/model';
import { Bar } from '../screens/LevelBar';
import { DEBUG, RestartButton } from '../screens/levelKit';
import { usePlayer, useStage } from '../screens/player';
import { KeyCap } from '../blocks/blocks';
import { NextPageArt, PenRing, PlayLamp } from '../ui/art';
import { playGhost, type DemoStep, type GhostRun } from '../ui/ghost';
import { PlayIcon, StopIcon, RestartIcon, SpeakerIcon } from '../ui/icons';
import { REDUCED } from '../ui/runtime';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { usePlaytest } from './context';
import { Cheer } from './interlude';
import type { ProbeProps } from './probes';
import { Face } from './surveyArt';
import { BarProgressContext, BarProgressView } from './barProgress';
import { useBar } from './Captions';
import { GoOnArt } from './round2Art';
import {
  GM_SAY, START_GAME, STEPS, STEP_DEFS, STEP_NAME, applyMissing, doneLine, editableIn, enterStep, missingEdits, noFlags, observe,
  prepared, stepDone, stepGoal, stepLine, stepPalette, timesFrom, type GmStep, type MissingEdit, type StepFlags,
} from './gameMakerProbe';
import {
  BirdArt, FlyingEnvelope, HeartGlyph, HeartsAgain, ObjIcon, SayBubble, ScoreJar, SeedArt, StepIcon, StoneArt, TrophyArt, WinBurst,
} from './gameMakerArt';
import { ACT_H, ACT_W, GmBlockArt, HAT_H, HAT_W } from './gameMakerBlocks';
import '../blocks/blocks.css';
import './gameMaker.css';

const LEVEL_ID = 'game_maker';
const PROBE = 'game_maker';
type Stage = GmStep | 'liked' | 'cheer';

const OBJ_NAME: Record<Exclude<ObjId, 'me'>, string> = { seed: 'semilla', stone: 'piedra', bird: 'pájaro', game: 'juego' };

/** How a step ended, for `probe_phase`. */
interface StepResult {
  completed: boolean;
  skipped: boolean;
  time_ms: number;
  help_levels: number;
  ghost_built: boolean;
  runs: number;
  edits: number;
  /** The free step: cards and actions the child added there, and whether "avisar" was placed. */
  free?: { adds: number; cards_added: number; used_send: boolean };
}

export function GameMaker({ activity, levelEnded, done }: ProbeProps) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const [stage, setStage] = useState<Stage>('move');
  const [game, setGameState] = useState<GmGame>(() => enterStep(START_GAME, 'move'));
  const gameRef = useRef(game);
  const setGame = (g: GmGame) => { gameRef.current = g; setGameState(g); };
  const mountAt = useRef(Date.now());
  const [results, setResults] = useState<Partial<Record<GmStep, StepResult>>>({});
  const totals = useRef({ runs: 0, edits: 0, helps: 0, closed: false });

  const log = (type: string, payload: Record<string, unknown>) => apiRef.current.log(type, payload);

  useEffect(() => {
    apiRef.current.did(activity);
    return () => {
      stopSpeaking();
      if (!totals.current.closed) log('probe_end', { probe: PROBE, reason: 'left', time_ms: Date.now() - mountAt.current, rules: compact(gameRef.current) });
      apiRef.current.level.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepEnded = (step: GmStep, r: StepResult) => {
    totals.current.runs += r.runs;
    totals.current.edits += r.edits;
    totals.current.helps = Math.max(totals.current.helps, r.help_levels);
    log('probe_phase', {
      probe: PROBE, phase: step, completed: r.completed, skipped: r.skipped, time_ms: r.time_ms, help_levels: r.help_levels,
      ghost_built: r.ghost_built, runs: r.runs, edits: r.edits, ...(r.free ?? {}),
    });
    setResults((x) => ({ ...x, [step]: r }));
    if (step === 'free') { setStage('liked'); return; }
    const next = STEPS[STEPS.indexOf(step) + 1];
    setGame(enterStep(gameRef.current, next));
    setStage(next);
  };

  const finish = () => {
    const c = totals.current;
    c.closed = true;
    const built = STEPS.filter((s) => s !== 'free' && results[s]?.completed).length;
    log('probe_end', { probe: PROBE, reason: 'done', time_ms: Date.now() - mountAt.current, steps_completed: built, runs: c.runs, edits: c.edits, rules: compact(gameRef.current) });
    const lv = apiRef.current.level.current;
    levelEnded({
      level_id: LEVEL_ID, activity, outcome: built >= 5 ? 'win' : 'fail', time_ms: Date.now() - mountAt.current,
      attempts: c.runs, help_levels: c.helps, blocks_optimal: 0, adult_helped: !!lv?.adultHelped,
    });
    done();
  };

  // screenshots and checks (?debug only)
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __gm: unknown }).__gm = {
      stage: () => stage,
      results: () => results,
      /** A step with every step before it built the canonical way (or the liking question). */
      go: (s: Stage) => { if ((STEPS as readonly string[]).includes(s)) setGame(prepared(s as GmStep)); setStage(s); },
      game: () => gameRef.current,
      setGame: (g: GmGame) => setGame(cloneGame(g)),
    };
  });

  if (stage === 'liked') return <Liked done={() => setStage('cheer')} />;
  if (stage === 'cheer') return <Cheer line="¡Muy bien!" say={GM_SAY.cheer} done={finish} />;
  return <Workshop key={stage} step={stage} game={game} gameRef={gameRef} setGame={setGame} onDone={stepEnded} passed={STEPS.map((s) => !!results[s])} />;
}

// ================================================================== the workshop: palette | notebook | board

interface RunSummary { result: 'win' | 'lose' | 'stopped'; keys: number; duration_ms: number; score: number; lives: number; heard: number }

interface BoardCtl {
  start(): void;
  stop(): void;
  press(d: Dir): void;
  running(): boolean;
  state(): GmState;
  addSprite(id: SpriteId): void;
  cheer(): void;
}

function Workshop({ step, game, gameRef, setGame, onDone, passed }: {
  step: GmStep; game: GmGame; gameRef: MutableRefObject<GmGame>; setGame(g: GmGame): void;
  onDone(step: GmStep, r: StepResult): void;
  /** The steps already behind (the bar's stones). */
  passed: boolean[];
}) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const player = usePlayer();
  const meName = CHARACTER_NAME[player.def.id as CharacterId] ?? 'Brote';
  const def = STEP_DEFS[step];
  const times = useMemo(() => timesFrom(window.location.search), []);
  const rootRef = useRef<HTMLElement>(null);
  const board = useRef<BoardCtl | null>(null);
  // the seed's step opens on the stone's cards (the child's own): the seed's are seen by tapping it
  const [sel, setSelState] = useState<ObjId>(step === 'seed_read' ? 'stone' : def.obj);
  const selRef = useRef(sel);
  const setSel = (o: ObjId) => { selRef.current = o; setSelState(o); };
  const [active, setActive] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [doneNow, setDoneNow] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [canFinish, setCanFinish] = useState(false);
  const [demoing, setDemoing] = useState(false);
  const [pulsePlay, setPulsePlay] = useState(0);
  const demoRef = useRef(false);
  const flags = useRef<StepFlags>(noFlags());
  const doneRef = useRef(false);
  const said = useRef({ oneWay: false, stuck: false, noRule: false });
  const track = useRef({ startedAt: Date.now(), runs: 0, edits: 0, helps: 0, ghostBuilt: false, adds: 0, cardsAdded: 0, usedSend: false, skipped: false });
  const ghostRun = useRef<GhostRun | null>(null);
  const turned = useRef(false);
  const [shake, setShake] = useState<{ key: string; n: number } | null>(null);
  const editable = editableIn(step, sel);

  const log = (type: string, payload: Record<string, unknown>) => apiRef.current.log(type, payload);

  /** The page turns: the step's record goes up (once). */
  const turn = () => {
    if (turned.current) return;
    turned.current = true;
    board.current?.stop();
    const t = track.current;
    onDone(step, {
      completed: doneRef.current, skipped: t.skipped, time_ms: Date.now() - t.startedAt, help_levels: t.helps, ghost_built: t.ghostBuilt,
      runs: t.runs, edits: t.edits, ...(step === 'free' ? { free: { adds: t.adds, cards_added: t.cardsAdded, used_send: t.usedSend } } : {}),
    });
  };
  const turnRef = useRef(turn);
  turnRef.current = turn;

  const succeed = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setDoneNow(true);
    setCanSkip(false);
    board.current?.cheer();
    // the win step: "¡Ganaste!" first, then the step's line
    window.setTimeout(() => speak(doneLine(step, meName, flags.current)), step === 'win' ? 1500 : 250);
    window.setTimeout(() => turnRef.current(), times.autoTurnMs + (step === 'win' ? 1500 : 0));
    apiRef.current.lowerHand('self');
  };

  // entry: the step's line, the adult's level record, the timers
  useEffect(() => {
    apiRef.current.level.current = { id: LEVEL_ID, helpStep: 0, adultHelped: apiRef.current.level.current?.adultHelped ?? false };
    const off = speakWhenAllowed(stepLine(step, meName));
    const timers: number[] = [];
    if (step === 'free') {
      timers.push(window.setTimeout(() => setCanFinish(true), times.freeNextMs));
      timers.push(window.setTimeout(() => turnRef.current(), times.freeMaxMs));
    } else {
      timers.push(window.setTimeout(() => { if (!doneRef.current) setCanSkip(true); }, times.skipMs));
    }
    // the seed falls on its own: the board plays by itself
    if (step === 'seed_read') timers.push(window.setTimeout(() => board.current?.start(), 700));
    // the first time, the ghost hand shows the gesture once if nothing happens (not a help: nothing is built)
    const intro = (ms: number, steps: DemoStep[], idle: () => boolean) => timers.push(window.setTimeout(() => {
      if (!idle() || demoRef.current || track.current.helps > 0 || !rootRef.current) return;
      ghostRun.current = playGhost(rootRef.current, steps);
      log('ghost_demo', { level_id: LEVEL_ID, kind: 'intro', phase: step });
    }, ms));
    if (step === 'move') intro(9000, [{ do: 'drag', from: '.gm-palette [data-block="key:right"]', to: '.gm-notebook .gm-sheet' }], () => track.current.edits === 0);
    if (step === 'seed_read') intro(6500, [{ do: 'point', at: ['.gm-tab[data-obj="seed"]'] }, { do: 'wait', ms: 700 }], () => !flags.current.read);
    // the next step: a hand nobody answered goes down (the child moved on)
    return () => { off(); timers.forEach(clearTimeout); ghostRun.current?.cancel(); board.current?.stop(); apiRef.current.lowerHand('moved_on'); };
    // once per step
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- editing
  const flash = (key: string) => setShake((s) => ({ key, n: (s?.n ?? 0) + 1 }));

  const apply = (res: EditResult, obj: ObjId, o: { filled?: boolean } = {}): boolean => {
    if ('refused' in res) {
      if (res.rule != null && res.rule >= 0) flash(`${obj}:${res.rule}`);
      else flash(`tab:${obj}`);
      return false;
    }
    setGame(res.game);
    const e = res.edit;
    // the ghost hand's own edits (help's third step, a skipped step) are logged apart and never count as the child's
    const ghost = demoRef.current || !!o.filled;
    log('rule_edit', {
      probe: PROBE, phase: step, object: e.object, hat: e.hat || null, action: e.action, op: e.op,
      ...(e.from ? { from: e.from, to: e.to } : {}), rules: ruleCount(res.game), running: board.current?.running() ?? false,
      ...(ghost ? { ghost: true } : {}), ...(o.filled ? { filled: true } : {}),
    });
    if (!ghost) {
      const t = track.current;
      t.edits++;
      if (e.op === 'add') { t.adds++; if (e.action == null && e.hat) t.cardsAdded++; }
      if ((e.op === 'add' || e.op === 'change') && e.action?.startsWith('send:')) t.usedSend = true;
      if (!board.current?.running()) setPulsePlay((n) => n + 1);
    }
    if (res.rule >= 0) setActive(res.rule);
    return true;
  };

  const tapPalette = (id: string) => {
    if (!editable || demoRef.current) return;
    const g = gameRef.current;
    const obj = selRef.current;
    if (isGmHat(id)) { apply(addRule(g, obj, id), obj); return; }
    const o = objectOf(g, obj);
    const n = o?.rules.length ?? 0;
    const target = active != null && active < n ? active : n - 1;
    if (target < 0) { speak(GM_SAY.orphan); flash('hats'); return; }
    apply(addAction(g, obj, target, id), obj);
  };
  const dropOn = (id: string, card: number | null, overNotebook: boolean) => {
    if (!editable || !overNotebook) return;
    const g = gameRef.current;
    const obj = selRef.current;
    if (isGmHat(id)) { apply(addRule(g, obj, id), obj); return; }
    if (card == null) {
      // dropped on the notebook but not on a card: the active (or the only) card takes it
      const n = objectOf(g, obj)?.rules.length ?? 0;
      const target = active != null && active < n ? active : n === 1 ? 0 : -1;
      if (target < 0) { speak(GM_SAY.orphan); flash('hats'); return; }
      apply(addAction(g, obj, target, id), obj);
      return;
    }
    apply(addAction(g, obj, card, id), obj);
  };
  const removeAt = (rule: number, action: number | null) => {
    if (!editable || demoRef.current) return;
    if (apply(removeBlock(gameRef.current, selRef.current, rule, action), selRef.current) && action == null) setActive(null);
  };
  const chip = (rule: number, action: number | null) => {
    if (!editable || demoRef.current) return;
    apply(changeChip(gameRef.current, selRef.current, rule, action), selRef.current);
  };
  /** `byGhost`: the help's own step (the ghost hand is working, which otherwise blocks the child's taps). */
  const addBird = (byGhost = false) => {
    if (step !== 'free' || (demoRef.current && !byGhost)) return;
    if (apply(addObject(gameRef.current, 'bird'), 'bird')) {
      setSel('bird');
      setActive(null);
      board.current?.addSprite('bird');
    }
  };
  const select = (id: ObjId) => {
    setSel(id);
    setActive(null);
    if (step === 'seed_read' && id === 'seed' && !flags.current.read) {
      flags.current = { ...flags.current, read: true };
      succeed();
    }
  };

  // ---------------------------------------------------------------- the game
  const onRunStart = () => { track.current.runs++; };
  const onRunEnd = (r: RunSummary) => {
    const g = gameRef.current;
    const end = endings(g);
    log('game_run', {
      probe: PROBE, phase: step, result: r.result, duration_ms: r.duration_ms, score: r.score, lives: r.lives, keys: r.keys,
      rules: compact(g), rule_count: ruleCount(g), objects: presentOf(g), broadcasts: broadcasts(g), messages_heard: r.heard,
      win_points: end.win_points, lose_lives: end.lose_lives,
    });
  };
  const onTick = (prev: GmState, events: GmEvent[]) => {
    const f = observe(step, flags.current, prev, events, gameRef.current);
    flags.current = f;
    if (doneRef.current) return;
    if (stepDone(step, f)) { succeed(); return; }
    if (step === 'move' && f.movedLeft !== f.movedRight && !said.current.oneWay) { said.current.oneWay = true; speak(GM_SAY.oneWay); }
    if (step === 'stone' && f.stoneStuck && !said.current.stuck) { said.current.stuck = true; speak(GM_SAY.stuck); }
  };
  const onShrug = () => {
    if (step === 'move' && !said.current.noRule && !doneRef.current) { said.current.noRule = true; speak(GM_SAY.noRule(meName)); }
  };
  const onFire = (obj: ObjId, rule: number) => {
    if (obj !== selRef.current || REDUCED) return;
    const card = rootRef.current?.querySelector(`.gm-card[data-card="${obj}:${rule}"]`);
    card?.querySelector('.gm-card-ring')?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
    card?.querySelector('.hat-ear')?.animate([{ rotate: '0deg' }, { rotate: '-16deg', offset: 0.2 }, { rotate: '12deg', offset: 0.45 }, { rotate: '0deg' }], { duration: 500, easing: 'ease-out' });
  };

  // ---------------------------------------------------------------- 🔊 and ✋
  const line = stepLine(step, meName);
  const onSpeak = () => {
    apiRef.current.log('speak', { level_id: LEVEL_ID, phase: step });
    speak(line);
  };

  const demo = (steps: DemoStep[], kind: string, pace?: number) => {
    const root = rootRef.current;
    if (!root) return;
    ghostRun.current?.cancel();
    demoRef.current = true;
    setDemoing(true);
    ghostRun.current = playGhost(root, steps, { pace });
    log('ghost_demo', { level_id: LEVEL_ID, kind, phase: step });
    const run = ghostRun.current;
    void run.done.then(() => { demoRef.current = false; setDemoing(false); });
    return run;
  };

  const blockAt = (id: string) => `.gm-palette [data-block="${id}"]`;
  /** Where the next missing block goes: its card, or the notebook for a new card. */
  const dropAt = (e: MissingEdit) => {
    if (e.kind === 'hat') return '.gm-notebook .gm-sheet';
    const i = objectOf(gameRef.current, e.obj)?.rules.findIndex((r) => r.hat === e.hat) ?? -1;
    return i >= 0 ? `.gm-card[data-card="${e.obj}:${i}"]` : '.gm-notebook .gm-sheet';
  };
  const firstMissing = () => missingEdits(gameRef.current, step)[0] ?? null;

  /** Help's third step: the step's rules, built for real by the ghost hand (logged as ghost). */
  const build = () => {
    if (step === 'seed_read') { demo([{ do: 'tap', at: '.gm-tab[data-obj="seed"]', apply: () => select('seed') }], 'rule'); track.current.ghostBuilt = true; return; }
    if (step === 'free') {
      const steps: DemoStep[] = [];
      if (!objectOf(gameRef.current, 'bird')) steps.push({ do: 'tap', at: '.gm-tab[data-obj="add-bird"]', apply: () => addBird(true) });
      else steps.push({ do: 'tap', at: '.gm-tab[data-obj="bird"]', apply: () => select('bird') });
      const add = (hat: string, action: string) => {
        steps.push({ do: 'tap', at: blockAt(hat), apply: () => { apply(addRule(gameRef.current, 'bird', hat), 'bird'); } });
        steps.push({ do: 'tap', at: blockAt(action), apply: () => {
          const i = objectOf(gameRef.current, 'bird')?.rules.findIndex((r) => r.hat === hat) ?? -1;
          if (i >= 0) apply(addAction(gameRef.current, 'bird', i, action), 'bird');
        } });
      };
      if (!objectOf(gameRef.current, 'bird')?.rules.some((r) => r.hat === 'tick')) add('tick', 'move:right');
      track.current.ghostBuilt = true;
      demo(steps, 'rule', 0.9);
      return;
    }
    const todo = missingEdits(gameRef.current, step);
    if (!todo.length) {
      // the rules are there: show how to try them
      demo([{ do: 'tap', at: '.gm-root .btn-play', apply: () => { if (!board.current?.running()) board.current?.start(); } }, { do: 'point', at: ['.gm-keypad'] }], 'hint');
      speak(GM_SAY.tryIt);
      return;
    }
    if (selRef.current !== def.obj) select(def.obj);
    track.current.ghostBuilt = true;
    const steps: DemoStep[] = [{ do: 'wait', ms: 250 }];
    for (const e of todo) {
      steps.push({ do: 'tap', at: blockAt(e.kind === 'hat' ? e.hat : e.action), apply: () => { apply(applyMissing(gameRef.current, e), e.obj); } });
      steps.push({ do: 'wait', ms: 250 });
    }
    // built: now the child tries it
    void demo(steps, 'rule', 0.9)?.done.then(() => { if (!doneRef.current && !turned.current) speak(step === 'move' ? GM_SAY.tryKeys : GM_SAY.tryIt); });
  };

  const onHelp = () => {
    const a = apiRef.current;
    if (demoRef.current) return;
    if (track.current.helps >= 3) { a.raiseHand('help_step_3'); return; }
    const n = ++track.current.helps;
    if (a.level.current) a.level.current.helpStep = n;
    a.log('help', { level_id: LEVEL_ID, step: n, phase: step });
    const miss = firstMissing();
    if (n === 1) {
      speak(line);
      const at = step === 'seed_read' ? '.gm-tab[data-obj="seed"]' : step === 'free' ? '.gm-palette' : miss ? blockAt(miss.kind === 'hat' ? miss.hat : miss.action) : '.gm-root .btn-play';
      if (selRef.current !== def.obj && step !== 'free') select(def.obj);
      window.setTimeout(() => rootRef.current?.querySelector(at)?.animate([{ scale: '1' }, { scale: '1.1' }, { scale: '1' }, { scale: '1.1' }, { scale: '1' }], { duration: 1100 }), 80);
      return;
    }
    if (n === 2) {
      if (step === 'seed_read') demo([{ do: 'point', at: ['.gm-tab[data-obj="seed"]', '.gm-sprite[data-sprite="seed"]'] }], 'hint');
      else if (step === 'free') demo([{ do: 'point', at: ['.gm-tab[data-obj="add-bird"]', '.gm-palette'] }], 'hint');
      else if (miss) {
        if (selRef.current !== def.obj) select(def.obj);
        demo([{ do: 'wait', ms: 250 }, { do: 'drag', from: blockAt(miss.kind === 'hat' ? miss.hat : miss.action), to: dropAt(miss) }], 'hint');
      } else demo([{ do: 'point', at: ['.gm-root .btn-play', '.gm-keypad'] }], 'hint');
      return;
    }
    build();
  };

  /** "Seguir" after a while: the step's rules are left built (so the next step works), the page turns. */
  const skip = () => {
    if (turned.current || doneRef.current) return;
    ghostRun.current?.cancel();
    demoRef.current = false;
    track.current.skipped = true;
    for (const e of missingEdits(gameRef.current, step)) apply(applyMissing(gameRef.current, e), e.obj, { filled: true });
    speak(GM_SAY.skip);
    window.setTimeout(() => turnRef.current(), 900);
  };

  // keys: the arrows play the game (a press while stopped starts it)
  useEffect(() => {
    const map: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    const on = (e: KeyboardEvent) => {
      const d = map[e.key];
      if (!d) return;
      e.preventDefault();
      if (!e.repeat) pressKey(d);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pressKey = (d: Dir) => {
    rootRef.current?.querySelector(`.key-btn[data-dir="${d}"]`)?.animate([{ translate: '0 0' }, { translate: '0 4px' }, { translate: '0 0' }], { duration: 160 });
    if (!board.current) return;
    if (!board.current.running()) board.current.start();
    board.current.press(d);
  };

  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __gmw: unknown }).__gmw = {
      step, select, tapPalette, chip, removeAt, addBird, help: onHelp, skip, turn,
      start: () => board.current?.start(), stop: () => board.current?.stop(), press: pressKey, state: () => board.current?.state(),
      flags: () => flags.current, done: () => doneRef.current, track: () => track.current,
    };
  });

  const keys = useMemo(() => { const k = keysOf(game); return DIRS.filter((d) => k.includes(d) || d === 'left' || d === 'right'); }, [game]);
  const at = STEPS.indexOf(step);
  const hud = { points: at >= STEPS.indexOf('touch_rules'), trophy: !!objectOf(game, 'game') };

  const progress = { kind: 'dots' as const, done: STEPS.map((s, i) => passed[i] || (s === step && doneNow)), here: at };

  return (
    <BarProgressContext.Provider value={progress}>
    <main ref={rootRef} className={`level mode-realtime mode-gm gm-root is-${step}${editable ? '' : ' is-readonly'}${demoing ? ' is-demo' : ''}${doneNow ? ' is-done' : ''}`} data-phase={step}>
      <Bar
        instruction={<span className="drawn-task" aria-hidden="true"><StepIcon step={step} size={70} /></span>}
        title={<><b>Hacé tu juego</b>Hacé tu juego · {STEP_NAME[step]}</>}
        pages={<BarProgressView />}
        onSpeak={onSpeak}
        onHelp={onHelp}
      />
      {canSkip && !doneNow && <GoOn onClick={skip} />}
      <Palette step={step} obj={sel} enabled={editable} onTap={tapPalette} onDrop={dropOn} shake={shake} back={editable || def.palette == null ? null : def.obj} onBack={() => select(def.obj)} />
      <Notebook
        step={step} done={doneNow} game={game} sel={sel} active={active} editable={editable} meName={meName} shake={shake} cue={step === 'seed_read' && !doneNow ? 'seed' : null}
        onSelect={select} onAddBird={() => addBird()} onTapHat={(i) => setActive((a) => (a === i ? null : i))}
        onRemove={removeAt} onChip={chip}
      />
      <section className="level-stage gm-stage" aria-label="Tablero">
        <div className="controls">
          <button
            key={pulsePlay} type="button" className={`btn btn-play cut${running ? ' is-running' : ''}${pulsePlay && !running ? ' is-nudge' : ''}`}
            onClick={() => (board.current?.running() ? board.current.stop() : board.current?.start())} aria-label={running ? 'Parar' : 'Probar'}
          >
            {running ? <><StopIcon /><span>Parar</span></> : <><PlayIcon /><span>Probar</span></>}
          </button>
          <RestartButton onClick={() => board.current?.stop()} />
          <div className="keypad gm-keypad" aria-label="Flechas del teclado" data-n={keys.length}>
            {keys.map((d) => (
              <button key={d} type="button" className={`key-btn key-${d}`} data-dir={d} aria-label={`Flecha ${d}`} onPointerDown={(e) => { e.preventDefault(); pressKey(d); }}>
                <KeyCap dir={d} size={50} />
              </button>
            ))}
          </div>
          {(doneNow || canFinish) && (
            <button type="button" className="next-page cut pop-in gm-next" aria-label="Seguir" onClick={() => turnRef.current()}>
              <NextPageArt />
            </button>
          )}
        </div>
        <GmBoard
          ctl={board} gameRef={gameRef} game={game} sel={sel} hud={hud} onSelect={select}
          onRunning={setRunning} onRunStart={onRunStart} onRunEnd={onRunEnd} onFire={onFire} onTick={onTick} onShrug={onShrug}
        />
      </section>
    </main>
    </BarProgressContext.Provider>
  );
}

/** "Seguir" in the bar before ✋ (never over the board): the step is left for later. */
function GoOn({ onClick }: { onClick: () => void }) {
  const bar = useBar();
  if (!bar) return null;
  return createPortal(<button type="button" className="pp-go-on cut pop-in gm-skip" aria-label="Seguir" onClick={onClick}><GoOnArt /></button>, bar);
}

// ================================================================== the palette

interface DragState { id: string; from: 'palette' | { rule: number; action: number | null }; x0: number; y0: number; pid: number; on: boolean; x: number; y: number }

/** Drag with the finger or tap: the same gesture set as 3ro's cards (a drag past 8 px becomes a drag). */
function useDrag(onEnd: (d: DragState, x: number, y: number) => void, onTap: (d: DragState) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const ref = useRef<DragState | null>(null);
  const cb = useRef({ onEnd, onTap });
  cb.current = { onEnd, onTap };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = ref.current;
      if (!d || e.pointerId !== d.pid) return;
      if (!d.on && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return;
      d.on = true; d.x = e.clientX; d.y = e.clientY;
      setDrag({ ...d });
    };
    const up = (e: PointerEvent) => {
      const d = ref.current;
      if (!d || e.pointerId !== d.pid) return;
      ref.current = null;
      setDrag(null);
      if (d.on) cb.current.onEnd(d, e.clientX, e.clientY); else cb.current.onTap(d);
    };
    const cancel = () => { ref.current = null; setDrag(null); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); };
  }, []);
  const down = (id: string, from: DragState['from']) => (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    ref.current = { id, from, x0: e.clientX, y0: e.clientY, pid: e.pointerId, on: false, x: e.clientX, y: e.clientY };
  };
  return { drag, down };
}

/** Where a release lands: over the notebook, and which card. */
function dropTarget(x: number, y: number): { over: boolean; card: number | null } {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const card = el?.closest<HTMLElement>('.gm-card');
  const nb = document.querySelector('.gm-notebook')?.getBoundingClientRect();
  const over = !!nb && x > nb.left - 20 && x < nb.right + 20 && y > nb.top - 20 && y < nb.bottom + 20;
  return { over, card: card ? Number(card.dataset.card!.split(':')[1]) : null };
}

function DragGhost({ d }: { d: DragState }) {
  const hat = isGmHat(d.id);
  return createPortal(
    <div className="blk-ghost gm-ghost" style={{ width: hat ? HAT_W : ACT_W, height: hat ? HAT_H : ACT_H, transform: `translate(${d.x - 30}px, ${d.y - 20}px)` }} aria-hidden="true">
      <div className="blk-ghost-in gm-blk"><GmBlockArt id={d.id} hat={hat} /></div>
    </div>,
    document.body,
  );
}

function Palette({ step, obj, enabled, onTap, onDrop, shake, back, onBack }: {
  step: GmStep; obj: ObjId; enabled: boolean; onTap(id: string): void; onDrop(id: string, card: number | null, over: boolean): void;
  shake: { key: string; n: number } | null; back: ObjId | null; onBack(): void;
}) {
  const { hats, actions } = stepPalette(step, obj);
  const ref = useRef<HTMLElement>(null);
  const { drag, down } = useDrag(
    (d, x, y) => { const t = dropTarget(x, y); onDrop(d.id, t.card, t.over); },
    (d) => onTap(d.id),
  );
  useLayoutEffect(() => {
    if (shake?.key !== 'hats' || REDUCED) return;
    ref.current?.querySelectorAll('.gm-blk.is-hat').forEach((el) => el.animate([{ rotate: '0deg' }, { rotate: '-4deg' }, { rotate: '3deg' }, { rotate: '0deg' }], { duration: 500 }));
  }, [shake]);
  const item = (id: string, hat: boolean) => (
    <button
      key={id} type="button" className={`gm-blk gm-pblk${hat ? ' is-hat' : ''}`} data-block={id} disabled={!enabled}
      style={{ width: hat ? HAT_W : ACT_W, height: hat ? HAT_H : ACT_H }}
      aria-label={`Bloque ${id}`}
      onPointerDown={enabled ? down(id, 'palette') : undefined}
    >
      <GmBlockArt id={id} hat={hat} />
    </button>
  );
  const few = hats.length + actions.length <= 4;
  return (
    <section ref={ref} className={`zone zone-palette gm-palette${few ? ' is-few' : ''}`} data-zone="palette" data-obj={obj} aria-label="Bloques">
      <div className="gm-palette-in">
        {hats.map((h) => item(h, true))}
        {hats.length > 0 && actions.length > 0 && <span className="palette-rule" aria-hidden="true" />}
        {actions.map((a) => item(a, false))}
        {/* looking at another object's cards in a step: its blocks are elsewhere; this goes back to the step's object */}
        {back && (
          <button type="button" className="gm-back cut" data-back={back} aria-label="Volver" onClick={onBack}>
            <ObjIcon id={back} size={52} />
            <svg className="gm-back-arrow" viewBox="0 0 40 24" aria-hidden="true"><path d="M36,12 L6,12 M14,4 L5,12 L14,20" fill="none" stroke="#3d6ea5" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
      </div>
      {drag?.on && <DragGhost d={drag} />}
    </section>
  );
}

// ================================================================== the notebook: the step's note, the tabs, one object's cards

function Notebook({ step, done, game, sel, active, editable, meName, shake, cue, onSelect, onAddBird, onTapHat, onRemove, onChip }: {
  step: GmStep; done: boolean; game: GmGame; sel: ObjId; active: number | null; editable: boolean; meName: string; shake: { key: string; n: number } | null; cue: ObjId | null;
  onSelect(id: ObjId): void; onAddBird(): void; onTapHat(i: number): void; onRemove(rule: number, action: number | null): void; onChip(rule: number, action: number | null): void;
}) {
  const ref = useRef<HTMLElement>(null);
  const obj = objectOf(game, sel) ?? game[0];
  const { drag, down } = useDrag(
    (d, x, y) => {
      if (d.from === 'palette') return;
      const t = dropTarget(x, y);
      if (!t.over) onRemove(d.from.rule, d.from.action);
    },
    (d) => {
      if (d.from === 'palette') return;
      if (d.from.action == null) onTapHat(d.from.rule);
      else onRemove(d.from.rule, d.from.action);
    },
  );
  useLayoutEffect(() => {
    if (!shake || REDUCED) return;
    const el = ref.current?.querySelector(shake.key.startsWith('tab:') ? `.gm-tab[data-obj="${shake.key.slice(4)}"]` : `.gm-card[data-card="${shake.key}"]`);
    el?.animate([{ translate: '0 0' }, { translate: '6px 0' }, { translate: '-6px 0' }, { translate: '0 0' }], { duration: 260 });
  }, [shake]);
  const hasBird = !!objectOf(game, 'bird');
  const name = (id: ObjId) => (id === 'me' ? meName : OBJ_NAME[id]);
  const lifted = drag?.on && drag.from !== 'palette' ? drag.from : null;
  const goal = stepGoal(step, meName);
  // a card the step still needs: a dashed hat where it goes
  const needsCard = editable && step !== 'free' && missingEdits(game, step).some((e) => e.kind === 'hat');
  // the card being filled stays in view (the notebook scrolls)
  useEffect(() => {
    if (active == null) return;
    ref.current?.querySelector(`.gm-card[data-card="${sel}:${active}"]`)?.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' });
  }, [active, sel, obj.rules.length]);

  return (
    <section ref={ref} className="zone zone-program gm-notebook" data-zone="program" aria-label="Tus reglas">
      <div className={`gm-goal sheet${done ? ' is-done' : ''}`} data-step={step}>
        <span className="tape tape-l" aria-hidden="true" />
        <span className="gm-goal-n" aria-hidden="true">{STEPS.indexOf(step) + 1}</span>
        <StepIcon step={step} size={58} />
        <p className="gm-goal-t">{goal.map((l, i) => <span key={i}>{l}</span>)}</p>
        {done && <svg className="gm-goal-check" viewBox="0 0 40 34" aria-hidden="true"><path d="M5,18 L15,28 L36,4" fill="none" stroke="#3d6ea5" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </div>
      <div className="gm-tabs" role="tablist">
        {game.map((o) => (
          <button key={o.id} type="button" role="tab" aria-selected={o.id === sel} className={`gm-tab cut${o.id === sel ? ' is-on' : ''}${cue === o.id ? ' is-cue' : ''}`} data-obj={o.id} onClick={() => onSelect(o.id)}>
            <ObjIcon id={o.id} size={34} />
            <span className="gm-tab-name">{name(o.id)}</span>
            {o.id === sel && <PenRing seed={o.id.length + 2} />}
          </button>
        ))}
        {!hasBird && step === 'free' && (
          <button type="button" className="gm-tab gm-tab-add cut" data-obj="add-bird" aria-label="Sumar el pájaro" onClick={onAddBird}>
            <span className="gm-add-plus" aria-hidden="true">+</span>
            <ObjIcon id="bird" size={30} />
            <span className="gm-tab-name">pájaro</span>
          </button>
        )}
      </div>
      <div className="gm-sheet">
        {obj.rules.length === 0 && editable && (
          <div className="gm-slot is-hat" aria-hidden="true" style={{ width: HAT_W, height: HAT_H }} />
        )}
        {obj.rules.map((r, i) => (
          <div key={`${r.hat}#${i}`} className={`gm-card${active === i && editable ? ' is-active' : ''}${lifted && lifted.rule === i && lifted.action == null ? ' is-lifted' : ''}`} data-card={`${sel}:${i}`}>
            <svg className="gm-card-ring" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={penLoop(50, 50, 47, 46, { seed: i + 3 })} vectorEffect="non-scaling-stroke" /></svg>
            <div
              className="gm-blk gm-hat is-hat" role="button" tabIndex={0} style={{ width: HAT_W, height: HAT_H }}
              onPointerDown={editable ? down(r.hat, { rule: i, action: null }) : undefined}
              aria-label={`Regla ${r.hat}`}
            >
              <GmBlockArt id={r.hat} hat chip={editable ? { at: `${sel}:${i}:h`, onChip: () => onChip(i, null) } : {}} />
            </div>
            {r.actions.map((a, j) => (
              <div
                key={`${a}#${j}`} className={`gm-blk gm-act${lifted && lifted.rule === i && lifted.action === j ? ' is-lifted' : ''}`} role="button" tabIndex={0}
                style={{ width: ACT_W, height: ACT_H }}
                onPointerDown={editable ? down(a, { rule: i, action: j }) : undefined}
                aria-label={`Bloque ${a}`}
              >
                <GmBlockArt id={a} hat={false} chip={editable ? { at: `${sel}:${i}:${j}`, onChip: () => onChip(i, j) } : {}} />
              </div>
            ))}
            {editable && (active === i || r.actions.length === 0) && r.actions.length < 4 && <div className="gm-slot" aria-hidden="true" />}
          </div>
        ))}
        {needsCard && obj.rules.length > 0 && (
          <div className="gm-slot is-hat is-next" aria-hidden="true" style={{ width: HAT_W, height: HAT_H }} />
        )}
      </div>
      {drag?.on && drag.from !== 'palette' && <DragGhost d={drag} />}
    </section>
  );
}

// ================================================================== the board

const CELL = 64;
const BX = 12, BY = 14;
const BW = GM_COLS * CELL, BH = GM_ROWS * CELL;
const HUD_X = BX + BW + 58;
const VIEW = { w: BX + BW + 112, h: BY + BH + 26 };
const cellCenter = (c: number, r: number) => ({ x: BX + c * CELL + CELL / 2, y: BY + r * CELL + CELL / 2 + 2 });
const TROPHY_AT = { x: HUD_X, y: BY + 36 };
const ME_BOX = { x: -58, y: -118, w: 116, h: 128 };

interface Flight { id: number; msg: MsgId; from: { x: number; y: number }; to: { x: number; y: number } }
interface Pop { id: number; x: number; y: number; text: string; bad: boolean }

function GmBoard({ ctl, gameRef, game, sel, hud, onSelect, onRunning, onRunStart, onRunEnd, onFire, onTick, onShrug }: {
  ctl: MutableRefObject<BoardCtl | null>; gameRef: MutableRefObject<GmGame>; game: GmGame; sel: ObjId; hud: { points: boolean; trophy: boolean }; onSelect(id: ObjId): void;
  onRunning(on: boolean): void; onRunStart(): void; onRunEnd(r: RunSummary): void; onFire(obj: ObjId, rule: number): void;
  onTick(prev: GmState, events: GmEvent[]): void; onShrug(): void;
}) {
  const player = usePlayer();
  const { ref: meRef, view } = useStage(player, ME_BOX, { shadow: true });
  const [sim, setSim] = useState<GmState>(() => gmInit(gameRef.current));
  const simRef = useRef(sim);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [over, setOver] = useState<'win' | 'lose' | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [pops, setPops] = useState<Pop[]>([]);
  const [bumps, setBumps] = useState({ score: 0, lives: 0 });
  const [shrugs, setShrugs] = useState(0);
  const pressed = useRef<Dir[]>([]);
  const run = useRef<{ at: number; keys: number } | null>(null);
  const senders = useRef<Partial<Record<MsgId, { x: number; y: number }>>>({});
  const nextId = useRef(1);
  const prevPos = useRef<Record<string, { c: number; r: number }>>({});
  const cb = useRef({ onRunning, onRunStart, onRunEnd, onFire, onTick, onShrug });
  cb.current = { onRunning, onRunStart, onRunEnd, onFire, onTick, onShrug };

  const posOf = (s: GmState, obj: ObjId) => {
    if (obj === 'game') return TROPHY_AT;
    const sp = s.sprites[obj];
    return sp ? cellCenter(sp.c, sp.r) : TROPHY_AT;
  };

  const setRun = (on: boolean) => { runningRef.current = on; setRunning(on); cb.current.onRunning(on); };

  const endRun = (result: RunSummary['result']) => {
    const r = run.current;
    run.current = null;
    if (!r) return;
    const s = simRef.current;
    cb.current.onRunEnd({ result, keys: r.keys, duration_ms: Date.now() - r.at, score: s.score, lives: s.lives, heard: s.heard });
  };

  const reset = () => {
    const s = gmInit(gameRef.current);
    simRef.current = s;
    setSim(s);
    setFlights([]);
    setPops([]);
  };

  const pop = (s: GmState, text: string, bad: boolean) => {
    const me = s.sprites.me;
    if (!me) return;
    const id = nextId.current++;
    const { x, y } = cellCenter(me.c, me.r);
    setPops((p) => [...p, { id, x, y: y - 70, text, bad }]);
    window.setTimeout(() => setPops((p) => p.filter((q) => q.id !== id)), 900);
  };

  const onEvent = (e: GmEvent, s: GmState) => {
    switch (e.t) {
      case 'fire': cb.current.onFire(e.obj, e.rule); break;
      case 'shrug': setShrugs((n) => n + 1); cb.current.onShrug(); break;
      case 'score':
        setBumps((b) => ({ ...b, score: b.score + 1 }));
        if (e.delta) pop(s, e.delta > 0 ? `+${e.delta}` : `${e.delta}`, e.delta < 0);
        break;
      case 'lives':
        setBumps((b) => ({ ...b, lives: b.lives + 1 }));
        if (e.delta < 0) { void view.current?.wince(); pop(s, '−1', true); }
        break;
      case 'send': senders.current[e.msg] = posOf(s, e.obj); break;
      case 'recv': {
        const from = senders.current[e.msg] ?? TROPHY_AT;
        const id = nextId.current++;
        setFlights((f) => [...f, { id, msg: e.msg, from, to: posOf(s, e.obj) }]);
        window.setTimeout(() => setFlights((f) => f.filter((x) => x.id !== id)), 1100);
        break;
      }
      case 'end': void finish(e.result); break;
    }
  };

  const finish = async (result: 'win' | 'lose') => {
    endRun(result);
    setRun(false);
    setOver(result);
    speak(result === 'win' ? GM_SAY.won : GM_SAY.lost);
    if (result === 'win') await view.current?.cheer(true);
  };

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (!runningRef.current) return;
      const prev = simRef.current;
      const { state, events } = gmStep(gameRef.current, prev, pressed.current.splice(0));
      simRef.current = state;
      setSim(state);
      for (const e of events) onEvent(e, state);
      cb.current.onTick(prev, events);
    }, TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  ctl.current = {
    start() {
      if (runningRef.current) return;
      const s = gmInit(gameRef.current, (Date.now() % 9973) + 1);
      simRef.current = s;
      setSim(s);
      setOver(null);
      setFlights([]);
      setPops([]);
      pressed.current = [];
      senders.current = {};
      run.current = { at: Date.now(), keys: 0 };
      cb.current.onRunStart();
      setRun(true);
      view.current?.poke();
    },
    stop() {
      if (runningRef.current) endRun('stopped');
      setRun(false);
      setOver(null);
      reset();
    },
    press(d) {
      if (!runningRef.current) return;
      pressed.current.push(d);
      if (run.current && !document.querySelector('.gm-root.is-demo')) run.current.keys++;
    },
    running: () => runningRef.current,
    state: () => simRef.current,
    addSprite(id) {
      if (runningRef.current) {
        const s = { ...simRef.current, sprites: { ...simRef.current.sprites, [id]: gmInit([{ id, rules: [] }]).sprites[id] } };
        simRef.current = s;
        setSim(s);
      } else window.setTimeout(reset, 0);
    },
    cheer() { void view.current?.cheer(false); },
  };

  // the game changed while stopped (an object added, the game reset): the board shows its start
  useEffect(() => { if (!runningRef.current && !over) reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [game.length]);

  // unmount: a game still running ends as stopped
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (runningRef.current) endRun('stopped'); runningRef.current = false; }, []);

  const lives = Math.max(0, sim.lives);
  const sprites = (['seed', 'stone', 'bird', 'me'] as const).map((id) => sim.sprites[id]).filter((x): x is NonNullable<typeof x> => !!x);
  useEffect(() => { for (const sp of sprites) prevPos.current[sp.id] = { c: sp.c, r: sp.r }; });

  return (
    <div className={`sheet gm-sheet-board${running ? ' is-playing' : ''}`} data-zone="stage">
      <span className="tape tape-l" aria-hidden="true" />
      <span className="tape tape-r" aria-hidden="true" />
      <PlayLamp on={running} />
      <svg className="board gm-board" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="img" aria-label="El juego" data-score={sim.score} data-lives={sim.lives} data-over={over ?? ''}>
        <BoardFloor />
        {sprites.map((sp) => {
          const { x, y } = cellCenter(sp.c, sp.r);
          const prev = prevPos.current[sp.id];
          const jump = !!prev && Math.abs(prev.c - sp.c) + Math.abs(prev.r - sp.r) > 1;
          const style: CSSProperties = { transform: `translate(${x}px, ${y}px)`, transition: jump || REDUCED ? 'none' : `transform ${sp.id === 'me' ? 120 : 220}ms ease-out`, opacity: sp.visible ? 1 : 0.14 };
          return (
            <g key={sp.id} className={`gm-sprite is-${sp.id}${sel === sp.id ? ' is-sel' : ''}`} data-sprite={sp.id} data-c={sp.c} data-r={sp.r} style={style} onClick={() => onSelect(sp.id)}>
              {sel === sp.id && <ellipse className="gm-sel-ring" cx={0} cy={26} rx={28} ry={7} />}
              <rect x={-30} y={-30} width={60} height={60} fill="transparent" />
              {sp.id === 'me'
                ? <g key={`shrug-${shrugs}`} className={shrugs ? 'gm-shrug' : undefined}><svg ref={meRef} x={-46} y={-78} width={92} height={92 * 128 / 116} overflow="visible" /></g>
                : <g className="gm-pop-in" filter="url(#rough)">{sp.id === 'seed' ? <SeedArt /> : sp.id === 'stone' ? <StoneArt /> : <BirdArt dir={sp.dir === 'left' ? 'left' : 'right'} />}</g>}
            </g>
          );
        })}
        {sprites.filter((sp) => sp.say && sp.visible).map((sp) => {
          const { x, y } = cellCenter(sp.c, sp.r);
          return <SayBubble key={`say-${sp.id}`} text={SAY_WORD[sp.say!]} x={Math.min(BX + BW - 40, Math.max(BX + 40, x))} y={y - (sp.id === 'me' ? 34 : 14)} />;
        })}
        {pops.map((p) => <text key={p.id} className={`gm-pop${p.bad ? ' is-bad' : ''}`} x={p.x} y={p.y} textAnchor="middle">{p.text}</text>)}
        {/* the HUD: the whole game (its trophy), the points, the lives (from the step that brings them) */}
        {hud.trophy && (
          <g className={`gm-trophy gm-hud-in${sel === 'game' ? ' is-sel' : ''}`} transform={`translate(${TROPHY_AT.x} ${TROPHY_AT.y})`} onClick={() => onSelect('game')}>
            {sel === 'game' && <ellipse className="gm-sel-ring" cx={0} cy={28} rx={26} ry={6} />}
            <rect x={-30} y={-30} width={60} height={62} fill="transparent" />
            <g filter="url(#rough)"><TrophyArt /></g>
          </g>
        )}
        {hud.points && <>
          <g className="gm-hud-in" transform={`translate(${HUD_X} ${BY + 140})`} filter="url(#rough)"><ScoreJar n={sim.score} bump={bumps.score} /></g>
          <foreignObject x={HUD_X - 44} y={BY + 196} width={88} height={130}>
            <div className="gm-lives" data-lives={lives}>
              {Array.from({ length: Math.max(3, lives) }, (_, i) => <span key={`${i}-${i >= lives ? bumps.lives : 0}`} className={i >= lives ? 'is-gone' : ''}><HeartGlyph size={24} empty={i >= lives} /></span>)}
            </div>
          </foreignObject>
        </>}
        {flights.map((f) => <EnvelopeFlight key={f.id} f={f} />)}
      </svg>
      {over && <EndCard result={over} again={() => ctl.current?.start()} />}
    </div>
  );
}

function BoardFloor() {
  const lines: string[] = [];
  for (let c = 1; c < GM_COLS; c++) lines.push(`M${BX + c * CELL},${BY + 3} L${BX + c * CELL + (c % 2 ? 1 : -1)},${BY + BH - 3}`);
  for (let r = 1; r < GM_ROWS; r++) lines.push(`M${BX + 3},${BY + r * CELL} L${BX + BW - 3},${BY + r * CELL + (r % 2 ? 1 : -1)}`);
  return (
    <g className="gm-floor" filter="url(#rough)">
      <rect x={BX} y={BY} width={BW} height={BH} rx={3} fill="#f6efdf" stroke="#2b2622" strokeWidth={3} />
      <path d={lines.join(' ')} stroke="#2b2622" strokeWidth={1.6} opacity={0.3} fill="none" />
      <path d={`M${BX},${BY + BH + 2} L${BX + BW},${BY + BH + 2} L${BX + BW},${BY + BH + 12} L${BX},${BY + BH + 12} Z`} fill="#a4b86d" stroke="#2b2622" strokeWidth={2.4} strokeLinejoin="round" />
      {Array.from({ length: 12 }, (_, i) => { const x = BX + 18 + i * 37; return <path key={i} d={`M${x},${BY + BH + 3} l-3,-8 M${x + 5},${BY + BH + 3} l2,-9`} stroke="#7c8f47" strokeWidth={2} strokeLinecap="round" />; })}
    </g>
  );
}

function EnvelopeFlight({ f }: { f: Flight }) {
  const ref = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mx = (f.from.x + f.to.x) / 2, my = Math.min(f.from.y, f.to.y) - 70;
    el.animate([
      { transform: `translate(${f.from.x}px, ${f.from.y - 30}px) scale(0.4)`, opacity: 0 },
      { transform: `translate(${f.from.x}px, ${f.from.y - 40}px) scale(1)`, opacity: 1, offset: 0.2 },
      { transform: `translate(${mx}px, ${my}px) scale(1) rotate(-8deg)`, offset: 0.55 },
      { transform: `translate(${f.to.x}px, ${f.to.y - 30}px) scale(0.8)`, opacity: 1, offset: 0.9 },
      { transform: `translate(${f.to.x}px, ${f.to.y - 26}px) scale(0.5)`, opacity: 0 },
    ], { duration: REDUCED ? 200 : 1000, easing: 'ease-in-out', fill: 'forwards' });
  }, [f]);
  const mx = (f.from.x + f.to.x) / 2, my = Math.min(f.from.y, f.to.y) - 70;
  return (
    <g className="gm-flight">
      <path className="gm-flight-arc" d={`M${f.from.x},${f.from.y - 30} Q${mx},${my - 20} ${f.to.x},${f.to.y - 30}`} />
      <g ref={ref}><FlyingEnvelope msg={f.msg} /></g>
    </g>
  );
}

/** The end of a game, never a punishment: a win with stars, or the hearts filling again; "¡Otra vez!" plays again. */
function EndCard({ result, again }: { result: 'win' | 'lose'; again(): void }) {
  return (
    <div className={`gm-end is-${result}`} data-end={result}>
      <div className="sheet gm-end-card pop-in">
        <span className="tape tape-l" aria-hidden="true" />
        {result === 'win' ? <WinBurst /> : <HeartsAgain />}
        <p className="gm-end-t">{result === 'win' ? '¡Ganaste!' : '¡Se acabaron las vidas!'}</p>
        <button type="button" className="btn gm-again cut" onClick={again} aria-label="Otra vez"><RestartIcon /><span>¡Otra vez!</span></button>
      </div>
    </div>
  );
}

// ================================================================== did you like it?

const LIKED: { value: 'yes' | 'mid' | 'no'; word: string; mood: 'happy' | 'mid' | 'sad' }[] = [
  { value: 'yes', word: '¡Mucho!', mood: 'happy' },
  { value: 'mid', word: 'Más o menos.', mood: 'mid' },
  { value: 'no', word: 'No.', mood: 'sad' },
];

function Liked({ done }: { done(): void }) {
  const api = usePlaytest();
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(GM_SAY.liked); }, 350);
    return () => { clearTimeout(t); off(); };
  }, []);
  const answer = (o: typeof LIKED[number]) => {
    if (picked) return;
    setPicked(o.value);
    speak(o.word);
    api.log('survey_answer', { question: 'game_maker_liked', answer: o.value });
    setTimeout(done, 1100);
  };
  return (
    <main className="pp-page pp-survey gm-liked" data-question="game_maker_liked">
      <header className="pp-survey-bar level-bar cut">
        <button type="button" className="speak cut" aria-label="Escuchar otra vez" onClick={() => { api.log('speak', { level_id: LEVEL_ID, phase: 'liked' }); speak(GM_SAY.liked); }}><SpeakerIcon /></button>
        <span className="gm-liked-icon" aria-hidden="true"><ObjIcon id="game" size={44} /></span>
        <p className="pp-survey-adult">¿Te gustó hacer tu juego? (Hacé tu juego)</p>
      </header>
      <section className="sheet pp-card pp-options n3" aria-label="¿Te gustó hacer tu juego?">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        {LIKED.map((o, i) => (
          <button key={o.value} type="button" className={`pp-option cut${picked === o.value ? ' is-picked' : ''}${picked && picked !== o.value ? ' is-other' : ''}`} data-answer={o.value} aria-label={o.word} onClick={() => answer(o)}>
            <Face mood={o.mood} seed={i + 21} />
            {picked === o.value && <PenRing seed={i + 5} />}
          </button>
        ))}
      </section>
    </main>
  );
}
