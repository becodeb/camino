// The playtest's session flow as a pure state machine: the steps, moving on,
// skipping a step, the adult's "end now", the time budget of each step
// (recorded, not enforced) and the activities the child actually did (the
// survey's "¿Qué te gustó más?" shows only those). The screen
// (PlaytestScreen.tsx) renders the step and turns each change into a `step`
// event and the session's `current_step`.
//
// The classroom round (T14):
// - The core route is tool check → ladder → free play → typing → wardrobe.
//   Leaving the wardrobe with the route's steps visited marks the route done
//   (`routeDone`: the green "terminó" flag, a `route_done` event) and the
//   child goes back to free play, with no end.
// - The survey is no longer a step of the route: the adult opens it (the
//   corner menu, or a long press on the green flag), and after it the child
//   returns to free play.
// - "Quedan 5 minutos" (`wrap_up`): the step on screen ends after its
//   current item (the steps watch `wrapUp`), then the wardrobe (if not
//   visited) and the survey (if not done), then free play.
// - "Terminar la clase" (`class_end`): the "Actividad terminada" screen,
//   from any step of a session.
// - T37: "Juegos para todos" (`games_all`) moves a device still on the core
//   route (tool check, ladder, typing, wardrobe) straight to the free-play
//   menu, for the last minutes of class — a device already in free play, or
//   not yet past the character screen, ignores it (no-op); it never marks
//   the route done, and the step it interrupts still ends generically as
//   "left"/"skipped" (PlaytestLevel.tsx, Ladder.tsx's own unmount guards),
//   same as any other mid-step interruption.
// - The adult's demo tools (`goto`, `route_done`) jump anywhere.
// Round 2 dropped the session-code screen and the adult form step.
//
// T38: an optional `name` step between `setup` and `character` ("¿Cómo te
// llamás?", NamePrompt.tsx), on by default for 4to/5to and toggled by
// `?nombre=si|no` for any grade (childName.ts's `nameScreenOn`). The flow
// itself stays unconditional (`name` is always in STEPS/CHILD_STEPS, so the
// generic skip/end-now/resume/demo-goto machinery already covers it); only
// the single `setup` → `next` transition is conditional, via the `nameOn`
// carried on that one `FlowAction` (computed once, where the session starts,
// from the just-known grade) — every other `next`/`skip` call in the app
// omits it and nothing downstream needs to know whether this session asked.
//
// T39: 4to's own route (`route: '4to'` on the state, set by that same
// first `next` from the grade; every other grade's state has no `route` and
// follows the default route above, unchanged): name → character → a short
// tool check → the long ladder → the Game Workshop (`workshop`, mandatory)
// → the Arcade (`free_play` with 4to's own menu, freePlay.ts). No typing
// step and no wardrobe step on the way (the wardrobe is an optional card in
// the Arcade). The Arcade opens (`arcade_open`, `arcadeOpen`) when the
// Workshop's challenges 1–5 are done — that is also 4to's green flag
// (`routeDone`) — or with "Juegos para todos"; once open, the child goes
// back and forth between the Workshop and the Arcade (`arcade` moves). The
// Arcade has no end. "Quedan 5 minutos": the item on screen, then the
// survey, then the Arcade (or the Workshop when it is still closed).
//
// T43 (1ro fun round, 2026-10-25): 1ro's own route (`route: '1ro'`, set the
// same way from the grade): character → `games` (the guided first pass
// through the monster games, src/playtest/arcade/) → free play as 1ro's
// arcade (freePlay.ts MENU[1]). No tool check, no ladder, no typing step,
// no wardrobe step on the way (the wardrobe is a card of the arcade, as in
// 4to's). Leaving `games` is 1ro's green flag; the arcade has no end. The
// ladder (and La carrera, a free-play activity) stay reachable from the
// adult corner menu (`adult_goto`). "Quedan 5 minutos": the round on
// screen, then the survey, then the arcade. "Juegos para todos" moves a
// child still in the guided pass to the arcade.

export const STEPS = [
  'setup', 'name', 'character', 'tool_check', 'ladder', 'free_play', 'typing', 'wardrobe', 'survey', 'goodbye', 'class_end',
  // T39: 4to's Workshop step, last so the default route's order (stepAfter) is untouched
  'workshop',
  // T43: 1ro's guided pass through the monster games, last for the same reason
  'games',
] as const;
export type StepId = typeof STEPS[number];

/** The child's part: what "end now" cuts short, and what can be skipped. */
export const CHILD_STEPS: readonly StepId[] = ['name', 'character', 'tool_check', 'ladder', 'free_play', 'typing', 'wardrobe', 'workshop', 'games'];

