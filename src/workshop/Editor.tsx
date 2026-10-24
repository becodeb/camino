// The Workshop's editor (T40): Scratch's palette on the left (category
// dots, then every block in Spanish) and the selected sprite's free
// workspace in the middle, on squared notebook paper.
//
// Pointer events everywhere (mouse, touch, pen), with `touch-action: none`
// on the workspace and the palette's blocks (T25's lesson: a touchscreen
// must never turn a drag into a scroll). The gesture is followed on the
// window once it starts, so it never depends on the element under the
// finger (the picked-up block leaves the workspace at once).
//
// - A block dragged from the palette is a new block. A block dragged in the
//   workspace takes its whole stack when it is the stack's top (a hat or the
//   first block), the block and everything below it when it is in the middle,
//   a reporter alone out of its slot (model.ts `pickUp`).
// - While dragging, the gray shadow shows exactly where it will go: the
//   workspace draws `applyDrop` with the shadow, the same call the drop makes.
// - Dropped on the palette: deleted. On a sprite's card (the parent's
//   `spriteAt`): copied to that sprite, and the original stays (Scratch).
//   Outside the workspace: nothing changes.
// - Dragging the paper pans; the wheel or the trackpad scrolls; "centrar"
//   brings the scripts back; "ordenar" lines them up.
// - A tap on a number opens a big number pad (the keyboard types too), on a
//   dropdown a list of big options, on a text a keyboard field. A long press
//   (or the right button) on a block: "duplicar" and "borrar".

import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DEBUG } from '../screens/levelKit';
import { CATS, catOf, type Cat, type MenuKind, type Op } from './blocks';
import { BlockPicture, StackG } from './BlockSvg';
import {
  allLayouts, applyDrop, boundsOf, cloneBlock, copyStackTo, countBlocks, deleteFrom, duplicateFrom, findBlock, findDrop, layoutList, layoutStack, pickUp, setInput,
  spriteById, tidy, withStacks, type Block, type LayoutCtx, type Project, type Stack, type Target,
} from './model';
import { menuOptions, paletteFor, type Option, type PaletteItem } from './menus';
import { IconCenter, IconDup, IconTidy, IconTrash } from './icons';

import type { EditAction, EditInfo } from './progress';
export type { EditAction, EditInfo };

export interface EditorProps {
  project: Project;
  spriteId: string;
  ctx: LayoutCtx;
  onChange(p: Project, e: EditInfo): void;
  /** Help level 2: a category and its blocks glow in the palette. */
  paletteGlow?: { cat: Cat; ops: readonly Op[] } | null;
  /** Workspace blocks that glow or dim (help, the investigate question). */
  wsGlow?: ReadonlySet<string>;
  wsDim?: ReadonlySet<string>;
  /** The investigate question is on: a tap on a block answers it. */
  investigate?: ((blockId: string, op: Op) => void) | null;
  /** Which sprite card is under a point (a script dropped there is copied to it). */
  spriteAt?(x: number, y: number): string | null;
  onSpriteHover?(id: string | null): void;
  /** Something lies over the editor (the goal card): no input. */
  disabled?: boolean;
  /** Above the paper, inside the workspace column (the goal note). */
  header?: ReactNode;
}

const PAL_SCALE = 0.86;
const PAL_PAD = 6;
const MOVE_PX = 6;
const LONG_MS = 600;

interface DragView {
  blocks: Block[];
  /** The stacks with the dragged blocks taken out. */
  base: Stack[];
  from: 'palette' | 'stack' | 'middle' | 'slot';
  target: Target | null;
  overDelete: boolean;
  overSprite: string | null;
  inside: boolean;
  /** Where the blocks' top-left is, in workspace pixels. */
  at: { x: number; y: number };
}

type Gesture =
  | { kind: 'ws'; id: string; x0: number; y0: number; field: { name: string; type: string; menu?: MenuKind; el: Element } | null; timer: number; long: boolean }
  | { kind: 'pal'; item: PaletteItem; x0: number; y0: number; offX: number; offY: number }
  | { kind: 'pan'; x0: number; y0: number; sx0: number; sy0: number; moved: boolean }
  | { kind: 'drag'; offX: number; offY: number };

