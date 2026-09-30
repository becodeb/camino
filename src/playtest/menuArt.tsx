// The free-play menu's pictures, one per activity, in the notebook's style:
// a taped page with a small drawing of the real thing (the sheet's own
// board, the recess's song and xylophone, a guarda on squared paper, a
// board being made, the rule game's falling seeds), and what goes with it
// drawn beside the page (the three doors and the boss page, mallets and
// notes, the pencil, the corkboard, the arrow keys and the jar). Also the
// "volver al menú" button's drawing: the menu's cards with a blue pen arrow
// curling back to them. Ink boiled by #rough, flat facets, no text needed.

import { memo, type ReactNode } from 'react';
import { useProgress } from '../curriculum/progress';
import { blob, leaf, wobblyLine, wobblyPoly } from '../ink/ink.js';
import { sheetByN } from '../curriculum/primer';
import { levelById } from '../game/levels';
import { BoardThumb, PageThumb, ThumbCharacterContext } from '../ui/thumbs';
import { BossPageArt, DoorArt } from '../ui/forestArt';
import { Pencil } from '../ui/workshopArt';
import type { Activity } from './freePlay';

const INK = '#2b2622';
const PEN = '#3d6ea5';
const SHADOW = 'rgba(84, 62, 38, 0.2)';
const PAPER = '#fbf7ee';

/** The card's drawing space. */
const VB = '0 0 260 190';

/** A page of paper, tilted, with its shadow and a strip of tape; `children` drawn on it (in the page's own coordinates). */
function Page({ x, y, w, h, rot, seed, children }: { x: number; y: number; w: number; h: number; rot: number; seed: number; children: ReactNode }) {
  const d = wobblyPoly([[0, 0], [w, 0], [w, h], [0, h]], { wob: 0.7, bow: 1.1, seed });
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot} ${w / 2} ${h / 2})`}>
      <path d={d} transform="translate(5 6)" fill={SHADOW} />
      <path d={d} fill={PAPER} stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
      {children}
      <rect x={w / 2 - 24} y={-9} width={48} height={16} rx={2} fill="rgba(222, 204, 158, 0.85)" transform={`rotate(${-rot * 1.4 - 4} ${w / 2} -1)`} />
    </g>
  );
}

/** A sheet of 1ro: its second page's board on a page, the three doors under the boss page beside it. */
function SheetCard({ n }: { n: number }) {
  const s = sheetByN(n);
  const level = s?.core[1]?.level ?? s?.core[0]?.level;
  return (
    <svg className="pp-fp-art" viewBox={VB} aria-hidden="true">
      <g filter="url(#rough)">
        <Page x={12} y={18} w={148} h={148} rot={-3} seed={n}>
          {level && <PageThumb level={level} place={{ x: 10, y: 12, width: 128, height: 124 }} />}
        </Page>
        <g transform="translate(214 58) rotate(5) scale(0.62)"><BossPageArt seed={n + 2} /></g>
        {(['easy', 'medium', 'hard'] as const).map((d, i) => (
          <g key={d} transform={`translate(${184 + i * 28} ${162 - i * 2}) scale(${0.3 + i * 0.03})`}><DoorArt size={d} seed={n * 3 + i} /></g>
        ))}
      </g>
    </svg>
  );
}

/** Two mallets crossed and three notes flying off (the music recess). */
function Mallets() {
  return (
    <g stroke={INK} strokeLinecap="round" strokeLinejoin="round">
      <path d="M190,150 L236,86" strokeWidth={5} />
      <path d="M190,150 L236,86" stroke="#c9955f" strokeWidth={2.4} />
      <path d={blob(238, 82, 11, 10, { seed: 3, n: 9 })} fill="#c9574a" strokeWidth={2.4} />
      <path d="M244,160 L204,92" strokeWidth={5} />
      <path d="M244,160 L204,92" stroke="#c9955f" strokeWidth={2.4} />
      <path d={blob(202, 88, 11, 10, { seed: 5, n: 9 })} fill="#7298c1" strokeWidth={2.4} />
      {[[182, 44, 0], [214, 26, 1], [242, 50, 2]].map(([x, y, i]) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${i * 8 - 8})`}>
          <path d={blob(0, 0, 7, 5.4, { seed: i + 7, n: 8, rot: -0.4 })} fill={INK} strokeWidth={1.4} />
          <path d="M6,-2 L6,-24 Q12,-20 16,-14" fill="none" strokeWidth={2.4} />
        </g>
      ))}
    </g>
  );
}

function RecessCard({ n }: { n: number }) {
  const level = sheetByN(n)?.core[0]?.level;
  return (
    <svg className="pp-fp-art" viewBox={VB} aria-hidden="true">
      <g filter="url(#rough)">
        <Page x={12} y={24} w={160} h={136} rot={-2} seed={n}>
          {level && <PageThumb level={level} place={{ x: 8, y: 10, width: 144, height: 116 }} />}
        </Page>
        <Mallets />
      </g>
    </svg>
  );
}

