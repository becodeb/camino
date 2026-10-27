// 4to's coins (C14): the big "+N" that shows when a result pays seeds. A burst
// of seed icons around the number, then a bag chip with the child's total that
// counts up from what they had. Visual only: the seeds are already in the
// progress when it shows (copa2/coins.ts and the callers do the paying).

import { useEffect, useState } from 'react';
import { SeedIcon } from '../ui/art';
import { PouchArt } from '../ui/forestArt';
import { REDUCED } from '../ui/runtime';
import './coinBurst.css';

/** The big part stays this long; the bag chip a little longer. */
export const BURST_MS = 2600;
export const CHIP_MS = 7000;
const COUNT_MS = 900;

export interface Burst { amount: number; total: number; n: number }

/** The seeds flying out: fixed angles, so a screenshot and a test see the same burst. */
const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315];

export function CoinBurst({ burst }: { burst: Burst | null }) {
  if (!burst) return null;
  return <Shown key={burst.n} burst={burst} />;
}

function Shown({ burst }: { burst: Burst }) {
  const from = Math.max(0, burst.total - burst.amount);
  const [big, setBig] = useState(true);
  const [chip, setChip] = useState(true);
  const [count, setCount] = useState(REDUCED ? burst.total : from);
  useEffect(() => {
    const a = setTimeout(() => setBig(false), BURST_MS);
    const b = setTimeout(() => setChip(false), CHIP_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  // the bag counts up after the burst has landed
  useEffect(() => {
    if (REDUCED) return;
    const t0 = performance.now() + 500;
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - t0) / COUNT_MS));
      setCount(Math.round(from + (burst.total - from) * k));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, burst.total]);
  return (
    <div className="coin-burst" data-amount={burst.amount} data-total={burst.total} role="status" aria-label={`Ganaste ${burst.amount} semillas. Tenés ${burst.total}.`}>
      {big && (
        <div className="coin-big" aria-hidden="true">
          {SPARKS.map((deg) => (
            <span key={deg} className="coin-spark" style={{ ['--deg' as string]: `${deg}deg` }}><SeedIcon size={34} /></span>
          ))}
          <span className="coin-plus"><SeedIcon size={64} /><b>+{burst.amount}</b></span>
        </div>
      )}
      {chip && (
        <div className="coin-chip" aria-hidden="true" data-count={count}>
          <span className="coin-bag"><PouchArt /></span>
          <b className="coin-count">{count}</b>
        </div>
      )}
    </div>
  );
}
