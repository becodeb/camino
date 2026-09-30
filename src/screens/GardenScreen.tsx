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
import { critterReward, rewardKey, rewardOf, BOSS_REWARDS, type BossReward } from '../curriculum/motivation';
import { markSeen, placeInGarden, progress, useProgress } from '../curriculum/progress';
import { arrivalSay, comingSay, newArrivals, stillComing } from '../curriculum/rewards';
import { MAP_HREF } from '../curriculum/route';
import { REDUCED } from '../ui/runtime';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { NextPageArt, PenRing, ThenArrow } from '../ui/art';
import { PlayIcon } from '../ui/icons';
import { penLoop } from '../ink/ink.js';
import type { Sheet } from '../curriculum/model';
import type { Progress } from '../curriculum/progress';
import { StopArt } from '../ui/forestArt';
import { BedSoil, GardenScenery, GoldPot, RarePlantArt, SeedPlant, SheetPlant } from '../ui/gardenArt';
import { CritterArt } from '../ui/critterArt';
import { Bar } from './LevelBar';
import { Quit, useGhost } from './levelKit';
import { PlayerFace, usePlayer, useStage } from './player';
import { SeedPouch, withSheetLine } from './yearKit';

const LINES = {
  garden: 'Este es tu jardín. Cada página que resolvés planta una semilla, y las semillas crecen.',
  empty: 'Este es tu jardín. Cada página que resolvés planta una semilla acá.',
  tour: 'Vamos a recorrer tu jardín.',
  tourEnd: '¡Qué lindo jardín!',
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

/** The child's character standing in the garden: a living stage nested in the drawing; `cheer` changing makes it celebrate (the tour's last stop). */
export function GardenMe({ x, y, cheer = 0, awake }: { x: number; y: number; cheer?: number; awake?: number }) {
  const player = usePlayer();
  const { ref, view } = useStage(player, { x: -58, y: -118, w: 116, h: 128 });
  useEffect(() => { if (cheer) void view.current?.cheer(false); }, [cheer, view]);
  // the tour keeps it awake (it dozes off after a while without anyone)
  useEffect(() => { if (awake != null && awake >= 0) view.current?.poke(); }, [awake, view]);
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
            <RewardSvg r={r} silhouette className="coming-art" />
            <svg className="coming-sheet" viewBox="-40 -48 80 96" aria-hidden="true">
              <StopArt n={r.sheet} look={r.sheet >= 10 ? 'stone' : 'page'} soon={false} mark="none" seed={r.sheet * 11} />
            </svg>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** A boss's reward, drawn standing on (0, 0): a special plant, or a critter without its home (a silhouette, a card). */
export function RewardArt({ r }: { r: BossReward }) {
  return r.kind === 'plant' ? <RarePlantArt id={r.id} /> : <CritterArt id={r.id} bare />;
}

/** The box round each reward drawn alone, so every one fills its card the same way. */
const REWARD_BOX: Record<BossReward['id'], string> = {
  coati: '-56 -106 112 110', lechuza: '-34 -62 68 66', zorro: '-30 -88 80 92', carpintero: '-30 -104 60 108', carpincho: '-66 -62 112 66', rana: '-34 -46 68 50',
  girasol: '-44 -162 88 166', hongos: '-62 -46 124 56', diente: '-38 -96 76 100', helecho: '-74 -86 148 90', juncos: '-42 -132 84 136', nenufar: '-38 -30 76 38', ceibo: '-42 -104 84 108',
};

/** A reward alone in a box of its own (x, y, width, height inside another drawing; a class in HTML), in colour or as a silhouette. */
export function RewardSvg({ r, silhouette, className, place }: { r: BossReward; silhouette?: boolean; className?: string; place?: { x: number; y: number; width: number; height: number } }) {
  return (
    <svg viewBox={REWARD_BOX[r.id]} preserveAspectRatio="xMidYMax meet" className={className} aria-hidden="true" overflow="visible" {...place}>
      {silhouette ? <g filter="url(#silhouette)"><RewardArt r={r} /></g> : <RewardArt r={r} />}
    </svg>
  );
}

/** A tap on a critter: it hops (wordless). */
function hop(el: Element) {
  const g = el.querySelector('.critter-hop');
  if (!g || REDUCED) return;
  g.animate([
    { translate: '0 0', scale: '1 1' }, { scale: '1.08 0.9', offset: 0.2 }, { translate: '0 -16px', scale: '0.94 1.08', offset: 0.5 },
    { translate: '0 0', scale: '1.06 0.94', offset: 0.8 }, { scale: '1 1' },
  ], { duration: 520, easing: 'cubic-bezier(.3,.6,.35,1)' });
}

/** The showcase's garden tour: whose sheet it is, its pages in the bar, where "next page" goes, what to do when it ends. */
export interface Tour { sheet: Sheet; pages: ReactNode; next: string; done: () => void }

export function GardenPage({ preview, tour }: { preview?: number; tour?: Tour }) {
  const p = useProgress();
  const rootRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const ghost = useGhost(rootRef);
  const g: Garden = useMemo(() => gardenOf(p, preview ?? p.seeds), [p, preview]);
  // the rewards that arrive in this visit: greeted once, then seen
  const [arriving] = useState(() => (preview != null ? [] : newArrivals(progress.get())));
  const line = tour ? LINES.tour : [g.seeds ? LINES.garden : LINES.empty, ...arriving.map(arrivalSay)].join(' ');
  const [drag, setDrag] = useState<{ id: string; at: [number, number]; dx: number; dy: number } | null>(null);
  const walk = useTourWalk(g, p, !!tour);

  useEffect(() => {
    if (tour) {
      // the tour starts by itself, after its line
      let off = () => {};
      const t0 = setTimeout(() => { off = speakWhenAllowed(withSheetLine(tour.sheet, LINES.tour)); }, 450);
      const t = setTimeout(() => { void walk.play().then((ended) => { if (ended) tour.done(); }); }, REDUCED ? 600 : 2600);
      return () => { clearTimeout(t0); clearTimeout(t); off(); walk.stop(); };
    }
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
    if (preview != null || tour) return;
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
  for (const c of g.critters) {
    drawn.push({
      y: c.y, key: c.id,
      node: (
        <g key={c.id} className={`critter-spot${c.fresh ? ' is-arriving' : ''}`} transform={`translate(${c.x} ${c.y})`} data-critter={c.id} data-fresh={c.fresh || undefined} onClick={(e) => hop(e.currentTarget)}>
          <g className="critter-in"><g className="critter-hop"><g transform={`scale(${c.s})`}><CritterArt id={c.id} /></g></g></g>
        </g>
      ),
    });
  }
  drawn.push({ y: g.me.y, key: 'me', node: <GardenMe key="me" x={g.me.x} y={g.me.y} cheer={walk.meAt} awake={tour ? walk.at : undefined} /> });
  drawn.sort((a, b) => a.y - b.y);

  const coming = tour ? [] : stillComing(p);
  const help = () => { ghost([{ do: 'point', at: tour ? ['.tour-play'] : coming.length ? ['.coming-card'] : ['.garden-movable', '.garden-me'] }]); };
  const count = `${g.seeds} ${g.seeds === 1 ? 'semilla plantada' : 'semillas plantadas'}${g.pots.length ? ` · ${g.pots.length} ${g.pots.length === 1 ? 'flor dorada' : 'flores doradas'}` : ''}`;

  return (
    <main ref={rootRef} className={`level mode-garden${tour ? ' is-tour' : ''}`} data-seeds={g.seeds} data-preview={preview ?? undefined} data-tour={tour ? walk.at : undefined}>
      <Bar
        instruction={<span className="drawn-task" aria-hidden="true"><PlayerFace className="bar-face" /><ThenArrow /><GardenIcon size={46} /></span>}
        title={tour
          ? <><b>Hoja {tour.sheet.n} · recorrido por el jardín</b> {count}</>
          : <><b>Mi jardín{preview != null ? ' · vista de prueba (dev)' : ''}</b> {count}</>}
        pages={tour?.pages ?? null}
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
              ref={svgRef} className={`garden-svg${drag ? ' is-dragging' : ''}`} viewBox={walk.viewBox} role="img" aria-label={`Un jardín con ${g.seeds} plantas`}
              onPointerMove={move} onPointerUp={drop} onPointerCancel={drop}
            >
              <GardenScenery />
              {drawn.map((d) => d.node)}
              {walk.ring && <path key={walk.at} className="tour-ring" d={walk.ring} pathLength={1} fill="none" stroke="#3d6ea5" strokeWidth={3.6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
            </svg>
          </div>
          {tour
            ? (
              <button type="button" className="btn btn-play cut tour-play" onClick={() => { if (!walk.playing) void walk.play().then((ended) => { if (ended) tour.done(); }); }} disabled={walk.playing} aria-label="Recorrer el jardín otra vez">
                <PlayIcon /><span>Recorrer</span>
              </button>
            )
            : <Coming list={coming} />}
        </div>
        <a className="next-page cut garden-next" href={tour?.next ?? MAP_HREF} aria-label={tour ? 'Volver a la muestra' : 'Volver al mapa'}><NextPageArt /></a>
      </section>
      <Quit href={MAP_HREF} />
    </main>
  );
}

// ------------------------------------------------------------------ what a boss sends, on its page

/**
 * On a boss's page, next to its controls: a taped card with what the boss
 * sends to the garden, known in advance. A silhouette while the boss waits;
 * won, the card turns and the critter or the plant shows in colour. A tap
 * says it.
 */
export function RewardCard({ sheet, won, fresh }: { sheet: number; won: boolean; fresh?: boolean }) {
  const r = rewardOf(sheet);
  if (!r) return null;
  const say = won ? arrivalSay(r) : comingSay(r);
  return (
    <button type="button" className={`reward-card cut${won ? ' is-won' : ''}${fresh ? ' is-fresh' : ''}`} data-reward={r.id} data-won={won || undefined} aria-label={say} onClick={() => speak(say)}>
      <span className="reward-tape" aria-hidden="true" />
      <RewardSvg r={r} silhouette={!won} className="reward-art" />
      {won && fresh && <PenRingSvg />}
    </button>
  );
}

function PenRingSvg() {
  return <PenRing seed={21} />;
}

// ------------------------------------------------------------------ the garden tour (the showcase)

type Box = [number, number, number, number];
interface TourStop { box: Box; line: string }

const union = (boxes: Box[]): Box => {
  const x0 = Math.min(...boxes.map((b) => b[0])), y0 = Math.min(...boxes.map((b) => b[1]));
  const x1 = Math.max(...boxes.map((b) => b[0] + b[2])), y1 = Math.max(...boxes.map((b) => b[1] + b[3]));
  return [x0, y0, x1 - x0, y1 - y0];
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What the tour stops at, in order: the beds, the gold flowers, the trees, each critter, the special plants, the child. */
function tourStops(g: Garden): TourStop[] {
  const out: TourStop[] = [];
  const full = g.beds.filter((b) => b.plants.length);
  out.push(full.length
    ? { box: union(full.map((b) => [b.x - 78 * b.s, b.y - 66 * b.s, 156 * b.s, 96 * b.s] as Box)), line: `Plantaste ${g.seeds} ${g.seeds === 1 ? 'semilla' : 'semillas'}: cada flor es una página que resolviste.` }
    : { box: [g.beds[0].x - 90, g.beds[0].y - 50, 180, 90], line: 'Acá vas a plantar tus semillas: cada página que resolvés es una flor.' });
  if (g.pots.length) out.push({ box: union(g.pots.map((pt) => [pt.x - 22, pt.y - 72, 44, 76] as Box)), line: 'Estas flores doradas son las páginas donde ahorraste bloques.' });
  if (g.big.length) out.push({ box: union(g.big.map((b) => [b.x - 50 * b.s, b.y - 130 * b.s, 100 * b.s, 136 * b.s] as Box)), line: g.big.length === 1 ? 'Este árbol creció cuando terminaste una hoja.' : 'Cada árbol y cada arbusto creció cuando terminaste una hoja.' });
  for (const c of g.critters) {
    const r = critterReward(c.id);
    out.push({ box: [c.x - 76 * c.s, c.y - 128 * c.s, 152 * c.s, 138 * c.s], line: `${cap(r.name)} llegó cuando ganaste el desafío de la hoja ${r.sheet}.` });
  }
  if (g.rare.length) {
    const one = BOSS_REWARDS.find((r) => r.kind === 'plant' && r.id === g.rare[0].id)!;
    out.push({
      box: union(g.rare.map((r) => [r.x - 60 * r.s, r.y - 150 * r.s, 120 * r.s, 156 * r.s] as Box)),
      line: g.rare.length === 1 ? `${cap(one.name)}: te lo mandó el desafío de la hoja ${one.sheet}.` : 'Estas plantas especiales te las mandaron los desafíos.',
    });
  }
  out.push({ box: [g.me.x - 70, g.me.y - 124, 140, 134], line: 'Y acá estás vos, en tu jardín.' });
  return out;
}

const FULL: Box = [0, 0, GARDEN_W, GARDEN_H];
const clampBox = ([x, y, w, h]: Box): Box => {
  // never closer than about twice the garden: it stays a garden, not a close-up
  const W = Math.min(GARDEN_W, Math.max(w * 1.35, h * 2 * 1.35, 580)), H = W / 2;
  const cx = x + w / 2, cy = y + h / 2;
  return [Math.max(0, Math.min(GARDEN_W - W, cx - W / 2)), Math.max(0, Math.min(GARDEN_H - H, cy - H / 2)), W, H];
};

/**
 * The tour's camera: the garden's viewBox glides to each stop in turn, a pen
 * ring is drawn round it and its line is said; at the end it glides back.
 * `play` resolves true when the whole tour was walked.
 */
function useTourWalk(g: Garden, p: Progress, active: boolean) {
  const [vb, setVb] = useState<Box>(FULL);
  const [ring, setRing] = useState<{ d: string; at: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const run = useRef(0);
  const cur = useRef<Box>(FULL);
  const gRef = useRef(g);
  gRef.current = g;
  void p;
  const glide = (to: Box, ms: number, id: number) => new Promise<boolean>((resolve) => {
    const from = cur.current, t0 = performance.now();
    const step = (t: number) => {
      if (run.current !== id) { resolve(false); return; }
      const k = REDUCED ? 1 : Math.min(1, (t - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const b = from.map((v, i) => v + (to[i] - v) * e) as Box;
      cur.current = b;
      setVb(b);
      if (k < 1) requestAnimationFrame(step); else resolve(true);
    };
    requestAnimationFrame(step);
  });
  const wait = (ms: number, id: number) => new Promise<boolean>((r) => setTimeout(() => r(run.current === id), REDUCED ? Math.min(ms, 600) : ms));
  const stop = () => { run.current++; setPlaying(false); setRing(null); stopSpeaking(); };
  const play = async (): Promise<boolean> => {
    if (!active) return false;
    const id = ++run.current;
    setPlaying(true);
    const stops = tourStops(gRef.current);
    for (const [i, s] of stops.entries()) {
      if (!(await glide(clampBox(s.box), 1000, id))) return false;
      // the ring stays inside the garden (a critter at the front: its ring does not run off the page)
      const [x, y0, w, h0] = s.box, y1 = Math.min(y0 + h0, GARDEN_H - 22), y = Math.max(8, y0), h = y1 - y;
      setRing({ d: penLoop(x + w / 2, y + h / 2, w / 2 + 16, h / 2 + 10, { seed: i + 3 }), at: i });
      speak(s.line);
      if (!(await wait(900 + s.line.length * 62, id))) return false;
    }
    setRing(null);
    if (!(await glide(FULL, 1000, id))) return false;
    speak(LINES.tourEnd);
    setPlaying(false);
    return true;
  };
  useEffect(() => () => { run.current++; }, []);
  // the last stop is the child: it celebrates there
  const meAt = ring && ring.at === tourStops(gRef.current).length - 1 ? run.current : 0;
  return { viewBox: vb.map((v) => v.toFixed(1)).join(' '), ring: ring?.d ?? null, at: ring?.at ?? -1, playing, play, stop, meAt };
}
