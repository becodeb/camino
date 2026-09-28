// A sheet of 1ro's year (one class). Its core levels come one after the
// other, shown as pages in the bar (the essential ones carry a red bookmark);
// after them, three doors with more levels of the same idea made on the spot
// (easy, medium, hard: sprouts of growing size), and the boss page, an
// optional challenge with a frame of its own. Every level solved for the first
// time earns a seed, which flies into the pouch. A sheet not built yet shows a
// "próximamente" page (reachable in dev mode).
//
// The level pages are the demo's own (LevelScreen); the sheet only tells them
// where they belong through LevelNavContext.

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { DOORS, DOOR_LABEL, bossId, coreId, goalId, isBuilt, type Door, type Sheet } from '../curriculum/model';
import { sheetByN } from '../curriculum/primer';
import { earnGold, progress, reachGoal, sheetState, solve, useProgress } from '../curriculum/progress';
import { extraFor } from '../curriculum/generate';
import { CHOICE_SHEET, MAP_HREF, bossOpen, doorsOpen, entryPage, goldPage, isGold, levelIdOf, nextExtra, nextHref, plainPage, sheetHref, type SheetPage } from '../curriculum/route';
import { goldLevel } from '../game/formats';
import type { LevelDef } from '../game/levels';
import { useDev } from '../ui/devMode';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { NextPageArt, PageIcon, PenRing, Stamp, ThenArrow } from '../ui/art';
import { BossPageArt, DoorArt, Tree, Pine, Bush, Tuft, StopArt, PencilSky, RiverScenery, INK } from '../ui/forestArt';
import { Bar } from './LevelBar';
import { PlayerFace } from './player';
import { ChoicePage } from './WardrobeScreen';
import { GardenPage, RewardCard, RewardSvg } from './GardenScreen';
import { AfichePage, ElegirPage, FamiliaPage, MuestraPage, ShowcasePages } from './ShowcaseScreen';
import { useEndOfSheet } from './PreviewCard';
import { rewardOf } from '../curriculum/motivation';
import { arrivalSay } from '../curriculum/rewards';
import { LevelScreen } from './LevelScreen';
import { LevelNavContext, Quit, useGhost, type LevelNav } from './levelKit';
import { PageThumb } from '../ui/thumbs';
import { GoldSeal, PlanNote, Redirect, SeedPouch, flySeed, recallPlan, rememberPlan, withSheetLine } from './yearKit';
import { EditorPage, TestPage, WorkshopPages } from './WorkshopScreen';
import { CardPage, CorkboardPage } from './CorkboardScreen';
import { BridgePage, HubLevel, HubPage, hubPages } from './HubScreen';

const LINES = {
  doors: '¡Terminaste la hoja! Elegí una puerta para seguir jugando. La planta más grande es la más difícil.',
  doorsShut: 'Las puertas se abren cuando terminás las páginas con cinta roja.',
  /** A page with a gold challenge, won: the seal is offered. */
  goldReady: '¡Lo lograste! ¿Te animás con menos renglones? Tocá el sello dorado.',
  /** The gold challenge, won. */
  goldWon: '¡Sello dorado! Ahorraste bloques.',
  /** A boss won for the first time (its reward's arrival follows). */
  bossWon: '¡Ganaste el desafío!',
};

/** The level of a page of a built sheet (its gold challenge on a gold page), or null. */
export function levelOf(sheet: Sheet, page: SheetPage): LevelDef | null {
  const plain = plainPage(page);
  const base = plain.kind === 'core' ? sheet.core[plain.k - 1]?.level ?? null
    : plain.kind === 'extra' ? extraFor(sheet, plain.door, plain.i)?.level ?? null
      : plain.kind === 'boss' ? sheet.boss ?? null
        : null;
  if (!base) return null;
  return isGold(page) ? goldLevel(base) : base;
}

const pageLabel = (page: SheetPage) => {
  const p = plainPage(page);
  const label = p.kind === 'core' ? `${p.k}` : p.kind === 'extra' ? `puerta ${DOOR_LABEL[p.door]} ${p.i}` : p.kind === 'boss' ? 'jefe' : 'puertas';
  return isGold(page) ? `${label} · oro` : label;
};

