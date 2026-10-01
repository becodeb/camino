// "Teclas del bosque" (round 2: about three minutes, at most five): three
// short rounds, each with its goal drawn in the scene: a garden bed in front
// of the meadow with a hole per thing to catch. Seeds (a letter each) or
// leaves (a syllable, a word or a command each) fall from the trees;
// pressing the right keys catches them: the thing flies into the next hole
// and a sprout pops; the next hole is circled in pen, so the child always
// sees how much is left. A soft xylophone note per catch rises with the
// streak. Catching early pays: something caught while it still shines
// (above the garland across the middle) lights a star lamp; three in a row
// plant a golden seed that fills the next hole too. Every three holes a seed
// flies to the pouch in the bar (the session's garden). A full bed blooms,
// a critter comes to see, the character cheers, the round's medal turns
// gold; then the next round, harder on purpose (typing.ts `roundsFor`), says
// what changes. After the third, the finale: "¡Listo!" on a sign, every
// critter, a dance. A wrong key: the key pressed wobbles on the drawn
// keyboard and the expected key glows; nothing is lost. Something that
// reaches the ground rests a moment and comes back two items later: no
// misses, no lives, no countdown. The pace inside a round follows the child
// only a little. "Listo" shows after round 1; at five minutes the game ends
// after the item on screen. The key to press is circled on a drawn keyboard
// (Latin-American Spanish, with Ñ, numbers when a command needs one,
// printed uppercase); on a touch screen its keys are tapped. A short spoken
// intro with the ghost hand pressing the key of a first item; pressing it
// yourself skips the intro. 🔊 says the intro and the item again; ✋ makes
// the key glow harder (then the ghost hand shows it; a fourth press raises
// the hand; holding ✋ is the adult's question since T14). Then "¿Te gustó
// este juego?" and a cheer. "Quedan 5 minutos" (T14) ends it after the item
// on screen (`typing_end.reason: 'wrap_up'`); "listo" shows from half of
// round 2 on.
//
// Logged: `typing` per key press (with its round), `typing_round` per
// round, `help`, `speak`, `ghost_demo`, the liking answer as
// `survey_answer` {question: 'typing_liked'} and one `typing_end`
// (docs/prueba-piloto-datos.md). While the game is on screen the letters
// (and the space, the backtick) never reach the page: no browser
// find-as-you-type, no dev-mode shortcut, no key of another screen.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { progress, solve } from '../curriculum/progress';
import type { CritterId } from '../curriculum/motivation';
import { Bar } from '../screens/LevelBar';
import { DEBUG } from '../screens/levelKit';
import { PlayerFace, usePlayer, useStage } from '../screens/player';
import { SeedPouch } from '../screens/yearKit';
import { NextPageArt, PenRing, ThenArrow } from '../ui/art';
import { CritterArt } from '../ui/critterArt';
import { playGhost, type GhostRun } from '../ui/ghost';
import { REDUCED } from '../ui/runtime';
import { ringNote } from '../ui/sound';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { SpeakerIcon } from '../ui/icons';
import type { Pitch } from '../game/music';
import { wrapPending } from './flow';
import { provideDemoActions } from './demo';
import { usePlaytest } from './context';
import { Cheer } from './interlude';
import { Face } from './surveyArt';
import {
  DIGIT_ROW, KEY_ROWS, LETTER_NAME, PACE_START, ROUNDS, addCatch, adaptPace, createRoundPicker, demoOf, fallMs, goalOverride, listoShown,
  isEarly, keyFor, landedOn, modeOf, needsDigits, pressOn, roundDone, roundsFor, seedsFor, setOf, startRound, typingCap, wordSetOf,
  type Pace, type RoundDef, type RoundProgress, type TypingSet,
} from './typing';
import {
  BED_Y, BedIcon, ButterflyWings, Canopy, FlyingSeed, FrontBush, GROUND, Garland, GardenBed, Glint, KeyCap, KeyPressIcon, KeyRing,
  LetterSeed, ListoSign, ME_AT, Meadow, Puff, RoundCard, RoundMedals, SCENE, SEED_S, SpaceBar, Sparkle, WordLeaf, holeX, leafLength, type HoleState,
} from './typingArt';

const LEVEL_ID = 'typing';
type Input = 'physical' | 'touch';
/** `wrap_up`: el docente's "quedan 5 minutos" (T14): the item on screen is finished, then the finale. */
type EndReason = 'rounds' | 'time' | 'done' | 'left' | 'wrap_up';

/** Where a thing falls from and to (its centre): a seed with a letter, or a leaf. */
const FALL_Y = { seed: [150, GROUND - 60], leaf: [166, GROUND - 62] } as const;
const fallY = (text: string) => (text.length === 1 ? FALL_Y.seed : FALL_Y.leaf);
const LANES = [520, 635, 750, 865, 975];
/** The character's stage in the scene (the garden's GardenMe, a bit bigger). */
const ME_BOX = { x: -58, y: -118, w: 116, h: 128 };
const ME_W = 168;

