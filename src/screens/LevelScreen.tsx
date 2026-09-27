// One page of the tramo. Full width, one row (design rule 2):
// - program mode: narrow palette | ruled notebook with the program | big taped board,
//   ▶ Probar and ↺ attached to the board;
// - direct mode (sala 4): no program, the board takes the screen and four big
//   drawn arrows sit around it; each tap is one step.
// The instruction is spoken on entry and by 🔊; ✋ plays the ghost hand.
// Failure is diegetic: Brote bumps or looks around, the block that tripped
// him shakes, the empty line calls. There is no "incorrect" anywhere.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BoardView } from '../ui/board/BoardView';
import { type DemoStep } from '../ui/ghost';
import { speak } from '../ui/speech';
import { PlayIcon } from '../ui/icons';
import { PadArrow } from '../ui/art';
import { paletteBlock, useBlockEditor, type Marks } from '../blocks/BlockEditor';
import { refKey } from '../blocks/blocks';
import { appendSlot, insertAt, refusal, removeAt, type Block, type BlockRef, type DropResult, type Slot } from '../game/editor';
import { completeProgram, move, nextMove, simulateAll } from '../game/engine';
import { COUNT_MIN, countTaps, nextCount, nextHint } from '../game/hint';
import { Lockstep } from '../game/lockstep';
import { type LevelDef } from '../game/levels';
import { cardCount, initialState, type Dir, type Program, type RobotState, type TraceStep } from '../game/model';
import { BROTE } from './LevelBar';
import { NextPage, RestartButton, Sheet, Shell, frameFor, useBoard, useDebugHooks, useGhost, useInstruction, useLevelNav } from './levelKit';
import { RealtimeLevel } from './RealtimeLevel';

/** Short spoken lines (es-AR). The board says the rest. */
const LINES = {
  won: '¡Lo lograste!',
  empty: 'Poné flechas en el cuaderno.',
  full: 'No entran más.',
  introRepeat: 'Mirá: repetir hace la misma flecha muchas veces. Tocá el número para cambiar cuántas.',
  introGoal: 'Mirá: repetir hasta llegar hace caminar a Brote hasta la semilla.',
};

// ------------------------------------------------------------------ direct control (sala 4)

function DirectLevel({ level }: { level: LevelDef }) {
  const board = level.worlds[0];
  const rootRef = useRef<HTMLElement>(null);
  const { svgRef, viewRef } = useBoard(level);
  const say = useInstruction(level);
  const ghost = useGhost(rootRef);
  const nav = useLevelNav();
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
        nav.won(level);
        setWon(true);
        speak(LINES.won);
        break;
      }
      next = queued.current;
    }
    busyRef.current = false;
    setBusy(false);
  }, [board, level, viewRef, won, nav]);

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

/** Several worlds (2do page 2): each sheet has its own tape colour, and a block that bumped there gets a strip of it. */
const WORLD_TONES = ['rgba(114, 152, 193, 0.8)', 'rgba(240, 210, 122, 0.9)', 'rgba(231, 163, 160, 0.9)'];

/** One BoardView per world, each on its own taped sheet. */
function useBoards(level: LevelDef) {
  const svgs = useRef<(SVGSVGElement | null)[]>([]);
  const views = useRef<BoardView[]>([]);
  useEffect(() => {
    views.current = level.worlds.map((b, i) => {
      const v = new BoardView(svgs.current[i]!);
      v.setBoard(b, { pop: true, frame: frameFor(level) });
      if (level.fog) v.setFog(true);
      v.keepBumps = level.worlds.length > 1;
      v.setCharacter(BROTE);
      return v;
    });
    return () => { views.current.forEach((v) => v.destroy()); views.current = []; };
  }, [level]);
  return { svgs, views };
}

function Sheets({ level, svgs }: { level: LevelDef; svgs: React.RefObject<(SVGSVGElement | null)[]> }) {
  const multi = level.worlds.length > 1;
  const nav = useLevelNav();
  return (
    <div className={`sheets${multi ? ' is-multi' : ''}`}>
      {level.worlds.map((b, i) => (
        <div key={i} className="sheet" data-zone="stage" data-world={multi ? i : undefined} style={multi ? { '--tone': WORLD_TONES[i] } as CSSProperties : undefined}>
          {nav.decor}
          <span className="tape tape-l" aria-hidden="true" />
          <span className="tape tape-r" aria-hidden="true" />
          <svg ref={(el) => { svgs.current[i] = el; }} className="board" role="img" aria-label={`Tablero ${multi ? `${i + 1} ` : ''}de ${b.cols} por ${b.rows}`} />
        </div>
      ))}
    </div>
  );
}

