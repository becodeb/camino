// One page of the tramo. Full width, one row (design rule 2):
// - program mode: narrow palette | ruled notebook with the program | big taped board,
//   ▶ Probar and ↺ attached to the board;
// - direct mode (sala 4): no program, the board takes the screen and four big
//   drawn arrows sit around it; each tap is one step.
// The instruction is spoken on entry and by 🔊; ✋ plays the ghost hand.
// Failure is diegetic: Brote bumps or looks around, the block that tripped
// him shakes, the empty line calls. There is no "incorrect" anywhere.
//
// 1ro's practice formats (game/formats.ts) are program pages too: complete
// and fix pages keep every line of the notebook in place (a tap on a block
// takes it out and leaves its line empty, a tap on the palette fills the
// empty line); a predict page shows the program read-only and the child taps
// the cell where Brote will end; a gold challenge is a plain page with fewer
// lines, offered by the gold seal once the page is solved.

import { useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BoardView } from '../ui/board/BoardView';
import { GuardaView } from '../ui/board/GuardaView';
import { MusicView } from '../ui/board/MusicView';
import { glowTargets, pulseGuess, type DemoStep } from '../ui/ghost';
import { isMuted } from '../ui/mute';
import { markSilentDemoShown, silentDemoShown } from '../ui/silentDemo';
import { speak } from '../ui/speech';
import { PlayIcon } from '../ui/icons';
import { PadArrow } from '../ui/art';
import { paletteBlock, useBlockEditor, type Marks } from '../blocks/BlockEditor';
import { refKey } from '../blocks/blocks';
import { appendSlot, emptyLine, holesOf, insertAt, refusal, removeAt, writeLine, type Block, type BlockRef, type DragSource, type DropResult, type Slot } from '../game/editor';
import { completeProgram, move, nextMove, simulate, unroll } from '../game/engine';
import { formatOf, hasFixedLines, pinsOf, startProgram } from '../game/formats';
import { COUNT_MIN, countTaps, linesHint, nextCount, nextHint } from '../game/hint';
import { judgeOf, tracesOf } from '../game/judge';
import { tonesOf } from '../game/music';
import { Lockstep } from '../game/lockstep';
import { type LevelDef } from '../game/levels';
import { cardCount, initialState, sameCell, type Cell, type Dir, type Program, type RobotState, type TraceStep } from '../game/model';
import { usePlayer } from './player';
import { NextPage, RestartButton, Sheet, Shell, frameFor, useBoard, useDebugHooks, useGhost, useInstruction, useLevelNav, useRedress, LevelWrapContext } from './levelKit';
import { RealtimeLevel } from './RealtimeLevel';

