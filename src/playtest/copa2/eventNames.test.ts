import { describe, expect, it } from 'vitest';

// The server rejects the WHOLE batch that carries an event whose type does not match this
// (server/lib/validate.ts EVENT_TYPE_RE): a digit in a name ("copa2_run") silently stopped every row.
const EVENT_TYPE_RE = /^[a-z_]{1,40}$/;

const RAW_GARAGE = import.meta.glob(['./Garage.tsx', './Spy.tsx'], { query: '?raw', import: 'default', eager: true });
const RAW_FLOW = import.meta.glob('../CopaStep.tsx', { query: '?raw', import: 'default', eager: true });

describe('the Copa v2 event names are valid for the server', () => {
  it('every type the garage and the flow log matches the server\'s pattern', () => {
    const sources = { ...RAW_GARAGE, ...RAW_FLOW } as Record<string, string>;
    expect(Object.keys(sources).length).toBe(3);
    const types = new Set<string>();
    for (const src of Object.values(sources)) {
      for (const m of src.matchAll(/\b(?:log|logger\??\.?|logger)\(\s*'([^']+)'/g)) types.add(m[1]);
      for (const m of src.matchAll(/'(garage_[a-z_0-9]+)'/g)) types.add(m[1]);
    }
    expect(types.size).toBeGreaterThanOrEqual(10);
    for (const t of types) expect(EVENT_TYPE_RE.test(t), t).toBe(true);
  });
});
