// The home page: the whole tramo on one screen. Five notebooks side by side,
// one per grade, each with its two pages drawn as a little picture of the
// board. Finished pages carry a stamp; Brote waits on the next page to play.
// The grade names are small print for the adult; the child taps a picture.

import { useEffect, type CSSProperties } from 'react';
import { blob } from '../ink/ink.js';
import { GRADES, LEVELS, levelsOf, type LevelDef } from '../game/levels';
import { stamp, useStamps } from '../game/progress';
import { Portrait, Stamp } from '../ui/art';
import { LevelThumb } from '../ui/thumbs';
import { BROTE } from './LevelBar';
import { MAP_HREF } from '../curriculum/route';

const INK = '#2b2622';

/** 1ro's tab opens the whole year: a little tree says there is a forest behind it. */
function TabTree() {
  return (
    <svg className="tab-tree" viewBox="-13 -30 26 32" aria-hidden="true">
      <g stroke={INK} strokeLinejoin="round" strokeLinecap="round">
        <path d="M-2.5,0 L2.5,0 L2,-9 L-2,-9 Z" fill="#b08560" strokeWidth={1.8} />
        <path d={blob(0, -17, 10, 9, { seed: 4, n: 8 })} fill="#a4b86d" strokeWidth={2} />
        <path d="M-4,-17 q2,2 4,0" fill="none" strokeWidth={1.2} opacity={0.5} />
      </g>
    </svg>
  );
}

function PageCard({ level, stamped, next }: { level: LevelDef; stamped: boolean; next: boolean }) {
  return (
    <a className={`page-card cut${next ? ' is-next' : ''}${stamped ? ' is-done' : ''}`} href={`#/nivel/${level.id}`} aria-label={`${level.title}${stamped ? ' (hecha)' : ''}`}>
      <span className="page-no" aria-hidden="true"><b>{level.page}</b></span>
      <LevelThumb level={level} />
      {stamped && <Stamp seed={level.page + 2} className="page-stamp" />}
      {next && <Portrait def={BROTE} className="page-brote" />}
    </a>
  );
}

export function HomeScreen() {
  const stamps = useStamps();
  const next = LEVELS.find((l) => !stamps.has(l.id));

  // screenshots: ?debug&stamps=a,b stamps pages without playing them
  useEffect(() => {
    if (!location.search.includes('debug')) return;
    const m = location.search.match(/stamps=([^&]+)/);
    m?.[1].split(',').forEach((id) => stamp(id));
  }, []);

  return (
    <main className="home">
      <header className="home-head">
        <h1 className="home-title">Camino</h1>
        <p className="home-note">Sala 4 a 3er grado · dos hojas por grado · el año entero de 1ro, en su pestaña</p>
      </header>
      <ol className="books">
        {GRADES.map((g, gi) => {
          const pages = levelsOf(g.id);
          return (
            <li key={g.id} className="book" style={{ '--tab': g.color, '--tilt': `${gi % 2 ? 0.6 : -0.5}deg` } as CSSProperties}>
              {g.id === '1ro'
                ? <a className="book-tab is-year" href={MAP_HREF} aria-label="1ro: el año completo, el mapa del bosque">{g.label}<TabTree /></a>
                : <span className="book-tab">{g.label}</span>}
              <div className="book-sheet">
                <span className="tape tape-r" aria-hidden="true" />
                {[1, 2].map((n) => {
                  const l = pages.find((x) => x.page === n);
                  return l
                    ? <PageCard key={n} level={l} stamped={stamps.has(l.id)} next={next?.id === l.id} />
                    : <span key={n} className="page-card is-future" aria-hidden="true" />;
                })}
              </div>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