interface FieldPop { kind: 'num' | 'text'; blockId: string; name: string; value: string; rect: DOMRect; fresh: boolean }
type Popover =
  | FieldPop
  | { kind: 'menu'; blockId: string; name: string; options: Option[]; rect: DOMRect; value: string }
  | { kind: 'context'; x: number; y: number; blockId: string | null };

const targetKey = (t: Target | null) => (t ? `${t.kind}:${'id' in t ? t.id : t.stack}:${'m' in t ? t.m : ''}:${'name' in t ? t.name : ''}` : '');

export function Editor(props: EditorProps) {
  const { project, spriteId, ctx } = props;
  const sprite = spriteById(project, spriteId);
  const stacks = sprite?.stacks ?? [];
  const propsRef = useRef(props);
  propsRef.current = props;
  const wsRef = useRef<HTMLDivElement>(null);
  const palRef = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState<Record<string, { x: number; y: number }>>({});
  const scroll = scrolls[spriteId] ?? { x: 0, y: 0 };
  const scrollRef = useRef(scroll);
  scrollRef.current = scroll;
  const setScroll = (s: { x: number; y: number }) => setScrolls((m) => ({ ...m, [propsRef.current.spriteId]: { x: Math.round(s.x), y: Math.round(s.y) } }));
  const [drag, setDrag] = useState<DragView | null>(null);
  const dragRef = useRef<DragView | null>(null);
  dragRef.current = drag;
  const gesture = useRef<Gesture | null>(null);
  const [pop, setPop] = useState<Popover | null>(null);

  // ---------------------------------------------------------------- geometry

  // A pointer-capture gesture can still deliver a trailing event after the editor unmounts
  // (e.g. a step change mid-drag): fall back to a zero rect instead of crashing on a null ref.
  const wsPoint = (cx: number, cy: number) => {
    const r = wsRef.current?.getBoundingClientRect();
    return { x: cx - (r?.left ?? 0) + scrollRef.current.x, y: cy - (r?.top ?? 0) + scrollRef.current.y };
  };
  const inRect = (el: Element | null, x: number, y: number) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  // ---------------------------------------------------------------- the drag

  const frame = useRef(0);
  const last = useRef({ x: 0, y: 0 });
  const moveOverlay = (x: number, y: number, offX: number, offY: number) => {
    const el = overlayRef.current;
    if (el) el.style.transform = `translate3d(${x - offX}px, ${y - offY}px, 0)`;
  };
  const updateTarget = () => {
    frame.current = 0;
    const d = dragRef.current;
    const gst = gesture.current;
    if (!d || gst?.kind !== 'drag') return;
    const { x, y } = last.current;
    const at = wsPoint(x - gst.offX, y - gst.offY);
    const overDelete = inRect(palRef.current, x, y);
    const overSprite = propsRef.current.spriteAt?.(x, y) ?? null;
    const inside = inRect(wsRef.current, x, y) && !overDelete;
    const target = inside ? findDrop(d.base, d.blocks, at, ctx) : null;
    if (overSprite !== d.overSprite) propsRef.current.onSpriteHover?.(overSprite);
    if (targetKey(target) !== targetKey(d.target) || overDelete !== d.overDelete || overSprite !== d.overSprite || inside !== d.inside) {
      setDrag({ ...d, target, overDelete, overSprite, inside, at });
    } else {
      d.at = at;
    }
  };

  const startDrag = (blocks: Block[], base: Stack[], from: DragView['from'], offX: number, offY: number, x: number, y: number) => {
    gesture.current = { kind: 'drag', offX, offY };
    last.current = { x, y };
    const view: DragView = { blocks, base, from, target: null, overDelete: false, overSprite: null, inside: true, at: wsPoint(x - offX, y - offY) };
    dragRef.current = view;
    setDrag(view);
    requestAnimationFrame(() => { moveOverlay(last.current.x, last.current.y, offX, offY); updateTarget(); });
  };

  const finishDrag = (cancel: boolean) => {
    const d = dragRef.current;
    const gst = gesture.current;
    setDrag(null);
    dragRef.current = null;
    propsRef.current.onSpriteHover?.(null);
    if (!d || gst?.kind !== 'drag' || cancel) return;
    const { x, y } = last.current;
    const p = propsRef.current;
    const at = wsPoint(x - gst.offX, y - gst.offY);
    const info = (action: EditAction): EditInfo => ({ action, op: d.blocks[0].op, sprite: p.spriteId, stack_size: countBlocks(d.blocks) });
    if (inRect(palRef.current, x, y)) {
      if (d.from !== 'palette') p.onChange(withStacks(p.project, p.spriteId, d.base), info('delete'));
      return;
    }
    const to = p.spriteAt?.(x, y) ?? null;
    if (to && to !== p.spriteId) {
      p.onChange(copyStackTo(p.project, to, d.blocks, ctx), info('copy'));
      return;
    }
    if (!inRect(wsRef.current, x, y)) return; // let go outside: as it was
    const target = findDrop(d.base, d.blocks, at, ctx);
    const out = applyDrop(d.base, d.blocks, target, at, ctx);
    p.onChange(withStacks(p.project, p.spriteId, out), info(d.from === 'palette' ? 'add' : d.from === 'stack' ? 'move' : 'detach'));
  };

  // ---------------------------------------------------------------- the pointer

  const onMove = (e: PointerEvent) => {
    const gst = gesture.current;
    if (!gst) return;
    last.current = { x: e.clientX, y: e.clientY };
    if (gst.kind === 'drag') {
      moveOverlay(e.clientX, e.clientY, gst.offX, gst.offY);
      if (!frame.current) frame.current = requestAnimationFrame(updateTarget);
      return;
    }
    if (gst.kind === 'pan') {
      const dx = e.clientX - gst.x0, dy = e.clientY - gst.y0;
      if (Math.abs(dx) + Math.abs(dy) > 2) gst.moved = true;
      setScroll({ x: gst.sx0 - dx, y: gst.sy0 - dy });
      return;
    }
    if (Math.hypot(e.clientX - gst.x0, e.clientY - gst.y0) < MOVE_PX) return;
    if (gst.kind === 'pal') {
      startDrag([gst.item.make()], stacks0(), 'palette', gst.offX, gst.offY, e.clientX, e.clientY);
      return;
    }
    // a workspace block: picked up
    clearTimeout(gst.timer);
    if (gst.long) return;
    const p = propsRef.current;
    const st = spriteById(p.project, p.spriteId)?.stacks ?? [];
    const pu = pickUp(st, gst.id, ctx);
    if (!pu) { gesture.current = null; return; }
    const at = wsPoint(gst.x0, gst.y0);
    startDrag(pu.dragged, pu.stacks, pu.from, at.x - pu.at.x, at.y - pu.at.y, e.clientX, e.clientY);
  };
  const stacks0 = () => spriteById(propsRef.current.project, propsRef.current.spriteId)?.stacks ?? [];

  const onUp = (e: PointerEvent) => {
    const gst = gesture.current;
    detach();
    if (!gst) return;
    if (gst.kind === 'drag') { last.current = { x: e.clientX, y: e.clientY }; finishDrag(e.type === 'pointercancel'); gesture.current = null; return; }
    gesture.current = null;
    if (e.type === 'pointercancel') return;
    if (gst.kind === 'ws') {
      clearTimeout(gst.timer);
      if (gst.long) return;
      tap(gst.id, gst.field);
    }
  };
  const listening = useRef(false);
  const attach = () => {
    if (listening.current) return;
    listening.current = true;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
  const detach = () => {
    listening.current = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { detach(); cancelAnimationFrame(frame.current); }, []);

  const wsDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (props.disabled || e.button > 0 || gesture.current) return;
    setPop(null);
    const t = e.target as Element;
    const blk = t.closest('[data-block]');
    if (blk) {
      const f = t.closest('[data-field]');
      const field = f ? { name: f.getAttribute('data-field')!, type: f.getAttribute('data-type')!, menu: (f.getAttribute('data-menu') ?? undefined) as MenuKind | undefined, el: f } : null;
      const id = blk.getAttribute('data-block')!;
      const g: Extract<Gesture, { kind: 'ws' }> = {
        kind: 'ws', id, x0: e.clientX, y0: e.clientY, field, long: false,
        timer: window.setTimeout(() => {
          if (gesture.current !== g || props.investigate) return;
          g.long = true;
          setPop({ kind: 'context', x: g.x0, y: g.y0, blockId: id });
        }, LONG_MS),
      };
      gesture.current = g;
    } else {
      gesture.current = { kind: 'pan', x0: e.clientX, y0: e.clientY, sx0: scrollRef.current.x, sy0: scrollRef.current.y, moved: false };
    }
    attach();
    e.preventDefault();
  };
  const palDown = (item: PaletteItem) => (e: RPointerEvent<HTMLDivElement>) => {
    if (props.disabled || e.button > 0 || gesture.current) return;
    setPop(null);
    const r = e.currentTarget.getBoundingClientRect();
    gesture.current = { kind: 'pal', item, x0: e.clientX, y0: e.clientY, offX: (e.clientX - r.left) / PAL_SCALE - PAL_PAD, offY: (e.clientY - r.top) / PAL_SCALE - PAL_PAD };
    attach();
    e.preventDefault();
  };

  const tap = (id: string, field: Extract<Gesture, { kind: 'ws' }>['field']) => {
    const p = propsRef.current;
    if (p.investigate) {
      const w = findBlock(stacks0(), id);
      if (w) p.investigate(id, w.block.op);
      return;
    }
    if (!field) return;
    const w = findBlock(stacks0(), id);
    if (!w) return;
    const slot = w.block.in[field.name];
    const rect = field.el.getBoundingClientRect();
    if (field.type === 'menu' && field.menu) {
      setPop({ kind: 'menu', blockId: id, name: field.name, options: menuOptions(field.menu, p.project, spriteById(p.project, p.spriteId)), rect, value: slot?.v ?? '' });
    } else if (field.type === 'num' || field.type === 'text') {
      setPop({ kind: field.type, blockId: id, name: field.name, value: slot?.v ?? '', rect, fresh: true });
    }
  };

  const setValue = (blockId: string, name: string, v: string) => {
    const p = propsRef.current;
    const st = stacks0();
    const w = findBlock(st, blockId);
    p.onChange(withStacks(p.project, p.spriteId, setInput(st, blockId, name, v)), { action: 'input', op: w?.block.op ?? 'flag', sprite: p.spriteId, stack_size: 1 });
  };

  const onContext = (e: React.MouseEvent) => {
    e.preventDefault();
    if (props.disabled || props.investigate) return;
    const blk = (e.target as Element).closest('[data-block]');
    setPop({ kind: 'context', x: e.clientX, y: e.clientY, blockId: blk?.getAttribute('data-block') ?? null });
  };
  const duplicate = (id: string) => {
    const p = propsRef.current;
    const d = duplicateFrom(stacks0(), id, ctx);
    if (!d) return;
    p.onChange(withStacks(p.project, p.spriteId, d.stacks), { action: 'duplicate', op: d.stack.blocks[0].op, sprite: p.spriteId, stack_size: countBlocks(d.stack.blocks) });
  };
  const remove = (id: string) => {
    const p = propsRef.current;
    const w = findBlock(stacks0(), id);
    const pu = pickUp(stacks0(), id, ctx);
    p.onChange(withStacks(p.project, p.spriteId, deleteFrom(stacks0(), id, ctx)), { action: 'delete', op: w?.block.op ?? 'flag', sprite: p.spriteId, stack_size: pu ? countBlocks(pu.dragged) : 1 });
  };

  // the wheel and the trackpad scroll the paper (a non-passive listener: the page itself must not scroll)
  useEffect(() => {
    const el = wsRef.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      e.preventDefault();
      const s = scrollRef.current;
      setScroll({ x: s.x + (e.shiftKey ? e.deltaY : e.deltaX), y: s.y + (e.shiftKey ? 0 : e.deltaY) });
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const center = () => {
    const b = boundsOf(stacks, ctx);
    setScroll(b ? { x: b.x - 24, y: b.y - 24 } : { x: 0, y: 0 });
  };
  const order = () => {
    const p = propsRef.current;
    p.onChange(withStacks(p.project, p.spriteId, tidy(stacks0(), ctx)), { action: 'move', op: stacks0()[0]?.blocks[0]?.op ?? 'flag', sprite: p.spriteId, stack_size: 0 });
    setScroll({ x: 0, y: 0 });
  };

  // ---------------------------------------------------------------- drawing

  const shadowIds = useRef(new Set<string>());
  const shown = useMemo(() => {
    if (!drag) return { stacks, shadow: undefined as ReadonlySet<string> | undefined };
    if (!drag.target || !drag.inside) return { stacks: drag.base, shadow: undefined };
    const ghost = drag.blocks.map(cloneBlock);
    const ids = new Set<string>();
    const walk = (bs: Block[]) => bs.forEach((b) => { ids.add(b.id); Object.values(b.in).forEach((s) => s.r && walk([s.r])); b.subs?.forEach(walk); });
    walk(ghost);
    shadowIds.current = ids;
    return { stacks: applyDrop(drag.base, ghost, drag.target, drag.at, ctx), shadow: ids as ReadonlySet<string> };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.target, drag?.inside, drag?.base, stacks, ctx]);
  const layouts = useMemo(() => shown.stacks.map((st) => layoutStack(st, ctx)), [shown.stacks, ctx]);
  const opts = useMemo(() => ({ shadow: shown.shadow, glow: props.wsGlow, dim: props.wsDim }), [shown.shadow, props.wsGlow, props.wsDim]);

  const dragItems = useMemo(() => (drag ? layoutList(drag.blocks, 0, 0, ctx) : null), [drag?.blocks, ctx]); // eslint-disable-line react-hooks/exhaustive-deps

  // the scripted checks read where every block is drawn (client pixels), to drag for real
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __wsEditor?: unknown }).__wsEditor = {
      blocks: () => {
        const r = wsRef.current?.getBoundingClientRect();
        if (!r) return [];
        const s = scrollRef.current;
        const X = (x: number) => x - s.x + r.left, Y = (y: number) => y - s.y + r.top;
        return layouts.flatMap((sl) => [...allLayouts(sl.items)].map((l) => ({
          id: l.block.id, op: l.block.op, stack: sl.stack.id, x: X(l.x), y: Y(l.y), w: l.w, h: l.h, rowH: l.rowH, rowY: Y(l.rowY),
          mouths: l.mouths.map((m) => ({ x: X(m.x), y: Y(m.y), n: m.items.length })),
          inputs: l.parts.filter((p) => p.input).map((p) => ({ name: p.input, kind: p.kind, x: X(p.x), y: Y(p.y), w: p.w, h: p.h, text: p.text ?? null })),
        })));
      },
      scroll: () => scrollRef.current,
      paper: () => wsRef.current?.getBoundingClientRect().toJSON() ?? null,
    };
  });

  const paper: CSSProperties = { backgroundPosition: `${-scroll.x}px ${-scroll.y}px` };
  return (
    <div className={`ws-editor${props.disabled ? ' is-disabled' : ''}${drag ? ' is-dragging' : ''}`}>
      <Palette
        ref={palRef} project={project} spriteId={spriteId} ctx={ctx} glow={props.paletteGlow ?? null}
        deleting={!!drag && drag.overDelete && drag.from !== 'palette'} onDown={palDown}
      />
      <section className="ws-col" aria-label="Programas">
        {props.header}
        <div
          ref={wsRef} className={`ws-paper${props.investigate ? ' is-investigate' : ''}`} style={paper}
          onPointerDown={wsDown} onContextMenu={onContext} data-sprite={spriteId} data-scroll={`${scroll.x},${scroll.y}`}
        >
          <svg className="ws-svg" aria-label={`Programas de ${sprite?.name ?? ''}`}>
            <g transform={`translate(${-scroll.x} ${-scroll.y})`}>
              {layouts.map((l) => <g key={l.stack.id} data-stack={l.stack.id}><StackG items={l.items} o={opts} /></g>)}
            </g>
          </svg>
          {!stacks.length && !drag && <p className="ws-empty">Arrastrá bloques hasta acá</p>}
          <div className="ws-tools">
            <button type="button" className="ws-tool cut" onClick={center} aria-label="Centrar"><IconCenter /> centrar</button>
            <button type="button" className="ws-tool cut" onClick={order} aria-label="Ordenar"><IconTidy /> ordenar</button>
          </div>
        </div>
      </section>
      {drag && dragItems && createPortal(
        <div ref={overlayRef} className={`ws-drag${drag.overDelete ? ' is-deleting' : ''}`} aria-hidden="true">
          <svg width={dragItems.w + 30} height={dragItems.h + 30} style={{ overflow: 'visible' }}><StackG items={dragItems.items} /></svg>
        </div>,
        document.body,
      )}
      {pop && <Pop pop={pop} close={() => setPop(null)} setValue={setValue} duplicate={duplicate} remove={remove} order={order} />}
    </div>
  );
}

