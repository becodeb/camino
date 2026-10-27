// "Copiá el baile" (T45), 1ro's second monster game: sequence and memory,
// Simon says, silent. The monster dances on a little stage under a
// spotlight, one pose per beat (dance.ts: 2 poses, then 3, 4…); the pose
// cards wait, dimmed, and taps on them are ignored while it dances. Then it
// is the child's turn, obvious without sound or reading: the spotlight goes
// off, the monster points down at the cards, and the cards light up and
// lift. The child repeats the dance by tapping the pose cards; the monster
// copies every tap and the beat's round frame at the top fills with the
// pose tapped. A miss: the monster tries that pose, wobbles and tumbles
// over (dizzy stars), gets up, and dances the same dance again (same
// length): never "game over". All right: they dance it together, confetti;
// the next round adds one pose to the same dance.
//
// T52 (understood by a 6-year-old): while the monster holds a pose, that
// pose's card lifts out of the grey row, lit, and the beat's frame at the top
// shows the pose (the pose↔card link is visible); a big drawn eye sits on
// the grey cards while it dances ("watch"); slower beats; the first round is
// one pose; on the child's turn the monster points down at the cards; the
// first-time ghost taps the first card and the monster copies it (not
// counted), then hands over; after 8 s with nothing tapped the dance is
// shown again.
//
// Logged (Kit.tsx useGameLog): `game_start`, `game_round` with this game's
// measures (`length` the dance's poses, `seq`, `misses`, `miss_at`, `taps`,
// `shows` times the dance was shown), `game_end` with `longest` (the longest
// dance copied), `rapid_taps`; `help`, `speak` and `ghost_demo` with
// `level_id: 'game:dance'`.

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
import { penLoop } from '../../ink/ink.js';
import { usePlaytest } from '../context';
import { provideDemoActions } from '../demo';
import { AgainButton, Buddy, ConfettiRain, DizzyStars, RoundDots, gameLevelId, sitDizzy, useGameLog, useIdleNudge, useRapidTaps, type GameProps } from './Kit';
import { GUIDED_ROUNDS, guidedTurnOver, nextTier } from './kit';
import { DANCE_MAX_TIER, POSES, danceRound, judgeStep, type DanceRound, type Pose } from './dance';
import { HOP, POINT_DOWN as POINT, POSE_COLOR, POSE_PARAMS, PoseCardArt, Puppet, REST, TUMBLE, usePoseTween, type Face, type PoseParams } from './puppetArt';
import { EndChoices } from './home';
import './arcade.css';

const GAME = 'dance' as const;
const LEVEL_ID = gameLevelId(GAME);
const SEED_PREFIX = 'game:dance:';

const LINES = {
  first: '¡El monstruo baila! Mirá bien su baile. Después copialo: tocá los dibujos en el mismo orden.',
  watch: '¡Mirá el baile!',
  turn: '¡Ahora vos!',
  more: '¡Un paso más!',
  miss: '¡Plaf! ¡Se cayó! Mirá otra vez.',
  yay: '¡Bailaron igual!',
  won: '¡Qué bien bailás!',
  dizzy: '¡Uy, qué mareo! Despacito, mirá el baile.',
  help: 'Mirá al monstruo: baila. Después tocá los dibujos en el mismo orden.',
  again: '¡Otra vez!',
};

const NAME: Record<Pose, string> = { up: '¡Arriba!', star: '¡Estrella!', squat: '¡Abajo!', flamingo: '¡Un pie!' };
const NOTE: Record<Pose, 'do' | 'mi' | 'sol' | 're'> = { up: 'sol', star: 'mi', squat: 'do', flamingo: 're' };

/** A beat of the monster's dance: the pose lands, holds, and it comes back to rest. */
const BEAT_MS = 1400;
const HOLD_MS = 1000;
/** The win: the same dance, quicker, all together. */
const FAST_BEAT_MS = 560;

const VW = 1200, VH = 560, FLOOR = 506;
const MON = { x: 470, s: 1.3 };
const BUDDY = { x: 1040, y: FLOOR, w: 170 };
const SLOT_Y = 62;

type Phase = 'show' | 'turn' | 'tumble' | 'yay' | 'won';

interface RoundStats { misses: number; missAt: number[]; taps: number; shows: number }
const newStats = (): RoundStats => ({ misses: 0, missAt: [], taps: 0, shows: 0 });

