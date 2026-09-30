// The end of a session: the survey, the goodbye and the adult form.

import { usePlaytest } from './context';
import type { StepViewProps } from './steps';

export function Survey() {
  const { next } = usePlaytest();
  return <main className="pp-page"><button type="button" className="btn cut" onClick={next}>encuesta</button></main>;
}

export function Goodbye() {
  const { next } = usePlaytest();
  return <main className="pp-page"><button type="button" className="btn cut" onClick={next}>chau</button></main>;
}

export function AdultForm({ newSession }: StepViewProps) {
  return <main className="pp-page"><button type="button" className="btn cut" onClick={newSession}>Nueva sesión</button></main>;
}
