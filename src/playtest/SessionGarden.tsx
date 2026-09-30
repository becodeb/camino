// The goodbye's garden: the year's garden (curriculum/garden.ts, the same
// drawing pieces as GardenPage) grown from this session's seeds only, with
// what a boss sent if the child won one in free play, and the child's
// character standing in it wearing the outfit chosen in the wardrobe. Read
// only (nothing to drag), huddled round the first bed (the child beside it,
// a tree or a critter close by) and framed on it, so a session's ten or
// fifteen seeds fill the page instead of a corner of the year's meadow. The
// year's markers stay out: no sheet-number stake by a finished sheet's tree,
// no dotted spots in a bed for the seeds still to come.

import { useMemo, type ReactNode } from 'react';
import { GARDEN_H, GARDEN_W, gardenOf, type Garden } from '../curriculum/garden';
import { useProgress } from '../curriculum/progress';
import { CritterArt } from '../ui/critterArt';
import { BedSoil, GardenScenery, GoldPot, RarePlantArt, SeedPlant, SheetPlant } from '../ui/gardenArt';
import { GardenMe } from '../screens/GardenScreen';

type Box = [number, number, number, number];

/** The part of the garden to show: what grew and the child, with room around, 2:1, never closer than about 520 of its 1200 units. */
export function frameOf(g: Garden): Box {
  const boxes: Box[] = [[g.me.x - 70, g.me.y - 130, 140, 140]];
  for (const b of g.beds) if (b.plants.length) boxes.push([b.x - 80 * b.s, b.y - 70 * b.s, 160 * b.s, 100 * b.s]);
  for (const t of g.big) boxes.push([t.x - 60 * t.s, t.y - 140 * t.s, 120 * t.s, 146 * t.s]);
  for (const r of g.rare) boxes.push([r.x - 60 * r.s, r.y - 150 * r.s, 120 * r.s, 156 * r.s]);
  for (const c of g.critters) boxes.push([c.x - 76 * c.s, c.y - 128 * c.s, 152 * c.s, 138 * c.s]);
  for (const pt of g.pots) boxes.push([pt.x - 22, pt.y - 72, 44, 76]);
  const x0 = Math.min(...boxes.map((b) => b[0])), y0 = Math.min(...boxes.map((b) => b[1]));
  const x1 = Math.max(...boxes.map((b) => b[0] + b[2])), y1 = Math.max(...boxes.map((b) => b[1] + b[3]));
  const W = Math.min(GARDEN_W, Math.max((x1 - x0) * 1.15, (y1 - y0) * 2 * 1.15, 520)), H = W / 2;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return [Math.max(0, Math.min(GARDEN_W - W, cx - W / 2)), Math.max(0, Math.min(GARDEN_H - H, cy - H / 2)), W, H];
}

/** Spots around the first bed (dx, dy from it) for what a session can add: a finished sheet's tree, a boss's plant or critter. */
const NEAR_BIG: [number, number][] = [[-250, -16], [250, -26], [-390, 10], [390, 4]];
const NEAR_RARE: [number, number][] = [[-190, 56], [200, 60], [-320, 70]];
const NEAR_CRITTER: [number, number][] = [[175, 66], [-300, 76], [310, 76]];

/**
 * A session's garden huddled round its first bed: the child just left of
 * it, a tree, a plant or a critter close by (the year spreads them over the
 * whole meadow, far apart for a session's few), so the frame can be close.
 */
function huddled(g: Garden): Garden {
  const b = g.beds[0];
  if (!b) return g;
  const at = <T extends { x: number; y: number }>(list: T[], spots: [number, number][]) =>
    list.map((it, i) => (spots[i] ? { ...it, x: b.x + spots[i][0], y: b.y + spots[i][1] } : it));
  return {
    ...g,
    me: { x: b.x - 120 * b.s, y: b.y + 40 * b.s },
    big: at(g.big, NEAR_BIG),
    rare: at(g.rare, NEAR_RARE),
    critters: at(g.critters, NEAR_CRITTER),
  };
}

export function SessionGarden({ cheer }: { cheer: number }) {
  const p = useProgress();
  // the child stands by the first bed (the year puts them at the front left, far from a session's few plants)
  const g = useMemo(() => huddled(gardenOf(p)), [p]);
  const box = useMemo(() => frameOf(g), [g]);
  const drawn: { y: number; key: string; node: ReactNode }[] = [];
  for (const b of g.beds) {
    if (!b.plants.length && b.i > 0) continue;
    drawn.push({
      y: b.y - 20 * b.s, key: `bed${b.i}`,
      node: (
        <g key={`bed${b.i}`}>
          <BedSoil x={b.x} y={b.y} s={b.s} i={b.i} open={false} />
          {b.plants.map((pl) => (
            <g key={pl.i} className="pp-garden-plant" style={{ animationDelay: `${300 + pl.i * 110}ms` }}>
              <SeedPlant x={pl.x} y={pl.y} s={b.s} stage={pl.stage} color={pl.color} i={pl.i} />
            </g>
          ))}
        </g>
      ),
    });
  }
  for (const t of g.big) drawn.push({ y: t.y, key: t.id, node: <g key={t.id} transform={`translate(${t.x} ${t.y})`}><SheetPlant kind={t.kind} sheet={t.sheet} s={t.s} stake={false} /></g> });
  for (const r of g.rare) drawn.push({ y: r.y, key: r.id, node: <g key={r.id} transform={`translate(${r.x} ${r.y}) scale(${r.s})`}><RarePlantArt id={r.id} /></g> });
  g.pots.forEach((pt, i) => drawn.push({ y: pt.y, key: `pot${i}`, node: <GoldPot key={`pot${i}`} x={pt.x} y={pt.y} i={i} /> }));
  for (const c of g.critters) drawn.push({ y: c.y, key: c.id, node: <g key={c.id} transform={`translate(${c.x} ${c.y}) scale(${c.s})`} data-critter={c.id}><CritterArt id={c.id} /></g> });
  drawn.push({ y: g.me.y, key: 'me', node: <GardenMe key="me" x={g.me.x} y={g.me.y} cheer={cheer} /> });
  drawn.sort((a, b) => a.y - b.y);
  return (
    <svg className="pp-garden-svg" viewBox={box.map((v) => v.toFixed(1)).join(' ')} role="img" aria-label={`Un jardín con ${g.seeds} plantas`} data-seeds={g.seeds}>
      <GardenScenery />
      {drawn.map((d) => d.node)}
    </svg>
  );
}
