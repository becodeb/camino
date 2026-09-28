// The comodín (sheet 16): the class chooses between playing and catching
// up. Three big drawn choices stand on the riverbank: a wooden footbridge
// ("recuperar": the essential pages still pending on the sheets the teacher
// opened, as a path across the bridge; with nothing pending, one review page
// behind an easy door), the xylophone (sheet 9's free song) and the class
// corkboard on its easel (the classmates' levels). Each is played as a
// normal page; the first one played from here counts as the sheet done, and
// its choice gets the stamp. Nothing is blocked in dev mode, and then the
// bridge takes every sheet's pending pages.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { extraFor } from '../curriculum/generate';
import { goalId, type HubGoal, type Sheet } from '../curriculum/model';
import { sheetByN } from '../curriculum/primer';
import { progress, reachGoal, sheetState, solve, useProgress } from '../curriculum/progress';
import { FREE_SONG, MAP_HREF, nextHref, pendingEssentials, reviewPage, sheetHref, type SheetPage } from '../curriculum/route';
import type { LevelDef } from '../game/levels';
import { useDev } from '../ui/devMode';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { NextPageArt, PenRing, Portrait, Stamp, ThenArrow } from '../ui/art';
import { PencilSky, River, Reeds, RiverScenery, LilyPad, Sprout, INK } from '../ui/forestArt';
import { BridgeChoice, BridgeIcon, CorkChoice, KiteIcon, PendingPage, XyloChoice, XyloIcon } from '../ui/hubArt';
import { CorkIcon } from '../ui/workshopArt';
import { drawPortrait } from '../ui/board/BoardView';
import { PageThumb } from '../ui/thumbs';
import { blob, wobblyPoly } from '../ink/ink.js';
import { BROTE, Bar } from './LevelBar';
import { LevelScreen } from './LevelScreen';
import { LevelNavContext, Quit, useGhost, type LevelNav } from './levelKit';
import type { PagesOf } from './CorkboardScreen';
import { Redirect, SeedPouch, flySeed, withSheetLine } from './yearKit';

const LINES = {
  hub: 'Tocá el puente para terminar lo que te quedó, el xilofón para tocar tu canción, o la cartelera para jugar los niveles de tus compañeros.',
  bridge: 'Estas son las páginas que te quedaron. Tocá una para terminarla.',
  review: 'No te quedó nada pendiente. Acá tenés una página para repasar.',
};

// ------------------------------------------------------------------ the bar

/** The comodín's pages in the bar: its three choices after its kite; a choice played from it is stamped. */
export function HubPages({ sheet, current }: { sheet: Sheet; current: SheetPage }) {
  const st = sheetState(sheet, useProgress());
  const items: { kind: SheetPage['kind']; on: SheetPage['kind'][]; goal?: HubGoal; icon: ReactNode; label: string }[] = [
    { kind: 'comodin', on: ['comodin'], icon: <KiteIcon size={36} />, label: 'Las tres opciones' },
    { kind: 'recuperar', on: ['recuperar', 'pendiente', 'repaso'], goal: 'recuperar', icon: <BridgeIcon size={44} />, label: 'Recuperar' },
    { kind: 'musica', on: ['musica'], goal: 'musica', icon: <XyloIcon size={42} />, label: 'Música libre' },
    { kind: 'cartelera', on: ['cartelera', 'tarjeta'], goal: 'companeros', icon: <CorkIcon size={40} />, label: 'Niveles de compañeros' },
  ];
  return (
    <nav className="sheet-pages work-pages hub-pages" aria-label="Opciones del comodín">
      {items.map((it, i) => {
        const here = it.on.includes(current.kind), done = !!it.goal && st.goals.includes(it.goal);
        return (
          <a key={it.kind} className={`bar-work${here ? ' is-here' : ''}${i === 0 ? ' is-kite' : ''}`} href={sheetHref(sheet.n, { kind: it.kind } as SheetPage)} aria-label={`${it.label}${done ? ', hecho' : ''}`} data-work={it.kind}>
            {it.icon}
            {done && <Stamp seed={sheet.n + i} />}
            {here && <PenRing seed={sheet.n + i + 3} />}
          </a>
        );
      })}
    </nav>
  );
}

export const hubPages: PagesOf = (sheet, current) => <HubPages sheet={sheet} current={current} />;

