// The drawings of "Hacé tu juego": the objects of the game (a seed with its
// sprout, a stone, a round blue bird, the star of the prediction task, the
// trophy that stands for the whole game), the glyphs of the new blocks (the
// green flag of "al empezar", the loop of "siempre", the envelope of
// "avisar", a speech bubble, the U-turn, back to the top, an eye), the
// board's score jar and hearts, the phase steps of the bar and the drawn
// outcomes of the prediction task. Ink boiled by #rough, flat colours with
// one darker facet, blue pen for marks: the notebook's style.

import { memo, type ReactNode } from 'react';
import { blob, leaf, wobblyLine, wobblyPoly } from '../ink/ink.js';
import { Arrow, KeyCap } from '../blocks/blocks';
import { PlayerFace, ScenePlayer } from '../screens/player';
import type { Dir } from '../game/model';
import type { MsgId, ObjId } from '../game/gameMaker';
import type { GmPhase, OutcomeId } from './gameMakerProbe';

export const INK = '#2b2622';
const PEN = '#3d6ea5';
const SHADOW = 'rgba(84, 62, 38, 0.2)';
const PAPER = '#fbf7ee';

/** The colour of each message's envelope seal. */
export const MSG_TONE: Record<MsgId, string> = { yum: '#f0d27a', ouch: '#e7a3a0', party: '#a9c3de' };

// ------------------------------------------------------------------ the objects (drawn round (0, 0), about 56 units)

export const SeedArt = memo(function SeedArt() {
  return (
    <g className="gm-art-seed" stroke={INK} strokeLinecap="round" strokeLinejoin="round">
      <path d="M0,2 C-3,-8 3,-14 0,-22" fill="none" strokeWidth={2.6} />
      <path d={leaf(0, -18, -18, -28, 7)} fill="#a4b86d" strokeWidth={2.3} />
      <path d={leaf(0, -20, 17, -31, 7)} fill="#a4b86d" strokeWidth={2.3} />
      <path d={blob(0, 10, 16, 14, { wob: 0.05, n: 9, seed: 3 })} fill="#f0d27a" strokeWidth={2.8} />
      <path d="M7,1 Q15,8 11,19 Q17,10 7,1 Z" fill="#e0b85a" stroke="none" opacity={0.8} />
    </g>
  );
});

export const StoneArt = memo(function StoneArt() {
  return (
    <g className="gm-art-stone" stroke={INK} strokeLinejoin="round" strokeLinecap="round">
      <path d={blob(0, 4, 23, 18, { wob: 0.12, n: 9, seed: 12 })} fill="#bdb09c" strokeWidth={2.8} />
      <path d="M6,-12 Q20,-8 21,6 Q12,-2 6,-12 Z" fill="#9f937f" stroke="none" />
      <path d="M-8,-4 L-3,2 L-6,9" fill="none" strokeWidth={1.8} opacity={0.6} />
      <circle cx={10} cy={10} r={1.6} fill={INK} stroke="none" opacity={0.5} />
    </g>
  );
});

/** A round blue bird facing `dir` (left or right). */
export const BirdArt = memo(function BirdArt({ dir = 'right' }: { dir?: Dir }) {
  return (
    <g className="gm-art-bird" transform={dir === 'left' ? 'scale(-1 1)' : undefined} stroke={INK} strokeLinejoin="round" strokeLinecap="round">
      <path d="M-18,0 L-30,-8 L-28,4 Z" fill="#5d82ad" strokeWidth={2.4} />
      <path d={blob(0, 0, 21, 17, { wob: 0.04, n: 10, seed: 21 })} fill="#7298c1" strokeWidth={2.8} />
      <path d="M-6,6 Q4,16 16,6 Q8,4 -6,6 Z" fill="#a9c3de" stroke="none" />
      <path d="M-10,-2 Q-2,-14 6,-2 Q-2,4 -10,-2 Z" fill="#5d82ad" strokeWidth={2.2} />
      <path d="M17,-6 L29,-2 L17,3 Z" fill="#de8a56" strokeWidth={2.2} />
      <circle cx={10} cy={-7} r={3.2} fill={INK} stroke="none" />
      <circle cx={11} cy={-8} r={1} fill="#fbf6ea" stroke="none" />
      <path d="M-4,17 L-6,23 M4,17 L4,23" fill="none" strokeWidth={2.2} />
    </g>
  );
});

