// The playtest's session flow as a pure state machine: the steps in order,
// moving on, skipping a step, the adult's "end now" (straight to the
// survey), the time budget of each step (recorded, not enforced yet) and the
// activities the child actually did (the survey's "¿Qué te gustó más?" shows
// only those). Round 2 dropped the session-code screen and the adult form
// step: the grade's tap starts the child's part, the goodbye starts the next
// session by itself, and the adult's comment is optional, from the corner
// menu (AdultControls.tsx). The screen (PlaytestScreen.tsx) renders the step and turns
// each change into a `step` event and the session's `current_step`.

export const STEPS = [
  'setup', 'character', 'tool_check', 'ladder', 'free_play', 'typing', 'wardrobe', 'survey', 'goodbye',
] as const;
export type StepId = typeof STEPS[number];

/** The child's part: what "end now" cuts short, and what can be skipped. */
export const CHILD_STEPS: readonly StepId[] = ['character', 'tool_check', 'ladder', 'free_play', 'typing', 'wardrobe'];

/** Planned time per step (the brief's minutes), recorded with each step change; nothing is cut when it runs out. */
export const BUDGET_MS: Partial<Record<StepId, number>> = {
  setup: 30_000,
  character: 60_000,
  tool_check: 2 * 60_000,
  ladder: 12 * 60_000,
  free_play: 15 * 60_000,
  typing: 5 * 60_000,
  wardrobe: 3 * 60_000,
  survey: 90_000,
  goodbye: 60_000,
};

export type StepReason = 'start' | 'next' | 'skip' | 'end_now';

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
}

export type FlowAction =
  | { type: 'next' }
  | { type: 'skip' }
  | { type: 'end_now' }
  | { type: 'did'; activity: string };

export interface Transition {
  state: FlowState;
  change: StepChange | null;
}

export function initialFlow(now: number): FlowState {
  return { step: 'setup', visits: [{ step: 'setup', at: now }], activities: [], endedEarly: false };
}

export const stepAfter = (s: StepId): StepId | null => STEPS[STEPS.indexOf(s) + 1] ?? null;
export const canSkip = (s: StepId) => CHILD_STEPS.includes(s) || s === 'survey';
export const canEndNow = (s: StepId) => CHILD_STEPS.includes(s);

function go(state: FlowState, to: StepId, reason: StepReason, now: number, patch: Partial<FlowState> = {}): Transition {
  const from = state.step;
  const visits = state.visits.slice();
  const cur = visits[visits.length - 1];
  const time_ms = cur ? now - cur.at : undefined;
  if (cur) visits[visits.length - 1] = { ...cur, left: now, how: reason };
  visits.push({ step: to, at: now });
  const budget_ms = BUDGET_MS[from];
  return {
    state: { ...state, ...patch, step: to, visits },
    change: {
      from, to, reason, time_ms,
      ...(budget_ms != null ? { budget_ms, over_budget: time_ms != null && time_ms > budget_ms } : {}),
    },
  };
}

export function reduce(state: FlowState, action: FlowAction, now: number): Transition {
  const same = { state, change: null };
  switch (action.type) {
    case 'next': {
      const to = stepAfter(state.step);
      return to ? go(state, to, 'next', now) : same;
    }
    case 'skip': {
      const to = stepAfter(state.step);
      return to && canSkip(state.step) ? go(state, to, 'skip', now) : same;
    }
    case 'end_now':
      return canEndNow(state.step) ? go(state, 'survey', 'end_now', now, { endedEarly: true }) : same;
    case 'did':
      return state.activities.includes(action.activity) ? same : { state: { ...state, activities: [...state.activities, action.activity] }, change: null };
  }
}

/** How long the current step has been on screen. */
export const timeOnStep = (state: FlowState, now: number) => now - (state.visits[state.visits.length - 1]?.at ?? now);