export function DanceGame({ mode, startTier, rounds, done, roundWon, stopAfterRound, reached, playNo }: GameProps) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const glog = useGameLog(GAME, mode, playNo, startTier);
  const seed0 = useMemo(() => (Date.now() % 99_991) + playNo * 7919, [playNo]);
  const [firstEver] = useState(() => !silentDemoShown(LEVEL_ID));

  const [no, setNo] = useState(1);
  const [tier, setTier] = useState(startTier);
  const [again, setAgain] = useState(false);
  const [round, setRound] = useState<DanceRound>(() => danceRound(startTier, seed0));
  const [phase, setPhase] = useState<Phase>('show');
  const [input, setInput] = useState<Pose[]>([]);
  const [beat, setBeat] = useState(-1);
  const [missAt, setMissAt] = useState<number | null>(null);
  const [target, setTarget] = useState<{ p: PoseParams; ms: number }>({ p: REST, ms: 240 });
  const [face, setFace] = useState<Face>('watch');
  const [flash, setFlash] = useState<Pose | null>(null);
  const [lastTap, setLastTap] = useState<{ pose: Pose; n: number } | null>(null);
  const [won, setWon] = useState(0);
  const [confetti, setConfetti] = useState(0);
  const pose = usePoseTween(target.p, target.ms);

  const g = useRef({
    phase: 'show' as Phase, round, input: [] as Pose[], no: 1, tier: startTier, st: newStats(), longest: 0,
    lastInput: Date.now(), helpStep: 0, mountAt: Date.now(), timers: new Set<number>(), show: new Set<number>(),
    ghost: null as GhostRun | null, unmounted: false, ghostShown: false,
  });
  const rootRef = useRef<HTMLElement>(null);
  const buddy = useRef<StageView | null>(null);

  const later = (fn: () => void, ms: number, bag: Set<number> = g.current.timers) => {
    const id = window.setTimeout(() => { bag.delete(id); if (!g.current.unmounted) fn(); }, ms);
    bag.add(id);
  };
  const setP = (p: Phase) => { g.current.phase = p; setPhase(p); };
  const setIn = (x: Pose[]) => { g.current.input = x; setInput(x); };
  const move = (p: PoseParams, f: Face, ms = 240) => { setTarget({ p, ms }); setFace(f); };
  const stopShow = () => { g.current.show.forEach((x) => clearTimeout(x)); g.current.show.clear(); };

  const { hit, dizzy } = useRapidTaps(GAME, () => g.current.no, () => {
    speak(LINES.dizzy);
    void sitDizzy(buddy.current);
  }, () => glog.rapid());

  // ---------------------------------------------------------------- the monster's dance, then the child's turn

  /** The monster dances `seq` (taps on the cards wait); then it points at the cards: the child's turn. */
  function show(seq: readonly Pose[], then: () => void = turn) {
    const s = g.current;
    stopShow();
    s.st.shows++;
    setP('show');
    setIn([]);
    setMissAt(null);
    setBeat(-1);
    move(REST, 'watch');
    speak(LINES.watch);
    seq.forEach((p, i) => {
      later(() => {
        setBeat(i);
        move(POSE_PARAMS[p], 'dance', 260);
        setFlash(p);
        ringNote(NOTE[p]);
      }, 600 + i * BEAT_MS, s.show);
      later(() => { move(REST, 'watch', 200); setFlash(null); }, 600 + i * BEAT_MS + HOLD_MS, s.show);
    });
    later(then, 600 + seq.length * BEAT_MS + 450, s.show);
  }

  function turn() {
    const s = g.current;
    setP('turn');
    setBeat(-1);
    move(POINT, 'point', 320);
    speak(LINES.turn);
    void buddy.current?.nod();
    s.lastInput = Date.now();
    // the first time ever: a wordless ghost tap on the first pose's card
    if (firstEver && !s.ghostShown) {
      s.ghostShown = true;
      later(() => {
        const root = rootRef.current;
        if (!root || s.phase !== 'turn' || s.input.length) return;
        apiRef.current.log('ghost_demo', { level_id: LEVEL_ID, kind: 'intro' });
        // T52: the ghost's tap is answered: the monster copies the pose (not the child's tap, not counted), then points again
        const first = s.round.seq[0];
        s.ghost = playGhost(root, [
          { do: 'tap', at: `.dz-card[data-pose="${first}"]`, apply: () => ghostTap(first) },
          { do: 'wait', ms: 900 },
        ], { pace: 1.2 });
      }, 700);
    }
  }

  /** The first-time ghost's tap: the monster does the pose and points at the cards again (nothing counted). */
  function ghostTap(p: Pose) {
    const s = g.current;
    if (s.phase !== 'turn' || s.input.length) return;
    setLastTap((x) => ({ pose: p, n: (x?.n ?? 0) + 1 }));
    move(POSE_PARAMS[p], 'dance', 220);
    setFlash(p);
    ringNote(NOTE[p]);
    later(() => { if (g.current.phase === 'turn' && !g.current.input.length) { move(POINT, 'point', 260); setFlash(null); setLastTap(null); } }, 900);
    s.lastInput = Date.now();
  }

  function startRound(r: DanceRound, n: number, t: number, isAgain: boolean) {
    const s = g.current;
    stopShow();
    Object.assign(s, { round: r, no: n, tier: t, st: newStats(), lastInput: Date.now() });
    setRound(r); setNo(n); setTier(t); setAgain(isAgain);
    setIn([]); setMissAt(null); setLastTap(null);
    setP('show');
    move(REST, 'watch');
    glog.roundStart(n, t);
    reached?.(t);
    // in the show's own bag: skipping the show (checks, the demo bar) cancels it too
    later(() => show(r.seq), 700, s.show);
  }

  useEffect(() => {
    startRound(round, 1, startTier, false);
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
      stopShow();
    };
    // once per play
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- the child's taps

  function tap(p: Pose) {
    if (!hit()) return;
    const s = g.current;
    // the monster is dancing (or tumbling): the cards wait
    if (s.phase !== 'turn') return;
    s.lastInput = Date.now();
    s.ghost?.cancel();
    s.ghost = null;
    glog.input();
    s.st.taps++;
    const next = [...s.input, p];
    setIn(next);
    setLastTap((x) => ({ pose: p, n: (x?.n ?? 0) + 1 }));
    move(POSE_PARAMS[p], 'dance', 220);
    setFlash(p);
    ringNote(NOTE[p]);
    speak(NAME[p]);
    const v = judgeStep(s.round.seq, next);
    const k = next.length;
    if (v.ok && !v.done) {
      later(() => { if (s.phase === 'turn' && s.input.length === k) { move(POINT, 'point', 260); setFlash(null); } }, 560);
      return;
    }
    glog.attempt();
    if (v.ok) {
      setP('yay');
      later(winDance, 650);
      return;
    }
    // a miss: it tries the pose, wobbles and tumbles over; then the same dance again
    s.st.misses++;
    s.st.missAt.push(v.at);
    setP('tumble');
    setMissAt(v.at);
    later(() => { move(TUMBLE, 'dizzy', 420); setFlash(null); speak(LINES.miss); void buddy.current?.wince(); }, 480);
    later(() => move(REST, 'watch', 380), 480 + 2000);
    later(() => show(s.round.seq), 480 + 2000 + 700);
  }

  /** All right: the dance again, quicker, the monster happy; confetti and the child's character cheering. */
  function winDance() {
    const s = g.current;
    setConfetti((c) => c + 1);
    void buddy.current?.cheer(true);
    speak(LINES.yay);
    ringNote('sol');
    s.round.seq.forEach((p, i) => {
      later(() => { move(POSE_PARAMS[p], 'yay', 200); setFlash(p); setBeat(i); }, i * FAST_BEAT_MS);
    });
    later(() => { move(HOP, 'yay', 260); setFlash(null); setBeat(-1); }, s.round.seq.length * FAST_BEAT_MS);
    later(() => move(REST, 'yay', 300), s.round.seq.length * FAST_BEAT_MS + 420);
    later(winRound, s.round.seq.length * FAST_BEAT_MS + 600);
  }

  function winRound() {
    const s = g.current;
    setP('won');
    setWon((w) => w + 1);
    setConfetti((c) => c + 1);
    const n = Object.keys(progress.get().solved).filter((k) => k.startsWith(SEED_PREFIX)).length;
    progress.update((q) => solve(q, `${SEED_PREFIX}${n + 1}`));
    s.longest = Math.max(s.longest, s.round.seq.length);
    glog.endInfo({ longest: s.longest });
    const end = glog.roundWon({
      length: s.round.seq.length, seq: s.round.seq.join('-'), misses: s.st.misses, miss_at: s.st.missAt, taps: s.st.taps, shows: s.st.shows,
    }, again);
    apiRef.current.lowerHand('self', LEVEL_ID);
    roundWon?.(end);
    later(() => speak(LINES.won), 500);
    const lastGuided = mode === 'guided' && (guidedTurnOver(s.no, s.mountAt, Date.now(), rounds ?? GUIDED_ROUNDS) || !!stopAfterRound?.());
    if (lastGuided) { later(() => { glog.end('finished'); done(); }, 3000); return; }
    if (mode === 'guided') later(() => nextRound(false), 2800);
  }

  function nextRound(byAgain: boolean) {
    const s = g.current;
    const t = nextTier(s.tier, DANCE_MAX_TIER);
    startRound(danceRound(t, seed0 + s.no * 131, s.round.seq), s.no + 1, t, byAgain);
    speak(byAgain ? LINES.again : LINES.more);
  }

  // T52: after 8 s with nothing tapped on its turn, the monster shows the dance again (the cards lighting up with it)
  useIdleNudge(rootRef, () => g.current.lastInput, () => g.current.phase === 'turn' && !g.current.input.length, undefined, () => {
    apiRef.current.log('ghost_demo', { level_id: LEVEL_ID, kind: 'idle' });
    show(g.current.round.seq);
  });

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
      // the dance again, from the start (the child's taps so far are dropped)
      if (s.phase === 'turn') show(s.round.seq);
      return;
    }
    if (!root || s.phase !== 'turn') return;
    const want = s.round.seq[Math.min(s.input.length, s.round.seq.length - 1)];
    glowTargets(root, 2400);
    s.ghost?.cancel();
    s.ghost = playGhost(root, [{ do: 'point', at: [`.dz-card[data-pose="${want}"]`] }]);
    a.log('ghost_demo', { level_id: LEVEL_ID, kind: 'hint' });
  };

  // ---------------------------------------------------------------- checks (?debug), the demo bar

  /** Skips the dance on screen: the child's turn at once (checks, the demo bar). */
  const skipShow = () => { if (g.current.phase === 'show') { stopShow(); move(REST, 'watch'); turn(); } };
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __monster: unknown }).__monster = {
      state: () => { const s = g.current; return { game: GAME, phase: s.phase, round: s.no, tier: s.tier, seq: s.round.seq, input: s.input, misses: s.st.misses, dizzy }; },
      skipShow,
      tier: (t: number) => { const s = g.current; startRound(danceRound(t, seed0 + s.no * 131), s.no + 1, t, false); },
    };
    return () => { delete (window as unknown as { __monster?: unknown }).__monster; };
  });
  const demoRef = useRef({ skip: () => {}, solve: () => {} });
  demoRef.current = {
    skip: () => {
      const s = g.current;
      if (s.phase === 'show') skipShow();
      if (g.current.phase !== 'turn') return;
      setIn(s.round.seq.slice());
      glog.attempt();
      setP('yay');
      later(winDance, 300);
    },
    solve: () => skipShow(),
  };
  useEffect(() => provideDemoActions({ rank: 2, noun: 'ronda', skip: () => demoRef.current.skip(), solve: () => demoRef.current.solve() }), []);

  // ---------------------------------------------------------------- drawing

  const seq = round.seq;
  const slotGap = Math.min(86, 560 / Math.max(1, seq.length));
  const slotX = (i: number) => MON.x + 40 + (i - (seq.length - 1) / 2) * slotGap;
  const lit = phase === 'show' || phase === 'yay';
  return (
    <main
      ref={rootRef} className={`pp-page ga-game dz-game${dizzy ? ' is-dizzy' : ''}`}
      data-game={GAME} data-phase={phase} data-round={no} data-tier={tier} data-length={seq.length}
    >
      <Bar
        instruction={(
          <span className="drawn-task" aria-hidden="true">
            <svg className="dz-task-art" viewBox="-130 -250 260 260" width={46} height={46}><Puppet p={POSE_PARAMS.star} face="dance" /></svg>
            <ThenArrow />
            <PlayerFace className="bar-face" />
            <ThenArrow />
            <span className="dz-task-cards">{POSES.slice(0, 3).map((p) => <span key={p} style={{ background: POSE_COLOR[p] }} />)}</span>
          </span>
        )}
        title={<><b>Copiá el baile</b>{`ronda ${no} · ${seq.length} pasos`}</>}
        pages={<RoundDots total={mode === 'guided' ? rounds ?? 3 : Math.min(8, won + 1)} done={won} />}
        aside={<SeedPouch />}
        onSpeak={onSpeak}
        onHelp={onHelp}
      />
      <section className="sheet dz-scene-sheet" aria-label="El escenario del monstruo">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <svg className="dz-scene" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="El monstruo baila">
          <Stage lit={lit} you={phase === 'turn'} />
          {/* the beats of the dance: one round frame each, filled as it dances and with the child's taps */}
          <g className="dz-slots" aria-hidden="true">
            {seq.map((_, i) => {
              const mine = input[i];
              const on = phase === 'show' || phase === 'yay' ? i <= beat : !!mine;
              return (
                <g key={`${no}-${i}`} transform={`translate(${slotX(i)} ${SLOT_Y})`} className={`dz-slot${on ? ' is-on' : ''}${i === beat ? ' is-beat' : ''}`} data-slot={i}>
                  <circle r={32} fill={mine ? POSE_COLOR[mine] : on ? POSE_COLOR[seq[i]] : 'none'} stroke="#2b2622" strokeWidth={2.6} strokeDasharray={on ? undefined : '6 7'} filter="url(#rough)" />
                  {mine && phase !== 'show' ? (
                    <g transform="translate(0 26) scale(0.21)"><Puppet p={POSE_PARAMS[mine]} face="dance" /></g>
                  ) : on ? <g transform="translate(0 26) scale(0.21)"><Puppet p={POSE_PARAMS[seq[i]]} face="dance" /></g> : null}
                  {missAt === i && phase === 'tumble' && (
                    <path className="rx-wrong-ring" d={penLoop(0, 0, 44, 42, { seed: 5 })} fill="none" stroke="#c24a3c" strokeWidth={5} strokeLinecap="round" filter="url(#rough)" />
                  )}
                </g>
              );
            })}
          </g>
          {/* the floor flashes the pose's colour */}
          <ellipse cx={MON.x} cy={FLOOR + 6} rx={190} ry={30} fill={flash ? POSE_COLOR[flash] : 'transparent'} className="dz-flash" stroke={flash ? '#2b2622' : 'none'} strokeWidth={2.2} strokeDasharray="3 8" />
          <g transform={`translate(${MON.x} ${FLOOR}) scale(${MON.s})`} className={`dz-monster is-${phase}`}>
            <Puppet p={pose} face={face} look={phase === 'turn' ? [0.6, 1] : [0.3, 0]} />
          </g>
          {phase === 'tumble' && face === 'dizzy' && <DizzyStars x={MON.x + 280} y={FLOOR - 120} />}
          <rect className="dz-monster-hit" x={MON.x - 170} y={FLOOR - 330} width={340} height={340} fill="transparent" pointerEvents="none" />
          <Buddy x={BUDDY.x} y={BUDDY.y} w={BUDDY.w} onView={(v) => { buddy.current = v; }} />
          {dizzy && <DizzyStars x={BUDDY.x} y={BUDDY.y - 150} />}
        </svg>
      </section>
      <div className={`dz-panel${phase === 'turn' ? ' is-turn' : ' is-watch'}`}>
        {/* T51: the arcade's end screen, "¡Otra vez!" and "Otro juego" */}
        {phase === 'won' && mode === 'arcade' ? <EndChoices again={<AgainButton onPress={() => nextRound(true)} />} /> : (
        <>
        {/* T52: while it dances, a big drawn eye on the grey cards: "watch" */}
        {phase === 'show' && <WatchEye />}
        <ul className="dz-cards" aria-label="Los pasos de baile">
          {POSES.map((p, i) => (
            <li key={p} style={{ '--tilt': `${[-1.4, 1, -0.6, 1.3][i]}deg`, '--i': i } as CSSProperties}>
              <button
                type="button" className={`cut dz-card ga-target${lastTap?.pose === p && phase !== 'show' ? ' is-tapped' : ''}${flash === p && (phase === 'show' || phase === 'yay') ? ' is-shown' : ''}`} data-pose={p}
                key={lastTap?.pose === p ? `t${lastTap.n}` : 'c'}
                aria-label={NAME[p]} aria-disabled={phase !== 'turn'} {...(phase === 'turn' ? { 'data-guide': 'target' } : {})}
                style={{ '--fill': POSE_COLOR[p] } as CSSProperties}
                onClick={() => tap(p)}
              >
                <PoseCardArt pose={p} />
              </button>
            </li>
          ))}
        </ul>
        </>
        )}
      </div>
      {confetti > 0 && (phase === 'yay' || phase === 'won') && <ConfettiRain key={confetti} seed={confetti} />}
    </main>
  );
}

