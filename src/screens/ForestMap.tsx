// 1ro's home: the whole year as a path on a map drawn on a taped page. The
// path walks through the forest (sheets 1–9), climbs to the river and follows
// its bank (10–17). Each stop is a notebook page (forest) or a flat stone
// (river) with a tiny number; finished sheets carry the red stamp; Brote
// waits on the sheet to play, circled in blue pen; the path he already walked
// is dotted in blue. Sheets past the one the teacher opened are faded and
// wait; sheets not built yet are dashed. Nothing is blocked in dev mode.
// Wordless for the child: the only text is the adult's small print.

import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { smoothOpen } from '../ink/ink.js';
import { isBuilt, type Sheet } from '../curriculum/model';
import { PRIMER } from '../curriculum/primer';
import { sheetState, useProgress, type Progress } from '../curriculum/progress';
import { currentSheet, sheetHref, sheetOpen } from '../curriculum/route';
import { useDev } from '../ui/devMode';
import { drawPortrait } from '../ui/board/BoardView';
import { Stamp } from '../ui/art';
import { BROTE } from './LevelBar';
import { SeedPouch } from './yearKit';
import {
  Bush, LilyPad, Mushroom, Pine, Reeds, River, Signpost, StopArt, StopRing, Tree, Tuft,
  type StopMark,
} from '../ui/forestArt';

const W = 1600, H = 860;
/** The stops are drawn at 64 × 78 units and shown a little bigger. */
const STOP_SCALE = 1.2;

/** Where each sheet sits on the path (map units). Forest row left to right, river row right to left. */
const STOPS: Record<number, [number, number]> = {
  1: [150, 665], 2: [305, 705], 3: [460, 655], 4: [615, 705], 5: [770, 652],
  6: [925, 705], 7: [1080, 655], 8: [1235, 705], 9: [1390, 650],
  10: [1440, 330], 11: [1270, 298], 12: [1100, 338], 13: [930, 298],
  14: [760, 338], 15: [590, 298], 16: [420, 338], 17: [240, 300],
};
/** The path enters on the left, climbs on the right between 9 and 10, and ends past the showcase. */
const ENTRY: [number, number][] = [[-30, 705], [60, 690]];
const CLIMB: [number, number][] = [[1490, 598], [1528, 482], [1506, 382]];
const EXIT: [number, number][] = [[120, 272], [30, 262]];

function pathThrough(upTo: number): [number, number][] {
  const pts: [number, number][] = [...ENTRY];
  for (let n = 1; n <= Math.min(upTo, 17); n++) {
    pts.push(STOPS[n]);
    if (n === 9 && upTo > 9) pts.push(...CLIMB);
  }
  if (upTo >= 17) pts.push(...EXIT);
  return pts;
}

const MARK: Partial<Record<Sheet['kind'], StopMark>> = { taller: 'pencil', recreo: 'note', comodin: 'kite', muestra: 'bunting' };

/** The forest and the river, drawn once. */
function Scenery() {
  const trees = useMemo(() => {
    // between the rows (the forest's upper edge) and in front, placed by hand around the path
    const back: [number, number, number, 'tree' | 'pine' | 'bush'][] = [
      [60, 548, 1.05, 'pine'], [175, 520, 1.1, 'tree'], [300, 552, 0.9, 'bush'], [395, 528, 1.15, 'pine'],
      [520, 548, 1.05, 'tree'], [640, 520, 0.95, 'pine'], [735, 552, 0.9, 'bush'], [850, 530, 1.1, 'tree'],
      [985, 548, 1, 'pine'], [1105, 522, 1.1, 'tree'], [1210, 552, 0.85, 'bush'], [1320, 530, 1.05, 'pine'],
      [1420, 548, 0.9, 'tree'], [1575, 560, 0.9, 'pine'], [1590, 760, 1, 'tree'],
    ];
    const front: [number, number, number, 'tree' | 'pine' | 'bush'][] = [
      [40, 896, 1, 'tree'], [225, 872, 0.85, 'bush'], [395, 904, 0.85, 'pine'], [545, 876, 0.8, 'bush'],
      [700, 900, 0.95, 'tree'], [850, 874, 0.8, 'bush'], [1010, 904, 0.85, 'pine'], [1165, 874, 0.85, 'bush'],
      [1320, 900, 0.95, 'tree'], [1480, 874, 0.9, 'bush'],
    ];
    const draw = ([x, y, s, k]: [number, number, number, string], i: number, base: number) =>
      k === 'pine' ? <Pine key={`${base}-${i}`} x={x} y={y} s={s} seed={base + i * 7} />
        : k === 'bush' ? <Bush key={`${base}-${i}`} x={x} y={y} s={s} seed={base + i * 7} />
          : <Tree key={`${base}-${i}`} x={x} y={y} s={s} seed={base + i * 7} />;
    return { back: back.map((t, i) => draw(t, i, 100)), front: front.map((t, i) => draw(t, i, 400)) };
  }, []);
  const forestGround = `M0,${H} L0,452 ${smoothOpen([[0, 452], [260, 432], [560, 458], [900, 436], [1220, 460], [1600, 440]]).replace(/^M[^C]*/, '')} L${W},${H} Z`;
  const bank = `M0,190 ${smoothOpen([[0, 262], [300, 250], [640, 270], [980, 250], [1320, 268], [1600, 252]]).replace(/^M/, 'L')} L${W},190 Z`;
  return (
    <g className="map-scenery">
      <path d={forestGround} fill="#eef0da" />
      <path d={bank} fill="#f3e8cf" />
      <River w={W} top={48} bottom={196} seed={3} />
      {[[210, 120, 17], [640, 92, 14], [1010, 150, 19], [1380, 104, 15]].map(([x, y, r], i) => <LilyPad key={i} x={x} y={y} r={r} seed={i + 2} />)}
      {[[90, 238], [520, 246], [860, 236], [1180, 250], [1560, 236]].map(([x, y], i) => <Reeds key={i} x={x} y={y} seed={i + 5} />)}
      {trees.back}
      {trees.front}
      {[[235, 612], [548, 620], [700, 758], [1010, 610], [1300, 760], [980, 400], [330, 404], [1205, 396]].map(([x, y], i) => <Tuft key={i} x={x} y={y} seed={i + 3} s={1.2} />)}
      <Mushroom x={372} y={742} s={1.1} seed={1} />
      <Mushroom x={1158} y={622} s={0.9} seed={2} />
      <Mushroom x={862} y={760} s={1} seed={3} />
      <Signpost x={52} y={640} sign="tree" seed={2} />
      <Signpost x={1560} y={380} sign="waves" seed={5} />
    </g>
  );
}