/** The core route, in order: done when the child leaves the wardrobe having been through these. */
export const ROUTE: readonly StepId[] = ['tool_check', 'ladder', 'free_play', 'typing', 'wardrobe'];
/** T39: 4to's core route (done when the Workshop's challenges 1–5 are, `arcade_open`). */
export const ROUTE_4TO: readonly StepId[] = ['tool_check', 'ladder', 'workshop'];
/** T43: 1ro's core route: the guided pass through the monster games (done when the child leaves it). */
export const ROUTE_1RO: readonly StepId[] = ['games'];

/** Planned time per step (the brief's minutes), recorded with each step change; nothing is cut when it runs out. */
export const BUDGET_MS: Partial<Record<StepId, number>> = {
  setup: 30_000,
  /** T38: the name screen, when it is on (nameScreenOn). */
  name: 30_000,
  character: 60_000,
  tool_check: 2 * 60_000,
  ladder: 8 * 60_000,
  free_play: 8 * 60_000,
  typing: 5 * 60_000,
  wardrobe: 3 * 60_000,
  survey: 90_000,
  goodbye: 60_000,
};

/** T39: 4to's planned times where they differ (a short tool check, the long ladder, the Workshop, the Arcade). */
export const BUDGET_4TO_MS: Partial<Record<StepId, number>> = {
  ...BUDGET_MS,
  tool_check: 60_000,
  ladder: 15 * 60_000,
  workshop: 20 * 60_000,
  free_play: 10 * 60_000,
};

/** T43: 1ro's planned times (the guided pass, then a long arcade). */
export const BUDGET_1RO_MS: Partial<Record<StepId, number>> = {
  ...BUDGET_MS,
  games: 10 * 60_000,
  free_play: 20 * 60_000,
};

/** T39: the routes that differ from the default one, by grade (T43: 1ro's). */
export type RouteKind = '4to' | '1ro';
export const routeKindOf = (grade: number | null | undefined, classic = false): RouteKind | undefined => (grade === 4 ? '4to' : grade === 1 && !classic ? '1ro' : undefined);

/**
 * T43: `?ruta=clasica` in the link keeps 1ro on the route and menu it had
 * until 2026-10-20 (tool check, ladder, free play, typing, wardrobe): the
 * teacher's way back if a new game misbehaves in class, and the scripted
 * checks of that default route. Any other grade ignores it.
 */
export const classicRouteFromUrl = (search: string) => /[?&]ruta=clasica(?:&|$)/i.test(search);

/** T39 `arcade`: 4to's child moving between the Workshop, the Arcade and the Arcade's wardrobe. */
export type StepReason = 'start' | 'next' | 'skip' | 'end_now' | 'adult' | 'class_end' | 'demo' | 'games_all' | 'arcade';
/** T43: where the adult corner menu can take a 1ro child off the arcade route (the ladder), and back. */
export type AdultGotoTarget = 'ladder' | 'free_play';

export interface Visit {
  step: StepId;
  at: number;
  /** When the child left it, and how. */
  left?: number;
  how?: StepReason;
}

export interface FlowState {
  step: StepId;
  visits: Visit[];
  /** What the child did, in the order first done (activity ids, e.g. 'character', 'ladder', 'recess'). */
  activities: string[];
  /** The adult ended the child's part early. */
  endedEarly: boolean;
  /** T14: the core route is done (the green flag); free play has no end from then on. */
  routeDone?: boolean;
  /** T14: the survey was answered to the end. */
  surveyDone?: boolean;
  /** T14: "quedan 5 minutos" is on: the step ends after its item, then the wardrobe and the survey. */
  wrapUp?: boolean;
  /** T39: this session follows a grade's own route (absent: the default route). */
  route?: RouteKind;
  /** T39 (4to): the Arcade is open (the Workshop's challenges 1–5, or "Juegos para todos"). */
  arcadeOpen?: boolean;
}

export interface StepChange {
  from: StepId | null;
  to: StepId;
  reason: StepReason;
  /** Time spent on `from`. */
  time_ms?: number;
  /** `from`'s planned time. */
  budget_ms?: number;
  over_budget?: boolean;
  /** The move was "quedan 5 minutos"'s way out (the wardrobe, the survey, free play). */
  wrap_up?: boolean;
}

