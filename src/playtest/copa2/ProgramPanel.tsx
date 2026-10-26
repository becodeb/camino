// Copa v2 garage: the program as the child sees it. Warm paper cards, big
// pictures, nesting drawn as a coloured spine (a `repetir` / `si` holds its
// blocks inside it), NOT Scratch-like puzzle pieces. Everything here is a view
// over the pure editor state (editor.ts): it only reports taps.
//
// Targets are at least 48 px tall. A tap on a block selects it (the caret goes
// right after it); a tap on the dashed slot puts the caret there; numbers move
// with big - and + buttons, never typing.

import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import type { Block, Program, Sensor } from './program';
import { slotCount } from './program';
import type { Position } from './hints';
import { sameSlot, lapsAllowed, type Caret, type Rules } from './editor';
import { BlockIcon, SensorIcon } from './blockArt';
import { BLOCK_LABEL, SENSOR_LABEL } from './labels';

export interface Live {
  /** The block that is running (or step-lit). */
  leaf: string | null;
  /** Its containers (lit softly). */
  around: ReadonlySet<string>;
}
export const NO_LIVE: Live = { leaf: null, around: new Set() };

export interface PanelHandlers {
  onSelect(id: string): void;
  onCaret(c: Caret): void;
  onBump(id: string, delta: number): void;
  onLaps(id: string, on: boolean): void;
  onSensor(id: string, s: Sensor): void;
  onAddEvent(): void;
}

interface Ctx extends PanelHandlers {
  rules: Rules;
  caret: Caret;
  selected: string | null;
  live: Live;
  crashId: string | null;
  wrongId: string | null;
  readOnly: boolean;
  /** Espiá: the blocks can be tapped to answer (a read-only program with a question) and `answerId` shows the right one. */
  pick?: (id: string) => void;
  answerId?: string | null;
}

const dropAttr = (pos: Position) => JSON.stringify(pos);

// ------------------------------------------------------------------ the memory

/** "La memoria del auto": one numbered cell per place; the used ones are filled. */
export function MemoryMeter({ program, rules, shake }: { program: Program; rules: Rules; shake: number }) {
  const used = slotCount(program);
  const over = used >= rules.slots;
  return (
    <div className={`gx-memory${over ? ' is-full' : ''}`} key={shake} data-shake={shake ? 1 : 0}>
      <div className="gx-memory-head">
        <b>La memoria del auto: {rules.slots} lugares</b>
        <span className="gx-memory-count" aria-live="polite">Lugares usados <b>{used}</b> de <b>{rules.slots}</b></span>
      </div>
      <ol className="gx-cells" aria-label={`${used} de ${rules.slots} lugares usados`}>
        {Array.from({ length: rules.slots }, (_, i) => (
          <li key={i} className={`gx-cell${i < used ? ' is-used' : ''}`}>{i + 1}</li>
        ))}
      </ol>
    </div>
  );
}

// ------------------------------------------------------------------ small controls

function Stepper({ value, unit, onMinus, onPlus, min, max }: { value: number; unit: string; onMinus(): void; onPlus(): void; min: number; max: number }) {
  return (
    <span className="gx-stepper" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="cut gx-step-btn" aria-label="menos" disabled={value <= min} onClick={onMinus}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5,12 H19" stroke="#2b2622" strokeWidth="4" strokeLinecap="round" /></svg>
      </button>
      <b className="gx-num">{value}</b>
      <button type="button" className="cut gx-step-btn" aria-label="más" disabled={value >= max} onClick={onPlus}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5,12 H19 M12,5 V19" stroke="#2b2622" strokeWidth="4" strokeLinecap="round" /></svg>
      </button>
      <span className="gx-unit">{unit}</span>
    </span>
  );
}

const onKey = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

// ------------------------------------------------------------------ one block

