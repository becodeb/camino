// The child's garden (Mi jardín), reached from the map's pouch. Every seed
// earned is planted in a bed of ten and grows as the year goes on (sprout,
// plant, flower); a gold page grows a rare flower in a pot along the front; a
// finished sheet adds a tree or a flowering bush with a stake that says which
// sheet it came from; the bosses send special plants and critters. The
// child's character stands in it, alive. The big plants can be dragged to
// another spot (kept); the beds stay in their rows. Under the garden, the
// row of who is still coming: silhouettes, each with the sheet whose boss
// sends it (a tap says it). Progress is a growing world: no points, no
// ranking; seeds are never spent.
//
// `preview` (dev): the garden as it would be with that many seeds, the
// progress untouched.

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { GARDEN_H, GARDEN_W, gardenOf, inMeadow, type Garden } from '../curriculum/garden';
import { rewardKey, type BossReward } from '../curriculum/motivation';
import { markSeen, placeInGarden, progress, useProgress } from '../curriculum/progress';
import { arrivalSay, comingSay, newArrivals, stillComing } from '../curriculum/rewards';
import { MAP_HREF } from '../curriculum/route';
import { REDUCED } from '../ui/runtime';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { NextPageArt, ThenArrow } from '../ui/art';
import { StopArt } from '../ui/forestArt';
import { BedSoil, GardenScenery, GoldPot, RarePlantArt, SeedPlant, SheetPlant } from '../ui/gardenArt';
import { Bar } from './LevelBar';
import { Quit, useGhost } from './levelKit';
import { PlayerFace, usePlayer, useStage } from './player';
import { SeedPouch } from './yearKit';

const LINES = {
  garden: 'Este es tu jardín. Cada página que resolvés planta una semilla, y las semillas crecen.',
  empty: 'Este es tu jardín. Cada página que resolvés planta una semilla acá.',
};

/** The garden, small: a bed with a sprout and a flower (the bar, the map). */
export function GardenIcon({ size = 46 }: { size?: number }) {
  return (
    <svg viewBox="-26 -30 52 44" width={size} height={size * 44 / 52} aria-hidden="true" className="doodle garden-icon">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round" stroke="#2b2622">
        <ellipse cx={0} cy={6} rx={23} ry={7} fill="#b08560" strokeWidth={2.2} />
        <path d="M-9,4 C-10,-2 -8,-6 -9,-10" fill="none" strokeWidth={1.8} />
        <path d="M-9,-8 q-6,-3 -8,-7 q5,0 8,5 M-9,-8 q6,-4 8,-8 q-5,0 -8,6" fill="#a4b86d" strokeWidth={1.4} />
        <path d="M8,4 C6,-6 10,-14 8,-20" fill="none" strokeWidth={1.8} />
        {[0, 1, 2, 3, 4].map((k) => { const a = (k / 5) * Math.PI * 2; return <circle key={k} cx={8 + Math.cos(a) * 4.4} cy={-22 + Math.sin(a) * 4.4} r={3.6} fill="#e7a3a0" strokeWidth={1.3} />; })}
        <circle cx={8} cy={-22} r={2.4} fill="#f0d27a" strokeWidth={1.1} />
      </g>
    </svg>
  );
}

/** What stands in the garden, sorted back to front by where it stands. */
type Drawn = { y: number; key: string; node: ReactNode };

/** The child's character standing in the garden: a living stage nested in the drawing. */
function GardenMe({ x, y }: { x: number; y: number }) {
  const player = usePlayer();
  const { ref } = useStage(player, { x: -58, y: -118, w: 116, h: 128 });
  const w = 96, h = w * 128 / 116;
  return <svg ref={ref} className="garden-me" x={x - w / 2} y={y - h * (118 / 128)} width={w} height={h} overflow="visible" data-player={player.def.id} />;
}

