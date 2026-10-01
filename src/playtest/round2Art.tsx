// Round 2's drawings (T10), in the notebook's style (ink boiled by #rough,
// flat colours with one darker facet, flat shadows, blue pen for marks):
// - the setup's grade cards: the grade, and that many sprouts growing taller;
// - the 💬 of on-screen text, on or off;
// - "¿Cómo seguís?": three paths (a gentle hill, a flat path, a steep hill,
//   each with its plant at the end: small, middling, big, like the year's
//   doors), the challenge (its framed page with a trophy and what it sends
//   to the garden), "otro juego" (the menu's cards and an arrow back);
// - the bar's progress (stones along a short path, the one on screen
//   circled), the tool check's "seguir" arrow, the goodbye's "jugar otra vez".

import { memo, type ReactNode } from 'react';
import { blob, leaf, penLoop, wobblyLine } from '../ink/ink.js';
import type { Door } from '../curriculum/model';
import { BossPageArt } from '../ui/forestArt';

const INK = '#2b2622';
const PEN = '#3d6ea5';
const SHADOW = 'rgba(84, 62, 38, 0.2)';
const PAPER = '#fbf7ee';
const LEAF = '#a4b86d';
const LEAF_DARK = '#879b52';

/** A sprout of growing size (1 tiny … 3 a plant with a flower), its foot at (0, 0). */
export function Sprout({ size, seed = 1 }: { size: 1 | 2 | 3; seed?: number }) {
  const h = [16, 30, 46][size - 1];
  const w = [7, 10, 13][size - 1];
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path d={wobblyLine(0, 0, 1, -h, { bow: 1.2, seed })} fill="none" stroke={INK} strokeWidth={2.6} />
      <path d={leaf(1, -h * 0.55, -w * 1.6, -h * 0.85, w * 0.5)} fill={LEAF} stroke={INK} strokeWidth={2} />
      <path d={leaf(1, -h * 0.75, w * 1.7, -h * 1.02, w * 0.5)} fill={LEAF} stroke={INK} strokeWidth={2} />
      {size === 3 && <>
        <path d={leaf(1, -h * 0.3, w * 1.5, -h * 0.4, w * 0.45)} fill={LEAF_DARK} stroke={INK} strokeWidth={2} />
        <path d={blob(1, -h - 6, 9, 8, { wob: 0.08, n: 7, seed: seed + 4 })} fill="#e7a3a0" stroke={INK} strokeWidth={2} />
        <circle cx={1} cy={-h - 6} r={3.2} fill="#f0d27a" stroke={INK} strokeWidth={1.4} />
      </>}
    </g>
  );
}

// ------------------------------------------------------------------ setup: the grade cards

/** A grade's card drawing: the grade written big and `g` sprouts in a row, each a little taller. */
export const GradeArt = memo(function GradeArt({ g }: { g: number }) {
  const gap = 40;
  const x0 = 105 - ((g - 1) * gap) / 2;
  return (
    <svg className="pp-grade-art" viewBox="0 0 210 112" aria-hidden="true">
      <g filter="url(#rough)">
        <path d={wobblyLine(8, 104, 202, 102, { bow: 1.5, seed: g + 3 })} fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" opacity={0.7} />
        {Array.from({ length: g }, (_, i) => (
          <g key={i} transform={`translate(${x0 + i * gap} 104) scale(${1.45 + i * 0.08})`}>
            <Sprout size={i >= 3 ? 3 : i >= 1 ? 2 : 1} seed={g * 7 + i} />
          </g>
        ))}
      </g>
    </svg>
  );
});

// ------------------------------------------------------------------ 💬

/** A speech bubble with lines of text in it; off: empty and crossed out in pen. */
export function CaptionsIcon({ on }: { on: boolean }) {
  const d = blob(24, 20, 19, 14, { wob: 0.05, n: 10, seed: 8 });
  return (
    <svg className="pp-cap-icon" viewBox="0 0 48 44" aria-hidden="true">
      <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12,30 L8,41 L22,33" fill={on ? PAPER : '#efe7d6'} stroke={INK} strokeWidth={2.4} />
        <path d={d} fill={on ? PAPER : '#efe7d6'} stroke={INK} strokeWidth={2.6} />
        <path d="M12,30 L20,32" stroke={on ? PAPER : '#efe7d6'} strokeWidth={4} />
        {on
          ? <g stroke={INK} strokeWidth={2.4}><path d="M14,15 L34,14" /><path d="M14,21 L36,21" /><path d="M14,27 L27,26" /></g>
          : <path d={wobblyLine(8, 36, 42, 6, { bow: 1, seed: 4 })} fill="none" stroke={PEN} strokeWidth={3.4} />}
      </g>
    </svg>
  );
}

