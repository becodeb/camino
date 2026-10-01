// The classroom round (T14): what one adult for a whole room needs to see
// and do, drawn in the notebook's style (ink boiled by #rough, flat colours
// with one darker facet, flat shadows, blue pen for marks).
// - RouteFlag: once a child has done the core route, a big green flag in
//   the top bar (and the bar's green edge), seen from across the room: the
//   adult knows who can do the survey now. A tap says "seguí jugando"; the
//   adult's long press opens the survey.
// - FiveMinBanner: "¡Quedan 5 minutos!", calm, spoken (and captioned), for
//   a few seconds below the bar.
// - ClassEnd (a flow step): "Actividad terminada", the character waving and
//   a 10-second countdown drawn as a clock face emptying; then the session
//   ends, the queue is sent, and a resting page waits for an adult (a long
//   press) to start a new session.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { blob, wobblyLine } from '../ink/ink.js';
import { drawPortrait } from '../ui/board/BoardView';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { playerKey, usePlayer } from '../screens/player';
import { useBar } from './Captions';
import { useHold } from './AdultControls';
import { usePlaytest } from './context';
import { realInterval, realTimeout } from './demo';
import type { StepViewProps } from './steps';

const INK = '#2b2622';
const PEN = '#3d6ea5';
const SHADOW = 'rgba(84, 62, 38, 0.2)';
const PAPER = '#fbf7ee';
const GREEN = '#8fae4f';
const GREEN_DARK = '#6f8f3a';

export const FLAG_HOLD_MS = 1500;
export const CLASS_END_SECONDS = 10;
export const REST_HOLD_MS = 2000;

const LINES = {
  flag: '¡Terminaste el camino! Seguí jugando a lo que quieras.',
  five: '¡Quedan cinco minutos! Terminá lo que estás haciendo.',
  end: '¡Actividad terminada! Gracias por jugar.',
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

// ------------------------------------------------------------------ "Actividad terminada"

/** The character's portrait, dressed, with a big hand waving goodbye beside it. */
function WavingCharacter() {
  const player = usePlayer();
  const ref = useRef<SVGSVGElement>(null);
  const key = playerKey(player);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ref.current) drawPortrait(player.def, ref.current, { x: 0.3, y: -0.2 }, 'grin', player.outfit); }, [key]);
  const hand = 'M7.4,13.2 L7.2,6.6 C7.2,5.3 9.1,5.2 9.2,6.5 L9.4,11.2 L9.3,4.4 C9.3,3 11.3,3 11.4,4.4 L11.6,10.8 L11.7,4.1 C11.8,2.7 13.8,2.8 13.8,4.2 L13.8,11 L14.3,5.5 C14.4,4.2 16.3,4.3 16.3,5.6 L16.1,13.4 L17.6,11.2 C18.4,10 20.2,10.9 19.5,12.3 C18.4,14.6 17.2,17.4 15.4,19.1 C14.3,20.2 12.8,20.8 11.3,20.8 C8.8,20.8 7.4,19 7.4,16.4 Z';
  return (
    <svg className="pp-end-wave" viewBox="0 0 260 230" aria-hidden="true">
      <path d={blob(118, 128, 104, 96, { wob: 0.05, n: 11, seed: 61 })} transform="translate(6 8)" fill={SHADOW} filter="url(#rough)" />
      <path d={blob(118, 128, 104, 96, { wob: 0.05, n: 11, seed: 61 })} fill="#cfe0a8" stroke={INK} strokeWidth={3.2} filter="url(#rough)" />
      <svg ref={ref} x={0} y={70} width={170} height={170} viewBox="-52 -100 104 104" overflow="visible" />
      <g className="pp-end-hand" style={{ transformOrigin: '196px 150px' }}>
        <g transform={`translate(${196 - 11.5 * 6.4} ${150 - 20.8 * 6.4}) scale(6.4)`} filter="url(#rough)">
          <path d={hand} fill="#eeac7f" stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
        </g>
      </g>
      <g stroke={PEN} strokeWidth={4} strokeLinecap="round" fill="none" className="pp-end-ticks">
        <path d="M170,40 L160,26" /><path d="M236,44 L246,30" /><path d="M250,92 L262,86" />
      </g>
    </svg>
  );
}

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

