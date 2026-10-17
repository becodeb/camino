// The classroom round (T14): what one adult for a whole room needs to see
// and do, drawn in the notebook's style (ink boiled by #rough, flat colours
// with one darker facet, flat shadows, blue pen for marks).
// - RouteFlag: once a child has done the core route, a big green flag in
//   the top bar (and the bar's green edge), seen from across the room: the
//   adult knows who can do the survey now. A tap says "seguí jugando"; the
//   adult's long press opens the survey.
// - FiveMinBanner: "¡Quedan 5 minutos!", calm, spoken (and captioned), for
//   a few seconds below the bar.
// - GamesAllBanner (T37): "¡Hora de juegos!", a short friendly notice (also
//   spoken and captioned) shown once a device actually moves to the
//   free-play menu from "Juegos para todos" (no banner where the command
//   was a no-op: the device was already in free play, or not past the
//   character screen).
// - ClassEndBanner (T28): "terminar la clase" no longer cuts the child off
//   at once — a non-blocking banner (the clock-face countdown, captioned)
//   floats over whatever is on screen for CLASS_END_SECONDS while the child
//   keeps playing; only then does the session actually end.
// - ClassEnd (the flow step, after the banner and the real end): the
//   child's own garden (SessionGarden, what this sitting grew) as a calm
//   resting page, until the device is put away: back to the start by itself
//   once the lid is closed and reopened (`visibilitychange`, with a minimal
//   hidden time so a quick tab flicker does not reset it) or after
//   REST_FALLBACK_MS with the page left open the whole time; the adult's
//   long press is kept as an immediate shortcut (T22: back-to-back classes
//   on the same computers never need the adult to unblock the next child).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { blob, wobblyLine } from '../ink/ink.js';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { useBar } from './Captions';
import { useHold } from './AdultControls';
import { usePlaytest } from './context';
import { realInterval, realTimeout } from './demo';
import { SessionGarden } from './SessionGarden';
import type { StepViewProps } from './steps';

const INK = '#2b2622';
const PEN = '#3d6ea5';
const SHADOW = 'rgba(84, 62, 38, 0.2)';
const PAPER = '#fbf7ee';
const GREEN = '#8fae4f';
const GREEN_DARK = '#6f8f3a';

export const FLAG_HOLD_MS = 1500;
/** T28: how long the non-blocking countdown banner shows before the session actually ends. */
export const CLASS_END_SECONDS = 10;
export const REST_HOLD_MS = 2000;
/** T28: the resting garden returns to the start by itself after this long with the page left open the whole time (no lid close/open seen). */
export const REST_FALLBACK_MS = 5 * 60_000;
/** T28: the page must have been hidden at least this long to count as "the lid was closed" (a quick tab flicker does not reset the resting garden). */
export const REST_HIDDEN_MIN_MS = 2000;

const LINES = {
  flag: '¡Terminaste el camino! Seguí jugando a lo que quieras.',
  five: '¡Quedan cinco minutos! Terminá lo que estás haciendo.',
  endingSoon: '¡Últimos segundos! Terminá lo que estás haciendo.',
  rest: '¡Gracias por jugar! Hasta la próxima.',
  gamesAll: '¡Hora de juegos! Elegí uno del menú.',
};

// ------------------------------------------------------------------ the green flag

