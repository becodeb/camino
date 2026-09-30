// The pages were written for Brote: their spoken lines and titles say
// "Brote" even when the child picked Mina, Pliegue or Ovillo. In the
// playtest every line said (ui/speech.ts's filter) and every title shown
// goes through `withName`, which puts the chosen character's name in, and
// fixes the few words that agree with it: Mina is "la" (a pencil's lead),
// the other three are "el". Only the playtest does this; the demo and 1ro's
// year keep their lines as written.

import { CHARACTER_NAME, isCharacterId, type CharacterId } from '../curriculum/motivation';

/** Mina is feminine: the object pronoun that stands for the character changes ("¿Lo ayudás…?" → "¿La ayudás…?"). */
const FEMININE: ReadonlySet<CharacterId> = new Set(['mina']);

/**
 * Lines whose words agree with the character (grep the 1ro and demo texts
 * for "Brote" when adding lines): the pronoun right before a verb about
 * helping or looking at it.
 */
const AGREEMENT: readonly [RegExp, string][] = [
  [/¿Lo ayudás/g, '¿La ayudás'],
  [/\blo ayudás/g, 'la ayudás'],
];

/** `text` with the chosen character's name instead of Brote's (and the words that agree with it). */
export function withName(text: string, character: string | null | undefined): string {
  if (!isCharacterId(character) || character === 'brote' || !text.includes('Brote')) return text;
  let out = text.replace(/\bBrote\b/g, CHARACTER_NAME[character]);
  if (FEMININE.has(character)) for (const [re, to] of AGREEMENT) out = out.replace(re, to);
  return out;
}