/** The monster's little stage: a wall, two curtains, wooden boards, and the spotlight (on while it dances). */
function Stage({ lit, you }: { lit: boolean; you: boolean }) {
  return (
    <g aria-hidden="true">
      <rect x={-600} y={0} width={VW + 1200} height={FLOOR} fill="#f1e6cf" />
      <g filter="url(#rough)" strokeLinejoin="round">
        <path d={`M-600,0 L140,0 Q120,240 160,${FLOOR} L-600,${FLOOR} Z`} fill="#c9574a" stroke="#2b2622" strokeWidth={2.8} />
        <path d="M40,0 Q30,240 60,506 M90,0 Q80,240 110,506" fill="none" stroke="#a8463b" strokeWidth={3} />
        <path d={`M${VW + 600},0 L${VW - 140},0 Q${VW - 120},240 ${VW - 160},${FLOOR} L${VW + 600},${FLOOR} Z`} fill="#c9574a" stroke="#2b2622" strokeWidth={2.8} />
        <path d={`M${VW - 40},0 Q${VW - 30},240 ${VW - 60},506 M${VW - 90},0 Q${VW - 80},240 ${VW - 110},506`} fill="none" stroke="#a8463b" strokeWidth={3} />
        <path d={`M-600,0 L${VW + 600},0 L${VW + 600},26 Q600,46 -600,26 Z`} fill="#a8463b" stroke="#2b2622" strokeWidth={2.6} />
      </g>
      <path className={`dz-spot${lit ? ' is-on' : ''}`} d={`M${MON.x - 60},0 L${MON.x + 60},0 L${MON.x + 230},${FLOOR + 10} L${MON.x - 230},${FLOOR + 10} Z`} fill="#fff1b8" />
      {/* the child's turn: the spotlight is on the child's character */}
      <path className={`dz-spot dz-spot-you${you ? ' is-on' : ''}`} d={`M${BUDDY.x - 40},0 L${BUDDY.x + 40},0 L${BUDDY.x + 130},${FLOOR + 10} L${BUDDY.x - 130},${FLOOR + 10} Z`} fill="#fff1b8" />
      <path d={`M-600,${FLOOR} L${VW + 600},${FLOOR} L${VW + 600},${VH + 200} L-600,${VH + 200} Z`} fill="#d9a066" />
      <g stroke="#2b2622" strokeWidth={1.6} opacity={0.35}>
        <path d={`M-600,${FLOOR + 22} L${VW + 600},${FLOOR + 22}`} />
        {Array.from({ length: 16 }, (_, i) => <path key={i} d={`M${i * 90 - 20},${FLOOR} L${i * 90 - 40},${VH}`} />)}
      </g>
      <path d={`M-600,${FLOOR} L${VW + 600},${FLOOR}`} stroke="#2b2622" strokeWidth={2.6} opacity={0.7} />
    </g>
  );
}

/** T52: "watch": a big drawn eye, blinking, over the grey cards while the monster dances. */
function WatchEye() {
  return (
    <svg className="dz-eye" viewBox="-60 -40 120 80" aria-hidden="true">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <path d="M-52,0 Q0,-44 52,0 Q0,44 -52,0 Z" fill="#fbf6ea" stroke="#2b2622" strokeWidth={4} />
        <g className="dz-eye-ball">
          <circle cx={0} cy={0} r={17} fill="#3d6ea5" stroke="#2b2622" strokeWidth={3} />
          <circle cx={0} cy={0} r={7} fill="#2b2622" />
          <circle cx={-5} cy={-6} r={3.4} fill="#fff" />
        </g>
        <path className="dz-eye-lid" d="M-52,0 Q0,-44 52,0 Q0,44 -52,0 Z" fill="#f1e6cf" stroke="#2b2622" strokeWidth={4} />
      </g>
    </svg>
  );
}
