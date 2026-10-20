// "Al revés"'s art (T40), drawn in code in the habilidades notebook style
// (docs/style-guide.md: ink outlines, flat colours, one darker facet, flat
// offset shadows) but for 9–10 year olds: a dark ink corridor with a bright
// edge, strong silhouettes (black spikes, chunky logs), speed lines. No SVG
// filters on anything that moves (the stage redraws 30 times a second on
// the classroom's machines); the hand-drawn wobble is baked into the paths.
//
// Every sprite is drawn around its centre (0, 0), in SVG's y-down units,
// the size of its hit box or a little bigger (vm.ts HITBOX). Costumes are
// Scratch's: each sprite kind has a few (game.ts COSTUMES).

import { memo, useEffect, useRef } from 'react';
import { blob, wobblyLine, wobblyPoly } from '../ink/ink.js';
import { drawPortrait } from '../ui/board/BoardView';
import { usePlayer } from '../screens/player';

export const INK = '#2b2622';
const CREAM = '#fbf7ee';
const BAND = '#3a332e';
const BAND_LIGHT = '#5a514a';
const GOLD = '#f0d27a';
const GREEN = '#a4b86d';

// ------------------------------------------------------------------ the corridor

/** One tile of the floor (480 wide, centred), its walking edge on top. Repeats every 480 (the floor's own run wraps by one tile). */
export const FloorTile = memo(function FloorTile({ costume = 'pasillo', ceiling = false }: { costume?: string; ceiling?: boolean }) {
  const fill = costume === 'lava' ? '#c9574a' : costume === 'pasto' ? '#7d8f4a' : BAND;
  const light = costume === 'lava' ? '#f0a35a' : costume === 'pasto' ? '#a4b86d' : BAND_LIGHT;
  const edge = costume === 'lava' ? '#f6d07a' : costume === 'pasto' ? '#cfdaa6' : '#e9dfc9';
  const marks = [];
  for (let i = 0; i < 8; i++) {
    const x = -240 + i * 60;
    marks.push(<path key={`m${i}`} d={`M${x + 8},${-14} L${x + 26},${8}`} stroke={light} strokeWidth={3} strokeLinecap="round" opacity={0.8} />);
    marks.push(<path key={`n${i}`} d={`M${x + 30},${-14} L${x + 40},${-2}`} stroke={light} strokeWidth={2} strokeLinecap="round" opacity={0.55} />);
  }
  const deco = [];
  for (let i = 0; i < 4; i++) {
    const x = -200 + i * 120;
    if (costume === 'lava') deco.push(<circle key={i} cx={x} cy={-4 + (i % 2) * 8} r={4 + (i % 3)} fill="#f6d07a" stroke={INK} strokeWidth={1.4} />);
    else if (costume === 'pasto') deco.push(<path key={i} d={`M${x},-25 l-4,-9 M${x + 4},-25 l1,-11 M${x + 8},-25 l5,-8`} stroke={INK} strokeWidth={2} strokeLinecap="round" />);
    else deco.push(<path key={i} d={blob(x, -27, 7, 3.5, { seed: i + 3, n: 7, wob: 0.2 })} fill="#9f937f" stroke={INK} strokeWidth={1.6} />);
  }
  return (
    <g transform={ceiling ? 'scale(1 -1)' : undefined}>
      <rect x={-241} y={-25} width={482} height={60} fill={fill} />
      {marks}
      <path d={wobblyLine(-241, -25, 241, -25, { bow: 0.8, seed: 3, segs: 6, jit: 0.6 })} stroke={INK} strokeWidth={4} fill="none" />
      <path d={wobblyLine(-241, -21, 241, -21, { bow: 0.6, seed: 5, segs: 6, jit: 0.4 })} stroke={edge} strokeWidth={2.2} fill="none" opacity={0.9} />
      {!ceiling && deco}
    </g>
  );
});