/** A pole with a big green pennant waving, a white check on the cloth. */
export function RouteFlagArt({ size = 1 }: { size?: number }) {
  const cloth = 'M16,8 C34,0 50,14 72,6 C86,2 98,6 108,4 L106,44 C94,48 82,42 68,48 C48,56 32,42 16,48 Z';
  return (
    <svg className="pp-flag-art" viewBox="0 0 116 76" style={{ width: 116 * size, height: 76 * size }} aria-hidden="true">
      <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx={14} cy={72} rx={11} ry={3} fill={SHADOW} />
        <g className="pp-flag-cloth">
          <path d={cloth} transform="translate(4 5)" fill={SHADOW} />
          <path d={cloth} fill={GREEN} stroke={INK} strokeWidth={3} />
          <path d="M72,6 C86,2 98,6 108,4 L106,44 C94,48 82,42 68,48 C80,36 82,20 72,6 Z" fill={GREEN_DARK} opacity={0.55} />
          <path d="M40,27 L52,38 L78,14" fill="none" stroke={PAPER} strokeWidth={7} />
        </g>
        <path d={wobblyLine(14, 72, 15, 4, { bow: 0.8, seed: 3 })} fill="none" stroke={INK} strokeWidth={4.4} />
        <circle cx={15} cy={4} r={4.2} fill="#f0d27a" stroke={INK} strokeWidth={2.2} />
      </g>
    </svg>
  );
}

/** The flag in the top bar (or at the top of a screen without one); the adult's long press opens the survey. */
export function RouteFlag() {
  const api = usePlaytest();
  const bar = useBar();
  const [hold, setHold] = useState<number | null>(null);
  const canSurvey = !api.flow.surveyDone;
  useHold(FLAG_HOLD_MS, (e) => !!(e.target as Element | null)?.closest?.('.pp-flag'), () => { if (canSurvey) api.openSurvey('flag'); }, setHold);
  const flag = (
    <button
      type="button" className={`pp-flag${bar ? '' : ' is-float'}`} data-route-done="true"
      aria-label="Terminó el camino (adulto: mantené apretado para la encuesta)"
      style={hold != null ? { ['--hold' as string]: hold } : undefined}
      onClick={() => speak(LINES.flag)}
    >
      <RouteFlagArt size={1.25} />
      {hold != null && canSurvey && <span className="pp-flag-hold" aria-hidden="true" />}
    </button>
  );
  return bar ? createPortal(flag, bar) : flag;
}

// ------------------------------------------------------------------ "quedan 5 minutos"

/** A clock face with the last five minutes shaded, the hand near the top. */
export function FiveClockArt() {
  return (
    <svg className="pp-five-clock" viewBox="0 0 80 84" aria-hidden="true">
      <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30,8 L50,8" stroke={INK} strokeWidth={4} />
        <path d="M40,8 L40,14" stroke={INK} strokeWidth={4} />
        <path d={blob(40, 48, 32, 32, { wob: 0.03, n: 12, seed: 5 })} transform="translate(3 4)" fill={SHADOW} />
        <path d={blob(40, 48, 32, 32, { wob: 0.03, n: 12, seed: 5 })} fill={PAPER} stroke={INK} strokeWidth={3.2} />
        {/* the last five minutes, shaded like a slice */}
        <path d="M40,48 L40,20 A28,28 0 0 1 54,23.8 Z" fill="#f0d27a" stroke={INK} strokeWidth={2} />
        {[0, 1, 2, 3].map((i) => {
          const a = (i * Math.PI) / 2;
          return <path key={i} d={`M${40 + Math.sin(a) * 24},${48 - Math.cos(a) * 24} L${40 + Math.sin(a) * 28},${48 - Math.cos(a) * 28}`} stroke={INK} strokeWidth={2.6} />;
        })}
        <path d="M40,48 L40,26" stroke={PEN} strokeWidth={4.4} />
        <path d="M40,48 L52,52" stroke={INK} strokeWidth={4} />
        <circle cx={40} cy={48} r={3.4} fill={INK} />
      </g>
    </svg>
  );
}