const hasLoop = (p: Program) => p.some((it) => it.t === 'loop');
const paletteIdOf = (b: Block) => (b.t === 'loop' ? (b.count === 'goal' ? 'repeat-goal' : 'repeat') : b.cmd);

function ProgramLevel({ level }: { level: LevelDef }) {
  const rootRef = useRef<HTMLElement>(null);
  const { svgs, views } = useBoards(level);
  const say = useInstruction(level);
  const nav = useLevelNav();
  const ghost = useGhost(rootRef);
  const [program, setProgram] = useState<Program>([]);
  const programRef = useRef(program);
  programRef.current = program;
  const [marks, setMarks] = useState<Marks>({});
  const [running, setRunning] = useState(false);
  const [won, setWon] = useState(false);
  const [shake, setShake] = useState(0);
  const [refused, setRefused] = useState<{ n: number; block: Block; from: DOMRect } | null>(null);
  const [demoing, setDemoing] = useState(false);
  const demoRef = useRef(false);
  const runningRef = useRef(false);
  /** Brote is not on the start cell (after a run): the first edit sends him home. */
  const away = useRef(false);
  /** The concept demo played by itself already (it does once per page). */
  const introShown = useRef(false);
  const maxCards = level.slots;
  const loops = level.blocks.some((b) => b === 'repeat' || b === 'repeat-goal');
  const busy = () => runningRef.current || demoRef.current;

  const glance = (el: Element | null) => {
    const r = el?.getBoundingClientRect();
    if (r) views.current.forEach((v) => v.glanceAt(r.left + r.width / 2, r.top + r.height / 2));
  };

  const goHome = () => {
    if (away.current) { away.current = false; views.current.forEach((v) => void v.reset()); }
  };

  const edited = (next: Program, extra: Partial<Marks> = {}) => {
    setProgram(next);
    programRef.current = next;
    setMarks((m) => ({ activeTape: m.activeTape, ...extra }));
    goHome();
  };
  /** An edit made by the ghost hand during a concept demo (always from the latest program). */
  const editWith = (fn: (p: Program) => Program) => edited(fn(structuredClone(programRef.current)));

  const restart = () => {
    if (runningRef.current) return;
    setProgram([]);
    programRef.current = [];
    setMarks({});
    setWon(false);
    away.current = false;
    views.current.forEach((v) => void v.reset());
  };

  /**
   * The concept demo (a new idea, no text): the ghost hand really builds the
   * level's intro program: clean page, the repeat into the notebook, its
   * card(s) inside, and a tap on the number. The idea, never the answer.
   */
  const playIntro = () => {
    const intro = level.intro;
    if (!intro || busy() || won) return;
    const target = intro.program[0];
    if (target?.t !== 'loop') return;
    introShown.current = true;
    const steps: DemoStep[] = [];
    if (programRef.current.length) steps.push({ do: 'tap', at: '.btn-restart', apply: restart });
    steps.push({
      do: 'drag', from: `.zone-palette [data-cmd="${paletteIdOf(target)}"]`, to: '.zone-program [data-key="end0"]',
      apply: () => editWith(() => [{ t: 'loop', count: target.count === 'goal' ? 'goal' : COUNT_MIN, body: [] }]),
    });
    for (const cmd of target.body) {
      steps.push({
        do: 'drag', from: `.zone-palette [data-cmd="${cmd}"]`, to: '.zone-program [data-ref="0"]',
        apply: () => editWith((p) => { if (p[0]?.t === 'loop') p[0].body.push(cmd); return p; }),
      });
    }
    if (typeof target.count === 'number') {
      for (let i = 0; i < countTaps(COUNT_MIN, target.count); i++) {
        steps.push({
          do: 'tap', at: '.zone-program [data-ref="0"] .tape-count',
          apply: () => editWith((p) => { const t = p[0]; if (t?.t === 'loop' && t.count !== 'goal') t.count = nextCount(t.count); return p; }),
        });
      }
    }
    steps.push({ do: 'point', at: ['.btn-play'] });
    demoRef.current = true;
    setDemoing(true);
    speak(target.count === 'goal' ? LINES.introGoal : LINES.introRepeat);
    const run = ghost(steps);
    const end = () => { demoRef.current = false; setDemoing(false); };
    if (run) void run.then(end); else end();
  };

  /** The notebook is full: the block tips off the page, the notebook shakes; the first time, the idea arrives. */
  const full = (block: Block | null, el: HTMLElement | null) => {
    setShake((s) => s + 1);
    if (block && el) setRefused((r) => ({ n: (r?.n ?? 0) + 1, block, from: el.getBoundingClientRect() }));
    speak(LINES.full);
    if (level.intro?.after === 'full' && !introShown.current) {
      introShown.current = true;
      setTimeout(playIntro, 1300);
    }
  };

  const tapPalette = (block: Block, el: HTMLElement) => {
    if (busy() || won) return;
    const slot = appendSlot(program, marks.activeTape, block);
    if (refusal(program, slot, block, { maxCards })) {
      full(block, el);
      return;
    }
    edited(insertAt(program, slot, block));
    glance(el);
  };

  const tapBlock = (ref: BlockRef) => {
    if (busy() || won) return;
    edited(removeAt(program, ref).program);
  };

  const onDrop = (res: DropResult) => {
    if (res.outcome === 'rejected' && res.reason === 'full') full(null, null);
    if (res.program) edited(res.program);
  };

  const run = async () => {
    const vs = views.current;
    if (!vs.length || busy() || won) return;
    if (!cardCount(program)) {
      speak(LINES.empty);
      setMarks((m) => ({ ...m, hintSlot: true }));
      document.querySelectorAll<HTMLElement>('.block-palette .pblk').forEach((b, i) => b.animate?.([{ translate: '0 0' }, { translate: '0 -12px' }, { translate: '0 0' }], { duration: 320, delay: i * 70, easing: 'ease-out' }));
      return;
    }
    runningRef.current = true;
    setRunning(true);
    setMarks({});
    const multi = vs.length > 1;
    const traces = simulateAll(level.worlds, program);
    const lock = new Lockstep(vs.length);
    const done = new Set<string>();
    let last = -1;
    let iteration: Marks['iteration'] = null;
    // every world still going is on the same block at step i: ring it once
    const onStep = (s: TraceStep) => {
      if (s.index <= last) return;
      last = s.index;
      const k = refKey(s.ref);
      if (s.ref.inner != null) iteration = { item: s.ref.item, iter: s.ref.iter ?? 0 };
      setMarks({ current: k, done: new Set(done), iteration });
      done.add(k);
    };
    const results = await Promise.all(vs.map((v, w) => v.play(traces[w], {
      onStep,
      gate: multi ? () => lock.arrive(w) : undefined,
      onDone: () => {
        lock.leave(w);
        if (level.fog) setTimeout(() => v.revealAll(), 450);
      },
      celebrate: !multi,
    }).then(async (r) => {
      if (multi && r === 'win') await v.smallWin();
      return r;
    })));
    away.current = true;
    if (results.includes('aborted')) {
      runningRef.current = false;
      setRunning(false);
      return;
    }
    if (results.every((r) => r === 'win')) {
      setMarks({});
      if (multi) await Promise.all(vs.map((v) => v.celebrate()));
      nav.won(level);
      setWon(true);
      speak(LINES.won);
    } else if (results.includes('crash')) {
      const crashed = traces.map((t, w) => ({ t, w })).filter(({ t }) => t.outcome === 'crash');
      const keys = crashed.map(({ t }) => refKey(t.steps[t.crashAt!].ref));
      setMarks((m) => ({
        culprit: keys[0],
        culpritN: (m.culpritN ?? 0) + 1,
        iteration,
        pins: multi ? crashed.map(({ w }, i) => ({ key: keys[i], tone: WORLD_TONES[w] })) : undefined,
      }));
    } else {
      // short: a counted repeat asks for more passes; otherwise the next free line calls
      const counted = program.findLastIndex((it) => it.t === 'loop' && it.count !== 'goal');
      setMarks(counted >= 0 ? { iteration, hintCount: counted } : { iteration, hintSlot: maxCards == null || cardCount(program) < maxCards });
    }
    runningRef.current = false;
    setRunning(false);
    if (!results.every((r) => r === 'win') && level.intro?.after === 'fail' && !introShown.current && !hasLoop(program)) {
      setTimeout(playIntro, 900);
    }
  };

  /** Where the hand drops a block for a gap of the program. */
  const slotTarget = (slot: Slot): string => {
    if (slot.tape != null) {
      const t = program[slot.tape];
      return t?.t === 'loop' && slot.at < t.body.length ? `.zone-program [data-ref="${slot.tape}:${slot.at}"]` : `.zone-program [data-ref="${slot.tape}"]`;
    }
    if (slot.at < program.length) return `.zone-program [data-ref="${slot.at}"]`;
    return document.querySelector('.zone-program [data-key="end0"]') ? '.zone-program [data-key="end0"]' : `.zone-program [data-ref="${program.length - 1}"]`;
  };

  /**
   * The ghost hand shows the next thing to do. Flat programs (sala 5): take
   * out the first block that cannot lead to the goal, or bring the next useful
   * arrow, or press ▶. Programs with loops: without a loop, the concept demo
   * again; with one, the first place where the program leaves the reference
   * solution (a card to add or take out, taps on the count), or ▶.
   */
  const help = () => {
    if (busy() || won) return;
    if (loops) {
      if (!hasLoop(program) && level.intro) { playIntro(); return; }
      const h = nextHint(level.worlds, program, level.solution, maxCards);
      if (h.kind === 'run') ghost([{ do: 'tap', at: '.btn-play' }]);
      else if (h.kind === 'add') ghost([{ do: 'drag', from: `.zone-palette [data-cmd="${paletteIdOf(h.block)}"]`, to: slotTarget(h.slot) }]);
      else if (h.kind === 'remove') ghost([{ do: 'drag', from: `.zone-program [data-ref="${refKey(h.ref)}"]`, to: '.zone-palette' }]);
      else ghost(Array.from({ length: Math.min(h.taps, 9) }, () => ({ do: 'tap' as const, at: `.zone-program [data-ref="${h.item}"] .tape-count` })));
      return;
    }
    const ids = program.map((it) => (it as { cmd: string }).cmd);
    const board = level.worlds[0];
    const slots = maxCards ?? ids.length + 6;
    let ok = ids.length;
    while (ok > 0 && !completeProgram(board, ids.slice(0, ok), level.blocks, slots)) ok--;
    if (ok < ids.length) {
      ghost([{ do: 'drag', from: `.zone-program [data-ref="${ok}"]`, to: '.zone-palette' }]);
      return;
    }
    const full = completeProgram(board, ids, level.blocks, slots);
    if (!full) return;
    if (full.length === ids.length) ghost([{ do: 'tap', at: '.btn-play' }]);
    else ghost([{ do: 'drag', from: `.zone-palette [data-cmd="${full[ids.length]}"]`, to: '.zone-program .blk-slot.is-active' }]);
  };

  useDebugHooks({
    level, program, setProgram: (p: Program) => edited(structuredClone(p)), run, help, restart, playIntro,
    tapPalette: (id: string) => {
      const el = document.querySelector<HTMLElement>(`.zone-palette [data-cmd="${id}"]`);
      if (el) tapPalette(paletteBlock(id), el);
    },
  });

  const editor = useBlockEditor({
    blocks: level.blocks,
    label: level.blockLabel,
    program,
    marks,
    disabled: running || won,
    inert: demoing,
    maxCards,
    shake,
    refused,
    onTapPalette: tapPalette,
    onTapBlock: tapBlock,
    onTapeCount: (i) => {
      if (busy()) return;
      const next = structuredClone(program);
      const t = next[i];
      if (t.t !== 'loop' || t.count === 'goal') return;
      t.count = nextCount(t.count);
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
        <Sheets level={level} svgs={svgs} />
      </section>
    </Shell>
  );
}

export function LevelScreen({ level }: { level: LevelDef }) {
  const Mode = useMemo(() => (level.mode === 'direct' ? DirectLevel : level.mode === 'realtime' ? RealtimeLevel : ProgramLevel), [level.mode]);
  return <Mode level={level} />;
}
