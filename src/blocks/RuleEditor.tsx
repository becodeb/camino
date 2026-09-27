// The 3ro editor: the palette of hats and actions, and the notebook of rule
// cards. Same gestures as the program editor (rule 10): drag is the main
// gesture, a tap on a palette block equals dropping it; a card's hat takes
// taps for its actions; a block dragged out of the notebook is gone (a hat
// takes its card). Presentational: the level screen owns the rules; this
// reports taps and resolved drops (game/ruleEditor.ts) and exposes the
// imperative marks of a running game: a card flashes and its hat's ear
// twitches when the rule fires, an empty line calls, a palette hat wiggles.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { penLoop } from '../ink/ink.js';
import { REDUCED } from '../ui/runtime';
import { DIMS, type Dims } from '../game/editor';
import {
  RULE_DIMS, actionWidth, layoutRules, removeRef, resolveRuleDrop, ruleBlock, ruleTargetAt,
  type RuleBlock, type RuleDragSource, type RuleDropResult, type RuleLayout, type RuleOpts, type RuleRef, type RuleTarget,
} from '../game/ruleEditor';
import type { BlockLabel } from '../game/levels';
import { isHat, type Rule } from '../game/rules';
import { ActionArt, HatArt, SnapMarks } from './blocks';
import './blocks.css';

/** The paper dims the art needs for a rule block's notches. */
const artDims = (h: number): Dims => ({ ...DIMS, h });
const COLUMNS = 2;
const THRESHOLD = 8;

/** The notebook's width for rule cards (fixed for the page): the cards' columns, the margin and a little air. */
export const ruleNotebookWidth = () => 50 + COLUMNS * (RULE_DIMS.hatW + RULE_DIMS.pad * 2) + (COLUMNS - 1) * RULE_DIMS.gap + 22;

export interface RuleEditorApi {
  /** A rule fired: its card flashes blue pen, its hat's ear twitches. */
  flash(rule: number): void;
  /** A card's free line calls ("nothing here yet"). */
  callSlot(rule: number): void;
  /** A palette block wiggles ("this one is missing"). */
  wiggle(id: string): void;
  /** A card shakes (a second hat for the same trigger does not fit). */
  shake(rule: number): void;
}

export interface RuleEditorProps {
  blocks: string[];
  label: BlockLabel;
  rules: Rule[];
  opts: RuleOpts;
  /** The card receiving taps. */
  active: number | null;
  /** Won: nothing reacts. */
  disabled: boolean;
  /** The ghost hand is working: nothing reacts, nothing dims. */
  inert: boolean;
  /** A tapped action with no card to go to: it drops on the page and falls off (bump `n` to replay). */
  refused: { n: number; id: string; from: DOMRect } | null;
  onTapPalette: (block: RuleBlock, el: HTMLElement) => void;
  onTapHat: (rule: number) => void;
  onTapAction: (ref: Required<RuleRef>) => void;
  onDrop: (res: RuleDropResult, src: RuleDragSource) => void;
}

interface Pending { src: RuleDragSource; el: HTMLElement; x0: number; y0: number; id: number }
interface Drag extends Pending { offX: number; offY: number; w: number; h: number; x: number; y: number }

const sizeOf = (b: RuleBlock) => (b.kind === 'hat' ? { w: RULE_DIMS.hatW, h: RULE_DIMS.hatH } : { w: actionWidth(b.id), h: RULE_DIMS.h });

function BlockLook({ block, label, seed }: { block: RuleBlock; label: BlockLabel; seed?: number }) {
  const { w, h } = sizeOf(block);
  return block.kind === 'hat'
    ? <HatArt hat={block.id} w={w} h={h} d={artDims(h)} label={label} />
    : <ActionArt id={block.id} w={w} h={h} d={artDims(h)} label={label} seed={seed} />;
}

