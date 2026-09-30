// The survey's drawings: faces for "¿Te gustó?" and "¿Fue fácil o
// difícil?", the sí / no of "¿Querés volver a jugar?", and a picture per
// activity for "¿Qué te gustó más?". Paper-yellow discs, ink boiled by
// #rough, a flat darker facet, blue pen for the marks: the notebook's style.

import { memo } from 'react';
import { blob } from '../ink/ink.js';
import { GuardaIcon, JarIcon, PageIcon, SeedIcon, SongIcon } from '../ui/art';
import { WardrobeIcon } from '../ui/wardrobeArt';
import { PlayerFace } from '../screens/player';

const INK = '#2b2622';
const PEN = '#3d6ea5';

export type FaceMood = 'happy' | 'mid' | 'sad' | 'easy' | 'hard';

/** A face on a paper disc (viewBox -50 -50 100 100). */
export const Face = memo(function Face({ mood, seed = 1 }: { mood: FaceMood; seed?: number }) {
  const fill = mood === 'happy' || mood === 'easy' ? '#f5e2a6' : mood === 'mid' ? '#efe3c6' : '#f1c9c6';
  const shade = mood === 'happy' || mood === 'easy' ? '#e9cd78' : mood === 'mid' ? '#dccfae' : '#e4aaa6';
  const eyes = mood === 'easy'
    ? <path d="M-24,-10 Q-17,-19 -10,-10 M10,-10 Q17,-19 24,-10" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
    : <>
      <ellipse cx={-16} cy={-10} rx={4.6} ry={6} fill={INK} />
      <ellipse cx={16} cy={-10} rx={4.6} ry={6} fill={INK} />
    </>;
  const mouth = {
    happy: 'M-22,8 Q0,32 22,8',
    easy: 'M-18,10 Q0,26 18,10',
    mid: 'M-16,16 L16,15',
    sad: 'M-18,24 Q0,6 18,24',
    hard: 'M-20,20 Q-13,13 -7,20 Q0,27 7,20 Q13,13 20,20',
  }[mood];
  return (
    <svg className="pp-face" viewBox="-50 -50 100 100" aria-hidden="true">
      <g filter="url(#rough)">
        <path d={blob(0, 0, 44, 43, { wob: 0.03, n: 12, seed })} fill={fill} stroke={INK} strokeWidth={3.4} />
        <path d={`M20,-36 A44,43 0 0,1 38,24 Q24,10 20,-36 Z`} fill={shade} opacity={0.7} />
        {eyes}
        {(mood === 'happy' || mood === 'easy') && <>
          <ellipse cx={-27} cy={8} rx={6} ry={4} fill="#e7a3a0" opacity={0.8} />
          <ellipse cx={27} cy={8} rx={6} ry={4} fill="#e7a3a0" opacity={0.8} />
        </>}
        {mood === 'hard' && <>
          <path d="M-27,-17 L-11,-24 M27,-17 L11,-24" stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
          <path d="M33,-26 C29,-18 30,-12 34,-11 C38,-12 38,-18 33,-26 Z" fill="#a9c3de" stroke={PEN} strokeWidth={2} strokeLinejoin="round" />
        </>}
        <path d={mouth} fill="none" stroke={INK} strokeWidth={4.2} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
});

/** "sí" or "no", written big in pen on a paper disc, with a nod or a shake drawn beside it. */
export const YesNo = memo(function YesNo({ yes }: { yes: boolean }) {
  return (
    <svg className="pp-face" viewBox="-50 -50 100 100" aria-hidden="true">
      <g filter="url(#rough)">
        <path d={blob(0, 0, 44, 43, { wob: 0.03, n: 12, seed: yes ? 5 : 6 })} fill={yes ? '#cfdcaa' : '#f1c9c6'} stroke={INK} strokeWidth={3.4} />
        <text x={0} y={14} textAnchor="middle" fontFamily="'Gochi Hand', 'Andika', cursive" fontSize={42} fill={INK}>{yes ? 'sí' : 'no'}</text>
        {/* the head's movement: up and down for sí, side to side for no */}
        {yes
          ? <path d="M-38,-8 L-38,8 M-44,-2 L-38,-10 L-32,-2 M-44,2 L-38,10 L-32,2" fill="none" stroke={PEN} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          : <path d="M-10,-34 L10,-34 M-4,-40 L-12,-34 L-4,-28 M4,-40 L12,-34 L4,-28" fill="none" stroke={PEN} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
      </g>
    </svg>
  );
});

/** A little board with a path of arrows to a seed: "the levels". */
function BoardPicture() {
  return (
    <svg className="pp-activity-art" viewBox="0 0 100 80" aria-hidden="true">
      <g filter="url(#rough)">
        <rect x={6} y={10} width={88} height={60} rx={4} fill="#f6efdf" stroke={INK} strokeWidth={3} />
        <path d="M35,10 L35,70 M64,10 L64,70 M6,40 L94,40" stroke={INK} strokeWidth={1.6} opacity={0.45} />
        <path d="M18,55 L28,55 M24,50 L29,55 L24,60 M44,55 L55,55 M50,50 L55,55 L50,60" fill="none" stroke={PEN} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <svg x={66} y={40} width={28} height={28} viewBox="-20 -20 40 40" overflow="visible"><g transform="scale(0.9)"><SeedInline /></g></svg>
    </svg>
  );
}
function SeedInline() {
  return (
    <g filter="url(#rough)">
      <path d="M0,-2 C0,-10 2,-14 0,-18" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <path d={blob(0, 6, 11, 10, { seed: 3 })} fill="#f0d27a" stroke={INK} strokeWidth={2.6} />
    </g>
  );
}

/** A keyboard: "Teclas del bosque". */
function KeysPicture() {
  return (
    <svg className="pp-activity-art" viewBox="0 0 100 80" aria-hidden="true">
      <g filter="url(#rough)">
        <rect x={6} y={20} width={88} height={46} rx={6} fill="#efe3c6" stroke={INK} strokeWidth={3} />
        {[0, 1, 2].map((r) => Array.from({ length: 6 - r }, (_, i) => (
          <rect key={`${r}-${i}`} x={14 + r * 6 + i * 12.5} y={27 + r * 12} width={9} height={8} rx={2} fill={r === 1 && i === 2 ? '#f0d27a' : '#fbf7ee'} stroke={INK} strokeWidth={1.6} />
        )))}
      </g>
    </svg>
  );
}

/** A hand and an arrow block: the tool check. */
function ToolPicture() {
  return (
    <svg className="pp-activity-art" viewBox="0 0 100 80" aria-hidden="true">
      <g filter="url(#rough)">
        <rect x={10} y={22} width={46} height={34} rx={6} fill="#eeac7f" stroke={INK} strokeWidth={3} />
        <path d="M22,39 L44,39 M36,31 L44,39 L36,47" fill="none" stroke={INK} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
        <g transform="translate(52 20) scale(2.1)">
          <path d="M7.4,13.2 L7.2,6.6 C7.2,5.3 9.1,5.2 9.2,6.5 L9.4,11.2 L9.3,4.4 C9.3,3 11.3,3 11.4,4.4 L11.6,10.8 L11.7,4.1 C11.8,2.7 13.8,2.8 13.8,4.2 L13.8,11 L14.3,5.5 C14.4,4.2 16.3,4.3 16.3,5.6 L16.1,13.4 L17.6,11.2 C18.4,10 20.2,10.9 19.5,12.3 C18.4,14.6 17.2,17.4 15.4,19.1 C14.3,20.2 12.8,20.8 11.3,20.8 C8.8,20.8 7.4,19 7.4,16.4 Z" fill="#eeac7f" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
        </g>
      </g>
    </svg>
  );
}

/** The picture of an activity (flow activity ids; free-play entries by their `activity`). */
export function ActivityPicture({ activity }: { activity: string }) {
  switch (activity) {
    case 'character': return <PlayerFace className="pp-activity-art" />;
    case 'ladder': case 'sheet': return <BoardPicture />;
    case 'tool_check': return <ToolPicture />;
    case 'typing': return <KeysPicture />;
    case 'wardrobe': return <span className="pp-activity-art"><WardrobeIcon open size={96} /></span>;
    case 'recess': return <span className="pp-activity-art"><SongIcon size={96} /></span>;
    case 'guardas': return <span className="pp-activity-art"><GuardaIcon size={96} /></span>;
    case 'rule_game': case 'game_maker': return <span className="pp-activity-art"><JarIcon size={96} /></span>;
    case 'garden': return <span className="pp-activity-art"><SeedIcon size={96} /></span>;
    default: return <span className="pp-activity-art pp-activity-page"><PageIcon state="todo" seed={activity.length} /></span>;
  }
}
