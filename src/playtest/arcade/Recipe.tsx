// "La receta del monstruo" (T44), 1ro's first monster game: sequence, the
// order matters. A hungry monster shows the sandwich it wants in a thought
// bubble (drawn, bottom layer at the bottom); the child stacks the
// ingredients on the plate in that order (a tap on a tray card puts it on
// top, a drag onto the plate too; a tap on a layer on the plate takes it off
// with everything on it), and serves it with the bell ("¡Listo!"; it only
// rings once the plate is full: random tapping never pays). The monster
// eats: a right sandwich makes it happy (hearts, confetti, the child's
// character cheers); a wrong one is spat out with a disgusted face, back on
// the plate with the first wrong layer circled in red pen, and only the
// right layers under it stay. Never losing: the round goes on until it is
// right. Rounds grow from 2 to 5 layers, then two monsters (recipe.ts).
//
// T52 (understood by a 6-year-old): the plate shows the wanted layers faded
// in their places (building is matching the drawing where the child works),
// the next one pulsing; each layer landing gets the monster's reaction at
// once (a happy bounce, or a frown when it is not what it wants; still
// judged only at the bell); the first-time ghost really puts the bread on
// the plate and hands over (the child adds one layer and rings); after 8 s
// with nothing done the ghost points at the next faded layer and its card.
//
// Logged (Kit.tsx useGameLog): `game_start`, `game_round` with this game's
// measures (order errors: the same ingredients in another order; ingredient
// errors; the wrong layers; layers taken off; taps vs drags; the time to the
// first ingredient, i.e. whether they look at the drawing first), `game_end`,
// `rapid_taps`; `help`, `speak` and `ghost_demo` with `level_id:
// 'game:recipe'`.

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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
import { AgainButton, Buddy, ConfettiRain, DizzyStars, ReadyButton, RoundDots, gameLevelId, sitDizzy, useGameLog, useIdleNudge, useRapidTaps, type GameProps } from './Kit';
import { GUIDED_ROUNDS, guidedTurnOver, nextTier } from './kit';
import { BellArt, IngredientCardArt, Layer, Monster, Sandwich, ThoughtBubble, type MonsterLook, type MonsterMood } from './monsterArt';
import { RECIPE_MAX_TIER, judgeSandwich, keepAfterWrong, recipeRound, trayOf, type Ingredient, type RecipeRound } from './recipe';
import { EndChoices } from './home';
import './arcade.css';

const GAME = 'recipe' as const;
const LEVEL_ID = gameLevelId(GAME);
/** The won rounds plant seeds in the garden, one each (the session's progress). */
const SEED_PREFIX = 'game:recipe:';

const LINES = {
  first: '¡El monstruo tiene hambre! Mirá el sándwich que quiere. Armalo igual, de abajo para arriba, y tocá la campanita.',
  go: '¡Otro sándwich! Mirá bien el dibujo.',
  two: '¡Ahora hay dos monstruos! Cada uno quiere su sándwich.',
  other: '¡Ahora el otro monstruo!',
  yum: '¡Ñam, ñam! ¡Qué rico!',
  yuck: '¡Puaj! Así no era. Mirá el dibujo otra vez.',
  full: 'Ya está lleno. Tocá la campanita.',
  notFull: 'Faltan cosas. Mirá el dibujo.',
  dizzy: '¡Uy, qué mareo! Despacito, mirando el dibujo.',
  help: 'Mirá la nube: abajo de todo va el pan. Poné cada cosa en el mismo orden que el dibujo.',
  again: '¡Otra vez!',
  won: '¡Le encantó!',
};

const NAME: Record<Ingredient, string> = { pan: 'pan', queso: 'queso', tomate: 'tomate', lechuga: 'lechuga', jamon: 'jamón', huevo: 'huevo' };
const NOTES = ['do', 're', 'mi', 'fa', 'sol'] as const;

/** The scene's drawing space, and where things stand in it. */
const VW = 1200, VH = 560, FLOOR = 506;
const PLATE = { x: 830, y: 446 };
/** T52: the plate's drawing scale. */
const PLATE_K = 1.3;
const BUDDY = { x: 1104, y: FLOOR, w: 170 };
const monstersAt = (n: number) => (n === 1 ? [{ x: 250, s: 1.32 }] : [{ x: 160, s: 1 }, { x: 430, s: 1 }]);

