// The block editor on screen: the palette and the program hanging from the
// start block, in the notebook. Drag is the main gesture (pointer events:
// mouse and touch alike): from the palette into the program with a gap
// opening where it will land, inside the program to reorder, out of it to
// delete. A tap on a palette block adds it at the end, exactly like a drag
// (rule 10). Presentational: the level screen owns the program; this reports
// taps and resolved drops (game/editor.ts) and draws the marks it is given.
// Ported from habilidades (app/src/areas/algorithmic/ui/BlockEditor.tsx @
// 9b90d1d) without the event log and with the notebook's N lines.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { REDUCED } from '../ui/runtime';
import {
  DIMS, blockHeight, layoutProgram, refusal, removeAt, resolveDrop, sameSlot, slotAt, slotKey,
  type Block, type BlockRef, type Dims, type DragSource, type DropResult, type DropZone, type Layout, type Placed, type Slot,
} from '../game/editor';
import type { BlockLabel, PaletteBlock } from '../game/levels';
import { cardCount, type Program } from '../game/model';
import { BlockArt, Pips, Ring, SnapMarks, blockStyle, fillOf, isCond, refKey, type BlockLook } from './blocks';
import './blocks.css';

export interface Marks {
  /** The block being executed right now (refKey). */
  current?: string;
  /** Blocks already executed during this run. */
  done?: Set<string>;
  /** The block Brote bumped on: it shakes (bump `culpritN` to shake again). */
  culprit?: string;
  culpritN?: number;
  /** The program ran out before the goal: the first free line calls. */
  hintSlot?: boolean;
  /** …or, with a counted repeat, its number calls ("more times"). */
  hintCount?: number | null;
  /** Tape receiving new cards. */
  activeTape?: number | null;
  /** Tape pass shown during a run (and left on it afterwards: "it went round this many times"). */
  iteration?: { item: number; iter: number } | null;
  /** Several worlds: a strip of that sheet's tape stuck on the block that bumped there. */
  pins?: { key: string; tone: string }[];
}

export interface EditorProps {
  blocks: PaletteBlock[];
  /** How blocks carry their word (design rule 5); sala 5 blocks are pictures only. */
  label?: BlockLabel;
  program: Program;
  marks: Marks;
  /** Running or over: nothing reacts. */
  disabled: boolean;
  /** The notebook's lines: never more cards than this. */
  maxCards?: number;
  /** Bumps to shake the notebook (it is full). */
  shake?: number;
  /** A tapped block that did not fit: it drops onto the full page and falls off (bump `n` to replay). */
  refused?: { n: number; block: Block; from: DOMRect } | null;
  /** The ghost hand is working the notebook: nothing reacts, nothing dims. */
  inert?: boolean;
  onTapPalette: (block: Block, el: HTMLElement) => void;
  onTapBlock: (ref: BlockRef) => void;
  onTapeCount: (item: number) => void;
  onTapeActivate: (item: number | null) => void;
  onDragStart?: () => void;
  onDrop: (result: DropResult, src: DragSource) => void;
}

/** Big blocks for small hands: every target well over 48 px. */
export const DIMS_KIDS: Dims = { w: 104, h: 72, start: 72, arm: 62, spine: 24, foot: 30, cw: 160, condMouth: 44 };

/**
 * Long flat plans (1ro's 11 and 12 lines): the whole notebook must fit under
 * the bar of a 768 px screen without scrolling, so its lines get a little
 * shorter (76 × 46, still a wide target).
 */
export const DIMS_TIGHT: Dims = { w: 76, h: 46, start: 44, arm: 42, spine: 18, foot: 18, cw: 112, condMouth: 34 };

/** How big the blocks are drawn: big for small hands, smaller as the notebook holds more lines. */
export type BlockSize = 'kids' | 'compact' | 'tight';
export const sizeForRows = (rows: number): BlockSize => (rows > 10 ? 'tight' : rows > 7 ? 'compact' : 'kids');

/** The blocks' sizes for a grade: C-blocks with words ahead of their picture (2do) need a wider arm. */
export function dimsFor(label: BlockLabel, size: BlockSize = 'kids'): Dims {
  const d = size === 'tight' ? DIMS_TIGHT : size === 'compact' ? DIMS : DIMS_KIDS;
  return label === 'word-picture' ? { ...d, cw: size === 'kids' ? 180 : 150 } : d;
}