// ------------------------------------------------------------------ "¿Cómo seguís?"

/** The hill of each path (viewBox 0 0 240 170): the ground's line from left to right. */
const HILL: Record<Door, string> = {
  easy: 'M8,140 C60,138 90,112 130,110 C170,108 200,122 232,124',
  medium: 'M8,128 C70,126 160,130 232,127',
  hard: 'M8,148 C50,146 70,140 100,110 C122,84 140,66 168,62 C196,60 214,63 232,65',
};
/** Where the plant grows (the path's end) and the footprints along the way. */
const END: Record<Door, [number, number]> = { easy: [206, 121], medium: [206, 128], hard: [204, 61] };
const STEPS: Record<Door, [number, number][]> = {
  easy: [[40, 134], [70, 126], [100, 114], [134, 106], [168, 106]],
  medium: [[40, 122], [76, 123], [112, 124], [148, 125], [178, 124]],
  hard: [[38, 142], [62, 136], [84, 124], [104, 104], [126, 84], [152, 66], [180, 60]],
};

/** One way on: its hill or flat path, footprints in blue pen, and the plant at the end (small, middling, big). */
export const PathArt = memo(function PathArt({ door, mini = false }: { door: Door; mini?: boolean }) {
  const [ex, ey] = END[door];
  const ground = `${HILL[door]} L232,170 L8,170 Z`;
  return (
    <svg className={mini ? 'pp-path-mini' : 'pp-path-art'} viewBox={mini ? '0 20 240 150' : '0 0 240 170'} aria-hidden="true">
      <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
        {!mini && <path d="M24,40 q10,-14 24,-6 q12,-12 24,2 q10,8 -2,12 l-44,0 q-12,-2 -2,-8 Z" fill="#fff" stroke={INK} strokeWidth={1.8} opacity={door === 'hard' ? 0 : 0.9} />}
        <path d={ground} fill={door === 'hard' ? '#d9c9a6' : '#e6dcbc'} />
        {door === 'hard' && <path d="M100,110 C122,84 140,66 168,62 L168,90 C150,104 130,126 100,146 Z" fill="#cdbb94" />}
        <path d={HILL[door]} fill="none" stroke={INK} strokeWidth={2.8} />
        {STEPS[door].map(([x, y], i) => (
          <ellipse key={i} cx={x} cy={y - 4} rx={4.2} ry={2.6} fill={PEN} opacity={0.75} transform={`rotate(${door === 'hard' ? -40 : door === 'easy' ? -10 : 0} ${x} ${y - 4})`} />
        ))}
        <g transform={`translate(${ex} ${ey}) scale(${(mini ? 1.2 : 1) * (door === 'easy' ? 1.7 : door === 'medium' ? 1.5 : 1.05)})`}>
          <Sprout size={door === 'easy' ? 1 : door === 'medium' ? 2 : 3} seed={door.length + 20} />
        </g>
      </g>
    </svg>
  );
});