export const StarArt = memo(function StarArt({ r = 22 }: { r?: number }) {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.46 : r;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return (
    <g className="gm-art-star" strokeLinejoin="round">
      <path d={wobblyPoly(pts, { wob: 0.4, bow: 0.6, seed: 4 })} fill="#f0d27a" stroke={INK} strokeWidth={2.6} />
      <path d={`M0,${-r} L${r * 0.27},${-r * 0.37} L0,${r * 0.1} Z`} fill="#e0b85a" opacity={0.8} />
    </g>
  );
});

/** The whole game (its own rules: how to win and lose): a small trophy. */
export const TrophyArt = memo(function TrophyArt() {
  return (
    <g className="gm-art-trophy" stroke={INK} strokeLinejoin="round" strokeLinecap="round">
      <path d="M-15,-14 C-26,-14 -26,2 -12,2 M15,-14 C26,-14 26,2 12,2" fill="none" strokeWidth={2.6} />
      <path d={wobblyPoly([[-16, -20], [16, -20], [12, 4], [5, 10], [-5, 10], [-12, 4]], { wob: 0.4, bow: 0.8, seed: 5 })} fill="#f0d27a" strokeWidth={2.8} />
      <path d="M6,-18 L12,-18 L9,2 L4,6 Z" fill="#e0b85a" stroke="none" />
      <path d="M-4,10 L4,10 L5,17 L-5,17 Z" fill="#e0b85a" strokeWidth={2.2} />
      <path d={wobblyPoly([[-13, 17], [13, 17], [13, 24], [-13, 24]], { wob: 0.3, seed: 6 })} fill="#9f937f" strokeWidth={2.4} />
    </g>
  );
});

const GroundArt = () => (
  <g stroke={INK} strokeLinecap="round">
    <path d={wobblyLine(-22, 6, 22, 6, { seed: 4 })} strokeWidth={2.6} fill="none" />
    <path d="M-14,6 L-17,-4 M-12,6 L-10,-6 M4,6 L2,-3 M7,6 L10,-5 M16,6 L15,-2" stroke="#7c8f47" strokeWidth={2.2} fill="none" />
  </g>
);
const EdgeArt = () => (
  <g fill="none" strokeLinecap="round">
    <path d="M-20,-20 L20,-20 L20,20" stroke={INK} strokeWidth={3} />
    <path d="M-20,-12 L12,-12 L12,20" stroke={PEN} strokeWidth={2} strokeDasharray="1 5" />
  </g>
);

/** An object as a small picture (a tab, a chip, a Scratch sprite's label). The child's character is its portrait. */
export function ObjIcon({ id, size = 40 }: { id: ObjId | 'ground' | 'edge' | 'star'; size?: number }) {
  if (id === 'me') return <span className="gm-icon gm-icon-me" style={{ width: size, height: size }}><PlayerFace className="gm-face" /></span>;
  const art: Record<string, ReactNode> = {
    seed: <g transform="translate(0 4)"><SeedArt /></g>, stone: <StoneArt />, bird: <BirdArt />, game: <TrophyArt />,
    ground: <GroundArt />, edge: <EdgeArt />, star: <StarArt r={24} />,
  };
  return (
    <svg className={`gm-icon gm-icon-${id}`} viewBox="-30 -30 60 60" width={size} height={size} aria-hidden="true" overflow="visible">
      <g filter="url(#rough)">{art[id]}</g>
    </svg>
  );
}

// ------------------------------------------------------------------ block glyphs (viewBox -12 -12 24 24)

