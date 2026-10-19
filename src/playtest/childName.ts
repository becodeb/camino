// T38: the child's first name, typed once on its own screen ("¿Cómo te
// llamás?", NamePrompt.tsx) between the setup (the grade known) and the
// character choice. On by default for 4to and 5to (the teacher asked for
// each child's name so the level can be read per child); `?nombre=si` turns
// it on for any grade, `?nombre=no` turns it off (even 4to/5to). Pure
// normalisation and the on/off rule live here, both unit-tested;
// server/lib/validate.ts applies the same character set and length cap
// server-side too (never trusting the client alone).

export const MAX_CHILD_NAME_CHARS = 24;

// Letters (including accented ones and Ñ/ñ), spaces, apostrophes and
// hyphens only — anything else (digits, punctuation, emoji) is dropped as
// the child types rather than refused outright.
const DISALLOWED_CHAR_RE = /[^A-Za-zÀ-ÖØ-öø-ÿ' -]/g;

/**
 * Strips characters outside the allowed set, collapses inner whitespace,
 * trims, and caps the length. '' when nothing usable is left (the "Listo"
 * button stays disabled then).
 */
export function normalizeChildName(raw: string): string {
  return raw.replace(DISALLOWED_CHAR_RE, '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHILD_NAME_CHARS);
}

const NAME_PARAM_RE = /[?&]nombre=(si|no)\b/i;

/** `'si'` | `'no'` | null (no override) from the URL's `?nombre=`, mirroring gradeParam.ts's `?grado=`. */
export function nameParamFromUrl(search: string): 'si' | 'no' | null {
  const m = NAME_PARAM_RE.exec(search);
  return m ? (m[1].toLowerCase() as 'si' | 'no') : null;
}

/** Whether the name screen is on for this session: the link's `?nombre=` wins over the grade; otherwise on by default for 4to and 5to. */
export function nameScreenOn(grade: number, param: 'si' | 'no' | null): boolean {
  if (param === 'si') return true;
  if (param === 'no') return false;
  return grade === 4 || grade === 5;
}