/** Short spoken lines (es-AR). The board says the rest. */
const LINES = {
  won: '¡Lo lograste!',
  empty: 'Poné flechas en el cuaderno.',
  full: 'No entran más.',
  introRepeat: 'Mirá: repetir hace la misma flecha muchas veces. Tocá el número para cambiar cuántas.',
  introGoal: 'Mirá: repetir hasta llegar hace caminar a Brote hasta la semilla.',
  /** Fixed lines, no empty line left: one comes out first. */
  fixedFull: 'Primero sacá un bloque: tocalo y se va.',
  /** A complete page run with something still missing. */
  missing: 'Todavía falta algo en el cuaderno.',
  /** Predict: ▶ before a guess. */
  guessFirst: 'Primero tocá en el tablero dónde va a terminar Brote.',
  /** Predict: Brote ended somewhere else. */
  missed: 'Mirá dónde terminó Brote. Tocá otro lugar y probá de nuevo.',
  /** Music (sheet 9): an empty notebook, the song played right, a free song played. */
  emptyNotes: 'Poné notas en el cuaderno.',
  song: '¡Sonó igual! ¡Qué linda canción!',
  concert: '¡Qué linda canción!',
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

/** One BoardView per world, each on its own taped sheet (a music page's is the xylophone, a guarda's the squared paper). */
function useBoards(level: LevelDef) {
  const svgs = useRef<(SVGSVGElement | null)[]>([]);
  const views = useRef<BoardView[]>([]);
  const player = usePlayer();
  const playerRef = useRef(player);
  playerRef.current = player;
  useRedress([views], player);
  useEffect(() => {
    views.current = level.worlds.map((b, i) => {
      const svg = svgs.current[i]!;
      const v = level.music ? new MusicView(svg, level.music, level.solution) : level.guarda ? new GuardaView(svg, level.guarda) : new BoardView(svg);
      v.setBoard(b, { pop: true, frame: frameFor(level) });
      if (level.fog) v.setFog(true);
      v.keepBumps = level.worlds.length > 1;
      v.setCharacter(playerRef.current.def, playerRef.current.outfit);
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
          <svg ref={(el) => { svgs.current[i] = el; }} className="board" role="img" aria-label={level.music ? 'El xilofón y la canción' : level.guarda ? 'La guarda en el cuaderno' : `Tablero ${multi ? `${i + 1} ` : ''}de ${b.cols} por ${b.rows}`} />
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
  const format = formatOf(level);
  /** Complete and fix pages: every line stays in place. */
  const fixedLines = hasFixedLines(level);
  const pins = useMemo(() => pinsOf(level), [level]);
  const [program, setProgram] = useState<Program>(() => startProgram(level));
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
  /** A free music page (sheet 9) stays playable once won: its song can change and play again. */
  const replay = !!level.music?.free;
  const locked = won && !replay;

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

  /** Back to the page as it arrived: empty, or with its given program. */
  const restart = () => {
    if (runningRef.current) return;
    const start = startProgram(level);
    setProgram(start);
    programRef.current = start;
    setMarks({});
    setWon(false);
    away.current = false;
    views.current.forEach((v) => void v.reset());
  };

  /** Something taped to the page was tapped: it wiggles and stays. */
  const wiggle = (key: string) => setMarks((m) => ({ ...m, wiggle: { key, n: (m.wiggle?.n ?? 0) + 1 } }));

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
    nav.onIntro?.(level);
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
    speak(fixedLines ? LINES.fixedFull : LINES.full);
    if (level.intro?.after === 'full' && !introShown.current) {
      introShown.current = true;
      setTimeout(playIntro, 1300);
    }
  };

  const tapPalette = (block: Block, el: HTMLElement) => {
    if (busy() || locked) return;
    if (fixedLines) {
      // the card lands on the empty line that takes taps (the one just emptied, or the first)
      if (block.t !== 'cmd') return;
      const holes = holesOf(program);
      const to = holes.find((r) => refKey(r) === marks.activeHole) ?? holes[0];
      if (!to) { full(block, el); return; }
      edited(writeLine(program, to, block.cmd));
      nav.onTapAdd?.(level);
      views.current[0]?.cardAdded(block.cmd);
      glance(el);
      return;
    }
    const slot = appendSlot(program, marks.activeTape, block);
    if (refusal(program, slot, block, { maxCards })) {
      full(block, el);
      return;
    }
    // a repeat added by a tap takes the next taps inside it (as in habilidades)
    edited(insertAt(program, slot, block), block.t === 'loop' ? { activeTape: slot.at } : {});
    nav.onTapAdd?.(level);
    if (block.t === 'cmd') views.current[0]?.cardAdded(block.cmd);
    glance(el);
  };

  const tapBlock = (ref: BlockRef) => {
    if (busy() || locked) return;
    if (fixedLines) {
      // a tap takes a block out and leaves its line empty (it takes the next tap); what is taped on stays
      const k = refKey(ref);
      if (ref.inner == null && program[ref.item]?.t === 'loop') { if (pins.tapes.has(ref.item)) wiggle(k); return; }
      if (pins.cards.has(k)) { wiggle(k); return; }
      edited(emptyLine(program, ref), { activeHole: k });
      return;
    }
    edited(removeAt(program, ref).program);
  };

  const onDrop = (res: DropResult, src: DragSource) => {
    nav.onDrag?.('drop', { success: !!res.program, outcome: res.outcome, from: src.from });
    if (res.outcome === 'rejected' && res.reason === 'full') full(null, null);
    if (!res.program) return;
    edited(res.program, fixedLines && res.outcome === 'remove' && src.from === 'program' ? { activeHole: refKey(src.ref) } : {});
    if (res.outcome === 'add' && src.block.t === 'cmd') views.current[0]?.cardAdded(src.block.cmd);
  };

  /** The counted repeat whose number is the child's (not taped on), last one first. */
  const kidCount = (p: Program) => p.findLastIndex((it, i) => it.t === 'loop' && it.count !== 'goal' && !pins.counts.has(i));

  /** `silent`: T20's fix demo presses ▶ on the given (buggy) program to show the bump; it is never attributed to the child. */
  const run = async (opts: { silent?: boolean } = {}) => {
    const vs = views.current;
    if (!vs.length || busy() || locked) return;
    if (format === 'complete') {
      // something still missing: nothing runs, the empty line or the number calls
      const counts = program.findIndex((it) => it.t === 'loop' && it.count === 0);
      if (holesOf(program).length || counts >= 0) {
        if (!opts.silent) nav.onRunReport?.({ result: 'incomplete', program });
        speak(LINES.missing);
        setMarks(holesOf(program).length ? { hintHole: true } : { hintCount: counts });
        return;
      }
    }
    if (!cardCount(program)) {
      if (!opts.silent) nav.onRunReport?.({ result: 'empty', program });
      speak(level.music ? LINES.emptyNotes : LINES.empty);
      setMarks((m) => ({ ...m, hintSlot: true }));
      document.querySelectorAll<HTMLElement>('.block-palette .pblk').forEach((b, i) => b.animate?.([{ translate: '0 0' }, { translate: '0 -12px' }, { translate: '0 0' }], { duration: 320, delay: i * 70, easing: 'ease-out' }));
      return;
    }
    runningRef.current = true;
    setRunning(true);
    setMarks({});
    nav.onRun?.();
    const multi = vs.length > 1;
    const traces = tracesOf(level, program);
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
    nav.onResult?.(results.every((r) => r === 'win') ? 'win' : results.includes('crash') ? 'crash' : 'short');
    if (nav.onRunReport && !opts.silent) {
      const crash = traces.find((t) => t.outcome === 'crash');
      nav.onRunReport({
        result: results.every((r) => r === 'win') ? 'win' : results.includes('crash') ? (level.music ? 'wrong_note' : level.guarda ? 'smudge' : 'bump') : 'short',
        program,
        ...(multi ? { worlds: results.map(String) } : {}),
        ...(crash ? { culprit: refKey(crash.steps[crash.crashAt!].ref) } : {}),
      });
    }
    if (results.every((r) => r === 'win')) {
      setMarks({});
      if (multi) await Promise.all(vs.map((v) => v.celebrate()));
      const line = nav.won(level, program);
      setWon(true);
      speak(line || (level.music ? (level.music.free ? LINES.concert : LINES.song) : LINES.won));
    } else if (results.includes('crash')) {
      const crashed = traces.map((t, w) => ({ t, w })).filter(({ t }) => t.outcome === 'crash');
      const keys = crashed.map(({ t }) => refKey(t.steps[t.crashAt!].ref));
      // on a complete page the child's number is what to look at too
      const counted = format === 'complete' ? kidCount(program) : -1;
      setMarks((m) => ({
        culprit: keys[0],
        culpritN: (m.culpritN ?? 0) + 1,
        iteration,
        pins: multi ? crashed.map(({ w }, i) => ({ key: keys[i], tone: WORLD_TONES[w] })) : undefined,
        ...(counted >= 0 ? { hintCount: counted } : {}),
      }));
    } else if (fixedLines && holesOf(program).length) {
      // short, with a line left empty: it calls
      setMarks({ iteration, hintHole: true });
    } else {
      // short: a counted repeat asks for more passes; otherwise the next free line calls
      const counted = kidCount(program);
      setMarks(counted >= 0 ? { iteration, hintCount: counted } : { iteration, hintSlot: maxCards == null || cardCount(program) < maxCards });
    }
    runningRef.current = false;
    setRunning(false);
    if (!opts.silent && !results.every((r) => r === 'win') && level.intro?.after === 'fail' && !introShown.current && !hasLoop(program)) {
      setTimeout(playIntro, 900);
    }
  };

  /**
   * T20 (silent classroom round): a wordless demo for a format `intro`
   * cannot cover ('path': build-a-path pages; 'fix': the given program has
   * a bug; 'worlds': one program, several boards). Muted only, once per
   * tag this session, cancelled by any real input (useGhost).
   */
  const playSilentDemo = () => {
    const kind = level.silentDemo;
    if (!kind || busy() || won) return;
    markSilentDemoShown(kind);
    nav.onIntro?.(level);
    const steps: DemoStep[] = [];
    if (kind === 'worlds') {
      // only points at the three boards: nothing on the page changes
      steps.push({ do: 'point', at: level.worlds.map((_, i) => `.sheet[data-world="${i}"] .board`) });
    } else if (kind === 'fix') {
      // taps ▶ for real (the bump is the point), then ↺ puts Brote back home and
      // clears the crash marks — the given (still buggy) program is untouched,
      // restart() never erases a fix page's given lines (startProgram keeps them)
      steps.push({ do: 'tap', at: '.btn-play', apply: () => { void run({ silent: true }); } });
      steps.push({ do: 'wait', ms: 1300 });
      // bookends the program (first line, last line) rather than circling every
      // block: "look across here", without a long point-at-each-one crawl
      const last = Math.max(0, programRef.current.length - 1);
      steps.push({ do: 'point', at: [`.zone-program [data-ref="0"]`, `.zone-program [data-ref="${last}"]`] });
      steps.push({ do: 'tap', at: '.btn-restart', apply: restart });
    } else if (kind === 'path') {
      glowTargets(rootRef.current!);
      const dir = (level.blocks.find((b) => b !== 'repeat' && b !== 'repeat-goal') ?? 'right') as Dir;
      const block = paletteBlock(dir);
      if (programRef.current.length) steps.push({ do: 'tap', at: '.btn-restart', apply: restart });
      steps.push({
        do: 'drag', from: `.zone-palette [data-cmd="${dir}"]`, to: '.zone-program [data-key="end0"]',
        apply: () => editWith((p) => insertAt(p, appendSlot(p, null, block), block)),
      });
      steps.push({ do: 'point', at: ['.btn-play'] });
      // the demo must never leave a wrong block behind for the child to copy:
      // the same gesture in reverse, back to the palette (removeAt), empty again
      steps.push({
        do: 'drag', from: '.zone-program [data-ref="0"]', to: '.zone-palette',
        apply: () => editWith((p) => removeAt(p, { item: 0 }).program),
      });
    } else {
      return;
    }
    demoRef.current = true;
    setDemoing(true);
    const r = ghost(steps);
    const end = () => { demoRef.current = false; setDemoing(false); };
    if (r) void r.then(end); else end();
  };

  // muted, a new format: the wordless demo plays shortly after the page opens,
  // unless the child already acted (the program changed, or a run is afoot)
  useEffect(() => {
    const kind = level.silentDemo;
    if (!kind || !isMuted() || silentDemoShown(kind)) return;
    const startedWith = JSON.stringify(programRef.current);
    const t = setTimeout(() => {
      if (busy() || won || JSON.stringify(programRef.current) !== startedWith) return;
      playSilentDemo();
    }, 1200);
    return () => clearTimeout(t);
    // once per page, like the concept demo above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  /** Where the hand drops a block for a gap of the program. */
  const slotTarget = (slot: Slot): string => {
    if (slot.tape != null) {
      const t = program[slot.tape];
      return t?.t === 'loop' && slot.at < t.body.length ? `.zone-program [data-ref="${slot.tape}:${slot.at}"]` : `.zone-program [data-ref="${slot.tape}"]`;
    }
    if (slot.at < program.length) return `.zone-program [data-ref="${slot.at}"]`;
    return document.querySelector('.zone-program [data-key="end0"]') ? '.zone-program [data-key="end0"]' : `.zone-program [data-ref="${program.length - 1}"]`;
  };

  /** The xylophone of a music page, to listen to its song. */
  const music = () => (views.current[0] instanceof MusicView ? views.current[0] : null);

  /**
   * The ghost hand shows the next thing to do. Flat programs (sala 5): take
   * out the first block that cannot lead to the goal, or bring the next useful
   * arrow, or press ▶. Programs with loops, and songs: without a loop, the
   * concept demo again (if the page has one); then the first place where the
   * program leaves the reference solution (a card to add or take out, taps on
   * the count), or ▶. A song still unwritten: first a tap on its strip (listen).
   * A free song: notes until it has enough, then ▶.
   */
  const help = () => {
    if (busy() || locked) return;
    const judge = judgeOf(level);
    if (fixedLines) {
      // the first line that differs from the page's reference: out with it, in with the right card, the count, or ▶
      const h = linesHint(judge, program, level.solution);
      if (h.kind === 'run') ghost([{ do: 'tap', at: '.btn-play' }]);
      else if (h.kind === 'empty') ghost([{ do: 'drag', from: `.zone-program [data-ref="${refKey(h.ref)}"]`, to: '.zone-palette' }]);
      else if (h.kind === 'fill') ghost([{ do: 'drag', from: `.zone-palette [data-cmd="${h.cmd}"]`, to: `.zone-program [data-hole="${refKey(h.ref)}"]` }]);
      else ghost(Array.from({ length: Math.min(h.taps, 9) }, () => ({ do: 'tap' as const, at: `.zone-program [data-ref="${h.item}"] .tape-count` })));
      return;
    }
    const free = level.music?.free;
    if (free) {
      const notes = tonesOf(program).filter((t) => t !== 'rest').length;
      const sample = unroll(level.solution);
      if (notes >= free.min || !sample.length) ghost([{ do: 'tap', at: '.btn-play' }]);
      else ghost([{ do: 'drag', from: `.zone-palette [data-cmd="${sample[cardCount(program) % sample.length].cmd}"]`, to: '.zone-program .blk-slot.is-active' }]);
      return;
    }
    if (loops || level.music || level.guarda) {
      if (!hasLoop(program) && level.intro) { playIntro(); return; }
      const h = nextHint(judge, program, level.solution, maxCards);
      const listen: DemoStep[] = level.music?.song && !cardCount(program) ? [{ do: 'tap', at: '.song-strip', apply: () => void music()?.listen() }] : [];
      if (h.kind === 'run') ghost([{ do: 'tap', at: '.btn-play' }]);
      else if (h.kind === 'add') ghost([...listen, { do: 'drag', from: `.zone-palette [data-cmd="${paletteIdOf(h.block)}"]`, to: slotTarget(h.slot) }]);
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
    listen: () => music()?.listen(),
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
    disabled: running || locked,
    inert: demoing,
    maxCards: fixedLines ? undefined : maxCards,
    shake,
    refused,
    lines: fixedLines ? 'fixed' : 'free',
    pinned: pins,
    onTapPalette: tapPalette,
    onTapBlock: tapBlock,
    onTapeCount: (i) => {
      if (busy()) return;
      if (pins.counts.has(i)) { wiggle(`count:${i}`); return; }
      const next = structuredClone(program);
      const t = next[i];
      if (t.t !== 'loop' || t.count === 'goal') return;
      t.count = nextCount(t.count);
      edited(next);
    },
    onTapeActivate: (i) => setMarks((m) => ({ ...m, activeTape: i })),
    onTapHole: (ref) => setMarks((m) => ({ ...m, activeHole: refKey(ref), hintHole: false })),
    onDragStart: nav.onDrag ? () => nav.onDrag!('start') : undefined,
    onDrop,
  });

  // a page with nothing to bring (only a count missing) has no palette
  const palette = level.blocks.length > 0;
  return (
    <Shell level={level} mode="program" rootRef={rootRef} onSpeak={say} onHelp={help} busy={running} noPalette={!palette}>
      {palette && <section className="zone zone-palette" data-zone="palette" aria-label="Bloques">{editor.palette}</section>}
      <section className="zone zone-program" data-zone="program" aria-label="Tu programa">
        {editor.program}
        {nav.notebook}
      </section>
      <section className="level-stage" aria-label="Tablero">
        <div className="controls">
          {won && <NextPage level={level} />}
          {(!won || replay) && (
            <button type="button" className="btn btn-play cut" onClick={() => void run()} disabled={running} aria-label="Probar">
              <PlayIcon /><span>Probar</span>
            </button>
          )}
          <RestartButton onClick={restart} disabled={running} />
          {nav.gold?.(level, won)}
          {nav.reward?.(level, won)}
        </div>
        <Sheets level={level} svgs={svgs} />
      </section>
    </Shell>
  );
}

// ------------------------------------------------------------------ predict: where will Brote end?

/**
 * A predict page: the program is in the notebook, read-only; the child taps
 * the cell where Brote will end (a blue pen ring goes there, and moves with
 * the next tap), then ▶ plays the run. Brote ends on the ring: the page is
 * won. He ends somewhere else: he turns to the ring, "¿Mmm?", and the child
 * can tap again. No palette, no verdict in words.
 */
function PredictLevel({ level }: { level: LevelDef }) {
  const rootRef = useRef<HTMLElement>(null);
  const { svgs, views } = useBoards(level);
  const say = useInstruction(level);
  const nav = useLevelNav();
  const ghost = useGhost(rootRef);
  const board = level.worlds[0];
  const program = level.given ?? level.solution;
  /** Where the child thinks Brote will end (the ring on the board). */
  const guessRef = useRef<Cell | null>(null);
  const [marks, setMarks] = useState<Marks>({});
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [won, setWon] = useState(false);
  const wonRef = useRef(false);
  /** Brote is not on the start cell (after a run): the next tap sends him home. */
  const away = useRef(false);

  const pick = (cell: Cell) => {
    const v = views.current[0];
    if (!v || runningRef.current || wonRef.current) return;
    if (away.current) { away.current = false; void v.reset(); }
    guessRef.current = cell;
    setMarks({});
    v.setGuess(cell);
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;
  useEffect(() => {
    const v = views.current[0];
    v?.setPicking((cell) => pickRef.current(cell));
    return () => v?.setPicking(null);
  }, [level, views]);

  const restart = () => {
    if (runningRef.current) return;
    guessRef.current = null;
    setMarks({});
    setWon(false);
    wonRef.current = false;
    away.current = false;
    const v = views.current[0];
    v?.setGuess(null);
    void v?.reset();
  };

  const run = async () => {
    const v = views.current[0];
    if (!v || runningRef.current || wonRef.current) return;
    const g = guessRef.current;
    if (!g) { nav.onRunReport?.({ result: 'no_guess', program }); speak(LINES.guessFirst); v.askPick(); return; }
    runningRef.current = true;
    setRunning(true);
    setMarks({});
    nav.onRun?.();
    const t = simulate(board, program);
    const done = new Set<string>();
    let last = -1;
    let iteration: Marks['iteration'] = null;
    const onStep = (s: TraceStep) => {
      if (s.index <= last) return;
      last = s.index;
      const k = refKey(s.ref);
      if (s.ref.inner != null) iteration = { item: s.ref.item, iter: s.ref.iter ?? 0 };
      setMarks({ current: k, done: new Set(done), iteration });
      done.add(k);
    };
    const res = await v.play(t, { onStep, quiet: true, celebrate: false });
    away.current = true;
    if (res === 'aborted') { runningRef.current = false; setRunning(false); return; }
    setMarks({ iteration });
    nav.onResult?.(sameCell(t.final, g) ? 'win' : 'short');
    nav.onRunReport?.({ result: sameCell(t.final, g) ? 'win' : 'wrong_guess', program, guess: { c: g.c, r: g.r }, final: { c: t.final.c, r: t.final.r } });
    if (sameCell(t.final, g)) {
      await v.celebrate();
      const line = nav.won(level, program);
      wonRef.current = true;
      setWon(true);
      speak(line || LINES.won);
    } else {
      await v.missed(g);
      speak(LINES.missed);
    }
    runningRef.current = false;
    setRunning(false);
  };

  /** ✋ follows the program with a finger: the first block, where Brote gets to; the next block, where he gets to. */
  const help = () => {
    if (runningRef.current || wonRef.current) return;
    const steps: DemoStep[] = [];
    for (const s of simulate(board, program).steps.slice(0, 2)) {
      steps.push({ do: 'point', at: [`.zone-program [data-ref="${refKey(s.ref)}"]`] });
      steps.push({ do: 'point', at: [`.board [data-cell="${s.to.c},${s.to.r}"]`] });
    }
    ghost(steps);
  };

  /**
   * T20: predict's own wordless demo (never ✋'s help, which already points
   * at the real path): a pulsing "?" over the board, the ghost hovering a
   * few cells without landing on any of them, then a point at ▶ — "tocá un
   * lugar, después probá", never which one.
   */
  const playSilentDemo = () => {
    if (level.silentDemo !== 'predict' || runningRef.current || wonRef.current) return;
    markSilentDemoShown('predict');
    nav.onIntro?.(level);
    pulseGuess(rootRef.current!);
    const r = ghost([{ do: 'point', at: ['.board [data-cell]'] }, { do: 'point', at: ['.btn-play'] }]);
    void r;
  };

  useEffect(() => {
    if (level.silentDemo !== 'predict' || !isMuted() || silentDemoShown('predict')) return;
    const t = setTimeout(() => {
      if (runningRef.current || wonRef.current || guessRef.current) return;
      playSilentDemo();
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  useDebugHooks({ level, program, guess: (c: number, r: number) => pick({ c, r }), run, help, restart, picked: () => guessRef.current });

  const editor = useBlockEditor({
    blocks: [], label: level.blockLabel, program, marks, disabled: running || won, lines: 'read',
    onTapPalette: () => {}, onTapBlock: () => {}, onTapeCount: () => {}, onTapeActivate: () => {}, onDrop: () => {},
  });

  return (
    <Shell level={level} mode="program" rootRef={rootRef} onSpeak={say} onHelp={help} busy={running} noPalette>
      <section className="zone zone-program" data-zone="program" aria-label="El programa de Brote">{editor.program}</section>
      <section className="level-stage" aria-label="Tablero">
        <div className="controls">
          {won ? <NextPage level={level} /> : (
            <button type="button" className="btn btn-play cut" onClick={() => void run()} disabled={running} aria-label="Probar">
              <PlayIcon /><span>Probar</span>
            </button>
          )}
          <RestartButton onClick={restart} disabled={running} />
          {nav.gold?.(level, won)}
          {nav.reward?.(level, won)}
        </div>
        <Sheets level={level} svgs={svgs} />
      </section>
    </Shell>
  );
}

export function LevelScreen({ level }: { level: LevelDef }) {
  const Mode = useMemo(
    () => (level.mode === 'direct' ? DirectLevel : level.mode === 'realtime' ? RealtimeLevel : formatOf(level) === 'predict' ? PredictLevel : ProgramLevel),
    [level],
  );
  const Wrap = useContext(LevelWrapContext);
  if (!Wrap) return <Mode level={level} />;
  return (
    <LevelWrapContext.Provider value={null}>
      <Wrap level={level}><Mode level={level} /></Wrap>
    </LevelWrapContext.Provider>
  );
}
