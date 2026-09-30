// "Teclas del bosque" (3–5 min): seeds (1ro, a letter each) or leaves (2do
// and up, a word each) fall slowly from the trees; pressing the right key
// catches them: the thing flies into the basket by the child's character, a
// soft xylophone note sounds, and every few catches a seed flies off to the
// session's garden. A wrong key: the key pressed wobbles on the drawn
// keyboard and the expected key glows; nothing is lost. Something that
// reaches the ground just rests there a moment and the next one falls: no
// misses counted, no lives, no countdown. The key to press is circled on a
// drawn keyboard (Latin-American Spanish, with Ñ, printed uppercase); on a
// touch screen its keys are tapped. The speed adapts (typing.ts). A spoken
// intro with the ghost hand pressing the keys of a first item; 🔊 says it
// again; ✋ makes the key glow harder (then the ghost hand shows it; a
// fourth press or a held ✋ raises the hand). About four minutes, or "listo"
// after a minute, never in the middle of a word; then "¿Te gustó este
// juego?" with three faces, and a cheer.
//
// Logged: `typing` per key press, `help`, `speak`, `ghost_demo`, the
// liking answer as `survey_answer` {question: 'typing_liked'} and one
// `typing_end` (docs/prueba-piloto-datos.md). While the game is on screen
// the letters (and the space, the backtick) never reach the page: no
// browser find-as-you-type, no dev-mode shortcut, no key of another screen.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { progress, solve } from '../curriculum/progress';
import { Bar } from '../screens/LevelBar';
import { DEBUG } from '../screens/levelKit';
import { PlayerFace, usePlayer, useStage } from '../screens/player';
import { NextPageArt, PenRing, ThenArrow } from '../ui/art';
import { playGhost, type GhostRun } from '../ui/ghost';
import { REDUCED } from '../ui/runtime';
import { ringNote } from '../ui/sound';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { SpeakerIcon } from '../ui/icons';
import type { Pitch } from '../game/music';
import { HAND_HOLD_HELP_MS, useHold } from './AdultControls';
import { usePlaytest } from './context';
import { Cheer } from './interlude';
import { Face } from './surveyArt';
import {
  KEY_ROWS, LETTER_NAME, SPEED_START, adapt, createPicker, fallMs, keyOf, maxItems, modeOf, pressOn, seedsFor, typingTimes, wordSetOf,
  type Speed, type TypingMode, type TypingSet,
} from './typing';
import {
  BASKET_AT, BASKET_S, Basket, BasketIcon, Canopy, FlyingSeed, GROUND, KeyCap, KeyPressIcon, KeyRing, LetterSeed, ME_AT, Meadow, Puff, SCENE,
  SEED_S, SpaceBar, WordLeaf, leafLength,
} from './typingArt';

const LEVEL_ID = 'typing';
type Input = 'physical' | 'touch';

/** Where a thing falls from and to (its centre), by mode. */
const FALL_Y: Record<TypingMode, [number, number]> = { letters: [150, GROUND - 60], words: [166, GROUND - 62] };
const LANES = [520, 635, 750, 865, 975];
/** The character's stage in the scene (the garden's GardenMe, a bit bigger). */
const ME_BOX = { x: -58, y: -118, w: 116, h: 128 };
const ME_W = 168;

const NOTES: Pitch[] = ['do', 're', 'mi', 'fa', 'sol'];

interface Item {
  id: number;
  text: string;
  set: TypingSet;
  x: number;
  born: number;
  dur: number;
  /** The speed level it fell at. */
  level: number;
  pos: number;
  /** When its last key was pressed (the next letters' latency). */
  last: number;
  state: 'fall' | 'caught' | 'landed';
  tone: number;
  demo?: boolean;
}

function lines(mode: TypingMode, set: TypingSet, touch: boolean) {
  const where = touch ? 'Tocala en el teclado del dibujo' : 'Buscala en el teclado y apretala';
  if (mode === 'letters') return { intro: `¡Caen semillas de los árboles! Cada una trae una letra. ${where}: así Brote la atrapa.` };
  const what = set === 'commands' ? 'palabras de programar' : 'palabras';
  return { intro: `¡Caen hojas con ${what}! Escribí cada palabra ${touch ? 'tocando las teclas del dibujo' : 'en el teclado'}, letra por letra. La tecla que sigue brilla.` };
}

