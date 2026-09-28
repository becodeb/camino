// The class corkboard (the workshops, sheets 7 and 15, and the comodín, 16):
// the levels pinned by the class, as paper cards on cork in a wooden frame.
// Each card is a small drawing of its board, pinned with a push-pin, with its
// author's badge (a classmate's character on their colour; one's own level
// carries a star sticker), the badge of a limited level (the repeat's tape
// and its few lines), and how many times it was played on this device in
// pencil tally marks. A card the child solved carries the red stamp. There
// are no accounts in this demo: the classmates' cards are examples (the
// adult's small print says so), next to every level made on this device. A
// tap plays a card as a normal page (a seed on its first solve; a play more
// on every win), and "next page" goes back to the corkboard.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { classmateById } from '../curriculum/classmates';
import { goalId, type Sheet } from '../curriculum/model';
import { sheetByN } from '../curriculum/primer';
import { played, progress, reachGoal, sheetState, solve, useProgress } from '../curriculum/progress';
import { MAP_HREF, nextHref, sheetHref, type SheetPage } from '../curriculum/route';
import { cardById, cardLevel, cardLevelId, cardsOf, isExample, type MadeLevel } from '../curriculum/workshop';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { NextPageArt, Portrait, Stamp, ThenArrow } from '../ui/art';
import { PageThumb } from '../ui/thumbs';
import { REDUCED } from '../ui/runtime';
import { AvatarFace, CorkIcon, LimitBadge, PIN_COLORS, PushPin, StarSticker, Tally } from '../ui/workshopArt';
import { BROTE, Bar } from './LevelBar';
import { LevelScreen } from './LevelScreen';
import { LevelNavContext, Quit, useGhost, type LevelNav } from './levelKit';
import { WorkshopPages, justPinned } from './WorkshopScreen';
import { Redirect, SeedPouch, flySeed, withSheetLine } from './yearKit';

const LINES = {
  cork: 'Estos son los niveles de tus compañeros. Tocá uno para jugarlo.',
  corkLimited: 'Estos son los niveles de tus compañeros. Jugá uno de los que tienen la cinta de repetir: tienen pocos renglones.',
  pinned: '¡Tu nivel ya está en la cartelera!',
  plays: (n: number) => `A tu nivel lo jugaron ${n === 1 ? 'una vez' : `${n} veces`}.`,
};

/** The cards lean a little, each its own way, like cards pinned by hand. */
const TILTS = [-2.2, 1.6, -1, 2.4, -1.8, 0.8, 2, -2.6, 1.2, -0.6];

/** The pages in the bar of a corkboard's sheet (the comodín brings its own). */
export type PagesOf = (sheet: Sheet, current: SheetPage) => ReactNode;
const workshopPages: PagesOf = (sheet, current) => <WorkshopPages sheet={sheet} current={current} />;

/** "Tap a card to play it", drawn: Brote, then the corkboard. */
function CorkTask() {
  return (
    <span className="drawn-task" aria-hidden="true">
      <Portrait def={BROTE} className="bar-face" />
      <ThenArrow />
      <CorkIcon size={44} />
    </span>
  );
}

/** A card of the corkboard. */
function CorkCard({ m, i, href, plays, solved, fresh, character }: {
  m: MadeLevel; i: number; href: string; plays: number; solved: boolean; fresh: boolean; character: string;
}) {
  const ws = sheetByN(m.sheet)!;
  const level = useMemo(() => cardLevel(m, ws), [m, ws]);
  const who = m.by ? classmateById(m.by) : null;
  const limited = !!ws.workshop?.limited;
  const [pin, dark] = PIN_COLORS[i % PIN_COLORS.length];
  const label = `${who ? `El nivel de ${who.name} (ejemplo)` : 'Tu nivel'}${limited ? `, con ${m.lines} renglones` : ''}${plays ? `, lo jugaron ${plays === 1 ? 'una vez' : `${plays} veces`}` : ''}${solved ? ', hecho' : ''}`;
  return (
    <li className={`cork-card${who ? '' : ' is-mine'}${fresh ? ' is-fresh' : ''}`} style={{ '--tilt': `${TILTS[i % TILTS.length]}deg` } as CSSProperties}>
      <a className="card-in" href={href} data-card={m.id} data-plays={plays} aria-label={label}>
        <span className="card-pin"><PushPin color={pin} dark={dark} seed={i + 1} size={30} /></span>
        <span className="card-thumb"><PageThumb level={level} /></span>
        <span className="card-foot">
          <span className="card-badge cut" style={{ '--fill': who?.color ?? '#f0d27a' } as CSSProperties}>
            <AvatarFace character={who?.character ?? character} className="badge-face" />
          </span>
          {limited && <LimitBadge lines={m.lines} />}
          {plays > 0 && <span className="card-plays"><Tally n={plays} /><b>{plays}</b></span>}
        </span>
        <small className="card-who">{who ? `${who.name} · ejemplo` : 'hecho en esta compu'}</small>
        {solved && <Stamp key={`s${m.id}`} seed={i + 5} className={`card-stamp${fresh ? ' is-new' : ''}`} />}
        {!who && <span className="card-star"><StarSticker /></span>}
      </a>
    </li>
  );
}

