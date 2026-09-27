// Pieces the screens of 1ro's year share: the seed pouch (every solved level
// earns a seed; T4 plants them in a garden) and the seed that flies into it.

import { useEffect, useRef, useState } from 'react';
import { useProgress } from '../curriculum/progress';
import { REDUCED } from '../ui/runtime';
import { PouchArt } from '../ui/forestArt';
import { SeedIcon } from '../ui/art';
import { createRoot } from 'react-dom/client';

/** How long a won seed takes to fly into the pouch; the count changes when it lands. */
export const LAND_MS = 900;

/** The pouch and how many seeds it holds. A new seed is counted when it lands (it pops). */
export function SeedPouch({ className = '' }: { className?: string }) {
  const { seeds } = useProgress();
  const [shown, setShown] = useState(seeds);
  const [pops, setPops] = useState(0);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  useEffect(() => {
    if (seeds <= shownRef.current) { setShown(seeds); return; }
    const t = setTimeout(() => { setShown(seeds); setPops((n) => n + 1); }, REDUCED ? 0 : LAND_MS);
    return () => clearTimeout(t);
  }, [seeds]);
  return (
    <span className={`seed-pouch ${className}`} role="img" aria-label={`${shown} semillas`} data-count={shown}>
      <span key={pops} className={pops ? 'pouch-in is-popped' : 'pouch-in'}>
        <PouchArt />
      </span>
      <b key={`n${pops}`} className={`pouch-count${pops ? ' is-popped' : ''}`}>{shown}</b>
    </span>
  );
}

/** A seed flies from `from` (the goal on the board) to the pouch in an arc. Visual only. */
export function flySeed(from: Element | null) {
  const to = document.querySelector('.seed-pouch .pouch-in');
  if (!from || !to || REDUCED) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const host = document.createElement('div');
  host.className = 'flying-seed';
  document.body.append(host);
  const root = createRoot(host);
  root.render(<SeedIcon size={44} />);
  const x0 = a.left + a.width / 2 - 22, y0 = a.top + a.height / 2 - 22;
  const x1 = b.left + b.width / 2 - 22, y1 = b.top + b.height / 2 - 22;
  const lift = Math.min(y0, y1) - 90;
  const anim = host.animate([
    { translate: `${x0}px ${y0}px`, scale: '0.6', rotate: '0deg', opacity: 0 },
    { translate: `${x0}px ${y0 - 30}px`, scale: '1.15', rotate: '-10deg', opacity: 1, offset: 0.15 },
    { translate: `${(x0 + x1) / 2}px ${lift}px`, scale: '1', rotate: '20deg', opacity: 1, offset: 0.55 },
    { translate: `${x1}px ${y1}px`, scale: '0.55', rotate: '0deg', opacity: 1 },
  ], { duration: LAND_MS, easing: 'cubic-bezier(.35,.1,.45,1)', fill: 'forwards' });
  const done = () => { root.unmount(); host.remove(); };
  anim.finished.then(done, done);
}