export type FlowAction =
  /** T38: `nameOn` (only meaningful leaving `setup`) says whether this session's name screen is on (childName.ts's `nameScreenOn`); every other `next` omits it. */
  | { type: 'next'; nameOn?: boolean; grade?: number; classic?: boolean }
  | { type: 'skip' }
  | { type: 'end_now' }
  | { type: 'did'; activity: string }
  /** The adult opens the survey (corner menu, the green flag). */
  | { type: 'survey' }
  | { type: 'wrap_up'; on: boolean }
  | { type: 'class_end' }
  /** T37: "Juegos para todos" — a no-op where `canGamesAll` is false (character, free play itself, survey, goodbye, class_end, setup). */
  | { type: 'games_all' }
  /** T39 (4to): the Arcade opens; `workshop` (challenges 1–5 done) is also the green flag. */
  | { type: 'arcade_open'; via: 'workshop' }
  /** T39 (4to): the child moves between the Workshop, the Arcade and the Arcade's wardrobe. */
  | { type: 'arcade'; to: 'workshop' | 'free_play' | 'wardrobe' }
  /** T43 (1ro): the adult corner menu opens the ladder (it left 1ro's route), or goes back to the arcade. */
  | { type: 'adult_goto'; to: AdultGotoTarget }
  /** Demo tools: straight to a step / to the route done. */
  | { type: 'goto'; to: StepId }
  | { type: 'route_done' };

export interface Transition {
  state: FlowState;
  change: StepChange | null;
  /** This transition finished the core route (log `route_done`). */
  routeDoneNow?: boolean;
}

export function initialFlow(now: number): FlowState {
  return { step: 'setup', visits: [{ step: 'setup', at: now }], activities: [], endedEarly: false };
}

/** The next step in plain route order (no wrap-up, no route done): tests and the demo's list. */
export const stepAfter = (s: StepId): StepId | null => (s === 'goodbye' || s === 'class_end' ? null : STEPS[STEPS.indexOf(s) + 1] ?? null);
export const canSkip = (s: StepId) => CHILD_STEPS.includes(s) || s === 'survey';
export const canEndNow = (s: StepId) => CHILD_STEPS.includes(s);
/** T37: "Juegos para todos" only moves a device off a core-route step that is not free play itself (already the games zone) and not the character screen (nothing to preserve yet). */
export const canGamesAll = (s: StepId) => s === 'tool_check' || s === 'ladder' || s === 'typing' || s === 'wardrobe';
/** T39: 4to's "Juegos para todos" opens the Arcade from the tool check, the ladder or the Workshop. */
const canGamesAll4to = (s: StepId) => s === 'tool_check' || s === 'ladder' || s === 'workshop';
/** T39: the session follows 4to's route. */
export const is4to = (state: Pick<FlowState, 'route'>) => state.route === '4to';
/** T43: the session follows 1ro's route (the monster games and 1ro's arcade). */
export const is1ro = (state: Pick<FlowState, 'route'>) => state.route === '1ro';
/** The session's core route. */
export const routeOf = (state: Pick<FlowState, 'route'>): readonly StepId[] => (is4to(state) ? ROUTE_4TO : is1ro(state) ? ROUTE_1RO : ROUTE);
/** T39: free play never ends by its time: after the route (T14), and always in 4to's Arcade (T43: and 1ro's). */
export const freePlayEndless = (state: FlowState) => !!state.routeDone || is4to(state) || is1ro(state);
/** T43: 1ro's "Juegos para todos" moves a child still in the guided pass (or on the adult's ladder) to the arcade. */
const canGamesAll1ro = (s: StepId) => s === 'games' || s === 'ladder' || s === 'tool_check';
/** T29: the session is actively being played — not the adult's setup, not resting after "terminar la clase", not the goodbye. Closing the tab asks first only then (PlaytestScreen.tsx's `beforeunload`); the classroom bar (the green flag, "quedan 5 minutos") also only shows then. */
export const isLiveStep = (s: StepId) => s !== 'setup' && s !== 'class_end' && s !== 'goodbye';
/** The adult may open the survey from any step of the child's part (it was always the adult's call). */
export const canOpenSurvey = (state: FlowState) => CHILD_STEPS.includes(state.step) && !state.surveyDone;

export const visited = (state: FlowState, step: StepId) => state.visits.some((v) => v.step === step);

/** Every step of the core route was reached (the wardrobe being the one on screen counts). */
export const routeComplete = (state: FlowState) => ROUTE.every((s) => visited(state, s));

/** T39: where 4to's child rests: the Arcade once open, else the Workshop. */
const home4to = (state: FlowState): StepId => (state.arcadeOpen ? 'free_play' : 'workshop');

/**
 * Where "quedan 5 minutos" goes after the step on screen: the wardrobe if not visited, the survey if not done, then free play.
 * T39 (4to): the survey if not done, then the Arcade (the Workshop while it is closed).
 */
