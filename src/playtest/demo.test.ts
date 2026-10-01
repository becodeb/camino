import { afterEach, describe, expect, it } from 'vitest';
import { currentDemoActions, provideDemoActions, resetDemoActionsForTests } from './demo';
import { DEMO_STEPS } from './DemoBar';
import { STEPS } from './flow';

afterEach(() => resetDemoActionsForTests());

describe('the demo bar\'s actions (T14)', () => {
  it('the screen with the highest rank answers "Saltar"/"Resolver", the latest among equals; unregistering hands back', () => {
    expect(currentDemoActions()).toBeNull();
    const activity = { rank: 1, noun: 'juego' as const, skip: () => {} };
    const offActivity = provideDemoActions(activity);
    const page1 = { rank: 2, noun: 'nivel' as const, skip: () => {} };
    const offPage1 = provideDemoActions(page1);
    // free play re-registers its activity after the page mounted (a parent's effect runs after its child's): the page still wins
    offActivity();
    const again = provideDemoActions(activity);
    expect(currentDemoActions()).toBe(page1);
    const page2 = { rank: 2, noun: 'nivel' as const, skip: () => {} };
    const offPage2 = provideDemoActions(page2);
    expect(currentDemoActions()).toBe(page2);
    offPage2();
    offPage1();
    expect(currentDemoActions()).toBe(activity);
    again();
    expect(currentDemoActions()).toBeNull();
  });

  it('"Ir a…" lists the child\'s steps by the names the children hear, never the setup, the goodbye or the class end', () => {
    for (const s of DEMO_STEPS) expect(STEPS).toContain(s.step);
    expect(DEMO_STEPS.map((s) => s.step)).not.toContain('setup');
    expect(DEMO_STEPS.map((s) => s.step)).not.toContain('goodbye');
    expect(DEMO_STEPS.map((s) => s.step)).not.toContain('class_end');
    for (const s of DEMO_STEPS) expect(s.label).not.toMatch(/_/);
  });
});
