// "La carrera" (T33): a free-play activity for 1ro and 2do. The child's
// character drives a soap-box kart against two forest critters on a
// side-scrolling road (three lanes, the child's the nearest). Below, the
// stretch ahead: its road drawn as pieces (flat →, ramp up ↑, ramp down ↓)
// with an empty slot under each, and the arrow blocks of the levels (big,
// the same colours). A tap on a block, a drag onto the stretch, or the
// keyboard's arrow key puts it in the next slot: a right one nudges the kart
// at once (dust, a xylophone tick) and colours its piece; a wrong one makes
// the kart bump a bush (it shakes, leaves fly) and the block pops out after
// a beat, nothing lost. A full, right tape makes the kart zoom through the
// stretch by itself (no ▶), and the next stretch appears. On long straights
// (tier 3 on) the palette also offers the real `repetir` block holding one
// →, its count the pieces left: the turbo (flames, twice the speed,
// "¡Turbo!"); single arrows still work, slower. The critters are
// rubber-banded to the child's pace (race.ts): one may lead a while mid-race,
// they ease off in the last stretch and almost stop when the child is idle;
// the child always crosses first. No countdown, no losing.
//
// The finish: the karts cross, the podium with the child on the top step
// (tap it: confetti), a cup, the shelf of cups won this session (kept in
// the resume state), a seed for the garden, and "¡Otra carrera!" (a new
// race, one tier harder, endless). Free play's "volver al menú" sits in the
// bar. The first race of a session opens with a wordless ghost demo (a
// block carried into the first slot); later ones with "¡Arrancamos!".
//
// Logged: `race_start`, `race_stretch` per stretch, `race_end`; `help`,
// `speak` and `ghost_demo` with `level_id: 'race'`
// (docs/prueba-piloto-datos.md). Free play logs the pick and the time in
// it; every race finished counts as a won level for its `activity_end` and
// is where free play's time may end (never mid-race).

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { progress, solve } from '../curriculum/progress';
import type { CritterId } from '../curriculum/motivation';
import { ArrowWordsContext, BlockArt, DIR_FILL, type BlockLook } from '../blocks/blocks';
import { DIMS_KIDS } from '../blocks/BlockEditor';
import { DIMS, type Dims } from '../game/editor';
import type { BlockLabel } from '../game/levels';
import type { Pitch } from '../game/music';
import type { Program } from '../game/model';
import { Bar } from '../screens/LevelBar';
import { DEBUG } from '../screens/levelKit';
import { PlayerFace, usePlayer, useStage } from '../screens/player';
import { SeedPouch } from '../screens/yearKit';
import { ThenArrow } from '../ui/art';
import { CritterArt } from '../ui/critterArt';
import { wobblyLine } from '../ink/ink.js';
import { glowTargets, playGhost, wiggleHelp, type GhostRun } from '../ui/ghost';
import { REDUCED } from '../ui/runtime';
import { markSilentDemoShown, silentDemoShown } from '../ui/silentDemo';
import { ringNote } from '../ui/sound';
import { speak, speakWhenAllowed, stopSpeaking } from '../ui/speech';
import { usePlaytest } from './context';
import { provideDemoActions } from './demo';
import type { LevelEnd } from './PlaytestLevel';
import { rememberPart, resumedPart } from './resume';
import {
  BAND, PARK, RIVAL_START, START, TURBO_SPEED, ZOOM_SPEED, afterWin, arrowBlock, courseOf, cutAt, filledOf, generateRace, heightAt, judge, paceOf,
  CUP_PREFIX, cupsIn, readSaved, repeatFor, withCups, restingSpot, roadCode, slopeAt, stepRival, type Block, type RaceSaved, type RoadDir,
} from './race';
import {
  AgainArt, Backdrop, BumpBush, CELL, Clouds, CritterDriver, Cup, CupIcon, Dust, Flames, FlagIcon, KART, Kart, LANES, MeDriver, MiniRoad,
  PodiumSteps, RepeatBracket, SEG, STEP, SeedMark, Shelf, TRACK_H, TrackRoad, surfaceY,
} from './raceArt';
import '../blocks/blocks.css';
import './race.css';
import { EndChoices } from './arcade/home';

const LEVEL_ID = 'race';
type Phase = 'intro' | 'input' | 'zoom' | 'finish' | 'podium';
type Source = 'tap' | 'drag' | 'key';

/** The critter pairs, one per race in turn (novelty for "¡Otra carrera!"): the bold one (middle lane) first. */
export const PAIRS: readonly [CritterId, CritterId][] = [['zorro', 'coati'], ['carpincho', 'rana'], ['lechuza', 'carpintero']];
export const NAME: Record<CritterId, string> = {
  zorro: 'el zorro', coati: 'el coatí', rana: 'la rana', carpincho: 'el carpincho', lechuza: 'la lechuza', carpintero: 'el carpintero',
};
const NOTES: Pitch[] = ['do', 're', 'mi', 'fa', 'sol'];
/** A wrong block stays in its slot this long (the kart bumps the bush), then pops out. */
const BUMP_MS = 750;
/** Nothing placed for this long: ✋ wiggles and the next piece and slot glow (again every IDLE_REPEAT_MS). */
const IDLE_NUDGE_MS = 10_000;
const IDLE_REPEAT_MS = 6000;
/** The child crossed: the critters get this long to cross too (the margin), then the podium. */
export const MARGIN_WAIT_MS = 3500;
/** The podium has been on screen this long: the race counts as ended for free play's time. */
export const PODIUM_END_MS = 4500;

const LINES = {
  first: '¡Una carrera! Armá el camino con flechas.',
  go: '¡Arrancamos!',
  task: 'Poné las flechas del camino: cada flecha justa te hace ir más rápido.',
  turbo: '¡Un camino largo y derecho! Con repetir vas en turbo.',
  turboUsed: '¡Turbo!',
  bush: '¡Uy, un arbusto!',
  won: '¡Ganaste la carrera!',
  cup: '¡Una copa más para tu estante!',
  again: '¡Otra carrera!',
};
const DIR_WORD: Record<RoadDir, string> = { right: 'va derecho', up: 'sube', down: 'baja' };
const helpLine = (d: RoadDir, turbo: boolean) => (turbo
  ? 'Es un camino largo y derecho. Poné la flecha que va derecho, o probá el repetir: ¡es turbo!'
  : `Mirá el camino: ${DIR_WORD[d]}. Poné la flecha que ${DIR_WORD[d]}.`);