// ------------------------------------------------------------------ the palette

const Palette = forwardRef<HTMLElement, {
  project: Project; spriteId: string; ctx: LayoutCtx; glow: { cat: Cat; ops: readonly Op[] } | null; deleting: boolean;
  onDown(item: PaletteItem): (e: RPointerEvent<HTMLDivElement>) => void;
}>(function Palette({ project, spriteId, ctx, glow, deleting, onDown }, ref) {
  const sprite = spriteById(project, spriteId);
  const names = project.sprites.map((s) => `${s.id}:${s.name}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sections = useMemo(() => paletteFor(project, sprite), [spriteId, names]);
  const listRef = useRef<HTMLDivElement>(null);
  const [cat, setCat] = useState<Cat>('events');
  const go = (c: Cat) => {
    setCat(c);
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cat="${c}"]`);
    if (el && listRef.current) listRef.current.scrollTo({ top: el.offsetTop - 6 });
  };
  useLayoutEffect(() => { if (glow) go(glow.cat); }, [glow]); // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = () => {
    const list = listRef.current;
    if (!list) return;
    let cur: Cat = sections[0]?.cat ?? 'events';
    for (const s of sections) {
      const el = list.querySelector<HTMLElement>(`[data-cat="${s.cat}"]`);
      if (el && el.offsetTop - 30 <= list.scrollTop) cur = s.cat;
    }
    setCat(cur);
  };
  const glowOps = new Set(glow?.ops ?? []);
  return (
    <aside ref={ref} className={`ws-pal${deleting ? ' is-deleting' : ''}`} aria-label="Bloques">
      <nav className="ws-cats">
        {CATS.filter((c) => sections.some((s) => s.cat === c.id)).map((c) => (
          <button
            key={c.id} type="button" className={`ws-cat${cat === c.id ? ' is-on' : ''}${glow?.cat === c.id ? ' is-glow' : ''}`} data-cat={c.id}
            style={{ '--cat': c.fill, '--cat-dark': c.dark } as CSSProperties} onClick={() => go(c.id)}
          >
            <span className="ws-cat-dot" aria-hidden="true" />
            <span className="ws-cat-name">{c.name}</span>
          </button>
        ))}
      </nav>
      <div ref={listRef} className="ws-pal-list" onScroll={onScroll}>
        {sections.map((s) => (
          <section key={s.cat} data-cat={s.cat} className="ws-pal-sec">
            <h3 style={{ '--cat': catOf(s.cat).fill } as CSSProperties}>{catOf(s.cat).name}</h3>
            {s.items.map((it) => (
              <div key={it.key} className={`ws-pal-item${glowOps.has(it.op) && glow ? ' is-glow' : ''}`} data-pal={it.key} data-op={it.op} onPointerDown={onDown(it)}>
                <PaletteBlock item={it} ctx={ctx} />
              </div>
            ))}
          </section>
        ))}
        {deleting && <div className="ws-trash" aria-hidden="true">Soltalo acá para borrarlo</div>}
      </div>
    </aside>
  );
});

