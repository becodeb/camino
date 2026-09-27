// Pieces every kind of level page shares: the board hook, the spoken
// instruction, the ghost hand, the page shell (bar + zones), the three
// controls and the ?debug hooks. Split from LevelScreen so the 3ro game page
// (RealtimeLevel) uses the very same ones.
//
// Where a page belongs is a context (LevelNav): the demo's tramo by default
// (its pages in the bar, the stamp, the next page of the tramo), or a sheet
// of 1ro's year (its pages, doors and boss, the seed, the next page of the
// sheet). The level pages themselves do not know which.

import { createContext, useCallback, useContext, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { BoardView, aspectOf, frameOf, type Frame } from '../ui/board/BoardView';
import { MUSIC_FRAME } from '../ui/board/MusicView';
import { playGhost, type DemoStep, type GhostRun } from '../ui/ghost';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { RestartIcon } from '../ui/icons';
import { NextPageArt } from '../ui/art';
import { notebookWidth } from '../blocks/BlockEditor';
import { GRADES, nextLevel, type LevelDef, type PaletteBlock } from '../game/levels';
import { cmdProgram, type Program } from '../game/model';
import { stamp, useStamps } from '../game/progress';
import { BROTE, LevelBar, TramoPages } from './LevelBar';

export const DEBUG = typeof location !== 'undefined' && location.search.includes('debug');

/** The paper around a level's board(s): headroom for one-row paths and for games, room for the jar of points; a music page's for its song strip. */
export const frameFor = (level: LevelDef): Frame => (level.music ? MUSIC_FRAME : frameOf(level.worlds[0], {
  worlds: level.worlds.length,
  game: level.mode === 'realtime',
  jar: level.realtime?.win.kind === 'score',
}));

/** The board: one BoardView on one <svg>, rebuilt per level. */
export function useBoard(level: LevelDef) {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef<BoardView | null>(null);
  useEffect(() => {
    const v = new BoardView(svgRef.current!);
    viewRef.current = v;
    v.setBoard(level.worlds[0], { pop: true, frame: frameFor(level) });
    v.setCharacter(BROTE);
    return () => { v.destroy(); viewRef.current = null; };
  }, [level]);
  return { svgRef, viewRef };
}

// ------------------------------------------------------------------ where the page belongs

export interface LevelNav {
  /** The pages in the bar: the tramo's, or a sheet's pages, doors and boss. */
  pages(level: LevelDef): ReactNode;
  /** The adult's small print in the bar. */
  title(level: LevelDef): ReactNode;
  /**
   * The page was won with this program (its stamp, its seed, its gold). May
   * return the line to say instead of "¡Lo lograste!" (the gold seal's invitation).
   */
  won(level: LevelDef, program?: Program): string | void;
  /**
   * In the controls, next to the next-page button: the gold seal of a page
   * with a save-blocks challenge, once the page is solved (`won`: just now).
   */
  gold?(level: LevelDef, won: boolean): ReactNode;
  /** In the notebook, under the program (the gold challenge's note of the child's long plan). */
  notebook?: ReactNode;
  /** Where "next page" goes. */
  next(level: LevelDef): void;
  /** Where "salir" goes. */
  quit: string;
  /** What is spoken when the page opens (a sheet adds its own line the first time). Called once, when it is said. */
  say?(level: LevelDef): string;
  /** Drawn inside the board's sheet, around the board (the boss's frame). */
  decor?: ReactNode;
  /** A class on the page. */
  className?: string;
  /** After the pages in the bar (the seed pouch). */
  aside?: ReactNode;
}

function LiveTramoPages({ current }: { current: string }) {
  return <TramoPages current={current} stamps={useStamps()} />;
}

/** The demo's tramo: ten pages, stamps in memory, the next page of the tramo. */
export const TRAMO_NAV: LevelNav = {
  pages: (level) => <LiveTramoPages current={level.id} />,
  title: (level) => <><b>{GRADES.find((g) => g.id === level.grade)!.label} · {level.page}</b> {level.title}</>,
  won: (level) => stamp(level.id),
  next: (level) => goNext(level),
  quit: '#/',
};

export const LevelNavContext = createContext<LevelNav>(TRAMO_NAV);
export const useLevelNav = () => useContext(LevelNavContext);

/** Speaks the instruction when the page opens (after the first tap if the browser asks for one). */
export function useInstruction(level: LevelDef) {
  const nav = useLevelNav();
  const navRef = useRef(nav);
  navRef.current = nav;
  useEffect(() => {
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(navRef.current.say?.(level) ?? level.say); }, 450);
    return () => { clearTimeout(t); off(); stopSpeaking(); };
  }, [level]);
  return useCallback(() => speak(level.say), [level]);
}