const PALETTE: readonly RoadDir[] = ['right', 'up', 'down'];

// ------------------------------------------------------------------ the session's races

/** What carries over between races while the page lives (the activity remounts at every visit from the menu). */
let memory: { sid: string; saved: RaceSaved } | null = null;

/**
 * The race activity: the race on screen and, between races, what carries
 * over (cups, the race count, the next tier): in memory for the page's
 * life, in the resume state for a reload, and each cup also as a level
 * solved in the session's progress (race.ts CUP_PREFIX), so the shelf
 * survives both. A race counts as begun when it mounts (a reload mid-race
 * starts the next number at the same tier); a win adds a cup and a tier.
 */
export function Race({ levelEnded, startTier = 1 }: { levelEnded(end: LevelEnd): void; startTier?: number }) {
  const session = usePlaytest().session;
  const sid = session?.id ?? '';
  const [saved, setSaved] = useState<RaceSaved>(() => {
    const s = withCups(memory?.sid === sid ? memory.saved : readSaved(resumedPart('race')), cupsIn(progress.get().solved));
    // T39: 4to's Arcade starts at the turbo straights
    return s.tier < startTier ? { ...s, tier: startTier } : s;
  });
  const savedRef = useRef(saved);
  const [cur, setCur] = useState(() => ({ no: saved.raceNo + 1, tier: saved.tier, again: false }));
  const keep = (s: RaceSaved) => { savedRef.current = s; memory = { sid, saved: s }; setSaved(s); rememberPart('race', s); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => keep({ ...savedRef.current, raceNo: cur.no }), [cur.no]);
  return (
    // T39 fix: 4to's arrow blocks carry their word ("derecha", "arriba", "abajo")
    <ArrowWordsContext.Provider value={session?.grade === 4}>
    <RaceRun
      key={cur.no}
      no={cur.no}
      tier={cur.tier}
      again={cur.again}
      cups={saved.cups}
      won={() => keep(afterWin({ ...savedRef.current, raceNo: cur.no }))}
      next={() => setCur({ no: savedRef.current.raceNo + 1, tier: savedRef.current.tier, again: true })}
      setTier={(tier) => { keep({ ...savedRef.current, tier }); setCur({ no: savedRef.current.raceNo + 1, tier, again: true }); }}
      levelEnded={levelEnded}
    />
    </ArrowWordsContext.Provider>
  );
}

interface Stats { placed: number; wrong: number; removed: number; usedRepeat: boolean; sources: Record<Source, number> }
const newStats = (): Stats => ({ placed: 0, wrong: 0, removed: 0, usedRepeat: false, sources: { tap: 0, drag: 0, key: 0 } });

interface Fx { id: number; kind: 'dust' | 'bush'; x: number; y: number }