const sayItem = (it: Pick<Item, 'text'>, mode: TypingMode) => (mode === 'letters' ? LETTER_NAME[it.text] ?? it.text : it.text);

function helpLine(it: Item, mode: TypingMode, touch: boolean) {
  const next = it.text[it.pos];
  const name = LETTER_NAME[next] ?? next;
  const verb = touch ? 'Tocá' : 'Apretá';
  if (mode === 'letters') return `Buscá la ${name}. Está brillando en el teclado. ${verb} esa tecla.`;
  return it.pos === 0 ? `Escribí ${it.text}. Empieza con la ${name}: está brillando.` : `Ahora va la ${name}. Está brillando en el teclado.`;
}

/** A touch screen (or ?tactil): the drawn keys are tapped. */
function touchFirst(): boolean {
  if (typeof location !== 'undefined' && /[?&]tactil\b/.test(location.search)) return true;
  if (typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0) return true;
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
}

export function TypingStep() {
  const api = usePlaytest();
  const grade = api.session?.grade ?? 1;
  const [phase, setPhase] = useState<'game' | 'liked' | 'cheer'>('game');
  if (phase === 'liked') return <TypingLiked done={() => setPhase('cheer')} />;
  if (phase === 'cheer') {
    const line = modeOf(grade) === 'letters' ? '¡Qué bien atrapaste las letras! Vamos a seguir.' : '¡Qué bien escribiste! Vamos a seguir.';
    return <Cheer line="¡Muy bien!" say={line} done={api.next} />;
  }
  return <TypingGame grade={grade} end={() => setPhase('liked')} />;
}

// ------------------------------------------------------------------ the game

