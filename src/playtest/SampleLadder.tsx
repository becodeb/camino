// Stand-in for the placement ladder (T4).

import { usePlaytest } from './context';

export function SampleLadder() {
  const { skip } = usePlaytest();
  return <main className="pp-page"><button type="button" className="btn cut" onClick={skip}>escalera</button></main>;
}
