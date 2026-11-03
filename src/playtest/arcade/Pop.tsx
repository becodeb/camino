// "¡Pum! Letras", a 1ro arcade card (not in the guided pass): ZType for
// six-year-olds. Soap bubbles with a big capital letter (from tier 4, a
// word under its picture: SOL under a sun) come down slowly over the meadow
// where the child's character stands. Typing the letter (the physical
// keyboard, or a tap on the drawn one under the scene) fires a little pen
// shot from the character: the bubble pops in confetti and a star flies to
// the pile by the monster, which cheers. Nothing is ever lost: a bubble that
// reaches the grass bounces softly and waits there until it is typed; no
// lives, no game over. The bubble to type now is yellow and circled in pen,
// and its key glows on the drawn keyboard (the keys of no bubble on screen
// are dimmed). A wave brings new bubbles for a minute, then the last ones;
// a clear sky wins it: confetti, and the end screen's "¡Otra vez!" (a
// harder wave) / "Otro juego". The waves and the adaptivity inside a wave
// are pop.ts; the wordless ghost demo (the first time in a session) points
// at the bubble and taps its key, popping it.
//
// Logged (Kit.tsx useGameLog): `game_start`; `game_round` per wave won with
// `attempts` = keys typed, `correct` = no wrong key, and this game's
// measures (`popped`, `words_popped`, `texts`, `right`, `wrong`, `accuracy`,
// `sources` {key: physical keyboard, touch: the drawn one}, `landed`,
// `adapt_top`/`adapt_ups`/`adapt_downs`, `wave_ms`); `game_end` with the
// play's totals (`keys_typed`, `right`, `wrong`, `accuracy`, `physical`,
// `touch`, `popped`); `rapid_taps` (a burst of wrong keys makes the
// character dizzy: keys wait a moment); `help`, `speak`, `ghost_demo` with
// `level_id: 'game:pop'`.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
import { rng } from '../../ink/ink.js';
import { usePlaytest } from '../context';
import { provideDemoActions } from '../demo';
import { KEY_ROWS, LETTER_NAME } from '../typing';
import { KeyCap, KeyRing } from '../typingArt';
import { AgainButton, Buddy, ConfettiRain, DizzyStars, RoundDots, gameLevelId, sitDizzy, useGameLog, useIdleNudge, useRapidTaps, type GameProps } from './Kit';
import { GUIDED_ROUNDS, guidedTurnOver, nextTier } from './kit';
import { EndChoices } from './home';
import { Monster } from './monsterArt';
import { ConfettiBurst, Meadow } from './tapArt';
import {
  POP_MAX_TIER, WAVE_MS, accuracyPct, adaptStep, atOnceOf, expectedOf, fallMsOf, judge, newAdapt, normKey, pickLane, pickText,
  shouldSpawn, targetOf, tierSpec, waveOver, type Adapt, type Live,
} from './pop';
import { Bubble, FlyingStar, PILE_MAX, PopBurstArt, PopKeyArt, Shot, StarPile, bubbleR, pileSpot } from './popArt';
import './arcade.css';

const GAME = 'pop' as const;
const LEVEL_ID = gameLevelId(GAME);
const SEED_PREFIX = 'game:pop:';

const LINES = {
  first: '¡Pum, letras! Bajan burbujas con letras. Apretá la misma letra en el teclado y ¡pum!, la reventás.',
  go: '¡Más burbujas!',
  words: '¡Ahora vienen palabras! Escribilas letra por letra.',
  dizzy: '¡Uy, qué mareo! Despacito, mirando la letra amarilla.',
  help: 'Mirá la burbuja amarilla. Buscá esa letra en el teclado y apretala.',
  won: '¡Mirá cuántas estrellas!',
  again: '¡Otra vez!',
};
const NOTES = ['do', 're', 'mi', 'fa', 'sol'] as const;

/** The scene's drawing space, and where things stand in it. */
const VW = 1200, VH = 460, GROUND = 422;
const LANES = [250, 395, 540, 685, 830];
const BUDDY = { x: 104, w: 150 };
const GUN = { x: 150, y: GROUND - 118 };
const PILE = { x: 1000, y: GROUND };
const MONSTER = { x: 1136, s: 0.62 };

