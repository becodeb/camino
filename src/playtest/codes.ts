// The anonymous session code the adult writes on their paper ("Zorro 27"):
// a kid-friendly animal and a number from 10 to 99. The list leaves out
// animals used as insults (burro, chancho, mono, vaca, rata), scary ones
// (lobo, víbora) and pairs that sound alike when said across a classroom
// (gato/pato, loro/lobo), so the adult and the child can say it aloud.

export const ANIMALS = [
  'Zorro', 'Gato', 'Oso', 'Búho', 'Loro', 'Puma', 'León', 'Ciervo', 'Conejo', 'Delfín',
  'Ballena', 'Pingüino', 'Tortuga', 'Jirafa', 'Cebra', 'Koala', 'Panda', 'Nutria', 'Carpincho',
  'Tucán', 'Hornero', 'Castor', 'Foca', 'Erizo', 'Ardilla', 'Rana', 'Abeja', 'Pulpo', 'Caracol', 'Colibrí',
] as const;

export const CODE_RE = /^\p{Lu}\p{Ll}+ [1-9]\d$/u;

/** A code from `random` (in [0, 1)), avoiding the ones in `recent` (codes this device gave out lately) when it can. */
export function makeCode(random: () => number, recent: readonly string[] = []): string {
  const taken = new Set(recent);
  let code = '';
  for (let i = 0; i < 40; i++) {
    const animal = ANIMALS[Math.min(ANIMALS.length - 1, Math.floor(random() * ANIMALS.length))];
    const n = 10 + Math.min(89, Math.floor(random() * 90));
    code = `${animal} ${n}`;
    if (!taken.has(code)) return code;
  }
  return code;
}