function rowClass(b: { id: string }, c: Ctx, extra = ''): string {
  return [
    'gx-row', extra,
    c.selected === b.id ? 'is-sel' : '',
    c.live.leaf === b.id ? 'is-live' : '',
    c.live.around.has(b.id) ? 'is-around' : '',
    c.crashId === b.id ? 'is-crash' : '',
    c.wrongId === b.id ? 'is-wrongpick' : '',
    c.answerId === b.id ? 'is-answer' : '',
    c.pick ? 'is-pickable' : '',
  ].filter(Boolean).join(' ');
}

function BlockView({ b, pos, c }: { b: Block; pos: Position; c: Ctx }) {
  const after: Position = { script: pos.script, path: pos.path, index: pos.index + 1 };
  const select = () => { if (c.pick) c.pick(b.id); else if (!c.readOnly) c.onSelect(b.id); };
  if (b.kind === 'repeat') {
    const inside = (index: number): Position => ({ script: pos.script, path: [...pos.path, { index: pos.index, branch: 'body' }], index });
    return (
      <div className={`gx-c gx-c-repeat${c.live.around.has(b.id) || c.live.leaf === b.id ? ' is-around' : ''}${c.crashId === b.id ? ' is-crashbox' : ''}`} data-id={b.id}>
        <div className={rowClass(b, c, 'gx-head-row')} role="button" tabIndex={0} onClick={select} onKeyDown={onKey(select)} data-drop={dropAttr(after)}>
          <BlockIcon kind="repeat" />
          <span className="gx-label">repetir</span>
          {c.selected === b.id && !c.readOnly ? (
            <>
              {b.n !== 'laps' && <Stepper value={b.n} unit="veces" min={1} max={20} onMinus={() => c.onBump(b.id, -1)} onPlus={() => c.onBump(b.id, 1)} />}
              {lapsAllowed(c.rules) && (
                <button type="button" className={`cut gx-chip${b.n === 'laps' ? ' is-on' : ''}`} aria-pressed={b.n === 'laps'} onClick={(e) => { e.stopPropagation(); c.onLaps(b.id, b.n !== 'laps'); }}>
                  vueltas
                </button>
              )}
            </>
          ) : (
            <b className="gx-numchip">{b.n === 'laps' ? 'vueltas' : `${b.n} veces`}</b>
          )}
          {c.crashId === b.id && <CrashTag />}
        </div>
        <div className="gx-c-body">
          <BlockList blocks={b.body} script={pos.script} path={[...pos.path, { index: pos.index, branch: 'body' }]} c={c} emptyText="Poné bloques acá adentro" />
        </div>
        <div className="gx-c-foot" data-drop={dropAttr(inside(b.body.length))} />
      </div>
    );
  }
  if (b.kind === 'if') {
    const branch = (br: 'then' | 'else', index: number): Position => ({ script: pos.script, path: [...pos.path, { index: pos.index, branch: br }], index });
    return (
      <div className={`gx-c gx-c-if${c.live.around.has(b.id) || c.live.leaf === b.id ? ' is-around' : ''}${c.crashId === b.id ? ' is-crashbox' : ''}`} data-id={b.id}>
        <div className={rowClass(b, c, 'gx-head-row')} role="button" tabIndex={0} onClick={select} onKeyDown={onKey(select)} data-drop={dropAttr(after)}>
          <BlockIcon kind="if" />
          <span className="gx-label">si</span>
          <span className="gx-conds">
            {b.cond.map((s, i) => (
              <Fragment key={s}>{i > 0 && <span className="gx-and">y</span>}<span className="gx-cond"><SensorIcon sensor={s} size={30} />{SENSOR_LABEL[s]}</span></Fragment>
            ))}
          </span>
          {c.crashId === b.id && <CrashTag />}
        </div>
        {c.selected === b.id && !c.readOnly && c.rules.palette.sensors.length > 1 && (
          <div className="gx-sensors" aria-label="Qué mira el auto">
            {c.rules.palette.sensors.map((s) => (
              <button key={s} type="button" className={`cut gx-chip${b.cond.includes(s) ? ' is-on' : ''}`} aria-pressed={b.cond.includes(s)} onClick={() => c.onSensor(b.id, s)}>
                <SensorIcon sensor={s} size={28} />{SENSOR_LABEL[s]}
              </button>
            ))}
          </div>
        )}
        <div className="gx-c-body">
          <BlockList blocks={b.then} script={pos.script} path={[...pos.path, { index: pos.index, branch: 'then' }]} c={c} emptyText="Si es que sí: poné bloques acá" />
        </div>
        <div className="gx-else"><span>si no</span></div>
        <div className="gx-c-body gx-c-else">
          <BlockList blocks={b.else} script={pos.script} path={[...pos.path, { index: pos.index, branch: 'else' }]} c={c} emptyText="Si es que no: poné bloques acá" />
        </div>
        <div className="gx-c-foot" data-drop={dropAttr(branch('else', b.else.length))} />
      </div>
    );
  }
  return (
    <div className={rowClass(b, c)} role="button" tabIndex={0} onClick={select} onKeyDown={onKey(select)} data-id={b.id} data-kind={b.kind} data-drop={dropAttr(after)}>
      <BlockIcon kind={b.kind} />
      <span className="gx-label">{BLOCK_LABEL[b.kind]}</span>
      {b.kind === 'wait' && (c.selected === b.id && !c.readOnly
        ? <Stepper value={b.n} unit="seg" min={1} max={9} onMinus={() => c.onBump(b.id, -1)} onPlus={() => c.onBump(b.id, 1)} />
        : <b className="gx-numchip">{b.n} {b.n === 1 ? 'segundo' : 'segundos'}</b>)}
      {b.kind === 'nitro' && <b className="gx-numchip">en −1</b>}
      {c.crashId === b.id && <CrashTag />}
    </div>
  );
}

