// The blocks of the editor, drawn as paper cutouts with the puzzle notch
// children know from Scratch and Pilas Bloques: a dent on top, a bump below,
// so a block snaps under the one above. Sala 5 blocks carry only a drawing
// (the demo's arrow cards, docs/05 §4 of habilidades). The outline is exact;
// the `rough` filter gives it the ink edge, like every `.cut`.
// Ported from habilidades (app/src/areas/algorithmic/ui/blocks.tsx @ 9b90d1d).

import { memo, type CSSProperties, type ReactNode } from 'react';
import { penLoop, smoothOpen, wobblyLine } from '../ink/ink.js';
import type { Dims } from '../game/editor';
import { parseCommand, type CardRef, type Dir } from '../game/model';

export const INK = '#2b2622';
export const TAPE_FILL = '#eadcb2';
export const START_FILL = '#de8a56';

/** Card colours per direction (docs/05 §2): ↑ blue, ↓ yellow, ← pink, → orange. */
export const DIR_FILL: Record<Dir, string> = { up: '#a9c3de', down: '#f2d98c', left: '#eeb3ac', right: '#eeac7f' };
const DIR_ROT: Record<Dir, number> = { up: -90, right: 0, down: 90, left: 180 };

export const refKey = (r: CardRef | { item: number; inner?: number } | null | undefined) =>
  (r ? (r.inner == null ? `${r.item}` : `${r.item}:${r.inner}`) : '');

