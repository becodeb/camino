// "Hacé tu juego" (4to, about 10 minutes; T7 of the pilot playtest): can a
// child of 4to build a small game with rules, points, lives and messages,
// and do they like it? A probe of free play (probes.ts): the free-play menu
// shows its card on 4to's menu; the adult can open it for any grade.
//
// Three guided phases on one screen (palette | the notebook of rule cards
// with La Traductora beside it | the board): 1 play a ready-made game (catch
// the seeds with the arrows, a stone takes a life), 2 change one rule (a
// seed worth 2 points…) and play again, 3 make your own variant (rules, the
// bird, "avisar", how to win) and play it. Then three small Scratch scripts
// to predict ("¿Qué pasa…?", three drawn answers), and "¿Te gustó hacer tu
// juego?" with three faces.
//
// The board runs on the pure engine of game/gameMaker.ts, stepped by a
// timer; the objects are drawn here (gameMakerArt.tsx), the child's
// character is its living self (StageView). Rules are read live: a card
// added while the game runs applies at once.
//
// Logged (docs/prueba-piloto-datos.md): `probe_phase`, `rule_edit`,
// `game_run`, `scratch_predict`, `survey_answer` {question:
// 'game_maker_liked'}, and `help`, `speak`, `ghost_demo` with level_id
// 'game_maker'; the raised hand as everywhere.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { penLoop } from '../ink/ink.js';
import { CHARACTER_NAME, type CharacterId } from '../curriculum/motivation';
import {
  GM_COLS, GM_ROWS, READY, SAY_WORD, addAction, addObject, addRule, broadcasts, changeChip, chaser, cloneGame, compact,
  endings, gmInit, gmStep, isGmHat, keysOf, objectOf, paletteFor, presentOf, removeBlock, ruleCount, scratchOf, TICK_MS,
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
import { HAND_HOLD_HELP_MS, useHold } from './AdultControls';
import { usePlaytest } from './context';
import { Cheer } from './interlude';
import type { ProbeProps } from './probes';
import { Face } from './surveyArt';
import {
  GM_LINES, GM_SAY, OUTCOME_SAY, PHASE_NAME, newTrack, phaseCompleted, phaseReady, predictItems, trackEdit, trackRunEnd, trackRunStart,
  type GmPhase, type OutcomeId, type PhaseTrack,
} from './gameMakerProbe';
import {
  BirdArt, FlyingEnvelope, HeartGlyph, HeartsAgain, ObjIcon, Outcome, PhaseSteps, SayBubble, ScoreJar, SeedArt, StoneArt, TrophyArt, WinBurst,
} from './gameMakerArt';
import { ACT_H, ACT_W, GmBlockArt, HAT_H, HAT_W, ScratchScript } from './gameMakerBlocks';
import '../blocks/blocks.css';
import './gameMaker.css';

const LEVEL_ID = 'game_maker';
const PROBE = 'game_maker';
type Stage = GmPhase | 'predict' | 'liked' | 'cheer';

const OBJ_NAME: Record<Exclude<ObjId, 'me'>, string> = { seed: 'semilla', stone: 'piedra', bird: 'pájaro', game: 'juego' };
const RULES_OF: Partial<Record<ObjId, string>> = { seed: 'Reglas de la semilla', stone: 'Reglas de la piedra', bird: 'Reglas del pájaro', game: 'Reglas del juego' };

export function GameMaker({ activity, levelEnded, done }: ProbeProps) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const [stage, setStage] = useState<Stage>('play');
  const [game, setGameState] = useState<GmGame>(() => cloneGame(READY));
  const gameRef = useRef(game);
  const setGame = (g: GmGame) => { gameRef.current = g; setGameState(g); };
  const mountAt = useRef(Date.now());
  const totals = useRef({ runs: 0, edits: 0, helps: 0, makeDone: false, closed: false });

  const log = (type: string, payload: Record<string, unknown>) => apiRef.current.log(type, payload);

  useEffect(() => {
    apiRef.current.did(activity);
    return () => {
      stopSpeaking();
      if (!totals.current.closed) log('probe_end', { probe: PROBE, reason: 'left', time_ms: Date.now() - mountAt.current });
      apiRef.current.level.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phaseDone = (phase: GmPhase, t: PhaseTrack, helps: number) => {
    const completed = phaseCompleted(phase, t);
    totals.current.runs += t.runs;
    totals.current.edits += t.edits;
    totals.current.helps = Math.max(totals.current.helps, helps);
    if (phase === 'make') totals.current.makeDone = completed;
    log('probe_phase', { probe: PROBE, phase, completed, time_ms: Date.now() - t.startedAt, runs: t.runs, edits: t.edits, help_levels: helps });
    setStage(phase === 'play' ? 'change' : phase === 'change' ? 'make' : 'predict');
  };

  const finish = () => {
    const c = totals.current;
    c.closed = true;
    log('probe_end', { probe: PROBE, reason: 'done', time_ms: Date.now() - mountAt.current, runs: c.runs, edits: c.edits, rules: compact(gameRef.current) });
    const lv = apiRef.current.level.current;
    levelEnded({
      level_id: LEVEL_ID, activity, outcome: c.makeDone ? 'win' : 'fail', time_ms: Date.now() - mountAt.current,
      attempts: c.runs, help_levels: c.helps, blocks_optimal: 0, adult_helped: !!lv?.adultHelped,
    });
    done();
  };

  // screenshots and checks (?debug only)
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __gm: unknown }).__gm = {
      stage: () => stage,
      go: (s: Stage) => setStage(s),
      game: () => gameRef.current,
      setGame: (g: GmGame) => setGame(cloneGame(g)),
    };
  });

  if (stage === 'predict') return <Predict done={() => setStage('liked')} />;
  if (stage === 'liked') return <Liked done={() => setStage('cheer')} />;
  if (stage === 'cheer') return <Cheer line="¡Muy bien!" say={GM_SAY.cheer} done={finish} />;
  return <Workshop key={stage} phase={stage} game={game} gameRef={gameRef} setGame={setGame} onDone={phaseDone} />;
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
}

