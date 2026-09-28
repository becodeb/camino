// A workshop of 1ro's year (sheets 7 and 15): the child makes a level for a
// classmate. The editor is wordless, like the level pages it copies: the
// tools where the palette goes (Brote, the seed, the pot, a rock, the
// eraser), the board where the board goes, ▶ Probar and ↺ over it, ✋ in the
// bar. A tool is picked with a tap and used with a tap on a cell, or dragged
// onto a cell; a piece on the board is dragged to another cell. ▶ asks the
// solver first: a level that cannot be finished (or does not fit a
// notebook) is refused without words (Brote looks puzzled, what he cannot
// reach wiggles); a good one opens its test page, the normal level page with
// the notebook the classmates will get. Winning it offers the push-pin that
// pins the level on the class corkboard.
//
// The first visit to the first workshop starts with the ghost hand: it puts
// the seed on the board and points at ▶.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { publish, progress, saveDraft, sheetState, useProgress, type Progress } from '../curriculum/progress';
import { MAP_HREF, sheetHref, type SheetPage } from '../curriculum/route';
import type { Sheet } from '../curriculum/model';
import {
  TOOLS, applyTool, blockedPiece, boardOf, defaultDraft, draftLevel, movePiece, nextMadeId, pieceAt, untouched, usesRepeat, verdictOf,
  type Draft, type Edit, type Piece, type Tool, type Verdict,
} from '../curriculum/workshop';
import { aspectOf, frameOf } from '../ui/board/BoardView';
import { EditorView } from '../ui/board/EditorView';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { PlayIcon } from '../ui/icons';
import { PenRing, PotIcon, Portrait, SeedIcon, Stamp, ThenArrow } from '../ui/art';
import { CorkIcon, EraserIcon, MakeIcon, PinCardArt, RockIcon } from '../ui/workshopArt';
import type { Cell } from '../game/model';
import { BROTE, Bar } from './LevelBar';
import { LevelScreen } from './LevelScreen';
import { LevelNavContext, Quit, RestartButton, useDebugHooks, useGhost, type LevelNav } from './levelKit';
import { Redirect, SeedPouch, withSheetLine } from './yearKit';

/** Spoken lines (es-AR). The board says the rest. */
export const WORKSHOP_LINES = {
  editor: 'Elegí una herramienta y tocá el tablero: mové a Brote, la semilla y la maceta, y poné piedras. Cuando esté listo, tocá Probar.',
  editorLimited: 'Elegí cuántos renglones tiene el cuaderno y armá un camino donde haga falta repetir. Cuando esté listo, tocá Probar.',
  unreachable: 'Brote no puede llegar. Sacá alguna piedra o mové las cosas.',
  long: 'Es un camino muy largo: no entra en el cuaderno. Acercá la maceta.',
  flat: 'Así se puede sin repetir. Sacá renglones del cuaderno.',
  more: 'Con repetir tampoco entra. Agregá un renglón.',
  pattern: 'En este camino no hay nada que se repita. Probá con un camino más largo y derecho.',
  proven: '¡Tu nivel anda! Tocá la chinche y colgalo en la cartelera.',
};

const TOOL_LABEL: Record<Tool, string> = { start: 'Brote', seed: 'La semilla', goal: 'La maceta', rock: 'Una piedra', eraser: 'La goma' };

/** Drafts whose guided start already played in this visit. */
const guided = new Set<number>();
/** The level just pinned from a test page: the corkboard pins it with a flourish. */
export const justPinned: { id: string | null } = { id: null };

const cellOf = (at: readonly [number, number]): Cell => ({ c: at[0], r: at[1] });
const draftOf = (p: Progress, s: Sheet) => p.drafts[String(s.n)] ?? defaultDraft(!!s.workshop?.limited);

// ------------------------------------------------------------------ the bar

/** The workshop's pages in the bar: making the level, and the corkboard. Stamped as the sheet gets done. */
export function WorkshopPages({ sheet, current }: { sheet: Sheet; current: SheetPage }) {
  const st = sheetState(sheet, useProgress());
  const onMake = current.kind === 'taller' || current.kind === 'probar';
  const onCork = current.kind === 'cartelera' || current.kind === 'tarjeta';
  return (
    <nav className="sheet-pages work-pages" aria-label="Páginas del taller">
      <a className={`bar-work${onMake ? ' is-here' : ''}`} href={sheetHref(sheet.n, { kind: 'taller' })} aria-label={`Armar un nivel${st.published ? ', hecho' : ''}`} data-work="taller">
        <MakeIcon size={42} />
        {st.published > 0 && <Stamp seed={sheet.n + 1} />}
        {onMake && <PenRing seed={sheet.n + 3} />}
      </a>
      <a className={`bar-work${onCork ? ' is-here' : ''}`} href={sheetHref(sheet.n, { kind: 'cartelera' })} aria-label={`La cartelera${st.playedOthers ? ', jugaste un nivel de un compañero' : ''}`} data-work="cartelera">
        <CorkIcon size={42} />
        {st.playedOthers && <Stamp seed={sheet.n + 2} />}
        {onCork && <PenRing seed={sheet.n + 4} />}
      </a>
    </nav>
  );
}