function RaceRun({ no, tier, again, cups, won, next, setTier, levelEnded }: {
  no: number; tier: number; again: boolean; cups: number; won(): void; next(): void; setTier(t: number): void; levelEnded(end: LevelEnd): void;
}) {
  const api = usePlaytest();
  const apiRef = useRef(api);
  apiRef.current = api;
  const grade = api.session?.grade ?? 1;
  const label: BlockLabel = grade <= 1 ? 'picture-word' : 'word-picture';
  const seed = useMemo(() => ((Date.now() % 99_991) + no * 7919) % 1_000_003 || 1, [no]);
  const def = useMemo(() => generateRace(tier, seed), [tier, seed]);
  const course = useMemo(() => courseOf(def), [def]);
  const n = def.stretches.length;
  const pair = PAIRS[(no - 1) % PAIRS.length];
  const hasTurbo = def.stretches.some((s) => s.turbo);
  /** The session's first race opens with the wordless ghost demo (a reload mid-session does not replay it). */
  const [firstEver] = useState(() => no === 1 && !silentDemoShown(LEVEL_ID));
  /** The cups won before this race (the prop grows when this one is won). */
  const [cups0] = useState(cups);

  const [phase, setPhase] = useState<Phase>('intro');
  const [k, setK] = useState(0);
  const [tape, setTape] = useState<Program>([]);
  const [wrong, setWrong] = useState(false);
  const [fx, setFx] = useState<Fx[]>([]);
  const [turboOn, setTurboOn] = useState(false);
  const [order, setOrder] = useState<[0 | 1, 0 | 1]>([0, 1]);
  const [viewW, setViewW] = useState(1200);
  const viewWRef = useRef(viewW);
  viewWRef.current = viewW;

  const g = useRef({
    phase: 'intro' as Phase,
    k: 0,
    tape: [] as Program,
    bumping: false,
    me: START,
    meTarget: START,
    zoomTo: START,
    zoomSpeed: ZOOM_SPEED,
    rivals: [...RIVAL_START] as [number, number],
    started: false,
    startAt: 0,
    mountAt: Date.now(),
    lastInput: Date.now(),
    samples: [] as { t: number; me: number }[],
    stretchAt: 0,
    st: newStats(),
    totals: { placed: 0, wrong: 0, removed: 0, turboUsed: 0, turboOffered: 0, sources: { tap: 0, drag: 0, key: 0 } as Record<Source, number> },
    crossedAt: 0,
    rivalAt: [0, 0] as [number, number],
    ended: false,
    /** The won race was told to free play (levelEnded). */
    reported: false,
    helpStep: 0,
    saidLead: false,
    saidTurbo: false,
    saidBush: false,
    angle: [0, 0, 0],
    lastFrame: 0,
    cam: 0,
    lastNudge: 0,
    fxId: 1,
    timers: new Set<number>(),
    ghost: null as GhostRun | null,
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

  function logStretch(completed: boolean) {
    const s = g.current;
    const st = def.stretches[s.k];
    log('race_stretch', {
      race_no: no, stretch: s.k + 1, road: roadCode(st.road), length: st.road.length, turbo_offered: st.turbo, used_repeat: s.st.usedRepeat,
      blocks_placed: s.st.placed, wrong_blocks: s.st.wrong, removed: s.st.removed, sources: { ...s.st.sources },
      ms: Date.now() - (s.stretchAt || Date.now()), completed,
    });
  }

  function logEnd(reason: 'finished' | 'left') {
    const s = g.current;
    if (s.ended) return;
    s.ended = true;
    const end = s.crossedAt || Date.now();
    const crossed = s.rivalAt.filter((t) => t > 0);
    const lv = apiRef.current.level.current;
    log('race_end', {
      race_no: no, tier, seed, reason, ms: end - s.mountAt, play_ms: s.startAt ? end - s.startAt : 0,
      stretches: n, stretches_done: reason === 'finished' ? n : s.k, blocks_placed: s.totals.placed, wrong_total: s.totals.wrong,
      removed: s.totals.removed, turbo_offered: s.totals.turboOffered, turbo_used: s.totals.turboUsed, sources: { ...s.totals.sources },
      // no critter crossed within the wait (a very fast child): estimated from the nearest one's distance at its after-line speed
      margin_ms: reason !== 'finished' ? null : crossed.length ? Math.min(...crossed) - s.crossedAt
        : Math.round(Date.now() - s.crossedAt + ((course.finish - Math.max(...s.rivals)) / BAND.afterSpeed) * 1000),
      ...(reason === 'finished' && !crossed.length ? { margin_estimated: true } : {}),
      help_levels: s.helpStep, adult_helped: !!lv?.adultHelped, cups: reason === 'finished' ? cups0 + 1 : cups0,
    });
  }

  // ---------------------------------------------------------------- the race's life

  function startNow() {
    const s = g.current;
    if (s.phase !== 'intro') return;
    s.ghost?.cancel();
    s.phase = 'input';
    setPhase('input');
    s.stretchAt = Date.now();
    s.lastInput = Date.now();
    if (firstEver) speak(LINES.go);
    enterStretch();
  }

  /** A stretch becomes the one to build (its first line when it is the race's first turbo). */
  function enterStretch() {
    const s = g.current;
    const st = def.stretches[s.k];
    if (st.turbo) {
      s.totals.turboOffered++;
      if (!s.saidTurbo) { s.saidTurbo = true; later(() => speak(LINES.turbo), 300); }
    }
  }

  /** The kart reached the next stretch's start: it is the one to build now. */
  function arrive() {
    const s = g.current;
    s.k++;
    s.tape = [];
    s.st = newStats();
    s.phase = 'input';
    s.stretchAt = Date.now();
    s.lastInput = Date.now();
    s.meTarget = s.me;
    setTape([]);
    setK(s.k);
    setTurboOn(false);
    setPhase('input');
    enterStretch();
  }

  function completeStretch(turbo: boolean) {
    const s = g.current;
    logStretch(true);
    s.phase = 'zoom';
    setPhase('zoom');
    setTurboOn(turbo);
    if (turbo) {
      s.totals.turboUsed++;
      speak(LINES.turboUsed);
      chime(['do', 'mi', 'sol', 'mi', 'sol'], 70);
    } else chime(['mi', 'sol'], 120);
    const last = s.k === n - 1;
    s.zoomTo = last ? course.finish + PARK : course.starts[s.k + 1];
    s.zoomSpeed = turbo ? TURBO_SPEED : ZOOM_SPEED;
    s.meTarget = s.zoomTo;
  }

  function crossLine() {
    const s = g.current;
    s.crossedAt = Date.now();
    s.phase = 'finish';
    setPhase('finish');
    won();
    // the cup is a level solved: it plants the race's seed and counts on the shelf
    progress.update((q) => solve(q, `${CUP_PREFIX}${cups0 + 1}`));
    speak(LINES.won);
    chime(['do', 'mi', 'sol', 'mi', 'sol', 'sol'], 130);
    apiRef.current.lowerHand('moved_on', LEVEL_ID);
  }

  function toPodium() {
    const s = g.current;
    if (s.phase === 'podium') return;
    logEnd('finished');
    const first: 0 | 1 = s.rivalAt[0] && (!s.rivalAt[1] || s.rivalAt[0] <= s.rivalAt[1]) ? 0 : s.rivalAt[1] ? 1 : s.rivals[0] >= s.rivals[1] ? 0 : 1;
    setOrder([first, first === 0 ? 1 : 0]);
    s.phase = 'podium';
    setPhase('podium');
    later(() => speak(LINES.cup), 1900);
    later(reportWin, PODIUM_END_MS);
  }

  /** The won race, told to free play once (after the podium had its moment, or as the child moves on from it). */
  function reportWin() {
    const s = g.current;
    if (s.reported || !s.crossedAt) return;
    s.reported = true;
    const lv = apiRef.current.level.current;
    levelEnded({
      level_id: LEVEL_ID, activity: 'race', outcome: 'win', time_ms: s.crossedAt - s.mountAt, attempts: s.totals.placed,
      help_levels: s.helpStep, blocks_optimal: def.stretches.reduce((a, x) => a + x.road.length, 0), adult_helped: !!lv?.adultHelped,
      race_no: no, tier,
    });
  }
  const reportRef = useRef(reportWin);
  reportRef.current = reportWin;

  // ---------------------------------------------------------------- the child's blocks

  function place(block: Block, source: Source) {
    const s = g.current;
    if (s.phase === 'intro') startNow();
    if (s.phase !== 'input' || s.bumping) return;
    const st = def.stretches[s.k];
    const r = judge(st.road, s.tape, block);
    if (r.verdict === 'full') return;
    const now = Date.now();
    s.lastInput = now;
    if (!s.started) { s.started = true; s.startAt = now; }
    s.st.placed++;
    s.st.sources[source]++;
    s.totals.placed++;
    s.totals.sources[source]++;
    if (block.t === 'loop') s.st.usedRepeat = true;
    s.tape = r.tape;
    setTape(r.tape);
    if (r.verdict === 'wrong') {
      s.st.wrong++;
      s.totals.wrong++;
      s.bumping = true;
      setWrong(true);
      bump();
      later(() => {
        s.tape = s.tape.slice(0, -1);
        setTape(s.tape);
        setWrong(false);
        s.bumping = false;
      }, BUMP_MS);
      return;
    }
    const f = filledOf(r.tape);
    ringNote(NOTES[Math.min(NOTES.length - 1, f - 1)]);
    puff();
    if (r.verdict === 'complete') { completeStretch(block.t === 'loop'); return; }
    s.meTarget = Math.max(s.meTarget, restingSpot(course, s.k, f));
  }
  const placeRef = useRef(place);
  placeRef.current = place;

  /** A tap on a filled slot: that block and everything after it come out. */
  function removeFrom(slot: number) {
    const s = g.current;
    if (s.phase !== 'input' || s.bumping || slot >= filledOf(s.tape)) return;
    s.tape = cutAt(s.tape, slot);
    s.st.removed++;
    s.totals.removed++;
    s.lastInput = Date.now();
    setTape(s.tape);
  }

  /** The child's kart, in world coordinates (its lane). */
  const meAt = (u: number) => ({ x: u * SEG, y: surfaceY(course, u) + LANES.me.dy });

  function puff() {
    const s = g.current;
    const p = meAt(s.me);
    const id = s.fxId++;
    setFx((f) => [...f, { id, kind: 'dust', x: p.x, y: p.y }]);
    later(() => setFx((f) => f.filter((x) => x.id !== id)), 700);
  }

  function bump() {
    const s = g.current;
    const p = meAt(s.me + 0.5);
    const id = s.fxId++;
    setFx((f) => [...f, { id, kind: 'bush', x: p.x, y: p.y }]);
    later(() => setFx((f) => f.filter((x) => x.id !== id)), 1300);
    const el = kartRefs[2].current?.querySelector('.rc-kart-in');
    if (el) { el.classList.remove('is-bump'); void el.getBoundingClientRect(); el.classList.add('is-bump'); }
    if (!s.saidBush) { s.saidBush = true; speak(LINES.bush); }
  }

  // ---------------------------------------------------------------- the frame loop: the karts, the camera, the critters

  function frame(t: number) {
    const s = g.current;
    const now = Date.now();
    const dt = s.lastFrame ? Math.min(0.06, (t - s.lastFrame) / 1000) : 0;
    s.lastFrame = t;
    if (s.phase === 'zoom' || s.phase === 'finish' || s.phase === 'podium') {
      if (s.me < s.zoomTo) {
        const left = s.zoomTo - s.me;
        // after the line it slows down to park
        const v = s.phase === 'zoom' ? s.zoomSpeed : Math.max(0.35, Math.min(s.zoomSpeed, left * 1.6));
        s.me = Math.min(s.zoomTo, s.me + v * dt);
      }
      if (s.phase === 'zoom' && !s.crossedAt && s.me >= course.finish) crossLine();
      else if (s.phase === 'zoom' && s.me >= s.zoomTo) arrive();
    } else {
      s.me += (s.meTarget - s.me) * Math.min(1, dt * 7);
    }
    if (!s.samples.length || now - s.samples[s.samples.length - 1].t > 200) {
      s.samples.push({ t: now, me: s.me });
      if (s.samples.length > 120) s.samples.shift();
    }
    // the critters
    if (s.started) {
      const inp = {
        me: s.me, finish: course.finish, pace: paceOf(s.samples, now), idleMs: s.phase === 'input' ? now - s.lastInput : 0,
        last: s.k === n - 1, meDone: s.crossedAt > 0,
      };
      ([0, 1] as const).forEach((role) => {
        const pos = s.rivals[role];
        let next: number;
        if (s.crossedAt) {
          // after the child crossed they drive on to the line, then slow down to park beside the child
          const park = course.finish + PARK - 0.8 - role * 0.9;
          next = Math.min(park, pos + Math.min(BAND.afterSpeed, Math.max(0.3, (park - pos) * 1.6)) * dt);
        } else next = stepRival(pos, dt, inp, role);
        if (!s.rivalAt[role] && s.crossedAt && next >= course.finish) s.rivalAt[role] = now;
        s.rivals[role] = next;
      });
      // tension, once a race: "¡El zorro va adelante!"
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
      // ease the tilt into and out of a ramp (a piece boundary would snap it)
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

  // ---------------------------------------------------------------- mount: the intro, the loop, the keys, the idle nudge

  useEffect(() => {
    const s = g.current;
    apiRef.current.level.current = { id: LEVEL_ID, helpStep: 0, adultHelped: false };
    log('race_start', {
      race_no: no, tier, seed, stretches: n, roads: def.stretches.map((x) => `${x.turbo ? 'T' : ''}${roadCode(x.road)}`),
      turbo_stretches: def.stretches.filter((x) => x.turbo).length, rivals: [...pair], ...(again ? { again: true } : {}),
    });
    let off = () => {};
    if (firstEver) {
      markSilentDemoShown(LEVEL_ID);
      off = speakWhenAllowed(LINES.first);
      later(() => {
        const root = rootRef.current;
        if (!root || s.phase !== 'intro') return;
        log('ghost_demo', { level_id: LEVEL_ID, kind: 'intro' });
        s.ghost = playGhost(root, [
          { do: 'drag', from: `.rc-pal [data-cmd="${def.stretches[0].road[0]}"]`, to: '.rc-slot.is-next' },
          { do: 'wait', ms: 400 },
        ], { pace: 0.9 });
        void s.ghost.done.then(() => later(startNow, 250));
      }, 1300);
      // a ghost that cannot play never keeps the child waiting
      later(startNow, 12_000);
    } else {
      off = speakWhenAllowed(LINES.go);
      later(startNow, 1200);
    }
    let raf = requestAnimationFrame(function loop(t) { raf = requestAnimationFrame(loop); frameRef.current(t); });
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const d: RoadDir | null = e.key === 'ArrowRight' ? 'right' : e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : null;
      if (!d && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      e.stopPropagation();
      if (d && !e.repeat) placeRef.current(arrowBlock(d), 'key');
    };
    window.addEventListener('keydown', onKey, true);
    const nudge = window.setInterval(() => {
      const root = rootRef.current;
      const now = Date.now();
      if (!root || s.phase !== 'input' || s.bumping || document.hidden || document.querySelector('.ghost-hand')) return;
      if (now - s.lastInput < IDLE_NUDGE_MS || now - s.lastNudge < IDLE_REPEAT_MS) return;
      s.lastNudge = now;
      wiggleHelp(root);
      glowTargets(root, 2400);
    }, 1000);
    return () => {
      off();
      cancelAnimationFrame(raf);
      clearInterval(nudge);
      window.removeEventListener('keydown', onKey, true);
      stopSpeaking();
      s.ghost?.cancel();
      s.timers.forEach((x) => clearTimeout(x));
      s.timers.clear();
      // a won race leaves ("¡Otra carrera!", the menu) before its podium moment ended: free play still counts it
      reportRef.current();
      if (!s.ended) {
        if (s.crossedAt) logEnd('finished');
        else {
          if (s.phase === 'input' && s.st.placed > 0) logStretch(false);
          logEnd('left');
        }
      }
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
    const s = g.current;
    const st = def.stretches[s.k];
    const d = st.road[filledOf(s.tape)] ?? st.road[0];
    speak(`${LINES.task} ${helpLine(d, st.turbo && !!repeatFor(st, s.tape))}`);
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
    const st = def.stretches[s.k];
    const d = st.road[filledOf(s.tape)] ?? 'right';
    speak(helpLine(d, st.turbo && !!repeatFor(st, s.tape)));
    const root = rootRef.current;
    if (!root) return;
    glowTargets(root, 3000);
    if (step >= 2) {
      s.ghost?.cancel();
      s.ghost = playGhost(root, [{ do: 'drag', from: `.rc-pal [data-cmd="${d}"]`, to: '.rc-slot.is-next' }, { do: 'wait', ms: 400 }]);
      log('ghost_demo', { level_id: LEVEL_ID, kind: 'hint' });
    }
  };

  // ---------------------------------------------------------------- screenshots and checks (?debug only), the demo bar

  /** Places the right blocks for the rest of the stretch on screen (singles), as taps. */
  const solveStretch = (leave = 0) => {
    const s = g.current;
    if (s.phase === 'intro') startNow();
    const st = def.stretches[s.k];
    for (let i = filledOf(s.tape); i < st.road.length - leave; i++) placeRef.current(arrowBlock(st.road[i]), 'tap');
  };
  /** Jumps to the race's last stretch and completes it (the finish at once). */
  const finishNow = () => {
    const s = g.current;
    if (s.phase === 'intro') startNow();
    if (s.phase !== 'input' && s.phase !== 'zoom') return;
    s.started = true;
    s.startAt ||= Date.now();
    s.k = n - 1;
    s.me = course.starts[n - 1];
    s.meTarget = s.me;
    s.tape = [];
    s.rivals = [s.me - 0.6, s.me - 1.2];
    s.phase = 'input';
    setK(n - 1);
    setTape([]);
    solveStretch();
  };
  useEffect(() => {
    if (!DEBUG) return;
    (window as unknown as { __race: unknown }).__race = {
      state: () => {
        const s = g.current;
        const st = def.stretches[s.k];
        return {
          phase: s.phase, raceNo: no, tier, seed, stretch: s.k + 1, stretches: n, road: st.road, turbo: st.turbo, filled: filledOf(s.tape),
          me: s.me, rivals: [...s.rivals], finish: course.finish, crossed: s.crossedAt > 0, cups: cups0, ended: s.ended, rivalsNames: [...pair],
          roads: def.stretches.map((x) => `${x.turbo ? 'T' : ''}${roadCode(x.road)}`),
        };
      },
      /** A block as a tap (or another source): 'right' | 'up' | 'down' | 'repeat'. */
      place: (what: RoadDir | 'repeat', source: Source = 'tap') => {
        const s = g.current;
        const b = what === 'repeat' ? repeatFor(def.stretches[s.k], s.tape) : arrowBlock(what);
        if (b) placeRef.current(b, source);
      },
      solveStretch: () => solveStretch(),
      finish: () => finishNow(),
      /** Screenshots: put the karts where asked (course units). */
      pose: (me: number, r0: number, r1: number) => { const s = g.current; s.me = me; s.meTarget = me; s.rivals = [r0, r1]; s.started = true; },
      /** Screenshots: jump to stretch `k` (1-based), the kart at its start. */
      goStretch: (k1: number) => {
        const s = g.current;
        if (s.phase === 'intro') startNow();
        const kk = Math.max(0, Math.min(n - 1, k1 - 1));
        s.k = kk; s.me = course.starts[kk]; s.meTarget = s.me; s.tape = []; s.phase = 'input'; s.lastInput = Date.now();
        setK(kk); setTape([]); setPhase('input');
      },
      /** Screenshots: the next race at tier `t`. */
      tier: (t: number) => setTier(t),
      idle: (ms: number) => { g.current.lastInput = Date.now() - ms; },
    };
    return () => { delete (window as unknown as { __race?: unknown }).__race; };
  });
  const demoRef = useRef({ skip: () => {}, solve: () => {} });
  demoRef.current = { skip: finishNow, solve: () => solveStretch(1) };
  useEffect(() => provideDemoActions({ rank: 2, noun: 'carrera', skip: () => demoRef.current.skip(), solve: () => demoRef.current.solve() }), []);

  // ---------------------------------------------------------------- drawing

  const st = def.stretches[k];
  const filled = filledOf(tape);
  /** The pieces covered by right blocks (a wrong block on its way out covers nothing). */
  const good = wrong ? filled - 1 : filled;
  const h0 = Math.round(heightAt(course, course.starts[k]));
  const repeat = phase === 'input' || phase === 'intro' ? repeatFor(st, tape) : null;
  const inputOn = phase === 'input' || phase === 'intro';
  const done = phase === 'zoom' || phase === 'finish';

  const bar = (
    <Bar
      instruction={(
        <span className="drawn-task" aria-hidden="true">
          <PlayerFace className="bar-face" />
          <ThenArrow />
          <span className="rc-task-block"><BlockArt look={{ kind: 'cmd', cmd: 'right', fill: DIR_FILL.right, w: 52, h: 38 }} d={{ ...DIMS, h: 38 }} /></span>
          <ThenArrow />
          <FlagIcon size={42} />
        </span>
      )}
      title={<><b>La carrera</b>{`carrera ${no} · nivel ${tier} · ${phase === 'podium' ? 'llegada' : `tramo ${k + 1} de ${n}`}`}</>}
      pages={<CupRow n={cups0 + (phase === 'finish' || phase === 'podium' ? 1 : 0)} />}
      aside={<SeedPouch />}
      onSpeak={onSpeak}
      onHelp={onHelp}
    />
  );

  if (phase === 'podium') {
    return (
      <main ref={rootRef} className="pp-page pp-race is-podium" data-phase={phase} data-race={no} data-tier={tier}>
        {bar}
        <Podium pair={pair} order={order} cups={cups0 + 1} again={next} />
      </main>
    );
  }

  return (
    <main ref={rootRef} className={`pp-page pp-race${hasTurbo ? ' has-turbo' : ''}`} data-phase={phase} data-race={no} data-tier={tier} data-stretch={k + 1}>
      {bar}
      <section className="sheet rc-track" aria-label="La pista">
        <span className="tape tape-l" aria-hidden="true" />
        <span className="tape tape-r" aria-hidden="true" />
        <svg ref={svgRef} className="rc-scene" viewBox={`0 0 ${viewW} ${TRACK_H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Tramo ${k + 1} de ${n}`}>
          <g ref={cloudRef}><Clouds width={course.length * SEG + 2000} /></g>
          <g ref={backRef}><Backdrop width={course.length * SEG * 0.6 + 2000} /></g>
          <g ref={worldRef}>
            <TrackRoad c={course} stretches={def.stretches} />
            {/* the stretch being built: a blue-pen bracket over its pieces on the track */}
            {!done && (
              <path
                className="rc-here" d={`M${course.starts[k] * SEG + 8},${surfaceY(course, course.starts[k]) - 64} Q${course.starts[k] * SEG + 8},${surfaceY(course, course.starts[k]) - 76} ${course.starts[k] * SEG + 22},${Math.min(surfaceY(course, course.starts[k]), surfaceY(course, course.ends[k])) - 78} L${course.ends[k] * SEG - 22},${Math.min(surfaceY(course, course.starts[k]), surfaceY(course, course.ends[k])) - 78} Q${course.ends[k] * SEG - 8},${surfaceY(course, course.ends[k]) - 76} ${course.ends[k] * SEG - 8},${surfaceY(course, course.ends[k]) - 64}`}
                fill="none" stroke="#3d6ea5" strokeWidth={3} strokeDasharray="2 7" strokeLinecap="round"
              />
            )}
            <g ref={kartRefs[0]} className="rc-kart rc-r1" data-racer={pair[1]}><g className="rc-kart-in"><Kart tone="r1" seed={3} driver={<CritterDriver id={pair[1]} />} /></g></g>
            <g ref={kartRefs[1]} className="rc-kart rc-r0" data-racer={pair[0]}><g className="rc-kart-in"><Kart tone="r0" seed={2} driver={<CritterDriver id={pair[0]} />} /></g></g>
            {fx.filter((f) => f.kind === 'dust').map((f) => <g key={f.id} transform={`translate(${f.x} ${f.y})`}><Dust /></g>)}
            <g ref={kartRefs[2]} className={`rc-kart rc-me${turboOn && phase === 'zoom' ? ' is-turbo' : ''}`} data-racer="me">
              <g className="rc-kart-in">
                {turboOn && phase === 'zoom' && <Flames />}
                <Kart tone="me" seed={1} driver={<MeDriver />} />
              </g>
            </g>
            {fx.filter((f) => f.kind === 'bush').map((f) => <g key={f.id} transform={`translate(${f.x} ${f.y})`}><BumpBush /></g>)}
          </g>
          <ProgressStrip w={viewW} course={course} pair={pair} refs={markRefs} />
        </svg>
      </section>
      <div className={`rc-panel${done ? ' is-done' : ''}`}>
        <Palette label={label} repeat={repeat} reserve={hasTurbo} disabled={!inputOn || wrong} onPlace={(b, src) => placeRef.current(b, src)} />
        <section className="sheet rc-stretch" aria-label={`El tramo ${k + 1}`} data-road={roadCode(st.road)} data-turbo={st.turbo || undefined}>
          <span className="tape tape-r" aria-hidden="true" />
          <div className="rc-stretch-in" key={k}>
            <MiniRoad
              road={st.road} turbo={st.turbo} h0={h0} covered={good} next={inputOn && good < st.road.length ? good : null}
              colors={DIR_FILL as Record<RoadDir, string>}
            />
            <Tape road={st.road} tape={tape} label={label} wrong={wrong} turbo={hasTurbo} active={inputOn} onTap={removeFrom} />
          </div>
        </section>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------ the progress strip (where everyone is)

export function ProgressStrip({ w, course, pair, refs }: { w: number; course: ReturnType<typeof courseOf>; pair: readonly [CritterId, CritterId]; refs: RefObject<SVGGElement | null>[] }) {
  const x0 = 40, x1 = w - 80;
  const ticks = course.starts.slice(1).map((s) => x0 + ((s - START) / (course.finish - START)) * (x1 - x0));
  return (
    <g className="rc-strip" aria-hidden="true">
      <path d={wobblyLine(x0, 30, x1, 30, { bow: 1.6, seed: 5, segs: 4 })} fill="none" stroke="#2b2622" strokeWidth={3} strokeLinecap="round" />
      {ticks.map((x, i) => <path key={i} d={`M${x},24 L${x},36`} stroke="#2b2622" strokeWidth={2} opacity={0.5} />)}
      <g transform={`translate(${x1 + 8} 36)`}>
        <path d="M0,0 L0,-34" stroke="#2b2622" strokeWidth={2.6} />
        <path d="M1,-34 L22,-30 L22,-18 L1,-22 Z" fill="#fbf7ee" stroke="#2b2622" strokeWidth={2} />
        <path d="M1,-34 L8,-33 L8,-27 L1,-28 Z M15,-31 L22,-30 L22,-24 L15,-25 Z M8,-27 L15,-25 L15,-19 L8,-21 Z" fill="#2b2622" />
        <g transform="translate(34 -6) scale(0.62)"><SeedMark /></g>
      </g>
      <g ref={refs[0]} className="rc-mark"><Marker tone="r1"><g transform="translate(0 8) scale(0.2)"><CritterArt id={pair[1]} bare /></g></Marker></g>
      <g ref={refs[1]} className="rc-mark"><Marker tone="r0"><g transform="translate(0 8) scale(0.2)"><CritterArt id={pair[0]} bare /></g></Marker></g>
      <g ref={refs[2]} className="rc-mark is-me"><Marker tone="me" big><g transform="translate(0 12)"><MeDriver w={30} /></g></Marker></g>
    </g>
  );
}

function Marker({ tone, big, children }: { tone: keyof typeof KART; big?: boolean; children: ReactNode }) {
  const r = big ? 17 : 14;
  return (
    <g>
      <circle r={r} fill={KART[tone].fill} stroke="#2b2622" strokeWidth={2.4} />
      <clipPath id={`rc-mark-${tone}`}><circle r={r - 1.5} /></clipPath>
      <g clipPath={`url(#rc-mark-${tone})`}>{children}</g>
    </g>
  );
}

/** The cups won this session, small, in the bar. */
export function CupRow({ n }: { n: number }) {
  if (!n) return <span className="pp-progress rc-cups" />;
  const shown = Math.min(n, 6);
  return (
    <span className="pp-progress rc-cups" role="img" aria-label={`${n} copas`} data-cups={n}>
      {Array.from({ length: shown }, (_, i) => <CupIcon key={i} size={30} />)}
      {n > shown && <b className="rc-cups-more">+{n - shown}</b>}
    </span>
  );
}

// ------------------------------------------------------------------ the palette

const lookCmd = (cmd: string, d: Dims): BlockLook => ({ kind: 'cmd', cmd, fill: DIR_FILL[cmd as RoadDir], w: d.w, h: d.h });
const lookLoop = (count: number, d: Dims): BlockLook => ({ kind: 'loop', w: d.cw, h: d.arm + d.h + d.foot, mouth: d.h, count });

/** A real repeat block (the C, its count disc, its pass dots) holding one → card in its mouth. */
function RepeatArt({ count, d, label }: { count: number; d: Dims; label: BlockLabel }) {
  return (
    <>
      <BlockArt look={lookLoop(count, d)} d={d} label={label} count={<span className="blk-count"><b>{count}</b></span>} />
      <span className="rc-inner" style={{ left: d.spine, top: d.arm, width: d.w, height: d.h }}>
        <BlockArt look={lookCmd('right', d)} d={d} seed={4} />
      </span>
    </>
  );
}

interface DragState { block: Block; x: number; y: number; ox: number; oy: number }

export function Palette({ label, repeat, reserve, disabled, onPlace }: {
  label: BlockLabel; repeat: Block | null; reserve: boolean; disabled: boolean; onPlace(b: Block, src: Source): void;
}) {
  const d = DIMS_KIDS;
  const [drag, setDrag] = useState<DragState | null>(null);
  const pend = useRef<{ block: Block; x0: number; y0: number; ox: number; oy: number; moved: boolean } | null>(null);
  const down = (block: Block) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button > 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    pend.current = { block, x0: e.clientX, y0: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = pend.current;
    if (!p) return;
    if (!p.moved && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 8) return;
    p.moved = true;
    setDrag({ block: p.block, x: e.clientX, y: e.clientY, ox: p.ox, oy: p.oy });
  };
  const up = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = pend.current;
    pend.current = null;
    setDrag(null);
    if (!p || disabled) return;
    if (!p.moved) { onPlace(p.block, 'tap'); return; }
    const card = document.querySelector('.rc-stretch')?.getBoundingClientRect();
    const PAD = 30;
    if (card && e.clientX >= card.left - PAD && e.clientX <= card.right + PAD && e.clientY >= card.top - PAD && e.clientY <= card.bottom + PAD) onPlace(p.block, 'drag');
  };
  const cancel = () => { pend.current = null; setDrag(null); };
  const handlers = (block: Block) => ({
    onPointerDown: down(block), onPointerMove: move, onPointerUp: up, onPointerCancel: cancel,
    onKeyDown: (e: ReactKeyboardEvent) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); onPlace(block, 'tap'); } },
  });
  const count = repeat && repeat.t === 'loop' && typeof repeat.count === 'number' ? repeat.count : 0;
  return (
    <section className={`sheet rc-pal${disabled ? ' is-off' : ''}`} aria-label="Bloques">
      <div className="rc-pal-arrows">
        {PALETTE.map((dir, i) => (
          <button
            key={dir} type="button" className="pblk rc-pblk" data-cmd={dir} aria-label={`Flecha ${dir === 'right' ? 'derecho' : dir === 'up' ? 'sube' : 'baja'}`}
            aria-disabled={disabled || undefined} style={{ width: d.w, height: d.h, '--r-cut': i % 2 ? '10px 15px 9px 13px / 14px 9px 15px 10px' : '13px 9px 15px 10px / 9px 14px 10px 15px' } as CSSProperties}
            {...handlers(arrowBlock(dir))}
          >
            <BlockArt look={lookCmd(dir, d)} d={d} seed={i + 1} label={label} />
          </button>
        ))}
      </div>
      {reserve && (
        <div className="rc-pal-turbo" style={{ width: d.cw, height: d.arm + d.h + d.foot }}>
          {repeat && (
            <button
              type="button" className="pblk rc-pblk is-repeat pop-in" data-cmd="repeat" data-count={count} aria-label={`Repetir ${count} veces`}
              aria-disabled={disabled || undefined} style={{ width: d.cw, height: d.arm + d.h + d.foot }} {...handlers(repeat)}
            >
              <RepeatArt count={count} d={d} label={label} />
            </button>
          )}
        </div>
      )}
      {drag && (
        <div
          className="blk-ghost rc-drag" aria-hidden="true"
          style={{ left: drag.x - drag.ox, top: drag.y - drag.oy, width: drag.block.t === 'loop' ? d.cw : d.w, height: drag.block.t === 'loop' ? d.arm + d.h + d.foot : d.h } as CSSProperties}
        >
          <div className="blk-ghost-in">
            {drag.block.t === 'loop'
              ? <span className="rc-ghost-c" style={{ width: d.cw, height: d.arm + d.h + d.foot }}><RepeatArt count={typeof drag.block.count === 'number' ? drag.block.count : 0} d={d} label={label} /></span>
              : <span className="rc-ghost-c" style={{ width: d.w, height: d.h }}><BlockArt look={lookCmd(drag.block.cmd, d)} d={d} label={label} /></span>}
          </div>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ the tape (the slots under the stretch's pieces)

export function Tape({ road, tape, label, wrong, turbo, active, onTap }: {
  road: readonly RoadDir[]; tape: Program; label: BlockLabel; wrong: boolean; turbo: boolean; active: boolean; onTap(slot: number): void;
}) {
  const d = DIMS_KIDS;
  const filled = filledOf(tape);
  const slots: ReactNode[] = [];
  let at = 0;
  tape.forEach((it, i) => {
    const isWrong = wrong && i === tape.length - 1;
    if (it.t === 'cmd') {
      const slot = at;
      slots.push(
        <button key={`b${i}`} type="button" className={`rc-slot is-filled${isWrong ? ' is-wrong' : ''}`} data-slot={slot} data-cmd={it.cmd}
          style={{ left: slot * CELL + (CELL - d.w) / 2, width: d.w, height: d.h }} aria-label="Sacar este bloque" onClick={() => onTap(slot)}>
          <span className="rc-slot-block"><BlockArt look={lookCmd(it.cmd, d)} d={d} seed={slot + 2} label={label} /></span>
        </button>,
      );
      at++;
      return;
    }
    const count = typeof it.count === 'number' ? it.count : 0;
    const slot = at;
    slots.push(
      <div key={`r${i}`} className="rc-covered" style={{ left: slot * CELL + 8, top: -20 }} aria-hidden="true"><RepeatBracket n={count} /></div>,
      <button key={`b${i}`} type="button" className={`rc-slot is-filled is-repeat${isWrong ? ' is-wrong' : ''}`} data-slot={slot} data-cmd="repeat" data-count={count}
        style={{ left: slot * CELL + (CELL - d.w) / 2, width: d.cw, height: d.arm + d.h + d.foot }} aria-label="Sacar el repetir" onClick={() => onTap(slot)}>
        <span className="rc-slot-block"><RepeatArt count={count} d={d} label={label} /></span>
      </button>,
    );
    at += count;
  });
  for (let i = filled; i < road.length; i++) {
    const next = active && i === filled && !wrong;
    slots.push(
      <div key={`e${i}`} className={`rc-slot is-empty${next ? ' is-next' : ''}`} data-slot={i} data-guide={next ? 'target' : undefined}
        style={{ left: i * CELL + (CELL - d.w) / 2, width: d.w, height: d.h }} aria-hidden="true">
        <svg className="blk-shape" width={d.w} height={d.h} viewBox={`0 0 ${d.w} ${d.h}`}><rect x={3} y={3} width={d.w - 6} height={d.h - 6} rx={9} className="blk-hole" /></svg>
      </div>,
    );
  }
  return (
    <div className="rc-tape" style={{ width: road.length * CELL, height: turbo ? d.arm + d.h + d.foot + 6 : d.h + 6 }} data-filled={filled} data-length={road.length}>
      {slots}
    </div>
  );
}

// ------------------------------------------------------------------ the podium

/**
 * T41/C02: exported so an honest-mode result screen (real places, not always
 * first) can draw "me" in whichever pedestal was earned. `win` defaults to
 * true (the band mode's own Podium is always a win); the honest result
 * screen passes `win={result.place === 1}` so a loss gets a neutral,
 * determined pose instead of the cheer/confetti (C02's cosmetic open item).
 */
export function PodiumMe({ x, y, win = true }: { x: number; y: number; win?: boolean }) {
  const player = usePlayer();
  const { ref, view } = useStage(player, { x: -80, y: -150, w: 160, h: 164 }, { shadow: true });
  useEffect(() => {
    if (!win) { const t = setTimeout(() => void view.current?.stayFocused(), 500); return () => clearTimeout(t); }
    const t1 = setTimeout(() => void view.current?.cheer(true), 500);
    const t2 = setTimeout(() => void view.current?.cheer(true), 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [view, win]);
  return (
    <svg
      ref={ref} className="rc-podium-me" x={x - 80} y={y - 150} width={160} height={164} overflow="visible"
      onPointerDown={() => void (win ? view.current?.cheer(true) : view.current?.stayFocused())} data-player={player.def.id}
    />
  );
}

/** T41: `extra`, drawn under the shelf (the typing race's own numbers). */
export function Podium({ pair, order, cups, again, extra }: { pair: readonly [CritterId, CritterId]; order: [0 | 1, 0 | 1]; cups: number; again(): void; extra?: ReactNode }) {
  const [fresh, setFresh] = useState(false);
  useEffect(() => { const t = setTimeout(() => setFresh(true), REDUCED ? 0 : 1700); return () => clearTimeout(t); }, []);
  const second = pair[order[0]], third = pair[order[1]];
  return (
    <section className="sheet rc-podium" aria-label="El podio">
      <span className="tape tape-l" aria-hidden="true" />
      <span className="tape tape-r" aria-hidden="true" />
      <svg className="rc-podium-scene" viewBox="100 -60 640 380" role="img" aria-label="Ganaste: primer puesto">
        <g className="rc-podium-sun" filter="url(#rough)">
          {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M410,40 L${410 + Math.cos((i * Math.PI) / 6) * 260},${40 + Math.sin((i * Math.PI) / 6) * 260}`} stroke="#f0d27a" strokeWidth={14} opacity={0.35} />)}
        </g>
        <PodiumSteps />
        <g transform="translate(232 200)"><g className="rc-podium-critter"><g transform="scale(0.9)"><CritterArt id={second} bare /></g></g></g>
        <g transform="translate(582 230)"><g className="rc-podium-critter is-late"><g transform="scale(0.85)"><CritterArt id={third} bare /></g></g></g>
        <PodiumMe x={402} y={140} />
        <g transform="translate(478 140)" className="rc-podium-cup"><Cup seed={2} /></g>
      </svg>
      <div className="rc-shelf-box">
        <Shelf cups={fresh ? cups : cups - 1} fresh={fresh} />
        {extra}
      </div>
      {/* T51: on 1ro's arcade only, "Otro juego" beside it (EndChoices renders just the button anywhere else) */}
      <EndChoices className="rc-end" again={(
        <button type="button" className="cut rc-again" aria-label={LINES.again} onClick={() => { speak(LINES.again); again(); }}>
          <AgainArt />
          <span className="rc-again-word" aria-hidden="true">{LINES.again}</span>
        </button>
      )} />
    </section>
  );
}