type Phase = 'build' | 'eating' | 'yum' | 'yuck' | 'won';
type Source = 'tap' | 'drag';

interface RoundStats { orderErrors: number; ingredientErrors: number; wrongAt: number[]; removed: number; sources: Record<Source, number>; ghostPlaced: number }
const newStats = (): RoundStats => ({ orderErrors: 0, ingredientErrors: 0, wrongAt: [], removed: 0, sources: { tap: 0, drag: 0 }, ghostPlaced: 0 });

export function RecipeGame({ mode, startTier, rounds, done, roundWon, stopAfterRound, reached, playNo }: GameProps) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const glog = useGameLog(GAME, mode, playNo, startTier);
  const seed0 = useMemo(() => (Date.now() % 99_991) + playNo * 7919, [playNo]);
  const [firstEver] = useState(() => !silentDemoShown(LEVEL_ID));

  const [no, setNo] = useState(1);
  const [tier, setTier] = useState(startTier);
  const [again, setAgain] = useState(false);
  const [round, setRound] = useState<RecipeRound>(() => recipeRound(startTier, seed0));
  const [m, setM] = useState(0);
  const [stack, setStack] = useState<Ingredient[]>([]);
  const [phase, setPhase] = useState<Phase>('build');
  const [moods, setMoods] = useState<MonsterMood[]>(() => round.orders.map((_, i) => (i === 0 ? 'want' : 'wait')));
  const [wrongAt, setWrongAt] = useState<number | null>(null);
  const [served, setServed] = useState<boolean[]>([]);
  const [popAt, setPopAt] = useState(-1);
  const [won, setWon] = useState(0);
  const [confetti, setConfetti] = useState(0);
  const [drag, setDrag] = useState<{ ing: Ingredient; x: number; y: number } | null>(null);
  /** T52: the monster's bounce when a layer it wants lands (a counter: each one replays it). */
  const [nod, setNod] = useState(0);

  const g = useRef({
    phase: 'build' as Phase, stack: [] as Ingredient[], m: 0, round, no: 1, tier: startTier,
    st: newStats(), lastInput: Date.now(), helpStep: 0, mountAt: Date.now(), timers: new Set<number>(), ghost: null as GhostRun | null, unmounted: false,
  });
  const rootRef = useRef<HTMLElement>(null);
  const buddy = useRef<StageView | null>(null);
  const plateRef = useRef<SVGRectElement>(null);

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { g.current.timers.delete(id); if (!g.current.unmounted) fn(); }, ms);
    g.current.timers.add(id);
  };
  const setP = (p: Phase) => { g.current.phase = p; setPhase(p); };
  const setS = (s: Ingredient[]) => { g.current.stack = s; setStack(s); };
  const order = () => g.current.round.orders[g.current.m];

  const { hit, dizzy } = useRapidTaps(GAME, () => g.current.no, () => {
    speak(LINES.dizzy);
    void sitDizzy(buddy.current);
  }, () => glog.rapid());

  // ---------------------------------------------------------------- a round

  function startRound(r: RecipeRound, n: number, t: number, isAgain: boolean) {
    const s = g.current;
    Object.assign(s, { round: r, m: 0, no: n, tier: t, st: newStats(), lastInput: Date.now() });
    setRound(r); setM(0); setNo(n); setTier(t); setAgain(isAgain);
    setS([]); setWrongAt(null); setServed([]); setPopAt(-1);
    setMoods(r.orders.map((_, i) => (i === 0 ? 'want' : 'wait')));
    setP('build');
    glog.roundStart(n, t);
    reached?.(t);
  }

  useEffect(() => {
    startRound(round, 1, startTier, false);
    let off = () => {};
    if (firstEver) {
      markSilentDemoShown(LEVEL_ID);
      off = speakWhenAllowed(LINES.first);
      later(() => {
        const root = rootRef.current;
        const s = g.current;
        if (!root || s.stack.length || s.phase !== 'build') return;
        apiRef.current.log('ghost_demo', { level_id: LEVEL_ID, kind: 'intro' });
        // T52: the ghost really puts the first layer on the plate (slowly), then hands over
        s.ghost = playGhost(root, [
          { do: 'point', at: ['.rx-bubble-hit.is-here'] },
          { do: 'wait', ms: 300 },
          { do: 'point', at: ['.rx-ghost.is-next'] },
          { do: 'drag', from: `.rx-tray [data-ing="${order()[0]}"]`, to: '.rx-plate-hit', apply: () => ghostAdd(order()[0]) },
          { do: 'wait', ms: 500 },
          { do: 'point', at: ['.rx-ghost.is-next'] },
        ], { pace: 1.25 });
      }, 1100);
    } else off = speakWhenAllowed(round.orders.length > 1 ? LINES.two : LINES.go);
    return () => {
      off();
      stopSpeaking();
      const s = g.current;
      s.unmounted = true;
      s.ghost?.cancel();
      s.timers.forEach((x) => clearTimeout(x));
      s.timers.clear();
    };
    // once per play
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- the child's input

  function touched() {
    const s = g.current;
    s.lastInput = Date.now();
    s.ghost?.cancel();
    s.ghost = null;
    glog.input();
  }

  function add(ing: Ingredient, source: Source) {
    if (!hit()) return;
    const s = g.current;
    if (s.phase !== 'build') return;
    touched();
    if (s.stack.length >= order().length) {
      speak(LINES.full);
      document.querySelector('.ga-ready')?.classList.add('is-nudge');
      later(() => document.querySelector('.ga-ready')?.classList.remove('is-nudge'), 900);
      return;
    }
    s.st.sources[source]++;
    land(ing);
  }

  /** A layer lands on the plate; the monster reacts at once (T52): a bounce for what it wants, a frown otherwise. */
  function land(ing: Ingredient) {
    const s = g.current;
    const next = [...s.stack, ing];
    setPopAt(next.length - 1);
    setS(next);
    ringNote(NOTES[Math.min(NOTES.length - 1, next.length - 1)]);
    speak(NAME[ing]);
    const m = s.m;
    if (order()[next.length - 1] === ing) setNod((k) => k + 1);
    else {
      setMoodOf(m, 'yuck');
      later(() => { if (g.current.phase === 'build' && g.current.m === m) setMoodOf(m, 'want'); }, 900);
    }
  }

  /** T52: the first-time ghost's drop really puts the layer on the plate (not the child's input). */
  function ghostAdd(ing: Ingredient) {
    const s = g.current;
    if (s.phase !== 'build' || s.stack.length) return;
    s.st.ghostPlaced++;
    land(ing);
    s.lastInput = Date.now();
  }

  function removeFrom(i: number) {
    if (!hit()) return;
    const s = g.current;
    if (s.phase !== 'build' || i >= s.stack.length) return;
    touched();
    s.st.removed += s.stack.length - i;
    setPopAt(-1);
    setS(s.stack.slice(0, i));
  }

  function serve() {
    if (!hit()) return;
    serveNow();
  }

  /** Serves what is on the plate (the bell; the demo bar's skip, which is not a child's tap). */
  function serveNow() {
    const s = g.current;
    if (s.phase !== 'build') return;
    touched();
    const want = order();
    if (s.stack.length < want.length) {
      speak(LINES.notFull);
      const root = rootRef.current;
      if (root) glowTargets(root, 2000);
      return;
    }
    glog.attempt();
    const v = judgeSandwich(want, s.stack);
    setP('eating');
    setMoodOf(s.m, 'chew');
    later(() => {
      if (v.ok) {
        // eaten: the plate is empty
        setS([]);
        setMoodOf(s.m, 'yum');
        setP('yum');
        speak(LINES.yum);
        ringNote('sol');
        setConfetti((c) => c + 1);
        void buddy.current?.cheer(true);
        const nextM = s.m + 1;
        setServed((x) => { const y = x.slice(); y[s.m] = true; return y; });
        if (nextM < s.round.orders.length) {
          later(() => {
            s.m = nextM;
            setM(nextM);
            setS([]);
            setMoodOf(nextM, 'want');
            setP('build');
            speak(LINES.other);
          }, 1900);
        } else later(winRound, 1200);
        return;
      }
      if (v.kind === 'order') s.st.orderErrors++; else s.st.ingredientErrors++;
      s.st.wrongAt.push(v.at);
      setMoodOf(s.m, 'yuck');
      speak(LINES.yuck);
      later(() => {
        setMoodOf(s.m, 'spit');
        setP('yuck');
        setWrongAt(v.at);
        void buddy.current?.wince();
      }, 700);
      later(() => {
        setWrongAt(null);
        setPopAt(-1);
        setS(keepAfterWrong(s.stack, v.at));
        setMoodOf(s.m, 'want');
        setP('build');
        s.lastInput = Date.now();
      }, 700 + 1900);
    }, 1000);
  }

  function setMoodOf(i: number, mood: MonsterMood) {
    setMoods((ms) => ms.map((x, k) => (k === i ? mood : x)));
  }

  function winRound() {
    const s = g.current;
    setP('won');
    setWon((w) => w + 1);
    setConfetti((c) => c + 1);
    // a seed for the garden, one per round won
    const n = Object.keys(progress.get().solved).filter((k) => k.startsWith(SEED_PREFIX)).length;
    progress.update((q) => solve(q, `${SEED_PREFIX}${n + 1}`));
    const end = glog.roundWon({
      monsters: s.round.orders.length, layers: s.round.orders.reduce((a, o) => a + o.length, 0), orders: s.round.orders.map((o) => o.join('-')),
      order_errors: s.st.orderErrors, ingredient_errors: s.st.ingredientErrors, wrong_at: s.st.wrongAt, removed: s.st.removed, sources: { ...s.st.sources },
      ...(s.st.ghostPlaced ? { ghost_placed: s.st.ghostPlaced } : {}),
    }, again);
    apiRef.current.lowerHand('self', LEVEL_ID);
    roundWon?.(end);
    later(() => speak(LINES.won), 600);
    const lastGuided = mode === 'guided' && (guidedTurnOver(s.no, s.mountAt, Date.now(), rounds ?? GUIDED_ROUNDS) || !!stopAfterRound?.());
    if (lastGuided) { later(() => { glog.end('finished'); done(); }, 3200); return; }
    if (mode === 'guided') later(() => nextRound(false), 3000);
  }

  function nextRound(byAgain: boolean) {
    const s = g.current;
    const t = nextTier(s.tier, RECIPE_MAX_TIER);
    startRound(recipeRound(t, seed0 + s.no * 131, s.round), s.no + 1, t, byAgain);
    if (byAgain) speak(LINES.again);
    later(() => speak(g.current.round.orders.length > 1 && s.round.orders.length === 1 ? LINES.two : LINES.go), byAgain ? 900 : 0);
  }

  // T52: after 8 s with nothing done, the ghost points at where the next layer goes and its card (or the bell)
  useIdleNudge(rootRef, () => g.current.lastInput, () => g.current.phase === 'build', undefined, () => {
    const root = rootRef.current;
    const s = g.current;
    if (!root || s.phase !== 'build') return;
    const want = order();
    s.ghost?.cancel();
    s.ghost = s.stack.length >= want.length
      ? playGhost(root, [{ do: 'point', at: ['.ga-ready'] }])
      : playGhost(root, [{ do: 'point', at: ['.rx-ghost.is-next'] }, { do: 'point', at: [`.rx-tray [data-ing="${want[s.stack.length]}"]`] }]);
    apiRef.current.log('ghost_demo', { level_id: LEVEL_ID, kind: 'idle' });
  });

  // ---------------------------------------------------------------- drag from the tray (a tap is the same as a drag)

  const press = useRef<{ ing: Ingredient; x: number; y: number; id: number; moved: boolean } | null>(null);
  const overPlate = (x: number, y: number) => {
    const r = plateRef.current?.getBoundingClientRect();
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  const cardDown = (ing: Ingredient) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    press.current = { ing, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable: taps still work */ }
  };
  const cardMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 10) return;
    p.moved = true;
    setDrag({ ing: p.ing, x: e.clientX, y: e.clientY });
  };
  const cardUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    press.current = null;
    setDrag(null);
    if (!p || p.id !== e.pointerId) return;
    if (!p.moved) add(p.ing, 'tap');
    else if (overPlate(e.clientX, e.clientY)) add(p.ing, 'drag');
  };
  const cardCancel = () => { press.current = null; setDrag(null); };

  // ---------------------------------------------------------------- 🔊, ✋

  const onSpeak = () => {
    apiRef.current.log('speak', { level_id: LEVEL_ID });
    speak(`${LINES.help} ${order().map((i) => NAME[i]).join(', ')}.`);
  };
  const onHelp = () => {
    const s = g.current;
    const a = apiRef.current;
    if (s.helpStep >= 3) { a.raiseHand('help_step_3'); return; }
    const step = ++s.helpStep;
    if (a.level.current) a.level.current.helpStep = step;
    a.log('help', { level_id: LEVEL_ID, step });
    // the help names the next layer, never fills it
    const want = order();
    const k = Math.min(s.stack.length, want.length - 1);
    speak(step === 1 ? LINES.help : `Ahora va: ${NAME[want[k]]}.`);
    const root = rootRef.current;
    if (!root) return;
    glowTargets(root, 3000);
    if (step >= 2 && s.phase === 'build') {
      s.ghost?.cancel();
      s.ghost = playGhost(root, [{ do: 'point', at: [`.rx-bubble-hit.is-here`] }, { do: 'point', at: [`.rx-tray [data-ing="${want[k]}"]`] }]);
      a.log('ghost_demo', { level_id: LEVEL_ID, kind: 'hint' });
    }
  };

  // ---------------------------------------------------------------- checks (?debug), the demo bar

  const solveNow = (leave = 0) => {
    const s = g.current;
    if (s.phase !== 'build') return;
    const want = order();
    const right = want.slice(0, want.length - leave);
    s.stack = right; setS(right);
  };
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __monster: unknown }).__monster = {
      state: () => { const s = g.current; return { game: GAME, phase: s.phase, round: s.no, tier: s.tier, monster: s.m, monsters: s.round.orders.length, order: order(), stack: s.stack, dizzy }; },
      /** Fills the plate with the right layers (not served). */
      fill: () => solveNow(),
      /** Serves at once (a check that already tapped the bell's way). */
      serve: () => serveNow(),
      /** Screenshots: the next round at tier `t`. */
      tier: (t: number) => { const s = g.current; startRound(recipeRound(t, seed0 + s.no * 131, s.round), s.no + 1, t, false); },
    };
    return () => { delete (window as unknown as { __monster?: unknown }).__monster; };
  });
  const demoRef = useRef({ skip: () => {}, solve: () => {} });
  demoRef.current = { skip: () => { solveNow(); later(serveNow, 50); }, solve: () => solveNow(1) };
  useEffect(() => provideDemoActions({ rank: 2, noun: 'ronda', skip: () => demoRef.current.skip(), solve: () => demoRef.current.solve() }), []);

  // ---------------------------------------------------------------- drawing

  const tray = trayOf(tier);
  const want = round.orders[m];
  const full = stack.length >= want.length;
  const spots = monstersAt(round.orders.length);
  const bubbleScale = round.orders.length === 1 ? 1 : 0.7;
  const flying = phase === 'eating' ? 'is-eat' : phase === 'yuck' ? 'is-spat' : '';
  const mouth = spots[m] ? { x: spots[m].x, y: FLOOR - 88 * spots[m].s } : { x: 250, y: 380 };

  return (
    <main ref={rootRef} className={`pp-page ga-game rx-game${dizzy ? ' is-dizzy' : ''}`} data-game={GAME} data-phase={phase} data-round={no} data-tier={tier} data-monster={m}>
      <Bar
        instruction={(
          <span className="drawn-task" aria-hidden="true">
            <PlayerFace className="bar-face" />
            <ThenArrow />
            <svg className="rx-task-sandwich" viewBox="-60 -70 120 80" width={56} height={40}>
              <g transform="scale(0.45)" filter="url(#rough)"><Layer ing="pan" /><g transform="translate(0 -32)"><Layer ing="queso" /></g><g transform="translate(0 -52)"><Layer ing="pan" /></g></g>
            </svg>
            <ThenArrow />
            <BellArt size={44} />
          </span>
        )}
        title={<><b>La receta del monstruo</b>{`ronda ${no} · nivel ${tier}`}</>}
        pages={<RoundDots total={mode === 'guided' ? rounds ?? 3 : Math.min(8, won + 1)} done={won} />}
        aside={<SeedPouch />}
        onSpeak={onSpeak}
        onHelp={onHelp}
      />
      <section className="sheet rx-scene-sheet" aria-label="La cocina del monstruo">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <svg className="rx-scene" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="El monstruo, su pedido y el plato">
          <Kitchen />
          {spots.map((p, i) => {
            const o = round.orders[i];
            const here = i === m && phase !== 'won';
            const bw = round.orders.length === 1 ? 330 : 250;
            const bh = round.orders.length === 1 ? 230 : 190;
            const by = round.orders.length === 1 ? 140 : 118;
            const bx = round.orders.length === 1 ? p.x + 250 : p.x;
            const headY = FLOOR - 200 * p.s;
            return (
              <g key={`${no}-${i}`} className={`rx-monster-spot${here ? ' is-here' : ''}${served[i] ? ' is-served' : ''}`} data-monster={i}>
                {here && round.orders.length > 1 && <ellipse cx={p.x} cy={FLOOR + 4} rx={112} ry={18} fill="none" stroke="#3d6ea5" strokeWidth={3} strokeDasharray="2 8" strokeLinecap="round" />}
                {!served[i] && (
                  <g transform={`translate(${bx} ${by})`}>
                    <ThoughtBubble w={bw} h={bh} tx={(p.x + (round.orders.length === 1 ? 70 : 0)) - bx} ty={headY - by - 8} seed={i + 3} here={here}>
                      <g transform={`translate(0 ${(stackHeight(o) * bubbleScale) / 2 + 2}) scale(${bubbleScale})`}>
                        <ellipse cx={0} cy={4} rx={130} ry={14} fill="#fbf6ea" stroke="#2b2622" strokeWidth={2.6} filter="url(#rough)" />
                        <Sandwich items={o} />
                      </g>
                    </ThoughtBubble>
                    <rect className={`rx-bubble-hit${here ? ' is-here' : ''}`} {...(here ? { 'data-guide': 'target' } : {})} x={-bw / 2} y={-bh / 2} width={bw} height={bh} fill="transparent" pointerEvents="none" />
                  </g>
                )}
                <g transform={`translate(${p.x} ${FLOOR}) scale(${p.s})`}>
                  <g className={`rx-nod${here && nod ? ' is-on' : ''}`} key={here ? `nod-${nod}` : 'n'}><Monster mood={moods[i] ?? 'wait'} look={here ? 1 : i === 0 ? 1 : -1} tone={(i === 0 ? 'blue' : 'pink') as MonsterLook} /></g>
                </g>
              </g>
            );
          })}
          {/* the table and the plate, the sandwich being built */}
          <Table />
          {/* T52: the plate and the sandwich drawn larger (the faded layers to match must read from a child's seat) */}
          <g transform={`translate(${PLATE.x} ${PLATE.y}) scale(${PLATE_K})`}>
            <ellipse cx={0} cy={2} rx={150} ry={22} fill="#fbf6ea" stroke="#2b2622" strokeWidth={2.8} filter="url(#rough)" />
            <ellipse cx={0} cy={0} rx={112} ry={13} fill="none" stroke="#2b2622" strokeWidth={1.4} opacity={0.4} />
            <g className={`rx-fly ${flying}`} style={{ '--dx': `${(mouth.x - PLATE.x) / PLATE_K}px`, '--dy': `${(mouth.y - PLATE.y) / PLATE_K}px` } as React.CSSProperties} key={`fly-${no}-${m}-${phase === 'yuck' ? 'y' : 'b'}`}>
              <g transform="translate(0 -6)">
                <Sandwich items={stack} wrongAt={wrongAt} onLayer={phase === 'build' ? removeFrom : undefined} template={phase === 'build' ? want : undefined} pop={popAt} />
              </g>
            </g>
          </g>
          <rect ref={plateRef} className="rx-plate-hit" x={PLATE.x - 210} y={PLATE.y - 250} width={420} height={280} fill="transparent" pointerEvents="none" />
          <Buddy x={BUDDY.x} y={BUDDY.y} w={BUDDY.w} onView={(v) => { buddy.current = v; }} />
          {dizzy && <DizzyStars x={BUDDY.x} y={BUDDY.y - 150} />}
        </svg>
      </section>
      <div className="rx-panel">
        {/* T51: the arcade's end screen, "¡Otra vez!" and "Otro juego" (the tray waits for the next round) */}
        {phase === 'won' && mode === 'arcade' ? <EndChoices again={<AgainButton onPress={() => nextRound(true)} />} /> : <>
        <ul className="rx-tray" aria-label="Los ingredientes">
          {tray.map((ing, i) => (
            <li key={ing} style={{ '--tilt': `${[-1.4, 1, -0.6, 1.3, -1, 0.7][i % 6]}deg` } as React.CSSProperties}>
              <button
                type="button" className="cut rx-card ga-target" data-ing={ing} aria-label={NAME[ing]} disabled={phase !== 'build'}
                onPointerDown={cardDown(ing)} onPointerMove={cardMove} onPointerUp={cardUp} onPointerCancel={cardCancel}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(ing, 'tap'); } }}
              >
                <IngredientCardArt ing={ing} />
                <span className="rx-card-word" aria-hidden="true">{NAME[ing]}</span>
              </button>
            </li>
          ))}
        </ul>
        <ReadyButton ready={full && phase === 'build'} onPress={serve} />
        </>}
      </div>
      {drag && (
        <div className="rx-drag" style={{ left: drag.x, top: drag.y }} aria-hidden="true"><IngredientCardArt ing={drag.ing} /></div>
      )}
      {confetti > 0 && (phase === 'yum' || phase === 'won') && <ConfettiRain key={confetti} seed={confetti} />}
    </main>
  );
}

