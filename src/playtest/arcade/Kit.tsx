// The 1ro arcade's shared pieces (T43), used by every monster game:
//
// - GameProps: how the guided pass (GuidedGames.tsx) and the arcade's menu
//   (FreePlay.tsx) host a game.
// - useGameLog: the per-game telemetry, `game_start`, `game_round`
//   (correct = right on the first try, attempts, ms), `game_end` (finished /
//   quit), with the replays flagged (`voluntary`, `replay`, `again`).
// - useRapidTaps: the dizzy rule (kit.ts): very fast taps on the game's
//   targets make the child's character dizzy for a moment (funny, never a
//   punishment: input just waits); logs `rapid_taps`.
// - Buddy: the child's own character standing in the game's scene (a nested
//   StageView): it cheers with confetti on a win, winces on a miss and goes
//   dizzy, sitting down with the swirls of the boards (BoardView's `dizzy`).
// - ReadyButton ("¡Listo!", a service bell), AgainButton ("¡Otra vez!"),
//   ConfettiRain (the juicy win, over the whole screen), useIdleNudge.
// - The ghost demo: each game plays its own wordless demo the first time in
//   a session (silentDemo.ts tags `game:<id>`).

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { usePlayer, useStage } from '../../screens/player';
import type { StageView } from '../../ui/board/StageView';
import { glowTargets, wiggleHelp } from '../../ui/ghost';
import { REDUCED } from '../../ui/runtime';
import { usePlaytest } from '../context';
import type { LevelEnd } from '../PlaytestLevel';
import { DIZZY_MS, createRapidTaps, type GameId, type GameMode } from './kit';
import { AgainLoopArt, BellArt } from './monsterArt';

export interface GameProps {
  mode: GameMode;
  /** The tier the first round is played at. */
  startTier: number;
  /** The guided pass: how many rounds (or until kit.ts guidedTurnOver says its time is up), then `done()`. The arcade: endless ("¡Otra vez!"). */
  rounds?: number;
  /** The guided pass: the rounds are over. */
  done(): void;
  /** Every round won (free play counts it as a won level, and its time may end there). */
  roundWon?(end: LevelEnd): void;
  /** The guided pass: stop after the round on screen ("quedan 5 minutos"). */
  stopAfterRound?(): boolean;
  /** The highest tier played, as each round starts (the arcade opens the game there). */
  reached?(tier: number): void;
  /** How many times this game was started in this session, this one included. */
  playNo: number;
}

/** The level id the help, speak and ghost_demo events carry. */
export const gameLevelId = (id: GameId) => `game:${id}`;

// ------------------------------------------------------------------ the telemetry

export interface RoundLog {
  round: number;
  tier: number;
  /** Serves / tries until it was right (1 = right on the first try). */
  attempts: number;
  /** Time from the round's start to the first input (did they look first?). */
  first_input_ms: number | null;
  [extra: string]: unknown;
}

/**
 * One game's telemetry for one play (a pick from the menu, or its place in
 * the guided pass): `game_start` on mount, `game_round` per round won (and an
 * unfinished one when left mid-round), `game_end` once (`finished` after a
 * won round or the guided rounds, `quit` when left mid-round).
 */
