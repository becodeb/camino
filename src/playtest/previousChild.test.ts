import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPreviousChild, PREVIOUS_MAX_AGE_MS, rememberPreviousAdultForm, resetPreviousChildForTests,
  retryPendingSubmit, savePreviousChild, submitPreviousAdultForm, type AdultFormValue,
} from './previousChild';

function fakeStorage() {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
}

describe('the previous child (T22)', () => {
  let st: ReturnType<typeof fakeStorage>;
  beforeEach(() => { st = fakeStorage(); resetPreviousChildForTests(st); });

  it('is null until a session is saved', () => {
    expect(getPreviousChild(1_000)).toBeNull();
  });

  it('is shown while recent, forgotten past PREVIOUS_MAX_AGE_MS', () => {
    const ended = Date.now();
    savePreviousChild({ id: 's1', ended_at: new Date(ended).toISOString(), grade: 2, character: 'mina', current_step: 'goodbye' });
    expect(getPreviousChild(ended + 1000)?.id).toBe('s1');
    expect(getPreviousChild(ended + PREVIOUS_MAX_AGE_MS - 1)?.id).toBe('s1');
    expect(getPreviousChild(ended + PREVIOUS_MAX_AGE_MS + 1)).toBeNull();
  });

  it('never shows a future-dated or malformed record', () => {
    savePreviousChild({ id: 's1', ended_at: new Date(Date.now() + 60_000).toISOString(), grade: 1, current_step: null });
    expect(getPreviousChild()).toBeNull();
    st.setItem('camino.piloto.previous.v1', '{not json');
    expect(getPreviousChild()).toBeNull();
    st.setItem('camino.piloto.previous.v1', JSON.stringify({ id: 's1' })); // missing ended_at/grade
    expect(getPreviousChild()).toBeNull();
  });

  it('a new session ending replaces the earlier record (one slot, the device\'s last one)', () => {
    const t0 = Date.now();
    savePreviousChild({ id: 's1', ended_at: new Date(t0).toISOString(), grade: 1, current_step: 'goodbye' });
    savePreviousChild({ id: 's2', ended_at: new Date(t0 + 1000).toISOString(), grade: 3, character: 'ovillo', current_step: 'class_end' });
    const got = getPreviousChild(t0 + 2000);
    expect(got?.id).toBe('s2');
    expect(got?.character).toBe('ovillo');
  });

  it('submitPreviousAdultForm saves locally (prefill) regardless of the post, and reports whether it was sent', async () => {
    savePreviousChild({ id: 's1', ended_at: new Date().toISOString(), grade: 2, current_step: 'goodbye' });
    const form: AdultFormValue = { engagement: 'high', help_needed: 'none', comment: 'jugó solo' };
    const post = vi.fn().mockResolvedValue(true);
    const ok = await submitPreviousAdultForm('s1', form, post);
    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledWith('s1', form);
    expect(getPreviousChild()?.adult_form).toEqual(form);
  });

  it('a failed post is kept and retried once by retryPendingSubmit; a successful one is not retried again', async () => {
    savePreviousChild({ id: 's1', ended_at: new Date().toISOString(), grade: 2, current_step: 'goodbye' });
    const form: AdultFormValue = { engagement: 'mid', help_needed: 'some' };
    const failing = vi.fn().mockResolvedValue(false);
    expect(await submitPreviousAdultForm('s1', form, failing)).toBe(false);

    const succeeding = vi.fn().mockResolvedValue(true);
    await retryPendingSubmit(succeeding);
    expect(succeeding).toHaveBeenCalledWith('s1', form);

    const shouldNotRun = vi.fn().mockResolvedValue(true);
    await retryPendingSubmit(shouldNotRun);
    expect(shouldNotRun).not.toHaveBeenCalled();
  });

  it('a throwing post counts as failed, never throws out of submitPreviousAdultForm', async () => {
    savePreviousChild({ id: 's1', ended_at: new Date().toISOString(), grade: 1, current_step: 'goodbye' });
    const throwing = vi.fn().mockRejectedValue(new Error('network down'));
    const ok = await submitPreviousAdultForm('s1', { engagement: null, help_needed: null }, throwing);
    expect(ok).toBe(false);
  });

  it('rememberPreviousAdultForm only updates the cached record when the id still matches', () => {
    savePreviousChild({ id: 's1', ended_at: new Date().toISOString(), grade: 1, current_step: 'goodbye' });
    rememberPreviousAdultForm('s2', { engagement: 'low', help_needed: 'a_lot' });
    expect(getPreviousChild()?.adult_form).toBeUndefined();
    rememberPreviousAdultForm('s1', { engagement: 'low', help_needed: 'a_lot' });
    expect(getPreviousChild()?.adult_form).toEqual({ engagement: 'low', help_needed: 'a_lot' });
  });
});