export function SheetScreen({ n, page }: { n: number; page: SheetPage }) {
  const sheet = sheetByN(n)!;
  if (!isBuilt(sheet)) return <SoonPage sheet={sheet} />;
  if (page.kind === 'entry') return <Redirect to={sheetHref(n, entryPage(sheet, progress.get()))} />;
  if (page.kind === 'personaje') {
    return n === CHOICE_SHEET ? <ChoicePage sheet={sheet} pages={<SheetPages sheet={sheet} current={page} />} /> : <Redirect to={sheetHref(n)} />;
  }
  if (sheet.showcase) {
    switch (page.kind) {
      case 'muestra': return <MuestraPage sheet={sheet} />;
      case 'elegir': return <ElegirPage sheet={sheet} />;
      case 'familia': return <FamiliaPage sheet={sheet} i={page.i} />;
      case 'recorrido': return <GardenPage tour={{ sheet, pages: <ShowcasePages sheet={sheet} current={page} />, next: sheetHref(n, { kind: 'muestra' }), done: () => progress.update((p) => reachGoal(p, goalId(sheet, 'jardin'))) }} />;
      case 'afiche': return <AfichePage sheet={sheet} />;
      default: return <Redirect to={sheetHref(n, { kind: 'muestra' })} />;
    }
  }
  if (sheet.hub) {
    switch (page.kind) {
      case 'comodin': return <HubPage sheet={sheet} />;
      case 'recuperar': return <BridgePage sheet={sheet} />;
      case 'pendiente': case 'repaso': case 'musica': return <HubLevel sheet={sheet} page={page} />;
      case 'cartelera': return <CorkboardPage sheet={sheet} pages={hubPages} />;
      case 'tarjeta': return <CardPage sheet={sheet} card={page.card} pages={hubPages} />;
      default: return <Redirect to={sheetHref(n, { kind: 'comodin' })} />;
    }
  }
  if (sheet.workshop) {
    if (page.kind === 'taller') return <EditorPage sheet={sheet} />;
    if (page.kind === 'probar') return <TestPage sheet={sheet} />;
    if (page.kind === 'cartelera') return <CorkboardPage sheet={sheet} />;
    if (page.kind === 'tarjeta') return <CardPage sheet={sheet} card={page.card} />;
    return <Redirect to={sheetHref(n, entryPage(sheet, progress.get()))} />;
  }
  if (page.kind === 'doors') return <DoorsPage sheet={sheet} />;
  const level = levelOf(sheet, page);
  // a gold challenge a page does not have: the page itself
  if (!level) return <Redirect to={isGold(page) ? sheetHref(n, plainPage(page)) : sheetHref(n)} />;
  return <SheetLevel sheet={sheet} page={page} level={level} />;
}

function SheetLevel({ sheet, page, level }: { sheet: Sheet; page: SheetPage; level: LevelDef }) {
  const key = JSON.stringify(page);
  // the page object is new on every parse: its content is the key
  const nav = useMemo(() => sheetNav(sheet, page), [sheet, key]);
  return (
    <LevelNavContext.Provider value={nav}>
      <LevelScreen key={level.id} level={level} />
    </LevelNavContext.Provider>
  );
}

/**
 * How a level page behaves inside a sheet. A page with a gold challenge,
 * once solved, shows the gold seal in its sheet's corner (a link to the
 * challenge); the challenge stamps the page in gold, earns no seed, and shows
 * the child's own long plan on a note in the notebook.
 */