export function useRuleEditor(p: RuleEditorProps): { palette: ReactNode; notebook: ReactNode; api: RuleEditorApi } {
  const canvasRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const pending = useRef<Pending | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<RuleTarget | null>(null);
  const [snap, setSnap] = useState<{ key: string; n: number } | null>(null);
  const propsRef = useRef(p);
  propsRef.current = p;

  // while a notebook block is lifted, the notebook shows the rules without it
  const base = useMemo(() => (drag?.src.from === 'notebook' ? removeRef(p.rules, drag.src.ref) : p.rules), [drag, p.rules]);
  const layout: RuleLayout = useMemo(() => layoutRules(base, {
    columns: COLUMNS, maxActions: p.opts.maxActions, maxRules: p.opts.maxRules,
    active: drag ? null : p.active, showSlots: drag?.src.block.kind === 'action',
  }), [base, p.opts, p.active, drag]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // ---------------------------------------------------------------- drag
  const overNotebook = (x: number, y: number) => {
    const z = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-zone]')?.dataset.zone;
    if (z === 'program') return true;
    const r = canvasRef.current?.closest('[data-zone="program"]')?.getBoundingClientRect();
    return !!r && x > r.left - 30 && x < r.right + 30 && y > r.top - 30 && y < r.bottom + 40;
  };
  const targetFor = (dr: Drag, x: number, y: number): RuleTarget | null => {
    if (!overNotebook(x, y)) return null;
    const cr = canvasRef.current?.getBoundingClientRect();
    if (!cr) return null;
    // the card is chosen by the finger; the line by the middle of the dragged block
    return ruleTargetAt(layoutRef.current, x - cr.left, y - dr.offY - cr.top + Math.min(dr.h, RULE_DIMS.h) / 2, dr.src.block);
  };

  const placeGhost = (x: number, y: number) => {
    const dr = dragRef.current;
    if (!dr || !ghostRef.current) return;
    dr.x = x;
    dr.y = y;
    ghostRef.current.style.transform = `translate(${x - dr.offX}px, ${y - dr.offY}px)`;
  };

  const finish = (x: number, y: number, cancelled: boolean) => {
    const dr = dragRef.current;
    dragRef.current = null;
    pending.current = null;
    if (!dr) return;
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    const cur = propsRef.current;
    const over = !cancelled && overNotebook(x, y);
    const target = over ? targetFor(dr, x, y) : null;
    const res: RuleDropResult = cancelled ? { rules: null, outcome: 'cancel' } : resolveRuleDrop(cur.rules, dr.src, target, over, cur.opts);
    if ((res.outcome === 'add' || res.outcome === 'move') && res.rule != null && res.rules) {
      const r = res.rules[res.rule];
      const key = dr.src.block.kind === 'hat' ? `r${res.rule}` : `r${res.rule}:${target && 'rule' in target ? Math.min(target.at, r.actions.length - 1) : r.actions.length - 1}`;
      setSnap((o) => ({ key, n: (o?.n ?? 0) + 1 }));
    }
    setHover(null);
    setDrag(null);
    cur.onDrop(res, dr.src);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const pd = pending.current;
      if (!pd || e.pointerId !== pd.id) return;
      if (!dragRef.current) {
        if (Math.hypot(e.clientX - pd.x0, e.clientY - pd.y0) < THRESHOLD) return;
        const r = pd.el.getBoundingClientRect();
        const { w, h } = sizeOf(pd.src.block);
        // held where the finger went down, not where it is once the drag is recognised
        const dr: Drag = { ...pd, offX: Math.max(0, Math.min(pd.x0 - r.left, w - 10)), offY: Math.max(0, Math.min(pd.y0 - r.top, h - 10)), w, h, x: e.clientX, y: e.clientY };
        dragRef.current = dr;
        setDrag(dr);
      }
      e.preventDefault();
      placeGhost(e.clientX, e.clientY);
      const t = targetFor(dragRef.current!, e.clientX, e.clientY);
      setHover((o) => (JSON.stringify(o) === JSON.stringify(t) ? o : t));
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
  }, []);

  useLayoutEffect(() => { if (drag) placeGhost(drag.x, drag.y); }, [drag]);

  const down = (src: RuleDragSource) => (e: ReactPointerEvent<HTMLElement>) => {
    if (p.disabled || p.inert) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (pending.current) return;
    pending.current = { src, el: e.currentTarget, x0: e.clientX, y0: e.clientY, id: e.pointerId };
  };
  const click = (fn: () => void) => () => {
    if (suppressClick.current || propsRef.current.inert || propsRef.current.disabled) return;
    fn();
  };

  // snap: a little squash where the block landed
  useLayoutEffect(() => {
    if (!snap || REDUCED) return;
    const el = canvasRef.current?.querySelector<HTMLElement>(`[data-ref="${CSS.escape(snap.key)}"]`);
    el?.animate([{ scale: '1' }, { scale: '1.06 0.92', offset: 0.55 }, { scale: '0.98 1.03', offset: 0.8 }, { scale: '1' }], { duration: 260, easing: 'ease-out' });
  }, [snap]);

  // a tapped action that has no card to go to: it lands on the page and tips off
  const [bounce, setBounce] = useState<{ key: number; id: string; from: DOMRect; to: { x: number; y: number } } | null>(null);
  useLayoutEffect(() => {
    const r = p.refused;
    const cr = canvasRef.current?.getBoundingClientRect();
    if (!r || !cr || REDUCED) return;
    setBounce({ key: r.n, id: r.id, from: r.from, to: { x: cr.left + 30, y: cr.top + Math.min(layout.height + 30, 260) } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.refused?.n]);
  useEffect(() => {
    if (!bounce) return;
    const t = setTimeout(() => setBounce(null), 1000);
    return () => clearTimeout(t);
  }, [bounce]);

  // ---------------------------------------------------------------- imperative marks
  const api = useMemo<RuleEditorApi>(() => ({
    flash(rule) {
      const card = canvasRef.current?.querySelector<HTMLElement>(`[data-card="${rule}"]`);
      if (!card || REDUCED) return;
      card.querySelector<SVGSVGElement>('.card-ring')?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 750, easing: 'ease-out' });
      card.querySelector('.hat-ear')?.animate([{ rotate: '0deg' }, { rotate: '-16deg', offset: 0.2 }, { rotate: '12deg', offset: 0.45 }, { rotate: '-6deg', offset: 0.7 }, { rotate: '0deg' }], { duration: 520, easing: 'ease-out' });
      card.querySelector('.ear-waves')?.animate([{ opacity: 0.25 }, { opacity: 1, offset: 0.2 }, { opacity: 0.25 }], { duration: 700 });
    },
    callSlot(rule) {
      const slot = canvasRef.current?.querySelector<HTMLElement>(`[data-key="r${rule}/slot"]`);
      if (!slot || REDUCED) return;
      slot.animate([{ scale: '1' }, { scale: '1.1' }, { scale: '1' }, { scale: '1.1' }, { scale: '1' }], { duration: 900, easing: 'ease-in-out' });
    },
    wiggle(id) {
      const b = paletteRef.current?.querySelector<HTMLElement>(`[data-cmd="${CSS.escape(id)}"]`);
      if (!b || REDUCED) return;
      b.animate([{ rotate: '0deg' }, { rotate: '-6deg', translate: '4px 0' }, { rotate: '5deg', translate: '-3px 0' }, { rotate: '-4deg', translate: '2px 0' }, { rotate: '0deg', translate: '0 0' }], { duration: 620, easing: 'ease-out' });
    },
    shake(rule) {
      const card = canvasRef.current?.querySelector<HTMLElement>(`[data-card="${rule}"]`);
      if (!card || REDUCED) return;
      card.animate([{ translate: '0 0' }, { translate: '6px 0' }, { translate: '-6px 0' }, { translate: '0 0' }], { duration: 260 });
      this.flash(rule);
    },
  }), []);

  // ---------------------------------------------------------------- palette
  const hats = p.blocks.filter((b) => isHat(b));
  const actions = p.blocks.filter((b) => !isHat(b));
  const paletteItem = (id: string, i: number) => {
    const block = ruleBlock(id);
    const { w, h } = sizeOf(block);
    return (
      <button
        key={id}
        type="button"
        className={`pblk rpblk is-${block.kind}`}
        style={{ width: w, height: h }}
        disabled={p.disabled}
        aria-label={`Bloque ${id}`}
        data-cmd={id}
        onPointerDown={down({ from: 'palette', block })}
        onClick={(e) => { const el = e.currentTarget; click(() => p.onTapPalette(block, el))(); }}
      >
        <BlockLook block={block} label={p.label} seed={i + 1} />
      </button>
    );
  };
  const palette = (
    <div ref={paletteRef} className="block-palette rule-palette can-drag" role="group" aria-label="Bloques">
      {hats.map(paletteItem)}
      <span className="palette-rule" aria-hidden="true" />
      {actions.map((id, i) => paletteItem(id, i + hats.length))}
    </div>
  );

  // ---------------------------------------------------------------- notebook
  const hoverRule = hover && 'rule' in hover ? hover.rule : null;
  const cards = layout.cards.map((c) => {
    const r = base[c.rule];
    const hatSrc: RuleDragSource = { from: 'notebook', ref: { rule: c.rule }, block: { kind: 'hat', id: r.hat } };
    return (
      <div
        key={`card-${r.hat}`}
        data-card={c.rule}
        className={`rule-card${p.active === c.rule ? ' is-active' : ''}${hoverRule === c.rule ? ' is-target' : ''}`}
        style={{ width: c.w, height: c.h, transform: `translate(${c.x}px, ${c.y}px)` } as CSSProperties}
      >
        <svg className="card-ring" viewBox={`0 0 ${c.w + 24} ${c.h + 24}`} width={c.w + 24} height={c.h + 24} aria-hidden="true">
          <path d={penLoop((c.w + 24) / 2, (c.h + 24) / 2, (c.w + 24) / 2 - 4, (c.h + 24) / 2 - 4, { seed: c.rule + 3 })} />
        </svg>
        <div
          className="rblk rblk-hat"
          data-ref={`r${c.rule}`}
          role="button"
          tabIndex={p.disabled ? -1 : 0}
          aria-label={`Regla ${r.hat}. Tocar para ponerle bloques.`}
          style={{ left: c.hat.x - c.x, top: c.hat.y - c.y, width: c.hat.w, height: c.hat.h }}
          onPointerDown={down(hatSrc)}
          onClick={click(() => p.onTapHat(c.rule))}
        >
          <BlockLook block={{ kind: 'hat', id: r.hat }} label={p.label} />
          {snap?.key === `r${c.rule}` && !REDUCED && <SnapMarks key={snap.n} w={c.hat.w} />}
        </div>
        {c.actions.map((a, j) => (
          <button
            key={`${a.id}#${j}`}
            type="button"
            className="rblk rblk-action"
            data-ref={`r${c.rule}:${j}`}
            aria-label={`Bloque ${a.id}`}
            style={{ left: a.x - c.x, top: a.y - c.y, width: a.w, height: a.h }}
            onPointerDown={down({ from: 'notebook', ref: { rule: c.rule, action: j }, block: { kind: 'action', id: a.id } })}
            onClick={click(() => p.onTapAction({ rule: c.rule, action: j }))}
          >
            <BlockLook block={{ kind: 'action', id: a.id }} label={p.label} seed={c.rule * 3 + j + 2} />
          </button>
        ))}
        {c.slot && (
          <div
            className={`blk-slot rblk-slot${r.actions.length === 0 ? ' is-empty' : ''}${hoverRule === c.rule ? ' is-gap' : ''}`}
            data-key={`r${c.rule}/slot`}
            style={{ left: c.slot.x - c.x, top: c.slot.y - c.y, width: c.slot.w, height: c.slot.h }}
            onClick={click(() => p.onTapHat(c.rule))}
          >
            <svg className="blk-shape" width={c.slot.w} height={c.slot.h} viewBox={`0 0 ${c.slot.w} ${c.slot.h}`} aria-hidden="true">
              <rect x={3} y={3} width={c.slot.w - 6} height={c.slot.h - 6} rx={9} className="blk-hole" />
            </svg>
          </div>
        )}
      </div>
    );
  });
  const fresh = layout.fresh && (
    <div
      className={`blk-slot rblk-fresh${base.length === 0 ? ' is-calling' : ''}${drag?.src.block.kind === 'hat' && drag.src.from === 'palette' ? ' is-gap' : ''}`}
      data-key="new"
      style={{ left: layout.fresh.x, top: layout.fresh.y, width: layout.fresh.w, height: layout.fresh.h }}
      aria-hidden="true"
    >
      <svg className="blk-shape" width={layout.fresh.w} height={layout.fresh.h} viewBox={`0 0 ${layout.fresh.w} ${layout.fresh.h}`}>
        <path d={`M4,${layout.fresh.h * 0.38} C4,6 ${layout.fresh.w * 0.3},0 ${layout.fresh.w * 0.52},${layout.fresh.h * 0.14} C${layout.fresh.w * 0.72},${layout.fresh.h * 0.26} ${layout.fresh.w - 4},6 ${layout.fresh.w - 4},${layout.fresh.h * 0.3} L${layout.fresh.w - 4},${layout.fresh.h - 6} L4,${layout.fresh.h - 6} Z`} className="blk-hole" />
      </svg>
    </div>
  );

  const notebook = (
    <div className={`block-program rule-notebook${drag ? ' is-dragging' : ''}`}>
      <div ref={canvasRef} className="block-canvas" style={{ width: layout.width + 24, height: layout.height + 40 }}>
        {cards}
        {fresh}
      </div>
      {drag && createPortal(
        <div ref={ghostRef} className="blk-ghost" style={{ width: drag.w, height: drag.h }} aria-hidden="true">
          <div className="blk-ghost-in"><BlockLook block={drag.src.block} label={p.label} /></div>
        </div>,
        document.body,
      )}
      {bounce && createPortal(<Falling key={bounce.key} b={bounce} label={p.label} />, document.body)}
    </div>
  );

  return { palette, notebook, api };
}

/** An action with no card to hang from: onto the page, a bump, and it tips off. */
function Falling({ b, label }: { b: { id: string; from: DOMRect; to: { x: number; y: number } }; label: BlockLabel }) {
  const ref = useRef<HTMLDivElement>(null);
  const block = ruleBlock(b.id);
  const { w, h } = sizeOf(block);
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
    <div ref={ref} className="blk-ghost is-flying is-refused" style={{ width: w, height: h }} aria-hidden="true">
      <BlockLook block={block} label={label} />
    </div>
  );
}

/** For the ?debug hooks and the ghost hand: a stable callback that survives re-renders. */
export function useLatest<T extends (...args: never[]) => unknown>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback(((...args: Parameters<T>) => ref.current(...args)) as T, []);
}
