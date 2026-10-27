// "Carrera de teclas" (T41, the first card of 4to's Arcade): T33's race,
// driven by typing instead of blocks. The same track, karts, critters,
// rubber band, podium, shelf of cups and "¡Otra carrera!" (Race.tsx,
// race.ts, raceArt.tsx); under the track, the word or phrase to type, LARGE
// (Scratch's Spanish: "mover", "por siempre", "cambiar puntos en 1"…,
// typingRace.ts). The physical keyboard drives it (no on-screen keyboard:
// 4to has real keyboards): every right letter turns green and nudges the
// kart (dust, a xylophone tick); a finished word boosts it to the next
// stretch (flames) while the next word appears at once; a wrong letter makes
// the kart wobble and the expected letter shake red — nothing is lost and
// nothing needs erasing, the next right key carries on. Accents are optional
// and case does not matter; the space between words must be typed. The keys
// are read on the window, so a click anywhere (a button that kept the focus,
// the track, the bar) never stops the typing, and space never presses a
// focused button.
//
// The critters are rubber-banded to the child's own pace (race.ts): one may
// lead a while, they ease off in the last word and the child always crosses
// first. Tiers by word length ("¡Otra carrera!" goes one up, endless).
//
// Logged: `typing_race_start`, `typing_race_word` per word, `typing_race_end`
// (with words per minute and accuracy); `help` and `speak` with
// `level_id: 'typing_race'` (docs/prueba-piloto-datos.md). Free play logs the
// pick and the time in it; every race finished counts as a won level for its
// `activity_end`.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { progress, solve } from '../curriculum/progress';
import type { Pitch } from '../game/music';
import { Bar } from '../screens/LevelBar';
import { DEBUG } from '../screens/levelKit';
import { PlayerFace } from '../screens/player';
import { SeedPouch } from '../screens/yearKit';
import { ThenArrow } from '../ui/art';
import { glowTargets, wiggleHelp } from '../ui/ghost';
import { ringNote } from '../ui/sound';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { usePlaytest } from './context';
import { provideDemoActions } from './demo';
import type { LevelEnd } from './PlaytestLevel';
import { rememberPart, resumedPart } from './resume';
import { BAND, PARK, RIVAL_START, START, TURBO_SPEED, courseOf, paceOf, readSaved, slopeAt, stepRival, withCups, type RaceSaved } from './race';
import { CupRow, MARGIN_WAIT_MS, NAME, PAIRS, PODIUM_END_MS, Podium, ProgressStrip } from './Race';
import {
  Backdrop, BumpBush, Clouds, CritterDriver, Dust, Flames, FlagIcon, Kart, LANES, MeDriver, SEG, STEP, TRACK_H, TrackRoad, surfaceY,
} from './raceArt';
import { EndChoices } from './arcade/home';
import { accuracy, harderRest, isFastWord, judgeKey, TYPING_CUP_PREFIX, typedSpot, typingRaceDef, wordsFor, wpm } from './typingRace';
import { honestRanking, honestResult, positionAtChars, totalChars, type HonestResult as HonestResultData } from './honestRace';
import {
  ADAPT_START, EASE_MS, PRIOR_WPM, adaptOf, advanceRival, afterRace, firstRaceTarget, liveWpm, readAdapt, rivalBase, rivalFinish, rivalWpms, startRival,
  type AdaptState, type RivalRun,
} from './typingAdapt';
import { HonestResultScreen } from './HonestResult';
import './race.css';

/**
 * C02/C07 (4to only): honest rivals instead of the band's "the child always wins". C07: they adapt to the child (typingAdapt.ts): in the
 * first race they follow the child's live pace softly; from the second their pace comes from the child's previous race (slower after a
 * loss, faster after a win). Defaults to the band for every other grade.
 */
export type RivalMode = 'band' | 'honest';

const LEVEL_ID = 'typing_race';
const round1 = (v: number) => Math.round(v * 10) / 10;
if (DEBUG && typeof window !== 'undefined') (window as unknown as { __typingWords: typeof wordsFor }).__typingWords = wordsFor;
type Phase = 'input' | 'finish' | 'podium';

const NOTES: Pitch[] = ['do', 're', 'mi', 'fa', 'sol'];
/** Nothing typed for this long: ✋ wiggles and the next letter glows (again every IDLE_REPEAT_MS). */
const IDLE_NUDGE_MS = 10_000;
const IDLE_REPEAT_MS = 6000;
/** A wrong key: the expected letter shakes red this long. */
const BAD_MS = 520;
/** C02: a gap this long between two keys counts towards the honest result's `slow_idle` reason. */
const IDLE_GAP_MS = 1500;
/** 1ro (2026-10-27): the kart moves steadily instead of a turbo jump per word (the user: "más lineal, no tan turbo cada palabra"). */
const STEADY_SPEED = 1.6;
/** 1ro: mashing keys (this many wrong keys within MASH_WINDOW_MS) stalls the kart for STALL_MS; keys are ignored meanwhile. */
const MASH_WRONG = 4;
const MASH_WINDOW_MS = 1200;
const STALL_MS = 1500;

const LINES = {
  first: '¡Carrera de teclas! Escribí las palabras con el teclado. Cada letra justa te hace ir más rápido.',
  go: '¡Arrancamos!',
  task: 'Escribí la palabra que está abajo, letra por letra. Si te equivocás, seguí con la letra que va.',
  won: '¡Ganaste la carrera!',
  cup: '¡Una copa más para tu estante!',
  space: 'Ahora va un espacio: la barra larga del teclado.',
};