function TypingGame({ grade, end }: { grade: number; end(): void }) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const mode = modeOf(grade);
  const set = wordSetOf(grade);
  const times = useMemo(() => typingTimes(typeof location !== 'undefined' ? location.search : ''), []);
  const touch = useMemo(touchFirst, []);
  const say = useMemo(() => lines(mode, set, touch), [mode, set, touch]);
  const picker = useMemo(() => createPicker(grade, (Date.now() % 9973) + 1), [grade]);
  const player = usePlayer();
  const { ref: meRef, view } = useStage(player, ME_BOX, { shadow: true });

  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<'intro' | 'play' | 'stopping'>('intro');
  const [listo, setListo] = useState(false);
  const [caught, setCaught] = useState(0);
  const [wrong, setWrong] = useState<{ key: string; n: number } | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const [helpGlow, setHelpGlow] = useState(0);
  const [flights, setFlights] = useState<number[]>([]);

  const g = useRef({
    items: [] as Item[],
    phase: 'intro' as 'intro' | 'play' | 'stopping' | 'ended',
    speed: SPEED_START as Speed,
    speedMax: 1,
    keys: 0,
    correct: 0,
    caught: 0,
    landed: 0,
    seeds: 0,
    helpStep: 0,
    inputs: new Set<Input>(),
    mountAt: Date.now(),
    playAt: 0,
    lastGone: 0,
    nextId: 1,
    tone: 0,
    lane: -1,
    stopReason: 'time' as 'time' | 'done',
    timers: new Set<number>(),
    ghost: null as GhostRun | null,
  });
  const els = useRef(new Map<number, SVGGElement>());
  const anims = useRef(new Map<number, Animation>());
  const started = useRef(new Set<number>());
  const [nudge, setNudge] = useState(0);
  const rootRef = useRef<HTMLElement>(null);

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { g.current.timers.delete(id); fn(); }, ms);
    g.current.timers.add(id);
    return id;
  };
  const sync = () => setItems([...g.current.items]);
  const log = (type: string, payload: Record<string, unknown>) => apiRef.current.log(type, payload);
  const falling = () => g.current.items.filter((it) => it.state === 'fall' && !it.demo);
  /** The thing to type now: the lowest of what is falling (the one that lands first). */
  const target = (): Item | null => falling().sort((a, b) => (a.born + a.dur) - (b.born + b.dur))[0] ?? null;

  // ---------------------------------------------------------------- items

  function lookAt(id: number) {
    const el = els.current.get(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    view.current?.look(r.left + r.width / 2, r.top + r.height / 2, 1400);
  }

  function spawn(demo?: string) {
    const s = g.current;
    const pick = demo ? { text: demo, set: (mode === 'letters' ? 'vowels' : set) as TypingSet } : picker(s.speed.level);
    const level = s.speed.level;
    const dur = demo ? 16_000 : fallMs(mode, pick.text, level);
    let x: number;
    if (mode === 'letters') {
      const others = falling().map((it) => it.x);
      const free = LANES.map((_, i) => i).filter((i) => i !== s.lane && others.every((o) => Math.abs(o - LANES[i]) > 150));
      const lane = demo ? 2 : free[Math.floor(Math.random() * free.length)] ?? 2;
      s.lane = lane;
      x = LANES[lane] + (demo ? 0 : Math.round((Math.random() - 0.5) * 30));
    } else {
      const half = leafLength(pick.text) / 2;
      x = Math.max(430 + half, Math.min(1090 - half, 740 + Math.round((Math.random() - 0.5) * 140)));
    }
    const now = Date.now();
    const it: Item = { id: s.nextId++, text: pick.text, set: pick.set, x, born: now, dur, level, pos: 0, last: now, state: 'fall', tone: s.tone++, demo: !!demo };
    s.items.push(it);
    sync();
    if (!demo) {
      // its name is said, unless something else is being said (the intro, a help)
      if (typeof speechSynthesis === 'undefined' || !speechSynthesis.speaking) speak(sayItem(it, mode));
      later(() => land(it.id), dur);
      requestAnimationFrame(() => lookAt(it.id));
    }
    return it;
  }

  const startFall = (it: Item, el: SVGGElement) => {
    const [y0, y1] = FALL_Y[mode];
    const a = el.animate([
      { transform: `translate(${it.x}px, ${y0}px)` },
      { transform: `translate(${it.x}px, ${y1}px)` },
    ], { duration: it.dur, easing: 'linear', fill: 'forwards' });
    anims.current.set(it.id, a);
  };

  function remove(id: number, ms: number) {
    later(() => {
      g.current.items = g.current.items.filter((x) => x.id !== id);
      anims.current.delete(id);
      els.current.delete(id);
      started.current.delete(id);
      sync();
    }, ms);
  }

  function catchItem(it: Item) {
    const s = g.current;
    it.state = 'caught';
    const el = els.current.get(it.id);
    const [y0, y1] = FALL_Y[mode];
    const a = anims.current.get(it.id);
    const p = a && a.currentTime != null ? Math.min(1, Number(a.currentTime) / it.dur) : Math.min(1, (Date.now() - it.born) / it.dur);
    const cy = y0 + (y1 - y0) * p;
    a?.cancel();
    if (el) {
      const bx = BASKET_AT.x, by = BASKET_AT.y - 70 * BASKET_S;
      const mx = (it.x + bx) / 2, my = Math.min(cy, by) - 90;
      el.animate([
        { transform: `translate(${it.x}px, ${cy}px) scale(1)` },
        { transform: `translate(${mx}px, ${my}px) scale(0.62)`, offset: 0.45 },
        { transform: `translate(${bx}px, ${by}px) scale(0.28)`, opacity: 1, offset: 0.9 },
        { transform: `translate(${bx}px, ${by + 10}px) scale(0.2)`, opacity: 0 },
      ], { duration: REDUCED ? 200 : 720, easing: 'cubic-bezier(.35,.1,.45,1)', fill: 'forwards' });
    }
    remove(it.id, REDUCED ? 220 : 740);
    if (it.demo) { sync(); return; }
    s.caught++;
    s.lastGone = Date.now();
    setCaught(s.caught);
    later(() => ringNote(mode === 'letters' ? NOTES[(s.caught - 1) % NOTES.length] : 'sol'), mode === 'letters' ? 0 : 140);
    const seeds = seedsFor(s.caught, mode);
    if (seeds > s.seeds) {
      s.seeds = seeds;
      const n = seeds;
      progress.update((q) => solve(q, `typing-${n}`));
      later(() => { setFlights((f) => [...f, n]); void view.current?.cheer(false); }, 520);
      later(() => setFlights((f) => f.filter((x) => x !== n)), 2200);
    } else {
      later(() => void view.current?.nod(), 480);
    }
    sync();
    if (s.phase === 'stopping') later(() => finish(s.stopReason), 800);
  }

  function land(id: number) {
    const s = g.current;
    const it = s.items.find((x) => x.id === id);
    if (!it || it.state !== 'fall') return;
    it.state = 'landed';
    s.landed++;
    s.lastGone = Date.now();
    s.speed = adapt(s.speed, { kind: 'landed' }, grade);
    remove(id, 1600);
    sync();
    lookAt(id);
    if (s.phase === 'stopping') later(() => finish(s.stopReason), 900);
  }

  /** Something new falls when there is room (one at a time; 1ro two when faster, the second when the first is half-way down). */
  function fill() {
    const s = g.current;
    if (s.phase !== 'play') return;
    const now = Date.now();
    const f = falling();
    if (f.length >= maxItems(mode, s.speed.level)) return;
    if (!f.length) {
      if (now - s.lastGone >= 650 && !s.items.some((it) => it.demo)) spawn();
      return;
    }
    const lowest = target()!;
    if (now - lowest.born >= lowest.dur * 0.45 && now - Math.max(...f.map((it) => it.born)) > 1500) spawn();
  }

  // ---------------------------------------------------------------- keys

  function press(k: string, input: Input) {
    const s = g.current;
    if (s.phase !== 'play' && s.phase !== 'stopping') return;
    setPressed(k);
    later(() => setPressed((p) => (p === k ? null : p)), 170);
    view.current?.poke();
    let it = target();
    if (!it) return;
    // 1ro: the letter pressed may be the other seed falling
    if (mode === 'letters') it = falling().find((x) => x.text === k) ?? it;
    const r = pressOn(it, k);
    const now = Date.now();
    const first = it.pos === 0;
    const latency = now - (first ? it.born : it.last);
    log('typing', {
      key: k, expected: r.expected, correct: r.correct, latency_ms: latency,
      speed_level: it.level, input, item: it.text, set: it.set, pos: it.pos,
    });
    it.last = now;
    s.keys++;
    s.inputs.add(input);
    s.speed = adapt(s.speed, { kind: 'press', correct: r.correct, latency_ms: latency, first }, grade);
    s.speedMax = Math.max(s.speedMax, s.speed.level);
    if (r.correct) {
      s.correct++;
      it.pos = r.pos;
      if (r.done) catchItem(it);
      else { ringNote(NOTES[Math.min(NOTES.length - 1, it.pos - 1)]); sync(); }
    } else {
      setWrong((w) => ({ key: k, n: (w?.n ?? 0) + 1 }));
      setNudge((n) => n + 1);
      later(() => setNudge(0), 1100);
      const kb = document.querySelector('.pp-kb');
      if (kb) { const b = kb.getBoundingClientRect(); view.current?.look(b.left + b.width / 2, b.top + b.height / 2, 1200); }
    }
  }
  const pressRef = useRef(press);
  pressRef.current = press;

  // the keys: captured before anything else on the page while the game is on screen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = keyOf(e.key);
      if (k || e.key === ' ' || e.code === 'Backquote' || e.key === 'Dead') {
        e.preventDefault();
        e.stopPropagation();
      }
      if (!k || e.repeat) return;
      pressRef.current(k, 'physical');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // ---------------------------------------------------------------- the game's life

  function finish(reason: 'time' | 'done' | 'left') {
    const s = g.current;
    if (s.phase === 'ended') return;
    const wasPlaying = s.playAt > 0;
    s.phase = 'ended';
    s.ghost?.cancel();
    s.timers.forEach((t) => clearTimeout(t));
    s.timers.clear();
    const lv = apiRef.current.level.current;
    const inputs = [...s.inputs];
    log('typing_end', {
      reason,
      mode,
      set,
      time_ms: Date.now() - s.mountAt,
      play_ms: wasPlaying ? Date.now() - s.playAt : 0,
      keys: s.keys,
      correct: s.correct,
      caught: s.caught,
      landed: s.landed,
      speed_end: s.speed.level,
      speed_max: s.speedMax,
      input: inputs.length === 2 ? 'mixed' : inputs[0] ?? 'none',
      seeds: s.seeds,
      help_levels: s.helpStep,
      adult_helped: !!lv?.adultHelped,
    });
    if (reason !== 'left') end();
  }
  const finishRef = useRef(finish);
  finishRef.current = finish;

  /** Time is up or "listo": nothing new falls; a word already begun is finished (or lands) first. */
  function stop(reason: 'time' | 'done') {
    const s = g.current;
    if (s.phase !== 'play') return;
    s.stopReason = reason;
    const begun = falling().filter((it) => it.pos > 0);
    if (!begun.length) { finish(reason); return; }
    s.phase = 'stopping';
    setPhase('stopping');
    s.items = s.items.filter((it) => it.state !== 'fall' || it.pos > 0);
    sync();
  }

  function startPlay() {
    const s = g.current;
    if (s.phase !== 'intro') return;
    s.phase = 'play';
    s.playAt = Date.now();
    s.lastGone = 0;
    setPhase('play');
    apiRef.current.did('typing');
    later(() => setListo(true), times.listo);
    later(() => stop('time'), times.total);
  }

  // the intro: said aloud while the ghost hand presses the keys of a first item, which the basket catches
  useEffect(() => {
    const s = g.current;
    apiRef.current.level.current = { id: LEVEL_ID, helpStep: 0, adultHelped: false };
    const off = speakWhenAllowed(say.intro);
    log('ghost_demo', { level_id: LEVEL_ID, kind: 'intro' });
    const text = mode === 'letters' ? 'a' : set === 'commands' ? 'si' : 'sol';
    later(() => {
      const demo = spawn(text);
      later(() => {
        const root = rootRef.current;
        if (!root || s.phase !== 'intro') return;
        s.ghost = playGhost(root, [...text].map((ch, i) => ({
          do: 'tap' as const,
          at: `.pp-kb [data-key="${ch}"]`,
          apply: () => {
            demo.pos = i + 1;
            setPressed(ch);
            later(() => setPressed(null), 170);
            if (demo.pos >= text.length) catchItem(demo); else sync();
          },
        })), { pace: 0.85 });
        void s.ghost.done.then(() => later(startPlay, 900));
      }, 1400);
    }, 600);
    // a ghost that cannot play never keeps the child waiting
    later(startPlay, 14_000);
    const tick = window.setInterval(() => fill(), 250);
    return () => {
      off();
      clearInterval(tick);
      stopSpeaking();
      finishRef.current('left');
      apiRef.current.level.current = null;
    };
    // once, when the game opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- 🔊, ✋

  const onSpeak = () => {
    log('speak', { level_id: LEVEL_ID });
    const t = target();
    speak(t ? `${say.intro} ${sayItem(t, mode)}.` : say.intro);
  };

  const onHelp = () => {
    const s = g.current;
    const a = apiRef.current;
    if (s.phase === 'intro' || s.phase === 'ended') return;
    if (s.helpStep >= 3) { a.raiseHand('help_step_3'); return; }
    const step = s.helpStep + 1;
    s.helpStep = step;
    if (a.level.current) a.level.current.helpStep = step;
    log('help', { level_id: LEVEL_ID, step });
    const t = target();
    if (!t) { speak(say.intro); return; }
    speak(helpLine(t, mode, touch));
    setHelpGlow((n) => n + 1);
    const key = t.text[t.pos];
    later(() => setHelpGlow(0), 5000);
    if (step >= 2 && rootRef.current) {
      s.ghost?.cancel();
      s.ghost = playGhost(rootRef.current, [{ do: 'point', at: [`.pp-kb [data-key="${key}"]`] }, { do: 'wait', ms: 500 }]);
      log('ghost_demo', { level_id: LEVEL_ID, kind: 'hint' });
    }
  };
  useHold(HAND_HOLD_HELP_MS, (e) => !!(e.target as Element | null)?.closest?.('.pp-typing .level-bar .help'), () => apiRef.current.raiseHand('help_held'));

  // screenshots and checks (?debug only)
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __typing: unknown }).__typing = {
      state: () => ({ phase: g.current.phase, speed: g.current.speed, caught: g.current.caught, seeds: g.current.seeds, keys: g.current.keys, items: g.current.items.map((it) => ({ text: it.text, pos: it.pos, state: it.state })) }),
      expected: () => { const t = target(); return t ? t.text[t.pos] : null; },
      listo: () => setListo(true),
      stop: () => stop('done'),
      speed: (level: number) => { g.current.speed = { ...g.current.speed, level }; },
    };
    return () => { delete (window as unknown as { __typing?: unknown }).__typing; };
  });

  // ---------------------------------------------------------------- drawing

  const t = phase === 'intro' ? items.find((it) => it.demo && it.state === 'fall') ?? null : target();
  const expected = t ? t.text[t.pos] ?? null : null;
  const [y0] = FALL_Y[mode];

  return (
    <main ref={rootRef} className={`pp-page pp-typing is-${mode}${touch ? ' is-touch' : ''}`} data-phase={phase} data-mode={mode}>
      <Bar
        instruction={(
          <span className="drawn-task" aria-hidden="true">
            <PlayerFace className="bar-face" />
            <ThenArrow />
            <KeyPressIcon size={46} />
            <ThenArrow />
            <BasketIcon size={48} />
          </span>
        )}
        title={<><b>Teclas del bosque</b>{mode === 'letters' ? 'letras (vocales y comunes)' : set === 'commands' ? 'palabras de programar' : 'palabras cortas'}{touch ? ' · teclado táctil' : ''}</>}
        pages={null}
        onSpeak={onSpeak}
        onHelp={onHelp}
      />
      <section className="sheet pp-tk-stage" aria-label="El bosque">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <svg className="pp-tk-scene" viewBox={`0 0 ${SCENE.w} ${SCENE.h}`} preserveAspectRatio="xMidYMax meet" role="img" aria-label={expected ? `Cae ${t?.text}` : 'El bosque'}>
          <Meadow />
          <Canopy />
          <g transform={`translate(${BASKET_AT.x} ${BASKET_AT.y}) scale(${BASKET_S})`}><Basket n={caught} words={mode === 'words'} /></g>
          <svg ref={meRef} className="tk-me" x={ME_AT.x - ME_W / 2} y={ME_AT.y - ME_W * (128 / 116) * (118 / 128)} width={ME_W} height={ME_W * 128 / 116} overflow="visible" />
          <g className="tk-items">
            {items.map((it) => (
              <g
                key={it.id}
                ref={(el) => {
                  if (!el) return;
                  els.current.set(it.id, el);
                  if (started.current.has(it.id)) return;
                  started.current.add(it.id);
                  el.style.transform = `translate(${it.x}px, ${y0}px)`;
                  startFall(it, el);
                }}
                className={`tk-item is-${it.state}${it === t ? ' is-target' : ''}`}
                data-item={it.text}
                data-pos={it.pos}
              >
                <g className="tk-pop">
                  <g className="tk-sway" style={{ animationDelay: `${-(it.id % 5) * 0.4}s` }}>
                    {mode === 'letters' ? <g transform={`scale(${SEED_S})`}><LetterSeed letter={it.text} upper={grade === 1} seed={it.id + 20} /></g> : <WordLeaf text={it.text} pos={it.pos} tone={it.tone} />}
                  </g>
                  {it.state === 'landed' && <g transform={`translate(0 ${mode === 'letters' ? 58 : 60})`}><Puff /></g>}
                </g>
              </g>
            ))}
          </g>
          {flights.map((n) => <g key={n} className="tk-flight"><FlyingSeed /></g>)}
        </svg>
      </section>
      <div className="pp-tk-keys">
        <Keyboard expected={expected} wrong={wrong} pressed={pressed} help={helpGlow > 0} nudge={nudge > 0} touch={touch} press={(k) => press(k, 'touch')} />
        {listo && phase === 'play' && (
          <button type="button" className="next-page cut pop-in pp-tk-listo" aria-label="Listo" onClick={() => stop('done')}><NextPageArt /></button>
        )}
      </div>
    </main>
  );
}

