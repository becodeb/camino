import { beforeEach, describe, expect, it } from 'vitest';
import { forgetSilentDemos, markSilentDemoShown, silentDemoShown } from './silentDemo';

describe('silent demos shown this session (T20)', () => {
  beforeEach(forgetSilentDemos);

  it('is not shown until marked, then stays shown', () => {
    expect(silentDemoShown('path')).toBe(false);
    markSilentDemoShown('path');
    expect(silentDemoShown('path')).toBe(true);
    expect(silentDemoShown('fix')).toBe(false);
  });

  it('a new session (forgetSilentDemos) sees every demo again', () => {
    markSilentDemoShown('path');
    forgetSilentDemos();
    expect(silentDemoShown('path')).toBe(false);
  });
});
