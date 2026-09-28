// The end-of-sheet preview card: when a sheet is finished (its core, a
// workshop, the comodín, the showcase), the first time its last page opens
// (the doors, the corkboard, the three choices, the poster), a card drops
// onto the page: the sheet just finished, stamped, a dotted path to the next
// stop, and the next sheet's first page peeking from under a folded flap with
// a question mark in pen; the sheet's preview line is said ("Mañana los
// caminos son más largos."). Wordless: the drawing and the voice leave it
// hanging, to come back to. A tap anywhere (or the page to turn) puts it
// away and the page says its own line. Shown once per sheet (kept in the
// progress); the dev drawer shows it again.

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Sheet } from '../curriculum/model';
import { PRIMER, sheetByN } from '../curriculum/primer';
import { markPreviewed, progress, sheetState } from '../curriculum/progress';
import { levelById } from '../game/levels';
import { REDUCED } from '../ui/runtime';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { NextPageArt, Stamp } from '../ui/art';
import { StopArt, type StopMark } from '../ui/forestArt';
import { LevelThumb, PageThumb } from '../ui/thumbs';
import { CorkIcon, MakeIcon } from '../ui/workshopArt';
import { BridgeIcon, KiteIcon, XyloIcon } from '../ui/hubArt';
import { penLoop, wobblyPoly } from '../ink/ink.js';

// ------------------------------------------------------------------ which card is up

interface Shown { n: number; after?: string }
let shown: Shown | null = null;
const subs = new Set<() => void>();
const set = (s: Shown | null) => { shown = s; subs.forEach((f) => f()); };

export const previewCard = {
  get: () => shown,
  /** Shows sheet `n`'s card; `after`: the page's own line, said when the card is put away. */
  show(n: number, after?: string) { set({ n, after }); },
  hide() { set(null); },
  subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; },
};

/**
 * On a sheet's last page: the first time the sheet is finished, its preview
 * card comes up (and is kept as shown). Returns whether it does now, so the
 * page leaves its own line for after the card.
 */
export function useEndOfSheet(sheet: Sheet, line: string): boolean {
  const due = useRef<boolean | null>(null);
  if (due.current === null) {
    const p = progress.get();
    due.current = !!sheet.preview && sheetState(sheet, p).complete && !p.previewed[String(sheet.n)];
  }
  useEffect(() => {
    if (!due.current) return;
    const t = setTimeout(() => {
      progress.update((p) => markPreviewed(p, sheet.n));
      previewCard.show(sheet.n, line);
    }, REDUCED ? 0 : 700);
    return () => clearTimeout(t);
    // once, when the page opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return due.current;
}

// ------------------------------------------------------------------ the card

const MARK: Partial<Record<Sheet['kind'], StopMark>> = { taller: 'pencil', recreo: 'note', comodin: 'kite', muestra: 'bunting' };
const INK = '#2b2622';
const PEN = '#3d6ea5';

/** A stop of the map, as the map draws it. */
function Stop({ sheet, x, y, s = 1, stamped }: { sheet: Sheet; x: number; y: number; s?: number; stamped?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <StopArt n={sheet.n} look={sheet.zone === 'rio' ? 'stone' : 'page'} soon={false} mark={MARK[sheet.kind] ?? 'none'} seed={sheet.n * 11} />
      {stamped && <Stamp seed={sheet.n + 2} x={30} y={36} size={60} />}
    </g>
  );
}

/** What the next sheet looks like: its first page, or its kind of class drawn; after the showcase, the next grade's fog. */
function NextDrawing({ next }: { next: Sheet | null }) {
  if (!next) {
    const fog = levelById('2do-1');
    return fog ? <LevelThumb level={fog} /> : null;
  }
  if (next.core.length) return <PageThumb level={next.core[0].level} />;
  if (next.workshop) return <span className="peek-icons"><MakeIcon size={150} /><CorkIcon size={112} /></span>;
  if (next.hub) return <span className="peek-icons"><KiteIcon size={84} /><BridgeIcon size={104} /><XyloIcon size={96} /><CorkIcon size={88} /></span>;
  return (
    <svg viewBox="-80 -96 160 150" className="peek-stop" aria-hidden="true">
      <StopArt n={next.n} look="stone" soon={false} mark="bunting" seed={next.n * 11} />
    </svg>
  );
}

function Card({ n, onClose }: { n: number; onClose: () => void }) {
  const sheet = sheetByN(n)!;
  const next = PRIMER.find((s) => s.n === n + 1) ?? null;
  useEffect(() => {
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(sheet.preview ?? ''); }, REDUCED ? 0 : 500);
    return () => { clearTimeout(t); off(); };
  }, [sheet]);
  const flap = wobblyPoly([[34, 0], [100, 0], [100, 66]], { wob: 0.6, bow: 0.8, seed: n });
  return (
    <div className="preview-veil" onClick={onClose} role="dialog" aria-label={`Lo que viene: ${sheet.preview ?? ''}`} data-preview={n}>
      <div className="preview-card sheet">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <svg className="preview-path" viewBox="0 0 300 300" aria-hidden="true">
          <path d="M70,210 C120,250 170,120 230,96" fill="none" stroke={PEN} strokeWidth={4} strokeDasharray="1 11" strokeLinecap="round" />
          <path d="M218,86 L233,95 L220,108" fill="none" stroke={PEN} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          <Stop sheet={sheet} x={70} y={210} s={0.9} stamped />
          {next
            ? <g><Stop sheet={next} x={236} y={92} s={1.05} /><path d={penLoop(236, 94, 66, 66, { seed: n + 3 })} fill="none" stroke={PEN} strokeWidth={3.4} strokeLinecap="round" /></g>
            : <text x={236} y={112} textAnchor="middle" className="preview-next">2°</text>}
        </svg>
        <div className="preview-peek">
          <div className="peek-page">
            <NextDrawing next={next} />
          </div>
          <svg className="peek-flap" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M34,0 L100,66 L100,0 Z" fill="rgba(84, 62, 38, 0.2)" transform="translate(-3 4)" />
            <path d={flap} fill="#fbf7ee" stroke={INK} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
          <span className="peek-q" aria-hidden="true">?</span>
        </div>
        <button type="button" className="next-page cut preview-close" aria-label="Seguir" onClick={(e) => { e.stopPropagation(); onClose(); }}><NextPageArt /></button>
      </div>
    </div>
  );
}

/** Where the card comes up, over any page (another page put it away: the adult's dev drawer can leave under it). */
export function PreviewHost() {
  const s = useSyncExternalStore(previewCard.subscribe, previewCard.get, previewCard.get);
  useEffect(() => {
    const away = () => previewCard.hide();
    window.addEventListener('hashchange', away);
    return () => window.removeEventListener('hashchange', away);
  }, []);
  if (!s) return null;
  const close = () => {
    stopSpeaking();
    previewCard.hide();
    if (s.after) speak(s.after);
  };
  return <Card key={s.n} n={s.n} onClose={close} />;
}