/** "Choose", drawn: Brote, then the comodín's kite. */
function HubTask() {
  return (
    <span className="drawn-task" aria-hidden="true">
      <Portrait def={BROTE} className="bar-face" />
      <ThenArrow />
      <KiteIcon size={40} />
    </span>
  );
}

/** Speaks a page's line when it opens (the sheet's own before it, the first time). */
function useLine(sheet: Sheet, line: string) {
  useEffect(() => {
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(withSheetLine(sheet, line)); }, 450);
    return () => { clearTimeout(t); off(); stopSpeaking(); };
    // once per page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ------------------------------------------------------------------ the three choices

const GROUND = 468;

export function HubPage({ sheet }: { sheet: Sheet }) {
  const p = useProgress();
  const dev = useDev();
  const rootRef = useRef<HTMLElement>(null);
  const ghost = useGhost(rootRef);
  const pending = pendingEssentials(p, dev.on).length;
  const st = sheetState(sheet, p);
  useLine(sheet, LINES.hub);
  const choices: { goal: HubGoal; kind: SheetPage['kind']; x: number; s: number; art: ReactNode; label: string }[] = [
    { goal: 'recuperar', kind: 'recuperar', x: 250, s: 1.12, art: <BridgeChoice pending={pending} />, label: pending ? `Recuperar: ${pending} páginas pendientes` : 'Recuperar: una página de repaso' },
    { goal: 'musica', kind: 'musica', x: 615, s: 1.08, art: <XyloChoice />, label: 'Música libre' },
    { goal: 'companeros', kind: 'cartelera', x: 960, s: 1.12, art: <CorkChoice />, label: 'Niveles de compañeros' },
  ];
  const help = () => { ghost([{ do: 'point', at: pending ? ['[data-choice="recuperar"]'] : ['[data-choice="recuperar"]', '[data-choice="musica"]', '[data-choice="companeros"]'] }]); };
  return (
    <main ref={rootRef} className="level mode-doors mode-hub" data-sheet={sheet.n}>
      <Bar
        instruction={<HubTask />}
        title={<><b>Hoja {sheet.n} · comodín</b> Recuperar lo pendiente, música libre o niveles de compañeros</>}
        pages={<HubPages sheet={sheet} current={{ kind: 'comodin' }} />}
        aside={<SeedPouch />}
        onSpeak={() => speak(LINES.hub)}
        onHelp={help}
      />
      <section className="doors-stage" aria-label="Tres opciones">
        <div className="sheet doors-sheet">
          <span className="tape tape-l" aria-hidden="true" />
          <span className="tape tape-r" aria-hidden="true" />
          <svg className="doors-svg" viewBox="0 0 1200 600" role="group" aria-label="Tres opciones">
            <RiverScenery ground={GROUND} />
            {choices.map((c) => (
              <g key={c.goal} transform={`translate(${c.x} ${GROUND})`}>
                <a className="door-btn hub-choice" href={sheetHref(sheet.n, { kind: c.kind } as SheetPage)} aria-label={c.label} data-choice={c.goal}>
                  <g className="door-in">
                    {/* the whole drawing takes the tap, its gaps too (between the bridge's posts, over the xylophone's bars) */}
                    <rect x={-170} y={-280} width={340} height={330} fill="transparent" />
                    <g transform={`scale(${c.s})`}>{c.art}</g>
                    {st.goals.includes(c.goal) && <Stamp seed={c.x} x={128} y={-48} size={88} />}
                  </g>
                </a>
              </g>
            ))}
          </svg>
        </div>
        <a className={`next-page cut doors-next${st.complete ? '' : ' is-quiet'}`} href={MAP_HREF} aria-label="Volver al mapa"><NextPageArt /></a>
      </section>
      <Quit href={MAP_HREF} />
    </main>
  );
}

// ------------------------------------------------------------------ the bridge of "recuperar"

/** Brote, drawn into the scene (a nested svg). */
function SceneBrote({ x, y, w = 110 }: { x: number; y: number; w?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => { if (ref.current) drawPortrait(BROTE, ref.current, { x: 0.4, y: 0.1 }); }, []);
  return (
    <g className="map-brote" transform={`translate(${x} ${y})`}>
      <ellipse cx={0} cy={0} rx={34} ry={7} fill="url(#hatch)" />
      <g className="bob"><svg ref={ref} x={-w / 2} y={-w * (100 / 104)} width={w} height={w} viewBox="-52 -100 104 104" overflow="visible" aria-hidden="true" /></g>
    </g>
  );
}

/** Where the deck of the long bridge is at x (a gentle arch from bank to bank). */
const deckY = (x: number) => 486 - 50 * Math.sin(Math.PI * Math.min(1, Math.max(0, (x - 150) / 900)));

/** The river across the page and the long footbridge over it, from Brote's bank to the far one. */
function BridgeScene() {
  const top: [number, number][] = Array.from({ length: 19 }, (_, i) => { const x = 150 + i * 50; return [x, deckY(x) - 4]; });
  const deck = `M${top.map(([x, y]) => `${x},${y.toFixed(1)}`).join(' L')} L1050,${deckY(1050) + 16} ${[...top].reverse().map(([x, y]) => `L${x},${(y + 20).toFixed(1)}`).join(' ')} Z`;
  return (
    <g className="bridge-scene">
      <clipPath id="bridge-clip"><rect x={0} y={0} width={1200} height={600} /></clipPath>
      <PencilSky />
      <path d="M0,300 L1200,300 L1200,600 L0,600 Z" fill="#f3e8cf" />
      <g clipPath="url(#bridge-clip)"><River w={1200} top={380} bottom={560} seed={9} /></g>
      {[[330, 520, 16], [760, 540, 14], [1110, 508, 13]].map(([x, y, r], i) => <LilyPad key={i} x={x} y={y} r={r} seed={i + 5} />)}
      {[[40, 372], [1150, 368], [620, 376]].map(([x, y], i) => <Reeds key={i} x={x} y={y} seed={i + 31} />)}
      {/* the banks at both ends */}
      <path d={blob(60, 520, 130, 60, { seed: 4, n: 10 })} fill="#f3e8cf" stroke={INK} strokeWidth={2.6} />
      <path d={blob(1150, 520, 120, 60, { seed: 7, n: 10 })} fill="#f3e8cf" stroke={INK} strokeWidth={2.6} />
      {/* the railing's posts and rail, then the deck */}
      {Array.from({ length: 10 }, (_, i) => { const x = 170 + i * 96; return <path key={i} d={`M${x},${deckY(x)} L${x},${deckY(x) - 58}`} stroke={INK} strokeWidth={8} />; })}
      {Array.from({ length: 10 }, (_, i) => { const x = 170 + i * 96; return <path key={`w${i}`} d={`M${x},${deckY(x)} L${x},${deckY(x) - 58}`} stroke="#c9955f" strokeWidth={4} />; })}
      <path d={`M${top.map(([x, y]) => `${x},${(y - 56).toFixed(1)}`).join(' L')}`} fill="none" stroke={INK} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${top.map(([x, y]) => `${x},${(y - 56).toFixed(1)}`).join(' L')}`} fill="none" stroke="#c9955f" strokeWidth={5.4} strokeLinecap="round" strokeLinejoin="round" />
      <path d={deck} transform="translate(3 6)" fill="rgba(84, 62, 38, 0.2)" />
      <path d={deck} fill="#c9955f" stroke={INK} strokeWidth={2.8} strokeLinejoin="round" />
      <path d={`M${top.map(([x, y]) => `${x},${(y + 12).toFixed(1)}`).join(' L')}`} fill="none" stroke="#a57c55" strokeWidth={8} />
      {Array.from({ length: 30 }, (_, i) => { const x = 165 + i * 30; return <path key={`p${i}`} d={`M${x},${deckY(x) - 3} L${x + 1},${deckY(x) + 15}`} stroke={INK} strokeWidth={1.4} opacity={0.45} />; })}
      {/* the far bank: a pot with its sprout, where the path leads */}
      <g transform="translate(1135 478)" stroke={INK} strokeLinejoin="round" strokeLinecap="round">
        <ellipse cx={3} cy={4} rx={30} ry={6} fill="url(#hatch)" stroke="none" />
        <path d={wobblyPoly([[-22, -34], [22, -34], [16, 0], [-16, 0]], { wob: 0.8, bow: 1, seed: 3 })} fill="#d98a5f" strokeWidth={2.6} />
        <path d={wobblyPoly([[-27, -44], [27, -44], [26, -32], [-26, -32]], { wob: 0.6, bow: 0.8, seed: 4 })} fill="#de8a56" strokeWidth={2.6} />
        <g transform="translate(0 -44)"><Sprout size="hard" /></g>
      </g>
    </g>
  );
}

/** A page waiting on the bridge: its board, small, on a page with the red bookmark and its sheet's number. */
function BridgeCard({ level, n, seed, review }: { level: LevelDef; n: number; seed: number; review?: boolean }) {
  const d = wobblyPoly([[-70, -176], [48, -176], [70, -154], [70, 0], [-70, 0]], { wob: 1, bow: 1.4, seed });
  return (
    <g className="door-in" strokeLinejoin="round" strokeLinecap="round">
      <path d={d} transform="translate(5 7)" fill="rgba(84, 62, 38, 0.2)" />
      <path d={d} fill="#fbf7ee" stroke={INK} strokeWidth={2.8} />
      <path d="M48,-176 L48,-154 L70,-154" fill="none" stroke={INK} strokeWidth={2.4} />
      <PageThumb level={level} place={{ x: -58, y: -150, width: 116, height: 104 }} />
      {review
        ? <g transform="translate(-44 -178) rotate(-10)"><PendingStar /></g>
        : <path d="M-54,-180 L-40,-180 L-40,-150 L-47,-157 L-54,-150 Z" fill="#c9574a" stroke={INK} strokeWidth={1.8} />}
      <g transform="translate(0 -22)">
        <path d={blob(0, 0, 22, 15, { seed: seed + 4, n: 9 })} fill="#ddd4c3" stroke={INK} strokeWidth={2.2} />
        <text x={0} y={7} textAnchor="middle" className="bridge-no">{n}</text>
      </g>
      {review && <g transform="translate(48 -14)"><Sprout size="easy" /></g>}
    </g>
  );
}

/** The review page's gold star. */
function PendingStar() {
  const pts: [number, number][] = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 8 : 17;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  return <path d={wobblyPoly(pts, { wob: 0.5, bow: 0.4, seed: 8 })} fill="#f0d27a" stroke={INK} strokeWidth={2.4} />;
}

/** The level of a page the comodín plays from another sheet: a pending core page, a review extra, the free song. */
function levelFor(page: SheetPage): LevelDef | null {
  if (page.kind === 'musica') return sheetByN(FREE_SONG.n)?.core[FREE_SONG.k - 1]?.level ?? null;
  if (page.kind === 'pendiente') return sheetByN(page.n)?.core[page.k - 1]?.level ?? null;
  if (page.kind === 'repaso') {
    const s = sheetByN(page.n);
    return s?.extras ? extraFor(s, 'easy', page.i)?.level ?? null : null;
  }
  return null;
}

export function BridgePage({ sheet }: { sheet: Sheet }) {
  const p = useProgress();
  const dev = useDev();
  const rootRef = useRef<HTMLElement>(null);
  const ghost = useGhost(rootRef);
  const pending = pendingEssentials(p, dev.on);
  // nothing pending: one review page, the sheet taken at random once per visit of the bridge
  const [review] = useState(() => (pending.length ? null : reviewPage(p, Math.random(), dev.on)));
  const shown = pending.slice(0, 5);
  const reviewLevel = useMemo(() => (review ? levelFor({ kind: 'repaso', n: review.n, i: review.i }) : null), [review]);
  useLine(sheet, pending.length ? LINES.bridge : LINES.review);
  const at = (i: number, total: number) => 600 + (i - (total - 1) / 2) * 176;
  const help = () => { ghost([{ do: 'point', at: ['.bridge-card'] }]); };
  return (
    <main ref={rootRef} className="level mode-doors mode-bridge" data-sheet={sheet.n} data-pending={pending.length}>
      <Bar
        instruction={<span className="drawn-task" aria-hidden="true"><Portrait def={BROTE} className="bar-face" /><ThenArrow /><BridgeIcon size={46} /></span>}
        title={<><b>Hoja {sheet.n} · recuperar</b> {pending.length ? `Páginas esenciales pendientes: ${pending.length}` : 'Nada pendiente: una página de repaso'}{dev.on ? ' (dev: de todas las hojas)' : ''}</>}
        pages={<HubPages sheet={sheet} current={{ kind: 'recuperar' }} />}
        aside={<SeedPouch />}
        onSpeak={() => speak(pending.length ? LINES.bridge : LINES.review)}
        onHelp={help}
      />
      <section className="doors-stage" aria-label="El puente">
        <div className="sheet doors-sheet">
          <span className="tape tape-l" aria-hidden="true" />
          <span className="tape tape-r" aria-hidden="true" />
          <svg className="doors-svg" viewBox="0 0 1200 600" role="group" aria-label="El puente de las páginas pendientes">
            <BridgeScene />
            <SceneBrote x={82} y={492} />
            {shown.map((x, i) => {
              const cx = at(i, shown.length), level = sheetByN(x.n)!.core[x.k - 1].level;
              return (
                <g key={`${x.n}-${x.k}`} transform={`translate(${cx} ${deckY(cx) - 6}) rotate(${i % 2 ? 2.5 : -2})`}>
                  <a className="door-btn bridge-card" href={sheetHref(sheet.n, { kind: 'pendiente', n: x.n, k: x.k })} aria-label={`Hoja ${x.n}, página ${x.k}: ${level.title}`} data-pending={`${x.n}-${x.k}`}>
                    <BridgeCard level={level} n={x.n} seed={x.n * 7 + x.k} />
                  </a>
                </g>
              );
            })}
            {pending.length > shown.length && (
              <g transform={`translate(${at(shown.length - 1, shown.length) + 104} ${deckY(990) - 8})`} aria-label={`y ${pending.length - shown.length} más`}>
                {[0, 1, 2].map((k) => <g key={k} transform={`translate(${k * 6} ${-k * 5}) rotate(${k * 4 - 4})`}><PendingPage seed={k + 30} s={1.1} /></g>)}
              </g>
            )}
            {review && reviewLevel && (
              <g transform={`translate(600 ${deckY(600) - 6})`}>
                <a className="door-btn bridge-card" href={sheetHref(sheet.n, { kind: 'repaso', n: review.n, i: review.i })} aria-label={`Una página de repaso de la hoja ${review.n}`} data-review={`${review.n}-${review.i}`}>
                  <BridgeCard level={reviewLevel} n={review.n} seed={review.n * 5 + review.i} review />
                </a>
              </g>
            )}
          </svg>
        </div>
        <a className="next-page cut doors-next is-quiet" href={sheetHref(sheet.n, { kind: 'comodin' })} aria-label="Volver a elegir"><NextPageArt /></a>
      </section>
      <Quit href={MAP_HREF} />
    </main>
  );
}

// ------------------------------------------------------------------ a page played from the comodín

/**
 * A page of another sheet played from the comodín (a pending essential page,
 * a review extra, the free song): the page itself (its first solve counts for
 * its own sheet, with its seed), the comodín's bar, and the choice's goal.
 */
export function HubLevel({ sheet, page }: { sheet: Sheet; page: SheetPage }) {
  const key = JSON.stringify(page);
  const level = useMemo(() => levelFor(page), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const goal: HubGoal = page.kind === 'musica' ? 'musica' : 'recuperar';
  const label = page.kind === 'musica' ? 'música libre' : page.kind === 'repaso' ? 'repaso' : 'recuperar';
  const from = page.kind === 'pendiente' || page.kind === 'repaso' ? page.n : FREE_SONG.n;
  const nav = useMemo<LevelNav>(() => ({
    pages: () => <HubPages sheet={sheet} current={page} />,
    title: (l) => <><b>Hoja {sheet.n} · {label}</b> Hoja {from}: {l.title}</>,
    won: (l) => {
      const before = progress.get().seeds;
      progress.update((x) => reachGoal(solve(x, l.id), goalId(sheet, goal)));
      if (progress.get().seeds > before) flySeed(document.querySelector('.level .sheet [data-guide="target"]'));
    },
    next: () => { location.hash = nextHref(sheet, page); },
    quit: MAP_HREF,
    say: (l) => withSheetLine(sheet, l.say),
    aside: <SeedPouch />,
  }), [key, sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!level) return <Redirect to={sheetHref(sheet.n, { kind: 'comodin' })} />;
  return (
    <LevelNavContext.Provider value={nav}>
      <LevelScreen key={level.id} level={level} />
    </LevelNavContext.Provider>
  );
}
