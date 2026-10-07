// T19 (the silent classroom round): `?grado=1..5` (also `grade=`) in the
// bookmark link preselects the grade. The setup's cards are skipped and
// the session starts right away as if that card were tapped (steps.tsx's
// `Setup` calls the very same `go()` a tap would). An invalid or missing
// value falls back to the cards.
//
// The adult's own part of the setup (the on-screen text choice, the
// hidden demo toggle) stays reachable all the same, with no new UI:
// on-screen text has its own 💬 toggle in every step's bar regardless of
// how the session started (Captions.tsx), and the plain link (without
// `?grado`) always opens the full setup — the only way into the demo
// toggle, which has no other path in. Of the two options the brief
// offers (the corner menu, or a `?grado`-absent link), the link is the
// least invasive: it needs no new UI, since AdultControls (the corner
// menu) only mounts once a session exists, while the setup itself does
// not.

const GRADE_PARAM_RE = /[?&]grad[oe]=(\d+)/i;

/** A valid grade (1–5) from `?grado=` or `?grade=`; null otherwise. */
export function gradeFromUrl(search: string): number | null {
  const m = GRADE_PARAM_RE.exec(search);
  if (!m) return null;
  const g = Number(m[1]);
  return Number.isInteger(g) && g >= 1 && g <= 5 ? g : null;
}