const NOTES: Pitch[] = ['do', 're', 'mi', 'fa', 'sol'];
/** The critter that comes to see each full bed (they stay), and where it stands. */
const CRITTERS: { id: CritterId; x: number; s: number }[] = [
  { id: 'coati', x: 975, s: 0.95 },
  { id: 'zorro', x: 375, s: 0.85 },
  { id: 'rana', x: 1110, s: 0.9 },
];

interface Item {
  id: number;
  text: string;
  set: TypingSet;
  x: number;
  born: number;
  dur: number;
  /** The round (1–3) and the pace step it fell at. */
  round: number;
  pace: number;
  pos: number;
  /** When its last key was pressed (the next letters' latency). */
  last: number;
  state: 'fall' | 'caught' | 'landed' | 'gone';
  /** Still above the garland: caught now, it counts for the golden streak. */
  high: boolean;
  butterfly: boolean;
  tone: number;
  demo?: boolean;
}

/** What the bed shows: the goal and the holes filled so far, in order. */
interface BedView { goal: number; fills: ('filled' | 'golden')[] }

function introLine(rounds: RoundDef[], touch: boolean) {
  const seeds = rounds[0].set === 'vowels' || rounds[0].set === 'letters';
  const where = touch ? 'en el teclado del dibujo' : 'en el teclado';
  return seeds
    ? `Atrapá las semillas tocando su letra ${where}. ¡Llená la huerta!`
    : `Atrapá las hojas escribiendo su palabra ${where}. ¡Llená la huerta!`;
}

const sayItem = (text: string) => (text.length === 1 ? LETTER_NAME[text] ?? text : text);