function GuardasCard({ n }: { n: number }) {
  const level = sheetByN(n)?.core[0]?.level;
  return (
    <svg className="pp-fp-art" viewBox={VB} aria-hidden="true">
      <g filter="url(#rough)">
        <Page x={14} y={22} w={170} h={140} rot={2} seed={n}>
          {level && <PageThumb level={level} place={{ x: 8, y: 10, width: 154, height: 120 }} />}
        </Page>
        <Pencil x={214} y={138} rot={-62} s={2.1} />
      </g>
    </svg>
  );
}

/** A little corkboard with a card pinned on it. */
function Cork({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(4)`} stroke={INK} strokeLinejoin="round" strokeLinecap="round">
      <path d="M-40,-34 L38,-36 L40,32 L-38,34 Z" transform="translate(4 5)" fill={SHADOW} stroke="none" />
      <path d="M-40,-34 L38,-36 L40,32 L-38,34 Z" fill="#b98a5c" strokeWidth={2.6} />
      <path d="M-31,-25 L29,-27 L31,23 L-29,25 Z" fill="#dcbd8e" strokeWidth={1.8} />
      {[[-20, 12], [18, -16], [20, 14], [-22, -14], [2, 18]].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={1.6} fill="#b0895a" stroke="none" />)}
      <path d={wobblyPoly([[-15, -15], [15, -17], [17, 15], [-13, 17]], { wob: 0.5, bow: 0.7, seed: 6 })} fill={PAPER} strokeWidth={2} transform="rotate(-7)" />
      <path d="M-8,6 L-2,-3 L4,4 L10,-6" fill="none" stroke={PEN} strokeWidth={2.4} />
      <circle cx={0} cy={-17} r={5.4} fill="#c9574a" strokeWidth={2} />
    </g>
  );
}

/** A board being made: a small board on a page, the pencil drawing on it, the corkboard waiting. */
function EditorCard() {
  const b = sheetByN(1)?.core[0]?.level.worlds[0];
  return (
    <svg className="pp-fp-art" viewBox={VB} aria-hidden="true">
      <g filter="url(#rough)">
        <Page x={10} y={26} w={158} h={130} rot={-3} seed={7}>
          {b && <BoardThumb b={b} place={{ x: 10, y: 12, width: 138, height: 106 }} />}
        </Page>
        <Pencil x={142} y={126} rot={-128} s={1.6} />
        <Cork x={214} y={64} />
      </g>
    </svg>
  );
}

/** Three arrow keys of a keyboard. */
function Keys({ x, y }: { x: number; y: number }) {
  const key = (kx: number, ky: number, d: string, i: number) => (
    <g key={i} transform={`translate(${kx} ${ky})`}>
      <rect x={-14} y={-13} width={28} height={26} rx={5} transform="translate(2 3)" fill={SHADOW} />
      <rect x={-14} y={-13} width={28} height={26} rx={5} fill={PAPER} stroke={INK} strokeWidth={2.2} />
      <path d={d} fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
  return (
    <g transform={`translate(${x} ${y})`}>
      {key(-32, 0, 'M6,0 L-6,0 M-1,-5 L-6,0 L-1,5', 0)}
      {key(0, 0, 'M0,6 L0,-6 M-5,-1 L0,-6 L5,-1', 1)}
      {key(32, 0, 'M-6,0 L6,0 M1,-5 L6,0 L1,5', 2)}
    </g>
  );
}

/** The seed jar with points in it. */
function Jar({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(1.5)`} stroke={INK} strokeLinejoin="round" strokeLinecap="round">
      <path d="M-15,-8 L15,-8 L18,-1 L17,22 L-17,22 L-18,-1 Z" transform="translate(2 3)" fill={SHADOW} stroke="none" />
      <path d="M-15,-8 L15,-8 L18,-1 L17,22 L-17,22 L-18,-1 Z" fill="#eef0e4" strokeWidth={2.4} />
      <path d="M-17,-15 L17,-15 L16,-7 L-16,-7 Z" fill="#de8a56" strokeWidth={2.2} />
      <path d={blob(-7, 14, 6, 5, { seed: 2, n: 8 })} fill="#f0d27a" strokeWidth={1.8} />
      <path d={blob(6, 15, 6, 5, { seed: 4, n: 8 })} fill="#f0d27a" strokeWidth={1.8} />
      <path d={blob(0, 6, 6, 5, { seed: 6, n: 8 })} fill="#f0d27a" strokeWidth={1.8} />
    </g>
  );
}

function RulesCard() {
  const b = levelById('3ro-2')?.worlds[0];
  return (
    <svg className="pp-fp-art" viewBox={VB} aria-hidden="true">
      <g filter="url(#rough)">
        <Page x={12} y={20} w={162} h={124} rot={-2} seed={11}>
          {b && <BoardThumb b={b} rain place={{ x: 8, y: 10, width: 146, height: 104 }} />}
        </Page>
        <Jar x={220} y={70} />
        <Keys x={112} y={166} />
      </g>
    </svg>
  );
}