function Glyph({ size = 24, children, className }: { size?: number; children: ReactNode; className?: string }) {
  return (
    <svg className={`gm-glyph${className ? ` ${className}` : ''}`} viewBox="-12 -12 24 24" width={size} height={size} aria-hidden="true" overflow="visible">
      <g stroke={INK} strokeLinecap="round" strokeLinejoin="round" fill="none">{children}</g>
    </svg>
  );
}

/** The green flag of "al empezar" (Scratch's own sign for starting). */
export const FlagGlyph = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M-7,11 L-7,-10" strokeWidth={2.4} />
    <path d="M-7,-10 C-2,-13 2,-7 8,-9 L8,1 C2,3 -2,-3 -7,0 Z" fill="#8fbf5a" strokeWidth={2.2} />
  </Glyph>
);
/** "Siempre": a loop arrow going round. */
export const LoopGlyph = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M7,-4 A8,8 0 1,0 8,3" stroke={PEN} strokeWidth={2.6} />
    <path d="M3,-8 L8,-4 L3,0" stroke={PEN} strokeWidth={2.6} />
  </Glyph>
);
export const UTurnGlyph = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M-7,9 L-7,-2 A6,6 0 0,1 5,-2 L5,6" strokeWidth={2.6} />
    <path d="M1,3 L5,8 L9,3" strokeWidth={2.6} />
  </Glyph>
);
export const TopGlyph = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M-10,-10 L10,-10" stroke={PEN} strokeWidth={2.2} strokeDasharray="1 4" />
    <path d="M0,10 L0,-5 M-5,0 L0,-6 L5,0" strokeWidth={2.6} />
  </Glyph>
);
export const HeartGlyph = memo(function HeartGlyph({ size, empty }: { size?: number; empty?: boolean }) {
  return (
    <Glyph size={size}>
      <path d="M0,9 C-12,1 -11,-9 -4,-9 C-2,-9 0,-7 0,-5 C0,-7 2,-9 4,-9 C11,-9 12,1 0,9 Z" fill={empty ? PAPER : '#e7a3a0'} strokeWidth={2.2} strokeDasharray={empty ? '2 3' : undefined} />
      {!empty && <path d="M4,-6 Q8,-5 7,0" stroke="#fbf6ea" strokeWidth={1.6} />}
    </Glyph>
  );
});
export const StarGlyph = ({ size }: { size?: number }) => (
  <svg className="gm-glyph" viewBox="-12 -12 24 24" width={size ?? 24} height={size ?? 24} aria-hidden="true" overflow="visible"><StarArt r={11} /></svg>
);
export const EyeGlyph = ({ size, shut }: { size?: number; shut?: boolean }) => (
  <Glyph size={size}>
    {shut
      ? <><path d="M-10,0 Q0,8 10,0" strokeWidth={2.4} /><path d="M-6,4 L-8,8 M0,6 L0,10 M6,4 L8,8" strokeWidth={2} /></>
      : <><path d="M-10,0 Q0,-9 10,0 Q0,9 -10,0 Z" fill="#fbf6ea" strokeWidth={2.2} /><circle cx={0} cy={0} r={3.2} fill={INK} stroke="none" /></>}
  </Glyph>
);
/** An envelope with its message's seal (avisar / cuando recibo). */
export const EnvelopeGlyph = memo(function EnvelopeGlyph({ msg, size }: { msg: MsgId; size?: number }) {
  return (
    <Glyph size={size}>
      <path d={wobblyPoly([[-11, -7], [11, -7], [11, 8], [-11, 8]], { wob: 0.3, seed: 3 })} fill={PAPER} strokeWidth={2.2} />
      <path d="M-11,-7 L0,2 L11,-7" strokeWidth={2} />
      <circle cx={0} cy={2} r={3.6} fill={MSG_TONE[msg]} strokeWidth={1.6} />
    </Glyph>
  );
});
export const BubbleGlyph = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M-10,-8 Q-11,-10 -8,-10 L9,-10 Q11,-10 11,-8 L11,3 Q11,5 9,5 L-2,5 L-7,10 L-6,5 L-8,5 Q-10,5 -10,3 Z" fill={PAPER} strokeWidth={2.2} />
    <path d="M-5,-3 L6,-3 M-5,1 L2,1" strokeWidth={1.6} opacity={0.6} />
  </Glyph>
);
export const JarGlyphSmall = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M-7,-3 L7,-3 L8,1 L7,10 L-7,10 L-8,1 Z" fill="#eef0e4" strokeWidth={2} />
    <path d="M-8,-7 L8,-7 L7,-3 L-7,-3 Z" fill="#de8a56" strokeWidth={1.8} />
    <circle cx={-2} cy={5} r={2.8} fill="#f0d27a" strokeWidth={1.4} />
    <circle cx={3} cy={6} r={2.8} fill="#f0d27a" strokeWidth={1.4} />
  </Glyph>
);
export const KeyGlyph = ({ dir, size = 26 }: { dir: Dir; size?: number }) => <KeyCap dir={dir} size={size} />;
export const ArrowGlyph = ({ dir, size = 24 }: { dir: Dir; size?: number }) => <Arrow dir={dir} size={size} seed={3} width={5} />;
/** "Adelante": an arrow with the bird's little tail feather (the way it faces). */
export const AheadGlyph = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M-9,0 L8,0 M3,-5 L9,0 L3,5" strokeWidth={2.6} />
    <circle cx={-9} cy={0} r={2.4} fill={PEN} stroke="none" />
  </Glyph>
);