export function CorkboardPage({ sheet, pages = workshopPages }: { sheet: Sheet; pages?: PagesOf }) {
  const p = useProgress();
  const rootRef = useRef<HTMLElement>(null);
  const ghost = useGhost(rootRef);
  const cards = cardsOf(p);
  const limited = !!sheet.workshop?.limited;
  // the level just pinned from its test page: it drops onto the cork, then its seed flies to the pouch
  const [fresh] = useState(() => { const id = justPinned.id; justPinned.id = null; return id; });
  const mine = cards.filter((c) => !isExample(c));
  const played = mine.find((c) => (p.plays[c.id] ?? 0) > 0);
  const line = [fresh ? LINES.pinned : null, limited ? LINES.corkLimited : LINES.cork, !fresh && played ? LINES.plays(p.plays[played.id]) : null].filter(Boolean).join(' ');

  useEffect(() => {
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(withSheetLine(sheet, line)); }, 450);
    return () => { clearTimeout(t); off(); stopSpeaking(); };
    // once per page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => {
      const before = progress.get().seeds;
      progress.update((x) => solve(x, cardLevelId(fresh)));
      if (progress.get().seeds > before) flySeed(document.querySelector(`.cork [data-card="${fresh}"] .card-thumb`));
    }, REDUCED ? 0 : 900);
    return () => clearTimeout(t);
  }, [fresh]);

  /** ✋ points at a classmate's card not played yet (a limited one on the limited workshop), else at any. */
  const help = () => {
    const want = cards.filter((c) => isExample(c) && (!limited || sheetByN(c.sheet)?.workshop?.limited));
    const next = want.find((c) => !p.plays[c.id]) ?? want[0];
    if (next) ghost([{ do: 'point', at: [`.cork [data-card="${next.id}"]`] }]);
  };

  const st = sheetState(sheet, p);
  return (
    <main ref={rootRef} className="level mode-cork" data-sheet={sheet.n}>
      <Bar
        instruction={<CorkTask />}
        title={<><b>Hoja {sheet.n} · cartelera</b> Niveles de ejemplo de compañeros ficticios y los hechos en esta compu</>}
        pages={pages(sheet, { kind: 'cartelera' })}
        aside={<SeedPouch />}
        onSpeak={() => speak(line)}
        onHelp={help}
      />
      <section className="cork-stage" aria-label="La cartelera de la clase">
        <div className="cork-frame">
          <span className="cork-surface" aria-hidden="true" />
          <ul className="cork">
            {cards.map((m, i) => (
              <CorkCard
                key={m.id} m={m} i={i} href={sheetHref(sheet.n, { kind: 'tarjeta', card: m.id })}
                plays={p.plays[m.id] ?? 0} solved={!!p.solved[cardLevelId(m.id)]} fresh={m.id === fresh} character={p.character}
              />
            ))}
          </ul>
        </div>
        <a className={`next-page cut cork-next${st.complete ? '' : ' is-quiet'}`} href={nextHref(sheet, { kind: 'cartelera' })} aria-label={sheet.hub ? 'Volver a elegir' : 'Volver al mapa'}><NextPageArt /></a>
      </section>
      <Quit href={MAP_HREF} />
    </main>
  );
}

// ------------------------------------------------------------------ a card, played

/**
 * A card's level as a normal page: the classmate's notebook, a seed on its
 * first solve, a play more on every win; "next page" goes back to the
 * corkboard. From the comodín, it counts as its choice played.
 */
export function CardPage({ sheet, card, pages = workshopPages }: { sheet: Sheet; card: string; pages?: PagesOf }) {
  const [m] = useState(() => cardById(progress.get(), card));
  const level = useMemo(() => (m ? cardLevel(m, sheetByN(m.sheet)!) : null), [m]);
  const nav = useMemo<LevelNav | null>(() => (m ? {
    pages: () => pages(sheet, { kind: 'tarjeta', card }),
    title: (l) => <><b>Hoja {sheet.n} · cartelera</b> {l.title}{isExample(m) ? ' (ejemplo)' : ''}</>,
    won: (l) => {
      const before = progress.get().seeds;
      progress.update((x) => {
        const y = played(solve(x, l.id), m.id);
        return sheet.hub ? reachGoal(y, goalId(sheet, 'companeros')) : y;
      });
      if (progress.get().seeds > before) flySeed(document.querySelector('.level .sheet [data-guide="target"]'));
    },
    next: () => { location.hash = nextHref(sheet, { kind: 'tarjeta', card }); },
    quit: MAP_HREF,
    say: (l) => withSheetLine(sheet, l.say),
    aside: <SeedPouch />,
  } : null), [m, sheet, card, pages]);
  if (!m || !level || !nav) return <Redirect to={sheetHref(sheet.n, { kind: 'cartelera' })} />;
  return (
    <LevelNavContext.Provider value={nav}>
      <LevelScreen key={level.id} level={level} />
    </LevelNavContext.Provider>
  );
}