function helpLine(it: Item, touch: boolean) {
  const next = it.text[it.pos];
  const name = LETTER_NAME[next] ?? next;
  const verb = touch ? 'Tocá' : 'Apretá';
  if (next === ' ') return 'Ahora va el espacio: la barra larga. Está brillando.';
  if (it.text.length === 1) return `Buscá la ${name}. Está brillando en el teclado. ${verb} esa tecla.`;
  if (/\d/.test(next)) return `Ahora va el ${name}. Está brillando arriba, en los números.`;
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
  const search = typeof location !== 'undefined' ? location.search : '';
  const rounds = useMemo(() => {
    const goal = goalOverride(search);
    return roundsFor(grade).map((r) => (goal ? { ...r, goal } : r));
  }, [grade, search]);
  const cap = useMemo(() => typingCap(search), [search]);
  const touch = useMemo(touchFirst, []);
  const intro = useMemo(() => introLine(rounds, touch), [rounds, touch]);
  const digits = useMemo(() => needsDigits(rounds), [rounds]);
  const seedBase = useMemo(() => (Date.now() % 9973) + 1, []);
  const player = usePlayer();
  const { ref: meRef, view } = useStage(player, ME_BOX, { shadow: true });

  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<'intro' | 'play' | 'between' | 'stopping' | 'finale'>('intro');
  const [round, setRound] = useState(0);
  const [roundsDone, setRoundsDone] = useState(0);
  const [bed, setBed] = useState<BedView>({ goal: rounds[0].goal, fills: [] });
  const [bloom, setBloom] = useState(false);
  const [lamps, setLamps] = useState(0);
  const [flash, setFlash] = useState(false);
  const [critters, setCritters] = useState<number[]>([]);
  const [banner, setBanner] = useState(false);
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  const [flights, setFlights] = useState<number[]>([]);
  const [wrong, setWrong] = useState<{ key: string; n: number } | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const [helpGlow, setHelpGlow] = useState(0);
  const [nudge, setNudge] = useState(0);

  const g = useRef({
    items: [] as Item[],
    phase: 'intro' as 'intro' | 'play' | 'between' | 'stopping' | 'finale',
    r: 0,
    picker: createRoundPicker(rounds[0], seedBase),
    prog: startRound(rounds[0].goal) as RoundProgress,
    pace: PACE_START as Pace,
    paceMax: 0,
    /** A round is being played (started, not yet logged). */
    roundOpen: false,
    roundAt: 0,
    roundKeys: 0,
    roundCorrect: 0,
    roundLanded: 0,
    spawned: 0,
    butterflyAt: -1,
    keys: 0,
    correct: 0,
    caught: 0,
    landed: 0,
    filled: 0,
    golden: 0,
    seeds: 0,
    roundsDone: 0,
    saidGolden: false,
    helpStep: 0,
    inputs: new Set<Input>(),
    mountAt: Date.now(),
    playAt: 0,
    lastGone: 0,
    nextId: 1,
    tone: 0,
    lane: -1,
    stopReason: 'time' as EndReason,
    ended: false,
    timers: new Set<number>(),
    ghost: null as GhostRun | null,
  });
  const els = useRef(new Map<number, SVGGElement>());
  const anims = useRef(new Map<number, Animation>());
  const started = useRef(new Set<number>());
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
  const roundDef = () => rounds[g.current.r];
  const chime = (notes: Pitch[], gap = 110) => notes.forEach((n, i) => later(() => ringNote(n), i * gap));

  // ---------------------------------------------------------------- items

  function lookAt(id: number) {
    const el = els.current.get(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    view.current?.look(r.left + r.width / 2, r.top + r.height / 2, 1400);
  }

  function spawn(demo?: string) {
    const s = g.current;
    const rd = roundDef();
    const pick = demo ? { text: demo, set: setOf(demo, rd) } : s.picker.next();
    const butterfly = !demo && rd.butterfly && s.spawned === s.butterflyAt;
    if (!demo) s.spawned++;
    const dur = demo ? 16_000 : fallMs(pick.text, rd, s.pace.step, butterfly);
    let x: number;
    if (pick.text.length === 1) {
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
    const it: Item = {
      id: s.nextId++, text: pick.text, set: pick.set, x, born: now, dur, round: rd.n, pace: s.pace.step, pos: 0, last: now,
      state: 'fall', high: !demo, butterfly, tone: s.tone++, demo: !!demo,
    };
    s.items.push(it);
    sync();
    if (!demo) {
      // its name is said, unless something else is being said (the intro, a help, a round's line)
      if (typeof speechSynthesis === 'undefined' || !speechSynthesis.speaking) speak(sayItem(it.text));
      later(() => { if (it.state === 'fall') { it.high = false; sync(); } }, dur / 2);
      later(() => land(it.id), dur);
      requestAnimationFrame(() => lookAt(it.id));
    }
    return it;
  }

  const startFall = (it: Item, el: SVGGElement) => {
    const [y0, y1] = fallY(it.text);
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

  /** How far down an item is (0 at the trees, 1 on the ground), and where it is now. */
  function whereIs(it: Item) {
    const [y0, y1] = fallY(it.text);
    const a = anims.current.get(it.id);
    const p = a && a.currentTime != null ? Math.min(1, Number(a.currentTime) / it.dur) : Math.min(1, (Date.now() - it.born) / it.dur);
    return { p, y: y0 + (y1 - y0) * p };
  }

  /** An item flies along an arc to (bx, by), shrinking into it. */
  function flyTo(it: Item, from: number, bx: number, by: number) {
    const el = els.current.get(it.id);
    anims.current.get(it.id)?.cancel();
    if (!el) return;
    const mx = (it.x + bx) / 2, my = Math.min(from, by) - 110;
    el.animate([
      { transform: `translate(${it.x}px, ${from}px) scale(1)` },
      { transform: `translate(${mx}px, ${my}px) scale(0.62)`, offset: 0.45 },
      { transform: `translate(${bx}px, ${by}px) scale(0.3)`, opacity: 1, offset: 0.9 },
      { transform: `translate(${bx}px, ${by + 8}px) scale(0.2)`, opacity: 0 },
    ], { duration: REDUCED ? 200 : 700, easing: 'cubic-bezier(.35,.1,.45,1)', fill: 'forwards' });
  }

  function burst(x: number, y: number, ms = 1100) {
    const id = g.current.nextId++;
    setBursts((b) => [...b, { id, x, y }]);
    later(() => setBursts((b) => b.filter((q) => q.id !== id)), ms);
  }

  function catchItem(it: Item) {
    const s = g.current;
    it.state = 'caught';
    const { p, y } = whereIs(it);
    if (it.demo) {
      // the demo's seed only shows where things go: into the first hole, without filling it
      flyTo(it, y, holeX(0, s.prog.goal), BED_Y - 6);
      remove(it.id, REDUCED ? 220 : 720);
      later(() => ringNote('do'), 500);
      sync();
      return;
    }
    const early = isEarly(p);
    const before = s.prog;
    const res = addCatch(before, early);
    s.prog = res;
    s.pace = adaptPace(s.pace, { kind: 'caught', early });
    s.paceMax = Math.max(s.paceMax, s.pace.step);
    s.caught++;
    s.lastGone = Date.now();
    const hole = before.filled;
    const goal = before.goal;
    flyTo(it, y, holeX(hole, goal), BED_Y - 8);
    remove(it.id, REDUCED ? 220 : 720);
    // the note rises with the early catches in a row
    const chain = early ? before.streak + 1 : 0;
    if (res.goldenNow) {
      setLamps(3);
      setFlash(true);
      burst(it.x, y);
      chime(['do', 'mi', 'sol'], 90);
    } else {
      setLamps(res.streak);
      later(() => ringNote(NOTES[Math.min(NOTES.length - 1, chain)]), it.text.length === 1 ? 0 : 120);
    }
    const flyMs = REDUCED ? 220 : 660;
    later(() => {
      setBed((b) => ({ goal: b.goal, fills: [...b.fills, 'filled' as const, ...(res.goldenNow ? ['golden' as const] : [])].slice(0, b.goal) }));
      if (res.goldenNow) {
        burst(holeX(hole + 1, goal), BED_Y - 30, 900);
        later(() => { setFlash(false); setLamps(0); }, 700);
        if (!s.saidGolden) { s.saidGolden = true; speak('¡Una semilla de oro! Por atraparlas rápido.'); }
      }
    }, flyMs);
    // a seed to the pouch every few holes
    s.filled += res.goldenNow ? 2 : 1;
    if (res.goldenNow) s.golden++;
    const seeds = seedsFor(s.filled);
    if (seeds > s.seeds) {
      s.seeds = seeds;
      const n = seeds;
      progress.update((q) => solve(q, `typing-${n}`));
      later(() => { setFlights((f) => [...f, n]); }, flyMs + 120);
      later(() => setFlights((f) => f.filter((x) => x !== n)), flyMs + 1900);
    }
    sync();
    if (roundDone(res)) { later(() => endRound(), flyMs + 250); return; }
    later(() => void view.current?.nod(), 480);
    if (s.phase === 'stopping') later(() => toFinale(s.stopReason), 900);
  }

  function land(id: number) {
    const s = g.current;
    const it = s.items.find((x) => x.id === id);
    if (!it || it.state !== 'fall') return;
    it.state = 'landed';
    it.high = false;
    s.landed++;
    s.roundLanded++;
    s.lastGone = Date.now();
    s.prog = landedOn(s.prog);
    s.pace = adaptPace(s.pace, { kind: 'landed' });
    s.picker.again(it.text);
    setLamps(0);
    remove(id, 1600);
    sync();
    lookAt(id);
    if (s.phase === 'stopping') later(() => toFinale(s.stopReason), 900);
  }

  /** Something new falls when there is room (one at a time; a round of two at once starts the second when the first is half-way down). */
  function fill() {
    const s = g.current;
    // the bed is full (its last seed still flying): nothing new until the next round
    if (s.phase !== 'play' || roundDone(s.prog)) return;
    const now = Date.now();
    const f = falling();
    if (f.length >= roundDef().atOnce) return;
    if (!f.length) {
      if (now - s.lastGone >= 650 && !s.items.some((it) => it.demo && it.state === 'fall')) spawn();
      return;
    }
    const lowest = target()!;
    if (now - lowest.born >= lowest.dur * 0.45 && now - Math.max(...f.map((it) => it.born)) > 1500) spawn();
  }

  // ---------------------------------------------------------------- rounds

  function openRound(r: number) {
    const s = g.current;
    const rd = rounds[r];
    s.r = r;
    s.picker = createRoundPicker(rd, seedBase + r * 101);
    s.prog = startRound(rd.goal);
    s.pace = PACE_START;
    s.roundKeys = 0;
    s.roundCorrect = 0;
    s.roundLanded = 0;
    s.spawned = 0;
    // the butterfly carries one of the round's middle items
    s.butterflyAt = rd.butterfly ? 1 + Math.floor(Math.random() * Math.max(1, rd.goal - 2)) : -1;
    setRound(r);
    setBanner(r > 0);
    setBed({ goal: rd.goal, fills: [] });
    setBloom(false);
    setLamps(0);
  }

  function playRound() {
    const s = g.current;
    if (s.phase === 'finale') return;
    s.phase = 'play';
    s.roundOpen = true;
    s.roundAt = Date.now();
    s.lastGone = 0;
    setBanner(false);
    setPhase('play');
  }

  function logRound(reason: 'goal' | EndReason) {
    const s = g.current;
    if (!s.roundOpen) return;
    s.roundOpen = false;
    const rd = roundDef();
    log('typing_round', {
      round: rd.n,
      set: rd.set,
      goal: s.prog.goal,
      filled: s.prog.filled,
      caught: s.prog.caught,
      golden: s.prog.golden,
      completed: roundDone(s.prog),
      reason,
      time_ms: Date.now() - s.roundAt,
      keys: s.roundKeys,
      correct: s.roundCorrect,
      landed: s.roundLanded,
      pace_end: s.pace.step + 1,
    });
  }

  /** The bed is full: it blooms, a critter comes, the medal turns gold; then the next round or the finale. */
  function endRound() {
    const s = g.current;
    if (s.phase !== 'play' && s.phase !== 'stopping') return;
    const wasStopping = s.phase === 'stopping';
    logRound('goal');
    s.roundsDone++;
    setRoundsDone(s.roundsDone);
    // whatever is still falling floats away (not a landing)
    for (const it of falling()) { it.state = 'gone'; remove(it.id, 700); }
    s.phase = 'between';
    setPhase('between');
    sync();
    apiRef.current.lowerHand('moved_on', LEVEL_ID);
    setBloom(true);
    setCritters((c) => (c.includes(s.r) ? c : [...c, s.r]));
    chime(['do', 'mi', 'sol', 'mi', 'sol'], 130);
    later(() => void view.current?.cheer(false), 250);
    const last = s.r >= ROUNDS - 1;
    speak(last ? '¡Llenaste la huerta!' : '¡Llenaste la huerta! ¡Muy bien!');
    if (last || wasStopping) { later(() => toFinale(wasStopping ? s.stopReason : 'rounds'), 2600); return; }
    later(() => {
      if (g.current.phase !== 'between') return;
      openRound(s.r + 1);
      speak(rounds[s.r].say);
    }, 3000);
    later(() => { if (g.current.phase === 'between') playRound(); }, 6200);
  }

  /** The finale: the sign, every critter met, a dance; the game's summary is logged. */
  function toFinale(reason: EndReason) {
    const s = g.current;
    if (s.phase === 'finale' || s.ended) return;
    logRound(reason);
    for (const it of s.items) if (it.state === 'fall') { it.state = 'gone'; remove(it.id, 600); }
    s.phase = 'finale';
    setPhase('finale');
    sync();
    logEnd(reason);
    apiRef.current.lowerHand('moved_on', LEVEL_ID);
    setBloom(true);
    setLamps(0);
    chime(['sol', 'mi', 'do', 'mi', 'sol'], 140);
    later(() => void view.current?.cheer(true), 300);
    later(() => void view.current?.cheer(false), 2100);
    speak(reason === 'rounds' ? '¡Listo! Llenaste las tres huertas.' : '¡Listo! ¡Qué linda quedó la huerta!');
    later(() => end(), 9000);
  }

  function logEnd(reason: EndReason) {
    const s = g.current;
    if (s.ended) return;
    s.ended = true;
    const lv = apiRef.current.level.current;
    const inputs = [...s.inputs];
    log('typing_end', {
      reason,
      mode: modeOf(grade),
      set: wordSetOf(grade),
      rounds_done: s.roundsDone,
      time_ms: Date.now() - s.mountAt,
      play_ms: s.playAt ? Date.now() - s.playAt : 0,
      keys: s.keys,
      correct: s.correct,
      caught: s.caught,
      landed: s.landed,
      filled: s.filled,
      golden: s.golden,
      speed_end: s.pace.step + 1,
      speed_max: s.paceMax + 1,
      input: inputs.length === 2 ? 'mixed' : inputs[0] ?? 'none',
      seeds: s.seeds,
      help_levels: s.helpStep,
      adult_helped: !!lv?.adultHelped,
    });
  }
  const leaveRef = useRef(() => {});
  leaveRef.current = () => { if (!g.current.ended) { logRound('left'); logEnd('left'); } };

  /** The cap or "listo": nothing new falls; a word already begun is finished (or lands) first. */
  function stop(reason: 'time' | 'done' | 'wrap_up') {
    const s = g.current;
    if (s.phase === 'finale' || s.phase === 'stopping') return;
    // "quedan 5 minutos" during the intro: nothing begun, the game ends at once
    if (s.phase === 'intro') { if (reason === 'wrap_up') { s.ghost?.cancel(); toFinale(reason); } return; }
    s.stopReason = reason;
    if (s.phase === 'between') { toFinale(reason); return; }
    // the last hole was just filled (its seed still flying): the round ends as full, then the finale
    if (roundDone(s.prog)) { s.phase = 'stopping'; setPhase('stopping'); return; }
    const begun = falling().filter((it) => it.pos > 0);
    if (!begun.length) { toFinale(reason); return; }
    s.phase = 'stopping';
    setPhase('stopping');
    for (const it of falling()) if (it.pos === 0) { it.state = 'gone'; remove(it.id, 600); }
    sync();
  }

  // ---------------------------------------------------------------- keys

  function press(k: string, input: Input) {
    const s = g.current;
    setPressed(k);
    later(() => setPressed((p) => (p === k ? null : p)), 170);
    if (s.phase === 'intro') { introKey(k); return; }
    if (s.phase !== 'play' && s.phase !== 'stopping') return;
    view.current?.poke();
    let it = target();
    if (!it) return;
    // two seeds at once: the letter pressed may be the other one
    if (it.text.length === 1) it = falling().find((x) => x.text === k && x.text.length === 1) ?? it;
    const r = pressOn(it, k);
    const now = Date.now();
    const first = it.pos === 0;
    const latency = now - (first ? it.born : it.last);
    log('typing', {
      key: k, expected: r.expected, correct: r.correct, latency_ms: latency,
      speed_level: it.pace + 1, input, item: it.text, set: it.set, pos: it.pos, round: it.round,
    });
    it.last = now;
    s.keys++;
    s.roundKeys++;
    s.inputs.add(input);
    if (r.correct) {
      s.correct++;
      s.roundCorrect++;
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

  /** A key during the intro: the demo's own key skips the rest of the intro (not logged); another only nudges. */
  function introKey(k: string) {
    const s = g.current;
    const demo = s.items.find((it) => it.demo && it.state === 'fall');
    if (!demo) return;
    if (k !== demo.text[demo.pos]) { setNudge((n) => n + 1); later(() => setNudge(0), 900); return; }
    s.ghost?.cancel();
    stopSpeaking();
    demo.pos++;
    if (demo.pos >= demo.text.length) { catchItem(demo); later(startPlay, 700); } else sync();
  }

  /** The expected character now (the space included), for the key listener. */
  const expectedNow = () => {
    const s = g.current;
    const t = s.phase === 'intro' ? s.items.find((it) => it.demo && it.state === 'fall') : target();
    return t ? t.text[t.pos] ?? null : null;
  };
  const expectedRef = useRef(expectedNow);
  expectedRef.current = expectedNow;

  // the keys: captured before anything else on the page while the game is on screen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = keyFor(e.key, expectedRef.current());
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

  function startPlay() {
    const s = g.current;
    if (s.phase !== 'intro') return;
    s.ghost?.cancel();
    s.playAt = Date.now();
    apiRef.current.did('typing');
    later(() => stop('time'), cap);
    playRound();
  }
  const startRef = useRef(startPlay);
  startRef.current = startPlay;

  // the intro: said aloud while the ghost hand presses the key(s) of a first item, which flies to the first hole
  useEffect(() => {
    const s = g.current;
    apiRef.current.level.current = { id: LEVEL_ID, helpStep: 0, adultHelped: false };
    openRound(0);
    const off = speakWhenAllowed(intro);
    log('ghost_demo', { level_id: LEVEL_ID, kind: 'intro' });
    const text = demoOf(grade);
    later(() => {
      const demo = spawn(text);
      later(() => {
        const root = rootRef.current;
        if (!root || s.phase !== 'intro' || demo.state !== 'fall') return;
        s.ghost = playGhost(root, [...text].map((ch, i) => ({
          do: 'tap' as const,
          at: `.pp-kb [data-key="${ch}"]`,
          apply: () => {
            if (s.phase !== 'intro' || demo.state !== 'fall') return;
            demo.pos = i + 1;
            setPressed(ch);
            later(() => setPressed(null), 170);
            if (demo.pos >= text.length) catchItem(demo); else sync();
          },
        })), { pace: 0.85 });
        void s.ghost.done.then(() => later(() => startRef.current(), 900));
      }, 1400);
    }, 600);
    // a ghost that cannot play never keeps the child waiting
    later(() => startRef.current(), 14_000);
    const tick = window.setInterval(() => fill(), 250);
    return () => {
      off();
      clearInterval(tick);
      stopSpeaking();
      leaveRef.current();
      g.current.ghost?.cancel();
      g.current.timers.forEach((t) => clearTimeout(t));
      g.current.timers.clear();
      apiRef.current.level.current = null;
    };
    // once, when the game opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- 🔊, ✋

  const onSpeak = () => {
    log('speak', { level_id: LEVEL_ID });
    const t = target();
    const s = g.current;
    const line = s.r > 0 && rounds[s.r].say ? rounds[s.r].say : intro;
    speak(t ? `${line} ${sayItem(t.text)}.` : line);
  };

  const onHelp = () => {
    const s = g.current;
    const a = apiRef.current;
    if (s.phase === 'intro' || s.phase === 'finale') return;
    if (s.helpStep >= 3) { a.raiseHand('help_step_3'); return; }
    const step = s.helpStep + 1;
    s.helpStep = step;
    if (a.level.current) a.level.current.helpStep = step;
    log('help', { level_id: LEVEL_ID, step });
    const t = target();
    if (!t) { speak(intro); return; }
    speak(helpLine(t, touch));
    setHelpGlow((n) => n + 1);
    const key = t.text[t.pos];
    later(() => setHelpGlow(0), 5000);
    if (step >= 2 && rootRef.current) {
      s.ghost?.cancel();
      s.ghost = playGhost(rootRef.current, [{ do: 'point', at: [`.pp-kb [data-key="${key}"]`] }, { do: 'wait', ms: 500 }]);
      log('ghost_demo', { level_id: LEVEL_ID, kind: 'hint' });
    }
  };

  // screenshots and checks (?debug only)
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __typing: unknown }).__typing = {
      state: () => {
        const s = g.current;
        return {
          phase: s.phase, round: s.r + 1, goal: s.prog.goal, filled: s.prog.filled, golden: s.golden, streak: s.prog.streak, pace: s.pace.step,
          caught: s.caught, seeds: s.seeds, keys: s.keys, roundsDone: s.roundsDone,
          items: s.items.map((it) => ({ text: it.text, pos: it.pos, state: it.state, high: it.high, butterfly: it.butterfly })),
        };
      },
      expected: () => { const t = target(); return t ? t.text[t.pos] : null; },
      stop: () => stop('done'),
      pace: (step: number) => { g.current.pace = { ...g.current.pace, step }; },
      /** Fills the bed of the round on screen up to `n` holes (screenshots). */
      fill: (n: number) => {
        const s = g.current;
        const k = Math.max(0, Math.min(s.prog.goal - 1, n)) - s.prog.filled;
        if (k <= 0) return;
        s.prog = { ...s.prog, filled: s.prog.filled + k, caught: s.prog.caught + k };
        s.filled += k;
        setBed((b) => ({ goal: b.goal, fills: [...b.fills, ...Array<'filled'>(k).fill('filled')] }));
      },
      /** The next round at once (screenshots): the one on screen counts as full. */
      skipRound: () => {
        const s = g.current;
        if (s.phase !== 'play') return;
        s.prog = { ...s.prog, filled: s.prog.goal };
        setBed((b) => ({ goal: b.goal, fills: Array<'filled'>(b.goal).fill('filled') }));
        endRound();
      },
    };
    return () => { delete (window as unknown as { __typing?: unknown }).__typing; };
  });

  // the demo bar (demo sessions): "Saltar esta ronda" fills it and moves on, "Resolver" fills the bed but one hole
  const demoRef = useRef({ skip: () => {}, solve: () => {} });
  demoRef.current = {
    skip: () => {
      const s = g.current;
      if (s.phase === 'intro') { startRef.current(); return; }
      if (s.phase !== 'play') return;
      s.prog = { ...s.prog, filled: s.prog.goal };
      setBed((b) => ({ goal: b.goal, fills: Array<'filled'>(b.goal).fill('filled') }));
      endRound();
    },
    solve: () => {
      const s = g.current;
      if (s.phase === 'intro') startRef.current();
      const k = s.prog.goal - 1 - s.prog.filled;
      if (k <= 0) return;
      s.prog = { ...s.prog, filled: s.prog.filled + k, caught: s.prog.caught + k };
      s.filled += k;
      setBed((b) => ({ goal: b.goal, fills: [...b.fills, ...Array<'filled'>(k).fill('filled')] }));
    },
  };
  useEffect(() => provideDemoActions({ rank: 2, noun: 'ronda', skip: () => demoRef.current.skip(), solve: () => demoRef.current.solve() }), []);

  // "quedan 5 minutos" (T14): the item on screen is finished, then the finale and the next step
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const wrap = wrapPending(api.flow);
  useEffect(() => { if (wrap) stopRef.current('wrap_up'); }, [wrap]);

  // ---------------------------------------------------------------- drawing

  const t = phase === 'intro' ? items.find((it) => it.demo && it.state === 'fall') ?? null : target();
  const expected = t ? t.text[t.pos] ?? null : null;
  const rd = rounds[round];
  const holes: HoleState[] = Array.from({ length: bed.goal }, (_, i) => (i < bed.fills.length ? bed.fills[i] : i === bed.fills.length && phase !== 'finale' ? 'next' : 'empty'));
  const filledNow = bed.fills.length;
  const showListo = listoShown({ roundsDone, round, filled: filledNow, goal: bed.goal, phase });

  return (
    <main ref={rootRef} className={`pp-page pp-typing is-${modeOf(grade)}${touch ? ' is-touch' : ''}${digits ? ' has-digits' : ''}`} data-phase={phase} data-round={round + 1}>
      <Bar
        instruction={(
          <span className="drawn-task" aria-hidden="true">
            <PlayerFace className="bar-face" />
            <ThenArrow />
            <KeyPressIcon size={46} />
            <ThenArrow />
            <BedIcon size={48} />
          </span>
        )}
        title={<><b>Teclas del bosque</b>{`ronda ${round + 1} de ${ROUNDS} · ${Math.min(filledNow, bed.goal)} de ${bed.goal}${touch ? ' · teclado táctil' : ''}`}</>}
        pages={<span className="pp-progress tk-rounds" role="img" aria-label={`Ronda ${round + 1} de ${ROUNDS}`}><RoundMedals done={roundsDone} here={phase === 'finale' ? -1 : round} /></span>}
        aside={<SeedPouch className="tk-pouch" />}
        onSpeak={onSpeak}
        onHelp={onHelp}
      />
      <section className="sheet pp-tk-stage" aria-label="El bosque">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <svg className="pp-tk-scene" viewBox={`0 0 ${SCENE.w} ${SCENE.h}`} preserveAspectRatio="xMidYMax meet" role="img"
          aria-label={expected ? `Cae ${t?.text}. ${Math.min(filledNow, bed.goal)} de ${bed.goal}` : 'El bosque'}>
          <Meadow />
          <Canopy />
          <FrontBush />
          {critters.map((r) => {
            const c = CRITTERS[r];
            return <g key={c.id} transform={`translate(${c.x} ${GROUND}) scale(${c.s})`}><g className="tk-critter"><CritterArt id={c.id} bare /></g></g>;
          })}
          <GardenBed holes={holes} bloom={bloom} />
          <Garland n={lamps} flash={flash} />
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
                  el.style.transform = `translate(${it.x}px, ${fallY(it.text)[0]}px)`;
                  startFall(it, el);
                }}
                className={`tk-item is-${it.state}${it === t ? ' is-target' : ''}${it.high && it.state === 'fall' ? ' is-high' : ''}${it.butterfly ? ' is-butterfly' : ''}`}
                data-item={it.text}
                data-pos={it.pos}
              >
                <g className="tk-pop">
                  <g className="tk-flutter">
                    <g className="tk-sway" style={{ animationDelay: `${-(it.id % 5) * 0.4}s` }}>
                      {it.text.length === 1
                        ? <g transform={`scale(${SEED_S})`}><LetterSeed letter={it.text} upper={grade === 1} seed={it.id + 20} /></g>
                        : <WordLeaf text={it.text} pos={it.pos} tone={it.tone} />}
                    </g>
                    {/* the butterfly carries it from above, its legs holding on */}
                    {it.butterfly && <ButterflyWings y={it.text.length === 1 ? -84 : -100} />}
                    {it.high && it.state === 'fall' && <Glint x={it.text.length === 1 ? -64 : -leafLength(it.text) / 2 + 6} y={-6} s={1.25} />}
                  </g>
                  {it.state === 'landed' && <g transform={`translate(0 ${it.text.length === 1 ? 58 : 60})`}><Puff /></g>}
                </g>
              </g>
            ))}
          </g>
          {bursts.map((b) => <g key={b.id} transform={`translate(${b.x} ${b.y})`}><Sparkle /></g>)}
          {flights.map((n) => <g key={n} className="tk-flight"><FlyingSeed /></g>)}
          {banner && phase === 'between' && <g transform="translate(750 200)"><g className="tk-banner"><RoundCard done={roundsDone} here={round} /></g></g>}
          {phase === 'finale' && <g transform={`translate(750 ${GROUND})`}><g className="tk-finale"><ListoSign /></g></g>}
        </svg>
      </section>
      <div className="pp-tk-keys">
        <Keyboard expected={expected} wrong={wrong} pressed={pressed} help={helpGlow > 0} nudge={nudge > 0} touch={touch} digits={digits} press={(k) => press(k, 'touch')} />
        {showListo && (
          <button type="button" className="next-page cut pop-in pp-tk-listo" aria-label="Listo" onClick={() => stop('done')}><NextPageArt /></button>
        )}
        {phase === 'finale' && (
          <button type="button" className="next-page cut pop-in pp-tk-listo pp-tk-next" aria-label="Seguir" onClick={() => { g.current.timers.forEach((x) => clearTimeout(x)); end(); }}><NextPageArt /></button>
        )}
      </div>
      <span hidden data-round-set={rd.set} />
    </main>
  );
}