/** "¡Quedan 5 minutos!" below the bar for a few seconds, said aloud (and so captioned). */
export function FiveMinBanner({ done }: { done(): void }) {
  const doneRef = useRef(done);
  doneRef.current = done;
  useEffect(() => {
    speak(LINES.five);
    const t = realTimeout(() => doneRef.current(), 9000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="pp-five" role="status" aria-label="Quedan 5 minutos">
      <div className="pp-five-card sheet">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <FiveClockArt />
        <p className="pp-five-text">¡Quedan 5 minutos!</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ T37: "Juegos para todos"

/** A drawn game controller: the d-pad cross and two round buttons. */
export function GameControllerArt() {
  return (
    <svg className="pp-games-controller" viewBox="0 0 96 64" aria-hidden="true">
      <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
        <path d={blob(48, 34, 42, 24, { wob: 0.05, n: 10, seed: 7 })} transform="translate(3 4)" fill={SHADOW} />
        <path d={blob(48, 34, 42, 24, { wob: 0.05, n: 10, seed: 7 })} fill={PAPER} stroke={INK} strokeWidth={3.2} />
        <path d="M22,28 L22,40 M16,34 L28,34" stroke={INK} strokeWidth={5.4} />
        <circle cx={66} cy={26} r={5.4} fill={GREEN} stroke={INK} strokeWidth={2.2} />
        <circle cx={78} cy={34} r={5.4} fill="#de8a56" stroke={INK} strokeWidth={2.2} />
      </g>
    </svg>
  );
}

/**
 * T37: "Juegos para todos" opened the free-play menu on a device that was
 * still on the core route — a short, friendly, wordless-safe notice (also
 * spoken and captioned) over the new free-play menu, gone on its own; it
 * never blocks the menu itself (the child can tap a card right away).
 */
export function GamesAllBanner({ done }: { done(): void }) {
  const doneRef = useRef(done);
  doneRef.current = done;
  useEffect(() => {
    speak(LINES.gamesAll);
    const t = realTimeout(() => doneRef.current(), 5000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="pp-games-all" role="status" aria-label="Hora de juegos">
      <div className="pp-games-all-card sheet">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <GameControllerArt />
        <p className="pp-games-all-text">¡Hora de juegos!</p>
      </div>
    </div>
  );
}

/**
 * T28: a device asleep (lid closed) when "terminar la clase" was sent can
 * wake up long after — the data showed commands reaching devices 24–26 min
 * late, at the start of the NEXT class, with a new child already sitting
 * down. That child should never see the old child's countdown or garden:
 * past this age the device instead ends the stale session silently and
 * goes straight to a fresh start (PlaytestScreen.tsx's onCommand).
 */
export const LATE_END_CLASS_MS = 2 * 60_000;

/**
 * Pure: has the command's `at` (the server's clock, when el docente pressed
 * the button) become too old by `now` (the device's clock — the only one
 * available here; there is no server-relative timestamp in the sync answer
 * to correct for device clock drift) to still show the countdown and the
 * garden? An unparsable `at` is never late: a banner shown a little oddly
 * is a smaller problem than silently dropping a child's own ending.
 */
export function isLateEndClass(sentAt: string, now: number, thresholdMs = LATE_END_CLASS_MS): boolean {
  const at = Date.parse(sentAt);
  if (!Number.isFinite(at)) return false;
  return now - at > thresholdMs;
}

// ------------------------------------------------------------------ "terminar la clase": the non-blocking countdown, then the resting garden

/** The countdown: a clock face whose yellow slice empties with the seconds, the number big in the middle. */
export function CountdownArt({ left, total }: { left: number; total: number }) {
  const f = Math.max(0, Math.min(1, left / total));
  const a = f * Math.PI * 2;
  const x = 60 + Math.sin(a) * 46, y = 60 - Math.cos(a) * 46;
  const slice = f >= 1 ? 'M60,14 A46,46 0 1 1 59.99,14 Z' : f <= 0 ? '' : `M60,60 L60,14 A46,46 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)},${y.toFixed(2)} Z`;
  return (
    <svg className="pp-countdown" viewBox="0 0 120 120" role="img" aria-label={`${left} segundos`}>
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <path d={blob(60, 60, 54, 54, { wob: 0.02, n: 12, seed: 9 })} transform="translate(4 5)" fill={SHADOW} />
        <path d={blob(60, 60, 54, 54, { wob: 0.02, n: 12, seed: 9 })} fill={PAPER} stroke={INK} strokeWidth={3.4} />
        {slice && <path d={slice} fill="#f0d27a" stroke={INK} strokeWidth={2} />}
        <path d={blob(60, 60, 27, 27, { wob: 0.03, n: 10, seed: 4 })} fill={PAPER} stroke={INK} strokeWidth={2.6} />
      </g>
      <text x={60} y={72.5} textAnchor="middle" className="pp-countdown-n">{left}</text>
    </svg>
  );
}

/**
 * T28: "terminar la clase" no longer cuts the child off at once. This banner
 * floats over whatever is on screen for CLASS_END_SECONDS (non-blocking: the
 * child keeps playing through it) with the clock-face countdown — readable
 * with no sound and no reading — and the line also captioned; `done()` runs
 * once, at zero (the caller actually ends the session and moves to the
 * resting garden then, not before).
 */
export function ClassEndBanner({ done }: { done(): void }) {
  const doneRef = useRef(done);
  doneRef.current = done;
  const [left, setLeft] = useState(CLASS_END_SECONDS);
  useEffect(() => {
    speak(LINES.endingSoon);
    const t0 = Date.now();
    const id = realInterval(() => {
      const l = Math.max(0, CLASS_END_SECONDS - Math.floor((Date.now() - t0) / 1000));
      setLeft(l);
      if (l === 0) { window.clearInterval(id); doneRef.current(); }
    }, 250);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="pp-end-banner" role="status" aria-label={`Termina la actividad en ${left} segundos`}>
      <div className="pp-end-banner-card sheet">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <CountdownArt left={left} total={CLASS_END_SECONDS} />
        <p className="pp-end-banner-text">¡Últimos segundos!</p>
      </div>
    </div>
  );
}

/**
 * The class is over and the session has already ended (`end_reason:
 * 'class_end'`, after ClassEndBanner's countdown): the child's own garden
 * (SessionGarden, what this sitting grew, the character standing in it) as
 * a calm resting page. The device is ready for the next child by itself
 * once it is put away: back to the start when the lid is closed and
 * reopened (the page hidden, then visible again — REST_HIDDEN_MIN_MS keeps
 * a quick tab flicker from resetting it) or after REST_FALLBACK_MS with the
 * page left open the whole time; the adult's long press is kept as an
 * immediate shortcut (useful right after ending the class, before any lid
 * closes).
 */
export function ClassEnd({ newSession }: StepViewProps) {
  const newSessionRef = useRef(newSession);
  newSessionRef.current = newSession;
  const [hold, setHold] = useState<number | null>(null);
  const goRef = useRef(() => { stopSpeaking(); newSessionRef.current(); });

  useEffect(() => speakWhenAllowed(LINES.rest), []);

  // a fallback for a device that is never closed between classes
  useEffect(() => {
    const t = realTimeout(() => goRef.current(), REST_FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, []);

  // the lid closed and reopened: the page hidden, then visible again (not a quick flicker)
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt != null && Date.now() - hiddenAt >= REST_HIDDEN_MIN_MS) goRef.current();
      hiddenAt = null;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useHold(REST_HOLD_MS, (e) => !!(e.target as Element | null)?.closest?.('.pp-rest-start'), () => goRef.current(), setHold);

  return (
    <main className="pp-page pp-end is-rest" data-class-end="rest">
      <section className="sheet pp-end-card" aria-label="Jardín de hoy">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <h1 className="pp-end-title">¡Terminamos por hoy!</h1>
        <div className="pp-end-garden"><SessionGarden cheer={0} /></div>
      </section>
      <button type="button" className="pp-rest-start" aria-label="Para el adulto: mantené apretado para empezar otra sesión" style={hold != null ? { ['--hold' as string]: hold } : undefined}>
        <span>Adulto: mantené apretado para empezar otra vez</span>
        {hold != null && <span className="pp-rest-ring" aria-hidden="true" />}
      </button>
    </main>
  );
}
