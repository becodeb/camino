// "¿Qué salió mal?" (T46), 1ro's third monster game: finding the error,
// debugging. An everyday routine is told only with drawings, a strip of 3–4
// steps the monster acts out (oops.ts, oopsArt.tsx); it plays step by step
// (each step lights up and acts) and something funny goes wrong (out into
// the snow in a swimsuit: blue and shivering; socks over the shoes:
// slipping; soup with a fork: dripping, still hungry; no toothpaste: yellow
// teeth and a stink). Then the child's turn, obvious without sound: the
// steps light up and lift. The child taps the wrong step (a right one just
// shakes, a gentle "no": never losing); it is circled in red pen; then:
//
// - a wrong thing: a few drawn options come up below and the child picks
//   the right one (a tap, or a drag onto the circled step; a wrong option
//   shakes and goes back);
// - the wrong order: the step lifts, and a tap on the other misplaced step
//   swaps them.
//
// The routine plays again, right, with a juicy win (the happy ending,
// confetti, the child's character cheering).
//
// Logged (Kit.tsx useGameLog): `game_start`, `game_round` with this game's
// measures (`routine`, `kind`, `steps`, `found_try` the tap that found the
// mistake (1 = the first), `first_tap_ms`, `fix_correct` (the first fix
// tried was right), `fix_tries`, `replays` (the strip shown again by ✋),
// `sources` tap/drag), `game_end`, `rapid_taps`; `help`, `speak` and
// `ghost_demo` with `level_id: 'game:oops'`.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { progress, solve } from '../../curriculum/progress';
import { Bar } from '../../screens/LevelBar';
import { DEBUG } from '../../screens/levelKit';
import { PlayerFace } from '../../screens/player';
import { SeedPouch } from '../../screens/yearKit';
import { ThenArrow } from '../../ui/art';
import type { StageView } from '../../ui/board/StageView';
import { glowTargets, playGhost, type GhostRun } from '../../ui/ghost';
import { markSilentDemoShown, silentDemoShown } from '../../ui/silentDemo';
import { ringNote } from '../../ui/sound';
import { speak, speakWhenAllowed, stopSpeaking } from '../../ui/speech';
import { usePlaytest } from '../context';
import { provideDemoActions } from '../demo';
import { AgainButton, Buddy, ConfettiRain, DizzyStars, RoundDots, gameLevelId, sitDizzy, useGameLog, useIdleNudge, useRapidTaps, type GameProps } from './Kit';
import { GUIDED_ROUNDS, guidedTurnOver, nextTier } from './kit';
import { OOPS_MAX_TIER, isRightFix, isSwapPartner, isWrongStep, optionsOf, routineFor, type Routine, type StepId } from './oops';
import { STEP_H, STEP_W, StepArt, StepPicture, WrongRing, actOf } from './oopsArt';
import { EndChoices } from './home';
import './arcade.css';

const GAME = 'oops' as const;
const LEVEL_ID = gameLevelId(GAME);
const SEED_PREFIX = 'game:oops:';

const LINES = {
  first: '¡Mirá lo que hace el monstruo! Algo le salió mal. Tocá el dibujo que está mal y arreglalo.',
  watch: '¡Mirá!',
  find: '¿Qué salió mal? Tocá el dibujo.',
  no: 'Ese está bien. Mirá otro.',
  found: '¡Ese! ¿Qué va en su lugar? Elegí abajo.',
  foundSwap: '¡Ese! Está en el lugar equivocado. Tocá con cuál se cambia.',
  wrongFix: 'Ese no va. Probá otro.',
  fixed: '¡Ahora sí! Mirá otra vez.',
  won: '¡Muy bien! ¡Lo arreglaste!',
  dizzy: '¡Uy, qué mareo! Despacito, mirá los dibujos.',
  help: 'Mirá los dibujos uno por uno. Uno está mal: tocalo y arreglalo.',
  again: '¡Otra vez!',
};

/** Each step lights up and acts for this long while the strip plays. */
const STEP_MS = 1350;

type Phase = 'play' | 'find' | 'fix' | 'swap' | 'replay' | 'won';
type Source = 'tap' | 'drag';

interface RoundStats { findTries: number; fixTries: number; fixCorrect: boolean | null; firstTap: number; replays: number; sources: Record<Source, number> }
const newStats = (): RoundStats => ({ findTries: 0, fixTries: 0, fixCorrect: null, firstTap: 0, replays: 0, sources: { tap: 0, drag: 0 } });