/** Behind everything: the corridor's wall (arches between pillars, a hanging lamp in each), one 160-wide tile; it scrolls slower than the floor (parallax). */
export const BackTile = memo(function BackTile() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* the arch's deep inside, darker paper with pencil hatching */}
      <path d="M22,132 L22,-20 Q80,-96 138,-20 L138,132 Z" fill="#e3d5b9" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => <path key={i} d={`M${34 + i * 15},128 L${48 + i * 15},96`} stroke="#c9b892" strokeWidth={2} />)}
      <path d="M22,132 L22,-20 Q80,-96 138,-20 L138,132" fill="none" stroke={INK} strokeWidth={3} opacity={0.55} />
      {/* the pillar between arches, with its flat shade */}
      <rect x={-12} y={-132} width={34} height={264} fill="#d8c8a8" />
      <rect x={10} y={-132} width={12} height={264} fill="#c6b48f" />
      <path d="M-12,-132 L-12,132 M22,-132 L22,132" stroke={INK} strokeWidth={3} opacity={0.6} />
      <path d="M-16,96 L26,96 M-16,-96 L26,-96" stroke={INK} strokeWidth={2.6} opacity={0.5} />
      {/* a lamp hanging from the ceiling, its warm glow */}
      <path d="M80,-130 L80,-102" stroke={INK} strokeWidth={2} opacity={0.7} />
      <circle cx={80} cy={-88} r={20} fill={GOLD} opacity={0.28} />
      <path d={blob(80, -90, 9, 11, { seed: 4, n: 8, wob: 0.06 })} fill={GOLD} stroke={INK} strokeWidth={2.2} />
      <path d="M74,-101 L86,-101" stroke={INK} strokeWidth={2.6} />
    </g>
  );
});

/** Speed lines streaming left (more when the world runs faster). */
export function SpeedLines({ n = 6 }: { n?: number }) {
  return (
    <g className="ws-speed" stroke={INK} strokeLinecap="round" opacity={0.35}>
      {Array.from({ length: n }, (_, i) => (
        <path key={i} className="ws-speed-line" style={{ animationDelay: `${-i * 0.13}s` }} d={`M${-10 - (i % 3) * 8},${-18 + i * 7} l${-22 - (i % 2) * 14},0`} strokeWidth={2.4 - (i % 3) * 0.5} />
      ))}
    </g>
  );
}

// ------------------------------------------------------------------ the sprites

