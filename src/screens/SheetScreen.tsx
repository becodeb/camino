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
import { blob } from '../ink/ink.js';
import { DOORS, DOOR_LABEL, bossId, coreId, isBuilt, type Door, type Sheet } from '../curriculum/model';
import { sheetByN } from '../curriculum/primer';
import { earnGold, progress, sheetState, solve, useProgress } from '../curriculum/progress';
import { extraFor } from '../curriculum/generate';
import { MAP_HREF, bossOpen, doorsOpen, entryPage, goldPage, isGold, levelIdOf, nextExtra, nextHref, plainPage, sheetHref, type SheetPage } from '../curriculum/route';
import { goldLevel } from '../game/formats';
import type { LevelDef } from '../game/levels';
import { useDev } from '../ui/devMode';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { NextPageArt, PageIcon, PenRing, Portrait, Stamp, ThenArrow } from '../ui/art';
import { BossPageArt, DoorArt, Tree, Pine, Bush, Tuft, StopArt, River, Reeds, LilyPad, INK } from '../ui/forestArt';
import { BROTE, Bar } from './LevelBar';
import { LevelScreen } from './LevelScreen';
import { LevelNavContext, Quit, useGhost, type LevelNav } from './levelKit';
import { PageThumb } from '../ui/thumbs';
import { GoldSeal, PlanNote, SeedPouch, flySeed, recallPlan, rememberPlan } from './yearKit';

const LINES = {
  doors: '¡Terminaste la hoja! Elegí una puerta para seguir jugando. La planta más grande es la más difícil.',
  doorsShut: 'Las puertas se abren cuando terminás las páginas con cinta roja.',
  /** A page with a gold challenge, won: the seal is offered. */
  goldReady: '¡Lo lograste! ¿Te animás con menos renglones? Tocá el sello dorado.',
  /** The gold challenge, won. */
  goldWon: '¡Sello dorado! Ahorraste bloques.',
};

/** Sheets whose own line was already said in this visit (it is said once, before the first page's). */
const introduced = new Set<number>();

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

function Redirect({ to }: { to: string }) {
  useEffect(() => { location.replace(to); }, [to]);
  return null;
}

export function SheetScreen({ n, page }: { n: number; page: SheetPage }) {
  const sheet = sheetByN(n)!;
  if (!isBuilt(sheet)) return <SoonPage sheet={sheet} />;
  if (page.kind === 'entry') return <Redirect to={sheetHref(n, entryPage(sheet, progress.get()))} />;
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
      if (progress.get().seeds > before) flySeed(document.querySelector('.level .sheet [data-guide="target"]'));
      return level.save && !progress.get().gold[level.id] ? LINES.goldReady : undefined;
    },
    gold: (level, won) => {
      if (gold) return <GoldSeal id={id} trying fresh={won} />;
      if (!level.save || !(won || progress.get().solved[level.id])) return null;
      return <GoldSeal id={level.id} href={sheetHref(sheet.n, goldPage(page))} fresh={won} />;
    },
    // the child's own plan from this visit; otherwise the long way the pattern walks
    notebook: gold && base ? <PlanNote plan={recallPlan(id) ?? base.save?.solution ?? base.solution} /> : undefined,
    next: () => { location.hash = nextHref(sheet, page); },
    quit: MAP_HREF,
    say: (level) => {
      if (introduced.has(sheet.n)) return level.say;
      introduced.add(sheet.n);
      return `${sheet.say} ${level.say}`;
    },
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

/** The sheet's pages in the bar: the core pages, the three doors, the boss page. Links for the child and the teacher. */
export function SheetPages({ sheet, current }: { sheet: Sheet; current: SheetPage }) {
  const p = useProgress();
  const dev = useDev();
  const st = sheetState(sheet, p);
  const open = dev.on || doorsOpen(sheet, p);
  const boss = dev.on || bossOpen(sheet, p);
  const bossDone = !!p.solved[bossId(sheet)];
  const bossGold = !!p.gold[bossId(sheet)];
  const bossHere = current.kind === 'boss';
  return (
    <nav className="sheet-pages" aria-label="Páginas de la hoja">
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
      <Portrait def={BROTE} className="bar-face" />
      <ThenArrow />
      <span className="task-door"><DoorIcon size="easy" /></span>
    </span>
  );
}