/** The editor's instruction, drawn: Brote, then a level being drawn, then the corkboard. */
function MakeTask() {
  return (
    <span className="drawn-task" aria-hidden="true">
      <Portrait def={BROTE} className="bar-face" />
      <ThenArrow />
      <MakeIcon size={46} />
      <ThenArrow />
      <CorkIcon size={42} />
    </span>
  );
}

/** A tool (or a piece being dragged), drawn. */
export function ToolArt({ tool }: { tool: Tool }) {
  if (tool === 'start') return <Portrait def={BROTE} className="tool-face" />;
  if (tool === 'seed') return <SeedIcon size={50} />;
  if (tool === 'goal') return <PotIcon size={50} />;
  if (tool === 'rock') return <RockIcon size={60} />;
  return <EraserIcon size={58} />;
}

// ------------------------------------------------------------------ the editor

type Hold =
  | { kind: 'tool'; tool: Tool }
  | { kind: 'piece'; from: Cell; piece: Piece }
  | { kind: 'cell'; at: Cell };

export function EditorPage({ sheet }: { sheet: Sheet }) {
  const limited = !!sheet.workshop?.limited;
  const river = sheet.zone === 'rio';
  const draft = draftOf(useProgress(), sheet);
  const rootRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const ghost = useGhost(rootRef);
  const [tool, setTool] = useState<Tool>('rock');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const placed = useRef<Cell | null>(null);
  const board = useMemo(() => boardOf(draft.board, { river, seed: 7000 + sheet.n }), [draft.board, river, sheet.n]);
  const frame = useMemo(() => frameOf(board), [board]);
  const line = limited ? WORKSHOP_LINES.editorLimited : WORKSHOP_LINES.editor;

  // the board view: made once, redrawn on every edit (the piece just placed pops in)
  useEffect(() => {
    let v = viewRef.current;
    if (!v) {
      v = new EditorView(svgRef.current!);
      viewRef.current = v;
      v.show(board, { frame, first: true });
      v.setCharacter(BROTE);
      return;
    }
    v.show(board, { frame, placed: placed.current });
    placed.current = null;
  }, [board, frame]);
  useEffect(() => () => { viewRef.current?.destroy(); viewRef.current = null; }, []);

  /** Brote is reacting (the buttons wait, greyed), or the ghost hand is working (`grey` false: they only wait). */
  const hold = (on: boolean, grey = true) => { busyRef.current = on; setBusy(on && grey); };

  // ---------------------------------------------------------------- edits
  const save = (d: Draft) => progress.update((x) => saveDraft(x, sheet.n, { board: d.board, lines: d.lines }));
  const commit = (e: Edit, cell: Cell) => {
    if (e.refused) { viewRef.current?.wiggleAt(cellOf(e.refused)); return; }
    if (!e.changed) return;
    placed.current = cell;
    save({ ...draftOf(progress.get(), sheet), board: e.board });
  };
  const applyAt = (t: Tool, cell: Cell) => commit(applyTool(draftOf(progress.get(), sheet).board, t, [cell.c, cell.r]), cell);
  const moveTo = (from: Cell, to: Cell) => commit(movePiece(draftOf(progress.get(), sheet).board, [from.c, from.r], [to.c, to.r]), to);

  const startOver = () => {
    if (busyRef.current) return;
    save(defaultDraft(limited));
  };

  // ---------------------------------------------------------------- ▶: the solver first
  const refuse = async (v: Exclude<Verdict, { ok: true }>) => {
    const view = viewRef.current;
    if (!view) return;
    hold(true);
    speak(WORKSHOP_LINES[v.why]);
    const b = draftOf(progress.get(), sheet).board;
    if (v.why === 'unreachable') view.wiggleAt(cellOf(blockedPiece(b) === 'seed' ? b.seed : b.goal));
    if (v.why === 'long') view.wiggleAt(cellOf(b.goal));
    await view.puzzled();
    hold(false);
  };

  const tryIt = () => {
    if (busyRef.current) return;
    const v = verdictOf(draftOf(progress.get(), sheet), limited);
    if (v.ok) location.hash = sheetHref(sheet.n, { kind: 'probar' });
    else void refuse(v);
  };

  // ---------------------------------------------------------------- the ghost hand
  /** The guided start: the hand puts the seed on the board, then points at ▶. */
  const playIntro = () => {
    if (busyRef.current) return;
    const d = draftOf(progress.get(), sheet);
    const to: Cell = { c: d.board.seed[0], r: Math.max(0, d.board.seed[1] - 1) };
    if (pieceAt(d.board, [to.c, to.r])) return;
    hold(true, false);
    const run = ghost([
      { do: 'drag', from: '.zone-tools [data-tool="seed"]', to: `.editor-board [data-cell="${to.c},${to.r}"]`, apply: () => { setTool('seed'); applyAt('seed', to); } },
      { do: 'wait', ms: 300 },
      { do: 'point', at: ['.btn-play'] },
    ], { pace: 0.9 });
    if (run) void run.then(() => hold(false)); else hold(false);
  };

  const help = () => {
    if (busyRef.current) return;
    const d = draftOf(progress.get(), sheet);
    if (untouched(d, limited)) { playIntro(); return; }
    const v = verdictOf(d, limited);
    if (v.ok) { ghost([{ do: 'point', at: ['.btn-play'] }]); return; }
    const b = d.board;
    const cell = (at: readonly [number, number]) => `.editor-board [data-cell="${at[0]},${at[1]}"]`;
    if (v.why === 'unreachable') ghost([{ do: 'point', at: [cell(blockedPiece(b) === 'seed' ? b.seed : b.goal), '.zone-tools [data-tool="eraser"]'] }]);
    else if (v.why === 'long') ghost([{ do: 'point', at: [cell(b.goal), '.zone-tools [data-tool="goal"]'] }]);
    else ghost([{ do: 'point', at: ['.zone-tools [data-tool="rock"]', '.btn-play'] }]);
  };

  // the page's line (the sheet's own the first time); the first workshop's guided start once per visit
  useEffect(() => {
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(withSheetLine(sheet, line)); }, 450);
    let intro = 0;
    if (!limited && !guided.has(sheet.n) && untouched(draftOf(progress.get(), sheet), limited)) {
      guided.add(sheet.n);
      intro = window.setTimeout(playIntro, 1400);
    }
    return () => { clearTimeout(t); clearTimeout(intro); off(); stopSpeaking(); };
    // once per page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- taps and drags
  const pending = useRef<{ h: Hold; x0: number; y0: number; id: number; drag: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<Tool | null>(null);
  const dragEl = useRef<HTMLDivElement>(null);
  const dragAt = useRef({ x: 0, y: 0 });
  const place = () => { if (dragEl.current) dragEl.current.style.transform = `translate(${dragAt.current.x - 40}px, ${dragAt.current.y - 36}px)`; };

  const toolDown = (t: Tool) => (e: ReactPointerEvent<HTMLElement>) => {
    if (busyRef.current || pending.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pending.current = { h: { kind: 'tool', tool: t }, x0: e.clientX, y0: e.clientY, id: e.pointerId, drag: false };
  };
  const boardDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (busyRef.current || pending.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const cell = viewRef.current?.cellAt(e.clientX, e.clientY);
    if (!cell) return;
    const piece = pieceAt(draftOf(progress.get(), sheet).board, [cell.c, cell.r]);
    pending.current = { h: piece ? { kind: 'piece', from: cell, piece } : { kind: 'cell', at: cell }, x0: e.clientX, y0: e.clientY, id: e.pointerId, drag: false };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const pd = pending.current;
      if (!pd || e.pointerId !== pd.id || pd.h.kind === 'cell') return;
      if (!pd.drag) {
        if (Math.hypot(e.clientX - pd.x0, e.clientY - pd.y0) < 8) return;
        pd.drag = true;
        setDrag(pd.h.kind === 'tool' ? pd.h.tool : pd.h.piece);
      }
      e.preventDefault();
      dragAt.current = { x: e.clientX, y: e.clientY };
      place();
      viewRef.current?.setTarget(viewRef.current.cellAt(e.clientX, e.clientY));
    };
    const up = (e: PointerEvent) => {
      const pd = pending.current;
      if (!pd || e.pointerId !== pd.id) return;
      pending.current = null;
      const view = viewRef.current;
      if (pd.drag) {
        suppressClick.current = true;
        setTimeout(() => { suppressClick.current = false; }, 0);
        setDrag(null);
        view?.setTarget(null);
        const to = view?.cellAt(e.clientX, e.clientY);
        if (!to) return;
        if (pd.h.kind === 'tool') { setTool(pd.h.tool); applyAt(pd.h.tool, to); } else if (pd.h.kind === 'piece') moveTo(pd.h.from, to);
        return;
      }
      if (pd.h.kind === 'cell') applyAt(toolRef.current, pd.h.at);
      else if (pd.h.kind === 'piece') applyAt(toolRef.current, pd.h.from);
    };
    const cancel = (e: PointerEvent) => {
      if (pending.current?.id !== e.pointerId) return;
      pending.current = null;
      setDrag(null);
      viewRef.current?.setTarget(null);
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
  const toolRef = useRef(tool);
  toolRef.current = tool;
  useEffect(() => { if (drag) place(); }, [drag]);

  const pick = (t: Tool) => { if (!suppressClick.current && !busyRef.current) setTool(t); };

  useDebugHooks({ draft, tool, pick, use: (t: Tool, c: number, r: number) => applyAt(t, { c, r }), tryIt, help, playIntro, verdict: () => verdictOf(draftOf(progress.get(), sheet), limited) });

  return (
    <main
      ref={rootRef}
      className="level mode-taller"
      data-sheet={sheet.n}
      data-busy={busy ? 'true' : undefined}
      style={{ '--aspect': aspectOf(board, frame).toFixed(3) } as CSSProperties}
    >
      <Bar
        instruction={<MakeTask />}
        title={<><b>Hoja {sheet.n} · taller</b> {sheet.title}</>}
        pages={<WorkshopPages sheet={sheet} current={{ kind: 'taller' }} />}
        aside={<SeedPouch />}
        onSpeak={() => speak(line)}
        onHelp={help}
      />
      <section className="zone zone-palette zone-tools" data-zone="palette" aria-label="Herramientas">
        {TOOLS.map((t, i) => (
          <button
            key={t}
            type="button"
            className={`tool cut is-${t}${tool === t ? ' is-active' : ''}`}
            data-tool={t}
            aria-label={TOOL_LABEL[t]}
            aria-pressed={tool === t}
            onPointerDown={toolDown(t)}
            onClick={() => pick(t)}
          >
            <ToolArt tool={t} />
            {tool === t && <PenRing seed={i + 2} />}
          </button>
        ))}
      </section>
      <section className="level-stage" aria-label="Tablero">
        <div className="controls">
          <button type="button" className="btn btn-play cut" onClick={tryIt} disabled={busy} aria-label="Probar">
            <PlayIcon /><span>Probar</span>
          </button>
          <RestartButton onClick={startOver} disabled={busy} />
        </div>
        <div className="sheet" data-zone="stage">
          <span className="tape tape-l" aria-hidden="true" />
          <span className="tape tape-r" aria-hidden="true" />
          <svg ref={svgRef} className="board editor-board" role="group" aria-label="El tablero de tu nivel" onPointerDown={boardDown} />
        </div>
      </section>
      <Quit href={MAP_HREF} />
      {drag && createPortal(<div ref={dragEl} className="tool-drag" aria-hidden="true"><ToolArt tool={drag} /></div>, document.body)}
    </main>
  );
}

// ------------------------------------------------------------------ the test page

/** The level being made, played by its author with the classmates' notebook; winning it offers the push-pin. */
export function TestPage({ sheet }: { sheet: Sheet }) {
  const limited = !!sheet.workshop?.limited;
  const [made] = useState(() => {
    const d = draftOf(progress.get(), sheet);
    const v = verdictOf(d, limited);
    return v.ok ? { d, v, level: draftLevel(sheet, d, v) } : null;
  });
  const nav = useMemo<LevelNav | null>(() => (made ? {
    pages: () => <WorkshopPages sheet={sheet} current={{ kind: 'probar' }} />,
    title: () => <><b>Hoja {sheet.n} · taller · a prueba</b> {sheet.title}</>,
    won: (_level, program) => {
      if (program) progress.update((x) => saveDraft(x, sheet.n, { ...made.d, proof: program }));
      return WORKSHOP_LINES.proven;
    },
    next: () => pinIt(sheet, made.v.lines),
    nextArt: <PinCardArt />,
    nextLabel: 'Colgar tu nivel en la cartelera',
    quit: MAP_HREF,
    say: (level) => withSheetLine(sheet, level.say),
    className: 'is-test',
    aside: <SeedPouch />,
  } : null), [made, sheet]);
  if (!made || !nav) return <Redirect to={sheetHref(sheet.n, { kind: 'taller' })} />;
  return (
    <LevelNavContext.Provider value={nav}>
      <LevelScreen key={made.level.id} level={made.level} />
    </LevelNavContext.Provider>
  );
}

/**
 * The author's level, proven by their own win, goes on the corkboard with
 * their program; the workshop starts a new draft. A limited level's program
 * uses a repeat (no plan without one fits its lines, so it must).
 */
function pinIt(sheet: Sheet, lines: number) {
  const p = progress.get();
  const d = p.drafts[String(sheet.n)];
  if (!d?.proof || (sheet.workshop?.limited && !usesRepeat(d.proof))) return;
  const id = nextMadeId(p);
  progress.update((x) => publish(x, { id, sheet: sheet.n, board: d.board, lines, solution: d.proof! }));
  justPinned.id = id;
  location.hash = sheetHref(sheet.n, { kind: 'cartelera' });
}