function PaletteBlock({ item, ctx }: { item: PaletteItem; ctx: LayoutCtx }) {
  // one instance per palette item (its ids never reach the project: a drag makes a new one)
  const [b] = useState(() => item.make());
  return <BlockPicture blocks={[b]} ctx={ctx} pad={PAL_PAD} scale={PAL_SCALE} className="ws-pal-svg" />;
}

// ------------------------------------------------------------------ popovers

function place(rect: DOMRect, w: number, h: number): CSSProperties {
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = rect.left + rect.width / 2 - w / 2;
  let top = rect.bottom + 8;
  if (top + h > vh - 8) top = Math.max(8, rect.top - h - 8);
  left = Math.max(8, Math.min(vw - w - 8, left));
  return { left, top, width: w };
}

function Pop({ pop, close, setValue, duplicate, remove, order }: {
  pop: Popover; close(): void; setValue(id: string, name: string, v: string): void; duplicate(id: string): void; remove(id: string): void; order(): void;
}) {
  return (
    <div className="ws-pop-back" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      {pop.kind === 'num' && <NumPad pop={pop} close={close} setValue={setValue} />}
      {pop.kind === 'text' && <TextPad pop={pop} close={close} setValue={setValue} />}
      {pop.kind === 'menu' && (
        <div className="ws-pop ws-menu cut" style={place(pop.rect, 240, Math.min(360, pop.options.length * 52 + 16))} role="listbox">
          {pop.options.map((o) => (
            <button
              key={o.value} type="button" role="option" aria-selected={o.value === pop.value} className={`ws-opt${o.value === pop.value ? ' is-on' : ''}`} data-value={o.value}
              onClick={() => { setValue(pop.blockId, pop.name, o.value); close(); }}
            >{o.label}</button>
          ))}
        </div>
      )}
      {pop.kind === 'context' && (
        <div className="ws-pop ws-menu ws-context cut" style={{ left: Math.min(pop.x, window.innerWidth - 220), top: Math.min(pop.y, window.innerHeight - 170), width: 200 }} role="menu">
          {pop.blockId ? (
            <>
              <button type="button" role="menuitem" className="ws-opt" data-act="duplicate" onClick={() => { duplicate(pop.blockId!); close(); }}><IconDup /> Duplicar</button>
              <button type="button" role="menuitem" className="ws-opt" data-act="delete" onClick={() => { remove(pop.blockId!); close(); }}><IconTrash /> Borrar</button>
            </>
          ) : (
            <button type="button" role="menuitem" className="ws-opt" data-act="tidy" onClick={() => { order(); close(); }}><IconTidy /> Ordenar</button>
          )}
        </div>
      )}
    </div>
  );
}

