// Drawings of the wardrobe (el vestidor): the wooden wardrobe as a small
// picture (the map's corner, the bar), open or shut with a wooden bar across
// its doors like a door not open yet; a piece alone on its hook; the round
// rag rug the character stands on; the tag of what unlocks a piece (seeds, or
// a finished sheet). Same ink, weights and flat facets as the rest
// (docs/style-guide.md).

import { memo, useEffect, useRef } from 'react';
import { blob, wobblyLine, wobblyPoly } from '../ink/ink.js';
import type { ItemId, Unlock } from '../curriculum/motivation';
import { drawItemIcon } from './outfit';
import { SeedIcon } from './art';
import { StopArt } from './forestArt';

const INK = '#2b2622';
const SHADOW = 'rgba(84, 62, 38, 0.2)';
const WOOD = '#c9955f';
const WOOD_DARK = '#a57c55';

let iconN = 0;

/** A wardrobe piece alone (its hook, the dev drawer, a new piece's greeting). */
export function ItemIcon({ id, className }: { id: ItemId; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => { if (ref.current) drawItemIcon(ref.current, id, `ic${++iconN}`); }, [id]);
  return <svg ref={ref} className={className} viewBox="-40 -40 80 80" aria-hidden="true" data-item-icon={id} />;
}

/** The wardrobe, small: two wooden doors, open with the pieces showing, or shut with a bar across. */
export const WardrobeIcon = memo(function WardrobeIcon({ open, size = 46 }: { open: boolean; size?: number }) {
  const body = wobblyPoly([[-19, -22], [19, -23], [20, 22], [-20, 23]], { wob: 0.5, bow: 0.8, seed: 7 });
  return (
    <svg viewBox="-28 -30 56 60" width={size} height={size * 60 / 56} aria-hidden="true" className="doodle wardrobe-icon">
      <g filter="url(#rough)" stroke={INK} strokeLinejoin="round" strokeLinecap="round">
        <path d={body} transform="translate(2 3)" fill={SHADOW} stroke="none" />
        <path d={body} fill={WOOD} strokeWidth={2.4} />
        <path d="M-20,-26 L20,-27 L21,-21 L-21,-20 Z" fill={WOOD_DARK} strokeWidth={2.2} />
        {open ? (
          <>
            <path d="M-15,-17 L15,-18 L15,18 L-15,19 Z" fill="#6e5a48" strokeWidth={1.8} />
            <path d="M-13,-12 L13,-13" strokeWidth={1.8} />
            <path d="M-8,-12 q-4,5 -1,11 q3,2 5,-1 l-1,-10 Z" fill="#c9574a" strokeWidth={1.4} />
            <path d="M4,-12 l-2,10 q5,3 9,0 l-2,-10" fill="#7298c1" strokeWidth={1.4} />
            <path d="M-17,-18 L-25,-15 L-25,20 L-17,20 Z" fill={WOOD} strokeWidth={2} />
            <path d="M17,-18 L25,-15 L25,20 L17,20 Z" fill={WOOD} strokeWidth={2} />
          </>
        ) : (
          <>
            <path d="M0,-18 L0,20" strokeWidth={1.8} />
            <circle cx={-3.5} cy={2} r={1.6} fill={INK} />
            <circle cx={3.5} cy={2} r={1.6} fill={INK} />
            <path d={wobblyPoly([[-23, -3], [23, -6], [23, 2], [-23, 5]], { wob: 0.4, bow: 0.6, seed: 9 })} fill="#8d6844" strokeWidth={2.2} />
          </>
        )}
      </g>
    </svg>
  );
});

/** The dressing mirror behind the character: an oval of pale glass in a wooden frame, two glints. */
export function Mirror() {
  return (
    <g className="mirror-glass" strokeLinejoin="round" strokeLinecap="round">
      <path d="M-4,-8 L-10,6 M4,-8 L10,6" stroke={INK} strokeWidth={5} />
      <path d="M-4,-8 L-10,6 M4,-8 L10,6" stroke={WOOD_DARK} strokeWidth={2.6} />
      <path d={blob(4, -84, 64, 82, { seed: 12, n: 14, wob: 0.015 })} fill={SHADOW} />
      <path d={blob(0, -88, 64, 82, { seed: 12, n: 14, wob: 0.015 })} fill={WOOD} stroke={INK} strokeWidth={2.6} />
      <path d={blob(0, -88, 54, 72, { seed: 13, n: 14, wob: 0.015 })} fill="#dce6f0" stroke={INK} strokeWidth={2} />
      <path d="M-34,-128 Q-26,-142 -12,-148 M-38,-108 Q-32,-120 -24,-126" fill="none" stroke="#fbf7ee" strokeWidth={4} />
    </g>
  );
}

/** The round rag rug under the character, rings of colour. */
export function Rug() {
  const rings: [number, string][] = [[1, '#de8a56'], [0.8, '#f0d27a'], [0.6, '#7298c1'], [0.4, '#e7a3a0']];
  return (
    <g className="rug" strokeLinejoin="round">
      <path d={blob(3, 6, 70, 17, { seed: 3, n: 12, wob: 0.03 })} fill={SHADOW} />
      {rings.map(([k, c], i) => <path key={i} d={blob(0, 2, 70 * k, 17 * k, { seed: 3 + i, n: 12, wob: 0.03 })} fill={c} stroke={INK} strokeWidth={i ? 1.4 : 2.6} strokeOpacity={i ? 0.5 : 1} />)}
      {[-50, -20, 20, 50].map((x) => <path key={x} d={wobblyLine(x, -2, x * 1.05, 8, { bow: 0.6, seed: x + 60 })} stroke={INK} strokeWidth={1.2} opacity={0.3} fill="none" />)}
    </g>
  );
}

/** What unlocks a piece, drawn: a seed and how many, or the page of the sheet to finish. */
export function UnlockTag({ unlock }: { unlock: Unlock }) {
  if ('seeds' in unlock) {
    return (
      <span className="unlock-tag is-seeds" aria-hidden="true">
        <SeedIcon size={24} />
        <b>{unlock.seeds}</b>
      </span>
    );
  }
  return (
    <span className="unlock-tag is-sheet" aria-hidden="true">
      <svg viewBox="-40 -48 80 96" width={26} height={31}>
        <StopArt n={unlock.sheet} look={unlock.sheet >= 10 ? 'stone' : 'page'} soon={false} mark="none" seed={unlock.sheet * 11} />
      </svg>
    </span>
  );
}