/** The child's own character, dressed (a portrait in a nested svg), standing with its feet near the hit box's bottom. */
export function PlayerArt({ costume }: { costume: string }) {
  const player = usePlayer();
  const ref = useRef<SVGSVGElement>(null);
  const key = `${player.def.id}:${JSON.stringify(player.outfit)}:${costume}`;
  useEffect(() => {
    if (ref.current) drawPortrait(player.def, ref.current, { x: 0.55, y: 0.05 }, costume === 'feliz' ? 'grin' : 'smile', player.outfit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const w = 80;
  return (
    <g>
      <ellipse cx={0} cy={28} rx={24} ry={4.5} fill="url(#hatch)" opacity={0.8} />
      <svg ref={ref} x={-w / 2} y={28 - w * (100 / 104)} width={w} height={w} viewBox="-52 -100 104 104" overflow="visible" aria-hidden="true" data-player={player.def.id} />
      {costume === 'mareado' && (
        <g className="ws-dizzy" stroke={INK} strokeWidth={1.6} fill={GOLD}>
          <path d="M-14,-44 l3,-6 l3,6 l-6,-3.6 l6,0 z" />
          <path d="M10,-48 l3,-6 l3,6 l-6,-3.6 l6,0 z" />
        </g>
      )}
    </g>
  );
}

/** An obstacle: a log rolling at you, black spikes, or a rock; its base at the bottom (+20). */
export const ObstacleArt = memo(function ObstacleArt({ costume }: { costume: string }) {
  if (costume === 'pinches') {
    const spike = (x: number, h: number, s: number) => wobblyPoly([[x - 11, 21], [x, 21 - h], [x + 11, 21]], { wob: 0.5, bow: 0.6, seed: s });
    return (
      <g strokeLinejoin="round">
        <path d={spike(-15, 30, 1)} fill={INK} stroke={INK} strokeWidth={2.4} />
        <path d={spike(15, 30, 2)} fill={INK} stroke={INK} strokeWidth={2.4} />
        <path d={spike(0, 42, 3)} fill={INK} stroke={INK} strokeWidth={2.4} />
        <path d="M-2,-14 L-6,14 M-17,0 L-19,14 M13,0 L11,14" stroke={CREAM} strokeWidth={2} strokeLinecap="round" opacity={0.7} />
      </g>
    );
  }
  if (costume === 'piedra') {
    return (
      <g strokeLinejoin="round">
        <path d={blob(0, 4, 26, 18, { seed: 5, n: 10, wob: 0.08 })} fill="#9f937f" stroke={INK} strokeWidth={2.8} />
        <path d={blob(-6, -2, 13, 8, { seed: 7, n: 8, wob: 0.1 })} fill="#bdb09c" />
        <path d="M6,-6 l5,8 l-3,7" fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      </g>
    );
  }
  // the log: its round end towards the character (on the left), bark lines along it
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d={wobblyPoly([[-16, -18], [26, -17], [27, 20], [-16, 20]], { wob: 0.6, bow: 1.4, seed: 4 })} fill="#a2703f" stroke={INK} strokeWidth={2.8} />
      <path d={wobblyLine(-6, -6, 22, -7, { bow: 1, seed: 2 })} stroke="#7d5330" strokeWidth={2.4} fill="none" />
      <path d={wobblyLine(-4, 9, 23, 8, { bow: 1, seed: 6 })} stroke="#7d5330" strokeWidth={2.4} fill="none" />
      <path d={blob(-16, 1, 13, 19.5, { seed: 9, n: 10, wob: 0.04 })} fill="#e3c08a" stroke={INK} strokeWidth={2.8} />
      <path d={blob(-16, 1, 7.5, 11.5, { seed: 3, n: 9, wob: 0.06 })} fill="none" stroke="#a2703f" strokeWidth={2} />
      <circle cx={-16} cy={1} r={2.6} fill="#a2703f" />
    </g>
  );
});

/** A seed (the points), with its sprout and a soft pen ring around it. */
export const SeedArt = memo(function SeedArt({ costume }: { costume: string }) {
  if (costume === 'moneda') {
    return (
      <g>
        <circle r={15} fill={GOLD} stroke={INK} strokeWidth={2.6} />
        <circle r={9} fill="none" stroke="#c9a23e" strokeWidth={2} />
        <path d="M-1,-5 L-1,6" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      </g>
    );
  }
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <circle className="ws-seed-ring" r={21} fill="none" stroke="#3d6ea5" strokeWidth={2} strokeDasharray="2 6" opacity={0.7} />
      <path d="M0,0 C-2,-6 2,-10 0,-15" fill="none" stroke={INK} strokeWidth={2.4} />
      <path d="M0,-12 Q-10,-23 -13,-19 Q-9,-10 0,-12 Z" fill={GREEN} stroke={INK} strokeWidth={2} />
      <path d="M0,-14 Q10,-25 12,-21 Q8,-12 0,-14 Z" fill={GREEN} stroke={INK} strokeWidth={2} />
      <path d={blob(0, 5, 11, 10, { wob: 0.05, n: 9, seed: 4 })} fill={GOLD} stroke={INK} strokeWidth={2.6} />
      <path d="M-5,2 Q-4,-1 -1,-1" stroke={CREAM} strokeWidth={2} fill="none" />
    </g>
  );
});

/** A paper bird (or a bat), wings flapping. */
export const BirdArt = memo(function BirdArt({ costume }: { costume: string }) {
  const bat = costume === 'murciélago';
  const body = bat ? '#5e554c' : '#7298c1';
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d={wobblyPoly([[-22, 2], [16, -8], [24, 0], [16, 8]], { wob: 0.4, bow: 0.8, seed: 2 })} fill={body} stroke={INK} strokeWidth={2.6} />
      <g className="ws-wing">
        <path d={bat ? 'M-4,-2 L-16,-22 L-8,-16 L-2,-24 L4,-14 L8,-2 Z' : wobblyPoly([[-6, -2], [4, -26], [10, -2]], { wob: 0.4, bow: 1, seed: 5 })} fill={bat ? '#3a332e' : '#a9c3de'} stroke={INK} strokeWidth={2.4} />
      </g>
      <circle cx={14} cy={-2} r={2.4} fill={INK} />
      <path d="M24,0 L31,2 L24,4" fill={GOLD} stroke={INK} strokeWidth={1.6} />
    </g>
  );
});

/** The power-up: a star (or a heart). */
export const StarArt = memo(function StarArt({ costume }: { costume: string }) {
  if (costume === 'corazón') {
    return <path d="M0,16 C-22,2 -20,-16 -8,-16 C-3,-16 0,-11 0,-8 C0,-11 3,-16 8,-16 C20,-16 22,2 0,16 Z" fill="#e7a3a0" stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />;
  }
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 8.5 : 19;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return (
    <g className="ws-star" strokeLinejoin="round">
      <path d={wobblyPoly(pts, { wob: 0.3, bow: 0.4, seed: 8 })} fill={GOLD} stroke={INK} strokeWidth={2.6} />
      <path d="M-4,-6 L-1,-10" stroke={CREAM} strokeWidth={2.2} strokeLinecap="round" />
    </g>
  );
});

