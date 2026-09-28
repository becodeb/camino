// The showcase (sheet 17), the last stop of the year: the child shows the
// family what they learned. Four stations on the riverbank under bunting, a
// dotted path between them: the child picks two or three favourite pages
// (from the ones solved, their own workshop levels too; they hang on a
// clothesline), the family plays them while the child explains (the same
// page and three controls; Brote walks the board, the child's character
// cheers from the corner: a hop when ▶ is pressed, a wince at a bump, its own
// celebration at the win), the garden tour (ui/../GardenScreen in tour mode)
// and the poster of the year (the sheets stamped, gold stamps, the critters,
// the levels made; no grades, no numbers beyond small counts). The showcase
// is done once the family played a page.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { goalId, type Sheet } from '../curriculum/model';
import { CHARACTER_NAME } from '../curriculum/motivation';
import { PRIMER } from '../curriculum/primer';
import { MAX_FAVORITES, progress, reachGoal, sheetState, toggleFavorite, useProgress } from '../curriculum/progress';
import { arrivedCritters } from '../curriculum/rewards';
import { MAP_HREF, nextHref, sheetHref, type SheetPage } from '../curriculum/route';
import { MIN_FAVORITES, favoritePages, showPages, type ShowPage } from '../curriculum/showcase';
import { REDUCED } from '../ui/runtime';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { NextPageArt, PenRing, Stamp, ThenArrow } from '../ui/art';
import { RiverScenery, StopArt, type StopMark } from '../ui/forestArt';
import { PageThumb } from '../ui/thumbs';
import { PushPin, StarSticker } from '../ui/workshopArt';
import { cardLevel } from '../curriculum/workshop';
import { CritterArt } from '../ui/critterArt';
import { SeedPlant } from '../ui/gardenArt';
import { Rug } from '../ui/wardrobeArt';
import { drawPortrait } from '../ui/board/BoardView';
import type { StageView } from '../ui/board/StageView';
import { Bunting, BuntingIcon, ChairsIcon, Clothesline, FamilyChairs, GardenGate, GateIcon, PickIcon, PosterIcon, RolledPoster } from '../ui/showcaseArt';
import { Bar } from './LevelBar';
import { LevelScreen } from './LevelScreen';
import { LevelNavContext, Quit, useGhost, type LevelNav } from './levelKit';
import { BROTE_PLAYER, PlayerContext, PlayerFace, useStage, useYearPlayer, type Player } from './player';
import { useEndOfSheet } from './PreviewCard';
import { Redirect, SeedPouch, withSheetLine } from './yearKit';

const LINES = {
  muestra: 'Hoy le mostrás a tu familia todo lo que aprendiste. Primero elegí tus páginas, después juega tu familia, después el jardín y el afiche.',
  elegir: 'Elegí dos o tres páginas para mostrarle a tu familia. Tocá una para colgarla.',
  full: 'Ya elegiste tres. Tocá una para sacarla.',
  family: 'Ahora juega tu familia. Vos le explicás cómo.',
  familyWon: '¡Muy bien, familia!',
  poster: 'Este es tu año en primer grado.',
  pickFirst: 'Primero elegí tus páginas.',
};

// ------------------------------------------------------------------ the bar

type Station = 'elegir' | 'familia' | 'jardin' | 'afiche';
const STATION_PAGE: Record<Station, SheetPage> = { elegir: { kind: 'elegir' }, familia: { kind: 'familia', i: 1 }, jardin: { kind: 'recorrido' }, afiche: { kind: 'afiche' } };
const STATION_ICON: Record<Station, ReactNode> = { elegir: <PickIcon size={42} />, familia: <ChairsIcon size={40} />, jardin: <GateIcon size={40} />, afiche: <PosterIcon size={44} /> };
const STATION_LABEL: Record<Station, string> = { elegir: 'Elegir las páginas', familia: 'Tu familia juega', jardin: 'El jardín', afiche: 'El afiche del año' };
const stationOf = (page: SheetPage): Station | null =>
  (page.kind === 'elegir' ? 'elegir' : page.kind === 'familia' ? 'familia' : page.kind === 'recorrido' ? 'jardin' : page.kind === 'afiche' ? 'afiche' : null);

