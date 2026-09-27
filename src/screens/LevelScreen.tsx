// One page of the tramo. Full width, one row (design rule 2):
// - program mode: narrow palette | ruled notebook with the program | big taped board,
//   ▶ Probar and ↺ attached to the board;
// - direct mode (sala 4): no program, the board takes the screen and four big
//   drawn arrows sit around it; each tap is one step.
// The instruction is spoken on entry and by 🔊; ✋ plays the ghost hand.
// Failure is diegetic: Brote bumps or looks around, the block that tripped
// him shakes, the empty line calls. There is no "incorrect" anywhere.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BoardView, aspectOf } from '../ui/board/BoardView';
import { playGhost, type DemoStep, type GhostRun } from '../ui/ghost';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { PlayIcon, RestartIcon } from '../ui/icons';
import { NextPageArt, PadArrow } from '../ui/art';
import { useBlockEditor, type Marks } from '../blocks/BlockEditor';
import { refKey } from '../blocks/blocks';
import { appendSlot, insertAt, refusal, removeAt, type Block, type BlockRef, type DropResult } from '../game/editor';
import { completeProgram, move, nextMove, simulate } from '../game/engine';
import { nextLevel, type LevelDef } from '../game/levels';
import { cardCount, cmdProgram, initialState, type Dir, type Program, type RobotState, type TraceStep } from '../game/model';
import { stamp, useStamps } from '../game/progress';
import { BROTE, LevelBar } from './LevelBar';

const DEBUG = typeof location !== 'undefined' && location.search.includes('debug');

/** Short spoken lines (es-AR). The board says the rest. */
const LINES = {
  won: '¡Lo lograste!',
  empty: 'Poné flechas en el cuaderno.',
  full: 'No entran más.',
};

// ------------------------------------------------------------------ shared pieces

/** The board: one BoardView on one <svg>, rebuilt per level. */
function useBoard(level: LevelDef) {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef<BoardView | null>(null);
  useEffect(() => {
    const v = new BoardView(svgRef.current!);
    viewRef.current = v;
    v.setBoard(level.worlds[0], { pop: true });
    v.setCharacter(BROTE);
    return () => { v.destroy(); viewRef.current = null; };
  }, [level]);
  return { svgRef, viewRef };
}

/** Speaks the instruction when the page opens (after the first tap if the browser asks for one). */
function useInstruction(level: LevelDef) {
  useEffect(() => {
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(level.say); }, 450);
    return () => { clearTimeout(t); off(); stopSpeaking(); };
  }, [level]);
  return useCallback(() => speak(level.say), [level]);
}

/** The ghost hand, one at a time, cancelled when the page goes away. */
function useGhost(root: React.RefObject<HTMLElement | null>) {
  const run = useRef<GhostRun | null>(null);
  useEffect(() => () => run.current?.cancel(), []);
  return useCallback((steps: DemoStep[]) => {
    const el = root.current;
    if (!el || run.current) return;
    const g = playGhost(el, steps);
    run.current = g;
    void g.done.then(() => { if (run.current === g) run.current = null; });
  }, [root]);
}

function goNext(level: LevelDef) {
  const n = nextLevel(level.id);
  location.hash = n ? `#/nivel/${n.id}` : '#/';
}

function Sheet({ svgRef, level }: { svgRef: React.RefObject<SVGSVGElement | null>; level: LevelDef }) {
  const b = level.worlds[0];
  return (
    <div className="sheet" data-zone="stage">
      <span className="tape tape-l" aria-hidden="true" />
      <span className="tape tape-r" aria-hidden="true" />
      <svg ref={svgRef} className="board" role="img" aria-label={`Tablero de ${b.cols} por ${b.rows}`} />
    </div>
  );
}

function NextPage({ level }: { level: LevelDef }) {
  return (
    <button type="button" className="next-page cut pop-in" aria-label="Hoja siguiente" onClick={() => goNext(level)}>
      <NextPageArt />
    </button>
  );
}

function RestartButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="btn btn-restart cut" onClick={onClick} disabled={disabled} aria-label="Volver a empezar" title="Volver a empezar">
      <RestartIcon />
    </button>
  );
}

function Quit() {
  return <a className="quit" href="#/">salir</a>;
}

interface ShellProps {
  level: LevelDef;
  mode: 'direct' | 'program';
  rootRef: React.RefObject<HTMLElement | null>;
  onSpeak: () => void;
  onHelp: () => void;
  busy: boolean;
  children: ReactNode;
}

function Shell({ level, mode, rootRef, onSpeak, onHelp, busy, children }: ShellProps) {
  const stamps = useStamps();
  return (
    <main
      ref={rootRef}
      className={`level mode-${mode}`}
      data-level={level.id}
      data-busy={busy ? 'true' : undefined}
      style={{ '--aspect': aspectOf(level.worlds[0]).toFixed(3) } as CSSProperties}
    >
      <LevelBar level={level} stamps={stamps} onSpeak={onSpeak} onHelp={onHelp} />
      {children}
      <Quit />
    </main>
  );
}