function sheetNav(sheet: Sheet, page: SheetPage): LevelNav {
  const gold = isGold(page);
  /** The page's own id (a gold challenge counts as its page). */
  const id = levelIdOf(sheet, page)!;
  const base = gold ? levelOf(sheet, plainPage(page)) : null;
  return {
    pages: () => <SheetPages sheet={sheet} current={page} />,
    title: (level) => <><b>Hoja {sheet.n} · {pageLabel(page)}</b> {page.kind === 'extra' ? sheet.title : (base ?? level).title}</>,
    won: (level, program) => {
      if (gold) {
        progress.update((p) => earnGold(p, id));
        return LINES.goldWon;
      }
      if (level.save && program) rememberPlan(level.id, program);
      const before = progress.get().seeds;
      progress.update((p) => solve(p, level.id));
      const first = progress.get().seeds > before;
      if (first) flySeed(document.querySelector('.level .sheet [data-guide="target"]'));
      // a boss won for the first time sends its reward to the garden: said, and its card turns
      const reward = page.kind === 'boss' && first ? rewardOf(sheet.n) : null;
      const goldLine = level.save && !progress.get().gold[level.id] ? LINES.goldReady : undefined;
      if (!reward) return goldLine;
      return [LINES.bossWon, arrivalSay(reward), goldLine?.replace(/^¡Lo lograste! /, '')].filter(Boolean).join(' ');
    },
    reward: (level, won) => (page.kind === 'boss' && !gold ? <RewardCard sheet={sheet.n} won={won || !!progress.get().solved[level.id]} fresh={won} /> : null),
    gold: (level, won) => {
      if (gold) return <GoldSeal id={id} trying fresh={won} />;
      if (!level.save || !(won || progress.get().solved[level.id])) return null;
      return <GoldSeal id={level.id} href={sheetHref(sheet.n, goldPage(page))} fresh={won} />;
    },
    // the child's own plan from this visit; otherwise the long way the pattern walks
    notebook: gold && base ? <PlanNote plan={recallPlan(id) ?? base.save?.solution ?? base.solution} /> : undefined,
    next: () => { location.hash = nextHref(sheet, page); },
    quit: MAP_HREF,
    say: (level) => withSheetLine(sheet, level.say),
    decor: page.kind === 'boss' ? <BossFrame /> : undefined,
    className: [page.kind === 'boss' ? 'is-boss' : '', gold ? 'is-gold' : ''].filter(Boolean).join(' ') || undefined,
    aside: <SeedPouch />,
  };
}

// ------------------------------------------------------------------ the bar

