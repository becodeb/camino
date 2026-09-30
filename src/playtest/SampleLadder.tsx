// Stand-in for the placement ladder until T4 builds it: two fixed pages
// played one after the other with the full instrumentation (PlaytestLevel),
// then the next step. T4 replaces this component in STEP_VIEWS.ladder with
// the real ladder (fixed item bank, grade entry points, step-up and floor
// rules, `ladder_step` events), using the same PlaytestLevel.

import { useState } from 'react';
import { usePlaytest } from './context';
import { SAMPLE_LEVELS, pilotLevel } from './levels';
import { PlaytestLevel } from './PlaytestLevel';

export function SampleLadder() {
  const { next } = usePlaytest();
  const [i, setI] = useState(0);
  const id = SAMPLE_LEVELS[i];
  const level = id ? pilotLevel(id) : null;
  if (!level) return null;
  return (
    <PlaytestLevel
      key={level.id}
      level={level}
      activity="ladder"
      extra={{ item: level.id, sample: true }}
      onEnd={() => { if (i + 1 < SAMPLE_LEVELS.length) setI(i + 1); else next(); }}
    />
  );
}