// ------------------------------------------------------------------ the board's HUD and marks

/** The score: a jar with its number (the jar of 3ro). */
export function ScoreJar({ n, bump }: { n: number; bump: number }) {
  return (
    <g className="gm-jar">
      <path d="M-26,-18 L26,-18 L30,-8 L28,34 L-28,34 L-30,-8 Z" fill="#eef0e4" stroke={INK} strokeWidth={2.8} strokeLinejoin="round" />
      <path d="M-28,-28 L28,-28 L26,-17 L-26,-17 Z" fill="#de8a56" stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
      <path d="M16,-14 L22,-10 L20,30 L14,30 Z" fill="#dfe3cf" />
      <text key={bump} className="gm-jar-n" x={0} y={18} textAnchor="middle">{n}</text>
    </g>
  );
}

/** Speech bubble over an object on the board (Gochi Hand), its tail pointing down to it. */
export function SayBubble({ text, x, y }: { text: string; x: number; y: number }) {
  const w = Math.max(56, text.length * 11 + 22);
  const d = `M${-w / 2},-44 Q${-w / 2},-50 ${-w / 2 + 6},-50 L${w / 2 - 6},-50 Q${w / 2},-50 ${w / 2},-44 L${w / 2},-20 Q${w / 2},-14 ${w / 2 - 6},-14 L6,-14 L-2,-4 L-4,-14 L${-w / 2 + 6},-14 Q${-w / 2},-14 ${-w / 2},-20 Z`;
  return (
    <g className="gm-say" transform={`translate(${x} ${y})`}>
      <path d={d} fill={PAPER} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" filter="url(#rough)" />
      <text x={0} y={-25} textAnchor="middle" className="gm-say-t">{text}</text>
    </g>
  );
}

/** A message flying between two objects: an envelope along a blue pen arc. */
export function FlyingEnvelope({ msg }: { msg: MsgId }) {
  return (
    <g className="gm-env">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <path d="M-17,-12 L17,-12 L17,12 L-17,12 Z" transform="translate(3 4)" fill={SHADOW} />
        <path d={wobblyPoly([[-17, -12], [17, -12], [17, 12], [-17, 12]], { wob: 0.4, seed: 9 })} fill={PAPER} stroke={INK} strokeWidth={2.4} />
        <path d="M-17,-12 L0,3 L17,-12" fill="none" stroke={INK} strokeWidth={2.2} />
        <circle cx={0} cy={3} r={5.4} fill={MSG_TONE[msg]} stroke={INK} strokeWidth={1.8} />
      </g>
    </g>
  );
}

// ------------------------------------------------------------------ the phase steps in the bar

/** Three small pages: ▶ play, ✎ change a rule, ★ your own game; the one on screen circled, the ones done stamped. */
export function PhaseSteps({ phase }: { phase: GmPhase | 'predict' }) {
  const order: (GmPhase | 'predict')[] = ['play', 'change', 'make', 'predict'];
  const at = order.indexOf(phase);
  const glyph = (p: GmPhase | 'predict') => {
    switch (p) {
      case 'play': return <path d="M-5,-7 L7,0 L-5,7 Z" fill="#de8a56" stroke={INK} strokeWidth={2} strokeLinejoin="round" />;
      case 'change': return <g><path d="M-7,7 L-6,2 L4,-8 L8,-4 L-2,6 Z" fill="#f0d27a" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" /><path d="M-7,7 L-4,6" stroke={INK} strokeWidth={1.6} /></g>;
      case 'make': return <StarArt r={9} />;
      case 'predict': return <text x={0} y={6} textAnchor="middle" className="gm-steps-q">?</text>;
    }
  };
  return (
    <span className="gm-steps" aria-hidden="true">
      {order.map((p, i) => (
        <svg key={p} className={`gm-step is-${i < at ? 'done' : i === at ? 'here' : 'todo'}`} viewBox="-16 -19 32 38" width={32} height={38} overflow="visible">
          <g filter="url(#rough)">
            <path d={wobblyPoly([[-12, -15], [12, -15], [12, 15], [-12, 15]], { wob: 0.4, seed: i + 3 })} transform="translate(2 3)" fill={SHADOW} />
            <path d={wobblyPoly([[-12, -15], [12, -15], [12, 15], [-12, 15]], { wob: 0.4, seed: i + 3 })} fill={i < at ? '#efe6d2' : PAPER} stroke={INK} strokeWidth={2} />
            {glyph(p)}
          </g>
          {i === at && <path className="gm-step-ring" d="M-3,-20 C14,-21 21,-8 19,6 C17,20 -4,24 -15,15 C-24,6 -20,-16 -1,-19" fill="none" stroke={PEN} strokeWidth={2.4} strokeLinecap="round" />}
          {i < at && <path d="M-7,1 L-2,7 L9,-8" fill="none" stroke={PEN} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      ))}
    </span>
  );
}

// ------------------------------------------------------------------ the end of a game

/** A burst of little stars round the win. */
export function WinBurst() {
  const stars = [[-120, -40, 0.7], [-90, 30, 0.5], [110, -30, 0.8], [96, 36, 0.55], [-20, -70, 0.5], [40, -64, 0.6]] as const;
  return (
    <svg className="gm-burst" viewBox="-150 -90 300 180" aria-hidden="true">
      <g filter="url(#rough)">
        {stars.map(([x, y, s], i) => <g key={i} className="gm-burst-star" style={{ animationDelay: `${i * 70}ms` }} transform={`translate(${x} ${y}) scale(${s})`}><StarArt r={22} /></g>)}
      </g>
    </svg>
  );
}

/** Three hearts filling again: nothing is lost for good. */
export function HeartsAgain() {
  return (
    <span className="gm-hearts-again" aria-hidden="true">
      {[0, 1, 2].map((i) => <span key={i} style={{ animationDelay: `${300 + i * 260}ms` }}><HeartGlyph size={38} /></span>)}
    </span>
  );
}

// ------------------------------------------------------------------ the prediction task's outcomes

/** A tiny board (3 × 2 cells of 60) as the page where an outcome is drawn. */
function MiniBoard({ children }: { children: ReactNode }) {
  const d = wobblyPoly([[0, 0], [180, 0], [180, 120], [0, 120]], { wob: 0.5, bow: 0.8, seed: 7 });
  return (
    <svg className="gm-outcome" viewBox="-10 -40 200 170" aria-hidden="true" overflow="visible">
      <g filter="url(#rough)">
        <path d={d} fill="#f6efdf" stroke={INK} strokeWidth={2.6} />
        <path d={`${wobblyLine(60, 2, 60, 118, { seed: 2 })} ${wobblyLine(120, 2, 120, 118, { seed: 3 })} ${wobblyLine(2, 60, 178, 60, { seed: 4 })}`} stroke={INK} strokeWidth={1.6} opacity={0.35} fill="none" />
      </g>
      {children}
    </svg>
  );
}
const Dash = ({ d }: { d: string }) => <path d={d} fill="none" stroke={PEN} strokeWidth={3} strokeLinecap="round" strokeDasharray="1 7" />;
const Head = ({ d }: { d: string }) => <path d={d} fill="none" stroke={PEN} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />;
const at = (x: number, y: number, s: number, node: ReactNode) => <g transform={`translate(${x} ${y}) scale(${s})`}>{node}</g>;

/** What an answer of the prediction task looks like. */
export function Outcome({ id }: { id: OutcomeId }) {
  switch (id) {
    case 'right':
      return <MiniBoard><ScenePlayer x={30} y={112} w={62} className="gm-mini-me" /><Dash d="M62,86 Q100,70 140,86" /><Head d="M130,78 L141,87 L129,94" /><g opacity={0.35}><ScenePlayer x={150} y={112} w={62} className="gm-mini-me" /></g></MiniBoard>;
    case 'up':
      return <MiniBoard><ScenePlayer x={90} y={112} w={62} className="gm-mini-me" /><Dash d="M130,100 L130,30" /><Head d="M122,40 L130,28 L138,40" /></MiniBoard>;
    case 'say_hola':
      return <MiniBoard><ScenePlayer x={90} y={112} w={62} className="gm-mini-me" /><SayBubble text="¡Hola!" x={96} y={48} /></MiniBoard>;
    case 'star_points':
      return (
        <MiniBoard>
          <ScenePlayer x={50} y={112} w={62} className="gm-mini-me" />
          <g opacity={0.3} filter="url(#rough)">{at(96, 76, 0.9, <StarArt />)}</g>
          <path d="M80,56 L112,96 M112,56 L80,96" stroke={PEN} strokeWidth={2.4} strokeLinecap="round" opacity={0.7} />
          <g filter="url(#rough)">{at(150, 60, 0.55, <ScoreJar n={1} bump={0} />)}</g>
          <text x={150} y={20} textAnchor="middle" className="gm-plus">+1</text>
        </MiniBoard>
      );
    case 'star_says':
      return <MiniBoard><ScenePlayer x={50} y={112} w={62} className="gm-mini-me" /><g filter="url(#rough)">{at(120, 86, 0.9, <StarArt />)}</g><SayBubble text="¡Hola!" x={124} y={62} /></MiniBoard>;
    case 'life_lost':
      return (
        <MiniBoard>
          <ScenePlayer x={60} y={112} w={62} className="gm-mini-me" />
          <foreignObject x={104} y={20} width={70} height={40}><span className="gm-mini-hearts"><HeartGlyph size={20} /><HeartGlyph size={20} /><HeartGlyph size={20} empty /></span></foreignObject>
          <text x={140} y={88} textAnchor="middle" className="gm-plus is-minus">−1</text>
        </MiniBoard>
      );
    case 'bird_says':
    case 'stone_says':
    case 'nobody':
      return (
        <MiniBoard>
          <ScenePlayer x={40} y={112} w={62} className="gm-mini-me" />
          <g filter="url(#rough)">{at(62, 78, 0.8, <StoneArt />)}{at(142, 34, 0.9, <BirdArt dir="left" />)}</g>
          {id === 'bird_says' && <SayBubble text="¡Cuidado!" x={138} y={20} />}
          {id === 'stone_says' && <SayBubble text="¡ay!" x={66} y={62} />}
          {id === 'nobody' && <text x={146} y={4} textAnchor="middle" className="gm-dots">…</text>}
        </MiniBoard>
      );
  }
}