// ------------------------------------------------------------------ the drawn keyboard

function Keyboard({ expected, wrong, pressed, help, nudge, touch, press }: {
  expected: string | null; wrong: { key: string; n: number } | null; pressed: string | null; help: boolean; nudge: boolean; touch: boolean; press(k: string): void;
}) {
  return (
    <div className={`pp-kb cut${help ? ' is-help' : ''}${nudge ? ' is-nudge' : ''}`} data-expected={expected ?? ''} aria-label={touch ? 'Teclado' : undefined} aria-hidden={touch ? undefined : true}>
      {KEY_ROWS.map((row, r) => (
        <div key={r} className={`pp-kb-row r${r}`}>
          {[...row].map((ch) => {
            const cls = `pp-key${ch === expected ? ' is-expected' : ''}${pressed === ch ? ' is-pressed' : ''}`;
            const inner: ReactNode = (
              <>
                <KeyCap ch={ch} />
                {ch === expected && <KeyRing seed={ch.charCodeAt(0)} />}
                {wrong?.key === ch && <span key={wrong.n} className="pp-key-wrong" aria-hidden="true"><KeyCap ch={ch} /></span>}
              </>
            );
            return touch
              ? <button key={ch} type="button" className={cls} data-key={ch} aria-label={ch.toUpperCase()} onPointerDown={(e) => { e.preventDefault(); press(ch); }}>{inner}</button>
              : <span key={ch} className={cls} data-key={ch}>{inner}</span>;
          })}
        </div>
      ))}
      <div className="pp-kb-row pp-kb-space"><SpaceBar /></div>
    </div>
  );
}