/** The trail: a sand band with an ink edge, and the part Brote already walked dotted in blue pen. */
function Trail({ walked }: { walked: number }) {
  const all = smoothOpen(pathThrough(17));
  const done = walked > 1 ? smoothOpen(pathThrough(walked)) : smoothOpen(pathThrough(1));
  return (
    <g className="map-trail" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={all} stroke="#2b2622" strokeOpacity={0.45} strokeWidth={52} />
      <path d={all} stroke="#ecdcb9" strokeWidth={46} />
      <path d={all} stroke="#2b2622" strokeOpacity={0.18} strokeWidth={1.6} strokeDasharray="2 22" />
      <path d={done} stroke="#3d6ea5" strokeWidth={4} strokeDasharray="1 11" />
    </g>
  );
}

/** Brote, standing by a stop; the portrait is drawn into a nested <svg>. */
function MapBrote({ x, y }: { x: number; y: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => { if (ref.current) drawPortrait(BROTE, ref.current, { x: -0.25, y: 0.2 }); }, []);
  const w = 92;
  return (
    <g className="map-brote" transform={`translate(${x} ${y})`}>
      <ellipse cx={0} cy={0} rx={30} ry={6} fill="url(#hatch)" />
      <g className="bob">
        <svg ref={ref} x={-w / 2} y={-w * (100 / 104)} width={w} height={w} viewBox="-52 -100 104 104" overflow="visible" aria-hidden="true" />
      </g>
    </g>
  );
}

function Stop({ sheet, p, here, unlocked }: { sheet: Sheet; p: Progress; here: boolean; unlocked: boolean }) {
  const [x, y] = STOPS[sheet.n];
  const built = isBuilt(sheet);
  const future = sheet.n > p.opened;
  const done = built && sheetState(sheet, p).complete;
  const reachable = unlocked || sheetOpen(sheet, p);
  const look = sheet.zone === 'rio' ? 'stone' : 'page';
  const art = (
    <g className="stop-in">
      <ellipse className="stop-focus" cx={0} cy={2} rx={62} ry={64} />
      {here && <StopRing seed={sheet.n} />}
      <StopArt n={sheet.n} look={look} soon={!built} mark={MARK[sheet.kind] ?? 'none'} seed={sheet.n * 11} />
      {done && <Stamp seed={sheet.n + 2} x={30} y={36} size={60} className="map-stamp" />}
    </g>
  );
  const cls = `stop is-${look}${future ? ' is-future' : ''}${built ? '' : ' is-soon'}${done ? ' is-done' : ''}${here ? ' is-here' : ''}`;
  const label = `Hoja ${sheet.n}: ${sheet.title}${done ? ' (hecha)' : ''}${built ? '' : ' (próximamente)'}`;
  return (
    <g transform={`translate(${x} ${y}) scale(${STOP_SCALE})`}>
      {reachable
        ? <a className={cls} href={sheetHref(sheet.n)} aria-label={label} data-sheet={sheet.n}>{art}</a>
        : <g className={cls} aria-label={label} data-sheet={sheet.n} role="img">{art}</g>}
    </g>
  );
}

export function ForestMap() {
  const p = useProgress();
  const dev = useDev();
  const here = currentSheet(p);
  const [bx, by] = STOPS[here.n];
  return (
    <main className="map" style={{ '--map-aspect': (W / H).toFixed(4) } as CSSProperties}>
      <header className="map-head">
        <h1 className="map-title">Camino</h1>
        <p className="map-note">1er grado · Repetir · el bosque y el río</p>
        <SeedPouch className="map-pouch" />
      </header>
      <div className="map-stage">
        <div className="sheet map-sheet">
          <span className="tape tape-l" aria-hidden="true" />
          <span className="tape tape-r" aria-hidden="true" />
          <svg className="map-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="El camino de 1er grado">
            <Scenery />
            <Trail walked={here.n} />
            {PRIMER.map((s) => <Stop key={s.n} sheet={s} p={p} here={s.n === here.n} unlocked={dev.on} />)}
            <MapBrote x={bx + (here.zone === 'rio' ? -64 : 62)} y={by + 34} />
          </svg>
        </div>
      </div>
      <a className="quit" href="#/">salir</a>
    </main>
  );
}