/** A pen circle drawn around something (current step, hint). */
export function Ring({ seed = 1, tone = 'blue', dur = 260 }: { seed?: number; tone?: 'blue' | 'hint'; dur?: number }) {
  return (
    <svg className={`ring ring-${tone}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d={penLoop(50, 50, 46, 44, { seed })} pathLength={1} style={{ animationDuration: `${dur}ms` }} />
    </svg>
  );
}

/** The demo's arrow card drawing: a wobbly shaft and a soft head, turned to its direction. */
export const Arrow = memo(function Arrow({ dir, seed = 1, size, width = 4.6 }: { dir: Dir; seed?: number; size?: number; width?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className="arrow-art">
      <g transform={`rotate(${DIR_ROT[dir]} 24 24)`} fill="none" stroke={INK} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
        <path d={wobblyLine(8, 25, 37, 23.5, { bow: 1.8, seed })} />
        <path d="M27,12.5 Q33,18 38.5,23.5 Q32,29 26.5,35" />
      </g>
    </svg>
  );
});

/** A strip of paper tape with a coil drawn along it: "this goes round and round" (the repeat block). */
function TapeGlyph({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path d="M5,17 L8,14 L11,17 L40,13 L43,16 L44,33 L41,36 L38,33 L8,36 L5,33 Z" fill="rgba(222,204,158,0.95)" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
      <path d={smoothOpen([[9, 30], [14, 19], [18, 27], [13, 28], [21, 19], [26, 27], [21, 28], [29, 19], [34, 27], [29, 28], [38, 20]])} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

/** The drawing on a command block. Plain steps are arrows; jumps and "if rock" arrive with 2do. */
export function CommandArt({ cmd, seed = 1, size }: { cmd: string; seed?: number; size: number }) {
  const { dir } = parseCommand(cmd);
  return <Arrow dir={dir} seed={seed} size={size} />;
}

/** The card colour of a command: its direction's. */
export const fillOf = (cmd: string) => DIR_FILL[parseCommand(cmd).dir];

// ------------------------------------------------------------------ outlines
interface Notch { x: number; w: number; d: number }
const notchOf = (d: Dims): Notch => (d.h < 50 ? { x: 12, w: 18, d: 5 } : d.h < 64 ? { x: 15, w: 22, d: 6 } : { x: 18, w: 26, d: 7 });
const R = 7;

/** Top edge left → right with a dent at `x0 + n.x` (the block above's bump fits in). */
const dent = (x0: number, y: number, n: Notch) =>
  `L${x0 + n.x},${y} L${x0 + n.x + 4},${y + n.d} L${x0 + n.x + n.w - 4},${y + n.d} L${x0 + n.x + n.w},${y}`;
/** Bottom edge right → left with a bump that hangs `n.d` below. */
const bump = (x0: number, y: number, n: Notch) =>
  `L${x0 + n.x + n.w},${y} L${x0 + n.x + n.w - 4},${y + n.d} L${x0 + n.x + 4},${y + n.d} L${x0 + n.x},${y}`;

export function cardPath(w: number, h: number, d: Dims): string {
  const n = notchOf(d);
  return `M${R},0 ${dent(0, 0, n)} L${w - R},0 Q${w},0 ${w},${R} L${w},${h - R} Q${w},${h} ${w - R},${h} ${bump(0, h, n)} L${R},${h} Q0,${h} 0,${h - R} L0,${R} Q0,0 ${R},0 Z`;
}

/** The start block: a rounded cap (nothing goes above it) and a bump below. */
export function startPath(w: number, h: number, d: Dims): string {
  const n = notchOf(d);
  const cap = Math.min(20, h * 0.36);
  return `M0,${cap} C0,${cap * 0.2} ${w * 0.28},${-cap * 0.35} ${w * 0.52},${cap * 0.3} C${w * 0.7},${cap * 0.7} ${w},${cap * 0.35} ${w},${cap + 4} L${w},${h - R} Q${w},${h} ${w - R},${h} ${bump(0, h, n)} L${R},${h} Q0,${h} 0,${h - R} Z`;
}

/** A C-block: top arm, spine, bottom arm; the mouth has a bump under the arm and a dent on the foot. */
export function cPath(w: number, arm: number, mouth: number, foot: number, d: Dims): string {
  const n = notchOf(d);
  const s = d.spine;
  const m = arm + mouth;
  const h = m + foot;
  const r = 5;
  return [
    `M${R},0 ${dent(0, 0, n)} L${w - R},0 Q${w},0 ${w},${R} L${w},${arm - r} Q${w},${arm} ${w - r},${arm}`,
    `${bump(s, arm, n)} L${s + r},${arm} Q${s},${arm} ${s},${arm + r} L${s},${m - r} Q${s},${m} ${s + r},${m}`,
    `${dent(s, m, n)} L${w - r},${m} Q${w},${m} ${w},${m + r} L${w},${h - R} Q${w},${h} ${w - R},${h}`,
    `${bump(0, h, n)} L${R},${h} Q0,${h} 0,${h - R} L0,${R} Q0,0 ${R},0 Z`,
  ].join(' ');
}

/** The paper and its flat shadow, with the ink edge. */
export function Paper({ d, fill, dashed, w, h }: { d: string; fill: string; dashed?: boolean; w: number; h: number }) {
  return (
    <svg className="blk-shape" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {dashed ? (
        <path d={d} className="blk-hole" />
      ) : (
        <g filter="url(#rough)">
          <path d={d} fill="rgba(84, 62, 38, 0.2)" transform="translate(3 4)" />
          <path d={d} fill={fill} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}

/** The ▶ of the start block: the same sign as the Probar button, so "this runs when you press it". */
export function StartSign({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M7,4.5 L19.5,12.3 L6.5,19.6 Z" fill="#fbf6ea" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

/** Two short blue strokes at the joint: the visual "click" of a snap. */
export function SnapMarks({ w }: { w: number }) {
  return (
    <svg className="snap-marks" width={w + 28} height={22} viewBox={`0 0 ${w + 28} 22`} aria-hidden="true">
      <path d="M6,4 L13,11 M4,14 L12,15" pathLength={1} />
      <path d={`M${w + 22},4 L${w + 15},11 M${w + 24},14 L${w + 16},15`} pathLength={1} />
    </svg>
  );
}

// ------------------------------------------------------------------ one block

export interface BlockLook {
  kind: 'cmd' | 'loop' | 'start';
  cmd?: string;
  fill?: string;
  /** Loops: the count ("?" when unset). */
  count?: number | 'goal';
  w: number;
  h: number;
  mouth?: number;
}

/** The drawn part of a block (shape + drawing), shared by the palette, the program and the ghost. */
export const BlockArt = memo(function BlockArt({ look, d, seed = 1, count }: { look: BlockLook; d: Dims; seed?: number; count?: ReactNode }) {
  const g = Math.round(d.h * 0.7);
  if (look.kind === 'start') {
    return (
      <>
        <Paper d={startPath(look.w, look.h, d)} fill={START_FILL} w={look.w} h={look.h} />
        <span className="blk-face" style={{ paddingTop: look.h * 0.18 }}><StartSign size={Math.round(g * 0.8)} /></span>
      </>
    );
  }
  if (look.kind === 'cmd') {
    return (
      <>
        <Paper d={cardPath(look.w, look.h, d)} fill={look.fill ?? '#fbf7ee'} w={look.w} h={look.h} />
        <span className="blk-face"><CommandArt cmd={look.cmd!} seed={seed} size={g} /></span>
      </>
    );
  }
  const mouth = look.mouth ?? d.h;
  return (
    <>
      <Paper d={cPath(look.w, d.arm, mouth, d.foot, d)} fill={TAPE_FILL} w={look.w} h={look.h} />
      <span className="blk-arm" style={{ height: d.arm }}>
        {count}
        <TapeGlyph size={Math.round(g * 0.9)} />
      </span>
    </>
  );
});

export const blockStyle = (x: number, y: number, w: number, h: number): CSSProperties => ({
  width: w, height: h, transform: `translate(${x}px, ${y}px)`,
});