/** The row of who is still coming: each boss's reward as a silhouette, with the sheet it comes from. */
function Coming({ list }: { list: BossReward[] }) {
  if (!list.length) return null;
  return (
    <ol className="coming" aria-label="Lo que todavía va a llegar">
      {list.map((r) => (
        <li key={rewardKey(r)}>
          <button type="button" className="coming-card cut" data-coming={r.id} aria-label={comingSay(r)} onClick={(e) => {
            speak(comingSay(r));
            if (!REDUCED) e.currentTarget.animate([{ rotate: '0deg' }, { rotate: '-5deg' }, { rotate: '4deg' }, { rotate: '0deg' }], { duration: 420 });
          }}>
            <svg className="coming-art" viewBox="-70 -150 140 160" aria-hidden="true"><g filter="url(#silhouette)"><RewardArt r={r} /></g></svg>
            <svg className="coming-sheet" viewBox="-40 -48 80 96" aria-hidden="true">
              <StopArt n={r.sheet} look={r.sheet >= 10 ? 'stone' : 'page'} soon={false} mark="none" seed={r.sheet * 11} />
            </svg>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** A boss's special plant, drawn standing on (0, 0). */
export function RewardArt({ r }: { r: BossReward }) {
  return r.kind === 'plant' ? <RarePlantArt id={r.id} /> : null;
}

export function GardenPage({ preview }: { preview?: number }) {
  const p = useProgress();
  const rootRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const ghost = useGhost(rootRef);
  const g: Garden = useMemo(() => gardenOf(p, preview ?? p.seeds), [p, preview]);
  // the rewards that arrive in this visit: greeted once, then seen
  const [arriving] = useState(() => (preview != null ? [] : newArrivals(progress.get())));
  const line = [g.seeds ? LINES.garden : LINES.empty, ...arriving.map(arrivalSay)].join(' ');
  const [drag, setDrag] = useState<{ id: string; at: [number, number]; dx: number; dy: number } | null>(null);

  useEffect(() => {
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(line); }, 450);
    return () => { clearTimeout(t); off(); stopSpeaking(); };
    // once per visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!arriving.length) return;
    const t = setTimeout(() => progress.update((q) => markSeen(q, arriving.map(rewardKey))), REDUCED ? 0 : 3200);
    return () => clearTimeout(t);
  }, [arriving]);

  // ---------------------------------------------------------------- dragging a big plant to another spot
  const toGarden = (e: { clientX: number; clientY: number }): [number, number] | null => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [pt.x, pt.y];
  };
  const grab = (id: string, at: [number, number]) => (e: ReactPointerEvent) => {
    if (preview != null) return;
    const here = toGarden(e);
    if (!here) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    setDrag({ id, at, dx: here[0] - at[0], dy: here[1] - at[1] });
  };
  const move = (e: ReactPointerEvent) => {
    if (!drag) return;
    const here = toGarden(e);
    if (here) setDrag({ ...drag, at: inMeadow([here[0] - drag.dx, here[1] - drag.dy]) });
  };
  const drop = () => {
    if (!drag) return;
    const { id, at } = drag;
    setDrag(null);
    progress.update((q) => placeInGarden(q, id, at));
  };
  const spot = (id: string, x: number, y: number): [number, number] => (drag?.id === id ? drag.at : [x, y]);

  const drawn: Drawn[] = [];
  for (const b of g.beds) {
    drawn.push({
      y: b.y - 20 * b.s, key: `bed${b.i}`,
      node: (
        <g key={`bed${b.i}`}>
          <BedSoil x={b.x} y={b.y} s={b.s} i={b.i} open={b.open} />
          {b.plants.map((pl) => (
            <g key={pl.i} className={pl.i === g.seeds - 1 ? 'is-newest' : undefined}>
              <SeedPlant x={pl.x} y={pl.y} s={b.s} stage={pl.stage} color={pl.color} i={pl.i} />
            </g>
          ))}
        </g>
      ),
    });
  }
  for (const t of g.big) {
    const [x, y] = spot(t.id, t.x, t.y);
    drawn.push({
      y, key: t.id,
      node: (
        <g key={t.id} className={`garden-movable${drag?.id === t.id ? ' is-dragged' : ''}`} transform={`translate(${x} ${y})`} data-move={t.id} data-moved={t.moved || undefined} onPointerDown={grab(t.id, [t.x, t.y])}>
          <SheetPlant kind={t.kind} sheet={t.sheet} s={t.s} />
        </g>
      ),
    });
  }
  for (const r of g.rare) {
    const [x, y] = spot(r.id, r.x, r.y);
    drawn.push({
      y, key: r.id,
      node: (
        <g key={r.id} className={`garden-movable${drag?.id === r.id ? ' is-dragged' : ''}`} transform={`translate(${x} ${y})`} data-move={r.id} data-rare={r.id} onPointerDown={grab(r.id, [r.x, r.y])}>
          <g className={r.fresh ? 'is-arriving' : undefined} transform={`scale(${r.s})`}><RarePlantArt id={r.id} /></g>
        </g>
      ),
    });
  }
  g.pots.forEach((pt, i) => drawn.push({ y: pt.y, key: `pot${i}`, node: <GoldPot key={`pot${i}`} x={pt.x} y={pt.y} i={i} /> }));
  drawn.push({ y: g.me.y, key: 'me', node: <GardenMe key="me" x={g.me.x} y={g.me.y} /> });
  drawn.sort((a, b) => a.y - b.y);

  const coming = stillComing(p).filter((r) => r.kind === 'plant');
  const help = () => { ghost([{ do: 'point', at: coming.length ? ['.coming-card'] : ['.garden-movable', '.garden-me'] }]); };

  return (
    <main ref={rootRef} className="level mode-garden" data-seeds={g.seeds} data-preview={preview ?? undefined}>
      <Bar
        instruction={<span className="drawn-task" aria-hidden="true"><PlayerFace className="bar-face" /><ThenArrow /><GardenIcon size={46} /></span>}
        title={<><b>Mi jardín{preview != null ? ' · vista de prueba (dev)' : ''}</b> {g.seeds} {g.seeds === 1 ? 'semilla plantada' : 'semillas plantadas'}{g.pots.length ? ` · ${g.pots.length} ${g.pots.length === 1 ? 'flor dorada' : 'flores doradas'}` : ''}</>}
        pages={null}
        aside={<SeedPouch />}
        onSpeak={() => speak(line)}
        onHelp={help}
      />
      <section className="garden-stage" aria-label="Mi jardín">
        <div className="garden-col">
          <div className="sheet garden-sheet">
            <span className="tape tape-l" aria-hidden="true" />
            <span className="tape tape-r" aria-hidden="true" />
            <svg
              ref={svgRef} className={`garden-svg${drag ? ' is-dragging' : ''}`} viewBox={`0 0 ${GARDEN_W} ${GARDEN_H}`} role="img" aria-label={`Un jardín con ${g.seeds} plantas`}
              onPointerMove={move} onPointerUp={drop} onPointerCancel={drop}
            >
              <GardenScenery />
              {drawn.map((d) => d.node)}
            </svg>
          </div>
          <Coming list={coming} />
        </div>
        <a className="next-page cut garden-next" href={MAP_HREF} aria-label="Volver al mapa"><NextPageArt /></a>
      </section>
      <Quit href={MAP_HREF} />
    </main>
  );
}
