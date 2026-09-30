// The raised hand: the child's character, dressed, on a big yellow paper
// disc in the bottom-left corner (over the palette's empty end, never over
// the board and its goal), a big hand raised beside it waving gently, so
// an adult sees from across the room who is waiting (and, in small print
// for the adult, since when: the order of the hands in class). A tap by the
// child says help is coming; the adult's long press opens the help panel.
// Drawn like the rest: ink outline boiled by #rough, flat colours, a flat
// shadow, blue-pen marks.

import { useEffect, useRef, useState } from 'react';
import { blob } from '../ink/ink.js';
import { drawPortrait } from '../ui/board/BoardView';
import { speak } from '../ui/speech';
import { playerKey, usePlayer } from '../screens/player';
import { useHold } from './AdultControls';
import type { HandState } from './context';

const INK = '#2b2622';
const PEN = '#3d6ea5';
const LINES = {
  up: 'Levantaste la mano. Ya te vienen a ayudar.',
  tap: 'Ya te vienen a ayudar.',
};

/** The wrist, in the drawing's units: the hand turns around it. */
const WRIST = { x: 166, y: 142 };
const HAND_K = 6.2;
/** The hand of ✋ (ui/icons HelpIcon), open, palm to the room. */
const HAND_D = 'M7.4,13.2 L7.2,6.6 C7.2,5.3 9.1,5.2 9.2,6.5 L9.4,11.2 L9.3,4.4 C9.3,3 11.3,3 11.4,4.4 L11.6,10.8 L11.7,4.1 C11.8,2.7 13.8,2.8 13.8,4.2 L13.8,11 L14.3,5.5 C14.4,4.2 16.3,4.3 16.3,5.6 L16.1,13.4 L17.6,11.2 C18.4,10 20.2,10.9 19.5,12.3 C18.4,14.6 17.2,17.4 15.4,19.1 C14.3,20.2 12.8,20.8 11.3,20.8 C8.8,20.8 7.4,19 7.4,16.4 Z';

function Portrait() {
  const player = usePlayer();
  const ref = useRef<SVGSVGElement>(null);
  const key = playerKey(player);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ref.current) drawPortrait(player.def, ref.current, { x: 0.35, y: -0.35 }, 'smile', player.outfit); }, [key]);
  return <svg ref={ref} x={6} y={104} width={132} height={132} viewBox="-52 -100 104 104" overflow="visible" aria-hidden="true" />;
}

function minutesSince(t: number) {
  return Math.max(0, Math.floor((Date.now() - t) / 60_000));
}

export function RaisedHand({ hand, holdMs, onAdult }: { hand: HandState; holdMs: number; onAdult: () => void }) {
  const [hold, setHold] = useState<number | null>(null);
  const [mins, setMins] = useState(() => minutesSince(hand.since));
  const [poke, setPoke] = useState(0);
  useHold(holdMs, (e) => !!(e.target as Element | null)?.closest?.('.pp-hand'), onAdult, setHold);
  useEffect(() => { speak(LINES.up); }, []);
  useEffect(() => {
    const t = setInterval(() => setMins(minutesSince(hand.since)), 10_000);
    return () => clearInterval(t);
  }, [hand.since]);
  const disc = blob(110, 140, 100, 100, { wob: 0.05, n: 11, seed: 41 });
  return (
    <div
      className={`pp-hand${poke ? ' is-poked' : ''}`}
      key={poke}
      role="img"
      aria-label="Mano levantada: está esperando ayuda"
      data-level={hand.level_id}
      onClick={() => { speak(LINES.tap); setPoke((n) => n + 1); }}
    >
      <svg viewBox="0 0 220 260" aria-hidden="true">
        <path d={disc} fill="rgba(84, 62, 38, 0.2)" transform="translate(6 8)" filter="url(#rough)" />
        <path d={disc} fill="#f0d27a" stroke={INK} strokeWidth={3.4} strokeLinejoin="round" filter="url(#rough)" />
        <path d={blob(110, 140, 85, 85, { wob: 0.04, n: 10, seed: 42 })} fill="none" stroke={INK} strokeOpacity={0.35} strokeWidth={1.6} strokeDasharray="2 7" strokeLinecap="round" />
        <Portrait />
        <g className="pp-wave" style={{ transformOrigin: `${WRIST.x}px ${WRIST.y}px` }}>
          <g transform={`translate(${WRIST.x - 11.5 * HAND_K} ${WRIST.y - 20.8 * HAND_K}) scale(${HAND_K})`} filter="url(#rough)">
            <path d={HAND_D} fill="#eeac7f" stroke={INK} strokeWidth={1.15} strokeLinejoin="round" />
          </g>
        </g>
        <g className="pp-ticks" stroke={PEN} strokeWidth={4} strokeLinecap="round" fill="none">
          <path d="M128,36 L114,26" />
          <path d="M122,64 L104,62" />
          <path d="M232,34 L224,48" />
          <path d="M238,72 L222,76" />
        </g>
        {hold != null && (
          <circle cx={110} cy={140} r={108} fill="none" stroke={PEN} strokeWidth={6} strokeLinecap="round"
            pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - hold} transform="rotate(-90 110 140)" />
        )}
      </svg>
      <span className="pp-hand-wait" aria-hidden="true">{mins < 1 ? 'recién' : `${mins} min`}</span>
    </div>
  );
}