export function wrapTarget(state: FlowState): StepId {
  if (is4to(state)) return !state.surveyDone && state.step !== 'survey' ? 'survey' : home4to(state);
  // T43 (1ro): the survey if not done, then the arcade (the wardrobe is one of its cards)
  if (is1ro(state)) return !state.surveyDone && state.step !== 'survey' ? 'survey' : 'free_play';
  if (!visited(state, 'wardrobe')) return 'wardrobe';
  if (!state.surveyDone && state.step !== 'survey') return 'survey';
  return 'free_play';
}

/** Whether "quedan 5 minutos" still has to move the child on from the step on screen (free play after both is the end). */
export const wrapPending = (state: FlowState) => !!state.wrapUp && (is4to(state)
  ? !((state.step === 'free_play' || state.step === 'workshop') && wrapTarget(state) === state.step)
  : !(state.step === 'free_play' && wrapTarget(state) === 'free_play'));

/** T39: `next` on 4to's route (after setup, and not ended early). */
function next4to(state: FlowState): { to: StepId } | null {
  const { step } = state;
  if (state.wrapUp) {
    const to = wrapTarget(state);
    return to === step ? null : { to };
  }
  switch (step) {
    case 'name': return { to: 'character' };
    case 'character': return { to: 'tool_check' };
    case 'tool_check': return { to: 'ladder' };
    case 'ladder': return { to: 'workshop' };
    // "Terminé" (challenges 1–7 done): to the Arcade, once it is open
    case 'workshop': return state.arcadeOpen ? { to: 'free_play' } : null;
    // the Arcade has no end; its wardrobe and the survey go back to it (or to the Workshop)
    case 'free_play': return null;
    case 'wardrobe':
    case 'survey':
      return { to: home4to(state) };
    default: return null;
  }
}

/** T43: `next` on 1ro's route (after setup, and not ended early). */
function next1ro(state: FlowState): { to: StepId; done?: boolean } | null {
  const { step } = state;
  if (state.wrapUp) {
    const to = wrapTarget(state);
    // leaving the guided pass is still the green flag, also on the way out
    return to === step ? null : { to, done: step === 'games' && !state.routeDone };
  }
  switch (step) {
    case 'name': return { to: 'character' };
    case 'character': return { to: 'games' };
    // the guided pass is done: the arcade, and the green flag
    case 'games': return { to: 'free_play', done: !state.routeDone };
    // the arcade has no end
    case 'free_play': return null;
    // the arcade's wardrobe, the survey, and the adult's ladder (or tool check) go back to it
    case 'wardrobe':
    case 'survey':
    case 'ladder':
    case 'tool_check':
    case 'typing':
      return { to: 'free_play' };
    default: return null;
  }
}

/** Where `next` goes, and whether that finishes the route. `nameOn`: T38's name screen, only consulted leaving `setup`. */
function nextOf(state: FlowState, nameOn?: boolean): { to: StepId; done?: boolean } | null {
  const { step } = state;
  if (step === 'goodbye' || step === 'class_end') return null;
  if (step === 'setup') return { to: nameOn ? 'name' : 'character' };
  if (state.endedEarly) return step === 'survey' ? { to: 'goodbye' } : null;
  if (is4to(state)) return next4to(state);
  if (is1ro(state)) return next1ro(state);
  if (state.wrapUp) {
    const to = wrapTarget(state);
    // a child who had done everything and was in the wardrobe still finished the route
    return to === step ? null : { to, done: step === 'wardrobe' && !state.routeDone && routeComplete(state) };
  }
  if (step === 'wardrobe' && !state.routeDone) return { to: 'free_play', done: routeComplete(state) };
  if (state.routeDone && (step === 'survey' || step === 'wardrobe')) return { to: 'free_play' };
  // after the route, free play has no end (only the adult or the class end it)
  if (state.routeDone && step === 'free_play') return null;
  if (step === 'survey') return { to: 'free_play' };
  const to = stepAfter(step);
  return to ? { to } : null;
}

function go(state: FlowState, to: StepId, reason: StepReason, now: number, patch: Partial<FlowState> = {}): Transition {
  const from = state.step;
  const visits = state.visits.slice();
  const cur = visits[visits.length - 1];
  const time_ms = cur ? now - cur.at : undefined;
  if (cur) visits[visits.length - 1] = { ...cur, left: now, how: reason };
  visits.push({ step: to, at: now });
  const budget_ms = (is4to(state) ? BUDGET_4TO_MS : is1ro(state) ? BUDGET_1RO_MS : BUDGET_MS)[from];
  // leaving the survey by answering it (not skipping it) marks it done
  const surveyDone = state.surveyDone || (from === 'survey' && reason === 'next');
  return {
    state: { ...state, ...(surveyDone ? { surveyDone: true } : {}), ...patch, step: to, visits },
    change: {
      from, to, reason, time_ms,
      ...(budget_ms != null ? { budget_ms, over_budget: time_ms != null && time_ms > budget_ms } : {}),
      ...(state.wrapUp && (reason === 'next' || reason === 'skip') ? { wrap_up: true } : {}),
    },
  };
}