/** The cups won in this session's typing races (each a level solved in the progress, like T33's). */
const typingCups = (solved: Readonly<Record<string, boolean>>) => Object.keys(solved).filter((k) => k.startsWith(TYPING_CUP_PREFIX) && solved[k]).length;

/** What carries over between typing races while the page lives (the activity remounts at every visit from the menu). */
let memory: { sid: string; saved: RaceSaved; adapt: AdaptState } | null = null;

/**
 * The typing race activity: the race on screen and what carries over
 * between races (cups, the race count, the next tier), in memory, in the
 * resume state and as cups in the session's progress (TYPING_CUP_PREFIX).
 */
export function TypingRace({ levelEnded, rivals = 'band' }: { levelEnded(end: LevelEnd): void; rivals?: RivalMode }) {
  const sid = usePlaytest().session?.id ?? '';
  const [saved, setSaved] = useState<RaceSaved>(() => withCups(memory?.sid === sid ? memory.saved : readSaved(resumedPart('typing_race')), typingCups(progress.get().solved)));
  const savedRef = useRef(saved);
  /** C07: what the honest rivals adapt to (the child's last race), kept like the cups: in memory and in the resume state. */
  const adaptRef = useRef<AdaptState>(memory?.sid === sid ? memory.adapt : readAdapt(resumedPart('typing_adapt')));
  const keepAdapt = (a: AdaptState) => { adaptRef.current = a; memory = { sid, saved: savedRef.current, adapt: a }; rememberPart('typing_adapt', a); };
  const [cur, setCur] = useState<{ no: number; tier: number; again: boolean; seed?: number; revancha?: boolean }>(() => ({ no: saved.raceNo + 1, tier: saved.tier, again: false }));
  const [run, setRun] = useState(0);
  /** C02: the last race's own seed, for "¡Revancha!" (honest mode only: the band never loses, so it never needs one). */
  const lastSeedRef = useRef<number | undefined>(undefined);
  const keep = (s: RaceSaved) => { savedRef.current = s; memory = { sid, saved: s, adapt: adaptRef.current }; setSaved(s); rememberPart('typing_race', s); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => keep({ ...savedRef.current, raceNo: cur.no }), [cur.no]);
  return (
    <TypingRun
      key={`${cur.no}-${run}`}
      no={cur.no}
      tier={cur.tier}
      again={cur.again}
      revanchaRun={!!cur.revancha}
      cups={saved.cups}
      rivals={rivals}
      adapt={adaptRef.current}
      onAdapt={keepAdapt}
      seedOverride={cur.seed}
      reportSeed={(s) => { lastSeedRef.current = s; }}
      won={() => keep({ ...savedRef.current, raceNo: cur.no, cups: savedRef.current.cups + 1, tier: savedRef.current.tier + 1 })}
      next={() => { setCur({ no: savedRef.current.raceNo + 1, tier: savedRef.current.tier, again: true, seed: undefined, revancha: false }); setRun((r) => r + 1); }}
      revancha={() => { setCur((c) => ({ ...c, again: true, seed: lastSeedRef.current, revancha: true })); setRun((r) => r + 1); }}
      setTier={(tier) => { keep({ ...savedRef.current, tier }); setCur({ no: savedRef.current.raceNo + 1, tier, again: true, seed: undefined, revancha: false }); setRun((r) => r + 1); }}
      levelEnded={levelEnded}
    />
  );
}

interface Fx { id: number; kind: 'dust' | 'bush'; x: number; y: number }

/** Whether a key event belongs to a text field (the adult's corner menu): the race leaves it alone. */
const inTextField = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

