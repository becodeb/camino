// Which questions the end-of-session survey asks, and in what order (pure,
// unit-tested in surveyPlan.test.ts; closing.tsx draws them).
//
// - Every grade, and 1ro's classic route: "¿Te gustó jugar?", "¿Fue fácil o
//   difícil?", "¿Qué te gustó más?" (only with two or more activities
//   done) and "¿Querés volver a jugar otro día?".
// - T51, 1ro's own route (the arcade): one screen per arcade card the child
//   played (the guided pass counts), in the menu's order, each with that
//   card's drawing and the three liking faces (`liked_<card>`), and nothing
//   else: 1ro neither reads nor listens, and the difficulty hills and the
//   "play again" question were not understood (the user, 2026-10-26). A
//   child who played no card still gets "¿Te gustó jugar?".
// - C04, 4to: the mid-class survey inside the Copa is only the two base
//   questions ("¿Te gustó?", "¿Fue difícil?"): barely anything is played yet
//   (no "favorite") and there is no "again" mid-class.

import { MENU, type ActivityId } from './freePlay';

export type SurveyQuestionId = 'liked' | 'difficulty' | 'favorite_activity' | 'play_again' | `liked_${ActivityId}`;

export interface SurveyStep {
  id: SurveyQuestionId;
  /** The arcade card a `liked_<card>` question is about. */
  game?: ActivityId;
}

/** The survey's questions for a session that did `activities` (flow.ts `activities`); `arcade1ro`: 1ro's own route. */
export function surveyPlan(activities: readonly string[], arcade1ro = false, grade = 0): SurveyStep[] {
  if (arcade1ro) {
    const played = (MENU[1] ?? []).filter((a) => activities.includes(a));
    if (played.length) return played.map((game) => ({ id: `liked_${game}` as const, game }));
    return [{ id: 'liked' }];
  }
  const qs: SurveyStep[] = [{ id: 'liked' }, { id: 'difficulty' }];
  if (grade === 4) return qs;
  if (activities.length >= 2) qs.push({ id: 'favorite_activity' });
  qs.push({ id: 'play_again' });
  return qs;
}