/** Two clouds and the sun in pencil over the doors, like the sky of a lone path on the board. */
function PencilSky() {
  const clouds: [number, number, number][] = [[330, 118, 1], [640, 80, 4]];
  return (
    <g opacity={0.75} stroke={INK} strokeLinecap="round">
      {clouds.map(([x, y, sd]) => [blob(x, y, 40, 18, { seed: sd, n: 9 }), blob(x + 34, y - 11, 30, 18, { seed: sd + 3, n: 8 }), blob(x - 30, y - 4, 22, 13, { seed: sd + 6, n: 8 })]
        .map((d, i) => <path key={`${x}-${i}`} d={d} fill="#fbf7ee" strokeWidth={2} />))}
      <circle cx={1090} cy={92} r={26} fill="#f0d27a" strokeWidth={2.2} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <path key={i} d={`M${(1090 + Math.cos(a) * 35).toFixed(1)},${(92 + Math.sin(a) * 35).toFixed(1)} L${(1090 + Math.cos(a) * 47).toFixed(1)},${(92 + Math.sin(a) * 47).toFixed(1)}`} strokeWidth={2} />;
      })}
    </g>
  );
}

/**
 * The doors of a river sheet stand on the sandy bank: the river runs behind
 * them with its lily pads, the far bank has reeds, flat stones and reeds on
 * the near bank instead of the forest's trees.
 */
function RiverScenery() {
  const stones: [number, number, number][] = [[92, GROUND + 38, 1.2], [590, GROUND + 60, 1], [1150, GROUND + 44, 1.1]];
  return (
    <g className="doors-scenery is-river">
      <clipPath id="doors-river-clip"><rect x={0} y={0} width={1200} height={600} /></clipPath>
      <PencilSky />
      <path d="M0,196 Q300,186 600,194 T1200,190 L1200,300 L0,300 Z" fill="#f3e8cf" />
      <path d={`M0,392 L1200,392 L1200,600 L0,600 Z`} fill="#f3e8cf" />
      {/* the river's banks run a little past the page: clipped to it */}
      <g clipPath="url(#doors-river-clip)"><River w={1200} top={262} bottom={404} seed={6} /></g>
      {[[150, 312, 17], [650, 352, 14], [1050, 300, 16]].map(([x, y, r], i) => <LilyPad key={i} x={x} y={y} r={r} seed={i + 3} />)}
      {[[40, 262], [470, 258], [860, 264], [1180, 258]].map(([x, y], i) => <Reeds key={`far${i}`} x={x} y={y} seed={i + 11} />)}
      {stones.map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`} stroke={INK} strokeLinejoin="round">
          <path d={blob(3, 5, 40, 17, { seed: i + 30, n: 10 })} fill="rgba(84, 62, 38, 0.2)" stroke="none" />
          <path d={blob(0, 0, 40, 17, { seed: i + 30, n: 10 })} fill="#ddd4c3" strokeWidth={2.6} />
          <path d={`M-18,-6 q10,-5 22,-3`} fill="none" stroke="#fbf7ee" strokeWidth={2.4} strokeLinecap="round" />
        </g>
      ))}
      {[[345, GROUND + 6], [598, GROUND + 4], [860, GROUND + 6], [22, GROUND + 70], [1100, GROUND + 100]].map(([x, y], i) => <Reeds key={`near${i}`} x={x} y={y} seed={i + 21} />)}
      {[[250, 540], [720, 548], [960, 530]].map(([x, y], i) => (
        <g key={`p${i}`} stroke={INK} strokeWidth={1.4} fill="#d8c9a6" opacity={0.8}>
          <ellipse cx={x} cy={y} rx={5} ry={3.5} />
          <ellipse cx={x + 12} cy={y + 5} rx={3.5} ry={2.5} />
        </g>
      ))}
    </g>
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

  useEffect(() => {
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(line); }, 450);
    return () => { clearTimeout(t); off(); stopSpeaking(); };
  }, [line]);

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
  return (
    <g className="boss-in">
      <g transform="rotate(4) scale(2.3)">
        <BossPageArt seed={sheet.n}>
          <PageThumb level={sheet.boss!} place={{ x: -26, y: -28, width: 52, height: 58 }} />
        </BossPageArt>
      </g>
      {done && <Stamp seed={sheet.n + 5} x={62} y={82} size={96} />}
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