export function useGameLog(game: GameId, mode: GameMode, playNo: number, startTier: number) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const s = useRef({ at: Date.now(), roundAt: Date.now(), firstInput: 0, rounds: 0, inRound: false, ended: false, rapid: 0, attempts: 0, round: 0, tier: startTier, endExtra: {} as Record<string, unknown> });
  const log = (type: string, payload: Record<string, unknown>) => apiRef.current.log(type, payload);
  const base = () => ({ game, mode, play_no: playNo });

  useEffect(() => {
    log('game_start', { ...base(), tier: startTier, voluntary: mode === 'arcade', replay: playNo > 1 });
    apiRef.current.level.current = { id: gameLevelId(game), helpStep: 0, adultHelped: false };
    return () => {
      const st = s.current;
      if (!st.ended) {
        if (st.inRound && st.attempts + (st.firstInput ? 1 : 0) > 0) {
          log('game_round', { ...base(), round: st.round, tier: st.tier, correct: false, solved: false, attempts: st.attempts, ms: Date.now() - st.roundAt, first_input_ms: st.firstInput ? st.firstInput - st.roundAt : null });
        }
        end(st.inRound ? 'quit' : 'finished');
      }
      apiRef.current.level.current = null;
    };
    // once per play
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function end(reason: 'finished' | 'quit') {
    const st = s.current;
    if (st.ended) return;
    st.ended = true;
    const lv = apiRef.current.level.current;
    log('game_end', { ...base(), reason, rounds: st.rounds, ms: Date.now() - st.at, rapid_taps: st.rapid, help_levels: lv?.helpStep ?? 0, adult_helped: !!lv?.adultHelped, ...st.endExtra });
  }

  return useMemo(() => ({
    /** A round is on screen (`again`: started by "¡Otra vez!", a voluntary replay). */
    roundStart(round: number, tier: number) {
      Object.assign(s.current, { roundAt: Date.now(), firstInput: 0, inRound: true, attempts: 0, round, tier });
    },
    /** The child's first input of the round (only the first counts). */
    input() { if (!s.current.firstInput) s.current.firstInput = Date.now(); },
    /** A try was judged (a serve, a dance…). */
    attempt() { s.current.attempts++; },
    /** The round is won; `extra` the game's own measures. Returns what free play's level_end should say. */
    roundWon(extra: Record<string, unknown> = {}, again = false): LevelEnd {
      const st = s.current;
      st.inRound = false;
      st.rounds++;
      const ms = Date.now() - st.roundAt;
      log('game_round', {
        ...base(), round: st.round, tier: st.tier, correct: st.attempts <= 1, solved: true, attempts: st.attempts, ms,
        first_input_ms: st.firstInput ? st.firstInput - st.roundAt : null, ...(again ? { again: true } : {}), ...extra,
      });
      const lv = apiRef.current.level.current;
      return { level_id: gameLevelId(game), activity: game, outcome: 'win', time_ms: ms, attempts: st.attempts, help_levels: lv?.helpStep ?? 0, blocks_optimal: 0, adult_helped: !!lv?.adultHelped, round: st.round, tier: st.tier };
    },
    rapid() { s.current.rapid++; },
    /** The game's own measures for `game_end`, whenever it comes (T45: the longest dance). */
    endInfo(extra: Record<string, unknown>) { Object.assign(s.current.endExtra, extra); },
    end,
    log,
    state: () => s.current,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
}

// ------------------------------------------------------------------ the dizzy rule

/**
 * `hit()` before acting on any tap on a game target: false while the
 * character is dizzy and for the tap that made it dizzy (then `onDizzy` runs
 * and `rapid_taps` is logged). `dizzy` is true for the spell (DIZZY_MS).
 */
export function useRapidTaps(game: GameId, round: () => number, onDizzy: () => void, logRapid: () => void) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const det = useRef(createRapidTaps());
  const [dizzy, setDizzy] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current != null) clearTimeout(timer.current); }, []);
  const cb = useRef(onDizzy);
  cb.current = onDizzy;
  const hit = () => {
    const r = det.current.tap(Date.now());
    if (r.dizzy) {
      apiRef.current.log('rapid_taps', { game, round: round(), taps: r.taps, window_ms: r.window_ms });
      logRapid();
      setDizzy(true);
      timer.current = window.setTimeout(() => setDizzy(false), DIZZY_MS);
      cb.current();
    }
    return r.allowed;
  };
  return { hit, dizzy };
}

// ------------------------------------------------------------------ the child's character in the scene

type Actor = NonNullable<StageView['actor']>;

/** Goes dizzy and sits down for a moment (the boards' own dizzy swirls), then stands up. */
export async function sitDizzy(view: StageView | null, ms = DIZZY_MS) {
  const a: Actor | null | undefined = view?.actor;
  if (!a) return;
  view!.poke();
  await a.act(async () => {
    a.dizzy(true);
    if (!REDUCED) {
      await a.T({ sy: 0.72, sx: 1.18, hop: 0 }, 160);
      await a.P(Math.max(300, ms - 600), (p, t) => { a.rig.lean = Math.sin(t / 150) * 9 * (1 - p * 0.6); });
      a.rig.lean = 0;
      await a.T({ sy: 1.06, sx: 0.96 }, 160);
      await a.T({ sy: 1, sx: 1 }, 140);
    } else await a.wait(ms - 200);
    a.dizzy(false);
  });
}

/**
 * The child's character standing in a game's SVG scene, feet at (x, y),
 * `w` units wide (a nested <svg> holding its own StageView). `onView` gets
 * the view to act on (cheer, wince, dizzy).
 */
export function Buddy({ x, y, w = 150, onView }: { x: number; y: number; w?: number; onView(v: StageView | null): void }) {
  const player = usePlayer();
  const h = w * (164 / 160);
  const { ref, view } = useStage(player, { x: -80, y: -150, w: 160, h: 164 }, { shadow: true });
  const cb = useRef(onView);
  cb.current = onView;
  useEffect(() => { cb.current(view.current); return () => cb.current(null); }, [view]);
  return (
    <svg
      ref={ref} className="ga-buddy" x={x - w / 2} y={y - h * (150 / 164)} width={w} height={h} overflow="visible"
      data-player={player.def.id} aria-hidden="true"
    />
  );
}