export function reduce(state: FlowState, action: FlowAction, now: number): Transition {
  const same = { state, change: null };
  switch (action.type) {
    case 'next':
    case 'skip': {
      if (action.type === 'skip' && !canSkip(state.step)) return same;
      const n = nextOf(state, action.type === 'next' ? action.nameOn : undefined);
      if (!n) return same;
      // T39: the route is decided once, on the first `next` from the grade
      const route = state.step === 'setup' && action.type === 'next' ? routeKindOf(action.grade, action.classic) : undefined;
      const t = go(state, n.to, action.type, now, { ...(n.done ? { routeDone: true } : {}), ...(route ? { route } : {}) });
      return n.done ? { ...t, routeDoneNow: true } : t;
    }
    case 'end_now':
      if (!canEndNow(state.step)) return same;
      return go(state, state.surveyDone ? 'goodbye' : 'survey', 'end_now', now, { endedEarly: true });
    case 'survey':
      return canOpenSurvey(state) ? go(state, 'survey', 'adult', now) : same;
    case 'wrap_up':
      return !!state.wrapUp === action.on ? same : { state: { ...state, wrapUp: action.on }, change: null };
    case 'class_end':
      return state.step === 'setup' || state.step === 'class_end' ? same : go(state, 'class_end', 'class_end', now);
    case 'games_all':
      if (is4to(state)) {
        if (canGamesAll4to(state.step)) return go(state, 'free_play', 'games_all', now, { arcadeOpen: true });
        // already in the Arcade (or its wardrobe): it only opens, nothing moves
        return state.arcadeOpen || !CHILD_STEPS.includes(state.step) || state.step === 'name' || state.step === 'character'
          ? same : { state: { ...state, arcadeOpen: true }, change: null };
      }
      if (is1ro(state)) return canGamesAll1ro(state.step) ? go(state, 'free_play', 'games_all', now) : same;
      return canGamesAll(state.step) ? go(state, 'free_play', 'games_all', now) : same;
    case 'arcade_open': {
      if (!is4to(state) || state.routeDone) return same;
      return { state: { ...state, arcadeOpen: true, routeDone: true }, change: null, routeDoneNow: true };
    }
    case 'arcade': {
      // T43 (1ro): the arcade's wardrobe card, and back
      if (is1ro(state)) {
        if (state.step === action.to || action.to === 'workshop') return same;
        const ok1 = action.to === 'wardrobe' ? state.step === 'free_play' : state.step === 'wardrobe';
        return ok1 ? go(state, action.to, 'arcade', now) : same;
      }
      if (!is4to(state) || state.step === action.to) return same;
      const from = state.step;
      const ok = action.to === 'workshop'
        ? from === 'free_play' || from === 'wardrobe'
        : action.to === 'free_play'
          ? !!state.arcadeOpen && (from === 'workshop' || from === 'wardrobe')
          : !!state.arcadeOpen && from === 'free_play';
      return ok ? go(state, action.to, 'arcade', now) : same;
    }
    case 'adult_goto': {
      // T43: only 1ro's child, only from the arcade (or the guided pass) to the ladder, and from the ladder back
      if (!is1ro(state) || state.step === action.to) return same;
      const ok2 = action.to === 'ladder' ? state.step === 'free_play' || state.step === 'games' : state.step === 'ladder';
      return ok2 ? go(state, action.to, 'adult', now) : same;
    }
    case 'goto':
      return action.to === state.step || action.to === 'setup' ? same : go(state, action.to, 'demo', now);
    case 'route_done': {
      if (state.routeDone) return state.step === 'free_play' ? same : go(state, 'free_play', 'demo', now);
      const t = go(state, 'free_play', 'demo', now, { routeDone: true, ...(is4to(state) ? { arcadeOpen: true } : {}) });
      return { ...t, routeDoneNow: true };
    }
    case 'did':
      return state.activities.includes(action.activity) ? same : { state: { ...state, activities: [...state.activities, action.activity] }, change: null };
  }
}

/** How long the current step has been on screen. */
export const timeOnStep = (state: FlowState, now: number) => now - (state.visits[state.visits.length - 1]?.at ?? now);
