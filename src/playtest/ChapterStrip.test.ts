import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChapterStrip } from './ChapterStrip';

const count = (html: string, cls: string) => html.split(cls).length - 1;

describe('T55: 1ro\'s progress strip', () => {
  it('in the guided pass: the games before the one on screen are done, it pulses, the blocks wait', () => {
    const html = renderToStaticMarkup(h(ChapterStrip, { games: 4, game: 2 }));
    expect(count(html, 'cs-game is-done')).toBe(2);
    expect(count(html, 'cs-game is-here')).toBe(1);
    expect(count(html, 'cs-game is-todo')).toBe(1);
    expect(count(html, 'cs-level is-todo')).toBe(1);
  });

  it('in the ladder: every game done, a block per level met and the one on screen, at most six drawn', () => {
    const html = renderToStaticMarkup(h(ChapterStrip, { games: 4, game: 4, levels: 2, inLadder: true }));
    expect(count(html, 'cs-game is-done')).toBe(4); // any number of games
    expect(count(html, 'cs-level is-done')).toBe(2);
    expect(count(html, 'cs-level is-here')).toBe(1);
    const many = renderToStaticMarkup(h(ChapterStrip, { games: 4, game: 4, levels: 15, inLadder: true }));
    expect(count(many, 'cs-level ')).toBe(6);
    expect(count(many, 'cs-level is-here')).toBe(1);
  });
});
