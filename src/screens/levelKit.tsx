// Pieces every kind of level page shares: the board hook, the spoken
// instruction, the ghost hand, the page shell (bar + zones), the three
// controls and the ?debug hooks. Split from LevelScreen so the 3ro game page
// (RealtimeLevel) uses the very same ones.

import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { BoardView, aspectOf, frameOf, type Frame } from '../ui/board/BoardView';
import { playGhost, type DemoStep, type GhostRun } from '../ui/ghost';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { RestartIcon } from '../ui/icons';
import { NextPageArt } from '../ui/art';
import { notebookWidth } from '../blocks/BlockEditor';
import { nextLevel, type LevelDef } from '../game/levels';
import { cmdProgram } from '../game/model';
import { stamp, useStamps } from '../game/progress';
import { BROTE, LevelBar } from './LevelBar';

export const DEBUG = typeof location !== 'undefined' && location.search.includes('debug');

/** The paper around a level's board(s): headroom for one-row paths and for games, room for the jar of points. */
export const frameFor = (level: LevelDef): Frame => frameOf(level.worlds[0], {
  worlds: level.worlds.length,
  game: level.mode === 'realtime',
  jar: level.realtime?.win.kind === 'score',
});

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

/** Speaks the instruction when the page opens (after the first tap if the browser asks for one). */
export function useInstruction(level: LevelDef) {
  useEffect(() => {
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(level.say); }, 450);
    return () => { clearTimeout(t); off(); stopSpeaking(); };
  }, [level]);
  return useCallback(() => speak(level.say), [level]);
}

/** The ghost hand, one at a time, cancelled when the page goes away. */
export function useGhost(root: React.RefObject<HTMLElement | null>) {
  const run = useRef<GhostRun | null>(null);
  useEffect(() => () => run.current?.cancel(), []);
  return useCallback((steps: DemoStep[]): Promise<void> | null => {
    const el = root.current;
    if (!el || run.current) return null;
    const g = playGhost(el, steps);
    run.current = g;
    return g.done.then(() => { if (run.current === g) run.current = null; });
  }, [root]);
}

export function goNext(level: LevelDef) {
  const n = nextLevel(level.id);
  location.hash = n ? `#/nivel/${n.id}` : '#/';
}

export function Sheet({ svgRef, level }: { svgRef: React.RefObject<SVGSVGElement | null>; level: LevelDef }) {
  const b = level.worlds[0];
  return (
    <div className="sheet" data-zone="stage">
      <span className="tape tape-l" aria-hidden="true" />
      <span className="tape tape-r" aria-hidden="true" />
      <svg ref={svgRef} className="board" role="img" aria-label={`Tablero de ${b.cols} por ${b.rows}`} />
    </div>
  );
}

export function NextPage({ level }: { level: LevelDef }) {
  return (
    <button type="button" className="next-page cut pop-in" aria-label="Hoja siguiente" onClick={() => goNext(level)}>
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

export function Quit() {
  return <a className="quit" href="#/">salir</a>;
}

export interface ShellProps {
  level: LevelDef;
  mode: 'direct' | 'program' | 'realtime';
  /** The notebook's width, when the page's notebook is not a program's (3ro rule cards). */
  notebookW?: number;
  rootRef: React.RefObject<HTMLElement | null>;
  onSpeak: () => void;
  onHelp: () => void;
  busy: boolean;
  children: ReactNode;
}

export function Shell({ level, mode, rootRef, onSpeak, onHelp, busy, children, notebookW }: ShellProps) {
  const stamps = useStamps();
  return (
    <main
      ref={rootRef}
      className={`level mode-${mode}`}
      data-level={level.id}
      data-busy={busy ? 'true' : undefined}
      style={{
        '--aspect': aspectOf(level.worlds[0], frameFor(level)).toFixed(3),
        '--n': level.worlds.length,
        '--notebook-w': `${notebookW ?? notebookWidth(level.blocks, level.blockLabel)}px`,
      } as CSSProperties}
    >
      <LevelBar level={level} stamps={stamps} onSpeak={onSpeak} onHelp={onHelp} />
      {children}
      <Quit />
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