// ------------------------------------------------------------------ direct control (sala 4)

function DirectLevel({ level }: { level: LevelDef }) {
  const board = level.worlds[0];
  const rootRef = useRef<HTMLElement>(null);
  const { svgRef, viewRef } = useBoard(level);
  const say = useInstruction(level);
  const ghost = useGhost(rootRef);
  const pos = useRef<RobotState>(initialState(board));
  const [won, setWon] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const queued = useRef<Dir | null>(null);

  const step = useCallback(async (dir: Dir) => {
    const v = viewRef.current;
    if (!v || won) return;
    if (busyRef.current) { queued.current = dir; return; }
    busyRef.current = true;
    setBusy(true);
    let next: Dir | null = dir;
    while (next) {
      const st = move(board, pos.current, next);
      queued.current = null;
      const res = await v.playDirect({ ...st, index: 0, cmd: next, ref: { item: 0 } } satisfies TraceStep);
      if (res === 'aborted') break;
      if (st.kind !== 'crash') pos.current = st.to;
      if (res === 'win') {
        stamp(level.id);
        setWon(true);
        speak(LINES.won);
        break;
      }
      next = queued.current;
    }
    busyRef.current = false;
    setBusy(false);
  }, [board, level, viewRef, won]);

  const restart = () => {
    if (busyRef.current) return;
    pos.current = initialState(board);
    setWon(false);
    void viewRef.current?.reset();
  };

  const help = () => {
    if (busyRef.current || won) return;
    const d = nextMove(board, pos.current);
    if (d) ghost([{ do: 'tap', at: `.pad-btn[data-dir="${d}"]` }]);
  };

  useEffect(() => {
    const keys: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    const on = (e: KeyboardEvent) => { const d = keys[e.key]; if (d) { e.preventDefault(); void step(d); } };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [step]);

  useDebugHooks({ level, tap: (d: Dir) => step(d), help, restart });

  const pad = (dir: Dir) => (
    <button key={dir} type="button" className={`pad-btn pad-${dir} cut`} data-dir={dir} aria-label={`Flecha ${dir}`} disabled={won} onClick={() => void step(dir)}>
      <PadArrow dir={dir} />
    </button>
  );

  return (
    <Shell level={level} mode="direct" rootRef={rootRef} onSpeak={say} onHelp={help} busy={busy}>
      <section className="pad" aria-label="Tablero">
        <div className="pad-corner pad-tl"><RestartButton onClick={restart} disabled={busy} /></div>
        {pad('up')}
        <div className="pad-corner pad-tr">{won && <NextPage level={level} />}</div>
        {pad('left')}
        <Sheet svgRef={svgRef} level={level} />
        {pad('right')}
        {pad('down')}
      </section>
    </Shell>
  );
}

// ------------------------------------------------------------------ programs (sala 5 on)

function ProgramLevel({ level }: { level: LevelDef }) {
  const board = level.worlds[0];
  const rootRef = useRef<HTMLElement>(null);
  const { svgRef, viewRef } = useBoard(level);
  const say = useInstruction(level);
  const ghost = useGhost(rootRef);
  const [program, setProgram] = useState<Program>([]);
  const [marks, setMarks] = useState<Marks>({});
  const [running, setRunning] = useState(false);
  const [won, setWon] = useState(false);
  const [shake, setShake] = useState(0);
  const runningRef = useRef(false);
  /** Brote is not on the start cell (after a run): the first edit sends him home. */
  const away = useRef(false);
  const maxCards = level.slots;

  const glance = (el: Element | null) => {
    const r = el?.getBoundingClientRect();
    if (r) viewRef.current?.glanceAt(r.left + r.width / 2, r.top + r.height / 2);
  };

  const edited = (next: Program, extra: Partial<Marks> = {}) => {
    setProgram(next);
    setMarks((m) => ({ activeTape: m.activeTape, ...extra }));
    if (away.current) { away.current = false; void viewRef.current?.reset(); }
  };

  const tapPalette = (block: Block, el: HTMLElement) => {
    if (runningRef.current || won) return;
    const slot = appendSlot(program, marks.activeTape, block);
    if (refusal(program, slot, block, { maxCards })) {
      setShake((s) => s + 1);
      speak(LINES.full);
      return;
    }
    edited(insertAt(program, slot, block));
    glance(el);
  };

  const tapBlock = (ref: BlockRef) => {
    if (runningRef.current || won) return;
    edited(removeAt(program, ref).program);
  };

  const onDrop = (res: DropResult) => {
    if (res.outcome === 'rejected' && res.reason === 'full') { setShake((s) => s + 1); speak(LINES.full); }
    if (res.program) edited(res.program);
  };

  const run = async () => {
    const v = viewRef.current;
    if (!v || runningRef.current || won) return;
    if (!cardCount(program)) {
      speak(LINES.empty);
      setMarks((m) => ({ ...m, hintSlot: true }));
      document.querySelectorAll<HTMLElement>('.block-palette .pblk').forEach((b, i) => b.animate?.([{ translate: '0 0' }, { translate: '0 -12px' }, { translate: '0 0' }], { duration: 320, delay: i * 70, easing: 'ease-out' }));
      return;
    }
    runningRef.current = true;
    setRunning(true);
    setMarks({});
    const trace = simulate(board, program);
    const done = new Set<string>();
    const res = await v.play(trace, {
      onStep: (s) => {
        const k = refKey(s.ref);
        setMarks({ current: k, done: new Set(done), iteration: s.ref.inner != null ? { item: s.ref.item, iter: s.ref.iter ?? 0 } : null });
        done.add(k);
      },
    });
    away.current = true;
    if (res === 'win') {
      setMarks({});
      stamp(level.id);
      setWon(true);
      speak(LINES.won);
    } else if (res === 'crash') {
      const s = trace.steps[trace.crashAt!];
      setMarks((m) => ({ culprit: refKey(s.ref), culpritN: (m.culpritN ?? 0) + 1 }));
    } else if (res === 'short') {
      setMarks({ hintSlot: maxCards == null || cardCount(program) < maxCards });
    }
    runningRef.current = false;
    setRunning(false);
  };

  const restart = () => {
    if (runningRef.current) return;
    setProgram([]);
    setMarks({});
    setWon(false);
    away.current = false;
    void viewRef.current?.reset();
  };

  /**
   * The ghost hand shows the next thing to do (flat programs): take out the
   * first block that cannot lead to the goal, or bring the next useful arrow
   * to the first free line, or press ▶ when the program already works.
   */
  const help = () => {
    if (runningRef.current || won) return;
    if (program.some((it) => it.t !== 'cmd')) return;
    const ids = program.map((it) => (it as { cmd: string }).cmd);
    const slots = maxCards ?? ids.length + 6;
    const blocks = level.blocks.filter((b) => b !== 'repeat' && b !== 'repeat-goal');
    let ok = ids.length;
    while (ok > 0 && !completeProgram(board, ids.slice(0, ok), blocks, slots)) ok--;
    if (ok < ids.length) {
      ghost([{ do: 'drag', from: `.zone-program [data-ref="${ok}"]`, to: '.zone-palette' }]);
      return;
    }
    const full = completeProgram(board, ids, blocks, slots);
    if (!full) return;
    if (full.length === ids.length) ghost([{ do: 'tap', at: '.btn-play' }]);
    else ghost([{ do: 'drag', from: `.zone-palette [data-cmd="${full[ids.length]}"]`, to: '.zone-program .blk-slot.is-active' }]);
  };

  useDebugHooks({ level, program, setProgram: (p: Program) => edited(structuredClone(p)), run, help, restart });

  const editor = useBlockEditor({
    blocks: level.blocks,
    program,
    marks,
    disabled: running || won,
    maxCards,
    shake,
    onTapPalette: tapPalette,
    onTapBlock: tapBlock,
    onTapeCount: (i) => {
      const next = structuredClone(program);
      const t = next[i];
      if (t.t !== 'loop' || t.count === 'goal') return;
      t.count = t.count >= 6 ? 2 : t.count + 1;
      edited(next);
    },
    onTapeActivate: (i) => setMarks((m) => ({ ...m, activeTape: i })),
    onDrop,
  });

  return (
    <Shell level={level} mode="program" rootRef={rootRef} onSpeak={say} onHelp={help} busy={running}>
      <section className="zone zone-palette" data-zone="palette" aria-label="Bloques">{editor.palette}</section>
      <section className="zone zone-program" data-zone="program" aria-label="Tu programa">{editor.program}</section>
      <section className="level-stage" aria-label="Tablero">
        <div className="controls">
          {won ? <NextPage level={level} /> : (
            <button type="button" className="btn btn-play cut" onClick={() => void run()} disabled={running} aria-label="Probar">
              <PlayIcon /><span>Probar</span>
            </button>
          )}
          <RestartButton onClick={restart} disabled={running} />
        </div>
        <Sheet svgRef={svgRef} level={level} />
      </section>
    </Shell>
  );
}

// ------------------------------------------------------------------ test hooks

/** Automation hooks for screenshots, only with ?debug in the URL (never always-on). */
function useDebugHooks(hooks: Record<string, unknown>) {
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __camino: unknown }).__camino = { ...hooks, cmdProgram, stamp };
  });
}

export function LevelScreen({ level }: { level: LevelDef }) {
  const Mode = useMemo(() => (level.mode === 'direct' ? DirectLevel : ProgramLevel), [level.mode]);
  return <Mode level={level} />;
}
