// Copa v2 engine (C08): pure TypeScript, no UI. See odd/tasks/copa-4to.md, "Design v2".
export * from './program';
export * from './track';
export { TIMING, MAX_FRAMES, simulate } from './sim';
export type { Crash, CrashCause, Frame, Fx, Outcome, SimResult, Stats } from './sim';
export * from './tracks';
export { RIVAL_ANIMAL, nextRival, raceField, raceResult, reasonFor, startTier, tierIndex } from './rivals';
export type { RaceResult, ReasonCode } from './rivals';
export { nextBlockHint } from './hints';
export type { Hint, HintBlock, PathStep, Position } from './hints';