const CrashTag = () => <span className="gx-crash-tag">¡Acá chocó!</span>;

// ------------------------------------------------------------------ a list of blocks (with the caret)

function CaretRow({ pos, hint }: { pos: Position; hint: boolean }) {
  return (
    <div className={`gx-caret${hint ? ' is-hint' : ''}`} data-drop={dropAttr(pos)} aria-label="Acá entra el próximo bloque">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3,6 L14,12 L3,18 Z" fill="#c9574a" stroke="#2b2622" strokeWidth="2" strokeLinejoin="round" /></svg>
      <span>acá entra el bloque</span>
    </div>
  );
}

function BlockList({ blocks, script, path, c, emptyText }: { blocks: readonly Block[]; script: 'main' | 'event'; path: Position['path']; c: Ctx; emptyText: string }) {
  const slot = (index: number): Position => ({ script, path: [...path], index });
  const here = (index: number) => !c.readOnly && sameSlot(c.caret, slot(index));
  return (
    <div className="gx-list">
      {blocks.map((b, i) => (
        <Fragment key={b.id}>
          {here(i) && <CaretRow pos={slot(i)} hint={false} />}
          <BlockView b={b} pos={slot(i)} c={c} />
        </Fragment>
      ))}
      {here(blocks.length)
        ? <CaretRow pos={slot(blocks.length)} hint={false} />
        : (!blocks.length && !c.readOnly && (
          <button type="button" className="gx-empty" data-drop={dropAttr(slot(0))} onClick={() => c.onCaret(slot(0))}>{emptyText}</button>
        ))}
    </div>
  );
}

// ------------------------------------------------------------------ the two lanes

/**
 * Brings `el` into view by scrolling only the lane that holds it (`scrollIntoView` also scrolls the overflow-hidden
 * ancestors, which pushed the lane's own title out of the panel). `centre`: a running block is put in the middle of the
 * lane whenever it is not clearly inside it, so a long program (copa 5's nested repeats) keeps the executing block on screen.
 */
