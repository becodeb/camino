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
// - The adult's demo tools (`goto`, `route_done`) jump anywhere.
// Round 2 dropped the session-code screen and the adult form step.

export const STEPS = [
  'setup', 'character', 'tool_check', 'ladder', 'free_play', 'typing', 'wardrobe', 'survey', 'goodbye', 'class_end',
] as const;
export type StepId = typeof STEPS[number];

/** The child's part: what "end now" cuts short, and what can be skipped. */
export const CHILD_STEPS: readonly StepId[] = ['character', 'tool_check', 'ladder', 'free_play', 'typing', 'wardrobe'];

/** The core route, in order: done when the child leaves the wardrobe having been through these. */
export const ROUTE: readonly StepId[] = ['tool_check', 'ladder', 'free_play', 'typing', 'wardrobe'];

/** Planned time per step (the brief's minutes), recorded with each step change; nothing is cut when it runs out. */
export const BUDGET_MS: Partial<Record<StepId, number>> = {
  setup: 30_000,
  character: 60_000,
  tool_check: 2 * 60_000,
  ladder: 8 * 60_000,
  free_play: 8 * 60_000,
  typing: 5 * 60_000,
  wardrobe: 3 * 60_000,
  survey: 90_000,
  goodbye: 60_000,
};

export type StepReason = 'start' | 'next' | 'skip' | 'end_now' | 'adult' | 'class_end' | 'demo';

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
  | { type: 'next' }
  | { type: 'skip' }
  | { type: 'end_now' }
  | { type: 'did'; activity: string }
  /** The adult opens the survey (corner menu, the green flag). */
  | { type: 'survey' }
  | { type: 'wrap_up'; on: boolean }
  | { type: 'class_end' }
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
/** The adult may open the survey from any step of the child's part (it was always the adult's call). */
export const canOpenSurvey = (state: FlowState) => CHILD_STEPS.includes(state.step) && !state.surveyDone;

export const visited = (state: FlowState, step: StepId) => state.visits.some((v) => v.step === step);

/** Every step of the core route was reached (the wardrobe being the one on screen counts). */
export const routeComplete = (state: FlowState) => ROUTE.every((s) => visited(state, s));

/** Where "quedan 5 minutos" goes after the step on screen: the wardrobe if not visited, the survey if not done, then free play. */
export function wrapTarget(state: FlowState): StepId {
  if (!visited(state, 'wardrobe')) return 'wardrobe';
  if (!state.surveyDone && state.step !== 'survey') return 'survey';
  return 'free_play';
}

/** Whether "quedan 5 minutos" still has to move the child on from the step on screen (free play after both is the end). */
export const wrapPending = (state: FlowState) => !!state.wrapUp && !(state.step === 'free_play' && wrapTarget(state) === 'free_play');

/** Where `next` goes, and whether that finishes the route. */
function nextOf(state: FlowState): { to: StepId; done?: boolean } | null {
  const { step } = state;
  if (step === 'goodbye' || step === 'class_end') return null;
  if (step === 'setup') return { to: 'character' };
  if (state.endedEarly) return step === 'survey' ? { to: 'goodbye' } : null;
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
  const budget_ms = BUDGET_MS[from];
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
      const n = nextOf(state);
      if (!n) return same;
      const t = go(state, n.to, action.type, now, n.done ? { routeDone: true } : {});
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
    case 'goto':
      return action.to === state.step || action.to === 'setup' ? same : go(state, action.to, 'demo', now);
    case 'route_done': {
      if (state.routeDone) return state.step === 'free_play' ? same : go(state, 'free_play', 'demo', now);
      const t = go(state, 'free_play', 'demo', now, { routeDone: true });
      return { ...t, routeDoneNow: true };
    }
    case 'did':
      return state.activities.includes(action.activity) ? same : { state: { ...state, activities: [...state.activities, action.activity] }, change: null };
  }
}

/** How long the current step has been on screen. */
export const timeOnStep = (state: FlowState, now: number) => now - (state.visits[state.visits.length - 1]?.at ?? now);