export function OopsGame({ mode, startTier, rounds, done, roundWon, stopAfterRound, reached, playNo }: GameProps) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const glog = useGameLog(GAME, mode, playNo, startTier);
  const seed0 = useMemo(() => (Date.now() % 99_991) + playNo * 7919, [playNo]);
  const [firstEver] = useState(() => !silentDemoShown(LEVEL_ID));

  const [no, setNo] = useState(1);
  const [tier, setTier] = useState(startTier);
  const [again, setAgain] = useState(false);
  const [routine, setRoutine] = useState<Routine>(() => routineFor(startTier));
  const [steps, setSteps] = useState<readonly StepId[]>(() => routine.wrong);
  const [phase, setPhase] = useState<Phase>('play');
  const [now, setNow] = useState(-1);
  const [found, setFound] = useState<number | null>(null);
  const [fixedAt, setFixedAt] = useState<number | null>(null);
  const [shake, setShake] = useState<{ i: number; n: number } | null>(null);
  const [optShake, setOptShake] = useState<{ id: StepId; n: number } | null>(null);
  const [slide, setSlide] = useState<Record<number, number>>({});
  const [won, setWon] = useState(0);
  const [confetti, setConfetti] = useState(0);
  const [drag, setDrag] = useState<{ id: StepId; x: number; y: number } | null>(null);
  const options = useMemo(() => optionsOf(routine, seed0 + no), [routine, seed0, no]);

  const g = useRef({
    phase: 'play' as Phase, routine, steps: routine.wrong as readonly StepId[], found: null as number | null, no: 1, tier: startTier, st: newStats(),
    lastInput: Date.now(), roundAt: Date.now(), helpStep: 0, mountAt: Date.now(), timers: new Set<number>(), play: new Set<number>(),
    ghost: null as GhostRun | null, unmounted: false, ghostShown: false,
  });
  const rootRef = useRef<HTMLElement>(null);
  const buddy = useRef<StageView | null>(null);

  const later = (fn: () => void, ms: number, bag: Set<number> = g.current.timers) => {
    const id = window.setTimeout(() => { bag.delete(id); if (!g.current.unmounted) fn(); }, ms);
    bag.add(id);
  };
  const setP = (p: Phase) => { g.current.phase = p; setPhase(p); };
  const setF = (f: number | null) => { g.current.found = f; setFound(f); };
  const setS = (s: readonly StepId[]) => { g.current.steps = s; setSteps(s); };
  const stopPlay = () => { g.current.play.forEach((x) => clearTimeout(x)); g.current.play.clear(); };

  const { hit, dizzy } = useRapidTaps(GAME, () => g.current.no, () => {
    speak(LINES.dizzy);
    void sitDizzy(buddy.current);
  }, () => glog.rapid());

  // ---------------------------------------------------------------- the strip plays, then the child's turn

  function playStrip(list: readonly StepId[], then: () => void) {
    const s = g.current;
    stopPlay();
    setNow(-1);
    list.forEach((id, i) => later(() => { setNow(i); ringNote((['do', 're', 'mi', 'fa', 'sol'] as const)[i % 5]); void id; }, 500 + i * STEP_MS, s.play));
    later(() => { setNow(-1); then(); }, 500 + list.length * STEP_MS, s.play);
  }

  function startFind() {
    const s = g.current;
    setP('find');
    speak(LINES.find);
    void buddy.current?.nod();
    s.lastInput = Date.now();
    if (firstEver && !s.ghostShown) {
      s.ghostShown = true;
      later(() => {
        const root = rootRef.current;
        if (!root || s.phase !== 'find' || s.st.findTries) return;
        apiRef.current.log('ghost_demo', { level_id: LEVEL_ID, kind: 'intro' });
        s.ghost = playGhost(root, [{ do: 'tap', at: `.oo-frame[data-i="${s.routine.wrongAt[0]}"]` }], { pace: 0.9 });
      }, 600);
    }
  }

  function startRound(r: Routine, n: number, t: number, isAgain: boolean) {
    const s = g.current;
    stopPlay();
    Object.assign(s, { routine: r, no: n, tier: t, st: newStats(), lastInput: Date.now(), roundAt: Date.now() });
    setRoutine(r); setNo(n); setTier(t); setAgain(isAgain);
    setS(r.wrong); setF(null); setFixedAt(null); setShake(null); setOptShake(null); setSlide({});
    setP('play');
    glog.roundStart(n, t);
    reached?.(t);
    speak(LINES.watch);
    playStrip(r.wrong, startFind);
  }

  useEffect(() => {
    startRound(routine, 1, startTier, false);
    let off = () => {};
    if (firstEver) {
      markSilentDemoShown(LEVEL_ID);
      off = speakWhenAllowed(LINES.first);
    }
    return () => {
      off();
      stopSpeaking();
      const s = g.current;
      s.unmounted = true;
      s.ghost?.cancel();
      s.timers.forEach((x) => clearTimeout(x));
      s.timers.clear();
      stopPlay();
    };
    // once per play
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- the child's taps

  function touched() {
    const s = g.current;
    s.lastInput = Date.now();
    if (!s.st.firstTap) s.st.firstTap = Date.now();
    s.ghost?.cancel();
    s.ghost = null;
    glog.input();
  }

  /** A gentle "no": the step shakes; nothing is lost. */
  function no_(i: number) {
    setShake((x) => ({ i, n: (x?.n ?? 0) + 1 }));
    glog.attempt();
  }

  function tapFrame(i: number) {
    if (!hit()) return;
    const s = g.current;
    const r = s.routine;
    if (s.phase === 'find') {
      touched();
      s.st.findTries++;
      if (!isWrongStep(r, i)) { no_(i); speak(LINES.no); return; }
      setF(i);
      ringNote('sol');
      if (r.kind === 'replace') { setP('fix'); speak(LINES.found); } else { setP('swap'); speak(LINES.foundSwap); }
      return;
    }
    if (s.phase === 'swap' && s.found != null && i !== s.found) {
      touched();
      s.st.fixTries++;
      if (!isSwapPartner(r, s.found, i)) { no_(i); speak(LINES.wrongFix); return; }
      if (s.st.fixCorrect == null) s.st.fixCorrect = s.st.fixTries === 1;
      s.st.sources.tap++;
      swapNow(s.found, i);
    }
  }

  function swapNow(a: number, b: number) {
    const root = rootRef.current;
    const box = (k: number) => root?.querySelector(`.oo-frame[data-i="${k}"]`)?.getBoundingClientRect();
    const ra = box(a), rb = box(b);
    setP('replay');
    if (ra && rb) setSlide({ [a]: rb.left - ra.left, [b]: ra.left - rb.left });
    later(() => {
      setSlide({});
      setS(g.current.routine.right);
      setF(null);
      setFixedAt(Math.min(a, b));
      fixedThen();
    }, 620);
  }

  function pickOption(id: StepId, source: Source) {
    if (!hit()) return;
    const s = g.current;
    if (s.phase !== 'fix' || s.found == null) return;
    touched();
    s.st.fixTries++;
    if (!isRightFix(s.routine, id)) {
      if (s.st.fixCorrect == null) s.st.fixCorrect = false;
      setOptShake((x) => ({ id, n: (x?.n ?? 0) + 1 }));
      glog.attempt();
      speak(LINES.wrongFix);
      return;
    }
    if (s.st.fixCorrect == null) s.st.fixCorrect = true;
    s.st.sources[source]++;
    const at = s.found;
    const next = s.steps.slice();
    next[at] = id;
    setS(next);
    setF(null);
    setFixedAt(at);
    setP('replay');
    fixedThen();
  }

  /** Fixed: the routine plays again, right, and ends happy. */
  function fixedThen() {
    glog.attempt();
    ringNote('sol');
    speak(LINES.fixed);
    later(() => {
      setFixedAt(null);
      setS(g.current.routine.right);
      playStrip(g.current.routine.right, winRound);
    }, 900);
  }

  function winRound() {
    const s = g.current;
    setP('won');
    setNow(s.routine.right.length - 1);
    setWon((w) => w + 1);
    setConfetti((c) => c + 1);
    void buddy.current?.cheer(true);
    const n = Object.keys(progress.get().solved).filter((k) => k.startsWith(SEED_PREFIX)).length;
    progress.update((q) => solve(q, `${SEED_PREFIX}${n + 1}`));
    const end = glog.roundWon({
      routine: s.routine.id, kind: s.routine.kind, steps: s.routine.right.length,
      found_try: s.st.findTries, first_tap_ms: s.st.firstTap ? s.st.firstTap - s.roundAt : null,
      fix_correct: s.st.fixCorrect === true, fix_tries: s.st.fixTries, replays: s.st.replays, sources: { ...s.st.sources },
    }, again);
    apiRef.current.lowerHand('self', LEVEL_ID);
    roundWon?.(end);
    later(() => speak(LINES.won), 400);
    const lastGuided = mode === 'guided' && (guidedTurnOver(s.no, s.mountAt, Date.now(), rounds ?? GUIDED_ROUNDS) || !!stopAfterRound?.());
    if (lastGuided) { later(() => { glog.end('finished'); done(); }, 3200); return; }
    if (mode === 'guided') later(() => nextRound(false), 3000);
  }

  function nextRound(byAgain: boolean) {
    const s = g.current;
    const t = nextTier(s.tier, OOPS_MAX_TIER);
    startRound(routineFor(t, s.routine.id), s.no + 1, t, byAgain);
    if (byAgain) speak(LINES.again);
  }

  useIdleNudge(rootRef, () => g.current.lastInput, () => ['find', 'fix', 'swap'].includes(g.current.phase));

  // ---------------------------------------------------------------- an option dragged onto the circled step (a tap is the same)

  const press = useRef<{ id: StepId; x: number; y: number; pid: number; moved: boolean } | null>(null);
  const overFound = (x: number, y: number) => {
    const f = g.current.found;
    const r = f == null ? null : rootRef.current?.querySelector(`.oo-frame[data-i="${f}"]`)?.getBoundingClientRect();
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  const optDown = (id: StepId) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    press.current = { id, x: e.clientX, y: e.clientY, pid: e.pointerId, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* taps still work */ }
  };
  const optMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.pid !== e.pointerId) return;
    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 10) return;
    p.moved = true;
    setDrag({ id: p.id, x: e.clientX, y: e.clientY });
  };
  const optUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    press.current = null;
    setDrag(null);
    if (!p || p.pid !== e.pointerId) return;
    if (!p.moved) pickOption(p.id, 'tap');
    else if (overFound(e.clientX, e.clientY)) pickOption(p.id, 'drag');
  };
  const optCancel = () => { press.current = null; setDrag(null); };

  // ---------------------------------------------------------------- 🔊, ✋

  const onSpeak = () => {
    apiRef.current.log('speak', { level_id: LEVEL_ID });
    speak(LINES.help);
  };
  const onHelp = () => {
    const s = g.current;
    const a = apiRef.current;
    if (s.helpStep >= 3) { a.raiseHand('help_step_3'); return; }
    const step = ++s.helpStep;
    if (a.level.current) a.level.current.helpStep = step;
    a.log('help', { level_id: LEVEL_ID, step });
    speak(LINES.help);
    const root = rootRef.current;
    if (step === 1) {
      // the strip again, with its mistake
      if (s.phase === 'find') { s.st.replays++; setP('play'); playStrip(s.steps, startFind); }
      return;
    }
    if (!root) return;
    const r = s.routine;
    let at: string | null = null;
    if (s.phase === 'find') at = `.oo-frame[data-i="${r.wrongAt[0]}"]`;
    else if (s.phase === 'fix') at = `.oo-option[data-step="${r.right[r.wrongAt[0]]}"]`;
    else if (s.phase === 'swap' && s.found != null) at = `.oo-frame[data-i="${r.wrongAt.find((k) => k !== s.found)}"]`;
    if (!at) return;
    glowTargets(root, 2400);
    s.ghost?.cancel();
    s.ghost = playGhost(root, [{ do: 'point', at: [at] }]);
    a.log('ghost_demo', { level_id: LEVEL_ID, kind: 'hint' });
  };

  // ---------------------------------------------------------------- checks (?debug), the demo bar

  const skipPlay = () => { const s = g.current; if (s.phase === 'play') { stopPlay(); setNow(-1); startFind(); } };
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __monster: unknown }).__monster = {
      state: () => { const s = g.current; return { game: GAME, phase: s.phase, round: s.no, tier: s.tier, routine: s.routine.id, kind: s.routine.kind, wrongAt: s.routine.wrongAt, right: s.routine.right, steps: s.steps, found: s.found, dizzy }; },
      skipPlay,
      /** Screenshots: any steps on the strip (the art's review). */
      show: (list: StepId[]) => { stopPlay(); setNow(-1); setF(null); setS(list); },
      tier: (t: number) => { const s = g.current; startRound(routineFor(t, s.routine.id), s.no + 1, t, false); },
    };
    return () => { delete (window as unknown as { __monster?: unknown }).__monster; };
  });
  const demoRef = useRef({ skip: () => {}, solve: () => {} });
  demoRef.current = {
    skip: () => {
      const s = g.current;
      skipPlay();
      if (s.phase !== 'find' && s.phase !== 'fix' && s.phase !== 'swap') return;
      setF(null);
      setP('replay');
      fixedThen();
    },
    solve: () => {
      const s = g.current;
      skipPlay();
      if (s.phase !== 'find') return;
      setF(s.routine.wrongAt[0]);
      setP(s.routine.kind === 'replace' ? 'fix' : 'swap');
    },
  };
  useEffect(() => provideDemoActions({ rank: 2, noun: 'ronda', skip: () => demoRef.current.skip(), solve: () => demoRef.current.solve() }), []);

  // ---------------------------------------------------------------- drawing

  const n = steps.length;
  const turn = phase === 'find' || phase === 'swap';
  return (
    <main
      ref={rootRef} className={`pp-page ga-game oo-game${dizzy ? ' is-dizzy' : ''}`}
      data-game={GAME} data-phase={phase} data-round={no} data-tier={tier} data-routine={routine.id}
    >
      <Bar
        instruction={(
          <span className="drawn-task" aria-hidden="true">
            <span className="oo-task-strip">{[0, 1, 2].map((i) => <span key={i} className={i === 1 ? 'is-wrong' : ''} />)}</span>
            <ThenArrow />
            <PlayerFace className="bar-face" />
          </span>
        )}
        title={<><b>¿Qué salió mal?</b>{`ronda ${no} · ${routine.right.length} dibujos`}</>}
        pages={<RoundDots total={mode === 'guided' ? rounds ?? 3 : Math.min(8, won + 1)} done={won} />}
        aside={<SeedPouch />}
        onSpeak={onSpeak}
        onHelp={onHelp}
      />
      <section className={`sheet oo-sheet${turn ? ' is-turn' : ''}`} aria-label="Lo que hace el monstruo" style={{ '--n': n } as CSSProperties}>
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <ol className="oo-strip">
          {steps.map((id, i) => {
            const cls = [
              'cut', 'oo-frame', 'ga-target',
              i === now ? `is-now oo-act-${actOf(id)}` : '',
              found === i ? 'is-found' : '',
              found === i && phase === 'swap' ? 'is-lifted' : '',
              fixedAt === i ? 'is-fixed' : '',
              shake?.i === i ? 'is-no' : '',
            ].filter(Boolean).join(' ');
            const guide = (phase === 'find') || (phase === 'swap' && found !== i);
            return (
              <li key={i} style={{ '--i': i } as CSSProperties}>
                <button
                  type="button" className={cls} data-i={i} data-step={id}
                  key={shake?.i === i ? `no${shake.n}` : `f${id}`}
                  aria-label={`Dibujo ${i + 1}`} aria-disabled={!turn}
                  {...(guide ? { 'data-guide': 'target' } : {})}
                  style={slide[i] != null ? ({ translate: `${slide[i]}px -10px`, transition: 'translate 560ms cubic-bezier(.4,.1,.3,1)', zIndex: 2 } as CSSProperties) : undefined}
                  onClick={() => tapFrame(i)}
                >
                  <svg className="oo-pic" viewBox={`0 0 ${STEP_W} ${STEP_H}`} aria-hidden="true"><StepArt id={id} /></svg>
                  {found === i && <WrongRing />}
                </button>
                {i < n - 1 && <span className="oo-link" aria-hidden="true"><i /><i /><i /></span>}
              </li>
            );
          })}
        </ol>
      </section>
      <div className="oo-panel">
        <svg className="oo-buddy" viewBox="0 0 180 170" aria-hidden="true">
          <Buddy x={90} y={162} w={150} onView={(v) => { buddy.current = v; }} />
          {dizzy && <DizzyStars x={90} y={28} />}
        </svg>
        {/* T51: the arcade's end screen, "¡Otra vez!" and "Otro juego" (beside the child's character) */}
        {phase === 'won' && mode === 'arcade' ? <EndChoices again={<AgainButton onPress={() => nextRound(true)} />} /> : <>
        <ul className={`oo-options${phase === 'fix' ? ' is-on' : ''}`} aria-label="Qué poner en su lugar">
          {phase === 'fix' && options.map((id, i) => (
            <li key={id} style={{ '--tilt': `${[-1.4, 1.1, -0.7][i % 3]}deg`, '--i': i } as CSSProperties}>
              <button
                type="button" className={`cut oo-option ga-target${optShake?.id === id ? ' is-no' : ''}`} data-step={id} data-guide="target"
                key={optShake?.id === id ? `no${optShake.n}` : 'o'} aria-label={`Opción ${i + 1}`}
                onPointerDown={optDown(id)} onPointerMove={optMove} onPointerUp={optUp} onPointerCancel={optCancel}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickOption(id, 'tap'); } }}
              >
                <StepPicture id={id} zoom />
              </button>
            </li>
          ))}
        </ul>
        <span className="oo-panel-end" aria-hidden="true" />
        </>}
      </div>
      {drag && <div className="oo-drag" style={{ left: drag.x, top: drag.y }} aria-hidden="true"><StepPicture id={drag.id} /></div>}
      {confetti > 0 && phase === 'won' && <ConfettiRain key={confetti} seed={confetti} />}
    </main>
  );
}