/** A red ribbon bookmark on an essential page: the teacher's minimum. */
function Bookmark() {
  return (
    <svg className="bookmark" viewBox="0 0 10 22" aria-hidden="true">
      <path d="M1,0 L9,0 L9,20 L5,15.5 L1,20 Z" fill="#c9574a" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

/** A door as a small picture (the bar, the drawn instruction). */
export function DoorIcon({ size, shut }: { size: Door; shut?: boolean }) {
  return (
    <svg className="door-icon" viewBox="-40 -92 80 142" aria-hidden="true">
      <DoorArt size={size} shut={shut} />
    </svg>
  );
}

/** The sheet's pages in the bar: the core pages, the three doors, the boss page (a workshop's: its editor and corkboard). Links for the child and the teacher. */
export function SheetPages({ sheet, current }: { sheet: Sheet; current: SheetPage }) {
  if (sheet.workshop) return <WorkshopPages sheet={sheet} current={current} />;
  return <PagesOfSheet sheet={sheet} current={current} />;
}

function PagesOfSheet({ sheet, current }: { sheet: Sheet; current: SheetPage }) {
  const p = useProgress();
  const dev = useDev();
  const st = sheetState(sheet, p);
  const open = dev.on || doorsOpen(sheet, p);
  const boss = dev.on || bossOpen(sheet, p);
  const bossDone = !!p.solved[bossId(sheet)];
  const bossGold = !!p.gold[bossId(sheet)];
  const bossHere = current.kind === 'boss';
  const choosing = current.kind === 'personaje';
  return (
    <nav className="sheet-pages" aria-label="Páginas de la hoja">
      {sheet.n === CHOICE_SHEET && (
        <a className={`bar-work bar-choice${choosing ? ' is-here' : ''}`} href={sheetHref(sheet.n, { kind: 'personaje' })} aria-label={`Elegir personaje${p.picked ? ', hecho' : ''}`} data-work="personaje">
          <PlayerFace className="choice-face" />
          {p.picked && <Stamp seed={5} />}
          {choosing && <PenRing seed={6} />}
        </a>
      )}
      <span className="sp-group">
        {sheet.core.map((c, i) => {
          const k = i + 1;
          const done = !!p.solved[coreId(sheet, k)];
          const golden = !!p.gold[coreId(sheet, k)];
          const here = current.kind === 'core' && current.k === k;
          return (
            <a key={k} className={`tramo-page is-${here ? 'here' : done ? 'done' : 'todo'}`} href={sheetHref(sheet.n, { kind: 'core', k })} aria-label={`Página ${k}${c.essential ? ', con cinta' : ''}${done ? ', hecha' : ''}${golden ? ', con sello dorado' : ''}`} data-core={k}>
              <PageIcon state={done ? 'done' : 'todo'} seed={k + sheet.n} />
              {c.essential && <Bookmark />}
              {done && <Stamp key={golden ? 'gold' : 'red'} seed={k + 3} tone={golden ? 'gold' : 'red'} className={here ? 'is-new' : ''} />}
              {here && <PenRing seed={k + 7} />}
            </a>
          );
        })}
      </span>
      <span className="sp-group sp-doors">
        {DOORS.map((d) => {
          const here = current.kind === 'extra' && current.door === d;
          const n = st.extras[d];
          const inner = (
            <>
              <DoorIcon size={d} shut={!open} />
              {n > 0 && <b className="door-tally" aria-hidden="true">{n}</b>}
              {here && <PenRing seed={d.length + 9} />}
            </>
          );
          const cls = `bar-door is-${d}${open ? '' : ' is-shut'}${here ? ' is-here' : ''}`;
          const label = `Puerta ${DOOR_LABEL[d]}${n ? `, ${n} hechas` : ''}`;
          return open
            ? <a key={d} className={cls} href={sheetHref(sheet.n, { kind: 'extra', door: d, i: nextExtra(sheet, d, p) })} aria-label={label} data-door={d}>{inner}</a>
            : <span key={d} className={cls} aria-label={`${label}, cerrada`} data-door={d}>{inner}</span>;
        })}
      </span>
      {sheet.boss && (boss
        ? <a className={`bar-boss${bossHere ? ' is-here' : ''}`} href={sheetHref(sheet.n, { kind: 'boss' })} aria-label={`Desafío${bossDone ? ', hecho' : ''}`}><BossIcon done={bossDone} gold={bossGold} here={bossHere} /></a>
        : <span className="bar-boss is-shut" aria-label="Desafío, todavía no"><BossIcon done={false} gold={false} here={false} /></span>)}
    </nav>
  );
}

function BossIcon({ done, gold, here }: { done: boolean; gold: boolean; here: boolean }) {
  return (
    <>
      <svg className="boss-icon" viewBox="-52 -58 104 116" aria-hidden="true"><BossPageArt /></svg>
      {done && <Stamp key={gold ? 'gold' : 'red'} seed={11} tone={gold ? 'gold' : 'red'} className={here ? 'is-new' : ''} />}
      {here && <PenRing seed={13} />}
    </>
  );
}

// ------------------------------------------------------------------ the boss's frame

/** Around the board's sheet: a vine of leaves and berries (CSS), a sprig of leaves in each corner. */
function BossFrame() {
  return (
    <span className="boss-frame" aria-hidden="true">
      {(['tl', 'tr', 'br', 'bl'] as const).map((c, i) => (
        <svg key={c} className={`boss-corner is-${c}`} viewBox="-30 -30 60 60">
          <g transform={`rotate(${i * 90})`} stroke={INK} strokeLinecap="round" strokeLinejoin="round">
            <path d="M-4,-4 Q6,-6 22,-2" fill="none" strokeWidth={2} />
            <path d="M-4,-4 Q-6,6 -2,22" fill="none" strokeWidth={2} />
            <path d="M6,-5 Q12,-16 20,-14 Q16,-6 6,-5 Z" fill="#a4b86d" strokeWidth={1.8} />
            <path d="M-5,6 Q-16,12 -14,20 Q-6,16 -5,6 Z" fill="#a4b86d" strokeWidth={1.8} />
            <path d="M14,-2 Q20,6 26,4 Q22,-3 14,-2 Z" fill="#a4b86d" strokeWidth={1.6} />
            <circle cx={-3} cy={-3} r={5} fill="#c9574a" strokeWidth={1.8} />
          </g>
        </svg>
      ))}
    </span>
  );
}

// ------------------------------------------------------------------ the doors page

const DOOR_X: Record<Door, number> = { easy: 215, medium: 470, hard: 725 };
const GROUND = 468;

function DoorsTask() {
  return (
    <span className="drawn-task" aria-hidden="true">
      <PlayerFace className="bar-face" />
      <ThenArrow />
      <span className="task-door"><DoorIcon size="easy" /></span>
    </span>
  );
}

/** The seeds earned behind a door, under it: a few little seeds and the count. */
function DoorCount({ n }: { n: number }) {
  if (!n) return null;
  return (
    <g className="door-count">
      {Array.from({ length: Math.min(n, 5) }, (_, i) => (
        <g key={i} transform={`translate(${(i - (Math.min(n, 5) - 1) / 2) * 20} 0)`} stroke={INK} strokeLinejoin="round">
          <ellipse cx={0} cy={0} rx={7} ry={6} fill="#f0d27a" strokeWidth={2} />
          <path d="M0,-6 q-2,-6 2,-9" fill="none" strokeWidth={1.6} strokeLinecap="round" />
        </g>
      ))}
      {n > 5 && <text x={Math.min(n, 5) * 10 + 14} y={7} className="door-count-n">{n}</text>}
    </g>
  );
}

function DoorsPage({ sheet }: { sheet: Sheet }) {
  const p = useProgress();
  const dev = useDev();
  const rootRef = useRef<HTMLElement>(null);
  const ghost = useGhost(rootRef);
  const open = dev.on || doorsOpen(sheet, p);
  const boss = dev.on || bossOpen(sheet, p);
  const st = sheetState(sheet, p);
  const line = open ? LINES.doors : LINES.doorsShut;
  const bossDone = !!p.solved[bossId(sheet)];
  // the sheet just finished: its preview card first, then this page's line
  const preview = useEndOfSheet(sheet, line);

  useEffect(() => {
    if (preview) return;
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(line); }, 450);
    return () => { clearTimeout(t); off(); stopSpeaking(); };
  }, [line, preview]);

  const help = () => { ghost([{ do: 'point', at: [open ? '.door-btn' : '.bar-door'] }]); };

  const scenery: ReactNode = sheet.zone === 'rio' ? <RiverScenery /> : (
    <g className="doors-scenery">
      <PencilSky />
      <path d={`M0,${GROUND} Q300,${GROUND - 14} 600,${GROUND - 4} T1200,${GROUND - 8} L1200,600 L0,600 Z`} fill="#eef0da" />
      <path d={`M0,${GROUND} Q300,${GROUND - 14} 600,${GROUND - 4} T1200,${GROUND - 8}`} fill="none" stroke={INK} strokeWidth={2.2} opacity={0.5} />
      <Pine x={70} y={GROUND + 6} s={1.6} seed={901} />
      <Tree x={345} y={GROUND + 4} s={1.35} seed={902} />
      <Pine x={598} y={GROUND + 6} s={1.45} seed={903} />
      <Tree x={860} y={GROUND + 2} s={1.2} seed={904} />
      <Bush x={1140} y={GROUND + 30} s={1.3} seed={905} />
      {[[130, 520], [420, 540], [640, 515], [880, 548], [1080, 530]].map(([x, y], i) => <Tuft key={i} x={x} y={y} seed={i + 40} s={1.4} />)}
    </g>
  );

  return (
    <main ref={rootRef} className="level mode-doors" data-sheet={sheet.n}>
      <Bar
        instruction={<DoorsTask />}
        title={<><b>Hoja {sheet.n} · puertas</b> {sheet.title}</>}
        pages={<SheetPages sheet={sheet} current={{ kind: 'doors' }} />}
        aside={<SeedPouch />}
        onSpeak={() => speak(line)}
        onHelp={help}
      />
      <section className="doors-stage" aria-label="Puertas">
        <div className="sheet doors-sheet">
          <span className="tape tape-l" aria-hidden="true" />
          <span className="tape tape-r" aria-hidden="true" />
          <svg className="doors-svg" viewBox="0 0 1200 600" role="group" aria-label="Tres puertas y el desafío">
            {scenery}
            {DOORS.map((d) => {
              const x = DOOR_X[d];
              const art = (
                <g className="door-in">
                  <g transform={`translate(0 ${-40 * 2.3}) scale(2.3)`}><DoorArt size={d} shut={!open} seed={x} /></g>
                  <g transform="translate(0 44)"><DoorCount n={st.extras[d]} /></g>
                </g>
              );
              return (
                <g key={d} transform={`translate(${x} ${GROUND})`}>
                  {open
                    ? <a className={`door-btn is-${d}`} href={sheetHref(sheet.n, { kind: 'extra', door: d, i: nextExtra(sheet, d, p) })} aria-label={`Puerta ${DOOR_LABEL[d]}`} data-door={d}>{art}</a>
                    : <g className={`door-btn is-${d} is-shut`} aria-label={`Puerta ${DOOR_LABEL[d]}, cerrada`}>{art}</g>}
                </g>
              );
            })}
            {sheet.boss && (
              <g transform={`translate(1000 ${GROUND - 120})`}>
                {boss
                  ? <a className="boss-btn" href={sheetHref(sheet.n, { kind: 'boss' })} aria-label={`Desafío${bossDone ? ', hecho' : ''}`}><BossPage sheet={sheet} done={bossDone} /></a>
                  : <g className="boss-btn is-shut" aria-label="Desafío, todavía no"><BossPage sheet={sheet} done={false} /></g>}
              </g>
            )}
          </svg>
        </div>
        <a className="next-page cut doors-next" href={MAP_HREF} aria-label="Volver al mapa"><NextPageArt /></a>
      </section>
      <Quit href={MAP_HREF} />
    </main>
  );
}

