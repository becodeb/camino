import { describe, expect, it } from 'vitest';
import { Lockstep } from './lockstep';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('lockstep', () => {
  it('releases a step only when every live world has arrived', async () => {
    const l = new Lockstep(3);
    const got: number[] = [];
    void l.arrive(0).then(() => got.push(0));
    void l.arrive(1).then(() => got.push(1));
    await tick();
    expect(got).toEqual([]);
    void l.arrive(2).then(() => got.push(2));
    await tick();
    expect(got.sort()).toEqual([0, 1, 2]);
  });

  it('a world that leaves is no longer waited for', async () => {
    const l = new Lockstep(3);
    const got: number[] = [];
    void l.arrive(0).then(() => got.push(0));
    void l.arrive(1).then(() => got.push(1));
    l.leave(2);
    await tick();
    expect(got.sort()).toEqual([0, 1]);
    // and a world that left never blocks again
    await l.arrive(2);
  });

  it('a single world never waits', async () => {
    const l = new Lockstep(1);
    await l.arrive(0);
    await l.arrive(0);
    l.leave(0);
    expect(true).toBe(true);
  });
});