/** A sleeping notebook: the resting page's drawing (a closed notebook with a pencil, three small z's in pen). */
function RestArt() {
  return (
    <svg className="pp-rest-art" viewBox="0 0 220 140" aria-hidden="true">
      <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30,52 L170,40 L184,112 L42,124 Z" transform="translate(5 6)" fill={SHADOW} />
        <path d="M30,52 L170,40 L184,112 L42,124 Z" fill="#7298c1" stroke={INK} strokeWidth={3} />
        {/* the spiral rings along the spine */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path key={i} d={`M${33 + i * 1.6},${60 + i * 11} c-9,-2 -9,7 0,7`} fill="none" stroke={INK} strokeWidth={2.4} />
        ))}
        <path d="M78,72 L150,66 L152,84 L80,90 Z" fill={PAPER} stroke={INK} strokeWidth={2.2} />
        <path d="M86,79 L140,75" stroke={PEN} strokeWidth={2} opacity={0.6} />
        <path d="M58,132 L196,104" stroke="#e9c46a" strokeWidth={9} />
        <path d="M58,132 L196,104" fill="none" stroke={INK} strokeWidth={2} opacity={0.5} />
        <path d="M196,104 L208,100 L198,110 Z" fill={INK} />
        <g fill="none" stroke={PEN} strokeWidth={3.2}>
          <path d="M170,24 L184,24 L170,36 L184,36" />
          <path d="M190,8 L200,8 L190,17 L200,17" />
          <path d="M150,30 L158,30 L150,37 L158,37" />
        </g>
      </g>
    </svg>
  );
}

/**
 * The class is over (el docente's "terminar la clase"): "Actividad terminada"
 * with the character waving and a 10-second countdown; at zero the session
 * ends (`end_reason: 'class_end'`) and the queue is sent; then a resting page
 * until an adult holds the button to start a new session.
 */
export function ClassEnd({ newSession }: StepViewProps) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const [left, setLeft] = useState(CLASS_END_SECONDS);
  const [rest, setRest] = useState(false);
  const [hold, setHold] = useState<number | null>(null);
  useEffect(() => {
    const off = speakWhenAllowed(LINES.end);
    const t0 = Date.now();
    const id = realInterval(() => {
      const l = Math.max(0, CLASS_END_SECONDS - Math.floor((Date.now() - t0) / 1000));
      setLeft(l);
      if (l === 0) {
        window.clearInterval(id);
        apiRef.current.endSession('class_end');
        setRest(true);
      }
    }, 250);
    return () => { off(); window.clearInterval(id); };
  }, []);
  useHold(REST_HOLD_MS, (e) => rest && !!(e.target as Element | null)?.closest?.('.pp-rest-start'), () => { stopSpeaking(); newSession(); }, setHold);
  return (
    <main className={`pp-page pp-end${rest ? ' is-rest' : ''}`} data-class-end={rest ? 'rest' : 'countdown'}>
      <section className="sheet pp-end-card" aria-label="Actividad terminada">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <h1 className="pp-end-title">Actividad terminada</h1>
        {rest ? (
          <>
            <RestArt />
            <p className="pp-end-say">¡Gracias por jugar! Hasta la próxima.</p>
          </>
        ) : (
          <div className="pp-end-row">
            <WavingCharacter />
            <CountdownArt left={left} total={CLASS_END_SECONDS} />
          </div>
        )}
      </section>
      {rest && (
        <button type="button" className="pp-rest-start" aria-label="Para el adulto: mantené apretado para empezar otra sesión" style={hold != null ? { ['--hold' as string]: hold } : undefined}>
          <span>Adulto: mantené apretado para empezar otra vez</span>
          {hold != null && <span className="pp-rest-ring" aria-hidden="true" />}
        </button>
      )}
    </main>
  );
}
