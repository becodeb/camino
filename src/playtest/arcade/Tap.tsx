// "Tocá y pasa" (T47), 1ro's fourth monster game: events, cause and effect,
// free play. A meadow with three or four animals (the garden's critters);
// over each one a paper sign: the pointing hand on the animal ("when I tap
// it"), the "then" mark, and its rules, each a picture of what it does
// (tap.ts, tapArt.tsx). Two modes, told apart without words:
//
// - building ("Armar", a pencil on a sign): the signs are up, the chosen
//   animal is circled; the effect cards below show that animal doing each
//   thing; a tap on a card (or a drag onto an animal) adds that rule, and
//   the animal does it once at once; a tap on a rule on a sign takes it off.
//   "¡A jugar!" rings once there is a new rule to try.
// - playing ("¡A jugar!", the hand tapping the frog): the signs and the
//   cards go away, a little hand bobs over every animal with rules; a tap on
//   an animal runs its rules one after another (jump, colour, confetti,
//   hide, spin); an animal without rules just shakes and shows its empty
//   sign for a moment.
//
// Free play, no wrong answers. A round is "a rule made, then used" (tap.ts):
// won the first time the child, playing, taps an animal that got a new rule;
// then confetti, the child's character cheers, and the next tier unlocks
// more (the five effects, then the coatí walks in). The guided turn ends
// after GUIDED_ROUNDS rounds or GUIDED_TURN_MS (a minute more at most when
// no round comes), the arcade's is endless.
//
// Logged (Kit.tsx useGameLog): `game_start`, `game_round` with this game's
// measures (`new_rules`, `removed`, `rules` per animal, `rules_total`,
// `play_taps`, `play_taps_by_animal`, `no_rule_taps`, `effects_run`,
// `switches`, `build_ms`, `play_ms`, `sources`), `game_end` with the totals
// of the play, `rapid_taps`; `tap_rule` per rule added or taken off,
// `tap_mode` per switch between building and playing; `help`, `speak`,
// `ghost_demo` with `level_id: 'game:tap'`.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { progress, solve } from '../../curriculum/progress';
import { Bar } from '../../screens/LevelBar';
import { DEBUG } from '../../screens/levelKit';
import { SeedPouch } from '../../screens/yearKit';
import type { StageView } from '../../ui/board/StageView';
import { glowTargets, playGhost, type GhostRun } from '../../ui/ghost';
import { markSilentDemoShown, silentDemoShown } from '../../ui/silentDemo';
import { ringNote } from '../../ui/sound';
import { speak, speakWhenAllowed, stopSpeaking } from '../../ui/speech';
import { usePlaytest } from '../context';
import { provideDemoActions } from '../demo';
import { Buddy, ConfettiRain, DizzyStars, RoundDots, gameLevelId, sitDizzy, useGameLog, useIdleNudge, useRapidTaps, type GameProps } from './Kit';
import { GUIDED_ROUNDS, GUIDED_TURN_MS, guidedTurnOver, nextTier } from './kit';
import {
  EFFECT_MS, MAX_RULES, TAP_MAX_TIER, addRule, madeRule, newRound, nextHue, removeRule, ruleCount, rulesOf, rulesSnapshot,
  sceneOf, unmadeRule, winsRound, type AnimalId, type EffectId, type RoundTrack, type Rules,
} from './tap';
import {
  BuildModeArt, SceneCritter, animalTop, Bush, ConfettiBurst, EFFECT_H, EFFECT_W, EffectArt, EffectPicture, HueDefs, Meadow, PlayModeArt, SIGN_SLOT,
  SignBoard, TapHand, TapTaskArt, ThenMark, TriggerArt, hueFilter, signWidth,
} from './tapArt';
import './arcade.css';

const GAME = 'tap' as const;
const LEVEL_ID = gameLevelId(GAME);
const SEED_PREFIX = 'game:tap:';

