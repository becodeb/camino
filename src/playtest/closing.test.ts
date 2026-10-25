import { describe, expect, it } from 'vitest';
import { surveyQuestions } from './closing';

describe('C04: 4to\'s survey is the mid-class one, kept to its two base questions', () => {
  it('4to: always exactly liked, difficulty — never favorite_activity or play_again, whatever the activities', () => {
    expect(surveyQuestions([], 4).map((q) => q.id)).toEqual(['liked', 'difficulty']);
    expect(surveyQuestions(['character', 'tool_check', 'copa'], 4).map((q) => q.id)).toEqual(['liked', 'difficulty']);
  });

  it('every other grade keeps the full survey, unchanged', () => {
    expect(surveyQuestions([], 1).map((q) => q.id)).toEqual(['liked', 'difficulty', 'play_again']);
    expect(surveyQuestions(['sheet', 'recess'], 1).map((q) => q.id)).toEqual(['liked', 'difficulty', 'favorite_activity', 'play_again']);
    expect(surveyQuestions(['sheet', 'recess'], 5).map((q) => q.id)).toEqual(['liked', 'difficulty', 'favorite_activity', 'play_again']);
  });
});