// ------------------------------------------------------------------ did you like it?

const LIKED_SAY = '¿Te gustó este juego de las teclas? Tocá una carita: mucho, más o menos, o no.';
const LIKED: { value: 'yes' | 'mid' | 'no'; word: string; mood: 'happy' | 'mid' | 'sad' }[] = [
  { value: 'yes', word: '¡Mucho!', mood: 'happy' },
  { value: 'mid', word: 'Más o menos.', mood: 'mid' },
  { value: 'no', word: 'No.', mood: 'sad' },
];

function TypingLiked({ done }: { done(): void }) {
  const api = usePlaytest();
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    let off = () => {};
    const t = setTimeout(() => { off = speakWhenAllowed(LIKED_SAY); }, 350);
    return () => { clearTimeout(t); off(); };
  }, []);
  const answer = (o: typeof LIKED[number]) => {
    if (picked) return;
    setPicked(o.value);
    speak(o.word);
    api.log('survey_answer', { question: 'typing_liked', answer: o.value });
    setTimeout(done, 1100);
  };
  return (
    <main className="pp-page pp-survey pp-tk-liked" data-question="typing_liked">
      <header className="pp-survey-bar level-bar cut">
        <button type="button" className="speak cut" aria-label="Escuchar otra vez" onClick={() => { api.log('speak', { level_id: LEVEL_ID }); speak(LIKED_SAY); }}><SpeakerIcon /></button>
        <PlayerFace className="bar-face" />
        <span className="pp-tk-liked-icon" aria-hidden="true"><KeyPressIcon size={44} /></span>
        <p className="pp-survey-adult">¿Te gustó este juego? (Teclas del bosque)</p>
      </header>
      <section className="sheet pp-card pp-options n3" aria-label="¿Te gustó este juego?">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        {LIKED.map((o, i) => (
          <button key={o.value} type="button" className={`pp-option cut${picked === o.value ? ' is-picked' : ''}${picked && picked !== o.value ? ' is-other' : ''}`}
            data-answer={o.value} aria-label={o.word} onClick={() => answer(o)}>
            <Face mood={o.mood} seed={i + 11} />
            {picked === o.value && <PenRing seed={i + 5} />}
          </button>
        ))}
      </section>
    </main>
  );
}