/** The ghost hand, one at a time, cancelled when the page goes away. */
export function useGhost(root: React.RefObject<HTMLElement | null>) {
  const run = useRef<GhostRun | null>(null);
  useEffect(() => () => run.current?.cancel(), []);
  return useCallback((steps: DemoStep[], opts?: { pace?: number }): Promise<void> | null => {
    const el = root.current;
    if (!el || run.current) return null;
    const g = playGhost(el, steps, opts);
    run.current = g;
    return g.done.then(() => { if (run.current === g) run.current = null; });
  }, [root]);
}

export function goNext(level: LevelDef) {
  const n = nextLevel(level.id);
  location.hash = n ? `#/nivel/${n.id}` : '#/';
}

/**
 * The notebook's width comes from the blocks the page can make; a page that
 * brings no blocks (a complete page missing only a count) still holds its
 * given program's tapes.
 */
export function notebookBlocks(level: LevelDef): PaletteBlock[] {
  const tapes = (level.given ?? []).some((it) => it.t === 'loop') && !level.blocks.includes('repeat') ? ['repeat'] : [];
  return [...level.blocks, ...tapes];
}

export function Sheet({ svgRef, level }: { svgRef: React.RefObject<SVGSVGElement | null>; level: LevelDef }) {
  const b = level.worlds[0];
  const nav = useLevelNav();
  return (
    <div className="sheet" data-zone="stage">
      {nav.decor}
      <span className="tape tape-l" aria-hidden="true" />
      <span className="tape tape-r" aria-hidden="true" />
      <svg ref={svgRef} className="board" role="img" aria-label={`Tablero de ${b.cols} por ${b.rows}`} />
    </div>
  );
}

export function NextPage({ level }: { level: LevelDef }) {
  const nav = useLevelNav();
  return (
    <button type="button" className="next-page cut pop-in" aria-label="Hoja siguiente" onClick={() => nav.next(level)}>
      <NextPageArt />
    </button>
  );
}

export function RestartButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="btn btn-restart cut" onClick={onClick} disabled={disabled} aria-label="Volver a empezar" title="Volver a empezar">
      <RestartIcon />
    </button>
  );
}

export function Quit({ href = '#/' }: { href?: string }) {
  return <a className="quit" href={href}>salir</a>;
}

export interface ShellProps {
  level: LevelDef;
  mode: 'direct' | 'program' | 'realtime';
  /** The notebook's width, when the page's notebook is not a program's (3ro rule cards). */
  notebookW?: number;
  /** No palette zone (predict pages, pages with nothing to bring): the notebook moves left. */
  noPalette?: boolean;
  rootRef: React.RefObject<HTMLElement | null>;
  onSpeak: () => void;
  onHelp: () => void;
  busy: boolean;
  children: ReactNode;
}

export function Shell({ level, mode, rootRef, onSpeak, onHelp, busy, children, notebookW, noPalette }: ShellProps) {
  const nav = useLevelNav();
  return (
    <main
      ref={rootRef}
      className={`level mode-${mode}${noPalette ? ' no-palette' : ''}${nav.className ? ` ${nav.className}` : ''}`}
      data-level={level.id}
      data-format={level.format ?? undefined}
      data-busy={busy ? 'true' : undefined}
      style={{
        '--aspect': aspectOf(level.worlds[0], frameFor(level)).toFixed(3),
        '--n': level.worlds.length,
        '--notebook-w': `${notebookW ?? notebookWidth(notebookBlocks(level), level.blockLabel)}px`,
      } as CSSProperties}
    >
      <LevelBar level={level} title={nav.title(level)} pages={nav.pages(level)} aside={nav.aside} onSpeak={onSpeak} onHelp={onHelp} />
      {children}
      <Quit href={nav.quit} />
    </main>
  );
}

// ------------------------------------------------------------------ test hooks

/** Automation hooks for screenshots, only with ?debug in the URL (never always-on). */
export function useDebugHooks(hooks: Record<string, unknown>) {
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __camino: unknown }).__camino = { ...hooks, cmdProgram, stamp };
  });
}