/** A sprite's card picture (the sprite list): its own costume, small. */
export function SpriteThumb({ kind, costume }: { kind: string; costume: string }) {
  return (
    <svg viewBox="-36 -36 72 72" className="ws-thumb" aria-hidden="true">
      {kind === 'player' && <PlayerArt costume={costume} />}
      {kind === 'obstacle' && <ObstacleArt costume={costume} />}
      {kind === 'seed' && <SeedArt costume={costume} />}
      {kind === 'bird' && <BirdArt costume={costume} />}
      {kind === 'star' && <StarArt costume={costume} />}
      {kind === 'floor' && <g transform="scale(0.15 0.6) translate(0 8)"><FloorTile costume={costume} /></g>}
      {kind === 'stage' && (
        <g>
          <rect x={-30} y={-24} width={60} height={48} rx={4} fill={CREAM} stroke={INK} strokeWidth={2} />
          <rect x={-30} y={14} width={60} height={10} fill={BAND} />
          <rect x={-30} y={-24} width={60} height={10} fill={BAND} />
          <path d="M-12,8 L-12,-6 Q-4,-16 4,-6 L4,8" fill="none" stroke={INK} strokeWidth={1.6} opacity={0.4} />
        </g>
      )}
    </svg>
  );
}

/** Little sparks (a seed caught) and the hit's star burst, as drawn shapes. */
export function Burst({ hit }: { hit?: boolean }) {
  if (hit) {
    const pts: [number, number][] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const r = i % 2 ? 12 : 28;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return (
      <g className="ws-burst is-hit">
        <path d={wobblyPoly(pts, { wob: 1, bow: 0.6, seed: 3 })} fill="#f0a35a" stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
        <path d={blob(0, 0, 8, 8, { seed: 2 })} fill={CREAM} />
      </g>
    );
  }
  return (
    <g className="ws-burst">
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4 + 0.3;
        return <circle key={i} className="ws-spark" cx={0} cy={0} r={i % 2 ? 3 : 4.5} fill={i % 3 ? GOLD : CREAM} stroke={INK} strokeWidth={1.4} style={{ '--dx': `${Math.cos(a) * 34}px`, '--dy': `${Math.sin(a) * 34}px` } as React.CSSProperties} />;
      })}
      <text className="ws-plus" x={0} y={-24} textAnchor="middle">+1</text>
    </g>
  );
}


/** The menu's card (free play): a Scratch-like stack beside a tiny "Al revés" corridor, the character flipping to the ceiling. */
export function WorkshopCardArt() {
  const blk = (x: number, y: number, w: number, h: number, fill: string, hat = false) => (
    <g>
      <path d={hat
        ? `M${x},${y + 8} C${x + 10},${y - 3} ${x + 30},${y - 3} ${x + 40},${y + 8} L${x + w},${y + 8} L${x + w},${y + h} L${x + 16},${y + h} L${x + 13},${y + h + 3} L${x + 7},${y + h + 3} L${x + 4},${y + h} L${x},${y + h} Z`
        : `M${x},${y} L${x + 4},${y} L${x + 7},${y + 3} L${x + 13},${y + 3} L${x + 16},${y} L${x + w},${y} L${x + w},${y + h} L${x + 16},${y + h} L${x + 13},${y + h + 3} L${x + 7},${y + h + 3} L${x + 4},${y + h} L${x},${y + h} Z`}
      fill={fill} stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
      <path d={`M${x + 8},${y + (hat ? 8 : 0) + (h - (hat ? 8 : 0)) / 2} l${w * 0.55},0`} stroke={INK} strokeWidth={2.4} strokeLinecap="round" opacity={0.55} />
    </g>
  );
  return (
    <svg className="pp-fp-art" viewBox="0 0 260 190" aria-hidden="true">
      <g transform="translate(14 30)">
        {blk(0, 0, 92, 30, '#f5c64f', true)}
        {blk(0, 30, 80, 22, '#7aa6e8')}
        <path d="M0,52 L4,52 L7,55 L13,55 L16,52 L96,52 L96,72 L30,72 L27,75 L21,75 L18,72 L14,72 L14,96 L96,96 L96,112 L16,112 L13,115 L7,115 L4,112 L0,112 Z" fill="#f6b45a" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
        {blk(14, 72, 70, 24, '#ec7f8e')}
        <path d="M8,62 l40,0" stroke={INK} strokeWidth={2.4} strokeLinecap="round" opacity={0.55} />
      </g>
      <g transform="translate(124 34)">
        <rect x={0} y={0} width={124} height={122} rx={6} fill="#f4ecdc" stroke={INK} strokeWidth={2.6} />
        <rect x={1.5} y={1.5} width={121} height={18} fill={BAND} />
        <rect x={1.5} y={102} width={121} height={18.5} fill={BAND} />
        <path d="M2,20 L122,20 M2,102 L122,102" stroke={INK} strokeWidth={2.6} />
        <path d="M88,102 L96,86 L104,102 Z M100,102 L106,90 L112,102 Z" fill={INK} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
        <path d="M70,20 L77,34 L84,20 Z" fill={INK} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
        <path d="M30,92 C26,62 26,50 30,30" fill="none" stroke="#3d6ea5" strokeWidth={2.6} strokeDasharray="2 6" strokeLinecap="round" />
        <path d="M24,38 L30,28 L36,38" fill="none" stroke="#3d6ea5" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        <path d={blob(30, 34, 11, 12, { seed: 6, n: 9 })} transform="translate(0 -6)" fill="#de8a56" stroke={INK} strokeWidth={2.4} />
        <circle cx={27} cy={31} r={2} fill={INK} /><circle cx={34} cy={31} r={2} fill={INK} />
        <g transform="translate(56 66)"><SeedArt costume="semilla" /></g>
        <path d="M108,56 l-16,0 M110,66 l-22,0 M106,76 l-12,0" stroke={INK} strokeWidth={2.2} strokeLinecap="round" opacity={0.35} />
      </g>
    </svg>
  );
}