/** A station is done: two pages picked; the family played; the tour and the poster seen. */
function stationDone(s: Station, sheet: Sheet, p: ReturnType<typeof progress.get>): boolean {
  if (s === 'elegir') return favoritePages(p).length >= MIN_FAVORITES;
  return sheetState(sheet, p).goals.includes(s);
}

/** The showcase's pages in the bar: its bunting, then its four stations; done ones stamped. */
export function ShowcasePages({ sheet, current }: { sheet: Sheet; current: SheetPage }) {
  const p = useProgress();
  const here = stationOf(current);
  return (
    <nav className="sheet-pages work-pages hub-pages" aria-label="Pasos de la muestra">
      <a className={`bar-work is-kite${current.kind === 'muestra' ? ' is-here' : ''}`} href={sheetHref(sheet.n, { kind: 'muestra' })} aria-label="Los pasos de la muestra" data-work="muestra">
        <BuntingIcon size={38} />
        {current.kind === 'muestra' && <PenRing seed={sheet.n} />}
      </a>
      {(Object.keys(STATION_PAGE) as Station[]).map((s, i) => {
        const done = stationDone(s, sheet, p);
        return (
          <a key={s} className={`bar-work${here === s ? ' is-here' : ''}`} href={sheetHref(sheet.n, STATION_PAGE[s])} aria-label={`${STATION_LABEL[s]}${done ? ', hecho' : ''}`} data-work={s}>
            {STATION_ICON[s]}
            {done && <Stamp seed={sheet.n + i} />}
            {here === s && <PenRing seed={sheet.n + i + 3} />}
          </a>
        );
      })}
    </nav>
  );
}