function Workshop({ phase, game, gameRef, setGame, onDone }: {
  phase: GmPhase; game: GmGame; gameRef: MutableRefObject<GmGame>; setGame(g: GmGame): void;
  onDone(phase: GmPhase, t: PhaseTrack, helps: number): void;
}) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const player = usePlayer();
  const meName = CHARACTER_NAME[player.def.id as CharacterId] ?? 'Brote';
  const rootRef = useRef<HTMLElement>(null);
  const board = useRef<BoardCtl | null>(null);
  const [sel, setSel] = useState<ObjId>(phase === 'change' ? 'seed' : 'me');
  const [active, setActive] = useState<number | null>(phase === 'change' ? 1 : null);
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const [demoing, setDemoing] = useState(false);
  const demoRef = useRef(false);
  const track = useRef<PhaseTrack>(newTrack(Date.now()));
  const helpStep = useRef(0);
  const ghostRun = useRef<GhostRun | null>(null);
  const [shake, setShake] = useState<{ key: string; n: number } | null>(null);
  const editable = phase !== 'play';

  const log = (type: string, payload: Record<string, unknown>) => apiRef.current.log(type, payload);
  const check = () => { if (phaseReady(phase, track.current, Date.now())) setReady(true); };

  // entry: the phase's line, the adult's level record
  useEffect(() => {
    apiRef.current.level.current = { id: LEVEL_ID, helpStep: 0, adultHelped: apiRef.current.level.current?.adultHelped ?? false };
    const off = speakWhenAllowed(GM_LINES[phase]);
    const t = window.setInterval(check, 1000);
    // phase 2: the ghost hand shows where the number is (the idea, not the answer)
    const g = phase === 'change' ? window.setTimeout(() => {
      if (!rootRef.current || demoRef.current) return;
      ghostRun.current = playGhost(rootRef.current, [{ do: 'point', at: ['.gm-card[data-card="seed:1"] [data-chip="seed:1:0"]'] }, { do: 'wait', ms: 600 }]);
      log('ghost_demo', { level_id: LEVEL_ID, kind: 'intro', phase });
    }, 5200) : 0;
    // the next phase: a hand nobody answered goes down (the child moved on)
    return () => { off(); clearInterval(t); clearTimeout(g); ghostRun.current?.cancel(); board.current?.stop(); apiRef.current.lowerHand('moved_on'); };
    // once per phase
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- editing
  const flash = (key: string) => setShake((s) => ({ key, n: (s?.n ?? 0) + 1 }));

  const apply = (res: EditResult, obj: ObjId): boolean => {
    if ('refused' in res) {
      if (res.rule != null && res.rule >= 0) flash(`${obj}:${res.rule}`);
      else flash(`tab:${obj}`);
      return false;
    }
    setGame(res.game);
    const e = res.edit;
    // the ghost hand's own edits (help's third step) are logged apart and never complete a phase
    const ghost = demoRef.current;
    log('rule_edit', {
      probe: PROBE, phase, object: e.object, hat: e.hat || null, action: e.action, op: e.op,
      ...(e.from ? { from: e.from, to: e.to } : {}), rules: ruleCount(res.game), running: board.current?.running() ?? false,
      ...(ghost ? { ghost: true } : {}),
    });
    if (!ghost) track.current = trackEdit(track.current, Date.now());
    if (res.rule >= 0) setActive(res.rule);
    check();
    return true;
  };

  const tapPalette = (id: string) => {
    if (!editable || demoRef.current) return;
    const g = gameRef.current;
    if (isGmHat(id)) { apply(addRule(g, sel, id), sel); return; }
    const o = objectOf(g, sel);
    const n = o?.rules.length ?? 0;
    const target = active != null && active < n ? active : n - 1;
    if (target < 0) { speak(GM_SAY.orphan); flash('hats'); return; }
    apply(addAction(g, sel, target, id), sel);
  };
  const dropOn = (id: string, card: number | null, overNotebook: boolean) => {
    if (!editable || !overNotebook) return;
    const g = gameRef.current;
    if (isGmHat(id)) { apply(addRule(g, sel, id), sel); return; }
    if (card == null) { speak(GM_SAY.orphan); flash('hats'); return; }
    apply(addAction(g, sel, card, id), sel);
  };
  const removeAt = (rule: number, action: number | null) => {
    if (!editable || demoRef.current) return;
    if (apply(removeBlock(gameRef.current, sel, rule, action), sel) && action == null) setActive(null);
  };
  const chip = (rule: number, action: number | null) => {
    if (!editable || demoRef.current) return;
    apply(changeChip(gameRef.current, sel, rule, action), sel);
  };
  /** `byGhost`: the help's own step (the ghost hand is working, which otherwise blocks the child's taps). */
  const addBird = (byGhost = false) => {
    if (!editable || (demoRef.current && !byGhost)) return;
    if (apply(addObject(gameRef.current, 'bird'), 'bird')) {
      setSel('bird');
      setActive(null);
      board.current?.addSprite('bird');
    }
  };
  const select = (id: ObjId) => { setSel(id); setActive(null); };

  // ---------------------------------------------------------------- the game
  const onRunStart = () => { track.current = trackRunStart(track.current, Date.now()); };
  const onRunEnd = (r: RunSummary) => {
    const g = gameRef.current;
    const end = endings(g);
    log('game_run', {
      probe: PROBE, phase, result: r.result, duration_ms: r.duration_ms, score: r.score, lives: r.lives, keys: r.keys,
      rules: compact(g), rule_count: ruleCount(g), objects: presentOf(g), broadcasts: broadcasts(g), messages_heard: r.heard,
      win_points: end.win_points, lose_lives: end.lose_lives,
    });
    track.current = trackRunEnd(track.current, r);
    check();
  };
  const onFire = (obj: ObjId, rule: number) => {
    if (obj !== selRef.current || REDUCED) return;
    const card = rootRef.current?.querySelector(`.gm-card[data-card="${obj}:${rule}"]`);
    card?.querySelector('.gm-card-ring')?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
    card?.querySelector('.hat-ear')?.animate([{ rotate: '0deg' }, { rotate: '-16deg', offset: 0.2 }, { rotate: '12deg', offset: 0.45 }, { rotate: '0deg' }], { duration: 500, easing: 'ease-out' });
  };
  const selRef = useRef(sel);
  selRef.current = sel;

  // ---------------------------------------------------------------- 🔊 and ✋
  const onSpeak = () => {
    apiRef.current.log('speak', { level_id: LEVEL_ID, phase });
    speak(GM_LINES[phase]);
  };

  const demo = (steps: DemoStep[], kind: string, pace?: number) => {
    const root = rootRef.current;
    if (!root) return;
    ghostRun.current?.cancel();
    demoRef.current = true;
    setDemoing(true);
    ghostRun.current = playGhost(root, steps, { pace });
    log('ghost_demo', { level_id: LEVEL_ID, kind, phase });
    void ghostRun.current.done.then(() => { demoRef.current = false; setDemoing(false); });
  };

  /** Help's third step: a working rule, built for real by the ghost hand. */
  const showRule = () => {
    const g = gameRef.current;
    if (phase === 'play') {
      const steps: DemoStep[] = [];
      if (!board.current?.running()) steps.push({ do: 'tap', at: '.gm-root .btn-play', apply: () => board.current?.start() });
      for (let i = 0; i < 3; i++) steps.push({ do: 'wait', ms: 400 }, { do: 'tap', at: '.gm-keypad', apply: () => { const d = board.current && chaser(board.current.state()); if (d) board.current?.press(d); } });
      demo(steps, 'rule', 0.8);
      return;
    }
    if (phase === 'change') {
      const at = objectOf(g, 'seed')?.rules.findIndex((r) => r.hat === 'touch:me') ?? -1;
      if (at < 0) { demo([{ do: 'point', at: ['.gm-tab[data-obj="seed"]'] }], 'hint'); return; }
      const j = objectOf(g, 'seed')!.rules[at].actions.findIndex((a) => a.startsWith('score:'));
      setSel('seed');
      if (j < 0) {
        demo([{ do: 'tap', at: '.gm-palette [data-block="score:1"]', apply: () => { selRef.current = 'seed'; setActive(at); apply(addAction(gameRef.current, 'seed', at, 'score:1'), 'seed'); } }], 'rule');
        return;
      }
      demo([{ do: 'wait', ms: 300 }, { do: 'tap', at: `[data-chip="seed:${at}:${j}"]`, apply: () => apply(changeChip(gameRef.current, 'seed', at, j), 'seed') }], 'rule');
      return;
    }
    // make: the seed avisa ¡ñam! when it is caught, the bird answers ¡Pío!
    const steps: DemoStep[] = [];
    if (!objectOf(g, 'bird')) steps.push({ do: 'tap', at: '.gm-tab[data-obj="add-bird"]', apply: () => addBird(true) });
    else steps.push({ do: 'tap', at: '.gm-tab[data-obj="bird"]', apply: () => select('bird') });
    const birdHas = objectOf(g, 'bird')?.rules.some((r) => r.hat === 'recv:yum');
    if (!birdHas) {
      steps.push({ do: 'tap', at: '.gm-palette [data-block="recv:yum"]', apply: () => { const r = addRule(gameRef.current, 'bird', 'recv:yum'); apply(r, 'bird'); } });
      const card = () => objectOf(gameRef.current, 'bird')!.rules.findIndex((r) => r.hat === 'recv:yum');
      steps.push({ do: 'tap', at: '.gm-palette [data-block="say:mia"]', apply: () => { apply(addAction(gameRef.current, 'bird', card(), 'say:mia'), 'bird'); } });
      // "¡Mía!" → "¡Ay!" → "¡Pío!": the chip, twice
      for (let k = 0; k < 2; k++) {
        steps.push({ do: 'wait', ms: 200 }, { do: 'tap', at: '.gm-card[data-card^="bird:"] [data-chip$=":0"]', apply: () => { apply(changeChip(gameRef.current, 'bird', card(), 0), 'bird'); } });
      }
    }
    steps.push({ do: 'tap', at: '.gm-tab[data-obj="seed"]', apply: () => select('seed') });
    const seedCard = objectOf(g, 'seed')?.rules.findIndex((r) => r.hat === 'touch:me') ?? -1;
    if (seedCard >= 0 && !objectOf(g, 'seed')!.rules[seedCard].actions.includes('send:yum')) {
      steps.push({ do: 'tap', at: '.gm-palette [data-block="send:yum"]', apply: () => { setActive(seedCard); apply(addAction(gameRef.current, 'seed', seedCard, 'send:yum'), 'seed'); } });
    }
    demo(steps, 'rule', 0.9);
  };

  const onHelp = () => {
    const a = apiRef.current;
    if (demoRef.current) return;
    if (helpStep.current >= 3) { a.raiseHand('help_step_3'); return; }
    const step = ++helpStep.current;
    if (a.level.current) a.level.current.helpStep = step;
    a.log('help', { level_id: LEVEL_ID, step, phase });
    if (step === 1) {
      speak(GM_LINES[phase]);
      const at = phase === 'play' ? '.gm-root .btn-play' : phase === 'change' ? '.gm-tab[data-obj="seed"]' : '.gm-palette';
      rootRef.current?.querySelector(at)?.animate([{ scale: '1' }, { scale: '1.08' }, { scale: '1' }, { scale: '1.08' }, { scale: '1' }], { duration: 1100 });
      return;
    }
    if (step === 2) {
      if (phase === 'play') demo([{ do: 'point', at: ['.gm-root .btn-play'] }, { do: 'point', at: ['.gm-keypad'] }], 'hint');
      else if (phase === 'change') { setSel('seed'); demo([{ do: 'wait', ms: 250 }, { do: 'point', at: ['[data-chip^="seed:1:"]'] }], 'hint'); }
      else demo([{ do: 'drag', from: '.gm-palette [data-block="send:yum"]', to: '.gm-notebook' }], 'hint');
      return;
    }
    showRule();
  };
  useHold(HAND_HOLD_HELP_MS, (e) => !!(e.target as Element | null)?.closest?.('.gm-root .level-bar .help'), () => apiRef.current.raiseHand('help_held'));

  // keys: the arrows play the game
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
    if (!board.current?.running()) {
      rootRef.current?.querySelector('.gm-root .btn-play')?.animate([{ rotate: '0deg' }, { rotate: '-4deg', scale: '1.06' }, { rotate: '3deg' }, { rotate: '0deg', scale: '1' }], { duration: 480 });
      return;
    }
    board.current.press(d);
  };

  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __gmw: unknown }).__gmw = {
      phase, select, tapPalette, chip, removeAt, addBird, help: onHelp, ready: () => setReady(true),
      start: () => board.current?.start(), stop: () => board.current?.stop(), press: pressKey, state: () => board.current?.state(),
      track: () => track.current,
    };
  });

  const keys = useMemo(() => { const k = keysOf(game); return DIRS.filter((d) => k.includes(d) || d === 'left' || d === 'right'); }, [game]);

  return (
    <main ref={rootRef} className={`level mode-realtime mode-gm gm-root is-${phase}${editable ? '' : ' is-readonly'}${demoing ? ' is-demo' : ''}`} data-phase={phase}>
      <Bar
        instruction={<span className="drawn-task" aria-hidden="true"><PhaseSteps phase={phase} /></span>}
        title={<><b>Hacé tu juego</b>Hacé tu juego · {PHASE_NAME[phase]}</>}
        pages={null}
        onSpeak={onSpeak}
        onHelp={onHelp}
      />
      <Palette obj={sel} enabled={editable} onTap={tapPalette} onDrop={dropOn} shake={shake} />
      <Notebook
        game={game} sel={sel} active={active} editable={editable} meName={meName} shake={shake}
        onSelect={select} onAddBird={() => addBird()} onTapHat={(i) => setActive((a) => (a === i ? null : i))}
        onRemove={removeAt} onChip={chip}
      />
      <section className="level-stage gm-stage" aria-label="Tablero">
        <div className="controls">
          <button type="button" className={`btn btn-play cut${running ? ' is-running' : ''}`} onClick={() => (board.current?.running() ? board.current.stop() : board.current?.start())} aria-label={running ? 'Parar' : 'Probar'}>
            {running ? <><StopIcon /><span>Parar</span></> : <><PlayIcon /><span>Probar</span></>}
          </button>
          <RestartButton onClick={() => board.current?.stop()} />
          {ready && (
            <button type="button" className="next-page cut pop-in gm-next" aria-label="Seguir" onClick={() => { board.current?.stop(); onDone(phase, track.current, helpStep.current); }}>
              <NextPageArt />
            </button>
          )}
        </div>
        <GmBoard
          ctl={board} gameRef={gameRef} game={game} sel={sel} onSelect={select}
          onRunning={setRunning} onRunStart={onRunStart} onRunEnd={onRunEnd} onFire={onFire}
        />
        <div className="gm-keys">
          <div className="keypad gm-keypad" aria-label="Flechas del teclado">
            {keys.map((d) => (
              <button key={d} type="button" className={`key-btn key-${d}`} data-dir={d} aria-label={`Flecha ${d}`} onPointerDown={(e) => { e.preventDefault(); pressKey(d); }}>
                <KeyCap dir={d} size={50} />
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
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

function Palette({ obj, enabled, onTap, onDrop, shake }: { obj: ObjId; enabled: boolean; onTap(id: string): void; onDrop(id: string, card: number | null, over: boolean): void; shake: { key: string; n: number } | null }) {
  const { hats, actions } = paletteFor(obj);
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
  return (
    <section ref={ref} className="zone zone-palette gm-palette" data-zone="palette" data-obj={obj} aria-label="Bloques">
      <div className="gm-palette-in">
        {hats.map((h) => item(h, true))}
        <span className="palette-rule" aria-hidden="true" />
        {actions.map((a) => item(a, false))}
      </div>
      {drag?.on && <DragGhost d={drag} />}
    </section>
  );
}

// ================================================================== the notebook: tabs, cards, La Traductora

function Notebook({ game, sel, active, editable, meName, shake, onSelect, onAddBird, onTapHat, onRemove, onChip }: {
  game: GmGame; sel: ObjId; active: number | null; editable: boolean; meName: string; shake: { key: string; n: number } | null;
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

  return (
    <section ref={ref} className="zone zone-program gm-notebook" data-zone="program" aria-label="Tus reglas">
      <div className="gm-tabs" role="tablist">
        {game.map((o) => (
          <button key={o.id} type="button" role="tab" aria-selected={o.id === sel} className={`gm-tab cut${o.id === sel ? ' is-on' : ''}`} data-obj={o.id} onClick={() => onSelect(o.id)}>
            <ObjIcon id={o.id} size={34} />
            <span className="gm-tab-name">{name(o.id)}</span>
            {o.id === sel && <PenRing seed={o.id.length + 2} />}
          </button>
        ))}
        {!hasBird && editable && (
          <button type="button" className="gm-tab gm-tab-add cut" data-obj="add-bird" aria-label="Sumar el pájaro" onClick={onAddBird}>
            <span className="gm-add-plus" aria-hidden="true">+</span>
            <ObjIcon id="bird" size={30} />
            <span className="gm-tab-name">pájaro</span>
          </button>
        )}
      </div>
      <div className="gm-sheet">
        <div className="gm-heads" aria-hidden="true"><span>{RULES_OF[sel] ?? `Reglas de ${meName}`}</span><span>En Scratch</span></div>
        {obj.rules.length === 0 && (
          <p className="gm-empty">{editable ? <>Poné un <b>cuando…</b> para empezar una regla.</> : null}</p>
        )}
        {obj.rules.map((r, i) => (
          <div key={`${r.hat}#${i}`} className="gm-row">
            <div className={`gm-card${active === i ? ' is-active' : ''}${lifted && lifted.rule === i && lifted.action == null ? ' is-lifted' : ''}`} data-card={`${sel}:${i}`}>
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
              {editable && active === i && r.actions.length < 4 && <div className="gm-slot" aria-hidden="true" />}
            </div>
            <svg className="gm-eq" viewBox="0 0 30 20" aria-hidden="true"><path d="M3,10 Q14,4 24,10" fill="none" stroke="#3d6ea5" strokeWidth={2.4} strokeDasharray="1 5" strokeLinecap="round" /><path d="M19,5 L25,10 L19,15" fill="none" stroke="#3d6ea5" strokeWidth={2.4} strokeLinecap="round" /></svg>
            <ScratchScript blocks={scratchOf(r, meName)} className="gm-tr" />
          </div>
        ))}
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

function GmBoard({ ctl, gameRef, game, sel, onSelect, onRunning, onRunStart, onRunEnd, onFire }: {
  ctl: MutableRefObject<BoardCtl | null>; gameRef: MutableRefObject<GmGame>; game: GmGame; sel: ObjId; onSelect(id: ObjId): void;
  onRunning(on: boolean): void; onRunStart(): void; onRunEnd(r: RunSummary): void; onFire(obj: ObjId, rule: number): void;
}) {
  const player = usePlayer();
  const { ref: meRef, view } = useStage(player, ME_BOX, { shadow: true });
  const [sim, setSim] = useState<GmState>(() => gmInit(gameRef.current));
  const simRef = useRef(sim);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [over, setOver] = useState<'win' | 'lose' | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [bumps, setBumps] = useState({ score: 0, lives: 0 });
  const pressed = useRef<Dir[]>([]);
  const run = useRef<{ at: number; keys: number } | null>(null);
  const senders = useRef<Partial<Record<MsgId, { x: number; y: number }>>>({});
  const nextFlight = useRef(1);
  const prevPos = useRef<Record<string, { c: number; r: number }>>({});
  const cb = useRef({ onRunning, onRunStart, onRunEnd, onFire });
  cb.current = { onRunning, onRunStart, onRunEnd, onFire };

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
  };

  const onEvent = (e: GmEvent, s: GmState) => {
    switch (e.t) {
      case 'fire': cb.current.onFire(e.obj, e.rule); break;
      case 'score': setBumps((b) => ({ ...b, score: b.score + 1 })); break;
      case 'lives':
        setBumps((b) => ({ ...b, lives: b.lives + 1 }));
        if (e.delta < 0) void view.current?.wince();
        break;
      case 'send': senders.current[e.msg] = posOf(s, e.obj); break;
      case 'recv': {
        const from = senders.current[e.msg] ?? TROPHY_AT;
        const id = nextFlight.current++;
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
      const { state, events } = gmStep(gameRef.current, simRef.current, pressed.current.splice(0));
      simRef.current = state;
      setSim(state);
      for (const e of events) onEvent(e, state);
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
  };

  // the game changed while stopped (a sprite added, the game reset): the board shows its start
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
                ? <svg ref={meRef} x={-46} y={-78} width={92} height={92 * 128 / 116} overflow="visible" />
                : <g filter="url(#rough)">{sp.id === 'seed' ? <SeedArt /> : sp.id === 'stone' ? <StoneArt /> : <BirdArt dir={sp.dir === 'left' ? 'left' : 'right'} />}</g>}
            </g>
          );
        })}
        {sprites.filter((sp) => sp.say && sp.visible).map((sp) => {
          const { x, y } = cellCenter(sp.c, sp.r);
          return <SayBubble key={`say-${sp.id}`} text={SAY_WORD[sp.say!]} x={Math.min(BX + BW - 40, Math.max(BX + 40, x))} y={y - (sp.id === 'me' ? 34 : 14)} />;
        })}
        {/* the HUD: the whole game (its trophy), the points, the lives */}
        <g className={`gm-trophy${sel === 'game' ? ' is-sel' : ''}`} transform={`translate(${TROPHY_AT.x} ${TROPHY_AT.y})`} onClick={() => onSelect('game')}>
          {sel === 'game' && <ellipse className="gm-sel-ring" cx={0} cy={28} rx={26} ry={6} />}
          <rect x={-30} y={-30} width={60} height={62} fill="transparent" />
          <g filter="url(#rough)"><TrophyArt /></g>
        </g>
        <g transform={`translate(${HUD_X} ${BY + 140})`} filter="url(#rough)"><ScoreJar n={sim.score} bump={bumps.score} /></g>
        <foreignObject x={HUD_X - 44} y={BY + 196} width={88} height={130}>
          <div className="gm-lives" data-lives={lives}>
            {Array.from({ length: Math.max(3, lives) }, (_, i) => <span key={`${i}-${i >= lives ? bumps.lives : 0}`} className={i >= lives ? 'is-gone' : ''}><HeartGlyph size={24} empty={i >= lives} /></span>)}
          </div>
        </foreignObject>
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

// ================================================================== predict a Scratch script

function Predict({ done }: { done(): void }) {
  const api = usePlaytest();
  const player = usePlayer();
  const me = CHARACTER_NAME[player.def.id as CharacterId] ?? 'Brote';
  const items = useMemo(() => predictItems(me), [me]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<OutcomeId | null>(null);
  const shownAt = useRef(Date.now());
  const item = items[i];

  useEffect(() => {
    shownAt.current = Date.now();
    setPicked(null);
    let off = () => {};
    const t = window.setTimeout(() => { off = speakWhenAllowed(i === 0 ? `${GM_SAY.predictIntro} ${item.say}` : item.say); }, 400);
    return () => { clearTimeout(t); off(); };
  }, [i, item.say]);

  const answer = (o: OutcomeId, pos: number) => {
    if (picked) return;
    setPicked(o);
    speak(OUTCOME_SAY[o]);
    api.log('scratch_predict', { item: item.id, answer: o, correct: o === item.answer, position: pos, time_ms: Date.now() - shownAt.current });
    window.setTimeout(() => { if (i + 1 < items.length) setI(i + 1); else done(); }, 1600);
  };

  const spriteName = (s: 'me' | 'star' | 'stone' | 'bird') => (s === 'me' ? me : s === 'star' ? 'Estrella' : s === 'stone' ? 'Piedra' : 'Pájaro');
  return (
    <main className="pp-page gm-predict" data-item={item.id}>
      <Bar
        instruction={<span className="drawn-task" aria-hidden="true"><PhaseSteps phase="predict" /></span>}
        title={<><b>Hacé tu juego</b>Hacé tu juego · 4 · ¿qué hace este programa de Scratch? ({i + 1} de {items.length})</>}
        pages={null}
        onSpeak={() => { api.log('speak', { level_id: LEVEL_ID, phase: 'predict' }); speak(item.say); }}
        onHelp={() => { api.log('help', { level_id: LEVEL_ID, step: 1, phase: 'predict' }); speak(item.say); }}
      />
      <section className="gm-predict-body">
        <div className="sheet gm-predict-code" aria-label="Programa de Scratch">
          <span className="tape tape-l" aria-hidden="true" />
          {item.scripts.map((s, k) => (
            <div key={k} className="gm-predict-script">
              <p className="gm-predict-who"><ObjIcon id={s.sprite} size={40} /><span>{spriteName(s.sprite)}</span></p>
              <ScratchScript blocks={s.blocks} />
            </div>
          ))}
        </div>
        <div className="gm-predict-q">
          <p className="gm-predict-say">{item.say}</p>
          <div className="gm-predict-options">
            {item.options.map((o, k) => (
              <button key={o} type="button" className={`pp-option cut gm-option${picked === o ? ' is-picked' : ''}${picked && picked !== o ? ' is-other' : ''}`} data-answer={o} aria-label={OUTCOME_SAY[o]} onClick={() => answer(o, k)}>
                <Outcome id={o} />
                {picked === o && <PenRing seed={k + 4} />}
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
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