/**
 * The notebook's width for a level, fixed for the whole page so the board
 * never moves while the program grows: the widest block the palette can
 * make (a tape holding a "si" block, a tape, or a card), plus the margin, the
 * room a running block slides right, and its pen ring.
 */
export function notebookWidth(blocks: readonly PaletteBlock[], label: BlockLabel): number {
  const d = dimsFor(label);
  const cond = blocks.some((b) => isCond(b));
  const tape = blocks.some((b) => b === 'repeat' || b === 'repeat-goal');
  const inner = cond ? d.cw : d.w;
  const widest = tape ? Math.max(d.cw, d.spine + inner + 16) : cond ? d.cw : d.w;
  return 50 + widest + 16 + 30;
}

const THRESHOLD = 8;
const CUTS = ['13px 9px 15px 10px / 9px 14px 10px 15px', '10px 15px 9px 13px / 14px 9px 15px 10px'];

export const paletteBlock = (id: PaletteBlock): Block =>
  (id === 'repeat' ? { t: 'loop', count: 2, body: [] } : id === 'repeat-goal' ? { t: 'loop', count: 'goal', body: [] } : { t: 'cmd', cmd: id });

interface Pending { src: DragSource; el: HTMLElement; x0: number; y0: number; id: number }
interface Drag extends Pending { offX: number; offY: number; look: BlockLook; x: number; y: number }
interface Fly { key: number; look: BlockLook; x: number; y: number; to: { x: number; y: number } | null }

