import { describe, expect, it } from 'vitest';
import { surveyPlan } from './surveyPlan';

describe('the survey plan', () => {
  it('other grades and 1ro\'s classic route keep their four questions ("¿Qué te gustó más?" with two or more activities)', () => {
    expect(surveyPlan(['ladder', 'free_play']).map((q) => q.id)).toEqual(['liked', 'difficulty', 'favorite_activity', 'play_again']);
    expect(surveyPlan(['ladder']).map((q) => q.id)).toEqual(['liked', 'difficulty', 'play_again']);
  });

  it('T51: 1ro\'s arcade asks only the liking faces, one screen per card played, in the menu\'s order', () => {
    const plan = surveyPlan(['character', 'games', 'tap', 'recipe', 'typing_race', 'dance', 'oops', 'free_play', 'wardrobe'], true);
    expect(plan.map((q) => q.id)).toEqual(['liked_typing_race', 'liked_wardrobe', 'liked_recipe', 'liked_oops', 'liked_dance', 'liked_tap']);
    expect(plan.map((q) => q.game)).toEqual(['typing_race', 'wardrobe', 'recipe', 'oops', 'dance', 'tap']);
    // no difficulty hills, no "play again", no "¿Qué te gustó más?"
    expect(plan.some((q) => ['difficulty', 'play_again', 'favorite_activity', 'liked'].includes(q.id))).toBe(false);
  });

  it('T51: a 1ro child who played no card still gets "¿Te gustó jugar?"', () => {
    expect(surveyPlan(['character'], true)).toEqual([{ id: 'liked' }]);
  });
});
