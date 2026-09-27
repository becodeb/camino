// A 3ro page: the child's first games. The program is no longer one stack
// under ▶ that runs once: it is a few rule cards, each a trigger (a hat) and
// what it does. ▶ starts the game and the rules keep listening while it
// runs: every arrow key fires its rule (its hat's ear twitches, its card
// flashes), a key without a rule makes Brote shrug, and on page 2 seeds fall
// on their own. The world runs on the pure engine of game/rules.ts, stepped
// by a timer; the board only animates the events it returns.
// Three controls, as everywhere: ▶ (■ while playing, the same button),
// ↺ (a clean page), ✋ (the ghost hand builds the missing rule).

import { useEffect, useRef, useState } from 'react';
import { type DemoStep } from '../ui/ghost';
import { speak } from '../ui/speech';
import { PlayIcon, StopIcon } from '../ui/icons';
import { PlayLamp } from '../ui/art';
import { KeyCap } from '../blocks/blocks';
import { ruleNotebookWidth, useLatest, useRuleEditor, type RuleEditorApi } from '../blocks/RuleEditor';
import { addAction, addRule, removeRef, ruleRefusal, type RuleBlock, type RuleDropResult } from '../game/ruleEditor';
import { nextMove } from '../game/engine';
import { type LevelDef } from '../game/levels';
import { DIRS, type Dir } from '../game/model';
import {
  MOVE_TICKS, TICK_MS, chaseSeed, hatOfKey, isHat, keyOf, rtInit, rtStep,
  type ActionId, type HatId, type Rule, type RtEvent,
} from '../game/rules';
import { DEBUG, NextPage, RestartButton, Shell, useBoard, useDebugHooks, useGhost, useInstruction, useLevelNav } from './levelKit';

const LINES = {
  won: '¡Lo lograste!',
  notYet: 'Primero tocá Probar: así el juego empieza.',
  orphan: 'Esto va debajo de un cuando.',
};

/** Pages whose first-entry intro already played (per visit, like the stamps). */
const introPlayed = new Set<string>();

const cloneRules = (r: readonly Rule[]): Rule[] => r.map((x) => ({ hat: x.hat, actions: [...x.actions] }));

/** Keys of the keyboard drawn as a small inverted T, like the arrows of a real keyboard. */
function KeyPad({ keys, onPress }: { keys: Dir[]; onPress: (d: Dir) => void }) {
  return (
    <div className="keypad" aria-label="Flechas del teclado">
      {DIRS.filter((d) => keys.includes(d)).map((d) => (
        <button key={d} type="button" className={`key-btn key-${d}`} data-dir={d} aria-label={`Flecha ${d}`} onPointerDown={(e) => { e.preventDefault(); onPress(d); }}>
          <KeyCap dir={d} size={58} />
        </button>
      ))}
    </div>
  );
}