/** Dizzy swirls and stars over the scene's character while it sits dizzy (drawn by the scene, in its units). */
export function DizzyStars({ x, y }: { x: number; y: number }) {
  return (
    <g className="ga-dizzy-stars" transform={`translate(${x} ${y})`} aria-hidden="true">
      <g className="ga-orbit">
        {[0, 1, 2].map((i) => (
          <path
            key={i} transform={`rotate(${i * 120}) translate(46 0)`}
            d="M0,-11 L3.2,-3.4 11,-3.4 4.8,1.8 7,10 0,5.2 -7,10 -4.8,1.8 -11,-3.4 -3.2,-3.4Z"
            fill="#f0d27a" stroke="#2b2622" strokeWidth={2.2} strokeLinejoin="round"
          />
        ))}
      </g>
    </g>
  );
}

// ------------------------------------------------------------------ buttons

/** "¡Listo!": a big service bell; it rings (glows) once there is something to serve. */
export function ReadyButton({ ready, onPress, label = '¡Listo!' }: { ready: boolean; onPress(): void; label?: string }) {
  return (
    <button type="button" className={`cut ga-ready ga-target${ready ? ' is-ready' : ''}`} aria-label={label} aria-disabled={!ready} onClick={onPress}>
      <BellArt size={76} />
      <span className="ga-ready-word" aria-hidden="true">{label}</span>
    </button>
  );
}

/** "¡Otra vez!": the next round, a little harder. */
export function AgainButton({ onPress }: { onPress(): void }) {
  return (
    <button type="button" className="cut ga-again" aria-label="¡Otra vez!" onClick={onPress}>
      <AgainLoopArt size={70} />
      <span className="ga-again-word" aria-hidden="true">¡Otra vez!</span>
    </button>
  );
}

const CONFETTI = ['#de8a56', '#c9574a', '#e7a3a0', '#7298c1', '#f0d27a', '#a4b86d'];

/** The juicy win: paper confetti raining over the whole screen for a moment. */
export function ConfettiRain({ n = 46, seed = 1 }: { n?: number; seed?: number }) {
  const bits = useMemo(() => Array.from({ length: n }, (_, i) => {
    const r = (k: number) => { const v = Math.sin((seed * 97 + i * 31 + k * 13) * 12.9898) * 43758.5453; return v - Math.floor(v); };
    return { x: r(1) * 100, d: r(2) * 0.5, s: 0.8 + r(3) * 0.9, c: CONFETTI[i % CONFETTI.length], rot: r(4) * 360, dx: (r(5) - 0.5) * 30, round: r(6) > 0.6 };
  }), [n, seed]);
  if (REDUCED) return null;
  return (
    <div className="ga-confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <span
          key={i} className={b.round ? 'is-dot' : ''}
          style={{ left: `${b.x}%`, background: b.c, animationDelay: `${b.d}s`, animationDuration: `${1.5 * b.s + 0.6}s`, '--rot': `${b.rot}deg`, '--dx': `${b.dx}vw` } as CSSProperties}
        />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ the idle nudge

/**
 * After a while with no input (T52: 8 s), ✋ wiggles and the targets glow
 * (never solves anything); `ghost`, when given, also shows the next thing to
 * do (a ghost hand pointing at it, or the dance again). It comes back every
 * 10 s while nothing happens.
 */
export function useIdleNudge(rootRef: React.RefObject<HTMLElement | null>, lastInput: () => number, active: () => boolean, ms = IDLE_MS, ghost?: () => void) {
  const cb = useRef(ghost);
  cb.current = ghost;
  useEffect(() => {
    let last = 0;
    const id = window.setInterval(() => {
      const root = rootRef.current;
      const now = Date.now();
      if (!root || !active() || document.hidden || document.querySelector('.ghost-hand')) return;
      if (now - lastInput() < ms || now - last < 10_000) return;
      last = now;
      wiggleHelp(root);
      glowTargets(root, 2400);
      cb.current?.();
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** T52: how long without input before the idle nudge shows the next thing to do. */
export const IDLE_MS = 8000;

/** A row of little marks for the rounds of a play (the won ones filled): the bar's progress. */
export function RoundDots({ total, done }: { total: number; done: number }): ReactNode {
  return (
    <span className="ga-dots" aria-hidden="true" data-done={done}>
      {Array.from({ length: total }, (_, i) => <span key={i} className={i < done ? 'is-done' : ''} />)}
    </span>
  );
}
