// The third automatic help (the solution hint): the way the page's solution
// walks, drawn on the board as ghost footprints in blue pen that appear one
// after the other from the start cell and fade. The child still builds the
// program; the footprints show where it has to take the character. Works on
// walking pages (one or several worlds, predict pages too); a song, a guarda
// or the rule game returns false and the caller shows the next-step hint.

import { simulate } from '../game/engine';
import { formatOf } from '../game/formats';
import type { LevelDef } from '../game/levels';
import { S } from '../ui/board/BoardView';

const PEN = '#3d6ea5';
const NS = 'http://www.w3.org/2000/svg';

/** One footprint (a small drawn sole and toes), pointing up, centred on 0,0; `k` scales it. */
function print(k: number, left: boolean): string {
  const sx = left ? -1 : 1;
  const sole = `M${-6 * k * sx},${6 * k} C${-9 * k * sx},${-2 * k} ${-5 * k * sx},${-9 * k} ${1 * k * sx},${-8 * k} C${6 * k * sx},${-7 * k} ${7 * k * sx},${1 * k} ${4 * k * sx},${8 * k} C${2 * k * sx},${12 * k} ${-4 * k * sx},${12 * k} ${-6 * k * sx},${6 * k} Z`;
  const toes = [[-5, -13], [0, -15.5], [5, -13.5]].map(([x, y]) => `M${(x + 1) * k * sx},${y * k} m${-2.2 * k},0 a${2.2 * k},${2.2 * k} 0 1,0 ${4.4 * k},0 a${2.2 * k},${2.2 * k} 0 1,0 ${-4.4 * k},0`).join(' ');
  return `${sole} ${toes}`;
}

export function showFootprints(root: HTMLElement, level: LevelDef, ms = 7000): boolean {
  if (level.music || level.guarda || level.mode !== 'program') return false;
  const program = formatOf(level) === 'predict' ? (level.given ?? level.solution) : level.solution;
  const boards = [...root.querySelectorAll<SVGSVGElement>('.sheet svg.board')];
  if (boards.length !== level.worlds.length) return false;
  const layer = document.createElement('div');
  layer.className = 'pp-prints';
  layer.setAttribute('aria-hidden', 'true');
  let placed = 0;
  level.worlds.forEach((board, w) => {
    const svg = boards[w];
    const m = svg.getScreenCTM();
    if (!m) return;
    const trace = simulate(board, program);
    const cells = [board.start, ...trace.steps.filter((s) => s.kind === 'move' || s.kind === 'jump').map((s) => s.to)];
    const scale = Math.hypot(m.a, m.b);
    const k = (S * scale) / 70;
    cells.slice(1).forEach((cell, i) => {
      const prev = cells[i];
      const angle = Math.atan2(cell.r - prev.r, cell.c - prev.c) * (180 / Math.PI) + 90;
      const p = new DOMPoint(cell.c * S + S / 2, cell.r * S + S / 2 + 8).matrixTransform(m);
      const el = document.createElementNS(NS, 'svg');
      const size = 44 * k;
      el.setAttribute('viewBox', `${-size / 2} ${-size / 2} ${size} ${size}`);
      el.setAttribute('class', 'pp-print');
      Object.assign(el.style, { left: `${p.x - size / 2}px`, top: `${p.y - size / 2}px`, width: `${size}px`, height: `${size}px`, animationDelay: `${i * 260}ms` });
      el.innerHTML = `<g transform="rotate(${angle.toFixed(1)})"><path d="${print(k, i % 2 === 0)}" fill="${PEN}" fill-opacity="0.55" stroke="${PEN}" stroke-width="${(1.6 * k).toFixed(2)}" stroke-linejoin="round" filter="url(#boil)"/></g>`;
      layer.append(el);
      placed++;
    });
  });
  if (!placed) return false;
  document.body.append(layer);
  setTimeout(() => layer.remove(), ms + placed * 260);
  return true;
}
