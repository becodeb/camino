// Copa v2 garage (C12): the kart's blocks, drawn like the other levels' blocks.
// The notched puzzle pieces of src/blocks (a dent on top, a bump below, the ink
// edge of the `rough` filter, the same arrows, the tape of `repetir` with its
// number disc, the green leaf of a `si`), extended consistently: a C-shaped
// container for `repetir` and `si / si no`, a hat for the event, condition pills
// inside the `si`. Where every block sits is blockLayout.ts (pure); this file
// only draws it and reports taps and pointer-downs. The look is the notebook's:
// warm paper, hand-drawn outlines, never Scratch's.

import { Fragment, memo, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { DIMS, type Dims } from '../../game/editor';
import {
  Arrow, COND_FILL, DIR_FILL, HAT_FILL, INK, JumpGlyph, START_FILL, StartSign, TAPE_FILL, TapeGlyph, bump, cPath, cardPath, dent, notchOf, R, startPath,
} from '../../blocks/blocks';
import { BlockIcon, SensorIcon, type IconKind } from './blockArt';
import { FULL, PAL, PAL_W, PILL_W, layoutScript, type Cell, type Layout, type Metrics, type Placed } from './blockLayout';
import type { Position } from './hints';
import type { Block, BlockKind, Sensor } from './program';
import { makeBlock, type Rules } from './editor';
import { BLOCK_LABEL, SENSOR_LABEL } from './labels';
import '../../blocks/blocks.css';

/** The running block (glowing) and what contains it (lit softly). */
export interface Live {
  leaf: string | null;
  around: ReadonlySet<string>;
}
export const NO_LIVE: Live = { leaf: null, around: new Set() };

/** The paper of each block: the arrows' own colours (DIR_FILL) for the moves, then one tint per family. */
export const BLOCK_FILL: Readonly<Record<IconKind, string>> = {
  forward: DIR_FILL.right, up: DIR_FILL.up, down: DIR_FILL.down, jump: '#c3d79a', turbo: '#f0d27a', brake: '#eeb3ac',
  wait: '#c3d6ea', repeat: TAPE_FILL, if: COND_FILL, nitro: '#f3c07a', on_log: HAT_FILL,
};

export interface BlockCtx {
  readOnly: boolean;
  selected: string | null;
  live: Live;
  crashId: string | null;
  wrongId: string | null;
  /** Espiá: the right block, shown green. */
  answerId?: string | null;
  /** Espiá: a tap on a block answers (nothing else reacts). */
  pick?: (id: string) => void;
  /** The copa's sensors (what a `si` can look at). */
  sensors: readonly Sensor[];
  /** The `si` whose condition hole is under the pointer while a sensor piece is dragged. */
  condTarget?: string | null;
  /** The `si` blocks that look at nothing: their hole asks for a piece (¡Largar! was pressed). */
  warnIds?: ReadonlySet<string>;
  onSelect?(id: string): void;
  onCaret?(pos: Position): void;
  onBump?(id: string, d: number): void;
  onLaps?(id: string, on: boolean): void;
  /** The × of a placed condition piece: takes it out of its `si`. */
  onUnsensor?(id: string, s: Sensor): void;
  /** A pointer went down on a block (the drag starts after it moves). */
  onDown?(e: ReactPointerEvent<HTMLElement>, id: string): void;
  /** A tap that is really the end of a drag must not select. */
  suppress?(): boolean;
  /** The text of an empty branch, by position (the list is empty). */
  emptyText?(pos: Position): string;
}

const dimsOf = (m: Metrics): Dims => ({ ...DIMS, h: m.h, arm: m.arm, spine: m.spine, foot: m.foot });

/** A `si / si no`: arm, the `si` branch, the `si no` bar, the `si no` branch, foot. */
export function ifPath(w: number, arm: number, mouthA: number, elseH: number, mouthB: number, foot: number, d: Dims): string {
  const n = notchOf(d);
  const s = d.spine;
  const r = 5;
  const m1 = arm + mouthA;
  const e = m1 + elseH;
  const m2 = e + mouthB;
  const h = m2 + foot;
  return [
    `M${R},0 ${dent(0, 0, n)} L${w - R},0 Q${w},0 ${w},${R} L${w},${arm - r} Q${w},${arm} ${w - r},${arm}`,
    `${bump(s, arm, n)} L${s + r},${arm} Q${s},${arm} ${s},${arm + r} L${s},${m1 - r} Q${s},${m1} ${s + r},${m1}`,
    `${dent(s, m1, n)} L${w - r},${m1} Q${w},${m1} ${w},${m1 + r} L${w},${e - r} Q${w},${e} ${w - r},${e}`,
    `${bump(s, e, n)} L${s + r},${e} Q${s},${e} ${s},${e + r} L${s},${m2 - r} Q${s},${m2} ${s + r},${m2}`,
    `${dent(s, m2, n)} L${w - r},${m2} Q${w},${m2} ${w},${m2 + r} L${w},${h - R} Q${w},${h} ${w - R},${h}`,
    `${bump(0, h, n)} L${R},${h} Q0,${h} 0,${h - R} L0,${R} Q0,0 ${R},0 Z`,
  ].join(' ');
}

/** The paper and its flat shadow with the ink edge (colours come from CSS: `--gb-fill`, `--gb-edge`). */
function Paper({ d, w, h }: { d: string; w: number; h: number }) {
  return (
    <svg className="gb-shape" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <g filter="url(#rough)">
        <path d={d} className="gb-shadow" transform="translate(3 4)" />
        <path d={d} className="gb-paper" />
      </g>
    </svg>
  );
}

// ------------------------------------------------------------------ pictures

/** A block's picture, the other levels' own where they have one (arrows, jump, tape) and this game's elsewhere. */
export function Glyph({ kind, size }: { kind: IconKind; size: number }) {
  switch (kind) {
    case 'forward': return <Arrow dir="right" size={size} seed={2} />;
    case 'up': return <span className="gb-turn" style={{ transform: 'rotate(-45deg)' }}><Arrow dir="right" size={size} seed={4} /></span>;
    case 'down': return <span className="gb-turn" style={{ transform: 'rotate(45deg)' }}><Arrow dir="right" size={size} seed={6} /></span>;
    case 'jump': return <JumpGlyph dir="right" size={size} />;
    case 'repeat': return <TapeGlyph size={Math.round(size * 1.15)} />;
    default: return <BlockIcon kind={kind} size={size} bare />;
  }
}

const Minus = () => <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5,12 H19" stroke={INK} strokeWidth="4.2" strokeLinecap="round" /></svg>;
const Plus = () => <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5,12 H19 M12,5 V19" stroke={INK} strokeWidth="4.2" strokeLinecap="round" /></svg>;

/** The number disc of the other levels' tapes, with its − and + (never typing). */
function NumberDisc({ value, unit, onMinus, onPlus, min, max, edit }: { value: number; unit?: string; onMinus(): void; onPlus(): void; min: number; max: number; edit: boolean }) {
  return (
    <span className="gb-stepper" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {edit && <button type="button" className="gb-step" aria-label="menos" disabled={value <= min} onClick={onMinus}><Minus /></button>}
      <span className="blk-count gb-num-disc"><b className="gb-num">{value}</b></span>
      {edit && <button type="button" className="gb-step" aria-label="más" disabled={value >= max} onClick={onPlus}><Plus /></button>}
      {unit && <span className="gb-unit">{unit}</span>}
    </span>
  );
}

const onKey = (fn: () => void) => (e: ReactKeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

// ------------------------------------------------------------------ one block

function stateClasses(id: string, c: BlockCtx): string {
  return [
    c.selected === id ? 'is-sel' : '',
    c.live.leaf === id ? 'is-live' : '',
    c.live.around.has(id) ? 'is-around' : '',
    c.crashId === id ? 'is-crash' : '',
    c.wrongId === id ? 'is-wrong' : '',
    c.answerId === id ? 'is-answer' : '',
    c.pick ? 'is-pickable' : '',
  ].filter(Boolean).join(' ');
}

const posStyle = (it: Placed): CSSProperties => ({ left: it.x, top: it.y, width: it.w, height: it.h });
const CrashTag = () => <span className="gb-crashtag">¡Acá chocó!</span>;

/** The condition shape: a long hexagon (pointed at both ends), like the other levels' `si` conditions but drawn as a piece of its own. */
export function CondShape({ w, h, dashed }: { w: number; h: number; dashed?: boolean }) {
  const r = Math.min(15, h / 2);
  const d = `M${r},2 L${w - r},2 L${w - 2},${h / 2} L${w - r},${h - 2} L${r},${h - 2} L2,${h / 2} Z`;
  return (
    <svg className="gb-cond-shape" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <g filter="url(#rough)">
        {!dashed && <path d={d} className="gb-shadow" transform="translate(2 3)" />}
        <path d={d} className={dashed ? 'gb-cond-dashed' : 'gb-cond-paper'} />
      </g>
    </svg>
  );
}

const EyeGlyph = ({ size = 22 }: { size?: number }) => (
  <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true"><path d="M4,24 C12,11 36,11 44,24 C36,37 12,37 4,24 Z" fill="#fbf7ee" stroke={INK} strokeWidth="3.4" strokeLinejoin="round" /><circle cx="24" cy="24" r="6.5" fill={INK} /></svg>
);
const Cross = () => <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6,6 L18,18 M18,6 L6,18" stroke={INK} strokeWidth="4" strokeLinecap="round" /></svg>;

function Pills({ it, c, m }: { it: Placed; c: BlockCtx; m: Metrics }) {
  const b = it.block as Extract<Block, { kind: 'if' }>;
  const edit = !c.readOnly && !c.pick;
  const h = m.pill;
  const hot = c.condTarget === b.id;
  const warn = !!c.warnIds?.has(b.id);
  const cell = (s: Cell): ReactNode => {
    const k = m.small ? 0.72 : 1;
    const w = Math.round(PILL_W[s] * k);
    if (s === 'slot' || s === 'more') {
      const empty = s === 'slot';
      return (
        <span key={s} className={`gb-condslot${empty ? ' is-empty' : ' is-more'}${hot ? ' is-target' : ''}${warn ? ' is-warn' : ''}`} style={{ '--w': `${w}px`, height: h } as CSSProperties} data-cond-slot={b.id} data-cond-kind={s}>
          <CondShape w={w} h={h} dashed />
          <span className="gb-condslot-text">{empty ? (m.small ? 'qué mira' : <><EyeGlyph size={m.small ? 18 : 22} /> poné qué mira el auto</>) : '+ otra'}</span>
        </span>
      );
    }
    return (
      <span key={s} className={`gb-pill${m.small ? ' is-small' : ''}`} style={{ '--w': `${w}px`, height: h } as CSSProperties} data-sensor={s} data-cond-for={b.id}>
        <CondShape w={w} h={h} />
        <span className="gb-pill-in">
          <SensorIcon sensor={s} size={m.small ? 22 : 28} />
          <span className="gb-pill-word">{SENSOR_LABEL[s]}</span>
        </span>
        {edit && (
          <button
            type="button" className="gb-pill-x" aria-label={`sacar ${SENSOR_LABEL[s]}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); if (!c.suppress?.()) c.onUnsensor?.(b.id, s); }}
          ><Cross /></button>
        )}
      </span>
    );
  };
  return (
    <div className="gb-pills">
      {it.rows!.map((row, ri) => (
        <div className="gb-pillrow" key={ri}>
          {row.map((s, i) => {
            const first = ri === 0 && i === 0;
            return (
              <Fragment key={s}>
                {!first && <span className="gb-and">y</span>}
                {cell(s)}
              </Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function BlockItem({ it, c, m }: { it: Placed; c: BlockCtx; m: Metrics }) {
  const b = it.block!;
  const d = dimsOf(m);
  const edit = !c.readOnly && !c.pick;
  const live = edit || !!c.pick;
  const select = () => {
    if (c.suppress?.()) return;
    if (c.pick) c.pick(b.id);
    else if (!c.readOnly) c.onSelect?.(b.id);
  };
  const common = {
    className: `gb gb-${it.kind} ${stateClasses(b.id, c)}${m.small ? ' is-small' : ''}`,
    style: { ...posStyle(it), '--gb-fill': BLOCK_FILL[b.kind] } as CSSProperties,
    'data-id': b.id, 'data-kind': b.kind,
    onClick: select,
    onPointerDown: c.onDown && edit ? (e: ReactPointerEvent<HTMLElement>) => c.onDown!(e, b.id) : undefined,
  };

  if (it.kind === 'cmd') {
    const wide = it.w >= 300;
    return (
      <div {...common} role={live ? 'button' : undefined} tabIndex={live ? 0 : undefined} onKeyDown={live ? onKey(select) : undefined} aria-label={BLOCK_LABEL[b.kind]}>
        <Paper d={cardPath(it.w, it.h, d)} w={it.w} h={it.h} />
        <div className="gb-row">
          <span className="gb-glyph"><Glyph kind={b.kind} size={m.small ? 30 : 38} /></span>
          <span className="gb-word">{b.kind === 'nitro' && !wide ? 'nitro' : BLOCK_LABEL[b.kind]}</span>
          {b.kind === 'wait' && m !== PAL && <NumberDisc value={b.n} unit={wide && !m.small ? 'seg' : undefined} min={1} max={9} edit={edit && !m.small} onMinus={() => c.onBump?.(b.id, -1)} onPlus={() => c.onBump?.(b.id, 1)} />}
          {b.kind === 'nitro' && m !== PAL && <span className="blk-count gb-num-disc gb-delta"><b className="gb-num">−1</b></span>}
        </div>
        {c.crashId === b.id && <CrashTag />}
      </div>
    );
  }

  if (it.kind === 'repeat' && b.kind === 'repeat') {
    const arm = it.arm!;
    const mouth = it.mouth!;
    const wide = it.w >= 330;
    const word = it.w >= 290 || m.small;
    const laps = b.n === 'laps';
    return (
      <div {...common} className={`${common.className} gb-c`}>
        <Paper d={cPath(it.w, arm, mouth, m.foot, d)} w={it.w} h={it.h} />
        <div className="gb-arm" style={{ height: arm }} role={live ? 'button' : undefined} tabIndex={live ? 0 : undefined} onKeyDown={live ? onKey(select) : undefined} aria-label="repetir">
          <div className="gb-row" style={{ height: m.arm }}>
            <span className="gb-glyph"><Glyph kind="repeat" size={m.small ? 26 : 34} /></span>
            {word && <span className="gb-word">repetir</span>}
            {m.plain ? null : laps
              ? <span className="gb-vueltas">vueltas</span>
              : <NumberDisc value={b.n as number} unit={wide && !m.small ? 'veces' : undefined} min={1} max={20} edit={edit && !m.small} onMinus={() => c.onBump?.(b.id, -1)} onPlus={() => c.onBump?.(b.id, 1)} />}
          </div>
          {it.lapsRow && (
            <div className="gb-lapsrow">
              <button
                type="button" className={`gb-chip${laps ? ' is-on' : ''}`} aria-pressed={laps} disabled={!edit}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); if (!c.suppress?.()) c.onLaps?.(b.id, !laps); }}
              >
                {laps ? 'Repite las vueltas de la pista' : 'Usar «vueltas»'}
              </button>
            </div>
          )}
        </div>
        <div className="gb-grip" style={{ top: it.h - m.foot, height: m.foot }} />
        {c.crashId === b.id && <CrashTag />}
      </div>
    );
  }

  if (it.kind === 'if' && b.kind === 'if') {
    const arm = it.arm!;
    return (
      <div {...common} className={`${common.className} gb-c`}>
        <Paper d={ifPath(it.w, arm, it.mouth!, m.elseH, it.mouthB!, m.foot, d)} w={it.w} h={it.h} />
        <div className="gb-arm" style={{ height: arm }} role={live ? 'button' : undefined} tabIndex={live ? 0 : undefined} onKeyDown={live ? onKey(select) : undefined} aria-label="si">
          <div className="gb-row gb-row-if" style={{ minHeight: arm }}>
            <span className="gb-word gb-si">si</span>
            <Pills it={it} c={c} m={m} />
          </div>
        </div>
        <div className="gb-else" style={{ top: arm + it.mouth!, height: m.elseH }}><span className="gb-word">si no</span></div>
        <div className="gb-grip" style={{ top: it.h - m.foot, height: m.foot }} />
        {c.crashId === b.id && <CrashTag />}
      </div>
    );
  }
  return null;
}

// ------------------------------------------------------------------ the rest of a canvas

function Marker({ it, c }: { it: Placed; c: BlockCtx }) {
  const slot = it.slot!;
  if (it.kind === 'gap') return <div className="gb-slot gb-gap" style={posStyle(it)} aria-hidden="true" />;
  if (it.kind === 'caret') {
    return (
      <div className="gb-slot gb-caret gx-caret" style={posStyle(it)} aria-label="Acá entra el próximo bloque">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3,6 L14,12 L3,18 Z" fill="#c9574a" stroke={INK} strokeWidth="2" strokeLinejoin="round" /></svg>
        <span>acá entra el bloque</span>
      </div>
    );
  }
  const text = c.emptyText?.(slot);
  const tap = !c.readOnly && c.onCaret ? () => { if (!c.suppress?.()) c.onCaret!(slot); } : undefined;
  return (
    <div className={`gb-slot gb-hole${tap ? ' is-tappable' : ''}`} style={posStyle(it)} role={tap ? 'button' : undefined} tabIndex={tap ? 0 : undefined} onClick={tap} onKeyDown={tap ? onKey(tap) : undefined} data-slot={JSON.stringify(slot)}>
      {text && <span>{text}</span>}
    </div>
  );
}

/** The start block of the main script and the event hat. */
function Head({ it, c, m, hat }: { it: Placed; c: BlockCtx; m: Metrics; hat: boolean }) {
  const d = dimsOf(m);
  if (!hat) {
    return (
      <div className="gb gb-start" style={{ ...posStyle(it), '--gb-fill': START_FILL } as CSSProperties}>
        <Paper d={startPath(it.w, it.h, d)} w={it.w} h={it.h} />
        <div className="gb-row gb-row-start"><StartSign size={m.small ? 20 : 26} /><span className="gb-word">{m.small ? 'Largar' : 'Al largar'}</span></div>
      </div>
    );
  }
  const id = it.id!;
  const select = () => { if (c.suppress?.()) return; if (c.pick) c.pick(id); else if (!c.readOnly) c.onSelect?.(id); };
  const edit = !c.readOnly && !c.pick;
  return (
    <div
      className={`gb gb-hat ${stateClasses(id, c)}${m.small ? ' is-small' : ''}`} style={{ ...posStyle(it), '--gb-fill': HAT_FILL } as CSSProperties}
      data-id={id} data-kind="on_log" role="button" tabIndex={0} aria-label="cuando cae un tronco"
      onClick={select} onKeyDown={onKey(select)} onPointerDown={c.onDown && edit ? (e) => c.onDown!(e, id) : undefined}
    >
      <Paper d={startPath(it.w, it.h, d)} w={it.w} h={it.h} />
      <div className="gb-row gb-row-hat">
        <span className="gb-glyph"><BlockIcon kind="on_log" size={m.small ? 30 : 38} bare /></span>
        <span className="gb-word">{m.small ? 'tronco' : 'cuando cae un tronco'}</span>
      </div>
      {c.crashId === id && <CrashTag />}
    </div>
  );
}

/** One script, drawn. */
export const BlockCanvas = memo(function BlockCanvas({ layout, c, m = FULL, label }: { layout: Layout; c: BlockCtx; m?: Metrics; label?: string }) {
  return (
    <div className="gb-canvas" style={{ width: layout.width, height: layout.height }} role="group" aria-label={label}>
      {layout.items.map((it) => {
        if (it.kind === 'start') return <Head key={it.key} it={it} c={c} m={m} hat={false} />;
        if (it.kind === 'hat') return <Head key={it.key} it={it} c={c} m={m} hat />;
        if (it.kind === 'hole' && m.plain) return null;
        if (it.kind === 'hole' || it.kind === 'gap' || it.kind === 'caret') return <Marker key={it.key + (it.slot ? JSON.stringify(it.slot) : '')} it={it} c={c} />;
        return <BlockItem key={it.key} it={it} c={c} m={m} />;
      })}
    </div>
  );
});

// ------------------------------------------------------------------ the palette

/** A block of the palette: the same piece, smaller, with its mouth shut (a container is a small C). */
export function PaletteBlock({ kind, rules, state, hinted, full, onDown, onTap, onKey: onKeyDown }: {
  kind: BlockKind; rules: Rules; state?: string; hinted?: boolean; full?: boolean;
  onDown(e: ReactPointerEvent<HTMLElement>, kind: BlockKind): void; onTap(kind: BlockKind): void; onKey?(e: ReactKeyboardEvent): void;
}) {
  const container = kind === 'repeat' || kind === 'if';
  const w = PAL_W;
  const block = makeBlock(kind, rules, 'pal');
  const layout = layoutScript([block], { script: 'main', width: w, metrics: PAL, sensors: [], caret: null });
  const it = layout.items.find((x) => x.kind !== 'hole')!;
  const c: BlockCtx = { readOnly: true, selected: null, live: NO_LIVE, crashId: null, wrongId: null, sensors: [] };
  const h = it.h;
  return (
    <button
      type="button" data-pal={kind} aria-label={BLOCK_LABEL[kind]}
      className={`gb-pal${container ? ' is-container' : ''}${hinted ? ' is-hinted' : ''}${full ? ' is-full' : ''} ${state ?? ''}`}
      style={{ width: w, height: h }}
      onPointerDown={(e) => onDown(e, kind)} onClick={() => onTap(kind)} onKeyDown={onKeyDown}
    >
      <BlockCanvas layout={layout} c={c} m={PAL} />
    </button>
  );
}

/** A sensor piece of the palette ("Mirar"): a condition shape that goes into the hole of a `si`. */
export function PaletteSensor({ sensor, hinted, onDown, onTap }: {
  sensor: Sensor; hinted?: boolean;
  onDown(e: ReactPointerEvent<HTMLElement>, sensor: Sensor): void; onTap(sensor: Sensor): void;
}) {
  const [top, bottom] = SENSOR_LABEL[sensor].split(' adelante').length > 1 ? [SENSOR_LABEL[sensor].replace(' adelante', ''), 'adelante'] : [SENSOR_LABEL[sensor], ''];
  return (
    <button
      type="button" data-pal-sensor={sensor} aria-label={SENSOR_LABEL[sensor]}
      className={`gb-pal gb-pal-sensor${hinted ? ' is-hinted' : ''}`} style={{ width: PAL_W, height: 48 }}
      onPointerDown={(e) => onDown(e, sensor)} onClick={() => onTap(sensor)}
    >
      <CondShape w={PAL_W} h={48} />
      <span className="gb-pal-sensor-in">
        <SensorIcon sensor={sensor} size={28} />
        <span className="gb-pal-sensor-words"><b>{top}</b>{bottom && <i>{bottom}</i>}</span>
      </span>
    </button>
  );
}

/** A sensor piece in the hand while it is dragged. */
export function HeldSensor({ sensor }: { sensor: Sensor }) {
  const w = PILL_W[sensor];
  return (
    <div className="gb-pill gb-pill-held" style={{ '--w': `${w}px`, height: 40, width: w } as CSSProperties}>
      <CondShape w={w} h={40} />
      <span className="gb-pill-in"><SensorIcon sensor={sensor} size={28} /><span className="gb-pill-word">{SENSOR_LABEL[sensor]}</span></span>
    </div>
  );
}

/** What the hand holds while a block is dragged: the block with everything inside it, one piece. */
export function HeldBlock({ block, width, m = FULL, sensors }: { block: Block; width: number; m?: Metrics; sensors: readonly Sensor[] }) {
  const layout = layoutScript([block], { script: 'main', width, metrics: m, sensors, caret: null });
  const c: BlockCtx = { readOnly: true, selected: null, live: NO_LIVE, crashId: null, wrongId: null, sensors };
  return <BlockCanvas layout={layout} c={c} m={m} />;
}

/** The event hat in the hand (it can only be thrown away). */
export function HeldHat({ width, m = FULL }: { width: number; m?: Metrics }) {
  const it: Placed = { key: 'hat', kind: 'hat', id: 'held', x: 0, y: 0, w: width, h: m.hat, depth: 0 };
  const c: BlockCtx = { readOnly: true, selected: null, live: NO_LIVE, crashId: null, wrongId: null, sensors: [] };
  return <div className="gb-canvas" style={{ width, height: m.hat }}><Head it={it} c={c} m={m} hat /></div>;
}

export type { ReactNode };