/** The challenge: its framed page (the board's drawing in it), a trophy, and on a tag what it sends to the garden. */
export function BossChoiceArt({ thumb, reward }: { thumb?: ReactNode; reward?: ReactNode }) {
  return (
    <svg className="pp-path-art" viewBox="0 0 240 170" aria-hidden="true">
      <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
        <g transform="translate(92 88) rotate(-4) scale(1.5)">
          <BossPageArt seed={7}>{thumb}</BossPageArt>
        </g>
        {/* the trophy */}
        <g transform="translate(176 104)">
          <path d="M-18,52 L18,52 L14,42 L-14,42 Z" transform="translate(3 4)" fill={SHADOW} />
          <path d="M-22,-30 C-34,-30 -34,-8 -16,-6 M22,-30 C34,-30 34,-8 16,-6" fill="none" stroke={INK} strokeWidth={3} />
          <path d="M-24,-34 L24,-34 C24,-6 14,8 0,10 C-14,8 -24,-6 -24,-34 Z" fill="#f0d27a" stroke={INK} strokeWidth={2.8} />
          <path d="M10,-30 C10,-8 6,2 -2,6 C12,4 20,-8 20,-30 Z" fill="#d9b04f" />
          <path d="M-5,10 L5,10 L6,30 L-6,30 Z" fill="#d9b04f" stroke={INK} strokeWidth={2.4} />
          <path d="M-16,30 L16,30 L18,42 L-18,42 Z" fill="#c9955f" stroke={INK} strokeWidth={2.6} />
          <path d="M-8,-22 L0,-26 L8,-22" fill="none" stroke={PAPER} strokeWidth={2.6} opacity={0.9} />
        </g>
      </g>
      {reward && (
        <g transform="translate(14 104) rotate(-6)">
          <path d="M0,0 L50,-2 L52,50 L2,52 Z" transform="translate(3 4)" fill={SHADOW} />
          <path d="M0,0 L50,-2 L52,50 L2,52 Z" fill={PAPER} stroke={INK} strokeWidth={2.2} filter="url(#rough)" />
          <path d="M26,-2 Q40,-22 58,-26" fill="none" stroke={INK} strokeWidth={1.8} strokeDasharray="1 5" strokeLinecap="round" />
          {reward}
        </g>
      )}
    </svg>
  );
}

// ------------------------------------------------------------------ the bar's progress

/** Stones along a short dotted path: the done ones with a seed on them, the one on screen circled in pen. */
export function ProgressStones({ done, here }: { done: boolean[]; here: number }) {
  const step = 30;
  const w = Math.max(1, done.length) * step + 8;
  return (
    <svg className="pp-progress-art" viewBox={`0 0 ${w} 40`} style={{ width: w }} aria-hidden="true">
      <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
        {done.length > 1 && <path d={wobblyLine(16, 24, w - 16, 23, { bow: 0.8, seed: done.length })} fill="none" stroke={PEN} strokeWidth={2.2} strokeDasharray="1 6" opacity={0.7} />}
        {done.map((d, i) => {
          const x = 4 + step / 2 + i * step;
          return (
            <g key={i} transform={`translate(${x} 24)`}>
              <path d={blob(0, 0, 11, 8, { wob: 0.12, n: 8, seed: i + 30 })} fill={d ? '#d9cfb4' : PAPER} stroke={INK} strokeWidth={2.2} />
              {d && <>
                <ellipse cx={0} cy={-2} rx={5} ry={4.2} fill="#f0d27a" stroke={INK} strokeWidth={1.6} />
                <path d="M0,-6 q-1.6,-4 1.6,-6.4" fill="none" stroke={INK} strokeWidth={1.4} />
              </>}
              {i === here && <path d={penLoop(0, -1, 15, 12, { seed: i + 5 })} fill="none" stroke={PEN} strokeWidth={2.6} />}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// ------------------------------------------------------------------ buttons

/** "Seguir": a fat blue pen arrow on a paper disc. */
export function GoOnArt() {
  return (
    <svg viewBox="0 0 80 64" aria-hidden="true" className="pp-go-art">
      <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
        <path d={wobblyLine(12, 34, 62, 31, { bow: 2, seed: 9 })} fill="none" stroke={PEN} strokeWidth={7} />
        <path d="M46,14 Q58,24 66,31 Q57,40 46,50" fill="none" stroke={PEN} strokeWidth={7} />
      </g>
    </svg>
  );
}

/** "Jugar otra vez": a new seed in the ground, and a pen arrow coming round to it. */
export function PlayAgainArt() {
  return (
    <svg viewBox="0 0 96 80" aria-hidden="true" className="pp-again-art">
      <g filter="url(#rough)" strokeLinecap="round" strokeLinejoin="round">
        <path d={wobblyLine(18, 62, 78, 61, { bow: 1, seed: 4 })} fill="none" stroke={INK} strokeWidth={2.4} opacity={0.6} />
        <ellipse cx={48} cy={54} rx={9} ry={8} fill="#f0d27a" stroke={INK} strokeWidth={2.4} />
        <g transform="translate(48 47)"><Sprout size={1} seed={3} /></g>
        <path d="M20,40 C14,14 64,4 78,30" fill="none" stroke={PEN} strokeWidth={4.4} />
        <path d="M70,26 L79,32 L84,22" fill="none" stroke={PEN} strokeWidth={4.4} />
      </g>
    </svg>
  );
}