export function RealtimeLevel({ level }: { level: LevelDef }) {
  const def = level.realtime!;
  const board = level.worlds[0];
  const rootRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const { svgRef, viewRef } = useBoard(level);
  const say = useInstruction(level);
  const ghost = useGhost(rootRef);
  const nav = useLevelNav();
  const hats = level.blocks.filter(isHat) as HatId[];
  const keys = hats.map(keyOf).filter((k): k is Dir => !!k);
  const opts = { maxActions: def.maxActions, maxRules: hats.length };

  const [rules, setRulesState] = useState<Rule[]>(() => cloneRules(def.initial));
  const rulesRef = useRef(rules);
  const setRules = (r: Rule[]) => { rulesRef.current = r; setRulesState(r); };
  const [active, setActive] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [won, setWon] = useState(false);
  const wonRef = useRef(false);
  const [demoing, setDemoing] = useState(false);
  const demoRef = useRef(false);
  const [refused, setRefused] = useState<{ n: number; id: string; from: DOMRect } | null>(null);
  const sim = useRef(rtInit(board, def));
  const pressed = useRef<Dir[]>([]);
  const lastMove = useRef<Promise<void>>(Promise.resolve());
  const apiRef = useRef<RuleEditorApi | null>(null);

  // the jar and the speed of the rain
  useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    v.fall = { speed: def.spawner?.speed ?? 0, tickMs: TICK_MS };
    if (def.win.kind === 'score') v.setJar(def.win.n);
    if (def.spawner) v.setClouds();
  }, [def, viewRef]);

  // ---------------------------------------------------------------- the game loop
  const onEvent = (e: RtEvent) => {
    const v = viewRef.current!;
    const api = apiRef.current;
    switch (e.t) {
      case 'fire':
        api?.flash(e.rule);
        if (!rulesRef.current[e.rule]?.actions.length) api?.callSlot(e.rule);
        break;
      case 'shrug':
        v.shrug(e.key);
        api?.wiggle(hatOfKey(e.key));
        break;
      case 'move': lastMove.current = v.rtMove(e.step, e.dir, MOVE_TICKS * TICK_MS); break;
      case 'spawn': v.addFaller(e.id, e.c, e.y); break;
      case 'collect': v.collectFaller(e.id); break;
      case 'pass': v.passFaller(e.id); break;
      case 'lost': v.loseFaller(e.id); break;
      case 'score': v.setScore(e.score); break;
      case 'win': void finish(); break;
    }
  };

  const tick = useLatest(() => {
    const v = viewRef.current;
    if (!v || !runningRef.current) return;
    const { state, events } = rtStep(board, def, rulesRef.current, sim.current, pressed.current.splice(0));
    sim.current = state;
    events.forEach(onEvent);
    v.syncFallers(state.seeds);
  });

  useEffect(() => {
    if (!running) return;
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [running, tick]);

  const setGame = (on: boolean) => {
    runningRef.current = on;
    setRunning(on);
    const v = viewRef.current;
    if (v) v.running = on;
  };

  const start = () => {
    if (wonRef.current || runningRef.current) return;
    sim.current = rtInit(board, def);
    pressed.current = [];
    setGame(true);
  };

  const stop = () => {
    setGame(false);
    sim.current = rtInit(board, def);
    pressed.current = [];
    void viewRef.current?.rtReset();
  };

  const finish = async () => {
    setGame(false);
    await lastMove.current;
    wonRef.current = true;
    setWon(true);
    nav.won(level);
    speak(LINES.won);
    await viewRef.current?.celebrate();
  };

  /** An arrow key (keyboard or on screen). Before ▶ the game is not listening: ▶ calls. */
  const press = useLatest((d: Dir) => {
    if (!keys.includes(d) || wonRef.current) return;
    const k = rootRef.current?.querySelector<HTMLElement>(`.key-btn[data-dir="${d}"]`);
    k?.animate([{ translate: '0 0' }, { translate: '0 4px' }, { translate: '0 0' }], { duration: 160 });
    if (!runningRef.current) {
      rootRef.current?.querySelector('.btn-play')?.animate([{ rotate: '0deg' }, { rotate: '-4deg', scale: '1.06' }, { rotate: '3deg' }, { rotate: '0deg', scale: '1' }], { duration: 480 });
      return;
    }
    pressed.current.push(d);
  });

  useEffect(() => {
    const map: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    const on = (e: KeyboardEvent) => {
      const d = map[e.key];
      if (!d) return;
      e.preventDefault();
      if (!e.repeat) press(d);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [press]);

  // ---------------------------------------------------------------- editing
  const glance = (el: Element | null) => {
    const r = el?.getBoundingClientRect();
    if (r) viewRef.current?.glanceAt(r.left + r.width / 2, r.top + r.height / 2);
  };

  const editAddRule = (hat: HatId) => {
    const cur = rulesRef.current;
    if (ruleRefusal(cur, { newRule: true }, { kind: 'hat', id: hat }, opts)) return -1;
    setRules(addRule(cur, hat));
    setActive(cur.length);
    return cur.length;
  };
  const editAddAction = (rule: number, action: ActionId) => {
    const cur = rulesRef.current;
    if (!cur[rule] || ruleRefusal(cur, { rule, at: cur[rule].actions.length }, { kind: 'action', id: action }, opts)) return false;
    setRules(addAction(cur, rule, cur[rule].actions.length, action));
    return true;
  };

  const tapPalette = (block: RuleBlock, el: HTMLElement) => {
    if (demoRef.current || wonRef.current) return;
    const cur = rulesRef.current;
    if (block.kind === 'hat') {
      const dup = cur.findIndex((r) => r.hat === block.id);
      if (dup >= 0) { setActive(dup); apiRef.current?.shake(dup); return; }
      if (editAddRule(block.id) >= 0) glance(el);
      return;
    }
    // an action goes to the card taking taps, or the last card with room
    const room = (i: number) => i >= 0 && i < cur.length && cur[i].actions.length < opts.maxActions;
    let target = active != null && room(active) ? active : -1;
    if (target < 0) for (let i = cur.length - 1; i >= 0; i--) if (room(i)) { target = i; break; }
    if (target < 0) {
      setRefused((r) => ({ n: (r?.n ?? 0) + 1, id: block.id, from: el.getBoundingClientRect() }));
      if (!cur.length) { speak(LINES.orphan); hats.forEach((h) => apiRef.current?.wiggle(h)); }
      else apiRef.current?.shake(active ?? cur.length - 1);
      return;
    }
    editAddAction(target, block.id);
    setActive(target);
    glance(el);
  };

  const onDrop = (res: RuleDropResult) => {
    if (res.outcome === 'rejected') {
      if (res.reason === 'dup' && res.rule != null) apiRef.current?.shake(res.rule);
      else if (res.reason === 'full' && res.rule != null) apiRef.current?.shake(res.rule);
      else if (res.reason === 'orphan') hats.forEach((h) => apiRef.current?.wiggle(h));
      return;
    }
    if (!res.rules) return;
    setRules(res.rules);
    if (res.outcome === 'add' || res.outcome === 'move') setActive(res.rule ?? null);
    else setActive(null);
  };

  const restart = () => {
    if (demoRef.current) return;
    stop();
    setRules(cloneRules(def.initial));
    setActive(null);
    wonRef.current = false;
    setWon(false);
  };

  // ---------------------------------------------------------------- the ghost hand
  const demo = (steps: DemoStep[], pace?: number) => {
    demoRef.current = true;
    setDemoing(true);
    const run = ghost(steps, { pace });
    const end = () => { demoRef.current = false; setDemoing(false); };
    if (run) void run.then(end); else end();
  };

  /** The steps that build one rule for real: its hat into a new card, then each action into the card's free line. */
  const buildSteps = (want: Rule): DemoStep[] => {
    const cur = rulesRef.current;
    let i = cur.findIndex((r) => r.hat === want.hat);
    const steps: DemoStep[] = [];
    if (i < 0) {
      i = cur.length;
      steps.push({ do: 'drag', from: `.zone-palette [data-cmd="${want.hat}"]`, to: '.zone-program [data-key="new"]', apply: () => { editAddRule(want.hat); } });
    } else setActive(i);
    const have = [...(cur[i]?.actions ?? [])];
    for (const a of want.actions) {
      const k = have.indexOf(a);
      if (k >= 0) { have.splice(k, 1); continue; }
      const at = i;
      steps.push({ do: 'drag', from: `.zone-palette [data-cmd="${a}"]`, to: `.zone-program [data-key="r${at}/slot"]`, apply: () => { editAddAction(at, a); setActive(at); } });
    }
    return steps;
  };

  /** First entry of page 1: one arrow rule is built, ▶, and its key is pressed. The idea, not the answer (≤ 8 s). */
  const playIntro = () => {
    const r = def.intro;
    if (!r || demoRef.current || wonRef.current || rulesRef.current.some((x) => x.hat === r.hat)) return;
    introPlayed.add(level.id);
    const k = keyOf(r.hat);
    const steps: DemoStep[] = [
      ...buildSteps(r),
      { do: 'tap', at: '.btn-play', apply: start },
      ...(k ? [{ do: 'tap' as const, at: `.key-btn[data-dir="${k}"]`, apply: () => press(k) }] : []),
    ];
    demo(steps, 0.7);
  };

  useEffect(() => {
    // screenshots: ?debug&nointro opens the page as it is after the intro
    if (!def.intro || introPlayed.has(level.id) || (DEBUG && location.search.includes('nointro'))) return;
    const t = setTimeout(playIntro, 1200);
    return () => clearTimeout(t);
    // once, on entry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * ✋: first take out what the reference rules do not have (a card or an
   * action), then build the first missing rule (for real), then ▶, then
   * which key to press now (towards the seed, or under the next falling one).
   */
  const help = () => {
    if (demoRef.current || wonRef.current) return;
    const cur = rulesRef.current;
    const ref = def.solution;
    for (let i = 0; i < cur.length; i++) {
      const want = ref.find((r) => r.hat === cur[i].hat);
      if (!want) {
        demo([{ do: 'drag', from: `.zone-program [data-ref="r${i}"]`, to: '.zone-palette', apply: () => { setRules(removeRef(rulesRef.current, { rule: i })); setActive(null); } }]);
        return;
      }
      const j = cur[i].actions.findIndex((a) => !want.actions.includes(a));
      if (j >= 0) {
        demo([{ do: 'drag', from: `.zone-program [data-ref="r${i}:${j}"]`, to: '.zone-palette', apply: () => setRules(removeRef(rulesRef.current, { rule: i, action: j })) }]);
        return;
      }
    }
    for (const want of ref) {
      const steps = buildSteps(want);
      if (steps.length) { demo(steps); return; }
    }
    if (!runningRef.current) { demo([{ do: 'tap', at: '.btn-play', apply: start }]); return; }
    const d = def.win.kind === 'goal' ? nextMove(board, sim.current.robot) : chaseSeed(sim.current);
    if (d && keys.includes(d)) ghost([{ do: 'tap', at: `.key-btn[data-dir="${d}"]` }]);
  };

  const editor = useRuleEditor({
    blocks: level.blocks,
    label: level.blockLabel,
    rules,
    opts,
    active,
    disabled: won,
    inert: demoing,
    refused,
    onTapPalette: tapPalette,
    onTapHat: (i) => { if (!demoRef.current) setActive((a) => (a === i ? null : i)); },
    onTapAction: (ref) => { if (!demoRef.current && !wonRef.current) setRules(removeRef(rulesRef.current, ref)); },
    onDrop,
  });
  apiRef.current = editor.api;

  useDebugHooks({
    level, rules, setRules: (r: Rule[]) => setRules(cloneRules(r)), start, stop, press, help, restart, playIntro,
    running: () => runningRef.current, sim: () => sim.current,
    tapPalette: (id: string) => {
      const el = document.querySelector<HTMLElement>(`.zone-palette [data-cmd="${id}"]`);
      if (el) tapPalette(isHat(id) ? { kind: 'hat', id } : { kind: 'action', id: id as ActionId }, el);
    },
  });

  return (
    <Shell level={level} mode="realtime" rootRef={rootRef} onSpeak={say} onHelp={help} busy={false} notebookW={ruleNotebookWidth()}>
      <section className="zone zone-palette" data-zone="palette" aria-label="Bloques">{editor.palette}</section>
      <section className="zone zone-program" data-zone="program" aria-label="Tus reglas">{editor.notebook}</section>
      <section className="level-stage" aria-label="Tablero">
        <div className="controls">
          {won ? <NextPage level={level} /> : (
            <button type="button" className={`btn btn-play cut${running ? ' is-running' : ''}`} onClick={() => (runningRef.current ? stop() : start())} aria-label={running ? 'Parar' : 'Probar'}>
              {running ? <><StopIcon /><span>Parar</span></> : <><PlayIcon /><span>Probar</span></>}
            </button>
          )}
          <RestartButton onClick={restart} />
          <KeyPad keys={keys} onPress={press} />
        </div>
        <div ref={sheetRef} className={`sheet${running ? ' is-playing' : ''}`} data-zone="stage">
          <span className="tape tape-l" aria-hidden="true" />
          <span className="tape tape-r" aria-hidden="true" />
          <PlayLamp on={running} />
          <svg ref={svgRef} className="board" role="img" aria-label={`Tablero de ${board.cols} por ${board.rows}`} />
        </div>
      </section>
    </Shell>
  );
}