export function keepInView(el: Element | null | undefined, centre = false): void {
  const lane = el?.closest<HTMLElement>('.gx-lane');
  if (!el || !lane) return;
  const l = lane.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const title = lane.querySelector<HTMLElement>('.gx-lane-title')?.getBoundingClientRect().height ?? 0;
  const top = l.top + title + 8;
  const bottom = l.bottom - 8;
  if (r.top >= top && r.bottom <= bottom) return;
  if (centre) lane.scrollTop += r.top - (l.top + title + (l.height - title) / 2 - r.height / 2);
  else lane.scrollTop += r.top < top ? r.top - top : r.bottom - bottom;
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

export function ProgramPanel({ program, rules, caret, selected, live, crashId, wrongId, readOnly, handlers, banner, toolbar, pick, answerId, compact, title }: {
  program: Program; rules: Rules; caret: Caret; selected: string | null; live: Live; crashId: string | null; wrongId: string | null;
  readOnly: boolean; handlers: PanelHandlers; banner?: ReactNode; toolbar?: ReactNode;
  pick?: (id: string) => void; answerId?: string | null; compact?: boolean; title?: string;
}) {
  const c: Ctx = { ...handlers, rules, caret, selected, live, crashId, wrongId, readOnly, pick, answerId };
  const body = useRef<HTMLDivElement>(null);
  // keep the insertion point in view (a long program scrolls)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    keepInView(body.current?.querySelector('.gx-caret'));
  }, [caret, program]);
  // the running block stays on screen, however long the program is
  useEffect(() => {
    if (live.leaf) keepInView(body.current?.querySelector('.is-live'), true);
  }, [live.leaf]);
  const hat = program.onLog;
  const hatClass = ['gx-row', 'gx-hat', selected === hat?.id ? 'is-sel' : '', live.leaf === hat?.id || live.around.has(hat?.id ?? '') ? 'is-around' : '', crashId === hat?.id ? 'is-crash' : ''].filter(Boolean).join(' ');
  return (
    <section className={`gx-program sheet${compact ? ' is-compact' : ''}`} aria-label={compact ? 'Programa' : 'El programa del auto'}>
      {banner}
      <div className="gx-lanes" ref={body}>
        <div className="gx-lane gx-lane-main">
          <button type="button" className="gx-lane-title" disabled={readOnly} onClick={() => handlers.onCaret({ script: 'main', path: [], index: 0 })}>
            {title ?? 'Programa del auto'} <small>empieza acá</small>
          </button>
          <BlockList blocks={program.main} script="main" path={[]} c={c} emptyText="Tocá un bloque de la derecha para empezar" />
        </div>
        {rules.palette.event && (
          <div className={`gx-lane gx-lane-event${hat ? '' : ' is-empty'}`}>
            {hat ? (
              <>
                <div className={`${hatClass}${answerId === hat.id ? ' is-answer' : ''}${pick ? ' is-pickable' : ''}`} role="button" tabIndex={0} onClick={() => (pick ? pick(hat.id) : !readOnly && handlers.onSelect(hat.id))} onKeyDown={onKey(() => (pick ? pick(hat.id) : !readOnly && handlers.onSelect(hat.id)))} data-id={hat.id}>
                  <BlockIcon kind="on_log" />
                  <span className="gx-label">Si cae un tronco</span>
                </div>
                <div className="gx-c-body">
                  <BlockList blocks={hat.body} script="event" path={[]} c={c} emptyText="Qué hace el auto cuando cae un tronco" />
                </div>
              </>
            ) : (
              <button type="button" className="cut gx-lane-add" disabled={readOnly} onClick={handlers.onAddEvent}>
                <BlockIcon kind="on_log" />
                <span><b>Si cae un tronco</b><small>Un segundo programa que se prende solo</small></span>
              </button>
            )}
          </div>
        )}
      </div>
      {toolbar}
    </section>
  );
}