/** Speaks a page's line when it opens (the sheet's own line first, the first time). */
function useLine(sheet: Sheet, line: string, skip = false) {
  useEffect(() => {
    if (skip) return;
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(withSheetLine(sheet, line)); }, 450);
    return () => { clearTimeout(t); off(); stopSpeaking(); };
    // once per page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ------------------------------------------------------------------ the four stations

const GROUND = 470;

export function MuestraPage({ sheet }: { sheet: Sheet }) {
  const p = useProgress();
  const rootRef = useRef<HTMLElement>(null);
  const ghost = useGhost(rootRef);
  const favs = favoritePages(p);
  useLine(sheet, LINES.muestra);
  const stations: { s: Station; x: number; art: ReactNode; stamp: [number, number] }[] = [
    { s: 'elegir', x: 170, art: <Clothesline pages={[0, 1, 2].map((i) => (favs[i] ? <PageThumb level={favs[i].level} place={{ x: 0, y: 0, width: 64, height: 64 }} /> : null))} />, stamp: [110, -220] },
    { s: 'familia', x: 450, art: <FamilyChairs page={favs[0] ? <PageThumb level={favs[0].level} place={{ x: 0, y: 0, width: 72, height: 64 }} /> : undefined} />, stamp: [88, -200] },
    { s: 'jardin', x: 740, art: <GardenGate />, stamp: [110, -150] },
    { s: 'afiche', x: 1030, art: <RolledPoster />, stamp: [78, -190] },
  ];
  const next = stations.find((x) => !stationDone(x.s, sheet, p));
  const help = () => { ghost([{ do: 'point', at: [`[data-station="${next?.s ?? 'afiche'}"]`] }]); };
  return (
    <main ref={rootRef} className="level mode-doors mode-showcase" data-sheet={sheet.n}>
      <Bar
        instruction={<span className="drawn-task" aria-hidden="true"><PlayerFace className="bar-face" /><ThenArrow /><BuntingIcon size={42} /></span>}
        title={<><b>Hoja {sheet.n} · muestra</b> Las páginas elegidas, la familia juega, el jardín y el afiche del año</>}
        pages={<ShowcasePages sheet={sheet} current={{ kind: 'muestra' }} />}
        aside={<SeedPouch />}
        onSpeak={() => speak(LINES.muestra)}
        onHelp={help}
      />
      <section className="doors-stage" aria-label="La muestra">
        <div className="sheet doors-sheet">
          <span className="tape tape-l" aria-hidden="true" />
          <span className="tape tape-r" aria-hidden="true" />
          <svg className="doors-svg" viewBox="0 0 1200 600" role="group" aria-label="Los pasos de la muestra">
            <RiverScenery ground={GROUND} />
            <Bunting x0={20} y0={150} x1={1180} y1={150} sag={34} n={16} seed={2} />
            <path d="M170,520 C300,560 330,500 450,528 S640,560 740,524 S930,556 1030,524" fill="none" stroke="#3d6ea5" strokeWidth={4} strokeDasharray="1 12" strokeLinecap="round" />
            {stations.map((st) => (
              <g key={st.s} transform={`translate(${st.x} ${GROUND + 20})`}>
                <a className="door-btn hub-choice" href={sheetHref(sheet.n, STATION_PAGE[st.s])} aria-label={STATION_LABEL[st.s]} data-station={st.s}>
                  <g className="door-in">
                    <rect x={-150} y={-250} width={300} height={280} fill="transparent" />
                    {st.art}
                    {stationDone(st.s, sheet, p) && <Stamp seed={st.x} x={st.stamp[0]} y={st.stamp[1]} size={80} />}
                  </g>
                </a>
              </g>
            ))}
          </svg>
        </div>
        <a className={`next-page cut doors-next${sheetState(sheet, p).complete ? '' : ' is-quiet'}`} href={MAP_HREF} aria-label="Volver al mapa"><NextPageArt /></a>
      </section>
      <Quit href={MAP_HREF} />
    </main>
  );
}

// ------------------------------------------------------------------ station 1: the child picks the pages

/** A stop of the map, small (the sheet a group of pages comes from). */
function MiniStop({ n, zone, kind }: { n: number; zone: Sheet['zone']; kind: Sheet['kind'] }) {
  const mark: StopMark = kind === 'taller' ? 'pencil' : kind === 'recreo' ? 'note' : 'none';
  return (
    <svg className="pick-stop" viewBox="-48 -52 96 100" aria-hidden="true">
      <StopArt n={n} look={zone === 'rio' ? 'stone' : 'page'} soon={false} mark={mark} seed={n * 11} />
    </svg>
  );
}

export function ElegirPage({ sheet }: { sheet: Sheet }) {
  const p = useProgress();
  const rootRef = useRef<HTMLElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const ghost = useGhost(rootRef);
  const pages = useMemo(() => showPages(p), [p]);
  const favs = favoritePages(p);
  useLine(sheet, LINES.elegir);
  const groups = useMemo(() => {
    const out: { n: number; pages: ShowPage[] }[] = [];
    for (const pg of pages) {
      const key = pg.kind === 'made' ? 0 : pg.sheet;
      const g = out.find((x) => x.n === key);
      if (g) g.pages.push(pg); else out.push({ n: key, pages: [pg] });
    }
    return out.sort((a, b) => (a.n === 0 ? 1 : b.n === 0 ? -1 : a.n - b.n));
  }, [pages]);
  const pick = (id: string) => {
    const before = progress.get();
    const after = progress.update((q) => toggleFavorite(q, id));
    if (after === before) {
      speak(LINES.full);
      if (!REDUCED) trayRef.current?.animate([{ translate: '0 0' }, { translate: '6px 0' }, { translate: '-6px 0' }, { translate: '0 0' }], { duration: 380 });
    }
  };
  const help = () => { ghost([{ do: 'point', at: favs.length >= MIN_FAVORITES ? ['.pick-next'] : ['.pick-card:not(.is-picked)'] }]); };
  const ready = favs.length >= MIN_FAVORITES;
  return (
    <main ref={rootRef} className="level mode-pick" data-sheet={sheet.n} data-picked={favs.length}>
      <Bar
        instruction={<span className="drawn-task" aria-hidden="true"><PlayerFace className="bar-face" /><ThenArrow /><PickIcon size={46} /></span>}
        title={<><b>Hoja {sheet.n} · elegir</b> Dos o tres páginas resueltas (o niveles hechos en esta compu) para mostrar</>}
        pages={<ShowcasePages sheet={sheet} current={{ kind: 'elegir' }} />}
        aside={<SeedPouch />}
        onSpeak={() => speak(LINES.elegir)}
        onHelp={help}
      />
      <section className="pick-stage" aria-label="Tus páginas">
        <div className="pick-album">
          {groups.length ? groups.map((g) => (
            <div key={g.n} className="pick-group">
              {g.n ? <MiniStop n={g.n} zone={PRIMER[g.n - 1].zone} kind={PRIMER[g.n - 1].kind} /> : <span className="pick-mine"><StarSticker /></span>}
              <ul className="pick-cards">
                {g.pages.map((pg) => {
                  const on = p.favorites.includes(pg.id);
                  return (
                    <li key={pg.id}>
                      <button type="button" className={`pick-card cut${on ? ' is-picked' : ''}${pg.kind === 'boss' ? ' is-boss' : ''}`} data-pick={pg.id} aria-pressed={on} aria-label={`${pg.level.title}${on ? ', elegida' : ''}`} onClick={() => pick(pg.id)}>
                        <PageThumb level={pg.level} />
                        {pg.kind === 'boss' && <span className="pick-boss" aria-hidden="true" />}
                        {on && <PenRing seed={pg.id.length} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )) : <p className="pick-none">Todavía no hay páginas resueltas para mostrar.</p>}
        </div>
        <div ref={trayRef} className="pick-tray" aria-label="Las páginas elegidas">
          <svg viewBox="-160 -210 320 230" className="pick-line" aria-hidden="true">
            <Clothesline pages={[0, 1, 2].map((i) => (favs[i] ? <PageThumb level={favs[i].level} place={{ x: 0, y: 0, width: 64, height: 64 }} /> : null))} />
          </svg>
          {ready
            ? <a className="next-page cut pick-next" href={sheetHref(sheet.n, { kind: 'familia', i: 1 })} aria-label="Que juegue tu familia"><NextPageArt /></a>
            : <span className="pick-wait" aria-hidden="true">{favs.length}/{MAX_FAVORITES}</span>}
        </div>
      </section>
      <Quit href={MAP_HREF} />
    </main>
  );
}

// ------------------------------------------------------------------ station 2: the family plays, the child's character cheers

/** The child's character in the corner of the family's page: it cheers the family on. */
function Cheer({ player, onView }: { player: Player; onView: (v: StageView | null) => void }) {
  const { ref, view } = useStage(player, { x: -60, y: -124, w: 120, h: 132 });
  useEffect(() => { onView(view.current); return () => onView(null); });
  return (
    <span className="cheer" data-cheer={player.def.id} aria-label={`${CHARACTER_NAME[player.def.id]} alienta a tu familia`}>
      <svg ref={ref} className="cheer-stage" aria-hidden="true" />
    </span>
  );
}

export function FamiliaPage({ sheet, i }: { sheet: Sheet; i: number }) {
  const favs = favoritePages(progress.get());
  const fav = favs[i - 1] ?? null;
  const me = useYearPlayer();
  const cheer = useRef<StageView | null>(null);
  const [cheering, setCheering] = useState(0);
  const nav = useMemo<LevelNav | null>(() => (fav ? {
    pages: () => <ShowcasePages sheet={sheet} current={{ kind: 'familia', i }} />,
    title: (l) => <><b>Hoja {sheet.n} · la familia juega · {i} de {favs.length}</b> {l.title}</>,
    won: () => {
      progress.update((x) => reachGoal(x, goalId(sheet, 'familia')));
      return LINES.familyWon;
    },
    reward: () => <Cheer player={me} onView={(v) => { cheer.current = v; }} />,
    onRun: () => { void cheer.current?.root(); },
    onResult: (r) => {
      if (r === 'win') { setCheering((n) => n + 1); void cheer.current?.cheer(); } else void cheer.current?.wince();
    },
    next: () => { location.hash = nextHref(sheet, { kind: 'familia', i }, favs.length); },
    quit: MAP_HREF,
    say: (l) => withSheetLine(sheet, `${LINES.family} ${l.say}`),
    className: 'is-family',
    aside: <SeedPouch />,
  } : null), [fav?.id, i]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!fav || !nav) return <Redirect to={sheetHref(sheet.n, { kind: favs.length < MIN_FAVORITES ? 'elegir' : 'muestra' })} />;
  return (
    <PlayerContext.Provider value={BROTE_PLAYER}>
      <LevelNavContext.Provider value={nav}>
        <span className="family-cheers" data-cheered={cheering} hidden />
        <LevelScreen key={fav.level.id} level={fav.level} />
      </LevelNavContext.Provider>
    </PlayerContext.Provider>
  );
}

// ------------------------------------------------------------------ station 4: the poster of the year

/** The child's character on the poster (a still portrait, dressed). */
function PosterPlayer({ player, x, y, w }: { player: Player; x: number; y: number; w: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => { if (ref.current) drawPortrait(player.def, ref.current, { x: 0.2, y: 0.25 }, 'grin', player.outfit); }, [player]);
  return <svg ref={ref} x={x - w / 2} y={y - w} width={w} height={w} viewBox="-52 -100 104 104" overflow="visible" aria-hidden="true" data-player={player.def.id} />;
}

const MARK: Partial<Record<Sheet['kind'], StopMark>> = { taller: 'pencil', recreo: 'note', comodin: 'kite', muestra: 'bunting' };

export function AfichePage({ sheet }: { sheet: Sheet }) {
  const p = useProgress();
  const me = useYearPlayer();
  const rootRef = useRef<HTMLElement>(null);
  const ghost = useGhost(rootRef);
  const preview = useEndOfSheet(sheet, LINES.poster);
  useLine(sheet, LINES.poster, preview);
  useEffect(() => { progress.update((x) => reachGoal(x, goalId(sheet, 'afiche'))); }, [sheet]);
  const critters = arrivedCritters(p);
  const mine = p.made.slice(-3).reverse();
  const flowers = Math.min(24, Math.ceil(p.seeds / 4));
  const help = () => { ghost([{ do: 'point', at: ['.poster-sheet'] }]); };
  return (
    <main ref={rootRef} className="level mode-doors mode-poster" data-sheet={sheet.n}>
      <Bar
        instruction={<span className="drawn-task" aria-hidden="true"><PlayerFace className="bar-face" /><ThenArrow /><PosterIcon size={46} /></span>}
        title={<><b>Hoja {sheet.n} · afiche</b> El año de 1er grado: hojas terminadas, sellos dorados, bichos y niveles hechos</>}
        pages={<ShowcasePages sheet={sheet} current={{ kind: 'afiche' }} />}
        aside={<SeedPouch />}
        onSpeak={() => speak(LINES.poster)}
        onHelp={help}
      />
      <section className="doors-stage" aria-label="El afiche del año">
        <div className="sheet doors-sheet poster-sheet">
          <span className="tape tape-l" aria-hidden="true" />
          <span className="tape tape-r" aria-hidden="true" />
          <svg className="doors-svg" viewBox="0 0 1200 600" role="img" aria-label="El afiche del año">
            <Bunting x0={20} y0={14} x1={1180} y1={14} sag={18} n={18} seed={5} />
            {/* digits in the readers' face: in the hand font a 1 reads as a 7 */}
            <text x={600} y={104} textAnchor="middle" className="poster-title">Mi año en <tspan className="poster-digit">1</tspan>er grado</text>
            {/* the child, dressed, on the rug */}
            <g transform="translate(190 440) scale(1.8)"><Rug /></g>
            <PosterPlayer player={me} x={190} y={440} w={250} />
            {/* the year's stops as the map walks them, stamped as it stamps them; a gold star where pages were stamped in gold */}
            <path d={`M${PRIMER.map((s) => posterStop(s.n).join(',')).join(' L')}`} fill="none" stroke="#3d6ea5" strokeWidth={3.4} strokeDasharray="1 10" strokeLinecap="round" />
            {PRIMER.map((s) => {
              const [x, y] = posterStop(s.n), st = sheetState(s, p);
              return (
                <g key={s.n} transform={`translate(${x} ${y}) scale(0.72)`} data-poster-stop={s.n} data-done={st.complete || undefined}>
                  <StopArt n={s.n} look={s.zone === 'rio' ? 'stone' : 'page'} soon={false} mark={MARK[s.kind] ?? 'none'} seed={s.n * 11} />
                  {st.complete && <Stamp seed={s.n + 2} x={32} y={34} size={64} />}
                  {st.gold > 0 && <path transform="translate(-42 -44) scale(1.5)" d={STAR} fill="#f0d27a" stroke="#b3822a" strokeWidth={1.4} strokeLinejoin="round" />}
                </g>
              );
            })}
            {/* the levels made here, pinned in the corner */}
            {mine.map((m, k) => {
              const ws = PRIMER.find((x) => x.n === m.sheet)!;
              return (
                <g key={m.id} transform={`translate(${1000 + k * 64} ${118 + (k % 2) * 8}) rotate(${(k - 1) * 5})`} data-poster-made={m.id}>
                  <path d="M-30,-28 L30,-29 L31,28 L-29,29 Z" transform="translate(3 4)" fill="rgba(84, 62, 38, 0.2)" />
                  <path d="M-30,-28 L30,-29 L31,28 L-29,29 Z" fill="#fbf7ee" stroke="#2b2622" strokeWidth={2.2} strokeLinejoin="round" />
                  <PageThumb level={cardLevel(m, ws)} place={{ x: -25, y: -22, width: 50, height: 44 }} />
                  <g transform="translate(-9 -40)"><PushPin size={18} seed={k + 1} /></g>
                </g>
              );
            })}
            {/* the garden's flowers along the bottom, the critters that came to live in it */}
            <path d="M20,556 Q600,536 1180,556 L1180,598 L20,598 Z" fill="#eef0da" />
            {Array.from({ length: flowers }, (_, k) => <SeedPlant key={k} x={44 + k * 48} y={592} s={1} stage="flower" color={(k * 3) % 5} i={k} />)}
            {critters.map((id, k) => (
              <g key={id} transform={`translate(${486 + k * 108} 548) scale(0.6)`} data-poster-critter={id}>
                <CritterArt id={id} bare />
              </g>
            ))}
          </svg>
        </div>
        <a className="next-page cut doors-next" href={MAP_HREF} aria-label="Volver al mapa"><NextPageArt /></a>
      </section>
      <button type="button" className="print-link" onClick={() => window.print()}>imprimir</button>
      <Quit href={MAP_HREF} />
    </main>
  );
}

/** Where a stop stands on the poster: three rows, walked like the map (left to right, back, and again). */
function posterStop(n: number): [number, number] {
  const row = n <= 6 ? 0 : n <= 12 ? 1 : 2;
  const k = row === 0 ? n - 1 : row === 1 ? 12 - n : n - 13;
  return [436 + k * 126 + (row === 2 ? 63 : 0), 196 + row * 116];
}

const STAR = 'M0,-12 L3.5,-4 12,-4 5,1.5 7.5,10 0,5 -7.5,10 -5,1.5 -12,-4 -3.5,-4Z';