const ANIMAL_NAME: Record<AnimalId, string> = { rana: 'La rana.', zorro: 'El zorro.', carpincho: 'El carpincho.', coati: 'El coatí.' };
const EFFECT_SAY: Record<EffectId, string> = { jump: '¡Salta!', colour: '¡Cambia de color!', confetti: '¡Tira papelitos!', hide: '¡Se esconde!', spin: '¡Gira!' };
const EFFECT_NOTE: Record<EffectId, 'do' | 're' | 'mi' | 'fa' | 'sol'> = { jump: 'do', colour: 're', confetti: 'mi', hide: 'fa', spin: 'sol' };

const LINES = {
  first: '¡Tocá y pasa! Tocá un animal, elegí abajo qué hace cuando lo tocás, y después tocá «¡A jugar!».',
  build: 'Armá: tocá un animal y elegí qué hace.',
  play: '¡A jugar! Tocá los animales.',
  full: 'Ya tiene tres. Tocá un dibujo del cartel para sacarlo.',
  removed: 'Lo sacaste.',
  empty: 'Ese no hace nada todavía. Tocá «Armar» y ponele algo.',
  won: '¡Mirá lo que hiciste!',
  more: '¡Hay dibujos nuevos!',
  coati: '¡Llegó el coatí!',
  dizzy: '¡Uy, qué mareo! Despacito.',
  help: 'Tocá un animal, después un dibujo de abajo. Después tocá «¡A jugar!» y tocá el animal.',
};

// ---------------------------------------------------------------- the scene's geometry

const VW = 1200, VH = 470, GROUND = 432;
/** The signs' foot (their stick stands on it). */
const SIGN_Y = 286;
const xsOf = (n: number) => (n >= 4 ? [165, 455, 745, 1035] : [230, 600, 970]);
const signScaleOf = (n: number) => (n >= 4 ? 0.78 : 0.95);

type Mode = 'build' | 'play';
type Source = 'tap' | 'drag';
type Act = { effect: EffectId; n: number } | null;

interface Stats {
  added: number; removed: number; playTaps: number; noRuleTaps: number; switches: number; buildMs: number; playMs: number;
  byAnimal: Partial<Record<AnimalId, number>>; effectsRun: Partial<Record<EffectId, number>>; sources: Record<Source, number>;
}
const newStats = (): Stats => ({ added: 0, removed: 0, playTaps: 0, noRuleTaps: 0, switches: 0, buildMs: 0, playMs: 0, byAnimal: {}, effectsRun: {}, sources: { tap: 0, drag: 0 } });