/** The palette and the program of one level, as two nodes for the two zones of the level screen. */
export function useBlockEditor(props: EditorProps): { palette: ReactNode; program: ReactNode } {
  const p = { ...props, label: props.label ?? 'picture' };
  const rows = p.program.reduce((n, it) => n + (it.t === 'cmd' ? 1 : it.body.length + 1), 0) + Math.max(0, (p.maxCards ?? 0) - cardCount(p.program));
  const size = sizeForRows(rows);
  const d: Dims = useMemo(() => dimsFor(p.label, size), [p.label, size]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const pending = useRef<Pending | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [gap, setGap] = useState<Slot | null>(null);
  const gapRef = useRef<Slot | null>(null);
  const [fly, setFly] = useState<Fly | null>(null);
  const [snap, setSnap] = useState<{ key: string; dx: number; dy: number; n: number } | null>(null);
  const propsRef = useRef(p);
  propsRef.current = p;

  // ---------------------------------------------------------------- looks
  const lookOf = useCallback((b: Block, dd: Dims): BlockLook => {
    if (b.t === 'loop') {
      const h = blockHeight(b, dd, isCond);
      return { kind: 'loop', w: dd.cw, h, mouth: h - dd.arm - dd.foot, count: b.count };
    }
    if (isCond(b.cmd)) return { kind: 'cond', cmd: b.cmd, fill: fillOf(b.cmd), w: dd.cw, h: blockHeight(b, dd, isCond), mouth: dd.condMouth };
    return { kind: 'cmd', cmd: b.cmd, fill: fillOf(b.cmd), w: dd.w, h: dd.h };
  }, []);

  // what the program shows: while a program block is dragged, the program without it
  const base = useMemo(() => (drag?.src.from === 'program' ? removeAt(p.program, drag.src.ref).program : p.program), [drag, p.program]);
  const free = p.maxCards != null ? Math.max(0, p.maxCards - cardCount(p.program)) : null;
  // while a notebook block is lifted, its line shows as free (it is not counted until dropped)
  const freeShown = free != null ? free + (drag?.src.from === 'program' ? cardCount([drag.src.block]) : 0) : null;
  const layout: Layout = useMemo(() => layoutProgram(base, {
    dims: d, isCond, gap, gapBlock: drag?.src.block ?? null,
    ...(freeShown != null ? { emptySlots: freeShown } : { endSlot: !drag }),
    activeTape: drag ? null : p.marks.activeTape,
  }), [base, d, gap, drag, freeShown, p.marks.activeTape]);
  const hitLayout = useMemo(() => layoutProgram(base, { dims: d, isCond }), [base, d]);
  const hitRef = useRef(hitLayout);
  hitRef.current = hitLayout;

  // ---------------------------------------------------------------- drag
  const zoneAt = (x: number, y: number): DropZone => {
    const z = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-zone]')?.dataset.zone;
    if (z === 'program' || z === 'palette' || z === 'stage' || z === 'bar') return z;
    // a little tolerance around the program zone (fingers are wide)
    const r = canvasRef.current?.closest('[data-zone="program"]')?.getBoundingClientRect();
    if (r && x > r.left - 30 && x < r.right + 30 && y > r.top - 30 && y < r.bottom + 40) return 'program';
    return 'outside';
  };

  const slotFor = (dr: Drag, x: number, y: number): Slot | null => {
    if (zoneAt(x, y) !== 'program') return null;
    const cr = canvasRef.current?.getBoundingClientRect();
    if (!cr) return null;
    const probe = y - dr.offY + Math.min(dr.look.h, d.h) / 2 - cr.top;
    const slot = slotAt(hitRef.current, probe, dr.src.block);
    const prog = dr.src.from === 'program' ? removeAt(propsRef.current.program, dr.src.ref).program : propsRef.current.program;
    return refusal(prog, slot, dr.src.block, { maxCards: dr.src.from === 'palette' ? propsRef.current.maxCards : undefined, moving: dr.src.from === 'program' }) ? null : slot;
  };

  const placeGhost = (x: number, y: number) => {
    const dr = dragRef.current;
    if (!dr || !ghostRef.current) return;
    dr.x = x;
    dr.y = y;
    ghostRef.current.style.transform = `translate(${x - dr.offX}px, ${y - dr.offY}px)`;
  };

  const begin = (pd: Pending, x: number, y: number) => {
    const r = pd.el.getBoundingClientRect();
    const look = lookOf(pd.src.block, d);
    const dr: Drag = { ...pd, offX: Math.min(x - r.left, look.w - 10), offY: Math.min(y - r.top, look.h - 10), look, x, y };
    dragRef.current = dr;
    setDrag(dr);
    propsRef.current.onDragStart?.();
  };

  const finish = (x: number, y: number, cancelled: boolean) => {
    const dr = dragRef.current;
    dragRef.current = null;
    pending.current = null;
    if (!dr) return;
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    const slot = cancelled ? null : slotFor(dr, x, y);
    const cur = propsRef.current;
    let res: DropResult = cancelled ? { program: null, outcome: 'cancel' } : resolveDrop(cur.program, dr.src, slot, { maxCards: cur.maxCards });
    // a full notebook: dropping from the palette onto it is refused, not silently lost
    if (!cancelled && dr.src.from === 'palette' && !slot && zoneAt(x, y) === 'program' && cur.maxCards != null && cardCount(cur.program) >= cur.maxCards) {
      res = { program: null, outcome: 'rejected', reason: 'full' };
    }
    const gx = x - dr.offX, gy = y - dr.offY;
    if (res.outcome === 'add' || res.outcome === 'move') {
      // the new block snaps from where the ghost was
      const s = slot!;
      const after = layoutProgram(res.program!, { dims: d, isCond });
      const at = after.items.find((it) => it.ref && refKey(it.ref) === refKey(s.tape != null ? { item: s.tape, inner: s.at } : { item: s.at }));
      const cr = canvasRef.current?.getBoundingClientRect();
      if (at && cr) setSnap((o) => ({ key: at.key, dx: gx - (cr.left + at.x), dy: gy - (cr.top + at.y), n: (o?.n ?? 0) + 1 }));
    } else if (!REDUCED) {
      // deleted: it falls and fades; not placed: it flies back to the palette
      const home = dr.src.from === 'palette' ? dr.el.getBoundingClientRect() : null;
      setFly({ key: performance.now(), look: dr.look, x: gx, y: gy, to: res.outcome === 'remove' ? null : home ? { x: home.left, y: home.top } : { x: gx, y: gy } });
    }
    gapRef.current = null;
    setGap(null);
    setDrag(null);
    cur.onDrop(res, dr.src);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const pd = pending.current;
      if (!pd || e.pointerId !== pd.id) return;
      if (!dragRef.current) {
        if (Math.hypot(e.clientX - pd.x0, e.clientY - pd.y0) < THRESHOLD) return;
        begin(pd, e.clientX, e.clientY);
      }
      e.preventDefault();
      placeGhost(e.clientX, e.clientY);
      const s = slotFor(dragRef.current!, e.clientX, e.clientY);
      if (!sameSlot(s, gapRef.current)) { gapRef.current = s; setGap(s); }
    };
    const up = (e: PointerEvent) => {
      const pd = pending.current;
      if (!pd || e.pointerId !== pd.id) return;
      if (dragRef.current) finish(e.clientX, e.clientY, false);
      pending.current = null;
    };
    const cancel = (e: PointerEvent) => {
      const pd = pending.current;
      if (!pd || e.pointerId !== pd.id) return;
      if (dragRef.current) finish(e.clientX, e.clientY, true);
      pending.current = null;
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    // the handlers read everything through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, lookOf]);

  const down = (src: DragSource) => (e: ReactPointerEvent<HTMLElement>) => {
    if (p.disabled || p.inert) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (pending.current) return;
    pending.current = { src, el: e.currentTarget, x0: e.clientX, y0: e.clientY, id: e.pointerId };
  };

  // the ghost follows the pointer from the first frame
  useLayoutEffect(() => {
    if (drag) placeGhost(drag.x, drag.y);
  }, [drag]);

  // snap: slide from the ghost into place, squash a little, two blue ticks
  useLayoutEffect(() => {
    if (!snap || REDUCED) return;
    const el = canvasRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(snap.key)}"]`);
    el?.animate([{ translate: `${snap.dx}px ${snap.dy}px` }, { translate: '0 0' }], { duration: 150, easing: 'cubic-bezier(.3,.6,.35,1)' });
    el?.animate([{ scale: '1' }, { scale: '1.06 0.92', offset: 0.55 }, { scale: '0.98 1.03', offset: 0.8 }, { scale: '1' }], { duration: 260, delay: 140, easing: 'ease-out' });
  }, [snap]);

  useEffect(() => {
    if (!fly) return;
    const t = setTimeout(() => setFly(null), 320);
    return () => clearTimeout(t);
  }, [fly]);

  useLayoutEffect(() => {
    if (!p.shake || REDUCED) return;
    canvasRef.current?.animate([{ translate: '0 0' }, { translate: '6px 0' }, { translate: '-6px 0' }, { translate: '0 0' }], { duration: 240 });
  }, [p.shake]);

  // a tapped block that does not fit: it lands on the last line of the full page and tips off
  const [bounce, setBounce] = useState<{ key: number; look: BlockLook; from: DOMRect; to: { x: number; y: number } } | null>(null);
  useLayoutEffect(() => {
    const r = p.refused;
    const cr = canvasRef.current?.getBoundingClientRect();
    if (!r || !cr || REDUCED) return;
    setBounce({ key: r.n, look: lookOf(r.block, d), from: r.from, to: { x: cr.left + 24, y: cr.top + layout.height - 18 } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.refused?.n]);
  useEffect(() => {
    if (!bounce) return;
    const t = setTimeout(() => setBounce(null), 1000);
    return () => clearTimeout(t);
  }, [bounce]);

  // the block Brote bumped on shakes, like it was the one that tripped him
  useLayoutEffect(() => {
    const k = p.marks.culprit;
    if (k == null || !p.marks.culpritN) return;
    const el = canvasRef.current?.querySelector<HTMLElement>(`[data-ref="${CSS.escape(k)}"]`);
    if (!el || REDUCED) return;
    el.animate([
      { rotate: '0deg' }, { rotate: '-7deg', offset: 0.15 }, { rotate: '6deg', offset: 0.35 }, { rotate: '-5deg', offset: 0.55 },
      { rotate: '3deg', offset: 0.75 }, { rotate: '0deg' },
    ], { duration: 720, easing: 'ease-out' });
  }, [p.marks.culprit, p.marks.culpritN]);

  const click = (fn: () => void) => () => {
    if (suppressClick.current || propsRef.current.inert) return;
    fn();
  };

  // ---------------------------------------------------------------- palette
  const palette = (
    <div className="block-palette can-drag" role="group" aria-label="Bloques">
      {p.blocks.map((id, i) => {
        const block = paletteBlock(id);
        const look = lookOf(block, d);
        return (
          <button
            key={id}
            type="button"
            className={`pblk${look.kind !== 'cmd' ? ' is-c' : ''}`}
            style={{ width: look.w, height: look.h, '--r-cut': CUTS[i % 2] } as CSSProperties}
            disabled={p.disabled}
            aria-label={`Bloque ${id}`}
            data-cmd={id}
            onPointerDown={down({ from: 'palette', block })}
            onClick={(e) => { const el = e.currentTarget; click(() => p.onTapPalette(block, el))(); }}
          >
            <BlockArt look={look} d={d} seed={i + 1} label={p.label} count={block.t === 'loop' && block.count !== 'goal' ? <span className="blk-count"><b>{block.count}</b></span> : null} />
          </button>
        );
      })}
    </div>
  );

  // ---------------------------------------------------------------- program
  const m = p.marks;
  const itemNode = (it: Placed, i: number) => {
    const style = blockStyle(it.x, it.y, it.w, it.h);
    if (it.kind === 'start') {
      return (
        <div key={it.key} data-key={it.key} className="blk blk-start" style={style} aria-label="Al empezar">
          <BlockArt look={{ kind: 'start', w: it.w, h: it.h }} d={d} />
        </div>
      );
    }
    if (it.kind === 'slot' || it.kind === 'gap') {
      const first = it.kind === 'slot' && it.slot!.tape == null && !!it.active;
      const hinted = first && !!m.hintSlot;
      const calls = first && p.program.length === 0 && !p.disabled;
      const cls = `blk blk-slot${it.kind === 'gap' ? ' is-gap' : ''}${it.active ? ' is-active' : ''}${hinted ? ' is-hinted' : ''}${calls ? ' is-calling' : ''}`;
      return (
        <div
          key={it.key}
          data-key={it.key}
          className={cls}
          style={style}
          aria-hidden={it.kind === 'gap' ? 'true' : undefined}
          onClick={it.kind === 'slot' && it.slot!.tape != null && !p.disabled ? click(() => p.onTapeActivate(it.slot!.tape ?? null)) : undefined}
          data-slot={slotKey(it.slot)}
        >
          <svg className="blk-shape" width={it.w} height={it.h} viewBox={`0 0 ${it.w} ${it.h}`} aria-hidden="true">
            <rect x={3} y={3} width={it.w - 6} height={it.h - 6} rx={9} className="blk-hole" />
          </svg>
          {hinted && <Ring seed={4} tone="hint" dur={480} />}
        </div>
      );
    }
    const ref = it.ref!;
    const k = refKey(ref);
    const blockNode = it.kind === 'loop' ? base[ref.item] : { t: 'cmd' as const, cmd: it.cmd! };
    const look = { ...lookOf(blockNode, d), w: it.w, h: it.h, ...(it.mouth != null ? { mouth: it.mouth } : {}) };
    const pins = (m.pins ?? []).filter((x) => x.key === k).map((x, j) => (
      <span key={x.tone} className="blk-pin" style={{ background: x.tone, right: -20, top: `calc(50% - 8px + ${j * 16}px)` } as CSSProperties} aria-hidden="true" />
    ));
    const src: DragSource = { from: 'program', ref, block: blockNode };
    const cls = ['blk', `blk-${look.kind}`];
    if (m.current === k || (it.kind === 'loop' && m.current?.startsWith(`${ref.item}:`))) cls.push('is-current');
    if (m.done?.has(k)) cls.push('is-done');
    if (m.culprit === k) cls.push('is-culprit');
    if (it.kind === 'loop' && m.activeTape === ref.item) cls.push('is-active');
    if (snap?.key === it.key) cls.push('is-snapped');
    const marks = (
      <>
        {it.kind !== 'loop' && m.current === k && <Ring seed={i + 3} />}
        {snap?.key === it.key && !REDUCED && <SnapMarks key={snap.n} w={it.w} />}
        {pins}
      </>
    );
    if (it.kind === 'loop') {
      const loop = blockNode as Extract<Block, { t: 'loop' }>;
      const count = loop.count === 'goal' ? null : (
        <button
          type="button"
          className={`blk-count tape-count${m.hintCount === ref.item ? ' is-calling' : ''}`}
          disabled={p.disabled}
          aria-label={`Repetir ${loop.count} veces. Tocar para cambiar.`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); if (!suppressClick.current && !propsRef.current.inert) p.onTapeCount(ref.item); }}
        >
          <b key={loop.count} className="count-digit">{loop.count}</b>
        </button>
      );
      return (
        <div
          key={it.key}
          data-key={it.key}
          data-ref={k}
          className={cls.join(' ')}
          style={style}
          role="button"
          tabIndex={p.disabled ? -1 : 0}
          aria-label="Bloque que repite. Tocar para poner bloques adentro."
          onPointerDown={down(src)}
          onClick={p.disabled ? undefined : click(() => p.onTapeActivate(m.activeTape === ref.item ? null : ref.item))}
        >
          <BlockArt look={look} d={d} seed={ref.item + 2} count={count} label={p.label} pips={false} />
          {marks}
        </div>
      );
    }
    return (
      <button
        key={it.key}
        data-key={it.key}
        data-ref={k}
        type="button"
        className={cls.join(' ')}
        style={style}
        disabled={p.disabled}
        aria-label={`Bloque ${it.cmd}`}
        onPointerDown={down(src)}
        onClick={click(() => p.onTapBlock(ref))}
      >
        <BlockArt look={look} d={d} seed={ref.item * 3 + (ref.inner ?? 0) + 3} label={p.label} />
        {marks}
      </button>
    );
  };

  const program = (
    <div className={`block-program${drag ? ' is-dragging' : ''}`}>
      <div ref={canvasRef} className="block-canvas" style={{ width: layout.width + 24, height: layout.height + 16 }}>
        {layout.items.filter((it) => it.kind === 'loop').map((it, i) => itemNode(it, i))}
        {layout.items.filter((it) => it.kind !== 'loop').map((it, i) => itemNode(it, i))}
        {/* the pass dots of each counted repeat, above its cards so the running one never hides them */}
        {layout.items.filter((it) => it.kind === 'loop' && typeof it.count === 'number').map((it) => {
          const iter = m.iteration?.item === it.ref!.item ? m.iteration.iter : null;
          return (
            <span key={`${it.key}/pips`} className="blk-foot-over" style={blockStyle(it.x, it.y + it.h - d.foot, it.w, d.foot)} data-pips={it.ref!.item}>
              <Pips count={it.count as number} passes={iter != null ? iter + 1 : 0} w={it.w} foot={d.foot} />
            </span>
          );
        })}
      </div>
      {drag && createPortal(
        <div ref={ghostRef} className="blk-ghost" style={{ width: drag.look.w, height: drag.look.h }} aria-hidden="true">
          <div className="blk-ghost-in"><BlockArt look={drag.look} d={d} label={p.label} count={countDisc(drag.look)} /></div>
        </div>,
        document.body,
      )}
      {fly && createPortal(<Flying key={fly.key} fly={fly} d={d} label={p.label} />, document.body)}
      {bounce && createPortal(<Bouncing key={bounce.key} b={bounce} d={d} label={p.label} />, document.body)}
    </div>
  );

  return { palette, program };
}