const PAD_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '-', '0', '.'];

function NumPad({ pop, close, setValue }: { pop: FieldPop; close(): void; setValue(id: string, name: string, v: string): void }) {
  const [v, setV] = useState(pop.value);
  const fresh = useRef(true);
  const vRef = useRef(v);
  vRef.current = v;
  const ok = () => {
    const n = vRef.current.trim();
    setValue(pop.blockId, pop.name, n === '' || n === '-' || n === '.' ? '0' : n.replace(/\.$/, ''));
    close();
  };
  const press = (k: string) => {
    setV((cur) => {
      const base = fresh.current ? '' : cur;
      fresh.current = false;
      if (k === '⌫') return base.slice(0, -1);
      if (k === '-') return base.startsWith('-') ? base.slice(1) : `-${base}`;
      if (k === '.') return base.includes('.') ? base : `${base || '0'}.`;
      return base.length >= 6 ? base : base + k;
    });
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === '-' || e.key === '.') press(e.key);
      else if (e.key === ',') press('.');
      else if (e.key === 'Backspace') press('⌫');
      else if (e.key === 'Enter') ok();
      else if (e.key === 'Escape') close();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', on, true);
    return () => window.removeEventListener('keydown', on, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="ws-pop ws-numpad cut" style={place(pop.rect, 252, 360)} role="dialog" aria-label="Número">
      <output className={`ws-num-show${fresh.current ? ' is-fresh' : ''}`}>{v || ' '}</output>
      <div className="ws-num-keys">
        {PAD_KEYS.map((k) => <button key={k} type="button" className="ws-key cut" data-key={k} onClick={() => press(k)}>{k === '-' ? '−' : k}</button>)}
        <button type="button" className="ws-key ws-key-del cut" data-key="del" onClick={() => press('⌫')} aria-label="Borrar">⌫</button>
        <button type="button" className="ws-key ws-key-ok cut" data-key="ok" onClick={ok}>Listo</button>
      </div>
    </div>
  );
}

function TextPad({ pop, close, setValue }: { pop: FieldPop; close(): void; setValue(id: string, name: string, v: string): void }) {
  const [v, setV] = useState(pop.value);
  const ok = () => { setValue(pop.blockId, pop.name, v.slice(0, 40)); close(); };
  return (
    <form className="ws-pop ws-textpad cut" style={place(pop.rect, 300, 130)} onSubmit={(e) => { e.preventDefault(); ok(); }}>
      <input autoFocus value={v} maxLength={40} onChange={(e) => setV(e.target.value)} onFocus={(e) => e.target.select()} aria-label="Texto" />
      <button type="submit" className="ws-key ws-key-ok cut">Listo</button>
    </form>
  );
}
