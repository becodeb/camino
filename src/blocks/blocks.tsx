// The blocks of the editor, drawn as paper cutouts with the puzzle notch
// children know from Scratch and Pilas Bloques: a dent on top, a bump below,
// so a block snaps under the one above. Sala 5 blocks carry only a drawing
// (the demo's arrow cards, docs/05 §4 of habilidades). The outline is exact;
// the `rough` filter gives it the ink edge, like every `.cut`.
// Ported from habilidades (app/src/areas/algorithmic/ui/blocks.tsx @ 9b90d1d).
// Blocks grow with the kids (design rule 5): sala 5 blocks are a picture;
// in 1ro the new blocks add one word under the picture; in 2do the word
// comes first. Arrows stay pictures everywhere.

import { memo, type CSSProperties, type ReactNode } from 'react';
import { blob, penLoop, smoothOpen, wobblyLine } from '../ink/ink.js';
import type { Dims } from '../game/editor';
import type { BlockLabel } from '../game/levels';
import { parseCommand, type CardRef, type Dir } from '../game/model';

export const INK = '#2b2622';
export const TAPE_FILL = '#eadcb2';
export const START_FILL = '#de8a56';
/** The "si" block: a pale leaf green, apart from the four arrow colours. */
export const COND_FILL = '#cfdaa6';
const PEN = '#3d6ea5';