type Source = 'key' | 'touch' | 'ghost';
type Phase = 'play' | 'won';
interface Item extends Live { lane: number; spawnAt: number; fallMs: number; landedAt: number }
interface Stats { right: number; wrong: number; keys: { key: number; touch: number }; popped: number; words: number; texts: string[]; landed: number; ghost: number }
const newStats = (): Stats => ({ right: 0, wrong: 0, keys: { key: 0, touch: 0 }, popped: 0, words: 0, texts: [], landed: 0, ghost: 0 });

const restY = (it: Pick<Item, 'text'>) => GROUND - bubbleR(it.text) - 4;
const topY = (it: Pick<Item, 'text'>) => -bubbleR(it.text) - 8;
const inTextField = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export function PopGame({ mode, startTier, rounds, done, roundWon, stopAfterRound, reached, playNo }: GameProps) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const glog = useGameLog(GAME, mode, playNo, startTier);
  const seed0 = useMemo(() => (Date.now() % 99_991) + playNo * 7919, [playNo]);
  const [firstEver] = useState(() => !silentDemoShown(LEVEL_ID));

  const [no, setNo] = useState(1);
  const [tier, setTier] = useState(startTier);
  const [again, setAgain] = useState(false);
  const [phase, setPhase] = useState<Phase>('play');
  const [items, setItems] = useState<Item[]>([]);
  const [locked, setLocked] = useState<number | null>(null);
  const [stars, setStars] = useState(0);
  const [won, setWon] = useState(0);
  const [fx, setFx] = useState<{ id: number; kind: 'shot' | 'burst' | 'star'; x: number; y: number; to?: { x: number; y: number } }[]>([]);
  const [pressed, setPressed] = useState<string | null>(null);
  const [wrong, setWrong] = useState<{ key: string; n: number } | null>(null);
  const [yum, setYum] = useState(false);
  const [confetti, setConfetti] = useState(0);

  const g = useRef({
    phase: 'play' as Phase, items: [] as Item[], locked: null as number | null, no: 1, tier: startTier, waveAt: Date.now(), lastAt: -Infinity,
    seq: 0, lastText: null as string | null, lastLane: -1, rand: rng(seed0), adapt: newAdapt() as Adapt, st: newStats(), stars: 0, fxN: 0,
    tot: { right: 0, wrong: 0, key: 0, touch: 0, popped: 0 }, dizzy: false,
    lastInput: Date.now(), helpStep: 0, mountAt: Date.now(), timers: new Set<number>(), ghost: null as GhostRun | null, unmounted: false,
  });
  const rootRef = useRef<HTMLElement>(null);
  const buddy = useRef<StageView | null>(null);
  const els = useRef(new Map<number, SVGGElement>());
  const pos = useRef(new Map<number, { x: number; y: number }>());

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { g.current.timers.delete(id); if (!g.current.unmounted) fn(); }, ms);
    g.current.timers.add(id);
  };
  const setI = (x: Item[]) => { g.current.items = x; setItems(x); };
  const setL = (x: number | null) => { g.current.locked = x; setLocked(x); };
  const setP = (p: Phase) => { g.current.phase = p; setPhase(p); };
  const effect = (kind: 'shot' | 'burst' | 'star', x: number, y: number, ms: number, to?: { x: number; y: number }) => {
    const id = ++g.current.fxN;
    setFx((f) => [...f, { id, kind, x, y, to }]);
    later(() => setFx((f) => f.filter((e) => e.id !== id)), ms);
  };

  const { hit, dizzy } = useRapidTaps(GAME, () => g.current.no, () => {
    speak(LINES.dizzy);
    void sitDizzy(buddy.current);
  }, () => glog.rapid());
  g.current.dizzy = dizzy;

  // ---------------------------------------------------------------- a wave

  function startWave(n: number, t: number, isAgain: boolean) {
    const s = g.current;
    Object.assign(s, { no: n, tier: t, waveAt: Date.now(), lastAt: -Infinity, adapt: newAdapt(), st: newStats(), stars: 0, lastInput: Date.now() });
    setNo(n); setTier(t); setAgain(isAgain); setStars(0); setYum(false);
    setI([]); setL(null);
    setP('play');
    glog.roundStart(n, t);
    reached?.(t);
  }

  function spawn(now: number) {
    const s = g.current;
    const text = pickText(s.tier, s.rand, s.items, s.lastText);
    const lane = pickLane(s.rand, s.items.map((x) => x.lane), LANES.length, s.lastLane);
    const it: Item = { id: ++s.seq, seq: s.seq, text, typed: 0, landed: false, lane, spawnAt: now, fallMs: fallMsOf(s.tier, s.adapt), landedAt: 0 };
    Object.assign(s, { lastAt: now, lastText: text, lastLane: lane });
    pos.current.set(it.id, { x: LANES[lane], y: topY(it) });
    setI([...s.items, it]);
  }

  /** Every frame: the bubbles fall (or bounce on the grass and wait), new ones come, a clear sky wins. */
  const frame = useRef(() => {});
  frame.current = () => {
    const s = g.current;
    if (s.phase !== 'play') return;
    const now = Date.now();
    let landed = false;
    for (const it of s.items) {
      let x = LANES[it.lane], y: number;
      const p = (now - it.spawnAt) / it.fallMs;
      if (p < 1 && !it.landed) {
        y = topY(it) + (restY(it) - topY(it)) * p;
        x += Math.sin((now + it.id * 700) / 1100) * 14;
      } else {
        if (!it.landed) { it.landed = true; it.landedAt = now; s.st.landed++; s.adapt = adaptStep(s.adapt, { kind: 'landed' }); landed = true; }
        const t = now - it.landedAt;
        y = restY(it) - (t < 1800 ? Math.abs(Math.sin(t / 170)) * 38 * Math.exp(-t / 420) : 0);
      }
      pos.current.set(it.id, { x, y });
      els.current.get(it.id)?.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    }
    if (landed) setI([...s.items]);
    if (shouldSpawn({ now, waveAt: s.waveAt, lastAt: s.lastAt, live: s.items.length, atOnce: atOnceOf(s.tier, s.adapt), gapMs: tierSpec(s.tier).gapMs })) spawn(now);
    else if (waveOver(now - s.waveAt, s.items.length)) winWave();
  };

  useEffect(() => {
    startWave(1, startTier, false);
    let raf = requestAnimationFrame(function loop() { raf = requestAnimationFrame(loop); frame.current(); });
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || inTextField(e.target)) return;
      if ([...e.key].length !== 1) return;
      // the game owns letters and space: no page scroll, and a button that kept the focus is never pressed by them
      e.preventDefault();
      e.stopPropagation();
      const a = document.activeElement as HTMLElement | null;
      if (a && a !== document.body && a.tagName === 'BUTTON') a.blur();
      if (!e.repeat) keyRef.current(e.key, 'key');
    };
    window.addEventListener('keydown', onKey, true);
    let off = () => {};
    if (firstEver) {
      markSilentDemoShown(LEVEL_ID);
      off = speakWhenAllowed(LINES.first);
      later(() => {
        const root = rootRef.current;
        const s = g.current;
        if (!root || s.st.right + s.st.wrong > 0 || !s.items.length) return;
        apiRef.current.log('ghost_demo', { level_id: LEVEL_ID, kind: 'intro' });
        // the ghost points at the bubble, then taps its glowing key: the bubble pops (then it hands over)
        s.ghost = playGhost(root, [
          { do: 'point', at: ['.pz-item.is-target'] },
          { do: 'wait', ms: 300 },
          { do: 'tap', at: '.pz-kb .pp-key.is-expected', apply: () => { const ex = expectedOf(targetOf(g.current.items, g.current.locked)); if (ex) keyRef.current(ex, 'ghost'); } },
          { do: 'wait', ms: 900 },
          { do: 'point', at: ['.pz-item.is-target', '.pz-kb .pp-key.is-expected'] },
        ], { pace: 1.25 });
      }, 2200);
    } else off = speakWhenAllowed(LINES.go);
    return () => {
      off();
      stopSpeaking();
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      const s = g.current;
      s.unmounted = true;
      s.ghost?.cancel();
      s.timers.forEach((x) => clearTimeout(x));
      s.timers.clear();
    };
    // once per play
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- the keys

  /** The play's totals for `game_end` (kept current: the log's own unmount runs before this component's). */
  function totals() {
    const t = g.current.tot;
    glog.endInfo({ keys_typed: t.right + t.wrong, right: t.right, wrong: t.wrong, accuracy: accuracyPct(t.right, t.wrong), physical: t.key, touch: t.touch, popped: t.popped });
  }

  function keyIn(k: string, source: Source) {
    const s = g.current;
    if (s.phase !== 'play' || s.dizzy) return;
    const norm = normKey(k);
    if (!norm) return;
    const child = source !== 'ghost';
    if (child) {
      s.lastInput = Date.now();
      s.ghost?.cancel();
      s.ghost = null;
      glog.input();
      glog.attempt();
      s.st.keys[source]++;
      s.tot[source]++;
    }
    setPressed(norm);
    later(() => setPressed((p) => (p === norm ? null : p)), 140);
    const v = judge(s.items, s.locked, norm);
    if (v.kind === 'ignore') return;
    if (v.kind === 'wrong') {
      if (!child) return;
      s.st.wrong++; s.tot.wrong++;
      s.adapt = adaptStep(s.adapt, { kind: 'wrong' });
      const n = s.st.wrong + s.st.right;
      setWrong({ key: norm, n });
      later(() => setWrong((w) => (w?.n === n ? null : w)), 800);
      totals();
      hit();
      return;
    }
    if (child) { s.st.right++; s.tot.right++; totals(); } else s.st.ghost++;
    const it = s.items.find((x) => x.id === v.id)!;
    const at = pos.current.get(it.id) ?? { x: LANES[it.lane], y: restY(it) };
    effect('shot', at.x, at.y, 420);
    ringNote(NOTES[Math.min(NOTES.length - 1, v.typed - 1 + (it.text.length === 1 ? 2 : 0))]);
    if (!v.done) {
      setI(s.items.map((x) => (x.id === it.id ? { ...x, typed: v.typed } : x)));
      setL(it.id);
      return;
    }
    // popped: confetti where it was, a star to the pile, the monster cheers
    setL(null);
    setI(s.items.filter((x) => x.id !== it.id));
    pos.current.delete(it.id);
    els.current.delete(it.id);
    s.adapt = adaptStep(s.adapt, { kind: 'pop', landed: it.landed });
    s.st.popped++; s.tot.popped++;
    totals();
    if (it.text.length > 1) s.st.words++;
    s.st.texts.push(it.text);
    const spot = pileSpot(Math.min(s.stars, PILE_MAX - 1));
    const to = { x: PILE.x + spot.x, y: PILE.y + spot.y };
    later(() => effect('burst', at.x, at.y, 950), 120);
    later(() => effect('star', at.x, at.y, 700, to), 160);
    later(() => { s.stars++; setStars(s.stars); }, 820);
    setYum(true);
    later(() => setYum(false), 900);
  }
  const keyRef = useRef(keyIn);
  keyRef.current = keyIn;

  function winWave() {
    const s = g.current;
    setP('won');
    setWon((w) => w + 1);
    setConfetti((c) => c + 1);
    setYum(true);
    void buddy.current?.cheer(true);
    ringNote('sol');
    const n = Object.keys(progress.get().solved).filter((k) => k.startsWith(SEED_PREFIX)).length;
    progress.update((q) => solve(q, `${SEED_PREFIX}${n + 1}`));
    const st = s.st;
    const end = glog.roundWon({
      correct: st.wrong === 0, popped: st.popped, words_popped: st.words, texts: st.texts, right: st.right, wrong: st.wrong,
      accuracy: accuracyPct(st.right, st.wrong), sources: { ...st.keys }, landed: st.landed,
      adapt_top: s.adapt.top, adapt_ups: s.adapt.ups, adapt_downs: s.adapt.downs, wave_ms: Date.now() - s.waveAt,
      ...(st.ghost ? { ghost_popped: st.ghost } : {}),
    }, again);
    apiRef.current.lowerHand('self', LEVEL_ID);
    roundWon?.(end);
    later(() => speak(LINES.won), 600);
    const lastGuided = mode === 'guided' && (guidedTurnOver(s.no, s.mountAt, Date.now(), rounds ?? GUIDED_ROUNDS) || !!stopAfterRound?.());
    if (lastGuided) { later(() => { glog.end('finished'); done(); }, 3200); return; }
    if (mode === 'guided') later(() => nextWave(false), 3000);
  }

  function nextWave(byAgain: boolean) {
    const s = g.current;
    const t = nextTier(s.tier, POP_MAX_TIER);
    startWave(s.no + 1, t, byAgain);
    if (byAgain) speak(LINES.again);
    later(() => speak(tierSpec(t).wordShare > 0 ? LINES.words : LINES.go), byAgain ? 900 : 0);
  }

  // ---------------------------------------------------------------- 🔊, ✋, the idle nudge

  const target = targetOf(items, locked);
  const expected = phase === 'play' ? expectedOf(target) : null;
  const pointAtTarget = (kind: 'idle' | 'hint') => {
    const root = rootRef.current;
    const s = g.current;
    if (!root || s.phase !== 'play' || !s.items.length) return;
    s.ghost?.cancel();
    s.ghost = playGhost(root, [{ do: 'point', at: ['.pz-item.is-target'] }, { do: 'point', at: ['.pz-kb .pp-key.is-expected'] }]);
    apiRef.current.log('ghost_demo', { level_id: LEVEL_ID, kind });
  };
  useIdleNudge(rootRef, () => g.current.lastInput, () => g.current.phase === 'play' && g.current.items.length > 0, undefined, () => pointAtTarget('idle'));

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
    const ex = expectedOf(targetOf(s.items, s.locked));
    speak(step === 1 || !ex ? LINES.help : `Buscá la ${LETTER_NAME[ex.toLowerCase()] ?? ex}.`);
    const root = rootRef.current;
    if (root) glowTargets(root, 3000);
    if (step >= 2) pointAtTarget('hint');
  };

  // ---------------------------------------------------------------- checks (?debug), the demo bar

  const popAll = (leave = 0) => {
    const s = g.current;
    if (s.phase !== 'play') return;
    s.waveAt = Date.now() - WAVE_MS;
    for (let i = 0; i < 12 && s.items.length > leave; i++) {
      const ex = expectedOf(targetOf(s.items, s.locked));
      if (!ex) break;
      keyIn(ex, 'ghost');
    }
  };
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __monster: unknown }).__monster = {
      state: () => {
        const s = g.current;
        return { game: GAME, phase: s.phase, round: s.no, tier: s.tier, items: s.items.map((x) => ({ text: x.text, typed: x.typed, landed: x.landed })), expected: expectedOf(targetOf(s.items, s.locked)), stars: s.stars, adapt: s.adapt.level, right: s.st.right, wrong: s.st.wrong, dizzy: s.dizzy };
      },
      /** A key, as if typed on the physical keyboard. */
      key: (k: string) => keyIn(k, 'key'),
      /** Ends the wave: no more bubbles, the ones on screen popped. */
      clear: () => popAll(),
      /** Screenshots: the next wave at tier `t`. */
      tier: (t: number) => startWave(g.current.no + 1, t, false),
    };
    return () => { delete (window as unknown as { __monster?: unknown }).__monster; };
  });
  const demoRef = useRef({ skip: () => {}, solve: () => {} });
  demoRef.current = { skip: () => popAll(), solve: () => popAll(1) };
  useEffect(() => provideDemoActions({ rank: 2, noun: 'ronda', skip: () => demoRef.current.skip(), solve: () => demoRef.current.solve() }), []);

  // ---------------------------------------------------------------- drawing

  const onScreen = new Set(items.map((x) => x.text[x.typed]));
  return (
    <main ref={rootRef} className={`pp-page ga-game pz-game${dizzy ? ' is-dizzy' : ''}`} data-game={GAME} data-phase={phase} data-round={no} data-tier={tier}>
      <Bar
        instruction={(
          <span className="drawn-task" aria-hidden="true">
            <PlayerFace className="bar-face" />
            <ThenArrow />
            <PopKeyArt />
            <ThenArrow />
            <PopBurstArt />
          </span>
        )}
        title={<><b>¡Pum! Letras</b>{`ola ${no} · nivel ${tier}`}</>}
        pages={<RoundDots total={mode === 'guided' ? rounds ?? 3 : Math.min(8, won + 1)} done={won} />}
        aside={<SeedPouch />}
        onSpeak={onSpeak}
        onHelp={onHelp}
      />
      <section className="sheet rx-scene-sheet" aria-label="Las burbujas de letras">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <svg className="rx-scene pz-scene" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Burbujas con letras que bajan">
          <Meadow w={VW} h={VH} ground={GROUND} />
          <g transform={`translate(${PILE.x} ${PILE.y})`}><StarPile n={stars} glow={phase === 'won'} /></g>
          <g transform={`translate(${MONSTER.x} ${GROUND}) scale(${MONSTER.s})`}>
            <g className={`rx-nod${yum ? ' is-on' : ''}`} key={yum ? `y${stars}` : 'n'}><Monster mood={yum ? 'yum' : 'want'} look={-1} /></g>
          </g>
          {items.map((it) => {
            const p = pos.current.get(it.id) ?? { x: LANES[it.lane], y: topY(it) };
            const here = target?.id === it.id;
            return (
              <g
                key={it.id} ref={(el) => { if (el) els.current.set(it.id, el); }} transform={`translate(${p.x} ${p.y})`}
                className={`pz-item${here ? ' is-target' : ''}${it.landed ? ' is-landed' : ''}`} data-text={it.text} {...(here ? { 'data-guide': 'target' } : {})}
              >
                <g className={here && wrong ? 'pz-shake' : undefined} key={here && wrong ? `w${wrong.n}` : 's'}>
                  <Bubble text={it.text} typed={it.typed} target={here} seed={it.id} />
                </g>
              </g>
            );
          })}
          {fx.map((e) => (
            e.kind === 'shot' ? <Shot key={e.id} x0={GUN.x} y0={GUN.y} x1={e.x} y1={e.y} />
              : e.kind === 'burst' ? <g key={e.id} transform={`translate(${e.x} ${e.y})`}><ConfettiBurst r={110} n={18} seed={e.id} /></g>
                : <g key={e.id} transform={`translate(${e.to!.x} ${e.to!.y})`}><g className="pz-fly" style={{ '--dx': `${e.x - e.to!.x}px`, '--dy': `${e.y - e.to!.y}px` } as CSSProperties}><FlyingStar /></g></g>
          ))}
          <Buddy x={BUDDY.x} y={GROUND} w={BUDDY.w} onView={(v) => { buddy.current = v; }} />
          {dizzy && <DizzyStars x={BUDDY.x} y={GROUND - 150} />}
        </svg>
      </section>
      <div className="pz-panel">
        {phase === 'won' && mode === 'arcade'
          ? <EndChoices again={<AgainButton onPress={() => nextWave(true)} />} />
          : (
            <div className="pp-kb pz-kb cut" data-expected={expected ?? ''} aria-label="Teclado">
              {KEY_ROWS.map((row, r) => (
                <div key={row} className={`pp-kb-row r${r}`}>
                  {[...row].map((ch0) => {
                    const ch = ch0.toUpperCase();
                    const cls = `pp-key${ch === expected ? ' is-expected ga-target' : ''}${pressed === ch ? ' is-pressed' : ''}${onScreen.has(ch) ? '' : ' is-off'}`;
                    return (
                      <button key={ch} type="button" className={cls} data-key={ch} aria-label={ch} onPointerDown={(e) => { e.preventDefault(); keyIn(ch, 'touch'); }}>
                        <KeyCap ch={ch} />
                        {ch === expected && <KeyRing seed={ch.charCodeAt(0)} />}
                        {wrong?.key === ch && <span key={wrong.n} className="pp-key-wrong" aria-hidden="true"><KeyCap ch={ch} /></span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
      </div>
      {confetti > 0 && phase === 'won' && <ConfettiRain key={confetti} seed={confetti} />}
    </main>
  );
}
