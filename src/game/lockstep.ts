// Several boards playing one program together (2do page 2): each board waits
// at every step until the others still running reach it, so the three Brotes
// move at the same time and the notebook can ring one block for all of them.
// A board that is done (won, bumped, or out of blocks) leaves, and the others
// no longer wait for it.

export class Lockstep {
  private live: Set<number>;
  private waiting = new Map<number, () => void>();

  constructor(worlds: number) {
    this.live = new Set(Array.from({ length: worlds }, (_, i) => i));
  }

  /** World `w` is ready for its next step: resolves when every live world is. */
  arrive(w: number): Promise<void> {
    if (!this.live.has(w)) return Promise.resolve();
    const p = new Promise<void>((resolve) => this.waiting.set(w, resolve));
    this.release();
    return p;
  }

  /** World `w` has finished its steps. */
  leave(w: number): void {
    this.live.delete(w);
    this.waiting.get(w)?.();
    this.waiting.delete(w);
    this.release();
  }

  private release() {
    if (!this.waiting.size || [...this.live].some((w) => !this.waiting.has(w))) return;
    const go = [...this.waiting.values()];
    this.waiting.clear();
    go.forEach((f) => f());
  }
}