/** A small game: a board with arrow keys, three hearts and a star (T7's probe, "Hacé tu juego"). */
function GameMakerCard() {
  const b = levelById('3ro-1')?.worlds[0];
  const heart = 'M0,6 C-10,-2 -8,-10 -2,-9 C0,-8.6 0,-7 0,-6 C0,-7 0,-8.6 2,-9 C8,-10 10,-2 0,6 Z';
  return (
    <svg className="pp-fp-art" viewBox={VB} aria-hidden="true">
      <g filter="url(#rough)">
        <Page x={12} y={24} w={164} h={122} rot={-2} seed={13}>
          {b && <BoardThumb b={b} place={{ x: 8, y: 10, width: 148, height: 102 }} />}
        </Page>
        {[0, 1, 2].map((i) => <path key={i} d={heart} transform={`translate(${204 + i * 20} ${40}) scale(1.6)`} fill="#e7a3a0" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />)}
        <path d="M222,86 L228,100 L243,101 L231,110 L236,125 L222,116 L208,125 L213,110 L201,101 L216,100 Z" fill="#f0d27a" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
        <Keys x={112} y={168} />
      </g>
    </svg>
  );
}

/** A block beside the same program written as text lines (T8's probe, "Del bloque al texto"). */
function TextProbeCard() {
  return (
    <svg className="pp-fp-art" viewBox={VB} aria-hidden="true">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <g transform="translate(18 44)">
          <path d="M0,0 L70,0 L70,34 L0,34 Z" transform="translate(3 4)" fill={SHADOW} />
          <path d="M0,0 L70,0 L70,34 L0,34 Z" fill="#eeac7f" stroke={INK} strokeWidth={2.4} />
          <path d="M18,17 L50,17 M42,9 L50,17 L42,25" fill="none" stroke={INK} strokeWidth={3} />
          <path d="M0,52 L70,52 L70,86 L0,86 Z" transform="translate(3 4)" fill={SHADOW} />
          <path d="M0,52 L70,52 L70,86 L0,86 Z" fill="#a9c3de" stroke={INK} strokeWidth={2.4} />
          <path d="M35,78 L35,60 M27,68 L35,60 L43,68" fill="none" stroke={INK} strokeWidth={3} />
        </g>
        <path d={wobblyLine(100, 94, 124, 94, { seed: 3 })} stroke={PEN} strokeWidth={3} fill="none" strokeDasharray="1 7" />
        <path d="M120,88 L127,94 L120,100" fill="none" stroke={PEN} strokeWidth={3} />
        <Page x={136} y={30} w={112} h={128} rot={2} seed={17}>
          {[0, 1, 2, 3].map((i) => <path key={i} d={wobblyLine(12 + (i % 2) * 12, 30 + i * 24, 96 - (i === 3 ? 30 : 0), 31 + i * 24, { seed: i + 20 })} stroke={i % 2 ? INK : PEN} strokeWidth={4} fill="none" opacity={0.75} />)}
        </Page>
      </g>
    </svg>
  );
}

/** The picture of a free-play activity (the menu's card, the survey's "¿Qué te gustó más?"), with the child's own character on its boards. */
export const ActivityArt = memo(function ActivityArt({ a }: { a: Pick<Activity, 'id' | 'kind'> }) {
  const character = useProgress().character;
  return <ThumbCharacterContext.Provider value={character}><CardArt a={a} /></ThumbCharacterContext.Provider>;
});

function CardArt({ a }: { a: Pick<Activity, 'id' | 'kind'> }) {
  switch (a.id) {
    case 'sheet': return <SheetCard n={'sheet' in a.kind ? a.kind.sheet : 6} />;
    case 'recess': return <RecessCard n={'sheet' in a.kind ? a.kind.sheet : 9} />;
    case 'guardas': return <GuardasCard n={'sheet' in a.kind ? a.kind.sheet : 14} />;
    case 'editor': return <EditorCard />;
    case 'rule_game': return <RulesCard />;
    case 'game_maker': return <GameMakerCard />;
    case 'text_probe': return <TextProbeCard />;
  }
}

/** "Volver al menú": four little cards of the menu, and a blue pen arrow curling back to them. */
export function MenuBackArt() {
  const card = (x: number, y: number, r: number, i: number) => {
    const d = wobblyPoly([[0, 0], [15, 0], [15, 12], [0, 12]], { wob: 0.4, bow: 0.5, seed: i + 3 });
    return (
      <g key={i} transform={`translate(${x} ${y}) rotate(${r} 7 6)`}>
        <path d={d} transform="translate(1.5 2)" fill={SHADOW} />
        <path d={d} fill={PAPER} stroke={INK} strokeWidth={1.8} />
        <path d={leaf(5, 9, 10, 4, 2.4)} fill="#a4b86d" stroke={INK} strokeWidth={0.9} />
      </g>
    );
  };
  return (
    <svg viewBox="0 0 64 56" aria-hidden="true" className="pp-menu-back-art">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        {card(22, 8, -4, 0)}{card(41, 7, 3, 1)}{card(23, 27, 2, 2)}{card(42, 28, -3, 3)}
        <path d="M18,44 C4,44 2,26 12,18" fill="none" stroke={PEN} strokeWidth={3.2} />
        <path d="M6,20 L12,17 L14,24" fill="none" stroke={PEN} strokeWidth={3.2} />
      </g>
    </svg>
  );
}