/** The boss page on the doors page: the framed page with a drawing of its board, and its stamp once won. */
function BossPage({ sheet, done }: { sheet: Sheet; done: boolean }) {
  const r = rewardOf(sheet.n);
  return (
    <g className="boss-in">
      <g transform="rotate(4) scale(2.3)">
        <BossPageArt seed={sheet.n}>
          <PageThumb level={sheet.boss!} place={{ x: -26, y: -28, width: 52, height: 58 }} />
        </BossPageArt>
      </g>
      {done && <Stamp seed={sheet.n + 5} x={62} y={82} size={96} />}
      {/* what it sends to the garden, on a tag tied to the page: a silhouette until it is won */}
      {r && (
        <g className="boss-reward" transform="translate(-92 -58) rotate(-6)" data-reward={r.id} data-won={done || undefined}>
          <path d="M40,6 Q60,-6 78,10" fill="none" stroke={INK} strokeWidth={2} strokeDasharray="1 5" strokeLinecap="round" />
          <path d="M-36,-40 L36,-42 L38,34 L-34,36 Z" transform="translate(3 4)" fill="rgba(84, 62, 38, 0.2)" />
          <path d="M-36,-40 L36,-42 L38,34 L-34,36 Z" fill={done ? '#fbf7ee' : '#f6efdf'} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
          <RewardSvg r={r} silhouette={!done} place={{ x: -30, y: -34, width: 62, height: 62 }} />
        </g>
      )}
    </g>
  );
}

// ------------------------------------------------------------------ a sheet not built yet

function SoonPage({ sheet }: { sheet: Sheet }) {
  return (
    <main className="soon" data-sheet={sheet.n}>
      <div className="sheet soon-sheet">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <svg className="soon-art" viewBox="-70 -84 140 150" aria-hidden="true">
          <g transform="scale(1.3)"><StopArt n={sheet.n} look={sheet.zone === 'rio' ? 'stone' : 'page'} soon mark="none" seed={sheet.n * 11} /></g>
        </svg>
        <div className="soon-text">
          <p className="soon-kicker">Hoja {sheet.n} · {sheet.zone === 'rio' ? 'el río' : 'el bosque'}</p>
          <h1 className="soon-title">{sheet.title}</h1>
          <p className="soon-say">{sheet.say}</p>
          <p className="soon-note">Próximamente: esta hoja se arma en {sheet.builtIn}. <span lang="en">{sheet.plan}</span></p>
          <a className="soon-back" href={MAP_HREF}>volver al mapa</a>
        </div>
      </div>
      <Quit href={MAP_HREF} />
    </main>
  );
}