const countDisc = (look: BlockLook) => (typeof look.count === 'number' ? <span className="blk-count"><b>{look.count}</b></span> : null);

/** A block that did not fit: from the palette onto the full page's last line, a bump, and it tips off the page. */
function Bouncing({ b, d, label }: { b: { look: BlockLook; from: DOMRect; to: { x: number; y: number } }; d: Dims; label: BlockLabel }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { from, to } = b;
    el.animate([
      { translate: `${from.left}px ${from.top}px`, rotate: '0deg', opacity: 1 },
      { translate: `${to.x}px ${to.y - 30}px`, rotate: '-4deg', opacity: 1, offset: 0.4 },
      { translate: `${to.x}px ${to.y}px`, rotate: '0deg', scale: '1.08 0.9', opacity: 1, offset: 0.52 },
      { translate: `${to.x + 18}px ${to.y - 26}px`, rotate: '18deg', opacity: 1, offset: 0.68 },
      { translate: `${to.x + 60}px ${to.y + 90}px`, rotate: '70deg', opacity: 0 },
    ], { duration: 950, easing: 'cubic-bezier(.35,.1,.4,1)', fill: 'forwards' });
  }, [b]);
  return (
    <div ref={ref} className="blk-ghost is-flying is-refused" style={{ width: b.look.w, height: b.look.h }} aria-hidden="true">
      <BlockArt look={b.look} d={d} label={label} count={countDisc(b.look)} />
    </div>
  );
}

/** A block leaving: deleted (falls, turns, fades) or not placed (back to the palette). */
function Flying({ fly, d, label }: { fly: Fly; d: Dims; label: BlockLabel }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (fly.to) el.animate([{ translate: `${fly.x}px ${fly.y}px`, opacity: 1 }, { translate: `${fly.to.x}px ${fly.to.y}px`, opacity: 0.2 }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
    else el.animate([{ translate: `${fly.x}px ${fly.y}px`, rotate: '0deg', scale: 1, opacity: 1 }, { translate: `${fly.x}px ${fly.y - 18}px`, rotate: '14deg', scale: 0.9, opacity: 1, offset: 0.35 }, { translate: `${fly.x}px ${fly.y + 50}px`, rotate: '28deg', scale: 0.4, opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
  }, [fly]);
  return (
    <div ref={ref} className="blk-ghost is-flying" style={{ width: fly.look.w, height: fly.look.h, translate: `${fly.x}px ${fly.y}px` }} aria-hidden="true">
      <BlockArt look={fly.look} d={d} label={label} count={countDisc(fly.look)} />
    </div>
  );
}