export function TapGame({ mode, startTier, rounds, done, roundWon, stopAfterRound, reached, playNo }: GameProps) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const glog = useGameLog(GAME, mode, playNo, startTier);
  const [firstEver] = useState(() => !silentDemoShown(LEVEL_ID));

  const [no, setNo] = useState(1);
  const [tier, setTier] = useState(Math.min(TAP_MAX_TIER, startTier));
  const [phase, setPhase] = useState<Mode>('build');
  const [rules, setRules] = useState<Rules>({});
  const [selected, setSelected] = useState<AnimalId>('rana');
  const [hue, setHue] = useState<Partial<Record<AnimalId, number>>>({});
  const [acting, setActing] = useState<Partial<Record<AnimalId, Act>>>({});
  const [shake, setShake] = useState<{ a: AnimalId; n: number } | null>(null);
  const [emptyFlash, setEmptyFlash] = useState<AnimalId | null>(null);
  const [fresh, setFresh] = useState<readonly AnimalId[]>([]);
  const [won, setWon] = useState(0);
  const [confetti, setConfetti] = useState(0);
  const [arriving, setArriving] = useState<AnimalId | null>(null);
  const [newCards, setNewCards] = useState(false);
  const [drag, setDrag] = useState<{ e: EffectId; x: number; y: number } | null>(null);
  const [freeze, setFreeze] = useState<number | null>(null);
  const scene = useMemo(() => sceneOf(tier), [tier]);

  const g = useRef({
    mode: 'build' as Mode, rules: {} as Rules, selected: 'rana' as AnimalId, tier: Math.min(TAP_MAX_TIER, startTier), no: 1,
    track: newRound() as RoundTrack, open: false, st: newStats(), tot: newStats(), made: 0, actN: 0, hue: {} as Partial<Record<AnimalId, number>>,
    busy: new Set<AnimalId>(), modeSince: Date.now(), lastInput: Date.now(), helpStep: 0, mountAt: Date.now(), timers: new Set<number>(),
    ghost: null as GhostRun | null, unmounted: false, ending: false, winning: false,
  });
  const rootRef = useRef<HTMLElement>(null);
  const buddy = useRef<StageView | null>(null);

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { g.current.timers.delete(id); if (!g.current.unmounted) fn(); }, ms);
    g.current.timers.add(id);
  };
  const setR = (r: Rules) => { g.current.rules = r; setRules(r); };
  const setT = (t: RoundTrack) => { g.current.track = t; setFresh(t.fresh); };

  const { hit, dizzy } = useRapidTaps(GAME, () => g.current.no, () => {
    speak(LINES.dizzy);
    void sitDizzy(buddy.current);
  }, () => glog.rapid());

  // ---------------------------------------------------------------- the time in each mode, the totals for game_end

  /** Closes the stretch in the current mode (its time goes to build_ms or play_ms; playing counts only with rules). */
  function closeStretch() {
    const s = g.current;
    const ms = Date.now() - s.modeSince;
    s.modeSince = Date.now();
    for (const x of [s.st, s.tot]) {
      if (s.mode === 'build') x.buildMs += ms;
      else if (ruleCount(s.rules) > 0) x.playMs += ms;
    }
    return ms;
  }
  const measures = (x: Stats) => ({
    rules: rulesSnapshot(g.current.rules), rules_total: ruleCount(g.current.rules),
    play_taps: x.playTaps, play_taps_by_animal: { ...x.byAnimal }, no_rule_taps: x.noRuleTaps, effects_run: { ...x.effectsRun },
    switches: x.switches, build_ms: x.buildMs, play_ms: x.playMs, sources: { ...x.sources },
  });
  function syncEnd() {
    const s = g.current;
    closeStretch();
    const t = s.tot;
    glog.endInfo({
      ...measures(t), rules_made: t.added, rules_removed: t.removed,
      animals_with_rules: Object.keys(rulesSnapshot(s.rules)).length, tier: s.tier,
    });
  }

  // ---------------------------------------------------------------- an animal does its rules

  function act(a: AnimalId, effects: readonly EffectId[], then?: () => void) {
    const s = g.current;
    if (!effects.length || s.busy.has(a)) return false;
    s.busy.add(a);
    let at = 0;
    for (const e of effects) {
      later(() => {
        const n = ++g.current.actN;
        setActing((x) => ({ ...x, [a]: { effect: e, n } }));
        ringNote(EFFECT_NOTE[e]);
        if (e === 'colour') {
          const h = nextHue(g.current.hue[a] ?? 0);
          g.current.hue = { ...g.current.hue, [a]: h };
          setHue(g.current.hue);
        }
      }, at);
      at += EFFECT_MS[e];
    }
    later(() => {
      g.current.busy.delete(a);
      setActing((x) => ({ ...x, [a]: null }));
      then?.();
    }, at + 60);
    return true;
  }

  // ---------------------------------------------------------------- building

  function touched() {
    const s = g.current;
    s.lastInput = Date.now();
    s.ghost?.cancel();
    s.ghost = null;
    if (s.open) glog.input();
  }

  function selectAnimal(a: AnimalId) {
    if (!hit()) return;
    touched();
    g.current.selected = a;
    setSelected(a);
    speak(ANIMAL_NAME[a]);
    void buddy.current?.nod();
  }

  /** `byGhost` (T52): the first-time ghost's card really adds the rule (not the child's input: no tap counted, `source: 'ghost'`). */
  function addEffect(e: EffectId, source: Source, to?: AnimalId, byGhost = false) {
    if (!byGhost && !hit()) return;
    const s = g.current;
    if (s.mode !== 'build' || s.ending) return;
    const a = to ?? s.selected;
    if (to) { s.selected = to; setSelected(to); }
    const r = addRule(s.rules, a, e);
    if (!r.added) {
      if (byGhost) return;
      touched();
      setShake((x) => ({ a, n: (x?.n ?? 0) + 1 }));
      speak(LINES.full);
      return;
    }
    if (!s.open) {
      s.open = true;
      glog.roundStart(s.no, s.tier);
    }
    if (byGhost) s.lastInput = Date.now(); else touched();
    setR(r.rules);
    setT(madeRule(s.track, a));
    for (const x of [s.st, s.tot]) { x.added++; if (!byGhost) x.sources[source]++; }
    s.made++;
    glog.log('tap_rule', { game: GAME, mode, play_no: playNo, round: s.no, tier: s.tier, animal: a, effect: e, action: 'add', count: rulesOf(r.rules, a).length, source: byGhost ? 'ghost' : source });
    speak(EFFECT_SAY[e]);
    act(a, [e]);
    syncEnd();
  }

  function removeAt(a: AnimalId, i: number) {
    if (!hit()) return;
    const s = g.current;
    if (s.mode !== 'build' || s.ending) return;
    touched();
    const r = removeRule(s.rules, a, i);
    if (!r.removed) return;
    setR(r.rules);
    setT(unmadeRule(s.track, a, r.rules));
    for (const x of [s.st, s.tot]) x.removed++;
    glog.log('tap_rule', { game: GAME, mode, play_no: playNo, round: s.no, tier: s.tier, animal: a, effect: r.removed, action: 'remove', count: rulesOf(r.rules, a).length });
    ringNote('re');
    speak(LINES.removed);
    syncEnd();
  }

  // ---------------------------------------------------------------- the two modes

  function toMode(m: Mode) {
    const s = g.current;
    if (s.mode === m || s.ending) return;
    s.lastInput = Date.now();
    s.ghost?.cancel();
    s.ghost = null;
    const ms = closeStretch();
    for (const x of [s.st, s.tot]) x.switches++;
    glog.log('tap_mode', { game: GAME, mode, play_no: playNo, round: s.no, tier: s.tier, to: m, rules_total: ruleCount(s.rules), stretch_ms: ms });
    s.mode = m;
    setPhase(m);
    setEmptyFlash(null);
    speak(m === 'play' ? LINES.play : LINES.build);
    ringNote(m === 'play' ? 'sol' : 'do');
    syncEnd();
  }

  // ---------------------------------------------------------------- playing

  function tapAnimal(a: AnimalId) {
    const s = g.current;
    if (s.mode === 'build') { selectAnimal(a); return; }
    if (!hit()) return;
    touched();
    for (const x of [s.st, s.tot]) { x.playTaps++; x.byAnimal[a] = (x.byAnimal[a] ?? 0) + 1; }
    const effects = rulesOf(s.rules, a);
    if (!effects.length) {
      for (const x of [s.st, s.tot]) x.noRuleTaps++;
      setShake((x) => ({ a, n: (x?.n ?? 0) + 1 }));
      setEmptyFlash(a);
      later(() => setEmptyFlash((x) => (x === a ? null : x)), 1400);
      speak(LINES.empty);
      return;
    }
    const wins = !s.winning && s.open && winsRound(s.track, a, s.rules);
    if (wins) s.winning = true;
    const ran = act(a, effects, wins ? winRound : undefined);
    if (!ran) { if (wins) s.winning = false; return; }
    for (const x of [s.st, s.tot]) for (const e of effects) x.effectsRun[e] = (x.effectsRun[e] ?? 0) + 1;
    syncEnd();
  }

  function winRound() {
    const s = g.current;
    s.winning = false;
    if (s.ending) return;
    closeStretch();
    glog.attempt();
    const end = glog.roundWon({ ...measures(s.st), animals: sceneOf(s.tier).animals.length, effects_offered: sceneOf(s.tier).effects.length, new_rules: s.st.added, removed: s.st.removed });
    roundWon?.(end);
    apiRef.current.lowerHand('self', LEVEL_ID);
    const n = Object.keys(progress.get().solved).filter((k) => k.startsWith(SEED_PREFIX)).length;
    progress.update((q) => solve(q, `${SEED_PREFIX}${n + 1}`));
    setWon((w) => w + 1);
    setConfetti((c) => c + 1);
    void buddy.current?.cheer(true);
    later(() => speak(LINES.won), 300);
    const wonNo = s.no;
    s.no += 1;
    s.open = false;
    s.st = newStats();
    setNo(s.no);
    setT(newRound());
    syncEnd();
    if (mode === 'guided' && (guidedTurnOver(wonNo, s.mountAt, Date.now(), rounds ?? GUIDED_ROUNDS) || !!stopAfterRound?.())) {
      // a little more time to play with what they made, then the next step
      s.ending = true;
      later(() => { syncEnd(); glog.end('finished'); done(); }, 6000);
      return;
    }
    const t = nextTier(s.tier, TAP_MAX_TIER);
    if (t !== s.tier) later(() => unlock(t), 2600);
  }

  function unlock(t: number) {
    const s = g.current;
    const before = sceneOf(s.tier);
    s.tier = t;
    setTier(t);
    reached?.(t);
    const after = sceneOf(t);
    const comes = after.animals.find((a) => !before.animals.includes(a));
    if (comes) { setArriving(comes); later(() => setArriving(null), 2200); speak(LINES.coati); }
    if (after.effects.length > before.effects.length) { setNewCards(true); later(() => setNewCards(false), 2600); speak(LINES.more); }
  }

  // ---------------------------------------------------------------- mount: the first time, a wordless ghost demo

  useEffect(() => {
    reached?.(g.current.tier);
    let off = () => {};
    if (firstEver) {
      markSilentDemoShown(LEVEL_ID);
      off = speakWhenAllowed(LINES.first);
      later(() => {
        const root = rootRef.current;
        const s = g.current;
        if (!root || s.made || s.mode !== 'build') return;
        apiRef.current.log('ghost_demo', { level_id: LEVEL_ID, kind: 'intro' });
        // T52: the ghost's card really lands on the frog's sign (the frog jumps), then it points at "¡A jugar!" and hands over
        s.ghost = playGhost(root, [
          { do: 'point', at: ['.tp-animal-hit[data-animal="rana"]'] },
          { do: 'tap', at: '.tp-card[data-effect="jump"]', apply: () => { if (!g.current.made) addEffect('jump', 'tap', 'rana', true); } },
          { do: 'wait', ms: 1400 },
          { do: 'point', at: ['.tp-mode[data-mode="play"]'] },
        ], { pace: 1.2 });
      }, 900);
    } else off = speakWhenAllowed(LINES.build);
    // the guided turn's clock (and "quedan 5 minutos"), and the totals for game_end
    const tick = window.setInterval(() => {
      const s = g.current;
      if (s.unmounted || s.ending) return;
      syncEnd();
      if (mode !== 'guided' || s.winning) return;
      const timeUp = Date.now() - s.mountAt >= GUIDED_TURN_MS + 60_000;
      const wrap = !!stopAfterRound?.() && !s.open;
      if (timeUp || wrap) {
        s.ending = true;
        glog.end(s.open ? 'quit' : 'finished');
        done();
      }
    }, 1000);
    return () => {
      off();
      stopSpeaking();
      clearInterval(tick);
      const s = g.current;
      s.unmounted = true;
      s.ghost?.cancel();
      s.timers.forEach((x) => clearTimeout(x));
      s.timers.clear();
    };
    // once per play
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The next thing to do (✋ step 2 and the idle nudge): a card, "¡A jugar!", an animal with rules, or back to building. */
  const nextAt = () => {
    const s = g.current;
    if (s.mode === 'build') return s.track.fresh.length ? '.tp-mode[data-mode="play"]' : `.tp-card[data-effect="${sceneOf(s.tier).effects[0]}"]`;
    const withRules = sceneOf(s.tier).animals.filter((x) => rulesOf(s.rules, x).length);
    const target = s.track.fresh.find((x) => withRules.includes(x)) ?? withRules[0];
    return target ? `.tp-animal-hit[data-animal="${target}"]` : '.tp-mode[data-mode="build"]';
  };
  // T52: after 8 s with nothing done, the ghost points at the next thing to do
  useIdleNudge(rootRef, () => g.current.lastInput, () => !g.current.ending, undefined, () => {
    const root = rootRef.current;
    const s = g.current;
    if (!root) return;
    s.ghost?.cancel();
    s.ghost = playGhost(root, [{ do: 'point', at: [nextAt()] }]);
    apiRef.current.log('ghost_demo', { level_id: LEVEL_ID, kind: 'idle' });
  });

  // ---------------------------------------------------------------- a card dragged onto an animal (a tap is the same)

  const press = useRef<{ e: EffectId; x: number; y: number; pid: number; moved: boolean } | null>(null);
  const animalAt = (x: number, y: number): AnimalId | null => {
    for (const el of rootRef.current?.querySelectorAll<SVGElement>('.tp-animal-hit, .tp-sign-hit') ?? []) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el.dataset.animal as AnimalId;
    }
    return null;
  };
  const cardDown = (e: EffectId) => (ev: ReactPointerEvent<HTMLButtonElement>) => {
    if (ev.button !== 0) return;
    press.current = { e, x: ev.clientX, y: ev.clientY, pid: ev.pointerId, moved: false };
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* taps still work */ }
  };
  const cardMove = (ev: ReactPointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.pid !== ev.pointerId) return;
    if (!p.moved && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) < 10) return;
    p.moved = true;
    setDrag({ e: p.e, x: ev.clientX, y: ev.clientY });
  };
  const cardUp = (ev: ReactPointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    press.current = null;
    setDrag(null);
    if (!p || p.pid !== ev.pointerId) return;
    if (!p.moved) { addEffect(p.e, 'tap'); return; }
    const a = animalAt(ev.clientX, ev.clientY);
    if (a) addEffect(p.e, 'drag', a);
  };
  const cardCancel = () => { press.current = null; setDrag(null); };

  // ---------------------------------------------------------------- 🔊, ✋

  const onSpeak = () => {
    apiRef.current.log('speak', { level_id: LEVEL_ID });
    speak(g.current.mode === 'play' ? LINES.play : LINES.help);
  };
  const onHelp = () => {
    const s = g.current;
    const a = apiRef.current;
    if (s.helpStep >= 3) { a.raiseHand('help_step_3'); return; }
    const step = ++s.helpStep;
    if (a.level.current) a.level.current.helpStep = step;
    a.log('help', { level_id: LEVEL_ID, step });
    speak(LINES.help);
    const root = rootRef.current;
    if (!root) return;
    glowTargets(root, 2400);
    if (step === 1) return;
    const at = nextAt();
    s.ghost?.cancel();
    s.ghost = playGhost(root, [{ do: 'point', at: [at] }]);
    a.log('ghost_demo', { level_id: LEVEL_ID, kind: 'hint' });
  };

  // ---------------------------------------------------------------- checks (?debug), the demo bar

  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __monster: unknown }).__monster = {
      state: () => {
        const s = g.current;
        return {
          game: GAME, phase: s.mode, round: s.no, tier: s.tier, selected: s.selected, rules: rulesSnapshot(s.rules), fresh: s.track.fresh,
          animals: sceneOf(s.tier).animals, effects: sceneOf(s.tier).effects, busy: [...s.busy], hue: s.hue, ending: s.ending, won, dizzy,
        };
      },
      tier: (t: number) => unlock(Math.max(1, Math.min(TAP_MAX_TIER, t))),
      /** Screenshots: `a` held still `at` ms into doing `e` (a loaded host takes a screenshot later than asked). */
      freeze: (a: AnimalId, e: EffectId, at: number) => { setFreeze(at); setActing((x) => ({ ...x, [a]: { effect: e, n: ++g.current.actN } })); },
      unfreeze: () => { setFreeze(null); setActing({}); },
    };
    return () => { delete (window as unknown as { __monster?: unknown }).__monster; };
  });
  const demoRef = useRef({ skip: () => {}, solve: () => {} });
  demoRef.current = {
    skip: () => { const s = g.current; if (!s.open) { s.open = true; glog.roundStart(s.no, s.tier); } winRound(); },
    solve: () => {
      const s = g.current;
      if (s.mode !== 'build') return;
      addEffect('jump', 'tap', s.selected);
      toMode('play');
    },
  };
  useEffect(() => provideDemoActions({ rank: 2, noun: 'ronda', skip: () => demoRef.current.skip(), solve: () => demoRef.current.solve() }), []);

  // ---------------------------------------------------------------- drawing

  const xs = xsOf(scene.animals.length);
  const sk = signScaleOf(scene.animals.length);
  const sw = signWidth(MAX_RULES);
  const playing = phase === 'play';
  const ready = !playing && fresh.length > 0;
  return (
    <main
      ref={rootRef} className={`pp-page ga-game tp-game is-${phase}${dizzy ? ' is-dizzy' : ''}`}
      data-game={GAME} data-phase={phase} data-round={no} data-tier={tier}
      {...(freeze != null ? { 'data-freeze': '', style: { '--freeze': `${-freeze}ms` } as CSSProperties } : {})}
    >
      <Bar
        instruction={<span className="drawn-task" aria-hidden="true"><TapTaskArt /></span>}
        title={<><b>Tocá y pasa</b>{`ronda ${no} · ${scene.animals.length} animales`}</>}
        pages={<RoundDots total={mode === 'guided' ? rounds ?? 3 : Math.min(8, won + 1)} done={won} />}
        aside={<SeedPouch />}
        onSpeak={onSpeak}
        onHelp={onHelp}
      />
      <section className="sheet tp-scene-sheet" aria-label="El prado de los animales">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <svg className="tp-scene" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Los animales y sus carteles">
          <HueDefs />
          <Meadow w={VW} h={VH} ground={GROUND} />
          {/* the rule signs (building) */}
          <g className="tp-signs">
            {scene.animals.map((a, i) => {
              const list = rulesOf(rules, a);
              const lit = !playing && selected === a;
              return (
                <g key={a} className={`tp-sign${lit ? ' is-lit' : ''}${arriving === a ? ' is-arriving' : ''}`} data-animal={a} style={{ transform: `translate(${xs[i]}px, ${SIGN_Y}px) scale(${sk})` }}>
                  <SignBoard w={sw} seed={i + 2} lit={lit}>
                    <g className="tp-sign-trigger" onClick={() => !playing && selectAnimal(a)}><TriggerArt animal={a} /></g>
                    <ThenMark x={98} y={44} />
                    {Array.from({ length: MAX_RULES }, (_, k) => {
                      const x = 132 + k * (SIGN_SLOT + 6), y = 14;
                      const e = list[k];
                      if (!e) return <rect key={`s${k}`} className="tp-slot-empty" x={x} y={y} width={SIGN_SLOT} height={SIGN_SLOT} rx={8} fill="none" stroke="#2b2622" strokeWidth={2} strokeDasharray="3 7" opacity={lit ? 0.75 : 0.35} />;
                      return (
                        <g key={`r${k}-${e}`} className="tp-slot ga-target" data-animal={a} data-i={k} data-effect={e} onClick={() => !playing && removeAt(a, k)}>
                          <rect x={x} y={y} width={SIGN_SLOT} height={SIGN_SLOT} rx={8} fill="#fdfaf2" stroke="#2b2622" strokeWidth={2.2} />
                          <svg x={x + 2} y={y + 4} width={SIGN_SLOT - 4} height={SIGN_SLOT - 8} viewBox={`0 0 ${EFFECT_W} ${EFFECT_H}`} overflow="visible"><EffectArt effect={e} animal={a} /></svg>
                        </g>
                      );
                    })}
                  </SignBoard>
                  <rect className="tp-sign-hit" data-animal={a} x={-sw / 2} y={-140} width={sw} height={140} fill="transparent" pointerEvents="none" />
                </g>
              );
            })}
          </g>
          {/* the animals */}
          {scene.animals.map((a, i) => {
            const now = acting[a];
            const has = rulesOf(rules, a).length > 0;
            const top = animalTop(a, scene.animals.length);
            return (
              <g key={a} className={`tp-animal${arriving === a ? ' is-arriving' : ''}`} data-animal={a} style={{ transform: `translate(${xs[i]}px, ${GROUND}px)` }}>
                {!playing && selected === a && <ellipse className="tp-pick" cx={0} cy={4} rx={96} ry={18} fill="none" stroke="#3d6ea5" strokeWidth={3.4} strokeDasharray="2 8" strokeLinecap="round" />}
                <ellipse cx={0} cy={4} rx={62} ry={11} fill="rgba(84, 62, 38, 0.22)" />
                <g className={`tp-actor${now ? ` tp-do-${now.effect}` : ''}${shake?.a === a ? ' is-no' : ''}`} key={`${now?.n ?? 0}-${shake?.a === a ? shake.n : 0}`}>
                  <g filter={hueFilter(hue[a] ?? 0)}><SceneCritter a={a} n={scene.animals.length} /></g>
                </g>
                {now?.effect === 'hide' && <g className="tp-bush-pop" key={`b${now.n}`}><Bush w={Math.max(200, Math.min(250, top * 1.6))} seed={i + 3} /></g>}
                {now?.effect === 'confetti' && <g transform={`translate(0 ${-top / 2})`} key={`c${now.n}`}><ConfettiBurst r={150} seed={now.n} /></g>}
                {playing && has && !now && <TapHand className="tp-bob-hand" x={10} y={-top - 8} s={0.9} />}
                {emptyFlash === a && (
                  <g className="tp-empty-sign" transform={`translate(0 ${-top - 12}) scale(0.7)`}>
                    <SignBoard w={signWidth(MAX_RULES)} seed={i + 9}>
                      <TriggerArt animal={a} />
                      <ThenMark x={98} y={44} />
                      {Array.from({ length: MAX_RULES }, (_, k) => <rect key={k} x={132 + k * (SIGN_SLOT + 6)} y={14} width={SIGN_SLOT} height={SIGN_SLOT} rx={8} fill="none" stroke="#2b2622" strokeWidth={2} strokeDasharray="3 7" />)}
                    </SignBoard>
                  </g>
                )}
                <rect
                  className="tp-animal-hit ga-target" data-animal={a} x={-125} y={-Math.max(150, top + 30)} width={250} height={Math.max(150, top + 30) + 26} fill="transparent"
                  {...((playing ? has : true) ? { 'data-guide': 'target' } : {})}
                  onClick={() => tapAnimal(a)}
                />
              </g>
            );
          })}
        </svg>
      </section>
      <div className="tp-panel">
        <svg className="tp-buddy" viewBox="0 0 180 170" aria-hidden="true">
          <Buddy x={90} y={162} w={150} onView={(v) => { buddy.current = v; }} />
          {dizzy && <DizzyStars x={90} y={28} />}
        </svg>
        <ul className={`tp-cards${playing ? ' is-off' : ''}${newCards ? ' is-new' : ''}`} aria-label="Qué hace cuando lo tocás">
          {scene.effects.map((e, i) => (
            <li key={e} style={{ '--tilt': `${[-1.4, 1, -0.6, 1.3, -1][i % 5]}deg`, '--i': i } as CSSProperties}>
              <button
                type="button" className="cut tp-card ga-target" data-effect={e} aria-label={EFFECT_SAY[e]} disabled={playing}
                {...(!playing ? { 'data-guide': 'target' } : {})}
                onPointerDown={cardDown(e)} onPointerMove={cardMove} onPointerUp={cardUp} onPointerCancel={cardCancel}
                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); addEffect(e, 'tap'); } }}
              >
                <EffectPicture effect={e} animal={selected} />
              </button>
            </li>
          ))}
        </ul>
        <div className="tp-modes" role="group" aria-label="Armar o jugar">
          <button type="button" className={`cut tp-mode${!playing ? ' is-on' : ''}`} data-mode="build" aria-pressed={!playing} aria-label="Armar" onClick={() => toMode('build')}>
            <BuildModeArt />
            <span className="tp-mode-word" aria-hidden="true">Armar</span>
          </button>
          <button
            type="button" className={`cut tp-mode${playing ? ' is-on' : ''}${ready ? ' is-ready' : ''}`} data-mode="play" aria-pressed={playing} aria-label="¡A jugar!"
            {...(ready ? { 'data-guide': 'target' } : {})} onClick={() => toMode('play')}
          >
            <PlayModeArt />
            <span className="tp-mode-word" aria-hidden="true">¡A jugar!</span>
          </button>
        </div>
      </div>
      {drag && <div className="tp-drag" style={{ left: drag.x, top: drag.y }} aria-hidden="true"><EffectPicture effect={drag.e} animal={selected} /></div>}
      {confetti > 0 && <ConfettiRain key={confetti} seed={confetti} />}
    </main>
  );
}
