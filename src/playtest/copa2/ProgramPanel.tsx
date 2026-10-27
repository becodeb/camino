// Copa v2 garage: the program as the child sees it. The kart's blocks are the
// other levels' notched puzzle pieces (CopaBlocks.tsx), laid out by
// blockLayout.ts: the main script under an "Al largar" block, the event script
// under its yellow hat, containers as C shapes. This file is the surface: the
// lanes, the insertion marker, what is lit while the program runs, and the
// answer to "which slot is under the pointer" for the drag (Garage.tsx).
// It only reports taps; the pure editor state (editor.ts) decides everything.

import { useEffect, useMemo, useRef, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { DIMS } from '../../game/editor';
import { startPath } from '../../blocks/blocks';
import type { Program, Sensor } from './program';
import { slotCount } from './program';
import type { Position } from './hints';
import { lapsAllowed, withoutBlock, type Caret, type Rules } from './editor';
import { BlockCanvas, NO_LIVE, type BlockCtx, type Live } from './CopaBlocks';
import { CANVAS_W, FULL, MINI, MINI_W, layoutScript, pickSlot, withoutGap, type Layout, type Metrics } from './blockLayout';
import { BlockIcon } from './blockArt';

export { NO_LIVE };
export type { Live };

export interface PanelHandlers {
  onSelect(id: string): void;
  onCaret(c: Caret): void;
  onBump(id: string, delta: number): void;
  onLaps(id: string, on: boolean): void;
  onSensor(id: string, s: Sensor): void;
  onAddEvent(): void;
}

/** What the drag needs from the surface (Garage.tsx owns the gesture). */
export type HitFn = (clientX: number, clientY: number) => Position | null;
export interface DndView {
  /** The block in the hand: the program is drawn without it. */
  dragId: string | null;
  /** Where a hole opens for it (a slot of the program without it), and how tall. */
  gap: { pos: Position; h: number } | null;
  hit: MutableRefObject<HitFn | null>;
  onDown(e: ReactPointerEvent<HTMLElement>, id: string): void;
  suppress(): boolean;
}

const emptyText = (pos: Position): string => {
  if (!pos.path.length) return pos.script === 'event' ? 'Qué hace el auto cuando cae un tronco' : 'Tocá o arrastrá un bloque acá';
  const last = pos.path[pos.path.length - 1];
  return last.branch === 'then' ? 'Si es que sí: poné bloques acá' : last.branch === 'else' ? 'Si es que no: poné bloques acá' : 'Poné bloques acá adentro';
};

// ------------------------------------------------------------------ the memory

/** "La memoria del auto": one numbered cell per place; the used ones are filled. */
export function MemoryMeter({ program, rules, shake }: { program: Program; rules: Rules; shake: number }) {
  const used = slotCount(program);
  const over = used >= rules.slots;
  return (
    <div className={`gx-memory${over ? ' is-full' : ''}`} key={shake} data-shake={shake ? 1 : 0}>
      <div className="gx-memory-head">
        <b>La memoria del auto</b>
        <span className="gx-memory-count" aria-live="polite"><b>{used}</b> de <b>{rules.slots}</b> lugares</span>
      </div>
      <ol className="gx-cells" aria-label={`${used} de ${rules.slots} lugares usados`}>
        {Array.from({ length: rules.slots }, (_, i) => (
          <li key={i} className={`gx-cell${i < used ? ' is-used' : ''}`}>{i + 1}</li>
        ))}
      </ol>
    </div>
  );
}

/** "Tu programa anterior": the program of the last copa, faded and read-only, beside the garage (copas 2 and 3 start empty). */
export function ReferencePanel({ program, rules }: { program: Program; rules: Rules }) {
  const none: PanelHandlers = { onSelect() {}, onCaret() {}, onBump() {}, onLaps() {}, onSensor() {}, onAddEvent() {} };
  return (
    <section className="sheet gx-ref" aria-label="Tu programa anterior">
      <h2 className="gx-ref-title">Tu programa anterior</h2>
      <div className="gx-ref-body" aria-hidden="true">
        <ProgramPanel program={program} rules={rules} caret={{ script: 'main', path: [], index: 0 }} selected={null} live={NO_LIVE} crashId={null} wrongId={null} readOnly handlers={none} compact />
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ the program

export function ProgramPanel({ program, rules, caret, selected, live, crashId, wrongId, readOnly, handlers, banner, toolbar, pick, answerId, compact, title, dnd }: {
  program: Program; rules: Rules; caret: Caret; selected: string | null; live: Live; crashId: string | null; wrongId: string | null;
  readOnly: boolean; handlers: PanelHandlers; banner?: ReactNode; toolbar?: ReactNode;
  pick?: (id: string) => void; answerId?: string | null; compact?: boolean; title?: string; dnd?: DndView;
}) {
  const m: Metrics = compact ? MINI : FULL;
  const width = compact ? MINI_W : CANVAS_W;
  const edit = !readOnly && !pick && !compact;
  const root = useRef<HTMLElement>(null);
  const mainEl = useRef<HTMLDivElement>(null);
  const eventEl = useRef<HTMLDivElement>(null);
  const addEl = useRef<HTMLButtonElement>(null);

  // while a block is in the hand the program is drawn without it
  const shown = useMemo(() => (dnd?.dragId ? withoutBlock(program, dnd.dragId) : program), [program, dnd?.dragId]);
  const gap = dnd?.gap ?? null;
  const marker = edit && !dnd?.dragId ? caret : null;
  const base = { width, metrics: m, selected, sensors: rules.palette.sensors, laps: lapsAllowed(rules) };
  const hat = shown.onLog;
  const hasEvent = rules.palette.event;
  const mainLayout = useMemo(
    () => layoutScript(shown.main, { ...base, script: 'main', start: !compact, caret: marker?.script === 'main' ? marker : null, gap: gap?.pos.script === 'main' ? gap : null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown.main, width, selected, marker?.script, marker?.index, JSON.stringify(marker?.path), gap?.pos.script, gap?.pos.index, JSON.stringify(gap?.pos.path), gap?.h, compact, rules],
  );
  const eventLayout = useMemo(
    () => (hat ? layoutScript(hat.body, { ...base, script: 'event', hatId: hat.id, caret: marker?.script === 'event' ? marker : null, gap: gap?.pos.script === 'event' ? gap : null }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hat, width, selected, marker?.script, marker?.index, JSON.stringify(marker?.path), gap?.pos.script, gap?.pos.index, JSON.stringify(gap?.pos.path), gap?.h, rules],
  );

  // the slot under the pointer, read in the layout WITHOUT the gap (the one the screen shows has it open)
  const hitState = useRef({ shown, mainLayout, eventLayout, rules, base });
  hitState.current = { shown, mainLayout, eventLayout, rules, base };
  useEffect(() => {
    if (!dnd) return;
    dnd.hit.current = (x, y) => {
      const h = hitState.current;
      const plain = (script: 'main' | 'event'): Layout | null => {
        if (script === 'main') return layoutScript(h.shown.main, { ...h.base, script: 'main', start: !compact, caret: null });
        return h.shown.onLog ? layoutScript(h.shown.onLog.body, { ...h.base, script: 'event', hatId: h.shown.onLog.id, caret: null }) : null;
      };
      const cands: { el: HTMLElement | null; script: 'main' | 'event'; shownLayout: Layout | null; slots: Layout['slots'] | null }[] = [
        { el: mainEl.current, script: 'main', shownLayout: h.mainLayout, slots: null },
        { el: eventEl.current, script: 'event', shownLayout: h.eventLayout, slots: null },
        { el: addEl.current, script: 'event', shownLayout: null, slots: [{ pos: { script: 'event', path: [], index: 0 }, x: 0, y: 0, w: 1 }] },
      ];
      let best: { c: (typeof cands)[number]; r: DOMRect; d: number } | null = null;
      for (const c of cands) {
        if (!c.el) continue;
        const r = c.el.getBoundingClientRect();
        const dx = Math.max(r.left - x, 0, x - r.right);
        const dy = Math.max(r.top - y, 0, y - r.bottom);
        const d = Math.hypot(dx, dy);
        if (!best || d < best.d) best = { c, r, d };
      }
      if (!best || best.d > 90) return null;
      if (best.c.slots) return best.c.slots[0].pos;
      const lay = plain(best.c.script);
      if (!lay) return null;
      let py = y - best.r.top;
      const g = best.c.shownLayout?.items.find((it) => it.kind === 'gap');
      if (g) py = withoutGap(py, g.y, g.h);
      return pickSlot(lay.slots, x - best.r.left, py)?.pos ?? null;
    };
    return () => { dnd.hit.current = null; };
  }, [dnd, compact]);

  const ctx: BlockCtx = {
    readOnly: readOnly || !!compact, selected, live, crashId, wrongId, answerId, pick, sensors: rules.palette.sensors,
    onSelect: handlers.onSelect, onCaret: handlers.onCaret, onBump: handlers.onBump, onLaps: handlers.onLaps, onSensor: handlers.onSensor,
    onDown: dnd?.onDown, suppress: dnd?.suppress, emptyText: edit ? emptyText : undefined,
  };

  // the insertion marker stays in view as the program grows (the page scrolls, not the panel)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!edit) return;
    root.current?.querySelector('.gx-caret')?.scrollIntoView({ block: 'nearest' });
  }, [caret, program, edit]);
  // the running block stays on screen, however long the program is
  useEffect(() => {
    if (!live.leaf) return;
    root.current?.querySelector(`[data-id="${CSS.escape(live.leaf)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [live.leaf]);

  return (
    <section ref={root} className={`gx-program sheet${compact ? ' is-compact' : ''}`} data-zone="program" aria-label={compact ? 'Programa' : 'El programa del auto'}>
      {banner}
      {toolbar}
      <div className="gx-lanes">
        <div className="gx-lane gx-lane-main" ref={mainEl}>
          {title && <h3 className="gx-lane-title">{title}</h3>}
          <BlockCanvas layout={mainLayout} c={ctx} m={m} label="Programa del auto" />
        </div>
        {hasEvent && !compact && (
          <div className={`gx-lane gx-lane-event${hat ? '' : ' is-empty'}`}>
            {hat && eventLayout ? (
              <div ref={eventEl} className="gx-event-canvas"><BlockCanvas layout={eventLayout} c={ctx} m={m} label="Si cae un tronco" /></div>
            ) : (
              <button type="button" ref={addEl} className="gx-lane-add" disabled={readOnly} onClick={handlers.onAddEvent} style={{ width: CANVAS_W, height: FULL.hat + 34 }}>
                <svg className="gx-lane-add-shape" width={CANVAS_W} height={FULL.hat + 34} viewBox={`0 0 ${CANVAS_W} ${FULL.hat + 34}`} aria-hidden="true">
                  <path d={startPath(CANVAS_W, FULL.hat + 34, { ...DIMS, h: FULL.h })} className="gb-dashed" />
                </svg>
                <span className="gx-lane-add-text">
                  <BlockIcon kind="on_log" size={40} bare />
                  <span><b>Si cae un tronco</b><small>Un segundo programa que se prende solo</small></span>
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
