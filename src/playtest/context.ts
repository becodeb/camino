// What every step of the playtest can reach: the session, the flow, the
// event log, and the adult's raised-hand state. PlaytestScreen provides it;
// a step component (see steps.tsx: STEP_VIEWS) reads it with usePlaytest().

import { createContext, useContext, type MutableRefObject } from 'react';
import type { FlowState } from './flow';
import type { SessionRecord } from './telemetry';

/** The level on screen, as the adult's gestures need it (PlaytestLevel registers it). */
export interface LevelTrack {
  id: string;
  /** Highest automatic help step shown (0–3). */
  helpStep: number;
  /** An adult_help was logged while it was open. */
  adultHelped: boolean;
}

/** The character's raised hand: waiting for the adult since `since`. */
export interface HandState {
  since: number;
  level_id?: string;
  help_step: number;
  reason: 'help_held' | 'help_step_3';
}

export type AdultHelpKind = 'instruction' | 'tool' | 'hint' | 'solved_together';

export interface PlaytestApi {
  /** Null only on the setup step. */
  session: SessionRecord | null;
  flow: FlowState;
  /** The step is done: the next one. */
  next(): void;
  /** The step is left without being done (a placeholder, the adult). */
  skip(): void;
  /** The adult ends the child's part: straight to the survey. */
  endNow(): void;
  /** The child did an activity (the survey offers it as a favourite). */
  did(activity: string): void;
  /** Logs an event of the session (docs/prueba-piloto-datos.md). */
  log(type: string, payload?: Record<string, unknown>): void;
  level: MutableRefObject<LevelTrack | null>;
  hand: HandState | null;
  raiseHand(reason: HandState['reason']): void;
  /** The adult tells what they did (`prompted`: answering the raised hand). */
  adultHelp(kind: AdultHelpKind, prompted: boolean): void;
}

export const PlaytestContext = createContext<PlaytestApi | null>(null);

export function usePlaytest(): PlaytestApi {
  const api = useContext(PlaytestContext);
  if (!api) throw new Error('usePlaytest outside PlaytestScreen');
  return api;
}