const stackHeight = (items: readonly Ingredient[]) => items.reduce((a, it) => a + ({ pan: 30, queso: 18, tomate: 20, lechuga: 20, jamon: 15, huevo: 22 } as const)[it] + 2, 0);

/** The monster's kitchen: a pencil wall with a tiled strip, a window, the floor. */
function Kitchen() {
  return (
    <g aria-hidden="true">
      <rect x={-600} y={0} width={VW + 1200} height={FLOOR} fill="#f6efdf" />
      <g opacity={0.35} stroke="#2b2622" strokeWidth={1.4}>
        {Array.from({ length: 22 }, (_, i) => <path key={i} d={`M${640 + i * 44},300 L${640 + i * 44},${FLOOR}`} />)}
        {Array.from({ length: 5 }, (_, i) => <path key={i} d={`M640,${300 + i * 44} L${VW + 600},${300 + i * 44}`} />)}
      </g>
      <g transform="translate(900 60)" filter="url(#rough)">
        <rect x={0} y={0} width={190} height={150} rx={6} fill="#cfe1ef" stroke="#2b2622" strokeWidth={2.8} />
        <path d="M95,0 L95,150 M0,75 L190,75" stroke="#2b2622" strokeWidth={2.4} />
        <path d="M-14,-6 Q20,60 6,160 L-18,160 Z" fill="#e7a3a0" stroke="#2b2622" strokeWidth={2.4} />
        <path d="M204,-6 Q170,60 184,160 L208,160 Z" fill="#e7a3a0" stroke="#2b2622" strokeWidth={2.4} />
      </g>
      <path d={`M-600,${FLOOR} L${VW + 600},${FLOOR} L${VW + 600},${VH + 200} L-600,${VH + 200} Z`} fill="#eadfc8" />
      <path d={`M-600,${FLOOR} Q600,${FLOOR - 4} ${VW + 600},${FLOOR}`} fill="none" stroke="#2b2622" strokeWidth={2.4} opacity={0.6} />
    </g>
  );
}

function Table() {
  return (
    <g aria-hidden="true" filter="url(#rough)" strokeLinejoin="round">
      <rect x={626} y={PLATE.y + 18} width={408} height={20} rx={5} fill="#c98a4b" stroke="#2b2622" strokeWidth={2.8} />
      <rect x={654} y={PLATE.y + 38} width={16} height={FLOOR - PLATE.y - 38} fill="#b37a40" stroke="#2b2622" strokeWidth={2.4} />
      <rect x={990} y={PLATE.y + 38} width={16} height={FLOOR - PLATE.y - 38} fill="#b37a40" stroke="#2b2622" strokeWidth={2.4} />
    </g>
  );
}