// ------------------------------------------------------------------ the drawn keyboard

function Keyboard({ expected, wrong, pressed, help, nudge, touch, digits, press }: {
  expected: string | null; wrong: { key: string; n: number } | null; pressed: string | null; help: boolean; nudge: boolean; touch: boolean; digits: boolean; press(k: string): void;
}) {
  const rows = digits ? [DIGIT_ROW, ...KEY_ROWS] : [...KEY_ROWS];
  const keyCls = (ch: string, base: string) => `${base}${ch === expected ? ' is-expected' : ''}${pressed === ch ? ' is-pressed' : ''}`;
  const space = (
    <>
      <SpaceBar />
      {expected === ' ' && <KeyRing seed={32} />}
    </>
  );
  return (
    <div className={`pp-kb cut${help ? ' is-help' : ''}${nudge ? ' is-nudge' : ''}${digits ? ' has-digits' : ''}`} data-expected={expected ?? ''} aria-label={touch ? 'Teclado' : undefined} aria-hidden={touch ? undefined : true}>
      {rows.map((row) => (
        <div key={row} className={`pp-kb-row ${row === DIGIT_ROW ? 'r-digits' : `r${KEY_ROWS.indexOf(row as typeof KEY_ROWS[number])}`}`}>
          {[...row].map((ch) => {
            const cls = keyCls(ch, 'pp-key');
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
      <div className="pp-kb-row pp-kb-space">
        {touch && digits
          ? <button type="button" className={keyCls(' ', 'pp-key pp-space')} data-key=" " aria-label="Espacio" onPointerDown={(e) => { e.preventDefault(); press(' '); }}>{space}</button>
          : <span className={keyCls(' ', 'pp-key pp-space')} data-key=" ">{space}</span>}
      </div>
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
