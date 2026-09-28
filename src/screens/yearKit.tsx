// Pieces the screens of 1ro's year share: the seed pouch (every solved level
// earns a seed; T4 plants them in a garden) and the seed that flies into it;
// the gold seal of a save-blocks challenge and the note with the child's own
// long plan that the challenge shows.

import { useEffect, useRef, useState } from 'react';
import type { Sheet } from '../curriculum/model';
import { useProgress } from '../curriculum/progress';
import { REDUCED } from '../ui/runtime';
import { PouchArt } from '../ui/forestArt';
import { SealArt, SeedIcon } from '../ui/art';
import { Arrow, DIR_FILL } from '../blocks/blocks';
import type { Dir, Program } from '../game/model';
import { createRoot } from 'react-dom/client';

/** How long a won seed takes to fly into the pouch; the count changes when it lands. */
export const LAND_MS = 900;

/** Sheets whose own line was already said in this visit (it is said once, before its first page's). */
const introduced = new Set<number>();
/** A page's spoken line, after its sheet's own line the first time one of the sheet's pages opens in this visit. */
export function withSheetLine(sheet: Pick<Sheet, 'n' | 'say'>, line: string): string {
  if (introduced.has(sheet.n)) return line;
  introduced.add(sheet.n);
  return `${sheet.say} ${line}`;
}

/** Goes to another page without a history entry (a page that is not there). */
export function Redirect({ to }: { to: string }) {
  useEffect(() => { location.replace(to); }, [to]);
  return null;
}

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

// ------------------------------------------------------------------ the gold seal (save blocks)

/**
 * In the controls, next to the next-page button: the gold seal of a page with
 * a save-blocks challenge. On the page, once solved, it is a link to the
 * challenge (pale while the gold is still to win, shiny once won); on the
 * challenge itself it waits in dotted gold and is stamped when it is won.
 */
export function GoldSeal({ id, href, fresh, trying }: { id: string; href?: string; fresh?: boolean; trying?: boolean }) {
  const earned = !!useProgress().gold[id];
  const cls = `gold-seal${earned ? ' is-earned' : ''}${fresh ? ' is-fresh' : ''}${trying ? ' is-trying' : ''}`;
  const art = <SealArt earned={earned} />;
  if (!href) return <span className={cls} role="img" aria-label={earned ? 'Sello dorado ganado' : 'Sello dorado'} data-gold={id}>{art}</span>;
  return <a className={cls} href={href} aria-label={earned ? 'Sello dorado ganado: probar otra vez con menos renglones' : 'Sello dorado: con menos renglones'} data-gold={id}>{art}</a>;
}

/** The winning plans of pages with a gold challenge, in this visit (the challenge shows the child's own plan). */
const plans = new Map<string, Program>();
export const rememberPlan = (id: string, program: Program) => { plans.set(id, structuredClone(program)); };
export const recallPlan = (id: string): Program | null => plans.get(id) ?? null;

/**
 * The child's long plan on a sticky note taped at the bottom of the gold
 * challenge's notebook: small arrow cards in rows of four, so the pattern
 * shows (→ ↑ → ↑ …). No words.
 */
export function PlanNote({ plan }: { plan: Program }) {
  const arrows = plan.flatMap((it) => (it.t === 'cmd' ? [it.cmd] : Array.from({ length: typeof it.count === 'number' ? it.count : 1 }, () => it.body).flat()))
    .filter((c): c is Dir => c in DIR_FILL);
  if (!arrows.length) return null;
  return (
    <div className="plan-note" role="img" aria-label="Tu camino largo">
      <span className="plan-tape" aria-hidden="true" />
      <span className="plan-cards">
        {arrows.map((d, i) => (
          <span key={i} className="plan-card" style={{ background: DIR_FILL[d] }}><Arrow dir={d} size={17} width={5.4} seed={i + 2} /></span>
        ))}
      </span>
    </div>
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