/** The one word a block carries from 1ro on (es-AR). Arrows have none. */
export const WORDS: Record<string, string> = {
  repeat: 'repetir',
  'repeat-goal': 'repetir\nhasta llegar',
  ifrock: 'si hay piedra',
  jump: 'saltar',
};

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
export function TapeGlyph({ size }: { size: number }) {
  // cropped to the tape itself: `size` is its width
  return (
    <svg viewBox="3 10 43 29" width={size} height={Math.round(size * 29 / 43)} aria-hidden="true">
      <path d="M5,17 L8,14 L11,17 L40,13 L43,16 L44,33 L41,36 L38,33 L8,36 L5,33 Z" fill="rgba(222,204,158,0.95)" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
      <path d={smoothOpen([[9, 30], [14, 19], [18, 27], [13, 28], [21, 19], [26, 27], [21, 28], [29, 19], [34, 27], [29, 28], [38, 20]])} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

/** A jump: a dotted arc over a small rock, landing with an arrow head, turned to its direction. */
export const JumpGlyph = memo(function JumpGlyph({ dir, size }: { dir: Dir; size: number }) {
  const flip = dir === 'left' ? 'scale(-1 1) translate(-48 0)' : dir === 'up' ? 'rotate(-90 24 24)' : dir === 'down' ? 'rotate(90 24 24)' : '';
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className="arrow-art">
      <g transform={flip}>
        <path d={blob(24, 38, 8.5, 5.5, { seed: 5, n: 7 })} fill="#bdb09c" stroke={INK} strokeWidth={2.4} />
        <path d="M5,38 C9,6 36,4 41,30" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" strokeDasharray="0.1 7.5" />
        <path d="M33,27 L41.5,33 L45,23" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
});

/** A rock as on the board, small: what the "si" block asks about. */
export function RockGlyph({ size }: { size: number }) {
  // cropped to the rock: `size` is its width
  return (
    <svg viewBox="4 13 40 30" width={size} height={Math.round(size * 30 / 40)} aria-hidden="true">
      <path d={blob(24, 28, 18, 13, { wob: 0.09, n: 8, seed: 3 })} fill="#bdb09c" stroke={INK} strokeWidth={2.8} strokeLinejoin="round" />
      <path d="M19,24 l4,5 l-2,5" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The seed with two leaves: "hasta llegar" (where Brote is going). */
export function SeedGlyph({ size }: { size: number }) {
  return (
    <svg viewBox="-16 -26 32 44" width={Math.round(size * 32 / 44)} height={size} aria-hidden="true" style={{ overflow: 'visible' }}>
      <path d="M0,4 C-2,-4 2,-9 0,-15" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <path d="M0,-12 Q-10,-24 -14,-20 Q-9,-10 0,-12 Z" fill="#a4b86d" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <path d="M0,-14 Q10,-26 13,-23 Q9,-12 0,-14 Z" fill="#a4b86d" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <path d={blob(0, 8, 11, 9.5, { wob: 0.05, n: 9, seed: 4 })} fill="#f0d27a" stroke={INK} strokeWidth={2.6} />
    </svg>
  );
}

/** A word on a block (1ro on): Andika, the first readers' typeface. */
export const Word = ({ text, size }: { text: string; size?: number }) => <span className="blk-word" style={size ? { fontSize: size } : undefined}>{text}</span>;

/**
 * A picture with its word as the grade wants it: none (sala 5), under the
 * picture (1ro), or before it (2do on).
 */
export function Labeled({ word, label, children }: { word?: string; label: BlockLabel; children: ReactNode }) {
  if (!word || label === 'picture') return <>{children}</>;
  return <span className={`blk-labeled is-${label}`}>{label === 'word-picture' && <Word text={word} />}{children}{label === 'picture-word' && <Word text={word} />}</span>;
}

/** The drawing on a command block: an arrow for a step; a jump arc and "saltar" for a jump. */
export function CommandArt({ cmd, seed = 1, size, label = 'picture' }: { cmd: string; seed?: number; size: number; label?: BlockLabel }) {
  const { kind, dir } = parseCommand(cmd);
  if (kind === 'jump') return <Labeled word={WORDS.jump} label={label}><JumpGlyph dir={dir} size={label === 'picture' ? size : Math.round(size * 0.72)} /></Labeled>;
  if (kind === 'ifrock') return <Labeled word={WORDS.ifrock} label={label}><RockGlyph size={Math.round(size * 0.72)} /></Labeled>;
  return <Arrow dir={dir} seed={seed} size={size} />;
}

/** The card colour of a command: its direction's; the "si" block its own. */
export const fillOf = (cmd: string) => (parseCommand(cmd).kind === 'ifrock' ? COND_FILL : DIR_FILL[parseCommand(cmd).dir]);
/** Commands drawn as a C-shape with a fixed mouth: "si hay piedra [saltar]". */
export const isCond = (cmd: string) => cmd.startsWith('ifrock:');

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
  kind: 'cmd' | 'cond' | 'loop' | 'start';
  cmd?: string;
  fill?: string;
  /** Loops: the count, or 'goal' ("repetir hasta llegar"). */
  count?: number | 'goal';
  w: number;
  h: number;
  mouth?: number;
}

/**
 * The passes of a counted repeat, drawn on its foot: one ink dot per pass in
 * rows of five (like a ten frame), filled in blue pen as each pass runs. A
 * child who does not read numbers yet counts the dots.
 */
export function Pips({ count, passes = 0, w, foot }: { count: number; passes?: number; w: number; foot: number }) {
  const step = foot < 22 ? 11 : 14;
  const r = foot < 22 ? 4 : 5;
  return (
    <svg className="blk-pips" width={w} height={foot} viewBox={`0 0 ${w} ${foot}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <circle
          key={i}
          cx={r + 30 + i * step + (i >= 5 ? step / 2 : 0)}
          cy={foot * 0.58}
          r={r}
          fill={i < passes ? PEN : '#fbf7ee'}
          stroke={i < passes ? PEN : INK}
          strokeWidth={1.8}
          className={i === passes - 1 ? 'pip-now' : undefined}
        />
      ))}
    </svg>
  );
}

/** The drawn part of a block (shape + drawing), shared by the palette, the program and the ghost. */
export const BlockArt = memo(function BlockArt({ look, d, seed = 1, count, label = 'picture', pips = true }: {
  look: BlockLook; d: Dims; seed?: number; count?: ReactNode; label?: BlockLabel;
  /** Counted repeats: draw the pass dots on the foot (the notebook draws them itself, above the cards). */
  pips?: boolean;
}) {
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
        <span className="blk-face"><CommandArt cmd={look.cmd!} seed={seed} size={g} label={label} /></span>
      </>
    );
  }
  if (look.kind === 'cond') {
    // "si hay piedra" on the arm; what it does, "saltar", already inside and fixed
    const mouth = look.mouth ?? d.condMouth;
    const { dir } = parseCommand(look.cmd!);
    const iw = look.w - d.spine - 12;
    return (
      <>
        <Paper d={cPath(look.w, d.arm, mouth, d.foot, d)} fill={COND_FILL} w={look.w} h={look.h} />
        <span className="blk-arm" style={{ height: d.arm }}>
          <Labeled word={WORDS.ifrock} label={label}><RockGlyph size={Math.round(g * 0.78)} /></Labeled>
        </span>
        <span className="blk-mouth-sign" style={{ top: d.arm, left: d.spine, width: iw, height: mouth }}>
          <Paper d={cardPath(iw, mouth, { ...d, h: mouth })} fill={DIR_FILL[dir]} w={iw} h={mouth} />
          <span className="blk-face">
            <Labeled word={WORDS.jump} label={label}><JumpGlyph dir={dir} size={Math.round(mouth * 0.8)} /></Labeled>
          </span>
        </span>
      </>
    );
  }
  const mouth = look.mouth ?? d.h;
  const goal = look.count === 'goal';
  const glyph = <TapeGlyph size={Math.round(g * (goal ? 0.74 : label === 'word-picture' ? 0.82 : 0.96))} />;
  return (
    <>
      <Paper d={cPath(look.w, d.arm, mouth, d.foot, d)} fill={TAPE_FILL} w={look.w} h={look.h} />
      <span className={`blk-arm${goal ? ' is-goal' : ''}`} style={{ height: d.arm }}>
        {count}
        {goal ? (
          <Labeled word={WORDS['repeat-goal']} label={label}>{glyph}<SeedGlyph size={Math.round(g * 0.72)} /></Labeled>
        ) : <Labeled word={WORDS.repeat} label={label}>{glyph}</Labeled>}
      </span>
      {pips && typeof look.count === 'number' && (
        <span className="blk-foot" style={{ top: look.h - d.foot, height: d.foot }}>
          <Pips count={look.count} w={look.w} foot={d.foot} />
        </span>
      )}
    </>
  );
});

export const blockStyle = (x: number, y: number, w: number, h: number): CSSProperties => ({
  width: w, height: h, transform: `translate(${x}px, ${y}px)`,
});
