// Copa v2 garage: the icons of the blocks. Drawn in code (SVG, no emoji: this
// Pi's Chromium has no colour-emoji font), in the notebook's style: ink strokes
// on a flat coloured badge. Big and plain so a 9-year-old reads the picture
// first and the word second.

import type { ReactNode } from 'react';
import type { BlockKind, Sensor } from './program';

const INK = '#2b2622';

export type IconKind = BlockKind | 'on_log';

/** The badge colour of each block (movement orange, jump green, turbo gold, brake red, wait blue, repeat lilac, si teal, nitro amber, event wood). */
export const TINT: Readonly<Record<IconKind, string>> = {
  forward: '#f0b88f', up: '#f0b88f', down: '#f0b88f', jump: '#bcd08a', turbo: '#f0d27a', brake: '#eba7a1',
  wait: '#b6cde4', repeat: '#d3c2ea', if: '#98d0c8', nitro: '#f3c07a', on_log: '#d9b48a',
};

const stroke = { fill: 'none', stroke: INK, strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function glyph(kind: IconKind): ReactNode {
  switch (kind) {
    case 'forward': return <path d="M9,24 H36 M25,12 L38,24 L25,36" {...stroke} />;
    case 'up': return <path d="M11,37 L35,13 M20,12 H36 V28" {...stroke} />;
    case 'down': return <path d="M11,11 L35,35 M20,36 H36 V20" {...stroke} />;
    case 'jump': return (
      <>
        <path d="M7,37 C11,6 37,6 41,34" {...stroke} />
        <path d="M33,29 L41,37 L45,26" {...stroke} strokeWidth={4.5} />
      </>
    );
    case 'turbo': return (
      <>
        <path d="M24,4 C27,13 38,17 36,30 C35,39 30,44 24,44 C17,44 11,39 12,31 C13,25 18,22 19,14 C21,17 22,19 24,19 C25,13 24,9 24,4 Z" fill="#e0592f" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        <path d="M24,25 C27,29 30,31 28,36 C27,39 25,40 24,40 C21,40 19,38 20,35 C21,32 23,30 24,25 Z" fill="#f7dd7a" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      </>
    );
    case 'brake': return (
      <>
        <rect x={7} y={21} width={34} height={19} rx={5} fill="#c9574a" stroke={INK} strokeWidth={3.2} />
        <path d="M14,26 V35 M21,26 V35 M28,26 V35 M35,26 V35" stroke={INK} strokeWidth={3} strokeLinecap="round" />
        <path d="M24,4 V15 M18,10 L24,16 L30,10" {...stroke} strokeWidth={4} />
      </>
    );
    case 'wait': return (
      <>
        <circle cx={24} cy={26} r={16} fill="#fbf7ee" stroke={INK} strokeWidth={3.4} />
        <path d="M24,26 V15 M24,26 L32,31" {...stroke} strokeWidth={4} />
        <path d="M10,9 L16,14 M38,9 L32,14" {...stroke} strokeWidth={4} />
      </>
    );
    case 'repeat': return (
      <>
        <path d="M37,19 A14,14 0 1 0 38,29" {...stroke} strokeWidth={4.5} />
        <path d="M38,8 L38,20 L26,19" {...stroke} strokeWidth={4.5} />
      </>
    );
    case 'if': return (
      <>
        <path d="M3,24 C12,9 36,9 45,24 C36,39 12,39 3,24 Z" fill="#fbf7ee" stroke={INK} strokeWidth={3.2} strokeLinejoin="round" />
        <ellipse cx={24} cy={25} rx={10} ry={7} fill="#5fa8d3" stroke={INK} strokeWidth={2.6} />
        <ellipse cx={21} cy={22.5} rx={3.4} ry={1.8} fill="#cfe9f6" />
      </>
    );
    case 'nitro': return (
      <>
        <path d="M19,12 V7 H29 V12" {...stroke} strokeWidth={3.4} />
        <rect x={13} y={12} width={22} height={30} rx={5} fill="#f3a64d" stroke={INK} strokeWidth={3.2} />
        <path d="M26,16 L19,28 H25 L22,38 L31,25 H25 Z" fill="#f7e08a" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      </>
    );
    case 'on_log': return (
      <>
        <rect x={5} y={20} width={38} height={18} rx={9} fill="#8a5a33" stroke={INK} strokeWidth={3} />
        <circle cx={10} cy={29} r={8} fill="#c69765" stroke={INK} strokeWidth={3} />
        <circle cx={38} cy={29} r={8} fill="#c69765" stroke={INK} strokeWidth={3} />
        <path d="M24,3 V14 M18,9 L24,15 L30,9" {...stroke} strokeWidth={4} />
      </>
    );
  }
}

/** A block's picture on its coloured badge. */
export function BlockIcon({ kind, size = 46, bare = false }: { kind: IconKind; size?: number; bare?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className="gx-icon">
      {!bare && <rect x={1.5} y={1.5} width={45} height={45} rx={12} fill={TINT[kind]} stroke={INK} strokeWidth={2.6} />}
      {glyph(kind)}
    </svg>
  );
}

/** The picture of a sensor (what a `si` looks at). */
export function SensorIcon({ sensor, size = 34 }: { sensor: Sensor; size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className="gx-icon">
      {sensor === 'puddle_ahead' && (
        <>
          <ellipse cx={24} cy={28} rx={20} ry={10} fill="#5fa8d3" stroke={INK} strokeWidth={3} />
          <ellipse cx={17} cy={25} rx={6} ry={2.6} fill="#cfe9f6" />
          <path d="M20,6 V15 M15,11 L20,16 L25,11" {...stroke} strokeWidth={3.4} />
        </>
      )}
      {sensor === 'straight_ahead' && (
        <>
          <rect x={3} y={14} width={42} height={22} rx={5} fill="#e8d5ac" stroke={INK} strokeWidth={3} />
          <path d="M11,25 L17,25 M14,19 L20,25 L14,31 M26,19 L32,25 L26,31" {...stroke} strokeWidth={3.4} stroke="#b58a2f" />
        </>
      )}
      {sensor === 'nitro_positive' && glyph('nitro')}
    </svg>
  );
}

/** The ghost hand's target: a circle that pulses (CSS). Used as a plain ring over a button. */
export function PressRing() {
  return <span className="gx-ring" aria-hidden="true" />;
}
