// Dev-only entry for the Copa v2 garage (C09): `?debug#/copa2-dev?track=c3-a`
// mounts one track for screenshots and checks. Parameters (after the `?` in the
// hash): track (default c1-a), rival (bronze|silver|gold), ghost=1 (the ghost
// hand), preset (empty|gold|silver|bronze|deer: the program to start from),
// ref (bronze|silver|gold: that reference program faded on the side, as "tu programa anterior"), mode=deer,
// seed (the first run's seed; the next ones add 1), speed (the race clock, e.g. 0.3 to catch a moment). `window.__copa2` keeps
// the data the garage logged and the results it handed back.

import { useEffect, useMemo, useState } from 'react';
import { Garage, type GarageResultPayload } from './Garage';
import { ALL_TRACKS, TIERS, trackById, type Tier } from './tracks';
import type { Program } from './program';

interface Dev { logs: { type: string; payload: Record<string, unknown> }[]; results: GarageResultPayload[] }

export function GarageDev() {
  const params = useMemo(() => new URLSearchParams(location.hash.split('?')[1] ?? ''), []);
  const track = trackById(params.get('track') ?? 'c1-a') ?? ALL_TRACKS[0];
  const rivalParam = params.get('rival');
  const rival: Tier = TIERS.includes(rivalParam as Tier) ? (rivalParam as Tier) : 'silver';
  const preset = params.get('preset') ?? 'empty';
  const seed = Number(params.get('seed') ?? 7);
  const speed = params.get('speed') ? Number(params.get('speed')) : undefined;
  const initial: Program | undefined = preset === 'gold' || preset === 'silver' || preset === 'bronze' ? track.refs[preset] : preset === 'deer' ? track.deer.program : undefined;
  const refParam = params.get('ref');
  const reference: Program | undefined = refParam === 'gold' || refParam === 'silver' || refParam === 'bronze' ? track.refs[refParam] : undefined;
  const [done, setDone] = useState<GarageResultPayload | null>(null);
  const dev = useMemo<Dev>(() => ({ logs: [], results: [] }), []);
  useEffect(() => {
    (window as unknown as { __copa2: unknown }).__copa2 = dev;
    return () => { delete (window as unknown as { __copa2?: unknown }).__copa2; };
  }, [dev]);
  if (done) {
    return (
      <main style={{ padding: 40, font: '24px var(--body)' }}>
        <p data-testid="dev-done">Listo: {done.won ? 'ganó' : 'perdió'}, puesto {done.place} en {done.trackId}.</p>
        <button type="button" className="cut" style={{ padding: '12px 24px', font: 'inherit' }} onClick={() => setDone(null)}>Otra vez</button>
      </main>
    );
  }
  return (
    <Garage
      key={`${track.id}-${rival}-${preset}`} track={track} rivalTier={rival} initialProgram={initial} ghostHint={params.get('ghost') === '1'}
      reference={reference} mode={params.get('mode') === 'deer' ? 'deer' : 'race'}
      seedFor={(n) => seed + n - 1} raceSpeed={speed}
      logger={(type, payload) => { dev.logs.push({ type, payload }); }}
      onResult={(r) => { dev.results.push(r); setDone(r); }}
    />
  );
}
