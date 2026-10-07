// Pieces every kind of level page shares: the board hook, the spoken
// instruction, the ghost hand, the page shell (bar + zones), the three
// controls and the ?debug hooks. Split from LevelScreen so the 3ro game page
// (RealtimeLevel) uses the very same ones.
//
// Where a page belongs is a context (LevelNav): the demo's tramo by default
// (its pages in the bar, the stamp, the next page of the tramo), or a sheet
// of 1ro's year (its pages, doors and boss, the seed, the next page of the
// sheet). The level pages themselves do not know which.

import { createContext, useCallback, useContext, useEffect, useRef, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { BoardView, aspectOf, frameOf, type Frame } from '../ui/board/BoardView';
import { GUARDA_FRAME } from '../ui/board/GuardaView';
import { MUSIC_FRAME } from '../ui/board/MusicView';
import { playGhost, type DemoStep, type GhostRun } from '../ui/ghost';
import { useIdleNudge } from '../ui/idleNudge';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { RestartIcon } from '../ui/icons';
import { NextPageArt } from '../ui/art';
import { notebookWidth } from '../blocks/BlockEditor';
import { GRADES, nextLevel, type LevelDef, type PaletteBlock } from '../game/levels';
import { cmdProgram, type Program } from '../game/model';
import type { Rule } from '../game/rules';
import { stamp, useStamps } from '../game/progress';
import { LevelBar, TramoPages } from './LevelBar';
import { playerKey, usePlayer } from './player';

export const DEBUG = typeof location !== 'undefined' && location.search.includes('debug');

/** The paper around a level's board(s): headroom for one-row paths and for games, room for the jar of points; a music page's for its song strip, a guarda's for the riverbank. */
export const frameFor = (level: LevelDef): Frame => (level.music ? MUSIC_FRAME : level.guarda ? GUARDA_FRAME : frameOf(level.worlds[0], {
  worlds: level.worlds.length,
  game: level.mode === 'realtime',
  jar: level.realtime?.win.kind === 'score',
}));

/** The board: one BoardView on one <svg>, rebuilt per level; the player (dressed) walks it. */
export function useBoard(level: LevelDef) {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef<BoardView | null>(null);
  const player = usePlayer();
  const playerRef = useRef(player);
  playerRef.current = player;
  useEffect(() => {
    const v = new BoardView(svgRef.current!);
    viewRef.current = v;
    v.setBoard(level.worlds[0], { pop: true, frame: frameFor(level) });
    v.setCharacter(playerRef.current.def, playerRef.current.outfit);
    return () => { v.destroy(); viewRef.current = null; };
  }, [level]);
  useRedress([viewRef], player);
  return { svgRef, viewRef };
}

/** The player changed while the page is open (the dev drawer, the wardrobe): the boards' character pops in again, dressed. */
export function useRedress(views: React.RefObject<BoardView | BoardView[] | null>[], player: ReturnType<typeof usePlayer>) {
  const shown = useRef(playerKey(player));
  useEffect(() => {
    const key = playerKey(player);
    if (key === shown.current) return;
    shown.current = key;
    for (const r of views) for (const v of [r.current ?? []].flat()) v.setCharacter(player.def, player.outfit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerKey(player)]);
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
  /** In the controls, after the gold seal: what the page sends to the garden (a boss's reward card; `won`: just now), or who cheers. */
  reward?(level: LevelDef, won: boolean): ReactNode;
  /** ▶ started a run (the showcase's cheering character hops). */
  onRun?(): void;
  /** A run ended: won, bumped, or short (the showcase's cheering character reacts). */
  onResult?(r: 'win' | 'crash' | 'short'): void;
  /** In the notebook, under the program (the gold challenge's note of the child's long plan). */
  notebook?: ReactNode;
  /** Where "next page" goes. */
  next(level: LevelDef): void;
  /** What the next-page button shows instead of the page to turn, and says to a screen reader (a workshop's test page: pin the level). */
  nextArt?: ReactNode;
  nextLabel?: string;
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
  // ---------------------------------------------------------------- instrumentation (the pilot playtest); absent: nothing changes
  /** Every ▶, with the program as run and what came of it (also an empty or incomplete notebook, which does not run). */
  onRunReport?(r: RunReport): void;
  /** 🔊 was pressed. */
  onSpeak?(level: LevelDef): void;
  /** ✋ was pressed: the nav decides what to show (`show`: the page's own next-step hint with the ghost hand). */
  help?(level: LevelDef, show: () => void): void;
  /** A block went into the notebook by a tap on the palette. */
  onTapAdd?(level: LevelDef): void;
  /** A drag in the notebook began, or ended (`success`: the program changed; `outcome`: add, move, remove, cancel, rejected…). */
  onDrag?(phase: 'start' | 'drop', info?: { success: boolean; outcome: string; from: 'palette' | 'program' }): void;
  /** The ghost hand's concept demo played by itself (a new idea, after a full notebook or a failed run). */
  onIntro?(level: LevelDef): void;
  /**
   * The page registers what to report before it ends from outside (the
   * ladder's caps): a rule game still running reports its game as a run.
   * Returns the unregister function.
   */
  onEnding?(flush: () => void): () => void;
}

/**
 * One press of ▶, for the playtest's `run` event. `result`: 'win', 'bump',
 * 'short', 'wrong_note' (a song), 'smudge' (a guarda), 'wrong_guess' (a
 * predict page); or, without a run, 'empty', 'incomplete' (a complete page
 * with a line or a count missing), 'no_guess' (predict, ▶ before a guess).
 * A rule game (3ro) reports one game, from ▶ to ■, ↺ or the win: 'win',
 * 'stopped' (stopped after the child pressed an arrow) or 'no_play'
 * (stopped before any arrow), with its rules, keys and score; or
 * 'unfinished' (the page ended from outside, `onEnding`, while a game the
 * child pressed arrows in was still running).
 */
export interface RunReport {
  result: string;
  /** The notebook as run (empty for a rule game: see `rules`). */
  program: Program;
  /** A rule game's rules when the game ended. */
  rules?: Rule[];
  /** A rule game: arrows the child pressed while it ran, and the points in the jar. */
  keys?: number;
  score?: number;
  /** Per world, when there are several ('win' | 'crash' | 'short'). */
  worlds?: string[];
  /** The block that tripped (its ref key in the notebook). */
  culprit?: string;
  /** Predict: the cell guessed and where the character ended. */
  guess?: { c: number; r: number };
  final?: { c: number; r: number };
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

/**
 * Wraps every level page of a screen someone else hosts (the pilot
 * playtest's free play instruments the sheets' pages this way: the wrap
 * reads the page's own LevelNav and provides an instrumented one). Absent:
 * nothing changes. LevelScreen clears it inside, so a page is wrapped once.
 */
export type LevelWrap = ComponentType<{ level: LevelDef; children: ReactNode }>;
export const LevelWrapContext = createContext<LevelWrap | null>(null);

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

/**
 * The ghost hand, one at a time, cancelled when the page goes away — or
 * (T20) by any real tap or key from the child while it plays: a demo only
 * ever shows the gesture, so a child who already knows what to do (or just
 * wants to act) is never held up by it. The ghost's own moves never count:
 * it animates a detached hand and calls `apply()` directly, it never
 * dispatches a real pointer or keyboard event.
 */
export function useGhost(root: React.RefObject<HTMLElement | null>) {
  const run = useRef<GhostRun | null>(null);
  useEffect(() => {
    const el = root.current;
    const stop = () => run.current?.cancel();
    el?.addEventListener('pointerdown', stop, true);
    el?.addEventListener('keydown', stop, true);
    return () => {
      el?.removeEventListener('pointerdown', stop, true);
      el?.removeEventListener('keydown', stop, true);
      run.current?.cancel();
    };
  }, [root]);
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
    <button type="button" className="next-page cut pop-in" aria-label={nav.nextLabel ?? 'Hoja siguiente'} onClick={() => nav.next(level)}>
      {nav.nextArt ?? <NextPageArt />}
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
  useIdleNudge(rootRef);
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
      <LevelBar
        level={level} title={nav.title(level)} pages={nav.pages(level)} aside={nav.aside}
        onSpeak={nav.onSpeak ? () => { nav.onSpeak!(level); onSpeak(); } : onSpeak}
        onHelp={nav.help ? () => nav.help!(level, onHelp) : onHelp}
      />
      {children}
      <Quit href={nav.quit} />
    </main>
  );
}

// ------------------------------------------------------------------ test hooks

/** The pilot's demo sessions (T14) turn the page hooks on too: the demo bar's "Resolver este nivel" plays through them. */
let extraHooks = false;
export function setPageHooks(on: boolean) { extraHooks = on; }
export const pageHooksOn = () => DEBUG || extraHooks;

/** Automation hooks for screenshots, only with ?debug in the URL (or in a pilot demo session; never always-on). */
export function useDebugHooks(hooks: Record<string, unknown>) {
  useEffect(() => {
    if (!pageHooksOn()) return;
    (window as unknown as { __camino: unknown }).__camino = { ...hooks, cmdProgram, stamp };
  });
}