/**
 * T41, 4to's Arcade: the "Tu juego" card. The child's own "Al revés" as a
 * game screen: the corridor, their character upside down on the ceiling
 * with the flip's dashed arc, spikes on the floor, a seed; beside it a gold
 * record ribbon (the best score to beat).
 */
export function OwnGameCardArt() {
  return (
    <svg className="pp-fp-art" viewBox="0 0 260 190" aria-hidden="true">
      <g transform="translate(10 22)">
        <rect x={6} y={8} width={176} height={140} rx={10} fill="rgba(84, 62, 38, 0.2)" />
        <rect x={0} y={0} width={176} height={140} rx={10} fill="#f4ecdc" stroke={INK} strokeWidth={2.8} />
        <rect x={1.5} y={1.5} width={173} height={22} rx={8} fill={BAND} />
        <rect x={1.5} y={116} width={173} height={22.5} rx={8} fill={BAND} />
        <path d="M2,24 L174,24 M2,116 L174,116" stroke={INK} strokeWidth={2.6} />
        <g transform="translate(118 96) scale(0.62)"><ObstacleArt costume="pinches" /></g>
        <g transform="translate(150 70) scale(0.7)"><SeedArt costume="semilla" /></g>
        <path d="M44,96 C30,74 30,58 44,40" fill="none" stroke="#3d6ea5" strokeWidth={2.6} strokeDasharray="2 6" strokeLinecap="round" />
        <path d="M37,48 L44,38 L50,48" fill="none" stroke="#3d6ea5" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        <g transform="translate(66 52) rotate(180) scale(0.5)"><PlayerArt costume="normal" /></g>
        <path d="M98,58 l-14,0 M100,68 l-20,0" stroke={INK} strokeWidth={2.2} strokeLinecap="round" opacity={0.35} />
      </g>
      <g transform="translate(222 118)" strokeLinejoin="round" strokeLinecap="round">
        <path d="M-14,10 L-20,46 L-8,38 L-2,50 L4,14 Z" fill="#c9574a" stroke={INK} strokeWidth={2.4} />
        <path d="M14,10 L20,46 L8,38 L2,50 L-4,14 Z" fill="#7298c1" stroke={INK} strokeWidth={2.4} />
        <circle r={24} fill={GOLD} stroke={INK} strokeWidth={2.8} />
        <circle r={16} fill="none" stroke={INK} strokeWidth={1.6} opacity={0.5} />
        <path d="M0,-11 L3.4,-3.6 L11,-3.2 L5,2 L7,10 L0,5.6 L-7,10 L-5,2 L-11,-3.2 L-3.4,-3.6 Z" fill="#fbf7ee" stroke={INK} strokeWidth={1.8} />
      </g>
    </svg>
  );
}