function TypingRun({ no, tier, again, revanchaRun, cups, rivals = 'band', adapt = ADAPT_START, onAdapt, seedOverride, reportSeed, won, next, revancha, setTier, levelEnded }: {
  no: number; tier: number; again: boolean; revanchaRun?: boolean; cups: number; rivals?: RivalMode; adapt?: AdaptState; onAdapt?(a: AdaptState): void;
  seedOverride?: number; reportSeed?(seed: number): void;
  won(): void; next(): void; revancha?(): void; setTier(t: number): void; levelEnded(end: LevelEnd): void;
}) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  // `?trseed=N` or `window.__trSeed` (?debug only): the checks pick a seed whose words they know (`window.__typingWords` = wordsFor)
  // C02: `seedOverride` ("¡Revancha!") takes precedence, so the replay is the exact same race, not just the same tier.
  const seed = useMemo(() => {
    if (seedOverride != null) return seedOverride;
    const fixed = DEBUG ? Number((window as unknown as { __trSeed?: number }).__trSeed ?? /[?&]trseed=(\d+)/.exec(location.search)?.[1]) : NaN;
    return Number.isFinite(fixed) ? fixed + (no - 1) * 7919 : ((Date.now() % 99_991) + no * 7919) % 1_000_003 || 1;
  }, [no, seedOverride]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => reportSeed?.(seed), [seed]);
  const grade = api.session?.grade;
  const steady = grade === 1;
  const words = useMemo(() => wordsFor(tier, seed, grade), [tier, seed, grade]);
  const def = useMemo(() => typingRaceDef(words, tier, seed), [words, tier, seed]);
  const course = useMemo(() => courseOf(def), [def]);
  const n = words.length;
  const pair = PAIRS[(no - 1) % PAIRS.length];
  const [firstEver] = useState(() => no === 1);
  const [cups0] = useState(cups);
  /**
   * C07: honest mode's adaptive rivals (null in band mode: `rivals` still steps the rubber band exactly as before). What they adapt to is
   * the state at the race's start: nothing yet (the first race: they follow the child's live pace) or the child's previous race.
   */
  const honest = rivals === 'honest';
  const [adapt0] = useState(adapt);
  const adaptKind = adaptOf(adapt0);
  const baseWpm = honest ? rivalBase(adapt0) : null;
  const fixedWpms = baseWpm != null ? rivalWpms(baseWpm) : null;
  // 1ro: `words` may be redrawn harder mid-race (in place), so its total is read on every render
  const totalLetters = totalChars(words);

  const [phase, setPhase] = useState<Phase>('input');
  const [k, setK] = useState(0);
  const [typed, setTyped] = useState(0);
  /** A wrong key's flash on the expected letter (its id restarts the shake). */
  const [bad, setBad] = useState(0);
  const [call, setCall] = useState(false);
  const [boost, setBoost] = useState(false);
  const [fx, setFx] = useState<Fx[]>([]);
  const [order, setOrder] = useState<[0 | 1, 0 | 1]>([0, 1]);
  const [viewW, setViewW] = useState(1200);
  const viewWRef = useRef(viewW);
  viewWRef.current = viewW;

  const g = useRef({
    phase: 'input' as Phase,
    k: 0,
    typed: 0,
    me: START,
    meTarget: START,
    boostTo: START,
    rivals: [...RIVAL_START] as [number, number],
    started: false,
    firstKeyAt: 0,
    mountAt: Date.now(),
    lastInput: Date.now(),
    samples: [] as { t: number; me: number }[],
    wordAt: 0,
    wordErrors: 0,
    right: 0,
    wrong: 0,
    chars: 0,
    wordsDone: 0,
    crossedAt: 0,
    rivalAt: [0, 0] as [number, number],
    ended: false,
    reported: false,
    helpStep: 0,
    saidLead: false,
    saidSpace: false,
    angle: [0, 0, 0],
    lastFrame: 0,
    cam: 0,
    lastNudge: 0,
    fxId: 1,
    badId: 0,
    timers: new Set<number>(),
    /** C02: a gap of IDLE_GAP_MS or more between two right keys counts as idle time (the honest result's `slow_idle` reason). */
    lastKeyAt: 0,
    idleMsTotal: 0,
    /** 1ro: recent wrong-key times, the stall's end and how many stalls (mashing). */
    wrongAt: [] as number[],
    /** 1ro: the tier the race's words are at now (a fast typist goes up mid-race). */
    liveTier: tier,
    stallUntil: 0,
    stalls: 0,
    /** C02 (honest mode only): the place/margin/reason computed once the child crosses the line. */
    honestResult: null as HonestResultData | null,
    honestRanking: null as Array<'me' | 0 | 1> | null,
    /** C07: the times (Date.now) of the child's right keys, for their live pace in the first race. */
    rightAt: [] as number[],
    /** C07: the two rivals running (ms since the child's first key); the first race also averages the live pace they followed. */
    runs: [startRival(fixedWpms ? fixedWpms[0] : PRIOR_WPM), startRival(fixedWpms ? fixedWpms[1] : PRIOR_WPM)] as [RivalRun, RivalRun],
    liveSum: 0,
    liveMs: 0,
  });

  const rootRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const backRef = useRef<SVGGElement>(null);
  const cloudRef = useRef<SVGGElement>(null);
  const kartRefs = [useRef<SVGGElement>(null), useRef<SVGGElement>(null), useRef<SVGGElement>(null)];
  const markRefs = [useRef<SVGGElement>(null), useRef<SVGGElement>(null), useRef<SVGGElement>(null)];

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { g.current.timers.delete(id); fn(); }, ms);
    g.current.timers.add(id);
    return id;
  };
  const log = (type: string, payload: Record<string, unknown>) => apiRef.current.log(type, payload);
  const chime = (notes: Pitch[], gap = 110) => notes.forEach((p, i) => later(() => ringNote(p), i * gap));

  // ---------------------------------------------------------------- what is logged

  function logEnd(reason: 'finished' | 'left') {
    const s = g.current;
    if (s.ended) return;
    s.ended = true;
    const end = s.crossedAt || Date.now();
    const crossed = s.rivalAt.filter((t) => t > 0);
    const lv = apiRef.current.level.current;
    const playMs = s.firstKeyAt ? end - s.firstKeyAt : 0;
    // C02: honest mode only wins (and so only earns a cup) on 1st place; band mode is unchanged (always a win).
    const isWin = !s.honestResult || s.honestResult.place === 1;
    log('typing_race_end', {
      race_no: no, tier, seed, reason, ms: end - s.mountAt, play_ms: playMs,
      words: n, words_done: s.wordsDone, chars: s.chars, right: s.right, wrong: s.wrong,
      wpm: wpm(s.right, playMs), accuracy: accuracy(s.right, s.wrong), again,
      margin_ms: s.honestResult ? (reason === 'finished' ? s.honestResult.marginMs : null)
        : reason !== 'finished' ? null : crossed.length ? Math.min(...crossed) - s.crossedAt
          : Math.round(Date.now() - s.crossedAt + ((course.finish - Math.max(...s.rivals)) / BAND.afterSpeed) * 1000),
      ...(!s.honestResult && reason === 'finished' && !crossed.length ? { margin_estimated: true } : {}),
      help_levels: s.helpStep, adult_helped: !!lv?.adultHelped, cups: reason === 'finished' && isWin ? cups0 + 1 : cups0,
      rival_mode: rivals,
      ...(steady ? { steady: true, stalls: s.stalls, live_tier: s.liveTier } : {}),
      ...(s.honestResult ? { place: s.honestResult.place, reason: s.honestResult.reason } : {}),
      // C07: how the rivals were paced. `rival_base_wpm`: the base (the child's previous wpm x 0.90 after a loss / x 1.05 after a win); in the first race, the child's average live pace they followed
      ...(honest ? { adapt: adaptKind, rival_base_wpm: baseWpm != null ? round1(baseWpm) : s.liveMs > 0 ? round1(s.liveSum / s.liveMs) : null } : {}),
    });
  }

  // ---------------------------------------------------------------- the keys

  /** One key from the keyboard (or the checks' hook): judged against the next letter. */
  function key(k0: string) {
    const s = g.current;
    if (s.phase !== 'input') return;
    const word = words[s.k];
    // C01/T51: a key after the race's last letter, before the kart crosses the line (a child mashing keys), has no letter
    // to judge: `judgeKey` answers 'ignore' for a missing letter (and `word` itself may already be past the last one)
    const v = judgeKey(word?.[s.typed], k0);
    if (v === 'ignore') return;
    const now = Date.now();
    if (steady && now < s.stallUntil) return;
    // C02: a long gap since the last key counts towards the honest result's `slow_idle` reason (own idea, not race.ts's idle-nudge timing).
    if (s.lastKeyAt) { const gap = now - s.lastKeyAt; if (gap > IDLE_GAP_MS) s.idleMsTotal += gap; }
    s.lastKeyAt = now;
    s.lastInput = now;
    if (call) setCall(false);
    if (!s.started) { s.started = true; s.firstKeyAt = now; s.wordAt = now; }
    if (v === 'wrong') {
      s.wrong++;
      s.wordErrors++;
      if (steady) {
        s.wrongAt = s.wrongAt.filter((t) => now - t < MASH_WINDOW_MS).concat(now);
        if (s.wrongAt.length >= MASH_WRONG) { s.wrongAt = []; s.stallUntil = now + STALL_MS; s.stalls++; log('rapid_taps', { game: LEVEL_ID, wrong: MASH_WRONG, stall_ms: STALL_MS }); }
      }
      s.badId++;
      setBad(s.badId);
      later(() => { if (g.current.badId === s.badId) setBad(0); }, BAD_MS);
      wobble();
      return;
    }
    s.right++;
    s.rightAt.push(now);
    s.typed++;
    setTyped(s.typed);
    if (word[s.typed - 1] !== ' ') ringNote(NOTES[Math.min(NOTES.length - 1, Math.floor((s.typed / word.length) * NOTES.length))]);
    if (s.typed % 2 === 1) puff();
    if (s.typed >= word.length) { completeWord(); return; }
    s.meTarget = Math.max(s.meTarget, typedSpot(course.starts, course.ends, s.k, s.typed, word.length));
    if (word[s.typed] === ' ' && !s.saidSpace) { s.saidSpace = true; speak(LINES.space); }
  }
  const keyRef = useRef(key);
  keyRef.current = key;

  /** The word is done: logged, the kart boosts on, the next word appears at once (or the finish line). */
  function completeWord() {
    const s = g.current;
    const word = words[s.k];
    const now = Date.now();
    log('typing_race_word', { race_no: no, word_no: s.k + 1, word, ms: now - (s.wordAt || now), errors: s.wordErrors });
    s.chars += word.length;
    s.wordsDone++;
    chime(['mi', 'sol'], 100);
    if (!steady) setBoost(true);
    if (s.k === n - 1) {
      s.boostTo = course.finish + PARK;
      s.meTarget = s.boostTo;
      return;
    }
    if (steady && isFastWord(now - (s.wordAt || now), word.length, s.wordErrors)) {
      const up = harderRest(words, s.k + 1, s.liveTier, seed, grade);
      if (up) {
        words.splice(0, words.length, ...up.words);
        log('typing_race_up', { race_no: no, word_no: s.k + 1, from: s.liveTier, to: up.tier });
        s.liveTier = up.tier;
      }
    }
    s.k++;
    s.typed = 0;
    s.wordErrors = 0;
    s.wordAt = now;
    s.boostTo = course.starts[s.k];
    s.meTarget = s.boostTo;
    setK(s.k);
    setTyped(0);
  }

  function crossLine() {
    const s = g.current;
    s.crossedAt = Date.now();
    s.phase = 'finish';
    setPhase('finish');
    // C02: honest mode computes the real place now (the child's own finish time against the two fixed-pace rivals);
    // band mode is unchanged (the child always wins by construction, so there is nothing to compute).
    if (honest) {
      const playMs = s.firstKeyAt ? s.crossedAt - s.firstKeyAt : 0;
      // C07: the rivals that have not finished are projected from here at their current speed (a rival that finished already keeps its time)
      advanceRivals(playMs);
      const rivalsMs: [number, number] = [rivalFinish(s.runs[0], totalLetters), rivalFinish(s.runs[1], totalLetters)];
      s.honestResult = honestResult({ meMs: playMs, rivalsMs, wrongTotal: s.wrong, idleMs: s.idleMsTotal });
      s.honestRanking = honestRanking(playMs, rivalsMs);
      // the next race's rivals adapt to this one: its measured pace and whether it was a win (1st place)
      onAdapt?.(afterRace(adapt0, { wpm: wpm(s.right, playMs), won: s.honestResult.place === 1 }));
    }
    const isWin = !s.honestResult || s.honestResult.place === 1;
    if (isWin) {
      won();
      progress.update((q) => solve(q, `${TYPING_CUP_PREFIX}${cups0 + 1}`));
      speak(LINES.won);
      chime(['do', 'mi', 'sol', 'mi', 'sol', 'sol'], 130);
    } else {
      chime(['sol', 'mi'], 160);
    }
    apiRef.current.lowerHand('moved_on', LEVEL_ID);
  }

  /** C07: the rivals' running to `toMs` (ms since the child's first key): a constant pace from the second race, the soft follow in the first. */
  function advanceRivals(toMs: number) {
    const s = g.current;
    if (!s.firstKeyAt) return; // the clock starts with the first key
    const now = s.firstKeyAt + toMs;
    const live = fixedWpms ? 0 : liveWpm(s.rightAt, s.firstKeyAt, now);
    if (!fixedWpms) { const dt = Math.max(0, toMs - s.runs[0].t); s.liveSum += live * dt; s.liveMs += dt; }
    s.runs = s.runs.map((r, i) => advanceRival(r, toMs, totalLetters, fixedWpms ? fixedWpms[i] : firstRaceTarget(i as 0 | 1, live, s.right, r.chars), fixedWpms ? 0 : EASE_MS)) as [RivalRun, RivalRun];
  }

  function toPodium() {
    const s = g.current;
    if (s.phase === 'podium') return;
    logEnd('finished');
    const first: 0 | 1 = s.rivalAt[0] && (!s.rivalAt[1] || s.rivalAt[0] <= s.rivalAt[1]) ? 0 : s.rivalAt[1] ? 1 : s.rivals[0] >= s.rivals[1] ? 0 : 1;
    setOrder([first, first === 0 ? 1 : 0]);
    s.phase = 'podium';
    setPhase('podium');
    if (!s.honestResult || s.honestResult.place === 1) later(() => speak(LINES.cup), 1900);
    later(reportWin, PODIUM_END_MS);
  }

  /** The finished race, told to free play once (after the podium had its moment, or as the child moves on from it): a win or, in honest mode, a real loss. */
  function reportWin() {
    const s = g.current;
    if (s.reported || !s.crossedAt) return;
    s.reported = true;
    const lv = apiRef.current.level.current;
    const isWin = !s.honestResult || s.honestResult.place === 1;
    levelEnded({
      level_id: LEVEL_ID, activity: 'typing_race', outcome: isWin ? 'win' : 'fail', time_ms: s.crossedAt - s.mountAt, attempts: s.right + s.wrong,
      help_levels: s.helpStep, blocks_optimal: words.join('').length, adult_helped: !!lv?.adultHelped,
      race_no: no, tier,
    });
  }
  const reportRef = useRef(reportWin);
  reportRef.current = reportWin;

  const meAt = (u: number) => ({ x: u * SEG, y: surfaceY(course, u) + LANES.me.dy });

  function puff() {
    const s = g.current;
    const p = meAt(s.me);
    const id = s.fxId++;
    setFx((f) => [...f, { id, kind: 'dust', x: p.x, y: p.y }]);
    later(() => setFx((f) => f.filter((x) => x.id !== id)), 700);
  }

  function wobble() {
    const el = kartRefs[2].current?.querySelector('.rc-kart-in');
    if (el) { el.classList.remove('is-bump'); void el.getBoundingClientRect(); el.classList.add('is-bump'); }
  }

  // ---------------------------------------------------------------- the frame loop: the karts, the camera, the critters

  function frame(t: number) {
    const s = g.current;
    const now = Date.now();
    const dt = s.lastFrame ? Math.min(0.06, (t - s.lastFrame) / 1000) : 0;
    s.lastFrame = t;
    if (s.me < s.boostTo - 0.01) {
      // the boost: a finished word takes the kart to the next stretch at turbo speed (after the line it slows down to park)
      const left = s.boostTo - s.me;
      const top = steady ? STEADY_SPEED : TURBO_SPEED;
      const v = s.crossedAt ? Math.max(0.35, Math.min(top, left * 1.6)) : top;
      s.me = Math.min(s.boostTo, s.me + v * dt);
    } else {
      if (boostRef.current) { boostRef.current = false; setBoost(false); }
      s.me += (s.meTarget - s.me) * Math.min(1, dt * 7);
    }
    if (s.phase === 'input' && !s.crossedAt && s.wordsDone === n && s.me >= course.finish) crossLine();
    if (!s.samples.length || now - s.samples[s.samples.length - 1].t > 200) {
      s.samples.push({ t: now, me: s.me });
      if (s.samples.length > 120) s.samples.shift();
    }
    if (s.started) {
      const inp = {
        me: s.me, finish: course.finish, pace: paceOf(s.samples, now), idleMs: s.phase === 'input' ? now - s.lastInput : 0,
        last: s.k === n - 1, meDone: s.crossedAt > 0,
      };
      ([0, 1] as const).forEach((role) => {
        const pos = s.rivals[role];
        let nx: number;
        if (s.crossedAt) {
          const park = course.finish + PARK - 0.8 - role * 0.9;
          nx = Math.min(park, pos + Math.min(BAND.afterSpeed, Math.max(0.3, (park - pos) * 1.6)) * dt);
        } else if (honest) {
          // C07: from the second race a constant pace set by the child's previous race, in the first a soft follow of their live pace; never `inp`'s band
          if (role === 0) advanceRivals(now - s.firstKeyAt);
          nx = positionAtChars(s.runs[role].chars, words, course);
        } else nx = stepRival(pos, dt, inp, role);
        if (!s.rivalAt[role] && s.crossedAt && nx >= course.finish) s.rivalAt[role] = now;
        s.rivals[role] = nx;
      });
      if (!s.saidLead && s.phase === 'input' && !s.crossedAt) {
        const lead: 0 | 1 | null = s.rivals[0] - s.me > 0.6 ? 0 : s.rivals[1] - s.me > 0.6 ? 1 : null;
        if (lead != null && (typeof speechSynthesis === 'undefined' || !speechSynthesis.speaking)) {
          s.saidLead = true;
          speak(`¡Uy, ${NAME[pair[lead]]} va adelante! ¡Vamos!`);
        }
      }
    }
    if (s.crossedAt && !s.ended && s.phase === 'finish' && ((s.rivalAt[0] && s.rivalAt[1]) || now - s.crossedAt > MARGIN_WAIT_MS)) {
      logEnd('finished');
      later(toPodium, 1300);
    }
    draw(dt);
  }
  const boostRef = useRef(false);
  boostRef.current = boost;
  const frameRef = useRef(frame);
  frameRef.current = frame;

  function draw(dt: number) {
    const s = g.current;
    const W = viewWRef.current;
    const meX = s.me * SEG;
    const want = Math.max(-SEG * 0.6, meX - W * 0.34);
    s.cam = s.cam ? s.cam + (want - s.cam) * Math.min(1, dt * 6) : want;
    worldRef.current?.setAttribute('transform', `translate(${(-s.cam).toFixed(1)} 0)`);
    backRef.current?.setAttribute('transform', `translate(${(-s.cam * 0.45).toFixed(1)} 0)`);
    cloudRef.current?.setAttribute('transform', `translate(${(-s.cam * 0.15).toFixed(1)} 0)`);
    const racers: [number, keyof typeof LANES][] = [[s.rivals[1], 'r1'], [s.rivals[0], 'r0'], [s.me, 'me']];
    racers.forEach(([u, lane], i) => {
      const el = kartRefs[i].current;
      if (!el) return;
      const L = LANES[lane];
      const x = u * SEG;
      const y = surfaceY(course, u) + L.dy;
      const target = (-Math.atan2(slopeAt(course, u) * STEP, SEG) * 180) / Math.PI;
      const near = Math.min(u - Math.floor(u), Math.ceil(u) - u);
      const tgt = near < 0.12 && slopeAt(course, u - 0.2) !== slopeAt(course, u + 0.2) ? target * (near / 0.12) : target;
      s.angle[i] += (tgt - s.angle[i]) * Math.min(1, dt * 12);
      el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${s.angle[i].toFixed(2)}) scale(${L.s})`);
      const spin = ((u * SEG) / 13) * (180 / Math.PI);
      el.querySelectorAll('[data-wheel]').forEach((w) => w.setAttribute('transform', `rotate(${(spin % 360).toFixed(1)})`));
      const m = markRefs[i].current;
      if (m) {
        const f = Math.max(0, Math.min(1, (u - START) / (course.finish - START)));
        m.setAttribute('transform', `translate(${(40 + f * (W - 120)).toFixed(1)} 30)`);
      }
    });
  }

  // ---------------------------------------------------------------- mount: the start, the loop, the keys, the idle nudge

  useEffect(() => {
    const s = g.current;
    apiRef.current.level.current = { id: LEVEL_ID, helpStep: 0, adultHelped: false };
    log('typing_race_start', {
      race_no: no, tier, seed, words: [...words], chars: words.join('').length, rivals: [...pair], rival_mode: rivals,
      ...(again ? { again: true } : {}), ...(revanchaRun ? { revancha: true } : {}),
    });
    const off = speakWhenAllowed(firstEver ? LINES.first : LINES.go);
    let raf = requestAnimationFrame(function loop(t) { raf = requestAnimationFrame(loop); frameRef.current(t); });
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || inTextField(e.target)) return;
      if ([...e.key].length !== 1) return;
      // the race owns letters and space: no page scroll, and a button that kept the focus is never pressed by them
      e.preventDefault();
      e.stopPropagation();
      const a = document.activeElement as HTMLElement | null;
      if (a && a !== document.body && a.tagName === 'BUTTON') a.blur();
      if (e.repeat) return;
      keyRef.current(e.key);
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === ' ' && !inTextField(e.target)) e.preventDefault(); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKeyUp, true);
    const nudge = window.setInterval(() => {
      const root = rootRef.current;
      const now = Date.now();
      if (!root || s.phase !== 'input' || document.hidden) return;
      if (now - s.lastInput < IDLE_NUDGE_MS || now - s.lastNudge < IDLE_REPEAT_MS) return;
      s.lastNudge = now;
      wiggleHelp(root);
      setCall(true);
    }, 1000);
    return () => {
      off();
      cancelAnimationFrame(raf);
      clearInterval(nudge);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKeyUp, true);
      stopSpeaking();
      s.timers.forEach((x) => clearTimeout(x));
      s.timers.clear();
      reportRef.current();
      if (!s.ended) logEnd(s.crossedAt ? 'finished' : 'left');
      apiRef.current.level.current = null;
    };
    // once per race
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the track's drawing width follows the screen (its height is fixed)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setViewW(Math.round((TRACK_H * r.width) / r.height));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase === 'podium']);

  // ---------------------------------------------------------------- 🔊, ✋

  const onSpeak = () => {
    log('speak', { level_id: LEVEL_ID });
    speak(`${LINES.task} ${words[g.current.k]}.`);
  };

  const onHelp = () => {
    const s = g.current;
    const a = apiRef.current;
    if (s.phase !== 'input') return;
    if (s.helpStep >= 3) { a.raiseHand('help_step_3'); return; }
    const step = s.helpStep + 1;
    s.helpStep = step;
    if (a.level.current) a.level.current.helpStep = step;
    log('help', { level_id: LEVEL_ID, step });
    const word = words[s.k];
    const nextCh = word[s.typed];
    speak(nextCh === ' ' ? LINES.space : step === 1 ? LINES.task : `La letra que va ahora es la ${nextCh.toUpperCase()}.`);
    setCall(true);
    const root = rootRef.current;
    if (root) glowTargets(root, 3000);
  };

  // ---------------------------------------------------------------- screenshots and checks (?debug only), the demo bar

  /** Types the rest of the word on screen but `leave` letters. */
  const typeWord = (leave = 0) => {
    const s = g.current;
    const word = words[s.k];
    for (let i = s.typed; i < word.length - leave; i++) keyRef.current(word[i]);
  };
  /** Jumps to the last word and types it (the finish at once). */
  const finishNow = () => {
    const s = g.current;
    if (s.phase !== 'input') return;
    s.started = true;
    s.firstKeyAt ||= Date.now();
    s.k = n - 1;
    s.typed = 0;
    s.me = course.starts[n - 1];
    s.meTarget = s.me;
    s.boostTo = s.me;
    s.rivals = [s.me - 0.6, s.me - 1.2];
    setK(n - 1);
    setTyped(0);
    typeWord();
  };
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __typingRace: unknown }).__typingRace = {
      state: () => {
        const s = g.current;
        return {
          phase: s.phase, raceNo: no, tier, seed, words: [...words], k: s.k + 1, word: words[s.k], typed: s.typed, right: s.right, wrong: s.wrong,
          me: s.me, rivals: [...s.rivals], finish: course.finish, crossed: s.crossedAt > 0, cups: cups0, ended: s.ended, rivalsNames: [...pair],
          wordsDone: s.wordsDone, words_n: n, boostTo: s.boostTo, started: s.started, honestResult: s.honestResult, rivalMode: rivals,
          adapt: adaptKind, rivalBaseWpm: baseWpm, rivalRuns: s.runs.map((r) => ({ wpm: r.wpm, chars: r.chars, finishMs: r.finishMs })), totalLetters,
        };
      },
      key: (ch: string) => keyRef.current(ch),
      typeWord: (leave = 0) => typeWord(leave),
      finish: () => finishNow(),
      pose: (me: number, r0: number, r1: number) => { const s = g.current; s.me = me; s.meTarget = me; s.boostTo = me; s.rivals = [r0, r1]; s.started = true; },
      tier: (t: number) => setTier(t),
      idle: (ms: number) => { g.current.lastInput = Date.now() - ms; },
      /** Checks/screenshots only (honest mode): backdates the race's own start, so a fast scripted typist can still be judged a real loss. */
      backdate: (ms: number) => { const s = g.current; s.started = true; s.firstKeyAt = Date.now() - ms; s.wordAt ||= Date.now(); },
    };
    return () => { delete (window as unknown as { __typingRace?: unknown }).__typingRace; };
  });
  const demoRef = useRef({ skip: () => {}, solve: () => {} });
  demoRef.current = { skip: finishNow, solve: () => typeWord(1) };
  useEffect(() => provideDemoActions({ rank: 2, noun: 'carrera', skip: () => demoRef.current.skip(), solve: () => demoRef.current.solve() }), []);

  // ---------------------------------------------------------------- drawing

  const word = words[k];
  const nextWord = words[k + 1];
  const bar = (
    <Bar
      instruction={(
        <span className="drawn-task" aria-hidden="true">
          <PlayerFace className="bar-face" />
          <ThenArrow />
          <KeyIcon />
          <ThenArrow />
          <FlagIcon size={42} />
        </span>
      )}
      title={<><b>Carrera de teclas</b>{`carrera ${no} · nivel ${tier} · ${phase === 'podium' ? 'llegada' : `palabra ${k + 1} de ${n}`}`}</>}
      pages={<CupRow n={cups0 + ((phase === 'finish' || phase === 'podium') && (!g.current.honestResult || g.current.honestResult.place === 1) ? 1 : 0)} />}
      aside={<SeedPouch />}
      onSpeak={onSpeak}
      onHelp={onHelp}
    />
  );

  if (phase === 'podium') {
    const hr = g.current.honestResult;
    const ranking = g.current.honestRanking;
    return (
      <main ref={rootRef} className="pp-page pp-race pp-trace is-podium" data-phase={phase} data-race={no} data-tier={tier}>
        {bar}
        {hr && ranking ? (
          <HonestResultScreen
            pair={pair} ranking={ranking} result={hr} cups={cups0 + (hr.place === 1 ? 1 : 0)} won={hr.place === 1}
            onAgain={next} onRevancha={() => revancha?.()}
            extra={<RaceNumbers s={g.current} />}
          />
        ) : null}
        {/* 1ro (2026-10-27): the honest result has no "Otro juego"; on 1ro's arcade it gets the big one under its buttons */}
        {hr && ranking && steady ? <EndChoices className="rc-end tr-honest-end" again={null} /> : null}
        {hr && ranking ? null : (
          <Podium pair={pair} order={order} cups={cups0 + 1} again={next} extra={<RaceNumbers s={g.current} />} />
        )}
      </main>
    );
  }

  const done = phase !== 'input' || g.current.wordsDone === n;
  return (
    <main ref={rootRef} className="pp-page pp-race pp-trace" data-phase={phase} data-race={no} data-tier={tier} data-word-no={k + 1}>
      {bar}
      <section className="sheet rc-track" aria-label="La pista">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <svg ref={svgRef} className="rc-scene" viewBox={`0 0 ${viewW} ${TRACK_H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Palabra ${k + 1} de ${n}`}>
          <g ref={cloudRef}><Clouds width={course.length * SEG + 2000} /></g>
          <g ref={backRef}><Backdrop width={course.length * SEG * 0.6 + 2000} /></g>
          <g ref={worldRef}>
            <TrackRoad c={course} stretches={def.stretches} />
            <g ref={kartRefs[0]} className="rc-kart rc-r1" data-racer={pair[1]}><g className="rc-kart-in"><Kart tone="r1" seed={3} driver={<CritterDriver id={pair[1]} />} /></g></g>
            <g ref={kartRefs[1]} className="rc-kart rc-r0" data-racer={pair[0]}><g className="rc-kart-in"><Kart tone="r0" seed={2} driver={<CritterDriver id={pair[0]} />} /></g></g>
            {fx.filter((f) => f.kind === 'dust').map((f) => <g key={f.id} transform={`translate(${f.x} ${f.y})`}><Dust /></g>)}
            <g ref={kartRefs[2]} className={`rc-kart rc-me${boost ? ' is-turbo' : ''}`} data-racer="me">
              <g className="rc-kart-in">
                {boost && <Flames />}
                <Kart tone="me" seed={1} driver={<MeDriver />} />
              </g>
            </g>
            {fx.filter((f) => f.kind === 'bush').map((f) => <g key={f.id} transform={`translate(${f.x} ${f.y})`}><BumpBush /></g>)}
          </g>
          <ProgressStrip w={viewW} course={course} pair={pair} refs={markRefs} />
        </svg>
      </section>
      <section className={`sheet tr-word${done ? ' is-done' : ''}`} aria-label="Escribí" data-word={word} data-typed={typed}>
        <span className="tape tape-l" aria-hidden="true" />
        <p className="tr-hint">{word[typed] === ' ' && !done ? '¡Ahora un espacio!' : 'Escribí con el teclado:'}</p>
        <p className="tr-text" key={k} aria-label={word}>
          {[...word].map((ch, i) => {
            const state = i < typed ? 'is-ok' : i === typed && !done ? `is-next${bad ? ' is-bad' : ''}${call ? ' is-call' : ''}` : '';
            return (
              <span key={i === typed && bad ? `b${bad}` : i} className={`tr-ch ${ch === ' ' ? 'is-space ' : ''}${state}`} data-i={i} data-guide={i === typed && !done ? 'target' : undefined}>
                {ch === ' ' ? ' ' : ch}
              </span>
            );
          })}
        </p>
        <p className="tr-after" aria-hidden={!nextWord}>{nextWord ? <>Después: <b>{nextWord}</b></> : <>¡Última palabra!</>}</p>
      </section>
    </main>
  );
}

/** The race's own numbers on the podium: informational, the child's alone (never compared with anyone). */
function RaceNumbers({ s }: { s: { right: number; wrong: number; firstKeyAt: number; crossedAt: number } }) {
  const w = wpm(s.right, s.crossedAt && s.firstKeyAt ? s.crossedAt - s.firstKeyAt : 0);
  const acc = accuracy(s.right, s.wrong);
  return (
    <dl className="tr-numbers sheet" data-wpm={w ?? undefined} data-accuracy={acc ?? undefined}>
      <div><dt>Palabras por minuto</dt><dd>{w == null ? '—' : Math.round(w)}</dd></div>
      <div><dt>Teclas justas</dt><dd>{acc == null ? '—' : `${s.right} de ${s.right + s.wrong}`}</dd></div>
    </dl>
  );
}

/** A keyboard key with a letter: the bar's "what to do" (type). */
function KeyIcon() {
  return (
    <svg viewBox="0 0 48 48" width={42} height={42} aria-hidden="true" style={{ overflow: 'visible' } as CSSProperties}>
      <path d="M8,7 Q8,4 11,4 L37,4 Q40,4 40,7 L41,39 Q41,43 37,43 L11,43 Q7,43 7,39 Z" fill="#9f937f" stroke="#2b2622" strokeWidth={2.4} strokeLinejoin="round" />
      <path d="M9,6 Q9,4 12,4 L36,4 Q39,4 39,6 L39,33 Q39,36 36,36 L12,36 Q9,36 9,33 Z" fill="#fbf7ee" stroke="#2b2622" strokeWidth={2.4} strokeLinejoin="round" />
      <text x={24} y={28} textAnchor="middle" style={{ font: '700 20px var(--body)' }} fill="#2b2622">A</text>
    </svg>
  );
}
